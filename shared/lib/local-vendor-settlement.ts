// 비공개 공급업체 정산을 Clairveil 로컬 체인에서 끝까지 돌리는 공용 실행기. [Local]
//
// 트랙마다 자기 진입 스크립트에서 불러, 기록을 그 트랙의 evidence/ 에 남긴다.
//   Track A: track-a-explain/recipe/local-vendor-settlement.ts  (pnpm a:local)
//
// 역할
//   buyer       구매 기업. 대금 재원을 차폐 풀에 넣고 협력사에 지급한다
//   supplier-a  협력사 A. 송장 두 건을 한 번에 받고, 받은 대금을 투명 잔액으로 꺼낸다
//   supplier-b  협력사 B. 송장 한 건을 받고, 송장 내용(금액, 보낸 쪽, 받는 쪽)을 자기 키로 푼다
//   auditor     감사인. 체인에 설정된 감사 키로 지급 내역을 푼다
//
// 흐름은 Clairveil v0.4.0 의 scripts/privacy-e2e-smoke.sh 를 따르고, 역할과 금액만 정산에 맞췄다.
// 로컬 체인의 자산은 uclair 이고 금액은 작은 정수다. 마루의 OKRW 금액이 아니다.
// 명령마다 받은 JSON 은 .work/vendor-<시각>/out/ 에 남는다.

import { execFile, execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { writeReport } from "./local-report.ts";
import { ROOT } from "./paths.ts";

type Json = Record<string, any>;
const execFileP = promisify(execFile);

const CORE = path.join(ROOT, "vendor/clairveil");

// 바이너리 두 개를 빌드하고 회로 산출물을 만든다. 워크샵 사전 준비(pnpm b:prepare)는 한 번 만들어 두고 재사용한다.
export function buildClairveil(dir: string, log: string) {
  if (!fs.existsSync(path.join(CORE, ".git"))) {
    throw new Error("vendor/clairveil 이 없습니다. 먼저 pnpm setup:clairveil 을 실행하십시오.");
  }
  fs.mkdirSync(log, { recursive: true });
  execFileSync("go", ["build", "-o", path.join(dir, "clairveild"), "./cmd/clairveild"], { cwd: CORE, stdio: "inherit" });
  execFileSync("go", ["build", "-o", path.join(dir, "clairveil-setup"), "./cmd/clairveil-setup"], { cwd: CORE, stdio: "inherit" });
  execFileSync(path.join(dir, "clairveil-setup"), ["--out", path.join(dir, "artifacts")], {
    stdio: ["ignore", fs.openSync(path.join(log, "setup.stdout"), "w"), fs.openSync(path.join(log, "setup.stderr"), "w")],
  });
  fs.writeFileSync(path.join(dir, "clairveil-commit.txt"), execFileSync("git", ["-C", CORE, "rev-parse", "HEAD"]).toString());
}

// prebuiltDir 에 buildClairveil 결과가 있고 vendor/clairveil 과 같은 커밋이면 빌드를 건너뛴다.
// beforeStage 는 1~10 단계 번호를 받는다. 워크샵 실행기는 여기서 예상 결과를 먼저 보여 주고 진행을 멈춘다.
// extras 를 켜면 기존 흐름 뒤에 참조 구현의 대량 지급 기능 두 가지를 더 실행한다(작업 기록 5절).
//   증명 하나짜리 일괄 지급(transfer-batch-16x32, 출력 32칸 고정), 중계자가 보내는 대리 인출(prepare-withdraw, relay-withdraw)
export async function runLocalVendorSettlement(opts: {
  evidenceDir: string; command: string; prebuiltDir?: string; beforeStage?: (stage: number) => Promise<void>; extras?: boolean;
}): Promise<string> {
  if (!fs.existsSync(path.join(CORE, ".git"))) {
    throw new Error("vendor/clairveil 이 없습니다. 먼저 pnpm setup:clairveil 을 실행하십시오.");
  }
  const stage = async (n: number) => { await opts.beforeStage?.(n); };

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const workDir = process.env.VENDOR_SETTLEMENT_WORK_DIR ?? path.join(ROOT, ".work", `vendor-${stamp}`);
  const chainId = process.env.CHAIN_ID ?? "vendor-settlement-local-1";
  const rpcPort = Number(process.env.RPC_PORT ?? 26657);
  const node = `tcp://127.0.0.1:${rpcPort}`;
  const home = path.join(workDir, "home");
  const out = path.join(workDir, "out");
  const coreSha = execFileSync("git", ["-C", CORE, "rev-parse", "HEAD"]).toString().trim();
  const prebuilt = opts.prebuiltDir && fs.existsSync(path.join(opts.prebuiltDir, "clairveil-commit.txt"))
    && fs.readFileSync(path.join(opts.prebuiltDir, "clairveil-commit.txt"), "utf8").trim() === coreSha
    ? opts.prebuiltDir : undefined;
  const binDir = prebuilt ?? workDir;
  const artifacts = path.join(binDir, "artifacts");
  const clairveild = path.join(binDir, "clairveild");
  const keyring = ["--keyring-backend", "test", "--home", home];
  const txFlags = ["--node", node, "--chain-id", chainId, "--gas-prices", "8500000000uclair", "--yes", "--output", "json"];
  const env: NodeJS.ProcessEnv = { ...process.env };

  const cli = async (args: string[]) => (await execFileP(clairveild, args, { env, maxBuffer: 64 * 1024 * 1024 })).stdout;
  const cliJson = async (args: string[]): Promise<Json> => JSON.parse(await cli(args));
  const save = (name: string, data: unknown) => fs.writeFileSync(path.join(out, name), typeof data === "string" ? data : JSON.stringify(data, null, 2));
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // 같은 포트에 이전 노드가 살아 있으면 CLI 가 옛 체인에 붙는다. 시작 전에 확인한다.
  const portInUse = await new Promise<boolean>((resolve) => {
    const s = net.connect(rpcPort, "127.0.0.1", () => { s.destroy(); resolve(true); });
    s.on("error", () => resolve(false));
  });
  if (portInUse) {
    throw new Error(`127.0.0.1:${rpcPort} 를 이미 다른 프로세스가 쓰고 있습니다. 이전 로컬 노드를 끄거나 RPC_PORT 를 바꾸십시오.`);
  }

  async function waitTx(hash: string): Promise<Json> {
    for (let i = 0; i < 60; i++) {
      try {
        return await cliJson(["query", "tx", hash, "--node", node, "--output", "json"]);
      } catch {
        await sleep(2000);
      }
    }
    throw new Error(`tx 가 블록에 들어가지 않았습니다: ${hash}`);
  }

  // 이름을 붙여 tx 를 보내고, 응답과 블록 조회 결과를 out/<이름>*.json 으로 남긴다.
  async function submit(name: string, args: string[], { allowFail = false } = {}): Promise<Json> {
    const res = await cliJson([...args, ...txFlags]);
    save(`${name}.json`, res);
    const q = await waitTx(res.txhash);
    save(`${name}-query.json`, q);
    console.log(`  ${name}  ${res.txhash}  높이 ${q.height}  code ${q.code ?? 0}`);
    if ((q.code ?? 0) !== 0 && !allowFail) throw new Error(`${name} 실패 (code ${q.code}): ${q.raw_log}`);
    return q;
  }

  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(out, { recursive: true });
  console.log(`작업 폴더: ${workDir}`);

  await stage(1);
  if (prebuilt) {
    console.log(`1) 미리 빌드한 바이너리와 회로 산출물을 씁니다: ${path.relative(ROOT, prebuilt)}`);
  } else {
    console.log("1) 바이너리 빌드와 회로 산출물 생성");
    buildClairveil(workDir, out);
  }
  env.CLAIRVEIL_PRIVACY_ZK_ARTIFACT_DIR = artifacts;

  await stage(2);
  console.log("2) 역할 키와 체인 초기화 (감사 키는 auditor 의 공개키)");
  const roles = opts.extras ? ["buyer", "supplier-a", "supplier-b", "auditor", "relayer"] : ["buyer", "supplier-a", "supplier-b", "auditor"];
  const address: Record<string, string> = {};
  for (const who of roles) {
    save(`${who}-key.json`, await cli(["keys", "add", who, ...keyring, "--output", "json"]));
    address[who] = (await cli(["keys", "show", "-a", who, ...keyring])).trim();
    save(`${who}-address.txt`, address[who] + "\n");
  }
  const auditorDisclosure = await cliJson(["tx", "privacy", "show-disclosure-pubkey", "--from", "auditor", ...keyring, "--output", "json"]);
  await cli(["init", "local", "--chain-id", chainId, "--home", home]);
  for (const who of roles) await cli(["add-genesis-account", who, "100000000000000000000uclair", ...keyring]);
  await cli(["gentx", "buyer", "9000000000000000000uclair", "--chain-id", chainId, ...keyring]);
  await cli(["collect-gentxs", "--home", home]);
  const genesisPath = path.join(home, "config/genesis.json");
  const genesis = JSON.parse(fs.readFileSync(genesisPath, "utf8"));
  genesis.app_state.privacy.audit_master_pubkey = Buffer.from(auditorDisclosure.public_key_hex, "hex").toString("base64");
  genesis.app_state.privacy.audit_key_id = "master";
  genesis.app_state.privacy.audit_key_epoch = "1";
  fs.writeFileSync(genesisPath, JSON.stringify(genesis, null, 2));
  await cli(["validate", "--home", home]);
  for (const line of fs.readFileSync(path.join(artifacts, "privacy_zk_checksums.env"), "utf8").split("\n")) {
    const m = line.match(/^(?:export\s+)?([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  env.CLAIRVEIL_PRIVACY_ZK_PREFLIGHT_MODE = "strict";

  await stage(3);
  console.log("3) 체인 시작");
  // 바이너리를 직접 자식 프로세스로 띄운다. 끝날 때 이 프로세스를 끈다.
  const logFd = fs.openSync(path.join(workDir, "clairveild.log"), "w");
  // RPC_PORT 를 바꾸면 P2P, gRPC, API 포트도 같은 차이만큼 옮겨, 다른 로컬 노드와 겹치지 않게 한다.
  const shift = rpcPort - 26657;
  const chain = spawn(clairveild, [
    "start", "--home", home, "--minimum-gas-prices", "0uclair",
    "--rpc.laddr", `tcp://127.0.0.1:${rpcPort}`, "--p2p.laddr", `tcp://127.0.0.1:${26656 + shift}`,
    "--grpc.address", `localhost:${9090 + shift}`, "--api.address", `tcp://localhost:${1317 + shift}`,
  ], { env, stdio: ["ignore", logFd, logFd] });
  // 실행기가 비정상 종료해 노드가 남으면 pnpm b:reset 이 이 파일로 찾아 끈다.
  fs.writeFileSync(path.join(workDir, "clairveild.pid"), `${chain.pid}\n`);
  const stopChain = () => { if (chain.exitCode === null) chain.kill(); };
  process.on("exit", stopChain);
  process.on("SIGINT", () => { stopChain(); process.exit(130); });
  for (let i = 0; i < 30; i++) {
    try {
      const status = await cliJson(["status", "--node", node]);
      if (Number(status.sync_info.latest_block_height) >= 1) break;
    } catch { /* 노드가 아직 응답하지 않는다 */ }
    await sleep(1000);
  }

  const shielded: Record<string, string> = {};
  for (const who of ["supplier-a", "supplier-b"]) {
    const r = await cliJson(["tx", "privacy", "show-address", "--from", who, ...keyring, "--output", "json"]);
    save(`${who}-shielded.json`, r);
    shielded[who] = r.address;
  }
  const supplierBPub = (await cliJson(["tx", "privacy", "show-disclosure-pubkey", "--from", "supplier-b", ...keyring, "--output", "json"])).public_key_hex;
  const privacyTx = (...args: string[]) => ["tx", "privacy", ...args];
  const notes = async (who: string, file: string) => save(file, await cli(privacyTx("list-notes", "--from", who, ...keyring, "--node", node, "--json")));

  await stage(4);
  console.log("4) 구매 기업이 대금 재원을 차폐 풀에 넣는다 (송장 12, 8, 15 와 짝이 될 0 노트 셋)");
  // 전송 하나는 입력 노트 두 개를 쓴다. 노트 하나로 보낼 때는 0 노트를 짝으로 둔다.
  for (const amount of [12, 8, 15]) await submit(`deposit-${amount}`, privacyTx("deposit", `${amount}uclair`, "--from", "buyer", ...keyring, "--gas", "2500000"));
  for (const i of [1, 2, 3]) await submit(`deposit-zero-${i}`, privacyTx("deposit", "0uclair", "--from", "buyer", ...keyring, "--gas", "2500000"));
  await notes("buyer", "buyer-notes-before.json");

  await stage(5);
  console.log("5) 정산일: 협력사 A 에 송장 두 건을 한 tx 로 지급 (금액과 상대 모두 비공개)");
  const payA = await submit("pay-supplier-a", privacyTx("transfer-batch", shielded["supplier-a"], "12uclair", "8uclair", "--from", "buyer", ...keyring, "--gas", "20000000"));

  await stage(6);
  console.log("6) 정산일: 협력사 B 에 송장 한 건 지급. 금액, 보낸 쪽, 받는 쪽을 B 만 풀 수 있게 암호화");
  const payB = await submit("pay-supplier-b", privacyTx("transfer", shielded["supplier-b"], "15uclair",
    "--privacy-policy", "amount-from-to", "--disclosure-mode", "recipient-encrypted", "--disclosure-pubkey", supplierBPub,
    "--from", "buyer", ...keyring, "--gas", "10000000"));

  await stage(7);
  console.log("7) 협력사가 자기 노트를 찾는다");
  await notes("supplier-a", "supplier-a-notes.json");
  await notes("supplier-b", "supplier-b-notes.json");

  await stage(8);
  console.log("8) 각자 볼 수 있는 것을 푼다");
  const decode = (source: string[], plane: string, who: string) =>
    cli(privacyTx("decode-transfer-disclosure", ...source, "--disclosure-plane", plane, "--from", who, ...keyring, "--node", node, "--report"));
  save("pay-supplier-b-recipient-view.json", await decode(["--tx-hash", payB.txhash], "recipient", "supplier-b"));
  save("pay-supplier-b-audit-view.json", await decode(["--tx-hash", payB.txhash], "audit", "auditor"));
  save("pay-supplier-b-self-view.json", await decode(["--tx-hash", payB.txhash], "self-view", "buyer"));
  // --tx-hash 는 tx 의 첫 disclosure 만 푼다. 일괄 전송은 메시지마다 감사 암호문을 꺼내 직접 넘긴다.
  for (const [i, msg] of (payA.tx.body.messages as Json[]).entries()) {
    const hex = Buffer.from(msg.audit_disclosure_payload, "base64").toString("hex");
    save(`pay-supplier-a-audit-view-${i}.json`, await decode([hex], "audit", "auditor"));
  }

  await stage(9);
  console.log("9) 협력사 A 가 받은 12 를 투명 잔액으로 꺼낸다");
  const balances = () => cli(["query", "bank", "balances", address["supplier-a"], "--node", node, "--output", "json"]);
  save("supplier-a-balance-before.json", await balances());
  const withdrawArgs = privacyTx("withdraw", "12uclair", "--recipient", address["supplier-a"], "--from", "supplier-a", ...keyring, "--gas", "3500000");

  // 9a. 인출만 따로 보낸다. v0.4.0 에서는 실패가 예상된다. 실패도 기록으로 남긴다.
  //   인출은 트리에 잎을 더하지 않아 루트가 그대로다. 이벤트 색인은 현재 루트를 현재 블록 높이로
  //   등록하는데, 같은 루트가 이전 높이로 이미 등록돼 있으면 "re-registration is inconsistent" 로 거부한다
  //   (x/privacy/keeper/path_snapshot.go SetMerkleRootSnapshotV1).
  await submit("withdraw-alone", withdrawArgs, { allowFail: true });

  // 9b. 우회: 같은 블록에 잎을 더하는 tx(구매 기업의 0 노트 예치)를 함께 넣는다. 루트가 그 블록 높이로
  //   새로 등록되므로 인출의 재등록이 일관된다. 두 tx 를 동시에 보내고, 같은 블록에 들어가지 않으면 다시 시도한다.
  let withdrawn = false;
  for (let attempt = 1; attempt <= 3 && !withdrawn; attempt++) {
    const [dep, wd] = await Promise.all([
      cliJson([...privacyTx("deposit", "0uclair", "--from", "buyer", ...keyring, "--gas", "2500000"), ...txFlags]),
      cliJson([...withdrawArgs, ...txFlags]),
    ]);
    const [dq, wq] = await Promise.all([waitTx(dep.txhash), waitTx(wd.txhash)]);
    save(`cobl-deposit-${attempt}-query.json`, dq);
    save(`cobl-withdraw-${attempt}-query.json`, wq);
    console.log(`  시도 ${attempt}: 0 노트 예치 높이 ${dq.height} code ${dq.code ?? 0}, 인출 높이 ${wq.height} code ${wq.code ?? 0}`);
    if ((wq.code ?? 0) === 0) {
      save("cobl-deposit-query.json", dq);
      save("supplier-a-withdraw-query.json", wq);
      withdrawn = true;
    }
  }
  if (!withdrawn) throw new Error("같은 블록 우회로도 인출하지 못했습니다. out/cobl-withdraw-*-query.json 을 보십시오.");
  save("supplier-a-balance-after.json", await balances());
  await notes("supplier-a", "supplier-a-notes-after.json");
  save("reserve.json", await cli(["query", "privacy", "reserve", "uclair", "--node", node, "--output", "json"]));

  if (opts.extras) {
    console.log("추가 1) 증명 하나짜리 일괄 지급: 협력사 A 5, B 7, A 3 을 출력 32칸 고정으로");
    await submit("extra-deposit-30", privacyTx("deposit", "30uclair", "--from", "buyer", ...keyring, "--gas", "2500000"));
    const batchRes = await cliJson([...privacyTx("transfer-batch-16x32",
      "--payment", `${shielded["supplier-a"]},5uclair`, "--payment", `${shielded["supplier-b"]},7uclair`, "--payment", `${shielded["supplier-a"]},3uclair`,
      "--output-mode", "exact32", "--prepared-out", path.join(out, "extra-batch-prepared.json"), "--proof-out", path.join(out, "extra-batch-proof.json"),
      "--from", "buyer", ...keyring, "--gas", "40000000"), ...txFlags]);
    save("extra-batch.json", batchRes);
    const batchQ = await waitTx(batchRes.txhash ?? batchRes.tx_response?.txhash ?? batchRes.broadcast?.txhash);
    save("extra-batch-query.json", batchQ);
    console.log(`  extra-batch  ${batchQ.txhash}  높이 ${batchQ.height}  code ${batchQ.code ?? 0}`);
    await notes("supplier-b", "extra-supplier-b-notes.json");

    console.log("추가 2) 대리 인출: 협력사 B 가 7 을 인출 재료로 만들고 중계자가 보낸다(같은 블록에 0 노트 예치)");
    const payload = path.join(out, "extra-withdraw-payload.json");
    await cli(privacyTx("prepare-withdraw", "7uclair", "--recipient", address["supplier-b"], "--from", "supplier-b", ...keyring,
      "--node", node, "--chain-id", chainId, "--out", payload, "--output", "json"));
    let relayed = false;
    for (let attempt = 1; attempt <= 3 && !relayed; attempt++) {
      // 대리 인출은 증명을 새로 만들지 않아 예치보다 먼저 도착한다. 같은 블록 안에서도 인출이 먼저 실행되면
      // 루트가 바뀌기 전이라 실패한다(1차 시도 기록). 예치를 먼저 mempool 에 넣은 뒤 인출을 보낸다.
      const dep = await cliJson([...privacyTx("deposit", "0uclair", "--from", "buyer", ...keyring, "--gas", "2500000"), ...txFlags]);
      const rw = await cliJson([...privacyTx("relay-withdraw", payload, "--from", "relayer", ...keyring, "--gas", "3500000"), ...txFlags]);
      const [dq, rq] = await Promise.all([waitTx(dep.txhash), waitTx(rw.txhash)]);
      console.log(`  시도 ${attempt}: 0 노트 예치 높이 ${dq.height} code ${dq.code ?? 0}, 대리 인출 높이 ${rq.height} code ${rq.code ?? 0}`);
      save(`extra-relay-${attempt}-query.json`, rq);
      if ((rq.code ?? 0) === 0) { save("extra-relay-withdraw-query.json", rq); relayed = true; }
    }
    if (!relayed) console.log("  대리 인출이 세 번 모두 같은 블록에 들어가지 못했습니다. 기록에는 마지막 시도를 남깁니다.");
  }

  await stage(10);
  console.log("10) 기록 정리");
  const report = path.join(opts.evidenceDir, `vendor-settlement-${stamp}.md`);
  fs.mkdirSync(path.dirname(report), { recursive: true });
  writeReport({
    out, report, chainId, stamp, command: opts.command,
    coreSha,
    goVersion: execFileSync("go", ["version"]).toString().trim(),
  });
  stopChain();
  return report;
}
