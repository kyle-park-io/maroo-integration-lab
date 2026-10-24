// Privacy 준비 상태 감시의 판정. 체인과 문서를 부르지 않는다(조회는 track-a-explain/recipe/watch-privacy.ts).
//
// 외부 개발자가 Maroo 테스트넷에서 Privacy 를 끝까지 실행하려면 Maroo 가 verifier 와 맞는 proving 재료를
// 공개해야 한다(가이드 6절 최초 실패 계층). 차폐 상태 조회 경로는 2026-10-23 에 Cosmos REST 에서 응답했다. 그날을 놓치지 않으려고 매번 같은 값을 읽어 기록하고,
// 이전 기록과 달라진 것과 다음에 시험할 층을 적는다.

import { createHash } from "node:crypto";
import path from "node:path";
import { outPath } from "./paths.ts";

export type WatchRecord = {
  checkedAt: string;
  node: { app: string; clairveil?: string };
  privacyRest: Record<string, number | string>;
  // 회로 설정(circuit_config)이 proving 산출물을 내주는지. manifest_available 과 파일 이름이 있는 산출물 수
  provingMaterial?: { manifestAvailable: boolean; artifactFiles: number; verifyingKeys?: Record<string, string> };
  // Clairveil 릴리스 압축(.tar.gz)의 파일 가운데 테스트넷 검증 키와 sha256 이 같은 것
  releaseArchives?: { archives: string[]; files: number; matches: KeyMatch[]; failed?: string[] };
  firstFailure: { family?: string; name?: string; text?: string };
  sdkProbe?: { stoppedAt: string; proverReached: boolean } | { skipped: string };
  // 공개된 성공 예치의 calldata 를 본인 인증 증명 없는 지갑에서 부른 결과(4층 시험)
  layer4?: { name?: string; scope?: string; text?: string };
  precompileTx: { total: number; latest?: string; bySelector?: SelectorCount[] };
  docs?: Record<string, string>;
  clairveilLatest?: string;
  npm?: Record<string, string>;
};
export type ArchiveFile = { name: string; sha256: string };
export type KeyMatch = { archive: string; file: string; circuit: string };

export type SelectorCount = { selector: string; name: string; total: number; success: number };

export function countBySelector(txs: { raw_input?: string; result?: string }[], names: Record<string, string>): SelectorCount[] {
  const m = new Map<string, SelectorCount>();
  for (const t of txs) {
    const selector = (t.raw_input ?? "0x").slice(0, 10).toLowerCase();
    const c = m.get(selector) ?? { selector, name: names[selector] ?? "알 수 없음", total: 0, success: 0 };
    c.total++;
    if (t.result === "success") c.success++;
    m.set(selector, c);
  }
  return [...m.values()].sort((a, b) => b.total - a.total || a.selector.localeCompare(b.selector));
}

export function diffDocs(before: Record<string, string> | undefined, now: Record<string, string>) {
  if (!before) return { changed: [], added: [], removed: [] };
  return {
    changed: Object.keys(now).filter((k) => k in before && before[k] !== now[k]).sort(),
    added: Object.keys(now).filter((k) => !(k in before)).sort(),
    removed: Object.keys(before).filter((k) => !(k in now)).sort(),
  };
}

// 준비 상태. 2026-10-23 에 조회 경로가 열려 있고 SDK 예치 준비가 증명 공급자까지 가는 것을 확인했다.
// 5층(증명 검증)을 시험하려면 테스트넷 검증 키와 짝인 proving 재료가 있어야 해서, 그것이 공개됐는지로 판정한다.
export function readiness(r: WatchRecord): { ready: boolean; done: string[]; reasons: string[]; next: string[] } {
  const done: string[] = [], reasons: string[] = [];
  const open = Object.entries(r.privacyRest).filter(([, s]) => s === 200).map(([p]) => p);
  const closed = Object.entries(r.privacyRest).filter(([, s]) => s !== 200);
  if (open.length) done.push(`차폐 상태 조회 경로 ${open.length}개가 응답합니다(${open.map((p) => p.replace("/clairveil/privacy/v1/", "")).join(", ")}).`);
  for (const [p, s] of closed) reasons.push(`조회 경로 ${p}의 응답이 ${s}입니다.`);
  if (r.sdkProbe && "stoppedAt" in r.sdkProbe) {
    if (r.sdkProbe.proverReached) done.push("공식 SDK의 예치 준비가 Cosmos REST로 차폐 상태를 읽고 증명 공급자까지 갑니다.");
    else reasons.unshift(`공식 SDK의 예치 준비가 증명 공급자에 닿기 전에 멈춥니다(${r.sdkProbe.stoppedAt}).`);
  }
  if (r.layer4?.name) done.push(`4층 시험: 공개된 성공 예치의 calldata를 본인 인증 증명 없는 지갑에서 부르면 ${r.layer4.name}(${r.layer4.scope === "contract" ? "Privacy 컨트랙트 정책" : r.layer4.scope ?? "정책"})로 막힙니다.`);
  const inConfig = !!r.provingMaterial && (r.provingMaterial.manifestAvailable || r.provingMaterial.artifactFiles > 0);
  const ra = r.releaseArchives;
  const inRelease = !!ra && ra.matches.length > 0;
  if (ra && inRelease) done.push(`Clairveil 릴리스 압축에 테스트넷 검증 키와 sha256 이 같은 파일이 있습니다(${ra.matches.map((m) => `${m.archive}의 ${m.file}, ${m.circuit}`).join("; ")}).`);
  if (!inConfig && !inRelease) {
    const searched = ra ? ` Clairveil 릴리스 압축 ${ra.archives.length}개(파일 ${ra.files}개)에도 테스트넷 검증 키와 sha256 이 같은 파일이 없습니다.` : "";
    reasons.unshift(`테스트넷 검증 키와 짝인 proving 재료가 공개되지 않았습니다(회로 설정의 manifest_available 이 false 이고 산출물 파일 이름이 비어 있음).${searched} 외부에서 만든 증명은 5층(증명 검증)을 지나지 못합니다.`);
  }
  const next = inConfig
    ? ["proving 재료로 증명을 만들어 본인 인증 지갑에서 eth_estimateGas 로 5층(증명 검증)을 시험합니다.", "결과를 가이드 6절 최초 실패 계층 표에 더합니다."]
    : inRelease
      ? [`${[...new Set(ra!.matches.map((m) => m.archive))].join(", ")}에서 검증 키와 짝인 proving 키를 찾아 pnpm a:probe-sdk --rest 의 증명 공급자 자리에 연결합니다.`, "결과를 가이드 6절 최초 실패 계층 표에 더합니다."]
      : ["다음 기록까지 기다립니다. Maroo 에서 proving 키나 prover 엔드포인트를 받으면 pnpm a:probe-sdk --rest 의 증명 공급자 자리에 연결합니다."];
  return { ready: inConfig || inRelease, done, reasons, next };
}

// 이전 기록과 달라진 값. 같으면 빈 목록이다.
export function changesSince(prev: WatchRecord | undefined, now: WatchRecord): string[] {
  if (!prev) return [];
  const out: string[] = [];
  if (prev.node.app !== now.node.app || prev.node.clairveil !== now.node.clairveil) {
    out.push(`노드 판: ${prev.node.app}(Clairveil ${prev.node.clairveil ?? "?"}) → ${now.node.app}(Clairveil ${now.node.clairveil ?? "?"})`);
  }
  for (const p of new Set([...Object.keys(prev.privacyRest), ...Object.keys(now.privacyRest)])) {
    if (prev.privacyRest[p] !== now.privacyRest[p]) out.push(`조회 경로 ${p}: ${prev.privacyRest[p] ?? "없음"} → ${now.privacyRest[p] ?? "없음"}`);
  }
  const pm = (r: WatchRecord) => (r.provingMaterial ? `manifest ${r.provingMaterial.manifestAvailable}, 파일 ${r.provingMaterial.artifactFiles}개` : "?");
  if (pm(prev) !== pm(now)) out.push(`proving 재료: ${pm(prev)} → ${pm(now)}`);
  if (prev.layer4?.name !== now.layer4?.name) out.push(`4층 시험의 사유: ${prev.layer4?.name ?? "?"} → ${now.layer4?.name ?? "?"}`);
  if (prev.firstFailure.name !== now.firstFailure.name) out.push(`빈 예치 요청의 사유: ${prev.firstFailure.name ?? "통과"} → ${now.firstFailure.name ?? "통과"}`);
  if (prev.precompileTx.total !== now.precompileTx.total) out.push(`Privacy 프리컴파일 tx 수: ${prev.precompileTx.total} → ${now.precompileTx.total}(가장 최근 ${now.precompileTx.latest ?? "?"})`);
  const rs = (r: WatchRecord) => (r.releaseArchives ? `${r.releaseArchives.archives.length}개(검증 키와 같은 파일 ${r.releaseArchives.matches.length}개)` : undefined);
  if (rs(prev) && rs(now) && rs(prev) !== rs(now)) out.push(`Clairveil 릴리스 압축: ${rs(prev)} → ${rs(now)}`);
  if (prev.clairveilLatest !== now.clairveilLatest) out.push(`Clairveil 최신 릴리스: ${prev.clairveilLatest ?? "?"} → ${now.clairveilLatest ?? "?"}`);
  for (const [k, v] of Object.entries(now.npm ?? {})) if (prev.npm?.[k] !== v) out.push(`${k} 최신 판: ${prev.npm?.[k] ?? "?"} → ${v}`);
  const d = diffDocs(prev.docs, now.docs ?? {});
  for (const p of d.changed) out.push(`문서 바뀜: ${p}`);
  for (const p of d.added) out.push(`문서 새로 생김: ${p}`);
  for (const p of d.removed) out.push(`문서 사라짐: ${p}`);
  return out;
}

// 감시 기록 파일. MAROO_LAB_OUT 이 있으면 커밋된 기록 대신 그 폴더 아래에 쓴다(pnpm review 와 같은 방식).
export function recordFile(dir: string, date: string): string {
  return path.join(outPath(dir), `${date}.json`);
}

// 견줄 이전 기록. 오늘 날짜 파일은 뺀다. 같은 날 두 번째 실행도 전날 기록과 견주고, 오늘 기록은 덮어쓴다.
export function previousRecordFile(files: string[], today: string): string | undefined {
  return files.filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f !== `${today}.json`).sort().pop();
}

// tar(ustar, pax, GNU 긴 이름) 바이트에서 일반 파일의 이름과 sha256 을 읽는다. gzip 은 부른 쪽이 푼다.
export function tarFiles(tar: Uint8Array): ArchiveFile[] {
  const buf = Buffer.from(tar.buffer, tar.byteOffset, tar.byteLength);
  const out: ArchiveFile[] = [];
  const str = (b: Buffer) => b.toString("utf8").replace(/\0.*$/s, "");
  let nextName: string | undefined;
  for (let off = 0; off + 512 <= buf.length; ) {
    const h = buf.subarray(off, off + 512);
    if (h.every((x) => x === 0)) break;
    const size = parseInt(str(h.subarray(124, 136)).trim() || "0", 8);
    const type = String.fromCharCode(h[156] || 48);
    const prefix = str(h.subarray(257, 263)).startsWith("ustar") ? str(h.subarray(345, 500)) : "";
    const body = buf.subarray(off + 512, off + 512 + size);
    if (type === "x") {
      const m = body.toString("utf8").match(/(?:^|\n)\d+ path=([^\n]*)\n/);
      if (m) nextName = m[1];
    } else if (type === "L") {
      nextName = str(body);
    } else if (type === "0" || type === "7") {
      const name = nextName ?? (prefix ? `${prefix}/${str(h.subarray(0, 100))}` : str(h.subarray(0, 100)));
      out.push({ name, sha256: createHash("sha256").update(body).digest("hex") });
      nextName = undefined;
    } else if (type !== "g") {
      nextName = undefined;
    }
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

// 압축 하나의 파일 가운데 sha256 이 테스트넷 검증 키와 같은 것
export function matchVerifyingKeys(archive: string, files: ArchiveFile[], keys: Record<string, string>): KeyMatch[] {
  const byHash = new Map(Object.entries(keys).map(([circuit, h]) => [h.toLowerCase(), circuit]));
  return files.filter((f) => byHash.has(f.sha256)).map((f) => ({ archive, file: f.name, circuit: byHash.get(f.sha256)! }));
}
