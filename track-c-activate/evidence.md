# Track C 증거 목록

세 트랙의 최소 연동 요건이 테스트넷에서 실제로 채워질 수 있는지 확인한 기록입니다. 시각은 UTC입니다.

## 1. 기술 근거 조회 `[Live Testnet]`

| 항목 | 내용 |
| --- | --- |
| 명령 | `pnpm c:grounding` |
| 기록 | [grounding-20260925T194211Z.json](evidence/live/grounding-20260925T194211Z.json) |
| 네트워크 | Maroo 테스트넷, chain ID 450815, RPC `https://rpc-testnet.maroo.io` |
| 실행 시각 | 2026-09-25 19:42 |
| 호출 | `IPcl.policyTemplate`(템플릿 9개와 없는 ID 하나), `IPcl.getParams`, `IPcl.globalPolicies`, `IPcl.contractPolicies(Privacy)`, `IPcl.globalPeriodicVolume(구매 기업, atokrw, 86400)`, 빈 예치 요청의 `eth_call`과 `eth_estimateGas`, `IAgent.getParams`, `IAgent.getAgentIds`, IdentityRegistry `name`·`symbol`·`getVersion`과 `register(string)` 시뮬레이션, `IOkrw.getParams`, `IEas.getParams`, SchemaRegistry `getSchema`, 탐색기 API 두 건 |
| 트랜잭션 | 없음. `--write`를 주면 에이전트 등록 tx 한 건을 보냅니다(테스트넷 OKRW 필요) |

## 2. 요건별로 확인한 것

| 트랙 | 요건 | 테스트넷에서 확인한 것 | 결과 |
| --- | --- | --- | --- |
| 1 | R3, R5 | Privacy 프리컴파일 정책 | `And(EAS_POLICY(kakaoIdHash 스키마), DENYLIST_POLICY(0개 주소))`, 관리자 `0x58eC…804F` |
| 1 | R5 | 빈 예치 요청의 최초 실패 계층 | `eth_call`과 `eth_estimateGas` 모두 `SDKInvalidRequest()` |
| 1 | 심사 | 탐색기 API로 Privacy tx를 확인하는 경로 | 최근 50건 모두 `ok/success`, 마지막 2026-09-21 04:40 |
| 2 | R1 | Agent 프리컴파일과 IdentityRegistry | 레지스트리 `0x8004…0001`(AgentIdentity, preinstall-1.0.0), `register(string)` 시뮬레이션 통과(다음 agentId 79) |
| 2 | R2, R4 | 에이전트 한도 템플릿 | `AGENT_OKRW_TRANSFER_LIMIT_POLICY` 등록됨 |
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

## 4. 검증하지 못한 것

- 에이전트 등록, `TransferLimit` 메타데이터, 에이전트 한도 거부의 상태 변경 tx. 테스트넷 faucet이 전역 한도에 걸려 잔액이 없었습니다. `pnpm c:grounding --write`가 등록 tx를 맡고, 한도 거부는 트랙 2 참가자 요건으로 남깁니다.
- 외부에서 유효한 Privacy 상태 변경. 회로 산출물과 차폐 상태 조회 경로가 공개되지 않았습니다. 트랙 1의 R1은 이 때문에 로컬 경로를 허용합니다.

## 5. 보조 증거

| 항목 | 라벨 | 위치 |
| --- | --- | --- |
| 트랙 1 첫 성공 경로의 기준 구현(로컬 차폐 정산) | `[Local]` | [Track A 로컬 실행 기록](../track-a-explain/evidence/local/vendor-settlement-20260925T181924Z.md), `pnpm a:local` |
| 트랙 1, 3의 PCL 프록시 금고와 KYB 정책 흐름 | `[Live Testnet]` | [금고 흐름 스크립트](../track-a-explain/recipe/pcl-kyb-gate.ts), `pnpm a:kyb-gate` |
