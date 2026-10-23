# Track A 증거 목록

Track A 문서가 기대는 실행 기록을 모았습니다. 기록 파일은 명령을 다시 실행하면 새 시각으로 하나 더 생기고, 문서는 아래 파일을 가리킵니다.

- 라벨: `[Live Testnet]` Maroo 테스트넷(chain ID 450815, RPC `https://rpc-testnet.maroo.io`)에서 실행하거나 조회한 결과, `[Local]` Clairveil v0.4.0 로컬 체인에서 실행한 결과
- 시각은 UTC입니다. 한국 시각은 9시간을 더합니다.

## 1. Maroo 테스트넷 `[Live Testnet]`

테스트넷에서 실행한 명령마다 기록 파일과 호출 대상, 실행 시각, 예상 결과, 실제 결과를 모았습니다. 실제 결과 열은 기록 파일에 남은 값입니다.

| 기록 | 명령 | 호출 대상과 입력 | 실행 시각 | 예상 결과 | 실제 결과 |
| --- | --- | --- | --- | --- | --- |
| [inspect-privacy-boundary-20260925T192735Z.json](evidence/live/inspect-privacy-boundary-20260925T192735Z.json) | `pnpm a:inspect` | `PCL.contractPolicies(Privacy)`, `SchemaRegistry.getSchema`, `Indexer.getReceivedAttestationUIDCount(구매 기업, 스키마)`, 빈 요청의 `Privacy.deposit` eth_call, `IPrivacy`와 Clairveil v0.4.0 전송 필드 대조 | 2026-09-25 19:27:34, 블록 19095372 | Privacy에 비어 있지 않은 정책이 묶여 있고, 증명 없이 부른 예치는 거부됩니다 | 정책 `And(EAS_POLICY, DENYLIST_POLICY)`, 관리자 `0x58eC…804F`, 스키마 `bytes32 kakaoIdHash, uint8 version`, 구매 기업의 증명 0개, 예치 `SDKInvalidRequest()`, 필드 차이는 Clairveil 쪽 `creator` 하나 |
| [inspect-privacy-boundary-20261023T071335Z.json](evidence/live/inspect-privacy-boundary-20261023T071335Z.json) | `pnpm a:inspect` | 위 행과 같은 조회(후속 재실행) | 2026-10-23 07:13:35, 블록 21429602 | 2026-09-25 기록과 같은 값 | 정책, 관리자 `0x58eC…804F`, 요구 스키마, 구매 기업의 증명 0개, 예치 `SDKInvalidRequest()`, 필드 대조 모두 2026-09-25 기록과 같은 값 |
| [probe-first-failure-20260925T193314Z.json](evidence/live/probe-first-failure-20260925T193314Z.json) | `pnpm a:probe` | 구매 기업 주소에서 `Privacy.deposit`을 빈 요청, 무작위 값으로 모양만 갖춘 요청, 1 wei를 실은 요청으로 각각 `eth_call`과 `eth_estimateGas` | 2026-09-25 19:33:14 | 증명 재료가 없으므로 어느 층에서든 거부됩니다 | 빈 요청과 모양을 갖춘 요청은 두 방법 모두 `SDKInvalidRequest()`. 1 wei 요청은 잔액 부족 |
| [probe-first-failure-20261023T071333Z.json](evidence/live/probe-first-failure-20261023T071333Z.json) | `pnpm a:probe` | 위 행과 같은 세 요청(후속 재실행). 구매 기업 지갑에 잔액이 있는 상태 | 2026-10-23 07:13:33 | 같은 층에서 거부됩니다 | 세 요청 모두 두 방법에서 `SDKInvalidRequest()`. 잔액이 있으면 1 wei 요청도 요청 검증에서 막힌다는 확인 |
| [probe-global-policy-20260925T190841Z.json](evidence/live/probe-global-policy-20260925T190841Z.json) | `pnpm a:probe-global` | faucet 계정 `0x5336…c94d`에서 구매 기업으로 5,000 OKRW 네이티브 전송을 `eth_call`과 `eth_estimateGas` | 2026-09-25 19:08:41 | faucet이 실패하던 원인이 전역 정책이면 `eth_estimateGas`에서 사유가 나옵니다 | `eth_call` 통과, `eth_estimateGas`는 `AnyOfRejected(ExceededPeriodicVolume(1e25, 1.0005e25, 1790380800), EasNoAttestationReceived(0x5336…c94d))` |
| [probe-global-policy-20260925T190843Z.json](evidence/live/probe-global-policy-20260925T190843Z.json) | `pnpm a:probe-global 0x5336F019Bd8E9E0064be7330833dc883a8a6c94d 0x720989a26EfC40b007d778e54382879cdaf389e8 1` | 같은 경로로 1 OKRW | 2026-09-25 19:08:43 | 금액과 관계없이 한도 초과면 거부됩니다 | 1 OKRW도 같은 사유로 거부 |
| [probe-global-compare-20261023T042452Z.json](evidence/live/probe-global-compare-20261023T042452Z.json) | `pnpm a:probe-global --over-limit` | KYC 증명이 없는 구매 기업 지갑에서 2,000,001 OKRW를 협력사 A로 이체, 같은 금액으로 금고 PCL 프록시 `fund()` 호출. 두 호출 모두 `eth_call`과 `eth_estimateGas`, 잔액은 상태 덮어쓰기 | 2026-10-23 04:24:52 | 이체는 `eth_call`만 통과하고, PCL 프록시 호출은 두 방법 모두 거부합니다 | 예상과 같음. 거부 사유는 `AnyOfRejected` 안의 `VolumeAboveMaxLimit(2,000,000 OKRW 한도, 2,000,001 OKRW)` |
| [probe-kyc-holder-20260925T201710Z.json](evidence/live/probe-kyc-holder-20260925T201710Z.json) | `pnpm a:probe-kyc` | 인증 전용 지갑(주소 비공개)의 Privacy 스키마 증명 조회, 그 지갑과 구매 기업 지갑으로 빈 요청과 모양만 갖춘 요청의 `Privacy.deposit`을 `eth_call`, `eth_estimateGas` | 2026-09-25 20:17 | 본인 인증 증명이 있으면 다른 층에서 막힐 수 있습니다 | 증명 1개(발급자 `0xBfa4…0aE3`, 2026-09-25, 만료 없음). 두 지갑 모두 네 경우 `SDKInvalidRequest()` |
| [doc-claims-20260926T051350Z.json](evidence/live/doc-claims-20260926T051350Z.json) | `pnpm a:doc-claims` | Maroo Docs 페이지 다섯 곳의 문장, `OKRW.getParams()`, `PCL.contractPolicies(Privacy)`, 알려진 금고 구현으로 `deployPclProxy`를 빈 초기화와 `initialize()`로 eth_call(Transparent, UUPS). 페이지가 200이 아니면 판정하지 않습니다 | 2026-09-26 05:13:50 | 문서 개선 노트 1\~5번의 주장이 문서와 체인에서 다시 확인됩니다 | 테스트넷 denom `atokrw`와 문서 예시 `aokrw`, 배포 주소 표(`/resources/contracts/deployed-contracts/`)에 Privacy 없음, 빈 초기화는 두 종류 모두 `execution reverted`이고 `initialize()`는 통과, 사유 코드 문서에 `eth_estimateGas` 언급 없음(문서 문장은 모두 2026-09-26 판 기준이고, 2026-10-23 판의 상태는 [문서 개선 노트](documentation-improvement-notes.md) 표에 있음). 09-25 기록([doc-claims-20260925T191304Z.json](evidence/live/doc-claims-20260925T191304Z.json))은 배포 주소 페이지를 틀린 주소(404)로 읽어 이 기록으로 바꿈 |
| [pcl-kyb-gate-20260926T000141Z.json](evidence/live/pcl-kyb-gate-20260926T000141Z.json) | `pnpm a:kyb-gate` | OKRW 이체, KYB 스키마 등록, 금고 구현 배포와 Transparent PCL 프록시, `claim()`에 `EAS_POLICY` 바인딩, 입금, 청구 거부 셋과 통과 하나, 증명 폐기, 회수 | 2026-09-26 00:01, 블록 19111555\~19111586 | [레시피 4절](runnable-recipe.md#4-kyb-관문이-걸린-정산-금고-live-testnet)의 단계별 예상 결과 | 모두 예상대로. 5, 6b `EasNoAttestationReceived`, 7c `EasAttestationRevoked`, 6d 성공(협력사 A +100 OKRW, 가스 제외). 구현 슬롯이 배포한 구현과 같고 정책 관리자와 업그레이드 권한이 다름. 구매 기업 250.06 OKRW, 발급자 8.10 OKRW 사용 |
| [pcl-kyb-gate-20260926T052641Z.json](evidence/live/pcl-kyb-gate-20260926T052641Z.json) | `pnpm a:kyb-gate`(새 지갑 파일, `MAROO_LAB_ENV`) | 금고 흐름 전체. 프록시 배포와 정책 바인딩을 Maroo 공식 SDK(`@maroo-chain/viem`)로 바꾼 뒤 첫 테스트넷 실행 | 2026-09-26 05:26, 블록 19130769\~19130807 | 첫 실행과 같은 결과 | 5, 6b `EasNoAttestationReceived`, 7c `EasAttestationRevoked`, 6d 성공. 새 지갑이라 6b가 첫 실행 사유로 나옴. 구매 기업 311 OKRW(가스 보충 180, 협력사 A가 받은 100), 발급자 가스 6.3 OKRW 사용 |
| [pcl-kyb-gate-20260927T083827Z.json](evidence/live/pcl-kyb-gate-20260927T083827Z.json) | `pnpm a:kyb-gate` | 금고 흐름 전체. 지갑이 보내는 tx의 가스 한도를 노드 추정값의 125%로 바꾼 뒤(`shared/lib/maroo.ts`의 `walletFor`) 첫 테스트넷 실행 | 2026-09-27 08:38, 블록 19227199\~19227225 | 같은 거부와 통과, 통과 tx는 한도의 약 80%를 씁니다 | 5 `EasNoAttestationReceived`, 6b와 7c `EasAttestationRevoked`(같은 지갑의 재실행, 트러블슈팅 T8), 6d 성공. 통과 tx 12건 모두 가스 한도의 80.0%(SDK의 `deployPclProxy`, `changeContractPolicies` 포함), 거부 tx 셋은 고정 한도 300,000의 50.0%. 구매 기업 128.19 OKRW(협력사 A가 받은 100과 가스), 발급자 5.86 OKRW 사용 |
| [pcl-kyb-gate-20261023T071331Z.json](evidence/live/pcl-kyb-gate-20261023T071331Z.json) | `pnpm a:kyb-gate` | 금고 흐름 전체(후속 재실행) | 2026-10-23 07:13, 블록 21429572\~21429598 | 2026-09-27 실행과 같은 거부와 통과 | 5 `EasNoAttestationReceived`, 6b와 7c `EasAttestationRevoked`(같은 지갑의 재실행, 트러블슈팅 T8), 6d 성공. 거부 tx 셋은 고정 한도 300,000의 50.0%. 구매 기업 128.19 OKRW, 발급자 5.86 OKRW 사용 |
| [probe-send-gas-20260926T052147Z.json](evidence/live/probe-send-gas-20260926T052147Z.json) | `pnpm a:probe-send-gas` | 구매 기업에서 자기 협력사 A로 1 OKRW 단순 이체. `eth_estimateGas`(1, 100 OKRW, 에이전트 지갑이 보낼 때), 가스 21,000으로 `eth_call`, 가스 21,000·추정값·추정값의 125%로 실제 전송 | 2026-09-26 05:21 | 2026-09-26 판 문서 예시대로면 21,000 | 추정 104,017(일반 계정, 금액과 무관), 283,560(에이전트 지갑). `eth_call`은 21,000으로 통과. 21,000 전송은 되돌려지고 21,000을 모두 씀(수수료 0.189 OKRW). 추정값 전송 성공(수수료 0.936153 OKRW), 125% 전송도 104,017만 씀. 04:30 실행([probe-send-gas-20260926T043013Z.json](evidence/live/probe-send-gas-20260926T043013Z.json))의 283,524는 구매 기업 지갑이 에이전트 79의 지갑이던 때의 값 |
| [watch-privacy/2026-10-23.json](evidence/live/watch-privacy/2026-10-23.json) | `pnpm a:watch-privacy` | Cosmos REST의 Clairveil 조회 경로 13개, 회로 설정, Clairveil 릴리스 압축 9개의 파일 sha256과 테스트넷 검증 키 대조, 빈 예치 요청, 공개 예치 calldata의 4층 시험, SDK 예치 준비(Cosmos REST), 탐색기의 Privacy tx, 문서와 릴리스 | 2026-10-23 07:41 UTC | 조회 경로 11개 응답, proving 재료 없음 | 조회 경로 11개가 200, `privacy_scan`과 `commitment_paths_at_root`가 501, `manifest_available` false, 릴리스 압축 9개(파일 2,233개)에 검증 키와 같은 파일 없음, 4층 시험 `EasNoAttestationReceived`(컨트랙트 정책), SDK가 증명 공급자까지 감, Privacy tx 251건 |
| [probe-public-privacy-20261023T064628Z.json](evidence/live/probe-public-privacy-20261023T064628Z.json), [probe-public-privacy-20261023T064922Z.json](evidence/live/probe-public-privacy-20261023T064922Z.json) | `pnpm a:probe-public` | 공개된 성공 예치(2026-09-17, 2026-09-01)의 calldata를 원래 지갑, 구매 기업, 인증 지갑(주소 비공개)에서 직전 블록과 최신 블록으로 | 2026-10-23 06:46, 06:49 UTC | 다른 지갑은 Privacy 정책에서 막힘 | 2026-09-17 예치: 원래 지갑 직전 블록 통과, 구매 기업 `EasNoAttestationReceived`, 인증 지갑 최신 블록 `SDKInvalidRequest()`. 2026-09-01 예치: 직전 블록에서 모든 지갑 `InternalError()` |
| [reject-gas-20260926T171442Z.json](evidence/live/reject-gas-20260926T171442Z.json), [reject-gas-20260926T171444Z.json](evidence/live/reject-gas-20260926T171444Z.json) | `pnpm a:reject-gas` | 금고 흐름 두 번(5, 6b, 7c)과 트랙 2 실증 두 번(4b)에서 정책에 걸린 tx 여덟 건의 영수증과 tx | 2026-09-26 17:14 | 2026-09-26 판 문서대로면 제출 시점에 걸러져 가스를 내지 않습니다 | 여덟 건 모두 블록에 들어가 되돌려졌고 가스 한도의 50.0%를 씀. 청구 150,000/300,000(1.35 OKRW), 결제 363,982/727,965와 364,011/728,023(약 3.28 OKRW) |
| [explain-examples-20261023T071511Z.json](evidence/live/explain-examples-20261023T071511Z.json) | `pnpm explain --examples` | 이 레포가 겪은 실패 다섯 계열(컨트랙트 정책 거부 둘, 가스 부족, 전역 정책 거부, 프리컴파일 요청 검증, 금고 로직)과 통과 tx 하나. tx 넷은 영수증과 직전 블록 재시뮬레이션, 셋은 시뮬레이션 | 2026-10-23 07:15 | 계열과 걸린 정책이 사례마다 맞게 나옵니다 | 일곱 사례 모두 예상한 계열. 전역 정책 사례는 대상에 묶인 컨트랙트 정책이 없어 전역 정책으로 판정. 05:08 실행([explain-examples-20261023T050841Z.json](evidence/live/explain-examples-20261023T050841Z.json))과 판정이 같고, 그 사례의 설명 문장만 바뀌었습니다 |

이전 실행 기록(`inspect-privacy-boundary-20260925T183013Z.json`, `probe-first-failure-20260925T183014Z.json`)도 같은 폴더에 남아 있습니다. 새 기록은 정책 결합 방식과 `eth_estimateGas` 결과를 더 담았습니다.

### 검증한 것

- Maroo 테스트넷 Privacy 프리컴파일에 걸린 정책의 구조, 요구하는 증명 스키마, 정책 관리자
- 구매 기업 주소의 Privacy 예치 요청이 전역 정책 거부 없이 요청 검증에서 처음 막힌다는 것
- PCL 프록시를 거치지 않는 OKRW 이체에서 `eth_call`이 전역 정책 거부를 돌려주지 않는다는 것과, 테스트넷 faucet 실패의 원인
- Maroo `IPrivacy` 전송 요청과 Clairveil v0.4.0 `MsgTransfer`의 필드 대응
- PCL 프록시 금고에서 KYB 증명의 유무, 색인, 폐기가 청구 결과를 바꾸고, 업그레이드 권한과 정책 관리 권한이 나뉜다는 것
- 문서 개선 노트 1\~5번의 근거
- 단순 OKRW 이체가 일반 계정은 약 104,000, 에이전트 지갑은 약 284,000 가스를 쓰고, 21,000으로 보내면 수수료만 내고 되돌려진다는 것(문서 개선 노트 7번)
- PCL 프록시의 컨트랙트 정책 거부 tx가 블록에 들어가 가스 한도의 절반을 낸다는 것(문서 개선 노트 8번, 가이드 1절 층 표)

### 검증하지 못한 것

- 이 레포가 만든 요청의 테스트넷 Privacy 상태 변경. 테스트넷 검증 키와 짝인 proving 재료가 공개되지 않았습니다. 차폐 상태 조회 경로는 Cosmos REST에서 응답합니다(2026-10-23, [감시 기록](evidence/live/watch-privacy/2026-10-23.json)).
- 정책 평가가 증명 검증보다 먼저인지. 2026-10-23에 공개된 성공 예치의 calldata로 다시 시험해 모양을 갖춘 요청은 Privacy 컨트랙트 정책까지 가는 것을 확인했지만, 예치 증명이 보낸 지갑에 묶이지 않아 검증을 지난 것인지는 가리지 못했습니다.
- 금고 흐름 이외의 경로에서 PCL 거부를 tx로 남기는 것. 금고 흐름 밖에서 보낸 tx는 전역 정책을 통과한 단순 이체(가스 확인, 진행자 배분)입니다.

## 1-1. 코드 대조 `[코드 대조]`

체인을 호출하지 않고 코드와 패키지를 대조한 기록을 모았습니다. 대조한 것 열은 비교한 두 대상이고, 결과 열은 비교 결과입니다.

| 기록 | 명령 | 대조한 것 | 결과 |
| --- | --- | --- | --- |
| [abi-compare-20260926T040350Z.json](evidence/code/abi-compare-20260926T040350Z.json) | `pnpm a:abi-compare` | `@maroo-chain/contracts` 0.0.9의 `IPrivacy` ABI와 ClairveilJS `fixtures/evm-privacy-precompile-v0.3.1.json`(함수 선택자, 이벤트 서명, 정규화한 ABI sha256). 정규화 규칙은 ClairveilJS `tools/verify-evm-contract.js`와 같습니다 | 함수 9개, 이벤트 5개 모두 같고 sha256도 같음(`ee29aa6a…cb31b`). Maroo ABI의 오류 50개는 대조 범위 밖 |
| [clairveiljs-tests-20260926T040910Z.json](evidence/code/clairveiljs-tests-20260926T040910Z.json) | `pnpm sdk:check` | ClairveilJS `faf220d5`의 자체 검사: EVM 계약 검증, 단위 테스트, Go fixture conformance 테스트(Node 24.19) | EVM 계약 v0.3.1 검증 통과. conformance 113/113 통과. 단위 575개 중 503 통과, 71 건너뜀(fixture가 필요한 것, SDK 설정), 1 실패: Web Locks API가 없을 때의 오류를 기대하는 테스트인데 Node 24에는 `navigator.locks`가 있어 전제가 맞지 않음. SDK가 Clairveil fixture와 맞는다는 근거이고 Maroo 호환 근거는 아님 |
| [probe-sdk-deposit-20260926T041213Z.json](evidence/code/probe-sdk-deposit-20260926T041213Z.json) | `pnpm a:probe-sdk` | ClairveilJS EVM 예치 준비(`prepareDeposit`)를 Maroo가 공개한 값(RPC, chain ID 450815, Privacy 주소, `atokrw`)과 모든 조회를 거절하는 차폐 상태 어댑터로 실행. 버리는 키로 서명, tx 없음 | 어댑터 없이는 프로필 생성에서 Cosmos RPC 요구. 어댑터를 넣으면 `fetchCircuitConfig`, `fetchAssetByDenom` 조회에서 멈추고 prover에 닿지 않음. SDK 필수 조회 12개 기록 |
| [probe-sdk-deposit-20261023T064326Z.json](evidence/code/probe-sdk-deposit-20261023T064326Z.json) | `pnpm a:probe-sdk --rest` | ClairveilJS EVM 예치 준비에 2026-10-23 판 문서가 Cosmos REST로 적은 주소를 넣었을 때 | 회로 설정, `atokrw` 자산 등록, 자산 ID 조회를 읽고 증명 공급자까지 갔습니다. 거절하는 어댑터로는 회로 설정 조회에서 멈춥니다 |

## 2. Clairveil 로컬 `[Local]`

Clairveil 로컬 체인에서 실행한 기록을 모았습니다. 환경 열은 실행에 쓴 Clairveil 판과 체인 ID이고, 결과 열은 실행 기록의 요약입니다.

| 기록 | 명령 | 환경 | 실행 시각 | 결과 |
| --- | --- | --- | --- | --- |
| [vendor-settlement-20260925T181924Z.md](evidence/local/vendor-settlement-20260925T181924Z.md) | `pnpm setup:clairveil`, `pnpm a:local` | Clairveil `ca85b027`(v0.4.0), chain-id `vendor-settlement-local-1`, Go 1.27.1 linux/amd64 | 2026-09-25 18:19:24 | 예치 여섯 건, 협력사 A 일괄 지급(12, 8), 협력사 B 수신자 암호화 지급(15), 스캔과 해독(협력사, self-view, 감사인), 인출 단독 실패와 같은 블록 우회 성공, 준비금 불변식 `invariant_holds=true` |
| [vendor-settlement-20261023T055418Z.md](evidence/local/vendor-settlement-20261023T055418Z.md) | `pnpm a:local --operator` | 같은 Clairveil v0.4.0, 미리 빌드한 바이너리 | 2026-10-23 05:54 | 기본 흐름에 더해 정산 대행사가 금액만 담은 사용자 공개 세 건을 풀어 협력사별 합계(A 10, B 5)를 냈고, 감사인 합계와 같았습니다(6절) |
| [vendor-settlement-20260926T041658Z.md](evidence/local/vendor-settlement-20260926T041658Z.md) | `pnpm a:local --extras` | 같은 Clairveil v0.4.0, 미리 빌드한 바이너리 | 2026-09-26 04:16 | 1\~4절은 첫 실행과 같은 흐름. 5절: 증명 하나짜리 일괄 지급(메시지 1, 출력 32, 실제 지급 3, 가스 1,615만), 대리 인출(보낸 계정은 중계자, 받는 주소와 금액 공개). 대리 인출은 0 노트 예치를 먼저 보낸 뒤에야 같은 블록에서 성공(순서를 정하지 않은 첫 실행은 세 번 모두 스냅샷 오류) |

### 검증한 것

- 차폐 정산 전체 순서가 참조 구현에서 끝까지 실행됨
- 역할마다 자기 키로 볼 수 있는 것과, 제3자가 공개 체인에서 읽을 수 있는 필드
- 감사인이 일괄 지급의 모든 메시지를 풀 수 있음(메시지마다 감사 암호문을 따로 해독)
- 정산 대행사가 금액만 담은 사용자 공개로 협력사별 합계를 내고, 그 합계가 감사인이 푼 금액의 합과 같다는 것
- Clairveil v0.4.0 인출의 Merkle 루트 스냅샷 재등록 실패와 같은 블록 우회

### 검증하지 못한 것

- 이 결과가 Maroo 테스트넷에서도 같은지. 로컬에서 만든 증명과 tx는 Maroo 테스트넷 호환성의 증거가 되지 못합니다.
- 원격 prover를 쓸 때의 노출 범위. 로컬 실행은 CLI 안에서 증명을 만듭니다.

## 3. 통제된 열람 시제품

감사 키를 세 역할의 2-of-3 몫으로 나눠 요청한 tx의 감사 공개만 연 실행 기록입니다(`pnpm a:audit-access`). 한 기록 파일에 두 라벨이 함께 있습니다. 해독은 2절의 로컬 실행이 남긴 tx로 한 `[Local]` 결과이고, 요청, 승인, 열람의 해시는 Maroo 테스트넷 EAS 증명으로 남긴 `[Live Testnet]` 결과입니다.

| 기록 | 명령 | 실행 시각 | 결과 |
| --- | --- | --- | --- |
| [audit-access-20261023T054254Z.json](evidence/live/audit-access-20261023T054254Z.json) | `pnpm a:audit-access --top-up` | 2026-10-23 05:42 UTC | 로컬 확인 13개 모두 맞음. 협력사 B 지급 한 건만 열림(금액 15, 체인 disclosure 해시와 일치). 요청, 승인 둘, 열람의 EAS 증명 네 건과 탐색기 색인 확인 |
| [audit-access-20261023T054216Z.json](evidence/live/audit-access-20261023T054216Z.json) | `pnpm a:audit-access --top-up`을 첫 기록 뒤 끊고 `--resume`으로 이어 보낸 실행 | 2026-10-23 05:40\~05:42 UTC | 끊기 전에 요청 기록 한 건, 이어 한 실행에서 남은 세 건. 다시 보낸 기록은 없습니다 |
| [audit-access-20261023T080746Z.json](evidence/live/audit-access-20261023T080746Z.json) | 노드가 요청 기록 tx를 받은 뒤 응답을 끊는 시험용 프록시(`track-c-activate/agent-limit-app/test-rpc-proxy.ts`의 `forward-drop`)를 RPC로 두고 실행한 뒤, 프록시를 정상으로 돌려 `--resume` | 2026-10-23 08:07 UTC | 첫 실행은 「보내다 연결이 끊겨 노드가 받았는지 모릅니다」와 tx 해시를 남기고 멈춤. 이어 하기는 그 tx(`0x8852…74b1`)의 영수증을 찾아 요청 기록으로 쓰고 남은 세 건만 보냄. 요청 기록은 한 건 |

### 검증한 것

- 몫 두 개의 공개값을 합친 점이 로컬 체인에 설정된 감사 공개키와 같다는 것
- 승인 하나와 부분값 하나로는 열리지 않고, 요청한 역할의 승인은 세지 않는다는 것
- 두 역할의 부분값으로 감사 비밀키를 다시 만들지 않고 요청한 감사 공개를 연다는 것. 결과가 감사인 키 하나로 푼 기록, 체인의 disclosure 해시와 같습니다
- 요청에 없는 감사 공개는 다른 암호문의 부분값으로 복호되지 않는다는 것(AES-GCM 인증 실패)
- 증명자가 각 역할 지갑이고, 승인과 열람 증명이 요청 증명을 가리키며, 되돌릴 수 없게 남았다는 것
- 가스가 없는 역할 지갑에서는 기록을 하나도 보내기 전에 멈추고, 기록 도중 끊긴 실행은 남긴 기록을 다시 보내지 않고 이어 간다는 것

### 검증하지 못한 것

- 키가 처음부터 한 곳에 모이지 않는 몫 생성(분산 키 생성). 이 시제품은 이미 있던 로컬 감사인 키를 나눴습니다.
- 체인이 승인 기준을 강제하는 것. 기준과 범위 확인은 이 레포의 도구가 지키고, 체인은 기록만 받습니다.
- Maroo 테스트넷 Privacy tx의 감사 공개. 테스트넷에서 유효한 Privacy tx를 만들지 못해 로컬 tx로 했습니다.
