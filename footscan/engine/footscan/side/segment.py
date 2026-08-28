"""
side/segment.py — [SPEC B3] 측면 사진에서 발만 잘라냅니다.

상면과 달리 배경이 흰 종이가 아니라 '방바닥과 벽'이라서 색만으로는 어렵습니다.
두 가지 길을 준비했습니다.

  경로 1 (권장) : rembg(U2Net) 로 배경을 지우고 알파 채널을 마스크로 씁니다.
                  설치돼 있으면 자동으로 이 길을 씁니다.
  경로 2 (폴백) : 배경 색을 학습해서 색이 다른 부분을 발로 봅니다.
                  rembg 가 없거나 실패하면 이 길로 갑니다.
                  이때는 "발 뒤에 어두운 색 수건/종이를 놓아 주세요" 안내가 붙습니다.

두 경우 모두 마지막에 바닥선 아래는 잘라냅니다 (반사·그림자 제거).
"""

from __future__ import annotations

import cv2
import numpy as np

from .. import config as C
from ..debug import COLOR_FOOT, DebugSaver, mask_overlay, put_label
from ..errors import foot_not_found
from .reference import SideReference

_REMBG_SESSION = None
_REMBG_TRIED = False


def _try_rembg(img_bgr: np.ndarray) -> np.ndarray | None:
    """rembg 가 설치돼 있으면 그걸로 배경을 지웁니다. 없으면 None."""
    global _REMBG_SESSION, _REMBG_TRIED
    try:
        if not _REMBG_TRIED:
            _REMBG_TRIED = True
            from rembg import new_session      # type: ignore
            _REMBG_SESSION = new_session("u2net")
        if _REMBG_SESSION is None:
            return None
        from rembg import remove               # type: ignore
        rgba = remove(cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB), session=_REMBG_SESSION)
        alpha = np.array(rgba)[:, :, 3]
        return (alpha > 127).astype(np.uint8) * 255
    except Exception:
        _REMBG_SESSION = None
        return None


def _background_clusters(lab: np.ndarray, floor_y: float, k: int = 3) -> np.ndarray:
    """
    사진 좌우 가장자리에서 배경 색을 배웁니다.
    벽·바닥·종이처럼 배경이 여러 색일 수 있으므로 k개의 대표색으로 나눕니다.
    """
    h, w = lab.shape[:2]
    m = max(4, int(w * C.SIDE_BG_SAMPLE_MARGIN_RATIO))
    y_end = int(min(h, floor_y + 1))
    samples = np.concatenate([
        lab[:y_end, :m].reshape(-1, 3),
        lab[:y_end, w - m:].reshape(-1, 3),
    ], axis=0).astype(np.float32)
    if len(samples) > 20000:                      # 속도를 위해 솎아냅니다
        samples = samples[:: len(samples) // 20000 + 1]
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    _, _, centers = cv2.kmeans(samples, k, None, crit, 3, cv2.KMEANS_PP_CENTERS)
    return centers


def _largest_touching_floor(mask: np.ndarray, floor_y: float, px_per_mm: float) -> np.ndarray:
    """
    바닥선에 닿아 있는 덩어리 중 가장 큰 것만 남깁니다.
    (공중에 뜬 물체나 벽의 얼룩을 발로 오인하지 않게 합니다)
    """
    band = int(max(2, C.SIDE_FOOT_MUST_TOUCH_FLOOR_MM * px_per_mm))
    y0 = int(max(0, floor_y - band))
    y1 = int(min(mask.shape[0], floor_y + 2))
    n, labels, stats, _ = cv2.connectedComponentsWithStats((mask > 0).astype(np.uint8), 8)
    best_i, best_area = -1, 0
    for i in range(1, n):
        if not (labels[y0:y1, :] == i).any():
            continue
        if stats[i, cv2.CC_STAT_AREA] > best_area:
            best_i, best_area = i, int(stats[i, cv2.CC_STAT_AREA])
    if best_i < 0:
        return np.zeros_like(mask)
    return np.where(labels == best_i, 255, 0).astype(np.uint8)


def _fill_holes(mask: np.ndarray) -> np.ndarray:
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    out = np.zeros_like(mask)
    cv2.drawContours(out, cnts, -1, 255, thickness=cv2.FILLED)
    return out


def _postprocess(mask: np.ndarray, ref: SideReference) -> np.ndarray:
    """공통 뒷정리: 바닥선 아래 자르기 → 모폴로지 → 구멍 메우기 → 바닥에 닿은 최대 덩어리."""
    mask = mask.copy()
    mask[int(ref.floor_y) + 1:, :] = 0
    k_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (C.SIDE_MORPH_CLOSE, C.SIDE_MORPH_CLOSE))
    k_open = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (C.SIDE_MORPH_OPEN, C.SIDE_MORPH_OPEN))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k_close)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k_open)
    mask = _fill_holes(mask)
    return _largest_touching_floor(mask, ref.floor_y, ref.px_per_mm)


def segment_foot_side(ref: SideReference, dbg: DebugSaver | None = None) -> tuple[np.ndarray, list[str]]:
    """
    회전 보정된 측면 사진에서 발 마스크를 만듭니다.
    돌려주는 값: (마스크, 경고 목록)
    """
    warnings: list[str] = []
    img = ref.image
    h, w = img.shape[:2]

    mask = _try_rembg(img)
    method = "rembg(U2Net)"

    if mask is None:
        method = "색 기반(폴백)"
        warnings.append(
            "rembg 가 없어 색 기반 분할로 처리했습니다. "
            "발 뒤에 어두운 색 수건이나 종이를 놓고 찍으면 훨씬 정확합니다."
        )
        lab = cv2.cvtColor(cv2.GaussianBlur(img, C.BLUR_KERNEL, 0), cv2.COLOR_BGR2LAB).astype(np.float32)
        # 배경 = 벽 + 바닥 + "바닥에 놓인 A4 종이".
        # 종이도 배경 목록에 넣어야 종이를 발로 착각하지 않습니다.
        centers = np.vstack([_background_clusters(lab, ref.floor_y), ref.paper_lab[None, :]])

        # 각 픽셀이 '가장 가까운 배경색'에서 얼마나 떨어져 있는지
        d = np.stack([np.linalg.norm(lab - c[None, None, :], axis=2) for c in centers], axis=0)
        dist = d.min(axis=0)

        # 종이(그림자 진 종이 포함)와 바닥선 아래는 판단에서 아예 뺍니다.
        # 색감(a,b)만 비교하는 것이 핵심 — 그림자는 밝기만 바꾸고 색은 그대로입니다.
        chroma = np.linalg.norm(lab[:, :, 1:] - ref.paper_lab[None, None, 1:], axis=2)
        ignore = (chroma < C.SIDE_PAPER_CHROMA_TOL) & \
                 (lab[:, :, 0] > C.SIDE_PAPER_MIN_L_RATIO * float(ref.paper_lab[0]))
        ignore[int(ref.floor_y) + 1:, :] = True
        dist_valid = dist.copy()
        dist_valid[ignore] = 0

        # 사진마다 조명이 달라서, 임계값은 Otsu 로 자동으로 정합니다.
        d8 = np.clip(dist_valid, 0, 255).astype(np.uint8)
        otsu_t, _ = cv2.threshold(d8, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        auto_t = float(np.clip(otsu_t, C.SIDE_COLOR_DIST_FLOOR, C.SIDE_COLOR_DIST_CEIL))

        def build(t: float) -> np.ndarray:
            m = ((dist >= t) & (~ignore)).astype(np.uint8) * 255
            return _postprocess(m, ref)

        mask = build(auto_t)
        lo, hi = C.SIDE_MASK_AREA_RANGE
        ratio = float((mask > 0).sum()) / (h * w)
        if not (lo <= ratio <= hi):
            # 자동값이 실패하면 고정 임계값으로 한 번 더 시도합니다
            warnings.append("자동 임계값으로 발을 찾지 못해 고정 임계값으로 재시도했습니다.")
            mask = build(C.SIDE_COLOR_DIST_MIN)
        method += f" thr={auto_t:.0f}"
    else:
        mask = _postprocess(mask, ref)

    area_ratio = float((mask > 0).sum()) / (h * w)
    lo, hi = C.SIDE_MASK_AREA_RANGE
    if not (lo <= area_ratio <= hi):
        if dbg is not None:
            dbg.save("side_mask", mask_overlay(img, mask, COLOR_FOOT))
        raise foot_not_found(
            stage="B3 측면 발 분할",
            detail=f"발로 볼 만한 덩어리를 찾지 못했습니다(면적 {area_ratio*100:.1f}%)",
            hint="발 뒤에 어두운 색 수건이나 종이를 놓고, 발 전체가 화면에 들어오게 다시 찍어 주세요.",
        )

    if C.SIDE_GRABCUT_ITERS > 0:
        gc = np.full(mask.shape, cv2.GC_PR_BGD, np.uint8)
        gc[mask > 0] = cv2.GC_PR_FGD
        er = cv2.erode(mask, np.ones((25, 25), np.uint8))
        gc[er > 0] = cv2.GC_FGD
        bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
        cv2.grabCut(img, gc, None, bgd, fgd, C.SIDE_GRABCUT_ITERS, cv2.GC_INIT_WITH_MASK)
        mask = np.where((gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
        mask[int(ref.floor_y) + 1:, :] = 0
        mask = _largest_touching_floor(mask, ref.floor_y, ref.px_per_mm)

    if dbg is not None:
        vis = mask_overlay(img, mask, COLOR_FOOT)
        cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(vis, cnts, -1, COLOR_FOOT, 3)
        put_label(vis, f"side mask ({method})  area={area_ratio*100:.1f}%", (20, 44))
        dbg.save("side_mask", vis)

    return mask, warnings
