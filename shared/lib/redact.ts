// 비공개로 둘 주소(카카오 인증 전용 지갑)를 기록에 넣기 전에 가린다. 16진(0x, 대소문자, 32바이트 패딩)과
// bech32(노드 메시지에 나오는 Cosmos 형식, 접두사는 가리지 않음) 두 꼴을 모두 찾는다.

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function convertBits(data: number[], from: number, to: number, pad: boolean): number[] {
  let acc = 0, bits = 0;
  const out: number[] = [], max = (1 << to) - 1;
  for (const v of data) {
    acc = (acc << from) | v;
    bits += from;
    while (bits >= to) { bits -= to; out.push((acc >> bits) & max); }
  }
  if (pad && bits > 0) out.push((acc << (to - bits)) & max);
  return out;
}

function polymod(values: number[]): number {
  const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((b >> i) & 1) chk ^= G[i];
  }
  return chk;
}
const hrpExpand = (hrp: string) => [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31)];

// 시험과 대조에 쓰는 bech32 인코딩(20바이트 주소)
export function bech32Encode(hrp: string, hexAddr: string): string {
  const bytes = hexAddr.replace(/^0x/i, "").match(/../g)!.map((h) => parseInt(h, 16));
  const data = convertBits(bytes, 8, 5, true);
  const mod = polymod([...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum = [0, 1, 2, 3, 4, 5].map((i) => (mod >> (5 * (5 - i))) & 31);
  return `${hrp}1${[...data, ...checksum].map((d) => CHARSET[d]).join("")}`;
}

// bech32 문자열이 담은 바이트(체크섬을 뺀 데이터). 형식이 맞지 않으면 undefined.
function bech32Bytes(s: string): string | undefined {
  const i = s.lastIndexOf("1");
  if (i < 1) return undefined;
  const data = [...s.slice(i + 1).toLowerCase()].map((c) => CHARSET.indexOf(c));
  if (data.length < 7 || data.some((d) => d < 0)) return undefined;
  const bytes = convertBits(data.slice(0, -6), 5, 8, false);
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function redactAddress(text: string, hexAddr: string): string {
  const hex = hexAddr.replace(/^0x/i, "").toLowerCase();
  let out = text.replace(new RegExp(`(?:0x)?(?:0{24})?${hex}`, "ig"), "(비공개)");
  out = out.replace(/\b[a-z]{1,20}1[02-9ac-hj-np-z]{38,}\b/g, (m) => (bech32Bytes(m) === hex ? "(비공개)" : m));
  return out;
}
