// a:doc-claims 5번(사전 검사 방법) 판정 함수의 단위 테스트. 체인과 문서 사이트를 부르지 않는다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { preflightClaims } from "./doc-claims-preflight.ts";

const SIM_0924 = "프록시의 훅이 로직 컨트랙트에 위임하기 전에 IPcl.preCall 을 호출하므로, 시뮬레이션된 호출도 전역 + 컨트랙트 범위 정책 평가를 모두 수행하고";
const SIM_1023 = `${SIM_0924} (실제 트랜잭션이 실행 후 받는 전역 정책 재검사는 eth_call 에 포함되지 않으며, eth_estimateGas 는 이 재검사까지 실행합니다.)`;

test("2026-09-24 판 시뮬레이션 가이드는 프록시 훅 사전 검사만 적는다", () => {
  const r = preflightClaims({ simulation: SIM_0924, reasonCodes: "ReasonCode 목록", contractApi: "사전 점검은 eth_call 로 수행하세요." });
  assert.equal(r.simulationProxyHook, true);
  assert.equal(r.simulationEthCallSkipsRecheck, false);
  assert.equal(r.reasonCodesMentionEstimateGas, false);
  assert.equal(r.contractApiSaysEthCall, true);
});

test("2026-10-23 판 시뮬레이션 가이드는 eth_call 이 실행 뒤 재검사를 하지 않는다고 적는다", () => {
  const r = preflightClaims({ simulation: SIM_1023, reasonCodes: "eth_estimateGas 로 미리 확인", contractApi: "" });
  assert.equal(r.simulationEthCallSkipsRecheck, true);
  assert.equal(r.reasonCodesMentionEstimateGas, true);
  assert.equal(r.contractApiSaysEthCall, false);
});
