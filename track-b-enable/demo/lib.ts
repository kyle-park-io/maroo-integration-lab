// 워크숍 실행기(b:check, b:prepare, b:fund, b:step, b:reset, b:smoke)가 함께 쓰는 안내 문구와 도구.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { ROOT } from "../../shared/lib/paths.ts";

export const LIVE_DIR = path.join(ROOT, "track-b-enable/evidence/live");
export const LOCAL_DIR = path.join(ROOT, "track-b-enable/evidence/local");
export const PREBUILT_DIR = path.join(ROOT, ".work/prebuilt");

// 트러블슈팅 번호. 본문은 track-b-enable/troubleshooting.md 에 같은 번호로 있다.
export const TROUBLE: Record<string, string> = {
  T1: "Node.js 버전이 24보다 낮음",
  T2: "Go가 없거나 1.25보다 낮음",
  T3: "vendor/clairveil 이 없거나 고정 커밋과 다름",
  T4: "127.0.0.1:26657 을 다른 프로세스가 씀",
  T5: "테스트넷 RPC에 닿지 않거나 chain ID가 다름",
  T6: "역할 지갑 파일이 없음",
  T7: "테스트넷 OKRW 잔액 부족, faucet 실패",
  T8: "증명을 발급했는데 청구가 EasNoAttestationReceived나 EasAttestationRevoked로 거부됨",
  T9: "금고 컴파일 결과가 없거나 deployPclProxy가 되돌려짐",
  T10: "로컬 인출이 merkle root snapshot 오류로 실패",
};
export const trouble = (id: string) => `트러블슈팅 ${id}(${TROUBLE[id]}): track-b-enable/troubleshooting.md#${id.toLowerCase()}`;

export const noPause = process.argv.includes("--no-pause") || !!process.env.B_NO_PAUSE || !process.stdin.isTTY;

// 진행자가 설명할 시간을 주려고 단계마다 멈춘다. --no-pause 나 비대화 실행에서는 멈추지 않는다.
export async function pause(message = "계속하려면 Enter") {
  if (noPause) return;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(`  ⏎ ${message} `);
  rl.close();
}

export type Stage = { title: string; expect: string; success: string };

export function announce(label: string, s: Stage) {
  console.log(`\n── ${label}. ${s.title}`);
  console.log(`   예상 결과: ${s.expect}`);
  console.log(`   성공 기준: ${s.success}`);
}

export function newest(dir: string, prefix: string): string | undefined {
  if (!fs.existsSync(dir)) return undefined;
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(prefix)).sort();
  return files.length ? path.join(dir, files[files.length - 1]) : undefined;
}

// 2단계(테스트넷 금고)의 하위 단계. shared/lib/kyb-gate.ts 의 단계 번호와 같다.
export const STEP2: Record<string, Stage> = {
  "0": { title: "구매 기업 잔액 확인", expect: "잔액이 1,000 OKRW 이상", success: "시작 잔액이 기록됨. 부족하면 진행자에게 b:fund 를 요청" },
  "1": { title: "일반 OKRW 이체(가스 보충)", expect: "협력사 A, B와 발급자에게 60 OKRW씩. 이미 잔액이 있으면 건너뜀", success: "[성공] 줄과 탐색기 링크. 탐색기에서 보낸 주소, 받는 주소, 금액이 모두 보임" },
  "2": { title: "KYB 스키마 등록", expect: "스키마 `bytes32 bizRegNoHash, bool kybVerified` 등록 또는 재사용", success: "[성공] 또는 재사용 줄" },
  "3": { title: "금고 배포와 정책 바인딩", expect: "구현 배포, deployPclProxy(Transparent), claim() 에 EAS_POLICY", success: "금고 주소와 권한 줄에 policyAdmin(구매 기업)과 upgradeOwner(업그레이드 권한)가 서로 다름" },
  "4": { title: "협력사 몫 입금", expect: "협력사 A, B 몫 100 OKRW씩", success: "[성공] 두 줄. fund() 는 정책 대상이 아님" },
  "5": { title: "증명 없는 협력사 B의 청구", expect: "PCL이 거부", success: "[예상대로 거부] EasNoAttestationReceived(협력사 B 주소)" },
  "6": { title: "협력사 A 증명 발급, 색인 전 청구, 색인, 색인 뒤 청구", expect: "색인 전 거부, 색인 뒤 통과. 6b 사유는 처음이면 EasNoAttestationReceived, 같은 협력사 지갑으로 다시 실행하면 이전 실행의 폐기된 증명 때문에 EasAttestationRevoked", success: "6b [예상대로 거부], 6d [성공]과 협력사 A 잔액 100 증가" },
  "7": { title: "증명 폐기 뒤 청구", expect: "PCL이 거부", success: "[예상대로 거부] EasAttestationRevoked" },
  "8": { title: "남은 몫 회수", expect: "구매 기업이 협력사 A, B 몫을 돌려받음", success: "owedA 0, owedB 0" },
};

// 3단계(로컬 차폐 흐름)의 하위 단계. shared/lib/local-vendor-settlement.ts 의 단계 번호와 같다.
export const STEP3: Record<number, Stage> = {
  1: { title: "바이너리와 회로 산출물", expect: "b:prepare 로 만든 것을 재사용", success: "\"미리 빌드한 바이너리\" 줄. 없으면 빌드에 3분 안팎" },
  2: { title: "역할 키 넷과 체인 초기화", expect: "구매 기업, 협력사 A, B, 감사인 키. 감사 공개키를 genesis에 넣음", success: "오류 없이 다음 단계로" },
  3: { title: "로컬 체인 시작", expect: "127.0.0.1:26657 에서 블록 생성", success: "다음 단계의 tx가 높이를 받음" },
  4: { title: "예치(deposit)", expect: "12, 8, 15와 0 노트 셋. 예치 금액과 보낸 계정은 공개", success: "여섯 줄 모두 code 0" },
  5: { title: "협력사 A 일괄 지급(transfer-batch)", expect: "송장 12, 8을 한 tx로. 금액과 받는 쪽은 비공개", success: "code 0" },
  6: { title: "협력사 B 지급(transfer, 수신자 암호화 disclosure)", expect: "송장 15. 금액, 보낸 쪽, 받는 쪽을 B의 공개키로 암호화", success: "code 0" },
  7: { title: "협력사 스캔", expect: "협력사가 자기 키로 노트를 찾음", success: "기록 2절에 A [8, 12], B [15]" },
  8: { title: "역할별 해독", expect: "B는 수신자 disclosure, 감사인은 감사 disclosure, 구매 기업은 self-view", success: "기록 2절에 verified=true" },
  9: { title: "협력사 A 인출(withdraw)", expect: "단독 인출은 v0.4.0에서 실패(code 1)하고, 같은 블록 우회가 성공", success: "\"시도 n: … 인출 … code 0\" 줄. 단독 실패는 예상된 결과" },
  10: { title: "기록 작성", expect: "track-b-enable/evidence/local/vendor-settlement-<시각>.md", success: "기록 경로가 출력됨" },
};

export const DISCUSSION = [
  "2단계에서 협력사 B의 청구를 거부한 것은 금고 코드인가요, PCL인가요? 어떻게 알 수 있나요?",
  "3단계에서 제3자는 협력사 A가 12를 받았다는 것을 알 수 있나요? 어느 tx에서, 어떤 값으로 알 수 있나요?",
  "감사인이 풀 수 있는 것과 협력사 B가 풀 수 있는 것은 어떻게 다른가요? 감사 비밀키는 누가 가져야 하나요?",
  "4단계의 SDKInvalidRequest는 정책 거부인가요? Maroo 테스트넷에서 3단계를 실행하려면 무엇이 더 필요한가요?",
  "3단계의 결과를 Maroo 테스트넷 성공으로 적으면 안 되는 이유는 무엇인가요?",
];
