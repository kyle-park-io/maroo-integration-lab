# SUBMISSION_NOTES

- 기준: Maroo Docs(2026-09-25 확인), Maroo 테스트넷(chain ID 450815), Clairveil v0.4.0 `ca85b02708fdd75259d4d2ee2d671c21198cec69`
- 표시: `[Live Testnet]`, `[Local]`, `[코드 대조]`, `[Docs Only]`, 권고. 테스트넷 시뮬레이션은 `[Live Testnet]` 옆에 호출 방법(`eth_call`, `eth_estimateGas`)을 함께 적었습니다. 뜻은 [README](README.md#증거-라벨)에 있습니다.

## Assumptions / Discrepancies

### 공통

- 사례: 세 트랙 모두 비공개 공급업체 정산을 씁니다. 구매 기업이 협력사 여러 곳에 대금을 치르는 1:N 기업 지급이고, 협력사별 단가와 거래처는 기업이 영업비밀로 관리하는 정보라 차폐가 필요한 이유가 분명합니다.
- 자료의 기준: 테스트넷 주소, ABI, 호출 방식은 Maroo Docs를 따릅니다. 차폐 풀의 구조와 흐름은 Clairveil v0.4.0으로 배우고 로컬에서 재현합니다. 둘이 다르면 아래 "발견한 차이"에 재현 방법과 함께 적었습니다.
- Clairveil 버전: clairveil-samples `8321ded`가 맞춰 둔 조합(Clairveil v0.4.0, ClairveilJS `faf220d5`)을 썼습니다. Maroo `IPrivacy`의 전송 요청 필드가 v0.4.0 `MsgTransfer`와 같고 v0.5.x(`privacy/v2`)와 다른 것도 이 선택을 받칩니다 `[Live Testnet]` ABI 대조.
- 실제 구현, 제안, 모의 구현의 구분
  - 실제로 실행한 것: 레포의 모든 명령과 그 기록(`evidence/`). 테스트넷 조회와 시뮬레이션, 로컬 체인 tx.
  - 제안: 문서에 "권고"로 표시한 설계와 절차, A의 4~8주 PoC 설계, B의 진행자 운영 방식, C의 스타터 키트 명세.
  - 모의 구현: 없습니다. 테스트넷에 기관용 KYB 발급자가 없어 이 레포의 `ISSUER` 역할이 시험용 KYB 스키마(`bytes32 bizRegNoHash, bool kybVerified`)를 등록하고 증명을 발급합니다. 실제 사업자 확인을 거친 증명이 아니라서 문서에는 "시험용 발급자"로 적습니다.
  - 시뮬레이션: 유효한 증명 없이 부른 Privacy 호출(`eth_call`, `eth_estimateGas`)은 거부 경로 증거로만 씁니다. 무효한 증명을 담은 tx는 보내지 않았습니다.
- 의도적으로 제외한 범위: 새 ZK 회로, Clairveil 코드 수정, 프로덕션 지갑과 키 관리, 완성된 프론트엔드, 비공개 Maroo 구성 요소의 추측과 역공학, 메인넷, 법률 자문과 규제 적합성 판단.
- 카카오 본인 인증: 테스트넷 Privacy 정책이 개인 본인 인증 증명을 요구해, 인증 전용 지갑 하나로만 진행하고 그 주소는 레포에 쓰지 않습니다.

### A

- 독자: 대기업 구매·재무 조직, 또는 그 지급 시스템을 운영하는 은행과 핀테크의 시니어 백엔드 엔지니어. TypeScript와 EVM 도구에 익숙하고, 4~8주 PoC 뒤 보안·컴플라이언스·운영·제품 팀에 설명해야 하는 사람으로 가정했습니다.
- 이 독자는 공개 체인 결제에서 금액과 거래 관계가 드러나는 것을 가장 먼저 걱정하고, 그다음으로 감사 가능성과 키 책임을 묻는다고 봤습니다. 가이드 0절의 네 질문이 이 가정에서 나왔습니다.

### B

- 참가자: 기관의 실무 엔지니어 10~30명. TypeScript 백엔드 경험이 있고 지갑과 트랜잭션을 한 번 이상 다뤄 본 사람으로 가정했습니다.
- Clairveil 빌드는 학습 목표가 아니라서 사전 준비(`pnpm b:prepare`)로 뺐습니다. faucet이 멈출 수 있어 진행자 지갑 배분(`pnpm b:fund`)을 기본 경로로 두었습니다.

### C

- 빌더: 핀테크·결제 백엔드, AI 에이전트, 피지컬 AI(기기), 커머스·서비스 개발자. 크립토 밖에서 오는 개발자도 첫 성공까지 갈 수 있게 Flagship의 첫 성공 경로를 로컬 참조 경로로 두었습니다.
- 행사 운영 조건(참가 인원, 기간, 상금)은 정하지 않았습니다. 트랙 설계와 판정 기준은 이 조건과 관계없이 쓰이게 했습니다.

### 발견한 차이

| # | 자료 | 자료가 말하는 것 | 실행 결과 | 재현 | 반영한 곳 |
| --- | --- | --- | --- | --- | --- |
| 1 | Maroo Docs 테스트넷 접근 | KYC 서비스를 "KYC (mock)"으로만 적음 | Privacy 프리컴파일 정책이 `And(EAS_POLICY(bytes32 kakaoIdHash, uint8 version), DENYLIST_POLICY)`라 호출자는 개인 본인 인증 증명이 필요. 카카오 인증을 마친 지갑이 실제로 이 스키마의 증명을 받음 | `pnpm a:inspect`, `pnpm a:probe-kyc` | A 문서 개선 노트 1 |
| 2 | Maroo Docs 사유 코드 | 사전 검사 방법을 적지 않음 | `eth_call`은 전역 정책을 평가하지 않고 `eth_estimateGas`는 평가 | `pnpm a:probe-global` | A 문서 개선 노트 2, FAQ 6 |
| 3 | Maroo Docs `deployPclProxy` | 초기화가 필요 없으면 `"0x"`를 넘기라고 적음 | 빈 초기화 데이터는 Transparent, UUPS 모두 `execution reverted` | `pnpm a:doc-claims` | A 문서 개선 노트 3 |
| 4 | Maroo Docs `withdraw` | 금액 예시가 `aokrw` | 테스트넷 `mintDenom`은 `atokrw` | `pnpm a:doc-claims` | A 문서 개선 노트 4 |
| 5 | Maroo Docs 배포 주소, 아키텍처 | 프리컴파일 넷, 주소 표에 Privacy 없음 | Privacy 프리컴파일 `0x…0b`에 정책이 묶여 있음 | `pnpm a:doc-claims` | A 문서 개선 노트 5 |
| 6 | Clairveil v0.4.0 스모크 스크립트 | 통과로 끝남 | 같은 흐름에서 단독 인출이 `merkle root snapshot re-registration is inconsistent`로 실패. 같은 블록에 잎을 더하는 tx를 넣으면 성공 | `pnpm a:local` | A 문서 개선 노트 6, B T10 |
| 7 | Maroo Docs PCL 템플릿 | `OKRW_EAS_*` 템플릿 둘은 체인에서 지워졌다 | 테스트넷 `policyTemplate`이 두 ID에 이름과 설명을 돌려줌. 없는 ID는 되돌려짐 | `pnpm c:grounding` | C evidence 3절 |
| 8 | Maroo Docs 배포 주소 | `OKRW_ERC20` `0xEeee…EEeE` | 코드가 없고 ERC-20 조회가 빈 값 | `pnpm c:grounding` | C evidence 3절 |
| 9 | Maroo Docs ERC-8004 | `register(...) returns (bytes32 agentId)`, `attest`, `revoke` | 배포된 `PreinstallIdentityRegistry`는 `uint256 agentId`, `register(string)`, `setMetadata`, `setAgentWallet`. `attest`, `revoke` 없음 | 탐색기 검증 소스, `pnpm c:grounding` | C 트랙 2 |
| 10 | Maroo Docs ERC-8004 | Reputation은 V1에 없음 | `IAgent.getParams`가 ReputationRegistry `0x8004…0002`를 돌려주고 코드가 있음 | `pnpm c:grounding` | C evidence 3절 |
| 11 | Maroo Docs 전역 정책 | 건당 한도를 체인 설정으로 적지 않음 | 전역 정책에 KYC 증명이 없는 계정의 건당 200만 OKRW 한도(`VOLUME_POLICY`) | `pnpm c:grounding` | C 포트폴리오, 트랙 3 |
| 12 | Maroo Docs와 Clairveil | 서로를 언급하지 않음 | Maroo `IPrivacy` ABI(함수 9, 이벤트 5)가 ClairveilJS의 정식 EVM Privacy 계약 v0.3.1과 정규화 해시까지 같음. 전송 요청 필드도 Clairveil v0.4.0 `MsgTransfer`와 대응 | `pnpm a:abi-compare`, `pnpm a:inspect` | A 가이드 1절 |
| 13 | faucet | 요청하면 5,000 tOKRW | 2026-09-25 16:41 UTC부터 실패. faucet 계정이 전역 24시간 한도를 다 썼고 KYC 증명이 없음. `resetAt`(2026-09-26 00:00 UTC) 뒤 22초에 요청해 받음 | `pnpm a:probe-global` | DX 3, B 증거 |
| 14 | Maroo Docs EAS 연동 | 증명 발급 뒤 색인이 필요하다는 순서와 재발급 때의 동작을 적지 않음 | 새 증명을 색인하기 전에는 PCL이 색인된 옛 증명을 봐서, 폐기된 옛 증명이 있으면 `EasAttestationRevoked`로 거부 | `pnpm a:kyb-gate`를 같은 지갑으로 두 번 | A FAQ 5, B T8 |
| 15 | Maroo Docs 개발자 도구 | 코드 예시가 `@maroo-chain/contracts` ABI로 직접 인코딩함(2026-09-26 판 63쪽). `@maroo-chain/viem`은 한 쪽에도 나오지 않음 | npm의 `@maroo-chain/viem` 0.4.0(2026-09-17)이 PCL 정책 작성과 해석, 프록시 배포, 프록시 호출 시뮬레이션, PCL 거부 해석, ERC-8004 레지스트리 액션을 제공. 금고 흐름에 써 보니 직접 인코딩과 calldata가 같음 | `pnpm test:unit`, npm 패키지 | A 가이드 1절, DX 10 |
| 16 | Maroo Docs `eth_estimateGas` | 단순 전송은 `0x5208`(21,000)을 돌려줌 | 1 OKRW 이체의 추정치가 일반 계정 104,017, 에이전트 지갑 283,560. 21,000으로 보내면 블록에 들어가 되돌려지고 수수료 0.189 OKRW. 가스 21,000 `eth_call`은 통과. ClairveilJS 기본 `evmSendGasLimit`도 21,000 | `pnpm a:probe-send-gas` | A 문서 개선 노트 7, FAQ 6, C 트랙 1 15절 |
| 17 | Maroo Docs `AGENT_OKRW_TRANSFER_LIMIT_POLICY` | `TransferLimit`은 aokrw 숫자 문자열이고, 메타데이터가 없거나 잘못되면 해석할 수 없는 문자열 사유로 되돌림 | 숫자 문자열은 `AgentTransferLimitMetadataInvalid(expected 32-byte uint256, got 19 bytes)`로 한도 안 결제까지 거부. 32바이트 uint256만 동작. 오류는 해석 가능한 `AgentTransferLimitMetadataInvalid(string)` | `pnpm c:agent-limit` | C 트랙 2 R2, 15절, 16절, 판정 스크립트 |
| 18 | Maroo Docs `IAgent.getAgentIds` | "지갑에 등록된 agent ID" | 연결된 에이전트 지갑 기준. `setAgentWallet` 뒤 소유자 주소로는 빈 목록, 에이전트 지갑으로 `[79]` | `pnpm c:agent-limit` | C 트랙 2 R1 |
| 19 | Maroo Docs PCL 정책 강제, 아키텍처 | 정책 평가가 거절하면 RPC가 브로드캐스트 전에 막아 가스를 내지 않고 블록에도 들어가지 않음. 비준수 tx는 실행 전에 거절 | PCL 프록시의 컨트랙트 정책(`claim()`의 `EAS_POLICY`, `fund()`의 에이전트 한도) 거부 tx는 블록에 들어가 되돌려지고 가스 한도의 절반을 냄(150,000/300,000, 363,982/727,965) | `pnpm a:kyb-gate` 5·6b·7c, `pnpm c:agent-limit` 4b, `pnpm a:reject-gas` | A 가이드 1절 층 표, 문서 개선 노트 8 |

## Validation

### 실행 환경

| 항목 | 판 |
| --- | --- |
| OS | Ubuntu 24.04.4 LTS (WSL2, 커널 6.18.33.2) |
| Node.js, pnpm | 24.19.0, 11.25.0 |
| TypeScript, viem, `@maroo-chain/contracts`, `@maroo-chain/viem` | 5.9.3, 2.56.8, 0.0.9, 0.4.0 |
| Go | 1.27.1 linux/amd64 |
| Foundry, solc, OpenZeppelin | 1.8.1, 0.8.37(EVM cancun), 5.6.1 |
| Clairveil, ClairveilJS, clairveil-samples | `ca85b027`(v0.4.0), `faf220d5`, `8321ded` |

### 공통

| 명령 | 결과 |
| --- | --- |
| `pnpm bootstrap`(새 클론, 새 지갑) | 109초. Clairveil 고정 커밋 세 개, 금고 컴파일, 바이너리와 회로 산출물(101초), 역할 지갑 여섯 |
| `pnpm review`(새 클론, 잔액 0) | 19초에 8단계 모두 통과(타입 검사, 금고 테스트, 단위 테스트, 테스트넷 조회 넷, 워크샵 사전 점검). `--local`은 79초에 9단계 모두 통과. 추적 중인 파일은 바뀌지 않음 |
| `pnpm test:contracts` | 금고 테스트 6개 통과 |
| `pnpm typecheck` | 오류 없음 |
| `pnpm test:unit` | 24개 통과(체인 호출 없음). 정책 해석이 테스트넷 정책 원문에서 SDK 도입 전 해석기의 기록과 같음, 심사 판정 규칙(트랙 1~3), 워크샵 4단계 분류, revert 사유 해석, 금고 흐름이 `@maroo-chain/viem`으로 만드는 calldata가 `@maroo-chain/contracts` ABI 직접 인코딩과 같음 |
| 에이전트 스킬 시험 | 새 하위 에이전트가 스킬 파일만 읽고 연동 질문 11개에 답함. 8개는 스킬의 규칙과 라벨대로 맞게 답했고, 3개는 "스킬에 없음"으로 답해 짐작하지 않았음(메인넷 RPC, OKRW ERC-20 주소, Privacy 성공 방법). 성공 경로가 지금 없다는 것과 OKRW는 네이티브 value라는 것을 스킬에 더 적음. 2차로 GitHub에서 새로 받은 클론을 에이전트 도구로 열고 처음 보는 개발자의 질문 여섯 개를 새 세션마다 물음. 연동 질문 다섯 개는 모두 스스로 스킬을 불러 13~37초에 답했고, 레포 소개 질문은 README를 읽고 답함. 여섯 개 가운데 다섯은 기록과 맞았고, 하나는 스킬의 넓게 적힌 문장을 옮겨 고침 [기록](track-a-explain/evidence/code/skill-check-20260927.md) |
| GitHub Actions `ci` | 2026-09-26 05:01 UTC 첫 실행 35초, 타입 검사, `forge fmt --check`, 금고 테스트 6개, 단위 테스트 24개 모두 통과. 테스트넷 호출 없음 |
| `pnpm diagrams:check` | Mermaid 다섯 개를 두 테마로 10번 렌더링, 실패 0. 그림을 열어 선이 상자를 가로지르는 곳을 찾아 한 번 고침 |
| 커밋 전 훅 | 타입 검사, `forge fmt`, `forge test`, 문체 검사, 개인키와 인증 지갑 주소, 공개 금지어를 커밋마다 검사 |

### A

| 명령 | 시각(UTC) | 결과 | 기록 |
| --- | --- | --- | --- |
| `pnpm a:abi-compare` | 2026-09-26 04:03 | Maroo `IPrivacy` 함수 9, 이벤트 5가 ClairveilJS 정식 EVM 계약 v0.3.1과 정규화 sha256까지 같음 | [JSON](track-a-explain/evidence/code/abi-compare-20260926T040350Z.json) |
| `pnpm sdk:check` | 2026-09-26 04:09 | ClairveilJS conformance 113/113, 단위 503/575(71 건너뜀, 1 실패는 Node 24의 `navigator.locks` 때문에 전제가 맞지 않는 테스트) | [JSON](track-a-explain/evidence/code/clairveiljs-tests-20260926T040910Z.json) |
| `pnpm a:probe-sdk` | 2026-09-26 04:12 | SDK EVM 예치 준비가 회로 설정과 자산 등록 조회에서 멈춤. prover 도달 없음, tx 없음 | [JSON](track-a-explain/evidence/code/probe-sdk-deposit-20260926T041213Z.json) |
| `pnpm a:inspect` | 2026-09-25 19:27 | Privacy 정책, 요구 스키마, 구매 기업 증명 0개, 예치 `SDKInvalidRequest()`, 필드 대응 | [JSON](track-a-explain/evidence/live/inspect-privacy-boundary-20260925T192735Z.json) |
| `pnpm a:probe` | 2026-09-25 19:33 | 빈 요청과 모양을 갖춘 요청이 두 방법 모두 `SDKInvalidRequest()`. 전역 정책은 통과 | [JSON](track-a-explain/evidence/live/probe-first-failure-20260925T193314Z.json) |
| `pnpm a:probe-global` | 2026-09-25 19:08 | `eth_call` 통과, `eth_estimateGas` 거부(faucet 계정의 전역 한도) | [JSON](track-a-explain/evidence/live/probe-global-policy-20260925T190841Z.json) |
| `pnpm a:probe-send-gas` | 2026-09-26 05:21 | 단순 이체 추정 104,017(일반 계정), 283,560(에이전트 지갑). 가스 21,000 전송은 되돌려짐(수수료 0.189 OKRW), 추정값의 125% 전송도 104,017만 씀. 04:30 실행의 283,524는 구매 기업 지갑이 에이전트 지갑이던 때의 값 | [JSON](track-a-explain/evidence/live/probe-send-gas-20260926T052147Z.json) |
| `pnpm a:reject-gas` | 2026-09-26 17:14 | 두 번의 금고 흐름과 두 번의 트랙 2 실행에서 정책에 걸린 tx 여덟 건의 영수증. 모두 블록에 들어가 되돌려졌고 가스 한도의 50.0%를 씀(청구 150,000/300,000으로 1.35 OKRW, 결제 약 364,000/728,000으로 3.28 OKRW). 조회만 함 | [JSON](track-a-explain/evidence/live/reject-gas-20260926T171442Z.json), [JSON](track-a-explain/evidence/live/reject-gas-20260926T171444Z.json) |
| `pnpm a:probe-kyc` | 2026-09-25 20:17 | 카카오 본인 인증 증명이 있는 지갑(주소 비공개)도 증명 없는 지갑과 같이 `SDKInvalidRequest()` | [JSON](track-a-explain/evidence/live/probe-kyc-holder-20260925T201710Z.json) |
| `pnpm a:doc-claims` | 2026-09-26 05:13 | 문서 개선 노트 1~5의 근거. 다섯 항목 모두 같은 결론. 문서 페이지가 200이 아니면 판정하지 않고 멈춤 | [JSON](track-a-explain/evidence/live/doc-claims-20260926T051350Z.json) |
| `pnpm a:local` | 2026-09-25 18:19 | 로컬 tx 11건. 단독 인출 실패(code 1)와 같은 블록 우회 성공, 역할별 해독 `verified=true` | [기록](track-a-explain/evidence/local/vendor-settlement-20260925T181924Z.md) |
| `pnpm a:kyb-gate` | 2026-09-26 00:01 | tx 18건, 37초. 증명 없음·색인 전 청구 `EasNoAttestationReceived`, 폐기 뒤 `EasAttestationRevoked`, 색인 뒤 청구 성공. 구현 슬롯 확인, 정책 관리자와 업그레이드 권한 분리. 구매 기업 250.06 OKRW 사용 | [JSON](track-a-explain/evidence/live/pcl-kyb-gate-20260926T000141Z.json) |
| `pnpm a:kyb-gate`(SDK 코드, 새 지갑) | 2026-09-26 05:26 | 프록시 배포와 정책 바인딩을 `@maroo-chain/viem`으로 바꾼 뒤 첫 테스트넷 실행. 5·6b `EasNoAttestationReceived`, 7c `EasAttestationRevoked`, 6d 성공 | [JSON](track-a-explain/evidence/live/pcl-kyb-gate-20260926T052641Z.json) |

### B

| 명령 | 시각(UTC) | 결과 | 기록 |
| --- | --- | --- | --- |
| `pnpm b:prepare` | 2026-09-25 19:57 | 바이너리와 회로 산출물 108초 | [evidence.md](track-b-enable/evidence.md) |
| `pnpm b:smoke` | 2026-09-25 20:01 | 64초. 점검, 1·3·4·5단계와 성공 기준 모두 통과. 2단계는 잔액 0으로 건너뜀 | [세션 기록](track-b-enable/evidence/session-20260925T200201Z.md) |
| `pnpm b:smoke`(2단계 포함) | 2026-09-26 00:02 | 91초. 1~5단계와 성공 기준 모두 통과. 2단계 6b는 같은 협력사 지갑의 두 번째 실행이라 `EasAttestationRevoked` | [2단계 기록](track-b-enable/evidence/live/pcl-kyb-gate-20260926T000228Z.json), [세션 기록](track-b-enable/evidence/session-20260926T000329Z.md) |
| `pnpm b:fund --file <주소 파일> --amount 10` | 2026-09-26 04:27 | 구매 기업 지갑에서 자기 협력사 지갑 둘에 사전 검사 통과 뒤 10 OKRW씩 전송 성공. 한 건 수수료 2.55 OKRW(그때 구매 기업 지갑이 에이전트 지갑이라 가스 283,524. 일반 지갑이면 약 0.94 OKRW) | [JSON](track-b-enable/evidence/live/fund-20260926T042738Z.json) |

### C

| 명령 | 시각(UTC) | 결과 | 기록 |
| --- | --- | --- | --- |
| `pnpm c:grounding` | 2026-09-25 19:42 | 템플릿 9개 등록, 전역 정책 트리, Privacy 정책, 레지스트리 등록 시뮬레이션(다음 agentId 79), 레지스트리 마지막 tx 2026-09-06 | [JSON](track-c-activate/evidence/live/grounding-20260925T194211Z.json) |
| `pnpm c:grounding --write` | 2026-09-26 00:04 | 에이전트 등록 tx 성공(agentId 79, 블록 19111740). 등록한 지갑의 `getAgentIds`가 바로 `[79]` | [JSON](track-c-activate/evidence/live/grounding-20260926T000418Z.json) |
| `pnpm c:judge-example` | 2026-09-26 00:03 | Track A 기록으로 만든 트랙 1 예시 제출물이 R1~R5 모두 통과. 거부 tx 둘의 사유를 직전 블록 재시뮬레이션으로 재현 | [판정 결과](track-c-activate/evidence/judge-example/evidence.judge.json) |
| `pnpm c:agent-limit` | 2026-09-26 04:40 | 트랙 2 R1~R4 실증. 에이전트 지갑 연결, `TransferLimit` 5 OKRW, 금고 `fund()`에 에이전트 한도 정책, 3 OKRW 결제 성공, 8 OKRW `ExceededAgentTransferLimit`. 빈 값과 문서 형식 메타데이터는 `AgentTransferLimitMetadataInvalid`. 약 30 OKRW | [JSON](track-c-activate/evidence/live/agent-limit-20260926T044056Z.json) |
| `pnpm c:grounding --write`, `pnpm c:agent-limit`(새 지갑) | 2026-09-26 05:30 | 에이전트 80 등록부터 다시 실행. 지갑 연결, 마감 제한(+299초 통과, +301초 `deadline too far`), 세 형식, 3 OKRW 성공, 8 OKRW `ExceededAgentTransferLimit`. 04:40 실행과 같은 결과 | [등록](track-c-activate/evidence/live/grounding-20260926T053055Z.json), [실증](track-c-activate/evidence/live/agent-limit-20260926T053121Z.json) |
| `pnpm c:judge <트랙 2 예시> --track 2` | 2026-09-26 04:45 | R1~R4 모두 통과. 거부 tx 사유를 직전 블록 재시뮬레이션으로 재현, `TransferLimit` 32바이트 확인 | [판정 결과](track-c-activate/evidence/track2-example/evidence.judge.json) |

### 직접 검증한 것과 문서로만 확인한 것

- 직접 검증: 위 명령의 결과와, 문서마다 `[Live Testnet]`, `[Local]`로 표시한 문장.
- 문서로만 확인: prover의 비공개 정보 노출 범위, 관찰자 노드 미구현, 노트 금액 상한(약 18.45 OKRW), `batchTransfer`의 원자성과 20건 상한, Clairveil의 메인넷·보안 관문, v0.5.0의 회로 교체 방식. 문서에 `[Docs Only]`로 표시했습니다.

## AI Usage

### 공통

- 도구: Claude Code(모델 Claude Opus 5.5). 자료 조사, 코드 작성, 명령 실행, 문서 초안에 썼습니다.
- 속도를 크게 높인 사례
  1. 자료 대조: Maroo Docs 약 300쪽과 Clairveil 소스를 함께 읽혀, `IPrivacy` 전송 요청이 Clairveil v1 `MsgTransfer`와 필드 하나(`creator`)만 다르다는 것과 v0.4.0 인출 실패의 위치(`x/privacy/keeper/path_snapshot.go`의 `SetMerkleRootSnapshotV1`)를 찾았습니다. 두 가지 모두 스크립트로 다시 실행해 확인한 뒤 문서에 썼습니다.
  2. faucet 장애 진단: 같은 전송을 `eth_call`과 `eth_estimateGas`로 나눠 부르는 방법을 빠르게 시험해, faucet 실패가 전역 정책의 24시간 한도 때문이라는 것과 한도가 풀리는 시각을 찾았습니다.
  3. 증거를 남기는 스크립트: 조회·진단 스크립트, 로컬 정산 실행기, 워크샵 실행기를 만들고, 결과를 JSON과 Markdown 기록으로 남기는 반복을 짧게 했습니다.
- 사람이 정한 것: Primary를 A로 두고 세 트랙을 모두 내는 것, 사례(공급업체 정산), Clairveil 조합(v0.4.0), 카카오 본인 인증을 별도 지갑으로 하고 주소를 공개하지 않는 것, 레포 구조와 커밋 규칙, 외부 문의를 보내지 않는 것, C의 트랙 셋과 피지컬 AI를 에이전트 트랙의 갈래로 둔 것, 트랙 문서의 앞머리와 뒷머리를 나눈 구조, B의 진행자 배분 방식, 영상을 화면 녹화와 목소리로 만드는 것, 세 트랙을 잇는 흐름과 체인 안쪽 층 설명, 요약 그림, 에이전트 스킬을 결과물에 더하는 것.
- 작업 방식: AI가 만든 문장과 코드가 규칙을 어기거나 틀린 사실을 담지 않게, 도구와 검사를 이렇게 붙였습니다.

| 도구와 검사 | 한 일 | 막거나 찾은 것 |
| --- | --- | --- |
| Claude Code 작업 세션 | 조사, 스크립트 작성, 테스트넷과 로컬 실행, 문서 초안. 긴 작업은 목표 조건과 감시 타이머를 두고 이어서 실행 | 실행 결과는 모두 `evidence/` 기록으로 남김 |
| 문체 훅(작성자가 관리하는 글쓰기 규칙) | 파일과 명령에 줄표, 문장을 닫는 상투구 같은 표현이 들어가면 쓰기 전에 막음 | 문서와 커밋 메시지의 문장을 여러 번 고치게 함 |
| 커밋 전 훅 | 타입 검사, `forge fmt --check`, 금고 테스트, 문체 검사, 개인키와 인증 지갑 주소, 공개 금지어, 원문 문장 복사 검사 | 원문과 같은 제목, 도구 이름이 들어간 줄을 막음 |
| 커밋 메시지 훅 | 영어 Conventional Commits, 제목 72자, AI 표시 금지 | 제목 길이와 형식 위반을 막음 |
| 읽기 전용 하위 에이전트 검토 | 제출 전 수치, 라벨, 원문 체크리스트, 읽는 사람별 경로를 독립적으로 검토 | 지적 다섯 가운데 넷 반영(Validation과 알려진 한계에 반영 내용) |
| 새 클론과 링크 검사 | 빈 폴더에 받아 README 순서대로 실행, 문서 전체의 링크와 앵커, 외부 링크 응답 확인 | 문서 대조 스크립트가 404 페이지로 판정하던 문제를 찾음(아래 표) |
| 이 레포의 에이전트 스킬 | [`.claude/skills/maroo-integration`](.claude/skills/maroo-integration/SKILL.md). 테스트넷에서 확인한 규칙과 확인 명령을 다음 에이전트가 쓰게 함 | 새 하위 에이전트가 스킬만 읽고 연동 질문 11개에 답하게 하고, 새 클론에서 연 세션에 질문 여섯 개를 물어 확인(Validation) |

### AI가 틀렸고 고친 사례

| 트랙 | 틀린 것 | 발견 | 고친 것 |
| --- | --- | --- | --- |
| A, B | 레시피에 `RPC_PORT`로 로컬 노드 포트를 바꿀 수 있다고 적었지만, 실행기는 CLI가 접속할 포트만 바꾸고 노드는 26657에서 떴습니다 | B 트러블슈팅을 쓰면서 `clairveild start --help`로 노드 시작 인자를 확인 | 노드 시작 인자에 `--rpc.laddr`, `--p2p.laddr`, `--grpc.address`, `--api.address`를 넘기도록 실행기를 고침 |
| A | 공개 증거 없이 "테스트넷 withdraw 8건 성공", "색인 전 거부 `[Live Testnet]`"을 문서 문장으로 썼습니다 | 커밋 전 검토에서 문장마다 증거 파일을 찾음 | 문장을 지우거나, 확인하는 명령(금고 흐름 6b)을 가리키게 바꿈 |
| A | Clairveil 메인넷 관문 수를 11개로, 금고 흐름 비용을 400 tOKRW로 적었습니다 | Clairveil 운영 가이드를 다시 세고, 비용 계산 근거가 없음을 확인 | 10개로 고치고 비용 문장은 지움 |
| A | 금고 흐름 기록을 문서에 옮기면서 tx 수를 "22건"으로 적었습니다. 세지 않고 쓴 숫자였습니다 | 쓴 직후 기록 파일에서 tx가 있는 단계를 셈 | 18건으로 고침 |
| C | 트랙 3 초안에 "색인 전 호출은 거부됩니다 `[Docs Only]`"라고 적었지만, 그 순서는 문서에서 찾을 수 없었습니다 | 커밋 전 라벨 검토 | 라벨을 지우고 금고 흐름 6b 단계가 확인한다고 바꿈 |
| A | 단순 이체 가스를 "283,524"로 일반화해 문서 여러 곳에 적었습니다. 잰 시각에 구매 기업 지갑이 에이전트 79의 지갑이었고, 일반 계정은 약 104,000을 씁니다 | 녹화용 지갑에 OKRW를 나눠 줄 때 사전 검사 가스가 104,011로 나옴. 지갑 연결 전후 블록으로 다시 추정해 원인 확인 | 스크립트가 일반 계정과 에이전트 지갑을 함께 재게 고치고 다시 실행해 숫자를 모두 바꿈. "21,000이면 되돌려진다"는 결론은 그대로 |
| A | 배포 주소 페이지 주소를 `/resources/network/deployed-contracts/`로 틀리게 적었고, 문서 대조 스크립트가 그 404 페이지 본문으로 "Privacy 주소가 없다"고 판정했습니다. 결론은 맞았지만 근거가 없는 판정이었습니다 | 새 클론 뒤 문서 전체의 외부 링크 응답 코드를 검사 | 주소를 `/resources/contracts/deployed-contracts/`로 고치고, 스크립트가 200이 아닌 페이지에서는 멈추게 바꾼 뒤 다시 실행(다섯 항목 모두 같은 결론) |
| A | 에이전트 스킬의 가스 줄에 "되돌려지면 한도의 절반을 낸다"고 넓게 적었고, 금고 흐름 비용을 기록과 맞지 않는 "약 260, 새 지갑 약 310"으로 적었습니다 | 새 클론에서 연 에이전트 세션 시험에서 에이전트가 두 문장을 그대로 옮겨 답해 드러났습니다. 가스 부족으로 되돌려진 21,000 이체는 한도를 모두 썼습니다([기록](track-a-explain/evidence/live/probe-send-gas-20260926T043013Z.json)) | 절반은 PCL 컨트랙트 정책 거부일 때로 좁히고, 비용은 코드의 가스 보충 조건대로 구매 기업 약 250(발급자까지 비어 있으면 약 310)으로 고쳤습니다 |

- 검증 방법: 문장마다 기록 파일이나 문서 링크를 붙이고, 커밋 전에 링크와 라벨을 대조했습니다. 코드는 명령을 다시 실행해 결과를 확인했습니다.

### A

- 가이드와 FAQ의 초안을 AI로 쓰고, 문장마다 증거 라벨을 붙이는 기준과 독자 가정은 사람이 정했습니다.

### B

- 실행기와 트러블슈팅 초안을 AI로 쓰고, 스모크 테스트로 단계별 성공 기준을 확인했습니다.

### C

- 기술 근거 스크립트를 AI로 쓰면서 문서와 다른 동작 다섯 가지를 찾았습니다. 트랙의 주제와 배점은 사람이 정했습니다.

## DX Feedback

| # | 트랙 | 문제 | 재현 또는 근거 | 영향을 받는 사용자 | 심각도와 이유 | 제안 | owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A, B | Privacy 호출이 요구하는 증명(개인 본인 인증 스키마)과 정책 구조가 문서에 없고, KYC 서비스는 "mock"으로만 적힘 | `pnpm a:inspect` | Privacy를 처음 부르는 모든 개발자 | 높음. 무엇을 갖춰야 통과하는지 알 수 없어 첫 호출에서 멈춤 | Privacy 개요에 현재 정책, 스키마 UID, 증명을 받는 방법을 적음 | Maroo Docs |
| 2 | A, B, C | `eth_call`이 전역 정책을 평가하지 않아 `simulateContract`로 사전 검사하면 거부를 놓침 | `pnpm a:probe-global` | 사전 검사를 만드는 백엔드, 지갑 개발자 | 높음. 시뮬레이션은 통과하고 tx는 거부되어 원인을 찾기 어려움 | 사유 코드 문서에 `eth_estimateGas` 사전 검사를 적고, SDK에 전역 정책까지 평가하는 사전 검사 함수를 둠 | Maroo Docs, SDK |
| 3 | B | faucet이 전역 24시간 한도에 걸리면 모든 요청이 `reverted with the following signature:.`로만 실패 | `pnpm a:probe-global` (2026-09-25 16:41 UTC부터) | 테스트넷을 처음 쓰는 모든 개발자, 워크샵 진행자 | 높음. 원인을 알 수 없고 재시도 말고 할 일이 없음 | faucet 계정에 KYC 증명이나 정책 면제를 두고, 오류에 PCL 사유와 `resetAt`을 보여 줌 | faucet 운영 |
| 4 | A, C | `deployPclProxy`에 빈 초기화 데이터를 넘기면 되돌려지고, 사유 문자열이 가려짐 | `pnpm a:doc-claims` | 규제 트랙 컨트랙트를 배포하는 개발자 | 중간. 문서대로 하면 실패하지만 초기화 호출을 넣으면 풀림 | 문서 예시를 초기화 호출로 바꾸고 안쪽 사유를 돌려줌 | Maroo Docs, PCL |
| 5 | A, B | Clairveil v0.4.0 스모크 스크립트가 인출 실패를 통과로 보고함 | `pnpm a:local` | Clairveil로 차폐 흐름을 배우는 개발자 | 중간. 참조 흐름이 동작한다고 믿고 넘어감 | 스크립트가 tx 결과 코드를 확인하고, 인출 스냅샷 조건을 문서에 적음 | Clairveil |
| 6 | C | ERC-8004 IdentityRegistry 호출 스케치가 배포된 컨트랙트와 다름 | 탐색기 검증 소스, `pnpm c:grounding` | 에이전트 개발자 | 중간. 스케치대로 ABI를 만들면 호출이 실패 | 스케치를 배포된 ABI로 바꾸고 `TransferLimit` 메타데이터 예시를 둠 | Maroo Docs |
| 7 | C | 지웠다고 적힌 `OKRW_EAS_*` 템플릿이 테스트넷에 등록돼 있음 | `pnpm c:grounding` | 정책을 설계하는 개발자 | 낮음. 새 조합 정책으로 같은 규칙을 표현할 수 있음 | 문서와 체인 중 하나를 맞추고, 바뀌는 판을 적음 | Maroo Docs, PCL |
| 8 | C | 배포 주소 표의 `OKRW_ERC20` 주소에 코드가 없음 | `pnpm c:grounding` | ERC-20 인터페이스로 OKRW를 다루려는 개발자 | 중간. 표를 믿고 호출하면 빈 값을 받음 | 주소를 고치거나 표에서 빼고 네이티브 value 사용을 안내 | Maroo Docs |
| 9 | A | 인출 금액 예시의 단위가 `aokrw`인데 테스트넷은 `atokrw` | `pnpm a:doc-claims` | 인출을 구현하는 개발자 | 중간. 예시를 복사하면 `PrivacyNativeDenomMismatch` | 예시를 `getParams().mintDenom`으로 읽게 바꿈 | Maroo Docs |
| 10 | A, C | 공식 TypeScript SDK `@maroo-chain/viem`이 Maroo Docs에 없음 | npm 0.4.0(2026-09-17), Maroo Docs 검색 | TypeScript로 PCL 정책과 에이전트를 다루는 개발자 | 중간. 문서만 보면 정책 바이트, 프록시 초기화 데이터, 거부 사유 해석을 직접 짜게 됨. 이 레포도 처음에는 직접 짰음 | PCL, 에이전트, 개발자 도구 쪽에 SDK 설치와 사용 예를 둠 | Maroo Docs |
| 11 | A, C | 단순 이체 가스 예시와 ClairveilJS 기본 가스 한도가 21,000인데 테스트넷 단순 이체는 일반 계정 약 104,000, 에이전트 지갑 약 284,000을 씀 | `pnpm a:probe-send-gas` | 네이티브 OKRW를 보내는 지갑 개발자, ClairveilJS 사용자, 해커톤 참가자 | 높음. `eth_call` 사전 검사는 통과하고 tx는 사유 없이 되돌려지며 수수료를 냄 | 문서 예시를 테스트넷 값으로 바꾸고 고정 한도 대신 추정값을 쓰라고 적음. ClairveilJS EVM 프로필은 추정값을 씀 | Maroo Docs, ClairveilJS |
| 12 | C | 에이전트 한도 문서가 `TransferLimit`을 숫자 문자열로 안내하는데 체인은 32바이트 uint256만 받음 | `pnpm c:agent-limit` | 에이전트 결제를 만드는 개발자, 트랙 2 참가자 | 높음. 문서대로 쓰면 한도 안 결제까지 모든 결제가 막히고, 문서가 해석할 수 없다고 한 오류라 사유를 읽으려 하지 않게 됨 | 형식을 `abi.encode(uint256)`로 고치고 `AgentTransferLimitMetadataInvalid(string)` 예시를 둠. SDK 주석은 이미 맞음 | Maroo Docs |
| 13 | C | `getAgentIds`의 기준 지갑이 문서에 없음 | `pnpm c:agent-limit` | 지갑에서 에이전트를 찾는 화면, 백엔드 | 중간. 에이전트 지갑을 연결하면 소유자 주소로 찾던 화면이 빈 목록을 보여 줌 | "연결된 에이전트 지갑 기준, 연결 전에는 소유자"를 적고 소유자 기준 조회는 `ownerOf`나 이벤트로 안내 | Maroo Docs |
| 14 | A, B, C | PCL 프록시의 컨트랙트 정책 거부가 블록에 들어가 수수료를 내는데, 문서는 제출 시점에 걸러져 가스를 내지 않는다고 적음 | `pnpm a:reject-gas`(거부 tx 여덟 건의 영수증) | 규제 트랙 컨트랙트를 운영하는 기관, 워크샵·해커톤 참가자 | 중간. 거부 시험마다 한도의 절반을 수수료로 내고, 자격 없는 청구 시도가 주소와 함께 공개 체인에 남음 | 사전 거절이 전역 정책에만 해당한다고 적고, 컨트랙트 정책은 `eth_estimateGas` 사전 검사를 안내 | Maroo Docs, PCL |

### A

1, 2, 4, 5, 9, 10, 11, 14번. 문서 개선 노트 여덟 항목에 멈추는 사람, 확인 비용, 고친 문구 제안까지 적었습니다.

### B

1, 2, 3, 5, 14번. 워크샵에서는 3번(faucet)이 가장 크게 걸려, 진행자 배분(`pnpm b:fund`)을 기본 경로로 두었습니다.

### C

2, 4, 6, 7, 8, 10, 11, 12, 13, 14번. 모두 해커톤 참가자가 트랙 요건을 채우는 데 쓰는 기능이라, 트랙 문서의 주의 사항과 멘토 답변에 넣었습니다.

## Known Limitations

### A

- Maroo 테스트넷에서 유효한 Privacy 상태 변경은 실행하지 못했습니다. 회로 산출물, 차폐 상태 조회 경로, 성공한 예시 입력이 공개되지 않았고, 가이드 6절에 최초 실패 계층과 필요한 재료를 적었습니다. 공식 SDK(ClairveilJS)의 예치 경로로도 시험했고, 증명을 만들기 전 회로 설정과 자산 등록 조회에서 멈췄습니다.
- 가이드의 권고(주기 총액 예치, 일괄 지급 크기 고정, 원장 상태)는 검증하지 않은 설계입니다.

### B

- 실제 참가자와 워크샵을 진행하지 않았습니다. 시간표는 한 머신의 실행 시간(사전 준비 108초, 3단계 61초)과 설명 분량으로 잡았습니다.
- 미리 빌드한 바이너리는 운영체제와 CPU에 따라 다시 만들어야 합니다. 확인한 환경은 Linux(WSL2) 하나입니다.
- 같은 지갑으로 2단계를 다시 실행하면 6b의 거부 사유가 바뀝니다(`EasAttestationRevoked`). 참가자 가이드, 진행자 가이드, 트러블슈팅 T8에 적었습니다.

### C

- 스타터 키트는 명세만 있습니다. Flagship 첫 성공 경로의 기준 구현은 이 레포의 `pnpm a:local`이고, 심사 자동 판정은 `pnpm c:judge`로 구현했습니다.
- 트랙별 배점과 멘토 답변은 제안입니다. 실제 행사에서 조정이 필요합니다.
- 트랙 2 실증은 컨트랙트 범위에서 에이전트 지갑이 직접 보낸 결제만 확인했습니다. 전역 범위에서 다른 컨트랙트가 에이전트의 호출을 옮길 때의 귀속과 R5(에이전트의 거부 해석), 기기 갈래는 참가자 요건으로 남겼습니다.

### 프로덕션 전에 필요한 것

A 가이드 [8절](track-a-explain/integration-guide.md#8-프로덕션-전에-남은-것)에 정리했습니다. 노트 금액 상한, 참조 구현의 외부 감사, 규제기관 열람 기능, 기관 KYB 경로, 회로 교체 시 노트 이전, 금고 회수 권한(청구 기간이나 타임락), 키 보관과 지급 원장 운영이 남아 있습니다.

## 다음에 확인할 것

지금까지 확인하지 못했거나, 조건이 바뀌면 다시 돌려 볼 것입니다. 명령이 있는 항목은 같은 명령을 다시 실행하면 됩니다.

| 확인할 것 | 지금 상태 | 확인 방법 | 풀어야 하는 쪽 |
| --- | --- | --- | --- |
| 테스트넷 Privacy 정상 경로에 필요한 재료 네 가지(회로 버전과 proving 산출물, 차폐 상태 조회 경로, 성공한 예시 입력, prover 엔드포인트) | 공개되지 않음. 예치 요청이 `SDKInvalidRequest()`, ClairveilJS 예치 준비가 회로 설정 조회에서 멈춤 | 공개되면 `pnpm a:probe`, `pnpm a:probe-sdk`를 다시 실행해 3층과 5층을 넘는지 | Maroo |
| Privacy 컨트랙트 정책이 요청 검증보다 먼저 평가되는지 | 두 지갑 모두 요청 검증에서 먼저 막혀 가릴 수 없음 | 유효한 요청을 만들 수 있게 되면 본인 인증 증명이 없는 지갑으로 같은 요청 | Maroo, 이 레포 |
| Clairveil v0.4.0 인출 스냅샷 조건이 Maroo 테스트넷에도 있는지 | 로컬에서만 재현(단독 인출 실패, 같은 블록 우회) | 테스트넷 Privacy 정상 경로가 열린 뒤 인출 한 번 | Maroo |
| 에이전트 한도의 전역 범위 귀속(다른 컨트랙트가 에이전트의 호출을 옮길 때) | 컨트랙트 범위, 직접 보낸 경우만 확인 | 전역 정책 설정 권한이 필요해 Maroo 쪽 시험이 필요 | Maroo |
| 관찰자 노드(규제기관 열람)와 차폐 금액 상한의 일정 | 문서에 미구현, 노트 하나 약 18.45 OKRW | Maroo 로드맵 확인 | Maroo |
| 문서 차이 19건의 반영 | 2026-09-26 문서 미러 기준 | `pnpm a:doc-claims`(1~5번), `pnpm a:probe-send-gas`, `pnpm c:agent-limit`를 다시 실행해 문서 문장과 체인 동작 대조 | Maroo Docs |
| 실제 참가자와의 워크샵, 실제 해커톤 참가자의 트랙 2 제출 | 이 머신의 실행 시간으로만 설계 | 파일럿 워크샵 한 번, `pnpm c:judge`로 참가자 제출물 판정 | 운영진 |
