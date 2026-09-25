// 테스트넷 전용 지갑 다섯 개를 만들어 레포 밖 파일에 저장한다.
//
//   pnpm setup:wallets
//
// 파일 위치는 MAROO_LAB_ENV, 없으면 ~/.config/maroo-integration-lab/testnet.env 다. 이미 있으면 덮어쓰지 않는다.
// 개인키는 파일에만 쓰고 화면에는 주소와 faucet 요청 명령만 출력한다.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const ROLES = [
  ["BUYER", "구매 기업. 금고를 배포하고 정책을 관리하고 대금을 넣는다"],
  ["ISSUER", "KYB 발급자. 스키마를 등록하고 증명을 발급하고 폐기한다"],
  ["SUPPLIER_A", "증명을 받는 협력사"],
  ["SUPPLIER_B", "증명이 없는 협력사"],
  ["UPGRADE_OWNER", "금고 프록시의 업그레이드 권한. 서명하지 않는다"],
] as const;

const file = process.env.MAROO_LAB_ENV ?? path.join(os.homedir(), ".config/maroo-integration-lab/testnet.env");
if (fs.existsSync(file)) {
  console.log(`${file} 이 이미 있어 그대로 둡니다.`);
} else {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const lines = ROLES.flatMap(([role]) => {
    const key = generatePrivateKey();
    return [`${role}_PRIVATE_KEY=${key}`, `${role}_ADDRESS=${privateKeyToAccount(key).address}`];
  });
  fs.writeFileSync(file, lines.join("\n") + "\n", { mode: 0o600 });
  console.log(`${file} 을 만들었습니다(권한 600).`);
}

const env = Object.fromEntries(
  fs.readFileSync(file, "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
console.log("");
for (const [role, desc] of ROLES) console.log(`${role.padEnd(14)} ${env[`${role}_ADDRESS`] ?? "(없음)"}  ${desc}`);
console.log("\n구매 기업과 KYB 발급자에게 테스트넷 OKRW 를 받습니다(한 번에 5,000 tOKRW):");
for (const role of ["BUYER", "ISSUER"]) {
  console.log(`curl -X POST https://faucet.maroo.io/api/agent/sendToken -H 'content-type: application/json' -d '{"address":"${env[`${role}_ADDRESS`]}","chain":"MAROO_TESTNET"}'`);
}
