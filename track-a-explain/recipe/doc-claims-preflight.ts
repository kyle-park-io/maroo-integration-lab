// a:doc-claims 5번 판정. 마루 문서의 세 페이지가 보내기 전 사전 검사를 어떻게 적는지 문장으로 확인한다.
// 2026-10-23 정정: 제출 때는 ReasonCode 페이지만 읽고 사전 검사 방법이 문서에 없다고 판정했다.
// 시뮬레이션 가이드는 2026-09-24 판부터 PCL 프록시 호출의 사전 검사를 적고 있었다.

const has = (text: string, ...needles: string[]) => needles.every((n) => text.toLowerCase().includes(n.toLowerCase()));

export function preflightClaims(pages: { simulation: string; reasonCodes: string; contractApi: string }) {
  return {
    // PCL 프록시로 가는 정적 호출이 프록시 훅(preCall)에서 정책 평가를 거친다는 설명
    simulationProxyHook: has(pages.simulation, "preCall"),
    // eth_call 이 실행 뒤 전역 정책 재검사를 하지 않고 eth_estimateGas 는 한다는 설명(2026-10-23 판에서 확인)
    simulationEthCallSkipsRecheck: has(pages.simulation, "재검사", "eth_call", "eth_estimateGas"),
    reasonCodesMentionEstimateGas: has(pages.reasonCodes, "estimateGas"),
    // Contract API 페이지가 사전 점검을 eth_call 로 하라고 적는지
    contractApiSaysEthCall: /사전\s*점검은\s*`?eth_call/.test(pages.contractApi),
  };
}
