"""실사용에서 A4 를 못 찾는 상황을 흉내 낸 어려운 사진들을 만듭니다.

기존 tests/make_synthetic.py 의 사진은 조건이 너무 좋습니다
(균일한 회색 바닥, 발이 종이 안에 완전히 들어옴, 그림자 옅음).
실제 사용자가 찍은 사진에서 PAPER_NOT_FOUND 가 났기에,
'무엇 때문에 못 찾는지'를 하나씩 재현해 검출기를 고치는 데 씁니다.

    python3 tests/make_hard_cases.py            # samples_hard/ 에 생성
    python3 tests/make_hard_cases.py --check    # 지금 검출기가 몇 개나 찾는지
"""

from __future__ import annotations

import argparse
import json
import math
import pathlib
import sys

import cv2
import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from footscan import config as C                      # noqa: E402
from tests.make_synthetic import (                    # noqa: E402
    PPM, _noise, _paper_texture, _skin, foot_top_mask,
    measure_top_ground_truth, project_points,
)

OUT = pathlib.Path(__file__).resolve().parents[1] / "samples_hard"

# 바닥 종류 (BGR 기본색, 이름) — 실제로 사람들이 서는 바닥들
FLOORS = {
    "gray":   (96.0, 112.0, 128.0),      # 원래 쓰던 회색 (쉬움)
    "light":  (206.0, 212.0, 216.0),     # 밝은 타일 — 종이와 대비가 거의 없음
    "wood":   (86.0, 122.0, 156.0),      # 나무 마루
    "dark":   (44.0, 48.0, 54.0),        # 어두운 마루
}


def _floor(h: int, w: int, kind: str, rng) -> np.ndarray:
    """바닥을 그립니다. 나무 바닥은 결과 이음매(어두운 선)까지 그립니다."""
    b, g, r = FLOORS[kind]
    img = np.zeros((h, w, 3))
    img[:, :, 0], img[:, :, 1], img[:, :, 2] = b, g, r
    img += _noise((h, w, 3), 5.0, rng)
    if kind == "wood":
        # 마루 판 이음매 — 검출기가 종이 모서리로 착각하기 쉬운 긴 직선
        for y in range(0, h, max(40, h // 9)):
            cv2.line(img, (0, y), (w, y), (52, 74, 96), 3)
        for x in range(0, w, max(120, w // 4)):
            cv2.line(img, (x, 0), (x, h), (58, 82, 104), 2)
        # 나뭇결
        for _ in range(60):
            y = rng.integers(0, h)
            cv2.line(img, (0, int(y)), (w, int(y + rng.integers(-8, 8))),
                     (b - 14, g - 14, r - 14), 1)
    return np.clip(img, 0, 255)


def _leg(img: np.ndarray, quad: np.ndarray, rng) -> np.ndarray:
    """발목에서 위로 뻗은 다리를 그립니다.

    실제 사진에서 가장 흔한 실패 원인으로 의심되는 상황입니다.
    다리가 종이 위쪽 모서리를 가로질러 바닥까지 이어지면,
    '종이 바깥 윤곽'이 더 이상 사각형이 아니게 됩니다.
    """
    h, w = img.shape[:2]
    tl, tr, br, bl = quad
    top_mid = (tl + tr) / 2.0
    bot_mid = (bl + br) / 2.0
    # 발목은 종이 위쪽에서 발 길이만큼 들어온 지점 근처
    ankle = bot_mid + (top_mid - bot_mid) * 0.80
    half = float(np.linalg.norm(tr - tl)) * 0.17          # 발목 굵기
    up = (top_mid - bot_mid)
    up = up / (np.linalg.norm(up) + 1e-9)
    perp = np.array([-up[1], up[0]])
    far = ankle + up * (h * 0.6)                           # 화면 밖까지
    poly = np.array([
        ankle + perp * half, ankle - perp * half,
        far - perp * half * 1.35, far + perp * half * 1.35,
    ], np.int32)
    skin = _skin(h, w, rng)
    mask = np.zeros((h, w), np.uint8)
    cv2.fillPoly(mask, [poly], 255)
    mask = cv2.GaussianBlur(mask, (9, 9), 0)
    a = (mask / 255.0)[:, :, None]
    return img * (1 - a) + skin * a


def _shadow_band(img: np.ndarray, rng) -> np.ndarray:
    """사진을 가로지르는 짙은 그림자 경계 (창틀·몸 그림자)."""
    h, w = img.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    t = (xx / w) * 0.75 + (yy / h) * 0.25
    a = 1.0 / (1.0 + np.exp(-(t - 0.46) * 45))            # 부드러운 경계
    fac = 1.0 - 0.42 * a
    return np.clip(img * fac[:, :, None], 0, 255)


def render_hard(
    case: str, out_w: int = 1512, out_h: int = 2016, seed: int = 11,
) -> tuple[np.ndarray, dict]:
    """어려운 상면 사진 한 장 + 정답값."""
    rng = np.random.default_rng(seed)
    cfg = {
        "leg":        dict(floor="gray",  tilt=0.35, leg=True,  scale=1.00, shadow=False),
        "light_floor":dict(floor="light", tilt=0.30, leg=False, scale=1.00, shadow=False),
        "wood_floor": dict(floor="wood",  tilt=0.30, leg=False, scale=1.00, shadow=False),
        "dark_floor": dict(floor="dark",  tilt=0.30, leg=False, scale=1.00, shadow=False),
        "tilt":       dict(floor="gray",  tilt=1.60, leg=False, scale=1.00, shadow=False),
        "shadow":     dict(floor="gray",  tilt=0.30, leg=False, scale=1.00, shadow=True),
        "small":      dict(floor="gray",  tilt=0.30, leg=False, scale=0.55, shadow=False),
        "leg_light":  dict(floor="light", tilt=0.40, leg=True,  scale=1.00, shadow=False),
        "leg_wood":   dict(floor="wood",  tilt=0.40, leg=True,  scale=1.00, shadow=False),
        "all":        dict(floor="wood",  tilt=0.90, leg=True,  scale=0.75, shadow=True),
    }[case]

    # --- 종이 위에 발 (정면에서 본 이상적인 그림) ---
    PW, PH = C.WARP_W_PX, C.WARP_H_PX
    paper = _paper_texture(PH, PW, rng)
    length, ball, heel = 249.9, 98.1, 62.0
    foot = foot_top_mask(length, ball, heel, "egyptian", 8.0, "right")
    gt = measure_top_ground_truth(foot)

    M = cv2.getRotationMatrix2D((foot.shape[1] / 2, foot.shape[0] / 2), 3.0, 1.0)
    diag = int(math.hypot(*foot.shape[:2]))
    M[0, 2] += (diag - foot.shape[1]) / 2
    M[1, 2] += (diag - foot.shape[0]) / 2
    foot = cv2.warpAffine(foot, M, (diag, diag), flags=cv2.INTER_NEAREST)
    ys, xs = np.where(foot > 0)
    crop = foot[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    ch, cw = crop.shape
    mask = np.zeros((PH, PW), np.uint8)
    mask[PH - ch - int(20 * PPM):PH - int(20 * PPM), (PW - cw) // 2:(PW - cw) // 2 + cw] = crop

    shadow = cv2.warpAffine(mask, np.float32([[1, 0, 26], [0, 1, 26]]), (PW, PH))
    shadow = cv2.GaussianBlur(shadow, (51, 51), 0).astype(np.float64) / 255.0
    paper = paper * (1.0 - 0.13 * shadow[:, :, None])
    flat = np.where((mask > 0)[:, :, None], _skin(PH, PW, rng), paper)

    # --- 카메라로 찍기 ---
    cam_h = 500.0 / cfg["scale"]
    t = cfg["tilt"]
    cam = np.array([C.A4_SHORT_MM / 2 + 45.0 * t, cam_h, C.A4_LONG_MM / 2 - 70.0 * t])
    target = np.array([C.A4_SHORT_MM / 2, 0.0, C.A4_LONG_MM / 2])
    corners3d = np.array([
        [0.0, 0.0, C.A4_LONG_MM], [C.A4_SHORT_MM, 0.0, C.A4_LONG_MM],
        [C.A4_SHORT_MM, 0.0, 0.0], [0.0, 0.0, 0.0],
    ])
    dst = project_points(corners3d, cam, target, np.array([0.0, 0.0, 1.0]),
                         0.98 * out_w, out_w / 2.0, out_h / 2.0).astype(np.float32)
    src = np.float32([[0, 0], [PW - 1, 0], [PW - 1, PH - 1], [0, PH - 1]])
    H = cv2.getPerspectiveTransform(src, dst)

    floor = _floor(out_h, out_w, cfg["floor"], rng)
    warped = cv2.warpPerspective(flat, H, (out_w, out_h), borderValue=(0, 0, 0))
    wm = cv2.warpPerspective(np.ones((PH, PW), np.uint8) * 255, H, (out_w, out_h))
    img = np.where((wm > 0)[:, :, None], warped, floor)

    if cfg["leg"]:
        img = _leg(img, dst, rng)
    if cfg["shadow"]:
        img = _shadow_band(img, rng)

    img = np.clip(img + _noise((out_h, out_w, 3), 2.5, rng), 0, 255).astype(np.uint8)
    gt.update({"case": case, "paper_quad": dst.tolist(), "design_length_mm": length})
    return img, gt


CASES = ["leg", "light_floor", "wood_floor", "dark_floor", "tilt",
         "shadow", "small", "leg_light", "leg_wood", "all"]


def generate() -> None:
    OUT.mkdir(exist_ok=True)
    for case in CASES:
        img, gt = render_hard(case)
        cv2.imwrite(str(OUT / f"{case}.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 92])
        (OUT / f"{case}_gt.json").write_text(json.dumps(gt, ensure_ascii=False, indent=2),
                                             encoding="utf-8")
    print(f"{len(CASES)}개 생성 → {OUT}")


def check() -> int:
    """지금 검출기가 각 사진에서 A4 를 찾는지, 찾았다면 얼마나 정확한지."""
    from footscan.errors import FootScanError
    from footscan.top.paper import detect_paper, order_corners

    ok = 0
    print(f"{'사진':<12} {'결과':<14} 꼭짓점 오차")
    for case in CASES:
        path = OUT / f"{case}.jpg"
        if not path.exists():
            print(f"{case:<12} 사진 없음 — 먼저 생성하세요")
            continue
        img = cv2.imread(str(path))
        gt = json.loads((OUT / f"{case}_gt.json").read_text(encoding="utf-8"))
        # 정답 좌표는 3D 순서라 좌상/우상/우하/좌하로 맞춰 놓고 비교합니다
        truth = order_corners(np.array(gt["paper_quad"], np.float32)).astype(np.float64)
        long_edge = max(img.shape[:2])
        s = C.RESIZE_LONG_EDGE_PX / long_edge if long_edge > C.RESIZE_LONG_EDGE_PX else 1.0
        small = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA) if s < 1 else img
        try:
            quad, _, _ = detect_paper(small)
            err = float(np.mean(np.linalg.norm(quad / s - truth, axis=1)))
            good = err < 12.0
            ok += good
            print(f"{case:<12} {'찾음' if good else '엉뚱한 것':<14} {err:6.1f} px")
        except FootScanError as e:
            print(f"{case:<12} {'못 찾음 (' + e.code + ')':<14}")
    print(f"\n{ok}/{len(CASES)} 성공")
    return ok


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="검출 성공률만 확인")
    a = ap.parse_args()
    if a.check:
        check()
    else:
        generate()
        check()
