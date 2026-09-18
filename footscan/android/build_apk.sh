#!/bin/sh
# ══════════════════════════════════════════════════════════════════════
#  안드로이드 APK 를 만듭니다.
#      sh build_apk.sh
#
#  필요한 것: 자바 17 이상, 안드로이드 SDK (ANDROID_HOME 또는 local.properties)
#  결과물: app/build/outputs/apk/debug/app-debug.apk
# ══════════════════════════════════════════════════════════════════════
set -e
cd "$(dirname "$0")"

# 웹 화면을 항상 최신으로 맞춰 둡니다
if [ -f ../app/app.html ]; then
  mkdir -p app/src/main/assets/web
  cp ../app/app.html app/src/main/assets/web/index.html
  echo "웹 화면 복사: $(wc -c < app/src/main/assets/web/index.html | tr -d ' ') 바이트"
fi

if command -v gradle >/dev/null 2>&1; then
  GRADLE=gradle
elif [ -x ./gradlew ]; then
  GRADLE=./gradlew
else
  echo "gradle 이 없습니다. 안드로이드 스튜디오를 설치하거나 gradle 을 설치해 주세요." >&2
  exit 1
fi

$GRADLE --no-daemon assembleDebug
APK=app/build/outputs/apk/debug/app-debug.apk
ls -l "$APK"
echo
echo "이 파일을 안드로이드 폰으로 보내 설치하세요: $APK"
