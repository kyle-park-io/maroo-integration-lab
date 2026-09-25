// Track A 레시피: 카카오 본인 인증 증명이 있는 지갑에서도 Privacy 예치가 같은 층에서 막히는지 확인한다. [Live Testnet]
//
//   pnpm a:probe-kyc
//
// 인증 전용 지갑(KYC_HOLDER_ADDRESS, 레포 밖 파일)의 증명을 읽고, 증명이 없는 구매 기업 지갑과 같은 예치 요청을
// eth_call 과 eth_estimateGas 로 불러 비교한다. 트랜잭션은 보내지 않는다. 거부 경로 증거로만 쓴다.
// 인증 전용 지갑의 주소, 증명 UID, 증명 데이터(카카오 ID 해시), 발급 시각(초 단위)은 기록하지 않는다.
// UID 나 발급 시각으로 증명 이벤트를 찾으면 받는 주소가 드러나서다. 발급일은 날짜만 남긴다.

import { randomBytes } from "node:crypto";
import path from "node:path";
import { encodeFunctionData, getAddress, toHex, type Abi, type Address } from "viem";
import { iPrivacyAbi } from "@maroo-chain/contracts/abi/precompiles/privacy/IPrivacy";
import { iPclAbi } from "@maroo-chain/contracts/abi/precompiles/pcl/IPcl";
import { ROOT } from "../../shared/lib/paths.ts";
import {
  EAS_PARAMS, PCL, PRIVACY, RPC, addressOf, decodeRaw, easAbi, easParamsAbi, indexerAbi, labValue, publicClient as pub, rawEthCall, writeEvidence,
} from "../../shared/lib/maroo.ts";
import { findEasSchema, type PolicySet } from "../../shared/lib/pcl-policy.ts";

const holderRaw = labValue("KYC_HOLDER_ADDRESS");
if (!holderRaw) {
  console.log("KYC_HOLDER_ADDRESS 가 없습니다. 카카오 본인 인증을 마친 지갑 주소를 레포 밖 지갑 파일에 넣으십시오.");
  process.exit(1);
}
const holder = getAddress(holderRaw);
const buyer = getAddress(addressOf("BUYER"));
const errorsAbi = [...iPrivacyAbi, ...iPclAbi].filter((x) => x.type === "error") as Abi;

// 1. Privacy 정책이 요구하는 스키마와, 인증 전용 지갑이 받은 증명
const cfg = await pub.readContract({ address: PCL, abi: iPclAbi, functionName: "contractPolicies", args: [PRIVACY] }) as { policies: readonly PolicySet[] };
const schema = cfg.policies.map(findEasSchema).find(Boolean) as `0x${string}`;
const { eas, indexer } = await pub.readContract({ address: EAS_PARAMS, abi: easParamsAbi, functionName: "getParams" });
const count = await pub.readContract({ address: indexer, abi: indexerAbi, functionName: "getReceivedAttestationUIDCount", args: [holder, schema] });
const uids = count ? await pub.readContract({ address: indexer, abi: indexerAbi, functionName: "getReceivedAttestationUIDs", args: [holder, schema, 0n, count, false] }) : [];
const attestations = [];
for (const uid of uids) {
  const a = await pub.readContract({ address: eas, abi: easAbi, functionName: "getAttestation", args: [uid] });
  attestations.push({
    schema: a.schema, attester: a.attester, issuedOn: new Date(Number(a.time) * 1000).toISOString().slice(0, 10),
    expirationTime: a.expirationTime.toString(), revoked: a.revocationTime > 0n, revocable: a.revocable,
  });
}
console.log(`1) 인증 전용 지갑(주소 비공개)이 Privacy 정책 스키마로 받은 증명: ${count}개`);
for (const a of attestations) console.log(`   발급자 ${a.attester}, 발급일 ${a.issuedOn}, 만료 ${a.expirationTime === "0" ? "없음" : a.expirationTime}, 폐기 ${a.revoked ? "됨" : "안 됨"}`);

// 2. 같은 예치 요청을 두 지갑에서 부른다
const rnd = (n: number) => toHex(randomBytes(n));
const cases = [
  { name: "empty", request: { noteCommitment: "0x", encryptedNote: "0x", proof: "0x" } as const },
  { name: "shaped", request: { noteCommitment: rnd(32), encryptedNote: rnd(96), proof: rnd(256) } },
];
const results = [];
for (const [who, from] of [["증명 없는 구매 기업 지갑", buyer], ["증명 있는 인증 전용 지갑", holder]] as [string, Address][]) {
  for (const c of cases) {
    const data = encodeFunctionData({ abi: iPrivacyAbi, functionName: "deposit", args: [c.request] });
    const row: Record<string, string> = { wallet: who, case: c.name };
    for (const method of ["eth_call", "eth_estimateGas"] as const) {
      const r = await rawEthCall({ from, to: PRIVACY, data }, method);
      row[method] = !r.error ? "거부되지 않음" : r.error.data && r.error.data !== "0x" ? decodeRaw(r.error.data, errorsAbi) : r.error.message;
    }
    results.push(row);
    console.log(`2) ${who.padEnd(14)} ${c.name.padEnd(7)} eth_call ${row.eth_call}, eth_estimateGas ${row.eth_estimateGas}`);
  }
}

const report = {
  rpc: RPC, checkedAt: new Date().toISOString(), label: "거부 경로 증거(eth_call, eth_estimateGas. tx 없음). 인증 전용 지갑 주소, 증명 UID, 발급 시각은 기록하지 않음",
  privacySchema: schema, holderAttestationCount: count.toString(), holderAttestations: attestations, buyer, results,
};
// 기록에 인증 전용 지갑 주소가 섞이지 않았는지 쓰기 전에 확인한다.
if (JSON.stringify(report).toLowerCase().includes(holder.toLowerCase().slice(2))) throw new Error("기록에 인증 전용 지갑 주소가 들어 있어 쓰지 않았습니다.");
const file = writeEvidence(path.join(ROOT, "track-a-explain/evidence/live"), "probe-kyc-holder", report);
console.log(`기록: ${path.relative(ROOT, file)}`);
