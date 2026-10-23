// 워크샵 4단계 결과 분류(classify.ts) 단위 테스트. 체인 호출 없음.
// 거부 해석기(shared/lib/explain.ts)의 계열을 B 트랙 목표의 네 분류로 옮긴다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryOf } from "./classify.ts";

test("통과는 성공", () => assert.equal(categoryOf(undefined), "성공"));

test("PCL 정책 위반은 정책 거부", () => assert.equal(categoryOf("pcl-policy"), "정책 거부"));

test("요청, 증명, 호출 내용이 막은 것은 증명·입력 거부", () => {
  for (const f of ["sdk", "privacy", "precompile-input", "contract", "error-string", "panic", "out-of-gas", "tx-level", "pcl-config"] as const) {
    assert.equal(categoryOf(f), "증명·입력 거부", f);
  }
});

test("잔액, 자료, 해석할 ABI 가 없는 것은 인프라·자료 부재", () => {
  for (const f of ["node-check", "no-data", "unknown"] as const) assert.equal(categoryOf(f), "인프라·자료 부재", f);
});
