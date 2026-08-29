"""
top/segment.py — [SPEC A4] 펴진 종이 사진에서 발만 잘라냅니다.

배경이 흰 종이라서 AI 모델 없이 고전적인 방법만으로 됩니다.
색공간을 LAB 으로 바꾸는 이유: 밝기(L)와 색감(a,b)이 분리돼 있어
"그림자(어둡지만 색은 종이와 같음)"와 "발(색이 다름)"을 구분하기 좋습니다.
"""

from __future__ import annotations

import cv2
import numpy as np

from .. import config as C
from ..debug import COLOR_FOOT, DebugSaver, mask_overlay, put_label
from ..errors import foot_not_found


def _paper_color_lab(lab: np.ndarray) -> np.ndarray:
    """
    종이 색(LAB)을 추정합니다.
    캔버스 가장자리(좌우 띠 + 위쪽 띠)는 거의 항상 종이이므로 거기서 중앙값을 뽑습니다.
    아래쪽은 뒤꿈치가 닿아 있을 수 있어 제외합니다.
    """
    h, w = lab.shape[:2]
    band = max(4, int(w * C.TOP_PAPER_SAMPLE_BAND_RATIO))
    y_end = int(h * (1.0 - C.TOP_PAPER_SAMPLE_EXCLUDE_BOTTOM))
    samples = [
        lab[:y_end, :band].reshape(-1, 3),
        lab[:y_end, w - band:].reshape(-1, 3),
        lab[:band, :].reshape(-1, 3),
    ]
    return np.median(np.concatenate(samples, axis=0), axis=0)


def _largest_component(mask: np.ndarray) -> tuple[np.ndarray, dict]:
    """가장 큰 덩어리 하나만 남깁니다 (발은 하나뿐이므로)."""
    n, labels, stats, _ = cv2.connectedComponentsWithStats((mask > 0).astype(np.uint8), 8)
    if n <= 1:
        return np.zeros_like(mask), {}
    idx = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    out = np.where(labels == idx, 255, 0).astype(np.uint8)
    info = {
        "area_px": int(stats[idx, cv2.CC_STAT_AREA]),
        "x": int(stats[idx, cv2.CC_STAT_LEFT]),
        "y": int(stats[idx, cv2.CC_STAT_TOP]),
        "w": int(stats[idx, cv2.CC_STAT_WIDTH]),
        "h": int(stats[idx, cv2.CC_STAT_HEIGHT]),
    }
    return out, info


def _fill_holes(mask: np.ndarray) -> np.ndarray:
    """발 안쪽의 구멍(발톱 하이라이트 등)을 메웁니다."""
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    filled = np.zeros_like(mask)
    cv2.drawContours(filled, contours, -1, 255, thickness=cv2.FILLED)
    return filled


def _clean(mask: np.ndarray) -> np.ndarray:
    """모폴로지로 잡티를 정리합니다. (close = 구멍 메우기, open = 잔털 제거)"""
    k_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (C.TOP_MORPH_CLOSE, C.TOP_MORPH_CLOSE))
    k_open = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (C.TOP_MORPH_OPEN, C.TOP_MORPH_OPEN))
    m = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k_close)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, k_open)
    return m


def _smooth_contour(mask: np.ndarray) -> np.ndarray:
    """윤곽선을 살짝 단순화해 노이즈를 줄입니다."""
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return mask
    cnt = max(contours, key=cv2.contourArea)
    approx = cv2.approxPolyDP(cnt, C.TOP_CONTOUR_SMOOTH_EPS_PX, True)
    out = np.zeros_like(mask)
    cv2.drawContours(out, [approx], -1, 255, thickness=cv2.FILLED)
    return out


def segment_foot(warped_bgr: np.ndarray, dbg: DebugSaver | None = None) -> tuple[np.ndarray, list[str]]:
    """
    펴진 종이 이미지에서 발 마스크(흰=발)를 만듭니다.
    돌려주는 값: (마스크, 경고 목록)
    """
    warnings: list[str] = []
    h, w = warped_bgr.shape[:2]
    lab = cv2.cvtColor(cv2.GaussianBlur(warped_bgr, C.BLUR_KERNEL, 0), cv2.COLOR_BGR2LAB).astype(np.float32)
    paper = _paper_color_lab(lab)

    # 종이 색에서 얼마나 떨어졌는지 (L, a, b 를 모두 씁니다 = 피부톤 보정)
    dist = np.linalg.norm(lab - paper[None, None, :], axis=2)
    dist_u8 = np.clip(dist, 0, 255).astype(np.uint8)

    def build(threshold: float) -> np.ndarray:
        m = (dist >= threshold).astype(np.uint8) * 255
        m = _clean(m)
        m = _fill_holes(m)
        return m

    # Otsu 로 자동 임계값을 구하되, config 의 최소값보다는 낮아지지 않게 합니다.
    # (발이 아예 없는 사진에서 그림자를 발로 잡는 사고를 막습니다)
    otsu_t, _ = cv2.threshold(dist_u8, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    threshold = max(float(otsu_t), C.TOP_COLOR_DIST_MIN)

    mask = build(threshold)
    best, info = _largest_component(mask)
    min_area_px = C.TOP_MIN_BLOB_AREA_MM2 * (C.PX_PER_MM ** 2)

    # 폴백: 그림자가 짙어 실패하면 적응형 이진화로 다시 시도 (SPEC A4 폴백)
    if not info or info["area_px"] < min_area_px:
        warnings.append("일반 방식으로 발을 찾지 못해 보조 방식(적응형 이진화)으로 재시도했습니다.")
        gray = cv2.cvtColor(warped_bgr, cv2.COLOR_BGR2GRAY)
        adapt = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV,
            C.TOP_ADAPTIVE_BLOCK, C.TOP_ADAPTIVE_C,
        )
        adapt = _clean(adapt)
        adapt = _fill_holes(adapt)
        best, info = _largest_component(adapt)

    if not info or info["area_px"] < min_area_px:
        if dbg is not None:
            dbg.save("top_mask", mask_overlay(warped_bgr, mask, COLOR_FOOT))
        raise foot_not_found(detail="종이 위에서 발만 한 크기의 덩어리를 찾지 못했습니다")

    best = _smooth_contour(best)

    # 발이 종이 밖으로 나갔는지 확인 (좌/우/위 경계에 닿으면 잘렸다는 뜻)
    touch = []
    if best[:, 0].any():
        touch.append("왼쪽")
    if best[:, -1].any():
        touch.append("오른쪽")
    if best[0, :].any():
        touch.append("위쪽")
    if touch:
        warnings.append(
            f"발이 종이 {'/'.join(touch)} 밖으로 나간 것 같습니다. "
            "발 전체가 종이 안에 들어오게 다시 찍어 주세요. 측정값이 짧게 나올 수 있습니다."
        )

    if dbg is not None:
        vis = mask_overlay(warped_bgr, best, COLOR_FOOT)
        cnts, _ = cv2.findContours(best, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(vis, cnts, -1, COLOR_FOOT, 4)
        area_mm2 = info["area_px"] / (C.PX_PER_MM ** 2)
        put_label(vis, f"foot mask  thr={threshold:.1f}  area={area_mm2:.0f}mm2", (30, 70), scale=2.0, thick=4)
        dbg.save("top_mask", vis)

    return best, warnings
