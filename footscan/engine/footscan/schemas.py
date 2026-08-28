"""
schemas.py — 측정 결과의 모양(스키마)을 정의합니다. [SPEC 3-6]

pydantic 을 쓰는 이유: 값의 타입을 강제하고, JSON 으로 바로 바꿀 수 있어서
나중에 Phase 1(서버)과 Phase 2(앱)에서 그대로 재사용할 수 있습니다.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class TopMeasurement(BaseModel):
    """상면(위에서 찍은 사진)에서 얻는 평면 치수. 정확도 높음(±3mm)."""

    foot_length_mm: float = Field(..., description="발 길이 (뒤꿈치~가장 긴 발가락)")
    ball_width_mm: float = Field(..., description="발볼 너비 (제1~5 중족골두 부근 최대폭)")
    heel_width_mm: float = Field(..., description="뒤꿈치 너비")
    width_ratio: float = Field(..., description="발볼너비 / 발길이")
    toe_type: Literal["egyptian", "greek", "roman"] = Field(..., description="발가락 형태")
    hallux_valgus_angle_deg: float | None = Field(
        None, description="무지외반 각도 (외형 기반 추정. X-ray 기준의 실제 HVA가 아님)"
    )
    toe_count_detected: int = Field(0, description="윤곽에서 검출된 발가락 봉우리 개수")


class SideMeasurement(BaseModel):
    """측면(안쪽에서 찍은 사진)에서 얻는 높이 정보. 정확도 중간(±5~8mm)."""

    foot_length_side_mm: float = Field(..., description="측면에서 잰 발 길이 (교차검증용)")
    arch_clearance_mm: float = Field(..., description="아치가 바닥에서 들린 최대 높이")
    arch_gap_length_mm: float = Field(..., description="아치 비접지 구간의 길이")
    arch_gap_ratio: float = Field(..., description="비접지 구간 길이 / 발 길이")
    instep_height_mm: float = Field(..., description="발등 높이 (발 길이 50% 지점)")
    arch_height_index: float = Field(..., description="발등높이 / 발길이 (보통 0.32~0.37)")
    arch_grade: Literal["low", "normal", "high"] = Field(..., description="아치 등급 (주 결과)")
    cross_check_delta_mm: float = Field(..., description="상면 길이와 측면 길이의 차이")


class SizeOption(BaseModel):
    """신발 종류 하나에 대한 추천 사이즈."""

    shoe_type: str = Field(..., description="신발 종류 (sneakers, running, ...)")
    allowance_mm: float = Field(..., description="적용한 여유분")
    inner_length_mm: float = Field(..., description="발 길이 + 여유분")
    kr_jp_mm: int = Field(..., description="KR/JP 표기 (mondopoint, 5mm 단위)")
    us_men: float | None = None
    us_women: float | None = None
    eu: float | None = None
    uk: float | None = None


class SizeRecommendation(BaseModel):
    """사이즈 추천 결과 전체. [SPEC 4]"""

    based_on_foot: Literal["left", "right"] = Field(..., description="어느 발 기준으로 계산했는지")
    based_on_length_mm: float
    options: list[SizeOption] = Field(default_factory=list)
    width_grade: Literal["narrow", "regular", "wide", "extra_wide"] | None = None
    width_grade_label: str | None = Field(None, description="사람이 읽는 폭 등급 (추정 표기 포함)")
    notes: list[str] = Field(default_factory=list, description="참고 문구 (진단 표현 금지)")


class FootMeasurement(BaseModel):
    """발 한 쪽의 측정 결과."""

    side: Literal["left", "right"]
    top: TopMeasurement
    lateral: SideMeasurement | None = None   # 측면 촬영은 선택 가능
    confidence: float = Field(1.0, ge=0.0, le=1.0)
    warnings: list[str] = Field(default_factory=list)
    debug_images: dict[str, str] = Field(default_factory=dict, description="저장된 디버그 이미지 경로")


class ScanResult(BaseModel):
    """한 번의 스캔 전체 결과."""

    left: FootMeasurement | None = None
    right: FootMeasurement | None = None
    asymmetry_mm: float | None = None
    recommended_size: SizeRecommendation | None = None
    scanned_at: datetime = Field(default_factory=datetime.now)
    disclaimer: str = ""
