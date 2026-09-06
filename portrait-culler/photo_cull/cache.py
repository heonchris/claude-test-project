# -*- coding: utf-8 -*-
"""
분석 결과 캐시
==============
같은 파일을 두 번 분석하지 않도록 측정값을 JSON에 저장합니다.
키에는 경로 + 파일크기 + 수정시각 + ANALYSIS_VERSION이 들어가므로,
파일이 바뀌거나 분석 로직 버전이 올라가면 자동으로 다시 분석합니다.
"""

import json
import os
import tempfile

from . import util


class Cache:
    def __init__(self, path):
        self.path = path
        self.data = {}
        self.hits = 0
        self.misses = 0
        self._dirty = False
        self.load()

    def load(self):
        if os.path.exists(self.path):
            try:
                with open(self.path, "r", encoding="utf-8") as f:
                    self.data = json.load(f)
            except Exception:
                # 캐시가 깨졌으면 그냥 새로 시작합니다 (작업이 멈추지 않도록)
                self.data = {}

    def get(self, file_path):
        try:
            key = util.file_key(file_path)
        except OSError:
            return None
        rec = self.data.get(key)
        if rec is not None:
            self.hits += 1
            return dict(rec)
        self.misses += 1
        return None

    def put(self, file_path, rec):
        try:
            key = util.file_key(file_path)
        except OSError:
            return
        self.data[key] = rec
        self._dirty = True

    def save(self, force=False):
        if not (self._dirty or force):
            return
        util.ensure_dir(os.path.dirname(self.path))
        # 저장 도중 중단되어도 기존 캐시가 깨지지 않도록 임시파일 → 교체
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(self.path), suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(self.data, f, ensure_ascii=False)
            os.replace(tmp, self.path)
            self._dirty = False
        except Exception:
            try:
                os.unlink(tmp)
            except OSError:
                pass
