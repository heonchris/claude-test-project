# -*- coding: utf-8 -*-
"""
단계 5: 연사 / 유사 컷 그룹핑
=============================
1차: EXIF 촬영시각이 BURST_GAP_SEC(기본 3초) 이내로 이어지면 같은 연사 후보
2차: perceptual hash 거리로 '정말 비슷한 그림인지' 확인

두 조건을 모두 만족할 때만 같은 그룹으로 묶습니다.
(3초 안에 찍혔어도 카메라를 홱 돌려 다른 장면을 찍었다면 다른 그룹)
"""

import datetime as _dt

from . import config, metrics


def parse_capture_time(rec):
    """
    EXIF 촬영시각 문자열을 초 단위 숫자로 바꿉니다.
    EXIF가 없으면 파일 수정시각으로 대체하고 time_source에 표시합니다.
    """
    s = rec.get("capture_time")
    if s:
        base = s.split(".")[0]
        frac = 0.0
        if "." in s:
            try:
                frac = float("0." + s.split(".")[1])
            except ValueError:
                frac = 0.0
        for fmt in ("%Y:%m:%d %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y:%m:%d %H:%M:%S%z"):
            try:
                dt = _dt.datetime.strptime(base, fmt)
                return dt.timestamp() + frac, "exif"
            except ValueError:
                continue
    mt = rec.get("mtime")
    if mt:
        return float(mt), "file"
    return None, "none"


def assign_groups(records):
    """
    records(측정 결과 리스트)에 group 번호와 시간 정보를 채워 넣습니다.
    분석에 실패한 파일은 각각 별도 그룹으로 둡니다.
    """
    for r in records:
        ts, src = parse_capture_time(r)
        r["capture_ts"] = ts
        r["time_source"] = src

    ok = [r for r in records if r.get("ok")]
    bad = [r for r in records if not r.get("ok")]

    # 시간 → 파일명 순으로 정렬 (시간이 없으면 파일명 순)
    ok.sort(key=lambda r: (r["capture_ts"] if r["capture_ts"] is not None else 0.0,
                           r["name"].lower()))

    group_id = 0
    prev = None
    for r in ok:
        if prev is None:
            group_id = 1
        else:
            same = False
            if (prev["capture_ts"] is not None and r["capture_ts"] is not None
                    and abs(r["capture_ts"] - prev["capture_ts"]) <= config.BURST_GAP_SEC):
                dist = metrics.phash_distance(prev.get("phash"), r.get("phash"))
                r["_phash_dist_prev"] = dist
                same = dist <= config.PHASH_MAX_DISTANCE
            if not same:
                group_id += 1
        r["group"] = group_id
        prev = r

    for r in bad:
        group_id += 1
        r["group"] = group_id

    return records


def group_summary(records):
    """그룹 번호 → 그 그룹에 속한 사진 리스트."""
    groups = {}
    for r in records:
        groups.setdefault(r.get("group", 0), []).append(r)
    for g in groups.values():
        g.sort(key=lambda r: (r.get("capture_ts") or 0.0, r["name"].lower()))
    return dict(sorted(groups.items()))
