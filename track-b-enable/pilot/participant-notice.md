---
양식: notice
제목: 「Maroo에서 협력사 대금을 정산하는 워크샵」 사전 준비 안내
날짜: ○○○○. ○○. ○○.
발신: 워크샵 진행자 ○○○
---
워크샵에서 구매 기업이 협력사에 대금을 치르는 흐름을 Maroo 테스트넷과 Clairveil 로컬 체인에서 직접 실행합니다. 워크샵 전날까지 아래 준비를 마쳐 주시기 바랍니다. 준비에는 20분 안팎이 걸립니다.

## 개요

워크샵의 일시, 장소, 진행 시간과 실습 자료입니다.

| 구분 | 내용 |
| --- | --- |
| 일시 | ○○○○. ○○. ○○.(○) 14:00 \~ 15:15 |
| 장소 | ○○ |
| 진행 시간 | 75분, 다섯 단계 |
| 실습 자료 | github.com/kyle-park-io/maroo-integration-lab |

## 준비물

- 노트북(Linux 또는 WSL2). 확인한 운영체제는 Linux(WSL2)입니다. 디스크 여유 1GB가 필요합니다.
- 노트북에 설치할 도구와 확인 명령
    - Node.js 24 이상과 pnpm 11: `node --version`, `pnpm --version` (https://nodejs.org, https://pnpm.io)
    - Go 1.25 이상: `go version` (https://go.dev/dl)
    - Git, Foundry: `git --version`, `forge --version` (https://getfoundry.sh)

## 전날 할 일

- 실습 레포를 받고 준비 명령을 실행합니다. 이 머신에서 `pnpm b:prepare`는 108초 걸렸습니다.

```bash
git clone https://github.com/kyle-park-io/maroo-integration-lab.git
cd maroo-integration-lab
pnpm install
pnpm b:prepare
pnpm b:check
```

- `pnpm b:prepare`가 끝나면 화면에 나오는 `BUYER` 주소를 ○○. ○○.(○)까지 진행자(○○○○)에게 보내 주시기 바랍니다. 진행자가 테스트넷 OKRW 1,000을 보냅니다.
- OKRW를 받은 뒤 `pnpm b:check`를 다시 실행합니다. 마지막 줄이 「필수 항목이 모두 준비됐습니다」이고 구매 기업 잔액 줄이 ✓이면 준비가 끝난 것입니다.

- 개인키는 노트북의 `~/.config/maroo-integration-lab/testnet.env`(권한 600)에만 있고 화면에는 나오지 않습니다. 이 파일은 테스트넷 전용이며 다른 곳에 올리지 않습니다.
- 준비 중에 막히면 화면 마지막 줄의 트러블슈팅 번호(T1\~T10)를 실습 자료의 track-b-enable/troubleshooting.md에서 찾습니다.

## 실습 내용

- 1단계(10분): Maroo 테스트넷에 연결하고 Privacy 정책과 전역 정책을 확인합니다.
- 2단계(15분): KYB 관문이 걸린 정산 금고를 배포하고, PCL이 청구를 거부하고 통과시키는 것을 확인합니다.
- 3단계(25분): Clairveil 로컬 체인에서 협력사 대금을 비공개로 정산하고, 역할마다 볼 수 있는 것을 읽습니다.
- 4단계(15분): 실패한 결과를 네 분류로 나누고, 테스트넷 Privacy가 처음 막히는 층을 진단합니다.
- 5단계(10분): 두 환경의 결과를 나눠 정리하고 팀에 가져갈 목록을 받습니다.

## 문의

- 워크샵 진행자 ○○○, ○○○○
