// 거부 해석기의 체인 쪽. tx 해시나 호출을 받아 영수증, 직전 블록 재시뮬레이션, PCL 설정을 읽고
// explain.ts 의 판정 함수로 Explanation 을 만든다. 조회만 하고 tx 는 보내지 않는다.

import fs from "node:fs";
import path from "node:path";
import { getAddress, toEventSelector, toFunctionSelector, toHex, type Abi, type AbiFunction, type Address, type Hex } from "viem";
import { iPclAbi } from "@maroo-chain/contracts/abi/precompiles/pcl/IPcl";
import { PCL, RPC, publicClient as pub } from "./maroo.ts";
import { ROOT } from "./paths.ts";
import { bareTemplates, describePolicy, templatesIn, type PolicySet } from "./pcl-policy.ts";
import { classifyRevert, decideScope, reasonTemplates, refineByUncappedReplay, type Explanation } from "./explain.ts";

const KIND = ["Unspecified", "Transparent", "UUPS", "Beacon"];
const POLICY_CHECK_PASSED = toEventSelector("PolicyCheckPassed(address,address)");

type RpcReply = { result?: Hex; error?: { message: string; data?: Hex } };
async function rpc(method: string, params: unknown[]): Promise<RpcReply> {
  const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return (await res.json()) as RpcReply;
}

// 레포의 금고 ABI(pnpm bootstrap 이 out/ 에 만든다)와 --abi 로 받은 ABI 를 합친다
export function loadAbi(files: string[] = []): Abi {
  const vault = path.join(ROOT, "out/SettlementVault.sol/SettlementVault.json");
  const all = [...(fs.existsSync(vault) ? [vault] : []), ...files];
  return all.flatMap((f) => {
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    return (Array.isArray(j) ? j : j.abi) as Abi;
  });
}

function selectorName(abi: Abi, selector?: Hex): string | undefined {
  if (!selector) return undefined;
  const fn = abi.find((x) => x.type === "function" && toFunctionSelector(x as AbiFunction) === selector) as AbiFunction | undefined;
  return fn ? `${fn.name}()` : undefined;
}

// 대상 주소가 PCL 프록시인지, 호출한 선택자에 묶인 컨트랙트 정책, 전역 정책
async function readPolicies(to: Address, selector?: Hex) {
  const proxy = (await pub.readContract({ address: PCL, abi: iPclAbi, functionName: "pclProxy", args: [to] })) as { kind: number };
  const isProxy = Number(proxy.kind) !== 0;
  const contractSets = isProxy
    ? (((await pub.readContract({ address: PCL, abi: iPclAbi, functionName: "contractPolicies", args: [to] })) as { policies: readonly PolicySet[] }).policies ?? [])
    : [];
  const bound = contractSets.filter((p) => p.selector === "0x" || (selector && p.selector.toLowerCase() === selector.toLowerCase()));
  const globalSets = ((await pub.readContract({ address: PCL, abi: iPclAbi, functionName: "globalPolicies" })) as { policies: readonly PolicySet[] }).policies ?? [];
  const templates = (sets: readonly PolicySet[]) => [...new Set(sets.flatMap((p) => [...templatesIn(p)]))];
  return {
    target: { isProxy, kind: KIND[Number(proxy.kind)] ?? String(proxy.kind), bound: bound.map(describePolicy), global: globalSets.map(describePolicy) },
    contractTemplates: templates(bound),
    globalTemplates: templates(globalSets),
    globalBare: [...new Set(globalSets.flatMap((p) => [...bareTemplates(p)]))],
  };
}

async function withScope(e: Explanation, to: Address): Promise<Explanation> {
  const p = await readPolicies(to, e.call.selector);
  e.target = p.target;
  if (e.decoded?.family === "pcl-policy") {
    e.scope = decideScope({
      isProxy: p.target.isProxy, contract: p.contractTemplates, global: p.globalTemplates, globalBare: p.globalBare,
      reason: [...reasonTemplates(e.decoded)], wrapped: e.decoded.name === "AnyOfRejected",
    });
  }
  return e;
}

export async function explainTx(hash: Hex, opts: { abi?: Abi } = {}): Promise<Explanation> {
  const abi = opts.abi ?? [];
  const [tx, receipt] = await Promise.all([pub.getTransaction({ hash }), pub.getTransactionReceipt({ hash })]);
  const to = tx.to ? getAddress(tx.to) : undefined;
  const selector = tx.input.length >= 10 ? (tx.input.slice(0, 10).toLowerCase() as Hex) : undefined;
  const e: Explanation = {
    source: "tx",
    tx: { hash, block: receipt.blockNumber, status: receipt.status, gasUsed: receipt.gasUsed, gasLimit: tx.gas },
    call: { from: getAddress(tx.from), to: to ?? "(컨트랙트 생성)", selector, selectorName: selectorName(abi, selector), value: tx.value },
  };
  if (receipt.status === "success") {
    e.policyCheckPassed = receipt.logs.some((l) => getAddress(l.address) === getAddress(PCL) && l.topics[0] === POLICY_CHECK_PASSED);
    return to ? withScope(e, to) : e;
  }
  // 영수증에는 revert 데이터가 없다. 직전 블록 상태로 같은 호출을 다시 시뮬레이션해 사유를 얻는다.
  const replay = await rpc("eth_call", [{ from: tx.from, to: tx.to, data: tx.input, value: toHex(tx.value), gas: toHex(tx.gas) }, toHex(receipt.blockNumber - 1n)]);
  e.decoded = classifyRevert({ data: replay.error?.data, extraAbi: abi, rpcMessage: replay.error?.data ? undefined : replay.error?.message, gasUsed: receipt.gasUsed, gasLimit: tx.gas });
  // 데이터 없이 되돌려졌으면 가스 한도 없이 다시 실행해 가스 부족인지 본다
  if (replay.error && (!replay.error.data || replay.error.data === "0x")) {
    const uncapped = await rpc("eth_call", [{ from: tx.from, to: tx.to, data: tx.input, value: toHex(tx.value) }, toHex(receipt.blockNumber - 1n)]);
    e.decoded = refineByUncappedReplay(e.decoded, !uncapped.error, { gasUsed: receipt.gasUsed, gasLimit: tx.gas });
  }
  if (replay.error?.data && replay.error.data !== "0x") {
    e.replayNote = "사유는 직전 블록 상태로 다시 시뮬레이션해 얻었습니다. 같은 블록의 앞선 tx가 상태를 바꿨으면 실제 사유와 다를 수 있습니다.";
  } else if (!replay.error && e.decoded.family === "no-data") {
    e.replayNote = "직전 블록 상태로 다시 시뮬레이션하면 통과합니다. 같은 블록의 앞선 tx가 상태를 바꿨거나, 실행 뒤 전역 정책 재검사에서 거부됐을 수 있습니다.";
  }
  return to ? withScope(e, to) : e;
}

export async function explainCall(
  call: { from: Address; to: Address; data?: Hex; value?: bigint },
  opts: { abi?: Abi; method?: "eth_estimateGas" | "eth_call"; balanceOverride?: bigint } = {},
): Promise<Explanation> {
  const abi = opts.abi ?? [];
  const method = opts.method ?? "eth_estimateGas";
  const data = call.data ?? "0x";
  const selector = data.length >= 10 ? (data.slice(0, 10).toLowerCase() as Hex) : undefined;
  const req = { from: call.from, to: call.to, data, value: toHex(call.value ?? 0n) };
  const override = opts.balanceOverride !== undefined ? [{ [call.from]: { balance: toHex(opts.balanceOverride) } }] : [];
  const reply = await rpc(method, [req, "latest", ...override]);
  const e: Explanation = {
    source: "simulation", method,
    call: { from: getAddress(call.from), to: getAddress(call.to), selector, selectorName: selectorName(abi, selector), value: call.value ?? 0n },
  };
  if (reply.error) {
    e.decoded = classifyRevert({ data: reply.error.data, extraAbi: abi, rpcMessage: reply.error.data && reply.error.data !== "0x" ? undefined : reply.error.message });
  }
  return withScope(e, getAddress(call.to));
}
