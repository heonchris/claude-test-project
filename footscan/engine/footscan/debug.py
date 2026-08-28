"""
debug.py — 단계별 디버그 이미지를 저장합니다. [SPEC 3-7]

★ 이게 없으면 "왜 틀렸는지"를 절대 알 수 없습니다.
   측정값이 이상할 때 이 8장을 순서대로 보면
   종이를 잘못 잡았는지 / 발을 잘못 잘랐는지 / 재는 위치가 틀렸는지 바로 보입니다.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from . import config as C


class DebugSaver:
    """디버그 이미지 저장 담당. enabled=False 면 아무것도 하지 않습니다."""

    def __init__(self, out_dir: str | Path | None, enabled: bool = False, prefix: str = ""):
        self.enabled = bool(enabled and out_dir)
        self.out_dir = Path(out_dir) if out_dir else None
        self.prefix = prefix               # 예: "right_"  (좌우 발을 구분하려고)
        self.saved: dict[str, str] = {}
        if self.enabled:
            self.out_dir.mkdir(parents=True, exist_ok=True)

    def save(self, key: str, img: np.ndarray) -> None:
        """config.DEBUG_NAMES 에 정해진 이름으로 저장합니다."""
        if not self.enabled:
            return
        name = C.DEBUG_NAMES.get(key)
        if name is None:
            name = f"{key}.jpg"
        path = self.out_dir / f"{self.prefix}{name}"

        out = img
        if out.ndim == 2:
            out = cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)
        h, w = out.shape[:2]
        long_edge = max(h, w)
        if long_edge > C.DEBUG_SAVE_LONG_EDGE_PX:
            s = C.DEBUG_SAVE_LONG_EDGE_PX / long_edge
            out = cv2.resize(out, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
        cv2.imwrite(str(path), out, [cv2.IMWRITE_JPEG_QUALITY, C.DEBUG_JPEG_QUALITY])
        self.saved[key] = str(path)


# --- 그림 그리기 도우미 (디버그 이미지 위에 선/글자를 얹습니다) --------------

# 색은 BGR 순서입니다 (OpenCV 규칙)
COLOR_PAPER = (0, 200, 255)     # 주황 — 종이 윤곽
COLOR_FOOT = (0, 255, 0)        # 초록 — 발 윤곽
COLOR_MEASURE = (255, 80, 0)    # 파랑 — 측정선
COLOR_FLOOR = (0, 0, 255)       # 빨강 — 바닥선
COLOR_CONTACT = (255, 0, 255)   # 자홍 — 접지 구간
COLOR_ARCH = (0, 255, 255)      # 노랑 — 아치


def put_label(img: np.ndarray, text: str, org: tuple[int, int],
              color=(255, 255, 255), scale: float = 0.9, thick: int = 2) -> None:
    """
    글자를 그립니다. 검은 테두리를 먼저 그려 어떤 배경에서도 읽히게 합니다.
    ※ OpenCV 기본 폰트는 한글을 못 그려서 디버그 이미지 안 글자는 영문/숫자만 씁니다.
    """
    cv2.putText(img, text, org, cv2.FONT_HERSHEY_SIMPLEX, scale, (0, 0, 0), thick + 3, cv2.LINE_AA)
    cv2.putText(img, text, org, cv2.FONT_HERSHEY_SIMPLEX, scale, color, thick, cv2.LINE_AA)


def mask_overlay(base_bgr: np.ndarray, mask: np.ndarray, color=(0, 255, 0), alpha: float = 0.45) -> np.ndarray:
    """원본 위에 마스크를 반투명하게 얹은 이미지를 만듭니다."""
    out = base_bgr.copy()
    layer = np.zeros_like(out)
    layer[mask > 0] = color
    return cv2.addWeighted(out, 1.0, layer, alpha, 0)
