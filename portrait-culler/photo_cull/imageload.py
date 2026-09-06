# -*- coding: utf-8 -*-
"""
단계 2: 사진 로딩
=================
RAW는 '전체 디코딩'을 하지 않고, 카메라가 파일 안에 넣어둔 JPEG 미리보기를 꺼내 씁니다.
(전체 디코딩 대비 5~20배 빠릅니다. 초점/눈/노출 판정에는 미리보기로 충분합니다.)

미리보기가 없거나 너무 작으면 그때만 축소 디코딩(half size)으로 폴백합니다.
"""

import io
import os

import cv2
import numpy as np
from PIL import Image, ImageOps

from . import config

try:
    import rawpy
    HAS_RAWPY = True
except Exception:                     # rawpy 미설치 시에도 JPEG 작업은 가능하도록
    rawpy = None
    HAS_RAWPY = False

try:
    import exifread
    HAS_EXIFREAD = True
except Exception:
    exifread = None
    HAS_EXIFREAD = False


# EXIF Orientation(방향) 값 → 적용할 회전/반전
# 세로 사진을 바로 세워야 얼굴 검출이 제대로 됩니다. 이 처리가 없으면
# 세로 컷에서 얼굴을 통째로 놓칠 수 있습니다.
def _apply_orientation(bgr, orientation):
    if not orientation or orientation == 1:
        return bgr
    if orientation == 2:
        return cv2.flip(bgr, 1)
    if orientation == 3:
        return cv2.rotate(bgr, cv2.ROTATE_180)
    if orientation == 4:
        return cv2.flip(bgr, 0)
    if orientation == 5:
        return cv2.rotate(cv2.flip(bgr, 1), cv2.ROTATE_90_CLOCKWISE)
    if orientation == 6:
        return cv2.rotate(bgr, cv2.ROTATE_90_CLOCKWISE)
    if orientation == 7:
        return cv2.rotate(cv2.flip(bgr, 1), cv2.ROTATE_90_COUNTERCLOCKWISE)
    if orientation == 8:
        return cv2.rotate(bgr, cv2.ROTATE_90_COUNTERCLOCKWISE)
    return bgr


def _resize_long_side(bgr, long_side):
    """긴 변을 지정 길이로 맞춰 축소합니다(확대는 하지 않음)."""
    h, w = bgr.shape[:2]
    cur = max(h, w)
    if cur <= long_side:
        return bgr
    scale = long_side / float(cur)
    return cv2.resize(bgr, (max(1, int(round(w * scale))), max(1, int(round(h * scale)))),
                      interpolation=cv2.INTER_AREA)


def read_exif(path):
    """
    EXIF에서 촬영시각 / 방향 / 카메라 정보를 읽습니다.
    exifread는 JPEG와 대부분의 RAW(TIFF 기반)를 모두 읽을 수 있습니다.
    """
    info = {"capture_time": None, "orientation": None, "camera": None, "lens": None}
    if not HAS_EXIFREAD:
        return info
    try:
        with open(path, "rb") as f:
            tags = exifread.process_file(f, details=False)
    except Exception:
        return info

    def val(key):
        t = tags.get(key)
        return str(t).strip() if t is not None else None

    dt = val("EXIF DateTimeOriginal") or val("Image DateTime") or val("EXIF DateTimeDigitized")
    if dt:
        subsec = val("EXIF SubSecTimeOriginal") or val("EXIF SubSecTime")
        info["capture_time"] = dt if not subsec else "%s.%s" % (dt, subsec)

    o = tags.get("Image Orientation")
    if o is not None:
        try:
            info["orientation"] = int(o.values[0])
        except Exception:
            info["orientation"] = None

    make = val("Image Make") or ""
    model = val("Image Model") or ""
    cam = ("%s %s" % (make, model)).strip()
    info["camera"] = cam or None
    info["lens"] = val("EXIF LensModel")
    return info


def _load_raw(path):
    """
    RAW에서 이미지를 얻습니다.
    반환: (BGR ndarray, source 문자열, (원본폭, 원본높이))
      source = 'raw_preview'  → 내장 JPEG 미리보기 사용 (빠름)
               'raw_halfsize' → 미리보기가 없어 축소 디코딩 (느림)
    """
    if not HAS_RAWPY:
        raise RuntimeError("rawpy가 설치되어 있지 않아 RAW를 열 수 없습니다.")

    with rawpy.imread(path) as raw:
        orig_size = (raw.sizes.width, raw.sizes.height)
        # 1) 내장 미리보기 시도
        try:
            thumb = raw.extract_thumb()
        except Exception:
            thumb = None

        if thumb is not None:
            try:
                if thumb.format == rawpy.ThumbFormat.JPEG:
                    pil = Image.open(io.BytesIO(thumb.data))
                    # 미리보기 자체에 방향 정보가 있으면 먼저 적용
                    pil = ImageOps.exif_transpose(pil).convert("RGB")
                    bgr = cv2.cvtColor(np.asarray(pil), cv2.COLOR_RGB2BGR)
                else:  # BITMAP 형식(이미 배열)
                    arr = thumb.data
                    bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
                if max(bgr.shape[:2]) >= config.MIN_PREVIEW_LONG_SIDE:
                    return bgr, "raw_preview", orig_size
                # 미리보기가 너무 작으면 아래 폴백으로 넘어갑니다.
            except Exception:
                pass

        # 2) 폴백: 축소 디코딩 (절반 크기, 카메라 화이트밸런스 적용)
        rgb = raw.postprocess(use_camera_wb=True, half_size=True,
                              no_auto_bright=False, output_bps=8)
        return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), "raw_halfsize", orig_size


def _load_image(path):
    """일반 이미지(JPEG/PNG/TIFF 등)를 읽습니다. EXIF 방향을 적용합니다."""
    pil = Image.open(path)
    orig_size = pil.size
    pil = ImageOps.exif_transpose(pil).convert("RGB")
    bgr = cv2.cvtColor(np.asarray(pil), cv2.COLOR_RGB2BGR)
    return bgr, "image", orig_size


def load_for_analysis(path, long_side=None):
    """
    분석용 이미지를 준비해 돌려줍니다.

    반환값(dict):
      bgr        : 분석용 BGR 이미지 (긴 변이 ANALYZE_LONG_SIDE로 축소됨)
      source     : 'raw_preview' | 'raw_halfsize' | 'image'
      width/height    : 분석 이미지 크기
      orig_width/height : 원본 크기 (알 수 있는 경우)
      capture_time / camera : EXIF 정보
    """
    long_side = long_side or config.ANALYZE_LONG_SIDE
    ext = os.path.splitext(path)[1].lower()
    exif = read_exif(path)

    if ext in config.RAW_EXTS:
        bgr, source, orig_size = _load_raw(path)
        # RAW 미리보기에 방향 정보가 없는 기종이 있어, 파일 EXIF 방향으로 한 번 더 보정합니다.
        # (미리보기가 이미 세로면 가로/세로 비율로 판단해 중복 회전을 피합니다)
        o = exif.get("orientation")
        if source == "raw_preview" and o in (3, 6, 8):
            h, w = bgr.shape[:2]
            ow, oh = orig_size
            preview_is_landscape = w >= h
            orig_is_landscape = ow >= oh
            # 원본이 가로인데 방향태그가 90도 회전을 지시하고, 미리보기도 아직 가로라면 → 회전 필요
            if o in (6, 8) and preview_is_landscape and orig_is_landscape:
                bgr = _apply_orientation(bgr, o)
            elif o == 3:
                bgr = _apply_orientation(bgr, o)
    else:
        bgr, source, orig_size = _load_image(path)

    if bgr is None or bgr.size == 0:
        raise RuntimeError("이미지를 읽지 못했습니다(빈 데이터).")

    full_h, full_w = bgr.shape[:2]
    small = _resize_long_side(bgr, long_side)
    h, w = small.shape[:2]
    return {
        "bgr": small,
        "bgr_full": bgr,          # 썸네일 생성 등에 사용
        "source": source,
        "width": w, "height": h,
        "loaded_width": full_w, "loaded_height": full_h,
        "orig_width": orig_size[0], "orig_height": orig_size[1],
        "capture_time": exif.get("capture_time"),
        "camera": exif.get("camera"),
        "orientation": exif.get("orientation"),
    }


def save_thumbnail(bgr, out_path, long_side=None, quality=None):
    """HTML 리포트용 썸네일 JPEG을 저장합니다."""
    long_side = long_side or config.THUMB_LONG_SIDE
    quality = quality or config.THUMB_QUALITY
    small = _resize_long_side(bgr, long_side)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    cv2.imwrite(out_path, small, [int(cv2.IMWRITE_JPEG_QUALITY), int(quality)])
    return out_path
