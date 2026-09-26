// Track A 레시피: PCL 정책에 걸려 되돌려진 tx 가 블록에 남고 가스를 얼마나 냈는지 영수증으로 확인한다. [Live Testnet]
//
//   pnpm a:reject-gas [금고 흐름 기록.json] [에이전트 한도 기록.json]
//
// 인자를 주지 않으면 레포에 있는 가장 최근 기록 두 개를 쓴다.
//   금고 흐름(pnpm a:kyb-gate)의 5, 6b, 7c 단계: claim() 의 EAS_POLICY 거부
//   에이전트 한도(pnpm c:agent-limit)의 4b 단계: fund() 의 AGENT_OKRW_TRANSFER_LIMIT_POLICY 거부
// tx 마다 영수증 상태, 블록, 가스 한도, 쓴 가스와 그 비율, 수수료를 남긴다. 조회만 하고 tx 는 보내지 않는다.
// 결과는 track-a-explain/evidence/live/reject-gas-<시각>.json 에 남긴다.

import fs from "node:fs";
import path from "node:path";
import { formatEther, type Hex } from "viem";
import { ROOT } from "../../shared/lib/paths.ts";
import { EXPLORER, publicClient as pub, writeEvidence } from "../../shared/lib/maroo.ts";

const latest = (dir: string, prefix: string) => {
  const files = fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.startsWith(prefix) && f.endsWith(".json")).sort();
  return path.join(dir, files[files.length - 1]);
};
const gateFile = process.argv[2] ?? latest("track-a-explain/evidence/live", "pcl-kyb-gate-");
const agentFile = process.argv[3] ?? latest("track-c-activate/evidence/live", "agent-limit-");
type Step = { step: string; tx?: Hex; reason?: string };
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")) as { steps: Step[] };

const picks = [
  ...read(gateFile).steps.filter((s) => /^(5|6b|7c)\)/.test(s.step) && s.tx).map((s) => ({ source: gateFile, ...s })),
  ...read(agentFile).steps.filter((s) => /^4b\) 에이전트 결제/.test(s.step) && s.tx).map((s) => ({ source: agentFile, ...s })),
];

const rows = [];
for (const s of picks) {
  const [r, t] = await Promise.all([pub.getTransactionReceipt({ hash: s.tx! }), pub.getTransaction({ hash: s.tx! })]);
  const row = {
    step: s.step, source: s.source, tx: s.tx, reason: s.reason, status: r.status, block: r.blockNumber.toString(),
    gasLimit: t.gas.toString(), gasUsed: r.gasUsed.toString(), usedOverLimit: Number(r.gasUsed) / Number(t.gas),
    fee: formatEther(r.gasUsed * r.effectiveGasPrice),
  };
  rows.push(row);
  console.log(`${s.step.padEnd(34)} ${r.status}, 블록 ${r.blockNumber}, 가스 ${r.gasUsed}/${t.gas} (${(row.usedOverLimit * 100).toFixed(1)}%), 수수료 ${row.fee} OKRW  ${EXPLORER}/tx/${s.tx}`);
}
const file = writeEvidence(path.join(ROOT, "track-a-explain/evidence/live"), "reject-gas", {
  checkedAt: new Date().toISOString(), label: "[Live Testnet] 영수증 조회. tx 없음", sources: [gateFile, agentFile], rows,
});
console.log(`기록: ${path.relative(ROOT, file)}`);
