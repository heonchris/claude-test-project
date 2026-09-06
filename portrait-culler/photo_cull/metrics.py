# -*- coding: utf-8 -*-
"""
초점 선명도 / 노출 측정
=======================
핵심 포인트: 선명도는 '화면 전체'가 아니라 '가장 큰 얼굴 영역'에서 잽니다.
배경만 선명하고 인물은 흐린 사진이 높은 점수를 받는 것을 막기 위해서입니다.
"""

import cv2
import numpy as np

from . import config


def laplacian_variance(gray):
    """라플라시안 분산: 값이 클수록 선명(경계가 뚜렷)합니다."""
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def face_sharpness(bgr, box):
    """
    얼굴 영역을 잘라 고정 크기(SHARP_CROP_SIZE)로 리사이즈한 뒤 선명도를 잽니다.
    크기를 통일해야 얼굴이 크게 찍힌 사진과 작게 찍힌 사진의 수치를 비교할 수 있습니다.

    반환: (라플라시안 분산, 평균 밝기, 대비(표준편차))
    대비를 함께 돌려주는 이유: 새까맣게 어둡거나 새하얗게 날아간 얼굴은
    초점이 맞아도 라플라시안 값이 0에 가깝게 나옵니다. 그런 사진을 '초점흐림'으로
    잘못 탈락시키지 않으려면 대비를 같이 봐야 합니다.
    """
    x, y, w, h = box
    H, W = bgr.shape[:2]
    m = config.SHARP_CROP_MARGIN
    x0 = int(max(0, x - w * m))
    y0 = int(max(0, y - h * m))
    x1 = int(min(W, x + w * (1 + m)))
    y1 = int(min(H, y + h * (1 + m)))
    if x1 - x0 < 12 or y1 - y0 < 12:
        return None, None, None
    crop = bgr[y0:y1, x0:x1]
    size = config.SHARP_CROP_SIZE
    interp = cv2.INTER_AREA if max(crop.shape[:2]) > size else cv2.INTER_CUBIC
    crop = cv2.resize(crop, (size, size), interpolation=interp)
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    luma = float(np.mean(gray))          # 얼굴 평균 밝기 (노출 판단에 사용)
    contrast = float(np.std(gray))       # 얼굴 대비
    return laplacian_variance(gray), luma, contrast


def frame_sharpness(bgr):
    """화면 전체 선명도. 얼굴이 없을 때의 보조 지표로만 씁니다."""
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    size = 512
    scale = size / float(max(gray.shape[:2]))
    if scale < 1.0:
        gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    return laplacian_variance(gray)


def exposure_stats(bgr):
    """
    히스토그램 클리핑 비율을 구합니다.
      clip_high : 250 이상(하이라이트 날아감) 픽셀 비율
      clip_low  : 5 이하(암부 뭉갬) 픽셀 비율
    역광/실루엣을 억울하게 탈락시키지 않도록, 이 수치는 '주의' 표시에만 씁니다.
    """
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    hist = cv2.calcHist([gray], [0], None, [256], [0, 256]).flatten()
    total = float(hist.sum()) or 1.0
    clip_high = float(hist[config.HIGHLIGHT_LEVEL:].sum() / total)
    clip_low = float(hist[:config.SHADOW_LEVEL + 1].sum() / total)
    mean = float(gray.mean())
    return {"clip_high": clip_high, "clip_low": clip_low, "frame_luma": mean}


def phash_hex(bgr, hash_size=None):
    """
    perceptual hash(그림의 지문). 비슷한 그림이면 비슷한 해시가 나옵니다.
    연사 그룹핑의 2차 확인에 사용합니다.
    """
    import imagehash
    from PIL import Image
    hash_size = hash_size or config.PHASH_SIZE
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    return str(imagehash.phash(Image.fromarray(rgb), hash_size=hash_size))


def phash_distance(a, b):
    """두 해시 문자열의 해밍 거리(다른 비트 수). 0이면 사실상 같은 그림."""
    if not a or not b or len(a) != len(b):
        return 999
    try:
        x = int(a, 16) ^ int(b, 16)
    except ValueError:
        return 999
    return bin(x).count("1")
