# 클릭 한 번에 10분 뒤 자동 종료 (macOS)

더블클릭하면 10분 타이머가 백그라운드에서 돌고, 시간이 되면 Mac이 스스로 종료됩니다.
비밀번호도, `sudo` 도 필요 없습니다.

| 앱 | 하는 일 |
|---|---|
| `~/Applications/10분후종료.app` | 10분 타이머 시작 · 즉시 알림 · 9분 30초에 경고 · 10분 뒤 종료 |
| `~/Applications/종료취소.app` | 예약 취소 (예약이 없으면 없다고 알려줌) |

## 설치

터미널에서 한 줄만 실행하면 됩니다.

```bash
bash install.sh
```

## 만드는 방식

`osacompile`(AppleScript 애플릿) 대신 **셸 스크립트를 감싼 `.app` 번들**로 만들었습니다.
AppleScript 애플릿은 10분 동안 앱이 살아 있어야 해서 Dock에 계속 떠 있고,
`do shell script` 로 백그라운드 처리를 하면 응답 없음으로 보이는 문제가 있습니다.
셸 번들은 `LSUIElement` 로 Dock에 뜨지 않게 하면서, 프로세스 자체가 타이머라
PID 관리와 취소가 정확합니다.

```
10분후종료.app/
└── Contents/
    ├── Info.plist              LSUIElement (Dock에 안 뜸), 번들 ID, 권한 설명 문구
    └── MacOS/shutdown-timer-app  타이머 본체 (이 프로세스의 PID가 곧 예약 ID)
```

## 동작 방식

1. 실행하면 `/tmp/shutdown-timer.pid` 에 자기 PID를 적는다.
   이미 예약이 있으면 그 PID를 먼저 죽이고 새로 시작한다 (중복 방지).
2. 즉시 "10분 뒤에 Mac이 종료됩니다" 알림.
3. 곧바로 `System Events` 제어 권한을 한 번 확인한다.
   첫 실행이라면 이때 권한 창이 뜬다 — **10분 뒤가 아니라 지금** 뜨게 해서,
   자리를 비운 사이에 권한 문제로 종료가 조용히 실패하는 일을 막는다.
4. 벽시계 기준으로 기다린다. 중간에 Mac이 잠들었다 깨어나도 예정 시각이 밀리지 않는다.
   기다리는 동안 `caffeinate -i` 로 자동 잠자기를 막는다.
5. 30초 남으면 경고 알림 + 소리 + 자동으로 닫히는 창(알림이 꺼져 있어도 보이도록).
6. 10분이 되면 `osascript -e 'tell application "System Events" to shut down'`.

취소는 PID 파일의 PID에 `kill` 을 보냅니다. PID가 재사용된 남의 프로세스를 잘못 죽이지
않도록, `ps` 로 그 PID가 정말 우리 타이머인지 확인한 뒤에 죽입니다.

기록은 `/tmp/shutdown-timer.log` 에 남습니다.

## 테스트

```bash
bash test.sh
```

시작 · 취소 · 중복 실행 · 경고 타이밍 · 찌꺼기 정리를 검사합니다.
전체 흐름은 12초로 압축해서 돌리며, `osascript` 를 가짜로 바꿔치기하므로
**실제 종료는 절대 실행되지 않습니다**.

## 직접 확인해 보고 싶을 때

10분을 기다리지 않고 1분짜리로 시험해 볼 수 있습니다 (실제 종료는 하지 않음):

```bash
SHUTDOWN_TIMER_TOTAL=60 SHUTDOWN_TIMER_WARN=20 SHUTDOWN_TIMER_DRY_RUN=1 \
  ~/Applications/10분후종료.app/Contents/MacOS/shutdown-timer-app
```
