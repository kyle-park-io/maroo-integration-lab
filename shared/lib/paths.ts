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
  const rel = path.relative(ROOT, path.resolve(p));
  return rel.startsWith("..") ? p : path.join(path.resolve(ROOT, out), rel);
}
