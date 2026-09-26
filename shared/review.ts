// 리뷰어용 한 번에 확인. 키와 잔액 없이 되는 경로를 차례로 돌리고 끝에 단계별 결과 표를 보인다.
//
//   pnpm review            # 20초 안팎. 테스트넷 조회만 하고 tx 는 보내지 않는다
//   pnpm review --local    # 로컬 차폐 정산까지(미리 빌드한 바이너리로 1분 안팎 더)
//
// 먼저 pnpm bootstrap 으로 준비한다. 역할 지갑 파일이 없으면 안내하고 멈춘다.
// 새 기록은 .work/review/<시각>/ 아래 레포와 같은 경로에 남기고(MAROO_LAB_OUT), 추적 중인 증거 파일은 바꾸지 않는다.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT } from "./lib/paths.ts";
import { labValue, stampNow } from "./lib/maroo.ts";

const local = process.argv.includes("--local");

if (!labValue("BUYER_ADDRESS")) {
  const file = process.env.MAROO_LAB_ENV ?? path.join(os.homedir(), ".config/maroo-integration-lab/testnet.env");
  console.log(`역할 지갑 파일이 없습니다(${file}).\n먼저 pnpm bootstrap 을 실행하십시오. 지갑만 만들려면 pnpm setup:wallets 입니다. 키는 레포 밖 그 파일에만 저장됩니다.`);
  process.exit(1);
}

type Step = { name: string; script: string; args?: string[]; summary: (out: string, ok: boolean) => string };
const lastMatch = (out: string, re: RegExp) => out.split("\n").filter((l) => re.test(l)).pop()?.trim();
const count = (out: string, re: RegExp) => out.split("\n").filter((l) => re.test(l)).length;

const STEPS: Step[] = [
  { name: "타입 검사", script: "typecheck", summary: (_, ok) => (ok ? "오류 없음" : "오류 있음") },
  { name: "금고 테스트", script: "test:contracts", summary: (o) => lastMatch(o, /Ran \d+ test suite/)?.replace(/^.*: /, "") ?? "" },
  { name: "단위 테스트", script: "test:unit", summary: (o) => `통과 ${o.match(/ℹ pass (\d+)/)?.[1] ?? "?"}, 실패 ${o.match(/ℹ fail (\d+)/)?.[1] ?? "?"}` },
  { name: "[Live Testnet] Privacy 정책과 요구 증명", script: "a:inspect", summary: (o) => lastMatch(o, /^2\) Privacy 정책/) ?? "" },
  { name: "[Live Testnet] Privacy 예치의 최초 실패 계층", script: "a:probe", summary: (o) => lastMatch(o, /empty\s+value=0\s+eth_estimateGas/)?.replace(/\s+/g, " ") ?? "" },
  { name: "[Live Testnet] C 트랙 근거 조회(tx 없음)", script: "c:grounding", summary: (o) => lastMatch(o, /register\(agentURI\) 시뮬레이션/) ?? "" },
  { name: "[Live Testnet] 심사 자동 판정 예시", script: "c:judge-example", summary: (o) => {
    const verdicts = o.split("요건별 판정")[1] ?? "";
    return `트랙 1 요건 ${count(verdicts, /^✓ R\d /)}개 통과, ${count(verdicts, /^✗ R\d /)}개 실패`;
  } },
  { name: "워크샵 사전 점검", script: "b:check", summary: (o) => lastMatch(o, /필수 항목/) ?? "" },
  ...(local ? [{ name: "[Local] 차폐 정산 전체", script: "a:local", summary: (o: string) => lastMatch(o, /^기록:/) ?? "" }] : []),
];

const stamp = stampNow();
const outDir = path.join(".work/review", stamp);
fs.mkdirSync(path.join(ROOT, outDir), { recursive: true });
const env = { ...process.env, MAROO_LAB_OUT: outDir };

const rows: { name: string; cmd: string; ok: boolean; seconds: number; summary: string; log: string }[] = [];
for (const [i, step] of STEPS.entries()) {
  const cmd = `pnpm ${step.script}${step.args ? ` ${step.args.join(" ")}` : ""}`;
  console.log(`\n[${i + 1}/${STEPS.length}] ${step.name}: ${cmd}`);
  const started = Date.now();
  const r = spawnSync("pnpm", ["-s", step.script, ...(step.args ?? [])], { cwd: ROOT, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const log = path.join(outDir, `${String(i + 1).padStart(2, "0")}-${step.script.replace(":", "-")}.log`);
  fs.writeFileSync(path.join(ROOT, log), out);
  const ok = r.status === 0;
  const seconds = Math.round((Date.now() - started) / 1000);
  for (const line of out.trim().split("\n").filter((l) => !l.startsWith("$ ")).slice(-6)) console.log(`    ${line.slice(0, 160)}`);
  rows.push({ name: step.name, cmd, ok, seconds, summary: step.summary(out, ok).slice(0, 110), log });
}

console.log("\n결과");
console.log("| 단계 | 명령 | 결과 | 시간 | 요약 |");
console.log("| --- | --- | --- | --- | --- |");
for (const r of rows) console.log(`| ${r.name} | \`${r.cmd}\` | ${r.ok ? "✓" : "✗"} | ${r.seconds}초 | ${r.summary} |`);
const passed = rows.filter((r) => r.ok).length;
console.log(`\n${rows.length}단계 가운데 ${passed}개 통과. 단계별 출력과 새 기록: ${outDir}/`);
for (const r of rows.filter((x) => !x.ok)) console.log(`  ✗ ${r.name}: ${r.log} 를 보십시오`);
process.exit(passed === rows.length ? 0 : 1);
