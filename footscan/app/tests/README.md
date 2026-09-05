# 브라우저 앱 자동 검사

파이썬 엔진의 검사(`../../engine/tests/`)와 달리, 이쪽은 **실제 브라우저를 띄워**
사람이 쓰는 것과 같은 순서로 눌러 보는 검사입니다.

## 준비

```sh
npm i playwright                       # 한 번만
python3 -m http.server 8777 -d ..      # 앱을 웹으로 띄웁니다
```

검사 스크립트는 `http://127.0.0.1:8777/app_test.html` 을 엽니다.
`app.html` 을 그 이름으로 복사해 두세요 (`cp ../app.html ../app_test.html`).

## 검사 종류

| 파일 | 무엇을 보는가 |
|---|---|
| `engine2test.js` | 정답을 아는 표본 7개로 **측정 정확도**를 파이썬 엔진과 대조 |
| `apptest2.js` | 사진 품질 사전 검사 · 오류 안내 · **메모리 누수** · 이력 저장 |
| `layoutaudit.js` | 좁은 폰(320px)·큰 폰(430px)에서 8개 화면의 **가로 넘침·버튼 크기** |
| `camtest2.js` | **카메라 화면** — 가짜 영상을 물려 A4/밝기/흔들림 실시간 판정 확인 |
| `sampletest.js` | 「예시 사진으로 해보기」로 처음부터 끝까지 |
| `cspfull.js` | **엄격한 보안정책**(unsafe-eval 금지) 아래서도 도는지 |
| `newshots.js` | 보고서에 넣을 화면 사진 캡처 |

## 카메라 검사용 가짜 영상 만들기

`camtest2.js` 는 `/tmp/fakecam_*.y4m` 을 씁니다. 사진에서 만드는 방법:

```python
from PIL import Image, ImageFilter
import numpy as np
def to_y4m(src, dst, w=960, h=1280, frames=30, dark=0.0, blur=0):
    im = Image.open(src).convert('RGB').resize((w, h), Image.LANCZOS)
    if blur: im = im.filter(ImageFilter.GaussianBlur(blur))
    a = np.asarray(im).astype(float) * (1.0 - dark)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    Y = (0.257*R + 0.504*G + 0.098*B + 16).clip(0, 255).astype(np.uint8)
    U = (-0.148*R - 0.291*G + 0.439*B + 128).clip(0, 255).astype(np.uint8)
    V = (0.439*R - 0.368*G - 0.071*B + 128).clip(0, 255).astype(np.uint8)
    with open(dst, 'wb') as f:
        f.write(b'YUV4MPEG2 W%d H%d F30:1 Ip A1:1 C420jpeg\n' % (w, h))
        for _ in range(frames):
            f.write(b'FRAME\n'); f.write(Y.tobytes())
            f.write(U[::2, ::2].tobytes()); f.write(V[::2, ::2].tobytes())
```

세로로 든 폰을 흉내 내야 하므로 **세로 사진**을 넣어야 합니다.
가로 사진을 잘라 넣으면 종이 모서리가 잘려 A4 를 못 찾습니다.

## 주의

이 검사들은 **PC 브라우저를 폰 크기로 띄운 것**입니다. 실제 안드로이드 기기의
카메라 화질·초점·회전은 여기서 확인되지 않습니다.
