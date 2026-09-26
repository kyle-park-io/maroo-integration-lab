// 워크샵 사전 준비(pre-work). 워크샵 전에 한 번 실행한다. 이 머신에서 2분 안팎 걸렸다(빌드 108초).
//
//   pnpm b:prepare
//
// 하는 일은 pnpm bootstrap 과 같다(shared/bootstrap.ts). Clairveil 고정 커밋, 금고 컴파일,
// Clairveil 바이너리와 회로 산출물, 역할 지갑을 준비하고, 진행자에게 보낼 구매 기업 주소를 출력한다.

import { bootstrap } from "../../shared/bootstrap.ts";

bootstrap();
console.log("\n진행자에게 위 BUYER 주소를 보내 테스트넷 OKRW 배분(pnpm b:fund)을 요청하십시오. 그다음 pnpm b:check 로 확인합니다.");
