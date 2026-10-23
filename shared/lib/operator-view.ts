// 운영자(정산 대행사) 시야의 집계. 체인과 Clairveil 을 부르지 않는다.
//
// 마루 라이트페이퍼 5.6.1 은 운영자가 「당사자의 위임 또는 정책 범위 내에서만 부분 데이터 또는 집계 데이터」에 접근한다고 적는다.
// 이 시제품에서 정산 대행사는 금액만 담은 사용자 공개(privacy-policy amount)를 자기 키로 받는다.
// 받는 협력사는 공개되지 않으므로, 대행사는 자기가 만든 지급 지시서(어느 tx 의 몇 번째 메시지가 어느 협력사 송장인지)로 협력사를 붙인다.
// 감사인은 같은 지급의 감사 공개(금액, 보낸 주소, 받는 주소)를 풀 수 있어, 두 합계를 견줘 지시서와 체인이 맞는지 확인한다.

export type LedgerItem = { invoice: string; supplier: string; amount: number; tx: string; message: number };
export type View = { tx: string; message: number; amount?: string; fields: string[]; verified: boolean };
export type AuditView = { tx: string; message: number; amount: string; to: string; verified: boolean };
export type Totals = Record<string, number>;

const key = (tx: string, message: number) => `${tx.toUpperCase()}#${message}`;

export function operatorTotals(ledger: LedgerItem[], views: View[]): { totals: Totals; problems: string[] } {
  const byKey = new Map(views.map((v) => [key(v.tx, v.message), v]));
  const totals: Totals = {};
  const problems: string[] = [];
  for (const item of ledger) {
    const v = byKey.get(key(item.tx, item.message));
    if (!v || !v.verified || v.amount === undefined) {
      problems.push(`송장 ${item.invoice}의 공개를 풀지 못해 합계에서 뺐습니다.`);
      continue;
    }
    const extra = v.fields.filter((f) => f !== "amount");
    if (extra.length) problems.push(`송장 ${item.invoice}의 공개에 금액 밖의 필드(${extra.join(", ")})가 있어 위임 범위를 넘었습니다.`);
    if (Number(v.amount) !== item.amount) problems.push(`송장 ${item.invoice}: 지시서 금액 ${item.amount}, 공개된 금액 ${v.amount}.`);
    totals[item.supplier] = (totals[item.supplier] ?? 0) + Number(v.amount);
  }
  return { totals, problems };
}

export function auditorTotals(views: AuditView[], supplierOf: Record<string, string>): Totals {
  const totals: Totals = {};
  for (const v of views) {
    if (!v.verified) continue;
    const s = supplierOf[v.to] ?? `알 수 없는 주소 ${v.to.slice(0, 12)}…`;
    totals[s] = (totals[s] ?? 0) + Number(v.amount);
  }
  return totals;
}

export function compareTotals(operator: Totals, auditor: Totals) {
  return [...new Set([...Object.keys(operator), ...Object.keys(auditor)])].sort().map((supplier) => ({
    supplier, operator: operator[supplier] ?? 0, auditor: auditor[supplier] ?? 0, same: (operator[supplier] ?? 0) === (auditor[supplier] ?? 0),
  }));
}
