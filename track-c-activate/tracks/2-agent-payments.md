# 트랙 2. 규칙 안의 에이전트 결제

- 기준과 표시: [포트폴리오](../portfolio.md) 머리말과 같습니다.

## 1. 트랙 이름

규칙 안의 에이전트 결제 (Agent Payments within Rules). 기기가 결제하는 갈래의 모집 이름은 "움직이는 에이전트의 지갑"입니다.

## 2. 핵심 주제

AI 에이전트와 기기가 등록된 신원과 소유자가 정한 한도 안에서만 원화를 쓰게 한다.

## 3. 문제 정의

에이전트에게 결제를 맡기려면 두 가지가 먼저 풀려야 합니다. 결제한 주체가 어떤 에이전트이고 누가 소유했는지 확인할 수 있어야 하고, 프롬프트 조작이나 오작동이 있어도 정해진 한도를 넘지 못해야 합니다. 앱 코드 안의 한도는 컨트랙트를 직접 부르는 호출을 막지 못합니다. Maroo는 ERC-8004 IdentityRegistry로 에이전트 신원을 기록하고, PCL의 에이전트 한도 템플릿으로 에이전트 지갑의 전송을 체인에서 거부합니다 `[Docs Only]`. 테스트넷 IdentityRegistry의 다음 agentId가 79라 에이전트 78개 안팎이 등록된 것으로 보이지만, 레지스트리로 간 마지막 tx는 2026-09-06입니다 `[Live Testnet]`. 이 트랙은 신원과 한도를 실제로 쓰는 에이전트 결제 제품을 만들게 합니다.

## 4. 대상 빌더

- LLM 도구 호출, MCP, 에이전트 프레임워크로 제품을 만드는 AI 에이전트 개발자
- 로봇, 드론, 충전기, IoT 기기를 다루는 피지컬 AI 개발자(기기 갈래)
- 결제와 구독 서비스를 만드는 백엔드 개발자

## 5. 적합한 활용 사례

- API 호출이나 데이터 구매마다 원화로 치르는 에이전트
- 소모품 재주문, 예약, 구독을 대신하는 구매 대행 에이전트
- 충전, 주차, 통행 요금을 스스로 치르는 기기(기기 갈래)
- 에이전트끼리 서비스를 사고파는 시장

## 6. 필수 Maroo primitive

Agent identity(ERC-8004 IdentityRegistry와 Agent 프리컴파일) 또는 MAWS, OKRW, PCL. EAS는 선택입니다(소유자 KYC 증명을 쓰면 가산).

## 7. 각 primitive가 필요한 이유

primitive마다 이 트랙에서 맡는 일과 그 서술의 근거 라벨을 적었습니다.

| primitive | 이 트랙에서 하는 일 | 근거 |
| --- | --- | --- |
| Agent identity | 에이전트 ID, 소유자, 에이전트 지갑, 한도 메타데이터(`TransferLimit`)를 체인에 둡니다. Agent 프리컴파일의 `getAgentIds(지갑)`로 지갑에서 에이전트를 찾습니다. 찾는 기준은 소유자가 아니라 연결된 에이전트 지갑입니다 | `[Live Testnet]` 등록, 지갑 연결, 조회 |
| OKRW | 에이전트가 치르는 대금 | `[Docs Only]` |
| PCL | `AGENT_OKRW_TRANSFER_LIMIT_POLICY`가 `TransferLimit`을 넘는 OKRW 전송을 `ExceededAgentTransferLimit`로 거부합니다. 전역 정책은 에이전트 소유자 기준으로 24시간 한도와 KYC를 평가합니다 | `[Live Testnet]` 한도 안 결제 성공과 초과 거부 tx(16절), 전역 정책 조회 |
| MAWS | 에이전트 지갑 발급, 키 보관, 체인 밖 사전 검사를 대신할 수 있습니다. 쓰면 R1의 등록을 대신합니다 | `[Docs Only]` |

## 8. 최소 연동 요건

제출물이 채워야 할 요건 여섯 가지입니다. 요건마다 내용, 확인하는 환경, 판정 방법을 적었습니다.

| 요건 | 내용 | 환경 | 판정 방법 |
| --- | --- | --- | --- |
| R1 신원 | IdentityRegistry에 에이전트를 등록하고 에이전트 지갑을 연결(또는 MAWS로 에이전트 생성) | `[Live Testnet]` | `register` tx와 `setAgentWallet` tx. 연결 전에는 `getAgentIds(소유자)`, 연결 뒤에는 `getAgentIds(에이전트 지갑)`이 그 ID를 돌려줌. 연결 뒤 소유자 주소로는 빈 목록이 나오고 `ownerOf`는 소유자 그대로(16절) |
| R2 한도 | `getMetadata(agentId, "TransferLimit")`에 한도를 쓰고, 제품 컨트랙트에 `AGENT_OKRW_TRANSFER_LIMIT_POLICY`를 묶음 | `[Live Testnet]` | `setMetadata` tx(값이 32바이트 uint256인지 판정 스크립트가 확인), `IPcl.contractPolicies(제품 컨트랙트)` |
| R3 결제 | 에이전트 지갑이 한도 안의 OKRW 결제를 성공 | `[Live Testnet]` | 성공 tx, value나 잔액 변화 |
| R4 거부 | 한도를 넘는 결제가 거부됩니다 | `[Live Testnet]` | 되돌려진 tx나 `eth_estimateGas` 기록의 `ExceededAgentTransferLimit(maxLimit, value)` |
| R5 에이전트 동작 | 거부를 받은 에이전트가 사유를 해석해 행동을 바꿈(사람에게 승인 요청, 작업 중단 등). 한도를 피하려고 금액을 쪼개 다시 보내지 않습니다 | 제품 | 데모와 에이전트 로그 |
| R6 기기 갈래 | 결제를 기기나 기기 시뮬레이터의 이벤트가 시작 | 제품 | 데모. 하드웨어는 선택 |

## 9. 제출자가 연동을 증명하는 방법

- `evidence.json`(형식은 [트랙 1의 23절](1-private-settlement.md#23-테스트넷-증거-요건))에 R1\~R4의 tx 해시를 적습니다.
- R5는 에이전트가 받은 오류 원문, 해석한 사유, 다음 행동을 한 줄씩 남긴 로그를 제출합니다.
- 기기 갈래는 기기 이벤트와 결제 tx를 잇는 로그를 둡니다.

## 10. 필수 제출 자료

- 공통 제출 자료([포트폴리오 4절](../portfolio.md#공통-제출-자료))
- 에이전트 ID, 소유자, 에이전트 지갑, `TransferLimit` 값을 적은 표
- 에이전트의 결제 결정 흐름(무엇을 보고 결제하고, 거부되면 무엇을 하는지)

## 11. 심사 기준과 배점

기준마다 배점과, 그 배점을 받는 제출이 갖춰야 할 모습을 적었습니다.

| 기준 | 배점 | 높은 점수를 받는 제출 |
| --- | --- | --- |
| 연동 깊이와 정확성 | 30 | 신원, 한도, 결제가 한 흐름으로 이어지고 전역 정책(소유자 기준 평가)까지 설명합니다 |
| 거부 이후의 에이전트 동작과 안전 설계 | 25 | 거부 사유별로 동작이 다르고, 프롬프트 조작 시나리오에서도 체인 한도가 마지막으로 막는 것을 보여 줍니다 |
| 증거와 재현성 | 20 | 자동 판정 통과, README 명령으로 재현 |
| 문제와 사용자 가치 | 15 | 사람이 에이전트에게 결제를 맡길 이유가 구체적임 |
| 완성도와 데모 | 10 | 성공 결제와 거부를 모두 보여 줍니다 |

## 12. 프로젝트 예시

1. 유료 API 결제 에이전트: 도구 호출마다 원화로 치르고, 한도를 넘는 호출은 사람에게 승인을 묻습니다.
2. 사무용품 재주문 에이전트: 재고가 줄면 주문하고, 건당 한도 안에서만 결제합니다.
3. 전기차 충전 결제(기기 갈래): 충전기가 에이전트 신원으로 요금을 청구하고, 차량 에이전트가 한도 안에서 치릅니다.
4. 배달 로봇 통행료(기기 갈래): 건물 출입과 엘리베이터 사용료를 로봇이 치르고, 관리 회사는 등록된 로봇만 받습니다.
5. 데이터 구매 시장: 에이전트가 다른 에이전트의 데이터를 사고, 판매 쪽은 등록된 에이전트인지 확인합니다.

## 13. 시작에 필요한 참고 자료

참가자가 읽을 문서와 레포의 명령을 모았습니다. 왼쪽 칸이 자료이고 오른쪽 칸이 그것을 쓰는 단계입니다.

| 자료 | 쓰는 곳 |
| --- | --- |
| [ERC-8004 IdentityRegistry](https://docs.maroo.io/concepts/agents/erc-8004-identity-registry/), [Agent 프리컴파일](https://docs.maroo.io/concepts/agents/agent-precompile-overview/) | 신원 구조와 조회 |
| [AGENT_OKRW_TRANSFER_LIMIT_POLICY](https://docs.maroo.io/concepts/compliance/pcl-template-agent-okrw-transfer-limit-policy/) | 한도 메타데이터와 거부 사유 |
| [두 층 정책 모델](https://docs.maroo.io/concepts/agents/two-layer-policy-model/), [MAWS 구조](https://docs.maroo.io/concepts/agents/maws-architecture-overview/) | MAWS를 쓸 때 |
| [탐색기에 검증된 IdentityRegistry 소스](https://explorer-testnet.maroo.io/address/0x8004000000000000000000000000000000000001?tab=contract) | 실제 함수 목록. 2026-09-26 판 문서의 호출 스케치가 배포본과 달라 이 소스를 기준으로 삼았고, 2026-10-23 판 문서는 배포본에 맞게 고쳐졌습니다 |
| `pnpm c:grounding` | 레지스트리, 프리컴파일, 템플릿, 전역 정책 조회와 등록 시뮬레이션. `--write`로 등록 tx 한 건 |
| `pnpm c:agent-limit` | R1\~R4를 테스트넷에서 한 번에 채우는 흐름(16절). Maroo 공식 SDK `@maroo-chain/viem`의 레지스트리 액션, `policy.agentOkrwTransferLimit`, `pcl.deployPclProxy`, `simulatePclProxy`를 씀 |
| `pnpm c:app` | 16절 흐름을 화면으로 옮긴 레퍼런스 앱(17절). 사전 검사, 거부 사유의 사용자 문구, 보냈는지 모르는 결제의 처리 |

## 14. 흔히 발생하는 무효 또는 피상적 연동

- 에이전트를 등록만 하고 결제나 한도에 쓰지 않은 제출
- 에이전트와 연결되지 않은 일반 지갑으로 결제한 제출
- 한도를 앱 코드나 LLM 프롬프트로만 지키고 체인 정책이 없는 제출
- `TransferLimit` 메타데이터를 썼지만 정책을 묶지 않아 거부 증거가 없는 제출
- 거부를 받은 에이전트가 금액을 쪼개 다시 보내 한도를 피한 제출
- 기기 갈래에서 기기와 결제의 연결이 영상 연출뿐인 제출

## 15. 보안, 프라이버시, 프로덕션 주의 사항

- 에이전트 지갑 키가 새면 한도까지는 결제가 일어납니다. 키는 MAWS나 기기의 보안 저장소에 두고 레포에 올리지 않습니다.
- 체인 한도는 건당 한도입니다 `[Docs Only]`. 누적 한도가 필요하면 전역 정책의 24시간 한도나 제품 컨트랙트의 기간 한도 정책을 함께 씁니다.
- `TransferLimit` 값은 OKRW 금액을 최소 단위(`atokrw`)로 환산해 32바이트 big-endian uint256으로 씁니다(viem: `numberToHex(한도, { size: 32 })`). 2026-09-26 판 Maroo Docs는 `aokrw` 단위의 숫자 문자열이라고 적었습니다. 이 값이나 빈 값이면 `AgentTransferLimitMetadataInvalid(expected 32-byte uint256, got 19 bytes)` 같은 해석 가능한 오류로 한도 안 결제까지 모두 거부됩니다 `[Live Testnet]` (16절). 2026-10-23 판 문서는 32바이트 `abi.encode(uint256)`와 타입 지정 오류 `AgentTransferLimitMetadataInvalid(string reason)`로 고쳐 적었습니다.
- `setAgentWallet`은 새 에이전트 지갑이 EIP-712(`AgentWalletSet(agentId, newWallet, owner, deadline)`)로 서명하고 소유자가 보냅니다 `[Live Testnet]`. 마감은 체인 블록 시각 기준 5분 안이어야 합니다. 블록 시각 +299초로 서명한 요청은 시뮬레이션을 통과했고 +301초는 `deadline too far`로 되돌려졌습니다 `[Live Testnet]` 시뮬레이션([기록](../evidence/live/agent-limit-20260926T053121Z.json) 1단계).
- 전역 정책은 에이전트가 보낼 때 소유자 모두가 24시간 1,000만 OKRW 안이거나 KYC 증명을 갖기를 요구합니다 `[Live Testnet]`. 시연 금액과 소유자 지갑을 이에 맞춰 준비합니다.
- 2026-09-26 판 Maroo Docs의 IdentityRegistry 호출 스케치(`bytes32 agentId`, `attest`, `revoke`)는 테스트넷에 배포된 컨트랙트(`uint256 agentId`, `register`, `setMetadata`, `setAgentWallet`)와 달랐습니다 `[Live Testnet]`. 2026-10-23 판 문서는 `uint256 agentId`와 `register`, `setMetadata`, `setAgentWallet` 선언으로 고쳤고, 레지스트리에 attestation이나 폐기 함수가 없다고 적습니다.
- 2026-09-26 판 Maroo Docs는 `getAgentIds`를 지갑에 등록된 agent ID를 돌려주는 역방향 조회라고만 적었고, 이 레포는 연결된 에이전트 지갑이 기준임을 테스트넷에서 확인했습니다 `[Live Testnet]`. 2026-10-23 판 [getAgentIds 문서](https://docs.maroo.io/apis/contract/agent-get-agent-ids/)는 에이전트 지갑이 기준이고 소유 목록이 아니라고 적습니다.
- 에이전트 메타데이터는 공개됩니다. 소유자의 개인정보를 넣지 않습니다.

## 16. 요건을 직접 채운 예시 `[Live Testnet]`

이 레포가 구매 기업 지갑과 에이전트 지갑으로 R1\~R4를 테스트넷에서 채웠습니다. 에이전트는 기존 정산 금고(`SettlementVault`)의 구매자 자리에 앉아 협력사 몫을 넣고, 금고의 `fund()`에 에이전트 한도 정책을 묶었습니다. 새 컨트랙트는 만들지 않았습니다.

```mermaid
sequenceDiagram
  autonumber
  participant O as 소유자 지갑(구매 기업)
  participant A as 에이전트 지갑
  participant R as IdentityRegistry
  participant P as PCL 프리컴파일
  participant V as 금고 프록시
  O->>R: register(agentURI), agentId 79
  A-->>O: EIP-712 서명(AgentWalletSet)
  O->>R: setAgentWallet(79, 에이전트 지갑, 마감, 서명)
  O->>R: setMetadata(79, TransferLimit, 32바이트 5 OKRW)
  O->>P: deployPclProxy(구매자 = 에이전트 지갑)
  O->>P: changeContractPolicies(fund()에 에이전트 한도 정책)
  A->>V: fund(협력사 A), 3 OKRW
  V-->>A: 성공
  A->>V: fund(협력사 A), 8 OKRW
  V-->>A: ExceededAgentTransferLimit(5, 8)로 거부
```

2026-09-26 04:40 UTC 실행 [기록](../evidence/live/agent-limit-20260926T044056Z.json), 재현: `pnpm setup:wallets`(AGENT 역할을 더함), `pnpm build:contracts`, `pnpm c:agent-limit`

| 요건 | 결과 | tx |
| --- | --- | --- |
| R1 등록 | agentId 79, 소유자 구매 기업 | [0x2c5a…bfad](https://explorer-testnet.maroo.io/tx/0x2c5a0170a44f6f09016ac70e584fb1f1998f7b1efd580afea0673a30624cbfad) |
| R1 지갑 연결 | `getAgentWallet(79)` = 에이전트 지갑. `getAgentIds(에이전트 지갑)` = `[79]`, `getAgentIds(소유자)` = `[]` | [0x7eb9…71bd](https://explorer-testnet.maroo.io/tx/0x7eb9967c2fcf3bd0211bc50b69a88892753eee80ee15cd593eec95e6478571bd) |
| R2 한도 | `TransferLimit` 5 OKRW(32바이트 uint256) | [0x2ea9…73e3](https://explorer-testnet.maroo.io/tx/0x2ea920e9d892552a2e677dd120d6b0d0a2425d5f72b6dc17b1d52f1bb09573e3) |
| R2 정책 | 금고 `0x5855C53f6b6359BDEB0306d9362488c54E6db7c1`의 `fund()`(`0x23024408`)에 `AGENT_OKRW_TRANSFER_LIMIT_POLICY` | [0xac02…5f44](https://explorer-testnet.maroo.io/tx/0xac021a9f55e633f5eeaf3548871eee1faa14ec3b3f02fed6f2781de0be1f5f44) |
| R3 결제 | 에이전트 지갑이 3 OKRW를 넣어 협력사 A 몫 3 OKRW | [0xfbfe…0787](https://explorer-testnet.maroo.io/tx/0xfbfe489ff4545f5d701310ab3f3153cefc15efc22d91813fc69ab89042650787) |
| R4 거부 | 8 OKRW가 `ExceededAgentTransferLimit(5000000000000000000, 8000000000000000000)`로 되돌려짐. 가스 한도 728,023 가운데 364,011 사용 | [0x006c…56b9](https://explorer-testnet.maroo.io/tx/0x006c9bae7cb92d04b2b9ba8f835ef81914ff81b91a5af2c51971b58a3c8856b9) |

`TransferLimit`에 세 가지 값을 차례로 쓰고, 에이전트 지갑의 `fund()`를 보내지 않고 확인한 결과입니다.

| `TransferLimit` 값 | 3 OKRW(한도 안) | 8 OKRW(한도 초과) |
| --- | --- | --- |
| 빈 값 | `AgentTransferLimitMetadataInvalid(empty metadata value)` | 같음 |
| 2026-09-26 판 Maroo Docs 형식: 숫자 문자열 `"5000000000000000000"`(19바이트) | `AgentTransferLimitMetadataInvalid(expected 32-byte uint256, got 19 bytes)` | 같음 |
| SDK 주석 형식: 32바이트 big-endian uint256 | 통과(추정 가스 502,449) | `ExceededAgentTransferLimit(5000000000000000000, 8000000000000000000)` |

- 세 경우 모두 `eth_call`(SDK `simulatePclProxy`)과 `eth_estimateGas`가 같은 결과를 냈습니다. 컨트랙트 범위의 에이전트 한도는 `eth_call`로도 미리 확인할 수 있습니다.
- 판정: `pnpm c:judge track-c-activate/evidence/track2-example/evidence.json --track 2`에서 R1\~R4 모두 통과했습니다([판정 결과](../evidence/track2-example/evidence.judge.json)). 2026-09-26 판 문서 형식으로 쓴 `setMetadata` tx를 넣으면 R2가 실패로 판정됩니다.
- 새 지갑 파일로 에이전트 등록(agentId 80)부터 다시 실행해도 같은 결과였습니다([등록 기록](../evidence/live/grounding-20260926T053055Z.json), [실증 기록](../evidence/live/agent-limit-20260926T053121Z.json)). 2026-10-23에 agentId 79로 다시 돌린 실행도 세 형식의 결과, 3 OKRW 성공, 8 OKRW `ExceededAgentTransferLimit`(가스 728,023 가운데 364,011 사용)가 같았습니다([실증 기록](../evidence/live/agent-limit-20261023T071452Z.json)).
- 한 번 실행에 약 31 OKRW가 듭니다. 2026-10-23 실행에서 구매 기업 20.24(금고 배포, 정책, 메타데이터 세 번, 에이전트 지갑으로 가스용 30을 옮긴 이체의 수수료), 에이전트 지갑 10.80(결제 3과 가스)이었습니다. 옮긴 30은 에이전트 지갑에 남아 셈에서 뺐습니다([실증 기록](../evidence/live/agent-limit-20261023T071452Z.json)의 「끝 잔액」 31.033479).
- 확인하지 않은 것: 전역 범위 정책에서 다른 컨트랙트가 에이전트가 시작한 호출을 옮길 때의 귀속, R5와 기기 갈래.

## 17. 화면이 있는 레퍼런스 앱 `[Live Testnet]`

16절의 흐름을 사람이 누르는 화면으로 옮긴 작은 웹 앱입니다. 소유자 칸에서 에이전트의 `TransferLimit`를 저장하고, 에이전트 칸에서 협력사 A 몫의 결제를 요청합니다. 앱 서버가 `eth_estimateGas`로 먼저 검사하고, 거절되면 거부 해석기(`shared/lib/explain.ts`)가 푼 사유를 사용자 문구로 바꿔 전표에 남깁니다. PCL 판정은 전표의 도장(승인, 거절, 실패, 보내지 않음, 확인 중)으로 보입니다.

```bash
pnpm c:agent-limit     # 16절. 에이전트 지갑 연결, 금고 배포, fund() 정책 바인딩을 먼저 한 번
pnpm c:app             # http://127.0.0.1:5175
pnpm c:app-record      # 전표 기록을 evidence/live/agent-app-<시각>.json 으로 남김
```

- 서명은 앱 서버가 레포 밖 역할 키(구매 기업, 에이전트 지갑)로 합니다. 브라우저에는 키와 지갑 창이 없고, 서버는 127.0.0.1에만 열립니다.
- 서버는 서명한 tx의 해시를 보내기 전에 계산합니다. 보낼 때 연결 자체가 안 되면(연결 거부, 주소를 찾지 못함) 노드에 닿지 않았으므로 「보내지 않음」으로 씁니다. 연결 뒤에 끊기거나 영수증이 대기 시간(기본 30초) 안에 오지 않으면 그 결제를 「확인 중」으로 두고, 결과를 확인할 때까지 결제 입력칸을 그리지 않고 새 결제도 받지 않습니다.
- 「결제 기록 다시 읽기」는 같은 해시의 영수증을 읽습니다. 영수증도 노드 대기열에도 없으면 서명해 둔 같은 tx(같은 해시)를 다시 보내고(Maroo 테스트넷은 블록에 들어가기 전의 tx를 조회에 보이지 않아 대기열에 있는 결제도 다시 보내게 되고, 노드는 `already known`으로 답합니다. 그때 화면은 「노드가 이 결제를 이미 받아 블록에 넣기를 기다리고 있어요」, 다시 보낸 결제를 노드가 받으면 「노드에서 이 결제를 찾지 못해 같은 결제를 다시 보냈어요」라고 씁니다), 같은 순번(논스)을 다른 tx가 이미 썼으면 그 결제는 더 들어갈 수 없으므로 「보내지 않음」으로 정리합니다. 확인 중 상태는 결과 전표를 쓴 뒤에만 풀어, 결과를 읽다 RPC가 끊겨도 두 번 결제되지 않습니다.
- 서버는 이 화면(`http://127.0.0.1:5175`)에서 온 요청만 받습니다. 다른 사이트가 브라우저를 시켜 보낸 요청(Origin)과 다른 이름으로 이 포트에 붙은 요청(Host)은 403으로 거절합니다.
- 대기 시간은 2026-10-23에 잰 값으로 정했습니다. 테스트넷 블록 간격은 1\~2초였고, 영수증까지 걸린 시간은 결제 세 건에서 1.7\~3.3초였습니다.
- 화면: [1440px](../agent-limit-app/screenshots/desktop-1440.png), [390px](../agent-limit-app/screenshots/mobile-390.png). 디자인 참고 이미지는 writing-guides 트렌드 라이브러리 2026-10의 Recent Design 인증 도장 묶음(도장으로 찍는 판정)과 Awwwards의 NEUTOMNI, Signal-A(한 장 위의 굵은 숫자와 글자)입니다.

같은 날 앱에서 일으킨 경우와 전표에 나온 문구입니다. tx 열은 그 결제가 블록에 들어갔는지입니다.

| 경우 | 일으킨 방법 | 전표 문구(앞부분) | tx |
| --- | --- | --- | --- |
| 한도 안 결제 | 한도 5 OKRW에서 3 OKRW | 협력사 A 몫으로 금고에 3 OKRW를 넣었어요. 가스비(fee)는 4.36779 OKRW였어요 | 블록에 들어간 tx |
| 한도 초과 | 8 OKRW | 한도(5 OKRW)보다 큰 금액(8 OKRW)을 요청해서 PCL이 결제를 거절했어요. 사전 검사에서 막혀 tx를 보내지 않았고 가스비(fee)도 나가지 않았어요 | 보내지 않은 결제 |
| 한도 형식 오류 | 「옛 문서 형식(숫자 문자열)으로 저장」 뒤 3 OKRW | 에이전트 한도 값의 형식이 맞지 않아 PCL이 결제를 거절했어요 | 보내지 않은 결제 |
| 노드가 받지 않는 가스 한도 | 가스 한도 21,000 | 가스 한도(21,000)가 이 호출의 최소 가스(21,432)보다 작아 노드가 결제 tx를 받지 않았어요 | 보내지 않은 결제 |
| 가스 부족 | 가스 한도 60,000 | 가스 한도(60,000)가 모자라 결제가 블록에서 실패했어요. 결제 금액은 나가지 않았고 가스비(fee) 0.535842 OKRW는 나갔어요 | 블록에 들어가 되돌려진 tx |
| 잔고 부족 | 한도 100 OKRW에서 60 OKRW(잔고 약 50 OKRW) | 에이전트 지갑의 OKRW가 모자라 보내지 않았어요 | 보내지 않은 결제 |
| RPC 끊김 | 닫힌 포트를 RPC로 둔 서버 | Maroo 테스트넷 RPC에 연결하지 못해 결제를 보내지 않았어요 | 보내지 않은 결제 |
| 보냈는지 모름 | 영수증 대기 시간 1ms(`RECEIPT_TIMEOUT_MS=1`) | 결제를 보냈지만 블록에 들어갔는지 아직 확인하지 못했어요. 「결제 기록 다시 읽기」로 같은 결제를 승인으로 확인했습니다 | 블록에 들어간 tx |

같은 날 16:58(KST)에 RPC 장애를 일으키는 시험용 프록시(`node track-c-activate/agent-limit-app/test-rpc-proxy.ts`)를 테스트넷 RPC 앞에 두고 일으킨 경우입니다. 열은 위 표와 같습니다.

| 경우 | 일으킨 방법 | 전표 문구(앞부분) | tx |
| --- | --- | --- | --- |
| 사전 검사에 답하지 않는 RPC | `eth_estimateGas`에 HTTP 429를 돌려주는 프록시 | Maroo 테스트넷 RPC가 사전 검사 요청에 답하지 않아(HTTP 429) 결제를 보내지 않았어요 | 보내지 않은 결제 |
| 노드에 닿기 전에 끊긴 보내기 | 보내기 요청을 넘기지 않고 연결을 끊는 프록시 | 확인 중. 첫 다시 읽기가 같은 tx를 다시 보냈고, 둘째 다시 읽기에서 「협력사 A 몫으로 금고에 1 OKRW를 넣었어요」 | 블록에 들어간 tx 한 건 |
| 같은 논스를 다른 tx가 쓴 끊긴 보내기 | 위와 같이 끊은 뒤 에이전트 지갑에서 먼저 보낸 다른 tx | 확인 중이던 결제는 블록에 들어가지 않았어요. 같은 순번(논스)을 다른 tx가 먼저 써서 이 결제는 더 들어갈 수 없어요 | 블록에 들어가지 않은 결제 |
| 노드가 받은 뒤 끊긴 응답 | 노드에 넘긴 뒤 응답 전에 연결을 끊는 프록시 | 확인 중. 다시 읽기에서 「협력사 A 몫으로 금고에 1 OKRW를 넣었어요」 | 블록에 들어간 tx |
| 다른 사이트의 요청 | Origin `https://evil.example`, Host `evil.example:5176` | 이 서버의 화면에서만 요청할 수 있어요(403) | 보내지 않은 결제 |
| 숫자가 아닌 가스 한도 | 가스 한도 `abc` | 가스 한도는 비워 두거나 양의 정수로 입력해 주세요 | 보내지 않은 결제 |

- 근거: [전표 기록](../evidence/live/agent-app-20261023T062617Z.json), 프록시 시험을 더한 [전표 기록](../evidence/live/agent-app-20261023T080142Z.json)(전표 23\~29). 가스 한도 60,000 결제를 처음 보냈을 때(전표 7) 거부 해석기는 「데이터 없는 되돌림」으로 풀었습니다. 그 tx는 가스 59,538 / 60,000(99.2%)을 쓰고 데이터 없이 되돌려졌습니다. 하위 호출이 받은 가스를 다 쓰면 쓴 가스와 한도가 같지 않게 됩니다. 해석기가 가스 한도 없이 같은 상태로 다시 실행해 통과하면 가스 부족으로 판정하게 고친 뒤 같은 조건으로 다시 보낸 결과가 전표 8입니다.
- 에이전트 지갑의 `fund()` 한 건은 가스비(fee) 약 4.37 OKRW였습니다. 노드가 보내기 전에 요구하는 잔고는 결제 금액에 가스 한도 × 최대 수수료를 더한 값이라, 60 OKRW 결제에는 약 72.3 OKRW가 필요했습니다.
