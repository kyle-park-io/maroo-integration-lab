// Track A 레시피: 같은 OKRW 전송을 eth_call 과 eth_estimateGas 로 각각 불러, 테스트넷 전역 PCL 정책이
// 어느 쪽에서 평가되는지 확인한다. [Live Testnet]
//
//   pnpm a:probe-global [보내는 주소] [받는 주소] [금액 OKRW]
//
// 트랜잭션은 보내지 않는다. 보내는 주소의 개인키도 필요 없다.
// 기본값은 공개 faucet 계정에서 BUYER 로 5,000 OKRW 를 보내는 경우다. faucet 계정은 하루에 많은 양을
// 보내므로 전역 기간 한도에 걸린 상태를 관찰하기 좋다. 결과는 그 순간의 체인 상태에 따라 달라진다.

import path from "node:path";
import { getAddress, parseEther, toHex, type Abi, type Hex } from "viem";
import { iPclAbi } from "@maroo-chain/contracts/abi/precompiles/pcl/IPcl";
import { ROOT } from "../../shared/lib/paths.ts";
import { RPC, addressOf, decodeRaw, writeEvidence } from "../../shared/lib/maroo.ts";

const FAUCET = "0x5336F019Bd8E9E0064be7330833dc883a8a6c94d";
const from = getAddress(process.argv[2] ?? FAUCET);
const to = getAddress(process.argv[3] ?? addressOf("BUYER"));
const amount = process.argv[4] ?? "5000";
const errorsAbi = iPclAbi.filter((x) => x.type === "error") as Abi;

async function rpc(method: string, params: unknown[]) {
  const res = await fetch(RPC, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return (await res.json()) as { result?: Hex; error?: { message: string; data?: Hex } };
}

// AnyOfRejected 는 자식 정책의 거부 사유를 bytes 로 담는다. 한 단계 더 풀어 보여 준다.
function explain(data: Hex): { outcome: string; children?: string[] } {
  const outcome = decodeRaw(data, errorsAbi);
  const inner = [...outcome.matchAll(/0x[0-9a-fA-F]{8,}/g)].map((m) => decodeRaw(m[0] as Hex, errorsAbi));
  return inner.length ? { outcome, children: inner } : { outcome };
}

const tx = { from, to, value: toHex(parseEther(amount)) };
const results: Record<string, unknown>[] = [];
for (const method of ["eth_call", "eth_estimateGas"]) {
  const r = await rpc(method, method === "eth_call" ? [tx, "latest"] : [tx]);
  const row = r.error
    ? { method, rejected: true, rpcMessage: r.error.message, ...(r.error.data && r.error.data !== "0x" ? explain(r.error.data) : {}) }
    : { method, rejected: false, result: r.result };
  results.push(row);
  console.log(`${method.padEnd(16)} ${row.rejected ? `거부: ${(row as { outcome?: string }).outcome ?? r.error?.message}` : "통과"}`);
  for (const c of (row as { children?: string[] }).children ?? []) console.log(`${"".padEnd(16)}   ${c}`);
}

const file = writeEvidence(path.join(ROOT, "track-a-explain/evidence/live"), "probe-global-policy", {
  rpc: RPC, from, to, amountOkrw: amount, checkedAt: new Date().toISOString(), label: "조회만 함(eth_call, eth_estimateGas). tx 없음", results,
});
console.log(`기록: ${path.relative(ROOT, file)}`);
