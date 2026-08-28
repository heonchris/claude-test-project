"""
test_measure.py — 회귀 테스트. [SPEC 3-8 Phase 0 완료 조건]

합성 이미지(정답을 아는 사진)로 파이프라인 전체를 검사합니다.
config.py 의 숫자를 바꾼 뒤에는 반드시 이 파일을 돌려서
정확도가 깨지지 않았는지 확인하세요.

실행:
    python tests/test_measure.py          # 그냥 실행 (pytest 없어도 됨)
    pytest tests/test_measure.py -v       # pytest 가 있으면 이렇게도 됨

검사 항목 (SPEC 3-8):
  1) A4 검출 성공률 20세트 중 18세트 이상
  2) 발 길이 정답 대비 ±3mm 이내
  3) 재현성 — 같은 발 5회 촬영 시 길이 표준편차 2mm 이내
  4) 아치 등급 — 같은 발 5회 촬영 시 등급이 바뀌지 않음
  5) 교차검증(cross_check_delta) 동작
  6) 에러 코드 4종이 제대로 나오는지
  7) 디버그 이미지 8장 저장
"""

from __future__ import annotations

import json
import shutil
import statistics
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np

ENGINE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ENGINE_DIR))
sys.path.insert(0, str(ENGINE_DIR / "tests"))

import make_synthetic as ms                     # noqa: E402
from footscan import config as C                # noqa: E402
from footscan.errors import FootScanError       # noqa: E402
from footscan.imageio import load_bgr           # noqa: E402
from footscan.pipeline import scan_foot         # noqa: E402
from footscan.side.reference import detect_reference  # noqa: E402
from footscan.top.paper import detect_paper     # noqa: E402

SAMPLES = ENGINE_DIR / "samples"

# 허용 오차 (SPEC 3-8)
TOL_LENGTH_MM = 3.0
TOL_WIDTH_MM = 3.0
TOL_ARCH_MM = 4.0
TOL_INSTEP_MM = 4.0
MAX_LENGTH_STDEV_MM = 2.0
MIN_PAPER_DETECT_RATE = 18 / 20


def _ensure_samples() -> None:
    if not (SAMPLES / "right_gt.json").exists():
        ms.main()


def _gt(name: str) -> dict:
    return json.loads((SAMPLES / f"{name}_gt.json").read_text(encoding="utf-8"))


# ==========================================================================

def test_top_measurement_accuracy() -> None:
    """상면 치수가 정답과 ±3mm 이내인지."""
    _ensure_samples()
    for gt_file in sorted(SAMPLES.glob("*_gt.json")):
        name = gt_file.stem.replace("_gt", "")
        gt = _gt(name)
        res = scan_foot(SAMPLES / gt["top_image"], None, gt["foot"])
        t, g = res.top, gt["top"]

        assert abs(t.foot_length_mm - g["foot_length_mm"]) <= TOL_LENGTH_MM, \
            f"{name}: 발 길이 {t.foot_length_mm} vs 정답 {g['foot_length_mm']}"
        assert abs(t.ball_width_mm - g["ball_width_mm"]) <= TOL_WIDTH_MM, \
            f"{name}: 발볼 너비 {t.ball_width_mm} vs 정답 {g['ball_width_mm']}"
        assert abs(t.heel_width_mm - g["heel_width_mm"]) <= TOL_WIDTH_MM, \
            f"{name}: 뒤꿈치 너비 {t.heel_width_mm} vs 정답 {g['heel_width_mm']}"
        assert t.toe_type == g["toe_type"], \
            f"{name}: 발가락 형태 {t.toe_type} vs 정답 {g['toe_type']}"


def test_side_measurement_accuracy() -> None:
    """측면(아치/발등) 값이 정답과 가까운지, 그리고 등급이 맞는지."""
    _ensure_samples()
    expected_grade = {"arch_low": "low", "arch_high": "high", "right": "normal", "left": "normal"}
    for gt_file in sorted(SAMPLES.glob("*_gt.json")):
        name = gt_file.stem.replace("_gt", "")
        gt = _gt(name)
        res = scan_foot(SAMPLES / gt["top_image"], SAMPLES / gt["side_image"], gt["foot"])
        s, g = res.lateral, gt["side"]
        assert s is not None, f"{name}: 측면 결과가 없습니다"

        assert abs(s.foot_length_side_mm - g["foot_length_side_mm"]) <= TOL_LENGTH_MM, \
            f"{name}: 측면 길이 {s.foot_length_side_mm} vs {g['foot_length_side_mm']}"
        assert abs(s.arch_clearance_mm - g["arch_clearance_mm"]) <= TOL_ARCH_MM, \
            f"{name}: 아치 높이 {s.arch_clearance_mm} vs {g['arch_clearance_mm']}"
        assert abs(s.instep_height_mm - g["instep_height_mm"]) <= TOL_INSTEP_MM, \
            f"{name}: 발등 높이 {s.instep_height_mm} vs {g['instep_height_mm']}"

        if name in expected_grade:
            assert s.arch_grade == expected_grade[name], \
                f"{name}: 아치 등급 {s.arch_grade} (기대 {expected_grade[name]})"


def test_exif_rotation_is_corrected() -> None:
    """아이폰식 EXIF 회전 사진도 똑바로 세운 사진과 같은 값이 나와야 합니다."""
    _ensure_samples()
    a = scan_foot(SAMPLES / "right_top.jpg", SAMPLES / "right_side.jpg", "right")
    b = scan_foot(SAMPLES / "exif_rotated_top.jpg", SAMPLES / "exif_rotated_side.jpg", "right")
    assert abs(a.top.foot_length_mm - b.top.foot_length_mm) <= 1.0, \
        f"EXIF 회전 보정 실패: {a.top.foot_length_mm} vs {b.top.foot_length_mm}"


def test_paper_detection_rate() -> None:
    """20세트 중 18세트 이상에서 A4 를 찾아야 합니다. (SPEC 3-8)"""
    tmp = Path(tempfile.mkdtemp(prefix="fs_paper_"))
    try:
        rng = np.random.default_rng(1234)
        ok = 0
        n = 20
        for i in range(n):
            img, _ = ms.render_top(
                length_mm=float(rng.uniform(225, 275)),
                ball_width_mm=float(rng.uniform(88, 106)),
                heel_width_mm=float(rng.uniform(56, 68)),
                toe_type=str(rng.choice(["egyptian", "greek", "roman"])),
                hallux_valgus_deg=float(rng.uniform(0, 18)),
                foot_side=str(rng.choice(["left", "right"])),
                rotate_deg=float(rng.uniform(-9, 9)),
                out_w=1600, out_h=1200,
                perspective=float(rng.uniform(0.0, 1.4)),
                seed=int(rng.integers(0, 10000)),
            )
            p = tmp / f"t{i}.jpg"
            cv2.imwrite(str(p), img)
            try:
                detect_paper(load_bgr(p))
                ok += 1
            except FootScanError:
                pass
        rate = ok / n
        assert rate >= MIN_PAPER_DETECT_RATE, f"A4 검출 성공률 {ok}/{n}"
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def test_repeatability() -> None:
    """
    같은 발을 조건을 조금씩 바꿔 5번 찍었을 때
      · 발 길이 표준편차 2mm 이내
      · 아치 등급이 바뀌지 않음   ← mm 정확도보다 이게 더 중요 (SPEC 3-8)
    """
    tmp = Path(tempfile.mkdtemp(prefix="fs_repeat_"))
    try:
        lengths, grades = [], []
        variations = [
            dict(rotate_deg=-7.0, perspective=0.2, roll_deg=-4.0, cam=750.0, seed=11),
            dict(rotate_deg=0.0, perspective=0.7, roll_deg=0.0, cam=800.0, seed=23),
            dict(rotate_deg=4.0, perspective=1.0, roll_deg=2.5, cam=850.0, seed=37),
            dict(rotate_deg=8.0, perspective=1.3, roll_deg=5.0, cam=900.0, seed=41),
            dict(rotate_deg=-3.0, perspective=0.5, roll_deg=-2.0, cam=700.0, seed=53),
        ]
        for i, v in enumerate(variations):
            top, _ = ms.render_top(250.0, 98.0, 62.0, "egyptian", 8.0, "right",
                                   v["rotate_deg"], 1600, 1200, v["perspective"], v["seed"])
            side, _ = ms.render_side(250.0, 14.0, 85.0, 1600, 1200, 125.0, v["cam"],
                                     1.5, v["roll_deg"], v["seed"] + 1)
            tp, sp = tmp / f"t{i}.jpg", tmp / f"s{i}.jpg"
            cv2.imwrite(str(tp), top)
            cv2.imwrite(str(sp), side)
            r = scan_foot(tp, sp, "right")
            lengths.append(r.top.foot_length_mm)
            grades.append(r.lateral.arch_grade)

        sd = statistics.pstdev(lengths)
        assert sd <= MAX_LENGTH_STDEV_MM, f"길이 표준편차 {sd:.2f}mm ({lengths})"
        assert len(set(grades)) == 1, f"아치 등급이 흔들립니다: {grades}"
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def test_crosscheck_detects_mismatch() -> None:
    """
    엉뚱한 옆면 사진을 넣으면 교차검증이 잡아내고 신뢰도가 떨어져야 합니다.
    (짧은 발의 상면 + 훨씬 긴 발의 측면)
    """
    _ensure_samples()
    res = scan_foot(SAMPLES / "wide_top.jpg", SAMPLES / "narrow_side.jpg", "right")
    assert res.lateral.cross_check_delta_mm > C.CROSSCHECK_WARN_MM, \
        f"차이가 {res.lateral.cross_check_delta_mm}mm 인데 잡아내지 못했습니다"
    assert res.confidence <= C.CROSSCHECK_CONF_BAD, f"신뢰도 {res.confidence}"
    assert any("LOW_CONFIDENCE" in w for w in res.warnings), res.warnings


def test_error_codes() -> None:
    """실패했을 때 어느 단계에서 왜 실패했는지 코드로 알려줘야 합니다. (SPEC 3-8)"""
    tmp = Path(tempfile.mkdtemp(prefix="fs_err_"))
    try:
        # 1) 종이가 없는 사진 → PAPER_NOT_FOUND
        blank = np.full((1200, 1600, 3), 90, np.uint8)
        p_blank = tmp / "blank.jpg"
        cv2.imwrite(str(p_blank), blank)
        try:
            scan_foot(p_blank, None, "right")
            raise AssertionError("PAPER_NOT_FOUND 가 나와야 합니다")
        except FootScanError as e:
            assert e.code == "PAPER_NOT_FOUND", e.code

        # 2) 종이만 있고 발이 없는 사진 → FOOT_NOT_FOUND
        empty, _ = ms.render_top(250.0, 98.0, 62.0, "egyptian", 8.0, "right",
                                 5.0, 1600, 1200, 1.0, 7, with_foot=False)
        p_empty = tmp / "empty.jpg"
        cv2.imwrite(str(p_empty), empty)
        try:
            scan_foot(p_empty, None, "right")
            raise AssertionError("FOOT_NOT_FOUND 가 나와야 합니다")
        except FootScanError as e:
            assert e.code == "FOOT_NOT_FOUND", e.code

        # 3) 바닥 기준선이 없는 측면 사진 → SIDE_REF_NOT_FOUND
        try:
            detect_reference(blank)
            raise AssertionError("SIDE_REF_NOT_FOUND 가 나와야 합니다")
        except FootScanError as e:
            assert e.code == "SIDE_REF_NOT_FOUND", e.code

        # 4) LOW_CONFIDENCE 는 경고로 붙습니다 (에러로 중단하지 않음)
        _ensure_samples()
        res = scan_foot(SAMPLES / "wide_top.jpg", SAMPLES / "narrow_side.jpg", "right")
        assert any("LOW_CONFIDENCE" in w for w in res.warnings)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def test_debug_images_saved() -> None:
    """디버그 이미지 8장이 모두 저장되어야 합니다. (SPEC 3-7)"""
    _ensure_samples()
    tmp = Path(tempfile.mkdtemp(prefix="fs_dbg_"))
    try:
        scan_foot(SAMPLES / "right_top.jpg", SAMPLES / "right_side.jpg", "right",
                  out_dir=tmp, debug=True)
        for key, name in C.DEBUG_NAMES.items():
            assert (tmp / f"right_{name}").exists(), f"{name} 이 없습니다"
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def test_size_recommendation() -> None:
    """사이즈 환산이 SPEC 4-2 예시대로 나오는지 (253mm + 10mm = 265)."""
    from footscan.sizing import to_kr_jp_mm, width_grade
    assert to_kr_jp_mm(253.0, 10.0) == 265
    assert width_grade(0.36) == "narrow"
    assert width_grade(0.385) == "regular"
    assert width_grade(0.405) == "wide"
    assert width_grade(0.43) == "extra_wide"


# ==========================================================================

def main() -> int:
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for fn in tests:
        name = fn.__name__
        try:
            fn()
            print(f"  PASS  {name}")
        except AssertionError as e:
            failed += 1
            print(f"  FAIL  {name}\n        {e}")
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"  ERROR {name}\n        {type(e).__name__}: {e}")
    total = len(tests)
    print(f"\n{total - failed}/{total} 통과")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
