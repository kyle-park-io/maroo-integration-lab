// 진행자용: 참가자의 구매 기업 주소에 테스트넷 OKRW 를 나눠 준다. faucet 이 멈췄을 때의 대안이다.
//
//   pnpm b:fund 0x주소1 0x주소2 ...
//   pnpm b:fund --file participants.txt [--amount 1000]
//
// 보내는 지갑은 진행자 지갑 파일의 BUYER 다(MAROO_LAB_ENV 로 진행자 파일을 지정한다).
// 보내기 전에 eth_estimateGas 로 전역 정책 거부를 먼저 확인한다. 기록은 track-b-enable/evidence/live/fund-<시각>.json.

import fs from "node:fs";
import path from "node:path";
import { formatEther, getAddress, isAddress, parseEther, type Address } from "viem";
import { iPclAbi } from "@maroo-chain/contracts/abi/precompiles/pcl/IPcl";
import { ROOT } from "../../shared/lib/paths.ts";
import { EXPLORER, addressOf, decodeRaw, publicClient as pub, rawEthCall, walletFor, writeEvidence } from "../../shared/lib/maroo.ts";
import { LIVE_DIR, trouble } from "./lib.ts";

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const amount = parseEther(flag("--amount") ?? "1000");
const fromFile = flag("--file");
const targets = [
  ...args.filter((a) => isAddress(a)),
  ...(fromFile ? fs.readFileSync(fromFile, "utf8").split(/\s+/).filter((a) => isAddress(a)) : []),
].map((a) => getAddress(a));
if (!targets.length) {
  console.log("사용법: pnpm b:fund <주소...> 또는 --file <파일> [--amount <OKRW>]");
  process.exit(2);
}

const from = getAddress(addressOf("BUYER"));
const balance = await pub.getBalance({ address: from });
const total = amount * BigInt(targets.length);
console.log(`진행자 지갑 ${from}  잔액 ${formatEther(balance)} OKRW, 보낼 총액 ${formatEther(total)} OKRW (${targets.length}명 × ${formatEther(amount)})`);
if (balance < total) {
  console.log(`잔액이 부족합니다. ${trouble("T7")}`);
  process.exit(1);
}

const results: Record<string, unknown>[] = [];
for (const to of targets as Address[]) {
  const pre = await rawEthCall({ from, to, data: "0x", value: amount }, "eth_estimateGas");
  if (pre.error) {
    const reason = pre.error.data && pre.error.data !== "0x" ? decodeRaw(pre.error.data, iPclAbi) : pre.error.message;
    console.log(`✗ ${to}  사전 검사 거부: ${reason}\n  ${trouble("T7")}`);
    results.push({ to, rejected: reason });
    continue;
  }
  const hash = await walletFor("BUYER").sendTransaction({ to, value: amount });
  const r = await pub.waitForTransactionReceipt({ hash });
  console.log(`${r.status === "success" ? "✓" : "✗"} ${to}  ${formatEther(amount)} OKRW  ${EXPLORER}/tx/${hash}`);
  results.push({ to, amount: formatEther(amount), tx: hash, status: r.status, block: r.blockNumber.toString() });
}
const file = writeEvidence(LIVE_DIR, "fund", { from, sentAt: new Date().toISOString(), results });
console.log(`기록: ${path.relative(ROOT, file)}`);
