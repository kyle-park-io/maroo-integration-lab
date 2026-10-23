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

import "../../shared/lib/install-recipe-errors.ts";
import fs from "node:fs";
import path from "node:path";
import { decodeFunctionData, getAddress, size, type Address, type Hex } from "viem";
import { identityRegistryAbi } from "@maroo-chain/viem";
import { iPclAbi } from "@maroo-chain/contracts/abi/precompiles/pcl/IPcl";
import { PCL, publicClient as pub } from "../../shared/lib/maroo.ts";
import { FAMILY_LABEL, SCOPE_LABEL, classifyRevert } from "../../shared/lib/explain.ts";
import { explainTx, loadAbi } from "../../shared/lib/explain-chain.ts";
import { outPath } from "../../shared/lib/paths.ts";
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

// 거부 사유와 계열, 걸린 정책, 통과 기록은 거부 해석기(pnpm explain 과 같은 코드)로 읽는다.
const abi = loadAbi();

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
        const e = await explainTx(item.txHash, { abi });
        reason = e.decoded?.text ?? e.replayNote;
        if (item.actual && reason && !reason.startsWith(item.actual.replace(/\(.*$/, ""))) fail(`재시뮬레이션 사유 ${reason} 가 actual(${item.actual})과 다름`);
        else pass(`거부 사유 ${reason}`);
        if (e.decoded) pass(`계열 ${FAMILY_LABEL[e.decoded.family]}${e.decoded.selector ? `, 선택자 ${e.decoded.selector}` : ""}`);
        // PCL 정책 거부라면 컨트랙트 정책인지 확인한다. 대상이 PCL 프록시가 아니거나 전역 정책에서 난 거부는 이 제출물이 건 정책의 증거가 아니다.
        if (e.decoded?.family === "pcl-policy" && e.scope) {
          if (e.scope.scope === "global") fail(`정책 거부가 전역 정책에서 났습니다. ${e.scope.note}`);
          else pass(`걸린 정책 ${SCOPE_LABEL[e.scope.scope]}. ${e.scope.note}`);
        }
      } else if (/통과|성공/.test(item.expected ?? "")) {
        if (receipt.status !== "success") fail("통과를 예상했는데 되돌려진 tx");
        else {
          // PCL 프록시를 지난 통과 tx 는 영수증에 PCL 의 PolicyCheckPassed 가 남는다(IPcl.postCall).
          const e = await explainTx(item.txHash, { abi });
          if (e.target?.isProxy) {
            if (e.policyCheckPassed) pass("PolicyCheckPassed 있음. PCL 컨트랙트 정책을 통과한 tx");
            else fail("PCL 프록시를 부른 통과 tx인데 영수증에 PolicyCheckPassed가 없음");
          }
        }
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
    reason = e?.data && e.data !== "0x" ? classifyRevert({ data: e.data, extraAbi: abi }).text : e?.message;
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
// MAROO_LAB_OUT 이 있으면(pnpm review) 판정 결과를 그 아래에 써서 커밋된 예시 파일을 바꾸지 않는다
const out = outPath(file.replace(/\.json$/, ".judge.json"));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ checkedAt: new Date().toISOString(), track, chainId, summary, items: verdicts.map(({ item, ...v }) => ({ ...v, value: v.value.toString(), txHash: item.txHash })) }, null, 2) + "\n");
console.log(`\n기록: ${out}`);
process.exit(summary.every((s) => s.ok) ? 0 : 1);
