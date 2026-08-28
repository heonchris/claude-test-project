"""
crosscheck.py — [SPEC B6] 상면과 측면을 교차 검증합니다.

★ 이 기능이 왜 중요한가?
   사용자가 옆면을 잘못 찍었는지 자동으로 알아낼 수 있는 유일한 방법입니다.

   같은 발을 두 각도로 찍었으므로 발 길이가 두 사진 모두에서 나옵니다.
   두 값이 많이 다르다 = 옆면 촬영 각도가 틀어졌다 = 아치 값도 못 믿는다.
"""

from __future__ import annotations

from . import config as C


def cross_check(foot_length_top_mm: float, foot_length_side_mm: float) -> tuple[float, list[str]]:
    """
    두 사진의 발 길이를 비교해 측면 결과의 신뢰도를 매깁니다.
    돌려주는 값: (신뢰도 0~1, 경고 목록)
    """
    delta = abs(foot_length_top_mm - foot_length_side_mm)
    warnings: list[str] = []

    if delta <= C.CROSSCHECK_GOOD_MM:
        conf = C.CROSSCHECK_CONF_GOOD
    elif delta <= C.CROSSCHECK_WARN_MM:
        conf = C.CROSSCHECK_CONF_WARN
        warnings.append(
            f"위/옆 사진의 발 길이가 {delta:.1f}mm 차이 납니다. "
            "아치 값은 참고만 해 주세요."
        )
    else:
        conf = C.CROSSCHECK_CONF_BAD
        warnings.append(
            f"위/옆 사진의 발 길이가 {delta:.1f}mm 나 차이 납니다. "
            "옆면을 다시 찍어 주세요. 휴대폰을 종이 긴 변과 수직으로 세우는 것이 가장 중요합니다."
        )
    return conf, warnings
