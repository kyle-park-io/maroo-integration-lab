import assert from "node:assert/strict";
import test from "node:test";
import { numberToHex, parseEther, toHex } from "viem";
import { encodeLimit, messageFor, parseAmount, readLimit } from "./app-logic.ts";
import type { Explanation } from "../../shared/lib/explain.ts";

const LIMIT = parseEther("5");

test("한도 메타데이터는 32바이트 정수만 한도로 읽는다", () => {
  assert.deepEqual(readLimit("0x"), { kind: "none" });
  assert.deepEqual(readLimit(numberToHex(LIMIT, { size: 32 })), { kind: "ok", wei: LIMIT });
  const s = readLimit(toHex(LIMIT.toString()));
  assert.equal(s.kind, "invalid");
  assert.match((s as { reason: string }).reason, /숫자 문자열/);
  assert.match((readLimit("0x0102") as { reason: string }).reason, /2바이트/);
});

test("한도 저장 형식은 32바이트 정수와 옛 문서의 숫자 문자열 두 가지다", () => {
  assert.equal(encodeLimit(LIMIT, "uint256"), numberToHex(LIMIT, { size: 32 }));
  assert.equal(encodeLimit(LIMIT, "string"), toHex(LIMIT.toString()));
});

test("금액 입력은 양수 OKRW 만 받는다", () => {
  assert.equal(parseAmount("3"), parseEther("3"));
  assert.equal(parseAmount("0.5"), parseEther("0.5"));
  for (const bad of ["", "0", "-1", "abc", "1e3", "0.0000000000000000001"]) assert.equal(parseAmount(bad), undefined, bad);
});

const rejected = (name: string, args: unknown[], family: "pcl-policy" | "contract" = "pcl-policy"): Explanation => ({
  source: "simulation", method: "eth_estimateGas",
  call: { from: "0xA", to: "0xV", value: 0n },
  decoded: { family, name, args, text: `${name}(...)`, next: "" },
  scope: { scope: "contract", note: "" },
});

test("한도 초과 거절은 한도와 요청 금액을 쓰고 한도를 올리거나 나누라고 한다", () => {
  const m = messageFor({ status: "rejected", explanation: rejected("ExceededAgentTransferLimit", [parseEther("5"), parseEther("8")]) });
  assert.equal(m.stamp, "거절");
  assert.match(m.body, /한도\(5 OKRW\)보다 큰 금액\(8 OKRW\)/);
  assert.match(m.body, /가스비\(fee\)도 나가지 않았어요/);
  assert.equal(m.next?.action, "raise-limit");
});

test("한도 형식 오류는 다시 저장하라고 한다", () => {
  const m = messageFor({ status: "rejected", explanation: rejected("AgentTransferLimitMetadataInvalid", ["expected 32-byte uint256, got 19 bytes"]) });
  assert.match(m.body, /형식/);
  assert.equal(m.next?.action, "save-limit");
});

test("가스 부족은 블록에서 실패했고 가스비가 나갔다고 쓴다", () => {
  const e: Explanation = {
    source: "tx", tx: { hash: "0x94d3", block: 1n, status: "reverted", gasUsed: 21000n, gasLimit: 21000n },
    call: { from: "0xA", to: "0xV", value: 0n }, decoded: { family: "out-of-gas", text: "", next: "" },
  };
  const m = messageFor({ status: "failed", tx: "0x94d3", fee: parseEther("0.189"), explanation: e });
  assert.equal(m.stamp, "실패");
  assert.match(m.body, /가스 한도\(21,000\)/);
  assert.match(m.body, /0\.189 OKRW/);
  assert.equal(m.next?.action, "retry");
});

test("잔고 부족은 보내지 않았다고 쓰고 충전 버튼으로 보낸다", () => {
  const m = messageFor({ status: "blocked", balance: parseEther("2"), need: parseEther("9.5") });
  assert.equal(m.stamp, "보내지 않음");
  assert.match(m.body, /잔고 2 OKRW/);
  assert.match(m.body, /9\.5 OKRW/);
  assert.equal(m.next?.action, "topup");
});

test("RPC 가 끊기면 보내지 않았다고 쓴다", () => {
  const m = messageFor({ status: "network" });
  assert.match(m.body, /RPC/);
  assert.match(m.body, /보내지 않았어요/);
  assert.equal(m.next?.action, "retry");
});

test("보냈는지 모르면 보냈다고만 쓰고 다시 읽기로 보낸다", () => {
  const m = messageFor({ status: "unknown", tx: "0xabc" });
  assert.equal(m.stamp, "확인 중");
  assert.match(m.body, /보냈지만/);
  assert.doesNotMatch(m.body, /넣었어요|성공/);
  assert.equal(m.next?.action, "recheck");
});

test("성공은 넣은 금액과 가스비를 쓴다", () => {
  const m = messageFor({ status: "success", tx: "0xabc", value: parseEther("3"), fee: parseEther("2.4"), block: 10n });
  assert.equal(m.stamp, "승인");
  assert.match(m.body, /3 OKRW를 넣었어요/);
  assert.match(m.body, /2\.4 OKRW/);
});

test("금고 코드가 거절하면 PCL 이 아니라 금고라고 쓴다", () => {
  const m = messageFor({ status: "rejected", explanation: rejected("NotBuyer", [], "contract") });
  assert.match(m.body, /금고/);
  assert.doesNotMatch(m.body, /PCL이/);
});

test("노드가 가스 한도를 받지 않으면 블록에 들어가지 않았고 가스비도 나가지 않았다고 쓴다", () => {
  const m = messageFor({
    status: "refused",
    decoded: { family: "tx-level", name: "IntrinsicGasTooLow", args: [], text: "IntrinsicGasTooLow()", next: "" },
    nodeMessage: "failed to validate transaction: intrinsic gas too low: gas 21000, minimum needed 21432",
  });
  assert.equal(m.stamp, "보내지 않음");
  assert.match(m.body, /가스 한도\(21,000\)/);
  assert.match(m.body, /최소 가스\(21,432\)/);
  assert.match(m.body, /가스비\(fee\)는 나가지 않았어요/);
  assert.equal(m.next?.action, "retry");
});

test("노드가 다른 이유로 받지 않으면 사유 이름을 쓴다", () => {
  const m = messageFor({ status: "refused", decoded: { family: "tx-level", name: "NonceTooLow", args: [], text: "NonceTooLow()", next: "" }, nodeMessage: "nonce too low" });
  assert.match(m.body, /NonceTooLow/);
  assert.match(m.body, /블록에 들어가지 않아/);
});
