# -*- coding: utf-8 -*-
"""
출력 C: CSV
===========
임계값 튜닝용 표입니다. 엑셀/넘버스에서 열어 '이건 잘못 걸렀다' 싶은 사진의
수치를 확인하고 config.py의 값을 조정하세요.
utf-8-sig로 저장하므로 엑셀에서 한글이 깨지지 않습니다.
"""

import csv
import datetime as _dt

COLUMNS = [
    ("name", "파일명"),
    ("group", "그룹"),
    ("is_rep", "그룹대표"),
    ("verdict", "등급"),
    ("rating", "별점"),
    ("score", "점수"),
    ("faces", "얼굴수"),
    ("face_ratio", "얼굴크기비율"),
    ("face_score", "얼굴신뢰도"),
    ("face_verified", "얼굴검증"),
    ("face_sharp", "얼굴선명도"),
    ("frame_sharp", "전체선명도"),
    ("face_contrast", "얼굴대비"),
    ("eye_state", "눈상태"),
    ("ear_left", "EAR좌"),
    ("ear_right", "EAR우"),
    ("blink_left", "깜빡임좌"),
    ("blink_right", "깜빡임우"),
    ("eye_skip_reason", "눈판정건너뜀사유"),
    ("clip_high", "하이라이트클리핑"),
    ("clip_low", "암부클리핑"),
    ("face_luma", "얼굴밝기"),
    ("frame_luma", "전체밝기"),
    ("subscore_sharp", "세부_선명도"),
    ("subscore_eye", "세부_눈"),
    ("subscore_expo", "세부_노출"),
    ("capture_time_str", "촬영시각"),
    ("time_source", "시각출처"),
    ("phash", "그림지문"),
    ("source", "이미지출처"),
    ("camera", "카메라"),
    ("tags_str", "태그"),
    ("reject_reason", "탈락사유"),
    ("elapsed", "분석초"),
    ("error", "오류"),
    ("path", "전체경로"),
]


EYE_KR = {"open": "뜸", "closed": "감음", "unknown": "판정불가"}
SOURCE_KR = {"raw_preview": "RAW미리보기", "raw_halfsize": "RAW축소디코딩", "image": "일반이미지"}
VERIFIED_KR = {True: "검증됨", False: "landmark실패", None: "해당없음"}


def _prepare(rec):
    row = dict(rec)
    row["eye_state"] = EYE_KR.get(rec.get("eye_state"), rec.get("eye_state"))
    row["source"] = SOURCE_KR.get(rec.get("source"), rec.get("source"))
    row["face_verified"] = VERIFIED_KR.get(rec.get("face_verified"), "")
    ts = rec.get("capture_ts")
    if ts:
        row["capture_time_str"] = _dt.datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    else:
        row["capture_time_str"] = ""
    row["tags_str"] = " ".join(rec.get("tags", []))
    row["is_rep"] = "O" if rec.get("is_rep") else ""
    return row


def write_csv(records, out_path):
    rows = [_prepare(r) for r in records]
    rows.sort(key=lambda r: (r.get("group", 0), -(r.get("score") or 0)))
    with open(out_path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow([label for _, label in COLUMNS])
        for r in rows:
            w.writerow([_fmt(r.get(key)) for key, _ in COLUMNS])
    return out_path


def _fmt(v):
    if v is None:
        return ""
    if isinstance(v, bool):
        return "O" if v else ""
    if isinstance(v, float):
        return ("%.4f" % v).rstrip("0").rstrip(".")
    return v
