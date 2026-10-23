# 비공개 공급업체 정산 로컬 실행 기록 · 20261023T055418Z

> 증거 라벨: `[Local]`. Clairveil 로컬 체인에서 실행한 기록입니다. Maroo 테스트넷에서 실행한 기록은 같은 트랙의 `evidence/live/`에 있습니다.
> 실행 환경: Clairveil `ca85b02708fdd75259d4d2ee2d671c21198cec69`(v0.4.0), chain-id `vendor-settlement-local-1`, Go 1.27.1 linux/amd64
> 재현 명령: `pnpm a:local --operator`. 명령마다 받은 원본 JSON은 실행 폴더 `.work/vendor-<시각>/out/`에 남고, 레포에는 올리지 않습니다.
> 금액은 로컬 체인 자산 `uclair`의 정수 단위입니다.

## 1. 단계별 tx

실행한 순서대로 tx 하나가 한 줄입니다. 결과 칸은 체인이 돌려준 code이고, 실패면 raw_log 앞부분을 붙였습니다.

| 단계 | tx | 높이 | 결과 | gas_used |
| --- | --- | --- | --- | --- |
| 구매 기업 예치 12 | `219D62C3A2A759E5B6F52BC527ED6899C29B1137046D8AE508D352D6EE29084C` | 2 | 성공 | 1283923 |
| 구매 기업 예치 8 | `5B41B3D58818B486DDF2FA19153EC3E28330737F2D9F47A123F8B889FE7902C8` | 3 | 성공 | 1281548 |
| 구매 기업 예치 15 | `A2FF3BAD164F305E278C0E3E3F0609779F51FD8337DFFB85C4925D3EA72DAF09` | 4 | 성공 | 1281558 |
| 구매 기업 0 노트 예치 | `BBFBD070F7A45A3D8CDD06BBE02A768ECCB1F139DCE3BC029CF98C06C6100B40` | 5 | 성공 | 1271486 |
| 구매 기업 0 노트 예치 | `8E6BB23BDE2C5A420603197A9C35794E16BDC6C92FEA6D8E7F82B6025AFF2CDD` | 6 | 성공 | 1267234 |
| 구매 기업 0 노트 예치 | `F09BEAA39D6FFCC4BDEA5C3960DCA22E3C88634FDCD3C009F10D61065853749F` | 7 | 성공 | 1271486 |
| 협력사 A 지급: 송장 12, 8 일괄 전송 | `815055DFA009EFF3495288716D103C590A62A71B0ACEBC181E5C65EB0632687A` | 8 | 성공 | 3189165 |
| 협력사 B 지급: 송장 15, 수신자 암호화 disclosure | `45533F99361C1F7F7E7FD5EC2E70D777E1EB1BC96C6DBD2E028771FF98CC1308` | 9 | 성공 | 1669635 |
| 협력사 A 단독 인출 12 | `680271C441185A4AA0DDDAB9BDCBD63192A57498F1240EB2FA20B530D48E8FA6` | 10 | 실패 code 1: `failed to execute message; message index: 0: failed to index withdraw privacy event: record privacy merkle root snapshot: merkle root snapshot re-registration is inconsistent` | 1091081 |
| 구매 기업 0 노트 예치, 인출과 같은 블록 | `90DE77DD5D876E81ECAE31DABEC035DC4B13D30441C582777A5DABC7531BF923` | 11 | 성공 | 1271486 |
| 협력사 A 인출 12, 0 노트 예치와 같은 블록 | `A60455D647933DEACB29AFC57323FA8A83078E5E53C781DBB02FF490381D24C7` | 11 | 성공 | 1091482 |

## 2. 역할마다 자기 키로 본 것

역할마다 자기 키로 노트를 스캔하거나 disclosure를 풀어 얻은 값입니다. 누가 칸의 역할이 무엇을 칸의 대상을 열었고, 결과 칸은 CLI가 돌려준 값입니다.

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

성공한 tx의 본문에서 키 없이 읽히는 필드입니다. 읽히는 값 칸은 값이 그대로 보이는 필드이고, 오른쪽 칸은 이름만 보이고 값은 암호문이나 증명인 필드입니다.

| 단계 | 메시지 | 읽히는 값 | 값이 아닌 필드(암호문, 증명, 커밋먼트 등) |
| --- | --- | --- | --- |
| 구매 기업 예치 12 | MsgDeposit | creator=`clair1duel0e5hfjrqpxctc2y479pya5t06llp6dw7wp`, amount=`12uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 예치 8 | MsgDeposit | creator=`clair1duel0e5hfjrqpxctc2y479pya5t06llp6dw7wp`, amount=`8uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 예치 15 | MsgDeposit | creator=`clair1duel0e5hfjrqpxctc2y479pya5t06llp6dw7wp`, amount=`15uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 0 노트 예치 | MsgDeposit | creator=`clair1duel0e5hfjrqpxctc2y479pya5t06llp6dw7wp`, amount=`0uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 0 노트 예치 | MsgDeposit | creator=`clair1duel0e5hfjrqpxctc2y479pya5t06llp6dw7wp`, amount=`0uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 0 노트 예치 | MsgDeposit | creator=`clair1duel0e5hfjrqpxctc2y479pya5t06llp6dw7wp`, amount=`0uclair` | note_commitment, encrypted_note, proof |
| 협력사 A 지급: 송장 12, 8 일괄 전송 | MsgTransfer | creator=`clair1duel0e5hfjrqpxctc2y479pya5t06llp6dw7wp` | proof, root, nullifiers, new_commitments, cipher_texts, user_privacy_policy, user_disclosure_digest, user_disclosure_mode, user_disclosure_target_pubkey, user_disclosure_payload, audit_disclosure_digest, audit_disclosure_target_pubkey, audit_disclosure_payload, self_view_disclosure_digest, self_view_disclosure_payload, view_tags, expires_at_unix |
| 협력사 A 지급: 송장 12, 8 일괄 전송 | MsgTransfer | creator=`clair1duel0e5hfjrqpxctc2y479pya5t06llp6dw7wp` | proof, root, nullifiers, new_commitments, cipher_texts, user_privacy_policy, user_disclosure_digest, user_disclosure_mode, user_disclosure_target_pubkey, user_disclosure_payload, audit_disclosure_digest, audit_disclosure_target_pubkey, audit_disclosure_payload, self_view_disclosure_digest, self_view_disclosure_payload, view_tags, expires_at_unix |
| 협력사 B 지급: 송장 15, 수신자 암호화 disclosure | MsgTransfer | creator=`clair1duel0e5hfjrqpxctc2y479pya5t06llp6dw7wp` | proof, root, nullifiers, new_commitments, cipher_texts, user_privacy_policy, user_disclosure_digest, user_disclosure_mode, user_disclosure_target_pubkey, user_disclosure_payload, audit_disclosure_digest, audit_disclosure_target_pubkey, audit_disclosure_payload, self_view_disclosure_digest, self_view_disclosure_payload, view_tags, expires_at_unix |
| 구매 기업 0 노트 예치, 인출과 같은 블록 | MsgDeposit | creator=`clair1duel0e5hfjrqpxctc2y479pya5t06llp6dw7wp`, amount=`0uclair` | note_commitment, encrypted_note, proof |
| 협력사 A 인출 12, 0 노트 예치와 같은 블록 | MsgWithdraw | creator=`clair1qd3kdm0su4h2pdfmvkryj2mhcjcnumj52r9mtq`, amount=`12uclair`, recipient=`clair1qd3kdm0su4h2pdfmvkryj2mhcjcnumj52r9mtq` | proof, root, nullifier, chain_id, expires_at_unix |

## 4. 기록에서 바로 읽히는 사실

- 인출을 단독으로 보낸 tx는 높이 10에서 실패했습니다(code 1). 0 노트 예치와 같은 블록(높이 11)에 넣은 인출은 높이 11에서 성공했습니다.
- 예치 금액([8, 12, 15])과 협력사 A의 인출 금액(12)은 모두 공개됩니다. 인출 금액이 예치 금액 가운데 하나와 같아, 두 거래를 금액으로 이을 수 있습니다.
- 협력사 A 일괄 지급 tx에는 MsgTransfer가 2개 들어 있어 송장 건수가 공개됩니다.
- 지급 tx(MsgTransfer)에는 amount와 recipient 필드가 없습니다. 보낸 계정(creator)은 공개됩니다.

## 6. 운영자 시야(선택 단계)

`--operator`로 실행했을 때만 붙는 절입니다. 구매 기업이 지급 세 건의 사용자 공개를 금액만 담아 정산 대행사의 공개키로 암호화했습니다. 대행사는 자기 지급 지시서로 협력사를 붙여 협력사별 합계를 내고, 감사인이 같은 지급의 감사 공개에서 푼 건별 금액의 합과 견줍니다.

| 지시서 송장 | 지급 tx | 정산 대행사가 자기 키로 푼 사용자 공개 | 감사인이 푼 감사 공개 |
| --- | --- | --- | --- |
| A-3 | `5A5B30C19A…` 메시지 0 | recipient-encrypted, 필드 [amount], 금액 4, 체인의 사용자 공개 해시와 같습니다 | 금액 4, 받는 주소 `clairs1rlanrvghm…` |
| A-4 | `5A5B30C19A…` 메시지 1 | recipient-encrypted, 필드 [amount], 금액 6, 체인의 사용자 공개 해시와 같습니다 | 금액 6, 받는 주소 `clairs1rlanrvghm…` |
| B-2 | `067BEFBDE7…` 메시지 0 | recipient-encrypted, 필드 [amount], 금액 5, 체인의 사용자 공개 해시와 같습니다 | 금액 5, 받는 주소 `clairs1zdjp3m5v8…` |

협력사별 합계를 두 시야에서 견준 결과입니다.

| 협력사 | 정산 대행사 합계 | 감사인 합계 | 두 합계 |
| --- | --- | --- | --- |
| 협력사 A | 10 | 10 | 같습니다 |
| 협력사 B | 5 | 5 | 같습니다 |

- 정산 대행사가 푼 공개에는 금액 필드만 있었고, 지시서 금액과 모두 같았습니다.
- 정산 대행사는 공개에서 받는 협력사와 보낸 계정을 읽지 못합니다. 협력사 칸은 대행사의 지급 지시서에서 왔습니다.
