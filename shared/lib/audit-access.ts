// 통제된 열람의 규칙. 요청, 승인, 범위 확인, 기록 해시를 정한다. 체인과 Clairveil 을 부르지 않는다.
//
// 마루 라이트페이퍼 5.6.2 의 원칙을 이 레포의 시제품 규칙으로 옮겼다.
//   다중 승인과 역할 분리: 몫을 가진 세 역할 가운데 요청한 역할을 뺀 승인이 threshold 개 있어야 연다
//   범위 제한: 요청에 적은 tx 와 메시지만 부분 복호한다
//   기록: 요청, 승인, 거절, 열람의 내용 해시를 남긴다(체인 기록은 audit-access-chain.ts)

import { keccak256, toHex, type Hex } from "viem";

export type Holder = "audit-team" | "external-auditor" | "regulator";
export const HOLDERS: Holder[] = ["audit-team", "external-auditor", "regulator"];
export const HOLDER_LABEL: Record<Holder, string> = { "audit-team": "내부 감사팀", "external-auditor": "외부감사인", regulator: "규제기관" };

export type Target = { tx: string; message: number; time: string };
export type AccessRequest = {
  caseId: string;
  requester: Holder;
  legalBasis: string;
  period: { from: string; to: string };
  targets: Target[];
  fields: ("amount" | "from" | "to")[];
  requestedAt: string;
};
export type Approval = { requestHash: Hex; approver: Holder; decision: "approve" | "reject"; reason: string; at: string };

// 키를 정렬한 JSON. 같은 내용이면 키 순서와 상관없이 같은 해시가 나온다.
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

export const requestHash = (r: AccessRequest): Hex => keccak256(toHex(canonical(r)));
export const recordHash = (step: Step, content: unknown): Hex => keccak256(toHex(canonical({ step, content })));

// 요청 자체의 문제. 하나라도 있으면 승인 단계로 넘기지 않는다.
export function checkRequest(r: AccessRequest): string[] {
  const problems: string[] = [];
  if (!r.legalBasis.trim()) problems.push("법적 근거가 비어 있습니다.");
  if (!r.targets.length) problems.push("열람할 대상 tx가 없습니다.");
  const from = Date.parse(r.period.from), to = Date.parse(r.period.to);
  if (!(from <= to)) problems.push("기간의 시작이 끝보다 늦습니다.");
  for (const t of r.targets) {
    const at = Date.parse(t.time);
    if (!(from <= at && at <= to)) problems.push(`대상 tx ${t.tx.slice(0, 10)}의 시각(${t.time})이 요청 기간 밖입니다.`);
  }
  if (!r.fields.length) problems.push("열람할 항목이 없습니다.");
  return problems;
}

export type Decision = { open: boolean; approvers: Holder[]; reason: string };

export function decide(r: AccessRequest, approvals: Approval[], threshold: number): Decision {
  // 요청 자체에 문제가 있으면(법적 근거 없음, 기간 밖 대상 등) 승인 수와 상관없이 열지 않는다
  const problems = checkRequest(r);
  if (problems.length) return { open: false, approvers: [], reason: `요청 형식이 맞지 않아 열지 않습니다. ${problems.join(" ")}` };
  const h = requestHash(r);
  const mine = approvals.filter((a) => a.requestHash === h);
  const rejecters = [...new Set(mine.filter((a) => a.decision === "reject").map((a) => a.approver))];
  if (rejecters.length) {
    // 세 역할 이름이 모두 받침으로 끝나 조사 「이」를 붙인다
    return { open: false, approvers: [], reason: `${rejecters.map((x) => HOLDER_LABEL[x]).join(", ")}이 거절했습니다.` };
  }
  const approvers = [...new Set(mine.filter((a) => a.decision === "approve" && a.approver !== r.requester).map((a) => a.approver))];
  const self = mine.some((a) => a.approver === r.requester);
  if (approvers.length >= threshold) {
    return { open: true, approvers, reason: `요청한 역할을 뺀 승인 ${approvers.length}건으로 기준(${threshold}건)을 채웠습니다.` };
  }
  const note = self ? " 요청한 역할의 승인은 세지 않습니다." : "";
  return { open: false, approvers, reason: `요청한 역할을 뺀 승인이 ${approvers.length}건이라 기준(${threshold}건)에 못 미칩니다.${note}` };
}

export const inScope = (r: AccessRequest, t: Pick<Target, "tx" | "message">) =>
  r.targets.some((x) => x.tx.toLowerCase() === t.tx.toLowerCase() && x.message === t.message);

// 체인에 남길 기록 하나. key 로 이어 하기를 판단한다.
export type Step = "request" | "approve" | "reject" | "access";
export const STEP_CODE: Record<Step, number> = { request: 1, approve: 2, reject: 3, access: 4 };
export const STEP_LABEL: Record<Step, string> = { request: "요청", approve: "승인", reject: "거절", access: "열람" };
export type RecordPlan = { key: string; step: Step; actor: Holder; contentHash: Hex };
// uid 가 있으면 남긴 기록, sent 만 있으면 보냈지만 영수증을 확인하지 못한 기록이다(다시 보내기 전에 그 tx 부터 본다).
// serialized 는 서명한 tx 원문이다. 이어 하기는 새로 서명하지 않고 이 tx 를 다시 보낸다. 상태 파일은 .work/ 아래(git 밖)에 있다.
export type RecordState = Record<string, { uid?: Hex; tx: Hex; contentHash?: Hex; sent?: true; serialized?: Hex }>;

// 같은 서명 tx 를 다시 보낸 결과. 오류가 없으면 ok(노드가 받음), already known 이면 대기열에 있음,
// nonce too low 면 그 논스를 다른 tx 가 써서 이 tx 는 블록에 들어갈 수 없음.
export type Rebroadcast = "ok" | "known" | "nonce-too-low" | "network" | "other";
export function rebroadcastOutcome(message: string | undefined): Rebroadcast {
  if (message === undefined) return "ok";
  if (/already known|already exists|known transaction/i.test(message)) return "known";
  if (/nonce too low|invalid nonce/i.test(message)) return "nonce-too-low";
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed|ETIMEDOUT|ECONNRESET|socket hang up|took too long|HTTP request failed/i.test(message)) return "network";
  return "other";
}

// 이어 하기에서 기록 하나를 어떻게 할지. 보낸 tx 의 영수증이 있으면 그것을 쓰고(adopt), 없으면 서명해 둔 같은 tx 를
// 다시 보낸 답(rebroadcast)으로 정한다. 그 tx 가 블록에 들어갈 수 없을 때(nonce too low)만 새로 보내고, 나머지는 기다린다.
// Maroo 테스트넷은 블록 전 tx 를 pending 논스와 eth_getTransactionByHash 에 보이지 않아(2026-10-23 실측) inMempool 로는
// 대기열의 tx 를 찾지 못한다. inMempool 은 serialized 가 없는 옛 상태 파일에만 쓴다.
// 같은 기록을 두 번 남기지 않으려는 순서다.
export function resumeAction(entry: RecordState[string] | undefined, chain: { receipt: "success" | "reverted" | "none"; inMempool: boolean; rebroadcast?: Rebroadcast }): "done" | "send" | "adopt" | "failed" | "wait" {
  if (!entry) return "send";
  if (entry.uid) return "done";
  if (chain.receipt === "success") return "adopt";
  if (chain.receipt === "reverted") return "failed";
  if (chain.rebroadcast) return chain.rebroadcast === "nonce-too-low" ? "send" : "wait";
  return chain.inMempool ? "wait" : "send";
}

// 이어 하기에서 지난 실행이 보낸 기록 tx 하나를 체인에 물어 할 일을 정한다. 체인 호출은 부른 쪽이 넘긴다.
export type ResumeIo<R> = {
  receipt: () => Promise<R | undefined>;
  status: (r: R) => "success" | "reverted";
  rebroadcast?: () => Promise<Rebroadcast>;
  inMempool: () => Promise<boolean>;
  // nonce too low 뒤에 영수증을 다시 읽는 법. 없으면 receipt 를 한 번 더 부른다.
  recheck?: () => Promise<R | undefined>;
};
export async function checkResume<R>(entry: RecordState[string], io: ResumeIo<R>): Promise<{ action: ReturnType<typeof resumeAction>; receipt?: R; rebroadcast?: Rebroadcast }> {
  let receipt = await io.receipt();
  const rebroadcast = receipt || !io.rebroadcast ? undefined : await io.rebroadcast();
  // nonce too low 는 그 논스를 쓴 tx 가 블록에 들어갔다는 답이다. 영수증을 읽은 뒤 다시 보내기 전에 들어간 것이
  // 이 tx 일 수 있으니, 새로 보내기 전에 영수증을 한 번 더 본다.
  if (!receipt && rebroadcast === "nonce-too-low") receipt = await (io.recheck ?? io.receipt)();
  const inMempool = receipt || rebroadcast ? false : await io.inMempool();
  return { action: resumeAction(entry, { receipt: receipt ? io.status(receipt) : "none", inMempool, rebroadcast }), receipt, rebroadcast };
}

// 남기지 않은 기록만 순서대로. 이미 남긴 키의 내용 해시가 계획과 다르면 이어 하지 않는다.
export function pendingRecords(plan: RecordPlan[], state: RecordState): RecordPlan[] {
  for (const p of plan) {
    const done = state[p.key];
    if (done?.contentHash && done.contentHash !== p.contentHash) {
      throw new Error(`이미 남긴 기록 ${p.key}의 내용이 다릅니다. 같은 사건을 다른 내용으로 이어 쓸 수 없습니다. 새 사건으로 다시 실행하십시오.`);
    }
  }
  return plan.filter((p) => !state[p.key]?.uid);
}

// 승인이나 거절에 남기는 이유. 결정과 요청 범위(사건보다 넓은지)를 함께 쓴다.
export function approvalReason(decision: "approve" | "reject", wide: boolean): string {
  if (decision === "approve") return wide ? "요청 범위가 사건보다 넓지만 승인함" : "요청 범위가 사건과 맞음";
  return wide ? "요청 범위가 사건보다 넓음" : "요청 범위가 사건과 맞지만 거절함";
}
