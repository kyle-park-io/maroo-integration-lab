// 워크숍 스모크 테스트. 진행자가 워크숍 전에 깨끗한 클론에서 실행해 전체 경로를 확인한다.
//
//   pnpm b:smoke
//
// b:check, 1단계, 3단계, 4단계, 5단계를 멈춤 없이 차례로 실행하고 성공 기준을 확인한다.
// 구매 기업 잔액이 1,000 OKRW 이상이면 2단계(테스트넷 tx)도 실행한다.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { formatEther, parseEther } from "viem";
import { ROOT } from "../../shared/lib/paths.ts";
import { addressOf, publicClient as pub } from "../../shared/lib/maroo.ts";
import { LIVE_DIR, LOCAL_DIR, newest } from "./lib.ts";

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
const started = Date.now();

function run(name: string, args: string[]) {
  console.log(`\n▶ ${name}: node ${args.join(" ")}`);
  const r = spawnSync("node", args, { cwd: ROOT, stdio: "inherit", env: { ...process.env, B_NO_PAUSE: "1" } });
  checks.push({ name, ok: r.status === 0, detail: `종료 코드 ${r.status}` });
  return r.status === 0;
}

run("b:check", ["track-b-enable/demo/check.ts"]);
run("1단계", ["track-b-enable/demo/step.ts", "1"]);
const bal = await pub.getBalance({ address: addressOf("BUYER") });
if (bal >= parseEther("1000")) {
  if (run("2단계", ["track-b-enable/demo/step.ts", "2"])) {
    const g = JSON.parse(fs.readFileSync(newest(LIVE_DIR, "pcl-kyb-gate-")!, "utf8")) as { steps: { step: string; result?: string }[] };
    const want: Record<string, string> = { "5)": "예상대로 거부", "6b)": "예상대로 거부", "6d)": "성공", "7c)": "예상대로 거부" };
    for (const [prefix, result] of Object.entries(want)) {
      const s = g.steps.find((x) => x.step.startsWith(prefix) && x.result);
      checks.push({ name: `2단계 ${prefix}`, ok: s?.result === result, detail: s?.result ?? "기록 없음" });
    }
  }
} else {
  checks.push({ name: "2단계", ok: true, detail: `건너뜀: 구매 기업 잔액 ${formatEther(bal)} OKRW` });
}
if (run("3단계", ["track-b-enable/demo/step.ts", "3"])) {
  const md = fs.readFileSync(newest(LOCAL_DIR, "vendor-settlement-")!, "utf8");
  checks.push({ name: "3단계 협력사 B 해독", ok: /협력사 B \| B 지급 tx의 수신자 disclosure \| verified=true/.test(md), detail: "기록 2절" });
  checks.push({ name: "3단계 인출 성공", ok: /0 노트 예치와 같은 블록 \| `[0-9A-F]+` \| \d+ \| 성공/.test(md), detail: "기록 1절" });
}
if (run("4단계", ["track-b-enable/demo/step.ts", "4"])) {
  const d = JSON.parse(fs.readFileSync(newest(LIVE_DIR, "step4-diagnose-")!, "utf8")) as { rows: { class: string }[] };
  const classes = new Set(d.rows.map((r) => r.class));
  for (const c of ["증명·입력 거부", "인프라·자료 부재"]) checks.push({ name: `4단계 분류 ${c}`, ok: classes.has(c), detail: [...classes].join(", ") });
}
run("5단계", ["track-b-enable/demo/step.ts", "5"]);

console.log("\n스모크 테스트 결과");
for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name.padEnd(24)} ${c.detail}`);
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${failed ? `실패 ${failed}건` : "모두 통과"}. ${Math.round((Date.now() - started) / 1000)}초`);
process.exit(failed ? 1 : 0);
