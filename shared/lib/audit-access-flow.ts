// 통제된 열람 시제품의 흐름. A 레시피(pnpm a:audit-access)와 B 연습(pnpm b:audit-drill)이 함께 쓴다.
//
//   0  로컬 실행 폴더에서 감사 공개 세 건을 찾는다(협력사 B 지급 1건, 협력사 A 일괄 지급 2건)       [Local]
//   1  감사 epoch 비밀키를 내부 감사팀, 외부감사인, 규제기관의 2-of-3 몫으로 나눈다               [Local]
//   2  규제기관이 사건, 법적 근거, 기간, 대상 tx 를 적어 요청한다
//   3  승인 하나로 열기를 시도한다(열리지 않아야 한다). 요청한 역할의 승인은 세지 않는다
//   4  두 번째 승인 뒤 승인한 두 역할이 요청한 암호문에만 부분값을 내고, 합쳐 연다                  [Local]
//   5  요청에 없는 감사 공개는 부분값을 만들지 않고, 다른 암호문의 부분값으로는 열리지 않는다      [Local]
//   6  요청, 승인, 거절, 열람의 해시를 Maroo 테스트넷 EAS 증명으로 남긴다(audit-access-chain.ts)    [Live Testnet]
//
// 금액과 주소 같은 평문은 화면과 로컬 기록에만 두고 체인에는 싣지 않는다.

import fs from "node:fs";
import path from "node:path";
import { type Hex } from "viem";
import { ROOT } from "./paths.ts";
import {
  approvalReason,
  HOLDERS, HOLDER_LABEL, checkRequest, decide, inScope, recordHash, requestHash,
  type AccessRequest, type Approval, type Holder, type RecordPlan, type Target,
} from "./audit-access.ts";
import { dealFromLocalAuditor, openWith, partialFor } from "./audit-threshold.ts";

type Json = Record<string, any>;
export const THRESHOLD = 2;

export type Envelope = Target & { label: string; envelopeHex: string; digestHex: string; cliView?: string };

// a:local 이 남긴 tx 조회 결과에서 감사 공개 봉투를 꺼낸다
export function findEnvelopes(runDir: string): Envelope[] {
  const out = path.join(runDir, "out");
  const read = (f: string): Json => JSON.parse(fs.readFileSync(path.join(out, f), "utf8"));
  const hex = (b64: string) => Buffer.from(b64, "base64").toString("hex");
  const list: Envelope[] = [];
  for (const [file, label, views] of [
    ["pay-supplier-b-query.json", "협력사 B 지급", ["pay-supplier-b-audit-view.json"]],
    ["pay-supplier-a-query.json", "협력사 A 일괄 지급", ["pay-supplier-a-audit-view-0.json", "pay-supplier-a-audit-view-1.json"]],
  ] as const) {
    const q = read(file);
    (q.tx.body.messages as Json[]).forEach((m, i) => list.push({
      tx: q.txhash, message: i, time: q.timestamp, label: `${label} 메시지 ${i}`,
      envelopeHex: hex(m.audit_disclosure_payload), digestHex: hex(m.audit_disclosure_digest),
      cliView: views[i] && fs.existsSync(path.join(out, views[i])) ? path.join(out, views[i]) : undefined,
    }));
  }
  return list;
}

// hint: 로컬 실행 폴더가 없을 때 안내할 명령(A 는 pnpm a:local, B 는 pnpm b:step 3)
export function latestRunDir(hint = "pnpm a:local"): string {
  const work = path.join(ROOT, ".work");
  const dirs = fs.existsSync(work)
    ? fs.readdirSync(work).filter((d) => d.startsWith("vendor-") && fs.existsSync(path.join(work, d, "out/pay-supplier-b-query.json"))).sort()
    : [];
  if (!dirs.length) throw new Error(`감사 공개가 든 로컬 실행 폴더가 없습니다. ${hint} 를 먼저 실행하십시오(1분 안팎).`);
  return path.join(work, dirs.at(-1)!);
}

export type FlowOptions = {
  runDir: string;
  caseDir: string;
  // narrow: 사건 대상 tx 한 건만 요청. wide: 같은 사건에 협력사 A 지급까지 넣어 요청(B 연습의 판단 단계)
  scenario: "narrow" | "wide";
  decisions: Partial<Record<Holder, "approve" | "reject">>;
  beforeStage?: (n: number, info: { request?: AccessRequest; envelopes?: Envelope[] }) => Promise<void>;
};

export type FlowResult = {
  request: AccessRequest; requestHash: Hex; approvals: Approval[]; plan: RecordPlan[];
  checks: Json[]; shares: Json; opened?: Json; decision: Json;
};

const now = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");

export async function runLocalAccess(o: FlowOptions): Promise<FlowResult> {
  const checks: Json[] = [];
  const check = (name: string, ok: boolean, detail: string) => {
    checks.push({ name, ok, detail });
    console.log(`  [${ok ? "확인" : "어긋남"}] ${name}: ${detail}`);
  };
  fs.mkdirSync(o.caseDir, { recursive: true, mode: 0o700 });

  await o.beforeStage?.(0, {});
  const envelopes = findEnvelopes(o.runDir);
  console.log(`0) 로컬 실행 ${path.relative(ROOT, o.runDir)} 에서 감사 공개를 찾았습니다(${envelopes.length}건).`);
  for (const e of envelopes) console.log(`   ${e.label}  tx ${e.tx.slice(0, 10)}…  ${e.time}`);
  const [bPay] = envelopes;

  await o.beforeStage?.(1, { envelopes });
  console.log("1) 감사 epoch 비밀키를 내부 감사팀, 외부감사인, 규제기관의 몫으로 나눕니다. 몫 두 개가 있어야 엽니다.");
  const shares = dealFromLocalAuditor(path.join(o.runDir, "home"), HOLDERS, THRESHOLD, path.join(o.caseDir, "shares"));
  for (const h of shares.holders) console.log(`   ${HOLDER_LABEL[h.holder as Holder]}  몫 번호 ${h.index}  몫 공개값 ${h.share_pub_hex.slice(0, 16)}…  파일 ${path.relative(ROOT, h.file)}`);
  const targetPub = Buffer.from(JSON.parse(fs.readFileSync(path.join(o.runDir, "out/pay-supplier-b-query.json"), "utf8")).tx.body.messages[0].audit_disclosure_target_pubkey, "base64").toString("hex");
  check("몫이 감사 공개키로 합쳐짐", shares.audit_pubkey_hex === targetPub, `몫 공개값 두 개를 합친 값과 체인의 감사 공개키 ${targetPub.slice(0, 16)}…가 ${shares.audit_pubkey_hex === targetPub ? "같습니다" : "다릅니다"}`);

  const day = bPay.time.slice(0, 10);
  const targets = o.scenario === "wide" ? envelopes : [bPay];
  const request: AccessRequest = {
    caseId: `CASE-${day.replace(/-/g, "")}-${o.scenario === "wide" ? "B2" : "B1"}`,
    requester: "regulator",
    legalBasis: "협력사 B 앞 지급 한 건의 자금 출처 확인(가상의 사건)",
    period: { from: `${day}T00:00:00Z`, to: `${day}T23:59:59Z` },
    targets: targets.map(({ tx, message, time }) => ({ tx, message, time })),
    fields: ["amount", "from", "to"],
    requestedAt: now(),
  };
  const rh = requestHash(request);
  fs.writeFileSync(path.join(o.caseDir, "request.json"), JSON.stringify(request, null, 2));

  await o.beforeStage?.(2, { request, envelopes });
  console.log("2) 규제기관이 열람을 요청합니다.");
  console.log(`   사건 ${request.caseId}, 근거: ${request.legalBasis}`);
  console.log(`   기간 ${request.period.from} ~ ${request.period.to}, 항목 ${request.fields.join(", ")}`);
  for (const t of request.targets) console.log(`   대상 ${envelopes.find((e) => e.tx === t.tx && e.message === t.message)!.label}  tx ${t.tx.slice(0, 10)}…`);
  console.log(`   요청 해시 ${rh}`);
  const problems = checkRequest(request);
  check("요청 형식", problems.length === 0, problems.length ? problems.join(" ") : "법적 근거, 기간, 대상, 항목이 모두 있고 대상 tx 가 기간 안에 있습니다");

  const approve = (approver: Holder): Approval => {
    const decision = o.decisions[approver] ?? "approve";
    return { requestHash: rh, approver, decision, reason: approvalReason(decision, o.scenario === "wide"), at: now() };
  };
  const partialsDir = path.join(o.caseDir, "partials");
  fs.mkdirSync(partialsDir, { recursive: true, mode: 0o700 });
  const partialPath = (h: Holder, e: Envelope) => path.join(partialsDir, `${h}-${e.tx.slice(0, 8)}-${e.message}.json`);
  const makePartial = (h: Holder, e: Envelope) => {
    const p = partialFor(path.join(o.caseDir, "shares", `share-${h}.json`), e.envelopeHex);
    fs.writeFileSync(partialPath(h, e), JSON.stringify(p, null, 2), { mode: 0o600 });
    return partialPath(h, e);
  };

  await o.beforeStage?.(3, { request, envelopes });
  const first = approve("audit-team");
  console.log(`3) 내부 감사팀이 ${first.decision === "approve" ? "승인" : "거절"}합니다.`);
  const self = decide(request, [{ ...approve("regulator"), decision: "approve" }, first], THRESHOLD);
  check("요청한 역할의 승인을 세지 않음", !self.open, self.reason);
  const one = decide(request, [first], THRESHOLD);
  check("승인 하나로는 열지 않음", !one.open, one.reason);
  const tryOne = openWith(bPay.envelopeHex, [makePartial("audit-team", bPay)], THRESHOLD, bPay.digestHex);
  check("부분값 하나로는 열리지 않음", !tryOne.ok, tryOne.ok ? "열렸습니다" : tryOne.error);

  await o.beforeStage?.(4, { request, envelopes });
  const second = approve("external-auditor");
  console.log(`4) 외부감사인이 ${second.decision === "approve" ? "승인" : "거절"}합니다.`);
  const approvals = [first, second];
  const d = decide(request, approvals, THRESHOLD);
  console.log(`   판정: ${d.open ? "엽니다" : "열지 않습니다"}. ${d.reason}`);
  let opened: Json | undefined;
  if (d.open) {
    const results: Json[] = [];
    for (const e of envelopes.filter((x) => inScope(request, x))) {
      const files = d.approvers.map((h) => makePartial(h, e));
      const r = openWith(e.envelopeHex, files, THRESHOLD, e.digestHex);
      if (!r.ok) throw new Error(`${e.label}을 열지 못했습니다: ${r.error}`);
      const p = r.opened.payload;
      const match = r.opened.verification.on_chain_disclosure_digest_match === true;
      console.log(`   ${e.label}: 금액 ${p.amount}, 보낸 주소 ${p.from_shielded_address.slice(0, 16)}…, 받는 주소 ${p.to_shielded_address.slice(0, 16)}…, 체인 해시 대조 ${match ? "일치" : "불일치"}`);
      check(`${e.label} 감사 공개를 두 부분값으로 엶`, r.opened.verification.verified === true && match, `열린 내용의 disclosure 해시와 체인에 기록된 해시가 ${match ? "같습니다" : "다릅니다"}`);
      if (e.cliView) {
        const v = JSON.parse(fs.readFileSync(e.cliView, "utf8")).summary;
        const same = v.amount === p.amount && v.from_shielded_address === p.from_shielded_address && v.to_shielded_address === p.to_shielded_address;
        check(`${e.label} 결과가 감사인 키로 직접 푼 결과와 같음`, same, `로컬 실행이 감사인 키 하나로 푼 기록(${path.basename(e.cliView)})과 금액, 보낸 주소, 받는 주소를 견줬습니다`);
      }
      results.push({ label: e.label, tx: e.tx, message: e.message, envelopeSha256: r.opened.envelope_sha256, disclosureDigest: p.disclosure_digest_hex, approvers: d.approvers, payload: p });
    }
    opened = { results };

    await o.beforeStage?.(5, { request, envelopes });
    const outside = envelopes.filter((x) => !inScope(request, x));
    console.log("5) 요청에 없는 감사 공개를 같은 승인으로 열기를 시도합니다.");
    if (!outside.length) console.log("   요청이 감사 공개 세 건을 모두 담아 범위 밖 대상이 없습니다.");
    for (const e of outside) {
      check(`${e.label}은 요청 범위 밖`, !inScope(request, e), "요청에 없는 tx 라 승인한 역할에게 부분값을 요청하지 않습니다");
      const guard = openWith(e.envelopeHex, d.approvers.map((h) => partialPath(h, bPay)), THRESHOLD, e.digestHex);
      check(`${e.label}에 협력사 B 건의 부분값을 넣으면 도구가 거부함`, !guard.ok, guard.ok ? "열렸습니다" : guard.error);
      // 해시 비교를 건너뛰고 복호까지 시도한다. 부분값은 그 암호문의 임시 공개키에 묶여 있어 암호로도 열리지 않는다.
      const raw = openWith(e.envelopeHex, d.approvers.map((h) => partialPath(h, bPay)), THRESHOLD, e.digestHex, true);
      check(`${e.label}은 협력사 B 건의 부분값으로 복호되지 않음`, !raw.ok, raw.ok ? "열렸습니다" : raw.error);
    }
  }

  // 체인에 남길 기록. 내용 해시에는 평문(금액, 주소)을 넣지 않는다.
  const plan: RecordPlan[] = [
    { key: "request", step: "request", actor: "regulator", contentHash: recordHash("request", request) },
    ...approvals.map((a): RecordPlan => ({ key: `${a.decision}:${a.approver}`, step: a.decision, actor: a.approver, contentHash: recordHash(a.decision, a) })),
  ];
  if (opened) {
    const access = { requestHash: rh, approvers: d.approvers, at: now(), opened: (opened.results as Json[]).map((r) => ({ tx: r.tx, message: r.message, envelopeSha256: r.envelopeSha256, disclosureDigest: r.disclosureDigest })) };
    plan.push({ key: "access", step: "access", actor: "regulator", contentHash: recordHash("access", access) });
    fs.writeFileSync(path.join(o.caseDir, "access.json"), JSON.stringify(access, null, 2));
  }
  fs.writeFileSync(path.join(o.caseDir, "approvals.json"), JSON.stringify(approvals, null, 2));
  fs.writeFileSync(path.join(o.caseDir, "plan.json"), JSON.stringify({ caseId: request.caseId, requestHash: rh, plan }, null, 2));
  return {
    request, requestHash: rh, approvals, plan, checks, opened, decision: d,
    shares: { auditPubKeyHex: shares.audit_pubkey_hex, holders: shares.holders.map(({ holder, index, share_pub_hex }) => ({ holder, index, sharePubHex: share_pub_hex })) },
  };
}
