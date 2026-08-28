"""
side/reference.py — [SPEC B2] 측면 사진에서 "기준 자"를 찾습니다.

여기가 측면 파이프라인에서 가장 중요한 부분입니다. (SPEC 1-3)

왜 어려운가?
  상면은 A4가 발과 같은 평면(바닥)에 있어서 원근을 완벽히 펼 수 있습니다.
  하지만 측면에서 재려는 대상(발 안쪽면)은 "서 있는 면"이고 A4는 "누워 있는 면"입니다.
  평면이 다르면 같은 배율을 쓸 수 없습니다.

채택한 해법:
  사용자가 발 안쪽 라인을 A4의 긴 변에 맞춰 딛게 합니다.
  그러면 [A4의 가까운 긴 변]과 [발 안쪽면]이 거의 같은 수직 평면에 놓입니다.
    · 그 변의 화면상 길이 = 297mm  → 배율(px_per_mm) 확정
    · 그 변 자체가 바닥선(높이 0) 역할
  추가 도구가 전혀 필요 없다는 게 이 방식의 장점입니다.

발이 종이를 가려서 종이가 좌우로 쪼개져 보이는 게 정상입니다.
그래서 "사각형 하나"를 찾지 않고 "밝은 영역들의 아래쪽 경계에 맞는 직선 하나"를 찾습니다.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import cv2
import numpy as np

from .. import config as C
from ..debug import COLOR_FLOOR, COLOR_PAPER, DebugSaver, put_label
from ..errors import side_ref_not_found


@dataclass
class SideReference:
    """측면 사진의 기준 정보."""

    px_per_mm: float                 # 1mm 가 몇 픽셀인지
    floor_y: float                   # 회전 보정 후 바닥선의 세로 위치
    x_left: float                    # 바닥선(=A4 긴 변) 왼쪽 끝
    x_right: float                   # 오른쪽 끝
    rotation_deg: float              # 사진을 얼마나 돌려서 폈는지
    image: np.ndarray = field(repr=False)        # 회전 보정된 사진
    paper_mask: np.ndarray = field(repr=False)   # 회전 보정된 종이(밝은 영역) 마스크
    paper_lab: np.ndarray = field(repr=False)    # 종이의 대표 색 (LAB). 배경 모델에 씁니다
    warnings: list[str] = field(default_factory=list)


def _bright_masks(gray: np.ndarray, y_start: int):
    """밝기 임계값을 여러 개 시도해 가며 '종이 후보' 마스크를 하나씩 내놓습니다."""
    roi = gray[y_start:, :]
    otsu_t, _ = cv2.threshold(roi, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    thresholds = [float(otsu_t)] + [float(np.percentile(roi, p)) for p in C.SIDE_BRIGHT_PERCENTILES]

    for t in thresholds:
        m = np.zeros_like(gray)
        m[y_start:, :] = (roi >= t).astype(np.uint8) * 255
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
        yield t, m


def _bottom_boundary_points(mask: np.ndarray, min_area: float, y_start: int) -> tuple[np.ndarray, np.ndarray]:
    """
    밝은 덩어리들의 '아래쪽 경계'를 점으로 모읍니다.
    A4 의 가까운 긴 변이 바로 이 아래쪽 경계입니다.

    ★ 검색 영역 맨 윗줄에 닿는 덩어리는 버립니다.
       바닥의 종이는 아래쪽에 '띠'로 보이지만, 밝은 벽은 위로 계속 이어지기 때문입니다.
       (이 규칙이 없으면 '벽과 바닥의 경계선'을 종이의 긴 변으로 착각합니다)

    돌려주는 값: (경계점들, 살아남은 덩어리 마스크)
    """
    n, labels, stats, _ = cv2.connectedComponentsWithStats((mask > 0).astype(np.uint8), 8)
    keep = np.zeros_like(mask)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] < min_area:
            continue
        if C.SIDE_REJECT_TOP_TOUCHING and stats[i, cv2.CC_STAT_TOP] <= y_start:
            continue
        keep[labels == i] = 255
    if not keep.any():
        return np.empty((0, 2), np.float32), keep

    pts = []
    for c in range(keep.shape[1]):
        rows = np.where(keep[:, c] > 0)[0]
        if rows.size:
            pts.append([c, rows.max()])
    return np.array(pts, np.float32), keep


def _fit_robust_line(pts: np.ndarray, tol: float) -> tuple[np.ndarray, np.ndarray]:
    """
    점들에 직선을 맞추되, 엉뚱한 점(종이의 좌우 비스듬한 변 등)에 끌려가지 않게
    두 번 맞춥니다. 돌려주는 값: (직선 [vx,vy,x0,y0], 그 직선 위의 점들)
    """
    line = cv2.fitLine(pts, cv2.DIST_HUBER, 0, 0.01, 0.01).ravel()
    for _ in range(2):
        vx, vy, x0, y0 = line
        # 직선에서 떨어진 거리 (외적)
        d = np.abs((pts[:, 0] - x0) * vy - (pts[:, 1] - y0) * vx)
        inl = pts[d <= tol]
        if len(inl) < 10:
            break
        line = cv2.fitLine(inl, cv2.DIST_L2, 0, 0.01, 0.01).ravel()
    vx, vy, x0, y0 = line
    d = np.abs((pts[:, 0] - x0) * vy - (pts[:, 1] - y0) * vx)
    return line, pts[d <= tol]


def _paper_color_lab(img_bgr: np.ndarray, inliers: np.ndarray) -> np.ndarray:
    """
    바닥선 바로 위쪽 띠에서 '종이 색'을 뽑아냅니다.

    이 띠에는 종이와 발이 섞여 있습니다(발이 종이를 가리므로).
    둘은 밝기가 확실히 다르므로 Otsu 로 두 무리로 나눈 뒤 밝은 쪽을 종이로 봅니다.
    → 나중에 발 분할에서 종이를 '배경'으로 처리하는 데 씁니다.
    """
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    h, w = img_bgr.shape[:2]
    picks = []
    for x, y in inliers.astype(int):
        y0 = max(0, y - 16)
        y1 = max(0, y - 3)
        if y1 > y0 and 0 <= x < w:
            picks.append(lab[y0:y1, x])
    if not picks:
        return np.array([245.0, 128.0, 128.0], np.float32)
    band = np.concatenate(picks, axis=0).astype(np.float32)
    lch = np.clip(band[:, 0], 0, 255).astype(np.uint8)
    t, _ = cv2.threshold(lch, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    bright = band[band[:, 0] >= float(t)]
    if len(bright) < 20:
        bright = band
    return np.median(bright, axis=0).astype(np.float32)


def detect_reference(img_bgr: np.ndarray, dbg: DebugSaver | None = None) -> SideReference:
    """
    측면 사진에서 A4 긴 변(=바닥선)을 찾아 배율과 바닥 높이를 정합니다.
    실패하면 SIDE_REF_NOT_FOUND 에러를 냅니다.
    """
    warnings: list[str] = []
    h, w = img_bgr.shape[:2]
    gray = cv2.GaussianBlur(cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY), C.BLUR_KERNEL, 0)
    y_start = int(h * C.SIDE_REF_SEARCH_TOP_RATIO)
    min_area = C.SIDE_PAPER_MIN_AREA_RATIO * h * w
    tol = C.SIDE_REF_INLIER_TOL_RATIO * w

    found = None
    tried: list[str] = []
    for thr, raw_mask in _bright_masks(gray, y_start):
        pts, mask = _bottom_boundary_points(raw_mask, min_area, y_start)
        if len(pts) < 20:
            tried.append(f"thr={thr:.0f}:점부족")
            continue
        line, inliers = _fit_robust_line(pts, tol)
        if len(inliers) < 20:
            tried.append(f"thr={thr:.0f}:직선없음")
            continue

        vx, vy, x0, y0 = line
        tilt = math.degrees(math.atan2(float(vy), float(vx)))
        if tilt > 90:
            tilt -= 180
        if tilt < -90:
            tilt += 180
        if abs(tilt) > C.SIDE_REF_EDGE_MAX_TILT_DEG:
            tried.append(f"thr={thr:.0f}:기울기{tilt:.0f}도")
            continue

        xl, xr = float(inliers[:, 0].min()), float(inliers[:, 0].max())
        seg_len = math.hypot(xr - xl, (xr - xl) * vy / vx if abs(vx) > 1e-6 else 0.0)
        if seg_len < C.SIDE_REF_EDGE_MIN_WIDTH_RATIO * w:
            tried.append(f"thr={thr:.0f}:너무짧음({seg_len/w:.2f})")
            continue

        y_mid = y0 + ((xl + xr) / 2 - x0) * (vy / vx if abs(vx) > 1e-6 else 0.0)
        if y_mid < C.SIDE_REF_EDGE_MIN_Y_RATIO * h:
            tried.append(f"thr={thr:.0f}:위치가너무높음")
            continue

        # 종이 띠가 너무 두꺼우면(위로 크게 뻗어 있으면) 종이가 아닙니다
        ys_m = np.where(mask.max(axis=1) > 0)[0]
        band_h = float(ys_m.max() - ys_m.min() + 1) if ys_m.size else 0.0
        if band_h > C.SIDE_REF_BAND_MAX_HEIGHT_RATIO * seg_len:
            tried.append(f"thr={thr:.0f}:띠가너무두꺼움")
            continue

        found = (thr, mask, line, inliers, seg_len, tilt)
        break

    if found is None:
        if dbg is not None:
            vis = img_bgr.copy()
            put_label(vis, "SIDE REF NOT FOUND", (20, 50), (0, 0, 255))
            dbg.save("side_ref", vis)
        raise side_ref_not_found(detail=" / ".join(tried[:4]))

    thr, mask, line, inliers, seg_len, tilt = found
    vx, vy, x0, y0 = line
    px_per_mm = seg_len / C.A4_LONG_MM
    paper_lab = _paper_color_lab(img_bgr, inliers)

    if dbg is not None:
        vis = img_bgr.copy()
        vis[mask > 0] = (0.5 * vis[mask > 0] + 0.5 * np.array(COLOR_PAPER)).astype(np.uint8)
        xl, xr = float(inliers[:, 0].min()), float(inliers[:, 0].max())
        yl = y0 + (xl - x0) * vy / vx
        yr = y0 + (xr - x0) * vy / vx
        cv2.line(vis, (int(xl), int(yl)), (int(xr), int(yr)), COLOR_FLOOR, 4)
        cv2.circle(vis, (int(xl), int(yl)), 12, COLOR_FLOOR, -1)
        cv2.circle(vis, (int(xr), int(yr)), 12, COLOR_FLOOR, -1)
        put_label(vis, f"ref edge = 297mm  len={seg_len:.0f}px  {px_per_mm:.3f}px/mm", (20, 44))
        put_label(vis, f"tilt={tilt:.1f}deg  bright_thr={thr:.0f}", (20, 84))
        dbg.save("side_ref", vis)

    # --- 기준 변이 수평이 되도록 사진을 돌립니다 ---
    M = cv2.getRotationMatrix2D((w / 2.0, h / 2.0), tilt, 1.0)
    rot = cv2.warpAffine(img_bgr, M, (w, h), borderMode=cv2.BORDER_REPLICATE)
    rot_paper = cv2.warpAffine(mask, M, (w, h), flags=cv2.INTER_NEAREST)

    def tf(x: float, y: float) -> tuple[float, float]:
        return (float(M[0, 0] * x + M[0, 1] * y + M[0, 2]),
                float(M[1, 0] * x + M[1, 1] * y + M[1, 2]))

    xl, xr = float(inliers[:, 0].min()), float(inliers[:, 0].max())
    p1 = tf(xl, y0 + (xl - x0) * vy / vx)
    p2 = tf(xr, y0 + (xr - x0) * vy / vx)
    floor_y = (p1[1] + p2[1]) / 2.0

    if abs(tilt) > C.SIDE_REF_EDGE_MAX_TILT_DEG * 0.5:
        warnings.append(
            f"휴대폰이 {abs(tilt):.0f}도 기울어져 있었습니다. "
            "지면과 수직으로 세워서 찍으면 아치 측정이 더 정확합니다."
        )

    if dbg is not None:
        vis = rot.copy()
        cv2.line(vis, (int(p1[0]), int(floor_y)), (int(p2[0]), int(floor_y)), COLOR_FLOOR, 4)
        put_label(vis, f"rotated by {tilt:.1f}deg   floor_y={floor_y:.0f}", (20, 44))
        put_label(vis, "red line = floor (height 0) = A4 long edge (297mm)", (20, 84), scale=0.7, thick=2)
        dbg.save("side_rotated", vis)

    return SideReference(
        px_per_mm=px_per_mm, floor_y=floor_y,
        x_left=min(p1[0], p2[0]), x_right=max(p1[0], p2[0]),
        rotation_deg=tilt, image=rot, paper_mask=rot_paper, paper_lab=paper_lab,
        warnings=warnings,
    )
