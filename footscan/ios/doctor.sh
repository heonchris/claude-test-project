#!/bin/sh
# ══════════════════════════════════════════════════════════════════════
#  빌드가 왜 안 되는지 알아봅니다. 막혔을 때 이걸 돌리고 결과를 보내 주세요.
#      sh doctor.sh
# ══════════════════════════════════════════════════════════════════════
cd "$(dirname "$0")" || exit 1
APP=FootScan
PROJ=$APP.xcodeproj

echo "── 환경 ──────────────────────────────────────────────"
echo "macOS   $(sw_vers -productVersion 2>/dev/null)"
echo "Xcode   $(xcodebuild -version 2>/dev/null | head -1)"
echo "SDK     $(xcodebuild -showsdks 2>/dev/null | grep iphonesimulator | tail -1 | sed 's/.*-sdk //')"
echo

echo "── 프로젝트 설정 ─────────────────────────────────────"
xcodebuild -project "$PROJ" -target "$APP" -configuration Debug -showBuildSettings 2>/dev/null \
  | grep -E "^ *(PRODUCT_BUNDLE_IDENTIFIER|PRODUCT_NAME|GENERATE_INFOPLIST_FILE|INFOPLIST_FILE|INFOPLIST_PATH|DEVELOPMENT_TEAM|CODE_SIGN_STYLE|IPHONEOS_DEPLOYMENT_TARGET) =" \
  | sed 's/^ *//'
echo

echo "── 앱 안에 넣을 웹 파일 ──────────────────────────────"
if [ -f FootScan/Resources/index.html ]; then
  echo "있음  $(wc -c < FootScan/Resources/index.html | tr -d ' ') 바이트"
else
  echo "없음 — 'sh sync_web.sh' 를 먼저 돌리세요"
fi
echo

echo "── 시뮬레이터용으로 빌드해 봅니다 (1~2분) ────────────"
rm -rf build
if xcodebuild -project "$PROJ" -scheme "$APP" -sdk iphonesimulator \
     -configuration Debug -derivedDataPath build \
     CODE_SIGNING_ALLOWED=NO build > /tmp/footscan_build.log 2>&1; then
  echo "빌드 성공"
else
  echo "빌드 실패 — 마지막 30줄:"
  tail -30 /tmp/footscan_build.log
  echo
  echo "전체 기록: /tmp/footscan_build.log"
  exit 1
fi
echo

echo "── 만들어진 앱 확인 ──────────────────────────────────"
A=build/Build/Products/Debug-iphonesimulator/$APP.app
if [ ! -d "$A" ]; then echo "앱을 찾지 못했습니다: $A"; exit 1; fi
echo "위치  $A"
if [ ! -f "$A/Info.plist" ]; then
  echo "✕ Info.plist 가 앱 안에 없습니다  ← 이것이 «Missing bundle ID» 의 원인입니다"
  exit 1
fi
BID=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$A/Info.plist" 2>/dev/null)
EXE=$(/usr/libexec/PlistBuddy -c "Print :CFBundleExecutable" "$A/Info.plist" 2>/dev/null)
if [ -z "$BID" ]; then
  echo "✕ CFBundleIdentifier 가 비어 있습니다  ← «Missing bundle ID» 의 원인"
  echo "   Xcode > TARGETS > FootScan > Signing & Capabilities 에서"
  echo "   Bundle Identifier 칸이 비어 있지 않은지 확인해 주세요."
  exit 1
fi
echo "✓ Bundle ID     $BID"
echo "✓ 실행 파일      $EXE  $([ -f "$A/$EXE" ] && echo '(있음)' || echo '(없음!)')"
echo "✓ 화면 파일      $([ -f "$A/Resources/index.html" ] && echo '있음' || echo '없음! — sync_web.sh 를 돌리세요')"
echo
echo "여기까지 다 ✓ 면 Xcode 에서 ▶︎ 를 눌러도 됩니다."
