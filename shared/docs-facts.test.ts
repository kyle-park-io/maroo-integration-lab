// 문서에 적은 숫자가 레포와 기록에서 센 값과 같은지 확인한다. 체인 호출 없음.
// 같은 사실을 여러 문서에 적다 보니 하나만 고치고 나머지를 놓친 일이 있었다(2026-10-15 대조에서 넷).
// 셀 수 있는 값은 레포에서 세고, 측정값은 커밋된 기록 파일을 정본으로 삼는다.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "./lib/paths.ts";

const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const trackedMarkdown = () =>
  execFileSync("git", ["ls-files", "*.md"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter((f) => f && !f.startsWith("vendor/"));
const countHeadings = (p: string, re: RegExp) => read(p).split("\n").filter((l) => re.test(l)).length;

// 문서의 한 문장에서 숫자를 꺼낸다. 문장이 없으면 실패한다.
function numberIn(p: string, re: RegExp): number[] {
  const m = read(p).match(re);
  assert.ok(m, `${p} 에서 ${re} 를 찾지 못했습니다`);
  return m.slice(1).map((x) => Number(x));
}

// 마크다운 표에서 머리 행이 주어진 글로 시작하는 표의 본문 행
function tableRows(p: string, header: string): string[][] {
  const lines = read(p).split("\n");
  const i = lines.findIndex((l) => l.startsWith(header));
  assert.ok(i >= 0, `${p} 에서 머리 행 ${header} 를 찾지 못했습니다`);
  const rows: string[][] = [];
  for (const l of lines.slice(i + 2)) {
    if (!l.startsWith("|")) break;
    rows.push(l.split("|").slice(1, -1).map((c) => c.trim()));
  }
  return rows;
}

test("Mermaid 그림 수와 렌더링 횟수가 검증 표와 같다", () => {
  const blocks = trackedMarkdown().reduce((n, f) => n + (read(f).match(/^```mermaid$/gm)?.length ?? 0), 0);
  assert.deepEqual(numberIn("SUBMISSION_NOTES.md", /Mermaid (\d+)개를 두 테마로 (\d+)번/), [blocks, blocks * 2]);
});

test("a:* 명령 수가 A 트랙 README 와 같고, 레시피 문서가 명령을 모두 다룬다", () => {
  const scripts = Object.keys(JSON.parse(read("package.json")).scripts).filter((k) => k.startsWith("a:"));
  assert.deepEqual(numberIn("track-a-explain/README.md", /`pnpm a:\*` 명령 (\d+)개/), [scripts.length]);
  const recipe = read("track-a-explain/runnable-recipe.md");
  for (const s of scripts) assert.ok(recipe.includes(`pnpm ${s}\``), `runnable-recipe.md 에 pnpm ${s} 가 없습니다`);
});

test("README 첫 화면의 FAQ, 문서 개선 노트, 트러블슈팅 개수가 문서와 같다", () => {
  assert.deepEqual(numberIn("README.md", /\[기관 FAQ\]\(track-a-explain\/faq\.md\) (\d+)개/), [countHeadings("track-a-explain/faq.md", /^## \d+\./)]);
  assert.deepEqual(numberIn("README.md", /\[문서 개선 노트\]\(track-a-explain\/documentation-improvement-notes\.md\) (\d+)개/), [countHeadings("track-a-explain/documentation-improvement-notes.md", /^## \d+\./)]);
  assert.deepEqual(numberIn("README.md", /\[트러블슈팅\]\(track-b-enable\/troubleshooting\.md\) (\d+)개/), [countHeadings("track-b-enable/troubleshooting.md", /^## T\d+/)]);
});

test("차이와 DX 건수, 2026-10-23 판 상태 건수가 제출 메모의 표와 같다", () => {
  const diffs = tableRows("SUBMISSION_NOTES.md", "| # | 자료 |");
  const status = diffs.map((r) => r[3]);
  const fixed = status.filter((c) => c.startsWith("고쳐짐")).length;
  const partly = status.filter((c) => c.startsWith("일부 고쳐짐")).length;
  assert.deepEqual(numberIn("README.md", /문서와 다르게 동작한 곳 (\d+)건/), [diffs.length]);
  assert.deepEqual(numberIn("README.md", /(\d+)건이 고쳐졌고 (\d+)건이 일부/), [fixed, partly]);
  assert.deepEqual(numberIn(".claude/skills/maroo-integration/SKILL.md", /(\d+)건 전체와 재현 명령/), [diffs.length]);
  const dx = tableRows("SUBMISSION_NOTES.md", "| # | 트랙 |");
  assert.deepEqual(numberIn("README.md", /DX 피드백 (\d+)건/), [dx.length]);
});

test("탐색기 tx 링크와 같은 줄에 단 거부 가스 기록에는 그 tx 가 들어 있다", () => {
  const tx = /explorer-testnet\.maroo\.io\/tx\/(0x[0-9a-f]{64})/g;
  const rec = /\((?:[^()]*\/)?(evidence\/live\/reject-gas-\d{8}T\d{6}Z\.json)\)/g;
  for (const f of trackedMarkdown()) {
    for (const line of read(f).split("\n")) {
      const records = [...line.matchAll(rec)].map((m) => m[1]);
      if (records.length !== 1) continue;
      const hashes = [...line.matchAll(tx)].map((m) => m[1]);
      const recordPath = path.join(path.dirname(f), records[0].startsWith("evidence/") && !f.startsWith("track-a-explain/") ? `track-a-explain/${records[0]}` : records[0]);
      const body = read(recordPath);
      for (const h of hashes) assert.ok(body.includes(h), `${f}: ${records[0]} 에 ${h} 가 없습니다`);
    }
  }
});
