// Track A 레시피: 단순 OKRW 이체가 쓰는 가스를 Maroo Docs 예시(21,000)와 대조한다. [Live Testnet]
//
//   pnpm a:probe-send-gas
//
// Maroo Docs eth_estimateGas 쪽은 단순 전송이 0x5208(21,000)을 돌려준다고 적는다.
// ClairveilJS 도 EVM 네이티브 이체의 가스 한도 기본값을 0x5208 로 둔다(evmSendGasLimit).
// 확인하는 것
//   1. 같은 이체의 eth_estimateGas 값(금액 1 OKRW, 100 OKRW)
//   2. 가스 21,000 으로 eth_call: 전역 정책을 평가하지 않는 경로라 통과하는지
//   3. 가스 21,000 으로 실제 전송: 결과와 쓴 가스
//   4. eth_estimateGas 값으로 실제 전송: 결과와 쓴 가스
//   5. 문서가 권하는 25% 여유를 둔 한도로 실제 전송: 쓰지 않은 가스가 수수료에서 빠지는지
// BUYER 가 자기 SUPPLIER_A 에게 1 OKRW 를 세 번 보낸다. 수수료를 합쳐 9 OKRW 안팎이 든다.
// 결과는 track-a-explain/evidence/live/probe-send-gas-<시각>.json 에 남긴다.

import fs from "node:fs";
import path from "node:path";
import { formatEther, parseEther, toHex } from "viem";
import { ROOT } from "../../shared/lib/paths.ts";
import { EXPLORER, RPC, addressOf, publicClient as pub, walletFor, writeEvidence } from "../../shared/lib/maroo.ts";

const DOC_CLAIM = { url: "https://docs.maroo.io/apis/rpc/estimate-gas/", text: "단순 전송은 0x5208 = 21,000" };
const from = addressOf("BUYER");
const to = addressOf("SUPPLIER_A");
const value = parseEther("1");

async function rpc(method: string, params: unknown[]) {
  const res = await fetch(RPC, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return (await res.json()) as { result?: string; error?: { message: string } };
}

// ClairveilJS 를 받아 두었으면 기본값을 원본에서 읽는다
const sdkFile = path.join(ROOT, "vendor/clairveiljs/src/browser/wallet-client.js");
const sdkDefault = fs.existsSync(sdkFile) ? fs.readFileSync(sdkFile, "utf8").match(/evmSendGasLimit = "(0x[0-9a-fA-F]+)"/)?.[1] : undefined;

const estimate1 = BigInt((await rpc("eth_estimateGas", [{ from, to, value: toHex(value) }])).result!);
const estimate100 = BigInt((await rpc("eth_estimateGas", [{ from, to, value: toHex(parseEther("100")) }])).result!);
console.log(`1) eth_estimateGas: 1 OKRW ${estimate1}, 100 OKRW ${estimate100}. 문서 예시 21000`);

const call21k = await rpc("eth_call", [{ from, to, value: toHex(value), gas: toHex(21000n) }, "latest"]);
const callResult = call21k.error ? `거부: ${call21k.error.message}` : `통과(${call21k.result})`;
console.log(`2) 가스 21000 으로 eth_call: ${callResult}`);

async function sendWith(gas: bigint) {
  const hash = await walletFor("BUYER").sendTransaction({ to, value, gas });
  const r = await pub.waitForTransactionReceipt({ hash });
  const row = {
    gasLimit: gas.toString(), tx: hash, block: r.blockNumber.toString(), status: r.status, gasUsed: r.gasUsed.toString(),
    fee: formatEther(r.gasUsed * r.effectiveGasPrice), effectiveGasPrice: r.effectiveGasPrice.toString(),
  };
  console.log(`   가스 한도 ${gas}: ${r.status}, 쓴 가스 ${r.gasUsed}, 수수료 ${row.fee} OKRW  ${EXPLORER}/tx/${hash}`);
  return row;
}
console.log("3) 가스 21000 으로 전송");
const sent21k = await sendWith(21000n);
console.log("4) eth_estimateGas 값으로 전송");
const sentEstimated = await sendWith(estimate1);
console.log("5) eth_estimateGas 값의 125% 로 전송");
const sentPadded = await sendWith((estimate1 * 125n) / 100n);

const file = writeEvidence(path.join(ROOT, "track-a-explain/evidence/live"), "probe-send-gas", {
  checkedAt: new Date().toISOString(),
  label: "[Live Testnet] BUYER 에서 자기 SUPPLIER_A 로 1 OKRW 단순 이체",
  docClaim: DOC_CLAIM, clairveiljsDefaultSendGasLimit: sdkDefault ?? "vendor/clairveiljs 없음",
  from, to, estimateGas: { "1 OKRW": estimate1.toString(), "100 OKRW": estimate100.toString() },
  ethCallWithGas21000: callResult, sentWithGas21000: sent21k, sentWithEstimate: sentEstimated, sentWithEstimatePlus25: sentPadded,
});
console.log(`기록: ${path.relative(ROOT, file)}`);
