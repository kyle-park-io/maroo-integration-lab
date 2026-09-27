// Track C 심사 자동 판정: 참가자의 evidence.json 을 테스트넷에서 다시 확인해 요건별로 판정한다. [Live Testnet] 조회
//
//   pnpm c:judge <evidence.json> [--track 1|2|3]
//
// 항목 형식은 track-c-activate/tracks/1-private-settlement.md 23절에 있다.
// 테스트넷 항목마다 확인하는 것
//   - tx 영수증이 있고 chain ID 가 450815 인지
//   - tx 항목에 target 이 있고, tx 의 받는 주소가 그 target 과 같은지(target 이 없으면 실패)
//   - 예상이 "거부"면 영수증이 reverted 인지, 직전 블록 상태로 같은 호출을 다시 시뮬레이션해 거부 사유가 actual 과 맞는지
//   - 예상이 "통과"나 "성공"이면 영수증이 success 인지. 예상에 셋 중 어느 말도 없으면 실패
//   - target 에 PCL 정책이 묶여 있고, 정책의 선택자가 비었거나 호출한 함수와 같은지
//   - OKRW value
//   - setMetadata("TransferLimit") 이면 값이 32바이트 uint256 인지(Maroo Docs 의 숫자 문자열은 정책이 거부한다)
// 로컬 항목([Local])은 건너뛰고 "재현 확인"으로 표시한다. 심사위원이 README 명령으로 재현한다.
// 결과는 콘솔 표와 같은 폴더의 <파일 이름>.judge.json 이다. 트랜잭션은 보내지 않는다.

import fs from "node:fs";
import { decodeFunctionData, getAddress, size, type Address, type Hex } from "viem";
import { identityRegistryAbi } from "@maroo-chain/viem";
import { iPclAbi } from "@maroo-chain/contracts/abi/precompiles/pcl/IPcl";
import { iPrivacyAbi } from "@maroo-chain/contracts/abi/precompiles/privacy/IPrivacy";
import { PCL, RPC, decodeRaw, publicClient as pub } from "../../shared/lib/maroo.ts";
import { describePolicy, type PolicySet } from "../../shared/lib/pcl-policy.ts";
import { judge, type Checked, type Item, type Verdict } from "./rules.ts";

const file = process.argv.find((a) => a.endsWith(".json"));
const track = Number(process.argv[process.argv.indexOf("--track") + 1] ?? 1) || 1;
if (!file) {
  console.log("사용법: pnpm c:judge <evidence.json> [--track 1|2|3]");
  process.exit(2);
}
const raw = JSON.parse(fs.readFileSync(file, "utf8"));
const items: Item[] = Array.isArray(raw) ? raw : raw.items;
const errorsAbi = [...iPclAbi, ...iPrivacyAbi].filter((x) => x.type === "error");

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
const verdicts: Checked[] = [];
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
      if (!item.target) fail("target 이 없어 받는 주소와 정책 바인딩을 확인할 수 없음");
      else if (tx.to && getAddress(tx.to) !== getAddress(item.target)) fail(`받는 주소 ${tx.to} 가 target 과 다름`);
      if (/거부/.test(item.expected ?? "")) {
        if (receipt.status !== "reverted") fail("거부를 예상했는데 성공한 tx");
        reason = await replayReason(tx, receipt.blockNumber);
        if (item.actual && reason && !reason.startsWith(item.actual.replace(/\(.*$/, ""))) fail(`재시뮬레이션 사유 ${reason} 가 actual(${item.actual})과 다름`);
        else pass(`거부 사유 ${reason}`);
      } else if (/통과|성공/.test(item.expected ?? "")) {
        if (receipt.status !== "success") fail("통과를 예상했는데 되돌려진 tx");
      } else {
        fail(`expected(${item.expected ?? "없음"})에 '거부', '통과', '성공' 가운데 하나가 있어야 영수증 상태를 판정할 수 있음`);
      }
      if (tx.input.startsWith("0x") && tx.to && getAddress(tx.to) === getAddress("0x8004000000000000000000000000000000000001")) {
        const call = (() => { try { return decodeFunctionData({ abi: identityRegistryAbi, data: tx.input }); } catch { return undefined; } })();
        if (call?.functionName === "setMetadata" && call.args[1] === "TransferLimit") {
          const bytes = call.args[2] as Hex;
          if (size(bytes) === 32) pass(`TransferLimit ${BigInt(bytes)} (32바이트 uint256)`);
          else fail(`TransferLimit 값이 ${size(bytes)}바이트. 정책은 32바이트 uint256 만 받고 그 밖에는 AgentTransferLimitMetadataInvalid 로 모든 결제를 거부`);
        }
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
const summary = judge(track, verdicts);
for (const s of summary) console.log(`${s.ok ? "✓" : "✗"} ${s.id} ${s.need}`);
const out = file.replace(/\.json$/, ".judge.json");
fs.writeFileSync(out, JSON.stringify({ checkedAt: new Date().toISOString(), track, chainId, summary, items: verdicts.map(({ item, ...v }) => ({ ...v, value: v.value.toString(), txHash: item.txHash })) }, null, 2) + "\n");
console.log(`\n기록: ${out}`);
process.exit(summary.every((s) => s.ok) ? 0 : 1);
