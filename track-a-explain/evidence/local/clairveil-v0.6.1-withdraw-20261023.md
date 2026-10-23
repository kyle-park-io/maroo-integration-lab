# [Local] Clairveil v0.6.1 단독 인출 실험 (2026-10-23)

> Clairveil v0.6.1을 이 머신의 로컬 체인에서 돌린 기록입니다. Maroo 테스트넷 노드는 Clairveil v0.3.0을 쓰고, 테스트넷 결과는 A 증거 목록 1절에 있습니다. 이 레포의 로컬 실행(`pnpm a:local`)은 v0.4.0에 고정되어 있고, 이 실험은 `.work/` 아래 따로 받은 v0.6.1로 했습니다. 원본 로그는 레포에 올리지 않았습니다(`.work/clairveil-v0.6.1-notes/`).

단독으로 보낸 차폐 인출은 Clairveil v0.6.1에서 `merkle root snapshot re-registration is inconsistent` 없이 세 번 모두 code 0으로 블록에 들어갔고, 받는 계정 잔액이 그만큼 늘었습니다. 같은 블록 우회는 필요하지 않아 실행하지 않았습니다. `[Local]`

## 1. 환경

- Clairveil: 태그 `v0.6.1`, 커밋 `fad307abddd0daa1c880f2e423668f5c58a0e578`. 위치 `.work/clairveil-v0.6.1/`. `git rev-parse HEAD`로 확인했습니다(2026-10-23 13:2x UTC).
- Go: `go version go1.27.1 linux/amd64`. 레포 `go.mod`의 요구 버전은 `go 1.25.13`입니다.
- 체인 ID `v061-local-1`, 노드 한 개, 기본 포트(26657, 26656, 1317, 9090). 시작 전 `ss -ltn`에서 네 포트가 비어 있었습니다. 끝낸 뒤 `ss -ltn`과 `pgrep`으로 같은 포트에 듣는 프로세스와 `clairveild` 프로세스가 없는 것을 확인했습니다(13:32 UTC).
- 테스트넷, `testnet.env`, 키 파일은 쓰지 않았습니다. `vendor/clairveil`, `.work/prebuilt/`, git이 추적하는 파일은 건드리지 않았고 커밋도 하지 않았습니다.

## 2. 실행한 명령 순서

모든 보조 스크립트는 `.work/clairveil-v0.6.1-notes/`에 있습니다(`init.sh`, `env.sh`, `auditcfg/main.go`).

1. `git clone https://github.com/DELIGHT-LABS/clairveil .work/clairveil-v0.6.1` 뒤 `git checkout v0.6.1`.
2. `go build -o <notes>/bin/clairveild ./cmd/clairveild`, `go build -o <notes>/bin/clairveil-setup ./cmd/clairveil-setup`. 오류 없이 끝났습니다.
3. `clairveil-setup --out run/artifacts --development`. 회로 4개 산출물과 `privacy_zk_manifest.json`이 생겼고 2분 40초 걸렸습니다(`setup.log`).
4. `auditcfg`(notes에 둔 Go 보조 프로그램)로 감사 키, PoP, 네트워크 nonce를 만들어 `run/audit-config.json`을 썼습니다. 회로 identity는 3번 manifest에서 옮겼습니다.
5. `clairveild init local --chain-id v061-local-1 --audit-config run/audit-config.json`, `keys add`(buyer, supplier-a, supplier-b), `add-genesis-account`, `gentx`, `collect-gentxs`, `validate`(`init.log`).
6. `clairveild start --audit-config ... --audit-artifacts run/artifacts --minimum-gas-prices 0uclair`(`chain.log`).
7. 시도 1: `tx privacy deposit 12uclair --from supplier-a`, 이어서 `tx privacy withdraw 12uclair --recipient <supplier-b 투명 주소> --from supplier-a --auto-dummy=false --auto-plan=false`.
8. 시도 2: `deposit 8uclair --from supplier-a`, 이어서 같은 인출을 기본 플래그(`--auto-dummy`, `--auto-plan` 켬)로 보냈습니다.
9. 시도 3: `deposit 5uclair --from supplier-a`, `prepare-withdraw 5uclair`, buyer 계정이 `relay-withdraw`로 제출했습니다.
10. `kill $(cat chain.pid)`로 노드를 껐습니다.

받는 계정은 인출 수수료를 내지 않는 supplier-b의 투명 주소(`clair15u9m2g8aw3u5ezr93nx20gta34mr5r45d3y54e`)로 했습니다. 잔액 증가가 인출액과 정확히 같아집니다.

## 3. 인출 시도별 결과

세 시도 모두 인출 tx가 든 블록에는 그 tx 하나뿐이었습니다(`blocks.txt`, `query block-results`의 `txs_results` 길이 1). 직전 잎 추가 tx는 3블록 이상 앞의 다른 블록에 있었습니다.

| 시도 | 인출 tx 해시 | 높이 | code | raw_log | 받는 계정 잔액 전 | 후 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 단독 직접 인출 12 | `9B474C9703657450339DBCEB9AF91BCEB1BCAD6B99588E4D8110AE7D0642E77D` | 11 | 0 | 빈 문자열 | 100000000000000000000 (13:29:35) | 100000000000000000012 (13:29:53) |
| 2 단독 직접 인출 8 (기본 플래그) | `1FEA8950C0B548247E0A279E22D07252FF608FB6BC8DE44F262AA1312ABC9A4F` | 26 | 0 | 빈 문자열 | 100000000000000000012 (13:30:49) | 100000000000000000020 (13:31:04) |
| 3 단독 대리 인출 5 | `98DFD080BCAA2EA9062A11977DCEDA273F26206EA9E55F603AC561F8DDD06140` | 39 | 0 | 빈 문자열 | 100000000000000000020 (13:31:59) | 100000000000000000025 (13:32:12) |

앞선 예치 tx는 다음과 같습니다. 모두 code 0입니다.

| 예치 | tx 해시 | 높이 |
| --- | --- | --- |
| 12 | `8E470EE893F67A44A9B6A48EBDB3A7395C0B962CDADBAF9ECC09A9DA8DF206F0` | 7 |
| 8 | `9F7F79E22BC0B296D7B0EA5425CCD61AE1843BDDB02E24ECF646647CD25859C3` | 23 |
| 5 | `6917163D6AE4DF27648F8539BA9BB9833FFFE991C2282CD24BF3B003F3798A66` | 36 |

시도 1은 예치(높이 7)와 인출(높이 11) 사이에 잎을 더한 tx가 없는 블록 8에서 10이 있습니다. 이 조건이 v0.4.0 기록에서 실패한 조건입니다. 같은 루트가 높이 7에 이미 등록돼 있는 상태에서 높이 11에 인출이 들어갔고 거부되지 않았습니다.

블록 타임스탬프는 CometBFT 블록 시간이라 명령을 보낸 시각보다 몇 초 앞서 보입니다(예: 시도 3 인출 블록 13:31:57, 보낸 시각 13:31:59 뒤). 위 표의 잔액 시각은 명령을 실행한 컴퓨터 시계입니다. 원본은 `wd1-query.json`, `wd2-query.json`, `wd3-query.json`, `bal-before-1.json`, `bal-after-1.json`, `bal-2.txt`, `bal-3.txt`입니다.

## 4. 같은 블록 우회와 스모크 스크립트

- 같은 블록 우회(0 노트 예치를 먼저 mempool에 넣고 인출을 같은 블록에 넣는 방법)는 단독 인출이 실패하지 않아 실행하지 않았습니다.
- v0.6.1에는 `scripts/privacy-e2e-smoke.sh`가 없습니다. 커밋 `4b01f2a`(`chore: align release documentation and remove obsolete live tooling`)에서 지워졌고, `scripts/README.md`는 「No checked-in script currently claims to provide an end-to-end native V2 node smoke」라고 적습니다. 그래서 `wait_tx`가 `code`를 보는지 확인할 스크립트가 없습니다. `git ls-files`에서 `smoke`, `e2e`, `localnet`이 든 파일은 `scripts/privacy-batch-joinsplit-localnet.sh`(노드를 띄우지 않는 정적 검사), `cmd/clairveil-localnetload`, `cmd/clairveil-payroll/seed_localnet_notes.go`, `x/privacy/client/cli/payroll_batch_localnet_live_test.go`였고, 이 실험에서는 실행하지 않았습니다.
- 이번 시도의 `code`는 스크립트 출력이 아니라 `clairveild query tx <해시>`로 직접 읽었습니다.

## 5. v0.4.0 단계와 달라진 점

- 스모크 스크립트가 없어 CLI 문서(`docs/clairveil-cli-reference.md`, `docs/clairveil-getting-started.md`, `docs/clairveil-operations-guide.md`)를 보고 직접 이었습니다.
- 체인 초기화에 `--audit-config`(JSON: `chain_id`, `network_nonce32`, `initial_height`, `initial_audit_key`, `circuit_set_identity`)가 필요합니다. 감사 키는 공개키와 PoP를 설정 파일에 넣는 방식이고, v0.4.0 실행기처럼 genesis의 `audit_master_pubkey`를 고치는 방식이 아닙니다. 이 파일을 만드는 명령이 v0.6.1에 없어, 레포의 공개 패키지(`x/privacy/crypto`, `x/privacy/crypto/auditfield`)를 쓰는 Go 보조 프로그램을 썼습니다. 처음에는 PoP의 network 값에 nonce를 그대로 넣어 노드가 `invalid audit key PoP`로 시작하지 못했고, `auditfield.NetworkDigest(chainID, nonce)`로 고쳐 시작했습니다.
- `clairveild start`에 `--audit-config`와 `--audit-artifacts`가 필수입니다. 트랜잭션 CLI에도 같은 두 플래그와 환경 변수 `CLAIRVEIL_PRIVACY_ZK_ARTIFACT_DIR`(없으면 `is required for the audit-field V2 runtime`)가 필요합니다. 이 실험에서는 `privacy_zk_checksums.env`의 값을 환경에 올리고 `CLAIRVEIL_PRIVACY_ZK_PREFLIGHT_MODE=strict`로 두었습니다.
- 회로는 u128 판 네 개이고 산출물을 새로 만들어야 합니다(`operations guide` 3절). 생성에 2분 40초 걸렸습니다.
- 증명 시간이 짧았습니다. 예치 증명은 `took` 205ms 안팎, 인출 증명은 460ms에서 800ms였고, 명령 하나가 1초대에서 5초 안에 끝났습니다.
- 가스는 예치가 2,796,745에서 2,868,008 근처, 인출이 2,326,716에서 2,326,822였습니다(`query block-results`의 `gas_used`). 예치 가스 한도는 `--gas 3500000`으로 통과했습니다.
- 인출은 정확히 일치하는 노트만 쓰고(CLI 문서 7절), 0 노트 자동 예치는 이번에 필요하지 않았습니다. 시도 2의 로그 「Found 1 new note(s) in tx 9f7f…」는 직전에 내가 보낸 8 예치 tx입니다.
- tx 메시지 유형이 `/clairveil.privacy.v2.MsgDeposit`, `MsgWithdraw`입니다.

## 6. 소스에서 읽은 것 (실행으로 확인하지 않은 부분)

- v0.4.0(`ca85b027`)과 v0.6.1의 `x/privacy/keeper/path_snapshot.go` 차이(`git diff`)는 `SetMerkleRootSnapshotV1`의 첫머리에 `if k.audit != nil { return fmt.Errorf("raw snapshot mutation is disabled") }`가 생긴 것입니다. 「re-registration is inconsistent」 비교 코드는 `setMerkleRootSnapshot`으로 옮겨져 남아 있습니다.
- 이벤트 색인(`event_index.go`의 `indexPrivacyEvent`)은 `RecordCurrentMerkleRootSnapshotV1`을 부르고, 이를 부르는 쪽은 v1 `msg_server.go`(Withdraw 178행)와 `deposit.go`입니다. 이번에 쓴 `/clairveil.privacy.v2.MsgWithdraw`는 `audit_msg_server.go`의 `auditMsgServer.Withdraw`로 가고, 그 파일에는 `emitIndexedPrivacyEvent`, `indexPrivacyEvent`, `Snapshot`이 나오지 않습니다(`grep`). 문서 개선 노트 6절이 적은 「`RecordCurrentMerkleRootSnapshotV1`이 소스에 남아 있다」는 사실입니다. 다만 V2 인출이 그 함수를 지나는지는 grep으로 보이지 않았고, 실행에서는 거부가 나오지 않았습니다. 정확한 호출 경로는 추적하지 않았습니다.

## 7. 확인하지 못한 것

- 같은 노드에서 v0.4.0 단독 인출 실패를 다시 재현하지 않았습니다. v0.4.0과의 대비는 `vendor-settlement-20260925T181924Z.md`의 기록에 의존합니다.
- 인출 여러 건이 같은 블록에 몰리는 경우, 전송(`transfer`) 뒤의 인출, 일괄 전송 뒤의 인출은 실행하지 않았습니다.
- 블록 시간은 기본 5초(`timeout_commit`)였고 다른 값에서는 돌려 보지 않았습니다.

## 8. 걸린 시간

2026-10-23 13:21 UTC에 시작해 13:32 UTC에 노드를 껐고 약 11분(657초) 걸렸습니다. 이 가운데 회로 산출물 생성이 2분 40초입니다.

## 9. 원본 기록

`.work/clairveil-v0.6.1-notes/` 아래: `setup.log`, `init.log`, `chain.log`, `dep1.out`, `wd1.out`, `wd1.err`, `wd1-query.json`, `dep2-query.json`, `wd2.out`, `wd2.err`, `wd2-query.json`, `dep3-query.json`, `prep3.out`, `wd3.out`, `wd3-query.json`, `blocks.txt`, `bal-*`. 로컬 체인 홈(`run/home`)에는 이 실험용 키만 있습니다.

## 10. 소스 위치(커밋 `fad307ab`)

- 스냅샷 재등록 검사: [`path_snapshot.go` 190행](https://github.com/DELIGHT-LABS/clairveil/blob/fad307abddd0daa1c880f2e423668f5c58a0e578/x/privacy/keeper/path_snapshot.go#L190), 현재 루트 등록: [`path_snapshot.go` 253행](https://github.com/DELIGHT-LABS/clairveil/blob/fad307abddd0daa1c880f2e423668f5c58a0e578/x/privacy/keeper/path_snapshot.go#L253)
- 그 등록을 부르는 이벤트 색인: [`event_index.go` 58행](https://github.com/DELIGHT-LABS/clairveil/blob/fad307abddd0daa1c880f2e423668f5c58a0e578/x/privacy/keeper/event_index.go#L58). 색인 함수 `emitIndexedPrivacyEvent`를 부르는 곳은 v1 [`msg_server.go` 178행](https://github.com/DELIGHT-LABS/clairveil/blob/fad307abddd0daa1c880f2e423668f5c58a0e578/x/privacy/keeper/msg_server.go#L178)(인출), [400행](https://github.com/DELIGHT-LABS/clairveil/blob/fad307abddd0daa1c880f2e423668f5c58a0e578/x/privacy/keeper/msg_server.go#L400)(전송), [`deposit.go` 132행](https://github.com/DELIGHT-LABS/clairveil/blob/fad307abddd0daa1c880f2e423668f5c58a0e578/x/privacy/keeper/deposit.go#L132)입니다(2026-10-23 `grep`).
- 감사 설정을 켠 체인의 v1 인출: [`msg_server.go` 83행](https://github.com/DELIGHT-LABS/clairveil/blob/fad307abddd0daa1c880f2e423668f5c58a0e578/x/privacy/keeper/msg_server.go#L83)에서 `legacy privacy service is disabled`로 거부합니다. 이번 실험의 인출은 v2 메시지라 [`audit_msg_server.go`](https://github.com/DELIGHT-LABS/clairveil/blob/fad307abddd0daa1c880f2e423668f5c58a0e578/x/privacy/keeper/audit_msg_server.go)로 갔고, 그 파일에는 `emitIndexedPrivacyEvent`가 나오지 않습니다.
