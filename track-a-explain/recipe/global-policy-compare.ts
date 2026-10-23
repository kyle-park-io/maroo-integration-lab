// a:probe-global 의 비교 결과를 판정 문장으로 바꾼다.
// 같은 금액을 PCL 프록시를 거치지 않는 이체(plain)와 PCL 프록시 호출(proxy)로 보내 보고,
// eth_call 과 eth_estimateGas 가 각각 거부했는지로 문장을 만든다. 체인을 부르지 않는다.

// failed: 거부가 아니라 RPC 오류(revert 데이터 없음, 요청 한도 등)로 판정할 수 없는 행
export type ProbeRow = { target: "plain" | "proxy"; method: "eth_call" | "eth_estimateGas"; rejected: boolean; outcome?: string; failed?: string };

// RPC 응답 하나를 행으로. revert 데이터가 있는 오류만 정책 거부로 센다.
export function rowFromReply(target: ProbeRow["target"], method: ProbeRow["method"], r: { result?: string; error?: { message: string; data?: string } }): ProbeRow {
  if (!r.error) return { target, method, rejected: false };
  if (r.error.data && r.error.data !== "0x") return { target, method, rejected: true };
  return { target, method, rejected: false, failed: r.error.message };
}

const NAME = { plain: "PCL 프록시를 거치지 않는 이체", proxy: "PCL 프록시 호출" } as const;
// 이름 끝 받침에 맞춘 보조사. 이체는 받침이 없고 호출은 받침이 있다.
const TOPIC = { plain: `${NAME.plain}는`, proxy: `${NAME.proxy}은` } as const;

export function conclude(rows: ProbeRow[]): string[] {
  const failed = rows.filter((r) => r.failed);
  if (failed.length) return [`RPC 오류로 판정하지 못했습니다(${failed.map((r) => `${NAME[r.target]} ${r.method}: ${r.failed}`).join("; ")}). 잠시 뒤 다시 실행합니다.`];
  const of = (target: ProbeRow["target"], method: ProbeRow["method"]) => rows.find((r) => r.target === target && r.method === method)?.rejected;
  if (rows.every((r) => !r.rejected)) {
    return ["두 경우 모두 eth_call과 eth_estimateGas가 통과해, 이번 조건에서는 전역 정책의 평가 차이를 확인하지 못했습니다."];
  }
  const lines: string[] = [];
  for (const target of ["plain", "proxy"] as const) {
    const call = of(target, "eth_call"), estimate = of(target, "eth_estimateGas");
    if (call === undefined || estimate === undefined) continue;
    if (!call && estimate) {
      lines.push(target === "plain"
        ? `${TOPIC.plain} eth_call에서 전역 정책 거부가 나오지 않습니다. eth_estimateGas는 거부했습니다.`
        : `${NAME.proxy}도 eth_call에서는 통과하고 eth_estimateGas에서만 거부됐습니다.`);
    } else if (call && estimate) {
      lines.push(target === "proxy"
        ? `${TOPIC.proxy} eth_call에서도 거부됩니다.`
        : `${NAME.plain}도 eth_call과 eth_estimateGas가 모두 거부했습니다.`);
    } else if (!call && !estimate) {
      lines.push(`${TOPIC[target]} 두 방법 모두 통과했습니다.`);
    } else {
      lines.push(`${TOPIC[target]} eth_call만 거부하고 eth_estimateGas는 통과했습니다. 상태가 바뀌었는지 다시 실행해 확인하십시오.`);
    }
  }
  return lines;
}
