// 문서 안의 Mermaid 블록을 모두 꺼내 밝은 테마와 어두운 테마로 렌더링한다.
//
//   pnpm diagrams:check
//
// 문법 오류가 있으면 1로 끝난다. 렌더링한 그림은 .work/diagrams/ 에 남기고, 사람이 열어 배치를 확인한다.
// 헤드리스 크롬은 PUPPETEER_EXECUTABLE_PATH, 없으면 ~/.cache/puppeteer 에서 찾는다.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT } from "./lib/paths.ts";

const OUT = path.join(ROOT, ".work/diagrams");
const MMDC = path.join(ROOT, "node_modules/.bin/mmdc");
if (!fs.existsSync(MMDC)) {
  console.log("node_modules/.bin/mmdc 가 없습니다. 먼저 pnpm install 을 실행하십시오.");
  process.exit(1);
}

function findChrome(): string | undefined {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const base = path.join(os.homedir(), ".cache/puppeteer/chrome-headless-shell");
  if (!fs.existsSync(base)) return undefined;
  for (const version of fs.readdirSync(base).sort().reverse()) {
    const bin = path.join(base, version, "chrome-headless-shell-linux64", "chrome-headless-shell");
    if (fs.existsSync(bin)) return bin;
  }
  return undefined;
}

function markdownFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", "vendor", ".work", ".git", "out", "cache"].includes(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".md")) out.push(p);
    }
  };
  walk(ROOT);
  return out.sort();
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const chrome = findChrome();
const pptr = path.join(OUT, "puppeteer.json");
fs.writeFileSync(pptr, JSON.stringify({ ...(chrome ? { executablePath: chrome } : {}), args: ["--no-sandbox"] }));

let total = 0;
const failures: string[] = [];
for (const file of markdownFiles()) {
  const text = fs.readFileSync(file, "utf8");
  const blocks = [...text.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1]);
  blocks.forEach((block, i) => {
    const name = `${path.relative(ROOT, file).replace(/[/.]/g, "_")}-${i + 1}`;
    const src = path.join(OUT, `${name}.mmd`);
    fs.writeFileSync(src, block);
    for (const theme of ["default", "dark"]) {
      total++;
      try {
        execFileSync(MMDC, ["-p", pptr, "-i", src, "-o", path.join(OUT, `${name}-${theme}.png`), "-t", theme, "-w", "1000", "-b", theme === "dark" ? "#0d1117" : "white"], { stdio: "pipe" });
      } catch (err) {
        failures.push(`${path.relative(ROOT, file)} 블록 ${i + 1} (${theme}): ${String((err as { stderr?: Buffer }).stderr ?? err).split("\n").find((l) => l.trim()) ?? ""}`);
      }
    }
  });
}

console.log(`Mermaid 렌더링 ${total}건, 실패 ${failures.length}건. 그림: ${path.relative(ROOT, OUT)}/`);
for (const f of failures) console.log(`  ${f}`);
process.exit(failures.length ? 1 : 0);
