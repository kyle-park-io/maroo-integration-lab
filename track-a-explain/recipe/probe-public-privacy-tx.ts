// Track A 레시피: 테스트넷에 공개된 성공 Privacy tx 를 다른 지갑과 블록에서 시뮬레이션해 검사 순서를 본다. [Live Testnet] eth_call 과 eth_estimateGas 만
//
//   pnpm a:probe-public                 탐색기에서 가장 최근 성공 예치를 골라 시뮬레이션
//   pnpm a:probe-public <tx 해시>       그 tx 를 시뮬레이션
//
// 같은 calldata(증명 포함)를 네 경우로 부른다.
//   원래 지갑, 직전 블록     성공을 재현하는지
//   원래 지갑, 최신 블록     이미 쓰인 커밋먼트로 다시 보내면 어느 사유로 막히는지
//   구매 기업, 직전 블록     본인 인증 증명이 없는 지갑이 유효한 증명을 실은 요청을 보내면 어느 층에서 막히는지
//   인증 지갑, 두 블록       지갑 파일에 KYC_HOLDER_ADDRESS 가 있을 때만. 주소는 화면과 기록에 남기지 않는다
// 잔액은 상태 덮어쓰기로 넉넉히 둔다. 기록은 track-a-explain/evidence/live/probe-public-privacy-<시각>.json 에 남긴다.

import "../../shared/lib/install-recipe-errors.ts";
import path from "node:path";
import { toHex, type Address, type Hex } from "viem";
import { ROOT } from "../../shared/lib/paths.ts";
import { EXPLORER, PRIVACY, RPC, addressOf, labValue, publicClient as pub, writeEvidence } from "../../shared/lib/maroo.ts";
import { FAMILY_LABEL, classifyRevert } from "../../shared/lib/explain.ts";
import { redactAddress } from "../../shared/lib/redact.ts";

const DEPOSIT = "0xe6eb7771";
let hash = process.argv.find((a) => /^0x[0-9a-fA-F]{64}$/.test(a)) as Hex | undefined;
if (!hash) {
  // 탐색기 목록은 최근 tx 부터 50건씩 온다. 성공한 예치가 나올 때까지 넘긴다.
  let next: Record<string, string> | null = {};
  for (let i = 0; i < 20 && next && !hash; i++) {
    const page = (await (await fetch(`${EXPLORER}/blockscout/api/v2/addresses/${PRIVACY}/transactions?${new URLSearchParams(next)}`)).json()) as
      { items: { hash: Hex; raw_input: string; result: string }[]; next_page_params: Record<string, string> | null };
    hash = page.items.find((x) => x.raw_input.startsWith(DEPOSIT) && x.result === "success")?.hash;
    next = page.next_page_params;
  }
  if (!hash) throw new Error("탐색기에서 성공한 Privacy 예치를 찾지 못했습니다. tx 해시를 인자로 넘겨 다시 실행하십시오.");
}
const tx = await pub.getTransaction({ hash });
const receipt = await pub.getTransactionReceipt({ hash });
const rpc = async (method: string, params: unknown[]) =>
  (await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json()) as { result?: Hex; error?: { message: string; data?: Hex } };

const before = toHex(receipt.blockNumber - 1n);
const rich = toHex(10n ** 24n);
const who: { label: string; from: Address; hide?: boolean }[] = [
  { label: "원래 지갑", from: tx.from },
  { label: "구매 기업(본인 인증 증명 없음)", from: addressOf("BUYER") },
];
const kyc = labValue("KYC_HOLDER_ADDRESS") as Address | undefined;
if (kyc) who.push({ label: "인증 지갑(주소 비공개)", from: kyc, hide: true });

const rows: Record<string, unknown>[] = [];
console.log(`tx ${hash} 블록 ${receipt.blockNumber} 상태 ${receipt.status} 선택자 ${tx.input.slice(0, 10)} value ${tx.value}`);
for (const w of who) {
  for (const [blockLabel, block] of [["직전 블록", before], ["최신 블록", "latest"]] as const) {
    for (const method of ["eth_call", "eth_estimateGas"] as const) {
      const call = { from: w.from, to: tx.to, data: tx.input, value: toHex(tx.value), gas: toHex(tx.gas) };
      const override = w.label === "원래 지갑" ? [] : [{ [w.from]: { balance: rich } }];
      const res = await rpc(method, [call, block, ...override]);
      const d = res.error ? classifyRevert({ data: res.error.data, rpcMessage: res.error.data ? undefined : res.error.message }) : undefined;
      // 숨기는 지갑의 주소는 사유와 인자에 들어가도 「(비공개)」로 바꾼다
      const hideAddr = (v: string) => (w.hide ? redactAddress(v, w.from) : v);
      const outcome = hideAddr(d ? `${d.text}` : "통과");
      console.log(`  ${w.label.padEnd(22)} ${blockLabel}  ${method.padEnd(15)} ${outcome}${d ? ` [${FAMILY_LABEL[d.family]}]` : ""}`);
      rows.push({ wallet: w.label, from: w.hide ? "(비공개)" : w.from, block: blockLabel === "직전 블록" ? Number(receipt.blockNumber - 1n) : "latest", method, outcome, family: d?.family, name: d?.name, args: d?.args?.map((a) => hideAddr(String(a))) });
    }
  }
}
const file = writeEvidence(path.join(ROOT, "track-a-explain/evidence/live"), "probe-public-privacy", {
  checkedAt: new Date().toISOString(), label: "[Live Testnet] eth_call 과 eth_estimateGas, tx 없음",
  tx: { hash, block: receipt.blockNumber.toString(), status: receipt.status, from: tx.from, selector: tx.input.slice(0, 10), value: tx.value.toString() },
  note: "비원래 지갑은 잔액을 상태 덮어쓰기로 늘렸습니다. 인증 지갑의 주소는 남기지 않습니다.", rows,
});
console.log(`기록: ${path.relative(ROOT, file)}`);
