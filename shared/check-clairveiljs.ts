// ClairveilJS(TypeScript SDK) 자체 검사를 돌려 결과를 남긴다. 코드 대조(체인 호출 없음)
//
//   pnpm setup:clairveil     # vendor/clairveiljs 를 고정 커밋으로 받는다
//   pnpm sdk:check
//
// vendor/clairveiljs 에서 의존성을 설치하고(npm ci), 세 가지를 돌린다. 코드는 고치지 않는다.
//   verify:evm-contract          SDK 의 EVM 어댑터가 정식 EVM Privacy 계약 v0.3.1 과 같은지
//   test:unit                    단위 테스트(conformance fixture 가 필요한 것은 SDK 설정대로 건너뜀)
//   test:conformance:required    Go 로 만든 Clairveil fixture 와의 대조(fixture 가 없으면 실패)
// 통과는 SDK 가 Clairveil fixture 와 맞는다는 뜻이다. Maroo 테스트넷 호환의 근거로 쓰지 않는다.
// 결과는 track-a-explain/evidence/code/clairveiljs-tests-<시각>.json 에 남긴다.
// 종료 코드: 설명되지 않는 실패가 있으면 1. 아래 KNOWN 의 환경 원인 실패와, 단독으로 다시 돌려 통과한 테스트는 실패로 세지 않고 따로 적는다.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/paths.ts";
import { writeEvidence } from "./lib/maroo.ts";

const dir = path.join(ROOT, "vendor/clairveiljs");
if (!fs.existsSync(path.join(dir, "package.json"))) {
  console.log("vendor/clairveiljs 가 없습니다. 먼저 pnpm setup:clairveil 을 실행하십시오.");
  process.exit(1);
}
// 이 환경에서 원인을 확인한 실패. SDK 결함이 아니라 테스트의 전제가 이 런타임과 맞지 않는 경우만 둔다.
const KNOWN: Record<string, string> = {
  "indexeddb reservation store requires web locks unless explicitly scoped to single-tab":
    "Node 24 에 navigator.locks 가 있어 '웹 락이 없는 환경'이라는 테스트 전제가 맞지 않음",
};

const git = (args: string[]) => spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" }).stdout.trim();

function run(label: string, args: string[]) {
  const started = Date.now();
  const r = spawnSync("npm", args, { cwd: dir, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  const out = `${r.stdout}\n${r.stderr}`;
  // node --test 의 spec 보고서 요약 줄(ℹ tests 113 등)을 읽는다
  const count = (k: string) => Number(out.match(new RegExp(`ℹ ${k} (\\d+)`))?.[1] ?? NaN);
  const failed = [...out.matchAll(/^✖ (.+?) \(\d/gm)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i);
  const row = {
    label, command: `npm ${args.join(" ")}`, exitCode: r.status, seconds: Math.round((Date.now() - started) / 1000),
    tests: count("tests"), pass: count("pass"), fail: count("fail"), skipped: count("skipped"), failedTests: failed,
    lastLine: out.trim().split("\n").filter(Boolean).slice(-1)[0] ?? "",
  };
  console.log(`${r.status === 0 ? "✓" : "✗"} ${label.padEnd(28)} ${Number.isNaN(row.tests) ? row.lastLine : `${row.pass}/${row.tests} 통과, 실패 ${row.fail}, 건너뜀 ${row.skipped}`} (${row.seconds}초)`);
  for (const f of failed) console.log(`    실패: ${f}`);
  return row;
}

const install = run("npm ci", ["ci", "--no-audit", "--no-fund"]);
// 설치가 실패하면 뒤의 테스트 실패는 SDK 문제가 아니라 설치 문제라서 기록하지 않고 멈춘다.
if (install.exitCode !== 0) {
  console.log(`npm ci 가 실패했습니다(종료 코드 ${install.exitCode}). 네트워크와 vendor/clairveiljs/package-lock.json 을 확인한 뒤 다시 실행하십시오.`);
  process.exit(1);
}
const results = [
  run("verify:evm-contract", ["run", "-s", "verify:evm-contract"]),
  run("test:unit", ["run", "-s", "test:unit"]),
  run("test:conformance:required", ["run", "-s", "test:conformance:required"]),
];
// test:unit 의 실패 가운데 KNOWN 이 아닌 것은 한 번 단독으로 다시 돌린다. 전체 실행 부하에서만 시간 제한에 걸리는 테스트를 가려낸다.
const unit = results.find((r) => r.label === "test:unit")!;
const rerun = unit.failedTests.filter((t) => !KNOWN[t]).map((name) => {
  const pattern = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const r = spawnSync("node", ["--import", "./tools/skip-conformance-fixtures.js", "--test", `--test-name-pattern=${pattern}`, "--test-concurrency=1", "test/*.test.js"], { cwd: dir, encoding: "utf8" });
  const passed = r.status === 0;
  console.log(`    ${passed ? "단독 재실행 통과" : "단독 재실행도 실패"}: ${name}`);
  return { name, passed };
});
for (const t of unit.failedTests.filter((t) => KNOWN[t])) console.log(`    알려진 실패: ${t} (${KNOWN[t]})`);
const unexplained = [
  ...results.filter((r) => r.label !== "test:unit" && r.exitCode !== 0).map((r) => r.label),
  ...rerun.filter((r) => !r.passed).map((r) => r.name),
  ...(unit.exitCode !== 0 && !unit.failedTests.length ? ["test:unit(실패 이름을 읽지 못함)"] : []),
];

const file = writeEvidence(path.join(ROOT, "track-a-explain/evidence/code"), "clairveiljs-tests", {
  checkedAt: new Date().toISOString(),
  label: "코드 대조(체인 호출 없음). SDK 가 Clairveil fixture 와 맞는지. Maroo 호환 근거 아님",
  clairveiljs: { commit: git(["rev-parse", "HEAD"]), describe: git(["describe", "--tags", "--always"]), vendorClean: git(["status", "--porcelain"]) === "" },
  node: process.version, install: { exitCode: install.exitCode, seconds: install.seconds }, results,
  knownFailures: unit.failedTests.filter((t) => KNOWN[t]).map((t) => ({ name: t, reason: KNOWN[t] })), rerun, unexplained,
});
console.log(`기록: ${path.relative(ROOT, file)}`);
console.log(unexplained.length ? `설명되지 않는 실패 ${unexplained.length}개: ${unexplained.join(", ")}` : "설명되지 않는 실패 없음");
process.exit(unexplained.length ? 1 : 0);
