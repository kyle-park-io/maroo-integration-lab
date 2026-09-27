// 한 번만 하는 준비. pnpm bootstrap 과 워크샵 사전 준비(pnpm b:prepare)가 이 코드를 함께 쓴다.
// 이 머신에서 2분 안팎 걸렸다(빌드 108초).
//
//   pnpm bootstrap
//
// 하는 일
//   1. Clairveil 고정 커밋 받기(vendor/ 의 세 레포 가운데 하나라도 없을 때)
//   2. 금고 컨트랙트 컴파일(out/ 이 없을 때)
//   3. Clairveil 바이너리와 회로 산출물을 .work/prebuilt/ 에 빌드(없거나 커밋이 다를 때)
//   4. 역할 지갑 만들기(지갑 파일이 없거나 역할이 빠졌을 때)

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PREBUILT_DIR, ROOT } from "./lib/paths.ts";
import { buildClairveil } from "./lib/local-vendor-settlement.ts";

export function bootstrap() {
  const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
  const core = path.join(ROOT, "vendor/clairveil");

  console.log("1) Clairveil 고정 커밋");
  const repos = ["clairveil", "clairveiljs", "clairveil-samples"].map((r) => path.join(ROOT, "vendor", r, ".git"));
  if (repos.some((r) => !fs.existsSync(r))) run("node", ["shared/setup-clairveil.ts"]);
  else console.log("   이미 있습니다");

  console.log("2) 금고 컨트랙트 컴파일");
  if (!fs.existsSync(path.join(ROOT, "out/SettlementVault.sol/SettlementVault.json"))) run("forge", ["build"]);
  else console.log("   이미 있습니다");

  console.log("3) Clairveil 바이너리와 회로 산출물");
  const head = execFileSync("git", ["-C", core, "rev-parse", "HEAD"]).toString().trim();
  const marker = path.join(PREBUILT_DIR, "clairveil-commit.txt");
  if (fs.existsSync(marker) && fs.readFileSync(marker, "utf8").trim() === head) {
    console.log(`   이미 있습니다(${head.slice(0, 8)})`);
  } else {
    fs.rmSync(PREBUILT_DIR, { recursive: true, force: true });
    fs.mkdirSync(PREBUILT_DIR, { recursive: true });
    const started = Date.now();
    buildClairveil(PREBUILT_DIR, path.join(PREBUILT_DIR, "log"));
    console.log(`   ${path.relative(ROOT, PREBUILT_DIR)} 에 만들었습니다(${Math.round((Date.now() - started) / 1000)}초)`);
  }

  console.log("4) 역할 지갑");
  run("node", ["shared/setup-wallets.ts"]);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  bootstrap();
  console.log("\n준비를 마쳤습니다. 다음 명령은 pnpm review 입니다(키와 잔액 없이 실행됩니다).");
}
