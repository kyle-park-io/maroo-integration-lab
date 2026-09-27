// 에이전트 스킬이 두 자리에 같은 내용으로 있는지, 두 파일의 frontmatter(name, description)가 스킬 규약을 지키는지 확인한다. 체인 호출 없음.
// .claude/skills/ 는 한 도구가, .agents/skills/ 는 Codex 등 다른 도구가 레포를 열 때 스스로 찾는 자리다.
// 원본은 .claude/skills/ 쪽이다. 그쪽을 고친 뒤 .agents/skills/ 로 복사한다.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseDocument } from "yaml";
import { ROOT } from "./lib/paths.ts";

const original = ".claude/skills/maroo-integration/SKILL.md";
const copy = ".agents/skills/maroo-integration/SKILL.md";

function readSkillFrontmatter(skillPath: string): { name: string; description: string } {
  const absolutePath = path.isAbsolute(skillPath) ? skillPath : path.join(ROOT, skillPath);
  const source = fs.readFileSync(absolutePath, "utf8");
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  assert.ok(frontmatter, `${skillPath} 는 닫힌 YAML frontmatter로 시작해야 합니다`);

  const document = parseDocument(frontmatter[1], { uniqueKeys: true });
  assert.equal(
    document.errors.length,
    0,
    `${skillPath} 의 YAML frontmatter가 잘못됐습니다: ${document.errors.map((error) => error.message).join("; ")}`,
  );
  const metadata: unknown = document.toJS();
  assert.ok(metadata && typeof metadata === "object" && !Array.isArray(metadata), `${skillPath} 의 frontmatter는 객체여야 합니다`);

  const fields = metadata as Record<string, unknown>;
  const name = fields.name;
  const description = fields.description;
  assert.ok(typeof name === "string", `${skillPath} 에 문자열 name이 없습니다`);
  assert.ok(typeof description === "string", `${skillPath} 에 문자열 description이 없습니다`);
  assert.ok(description.trim(), `${skillPath} 의 description이 비어 있습니다`);
  assert.match(name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${skillPath} 의 name 형식이 잘못됐습니다`);
  assert.equal(name, path.basename(path.dirname(absolutePath)), `${skillPath} 의 폴더 이름과 name이 다릅니다`);

  return { name, description };
}

test("두 자리의 에이전트 스킬 내용이 같다", () => {
  const a = fs.readFileSync(path.join(ROOT, original), "utf8");
  const b = fs.readFileSync(path.join(ROOT, copy), "utf8");
  assert.equal(b, a, `${copy} 가 원본과 다릅니다. 원본을 고친 뒤 cp ${original} ${copy} 로 맞춥니다`);
});

for (const skillPath of [original, copy]) {
  test(`${skillPath} frontmatter가 스킬 로더 규약을 만족한다`, () => {
    const metadata = readSkillFrontmatter(skillPath);

    assert.equal(metadata.name, "maroo-integration");
    assert.match(metadata.description, /\S/);
  });
}

test("유효한 YAML 문자열과 선택 메타데이터를 허용한다", (t) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "maroo-agent-skill-test-"));
  const skillDir = path.join(fixtureRoot, "quoted-skill");
  const skillFile = path.join(skillDir, "SKILL.md");
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    skillFile,
    [
      "---",
      'name: "quoted-skill"',
      "description: >-",
      "  Use when a quoted YAML scalar is needed.",
      "metadata:",
      '  short-description: "Quoted fixture"',
      "---",
      "instructions",
      "",
    ].join("\n"),
  );

  assert.deepEqual(readSkillFrontmatter(skillFile), {
    name: "quoted-skill",
    description: "Use when a quoted YAML scalar is needed.",
  });
});

test("빈 YAML description을 거부한다", (t) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "maroo-agent-skill-test-"));
  const skillDir = path.join(fixtureRoot, "empty-description");
  const skillFile = path.join(skillDir, "SKILL.md");
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(skillFile, '---\nname: empty-description\ndescription: ""\n---\ninstructions\n');

  assert.throws(() => readSkillFrontmatter(skillFile), /description/);
});

test("잘못된 frontmatter를 거부한다", (t) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "maroo-agent-skill-test-"));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));

  const cases = [
    {
      label: "frontmatter 없음",
      directory: "missing-frontmatter",
      source: "instructions\n",
      error: /닫힌 YAML frontmatter/,
    },
    {
      label: "종료 구분자 없음",
      directory: "unclosed-frontmatter",
      source: "---\nname: unclosed-frontmatter\ndescription: Use when testing.\n",
      error: /닫힌 YAML frontmatter/,
    },
    {
      label: "name 없음",
      directory: "missing-name",
      source: "---\ndescription: Use when testing.\n---\ninstructions\n",
      error: /문자열 name/,
    },
    {
      label: "name 비어 있음",
      directory: "empty-name",
      source: '---\nname: ""\ndescription: Use when testing.\n---\ninstructions\n',
      error: /name 형식/,
    },
    {
      label: "description 없음",
      directory: "missing-description",
      source: "---\nname: missing-description\n---\ninstructions\n",
      error: /문자열 description/,
    },
    {
      label: "description 공백",
      directory: "blank-description",
      source: '---\nname: blank-description\ndescription: "   "\n---\ninstructions\n',
      error: /description이 비어 있습니다/,
    },
    {
      label: "name 중복",
      directory: "duplicate-name",
      source: "---\nname: duplicate-name\nname: duplicate-name\ndescription: Use when testing.\n---\ninstructions\n",
      error: /YAML frontmatter가 잘못됐습니다/,
    },
    {
      label: "name 형식 오류",
      directory: "invalid-name",
      source: "---\nname: Invalid_Name\ndescription: Use when testing.\n---\ninstructions\n",
      error: /name 형식/,
    },
    {
      label: "폴더명과 name 불일치",
      directory: "directory-name",
      source: "---\nname: different-name\ndescription: Use when testing.\n---\ninstructions\n",
      error: /폴더 이름과 name/,
    },
  ];

  for (const fixture of cases) {
    const skillDir = path.join(fixtureRoot, fixture.directory);
    const skillFile = path.join(skillDir, "SKILL.md");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(skillFile, fixture.source);
    assert.throws(() => readSkillFrontmatter(skillFile), fixture.error, fixture.label);
  }
});
