import assert from "node:assert/strict";
import test from "node:test";
import { compareTotals, operatorTotals, auditorTotals, type LedgerItem, type View } from "./operator-view.ts";

const ledger: LedgerItem[] = [
  { invoice: "A-3", supplier: "supplier-a", amount: 4, tx: "T1", message: 0 },
  { invoice: "A-4", supplier: "supplier-a", amount: 6, tx: "T1", message: 1 },
  { invoice: "B-2", supplier: "supplier-b", amount: 5, tx: "T2", message: 0 },
];
const opView = (tx: string, message: number, amount: string, fields = ["amount"]): View => ({ tx, message, amount, fields, verified: true });

test("운영자는 지시서의 협력사와 공개된 금액으로 협력사별 합계를 낸다", () => {
  const r = operatorTotals(ledger, [opView("T1", 0, "4"), opView("T1", 1, "6"), opView("T2", 0, "5")]);
  assert.deepEqual(r.totals, { "supplier-a": 10, "supplier-b": 5 });
  assert.deepEqual(r.problems, []);
});

test("공개된 금액이 지시서와 다르면 문제로 적는다", () => {
  const r = operatorTotals(ledger, [opView("T1", 0, "4"), opView("T1", 1, "7"), opView("T2", 0, "5")]);
  assert.ok(r.problems.some((p) => p.includes("A-4")));
});

test("금액 밖의 필드가 공개됐으면 위임 범위를 넘었다고 적는다", () => {
  const r = operatorTotals(ledger, [opView("T1", 0, "4", ["amount", "to_shielded_address"]), opView("T1", 1, "6"), opView("T2", 0, "5")]);
  assert.ok(r.problems.some((p) => p.includes("위임 범위")));
});

test("공개를 풀지 못한 지시서 항목은 합계에 넣지 않고 문제로 적는다", () => {
  const r = operatorTotals(ledger, [opView("T1", 0, "4"), opView("T1", 1, "6")]);
  assert.deepEqual(r.totals, { "supplier-a": 10 });
  assert.ok(r.problems.some((p) => p.includes("B-2")));
});

test("감사인 합계는 받는 주소를 협력사로 바꿔 더한다", () => {
  const audit = [
    { tx: "T1", message: 0, amount: "4", to: "addrA", verified: true },
    { tx: "T1", message: 1, amount: "6", to: "addrA", verified: true },
    { tx: "T2", message: 0, amount: "5", to: "addrB", verified: true },
  ];
  assert.deepEqual(auditorTotals(audit, { addrA: "supplier-a", addrB: "supplier-b" }), { "supplier-a": 10, "supplier-b": 5 });
});

test("두 합계를 협력사마다 견준다", () => {
  const rows = compareTotals({ "supplier-a": 10, "supplier-b": 5 }, { "supplier-a": 10, "supplier-b": 6 });
  assert.deepEqual(rows, [
    { supplier: "supplier-a", operator: 10, auditor: 10, same: true },
    { supplier: "supplier-b", operator: 5, auditor: 6, same: false },
  ]);
});
