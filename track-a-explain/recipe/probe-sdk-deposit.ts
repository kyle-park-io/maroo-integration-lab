// Track A 레시피: 공식 SDK(ClairveilJS)의 EVM 예치 경로를 Maroo 테스트넷 설정으로 불러, 어디서 멈추는지 확인한다.
//
//   pnpm setup:clairveil && pnpm sdk:check     # vendor/clairveiljs 와 의존성
//   pnpm a:probe-sdk
//
// Maroo 가 공개한 값만 쓴다: EVM JSON-RPC, chain ID 450815, Privacy 프리컴파일 주소, OKRW 의 mintDenom.
// Maroo 가 공개하지 않은 Cosmos RPC·REST 는 넣지 않고, SDK 가 요구하는 차폐 상태 어댑터 자리에는
// 모든 조회를 "공개되지 않음"으로 거절하는 어댑터를 넣어 SDK 가 무엇을 먼저 묻는지 기록한다.
// 거절된 조회를 짐작한 값으로 채우지 않는다(비공개 구성 요소 추측 금지). 서명은 버리는 키로 하고 tx 는 보내지 않는다.
// 결과는 track-a-explain/evidence/code/probe-sdk-deposit-<시각>.json 에 남긴다.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseAbi } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { ROOT } from "../../shared/lib/paths.ts";
import { OKRW, PRIVACY, RPC, publicClient as pub, writeEvidence } from "../../shared/lib/maroo.ts";

const sdkDir = path.join(ROOT, "vendor/clairveiljs");
if (!fs.existsSync(path.join(sdkDir, "node_modules"))) {
  console.log("vendor/clairveiljs 와 의존성이 없습니다. pnpm setup:clairveil 뒤 pnpm sdk:check 를 먼저 실행하십시오.");
  process.exit(1);
}
// vendor 는 선택 설치라 타입 검사에서 빼려고 동적으로 불러온다
const sdk = await import(pathToFileURL(path.join(sdkDir, "src/browser/wallet-client.js")).href) as {
  createClairveilBrowserDappClient: (options: Record<string, unknown>) => any;
};
const state = await import(pathToFileURL(path.join(sdkDir, "src/transport/privacy-state.js")).href) as {
  privacyStateAdapterRequiredMethods: readonly string[]; privacyStateAdapterOptionalMethods: readonly string[];
};
const sdkCommit = fs.readFileSync(path.join(sdkDir, ".git/HEAD"), "utf8").trim();

const chainId = await pub.getChainId();
const { mintDenom } = await pub.readContract({
  address: OKRW, abi: parseAbi(["function getParams() view returns ((address minter, string mintDenom))"]), functionName: "getParams",
});
const evmChainId = `0x${chainId.toString(16)}`;

const called: string[] = [];
const refusing = Object.fromEntries(state.privacyStateAdapterRequiredMethods.map((m) => [m, async () => {
  called.push(m);
  throw new Error(`Maroo 가 공개하지 않은 조회: ${m}`);
}]));

const baseProfile = {
  id: "maroo-testnet", label: "Maroo Testnet", chainName: "Maroo Testnet", transport: "evm", wallet: "metamask", chainId: "maroo-testnet",
  // SDK 가 필수로 요구하는 prover 주소. 이 진단은 prover 까지 가지 않으므로 쓰이지 않는 로컬 주소를 둔다
  proverUrl: "http://127.0.0.1:18080",
  evmRpc: RPC, evmChainId, evmChainName: "Maroo Testnet", evmPrivacyPrecompileAddress: PRIVACY,
  evmNativeDenom: mintDenom, evmDepositMode: "payable-exact-value", evmGasLimit: "0x989680", evmSendGasLimit: "0x5208",
  accountPrefix: "clair", shieldedPrefix: "clairs", denom: mintDenom, displayDenom: "OKRW", coinDecimals: 18,
};

// 1. 어댑터 없이: SDK 의 EVM 프로필은 Cosmos RPC·REST 를 요구하는가
let withoutAdapter = "생성됨";
try {
  sdk.createClairveilBrowserDappClient({ profile: baseProfile });
} catch (e) {
  withoutAdapter = (e as Error).message.split("\n")[0];
}
console.log(`1) 차폐 상태 어댑터 없이 프로필 생성: ${withoutAdapter}`);

// 2. 거절하는 어댑터로: 예치 준비가 무엇을 먼저 묻는가
const client = sdk.createClairveilBrowserDappClient({ profile: baseProfile, privacyStateAdapter: refusing });
const acct = privateKeyToAccount(generatePrivateKey());
const id = client.evmAccountIdentity(acct.address);
const signature = await acct.signMessage({ message: client.buildRootSigningMessage(id.address, id.pubKeyHex) });
let proverReached = false;
let stoppedAt = "";
try {
  await client.prepareDeposit({
    address: id.address, pubKeyHex: id.pubKeyHex, signatureBase64: Buffer.from(signature.slice(2), "hex").toString("base64"),
    evmWallet: { getChainId: async () => evmChainId, sendTransaction: async () => { throw new Error("보내지 않는다"); } },
    amount: `1${mintDenom}`,
    depositProofProvider: async () => { proverReached = true; throw new Error("증명 공급자까지 왔다"); },
  });
  stoppedAt = "멈추지 않음";
} catch (e) {
  stoppedAt = (e as Error).message.split("\n")[0];
}
const firstCalls = [...new Set(called)];
console.log(`2) 예치 준비가 멈춘 곳: ${stoppedAt}`);
console.log(`   부른 조회(순서대로, 중복 제거): ${firstCalls.join(", ")}. 증명 공급자 도달: ${proverReached ? "예" : "아니요"}`);
console.log(`3) SDK 차폐 상태 어댑터의 필수 조회 ${state.privacyStateAdapterRequiredMethods.length}개: ${state.privacyStateAdapterRequiredMethods.join(", ")}`);

const file = writeEvidence(path.join(ROOT, "track-a-explain/evidence/code"), "probe-sdk-deposit", {
  checkedAt: new Date().toISOString(),
  label: "SDK 실행과 테스트넷 조회(chain ID, mintDenom). tx 없음, 버리는 키로 서명, 거절된 조회는 채우지 않음",
  clairveiljs: sdkCommit, rpc: RPC, chainId, mintDenom,
  profileWithoutAdapter: withoutAdapter,
  prepareDeposit: { stoppedAt, calledInOrder: called, firstCalls, proverReached },
  requiredStateQueries: state.privacyStateAdapterRequiredMethods, optionalStateQueries: state.privacyStateAdapterOptionalMethods,
});
console.log(`기록: ${path.relative(ROOT, file)}`);
