"""
make_synthetic.py — 실제 사진 없이 파이프라인을 검증하기 위한 "가짜 사진" 생성기.

왜 필요한가?
  실제 사진은 정답(진짜 발 길이)을 모릅니다. 알고리즘이 250mm라고 해도
  그게 맞는지 알 수가 없습니다.
  그래서 "정답을 우리가 정해 놓고" 그 모양대로 사진을 만들어 냅니다.
  파이프라인이 그 정답을 다시 맞히면 알고리즘이 옳다는 뜻입니다.

만드는 것 (한 세트당 3개 파일):
  <이름>_top.jpg    상면 합성 사진  (A4 위에 발 실루엣, 원근 왜곡 포함)
  <이름>_side.jpg   측면 합성 사진  (바닥 A4를 낮은 카메라에서 본 모습 + 아치 곡선)
  <이름>_gt.json    정답 치수 (회귀 테스트용)

사용법:
  python tests/make_synthetic.py            # 기본 세트를 samples/ 에 생성
  python tests/make_synthetic.py --arch-clearance-mm 25 --name high_arch

알고 있는 단순화 (실제 사진과 다른 점):
  - 그림자를 아주 옅게만 넣습니다 (실제로는 더 짙게 질 수 있음)
  - 렌즈 왜곡(배럴)은 넣지 않았습니다
  - 발등/발가락 질감이 없는 단색 실루엣입니다
  → 그래서 합성 통과 = 알고리즘이 맞다는 뜻이지, 실사에서도 된다는 보장은 아닙니다.
     반드시 실제 사진 20세트로 다시 검증하세요. (SPEC 3-8)
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np

# footscan 패키지를 import 할 수 있도록 engine/ 을 경로에 추가
ENGINE_DIR = Path(__file__).resolve().parents[1]
if str(ENGINE_DIR) not in sys.path:
    sys.path.insert(0, str(ENGINE_DIR))

from footscan import config as C  # noqa: E402

PPM = C.PX_PER_MM  # mm 공간에서 1mm를 몇 픽셀로 그릴지 (10)


# ==========================================================================
# 1. 발 모양 만들기 — 상면(위에서 본 모습)
# ==========================================================================

# 발 길이에 대한 상대 위치 t 에서의 "발 너비" 프로파일.
# (t, 뒤꿈치너비 대비 배율 or 발볼너비 대비 배율, 어느 쪽 기준인지)
_WIDTH_PROFILE = [
    (0.000, 0.35, "heel"),
    (0.040, 0.75, "heel"),
    (0.090, 0.93, "heel"),
    (0.170, 1.00, "heel"),   # ← 뒤꿈치 너비 최대 지점
    (0.280, 0.90, "heel"),
    (0.420, 0.80, "ball"),   # 중족부(가장 잘록한 곳)
    (0.550, 0.90, "ball"),
    (0.660, 1.00, "ball"),   # ← 발볼 너비 최대 지점
    (0.720, 0.99, "ball"),
    (0.780, 0.94, "ball"),
    (0.830, 0.88, "ball"),   # 발가락이 시작되는 밑동
]

# 발가락 5개의 길이 (발 길이 대비). 형태별로 다릅니다.
_TOE_LENGTHS = {
    "egyptian": [1.000, 0.975, 0.948, 0.915, 0.876],  # 엄지가 가장 긴 형
    "greek":    [0.966, 1.000, 0.966, 0.926, 0.882],  # 검지가 가장 긴 형
    "roman":    [0.997, 0.993, 0.962, 0.922, 0.880],  # 엄지≈검지 (차이 <2mm)
}

# 발가락 폭 (발볼 너비 대비). 엄지가 가장 굵습니다.
_TOE_WIDTHS = [0.225, 0.150, 0.140, 0.128, 0.112]


def _width_at(t: float, ball_w: float, heel_w: float) -> float:
    """발 길이의 t 지점(0=뒤꿈치, 1=발끝)에서의 발 너비(mm)."""
    ts = [p[0] for p in _WIDTH_PROFILE]
    vals = []
    for _, k, base in _WIDTH_PROFILE:
        vals.append(k * (heel_w if base == "heel" else ball_w))
    if t <= ts[0]:
        return vals[0]
    if t >= ts[-1]:
        return vals[-1]
    return float(np.interp(t, ts, vals))


def foot_top_mask(
    length_mm: float,
    ball_width_mm: float,
    heel_width_mm: float,
    toe_type: str,
    hallux_valgus_deg: float,
    foot_side: str,
) -> np.ndarray:
    """
    발을 위에서 본 실루엣을 mm 공간의 흑백 마스크로 그립니다.
    좌표계: 가로 = 발 너비 방향, 세로 = 발 길이 방향(아래가 뒤꿈치).
    """
    pad_mm = 20.0
    w_px = int((ball_width_mm + 2 * pad_mm) * PPM)
    h_px = int((length_mm + 2 * pad_mm) * PPM)
    mask = np.zeros((h_px, w_px), np.uint8)

    cx_mm = (ball_width_mm / 2.0) + pad_mm  # 발 중심선의 가로 위치

    def to_px(x_mm: float, u_mm: float) -> tuple[int, int]:
        """(가로 mm, 발길이방향 mm) → 픽셀 좌표. u=0 이 뒤꿈치(아래쪽)."""
        return (int(round(x_mm * PPM)), int(round((pad_mm + length_mm - u_mm) * PPM)))

    # --- 발 몸통 (뒤꿈치 ~ 발가락 밑동) ---
    ts = np.linspace(0.0, 0.83, 160)
    right_pts, left_pts = [], []
    for t in ts:
        w = _width_at(float(t), ball_width_mm, heel_width_mm)
        u = t * length_mm
        left_pts.append(to_px(cx_mm - w / 2.0, u))
        right_pts.append(to_px(cx_mm + w / 2.0, u))
    body = np.array(right_pts + left_pts[::-1], np.int32)
    cv2.fillPoly(mask, [body], 255)

    # --- 발가락 5개 ---
    toe_lengths = _TOE_LENGTHS[toe_type]
    base_w = _width_at(0.83, ball_width_mm, heel_width_mm)
    gap_mm = 1.2                     # 발가락 사이 틈
    total_toe_w = sum(_TOE_WIDTHS) * ball_width_mm + gap_mm * 4
    start_x = cx_mm - total_toe_w / 2.0 + (base_w - total_toe_w) * 0.0

    cursor = start_x
    toe_centers = []
    for i, wr in enumerate(_TOE_WIDTHS):
        tw = wr * ball_width_mm
        toe_cx = cursor + tw / 2.0
        toe_tip_u = toe_lengths[i] * length_mm
        toe_base_u = 0.795 * length_mm
        cyu = (toe_tip_u + toe_base_u) / 2.0
        axis_u = (toe_tip_u - toe_base_u) / 2.0

        # 엄지발가락만 무지외반 각도만큼 바깥으로 기울입니다
        angle = 0.0
        if i == 0 and hallux_valgus_deg != 0.0:
            angle = hallux_valgus_deg
            # 기울면 끝이 옆으로 밀리므로 중심을 보정
            toe_cx += math.sin(math.radians(angle)) * axis_u * 0.5

        center = to_px(toe_cx, cyu)
        cv2.ellipse(
            mask, center,
            (int(tw / 2.0 * PPM), int(axis_u * PPM)),
            angle, 0, 360, 255, -1,
        )
        toe_centers.append(toe_cx)
        cursor += tw + gap_mm

    # 왼발이면 좌우 반전 (엄지가 반대편으로 갑니다)
    if foot_side == "left":
        mask = cv2.flip(mask, 1)

    return mask


def measure_top_ground_truth(mask: np.ndarray) -> dict:
    """
    합성한 마스크에서 "정답 치수"를 직접 잽니다.
    ※ 파이프라인 코드와 별개로 아주 단순하게 계산합니다 (독립적인 채점 기준).
    """
    ys, xs = np.where(mask > 0)
    top, bot = ys.min(), ys.max()
    length_px = bot - top + 1
    length_mm = length_px / PPM

    def max_width_in(lo: float, hi: float) -> float:
        # lo, hi 는 뒤꿈치(0)~발끝(1) 비율. 이미지에서는 아래가 뒤꿈치.
        r1 = int(round(bot - hi * (length_px - 1)))
        r2 = int(round(bot - lo * (length_px - 1)))
        best = 0
        for r in range(min(r1, r2), max(r1, r2) + 1):
            cols = np.where(mask[r] > 0)[0]
            if cols.size:
                best = max(best, cols.max() - cols.min() + 1)
        return best / PPM

    ball = max_width_in(*C.BALL_WIDTH_RANGE)
    heel = max_width_in(*C.HEEL_WIDTH_RANGE)
    return {
        "foot_length_mm": round(length_mm, 2),
        "ball_width_mm": round(ball, 2),
        "heel_width_mm": round(heel, 2),
        "width_ratio": round(ball / length_mm, 4),
    }


# ==========================================================================
# 2. 발 모양 만들기 — 측면(안쪽에서 본 모습)
# ==========================================================================

def foot_side_polygon(
    length_mm: float,
    arch_clearance_mm: float,
    instep_height_mm: float,
    arch_start: float = 0.22,
    arch_end: float = 0.62,
    leg_top_mm: float = 400.0,
) -> np.ndarray:
    """
    발을 안쪽에서 본 실루엣의 외곽선을 만듭니다.
    좌표계: x = 뒤꿈치(0) → 발끝(length), y = 바닥(0)에서 위로 mm.
    """
    L = length_mm
    I = instep_height_mm
    pts: list[tuple[float, float]] = []

    # --- 발바닥 (뒤꿈치 → 발끝) ---
    pts += [(0.000 * L, 12.0), (0.015 * L, 4.0), (0.030 * L, 0.0)]
    pts += [(arch_start * L, 0.0)]
    # 아치 곡선: 사인 곡선으로 부드럽게 들어올립니다. 최고점 = arch_clearance_mm
    for u in np.linspace(0.0, 1.0, 60)[1:-1]:
        x = (arch_start + u * (arch_end - arch_start)) * L
        pts.append((x, arch_clearance_mm * math.sin(math.pi * u)))
    pts += [(arch_end * L, 0.0), (0.930 * L, 0.0), (0.970 * L, 2.0), (1.000 * L, 9.0)]

    # --- 발등 (발끝 → 뒤꿈치 방향) ---
    pts += [
        (0.985 * L, 16.0),
        (0.950 * L, 22.0),
        (0.880 * L, 0.55 * I),
        (0.750 * L, 0.78 * I),
        (0.620 * L, 0.90 * I),
        (0.500 * L, 1.00 * I),   # ★ 발등 높이 측정 지점 (정답이 여기 있음)
        (0.400 * L, 1.10 * I),
        (0.320 * L, 1.30 * I),
    ]
    # --- 다리 (화면 위로 빠져나감) ---
    pts += [
        (0.300 * L, 1.80 * I),
        (0.290 * L, leg_top_mm),
        (0.130 * L, leg_top_mm),
        (0.115 * L, 1.70 * I),
        (0.060 * L, 0.95 * I),
        (0.020 * L, 0.50 * I),
    ]
    return np.array(pts, np.float64)


def measure_side_ground_truth(poly: np.ndarray, length_mm: float) -> dict:
    """
    측면 실루엣의 정답 치수를 잽니다.
    ※ 접지 판정 기준(CONTACT_HEIGHT_MM)은 파이프라인과 같은 값을 씁니다.
       그래야 "같은 정의로 잰 값"끼리 비교가 됩니다.
    """
    # mm 공간에 그대로 래스터화 (원근 왜곡 없는 이상적인 마스크)
    h_mm = 120.0
    w_px, h_px = int(length_mm * PPM) + 1, int(h_mm * PPM) + 1
    canvas = np.zeros((h_px, w_px), np.uint8)
    pp = poly.copy()
    px = np.stack([pp[:, 0] * PPM, (h_mm - pp[:, 1]) * PPM], axis=1).astype(np.int32)
    cv2.fillPoly(canvas, [px], 255)

    cols = np.where(canvas.max(axis=0) > 0)[0]
    x0, x1 = cols.min(), cols.max()
    foot_len = (x1 - x0 + 1) / PPM

    bottom_h, top_h = {}, {}
    for c in range(x0, x1 + 1):
        rows = np.where(canvas[:, c] > 0)[0]
        if rows.size == 0:
            continue
        bottom_h[c] = h_mm - rows.max() / PPM   # 바닥에서 실루엣 아랫면까지의 높이
        top_h[c] = h_mm - rows.min() / PPM      # 바닥에서 실루엣 윗면까지의 높이

    contact = {c: (bottom_h[c] < C.CONTACT_HEIGHT_MM) for c in bottom_h}
    xs = sorted(contact)
    # 접지 구간(런) 찾기
    runs, cur = [], None
    for c in xs:
        if contact[c]:
            cur = (c, c) if cur is None else (cur[0], c)
        elif cur is not None:
            runs.append(cur)
            cur = None
    if cur is not None:
        runs.append(cur)
    runs = [r for r in runs if (r[1] - r[0]) / PPM >= C.CONTACT_MIN_RUN_MM]

    heel_end = runs[0][1] if runs else x0
    fore_start = runs[-1][0] if len(runs) > 1 else heel_end
    gap_mm = (fore_start - heel_end) / PPM
    clearance = max([bottom_h[c] for c in range(heel_end, fore_start + 1) if c in bottom_h] or [0.0])

    mid_c = int(round(x0 + 0.5 * (x1 - x0)))
    instep = top_h.get(mid_c, 0.0)

    return {
        "foot_length_side_mm": round(foot_len, 2),
        "arch_clearance_mm": round(clearance, 2),
        "arch_gap_length_mm": round(gap_mm, 2),
        "arch_gap_ratio": round(gap_mm / foot_len, 4),
        "instep_height_mm": round(instep, 2),
        "arch_height_index": round(instep / foot_len, 4),
    }


# ==========================================================================
# 3. 배경/질감 만들기 (사진처럼 보이게)
# ==========================================================================

def _noise(shape: tuple[int, int, int], amount: float, rng) -> np.ndarray:
    return rng.normal(0.0, amount, shape)


def _paper_texture(h: int, w: int, rng) -> np.ndarray:
    """A4 흰 종이. 완전한 순백이 아니라 약간 회색빛에 얼룩이 있습니다."""
    img = np.full((h, w, 3), 244.0)
    img += _noise((h, w, 3), 3.0, rng)
    # 조명 그라데이션 (한쪽이 살짝 밝음)
    gx = np.linspace(-8, 8, w)[None, :, None]
    gy = np.linspace(-6, 6, h)[:, None, None]
    return np.clip(img + gx + gy, 0, 255)


def _skin(h: int, w: int, rng) -> np.ndarray:
    """발 색 (BGR). 종이보다 확실히 어둡고 붉은 기가 돕니다."""
    img = np.zeros((h, w, 3))
    img[:, :, 0] = 150.0   # B
    img[:, :, 1] = 172.0   # G
    img[:, :, 2] = 196.0   # R
    return np.clip(img + _noise((h, w, 3), 4.0, rng), 0, 255)


# ==========================================================================
# 3-b. 핀홀 카메라 투영 — 실제 카메라와 같은 방식으로 3D 점을 사진에 찍습니다
# ==========================================================================

def project_points(
    P: np.ndarray, cam: np.ndarray, target: np.ndarray,
    up_ref: np.ndarray, f: float, cx: float, cy: float,
) -> np.ndarray:
    """
    3D 점 P(N,3) 를 카메라 사진 좌표(N,2)로 바꿉니다.
    cam=카메라 위치, target=바라보는 지점, f=초점거리(px).
    실제 휴대폰 카메라와 같은 원리라서, 여기서 나온 원근 왜곡을
    파이프라인이 제대로 펴는지 시험할 수 있습니다.
    """
    fwd = target - cam
    fwd = fwd / np.linalg.norm(fwd)
    right = np.cross(fwd, up_ref)
    right = right / np.linalg.norm(right)
    up = np.cross(right, fwd)

    d = P - cam
    xc = d @ right
    yc = d @ up
    zc = d @ fwd
    return np.stack([cx + f * xc / zc, cy - f * yc / zc], axis=1)


# ==========================================================================
# 4. 상면 합성 사진 렌더링
# ==========================================================================

def render_top(
    length_mm: float,
    ball_width_mm: float,
    heel_width_mm: float,
    toe_type: str,
    hallux_valgus_deg: float,
    foot_side: str,
    rotate_deg: float,
    out_w: int,
    out_h: int,
    perspective: float,
    seed: int,
    with_foot: bool = True,
) -> tuple[np.ndarray, dict]:
    """
    A4 위에 발이 놓인 모습을 위에서 비스듬히 찍은 사진을 만듭니다.
    with_foot=False 로 부르면 '빈 종이'만 그립니다 (FOOT_NOT_FOUND 시험용).
    """
    rng = np.random.default_rng(seed)

    # --- (1) 정면에서 본 이상적인 종이 이미지를 먼저 만든다 ---
    PW, PH = C.WARP_W_PX, C.WARP_H_PX          # 2100 x 2970
    paper = _paper_texture(PH, PW, rng)

    foot = foot_top_mask(length_mm, ball_width_mm, heel_width_mm,
                         toe_type, hallux_valgus_deg, foot_side)
    gt = measure_top_ground_truth(foot)

    # 발을 살짝 비뚤게 회전시켜 놓는다 (PCA 주축 정렬 기능을 시험하기 위함)
    fh, fw = foot.shape
    M = cv2.getRotationMatrix2D((fw / 2, fh / 2), rotate_deg, 1.0)
    diag = int(math.hypot(fw, fh))
    M[0, 2] += (diag - fw) / 2
    M[1, 2] += (diag - fh) / 2
    foot_rot = cv2.warpAffine(foot, M, (diag, diag), flags=cv2.INTER_NEAREST)

    # 종이 위에 발 놓기 (가로 중앙, 뒤꿈치가 아래쪽에서 20mm 위)
    canvas_mask = np.zeros((PH, PW), np.uint8)
    ys, xs = np.where(foot_rot > 0)
    fy0, fy1, fx0, fx1 = ys.min(), ys.max(), xs.min(), xs.max()
    crop = foot_rot[fy0:fy1 + 1, fx0:fx1 + 1]
    ch, cw = crop.shape
    off_x = (PW - cw) // 2
    off_y = PH - ch - int(20 * PPM)
    if off_y < 0 or off_x < 0:
        raise ValueError("발이 A4보다 큽니다. length/width 값을 줄이세요.")
    canvas_mask[off_y:off_y + ch, off_x:off_x + cw] = crop

    # 그림자 (발 오른쪽 아래로 살짝) — 조명 가이드를 지켰다는 가정으로 옅게
    shadow = cv2.warpAffine(canvas_mask, np.float32([[1, 0, 26], [0, 1, 26]]), (PW, PH))
    shadow = cv2.GaussianBlur(shadow, (51, 51), 0).astype(np.float64) / 255.0
    paper = paper * (1.0 - 0.13 * shadow[:, :, None])

    if not with_foot:
        canvas_mask[:] = 0
        paper = _paper_texture(PH, PW, rng)
    skin = _skin(PH, PW, rng)
    m3 = (canvas_mask > 0)[:, :, None]
    flat = np.where(m3, skin, paper)

    # --- (2) 실제 카메라로 위에서 (약간 비스듬히) 찍은 효과 ---
    # 3D 좌표: X = A4 짧은 변(0~210), Y = 위로, Z = A4 긴 변(0~297)
    # 종이는 바닥(Y=0)에 놓여 있고, 카메라는 그 위 약 50cm 지점에 있습니다.
    cam_h = 500.0
    tilt = perspective                    # 0이면 정확히 수직, 1이면 살짝 비스듬
    cam = np.array([C.A4_SHORT_MM / 2 + 45.0 * tilt, cam_h, C.A4_LONG_MM / 2 - 70.0 * tilt])
    target = np.array([C.A4_SHORT_MM / 2, 0.0, C.A4_LONG_MM / 2])
    f_top = 0.98 * out_w                  # 휴대폰 광각 렌즈 정도
    corners3d = np.array([
        [0.0, 0.0, C.A4_LONG_MM],            # 좌상 (사진에서 위쪽 = Z가 큰 쪽)
        [C.A4_SHORT_MM, 0.0, C.A4_LONG_MM],  # 우상
        [C.A4_SHORT_MM, 0.0, 0.0],           # 우하
        [0.0, 0.0, 0.0],                     # 좌하
    ])
    dst = project_points(
        corners3d, cam, target, np.array([0.0, 0.0, 1.0]),
        f_top, out_w / 2.0, out_h / 2.0,
    ).astype(np.float32)
    src = np.float32([[0, 0], [PW - 1, 0], [PW - 1, PH - 1], [0, PH - 1]])
    H = cv2.getPerspectiveTransform(src, dst)

    floor = np.full((out_h, out_w, 3), 0.0)
    floor[:, :, 0] = 96; floor[:, :, 1] = 112; floor[:, :, 2] = 128   # 회색 바닥
    floor += _noise((out_h, out_w, 3), 6.0, rng)
    warped = cv2.warpPerspective(flat, H, (out_w, out_h), borderValue=(0, 0, 0))
    wm = cv2.warpPerspective(np.ones((PH, PW), np.uint8) * 255, H, (out_w, out_h))
    img = np.where((wm > 0)[:, :, None], warped, floor)
    img = np.clip(img + _noise((out_h, out_w, 3), 2.0, rng), 0, 255).astype(np.uint8)

    gt.update({
        "toe_type": toe_type,
        "side": foot_side,
        "design_length_mm": length_mm,
        "design_ball_width_mm": ball_width_mm,
        "design_heel_width_mm": heel_width_mm,
        "design_hallux_valgus_deg": hallux_valgus_deg,
        "design_rotate_deg": rotate_deg,
    })
    return img, gt


# ==========================================================================
# 5. 측면 합성 사진 렌더링 (핀홀 카메라 투영)
# ==========================================================================

def render_side(
    length_mm: float,
    arch_clearance_mm: float,
    instep_height_mm: float,
    out_w: int,
    out_h: int,
    cam_height_mm: float,
    cam_distance_mm: float,
    focal_ratio: float,
    roll_deg: float,
    seed: int,
) -> tuple[np.ndarray, dict]:
    """
    바닥에 놓인 A4의 긴 변 옆에 발을 딛고, 낮은 위치에서 찍은 사진을 만듭니다.

    3D 좌표계 (단위 mm):
      X = A4 긴 변 방향 (0 ~ 297)   Y = 바닥에서 위   Z = 카메라에서 멀어지는 깊이
      발의 안쪽면과 A4의 가까운 긴 변이 둘 다 Z=0 평면에 있습니다.
      → 이것이 SPEC 1-3에서 채택한 방식의 핵심입니다.
    """
    rng = np.random.default_rng(seed)
    f = focal_ratio * out_w                 # 초점거리 (픽셀)
    cx, cy = out_w / 2.0, out_h / 2.0
    cam = np.array([C.A4_LONG_MM / 2.0, cam_height_mm, -cam_distance_mm])

    def project(P: np.ndarray) -> np.ndarray:
        """3D 점 (N,3) → 이미지 좌표 (N,2)"""
        d = P - cam
        x = f * d[:, 0] / d[:, 2] + cx
        y = cy - f * d[:, 1] / d[:, 2]
        return np.stack([x, y], axis=1)

    # --- 배경: 벽(위) + 바닥(아래). 수평선은 카메라 높이에서 생깁니다 ---
    img = np.zeros((out_h, out_w, 3), np.float64)
    horizon = int(cy)
    img[:horizon] = [188, 190, 192]        # 벽 (밝은 회색)
    img[horizon:] = [104, 118, 132]        # 바닥 (짙은 회청색)
    # 바닥에 원근 그라데이션
    for r in range(horizon, out_h):
        img[r] *= 0.88 + 0.22 * (r - horizon) / max(1, out_h - horizon)
    img += _noise((out_h, out_w, 3), 5.0, rng)

    # --- A4 종이 (바닥에 누워 있음) ---
    paper3d = np.array([
        [0.0, 0.0, 0.0],                        # 가까운 변 왼쪽
        [C.A4_LONG_MM, 0.0, 0.0],               # 가까운 변 오른쪽  ← 이게 기준(297mm)
        [C.A4_LONG_MM, 0.0, C.A4_SHORT_MM],     # 먼 변 오른쪽
        [0.0, 0.0, C.A4_SHORT_MM],              # 먼 변 왼쪽
    ])
    paper2d = project(paper3d)
    paper_layer = np.zeros((out_h, out_w), np.uint8)
    cv2.fillPoly(paper_layer, [paper2d.astype(np.int32)], 255)
    ptex = _paper_texture(out_h, out_w, rng)
    img = np.where((paper_layer > 0)[:, :, None], ptex, img)

    # --- 발 (Z=0 평면) ---
    poly = foot_side_polygon(length_mm, arch_clearance_mm, instep_height_mm)
    gt = measure_side_ground_truth(poly, length_mm)

    # 발을 종이 긴 변의 가운데에 놓습니다.
    # ★ 왜 가운데인가: 발이 종이의 양 끝(가까운 긴 변의 두 꼭짓점)을 가리면
    #   297mm 기준 길이를 잴 수 없어 측정 자체가 불가능합니다.
    #   그래서 앱 촬영 가이드도 "종이 양 끝이 보이게 발을 가운데에 딛으세요" 여야 합니다.
    x_offset = max(2.0, (C.A4_LONG_MM - length_mm) / 2.0)
    foot3d = np.stack([poly[:, 0] + x_offset, poly[:, 1], np.zeros(len(poly))], axis=1)
    foot2d = project(foot3d)
    foot_layer = np.zeros((out_h, out_w), np.uint8)
    cv2.fillPoly(foot_layer, [foot2d.astype(np.int32)], 255)

    # 발 앞쪽(카메라 쪽) 바닥에 옅은 그림자 — 바닥선 아래라 잘려나갑니다
    sh = cv2.warpAffine(foot_layer, np.float32([[1, 0, 6], [0, 1, 22]]), (out_w, out_h))
    sh = cv2.GaussianBlur(sh, (41, 41), 0).astype(np.float64) / 255.0
    img = img * (1.0 - 0.16 * sh[:, :, None])

    skin = _skin(out_h, out_w, rng)
    img = np.where((foot_layer > 0)[:, :, None], skin, img)
    img = np.clip(img + _noise((out_h, out_w, 3), 2.0, rng), 0, 255).astype(np.uint8)

    # --- 카메라를 살짝 기울여 찍은 효과 (롤). 파이프라인이 이걸 펴야 합니다 ---
    if abs(roll_deg) > 1e-6:
        M = cv2.getRotationMatrix2D((cx, cy), roll_deg, 1.0)
        img = cv2.warpAffine(img, M, (out_w, out_h), borderMode=cv2.BORDER_REPLICATE)

    px_per_mm = f / cam_distance_mm
    gt.update({
        "design_length_mm": length_mm,
        "design_arch_clearance_mm": arch_clearance_mm,
        "design_instep_height_mm": instep_height_mm,
        "design_roll_deg": roll_deg,
        "expected_px_per_mm": round(px_per_mm, 4),
    })
    return img, gt


# ==========================================================================
# 6. CLI
# ==========================================================================

def _save_with_exif(path: Path, img: np.ndarray, orientation: int) -> None:
    """
    아이폰처럼 "회전 정보를 메타데이터에만" 넣어 저장합니다.
    orientation=6 이면 픽셀은 시계 반대로 90도 돌려 저장하고,
    보는 프로그램이 다시 시계방향 90도 돌려야 원래 그림이 됩니다.
    → 파이프라인의 EXIF 보정 기능을 시험할 수 있습니다.
    """
    from PIL import Image

    pil = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    if orientation == 6:
        pil = pil.rotate(90, expand=True)     # 반시계 90도로 저장
    elif orientation == 8:
        pil = pil.rotate(-90, expand=True)
    exif = pil.getexif()
    exif[274] = orientation                    # 274 = Orientation 태그
    pil.save(str(path), quality=92, exif=exif)


def generate_set(
    out_dir: Path,
    name: str = "right",
    foot_side: str = "right",
    length_mm: float = 250.0,
    ball_width_mm: float = 98.0,
    heel_width_mm: float = 62.0,
    toe_type: str = "egyptian",
    hallux_valgus_deg: float = 8.0,
    arch_clearance_mm: float = 14.0,
    instep_height_mm: float = 85.0,
    rotate_deg: float = 5.0,
    roll_deg: float = 3.0,
    exif_orientation: int = 0,
    seed: int = 7,
    perspective: float = 1.0,
    cam_distance_mm: float = 800.0,
    side_only: bool = False,
    top_only: bool = False,
) -> dict:
    """한 세트(상면 + 측면 + 정답 JSON)를 만들어 저장합니다."""
    out_dir.mkdir(parents=True, exist_ok=True)

    top_img, top_gt = render_top(
        length_mm, ball_width_mm, heel_width_mm, toe_type, hallux_valgus_deg,
        foot_side, rotate_deg, out_w=1600, out_h=1200, perspective=perspective, seed=seed,
    )
    side_img, side_gt = render_side(
        length_mm, arch_clearance_mm, instep_height_mm,
        out_w=1600, out_h=1200, cam_height_mm=125.0, cam_distance_mm=cam_distance_mm,
        focal_ratio=1.5, roll_deg=roll_deg, seed=seed + 1,
    )

    top_path = out_dir / f"{name}_top.jpg"
    side_path = out_dir / f"{name}_side.jpg"
    if exif_orientation:
        _save_with_exif(top_path, top_img, exif_orientation)
        _save_with_exif(side_path, side_img, exif_orientation)
    else:
        cv2.imwrite(str(top_path), top_img, [cv2.IMWRITE_JPEG_QUALITY, 92])
        cv2.imwrite(str(side_path), side_img, [cv2.IMWRITE_JPEG_QUALITY, 92])

    gt = {
        "name": name,
        "foot": foot_side,
        "top_image": top_path.name,
        "side_image": side_path.name,
        "exif_orientation": exif_orientation,
        "top": top_gt,
        "side": side_gt,
    }
    gt_path = out_dir / f"{name}_gt.json"
    gt_path.write_text(json.dumps(gt, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  생성: {top_path.name}, {side_path.name}, {gt_path.name}")
    return gt


def main() -> None:
    import argparse

    p = argparse.ArgumentParser(description="발 스캔 합성 테스트 이미지 생성기")
    p.add_argument("--out", default=str(ENGINE_DIR / "samples"), help="저장 폴더")
    p.add_argument("--name", default=None, help="한 세트만 만들 때의 이름")
    p.add_argument("--foot", default="right", choices=["left", "right"])
    p.add_argument("--length-mm", type=float, default=250.0)
    p.add_argument("--ball-width-mm", type=float, default=98.0)
    p.add_argument("--heel-width-mm", type=float, default=62.0)
    p.add_argument("--toe-type", default="egyptian", choices=["egyptian", "greek", "roman"])
    p.add_argument("--arch-clearance-mm", type=float, default=14.0, help="아치 들림 높이(핵심 파라미터)")
    p.add_argument("--instep-height-mm", type=float, default=85.0)
    p.add_argument("--exif-orientation", type=int, default=0, help="6이면 아이폰식 회전 사진")
    p.add_argument("--seed", type=int, default=7)
    args = p.parse_args()

    out_dir = Path(args.out)

    if args.name:
        print(f"[합성 이미지] 1세트 생성 → {out_dir}")
        generate_set(
            out_dir, name=args.name, foot_side=args.foot,
            length_mm=args.length_mm, ball_width_mm=args.ball_width_mm,
            heel_width_mm=args.heel_width_mm, toe_type=args.toe_type,
            arch_clearance_mm=args.arch_clearance_mm,
            instep_height_mm=args.instep_height_mm,
            exif_orientation=args.exif_orientation, seed=args.seed,
        )
        return

    # 기본 세트: 아치 3등급 + 왼발/오른발 + 발가락 형태 + EXIF 회전 사진
    print(f"[합성 이미지] 기본 세트 생성 → {out_dir}")
    presets = [
        # (이름, 발, 길이, 발볼, 뒤꿈치, 발가락형태, 아치높이, 발등, EXIF)
        ("right",        "right", 250.0, 98.0,  62.0, "egyptian", 14.0, 85.0, 0),
        ("left",         "left",  247.0, 96.0,  61.0, "egyptian", 13.0, 84.0, 0),
        ("arch_low",     "right", 252.0, 104.0, 64.0, "roman",     4.0, 74.0, 0),
        ("arch_high",    "right", 248.0, 92.0,  60.0, "greek",    26.0, 97.0, 0),
        ("narrow",       "right", 262.0, 92.0,  60.0, "greek",    16.0, 89.0, 0),
        ("wide",         "right", 238.0, 102.0, 66.0, "roman",    10.0, 76.0, 0),
        ("exif_rotated", "right", 250.0, 98.0,  62.0, "egyptian", 14.0, 85.0, 6),
    ]
    for i, (nm, fs, L, bw, hw, tt, ac, ih, ex) in enumerate(presets):
        generate_set(
            out_dir, name=nm, foot_side=fs, length_mm=L, ball_width_mm=bw,
            heel_width_mm=hw, toe_type=tt, arch_clearance_mm=ac,
            instep_height_mm=ih, exif_orientation=ex, seed=7 + i * 3,
        )
    print("완료. samples/ 안의 *_gt.json 이 '정답'입니다.")


if __name__ == "__main__":
    main()
