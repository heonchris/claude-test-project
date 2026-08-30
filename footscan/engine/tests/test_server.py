"""
test_server.py — [SPEC Phase 1] 휴대폰용 서버가 제대로 도는지 확인합니다.

실제 폰 없이도 "폰이 하는 일"을 그대로 흉내 내서 검사합니다.
  · 사진을 올리면 측정 결과가 오는가
  · 폰 사진처럼 큰 파일(1200만 화소)도 처리되는가
  · 아이폰식 EXIF 회전 사진도 바로 서는가
  · 잘못 찍었을 때 한글 안내가 오는가
  · 남의 파일을 훔쳐볼 수 없는가 (경로 조작 차단)

실행:
    python tests/test_server.py
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np

ENGINE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ENGINE_DIR))
sys.path.insert(0, str(ENGINE_DIR / "tests"))

from fastapi.testclient import TestClient  # noqa: E402

import make_synthetic as ms                # noqa: E402
from server import app                     # noqa: E402

SAMPLES = ENGINE_DIR / "samples"
client = TestClient(app)


def _ensure_samples() -> None:
    if not (SAMPLES / "right_top.jpg").exists():
        ms.main()


def _f(path: Path):
    return (path.name, path.read_bytes(), "image/jpeg")


def test_health() -> None:
    r = client.get("/api/health")
    assert r.status_code == 200, r.status_code
    assert r.json()["ok"] is True
    # 면책 문구는 서버에서도 항상 나가야 합니다 (SPEC 1-5)
    assert "의료적 진단이 아닙니다" in r.json()["disclaimer"]


def test_phone_page_is_served() -> None:
    """폰에서 주소만 치면 화면이 떠야 합니다."""
    r = client.get("/")
    assert r.status_code == 200
    assert "발 스캔" in r.text
    assert "본 측정값은 참고용이며" in r.text     # 하단 고정 면책 문구
    for asset in ("/manifest.json", "/icon-192.png"):
        assert client.get(asset).status_code == 200, asset


def test_scan_two_photos() -> None:
    """위+옆 사진 2장 → 치수, 아치, 사이즈, 디버그 이미지까지."""
    _ensure_samples()
    r = client.post("/api/scan", files={
        "right_top": _f(SAMPLES / "right_top.jpg"),
        "right_side": _f(SAMPLES / "right_side.jpg"),
    })
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    assert abs(d["right"]["top"]["foot_length_mm"] - 250.0) <= 3.0
    assert d["right"]["lateral"]["arch_grade"] in ("low", "normal", "high")
    assert d["recommended_size"]["options"], "사이즈 추천이 비었습니다"
    assert "의료적 진단이 아닙니다" in d["disclaimer"]

    # 디버그 이미지가 폰에서 열리는 주소로 나오고, 실제로 열려야 합니다
    imgs = d["right"]["debug_images"]
    assert len(imgs) == 8, f"디버그 이미지 {len(imgs)}장 (8장이어야 함)"
    for url in imgs.values():
        assert url.startswith("/api/debug/")
        assert client.get(url).status_code == 200, url


def test_scan_top_only_skips_arch() -> None:
    """옆면을 건너뛰면 사이즈만 나오고 아치는 '없음'이어야 합니다. (SPEC 5-2)"""
    _ensure_samples()
    r = client.post("/api/scan", files={"right_top": _f(SAMPLES / "right_top.jpg")})
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    assert d["right"]["lateral"] is None
    assert d["recommended_size"]["options"]


def test_big_phone_photo() -> None:
    """요즘 폰 사진(1200만 화소)도 문제없이 처리되어야 합니다."""
    _ensure_samples()
    tmp = Path(tempfile.mkdtemp(prefix="fs_big_"))
    big = tmp / "big.jpg"
    img = cv2.imread(str(SAMPLES / "right_top.jpg"))
    cv2.imwrite(str(big), cv2.resize(img, (4000, 3000), interpolation=cv2.INTER_CUBIC),
                [cv2.IMWRITE_JPEG_QUALITY, 92])
    r = client.post("/api/scan", files={"right_top": _f(big)})
    assert r.status_code == 200, r.text[:300]
    assert abs(r.json()["right"]["top"]["foot_length_mm"] - 250.0) <= 3.0


def test_exif_rotated_photo() -> None:
    """회전 정보가 메타데이터에만 있는 사진도 똑바로 세워서 재야 합니다."""
    _ensure_samples()
    r = client.post("/api/scan", files={
        "right_top": _f(SAMPLES / "exif_rotated_top.jpg"),
        "right_side": _f(SAMPLES / "exif_rotated_side.jpg"),
    })
    assert r.status_code == 200, r.text[:300]
    assert abs(r.json()["right"]["top"]["foot_length_mm"] - 250.0) <= 3.0


def test_error_messages_are_korean() -> None:
    """잘못 찍었을 때 무엇을 어떻게 고칠지 한글로 알려줘야 합니다."""
    tmp = Path(tempfile.mkdtemp(prefix="fs_err_"))
    blank = tmp / "blank.jpg"
    cv2.imwrite(str(blank), np.full((1200, 1600, 3), 90, np.uint8))

    r = client.post("/api/scan", files={"right_top": _f(blank)})
    assert r.status_code == 422, r.status_code
    d = r.json()
    assert d["error_code"] == "PAPER_NOT_FOUND"
    assert d["hint"], "고치는 방법 안내가 비었습니다"

    # 사진을 아예 안 보낸 경우
    assert client.post("/api/scan").status_code == 400

    # 지원하지 않는 형식 (아이폰 HEIC 등)
    r = client.post("/api/scan", files={"right_top": ("a.heic", b"xxxx", "image/heic")})
    assert r.status_code == 415, r.status_code


def test_debug_path_traversal_blocked() -> None:
    """디버그 이미지 주소로 서버의 다른 파일을 훔쳐볼 수 없어야 합니다."""
    for bad in ("../../etc/passwd", "..%2f..%2fetc%2fpasswd", "a/b"):
        r = client.get(f"/api/debug/abc123/{bad}")
        assert r.status_code in (400, 404), f"{bad} → {r.status_code}"
    assert client.get("/api/debug/없는아이디/x.jpg").status_code in (400, 404)


def main() -> int:
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for fn in tests:
        try:
            fn()
            print(f"  PASS  {fn.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"  FAIL  {fn.__name__}\n        {e}")
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"  ERROR {fn.__name__}\n        {type(e).__name__}: {e}")
    print(f"\n{len(tests) - failed}/{len(tests)} 통과")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
