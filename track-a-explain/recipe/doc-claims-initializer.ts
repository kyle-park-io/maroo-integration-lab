// a:doc-claims 4번 판정. deployPclProxy 문서가 빈 초기화 데이터를 어떻게 안내하는지 문장으로 확인한다.
// 2026-10-23 정정: 제출 때는 문서 본문에 "0x" 글자가 있는지만 셌다. 2026-10-23 판은 "0x" 를 넘기면 되돌려진다는
// 예제 주석에 이 글자를 쓰므로, 글자 수로는 안내가 고쳐졌는지 가릴 수 없다.

export function initializerClaims(text: string) {
  return {
    // 2026-09-26 판: 「초기화가 필요 없으면 "0x"를 전달합니다」
    docsSaysPass0x: /초기화가\s*필요\s*없으면\s*`?"0x"/.test(text),
    // 2026-10-23 판: 「Transparent와 UUPS에서는 initializer를 비워 둘 수 없습니다」
    docsSaysCannotBeEmpty: /비워\s*둘\s*수\s*없/.test(text),
  };
}
