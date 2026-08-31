#!/bin/bash
#
# "클릭 한 번에 10분 뒤 자동 종료" 설치 스크립트 (macOS 전용)
#
#   ~/Applications/10분후종료.app  - 더블클릭하면 10분 타이머 시작
#   ~/Applications/종료취소.app    - 더블클릭하면 예약 취소
#
# 사용법:  bash install.sh
#
set -euo pipefail

# ---------------------------------------------------------------- 설정값
APPS_DIR="${SHUTDOWN_TIMER_INSTALL_DIR:-$HOME/Applications}"
TIMER_APP="$APPS_DIR/10분후종료.app"
CANCEL_APP="$APPS_DIR/종료취소.app"
TIMER_BIN_NAME="shutdown-timer-app"     # 프로세스 식별 태그로도 쓰임
CANCEL_BIN_NAME="shutdown-cancel-app"

if [ "$(uname -s)" != "Darwin" ] && [ "${SHUTDOWN_TIMER_SKIP_OS_CHECK:-0}" != "1" ]; then
  echo "이 스크립트는 macOS 전용입니다. (현재: $(uname -s))" >&2
  exit 1
fi

echo "설치 위치: $APPS_DIR"
mkdir -p "$TIMER_APP/Contents/MacOS" "$CANCEL_APP/Contents/MacOS"

# ---------------------------------------------------------------- Info.plist
write_plist() {
  # $1 = .app 경로, $2 = 실행파일 이름, $3 = 표시 이름, $4 = 번들 ID
  cat > "$1/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDevelopmentRegion</key>       <string>ko</string>
	<key>CFBundleExecutable</key>              <string>$2</string>
	<key>CFBundleIdentifier</key>              <string>$4</string>
	<key>CFBundleInfoDictionaryVersion</key>   <string>6.0</string>
	<key>CFBundleName</key>                    <string>$3</string>
	<key>CFBundleDisplayName</key>             <string>$3</string>
	<key>CFBundlePackageType</key>             <string>APPL</string>
	<key>CFBundleShortVersionString</key>      <string>1.0</string>
	<key>CFBundleVersion</key>                 <string>1</string>
	<key>LSMinimumSystemVersion</key>          <string>10.13</string>
	<key>LSUIElement</key>                     <true/>
	<key>NSAppleEventsUsageDescription</key>
	<string>예약된 시간에 Mac을 종료하기 위해 시스템 이벤트 제어 권한이 필요합니다.</string>
</dict>
</plist>
PLIST
}

write_plist "$TIMER_APP"  "$TIMER_BIN_NAME"  "10분후종료" "com.local.shutdown-timer"
write_plist "$CANCEL_APP" "$CANCEL_BIN_NAME" "종료취소"   "com.local.shutdown-cancel"

# ---------------------------------------------------------------- 타이머 본체
cat > "$TIMER_APP/Contents/MacOS/$TIMER_BIN_NAME" <<'TIMER_EOF'
#!/bin/bash
# 10분후종료 - 예약 종료 타이머 본체
set -u

PID_FILE="/tmp/shutdown-timer.pid"
LOG_FILE="/tmp/shutdown-timer.log"
TAG="shutdown-timer-app"

# 테스트용으로만 바꿔 쓰는 값들 (평소에는 건드릴 필요 없음)
TOTAL_SECONDS="${SHUTDOWN_TIMER_TOTAL:-600}"   # 전체 대기 시간 = 10분
WARN_BEFORE="${SHUTDOWN_TIMER_WARN:-30}"       # 종료 30초 전 경고
DRY_RUN="${SHUTDOWN_TIMER_DRY_RUN:-0}"         # 1이면 실제로 종료하지 않음
OSASCRIPT="${SHUTDOWN_TIMER_OSASCRIPT:-/usr/bin/osascript}"

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG_FILE" 2>/dev/null || true; }

# 알림 센터 알림 (인자로 넘겨서 따옴표 문제를 원천 차단)
notify() {
  "$OSASCRIPT" -e 'on run argv
	display notification (item 1 of argv) with title (item 2 of argv)
end run' "$1" "$2" >/dev/null 2>&1
}

# 알림이 꺼져 있어도 반드시 보이는 창 (지정 시간 뒤 자동으로 닫힘)
alert() {
  "$OSASCRIPT" -e 'on run argv
	tell application "System Events"
		activate
		display dialog (item 1 of argv) with title (item 2 of argv) buttons {"확인"} default button 1 with icon caution giving up after (item 3 of argv as integer)
	end tell
end run' "$1" "$2" "$3" >/dev/null 2>&1
}

# 이 PID가 정말 우리 타이머인지 확인 (PID 재사용 오인 방지)
is_our_timer() {
  ps -o command= -p "$1" 2>/dev/null | grep -q "$TAG"
}

# 이미 걸려 있는 예약이 있으면 먼저 없앤다 (중복 방지)
kill_existing() {
  [ -f "$PID_FILE" ] || return 0
  local old
  old="$(tr -dc '0-9' < "$PID_FILE" 2>/dev/null)"
  if [ -n "$old" ] && [ "$old" != "$$" ] && is_our_timer "$old"; then
    kill "$old" 2>/dev/null && log "기존 예약(PID $old)을 취소하고 새로 시작합니다."
    # 정리될 때까지 잠깐 기다린다
    local i=0
    while [ $i -lt 50 ] && kill -0 "$old" 2>/dev/null; do sleep 0.1; i=$((i+1)); done
    if kill -0 "$old" 2>/dev/null; then kill -9 "$old" 2>/dev/null; sleep 0.3; fi
  fi
  rm -f "$PID_FILE"
}

kill_existing
echo "$$" > "$PID_FILE"

# 우리가 끝날 때, PID 파일이 아직 우리 것이면 지운다
cleanup() {
  if [ -f "$PID_FILE" ] && [ "$(tr -dc '0-9' < "$PID_FILE" 2>/dev/null)" = "$$" ]; then
    rm -f "$PID_FILE"
  fi
}
SLEEP_PID=""

# 취소 신호를 받으면 기다리던 sleep 을 끊고 즉시 빠져나온다
on_cancel() {
  log "예약이 취소되었습니다."
  [ -n "$SLEEP_PID" ] && kill "$SLEEP_PID" 2>/dev/null
  cleanup
  exit 0
}
trap cleanup EXIT
trap on_cancel TERM INT

log "타이머 시작 (PID $$, ${TOTAL_SECONDS}초 뒤 종료 예정)"

# 대기하는 동안 Mac이 저절로 잠들지 않게 한다 (타이머가 밀리는 것을 방지)
if command -v caffeinate >/dev/null 2>&1; then
  caffeinate -i -w "$$" >/dev/null 2>&1 &
fi

MINUTES=$(( (TOTAL_SECONDS + 59) / 60 ))
notify "${MINUTES}분 뒤에 Mac이 종료됩니다. 취소하려면 '종료취소'를 실행하세요." "10분후종료"

# 첫 실행이라면 지금 권한 창을 띄워서, 사용자가 자리에 있을 때 허용받는다
if ! "$OSASCRIPT" -e 'tell application "System Events" to get name' >/dev/null 2>&1; then
  log "System Events 제어 권한이 없습니다. 사용자에게 안내합니다."
  notify "종료 권한이 필요합니다. 시스템 설정 > 개인정보 보호 및 보안 > 자동화에서 허용해 주세요." "10분후종료"
  alert "Mac을 종료하려면 권한이 필요합니다.

시스템 설정 > 개인정보 보호 및 보안 > 자동화 에서
'10분후종료' 아래의 'System Events'를 켠 다음
이 앱을 다시 실행해 주세요." "10분후종료 - 권한 필요" 60
fi

# 벽시계 기준으로 대기한다 (중간에 Mac이 잠들었다 깨어나도 시각이 어긋나지 않게)
DEADLINE=$(( $(date +%s) + TOTAL_SECONDS ))
WARNED=0

while :; do
  REMAIN=$(( DEADLINE - $(date +%s) ))

  if [ "$REMAIN" -le 0 ]; then
    break
  fi

  if [ "$WARNED" -eq 0 ] && [ "$REMAIN" -le "$WARN_BEFORE" ]; then
    WARNED=1
    log "종료 ${REMAIN}초 전 경고를 표시합니다."
    notify "${WARN_BEFORE}초 뒤 종료됩니다. 저장하지 않은 작업을 저장하세요." "10분후종료"
    [ -f /System/Library/Sounds/Sosumi.aiff ] && afplay /System/Library/Sounds/Sosumi.aiff >/dev/null 2>&1 &
    # 알림이 꺼져 있어도 놓치지 않도록 창도 같이 띄운다 (자동으로 닫힘)
    alert "${WARN_BEFORE}초 뒤에 Mac이 종료됩니다.

취소하려면 지금 '종료취소'를 실행하세요." "10분후종료" "$(( WARN_BEFORE > 5 ? WARN_BEFORE - 5 : 5 ))" &
  fi

  # 남은 시간에 맞춰 잘게 나눠 잔다 (취소에 빠르게 반응하기 위해)
  if [ "$WARNED" -eq 0 ] && [ "$REMAIN" -gt "$WARN_BEFORE" ]; then
    STEP=$(( REMAIN - WARN_BEFORE ))
  else
    STEP="$REMAIN"
  fi
  [ "$STEP" -gt 5 ] && STEP=5
  [ "$STEP" -lt 1 ] && STEP=1
  # sleep 을 백그라운드로 돌리고 wait 해야 취소 신호에 즉시 반응한다
  # (bash 는 앞단 명령이 끝날 때까지 신호 처리를 미룬다)
  sleep "$STEP" & SLEEP_PID=$!
  wait "$SLEEP_PID" 2>/dev/null
  SLEEP_PID=""
done

log "종료를 실행합니다."
cleanup

if [ "$DRY_RUN" = "1" ]; then
  log "[DRY_RUN] 실제 종료는 건너뜁니다."
  notify "[테스트] 지금이 실제 종료 시점입니다." "10분후종료"
  exit 0
fi

"$OSASCRIPT" -e 'tell application "System Events" to shut down'
TIMER_EOF

# ---------------------------------------------------------------- 취소 앱 본체
cat > "$CANCEL_APP/Contents/MacOS/$CANCEL_BIN_NAME" <<'CANCEL_EOF'
#!/bin/bash
# 종료취소 - 예약된 종료 타이머를 취소한다
set -u

PID_FILE="/tmp/shutdown-timer.pid"
LOG_FILE="/tmp/shutdown-timer.log"
TAG="shutdown-timer-app"
OSASCRIPT="${SHUTDOWN_TIMER_OSASCRIPT:-/usr/bin/osascript}"

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG_FILE" 2>/dev/null || true; }

notify() {
  "$OSASCRIPT" -e 'on run argv
	display notification (item 1 of argv) with title (item 2 of argv)
end run' "$1" "$2" >/dev/null 2>&1
}

is_our_timer() {
  ps -o command= -p "$1" 2>/dev/null | grep -q "$TAG"
}

none() {
  log "취소 요청: 예약된 종료가 없습니다."
  notify "예약된 종료가 없습니다." "종료취소"
  exit 0
}

[ -f "$PID_FILE" ] || none

PID="$(tr -dc '0-9' < "$PID_FILE" 2>/dev/null)"
if [ -z "$PID" ] || ! is_our_timer "$PID"; then
  # PID 파일만 남고 프로세스는 이미 사라진 경우 - 찌꺼기 정리
  rm -f "$PID_FILE"
  none
fi

kill "$PID" 2>/dev/null

# 정말 종료됐는지 확인한다
i=0
while [ $i -lt 30 ] && kill -0 "$PID" 2>/dev/null; do sleep 0.1; i=$((i+1)); done
if kill -0 "$PID" 2>/dev/null; then
  kill -9 "$PID" 2>/dev/null
  sleep 0.3
fi
rm -f "$PID_FILE"

log "취소 완료 (PID $PID)"
notify "예약이 취소되었습니다." "종료취소"
CANCEL_EOF

chmod +x "$TIMER_APP/Contents/MacOS/$TIMER_BIN_NAME" "$CANCEL_APP/Contents/MacOS/$CANCEL_BIN_NAME"

# ---------------------------------------------------------------- 마무리
# 임시 서명: 서명이 있어야 권한(자동화) 설정이 안정적으로 기억된다
if command -v codesign >/dev/null 2>&1; then
  codesign --force --sign - "$TIMER_APP"  >/dev/null 2>&1 || true
  codesign --force --sign - "$CANCEL_APP" >/dev/null 2>&1 || true
fi

# Finder / Spotlight 에 즉시 반영
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
if [ -x "$LSREGISTER" ]; then
  "$LSREGISTER" -f "$TIMER_APP" "$CANCEL_APP" >/dev/null 2>&1 || true
fi
touch "$TIMER_APP" "$CANCEL_APP" 2>/dev/null || true

echo
echo "설치가 끝났습니다."
echo "  $TIMER_APP"
echo "  $CANCEL_APP"
echo
echo "Finder에서 '이동 > 홈 > Applications' 을 열면 두 앱이 보입니다."
