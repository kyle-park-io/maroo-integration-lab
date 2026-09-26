# 기관 FAQ: 비공개 공급업체 정산

Maroo 도입을 검토하는 기관의 테크니컬 리드와 백엔드 엔지니어가 먼저 묻는 질문을 모았습니다. 예시 업무는 구매 기업이 협력사 여러 곳에 대금을 치르면서, 협력사별 금액과 거래 관계를 공개 체인에서 숨기는 정산입니다.

- 기준: Maroo Docs(2026-09-25 확인), Clairveil v0.4.0 [`ca85b027`](https://github.com/DELIGHT-LABS/clairveil/tree/ca85b02708fdd75259d4d2ee2d671c21198cec69), Maroo 테스트넷(chain ID 450815, 2026-09-26 확인)
- 증거 라벨: `[Live Testnet]` Maroo 테스트넷에서 직접 실행하거나 조회한 결과, `[Local]` Clairveil 로컬 체인에서 실행한 결과, `[Docs Only]` 문서로만 확인한 내용. 권고는 "권고"로 따로 표시합니다.

## 1. prover를 외부에 두면 협력사별 대금이 prover 운영자에게 보이나요?

보입니다. Clairveil은 원격 prover를 비공개 정보를 다루는 신뢰 구성 요소로 규정합니다. 증명 요청에는 금액, 노트 난수, Merkle 경로, nullifier 같은 값이 들어가고, deposit 증명 요청에는 받는 쪽 공개키, 금액, 자산 ID, 난수, 커밋먼트가 들어갑니다. 위협 모델은 높은 비공개 수준이 필요하면 로컬 prover를 쓰고, 원격 prover를 쓰려면 계약과 로그 통제를 갖춘 신뢰 서비스로 다루라고 권합니다.

- 근거: `[Docs Only]` Clairveil [운영 가이드](https://github.com/DELIGHT-LABS/clairveil/blob/ca85b02708fdd75259d4d2ee2d671c21198cec69/docs/clairveil-operations-guide.md)(원격 prover, deposit prover 요청), [위협 모델 72행](https://github.com/DELIGHT-LABS/clairveil/blob/ca85b02708fdd75259d4d2ee2d671c21198cec69/docs/clairveil-threat-model.md#L72)
- 이 레포의 로컬 실행은 CLI가 증명을 같은 프로세스 안에서 만듭니다. 별도 prover 서비스를 거치지 않습니다. `[Local]`
- Maroo Docs에는 prover 엔드포인트와 회로 산출물이 없습니다. `[Docs Only]`
- 권고: PoC에서 prover 배치(기관 내부 서버, 사용자 기기, 외부 서비스)를 먼저 정하고, 외부 서비스라면 요청 본문을 남기지 않는다는 조건을 계약에 넣습니다.

## 2. 감사인이나 규제기관은 비공개로 보낸 대금을 어떻게 확인하나요?

Clairveil에서는 모든 자산 이동에 감사 disclosure가 들어갑니다. 체인에 설정된 감사 공개키로 암호화되고, 그 비밀키를 가진 쪽이 풉니다. 이 레포의 로컬 실행에서 감사인은 협력사 B 지급 한 건과 협력사 A 일괄 지급 두 건을 모두 풀었고, 세 건 모두 검증을 통과했습니다(`verified=true`).

- 근거: `[Local]` [로컬 실행 기록](evidence/local/vendor-settlement-20260925T181924Z.md) 2절
- 일괄 지급 tx는 CLI의 `--tx-hash` 해독이 첫 메시지만 풉니다. 메시지마다 감사 암호문을 꺼내 따로 넘겨야 모든 송장이 확인됩니다. `[Local]`
- Maroo Docs는 규제기관의 관찰자 노드 열람 기능이 아직 체인에 구현되지 않았다고 적습니다. Maroo에서 감사 비밀키를 누가 보관하는지는 문서에 없습니다. `[Docs Only]` [검증 가능한 프라이버시](https://docs.maroo.io/concepts/privacy/verifiable-privacy/)
- 권고: PoC에서 감사 키 보관 주체(내부 감사팀, 외부감사인, 규제기관)와 교체 주기를 정합니다. Clairveil도 감사 비밀키의 보관, 접근 통제, 교체, 사고 대응을 도입하는 쪽의 책임으로 둡니다. `[Docs Only]` [위협 모델 13행](https://github.com/DELIGHT-LABS/clairveil/blob/ca85b02708fdd75259d4d2ee2d671c21198cec69/docs/clairveil-threat-model.md#L13)

## 3. 협력사에게는 송장 내용을 보여 주고, 다른 사람에게는 숨길 수 있나요?

전송마다 공개할 필드(금액, 보낸 쪽, 받는 쪽의 조합)와 전달 방식(`none`, `public`, `recipient-encrypted`)을 고릅니다. 로컬 실행에서 협력사 B 지급은 금액, 보낸 쪽, 받는 쪽을 B의 공개키로 암호화했고, B만 그 내용을 풀었습니다. 보낸 쪽도 자기 기록(self-view)으로 같은 내용을 확인합니다.

제3자가 공개 체인에서 볼 수 있는 것은 따로 정리해 두어야 합니다.

| tx | 공개되는 값 | 공개되지 않는 값 |
| --- | --- | --- |
| 예치(deposit) | 보낸 계정, 금액 | 노트 내용 |
| 지급(transfer) | 보낸 계정, 한 tx 안의 지급 건수 | 금액, 받는 쪽 |
| 인출(withdraw) | 인출한 계정, 금액, 받는 주소 | 어느 노트를 썼는지 |

- 근거: `[Local]` [로컬 실행 기록](evidence/local/vendor-settlement-20260925T181924Z.md) 2절, 3절, 4절
- 로컬 실행에서 구매 기업의 예치 금액 12와 협력사 A의 인출 금액 12가 모두 공개돼, 두 거래가 금액으로 이어졌습니다. `[Local]`
- 참조 구현의 증명 하나짜리 일괄 지급은 출력을 32칸으로 고정할 수 있어, 로컬 실행에서 실제 지급 3건이 tx에 드러나지 않았습니다. 대리 인출로 보내면 인출 tx의 보낸 계정이 협력사 대신 중계자가 됩니다. `[Local]` [추가 단계 기록](evidence/local/vendor-settlement-20260926T041658Z.md) 5절
- 권고: 예치는 송장 단위 대신 정산 주기의 총액 단위로 하고, 협력사 인출은 여러 건을 모아 다른 시점에 합니다.

## 4. 어떤 키를 누가 보관해야 하나요?

| 키나 권한 | 보관 주체 | 잃거나 새면 | 근거 |
| --- | --- | --- | --- |
| 협력사 지갑의 노트 키(지출, 보기) | 협력사 | 잃으면 받은 대금을 쓸 수 없고, 새면 받은 내역이 보입니다 | Clairveil 레퍼런스는 지갑 파일을 평문 JSON(권한 0600)으로 두고, 프로덕션은 저장 시 암호화하라고 적습니다 `[Docs Only]` [위협 모델 96행](https://github.com/DELIGHT-LABS/clairveil/blob/ca85b02708fdd75259d4d2ee2d671c21198cec69/docs/clairveil-threat-model.md#L96) |
| 구매 기업의 계정 키와 노트 키 | 구매 기업 | 대금 재원을 잃거나 지급 내역이 보입니다 | 같음 |
| 감사 epoch 비밀키 | Maroo 문서에 없음 | 해당 기간의 모든 감사 내용이 보입니다 | 2번 답 |
| KYB 증명 발급 키 | 발급 기관 | 자격 없는 협력사에 증명이 나가거나, 정상 협력사의 증명을 폐기할 수 없습니다 | 5번 답 |
| 금고의 PCL 정책 관리 권한 | 구매 기업의 컴플라이언스 담당 | 정책이 바뀌거나 떼어질 수 있습니다 | [금고 흐름 스크립트](recipe/pcl-kyb-gate.ts) |
| 금고의 업그레이드 권한(ProxyAdmin 소유자) | 정책 관리와 다른 주체 | 금고 로직이 바뀌어 협력사 몫이 빠져나갈 수 있습니다 | 8번 답 |

- Maroo Docs는 Privacy에서 지갑이 노트 키와 보기 키를 어떻게 보관하는지 다루지 않습니다. `[Docs Only]`
- 테스트넷 Privacy 프리컴파일의 정책 관리자는 `0x58eC1E718ff15e5f34591747D47ADf5BccDA804F`입니다. `[Live Testnet]` [조회 기록](evidence/live/inspect-privacy-boundary-20260925T192735Z.json)

## 5. 협력사 자격(KYB)은 어디서 확인되나요?

PCL은 호출하는 쪽을 평가합니다. 차폐 지급에서 받는 쪽은 증명 안에 숨어 있어서, 체인은 지급하는 순간 협력사의 자격을 볼 수 없습니다. 그래서 협력사 자격은 두 곳에서 확인합니다.

1. 협력사가 직접 부르는 호출(인출, 금고 청구)에 PCL 정책을 겁니다. 이 레포의 정산 금고는 `claim()`에만 KYB 증명 정책(`EAS_POLICY`)을 걸고, 다른 함수는 정책 대상에서 뺍니다.
2. 구매 기업이 지급 목록을 만들 때 체인 밖에서 협력사의 증명을 확인합니다.

- 테스트넷 Privacy 프리컴파일에는 `And(EAS_POLICY, DENYLIST_POLICY)`가 걸려 있습니다. 호출자는 증명(스키마 `bytes32 kakaoIdHash, uint8 version`)이 있고 차단 목록에 없어야 합니다. 개인 본인 인증 스키마이고, 기관용 KYB 스키마와 발급자는 테스트넷에 없습니다. `[Live Testnet]` [조회 기록](evidence/live/inspect-privacy-boundary-20260925T192735Z.json)
- EAS 증명은 발급한 뒤 Indexer에 색인해야 PCL이 인식합니다. 2026-09-26 금고 흐름에서 협력사 A는 증명을 받은 뒤에도 색인 전 청구가 `EasNoAttestationReceived`로 거부됐고([tx](https://explorer-testnet.maroo.io/tx/0xafe80ae6248a93138104ad72552da5987f24ccdbd74520c01713406fa31a9ef4)), `indexAttestation` 뒤 청구는 통과했습니다([tx](https://explorer-testnet.maroo.io/tx/0x4d67c0dbf81db9c0f6e80bbe9c1d5676495800d0e7b4c643bed4df3a529cb81d)). `[Live Testnet]` [금고 흐름 기록](evidence/live/pcl-kyb-gate-20260926T000141Z.json)
- 폐기한 증명이 색인돼 있는 협력사에게 새 증명을 발급하고 색인을 빠뜨리면, 청구는 `EasAttestationRevoked`로 거부됩니다. PCL이 색인된 옛 증명을 보기 때문입니다. 같은 협력사 지갑으로 금고 흐름을 두 번째 실행했을 때 색인 전 청구가 이렇게 거부됐고, 새 증명을 색인한 뒤에는 통과했습니다. `[Live Testnet]` [두 번째 실행 기록](../track-b-enable/evidence/live/pcl-kyb-gate-20260926T000228Z.json) 협력사 자격을 갱신하는 절차에 색인을 넣지 않으면, 협력사는 방금 받은 증명이 폐기됐다는 오류를 보게 됩니다.
- 권고: 기관 KYB로 Privacy 호출을 제한하려면 KYB 스키마와 발급자를 정하고, 체인 정책 관리자와 정책 변경을 협의하는 일을 PoC 범위에 넣습니다.

## 6. 보내기 전에 정책 거부를 미리 알 수 있나요?

`eth_estimateGas`로 확인합니다. `eth_call`(viem의 `simulateContract` 등)은 테스트넷 전역 정책을 평가하지 않습니다. 같은 OKRW 전송을 두 방법으로 불렀더니, `eth_call`은 통과하고 `eth_estimateGas`는 전역 정책으로 거부했습니다.

```text
eth_call         통과
eth_estimateGas  거부: AnyOfRejected(...)
                   ExceededPeriodicVolume(10000000000000000000000000, 10005000000000000000000000, 1790380800)
                   EasNoAttestationReceived(0x5336F019Bd8E9E0064be7330833dc883a8a6c94d)
```

- 테스트넷 전역 정책은 KYC 증명이 없는 계정에 두 한도를 둡니다. 24시간 누적 1,000만 OKRW와 건당 200만 OKRW이고, KYC 증명이 있으면 둘 다 면제됩니다. 에이전트 지갑이 보내면 24시간 한도는 소유자 모두를 기준으로 봅니다. `[Live Testnet]` [전역 정책 조회 기록](../track-c-activate/evidence/live/grounding-20260925T194211Z.json), 재현: `pnpm c:grounding`
- 위 계정(faucet)은 24시간 한도를 다 썼고 증명이 없어 거부됐고, 한도 창은 `resetAt`(2026-09-26 00:00 UTC)에 풀립니다. `[Live Testnet]` [기록](evidence/live/probe-global-policy-20260925T190841Z.json), 재현: `pnpm a:probe-global`
- 사유 코드와 인자는 [PCL ReasonCode](https://docs.maroo.io/concepts/compliance/pcl-reason-codes/)에 정의돼 있습니다. `[Docs Only]`
- 가스 한도도 `eth_estimateGas` 값으로 정합니다. 단순 OKRW 이체도 일반 계정은 약 104,000, 에이전트 지갑은 약 284,000 가스를 쓰고, Ethereum처럼 21,000으로 보내면 블록에 들어가 되돌려지며 수수료 0.189 OKRW를 냅니다. 가스 21,000으로 부른 `eth_call`은 통과해 이 경우도 잡지 못합니다. 추정값의 125%로 보내도 쓴 가스는 같았습니다. `[Live Testnet]` [기록](evidence/live/probe-send-gas-20260926T052147Z.json), 재현: `pnpm a:probe-send-gas`
- 권고: 사전 검사는 `eth_estimateGas`로 하고, `AnyOfRejected` 안의 자식 사유까지 풀어 사용자에게 보여 줍니다.

## 7. 지급이 실패하면 다시 보내도 되나요? 두 번 지급될 위험은 없나요?

체인은 같은 노트를 두 번 쓰지 못하게 막습니다. 이미 쓴 노트의 nullifier가 다시 오면 거부됩니다. 그래서 이중 지급을 막는 1차 장치는 체인에 있고, 업무 쪽에서는 송장 단위로 한 번만 지급되도록 기록을 관리합니다.

- 일괄 지급(`batchTransfer`)은 원자적입니다. 한 항목이라도 실패하면 전체가 되돌려지고, 한 번에 최대 20건입니다. `[Docs Only]` [IPrivacy.batchTransfer](https://docs.maroo.io/apis/contract/contract-privacy-batch-transfer/)
- 노트 관련 거부는 대부분 풀 상태를 오래된 것으로 본 경우라, 노트를 새로 스캔한 뒤 다시 시도하라고 문서가 안내합니다. `[Docs Only]` [프라이버시 프리컴파일](https://docs.maroo.io/concepts/privacy/privacy-precompile-overview/)
- 요청에는 만료 시각이 있고, 이 값은 서명과 증명에 묶입니다. 만료 뒤에는 요청을 새로 만들어야 합니다. `[Docs Only]` [Clairveil CLI 참조](https://github.com/DELIGHT-LABS/clairveil/blob/ca85b02708fdd75259d4d2ee2d671c21198cec69/docs/clairveil-cli-reference.md)
- 결과가 불확실한 제출(응답 시간 초과 등)은 새로 보내기 전에 기존 tx 해시부터 대사합니다. `[Docs Only]` [clairveil-samples README](https://github.com/DELIGHT-LABS/clairveil-samples/blob/8321dedc231372679cfbea4314d080ecaea2e3f5/README.md)
- Clairveil v0.4.0 로컬 체인에서는 인출을 단독으로 보내면 Merkle 루트 스냅샷 재등록 오류(`merkle root snapshot re-registration is inconsistent`)로 실패했습니다. 같은 조건에서 다시 보내도 같은 오류가 납니다. 같은 블록에 잎을 더하는 tx가 함께 들어가면 성공했습니다. 이 조건은 로컬 참조 구현에서 확인한 것이고, Maroo 테스트넷에서도 생기는지는 유효한 인출을 외부에서 만들 수 없어 확인하지 못했습니다. `[Local]` [로컬 실행 기록](evidence/local/vendor-settlement-20260925T181924Z.md) 4절
- 권고: 체인 밖 지급 원장에 송장 번호별 멱등 키와 상태(준비, 제출, 확정, 실패)를 두고, 재시도 전에 원장과 체인을 대사합니다. Clairveil의 노트 예약 설계와 급여 레퍼런스 제품 문서가 참고가 됩니다. `[Docs Only]` [노트 예약 설계](https://github.com/DELIGHT-LABS/clairveil/blob/ca85b02708fdd75259d4d2ee2d671c21198cec69/docs/clairveil-note-reservation-design.md), [급여 레퍼런스 제품](https://github.com/DELIGHT-LABS/clairveil/blob/ca85b02708fdd75259d4d2ee2d671c21198cec69/docs/clairveil-reference-payroll-product.md)

## 8. 체인이나 컨트랙트가 업그레이드되면 무엇이 바뀌나요?

세 층을 나눠 봅니다.

- 금고 같은 컨트랙트: PCL 정책을 거는 프록시는 Transparent, UUPS, Beacon 세 종류라 항상 업그레이드할 수 있습니다. `[Docs Only]` [deployPclProxy](https://docs.maroo.io/apis/contract/contract-pcl-deploy-pcl-proxy/) 이 레포의 금고는 업그레이드 권한(ProxyAdmin 소유자)과 PCL 정책 관리 권한을 다른 주소에 두고, 배포 직후 ERC-1967 구현 슬롯을 직접 읽어 배포한 구현과 같은지 확인합니다. [금고 흐름 스크립트](recipe/pcl-kyb-gate.ts), `[Live Testnet]` [실행 기록](evidence/live/pcl-kyb-gate-20260926T000141Z.json)
- 차폐 풀과 회로: Clairveil v0.5.0(2026-09-22)은 감사 구조와 회로 식별자를 바꾸면서, 호환되지 않는 이전 genesis에서 올라오는 체인은 새 genesis로 초기화하고 노트, 스캔, 준비된 증명, 산출물 캐시를 버리고 다시 스캔하라고 적습니다. 제자리 이전 경로는 없습니다. `[Docs Only]` [Clairveil CHANGELOG v0.5.0](https://github.com/DELIGHT-LABS/clairveil/blob/v0.5.1/CHANGELOG.md)
- SDK: `@maroo-chain/viem` 0.4.0(2026-09-17)은 PCL 정책 템플릿 두 개의 작성 함수를 지웠습니다. npm 패키지 두 판을 비교해 확인했습니다.
- 권고: 업그레이드 권한은 멀티시그와 타임록에 두고, SDK와 참조 구현은 버전을 고정하고, 회로 변경은 노트 이전 계획(재예치, 재스캔)을 포함한 별도 PoC 항목으로 둡니다.

## 9. 지금 이 구조로 실제 협력사 대금을 처리할 수 있나요?

지금은 소액으로 흐름과 경계를 검증하는 PoC 단계까지 가능합니다. 실제 대금 규모를 막는 조건은 이렇습니다.

| 조건 | 내용 | 근거 |
| --- | --- | --- |
| 차폐 금액 상한 | 노트 하나에 약 18.45 OKRW. 1,000만 원을 차폐하려면 노트 542,102개와 일괄 지급 27,106번(20건씩)이 필요합니다 | `[Docs Only]` [IPrivacy.deposit](https://docs.maroo.io/apis/contract/contract-privacy-deposit/), 계산 |
| 참조 구현의 상태 | Clairveil은 `PUBLICATION_READY_EXPERIMENTAL`이고, 공식 trusted setup, 외부 ZK·보안 감사, 서명된 산출물 배포, 감사 키 보관을 범위 밖으로 둡니다 | `[Docs Only]` [Clairveil CHANGELOG v0.4.0](https://github.com/DELIGHT-LABS/clairveil/blob/ca85b02708fdd75259d4d2ee2d671c21198cec69/CHANGELOG.md) |
| 규제기관 열람 | 관찰자 노드 열람 기능이 체인에 아직 없습니다 | `[Docs Only]` 2번 답 |
| 테스트넷 Privacy 실행 | 외부 개발자가 유효한 증명을 만들 회로 산출물과 상태 조회 경로가 공개되지 않았습니다. deposit 요청은 요청 검증 단계(`SDKInvalidRequest`)에서 처음 막히고, 카카오 본인 인증 증명이 있는 지갑도 같습니다. 공식 SDK(ClairveilJS)의 예치 경로는 증명을 만들기 전에 회로 설정과 자산 등록 조회에서 멈춥니다 | `[Live Testnet]` [최초 실패 계층 기록](evidence/live/probe-first-failure-20260925T193314Z.json) |
| 기관 KYB | 테스트넷에 기관용 KYB 스키마와 발급자가 없습니다 | `[Live Testnet]` 5번 답 |
| 금고 회수 권한 | 이 레포의 금고는 협력사가 청구하기 전이면 구매 기업이 언제든 `recall`로 몫을 되돌릴 수 있습니다. 프로덕션에서는 청구 기간이나 타임락을 둡니다 | `[Live Testnet]` [금고 흐름 기록](evidence/live/pcl-kyb-gate-20260926T000141Z.json) 8단계, 권고 |
| 출시 전 관문 | Clairveil 운영 가이드의 최소 메인넷 관문(10개)과 위협 모델의 다운스트림 보안 관문(9개)이 남아 있습니다 | `[Docs Only]` [운영 가이드 11절](https://github.com/DELIGHT-LABS/clairveil/blob/ca85b02708fdd75259d4d2ee2d671c21198cec69/docs/clairveil-operations-guide.md), [위협 모델 8절](https://github.com/DELIGHT-LABS/clairveil/blob/ca85b02708fdd75259d4d2ee2d671c21198cec69/docs/clairveil-threat-model.md) |

- 권고: 4~8주 PoC는 소액 흐름 검증, prover 배치 결정, 감사 키 보관 설계, KYB 발급 경로, 체인 밖 지급 원장과 대사까지로 잡고, 금액 상한과 규제기관 열람은 Maroo의 로드맵 확인 항목으로 둡니다.
