// 에이전트 한도 결제 앱의 화면 문구와 값 해석. 체인을 부르지 않는다.
//
// 화면 문구는 writing-guides product/general/screen-copy.md 를 따른다. 버튼과 오류는 해요체, 설명은 합쇼체.
// 실패는 사유마다 문구를 나누고, 누가 무엇을 하면 풀리는지와 누를 버튼을 함께 준다.
// 코드가 채우는 값은 괄호에 넣고 조사는 앞 명사에 붙인다(「한도(5 OKRW)보다」).

import { formatEther, hexToBigInt, hexToString, numberToHex, parseEther, size, toHex, type Hex } from "viem";
import { okrw, type Decoded, type Explanation } from "../../shared/lib/explain.ts";

export type LimitState = { kind: "none" } | { kind: "ok"; wei: bigint } | { kind: "invalid"; raw: Hex; reason: string };

// TransferLimit 메타데이터. 정책은 32바이트 big-endian uint256 만 읽는다([Live Testnet] c:agent-limit 3절).
export function readLimit(raw: Hex): LimitState {
  if (raw === "0x") return { kind: "none" };
  const n = size(raw);
  if (n === 32) return { kind: "ok", wei: hexToBigInt(raw) };
  let text = "";
  try { text = hexToString(raw); } catch { /* 글자가 아닌 바이트 */ }
  return /^\d+$/.test(text)
    ? { kind: "invalid", raw, reason: `한도가 숫자 문자열(「${text}」)로 저장돼 있어요. 2026-09-26 판 문서의 형식이에요` }
    : { kind: "invalid", raw, reason: `한도가 32바이트 정수가 아닌 값(${n}바이트)으로 저장돼 있어요` };
}

export const encodeLimit = (wei: bigint, format: "uint256" | "string"): Hex =>
  format === "uint256" ? numberToHex(wei, { size: 32 }) : toHex(wei.toString());

// 화면에서 받은 금액. 양수이고 소수 18자리 안이어야 한다.
export function parseAmount(s: string): bigint | undefined {
  const t = s.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(t)) return undefined;
  const v = parseEther(t);
  return v > 0n ? v : undefined;
}

export type Outcome =
  | { status: "success"; tx: Hex; value: bigint; fee: bigint; block: bigint }
  | { status: "rejected"; explanation: Explanation } // 사전 검사(eth_estimateGas)에서 막혀 보내지 않았다
  | { status: "failed"; tx: Hex; fee: bigint; explanation?: Explanation } // 블록에 들어갔지만 되돌려졌다. 사유를 읽지 못하면 explanation 이 없다
  | { status: "blocked"; balance: bigint; need: bigint } // 잔고가 결제 금액과 가스비 상한보다 적어 보내지 않았다
  | { status: "refused"; decoded: Decoded; nodeMessage: string } // 노드가 tx 를 받지 않았다(블록에 들어가지 않았다)
  | { status: "network"; detail?: string } // RPC 에 닿지 못했거나 RPC 가 사전 검사에 답하지 않아 보내지 않았다
  | { status: "unknown"; tx: Hex } // 보냈지만 영수증을 아직 받지 못했다
  | { status: "dropped"; tx: Hex }; // 확인 중이던 tx 가 블록에 들어가지 않았다(같은 논스를 다른 tx 가 썼다)

export type NextAction = "raise-limit" | "save-limit" | "topup" | "retry" | "recheck";
export type Message = { stamp: "승인" | "거절" | "실패" | "보내지 않음" | "확인 중"; body: string; next?: { action: NextAction; label: string } };

const scopeText = (e: Explanation) =>
  e.scope?.scope === "contract" ? "금고 fund()에 묶인 컨트랙트 정책" : e.scope?.scope === "global" ? "모든 tx에 걸리는 전역 정책" : "PCL 정책";

function rejection(e: Explanation, sent: boolean): Message {
  const d = e.decoded!;
  const after = sent ? "" : " 사전 검사에서 막혀 tx를 보내지 않았고 가스비(fee)도 나가지 않았어요.";
  if (d.name === "ExceededAgentTransferLimit") {
    const [limit, requested] = d.args as [bigint, bigint];
    return {
      stamp: "거절",
      body: `한도(${okrw(limit)} OKRW)보다 큰 금액(${okrw(requested)} OKRW)을 요청해서 PCL이 결제를 거절했어요.${after} 소유자가 한도를 올리거나, 금액을 한도 안으로 나눠 다시 요청해 주세요.`,
      next: { action: "raise-limit", label: "소유자 칸에서 한도 올리기" },
    };
  }
  if (d.name === "AgentTransferLimitMetadataInvalid") {
    return {
      stamp: "거절",
      body: `에이전트 한도 값의 형식이 맞지 않아 PCL이 결제를 거절했어요. 정책은 한도를 32바이트 정수로 읽어요.${after} 소유자가 한도를 다시 저장해 주세요.`,
      next: { action: "save-limit", label: "소유자 칸에서 한도 다시 저장하기" },
    };
  }
  if (d.family === "pcl-policy") {
    return { stamp: "거절", body: `${scopeText(e)}이 결제를 거절했어요(사유 ${d.text}).${after} 사유에 적힌 조건을 맞춘 뒤 다시 요청해 주세요.` };
  }
  if (d.family === "contract") {
    return { stamp: "거절", body: `금고 코드가 결제를 거절했어요(사유 ${d.text}).${after} 금고의 구매자 지갑과 결제를 보낸 지갑이 같은지 확인해 주세요.` };
  }
  return { stamp: "거절", body: `결제가 거절됐어요(사유 ${d.text || "알 수 없음"}).${after} 서버 로그의 pnpm explain 명령으로 사유를 확인해 주세요.` };
}

export function messageFor(o: Outcome): Message {
  switch (o.status) {
    case "success":
      return { stamp: "승인", body: `협력사 A 몫으로 금고에 ${okrw(o.value)} OKRW를 넣었어요. 가스비(fee)는 ${okrw(o.fee)} OKRW였어요(블록 ${o.block}).` };
    case "rejected":
      return rejection(o.explanation, false);
    case "failed": {
      const d = o.explanation?.decoded;
      if (d?.family === "out-of-gas") {
        const limit = o.explanation?.tx?.gasLimit ?? 0n;
        return {
          stamp: "실패",
          body: `가스 한도(${limit.toLocaleString("en-US")})가 모자라 결제가 블록에서 실패했어요. 결제 금액은 나가지 않았고 가스비(fee) ${okrw(o.fee)} OKRW는 나갔어요. 가스 한도 칸을 비워 추정값으로 두고 다시 요청해 주세요.`,
          next: { action: "retry", label: "가스 한도를 비우고 다시 요청하기" },
        };
      }
      if (d && o.explanation) {
        const m = rejection(o.explanation, true);
        return { ...m, stamp: "실패", body: `${m.body} 블록에서 되돌려져 가스비(fee) ${okrw(o.fee)} OKRW가 나갔어요.` };
      }
      return { stamp: "실패", body: `결제가 블록에서 되돌려졌어요. 가스비(fee) ${okrw(o.fee)} OKRW가 나갔어요. 서버 로그의 pnpm explain 명령으로 사유를 확인해 주세요.` };
    }
    case "blocked":
      return {
        stamp: "보내지 않음",
        body: `에이전트 지갑의 OKRW가 모자라 보내지 않았어요(잔고 ${okrw(o.balance)} OKRW, 결제 금액과 가스비 상한의 합 ${okrw(o.need)} OKRW). 소유자가 에이전트 지갑에 OKRW를 넣은 뒤 다시 요청해 주세요.`,
        next: { action: "topup", label: "소유자 칸에서 에이전트 지갑에 OKRW 넣기" },
      };
    case "refused": {
      const m = o.nodeMessage.match(/gas (\d+), minimum needed (\d+)/);
      if (o.decoded.name === "IntrinsicGasTooLow" && m) {
        const n = (s: string) => Number(s).toLocaleString("en-US");
        return {
          stamp: "보내지 않음",
          body: `가스 한도(${n(m[1])})가 이 호출의 최소 가스(${n(m[2])})보다 작아 노드가 결제 tx를 받지 않았어요. 블록에 들어가지 않아 가스비(fee)는 나가지 않았어요. 가스 한도 칸을 비워 추정값으로 두고 다시 요청해 주세요.`,
          next: { action: "retry", label: "가스 한도를 비우고 다시 요청하기" },
        };
      }
      return {
        stamp: "보내지 않음",
        body: `노드가 결제 tx를 받지 않았어요(사유 ${o.decoded.text}). 블록에 들어가지 않아 가스비(fee)는 나가지 않았어요. 사유에 맞게 값을 고친 뒤 다시 요청해 주세요.`,
        next: { action: "retry", label: "다시 요청하기" },
      };
    }
    case "network":
      return {
        stamp: "보내지 않음",
        body: o.detail
          ? `Maroo 테스트넷 RPC가 사전 검사 요청에 답하지 않아(${o.detail}) 결제를 보내지 않았어요. 잠시 뒤 다시 요청해 주세요.`
          : "Maroo 테스트넷 RPC에 연결하지 못해 결제를 보내지 않았어요. 서버의 네트워크 연결을 확인한 뒤 다시 요청해 주세요.",
        next: { action: "retry", label: "다시 요청하기" },
      };
    case "dropped":
      return {
        stamp: "보내지 않음",
        body: "확인 중이던 결제는 블록에 들어가지 않았어요. 같은 순번(논스)을 다른 tx가 먼저 써서 이 결제는 더 들어갈 수 없어요. 결제 금액과 가스비(fee)는 나가지 않았어요. 다시 요청해 주세요.",
        next: { action: "retry", label: "다시 요청하기" },
      };
    case "unknown":
      return {
        stamp: "확인 중",
        body: "결제를 보냈지만 블록에 들어갔는지 아직 확인하지 못했어요. 잠시 뒤 결제 기록 다시 읽기를 눌러 주세요. 결과를 확인할 때까지 새 결제는 받지 않아요.",
        next: { action: "recheck", label: "결제 기록 다시 읽기" },
      };
  }
}

export const formatOkrw = (wei: bigint) => okrw(wei);
export const weiToNumberString = (wei: bigint) => formatEther(wei);

// tx 를 보내다 난 오류. 연결 자체가 안 됐으면 노드에 닿지 않았고(not-sent), 연결 뒤에 끊기거나 늦으면 노드가 받았는지 모른다(ambiguous).
export function classifySendError(message: string): "not-sent" | "ambiguous" | "other" {
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) return "not-sent";
  if (/fetch failed|ETIMEDOUT|ECONNRESET|socket hang up|took too long|HTTP request failed/i.test(message)) return "ambiguous";
  return "other";
}

// 확인 중인 tx 를 다시 보낸 결과. 오류가 없으면 ok.
export function rebroadcastResult(message: string | undefined): "ok" | "known" | "nonce-too-low" | "network" | "other" {
  if (message === undefined) return "ok";
  if (/already known|already exists|known transaction/i.test(message)) return "known";
  if (/nonce too low|invalid nonce/i.test(message)) return "nonce-too-low";
  if (classifySendError(message) !== "other") return "network";
  return "other";
}

// 사전 검사(eth_estimateGas)의 오류가 거절이 아니라 RPC 의 문제인지(요청 한도, 게이트웨이 오류)
export function isRpcTrouble(httpStatus: number, error: { code?: number; message?: string; data?: unknown } | undefined): boolean {
  if (httpStatus !== 200) return true;
  if (!error) return false;
  if (error.data) return false;
  return error.code === -32005 || /rate limit|rate exceeded|too many requests|timeout|unavailable|overloaded/i.test(error.message ?? "");
}

// 이 서버의 화면에서 온 요청인지. 다른 사이트가 브라우저를 시켜 서명 요청을 보내거나(Origin), 다른 이름으로 이 포트에 붙는 것(Host)을 막는다.
export function allowedRequest(r: { method: string; host?: string; origin?: string }, port: number): boolean {
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!r.host || !hosts.includes(r.host)) return false;
  if (r.method !== "GET" && r.method !== "HEAD" && r.origin !== undefined && !hosts.map((h) => `http://${h}`).includes(r.origin)) return false;
  return true;
}

// 가스 한도 입력. 비우면 추정값을 쓰고(undefined), 양의 정수가 아니면 null.
export function parseGas(s: string | undefined): bigint | undefined | null {
  const t = (s ?? "").replace(/,/g, "").trim();
  if (!t) return undefined;
  if (!/^\d{1,9}$/.test(t)) return null;
  const g = BigInt(t);
  return g > 0n ? g : null;
}
