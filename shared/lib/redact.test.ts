// 비공개 주소 가리기(redact.ts) 단위 테스트. 체인 호출 없음.

import { test } from "node:test";
import assert from "node:assert/strict";
import { bech32Encode, redactAddress } from "./redact.ts";

const ADDR = "0x1234567890AbcdEF1234567890aBcdef12345678";

test("16진 주소는 대소문자, 0x, 32바이트 패딩과 상관없이 가린다", () => {
  const padded = "0x000000000000000000000000" + ADDR.slice(2).toLowerCase();
  const text = `EasNoAttestationReceived(${ADDR}) data ${padded} lower ${ADDR.toLowerCase()}`;
  const out = redactAddress(text, ADDR);
  assert.doesNotMatch(out, /1234567890abcdef1234567890abcdef12345678/i);
  assert.match(out, /EasNoAttestationReceived\(\(비공개\)\)/);
});

test("bech32 주소도 접두사와 상관없이 가리고, 다른 주소는 그대로 둔다", () => {
  const mine = bech32Encode("maroo", ADDR);
  const other = bech32Encode("maroo", "0x0000000000000000000000000000000000000001");
  const out = redactAddress(`sender ${mine} is not ${other}; cosmos ${bech32Encode("cosmos", ADDR)}`, ADDR);
  assert.doesNotMatch(out, new RegExp(mine));
  assert.match(out, new RegExp(other));
  assert.equal((out.match(/\(비공개\)/g) ?? []).length, 2);
});
