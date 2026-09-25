// PCL 정책 트리(PolicySet)를 사람이 읽는 문장으로 푼다. 조합 정책(LOGICAL, FOR_EACH)은 재귀로 푼다.

import { decodeAbiParameters, formatEther, type AbiParameter, type Hex } from "viem";
import { iPclAbi } from "@maroo-chain/contracts/abi/precompiles/pcl/IPcl";

// Maroo Docs(pcl-policy-templates, pcl-composite-policies)의 템플릿 목록. 뒤의 둘은 체인에서 지웠다고 적혀 있다.
export const TEMPLATES = [
  "DENYLIST_POLICY", "VOLUME_POLICY", "PERIODIC_VOLUME_POLICY", "EAS_POLICY", "AGENT_OKRW_TRANSFER_LIMIT_POLICY",
  "LOGICAL_POLICY", "FOR_EACH_POLICY", "OKRW_EAS_TRANSFER_LIMIT_POLICY", "OKRW_EAS_PERIODIC_VOLUME_LIMIT_POLICY",
];
const LOGICAL = ["Unspecified", "And", "Or"];
const FOR_EACH = ["Unspecified", "Any", "Every"];
const SUBJECT = ["Unspecified", "AgentOwners"];

// IPcl 의 _policies 함수 입력이 템플릿별 파라미터 struct 다. 이름으로 찾아 policy bytes 를 푼다.
const policyStructs = Object.fromEntries(
  ((iPclAbi.find((x) => x.type === "function" && x.name === "_policies") as { inputs: readonly AbiParameter[] }).inputs)
    .map((p) => [(p as { internalType?: string }).internalType?.replace("struct ", ""), p]),
) as Record<string, AbiParameter>;
const STRUCT_OF: Record<string, string> = {
  EAS_POLICY: "EasPolicy", DENYLIST_POLICY: "DenylistPolicy", VOLUME_POLICY: "VolumePolicy",
  PERIODIC_VOLUME_POLICY: "PeriodicVolumePolicy", AGENT_OKRW_TRANSFER_LIMIT_POLICY: "AgentOkrwTransferLimitPolicy",
  LOGICAL_POLICY: "LogicalPolicy", FOR_EACH_POLICY: "ForEachPolicy",
};
export type PolicySet = { templateId: string; policy: Hex; selector: Hex };
const short = (h: string) => (h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-4)}` : h);

export function describePolicy(set: PolicySet): string {
  const struct = policyStructs[STRUCT_OF[set.templateId] ?? ""];
  if (!struct) return `${set.templateId}(해석 안 됨)`;
  const [p] = decodeAbiParameters([struct], set.policy) as [Record<string, unknown>];
  switch (set.templateId) {
    case "LOGICAL_POLICY":
      return `${LOGICAL[Number(p.quantifier)]}(${(p.children as PolicySet[]).map(describePolicy).join(", ")})`;
    case "FOR_EACH_POLICY":
      return `ForEach(${FOR_EACH[Number(p.quantifier)]}, ${SUBJECT[Number(p.subject)]}, ${describePolicy(p.child as PolicySet)})`;
    case "EAS_POLICY":
      return `EAS_POLICY(schema ${short(p.schemaUid as string)})`;
    case "DENYLIST_POLICY":
      return `DENYLIST_POLICY(${(p.addresses as string[]).length}개 주소)`;
    case "PERIODIC_VOLUME_POLICY": {
      const limits = p.limits as { maxAmount: bigint; resetPeriodSeconds: bigint }[];
      return `PERIODIC_VOLUME_POLICY(${(p.tokens as string[]).map((t, i) => `${t} ≤ ${formatEther(limits[i].maxAmount)} / ${limits[i].resetPeriodSeconds}s`).join(", ")})`;
    }
    case "VOLUME_POLICY": {
      const limits = p.limits as { minLimit: bigint; maxLimit: bigint }[];
      return `VOLUME_POLICY(${(p.tokens as string[]).map((t, i) => `${t} ${formatEther(limits[i].minLimit)}~${formatEther(limits[i].maxLimit)}`).join(", ")})`;
    }
    default:
      return set.templateId;
  }
}

// 정책 트리에서 EAS_POLICY 가 요구하는 스키마 UID 를 찾는다.
export function findEasSchema(set: PolicySet): string | undefined {
  if (set.templateId === "EAS_POLICY") return (decodeAbiParameters([policyStructs.EasPolicy], set.policy)[0] as { schemaUid: string }).schemaUid;
  if (set.templateId === "LOGICAL_POLICY") {
    const [p] = decodeAbiParameters([policyStructs.LogicalPolicy], set.policy) as [{ children: PolicySet[] }];
    for (const c of p.children) { const s = findEasSchema(c); if (s) return s; }
  }
  if (set.templateId === "FOR_EACH_POLICY") {
    const [p] = decodeAbiParameters([policyStructs.ForEachPolicy], set.policy) as [{ child: PolicySet }];
    return findEasSchema(p.child);
  }
  return undefined;
}
