// eth_call 과 eth_estimateGas 비교 결과를 문장으로 판정하는 함수(global-policy-compare.ts)의 단위 테스트. 체인 호출 없음.

import { test } from "node:test";
import assert from "node:assert/strict";
import { conclude, type ProbeRow } from "./global-policy-compare.ts";

const row = (target: ProbeRow["target"], method: ProbeRow["method"], rejected: boolean): ProbeRow => ({ target, method, rejected });

test("프록시를 거치지 않는 이체만 eth_call 에서 통과하면 그 차이를 적는다", () => {
  const lines = conclude([
    row("plain", "eth_call", false), row("plain", "eth_estimateGas", true),
    row("proxy", "eth_call", true), row("proxy", "eth_estimateGas", true),
  ]);
  assert.ok(lines.some((l) => l.includes("PCL 프록시를 거치지 않는 이체") && l.includes("eth_call") && l.includes("나오지 않습니다")), lines.join("\n"));
  assert.ok(lines.includes("PCL 프록시 호출은 eth_call에서도 거부됩니다."), lines.join("\n"));
});

test("두 경우 모두 통과하면 차이를 확인하지 못했다고 적는다", () => {
  const lines = conclude(["plain", "proxy"].flatMap((t) => [row(t as ProbeRow["target"], "eth_call", false), row(t as ProbeRow["target"], "eth_estimateGas", false)]));
  assert.deepEqual(lines, ["두 경우 모두 eth_call과 eth_estimateGas가 통과해, 이번 조건에서는 전역 정책의 평가 차이를 확인하지 못했습니다."]);
});

test("프록시 호출이 eth_call 에서 통과하고 eth_estimateGas 에서만 거부되면 그대로 적는다", () => {
  const lines = conclude([
    row("plain", "eth_call", false), row("plain", "eth_estimateGas", true),
    row("proxy", "eth_call", false), row("proxy", "eth_estimateGas", true),
  ]);
  assert.ok(lines.some((l) => l.includes("PCL 프록시 호출도 eth_call에서는 통과")), lines.join("\n"));
});
