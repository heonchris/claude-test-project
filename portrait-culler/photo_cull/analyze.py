# -*- coding: utf-8 -*-
"""
사진 한 장을 분석해 '수치'를 뽑는 부분
=====================================
여기서는 점수를 매기지 않습니다. 오직 측정만 합니다.
점수/등급은 scoring.py 가 담당하며, 그래야 임계값만 바꾼 재실행이 빨라집니다.
(측정값은 캐시에 저장되고, 점수는 매번 새로 계산됩니다)
"""

import atexit
import os
import time
import traceback

import cv2

from . import config, faces as faces_mod, imageload, metrics, util

# 프로세스마다 하나씩 만들어 재사용하는 엔진 (멀티프로세싱용 전역)
_ENGINE = None


def _close_engine():
    """
    파이썬이 종료될 때 엔진을 먼저 정리합니다.
    이렇게 하지 않으면 MediaPipe 내부에서 'Exception ignored in __del__' 같은
    무해하지만 놀랄 만한 메시지가 터미널에 찍힙니다.
    """
    global _ENGINE
    eng, _ENGINE = _ENGINE, None
    if eng is not None:
        try:
            eng.close()
        except Exception:
            pass


def get_engine():
    global _ENGINE
    if _ENGINE is None:
        _ENGINE = faces_mod.FaceEngine()
        atexit.register(_close_engine)
    return _ENGINE


def _detect_faces_thorough(engine, bgr):
    """
    얼굴을 찾습니다. 한 장도 못 찾으면 두 단계로 더 시도합니다.
      1) 화면을 4조각으로 나눠 조각마다 검출 (전신 샷/원거리 컷 구제)
      2) 이미지를 90도/270도 돌려 검출 (회전 정보가 잘못된 세로 사진 구제)
    반환: (faces, 사용한 이미지, 적용한 회전각)
    """
    found = engine.detect(bgr)
    if not found and config.RETRY_TILED_WHEN_NO_FACE:
        found = engine.detect_tiled(bgr)
        if found:
            found.sort(key=lambda f: f["box"][2] * f["box"][3], reverse=True)
            return found, bgr, 0
    if found or not config.RETRY_ROTATED_WHEN_NO_FACE:
        return found, bgr, 0
    for angle, code in ((90, cv2.ROTATE_90_CLOCKWISE), (270, cv2.ROTATE_90_COUNTERCLOCKWISE)):
        rot = cv2.rotate(bgr, code)
        found = engine.detect(rot)
        if found:
            return found, rot, angle
    return [], bgr, 0


def decide_eye_state(ear_l, ear_r, blink_l, blink_r):
    """
    EAR과 blendshape 깜빡임 점수로 눈 상태를 정합니다.
    반환: "open" | "closed" | "unknown"

    실측 근거: 눈을 뜨고 있어도 눈매에 따라 EAR이 0.19까지 내려갑니다.
    그래서 기본값은 두 지표가 '모두' 감음이라고 할 때만 감음으로 판정합니다
    (config.EYE_DECISION_MODE = "both"). 멀쩡한 사진을 버리는 실수를 줄이기 위함입니다.
    """
    mode = config.EYE_DECISION_MODE
    n_need = config.EYE_CLOSED_REQUIRED_EYES

    ear_vals = [v for v in (ear_l, ear_r) if v is not None]
    blink_vals = [v for v in (blink_l, blink_r) if v is not None]
    if not ear_vals and not blink_vals:
        return "unknown"

    ear_closed_count = sum(1 for v in ear_vals if v < config.EAR_CLOSED)
    blink_closed_count = sum(1 for v in blink_vals if v > config.BLINK_CLOSED)

    ear_says_closed = len(ear_vals) >= n_need and ear_closed_count >= n_need
    blink_says_closed = len(blink_vals) >= n_need and blink_closed_count >= n_need

    if mode == "ear":
        return "closed" if ear_says_closed else "open"
    if mode == "blendshape":
        if not blink_vals:
            return "closed" if ear_says_closed else "open"   # 점수가 없으면 EAR로 대체
        return "closed" if blink_says_closed else "open"
    if mode == "any":
        return "closed" if (ear_says_closed or blink_says_closed) else "open"
    # 기본값 "both": 깜빡임 점수가 없으면 EAR 단독 판정으로 대체
    if not blink_vals:
        return "closed" if ear_says_closed else "open"
    return "closed" if (ear_says_closed and blink_says_closed) else "open"


def analyze_file(path, thumb_dir=None, want_debug=False):
    """
    사진 한 장을 분석해 측정값 dict를 돌려줍니다.
    실패해도 예외를 밖으로 던지지 않고 ok=False 로 표시합니다.
    (한 장이 깨져도 전체 작업이 멈추지 않게 하기 위함)
    """
    t0 = time.time()
    rec = {
        "path": os.path.abspath(path),
        "name": os.path.basename(path),
        "ok": False,
        "error": None,
        "faces": 0,
        "eye_state": "unknown",
    }
    try:
        st = os.stat(path)
        rec["size"] = st.st_size
        rec["mtime"] = st.st_mtime

        loaded = imageload.load_for_analysis(path)
        bgr = loaded["bgr"]
        rec.update({
            "source": loaded["source"],
            "width": loaded["width"], "height": loaded["height"],
            "orig_width": loaded["orig_width"], "orig_height": loaded["orig_height"],
            "capture_time": loaded["capture_time"],
            "camera": loaded["camera"],
        })

        # 썸네일 저장 (HTML 리포트용)
        if thumb_dir:
            tname = util.thumb_name(path)
            imageload.save_thumbnail(loaded["bgr_full"], os.path.join(thumb_dir, tname))
            rec["thumb"] = tname

        # --- 유사 컷 판별용 지문 ---
        rec["phash"] = metrics.phash_hex(bgr)

        # --- 노출 ---
        rec.update(metrics.exposure_stats(bgr))

        # --- 얼굴 검출 ---
        engine = get_engine()
        found, work, rot = _detect_faces_thorough(engine, bgr)
        rec["engine"] = engine.kind
        rec["rotated_for_detect"] = rot
        rec["faces"] = len(found)
        rec["frame_sharp"] = round(metrics.frame_sharpness(work), 1)

        if found:
            long_side = float(max(work.shape[:2]))
            # 큰 얼굴부터 차례로 landmark 검증을 시도합니다.
            # landmark가 찍히면 '진짜 얼굴'이 확실하고, 눈 수치도 함께 얻습니다.
            best, em, verified = None, None, None
            for cand in found[:config.FACE_MAX_CANDIDATES]:
                cx, cy, cw, ch = cand["box"]
                ratio = max(cw, ch) / long_side
                if ratio < config.EYE_MIN_FACE_RATIO:
                    # 얼굴이 너무 작으면 눈 판정을 하지 않으므로 검증도 생략하고 그대로 채택
                    best, em, verified = cand, None, None
                    rec["eye_skip_reason"] = "얼굴이 작음(%.3f < %.3f)" % (
                        ratio, config.EYE_MIN_FACE_RATIO)
                    break
                m = engine.eye_metrics(work, cand["box"])
                if m is not None:
                    best, em, verified = cand, m, True
                    break
            if best is None:
                # 후보 전부 landmark 실패 → 오검출 의심
                best, em, verified = found[0], None, False
                rec["eye_skip_reason"] = "landmark 실패"

            x, y, w, h = best["box"]
            rec["face_box"] = [int(x), int(y), int(w), int(h)]
            rec["face_score"] = round(best["score"], 4)
            rec["face_ratio"] = round(max(w, h) / long_side, 4)
            rec["face_verified"] = verified

            # landmark도 안 찍히고 신뢰도까지 낮으면 사람 얼굴이 아닐 가능성이 큽니다.
            # (실측: 가구를 얼굴로 잡은 오검출이 신뢰도 0.50~0.55에서 나왔습니다)
            rec["face_suspect"] = bool(
                verified is False and best["score"] < config.FACE_TRUST_CONFIDENCE)

            # --- 얼굴 영역 선명도 (핵심) ---
            sharp, luma, contrast = metrics.face_sharpness(work, best["box"])
            rec["face_sharp"] = None if sharp is None else round(sharp, 2)
            rec["face_luma"] = None if luma is None else round(luma, 1)
            rec["face_contrast"] = None if contrast is None else round(contrast, 1)

            # --- 눈 감음 ---
            if em is None:
                rec["eye_state"] = "unknown"
            else:
                rec["ear_left"] = _r(em["ear_left"])
                rec["ear_right"] = _r(em["ear_right"])
                rec["blink_left"] = _r(em["blink_left"])
                rec["blink_right"] = _r(em["blink_right"])
                rec["eye_state"] = decide_eye_state(
                    em["ear_left"], em["ear_right"], em["blink_left"], em["blink_right"])
                rec.pop("eye_skip_reason", None)
                if want_debug:
                    rec["_debug_points"] = em.get("_points")
                    rec["_debug_crop_shape"] = em.get("_crop_shape")
        else:
            rec["face_box"] = None
            rec["face_ratio"] = None
            rec["face_sharp"] = None
            rec["face_luma"] = None
            rec["face_contrast"] = None
            rec["face_verified"] = None
            rec["face_suspect"] = False

        if want_debug:
            rec["_debug_image"] = work

        rec["ok"] = True
    except Exception as e:
        rec["error"] = "%s: %s" % (type(e).__name__, e)
        rec["traceback"] = traceback.format_exc()

    rec["elapsed"] = round(time.time() - t0, 3)
    return rec


def _r(v, nd=4):
    return None if v is None else round(float(v), nd)


# ---- 멀티프로세싱 워커 --------------------------------------------------------
def _worker(args):
    path, thumb_dir = args
    return analyze_file(path, thumb_dir=thumb_dir, want_debug=False)


def strip_debug(rec):
    """캐시에 저장하기 전에 이미지 등 무거운 값을 제거합니다."""
    return {k: v for k, v in rec.items() if not k.startswith("_") and k != "traceback"}
