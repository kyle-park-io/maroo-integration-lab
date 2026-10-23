// 감사 키 임계 도구(shared/clairveil-ext/audit-threshold)를 고정 커밋의 vendor/clairveil 모듈 안에서 빌드하고 부른다. [Local]
//
// Go 소스는 이 레포에 두고, go build -overlay 로 vendor/clairveil/cmd/maroo-audit-threshold 자리에 있는 것처럼 빌드한다.
// vendor 폴더에는 파일을 쓰지 않는다. 감사인 키 재료는 Clairveil 예제 도구(examples/clairveil-dapp/tools/auditor-material)로 꺼낸다.
// 그 출력(감사 비밀값)은 화면과 파일에 남기지 않고 deal 명령의 표준 입력으로만 넘긴다.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./paths.ts";

const CORE = path.join(ROOT, "vendor/clairveil");
const SRC = path.join(ROOT, "shared/clairveil-ext/audit-threshold");
const PKG = path.join(CORE, "cmd/maroo-audit-threshold");

function sourceFiles(): string[] {
  return fs.readdirSync(SRC).filter((f) => f.endsWith(".go")).sort();
}

function overlayFile(dir: string, withTests: boolean): string {
  const replace = Object.fromEntries(sourceFiles().filter((f) => withTests || !f.endsWith("_test.go")).map((f) => [path.join(PKG, f), path.join(SRC, f)]));
  const file = path.join(dir, withTests ? "overlay-test.json" : "overlay.json");
  fs.writeFileSync(file, JSON.stringify({ Replace: replace }));
  return file;
}

// 고정 커밋과 소스 내용이 같으면 이전 빌드를 다시 쓴다
export function buildAuditTools(): { dir: string; tool: string; material: string } {
  if (!fs.existsSync(path.join(CORE, ".git"))) {
    throw new Error("vendor/clairveil 이 없습니다. 먼저 pnpm setup:clairveil 을 실행하십시오.");
  }
  const sha = execFileSync("git", ["-C", CORE, "rev-parse", "HEAD"]).toString().trim();
  const h = createHash("sha256");
  for (const f of sourceFiles()) h.update(f).update(fs.readFileSync(path.join(SRC, f)));
  const dir = path.join(ROOT, ".work/audit-tools", `${sha.slice(0, 8)}-${h.digest("hex").slice(0, 8)}`);
  const tool = path.join(dir, "maroo-audit-threshold"), material = path.join(dir, "auditor-material");
  if (!fs.existsSync(tool) || !fs.existsSync(material)) {
    fs.mkdirSync(dir, { recursive: true });
    execFileSync("go", ["build", "-overlay", overlayFile(dir, false), "-o", tool, "./cmd/maroo-audit-threshold"], { cwd: CORE, stdio: ["ignore", "inherit", "inherit"] });
    execFileSync("go", ["build", "-o", material, "./examples/clairveil-dapp/tools/auditor-material"], { cwd: CORE, stdio: ["ignore", "inherit", "inherit"] });
  }
  return { dir, tool, material };
}

// Go 테스트는 패키지 폴더에서 돌아야 해서, 테스트 바이너리를 만든 뒤 빌드 폴더에서 실행한다
export function runAuditToolTests(): string {
  const { dir } = buildAuditTools();
  const bin = path.join(dir, "audit-threshold.test");
  execFileSync("go", ["test", "-c", "-vet=off", "-overlay", overlayFile(dir, true), "-o", bin, "./cmd/maroo-audit-threshold"], { cwd: CORE, stdio: ["ignore", "inherit", "inherit"] });
  return execFileSync(bin, ["-test.v"], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] }).toString();
}

const run = (bin: string, args: string[], input?: string) =>
  JSON.parse(execFileSync(bin, args, { input, stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"] }).toString());

export type Dealt = { audit_pubkey_hex: string; threshold: number; holders: { holder: string; index: number; share_pub_hex: string; file: string }[] };

// 로컬 실행 폴더의 감사인 키에서 감사 비밀값을 꺼내 몫으로 나눈다. 비밀값은 이 함수 밖으로 나가지 않는다.
export function dealFromLocalAuditor(home: string, holders: string[], threshold: number, outDir: string, keyName = "auditor"): Dealt {
  const { tool, material } = buildAuditTools();
  const m = run(material, [], JSON.stringify({ home, key_name: keyName }));
  const req = JSON.stringify({ scalar_hex: m.disclosure_private_scalar_hex, holders, threshold, out_dir: outDir });
  return run(tool, ["deal"], req) as Dealt;
}

export type PartialOut = { holder: string; index: number; envelope_sha256: string; partial_hex: string };
export function partialFor(shareFile: string, envelopeHex: string): PartialOut {
  return run(buildAuditTools().tool, ["partial", "--share", shareFile, "--envelope-hex", envelopeHex]) as PartialOut;
}

export type Opened = {
  envelope_sha256: string; holders: string[];
  payload: { amount: string; from_shielded_address: string; to_shielded_address: string; disclosure_digest_hex: string; asset_id_hex: string };
  verification: { verified: boolean; on_chain_disclosure_digest_match?: boolean };
};

// 부분값 파일을 합쳐 연다. 실패하면 도구가 낸 이유를 그대로 돌려준다.
// skipEnvelopeCheck: 부분값 파일에 적힌 봉투 해시 비교를 건너뛰고 복호까지 시도한다(다른 암호문의 부분값이 암호로도 안 열리는지 보일 때)
export function openWith(envelopeHex: string, partialFiles: string[], threshold: number, onchainDigestHex: string, skipEnvelopeCheck = false): { ok: true; opened: Opened } | { ok: false; error: string } {
  const args = ["open", "--envelope-hex", envelopeHex, "--threshold", String(threshold), "--onchain-digest-hex", onchainDigestHex, ...partialFiles.flatMap((f) => ["--partial", f]), ...(skipEnvelopeCheck ? ["--no-envelope-check"] : [])];
  try {
    return { ok: true, opened: run(buildAuditTools().tool, args) as Opened };
  } catch (err) {
    const stderr = String((err as { stderr?: Buffer }).stderr ?? err).split("\n").filter((l) => l && !l.includes("sonic")).pop() ?? "";
    return { ok: false, error: stderr.trim() };
  }
}
