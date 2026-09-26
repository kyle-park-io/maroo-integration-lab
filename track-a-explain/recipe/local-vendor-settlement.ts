// Track A 레시피의 로컬 부분: 비공개 공급업체 정산을 Clairveil 로컬 체인에서 끝까지 돌린다. [Local]
//
//   pnpm setup:clairveil     # 한 번만
//   pnpm a:local             # 미리 빌드한 바이너리(pnpm b:prepare)가 있으면 재사용한다
//   pnpm a:local --extras    # 증명 하나짜리 일괄 지급과 대리 인출을 더한다
//
// 기록은 track-a-explain/evidence/local/ 에 남는다.

import path from "node:path";
import { ROOT } from "../../shared/lib/paths.ts";
import { runLocalVendorSettlement } from "../../shared/lib/local-vendor-settlement.ts";

// --extras: 참조 구현의 증명 하나짜리 일괄 지급과 대리 인출을 뒤에 더 실행한다
const extras = process.argv.includes("--extras");
const report = await runLocalVendorSettlement({
  evidenceDir: path.join(ROOT, "track-a-explain/evidence/local"),
  command: extras ? "pnpm a:local --extras" : "pnpm a:local",
  prebuiltDir: path.join(ROOT, ".work/prebuilt"),
  extras,
});
console.log(`기록: ${path.relative(ROOT, report)}`);
