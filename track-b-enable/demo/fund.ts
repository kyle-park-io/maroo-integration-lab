// 진행자용: 참가자의 구매 기업 주소에 테스트넷 OKRW 를 나눠 준다. faucet 이 멈췄을 때의 대안이다.
//
//   pnpm b:fund 0x주소1 0x주소2 ...
//   pnpm b:fund --file participants.txt [--amount 1000]
//
// 보내는 지갑은 진행자 지갑 파일의 BUYER 다(MAROO_LAB_ENV 로 진행자 파일을 지정한다).
// 이미 amount 이상 가진 주소는 건너뛴다. 그래서 중간에 멈춘 뒤 같은 명령을 다시 실행해도 받은 주소에는 또 보내지 않는다.
// 진행자 잔액이 모자라면 보낼 수 있는 데까지 보내고 멈춘다. faucet 으로 받은 뒤 다시 실행하면 이어서 보낸다.
// 보내기 전에 eth_estimateGas 로 전역 정책 거부를 먼저 확인한다. 기록은 track-b-enable/evidence/live/fund-<시각>.json.
//
// Maroo 테스트넷은 블록에 들어가기 전의 tx 를 pending 논스와 eth_getTransactionByHash 에 보이지 않는다(2026-10-23 실측).
// 보냈는지 모르는 tx 가 대기열에 남은 채 다시 실행하면 새 tx 는 같은 논스로 서명되어, 둘 가운데 하나만 블록에 들어간다.

import fs from "node:fs";
import path from "node:path";
import { formatEther, keccak256, parseEther, type Address, type Hex } from "viem";
import { iPclAbi } from "@maroo-chain/contracts/abi/precompiles/pcl/IPcl";
import { ROOT, outPath } from "../../shared/lib/paths.ts";
import { EXPLORER, RPC, addressOf, decodeRaw, publicClient as pub, stampNow, walletFor } from "../../shared/lib/maroo.ts";
import { explainFailure } from "../../shared/lib/recipe-errors.ts";
import { LIVE_DIR, fundStep, parseTargets, precheckOutcome, sendOutcome, trouble, troubleFor, type Precheck } from "./lib.ts";

const args = process.argv.slice(2);
const flagAt = (name: string) => args.indexOf(name);
const flag = (name: string) => { const i = flagAt(name); return i >= 0 ? args[i + 1] : undefined; };
const flagValueIdx = new Set(["--amount", "--file"].flatMap((f) => (flagAt(f) >= 0 ? [flagAt(f), flagAt(f) + 1] : [])));
const amount = parseEther(flag("--amount") ?? "1000");
const fromFile = flag("--file");
const tokens = [
  ...args.filter((_, i) => !flagValueIdx.has(i)),
  ...(fromFile ? fs.readFileSync(fromFile, "utf8").split(/\s+/).filter(Boolean) : []),
];
const { targets, invalid, duplicates } = parseTargets(tokens);
if (invalid.length) {
  console.log(`주소가 아닌 값 ${invalid.length}개가 있어 한 건도 보내지 않았습니다: ${invalid.join(", ")}`);
  console.log("주소는 0x 로 시작하는 40자리 16진수입니다. 대소문자가 섞인 주소는 체크섬까지 맞아야 합니다. 목록을 고친 뒤 다시 실행하십시오.");
  process.exit(2);
}
if (!targets.length) {
  console.log("사용법: pnpm b:fund <주소...> 또는 --file <파일> [--amount <OKRW>]");
  process.exit(2);
}
if (duplicates.length) console.log(`두 번 적힌 주소 ${duplicates.length}개는 한 번만 보냅니다: ${duplicates.join(", ")}`);

type Entry = { to: Address; skipped?: string; rejected?: string; tx?: Hex; state?: "sending" | "unknown" | "not-sent"; status?: string; block?: string; precheck?: string; amount?: string; error?: string };
const results: Entry[] = [];
const file = path.join(outPath(LIVE_DIR), `fund-${stampNow()}.json`);
let from: Address | undefined;
// 한 주소를 처리할 때마다 기록을 다시 쓴다. 중간에 멈춰도 어디까지 보냈는지 남는다.
const save = (remaining: Address[]) => {
  if (!results.length) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ label: "[Live Testnet] 진행자 배분", from, amountEach: formatEther(amount), savedAt: new Date().toISOString(), results, remaining }, null, 2) + "\n");
};
const rest = (i: number) => targets.slice(i);
const faucetLine = (a: Address) => `curl -X POST https://faucet.maroo.io/api/agent/sendToken -H 'content-type: application/json' -d '{"address":"${a}","chain":"MAROO_TESTNET"}'`;

// 보낼 수 없어 멈출 때. 기록을 남기고, 이유와 다음 할 일을 보이고 끝낸다. 남은 주소에는 보냈는지 모르는 주소도 든다.
// 다시 실행하면 그 주소의 잔액부터 보기 때문이다.
function stop(i: number, lines: string[], troubleId: string): never {
  save(rest(i));
  for (const l of lines) console.log(l);
  console.log(`남은 주소 ${rest(i).length}개. ${trouble(troubleId)}`);
  if (results.length) console.log(`기록: ${path.relative(ROOT, file)}`);
  process.exit(1);
}

async function precheck(to: Address): Promise<Precheck> {
  const tx = { from, to, data: "0x", value: `0x${amount.toString(16)}` };
  const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_estimateGas", params: [tx] }) });
  return precheckOutcome(res.status, await res.text());
}

try {
  from = addressOf("BUYER");
  const wallet = walletFor("BUYER");
  const start = await pub.getBalance({ address: from });
  console.log(`진행자 지갑 ${from}  잔액 ${formatEther(start)} OKRW, 보낼 주소 ${targets.length}개, 한 주소에 ${formatEther(amount)} OKRW`);

  for (const [i, to] of targets.entries()) {
    const have = await pub.getBalance({ address: to });
    const own = await pub.getBalance({ address: from });
    if (fundStep({ targetBalance: have, amount, ownBalance: own, feeCap: 0n }) === "skip") {
      console.log(`- ${to}  이미 ${formatEther(have)} OKRW 가 있어 건너뜁니다`);
      results.push({ to, skipped: `잔액 ${formatEther(have)} OKRW` });
      save(rest(i + 1));
      continue;
    }
    const short = (left: bigint) => stop(i, [
      `진행자 지갑의 OKRW 가 모자라 ${to} 부터 보내지 못했습니다(남은 잔액 ${formatEther(left)} OKRW, 한 주소에 ${formatEther(amount)} OKRW 와 수수료).`,
      "아래 명령으로 진행자 지갑에 faucet 을 받은 뒤 같은 명령을 다시 실행하십시오. 이미 받은 주소는 건너뜁니다.",
      `  ${faucetLine(from!)}`,
    ], "T7");
    if (own < amount) short(own);

    const pre = await precheck(to);
    if (pre.kind === "no-funds") short(own);
    if (pre.kind === "rpc") stop(i, [`사전 검사(eth_estimateGas)에 RPC 가 답하지 못했습니다(${pre.detail}). 잠시 뒤 같은 명령을 다시 실행하십시오. 이미 받은 주소는 건너뜁니다.`], "T5");
    if (pre.kind === "rejected") {
      const reason = pre.data ? decodeRaw(pre.data as Hex, iPclAbi) : pre.detail;
      console.log(`✗ ${to}  사전 검사 거부: ${reason}\n  ${trouble("T7")}`);
      results.push({ to, rejected: reason });
      save(rest(i + 1));
      continue;
    }
    if (pre.kind !== "ok") throw new Error("사전 검사 결과를 알 수 없습니다");

    // 서명해 해시를 먼저 정하고 기록에 남긴 뒤 보낸다. 가스 한도는 지갑과 같이 추정값의 125% 다.
    const gas = (pre.gas * 125n) / 100n;
    const req = await wallet.prepareTransactionRequest({ account: wallet.account, chain: wallet.chain, to, value: amount, gas });
    const feeCap = gas * (req.maxFeePerGas ?? req.gasPrice ?? 0n);
    if (fundStep({ targetBalance: have, amount, ownBalance: own, feeCap }) === "short") short(own);
    const serialized = await wallet.signTransaction(req as never);
    const tx = keccak256(serialized);
    const entry: Entry = { to, tx, state: "sending", amount: formatEther(amount), precheck: `eth_estimateGas 통과(가스 ${pre.gas})` };
    results.push(entry);
    save(rest(i + 1));

    try {
      await pub.sendRawTransaction({ serializedTransaction: serialized });
    } catch (err) {
      const msg = `${(err as Error).message} ${String((err as { cause?: unknown }).cause ?? "")}`;
      const kind = sendOutcome(msg);
      // viem 은 노드가 돌려준 문구를 details 에 둔다(예: already known). 없으면 첫 줄을 쓴다.
      entry.error = (err as { details?: string }).details ?? msg.split("\n")[0];
      if (kind === "no-funds") { entry.state = "not-sent"; delete entry.tx; short(own); }
      if (kind === "not-sent") {
        entry.state = "not-sent"; delete entry.tx;
        stop(i, [`${to} 에 보내지 못했습니다(${entry.error}). 노드는 이 tx 를 받지 않았습니다. 네트워크를 확인한 뒤 같은 명령을 다시 실행하십시오.`], "T5");
      }
      entry.state = "unknown";
      stop(i, [
        `${to} 에 보낸 tx 를 노드가 받았는지 확인하지 못했습니다(${entry.error}): ${EXPLORER}/tx/${tx}`,
        "1분쯤 기다려 네트워크를 확인한 뒤 같은 명령을 다시 실행하십시오. 이 tx 가 블록에 들어갔으면 그 주소는 잔액이 있어 건너뛰고, 들어가지 않았으면 한 번 더 보냅니다.",
      ], "T5");
    }
    const r = await pub.waitForTransactionReceipt({ hash: tx, timeout: 60_000 }).catch((err) => {
      entry.state = "unknown";
      entry.error = String((err as Error).message).split("\n")[0];
      return stop(i, [
        `${to} 에 보낸 tx 의 영수증을 받지 못했습니다(${entry.error}): ${EXPLORER}/tx/${tx}`,
        "1분쯤 기다린 뒤 같은 명령을 다시 실행하십시오. 이 tx 가 블록에 들어갔으면 그 주소는 건너뜁니다.",
      ], "T5");
    });
    delete entry.state;
    entry.status = r.status;
    entry.block = r.blockNumber.toString();
    save(rest(i + 1));
    console.log(`${r.status === "success" ? "✓" : "✗"} ${to}  ${formatEther(amount)} OKRW  사전 검사 ${entry.precheck}  ${EXPLORER}/tx/${tx}`);
  }
} catch (err) {
  const done = results.length;
  save(targets.filter((t) => !results.some((r) => r.to === t)));
  const f = explainFailure(err, { rpc: RPC });
  console.log(`\n실패: ${f.reason}`);
  console.log(`다음 할 일: ${f.next} 이미 받은 주소는 다시 실행해도 건너뜁니다.`);
  const id = troubleFor(f);
  if (id) console.log(trouble(id));
  if (done) console.log(`기록: ${path.relative(ROOT, file)}`);
  if (process.env.DEBUG) console.error(err);
  process.exit(1);
}

const sent = results.filter((r) => r.status === "success").length;
const skipped = results.filter((r) => r.skipped).length;
const rejected = results.filter((r) => r.rejected).length;
const failed = results.filter((r) => r.status && r.status !== "success").length;
save([]);
console.log(`\n보낸 주소 ${sent}개, 이미 받아 건너뛴 주소 ${skipped}개, 사전 검사에서 거부된 주소 ${rejected}개, 블록에서 실패한 tx ${failed}건. 기록: ${path.relative(ROOT, file)}`);
process.exit(rejected || failed ? 1 : 0);
