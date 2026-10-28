# Track B 증거 목록

워크샵 경로를 실제로 실행한 기록입니다. 시각은 UTC입니다. 네트워크: Maroo 테스트넷(chain ID 450815, RPC `https://rpc-testnet.maroo.io`)과 Clairveil v0.4.0 로컬 체인. 실행 환경: Linux(WSL2), Node.js 24.19, pnpm 11.25, Go 1.27.1, Foundry 1.8.1.

## 1. Maroo 테스트넷 `[Live Testnet]`

테스트넷에서 실행한 1단계, 2단계, 4단계의 기록입니다. 기록 열은 코드가 남긴 JSON 파일이고, 예상 결과 열과 실제 결과 열을 견주어 읽습니다.

| 단계 | 기록 | 실행 시각 | 호출 대상과 입력 | 예상 결과 | 실제 결과 |
| --- | --- | --- | --- | --- | --- |
| 1단계 연결 | [step1-connect-20260925T195533Z.json](evidence/live/step1-connect-20260925T195533Z.json) | 2026-09-25 19:55 | `eth_chainId`, 역할 다섯의 잔액, `IPcl.contractPolicies(Privacy)`, `IPcl.globalPolicies`, Indexer의 구매 기업 본인 인증 증명 수 | chain ID 450815, 정책 조회 | chain ID 450815, Privacy `And(EAS_POLICY, DENYLIST_POLICY)`, 전역 정책 트리, 증명 0개. 잔액은 모두 0 |
| 1단계 연결(후속 재실행) | [step1-connect-20261023T071539Z.json](evidence/live/step1-connect-20261023T071539Z.json) | 2026-10-23 07:15 | 위 행과 같은 조회 | 같은 정책 | chain ID 450815, Privacy `And(EAS_POLICY, DENYLIST_POLICY)`, 관리자 `0x58eC…804F`, 전역 정책 트리, 구매 기업 증명 0개. 역할 지갑 다섯 가운데 넷에 잔액 |
| 2단계 금고 | [pcl-kyb-gate-20260926T000228Z.json](evidence/live/pcl-kyb-gate-20260926T000228Z.json) | 2026-09-26 00:02 | OKRW 이체, KYB 스키마(재사용), 금고 배포와 정책 바인딩, 입금, 청구 거부 셋과 통과 하나, 폐기, 회수 | [참가자 가이드 2단계](participant-guide.md#2단계-kyb-관문이-걸린-정산-금고-15분-live-testnet)의 성공 기준 | 모두 충족. 금고 `0x6980C889…9A70`. 5 `EasNoAttestationReceived`, 6b `EasAttestationRevoked`(A 실행에서 폐기한 증명이 색인돼 있어서), 6d 성공, 7c `EasAttestationRevoked` |
| 2단계 금고(후속 재실행) | [pcl-kyb-gate-20261023T071613Z.json](evidence/live/pcl-kyb-gate-20261023T071613Z.json) | 2026-10-23 07:16 | 위 행과 같은 흐름. 블록 21429730\~21429757 | 같은 성공 기준 | 모두 충족. 5 `EasNoAttestationReceived`, 6b와 7c `EasAttestationRevoked`(같은 지갑의 재실행, T8), 6d 성공. 거부 셋은 300,000의 50.0%. 구매 기업 128.19 OKRW, 발급자 5.86 OKRW 사용 |
| 4단계 분류 | [step4-diagnose-20260926T000329Z.json](evidence/live/step4-diagnose-20260926T000329Z.json) | 2026-09-26 00:03 | 2단계 기록의 거부와 통과, 증명 없는 협력사 B의 `claim()`을 `eth_estimateGas`로 재시뮬레이션, 빈 요청의 `Privacy.deposit`을 `eth_call`과 `eth_estimateGas`, 잔액보다 큰 예치 | 네 분류 모두 출력 | 정책 거부(2단계 5·6b·7c, 재시뮬레이션 `EasNoAttestationReceived`), 성공(6d, 로컬 인출), 증명·입력 거부(`SDKInvalidRequest()` 두 건), 인프라·자료 부재(공개되지 않은 증명 재료, 잔액 부족), 참조 구현 문제(로컬 단독 인출). 2단계를 뺀 첫 실행 기록은 [step4-diagnose-20260925T195916Z.json](evidence/live/step4-diagnose-20260925T195916Z.json) |
| 4단계 분류(거부 해석기) | [step4-diagnose-20261023T051054Z.json](evidence/live/step4-diagnose-20261023T051054Z.json) | 2026-10-23 05:10 | 위 행의 경우에 더해, 협력사 A가 부른 금고 `fund()`, 구매 기업이 2,000,001 OKRW를 싣는 `fund()`(잔액 덮어쓰기), 가스 한도 21,000으로 보낸 이체 tx를 거부 해석기로 풂 | 네 분류 모두 출력. 거부 행마다 오류 선택자와 계열 | 정책 거부는 컨트랙트 정책(2단계 5·6b·7c, `claim()` 재시뮬레이션)과 전역 정책(`fund()` 2,000,001 OKRW)으로 갈림. `NotBuyer()`는 대상 컨트랙트 로직, 21,000 이체는 가스 부족, `SDKInvalidRequest()`는 프리컴파일 요청 검증 |

### 2단계 주요 tx

2026-09-26 00:02 UTC 실행 `[Live Testnet]` [기록](evidence/live/pcl-kyb-gate-20260926T000228Z.json). 탐색기 링크를 열면 받는 주소(금고), 보낸 주소, 결과(성공 또는 실패)를 볼 수 있습니다.

| 단계 | 결과와 상태 변화 | tx |
| --- | --- | --- |
| 3b PCL 프록시 배포 | 금고 `0x6980C8892072539D1A08007D10F0A496F4ff9A70`. 정책 관리자는 구매 기업, ProxyAdmin 소유자는 `UPGRADE_OWNER` | [0x1b7e…eee1](https://explorer-testnet.maroo.io/tx/0x1b7e8376ed4b17e7c97566ec12132cd79480c6da6abd9d96927017e71ca2eee1) |
| 5 협력사 B 청구 | 거부, `EasNoAttestationReceived` | [0x8183…4f0d](https://explorer-testnet.maroo.io/tx/0x818318c4370cfb3720a816292e95392312021917feff1c8eb6d3bfc44a5d4f0d) |
| 6b 색인 전 청구 | 거부, `EasAttestationRevoked`(같은 협력사 지갑의 두 번째 실행이라 A 실행에서 폐기한 증명이 색인돼 있음, 트러블슈팅 T8) | [0x4431…8f09](https://explorer-testnet.maroo.io/tx/0x4431a8f09ee74bded2f2319836748da41dbf47747ee026ed9f267f437c448f09) |
| 6d 색인 뒤 청구 | 성공. 협력사 A 잔액 153.19 → 250.42 OKRW(100 수령, 가스 지불) | [0xf41e…3c79](https://explorer-testnet.maroo.io/tx/0xf41efa60c0b46f324e7ec5d78286b5bf5ddaafe83df97a67422be8cf16bd3c79) |
| 7c 폐기 뒤 청구 | 거부, `EasAttestationRevoked` | [0xb7cb…8e61](https://explorer-testnet.maroo.io/tx/0xb7cbf7b7c2fc0c4ec1a43120e935373cc58ae793ad1f6351d3bbcdda49ee8e61) |
| 8 협력사 A 몫 회수 | 성공 | [0xc0f5…b3e5](https://explorer-testnet.maroo.io/tx/0xc0f522bce74a8473e1e0f8ffbe2b40c288fa234985597be265b23ab8424db3e5) |
| 8 협력사 B 몫 회수 | 성공. 회수 뒤 두 몫 0, 구매 기업 잔액 4,425.97 → 4,621.75 OKRW | [0xd460…2e2d](https://explorer-testnet.maroo.io/tx/0xd46082d7ac482f28581acfe1ad2928053920c524327e2140fa1709e14fbd2e2d) |

- 쓴 OKRW: 구매 기업 4,749.94 → 4,621.75(128.19, 협력사 A가 받은 100과 가스), 발급자 4,991.90 → 4,986.05(5.86, 가스). 가스 보충은 이미 잔액이 있어 건너뛰었습니다.
- 확인 방법: 거부 tx는 탐색기에서 실패로 보이고, 사유는 기록 파일의 `reason`에 있습니다. 같은 호출을 직전 블록 상태로 다시 시뮬레이션하면 같은 사유가 나옵니다(`pnpm c:judge`가 이 방식으로 확인합니다).

### faucet 장애와 복구

2026-09-25에 테스트넷 faucet 요청이 실패했고 2026-09-26에 복구되었습니다. 항목 열은 오류, 원인, 기간, 재현 방법이고, 내용 열이 각각의 확인 결과입니다.

| 항목 | 내용 |
| --- | --- |
| 오류 | faucet 요청이 `Transaction failed … reverted with the following signature:.`로 실패. 같은 전송을 `eth_estimateGas`로 부르면 `AnyOfRejected(ExceededPeriodicVolume(10000000000000000000000000, 10005000000000000000000000, 1790380800), EasNoAttestationReceived(0x5336F019Bd8E9E0064be7330833dc883a8a6c94d))` |
| 원인 | faucet 계정의 전역 정책 24시간 한도(1,000만 OKRW) 소진과 KYC 증명 부재 |
| 기간 | 2026-09-25 16:41 UTC 첫 실패, 19:08 UTC 원인 확인, 2026-09-26 00:00 UTC(`resetAt`) 뒤 00:00:22 UTC에 두 지갑 모두 수령. 발급자 지갑의 첫 요청은 `Missing or invalid parameters`로 실패하고 15초 뒤 두 번째 요청에서 수령 |
| 재현 | `pnpm a:probe-global` ([기록](../track-a-explain/evidence/live/probe-global-policy-20260925T190841Z.json)) |
| 지갑 하나의 한도 | 2026-10-23 12:46 UTC. 잔액 7.59 OKRW인 시험용 진행자 지갑에 faucet을 세 번 요청해 앞의 두 번은 5,000 tOKRW씩 받았고([첫째](https://explorer-testnet.maroo.io/tx/0x5bbe2e576125a1df8a7a903bec8ebd921b1edcf253cacc9fb1f5269f9930f19e), [둘째](https://explorer-testnet.maroo.io/tx/0x3f51f131a10bc989c33054d89c4d9f1372ff89864f934697708fb5ca156f4a3f)), 잔액 10,007.59에서 셋째 요청은 `Your balance exceeds the maximum allowed. You already have enough Maroo Testnet tokens.`로 거절되었습니다 |
| 요청 횟수 한도 | 2026-10-28 14:08:20\~14:09:20 UTC에 한 머신에서 주소 두 개로 다섯 번 받은 뒤 여섯째 요청이 `Too many requests. Please try again after 10 minutes`로 거절됨. 14:18:17 요청도 같은 문구로 거절되고, 첫 수령에서 10분이 지난 14:18:21 요청은 받음([받은 tx](https://explorer-testnet.maroo.io/tx/0x2473bd802e01409765bfed55cdffb2dabef6a6237676dd868d82a27b1fe05784)). 주소와 상관없이 10분에 다섯 번까지로 보이는 결과 |

## 2. Clairveil 로컬 `[Local]`

Clairveil v0.4.0 로컬 체인에서 실행한 3단계와 선택 연습의 기록입니다. 결과 열이 그 실행에서 확인한 동작입니다.

| 단계 | 기록 | 실행 시각 | 결과 |
| --- | --- | --- | --- |
| 3단계 차폐 정산 | [vendor-settlement-20260925T195750Z.md](evidence/local/vendor-settlement-20260925T195750Z.md) | 2026-09-25 19:57 | 미리 빌드한 바이너리로 61초. 예치 여섯 건, 협력사 A 일괄 지급, 협력사 B 수신자 암호화 지급, 스캔, 역할별 해독(`verified=true`), 단독 인출 실패(code 1)와 같은 블록 우회 인출 성공 |
| 3단계 차폐 정산(후속 재실행) | [vendor-settlement-20261023T071614Z.md](evidence/local/vendor-settlement-20261023T071614Z.md) | 2026-10-23 07:16 | 같은 흐름. 단독 인출 실패(code 1)와 같은 블록 우회 인출 성공, 기록의 절 머리에 표 설명을 더한 판 |
| 선택 연습, 기본 요청 거절 | [audit-drill-20261023T055007Z.json](evidence/local/audit-drill-20261023T055007Z.json) | 2026-10-23 05:50 | `pnpm b:audit-drill --decide reject`. 협력사 B 사건에 협력사 A 지급 두 건까지 넣은 요청을 외부감사인이 거절해 아무것도 열리지 않았습니다. 승인 하나와 부분값 하나로 열리지 않는 확인도 들었습니다 |
| 선택 연습, 좁은 요청 승인 | [audit-drill-20261023T055008Z.json](evidence/local/audit-drill-20261023T055008Z.json) | 2026-10-23 05:50 | `pnpm b:audit-drill --narrow --decide approve`. 협력사 B 지급 한 건만 열림(금액 15, 체인 disclosure 해시와 일치). 협력사 A 두 건은 같은 부분값으로 복호되지 않았습니다 |

## 3. 사전 준비와 검증

워크샵 전날 실행하는 명령(`b:prepare`, `b:fund`, `b:check`, `b:smoke`, `b:reset`)을 실제로 돌린 결과입니다. 결과 열에 실행 시각과 걸린 시간을 적었습니다.

| 항목 | 결과 |
| --- | --- |
| `pnpm b:prepare` | 이 머신에서 108초(바이너리 두 개와 회로 산출물) |
| `pnpm b:fund --file <주소 파일> --amount 10` | 2026-09-26 04:27 UTC. 진행자 가이드 전날 3\~4번 순서대로 주소 파일을 만들어 구매 기업 지갑에서 자기 협력사 지갑 둘에 보냄. 두 주소 모두 사전 검사 통과(가스 283,524), 전송 성공, 기록 남음. 한 건 수수료 2.551716 OKRW. 그때 구매 기업 지갑이 Track C 실증의 에이전트 지갑이어서 가스가 컸고, 일반 지갑이면 약 104,000(수수료 약 0.94 OKRW) [fund-20260926T042738Z.json](evidence/live/fund-20260926T042738Z.json) |
| `pnpm b:fund` 실패 시험(2026-10-23) | 12:45\~12:47 UTC, 시험용 진행자 지갑에서 새 주소에 10 OKRW씩. 레퍼런스 앱의 시험용 RPC 프록시로 실패를 일으킴. (1) 보낸 뒤 응답이 끊김: 보냈는지 모른다며 tx 링크를 보이고 멈춤([기록](evidence/live/fund-20261023T124545Z.json)). 다시 실행하자 그 주소는 10 OKRW가 있어 건너뛰고, 다음 주소에 보낸 뒤 셋째 주소에서 진행자 잔액 7.59 OKRW로 멈추고 faucet 명령을 출력함([기록](evidence/live/fund-20261023T124601Z.json)). faucet으로 받은 뒤 다시 실행하자 두 주소를 건너뛰고 셋째에만 보냄([기록](evidence/live/fund-20261023T124650Z.json)). (2) 보내기가 노드에 닿지 않음: 멈춘 뒤 다시 실행하자 같은 논스로 서명한 같은 tx(`0x1f12456f…`)가 한 번 들어감([멈춤](evidence/live/fund-20261023T124656Z.json), [다시 실행](evidence/live/fund-20261023T124658Z.json)). (3) 응답이 끊긴 뒤 2초 만에 다시 실행: 블록에 들어가기 전의 tx는 pending 논스와 `eth_getTransactionByHash`에 보이지 않아 받는 주소 잔액이 0이었고, 같은 tx를 다시 보내 노드가 `already known`으로 답함. 받은 금액은 10 OKRW 한 번([멈춤](evidence/live/fund-20261023T124725Z.json), [다시 실행](evidence/live/fund-20261023T124727Z.json)). (4) 사전 검사에 HTTP 429: 보내지 않고 RPC 문제(T5)로 멈춤(기록 없음, 콘솔 출력). (5) 13:28 UTC, 응답이 끊긴 뒤 곧바로 다시 실행: 받는 주소 잔액을 읽을 때는 0이었고, 다시 서명한 같은 tx(`0x0bf03bc3…`)를 보낼 때는 앞 tx가 블록에 들어가 노드가 `nonce too low: next nonce 11, tx nonce 10`으로 답함. 화면에 그 문구를 보이고 멈춤. 다음 실행은 그 주소에 1 OKRW가 있어 건너뜀([끊김](evidence/live/fund-20261023T132842Z.json), [곧바로 다시](evidence/live/fund-20261023T132844Z.json), [다음 실행](evidence/live/fund-20261023T132855Z.json)). (1)과 (2)의 멈춤 기록은 남은 주소 수에 보냈는지 모르는 주소를 넣기 전, (3)의 다시 실행 기록은 노드 문구를 화면에 보이기 전의 코드로 돌린 것입니다. 노드 문구를 보이는 코드는 (5)에서 확인했습니다. 한 건 수수료 0.934 OKRW |
| `pnpm b:check` | 필수 항목 모두 ✓. 권장 항목 중 잔액만 ! |
| `pnpm b:smoke` | 2026-09-26 00:02 UTC, 91초. b:check, 1\~5단계와 성공 기준(2단계 5·6b·7c 거부와 6d 성공, 3단계 협력사 B 해독과 인출 성공, 4단계 분류) 모두 통과. 세션 기록 [session-20260926T000329Z.md](evidence/session-20260926T000329Z.md). 첫 실행(2026-09-25 20:01 UTC, 잔액 0으로 2단계 제외, 64초)의 세션 기록은 [session-20260925T200201Z.md](evidence/session-20260925T200201Z.md) |
| `pnpm b:smoke`(2026-09-27 재실행) | 2026-09-27 08:56 UTC, 105초. 지갑의 가스 한도를 노드 추정값의 125%로 바꾼 뒤. b:check, 1\~5단계와 성공 기준 모두 통과. 2단계 거부 셋(5 `EasNoAttestationReceived`, 6b·7c `EasAttestationRevoked`, 같은 지갑의 재실행이라 T8)은 한도 300,000의 50.0%, 구매 기업 128.19 OKRW 사용. 세션 기록 [session-20260927T085834Z.md](evidence/session-20260927T085834Z.md), [2단계 기록](evidence/live/pcl-kyb-gate-20260927T085726Z.json) |
| `pnpm b:smoke`(2026-10-23 재실행) | 2026-10-23 07:15 UTC와 08:17 UTC 두 번, 모두 108초. 08:17 실행부터 스모크 테스트가 확인 결과와 걸린 시간을 [스모크 기록](evidence/smoke-20261023T081905Z.md)으로 남깁니다(그 실행의 [세션 기록](evidence/session-20261023T081905Z.md), 3단계 [기록](evidence/local/vendor-settlement-20261023T081756Z.md) 실행 시간 60초). 아래는 07:15 실행의 기록입니다. 선택 연습(`b:audit-drill`의 거절과 좁은 승인)과 거부 해석기를 쓰는 4단계를 더한 뒤. b:check, 1\~5단계, 선택 연습과 성공 기준 모두 통과. 4단계 분류는 [05:10 기록](evidence/live/step4-diagnose-20261023T051054Z.json)과 같음. 세션 기록 [session-20261023T071723Z.md](evidence/session-20261023T071723Z.md), [2단계 기록](evidence/live/pcl-kyb-gate-20261023T071613Z.json), [4단계 기록](evidence/live/step4-diagnose-20261023T071722Z.json) |
| `pnpm b:prepare`(2026-10-28 깨끗한 클론) | 2026-10-28 14:08\~14:11 UTC. GitHub에서 새로 받은 클론에서 `pnpm install`과 합쳐 3분 4초. 그 클론의 `.work/prebuilt/` 압축(Linux x86_64, 337MB)을 푼 두 번째 클론에서는 「이미 있습니다(ca85b027)」로 빌드를 건너뛰고 22초 |
| `pnpm b:check`, `pnpm b:smoke`(2026-10-28 깨끗한 클론) | 2026-10-28 14:14 UTC. 필수 항목 모두 ✓, 스모크 테스트 108초에 모두 통과. [스모크 기록](evidence/smoke-20261028T141617Z.md), [세션 기록](evidence/session-20261028T141617Z.md) |
| `pnpm b:fund --amount 10`(2026-10-28 새 진행자 지갑) | 2026-10-28 14:16 UTC. `pnpm setup:wallets`로 만든 진행자 지갑(`~/.config/maroo-integration-lab/facilitator.env`)에 faucet으로 10,000을 받고, 같은 파일의 ISSUER에 받은 14,995를 옮긴 뒤(24,995 OKRW) 실행. 1,000 OKRW 넘게 가진 주소 하나는 건너뛰고 새 주소 하나에 10 OKRW(사전 검사 가스 103,789). 그 뒤 faucet과 옮기기를 되풀이해 진행자 지갑의 잔액은 34,983 OKRW(34명분). [기록](evidence/live/fund-20261028T141636Z.json) |
| `pnpm b:reset` | 2026-09-27 18:55 UTC. 로컬 실행 폴더 3개 삭제, 켜져 있던 노드 없음. 미리 빌드한 바이너리(`.work/prebuilt`), 지갑 파일, 기록은 남음. 바로 이어 돌린 `pnpm review --local`이 79초에 9단계 모두 통과(로컬 차폐 정산 60초)했고 `git status` 변경 0줄 |

## 4. 검증한 것과 검증하지 못한 것

### 검증한 것

- 테스트넷 연결, 역할 지갑의 잔액, Privacy 프리컴파일에 걸린 정책을 워크샵 1단계 명령으로 조회할 수 있다는 것
- PCL 프록시 금고에서 KYB 증명의 유무, 색인, 폐기가 청구의 거부와 통과를 바꾼다는 것(2단계 tx 기록)
- 같은 지갑으로 2단계를 다시 돌리면 6b의 거부 사유가 `EasAttestationRevoked`로 바뀐다는 것(트러블슈팅 T8)
- Clairveil 로컬에서 예치, 지급, 스캔, 역할별 해독, 인출이 끝까지 실행된다는 것 `[Local]`
- 워크샵 결과가 성공, 정책 거부, 증명·입력 거부, 인프라·자료 부재의 네 분류로 나뉜다는 것(4단계 기록)
- 준비한 머신에서 `pnpm b:smoke` 한 번으로 1\~5단계와 성공 기준을 확인하고, `pnpm b:reset` 뒤에도 로컬 흐름이 다시 돈다는 것

### 검증하지 못한 것

- 테스트넷에서 유효한 Privacy 상태 변경. 필요한 재료 네 가지가 공개되지 않았고, 목록은 [참가자 가이드의 테스트넷 Privacy까지 남은 것](participant-guide.md#테스트넷-privacy까지-남은-것)에 있습니다.
- 3단계 로컬 결과가 Maroo 테스트넷에서도 같은지. 로컬에서 만든 증명과 tx는 Maroo 테스트넷 호환성의 증거가 되지 못합니다.
- 실제 참가자와 진행한 75분. 시간표는 이 머신의 실행 시간과 설명 분량으로 잡았습니다.
- Linux(WSL2) 밖의 운영체제와 CPU에서 사전 준비와 미리 빌드한 바이너리.
