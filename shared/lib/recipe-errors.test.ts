// 레시피 명령의 실패를 이유와 다음 할 일로 바꾸는 함수(recipe-errors.ts)의 단위 테스트. 체인 호출 없음.

import { test } from "node:test";
import assert from "node:assert/strict";
import { explainFailure } from "./recipe-errors.ts";

const RPC = "https://rpc-testnet.maroo.io";

test("RPC 에 닿지 않으면 연결 실패와 주소를 바꾸는 법을 알린다", () => {
  const err = new TypeError("fetch failed", { cause: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:9"), { code: "ECONNREFUSED" }) });
  const f = explainFailure(err, { rpc: RPC });
  assert.equal(f.kind, "network");
  assert.ok(f.reason.includes(RPC), f.reason);
  assert.ok(f.next.includes("MAROO_RPC_URL"), f.next);
});

test("viem 의 HTTP 요청 실패도 연결 실패로 본다", () => {
  const err = Object.assign(new Error("HTTP request failed.\n\nURL: http://127.0.0.1:9\nDetails: fetch failed"), { name: "HttpRequestError" });
  assert.equal(explainFailure(err, { rpc: RPC }).kind, "network");
});

test("잔액 부족은 받는 방법을 알린다", () => {
  const err = new Error("rpc error: code = Unknown desc = insufficient balance for transfer");
  const f = explainFailure(err, { rpc: RPC });
  assert.equal(f.kind, "balance");
  assert.ok(f.next.includes("faucet"), f.next);
});

test("레시피가 직접 던진 잔액 부족 문장은 그 문장을 이유로 쓴다", () => {
  const err = new Error("구매 기업 잔액이 부족합니다(0.0 OKRW). 280 OKRW 이상 받은 뒤 다시 실행하십시오.");
  const f = explainFailure(err, { rpc: RPC });
  assert.equal(f.kind, "balance");
  assert.equal(f.reason, "구매 기업 잔액이 부족합니다(0.0 OKRW). 280 OKRW 이상 받은 뒤 다시 실행하십시오.");
});

test("지갑 파일이 없으면 지갑을 만드는 명령을 알린다", () => {
  const f = explainFailure(new Error("BUYER_ADDRESS 가 없습니다. /tmp/x.env 를 확인하십시오."), { rpc: RPC });
  assert.equal(f.kind, "wallet");
  assert.ok(f.next.includes("pnpm setup:wallets"), f.next);
});

test("모르는 오류는 첫 줄만 이유로 쓰고 전체 오류를 보는 법을 알린다", () => {
  const f = explainFailure(new Error("첫 줄\n    at foo (bar.ts:1:1)"), { rpc: RPC });
  assert.equal(f.kind, "other");
  assert.equal(f.reason, "첫 줄");
  assert.ok(f.next.includes("DEBUG=1"), f.next);
});

test("레시피가 할 일까지 적은 오류는 그 안내를 따르라고 한다", () => {
  const f = explainFailure(new Error("구매 기업이 소유한 에이전트가 없습니다. pnpm c:grounding --write 로 먼저 등록하십시오."), { rpc: RPC });
  assert.equal(f.kind, "guided");
  assert.equal(f.next, "위 안내대로 한 뒤 같은 명령을 다시 실행합니다.");
});
