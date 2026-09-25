// Track A 레시피: Privacy deposit 요청이 마루 테스트넷에서 어느 층에서 처음 막히는지 eth_call 로만 확인한다. [Live Testnet]
//
//   pnpm a:probe [주소]
//
// 트랜잭션은 보내지 않는다. 증명이 유효하지 않은 요청을 시뮬레이션하므로, 결과는 거부 경로의 증거로만 쓴다.
// 성공한 Privacy 연동의 증거가 아니다.
//
// 같은 요청을 eth_call 과 eth_estimateGas 로 부른다. eth_estimateGas 는 전역 정책까지 평가하므로,
// 두 결과가 같은 요청 검증 오류면 이 주소는 전역 정책을 통과하고 요청 검증에서 막힌 것이다.
//
// 요청 모양을 셋으로 나눠 부른다.
//   empty    모든 필드가 빈 바이트
//   shaped   커밋먼트 32바이트, 암호화 노트 96바이트, 증명 256바이트를 무작위 값으로 채운 요청
//   shaped+  shaped 와 같고 value 에 1 wei 를 싣는다(잔액이 없으면 EVM 단계에서 막힌다)
// 주소를 주지 않으면 BUYER 주소를 쓴다.

import { randomBytes } from "node:crypto";
import path from "node:path";
import { encodeFunctionData, getAddress, toHex, type Abi } from "viem";
import { iPrivacyAbi } from "@maroo-chain/contracts/abi/precompiles/privacy/IPrivacy";
import { iPclAbi } from "@maroo-chain/contracts/abi/precompiles/pcl/IPcl";
import { ROOT } from "../../shared/lib/paths.ts";
import { PRIVACY, RPC, addressOf, decodeRaw, rawEthCall, writeEvidence } from "../../shared/lib/maroo.ts";

const from = getAddress(process.argv[2] ?? addressOf("BUYER"));
const errorsAbi = [...iPrivacyAbi, ...iPclAbi].filter((x) => x.type === "error") as Abi;
const rnd = (n: number) => toHex(randomBytes(n));

const cases = [
  { name: "empty", request: { noteCommitment: "0x", encryptedNote: "0x", proof: "0x" } as const, value: 0n },
  { name: "shaped", request: { noteCommitment: rnd(32), encryptedNote: rnd(96), proof: rnd(256) }, value: 0n },
  { name: "shaped+", request: { noteCommitment: rnd(32), encryptedNote: rnd(96), proof: rnd(256) }, value: 1n },
];

const results = [];
for (const c of cases) {
  const data = encodeFunctionData({ abi: iPrivacyAbi, functionName: "deposit", args: [c.request] });
  const row: Record<string, unknown> = { case: c.name, value: c.value.toString() };
  for (const method of ["eth_call", "eth_estimateGas"] as const) {
    const body = await rawEthCall({ from, to: PRIVACY, data, value: c.value }, method);
    const outcome = !body.error
      ? "거부되지 않음"
      : body.error.data && body.error.data !== "0x" ? decodeRaw(body.error.data, errorsAbi) : body.error.message;
    row[method] = { outcome, rpcMessage: body.error?.message ?? null, revertData: body.error?.data ?? null };
    console.log(`${c.name.padEnd(8)} value=${c.value}  ${method.padEnd(16)} ${outcome}`);
  }
  results.push(row);
}

const file = writeEvidence(path.join(ROOT, "track-a-explain/evidence/live"), "probe-first-failure", {
  rpc: RPC, from, checkedAt: new Date().toISOString(), label: "거부 경로 증거(eth_call, eth_estimateGas. tx 없음)", results,
});
console.log(`기록: ${path.relative(ROOT, file)}`);
