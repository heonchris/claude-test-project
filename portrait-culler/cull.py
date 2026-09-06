#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
인물 사진 1차 셀렉 도구 — 실행 진입점
=====================================
사용법은 아래 명령으로 확인하세요.
    python cull.py --help

멀티프로세싱(spawn) 때문에 아래 __main__ 가드가 반드시 필요합니다.
"""

import sys
import os

# MediaPipe(구글 glog)가 터미널에 쏟아내는 정보성 로그를 줄입니다.
# (실제 오류는 그대로 보입니다)
os.environ.setdefault("GLOG_minloglevel", "2")
os.environ.setdefault("GLOG_logtostderr", "0")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
os.environ.setdefault("ABSL_MIN_LOG_LEVEL", "2")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from photo_cull.cli import main   # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
