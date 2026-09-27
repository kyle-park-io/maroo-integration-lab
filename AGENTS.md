# 에이전트 안내

이 레포를 여는 코딩 에이전트가 먼저 읽는 파일입니다. 사람을 위한 안내는 [README.md](README.md)에 있습니다.

## 이 레포

- 구매 기업이 협력사 대금을 Maroo 테스트넷(chain ID 450815)에서 치르면서 협력사별 금액과 거래 관계를 공개 체인에서 숨기는 정산을 한 사례로 잡고, 세 트랙을 만들었습니다. A는 기관 연동 가이드와 실행 레시피(`track-a-explain/`), B는 75분 워크샵(`track-b-enable/`), C는 해커톤 트랙 설계(`track-c-activate/`)입니다.
- 트랙마다 README, 실행 명령(`pnpm a:*`, `b:*`, `c:*`), 기록 폴더(`evidence/`)가 따로 있습니다. 세 트랙이 함께 쓰는 코드는 `shared/`에 있습니다.

## Maroo 연동 질문에 답하거나 코드를 쓸 때

1. 이 레포의 에이전트 스킬 `maroo-integration`을 먼저 읽습니다. 이 레포가 테스트넷에서 직접 확인한 규칙, Maroo Docs와 다르게 동작한 곳, 확인 명령이 표로 있습니다. 같은 파일이 [`.agents/skills/maroo-integration/SKILL.md`](.agents/skills/maroo-integration/SKILL.md)와 [`.claude/skills/maroo-integration/SKILL.md`](.claude/skills/maroo-integration/SKILL.md) 두 자리에 있고, 에이전트 도구는 자기가 찾는 자리에서 스스로 읽습니다(Codex는 `.agents/skills/`). 스킬 폴더를 스스로 찾지 않는 도구는 둘 중 하나를 지침으로 읽습니다.
2. 그 표에 없는 ABI, 주소, 엔드포인트, 동작은 짐작하지 않습니다. 표의 확인 명령을 안내하거나, 이 레포에서 확인하지 않았다고 답합니다.
3. 답에 증거 라벨(`[Live Testnet]`, `[Local]`, `[코드 대조]`, `[Docs Only]`, 권고)을 붙입니다. 뜻은 README의 "증거 라벨" 절에 있습니다.
4. Clairveil 로컬 체인의 결과를 Maroo 테스트넷의 성공으로 적지 않습니다. 테스트넷에서 유효한 Privacy 상태 변경은 아직 외부에서 실행할 수 없습니다.

## 명령

| 명령 | 하는 일 |
| --- | --- |
| `pnpm install`, `pnpm bootstrap` | 설치와 준비(2분 안팎). Clairveil 고정 커밋을 `vendor/`에 받아 빌드하고, 역할 지갑을 레포 밖에 만듭니다 |
| `pnpm review` | 키와 잔액 없이 20초 안팎에 확인합니다. 테스트넷에는 조회만 합니다 |
| `pnpm a:kyb-gate`, `pnpm b:step 2`, `pnpm c:agent-limit` | 테스트넷에 tx를 보내고 테스트넷 OKRW를 씁니다. 사용자가 원할 때만 돌립니다 |

## 지키는 것

- 역할 지갑의 키는 레포 밖 `~/.config/maroo-integration-lab/*.env`에 있습니다. 파일 내용을 출력하거나 레포로 옮기지 않습니다.
- `vendor/`에 받은 외부 코드는 고치지 않습니다.
- 스킬을 고칠 때는 `.claude/skills/` 쪽을 고친 뒤 `.agents/skills/`로 복사합니다. 두 파일이 다르거나 frontmatter가 규약에 맞지 않으면 `pnpm test:unit`이 실패합니다.
