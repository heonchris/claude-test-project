"""
stress_test.py — "어디까지 견디나?" 를 알아보는 한계 시험 도구.

test_measure.py 가 "제대로 찍은 사진에서 정확한가"를 본다면,
이 파일은 "얼마나 못 찍어도 버티나"를 봅니다.

왜 필요한가?
  실제 사용자는 어둡게, 흔들리게, 그림자 지게 찍습니다.
  어느 선을 넘으면 깨지는지 미리 알아야
  앱에서 "이 사진은 다시 찍으세요"를 언제 띄울지 정할 수 있습니다.

실행:
    python tests/stress_test.py

결과는 조건별로 [OK] 또는 [실패] 와 발 길이 오차(mm)로 나옵니다.
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np

ENGINE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ENGINE_DIR))
sys.path.insert(0, str(ENGINE_DIR / "tests"))

import make_synthetic as ms                # noqa: E402
from footscan.errors import FootScanError  # noqa: E402
from footscan.pipeline import scan_foot    # noqa: E402

TRUE_LENGTH_MM = 250.0
TRUE_ARCH_MM = 14.0
TMP = Path(tempfile.mkdtemp(prefix="fs_stress_"))


# --- 사진을 일부러 망가뜨리는 함수들 -----------------------------------------

def d_brightness(img: np.ndarray, k: float) -> np.ndarray:
    """전체 밝기 배율. k<1 이면 어두운 사진, k>1 이면 과노출."""
    return np.clip(img.astype(np.float32) * k, 0, 255).astype(np.uint8)


def d_shadow(img: np.ndarray, strength: float) -> np.ndarray:
    """한쪽에서 비스듬히 드리운 짙은 그림자."""
    h, w = img.shape[:2]
    gx = np.linspace(0.0, 1.0, w)[None, :]
    gy = np.linspace(0.0, 1.0, h)[:, None]
    g = np.clip(gx * 0.6 + gy * 0.4, 0, 1)
    factor = 1.0 - strength * g
    return np.clip(img.astype(np.float32) * factor[:, :, None], 0, 255).astype(np.uint8)


def d_blur(img: np.ndarray, sigma: float) -> np.ndarray:
    """초점이 안 맞거나 손이 흔들린 사진."""
    if sigma <= 0:
        return img
    k = int(sigma * 4) | 1
    return cv2.GaussianBlur(img, (k, k), sigma)


def d_noise(img: np.ndarray, sigma: float) -> np.ndarray:
    """어두운 곳에서 찍었을 때 생기는 노이즈."""
    rng = np.random.default_rng(0)
    return np.clip(img.astype(np.float32) + rng.normal(0, sigma, img.shape), 0, 255).astype(np.uint8)


def d_jpeg(img: np.ndarray, quality: int) -> np.ndarray:
    """카톡 등으로 보내면서 심하게 압축된 사진."""
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return cv2.imdecode(buf, cv2.IMREAD_COLOR) if ok else img


# --- 시험 실행 ---------------------------------------------------------------

def _run(top: np.ndarray, side: np.ndarray | None, tag: str) -> tuple[str, str]:
    tp = TMP / f"{tag}_t.jpg"
    cv2.imwrite(str(tp), top, [cv2.IMWRITE_JPEG_QUALITY, 95])
    sp = None
    if side is not None:
        sp = TMP / f"{tag}_s.jpg"
        cv2.imwrite(str(sp), side, [cv2.IMWRITE_JPEG_QUALITY, 95])
    try:
        r = scan_foot(tp, sp, "right")
    except FootScanError as e:
        # 에러로 막은 것도 '안전한 실패'입니다. 틀린 값을 주지는 않았으니까요.
        return "차단", e.code

    err = r.top.foot_length_mm - TRUE_LENGTH_MM
    msg = f"길이오차 {err:+5.1f}mm"
    accurate = abs(err) <= 3.0
    if r.lateral:
        msg += f" / 아치 {r.lateral.arch_clearance_mm:4.1f}mm({r.lateral.arch_grade})"
        if abs(r.lateral.arch_clearance_mm - TRUE_ARCH_MM) > 4.0:
            accurate = False
            msg += " ←아치틀림"
    msg += f" / 신뢰도 {r.confidence:.2f}"

    if accurate:
        return "OK", msg
    # 틀렸을 때, 시스템이 스스로 알아채고 재촬영을 요구했는지가 가장 중요합니다.
    flagged = r.confidence < 0.7 or any("LOW_CONFIDENCE" in w for w in r.warnings)
    return ("경고됨" if flagged else "위험"), msg


def _base():
    top, _ = ms.render_top(TRUE_LENGTH_MM, 98.0, 62.0, "egyptian", 8.0, "right",
                           5.0, 1600, 1200, 1.0, 7)
    side, _ = ms.render_side(TRUE_LENGTH_MM, TRUE_ARCH_MM, 85.0, 1600, 1200,
                             125.0, 800.0, 1.5, 3.0, 8)
    return top, side


def main() -> int:
    top0, side0 = _base()
    print("=" * 74)
    print("한계 시험 — 사진을 일부러 망가뜨려가며 어디서 깨지는지 봅니다")
    print(f"(정답: 발 길이 {TRUE_LENGTH_MM}mm, 아치 {TRUE_ARCH_MM}mm)")
    print("=" * 74)

    sweeps = [
        ("밝기 배율", [0.25, 0.35, 0.5, 0.7, 1.0, 1.3, 1.6],
         lambda t, s, v: (d_brightness(t, v), d_brightness(s, v))),
        ("그림자 세기", [0.0, 0.2, 0.35, 0.5, 0.65, 0.8],
         lambda t, s, v: (d_shadow(t, v), d_shadow(s, v))),
        ("흔들림(블러 px)", [0.0, 1.0, 2.0, 3.0, 5.0, 8.0],
         lambda t, s, v: (d_blur(t, v), d_blur(s, v))),
        ("노이즈 세기", [0.0, 8.0, 15.0, 25.0, 40.0],
         lambda t, s, v: (d_noise(t, v), d_noise(s, v))),
        ("JPEG 품질", [95, 70, 50, 30, 15],
         lambda t, s, v: (d_jpeg(t, v), d_jpeg(s, v))),
    ]

    fails = []
    for name, values, fn in sweeps:
        print(f"\n▪ {name}")
        for v in values:
            t, s = fn(top0.copy(), side0.copy(), v)
            status, msg = _run(t, s, f"{name}_{v}")
            mark = "  " if status == "OK" else ("! " if status == "위험" else "→ ")
            print(f"  {mark}{name} {str(v):>5} : [{status:3s}] {msg}")
            if status != "OK":
                fails.append((name, v, status, msg))

    # --- 촬영 각도 / 발 회전 ---
    print("\n▪ 카메라 기울기 (0=수직, 1=권장 상한, 2=많이 비스듬)")
    for per in [0.0, 0.5, 1.0, 1.5, 2.0, 2.5]:
        t, _ = ms.render_top(TRUE_LENGTH_MM, 98.0, 62.0, "egyptian", 8.0, "right",
                             5.0, 1600, 1200, per, 7)
        status, msg = _run(t, None, f"per{per}")
        print(f"  {'  ' if status == 'OK' else '→ '}기울기 {per:>4} : [{status:3s}] {msg}")
        if status != "OK":
            fails.append(("카메라 기울기", per, status, msg))

    print("\n▪ 발을 비뚤게 놓았을 때 (도)")
    for rot in [0.0, 5.0, 10.0, 15.0, 20.0, 30.0]:
        t, _ = ms.render_top(TRUE_LENGTH_MM, 98.0, 62.0, "egyptian", 8.0, "right",
                             rot, 1600, 1200, 1.0, 7)
        status, msg = _run(t, None, f"rot{rot}")
        print(f"  {'  ' if status == 'OK' else '→ '}회전 {rot:>4}도 : [{status:3s}] {msg}")
        if status != "OK":
            fails.append(("발 회전", rot, status, msg))

    print("\n▪ 양말 색 (SPEC 은 맨발 또는 어두운 양말을 안내합니다)")
    socks = [("맨발", None), ("어두운 양말", (60.0, 62.0, 68.0)),
             ("회색 양말", (150.0, 150.0, 150.0)), ("흰 양말", (238.0, 240.0, 242.0))]
    for label, bgr in socks:
        t, _ = ms.render_top(TRUE_LENGTH_MM, 98.0, 62.0, "egyptian", 8.0, "right",
                             5.0, 1600, 1200, 1.0, 7, skin_bgr=bgr)
        s, _ = ms.render_side(TRUE_LENGTH_MM, TRUE_ARCH_MM, 85.0, 1600, 1200,
                              125.0, 800.0, 1.5, 3.0, 8, skin_bgr=bgr)
        status, msg = _run(t, s, f"sock{label}")
        print(f"  {'  ' if status == 'OK' else '→ '}{label:12s}: [{status:3s}] {msg}")
        if status != "OK":
            fails.append(("양말 색", label, status, msg))

    print("\n" + "=" * 74)
    danger = [f for f in fails if f[2] == "위험"]
    safe = [f for f in fails if f[2] != "위험"]

    print("판정 기준")
    print("  OK     : 정확하게 쟀음")
    print("  차단   : 아예 에러를 내고 멈춤 (틀린 값을 주지 않으므로 안전)")
    print("  경고됨 : 값은 틀렸지만 신뢰도를 낮추고 '다시 찍으세요'를 띄움 (안전)")
    print("  위험   : 값이 틀렸는데 시스템이 알아채지 못함 ← 반드시 고쳐야 함")
    print()
    if danger:
        print(f"★ 위험(조용히 틀리는) 조건 {len(danger)}개 — 최우선 수정 대상:")
        for name, v, status, msg in danger:
            print(f"  · {name} = {v} : {msg}")
    else:
        print("★ 위험(조용히 틀리는) 조건: 없음 — 틀릴 때는 항상 사용자에게 알립니다")
    print()
    print(f"안전하게 걸러진 조건 {len(safe)}개 (앱에서 촬영 단계에 미리 막으면 좋은 것들):")
    for name, v, status, msg in safe:
        print(f"  · {name} = {v} → {status}")
    print("=" * 74)
    return 1 if danger else 0


if __name__ == "__main__":
    raise SystemExit(main())
