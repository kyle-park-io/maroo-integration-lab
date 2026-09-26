// 금고 흐름이 Maroo 공식 SDK(@maroo-chain/viem)로 만드는 calldata 가
// @maroo-chain/contracts ABI 로 직접 인코딩한 것과 같은지 확인한다. 체인 호출 없음.
//
//   pnpm test:unit

import { test } from "node:test";
import assert from "node:assert/strict";
import { createWalletClient, encodeAbiParameters, encodeFunctionData, http, toFunctionSelector, type Address, type Hex } from "viem";
import { iPclAbi } from "@maroo-chain/contracts/abi/precompiles/pcl/IPcl";
import { deployPclProxy, pclProxyKinds, pclWriteActions, policy } from "@maroo-chain/viem";
import { PCL } from "./maroo.ts";

const logic = "0x1111111111111111111111111111111111111111" as Address;
const upgradeOwner = "0x2222222222222222222222222222222222222222" as Address;
const buyer = "0x3333333333333333333333333333333333333333" as Address;
const vault = "0x4444444444444444444444444444444444444444" as Address;
const eas = "0x1000000000000000000000000000000000000007" as Address;
const indexer = "0x1000000000000000000000000000000000000008" as Address;
const schemaUid = `0x${"ab".repeat(32)}` as Hex;
const initializer = encodeFunctionData({
  abi: [{ name: "initialize", type: "function", stateMutability: "nonpayable", inputs: [{ name: "buyer", type: "address" }], outputs: [] }],
  functionName: "initialize", args: [buyer],
});

test("deployPclProxy(Transparent)는 abi.encode(logic, initialOwner, initializer)를 kind 1 로 보낸다", () => {
  const initData = encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "bytes" }], [logic, upgradeOwner, initializer]);
  const manual = encodeFunctionData({ abi: iPclAbi, functionName: "deployPclProxy", args: [1, 0n, initData] });
  const sdk = deployPclProxy.call({ kind: pclProxyKinds.Transparent, logic, initialOwner: upgradeOwner, initializer });
  assert.equal(sdk.to, PCL);
  assert.equal(sdk.data, manual);
});

test("policy.eas 를 claim() 에 거는 changeContractPolicies 는 직접 인코딩과 같다", () => {
  const selector = toFunctionSelector("claim()");
  const easPolicy = encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "bytes32" }], [eas, indexer, schemaUid]);
  const manual = encodeFunctionData({
    abi: iPclAbi, functionName: "changeContractPolicies",
    args: [{ _contract: vault, admin: buyer, policies: [{ templateId: "EAS_POLICY", policy: easPolicy, selector }] }],
  });
  // .call 은 보내지 않고 calldata 만 만든다. 전송 계층은 쓰이지 않는다.
  const pcl = pclWriteActions()(createWalletClient({ transport: http("http://127.0.0.1:9") }));
  const sdk = pcl.changeContractPolicies.call({
    contract: vault, admin: buyer, policies: [policy.eas({ easContract: eas, indexContract: indexer, schemaUid, selector })],
  });
  assert.equal(sdk.to, PCL);
  assert.equal(sdk.data, manual);
});
