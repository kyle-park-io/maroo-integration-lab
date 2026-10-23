// Track A 레시피: 같은 OKRW 전송을 eth_call 과 eth_estimateGas 로 각각 불러, 테스트넷 전역 PCL 정책이
// 어느 쪽에서 평가되는지 확인한다. [Live Testnet]
//
//   pnpm a:probe-global [보내는 주소] [받는 주소] [금액 OKRW]
//   pnpm a:probe-global --over-limit [금액 OKRW]
//
// 트랜잭션은 보내지 않는다. 보내는 주소의 개인키도 필요 없다.
// 기본값은 공개 faucet 계정에서 BUYER 로 5,000 OKRW 를 보내는 경우다. faucet 계정은 하루에 많은 양을
// 보내므로 전역 기간 한도에 걸린 상태를 관찰하기 좋다. 결과는 그 순간의 체인 상태에 따라 달라진다.
//
// --over-limit 는 KYC 증명이 없는 BUYER 가 전역 정책의 건당 한도(200만 OKRW)를 넘는 금액을
// PCL 프록시를 거치지 않는 이체(SUPPLIER_A 로)와 PCL 프록시 호출(가장 최근 a:kyb-gate 금고의 fund)로
// 각각 보내는 경우를 두 방법으로 견준다. 잔액은 상태 덮어쓰기(eth_call 과 eth_estimateGas 의 세 번째 인자)로
// 부풀리므로 실제 잔액이 없어도 된다. 체인 상태와 무관하게 같은 결과가 나와 재현용으로 쓴다.

import "../../shared/lib/install-recipe-errors.ts";
import fs from "node:fs";
import path from "node:path";
import { encodeFunctionData, getAddress, parseEther, toHex, type Abi, type Hex } from "viem";
import { iPclAbi } from "@maroo-chain/contracts/abi/precompiles/pcl/IPcl";
import { ROOT } from "../../shared/lib/paths.ts";
import { RPC, addressOf, decodeRaw, writeEvidence } from "../../shared/lib/maroo.ts";
import { conclude, rowFromReply, type ProbeRow } from "./global-policy-compare.ts";

const FAUCET = "0x5336F019Bd8E9E0064be7330833dc883a8a6c94d";
const LIVE = path.join(ROOT, "track-a-explain/evidence/live");
const errorsAbi = iPclAbi.filter((x) => x.type === "error") as Abi;

async function rpc(method: string, params: unknown[]): Promise<{ result?: Hex; error?: { message: string; data?: Hex } }> {
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

function printRow(label: string, method: string, r: { result?: Hex; error?: { message: string; data?: Hex } }) {
  const decoded = r.error?.data && r.error.data !== "0x" ? explain(r.error.data) : undefined;
  const shown = decoded?.children ? `AnyOfRejected, 자식 사유 ${decoded.children.length}개` : decoded?.outcome ?? r.error?.message;
  console.log(`${label}${method.padEnd(16)} ${r.error ? `거부: ${shown}` : "통과"}`);
  for (const c of decoded?.children ?? []) console.log(`${"".padEnd(label.length + 16)}   ${c}`);
  return r.error ? { method, rejected: true, rpcMessage: r.error.message, ...(decoded ?? {}) } : { method, rejected: false, result: r.result };
}

// 가장 최근 a:kyb-gate 기록의 금고(PCL 프록시) 주소
function latestVault(): `0x${string}` {
  const files = fs.readdirSync(LIVE).filter((f) => f.startsWith("pcl-kyb-gate-") && f.endsWith(".json")).sort();
  for (const f of files.reverse()) {
    const m = fs.readFileSync(path.join(LIVE, f), "utf8").match(/"vault"\s*:\s*"(0x[0-9a-fA-F]{40})"/);
    if (m) return getAddress(m[1]);
  }
  throw new Error("a:kyb-gate 기록에서 금고 주소를 찾지 못했습니다. pnpm a:kyb-gate 를 먼저 실행하십시오.");
}

if (process.argv[2] === "--over-limit") {
  const amount = process.argv[3] ?? "2000001";
  const from = getAddress(addressOf("BUYER"));
  const supplier = getAddress(addressOf("SUPPLIER_A"));
  const vault = latestVault();
  const fund = encodeFunctionData({ abi: [{ type: "function", name: "fund", inputs: [{ name: "supplier", type: "address" }], outputs: [], stateMutability: "payable" }], functionName: "fund", args: [supplier] });
  const value = toHex(parseEther(amount));
  const override = { [from]: { balance: toHex(parseEther(String(Number(amount) * 10))) } };
  const cases = [
    { target: "plain" as const, label: "PCL 프록시를 거치지 않는 이체 ", tx: { from, to: supplier, value } },
    { target: "proxy" as const, label: "PCL 프록시 호출(금고 fund)    ", tx: { from, to: vault, data: fund, value } },
  ];
  console.log(`KYC 증명이 없는 구매 기업 지갑이 ${amount} OKRW를 보내는 경우입니다. 잔액은 상태 덮어쓰기로 부풀렸습니다.`);
  const results: Record<string, unknown>[] = [];
  const rows: ProbeRow[] = [];
  for (const c of cases) {
    for (const method of ["eth_call", "eth_estimateGas"] as const) {
      const r = await rpc(method, method === "eth_call" ? [c.tx, "latest", override] : [c.tx, "latest", override]);
      const row = printRow(c.label, method, r);
      results.push({ target: c.target, to: c.tx.to, ...row });
      rows.push(rowFromReply(c.target, method, r));
    }
  }
  const verdict = conclude(rows);
  console.log("");
  for (const line of verdict) console.log(line);
  const file = writeEvidence(LIVE, "probe-global-compare", {
    rpc: RPC, from, supplier, vault, amountOkrw: amount, checkedAt: new Date().toISOString(),
    label: "조회만 함(eth_call, eth_estimateGas, 잔액 상태 덮어쓰기). tx 없음", results, verdict,
  });
  console.log(`기록: ${path.relative(ROOT, file)}`);
} else {
  const from = getAddress(process.argv[2] ?? FAUCET);
  const to = getAddress(process.argv[3] ?? addressOf("BUYER"));
  const amount = process.argv[4] ?? "5000";
  const tx = { from, to, value: toHex(parseEther(amount)) };
  const results: Record<string, unknown>[] = [];
  for (const method of ["eth_call", "eth_estimateGas"]) {
    const r = await rpc(method, method === "eth_call" ? [tx, "latest"] : [tx]);
    results.push(printRow("", method, r));
  }
  const file = writeEvidence(LIVE, "probe-global-policy", {
    rpc: RPC, from, to, amountOkrw: amount, checkedAt: new Date().toISOString(), label: "조회만 함(eth_call, eth_estimateGas). tx 없음", results,
  });
  console.log(`기록: ${path.relative(ROOT, file)}`);
}
