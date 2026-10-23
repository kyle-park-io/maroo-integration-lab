// 통제된 열람의 요청, 승인, 거절, 열람을 Maroo 테스트넷 EAS 증명으로 남긴다. [Live Testnet]
//
// 체인에는 해시만 남는다. 사건 번호는 keccak256 으로, 요청과 승인과 열람의 내용은 audit-access.ts 의 recordHash 로 바꿔 싣는다.
// 승인, 거절, 열람 증명은 refUID 로 요청 증명을 가리킨다. 기록은 되돌릴 수 없게(revocable=false) 남긴다.
// 기록을 하나 남길 때마다 상태 파일에 uid 와 tx 를 쓴다. 중간에 멈추면 같은 상태 파일로 이어 한다.

import fs from "node:fs";
import {
  encodeAbiParameters, encodeFunctionData, encodePacked, formatEther, keccak256, parseEther, parseEventLogs, toHex, zeroAddress, zeroHash,
  type Address, type Hex,
} from "viem";
import {
  EAS_PARAMS, EXPLORER, addressOf, easAbi, easParamsAbi, publicClient as pub, schemaRegistryAbi, walletFor, type Role,
} from "./maroo.ts";
import { HOLDER_LABEL, STEP_CODE, STEP_LABEL, pendingRecords, resumeAction, type Holder, type RecordPlan, type RecordState } from "./audit-access.ts";

export const AUDIT_SCHEMA = "bytes32 caseHash, uint8 step, bytes32 contentHash, bytes32 requestHash";
export const HOLDER_ROLE: Record<Holder, Role> = { "audit-team": "AUDIT_TEAM", "external-auditor": "EXTERNAL_AUDITOR", regulator: "REGULATOR" };
// 기록 한 건에 잡는 잔액. 노드는 보내기 전에 가스 한도 × 최대 수수료(선결제 상한)만큼 잔액을 요구한다.
// 2026-10-23 승인 기록 한 건의 선결제 상한이 8.57 OKRW 였다. 실제 수수료는 그보다 적고 쓰지 않은 가스는 돌려받는다.
export const PER_RECORD = parseEther("10");
// 새 역할 지갑의 가스는 KYB 발급자 지갑에서 채운다(구매 기업 잔액은 금고 흐름이 1,000 OKRW 이상을 요구한다)
export const GAS_SOURCE: Role = "ISSUER";

export const caseHashOf = (caseId: string): Hex => keccak256(toHex(caseId));

async function easAddresses() {
  const p = await pub.readContract({ address: EAS_PARAMS, abi: easParamsAbi, functionName: "getParams" });
  return { eas: p.eas as Address, registry: p.schemaRegistry as Address };
}

// SchemaRegistry 의 uid = keccak256(abi.encodePacked(schema, resolver, revocable))
export const schemaUidOf = (): Hex => keccak256(encodePacked(["string", "address", "bool"], [AUDIT_SCHEMA, zeroAddress, false]));

export type FundingLine = { holder: Holder; address: Address; before: string; needed: string; topUp?: { amount: string; tx: Hex } };

// 기록을 보낼 역할마다 잔액을 먼저 확인하고, 모자라면 GAS_SOURCE 에서 채운다. 채울 수 없으면 아무 기록도 보내기 전에 멈춘다.
export async function fundRecorders(counts: Partial<Record<Holder, number>>, opts: { topUp: boolean; extraFor?: Holder }): Promise<FundingLine[]> {
  const lines: FundingLine[] = [];
  const short: string[] = [];
  for (const [holder, n] of Object.entries(counts) as [Holder, number][]) {
    const address = addressOf(HOLDER_ROLE[holder]);
    const before = await pub.getBalance({ address });
    const needed = PER_RECORD * BigInt(n + (opts.extraFor === holder ? 1 : 0));
    const line: FundingLine = { holder, address, before: formatEther(before), needed: formatEther(needed) };
    if (before < needed) {
      if (!opts.topUp) {
        const what = opts.extraFor === holder ? `기록 ${n}건과 스키마 등록에` : `기록 ${n}건에`;
        short.push(`${HOLDER_LABEL[holder]} 지갑(${address})의 잔액이 ${formatEther(before)} OKRW로, ${what} 잡은 ${formatEther(needed)} OKRW보다 적습니다.`);
      } else {
        const amount = needed - before + PER_RECORD;
        const src = addressOf(GAS_SOURCE);
        if ((await pub.getBalance({ address: src })) < amount + PER_RECORD) {
          short.push(`가스를 채울 KYB 발급자 지갑(${src})의 잔액이 모자랍니다. faucet 으로 받은 뒤 다시 실행하십시오(pnpm setup:wallets 가 요청 명령을 출력합니다).`);
        } else {
          const tx = await walletFor(GAS_SOURCE).sendTransaction({ to: address, value: amount });
          const r = await pub.waitForTransactionReceipt({ hash: tx });
          if (r.status !== "success") throw new Error(`${HOLDER_LABEL[holder]} 지갑 가스 보충 tx 가 실패했습니다: ${EXPLORER}/tx/${tx}`);
          line.topUp = { amount: formatEther(amount), tx };
        }
      }
    }
    lines.push(line);
  }
  if (short.length) {
    throw new Error(`기록을 보내기 전에 멈췄습니다. 이번 실행에서 보낸 기록은 없습니다.\n${short.join("\n")}\n모자란 가스를 KYB 발급자 지갑에서 채우려면 --top-up 을 붙여 다시 실행하십시오.`);
  }
  return lines;
}

export async function schemaExists(): Promise<boolean> {
  const { registry } = await easAddresses();
  const s = await pub.readContract({ address: registry, abi: schemaRegistryAbi, functionName: "getSchema", args: [schemaUidOf()] });
  return s.uid !== zeroHash;
}

// 스키마가 없으면 등록한다. 있으면 그대로 쓴다.
export async function ensureSchema(by: Holder): Promise<{ uid: Hex; registeredTx?: Hex }> {
  const { registry } = await easAddresses();
  const uid = schemaUidOf();
  const existing = await pub.readContract({ address: registry, abi: schemaRegistryAbi, functionName: "getSchema", args: [uid] });
  if (existing.uid !== zeroHash) return { uid };
  const tx = await walletFor(HOLDER_ROLE[by]).sendTransaction({ to: registry, data: encodeFunctionData({ abi: schemaRegistryAbi, functionName: "register", args: [AUDIT_SCHEMA, zeroAddress, false] }) });
  const r = await pub.waitForTransactionReceipt({ hash: tx });
  if (r.status !== "success") throw new Error(`열람 기록 스키마 등록 tx 가 실패했습니다: ${EXPLORER}/tx/${tx}`);
  return { uid, registeredTx: tx };
}

export type Recorded = { key: string; step: string; actor: Holder; uid: Hex; tx: Hex; block: string; gasUsed: string; explorer: string };

// 남기지 않은 기록만 순서대로 보낸다. 기록마다 상태 파일을 고쳐 쓴다.
export async function recordAll(plan: RecordPlan[], ctx: { schemaUid: Hex; caseId: string; requestHash: Hex; stateFile: string }): Promise<Recorded[]> {
  const { eas } = await easAddresses();
  const state: RecordState = fs.existsSync(ctx.stateFile) ? JSON.parse(fs.readFileSync(ctx.stateFile, "utf8")) : {};
  const done: Recorded[] = [];
  for (const p of pendingRecords(plan, state)) {
    const refUID = p.step === "request" ? zeroHash : state.request?.uid;
    if (!refUID) throw new Error("요청 기록이 없어 승인과 열람 기록을 이을 수 없습니다. 상태 파일을 지우고 새 사건으로 다시 실행하십시오.");
    const data = encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint8" }, { type: "bytes32" }, { type: "bytes32" }],
      [caseHashOf(ctx.caseId), STEP_CODE[p.step], p.contentHash, ctx.requestHash],
    );
    // 지난 실행이 보내고 영수증을 확인하지 못한 기록이면 그 tx 부터 본다
    const prev = state[p.key];
    if (prev?.sent) {
      const receipt = await pub.getTransactionReceipt({ hash: prev.tx }).catch((e) => { if (/NotFound|could not be found/i.test(String((e as Error)?.name) + String((e as Error)?.message))) return undefined; throw e; });
      const inMempool = receipt ? false : await pub.getTransaction({ hash: prev.tx }).then(() => true, () => false);
      const action = resumeAction(prev, { receipt: receipt ? receipt.status : "none", inMempool });
      if (action === "wait") throw new Error(`${STEP_LABEL[p.step]} 기록 tx 가 아직 블록에 들어가지 않았습니다: ${EXPLORER}/tx/${prev.tx}\n잠시 뒤 --resume 으로 다시 실행하십시오.`);
      if (action === "failed") throw new Error(`${STEP_LABEL[p.step]} 기록 tx 가 실패했습니다: ${EXPLORER}/tx/${prev.tx}. pnpm explain ${prev.tx} 로 이유를 확인하십시오.`);
      if (action === "adopt" && receipt) {
        done.push(finish(p, prev.tx, receipt));
        continue;
      }
    }
    // 서명해 해시를 먼저 정하고, 보내기 전에 상태 파일에 남긴다. 보내다 끊기거나 영수증을 기다리다 끊겨 --resume 으로 이어 하면
    // 같은 기록을 다시 보내지 않고 이 tx 부터 본다.
    const wallet = walletFor(HOLDER_ROLE[p.actor]);
    const request = await wallet.prepareTransactionRequest({
      account: wallet.account, chain: wallet.chain, to: eas,
      data: encodeFunctionData({ abi: easAbi, functionName: "attest", args: [{ schema: ctx.schemaUid, data: { recipient: zeroAddress, expirationTime: 0n, revocable: false, refUID, data, value: 0n } }] }),
    });
    const serialized = await wallet.signTransaction(request as never);
    const tx = keccak256(serialized);
    state[p.key] = { tx, sent: true, contentHash: p.contentHash };
    fs.writeFileSync(ctx.stateFile, JSON.stringify(state, null, 2));
    try {
      await pub.sendRawTransaction({ serializedTransaction: serialized });
    } catch (err) {
      const msg = String((err as Error).message) + String((err as { cause?: unknown }).cause ?? "");
      // 노드가 받지 않은 것이 확실하면 남긴 tx 를 지운다
      const refused = /insufficient funds|exceeds the balance|nonce too low|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i.test(msg);
      if (refused) {
        delete state[p.key];
        fs.writeFileSync(ctx.stateFile, JSON.stringify(state, null, 2));
      }
      if (/insufficient funds|exceeds the balance/i.test(msg)) {
        throw new Error(`${HOLDER_LABEL[p.actor]} 지갑의 OKRW가 ${STEP_LABEL[p.step]} 기록 tx 의 선결제 상한(가스 한도 × 최대 수수료)보다 적어 보내지 못했습니다.\n--top-up 을 붙여 --resume 으로 다시 실행하십시오.`);
      }
      if (!refused) throw new Error(`${STEP_LABEL[p.step]} 기록 tx 를 보내다 연결이 끊겨 노드가 받았는지 모릅니다: ${EXPLORER}/tx/${tx}\n네트워크를 확인한 뒤 --resume 으로 다시 실행하십시오. 이어 하기는 이 tx 의 영수증부터 보고 다시 보내지 않습니다.`);
      throw err;
    }
    const r = await pub.waitForTransactionReceipt({ hash: tx }).catch((err) => {
      throw new Error(`${STEP_LABEL[p.step]} 기록 tx 의 영수증을 받지 못했습니다(${String((err as Error).message).split("\n")[0]}): ${EXPLORER}/tx/${tx}\n잠시 뒤 --resume 으로 다시 실행하십시오. 이어 하기는 이 tx 의 영수증부터 보고 다시 보내지 않습니다.`);
    });
    if (r.status !== "success") throw new Error(`${STEP_LABEL[p.step]} 기록 tx 가 실패했습니다: ${EXPLORER}/tx/${tx}. pnpm explain ${tx} 로 이유를 확인하십시오.`);
    done.push(finish(p, tx, r));
  }
  return done;

  function finish(p: RecordPlan, tx: Hex, r: Awaited<ReturnType<typeof pub.getTransactionReceipt>>): Recorded {
    const uid = parseEventLogs({ abi: easAbi, logs: r.logs, eventName: "Attested" })[0].args.uid as Hex;
    state[p.key] = { uid, tx, contentHash: p.contentHash };
    fs.writeFileSync(ctx.stateFile, JSON.stringify(state, null, 2));
    const rec = { key: p.key, step: STEP_LABEL[p.step], actor: p.actor, uid, tx, block: r.blockNumber.toString(), gasUsed: r.gasUsed.toString(), explorer: `${EXPLORER}/tx/${tx}` };
    console.log(`  [기록] ${rec.step} ${HOLDER_LABEL[p.actor]}  ${rec.explorer}`);
    return rec;
  }
}

// 체인에 남은 증명을 다시 읽어 상태 파일과 맞는지 확인한다
export async function readBack(state: RecordState, schemaUid: Hex) {
  const { eas } = await easAddresses();
  const out: { key: string; uid: Hex; attester: Address; schemaOk: boolean; refUID: Hex; revocable: boolean }[] = [];
  // 보냈지만 확인하지 못한 기록(uid 없음)은 읽을 증명이 없어 건너뛴다
  for (const [key, v] of Object.entries(state)) {
    if (!v.uid) continue;
    const a = await pub.readContract({ address: eas, abi: easAbi, functionName: "getAttestation", args: [v.uid] });
    out.push({ key, uid: v.uid, attester: a.attester, schemaOk: a.schema === schemaUid, refUID: a.refUID, revocable: a.revocable });
  }
  return out;
}

// 탐색기(Blockscout)가 tx 를 색인했는지 읽는다. 색인이 늦으면 몇 번 다시 읽는다.
export async function explorerStatus(tx: Hex, tries = 10): Promise<{ indexed: boolean; status?: string; from?: string }> {
  const url = `${EXPLORER}/blockscout/api/v2/transactions/${tx}`;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const j = (await res.json()) as { status?: string; from?: { hash?: string } };
        if (j.status) return { indexed: true, status: j.status, from: j.from?.hash };
      }
    } catch {
      // 탐색기 응답이 없으면 잠시 뒤 다시 읽는다
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return { indexed: false };
}
