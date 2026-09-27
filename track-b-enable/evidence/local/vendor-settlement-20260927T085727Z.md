# 비공개 공급업체 정산 로컬 실행 기록 · 20260927T085727Z

> 증거 라벨: `[Local]`. Clairveil 로컬 체인에서 실행한 기록입니다. Maroo 테스트넷에서 실행한 기록은 같은 트랙의 `evidence/live/`에 있습니다.
> 실행 환경: Clairveil `ca85b02708fdd75259d4d2ee2d671c21198cec69`(v0.4.0), chain-id `vendor-settlement-local-1`, Go 1.27.1 linux/amd64
> 재현 명령: `pnpm b:step 3`. 명령마다 받은 원본 JSON은 실행 폴더 `.work/vendor-<시각>/out/`에 남고, 레포에는 올리지 않습니다.
> 금액은 로컬 체인 자산 `uclair`의 정수 단위입니다.

## 1. 단계별 tx

| 단계 | tx | 높이 | 결과 | gas_used |
| --- | --- | --- | --- | --- |
| 구매 기업 예치 12 | `079FBABBE84776B8169EA809E431900F26634703FD80833400B4D94221024EE8` | 2 | 성공 | 1283923 |
| 구매 기업 예치 8 | `EE5141EB82A1EDF3B63FFE954AFF17EA04E9859C737B28D4FC588240A3BC385F` | 3 | 성공 | 1281548 |
| 구매 기업 예치 15 | `569EEB34E0E989777D5B92D840BD12036CFAD0FE1B01FACA15D713E8CD39A3C4` | 4 | 성공 | 1281558 |
| 구매 기업 0 노트 예치 | `D3BCCF5B1E0C461FCEB42F7665135C1E4E7CEF16197DCAE44A7687EF4E664813` | 5 | 성공 | 1271486 |
| 구매 기업 0 노트 예치 | `5A235D9E7DAFCDFBCFAB5515111AB192F5CB42F796FAED4C8634F6B52F1C0D3D` | 6 | 성공 | 1267234 |
| 구매 기업 0 노트 예치 | `3B4407A6AB075C2A107119E151FF40DAD1770B241117CBD847B000D7FDD37B1D` | 7 | 성공 | 1271486 |
| 협력사 A 지급: 송장 12, 8 일괄 전송 | `AAC5EF7216836EED5B8A39516F74F718EC3813D36B653F97CC8047E574710854` | 8 | 성공 | 3189165 |
| 협력사 B 지급: 송장 15, 수신자 암호화 disclosure | `6E64C5290C80335F45A86986FA714F1B29344A561C612CE2613BA557FD22CC50` | 9 | 성공 | 1669635 |
| 협력사 A 인출 12, 단독으로 보냄 | `DB7E00D6BDDBA82B9B728614416CCFCB86512EB8B226B0F27665EE9DB7B94D65` | 11 | 실패 code 1: `failed to execute message; message index: 0: failed to index withdraw privacy event: record privacy merkle root snapshot: merkle root snapshot re-registration is inconsistent` | 1091081 |
| 구매 기업 0 노트 예치, 인출과 같은 블록 | `A9E750AA1A2A430519D89B8F5B651411B73531989109760BD3A9233E1BCEB3DC` | 12 | 성공 | 1271486 |
| 협력사 A 인출 12, 0 노트 예치와 같은 블록 | `F31FD89BB1D4BBFF1EDBBDD4C2015087DF01580BB369909FCC3F01A3008F749A` | 12 | 성공 | 1091482 |

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
| 구매 기업 예치 12 | MsgDeposit | creator=`clair1jtvc3lsdm00utks42m4zhyweylejzltqcgds6u`, amount=`12uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 예치 8 | MsgDeposit | creator=`clair1jtvc3lsdm00utks42m4zhyweylejzltqcgds6u`, amount=`8uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 예치 15 | MsgDeposit | creator=`clair1jtvc3lsdm00utks42m4zhyweylejzltqcgds6u`, amount=`15uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 0 노트 예치 | MsgDeposit | creator=`clair1jtvc3lsdm00utks42m4zhyweylejzltqcgds6u`, amount=`0uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 0 노트 예치 | MsgDeposit | creator=`clair1jtvc3lsdm00utks42m4zhyweylejzltqcgds6u`, amount=`0uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 0 노트 예치 | MsgDeposit | creator=`clair1jtvc3lsdm00utks42m4zhyweylejzltqcgds6u`, amount=`0uclair` | note_commitment, encrypted_note, proof |
| 협력사 A 지급: 송장 12, 8 일괄 전송 | MsgTransfer | creator=`clair1jtvc3lsdm00utks42m4zhyweylejzltqcgds6u` | proof, root, nullifiers, new_commitments, cipher_texts, user_privacy_policy, user_disclosure_digest, user_disclosure_mode, user_disclosure_target_pubkey, user_disclosure_payload, audit_disclosure_digest, audit_disclosure_target_pubkey, audit_disclosure_payload, self_view_disclosure_digest, self_view_disclosure_payload, view_tags, expires_at_unix |
| 협력사 A 지급: 송장 12, 8 일괄 전송 | MsgTransfer | creator=`clair1jtvc3lsdm00utks42m4zhyweylejzltqcgds6u` | proof, root, nullifiers, new_commitments, cipher_texts, user_privacy_policy, user_disclosure_digest, user_disclosure_mode, user_disclosure_target_pubkey, user_disclosure_payload, audit_disclosure_digest, audit_disclosure_target_pubkey, audit_disclosure_payload, self_view_disclosure_digest, self_view_disclosure_payload, view_tags, expires_at_unix |
| 협력사 B 지급: 송장 15, 수신자 암호화 disclosure | MsgTransfer | creator=`clair1jtvc3lsdm00utks42m4zhyweylejzltqcgds6u` | proof, root, nullifiers, new_commitments, cipher_texts, user_privacy_policy, user_disclosure_digest, user_disclosure_mode, user_disclosure_target_pubkey, user_disclosure_payload, audit_disclosure_digest, audit_disclosure_target_pubkey, audit_disclosure_payload, self_view_disclosure_digest, self_view_disclosure_payload, view_tags, expires_at_unix |
| 구매 기업 0 노트 예치, 인출과 같은 블록 | MsgDeposit | creator=`clair1jtvc3lsdm00utks42m4zhyweylejzltqcgds6u`, amount=`0uclair` | note_commitment, encrypted_note, proof |
| 협력사 A 인출 12, 0 노트 예치와 같은 블록 | MsgWithdraw | creator=`clair1ff9wk9qcr3a0ekqt72tmuq6azrdh0xe5n0545h`, amount=`12uclair`, recipient=`clair1ff9wk9qcr3a0ekqt72tmuq6azrdh0xe5n0545h` | proof, root, nullifier, chain_id, expires_at_unix |

## 4. 기록에서 바로 읽히는 사실

- 인출을 단독으로 보낸 tx는 높이 11에서 실패했습니다(code 1). 0 노트 예치와 같은 블록(높이 12)에 넣은 인출은 높이 12에서 성공했습니다.
- 예치 금액([8, 12, 15])과 협력사 A의 인출 금액(12)은 모두 공개됩니다. 인출 금액이 예치 금액 가운데 하나와 같아, 두 거래를 금액으로 이을 수 있습니다.
- 협력사 A 일괄 지급 tx에는 MsgTransfer가 2개 들어 있어 송장 건수가 공개됩니다.
- 지급 tx(MsgTransfer)에는 amount와 recipient 필드가 없습니다. 보낸 계정(creator)은 공개됩니다.
