// Track A 레시피: 공급업체 정산의 투명 경로를 마루 테스트넷에서 실행한다. [Live Testnet]
//
//   pnpm build:contracts      # shared/contracts/SettlementVault.sol
//   pnpm a:kyb-gate
//
// 역할과 키는 shared/lib/maroo.ts 가 레포 밖 파일에서 읽는다.
//   BUYER          구매 기업. 금고를 배포하고 PCL 정책을 관리하고 대금을 넣는다
//   UPGRADE_OWNER  금고 프록시의 업그레이드 권한. 주소만 쓴다(이 흐름에서 서명하지 않는다)
//   ISSUER         KYB 발급자. 스키마를 등록하고 협력사에 증명을 발급하고 폐기한다
//   SUPPLIER_A     증명을 받는 협력사
//   SUPPLIER_B     증명이 없는 협력사
// 구매 기업과 발급자는 faucet(https://faucet.maroo.io/api/agent/sendToken)으로 tOKRW 를 받아 둔다.
//
// 흐름
//   1. 구매 기업이 협력사와 발급자에게 가스용 OKRW 를 보낸다. 일반 OKRW 이체가 공개 체인에 어떻게 보이는지의 기준선이다
//   2. 발급자가 KYB 스키마를 등록한다(이미 있으면 그 UID 를 쓴다)
//   3. 구매 기업이 SettlementVault 를 Transparent PCL 프록시로 배포한다. 업그레이드 권한은 UPGRADE_OWNER 에 둔다.
//      claim() 선택자에만 EAS_POLICY(KYB 스키마)를 건다
//   4. 구매 기업이 협력사 A, B 몫으로 대금을 넣는다(fund 는 정책 대상이 아니다)
//   5. 증명이 없는 협력사 B 의 claim: 거부
//   6. 협력사 A 에 증명 발급 뒤 색인 전 claim: 거부. 색인 뒤 claim: 통과
//   7. A 몫을 다시 넣고 증명을 폐기한 뒤 claim: 거부
//   8. 구매 기업이 폐기된 A 몫과 청구되지 않은 B 몫을 회수(recall)
// 거부 단계는 simulateContract 로 사유를 읽은 뒤, 같은 호출을 가스를 고정해 실제로 보내 실패한 tx 도 남긴다.
// 결과는 track-a-explain/evidence/live/pcl-kyb-gate-<시각>.json 에 남긴다. 개인키는 출력하지 않는다.

import fs from "node:fs";
import path from "node:path";
import {
  encodeAbiParameters, encodeFunctionData, encodePacked, formatEther, getAddress, keccak256, parseEther, parseEventLogs,
  toFunctionSelector, zeroAddress, zeroHash, type Abi, type Address, type Hex,
} from "viem";
import { iPclAbi } from "@maroo-chain/contracts/abi/precompiles/pcl/IPcl";
import { ROOT } from "../../shared/lib/paths.ts";
import {
  EAS_PARAMS, EXPLORER, PCL, account, addressOf, easAbi, easParamsAbi, indexerAbi, publicClient as pub, revertReason,
  schemaRegistryAbi, walletFor, writeEvidence, type Role,
} from "../../shared/lib/maroo.ts";

const KYB_SCHEMA = "bytes32 bizRegNoHash, bool kybVerified";
const SHARE = parseEther("100");
const GAS_TOPUP = parseEther("60");
// ERC-1967 슬롯. 구현 주소와 ProxyAdmin 주소를 탐색기 표시 대신 슬롯에서 직접 읽는다(CPIMP 대응).
const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";

const artifact = JSON.parse(fs.readFileSync(path.join(ROOT, "out/SettlementVault.sol/SettlementVault.json"), "utf8"));
const vaultAbi = artifact.abi as Abi;
const decodeAbi = [...vaultAbi, ...iPclAbi.filter((x) => x.type === "error")] as Abi;
const ownerAbi = [{ name: "owner", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }] as const;

const buyer = addressOf("BUYER"), issuer = addressOf("ISSUER"), supplierA = addressOf("SUPPLIER_A"), supplierB = addressOf("SUPPLIER_B");
const upgradeOwner = addressOf("UPGRADE_OWNER");
const steps: Record<string, unknown>[] = [];

function log(step: string, data: Record<string, unknown> = {}) {
  steps.push({ step, ...data });
  const tx = data.tx ? ` ${EXPLORER}/tx/${data.tx}` : "";
  console.log(`[${data.result ?? "기록"}] ${step}${data.reason ? ` : ${data.reason}` : ""}${tx}`);
}

async function send(label: string, role: Role, req: { to: Address; data?: Hex; value?: bigint }) {
  const hash = await walletFor(role).sendTransaction(req);
  const r = await pub.waitForTransactionReceipt({ hash });
  log(label, { tx: hash, block: r.blockNumber.toString(), gasUsed: r.gasUsed.toString(), result: r.status === "success" ? "성공" : "실패" });
  if (r.status !== "success") throw new Error(`${label} 이 실패했습니다: ${hash}`);
  return r;
}

// 거부가 예상되는 호출. 사유는 시뮬레이션으로 읽고, 실패한 tx 도 남기려고 가스를 고정해 실제로 보낸다.
async function expectReject(label: string, role: Role, to: Address, functionName: string) {
  let reason = "시뮬레이션이 거부하지 않았다";
  try {
    await pub.simulateContract({ account: account(role), address: to, abi: decodeAbi, functionName });
  } catch (err) {
    reason = revertReason(err, decodeAbi);
  }
  const data = encodeFunctionData({ abi: vaultAbi, functionName });
  const hash = await walletFor(role).sendTransaction({ to, data, gas: 300_000n });
  const r = await pub.waitForTransactionReceipt({ hash });
  log(label, { tx: hash, block: r.blockNumber.toString(), reason, result: r.status === "reverted" ? "예상대로 거부" : "예상과 달리 성공" });
}

const balance = async (a: Address) => formatEther(await pub.getBalance({ address: a }));

// 0. 잔액 확인
if ((await pub.getBalance({ address: buyer })) < parseEther("1000")) {
  console.error(`구매 기업 잔액이 부족합니다(${await balance(buyer)} OKRW). faucet 으로 받은 뒤 다시 실행하십시오.`);
  process.exit(1);
}
log("시작 잔액", { buyer: await balance(buyer), issuer: await balance(issuer) });

// 1. 일반 OKRW 이체(기준선)와 가스 보충
for (const [name, to] of [["협력사 A", supplierA], ["협력사 B", supplierB], ["KYB 발급자", issuer]] as const) {
  if ((await pub.getBalance({ address: to })) < GAS_TOPUP / 2n) {
    await send(`1) 구매 기업 → ${name} OKRW ${formatEther(GAS_TOPUP)} 일반 이체`, "BUYER", { to, value: GAS_TOPUP });
  }
}

// 2. KYB 스키마
const { schemaRegistry, eas, indexer } = await pub.readContract({ address: EAS_PARAMS, abi: easParamsAbi, functionName: "getParams" });
const schemaUid = keccak256(encodePacked(["string", "address", "bool"], [KYB_SCHEMA, zeroAddress, true]));
const existing = await pub.readContract({ address: schemaRegistry, abi: schemaRegistryAbi, functionName: "getSchema", args: [schemaUid] });
if (existing.uid === zeroHash) {
  await send("2) KYB 스키마 등록", "ISSUER", { to: schemaRegistry, data: encodeFunctionData({ abi: schemaRegistryAbi, functionName: "register", args: [KYB_SCHEMA, zeroAddress, true] }) });
} else {
  log("2) KYB 스키마가 이미 있어 재사용", { schemaUid });
}

// 3. 금고 배포와 정책
const implHash = await walletFor("BUYER").deployContract({ abi: vaultAbi, bytecode: artifact.bytecode.object as Hex });
const implRcpt = await pub.waitForTransactionReceipt({ hash: implHash });
log("3a) SettlementVault 구현 배포", { tx: implHash, address: implRcpt.contractAddress, result: implRcpt.status === "success" ? "성공" : "실패" });
const initializer = encodeFunctionData({ abi: vaultAbi, functionName: "initialize", args: [buyer] });
// Transparent: abi.encode(logic, initialOwner, initializer). initialOwner 가 업그레이드 권한을 갖는다.
const initData = encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "bytes" }], [implRcpt.contractAddress!, upgradeOwner, initializer]);
const proxyRcpt = await send("3b) PCL 프록시 배포(deployPclProxy, Transparent)", "BUYER", {
  to: PCL, data: encodeFunctionData({ abi: iPclAbi, functionName: "deployPclProxy", args: [1, 0n, initData] }),
});
// 시뮬레이션 반환값과 실제 주소가 다를 수 있어(9/23, 9/25 재현) 이벤트에서 읽는다.
const vault = parseEventLogs({ abi: iPclAbi, logs: proxyRcpt.logs, eventName: "PclProxyDeployed" })[0].args.proxy as Address;
const entry = await pub.readContract({ address: PCL, abi: iPclAbi, functionName: "pclProxy", args: [vault] });
const slotAddress = async (slot: Hex) => getAddress(`0x${((await pub.getStorageAt({ address: vault, slot })) ?? "0x").slice(-40)}`);
const implementation = await slotAddress(IMPLEMENTATION_SLOT);
if (implementation !== getAddress(implRcpt.contractAddress!)) {
  throw new Error(`구현 슬롯이 배포한 구현과 다릅니다: 슬롯 ${implementation}, 배포 ${implRcpt.contractAddress}`);
}
const proxyAdmin = await slotAddress(ADMIN_SLOT);
let proxyAdminOwner: string;
try {
  proxyAdminOwner = await pub.readContract({ address: proxyAdmin, abi: ownerAbi, functionName: "owner" });
} catch (err) {
  proxyAdminOwner = `조회 실패: ${revertReason(err)}`;
}
log("3b) 금고 프록시와 권한", { vault, implementation, pclKind: entry.kind, policyAdmin: entry.admin, proxyAdmin, upgradeOwner: proxyAdminOwner });

const claimSelector = toFunctionSelector("claim()");
const easPolicy = encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "bytes32" }], [eas, indexer, schemaUid]);
await send("3c) claim() 에 EAS_POLICY(KYB) 바인딩", "BUYER", {
  to: PCL,
  data: encodeFunctionData({ abi: iPclAbi, functionName: "changeContractPolicies", args: [{ _contract: vault, admin: buyer, policies: [{ templateId: "EAS_POLICY", policy: easPolicy, selector: claimSelector }] }] }),
});

// 4. 대금 넣기
const fund = (s: Address) => encodeFunctionData({ abi: vaultAbi, functionName: "fund", args: [s] });
await send("4) 협력사 A 몫 100 OKRW 넣기", "BUYER", { to: vault, data: fund(supplierA), value: SHARE });
await send("4) 협력사 B 몫 100 OKRW 넣기", "BUYER", { to: vault, data: fund(supplierB), value: SHARE });

// 5. 증명 없는 협력사 B
await expectReject("5) 협력사 B claim, 증명 없음", "SUPPLIER_B", vault, "claim");

// 6. 협력사 A 증명 발급, 색인, claim
const bizHash = keccak256(encodePacked(["string"], ["demo-business-registration-A"]));
const attData = encodeAbiParameters([{ type: "bytes32" }, { type: "bool" }], [bizHash, true]);
const attRcpt = await send("6a) 협력사 A KYB 증명 발급", "ISSUER", {
  to: eas,
  data: encodeFunctionData({ abi: easAbi, functionName: "attest", args: [{ schema: schemaUid, data: { recipient: supplierA, expirationTime: 0n, revocable: true, refUID: zeroHash, data: attData, value: 0n } }] }),
});
const attUid = parseEventLogs({ abi: easAbi, logs: attRcpt.logs, eventName: "Attested" })[0].args.uid as Hex;
await expectReject("6b) 협력사 A claim, 증명은 있으나 색인 전", "SUPPLIER_A", vault, "claim");
await send("6c) 증명 색인(indexAttestation)", "ISSUER", { to: indexer, data: encodeFunctionData({ abi: indexerAbi, functionName: "indexAttestation", args: [attUid] }) });
const beforeA = await balance(supplierA);
await send("6d) 협력사 A claim, 증명과 색인 뒤", "SUPPLIER_A", { to: vault, data: encodeFunctionData({ abi: vaultAbi, functionName: "claim" }) });
log("6d) 협력사 A 잔액", { before: beforeA, after: await balance(supplierA) });

// 7. 폐기 뒤 claim
await send("7a) 협력사 A 몫 100 OKRW 다시 넣기", "BUYER", { to: vault, data: fund(supplierA), value: SHARE });
await send("7b) 협력사 A 증명 폐기", "ISSUER", { to: eas, data: encodeFunctionData({ abi: easAbi, functionName: "revoke", args: [{ schema: schemaUid, data: { uid: attUid, value: 0n } }] }) });
await expectReject("7c) 협력사 A claim, 증명 폐기 뒤", "SUPPLIER_A", vault, "claim");

// 8. 청구할 수 없게 된 몫과 청구되지 않은 몫 회수
const beforeBuyer = await balance(buyer);
const recall = (s: Address) => encodeFunctionData({ abi: vaultAbi, functionName: "recall", args: [s] });
await send("8) 구매 기업이 협력사 A 몫 회수(증명 폐기)", "BUYER", { to: vault, data: recall(supplierA) });
await send("8) 구매 기업이 협력사 B 몫 회수(청구되지 않음)", "BUYER", { to: vault, data: recall(supplierB) });
const owed = async (s: Address) => (await pub.readContract({ address: vault, abi: vaultAbi, functionName: "owed", args: [s] })) as bigint;
log("8) 회수 뒤", { buyerBefore: beforeBuyer, buyerAfter: await balance(buyer), owedA: await owed(supplierA), owedB: await owed(supplierB) });
const startBalance = steps.find((x) => x.step === "시작 잔액") as { buyer: string; issuer: string };
log("사용한 OKRW", { buyer: `${startBalance.buyer} → ${await balance(buyer)}`, issuer: `${startBalance.issuer} → ${await balance(issuer)}` });

const file = writeEvidence(path.join(ROOT, "track-a-explain/evidence/live"), "pcl-kyb-gate", {
  chainId: await pub.getChainId(), ranAt: new Date().toISOString(),
  roles: { buyer, upgradeOwner, issuer, supplierA, supplierB },
  schema: { uid: schemaUid, definition: KYB_SCHEMA }, vault, claimSelector, attestationUid: attUid, steps,
});
console.log(`기록: ${path.relative(ROOT, file)}`);
