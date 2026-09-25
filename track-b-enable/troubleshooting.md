# 트러블슈팅

워크숍 실행기(`pnpm b:check`, `pnpm b:step N`)가 실패하면 출력 끝에 번호(T1~T10)를 안내합니다. 번호마다 증상, 원인, 확인 방법, 해결 방법을 적었습니다. 끝에 라이브 서비스가 멈췄을 때 진행자가 쓰는 대체 진행 방식이 있습니다.

2단계의 5, 6b, 7c 하위 단계에서 나오는 `[예상대로 거부]`와 4단계의 `SDKInvalidRequest()`는 오류가 아니라 학습용으로 만든 결과입니다.

<a id="t1"></a>
## T1. Node.js 버전이 24보다 낮음

| 항목 | 내용 |
| --- | --- |
| 증상 | `pnpm b:check`가 시작되지 않고 `.ts` 파일을 실행할 수 없다는 오류(`Unknown file extension ".ts"` 등)가 나옵니다 |
| 원인 | 이 레포는 Node.js 24의 TypeScript 바로 실행 기능을 씁니다 |
| 확인 | `node --version` |
| 해결 | Node.js 24 이상을 설치합니다. nvm을 쓰면 `nvm install 24 && nvm use 24` |

<a id="t2"></a>
## T2. Go가 없거나 1.25보다 낮음

| 항목 | 내용 |
| --- | --- |
| 증상 | `pnpm b:prepare`나 3단계의 1번 하위 단계에서 `go: command not found`나 `go.mod requires go >= 1.25` 같은 오류로 멈춥니다 |
| 원인 | Clairveil 바이너리를 빌드하려면 Go 1.25 이상이 필요합니다(`vendor/clairveil/go.mod`) |
| 확인 | `go version` |
| 해결 | Go 1.25 이상을 설치합니다. 워크숍 현장에서 설치할 시간이 없으면 옆 참가자나 진행자가 만든 `.work/prebuilt/`를 같은 폴더에 복사합니다(운영체제와 CPU가 같아야 합니다). Go 1.27에서는 `sonic/ast only supports (go1.17~1.26 …)` 경고가 반복되지만 빌드와 실행은 끝까지 됩니다 |

<a id="t3"></a>
## T3. vendor/clairveil 이 없거나 고정 커밋과 다름

| 항목 | 내용 |
| --- | --- |
| 증상 | `vendor/clairveil 이 없습니다. 먼저 pnpm setup:clairveil 을 실행하십시오.` 또는 `pnpm b:check`의 고정 커밋 줄이 ✗ |
| 원인 | Clairveil을 받지 않았거나, `vendor/`에서 다른 커밋을 체크아웃했습니다 |
| 확인 | `git -C vendor/clairveil rev-parse HEAD`가 `ca85b027…`로 시작하는지 |
| 해결 | `rm -rf vendor && pnpm setup:clairveil`. 그다음 `pnpm b:prepare`로 바이너리를 다시 만듭니다 |

<a id="t4"></a>
## T4. 127.0.0.1:26657 을 다른 프로세스가 씀

| 항목 | 내용 |
| --- | --- |
| 증상 | 3단계가 `127.0.0.1:26657 를 이미 다른 프로세스가 쓰고 있습니다`로 멈춥니다 |
| 원인 | 이전에 실행한 3단계의 로컬 노드가 남았거나, 다른 Cosmos 체인이 같은 포트를 씁니다 |
| 확인 | `ss -ltnp \| grep 26657` |
| 해결 | 이전 3단계의 노드면 `pnpm b:reset`이 찾아 끕니다. 다른 프로그램이면 그 프로그램을 끄거나 `RPC_PORT=26757 pnpm b:step 3`처럼 포트를 옮깁니다. 실행기는 P2P, gRPC, API 포트도 같은 차이만큼 옮깁니다 |

<a id="t5"></a>
## T5. 테스트넷 RPC에 닿지 않거나 chain ID가 다름

| 항목 | 내용 |
| --- | --- |
| 증상 | 1단계의 첫 줄이 `✗ chain ID 응답 없음`이거나 450815가 아닙니다 |
| 원인 | 사내 망의 방화벽이나 프록시가 `rpc-testnet.maroo.io`를 막았거나, `MAROO_RPC_URL`이 다른 네트워크를 가리킵니다 |
| 확인 | `curl -s -X POST https://rpc-testnet.maroo.io -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'`의 결과가 `0x6e0ff`(450815) |
| 해결 | `MAROO_RPC_URL`을 지우거나 테스트넷 주소로 둡니다. 사내 망에서 막히면 휴대폰 테더링이나 행사장 네트워크로 옮기고, 그래도 안 되면 아래의 대체 진행 방식을 씁니다 |

<a id="t6"></a>
## T6. 역할 지갑 파일이 없음

| 항목 | 내용 |
| --- | --- |
| 증상 | `BUYER_ADDRESS 가 없습니다. … 를 확인하십시오.` |
| 원인 | `pnpm setup:wallets`를 실행하지 않았거나, `MAROO_LAB_ENV`가 없는 파일을 가리킵니다 |
| 확인 | `ls -l ~/.config/maroo-integration-lab/testnet.env` |
| 해결 | `pnpm setup:wallets`. 파일은 권한 600으로 레포 밖에 만들어지고, 화면에는 주소만 나옵니다 |

<a id="t7"></a>
## T7. 테스트넷 OKRW 잔액 부족, faucet 실패

| 항목 | 내용 |
| --- | --- |
| 증상 | 1단계의 `✗ 구매 기업 잔액 부족`, 2단계의 `구매 기업 잔액이 부족합니다`, 또는 faucet 요청이 `Transaction failed … reverted with the following signature:.`로 실패 |
| 원인 | 잔액이 1,000 OKRW보다 적습니다. faucet 실패는 faucet 계정이 테스트넷 전역 정책의 24시간 한도(1,000만 OKRW)를 다 쓴 경우가 있었습니다(2026-09-26 확인) |
| 확인 | `pnpm a:probe-global`이 `ExceededPeriodicVolume(…, resetAt)`을 보여 주면 faucet 한도 문제이고, `resetAt`(UTC 초)에 풀립니다 |
| 해결 | 진행자에게 구매 기업 주소를 보내고 `pnpm b:fund`로 받습니다. 진행자 지갑도 KYC 증명이 없으면 24시간 1,000만 OKRW, 건당 200만 OKRW 한도를 받습니다 |

<a id="t8"></a>
## T8. 증명을 발급했는데 청구가 EasNoAttestationReceived로 거부됨

| 항목 | 내용 |
| --- | --- |
| 증상 | 2단계 6d(색인 뒤 청구)에서 `EasNoAttestationReceived(협력사 A 주소)`로 실패합니다 |
| 원인 | PCL의 `EAS_POLICY`는 Indexer에 색인된 증명만 봅니다. 6c(`indexAttestation`)가 실패했거나 다른 스키마로 발급했습니다 |
| 확인 | 2단계 출력에서 6c 줄이 `[성공]`인지, 기록 파일의 `schema.uid`와 금고 정책의 스키마가 같은지 |
| 해결 | `pnpm b:step 2`를 처음부터 다시 실행합니다. 금고와 증명을 새로 만듭니다 |

<a id="t9"></a>
## T9. 금고 컴파일 결과가 없거나 deployPclProxy가 되돌려짐

| 항목 | 내용 |
| --- | --- |
| 증상 | `금고 컴파일 결과가 없습니다`, 또는 3b(PCL 프록시 배포)가 `execution reverted`로 실패 |
| 원인 | `out/`이 없습니다. 직접 수정한 코드에서 초기화 데이터를 빈 값(`0x`)으로 넘기면 `deployPclProxy`가 되돌립니다 |
| 확인 | `ls out/SettlementVault.sol/SettlementVault.json` |
| 해결 | `pnpm build:contracts`. 초기화 데이터에는 `initialize(구매 기업)` 호출을 넣습니다(Track A [문서 개선 노트 3번](../track-a-explain/documentation-improvement-notes.md)) |

<a id="t10"></a>
## T10. 로컬 인출이 merkle root snapshot 오류로 실패

| 항목 | 내용 |
| --- | --- |
| 증상 | 3단계 9번에서 `withdraw-alone … code 1`이 나오고, 이어지는 `시도 n` 줄이 세 번 모두 인출 code 1이면 멈춥니다 |
| 원인 | Clairveil v0.4.0에서 잎이 늘지 않은 블록의 인출은 Merkle 루트 스냅샷 재등록에서 거부됩니다. 단독 인출 실패는 예상된 결과이고, 실행기는 같은 블록에 0 노트 예치를 함께 넣어 다시 보냅니다 |
| 확인 | `.work/vendor-<시각>/out/cobl-withdraw-*-query.json`의 `raw_log`와 두 tx의 `height` |
| 해결 | 세 번 모두 다른 블록에 들어간 경우라 `pnpm b:reset` 뒤 `pnpm b:step 3`을 다시 실행합니다 |

## 라이브 서비스가 멈췄을 때의 대체 진행

| 멈춘 것 | 대체 진행 |
| --- | --- |
| faucet | 진행자가 전날 받아 둔 지갑에서 `pnpm b:fund`로 나눠 줍니다. 참가자 30명에 1,000 OKRW씩이면 3만 OKRW라 전역 24시간 한도 안입니다 |
| 테스트넷 RPC | 1, 2, 4단계는 진행자 화면에서 이 레포의 기록 파일(`track-b-enable/evidence/live/`, `track-a-explain/evidence/live/`)과 탐색기 링크로 설명하고, 참가자는 3단계(로컬, 네트워크 필요 없음)에 시간을 더 씁니다 |
| 참가자 노트북의 빌드 | 진행자가 만든 `.work/prebuilt/`를 USB나 공유 폴더로 나눠 줍니다. 그래도 안 되면 두 명이 한 노트북으로 진행합니다 |
| 시간 부족 | 2단계는 진행자가 화면에서 한 번 실행하고 참가자는 1, 3, 4단계만 실행합니다. 성공 기준은 3단계 기록의 해독과 인출로 판정합니다 |
