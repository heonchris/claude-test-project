#!/bin/sh
# 웹 앱(../app/app.html)을 iOS 앱 안으로 복사합니다.
# 웹 쪽을 고쳤으면 이 스크립트를 돌린 뒤 다시 빌드하세요.
set -e
cd "$(dirname "$0")"

if [ ! -f ../app/app.html ]; then
  echo "../app/app.html 이 없습니다. 먼저 'sh ../app/build.sh' 를 돌리세요." >&2
  exit 1
fi

mkdir -p FootScan/web
cp ../app/app.html FootScan/web/index.html
echo "복사 완료: FootScan/web/index.html ($(wc -c < FootScan/web/index.html | tr -d ' ') 바이트)"
