"""
top/paper.py — [SPEC A2] 상면 사진에서 A4 용지를 찾습니다.

왜 종이를 먼저 찾나?
  사진만으로는 "발이 큰 건지 카메라가 가까운 건지" 알 수 없습니다.
  크기를 아는 물체(A4= 210x297mm)가 같이 찍혀야 mm 로 환산할 수 있습니다.
"""

from __future__ import annotations

import cv2
import numpy as np

from .. import config as C
from ..debug import COLOR_PAPER, DebugSaver, put_label
from ..errors import paper_not_found
from ..imageio import auto_canny, to_gray_blurred


def order_corners(pts: np.ndarray) -> np.ndarray:
    """
    네 점을 좌상 → 우상 → 우하 → 좌하 순서로 정렬합니다.
    요령: x+y 가 가장 작으면 좌상, 가장 크면 우하.
          x-y 가 가장 작으면 좌하, 가장 크면 우상.
    """
    pts = pts.reshape(4, 2).astype(np.float32)
    s = pts.sum(axis=1)
    d = np.diff(pts, axis=1).ravel()      # x - y 가 아니라 y - x 임에 주의
    tl = pts[np.argmin(s)]
    br = pts[np.argmax(s)]
    tr = pts[np.argmin(d)]
    bl = pts[np.argmax(d)]
    return np.array([tl, tr, br, bl], dtype=np.float32)


def _edge_lengths(quad: np.ndarray) -> tuple[float, float]:
    """사각형의 (가로 평균, 세로 평균) 변 길이."""
    tl, tr, br, bl = quad
    top = np.linalg.norm(tr - tl)
    bottom = np.linalg.norm(br - bl)
    left = np.linalg.norm(bl - tl)
    right = np.linalg.norm(br - tr)
    return float((top + bottom) / 2), float((left + right) / 2)


def _straightness_error(contour: np.ndarray, quad: np.ndarray) -> float:
    """
    원본 윤곽이 네 직선에서 얼마나 벗어나는지 (변 길이 대비 비율).
    카펫 위에 놓아 종이가 휘면 이 값이 커집니다. → 경고용.

    방법: 윤곽점마다 "가장 가까운 변"에 배정한 뒤,
          그 변의 직선에서 얼마나 떨어졌는지를 봅니다.
          (모서리 근처 점은 어느 변인지 애매하므로 제외)
    """
    pts = contour.reshape(-1, 2).astype(np.float64)
    if len(pts) < 8:
        return 0.0

    dists = np.zeros((len(pts), 4))
    ts = np.zeros((len(pts), 4))
    lens = np.zeros(4)
    for i in range(4):
        a, b = quad[i].astype(np.float64), quad[(i + 1) % 4].astype(np.float64)
        ab = b - a
        seg_len = float(np.linalg.norm(ab))
        lens[i] = seg_len
        if seg_len < 1e-6:
            dists[:, i] = 1e9
            continue
        t = ((pts - a) @ ab) / (seg_len ** 2)
        ts[:, i] = t
        t_clamped = np.clip(t, 0.0, 1.0)[:, None]
        proj = a + t_clamped * ab
        dists[:, i] = np.linalg.norm(pts - proj, axis=1)

    owner = np.argmin(dists, axis=1)
    worst = 0.0
    for i in range(4):
        lo_t, hi_t = C.PAPER_STRAIGHTNESS_SAMPLE_RANGE
        sel = (owner == i) & (ts[:, i] > lo_t) & (ts[:, i] < hi_t)
        if sel.sum() < 3 or lens[i] < 1e-6:
            continue
        # 상위 5%는 노이즈일 수 있으므로 95 백분위수를 씁니다
        worst = max(worst, float(np.percentile(dists[sel, i], 95)) / lens[i])
    return worst


def detect_paper(img_bgr: np.ndarray, dbg: DebugSaver | None = None) -> tuple[np.ndarray, list[str]]:
    """
    A4 용지의 네 꼭짓점을 찾습니다.
    돌려주는 값: (좌상/우상/우하/좌하 순서의 4x2 좌표, 경고 목록)
    실패하면 PAPER_NOT_FOUND 에러를 냅니다.
    """
    warnings: list[str] = []
    h, w = img_bgr.shape[:2]
    img_area = float(h * w)

    gray = to_gray_blurred(img_bgr)
    edges = auto_canny(gray)
    # 끊어진 경계를 이어 붙입니다 (종이 모서리가 조명 때문에 끊기는 일이 흔합니다)
    k = C.PAPER_EDGE_DILATE
    edges = cv2.dilate(edges, np.ones((k, k), np.uint8), iterations=1)

    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:C.CONTOUR_TOP_N]

    best = None
    best_aspect_err = 1e9
    for cnt in contours:
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, C.APPROX_EPS_RATIO * peri, True)
        if len(approx) != 4:
            continue
        if not cv2.isContourConvex(approx):
            continue
        area = abs(cv2.contourArea(approx))
        if area < C.PAPER_MIN_AREA_RATIO * img_area:
            continue

        quad = order_corners(approx)
        ew, eh = _edge_lengths(quad)
        if min(ew, eh) < 1e-6:
            continue
        aspect = max(ew, eh) / min(ew, eh)
        target = C.A4_LONG_MM / C.A4_SHORT_MM          # 1.414
        err = abs(aspect - target) / target
        if err > C.PAPER_ASPECT_TOLERANCE:
            continue
        if err < best_aspect_err:
            best_aspect_err = err
            best = (quad, cnt)

    if best is None:
        if dbg is not None:
            vis = img_bgr.copy()
            cv2.drawContours(vis, contours, -1, (0, 0, 255), 2)
            put_label(vis, "PAPER NOT FOUND", (20, 50), (0, 0, 255))
            dbg.save("top_paper", vis)
        raise paper_not_found()

    quad, cnt = best

    # 종이가 휘었는지 확인 (카펫 위 촬영 등)
    bend = _straightness_error(cnt, quad)
    if bend > C.PAPER_STRAIGHTNESS_TOLERANCE:
        warnings.append(
            f"종이가 휘어 있는 것 같습니다(휘어짐 {bend * 100:.1f}%). "
            "단단하고 평평한 바닥에서 다시 찍으면 더 정확합니다."
        )

    if dbg is not None:
        vis = img_bgr.copy()
        cv2.polylines(vis, [quad.astype(np.int32)], True, COLOR_PAPER, 3)
        for i, (px, py) in enumerate(quad.astype(int)):
            cv2.circle(vis, (px, py), 12, COLOR_PAPER, -1)
            put_label(vis, str(i), (px + 16, py + 6), COLOR_PAPER, 0.8, 2)
        ew, eh = _edge_lengths(quad)
        put_label(vis, f"A4 found  aspect={max(ew,eh)/min(ew,eh):.3f} (A4=1.414)", (20, 44))
        put_label(vis, f"bend={bend*100:.1f}%", (20, 84))
        dbg.save("top_paper", vis)

    return quad, warnings
