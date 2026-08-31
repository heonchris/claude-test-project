#!/bin/bash
#
# 타이머 시작 / 취소 동작 검증.
# 실제 종료는 절대 실행하지 않는다 (DRY_RUN=1 + 가짜 osascript).
#
# 사용법:  bash test.sh
#
set -u

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

PID_FILE=/tmp/shutdown-timer.pid
CALLS="$WORK/osascript-calls.log"
PASS=0; FAIL=0

ok()   { echo "  PASS  $1"; PASS=$((PASS+1)); }
bad()  { echo "  FAIL  $1"; FAIL=$((FAIL+1)); }
check(){ if [ "$1" = "0" ]; then ok "$2"; else bad "$2"; fi; }

# 실제 osascript 대신 호출 내용을 기록만 하는 가짜를 쓴다
mkdir -p "$WORK/bin"
cat > "$WORK/bin/osascript" <<EOF
#!/bin/bash
printf '%s\n' "\$*" >> "$CALLS"
exit 0
EOF
chmod +x "$WORK/bin/osascript"
: > "$CALLS"

# 설치 스크립트가 만든 앱을 그대로 테스트한다
HERE="$(cd "$(dirname "$0")" && pwd)"
SHUTDOWN_TIMER_SKIP_OS_CHECK=1 SHUTDOWN_TIMER_INSTALL_DIR="$WORK/Applications" \
  bash "$HERE/install.sh" >/dev/null
TIMER="$WORK/Applications/10분후종료.app/Contents/MacOS/shutdown-timer-app"
CANCEL="$WORK/Applications/종료취소.app/Contents/MacOS/shutdown-cancel-app"

export SHUTDOWN_TIMER_OSASCRIPT="$WORK/bin/osascript"
export SHUTDOWN_TIMER_DRY_RUN=1
rm -f "$PID_FILE"

echo
echo "1) 예약이 없을 때 취소하면 '예약된 종료가 없습니다'"
: > "$CALLS"
"$CANCEL"
grep -q "예약된 종료가 없습니다" "$CALLS"; check $? "안내 알림이 나온다"

echo
echo "2) 타이머 시작 - PID 파일 생성 + 즉시 알림"
: > "$CALLS"
SHUTDOWN_TIMER_TOTAL=60 SHUTDOWN_TIMER_WARN=30 "$TIMER" & sleep 1
[ -f "$PID_FILE" ]; check $? "/tmp/shutdown-timer.pid 가 생성된다"
PID1="$(cat "$PID_FILE")"
kill -0 "$PID1" 2>/dev/null; check $? "저장된 PID($PID1)로 프로세스가 살아 있다"
grep -q "분 뒤에 Mac이 종료됩니다" "$CALLS"; check $? "시작 알림이 즉시 나온다"

echo
echo "3) 예약이 걸린 상태에서 또 실행하면 기존 것을 죽이고 새로 시작"
: > "$CALLS"
SHUTDOWN_TIMER_TOTAL=60 SHUTDOWN_TIMER_WARN=30 "$TIMER" & sleep 1
PID2="$(cat "$PID_FILE")"
[ "$PID1" != "$PID2" ]; check $? "PID 파일이 새 타이머($PID2)로 바뀐다"
! kill -0 "$PID1" 2>/dev/null; check $? "기존 타이머($PID1)는 종료됐다"
[ "$(pgrep -fc 'shutdown-timer-app' || echo 0)" = "1" ]; check $? "타이머 프로세스는 한 개만 남는다"

echo
echo "4) 취소 - 프로세스 종료 + PID 파일 삭제 + 취소 알림"
: > "$CALLS"
"$CANCEL"
! kill -0 "$PID2" 2>/dev/null; check $? "타이머 프로세스가 종료된다"
[ ! -f "$PID_FILE" ]; check $? "PID 파일이 지워진다"
grep -q "예약이 취소되었습니다" "$CALLS"; check $? "취소 알림이 나온다"

echo
echo "5) 전체 흐름 (12초로 압축) - 경고 후 종료 명령까지"
: > "$CALLS"
START=$(date +%s)
SHUTDOWN_TIMER_TOTAL=12 SHUTDOWN_TIMER_WARN=4 "$TIMER" & TPID=$!
sleep 6
grep -q "초 뒤 종료됩니다" "$CALLS"; [ $? -ne 0 ]; check $? "6초 시점에는 아직 경고가 없다"
wait "$TPID"
ELAPSED=$(( $(date +%s) - START ))
grep -q "초 뒤 종료됩니다" "$CALLS"; check $? "종료 4초 전에 경고 알림이 나온다"
[ "$ELAPSED" -ge 11 ] && [ "$ELAPSED" -le 15 ]; check $? "예정 시각(12초)에 끝난다 (실제 ${ELAPSED}초)"
[ ! -f "$PID_FILE" ]; check $? "끝난 뒤 PID 파일이 정리된다"
grep -q "지금이 실제 종료 시점입니다" "$CALLS"; check $? "종료 시점에 도달한다 (DRY_RUN이라 실제 종료는 안 함)"
! grep -q "shut down" "$CALLS"; check $? "테스트 중 실제 종료 명령은 한 번도 실행되지 않았다"

echo
echo "6) 타이머가 없는데 PID 파일만 남아 있으면 찌꺼기로 보고 정리"
: > "$CALLS"
echo 999999 > "$PID_FILE"
"$CANCEL"
grep -q "예약된 종료가 없습니다" "$CALLS"; check $? "안내 알림이 나온다"
[ ! -f "$PID_FILE" ]; check $? "찌꺼기 PID 파일이 지워진다"

echo
echo "================================"
echo "  통과 $PASS / 실패 $FAIL"
echo "================================"
[ "$FAIL" -eq 0 ]
