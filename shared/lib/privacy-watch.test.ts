import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { ROOT } from "./paths.ts";
import { createHash } from "node:crypto";
import { countBySelector, diffDocs, readiness, changesSince, recordFile, previousRecordFile, tarFiles, matchVerifyingKeys, type WatchRecord } from "./privacy-watch.ts";

// Actions 는 예약 실행을 빠뜨릴 수 있어 하루에 두 번 돌린다. 같은 날 두 번째 실행도 전날 기록과 견줘야 한다.
test("이전 기록은 오늘 날짜 파일을 빼고 가장 최근 날짜 파일이다", () => {
  const files = ["2026-10-23.json", "2026-10-24.json", "notes.txt", "2026-10-22.json"];
  assert.equal(previousRecordFile(files, "2026-10-24"), "2026-10-23.json");
  assert.equal(previousRecordFile(files, "2026-10-25"), "2026-10-24.json");
  assert.equal(previousRecordFile(["2026-10-24.json"], "2026-10-24"), undefined);
  assert.equal(previousRecordFile([], "2026-10-24"), undefined);
});

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

test("MAROO_LAB_OUT 이 있으면 감시 기록을 그 폴더 아래에 쓴다", () => {
  const dir = path.join(ROOT, "track-a-explain/evidence/live/watch-privacy");
  const before = process.env.MAROO_LAB_OUT;
  try {
    delete process.env.MAROO_LAB_OUT;
    assert.equal(recordFile(dir, "2026-10-24"), path.join(dir, "2026-10-24.json"));
    process.env.MAROO_LAB_OUT = ".work/review/x";
    assert.equal(recordFile(dir, "2026-10-24"), path.join(ROOT, ".work/review/x/track-a-explain/evidence/live/watch-privacy/2026-10-24.json"));
  } finally {
    if (before === undefined) delete process.env.MAROO_LAB_OUT; else process.env.MAROO_LAB_OUT = before;
  }
});

// ustar 항목 하나(헤더 512바이트와 512바이트 단위로 채운 내용). 체크섬은 읽는 쪽이 보지 않아 채우지 않는다.
function ustarEntry(name: string, content: Buffer, type = "0"): Buffer {
  const h = Buffer.alloc(512);
  h.write(name.slice(0, 100), 0, "utf8");
  h.write(content.length.toString(8).padStart(11, "0") + "\0", 124, "ascii");
  h.write(type, 156, "ascii");
  h.write("ustar\0", 257, "ascii");
  const body = Buffer.alloc(Math.ceil(content.length / 512) * 512);
  content.copy(body);
  return Buffer.concat([h, body]);
}
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

test("tar 바이트에서 일반 파일의 이름과 sha256 을 읽는다(pax 긴 경로 포함)", () => {
  const vk = Buffer.from("verifying key bytes");
  const readme = Buffer.from("hello");
  const long = "clairveil-v9/" + "a".repeat(120) + "/deposit.vk";
  const pax = Buffer.from(`${(`path=${long}\n`.length + 4).toString()} path=${long}\n`);
  const tar = Buffer.concat([
    ustarEntry("clairveil-v9/", Buffer.alloc(0), "5"),
    ustarEntry("clairveil-v9/README.md", readme),
    ustarEntry("PaxHeader", pax, "x"),
    ustarEntry("ignored-short-name", vk),
    Buffer.alloc(1024),
  ]);
  assert.deepEqual(tarFiles(tar), [
    { name: "clairveil-v9/README.md", sha256: sha(readme) },
    { name: long, sha256: sha(vk) },
  ]);
});

test("테스트넷 검증 키와 sha256 이 같은 파일을 회로 이름과 함께 찾는다", () => {
  const files = [{ name: "a/deposit.vk", sha256: "aa" }, { name: "a/other", sha256: "bb" }];
  assert.deepEqual(matchVerifyingKeys("v9.tar.gz", files, { deposit: "aa", spend: "cc" }), [{ archive: "v9.tar.gz", file: "a/deposit.vk", circuit: "deposit" }]);
  assert.deepEqual(matchVerifyingKeys("v9.tar.gz", files, {}), []);
});

test("릴리스 압축에 같은 검증 키가 없으면 막힘에, 있으면 준비됨으로 적는다", () => {
  const none = readiness({ ...base, releaseArchives: { archives: ["v1.tar.gz", "v2.tar.gz"], files: 30, matches: [] } });
  assert.equal(none.ready, false);
  assert.ok(none.reasons.some((r) => r.includes("릴리스 압축 2개(파일 30개)")));
  const hit = readiness({ ...base, releaseArchives: { archives: ["v9.tar.gz"], files: 3, matches: [{ archive: "v9.tar.gz", file: "a/deposit.vk", circuit: "deposit" }] } });
  assert.equal(hit.ready, true);
  assert.ok(hit.done.some((d) => d.includes("a/deposit.vk")));
  assert.ok(hit.next[0].includes("v9.tar.gz"));
  assert.deepEqual(changesSince({ ...base, releaseArchives: { archives: ["v1.tar.gz"], files: 10, matches: [] } }, { ...base, releaseArchives: { archives: ["v1.tar.gz", "v9.tar.gz"], files: 13, matches: [{ archive: "v9.tar.gz", file: "a/deposit.vk", circuit: "deposit" }] } }),
    ["Clairveil 릴리스 압축: 1개(검증 키와 같은 파일 0개) → 2개(검증 키와 같은 파일 1개)"]);
});
