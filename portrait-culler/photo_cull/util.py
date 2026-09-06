# -*- coding: utf-8 -*-
"""공통 유틸리티: 진행률 표시, 시간 포맷, 파일 목록 만들기 등."""

import hashlib
import os
import sys
import time

from . import config


def human_time(seconds):
    """초를 '1분 23초' 같은 한글 문자열로 바꿉니다."""
    if seconds is None or seconds != seconds:  # None 또는 NaN
        return "-"
    seconds = int(round(seconds))
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h:
        return "%d시간 %d분 %d초" % (h, m, s)
    if m:
        return "%d분 %d초" % (m, s)
    return "%d초" % s


class Progress:
    """
    '몇 장 중 몇 장 처리 중' 진행률을 한 줄로 갱신해 보여줍니다.
    터미널이 아닌 곳(로그 파일 등)으로 출력될 때는 줄바꿈으로 찍습니다.
    """

    def __init__(self, total, label="처리"):
        self.total = max(int(total), 0)
        self.label = label
        self.done = 0
        self.start = time.time()
        self.is_tty = sys.stderr.isatty()
        self._last_draw = 0.0

    def update(self, n=1, force=False):
        self.done += n
        now = time.time()
        # 화면 깜빡임을 줄이려고 0.2초에 한 번만 다시 그립니다.
        if not force and (now - self._last_draw) < 0.2 and self.done < self.total:
            return
        self._last_draw = now
        elapsed = now - self.start
        rate = self.done / elapsed if elapsed > 0 else 0.0
        remain = (self.total - self.done) / rate if rate > 0 else None
        pct = (self.done / self.total * 100.0) if self.total else 100.0
        msg = "[%s] %d/%d (%.1f%%)  경과 %s  남은 예상 %s  속도 %.1f장/초" % (
            self.label, self.done, self.total, pct,
            human_time(elapsed), human_time(remain), rate,
        )
        if self.is_tty:
            sys.stderr.write("\r\033[K" + msg)
            sys.stderr.flush()
        elif self.done == self.total or self.done % 50 == 0:
            sys.stderr.write(msg + "\n")

    def close(self):
        elapsed = time.time() - self.start
        if self.is_tty:
            sys.stderr.write("\r\033[K")
            sys.stderr.flush()
        rate = self.done / elapsed if elapsed > 0 else 0.0
        sys.stderr.write("[%s] 완료 %d장 · 소요 %s · 평균 %.2f장/초\n"
                         % (self.label, self.done, human_time(elapsed), rate))
        sys.stderr.flush()
        return elapsed, rate


def is_supported(path):
    """분석 대상 파일인지 확장자로 판단합니다."""
    ext = os.path.splitext(path)[1].lower()
    return ext in config.RAW_EXTS or ext in config.IMAGE_EXTS


def is_raw(path):
    return os.path.splitext(path)[1].lower() in config.RAW_EXTS


def list_photos(folder, recursive=True):
    """
    폴더에서 사진 파일 목록을 만듭니다.
    - 결과물 폴더(_cull)와 숨김 파일(.으로 시작), 맥의 리소스 파일(._)은 제외합니다.
    - 파일명 순으로 정렬합니다.
    """
    out = []
    folder = os.path.abspath(folder)
    for root, dirs, files in os.walk(folder):
        # 결과물 폴더와 숨김 폴더는 탐색하지 않습니다.
        dirs[:] = [d for d in dirs
                   if not d.startswith(".") and d != config.OUTPUT_DIRNAME]
        if not recursive and root != folder:
            continue
        for name in files:
            if name.startswith(".") or name.startswith("._"):
                continue
            p = os.path.join(root, name)
            if is_supported(p):
                out.append(p)
    out.sort()
    return out


def file_key(path):
    """
    캐시 키. 경로 + 파일크기 + 수정시각 + 분석버전 을 합쳐 해시합니다.
    파일 내용이 그대로면 같은 키가 나오므로 재실행 시 건너뛸 수 있습니다.
    """
    st = os.stat(path)
    raw = "%s|%d|%d|%s" % (os.path.abspath(path), st.st_size,
                           int(st.st_mtime), config.ANALYSIS_VERSION)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def thumb_name(path):
    """썸네일 파일 이름(경로에서 안정적으로 생성)."""
    return hashlib.md5(os.path.abspath(path).encode("utf-8")).hexdigest()[:16] + ".jpg"


def ensure_dir(path):
    os.makedirs(path, exist_ok=True)
    return path
