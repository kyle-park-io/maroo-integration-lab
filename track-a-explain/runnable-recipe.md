# 실행 레시피: 비공개 공급업체 정산

구매 기업이 협력사에 대금을 치르는 흐름을 두 환경에서 직접 실행합니다. Maroo 테스트넷에서는 OKRW와 PCL 경로를 실행하고 Privacy 프리컴파일은 처음 막히는 층까지 진단합니다. 차폐 풀의 전체 흐름(예치, 지급, 스캔, 해독, 인출)은 Clairveil 로컬 체인에서 실행합니다. 두 환경의 결과는 서로 다른 증거 라벨로 남기고, 한 흐름으로 합쳐 표현하지 않습니다.

| 환경 | 명령 | 확인하는 것 | 라벨 |
| --- | --- | --- | --- |
| Maroo 테스트넷 | `pnpm a:inspect` | Privacy 프리컴파일에 걸린 정책, 요구 스키마, 지갑의 증명 수, deposit이 처음 막히는 층, 인터페이스 대조 | `[Live Testnet]` 조회와 eth_call |
| Maroo 테스트넷 | `pnpm a:probe` | deposit 요청 모양별로 처음 막히는 층 | `[Live Testnet]` eth_call, 거부 경로 증거 |
| Maroo 테스트넷 | `pnpm a:probe-global` | 같은 전송을 `eth_call`과 `eth_estimateGas`로 불렀을 때 전역 정책의 평가 차이. `--over-limit`는 PCL 프록시를 거치지 않는 이체와 PCL 프록시 호출을 견줍니다 | `[Live Testnet]` 조회 |
| Maroo 테스트넷 | `pnpm a:probe-kyc` | 카카오 본인 인증 증명이 있는 지갑과 없는 지갑에서 deposit이 처음 막히는 층 비교 | `[Live Testnet]` eth_call, 거부 경로 증거 |
| Maroo 테스트넷 | `pnpm a:watch-privacy` | Privacy 준비 상태: 차폐 상태 조회 경로, proving 재료, 4층 시험, SDK 예치 준비, Privacy tx 수, 문서와 릴리스 변경. GitHub Actions가 하루 한 번 | `[Live Testnet]` 조회와 eth_estimateGas |
| Maroo 테스트넷 | `pnpm a:probe-public` | 공개된 성공 Privacy 예치의 calldata를 다른 지갑과 블록에서 부를 때 막히는 층 | `[Live Testnet]` eth_call, eth_estimateGas |
| Maroo 테스트넷 | `pnpm a:chain-info` | 노드 판과 빌드 의존성(Clairveil, gnark), 수수료 설정의 최소 가스 비율, EVM 단위, Privacy 프리컴파일 활성 여부 | `[Live Testnet]` Cosmos REST 조회 |
| Maroo 테스트넷 | `pnpm explain <tx 해시>`, `pnpm explain --examples` | 실패한 tx나 호출의 오류 선택자, 계열, 전역 정책인지 컨트랙트 정책인지, 통과한 프록시 호출의 `PolicyCheckPassed`, 다음 행동 | `[Live Testnet]` 조회 |
| 코드 대조 | `pnpm a:abi-compare` | Maroo `IPrivacy` ABI와 ClairveilJS 정식 EVM Privacy 계약(v0.3.1)의 선택자, 이벤트, 정규화 해시 | `[코드 대조]`, 체인 호출 없음 |
| SDK와 테스트넷 조회 | `pnpm a:probe-sdk`, `pnpm a:probe-sdk --rest` | 공식 SDK(ClairveilJS)의 EVM 예치 준비가 Maroo 설정에서 어느 조회에 멈추는지. `--rest`는 Cosmos REST를 넣었을 때 증명 공급자까지 가는지 | `[코드 대조]`, 테스트넷 조회, tx 없음 |
| Maroo 테스트넷 | `pnpm a:kyb-gate` | OKRW 이체, 정산 금고 배포, `claim()`의 KYB 정책 거부와 통과, 증명 폐기 뒤 거부, 회수 | `[Live Testnet]` 상태 변경 tx |
| Maroo 테스트넷 | `pnpm a:probe-send-gas` | 단순 OKRW 이체의 `eth_estimateGas` 값, 가스 21,000으로 보낸 이체의 결과, 추정값으로 보낸 이체의 결과 | `[Live Testnet]` tx 세 건 |
| Maroo 테스트넷 | `pnpm a:reject-gas` | 정책에 거부된 tx의 영수증(상태, 쓴 가스와 한도의 비율, 수수료) | `[Live Testnet]` 조회 |
| Maroo 테스트넷 | `pnpm a:doc-claims` | 문서 개선 노트의 근거가 되는 문서 문장과 체인 동작 | `[Live Testnet]` 조회와 eth_call |
| Clairveil 로컬 | `pnpm a:local` | 차폐 정산 전체 흐름, 역할마다 볼 수 있는 것, 제3자에게 공개되는 것 | `[Local]` |
| Clairveil 로컬과 Maroo 테스트넷 | `pnpm a:audit-access` | 감사 키를 세 역할의 2-of-3 몫으로 나눠 두 역할이 승인한 tx의 감사 공개만 열고, 요청, 승인, 열람의 해시를 EAS 증명으로 남김 | 해독 `[Local]`, 기록 `[Live Testnet]` |

## 1. 준비

스크립트를 돌리는 데 필요한 도구와 확인한 판을 모았습니다. 마지막 열은 그 도구를 쓰는 단계입니다.

| 도구 | 확인한 판 | 쓰는 곳 |
| --- | --- | --- |
| Node.js | 24.19 (24 이상 필요, TypeScript를 바로 실행) | 모든 스크립트 |
| pnpm | 11.25 | 의존성 설치 |
| Foundry(forge) | 1.8.1, solc 0.8.37 자동 설치 | 금고 컴파일과 테스트 |
| Go | 1.27.1 (Clairveil `go.mod`는 1.25.12) | Clairveil 로컬 체인 빌드 |
| Git | 2.43 | Clairveil 받기 |

```bash
git clone https://github.com/kyle-park-io/maroo-integration-lab.git
cd maroo-integration-lab
pnpm install
pnpm build:contracts
pnpm test:contracts   # 금고 규칙 테스트 6개
```

- 예상 결과: `6 tests passed, 0 failed`. PCL 관문은 로컬 EVM에 없어서 이 테스트는 금고 자체의 규칙(구매 기업만 입금, 한 번만 청구, 구매 기업만 회수, 초기화 잠금, ERC-7201 저장 위치)만 검사합니다.
- Go 1.27에서는 Clairveil 빌드 중 `sonic/ast only supports (go1.17~1.26 …)` 경고가 반복되지만 빌드와 실행은 끝까지 됩니다.

## 2. 지갑과 테스트넷 OKRW

```bash
pnpm setup:wallets
```

- 역할 아홉 개(구매 기업, KYB 발급자, 협력사 A, 협력사 B, 업그레이드 권한, Track C의 에이전트 지갑, 8절 통제된 열람의 내부 감사팀, 외부감사인, 규제기관)의 테스트넷 전용 지갑을 `~/.config/maroo-integration-lab/testnet.env`(권한 600)에 만듭니다. 레포 안에는 키가 들어가지 않습니다. 다른 위치를 쓰려면 `MAROO_LAB_ENV`를 지정합니다.
- 화면에 나온 faucet 명령 두 줄로 구매 기업과 KYB 발급자가 각각 5,000 tOKRW를 받습니다. 정산 금고 흐름은 구매 기업 잔액이 1,000 tOKRW 이상일 때 시작합니다.
- faucet이 `Transaction failed … reverted with the following signature:.`로 실패하면 faucet 계정이 테스트넷 전역 정책의 24시간 한도에 걸렸을 수 있습니다. `pnpm a:probe-global`로 사유와 `resetAt`(한도가 풀리는 시각, UTC 초)을 확인하고, 그 시각이 지난 뒤 다시 요청합니다(6절).

## 3. 테스트넷 조회와 진단 `[Live Testnet]`

잔액이 없어도 실행됩니다. 트랜잭션은 보내지 않습니다.

```bash
pnpm a:inspect
```

예상 결과(2026-09-26):

```text
2) Privacy 정책: And(EAS_POLICY, DENYLIST_POLICY), admin 0x58eC1E718ff15e5f34591747D47ADf5BccDA804F
   요구 스키마 0x3e448d93…f527d: "bytes32 kakaoIdHash, uint8 version", resolver 0x6D2cBcFEeB6B6752C76D7eeB1cb4aD69aae58D6f
3) 0x7209…89e8 가 받은 증명 수: 0
4) deposit eth_call (from 0x7209…89e8): SDKInvalidRequest()
5) 전송 요청 필드: 마루 17개, Clairveil v0.4.0 18개, 마루에만 [], Clairveil 에만 [creator]
```

- 확인 방법: `track-a-explain/evidence/live/inspect-privacy-boundary-<시각>.json`의 `policy`(`logical`에 결합 방식), `schema`, `depositEthCall`, `transferFields`를 봅니다. 5번은 Maroo `IPrivacy` 전송 요청이 Clairveil v1 `MsgTransfer`와 같은 모양(`creator` 제외)이라는 뜻입니다. 모양이 같다는 것이고, 회로나 검증 키가 같다는 증거는 아닙니다.

```bash
pnpm a:probe
```

- 예상 결과: 빈 요청과 모양을 갖춘 요청 모두 `eth_call`과 `eth_estimateGas`에서 `SDKInvalidRequest()`, 1 wei를 실은 요청은 잔액이 없으면 `insufficient balance for transfer`이고, 잔액이 있으면 같은 `SDKInvalidRequest()`입니다(2026-10-23 [기록](evidence/live/probe-first-failure-20261023T071333Z.json)). `eth_estimateGas`는 실행 뒤 전역 정책 재검사까지 평가하지만, 실행 중에 되돌려진 요청은 재검사까지 가지 않습니다. 같은 오류가 나오면 그 요청은 전역 정책 거부보다 먼저 요청 검증에서 막힌 것입니다. 유효한 증명 없이 부르므로 거부 경로 증거로만 씁니다. 외부에서 유효한 증명을 만들 proving 재료가 공개되지 않아, 이 레포가 만든 요청은 이 층까지 진단합니다. 공개된 성공 예치의 calldata로 다음 층을 확인하려면 아래 `pnpm a:probe-public`을 씁니다.

```bash
pnpm a:probe-global [보내는 주소] [받는 주소] [금액]
```

- 기본값은 공개 faucet 계정에서 구매 기업으로 5,000 OKRW를 보내는 경우입니다. faucet 계정이 한도에 걸려 있던 2026-09-26 04:08 KST의 결과는 이렇습니다.

```text
eth_call         통과
eth_estimateGas  거부: AnyOfRejected(...)
                   ExceededPeriodicVolume(10000000000000000000000000, 10005000000000000000000000, 1790380800)
                   EasNoAttestationReceived(0x5336F019Bd8E9E0064be7330833dc883a8a6c94d)
```

- 결과는 그 순간의 체인 상태에 따라 달라집니다. 한도가 풀린 뒤에는 두 방법 모두 통과합니다.
- 체인 상태와 상관없이 같은 차이를 확인하려면 `pnpm a:probe-global --over-limit`를 돌립니다. KYC 증명이 없는 구매 기업 지갑이 건당 한도(200만 OKRW)를 넘는 2,000,001 OKRW를 보내는 경우를 잔액 상태 덮어쓰기로 만들고, PCL 프록시를 거치지 않는 이체(협력사 A로)와 금고 PCL 프록시의 `fund()` 호출을 두 방법으로 견줍니다. 2026-10-23 13:24 KST의 결과는 이렇습니다 `[Live Testnet]` [기록](evidence/live/probe-global-compare-20261023T042452Z.json).

```text
PCL 프록시를 거치지 않는 이체 eth_call         통과
PCL 프록시를 거치지 않는 이체 eth_estimateGas  거부: AnyOfRejected, 자식 사유 3개
                                      VolumeAboveMaxLimit(2000000000000000000000000, 2000001000000000000000000)
PCL 프록시 호출(금고 fund)    eth_call         거부: AnyOfRejected, 자식 사유 3개
PCL 프록시 호출(금고 fund)    eth_estimateGas  거부: AnyOfRejected, 자식 사유 3개
```

- PCL 프록시를 거치지 않는 OKRW 이체는 `eth_call`에서 전역 정책 거부가 나오지 않으므로, 보내기 전 검사는 `eth_estimateGas`로 합니다.

```bash
pnpm a:probe-kyc
```

- 테스트넷 KYC 서비스에서 카카오 본인 인증을 마친 지갑 주소를 지갑 파일에 `KYC_HOLDER_ADDRESS=0x…`로 넣었을 때 씁니다. 개인키는 필요 없습니다.
- 예상 결과(2026-09-26): 인증 지갑이 Privacy 정책 스키마의 증명 1개를 가졌고, 인증 지갑과 구매 기업 지갑 모두 네 경우에서 `SDKInvalidRequest()`. 본인 인증이 있어도 증명 재료가 없으면 같은 층에서 막힙니다.
- 기록에는 인증 지갑의 주소, 증명 UID, 발급 시각을 남기지 않습니다. 셋 가운데 하나만 있어도 탐색기에서 그 지갑을 찾을 수 있어서입니다.

```bash
pnpm a:doc-claims
```

- 문서 개선 노트 1\~5번의 근거를 다시 확인합니다. 결과는 `evidence/live/doc-claims-<시각>.json`에 남습니다.

```bash
pnpm a:probe-public [tx 해시]
```

- 테스트넷 탐색기에 공개된 성공 Privacy 예치의 calldata(유효한 증명 포함)를 원래 지갑, 구매 기업 지갑, 지갑 파일에 있으면 인증 지갑에서 직전 블록과 최신 블록 상태로 `eth_call`과 `eth_estimateGas`만 불러, 어느 층에서 막히는지 확인합니다. 인자가 없으면 가장 최근 성공 예치를 고릅니다. 잔액은 상태 덮어쓰기로 늘리고, 인증 지갑의 주소는 사유와 인자에서도 「(비공개)」로 바꿔 남깁니다.
- 예상 결과(2026-10-23, 2026-09-17 블록 18351926의 예치): 원래 지갑은 직전 블록에서 통과하고 최신 블록에서 `SDKInvalidRequest()`. 구매 기업 지갑은 두 블록 모두 `EasNoAttestationReceived(구매 기업)`(Privacy 주소에 묶인 컨트랙트 정책). 인증 지갑은 직전 블록에서 `EasNoAttestationReceived`(그때는 증명이 없었음), 최신 블록에서 정책을 지나 `SDKInvalidRequest()`. `[Live Testnet]` [기록](evidence/live/probe-public-privacy-20261023T064628Z.json)

```bash
pnpm a:watch-privacy
```

- Maroo가 proving 재료를 공개했는지 매번 같은 값으로 확인합니다. 노드 판, Clairveil 차폐 상태 조회 경로 13개의 응답 코드, 회로 설정이 proving 산출물을 내주는지, 빈 예치 요청과 4층 시험의 사유, 공식 SDK에 Cosmos REST를 넣은 예치 준비(`pnpm a:probe-sdk --rest`, `vendor/clairveiljs` 의존성이 있을 때), Privacy 프리컴파일 tx 수와 함수별 성공 수, Maroo 문서 Privacy 페이지의 내용 해시, Clairveil 최신 릴리스, `@maroo-chain` 패키지 최신 판을 읽습니다. 10초 안팎 걸립니다.
- 기록은 `evidence/live/watch-privacy/<날짜>.json`에 남고, 이전 날짜의 기록과 달라진 값을 출력합니다. GitHub Actions(`.github/workflows/watch-privacy.yml`)가 하루 한 번 같은 명령을 돌려 기록을 실행 결과에 붙이고, proving 재료가 보이면 이슈를 하나 엽니다. 저장소에 커밋하지는 않습니다.
- 2026-10-23의 결과: 조회 경로 11개가 200, `privacy_scan`과 `commitment_paths_at_root`가 501, 회로 설정의 `manifest_available`이 false, SDK 예치 준비는 증명 공급자까지 갑니다. `[Live Testnet]` [첫 기록](evidence/live/watch-privacy/2026-10-23.json)

## 4. KYB 관문이 걸린 정산 금고 `[Live Testnet]`

```bash
pnpm build:contracts
pnpm a:kyb-gate
```

구매 기업과 KYB 발급자에게 테스트넷 OKRW가 있어야 합니다. 단계와 예상 결과는 이렇습니다.

| 단계 | 누가 | 하는 일 | 예상 결과 |
| --- | --- | --- | --- |
| 1 | 구매 기업 | 협력사 A, B와 발급자에게 가스용 OKRW 60을 일반 이체 | 성공. 탐색기에서 보낸 주소, 받는 주소, 금액이 모두 보입니다 |
| 2 | 발급자 | KYB 스키마 `bytes32 bizRegNoHash, bool kybVerified` 등록(이미 있으면 재사용) | 성공 또는 재사용 |
| 3a\~3c | 구매 기업 | 금고 구현 배포, Transparent PCL 프록시 배포(업그레이드 권한은 `UPGRADE_OWNER`), `claim()` 선택자에만 `EAS_POLICY` 바인딩 | 성공. 스크립트가 ERC-1967 구현 슬롯을 직접 읽어 배포한 구현과 다르면 멈춥니다 |
| 4 | 구매 기업 | 협력사 A, B 몫으로 100 OKRW씩 입금 | 성공. `fund()`는 정책 대상이 아닙니다 |
| 5 | 협력사 B | 증명 없이 `claim()` | 거부, `EasNoAttestationReceived` |
| 6a\~6d | 발급자, 협력사 A | 증명 발급, 색인 전 청구, `indexAttestation`, 색인 뒤 청구 | 색인 전 거부, 색인 뒤 성공(협력사 A 잔액 100 증가) |
| 7a\~7c | 구매 기업, 발급자, 협력사 A | 협력사 A 몫을 다시 입금, 증명 폐기, 청구 | 거부, `EasAttestationRevoked` |
| 8 | 구매 기업 | 폐기된 협력사 A 몫과 청구되지 않은 협력사 B 몫 회수(`recall`) | 성공. 두 협력사의 남은 몫 0. `recall`은 청구 전 언제든 가능해서 프로덕션에서는 청구 기간이나 타임락을 둡니다([가이드 8절](integration-guide.md#8-프로덕션-전에-남은-것)) |

- 거부 단계는 시뮬레이션으로 사유를 읽은 뒤, 같은 호출을 가스를 고정해 실제로 보내 실패한 tx도 남깁니다.
- 확인 방법: 콘솔에 단계마다 탐색기 링크가 찍히고, `evidence/live/pcl-kyb-gate-<시각>.json`에 tx 해시, 블록, 사유, 금고 권한(PCL 정책 관리자, ProxyAdmin, 업그레이드 권한 소유자)이 남습니다.

2026-09-26 00:01 UTC 실행 결과 `[Live Testnet]` [기록](evidence/live/pcl-kyb-gate-20260926T000141Z.json). 37초, tx 18건.

| 단계 | 결과 | tx |
| --- | --- | --- |
| 3b PCL 프록시 배포 | 금고 `0x50f6026B4261fF312E3Dfe22E61DA4AC32757D8E`. 구현 슬롯이 배포한 구현과 같음. 정책 관리자는 구매 기업, ProxyAdmin 소유자는 `UPGRADE_OWNER` | [0xf200…da03](https://explorer-testnet.maroo.io/tx/0xf200711289e4e371fbf1f892d637eadb710b48949e7cb6742f32da286c4cda03) |
| 5 협력사 B 청구 | 거부, `EasNoAttestationReceived` | [0xa4c7…557f](https://explorer-testnet.maroo.io/tx/0xa4c7a3b9c025ce79c25f60d3f0b6e9e11deefb4e828d1e99bd163312c8cd557f) |
| 6b 색인 전 청구 | 거부, `EasNoAttestationReceived` | [0xafe8…9ef4](https://explorer-testnet.maroo.io/tx/0xafe80ae6248a93138104ad72552da5987f24ccdbd74520c01713406fa31a9ef4) |
| 6d 색인 뒤 청구 | 성공. 협력사 A 잔액 58.65 → 155.89 OKRW | [0x4d67…b81d](https://explorer-testnet.maroo.io/tx/0x4d67c0dbf81db9c0f6e80bbe9c1d5676495800d0e7b4c643bed4df3a529cb81d) |
| 7c 폐기 뒤 청구 | 거부, `EasAttestationRevoked` | [0x8962…47cc](https://explorer-testnet.maroo.io/tx/0x8962c50a48f810d22acd80e5c663e11fc9f5d821a5b28401431580f0ce47f2cc) |
| 8 회수 | 협력사 A, B의 남은 몫 0 | [0xb4c0…2cdd](https://explorer-testnet.maroo.io/tx/0xb4c0dcdb7322ce14e60ede027323f28540bc885e5864952d84c0aee70be62cdd) |

- 쓴 OKRW: 구매 기업 250.06(가스 보충 120, 협력사 A가 받은 100, 가스), 발급자 8.10(가스). 발급자는 이미 잔액이 있어 가스 보충을 건너뛰었습니다.
- 스크립트의 지갑은 tx 가스 한도를 노드 추정값의 125%로 둡니다(`shared/lib/maroo.ts`의 `walletFor`, 2026-09-27부터). 위 표의 실행은 그 전이라 통과 tx가 추정값 그대로 보내져 한도의 100%를 썼습니다. 바꾼 뒤 실행([기록](evidence/live/pcl-kyb-gate-20260927T083827Z.json))에서는 통과 tx 12건이 모두 한도의 80.0%를 썼습니다. 2026-10-23에 다시 돌린 실행([기록](evidence/live/pcl-kyb-gate-20261023T071331Z.json))도 거부 셋과 통과 하나가 같았고, 구매 기업은 128.19 OKRW, 발급자는 5.86 OKRW를 썼습니다.
- 거부된 청구도 가스를 씁니다. 협력사 A는 60 OKRW를 받은 뒤 색인 전 청구 한 번으로 1.35 OKRW를 썼습니다(가스 한도 300,000으로 고정, 쓴 가스는 그 절반인 150,000). `[Live Testnet]` [영수증 기록](evidence/live/reject-gas-20260926T171444Z.json), 재현: `pnpm a:reject-gas` 사전 검사를 `eth_estimateGas`로 하면 이 비용을 줄일 수 있습니다.

### 단순 이체의 가스

```bash
pnpm a:probe-send-gas
```

- 구매 기업이 자기 협력사 A에게 1 OKRW를 세 번 보냅니다(가스 한도 21,000, `eth_estimateGas` 값, 그 값의 125%). 수수료를 합쳐 약 2.1 OKRW가 듭니다.
- 예상 결과(2026-09-26): 추정 104,017(에이전트 지갑이 보내면 283,560), 가스 21,000으로 부른 `eth_call`은 통과, 21,000 전송은 되돌려지고 21,000을 모두 씀(수수료 0.189 OKRW), 추정값과 125% 전송은 성공하고 둘 다 104,017을 씀(수수료 0.936153 OKRW). `[Live Testnet]` [기록](evidence/live/probe-send-gas-20260926T052147Z.json), 문서 개선 노트 7번

## 5. 차폐 정산 `[Local]`

```bash
pnpm setup:clairveil   # 한 번만. vendor/ 에 고정 커밋을 받습니다
pnpm a:local
```

- `pnpm setup:clairveil`은 clairveil-samples가 맞춰 둔 조합을 받습니다. Clairveil v0.4.0 `ca85b027`, ClairveilJS `faf220d5`, clairveil-samples `8321ded`입니다.
- `pnpm a:local`은 Clairveil을 빌드하고 회로 산출물을 만든 뒤, 로컬 체인을 띄워 아래 순서로 실행합니다. 이 머신에서 약 4분 걸렸고, 실행 폴더(`.work/`)에 약 560MB를 씁니다. 127.0.0.1:26657이 비어 있어야 합니다.
- `pnpm b:prepare`로 바이너리와 회로 산출물을 미리 만들어 두면 `pnpm a:local`이 그것을 재사용해 1분 안팎에 끝납니다(2026-10-23 실행 61초, [기록](evidence/local/vendor-settlement-20261023T045326Z.md)).
- `pnpm a:local --operator`는 정산 대행사(운영자) 키를 더하고, 사용자 공개를 금액만 담아 대행사의 공개키로 암호화한 지급 세 건(협력사 A 4, 6과 협력사 B 5)을 보냅니다. 대행사는 자기 지급 지시서로 협력사별 합계를 내고, 감사인이 같은 지급에서 푼 금액의 합과 견줍니다. 결과는 기록 6절에 남고, 2026-10-23 실행은 102초 걸렸습니다([기록](evidence/local/vendor-settlement-20261023T055418Z.md)).
- `pnpm a:local --extras`는 뒤에 참조 구현의 두 기능을 더 실행합니다. 증명 하나짜리 일괄 지급(출력 32칸 고정)과 대리 인출이고, 결과는 기록 5절에 남습니다. 대리 인출은 0 노트 예치를 먼저 보낸 뒤 보내야 같은 블록에서 성공합니다.

| 순서 | 하는 일 |
| --- | --- |
| 1\~3 | 바이너리 빌드, 회로 산출물 생성, 역할 키 넷(구매 기업, 협력사 A, B, 감사인)과 체인 초기화, 체인 시작 |
| 4 | 구매 기업이 12, 8, 15와 0 노트 셋을 예치. 전송 하나는 입력 노트 두 개를 쓰므로 노트 하나로 보낼 때는 0 노트를 짝으로 둡니다 |
| 5 | 협력사 A에 송장 두 건(12, 8)을 한 tx로 일괄 지급 |
| 6 | 협력사 B에 송장 한 건(15). 금액, 보낸 쪽, 받는 쪽을 B의 공개키로 암호화 |
| 7\~8 | 협력사가 노트를 스캔하고, B는 자기 키로, 감사인은 감사 키로, 구매 기업은 self-view로 해독 |
| 9 | 협력사 A가 12를 투명 잔액으로 인출. 먼저 단독으로 보내 v0.4.0의 실패를 기록하고, 같은 블록에 0 노트 예치를 함께 넣어 다시 보냅니다 |
| 10 | 실행 기록 작성 |

- 확인 방법: `track-a-explain/evidence/local/vendor-settlement-<시각>.md`에 단계별 tx와 결과, 역할마다 해독한 내용, 제3자가 공개 체인에서 읽을 수 있는 필드가 남습니다. [실행 기록 예시](evidence/local/vendor-settlement-20260925T181924Z.md)

## 6. 오류가 나면

실패한 tx는 해시 하나로 풀 수 있습니다. 거부 해석기는 tx가 블록에 들어간 직전 상태로 같은 호출을 다시 시뮬레이션해 revert 데이터를 얻고, 오류 선택자로 계열을 정하고, PCL 거부면 대상이 PCL 프록시인지와 묶인 정책으로 전역 정책인지 컨트랙트 정책인지 가립니다. tx 없이 호출만 확인할 때는 `--from`, `--to`, `--sig`, `--args`, `--value`로 넘기고, 잔액이 없어도 `--balance`로 잔액을 부풀려 시뮬레이션합니다.

```bash
pnpm explain 0xa4c7a3b9c025ce79c25f60d3f0b6e9e11deefb4e828d1e99bd163312c8cd557f
pnpm explain --from BUYER --to SUPPLIER_A --value 2000001 --balance 20000000
pnpm explain --examples      # 이 레포가 겪은 실패 다섯 계열과 통과 tx 하나, 3초 안팎
```

첫 명령의 출력입니다. 2026-10-23 16:15 KST에 돌렸습니다 `[Live Testnet]` [기록](evidence/live/explain-examples-20261023T071511Z.json).

```text
tx         0xa4c7…557f   블록 19111569   reverted   가스 150,000 / 300,000 (50.0%)
사유       EasNoAttestationReceived(0x9D13…67Bb)   선택자 0xbca5593e
종류       PCL 정책 위반
걸린 정책  컨트랙트 정책. 대상 0x50f6…7D8E: PCL 프록시(Transparent), claim()(0x4e71d92d)에 묶인 정책 EAS_POLICY(schema 0x1268f1…fbbc). 전역 정책에도 같은 템플릿이 있지만 Or 조합 안에만 있어, 그 자리에서 거부되면 AnyOfRejected로 감싸여 나옵니다. 사유가 감싸이지 않고 나왔으므로 컨트랙트 정책의 거부입니다.
참고       사유는 직전 블록 상태로 다시 시뮬레이션해 얻었습니다. 같은 블록의 앞선 tx가 상태를 바꿨으면 실제 사유와 다를 수 있습니다.
다음 행동  보내는 주소에 이 정책이 요구하는 스키마의 색인된 증명이 없습니다(주소 0x9D13…67Bb). 증명을 발급하고 indexAttestation으로 색인한 뒤 다시 보냅니다.
```

- 금고의 `NotBuyer()` 같은 컨트랙트 오류는 `pnpm bootstrap`이 `out/`에 만든 금고 ABI로 풉니다. 다른 컨트랙트의 오류는 `--abi <ABI나 forge 산출물 JSON>`으로 넘깁니다. ABI에 없는 오류는 원시 데이터를 그대로 남기고 「해석되지 않음」으로 적습니다.
- 계열과 판별 순서는 [가이드 6절](integration-guide.md#6-판정과-실패-진단)에 있습니다.

아래는 실행 중 만나는 증상마다 원인과 할 일을 모은 표입니다.

| 증상 | 원인 | 할 일 |
| --- | --- | --- |
| faucet이 `… reverted with the following signature:.` | faucet 계정이 전역 24시간 한도(1,000만 tOKRW)를 다 썼고 KYC 증명이 없습니다 | `pnpm a:probe-global`로 `resetAt`을 보고 그 뒤에 다시 요청 |
| `구매 기업 잔액이 부족합니다` | 테스트넷 OKRW가 없습니다 | 2절의 faucet 명령 |
| `EasNoAttestationReceived(주소)` | 호출한 주소에 정책이 요구하는 증명이 없거나, 증명을 색인하지 않았습니다 | 증명 발급 뒤 `indexAttestation`까지 했는지 확인 |
| `EasAttestationRevoked(주소)` | 증명이 폐기되었습니다 | 발급자가 새 증명을 발급하고 색인 |
| `AnyOfRejected(ExceededPeriodicVolume(…), …)` | 보내는 주소가 전역 기간 한도를 넘었습니다 | `resetAt` 뒤 재시도하거나, KYC 증명이 있는 주소로 보냅니다 |
| `SDKInvalidRequest()` (Privacy 호출) | 유효한 증명과 요청 재료가 없습니다 | 테스트넷 Privacy는 이 층까지 진단합니다. 차폐 흐름은 5절의 로컬에서 실행 |
| `deployPclProxy`가 `execution reverted` | 초기화 데이터가 비어 있습니다 | 초기화 호출을 넣음(문서 개선 노트 3번) |
| `127.0.0.1:26657 를 이미 다른 프로세스가 쓰고 있습니다` | 이전 로컬 노드가 남아 있습니다 | 그 프로세스를 끄거나 `RPC_PORT`로 다른 포트 지정 |
| `vendor/clairveil 이 없습니다` | Clairveil을 받지 않았습니다 | `pnpm setup:clairveil` |
| 인출이 `merkle root snapshot re-registration is inconsistent` | Clairveil v0.4.0에서 잎이 늘지 않은 블록의 인출이 스냅샷 등록에서 거부됩니다 | `pnpm a:local`은 같은 블록 우회를 자동으로 시도합니다(문서 개선 노트 6번) |

## 7. 입력값

스크립트가 읽는 환경 변수의 기본값과 뜻을 모았습니다.

| 환경 변수 | 기본값 | 뜻 |
| --- | --- | --- |
| `MAROO_RPC_URL` | `https://rpc-testnet.maroo.io` | 테스트넷 RPC |
| `MAROO_LAB_ENV` | `~/.config/maroo-integration-lab/testnet.env` | 역할 지갑 파일 |
| `RPC_PORT` | `26657` | 로컬 체인 RPC 포트 |
| `CHAIN_ID` | `vendor-settlement-local-1` | 로컬 체인 ID |
| `VENDOR_SETTLEMENT_WORK_DIR` | `.work/vendor-<시각>` | 로컬 실행 폴더 |

## 8. 통제된 열람 시제품

감사 키를 내부 감사팀, 외부감사인, 규제기관의 2-of-3 몫으로 나누고, 요청과 두 승인이 있을 때 요청한 tx의 감사 공개만 엽니다. 해독은 5절의 로컬 실행 결과로 하고(`[Local]`), 요청, 승인, 열람의 해시는 Maroo 테스트넷 EAS 증명으로 남깁니다(`[Live Testnet]`). 설계와 한계는 [가이드 3절](integration-guide.md#통제된-열람-시제품pnpm-aaudit-access)에 있습니다.

```bash
pnpm a:local                       # 5절. 감사 공개가 든 로컬 실행 폴더를 만듭니다
pnpm a:audit-access --no-record    # 로컬 열람만. 키와 OKRW 없이 10초 안팎
pnpm a:audit-access --top-up       # 테스트넷 기록까지 20초 안팎. 역할 지갑의 가스를 KYB 발급자 지갑에서 채웁니다
```

- 역할 지갑 셋(`AUDIT_TEAM`, `EXTERNAL_AUDITOR`, `REGULATOR`)은 `pnpm setup:wallets`가 만듭니다. 지갑 파일이 이미 있으면 빠진 역할만 더합니다.
- 처음 실행할 때 Go 도구 두 개를 `.work/audit-tools/`에 빌드합니다(이 머신에서 약 20초). `pnpm bootstrap`이 미리 빌드합니다. 도구 소스는 `shared/clairveil-ext/audit-threshold/`에 있고, 고정 커밋의 `vendor/clairveil` 모듈 안에서 `go build -overlay`로 빌드해 vendor 폴더에는 파일을 쓰지 않습니다. 도구 테스트는 `pnpm test:go`입니다.
- 몫과 부분값 파일은 `.work/audit-access/<시각>/`에 권한 600으로 남습니다. 화면과 증거 파일에는 몫 공개값만 나옵니다.
- 테스트넷 비용: 2026-10-23 실행에서 기록 한 건의 수수료는 약 3.03 OKRW였습니다. 노드는 보내기 전에 선결제 상한(가스 한도 × 최대 수수료, 같은 날 8.57 OKRW)만큼 잔액을 요구해서, 스크립트는 기록 한 건에 10 OKRW를 잡고 모자라면 `--top-up`으로 채웁니다. `[Live Testnet]` [열람 기록](evidence/live/audit-access-20261023T054254Z.json)
- 성공 기준: 로컬 확인 줄 13개와 체인 확인 줄 4개가 모두 `[확인]`이고 `[어긋남]`이 없습니다. 체인 확인은 증명자, 요청 증명을 가리키는 `refUID`, 되돌릴 수 없음, 탐색기 색인을 다시 읽은 결과입니다.

실행 중 만나는 증상마다 원인과 할 일을 모았습니다.

| 증상 | 원인 | 할 일 |
| --- | --- | --- |
| `감사 공개가 든 로컬 실행 폴더가 없습니다` | 5절의 로컬 실행을 하지 않았습니다 | `pnpm a:local` |
| `기록을 보내기 전에 멈췄습니다. 이번 실행에서 보낸 기록은 없습니다.`와 지갑별 잔액 줄 | 역할 지갑의 OKRW가 기록 예산보다 적습니다 | `--top-up`을 붙여 다시 실행 |
| `기록이 중간에 멈췄습니다`와 `--resume` 안내 | 기록 도중 RPC가 끊기거나 실행을 멈췄습니다 | 원인을 고친 뒤 안내된 `pnpm a:audit-access --resume .work/audit-access/<시각>`. 이미 남긴 기록은 다시 보내지 않습니다 |
| `테스트넷 RPC(…)에 연결하지 못했습니다` | RPC에 닿지 않습니다 | 네트워크를 확인하거나 `MAROO_RPC_URL`로 다른 주소 지정 |
| `이미 남긴 기록 …의 내용이 다릅니다` | 사건 폴더의 계획 파일이 처음 실행과 달라졌습니다 | `--resume` 없이 새 사건으로 다시 실행 |
