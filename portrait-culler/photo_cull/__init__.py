# -*- coding: utf-8 -*-
"""인물 사진 1차 셀렉 도구 (전부 로컬 실행)."""

import sys

__version__ = "1.0.0"


# ---------------------------------------------------------------------------
# MediaPipe는 파이썬이 종료될 때 내부 정리 과정에서
#   'Exception ignored in: <function FaceDetector.__del__ ...>'
# 같은 메시지를 남기는 경우가 있습니다. 프로그램 동작에는 전혀 문제가 없지만
# 처음 보면 실패한 것처럼 보이기 때문에, MediaPipe 정리 과정에서 나온 것만 가립니다.
# (우리 코드의 오류는 그대로 표시됩니다)
# ---------------------------------------------------------------------------
_original_unraisablehook = sys.unraisablehook


def _quiet_unraisable(unraisable):
    """MediaPipe 정리 과정에서 나온 메시지인지 확인해서, 맞으면 조용히 넘어갑니다."""
    try:
        obj = getattr(unraisable, "object", None)
        parts = [getattr(obj, "__module__", "") or "", repr(obj)[:200]]
        tb = getattr(unraisable, "exc_traceback", None)
        depth = 0
        while tb is not None and depth < 20:      # 발생 위치의 파일 경로도 확인
            parts.append(tb.tb_frame.f_code.co_filename or "")
            tb = tb.tb_next
            depth += 1
        if "mediapipe" in " ".join(parts).lower():
            return
    except Exception:
        pass
    _original_unraisablehook(unraisable)


sys.unraisablehook = _quiet_unraisable
