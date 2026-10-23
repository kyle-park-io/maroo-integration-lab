// 에이전트 한도 결제 앱의 전표 기록(.work/agent-app/log.json)을 증거 파일로 옮긴다. [Live Testnet]
//
//   pnpm c:app-record
//
// 전표마다 무엇을 시험했는지 결과 이름으로 묶어 함께 적는다. 키와 서명 값은 기록에 없다.

import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../../shared/lib/paths.ts";
import { writeEvidence } from "../../shared/lib/maroo.ts";

const file = path.join(ROOT, ".work/agent-app/log.json");
if (!fs.existsSync(file)) {
  console.log("전표 기록이 없습니다. pnpm c:app 으로 앱을 띄우고 결제를 한 번 요청한 뒤 다시 실행하십시오.");
  process.exit(1);
}
const log = JSON.parse(fs.readFileSync(file, "utf8")) as { id: number; kind: string; outcome: string; receiptMs?: number; tx?: string }[];
const CASES: Record<string, string> = {
  success: "한도 안 결제가 블록에 들어감",
  rejected: "사전 검사(eth_estimateGas)에서 PCL 이 거절해 보내지 않음",
  failed: "블록에 들어갔지만 되돌려져 가스비만 나감",
  refused: "노드가 tx 를 받지 않음(블록에 들어가지 않음)",
  blocked: "잔고가 결제 금액과 가스비 상한보다 적어 보내지 않음",
  network: "RPC 가 끊겨 보내지 않음",
  unknown: "보냈지만 영수증 대기 시간 안에 확인하지 못함(다시 읽어 결과 전표를 남김)",
};
const byOutcome = Object.fromEntries(Object.keys(CASES).map((k) => [k, log.filter((e) => e.kind === "pay" && e.outcome === k).map((e) => e.id)]));
const receipts = log.filter((e) => e.receiptMs !== undefined).map((e) => e.receiptMs!);
const out = writeEvidence(path.join(ROOT, "track-c-activate/evidence/live"), "agent-app", {
  checkedAt: new Date().toISOString(),
  label: "[Live Testnet] 에이전트 한도 결제 레퍼런스 앱(pnpm c:app)의 전표 기록",
  cases: Object.fromEntries(Object.entries(CASES).map(([k, v]) => [k, { meaning: v, slips: byOutcome[k] }])),
  receiptMs: { count: receipts.length, min: Math.min(...receipts), max: Math.max(...receipts) },
  log,
});
console.log(`기록: ${path.relative(ROOT, out)}`);
for (const [k, v] of Object.entries(CASES)) console.log(`  ${byOutcome[k].length ? "✓" : "✗"} ${v}: 전표 ${byOutcome[k].join(", ") || "없음"}`);
