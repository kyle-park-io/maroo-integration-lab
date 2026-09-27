# Maroo Integration Lab: Private Vendor Settlement (English summary)

Primary Track: A (Explain). Tracks B (Enable) and C (Activate) are submitted as well. The main documents are in Korean; this page is a one-page English summary. Korean README: [README.md](README.md)

## What this is

One use case runs through all three tracks: a buyer company pays its suppliers in OKRW on Maroo while keeping per-supplier amounts and trading relationships off the public chain. Track A explains the architecture and trust boundaries to an institutional senior engineer, Track B turns the same flow into a 75-minute workshop, and Track C extends it into hackathon tracks.

A 13-slide visual summary (Korean) is in [slides/](slides/) as PNGs and one PDF.

## Tracks

| Track | Folder | Audience | Start here | Commands | Evidence |
| --- | --- | --- | --- | --- | --- |
| A Explain (Primary) | [track-a-explain/](track-a-explain/) | Tech lead at an institution evaluating Maroo | [Integration guide](track-a-explain/integration-guide.md), section 0 | `pnpm a:inspect`, `a:probe`, `a:kyb-gate`, `a:local` | [evidence.md](track-a-explain/evidence.md) |
| B Enable | [track-b-enable/](track-b-enable/) | Institutional engineers in a hands-on workshop | [Participant guide](track-b-enable/participant-guide.md) | `pnpm b:prepare`, `b:check`, `b:step 1~5`, `b:smoke` | [evidence.md](track-b-enable/evidence.md) |
| C Activate | [track-c-activate/](track-c-activate/) | Builders joining a Maroo hackathon | [Track portfolio](track-c-activate/portfolio.md) | `pnpm c:grounding`, `c:agent-limit`, `c:judge` | [evidence.md](track-c-activate/evidence.md) |

Clairveil v0.4.0 [`ca85b02708fdd75259d4d2ee2d671c21198cec69`](https://github.com/DELIGHT-LABS/clairveil/tree/ca85b02708fdd75259d4d2ee2d671c21198cec69), with ClairveilJS `faf220d5` and clairveil-samples `8321ded`.

## Results worth a first look

- `[Live Testnet]` A PCL-proxied settlement vault rejects a supplier's `claim()` without a KYB attestation (`EasNoAttestationReceived`) and accepts it after the attestation is indexed. The policy admin and the upgrade owner are different addresses.
- `[Live Testnet]` A Privacy deposit passes the global policy and first fails at request validation (`SDKInvalidRequest()`). The circuit artifacts and shielded-state query path needed for a valid proof are not public, so the full shielded flow runs locally.
- `[Local]` A supplier payment of 15 was decrypted by the supplier, the buyer and the auditor with their own keys; the transfer message that a third party reads carries no amount field.
- `[Live Testnet]` An agent wallet with a 5 OKRW `TransferLimit` pays 3 OKRW successfully and is rejected at 8 OKRW with `ExceededAgentTransferLimit`. Writing the limit as the numeric string that Maroo Docs describes blocks every payment with `AgentTransferLimitMetadataInvalid`; only a 32-byte uint256 works.
- `[Live Testnet]` A transaction rejected by a contract-scope PCL policy (behind a PCL proxy) is still included in a block as reverted and pays half of its gas limit; all eight rejected transactions across two runs used exactly 50.0%. The docs say policy rejections are filtered at submission without gas. The Track A guide maps where each policy is evaluated inside the node (section 1).
- `[Live Testnet]` A plain OKRW transfer uses about 104,000 gas from a regular account and about 284,000 from an agent wallet, while the docs example says 21,000. A transfer sent with a 21,000 gas limit is included, reverts, and still pays a fee.

All discrepancies (19) and DX feedback items (14) with reproduction commands and owners are in [SUBMISSION_NOTES.md](SUBMISSION_NOTES.md).

## How the tracks connect

The three tracks carry the same settlement case forward: Track A explains the architecture and trust boundaries, Track B has participants run the same flow and check success and failure themselves, and Track C extends it into hackathon tracks with automated judging. All three call the same code under `shared/`. Findings from Track A (reason codes, places where the docs and the chain differ) became Track B troubleshooting entries and Track C mentor answers. The diagram and mapping tables are in the Korean README, section "세 트랙이 이어지는 방식".

## Run

Requires Node.js 24+, pnpm 11, Go 1.25.12+, Foundry 1.8.1.

```bash
pnpm install
pnpm build:contracts && pnpm test:contracts   # vault rule tests
pnpm setup:wallets                            # testnet-only role wallets, stored outside the repo
pnpm a:inspect                                # [Live Testnet] Privacy policy, required attestation, first failing layer
pnpm setup:clairveil && pnpm a:local          # [Local] full shielded settlement, about 4 minutes
```

State-changing testnet flows (`pnpm a:kyb-gate`, `pnpm b:step 2`, `pnpm c:agent-limit`) need testnet OKRW in the buyer wallet.

Building with an AI agent: opening the repo in Claude Code loads the [`.claude/skills/maroo-integration`](.claude/skills/maroo-integration/SKILL.md) skill. It carries the rules this repo verified on testnet (pre-checks, gas limits, proxy deployment, attestation indexing order, the agent limit format), the places where the docs differ, and the commands to check them, and tells the agent not to guess anything outside that table. Tools that do not load that folder (Codex, for example) are pointed to it by the root [AGENTS.md](AGENTS.md); in a six-question test, Codex never opened the skill without AGENTS.md and repeated the docs' 21,000 gas figure, and opened it in all six sessions with AGENTS.md.

## Evidence labels

| Label | Meaning |
| --- | --- |
| `[Live Testnet]` | Run or queried on Maroo testnet (chain ID 450815); tx hashes and JSON records are in each track's `evidence/` |
| `[Local]` | Run on a local Clairveil v0.4.0 chain; not evidence of Maroo testnet compatibility |
| `[코드 대조]` (code comparison) | Public code and packages compared by script, no chain calls |
| `[Docs Only]` | Confirmed from documentation only |
| 권고 (recommendation) | Design or procedure proposed by this repo |

## Known limitations

- No valid Privacy state change was executed on Maroo testnet; private components were not guessed.
- The code is PoC and reference quality. Production key management, wallets and frontends are out of scope.
- The hackathon starter kit exists as a specification; the reference path is `pnpm a:local`, and judging is automated with `pnpm c:judge`.
- Walkthrough videos: recording is scheduled for 2026-09-27, and the links will be added to both READMEs.

## License

MIT, see [LICENSE](LICENSE). Code fetched into `vendor/` keeps its original license (Clairveil family: Apache-2.0).
