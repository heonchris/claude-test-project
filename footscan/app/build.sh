#!/bin/sh
# ══════════════════════════════════════════════════════════════════════
#  체험판 앱을 파일 하나(app.html)로 합칩니다.
#  외부 라이브러리를 하나도 쓰지 않으므로, 만들어진 app.html 을
#  브라우저로 열기만 하면 그대로 동작합니다. (인터넷 불필요)
#
#  사용법:  sh build.sh
# ══════════════════════════════════════════════════════════════════════
set -e
cd "$(dirname "$0")"

# 예시 사진(samples/*.jpg)이 바뀌었으면 samples.js 를 다시 만듭니다
if [ "samples/right_top.jpg" -nt "samples.js" ] || [ ! -f samples.js ]; then
  python3 make_samples.py
fi

{
  cat app_ui.html                                  # 화면 뼈대와 디자인
  echo '<script>'; cat cvlite.js;   echo '</script>'   # 직접 만든 영상처리
  echo '<script>'; cat engine2.js;  echo '</script>'   # 측정 엔진
  echo '<script>'; cat samples.js;  echo '</script>'   # 예시 사진
  echo '<script>'; cat app_logic.js; echo '</script>'  # 화면 동작
  echo ''
  cat boot.html                                    # 시작 처리
} > app.html

ls -l app.html
