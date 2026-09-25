// 워크숍 사전 준비(pre-work). 워크숍 전에 한 번 실행한다. 이 머신에서 5분 안팎 걸린다.
//
//   pnpm b:prepare
//
// 하는 일
//   1. Clairveil 고정 커밋 받기(vendor/ 가 없을 때)
//   2. 금고 컨트랙트 컴파일(out/ 이 없을 때)
//   3. Clairveil 바이너리와 회로 산출물을 .work/prebuilt/ 에 빌드(없거나 커밋이 다를 때)
//   4. 역할 지갑 만들기(지갑 파일이 없을 때)
// 끝나면 진행자에게 보낼 구매 기업 주소를 출력한다.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../../shared/lib/paths.ts";
import { buildClairveil } from "../../shared/lib/local-vendor-settlement.ts";
import { PREBUILT_DIR } from "./lib.ts";

const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
const core = path.join(ROOT, "vendor/clairveil");

console.log("1) Clairveil 고정 커밋");
if (!fs.existsSync(path.join(core, ".git"))) run("node", ["shared/setup-clairveil.ts"]);
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
console.log("\n진행자에게 위 BUYER 주소를 보내 테스트넷 OKRW 배분(pnpm b:fund)을 요청하십시오. 그다음 pnpm b:check 로 확인합니다.");
