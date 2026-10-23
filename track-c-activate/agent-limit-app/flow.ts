// 결제를 보낸 뒤의 확인 흐름. 체인 호출은 부르는 쪽이 넘긴다(server.ts). 단위 테스트가 순서를 덮는다.
//
// 지키는 것: 확인 중인 결제가 있으면 새 결제를 받지 않는다. 그래서 확인 중 상태는 결과 전표를 쓴 뒤에만 지우고,
// 결과를 읽다 RPC 가 끊기면 그대로 둔다. 영수증이 없고 같은 논스를 다른 tx 가 썼으면 그 결제는 들어갈 수 없으므로 보내지 않음으로 정리한다.

import type { Hex } from "viem";
import type { Explanation } from "../../shared/lib/explain.ts";
import type { Outcome } from "./app-logic.ts";

export type Pending = { tx: Hex; id: number; value: string; wei?: string; serialized?: Hex };
export type ReceiptLike = { status: "success" | "reverted"; gasUsed: bigint; effectiveGasPrice: bigint; blockNumber: bigint };
export type Slip = { id: number; body: string };

export type RecheckDeps = {
  getReceipt: (tx: Hex) => Promise<ReceiptLike | undefined>;
  inMempool: (tx: Hex) => Promise<boolean>;
  rebroadcast: (serialized: Hex) => Promise<"ok" | "known" | "nonce-too-low" | "network" | "other">;
  resolve: (p: Pending, receipt: ReceiptLike) => Promise<Slip>; // 결과 전표를 쓴다
  dropped: (p: Pending) => Slip; // 보내지 않음 전표를 쓴다
  clearPending: () => void;
};

export async function recheckPending(p: Pending, d: RecheckDeps): Promise<{ message: string; cleared: boolean }> {
  const receipt = await d.getReceipt(p.tx);
  if (receipt) {
    const slip = await d.resolve(p, receipt);
    d.clearPending();
    return { message: slip.body, cleared: true };
  }
  if (await d.inMempool(p.tx)) return { message: "노드가 이 결제를 받아 블록에 넣기를 기다리고 있어요. 잠시 뒤 다시 눌러 주세요.", cleared: false };
  const r = p.serialized ? await d.rebroadcast(p.serialized) : "other";
  if (r === "nonce-too-low") {
    const slip = d.dropped(p);
    d.clearPending();
    return { message: slip.body, cleared: true };
  }
  if (r === "ok" || r === "known") return { message: "노드에서 이 결제를 찾지 못해 같은 결제를 다시 보냈어요(같은 tx 해시). 잠시 뒤 다시 눌러 주세요.", cleared: false };
  if (r === "network") return { message: "Maroo 테스트넷 RPC에 연결하지 못해 확인하지 못했어요. 서버의 네트워크 연결을 확인한 뒤 다시 눌러 주세요.", cleared: false };
  return { message: "아직 블록에서 이 결제를 찾지 못했어요. 잠시 뒤 다시 눌러 주세요.", cleared: false };
}

// 영수증으로 결과를 만든다. 성공 금액은 보낸 값을 그대로 쓰고(추가 조회 없음), 실패 사유를 읽다 끊기면 사유 없이 실패로 둔다.
export async function outcomeFromReceipt(tx: Hex, value: bigint, receipt: ReceiptLike, explain: () => Promise<Explanation>): Promise<Outcome> {
  const fee = receipt.gasUsed * receipt.effectiveGasPrice;
  if (receipt.status === "success") return { status: "success", tx, value, fee, block: receipt.blockNumber };
  const explanation = await explain().catch(() => undefined);
  return explanation ? { status: "failed", tx, fee, explanation } : { status: "failed", tx, fee };
}
