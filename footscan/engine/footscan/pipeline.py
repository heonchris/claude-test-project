"""
pipeline.py — 전체 흐름을 엮는 곳(오케스트레이션).

한 발 처리 순서:
   [상면]  사진 읽기 → A4 검출 → 원근 펴기 → 발 분할 → 측정
   [측면]  사진 읽기 → 기준 변 검출 → 발 분할 → 아치 측정      (선택)
   [검증]  두 사진의 발 길이 비교 → 신뢰도 결정
"""

from __future__ import annotations

from pathlib import Path

from . import config as C
from .crosscheck import cross_check
from .debug import DebugSaver
from .imageio import load_bgr, resize_long_edge
from .schemas import FootMeasurement, ScanResult
from .side.measure import measure_side
from .side.reference import detect_reference
from .side.segment import segment_foot_side
from .sizing import recommend
from .top.measure import measure_top
from .top.paper import detect_paper
from .top.segment import segment_foot
from .top.warp import warp_to_a4


def scan_foot(
    top_path: str | Path,
    side_path: str | Path | None = None,
    foot: str = "right",
    out_dir: str | Path | None = None,
    debug: bool = False,
) -> FootMeasurement:
    """발 한 쪽을 측정합니다. 측면 사진은 없어도 됩니다."""
    warnings: list[str] = []
    dbg = DebugSaver(out_dir, debug, prefix=f"{foot}_")

    # ---------- 파이프라인 A : 상면 ----------
    img = load_bgr(top_path)
    img, _ = resize_long_edge(img)
    quad, w1 = detect_paper(img, dbg)
    warnings += w1
    warped, _ = warp_to_a4(img, quad, dbg)
    mask, w2 = segment_foot(warped, dbg)
    warnings += w2
    top_meas, _, w3 = measure_top(mask, warped, dbg)
    warnings += w3

    confidence = 1.0
    if any("종이" in w and "밖으로" in w for w in warnings):
        confidence = min(confidence, 0.6)
    if any("휘어" in w for w in warnings):
        confidence = min(confidence, 0.85)

    # ---------- 파이프라인 B : 측면 (선택) ----------
    side_meas = None
    if side_path:
        simg = load_bgr(side_path)
        simg, _ = resize_long_edge(simg)
        ref = detect_reference(simg, dbg)
        warnings += ref.warnings
        smask, w4 = segment_foot_side(ref, dbg)
        warnings += w4
        side_meas, w5 = measure_side(smask, ref, top_meas.foot_length_mm, dbg)
        warnings += w5

        # ---------- 교차 검증 ----------
        side_conf, w6 = cross_check(top_meas.foot_length_mm, side_meas.foot_length_side_mm)
        warnings += w6
        confidence = min(confidence, side_conf)

    if confidence < C.LOW_CONFIDENCE_THRESHOLD:
        warnings.append(
            "[LOW_CONFIDENCE] 측정 신뢰도가 낮습니다. 결과를 그대로 믿지 말고 다시 촬영해 주세요."
        )

    return FootMeasurement(
        side=foot,
        top=top_meas,
        lateral=side_meas,
        confidence=round(confidence, 2),
        warnings=warnings,
        debug_images=dict(dbg.saved),
    )


def scan(
    right_top: str | Path | None = None,
    right_side: str | Path | None = None,
    left_top: str | Path | None = None,
    left_side: str | Path | None = None,
    out_dir: str | Path | None = None,
    debug: bool = False,
) -> ScanResult:
    """한쪽 또는 양쪽 발을 측정하고 사이즈 추천까지 만듭니다."""
    right = scan_foot(right_top, right_side, "right", out_dir, debug) if right_top else None
    left = scan_foot(left_top, left_side, "left", out_dir, debug) if left_top else None

    asym = None
    if right and left:
        asym = round(abs(right.top.foot_length_mm - left.top.foot_length_mm), 1)

    # 사이즈는 항상 '큰 발' 기준으로 추천합니다 [SPEC 4-5]
    base = right or left
    if right and left:
        base = right if right.top.foot_length_mm >= left.top.foot_length_mm else left

    rec = None
    if base is not None:
        rec = recommend(base.top, base.lateral, base.side, asym)

    return ScanResult(
        left=left, right=right, asymmetry_mm=asym,
        recommended_size=rec, disclaimer=C.DISCLAIMER,
    )
