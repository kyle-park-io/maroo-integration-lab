// Track C 트랙 2 요건 실증: 에이전트 지갑의 OKRW 결제를 TransferLimit 메타데이터와
// AGENT_OKRW_TRANSFER_LIMIT_POLICY 로 제한한다. [Live Testnet]
//
//   pnpm setup:wallets          # AGENT 역할 키가 없으면 더한다
//   pnpm build:contracts
//   pnpm c:agent-limit [--agent <agentId>]
//
// 역할
//   BUYER          에이전트 소유자(ERC-8004 NFT). 에이전트 지갑 연결, 메타데이터, 금고 배포와 정책 바인딩을 보낸다
//   AGENT          에이전트 지갑. 금고의 구매자 자리에서 fund() 로 결제한다
//   SUPPLIER_A     결제를 받는 협력사
//   UPGRADE_OWNER  금고 프록시의 업그레이드 권한(주소만 쓴다)
// 흐름
//   0. 에이전트 ID 와 소유자 확인, 에이전트 지갑에 가스용 OKRW
//   1. setAgentWallet: 에이전트 지갑이 EIP-712 로 서명하고 소유자가 보낸다(이미 연결돼 있으면 건너뜀)
//   2. 기존 SettlementVault 를 구매자 = 에이전트 지갑으로 PCL 프록시에 배포하고 fund() 에 AGENT_OKRW_TRANSFER_LIMIT_POLICY
//   3. TransferLimit 형식 확인: Maroo Docs 의 aokrw 숫자 문자열과 SDK 주석의 32바이트 uint256 을 차례로 쓰고
//      한도 안과 한도 초과 결제를 eth_call(simulatePclProxy)과 eth_estimateGas 로 확인한다
//   4. 한도 안 결제(성공 tx)와 한도 초과 결제(거부 tx, 가스 고정)
//   5. 기록과 c:judge --track 2 입력(evidence.json)
// SDK(@maroo-chain/viem)의 레지스트리 액션, policy.agentOkrwTransferLimit, pcl.deployPclProxy, simulatePclProxy, PclViolation 을 쓴다.
// 한 번 실행에 OKRW 100 안팎이 든다(가스 보충 30, 결제 3, 배포와 tx 가스). 개인키는 출력하지 않는다.

import fs from "node:fs";
import path from "node:path";
import {
  encodeFunctionData, formatEther, getAddress, numberToHex, parseEther, toFunctionSelector, toHex, type Abi, type Address, type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { iPclAbi } from "@maroo-chain/contracts/abi/precompiles/pcl/IPcl";
import { Abis, identityRegistryAbi, marooPublicActions, marooWalletActions, pclProxyKinds, policy } from "@maroo-chain/viem";
import { ROOT } from "../../shared/lib/paths.ts";
import {
  EXPLORER, PCL, account, addressOf, decodeRaw, publicClient, rawEthCall, revertReason, walletFor, writeEvidence,
} from "../../shared/lib/maroo.ts";

const LIMIT = parseEther("5");
const PAY_OK = parseEther("3");
const PAY_OVER = parseEther("8");
const AGENT_GAS = parseEther("30");
const AGENT_MIN = parseEther("40");
const KEY = "TransferLimit";

const artifact = JSON.parse(fs.readFileSync(path.join(ROOT, "out/SettlementVault.sol/SettlementVault.json"), "utf8"));
const vaultAbi = artifact.abi as Abi;
const decodeAbi = [...vaultAbi, ...(Abis.errors as unknown as Abi), ...iPclAbi.filter((x) => x.type === "error")] as Abi;

const pub = publicClient.extend(marooPublicActions());
const buyerSdk = walletFor("BUYER").extend(marooWalletActions());
const buyer = addressOf("BUYER"), agent = getAddress(addressOf("AGENT")), supplierA = addressOf("SUPPLIER_A"), upgradeOwner = addressOf("UPGRADE_OWNER");
const steps: Record<string, unknown>[] = [];

function log(step: string, data: Record<string, unknown> = {}) {
  steps.push({ step, ...data });
  const tx = data.tx ? ` ${EXPLORER}/tx/${data.tx}` : "";
  console.log(`[${data.result ?? "기록"}] ${step}${data.reason ? ` : ${data.reason}` : ""}${tx}`);
}
async function confirm(label: string, hash: Hex) {
  const r = await pub.waitForTransactionReceipt({ hash });
  log(label, { tx: hash, block: r.blockNumber.toString(), gasUsed: r.gasUsed.toString(), result: r.status === "success" ? "성공" : "실패" });
  if (r.status !== "success") throw new Error(`${label} 이 실패했습니다: ${hash}`);
  return r;
}

// 0. 에이전트와 소유자
const argAgent = process.argv.indexOf("--agent");
const page = { key: "0x", offset: 0n, limit: 100n, countTotal: false, reverse: false } as const;
const agentIdsOf = async (wallet: Address) => (await pub.agent.getAgentIds({ args: [wallet, page] }))[0];
// getAgentIds 는 소유자가 아니라 연결된 에이전트 지갑으로 찾는다. 연결 전에는 소유자 주소가 에이전트 지갑이다.
const [buyerAgents, agentWalletAgents] = [await agentIdsOf(buyer), await agentIdsOf(agent)];
const agentId = argAgent >= 0 ? BigInt(process.argv[argAgent + 1]) : (agentWalletAgents[0] ?? buyerAgents[buyerAgents.length - 1]);
if (agentId === undefined) throw new Error("구매 기업이 소유한 에이전트가 없습니다. pnpm c:grounding 으로 먼저 등록하십시오.");
const owner = await pub.identity.ownerOf({ args: [agentId] });
if (getAddress(owner) !== getAddress(buyer)) throw new Error(`에이전트 ${agentId} 의 소유자가 구매 기업이 아닙니다: ${owner}`);
const registry = (await pub.agent.getParams()).identityRegistry;
log("0) 에이전트", {
  agentId: agentId.toString(), owner, registry, agentWallet: agent,
  getAgentIdsOfOwner: buyerAgents.map(String), getAgentIdsOfAgentWallet: agentWalletAgents.map(String),
});
// 결제 값과 최대 가스비(가스 한도 × maxFeePerGas)를 함께 낼 잔액을 맞춘다
async function ensureAgentBalance(label: string, min: bigint) {
  if ((await pub.getBalance({ address: agent })) < min) {
    await confirm(`${label} 구매 기업 → 에이전트 지갑 OKRW ${formatEther(AGENT_GAS)}`, await walletFor("BUYER").sendTransaction({ to: agent, value: AGENT_GAS }));
  }
}
await ensureAgentBalance("0)", AGENT_MIN);

// 1. 에이전트 지갑 연결
let setWalletTx: Hex | undefined;
const current = await pub.identity.getAgentWallet({ args: [agentId] });
if (getAddress(current) === agent) {
  // 이전 실행의 연결 tx 를 MetadataSet(agentWallet) 이벤트에서 찾는다. 테스트넷 RPC 는 한 번에 1만 블록까지 조회한다.
  let to = await pub.getBlockNumber();
  for (let i = 0; i < 5 && !setWalletTx && to > 0n; i++, to -= 10_000n) {
    const logs = await pub.getContractEvents({
      address: registry, abi: identityRegistryAbi, eventName: "MetadataSet", args: { agentId }, fromBlock: to > 9_999n ? to - 9_999n : 0n, toBlock: to,
    });
    setWalletTx = logs.filter((l) => l.args.metadataKey === "agentWallet").pop()?.transactionHash;
  }
  log("1) 에이전트 지갑이 이미 연결돼 있어 건너뜀", { current, previousTx: setWalletTx ?? "최근 5만 블록에 없음" });
} else {
  const [, name, version, chainId, verifyingContract] = await pub.identity.eip712Domain();
  // 마감은 체인 블록 시각 기준 5분 안이어야 한다
  const deadline = (await pub.getBlock()).timestamp + 240n;
  const signature = await account("AGENT").signTypedData({
    domain: { name, version, chainId, verifyingContract },
    types: { AgentWalletSet: [
      { name: "agentId", type: "uint256" }, { name: "newWallet", type: "address" }, { name: "owner", type: "address" }, { name: "deadline", type: "uint256" },
    ] },
    primaryType: "AgentWalletSet",
    message: { agentId, newWallet: agent, owner: buyer, deadline },
  });
  const r = await confirm("1) setAgentWallet(에이전트 지갑 서명, 소유자 전송)", await buyerSdk.identity.setAgentWallet({ args: [agentId, agent, deadline, signature] }));
  setWalletTx = r.transactionHash;
}
// 마감 제한 확인: 버리는 새 지갑의 서명으로 시뮬레이션만 한다(tx 없음)
{
  const [, name, version, chainId, verifyingContract] = await pub.identity.eip712Domain();
  const probe = privateKeyToAccount(generatePrivateKey());
  const results: Record<string, string> = {};
  for (const extra of [299n, 301n]) {
    const deadline = (await pub.getBlock()).timestamp + extra;
    const signature = await probe.signTypedData({
      domain: { name, version, chainId, verifyingContract }, primaryType: "AgentWalletSet",
      types: { AgentWalletSet: [
        { name: "agentId", type: "uint256" }, { name: "newWallet", type: "address" }, { name: "owner", type: "address" }, { name: "deadline", type: "uint256" },
      ] },
      message: { agentId, newWallet: probe.address, owner: buyer, deadline },
    });
    results[`블록 시각 +${extra}초`] = await pub.simulateContract({
      account: buyer, address: registry, abi: identityRegistryAbi, functionName: "setAgentWallet", args: [agentId, probe.address, deadline, signature],
    }).then(() => "통과").catch((e) => revertReason(e));
  }
  log("1) setAgentWallet 마감 제한(시뮬레이션)", { ...results, reason: Object.entries(results).map(([k, v]) => `${k} ${v}`).join(", ") });
}
const walletAfter = await pub.identity.getAgentWallet({ args: [agentId] });
const idsForAgent = await agentIdsOf(agent);
log("1) 연결 확인", { getAgentWallet: walletAfter, ownerOf: await pub.identity.ownerOf({ args: [agentId] }), getAgentIdsOfOwner: (await agentIdsOf(buyer)).map(String), getAgentIdsOfAgentWallet: idsForAgent.map(String) });

// 2. 금고 배포와 정책
const implHash = await walletFor("BUYER").deployContract({ abi: vaultAbi, bytecode: artifact.bytecode.object as Hex });
const implRcpt = await pub.waitForTransactionReceipt({ hash: implHash });
log("2a) SettlementVault 구현 배포", { tx: implHash, address: implRcpt.contractAddress, result: implRcpt.status === "success" ? "성공" : "실패" });
const proxyRcpt = await confirm("2b) PCL 프록시 배포(구매자 = 에이전트 지갑)", await buyerSdk.pcl.deployPclProxy({
  kind: pclProxyKinds.Transparent, logic: implRcpt.contractAddress!, initialOwner: upgradeOwner,
  initializer: encodeFunctionData({ abi: vaultAbi, functionName: "initialize", args: [agent] }),
}));
const vault = buyerSdk.pcl.deployPclProxy.extractEvent(proxyRcpt.logs).args.proxy;
const fundSelector = toFunctionSelector("fund(address)");
const bindRcpt = await confirm("2c) fund() 에 AGENT_OKRW_TRANSFER_LIMIT_POLICY 바인딩", await buyerSdk.pcl.changeContractPolicies({
  contract: vault, admin: buyer, policies: [policy.agentOkrwTransferLimit({ selector: fundSelector })],
}));
log("2d) 금고", { vault, buyerSlot: await pub.readContract({ address: vault, abi: vaultAbi, functionName: "buyer" }) });

// 결제를 보내지 않고 두 방법으로 확인한다. eth_call 은 SDK simulatePclProxy, eth_estimateGas 는 전역 정책까지 평가한다.
async function check(value: bigint) {
  const sim = await pub.pcl.simulatePclProxy({ account: agent, address: vault, abi: vaultAbi, functionName: "fund", args: [supplierA], value });
  const ethCall = sim.status === "succeeded" ? "통과"
    : sim.revert ? `${sim.revert.errorName}(${(sim.revert.args ?? []).join(", ")})` : revertReason(sim.error, decodeAbi);
  const est = await rawEthCall({ from: agent, to: vault, data: encodeFunctionData({ abi: vaultAbi, functionName: "fund", args: [supplierA] }), value }, "eth_estimateGas");
  const estimateGas = est.error ? (est.error.data && est.error.data !== "0x" ? decodeRaw(est.error.data, decodeAbi) : est.error.message) : `통과(가스 ${BigInt(est.result!)})`;
  return { value: formatEther(value), ethCall, violation: sim.status === "reverted" ? sim.violation : null, estimateGas, gas: est.result ? BigInt(est.result) : undefined };
}
const show = (label: string, c: Awaited<ReturnType<typeof check>>) =>
  log(label, {
    value: c.value, ethCall: c.ethCall, estimateGas: c.estimateGas, reason: `eth_call ${c.ethCall} / eth_estimateGas ${c.estimateGas}`,
    violation: c.violation ? JSON.stringify(c.violation, (_, v) => (typeof v === "bigint" ? v.toString() : v)) : null,
  });

// 3. TransferLimit 형식
const metaBefore = await pub.identity.getMetadata({ args: [agentId, KEY] });
const noMeta = await check(PAY_OK);
show(`3a) 실행 전 메타데이터 ${metaBefore === "0x" ? "없음" : metaBefore}, ${formatEther(PAY_OK)} OKRW`, noMeta);
const formats = [
  { name: "빈 값(메타데이터 없음과 같은 상태)", bytes: "0x" as Hex },
  { name: "Maroo Docs: aokrw 숫자 문자열", bytes: toHex(LIMIT.toString()) },
  { name: "SDK 주석: 32바이트 big-endian uint256", bytes: numberToHex(LIMIT, { size: 32 }) },
];
const formatResults: Record<string, unknown>[] = [];
let lastWritten: Hex | undefined;
let metadataTx: Hex | undefined;
for (const f of formats) {
  const hash = await buyerSdk.identity.setMetadata({ args: [agentId, KEY, f.bytes] }).catch((e) => e as Error);
  if (hash instanceof Error) {
    log(`3b) setMetadata(${KEY}, ${f.name})`, { result: "보내지 못함", reason: revertReason(hash) });
    formatResults.push({ format: f.name, bytes: f.bytes, setMetadata: revertReason(hash), works: false });
    continue;
  }
  const r = await confirm(`3b) setMetadata(${KEY}, ${f.name})`, hash);
  lastWritten = f.bytes;
  metadataTx = r.transactionHash;
  const within = await check(PAY_OK), over = await check(PAY_OVER);
  show(`3c) ${f.name}, 한도 안 ${formatEther(PAY_OK)} OKRW`, within);
  show(`3c) ${f.name}, 한도 초과 ${formatEther(PAY_OVER)} OKRW`, over);
  formatResults.push({ format: f.name, bytes: f.bytes, setMetadataTx: r.transactionHash, within, over, works: within.ethCall === "통과" && /ExceededAgentTransferLimit/.test(over.ethCall + over.estimateGas) });
}
const working = formats.find((_, i) => formatResults[i].works);
if (!working) {
  const file = writeEvidence(path.join(ROOT, "track-c-activate/evidence/live"), "agent-limit", { checkedAt: new Date().toISOString(), agentId: agentId.toString(), vault, steps, formatResults });
  console.log(`두 형식 모두 한도가 동작하지 않았습니다. 기록: ${path.relative(ROOT, file)}`);
  process.exit(1);
}
if (working.bytes !== lastWritten) {
  metadataTx = (await confirm(`3d) setMetadata(${KEY}, ${working.name}) 다시 씀`, await buyerSdk.identity.setMetadata({ args: [agentId, KEY, working.bytes] }))).transactionHash;
}
log("3e) 쓰는 형식", { format: working.name, getMetadata: await pub.identity.getMetadata({ args: [agentId, KEY] }) });

// 4. 실제 결제
const agentWallet = walletFor("AGENT");
const okHash = await agentWallet.writeContract({ address: vault, abi: vaultAbi, functionName: "fund", args: [supplierA], value: PAY_OK });
const okRcpt = await confirm(`4a) 에이전트 결제 ${formatEther(PAY_OK)} OKRW(한도 ${formatEther(LIMIT)})`, okHash);
const owed = await pub.readContract({ address: vault, abi: vaultAbi, functionName: "owed", args: [supplierA] }) as bigint;
log("4a) 협력사 A 몫", { owed: formatEther(owed) });
const overCheck = await check(PAY_OVER);
await ensureAgentBalance("4b)", PAY_OVER + parseEther("25"));
// 거부 tx 도 남긴다. 한도 안 결제의 추정 가스에 여유를 두어, 가스 부족이 아닌 정책 거부로 끝나게 한다.
const overGas = ((await check(PAY_OK)).gas ?? 400_000n) * 3n / 2n;
const overHash = await agentWallet.sendTransaction({ to: vault, data: encodeFunctionData({ abi: vaultAbi, functionName: "fund", args: [supplierA] }), value: PAY_OVER, gas: overGas });
const overRcpt = await pub.waitForTransactionReceipt({ hash: overHash });
log(`4b) 에이전트 결제 ${formatEther(PAY_OVER)} OKRW(한도 초과)`, {
  tx: overHash, block: overRcpt.blockNumber.toString(), gasLimit: overGas.toString(), gasUsed: overRcpt.gasUsed.toString(),
  reason: overCheck.ethCall, result: overRcpt.status === "reverted" ? "예상대로 거부" : "예상과 달리 성공",
});

// 5. 기록
const file = writeEvidence(path.join(ROOT, "track-c-activate/evidence/live"), "agent-limit", {
  checkedAt: new Date().toISOString(), label: "[Live Testnet]", agentId: agentId.toString(), owner: buyer, agentWallet: agent, registry, vault,
  limit: formatEther(LIMIT), payOk: formatEther(PAY_OK), payOver: formatEther(PAY_OVER), setAgentWalletTx: setWalletTx ?? "이미 연결됨",
  metadataBefore: metaBefore, noMetadataCheck: noMeta, formatResults, workingFormat: working.name, steps,
});
const grounding = fs.readdirSync(path.join(ROOT, "track-c-activate/evidence/live")).filter((f) => f.startsWith("grounding-")).sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, "track-c-activate/evidence/live", f), "utf8")))
  .map((g) => g.track2?.registerTx).find((t) => t?.agentId !== undefined && BigInt(t.agentId) === agentId);
const base = { label: "[Live Testnet]", network: "maroo-testnet", chainId: 450815 };
const items = [
  ...(grounding ? [{ ...base, requirement: "R1", target: registry, call: "register(string)", input: "소유자: 구매 기업", txHash: grounding.hash, expected: "성공", actual: `agentId ${agentId}` }] : []),
  ...(setWalletTx ? [{ ...base, requirement: "R1", target: registry, call: "setAgentWallet", input: "에이전트 지갑 EIP-712 서명", txHash: setWalletTx, expected: "성공", actual: `getAgentWallet = ${walletAfter}` }] : []),
  { ...base, requirement: "R2", target: registry, call: `setMetadata(${KEY})`, input: `${formatEther(LIMIT)} OKRW, ${working.name}`, txHash: metadataTx, expected: "성공", actual: "getMetadata 로 확인" },
  { ...base, requirement: "R2", target: PCL, call: "changeContractPolicies", input: `금고 ${vault}, fund() 선택자`, txHash: bindRcpt.transactionHash, expected: "성공", actual: "AGENT_OKRW_TRANSFER_LIMIT_POLICY" },
  { ...base, requirement: "R3", target: vault, call: "fund(address)", input: `에이전트 지갑, ${formatEther(PAY_OK)} OKRW`, txHash: okRcpt.transactionHash, expected: "성공", actual: `협력사 A 몫 ${formatEther(owed)} OKRW` },
  { ...base, requirement: "R4", target: vault, call: "fund(address)", input: `에이전트 지갑, ${formatEther(PAY_OVER)} OKRW`, txHash: overHash, expected: "PCL 거부", actual: overCheck.ethCall },
];
const exampleDir = path.join(ROOT, "track-c-activate/evidence/track2-example");
fs.mkdirSync(exampleDir, { recursive: true });
fs.writeFileSync(path.join(exampleDir, "evidence.json"), JSON.stringify({
  project: "Track C 트랙 2 요건을 이 레포에서 직접 채운 예시 제출물", track: 2, sources: [path.relative(ROOT, file)], items,
}, null, 2) + "\n");
console.log(`기록: ${path.relative(ROOT, file)}\n판정 입력: track-c-activate/evidence/track2-example/evidence.json (pnpm c:judge <파일> --track 2)`);
