// Track A 레시피: Maroo 테스트넷 Privacy 준비 상태 감시. [Live Testnet] 조회와 eth_estimateGas 만 하고 tx 는 보내지 않는다.
//
//   pnpm a:watch-privacy            기록을 track-a-explain/evidence/live/watch-privacy/<날짜>.json 에 남기고 이전 기록과 견준다
//   pnpm a:watch-privacy --no-save  기록을 남기지 않고 화면에만 출력한다
//
// 매번 읽는 값
//   노드 판과 빌드 의존성의 Clairveil 판(Cosmos REST node_info)
//   Clairveil 차폐 상태 조회 경로(proto 의 고정 경로와 Merkle 경로)의 응답 코드, 회로 설정이 proving 산출물을 내주는지
//   증명 없는 빈 예치 요청이 처음 막히는 층(eth_estimateGas, pnpm a:probe 의 빈 요청과 같은 호출)
//   공식 SDK(ClairveilJS)에 Cosmos REST 를 넣은 예치 준비가 멈추는 곳(pnpm a:probe-sdk --rest, vendor/clairveiljs 의존성이 있을 때만)
//   4층 시험: 가장 최근 성공한 공개 예치의 calldata 를 본인 인증 증명 없는 지갑에서 부른 사유와 걸린 정책(pnpm explain 과 같은 코드)
//   Privacy 프리컴파일로 간 tx 수와 함수별 성공 수(탐색기 API)
//   Maroo 문서의 Privacy 페이지 내용 해시(sitemap), Clairveil 최신 릴리스, @maroo-chain 패키지 최신 판
// 판정은 shared/lib/privacy-watch.ts 에 있다. GitHub Actions(.github/workflows/watch-privacy.yml)가 하루 한 번 같은 명령을 돌린다.

import "../../shared/lib/install-recipe-errors.ts";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { encodeFunctionData, parseAbiItem, toFunctionSelector, toHex, type AbiFunction, type Hex } from "viem";
import { iPrivacyAbi } from "@maroo-chain/contracts/abi/precompiles/privacy/IPrivacy";
import { ROOT } from "../../shared/lib/paths.ts";
import { EXPLORER, PRIVACY, REST, RPC, labValue, publicClient as pub } from "../../shared/lib/maroo.ts";
import { explainCall } from "../../shared/lib/explain-chain.ts";
import { summarizeChainInfo } from "../../shared/lib/chain-info.ts";
import { classifyRevert } from "../../shared/lib/explain.ts";
import { changesSince, countBySelector, readiness, recordFile, type WatchRecord } from "../../shared/lib/privacy-watch.ts";

const save = !process.argv.includes("--no-save");
const DIR = path.join(ROOT, "track-a-explain/evidence/live/watch-privacy");
const timeout = () => AbortSignal.timeout(20_000);
const getJson = async (url: string, headers: Record<string, string> = {}) => {
  const r = await fetch(url, { signal: timeout(), headers });
  if (!r.ok) throw new Error(`${url} 응답 ${r.status}`);
  return r.json() as Promise<any>;
};
// 한 항목이 실패해도 나머지는 기록한다. 실패한 항목에는 이유를 남긴다.
const tryOr = async <T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
  try { return await fn(); } catch (e) { console.log(`  [읽지 못함] ${label}: ${(e as Error).message.split("\n")[0]}`); return fallback; }
};

// 1. 노드
const node = await tryOr("노드 정보", async () => {
  const [ni, fm, vm] = await Promise.all(["/cosmos/base/tendermint/v1beta1/node_info", "/cosmos/evm/feemarket/v1/params", "/cosmos/evm/vm/v1/params"].map((p) => getJson(`${REST}${p}`)));
  const s = summarizeChainInfo(ni, fm, vm);
  return { app: s.node, clairveil: s.privacyDeps["github.com/DELIGHT-LABS/clairveil"], privacyPrecompileActive: s.privacyPrecompileActive };
}, { app: "읽지 못함" } as WatchRecord["node"] & { privacyPrecompileActive?: boolean });

// 2. 차폐 상태 조회 경로. Clairveil v0.4.0 proto 의 HTTP 경로 가운데 값을 넣지 않고 부를 수 있는 것과, 첫 커밋먼트로 묻는 두 경로
const V1 = "/clairveil/privacy/v1";
const REST_PATHS = ["circuit_config", "tree_state", "audit_config", "disclosure_config", "assets/by_denom/atokrw", "reserve/atokrw", "nullifiers", "events", "scan_events", "privacy_scan", "commitment_paths_at_root"].map((p) => `${V1}/${p}`);
const privacyRest: Record<string, number | string> = {};
for (const p of REST_PATHS) privacyRest[p] = await fetch(`${REST}${p}`, { signal: timeout() }).then((r) => r.status).catch(() => "연결 실패");
const firstCommitment = await tryOr("첫 커밋먼트", async () => (await getJson(`${REST}${V1}/scan_events?pagination.limit=1`)).events?.[0]?.outputs?.[0]?.commitment_hex as string | undefined, undefined as string | undefined);
if (firstCommitment) for (const p of [`merkle_path/${firstCommitment}`, `commitment/${firstCommitment}`]) {
  privacyRest[`${V1}/${p.split("/")[0]}/{commitment}`] = await fetch(`${REST}${V1}/${p}`, { signal: timeout() }).then((r) => r.status).catch(() => "연결 실패");
}
const provingMaterial = await tryOr("회로 설정", async () => {
  const c = await getJson(`${REST}${V1}/circuit_config`);
  return { manifestAvailable: c.manifest_available === true, artifactFiles: ((c.artifacts ?? []) as { filename?: string }[]).filter((a) => a.filename).length, activeSet: c.active_set_id as string, verifyingKeys: Object.fromEntries(((c.artifacts ?? []) as { circuit_id: string; sha256: string }[]).map((a) => [a.circuit_id, a.sha256])) };
}, undefined);

// 3. 빈 예치 요청의 최초 실패 계층. 증명이 없는 호출이라 eth_estimateGas 로만 부른다.
const from = labValue("BUYER_ADDRESS") ?? "0x720989a26EfC40b007d778e54382879cdaf389e8"; // 지갑 파일이 없으면 이 레포 구매 기업의 공개 주소
const depositData = encodeFunctionData({ abi: [parseAbiItem("function deposit((bytes,bytes,bytes))") as AbiFunction], functionName: "deposit", args: [["0x", "0x", "0x"]] });
const firstFailure = await tryOr("빈 예치 요청", async () => {
  const res = await fetch(RPC, { method: "POST", signal: timeout(), headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_estimateGas", params: [{ from, to: PRIVACY, data: depositData, value: toHex(0n) }, "latest"] }) });
  const j = (await res.json()) as { result?: Hex; error?: { message: string; data?: Hex } };
  if (!j.error) return { text: "통과(추정 가스 " + BigInt(j.result!).toString() + ")" };
  const d = classifyRevert({ data: j.error.data, rpcMessage: j.error.data ? undefined : j.error.message });
  return { family: d.family, name: d.name, text: d.text };
}, { text: "읽지 못함" } as WatchRecord["firstFailure"]);

// 4. 공식 SDK 의 예치 준비. 기록은 .work 아래로 돌려 증거 폴더에 남지 않게 한다.
let sdkProbe: WatchRecord["sdkProbe"];
if (fs.existsSync(path.join(ROOT, "vendor/clairveiljs/node_modules"))) {
  const tmp = path.join(".work", "watch-privacy-sdk");
  const r = spawnSync("node", [path.join(ROOT, "track-a-explain/recipe/probe-sdk-deposit.ts"), "--rest"], { cwd: ROOT, env: { ...process.env, MAROO_LAB_OUT: tmp }, encoding: "utf8" });
  const dir = path.join(ROOT, tmp, "track-a-explain/evidence/code");
  const file = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.startsWith("probe-sdk-deposit-")).sort().pop() : undefined;
  if (r.status === 0 && file) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    const w = j.prepareDepositWithRest ?? j.prepareDeposit;
    sdkProbe = { stoppedAt: w.stoppedAt, proverReached: !!w.proverReached };
  } else sdkProbe = { skipped: `pnpm a:probe-sdk 가 실패했습니다(종료 코드 ${r.status})` };
} else sdkProbe = { skipped: "vendor/clairveiljs 의존성이 없어 건너뜀(pnpm setup:clairveil, pnpm sdk:check)" };

// 5. Privacy 프리컴파일 tx
const names = Object.fromEntries((iPrivacyAbi as readonly { type: string; name?: string }[]).filter((x) => x.type === "function").map((f) => [toFunctionSelector(f as AbiFunction).toLowerCase(), f.name!]));
const precompileTx = await tryOr("Privacy 프리컴파일 tx", async () => {
  const api = `${EXPLORER}/blockscout/api/v2/addresses/${PRIVACY}`;
  const total = Number((await getJson(`${api}/counters`)).transactions_count);
  const items: { raw_input?: string; result?: string; timestamp?: string }[] = [];
  let next: Record<string, string> | null = {};
  for (let i = 0; i < 20 && next; i++) {
    const page = await getJson(`${api}/transactions?${new URLSearchParams(next)}`);
    items.push(...page.items);
    next = page.next_page_params;
  }
  const latestDeposit = items.find((x) => (x as { raw_input?: string }).raw_input?.startsWith(toFunctionSelector("deposit((bytes,bytes,bytes))")) && x.result === "success") as { hash?: Hex } | undefined;
  return { total, latest: items[0]?.timestamp, bySelector: countBySelector(items, names), read: items.length, latestSuccessfulDeposit: latestDeposit?.hash };
}, { total: -1 } as WatchRecord["precompileTx"] & { latestSuccessfulDeposit?: Hex });

// 5b. 4층 시험. 공개된 성공 예치의 calldata(유효한 증명 포함)를 본인 인증 증명이 없는 지갑에서 eth_estimateGas 로 부른다.
const layer4 = await tryOr("4층 시험", async () => {
  const hash = (precompileTx as { latestSuccessfulDeposit?: Hex }).latestSuccessfulDeposit;
  if (!hash) throw new Error("성공한 공개 예치를 찾지 못함");
  const t = await pub.getTransaction({ hash });
  const e = await explainCall({ from: from as Hex, to: PRIVACY, data: t.input, value: t.value }, { method: "eth_estimateGas", balanceOverride: t.value + 10n ** 21n });
  return { tx: hash, name: e.decoded?.name ?? "통과", scope: e.scope?.scope, text: e.decoded?.text };
}, undefined as WatchRecord["layer4"]);

// 6. 문서, 릴리스, 패키지
const docs = await tryOr("Maroo 문서 Privacy 페이지", async () => {
  const xml = await (await fetch("https://docs.maroo.io/sitemap-0.xml", { signal: timeout() })).text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => /privacy/i.test(u) && !/docs\.maroo\.io\/en\//.test(u)).sort();
  const out: Record<string, string> = {};
  for (const u of urls) {
    const html = await (await fetch(u, { signal: timeout() })).text();
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    out[new URL(u).pathname] = createHash("sha256").update(text).digest("hex").slice(0, 16);
  }
  return out;
}, undefined as Record<string, string> | undefined);
const gh: Record<string, string> = process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};
const clairveilLatest = await tryOr("Clairveil 릴리스", async () => (await getJson("https://api.github.com/repos/DELIGHT-LABS/clairveil/releases?per_page=1", gh))[0]?.tag_name as string, undefined as string | undefined);
const npm: Record<string, string> = {};
for (const p of ["@maroo-chain/viem", "@maroo-chain/contracts"]) {
  const v = await tryOr(p, async () => (await getJson(`https://registry.npmjs.org/${p.replace("/", "%2f")}`))["dist-tags"].latest as string, undefined as string | undefined);
  if (v) npm[p] = v;
}

const record: WatchRecord & Record<string, unknown> = {
  checkedAt: new Date().toISOString(), label: "[Live Testnet] 조회와 eth_estimateGas, tx 없음",
  node, privacyRest, provingMaterial, firstFailure, sdkProbe, layer4, precompileTx, docs, clairveilLatest, npm,
};
const prevFile = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== `${record.checkedAt.slice(0, 10)}.json`).sort().pop() : undefined;
const prev = prevFile ? (JSON.parse(fs.readFileSync(path.join(DIR, prevFile), "utf8")) as WatchRecord) : undefined;
const verdict = readiness(record);
const changes = changesSince(prev, record);
record.readiness = verdict;
record.changesSince = { previous: prevFile ?? null, changes };

console.log(`노드              ${node.app}, Clairveil ${node.clairveil ?? "?"}`);
for (const [p, s] of Object.entries(privacyRest)) console.log(`조회 경로         ${p}  ${s}`);
console.log(`proving 재료      ${provingMaterial ? `manifest_available ${provingMaterial.manifestAvailable}, 파일 이름이 있는 산출물 ${provingMaterial.artifactFiles}개, 회로 묶음 ${provingMaterial.activeSet}` : "읽지 못함"}`);
console.log(`빈 예치 요청      ${firstFailure.text}`);
console.log(`4층 시험         ${layer4 ? `${layer4.text}(${layer4.scope === "contract" ? "컨트랙트 정책" : layer4.scope})` : "읽지 못함"}`);
console.log(`공식 SDK 예치 준비 ${"stoppedAt" in (sdkProbe ?? {}) ? (sdkProbe as { stoppedAt: string }).stoppedAt : (sdkProbe as { skipped: string }).skipped}`);
console.log(`프리컴파일 tx     ${precompileTx.total}건, 가장 최근 ${precompileTx.latest ?? "?"}`);
for (const s of precompileTx.bySelector ?? []) console.log(`                  ${s.name}(${s.selector}) ${s.total}건 가운데 성공 ${s.success}건`);
console.log(`문서 Privacy 페이지 ${docs ? Object.keys(docs).length : "읽지 못함"}, Clairveil 최신 ${clairveilLatest ?? "?"}, ${Object.entries(npm).map(([k, v]) => `${k} ${v}`).join(", ")}`);
console.log(`\n준비 상태: ${verdict.ready ? "5층(증명 검증)을 시험할 수 있습니다" : "5층(증명 검증)은 아직 막혀 있습니다"}`);
for (const d of verdict.done) console.log(`  확인: ${d}`);
for (const r of verdict.reasons) console.log(`  막힘: ${r}`);
for (const n of verdict.next) console.log(`  다음: ${n}`);
console.log(prevFile ? `\n이전 기록(${prevFile})과 달라진 것: ${changes.length ? "" : "없음"}` : "\n이전 기록이 없어 견주지 않았습니다.");
for (const c of changes) console.log(`  ${c}`);

if (save) {
  const file = recordFile(DIR, record.checkedAt.slice(0, 10));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
  console.log(`\n기록: ${path.relative(ROOT, file)}`);
}
// GitHub Actions 가 읽는 값
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `ready=${verdict.ready}\nchanged=${changes.length > 0}\n`);
