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


def _quad_from_contour(cnt: np.ndarray) -> np.ndarray | None:
    """윤곽 하나에서 사각형 꼭짓점 4개를 뽑습니다.

    발이나 다리가 종이 모서리를 가리면 윤곽이 사각형이 아니게 됩니다.
    그래서 먼저 '볼록 껍질'(convex hull)을 씌워 파인 부분을 메운 뒤,
    단순화 강도를 조금씩 올려 가며 꼭짓점 4개가 나오는 지점을 찾습니다.
    끝내 4개가 안 나오면 껍질의 네 극단점(좌상·우상·우하·좌하)을 씁니다.
    """
    # 먼저 원래 윤곽 그대로 시도합니다. 이쪽이 꼭짓점이 가장 정확합니다.
    # (껍질을 씌우면 파인 곳은 메워지지만 모서리가 조금 밀립니다)
    peri0 = cv2.arcLength(cnt, True)
    if peri0 > 1e-6:
        approx = cv2.approxPolyDP(cnt, C.APPROX_EPS_RATIO * peri0, True)
        if len(approx) == 4 and cv2.isContourConvex(approx):
            return order_corners(approx)

    hull = cv2.convexHull(cnt)
    peri = cv2.arcLength(hull, True)
    if peri < 1e-6:
        return None
    for ratio in C.APPROX_EPS_LADDER:
        approx = cv2.approxPolyDP(hull, ratio * peri, True)
        if len(approx) == 4 and cv2.isContourConvex(approx):
            return order_corners(approx)
    pts = hull.reshape(-1, 2).astype(np.float32)
    if len(pts) < 4:
        return None
    return order_corners(np.stack([
        pts[np.argmin(pts.sum(1))], pts[np.argmin(pts[:, 1] - pts[:, 0])],
        pts[np.argmax(pts.sum(1))], pts[np.argmax(pts[:, 1] - pts[:, 0])],
    ]))


def _paper_masks(img_bgr: np.ndarray) -> list[np.ndarray]:
    """종이일 만한 영역 후보를 밝기 기준을 바꿔가며 여러 장 만듭니다.

    바닥이 밝으면 '어디부터가 종이인지' 하나의 기준으로 정할 수 없습니다.
    그래서 여러 기준으로 만들어 두고, 나중에 채점에서 진짜 종이를 고릅니다.
    (한 장만 만들면 밝은 타일 바닥에서 사진 전체가 종이로 잡힙니다)
    """
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    L = lab[:, :, 0].astype(np.float32)
    chroma = np.hypot(lab[:, :, 1].astype(np.float32) - 128.0,
                      lab[:, :, 2].astype(np.float32) - 128.0)
    pale = chroma < C.PAPER_MAX_CHROMA
    if pale.sum() < 0.02 * L.size:
        pale = chroma < C.PAPER_MAX_CHROMA * 2

    # 조명 얼룩을 지운 밝기 — 사진 절반에 그림자가 져도 종이가 통째로 잡힙니다
    k = max(3, int(min(L.shape) * C.PAPER_ILLUM_BLUR_RATIO) | 1)
    Ln = np.clip(L / np.maximum(cv2.GaussianBlur(L, (k, k), 0), 1.0) * 128.0, 0, 255)

    kk = C.PAPER_MASK_CLOSE_PX
    ker = np.ones((kk, kk), np.uint8)
    out = []
    for src in (L, Ln):
        for q in C.PAPER_BRIGHT_PERCENTILES:
            thr = float(np.percentile(src[pale], q))
            m = ((src >= thr) & pale).astype(np.uint8) * 255
            out.append(cv2.morphologyEx(m, cv2.MORPH_CLOSE, ker))
    return out


def _ring_test(quad: np.ndarray, L: np.ndarray, chroma: np.ndarray) -> tuple[bool, float, float]:
    """사각형 '안쪽'과 '바로 바깥 테두리'를 비교합니다.

    종이라면 안쪽이 바깥보다 뚜렷하게 밝고, 색기가 옅어야 합니다.
    전체 밝기 기준을 쓰지 않고 바로 옆끼리만 비교하므로,
    그늘이 져 있어도 바닥이 밝아도 같은 기준으로 판정할 수 있습니다.
    """
    h, w = L.shape
    ctr = quad.mean(axis=0)
    inner = (ctr + (quad - ctr) * C.PAPER_RING_INNER).astype(np.int32)
    outer = (ctr + (quad - ctr) * C.PAPER_RING_OUTER).astype(np.int32)

    m_in = np.zeros((h, w), np.uint8)
    cv2.fillPoly(m_in, [inner], 255)
    m_out = np.zeros((h, w), np.uint8)
    cv2.fillPoly(m_out, [outer], 255)
    cv2.fillPoly(m_out, [(ctr + (quad - ctr) * 1.02).astype(np.int32)], 0)

    if m_in.sum() < 255 * 50 or m_out.sum() < 255 * 50:
        return False, 0.0, 99.0
    l_in = float(np.median(L[m_in > 0]))
    l_out = float(np.median(L[m_out > 0]))
    c_in = float(np.median(chroma[m_in > 0]))
    step = l_in - l_out
    ok = step >= C.PAPER_MIN_EDGE_STEP and c_in <= C.PAPER_MAX_CHROMA
    return ok, step, c_in


def _score(quad: np.ndarray, img_bgr: np.ndarray,
           L: np.ndarray, chroma: np.ndarray) -> tuple[float, dict] | None:
    """후보 사각형이 정말 A4 같은지 채점합니다. 자격 미달이면 None."""
    h, w = img_bgr.shape[:2]
    img_area = float(h * w)
    area = abs(cv2.contourArea(quad.astype(np.float32)))
    if area < C.PAPER_MIN_AREA_RATIO * img_area:
        return None

    # 네 모서리가 모두 화면 '안에' 보여야 종이입니다.
    # 사진 테두리에 붙은 사각형(= 화면 전체)을 종이로 착각하는 것을 막습니다.
    m = C.PAPER_BORDER_MARGIN_RATIO * max(h, w)
    if (quad[:, 0].min() < m or quad[:, 1].min() < m
            or quad[:, 0].max() > w - 1 - m or quad[:, 1].max() > h - 1 - m):
        return None

    ew, eh = _edge_lengths(quad)
    if min(ew, eh) < 1e-6:
        return None
    aspect = max(ew, eh) / min(ew, eh)
    aspect_err = abs(aspect - C.A4_LONG_MM / C.A4_SHORT_MM) / (C.A4_LONG_MM / C.A4_SHORT_MM)
    if aspect_err > C.PAPER_ASPECT_TOLERANCE:
        return None

    # ★ 오검출을 막는 핵심 검사: 안쪽이 바깥보다 밝고 색기가 옅은가
    ok, step, c_in = _ring_test(quad, L, chroma)
    if not ok:
        return None

    score = (min(step, 60.0) / 60.0) - aspect_err * 2.0 + min(area / img_area, 0.6)
    return score, {"aspect": aspect, "aspect_err": aspect_err, "step": step,
                   "chroma": c_in, "area_ratio": area / img_area}


def _quality(aspect_err: float, bend: float, area_ratio: float) -> float:
    """찾아낸 종이를 얼마나 믿을 수 있는지 0~1 로 나타냅니다.

    비율이 A4 에서 멀거나, 네 변이 휘었거나, 너무 작게 찍혔으면 낮아집니다.
    이 값이 낮으면 결과를 그대로 보여 주지 않고 재촬영을 권합니다.
    """
    def lerp(x, x0, x1, y0, y1):
        t = 0.0 if x1 == x0 else min(1.0, max(0.0, (x - x0) / (x1 - x0)))
        return y0 + (y1 - y0) * t

    q_aspect = lerp(aspect_err, 0.03, C.PAPER_ASPECT_TOLERANCE, 1.0, 0.5)
    q_bend = lerp(bend, C.PAPER_STRAIGHTNESS_TOLERANCE, 0.20, 1.0, 0.4)
    q_area = lerp(area_ratio, C.PAPER_SMALL_AREA_WARN, C.PAPER_MIN_AREA_RATIO, 1.0, 0.7)
    return round(min(q_aspect, q_bend, q_area), 2)


def detect_paper(img_bgr: np.ndarray, dbg: DebugSaver | None = None) -> tuple[np.ndarray, list[str], float]:
    """
    A4 용지의 네 꼭짓점을 찾습니다.
    돌려주는 값: (좌상/우상/우하/좌하 순서의 4x2 좌표, 경고 목록, 신뢰도 0~1)
    실패하면 PAPER_NOT_FOUND 에러를 냅니다.

    두 가지 방법으로 후보를 모은 뒤 점수가 가장 높은 것을 고릅니다.
      ① 경계선(Canny)  — 대비가 뚜렷할 때 가장 정확합니다
      ② 종이 색        — 바닥이 밝거나 다리가 종이를 가릴 때도 찾아냅니다
    """
    warnings: list[str] = []
    h, w = img_bgr.shape[:2]
    img_area = float(h * w)

    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    L = lab[:, :, 0].astype(np.float32)
    chroma = np.hypot(lab[:, :, 1].astype(np.float32) - 128.0,
                      lab[:, :, 2].astype(np.float32) - 128.0)

    # ── ① 경계선으로 찾기 ──────────────────────────────────────────────
    gray = to_gray_blurred(img_bgr)
    edges = auto_canny(gray)
    k = C.PAPER_EDGE_DILATE
    edges = cv2.dilate(edges, np.ones((k, k), np.uint8), iterations=1)
    edge_cnts, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    edge_cnts = sorted(edge_cnts, key=cv2.contourArea, reverse=True)[:C.CONTOUR_TOP_N]

    def pick(cnts):
        """후보들 중 점수가 가장 높은 것. 자격 미달뿐이면 None."""
        chosen, top = None, -1e9
        for cnt in cnts:
            if cv2.contourArea(cnt) < C.PAPER_MIN_AREA_RATIO * img_area * 0.5:
                continue
            quad = _quad_from_contour(cnt)
            if quad is None:
                continue
            scored = _score(quad, img_bgr, L, chroma)
            if scored is None:
                continue
            score, info = scored
            if score > top:
                top, chosen = score, (quad, cnt, info)
        return chosen

    # 경계선으로 찾히면 그대로 씁니다 (가장 정확하고 빠릅니다).
    best = pick(edge_cnts)

    # ── ② 안 되면 종이 색으로 찾기 (밝기 기준을 여러 개 두고 시도) ───
    if best is None:
        cands = []
        for mask in _paper_masks(img_bgr):
            mc, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            cands += sorted(mc, key=cv2.contourArea, reverse=True)[:C.CONTOUR_TOP_N]
        best = pick(cands)

    if best is None:
        if dbg is not None:
            vis = img_bgr.copy()
            cv2.drawContours(vis, edge_cnts, -1, (0, 0, 255), 2)
            put_label(vis, "PAPER NOT FOUND", (20, 50), (0, 0, 255))
            dbg.save("top_paper", vis)
        raise paper_not_found()

    quad, cnt, info = best

    if info["area_ratio"] < C.PAPER_SMALL_AREA_WARN:
        warnings.append(
            f"종이가 사진에서 너무 작습니다(화면의 {info['area_ratio'] * 100:.0f}%). "
            "더 가까이서 찍으면 훨씬 정확합니다."
        )

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
        put_label(vis, f"A4 found  aspect={info['aspect']:.3f} (A4=1.414)", (20, 44))
        put_label(vis, f"step={info['step']:.0f}  chroma={info['chroma']:.0f}  bend={bend * 100:.1f}%", (20, 84))
        dbg.save("top_paper", vis)

    return quad, warnings, _quality(info["aspect_err"], bend, info["area_ratio"])
