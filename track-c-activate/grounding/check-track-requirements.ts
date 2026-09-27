// Track C 기술 근거: 세 해커톤 트랙의 최소 연동 요건이 기대는 Maroo 기능을 테스트넷에서 직접 확인한다. [Live Testnet]
//
//   pnpm c:grounding            # 조회와 시뮬레이션만 한다. 트랜잭션은 보내지 않는다
//   pnpm c:grounding --write    # 구매 기업 지갑으로 에이전트 신원 등록 tx 한 건을 보낸다(가스만 쓴다)
//
// 트랙마다 확인하는 것
//   트랙 1 비공개 기업 정산(Flagship)  Privacy 프리컴파일에 걸린 정책, 예치 요청이 처음 막히는 층,
//                                       심사자가 탐색기 API로 Privacy tx 를 확인하는 경로
//   트랙 2 규칙 안에서 결제하는 에이전트  Agent 프리컴파일, ERC-8004 IdentityRegistry, 등록 시뮬레이션,
//                                       에이전트 한도 정책 템플릿, 전역 정책의 에이전트 소유자 평가
//   트랙 3 규정을 지키는 원화 결제 앱    OKRW 파라미터와 ERC-20 표현, EAS 주소와 KYC 스키마,
//                                       전역 정책의 24시간 한도, 주소별 사용량 조회
// 결과는 track-c-activate/evidence/live/grounding-<시각>.json 에 남긴다. 개인키는 출력하지 않는다.

import path from "node:path";
import { encodeFunctionData, getAddress, parseAbi, parseEventLogs, type Address, type Hex } from "viem";
import { iPclAbi } from "@maroo-chain/contracts/abi/precompiles/pcl/IPcl";
import { iPrivacyAbi } from "@maroo-chain/contracts/abi/precompiles/privacy/IPrivacy";
import { iAgentAbi } from "@maroo-chain/contracts/abi/precompiles/agent/IAgent";
import { ROOT } from "../../shared/lib/paths.ts";
import { TEMPLATES, describePolicy, findEasSchema, type PolicySet } from "../../shared/lib/pcl-policy.ts";
import {
  EAS_PARAMS, EXPLORER, OKRW, PCL, PRIVACY, RPC, addressOf, decodeRaw, easParamsAbi, publicClient as pub,
  rawEthCall, schemaRegistryAbi, walletFor, writeEvidence,
} from "../../shared/lib/maroo.ts";

const AGENT = "0x100000000000000000000000000000000000000A" as const;
const IDENTITY_REGISTRY = "0x8004000000000000000000000000000000000001" as const;
const OKRW_ERC20 = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as const;
const WRITE = process.argv.includes("--write");

// 탐색기에 검증된 PreinstallIdentityRegistry 소스에서 이 스크립트가 쓰는 함수만 옮겼다.
const identityAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function getVersion() pure returns (string)",
  "function balanceOf(address owner) view returns (uint256)",
  "function register(string agentURI) returns (uint256 agentId)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
]);
const erc20Abi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

const buyer = getAddress(addressOf("BUYER"));
const report: Record<string, unknown> = { rpc: RPC, checkedAt: new Date().toISOString(), block: (await pub.getBlockNumber()).toString(), caller: buyer };
const bigintSafe = (_: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);
const show = (label: string, data: unknown) => console.log(`${label}: ${typeof data === "string" ? data : JSON.stringify(data, bigintSafe)}`);

// 공통: PCL 템플릿 등록 상태와 전역 정책
const templates: Record<string, string> = {};
for (const id of TEMPLATES) {
  try {
    const t = await pub.readContract({ address: PCL, abi: iPclAbi, functionName: "policyTemplate", args: [id] }) as { templateId: string; name: string };
    templates[id] = t.templateId ? `등록됨 (${t.name})` : "등록 안 됨";
  } catch (err) {
    templates[id] = `등록 안 됨: ${(err as Error).message.split("\n")[0]}`;
  }
}
// 없는 ID 는 되돌려진다. 위 결과가 "등록됨"이면 체인에 실제로 있는 템플릿이다.
const unknownTemplate = await pub.readContract({ address: PCL, abi: iPclAbi, functionName: "policyTemplate", args: ["NOT_A_TEMPLATE"] })
  .then(() => "되돌려지지 않음").catch(() => "되돌려짐");
const pclParams = await pub.readContract({ address: PCL, abi: iPclAbi, functionName: "getParams" });
const globalCfg = await pub.readContract({ address: PCL, abi: iPclAbi, functionName: "globalPolicies" }) as { policies: readonly PolicySet[] };
const globalPolicy = globalCfg.policies.map(describePolicy).join(", ");
report.common = { templates, unknownTemplate, pclParams, globalPolicy };
console.log("[공통] PCL");
for (const [id, s] of Object.entries(templates)) console.log(`  ${id.padEnd(40)} ${s}`);
show("  없는 템플릿 ID 조회", unknownTemplate);
show("  PCL getParams", pclParams);
show("  전역 정책", globalPolicy);

// 트랙 1: 비공개 기업 정산
console.log("\n[트랙 1] 비공개 기업 정산");
const privacyCfg = await pub.readContract({ address: PCL, abi: iPclAbi, functionName: "contractPolicies", args: [PRIVACY] }) as { admin: Address; policies: readonly PolicySet[] };
const privacyPolicy = privacyCfg.policies.map(describePolicy).join(", ");
const privacyFns = iPrivacyAbi.filter((x) => x.type === "function").map((x) => (x as { name: string }).name);
const depositData = encodeFunctionData({ abi: iPrivacyAbi, functionName: "deposit", args: [{ noteCommitment: "0x", encryptedNote: "0x", proof: "0x" }] });
const depositProbe: Record<string, string> = {};
for (const method of ["eth_call", "eth_estimateGas"] as const) {
  const r = await rawEthCall({ from: buyer, to: PRIVACY, data: depositData }, method);
  depositProbe[method] = !r.error ? "거부되지 않음" : r.error.data && r.error.data !== "0x" ? decodeRaw(r.error.data, iPrivacyAbi) : r.error.message;
}
// 심사자가 참가자의 Privacy tx 를 확인하는 경로. 첫 페이지의 상태 분포와 가장 최근 시각만 남기고 주소와 입력은 남기지 않는다.
// 탐색기 API 가 막히거나 JSON 이 아닌 응답을 주어도 나머지 조회와 기록은 이어간다.
async function explorerPage<T>(url: string): Promise<{ items?: T[]; error?: string }> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return (await res.json()) as { items?: T[] };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
const explorerUrl = `${EXPLORER}/blockscout/api/v2/addresses/${PRIVACY}/transactions?filter=to`;
const page = await explorerPage<{ status: string; result: string; timestamp: string }>(explorerUrl);
const statuses: Record<string, number> = {};
for (const it of page.items ?? []) statuses[`${it.status}/${it.result}`] = (statuses[`${it.status}/${it.result}`] ?? 0) + 1;
const track1 = {
  privacyPolicy, privacyPolicyAdmin: privacyCfg.admin, privacyFunctions: privacyFns, depositProbe,
  explorer: { url: explorerUrl, firstPageCount: page.items?.length ?? 0, statuses, latest: page.items?.[0]?.timestamp ?? null, ...(page.error ? { error: page.error } : {}) },
};
report.track1 = track1;
show("  Privacy 정책", `${privacyPolicy}, 관리자 ${privacyCfg.admin}`);
show("  Privacy 함수", privacyFns.join(", "));
show("  빈 예치 요청", depositProbe);
show("  탐색기 API", track1.explorer);

// 트랙 2: 규칙 안에서 결제하는 에이전트
console.log("\n[트랙 2] 규칙 안에서 결제하는 에이전트");
const agentParams = await pub.readContract({ address: AGENT, abi: iAgentAbi, functionName: "getParams" }) as { identityRegistry: Address; reputationRegistry: Address };
const [regName, regSymbol, regVersion, buyerAgents] = await Promise.all([
  pub.readContract({ address: IDENTITY_REGISTRY, abi: identityAbi, functionName: "name" }),
  pub.readContract({ address: IDENTITY_REGISTRY, abi: identityAbi, functionName: "symbol" }),
  pub.readContract({ address: IDENTITY_REGISTRY, abi: identityAbi, functionName: "getVersion" }),
  pub.readContract({ address: AGENT, abi: iAgentAbi, functionName: "getAgentIds", args: [buyer, { key: "0x", offset: 0n, limit: 10n, countTotal: true, reverse: false }] }),
]);
const agentURI = "https://example.invalid/maroo-integration-lab/agent.json";
const registerSim = await pub.simulateContract({ address: IDENTITY_REGISTRY, abi: identityAbi, functionName: "register", args: [agentURI], account: buyer })
  .then((r) => `통과, 다음 agentId ${r.result}`)
  .catch((err: Error) => `거부: ${err.message.split("\n")[0]}`);
// 레지스트리로 간 최근 tx 첫 페이지. 함수 이름별 개수와 가장 최근 시각만 남긴다.
const registryUrl = `${EXPLORER}/blockscout/api/v2/addresses/${IDENTITY_REGISTRY}/transactions?filter=to`;
const registryPage = await explorerPage<{ status: string; method: string | null; timestamp: string }>(registryUrl);
const registryMethods: Record<string, number> = {};
for (const it of registryPage.items ?? []) registryMethods[`${it.status}/${it.method ?? "?"}`] = (registryMethods[`${it.status}/${it.method ?? "?"}`] ?? 0) + 1;
const codeSize = async (address: Address) => { const c = await pub.getCode({ address }); return c ? (c.length - 2) / 2 : 0; };
const track2: Record<string, unknown> = {
  agentParams, reputationRegistryCodeBytes: await codeSize(agentParams.reputationRegistry),
  identityRegistry: { address: IDENTITY_REGISTRY, name: regName, symbol: regSymbol, version: regVersion },
  buyerAgentIds: buyerAgents, registerSimulation: registerSim,
  explorer: { url: registryUrl, firstPageCount: registryPage.items?.length ?? 0, methods: registryMethods, latest: registryPage.items?.[0]?.timestamp ?? null, ...(registryPage.error ? { error: registryPage.error } : {}) },
  agentLimitTemplate: templates.AGENT_OKRW_TRANSFER_LIMIT_POLICY,
  globalPolicyUsesAgentOwners: globalPolicy.includes("AgentOwners"),
};
show("  Agent 프리컴파일 getParams", agentParams);
show("  ReputationRegistry 코드 크기(바이트)", String(track2.reputationRegistryCodeBytes));
show("  IdentityRegistry", `${regName} (${regSymbol}), 버전 ${regVersion}`);
show("  구매 기업의 에이전트", buyerAgents);
show("  register(agentURI) 시뮬레이션", registerSim);
show("  탐색기 API", track2.explorer);

if (WRITE) {
  const balance = await pub.getBalance({ address: buyer });
  if (balance === 0n) {
    track2.registerTx = "보내지 않음: 구매 기업 잔액 0";
    console.log("  등록 tx: 구매 기업 잔액이 0이라 보내지 않았습니다. faucet 으로 받은 뒤 다시 실행합니다.");
  } else {
    const hash = await walletFor("BUYER").writeContract({ address: IDENTITY_REGISTRY, abi: identityAbi, functionName: "register", args: [agentURI] });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    const [ev] = parseEventLogs({ abi: identityAbi, eventName: "Registered", logs: receipt.logs });
    const after = await pub.readContract({ address: AGENT, abi: iAgentAbi, functionName: "getAgentIds", args: [buyer, { key: "0x", offset: 0n, limit: 10n, countTotal: true, reverse: false }] });
    track2.registerTx = { hash, explorer: `${EXPLORER}/tx/${hash}`, block: receipt.blockNumber, status: receipt.status, agentId: ev?.args.agentId, agentIdsAfter: after };
    show("  등록 tx", track2.registerTx);
  }
}
report.track2 = track2;

// 트랙 3: 규정을 지키는 원화 결제 앱
console.log("\n[트랙 3] 규정을 지키는 원화 결제 앱");
const okrwParams = await pub.readContract({
  address: OKRW,
  abi: parseAbi(["function getParams() view returns ((address minter, string mintDenom))"]),
  functionName: "getParams",
});
const erc20 = await Promise.all((["name", "symbol", "decimals"] as const).map((fn) =>
  pub.readContract({ address: OKRW_ERC20, abi: erc20Abi, functionName: fn }).catch((err: Error) => `조회 실패: ${err.message.split("\n")[0]}`)));
const easParams = await pub.readContract({ address: EAS_PARAMS, abi: easParamsAbi, functionName: "getParams" });
const kycSchema = globalCfg.policies.map(findEasSchema).find(Boolean);
const schema = kycSchema
  ? await pub.readContract({ address: easParams.schemaRegistry, abi: schemaRegistryAbi, functionName: "getSchema", args: [kycSchema as Hex] })
  : undefined;
const volume = await pub.readContract({ address: PCL, abi: iPclAbi, functionName: "globalPeriodicVolume", args: [buyer, okrwParams.mintDenom, 86400n, true] })
  .catch((err: Error) => `조회 실패: ${err.message.split("\n")[0]}`);
const track3 = {
  okrw: okrwParams, okrwErc20: { address: OKRW_ERC20, codeBytes: await codeSize(OKRW_ERC20), name: erc20[0], symbol: erc20[1], decimals: erc20[2] },
  eas: easParams,
  kycSchema: schema && { uid: kycSchema, schema: schema.schema, resolver: schema.resolver, revocable: schema.revocable },
  buyerPeriodicVolume: volume,
};
report.track3 = track3;
show("  OKRW getParams", okrwParams);
show("  OKRW ERC-20", track3.okrwErc20);
show("  EAS getParams", easParams);
show("  정책이 요구하는 KYC 스키마", track3.kycSchema ?? "없음");
show("  구매 기업의 24시간 사용량", volume);

const file = writeEvidence(path.join(ROOT, "track-c-activate/evidence/live"), "grounding", {
  label: WRITE ? "조회, 시뮬레이션, 에이전트 등록 tx" : "조회와 시뮬레이션. tx 없음", ...report,
});
console.log(`\n기록: ${path.relative(ROOT, file)}`);
