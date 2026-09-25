// local-vendor-settlement.ts 가 남긴 JSON 을 읽어 실행 기록 마크다운을 만든다.
//
// 기록에는 세 가지를 적는다. 단계별 tx, 역할마다 자기 키로 푼 내용, 제3자가 공개 체인에서
// 그대로 읽을 수 있는 필드다. 해석은 적지 않는다. 가이드가 이 기록을 인용해 해석한다.

import fs from "node:fs";
import path from "node:path";

type Json = Record<string, any>;

export const STEPS: [string, string][] = [
  ["deposit-12", "구매 기업 예치 12"],
  ["deposit-8", "구매 기업 예치 8"],
  ["deposit-15", "구매 기업 예치 15"],
  ["deposit-zero-1", "구매 기업 0 노트 예치"],
  ["deposit-zero-2", "구매 기업 0 노트 예치"],
  ["deposit-zero-3", "구매 기업 0 노트 예치"],
  ["pay-supplier-a", "협력사 A 지급: 송장 12, 8 일괄 전송"],
  ["pay-supplier-b", "협력사 B 지급: 송장 15, 수신자 암호화 disclosure"],
  ["withdraw-alone", "협력사 A 인출 12, 단독으로 보냄"],
  ["cobl-deposit", "구매 기업 0 노트 예치, 인출과 같은 블록"],
  ["supplier-a-withdraw", "협력사 A 인출 12, 0 노트 예치와 같은 블록"],
];

const load = (out: string, name: string): Json => JSON.parse(fs.readFileSync(path.join(out, name), "utf8"));

function spendable(out: string, name: string): number[] {
  return (load(out, name).notes as Json[]).filter((n) => n.status === "spendable").map((n) => Number(n.amount)).sort((a, b) => a - b);
}

function balance(out: string, name: string, denom = "uclair"): bigint {
  const coin = (load(out, name).balances as Json[] | undefined)?.find((c) => c.denom === denom);
  return coin ? BigInt(coin.amount) : 0n;
}

// 제3자가 tx 본문에서 읽을 수 있는 값. 암호문과 증명 같은 불투명 값은 필드 이름만 적는다.
function publicFields(query: Json): { kind: string; seen: string[]; opaque: string[] }[] {
  return (query.tx.body.messages as Json[]).map((msg) => ({
    kind: String(msg["@type"]).split(".").pop()!,
    seen: ["creator", "amount", "recipient"].filter((k) => msg[k]).map((k) => `${k}=\`${msg[k]}\``),
    opaque: Object.keys(msg).filter((k) => !["@type", "creator", "amount", "recipient"].includes(k)),
  }));
}

function disclosure(out: string, name: string) {
  const doc = load(out, name);
  const s = doc.summary ?? {};
  return `verified=${doc.verification?.verified}, ${s.delivery}, 필드 [${(s.disclosed_fields ?? []).join(", ")}], amount ${s.amount}`;
}

export function writeReport(opts: { out: string; report: string; coreSha: string; chainId: string; stamp: string; goVersion: string; command: string }) {
  const { out } = opts;
  const lines: string[] = [
    `# 비공개 공급업체 정산 로컬 실행 기록 · ${opts.stamp}`,
    "",
    "> 증거 라벨: `[Local]`. Clairveil 로컬 체인에서 실행한 기록입니다. Maroo 테스트넷에서 실행한 기록은 같은 트랙의 `evidence/live/`에 있습니다.",
    `> 실행 환경: Clairveil \`${opts.coreSha}\`(v0.4.0), chain-id \`${opts.chainId}\`, ${opts.goVersion.replace(/^go version go/, "Go ")}`,
    `> 재현 명령: \`${opts.command}\`. 명령마다 받은 원본 JSON은 실행 폴더 \`.work/vendor-<시각>/out/\`에 남고, 레포에는 올리지 않습니다.`,
    "> 금액은 로컬 체인 자산 `uclair`의 정수 단위입니다.",
    "",
    "## 1. 단계별 tx",
    "",
    "| 단계 | tx | 높이 | 결과 | gas_used |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const [name, label] of STEPS) {
    const q = load(out, `${name}-query.json`);
    const result = (q.code ?? 0) === 0 ? "성공" : `실패 code ${q.code}: \`${String(q.raw_log ?? "").slice(0, 200)}\``;
    lines.push(`| ${label} | \`${q.txhash}\` | ${q.height} | ${result} | ${q.gas_used} |`);
  }

  lines.push("", "## 2. 역할마다 자기 키로 본 것", "", "| 누가 | 무엇을 | 결과 |", "| --- | --- | --- |");
  lines.push(`| 구매 기업 | 지급 전 자기 노트 | spendable [${spendable(out, "buyer-notes-before.json").join(", ")}] |`);
  lines.push(`| 협력사 A | 받은 노트 스캔 | spendable [${spendable(out, "supplier-a-notes.json").join(", ")}] |`);
  lines.push(`| 협력사 B | 받은 노트 스캔 | spendable [${spendable(out, "supplier-b-notes.json").join(", ")}] |`);
  lines.push(`| 협력사 B | B 지급 tx의 수신자 disclosure | ${disclosure(out, "pay-supplier-b-recipient-view.json")} |`);
  lines.push(`| 구매 기업 | B 지급 tx의 self-view | ${disclosure(out, "pay-supplier-b-self-view.json")} |`);
  lines.push(`| 감사인 | B 지급 tx의 감사 disclosure | ${disclosure(out, "pay-supplier-b-audit-view.json")} |`);
  for (const f of fs.readdirSync(out).filter((f) => /^pay-supplier-a-audit-view-\d+\.json$/.test(f)).sort()) {
    const i = f.match(/(\d+)\.json$/)![1];
    lines.push(`| 감사인 | A 일괄 지급 tx의 메시지 ${i} 감사 disclosure(암호문 직접 해독) | ${disclosure(out, f)} |`);
  }
  const before = balance(out, "supplier-a-balance-before.json");
  const after = balance(out, "supplier-a-balance-after.json");
  const wq = load(out, "supplier-a-withdraw-query.json");
  const fee = (wq.tx.auth_info.fee.amount as Json[]).filter((c) => c.denom === "uclair").reduce((s, c) => s + BigInt(c.amount), 0n);
  const feeNote = after - before === 12n ? "fee는 잔액에서 빠지지 않았습니다" : "fee가 잔액에서 빠졌습니다";
  lines.push(`| 협력사 A | 인출 전후 투명 잔액 | ${before} → ${after} (차이 ${after - before}. tx에 적힌 fee ${fee}, ${feeNote}) |`);
  lines.push(`| 협력사 A | 인출 뒤 남은 노트 | spendable [${spendable(out, "supplier-a-notes-after.json").join(", ")}] |`);
  lines.push(`| 누구나 | 차폐 풀 준비금 불변식 | invariant_holds=${load(out, "reserve.json").invariant_holds} |`);

  lines.push("", "## 3. 제3자가 공개 체인에서 읽을 수 있는 것", "",
    "| 단계 | 메시지 | 읽히는 값 | 값이 아닌 필드(암호문, 증명, 커밋먼트 등) |", "| --- | --- | --- | --- |");
  for (const [name, label] of STEPS) {
    const q = load(out, `${name}-query.json`);
    if ((q.code ?? 0) !== 0) continue;
    for (const f of publicFields(q)) lines.push(`| ${label} | ${f.kind} | ${f.seen.join(", ") || "없음"} | ${f.opaque.join(", ")} |`);
  }

  const amountOf = (name: string) => Number(String(load(out, `${name}-query.json`).tx.body.messages[0].amount).replace(/uclair$/, ""));
  const deposits = ["deposit-12", "deposit-8", "deposit-15"].map(amountOf).sort((a, b) => a - b);
  const withdrawn = amountOf("supplier-a-withdraw");
  const alone = load(out, "withdraw-alone-query.json");
  const cobl = load(out, "cobl-deposit-query.json");
  const aMsgs = load(out, "pay-supplier-a-query.json").tx.body.messages.length;
  const result = (q: Json) => ((q.code ?? 0) === 0 ? "성공했습니다" : `실패했습니다(code ${q.code})`);
  lines.push("", "## 4. 기록에서 바로 읽히는 사실", "",
    `- 인출을 단독으로 보낸 tx는 높이 ${alone.height}에서 ${result(alone)}. 0 노트 예치와 같은 블록(높이 ${cobl.height})에 넣은 인출은 높이 ${wq.height}에서 ${result(wq)}.`,
    `- 예치 금액([${deposits.join(", ")}])과 협력사 A의 인출 금액(${withdrawn})은 모두 공개됩니다. ${deposits.includes(withdrawn) ? "인출 금액이 예치 금액 가운데 하나와 같아, 두 거래를 금액으로 이을 수 있습니다." : "인출 금액은 어느 예치 금액과도 같지 않습니다."}`,
    `- 협력사 A 일괄 지급 tx에는 MsgTransfer가 ${aMsgs}개 들어 있어 송장 건수가 공개됩니다.`,
    "- 지급 tx(MsgTransfer)에는 amount와 recipient 필드가 없습니다. 보낸 계정(creator)은 공개됩니다.",
    "");
  fs.writeFileSync(opts.report, lines.join("\n"));
}
