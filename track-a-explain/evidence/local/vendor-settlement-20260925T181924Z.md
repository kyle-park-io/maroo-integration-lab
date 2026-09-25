# 비공개 공급업체 정산 로컬 실행 기록 · 20260925T181924Z

> 증거 라벨: `[Local]`. Clairveil 로컬 체인에서 실행한 기록입니다. Maroo 테스트넷에서 실행한 기록은 같은 트랙의 `evidence/live/`에 있습니다.
> 실행 환경: Clairveil `ca85b02708fdd75259d4d2ee2d671c21198cec69`(v0.4.0), chain-id `vendor-settlement-local-1`, Go 1.27.1 linux/amd64
> 재현 명령: `pnpm a:local`. 명령마다 받은 원본 JSON은 실행 폴더 `.work/vendor-<시각>/out/`에 남고, 레포에는 올리지 않습니다.
> 금액은 로컬 체인 자산 `uclair`의 정수 단위입니다.

## 1. 단계별 tx

| 단계 | tx | 높이 | 결과 | gas_used |
| --- | --- | --- | --- | --- |
| 구매 기업 예치 12 | `EAE1A6AF5603FC560B7378091E92C2EAF5A5CB353D01307E663E708D3F3C6750` | 2 | 성공 | 1283923 |
| 구매 기업 예치 8 | `2875E607E1B1CD1E6291F2D2F3C35BA358D0568DE50E4D7F65395860479771A5` | 3 | 성공 | 1281548 |
| 구매 기업 예치 15 | `68E5D5610175690EA9C98DA63CE011B038EDC43DD677C9290F8F7A60F9F37F46` | 4 | 성공 | 1281558 |
| 구매 기업 0 노트 예치 | `2162A7DE1E74EA67CC665854A828C034FDCCD8C7B33CA75ECBCAB18377C5B734` | 5 | 성공 | 1271486 |
| 구매 기업 0 노트 예치 | `1B5AAC626D12E9E640116198F6586987FCE568273016D4AE6B3322EC226FF47D` | 6 | 성공 | 1267234 |
| 구매 기업 0 노트 예치 | `355450DA4AFC1C767780FD7BA2D850EF707B570622078019E6C5132DF268B3DB` | 7 | 성공 | 1271486 |
| 협력사 A 지급: 송장 12, 8 일괄 전송 | `EE2FFE3F8B64FCB469A43FA3E4321F615FB1C1DC123470E725B86AE80F330778` | 8 | 성공 | 3189165 |
| 협력사 B 지급: 송장 15, 수신자 암호화 disclosure | `943BCBBC1146F54AEF9C7BD289845CFE9E51DBBE2971C42088C3065C7966DC7C` | 9 | 성공 | 1669635 |
| 협력사 A 인출 12, 단독으로 보냄 | `9334B30EA863F0E3BAF18F6605B65940AC5C9BA5207B6E6CAD3702037B8A6ACC` | 10 | 실패 code 1: `failed to execute message; message index: 0: failed to index withdraw privacy event: record privacy merkle root snapshot: merkle root snapshot re-registration is inconsistent` | 1091081 |
| 구매 기업 0 노트 예치, 인출과 같은 블록 | `BBF54BBC58DD8D84A77F0B44C28C7CC599F4289C59D74B88AAC2C55129A9B737` | 11 | 성공 | 1271486 |
| 협력사 A 인출 12, 0 노트 예치와 같은 블록 | `75B134188108FABFBC19F610788DDECBC2F6AC2FF913D067C243FC226B9C0492` | 11 | 성공 | 1091482 |

## 2. 역할마다 자기 키로 본 것

| 누가 | 무엇을 | 결과 |
| --- | --- | --- |
| 구매 기업 | 지급 전 자기 노트 | spendable [0, 0, 0, 8, 12, 15] |
| 협력사 A | 받은 노트 스캔 | spendable [8, 12] |
| 협력사 B | 받은 노트 스캔 | spendable [15] |
| 협력사 B | B 지급 tx의 수신자 disclosure | verified=true, recipient-encrypted, 필드 [amount, from_shielded_address, to_shielded_address], amount 15 |
| 구매 기업 | B 지급 tx의 self-view | verified=true, self-view-encrypted, 필드 [amount, from_shielded_address, to_shielded_address], amount 15 |
| 감사인 | B 지급 tx의 감사 disclosure | verified=true, audit-encrypted, 필드 [amount, from_shielded_address, to_shielded_address], amount 15 |
| 감사인 | A 일괄 지급 tx의 메시지 0 감사 disclosure(암호문 직접 해독) | verified=true, audit-encrypted, 필드 [amount, from_shielded_address, to_shielded_address], amount 12 |
| 감사인 | A 일괄 지급 tx의 메시지 1 감사 disclosure(암호문 직접 해독) | verified=true, audit-encrypted, 필드 [amount, from_shielded_address, to_shielded_address], amount 8 |
| 협력사 A | 인출 전후 투명 잔액 | 100000000000000000000 → 100000000000000000012 (차이 12. tx에 적힌 fee 29750000000000000, fee는 잔액에서 빠지지 않았습니다) |
| 협력사 A | 인출 뒤 남은 노트 | spendable [8] |
| 누구나 | 차폐 풀 준비금 불변식 | invariant_holds=true |

## 3. 제3자가 공개 체인에서 읽을 수 있는 것

| 단계 | 메시지 | 읽히는 값 | 값이 아닌 필드(암호문, 증명, 커밋먼트 등) |
| --- | --- | --- | --- |
| 구매 기업 예치 12 | MsgDeposit | creator=`clair1xydp9gser0a7wqasvx0alecz72l8vflpl78cdj`, amount=`12uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 예치 8 | MsgDeposit | creator=`clair1xydp9gser0a7wqasvx0alecz72l8vflpl78cdj`, amount=`8uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 예치 15 | MsgDeposit | creator=`clair1xydp9gser0a7wqasvx0alecz72l8vflpl78cdj`, amount=`15uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 0 노트 예치 | MsgDeposit | creator=`clair1xydp9gser0a7wqasvx0alecz72l8vflpl78cdj`, amount=`0uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 0 노트 예치 | MsgDeposit | creator=`clair1xydp9gser0a7wqasvx0alecz72l8vflpl78cdj`, amount=`0uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 0 노트 예치 | MsgDeposit | creator=`clair1xydp9gser0a7wqasvx0alecz72l8vflpl78cdj`, amount=`0uclair` | note_commitment, encrypted_note, proof |
| 협력사 A 지급: 송장 12, 8 일괄 전송 | MsgTransfer | creator=`clair1xydp9gser0a7wqasvx0alecz72l8vflpl78cdj` | proof, root, nullifiers, new_commitments, cipher_texts, user_privacy_policy, user_disclosure_digest, user_disclosure_mode, user_disclosure_target_pubkey, user_disclosure_payload, audit_disclosure_digest, audit_disclosure_target_pubkey, audit_disclosure_payload, self_view_disclosure_digest, self_view_disclosure_payload, view_tags, expires_at_unix |
| 협력사 A 지급: 송장 12, 8 일괄 전송 | MsgTransfer | creator=`clair1xydp9gser0a7wqasvx0alecz72l8vflpl78cdj` | proof, root, nullifiers, new_commitments, cipher_texts, user_privacy_policy, user_disclosure_digest, user_disclosure_mode, user_disclosure_target_pubkey, user_disclosure_payload, audit_disclosure_digest, audit_disclosure_target_pubkey, audit_disclosure_payload, self_view_disclosure_digest, self_view_disclosure_payload, view_tags, expires_at_unix |
| 협력사 B 지급: 송장 15, 수신자 암호화 disclosure | MsgTransfer | creator=`clair1xydp9gser0a7wqasvx0alecz72l8vflpl78cdj` | proof, root, nullifiers, new_commitments, cipher_texts, user_privacy_policy, user_disclosure_digest, user_disclosure_mode, user_disclosure_target_pubkey, user_disclosure_payload, audit_disclosure_digest, audit_disclosure_target_pubkey, audit_disclosure_payload, self_view_disclosure_digest, self_view_disclosure_payload, view_tags, expires_at_unix |
| 구매 기업 0 노트 예치, 인출과 같은 블록 | MsgDeposit | creator=`clair1xydp9gser0a7wqasvx0alecz72l8vflpl78cdj`, amount=`0uclair` | note_commitment, encrypted_note, proof |
| 협력사 A 인출 12, 0 노트 예치와 같은 블록 | MsgWithdraw | creator=`clair17zuh0zd0x5y0xcusgx86ghdk3yt7agnt6jqlc5`, amount=`12uclair`, recipient=`clair17zuh0zd0x5y0xcusgx86ghdk3yt7agnt6jqlc5` | proof, root, nullifier, chain_id, expires_at_unix |

## 4. 기록에서 바로 읽히는 사실

- 인출을 단독으로 보낸 tx는 높이 10에서 실패했습니다(code 1). 0 노트 예치와 같은 블록(높이 11)에 넣은 인출은 높이 11에서 성공했습니다.
- 예치 금액([8, 12, 15])과 협력사 A의 인출 금액(12)은 모두 공개됩니다. 인출 금액이 예치 금액 가운데 하나와 같아, 두 거래를 금액으로 이을 수 있습니다.
- 협력사 A 일괄 지급 tx에는 MsgTransfer가 2개 들어 있어 송장 건수가 공개됩니다.
- 지급 tx(MsgTransfer)에는 amount와 recipient 필드가 없습니다. 보낸 계정(creator)은 공개됩니다.
