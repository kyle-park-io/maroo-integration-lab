// Clairveil 에 덧붙인 Go 도구의 테스트를 고정 커밋 모듈 안에서 돌린다. vendor/clairveil 이 있어야 한다(pnpm setup:clairveil).
//
//   pnpm test:go

import { runAuditToolTests } from "../lib/audit-threshold.ts";

const out = runAuditToolTests();
process.stdout.write(out.split("\n").filter((l) => !l.includes("sonic")).join("\n"));
