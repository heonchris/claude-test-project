#!/bin/sh
# ══════════════════════════════════════════════════════════════════════
#  Xcode 없이 아이폰 사파리에서 열어 보는 방법. (맥·PC 아무거나 + 파이썬)
#
#    sh serve.sh          http 로 띄우기 — 측정은 되지만 카메라는 잠깁니다
#    sh serve.sh https    https 로 띄우기 — 카메라까지 됩니다 (인증서 신뢰 필요)
#
#  폰과 컴퓨터가 같은 와이파이에 있어야 합니다.
# ══════════════════════════════════════════════════════════════════════
set -e
cd "$(dirname "$0")"
sh ./sync_web.sh >/dev/null

PORT=${PORT:-8443}
IP=$(python3 - <<'PY'
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
try:
    s.connect(("8.8.8.8", 80)); print(s.getsockname()[0])
except Exception:
    print("127.0.0.1")
finally:
    s.close()
PY
)

if [ "$1" = "https" ]; then
  CERT=.cert
  mkdir -p $CERT
  if [ ! -f $CERT/server.pem ]; then
    echo "자체 서명 인증서를 만듭니다 (이 컴퓨터에서만 씁니다)…"
    openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
      -keyout $CERT/key.pem -out $CERT/cert.pem \
      -subj "/CN=$IP" -addext "subjectAltName=IP:$IP" 2>/dev/null
    cat $CERT/key.pem $CERT/cert.pem > $CERT/server.pem
  fi
  echo
  echo "  아이폰 사파리에서 열어 주세요:  https://$IP:$PORT/"
  echo
  echo "  ※ 처음에는 '안전하지 않은 연결' 경고가 뜹니다."
  echo "     고급 → 방문 을 누르면 들어가지지만, 카메라까지 쓰려면"
  echo "     인증서를 신뢰해야 합니다:"
  echo "       1) 사파리에서 https://$IP:$PORT/cert.pem 을 열어 프로파일을 내려받고"
  echo "       2) 설정 > 일반 > VPN 및 기기 관리 에서 설치한 뒤"
  echo "       3) 설정 > 일반 > 정보 > 인증서 신뢰 설정 에서 켜 주세요."
  echo
  echo "  번거로우면 Xcode 로 앱을 넣는 쪽(run.sh)이 훨씬 간단합니다."
  echo "  끄려면 Ctrl+C"
  echo
  python3 - "$PORT" "$CERT/server.pem" <<'PY'
import http.server, ssl, sys, os, functools
port, pem = int(sys.argv[1]), sys.argv[2]
os.chdir("FootScan/Resources")
class H(http.server.SimpleHTTPRequestHandler):
    def guess_type(self, path):
        t = super().guess_type(path)
        if isinstance(t, tuple): t = t[0]
        if t and t.startswith("text/"): t += "; charset=utf-8"
        return t
    def log_message(self, *a): pass
# 인증서를 내려받을 수 있게 같이 노출합니다
import shutil, pathlib
src = pathlib.Path("../../" + pem.replace("server.pem", "cert.pem"))
if src.exists(): shutil.copy(src, "cert.pem")
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(os.path.join("../../", pem))
srv = http.server.ThreadingHTTPServer(("0.0.0.0", port), H)
srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
srv.serve_forever()
PY
else
  PORT=${PORT:-8000}
  echo
  echo "  아이폰 사파리에서 열어 주세요:  http://$IP:$PORT/"
  echo
  echo "  ※ http 로는 카메라가 잠깁니다(브라우저 보안 규칙). 사진첩으로는 그대로 측정됩니다."
  echo "     카메라까지 보시려면:  sh serve.sh https"
  echo "  끄려면 Ctrl+C"
  echo
  cd FootScan/Resources
  python3 -m http.server "$PORT"
fi
