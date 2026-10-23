// 테스트넷 노드 정보(Cosmos REST)에서 레포가 문서에 인용하는 값을 뽑는다.
// 노드 판과 빌드 의존성(Clairveil, gnark), 수수료 설정의 최소 가스 비율, EVM 단위, Privacy 프리컴파일 활성 여부다.

type Json = Record<string, any>;

const PRIVACY_DEPS = ["github.com/DELIGHT-LABS/clairveil", "github.com/consensys/gnark"];
const PRIVACY_PRECOMPILE = "0x100000000000000000000000000000000000000b";

export type ChainInfo = {
  cosmosChainId: string;
  node: string;
  goVersion: string;
  cosmosSdk: string;
  cosmosEvm: string | undefined;
  privacyDeps: Record<string, string>;
  minGasMultiplier: number;
  minGasPrice: string;
  evmDenom: string;
  privacyPrecompileActive: boolean;
};

export function summarizeChainInfo(nodeInfo: Json, feemarket: Json, vm: Json): ChainInfo {
  const app = nodeInfo.application_version ?? {};
  const deps = (app.build_deps ?? []) as { path: string; version: string }[];
  const versionOf = (p: string) => deps.find((d) => d.path === p)?.version;
  const privacyDeps: Record<string, string> = {};
  for (const p of PRIVACY_DEPS) {
    const v = versionOf(p);
    if (v) privacyDeps[p] = v;
  }
  return {
    cosmosChainId: nodeInfo.default_node_info?.network,
    node: `${app.app_name} ${app.version} (${String(app.git_commit ?? "").slice(0, 10)})`,
    goVersion: app.go_version,
    cosmosSdk: app.cosmos_sdk_version,
    cosmosEvm: versionOf("github.com/cosmos/evm"),
    privacyDeps,
    minGasMultiplier: Number(feemarket.params?.min_gas_multiplier),
    minGasPrice: feemarket.params?.min_gas_price,
    evmDenom: vm.params?.evm_denom,
    privacyPrecompileActive: ((vm.params?.active_static_precompiles ?? []) as string[]).map((a) => a.toLowerCase()).includes(PRIVACY_PRECOMPILE),
  };
}
