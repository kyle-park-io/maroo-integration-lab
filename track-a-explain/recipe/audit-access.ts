// Track A 레시피: 통제된 열람 시제품. 감사 키를 2-of-3 몫으로 나누고, 요청과 두 승인이 있을 때 요청한 tx 의 감사 공개만 연다.
// 해독은 [Local](pnpm a:local 이 남긴 Clairveil 로컬 체인의 tx), 요청, 승인, 열람의 해시 기록은 [Live Testnet] EAS 증명이다.
//
//   pnpm a:audit-access                    로컬 열람과 테스트넷 기록. 역할 지갑 셋(AUDIT_TEAM, EXTERNAL_AUDITOR, REGULATOR)이 필요하다
//   pnpm a:audit-access --top-up           역할 지갑의 가스가 모자라면 KYB 발급자 지갑에서 채운다
//   pnpm a:audit-access --no-record        로컬 열람만 한다(키와 OKRW 없이)
//   pnpm a:audit-access --resume <사건 폴더>  기록이 중간에 멈췄을 때 남기지 않은 기록만 이어 보낸다
//   pnpm a:audit-access --run <로컬 실행 폴더>  기본은 가장 최근 .work/vendor-*
//
// 규칙은 shared/lib/audit-access.ts, 해독은 shared/lib/audit-threshold.ts, 체인 기록은 shared/lib/audit-access-chain.ts 에 있다.
// 설계와 한계는 track-a-explain/integration-guide.md 3절에 있다.

import "../../shared/lib/install-recipe-errors.ts";
import fs from "node:fs";
import path from "node:path";
import { getAddress, type Hex } from "viem";
import { ROOT } from "../../shared/lib/paths.ts";
import { addressOf, writeEvidence } from "../../shared/lib/maroo.ts";
import { HOLDER_LABEL, type Holder, type RecordPlan, type RecordState } from "../../shared/lib/audit-access.ts";
import { latestRunDir, runLocalAccess } from "../../shared/lib/audit-access-flow.ts";
import {
  AUDIT_SCHEMA, HOLDER_ROLE, ensureSchema, explorerStatus, fundRecorders, readBack, recordAll, schemaExists, schemaUidOf,
} from "../../shared/lib/audit-access-chain.ts";

const argv = process.argv.slice(2);
const opt = (name: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
const record = !argv.includes("--no-record");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

type Json = Record<string, any>;
let local: Json | undefined;
let caseDir: string;
let plan: RecordPlan[], caseId: string, requestHash: Hex;

if (opt("--resume")) {
  caseDir = path.resolve(opt("--resume")!);
  const saved = JSON.parse(fs.readFileSync(path.join(caseDir, "plan.json"), "utf8"));
  ({ plan, caseId, requestHash } = saved);
  const localFile = path.join(caseDir, "local.json");
  if (fs.existsSync(localFile)) local = { ...JSON.parse(fs.readFileSync(localFile, "utf8")), resumedAt: new Date().toISOString() };
  console.log(`사건 ${caseId} 의 기록을 이어 보냅니다(${path.relative(ROOT, caseDir)}).`);
} else {
  caseDir = path.join(ROOT, ".work/audit-access", stamp);
  const runDir = opt("--run") ? path.resolve(opt("--run")!) : latestRunDir();
  const r = await runLocalAccess({ runDir, caseDir, scenario: "narrow", decisions: {} });
  local = { runDir: path.relative(ROOT, runDir), ...r };
  fs.writeFileSync(path.join(caseDir, "local.json"), JSON.stringify(local, null, 2));
  ({ plan } = r);
  caseId = r.request.caseId;
  requestHash = r.requestHash;
  const failed = r.checks.filter((c) => !c.ok);
  if (failed.length) throw new Error(`로컬 확인 ${failed.length}건이 어긋나 기록을 보내지 않습니다: ${failed.map((c) => c.name).join(", ")}`);
}

let chain: Json | undefined;
if (record) {
  const stateFile = path.join(caseDir, "state.json");
  const state: RecordState = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : {};
  const pending = plan.filter((p) => !state[p.key]);
  const counts: Partial<Record<Holder, number>> = {};
  for (const p of pending) counts[p.actor] = (counts[p.actor] ?? 0) + 1;
  console.log(`6) 요청, 승인, 열람의 해시를 Maroo 테스트넷 EAS 증명으로 남깁니다(남은 기록 ${pending.length}건).`);
  const funding = await fundRecorders(counts, { topUp: argv.includes("--top-up"), extraFor: (await schemaExists()) ? undefined : "regulator" });
  for (const f of funding) console.log(`   ${HOLDER_LABEL[f.holder]} ${f.address} 잔액 ${f.before} OKRW${f.topUp ? `, 가스 ${f.topUp.amount} OKRW 보충` : ""}`);
  const schema = await ensureSchema("regulator");
  console.log(`   스키마 ${schema.uid}${schema.registeredTx ? " 등록" : " 재사용"}: ${AUDIT_SCHEMA}`);
  try {
    await recordAll(plan, { schemaUid: schema.uid, caseId, requestHash, stateFile });
  } catch (err) {
    console.log(`\n기록이 중간에 멈췄습니다. 이미 남긴 기록은 ${path.relative(ROOT, stateFile)} 에 있습니다.`);
    console.log(`원인을 고친 뒤 pnpm a:audit-access --resume ${path.relative(ROOT, caseDir)} 로 남은 기록만 이어 보냅니다.`);
    throw err;
  }
  const done: RecordState = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  const back = await readBack(done, schemaUidOf());
  const checks: Json[] = [];
  for (const b of back) {
    const p = plan.find((x) => x.key === b.key)!;
    const expectAttester = getAddress(addressOf(HOLDER_ROLE[p.actor]));
    const expectRef = p.step === "request" ? "0x" + "0".repeat(64) : done.request.uid;
    const ex = await explorerStatus(done[b.key].tx);
    const ok = b.schemaOk && getAddress(b.attester) === expectAttester && b.refUID === expectRef && !b.revocable && ex.indexed && ex.status === "ok";
    checks.push({ key: b.key, uid: b.uid, tx: done[b.key].tx, attester: b.attester, schemaOk: b.schemaOk, refUID: b.refUID, revocable: b.revocable, explorer: ex, ok });
    console.log(`  [${ok ? "확인" : "어긋남"}] ${b.key}: 증명자 ${HOLDER_LABEL[p.actor]}, ${p.step === "request" ? "첫 기록" : "요청 증명을 가리킴"}, 되돌릴 수 없음, 탐색기 ${ex.indexed ? `색인됨(${ex.status})` : "색인 안 됨"}`);
  }
  chain = { schema: { uid: schema.uid, definition: AUDIT_SCHEMA, registeredTx: schema.registeredTx }, funding, records: done, checks };
  if (checks.some((c) => !c.ok)) throw new Error("체인 기록을 다시 읽은 결과가 계획과 다릅니다. 위 [어긋남] 줄을 확인하십시오.");
}

const file = writeEvidence(path.join(ROOT, "track-a-explain/evidence/live"), "audit-access", {
  checkedAt: new Date().toISOString(),
  labels: { decrypt: "[Local] Clairveil 로컬 체인(pnpm a:local)의 감사 공개", records: record ? "[Live Testnet] Maroo 테스트넷 EAS 증명" : "기록하지 않음(--no-record)" },
  command: `pnpm a:audit-access ${argv.join(" ")}`.trim(),
  caseId, requestHash, caseDir: path.relative(ROOT, caseDir), local, chain,
});
console.log(`\n기록: ${path.relative(ROOT, file)}`);
