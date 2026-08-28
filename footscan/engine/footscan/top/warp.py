"""
top/warp.py — [SPEC A3] 원근 왜곡을 펴서 "정확히 위에서 본 종이"로 만듭니다.

이 단계가 이 프로젝트의 핵심입니다.
비스듬히 찍힌 사진이라도, 종이가 평면이고 네 꼭짓점을 알면
수학적으로 완전히 펼 수 있습니다(호모그래피).

★ 이 단계를 지나면 1픽셀 = 0.1mm 로 고정됩니다.
   이후 모든 측정은 "픽셀 거리 ÷ 10 = mm" 로 끝납니다.
"""

from __future__ import annotations

import cv2
import numpy as np

from .. import config as C
from ..debug import DebugSaver, put_label


def warp_to_a4(img_bgr: np.ndarray, quad: np.ndarray,
               dbg: DebugSaver | None = None) -> tuple[np.ndarray, np.ndarray]:
    """
    종이 네 꼭짓점을 받아 2100 x 2970 px (=210 x 297mm) 캔버스로 펴 줍니다.
    돌려주는 값: (펴진 이미지, 호모그래피 행렬)
    """
    tl, tr, br, bl = quad.astype(np.float32)
    edge_w = (np.linalg.norm(tr - tl) + np.linalg.norm(br - bl)) / 2.0
    edge_h = (np.linalg.norm(bl - tl) + np.linalg.norm(br - tr)) / 2.0

    # 사진 속 종이가 가로로 누워 있으면(가로변이 더 김) 캔버스도 가로로 잡았다가
    # 마지막에 세로로 돌립니다. (A4 가로/세로 자동 판별)
    landscape = edge_w > edge_h
    if landscape:
        out_w, out_h = C.WARP_H_PX, C.WARP_W_PX      # 2970 x 2100
    else:
        out_w, out_h = C.WARP_W_PX, C.WARP_H_PX      # 2100 x 2970

    dst = np.float32([[0, 0], [out_w - 1, 0], [out_w - 1, out_h - 1], [0, out_h - 1]])
    M = cv2.getPerspectiveTransform(quad.astype(np.float32), dst)
    warped = cv2.warpPerspective(img_bgr, M, (out_w, out_h), flags=cv2.INTER_LINEAR)

    if landscape:
        warped = cv2.rotate(warped, cv2.ROTATE_90_CLOCKWISE)

    if dbg is not None:
        vis = warped.copy()
        # 10cm 격자를 그려 눈으로도 스케일을 확인할 수 있게 합니다
        step = int(50 * C.PX_PER_MM)     # 50mm 간격
        for x in range(0, vis.shape[1], step):
            cv2.line(vis, (x, 0), (x, vis.shape[0]), (200, 200, 200), 2)
        for y in range(0, vis.shape[0], step):
            cv2.line(vis, (0, y), (vis.shape[1], y), (200, 200, 200), 2)
        put_label(vis, "warped to A4: 1px = 0.1mm (grid = 50mm)", (30, 70), scale=2.0, thick=4)
        dbg.save("top_warped", vis)

    return warped, M
