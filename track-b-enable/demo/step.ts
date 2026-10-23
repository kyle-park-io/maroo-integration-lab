// 워크샵 단계 실행기.
//
//   pnpm b:step 1    구조와 연결 확인           [Live Testnet] 조회
//   pnpm b:step 2    KYB 관문 금고              [Live Testnet] 상태 변경 tx
//   pnpm b:step 3    차폐 정산                  [Local] Clairveil 로컬 체인
//   pnpm b:step 4    결과 분류와 최초 실패 계층   [Live Testnet] 조회와 시뮬레이션
//   pnpm b:step 5    정리                       기록 모음과 토론 질문
//
// 단계마다 하는 일, 예상 결과, 성공 기준을 먼저 출력하고 진행자가 설명할 수 있게 멈춘다(--no-pause 로 끈다).
// 실패하면 트러블슈팅 번호를 안내한다. 기록은 track-b-enable/evidence/ 에 남는다.

import fs from "node:fs";
import path from "node:path";
import { encodeFunctionData, formatEther, getAddress, parseEther, type Address, type Hex } from "viem";
import { iPclAbi } from "@maroo-chain/contracts/abi/precompiles/pcl/IPcl";
import { iPrivacyAbi } from "@maroo-chain/contracts/abi/precompiles/privacy/IPrivacy";
import { ROOT, outPath } from "../../shared/lib/paths.ts";
import { findStepLine } from "../../shared/lib/local-report.ts";
import { describePolicy, findEasSchema, type PolicySet } from "../../shared/lib/pcl-policy.ts";
import {
  EAS_PARAMS, EXPLORER, PCL, PRIVACY, RPC, addressOf, easParamsAbi, indexerAbi, publicClient as pub,
  writeEvidence, type Role,
} from "../../shared/lib/maroo.ts";
import { DISCUSSION, LIVE_DIR, LOCAL_DIR, PREBUILT_DIR, STEP2, STEP3, announce, newest, pause, trouble } from "./lib.ts";
import { categoryOf } from "./classify.ts";
import { FAMILY_LABEL, SCOPE_LABEL, type Explanation } from "../../shared/lib/explain.ts";
import { explainCall, explainTx, loadAbi } from "../../shared/lib/explain-chain.ts";

// 가스 한도 21,000으로 보낸 1 OKRW 이체(2026-09-26, 테스트넷). 가스 부족 행의 예로 다시 푼다.
const GAS_21K_TX = "0x94d3b9c4405421842358708f92670228387c84b6ef91e552af821d2bc9575e8c" as const;

const step = Number(process.argv.find((a) => /^[1-5]$/.test(a)));
const rel = (f: string) => path.relative(ROOT, f);
const ok = (b: boolean) => (b ? "✓" : "✗");

async function step1() {
  announce("1단계", { title: "구조와 연결 확인 [Live Testnet]", expect: "chain ID 450815, 역할 지갑 다섯 개, Privacy 정책과 전역 정책", success: "모든 줄이 ✓. 구매 기업 잔액은 2단계 전에 1,000 OKRW 이상" });
  await pause();
  const report: Record<string, unknown> = { rpc: RPC, checkedAt: new Date().toISOString() };
  const chainId = await pub.getChainId().catch(() => undefined);
  console.log(`  ${ok(chainId === 450815)} chain ID ${chainId ?? "응답 없음"}`);
  if (chainId !== 450815) { console.log(`  ${trouble("T5")}`); process.exit(1); }
  const roles: Role[] = ["BUYER", "ISSUER", "SUPPLIER_A", "SUPPLIER_B", "UPGRADE_OWNER"];
  const balances: Record<string, string> = {};
  for (const r of roles) {
    let addr: Address;
    try { addr = addressOf(r); } catch { console.log(`  ✗ ${r} 주소 없음. ${trouble("T6")}`); process.exit(1); }
    balances[r] = formatEther(await pub.getBalance({ address: addr }));
    console.log(`  ✓ ${r.padEnd(13)} ${addr}  ${balances[r]} OKRW`);
  }
  const buyerReady = parseEther(balances.BUYER) >= parseEther("1000");
  console.log(`  ${ok(buyerReady)} 구매 기업 잔액 ${buyerReady ? "2단계 준비됨" : `부족. ${trouble("T7")}`}`);
  const privacy = await pub.readContract({ address: PCL, abi: iPclAbi, functionName: "contractPolicies", args: [PRIVACY] }) as { admin: Address; policies: readonly PolicySet[] };
  const global = await pub.readContract({ address: PCL, abi: iPclAbi, functionName: "globalPolicies" }) as { policies: readonly PolicySet[] };
  const privacyPolicy = privacy.policies.map(describePolicy).join(", ");
  const globalPolicy = global.policies.map(describePolicy).join(", ");
  console.log(`  ✓ Privacy 정책: ${privacyPolicy}`);
  console.log(`  ✓ 전역 정책: ${globalPolicy}`);
  const schema = privacy.policies.map(findEasSchema).find(Boolean) as Hex | undefined;
  const { indexer } = await pub.readContract({ address: EAS_PARAMS, abi: easParamsAbi, functionName: "getParams" });
  const kyc = schema ? await pub.readContract({ address: indexer, abi: indexerAbi, functionName: "getReceivedAttestationUIDCount", args: [addressOf("BUYER"), schema] }) : 0n;
  console.log(`  ✓ 구매 기업이 가진 본인 인증 증명: ${kyc}개. 0개면 Privacy 호출은 정책 층에서도 막힙니다`);
  Object.assign(report, { chainId, balances, buyerReady, privacyPolicy, privacyAdmin: privacy.admin, globalPolicy, buyerKycAttestations: kyc });
  console.log(`\n  기록: ${rel(writeEvidence(LIVE_DIR, "step1-connect", report))}`);
}

async function step2() {
  announce("2단계", { title: "KYB 관문 금고 [Live Testnet]", expect: "하위 단계 0~8. 거부 셋(5, 6b, 7c)과 통과 하나(6d)", success: "5, 6b, 7c가 [예상대로 거부], 6d가 [성공], 마지막에 기록 경로" });
  if (!fs.existsSync(path.join(ROOT, "out/SettlementVault.sol/SettlementVault.json"))) { console.log(`  ✗ 금고 컴파일 결과가 없습니다. ${trouble("T9")}`); process.exit(1); }
  await pause();
  const { runKybGate } = await import("../../shared/lib/kyb-gate.ts");
  try {
    const { file, vault } = await runKybGate({
      evidenceDir: LIVE_DIR,
      beforeStage: async (s) => { announce(`2-${s}`, STEP2[s]); await pause(); },
    });
    console.log(`\n  금고: ${EXPLORER}/address/${vault}\n  기록: ${rel(file)}`);
  } catch (err) {
    const msg = (err as Error).message;
    console.log(`\n  ✗ ${msg.split("\n")[0]}`);
    console.log(`  ${trouble(/잔액/.test(msg) ? "T7" : /EasNoAttestation/.test(msg) ? "T8" : /revert|deploy/i.test(msg) ? "T9" : "T5")}`);
    process.exit(1);
  }
}

async function step3() {
  announce("3단계", { title: "차폐 정산 [Local]", expect: "예치, 일괄 지급, 수신자 암호화 지급, 스캔, 해독, 인출", success: "마지막에 기록 경로. 기록 2절에 협력사 B verified=true, 1절에 인출 성공" });
  await pause();
  const { runLocalVendorSettlement } = await import("../../shared/lib/local-vendor-settlement.ts");
  try {
    const report = await runLocalVendorSettlement({
      evidenceDir: LOCAL_DIR, command: "pnpm b:step 3", prebuiltDir: PREBUILT_DIR,
      beforeStage: async (n) => { announce(`3-${n}`, STEP3[n]); await pause(); },
    });
    console.log(`\n  기록: ${rel(report)}`);
  } catch (err) {
    const msg = (err as Error).message;
    console.log(`\n  ✗ ${msg.split("\n")[0]}`);
    console.log(`  ${trouble(/26657|RPC_PORT/.test(msg) ? "T4" : /vendor\/clairveil/.test(msg) ? "T3" : /인출|withdraw/.test(msg) ? "T10" : "T2")}`);
    process.exit(1);
  }
}

type Row = { case: string; label: string; method: string; selector: string; outcome: string; family: string; class: string; scope: string; next: string };

// 거부 해석기의 결과를 4단계 표의 한 행으로 바꾼다. 분류는 B 트랙 목표의 네 분류, 계열은 해석기가 선택자로 정한 것이다.
function rowOf(name: string, label: string, method: string, e: Explanation, passNext = "기록 확인"): Row {
  const d = e.decoded;
  const outcome = !d ? (e.policyCheckPassed ? "통과(PolicyCheckPassed 있음)" : "통과")
    : d.children ? `${d.name}(${d.children.map((c) => c.name ?? c.text).join(", ")})` : (d.name ?? d.text);
  return {
    case: name, label, method, selector: d?.selector ?? "-", outcome, family: d ? FAMILY_LABEL[d.family] : "-",
    class: categoryOf(d?.family), scope: e.scope ? SCOPE_LABEL[e.scope.scope] : "-", next: d ? d.next : passNext,
  };
}

async function step4() {
  announce("4단계", { title: "결과 분류와 최초 실패 계층 [Live Testnet]", expect: "성공, 정책 거부, 증명·입력 거부, 인프라·자료 부재가 표에 하나 이상씩. 거부 행마다 오류 선택자와 계열이 함께 나옴", success: "각 행의 분류를 참가자가 선택자와 계열을 근거로 설명할 수 있음" });
  await pause();
  const rows: Row[] = [];
  const abi = loadAbi();
  const buyer = getAddress(addressOf("BUYER"));
  const fund = (supplier: Address) => encodeFunctionData({ abi: [{ name: "fund", type: "function", stateMutability: "payable", inputs: [{ name: "supplier", type: "address" }], outputs: [] }], functionName: "fund", args: [supplier] });

  // (1) 2단계 기록의 성공과 거부. tx 마다 직전 블록 상태로 다시 시뮬레이션해 사유를 푼다.
  const gate = newest(LIVE_DIR, "pcl-kyb-gate-");
  if (gate) {
    const g = JSON.parse(fs.readFileSync(gate, "utf8")) as { vault: Address; steps: { step: string; result?: string; tx?: Hex }[] };
    for (const s of g.steps.filter((x) => x.tx && /^(5|6b|6d|7c)\)/.test(x.step))) {
      rows.push(rowOf(`2단계 ${s.step}`, "[Live Testnet] tx", s.tx!, await explainTx(s.tx!, { abi })));
    }
    // 같은 금고에 증명 없는 협력사 B 의 청구를 지금 다시 시뮬레이션한다. PCL 이 금고 코드보다 먼저 판정한다.
    const claim = encodeFunctionData({ abi: [{ name: "claim", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] }], functionName: "claim" });
    rows.push(rowOf("협력사 B claim() 재시뮬레이션", "[Live Testnet] eth_estimateGas", "eth_estimateGas", await explainCall({ from: getAddress(addressOf("SUPPLIER_B")), to: g.vault, data: claim }, { abi })));
    // 정책은 통과하고 금고 코드가 막는 경우: 구매 기업이 아닌 협력사 A 가 fund 를 부른다.
    const supplierA = getAddress(addressOf("SUPPLIER_A"));
    rows.push(rowOf("협력사 A fund() 시뮬레이션(구매 기업이 아님)", "[Live Testnet] eth_estimateGas", "eth_estimateGas", await explainCall({ from: supplierA, to: g.vault, data: fund(supplierA), value: parseEther("1") }, { abi })));
    // 전역 정책이 PCL 프록시 호출에서 걸리는 경우: KYC 증명 없는 구매 기업이 건당 한도(200만 OKRW)를 넘는 금액을 fund 에 싣는다.
    // 잔액은 상태 덮어쓰기로 부풀리므로 tx 도 실제 잔액도 필요 없다.
    rows.push(rowOf("구매 기업 2,000,001 OKRW fund() 시뮬레이션(잔액 덮어쓰기)", "[Live Testnet] eth_estimateGas", "eth_estimateGas",
      await explainCall({ from: buyer, to: g.vault, data: fund(supplierA), value: parseEther("2000001") }, { abi, balanceOverride: parseEther("20000000") })));
  } else {
    rows.push({ case: "2단계 기록", label: "-", method: "-", selector: "-", outcome: "기록 없음", family: "-", class: "해당 없음", scope: "-", next: "2단계를 먼저 실행" });
  }

  // (2) Privacy 예치: 유효한 증명 없이 부르면 요청 검증에서 막힌다. 거부 경로 증거로만 쓴다.
  const deposit = encodeFunctionData({ abi: iPrivacyAbi, functionName: "deposit", args: [{ noteCommitment: "0x", encryptedNote: "0x", proof: "0x" }] });
  for (const method of ["eth_call", "eth_estimateGas"] as const) {
    rows.push(rowOf("Privacy deposit, 빈 요청", `[Live Testnet] ${method}`, method, await explainCall({ from: buyer, to: PRIVACY, data: deposit }, { abi, method })));
  }

  // (3) 가스 부족: 가스 한도 21,000으로 보낸 단순 이체. 2026-09-26 테스트넷에 남은 tx 를 다시 푼다.
  rows.push(rowOf("가스 한도 21,000으로 보낸 1 OKRW 이체", "[Live Testnet] tx", GAS_21K_TX, await explainTx(GAS_21K_TX, { abi })));

  // (4) Privacy 정상 경로에 필요한 공개 자료. 문서로 확인한 부재라 라벨이 다르다.
  rows.push({ case: "Privacy 정상 경로 재료", label: "[Docs Only]", method: "Maroo Docs", selector: "-", outcome: "회로 산출물, 차폐 상태 조회 경로, 예시 입력이 공개되지 않음", family: "-", class: "인프라·자료 부재", scope: "-", next: "Maroo에 요청할 목록으로 정리" });

  // (5) 잔액보다 큰 금액의 예치: 준비 부족은 체인이 규칙으로 막은 것과 구분한다.
  const balance = await pub.getBalance({ address: buyer });
  rows.push(rowOf("잔액보다 1 OKRW 큰 예치(계정 준비 부족)", "[Live Testnet] eth_estimateGas", "eth_estimateGas", await explainCall({ from: buyer, to: PRIVACY, data: deposit, value: balance + parseEther("1") }, { abi })));

  // (6) 3단계 기록의 성공과 v0.4.0 인출 실패
  const local = newest(LOCAL_DIR, "vendor-settlement-");
  if (local) {
    const md = fs.readFileSync(local, "utf8");
    const alone = findStepLine(md, "withdraw-alone");
    const cobl = findStepLine(md, "supplier-a-withdraw");
    if (cobl) rows.push({ case: "로컬 인출(같은 블록 우회)", label: "[Local] tx", method: rel(local), selector: "-", outcome: cobl.includes("성공") ? "통과" : "실패", family: "-", class: cobl.includes("성공") ? "성공" : "인프라·자료 부재", scope: "-", next: "Maroo 테스트넷 결과가 아님" });
    if (alone) rows.push({ case: "로컬 인출(단독)", label: "[Local] tx", method: rel(local), selector: "-", outcome: "merkle root snapshot re-registration is inconsistent", family: "-", class: "참조 구현 문제", scope: "-", next: "같은 블록에 잎을 더하는 tx를 함께 넣음" });
  }

  console.log("\n  | 경우 | 라벨 | 선택자 | 결과 | 계열 | 분류 | 걸린 정책 | 다음 행동 |");
  console.log("  | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const r of rows) console.log(`  | ${r.case} | ${r.label} | ${r.selector} | ${r.outcome} | ${r.family} | ${r.class} | ${r.scope} | ${r.next} |`);
  console.log("\n  같은 tx 하나를 자세히 풀려면 pnpm explain <tx 해시>를 실행합니다.");
  console.log("  Maroo Docs에서 찾지 못한 선행 자료 [Docs Only]: 현재 테스트넷 verifier와 맞는 회로 버전과 proving 산출물,");
  console.log("  차폐 상태(Merkle witness, nullifier) 조회 경로, 성공한 Privacy 호출의 예시 입력, prover 엔드포인트");
  const file = writeEvidence(LIVE_DIR, "step4-diagnose", { rpc: RPC, checkedAt: new Date().toISOString(), label: "조회와 시뮬레이션, 이전 단계 기록. 새 tx 없음", rows });
  console.log(`\n  기록: ${rel(file)}`);
}

// 5단계에 두 줄로 보이는 목록. 참가자 가이드의 "테스트넷 Privacy까지 남은 것"과 A 가이드 6절, 8절이 기준이다.
const NEXT = [
  ["Maroo에서 받아야 할 재료", "현재 verifier와 맞는 회로 버전과 proving 산출물, 차폐 상태 조회 경로, 성공한 예치·지급 예시 입력, prover 엔드포인트(A 가이드 6절)"],
  ["프로덕션 전에 남은 것", "차폐 금액 상한, 참조 구현의 외부 감사와 trusted setup, 규제기관 열람, 기관 KYB 경로, 키 보관과 지급 원장 대사, 금고 회수 권한(A 가이드 8절)"],
] as const;

async function step5() {
  announce("5단계", { title: "정리", expect: "이번 세션의 기록 파일과 라벨, 토론 질문", success: "참가자가 두 환경의 경계와 다음에 필요한 것을 말할 수 있음" });
  const files = [
    ["1단계 연결", newest(LIVE_DIR, "step1-connect-"), "[Live Testnet] 조회"],
    ["2단계 금고", newest(LIVE_DIR, "pcl-kyb-gate-"), "[Live Testnet] 상태 변경 tx"],
    ["3단계 차폐 정산", newest(LOCAL_DIR, "vendor-settlement-"), "[Local]"],
    ["4단계 분류", newest(LIVE_DIR, "step4-diagnose-"), "[Live Testnet] 조회와 시뮬레이션"],
  ] as const;
  const lines = ["# 워크샵 세션 기록", "", `- 작성 시각: ${new Date().toISOString()}`, "", "| 단계 | 라벨 | 기록 |", "| --- | --- | --- |"];
  for (const [name, f, label] of files) {
    console.log(`  ${ok(!!f)} ${name.padEnd(10)} ${label.padEnd(26)} ${f ? rel(f) : "없음"}`);
    lines.push(`| ${name} | \`${label}\` | ${f ? `\`${rel(f)}\`` : "없음"} |`);
  }
  console.log("\n  두 환경의 경계");
  const gate = files[1][1], local = files[2][1];
  console.log(gate
    ? "  - Maroo 테스트넷: OKRW 이체, PCL 프록시 금고, EAS 증명의 거부와 통과를 실제 tx로 확인했습니다."
    : "  - Maroo 테스트넷: 2단계 기록이 없어 상태 변경 tx는 이 세션에서 확인하지 못했습니다. 1단계의 조회 결과만 있습니다.");
  console.log(local
    ? "  - Clairveil 로컬: 예치, 지급, 스캔, 해독, 인출을 끝까지 실행했습니다. Maroo 테스트넷 호환성의 증거는 아닙니다."
    : "  - Clairveil 로컬: 3단계 기록이 없습니다.");
  console.log("  - Maroo 테스트넷 Privacy: 요청 검증(SDKInvalidRequest)까지 진단했습니다. 회로 산출물과 상태 조회 경로가 있어야 다음 층으로 갑니다.");
  console.log("\n  Privacy 정상 경로까지 남은 것");
  for (const [k, v] of NEXT) console.log(`  - ${k}: ${v}`);
  lines.push("", "## Privacy 정상 경로까지 남은 것", "", ...NEXT.map(([k, v]) => `- ${k}: ${v}`));
  console.log("\n  토론 질문");
  DISCUSSION.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));
  lines.push("", "## 토론 질문", "", ...DISCUSSION.map((q, i) => `${i + 1}. ${q}`), "");
  fs.mkdirSync(outPath(path.join(ROOT, "track-b-enable/evidence")), { recursive: true });
  const out = path.join(outPath(path.join(ROOT, "track-b-enable/evidence")), `session-${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}.md`);
  fs.writeFileSync(out, lines.join("\n"));
  console.log(`\n  세션 기록: ${rel(out)}`);
}

const run = { 1: step1, 2: step2, 3: step3, 4: step4, 5: step5 }[step];
if (!run) {
  console.log("사용법: pnpm b:step <1~5> [--no-pause]");
  process.exit(2);
}
await run();
