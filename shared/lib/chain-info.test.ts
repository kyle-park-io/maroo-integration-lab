// 테스트넷 노드 정보와 모듈 설정에서 레포가 인용하는 값을 뽑는 함수(chain-info.ts)의 단위 테스트. 체인 호출 없음.

import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeChainInfo } from "./chain-info.ts";

const nodeInfo = {
  default_node_info: { network: "maroo-testnet-1", moniker: "x" },
  application_version: {
    name: "os", app_name: "marood", version: "0.10.0", git_commit: "71dcd931be0000", go_version: "go version go1.25.12 linux/arm64",
    cosmos_sdk_version: "v0.53.4",
    build_deps: [
      { path: "cel.dev/expr", version: "v0.25.1" },
      { path: "github.com/DELIGHT-LABS/clairveil", version: "v0.3.0" },
      { path: "github.com/cosmos/evm", version: "v0.7.0" },
      { path: "github.com/consensys/gnark", version: "v0.14.0" },
    ],
  },
};
const feemarket = { params: { min_gas_multiplier: "0.500000000000000000", min_gas_price: "8000000000000.000000000000000000", base_fee: "8000000000000.000000000000000000" } };
const vm = { params: { evm_denom: "atokrw", active_static_precompiles: ["0x0000000000000000000000000000000000000100", "0x100000000000000000000000000000000000000b"] } };

test("노드 판과 Clairveil 의존성을 뽑는다", () => {
  const s = summarizeChainInfo(nodeInfo, feemarket, vm);
  assert.equal(s.cosmosChainId, "maroo-testnet-1");
  assert.equal(s.node, "marood 0.10.0 (71dcd931be)");
  assert.deepEqual(s.privacyDeps, { "github.com/DELIGHT-LABS/clairveil": "v0.3.0", "github.com/consensys/gnark": "v0.14.0" });
  assert.equal(s.cosmosEvm, "v0.7.0");
});

test("수수료 설정의 최소 가스 비율과 EVM 단위를 숫자와 문자열로 뽑는다", () => {
  const s = summarizeChainInfo(nodeInfo, feemarket, vm);
  assert.equal(s.minGasMultiplier, 0.5);
  assert.equal(s.evmDenom, "atokrw");
  assert.equal(s.privacyPrecompileActive, true);
});

test("Clairveil 의존성이 없으면 빈 객체를 돌려준다", () => {
  const s = summarizeChainInfo({ ...nodeInfo, application_version: { ...nodeInfo.application_version, build_deps: [] } }, feemarket, vm);
  assert.deepEqual(s.privacyDeps, {});
});
