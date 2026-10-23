// 거부 해석기의 판정 함수(explain.ts 의 classifyRevert) 단위 테스트. 체인 호출 없음.
// 오류 데이터는 IPcl, IPrivacy, 금고 ABI 로 직접 인코딩해 만든다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeAbiParameters, encodeErrorResult, parseEther, type Abi, type Hex } from "viem";
import { iPclAbi } from "@maroo-chain/contracts/abi/precompiles/pcl/IPcl";
import { iPrivacyAbi } from "@maroo-chain/contracts/abi/precompiles/privacy/IPrivacy";
import { classifyRevert } from "./explain.ts";

const pcl = iPclAbi as Abi;
const enc = (abi: Abi, errorName: string, args: readonly unknown[] = []) => encodeErrorResult({ abi, errorName, args } as never) as Hex;
const vaultAbi = [{ type: "error", name: "NotBuyer", inputs: [] }] as const satisfies Abi;
const SENDER = "0x9d13000000000000000000000000000000c067bb";

test("PCL 정책 위반은 선택자와 이름, 다음 행동을 낸다", () => {
  const d = classifyRevert({ data: enc(pcl, "EasNoAttestationReceived", [SENDER]) });
  assert.equal(d.family, "pcl-policy");
  assert.equal(d.selector, "0xbca5593e");
  assert.equal(d.name, "EasNoAttestationReceived");
  assert.match(d.next, /indexAttestation/);
});

test("AnyOfRejected 는 자식 사유를 하나씩 푼다", () => {
  const children = [enc(pcl, "VolumeAboveMaxLimit", [parseEther("2000000"), parseEther("2000001")]), enc(pcl, "EasNoAttestationReceived", [SENDER])];
  const d = classifyRevert({ data: enc(pcl, "AnyOfRejected", [children]) });
  assert.equal(d.family, "pcl-policy");
  assert.deepEqual(d.children?.map((c) => c.name), ["VolumeAboveMaxLimit", "EasNoAttestationReceived"]);
  assert.match(d.children![0].next, /2,000,000 OKRW/);
});

test("에이전트 한도 초과는 한도와 요청 금액을 OKRW 로 보여 준다", () => {
  const d = classifyRevert({ data: enc(pcl, "ExceededAgentTransferLimit", [parseEther("5"), parseEther("8")]) });
  assert.equal(d.family, "pcl-policy");
  assert.match(d.next, /한도 5 OKRW 가운데 8 OKRW/);
});

test("SDKInvalidRequest 는 요청 검증 계열이고 어느 검사인지 모른다고 적는다", () => {
  const d = classifyRevert({ data: "0xadb34e5c" });
  assert.equal(d.family, "sdk");
  assert.equal(d.name, "SDKInvalidRequest");
  assert.match(d.next, /어느 검사/);
});

test("넘겨받은 컨트랙트 ABI 의 오류는 컨트랙트 로직 계열이다", () => {
  const d = classifyRevert({ data: enc(vaultAbi, "NotBuyer"), extraAbi: vaultAbi });
  assert.equal(d.family, "contract");
  assert.equal(d.name, "NotBuyer");
});

test("ABI 에 없는 선택자는 원시 데이터를 남긴다", () => {
  const d = classifyRevert({ data: "0x472e017e" });
  assert.equal(d.family, "unknown");
  assert.match(d.text, /0x472e017e/);
});

test("Error(string) 과 Panic(uint256) 을 가른다", () => {
  const err = ("0x08c379a0" + encodeAbiParameters([{ type: "string" }], ["duplicate selector: 0x12345678"]).slice(2)) as Hex;
  assert.equal(classifyRevert({ data: err }).family, "error-string");
  assert.match(classifyRevert({ data: err }).text, /duplicate selector/);
  const panic = ("0x4e487b71" + encodeAbiParameters([{ type: "uint256" }], [0x11n]).slice(2)) as Hex;
  const p = classifyRevert({ data: panic });
  assert.equal(p.family, "panic");
  assert.match(p.text, /오버플로/);
});

test("데이터 없이 가스를 다 썼으면 가스 부족이다", () => {
  const d = classifyRevert({ data: undefined, gasUsed: 21000n, gasLimit: 21000n });
  assert.equal(d.family, "out-of-gas");
  assert.match(d.next, /eth_estimateGas/);
});

test("데이터 없이 RPC 메시지만 있으면 노드 검사다", () => {
  const d = classifyRevert({ data: undefined, rpcMessage: "rpc error: code = Unknown desc = insufficient balance for transfer" });
  assert.equal(d.family, "node-check");
  assert.match(d.text, /insufficient balance/);
});

test("트랜잭션 수준 거절, 설정 오류, 공통 입력 오류, Privacy 오류를 가른다", () => {
  assert.equal(classifyRevert({ data: enc(pcl, "NonceTooLow") }).family, "tx-level");
  assert.equal(classifyRevert({ data: enc(pcl, "CannotEmpty", ["selector"]) }).family, "pcl-config");
  assert.equal(classifyRevert({ data: enc(pcl, "ABISetupFailed", ["short calldata"]) }).family, "precompile-input");
  const denom = enc(iPrivacyAbi as Abi, "PrivacyNativeDenomMismatch", ["aokrw", "atokrw"]);
  assert.equal(classifyRevert({ data: denom }).family, "privacy");
});

test("데이터도 메시지도 없고 가스도 남았으면 데이터 없는 되돌림이다", () => {
  const d = classifyRevert({ data: "0x", gasUsed: 50000n, gasLimit: 100000n });
  assert.equal(d.family, "no-data");
});

import { decideScope, reasonTemplates } from "./explain.ts";

test("사유 이름에서 그 사유를 내는 정책 템플릿을 찾는다", () => {
  const any = classifyRevert({ data: enc(pcl, "AnyOfRejected", [[enc(pcl, "ExceededPeriodicVolume", [1n, 2n, 3n]), enc(pcl, "EasNoAttestationReceived", [SENDER])]]) });
  assert.deepEqual([...reasonTemplates(any)].sort(), ["EAS_POLICY", "PERIODIC_VOLUME_POLICY"]);
  assert.deepEqual([...reasonTemplates(classifyRevert({ data: enc(pcl, "ExceededAgentTransferLimit", [1n, 2n]) }))], ["AGENT_OKRW_TRANSFER_LIMIT_POLICY"]);
});

test("대상이 PCL 프록시가 아니면 전역 정책이다", () => {
  assert.equal(decideScope({ isProxy: false, contract: [], global: ["EAS_POLICY"], reason: ["EAS_POLICY"] }).scope, "global");
});

test("프록시에 묶인 템플릿만 사유와 맞으면 컨트랙트 정책이다", () => {
  assert.equal(decideScope({ isProxy: true, contract: ["EAS_POLICY"], global: ["PERIODIC_VOLUME_POLICY", "VOLUME_POLICY"], reason: ["EAS_POLICY"] }).scope, "contract");
});

test("전역과 프록시 모두 사유와 맞으면 둘 다 가능하다고 하고 가리는 법을 알린다", () => {
  const s = decideScope({ isProxy: true, contract: ["EAS_POLICY"], global: ["EAS_POLICY", "PERIODIC_VOLUME_POLICY"], reason: ["EAS_POLICY"] });
  assert.equal(s.scope, "either");
  assert.match(s.note, /보내는 주소/);
});

test("어디에도 맞는 템플릿이 없으면 모른다고 한다", () => {
  assert.equal(decideScope({ isProxy: true, contract: ["DENYLIST_POLICY"], global: ["VOLUME_POLICY"], reason: ["EAS_POLICY"] }).scope, "unknown");
});

import { formatExplanation, type Explanation } from "./explain.ts";

test("거부된 tx 의 해석을 tx, 사유, 종류, 걸린 정책, 다음 행동 줄로 찍는다", () => {
  const decoded = classifyRevert({ data: enc(pcl, "EasNoAttestationReceived", [SENDER]) });
  const e: Explanation = {
    source: "tx",
    tx: { hash: "0xa4c7a3b9c025ce79c25f60d3f0b6e9e11deefb4e828d1e99bd163312c8cd557f", block: 19111569n, status: "reverted", gasUsed: 150000n, gasLimit: 300000n },
    call: { from: SENDER, to: "0x50f60000000000000000000000000000000d7e8e", selector: "0x4e71d92d", selectorName: "claim()", value: 0n },
    decoded,
    target: { isProxy: true, kind: "Transparent", bound: ["EAS_POLICY"], global: ["And(…)"] },
    scope: { scope: "contract", note: "사유와 맞는 템플릿이 이 프록시에만 묶여 있습니다." },
  };
  const lines = formatExplanation(e);
  assert.match(lines[0], /^tx\s+0xa4c7…557f\s+블록 19111569\s+reverted\s+가스 150,000 \/ 300,000 \(50\.0%\)$/);
  assert.ok(lines.some((l) => /^사유\s+EasNoAttestationReceived\(0x9d13…67bb\)\s+선택자 0xbca5593e$/i.test(l)), lines.join("\n"));
  assert.ok(lines.some((l) => /^종류\s+PCL 정책 위반$/.test(l)), lines.join("\n"));
  assert.ok(lines.some((l) => /^걸린 정책\s+컨트랙트 정책\. .*PCL 프록시\(Transparent\).*claim\(\)\(0x4e71d92d\).*EAS_POLICY/.test(l)), lines.join("\n"));
  assert.ok(lines.some((l) => /^다음 행동\s+.*indexAttestation/.test(l)), lines.join("\n"));
});

test("통과한 프록시 호출은 PolicyCheckPassed 유무를 찍는다", () => {
  const e: Explanation = {
    source: "tx",
    tx: { hash: "0x4d67c0dbf81db9c0f6e80bbe9c1d5676495800d0e7b4c643bed4df3a529cb81d", block: 1n, status: "success", gasUsed: 80n, gasLimit: 100n },
    call: { from: SENDER, to: "0x50f60000000000000000000000000000000d7e8e", selector: "0x4e71d92d", value: 0n },
    target: { isProxy: true, kind: "Transparent", bound: ["EAS_POLICY"], global: [] },
    policyCheckPassed: true,
  };
  const lines = formatExplanation(e);
  assert.ok(lines.some((l) => /^통과 기록\s+PolicyCheckPassed 있음/.test(l)), lines.join("\n"));
  assert.ok(!lines.some((l) => l.startsWith("사유")), lines.join("\n"));
});

test("시뮬레이션 해석은 호출 줄과 쓴 방법을 찍고 자식 사유를 들여 쓴다", () => {
  const decoded = classifyRevert({ data: enc(pcl, "AnyOfRejected", [[enc(pcl, "VolumeAboveMaxLimit", [parseEther("2000000"), parseEther("2000001")]), enc(pcl, "EasNoAttestationReceived", [SENDER])]]) });
  const e: Explanation = {
    source: "simulation", method: "eth_estimateGas",
    call: { from: SENDER, to: "0x7717000000000000000000000000000000005e8c", value: parseEther("2000001") },
    decoded,
    target: { isProxy: false, kind: "Unspecified", bound: [], global: [] },
    scope: { scope: "global", note: "대상이 PCL 프록시가 아니라 컨트랙트 정책은 걸릴 수 없습니다." },
  };
  const lines = formatExplanation(e);
  assert.match(lines[0], /^호출\s+0x9d13…67bb → 0x7717…5e8c\s+2,000,001 OKRW\s+eth_estimateGas$/);
  assert.ok(lines.some((l) => /^\s+자식 1\s+VolumeAboveMaxLimit/.test(l)), lines.join("\n"));
  assert.ok(lines.some((l) => /^걸린 정책\s+전역 정책\./.test(l)), lines.join("\n"));
});

test("감싸이지 않은 사유가 전역 정책에서는 Or 안에만 있으면 컨트랙트 정책이다", () => {
  const s = decideScope({ isProxy: true, contract: ["EAS_POLICY"], global: ["EAS_POLICY", "PERIODIC_VOLUME_POLICY"], globalBare: [], reason: ["EAS_POLICY"], wrapped: false });
  assert.equal(s.scope, "contract");
  assert.match(s.note, /AnyOfRejected/);
});

test("자식 사유 안의 AnyOfRejected 도 한 단계 더 들여 써서 푼다", () => {
  const inner = enc(pcl, "AnyOfRejected", [[enc(pcl, "EasNoAttestationReceived", [SENDER])]]);
  const decoded = classifyRevert({ data: enc(pcl, "AnyOfRejected", [[enc(pcl, "VolumeAboveMaxLimit", [1n, 2n]), inner]]) });
  const lines = formatExplanation({ source: "simulation", method: "eth_estimateGas", call: { from: SENDER, to: SENDER, value: 0n }, decoded });
  assert.ok(lines.some((l) => /^\s+자식 2\.1\s+EasNoAttestationReceived/.test(l)), lines.join("\n"));
});

import { refineByUncappedReplay } from "./explain.ts";

test("데이터 없는 되돌림이 가스 한도 없이 다시 실행해 통과하면 가스 부족이다(하위 호출이 받은 가스를 다 쓴 경우)", () => {
  // 2026-10-23 에이전트 지갑의 금고 fund(), 가스 한도 60,000 에 59,538 사용
  const d = classifyRevert({ data: undefined, rpcMessage: "execution reverted", gasUsed: 59_538n, gasLimit: 60_000n });
  assert.equal(d.family, "node-check");
  const r = refineByUncappedReplay(d, true, { gasUsed: 59_538n, gasLimit: 60_000n });
  assert.equal(r.family, "out-of-gas");
  assert.match(r.text, /59,538/);
  assert.match(r.text, /60,000/);
});

test("가스 한도 없이도 되돌려지거나 사유 데이터가 있으면 판정을 바꾸지 않는다", () => {
  const d = classifyRevert({ data: undefined, rpcMessage: "execution reverted", gasUsed: 59_538n, gasLimit: 60_000n });
  assert.equal(refineByUncappedReplay(d, false, { gasUsed: 59_538n, gasLimit: 60_000n }).family, "node-check");
  const policy = classifyRevert({ data: "0x472e017e" as Hex, extraAbi: [{ type: "error", name: "NotBuyer", inputs: [] }] as Abi });
  assert.equal(refineByUncappedReplay(policy, true, { gasUsed: 1n, gasLimit: 2n }).family, policy.family);
});

test("정책 인식 프리컴파일(Privacy)은 PCL 프록시가 아니어도 자기 주소에 묶인 컨트랙트 정책으로 거부할 수 있다", () => {
  // 2026-10-23: 공개된 성공 예치의 calldata 를 구매 기업 지갑에서 보내면 감싸이지 않은 EasNoAttestationReceived 로 막혔다.
  // 테스트넷 전역 정책의 EAS_POLICY 는 Or 안에만 있어 감싸이지 않고 나올 수 없고, Privacy 주소에는 And(EAS_POLICY, DENYLIST_POLICY)가 묶여 있다.
  const s = decideScope({ isProxy: false, contract: ["EAS_POLICY", "DENYLIST_POLICY"], global: ["EAS_POLICY", "PERIODIC_VOLUME_POLICY"], globalBare: [], reason: ["EAS_POLICY"], wrapped: false });
  assert.equal(s.scope, "contract");
});
