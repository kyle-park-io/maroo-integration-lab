// 에이전트 스킬이 두 자리에 같은 내용으로 있는지 확인한다. 체인 호출 없음.
// .claude/skills/ 는 한 도구가, .agents/skills/ 는 Codex 등 다른 도구가 레포를 열 때 스스로 찾는 자리다.
// 원본은 .claude/skills/ 쪽이다. 그쪽을 고친 뒤 .agents/skills/ 로 복사한다.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/paths.ts";

const original = ".claude/skills/maroo-integration/SKILL.md";
const copy = ".agents/skills/maroo-integration/SKILL.md";

test("두 자리의 에이전트 스킬 내용이 같다", () => {
  const a = fs.readFileSync(path.join(ROOT, original), "utf8");
  const b = fs.readFileSync(path.join(ROOT, copy), "utf8");
  assert.equal(b, a, `${copy} 가 원본과 다릅니다. 원본을 고친 뒤 cp ${original} ${copy} 로 맞춥니다`);
});
