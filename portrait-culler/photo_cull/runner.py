# -*- coding: utf-8 -*-
"""
분석 실행기
===========
- 여러 CPU 코어로 나눠 처리 (기본: 코어 수 - 1, 최대 6)
- 이미 분석한 파일은 캐시에서 꺼내 건너뜀
- 한 장이 실패해도 멈추지 않고 계속 진행 (실패 목록은 errors.log에 기록)
- 진행률 / 남은 시간 표시
"""

import multiprocessing as mp
import os
import time

from . import analyze, cache as cache_mod, util


def decide_jobs(requested):
    if requested and requested > 0:
        return int(requested)
    try:
        n = os.cpu_count() or 2
    except Exception:
        n = 2
    return max(1, min(6, n - 1))


def analyze_all(paths, out_dir, jobs=0, use_cache=True, label="분석"):
    """
    사진 목록을 분석해 측정값 리스트를 돌려줍니다.
    반환: (records, stats)
    """
    thumb_dir = util.ensure_dir(os.path.join(out_dir, "thumbs"))
    cache = cache_mod.Cache(os.path.join(out_dir, "cache.json")) if use_cache else None

    todo = []
    records = []
    for p in paths:
        rec = cache.get(p) if cache else None
        if rec is not None:
            # 썸네일 파일이 지워졌으면 다시 분석해야 합니다.
            t = rec.get("thumb")
            if t and not os.path.exists(os.path.join(thumb_dir, t)):
                rec = None
        if rec is not None:
            rec["from_cache"] = True
            records.append(rec)
        else:
            todo.append(p)

    n_jobs = decide_jobs(jobs)
    prog = util.Progress(len(paths), label=label)
    prog.update(len(records), force=True)

    stats = {"cached": len(records), "analyzed": 0, "failed": 0, "jobs": n_jobs}
    errors = []

    t_analyze = time.time()
    if todo:
        if n_jobs == 1:
            for p in todo:
                rec = analyze.analyze_file(p, thumb_dir=thumb_dir)
                _collect(rec, records, cache, stats, errors)
                prog.update(1)
        else:
            # macOS 기본값과 동일한 'spawn' 방식을 명시합니다.
            # (MediaPipe는 fork 방식에서 멈추는 경우가 있습니다)
            ctx = mp.get_context("spawn")
            args = [(p, thumb_dir) for p in todo]
            with ctx.Pool(processes=n_jobs) as pool:
                for rec in pool.imap_unordered(analyze._worker, args, chunksize=4):
                    _collect(rec, records, cache, stats, errors)
                    prog.update(1)

    analyze_elapsed = time.time() - t_analyze
    elapsed, _ = prog.close()
    if cache:
        cache.save()

    if errors:
        log_path = os.path.join(out_dir, "errors.log")
        with open(log_path, "a", encoding="utf-8") as f:
            for line in errors:
                f.write(line + "\n")
        print("  ! 실패 %d장 → %s 에 기록했습니다." % (len(errors), log_path))

    stats["elapsed"] = elapsed
    # 처리 속도는 '이번에 새로 분석한 사진'만으로 계산합니다.
    # 캐시에서 꺼낸 사진까지 포함하면 말도 안 되는 속도가 나옵니다.
    stats["rate"] = (stats["analyzed"] / analyze_elapsed
                     if stats["analyzed"] > 0 and analyze_elapsed > 0.05 else None)
    return records, stats


def _collect(rec, records, cache, stats, errors):
    if rec.get("ok"):
        stats["analyzed"] += 1
    else:
        stats["failed"] += 1
        errors.append("%s\t%s" % (rec.get("path"), rec.get("error")))
    clean = analyze.strip_debug(rec)
    if cache:
        try:
            cache.put(rec["path"], clean)
        except Exception:
            pass
    records.append(clean)


def estimate_for(n_photos, rate):
    """측정된 속도로 n장 처리 시간을 예상합니다."""
    if not rate:
        return None
    return n_photos / rate
