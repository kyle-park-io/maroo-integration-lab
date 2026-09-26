# 에이전트 스킬 시험 · 2026-09-27

- 대상: [`.claude/skills/maroo-integration/SKILL.md`](../../../.claude/skills/maroo-integration/SKILL.md)(보강 전 판)
- 방법: 새 하위 에이전트에게 스킬 파일 하나만 읽게 하고(다른 파일, 명령, 웹 금지), 실제 연동에서 나올 질문 11개에 스킬에 적힌 것만으로 답하게 했다. 스킬에 없으면 "스킬에 없음"으로 답하게 했다. 9, 10번은 스킬에 없는 것을 묻는 질문이다.
- 판정: 답을 이 레포의 기록과 대조했다.

| # | 질문 | 에이전트 답(요약) | 판정 |
| --- | --- | --- | --- |
| 1 | PCL 프록시 금고 배포 호출, 초기화 함수가 없을 때 | `pcl.deployPclProxy({ kind: Transparent, logic, initialOwner, initializer })`, 초기화 데이터를 `0x`로 비우면 되돌려짐 | 맞음(`pnpm a:kyb-gate`, `pnpm a:doc-claims`) |
| 2 | 보내기 전 정책 거부를 `eth_call`로 알 수 있나 | 부족함. `eth_estimateGas`가 전역·컨트랙트 정책을 함께 평가 | 맞음(`pnpm a:probe-global`) |
| 3 | 가스 한도, 21,000이면 되나 | 추정값 + 25% 안팎, 21,000 고정 금지, 일반 약 104,000·에이전트 지갑 약 284,000 | 맞음(`pnpm a:probe-send-gas`) |
| 4 | 증명 발급 뒤 `EasNoAttestationReceived` | `indexAttestation`을 빠뜨림 | 맞음(금고 흐름 6b) |
| 5 | 에이전트 한도 5 OKRW 설정 | `setMetadata(agentId, "TransferLimit", numberToHex(한도, { size: 32 }))`, 32바이트 uint256, 숫자 문자열 아님 | 맞음(`pnpm c:agent-limit`) |
| 6 | `setAgentWallet` 마감 | 블록 시각 + 300초 안, 넘으면 `deadline too far` | 맞음(`pnpm c:agent-limit` 1단계) |
| 7 | 소유자 주소로 `getAgentIds`가 빈 목록 | 기준이 연결된 에이전트 지갑, 소유자는 `ownerOf` | 맞음 |
| 8 | Privacy deposit 성공 방법, 무효한 proof로 시도 | "스킬에 없음"이라고 하면서, 재료가 공개되지 않아 `SDKInvalidRequest()`에서 막히고 무효한 proof 전송은 금지라고 답함 | 내용은 맞음. 성공 방법이 지금은 없다는 문장이 스킬에 없어 "스킬에 없음"으로 답함. 스킬에 그 문장을 더함 |
| 9 | 메인넷 RPC 주소 | 스킬에 없음 | 맞음(짐작하지 않음) |
| 10 | OKRW ERC-20 주소 | 스킬에 없음. OKRW 프리컴파일 주소는 ERC-20으로 적혀 있지 않다고 답함 | 맞음(짐작하지 않음). 문서의 `OKRW_ERC20` 주소에 코드가 없다는 것과 네이티브 value로 보낸다는 것을 스킬에 더함 |
| 11 | 컨트랙트 정책 거부 tx의 가스와 기록 | 가스 한도의 절반을 내고 블록에 되돌려진 채 남음 | 맞음(금고 흐름 5·6b·7c) |
