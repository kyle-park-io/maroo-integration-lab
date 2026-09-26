// Track C 심사 판정 예시: Track A 실행 기록을 트랙 1(기밀 정산) 제출물의 evidence.json 형식으로 옮긴다.
//
//   pnpm c:judge-example            # track-c-activate/evidence/judge-example/evidence.json 을 만들고 c:judge 로 판정
//
// 쓰는 기록
//   R1, R2  track-a-explain/evidence/local/vendor-settlement-*.md 의 로컬 tx   [Local]
//   R3, R4  track-a-explain/evidence/live/pcl-kyb-gate-*.json 의 금고 tx       [Live Testnet]
//   R5      track-a-explain/evidence/live/probe-first-failure-*.json           [Live Testnet] eth_estimateGas 기록
// 참가자가 낼 파일을 흉내 낸 예시라서, 판정 결과도 같은 폴더에 둔다.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT, outPath } from "../../shared/lib/paths.ts";
import { EXPLORER } from "../../shared/lib/maroo.ts";

const newest = (dir: string, prefix: string) => {
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(prefix)).sort();
  return files.length ? path.join(dir, files[files.length - 1]) : undefined;
};
const live = path.join(ROOT, "track-a-explain/evidence/live");
const gateFile = newest(live, "pcl-kyb-gate-");
const probeFile = newest(live, "probe-first-failure-");
const localFile = newest(path.join(ROOT, "track-a-explain/evidence/local"), "vendor-settlement-");
if (!gateFile || !probeFile || !localFile) {
  console.log("Track A 기록이 없습니다. pnpm a:kyb-gate, pnpm a:probe, pnpm a:local 을 먼저 실행하십시오.");
  process.exit(1);
}

type Step = { step: string; tx?: string; result?: string; reason?: string; ranAt?: string };
const gate = JSON.parse(fs.readFileSync(gateFile, "utf8")) as { chainId: number; ranAt: string; vault: string; steps: Step[] };
const probe = JSON.parse(fs.readFileSync(probeFile, "utf8")) as { checkedAt: string; results: { case: string; eth_estimateGas?: { outcome: string; rpcMessage: string; revertData: string } }[] };
const md = fs.readFileSync(localFile, "utf8");
const localTx = (label: string) => md.split("\n").find((l) => l.includes(label))?.match(/`([0-9A-F]{64})`/)?.[1];

const step = (prefix: string) => {
  const s = gate.steps.find((x) => x.step.startsWith(prefix) && x.tx);
  if (!s) throw new Error(`금고 기록에 ${prefix} 단계가 없습니다: ${gateFile}`);
  return s;
};
const liveItem = (requirement: string, s: Step, call: string, input: string, expected: string) => ({
  requirement, label: "[Live Testnet]", network: "maroo-testnet", chainId: gate.chainId, target: gate.vault, call, input,
  txHash: s.tx, explorer: `${EXPLORER}/tx/${s.tx}`, expected, actual: s.reason ?? s.result, executedAt: gate.ranAt,
});

const items = [
  { requirement: "R1", label: "[Local]", network: "clairveil-local", call: "transfer-batch", input: "협력사 A 송장 12, 8", txHash: localTx("협력사 A 지급: 송장 12, 8 일괄 전송"), expected: "성공", actual: "code 0", evidence: path.relative(ROOT, localFile) },
  { requirement: "R1", label: "[Local]", network: "clairveil-local", call: "withdraw", input: "협력사 A 12, 같은 블록 0 노트 예치", txHash: localTx("협력사 A 인출 12, 0 노트 예치와 같은 블록"), expected: "성공", actual: "code 0", evidence: path.relative(ROOT, localFile) },
  { requirement: "R2", label: "[Local]", network: "clairveil-local", call: "decode-transfer-disclosure", input: "협력사 B 수신자 disclosure", txHash: localTx("협력사 B 지급: 송장 15"), expected: "verified=true", actual: "verified=true, amount 15", evidence: path.relative(ROOT, localFile) },
  liveItem("R3", step("5)"), "claim()", "호출자: 증명 없는 협력사 B", "PCL 거부"),
  liveItem("R3", step("6d)"), "claim()", "호출자: 증명을 색인한 협력사 A", "통과"),
  liveItem("R3", step("7c)"), "claim()", "호출자: 증명이 폐기된 협력사 A", "PCL 거부"),
  liveItem("R4", step("4) 협력사 A"), "fund(address)", "협력사 A 몫 100 OKRW", "성공"),
];
const empty = probe.results.find((r) => r.case === "empty")?.eth_estimateGas;
if (empty) {
  items.push({
    requirement: "R5", label: "[Live Testnet]", network: "maroo-testnet", chainId: gate.chainId, target: "0x100000000000000000000000000000000000000b",
    call: "deposit", input: "빈 요청", expected: "요청 검증 거부", actual: empty.outcome, executedAt: probe.checkedAt,
    rpcLog: { method: "eth_estimateGas", params: [], error: { message: empty.rpcMessage, data: empty.revertData } },
  } as never);
}

const outDir = outPath(path.join(ROOT, "track-c-activate/evidence/judge-example"));
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, "evidence.json");
fs.writeFileSync(out, JSON.stringify({ project: "Track A 기록으로 만든 예시 제출물", track: 1, sources: [gateFile, probeFile, localFile].map((f) => path.relative(ROOT, f)), items }, null, 2) + "\n");
console.log(`예시 evidence.json: ${path.relative(ROOT, out)}\n`);
const r = spawnSync("node", [path.join(ROOT, "track-c-activate/judge/check-evidence.ts"), out, "--track", "1"], { stdio: "inherit" });
process.exit(r.status ?? 1);
