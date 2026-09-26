# 비공개 공급업체 정산 로컬 실행 기록 · 20260926T041658Z

> 증거 라벨: `[Local]`. Clairveil 로컬 체인에서 실행한 기록입니다. Maroo 테스트넷에서 실행한 기록은 같은 트랙의 `evidence/live/`에 있습니다.
> 실행 환경: Clairveil `ca85b02708fdd75259d4d2ee2d671c21198cec69`(v0.4.0), chain-id `vendor-settlement-local-1`, Go 1.27.1 linux/amd64
> 재현 명령: `pnpm a:local --extras`. 명령마다 받은 원본 JSON은 실행 폴더 `.work/vendor-<시각>/out/`에 남고, 레포에는 올리지 않습니다.
> 금액은 로컬 체인 자산 `uclair`의 정수 단위입니다.

## 1. 단계별 tx

| 단계 | tx | 높이 | 결과 | gas_used |
| --- | --- | --- | --- | --- |
| 구매 기업 예치 12 | `CDEDDF23D7928F194D24E47FC1ECEA01DF49A501010B99CEF17AA1338A35FCD4` | 2 | 성공 | 1283923 |
| 구매 기업 예치 8 | `3BCBDA8F7C82FB2E2616BF1F752D723C21DACDB7254E9774647F20B5537E5C97` | 3 | 성공 | 1281548 |
| 구매 기업 예치 15 | `3D8F13658735D0CA35C080066A2945DD3560535BFE3DA2ED8AD63E4FE8D85A1B` | 4 | 성공 | 1281558 |
| 구매 기업 0 노트 예치 | `18CBD27F9A6F548EEFB7BD2FFFA119AAC5F8E8C328C361CDE2A849A799D4F040` | 5 | 성공 | 1271486 |
| 구매 기업 0 노트 예치 | `28A473DAF8D69D0E03C4C3EC886514E1F42368B4E8215A190AD349FEAE61233A` | 6 | 성공 | 1267234 |
| 구매 기업 0 노트 예치 | `FA7AAF977FE577D292598A420E1834FC6ECF8DF277078A699DF3CDF8750EB3A1` | 7 | 성공 | 1271486 |
| 협력사 A 지급: 송장 12, 8 일괄 전송 | `45CFD39B40C333C81D9FB0AB026F0308C12EFBD6DA4D5330F381793CBA29D942` | 8 | 성공 | 3189165 |
| 협력사 B 지급: 송장 15, 수신자 암호화 disclosure | `36C936270B358CB6C573206792121E4AB2A5ED4D9B312BACBCD19BAA2B500CBE` | 9 | 성공 | 1669635 |
| 협력사 A 인출 12, 단독으로 보냄 | `B4D45CBAD6A4AC0F8DFC0DB8E3FB86E077AB7F44B5562CC7BC3286D06438946A` | 10 | 실패 code 1: `failed to execute message; message index: 0: failed to index withdraw privacy event: record privacy merkle root snapshot: merkle root snapshot re-registration is inconsistent` | 1091081 |
| 구매 기업 0 노트 예치, 인출과 같은 블록 | `00D718BA44DCA991504D413CDAB2B65085FF603F39D686EEE99EC0B508E4E973` | 11 | 성공 | 1271486 |
| 협력사 A 인출 12, 0 노트 예치와 같은 블록 | `3B2EB48FE77B38814DA830DDCA697F671081FADE5FEE97C7CAD0BAD9A9BB8A72` | 11 | 성공 | 1091482 |

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
| 구매 기업 예치 12 | MsgDeposit | creator=`clair159pstpqp3swh6hpst3hwhnyu43tnsm4ux7wt73`, amount=`12uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 예치 8 | MsgDeposit | creator=`clair159pstpqp3swh6hpst3hwhnyu43tnsm4ux7wt73`, amount=`8uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 예치 15 | MsgDeposit | creator=`clair159pstpqp3swh6hpst3hwhnyu43tnsm4ux7wt73`, amount=`15uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 0 노트 예치 | MsgDeposit | creator=`clair159pstpqp3swh6hpst3hwhnyu43tnsm4ux7wt73`, amount=`0uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 0 노트 예치 | MsgDeposit | creator=`clair159pstpqp3swh6hpst3hwhnyu43tnsm4ux7wt73`, amount=`0uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 0 노트 예치 | MsgDeposit | creator=`clair159pstpqp3swh6hpst3hwhnyu43tnsm4ux7wt73`, amount=`0uclair` | note_commitment, encrypted_note, proof |
| 협력사 A 지급: 송장 12, 8 일괄 전송 | MsgTransfer | creator=`clair159pstpqp3swh6hpst3hwhnyu43tnsm4ux7wt73` | proof, root, nullifiers, new_commitments, cipher_texts, user_privacy_policy, user_disclosure_digest, user_disclosure_mode, user_disclosure_target_pubkey, user_disclosure_payload, audit_disclosure_digest, audit_disclosure_target_pubkey, audit_disclosure_payload, self_view_disclosure_digest, self_view_disclosure_payload, view_tags, expires_at_unix |
| 협력사 A 지급: 송장 12, 8 일괄 전송 | MsgTransfer | creator=`clair159pstpqp3swh6hpst3hwhnyu43tnsm4ux7wt73` | proof, root, nullifiers, new_commitments, cipher_texts, user_privacy_policy, user_disclosure_digest, user_disclosure_mode, user_disclosure_target_pubkey, user_disclosure_payload, audit_disclosure_digest, audit_disclosure_target_pubkey, audit_disclosure_payload, self_view_disclosure_digest, self_view_disclosure_payload, view_tags, expires_at_unix |
| 협력사 B 지급: 송장 15, 수신자 암호화 disclosure | MsgTransfer | creator=`clair159pstpqp3swh6hpst3hwhnyu43tnsm4ux7wt73` | proof, root, nullifiers, new_commitments, cipher_texts, user_privacy_policy, user_disclosure_digest, user_disclosure_mode, user_disclosure_target_pubkey, user_disclosure_payload, audit_disclosure_digest, audit_disclosure_target_pubkey, audit_disclosure_payload, self_view_disclosure_digest, self_view_disclosure_payload, view_tags, expires_at_unix |
| 구매 기업 0 노트 예치, 인출과 같은 블록 | MsgDeposit | creator=`clair159pstpqp3swh6hpst3hwhnyu43tnsm4ux7wt73`, amount=`0uclair` | note_commitment, encrypted_note, proof |
| 협력사 A 인출 12, 0 노트 예치와 같은 블록 | MsgWithdraw | creator=`clair1clag3wud8w4zy89nzaw4mlnfw5w74nqaysh46n`, amount=`12uclair`, recipient=`clair1clag3wud8w4zy89nzaw4mlnfw5w74nqaysh46n` | proof, root, nullifier, chain_id, expires_at_unix |

## 4. 기록에서 바로 읽히는 사실

- 인출을 단독으로 보낸 tx는 높이 10에서 실패했습니다(code 1). 0 노트 예치와 같은 블록(높이 11)에 넣은 인출은 높이 11에서 성공했습니다.
- 예치 금액([8, 12, 15])과 협력사 A의 인출 금액(12)은 모두 공개됩니다. 인출 금액이 예치 금액 가운데 하나와 같아, 두 거래를 금액으로 이을 수 있습니다.
- 협력사 A 일괄 지급 tx에는 MsgTransfer가 2개 들어 있어 송장 건수가 공개됩니다.
- 지급 tx(MsgTransfer)에는 amount와 recipient 필드가 없습니다. 보낸 계정(creator)은 공개됩니다.

## 5. 참조 구현의 대량 지급 기능(선택 단계)

| 단계 | tx | 높이 | 결과 | gas_used |
| --- | --- | --- | --- | --- |
| 구매 기업 예치 30 | `A3CCD559740E28B57CEE869D9404DAD97333264D8A2568DB32C0AAF6C2C191ED` | 12 | 성공 | 1290062 |
| 증명 하나짜리 일괄 지급: A 5, B 7, A 3 (출력 32칸 고정) | `9049B593A8AAB5446AA5AA730E06E1B6D950333A961CDBF25260812DE5B88E36` | 17 | 성공 | 16149845 |
| 협력사 B 7 대리 인출(중계자 제출, 0 노트 예치와 같은 블록) | `A818AD4CB3129F101D2FFC465853B5392E06B54E997CE01AE55684FBFBCCF1A5` | 18 | 성공 | 1105067 |

| 제3자가 읽는 것 | 값 |
| --- | --- |
| 일괄 지급 tx의 메시지 | 1개, MsgBatchTransfer |
| 일괄 지급의 보낸 계정(creator) | `clair159pstpqp3swh6hpst3hwhnyu43tnsm4ux7wt73` |
| 일괄 지급의 출력 수(outputs) | 32개. 실제 지급은 3건 |
| 일괄 지급의 입력 수(nullifiers) | 1개 |
| 대리 인출의 보낸 계정(creator) | `clair1hjl4z5fd9fezpzgzadcd2jdxgssgdyytruld9r`(중계자) |
| 대리 인출의 받는 주소(recipient)와 금액 | `clair1p5k5p3hdz6yc5z26uh0za8jep0aap0j4hmygvg`(협력사 B), 7uclair |
