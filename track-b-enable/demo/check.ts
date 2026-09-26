// 워크샵 사전 점검. 참가자가 워크샵 전날과 시작 직전에 실행한다.
//
//   pnpm b:check
//
// 필수 항목이 하나라도 ✗ 이면 1로 끝나고, 항목마다 트러블슈팅 번호를 안내한다.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { formatEther, parseEther } from "viem";
import { ROOT } from "../../shared/lib/paths.ts";
import { addressOf, publicClient as pub } from "../../shared/lib/maroo.ts";
import { PREBUILT_DIR, trouble } from "./lib.ts";

// shared/setup-clairveil.ts 가 받는 고정 커밋
const PINNED: Record<string, string> = { clairveil: "ca85b027", clairveiljs: "faf220d5", "clairveil-samples": "8321ded" };

type Row = { item: string; ok: boolean; detail: string; fix?: string; required: boolean };
const rows: Row[] = [];
const add = (item: string, ok: boolean, detail: string, fix?: string, required = true) => rows.push({ item, ok, detail, fix, required });
const version = (cmd: string, args: string[]) => { try { return execFileSync(cmd, args, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return undefined; } };

const nodeMajor = Number(process.versions.node.split(".")[0]);
add("Node.js 24 이상", nodeMajor >= 24, process.versions.node, "T1");
const pnpmV = version("pnpm", ["--version"]);
add("pnpm", !!pnpmV, pnpmV ?? "없음", "T1");
add("Git", !!version("git", ["--version"]), version("git", ["--version"]) ?? "없음", "T3");

const prebuilt = fs.existsSync(path.join(PREBUILT_DIR, "clairveil-commit.txt"));
const goV = version("go", ["version"]);
const goMinor = Number(goV?.match(/go1\.(\d+)/)?.[1] ?? 0);
add("Go 1.25 이상(미리 빌드한 바이너리가 없을 때 필요)", prebuilt || goMinor >= 25, goV ?? "없음", "T2", !prebuilt);

for (const [repo, sha] of Object.entries(PINNED)) {
  const dir = path.join(ROOT, "vendor", repo);
  const head = fs.existsSync(path.join(dir, ".git")) ? version("git", ["-C", dir, "rev-parse", "HEAD"]) : undefined;
  add(`vendor/${repo} 고정 커밋 ${sha}`, !!head?.startsWith(sha), head ? head.slice(0, 8) : "없음", "T3");
}
const core = path.join(ROOT, "vendor/clairveil");
const coreHead = fs.existsSync(path.join(core, ".git")) ? version("git", ["-C", core, "rev-parse", "HEAD"]) : undefined;
const prebuiltSha = prebuilt ? fs.readFileSync(path.join(PREBUILT_DIR, "clairveil-commit.txt"), "utf8").trim() : undefined;
add("미리 빌드한 Clairveil(pnpm b:prepare)", !!prebuiltSha && prebuiltSha === coreHead, prebuiltSha ? prebuiltSha.slice(0, 8) : "없음. pnpm b:prepare 를 실행하면 3단계에서 빌드 시간 3분 안팎이 빠집니다", undefined, false);
const compiled = fs.existsSync(path.join(ROOT, "out/SettlementVault.sol/SettlementVault.json"));
add("금고 컴파일 결과(out/SettlementVault.sol)", compiled, compiled ? "있음" : "없음. pnpm build:contracts", "T9");

const portFree = await new Promise<boolean>((resolve) => {
  const s = net.connect(26657, "127.0.0.1", () => { s.destroy(); resolve(false); });
  s.on("error", () => resolve(true));
});
add("127.0.0.1:26657 비어 있음", portFree, portFree ? "비어 있음" : "사용 중", "T4");
const free = fs.statfsSync(ROOT);
const freeGb = (free.bavail * free.bsize) / 1024 ** 3;
add("디스크 여유 1GB 이상", freeGb >= 1, `${freeGb.toFixed(1)}GB`, undefined);

const chainId = await pub.getChainId().catch(() => undefined);
add("테스트넷 RPC와 chain ID 450815", chainId === 450815, String(chainId ?? "응답 없음"), "T5");
let buyer: `0x${string}` | undefined;
try { buyer = addressOf("BUYER"); } catch { /* 지갑 파일 없음 */ }
add("역할 지갑 파일(pnpm setup:wallets)", !!buyer, buyer ?? `없음(${path.join(os.homedir(), ".config/maroo-integration-lab/testnet.env")})`, "T6");
if (buyer && chainId === 450815) {
  const bal = await pub.getBalance({ address: buyer });
  add("구매 기업 잔액 1,000 OKRW 이상(2단계)", bal >= parseEther("1000"), `${formatEther(bal)} OKRW`, "T7", false);
}

for (const r of rows) {
  const mark = r.ok ? "✓" : r.required ? "✗" : "!";
  console.log(`${mark} ${r.item.padEnd(44)} ${r.detail}${!r.ok && r.fix ? `\n    ${trouble(r.fix)}` : ""}`);
}
const failed = rows.filter((r) => !r.ok && r.required);
console.log(failed.length ? `\n필수 항목 ${failed.length}개가 준비되지 않았습니다.` : "\n필수 항목이 모두 준비됐습니다. ! 표시는 권장 항목입니다.");
process.exit(failed.length ? 1 : 0);
