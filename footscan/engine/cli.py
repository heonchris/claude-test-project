"""
cli.py — 명령줄에서 발을 재는 도구 (Phase 0).

가장 기본 사용법:
    python cli.py --top samples/right_top.jpg --foot right

옆면까지 같이:
    python cli.py --top samples/right_top.jpg --side-img samples/right_side.jpg \
                  --foot right --debug --out results/

양발 한 번에:
    python cli.py --right-top samples/right_top.jpg --right-side samples/right_side.jpg \
                  --left-top samples/left_top.jpg  --left-side samples/left_side.jpg \
                  --debug --out results/
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import typer

sys.path.insert(0, str(Path(__file__).resolve().parent))

from footscan.errors import FootScanError  # noqa: E402
from footscan.pipeline import scan         # noqa: E402
from footscan.schemas import ScanResult    # noqa: E402

app = typer.Typer(add_completion=False, help="발 스캔 엔진 (Phase 0) — A4 기준 사진으로 발을 잽니다.")

_TOE_KR = {"egyptian": "이집트형(엄지가 가장 김)",
           "greek": "그리스형(검지가 가장 김)",
           "roman": "로마형(엄지≈검지)"}
_ARCH_KR = {"low": "낮은 편", "normal": "보통", "high": "높은 편"}
_SHOE_KR = {"dress": "구두/드레스", "sneakers": "스니커즈", "running": "러닝화",
            "hiking": "등산화", "sandals": "샌들"}


def _print_foot(f) -> None:
    side_kr = "오른발" if f.side == "right" else "왼발"
    print(f"\n■ {side_kr}   (신뢰도 {f.confidence:.2f})")
    t = f.top
    print("  [위에서 잰 값]")
    print(f"    발 길이       {t.foot_length_mm:6.1f} mm")
    print(f"    발볼 너비     {t.ball_width_mm:6.1f} mm")
    print(f"    뒤꿈치 너비   {t.heel_width_mm:6.1f} mm")
    print(f"    너비 비율     {t.width_ratio:6.3f}")
    print(f"    발가락 형태   {_TOE_KR.get(t.toe_type, t.toe_type)}  (봉우리 {t.toe_count_detected}개)")
    if t.hallux_valgus_angle_deg is not None:
        print(f"    무지외반 각   {t.hallux_valgus_angle_deg:6.1f} °  ※ 외형 기반 추정 (진단 아님)")

    if f.lateral:
        s = f.lateral
        print("  [옆에서 잰 값]")
        print(f"    아치 등급     {_ARCH_KR.get(s.arch_grade, s.arch_grade)}   ← 주 결과")
        print(f"    아치 들림     {s.arch_clearance_mm:6.1f} mm  (보조 참고값)")
        print(f"    비접지 구간   {s.arch_gap_length_mm:6.1f} mm  (발 길이의 {s.arch_gap_ratio*100:.0f}%)")
        print(f"    발등 높이     {s.instep_height_mm:6.1f} mm  (아치 지수 {s.arch_height_index:.3f})")
        print(f"    길이 교차검증 옆면 {s.foot_length_side_mm:.1f}mm / 차이 {s.cross_check_delta_mm:.1f}mm")
    else:
        print("  [옆에서 잰 값] 미측정 — 아치·발등은 옆면 사진을 찍어야 나옵니다.")

    for w in f.warnings:
        print(f"    ⚠ {w}")


def _print_result(res: ScanResult) -> None:
    print("=" * 68)
    print("발 스캔 결과")
    print("=" * 68)
    if res.right:
        _print_foot(res.right)
    if res.left:
        _print_foot(res.left)

    if res.asymmetry_mm is not None:
        print(f"\n■ 좌우 차이   {res.asymmetry_mm:.1f} mm")

    r = res.recommended_size
    if r:
        base_kr = "오른발" if r.based_on_foot == "right" else "왼발"
        print(f"\n■ 신발 사이즈 (참고용) — {base_kr} {r.based_on_length_mm:.1f}mm 기준")
        print(f"    {'종류':<12} {'KR/JP':>7} {'US(남)':>7} {'US(여)':>7} {'EU':>6} {'UK':>6}")
        for o in r.options:
            def fmt(v):
                return "-" if v is None else f"{v:g}"
            print(f"    {_SHOE_KR.get(o.shoe_type, o.shoe_type):<12} {o.kr_jp_mm:>7}"
                  f" {fmt(o.us_men):>7} {fmt(o.us_women):>7} {fmt(o.eu):>6} {fmt(o.uk):>6}")
        print(f"    폭 등급       {r.width_grade_label}")
        for n in r.notes:
            print(f"    · {n}")

    print("\n" + "-" * 68)
    print(res.disclaimer)
    print("-" * 68)


@app.command()
def main(
    top: Path = typer.Option(None, "--top", help="상면(위에서 찍은) 사진"),
    side_img: Path = typer.Option(None, "--side-img", help="측면(안쪽에서 찍은) 사진 — 선택"),
    foot: str = typer.Option("right", "--foot", help="어느 발인지: right 또는 left"),
    right_top: Path = typer.Option(None, "--right-top", help="양발 스캔용: 오른발 상면"),
    right_side: Path = typer.Option(None, "--right-side", help="양발 스캔용: 오른발 측면"),
    left_top: Path = typer.Option(None, "--left-top", help="양발 스캔용: 왼발 상면"),
    left_side: Path = typer.Option(None, "--left-side", help="양발 스캔용: 왼발 측면"),
    out: Path = typer.Option(Path("results"), "--out", help="디버그 이미지/결과 저장 폴더"),
    debug: bool = typer.Option(False, "--debug", help="단계별 디버그 이미지를 저장합니다"),
    json_out: bool = typer.Option(False, "--json", help="사람이 읽는 표 대신 JSON 으로 출력"),
) -> None:
    """A4 위에서 찍은 사진으로 발을 재고 신발 사이즈를 알려줍니다."""
    if top is None and right_top is None and left_top is None:
        typer.echo("상면 사진이 필요합니다. --top 또는 --right-top/--left-top 을 주세요.", err=True)
        raise typer.Exit(code=2)

    if foot not in ("left", "right"):
        typer.echo("--foot 은 left 또는 right 여야 합니다.", err=True)
        raise typer.Exit(code=2)

    # --top 한 장 모드를 양발 인자로 옮겨 담습니다
    if top is not None:
        if foot == "right":
            right_top, right_side = top, side_img
        else:
            left_top, left_side = top, side_img

    try:
        res = scan(
            right_top=right_top, right_side=right_side,
            left_top=left_top, left_side=left_side,
            out_dir=out, debug=debug,
        )
    except FootScanError as e:
        if json_out:
            print(json.dumps(e.to_dict(), ensure_ascii=False, indent=2))
        else:
            typer.echo(f"\n✗ [{e.code}] {e.message}", err=True)
            typer.echo(f"  단계 : {e.stage}", err=True)
            typer.echo(f"  방법 : {e.hint}", err=True)
        raise typer.Exit(code=1)

    if json_out:
        print(res.model_dump_json(indent=2))
    else:
        _print_result(res)

    if debug:
        out.mkdir(parents=True, exist_ok=True)
        (out / "result.json").write_text(res.model_dump_json(indent=2), encoding="utf-8")
        print(f"\n디버그 이미지와 결과: {out}/")


if __name__ == "__main__":
    app()
