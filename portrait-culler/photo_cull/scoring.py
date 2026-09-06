# -*- coding: utf-8 -*-
"""
단계 6: 점수 계산 + 태그 + 별점
===============================
측정값(analyze.py 결과)에 config의 임계값/가중치를 적용해 0~100점을 냅니다.
이 파일은 사진을 다시 읽지 않으므로, 임계값을 바꾼 재실행은 몇 초면 끝납니다.
"""

from . import config

# 태그 이름 (HTML/CSV/XMP 키워드에 그대로 쓰입니다)
TAG_NO_FACE = "얼굴없음"
TAG_FACE_SUSPECT = "얼굴검출의심"
TAG_BLUR = "초점흐림"
TAG_FOCUS_UNKNOWN = "초점판정불가"
TAG_EYES_CLOSED = "눈감음"
TAG_EYES_UNKNOWN = "눈판정불가"
TAG_HIGHLIGHT = "노출주의_하이라이트"
TAG_SHADOW = "노출주의_암부"
TAG_FACE_DARK = "노출주의_얼굴어두움"
TAG_FACE_BRIGHT = "노출주의_얼굴날아감"
TAG_REP = "그룹대표"
TAG_ERROR = "분석실패"


def _lerp01(value, lo, hi):
    """value를 lo~hi 구간에서 0~1로 환산(구간 밖은 0 또는 1)."""
    if value is None:
        return 0.0
    if hi <= lo:
        return 1.0
    return max(0.0, min(1.0, (value - lo) / (hi - lo)))


def sharpness_subscore(rec):
    """얼굴 선명도 0~1. 얼굴이 없거나 오검출 의심이면 화면 전체 선명도로 대신합니다."""
    v = None if rec.get("face_suspect") else rec.get("face_sharp")
    if v is None:
        v = rec.get("frame_sharp")
    return _lerp01(v, config.SHARP_FLOOR, config.SHARP_GOOD)


def eye_subscore(rec):
    state = rec.get("eye_state", "unknown")
    if state == "open":
        return config.EYE_SCORE_OPEN
    if state == "closed":
        return config.EYE_SCORE_CLOSED
    return config.EYE_SCORE_UNKNOWN


def exposure_subscore(rec, tags):
    """노출 0~1. 문제가 있으면 감점하고 '주의' 태그를 붙입니다(탈락은 아님)."""
    s = 1.0
    luma = rec.get("face_luma")
    face_ok = (luma is not None
               and config.FACE_DARK_MEAN <= luma <= config.FACE_BRIGHT_MEAN)

    # 하이라이트: 인물 얼굴 노출이 멀쩡하면 배경이 날아간 것은 문제 삼지 않습니다.
    # (흰 배경/하이키 촬영이 전부 '주의'로 뜨는 것을 막기 위함)
    if ((rec.get("clip_high") or 0.0) >= config.HIGHLIGHT_WARN_RATIO
            and not (config.HIGHLIGHT_IGNORE_WHEN_FACE_OK and face_ok)):
        s -= config.EXPO_PENALTY_HIGHLIGHT
        tags.append(TAG_HIGHLIGHT)
    if (rec.get("clip_low") or 0.0) >= config.SHADOW_WARN_RATIO:
        s -= config.EXPO_PENALTY_SHADOW
        tags.append(TAG_SHADOW)
    if luma is not None:
        if luma < config.FACE_DARK_MEAN:
            s -= config.EXPO_PENALTY_FACE_LUMA
            tags.append(TAG_FACE_DARK)
        elif luma > config.FACE_BRIGHT_MEAN:
            s -= config.EXPO_PENALTY_FACE_LUMA
            tags.append(TAG_FACE_BRIGHT)
    return max(0.0, s)


def score_one(rec):
    """
    사진 한 장의 점수/태그/탈락여부를 계산해 rec에 채워 넣습니다.
    (그룹대표 표시와 최종 별점은 score_all에서 그룹 단위로 정합니다)
    """
    tags = []
    if not rec.get("ok"):
        rec["score"] = 0.0
        rec["tags"] = [TAG_ERROR]
        rec["rejected"] = True
        rec["reject_reason"] = "분석 실패"
        return rec

    s_sharp = sharpness_subscore(rec)
    s_eye = eye_subscore(rec)
    s_expo = exposure_subscore(rec, tags)

    score = 100.0 * (config.W_SHARP * s_sharp
                     + config.W_EYE * s_eye
                     + config.W_EXPO * s_expo)

    rejected = False
    reasons = []

    # landmark 검증에 실패하고 신뢰도도 낮은 상자는 얼굴로 치지 않습니다.
    if rec.get("face_suspect"):
        tags.append(TAG_FACE_SUSPECT)

    if rec.get("faces", 0) == 0 or rec.get("face_suspect"):
        if rec.get("faces", 0) == 0:
            tags.append(TAG_NO_FACE)
        # 인물 컷이 목적이므로 점수 상한을 둡니다. 다만 '탈락'시키지는 않습니다
        # (풍경/소품 컷일 수도 있으므로 눈으로 확인할 기회를 남김)
        score = min(score, config.NOFACE_SCORE_CAP)
    else:
        fs = rec.get("face_sharp")
        contrast = rec.get("face_contrast")
        # 얼굴이 새까맣거나 새하얗게 날아가 대비가 거의 없으면 초점을 판단할 수 없습니다.
        # 이런 사진은 초점 탓으로 탈락시키지 않습니다 (진짜 원인은 노출입니다).
        focus_unjudgeable = contrast is not None and contrast < config.SHARP_MIN_CONTRAST
        if focus_unjudgeable:
            tags.append(TAG_FOCUS_UNKNOWN)
        elif fs is not None and fs < config.SHARP_REJECT:
            tags.append(TAG_BLUR)
            rejected = True
            reasons.append("얼굴 선명도 %.0f < %.0f" % (fs, config.SHARP_REJECT))

    if rec.get("eye_state") == "closed":
        tags.append(TAG_EYES_CLOSED)
        rejected = True
        reasons.append("눈 감음")
    elif (rec.get("eye_state") == "unknown" and rec.get("faces", 0) > 0
          and not rec.get("face_suspect")):
        tags.append(TAG_EYES_UNKNOWN)

    rec["subscore_sharp"] = round(s_sharp, 4)
    rec["subscore_eye"] = round(s_eye, 4)
    rec["subscore_expo"] = round(s_expo, 4)
    rec["score"] = round(score, 1)
    rec["tags"] = tags
    rec["rejected"] = rejected
    rec["reject_reason"] = ", ".join(reasons) if reasons else ""
    return rec


def score_all(records):
    """
    전체 점수 계산 → 그룹대표 선정 → 별점 부여.

    그룹대표는 '그룹에서 점수가 가장 높은 컷'입니다.
    다만 탈락(초점흐림/눈감음)한 컷보다 살아남은 컷을 우선합니다.
    (전부 탈락인 그룹이면 그중 점수가 가장 높은 컷을 대표로 표시해 눈으로 확인하게 함)
    """
    for r in records:
        score_one(r)

    by_group = {}
    for r in records:
        by_group.setdefault(r.get("group", 0), []).append(r)

    for _, items in by_group.items():
        for r in items:
            r["is_rep"] = False
        # 분석에 실패한 파일은 대표가 될 수 없습니다.
        usable = [r for r in items if r.get("ok")]
        if not usable:
            continue
        alive = [r for r in usable if not r.get("rejected")]
        pool = alive if alive else usable
        # 선명한 컷끼리는 점수가 100점으로 몰릴 수 있습니다(선명도 점수가 상한에 걸림).
        # 같은 장면 안에서는 '원본 얼굴 선명도' 수치가 그대로 비교 기준이 되므로
        # 동점일 때는 그 값으로, 그래도 같으면 눈 뜬 컷, 마지막으로 파일명 순으로 정합니다.
        best = max(pool, key=lambda r: (r.get("score", 0.0),
                                        r.get("face_sharp") or 0.0,
                                        1 if r.get("eye_state") == "open" else 0,
                                        -_name_rank(r)))
        best["is_rep"] = True
        if TAG_REP not in best["tags"]:
            best["tags"] = best["tags"] + [TAG_REP]

    for r in records:
        r["rating"] = decide_rating(r)
        r["verdict"] = decide_verdict(r)
    return records


def _name_rank(rec):
    """동점일 때 파일명이 앞선 컷을 우선하기 위한 보조 키."""
    return sum(ord(c) for c in rec.get("name", "")[:8])


def decide_rating(rec):
    """별점 규칙 (출력 A: XMP 사이드카에 기록되는 값)."""
    if rec.get("rejected"):
        return -1 if config.USE_RATING_MINUS_ONE_FOR_REJECT else config.RATING_REJECT
    if rec.get("is_rep"):
        # 별 3개는 '가장 먼저 볼 인물 컷'이라는 뜻입니다.
        # 얼굴이 없는 컷(풍경/소품/오검출)은 대표라도 별 1개까지만 줍니다.
        no_face = rec.get("faces", 0) == 0 or rec.get("face_suspect")
        if no_face and config.RATE_NOFACE_AS_KEEP:
            return config.RATING_KEEP
        return config.RATING_GROUP_BEST
    return config.RATING_KEEP


def decide_verdict(rec):
    """사람이 읽는 등급 문자열."""
    if not rec.get("ok"):
        return "분석실패"
    if rec.get("rejected"):
        return "탈락"
    if rec.get("is_rep"):
        return "그룹대표"
    return "보류"
