"""
server.py — [SPEC Phase 1] 파이썬 엔진을 휴대폰에서 쓸 수 있게 감싸는 서버.

왜 서버가 필요한가?
  측정 엔진은 파이썬 + OpenCV 로 만들어져 있어서 안드로이드 폰 안에서 직접 돌지 않습니다.
  그래서 [폰 = 사진 찍고 결과 보는 화면] / [PC = 계산] 으로 나눕니다.
  폰에는 아무것도 설치하지 않습니다. 크롬으로 주소만 열면 됩니다.

실행:
    python server.py
  → 화면에 폰에서 열 주소가 나옵니다 (예: http://192.168.0.5:8000)
  → 폰과 PC 가 같은 와이파이에 있어야 합니다.

주소 구성
  GET  /                     휴대폰용 촬영/결과 화면
  POST /api/scan             사진 업로드 → 측정 결과(JSON)
  GET  /api/debug/{id}/{파일} 디버그 이미지
  GET  /api/health           서버가 살아있는지 확인
"""

from __future__ import annotations

import shutil
import socket
import tempfile
import time
import traceback
import uuid
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from footscan import config as C
from footscan.errors import FootScanError
from footscan.pipeline import scan

BASE_DIR = Path(__file__).resolve().parent
WEB_DIR = BASE_DIR / "web"

# 업로드한 사진과 디버그 이미지를 잠시 보관하는 곳.
# 서버를 끄면 사라집니다. (사진을 서버에 영구 저장하지 않습니다)
WORK_ROOT = Path(tempfile.gettempdir()) / "footscan_server"
WORK_ROOT.mkdir(parents=True, exist_ok=True)

# 사진 한 장의 최대 크기. 요즘 폰 사진은 보통 3~8MB 입니다.
#   올리면: 고화질 사진도 받지만 업로드가 느려집니다
MAX_UPLOAD_MB = 30

# 보관 기간(초). 이 시간이 지난 작업 폴더는 새 요청이 올 때 지웁니다.
RESULT_TTL_SEC = 60 * 60

ALLOWED_SUFFIX = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

app = FastAPI(title="FootScan", description="A4 기준 발 측정 (Phase 1)")


# --------------------------------------------------------------------------
# 도우미
# --------------------------------------------------------------------------

def local_ip() -> str:
    """폰에서 접속할 때 쓸 이 PC 의 와이파이 주소를 찾습니다."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))       # 실제로 보내지는 않고 경로만 확인합니다
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


def _cleanup_old() -> None:
    """오래된 작업 폴더를 지웁니다 (사진이 계속 쌓이지 않도록)."""
    now = time.time()
    for d in WORK_ROOT.iterdir():
        try:
            if d.is_dir() and now - d.stat().st_mtime > RESULT_TTL_SEC:
                shutil.rmtree(d, ignore_errors=True)
        except OSError:
            pass


def _save_upload(up: UploadFile | None, dest_dir: Path, name: str) -> Path | None:
    """업로드된 사진을 작업 폴더에 저장합니다. 없으면 None."""
    if up is None or not up.filename:
        return None
    suffix = Path(up.filename).suffix.lower()
    if suffix not in ALLOWED_SUFFIX:
        raise HTTPException(
            status_code=415,
            detail={
                "error_code": "UNSUPPORTED_FORMAT",
                "message": f"지원하지 않는 사진 형식입니다: {suffix or '알 수 없음'}",
                "hint": "JPG 또는 PNG 로 찍어 주세요. 아이폰의 HEIC 는 지원하지 않습니다.",
            },
        )
    dest = dest_dir / f"{name}{suffix}"
    size = 0
    limit = MAX_UPLOAD_MB * 1024 * 1024
    with dest.open("wb") as f:
        while chunk := up.file.read(1024 * 1024):
            size += len(chunk)
            if size > limit:
                raise HTTPException(
                    status_code=413,
                    detail={
                        "error_code": "FILE_TOO_LARGE",
                        "message": f"사진이 너무 큽니다 ({MAX_UPLOAD_MB}MB 초과).",
                        "hint": "카메라 설정에서 해상도를 낮추거나 사진을 줄여서 올려 주세요.",
                    },
                )
            f.write(chunk)
    return dest


# --------------------------------------------------------------------------
# API
# --------------------------------------------------------------------------

@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "disclaimer": C.DISCLAIMER}


@app.post("/api/scan")
def api_scan(
    right_top: UploadFile | None = File(None),
    right_side: UploadFile | None = File(None),
    left_top: UploadFile | None = File(None),
    left_side: UploadFile | None = File(None),
    debug: bool = True,
):
    """
    사진을 받아 측정 결과를 돌려줍니다.
    ※ 무거운 계산이라 일부러 async 가 아닌 보통 함수로 두었습니다.
       그래야 FastAPI 가 별도 작업 스레드에서 돌려 다른 요청을 막지 않습니다.
    """
    _cleanup_old()
    scan_id = uuid.uuid4().hex[:12]
    work = WORK_ROOT / scan_id
    work.mkdir(parents=True, exist_ok=True)

    try:
        paths = {
            "right_top": _save_upload(right_top, work, "right_top"),
            "right_side": _save_upload(right_side, work, "right_side"),
            "left_top": _save_upload(left_top, work, "left_top"),
            "left_side": _save_upload(left_side, work, "left_side"),
        }
        if not paths["right_top"] and not paths["left_top"]:
            raise HTTPException(
                status_code=400,
                detail={
                    "error_code": "NO_TOP_IMAGE",
                    "message": "위에서 찍은 사진이 최소 한 장은 필요합니다.",
                    "hint": "A4 종이 위에 발을 올리고 위에서 찍은 사진을 올려 주세요.",
                },
            )

        started = time.perf_counter()
        result = scan(
            right_top=paths["right_top"], right_side=paths["right_side"],
            left_top=paths["left_top"], left_side=paths["left_side"],
            out_dir=work / "debug", debug=debug,
        )
        elapsed = time.perf_counter() - started

        payload = result.model_dump(mode="json")
        payload["scan_id"] = scan_id
        payload["elapsed_sec"] = round(elapsed, 2)
        # 디버그 이미지는 파일 경로 대신 폰에서 열 수 있는 주소로 바꿔 줍니다
        for side_key in ("left", "right"):
            foot = payload.get(side_key)
            if foot and foot.get("debug_images"):
                foot["debug_images"] = {
                    k: f"/api/debug/{scan_id}/{Path(v).name}"
                    for k, v in foot["debug_images"].items()
                }
        return payload

    except FootScanError as e:
        # 어느 단계에서 왜 실패했는지 그대로 폰 화면에 보여 줍니다
        return JSONResponse(status_code=422, content=e.to_dict())
    except HTTPException:
        raise
    except Exception:
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={
                "error_code": "INTERNAL_ERROR",
                "message": "서버에서 예상치 못한 문제가 생겼습니다.",
                "stage": "서버",
                "hint": "PC 터미널에 찍힌 붉은 오류 메시지를 그대로 복사해 알려 주세요.",
            },
        )


@app.get("/api/debug/{scan_id}/{name}")
def api_debug_image(scan_id: str, name: str):
    """디버그 이미지를 폰에서 볼 수 있게 내려 줍니다."""
    # 경로 조작 방지: 파일 이름에 폴더 구분자가 섞이면 거부합니다
    if not scan_id.isalnum() or "/" in name or "\\" in name or ".." in name:
        raise HTTPException(status_code=400, detail="잘못된 경로입니다.")
    path = WORK_ROOT / scan_id / "debug" / name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="이미지를 찾을 수 없습니다.")
    return FileResponse(path, media_type="image/jpeg")


# 휴대폰용 화면 (web/index.html). API 경로보다 뒤에 붙여야 합니다.
app.mount("/", StaticFiles(directory=str(WEB_DIR), html=True), name="web")


def main() -> None:
    import uvicorn

    ip = local_ip()
    port = 8000
    print()
    print("=" * 60)
    print("  FootScan 서버가 켜졌습니다")
    print("=" * 60)
    print("  폰에서 크롬을 열고 이 주소를 입력하세요:")
    print()
    print(f"      http://{ip}:{port}")
    print()
    print("  · 폰과 이 PC 가 같은 와이파이에 있어야 합니다")
    print("  · 끄려면 이 창에서 Ctrl+C")
    print("=" * 60)
    print()
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")


if __name__ == "__main__":
    main()
