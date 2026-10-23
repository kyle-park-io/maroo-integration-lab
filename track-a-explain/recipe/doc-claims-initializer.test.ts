// a:doc-claims 4번(deployPclProxy 의 빈 초기화 데이터) 판정 함수의 단위 테스트. 문서 사이트를 부르지 않는다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { initializerClaims } from "./doc-claims-initializer.ts";

test("2026-09-26 판 문장은 초기화가 필요 없으면 0x 를 넘기라고 안내한다", () => {
  const text = 'initializer 는 배포 이후 로직 컨트랙트에 대해 실행할 calldata이며, 초기화가 필요 없으면 "0x" 를 전달합니다.';
  assert.deepEqual(initializerClaims(text), { docsSaysPass0x: true, docsSaysCannotBeEmpty: false });
});

test("2026-10-23 판 문장은 빈 초기화 데이터가 되돌려진다고 적는다", () => {
  const text = 'Transparent와 UUPS에서는 initializer 를 비워 둘 수 없습니다. // with initializer "0x" the proxy constructor reverts, and so does deployPclProxy.';
  assert.deepEqual(initializerClaims(text), { docsSaysPass0x: false, docsSaysCannotBeEmpty: true });
});
