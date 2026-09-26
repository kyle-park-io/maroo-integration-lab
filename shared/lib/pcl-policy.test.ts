// PCL 정책 해석(pcl-policy.ts) 단위 테스트. 체인 호출 없음.
// 테스트넷 정책 원문을 SDK(PolicySet.decode) 위의 해석기로 풀어, SDK 도입 전 직접 짠 해석기의 기록과 같은지 본다.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseEther, toFunctionSelector, type Hex } from "viem";
import { policy } from "@maroo-chain/viem";
import { describePolicy, findEasSchema, type PolicySet } from "./pcl-policy.ts";
import { ROOT } from "./paths.ts";

const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "shared/lib/fixtures/testnet-policies.json"), "utf8")) as {
  privacy: { policies: PolicySet[]; expected: string }; global: { policies: PolicySet[]; expected: string };
};
const KYC_SCHEMA = "0x3e448d939524a8f3e6a403502e57ce60ee10146292114a58f4bfd1b1d35f527d";
const EAS = "0x1000000000000000000000000000000000000007", INDEXER = "0x1000000000000000000000000000000000000008";

test("테스트넷 Privacy 정책: 이전 해석기의 기록과 같다", () => {
  assert.equal(fixture.privacy.policies.map(describePolicy).join(", "), fixture.privacy.expected);
  assert.equal(findEasSchema(fixture.privacy.policies[0]), KYC_SCHEMA);
});

test("테스트넷 전역 정책: 중첩된 ForEach, Or, 기간 한도까지 이전 해석기의 기록과 같다", () => {
  assert.equal(fixture.global.policies.map(describePolicy).join(", "), fixture.global.expected);
  assert.equal(findEasSchema(fixture.global.policies[0]), KYC_SCHEMA);
});

test("SDK 빌더로 만든 정책을 문장으로 푼다", () => {
  const set = policy.and(
    policy.eas({ easContract: EAS, indexContract: INDEXER, schemaUid: KYC_SCHEMA }),
    policy.denylist({ addresses: ["0x1111111111111111111111111111111111111111", "0x2222222222222222222222222222222222222222"] }),
    policy.volume({ limits: [{ token: "atokrw", minLimit: 0n, maxLimit: parseEther("2000000") }] }),
  );
  assert.equal(describePolicy(set), "And(EAS_POLICY(schema 0x3e448d…527d), DENYLIST_POLICY(2개 주소), VOLUME_POLICY(atokrw 0~2000000))");
  assert.equal(findEasSchema(set), KYC_SCHEMA);
});

test("에이전트 한도 정책은 설정 값이 없어 템플릿 이름만 보인다", () => {
  const set = policy.agentOkrwTransferLimit({ selector: toFunctionSelector("fund(address)") });
  assert.equal(describePolicy(set), "AGENT_OKRW_TRANSFER_LIMIT_POLICY");
  assert.equal(set.selector, "0x23024408");
  assert.equal(findEasSchema(set), undefined);
});

test("모르는 템플릿과 깨진 값은 예외 없이 해석 안 됨으로 표시한다", () => {
  assert.equal(describePolicy({ templateId: "FOO_POLICY", policy: "0x", selector: "0x" }), "FOO_POLICY(해석 안 됨: unknown-template)");
  assert.equal(describePolicy({ templateId: "EAS_POLICY", policy: "0x1234" as Hex, selector: "0x" }), "EAS_POLICY(해석 안 됨: malformed-payload)");
});
