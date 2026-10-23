// 레시피 명령(a:*, c:*)이 실패했을 때 Node 스택 대신 이유와 다음 할 일을 보여 준다.
// 레시피 파일 맨 위에서 installRecipeErrors() 를 부르면, 최상위 await 에서 난 오류까지 여기서 받는다.
// 전체 오류와 스택은 DEBUG=1 로 다시 실행하면 보인다.

export type Failure = { kind: "network" | "balance" | "wallet" | "guided" | "not-found" | "other"; reason: string; next: string; details?: string[] };

const NETWORK = /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|socket hang up|HTTP request failed|The request took too long/i;
const BALANCE = /insufficient (funds|balance)|잔액이 부족/i;
const WALLET = /_(ADDRESS|PRIVATE_KEY) 가 없습니다/;

function textOf(err: unknown): string {
  const parts: string[] = [];
  let e: unknown = err;
  for (let depth = 0; e && depth < 5; depth++) {
    const x = e as { name?: string; message?: string; code?: string; cause?: unknown };
    parts.push([x.name, x.code, x.message].filter(Boolean).join(" "));
    e = x.cause;
  }
  return parts.join("\n");
}

const firstLine = (err: unknown) => String((err as { message?: string })?.message ?? err).split("\n")[0];
// 첫 줄 뒤에 레시피가 적은 줄. 스택 줄(at ...)은 뺀다.
const restLines = (err: unknown) => String((err as { message?: string })?.message ?? err).split("\n").slice(1).filter((l) => l.trim() && !/^\s+at /.test(l));

export function explainFailure(err: unknown, ctx: { rpc: string }): Failure {
  const text = textOf(err);
  if (WALLET.test(text)) {
    return { kind: "wallet", reason: firstLine(err), next: "역할 지갑 파일이 없으면 pnpm setup:wallets 로 만듭니다. 다른 파일을 쓰려면 MAROO_LAB_ENV 로 경로를 지정합니다." };
  }
  if (BALANCE.test(text)) {
    const own = /잔액이 부족/.test(firstLine(err));
    return {
      kind: "balance",
      reason: own ? firstLine(err) : "보내는 지갑의 테스트넷 OKRW가 부족합니다.",
      next: "README 실행 절 4단계의 faucet 명령으로 구매 기업과 발급자 지갑에 OKRW를 받은 뒤 다시 실행합니다. 잔액은 pnpm b:check 로 확인합니다.",
    };
  }
  if (NETWORK.test(text)) {
    return {
      kind: "network",
      reason: `테스트넷 RPC(${ctx.rpc})에 연결하지 못했습니다.`,
      next: "네트워크를 확인한 뒤 같은 명령을 다시 실행합니다. 다른 RPC 주소를 쓰려면 MAROO_RPC_URL 을 지정합니다.",
    };
  }
  // tx 해시를 이 RPC 에서 찾지 못함(오타, 다른 네트워크의 tx, 아직 블록에 들어가지 않은 tx)
  if (/TransactionNotFoundError|TransactionReceiptNotFoundError/.test((err as Error)?.name ?? "") || /Transaction (receipt )?with hash .* could not be found/i.test(text)) {
    return {
      kind: "not-found",
      reason: `${firstLine(err).replace(/\.$/, "")}(RPC ${ctx.rpc}).`,
      next: "해시를 다시 확인합니다. 다른 네트워크의 tx 면 MAROO_RPC_URL 을 그 네트워크의 RPC 로 지정하고, 방금 보낸 tx 면 블록에 들어갈 때까지 몇 초 기다린 뒤 다시 실행합니다.",
    };
  }
  // 레시피가 직접 던진 오류가 할 일까지 적었으면 그 안내를 따르게 한다
  if ([firstLine(err), ...restLines(err)].some((l) => /하십시오\.?\s*/.test(l))) {
    return { kind: "guided", reason: firstLine(err), next: "위 안내대로 한 뒤 다시 실행합니다.", details: restLines(err) };
  }
  return { kind: "other", reason: firstLine(err), next: "같은 명령을 DEBUG=1 로 다시 실행하면 전체 오류와 스택이 보입니다." };
}

export function installRecipeErrors(ctx: { rpc: string }) {
  const handle = (err: unknown) => {
    const f = explainFailure(err, ctx);
    console.error(`\n실패: ${f.reason}`);
    for (const line of f.details ?? []) console.error(`  ${line}`);
    console.error(`다음 할 일: ${f.next}`);
    if (process.env.DEBUG) console.error(err);
    process.exit(1);
  };
  process.on("uncaughtException", handle);
  process.on("unhandledRejection", handle);
}
