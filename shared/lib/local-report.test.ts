// 로컬 정산 실행 기록(local-report.ts)의 문서 꼴 단위 테스트. 체인 호출 없음.
// 실행 폴더의 JSON 을 최소 필드로 만들어 기록을 쓰고, 기록 마크다운의 꼴을 확인한다.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { STEPS, findStepLine, writeReport } from "./local-report.ts";

function fixture(): { out: string; report: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "local-report-"));
  const out = path.join(root, "out");
  fs.mkdirSync(out);
  const put = (name: string, value: unknown) => fs.writeFileSync(path.join(out, name), JSON.stringify(value));
  const query = (amount: string, messages = 1) => ({
    code: 0, txhash: "AB", height: "10", gas_used: "100",
    tx: {
      body: { messages: Array.from({ length: messages }, () => ({ "@type": "/clairveil.privacy.v1.MsgWithdraw", creator: "c1", amount: `${amount}uclair`, recipient: "r1", proof: "p" })) },
      auth_info: { fee: { amount: [] } },
    },
  });
  for (const [name] of STEPS) put(`${name}-query.json`, query("12", name === "pay-supplier-a" ? 2 : 1));
  put("deposit-8-query.json", query("8"));
  put("deposit-15-query.json", query("15"));
  const notes = { notes: [{ status: "spendable", amount: "12" }] };
  for (const n of ["buyer-notes-before", "supplier-a-notes", "supplier-b-notes", "supplier-a-notes-after"]) put(`${n}.json`, notes);
  const view = { verification: { verified: true }, summary: { delivery: "recipient", disclosed_fields: ["amount"], amount: "15" } };
  for (const v of ["pay-supplier-b-recipient-view", "pay-supplier-b-self-view", "pay-supplier-b-audit-view", "pay-supplier-a-audit-view-0"]) put(`${v}.json`, view);
  put("supplier-a-balance-before.json", { balances: [{ denom: "uclair", amount: "100" }] });
  put("supplier-a-balance-after.json", { balances: [{ denom: "uclair", amount: "112" }] });
  put("reserve.json", { invariant_holds: true });
  return { out, report: path.join(root, "report.md") };
}

function writeFixtureReport(): string {
  const { out, report } = fixture();
  writeReport({ out, report, coreSha: "ca85b027", chainId: "local-1", stamp: "20261023T000000Z", goVersion: "go version go1.27.1", command: "pnpm a:local" });
  return fs.readFileSync(report, "utf8");
}

test("기록의 절 제목 바로 아래에는 표 대신 설명 문장이 온다", () => {
  const lines = writeFixtureReport().split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("## ")) continue;
    const next = lines.slice(i + 1).find((l) => l.trim() !== "");
    assert.ok(next && !next.startsWith("|"), `${lines[i]} 바로 아래가 표입니다`);
  }
});

test("단계 이름은 동사를 줄인 꼴로 맺지 않는다", () => {
  for (const [, label] of STEPS) assert.doesNotMatch(label, /(?:보냄|넣음|씀|됨)$/, label);
});

test("4단계는 새 이름으로 쓴 기록과 옛 이름으로 쓴 기록의 단독 인출 줄을 모두 찾는다", () => {
  const fresh = writeFixtureReport();
  assert.ok(findStepLine(fresh, "withdraw-alone"));
  const legacy = "| 협력사 A 인출 12, 단독으로 보냄 | `AB` | 10 | 성공 | 100 |";
  assert.equal(findStepLine(legacy, "withdraw-alone"), legacy);
  assert.equal(findStepLine(legacy, "supplier-a-withdraw"), undefined);
});

test("기록 머리에 실행 시간을 적는다(문서가 인용하는 시간의 근거)", () => {
  const { out, report } = fixture();
  writeReport({ out, report, coreSha: "ca85b027", chainId: "local-1", stamp: "20261023T000000Z", goVersion: "go version go1.27.1", command: "pnpm a:local", seconds: 61 });
  assert.match(fs.readFileSync(report, "utf8"), /^> 실행 시간: 61초/m);
});
