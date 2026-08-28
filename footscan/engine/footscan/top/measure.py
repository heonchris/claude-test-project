"""
top/measure.py — [SPEC A5] 발 마스크에서 실제 치수를 뽑아냅니다.

이 단계에서는 이미 1px = 0.1mm 로 고정돼 있으므로
"픽셀로 잰 거리 ÷ 10 = mm" 입니다.

순서:
  1) PCA 로 발의 주축을 찾아 세로로 세운다 (비뚤게 놓아도 보정)
  2) 어느 쪽이 뒤꿈치인지 자동 판별 (뒤꿈치는 둥글고, 발끝은 뾰족함)
  3) 길이 / 발볼 너비 / 뒤꿈치 너비
  4) 발가락 형태 (이집트형 / 그리스형 / 로마형)
  5) 무지외반 각도 근사  ※ 외형 기반 "추정"이며 의학적 진단이 아닙니다
"""

from __future__ import annotations

import math

import cv2
import numpy as np
from scipy.signal import find_peaks

from .. import config as C
from ..debug import COLOR_FOOT, COLOR_MEASURE, DebugSaver, put_label
from ..errors import foot_not_found
from ..schemas import TopMeasurement

PPM = C.PX_PER_MM


# --------------------------------------------------------------------------
# 1. 주축 정렬
# --------------------------------------------------------------------------

def align_by_pca(mask: np.ndarray, img: np.ndarray | None = None):
    """
    PCA(주성분 분석)로 발이 가장 길게 뻗은 방향을 찾아 세로로 세웁니다.
    발을 종이 위에 비뚤게 올려놔도 길이를 제대로 재기 위한 단계입니다.
    """
    ys, xs = np.where(mask > 0)
    if len(xs) < 10:
        raise foot_not_found(detail="마스크가 너무 작습니다")
    pts = np.stack([xs, ys], axis=1).astype(np.float64)
    mean, eigvecs = cv2.PCACompute(pts, mean=None, maxComponents=2)
    dx, dy = float(eigvecs[0][0]), float(eigvecs[0][1])

    # 주축이 이미지 아래쪽(+y)을 향하도록 회전 각도를 계산합니다
    angle_deg = math.degrees(math.atan2(-dx, dy))
    cx, cy = float(mean[0][0]), float(mean[0][1])

    h, w = mask.shape[:2]
    diag = int(math.hypot(h, w)) + 8
    M = cv2.getRotationMatrix2D((cx, cy), angle_deg, 1.0)
    M[0, 2] += diag / 2 - cx
    M[1, 2] += diag / 2 - cy

    mask_rot = cv2.warpAffine(mask, M, (diag, diag), flags=cv2.INTER_NEAREST)
    img_rot = cv2.warpAffine(img, M, (diag, diag)) if img is not None else None
    return mask_rot, img_rot, M, angle_deg


def _row_spans(mask: np.ndarray) -> dict[int, tuple[int, int]]:
    """행마다 발이 차지하는 (왼쪽 끝, 오른쪽 끝) 열 번호."""
    spans = {}
    rows = np.where(mask.max(axis=1) > 0)[0]
    for r in rows:
        cols = np.where(mask[r] > 0)[0]
        spans[int(r)] = (int(cols.min()), int(cols.max()))
    return spans


def orient_heel_down(mask: np.ndarray, img: np.ndarray | None = None):
    """
    뒤꿈치가 아래(이미지의 큰 y)로 오도록 필요하면 180도 돌립니다.
    판별 방법: 양 끝에서 조금 들어간 지점의 폭을 비교합니다.
      · 발끝은 발가락 하나만 있어 폭이 아주 좁습니다
      · 뒤꿈치는 둥글어서 폭이 넓습니다
    """
    spans = _row_spans(mask)
    rows = sorted(spans)
    r0, r1 = rows[0], rows[-1]
    length = r1 - r0
    probe = max(1, int(length * C.END_PROBE_RATIO))

    def width_at(r: int) -> int:
        r = int(np.clip(r, r0, r1))
        if r not in spans:
            return 0
        a, b = spans[r]
        return b - a

    w_top = width_at(r0 + probe)      # 이미지 위쪽 끝
    w_bottom = width_at(r1 - probe)   # 이미지 아래쪽 끝

    if w_top > w_bottom:
        # 위쪽이 더 넓다 = 위쪽이 뒤꿈치 → 뒤집는다
        mask = cv2.rotate(mask, cv2.ROTATE_180)
        if img is not None:
            img = cv2.rotate(img, cv2.ROTATE_180)
        return mask, img, True
    return mask, img, False


# --------------------------------------------------------------------------
# 2. 발가락 분석
# --------------------------------------------------------------------------

def _toe_profile(mask: np.ndarray, r_heel: int, r_toe: int) -> tuple[np.ndarray, np.ndarray]:
    """
    발끝 쪽 윤곽의 "높이 프로파일"을 만듭니다.
    각 세로줄(열)마다 가장 발끝에 가까운 점이 뒤꿈치로부터 몇 mm 인지를 모읍니다.
    발가락 5개가 있으면 봉우리 5개가 나옵니다.
    """
    cols = np.where(mask.max(axis=0) > 0)[0]
    xs, heights = [], []
    for c in cols:
        rows = np.where(mask[:, c] > 0)[0]
        if rows.size == 0:
            continue
        xs.append(int(c))
        heights.append((r_heel - int(rows.min())) / PPM)   # 뒤꿈치에서의 거리(mm)
    return np.array(xs), np.array(heights)


def analyze_toes(mask: np.ndarray, r_heel: int, r_toe: int) -> tuple[str, int, list[dict]]:
    """
    발가락 봉우리를 찾아 발가락 형태를 판정합니다.
      egyptian = 엄지가 가장 김 / greek = 검지가 가장 김 / roman = 엄지≈검지

    핵심: "봉우리가 주변 골짜기보다 얼마나 솟았는지(prominence)"로 거릅니다.
          발가락 사이는 깊게 파이므로 크게 솟고,
          발 옆선의 완만한 굴곡은 거의 안 솟습니다.
    """
    length_mm = (r_heel - r_toe) / PPM
    xs, hs = _toe_profile(mask, r_heel, r_toe)
    if len(xs) < 5:
        return "roman", 0, []

    peaks, props = find_peaks(
        hs,
        distance=max(2, int(C.TOE_PEAK_MIN_DISTANCE_MM * PPM)),
        prominence=C.TOE_PEAK_MIN_PROMINENCE_MM,
    )
    # 발가락 구간(발끝에서 TOE_REGION_RATIO 안쪽)에 있는 봉우리만 남깁니다
    cut = length_mm * (1.0 - C.TOE_REGION_RATIO)
    keep = [i for i, p in enumerate(peaks) if hs[p] >= cut]
    peaks = peaks[keep]
    proms = props["prominences"][keep] if len(keep) else np.array([])

    if len(peaks) == 0:
        return "roman", 0, []

    # 봉우리가 5개보다 많으면 많이 솟은 순으로 5개만 남깁니다 (발가락은 5개)
    if len(peaks) > 5:
        top5 = np.argsort(proms)[-5:]
        peaks, proms = peaks[np.sort(top5)], proms[np.sort(top5)]

    toes = []
    for p_i in peaks:
        # 이 봉우리의 "밑동 폭" (엄지를 찾는 데 씁니다. 엄지가 가장 굵습니다)
        lvl = hs[p_i] - 6.0
        li = p_i
        while li > 0 and hs[li - 1] >= lvl:
            li -= 1
        ri = p_i
        while ri < len(hs) - 1 and hs[ri + 1] >= lvl:
            ri += 1
        toes.append({
            "x": int(xs[p_i]),
            "protrusion_mm": float(hs[p_i]),
            "base_width_mm": float((xs[ri] - xs[li]) / PPM),
        })

    toes.sort(key=lambda t: t["x"])
    if len(toes) < 2:
        toes[0]["is_hallux"] = True
        return "roman", len(toes), toes

    # 엄지발가락 = 발가락 줄의 양 끝 중 더 굵은 쪽.
    # (좌/우발이든 사진이 뒤집혔든 상관없이 통합니다)
    hallux_idx = 0 if toes[0]["base_width_mm"] >= toes[-1]["base_width_mm"] else len(toes) - 1
    second_idx = hallux_idx + 1 if hallux_idx == 0 else hallux_idx - 1
    diff = toes[hallux_idx]["protrusion_mm"] - toes[second_idx]["protrusion_mm"]

    if abs(diff) < C.TOE_TYPE_ROMAN_TOLERANCE_MM:
        toe_type = "roman"
    elif diff > 0:
        toe_type = "egyptian"
    else:
        toe_type = "greek"

    for i, t in enumerate(toes):
        t["is_hallux"] = (i == hallux_idx)
    return toe_type, len(toes), toes


# --------------------------------------------------------------------------
# 3. 무지외반 각도 근사
# --------------------------------------------------------------------------

def estimate_hallux_valgus(mask: np.ndarray, r_heel: int, r_toe: int,
                           medial_is_left: bool) -> float | None:
    """
    무지외반 각도를 겉모양으로 근사합니다. [SPEC A5]

    재는 방법:
      · 발 내측 기준선 = [뒤꿈치 안쪽 점] → [발볼 안쪽 점]
      · 엄지 바깥쪽 윤곽선 = 발끝쪽 84~96% 구간의 안쪽 윤곽에 직선 맞춤
      · 두 선이 이루는 각

    ⚠ 실제 HVA 는 X-ray 로 뼈의 축을 재는 값입니다.
       여기 값은 "외형 기반 추정"이며, 계통 오차가 있습니다.
       실측값이 생기면 config.HVA_CALIB_SCALE / HVA_CALIB_OFFSET_DEG 로 보정하세요.
    """
    spans = _row_spans(mask)
    length_px = r_heel - r_toe
    if length_px <= 0:
        return None

    def medial_x(row: int) -> int:
        a, b = spans[row]
        return a if medial_is_left else b

    def medial_point(lo: float, hi: float):
        """구간 안에서 가장 안쪽으로 튀어나온 점 하나."""
        best = None
        r_lo = int(round(r_heel - hi * length_px))
        r_hi = int(round(r_heel - lo * length_px))
        for r in range(min(r_lo, r_hi), max(r_lo, r_hi) + 1):
            if r not in spans:
                continue
            x = medial_x(r)
            if best is None or (x < best[0] if medial_is_left else x > best[0]):
                best = (x, r)
        return np.array(best, np.float64) if best else None

    p_heel = medial_point(*C.HEEL_WIDTH_RANGE)
    p_ball = medial_point(*C.BALL_WIDTH_RANGE)
    if p_heel is None or p_ball is None:
        return None
    v_ref = p_ball - p_heel

    lo, hi = C.HVA_HALLUX_EDGE_RANGE
    pts = []
    for r, _ in spans.items():
        t = (r_heel - r) / length_px
        if lo <= t <= hi:
            pts.append([medial_x(r), r])
    if len(pts) < C.HVA_MIN_EDGE_POINTS:
        return None
    vx, vy, _, _ = cv2.fitLine(np.array(pts, np.float32), cv2.DIST_L2, 0, 0.01, 0.01).ravel()
    v_toe = np.array([float(vx), float(vy)])

    def ang(v):
        return math.degrees(math.atan2(v[0], v[1]))

    a = abs(ang(v_ref) - ang(v_toe)) % 180.0
    if a > 90:
        a = 180 - a
    a = a * C.HVA_CALIB_SCALE + C.HVA_CALIB_OFFSET_DEG
    return round(float(a), 1)


# --------------------------------------------------------------------------
# 4. 전체 측정
# --------------------------------------------------------------------------

def measure_top(mask: np.ndarray, warped_bgr: np.ndarray | None = None,
                dbg: DebugSaver | None = None) -> tuple[TopMeasurement, np.ndarray, list[str]]:
    """
    발 마스크에서 상면 치수를 모두 잽니다.
    돌려주는 값: (측정 결과, 정렬된 마스크, 경고 목록)
    """
    warnings: list[str] = []
    mask_rot, img_rot, _, angle = align_by_pca(mask, warped_bgr)
    mask_rot, img_rot, flipped = orient_heel_down(mask_rot, img_rot)

    spans = _row_spans(mask_rot)
    rows = sorted(spans)
    r_toe, r_heel = rows[0], rows[-1]              # 위=발끝, 아래=뒤꿈치
    length_px = r_heel - r_toe
    foot_length_mm = (length_px + 1) / PPM

    def max_width(lo: float, hi: float) -> tuple[float, int, tuple[int, int]]:
        """뒤꿈치 기준 lo~hi 구간에서 가장 넓은 가로폭 (mm, 그 행, 좌우 끝)"""
        best, best_r, best_span = 0, r_heel, (0, 0)
        r_lo = int(round(r_heel - hi * length_px))
        r_hi = int(round(r_heel - lo * length_px))
        for r in range(min(r_lo, r_hi), max(r_lo, r_hi) + 1):
            if r not in spans:
                continue
            a, b = spans[r]
            if b - a > best:
                best, best_r, best_span = b - a, r, (a, b)
        return (best + 1) / PPM, best_r, best_span

    ball_mm, ball_r, ball_span = max_width(*C.BALL_WIDTH_RANGE)
    heel_mm, heel_r, heel_span = max_width(*C.HEEL_WIDTH_RANGE)
    width_ratio = ball_mm / foot_length_mm if foot_length_mm > 0 else 0.0

    toe_type, toe_count, toes = analyze_toes(mask_rot, r_heel, r_toe)
    if toe_count < 4:
        warnings.append(
            f"발가락을 {toe_count}개만 찾았습니다. 발가락 형태 판정이 부정확할 수 있습니다."
        )

    # 엄지가 어느 쪽에 있는지로 발 안쪽(내측) 방향을 정합니다
    medial_is_left = True
    hallux = None
    if toes:
        hallux = next((t for t in toes if t.get("is_hallux")), toes[0])
        center_x = (ball_span[0] + ball_span[1]) / 2 if ball_span[1] else hallux["x"]
        medial_is_left = hallux["x"] < center_x
    hva = estimate_hallux_valgus(mask_rot, r_heel, r_toe, medial_is_left)

    meas = TopMeasurement(
        foot_length_mm=round(foot_length_mm, 1),
        ball_width_mm=round(ball_mm, 1),
        heel_width_mm=round(heel_mm, 1),
        width_ratio=round(width_ratio, 4),
        toe_type=toe_type,
        hallux_valgus_angle_deg=hva,
        toe_count_detected=toe_count,
    )

    if dbg is not None:
        base = img_rot if img_rot is not None else cv2.cvtColor(mask_rot, cv2.COLOR_GRAY2BGR)
        vis = base.copy()
        cnts, _ = cv2.findContours(mask_rot, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(vis, cnts, -1, COLOR_FOOT, 4)

        cx = int((ball_span[0] + ball_span[1]) / 2)
        cv2.line(vis, (cx, r_toe), (cx, r_heel), COLOR_MEASURE, 4)
        cv2.line(vis, (cx - 120, r_toe), (cx + 120, r_toe), COLOR_MEASURE, 4)
        cv2.line(vis, (cx - 120, r_heel), (cx + 120, r_heel), COLOR_MEASURE, 4)
        put_label(vis, f"length {foot_length_mm:.1f}mm", (cx + 20, (r_toe + r_heel) // 2),
                  COLOR_MEASURE, 2.0, 4)

        cv2.line(vis, (ball_span[0], ball_r), (ball_span[1], ball_r), COLOR_MEASURE, 5)
        put_label(vis, f"ball {ball_mm:.1f}mm", (ball_span[1] + 20, ball_r), COLOR_MEASURE, 1.8, 4)
        cv2.line(vis, (heel_span[0], heel_r), (heel_span[1], heel_r), COLOR_MEASURE, 5)
        put_label(vis, f"heel {heel_mm:.1f}mm", (heel_span[1] + 20, heel_r), COLOR_MEASURE, 1.8, 4)

        for t in toes:
            ty = int(r_heel - t["protrusion_mm"] * PPM)
            color = (0, 0, 255) if t.get("is_hallux") else (255, 255, 0)
            cv2.circle(vis, (t["x"], ty), 14, color, -1)

        put_label(vis, f"toe_type={toe_type}  hva~{hva}deg (estimate)", (40, 90), scale=2.0, thick=4)
        put_label(vis, f"pca_rot={angle:.1f}deg flipped={flipped}", (40, 160), scale=1.6, thick=3)
        dbg.save("top_measured", vis)

    return meas, mask_rot, warnings
