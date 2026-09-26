# 문서 개선 노트

비공개 공급업체 정산을 Maroo 테스트넷과 Clairveil 로컬 체인에서 따라가며, 개발자가 멈추거나 잘못 믿게 되는 곳을 모았습니다. 문체보다는 개발자가 실제로 겪는 마찰, 오해할 가능성, 확인에 드는 비용을 기준으로 골랐습니다.

- 확인 날짜: 2026-09-26. Maroo Docs 문장은 그날의 docs.maroo.io에서, 체인 동작은 Maroo 테스트넷(chain ID 450815)에서 확인했습니다.
- 재현: `pnpm a:doc-claims`가 1~5번의 문서 문장과 체인 동작을 한 번에 다시 대조합니다. 트랜잭션은 보내지 않습니다. 기록: [doc-claims](evidence/live/doc-claims-20260925T191304Z.json)
- 우선순위는 막히는 단계가 이를수록, 오해가 조용할수록 높게 매겼습니다.

| 번호 | 문서 | 요지 | 우선순위 |
| --- | --- | --- | --- |
| 1 | 테스트넷 접근, Privacy 정책 | Privacy 호출에 필요한 증명이 문서에 없고, 그 증명을 주는 서비스는 "KYC (mock)"으로만 소개됨 | 높음 |
| 2 | 사전 검사 | `eth_call`은 전역 정책을 평가하지 않는다는 점이 문서에 없음 | 높음 |
| 3 | `deployPclProxy` | "초기화 함수가 없으면 `0x`"라는 안내대로 하면 배포가 되돌려짐 | 중간 |
| 4 | `IPrivacy.withdraw` | 금액 단위 예시가 `aokrw`인데 체인은 `atokrw` | 중간 |
| 5 | 아키텍처, 배포 주소 | 프리컴파일 목록과 주소 표에 Privacy가 없음 | 낮음 |
| 6 | Clairveil 스모크 스크립트 | 인출이 실패해도 "passed"를 출력함 | 중간 |
| 7 | `eth_estimateGas` | 단순 전송이 21,000이라는 예시와 달리 테스트넷은 283,524. 21,000으로 보내면 수수료만 내고 되돌려짐 | 높음 |

## 1. Privacy 호출에 필요한 증명이 문서에 없다

- 대상: [테스트넷 접근](https://docs.maroo.io/resources/network/testnet-access/), [정책 인식 프리컴파일](https://docs.maroo.io/concepts/privacy/privacy-policy-aware-precompile/)
- 멈추는 사람과 단계: 자기 지갑으로 Privacy 프리컴파일을 처음 부르는 개발자. 호출이 거부됐을 때 본인 인증 증명이 필요한지, 무엇을 갖춰야 정책을 통과하는지 문서에서 찾을 수 없습니다.
- 잘못 믿게 되는 것: 테스트넷 접근 페이지는 KYC 서비스를 "KYC (mock)"으로만 적습니다. 개발자는 가짜 값으로 통과하는 모의 서비스라고 보거나, Privacy와 관계없는 서비스로 넘기기 쉽습니다. 실제로 테스트넷 Privacy 프리컴파일에는 `And(EAS_POLICY, DENYLIST_POLICY)`가 걸려 있어, 호출자는 증명(스키마 `bytes32 kakaoIdHash, uint8 version`)이 있어야 합니다. KYC 서비스는 카카오톡 본인 인증을 거친 뒤 지갑에 증명을 기록한다고 화면에 안내합니다. 서비스 코드에는 스키마 UID가 없어, 인증을 마친 지갑의 증명으로 확인했습니다. 인증 뒤 그 지갑은 이 스키마의 증명 하나를 발급자 `0xBfa4d8140b4104cA0Dd8c4E4b8cA420D551c0aE3`에게서 받았고, 만료는 없습니다. `[Live Testnet]` [인증 지갑 진단 기록](evidence/live/probe-kyc-holder-20260925T201710Z.json)
- 확인 비용: `IPcl.contractPolicies`를 불러 `LOGICAL_POLICY`를 풀고, SchemaRegistry에서 스키마 문자열을 찾고, KYC 서비스 화면을 따라가 보는 데 처음 보는 개발자라면 한두 시간이 걸립니다.
- 재현: `pnpm a:inspect`(정책과 스키마), `pnpm a:doc-claims`의 `kyc-labelled-mock`, `pnpm a:probe-kyc`(인증을 마친 지갑이 있을 때). `[Live Testnet]` [정책 조회 기록](evidence/live/inspect-privacy-boundary-20260925T192735Z.json)
- 고친 문구 제안
  - 정책 인식 프리컴파일 페이지에 "테스트넷 현재 바인딩" 표를 둡니다. 정책 템플릿, 스키마 UID(`0x3e448d93…f527d`), 스키마 문자열, resolver, 증명 발급 경로를 적습니다.
  - 테스트넷 접근 페이지의 "KYC (mock)"을 "KYC: 카카오 본인 인증으로 Privacy 호출용 증명 발급(1인 1지갑, 신원 해시가 체인에 기록됨)"으로 바꿉니다.

## 2. `eth_call`은 전역 정책을 평가하지 않는다

- 대상: [PCL ReasonCode](https://docs.maroo.io/concepts/compliance/pcl-reason-codes/)
- 멈추는 사람과 단계: 보내기 전 검사를 viem `simulateContract`(`eth_call`)로 구현한 백엔드 엔지니어. 검사는 통과했는데 실제 전송이나 가스 추정에서 거부됩니다.
- 잘못 믿게 되는 것: 시뮬레이션이 통과하면 정책도 통과한다고 믿습니다. 같은 OKRW 전송을 부르면 `eth_call`은 통과하고, `eth_estimateGas`는 `AnyOfRejected(ExceededPeriodicVolume(1,000만 OKRW 한도, …, resetAt), EasNoAttestationReceived(…))`로 거부합니다. faucet도 이 조건에 걸렸을 때 사유 대신 `reverted with the following signature:.`만 돌려주어, 사용자는 재시도 말고 할 수 있는 일이 없었습니다.
- 확인 비용: 원인이 체인 밖(RPC 설정, faucet 서버)에 있다고 보고 헤매기 쉽습니다. 이번에는 faucet이 두 시간 넘게 멈춘 원인을 `eth_estimateGas`로 찾기까지 여러 번의 시도가 들었습니다.
- 재현: `pnpm a:probe-global`, `pnpm a:doc-claims`의 `preflight-method`. `[Live Testnet]` [기록](evidence/live/probe-global-policy-20260925T190841Z.json)
- 고친 문구 제안: ReasonCode 페이지에 "사전 검사" 절을 둡니다. "전역 정책(기간 누적 한도 등)은 `eth_call`에서 평가되지 않습니다. 보내기 전 검사는 `eth_estimateGas`로 하고, `AnyOfRejected`의 자식 사유까지 풀어 사용자에게 보여 주십시오." 사유 코드 `ExceededPeriodicVolume`의 `resetAt`을 어떻게 보여 줄지 예시도 붙입니다. faucet 응답에도 풀린 사유와 `resetAt`을 담습니다.

## 3. `deployPclProxy`에 빈 초기화 데이터를 넘기면 되돌려진다

- 대상: [IPcl.deployPclProxy](https://docs.maroo.io/apis/contract/contract-pcl-deploy-pcl-proxy/)
- 멈추는 사람과 단계: 초기화 함수가 없는 컨트랙트를 PCL 프록시로 배포하려는 개발자. 문서는 "초기화가 필요 없으면 `"0x"`를 넘기라"고 안내합니다.
- 잘못 믿게 되는 것: 안내대로 `0x`를 넘기면 Transparent와 UUPS 모두 `Error("execution reverted")`로 되돌려집니다. `initialize()` 호출을 넣으면 같은 호출이 통과합니다. 프리컴파일이 안쪽 사유를 일반 문구로 바꿔 돌려주어, 개발자는 무엇이 문제인지 알 수 없습니다.
- 원인으로 보이는 곳: OpenZeppelin Contracts 5.6.0부터 `ERC1967Proxy`와 `TransparentUpgradeableProxy`는 초기화 데이터 없이 배포하면 `ERC1967ProxyUninitialized`로 되돌립니다. 체인에 들어간 표준 프록시가 이 판 이상이면 안내와 맞지 않게 됩니다. 체인에서 안쪽 사유를 볼 수 없어 추정으로 남깁니다.
- 확인 비용: 문서대로 했는데 실패하므로, 자기 컨트랙트나 인자를 먼저 의심하며 시간을 씁니다. 2026-09-23과 09-25에 같은 현상을 재현했습니다.
- 재현: `pnpm a:doc-claims`의 `empty-initializer`. `[Live Testnet]` eth_call만 씁니다.
- 고친 문구 제안: "표준 프록시는 빈 초기화 데이터를 거부합니다. 초기화할 상태가 없더라도 초기화 호출(예: 빈 `initialize()`)을 넣으십시오." 프리컴파일이 되돌릴 때 안쪽 사유(`ERC1967ProxyUninitialized` 등)를 그대로 전달하도록 바꾸면 이런 진단이 쉬워집니다.

## 4. 인출 금액의 단위 예시가 체인과 다르다

- 대상: [IPrivacy.withdraw](https://docs.maroo.io/apis/contract/contract-privacy-withdraw/)
- 멈추는 사람과 단계: 인출 요청의 `amount` 문자열을 만드는 개발자. 예시를 그대로 옮깁니다.
- 잘못 믿게 되는 것: 페이지는 단위를 `aokrw`로 6번 적고 `atokrw`는 한 번도 적지 않습니다. 체인의 `IOkrw.getParams().mintDenom`은 `atokrw`입니다. 같은 페이지가 단위가 다르면 `PrivacyNativeDenomMismatch`로 되돌린다고 적고 있어, 예시대로 만든 요청은 이 오류에 걸리게 됩니다. 테스트넷에서는 유효한 증명 없이 요청하면 형식 검사(`SDKInvalidRequest`)가 먼저 걸려, 외부 개발자가 이 불일치를 직접 드러내기도 어렵습니다.
- 확인 비용: 증명까지 다 만든 뒤에야 드러나는 오류라 되돌리는 비용이 큽니다.
- 재현: `pnpm a:doc-claims`의 `withdraw-denom`. `[Live Testnet]` 체인 값, 문서 문장 대조
- 고친 문구 제안: 예시를 `atokrw`로 바꾸고, "단위 문자열은 하드코딩하지 말고 `IOkrw.getParams().mintDenom`에서 읽으십시오"를 붙입니다.

## 5. 프리컴파일 목록과 배포 주소 표에 Privacy가 없다

- 대상: [Maroo 아키텍처](https://docs.maroo.io/concepts/core/maroo-architecture/), [배포된 컨트랙트](https://docs.maroo.io/resources/network/deployed-contracts/)
- 멈추는 사람과 단계: 아키텍처 리뷰를 위해 프리컴파일과 주소를 한 표로 정리하는 기관 엔지니어.
- 잘못 믿게 되는 것: 아키텍처 페이지는 "네 개의 프리컴파일"이라고 적고, 배포 주소 표에는 Privacy 주소(`0x100000000000000000000000000000000000000b`)가 없습니다. 검토하는 사람은 Privacy가 아직 배포되지 않았다고 볼 수 있습니다. 테스트넷에는 이 주소에 PCL 정책이 걸려 있습니다.
- 확인 비용: 주소를 `IPrivacy.sol` 상수나 API 페이지에서 따로 찾아야 합니다.
- 재현: `pnpm a:doc-claims`의 `privacy-precompile-listed`.
- 고친 문구 제안: 배포 주소 표에 `Privacy | 0x…0b | IPrivacy` 행을 더하고, 아키텍처 페이지의 개수를 다섯으로 고칩니다.

## 6. Clairveil v0.4.0 스모크 스크립트가 인출 실패를 놓친다

- 대상: Clairveil [`scripts/privacy-e2e-smoke.sh`](https://github.com/DELIGHT-LABS/clairveil/blob/ca85b02708fdd75259d4d2ee2d671c21198cec69/scripts/privacy-e2e-smoke.sh#L69-L83) (v0.4.0 `ca85b027`)
- 멈추는 사람과 단계: 로컬 흐름이 동작하는지 스모크 스크립트로 확인하는 개발자. 스크립트는 `privacy e2e smoke passed`로 끝납니다.
- 잘못 믿게 되는 것: 인출까지 성공했다고 믿습니다. 실제로는 직접 인출과 대리 인출이 모두 code 1(`merkle root snapshot re-registration is inconsistent`)로 실패했습니다. `wait_tx`는 tx가 블록에 들어갔는지만 확인하고 결과 코드는 보지 않으며, 마지막 검사(협력사 쪽 노트 10 보유, 준비금 불변식)는 인출 실패와 상관없이 참입니다.
- 원인으로 보이는 곳: 모든 privacy 이벤트 색인이 현재 Merkle 루트를 현재 블록 높이로 등록하는데, 인출은 잎을 더하지 않아 루트가 이전 블록과 같고, 같은 루트가 다른 높이로 이미 있으면 등록을 거부합니다([`path_snapshot.go` 176행](https://github.com/DELIGHT-LABS/clairveil/blob/ca85b02708fdd75259d4d2ee2d671c21198cec69/x/privacy/keeper/path_snapshot.go#L176)). 같은 블록에 잎을 더하는 tx가 함께 들어가면 인출이 성공합니다.
- 확인 비용: 스크립트가 통과를 알리므로, 문제는 인출을 직접 쓰는 단계에서야 드러납니다.
- 재현: `pnpm a:local`. 인출을 단독으로 보낸 뒤 같은 블록 우회로 다시 보냅니다. `[Local]` [로컬 실행 기록](evidence/local/vendor-settlement-20260925T181924Z.md) 1절, 4절
- 같은 블록 우회에는 순서 조건이 붙습니다. 대리 인출은 미리 만든 재료를 보내기만 해서 증명을 만드는 0 노트 예치보다 먼저 도착하고, 같은 블록 안에서 인출이 먼저 실행되면 세 번 모두 같은 오류로 실패했습니다. 예치를 먼저 mempool에 넣은 뒤 인출을 보내자 같은 블록에서 성공했습니다. `[Local]` [추가 단계 기록](evidence/local/vendor-settlement-20260926T041658Z.md) 5절
- 고친 문구 제안: `wait_tx`가 `code`가 0이 아니면 실패로 끝나게 하고, 인출 뒤 받는 계정 잔액이 늘었는지 검사합니다. 스냅샷 등록은 같은 루트를 새 높이로 다시 등록할 때 거부하지 않도록 고치거나, 인출 이벤트에서는 루트가 바뀌지 않은 경우 등록을 건너뜁니다.

## 7. 단순 전송의 가스 예시가 테스트넷과 다르다

- 대상: [eth_estimateGas](https://docs.maroo.io/apis/rpc/estimate-gas/)
- 멈추는 사람과 단계: 네이티브 OKRW를 보내는 지갑, 백엔드, SDK를 만드는 개발자. 문서는 반환값 설명과 cURL 예시에서 단순 전송이 `0x5208`(21,000)을 돌려준다고 적습니다. ClairveilJS도 EVM 네이티브 이체의 가스 한도 기본값을 `0x5208`로 두고(`evmSendGasLimit`), clairveil-samples의 `.env.evm.example`도 같은 값입니다.
- 잘못 믿게 되는 것: Ethereum처럼 단순 이체는 21,000이면 된다고 보고 가스 한도를 고정합니다. 테스트넷에서 1 OKRW 이체의 `eth_estimateGas`는 283,524이고, 금액을 100 OKRW로 바꿔도 같습니다. 21,000으로 보낸 이체는 블록에 들어가 한도를 다 쓰고 되돌려집니다. 수수료 0.189 OKRW를 내고 금액은 옮겨지지 않습니다. 영수증에는 사유가 없고, 가스 21,000으로 부른 `eth_call`은 통과해 사전 검사로도 잡히지 않습니다.
- 원인으로 보이는 곳: 문서 본문은 정책 검사가 실행 뒤 한도에 남은 가스를 쓴다고 적습니다. 전역 정책은 모든 tx에 걸리므로 단순 이체도 그 몫을 내고, `eth_call`이 통과하는 것은 2번처럼 전역 정책을 평가하지 않기 때문으로 보입니다. 체인 안쪽을 볼 수 없어 추정으로 남깁니다.
- 확인 비용: 되돌려진 tx에 사유가 없어 잔액, nonce, RPC 설정을 먼저 의심하게 됩니다.
- 재현: `pnpm a:probe-send-gas`. 구매 기업이 자기 협력사 A에게 1 OKRW를 세 번 보냅니다(수수료 합계 약 5.3 OKRW). `[Live Testnet]` [기록](evidence/live/probe-send-gas-20260926T043013Z.json)
- 여유분: 문서는 추정치에 25%를 더하라고 권합니다. 125%로 보낸 이체도 쓴 가스가 283,524로 같아, 여유분이 수수료를 늘리지 않았습니다. `[Live Testnet]`
- 고친 문구 제안: 반환값 설명과 cURL 예시의 `0x5208`을 테스트넷 값(단순 이체 약 283,500)으로 바꾸고 "Maroo에서는 정책 검사 때문에 단순 이체도 21,000을 넘습니다. 가스 한도를 고정하지 말고 `eth_estimateGas` 값에 여유를 더해 쓰십시오"를 붙입니다. ClairveilJS에는 EVM 프로필의 `evmSendGasLimit`를 추정값으로 채우는 방식을 제안합니다.
