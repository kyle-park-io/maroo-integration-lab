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

import { allowedRequest, classifySendError, isRpcTrouble, parseGas, rebroadcastResult } from "./app-logic.ts";

test("보내다 연결 자체가 안 된 오류는 보내지 않음, 끊긴 오류는 보냈는지 모름으로 나눈다", () => {
  for (const m of ["fetch failed (cause: connect ECONNREFUSED 127.0.0.1:9)", "getaddrinfo ENOTFOUND rpc-testnet.maroo.io", "getaddrinfo EAI_AGAIN rpc-testnet.maroo.io"]) assert.equal(classifySendError(m), "not-sent", m);
  for (const m of ["socket hang up", "The request took too long to respond.", "read ECONNRESET", "connect ETIMEDOUT 1.2.3.4:443", "fetch failed"]) assert.equal(classifySendError(m), "ambiguous", m);
  assert.equal(classifySendError("nonce too low: next nonce 5, tx nonce 4"), "other");
});

test("다시 보낸 결과를 노드 메시지로 나눈다", () => {
  assert.equal(rebroadcastResult(undefined), "ok");
  assert.equal(rebroadcastResult("already known"), "known");
  assert.equal(rebroadcastResult("nonce too low: next nonce 12, tx nonce 11"), "nonce-too-low");
  assert.equal(rebroadcastResult("fetch failed (cause: connect ECONNREFUSED)"), "network");
  assert.equal(rebroadcastResult("insufficient funds"), "other");
});

test("RPC 가 바쁘거나 응답하지 않은 사전 검사는 거절이 아니다", () => {
  assert.equal(isRpcTrouble(429, undefined), true);
  assert.equal(isRpcTrouble(502, undefined), true);
  assert.equal(isRpcTrouble(200, { code: -32005, message: "request rate exceeded" }), true);
  assert.equal(isRpcTrouble(200, { code: -32000, message: "too many requests" }), true);
  assert.equal(isRpcTrouble(200, { code: 3, message: "execution reverted", data: "0x1eea0f93" }), false);
  assert.equal(isRpcTrouble(200, { code: -32000, message: "execution reverted" }), false);
});

test("POST 는 이 서버의 화면에서 온 요청만 받는다", () => {
  const port = 5175;
  assert.equal(allowedRequest({ method: "POST", host: "127.0.0.1:5175", origin: "http://127.0.0.1:5175" }, port), true);
  assert.equal(allowedRequest({ method: "POST", host: "localhost:5175", origin: "http://localhost:5175" }, port), true);
  assert.equal(allowedRequest({ method: "POST", host: "127.0.0.1:5175", origin: undefined }, port), true); // curl 같은 도구
  assert.equal(allowedRequest({ method: "POST", host: "127.0.0.1:5175", origin: "https://evil.example" }, port), false);
  assert.equal(allowedRequest({ method: "POST", host: "evil.example:5175", origin: "http://evil.example:5175" }, port), false); // DNS 리바인딩
  assert.equal(allowedRequest({ method: "GET", host: "evil.example:5175", origin: undefined }, port), false);
  assert.equal(allowedRequest({ method: "GET", host: "127.0.0.1:5175", origin: undefined }, port), true);
});

test("가스 한도 입력은 비우거나 양의 정수만 받는다", () => {
  assert.equal(parseGas(undefined), undefined);
  assert.equal(parseGas("  "), undefined);
  assert.equal(parseGas("60,000"), 60_000n);
  assert.equal(parseGas("abc"), null);
  assert.equal(parseGas("0"), null);
  assert.equal(parseGas("1.5"), null);
});

test("확인 중이던 결제가 블록에 들어가지 않았으면 보내지 않음으로 쓰고, 사전 검사 RPC 문제는 이유를 쓴다", () => {
  const d = messageFor({ status: "dropped", tx: "0xab" });
  assert.equal(d.stamp, "보내지 않음");
  assert.match(d.body, /나가지 않았어요/);
  assert.equal(d.next?.action, "retry");
  const n = messageFor({ status: "network", detail: "HTTP 429" });
  assert.match(n.body, /HTTP 429/);
});

test("되돌려진 결제의 사유를 읽지 못해도 실패 전표를 쓴다", () => {
  const m = messageFor({ status: "failed", tx: "0xab", fee: 10n ** 15n });
  assert.equal(m.stamp, "실패");
  assert.match(m.body, /pnpm explain/);
});
