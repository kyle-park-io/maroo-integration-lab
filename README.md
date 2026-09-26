# Maroo 연동 실습: 비공개 공급업체 정산

Primary Track: A (Explain). 추가로 B(Enable)와 C(Activate)를 함께 제출합니다.

구매 기업이 협력사 대금을 Maroo에서 치르면서 협력사별 금액과 거래 관계를 공개 체인에서 숨기는 정산을 하나의 사례로 잡고, 세 독자에게 맞춰 나눴습니다. A는 도입을 검토하는 기관의 시니어 엔지니어가 구조와 신뢰 경계를 이해하고 첫 연동을 시작하도록 쓴 가이드와 실행 레시피입니다. B는 같은 흐름을 기관 실무 엔지니어가 75분 동안 직접 실행하는 워크샵과 데모입니다. C는 이 흐름을 Maroo 해커톤의 Flagship 트랙으로 넓히고, 에이전트 결제와 자격 기반 원화 결제 트랙을 더한 설계입니다.

| 트랙 | 폴더 | 독자 | 먼저 볼 것 | 명령 | 증거 | 영상 |
| --- | --- | --- | --- | --- | --- | --- |
| A Explain (Primary) | [track-a-explain/](track-a-explain/) | 도입을 검토하는 기관 테크니컬 리드 | [기관 연동 가이드](track-a-explain/integration-guide.md) 0절 | `pnpm a:inspect`, `a:probe`, `a:kyb-gate`, `a:local` | [evidence.md](track-a-explain/evidence.md) | 녹화 대기(2026-09-27) |
| B Enable | [track-b-enable/](track-b-enable/) | 워크샵에서 구현하는 기관 실무 엔지니어 | [참가자 가이드](track-b-enable/participant-guide.md) | `pnpm b:prepare`, `b:check`, `b:step 1~5`, `b:smoke` | [evidence.md](track-b-enable/evidence.md) | 녹화 대기(2026-09-27) |
| C Activate | [track-c-activate/](track-c-activate/) | Maroo 해커톤에 참가할 빌더 | [트랙 포트폴리오](track-c-activate/portfolio.md) | `pnpm c:grounding` | [evidence.md](track-c-activate/evidence.md) | 녹화 대기(2026-09-27) |

- 권장 구조와의 대응: `docs/`는 `track-a-explain/`, `demo/`와 `workshop/`은 `track-b-enable/`, `hackathon/`은 `track-c-activate/`, `video-link.md`는 위 표의 영상 칸입니다. 세 트랙이 같은 코드(`shared/`)를 쓰므로 트랙별 폴더로 나눴습니다.
- Clairveil: v0.4.0 [`ca85b02708fdd75259d4d2ee2d671c21198cec69`](https://github.com/DELIGHT-LABS/clairveil/tree/ca85b02708fdd75259d4d2ee2d671c21198cec69). clairveil-samples [`8321dedc231372679cfbea4314d080ecaea2e3f5`](https://github.com/DELIGHT-LABS/clairveil-samples/tree/8321dedc231372679cfbea4314d080ecaea2e3f5)가 맞춰 둔 조합이라 ClairveilJS [`faf220d5b2fa1a186c30893ca74d765474015aee`](https://github.com/DELIGHT-LABS/clairveiljs/tree/faf220d5b2fa1a186c30893ca74d765474015aee)와 함께 받고, 실행 경로는 Clairveil의 Go 바이너리만 씁니다.
- 제출 메모: [SUBMISSION_NOTES.md](SUBMISSION_NOTES.md)(가정과 차이, 검증, AI 사용, DX 피드백, 알려진 한계)

## 5분 안에 보는 순서

1. [기관 연동 가이드](track-a-explain/integration-guide.md) 0절: 독자 상황, 네 질문의 답, 지금 되는 것과 남은 것
2. 같은 가이드 1~2절의 아키텍처 다이어그램과 시퀀스 다이어그램
3. [Track A 증거](track-a-explain/evidence.md): 테스트넷 조회와 로컬 차폐 정산 기록
4. [Track B README](track-b-enable/README.md)의 명령 표와 [Track C 포트폴리오](track-c-activate/portfolio.md)의 세 트랙 표

## 실행

| 도구 | 확인한 판 |
| --- | --- |
| Node.js | 24.19 (24 이상 필요, TypeScript를 바로 실행) |
| pnpm | 11.25 |
| Go | 1.27.1 (Clairveil `go.mod`는 1.25.12 이상) |
| Foundry | 1.8.1 (solc 0.8.37 자동 설치) |
| Git | 2.43 |

```bash
git clone https://github.com/kyle-park-io/maroo-integration-lab.git
cd maroo-integration-lab
pnpm install
pnpm build:contracts && pnpm test:contracts   # 금고 규칙 테스트 6개
pnpm setup:wallets                            # 테스트넷 전용 역할 지갑(레포 밖 파일)
pnpm a:inspect                                # [Live Testnet] Privacy 정책, 요구 증명, 최초 실패 계층
pnpm setup:clairveil && pnpm a:local          # [Local] 차폐 정산 전체, 약 4분
```

- 역할 지갑 파일 형식은 [testnet.env.example](testnet.env.example)에 있습니다. 실제 키는 `~/.config/maroo-integration-lab/testnet.env`(권한 600)에만 두고 레포에 올리지 않습니다.
- 테스트넷 상태 변경 흐름(`pnpm a:kyb-gate`, `pnpm b:step 2`)은 구매 기업 지갑에 테스트넷 OKRW 1,000 이상이 필요합니다. 받는 방법은 [레시피 2절](track-a-explain/runnable-recipe.md#2-지갑과-테스트넷-okrw)에 있습니다.
- 문서의 Mermaid 다이어그램은 `pnpm diagrams:check`로 밝은 테마와 어두운 테마에서 렌더링을 확인합니다.

## 증거 라벨

| 라벨 | 뜻 |
| --- | --- |
| `[Live Testnet]` | Maroo 테스트넷(chain ID 450815)에서 직접 실행하거나 조회한 결과. tx 해시, 탐색기 링크, 기록 파일이 있음 |
| `[Local]` | Clairveil v0.4.0 로컬 체인에서 실행한 결과. Maroo 테스트넷 호환성의 증거가 아님 |
| `[코드 대조]` | 공개 코드와 패키지(ABI, fixture)를 스크립트로 직접 대조한 결과. 체인을 부르지 않음 |
| `[Docs Only]` | 문서로만 확인한 내용 |
| 권고 | 이 레포가 제안하는 설계와 절차 |

Maroo 테스트넷에서는 OKRW, PCL, EAS 경로를 실행하고 Privacy는 처음 막히는 층(요청 검증, `SDKInvalidRequest`)까지 진단합니다. 외부 개발자가 유효한 Privacy 증명을 만들 회로 산출물과 차폐 상태 조회 경로가 공개되지 않아, 차폐 흐름 전체는 Clairveil 로컬에서 실행합니다. 두 환경의 결과를 한 흐름의 성공으로 합치지 않습니다.

## 레포 구조

```text
shared/            세 트랙이 함께 쓰는 코드
  contracts/       SettlementVault.sol (PCL 프록시 뒤에 두는 정산 금고)
  test/            금고 Foundry 테스트
  lib/             테스트넷 도구, KYB 금고 흐름, 로컬 차폐 정산 실행기, 정책 해석
track-a-explain/   가이드, 레시피, FAQ, 문서 개선 노트, recipe/*.ts, evidence/
track-b-enable/    참가자·진행자 가이드, 트러블슈팅, demo/*.ts, evidence/
track-c-activate/  포트폴리오, tracks/ 세 트랙, grounding/*.ts, evidence/
```

## 알려진 한계

- Maroo 테스트넷에서 유효한 Privacy 상태 변경은 실행하지 못했습니다. 필요한 재료가 공개되지 않았고, 비공개 구성 요소는 추측하지 않았습니다.
- 테스트넷 faucet이 전역 정책 한도에 걸려 있던 2026-09-25 16:41 UTC부터 09-26 00:00 UTC까지는 상태 변경 tx를 보내지 못했습니다. 한도가 풀린 뒤 KYB 금고 흐름(`a:kyb-gate`, `b:step 2`)과 에이전트 등록(`c:grounding --write`)을 실행해 각 트랙 evidence.md에 넣었습니다.
- 코드는 PoC와 레퍼런스 수준입니다. 프로덕션 키 관리, 지갑, 프론트엔드는 범위 밖입니다.
- 자세한 목록은 [SUBMISSION_NOTES.md의 Known Limitations](SUBMISSION_NOTES.md#known-limitations)에 있습니다.

## 외부 코드와 라이선스

| 코드 | 쓰는 방식 | 라이선스 |
| --- | --- | --- |
| [Clairveil](https://github.com/DELIGHT-LABS/clairveil), [ClairveilJS](https://github.com/DELIGHT-LABS/clairveiljs), [clairveil-samples](https://github.com/DELIGHT-LABS/clairveil-samples) | `pnpm setup:clairveil`이 고정 커밋을 `vendor/`에 받습니다(레포에는 넣지 않음). 수정하지 않았습니다. 로컬 정산 실행기의 흐름은 Clairveil `scripts/privacy-e2e-smoke.sh`를 따르고 역할과 금액만 바꿨습니다 | Apache-2.0 |
| [@maroo-chain/contracts](https://www.npmjs.com/package/@maroo-chain/contracts) 0.0.9 | 프리컴파일 ABI | MIT |
| [viem](https://viem.sh) 2.56.8 | 체인 호출 | MIT |
| [OpenZeppelin Contracts](https://github.com/OpenZeppelin/openzeppelin-contracts) 5.6.1 | 금고의 `Initializable` | MIT |
| [forge-std](https://github.com/foundry-rs/forge-std) 1.11.0 | 금고 테스트 | MIT 또는 Apache-2.0 |
| [mermaid-cli](https://github.com/mermaid-js/mermaid-cli) 11.17 | 다이어그램 렌더링 검사 | MIT |
