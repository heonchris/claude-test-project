"""예시 사진(samples/*.jpg)을 앱 안에 넣을 수 있는 형태(samples.js)로 바꿉니다.

앱은 파일 하나로 동작해야 하므로, 사진도 글자로 바꿔서 코드 안에 넣습니다.
사진을 교체하려면 samples/ 안의 파일을 바꾸고 이 스크립트를 다시 돌리세요.
"""
import base64
import pathlib

HERE = pathlib.Path(__file__).parent
PHOTOS = [
    ("right_top", "samples/right_top.jpg", "예시_오른발_위.jpg"),
    ("right_side", "samples/right_side.jpg", "예시_오른발_옆.jpg"),
]

lines = [
    "/* ══════════════════════════════════════════════════════════════════════",
    "   예시 사진 — 발을 찍지 않고도 앱을 체험해 볼 수 있게, 사진 2장을",
    "   앱 안에 넣어 두었습니다. (합성 사진이며 실제 사람 발이 아닙니다)",
    "   이 파일은 make_samples.py 가 자동으로 만듭니다. 직접 고치지 마세요.",
    "   ══════════════════════════════════════════════════════════════════════ */",
    "window.SAMPLE_PHOTOS = {",
]
for key, path, name in PHOTOS:
    b64 = base64.b64encode((HERE / path).read_bytes()).decode()
    lines.append('  %s: { name: %r, b64: "%s" },' % (key, name, b64))
lines += [
    "};",
    "",
    "/* base64 글자를 실제 사진 파일로 되돌립니다 (인터넷 접속 없이 동작) */",
    "window.samplePhotoFile = function (key) {",
    "  const s = window.SAMPLE_PHOTOS[key];",
    "  if (!s) return null;",
    "  const bin = atob(s.b64);",
    "  const buf = new Uint8Array(bin.length);",
    "  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);",
    "  return new File([buf], s.name, { type: 'image/jpeg' });",
    "};",
]
(HERE / "samples.js").write_text("\n".join(lines), encoding="utf-8")
print("samples.js 를 새로 만들었습니다.")
