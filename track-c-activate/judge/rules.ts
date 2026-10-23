// Track C 심사 판정 규칙. 항목별 확인 결과(Verdict)를 받아 트랙마다 요건 충족 여부를 정한다.
// 체인을 부르지 않는 순수 함수라 단위 테스트가 덮는다. 항목별 확인은 check-evidence.ts 가 한다.

import type { Hex } from "viem";

export type Item = {
  requirement: string; label: string; chainId?: number; target?: string; call?: string; input?: string;
  txHash?: Hex; expected?: string; actual?: string; rpcLog?: { method: string; params: unknown[]; error?: { message: string; data?: Hex } };
};
export type Verdict = { requirement: string; label: string; ok: boolean | "재현 확인"; checks: string[] };

export type Checked = Verdict & { item: Item; value: bigint; reason?: string; policies: string };

// 트랙마다 요건을 채운 것으로 보는 조건. 항목 하나가 여러 요건을 증명할 수 있다.
export const RULES: Record<number, { id: string; need: string; test: (vs: Checked[]) => boolean }[]> = {
  1: [
    { id: "R1", need: "차폐 흐름(예치, 지급, 스캔, 인출)", test: (vs) => vs.some((v) => v.requirement === "R1" && v.ok !== false) },
    { id: "R2", need: "보낸 쪽이 아닌 쪽의 disclosure 해독", test: (vs) => vs.some((v) => v.requirement === "R2" && v.ok !== false) },
    { id: "R3", need: "같은 대상에서 PCL 거부 하나와 통과 하나, 정책 바인딩", test: (vs) => {
      const r3 = vs.filter((v) => v.requirement === "R3" && v.ok === true);
      return r3.some((v) => /거부/.test(v.item.expected ?? "")) && r3.some((v) => /통과|성공/.test(v.item.expected ?? ""));
    } },
    { id: "R4", need: "OKRW 이동", test: (vs) => vs.some((v) => v.requirement === "R4" && v.ok === true && v.value > 0n) },
    { id: "R5", need: "Privacy 최초 실패 계층 기록", test: (vs) => vs.some((v) => v.requirement === "R5" && v.ok !== false) },
  ],
  2: [
    { id: "R1", need: "에이전트 등록", test: (vs) => vs.some((v) => v.requirement === "R1" && v.ok === true) },
    { id: "R2", need: "한도 메타데이터와 에이전트 한도 정책", test: (vs) => vs.some((v) => v.requirement === "R2" && v.ok === true) },
    { id: "R3", need: "한도 안의 OKRW 결제", test: (vs) => vs.some((v) => v.requirement === "R3" && v.ok === true && v.value > 0n) },
    { id: "R4", need: "ExceededAgentTransferLimit 거부", test: (vs) => vs.some((v) => v.requirement === "R4" && v.ok === true && /ExceededAgentTransferLimit/.test(v.reason ?? v.item.actual ?? "")) },
  ],
  3: [
    { id: "R1", need: "스키마 등록, 증명 발급, 색인", test: (vs) => vs.filter((v) => v.requirement === "R1" && v.ok === true).length >= 1 },
    { id: "R2", need: "결제 컨트랙트의 정책 바인딩", test: (vs) => vs.some((v) => v.policies !== "" && v.policies !== "정책 없음") },
    { id: "R3", need: "자격 있는 사용자의 OKRW 결제", test: (vs) => vs.some((v) => v.requirement === "R3" && v.ok === true && v.value > 0n) },
    { id: "R4", need: "서로 다른 거부 사유 둘 이상", test: (vs) => new Set(vs.filter((v) => v.requirement === "R4" && v.ok === true).map((v) => (v.reason ?? v.item.actual ?? "").replace(/\(.*$/, ""))).size >= 2 },
  ],
};


export function judge(track: number, verdicts: Checked[]) {
  return (RULES[track] ?? []).map((r) => ({ id: r.id, need: r.need, ok: r.test(verdicts) }));
}

// PCL 정책 거부를 제출물이 건 정책의 증거로 인정하는지. 대상이 PCL 프록시가 아니면(Privacy 프리컴파일처럼 운영자가 묶은 정책)
// 제출물의 정책이 아니고, 전역 정책에서 난 거부도 아니다. 가릴 수 없으면(either) 인정하되 그 근거를 적는다.
export function policyScopeCheck(x: { family: string; isProxy: boolean; scope: "global" | "contract" | "either" | "unknown"; note: string }): { ok: boolean; msg: string } {
  if (!x.isProxy) return { ok: false, msg: `대상이 PCL 프록시가 아니라, 이 거부는 제출물이 건 정책의 증거가 아닙니다. ${x.note}` };
  if (x.scope === "global") return { ok: false, msg: `정책 거부가 전역 정책에서 났습니다. ${x.note}` };
  if (x.scope === "unknown") return { ok: false, msg: `걸린 정책을 가리지 못했습니다. ${x.note}` };
  return { ok: true, msg: `걸린 정책 ${x.scope === "contract" ? "컨트랙트 정책" : "전역 또는 컨트랙트 정책"}. ${x.note}` };
}
