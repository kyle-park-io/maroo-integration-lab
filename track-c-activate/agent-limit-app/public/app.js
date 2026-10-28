// 에이전트 한도 결제 화면. 서버(/api/*)만 부르고, 키와 서명은 서버에 있다.

const $ = (id) => document.getElementById(id);
let current = null;
let freshId = null;

const timeText = (iso) => new Date(iso).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit", second: "2-digit" });
const num = (s) => Number(String(s).replace(/,/g, ""));
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

async function api(path, body) {
  const res = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
  let data = {};
  try { data = await res.json(); } catch { /* 빈 응답 */ }
  if (!res.ok) throw Object.assign(new Error(data.error || `서버가 응답하지 않았어요(HTTP ${res.status}). 서버 창을 확인해 주세요.`), { network: data.network });
  return data;
}

function setBusy(btn, busy, label) {
  if (busy) { btn.dataset.label = btn.textContent; btn.textContent = label; btn.disabled = true; }
  else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
}
function say(el, text, bad = false) { el.textContent = text; el.classList.toggle("bad", bad); }

async function load(note) {
  try {
    current = await api("/api/state");
    $("banner").hidden = true;
    render(current);
    if (note) say(note, `${timeText(new Date().toISOString())}에 다시 읽었어요.`);
  } catch (e) {
    $("conn").textContent = "Maroo 테스트넷에 연결하지 못했습니다.";
    say($("banner-text"), e.message, true);
    $("banner").hidden = false;
    if (note) say(note, e.message, true);
  }
}

function render(s) {
  $("conn").textContent = `Maroo 테스트넷(chain ID ${s.network.chainId})에 연결했습니다.`;
  $("agent-id").textContent = `#${s.agentId}`;
  $("bal-owner").textContent = `${s.balances.owner} OKRW`;
  $("bal-agent").textContent = `${s.balances.agent} OKRW`;

  const note = $("limit-note");
  document.querySelector(".limit-num").classList.toggle("state", s.limit.kind !== "ok");
  if (s.limit.kind === "ok") {
    $("limit-value").textContent = s.limit.okrw;
    say(note, "에이전트 한 번의 결제가 이 금액을 넘으면 PCL이 거절합니다.");
  } else if (s.limit.kind === "invalid") {
    $("limit-value").textContent = "형식 오류";
    say(note, `${s.limit.reason}. 이대로면 모든 결제가 거절돼요. 한도를 다시 저장해 주세요.`, true);
  } else {
    $("limit-value").textContent = "없음";
    say(note, "저장된 한도가 없습니다. 한도를 저장해 주세요.", true);
  }
  drawRuler(s);
  drawPending(s);
  drawSlips(s);
  drawFacts(s);
}

function drawRuler(s) {
  const lastPay = s.log.find((e) => e.kind === "pay");
  const limit = s.limit.kind === "ok" ? num(s.limit.okrw) : null;
  const req = lastPay ? num(lastPay.amount) : null;
  const max = Math.max(limit ?? 0, req ?? 0, 1) * 1.25;
  const lim = $("ruler-limit"), bar = $("ruler-req");
  lim.hidden = limit === null;
  if (limit !== null) lim.style.left = `${(limit / max) * 100}%`;
  bar.style.width = req === null ? "0" : `${(req / max) * 100}%`;
  const over = limit !== null && req !== null && req > limit;
  bar.classList.toggle("over", over);
  if (over) bar.style.setProperty("--cut", `${(limit / req) * 100}%`);
  const cap = $("ruler-cap");
  if (req === null) cap.textContent = "결제를 요청하면 금액이 한도 자 위에 표시됩니다.";
  else if (limit === null) cap.textContent = `마지막 요청(${lastPay.amount} OKRW)을 견줄 한도가 없습니다.`;
  else cap.textContent = over
    ? `마지막 요청(${lastPay.amount} OKRW)이 한도(${s.limit.okrw} OKRW)를 넘었습니다. 빨간 막대가 넘은 금액입니다.`
    : `마지막 요청(${lastPay.amount} OKRW)은 한도(${s.limit.okrw} OKRW) 안입니다.`;
}

function drawPending(s) {
  const p = s.pending;
  $("pay-form").hidden = !!p;
  $("pending").hidden = !p;
  if (!p) return;
  const entry = s.log.find((e) => e.id === p.id);
  $("pending-text").textContent = entry ? entry.body : "보낸 결제의 결과를 아직 확인하지 못했어요. 결제 기록 다시 읽기를 눌러 주세요.";
  $("pending-link").href = `${s.network.explorer}/tx/${p.tx}`;
}

const WHAT = {
  pay: (e) => `협력사 A 몫 ${e.amount} OKRW 결제 요청`,
  limit: (e) => (e.format === "string" ? `한도 ${e.amount} OKRW를 숫자 문자열로 저장` : `한도 ${e.amount} OKRW 저장`),
  topup: (e) => `에이전트 지갑에 ${e.amount} OKRW 넣기`,
};
const TX_LINK = { pay: "이 결제 거래를 블록 탐색기에서 보기", limit: "한도 저장 거래를 블록 탐색기에서 보기", topup: "충전 거래를 블록 탐색기에서 보기" };
const STAMP = { "승인": "ok", "완료": "ok", "거절": "no", "실패": "no", "확인 중": "wait", "보내지 않음": "plain", "다시 읽음": "plain" };

function drawSlips(s) {
  const list = $("slips");
  list.replaceChildren();
  $("empty").hidden = s.log.length > 0;
  s.log.forEach((e, i) => {
    const li = document.createElement("li");
    li.className = `slip${e.id === freshId ? " fresh" : ""}`;
    const stub = document.createElement("div");
    stub.className = "slip-stub";
    const no = document.createElement("b");
    no.textContent = String(e.id);
    stub.append(no, timeText(e.at));
    const body = document.createElement("div");
    body.className = "slip-body";
    const what = document.createElement("p");
    what.className = "slip-what";
    what.textContent = WHAT[e.kind](e);
    const text = document.createElement("p");
    text.className = "slip-text";
    text.textContent = e.body;
    body.append(what, text);
    const meta = document.createElement("p");
    meta.className = "slip-meta";
    // 확인 중인 결제의 거래 링크는 위 안내에, 다시 읽은 결제의 링크는 결과 전표에 하나만 둔다.
    // 블록에 들어가지 않은 결제(dropped)는 탐색기에서 찾을 수 없어 링크를 두지 않는다.
    if (e.tx && !(s.pending && s.pending.tx === e.tx) && e.stamp !== "다시 읽음" && e.outcome !== "dropped") {
      const a = document.createElement("a");
      a.href = `${s.network.explorer}/tx/${e.tx}`; a.target = "_blank"; a.rel = "noopener";
      a.textContent = TX_LINK[e.kind];
      meta.append(a);
    }
    if (e.gas) { const g = document.createElement("span"); g.textContent = `가스 한도 직접 입력(${Number(e.gas).toLocaleString("en-US")})`; meta.append(g); }
    if (e.receiptMs !== undefined) { const r = document.createElement("span"); r.textContent = `영수증까지 ${(e.receiptMs / 1000).toFixed(1)}초`; meta.append(r); }
    if (meta.childNodes.length) body.append(meta);
    // 다음 할 일 버튼은 가장 최근 전표에만 둔다. 확인 중이면 위의 다시 읽기 버튼이 맡는다.
    if (i === 0 && e.next && e.next.action !== "recheck" && !s.pending) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "btn slip-next"; b.textContent = e.next.label;
      b.addEventListener("click", () => nextAction(e.next.action));
      body.append(b);
    }
    const stampBox = document.createElement("div");
    stampBox.className = "slip-stamp";
    const st = document.createElement("span");
    st.className = `stamp ${STAMP[e.stamp] ?? "plain"}`;
    st.textContent = e.stamp;
    stampBox.append(st);
    li.append(stub, body, stampBox);
    list.append(li);
  });
}

function drawFacts(s) {
  const dl = $("facts");
  dl.replaceChildren();
  const link = (addr) => { const a = document.createElement("a"); a.href = `${s.network.explorer}/address/${addr}`; a.target = "_blank"; a.rel = "noopener"; a.textContent = addr; return a; };
  const rows = [
    ["에이전트 ID", `#${s.agentId}`],
    ["소유자(구매 기업 지갑)", link(s.owner)],
    ["에이전트 지갑", link(s.agent)],
    ["정산 금고(PCL 프록시)", link(s.vault)],
    ["금고 fund()에 묶인 정책", s.fundPolicies.length ? s.fundPolicies.join(", ") : "없음. pnpm c:agent-limit 를 다시 실행해 주세요."],
    ["금고의 구매자 지갑", s.vaultBuyerIsAgent ? "에이전트 지갑과 같습니다" : "에이전트 지갑과 다릅니다. 결제는 금고 코드가 거절합니다."],
    ["기준 기록", s.recordFile],
  ];
  for (const [k, v] of rows) {
    const dt = document.createElement("dt"); dt.textContent = k;
    const dd = document.createElement("dd"); dd.append(v);
    dl.append(dt, dd);
  }
}

function nextAction(action) {
  if (action === "raise-limit" || action === "save-limit") { $("limit-input").focus(); $("limit-input").scrollIntoView({ block: "center" }); }
  if (action === "topup") { $("topup-input").focus(); $("topup-input").scrollIntoView({ block: "center" }); }
  if (action === "retry") { $("gas-input").value = ""; $("pay-input").focus(); }
}

async function submit(btn, msg, busyLabel, path, payload) {
  setBusy(btn, true, busyLabel);
  say(msg, "");
  try {
    const entry = await api(path, payload);
    if (entry && entry.id) freshId = entry.id;
    if (entry && entry.message) say(msg, entry.message);
  } catch (e) {
    say(msg, e.message, true);
  } finally {
    setBusy(btn, false);
    await load();
  }
}

$("pay-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  submit($("pay-btn"), $("pay-msg"), "PCL 사전 검사하고 보내는 중", "/api/pay", { amount: $("pay-input").value, gas: $("gas-input").value });
});
$("limit-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  submit($("limit-btn"), $("limit-msg"), "한도 저장하는 중", "/api/limit", { amount: $("limit-input").value, format: "uint256" });
});
$("limit-legacy").addEventListener("click", () => {
  submit($("limit-btn"), $("limit-msg"), "숫자 문자열로 저장하는 중", "/api/limit", { amount: $("limit-input").value, format: "string" });
});
$("topup-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  submit($("topup-btn"), $("topup-msg"), "에이전트 지갑에 넣는 중", "/api/topup", { amount: $("topup-input").value });
});
$("recheck-btn").addEventListener("click", async () => {
  const btn = $("recheck-btn");
  setBusy(btn, true, "다시 읽는 중");
  try {
    const r = await api("/api/recheck", {});
    const text = `${timeText(r.checkedAt ?? new Date().toISOString())}에 다시 확인했어요. ${r.message}`;
    if (r.cleared) {
      // 결과가 나왔으면 확인 중 상자를 바로 닫고 결과를 결제 칸에 쓴다. 상태를 다시 읽는 동안 옛 안내가 결과와 함께 보이지 않는다.
      $("pending").hidden = true;
      $("pay-form").hidden = false;
      say($("recheck-msg"), "");
      say($("pay-msg"), text);
    } else {
      say($("recheck-msg"), text);
    }
  } catch (e) {
    say($("recheck-msg"), e.message, true);
  } finally {
    setBusy(btn, false);
    await load();
  }
});
$("reload-btn").addEventListener("click", async () => { setBusy($("reload-btn"), true, "다시 읽는 중"); await load($("reload-msg")); setBusy($("reload-btn"), false); });
$("banner-retry").addEventListener("click", () => load());

load();
