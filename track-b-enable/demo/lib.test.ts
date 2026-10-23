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
