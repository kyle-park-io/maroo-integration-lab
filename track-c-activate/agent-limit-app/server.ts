// 에이전트 한도 결제 레퍼런스 앱의 서버. [Live Testnet]
//
//   pnpm c:agent-limit        # 먼저 한 번. 에이전트 지갑 연결, 금고 배포, fund() 정책 바인딩
//   pnpm c:app                # http://127.0.0.1:5175
//
// 소유자(구매 기업 지갑)가 에이전트의 TransferLimit 를 저장하고, 에이전트 지갑이 금고 fund() 로 협력사 A 몫을 넣는다.
// 서명은 이 서버가 레포 밖 역할 키로 한다. 브라우저에는 키와 서명 창이 없다. 서버는 127.0.0.1 에만 열린다.
// 결제는 eth_estimateGas 사전 검사 → 서명 → 보내기 → 영수증 순서다. 사전 검사에서 거절되면 보내지 않는다.
// 서명한 tx 의 해시를 보내기 전에 계산해, 보내는 중 RPC 가 끊기거나 영수증이 늦으면 「확인 중」으로 두고 그 해시를 다시 읽는다.
//
// 환경 변수
//   AGENT_APP_PORT        기본 5175
//   RECEIPT_TIMEOUT_MS    영수증을 기다리는 시간. 기본 30000(2026-10-23 테스트넷 블록 간격 1~2초, 결제 영수증은 몇 초 안에 왔다)
//   MAROO_RPC_URL         테스트넷 RPC(shared/lib/maroo.ts)

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import {
  encodeFunctionData, getAddress, keccak256, parseEther, toFunctionSelector, toHex, type Abi, type Address, type Hex,
} from "viem";
import { marooPublicActions, marooWalletActions } from "@maroo-chain/viem";
import { iPclAbi } from "@maroo-chain/contracts/abi/precompiles/pcl/IPcl";
import { ROOT } from "../../shared/lib/paths.ts";
import { EXPLORER, PCL, RPC, addressOf, publicClient, walletFor } from "../../shared/lib/maroo.ts";
import { describePolicy, type PolicySet } from "../../shared/lib/pcl-policy.ts";
import { explainCall, explainTx, loadAbi } from "../../shared/lib/explain-chain.ts";
import { classifyRevert } from "../../shared/lib/explain.ts";
import { allowedRequest, classifySendError, encodeLimit, formatOkrw as fmt, isRpcTrouble, messageFor, parseAmount, parseGas, readLimit, rebroadcastResult, type Outcome } from "./app-logic.ts";
import { outcomeFromReceipt, recheckPending, type Pending, type ReceiptLike } from "./flow.ts";

const PORT = Number(process.env.AGENT_APP_PORT ?? 5175);
const RECEIPT_TIMEOUT_MS = Number(process.env.RECEIPT_TIMEOUT_MS ?? 30_000);
const KEY = "TransferLimit";
const PUBLIC = path.join(ROOT, "track-c-activate/agent-limit-app/public");
const DATA = path.join(ROOT, ".work/agent-app");
fs.mkdirSync(DATA, { recursive: true });

const pub = publicClient.extend(marooPublicActions());
const abi = loadAbi();
const vaultAbi = abi as Abi;
const owner = getAddress(addressOf("BUYER")), agent = getAddress(addressOf("AGENT")), supplierA = getAddress(addressOf("SUPPLIER_A"));

// c:agent-limit 가 남긴 가장 최근 기록에서 에이전트 ID 와 금고를 읽는다
function latestAgentRecord(): { agentId: bigint; vault: Address; file: string } {
  const dir = path.join(ROOT, "track-c-activate/evidence/live");
  const files = fs.readdirSync(dir).filter((f) => f.startsWith("agent-limit-")).sort().reverse();
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    if (j.vault && j.agentId) return { agentId: BigInt(j.agentId), vault: getAddress(j.vault), file: f };
  }
  throw new Error("c:agent-limit 기록이 없습니다. pnpm c:agent-limit 를 먼저 실행하십시오.");
}
const { agentId, vault, file: recordFile } = latestAgentRecord();
const fundData = encodeFunctionData({ abi: vaultAbi, functionName: "fund", args: [supplierA] });

const errText = (e: unknown) => String((e as Error)?.message ?? e) + " " + String((e as { cause?: unknown })?.cause ?? "");
const isNetwork = (e: unknown) => /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|ECONNRESET|socket hang up|HTTP request failed|took too long/i.test(errText(e));
const notFound = (e: unknown) => /NotFound|could not be found/i.test(`${(e as Error)?.name} ${(e as Error)?.message}`);
// 사전 검사 RPC 가 답하지 않은 경우. 거절과 나눠 「보내지 않음」으로 쓴다.
class RpcTrouble extends Error {}

// 결제 기록과 확인 중인 tx. 서버를 다시 켜도 남도록 파일에 둔다.
type LogEntry = { id: number; at: string; kind: "pay" | "limit" | "topup"; amount: string; gas?: string; format?: "string"; outcome: string; stamp: string; body: string; next?: unknown; tx?: Hex; receiptMs?: number };
const logFile = path.join(DATA, "log.json"), pendingFile = path.join(DATA, "pending.json");
const log: LogEntry[] = fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile, "utf8")) : [];
let pending: Pending | null = fs.existsSync(pendingFile) ? JSON.parse(fs.readFileSync(pendingFile, "utf8")) : null;
const persist = () => {
  fs.writeFileSync(logFile, JSON.stringify(log, null, 2));
  if (pending) fs.writeFileSync(pendingFile, JSON.stringify(pending)); else fs.rmSync(pendingFile, { force: true });
};
const record = (e: Omit<LogEntry, "id" | "at">) => {
  const entry = { id: (log.at(-1)?.id ?? 0) + 1, at: new Date().toISOString(), ...e };
  log.push(entry);
  persist();
  console.log(`[${entry.stamp}] ${entry.kind} ${entry.amount} ${entry.tx ?? ""} ${entry.receiptMs !== undefined ? `${entry.receiptMs}ms` : ""}`);
  return entry;
};

// 한 번에 하나씩 보낸다(논스가 겹치지 않게)
let chain = Promise.resolve();
const serial = <T>(fn: () => Promise<T>) => { const p = chain.then(fn); chain = p.then(() => undefined, () => undefined); return p; };

async function state() {
  const [raw, ownerBal, agentBal, buyerSlot, policies] = await Promise.all([
    pub.identity.getMetadata({ args: [agentId, KEY] }),
    pub.getBalance({ address: owner }), pub.getBalance({ address: agent }),
    pub.readContract({ address: vault, abi: vaultAbi, functionName: "buyer" }) as Promise<Address>,
    pub.readContract({ address: PCL, abi: iPclAbi, functionName: "contractPolicies", args: [vault] }) as Promise<{ policies: readonly PolicySet[] }>,
  ]);
  const limit = readLimit(raw as Hex);
  const fundSel = toFunctionSelector("fund(address)");
  const bound = policies.policies.filter((p) => p.selector.toLowerCase() === fundSel).map(describePolicy);
  return {
    network: { rpc: RPC, chainId: 450815, explorer: EXPLORER },
    agentId: agentId.toString(), owner, agent, vault, supplierA, recordFile,
    vaultBuyerIsAgent: getAddress(buyerSlot) === agent,
    fundPolicies: bound,
    limit: limit.kind === "ok" ? { kind: "ok", okrw: fmt(limit.wei) } : limit.kind === "invalid" ? { kind: "invalid", reason: limit.reason } : { kind: "none" },
    balances: { owner: fmt(ownerBal), agent: fmt(agentBal) },
    pending, log: log.slice(-30).reverse(),
  };
}

async function estimate(value: bigint): Promise<{ gas: bigint } | { explanation: Awaited<ReturnType<typeof explainCall>> }> {
  // 잔고와 상관없이 정책 판정과 가스를 얻으려고 에이전트 잔고를 상태 덮어쓰기로 넉넉히 둔다. 잔고 부족은 따로 본다.
  const override = value + parseEther("1000");
  const res = await fetch(RPC, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_estimateGas", params: [{ from: agent, to: vault, data: fundData, value: toHex(value) }, "latest", { [agent]: { balance: toHex(override) } }] }),
  });
  const j = (await res.json().catch(() => ({}))) as { result?: Hex; error?: { code?: number; message?: string; data?: unknown } };
  if (isRpcTrouble(res.status, j.error)) throw new RpcTrouble(res.status !== 200 ? `HTTP ${res.status}` : (j.error?.message ?? "응답 없음"));
  if (j.result) return { gas: BigInt(j.result) };
  return { explanation: await explainCall({ from: agent, to: vault, data: fundData, value }, { abi, method: "eth_estimateGas", balanceOverride: override }) };
}

async function pay(value: bigint, fixedGas?: bigint): Promise<{ outcome: Outcome; entry: LogEntry }> {
  const amount = fmt(value);
  const finish = (outcome: Outcome, extra: Partial<LogEntry> = {}) => {
    const m = messageFor(outcome);
    return { outcome, entry: record({ kind: "pay", amount, outcome: outcome.status, stamp: m.stamp, body: m.body, next: m.next, ...extra }) };
  };
  let est;
  try { est = await estimate(value); } catch (e) {
    if (e instanceof RpcTrouble) return finish({ status: "network", detail: e.message });
    if (isNetwork(e)) return finish({ status: "network" });
    throw e;
  }
  if ("explanation" in est) return finish({ status: "rejected", explanation: est.explanation });

  const wallet = walletFor("AGENT");
  const gas = fixedGas ?? (est.gas * 125n) / 100n;
  let request, serialized: Hex;
  try {
    request = await wallet.prepareTransactionRequest({ account: wallet.account, to: vault, data: fundData, value, gas, chain: wallet.chain });
    const balance = await pub.getBalance({ address: agent });
    const need = value + gas * (request.maxFeePerGas ?? 0n);
    if (balance < need) return finish({ status: "blocked", balance, need });
    serialized = await wallet.signTransaction(request as never);
  } catch (e) {
    if (isNetwork(e)) return finish({ status: "network" });
    throw e;
  }
  const tx = keccak256(serialized);
  const started = Date.now();
  try {
    await pub.sendRawTransaction({ serializedTransaction: serialized });
  } catch (e) {
    if (/insufficient funds|exceeds the balance/i.test(String((e as Error).message))) {
      return finish({ status: "blocked", balance: await pub.getBalance({ address: agent }), need: value + gas * (request.maxFeePerGas ?? 0n) });
    }
    // 연결 자체가 안 됐으면 노드에 닿지 않았다. 연결 뒤에 끊기거나 늦으면 노드가 받았는지 모르니 서명한 tx 를 두고 해시로 다시 읽는다.
    const kind = classifySendError(errText(e));
    if (kind === "not-sent") return finish({ status: "network" });
    if (kind === "ambiguous") return unknown(tx, amount, value, serialized, fixedGas);
    // 노드가 받지 않았다(가스 한도가 최소보다 작음, 논스 등). 오류 데이터와 메시지로 사유를 푼다.
    const { data, message } = rpcError(e);
    return finish({ status: "refused", decoded: classifyRevert({ data, rpcMessage: message }), nodeMessage: message }, { gas: fixedGas?.toString() });
  }
  return settle(tx, amount, value, serialized, started, fixedGas);
}

// viem 오류 사슬에서 노드가 돌려준 오류 데이터와 메시지를 찾는다
function rpcError(e: unknown): { data?: Hex; message: string } {
  let x = e as { data?: unknown; details?: string; message?: string; cause?: unknown } | undefined;
  let data: Hex | undefined, message = "";
  for (let i = 0; x && i < 6; i++, x = x.cause as typeof x) {
    if (!data && typeof x.data === "string" && x.data.startsWith("0x")) data = x.data as Hex;
    if (!message && typeof x.details === "string") message = x.details;
  }
  return { data, message: message || String((e as Error).message).split("\n")[0] };
}

// 확인 중으로 둔다. 서명한 tx 를 함께 남겨, 다시 읽을 때 노드에 없으면 같은 tx(같은 해시)를 다시 보낸다.
function unknown(tx: Hex, amount: string, value: bigint, serialized: Hex, fixedGas?: bigint) {
  const outcome: Outcome = { status: "unknown", tx };
  const m = messageFor(outcome);
  const entry = record({ kind: "pay", amount, gas: fixedGas?.toString(), outcome: "unknown", stamp: m.stamp, body: m.body, next: m.next, tx });
  pending = { tx, id: entry.id, value: amount, wei: value.toString(), serialized };
  persist();
  return { outcome, entry };
}

async function settle(tx: Hex, amount: string, value: bigint, serialized: Hex, started: number, fixedGas?: bigint) {
  let receipt;
  try {
    receipt = await pub.waitForTransactionReceipt({ hash: tx, timeout: RECEIPT_TIMEOUT_MS, pollingInterval: 500 });
  } catch {
    return unknown(tx, amount, value, serialized, fixedGas);
  }
  try {
    return await resolved(tx, amount, value, receipt, Date.now() - started, fixedGas);
  } catch {
    // 영수증은 받았지만 결과 전표를 쓰지 못했다. 확인 중으로 두어 새 결제를 받지 않는다.
    return unknown(tx, amount, value, serialized, fixedGas);
  }
}

async function resolved(tx: Hex, amount: string, value: bigint, receipt: ReceiptLike, receiptMs?: number, fixedGas?: bigint) {
  const outcome = await outcomeFromReceipt(tx, value, receipt, () => explainTx(tx, { abi }));
  const m = messageFor(outcome);
  return { outcome, entry: record({ kind: "pay", amount, gas: fixedGas?.toString(), outcome: outcome.status, stamp: m.stamp, body: m.body, next: m.next, tx, receiptMs }) };
}

// 확인 중으로 남긴 전표의 안내는 더 할 일이 없으니 결과 전표를 가리키게 바꾼다
function pointToResult(p: Pending, resultId: number, what: string) {
  const old = log.find((e) => e.id === p.id);
  if (!old) return;
  old.stamp = "다시 읽음";
  old.body = `보낸 직후에는 블록에 들어갔는지 확인하지 못한 결제예요. 다시 읽어 확인한 ${what}는 전표 ${resultId}에 있어요.`;
  old.next = undefined;
}

const weiOf = (p: Pending) => (p.wei ? BigInt(p.wei) : parseEther(p.value.replace(/,/g, "")));

async function recheck() {
  if (!pending) return { message: "확인 중인 결제가 없어요." };
  const p = pending;
  const r = await recheckPending(p, {
    getReceipt: (tx) => pub.getTransactionReceipt({ hash: tx }).catch((e) => { if (notFound(e)) return undefined; throw e; }),
    inMempool: (tx) => pub.getTransaction({ hash: tx }).then(() => true, (e) => { if (notFound(e)) return false; throw e; }),
    rebroadcast: (serialized) => pub.sendRawTransaction({ serializedTransaction: serialized }).then(() => "ok" as const, (e) => rebroadcastResult(errText(e))),
    recheckReceipt: (tx) => pub.waitForTransactionReceipt({ hash: tx, timeout: 5_000 }).catch(() => undefined),
    resolve: async (pp, receipt) => {
      const res = await resolved(pp.tx, pp.value, weiOf(pp), receipt);
      pointToResult(pp, res.entry.id, "결과");
      return res.entry;
    },
    dropped: (pp) => {
      const m = messageFor({ status: "dropped", tx: pp.tx });
      const entry = record({ kind: "pay", amount: pp.value, outcome: "dropped", stamp: m.stamp, body: m.body, next: m.next, tx: pp.tx });
      pointToResult(pp, entry.id, "결과(블록에 들어가지 않음)");
      return entry;
    },
    clearPending: () => { pending = null; persist(); },
  });
  return { message: r.message, cleared: r.cleared, checkedAt: new Date().toISOString() };
}

async function sendOwner(kind: "limit" | "topup", amount: string, send: () => Promise<Hex>, ok: string, extra: Partial<LogEntry> = {}) {
  let tx: Hex;
  try { tx = await send(); } catch (e) {
    const body = isNetwork(e) ? "Maroo 테스트넷 RPC에 연결하지 못해 보내지 않았어요. 서버의 네트워크 연결을 확인한 뒤 다시 눌러 주세요."
      : /insufficient funds|exceeds the balance/i.test(String((e as Error).message)) ? "구매 기업 지갑의 OKRW가 모자라 보내지 않았어요. 구매 기업 지갑에 테스트넷 OKRW를 받은 뒤 다시 눌러 주세요."
        : `보내지 못했어요(${String((e as Error).message).split("\n")[0]}).`;
    return record({ kind, amount, outcome: "error", stamp: "보내지 않음", body, ...extra });
  }
  const receipt = await pub.waitForTransactionReceipt({ hash: tx, timeout: RECEIPT_TIMEOUT_MS }).catch(() => undefined);
  if (!receipt) return record({ kind, amount, outcome: "unknown", stamp: "확인 중", body: "보냈지만 블록에 들어갔는지 아직 확인하지 못했어요. 잠시 뒤 화면 다시 읽기를 눌러 주세요.", tx, ...extra });
  if (receipt.status !== "success") return record({ kind, amount, outcome: "failed", stamp: "실패", body: `블록에서 되돌려졌어요. 서버 로그에서 pnpm explain ${tx} 로 사유를 확인해 주세요.`, tx, ...extra });
  return record({ kind, amount, outcome: "success", stamp: "완료", body: ok, tx, ...extra });
}

const setLimit = (wei: bigint, format: "uint256" | "string") => sendOwner("limit", fmt(wei), () =>
  walletFor("BUYER").extend(marooWalletActions()).identity.setMetadata({ args: [agentId, KEY, encodeLimit(wei, format)] }),
format === "uint256"
  ? `한도를 ${fmt(wei)} OKRW로 저장했어요(32바이트 정수).`
  : `한도를 숫자 문자열로 저장했어요. 2026-09-26 판 문서의 형식이라 다음 결제는 한도 형식 오류로 거절돼요. 확인한 뒤 한도 저장하기를 다시 눌러 주세요.`,
format === "string" ? { format } : {});

const topUp = (wei: bigint) => sendOwner("topup", fmt(wei), () => walletFor("BUYER").sendTransaction({ to: agent, value: wei }),
  `에이전트 지갑에 ${fmt(wei)} OKRW를 넣었어요.`);

// ── HTTP
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };
const json = (res: http.ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
};
const body = (req: http.IncomingMessage) => new Promise<Record<string, string>>((resolve) => {
  let s = "";
  req.on("data", (c) => (s += c));
  req.on("end", () => { try { resolve(JSON.parse(s || "{}")); } catch { resolve({}); } });
});
const badAmount = "금액을 OKRW 단위 숫자로 입력해 주세요(예: 3 또는 0.5).";
const badGas = "가스 한도는 비워 두거나 양의 정수로 입력해 주세요(예: 60000).";

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname.startsWith("/api/") && !allowedRequest({ method: req.method ?? "GET", host: req.headers.host, origin: req.headers.origin }, PORT)) {
    return json(res, 403, { error: `이 서버의 화면(http://127.0.0.1:${PORT})에서만 요청할 수 있어요. 주소창에 그 주소를 열어 다시 시도해 주세요.` });
  }
  try {
    if (url.pathname === "/api/state") return json(res, 200, await state());
    if (req.method === "POST" && url.pathname === "/api/pay") {
      const b = await body(req);
      const value = parseAmount(b.amount ?? "");
      if (!value) return json(res, 400, { error: badAmount });
      const gas = parseGas(b.gas);
      if (gas === null) return json(res, 400, { error: badGas });
      // 확인 중인 결제 검사도 한 줄로 세운 뒤에 한다(두 창에서 동시에 눌러도 둘 다 지나가지 않게)
      const r = await serial(async () => (pending ? null : pay(value, gas)));
      if (!r) return json(res, 409, { error: "확인 중인 결제가 있어 새 결제를 받지 않았어요. 결제 기록 다시 읽기를 먼저 눌러 주세요." });
      return json(res, 200, r.entry);
    }
    if (req.method === "POST" && url.pathname === "/api/recheck") return json(res, 200, await serial(recheck));
    if (req.method === "POST" && url.pathname === "/api/limit") {
      const b = await body(req);
      const value = parseAmount(b.amount ?? "");
      if (!value) return json(res, 400, { error: badAmount });
      return json(res, 200, await serial(() => setLimit(value, b.format === "string" ? "string" : "uint256")));
    }
    if (req.method === "POST" && url.pathname === "/api/topup") {
      const b = await body(req);
      const value = parseAmount(b.amount ?? "");
      if (!value) return json(res, 400, { error: badAmount });
      return json(res, 200, await serial(() => topUp(value)));
    }
    const file = path.join(PUBLIC, url.pathname === "/" ? "index.html" : url.pathname);
    if (file.startsWith(PUBLIC) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
      return res.end(fs.readFileSync(file));
    }
    res.writeHead(404).end();
  } catch (e) {
    console.error(e);
    if (isNetwork(e)) return json(res, 503, { error: "Maroo 테스트넷 RPC에 연결하지 못했어요. 서버의 네트워크 연결을 확인한 뒤 화면 다시 읽기를 눌러 주세요.", network: true });
    return json(res, 500, { error: `서버에서 처리하지 못했어요(${String((e as Error).message).split("\n")[0]}). 서버 로그를 확인해 주세요.` });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`에이전트 한도 결제 앱: http://127.0.0.1:${PORT}`);
  console.log(`에이전트 ${agentId}, 금고 ${vault} (${recordFile}), 영수증 대기 ${RECEIPT_TIMEOUT_MS}ms, RPC ${RPC}`);
});
