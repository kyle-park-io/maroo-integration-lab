import assert from "node:assert/strict";
import test from "node:test";
import { countBySelector, diffDocs, readiness, changesSince, type WatchRecord } from "./privacy-watch.ts";

test("Privacy 프리컴파일 tx 를 선택자와 결과로 센다", () => {
  const c = countBySelector([
    { raw_input: "0x0272cf35aa", result: "success" },
    { raw_input: "0x0272cf35bb", result: "success" },
    { raw_input: "0x0272cf35cc", result: "Reverted" },
    { raw_input: "0xdeadbeef", result: "success" },
  ], { "0x0272cf35": "deposit" });
  assert.deepEqual(c, [
    { selector: "0x0272cf35", name: "deposit", total: 3, success: 2 },
    { selector: "0xdeadbeef", name: "알 수 없음", total: 1, success: 1 },
  ]);
});

test("문서 페이지마다 내용 해시를 견줘 바뀐 주소와 새 주소를 가린다", () => {
  const d = diffDocs({ "/a/": "h1", "/b/": "h2" }, { "/a/": "h1", "/b/": "h3", "/c/": "h4" });
  assert.deepEqual(d, { changed: ["/b/"], added: ["/c/"], removed: [] });
  assert.deepEqual(diffDocs(undefined, { "/a/": "h1" }), { changed: [], added: [], removed: [] });
});

// 2026-10-23 에 읽은 값
const base: WatchRecord = {
  checkedAt: "2026-10-23T00:00:00Z",
  node: { app: "marood 0.10.0", clairveil: "v0.3.0" },
  privacyRest: { "/clairveil/privacy/v1/circuit_config": 200, "/clairveil/privacy/v1/tree_state": 200, "/clairveil/privacy/v1/privacy_scan": 501 },
  provingMaterial: { manifestAvailable: false, artifactFiles: 0 },
  firstFailure: { family: "sdk", name: "SDKInvalidRequest" },
  sdkProbe: { stoppedAt: "증명 공급자까지 왔다", proverReached: true },
  layer4: { name: "EasNoAttestationReceived", scope: "contract" },
  precompileTx: { total: 251, latest: "2026-09-21T04:40:01Z" },
  docs: { "/concepts/privacy/verifiable-privacy/": "h1" },
  clairveilLatest: "v0.6.1",
  npm: { "@maroo-chain/viem": "0.4.0", "@maroo-chain/contracts": "0.0.9" },
};

test("조회 경로가 열리고 SDK 가 증명 공급자에 닿아도 proving 재료가 없으면 5층을 시험하지 못한다", () => {
  const r = readiness(base);
  assert.equal(r.ready, false);
  assert.ok(r.reasons.some((x) => x.includes("proving")));
  assert.ok(!r.reasons.some((x) => x.includes("circuit_config")), "열린 경로는 막힌 이유에 넣지 않는다");
  assert.ok(r.done.some((x) => x.includes("4층")));
  assert.ok(r.done.some((x) => x.includes("증명 공급자")));
});

test("proving 재료가 공개되면 5층을 시험할 때라고 판정한다", () => {
  const r = readiness({ ...base, provingMaterial: { manifestAvailable: true, artifactFiles: 4 } });
  assert.equal(r.ready, true);
  assert.ok(r.next.some((x) => x.includes("5층")));
});

test("SDK 가 증명 공급자에 닿지 못하면 그 이유를 먼저 적는다", () => {
  const r = readiness({ ...base, sdkProbe: { stoppedAt: "fetchCircuitConfig 실패", proverReached: false } });
  assert.ok(r.reasons.some((x) => x.includes("fetchCircuitConfig")));
});

test("이전 기록과 견줘 바뀐 항목만 적는다", () => {
  const now = {
    ...base, clairveilLatest: "v0.7.0", precompileTx: { total: 260, latest: "2026-10-24T00:00:00Z" },
    docs: { "/concepts/privacy/verifiable-privacy/": "h9" }, provingMaterial: { manifestAvailable: true, artifactFiles: 4 },
  };
  const c = changesSince(base, now);
  assert.ok(c.some((x) => x.includes("v0.7.0")));
  assert.ok(c.some((x) => x.includes("251") && x.includes("260")));
  assert.ok(c.some((x) => x.includes("verifiable-privacy")));
  assert.ok(c.some((x) => x.includes("proving")));
  assert.deepEqual(changesSince(base, base), []);
});
