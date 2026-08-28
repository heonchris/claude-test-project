"""
imageio.py — 사진 파일을 읽어 파이프라인이 쓸 수 있게 준비하는 공통 코드.

여기서 하는 일 두 가지:
  1) EXIF 회전 보정 — 아이폰 사진은 "옆으로 눕혀 저장하고, 회전 정보는 메타데이터에만"
     넣는 경우가 많습니다. 이걸 안 펴면 발이 가로로 누운 채 처리돼 전부 틀립니다.
  2) 크기 줄이기 — 1200만 화소 원본을 그대로 처리하면 느리기만 하고 정확도는 안 오릅니다.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps

from . import config as C
from .errors import image_read_failed


def load_bgr(path: str | Path) -> np.ndarray:
    """사진을 읽고 EXIF 회전을 바로잡아 OpenCV 형식(BGR)으로 돌려줍니다."""
    p = Path(path)
    if not p.exists():
        raise image_read_failed(str(p))
    try:
        pil = Image.open(str(p))
        pil = ImageOps.exif_transpose(pil)   # ★ EXIF 회전 보정 (SPEC A1)
        pil = pil.convert("RGB")
    except Exception:
        raise image_read_failed(str(p))
    return cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)


def resize_long_edge(img: np.ndarray, long_edge: int | None = None) -> tuple[np.ndarray, float]:
    """
    긴 변이 long_edge 픽셀이 되도록 줄입니다.
    돌려주는 값: (줄인 이미지, 배율)  — 배율은 나중에 원본 좌표로 되돌릴 때 씁니다.
    """
    long_edge = long_edge or C.RESIZE_LONG_EDGE_PX
    h, w = img.shape[:2]
    cur = max(h, w)
    if cur <= long_edge:
        return img, 1.0
    scale = long_edge / float(cur)
    out = cv2.resize(img, (int(round(w * scale)), int(round(h * scale))), interpolation=cv2.INTER_AREA)
    return out, scale


def to_gray_blurred(img: np.ndarray) -> np.ndarray:
    """그레이스케일 + 가우시안 블러. 경계 검출 전 노이즈를 줄이는 표준 전처리."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return cv2.GaussianBlur(gray, C.BLUR_KERNEL, 0)


def auto_canny(gray: np.ndarray, sigma: float | None = None) -> np.ndarray:
    """
    밝기 중앙값을 기준으로 Canny 임계값을 자동으로 정합니다.
    사진마다 밝기가 달라도 비슷하게 동작하게 만드는 요령입니다.
    """
    sigma = C.CANNY_SIGMA if sigma is None else sigma
    med = float(np.median(gray))
    lo = int(max(0, (1.0 - sigma) * med))
    hi = int(min(255, (1.0 + sigma) * med))
    return cv2.Canny(gray, lo, hi)
