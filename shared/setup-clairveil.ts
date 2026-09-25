// Clairveil 로컬 흐름에 쓰는 세 레포를 고정한 커밋으로 vendor/ 아래에 받는다.
// clairveil-samples 8321ded 의 README 와 scripts/dapp-local.sh 가 기대하는 조합이다.
//
//   pnpm setup:clairveil
//
// 이미 받은 레포는 지정한 커밋으로 다시 맞춘다.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/paths.ts";

const VENDOR = path.join(ROOT, "vendor");

// 태그나 날짜는 주석으로만 둔다. 재현의 기준은 커밋이다.
const REPOS = [
  { name: "clairveil", url: "https://github.com/DELIGHT-LABS/clairveil.git", sha: "ca85b02708fdd75259d4d2ee2d671c21198cec69" }, // v0.4.0, 2026-08-01
  { name: "clairveiljs", url: "https://github.com/DELIGHT-LABS/clairveiljs.git", sha: "faf220d5b2fa1a186c30893ca74d765474015aee" }, // feat/v0.4.0_cosmos, 2026-09-08
  { name: "clairveil-samples", url: "https://github.com/DELIGHT-LABS/clairveil-samples.git", sha: "8321dedc231372679cfbea4314d080ecaea2e3f5" }, // main, 2026-09-22
];

const git = (args: string[]) => execFileSync("git", args, { stdio: ["ignore", "pipe", "inherit"] }).toString().trim();

fs.mkdirSync(VENDOR, { recursive: true });
for (const repo of REPOS) {
  const dir = path.join(VENDOR, repo.name);
  if (!fs.existsSync(path.join(dir, ".git"))) git(["clone", "--quiet", repo.url, dir]);
  try {
    git(["-C", dir, "fetch", "--quiet", "origin", repo.sha]);
  } catch {
    git(["-C", dir, "fetch", "--quiet", "--all"]);
  }
  git(["-C", dir, "-c", "advice.detachedHead=false", "checkout", "--quiet", repo.sha]);
  console.log(`${repo.name.padEnd(18)} ${git(["-C", dir, "rev-parse", "HEAD"])}`);
}
