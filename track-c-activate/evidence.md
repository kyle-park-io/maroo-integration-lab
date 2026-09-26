# Track C 증거 목록

세 트랙의 최소 연동 요건이 테스트넷에서 실제로 채워질 수 있는지 확인한 기록입니다. 시각은 UTC입니다.

## 1. 기술 근거 조회 `[Live Testnet]`

| 항목 | 내용 |
| --- | --- |
| 명령 | `pnpm c:grounding`, `pnpm c:grounding --write` |
| 기록 | [grounding-20260925T194211Z.json](evidence/live/grounding-20260925T194211Z.json)(조회), [grounding-20260926T000418Z.json](evidence/live/grounding-20260926T000418Z.json)(조회와 등록 tx) |
| 네트워크 | Maroo 테스트넷, chain ID 450815, RPC `https://rpc-testnet.maroo.io` |
| 실행 시각 | 2026-09-25 19:42, 2026-09-26 00:04 |
| 호출 | `IPcl.policyTemplate`(템플릿 9개와 없는 ID 하나), `IPcl.getParams`, `IPcl.globalPolicies`, `IPcl.contractPolicies(Privacy)`, `IPcl.globalPeriodicVolume(구매 기업, atokrw, 86400)`, 빈 예치 요청의 `eth_call`과 `eth_estimateGas`, `IAgent.getParams`, `IAgent.getAgentIds`, IdentityRegistry `name`·`symbol`·`getVersion`과 `register(string)` 시뮬레이션, `IOkrw.getParams`, `IEas.getParams`, SchemaRegistry `getSchema`, 탐색기 API 두 건 |
| 트랜잭션 | `--write` 실행에서 구매 기업 지갑이 IdentityRegistry `register(string)` 한 건을 보냄. [0x2c5a…bfad](https://explorer-testnet.maroo.io/tx/0x2c5a0170a44f6f09016ac70e584fb1f1998f7b1efd580afea0673a30624cbfad), 블록 19111740, 성공, agentId 79. 등록 직후 `IAgent.getAgentIds(구매 기업)`이 `[79]`를 돌려줌 |

## 2. 요건별로 확인한 것

| 트랙 | 요건 | 테스트넷에서 확인한 것 | 결과 |
| --- | --- | --- | --- |
| 1 | R3, R5 | Privacy 프리컴파일 정책 | `And(EAS_POLICY(kakaoIdHash 스키마), DENYLIST_POLICY(0개 주소))`, 관리자 `0x58eC…804F` |
| 1 | R5 | 빈 예치 요청의 최초 실패 계층 | `eth_call`과 `eth_estimateGas` 모두 `SDKInvalidRequest()` |
| 1 | 심사 | 탐색기 API로 Privacy tx를 확인하는 경로 | 최근 50건 모두 `ok/success`, 마지막 2026-09-21 04:40 |
| 2 | R1 | 에이전트 등록 tx | `register(string)` 성공, agentId 79(시뮬레이션이 예측한 번호와 같음), 등록한 지갑의 `getAgentIds`가 바로 `[79]` |
| 2 | R1 | Agent 프리컴파일과 IdentityRegistry | 레지스트리 `0x8004…0001`(AgentIdentity, preinstall-1.0.0), `register(string)` 시뮬레이션 통과(다음 agentId 79) |
| 2 | R2, R4 | 에이전트 한도 템플릿 | `AGENT_OKRW_TRANSFER_LIMIT_POLICY` 등록됨 |
| 2 | R1 | 에이전트 지갑 연결(`pnpm c:agent-limit`) | `setAgentWallet` 성공. 연결 뒤 `getAgentIds(에이전트 지갑)` = `[79]`, `getAgentIds(소유자)` = `[]`, `ownerOf(79)`는 구매 기업 그대로 ([기록](evidence/live/agent-limit-20260926T044056Z.json)) |
| 2 | R2~R4 | 한도, 정책, 결제, 거부(`pnpm c:agent-limit`) | `TransferLimit` 5 OKRW(32바이트 uint256), 금고 `fund()`에 에이전트 한도 정책, 3 OKRW 결제 성공, 8 OKRW 결제 `ExceededAgentTransferLimit(5e18, 8e18)`로 되돌려짐 ([기록](evidence/live/agent-limit-20260926T044056Z.json), [트랙 2 16절](tracks/2-agent-payments.md#16-요건을-직접-채운-예시-live-testnet)) |
| 2 | 주의 사항 | 전역 정책의 에이전트 소유자 평가 | `ForEach(Every, AgentOwners, Or(24시간 1,000만 OKRW, KYC 증명))`, `ForEach(Any, AgentOwners, KYC 증명)` |
| 2 | 문제 정의 | 레지스트리 활동 | 최근 50건(`register` 22, `setMetadata` 15, `setAgentURI` 11, 실패 2), 마지막 2026-09-06 18:15 |
| 3 | R2, R4 | 정책 템플릿 | `EAS_POLICY`, `VOLUME_POLICY`, `PERIODIC_VOLUME_POLICY`, `LOGICAL_POLICY`, `FOR_EACH_POLICY` 등록됨. 없는 ID는 되돌려짐 |
| 3 | 문제 정의, R5 | 전역 정책의 무인증 한도 | 건당 `VOLUME_POLICY(atokrw 0~2,000,000)`, 24시간 `PERIODIC_VOLUME_POLICY(atokrw ≤ 10,000,000)`, 둘 다 KYC 증명이 있으면 면제 |
| 3 | R5 | 주소별 24시간 사용량 조회 | 구매 기업 사용량 0, 한도 1,000만 OKRW, 초기화 시각 1790380800 |
| 3 | R1 | EAS 주소 | SchemaRegistry `0x1000…0006`, EAS `0x1000…0007`, Indexer `0x1000…0008` |

## 3. 문서와 다르게 동작한 것

| 문서 | 테스트넷 | 트랙 문서에 반영한 곳 |
| --- | --- | --- |
| `OKRW_EAS_TRANSFER_LIMIT_POLICY`와 `OKRW_EAS_PERIODIC_VOLUME_LIMIT_POLICY`는 체인에서 지워졌다 | 두 ID 모두 `policyTemplate`이 이름과 설명을 돌려줌 | 트랙 3은 두 템플릿을 요건에 쓰지 않음 |
| 배포 주소 표의 `OKRW_ERC20` `0xEeee…EEeE` | 코드가 없고 ERC-20 조회가 빈 값을 돌려줌 | 세 트랙 모두 OKRW는 네이티브 value로 다룸 |
| IdentityRegistry 호출 스케치: `bytes32 agentId`, `attest`, `revoke` | 배포된 컨트랙트는 `uint256 agentId`, `register`, `setMetadata`, `setAgentWallet`을 쓰고 `attest`, `revoke`가 없음 | 트랙 2의 참고 자료와 주의 사항 |
| ERC-8004 Reputation은 V1에 없다 | `IAgent.getParams`가 ReputationRegistry `0x8004…0002`를 돌려주고 그 주소에 코드가 있음 | 트랙 2는 Reputation을 요건에 쓰지 않음 |
| 전역 정책의 건당 한도가 체인 설정으로 적혀 있지 않음 | 무인증 건당 200만 OKRW | 포트폴리오의 테스트넷 조건, 트랙 3 문제 정의 |
| `TransferLimit`은 aokrw 금액의 숫자 문자열 | 숫자 문자열은 `AgentTransferLimitMetadataInvalid(expected 32-byte uint256, got 19 bytes)`로 한도 안 결제까지 거부. 32바이트 uint256만 동작 | 트랙 2 R2, 15절, 16절. 판정 스크립트가 값 길이를 확인 |
| 메타데이터가 없거나 잘못되면 해석할 수 없는 문자열 사유로 되돌림 | 해석 가능한 오류 `AgentTransferLimitMetadataInvalid(string)`로 되돌림(빈 값이면 `empty metadata value`) | 트랙 2 15절 |
| `getAgentIds`: "지갑에 등록된 agent ID" | 연결된 에이전트 지갑 기준. 에이전트 지갑을 연결하면 소유자 주소로는 빈 목록 | 트랙 2 R1 |

## 4. 검증하지 못한 것

- 전역 범위 정책에서 다른 컨트랙트가 에이전트가 시작한 호출을 옮길 때 한도가 에이전트에게 귀속되는지. 트랙 2 실증은 컨트랙트 범위에서 에이전트 지갑이 직접 보낸 경우만 확인했습니다.
- `setAgentWallet` 마감이 5분을 넘을 때의 거부. SDK 주석으로만 확인했습니다.
- 외부에서 유효한 Privacy 상태 변경. 회로 산출물과 차폐 상태 조회 경로가 공개되지 않았습니다. 트랙 1의 R1은 이 때문에 로컬 경로를 허용합니다.

## 5. 심사 자동 판정 예시 `[Live Testnet]` 조회

| 항목 | 내용 |
| --- | --- |
| 명령 | `pnpm c:judge-example`(Track A 기록을 트랙 1 형식으로 옮긴 뒤 `pnpm c:judge --track 1`) |
| 입력 | [evidence.json](evidence/judge-example/evidence.json): 로컬 항목 셋(R1, R2), 금고 tx 넷(R3 거부 둘과 통과 하나, R4 입금), Privacy 최초 실패 기록 하나(R5) |
| 결과 | [evidence.judge.json](evidence/judge-example/evidence.judge.json): R1~R5 모두 통과. 거부 tx 둘은 직전 블록 상태로 다시 시뮬레이션해 `EasNoAttestationReceived`, `EasAttestationRevoked`가 적힌 사유와 같았고, 금고의 `claim()` 선택자(`0x4e71d92d`)에 `EAS_POLICY`가 묶여 있음을 확인 |
| 시험한 실패 경우 | 공개 레지스트리 tx에 부풀린 거부 사유(`ExceededAgentTransferLimit`)를 붙인 항목은 재시뮬레이션 사유와 달라 실패로 판정(2026-09-26 05시, 레포에는 남기지 않음) |

트랙 2는 이 레포가 직접 채운 기록으로 판정했습니다.

| 항목 | 내용 |
| --- | --- |
| 명령 | `pnpm c:agent-limit`가 만든 입력으로 `pnpm c:judge track-c-activate/evidence/track2-example/evidence.json --track 2` |
| 입력 | [evidence.json](evidence/track2-example/evidence.json): 등록과 지갑 연결(R1), `setMetadata`와 정책 바인딩(R2), 한도 안 결제(R3), 한도 초과 결제(R4) |
| 결과 | [evidence.judge.json](evidence/track2-example/evidence.judge.json): R1~R4 모두 통과. 거부 tx는 직전 블록 재시뮬레이션에서 `ExceededAgentTransferLimit(5e18, 8e18)`, 금고 `fund()`(`0x23024408`)에 정책이 묶여 있고 `TransferLimit`이 32바이트 uint256 |
| 시험한 실패 경우 | Maroo Docs 형식(숫자 문자열)으로 쓴 `setMetadata` tx를 R2 항목으로 넣으면 "TransferLimit 값이 19바이트"로 실패 판정(2026-09-26, 레포에는 남기지 않음) |

## 6. 보조 증거

| 항목 | 라벨 | 위치 |
| --- | --- | --- |
| 트랙 1 첫 성공 경로의 기준 구현(로컬 차폐 정산) | `[Local]` | [Track A 로컬 실행 기록](../track-a-explain/evidence/local/vendor-settlement-20260925T181924Z.md), `pnpm a:local` |
| 트랙 1, 3의 PCL 프록시 금고와 KYB 정책 흐름 | `[Live Testnet]` | [금고 흐름 스크립트](../track-a-explain/recipe/pcl-kyb-gate.ts), `pnpm a:kyb-gate` |
