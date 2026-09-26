# Track A 증거 목록

Track A 문서가 기대는 실행 기록을 모았습니다. 기록 파일은 명령을 다시 실행하면 새 시각으로 하나 더 생기고, 문서는 아래 파일을 가리킵니다.

- 라벨: `[Live Testnet]` Maroo 테스트넷(chain ID 450815, RPC `https://rpc-testnet.maroo.io`)에서 실행하거나 조회한 결과, `[Local]` Clairveil v0.4.0 로컬 체인에서 실행한 결과
- 시각은 UTC입니다. 한국 시각은 9시간을 더합니다.

## 1. Maroo 테스트넷 `[Live Testnet]`

| 기록 | 명령 | 호출 대상과 입력 | 실행 시각 | 예상 결과 | 실제 결과 |
| --- | --- | --- | --- | --- | --- |
| [inspect-privacy-boundary-20260925T192735Z.json](evidence/live/inspect-privacy-boundary-20260925T192735Z.json) | `pnpm a:inspect` | `PCL.contractPolicies(Privacy)`, `SchemaRegistry.getSchema`, `Indexer.getReceivedAttestationUIDCount(구매 기업, 스키마)`, 빈 요청의 `Privacy.deposit` eth_call, `IPrivacy`와 Clairveil v0.4.0 전송 필드 대조 | 2026-09-25 19:27:34, 블록 19095372 | Privacy에 비어 있지 않은 정책이 묶여 있고, 증명 없이 부른 예치는 거부됨 | 정책 `And(EAS_POLICY, DENYLIST_POLICY)`, 관리자 `0x58eC…804F`, 스키마 `bytes32 kakaoIdHash, uint8 version`, 구매 기업의 증명 0개, 예치 `SDKInvalidRequest()`, 필드 차이는 Clairveil 쪽 `creator` 하나 |
| [probe-first-failure-20260925T193314Z.json](evidence/live/probe-first-failure-20260925T193314Z.json) | `pnpm a:probe` | 구매 기업 주소에서 `Privacy.deposit`을 빈 요청, 무작위 값으로 모양만 갖춘 요청, 1 wei를 실은 요청으로 각각 `eth_call`과 `eth_estimateGas` | 2026-09-25 19:33:14 | 증명 재료가 없으므로 어느 층에서든 거부됨 | 빈 요청과 모양을 갖춘 요청은 두 방법 모두 `SDKInvalidRequest()`. 1 wei 요청은 잔액 부족 |
| [probe-global-policy-20260925T190841Z.json](evidence/live/probe-global-policy-20260925T190841Z.json) | `pnpm a:probe-global` | faucet 계정 `0x5336…c94d`에서 구매 기업으로 5,000 OKRW 네이티브 전송을 `eth_call`과 `eth_estimateGas` | 2026-09-25 19:08:41 | faucet이 실패하던 원인이 전역 정책이면 `eth_estimateGas`에서 사유가 나옴 | `eth_call` 통과, `eth_estimateGas`는 `AnyOfRejected(ExceededPeriodicVolume(1e25, 1.0005e25, 1790380800), EasNoAttestationReceived(0x5336…c94d))` |
| [probe-global-policy-20260925T190843Z.json](evidence/live/probe-global-policy-20260925T190843Z.json) | `pnpm a:probe-global 0x5336F019Bd8E9E0064be7330833dc883a8a6c94d 0x720989a26EfC40b007d778e54382879cdaf389e8 1` | 같은 경로로 1 OKRW | 2026-09-25 19:08:43 | 금액과 관계없이 한도 초과면 거부됨 | 1 OKRW도 같은 사유로 거부 |
| [probe-kyc-holder-20260925T201710Z.json](evidence/live/probe-kyc-holder-20260925T201710Z.json) | `pnpm a:probe-kyc` | 인증 전용 지갑(주소 비공개)의 Privacy 스키마 증명 조회, 그 지갑과 구매 기업 지갑으로 빈 요청과 모양만 갖춘 요청의 `Privacy.deposit`을 `eth_call`, `eth_estimateGas` | 2026-09-25 20:17 | 본인 인증 증명이 있으면 다른 층에서 막힐 수 있음 | 증명 1개(발급자 `0xBfa4…0aE3`, 2026-09-25, 만료 없음). 두 지갑 모두 네 경우 `SDKInvalidRequest()` |
| [doc-claims-20260926T051350Z.json](evidence/live/doc-claims-20260926T051350Z.json) | `pnpm a:doc-claims` | Maroo Docs 페이지 다섯 곳의 문장, `OKRW.getParams()`, `PCL.contractPolicies(Privacy)`, 알려진 금고 구현으로 `deployPclProxy`를 빈 초기화와 `initialize()`로 eth_call(Transparent, UUPS). 페이지가 200이 아니면 판정하지 않음 | 2026-09-26 05:13:50 | 문서 개선 노트 1~5번의 주장이 문서와 체인에서 다시 확인됨 | 테스트넷 denom `atokrw`와 문서 예시 `aokrw`, 배포 주소 표(`/resources/contracts/deployed-contracts/`)에 Privacy 없음, 빈 초기화는 두 종류 모두 `execution reverted`이고 `initialize()`는 통과, 사유 코드 문서에 `eth_estimateGas` 언급 없음. 09-25 기록([doc-claims-20260925T191304Z.json](evidence/live/doc-claims-20260925T191304Z.json))은 배포 주소 페이지를 틀린 주소(404)로 읽어 이 기록으로 바꿈 |
| [pcl-kyb-gate-20260926T000141Z.json](evidence/live/pcl-kyb-gate-20260926T000141Z.json) | `pnpm a:kyb-gate` | OKRW 이체, KYB 스키마 등록, 금고 구현 배포와 Transparent PCL 프록시, `claim()`에 `EAS_POLICY` 바인딩, 입금, 청구 거부 셋과 통과 하나, 증명 폐기, 회수 | 2026-09-26 00:01, 블록 19111555~19111586 | [레시피 4절](runnable-recipe.md#4-kyb-관문이-걸린-정산-금고-live-testnet)의 단계별 예상 결과 | 모두 예상대로. 5, 6b `EasNoAttestationReceived`, 7c `EasAttestationRevoked`, 6d 성공(협력사 A +100 OKRW, 가스 제외). 구현 슬롯이 배포한 구현과 같고 정책 관리자와 업그레이드 권한이 다름. 구매 기업 250.06 OKRW, 발급자 8.10 OKRW 사용 |
| [pcl-kyb-gate-20260926T052641Z.json](evidence/live/pcl-kyb-gate-20260926T052641Z.json) | `pnpm a:kyb-gate`(새 지갑 파일, `MAROO_LAB_ENV`) | 금고 흐름 전체. 프록시 배포와 정책 바인딩을 Maroo 공식 SDK(`@maroo-chain/viem`)로 바꾼 뒤 첫 테스트넷 실행 | 2026-09-26 05:26, 블록 19130769~19130807 | 첫 실행과 같은 결과 | 5, 6b `EasNoAttestationReceived`, 7c `EasAttestationRevoked`, 6d 성공. 새 지갑이라 6b가 첫 실행 사유로 나옴. 구매 기업 311 OKRW(가스 보충 180, 협력사 A가 받은 100), 발급자 가스 6.3 OKRW 사용 |
| [probe-send-gas-20260926T052147Z.json](evidence/live/probe-send-gas-20260926T052147Z.json) | `pnpm a:probe-send-gas` | 구매 기업에서 자기 협력사 A로 1 OKRW 단순 이체. `eth_estimateGas`(1, 100 OKRW, 에이전트 지갑이 보낼 때), 가스 21,000으로 `eth_call`, 가스 21,000·추정값·추정값의 125%로 실제 전송 | 2026-09-26 05:21 | 문서 예시대로면 21,000 | 추정 104,017(일반 계정, 금액과 무관), 283,560(에이전트 지갑). `eth_call`은 21,000으로 통과. 21,000 전송은 되돌려지고 21,000을 모두 씀(수수료 0.189 OKRW). 추정값 전송 성공(수수료 0.936153 OKRW), 125% 전송도 104,017만 씀. 04:30 실행([probe-send-gas-20260926T043013Z.json](evidence/live/probe-send-gas-20260926T043013Z.json))의 283,524는 구매 기업 지갑이 에이전트 79의 지갑이던 때의 값 |

이전 실행 기록(`inspect-privacy-boundary-20260925T183013Z.json`, `probe-first-failure-20260925T183014Z.json`)도 같은 폴더에 남아 있습니다. 새 기록은 정책 결합 방식과 `eth_estimateGas` 결과를 더 담았습니다.

### 검증한 것

- Maroo 테스트넷 Privacy 프리컴파일에 걸린 정책의 구조, 요구하는 증명 스키마, 정책 관리자
- 구매 기업 주소가 전역 정책을 통과하고 Privacy 예치의 요청 검증에서 처음 막힌다는 것
- `eth_call`이 전역 정책을 평가하지 않는다는 것과, 테스트넷 faucet 실패의 원인
- Maroo `IPrivacy` 전송 요청과 Clairveil v0.4.0 `MsgTransfer`의 필드 대응
- PCL 프록시 금고에서 KYB 증명의 유무, 색인, 폐기가 청구 결과를 바꾸고, 업그레이드 권한과 정책 관리 권한이 나뉜다는 것
- 문서 개선 노트 1~5번의 근거
- 단순 OKRW 이체가 일반 계정은 약 104,000, 에이전트 지갑은 약 284,000 가스를 쓰고, 21,000으로 보내면 수수료만 내고 되돌려진다는 것(문서 개선 노트 7번)
- PCL 프록시의 컨트랙트 정책 거부 tx가 블록에 들어가 가스 한도의 절반을 낸다는 것(문서 개선 노트 8번, 가이드 1절 층 표)

### 검증하지 못한 것

- 테스트넷에서 유효한 Privacy 상태 변경. 현재 verifier와 맞는 회로 산출물, 차폐 상태 조회 경로, 성공한 예시 입력이 공개되지 않았습니다.
- Privacy 컨트랙트 정책이 요청 검증보다 먼저 평가되는지. 본인 인증 증명이 있는 지갑과 없는 지갑 모두 요청 검증에서 먼저 막혀 정책 층에 닿지 못했습니다.
- 금고 흐름 이외의 경로에서 PCL 거부를 tx로 남기는 것. 금고 흐름 밖에서 보낸 tx는 전역 정책을 통과한 단순 이체(가스 확인, 진행자 배분)입니다.

## 1-1. 코드 대조 `[코드 대조]`

| 기록 | 명령 | 대조한 것 | 결과 |
| --- | --- | --- | --- |
| [abi-compare-20260926T040350Z.json](evidence/code/abi-compare-20260926T040350Z.json) | `pnpm a:abi-compare` | `@maroo-chain/contracts` 0.0.9의 `IPrivacy` ABI와 ClairveilJS `fixtures/evm-privacy-precompile-v0.3.1.json`(함수 선택자, 이벤트 서명, 정규화한 ABI sha256). 정규화 규칙은 ClairveilJS `tools/verify-evm-contract.js`와 같음 | 함수 9개, 이벤트 5개 모두 같고 sha256도 같음(`ee29aa6a…cb31b`). Maroo ABI의 오류 50개는 대조 범위 밖 |
| [clairveiljs-tests-20260926T040910Z.json](evidence/code/clairveiljs-tests-20260926T040910Z.json) | `pnpm sdk:check` | ClairveilJS `faf220d5`의 자체 검사: EVM 계약 검증, 단위 테스트, Go fixture conformance 테스트(Node 24.19) | EVM 계약 v0.3.1 검증 통과. conformance 113/113 통과. 단위 575개 중 503 통과, 71 건너뜀(fixture가 필요한 것, SDK 설정), 1 실패: Web Locks API가 없을 때의 오류를 기대하는 테스트인데 Node 24에는 `navigator.locks`가 있어 전제가 맞지 않음. SDK가 Clairveil fixture와 맞는다는 근거이고 Maroo 호환 근거는 아님 |
| [probe-sdk-deposit-20260926T041213Z.json](evidence/code/probe-sdk-deposit-20260926T041213Z.json) | `pnpm a:probe-sdk` | ClairveilJS EVM 예치 준비(`prepareDeposit`)를 Maroo가 공개한 값(RPC, chain ID 450815, Privacy 주소, `atokrw`)과 모든 조회를 거절하는 차폐 상태 어댑터로 실행. 버리는 키로 서명, tx 없음 | 어댑터 없이는 프로필 생성에서 Cosmos RPC 요구. 어댑터를 넣으면 `fetchCircuitConfig`, `fetchAssetByDenom` 조회에서 멈추고 prover에 닿지 않음. SDK 필수 조회 12개 기록 |

## 2. Clairveil 로컬 `[Local]`

| 기록 | 명령 | 환경 | 실행 시각 | 결과 |
| --- | --- | --- | --- | --- |
| [vendor-settlement-20260925T181924Z.md](evidence/local/vendor-settlement-20260925T181924Z.md) | `pnpm setup:clairveil`, `pnpm a:local` | Clairveil `ca85b027`(v0.4.0), chain-id `vendor-settlement-local-1`, Go 1.27.1 linux/amd64 | 2026-09-25 18:19:24 | 예치 여섯 건, 협력사 A 일괄 지급(12, 8), 협력사 B 수신자 암호화 지급(15), 스캔과 해독(협력사, self-view, 감사인), 인출 단독 실패와 같은 블록 우회 성공, 준비금 불변식 `invariant_holds=true` |
| [vendor-settlement-20260926T041658Z.md](evidence/local/vendor-settlement-20260926T041658Z.md) | `pnpm a:local --extras` | 같은 Clairveil v0.4.0, 미리 빌드한 바이너리 | 2026-09-26 04:16 | 1~4절은 첫 실행과 같은 흐름. 5절: 증명 하나짜리 일괄 지급(메시지 1, 출력 32, 실제 지급 3, 가스 1,615만), 대리 인출(보낸 계정은 중계자, 받는 주소와 금액 공개). 대리 인출은 0 노트 예치를 먼저 보낸 뒤에야 같은 블록에서 성공(순서를 정하지 않은 첫 실행은 세 번 모두 스냅샷 오류) |

### 검증한 것

- 차폐 정산 전체 순서가 참조 구현에서 끝까지 실행됨
- 역할마다 자기 키로 볼 수 있는 것과, 제3자가 공개 체인에서 읽을 수 있는 필드
- 감사인이 일괄 지급의 모든 메시지를 풀 수 있음(메시지마다 감사 암호문을 따로 해독)
- Clairveil v0.4.0 인출의 Merkle 루트 스냅샷 재등록 실패와 같은 블록 우회

### 검증하지 못한 것

- 이 결과가 Maroo 테스트넷에서도 같은지. 로컬에서 만든 증명과 tx는 Maroo 테스트넷 호환성의 증거가 되지 못합니다.
- 원격 prover를 쓸 때의 노출 범위. 로컬 실행은 CLI 안에서 증명을 만듭니다.
