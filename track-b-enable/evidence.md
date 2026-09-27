# Track B 증거 목록

워크샵 경로를 실제로 실행한 기록입니다. 시각은 UTC입니다. 실행 환경: Linux(WSL2), Node.js 24.19, pnpm 11.25, Go 1.27.1, Foundry 1.8.1.

## 1. Maroo 테스트넷 `[Live Testnet]`

| 단계 | 기록 | 실행 시각 | 호출 대상과 입력 | 예상 결과 | 실제 결과 |
| --- | --- | --- | --- | --- | --- |
| 1단계 연결 | [step1-connect-20260925T195533Z.json](evidence/live/step1-connect-20260925T195533Z.json) | 2026-09-25 19:55 | `eth_chainId`, 역할 다섯의 잔액, `IPcl.contractPolicies(Privacy)`, `IPcl.globalPolicies`, Indexer의 구매 기업 본인 인증 증명 수 | chain ID 450815, 정책 조회 | chain ID 450815, Privacy `And(EAS_POLICY, DENYLIST_POLICY)`, 전역 정책 트리, 증명 0개. 잔액은 모두 0 |
| 2단계 금고 | [pcl-kyb-gate-20260926T000228Z.json](evidence/live/pcl-kyb-gate-20260926T000228Z.json) | 2026-09-26 00:02 | OKRW 이체, KYB 스키마(재사용), 금고 배포와 정책 바인딩, 입금, 청구 거부 셋과 통과 하나, 폐기, 회수 | [참가자 가이드 2단계](participant-guide.md#2단계-kyb-관문이-걸린-정산-금고-15분-live-testnet)의 성공 기준 | 모두 충족. 금고 `0x6980C889…9A70`. 5 `EasNoAttestationReceived`, 6b `EasAttestationRevoked`(A 실행에서 폐기한 증명이 색인돼 있어서), 6d 성공, 7c `EasAttestationRevoked` |
| 4단계 분류 | [step4-diagnose-20260926T000329Z.json](evidence/live/step4-diagnose-20260926T000329Z.json) | 2026-09-26 00:03 | 2단계 기록의 거부와 통과, 증명 없는 협력사 B의 `claim()`을 `eth_estimateGas`로 재시뮬레이션, 빈 요청의 `Privacy.deposit`을 `eth_call`과 `eth_estimateGas`, 잔액보다 큰 예치 | 네 분류가 모두 나옴 | 정책 거부(2단계 5·6b·7c, 재시뮬레이션 `EasNoAttestationReceived`), 성공(6d, 로컬 인출), 증명·입력 거부(`SDKInvalidRequest()` 두 건), 인프라·자료 부재(공개되지 않은 증명 재료, 잔액 부족), 참조 구현 문제(로컬 단독 인출). 2단계를 뺀 첫 실행 기록은 [step4-diagnose-20260925T195916Z.json](evidence/live/step4-diagnose-20260925T195916Z.json) |

### 2단계 주요 tx

2026-09-26 00:02 UTC 실행 `[Live Testnet]` [기록](evidence/live/pcl-kyb-gate-20260926T000228Z.json). 탐색기 링크를 열면 받는 주소(금고), 보낸 주소, 결과(성공 또는 실패)를 볼 수 있습니다.

| 단계 | 결과와 상태 변화 | tx |
| --- | --- | --- |
| 3b PCL 프록시 배포 | 금고 `0x6980C8892072539D1A08007D10F0A496F4ff9A70`. 정책 관리자는 구매 기업, ProxyAdmin 소유자는 `UPGRADE_OWNER` | [0x1b7e…eee1](https://explorer-testnet.maroo.io/tx/0x1b7e8376ed4b17e7c97566ec12132cd79480c6da6abd9d96927017e71ca2eee1) |
| 5 협력사 B 청구 | 거부, `EasNoAttestationReceived` | [0x8183…4f0d](https://explorer-testnet.maroo.io/tx/0x818318c4370cfb3720a816292e95392312021917feff1c8eb6d3bfc44a5d4f0d) |
| 6b 색인 전 청구 | 거부, `EasAttestationRevoked`(같은 협력사 지갑의 두 번째 실행이라 A 실행에서 폐기한 증명이 색인돼 있음, 트러블슈팅 T8) | [0x4431…8f09](https://explorer-testnet.maroo.io/tx/0x4431a8f09ee74bded2f2319836748da41dbf47747ee026ed9f267f437c448f09) |
| 6d 색인 뒤 청구 | 성공. 협력사 A 잔액 153.19 → 250.42 OKRW(100을 받고 가스를 냄) | [0xf41e…3c79](https://explorer-testnet.maroo.io/tx/0xf41efa60c0b46f324e7ec5d78286b5bf5ddaafe83df97a67422be8cf16bd3c79) |
| 7c 폐기 뒤 청구 | 거부, `EasAttestationRevoked` | [0xb7cb…8e61](https://explorer-testnet.maroo.io/tx/0xb7cbf7b7c2fc0c4ec1a43120e935373cc58ae793ad1f6351d3bbcdda49ee8e61) |
| 8 협력사 A 몫 회수 | 성공 | [0xc0f5…b3e5](https://explorer-testnet.maroo.io/tx/0xc0f522bce74a8473e1e0f8ffbe2b40c288fa234985597be265b23ab8424db3e5) |
| 8 협력사 B 몫 회수 | 성공. 회수 뒤 두 몫 0, 구매 기업 잔액 4,425.97 → 4,621.75 OKRW | [0xd460…2e2d](https://explorer-testnet.maroo.io/tx/0xd46082d7ac482f28581acfe1ad2928053920c524327e2140fa1709e14fbd2e2d) |

- 쓴 OKRW: 구매 기업 4,749.94 → 4,621.75(128.19, 협력사 A가 받은 100과 가스), 발급자 4,991.90 → 4,986.05(5.86, 가스). 가스 보충은 이미 잔액이 있어 건너뛰었습니다.
- 확인 방법: 거부 tx는 탐색기에서 실패로 보이고, 사유는 기록 파일의 `reason`에 있습니다. 같은 호출을 직전 블록 상태로 다시 시뮬레이션하면 같은 사유가 나옵니다(`pnpm c:judge`가 이 방식으로 확인합니다).

### faucet 장애와 복구

| 항목 | 내용 |
| --- | --- |
| 오류 | faucet 요청이 `Transaction failed … reverted with the following signature:.`로 실패. 같은 전송을 `eth_estimateGas`로 부르면 `AnyOfRejected(ExceededPeriodicVolume(10000000000000000000000000, 10005000000000000000000000, 1790380800), EasNoAttestationReceived(0x5336F019Bd8E9E0064be7330833dc883a8a6c94d))` |
| 원인 | faucet 계정이 전역 정책의 24시간 한도(1,000만 OKRW)를 다 썼고 KYC 증명이 없음 |
| 기간 | 2026-09-25 16:41 UTC 첫 실패, 19:08 UTC 원인 확인, 2026-09-26 00:00 UTC(`resetAt`) 뒤 00:00:22 UTC에 두 지갑 모두 받음. 발급자 지갑의 첫 요청은 `Missing or invalid parameters`로 실패하고 15초 뒤 두 번째 요청에 받음 |
| 재현 | `pnpm a:probe-global` ([기록](../track-a-explain/evidence/live/probe-global-policy-20260925T190841Z.json)) |

## 2. Clairveil 로컬 `[Local]`

| 단계 | 기록 | 실행 시각 | 결과 |
| --- | --- | --- | --- |
| 3단계 차폐 정산 | [vendor-settlement-20260925T195750Z.md](evidence/local/vendor-settlement-20260925T195750Z.md) | 2026-09-25 19:57 | 미리 빌드한 바이너리로 61초. 예치 여섯 건, 협력사 A 일괄 지급, 협력사 B 수신자 암호화 지급, 스캔, 역할별 해독(`verified=true`), 단독 인출 실패(code 1)와 같은 블록 우회 인출 성공 |

## 3. 사전 준비와 검증

| 항목 | 결과 |
| --- | --- |
| `pnpm b:prepare` | 이 머신에서 108초(바이너리 두 개와 회로 산출물) |
| `pnpm b:fund --file <주소 파일> --amount 10` | 2026-09-26 04:27 UTC. 진행자 가이드 전날 3~4번 순서대로 주소 파일을 만들어 구매 기업 지갑에서 자기 협력사 지갑 둘에 보냄. 두 주소 모두 사전 검사 통과(가스 283,524), 전송 성공, 기록 남음. 한 건 수수료 2.551716 OKRW. 그때 구매 기업 지갑이 Track C 실증의 에이전트 지갑이어서 가스가 컸고, 일반 지갑이면 약 104,000(수수료 약 0.94 OKRW) [fund-20260926T042738Z.json](evidence/live/fund-20260926T042738Z.json) |
| `pnpm b:check` | 필수 항목 모두 ✓. 권장 항목 중 잔액만 ! |
| `pnpm b:smoke` | 2026-09-26 00:02 UTC, 91초. b:check, 1~5단계와 성공 기준(2단계 5·6b·7c 거부와 6d 성공, 3단계 협력사 B 해독과 인출 성공, 4단계 분류) 모두 통과. 세션 기록 [session-20260926T000329Z.md](evidence/session-20260926T000329Z.md). 첫 실행(2026-09-25 20:01 UTC, 잔액 0으로 2단계 제외, 64초)의 세션 기록은 [session-20260925T200201Z.md](evidence/session-20260925T200201Z.md) |
| `pnpm b:smoke`(2026-09-27 재실행) | 2026-09-27 08:56 UTC, 105초. 지갑의 가스 한도를 노드 추정값의 125%로 바꾼 뒤. b:check, 1~5단계와 성공 기준 모두 통과. 2단계 거부 셋(5 `EasNoAttestationReceived`, 6b·7c `EasAttestationRevoked`, 같은 지갑의 재실행이라 T8)은 한도 300,000의 50.0%, 구매 기업 128.19 OKRW 사용. 세션 기록 [session-20260927T085834Z.md](evidence/session-20260927T085834Z.md), [2단계 기록](evidence/live/pcl-kyb-gate-20260927T085726Z.json) |
