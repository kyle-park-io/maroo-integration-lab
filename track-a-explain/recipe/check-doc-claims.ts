// Track A 레시피: 문서 개선 노트의 근거를 한 번에 다시 확인한다. [Live Testnet] + Maroo Docs 원문
//
//   pnpm a:doc-claims
//
// docs.maroo.io 의 현재 페이지에서 문장을 찾고, 같은 내용을 테스트넷에서 조회하거나 eth_call 로 불러 대조한다.
// 트랜잭션은 보내지 않는다. 결과는 track-a-explain/evidence/live/doc-claims-<시각>.json 에 남긴다.

import path from "node:path";
import { encodeAbiParameters, encodeFunctionData, type Abi, type Hex } from "viem";
import { iPclAbi } from "@maroo-chain/contracts/abi/precompiles/pcl/IPcl";
import { ROOT } from "../../shared/lib/paths.ts";
import { OKRW, PCL, PRIVACY, publicClient as pub, rawEthCall, decodeRaw, writeEvidence } from "../../shared/lib/maroo.ts";

const DOCS = "https://docs.maroo.io";
// 2026-09-23 레시피 검증 때 배포된 구현. 초기화 데이터만 바꿔 deployPclProxy 를 시뮬레이션한다.
const KNOWN_LOGIC = "0x9D90966c73D2838B5605585fB1dB4C1Ec51f592c";
const SIM_SENDER = "0x000000000000000000000000000000000000bEEF";

// 페이지가 없으면(404 등) 판정하지 않고 멈춘다. 없는 페이지의 본문으로 "문서에 없다"고 판정하지 않기 위해서다.
async function pageText(p: string): Promise<string> {
  const res = await fetch(`${DOCS}${p}`, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${DOCS}${p} 응답 ${res.status}. 문서 주소가 바뀌었는지 확인하십시오.`);
  const html = await res.text();
  return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ");
}
const count = (text: string, needle: string) => text.split(needle).length - 1;
const errorsAbi = iPclAbi.filter((x) => x.type === "error") as Abi;

const checks: Record<string, unknown>[] = [];
function record(id: string, data: Record<string, unknown>) {
  checks.push({ id, ...data });
  console.log(`${id}: ${JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`);
}

// 1. 테스트넷 KYC 서비스의 이름과 Privacy 호출이 요구하는 증명
const access = await pageText("/resources/network/testnet-access/");
const cfg = await pub.readContract({ address: PCL, abi: iPclAbi, functionName: "contractPolicies", args: [PRIVACY] }) as { policies: readonly { templateId: string }[] };
record("kyc-labelled-mock", {
  docsPage: `${DOCS}/resources/network/testnet-access/`,
  docsSaysKycMock: count(access, "KYC (mock)") > 0,
  privacyTopPolicy: cfg.policies.map((p) => p.templateId),
  note: "Privacy 정책의 세부(EAS_POLICY 스키마)는 inspect-privacy-boundary 기록에 있다",
});

// 2. 인출 금액 문자열의 단위
const withdraw = await pageText("/apis/contract/contract-privacy-withdraw/");
const params = await pub.readContract({
  address: OKRW,
  abi: [{ name: "getParams", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "tuple", components: [{ name: "minter", type: "address" }, { name: "mintDenom", type: "string" }] }] }],
  functionName: "getParams",
});
record("withdraw-denom", {
  docsPage: `${DOCS}/apis/contract/contract-privacy-withdraw/`,
  docsAokrwCount: count(withdraw, "aokrw"),
  docsAtokrwCount: count(withdraw, "atokrw"),
  docsMentionsDenomMismatchError: count(withdraw, "PrivacyNativeDenomMismatch") > 0,
  chainMintDenom: params.mintDenom,
});

// 3. 프리컴파일 목록에 Privacy 가 있는지
const deployed = await pageText("/resources/contracts/deployed-contracts/");
const arch = await pageText("/concepts/core/maroo-architecture/");
record("privacy-precompile-listed", {
  deployedContractsPage: `${DOCS}/resources/contracts/deployed-contracts/`,
  listsPrivacyAddress: count(deployed.toLowerCase(), PRIVACY.toLowerCase()) > 0,
  architecturePage: `${DOCS}/concepts/core/maroo-architecture/`,
  saysFourPrecompiles: count(arch, "네 개의 프리컴파일") > 0,
  chainPrivacyPolicyBound: cfg.policies.length > 0,
});

// 4. deployPclProxy 의 빈 초기화 데이터
const deployDoc = await pageText("/apis/contract/contract-pcl-deploy-pcl-proxy/");
const sims: Record<string, string> = {};
for (const [label, init] of [["empty 0x", "0x"], ["initialize()", "0x8129fc1c"]] as const) {
  for (const kind of [1, 2] as const) {
    const initData = kind === 1
      ? encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "bytes" }], [KNOWN_LOGIC, SIM_SENDER, init])
      : encodeAbiParameters([{ type: "address" }, { type: "bytes" }], [KNOWN_LOGIC, init]);
    const data = encodeFunctionData({ abi: iPclAbi, functionName: "deployPclProxy", args: [kind, 0n, initData] });
    const r = await rawEthCall({ from: SIM_SENDER, to: PCL, data });
    sims[`${label}, kind ${kind === 1 ? "Transparent" : "UUPS"}`] = r.error
      ? (r.error.data && r.error.data !== "0x" ? decodeRaw(r.error.data as Hex, errorsAbi) : r.error.message)
      : "통과";
  }
}
record("empty-initializer", {
  docsPage: `${DOCS}/apis/contract/contract-pcl-deploy-pcl-proxy/`,
  docsSaysPass0x: count(deployDoc, '"0x"') > 0,
  ethCall: sims,
});

// 5. 사전 검사 방법이 문서에 있는지(eth_call 은 전역 정책을 평가하지 않는다)
const reasons = await pageText("/concepts/compliance/pcl-reason-codes/");
record("preflight-method", {
  docsPage: `${DOCS}/concepts/compliance/pcl-reason-codes/`,
  mentionsEstimateGas: count(reasons.toLowerCase(), "estimategas") > 0,
  mentionsEthCall: count(reasons.toLowerCase(), "eth_call") > 0,
  chainEvidence: "probe-global-policy 기록: 같은 전송이 eth_call 은 통과, eth_estimateGas 는 전역 정책으로 거부",
});

const file = writeEvidence(path.join(ROOT, "track-a-explain/evidence/live"), "doc-claims", {
  checkedAt: new Date().toISOString(), label: "문서 원문 대조와 조회, eth_call. tx 없음", checks,
});
console.log(`기록: ${path.relative(ROOT, file)}`);
