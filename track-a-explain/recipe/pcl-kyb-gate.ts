// Track A 레시피: 공급업체 정산의 투명 경로를 마루 테스트넷에서 실행한다. [Live Testnet]
//
//   pnpm build:contracts      # shared/contracts/SettlementVault.sol
//   pnpm a:kyb-gate
//
// 흐름과 역할은 shared/lib/kyb-gate.ts 머리말에 있다. 구매 기업과 발급자는 faucet
// (https://faucet.maroo.io/api/agent/sendToken)으로 tOKRW 를 받아 둔다.
// 결과는 track-a-explain/evidence/live/pcl-kyb-gate-<시각>.json 에 남긴다.

import path from "node:path";
import { ROOT } from "../../shared/lib/paths.ts";
import { runKybGate } from "../../shared/lib/kyb-gate.ts";

const { file } = await runKybGate({ evidenceDir: path.join(ROOT, "track-a-explain/evidence/live") });
console.log(`기록: ${path.relative(ROOT, file)}`);
