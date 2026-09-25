// Track A 레시피의 로컬 부분: 비공개 공급업체 정산을 Clairveil 로컬 체인에서 끝까지 돌린다. [Local]
//
//   pnpm setup:clairveil     # 한 번만
//   pnpm a:local
//
// 기록은 track-a-explain/evidence/local/ 에 남는다.

import path from "node:path";
import { ROOT } from "../../shared/lib/paths.ts";
import { runLocalVendorSettlement } from "../../shared/lib/local-vendor-settlement.ts";

const report = await runLocalVendorSettlement({
  evidenceDir: path.join(ROOT, "track-a-explain/evidence/local"),
  command: "pnpm a:local",
});
console.log(`기록: ${path.relative(ROOT, report)}`);
