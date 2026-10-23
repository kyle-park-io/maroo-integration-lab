import assert from "node:assert/strict";
import test from "node:test";
import {
  checkRequest, decide, inScope, pendingRecords, recordHash, requestHash,
  type AccessRequest, type Approval, type RecordPlan,
} from "./audit-access.ts";

const target = { tx: "11374969411D613FB0077723765429547B67B4E878AFE6AE3C87480A753B2107", message: 0, time: "2026-10-23T04:54:40Z" };
const other = { tx: "AA74969411D613FB0077723765429547B67B4E878AFE6AE3C87480A753B21AA", message: 1, time: "2026-10-23T04:54:20Z" };
const request = (over: Partial<AccessRequest> = {}): AccessRequest => ({
  caseId: "CASE-1", requester: "regulator", legalBasis: "자금세탁 의심 거래 조사(가상)",
  period: { from: "2026-10-23T00:00:00Z", to: "2026-10-23T23:59:59Z" }, targets: [target], fields: ["amount", "from", "to"],
  requestedAt: "2026-10-23T05:00:00Z", ...over,
});
const approval = (approver: Approval["approver"], decision: Approval["decision"] = "approve"): Approval =>
  ({ requestHash: requestHash(request()), approver, decision, reason: "범위 확인", at: "2026-10-23T05:01:00Z" });

test("요청 해시는 키 순서와 상관없이 같다", () => {
  const a = request();
  const b = Object.fromEntries(Object.entries(a).reverse()) as AccessRequest;
  assert.equal(requestHash(a), requestHash(b));
  assert.notEqual(requestHash(a), requestHash(request({ caseId: "CASE-2" })));
});

test("법적 근거가 없거나 대상 tx 가 기간 밖이면 요청에 문제가 있다", () => {
  assert.deepEqual(checkRequest(request()), []);
  assert.ok(checkRequest(request({ legalBasis: " " })).some((p) => p.includes("법적 근거")));
  assert.ok(checkRequest(request({ targets: [] })).some((p) => p.includes("대상")));
  assert.ok(checkRequest(request({ period: { from: "2026-10-24T00:00:00Z", to: "2026-10-24T23:59:59Z" } })).some((p) => p.includes("기간")));
  assert.ok(checkRequest(request({ period: { from: "2026-10-24T00:00:00Z", to: "2026-10-23T00:00:00Z" } })).some((p) => p.includes("기간")));
});

test("승인 하나로는 열리지 않고 둘이면 열린다", () => {
  assert.equal(decide(request(), [approval("audit-team")], 2).open, false);
  const d = decide(request(), [approval("audit-team"), approval("external-auditor")], 2);
  assert.equal(d.open, true);
  assert.deepEqual(d.approvers, ["audit-team", "external-auditor"]);
});

test("요청한 역할의 승인은 세지 않는다", () => {
  const d = decide(request(), [approval("regulator"), approval("audit-team")], 2);
  assert.equal(d.open, false);
  assert.match(d.reason, /요청한 역할/);
});

test("같은 역할의 승인은 한 번만 센다", () => {
  assert.equal(decide(request(), [approval("audit-team"), approval("audit-team")], 2).open, false);
});

test("거절이 하나라도 있으면 열지 않는다", () => {
  const d = decide(request(), [approval("audit-team"), approval("external-auditor", "reject")], 2);
  assert.equal(d.open, false);
  assert.match(d.reason, /거절/);
});

test("다른 요청에 단 승인은 세지 않는다", () => {
  const stray = { ...approval("external-auditor"), requestHash: requestHash(request({ caseId: "CASE-9" })) };
  assert.equal(decide(request(), [approval("audit-team"), stray], 2).open, false);
});

test("요청에 없는 tx 나 메시지는 범위 밖이다", () => {
  assert.equal(inScope(request(), target), true);
  assert.equal(inScope(request(), other), false);
  assert.equal(inScope(request(), { ...target, message: 1 }), false);
  assert.equal(inScope(request(), { ...target, tx: target.tx.toLowerCase() }), true);
});

test("기록 해시는 단계와 내용을 함께 묶는다", () => {
  const h = requestHash(request());
  assert.notEqual(recordHash("approve", { h, by: "audit-team" }), recordHash("reject", { h, by: "audit-team" }));
  assert.equal(recordHash("access", { a: 1, b: 2 }), recordHash("access", { b: 2, a: 1 }));
});

test("이어 하기는 이미 남긴 기록을 건너뛴다", () => {
  const plan: RecordPlan[] = [
    { key: "request", step: "request", actor: "regulator", contentHash: "0x01" },
    { key: "approve:audit-team", step: "approve", actor: "audit-team", contentHash: "0x02" },
    { key: "access", step: "access", actor: "regulator", contentHash: "0x03" },
  ];
  assert.deepEqual(pendingRecords(plan, {}).map((p) => p.key), ["request", "approve:audit-team", "access"]);
  assert.deepEqual(pendingRecords(plan, { request: { uid: "0xaa", tx: "0xbb" } }).map((p) => p.key), ["approve:audit-team", "access"]);
  // 같은 키라도 내용이 바뀌었으면 이어 하지 않는다
  assert.throws(() => pendingRecords(plan, { request: { uid: "0xaa", tx: "0xbb", contentHash: "0x99" } }), /내용이 다릅니다/);
});

import { resumeAction } from "./audit-access.ts";

test("보낸 뒤 영수증을 기다리다 끊긴 기록은 다시 보내기 전에 그 tx 의 영수증부터 본다", () => {
  const sent = { tx: "0xbb" as const, sent: true as const, contentHash: "0xcc" as const };
  assert.equal(resumeAction(undefined, { receipt: "none", inMempool: false }), "send");
  assert.equal(resumeAction({ uid: "0xaa", tx: "0xbb" }, { receipt: "none", inMempool: false }), "done");
  assert.equal(resumeAction(sent, { receipt: "success", inMempool: false }), "adopt");
  assert.equal(resumeAction(sent, { receipt: "reverted", inMempool: false }), "failed");
  assert.equal(resumeAction(sent, { receipt: "none", inMempool: true }), "wait");
  assert.equal(resumeAction(sent, { receipt: "none", inMempool: false }), "send");
});

test("보냈지만 확인하지 못한 기록은 남은 기록으로 센다", () => {
  const plan = [
    { key: "request", step: "request" as const, actor: "regulator" as const, contentHash: "0x01" as const },
    { key: "access", step: "access" as const, actor: "regulator" as const, contentHash: "0x02" as const },
  ];
  assert.deepEqual(pendingRecords(plan, { request: { tx: "0xbb", sent: true } }).map((p) => p.key), ["request", "access"]);
});

import { approvalReason } from "./audit-access.ts";

test("요청 형식에 문제가 있으면 승인이 둘이어도 열지 않는다", () => {
  const r = request({ legalBasis: " " });
  const h = requestHash(r);
  const d = decide(r, [
    { requestHash: h, approver: "audit-team", decision: "approve", reason: "", at: "" },
    { requestHash: h, approver: "external-auditor", decision: "approve", reason: "", at: "" },
  ], 2);
  assert.equal(d.open, false);
  assert.match(d.reason, /법적 근거/);
});

test("승인과 거절의 이유는 결정과 요청 범위를 함께 쓴다", () => {
  assert.match(approvalReason("approve", false), /맞/);
  assert.match(approvalReason("approve", true), /넓지만 승인/);
  assert.match(approvalReason("reject", true), /넓/);
  assert.match(approvalReason("reject", false), /맞지만 거절/);
});
