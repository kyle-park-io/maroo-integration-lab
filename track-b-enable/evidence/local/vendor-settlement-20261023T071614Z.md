# 비공개 공급업체 정산 로컬 실행 기록 · 20261023T071614Z

> 증거 라벨: `[Local]`. Clairveil 로컬 체인에서 실행한 기록입니다. Maroo 테스트넷에서 실행한 기록은 같은 트랙의 `evidence/live/`에 있습니다.
> 실행 환경: Clairveil `ca85b02708fdd75259d4d2ee2d671c21198cec69`(v0.4.0), chain-id `vendor-settlement-local-1`, Go 1.27.1 linux/amd64
> 재현 명령: `pnpm b:step 3`. 명령마다 받은 원본 JSON은 실행 폴더 `.work/vendor-<시각>/out/`에 남고, 레포에는 올리지 않습니다.
> 금액은 로컬 체인 자산 `uclair`의 정수 단위입니다.

## 1. 단계별 tx

실행한 순서대로 tx 하나가 한 줄입니다. 결과 칸은 체인이 돌려준 code이고, 실패면 raw_log 앞부분을 붙였습니다.

| 단계 | tx | 높이 | 결과 | gas_used |
| --- | --- | --- | --- | --- |
| 구매 기업 예치 12 | `90A90BB04973B173BC2B24AEBB2EEA678819DC7D3FDDD865FAE5035FAE9DA00A` | 2 | 성공 | 1283923 |
| 구매 기업 예치 8 | `0802F327AEB8A6DA84BD42F734A2CF3C2F83E858837DF0FB970DB40BB6AC6A46` | 3 | 성공 | 1281548 |
| 구매 기업 예치 15 | `490E0E88180345327F0BCAA85A96FF7553C39433C0EF9A538483C6C828EE12E0` | 4 | 성공 | 1281558 |
| 구매 기업 0 노트 예치 | `F814C01C209C7C25C8EBD997D14CE9F859E3ED3B2B7F8D99101E8B5F32FE701F` | 5 | 성공 | 1271486 |
| 구매 기업 0 노트 예치 | `416A3A913A70703CBE29AB943AF82E24A4951FFDC80473FFE473F630CCE211E5` | 6 | 성공 | 1267234 |
| 구매 기업 0 노트 예치 | `CDB918C05A11981711C4A88CF348E75B0BB5B88465DA3AF2AEC86E2F24933B2D` | 7 | 성공 | 1271486 |
| 협력사 A 지급: 송장 12, 8 일괄 전송 | `8914D85FEFA5126B32017C1C97CFA74D12A3FB6E75D5B2C1876691545ACA20D9` | 8 | 성공 | 3189165 |
| 협력사 B 지급: 송장 15, 수신자 암호화 disclosure | `79CCC36012A47DAB176B96808FB9EE9E760E189863C4C3FDF934565849385294` | 9 | 성공 | 1669635 |
| 협력사 A 단독 인출 12 | `98EC0978792ED9715DEE1FE3820CE88354D4CAFF883937DCC2C838F2D59D7327` | 10 | 실패 code 1: `failed to execute message; message index: 0: failed to index withdraw privacy event: record privacy merkle root snapshot: merkle root snapshot re-registration is inconsistent` | 1091081 |
| 구매 기업 0 노트 예치, 인출과 같은 블록 | `D1331934C5691ED47F6F264FA7873247FEE259A989C3868F5AFD2834FE0C7D83` | 11 | 성공 | 1271486 |
| 협력사 A 인출 12, 0 노트 예치와 같은 블록 | `06A9592DB4167A333E44ED65D72E1D5A63C267BC8C95CEBC38BC698F9F069F4C` | 11 | 성공 | 1091482 |

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
| 구매 기업 예치 12 | MsgDeposit | creator=`clair193q389jtmw6z43gu56wj69068jemeqaqwmfa0p`, amount=`12uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 예치 8 | MsgDeposit | creator=`clair193q389jtmw6z43gu56wj69068jemeqaqwmfa0p`, amount=`8uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 예치 15 | MsgDeposit | creator=`clair193q389jtmw6z43gu56wj69068jemeqaqwmfa0p`, amount=`15uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 0 노트 예치 | MsgDeposit | creator=`clair193q389jtmw6z43gu56wj69068jemeqaqwmfa0p`, amount=`0uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 0 노트 예치 | MsgDeposit | creator=`clair193q389jtmw6z43gu56wj69068jemeqaqwmfa0p`, amount=`0uclair` | note_commitment, encrypted_note, proof |
| 구매 기업 0 노트 예치 | MsgDeposit | creator=`clair193q389jtmw6z43gu56wj69068jemeqaqwmfa0p`, amount=`0uclair` | note_commitment, encrypted_note, proof |
| 협력사 A 지급: 송장 12, 8 일괄 전송 | MsgTransfer | creator=`clair193q389jtmw6z43gu56wj69068jemeqaqwmfa0p` | proof, root, nullifiers, new_commitments, cipher_texts, user_privacy_policy, user_disclosure_digest, user_disclosure_mode, user_disclosure_target_pubkey, user_disclosure_payload, audit_disclosure_digest, audit_disclosure_target_pubkey, audit_disclosure_payload, self_view_disclosure_digest, self_view_disclosure_payload, view_tags, expires_at_unix |
| 협력사 A 지급: 송장 12, 8 일괄 전송 | MsgTransfer | creator=`clair193q389jtmw6z43gu56wj69068jemeqaqwmfa0p` | proof, root, nullifiers, new_commitments, cipher_texts, user_privacy_policy, user_disclosure_digest, user_disclosure_mode, user_disclosure_target_pubkey, user_disclosure_payload, audit_disclosure_digest, audit_disclosure_target_pubkey, audit_disclosure_payload, self_view_disclosure_digest, self_view_disclosure_payload, view_tags, expires_at_unix |
| 협력사 B 지급: 송장 15, 수신자 암호화 disclosure | MsgTransfer | creator=`clair193q389jtmw6z43gu56wj69068jemeqaqwmfa0p` | proof, root, nullifiers, new_commitments, cipher_texts, user_privacy_policy, user_disclosure_digest, user_disclosure_mode, user_disclosure_target_pubkey, user_disclosure_payload, audit_disclosure_digest, audit_disclosure_target_pubkey, audit_disclosure_payload, self_view_disclosure_digest, self_view_disclosure_payload, view_tags, expires_at_unix |
| 구매 기업 0 노트 예치, 인출과 같은 블록 | MsgDeposit | creator=`clair193q389jtmw6z43gu56wj69068jemeqaqwmfa0p`, amount=`0uclair` | note_commitment, encrypted_note, proof |
| 협력사 A 인출 12, 0 노트 예치와 같은 블록 | MsgWithdraw | creator=`clair1sadwnkugxsclr96teh6dcs38e5kavekx60hhjh`, amount=`12uclair`, recipient=`clair1sadwnkugxsclr96teh6dcs38e5kavekx60hhjh` | proof, root, nullifier, chain_id, expires_at_unix |

## 4. 기록에서 바로 읽히는 사실

- 인출을 단독으로 보낸 tx는 높이 10에서 실패했습니다(code 1). 0 노트 예치와 같은 블록(높이 11)에 넣은 인출은 높이 11에서 성공했습니다.
- 예치 금액([8, 12, 15])과 협력사 A의 인출 금액(12)은 모두 공개됩니다. 인출 금액이 예치 금액 가운데 하나와 같아, 두 거래를 금액으로 이을 수 있습니다.
- 협력사 A 일괄 지급 tx에는 MsgTransfer가 2개 들어 있어 송장 건수가 공개됩니다.
- 지급 tx(MsgTransfer)에는 amount와 recipient 필드가 없습니다. 보낸 계정(creator)은 공개됩니다.
