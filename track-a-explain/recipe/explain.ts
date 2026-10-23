// Track A 레시피: 실패한 tx 나 호출이 무엇에 막혔는지 풀어 보여 주는 거부 해석기. [Live Testnet] 조회만
//
//   pnpm explain <tx 해시>
//   pnpm explain --examples        이 레포가 겪은 실패 다섯 계열과 통과 tx 하나를 차례로 풀고 기록 하나에 남긴다
//   pnpm explain --from <주소|역할> --to <주소|역할> [--sig "fund(address)" --args 0x..] [--data 0x..] [--value OKRW]
//                [--method eth_estimateGas|eth_call] [--balance OKRW] [--abi 파일]... [--json] [--record]
//
// 역할은 BUYER, ISSUER, SUPPLIER_A 처럼 역할 지갑 파일의 이름을 쓴다. --balance 는 보내는 주소의 잔액을 상태 덮어쓰기로
// 그 값으로 두고 시뮬레이션한다(잔액이 없어도 한도 초과 같은 정책 거부를 확인할 때). tx 는 보내지 않는다.
// 판정 순서와 계열은 track-a-explain/integration-guide.md 6절에 있다. --record 는 결과를 evidence/live/explain-<시각>.json 에 남긴다.

import "../../shared/lib/install-recipe-errors.ts";
import fs from "node:fs";
import path from "node:path";
import { encodeFunctionData, getAddress, isAddress, parseAbiItem, parseEther, type AbiFunction, type Address, type Hex } from "viem";
import { ROOT } from "../../shared/lib/paths.ts";
import { addressOf, writeEvidence, type Role } from "../../shared/lib/maroo.ts";
import { formatExplanation } from "../../shared/lib/explain.ts";
import { explainCall, explainTx, loadAbi } from "../../shared/lib/explain-chain.ts";

const argv = process.argv.slice(2);
const opt = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const all = (name: string) => argv.flatMap((a, i) => (a === name ? [argv[i + 1]] : []));
const who = (v: string): Address => (isAddress(v, { strict: false }) ? getAddress(v) : getAddress(addressOf(v.toUpperCase() as Role)));

const abi = loadAbi(all("--abi"));
const hash = argv.find((a) => /^0x[0-9a-fA-F]{64}$/.test(a)) as Hex | undefined;

// --examples: 계열마다 하나씩. tx 는 이 레포의 기록에 있는 것이고, 호출은 tx 없이 시뮬레이션한다.
if (argv.includes("--examples")) {
  const live = path.join(ROOT, "track-a-explain/evidence/live");
  const vault = (() => {
    for (const f of fs.readdirSync(live).filter((x) => x.startsWith("pcl-kyb-gate-")).sort().reverse()) {
      const m = fs.readFileSync(path.join(live, f), "utf8").match(/"vault"\s*:\s*"(0x[0-9a-fA-F]{40})"/);
      if (m) return getAddress(m[1]);
    }
    throw new Error("a:kyb-gate 기록에서 금고 주소를 찾지 못했습니다. pnpm a:kyb-gate 를 먼저 실행하십시오.");
  })();
  const deposit = encodeFunctionData({ abi: [parseAbiItem("function deposit((bytes,bytes,bytes))") as AbiFunction], functionName: "deposit", args: [["0x", "0x", "0x"]] });
  const fund = encodeFunctionData({ abi: [parseAbiItem("function fund(address)") as AbiFunction], functionName: "fund", args: [addressOf("SUPPLIER_A")] });
  const cases: [string, () => Promise<unknown>][] = [
    ["컨트랙트 정책 거부: 증명 없는 협력사 B의 청구(2026-09-26)", () => explainTx("0xa4c7a3b9c025ce79c25f60d3f0b6e9e11deefb4e828d1e99bd163312c8cd557f", { abi })],
    ["컨트랙트 정책 거부: 한도 5 OKRW 에이전트의 8 OKRW 결제(2026-10-23)", () => explainTx("0xa46c02b2584130c57b4ed97acfd9931297930a7d9c72a5a3d05baacb7dadc64f", { abi })],
    ["가스 부족: 가스 한도 21,000으로 보낸 이체(2026-09-26)", () => explainTx("0x94d3b9c4405421842358708f92670228387c84b6ef91e552af821d2bc9575e8c", { abi })],
    ["전역 정책 거부: KYC 증명 없는 구매 기업의 2,000,001 OKRW 이체(시뮬레이션, 잔액 덮어쓰기)", () => explainCall({ from: addressOf("BUYER"), to: addressOf("SUPPLIER_A"), value: parseEther("2000001") }, { abi, balanceOverride: parseEther("20000000") })],
    ["프리컴파일 요청 검증: 빈 Privacy 예치(시뮬레이션)", () => explainCall({ from: addressOf("BUYER"), to: "0x100000000000000000000000000000000000000b", data: deposit }, { abi })],
    ["금고 로직: 구매 기업이 아닌 협력사 A의 fund(시뮬레이션)", () => explainCall({ from: addressOf("SUPPLIER_A"), to: vault, data: fund, value: parseEther("1") }, { abi })],
    ["통과: 증명을 색인한 협력사 A의 청구(2026-09-26)", () => explainTx("0x4d67c0dbf81db9c0f6e80bbe9c1d5676495800d0e7b4c643bed4df3a529cb81d", { abi })],
  ];
  const results: { case: string; explanation: unknown }[] = [];
  for (const [label, run] of cases) {
    const e = await run();
    console.log(`\n${label}`);
    for (const line of formatExplanation(e as never)) console.log(`  ${line}`);
    results.push({ case: label, explanation: e });
  }
  const file = writeEvidence(live, "explain-examples", { checkedAt: new Date().toISOString(), label: "조회만 함(영수증, eth_call, eth_estimateGas, PCL 설정). tx 없음", vault, results });
  console.log(`\n기록: ${path.relative(ROOT, file)}`);
  process.exit(0);
}

let explanation;
if (hash) {
  explanation = await explainTx(hash, { abi });
} else if (opt("--from") && opt("--to")) {
  let data = opt("--data") as Hex | undefined;
  const sig = opt("--sig");
  if (sig) {
    const item = parseAbiItem(`function ${sig}`) as AbiFunction;
    // --args 는 쉼표로 나눈 값이나 JSON 배열(튜플 인자를 넘길 때, 예: '[["0x","0x","0x"]]')
    const raw = opt("--args") ?? "";
    const args = raw.trim().startsWith("[")
      ? (JSON.parse(raw) as unknown[])
      : raw.split(",").filter(Boolean).map((a, i) => (item.inputs[i]?.type === "address" ? who(a) : a));
    data = encodeFunctionData({ abi: [item], functionName: item.name, args });
  }
  const balance = opt("--balance");
  explanation = await explainCall(
    { from: who(opt("--from")!), to: who(opt("--to")!), data, value: opt("--value") ? parseEther(opt("--value")!) : 0n },
    { abi, method: (opt("--method") as "eth_call" | "eth_estimateGas") ?? "eth_estimateGas", balanceOverride: balance ? parseEther(balance) : undefined },
  );
} else {
  console.log("사용법: pnpm explain <tx 해시>");
  console.log("        pnpm explain --from <주소|역할> --to <주소|역할> [--sig \"fund(address)\" --args 0x..] [--value OKRW] [--balance OKRW]");
  process.exit(2);
}

if (argv.includes("--json")) {
  console.log(JSON.stringify(explanation, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
} else {
  for (const line of formatExplanation(explanation)) console.log(line);
}
if (argv.includes("--record")) {
  const file = writeEvidence(path.join(ROOT, "track-a-explain/evidence/live"), "explain", { checkedAt: new Date().toISOString(), label: "조회만 함(영수증, eth_call, eth_estimateGas, PCL 설정). tx 없음", argv, explanation });
  console.log(`기록: ${path.relative(ROOT, file)}`);
}
