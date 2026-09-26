// 워크샵 4단계: 결과를 무엇이 막았는지로 넷으로 나눈다. 체인을 부르지 않는 순수 함수라 단위 테스트가 덮는다.
//   정책 거부        PCL 규칙이 막음(사유 코드가 PCL 오류)
//   증명·입력 거부   요청이나 증명의 형식이 막음(SDK, Privacy 요청 오류)
//   인프라·자료 부재 필요한 서비스, 자료, 잔액이 없음

const POLICY = /^(AnyOfRejected|Eas[A-Za-z]*|Exceeded[A-Za-z]*|InDenylist|Volume(Above|Below)[A-Za-z]*|AgentTransferLimit[A-Za-z]*)\b/;
const INPUT = /^(SDKInvalid[A-Za-z]*|Privacy[A-Za-z]*|InvalidAmount|InvalidAddress)\b/;

export type Outcome = "성공" | "정책 거부" | "증명·입력 거부" | "인프라·자료 부재";

export function classify(outcome: string): Outcome {
  if (outcome === "통과") return "성공";
  if (POLICY.test(outcome)) return "정책 거부";
  if (INPUT.test(outcome)) return "증명·입력 거부";
  return "인프라·자료 부재";
}
