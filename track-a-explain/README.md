# Track A: 기관 연동 가이드와 실행 레시피

구매 기업이 협력사 대금을 Maroo에서 치르면서 협력사별 금액과 거래 관계를 공개 체인에서 숨기는 정산을 예로, 도입을 검토하는 기관의 시니어 엔지니어가 구조와 경계를 이해하고 첫 연동을 시작하도록 쓴 자료입니다. OKRW, PCL, Privacy를 한 흐름으로 다루고, 협력사 자격 확인에 EAS를 씁니다.

- 세 트랙의 연결: 이 트랙이 설명한 흐름을 참가자가 직접 돌리는 워크샵은 [Track B](../track-b-enable/README.md), 같은 사례를 빌더에게 넓힌 해커톤 트랙은 [Track C](../track-c-activate/README.md)입니다. 이어지는 방식은 [README](../README.md#세-트랙이-이어지는-방식)에 있습니다.

## 확인한 결과

- `[Live Testnet]` KYB 증명이 없는 협력사의 청구는 PCL 정책이 `EasNoAttestationReceived`로 거부했고, 증명을 색인한 뒤의 청구는 통과했습니다([금고 흐름 기록](evidence/live/pcl-kyb-gate-20260926T000141Z.json), 탐색기의 [거부 tx](https://explorer-testnet.maroo.io/tx/0xa4c7a3b9c025ce79c25f60d3f0b6e9e11deefb4e828d1e99bd163312c8cd557f)와 [통과 tx](https://explorer-testnet.maroo.io/tx/0x4d67c0dbf81db9c0f6e80bbe9c1d5676495800d0e7b4c643bed4df3a529cb81d)).
- `[Live Testnet]` Privacy 예치 요청은 전역 정책을 통과하고 요청 검증(`SDKInvalidRequest()`)에서 처음 막혔습니다([진단 기록](evidence/live/probe-first-failure-20260925T193314Z.json)).
- `[Local]` 협력사 B에게 보낸 15는 협력사 B, 구매 기업, 감사인이 각자 키로 풀었고, 제3자가 읽는 지급 tx에는 금액 필드가 없습니다([로컬 기록](evidence/local/vendor-settlement-20260926T041658Z.md)).
- `[Live Testnet]` PCL 정책에 거부된 tx는 문서와 달리 블록에 남아 가스 한도의 절반을 냈습니다([영수증 기록](evidence/live/reject-gas-20260926T171442Z.json), 탐색기에 [150,000 / 300,000, 50%](https://explorer-testnet.maroo.io/tx/0xa4c7a3b9c025ce79c25f60d3f0b6e9e11deefb4e828d1e99bd163312c8cd557f)로 보임).

## 읽는 순서

1. [기관 연동 가이드](integration-guide.md) 0절에서 독자 상황, 네 질문의 답, 지금 되는 것과 남은 것을 봅니다.
2. 가이드 1\~4절에서 구조, 흐름, 가시성, 키와 책임을 봅니다.
3. [실행 레시피](runnable-recipe.md)로 직접 실행하고, [증거 목록](evidence.md)과 결과를 대조합니다.
4. [기관 FAQ](faq.md)와 [문서 개선 노트](documentation-improvement-notes.md)를 봅니다.

## 결과물

| 결과물 | 파일 | 담은 것 |
| --- | --- | --- |
| 기관 연동 가이드 | [integration-guide.md](integration-guide.md) | 공급업체 정산 여정으로 짠 0\~8절과 부록. 아키텍처 다이어그램, 시퀀스 다이어그램, 노트 상태 다이어그램. 온체인, 오프체인, 지갑, prover, auditor, policy 경계 표. 상태 전이, 가시성, 키와 서비스 책임, 실패 분류와 최초 실패 계층, 4\~8주 PoC 설계, 프로덕션 전에 남은 것. 문서 확인(`[Docs Only]`), 직접 검증(`[Live Testnet]`, `[Local]`), 제안(권고)을 문장마다 표시 |
| 실행 레시피 | [runnable-recipe.md](runnable-recipe.md), [recipe/](recipe/) | TypeScript 스크립트 여섯 개와 Solidity 금고. 준비, 입력값, 예상 결과, 확인 방법, 오류 처리. 테스트넷과 로컬의 검증 범위를 나눔 |
| 기관 FAQ | [faq.md](faq.md) | 질문 9개. prover에 보이는 것, 감사, disclosure, 키 보관, KYB와 PCL, 사전 검사, 재시도와 이중 지급, 업그레이드, 프로덕션 준비도 |
| 문서 개선 노트 | [documentation-improvement-notes.md](documentation-improvement-notes.md) | Maroo Docs 7개, Clairveil 1개. 항목마다 멈추는 사람과 단계, 잘못 믿게 되는 것, 확인 비용, 재현 명령, 고친 문구 제안 |
| 기술 워크스루 영상 | [영상](https://youtu.be/WAof3FSU_Uw) | 시니어 엔지니어 대상 아키텍처 리뷰와 실행 경로 시연, 12\~18분 |

## 바로 실행

```bash
pnpm install
pnpm a:inspect         # [Live Testnet] Privacy 정책, 요구 증명, 요청 모양. 키와 잔액 없이 됩니다
pnpm a:probe           # [Live Testnet] 예치 요청이 처음 막히는 층
pnpm setup:clairveil   # Clairveil v0.4.0 조합을 vendor/ 에 받습니다
pnpm a:local           # [Local] 차폐 정산 전체, 약 4분
```

`pnpm a:inspect`와 `pnpm a:probe`는 역할 지갑 파일이 있어야 구매 기업 주소를 읽습니다. 먼저 `pnpm setup:wallets`를 한 번 실행합니다. 테스트넷 상태 변경 흐름(`pnpm a:kyb-gate`)은 테스트넷 OKRW가 필요하고, 준비 방법은 [레시피 2절](runnable-recipe.md#2-지갑과-테스트넷-okrw)에 있습니다.

## 검증 범위

| 환경 | 검증한 것 | 증거 |
| --- | --- | --- |
| Maroo 테스트넷 | Privacy 정책과 요구 증명 조회, 예치의 최초 실패 계층(요청 검증), 전역 정책 사전 검사 방법, 단순 이체의 가스(문서 예시 21,000, 실제 일반 계정 약 104,000, 에이전트 지갑 약 284,000), 문서 주장 대조. KYB 관문 금고의 상태 변경 tx 18건(거부 셋, 통과 하나) | [evidence.md 1절](evidence.md#1-maroo-테스트넷-live-testnet) |
| Clairveil 로컬 | 예치, 일괄 지급, 스캔, 해독, 인출까지 차폐 정산 전체와 역할별 가시성 | [evidence.md 2절](evidence.md#2-clairveil-로컬-local) |

테스트넷에서 유효한 Privacy 상태 변경은 외부에서 만들 재료(회로 산출물, 차폐 상태 조회 경로, 성공한 예시 입력)가 공개되지 않아 실행하지 못했습니다. 두 환경의 결과는 서로 다른 라벨로만 적고, PCL과 Privacy가 Maroo에서 함께 성공한 것처럼 합치지 않습니다.
