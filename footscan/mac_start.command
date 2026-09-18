#!/bin/bash
# ══════════════════════════════════════════════════════════════════════
#  발 스캔 — 맥에서 시작하기
#
#  파인더에서 이 파일을 더블클릭하거나, 터미널에서:
#      sh footscan/mac_start.command
# ══════════════════════════════════════════════════════════════════════
cd "$(dirname "$0")" || exit 1

# ── 폴더 위치 ── (전달 패키지에서는 폴더 이름이 달라 이 네 줄만 바뀝니다)
APP_HTML=app/app.html          # 완성된 앱 파일
SRC_DIR=app                    # 앱 조각 파일들
IOS_DIR=ios                    # 아이폰 프로젝트
ENGINE_DIR=engine              # 파이썬 원본 엔진

B=$(printf '\033[1m'); D=$(printf '\033[0m')
G=$(printf '\033[32m'); Y=$(printf '\033[33m'); R=$(printf '\033[31m')

line() { printf '%s\n' "────────────────────────────────────────────────────────"; }
ok()   { printf '%s✓%s %s\n' "$G" "$D" "$1"; }
warn() { printf '%s!%s %s\n' "$Y" "$D" "$1"; }
bad()  { printf '%s✕%s %s\n' "$R" "$D" "$1"; }

have() { command -v "$1" >/dev/null 2>&1; }

# python3 가 진짜 쓸 수 있는지 (맥은 껍데기만 있고 누르면 설치 안내가 뜹니다)
python_ok() { python3 -c 'print(1)' >/dev/null 2>&1; }

lan_ip() {
  for i in en0 en1 en2; do
    ip=$(ipconfig getifaddr "$i" 2>/dev/null) && [ -n "$ip" ] && { echo "$ip"; return; }
  done
  ipconfig getifaddr "$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')" 2>/dev/null \
    || echo ""
}

# 완성된 앱 파일이 없을 때만 조각들을 합칩니다
build_app() {
  [ -f "$APP_HTML" ] && return 0
  [ -f "$SRC_DIR/build.sh" ] && sh "$SRC_DIR/build.sh" >/dev/null 2>&1
  return 0
}

# ── 화면 ──────────────────────────────────────────────────────────────
clear
printf '%s\n' "${B}발 스캔 — 맥에서 시작하기${D}"
line
printf '%s\n' "A4 종이 한 장으로 발 크기를 재는 기능입니다."
printf '%s\n' "무엇을 하시겠어요? 번호를 누르고 엔터."
printf '\n'
printf '%s\n' "  ${B}1${D}  맥에서 바로 열어 보기          ${G}설치할 것 없음${D}"
printf '%s\n' "  ${B}2${D}  아이폰 사파리로 열기           같은 와이파이 필요"
printf '%s\n' "  ${B}3${D}  아이폰에 앱으로 설치           Xcode 필요 · ${G}카메라까지 됨${D}"
printf '%s\n' "  ${B}4${D}  이 맥에서 뭐가 되는지 점검"
printf '%s\n' "  ${B}5${D}  자체 검사 돌려보기             개발자용"
printf '%s\n' "  ${B}q${D}  끝내기"
printf '\n'
printf '선택: '
read -r choice
printf '\n'

case "$choice" in

# ── 1. 맥에서 그냥 열기 ───────────────────────────────────────────────
1)
  build_app
  if [ ! -f "$APP_HTML" ]; then
    bad "$APP_HTML 이 없습니다. 압축을 제대로 풀었는지 확인해 주세요."
    exit 1
  fi
  ok "브라우저로 엽니다."
  printf '%s\n' ""
  printf '%s\n' "  ${B}사진 넣기 화면의 「예시 사진으로 해보기」${D} 를 누르면"
  printf '%s\n' "  발을 찍지 않고도 측정 결과를 보실 수 있습니다."
  printf '%s\n' ""
  printf '%s\n' "  ${Y}맥에서는 카메라가 안 열릴 수 있습니다${D} (브라우저 보안 규칙)."
  printf '%s\n' "  측정 자체는 사진첩 사진으로 그대로 됩니다."
  open "$APP_HTML" 2>/dev/null || printf '%s\n' "  직접 여세요: $(pwd)/$APP_HTML"
  ;;

# ── 2. 아이폰 사파리 ──────────────────────────────────────────────────
2)
  build_app
  if ! python_ok; then
    bad "파이썬(python3)이 필요합니다."
    printf '%s\n' ""
    printf '%s\n' "  터미널에 ${B}python3 --version${D} 을 치면 설치 안내가 뜹니다."
    printf '%s\n' "  (개발자 도구 설치 — 몇 분 걸립니다)"
    printf '%s\n' ""
    printf '%s\n' "  ${B}설치하기 싫으시면${D}: 이미 받으신 체험판 링크를"
    printf '%s\n' "  아이폰 사파리에서 그냥 여세요. 카메라까지 됩니다."
    exit 1
  fi
  IP=$(lan_ip)
  [ -z "$IP" ] && IP="127.0.0.1"
  PORT=8000
  printf '%s\n' "  아이폰 사파리 주소창에 이렇게 입력하세요:"
  printf '\n'
  printf '%s\n' "        ${B}http://$IP:$PORT/$(basename "$APP_HTML")${D}"
  printf '\n'
  printf '%s\n' "  ${Y}주의${D}  폰과 이 맥이 ${B}같은 와이파이${D}에 있어야 합니다."
  printf '%s\n' "  ${Y}주의${D}  http 로는 ${B}카메라가 잠깁니다${D}(브라우저 보안 규칙)."
  printf '%s\n' "        사진첩 사진으로는 그대로 측정됩니다."
  printf '%s\n' "        카메라까지 보시려면 3번(앱 설치)을 쓰세요."
  printf '\n'
  printf '%s\n' "  끄려면 ${B}Ctrl+C${D}"
  line
  cd "$(dirname "$APP_HTML")" && python3 -m http.server "$PORT"
  ;;

# ── 3. 아이폰 앱 설치 ─────────────────────────────────────────────────
3)
  if ! have xcodebuild; then
    bad "Xcode 가 없습니다."
    printf '%s\n' ""
    printf '%s\n' "  앱스토어에서 ${B}Xcode${D} 를 설치해 주세요 (무료, 용량이 큽니다)."
    printf '%s\n' "  설치 후 한 번 실행해 약관에 동의해야 합니다."
    printf '%s\n' ""
    printf '%s\n' "  ${B}Xcode 없이 아이폰에서 보려면${D}: 이미 받으신 체험판 링크를"
    printf '%s\n' "  아이폰 사파리에서 여세요. 카메라까지 됩니다."
    exit 1
  fi
  build_app
  if [ -f "$IOS_DIR/FootScan/Resources/index.html" ]; then
    ok "앱 안에 화면 파일이 이미 들어 있습니다."
  else
    sh "$IOS_DIR/sync_web.sh" || { bad "화면 파일을 앱 안으로 복사하지 못했습니다."; exit 1; }
  fi
  ok "Xcode 로 프로젝트를 엽니다."
  printf '%s\n' ""
  printf '%s\n' "  ${B}Xcode 가 열리면 이 순서대로${D}"
  printf '%s\n' "   1) 왼쪽 맨 위 ${B}FootScan${D} 을 클릭"
  printf '%s\n' "   2) 가운데 ${B}TARGETS > FootScan${D} → ${B}Signing & Capabilities${D} 탭"
  printf '%s\n' "   3) ${B}Team${D} 에서 본인 Apple ID 선택 (없으면 Add an Account)"
  printf '%s\n' "   4) ${B}Bundle Identifier${D} 를 본인 것으로 변경"
  printf '%s\n' "      예) ${B}com.본인이름.footscan${D}"
  printf '%s\n' "      ${Y}이걸 안 바꾸면 서명이 실패합니다 — 가장 흔한 막힘입니다${D}"
  printf '%s\n' "   5) 아이폰을 케이블로 연결하고, 위쪽 기기 목록에서 선택"
  printf '%s\n' "   6) ${B}▶︎${D} (재생 버튼) 누르기"
  printf '%s\n' ""
  printf '%s\n' "  처음 실행하면 아이폰에 «신뢰하지 않은 개발자» 라고 뜹니다."
  printf '%s\n' "  ${B}설정 > 일반 > VPN 및 기기 관리${D} 에서 신뢰해 주세요."
  printf '%s\n' ""
  printf '%s\n' "  앱이 뜨면 첫 화면 맨 아래 ${B}「기기 진단」${D} 을 눌러"
  printf '%s\n' "  «자체 시험 실행» → «진단 결과 복사하기» 해 주세요."
  open "$IOS_DIR/FootScan.xcodeproj"
  ;;

# ── 4. 점검 ───────────────────────────────────────────────────────────
4)
  printf '%s\n' "${B}이 맥에서 무엇이 되는지${D}"
  line
  printf '%s\n' "macOS  $(sw_vers -productVersion 2>/dev/null || echo '알 수 없음')"
  if python_ok; then ok "파이썬 $(python3 -V 2>&1 | cut -d' ' -f2) — 아이폰 사파리로 열기(2번) 가능"
  else warn "파이썬 없음 — 2번·5번을 쓰려면 'python3 --version' 으로 설치"; fi
  if have xcodebuild; then ok "Xcode $(xcodebuild -version 2>/dev/null | head -1 | cut -d' ' -f2) — 아이폰 앱 설치(3번) 가능"
  else warn "Xcode 없음 — 아이폰에 앱으로 넣으려면 앱스토어에서 설치"; fi
  if have git; then ok "git 있음"; else warn "git 없음 (없어도 됩니다)"; fi
  IP=$(lan_ip); [ -n "$IP" ] && ok "이 맥의 와이파이 주소: $IP" || warn "와이파이 주소를 찾지 못했습니다"
  if [ -f "$APP_HTML" ]; then ok "앱 파일 준비됨 ($(wc -c < "$APP_HTML" | tr -d ' ') 바이트)"
  else warn "$APP_HTML 없음 — 1번을 고르면 자동으로 만듭니다"; fi
  if have xcrun; then
    n=$(xcrun xctrace list devices 2>/dev/null | grep -v Simulator | grep -c '([0-9A-Fa-f-]\{25,\})')
    [ "$n" -gt 0 ] 2>/dev/null && ok "연결된 아이폰 ${n}대" || warn "연결된 아이폰 없음 (케이블로 연결 후 «신뢰» 를 눌러 주세요)"
  fi
  line
  ;;

# ── 5. 자체 검사 ──────────────────────────────────────────────────────
5)
  if ! python_ok; then
    bad "파이썬(python3)이 필요합니다. 터미널에 'python3 --version' 을 쳐서 설치하세요."
    exit 1
  fi
  cd "$ENGINE_DIR" || exit 1
  if ! python3 -c 'import cv2, numpy' 2>/dev/null; then
    warn "필요한 프로그램을 설치합니다 (2~3분, 처음 한 번만)"
    python3 -m pip install --quiet -r requirements.txt || {
      bad "설치에 실패했습니다. 'python3 -m pip install -r requirements.txt' 를 직접 돌려 보세요."
      exit 1
    }
  fi
  [ -f samples/right_top.jpg ] || { warn "연습용 사진을 만듭니다"; python3 tests/make_synthetic.py; }
  printf '%s\n' "${B}정확도 검사${D}"; line
  python3 tests/test_measure.py
  printf '\n%s\n' "${B}한 장 재보기${D}"; line
  python3 cli.py --top samples/right_top.jpg --side-img samples/right_side.jpg --foot right
  ;;

q|Q|"") printf '%s\n' "끝냅니다." ;;
*) bad "1~5 또는 q 를 입력해 주세요." ;;
esac

printf '\n'
