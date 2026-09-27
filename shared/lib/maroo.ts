// 마루 테스트넷 스크립트가 함께 쓰는 설정, 지갑, ABI, 거부 사유 해석.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  BaseError, ContractFunctionRevertedError, createPublicClient, createWalletClient, custom, decodeErrorResult, http, toHex,
  type Abi, type Address, type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { marooTestnet } from "viem/chains";
import { outPath } from "./paths.ts";

export const RPC = process.env.MAROO_RPC_URL ?? "https://rpc-testnet.maroo.io";
export const EXPLORER = "https://explorer-testnet.maroo.io";

// 프리컴파일 주소(마루 Docs, deployed-contracts). Privacy 는 그 표에 없어 IPrivacy.sol 상수에서 가져왔다.
export const OKRW = "0x1000000000000000000000000000000000000001" as const;
export const PCL = "0x1000000000000000000000000000000000000005" as const;
export const EAS_PARAMS = "0x1000000000000000000000000000000000000009" as const;
export const PRIVACY = "0x100000000000000000000000000000000000000b" as const;

export type Role = "BUYER" | "ISSUER" | "SUPPLIER_A" | "SUPPLIER_B" | "UPGRADE_OWNER" | "AGENT";

// 키와 주소는 레포 밖 파일에서 읽는다. 기본 경로는 ~/.config/maroo-integration-lab/testnet.env 다.
const envFile = process.env.MAROO_LAB_ENV ?? path.join(os.homedir(), ".config/maroo-integration-lab/testnet.env");
const labEnv: Record<string, string> = fs.existsSync(envFile)
  ? Object.fromEntries(
      fs.readFileSync(envFile, "utf8").split("\n")
        .filter((l) => l.includes("=") && !l.startsWith("#"))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
    )
  : {};

export function addressOf(role: Role): Address {
  const value = process.env[`${role}_ADDRESS`] ?? labEnv[`${role}_ADDRESS`];
  if (!value) throw new Error(`${role}_ADDRESS 가 없습니다. ${envFile} 를 확인하십시오.`);
  return value as Address;
}

// 역할 밖의 값(예: 인증 전용 지갑 주소)을 읽는다. 없으면 undefined.
export function labValue(key: string): string | undefined {
  return process.env[key] ?? labEnv[key];
}

export function account(role: Role) {
  const key = process.env[`${role}_PRIVATE_KEY`] ?? labEnv[`${role}_PRIVATE_KEY`];
  if (!key) throw new Error(`${role}_PRIVATE_KEY 가 없습니다. ${envFile} 를 확인하십시오.`);
  return privateKeyToAccount(key as Hex);
}

export const publicClient = createPublicClient({ chain: marooTestnet, transport: http(RPC) });
// 지갑이 보내는 tx 의 가스 한도는 노드가 추정한 값의 125% 로 둔다. 쓰지 않은 가스는 돌려받는다([Live Testnet] pnpm a:probe-send-gas).
// viem 2.56 은 가스를 eth_fillTransaction 으로 채우고, 이를 지원하지 않는 노드에서는 eth_estimateGas 를 쓴다. 두 응답 모두 늘린다.
// SDK 호출(deployPclProxy 등)도 이 지갑으로 보내므로 함께 적용된다. 가스를 직접 준 호출(거부 tx 를 남기는 경우)은 추정하지 않아 그대로다.
// 가스를 재는 스크립트는 이 지갑이 아니라 rawEthCall 로 추정하므로 측정값은 바뀌지 않는다.
export const GAS_LIMIT_PERCENT = 125n;
const pad = (gas: Hex) => toHex((BigInt(gas) * GAS_LIMIT_PERCENT) / 100n);
const paddedTransport = custom({
  async request({ method, params }) {
    const result = await publicClient.request({ method, params } as never) as unknown;
    if (method === "eth_estimateGas") return pad(result as Hex);
    const filled = result as { tx?: { gas?: Hex } } | null;
    if (method === "eth_fillTransaction" && filled?.tx?.gas) return { ...filled, tx: { ...filled.tx, gas: pad(filled.tx.gas) } };
    return result;
  },
});
export const walletFor = (role: Role) => createWalletClient({ account: account(role), chain: marooTestnet, transport: paddedTransport });

// viem 오류에서 컨트랙트가 되돌린 사유를 꺼낸다. abi 에 든 오류는 이름과 인자로 해석된다.
export function revertReason(err: unknown, abi?: Abi): string {
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      if (reverted.data) return `${reverted.data.errorName}(${(reverted.data.args ?? []).join(", ")})`;
      if (reverted.raw && abi) return decodeRaw(reverted.raw, abi);
      if (reverted.raw) return `해석되지 않은 revert ${reverted.raw}`;
    }
    return err.shortMessage;
  }
  return String(err);
}

export function decodeRaw(data: Hex, abi: Abi): string {
  try {
    const d = decodeErrorResult({ abi, data });
    return `${d.errorName}(${(d.args ?? []).join(", ")})`;
  } catch {
    return `해석되지 않은 revert ${data}`;
  }
}

// JSON-RPC eth_call 을 직접 불러 revert 데이터를 그대로 받는다. 트랜잭션은 보내지 않는다.
// eth_estimateGas 로 부르면 전역 정책(AnteHandler)까지 평가된다. eth_call 은 전역 정책을 건너뛴다.
export async function rawEthCall(req: { from: Address; to: Address; data: Hex; value?: bigint }, method: "eth_call" | "eth_estimateGas" = "eth_call") {
  const tx = { ...req, value: `0x${(req.value ?? 0n).toString(16)}` };
  const res = await fetch(RPC, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: method === "eth_call" ? [tx, "latest"] : [tx] }),
  });
  return (await res.json()) as { result?: Hex; error?: { message: string; data?: Hex } };
}

export const easParamsAbi = [{ name: "getParams", type: "function", stateMutability: "view", inputs: [],
  outputs: [{ type: "tuple", components: [{ name: "schemaRegistry", type: "address" }, { name: "eas", type: "address" }, { name: "indexer", type: "address" }] }] }] as const;

export const schemaRegistryAbi = [
  { name: "register", type: "function", stateMutability: "nonpayable", inputs: [{ type: "string" }, { type: "address" }, { type: "bool" }], outputs: [{ type: "bytes32" }] },
  { name: "getSchema", type: "function", stateMutability: "view", inputs: [{ type: "bytes32" }],
    outputs: [{ type: "tuple", components: [{ name: "uid", type: "bytes32" }, { name: "resolver", type: "address" }, { name: "revocable", type: "bool" }, { name: "schema", type: "string" }] }] },
] as const;

export const easAbi = [
  { name: "attest", type: "function", stateMutability: "payable",
    inputs: [{ type: "tuple", components: [{ name: "schema", type: "bytes32" }, { name: "data", type: "tuple", components: [
      { name: "recipient", type: "address" }, { name: "expirationTime", type: "uint64" }, { name: "revocable", type: "bool" },
      { name: "refUID", type: "bytes32" }, { name: "data", type: "bytes" }, { name: "value", type: "uint256" }] }] }],
    outputs: [{ type: "bytes32" }] },
  { name: "revoke", type: "function", stateMutability: "payable",
    inputs: [{ type: "tuple", components: [{ name: "schema", type: "bytes32" }, { name: "data", type: "tuple", components: [{ name: "uid", type: "bytes32" }, { name: "value", type: "uint256" }] }] }],
    outputs: [] },
  { name: "getAttestation", type: "function", stateMutability: "view", inputs: [{ type: "bytes32" }],
    outputs: [{ type: "tuple", components: [
      { name: "uid", type: "bytes32" }, { name: "schema", type: "bytes32" }, { name: "time", type: "uint64" }, { name: "expirationTime", type: "uint64" },
      { name: "revocationTime", type: "uint64" }, { name: "refUID", type: "bytes32" }, { name: "recipient", type: "address" }, { name: "attester", type: "address" },
      { name: "revocable", type: "bool" }, { name: "data", type: "bytes" }] }] },
  { name: "Attested", type: "event", inputs: [{ name: "recipient", type: "address", indexed: true }, { name: "attester", type: "address", indexed: true },
    { name: "uid", type: "bytes32", indexed: false }, { name: "schemaUID", type: "bytes32", indexed: true }] },
] as const;

export const indexerAbi = [
  { name: "indexAttestation", type: "function", stateMutability: "nonpayable", inputs: [{ type: "bytes32" }], outputs: [] },
  { name: "getReceivedAttestationUIDs", type: "function", stateMutability: "view",
    inputs: [{ type: "address" }, { type: "bytes32" }, { type: "uint256" }, { type: "uint256" }, { type: "bool" }], outputs: [{ type: "bytes32[]" }] },
  { name: "getReceivedAttestationUIDCount", type: "function", stateMutability: "view", inputs: [{ type: "address" }, { type: "bytes32" }], outputs: [{ type: "uint256" }] },
] as const;

// 실행 시각을 파일 이름에 쓰는 형태로 만든다. 예: 20260926T031500Z
export const stampNow = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

export function writeEvidence(dir: string, name: string, data: unknown): string {
  dir = outPath(dir);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}-${stampNow()}.json`);
  fs.writeFileSync(file, JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n");
  return file;
}
