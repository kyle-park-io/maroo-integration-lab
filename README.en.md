# Maroo Integration Lab: Private Vendor Settlement (English summary)

Primary Track: A (Explain). Tracks B (Enable) and C (Activate) are submitted as well. The main documents are in Korean; this page is a one-page English summary. Korean README: [README.md](README.md)

The state submitted on 2026-09-28 is kept unchanged as the tag [`submission-2026-09-28`](https://github.com/kyle-park-io/maroo-integration-lab/releases/tag/submission-2026-09-28). Everything corrected since then is listed with its date, how it was found and what changed in [SUBMISSION_NOTES.md, section 제출 뒤 고친 것 (corrections after submission)](SUBMISSION_NOTES.md#제출-뒤-고친-것).

## What this is

One use case runs through all three tracks: a buyer company pays its suppliers in OKRW on Maroo while keeping per-supplier amounts and trading relationships off the public chain. Track A explains the architecture and trust boundaries to an institutional senior engineer, Track B turns the same flow into a 75-minute workshop, and Track C extends it into hackathon tracks.

A 13-slide visual summary (Korean) is in [slides/](slides/) as PNGs and one PDF.

## Tracks

One row per track: who it is for, where to start reading, the command to run, and the evidence it produced.

| Track | Folder | Audience | Start here | Commands | Evidence |
| --- | --- | --- | --- | --- | --- |
| A Explain (Primary) | [track-a-explain/](track-a-explain/) | Tech lead at an institution evaluating Maroo | [Integration guide](track-a-explain/integration-guide.md), section 0 | `pnpm a:inspect`, `a:probe`, `a:kyb-gate`, `a:local`, `explain`, `a:audit-access`, `a:watch-privacy` | [evidence.md](track-a-explain/evidence.md) |
| B Enable | [track-b-enable/](track-b-enable/) | Institutional engineers in a hands-on workshop | [Participant guide](track-b-enable/participant-guide.md) | `pnpm b:prepare`, `b:check`, `b:step 1~5`, `b:audit-drill`, `b:smoke` | [evidence.md](track-b-enable/evidence.md) |
| C Activate | [track-c-activate/](track-c-activate/) | Builders joining a Maroo hackathon | [Track portfolio](track-c-activate/portfolio.md) | `pnpm c:grounding`, `c:agent-limit`, `c:judge`, `c:app` | [evidence.md](track-c-activate/evidence.md) |

Clairveil v0.4.0 [`ca85b02708fdd75259d4d2ee2d671c21198cec69`](https://github.com/DELIGHT-LABS/clairveil/tree/ca85b02708fdd75259d4d2ee2d671c21198cec69), with ClairveilJS `faf220d5` and clairveil-samples `8321ded`.

## Results worth a first look

- `[Live Testnet]` A PCL-proxied settlement vault rejects a supplier's `claim()` without a KYB attestation (`EasNoAttestationReceived`) and accepts it after the attestation is indexed. The policy admin and the upgrade owner are different addresses.
- `[Live Testnet]` A Privacy deposit request built by this repo first fails at request validation (`SDKInvalidRequest()`), with no global-policy rejection before it. A request that fails during execution never reaches the global-policy re-check that runs after a successful execution, so this result does not show that the request passed the global policy. The one thing still missing for a valid proof is the proving material (a proving key or prover that matches the testnet verifying key); the shielded-state queries answer at the address the 2026-10-23 docs list as Cosmos REST. The full shielded flow therefore runs on a local Clairveil chain. Replaying the calldata of a public, successful deposit from a wallet without the identity attestation stops at the Privacy contract policy (`EasNoAttestationReceived`).
- `[Local]` A supplier payment of 15 was decrypted by the supplier, the buyer and the auditor with their own keys; the transfer message that a third party reads carries no amount field.
- `[Live Testnet]` An agent wallet with a 5 OKRW `TransferLimit` pays 3 OKRW successfully and is rejected at 8 OKRW with `ExceededAgentTransferLimit`. Writing the limit as the numeric string that the 2026-09-26 Maroo Docs described blocks every payment with `AgentTransferLimitMetadataInvalid`; only a 32-byte uint256 works. The 2026-10-23 docs describe the 32-byte form.
- `[Live Testnet]` A transaction rejected by a contract-scope PCL policy (behind a PCL proxy) is still included in a block as reverted and pays half of its gas limit; all eight rejected transactions in the two recorded runs used exactly 50.0%, and so did seven more in the 2026-09-27 re-runs. The 2026-09-26 docs said policy rejections are filtered at submission without gas; the 2026-10-23 docs say that a rejection during or after execution reverts the transaction, which is still included in a block and charged gas. The Track A guide maps where each policy is evaluated inside the node (section 1).
- `[Live Testnet]` A plain OKRW transfer uses about 104,000 gas from a regular account and about 284,000 from an agent wallet, while the 2026-09-26 docs example said 21,000 (the 2026-10-23 docs say about 104,000, and about 283,000 for an agent wallet). A transfer sent with a 21,000 gas limit is included, reverts, and still pays a fee.

All discrepancies (19) and DX feedback items (14) with reproduction commands and owners are in [SUBMISSION_NOTES.md](SUBMISSION_NOTES.md). They were written against the docs fetched on 2026-09-26; compared with the docs fetched again on 2026-10-23, 13 of the 19 discrepancies are fixed and 3 are partly fixed.

## Added after submission

These commands and documents were added after 2026-09-28. Labels follow the table under "Evidence labels" below.

- `pnpm explain <tx hash>` explains a failed transaction or call: the error selector and its family, whether a PCL rejection came from the global policy or from a policy bound to the called contract, `PolicyCheckPassed` on calls that passed a PCL proxy, and what to do next. Workshop step 4 and the Track C judge use the same code. `[Live Testnet]` queries only.
- `pnpm a:audit-access` is a controlled-access prototype. Clairveil leaves the decision on who holds the audit key and who approves access to the company that runs a chain built on Clairveil (here, Maroo); this prototype shows one way to make that decision. The local audit key is split 2-of-3 among an internal audit team, an external auditor and a regulator. Two roles other than the requester must approve, and only the requested transfers' audit disclosures are opened, from partial decryptions, without rebuilding the key (`[Local]`). The request, the approvals and the access are recorded as EAS attestations (`[Live Testnet]`). `pnpm b:audit-drill` turns the same flow into an optional workshop exercise where participants decide whether to approve a request.
- `pnpm a:local --operator` adds a settlement agent that receives amount-only disclosures; its per-supplier totals match the auditor's (`[Local]`).
- `pnpm a:watch-privacy` records Privacy readiness every day through GitHub Actions: the shielded-state query routes, whether proving material is published, a layer-4 test with public calldata, the official SDK's deposit preparation, Privacy transaction counts, and changes in the docs and Clairveil releases. It also hashes every file in Clairveil's release archives and compares the hashes with the testnet verifying keys; on 2026-10-23 none of the 2,233 files in 9 archives matched, and neither did any commit reachable from Clairveil's 12 branches, 11 tags and 8 pull requests. It opens an issue when proving material appears in the circuit config or in a release archive. `pnpm a:probe-public` replays public successful Privacy deposits from other wallets and blocks.
- `pnpm c:app` is a reference web app for agent payments under a transfer limit. It pre-checks each payment with `eth_estimateGas`, shows a reason and a next step for each kind of failure, and accepts no new payment while the outcome of an earlier one is unknown.
- Workshop pilot forms in [track-b-enable/pilot/](track-b-enable/pilot/) (Korean, PDF and source): an agenda, a participant notice and an observation sheet.
- On 2026-10-23 the Track A vault flow, the Privacy probes, the Track B smoke test (108 seconds) and the Track C agent-limit run and judge examples were run again and gave the same rejections and passes as at submission.

## How the tracks connect

The three tracks carry the same settlement case forward: Track A explains the architecture and trust boundaries, Track B has participants run the same flow and check success and failure themselves, and Track C extends it into hackathon tracks with automated judging. All three call the same code under `shared/`. Findings from Track A (reason codes, places where the docs and the chain differ) became Track B troubleshooting entries and Track C mentor answers. The diagram and mapping tables are in the Korean README, section "세 트랙이 이어지는 방식".

## Run

Requires Node.js 24+, pnpm 11, Go 1.25.12+, Foundry 1.8.1.

```bash
pnpm install
pnpm bootstrap                                # about 2 minutes; then `pnpm review` checks everything that needs no keys or balance (about 20 seconds)
pnpm build:contracts && pnpm test:contracts   # vault rule tests
pnpm setup:wallets                            # testnet-only role wallets, stored outside the repo
pnpm a:inspect                                # [Live Testnet] Privacy policy, required attestation, first failing layer
pnpm setup:clairveil && pnpm a:local          # [Local] full shielded settlement, about 4 minutes
```

State-changing testnet flows (`pnpm a:kyb-gate`, `pnpm b:step 2`, `pnpm c:agent-limit`) need testnet OKRW in the buyer wallet.

Building with an AI agent: opening the repo in Claude Code loads the [`.claude/skills/maroo-integration`](.claude/skills/maroo-integration/SKILL.md) skill, and opening it in Codex loads the identical [`.agents/skills/maroo-integration`](.agents/skills/maroo-integration/SKILL.md) copy (a unit test keeps the two files identical). It carries the rules this repo verified on testnet (pre-checks, gas limits, proxy deployment, attestation indexing order, the agent limit format), the places where the docs differ, and the commands to check them, and tells the agent not to guess anything outside that table. Tools that load neither folder are pointed to it by the root [AGENTS.md](AGENTS.md). In a six-question test, Codex with neither the skill folder nor AGENTS.md never opened the skill and repeated the docs' 21,000 gas figure; with either one, it opened the skill in all six sessions and answered correctly.

## Evidence labels

Every result in this repository carries one of these labels so that local results are never read as testnet results.

| Label | Meaning |
| --- | --- |
| `[Live Testnet]` | Run or queried on Maroo testnet (chain ID 450815); tx hashes and JSON records are in each track's `evidence/` |
| `[Local]` | Run on a local Clairveil v0.4.0 chain; not evidence of Maroo testnet compatibility |
| `[코드 대조]` (code comparison) | Public code and packages compared by script, no chain calls |
| `[Docs Only]` | Confirmed from documentation only |
| 권고 (recommendation) | Design or procedure proposed by this repo |

## Known limitations

- No valid Privacy state change was executed on Maroo testnet. The proving material for the testnet verifying key is not public, and private components were not guessed.
- The code is PoC and reference quality. Production key management, wallets and frontends are out of scope.
- The hackathon starter kit exists as a specification; the reference path is `pnpm a:local`, and judging is automated with `pnpm c:judge`.
- Walkthrough videos (Korean): [Track A](https://youtu.be/WAof3FSU_Uw), [Track B](https://youtu.be/izaYyAegKOA), [Track C](https://youtu.be/5-wrJeVAnDQ).

## License

MIT, see [LICENSE](LICENSE). Code fetched into `vendor/` keeps its original license (Clairveil family: Apache-2.0).
