// 레포 루트. 모든 경로는 여기서 시작한다.

import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// pnpm bootstrap(= b:prepare)이 Clairveil 바이너리와 회로 산출물을 미리 빌드해 두는 곳
export const PREBUILT_DIR = path.join(ROOT, ".work/prebuilt");

// MAROO_LAB_OUT 이 있으면 레포 안 기록 경로를 그 폴더 아래 같은 상대 경로로 옮긴다.
// pnpm review 가 추적 중인 증거 파일을 바꾸지 않고 새 기록을 따로 남기게 한다.
export function outPath(p: string): string {
  const out = process.env.MAROO_LAB_OUT;
  if (!out) return p;
  const base = path.resolve(ROOT, out);
  const abs = path.resolve(p);
  // 이미 출력 폴더 안이면 그대로 둔다(기록을 만든 명령과 읽는 명령이 둘 다 outPath 를 거칠 때)
  if (abs === base || abs.startsWith(base + path.sep)) return p;
  const rel = path.relative(ROOT, abs);
  return rel.startsWith("..") ? p : path.join(base, rel);
}
