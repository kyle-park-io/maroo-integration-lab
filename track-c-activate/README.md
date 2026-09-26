# Track C: Maroo 해커톤 트랙 설계

Maroo 해커톤에 참가할 빌더가 무엇을 만들고, 어떤 primitive를 어디까지 연동해야 유효한 제출로 인정받고, 무엇으로 증명하는지 정한 트랙 설계입니다. 트랙 셋 가운데 기밀 정산을 Flagship으로 깊게 썼습니다.

- 세 트랙의 연결: Flagship 트랙 1은 Track A와 B의 비공개 공급업체 정산 사례를 빌더에게 넓힌 것입니다. 첫 성공 경로의 기준 구현은 [Track A 레시피](../track-a-explain/runnable-recipe.md)이고, 멘토 답변 방향은 Track A에서 찾은 사유 코드와 Track B 트러블슈팅에서 옮겼습니다.

## 결과물

| 결과물 | 파일 | 담은 것 |
| --- | --- | --- |
| 트랙 포트폴리오 | [portfolio.md](portfolio.md) | 세 트랙의 주제와 대상, primitive 범위, 트랙을 나눈 기준, 공통 규칙(라벨, 제출 자료, 무효 사례, 심사 흐름), 참가 전 확인할 테스트넷 조건 |
| 트랙 1. 기밀 정산(Flagship) | [tracks/1-private-settlement.md](tracks/1-private-settlement.md) | 필수 15항목과 Flagship 11항목: 레퍼런스 아키텍처, 개발자 여정, 구성 요소, 스타터 키트 명세, 디렉터리 구조, 15분 첫 성공 경로, 승인 체크리스트, 증거 요건, 심사 예시, 워크샵 개요, 멘토 질문 |
| 트랙 2. 규칙 안의 에이전트 결제 | [tracks/2-agent-payments.md](tracks/2-agent-payments.md) | 필수 15항목. 기기가 결제하는 갈래 포함 |
| 트랙 3. 자격으로 여는 원화 결제 | [tracks/3-credentialed-krw-payments.md](tracks/3-credentialed-krw-payments.md) | 필수 15항목 |
| 기술 근거 | [grounding/check-track-requirements.ts](grounding/check-track-requirements.ts), [evidence.md](evidence.md) | 세 트랙 요건이 기대는 기능을 테스트넷에서 조회하고 시뮬레이션한 기록 |
| 심사 자동 판정 | [judge/check-evidence.ts](judge/check-evidence.ts), [예시](evidence.md#5-심사-자동-판정-예시-live-testnet-조회) | 참가자의 `evidence.json`을 테스트넷에서 다시 확인해 요건별로 판정. 적힌 거부 사유가 실제와 다르면 실패로 표시. Track A 기록으로 만든 예시에서 트랙 1 요건 R1~R5 통과 |
| 워크스루 영상 | 녹화 대기(2026-09-27) | 트랙을 나눈 이유, Flagship 최소 연동 요건과 심사 기준, 피상적 연동을 거르는 방법, 5~8분 |

## 필수 항목 대응

| 항목 | 트랙 1 | 트랙 2 | 트랙 3 |
| --- | --- | --- | --- |
| 이름, 핵심 주제, 문제 정의, 대상 빌더, 활용 사례 | 1~5절 | 1~5절 | 1~5절 |
| 필수 primitive와 필요한 이유 | 6~7절 | 6~7절 | 6~7절 |
| 최소 연동 요건, 증명 방법, 제출 자료 | 8~10절 | 8~10절 | 8~10절 |
| 심사 기준과 배점, 프로젝트 예시, 참고 자료 | 11~13절 | 11~13절 | 11~13절 |
| 무효 연동 사례, 보안·프라이버시·프로덕션 주의 사항 | 14~15절 | 14~15절 | 14~15절 |
| Flagship 추가 항목 | 16~26절 | 해당 없음 | 해당 없음 |
| 이 레포가 직접 채운 예시 | 24절(`pnpm c:judge-example`) | 16절(`pnpm c:agent-limit`) | 없음 |

## 실행

```bash
pnpm install
pnpm setup:wallets          # 조회에 쓸 주소를 만듭니다. 키는 레포 밖 파일에 저장됩니다
pnpm c:grounding            # [Live Testnet] 조회와 시뮬레이션. tx 없음
pnpm c:grounding --write    # 구매 기업 지갑으로 에이전트 등록 tx 한 건(테스트넷 OKRW 필요)
pnpm c:judge evidence.json --track 1   # 제출물 증거 판정. tx 없음
pnpm c:judge-example                   # Track A 기록으로 만든 예시 제출물을 판정
pnpm c:agent-limit                     # [Live Testnet] 트랙 2 요건 R1~R4 실증. 약 30 OKRW
```

Flagship의 15분 첫 성공 경로는 [트랙 1의 21절](tracks/1-private-settlement.md#21-15분-첫-성공-경로-local)에 있고, 기준 구현은 Track A의 `pnpm a:local`입니다.
