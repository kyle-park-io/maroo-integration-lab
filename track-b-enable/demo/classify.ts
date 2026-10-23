// 워크샵 4단계: 결과를 무엇이 막았는지로 넷으로 나눈다. 넷은 B 트랙 목표가 정한 분류다.
//   성공             통과
//   정책 거부        PCL 규칙이 막음
//   증명·입력 거부   요청, 증명, 호출 내용(인자, 가스, 수수료)이 막음
//   인프라·자료 부재 필요한 잔액, 자료, 해석할 ABI 가 없음
// 계열은 거부 해석기(shared/lib/explain.ts)가 오류 선택자로 정한다. 체인을 부르지 않는 순수 함수라 단위 테스트가 덮는다.

import type { Family } from "../../shared/lib/explain.ts";

export type Outcome = "성공" | "정책 거부" | "증명·입력 거부" | "인프라·자료 부재";

const INPUT: Family[] = ["sdk", "privacy", "precompile-input", "contract", "error-string", "panic", "out-of-gas", "tx-level", "pcl-config"];

export function categoryOf(family: Family | undefined): Outcome {
  if (family === undefined) return "성공";
  if (family === "pcl-policy") return "정책 거부";
  if (INPUT.includes(family)) return "증명·입력 거부";
  return "인프라·자료 부재";
}
