"""
errors.py — 실패했을 때 "어느 단계에서 왜 실패했는지"를 알려주는 에러 정의.

파이프라인 어디서든 FootScanError 를 던지면
cli.py 가 [에러코드] 한글 메시지 형태로 보여줍니다.
"""

from __future__ import annotations


class FootScanError(Exception):
    """발 스캔 파이프라인의 모든 실패를 표현하는 예외."""

    def __init__(self, code: str, message: str, stage: str = "", hint: str = ""):
        self.code = code        # 예: PAPER_NOT_FOUND
        self.message = message  # 사용자에게 보여줄 한글 메시지
        self.stage = stage      # 실패한 단계 이름 (예: "A2 A4 검출")
        self.hint = hint        # 어떻게 하면 되는지 안내
        super().__init__(f"[{code}] {message}")

    def to_dict(self) -> dict:
        return {
            "error_code": self.code,
            "message": self.message,
            "stage": self.stage,
            "hint": self.hint,
        }


# --- SPEC 3-8에서 요구한 에러 코드들 ---------------------------------------

def paper_not_found(stage: str = "A2 A4 검출") -> FootScanError:
    return FootScanError(
        "PAPER_NOT_FOUND",
        "사진에서 A4 용지를 찾지 못했습니다.",
        stage,
        "종이 네 모서리가 모두 화면 안에 보이게, 조명을 켜고 다시 찍어 주세요. "
        "카펫이 아닌 단단하고 평평한 바닥에 놓아야 합니다.",
    )


def foot_not_found(stage: str = "A4 발 분할", detail: str = "", hint: str = "") -> FootScanError:
    return FootScanError(
        "FOOT_NOT_FOUND",
        "사진에서 발을 찾지 못했습니다." + (f" ({detail})" if detail else ""),
        stage,
        hint or (
            "맨발 또는 어두운 색 양말로, 종이 위에 발 전체가 들어오게 딛고 다시 찍어 주세요. "
            "흰 양말은 종이와 구분되지 않습니다."
        ),
    )


def side_ref_not_found(stage: str = "B2 기준 스케일 검출", detail: str = "") -> FootScanError:
    return FootScanError(
        "SIDE_REF_NOT_FOUND",
        "옆면 사진에서 기준이 되는 A4 긴 변을 찾지 못했습니다." + (f" ({detail})" if detail else ""),
        stage,
        "① 발을 종이 긴 변의 '가운데'에 딛어 종이 양 끝이 가려지지 않게 해 주세요. "
        "② 휴대폰을 바닥에서 10~15cm 높이로 낮추고 지면과 수직으로 세워 주세요. "
        "③ 종이의 긴 변이 화면 가로로 꽉 차게 찍어 주세요.",
    )


def low_confidence(delta_mm: float, stage: str = "B6 교차검증") -> FootScanError:
    return FootScanError(
        "LOW_CONFIDENCE",
        f"위/옆 사진의 발 길이가 {delta_mm:.1f}mm 차이 납니다. 측정값을 믿기 어렵습니다.",
        stage,
        "옆면을 다시 찍어 주세요. 휴대폰을 종이 긴 변과 수직으로 세우는 것이 가장 중요합니다.",
    )


def image_read_failed(path: str) -> FootScanError:
    return FootScanError(
        "IMAGE_READ_FAILED",
        f"사진 파일을 열 수 없습니다: {path}",
        "전처리",
        "파일 경로가 맞는지, jpg/png 파일이 맞는지 확인해 주세요.",
    )
