# Track B 증거 목록

워크숍 경로를 실제로 실행한 기록입니다. 시각은 UTC입니다. 실행 환경: Linux(WSL2), Node.js 24.19, pnpm 11.25, Go 1.27.1, Foundry 1.8.1.

## 1. Maroo 테스트넷 `[Live Testnet]`

| 단계 | 기록 | 실행 시각 | 호출 대상과 입력 | 예상 결과 | 실제 결과 |
| --- | --- | --- | --- | --- | --- |
| 1단계 연결 | [step1-connect-20260925T195533Z.json](evidence/live/step1-connect-20260925T195533Z.json) | 2026-09-25 19:55 | `eth_chainId`, 역할 다섯의 잔액, `IPcl.contractPolicies(Privacy)`, `IPcl.globalPolicies`, Indexer의 구매 기업 본인 인증 증명 수 | chain ID 450815, 정책 조회 | chain ID 450815, Privacy `And(EAS_POLICY, DENYLIST_POLICY)`, 전역 정책 트리, 증명 0개. 잔액은 모두 0 |
| 2단계 금고 | 실행 대기 | | OKRW 이체, KYB 스키마 등록, 금고 배포와 정책 바인딩, 입금, 청구 거부 셋과 통과 하나, 폐기, 회수 | [참가자 가이드 2단계](participant-guide.md#2단계-kyb-관문이-걸린-정산-금고-15분-live-testnet)의 성공 기준 | 아래 "상태 변경 tx를 아직 보내지 못한 이유" |
| 4단계 분류 | [step4-diagnose-20260925T195916Z.json](evidence/live/step4-diagnose-20260925T195916Z.json) | 2026-09-25 19:59 | 구매 기업 주소로 빈 요청의 `Privacy.deposit`을 `eth_call`과 `eth_estimateGas`, 잔액보다 큰 예치를 `eth_estimateGas` | 증명·입력 거부와 준비 부족이 구분됨 | 두 방법 모두 `SDKInvalidRequest()`(증명·입력 거부), 큰 예치는 `insufficient balance for transfer`(인프라·자료 부재), 로컬 기록의 성공과 참조 구현 실패 |

### 상태 변경 tx를 아직 보내지 못한 이유

| 항목 | 내용 |
| --- | --- |
| 오류 | faucet 요청이 `Transaction failed … reverted with the following signature:.`로 실패. 같은 전송을 `eth_estimateGas`로 부르면 `AnyOfRejected(ExceededPeriodicVolume(10000000000000000000000000, 10005000000000000000000000, 1790380800), EasNoAttestationReceived(0x5336F019Bd8E9E0064be7330833dc883a8a6c94d))` |
| 원인 | faucet 계정이 전역 정책의 24시간 한도(1,000만 OKRW)를 다 썼고 KYC 증명이 없음. 한도 창은 `resetAt` 1790380800(2026-09-26 00:00 UTC)에 풀림 |
| 발생 시각 | 2026-09-25 16:41 UTC부터(faucet 첫 실패), 원인 확인 19:08 UTC |
| 재현 | `pnpm a:probe-global` ([기록](../track-a-explain/evidence/live/probe-global-policy-20260925T190841Z.json)) |
| 대안 | 한도 창이 풀린 뒤 faucet으로 받거나, 진행자 지갑에서 `pnpm b:fund`로 받아 `pnpm b:step 2` 실행 |

## 2. Clairveil 로컬 `[Local]`

| 단계 | 기록 | 실행 시각 | 결과 |
| --- | --- | --- | --- |
| 3단계 차폐 정산 | [vendor-settlement-20260925T195750Z.md](evidence/local/vendor-settlement-20260925T195750Z.md) | 2026-09-25 19:57 | 미리 빌드한 바이너리로 61초. 예치 여섯 건, 협력사 A 일괄 지급, 협력사 B 수신자 암호화 지급, 스캔, 역할별 해독(`verified=true`), 단독 인출 실패(code 1)와 같은 블록 우회 인출 성공 |

## 3. 사전 준비와 검증

| 항목 | 결과 |
| --- | --- |
| `pnpm b:prepare` | 이 머신에서 108초(바이너리 두 개와 회로 산출물) |
| `pnpm b:check` | 필수 항목 모두 ✓. 권장 항목 중 잔액만 ! |
| `pnpm b:smoke` | 2026-09-25 20:01 UTC, 64초. b:check, 1·3·4·5단계와 성공 기준 확인(3단계 협력사 B 해독, 인출 성공, 4단계 분류) 모두 통과. 2단계는 구매 기업 잔액 0으로 건너뜀. 세션 기록 [session-20260925T200201Z.md](evidence/session-20260925T200201Z.md) |
