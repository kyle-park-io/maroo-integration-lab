// 기록 경로를 MAROO_LAB_OUT 아래로 옮기는 outPath 의 단위 테스트. 체인 호출 없음.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { ROOT, outPath } from "./paths.ts";

test("MAROO_LAB_OUT 이 있으면 레포 안 경로를 그 아래 같은 상대 경로로 옮긴다", () => {
  process.env.MAROO_LAB_OUT = ".work/out-test";
  assert.equal(outPath(path.join(ROOT, "track-c-activate/evidence/x.json")), path.join(ROOT, ".work/out-test/track-c-activate/evidence/x.json"));
});

test("이미 MAROO_LAB_OUT 아래에 있는 경로는 한 번 더 옮기지 않는다", () => {
  process.env.MAROO_LAB_OUT = ".work/out-test";
  const inside = path.join(ROOT, ".work/out-test/track-c-activate/evidence/x.json");
  assert.equal(outPath(inside), inside);
  delete process.env.MAROO_LAB_OUT;
});
