// Track C 심사 자동 판정: 참가자의 evidence.json 을 테스트넷에서 다시 확인해 요건별로 판정한다. [Live Testnet] 조회
//
//   pnpm c:judge <evidence.json> [--track 1|2|3]
//
// 항목 형식은 track-c-activate/tracks/1-private-settlement.md 23절에 있다.
// 테스트넷 항목마다 확인하는 것
//   - tx 영수증이 있고 chain ID 가 450815 인지
//   - tx 의 받는 주소가 항목의 target 과 같은지
//   - 예상이 "거부"면 영수증이 reverted 인지, 직전 블록 상태로 같은 호출을 다시 시뮬레이션해 거부 사유가 actual 과 맞는지
//   - 예상이 "통과"나 "성공"이면 영수증이 success 인지
//   - target 에 PCL 정책이 묶여 있고, 정책의 선택자가 비었거나 호출한 함수와 같은지
//   - OKRW value
// 로컬 항목([Local])은 건너뛰고 "재현 확인"으로 표시한다. 심사위원이 README 명령으로 재현한다.
// 결과는 콘솔 표와 같은 폴더의 <파일 이름>.judge.json 이다. 트랜잭션은 보내지 않는다.

import fs from "node:fs";
import { getAddress, type Address, type Hex } from "viem";
import { iPclAbi } from "@maroo-chain/contracts/abi/precompiles/pcl/IPcl";
import { iPrivacyAbi } from "@maroo-chain/contracts/abi/precompiles/privacy/IPrivacy";
import { PCL, RPC, decodeRaw, publicClient as pub } from "../../shared/lib/maroo.ts";
import { describePolicy, type PolicySet } from "../../shared/lib/pcl-policy.ts";

type Item = {
  requirement: string; label: string; chainId?: number; target?: string; call?: string; input?: string;
  txHash?: Hex; expected?: string; actual?: string; rpcLog?: { method: string; params: unknown[]; error?: { message: string; data?: Hex } };
};
type Verdict = { requirement: string; label: string; ok: boolean | "재현 확인"; checks: string[] };

const file = process.argv.find((a) => a.endsWith(".json"));
const track = Number(process.argv[process.argv.indexOf("--track") + 1] ?? 1) || 1;
if (!file) {
  console.log("사용법: pnpm c:judge <evidence.json> [--track 1|2|3]");
  process.exit(2);
}
const raw = JSON.parse(fs.readFileSync(file, "utf8"));
const items: Item[] = Array.isArray(raw) ? raw : raw.items;
const errorsAbi = [...iPclAbi, ...iPrivacyAbi].filter((x) => x.type === "error");

// 트랙마다 요건을 채운 것으로 보는 조건. 항목 하나가 여러 요건을 증명할 수 있다.
const RULES: Record<number, { id: string; need: string; test: (vs: (Verdict & { item: Item; value: bigint; reason?: string; policies: string })[]) => boolean }[]> = {
  1: [
    { id: "R1", need: "차폐 흐름(예치, 지급, 스캔, 인출)", test: (vs) => vs.some((v) => v.requirement === "R1") },
    { id: "R2", need: "보낸 쪽이 아닌 쪽의 disclosure 해독", test: (vs) => vs.some((v) => v.requirement === "R2") },
    { id: "R3", need: "같은 대상에서 PCL 거부 하나와 통과 하나, 정책 바인딩", test: (vs) => {
      const r3 = vs.filter((v) => v.requirement === "R3" && v.ok === true);
      return r3.some((v) => /거부/.test(v.item.expected ?? "")) && r3.some((v) => /통과|성공/.test(v.item.expected ?? ""));
    } },
    { id: "R4", need: "OKRW 이동", test: (vs) => vs.some((v) => v.requirement === "R4" && v.ok === true && v.value > 0n) },
    { id: "R5", need: "Privacy 최초 실패 계층 기록", test: (vs) => vs.some((v) => v.requirement === "R5" && v.ok !== false) },
  ],
  2: [
    { id: "R1", need: "에이전트 등록", test: (vs) => vs.some((v) => v.requirement === "R1" && v.ok === true) },
    { id: "R2", need: "한도 메타데이터와 에이전트 한도 정책", test: (vs) => vs.some((v) => v.requirement === "R2" && v.ok === true) },
    { id: "R3", need: "한도 안의 OKRW 결제", test: (vs) => vs.some((v) => v.requirement === "R3" && v.ok === true && v.value > 0n) },
    { id: "R4", need: "ExceededAgentTransferLimit 거부", test: (vs) => vs.some((v) => v.requirement === "R4" && v.ok === true && /ExceededAgentTransferLimit/.test(v.reason ?? v.item.actual ?? "")) },
  ],
  3: [
    { id: "R1", need: "스키마 등록, 증명 발급, 색인", test: (vs) => vs.filter((v) => v.requirement === "R1" && v.ok === true).length >= 1 },
    { id: "R2", need: "결제 컨트랙트의 정책 바인딩", test: (vs) => vs.some((v) => v.policies !== "" && v.policies !== "정책 없음") },
    { id: "R3", need: "자격 있는 사용자의 OKRW 결제", test: (vs) => vs.some((v) => v.requirement === "R3" && v.ok === true && v.value > 0n) },
    { id: "R4", need: "서로 다른 거부 사유 둘 이상", test: (vs) => new Set(vs.filter((v) => v.requirement === "R4" && v.ok === true).map((v) => (v.reason ?? v.item.actual ?? "").replace(/\(.*$/, ""))).size >= 2 },
  ],
};

// 직전 블록 상태로 같은 호출을 다시 시뮬레이션해 거부 사유를 읽는다.
async function replayReason(tx: { from: Address; to: Address | null; input: Hex; value: bigint }, block: bigint): Promise<string | undefined> {
  if (!tx.to) return undefined;
  const res = await fetch(RPC, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ from: tx.from, to: tx.to, data: tx.input, value: `0x${tx.value.toString(16)}` }, `0x${(block - 1n).toString(16)}`] }),
  });
  const body = (await res.json()) as { error?: { message: string; data?: Hex } };
  if (!body.error) return "다시 시뮬레이션하면 통과(전역 정책 거부이거나 상태가 달랐음)";
  return body.error.data && body.error.data !== "0x" ? decodeRaw(body.error.data, errorsAbi) : body.error.message;
}

const chainId = await pub.getChainId();
const verdicts: (Verdict & { item: Item; value: bigint; reason?: string; policies: string })[] = [];
for (const item of items) {
  const checks: string[] = [];
  let ok: boolean | "재현 확인" = true;
  let value = 0n;
  let reason: string | undefined;
  let policies = "";
  const fail = (msg: string) => { ok = false; checks.push(`✗ ${msg}`); };
  const pass = (msg: string) => checks.push(`✓ ${msg}`);

  if (/Local/.test(item.label)) {
    verdicts.push({ requirement: item.requirement, label: item.label, ok: "재현 확인", checks: ["로컬 항목. 심사위원이 README 명령으로 재현"], item, value, policies });
    continue;
  }
  if (item.chainId !== undefined && item.chainId !== chainId) fail(`chain ID ${item.chainId}, RPC ${chainId}`);

  if (item.txHash) {
    const receipt = await pub.getTransactionReceipt({ hash: item.txHash }).catch(() => undefined);
    if (!receipt) {
      fail("영수증 없음");
    } else {
      const tx = await pub.getTransaction({ hash: item.txHash });
      value = tx.value;
      pass(`영수증 ${receipt.status}, 블록 ${receipt.blockNumber}, value ${tx.value}`);
      if (item.target && tx.to && getAddress(tx.to) !== getAddress(item.target)) fail(`받는 주소 ${tx.to} 가 target 과 다름`);
      if (/거부/.test(item.expected ?? "")) {
        if (receipt.status !== "reverted") fail("거부를 예상했는데 성공한 tx");
        reason = await replayReason(tx, receipt.blockNumber);
        if (item.actual && reason && !reason.startsWith(item.actual.replace(/\(.*$/, ""))) fail(`재시뮬레이션 사유 ${reason} 가 actual(${item.actual})과 다름`);
        else pass(`거부 사유 ${reason}`);
      } else if (/통과|성공/.test(item.expected ?? "")) {
        if (receipt.status !== "success") fail("통과를 예상했는데 되돌려진 tx");
      }
      if (item.target) {
        const cfg = await pub.readContract({ address: PCL, abi: iPclAbi, functionName: "contractPolicies", args: [getAddress(item.target)] })
          .catch(() => undefined) as { policies: readonly PolicySet[] } | undefined;
        const sets = cfg?.policies ?? [];
        policies = sets.length ? sets.map((p) => `${describePolicy(p)}@${p.selector === "0x" ? "전체" : p.selector}`).join(", ") : "정책 없음";
        const selector = tx.input.slice(0, 10);
        const hit = sets.some((p) => p.selector === "0x" || p.selector.toLowerCase() === selector.toLowerCase());
        if (/거부/.test(item.expected ?? "") && /^(Eas|Exceeded|AnyOf|InDenylist|Volume)/.test(reason ?? "") && !hit) fail(`정책 거부라는데 ${selector} 에 걸린 정책이 없음`);
        else if (sets.length) pass(`정책 ${policies}`);
      }
    }
  } else if (item.rpcLog) {
    const e = item.rpcLog.error;
    reason = e?.data && e.data !== "0x" ? decodeRaw(e.data, errorsAbi) : e?.message;
    if (!reason) fail("rpcLog 에 오류 응답이 없음");
    else pass(`${item.rpcLog.method} 기록의 사유 ${reason}`);
  } else {
    fail("txHash 와 rpcLog 가 모두 없음");
  }
  verdicts.push({ requirement: item.requirement, label: item.label, ok, checks, item, value, reason, policies });
}

console.log(`판정 대상: ${file} (트랙 ${track}, 항목 ${items.length}개, RPC chain ID ${chainId})\n`);
for (const v of verdicts) {
  console.log(`${v.ok === true ? "✓" : v.ok === false ? "✗" : "…"} ${v.requirement} ${v.label} ${v.item.call ?? ""} ${v.item.expected ?? ""}`);
  for (const c of v.checks) console.log(`    ${c}`);
}
console.log("\n요건별 판정");
const summary = RULES[track].map((r) => ({ id: r.id, need: r.need, ok: r.test(verdicts) }));
for (const s of summary) console.log(`${s.ok ? "✓" : "✗"} ${s.id} ${s.need}`);
const out = file.replace(/\.json$/, ".judge.json");
fs.writeFileSync(out, JSON.stringify({ checkedAt: new Date().toISOString(), track, chainId, summary, items: verdicts.map(({ item, ...v }) => ({ ...v, value: v.value.toString(), txHash: item.txHash })) }, null, 2) + "\n");
console.log(`\n기록: ${out}`);
process.exit(summary.every((s) => s.ok) ? 0 : 1);
