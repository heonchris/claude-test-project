"""대표님께 전달할 압축 패키지를 만듭니다.

만들어지는 것: 발스캔_전달패키지.zip
  0_먼저_읽어주세요.html      ← 폴더 사용법 한 장 안내
  1_앱/발스캔_앱.html          ← 더블클릭하면 바로 실행되는 완성 앱
  1_앱/원본코드/               ← 앱을 고칠 때 쓰는 조각 파일들
  2_보고서/개발보고서.html     ← 개발 현황 보고서
  3_원본엔진_파이썬/           ← 정확도 기준이 되는 원본 엔진

사용법:
    python3 footscan/make_package.py [보고서.html 경로]

보고서 경로를 주지 않으면 보고서 없이 만듭니다.
"""
import pathlib
import shutil
import sys
import zipfile

HERE = pathlib.Path(__file__).parent
OUT_DIR = HERE.parent / "dist"
PKG = "발스캔_전달패키지"

SKIP_DIRS = {"__pycache__", ".pytest_cache", "results"}


def copy_tree(src: pathlib.Path, dst: pathlib.Path) -> None:
    """자동 생성 폴더는 빼고 복사합니다."""
    shutil.copytree(
        src, dst,
        ignore=shutil.ignore_patterns(*SKIP_DIRS, "*.pyc", "app_test.html"),
        dirs_exist_ok=True,
    )


def wrap_html(body: str, title: str) -> str:
    """<head> 가 없는 조각을 혼자서도 열리는 온전한 HTML 문서로 감쌉니다."""
    return (
        "<!doctype html>\n"
        '<html lang="ko">\n<head>\n'
        '<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        f"<title>{title}</title>\n"
        "<style>body{margin:0}img{max-width:100%}</style>\n"
        "</head>\n<body>\n" + body + "\n</body>\n</html>\n"
    )


def main() -> None:
    report = pathlib.Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else None
    if report and not report.exists():
        raise SystemExit(f"보고서 파일이 없습니다: {report}")

    root = OUT_DIR / PKG
    if root.exists():
        shutil.rmtree(root)
    (root / "1_앱" / "원본코드").mkdir(parents=True)
    (root / "2_보고서").mkdir(parents=True)

    # 0. 안내문
    shutil.copy2(HERE / "package_readme.html", root / "0_먼저_읽어주세요.html")

    # 1. 완성된 앱 (이 파일 하나면 앱이 돕니다)
    shutil.copy2(HERE / "app" / "app.html", root / "1_앱" / "발스캔_앱.html")
    for name in ("app_ui.html", "cvlite.js", "engine2.js", "app_logic.js",
                 "samples.js", "boot.html", "build.sh", "make_samples.py", "README.md"):
        shutil.copy2(HERE / "app" / name, root / "1_앱" / "원본코드" / name)
    copy_tree(HERE / "app" / "samples", root / "1_앱" / "원본코드" / "samples")
    copy_tree(HERE / "app" / "tests", root / "1_앱" / "원본코드" / "tests")

    # 2. 보고서
    #    보고서 원본은 웹에 올릴 때 쓰는 조각(<head> 없음)이라, 파일로 그냥 열면
    #    브라우저가 인코딩을 잘못 추측해 한글이 깨집니다. 껍데기를 씌워 저장합니다.
    if report:
        (root / "2_보고서" / "개발보고서.html").write_text(
            wrap_html(report.read_text(encoding="utf-8"), "발 스캔 개발 현황"),
            encoding="utf-8",
        )

    # 3. 원본 파이썬 엔진
    copy_tree(HERE / "engine", root / "3_원본엔진_파이썬")
    shutil.copy2(HERE / "SPEC.md", root / "3_원본엔진_파이썬" / "개발명세서_SPEC.md")

    # 압축
    zip_path = OUT_DIR / f"{PKG}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for p in sorted(root.rglob("*")):
            if p.is_file():
                z.write(p, p.relative_to(OUT_DIR).as_posix())

    n = len(zipfile.ZipFile(zip_path).namelist())
    print(f"{zip_path} · {zip_path.stat().st_size / 1048576:.1f} MB · 파일 {n}개")


if __name__ == "__main__":
    main()
