// Track A 레시피: 테스트넷 노드가 밝히는 판과 설정을 기록한다. [Live Testnet] 조회만
//
//   pnpm a:chain-info
//
// Cosmos REST 에서 노드 정보(앱 판, 빌드 의존성), 수수료 설정, EVM 설정을 읽는다. 트랜잭션은 보내지 않고 키도 쓰지 않는다.
// 가이드가 인용하는 값은 셋이다. 노드가 의존하는 Clairveil 판, 거부된 tx가 가스 한도의 절반을 내는 근거인
// min_gas_multiplier, Privacy 프리컴파일이 활성 목록에 있는지다. 결과는 track-a-explain/evidence/live/chain-info-<시각>.json 에 남긴다.

import "../../shared/lib/install-recipe-errors.ts";
import path from "node:path";
import { ROOT } from "../../shared/lib/paths.ts";
import { REST, writeEvidence } from "../../shared/lib/maroo.ts";
import { summarizeChainInfo } from "../../shared/lib/chain-info.ts";

async function get(p: string) {
  let res: Response;
  try {
    res = await fetch(`${REST}${p}`, { signal: AbortSignal.timeout(20_000) });
  } catch (e) {
    console.error(`Cosmos REST(${REST})에 연결하지 못했습니다: ${(e as Error).message}`);
    console.error("네트워크를 확인하거나 MAROO_REST_URL 로 다른 주소를 지정하십시오.");
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`${REST}${p} 응답 ${res.status}. 경로가 바뀌었는지 마루 문서의 테스트넷 접근 페이지에서 확인하십시오.`);
    process.exit(1);
  }
  return res.json();
}

const paths = { nodeInfo: "/cosmos/base/tendermint/v1beta1/node_info", feemarket: "/cosmos/evm/feemarket/v1/params", vm: "/cosmos/evm/vm/v1/params" };
const [nodeInfo, feemarket, vm] = await Promise.all([get(paths.nodeInfo), get(paths.feemarket), get(paths.vm)]);
const info = summarizeChainInfo(nodeInfo, feemarket, vm);

// Clairveil 체인이 차폐 상태를 내주는 REST 경로(x/privacy 의 조회)가 테스트넷에 열려 있는지.
// 2026-10-23 까지 이 레포는 proto 에 없는 /params 를 불러 501 을 기록했다. proto 의 HTTP 경로인 circuit_config 와 tree_state 를 부른다.
// 경로 전부의 상태는 pnpm a:watch-privacy 가 기록한다.
const PRIVACY_REST = ["/clairveil/privacy/v1/circuit_config", "/clairveil/privacy/v1/tree_state"];
const privacyRestStatus = Object.fromEntries(await Promise.all(PRIVACY_REST.map(async (p) =>
  [p, await fetch(`${REST}${p}`, { signal: AbortSignal.timeout(20_000) }).then((r) => r.status).catch(() => "연결 실패")] as const)));

console.log(`Cosmos chain-id        ${info.cosmosChainId}`);
console.log(`노드                   ${info.node}, Cosmos SDK ${info.cosmosSdk}, cosmos/evm ${info.cosmosEvm}`);
for (const [p, v] of Object.entries(info.privacyDeps)) console.log(`빌드 의존성            ${p} ${v}`);
if (Object.keys(info.privacyDeps).length === 0) console.log("빌드 의존성            Clairveil, gnark 없음");
console.log(`최소 가스 비율         ${info.minGasMultiplier} (거부된 tx도 가스 한도의 이 비율만큼은 냅니다)`);
console.log(`EVM 단위               ${info.evmDenom}`);
console.log(`Privacy 프리컴파일     ${info.privacyPrecompileActive ? "활성 목록에 있음" : "활성 목록에 없음"}`);
for (const [p, st] of Object.entries(privacyRestStatus)) console.log(`Clairveil 조회 경로    ${p} 응답 ${st}`);

const file = writeEvidence(path.join(ROOT, "track-a-explain/evidence/live"), "chain-info", {
  rest: REST, paths, checkedAt: new Date().toISOString(), label: "조회만 함(Cosmos REST). tx 없음", ...info, privacyRest: privacyRestStatus,
});
console.log(`기록: ${path.relative(ROOT, file)}`);
