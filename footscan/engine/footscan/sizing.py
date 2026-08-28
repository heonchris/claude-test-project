"""
sizing.py — [SPEC 4] 잰 치수를 신발 사이즈로 바꿉니다.

★ 중요한 원칙
   US/EU/UK 환산은 코드가 계산하지 않습니다. data/size_tables.json 을 찾아볼 뿐입니다.
   브랜드마다 기준이 달라서, 공식으로 만들면 그럴듯하지만 틀린 값이 나옵니다. (SPEC 4-2)
   표에 없는 값은 그냥 null 로 둡니다.

   그리고 모든 문구는 "권장"이 아니라 "참고" 표현입니다. (SPEC 1-5 법적 표현 제한)
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from . import config as C
from .schemas import SideMeasurement, SizeOption, SizeRecommendation, TopMeasurement

_TABLE_PATH = Path(__file__).resolve().parents[1] / "data" / "size_tables.json"


@lru_cache(maxsize=1)
def load_size_tables() -> dict:
    """사이즈 대응표를 읽습니다. 파일이 없으면 빈 표로 동작합니다(지어내지 않음)."""
    try:
        return json.loads(_TABLE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {"table": {}, "width_labels": {}, "verified": False}


def to_kr_jp_mm(foot_length_mm: float, allowance_mm: float) -> int:
    """
    KR/JP 표기(mondopoint) 로 바꿉니다.
      신발 내부 길이 = 발 길이 + 여유분 → 5mm 단위 반올림
      예: 253mm + 스니커즈 10mm = 263 → 265
    """
    inner = foot_length_mm + allowance_mm
    step = C.SIZE_ROUND_STEP_MM
    return int(round(inner / step) * step)


def width_grade(width_ratio: float) -> str:
    """발볼 너비 비율로 폭 등급을 정합니다. [SPEC 4-3]"""
    if width_ratio < C.WIDTH_RATIO_NARROW:
        return "narrow"
    if width_ratio < C.WIDTH_RATIO_REGULAR:
        return "regular"
    if width_ratio < C.WIDTH_RATIO_WIDE:
        return "wide"
    return "extra_wide"


def recommend(
    top: TopMeasurement,
    side: SideMeasurement | None,
    based_on: str,
    asymmetry_mm: float | None = None,
) -> SizeRecommendation:
    """발 치수 → 신발 사이즈 추천 (참고용)."""
    tables = load_size_tables()
    table = tables.get("table", {})
    labels = tables.get("width_labels", {})

    options: list[SizeOption] = []
    for shoe_type, allowance in C.SHOE_ALLOWANCE_MM.items():
        kr = to_kr_jp_mm(top.foot_length_mm, allowance)
        row = table.get(str(kr), {})
        options.append(SizeOption(
            shoe_type=shoe_type,
            allowance_mm=allowance,
            inner_length_mm=round(top.foot_length_mm + allowance, 1),
            kr_jp_mm=kr,
            us_men=row.get("us_men"),
            us_women=row.get("us_women"),
            eu=row.get("eu"),
            uk=row.get("uk"),
        ))

    grade = width_grade(top.width_ratio)
    notes: list[str] = [
        "발볼 '둘레'를 잰 것이 아니라 '너비'로 추정한 값입니다. "
        "정확한 폭 등급은 줄자로 발볼 둘레를 재서 입력해 주세요.",
    ]
    if not tables.get("verified", False):
        notes.append(
            "US/EU/UK 표기는 아직 검증되지 않은 대응표를 쓴 참고값입니다. "
            "브랜드마다 반 사이즈씩 다를 수 있습니다."
        )

    # 측면 데이터가 있으면 아치·발등을 반영한 참고 문구를 붙입니다 [SPEC 4-4]
    if side is not None:
        if side.arch_height_index > C.ARCH_HEIGHT_INDEX_HIGH:
            notes.append("발등이 높은 편으로 측정되었습니다. 끈 여유가 있거나 볼륨이 큰 모델을 참고해 보세요.")
        if side.arch_grade == "low":
            notes.append("아치가 낮은 편으로 측정되었습니다. 아치 서포트가 있는 안정화 계열을 참고해 보세요.")
        elif side.arch_grade == "high":
            notes.append("아치가 높은 편으로 측정되었습니다. 쿠셔닝 위주 모델을 참고해 보세요.")

    if asymmetry_mm is not None and asymmetry_mm >= C.ASYMMETRY_WARN_MM:
        notes.append(
            f"좌우 발 길이가 {asymmetry_mm:.1f}mm 차이 납니다. 큰 발 기준으로 사이즈를 잡았습니다."
        )

    notes.append(
        "저녁에는 발이 부어 아침보다 크게 측정됩니다. "
        "신발은 오후~저녁 기준으로 고르는 것이 편합니다."
    )

    return SizeRecommendation(
        based_on_foot=based_on,
        based_on_length_mm=top.foot_length_mm,
        options=options,
        width_grade=grade,
        width_grade_label=labels.get(grade, grade) + " · 추정값",
        notes=notes,
    )
