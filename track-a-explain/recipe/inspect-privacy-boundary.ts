// Track A 레시피: 마루 테스트넷에서 Privacy 프리컴파일의 경계를 읽기 전용으로 확인한다. [Live Testnet]
//
//   pnpm a:inspect            (Node.js 24 이상, TypeScript 를 바로 실행)
//
// 트랜잭션은 보내지 않는다. 조회와 eth_call 만 쓴다. 확인하는 것:
//   1. 체인 ID 와 최신 블록
//   2. PCL 이 Privacy 프리컴파일(0x…0b)에 묶어 둔 정책과 그 안의 EAS 스키마
//   3. 구매 기업 지갑이 그 스키마의 증명을 받았는지 (EAS Indexer)
//   4. 구매 기업 지갑으로 deposit 을 eth_call 했을 때 처음 막히는 층
//   5. IPrivacy 전송 요청의 필드와 Clairveil v0.4.0 MsgTransfer 필드의 대조
//
// 지갑 주소는 MAROO_LAB_ENV(기본 ~/.config/maroo-integration-lab/testnet.env)의 BUYER_ADDRESS 를 쓴다.
// 개인키는 읽지 않는다. 결과는 track-a-explain/evidence/live/inspect-privacy-boundary-<시각>.json 에 남긴다.

import fs from "node:fs";
import path from "node:path";
import { decodeAbiParameters, encodeFunctionData, getAddress, type Abi, type Hex } from "viem";
import { iPrivacyAbi } from "@maroo-chain/contracts/abi/precompiles/privacy/IPrivacy";
import { iPclAbi } from "@maroo-chain/contracts/abi/precompiles/pcl/IPcl";
import { ROOT } from "../../shared/lib/paths.ts";
import {
  EAS_PARAMS, PCL, PRIVACY, RPC, addressOf, decodeRaw, easParamsAbi, indexerAbi, publicClient as pub, rawEthCall,
  schemaRegistryAbi, writeEvidence,
} from "../../shared/lib/maroo.ts";

const buyer = getAddress(addressOf("BUYER"));
const report: Record<string, unknown> = { rpc: RPC, buyer, checkedAt: new Date().toISOString() };

const policySetType = { type: "tuple[]", components: [{ name: "templateId", type: "string" }, { name: "policy", type: "bytes" }, { name: "selector", type: "bytes" }] } as const;

// 1. 체인
const chainId = await pub.getChainId();
const block = await pub.getBlockNumber();
report.chain = { chainId, block: block.toString() };
console.log(`1) chainId ${chainId}, block ${block}`);

// 2. Privacy 프리컴파일에 묶인 정책
const cfg = await pub.readContract({ address: PCL, abi: iPclAbi, functionName: "contractPolicies", args: [PRIVACY] }) as
  { _contract: string; admin: string; policies: readonly { templateId: string; policy: Hex; selector: Hex }[] };
const flat: { templateId: string; policy: Hex; selector: Hex }[] = [];
// Maroo Docs 의 enum LogicalQuantifier { Unspecified, And, Or }
const QUANTIFIER = ["Unspecified", "And", "Or"];
const logicals: string[] = [];
const walk = (sets: readonly { templateId: string; policy: Hex; selector: Hex }[]) => {
  for (const s of sets) {
    flat.push(s);
    if (s.templateId === "LOGICAL_POLICY") {
      const [logical] = decodeAbiParameters([{ type: "tuple", components: [{ name: "quantifier", type: "uint8" }, { name: "children", ...policySetType }] }], s.policy);
      logicals.push(`${QUANTIFIER[logical.quantifier] ?? logical.quantifier}(${logical.children.map((c) => c.templateId).join(", ")})`);
      walk(logical.children as never);
    }
  }
};
walk(cfg.policies);
const easPolicy = flat.find((p) => p.templateId === "EAS_POLICY");
const eas = easPolicy
  ? decodeAbiParameters([{ type: "address", name: "easContract" }, { type: "address", name: "indexContract" }, { type: "bytes32", name: "schemaUid" }], easPolicy.policy)
  : undefined;
report.policy = { admin: cfg.admin, templates: flat.map((p) => p.templateId), logical: logicals, eas: eas && { easContract: eas[0], indexContract: eas[1], schemaUid: eas[2] } };
console.log(`2) Privacy 정책: ${logicals.join(" > ") || flat.map((p) => p.templateId).join(" > ")}, admin ${cfg.admin}`);

// 스키마 문자열
if (eas) {
  const { schemaRegistry } = await pub.readContract({ address: EAS_PARAMS, abi: easParamsAbi, functionName: "getParams" });
  const schema = await pub.readContract({ address: schemaRegistry, abi: schemaRegistryAbi, functionName: "getSchema", args: [eas[2]] });
  report.schema = { uid: eas[2], schema: schema.schema, resolver: schema.resolver, revocable: schema.revocable };
  console.log(`   요구 스키마 ${eas[2]}: "${schema.schema}", resolver ${schema.resolver}`);

  // 3. 구매 기업 지갑의 증명
  const count = await pub.readContract({ address: eas[1], abi: indexerAbi, functionName: "getReceivedAttestationUIDCount", args: [buyer, eas[2]] });
  report.buyerAttestations = count.toString();
  console.log(`3) ${buyer} 가 받은 증명 수: ${count}`);
}

// 4. deposit 을 eth_call 로 불러 처음 막히는 층을 본다. 빈 요청이라 PCL 을 넘으면 요청 검증에서 막혀야 한다.
const errorsAbi = [...iPrivacyAbi, ...iPclAbi].filter((x) => x.type === "error") as Abi;
const data = encodeFunctionData({ abi: iPrivacyAbi, functionName: "deposit", args: [{ noteCommitment: "0x", encryptedNote: "0x", proof: "0x" }] });
const body = await rawEthCall({ from: buyer, to: PRIVACY, data });
const firstFailure = body.error
  ? { rpcMessage: body.error.message, revertData: body.error.data ?? null, outcome: body.error.data && body.error.data !== "0x" ? decodeRaw(body.error.data, errorsAbi) : body.error.message }
  : { outcome: "거부되지 않음", result: body.result };
report.depositEthCall = firstFailure;
console.log(`4) deposit eth_call (from ${buyer}): ${firstFailure.outcome}`);

// 5. 필드 대조: IPrivacy.PrivacyTransferRequest 와 Clairveil v0.4.0 MsgTransfer. Clairveil 을 받기 전이면 건너뛴다.
const transferFn = iPrivacyAbi.find((x) => x.type === "function" && x.name === "transfer") as { readonly inputs: readonly { readonly components: readonly { readonly name: string }[] }[] };
const maroo = transferFn.inputs[0].components.map((c) => c.name);
const protoPath = path.join(ROOT, "vendor/clairveil/proto/clairveil/privacy/v1/tx.proto");
if (fs.existsSync(protoPath)) {
  const proto = fs.readFileSync(protoPath, "utf8");
  const msg = proto.slice(proto.indexOf("message MsgTransfer {"), proto.indexOf("}", proto.indexOf("message MsgTransfer {")));
  const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  const clairveil = [...msg.matchAll(/^\s*(?:repeated\s+)?\w+\s+(\w+)\s*=\s*\d+/gm)].map((m) => camel(m[1]));
  const onlyInMaroo = maroo.filter((f) => !clairveil.includes(f));
  const onlyInClairveil = clairveil.filter((f) => !maroo.includes(f));
  report.transferFields = { maroo, clairveilV040: clairveil, onlyInMaroo, onlyInClairveil };
  console.log(`5) 전송 요청 필드: 마루 ${maroo.length}개, Clairveil v0.4.0 ${clairveil.length}개, 마루에만 [${onlyInMaroo}], Clairveil 에만 [${onlyInClairveil}]`);
} else {
  report.transferFields = { maroo, clairveilV040: "vendor/clairveil 없음" };
  console.log(`5) 전송 요청 필드: 마루 ${maroo.length}개. Clairveil 과의 대조는 pnpm setup:clairveil 뒤에 다시 실행하면 나옵니다`);
}

const file = writeEvidence(path.join(ROOT, "track-a-explain/evidence/live"), "inspect-privacy-boundary", report);
console.log(`기록: ${path.relative(ROOT, file)}`);
