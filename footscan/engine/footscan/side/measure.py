"""
side/measure.py — [SPEC B4, B5] 측면 마스크에서 아치와 발등을 잽니다.

좌표계 (전부 mm):
  x = 뒤꿈치(0) → 발끝
  y = 바닥선(0) 에서 위로 양수

측정하는 것:
  · 발 길이 (교차검증용)
  · 접지 구간 / 비접지(아치) 구간
  · 아치 들림 높이 (arch clearance)
  · 발등 높이 (instep) 와 아치 지수 (AHI)
  · 아치 등급 (낮음/보통/높음)  ← ★ 이게 주 결과입니다

왜 등급이 주 결과인가?
  측면은 상면보다 정확도가 낮습니다(±5~8mm).
  mm 값을 그대로 보여주면 틀린 숫자를 믿게 되므로,
  오차에 훨씬 강한 3단계 등급을 앞세우고 mm 는 보조로만 씁니다. (SPEC 1-3)
"""

from __future__ import annotations

import cv2
import numpy as np

from .. import config as C
from ..debug import (COLOR_ARCH, COLOR_CONTACT, COLOR_FLOOR, COLOR_FOOT,
                     COLOR_MEASURE, DebugSaver, put_label)
from ..errors import foot_not_found
from ..schemas import SideMeasurement
from .reference import SideReference


def _boundaries(mask: np.ndarray, floor_y: float, px_per_mm: float):
    """
    열(column)마다 마스크의 아래쪽/위쪽 경계 높이를 mm 로 만듭니다.
    돌려주는 값: (열 번호 배열, 아랫면 높이, 윗면 높이)
    """
    cols = np.where(mask.max(axis=0) > 0)[0]
    xs, bot, top = [], [], []
    for c in cols:
        rows = np.where(mask[:, c] > 0)[0]
        if rows.size == 0:
            continue
        xs.append(int(c))
        bot.append((floor_y - float(rows.max())) / px_per_mm)
        top.append((floor_y - float(rows.min())) / px_per_mm)
    return np.array(xs), np.array(bot), np.array(top)


def _runs(flags: np.ndarray, min_len: int) -> list[tuple[int, int]]:
    """True 가 연달아 있는 구간들을 (시작, 끝) 목록으로 돌려줍니다."""
    out, start = [], None
    for i, v in enumerate(flags):
        if v and start is None:
            start = i
        elif not v and start is not None:
            if i - start >= min_len:
                out.append((start, i - 1))
            start = None
    if start is not None and len(flags) - start >= min_len:
        out.append((start, len(flags) - 1))
    return out


def classify_arch(clearance_mm: float, gap_ratio: float) -> str:
    """
    아치 등급을 매깁니다. [SPEC B5]
    경계값은 전부 config 에 있습니다 (초기 가정치이므로 실측 데이터로 재보정 필요).
    """
    if clearance_mm < C.ARCH_CLEARANCE_LOW_MM or gap_ratio < C.ARCH_GAP_RATIO_LOW:
        return "low"
    if clearance_mm > C.ARCH_CLEARANCE_HIGH_MM or gap_ratio > C.ARCH_GAP_RATIO_HIGH:
        return "high"
    return "normal"


def check_sole_plausibility(runs: list[tuple[int, int]], xs: np.ndarray,
                            ppm: float, foot_length_mm: float) -> tuple[float, list[str]]:
    """
    발바닥이 상식적인 모양으로 잡혔는지 스스로 점검합니다.

    ★ 왜 이게 필요한가 (한계 시험에서 찾아낸 문제):
      사진이 어둡거나 노이즈가 심하면 발바닥 아랫면 일부가 배경으로 잘려나갑니다.
      그러면 "발 길이는 맞는데 아치만 14mm → 26mm 로 튀는" 일이 생깁니다.
      길이 교차검증(B6)은 길이만 보므로 이걸 못 잡습니다. 그래서 따로 봅니다.

    돌려주는 값: (신뢰도 배율 0~1, 경고 목록)
    """
    warnings: list[str] = []
    quality = 1.0
    if foot_length_mm <= 0:
        return quality, warnings

    if len(runs) > C.SIDE_MAX_CONTACT_RUNS:
        quality *= C.SIDE_QUALITY_PENALTY
        warnings.append(
            f"발바닥이 바닥에 닿은 부분이 {len(runs)}조각으로 잘게 나뉘었습니다. "
            "발 아랫면을 제대로 못 잡았을 가능성이 큽니다. 더 밝은 곳에서 다시 찍어 주세요."
        )

    if runs:
        heel_mm = (xs[runs[0][1]] - xs[runs[0][0]]) / ppm
        if heel_mm / foot_length_mm < C.SIDE_MIN_HEEL_CONTACT_RATIO:
            quality *= C.SIDE_QUALITY_PENALTY
            warnings.append(
                f"뒤꿈치가 바닥에 닿은 부분이 {heel_mm:.0f}mm 밖에 안 됩니다(보통 발 길이의 20% 안팎). "
                "체중을 실어 똑바로 서고, 더 밝은 곳에서 다시 찍어 주세요."
            )

        total_mm = sum((xs[b] - xs[a]) / ppm for a, b in runs)
        lo, hi = C.SIDE_CONTACT_TOTAL_RATIO_RANGE
        ratio = total_mm / foot_length_mm
        if not (lo <= ratio <= hi):
            quality *= C.SIDE_QUALITY_PENALTY
            warnings.append(
                f"바닥에 닿은 부분이 발 길이의 {ratio*100:.0f}% 입니다(정상 {lo*100:.0f}~{hi*100:.0f}%). "
                "아치 값을 믿기 어렵습니다."
            )

    return max(0.0, min(1.0, quality)), warnings


def measure_side(mask: np.ndarray, ref: SideReference,
                 foot_length_top_mm: float | None = None,
                 dbg: DebugSaver | None = None) -> tuple[SideMeasurement, list[str], float]:
    """
    측면 마스크에서 아치/발등을 잽니다.
    foot_length_top_mm 이 주어지면 비율 계산에 상면 길이를 씁니다(더 정확하므로).
    돌려주는 값: (측정 결과, 경고 목록, 신뢰도 배율)
    """
    warnings: list[str] = []
    ppm = ref.px_per_mm
    xs, bot, top = _boundaries(mask, ref.floor_y, ppm)
    if len(xs) < 20:
        raise foot_not_found(stage="B4 측면 측정", detail="발 마스크가 너무 작습니다")

    # --- 뒤꿈치가 어느 쪽인지 자동 판별 ---
    # 뒤꿈치 쪽은 발목·다리가 이어져 훨씬 높습니다. 발끝 쪽은 낮고 얇습니다.
    n = len(xs)
    probe = max(3, int(n * C.SIDE_HEEL_PROBE_RATIO))
    if top[:probe].mean() < top[-probe:].mean():
        # 오른쪽이 뒤꿈치 → 좌우를 뒤집어 항상 왼쪽이 뒤꿈치가 되게 합니다
        mask = cv2.flip(mask, 1)
        xs, bot, top = _boundaries(mask, ref.floor_y, ppm)
        flipped = True
    else:
        flipped = False

    x0, x1 = int(xs.min()), int(xs.max())
    foot_length_side_mm = (x1 - x0 + 1) / ppm
    length_for_ratio = foot_length_top_mm or foot_length_side_mm

    # --- 접지 구간 (바닥에 닿은 부분) ---
    contact = bot < C.CONTACT_HEIGHT_MM
    runs = _runs(contact, max(2, int(C.CONTACT_MIN_RUN_MM * ppm)))

    if len(runs) >= 2:
        heel_end_i = runs[0][1]
        fore_start_i = runs[-1][0]
    elif len(runs) == 1:
        # 접지 구간이 하나뿐 = 발바닥 전체가 붙어 있음 (아치가 아주 낮음)
        heel_end_i = fore_start_i = runs[0][1]
        warnings.append("발바닥이 거의 전부 바닥에 닿아 있습니다. 아치가 매우 낮게 측정되었습니다.")
    else:
        heel_end_i = fore_start_i = 0
        warnings.append(
            "바닥에 닿은 부분을 찾지 못했습니다. 체중을 실어 똑바로 선 상태로 다시 찍어 주세요."
        )

    arch_gap_length_mm = max(0.0, (xs[fore_start_i] - xs[heel_end_i]) / ppm)
    arch_gap_ratio = arch_gap_length_mm / length_for_ratio if length_for_ratio > 0 else 0.0

    if fore_start_i > heel_end_i:
        seg = bot[heel_end_i:fore_start_i + 1]
        arch_clearance_mm = float(seg.max())
        apex_i = heel_end_i + int(np.argmax(seg))
    else:
        arch_clearance_mm = 0.0
        apex_i = heel_end_i

    # --- 발등 높이 (발 길이 50% 지점의 윗면) ---
    mid_x = x0 + C.INSTEP_MEASURE_AT * (x1 - x0)
    mid_i = int(np.argmin(np.abs(xs - mid_x)))
    instep_height_mm = float(top[mid_i])
    arch_height_index = instep_height_mm / length_for_ratio if length_for_ratio > 0 else 0.0

    arch_grade = classify_arch(arch_clearance_mm, arch_gap_ratio)

    # 발바닥이 상식적인 모양으로 잡혔는지 스스로 점검
    quality, w_quality = check_sole_plausibility(runs, xs, ppm, foot_length_side_mm)
    warnings += w_quality

    delta = abs(length_for_ratio - foot_length_side_mm) if foot_length_top_mm else 0.0

    meas = SideMeasurement(
        foot_length_side_mm=round(foot_length_side_mm, 1),
        arch_clearance_mm=round(arch_clearance_mm, 1),
        arch_gap_length_mm=round(arch_gap_length_mm, 1),
        arch_gap_ratio=round(arch_gap_ratio, 4),
        instep_height_mm=round(instep_height_mm, 1),
        arch_height_index=round(arch_height_index, 4),
        arch_grade=arch_grade,
        cross_check_delta_mm=round(delta, 1),
    )

    if dbg is not None:
        base = cv2.flip(ref.image, 1) if flipped else ref.image
        vis = base.copy()
        cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(vis, cnts, -1, COLOR_FOOT, 2)

        fy = int(ref.floor_y)
        # 바닥선 (빨강)
        cv2.line(vis, (0, fy), (vis.shape[1], fy), COLOR_FLOOR, 3)
        # 접지 구간 (자홍)
        for a, b in runs:
            cv2.line(vis, (int(xs[a]), fy - 6), (int(xs[b]), fy - 6), COLOR_CONTACT, 8)
        # 아치 비접지 구간 + 최고점 (노랑)
        if fore_start_i > heel_end_i:
            ax = int(xs[apex_i])
            ay = int(ref.floor_y - arch_clearance_mm * ppm)
            cv2.line(vis, (int(xs[heel_end_i]), fy), (int(xs[fore_start_i]), fy), COLOR_ARCH, 3)
            cv2.arrowedLine(vis, (ax, fy), (ax, ay), COLOR_ARCH, 3, tipLength=0.2)
            put_label(vis, f"arch {arch_clearance_mm:.1f}mm", (ax + 10, ay - 10), COLOR_ARCH, 0.8, 2)
            put_label(vis, f"gap {arch_gap_length_mm:.0f}mm ({arch_gap_ratio*100:.0f}%)",
                      (int(xs[heel_end_i]) + 10, fy + 30), COLOR_ARCH, 0.7, 2)
        # 발등 높이 (파랑)
        ix = int(xs[mid_i])
        iy = int(ref.floor_y - instep_height_mm * ppm)
        cv2.line(vis, (ix, fy), (ix, iy), COLOR_MEASURE, 3)
        put_label(vis, f"instep {instep_height_mm:.1f}mm", (ix + 10, iy - 10), COLOR_MEASURE, 0.8, 2)
        # 발 길이
        cv2.arrowedLine(vis, (x0, fy + 40), (x1, fy + 40), COLOR_MEASURE, 3, tipLength=0.02)
        put_label(vis, f"len(side) {foot_length_side_mm:.1f}mm", (x0 + 20, fy + 70), COLOR_MEASURE, 0.8, 2)

        put_label(vis, f"arch_grade = {arch_grade.upper()}   AHI={arch_height_index:.3f}", (20, 44))
        put_label(vis, f"heel is on the LEFT (flipped={flipped})", (20, 84), scale=0.7, thick=2)
        dbg.save("side_measured", vis)

    return meas, warnings, quality
