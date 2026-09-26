# Track B: 실습 워크샵과 데모

기관의 실무 엔지니어가 75분 동안 협력사 대금 정산을 두 환경에서 직접 실행하는 워크샵입니다. Maroo 테스트넷에서는 OKRW 이체와 PCL·EAS 정책이 걸린 정산 금고를 실제 트랜잭션으로 돌리고, 차폐 정산(예치, 지급, 스캔, 해독, 인출)은 Clairveil 로컬 체인에서 돌린 뒤, 두 환경의 경계와 Maroo 테스트넷 Privacy가 멈추는 층을 진단합니다.

## 결과물

| 결과물 | 파일 | 담은 것 |
| --- | --- | --- |
| 실행 데모 | [demo/](demo/) | `pnpm b:check`, `b:prepare`, `b:fund`, `b:step 1~5`, `b:reset`, `b:smoke`. 단계마다 예상 결과와 성공 기준을 먼저 출력하고, 실패하면 트러블슈팅 번호를 안내. 공용 흐름은 `shared/lib/`(Track A와 같은 코드) |
| 테스트넷 증거 | [evidence.md](evidence.md) | 1단계 조회, 2단계 상태 변경 tx, 4단계 분류, 3단계 로컬 기록 |
| 워크샵 패키지 | [participant-guide.md](participant-guide.md), [facilitator-guide.md](facilitator-guide.md) | 학습 목표 여섯 개, 사전 준비와 확인 방법, 75분 시간표, 단계별 성공 기준, 토론 질문과 답변 방향, 끝난 뒤 다음 단계. Clairveil 빌드는 사전 준비로 뺌 |
| 트러블슈팅 | [troubleshooting.md](troubleshooting.md) | 오류 10개(증상, 원인, 확인, 해결)와 라이브 서비스가 멈췄을 때의 대체 진행 |
| 검증 | [facilitator-guide.md의 검증과 초기화](facilitator-guide.md#검증과-초기화) | 스모크 테스트(`pnpm b:smoke`), 깨끗한 환경에서 시작하는 순서, 초기화(`pnpm b:reset`) |
| 워크스루 영상 | 녹화 대기(2026-09-27) | 참가자가 무엇을 만들고 어느 순간에 성공을 확인하는지, 5~8분 |

## 명령

| 명령 | 누가, 언제 | 하는 일 | 라벨 |
| --- | --- | --- | --- |
| `pnpm b:prepare` | 참가자, 전날 | Clairveil 받기, 금고 컴파일, 바이너리와 회로 산출물 빌드(이 머신에서 108초), 역할 지갑 | 준비 |
| `pnpm b:fund --file participants.txt` | 진행자, 전날 | 참가자 구매 기업 주소에 테스트넷 OKRW 1,000씩. faucet이 멈췄을 때의 대안 | `[Live Testnet]` tx |
| `pnpm b:check` | 참가자, 전날과 직전 | 도구, 고정 커밋, 포트, RPC, 지갑, 잔액 점검 | 준비 |
| `pnpm b:step 1` | 참가자, 0~10분 | 연결, 지갑, Privacy와 전역 정책 | `[Live Testnet]` 조회 |
| `pnpm b:step 2` | 참가자, 10~25분 | KYB 관문 금고: 배포, 정책, 거부 셋과 통과 하나, 회수 | `[Live Testnet]` tx |
| `pnpm b:step 3` | 참가자, 25~50분 | 차폐 정산 전체(이 머신에서 61초) | `[Local]` |
| `pnpm b:step 4` | 참가자, 50~65분 | 결과 네 가지 분류와 Privacy 최초 실패 계층 | `[Live Testnet]` 조회와 시뮬레이션 |
| `pnpm b:step 5` | 참가자, 65~75분 | 기록 모음, 경계, 토론 질문 | 정리 |
| `pnpm b:reset` | 누구나 | 로컬 노드 종료와 실행 폴더 삭제 | 정리 |
| `pnpm b:smoke` | 진행자, 전날 | 1~5단계를 멈춤 없이 실행하고 성공 기준 확인 | 검증 |

## 두 환경의 경계

Maroo 테스트넷에서 외부 개발자가 유효한 Privacy 증명을 만들 재료(현재 verifier와 맞는 회로 산출물, 차폐 상태 조회 경로, 성공한 예시 입력)가 공개되지 않아, 차폐 흐름은 Clairveil v0.4.0 로컬 체인에서 실행합니다. 테스트넷에서는 참가자가 통제할 수 있는 OKRW, PCL, EAS 경로를 상태 변경 tx로 실행하고, Privacy는 요청 검증에서 멈추는 층까지 진단합니다. 두 환경의 결과는 서로 다른 라벨로 남기고 한 흐름의 성공으로 합치지 않습니다.
