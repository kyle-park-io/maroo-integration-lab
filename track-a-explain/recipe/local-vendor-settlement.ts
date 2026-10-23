// Track A 레시피의 로컬 부분: 비공개 공급업체 정산을 Clairveil 로컬 체인에서 끝까지 돌린다. [Local]
//
//   pnpm setup:clairveil     # 한 번만
//   pnpm a:local             # 미리 빌드한 바이너리(pnpm b:prepare)가 있으면 재사용한다
//   pnpm a:local --extras    # 증명 하나짜리 일괄 지급과 대리 인출을 더한다
//   pnpm a:local --operator  # 정산 대행사가 금액만 받아 협력사별 합계를 내고 감사인 합계와 견준다(운영자 시야)
//
// 기록은 track-a-explain/evidence/local/ 에 남는다.

import "../../shared/lib/install-recipe-errors.ts";
import path from "node:path";
import { ROOT } from "../../shared/lib/paths.ts";
import { runLocalVendorSettlement } from "../../shared/lib/local-vendor-settlement.ts";

// --extras: 참조 구현의 증명 하나짜리 일괄 지급과 대리 인출을 뒤에 더 실행한다
const extras = process.argv.includes("--extras");
// --operator: 정산 대행사(운영자) 키와, 금액만 대행사에게 공개하는 지급 세 건을 더한다
const operator = process.argv.includes("--operator");
const report = await runLocalVendorSettlement({
  evidenceDir: path.join(ROOT, "track-a-explain/evidence/local"),
  command: ["pnpm a:local", ...(extras ? ["--extras"] : []), ...(operator ? ["--operator"] : [])].join(" "),
  prebuiltDir: path.join(ROOT, ".work/prebuilt"),
  extras,
  operator,
});
console.log(`기록: ${path.relative(ROOT, report)}`);
