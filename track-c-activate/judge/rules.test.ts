// 심사 판정 규칙(rules.ts) 단위 테스트. 체인 호출 없음.

import { test } from "node:test";
import assert from "node:assert/strict";
import { judge, type Checked } from "./rules.ts";

const v = (requirement: string, over: Partial<Checked> & { expected?: string; actual?: string } = {}): Checked => ({
  requirement, label: "[Live Testnet]", ok: true, checks: [], value: 0n, policies: "",
  ...over, item: { requirement, label: "[Live Testnet]", expected: over.expected, actual: over.actual },
});
const okIds = (track: number, vs: Checked[]) => judge(track, vs).filter((r) => r.ok).map((r) => r.id);

test("트랙 1 R3은 같은 요건에 거부와 통과가 모두 있어야 한다", () => {
  assert.deepEqual(okIds(1, [v("R3", { expected: "PCL 거부" })]), []);
  assert.deepEqual(okIds(1, [v("R3", { expected: "PCL 거부" }), v("R3", { expected: "통과" })]), ["R3"]);
  assert.deepEqual(okIds(1, [v("R3", { expected: "PCL 거부" }), v("R3", { expected: "통과", ok: false })]), []);
});

test("트랙 1 R4는 value 가 있는 성공 tx, R5는 로컬 재현 확인도 받는다", () => {
  assert.deepEqual(okIds(1, [v("R4", { value: 0n })]), []);
  assert.deepEqual(okIds(1, [v("R4", { value: 1n }), v("R5", { ok: "재현 확인" })]), ["R4", "R5"]);
  assert.deepEqual(okIds(1, [v("R5", { ok: false })]), []);
});

test("트랙 1 R1·R2는 로컬 재현 확인은 받고, 확인에 실패한 항목은 세지 않는다", () => {
  assert.deepEqual(okIds(1, [v("R1", { ok: "재현 확인" }), v("R2", { ok: "재현 확인" })]), ["R1", "R2"]);
  assert.deepEqual(okIds(1, [v("R1", { ok: false }), v("R2", { ok: false })]), []);
});

test("트랙 2 R4는 ExceededAgentTransferLimit 사유만 인정한다", () => {
  assert.deepEqual(okIds(2, [v("R4", { reason: "EasNoAttestationReceived(0x1)" })]), []);
  assert.deepEqual(okIds(2, [v("R4", { reason: "AgentTransferLimitMetadataInvalid(empty metadata value)" })]), []);
  assert.deepEqual(okIds(2, [v("R4", { reason: "ExceededAgentTransferLimit(5, 8)" })]), ["R4"]);
  assert.deepEqual(okIds(2, [v("R4", { actual: "ExceededAgentTransferLimit(5, 8)" })]), ["R4"]);
});

test("트랙 2 R1~R4를 모두 채운 기록", () => {
  const vs = [v("R1"), v("R2"), v("R3", { value: 3n }), v("R4", { reason: "ExceededAgentTransferLimit(5, 8)" })];
  assert.deepEqual(okIds(2, vs), ["R1", "R2", "R3", "R4"]);
});

test("트랙 3 R4는 서로 다른 거부 사유 둘이 필요하고 인자만 다른 같은 사유는 하나로 센다", () => {
  assert.deepEqual(okIds(3, [v("R4", { reason: "EasNoAttestationReceived(0x1)" }), v("R4", { reason: "EasNoAttestationReceived(0x2)" })]), []);
  assert.deepEqual(okIds(3, [v("R4", { reason: "EasNoAttestationReceived(0x1)" }), v("R4", { reason: "EasAttestationRevoked(0x3)" })]), ["R4"]);
});

test("트랙 3 R2는 정책이 묶인 항목이 있어야 한다", () => {
  assert.deepEqual(okIds(3, [v("R3", { policies: "정책 없음" })]), []);
  assert.deepEqual(okIds(3, [v("R3", { policies: "EAS_POLICY(schema 0x3e44…)@0x4e71d92d" })]), ["R2"]);
});

test("없는 트랙은 판정 항목이 없다", () => {
  assert.deepEqual(judge(9, [v("R1")]), []);
});
