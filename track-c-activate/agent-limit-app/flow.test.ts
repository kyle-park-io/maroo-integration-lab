// 결제 확인 흐름(flow.ts) 단위 테스트. 체인 호출은 가짜 함수로 바꾼다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { outcomeFromReceipt, recheckPending, type Pending, type RecheckDeps } from "./flow.ts";

const p: Pending = { tx: "0xaa", id: 7, value: "3", wei: "3000000000000000000", serialized: "0x02f8" };
const receipt = { status: "success" as const, gasUsed: 100n, effectiveGasPrice: 2n, blockNumber: 9n };

function deps(over: Partial<RecheckDeps>, calls: string[]): RecheckDeps {
  return {
    getReceipt: async () => undefined,
    inMempool: async () => false,
    rebroadcast: async () => "ok",
    resolve: async () => { calls.push("resolve"); return { id: 8, body: "결과" }; },
    dropped: () => { calls.push("dropped"); return { id: 8, body: "보내지 않음" }; },
    clearPending: () => calls.push("clear"),
    ...over,
  };
}

test("영수증이 있으면 결과 전표를 쓴 뒤에 확인 중 상태를 지운다", async () => {
  const calls: string[] = [];
  const r = await recheckPending(p, deps({ getReceipt: async () => receipt }, calls));
  assert.deepEqual(calls, ["resolve", "clear"]);
  assert.equal(r.cleared, true);
});

test("결과 전표를 쓰다 실패하면 확인 중 상태를 지우지 않는다(새 결제를 받지 않게)", async () => {
  const calls: string[] = [];
  await assert.rejects(recheckPending(p, deps({ getReceipt: async () => receipt, resolve: async () => { throw new TypeError("fetch failed"); } }, calls)));
  assert.deepEqual(calls, []);
});

test("노드 대기열에 있거나 다시 보내 받아들여지면 기다린다", async () => {
  for (const over of [{ inMempool: async () => true }, { rebroadcast: async () => "ok" as const }, { rebroadcast: async () => "known" as const }, { rebroadcast: async () => "network" as const }]) {
    const calls: string[] = [];
    const r = await recheckPending(p, deps(over, calls));
    assert.equal(r.cleared, false);
    assert.deepEqual(calls, []);
  }
});

test("영수증이 없고 같은 논스를 다른 tx 가 썼으면 보내지 않음으로 정리한다", async () => {
  const calls: string[] = [];
  const r = await recheckPending(p, deps({ rebroadcast: async () => "nonce-too-low" }, calls));
  assert.deepEqual(calls, ["dropped", "clear"]);
  assert.equal(r.cleared, true);
});

// 영수증을 읽은 뒤 같은 tx 를 다시 보내기 전에 그 결제가 블록에 들어가면 노드는 nonce too low 로 답한다.
// 그때 보내지 않음으로 정리하면 돈은 나갔는데 화면은 들어가지 않았다고 쓴다. 영수증을 한 번 더 읽는다.
test("다시 보낸 답이 nonce too low 면 보내지 않음으로 정리하기 전에 영수증을 한 번 더 읽는다", async () => {
  const calls: string[] = [];
  let reads = 0;
  const r = await recheckPending(p, deps({ getReceipt: async () => (++reads === 1 ? undefined : receipt), rebroadcast: async () => "nonce-too-low" }, calls));
  assert.deepEqual(calls, ["resolve", "clear"]);
  assert.equal(r.message, "결과");
  assert.equal(reads, 2);
});

test("성공 영수증은 알고 있는 금액으로, 실패 영수증은 사유를 읽지 못해도 실패로 만든다", async () => {
  const ok = await outcomeFromReceipt("0xaa", 5n, receipt, async () => { throw new Error("부르면 안 됨"); });
  assert.deepEqual(ok, { status: "success", tx: "0xaa", value: 5n, fee: 200n, block: 9n });
  const failed = await outcomeFromReceipt("0xaa", 5n, { ...receipt, status: "reverted" }, async () => { throw new TypeError("fetch failed"); });
  assert.equal(failed.status, "failed");
  assert.equal((failed as { explanation?: unknown }).explanation, undefined);
});

test("다시 보낸 답이 already known 이면 노드가 이미 받았다고 쓰고, 받아들여졌으면 다시 보냈다고 쓴다", async () => {
  // Maroo 테스트넷은 블록 전 tx 를 조회에 보이지 않아(2026-10-23 실측) 대기열의 결제도 다시 보내게 되고, 노드는 already known 으로 답한다.
  const known = await recheckPending(p, deps({ rebroadcast: async () => "known" as const }, []));
  assert.match(known.message, /이미 받아/);
  assert.doesNotMatch(known.message, /찾지 못해/);
  const ok = await recheckPending(p, deps({ rebroadcast: async () => "ok" as const }, []));
  assert.match(ok.message, /찾지 못해 같은 결제를 다시 보냈어요/);
});
