// revert 사유 해석(maroo.ts 의 decodeRaw, revertReason) 단위 테스트. 체인 호출 없음.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ContractFunctionRevertedError, encodeErrorResult, type Abi } from "viem";
import { iPclAbi } from "@maroo-chain/contracts/abi/precompiles/pcl/IPcl";
import { decodeRaw, revertReason } from "./maroo.ts";

const errors = iPclAbi.filter((x) => x.type === "error") as Abi;
const exceeded = encodeErrorResult({ abi: errors, errorName: "ExceededAgentTransferLimit", args: [5_000_000_000_000_000_000n, 8_000_000_000_000_000_000n] });

test("PCL 오류 데이터를 이름과 인자로 푼다", () => {
  assert.equal(decodeRaw(exceeded, errors), "ExceededAgentTransferLimit(5000000000000000000, 8000000000000000000)");
});

test("문자열 사유 오류도 푼다", () => {
  const invalid = encodeErrorResult({ abi: errors, errorName: "AgentTransferLimitMetadataInvalid", args: ["empty metadata value"] });
  assert.equal(decodeRaw(invalid, errors), "AgentTransferLimitMetadataInvalid(empty metadata value)");
});

test("ABI 에 없는 오류는 원문을 남긴다", () => {
  assert.equal(decodeRaw("0xdeadbeef", errors), "해석되지 않은 revert 0xdeadbeef");
});

test("viem 의 컨트랙트 revert 오류에서 사유를 꺼낸다", () => {
  const err = new ContractFunctionRevertedError({ abi: errors, data: exceeded, functionName: "fund" });
  assert.equal(revertReason(err, errors), "ExceededAgentTransferLimit(5000000000000000000, 8000000000000000000)");
});

test("viem 오류가 아니면 문자열로 돌려준다", () => {
  assert.equal(revertReason(new Error("fetch failed")), "Error: fetch failed");
});
