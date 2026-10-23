// 레퍼런스 앱의 실패 시험용 RPC 프록시. Maroo 테스트넷 RPC 앞에 두고, 사전 검사와 보내기에서 RPC 장애를 일으킨다. [Live Testnet]
//
//   node track-c-activate/agent-limit-app/test-rpc-proxy.ts            # http://127.0.0.1:8546
//   MAROO_RPC_URL=http://127.0.0.1:8546 AGENT_APP_PORT=5176 pnpm c:app
//   curl -d '{"send":"drop"}' http://127.0.0.1:8546/mode                # 모드 바꾸기
//
// 모드
//   estimate: "429"           eth_estimateGas 에 HTTP 429 를 돌려준다(RPC 가 사전 검사에 답하지 않음)
//   send: "drop"              eth_sendRawTransaction 을 노드에 넘기지 않고 연결을 끊는다(노드에 닿지 않음)
//   send: "forward-drop"      노드에 넘긴 뒤 응답 전에 연결을 끊는다(노드는 받았지만 앱은 모름)
//   "pass"                    그대로 넘긴다
import http from "node:http";
const UP = process.env.UPSTREAM_RPC_URL ?? "https://rpc-testnet.maroo.io";
let mode = { estimate: "pass", send: "pass" };
http.createServer(async (req, res) => {
  let s = ""; for await (const c of req) s += c;
  if (req.url === "/mode") { mode = { ...mode, ...JSON.parse(s) }; res.end(JSON.stringify(mode)); console.log("mode", mode); return; }
  const j = JSON.parse(s);
  const methods = (Array.isArray(j) ? j : [j]).map((x: { method: string }) => x.method);
  if (methods.includes("eth_estimateGas") && mode.estimate === "429") { res.writeHead(429); res.end("rate limited"); console.log("429 estimate"); return; }
  if (methods.includes("eth_sendRawTransaction") && mode.send === "drop") { console.log("drop send (not forwarded)"); req.socket.destroy(); return; }
  const r = await fetch(UP, { method: "POST", headers: { "content-type": "application/json" }, body: s });
  const t = await r.text();
  if (methods.includes("eth_sendRawTransaction") && mode.send === "forward-drop") { console.log("forwarded send, then drop:", t.slice(0, 120)); req.socket.destroy(); return; }
  res.writeHead(r.status, { "content-type": "application/json" }); res.end(t);
}).listen(8546, "127.0.0.1", () => console.log("proxy 8546"));
