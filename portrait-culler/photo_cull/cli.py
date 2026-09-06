# -*- coding: utf-8 -*-
"""
명령줄 인터페이스
=================
단계별로 하나씩 실행해 확인할 수 있게 만들었습니다.

  python cull.py check                 # 0. 설치 상태 점검
  python cull.py setup                 # 0. 얼굴 인식 모델 내려받기(최초 1회)
  python cull.py test-load  <폴더>     # 2. 사진 로딩 / RAW 미리보기 추출 확인
  python cull.py test-face  <폴더>     # 3. 얼굴 검출 + 얼굴 선명도 확인
  python cull.py test-eyes  <폴더>     # 4. 눈 감음 판정 확인
  python cull.py test-group <폴더>     # 5. 연사 그룹핑 확인
  python cull.py run        <폴더>     # 6~7. 전체 실행 (XMP + HTML + CSV)
"""

import argparse
import os
import sys
import time

import cv2

from . import (analyze, config, faces as faces_mod, grouping, imageload,
               out_csv, out_html, out_xmp, runner, scoring, util)

BAR = "─" * 68


def _print_header(title):
    print("\n" + BAR)
    print(title)
    print(BAR)


def _pick(folder, limit, recursive=True):
    paths = util.list_photos(folder, recursive=recursive)
    if not paths:
        print("사진을 찾지 못했습니다: %s" % folder)
        print("지원 확장자: %s" % ", ".join(sorted(config.RAW_EXTS | config.IMAGE_EXTS)))
        sys.exit(1)
    if limit and limit > 0:
        paths = paths[:limit]
    return paths


def _out_dir(folder, out=None):
    d = out or os.path.join(os.path.abspath(folder), config.OUTPUT_DIRNAME)
    return util.ensure_dir(d)


# ---------------------------------------------------------------- check
def cmd_check(args):
    _print_header("설치 상태 점검")
    print("파이썬 : %s" % sys.version.split()[0])
    print("실행파일: %s" % sys.executable)

    mods = ["numpy", "cv2", "PIL", "imagehash", "exifread", "rawpy", "mediapipe"]
    for m in mods:
        try:
            mod = __import__(m)
            ver = getattr(mod, "__version__", "설치됨")
            print("  [O] %-10s %s" % (m, ver))
        except Exception as e:
            print("  [X] %-10s 설치 안 됨 (%s)" % (m, type(e).__name__))

    print("\n모델 파일 폴더: %s" % faces_mod.MODEL_DIR)
    for p in (faces_mod.DETECTOR_MODEL, faces_mod.LANDMARKER_MODEL):
        mark = "O" if os.path.exists(p) else "X"
        size = ("%.1f MB" % (os.path.getsize(p) / 1024 / 1024)) if os.path.exists(p) else "없음"
        print("  [%s] %-32s %s" % (mark, os.path.basename(p), size))

    print("\n얼굴 검출 엔진 초기화 시도...")
    try:
        eng = faces_mod.FaceEngine()
        kind_kr = {"tasks": "MediaPipe Tasks (권장)",
                   "legacy": "MediaPipe 구버전 solutions",
                   "haar": "OpenCV Haar (얼굴만, 눈 판정 불가)"}
        print("  → 사용 엔진: %s" % kind_kr.get(eng.kind, eng.kind))
        print("  → 눈 landmark: %s / 깜빡임 점수: %s"
              % ("가능" if eng.has_landmarks else "불가",
                 "가능" if eng.has_blendshapes else "불가"))
        if eng.kind == "haar":
            print("  ! MediaPipe를 못 쓰는 상태입니다. 눈 감음 판정이 전부 '판정불가'가 됩니다.")
            print("    python cull.py setup 을 먼저 실행해 보세요.")
        eng.close()
    except Exception as e:
        print("  [X] 실패: %s" % e)
        return 1
    print("\n준비 완료입니다.")
    return 0


# ---------------------------------------------------------------- setup
def cmd_setup(args):
    _print_header("얼굴 인식 모델 내려받기 (최초 1회, 약 4MB)")
    print("저장 위치: %s" % faces_mod.MODEL_DIR)
    try:
        faces_mod.download_models()
    except Exception as e:
        print("\n다운로드에 실패했습니다: %s" % e)
        print("인터넷이 막혀 있다면 아래 두 파일을 직접 받아 위 폴더에 넣으세요:")
        for dest, url in faces_mod.MODEL_URLS.items():
            print("  %s\n    → %s" % (url, os.path.basename(dest)))
        return 1
    print("\n완료. 이제부터는 인터넷 없이 전부 로컬에서 동작합니다.")
    return 0


# ---------------------------------------------------------------- 단계 2
def cmd_test_load(args):
    _print_header("단계 2 · 사진 로딩 / RAW 미리보기 추출 테스트")
    paths = _pick(args.folder, args.limit)
    out = util.ensure_dir(os.path.join(_out_dir(args.folder, args.out), "test_load"))
    print("대상 %d장 · 결과 썸네일: %s\n" % (len(paths), out))
    print("%-28s %-22s %-11s %-19s %7s" % ("파일명", "읽은 방식", "분석크기", "촬영시각", "소요"))
    print("-" * 92)
    total = 0.0
    for p in paths:
        t0 = time.time()
        try:
            r = imageload.load_for_analysis(p)
            dt = time.time() - t0
            total += dt
            imageload.save_thumbnail(r["bgr_full"], os.path.join(out, util.thumb_name(p)))
            print("%-28s %-22s %-11s %-19s %6.2fs" % (
                os.path.basename(p)[:28],
                out_html.SOURCE_KR.get(r["source"], r["source"]),
                "%dx%d" % (r["width"], r["height"]),
                (r["capture_time"] or "-")[:19], dt))
        except Exception as e:
            print("%-28s [실패] %s" % (os.path.basename(p)[:28], e))
    if paths:
        print("\n평균 %.2f초/장 · 1000장이면 약 %s (1개 코어 기준, 실제 실행은 여러 코어로 더 빠름)"
              % (total / len(paths), util.human_time(total / len(paths) * 1000)))
    print("→ %s 폴더의 썸네일을 열어 세로 사진이 바로 서 있는지 확인하세요." % out)
    return 0


# ---------------------------------------------------------------- 단계 3
def cmd_test_face(args):
    _print_header("단계 3 · 얼굴 검출 + 얼굴 영역 선명도 테스트")
    paths = _pick(args.folder, args.limit)
    out = util.ensure_dir(os.path.join(_out_dir(args.folder, args.out), "test_face"))
    engine = analyze.get_engine()
    print("엔진: %s · 대상 %d장 · 확인용 이미지: %s\n" % (engine.kind, len(paths), out))
    print("%-28s %5s %8s %10s %10s %8s  %s" %
          ("파일명", "얼굴", "크기비율", "얼굴선명도", "전체선명도", "얼굴대비", "판정"))
    print("-" * 92)
    for p in paths:
        rec = analyze.analyze_file(p, want_debug=True)
        if not rec.get("ok"):
            print("%-28s [실패] %s" % (rec["name"][:28], rec["error"]))
            continue
        img = rec.pop("_debug_image")
        vis = img.copy()
        for i, f in enumerate(engine.detect(img)):
            x, y, w, h = f["box"]
            color = (0, 200, 0) if i == 0 else (0, 160, 255)
            cv2.rectangle(vis, (x, y), (x + w, y + h), color, 2)
            cv2.putText(vis, "%.2f" % f["score"], (x, max(14, y - 6)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA)
        if rec.get("face_sharp") is not None:
            cv2.putText(vis, "face sharp %.0f" % rec["face_sharp"], (10, 26),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 200, 0), 2, cv2.LINE_AA)
        cv2.imwrite(os.path.join(out, os.path.splitext(rec["name"])[0] + "_face.jpg"), vis)

        contrast = rec.get("face_contrast")
        if rec["faces"] == 0:
            verdict = "얼굴없음"
        elif contrast is not None and contrast < config.SHARP_MIN_CONTRAST:
            verdict = "초점판정불가(대비부족·노출문제)"
        elif rec.get("face_sharp") is not None and rec["face_sharp"] < config.SHARP_REJECT:
            verdict = "초점흐림(탈락)"
        else:
            verdict = "OK"
        print("%-28s %5d %8s %10s %10.0f %8s  %s" % (
            rec["name"][:28], rec["faces"],
            ("%.3f" % rec["face_ratio"]) if rec.get("face_ratio") else "-",
            ("%.0f" % rec["face_sharp"]) if rec.get("face_sharp") is not None else "-",
            rec.get("frame_sharp", 0),
            ("%.1f" % contrast) if contrast is not None else "-", verdict))
    print("\n→ %s 의 이미지를 열어 초록 상자가 실제 얼굴에 맞는지 확인하세요." % out)
    print("→ 멀쩡한 사진이 '초점흐림'으로 나오면 config.py의 SHARP_REJECT(현재 %s)를 낮추세요."
          % config.SHARP_REJECT)
    return 0


# ---------------------------------------------------------------- 단계 4
def cmd_test_eyes(args):
    _print_header("단계 4 · 눈 감음 판정 테스트")
    paths = _pick(args.folder, args.limit)
    out = util.ensure_dir(os.path.join(_out_dir(args.folder, args.out), "test_eyes"))
    engine = analyze.get_engine()
    if not engine.has_landmarks:
        print("! 현재 엔진(%s)은 눈 landmark를 지원하지 않습니다. python cull.py setup 을 실행하세요."
              % engine.kind)
        return 1
    print("판정 방식: %s · EAR 임계값 %.2f · 깜빡임 임계값 %.2f · 최소 얼굴비율 %.2f\n"
          % (config.EYE_DECISION_MODE, config.EAR_CLOSED, config.BLINK_CLOSED,
             config.EYE_MIN_FACE_RATIO))
    print("%-28s %8s %8s %9s %9s  %s" % ("파일명", "EAR좌", "EAR우", "깜빡임좌", "깜빡임우", "판정"))
    print("-" * 92)
    for p in paths:
        rec = analyze.analyze_file(p, want_debug=True)
        if not rec.get("ok"):
            print("%-28s [실패] %s" % (rec["name"][:28], rec["error"]))
            continue
        pts = rec.pop("_debug_points", None)
        img = rec.pop("_debug_image", None)
        if pts and img is not None and rec.get("face_box"):
            crop = faces_mod._crop_square(img, rec["face_box"], 0.6)
            if crop is not None:
                ch, cw = rec.get("_debug_crop_shape", crop.shape[:2])
                vis = cv2.resize(crop, (cw, ch), interpolation=cv2.INTER_CUBIC)
                for idx_set, color in ((faces_mod.RIGHT_EYE_IDX, (0, 220, 0)),
                                       (faces_mod.LEFT_EYE_IDX, (0, 160, 255))):
                    for i in idx_set:
                        x, y = pts[i]
                        cv2.circle(vis, (int(x), int(y)), 2, color, -1)
                cv2.imwrite(os.path.join(out, os.path.splitext(rec["name"])[0] + "_eyes.jpg"), vis)
        state_kr = out_html.EYE_KR.get(rec["eye_state"], "?")
        extra = rec.get("eye_skip_reason", "")
        print("%-28s %8s %8s %9s %9s  %s %s" % (
            rec["name"][:28],
            _f(rec.get("ear_left")), _f(rec.get("ear_right")),
            _f(rec.get("blink_left")), _f(rec.get("blink_right")),
            state_kr, ("(" + extra + ")") if extra else ""))
    print("\n→ %s 의 이미지에서 점이 눈 위에 정확히 찍혔는지 확인하세요." % out)
    print("→ 눈 뜬 사진이 '감음'으로 나오면 EAR_CLOSED를 낮추고, 감은 사진이 안 걸리면 높이세요.")
    return 0


def _f(v, fmt="%.3f"):
    return "-" if v is None else fmt % v


# ---------------------------------------------------------------- 단계 5
def cmd_test_group(args):
    _print_header("단계 5 · 연사 / 유사 컷 그룹핑 테스트")
    paths = _pick(args.folder, args.limit)
    out_dir = _out_dir(args.folder, args.out)
    records, stats = runner.analyze_all(paths, out_dir, jobs=args.jobs,
                                        use_cache=not args.no_cache, label="분석")
    grouping.assign_groups(records)
    scoring.score_all(records)
    groups = grouping.group_summary(records)
    print("\n총 %d장 → %d개 그룹 (간격 %.1f초 이내 + 유사도 %d 이하)"
          % (len(records), len(groups), config.BURST_GAP_SEC, config.PHASH_MAX_DISTANCE))
    print("시각 출처: EXIF %d장 / 파일시각 %d장\n"
          % (sum(1 for r in records if r.get("time_source") == "exif"),
             sum(1 for r in records if r.get("time_source") == "file")))
    for gid, items in groups.items():
        print("그룹 %-3d (%d장)" % (gid, len(items)))
        for r in items:
            mark = "★" if r.get("is_rep") else " "
            t = ""
            if r.get("capture_ts"):
                import datetime as dt
                t = dt.datetime.fromtimestamp(r["capture_ts"]).strftime("%H:%M:%S.%f")[:-3]
            print("   %s %-30s 점수%6.1f  %s  %s" % (
                mark, r["name"][:30], r.get("score", 0), t, " ".join(r.get("tags", []))))
    print("\n→ 다른 장면이 한 그룹에 섞였으면 PHASH_MAX_DISTANCE를 낮추세요(현재 %d)."
          % config.PHASH_MAX_DISTANCE)
    print("→ 같은 연사가 여러 그룹으로 쪼개졌으면 BURST_GAP_SEC이나 PHASH_MAX_DISTANCE를 높이세요.")
    return 0


# ---------------------------------------------------------------- 전체 실행
def cmd_run(args):
    _print_header("인물 사진 1차 셀렉 · 전체 실행")
    folder = os.path.abspath(args.folder)
    paths = _pick(folder, args.limit, recursive=not args.no_recursive)
    out_dir = _out_dir(folder, args.out)
    print("대상 폴더 : %s" % folder)
    print("사진 수   : %d장" % len(paths))
    print("결과 폴더 : %s" % out_dir)
    print("원본 파일은 이동/삭제/수정하지 않습니다. (XMP 사이드카만 새로 만듭니다)\n")

    records, stats = runner.analyze_all(paths, out_dir, jobs=args.jobs,
                                        use_cache=not args.no_cache, label="분석")
    print("  코어 %d개 사용 · 캐시 재사용 %d장 · 새로 분석 %d장 · 실패 %d장"
          % (stats["jobs"], stats["cached"], stats["analyzed"], stats["failed"]))

    grouping.assign_groups(records)
    scoring.score_all(records)
    groups = grouping.group_summary(records)

    # ---- 출력 A: XMP ----
    if not args.no_xmp:
        xs = out_xmp.write_sidecars(records, overwrite=args.overwrite_xmp, dry_run=args.dry_run)
        print("\n[출력 A] XMP 사이드카: 생성 %d개 / 건너뜀 %d개 / 실패 %d개"
              % (xs["written"], xs["skipped"], xs["failed"]))
        if xs["skipped"]:
            print("        (이미 .xmp가 있는 파일은 건드리지 않았습니다. 덮어쓰려면 --overwrite-xmp)")
    else:
        print("\n[출력 A] XMP 사이드카: 건너뜀(--no-xmp)")

    # ---- 출력 B: HTML ----
    html_path = os.path.join(out_dir, "report.html")
    out_html.write_html(records, html_path, folder)
    print("[출력 B] HTML 리포트: %s" % html_path)

    # ---- 출력 C: CSV ----
    csv_path = os.path.join(out_dir, "result.csv")
    out_csv.write_csv(records, csv_path)
    print("[출력 C] CSV: %s" % csv_path)

    if args.links:
        n = out_xmp.make_rating_links(records, out_dir)
        print("[선택]   별점별 바로가기 폴더: %s (%d개)" % (os.path.join(out_dir, "links"), n))

    # ---- 요약 ----
    n_rep = sum(1 for r in records if r.get("is_rep"))
    n_rej = sum(1 for r in records if r.get("rejected") and r.get("ok"))
    n_keep = sum(1 for r in records if r.get("ok") and not r.get("rejected"))
    n_blur = sum(1 for r in records if scoring.TAG_BLUR in r.get("tags", []))
    n_eye = sum(1 for r in records if scoring.TAG_EYES_CLOSED in r.get("tags", []))
    n_unk = sum(1 for r in records if scoring.TAG_EYES_UNKNOWN in r.get("tags", []))
    n_noface = sum(1 for r in records if r.get("ok") and r.get("faces", 0) == 0)
    n_expo = sum(1 for r in records
                 if any(t.startswith("노출주의") for t in r.get("tags", [])))

    _print_header("결과 요약")
    print("전체 %d장 → 그룹 %d개" % (len(records), len(groups)))
    print("  살아남은 컷 : %4d장  (그중 그룹대표 %d장 = 먼저 볼 컷)" % (n_keep, n_rep))
    print("  탈락        : %4d장  (초점흐림 %d, 눈감음 %d)" % (n_rej, n_blur, n_eye))
    print("  얼굴없음    : %4d장" % n_noface)
    print("  눈판정불가  : %4d장  (얼굴이 작아 판정을 건너뜀)" % n_unk)
    print("  노출주의    : %4d장  (탈락 아님, 확인만 하세요)" % n_expo)
    if stats["failed"]:
        print("  분석실패    : %4d장  (errors.log 참고)" % stats["failed"])

    if stats.get("rate"):
        print("\n실측 속도 %.2f장/초 (코어 %d개) → 1000장이면 약 %s"
              % (stats["rate"], stats["jobs"],
                 util.human_time(runner.estimate_for(1000, stats["rate"]))))
    elif stats["cached"]:
        print("\n이번 실행은 캐시를 재사용했습니다(새로 분석한 사진 %d장)." % stats["analyzed"])

    print("\n다음 순서")
    print("  1) 리포트 열기:  open \"%s\"" % html_path)
    print("  2) 라이트룸에서  [메타데이터] → [파일에서 메타데이터 읽기]")
    print("  3) 별 1개 이상만 필터링해서 본격 셀렉")
    print("  4) 판정이 취향과 다르면 result.csv의 수치를 보고 config.py를 조정한 뒤 다시 실행")
    print("     (측정값은 캐시되므로 임계값만 바꾼 재실행은 몇 초면 끝납니다)")
    return 0


# ---------------------------------------------------------------- 파서
def build_parser():
    p = argparse.ArgumentParser(
        prog="cull.py",
        description="인물 사진 1차 셀렉 도구 (전부 로컬 실행, 원본 무수정)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)

    def common(sp, default_limit=None):
        sp.add_argument("folder", help="사진이 들어있는 폴더 경로")
        sp.add_argument("--limit", type=int, default=default_limit,
                        help="앞에서 N장만 처리 (테스트용)")
        sp.add_argument("--out", default=None, help="결과 폴더 지정 (기본: 사진폴더/_cull)")
        sp.add_argument("--jobs", type=int, default=config.DEFAULT_JOBS,
                        help="동시에 쓸 CPU 코어 수 (0=자동)")
        sp.add_argument("--no-cache", action="store_true", help="캐시 무시하고 다시 분석")

    sub.add_parser("check", help="설치 상태 점검").set_defaults(func=cmd_check)
    sub.add_parser("setup", help="얼굴 인식 모델 내려받기").set_defaults(func=cmd_setup)

    sp = sub.add_parser("test-load", help="단계2: 사진 로딩 확인")
    common(sp, 10)
    sp.set_defaults(func=cmd_test_load)

    sp = sub.add_parser("test-face", help="단계3: 얼굴 검출/선명도 확인")
    common(sp, 10)
    sp.set_defaults(func=cmd_test_face)

    sp = sub.add_parser("test-eyes", help="단계4: 눈 감음 판정 확인")
    common(sp, 10)
    sp.set_defaults(func=cmd_test_eyes)

    sp = sub.add_parser("test-group", help="단계5: 연사 그룹핑 확인")
    common(sp, 50)
    sp.set_defaults(func=cmd_test_group)

    sp = sub.add_parser("run", help="전체 실행 (XMP + HTML + CSV)")
    common(sp, None)
    sp.add_argument("--no-recursive", action="store_true", help="하위 폴더는 보지 않음")
    sp.add_argument("--no-xmp", action="store_true", help="XMP 사이드카를 만들지 않음")
    sp.add_argument("--overwrite-xmp", action="store_true", help="기존 .xmp를 덮어씀")
    sp.add_argument("--dry-run", action="store_true", help="파일을 쓰지 않고 결과만 확인(XMP)")
    sp.add_argument("--links", action="store_true", help="별점별 바로가기 폴더도 생성")
    sp.set_defaults(func=cmd_run)
    return p


def main(argv=None):
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except KeyboardInterrupt:
        print("\n중단했습니다.")
        return 130
    finally:
        # 파이썬이 완전히 종료되기 전에 MediaPipe 엔진을 먼저 정리합니다.
        # (종료 순서가 꼬여 생기는 경고 메시지를 막기 위함)
        analyze._close_engine()
