# 실행 레시피: 비공개 공급업체 정산

구매 기업이 협력사에 대금을 치르는 흐름을 두 환경에서 직접 실행합니다. Maroo 테스트넷에서는 OKRW와 PCL 경로를 실행하고 Privacy 프리컴파일은 처음 막히는 층까지 진단합니다. 차폐 풀의 전체 흐름(예치, 지급, 스캔, 해독, 인출)은 Clairveil 로컬 체인에서 실행합니다. 두 환경의 결과는 서로 다른 증거 라벨로 남기고, 한 흐름으로 합쳐 표현하지 않습니다.

| 환경 | 명령 | 확인하는 것 | 라벨 |
| --- | --- | --- | --- |
| Maroo 테스트넷 | `pnpm a:inspect` | Privacy 프리컴파일에 걸린 정책, 요구 스키마, 지갑의 증명 수, deposit이 처음 막히는 층, 인터페이스 대조 | `[Live Testnet]` 조회와 eth_call |
| Maroo 테스트넷 | `pnpm a:probe` | deposit 요청 모양별로 처음 막히는 층 | `[Live Testnet]` eth_call, 거부 경로 증거 |
| Maroo 테스트넷 | `pnpm a:probe-global` | 같은 전송을 `eth_call`과 `eth_estimateGas`로 불렀을 때 전역 정책의 평가 차이 | `[Live Testnet]` 조회 |
| Maroo 테스트넷 | `pnpm a:probe-kyc` | 카카오 본인 인증 증명이 있는 지갑과 없는 지갑에서 deposit이 처음 막히는 층 비교 | `[Live Testnet]` eth_call, 거부 경로 증거 |
| Maroo 테스트넷 | `pnpm a:kyb-gate` | OKRW 이체, 정산 금고 배포, `claim()`의 KYB 정책 거부와 통과, 증명 폐기 뒤 거부, 회수 | `[Live Testnet]` 상태 변경 tx |
| Maroo 테스트넷 | `pnpm a:doc-claims` | 문서 개선 노트의 근거가 되는 문서 문장과 체인 동작 | `[Live Testnet]` 조회와 eth_call |
| Clairveil 로컬 | `pnpm a:local` | 차폐 정산 전체 흐름, 역할마다 볼 수 있는 것, 제3자에게 공개되는 것 | `[Local]` |

## 1. 준비

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

- 역할 다섯 개(구매 기업, KYB 발급자, 협력사 A, 협력사 B, 업그레이드 권한)의 테스트넷 전용 지갑을 `~/.config/maroo-integration-lab/testnet.env`(권한 600)에 만듭니다. 레포 안에는 키가 들어가지 않습니다. 다른 위치를 쓰려면 `MAROO_LAB_ENV`를 지정합니다.
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

- 예상 결과: 빈 요청과 모양을 갖춘 요청 모두 `eth_call`과 `eth_estimateGas`에서 `SDKInvalidRequest()`, 1 wei를 실은 요청은 잔액이 없으면 `insufficient balance for transfer`. `eth_estimateGas`는 전역 정책까지 평가하므로, 같은 오류가 나오면 그 주소는 전역 정책을 통과하고 요청 검증에서 막힌 것입니다. 유효한 증명 없이 부르므로 거부 경로 증거로만 씁니다. 외부에서 유효한 증명을 만들 회로 산출물과 상태 조회 경로가 공개되지 않아, 테스트넷 Privacy는 이 층까지 진단합니다.

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

- 결과는 그 순간의 체인 상태에 따라 달라집니다. 한도가 풀린 뒤에는 두 방법 모두 통과합니다. 전역 정책은 `eth_call`에서 평가되지 않으므로, 보내기 전 검사는 `eth_estimateGas`로 합니다.

```bash
pnpm a:probe-kyc
```

- 테스트넷 KYC 서비스에서 카카오 본인 인증을 마친 지갑 주소를 지갑 파일에 `KYC_HOLDER_ADDRESS=0x…`로 넣었을 때 씁니다. 개인키는 필요 없습니다.
- 예상 결과(2026-09-26): 인증 지갑이 Privacy 정책 스키마의 증명 1개를 가졌고, 인증 지갑과 구매 기업 지갑 모두 네 경우에서 `SDKInvalidRequest()`. 본인 인증이 있어도 증명 재료가 없으면 같은 층에서 막힙니다.
- 기록에는 인증 지갑의 주소, 증명 UID, 발급 시각을 남기지 않습니다. 셋 가운데 하나만 있어도 탐색기에서 그 지갑을 찾을 수 있어서입니다.

```bash
pnpm a:doc-claims
```

- 문서 개선 노트 1~5번의 근거를 다시 확인합니다. 결과는 `evidence/live/doc-claims-<시각>.json`에 남습니다.

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
| 3a~3c | 구매 기업 | 금고 구현 배포, Transparent PCL 프록시 배포(업그레이드 권한은 `UPGRADE_OWNER`), `claim()` 선택자에만 `EAS_POLICY` 바인딩 | 성공. 스크립트가 ERC-1967 구현 슬롯을 직접 읽어 배포한 구현과 다르면 멈춥니다 |
| 4 | 구매 기업 | 협력사 A, B 몫으로 100 OKRW씩 입금 | 성공. `fund()`는 정책 대상이 아닙니다 |
| 5 | 협력사 B | 증명 없이 `claim()` | 거부, `EasNoAttestationReceived` |
| 6a~6d | 발급자, 협력사 A | 증명 발급, 색인 전 청구, `indexAttestation`, 색인 뒤 청구 | 색인 전 거부, 색인 뒤 성공(협력사 A 잔액 100 증가) |
| 7a~7c | 구매 기업, 발급자, 협력사 A | 협력사 A 몫을 다시 입금, 증명 폐기, 청구 | 거부, `EasAttestationRevoked` |
| 8 | 구매 기업 | 폐기된 협력사 A 몫과 청구되지 않은 협력사 B 몫 회수(`recall`) | 성공. 두 협력사의 남은 몫 0 |

- 거부 단계는 시뮬레이션으로 사유를 읽은 뒤, 같은 호출을 가스를 고정해 실제로 보내 실패한 tx도 남깁니다.
- 확인 방법: 콘솔에 단계마다 탐색기 링크가 찍히고, `evidence/live/pcl-kyb-gate-<시각>.json`에 tx 해시, 블록, 사유, 금고 권한(PCL 정책 관리자, ProxyAdmin, 업그레이드 권한 소유자)이 남습니다.

## 5. 차폐 정산 `[Local]`

```bash
pnpm setup:clairveil   # 한 번만. vendor/ 에 고정 커밋을 받습니다
pnpm a:local
```

- `pnpm setup:clairveil`은 clairveil-samples가 맞춰 둔 조합을 받습니다. Clairveil v0.4.0 `ca85b027`, ClairveilJS `faf220d5`, clairveil-samples `8321ded`입니다.
- `pnpm a:local`은 Clairveil을 빌드하고 회로 산출물을 만든 뒤, 로컬 체인을 띄워 아래 순서로 실행합니다. 이 머신에서 약 4분 걸렸고, 실행 폴더(`.work/`)에 약 560MB를 씁니다. 127.0.0.1:26657이 비어 있어야 합니다.

| 순서 | 하는 일 |
| --- | --- |
| 1~3 | 바이너리 빌드, 회로 산출물 생성, 역할 키 넷(구매 기업, 협력사 A, B, 감사인)과 체인 초기화, 체인 시작 |
| 4 | 구매 기업이 12, 8, 15와 0 노트 셋을 예치. 전송 하나는 입력 노트 두 개를 쓰므로 노트 하나로 보낼 때는 0 노트를 짝으로 둡니다 |
| 5 | 협력사 A에 송장 두 건(12, 8)을 한 tx로 일괄 지급 |
| 6 | 협력사 B에 송장 한 건(15). 금액, 보낸 쪽, 받는 쪽을 B의 공개키로 암호화 |
| 7~8 | 협력사가 노트를 스캔하고, B는 자기 키로, 감사인은 감사 키로, 구매 기업은 self-view로 해독 |
| 9 | 협력사 A가 12를 투명 잔액으로 인출. 먼저 단독으로 보내 v0.4.0의 실패를 기록하고, 같은 블록에 0 노트 예치를 함께 넣어 다시 보냅니다 |
| 10 | 실행 기록 작성 |

- 확인 방법: `track-a-explain/evidence/local/vendor-settlement-<시각>.md`에 단계별 tx와 결과, 역할마다 해독한 내용, 제3자가 공개 체인에서 읽을 수 있는 필드가 남습니다. [실행 기록 예시](evidence/local/vendor-settlement-20260925T181924Z.md)

## 6. 오류가 나면

| 증상 | 원인 | 할 일 |
| --- | --- | --- |
| faucet이 `… reverted with the following signature:.` | faucet 계정이 전역 24시간 한도(1,000만 tOKRW)를 다 썼고 KYC 증명이 없음 | `pnpm a:probe-global`로 `resetAt`을 보고 그 뒤에 다시 요청 |
| `구매 기업 잔액이 부족합니다` | 테스트넷 OKRW 없음 | 2절의 faucet 명령 |
| `EasNoAttestationReceived(주소)` | 호출한 주소에 정책이 요구하는 증명이 없거나, 증명을 색인하지 않음 | 증명 발급 뒤 `indexAttestation`까지 했는지 확인 |
| `EasAttestationRevoked(주소)` | 증명이 폐기됨 | 발급자가 새 증명을 발급하고 색인 |
| `AnyOfRejected(ExceededPeriodicVolume(…), …)` | 보내는 주소가 전역 기간 한도를 넘음 | `resetAt` 뒤 재시도하거나, KYC 증명이 있는 주소로 보냄 |
| `SDKInvalidRequest()` (Privacy 호출) | 유효한 증명과 요청 재료가 없음 | 테스트넷 Privacy는 이 층까지 진단합니다. 차폐 흐름은 5절의 로컬에서 실행 |
| `deployPclProxy`가 `execution reverted` | 초기화 데이터가 비어 있음 | 초기화 호출을 넣음(문서 개선 노트 3번) |
| `127.0.0.1:26657 를 이미 다른 프로세스가 쓰고 있습니다` | 이전 로컬 노드가 남음 | 그 프로세스를 끄거나 `RPC_PORT`로 다른 포트 지정 |
| `vendor/clairveil 이 없습니다` | Clairveil을 받지 않음 | `pnpm setup:clairveil` |
| 인출이 `merkle root snapshot re-registration is inconsistent` | Clairveil v0.4.0에서 잎이 늘지 않은 블록의 인출이 스냅샷 등록에서 거부됨 | `pnpm a:local`은 같은 블록 우회를 자동으로 시도합니다(문서 개선 노트 6번) |

## 7. 입력값

| 환경 변수 | 기본값 | 뜻 |
| --- | --- | --- |
| `MAROO_RPC_URL` | `https://rpc-testnet.maroo.io` | 테스트넷 RPC |
| `MAROO_LAB_ENV` | `~/.config/maroo-integration-lab/testnet.env` | 역할 지갑 파일 |
| `RPC_PORT` | `26657` | 로컬 체인 RPC 포트 |
| `CHAIN_ID` | `vendor-settlement-local-1` | 로컬 체인 ID |
| `VENDOR_SETTLEMENT_WORK_DIR` | `.work/vendor-<시각>` | 로컬 실행 폴더 |
