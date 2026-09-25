# 비공개 공급업체 정산 로컬 실행 기록 · 20260925T195750Z

> 증거 라벨: `[Local]`. Clairveil 로컬 체인에서 실행한 기록입니다. Maroo 테스트넷에서 실행한 기록은 같은 트랙의 `evidence/live/`에 있습니다.
> 실행 환경: Clairveil `ca85b02708fdd75259d4d2ee2d671c21198cec69`(v0.4.0), chain-id `vendor-settlement-local-1`, Go 1.27.1 linux/amd64
> 재현 명령: `pnpm b:step 3`. 명령마다 받은 원본 JSON은 실행 폴더 `.work/vendor-<시각>/out/`에 남고, 레포에는 올리지 않습니다.
> 금액은 로컬 체인 자산 `uclair`의 정수 단위입니다.

## 1. 단계별 tx

| 단계 | tx | 높이 | 결과 | gas_used |
| --- | --- | --- | --- | --- |
| 구매 기업 예치 12 | `9A249362689303BEA9F820AB699BAC45998D8F46893B1AA88DCB9BC28BBAAE3E` | 2 | 성공 | 1283923 |
| 구매 기업 예치 8 | `7AAA7101D675A90266A79FED63BE09B2CD33046AB40262E738E44ED1C31F5E40` | 3 | 성공 | 1281548 |
| 구매 기업 예치 15 | `D890432769027F2F64C096793EC49DABA10D5C3C9881D7A3A611FA7B5893BE20` | 4 | 성공 | 1281558 |
| 구매 기업 0 노트 예치 | `7E777D8D501402B9F1604298F1940A90590CC69A2AEA5E1313DE77B7B73A6B0F` | 5 | 성공 | 1271486 |
| 구매 기업 0 노트 예치 | `CA9CF80346E77E0B20551E46EB2A096300F79D8F8B22CB11ED258F2FCAC2BFAB` | 6 | 성공 | 1267234 |
| 구매 기업 0 노트 예치 | `58FD5EC1229BC63ABF08A15A0F92425484B246574C66D5629098303D0C49B2E5` | 7 | 성공 | 1271486 |
| 협력사 A 지급: 송장 12, 8 일괄 전송 | `C0F275D584572BF3731772D16B85A15BA2BD311459FC91E81F45A4E2C98BD63C` | 8 | 성공 | 3189165 |
| 협력사 B 지급: 송장 15, 수신자 암호화 disclosure | `1F555029CF0C9A461122C358FA0B8C9486506043A81901A8E9F189821068307F` | 9 | 성공 | 1669635 |
| 협력사 A 인출 12, 단독으로 보냄 | `B0D73A3AB88C766BD1FE7F4B63D7C18FCCDEAC0F02AE02C3E9A9CCE9C841BD9E` | 10 | 실패 code 1: `failed to execute message; message index: 0: failed to index withdraw privacy event: record privacy merkle root snapshot: merkle root snapshot re-registration is inconsistent` | 1091081 |
| 구매 기업 0 노트 예치, 인출과 같은 블록 | `81E1B70C25CD9AD843C16402D9176186BEA1B3B5133CC452A99740C4E457A88A` | 11 | 성공 | 1271486 |
| 협력사 A 인출 12, 0 노트 예치와 같은 블록 | `BA4FF1EA31ABA784FBE332C4353244A79EC5E8794CC8CB72A9AB2836EA9520BE` | 11 | 성공 | 1091482 |

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
| 구매 기업 예치 12 | MsgDeposit | creator=`clair1zvqzcnqz3ps77j4alrdnmaqjdz63nv3rhrrkq6`, amount=`12uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 예치 8 | MsgDeposit | creator=`clair1zvqzcnqz3ps77j4alrdnmaqjdz63nv3rhrrkq6`, amount=`8uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 예치 15 | MsgDeposit | creator=`clair1zvqzcnqz3ps77j4alrdnmaqjdz63nv3rhrrkq6`, amount=`15uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 0 노트 예치 | MsgDeposit | creator=`clair1zvqzcnqz3ps77j4alrdnmaqjdz63nv3rhrrkq6`, amount=`0uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 0 노트 예치 | MsgDeposit | creator=`clair1zvqzcnqz3ps77j4alrdnmaqjdz63nv3rhrrkq6`, amount=`0uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 0 노트 예치 | MsgDeposit | creator=`clair1zvqzcnqz3ps77j4alrdnmaqjdz63nv3rhrrkq6`, amount=`0uclair` | note_commitment, encrypted_note, proof |
| 협력사 A 지급: 송장 12, 8 일괄 전송 | MsgTransfer | creator=`clair1zvqzcnqz3ps77j4alrdnmaqjdz63nv3rhrrkq6` | proof, root, nullifiers, new_commitments, cipher_texts, user_privacy_policy, user_disclosure_digest, user_disclosure_mode, user_disclosure_target_pubkey, user_disclosure_payload, audit_disclosure_digest, audit_disclosure_target_pubkey, audit_disclosure_payload, self_view_disclosure_digest, self_view_disclosure_payload, view_tags, expires_at_unix |
| 협력사 A 지급: 송장 12, 8 일괄 전송 | MsgTransfer | creator=`clair1zvqzcnqz3ps77j4alrdnmaqjdz63nv3rhrrkq6` | proof, root, nullifiers, new_commitments, cipher_texts, user_privacy_policy, user_disclosure_digest, user_disclosure_mode, user_disclosure_target_pubkey, user_disclosure_payload, audit_disclosure_digest, audit_disclosure_target_pubkey, audit_disclosure_payload, self_view_disclosure_digest, self_view_disclosure_payload, view_tags, expires_at_unix |
| 협력사 B 지급: 송장 15, 수신자 암호화 disclosure | MsgTransfer | creator=`clair1zvqzcnqz3ps77j4alrdnmaqjdz63nv3rhrrkq6` | proof, root, nullifiers, new_commitments, cipher_texts, user_privacy_policy, user_disclosure_digest, user_disclosure_mode, user_disclosure_target_pubkey, user_disclosure_payload, audit_disclosure_digest, audit_disclosure_target_pubkey, audit_disclosure_payload, self_view_disclosure_digest, self_view_disclosure_payload, view_tags, expires_at_unix |
| 구매 기업 0 노트 예치, 인출과 같은 블록 | MsgDeposit | creator=`clair1zvqzcnqz3ps77j4alrdnmaqjdz63nv3rhrrkq6`, amount=`0uclair` | note_commitment, encrypted_note, proof |
| 협력사 A 인출 12, 0 노트 예치와 같은 블록 | MsgWithdraw | creator=`clair1f8adxh2ef2w4yvp2p5h59rqh8434ta9z8577gn`, amount=`12uclair`, recipient=`clair1f8adxh2ef2w4yvp2p5h59rqh8434ta9z8577gn` | proof, root, nullifier, chain_id, expires_at_unix |

## 4. 기록에서 바로 읽히는 사실

- 인출을 단독으로 보낸 tx는 높이 10에서 실패했습니다(code 1). 0 노트 예치와 같은 블록(높이 11)에 넣은 인출은 높이 11에서 성공했습니다.
- 예치 금액([8, 12, 15])과 협력사 A의 인출 금액(12)은 모두 공개됩니다. 인출 금액이 예치 금액 가운데 하나와 같아, 두 거래를 금액으로 이을 수 있습니다.
- 협력사 A 일괄 지급 tx에는 MsgTransfer가 2개 들어 있어 송장 건수가 공개됩니다.
- 지급 tx(MsgTransfer)에는 amount와 recipient 필드가 없습니다. 보낸 계정(creator)은 공개됩니다.
