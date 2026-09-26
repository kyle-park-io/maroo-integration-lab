// 워크샵 4단계 결과 분류(classify.ts) 단위 테스트. 체인 호출 없음.

import { test } from "node:test";
import assert from "node:assert/strict";
import { classify } from "./classify.ts";

test("통과는 성공", () => assert.equal(classify("통과"), "성공"));

test("PCL 사유 코드는 정책 거부", () => {
  for (const r of [
    "EasNoAttestationReceived(0x77172C4999b59967a35A7efd079B7B92fA8E5c0A)", "EasAttestationRevoked(0x1)", "AnyOfRejected(0x…)",
    "ExceededPeriodicVolume(1, 2, 3)", "ExceededAgentTransferLimit(5, 8)", "InDenylist(0x1)", "VolumeAboveMax(1, 2)",
    "AgentTransferLimitMetadataInvalid(expected 32-byte uint256, got 19 bytes)",
  ]) assert.equal(classify(r), "정책 거부", r);
});

test("요청과 증명 형식 오류는 증명·입력 거부", () => {
  for (const r of ["SDKInvalidRequest()", "PrivacyNativeDenomMismatch(aokrw, atokrw)", "InvalidAmount()", "InvalidAddress(0x)"]) {
    assert.equal(classify(r), "증명·입력 거부", r);
  }
});

test("잔액, 서비스, 자료가 없는 경우는 인프라·자료 부재", () => {
  for (const r of ["insufficient balance for transfer", "공개되지 않은 증명 재료", "fetch failed", ""]) {
    assert.equal(classify(r), "인프라·자료 부재", r);
  }
});

test("사유 이름이 문장 중간에 있으면 정책 거부로 보지 않는다", () => {
  assert.equal(classify("simulate: EasNoAttestationReceived(0x1)"), "인프라·자료 부재");
});
