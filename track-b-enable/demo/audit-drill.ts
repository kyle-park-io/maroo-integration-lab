// 선택 연습: 통제된 열람. [Local] 3단계(pnpm b:step 3) 뒤에 한다. 키와 테스트넷 OKRW 가 없어도 된다.
//
//   pnpm b:audit-drill                           규제기관의 요청을 읽고, 외부감사인으로서 승인할지 정한다
//   pnpm b:audit-drill --narrow                  사건 대상 한 건만 담은 요청으로 다시 한다
//   pnpm b:audit-drill --decide approve|reject   묻지 않고 정한다(비대화 실행, 스모크 테스트)
//
// 감사 키를 내부 감사팀, 외부감사인, 규제기관의 2-of-3 몫으로 나누고, 요청한 역할을 뺀 두 역할이 승인해야 연다.
// 기본 요청은 협력사 B 지급 한 건을 묻는 사건에 협력사 A 일괄 지급 두 건까지 대상으로 넣었다. 승인할지는 참가자가 정한다.
// 진행자의 답변 방향은 track-b-enable/facilitator-guide.md 의 선택 연습 절에 있다. 기록은 track-b-enable/evidence/local/ 에 남는다.

import path from "node:path";
import readline from "node:readline/promises";
import { ROOT } from "../../shared/lib/paths.ts";
import { writeEvidence } from "../../shared/lib/maroo.ts";
import { latestRunDir, runLocalAccess } from "../../shared/lib/audit-access-flow.ts";
import { LOCAL_DIR, announce, noPause, pause } from "./lib.ts";

const argv = process.argv.slice(2);
const scenario = argv.includes("--narrow") ? "narrow" : "wide";
const given = argv.includes("--decide") ? argv[argv.indexOf("--decide") + 1] : undefined;
if (given && given !== "approve" && given !== "reject") {
  console.log("--decide 에는 approve 나 reject 를 적으십시오.");
  process.exit(2);
}

async function ask(): Promise<"approve" | "reject"> {
  if (given) return given as "approve" | "reject";
  if (noPause) {
    console.log("   비대화 실행이라 거절로 정합니다. 승인하려면 --decide approve 를 붙이십시오.");
    return "reject";
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  for (;;) {
    const a = (await rl.question("   외부감사인으로서 이 요청을 승인하시겠습니까? 승인은 y, 거절은 n 을 입력하십시오: ")).trim().toLowerCase();
    if (a === "y" || a === "n") { rl.close(); return a === "y" ? "approve" : "reject"; }
  }
}

announce("선택 연습", {
  title: "통제된 열람 [Local]",
  expect: "감사 키 몫 셋, 규제기관의 요청 한 건, 내부 감사팀의 승인, 외부감사인(참가자)의 판단",
  success: "요청 범위가 사건과 맞는지 근거를 들어 승인 또는 거절하고, 승인하면 무엇이 열리는지 설명할 수 있음",
});
await pause();

const runDir = latestRunDir("pnpm b:step 3");
const caseDir = path.join(ROOT, ".work/audit-drill", new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"));
const decisions: Partial<Record<"audit-team" | "external-auditor" | "regulator", "approve" | "reject">> = {};
const r = await runLocalAccess({
  runDir, caseDir, scenario, decisions,
  beforeStage: async (n) => {
    if (n === 3) {
      console.log("\n   요청을 읽고 사건 설명과 대상 tx 가 맞는지 확인하십시오. 다음 단계에서 외부감사인으로 답합니다.");
      await pause();
    }
    if (n === 4) decisions["external-auditor"] = await ask();
  },
});

const opened = (r.opened?.results ?? []) as { label: string }[];
console.log("\n되짚기");
console.log(`  요청 대상 ${r.request.targets.length}건 가운데 열린 감사 공개: ${opened.length ? opened.map((o) => o.label).join(", ") : "없음"}`);
console.log("  1. 사건 설명(협력사 B 지급 한 건)과 요청 대상이 맞았습니까? 맞지 않았다면 어느 대상이 넘쳤습니까?");
console.log("  2. 승인했다면 사건과 상관없는 협력사의 금액과 주소가 누구에게 보였습니까?");
console.log("  3. 거절했다면 규제기관은 무엇을 고쳐 다시 요청해야 합니까? pnpm b:audit-drill --narrow 로 확인합니다.");

const file = writeEvidence(LOCAL_DIR, "audit-drill", {
  label: "[Local] Clairveil 로컬 체인의 감사 공개. 체인 기록 없음",
  checkedAt: new Date().toISOString(), scenario, decision: decisions["external-auditor"],
  runDir: path.relative(ROOT, runDir), request: r.request, requestHash: r.requestHash, approvals: r.approvals,
  decisionResult: r.decision, checks: r.checks, opened: opened.map((o) => o.label),
});
console.log(`\n기록: ${path.relative(ROOT, file)}`);
