# 비공개 공급업체 정산 로컬 실행 기록 · 20261023T081756Z

> 증거 라벨: `[Local]`. Clairveil 로컬 체인에서 실행한 기록입니다. Maroo 테스트넷에서 실행한 기록은 같은 트랙의 `evidence/live/`에 있습니다.
> 실행 환경: Clairveil `ca85b02708fdd75259d4d2ee2d671c21198cec69`(v0.4.0), chain-id `vendor-settlement-local-1`, Go 1.27.1 linux/amd64
> 재현 명령: `pnpm b:step 3`. 명령마다 받은 원본 JSON은 실행 폴더 `.work/vendor-<시각>/out/`에 남고, 레포에는 올리지 않습니다.
> 실행 시간: 60초(로컬 체인을 띄운 때부터 기록을 정리할 때까지, 미리 빌드한 바이너리 사용)
> 금액은 로컬 체인 자산 `uclair`의 정수 단위입니다.

## 1. 단계별 tx

실행한 순서대로 tx 하나가 한 줄입니다. 결과 칸은 체인이 돌려준 code이고, 실패면 raw_log 앞부분을 붙였습니다.

| 단계 | tx | 높이 | 결과 | gas_used |
| --- | --- | --- | --- | --- |
| 구매 기업 예치 12 | `9DDE2FA978848F79751EB725955F879BC8959B839AF2CBB8D74B7A3691765A21` | 2 | 성공 | 1283923 |
| 구매 기업 예치 8 | `750E5BA7BD82EFC614B74CA1BE5A1B376EF43DA714880B6E9E6DF116BA545FA5` | 3 | 성공 | 1281548 |
| 구매 기업 예치 15 | `DC835A6824A54D6AD9C340B774273C86BED7A7C6E9ECE2DF73D106F80DB989DB` | 4 | 성공 | 1281558 |
| 구매 기업 0 노트 예치 | `A631CB1824DFB34CA2B16C99B71E96B52F676DEF09EFCF9F07B3866793E3A958` | 5 | 성공 | 1271486 |
| 구매 기업 0 노트 예치 | `FBC25B2BBF4F964BF1FAAEC53862CFA7D6B22947918700021BE2AA49CEEB5906` | 6 | 성공 | 1267234 |
| 구매 기업 0 노트 예치 | `755BA007797F95808435C033241B7DF5D20799613C47A7D932B6F9F8D4B76581` | 7 | 성공 | 1271486 |
| 협력사 A 지급: 송장 12, 8 일괄 전송 | `C02E99056A10846622F6BC821A222432C821BF90A359E79772818AFCEA039274` | 8 | 성공 | 3189165 |
| 협력사 B 지급: 송장 15, 수신자 암호화 disclosure | `3F9E2E2F84B1FA14FE35A94DC70C13B9D0F7C38199AE2A508F25886182749381` | 9 | 성공 | 1669635 |
| 협력사 A 단독 인출 12 | `6C22BE8E4E1F74847A125CF027940960AF4A3FCD3C2DB3CC55E119FEF2FD2530` | 10 | 실패 code 1: `failed to execute message; message index: 0: failed to index withdraw privacy event: record privacy merkle root snapshot: merkle root snapshot re-registration is inconsistent` | 1091081 |
| 구매 기업 0 노트 예치, 인출과 같은 블록 | `64B289EACB58FD21AB9C9D429479E84EE6CDA656E72039B0D506F1D0C51FCD93` | 11 | 성공 | 1271486 |
| 협력사 A 인출 12, 0 노트 예치와 같은 블록 | `34F8439AB2A5E1940F40A60297A2B47570CE9992244312A7D511C1BE7905F236` | 11 | 성공 | 1091482 |

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
| 구매 기업 예치 12 | MsgDeposit | creator=`clair1sjy93ummvr3fnxdfvew8zy08efqnprl3c2jqxg`, amount=`12uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 예치 8 | MsgDeposit | creator=`clair1sjy93ummvr3fnxdfvew8zy08efqnprl3c2jqxg`, amount=`8uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 예치 15 | MsgDeposit | creator=`clair1sjy93ummvr3fnxdfvew8zy08efqnprl3c2jqxg`, amount=`15uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 0 노트 예치 | MsgDeposit | creator=`clair1sjy93ummvr3fnxdfvew8zy08efqnprl3c2jqxg`, amount=`0uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 0 노트 예치 | MsgDeposit | creator=`clair1sjy93ummvr3fnxdfvew8zy08efqnprl3c2jqxg`, amount=`0uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 0 노트 예치 | MsgDeposit | creator=`clair1sjy93ummvr3fnxdfvew8zy08efqnprl3c2jqxg`, amount=`0uclair` | note_commitment, encrypted_note, proof |
| 협력사 A 지급: 송장 12, 8 일괄 전송 | MsgTransfer | creator=`clair1sjy93ummvr3fnxdfvew8zy08efqnprl3c2jqxg` | proof, root, nullifiers, new_commitments, cipher_texts, user_privacy_policy, user_disclosure_digest, user_disclosure_mode, user_disclosure_target_pubkey, user_disclosure_payload, audit_disclosure_digest, audit_disclosure_target_pubkey, audit_disclosure_payload, self_view_disclosure_digest, self_view_disclosure_payload, view_tags, expires_at_unix |
| 협력사 A 지급: 송장 12, 8 일괄 전송 | MsgTransfer | creator=`clair1sjy93ummvr3fnxdfvew8zy08efqnprl3c2jqxg` | proof, root, nullifiers, new_commitments, cipher_texts, user_privacy_policy, user_disclosure_digest, user_disclosure_mode, user_disclosure_target_pubkey, user_disclosure_payload, audit_disclosure_digest, audit_disclosure_target_pubkey, audit_disclosure_payload, self_view_disclosure_digest, self_view_disclosure_payload, view_tags, expires_at_unix |
| 협력사 B 지급: 송장 15, 수신자 암호화 disclosure | MsgTransfer | creator=`clair1sjy93ummvr3fnxdfvew8zy08efqnprl3c2jqxg` | proof, root, nullifiers, new_commitments, cipher_texts, user_privacy_policy, user_disclosure_digest, user_disclosure_mode, user_disclosure_target_pubkey, user_disclosure_payload, audit_disclosure_digest, audit_disclosure_target_pubkey, audit_disclosure_payload, self_view_disclosure_digest, self_view_disclosure_payload, view_tags, expires_at_unix |
| 구매 기업 0 노트 예치, 인출과 같은 블록 | MsgDeposit | creator=`clair1sjy93ummvr3fnxdfvew8zy08efqnprl3c2jqxg`, amount=`0uclair` | note_commitment, encrypted_note, proof |
| 협력사 A 인출 12, 0 노트 예치와 같은 블록 | MsgWithdraw | creator=`clair1e7y3w5sy7mj6znnxq8jrvwla09g580lvs3jasg`, amount=`12uclair`, recipient=`clair1e7y3w5sy7mj6znnxq8jrvwla09g580lvs3jasg` | proof, root, nullifier, chain_id, expires_at_unix |

## 4. 기록에서 바로 읽히는 사실

- 인출을 단독으로 보낸 tx는 높이 10에서 실패했습니다(code 1). 0 노트 예치와 같은 블록(높이 11)에 넣은 인출은 높이 11에서 성공했습니다.
- 예치 금액([8, 12, 15])과 협력사 A의 인출 금액(12)은 모두 공개됩니다. 인출 금액이 예치 금액 가운데 하나와 같아, 두 거래를 금액으로 이을 수 있습니다.
- 협력사 A 일괄 지급 tx에는 MsgTransfer가 2개 들어 있어 송장 건수가 공개됩니다.
- 지급 tx(MsgTransfer)에는 amount와 recipient 필드가 없습니다. 보낸 계정(creator)은 공개됩니다.
