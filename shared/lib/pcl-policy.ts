// PCL 정책 트리(PolicySet)를 사람이 읽는 문장으로 푼다.
// 바이트 해석은 Maroo 공식 SDK(@maroo-chain/viem)의 PolicySet.decode 가 하고, 여기서는 해석된 트리를 문장으로 옮긴다.
// 조합 정책(LOGICAL, FOR_EACH)은 재귀로 푼다.

import { formatEther, type Hex } from "viem";
import { PolicySet as SdkPolicySet } from "@maroo-chain/viem";

// Maroo Docs(pcl-policy-templates, pcl-composite-policies)의 템플릿 목록. 뒤의 둘은 체인에서 지웠다고 적혀 있다.
export const TEMPLATES = [
  "DENYLIST_POLICY", "VOLUME_POLICY", "PERIODIC_VOLUME_POLICY", "EAS_POLICY", "AGENT_OKRW_TRANSFER_LIMIT_POLICY",
  "LOGICAL_POLICY", "FOR_EACH_POLICY", "OKRW_EAS_TRANSFER_LIMIT_POLICY", "OKRW_EAS_PERIODIC_VOLUME_LIMIT_POLICY",
];

// 체인이 돌려주는 정책 한 칸(IPcl 의 PolicySet 튜플)
export type PolicySet = { templateId: string; policy: Hex; selector: Hex };

type Node = ReturnType<typeof SdkPolicySet.decode>;
const short = (h: string) => (h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-4)}` : h);

function render(node: Node): string {
  if (node.kind !== "decoded") return `${node.templateId}(해석 안 됨: ${node.reason})`;
  switch (node.templateId) {
    case "LOGICAL_POLICY":
      return `${node.value.quantifier}(${node.value.children.map(render).join(", ")})`;
    case "FOR_EACH_POLICY":
      return `ForEach(${node.value.quantifier}, ${node.value.subject}, ${render(node.value.child)})`;
    case "EAS_POLICY":
      return `EAS_POLICY(schema ${short(node.value.schemaUid)})`;
    case "DENYLIST_POLICY":
      return `DENYLIST_POLICY(${node.value.addresses.length}개 주소)`;
    case "PERIODIC_VOLUME_POLICY":
      return `PERIODIC_VOLUME_POLICY(${node.value.limits.map((l) => `${l.token} ≤ ${formatEther(l.maxAmount)} / ${l.resetPeriodSeconds}s`).join(", ")})`;
    case "VOLUME_POLICY":
      return `VOLUME_POLICY(${node.value.limits.map((l) => `${l.token} ${formatEther(l.minLimit)}~${formatEther(l.maxLimit)}`).join(", ")})`;
    default:
      return node.templateId;
  }
}

export function describePolicy(set: PolicySet): string {
  return render(SdkPolicySet.decode(set));
}

// 정책 트리에서 EAS_POLICY 가 요구하는 스키마 UID 를 찾는다.
export function findEasSchema(set: PolicySet): string | undefined {
  const walk = (node: Node): string | undefined => {
    if (node.kind !== "decoded") return undefined;
    if (node.templateId === "EAS_POLICY") return node.value.schemaUid;
    if (node.templateId === "LOGICAL_POLICY") return node.value.children.map(walk).find(Boolean);
    if (node.templateId === "FOR_EACH_POLICY") return walk(node.value.child);
    return undefined;
  };
  return walk(SdkPolicySet.decode(set));
}

// 정책 트리에 쓰인 템플릿 이름을 중첩(LOGICAL, FOR_EACH)까지 모은다. 거부 해석기가 사유와 맞는 정책을 찾을 때 쓴다.
export function templatesIn(set: PolicySet): Set<string> {
  const out = new Set<string>();
  const walk = (node: Node) => {
    out.add(node.templateId);
    if (node.kind !== "decoded") return;
    if (node.templateId === "LOGICAL_POLICY") node.value.children.forEach(walk);
    if (node.templateId === "FOR_EACH_POLICY") walk(node.value.child);
  };
  walk(SdkPolicySet.decode(set));
  return out;
}

// Or 조합을 거치지 않고 닿는 템플릿. Or 의 자식이 모두 거절하면 PCL 은 AnyOfRejected 로 감싸서 돌려주므로
// (Maroo 문서 pcl-reason-codes 의 조합 및 구조 절), 감싸이지 않은 거부 사유는 이 집합의 템플릿에서만 나올 수 있다.
// ForEach 는 자식이 어떻게 드러나는지 문서에서 확인하지 못해, 감싸이지 않을 수도 있다고 보고 자식까지 넣는다.
export function bareTemplates(set: PolicySet): Set<string> {
  const out = new Set<string>();
  const walk = (node: Node) => {
    if (node.kind !== "decoded") return out.add(node.templateId);
    if (node.templateId === "LOGICAL_POLICY") {
      if (node.value.quantifier === "Or") return;
      return node.value.children.forEach(walk);
    }
    if (node.templateId === "FOR_EACH_POLICY") return walk(node.value.child);
    out.add(node.templateId);
  };
  walk(SdkPolicySet.decode(set));
  return out;
}
