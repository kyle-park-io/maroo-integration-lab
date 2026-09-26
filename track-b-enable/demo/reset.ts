// 워크샵 초기화. 남은 로컬 노드를 끄고 로컬 실행 폴더를 지운다.
//
//   pnpm b:reset            # 로컬 노드 종료, .work/vendor-* 삭제
//   pnpm b:reset --all      # 위에 더해 .work/prebuilt 도 삭제(다음 3단계에서 다시 빌드)
//
// 지갑 파일, vendor/, 기록(evidence/)은 건드리지 않는다. 테스트넷 상태는 되돌릴 수 없고,
// 2단계 금고에 남은 몫은 2단계의 8번 하위 단계에서 이미 회수된다.

import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../../shared/lib/paths.ts";
import { PREBUILT_DIR } from "./lib.ts";

const work = path.join(ROOT, ".work");
const runs = fs.existsSync(work) ? fs.readdirSync(work).filter((d) => d.startsWith("vendor-")) : [];
let stopped = 0;
for (const d of runs) {
  const pidFile = path.join(work, d, "clairveild.pid");
  if (!fs.existsSync(pidFile)) continue;
  const pid = Number(fs.readFileSync(pidFile, "utf8").trim());
  let cmd = "";
  try { cmd = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8"); } catch { /* 이미 끝난 프로세스 */ }
  // 같은 번호를 다른 프로세스가 쓰고 있을 수 있어, 이 레포의 clairveild 인지 확인하고 끈다.
  if (cmd.includes("clairveild") && cmd.includes(path.join(work, d))) {
    process.kill(pid);
    stopped++;
    console.log(`로컬 노드 종료: pid ${pid} (${d})`);
  }
}
for (const d of runs) fs.rmSync(path.join(work, d), { recursive: true, force: true });
console.log(`로컬 실행 폴더 ${runs.length}개 삭제, 노드 ${stopped}개 종료`);
if (process.argv.includes("--all")) {
  fs.rmSync(PREBUILT_DIR, { recursive: true, force: true });
  console.log(".work/prebuilt 삭제");
}
console.log("지갑 파일, vendor/, evidence/ 는 그대로입니다. 테스트넷 상태는 되돌리지 않습니다.");
