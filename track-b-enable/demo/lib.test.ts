// 워크샵 실행기 공용 도구(lib.ts) 단위 테스트. 체인 호출 없음. 마지막 테스트만 닫힌 포트를 RPC 로 두고 4단계를 실제로 띄운다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { ROOT } from "../../shared/lib/paths.ts";
import { troubleFor } from "./lib.ts";

test("실행기가 멈춘 이유를 트러블슈팅 번호로 옮긴다", () => {
  assert.equal(troubleFor({ kind: "network", reason: "", next: "" }), "T5");
  assert.equal(troubleFor({ kind: "balance", reason: "", next: "" }), "T7");
  assert.equal(troubleFor({ kind: "wallet", reason: "", next: "" }), "T6");
  assert.equal(troubleFor({ kind: "other", reason: "", next: "" }), undefined);
});

test("4단계가 RPC 에 닿지 않으면 스택 대신 이유와 T5 를 보인다", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "b-step4-"));
  const r = spawnSync("node", [path.join(ROOT, "track-b-enable/demo/step.ts"), "4", "--no-pause"], {
    cwd: ROOT, encoding: "utf8", timeout: 60_000,
    env: { ...process.env, MAROO_RPC_URL: "http://127.0.0.1:9", MAROO_REST_URL: "http://127.0.0.1:9", MAROO_LAB_OUT: path.relative(ROOT, out) },
  });
  const text = `${r.stdout}${r.stderr}`;
  assert.notEqual(r.status, 0);
  assert.doesNotMatch(text, /^\s+at /m, text.slice(-600));
  assert.match(text, /T5|T6/, text.slice(-600));
  fs.rmSync(out, { recursive: true, force: true });
});

import { renderSmokeReport } from "./lib.ts";

test("스모크 테스트 기록은 확인마다 결과와 걸린 시간을 남긴다", () => {
  const md = renderSmokeReport([{ name: "1단계", ok: true, detail: "종료 코드 0" }, { name: "2단계 5)", ok: false, detail: "통과" }], 108, "20261023T071723Z");
  assert.match(md, /^# /m);
  assert.match(md, /걸린 시간: 108초/);
  assert.match(md, /\| 1단계 \| ✓ \| 종료 코드 0 \|/);
  assert.match(md, /실패 1건/);
});

import { fundStep, parseTargets, precheckOutcome, sendOutcome } from "./lib.ts";

const A1 = "0x149bfA768558adEdDb5cBDFF2C7780CCEf2cf2cE";
const A2 = "0xD919E7d9C23Efc25929516D8391b2C74a07C575e";

test("b:fund 주소 목록에서 주소가 아닌 값과 두 번 적힌 주소를 가려낸다", () => {
  const r = parseTargets([A1, A1.toLowerCase(), "0x1234", A2, "0x149bfa768558adeddb5cbdff2c7780ccef2cf2cE"]);
  assert.deepEqual(r.targets, [A1, A2]);
  assert.deepEqual(r.duplicates, [A1]);
  assert.deepEqual(r.invalid, ["0x1234", "0x149bfa768558adeddb5cbdff2c7780ccef2cf2cE"]);
});

test("b:fund 는 이미 받은 주소를 건너뛰고, 진행자 잔액이 금액과 수수료 상한보다 적으면 멈춘다", () => {
  const e = 10n ** 18n;
  assert.equal(fundStep({ targetBalance: 1000n * e, amount: 1000n * e, ownBalance: 0n, feeCap: e }), "skip");
  assert.equal(fundStep({ targetBalance: 0n, amount: 1000n * e, ownBalance: 1001n * e, feeCap: e }), "send");
  assert.equal(fundStep({ targetBalance: 0n, amount: 1000n * e, ownBalance: 1000n * e, feeCap: e }), "short");
});

test("b:fund 보내기 오류를 노드에 닿지 않음, 잔액 부족, 받았는지 모름으로 나눈다", () => {
  assert.equal(sendOutcome("HTTP request failed. Details: fetch failed connect ECONNREFUSED 127.0.0.1:8546"), "not-sent");
  assert.equal(sendOutcome("insufficient funds for gas * price + value: balance 5, tx cost 10"), "no-funds");
  assert.equal(sendOutcome("HTTP request failed. Details: fetch failed other side closed"), "unknown");
  assert.equal(sendOutcome("socket hang up"), "unknown");
  assert.equal(sendOutcome("The request took too long to respond."), "unknown");
  assert.equal(sendOutcome("already known"), "unknown");
  assert.equal(sendOutcome("nonce too low: next nonce 5, tx nonce 4"), "unknown");
  assert.equal(sendOutcome("replacement transaction underpriced"), "unknown");
  assert.equal(sendOutcome("invalid chain id for signer"), "not-sent");
});

test("b:fund 사전 검사 응답을 통과, 정책 거부, 진행자 잔액 부족, RPC 문제로 나눈다", () => {
  assert.deepEqual(precheckOutcome(200, '{"jsonrpc":"2.0","id":1,"result":"0x19640"}'), { kind: "ok", gas: 104000n });
  assert.equal(precheckOutcome(429, "rate limited").kind, "rpc");
  assert.equal(precheckOutcome(200, "<html>bad gateway</html>").kind, "rpc");
  assert.equal(precheckOutcome(200, '{"error":{"code":3,"message":"execution reverted","data":"0x1b8b0e1a00"}}').kind, "rejected");
  assert.equal(precheckOutcome(200, '{"error":{"code":-32000,"message":"execution reverted"}}').kind, "rejected");
  assert.equal(precheckOutcome(200, '{"error":{"code":-32000,"message":"insufficient funds for transfer"}}').kind, "no-funds");
  assert.equal(precheckOutcome(200, '{"error":{"code":-32005,"message":"rate limit exceeded"}}').kind, "rpc");
});

test("b:fund 는 주소가 아닌 값이 있으면 한 건도 보내지 않고 그 값을 보인다", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "b-fund-"));
  const list = path.join(dir, "participants.txt");
  fs.writeFileSync(list, `${A1}\n0x12345\n`);
  const r = spawnSync("node", [path.join(ROOT, "track-b-enable/demo/fund.ts"), "--file", list, "--amount", "1"], {
    cwd: ROOT, encoding: "utf8", timeout: 60_000,
    env: { ...process.env, MAROO_RPC_URL: "http://127.0.0.1:9", MAROO_LAB_OUT: path.relative(ROOT, dir) },
  });
  const text = `${r.stdout}${r.stderr}`;
  assert.equal(r.status, 2, text.slice(-600));
  assert.match(text, /0x12345/);
  assert.doesNotMatch(text, /^\s+at /m, text.slice(-600));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("b:fund 가 RPC 에 닿지 않으면 스택 대신 이유와 T5 를 보인다", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "b-fund-"));
  const r = spawnSync("node", [path.join(ROOT, "track-b-enable/demo/fund.ts"), A1, "--amount", "1"], {
    cwd: ROOT, encoding: "utf8", timeout: 60_000,
    env: { ...process.env, MAROO_RPC_URL: "http://127.0.0.1:9", MAROO_LAB_OUT: path.relative(ROOT, dir),
      BUYER_ADDRESS: A2, BUYER_PRIVATE_KEY: `0x${"11".repeat(32)}` },
  });
  const text = `${r.stdout}${r.stderr}`;
  assert.equal(r.status, 1, text.slice(-600));
  assert.match(text, /T5/, text.slice(-600));
  assert.doesNotMatch(text, /^\s+at /m, text.slice(-600));
  fs.rmSync(dir, { recursive: true, force: true });
});
