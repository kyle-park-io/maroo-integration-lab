// Track A 레시피: Maroo IPrivacy ABI 와 ClairveilJS 의 정식 EVM Privacy 계약을 대조한다. 코드 대조(체인 호출 없음)
//
//   pnpm setup:clairveil     # vendor/clairveiljs 가 있어야 한다
//   pnpm a:abi-compare
//
// 기준은 Maroo 쪽(@maroo-chain/contracts 의 IPrivacy ABI)이다. 비교 대상은 ClairveilJS 가 들고 있는
// fixtures/evm-privacy-precompile-v0.3.1.json(함수 선택자, 이벤트 서명, 정규화한 ABI 의 sha256)이다.
// 정규화 규칙은 ClairveilJS tools/verify-evm-contract.js 와 같다: 함수와 이벤트만 남기고, 정해진 필드만 두고,
// "type:name" 순으로 정렬한 JSON 의 sha256.
// 결과는 track-a-explain/evidence/code/abi-compare-<시각>.json 에 남긴다.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { toFunctionSelector, type AbiParameter } from "viem";
import { iPrivacyAbi } from "@maroo-chain/contracts/abi/precompiles/privacy/IPrivacy";
import { ROOT } from "../../shared/lib/paths.ts";
import { writeEvidence } from "../../shared/lib/maroo.ts";

type Item = { type: string; name?: string; stateMutability?: string; inputs?: readonly AbiParameter[]; outputs?: readonly AbiParameter[]; anonymous?: boolean };
type Param = AbiParameter & { indexed?: boolean; components?: readonly Param[] };

const fixturePath = path.join(ROOT, "vendor/clairveiljs/fixtures/evm-privacy-precompile-v0.3.1.json");
if (!fs.existsSync(fixturePath)) {
  console.log("vendor/clairveiljs 가 없습니다. 먼저 pnpm setup:clairveil 을 실행하십시오.");
  process.exit(1);
}
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as {
  contract_version: string; canonical_abi_sha256: string; selectors: Record<string, string>; events: Record<string, string>;
};

// ClairveilJS verify-evm-contract.js 의 canonicalAbiParameter, canonicalAbiItem 과 같은 모양
const canonParam = (p: Param): Record<string, unknown> => ({
  name: p.name ?? "", type: p.type,
  ...(p.components ? { components: p.components.map(canonParam) } : {}),
  ...(p.indexed ? { indexed: true } : {}),
});
const canonItem = (i: Item) => ({
  type: i.type, name: i.name,
  ...(i.stateMutability ? { stateMutability: i.stateMutability } : {}),
  inputs: (i.inputs ?? []).map((p) => canonParam(p as Param)),
  ...(i.type === "function" ? { outputs: (i.outputs ?? []).map((p) => canonParam(p as Param)) } : {}),
  ...(i.type === "event" ? { anonymous: i.anonymous ?? false } : {}),
});
const sigType = (p: Param): string => (p.type.startsWith("tuple") ? `(${(p.components ?? []).map(sigType).join(",")})${p.type.slice(5)}` : p.type);
const signature = (i: Item) => `${i.name}(${(i.inputs ?? []).map((p) => sigType(p as Param)).join(",")})`;

const maroo = (iPrivacyAbi as readonly Item[]).filter((i) => i.type === "function" || i.type === "event");
const canonical = maroo.map(canonItem).sort((a, b) => `${a.type}:${a.name}`.localeCompare(`${b.type}:${b.name}`));
const digest = createHash("sha256").update(JSON.stringify(canonical)).digest("hex");

const functions = maroo.filter((i) => i.type === "function");
const events = maroo.filter((i) => i.type === "event");
const selectorRows = functions.map((f) => {
  const selector = toFunctionSelector(signature(f)).slice(2);
  return { name: f.name, maroo: selector, clairveil: fixture.selectors[f.name!] ?? null, same: fixture.selectors[f.name!] === selector, stateMutability: f.stateMutability };
});
const eventRows = events.map((e) => ({ name: e.name, maroo: signature(e), clairveil: fixture.events[e.name!] ?? null, same: fixture.events[e.name!] === signature(e) }));
const onlyInClairveil = {
  functions: Object.keys(fixture.selectors).filter((n) => !functions.some((f) => f.name === n)),
  events: Object.keys(fixture.events).filter((n) => !events.some((e) => e.name === n)),
};
const errorsInMaroo = (iPrivacyAbi as readonly Item[]).filter((i) => i.type === "error").length;

console.log(`ClairveilJS 정식 EVM Privacy 계약 ${fixture.contract_version}`);
console.log(`  함수 ${functions.length}개, 이벤트 ${events.length}개 (Maroo ABI 기준, 오류 ${errorsInMaroo}개는 대조 범위 밖)`);
for (const r of selectorRows) console.log(`  ${r.same ? "✓" : "✗"} ${String(r.name).padEnd(44)} ${r.maroo} ${r.same ? "" : `(Clairveil ${r.clairveil})`}`);
for (const r of eventRows) console.log(`  ${r.same ? "✓" : "✗"} 이벤트 ${r.maroo}${r.same ? "" : ` (Clairveil ${r.clairveil})`}`);
console.log(`  Clairveil 에만 있음: 함수 [${onlyInClairveil.functions}], 이벤트 [${onlyInClairveil.events}]`);
console.log(`  정규화 ABI sha256: Maroo ${digest}`);
console.log(`                     Clairveil ${fixture.canonical_abi_sha256} → ${digest === fixture.canonical_abi_sha256 ? "같음" : "다름"}`);

const file = writeEvidence(path.join(ROOT, "track-a-explain/evidence/code"), "abi-compare", {
  checkedAt: new Date().toISOString(),
  label: "코드 대조(체인 호출 없음). 기준은 Maroo @maroo-chain/contracts IPrivacy ABI",
  maroo: { package: "@maroo-chain/contracts@0.0.9", functions: functions.length, events: events.length, errors: errorsInMaroo, canonicalAbiSha256: digest },
  clairveil: { source: path.relative(ROOT, fixturePath), contractVersion: fixture.contract_version, canonicalAbiSha256: fixture.canonical_abi_sha256 },
  sameCanonicalAbi: digest === fixture.canonical_abi_sha256,
  selectors: selectorRows, events: eventRows, onlyInClairveil,
});
console.log(`기록: ${path.relative(ROOT, file)}`);
