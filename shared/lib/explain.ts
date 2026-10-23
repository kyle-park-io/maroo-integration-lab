// 거부 해석기. 실패한 tx 나 호출의 revert 데이터를 계열, 이름, 다음 행동으로 푼다.
// 판정 순서는 track-a-explain/integration-guide.md 6절과 같다. 이 파일의 classifyRevert 는 체인을 부르지 않는다.
// 체인에서 영수증, 직전 블록 재시뮬레이션, PCL 설정을 읽는 함수는 explain-chain.ts 에 있다.
//
// 오류 계열은 Maroo 문서(2026-10-23 판)의 분류를 따른다.
//   PCL ReasonCode: 정책 위반, 설정, 조합 및 구조   https://docs.maroo.io/concepts/compliance/pcl-reason-codes/
//   프리컴파일 공통 오류: 입력·인코딩, 표준 SDK 매핑, 트랜잭션 수준 거절   https://docs.maroo.io/concepts/developer/precompile-shared-errors/

import { decodeAbiParameters, decodeErrorResult, formatEther, type Abi, type Hex } from "viem";
import { iPclAbi } from "@maroo-chain/contracts/abi/precompiles/pcl/IPcl";
import { iPrivacyAbi } from "@maroo-chain/contracts/abi/precompiles/privacy/IPrivacy";

export type Family =
  | "pcl-policy" // PCL 정책 위반(조합 정책의 AnyOfRejected 포함)
  | "pcl-config" // PCL 설정, 조합·구조 오류
  | "tx-level" // 트랜잭션 수준 거절(수수료, 논스, 가스, chain ID, 발신자)
  | "sdk" // 표준 SDK 매핑(프리컴파일 뒤 체인 모듈이 거절)
  | "precompile-input" // 그 밖의 프리컴파일 공통 오류(입력·인코딩, 조회)
  | "privacy" // IPrivacy 전용 오류
  | "contract" // 넘겨받은 컨트랙트 ABI 의 오류
  | "error-string" // Solidity Error(string)
  | "panic" // Solidity Panic(uint256)
  | "out-of-gas" // 데이터 없이 가스 한도를 다 씀
  | "node-check" // 데이터 없이 노드 메시지만 옴(잔액 검사 등)
  | "no-data" // 데이터도 메시지도 없이 되돌려짐
  | "unknown"; // 데이터는 있으나 아는 ABI 로 풀리지 않음

export const FAMILY_LABEL: Record<Family, string> = {
  "pcl-policy": "PCL 정책 위반",
  "pcl-config": "PCL 설정 오류",
  "tx-level": "트랜잭션 수준 거절",
  sdk: "프리컴파일 요청 검증(표준 SDK 매핑)",
  "precompile-input": "프리컴파일 공통 오류(입력·인코딩)",
  privacy: "Privacy 프리컴파일 오류",
  contract: "대상 컨트랙트 로직",
  "error-string": "문자열 사유(Error(string))",
  panic: "Solidity panic",
  "out-of-gas": "가스 부족",
  "node-check": "노드 검사",
  "no-data": "데이터 없는 되돌림",
  unknown: "해석되지 않음",
};

export type Decoded = {
  family: Family;
  selector?: Hex;
  name?: string;
  args?: readonly unknown[];
  text: string; // 사람이 읽는 사유 한 줄
  next: string; // 사용자가 할 다음 행동
  children?: Decoded[]; // AnyOfRejected 의 자식 사유
};

const POLICY = new Set([
  "InDenylist", "VolumeBelowMinLimit", "VolumeAboveMaxLimit", "ExceededPeriodicVolume", "EasAttestationRequired",
  "EasNoAttestationReceived", "EasAttestationLookupFailed", "EasAttestationRevoked", "EasAttestationExpired",
  "ExceededAgentTransferLimit", "AgentTransferLimitMetadataInvalid", "AgentKeeperRequired",
]);
const CONFIG = new Set([
  "CannotEmpty", "Unauthorized", "InternalError", "InvalidCall", "InvalidStructType", "AbiDecodeFailed", "InvalidParameter",
  "InvalidSelector", "InvalidPolicyTemplate", "DuplicatedPolicyTemplate", "PolicyTemplateNotFound", "PolicyTemplateInUse",
  "UnknownPolicyType", "UnknownPolicyConfigType", "PolicyAlreadyRegistered", "ContractPolicyNotRegistered",
  "PclProxyNotRegistered", "PolicyNotRegistered",
  // 조합 및 구조 ReasonCode 가운데 AnyOfRejected 를 뺀 것은 정책 트리를 잘못 만든 경우다
  "MaxDepthExceeded", "ChildSelectorNotEmpty", "LogicalPolicyChildrenEmpty", "LogicalPolicyChildNil", "ForEachChildAbsent",
  "ForEachSubjectUnspecified", "UnknownForEachSubject", "QuantifierUnspecified",
]);
const TX_LEVEL = new Set([
  "ChainIdMismatch", "FeeCapTooHigh", "FloorDataGasTooLow", "GasLimitExceeded", "GasPriceTooLow", "InsufficientFee",
  "IntrinsicGasTooLow", "InvalidSender", "NonceGap", "NonceTooLow", "TipAboveFeeCap", "TipTooHigh",
]);
const SDK = new Set(["SDKInsufficientFunds", "SDKInvalidAddress", "SDKInvalidCoins", "SDKInvalidRequest", "SDKInvalidType", "SDKNotFound", "SDKUnauthorized", "UnmappedCosmosError"]);

const errorsOf = (abi: Abi) => abi.filter((x) => x.type === "error");
const MAROO_ERRORS = [...errorsOf(iPclAbi as Abi), ...errorsOf(iPrivacyAbi as Abi).filter((e) => (e as { name: string }).name.startsWith("Privacy"))] as Abi;

// atokrw 정수를 「2,000,000」 같은 OKRW 표기로
export function okrw(v: unknown): string {
  const [i, f] = formatEther(BigInt(v as bigint)).split(".");
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return f ? `${grouped}.${f}` : grouped;
}
const short = (a: unknown) => {
  const s = String(a);
  return /^0x[0-9a-fA-F]{40}$/.test(s) ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
};
const PANIC: Record<number, string> = {
  0x01: "assert 실패", 0x11: "산술 오버플로 또는 언더플로", 0x12: "0으로 나눔", 0x21: "잘못된 enum 값", 0x22: "저장소 바이트 인코딩 오류",
  0x31: "빈 배열에서 pop", 0x32: "배열 범위 밖 접근", 0x41: "메모리 과다 할당", 0x51: "초기화되지 않은 함수 호출",
};

function policyNext(name: string, args: readonly unknown[]): string {
  switch (name) {
    case "InDenylist":
      return `보내는 주소가 거부 목록에 있습니다(주소 ${short(args[0])}). 정책 관리자에게 목록 확인을 요청합니다.`;
    case "VolumeBelowMinLimit":
      return `건당 최소 금액보다 작습니다(최소 ${okrw(args[0])} OKRW, 보낸 금액 ${okrw(args[1])} OKRW). 금액을 늘려 보냅니다.`;
    case "VolumeAboveMaxLimit":
      return `건당 한도를 넘었습니다(한도 ${okrw(args[0])} OKRW, 보낸 금액 ${okrw(args[1])} OKRW). 금액을 나누거나, 보내는 주소가 KYC 증명을 받은 뒤 보냅니다.`;
    case "ExceededPeriodicVolume":
      return `기간 한도를 넘었습니다(한도 ${okrw(args[0])} OKRW, 누적 ${okrw(args[1])} OKRW). 한도가 다시 열리는 시각은 ${new Date(Number(args[2]) * 1000).toISOString()}이고, 그 뒤에 보내거나 KYC 증명을 받습니다.`;
    case "EasAttestationRequired":
    case "EasNoAttestationReceived":
      return `보내는 주소에 이 정책이 요구하는 스키마의 색인된 증명이 없습니다(주소 ${short(args[0])}). 증명을 발급하고 indexAttestation으로 색인한 뒤 다시 보냅니다.`;
    case "EasAttestationRevoked":
      return "가장 최근에 색인된 증명이 폐기됐습니다. 새 증명을 발급해 indexAttestation으로 색인한 뒤 다시 보냅니다.";
    case "EasAttestationExpired":
      return "가장 최근에 색인된 증명이 만료됐습니다. 새 증명을 발급해 indexAttestation으로 색인한 뒤 다시 보냅니다.";
    case "EasAttestationLookupFailed":
      return "체인이 증명을 조회하지 못했습니다. 잠시 뒤 다시 보내고, 같은 사유가 나오면 EAS 설정을 확인합니다.";
    case "ExceededAgentTransferLimit":
      return `에이전트 한도를 넘었습니다. 한도 ${okrw(args[0])} OKRW 가운데 ${okrw(args[1])} OKRW를 요청했습니다. 소유자가 한도를 올리거나 금액을 나눠 요청합니다.`;
    case "AgentTransferLimitMetadataInvalid":
      return `에이전트 한도 메타데이터의 형식이 맞지 않아 모든 결제가 막힙니다(사유: ${args[0]}). TransferLimit을 32바이트 uint256으로 다시 씁니다.`;
    case "AgentKeeperRequired":
      return "이 정책은 에이전트 keeper를 요구합니다. PCL ReasonCode 문서의 AgentKeeperRequired 설명과 에이전트 설정을 대조합니다.";
    default:
      return "PCL 정책이 거부했습니다. PCL ReasonCode 문서의 정책 위반 절과 대조합니다.";
  }
}

function txLevelNext(name: string): string {
  if (/^Nonce/.test(name)) return "논스를 노드에서 다시 읽어 tx를 새로 만듭니다.";
  if (/Fee|GasPrice|Tip/.test(name)) return "수수료 설정(maxFeePerGas, maxPriorityFeePerGas)을 노드가 권하는 값으로 다시 정합니다.";
  if (/Gas/.test(name)) return "가스 한도를 eth_estimateGas 값에 25% 안팎을 더해 정합니다.";
  if (name === "ChainIdMismatch") return "chain ID 450815로 서명합니다.";
  return "서명과 보내는 주소를 확인합니다.";
}

function sdkNext(name: string): string {
  switch (name) {
    case "SDKInvalidRequest":
      return "프리컴파일이 요청 검증에서 거부했습니다. 인자 없는 공통 오류라 어느 검사(형식, 자산 등록, 증명 검증)에서 막혔는지는 알려 주지 않습니다. Privacy 호출이면 테스트넷 검증 키에 맞는 증명 재료가 필요합니다.";
    case "SDKInsufficientFunds":
      return "체인 모듈이 잔액 부족으로 거절했습니다. 보내는 지갑에 OKRW를 받은 뒤 다시 보냅니다.";
    case "SDKUnauthorized":
      return "권한이 없는 주소가 불렀습니다. 이 메서드를 부를 수 있는 주소로 보냅니다.";
    default:
      return "체인 모듈이 요청을 거절했습니다. 프리컴파일 공통 오류 문서의 표준 SDK 매핑 절과 대조합니다.";
  }
}

const thou = (n: bigint) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

// 데이터 없는 되돌림을 가스 한도 없이 다시 실행해 본 결과로 다시 판정한다.
// 하위 호출(PCL 훅, delegatecall)이 받은 가스(남은 가스의 63/64)를 다 쓰고 되돌리면, tx 는 한도보다 조금 덜 쓰고 데이터 없이 끝난다.
// 그때 쓴 가스와 한도가 같지 않아 classifyRevert 만으로는 가스 부족을 가리지 못한다.
export function refineByUncappedReplay(d: Decoded, uncappedPassed: boolean, gas: { gasUsed: bigint; gasLimit: bigint }): Decoded {
  if (!uncappedPassed || !(d.family === "node-check" || d.family === "no-data")) return d;
  return {
    family: "out-of-gas",
    text: `가스가 모자라 되돌려졌습니다(쓴 가스 ${thou(gas.gasUsed)}, 한도 ${thou(gas.gasLimit)}). 가스 한도 없이 같은 상태로 다시 실행하면 통과합니다`,
    next: "가스 한도를 eth_estimateGas 값에 25% 안팎을 더해 정합니다.",
  };
}

const fmtArgs = (args: readonly unknown[] = []) => args.map((a) => (typeof a === "bigint" ? a.toString() : Array.isArray(a) ? `[${a.length}개]` : String(a))).join(", ");

export function classifyRevert(input: { data: Hex | undefined; extraAbi?: Abi; rpcMessage?: string; gasUsed?: bigint; gasLimit?: bigint }): Decoded {
  const { data, extraAbi = [], rpcMessage, gasUsed, gasLimit } = input;
  if (!data || data === "0x") {
    if (gasUsed !== undefined && gasLimit !== undefined && gasUsed === gasLimit) {
      return { family: "out-of-gas", text: `가스 한도를 다 써서 되돌려졌습니다(쓴 가스와 한도 ${gasUsed.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")})`, next: "가스 한도를 eth_estimateGas 값에 25% 안팎을 더해 정합니다." };
    }
    // Maroo 는 사유 없는 되돌림(메시지 없는 require, revert(), 없는 함수 선택자)을 data 없이 "execution reverted" 로만 돌려준다
    if (rpcMessage && /^execution reverted:?\s*$/i.test(rpcMessage.trim())) {
      return { family: "no-data", text: `revert 데이터 없이 되돌려졌습니다(노드 메시지: ${rpcMessage.trim()})`, next: "대상 컨트랙트가 사유 없이 되돌렸거나(메시지 없는 require, revert(), 없는 함수 선택자) 하위 호출이 가스를 다 썼습니다. 대상 주소, 함수 선택자, 인자를 확인하고, 가스 한도 없이 다시 시뮬레이션해 통과하면 가스 부족입니다." };
    }
    if (rpcMessage) {
      const balance = /insufficient (balance|funds)/i.test(rpcMessage);
      return {
        family: "node-check", text: rpcMessage,
        next: balance ? "보내는 지갑의 잔액이 부족합니다. OKRW를 받은 뒤 다시 보냅니다." : "노드가 요청을 거절했습니다. 메시지와 보낸 값을 확인합니다.",
      };
    }
    return { family: "no-data", text: "revert 데이터 없이 되돌려졌습니다", next: "같은 호출을 eth_estimateGas로 다시 불러 사유를 받습니다. 직전 블록 재시뮬레이션에서 통과하면 그 사이 상태가 바뀐 것입니다." };
  }
  const selector = data.slice(0, 10).toLowerCase() as Hex;
  const contractErrors = errorsOf(extraAbi);
  type Dec = { errorName: string; args?: readonly unknown[] };
  const tryDecode = (abi: readonly unknown[]): Dec | undefined => {
    if (abi.length === 0) return undefined;
    try { return decodeErrorResult({ abi: abi as Abi, data }) as Dec; } catch { return undefined; }
  };
  const asMaroo = tryDecode(MAROO_ERRORS);
  const asContract = tryDecode(contractErrors);
  // 같은 선택자가 두 ABI 에 다 있으면(Unauthorized(), InvalidSender() 처럼 흔한 이름) 정책 사유가 아닌 한 사용자가 넘긴 컨트랙트 ABI 를 따른다.
  // 정책 사유는 PCL 프록시가 내므로 Maroo 로 푼다.
  const marooPolicy = !!asMaroo && (POLICY.has(asMaroo.errorName) || asMaroo.errorName === "AnyOfRejected");
  const fromContract = !!asContract && (!asMaroo || !marooPolicy);
  const decoded = fromContract ? asContract : asMaroo;
  const shadowed = fromContract && asMaroo ? asMaroo.errorName : undefined;
  if (!decoded) {
    return { family: "unknown", selector, text: `해석되지 않은 revert ${data.length > 74 ? `${data.slice(0, 74)}…` : data}`, next: "대상 컨트랙트 ABI를 --abi 로 넘기면 풀 수 있습니다. 풀리지 않은 사유를 통과나 다른 계열로 바꿔 적지 않습니다." };
  }
  const name = decoded.errorName;
  const args = decoded.args ?? [];
  const text = `${name}(${fmtArgs(args)})`;
  if (name === "Error") return { family: "error-string", selector, name, args, text: `문자열 사유: ${args[0]}`, next: "사유 문구를 대상 코드나 Maroo 문서에서 찾습니다." };
  if (name === "Panic") {
    const code = Number(args[0]);
    return { family: "panic", selector, name, args, text: `Panic(0x${code.toString(16)}): ${PANIC[code] ?? "알 수 없는 panic 코드"}`, next: "컨트랙트의 계산이나 배열 접근을 확인합니다." };
  }
  if (fromContract) {
    const also = shadowed ? ` 같은 선택자의 Maroo 오류(${shadowed})도 있어, 대상이 컨트랙트 ABI 와 다른 코드를 부른 경우에는 그 오류일 수 있습니다.` : "";
    return { family: "contract", selector, name, args, text, next: `대상 컨트랙트 코드가 ${name}로 되돌렸습니다. 컨트랙트가 이 오류를 내는 조건을 확인합니다.${also}` };
  }
  if (name === "AnyOfRejected") {
    const children = (args[0] as readonly Hex[]).map((child) => classifyRevert({ data: child, extraAbi }));
    return { family: "pcl-policy", selector, name, args, text: `AnyOfRejected(자식 사유 ${children.length}개)`, children, next: "조합 정책의 자식이 모두 거부했습니다. 아래 자식 사유 가운데 하나를 풀면 통과합니다." };
  }
  if (POLICY.has(name)) return { family: "pcl-policy", selector, name, args, text, next: policyNext(name, args) };
  if (CONFIG.has(name)) return { family: "pcl-config", selector, name, args, text, next: "정책 설정이나 관리 호출의 문제입니다. PCL ReasonCode 문서의 설정, 조합 및 구조 절과 대조합니다." };
  if (TX_LEVEL.has(name)) return { family: "tx-level", selector, name, args, text, next: txLevelNext(name) };
  if (SDK.has(name)) return { family: "sdk", selector, name, args, text, next: sdkNext(name) };
  if (name.startsWith("Privacy")) return { family: "privacy", selector, name, args, text, next: "Privacy 프리컴파일이 거부했습니다. Maroo 문서의 IPrivacy 오류 설명과 대조합니다." };
  return { family: "precompile-input", selector, name, args, text, next: "프리컴파일 입력이 맞지 않습니다. 인자와 인코딩을 확인합니다." };
}

// Error(string) 의 본문을 직접 풀어야 할 때(decodeErrorResult 가 실패한 문자열 revert)
export function decodeErrorString(data: Hex): string | undefined {
  if (!data.startsWith("0x08c379a0")) return undefined;
  try {
    return decodeAbiParameters([{ type: "string" }], `0x${data.slice(10)}`)[0];
  } catch {
    return undefined;
  }
}

// 정책 위반 사유를 내는 정책 템플릿. Maroo 문서 pcl-reason-codes 와 템플릿 문서(2026-10-23 판)의 대응이다.
const REASON_TEMPLATE: [RegExp, string][] = [
  [/^Eas/, "EAS_POLICY"],
  [/^ExceededPeriodicVolume$/, "PERIODIC_VOLUME_POLICY"],
  [/^Volume(Above|Below)/, "VOLUME_POLICY"],
  [/^InDenylist$/, "DENYLIST_POLICY"],
  [/^(ExceededAgentTransferLimit|AgentTransferLimitMetadataInvalid|AgentKeeperRequired)$/, "AGENT_OKRW_TRANSFER_LIMIT_POLICY"],
];

export function reasonTemplates(d: Decoded): Set<string> {
  const out = new Set<string>();
  const walk = (x: Decoded) => {
    if (x.children) x.children.forEach(walk);
    for (const [re, t] of REASON_TEMPLATE) if (x.name && re.test(x.name)) out.add(t);
  };
  walk(d);
  return out;
}

export type Scope = { scope: "global" | "contract" | "either" | "unknown"; note: string };
export const SCOPE_LABEL: Record<Scope["scope"], string> = { global: "전역 정책", contract: "컨트랙트 정책", either: "전역 또는 컨트랙트 정책", unknown: "가리지 못함" };

// PCL 거부가 전역 정책인지 컨트랙트 정책인지. 사유만으로는 가릴 수 없어(EAS_POLICY 는 양쪽에 걸 수 있다)
// 대상이 PCL 프록시인지, 프록시와 전역에 묶인 템플릿이 사유와 맞는지로 가린다.
// contractInOr: 묶인 컨트랙트 정책에서 Or 아래에 있는 템플릿. 감싸인 사유는 Or 에서만 나오므로, 주어지면 감싸인 사유를 이것과 견준다.
export function decideScope(x: { isProxy: boolean; contract: string[]; global: string[]; reason: string[]; globalBare?: string[]; contractInOr?: string[]; wrapped?: boolean }): Scope {
  // 정책 인식 프리컴파일(Privacy 등)은 PCL 프록시가 아니어도 자기 주소에 묶인 컨트랙트 정책을 스스로 평가한다
  if (!x.isProxy && x.contract.length === 0) return { scope: "global", note: "대상이 PCL 프록시가 아니고 대상 주소에 묶인 컨트랙트 정책도 없어 전역 정책의 거부입니다." };
  const inContract = x.wrapped === true && x.contractInOr ? x.reason.some((t) => x.contractInOr!.includes(t)) : x.reason.some((t) => x.contract.includes(t));
  // 감싸이지 않은 사유는 전역 정책의 Or 안에서는 나올 수 없다(그 자리면 AnyOfRejected 로 감싸인다)
  const inGlobal = x.wrapped === false && x.globalBare ? x.reason.some((t) => x.globalBare!.includes(t)) : x.reason.some((t) => x.global.includes(t));
  if (inContract && !inGlobal && x.wrapped === false && x.reason.some((t) => x.global.includes(t))) {
    return { scope: "contract", note: "전역 정책에도 같은 템플릿이 있지만 Or 조합 안에만 있어, 그 자리에서 거부되면 AnyOfRejected로 감싸여 나옵니다. 사유가 감싸이지 않고 나왔으므로 컨트랙트 정책의 거부입니다." };
  }
  if (inContract && !inGlobal) return { scope: "contract", note: "사유와 맞는 템플릿이 이 프록시에만 묶여 있습니다." };
  if (!inContract && inGlobal && x.wrapped === true && x.reason.some((t) => x.contract.includes(t))) {
    return { scope: "global", note: "사유가 AnyOfRejected로 감싸여 나왔는데, 이 프록시에 묶인 정책에는 그 템플릿이 Or 조합 아래에 없습니다. 감싸인 사유는 Or에서만 나오므로 전역 정책의 거부입니다." };
  }
  if (!inContract && inGlobal) return { scope: "global", note: "사유와 맞는 템플릿이 전역 정책에만 있습니다." };
  if (inContract && inGlobal) return { scope: "either", note: "사유와 맞는 템플릿이 전역과 이 프록시 모두에 있습니다. 보내는 주소만 바꿔 같은 호출을 시뮬레이션하면 가릴 수 있습니다." };
  return { scope: "unknown", note: "사유와 맞는 템플릿이 전역 정책에도 이 프록시에도 없습니다." };
}

// 해석 결과. explain-chain.ts 가 체인을 읽어 채우고, formatExplanation 이 사람이 읽는 줄로 바꾼다.
export type Explanation = {
  source: "tx" | "simulation";
  method?: "eth_estimateGas" | "eth_call"; // 시뮬레이션에 쓴 방법
  tx?: { hash: Hex; block: bigint; status: "success" | "reverted"; gasUsed: bigint; gasLimit: bigint };
  call: { from: string; to: string; selector?: Hex; selectorName?: string; value: bigint };
  decoded?: Decoded; // 실패했을 때만
  target?: { isProxy: boolean; kind: string; bound: string[]; global: string[] }; // bound: 호출한 선택자에 묶인 컨트랙트 정책
  scope?: Scope;
  policyCheckPassed?: boolean; // 통과한 tx 의 영수증에 PCL 의 PolicyCheckPassed 가 있는지
  replayNote?: string;
};

const pad = (label: string) => label.padEnd(10 - (label.match(/[가-힣]/g)?.length ?? 0));
const hashShort = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
const thousands = (n: bigint) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export function formatExplanation(e: Explanation): string[] {
  const lines: string[] = [];
  const row = (label: string, value: string) => lines.push(`${pad(label)} ${value}`);
  if (e.tx) {
    const pct = e.tx.gasLimit > 0n ? (Number((e.tx.gasUsed * 1000n + e.tx.gasLimit / 2n) / e.tx.gasLimit) / 10).toFixed(1) : "0";
    row("tx", `${hashShort(e.tx.hash)}   블록 ${e.tx.block}   ${e.tx.status}   가스 ${thousands(e.tx.gasUsed)} / ${thousands(e.tx.gasLimit)} (${pct}%)`);
  } else {
    row("호출", `${short(e.call.from)} → ${short(e.call.to)}   ${okrw(e.call.value)} OKRW   ${e.method ?? "eth_estimateGas"}`);
  }
  if (e.decoded) {
    const d = e.decoded;
    row("사유", d.name ? `${d.name}(${(d.args ?? []).map((a) => (Array.isArray(a) ? `${a.length}개` : short(typeof a === "bigint" ? a.toString() : a))).join(", ")})${d.selector ? `   선택자 ${d.selector}` : ""}` : d.text);
    const reasons = (x: Decoded, prefix: string) => (x.children ?? []).forEach((c, i) => {
      const id = `${prefix}${i + 1}`;
      lines.push(`  자식 ${id.padEnd(5)} ${c.text}`);
      reasons(c, `${id}.`);
    });
    reasons(d, "");
    row("종류", FAMILY_LABEL[d.family]);
  }
  if (e.target) {
    const at = e.call.selector ? `${e.call.selectorName ?? "호출한 함수"}(${e.call.selector})` : "이 호출";
    const where = e.target.isProxy
      ? `${short(e.call.to)}: PCL 프록시(${e.target.kind}), ${at}에 묶인 정책 ${e.target.bound.length ? e.target.bound.join(", ") : "없음"}`
      : e.target.bound.length
        ? `${short(e.call.to)}: 자기 주소의 정책을 스스로 평가하는 정책 인식 프리컴파일, ${at}에 묶인 정책 ${e.target.bound.join(", ")}`
        : `${short(e.call.to)}: PCL 프록시가 아님`;
    if (e.scope) row("걸린 정책", `${SCOPE_LABEL[e.scope.scope]}. 대상 ${where}. ${e.scope.note}`);
    else if (!e.decoded) row("대상", where);
  }
  if (e.tx?.status === "success" && e.target?.isProxy) row("통과 기록", e.policyCheckPassed ? "PolicyCheckPassed 있음. 컨트랙트 정책까지 통과했습니다" : "PolicyCheckPassed 없음");
  if (e.replayNote) row("참고", e.replayNote);
  if (e.decoded) {
    row("다음 행동", e.decoded.next);
    const nexts = (x: Decoded, prefix: string) => (x.children ?? []).forEach((c, i) => {
      const id = `${prefix}${i + 1}`;
      lines.push(`  자식 ${id.padEnd(5)} ${c.next}`);
      nexts(c, `${id}.`);
    });
    nexts(e.decoded, "");
  }
  return lines;
}

// readContract 가 되돌려진 것(조회 대상에 값이 없음)인지, 네트워크나 노드 오류인지. viem 오류의 cause 를 따라 이름을 본다.
export function isRevertError(e: unknown): boolean {
  for (let x = e as { name?: string; shortMessage?: string; cause?: unknown } | undefined, i = 0; x && i < 6; x = x.cause as typeof x, i++) {
    if (/HttpRequestError|TimeoutError|WebSocketRequestError|RpcRequestError/.test(x.name ?? "")) return false;
    if (/ContractFunctionRevertedError|ExecutionRevertedError/.test(x.name ?? "") || /reverted/i.test(x.shortMessage ?? "")) return true;
  }
  return false;
}
