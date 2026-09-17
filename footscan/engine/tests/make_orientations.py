"""같은 사진을 EXIF 방향 8가지로 저장합니다.

아이폰은 세로로 찍어도 파일 안에는 가로로 저장하고 "돌려서 보라"는 표시만 붙입니다.
브라우저마다 이 표시를 알아서 적용하기도, 안 하기도 해서 기기별로 결과가 달라질 수
있습니다. 8가지 모두에서 같은 치수가 나오는지 확인하기 위한 시험 사진입니다.

    python3 tests/make_orientations.py [출력폴더]
"""

from __future__ import annotations

import pathlib
import sys

from PIL import Image

# EXIF 방향값 → 그 표시를 '되돌리는' 변환.
# 저장할 때 이 변환을 걸어 두면, 보는 쪽이 표시대로 돌렸을 때 원본이 됩니다.
INVERSE = {
    1: None,
    2: Image.Transpose.FLIP_LEFT_RIGHT,
    3: Image.Transpose.ROTATE_180,
    4: Image.Transpose.FLIP_TOP_BOTTOM,
    5: Image.Transpose.TRANSPOSE,
    6: Image.Transpose.ROTATE_90,     # PIL 의 ROTATE_90 은 반시계
    7: Image.Transpose.TRANSVERSE,
    8: Image.Transpose.ROTATE_270,
}


def make(src: pathlib.Path, out_dir: pathlib.Path, tag: str) -> None:
    base = Image.open(src).convert("RGB")
    for o, op in INVERSE.items():
        img = base if op is None else base.transpose(op)
        exif = img.getexif()
        exif[274] = o                                   # 274 = Orientation
        img.save(out_dir / f"ori{o}_{tag}.jpg", quality=92, exif=exif)


def main() -> None:
    here = pathlib.Path(__file__).resolve().parents[1]
    out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else here / "samples_ori"
    out.mkdir(parents=True, exist_ok=True)
    for tag in ("top", "side"):
        make(here / "samples" / f"right_{tag}.jpg", out, tag)
    print(f"8방향 x 2장 → {out}")


if __name__ == "__main__":
    main()
