#!/bin/sh
# ══════════════════════════════════════════════════════════════════════
#  터미널에서 iOS 앱을 빌드하고 실행합니다. (맥 + Xcode 필요)
#
#    sh run.sh sim            시뮬레이터에서 실행
#    sh run.sh sim "iPhone 15 Pro"
#    sh run.sh device         연결된 아이폰에서 실행
#    sh run.sh list           쓸 수 있는 기기 목록
#    sh run.sh build          빌드만 (서명 없이 문법 확인용)
#
#  실기기에 넣으려면 서명 팀 ID 가 필요합니다:
#    TEAM=ABCDE12345 sh run.sh device
#  팀 ID 는 Xcode > Settings > Accounts 또는
#    security find-identity -v -p codesigning
#  에서 확인할 수 있습니다.
# ══════════════════════════════════════════════════════════════════════
set -e
cd "$(dirname "$0")"

APP=FootScan
PROJ=$APP.xcodeproj
BUNDLE_ID=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" FootScan/Info.plist 2>/dev/null || echo "com.example.footscan")
[ "$BUNDLE_ID" = '$(PRODUCT_BUNDLE_IDENTIFIER)' ] && BUNDLE_ID=com.example.footscan

need_xcode() {
  command -v xcodebuild >/dev/null 2>&1 || {
    echo "xcodebuild 가 없습니다. 맥에서 Xcode 를 설치한 뒤 다시 시도하세요." >&2
    exit 1
  }
}

# 웹 파일을 항상 최신으로 맞춰 둡니다
sh ./sync_web.sh

case "${1:-sim}" in

  list)
    need_xcode
    echo "── 시뮬레이터 ──"
    xcrun simctl list devices available | grep -E "iPhone|iPad" || true
    echo
    echo "── 연결된 실기기 ──"
    xcrun xctrace list devices 2>/dev/null | sed -n '/^== Devices ==/,/^$/p' || true
    ;;

  build)
    need_xcode
    xcodebuild -project "$PROJ" -scheme "$APP" -sdk iphonesimulator \
      -configuration Debug -derivedDataPath build \
      CODE_SIGNING_ALLOWED=NO build
    echo "빌드 성공"
    ;;

  sim)
    need_xcode
    DEVICE="${2:-iPhone 15}"
    echo "시뮬레이터: $DEVICE"
    xcodebuild -project "$PROJ" -scheme "$APP" -sdk iphonesimulator \
      -configuration Debug -derivedDataPath build \
      -destination "platform=iOS Simulator,name=$DEVICE" \
      CODE_SIGNING_ALLOWED=NO build

    APP_PATH="build/Build/Products/Debug-iphonesimulator/$APP.app"
    [ -d "$APP_PATH" ] || { echo "빌드 결과를 찾지 못했습니다: $APP_PATH" >&2; exit 1; }

    xcrun simctl boot "$DEVICE" 2>/dev/null || true
    open -a Simulator
    # 시뮬레이터가 켜질 때까지 잠깐 기다립니다
    xcrun simctl bootstatus "$DEVICE" -b 2>/dev/null || sleep 5
    xcrun simctl install booted "$APP_PATH"
    xcrun simctl launch booted "$BUNDLE_ID"
    echo
    echo "※ 시뮬레이터에는 카메라가 없습니다. 카메라 확인은 실기기에서 하세요."
    echo "   앱 안 '기기 진단 > 자체 시험 실행' 으로 계산이 도는지는 확인할 수 있습니다."
    ;;

  device)
    need_xcode
    if [ -z "$TEAM" ]; then
      echo "실기기에 넣으려면 서명 팀 ID 가 필요합니다:" >&2
      echo "  TEAM=ABCDE12345 sh run.sh device" >&2
      echo >&2
      echo "팀 ID 찾기: security find-identity -v -p codesigning" >&2
      exit 1
    fi
    xcodebuild -project "$PROJ" -scheme "$APP" -configuration Debug \
      -derivedDataPath build -destination 'generic/platform=iOS' \
      DEVELOPMENT_TEAM="$TEAM" CODE_SIGN_STYLE=Automatic build

    APP_PATH="build/Build/Products/Debug-iphoneos/$APP.app"
    [ -d "$APP_PATH" ] || { echo "빌드 결과를 찾지 못했습니다: $APP_PATH" >&2; exit 1; }

    UDID=$(xcrun xctrace list devices 2>/dev/null \
      | grep -v Simulator | grep -oE '\(([0-9A-Fa-f-]{25,})\)' | head -1 | tr -d '()')
    if [ -z "$UDID" ]; then
      echo "연결된 아이폰을 찾지 못했습니다. 케이블로 연결하고 '이 컴퓨터를 신뢰' 를 눌러 주세요." >&2
      exit 1
    fi
    echo "기기: $UDID"
    xcrun devicectl device install app --device "$UDID" "$APP_PATH"
    xcrun devicectl device process launch --device "$UDID" "$BUNDLE_ID"
    echo
    echo "※ 처음 실행하면 아이폰에서 '신뢰하지 않은 개발자' 라고 나올 수 있습니다."
    echo "   설정 > 일반 > VPN 및 기기 관리 에서 개발자 앱을 신뢰해 주세요."
    ;;

  *)
    sed -n '2,20p' "$0"
    exit 1
    ;;
esac
