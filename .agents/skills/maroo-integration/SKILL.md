---
name: maroo-integration
description: Maroo 테스트넷(chain ID 450815)에 OKRW 지급, PCL 정책과 프록시, EAS 증명, ERC-8004 에이전트 한도, Privacy 프리컴파일을 연동하거나 그 오류를 진단할 때 쓴다. 이 레포가 테스트넷에서 직접 확인한 동작, Maroo Docs와 다르게 동작한 곳, 확인 명령을 담는다. Use when integrating with Maroo testnet (OKRW, PCL, EAS, agents, Privacy) or diagnosing its reverts.
---

# Maroo 연동 스킬

이 레포(`maroo-integration-lab`)가 Maroo 테스트넷과 Clairveil 로컬 체인에서 실행해 확인한 것을 에이전트가 연동 코드와 답변에 쓰도록 정리했다. 확인 날짜는 2026-09-26이다.

## 쓰는 법

1. 답하거나 코드를 쓰기 전에 아래 규칙 표에서 해당하는 줄을 찾는다. 답에는 그 줄의 라벨을 함께 적는다.
2. 표에 없는 ABI, 주소, 엔드포인트, 동작은 짐작해서 사실처럼 쓰지 않는다. 확인 명령을 돌리거나, 모른다고 적고 확인 방법을 제안한다.
3. Maroo Docs의 예시를 그대로 옮기기 전에 "문서와 다르게 동작한 곳" 표를 본다.
4. 테스트넷 결과와 로컬 결과를 한 흐름의 성공으로 합치지 않는다.

| 라벨 | 뜻 |
| --- | --- |
| `[Live Testnet]` | Maroo 테스트넷에서 직접 실행하거나 조회했다. 기록이 `*/evidence/live/`에 있다 |
| `[Local]` | Clairveil v0.4.0 로컬 체인에서 실행했다. Maroo 호환성의 증거가 아니다 |
| `[코드 대조]` | 공개 코드와 패키지를 스크립트로 대조했다 |
| `[Docs Only]` | 문서로만 확인했다 |

## 네트워크와 패키지

| 항목 | 값 |
| --- | --- |
| RPC, chain ID, 탐색기 | `https://rpc-testnet.maroo.io`, 450815, `https://explorer-testnet.maroo.io` |
| 프리컴파일 | OKRW `0x1000…0001`, PCL `0x1000…0005`, SchemaRegistry `0x1000…0006`, EAS `0x1000…0007`, Indexer `0x1000…0008`, EAS 설정 `0x1000…0009`, Agent `0x1000…000A`, Privacy `0x1000…000b` |
| ERC-8004 | IdentityRegistry `0x8004…0001`, ReputationRegistry `0x8004…0002` |
| 금액 단위 | `atokrw`(18자리). `IOkrw.getParams().mintDenom`으로 읽는다 |
| 패키지 | `@maroo-chain/contracts` 0.0.9(ABI), `@maroo-chain/viem` 0.4.0(공식 SDK, 판을 고정한다), viem 2.56.8 |

## 검증한 규칙

| 상황 | 할 것 | 하지 말 것 | 근거 |
| --- | --- | --- | --- |
| 보내기 전 정책 검사 | `eth_estimateGas`로 확인한다. 전역 정책과 컨트랙트 정책을 함께 평가한다 | `eth_call`(viem `simulateContract`)만으로 통과를 판단한다. 전역 정책을 평가하지 않는다 | `[Live Testnet]` `pnpm a:probe-global` |
| 가스 한도 | `eth_estimateGas` 값에 25% 안팎을 더한다. 쓰지 않은 가스는 돌려받는다. viem 2.56은 가스를 `eth_fillTransaction`으로 채우므로 `eth_estimateGas` 응답만 늘리면 여유가 붙지 않는다. `gas`를 직접 주거나 두 응답을 모두 늘린다(이 레포 `walletFor`) | 21,000으로 고정한다(단순 이체도 일반 계정 약 104,000, 에이전트 지갑 약 284,000. 한도 21,000인 이체는 블록에 들어가 가스 부족으로 되돌려지고 21,000을 모두 쓴다). 한도를 크게 잡는다(PCL 컨트랙트 정책에 거부되면 한도의 절반을 낸다) | `[Live Testnet]` `pnpm a:probe-send-gas`, `pnpm a:kyb-gate`(통과 tx가 한도의 80.0%) |
| 정책 거부의 비용 | PCL 프록시의 컨트랙트 정책 거부는 블록에 들어가 되돌려지고 가스 한도의 절반을 낸다고 보고 사전 검사한다 | 문서대로 "제출 시점에 걸러져 가스를 내지 않는다"고 가정한다 | `[Live Testnet]` 거부 tx 여덟 건 모두 한도의 50.0%, `pnpm a:reject-gas` |
| PCL 프록시 배포 | `walletClient.extend(marooWalletActions()).pcl.deployPclProxy({ kind: pclProxyKinds.Transparent, logic, initialOwner, initializer })`. 주소는 영수증에서 `deployPclProxy.extractEvent(receipt.logs).args.proxy`로 읽는다 | 초기화 데이터를 비운다(`0x`면 되돌려진다). 시뮬레이션 반환값을 주소로 쓴다 | `[Live Testnet]` `pnpm a:kyb-gate`, `pnpm a:doc-claims` |
| 권한 확인 | 배포 뒤 ERC-1967 구현 슬롯과 관리자 슬롯을 직접 읽는다. 정책 관리자(배포자)와 업그레이드 권한(`initialOwner`)을 다른 주소로 둔다 | 탐색기 표시만 믿는다 | `[Live Testnet]` `pnpm a:kyb-gate` 3b |
| 정책 바인딩 | `pcl.changeContractPolicies({ contract, admin, policies: [policy.eas({ easContract, indexContract, schemaUid, selector })] })`. 정책은 막을 함수의 선택자에만 건다 | 선택자를 비워 모든 함수에 건다(의도가 아니라면) | `[Live Testnet]` `pnpm a:kyb-gate` 3c |
| EAS 증명 | 발급한 뒤 `indexAttestation`까지 해야 PCL이 인식한다. 증명을 다시 발급할 때도 새 증명을 색인한다 | 발급만 하고 청구한다(`EasNoAttestationReceived`). 재발급 뒤 색인 전 청구는 폐기된 옛 증명 때문에 `EasAttestationRevoked` | `[Live Testnet]` `pnpm a:kyb-gate` 6b, [FAQ 5](../../../track-a-explain/faq.md) |
| 에이전트 지갑 연결 | `setAgentWallet`은 새 지갑이 EIP-712(`AgentWalletSet(agentId, newWallet, owner, deadline)`)로 서명하고 소유자가 보낸다. 마감은 체인 블록 시각 + 300초 안 | 마감을 5분 넘게 잡는다(`deadline too far`) | `[Live Testnet]` `pnpm c:agent-limit` 1단계 |
| 지갑에서 에이전트 찾기 | `IAgent.getAgentIds(에이전트 지갑)`. 기준은 연결된 에이전트 지갑이다 | 연결 뒤 소유자 주소로 찾는다(빈 목록). 소유자는 `ownerOf`로 본다 | `[Live Testnet]` `pnpm c:agent-limit` |
| 에이전트 한도 | `setMetadata(agentId, "TransferLimit", numberToHex(한도, { size: 32 }))`. 32바이트 big-endian uint256, 단위 `atokrw` | 문서대로 숫자 문자열을 쓴다. `AgentTransferLimitMetadataInvalid`로 한도 안 결제까지 모두 막힌다 | `[Live Testnet]` `pnpm c:agent-limit` 3단계 |
| 거부 사유 읽기 | revert 데이터를 `Abis.errors`(SDK)나 `IPcl` 오류 ABI로 푼다. `AnyOfRejected` 안의 자식 사유까지 푼다 | `PclViolation.from`이 null이면 통과로 본다(해석되지 않았다는 뜻일 뿐) | `[Live Testnet]`, `[Docs Only]` SDK README |
| Privacy 호출 | 지금은 외부에서 테스트넷 Privacy 상태 변경을 성공시킬 방법이 없다. 유효한 증명을 만들 재료(현재 verifier와 맞는 회로 산출물, 차폐 상태 조회 경로, 성공한 예시 입력, prover 엔드포인트)가 공개되지 않았다. 예치 요청은 요청 검증 `SDKInvalidRequest()`에서 처음 막힌다. 차폐 흐름은 Clairveil v0.4.0 로컬에서 검증한다 | 무효한 증명을 담은 tx를 보내 연동 성공처럼 적는다. 비공개 구성 요소나 엔드포인트를 짐작한다. 로컬 결과를 테스트넷 성공으로 적는다 | `[Live Testnet]` `pnpm a:probe`, `[Local]` `pnpm a:local` |
| Privacy 호출 자격 | Privacy 정책은 `And(EAS_POLICY(kakaoIdHash 스키마), DENYLIST_POLICY)`. 호출자에게 개인 본인 인증 증명이 필요하고, 기관용 KYB 스키마는 없다 | Privacy 정책을 바꿀 수 있다고 본다(관리자 한 주소만 바꾼다) | `[Live Testnet]` `pnpm a:inspect` |
| OKRW 전송 | 네이티브 value로 보낸다(`{ to, value }`). 금고 입금도 `fund()`에 value를 싣는다 | 문서 배포 주소 표의 `OKRW_ERC20`(`0xEeee…EEeE`)을 ERC-20으로 부른다. 그 주소에는 코드가 없다 | `[Live Testnet]` `pnpm c:grounding` |
| 차폐 금액 | 노트 하나의 상한은 2^64-1 기본 단위, 약 18.45 OKRW | 큰 금액을 노트 하나로 예치한다 | `[Docs Only]` IPrivacy.deposit |
| Clairveil v0.4.0 인출 | 인출과 같은 블록에 잎을 더하는 tx(0 노트 예치)를 넣고, 예치를 먼저 보낸다 | 인출을 혼자 보낸다(`merkle root snapshot re-registration is inconsistent`) | `[Local]` `pnpm a:local --extras` |
| ClairveilJS EVM 프로필 | `evmSendGasLimit`를 추정값으로 바꾼다 | 기본값 `0x5208`(21,000)을 쓴다 | `[Live Testnet]` `pnpm a:probe-send-gas` |
| faucet 실패 | `pnpm a:probe-global`로 faucet 계정의 전역 24시간 한도와 `resetAt`을 확인한다 | 같은 요청을 계속 다시 보낸다 | `[Live Testnet]` |

## 문서와 다르게 동작한 곳

19건 전체와 재현 명령은 [SUBMISSION_NOTES의 발견한 차이](../../../SUBMISSION_NOTES.md#발견한-차이)에 있다. 코드에 바로 영향이 있는 것만 옮겼다.

| 문서 | 테스트넷 |
| --- | --- |
| `deployPclProxy`: 초기화가 필요 없으면 `"0x"` | 빈 초기화 데이터는 되돌려진다 |
| `withdraw` 금액 예시 `aokrw` | 테스트넷 단위는 `atokrw` |
| `eth_estimateGas`: 단순 전송은 `0x5208` | 일반 계정 약 104,000, 에이전트 지갑 약 284,000 |
| PCL 거절은 제출 시점에 걸러져 가스를 내지 않는다 | 컨트랙트 정책 거부는 블록에 들어가 가스 한도의 절반을 낸다 |
| `TransferLimit`은 aokrw 숫자 문자열 | 32바이트 uint256만 동작한다 |
| `getAgentIds`: 지갑에 등록된 agent ID | 연결된 에이전트 지갑 기준 |
| 배포 주소 표의 `OKRW_ERC20` `0xEeee…EEeE` | 코드가 없다. OKRW는 네이티브 value로 다룬다 |
| 아키텍처: 네이티브 프리컴파일 넷 | Privacy 프리컴파일 `0x1000…000b`가 있고 정책이 걸려 있다 |
| ERC-8004 호출 스케치: `bytes32 agentId`, `attest`, `revoke` | 배포된 레지스트리는 `uint256 agentId`, `register`, `setMetadata`, `setAgentWallet` |

## 확인 명령

레포 루트에서 실행한다. 지갑은 `pnpm setup:wallets`가 레포 밖 파일에 만든다. 개인키를 출력하지 않는다.

| 명령 | 하는 일 | tx |
| --- | --- | --- |
| `pnpm bootstrap`, `pnpm review` | 준비와 한 번에 확인(타입 검사, 테스트, 테스트넷 조회 넷, 워크샵 점검) | 없음 |
| `pnpm a:inspect`, `pnpm a:probe` | Privacy 정책, 요구 증명, 예치의 최초 실패 계층 | 없음 |
| `pnpm a:probe-global [보내는 주소] [받는 주소] [금액]` | 같은 전송을 `eth_call`과 `eth_estimateGas`로 비교 | 없음 |
| `pnpm a:probe-send-gas` | 단순 이체 가스, 21,000 전송, 여유분 | 1 OKRW 세 번 |
| `pnpm a:reject-gas` | 정책에 걸린 tx의 영수증(상태, 쓴 가스와 한도의 비율, 수수료) | 없음 |
| `pnpm a:kyb-gate` | PCL 프록시 금고와 KYB 증명의 거부·통과 흐름 전체 | 구매 기업 약 250 OKRW(협력사 A가 받는 100, 잔액이 30 아래인 협력사 두 지갑에 60씩 보충). 발급자 지갑까지 비어 있으면 약 310 OKRW |
| `pnpm c:agent-limit` | 에이전트 지갑 연결, `TransferLimit` 형식, 한도 안·초과 결제 | 약 30 OKRW |
| `pnpm c:judge <evidence.json> --track N` | 제출 증거를 테스트넷에서 다시 확인해 판정 | 없음 |
| `pnpm a:local [--extras]` | Clairveil v0.4.0 로컬 차폐 정산 전체 | 로컬 |

자세한 설명은 [기관 연동 가이드](../../../track-a-explain/integration-guide.md)(특히 1절의 층 표와 6절의 최초 실패 계층), [실행 레시피](../../../track-a-explain/runnable-recipe.md), [문서 개선 노트](../../../track-a-explain/documentation-improvement-notes.md)에 있다.
