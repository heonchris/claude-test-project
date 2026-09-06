# -*- coding: utf-8 -*-
"""
단계 3~4: 얼굴 검출 + 눈 landmark
=================================
MediaPipe 버전에 따라 API가 다릅니다. 이 파일이 그 차이를 흡수합니다.

  1) MediaPipe Tasks API  (mediapipe 0.10 후반 ~ 1.x, 요즘 설치하면 이것)
     → 모델 파일(.tflite/.task)을 한 번 내려받아 사용합니다. (python cull.py setup)
  2) MediaPipe 구버전 solutions API (mediapipe 0.10.x 초반)
     → 모델이 패키지에 내장되어 있어 다운로드가 필요 없습니다.
  3) MediaPipe를 아예 못 쓰는 환경
     → OpenCV Haar cascade로 얼굴만 검출합니다. (눈 감음 판정은 '판정불가')

어느 것이 쓰이는지는 `python cull.py check` 로 확인할 수 있습니다.
"""

import contextlib
import os
import sys

import cv2
import numpy as np

from . import config

# 모델 파일 위치: 환경변수 > 프로젝트/models
MODEL_DIR = os.environ.get(
    "PORTRAIT_CULLER_MODELS",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models"),
)
# 얼굴 검출 모델은 두 가지입니다.
#  - full range : 멀리 있는(작은) 얼굴까지 찾습니다. 전신 샷이 많은 인물 촬영에 적합.
#  - short range: 가까운 얼굴 전용. 가볍지만 화면의 15%보다 작은 얼굴은 놓칩니다.
# 실측(분석 긴 변 1280px 기준, 얼굴이 화면에서 차지하는 비율):
#   0.20  0.15  0.10  0.07  0.05
#   short  O     O     X     X     X
#   full   O     O     O     O     X
# 그래서 full range를 우선 사용하고, 없으면 short range로 넘어갑니다.
DETECTOR_MODEL_FULL = os.path.join(MODEL_DIR, "blaze_face_full_range.tflite")
DETECTOR_MODEL_SHORT = os.path.join(MODEL_DIR, "blaze_face_short_range.tflite")
LANDMARKER_MODEL = os.path.join(MODEL_DIR, "face_landmarker.task")

MODEL_URLS = {
    DETECTOR_MODEL_FULL: "https://storage.googleapis.com/mediapipe-models/face_detector/"
                         "blaze_face_full_range/float16/1/blaze_face_full_range.tflite",
    DETECTOR_MODEL_SHORT: "https://storage.googleapis.com/mediapipe-models/face_detector/"
                          "blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
    LANDMARKER_MODEL: "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
                      "face_landmarker/float16/1/face_landmarker.task",
}

@contextlib.contextmanager
def silence_native_stderr():
    """
    MediaPipe(C++)가 터미널에 직접 찍는 안내성 경고를 잠시 가립니다.
    엔진을 처음 만들 때와 첫 추론에서만 사용하며, 파이썬 예외는 평소대로 올라옵니다.
    로그를 보고 싶으면 환경변수 PORTRAIT_CULLER_VERBOSE=1 을 주고 실행하세요.
    """
    if os.environ.get("PORTRAIT_CULLER_VERBOSE"):
        yield
        return
    try:
        saved = os.dup(2)
        devnull = os.open(os.devnull, os.O_WRONLY)
    except OSError:
        yield
        return
    try:
        sys.stderr.flush()
        os.dup2(devnull, 2)
        yield
    finally:
        try:
            os.dup2(saved, 2)
        finally:
            os.close(devnull)
            os.close(saved)


# Face Mesh 468 landmark 중 눈 6점의 번호 (EAR 계산용)
# 순서: [바깥끝, 위1, 위2, 안쪽끝, 아래2, 아래1]
RIGHT_EYE_IDX = [33, 160, 158, 133, 153, 144]
LEFT_EYE_IDX = [362, 385, 387, 263, 373, 380]


def eye_aspect_ratio(points, idx):
    """
    EAR(Eye Aspect Ratio) = (세로거리1 + 세로거리2) / (2 x 가로거리)
    눈을 뜨면 세로가 길어져 값이 커지고, 감으면 0에 가까워집니다.
    """
    p = [np.asarray(points[i], dtype=np.float64) for i in idx]
    vert = np.linalg.norm(p[1] - p[5]) + np.linalg.norm(p[2] - p[4])
    horiz = np.linalg.norm(p[0] - p[3])
    if horiz <= 1e-6:
        return None
    return float(vert / (2.0 * horiz))


class FaceEngine:
    """얼굴 검출 + 눈 landmark 엔진. 프로세스마다 하나씩 만들어 재사용합니다."""

    def __init__(self, prefer=None):
        self.kind = None          # 'tasks' | 'legacy' | 'haar'
        self.has_landmarks = False
        self.has_blendshapes = False
        self._detector = None
        self._landmarker = None
        self._haar = None
        self._init(prefer)

    # ---------------- 초기화 ----------------
    def _init(self, prefer):
        order = [prefer] if prefer else ["tasks", "legacy", "haar"]
        errors = []
        with silence_native_stderr():
            for kind in order:
                try:
                    if kind == "tasks" and self._init_tasks():
                        self._warmup()
                        return
                    if kind == "legacy" and self._init_legacy():
                        self._warmup()
                        return
                    if kind == "haar" and self._init_haar():
                        return
                except Exception as e:                  # 다음 방식으로 넘어감
                    errors.append("%s: %s" % (kind, e))
        raise RuntimeError("얼굴 검출 엔진을 초기화하지 못했습니다.\n" + "\n".join(errors))

    def _warmup(self):
        """
        첫 추론 때 나오는 안내 로그를 여기서 미리 소진시킵니다.
        (작은 더미 이미지 한 장이라 몇 밀리초면 끝납니다)
        """
        try:
            dummy = np.zeros((64, 64, 3), dtype=np.uint8)
            self.detect(dummy)
            self.eye_metrics(dummy, (8, 8, 48, 48))
        except Exception:
            pass

    def _init_tasks(self):
        detector_model = (DETECTOR_MODEL_FULL if os.path.exists(DETECTOR_MODEL_FULL)
                          else DETECTOR_MODEL_SHORT)
        if not (os.path.exists(detector_model) and os.path.exists(LANDMARKER_MODEL)):
            return False
        self.detector_model = os.path.basename(detector_model)
        import mediapipe as mp
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision

        self._mp = mp
        self._detector = vision.FaceDetector.create_from_options(
            vision.FaceDetectorOptions(
                base_options=mp_python.BaseOptions(model_asset_path=detector_model),
                running_mode=vision.RunningMode.IMAGE,
                min_detection_confidence=0.2,   # 필터링은 우리 쪽에서(설정값으로) 합니다
            )
        )
        self._landmarker = vision.FaceLandmarker.create_from_options(
            vision.FaceLandmarkerOptions(
                base_options=mp_python.BaseOptions(model_asset_path=LANDMARKER_MODEL),
                running_mode=vision.RunningMode.IMAGE,
                num_faces=1,
                output_face_blendshapes=True,   # eyeBlinkLeft/Right 점수를 함께 받음
            )
        )
        self.kind = "tasks"
        self.has_landmarks = True
        self.has_blendshapes = True
        return True

    def _init_legacy(self):
        import mediapipe as mp
        if not hasattr(mp, "solutions"):
            return False
        self._mp = mp
        self._detector = mp.solutions.face_detection.FaceDetection(
            model_selection=1, min_detection_confidence=0.2)
        self._landmarker = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=True, max_num_faces=1, refine_landmarks=True,
            min_detection_confidence=0.3)
        self.kind = "legacy"
        self.has_landmarks = True
        self.has_blendshapes = False
        return True

    def _init_haar(self):
        path = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
        cascade = cv2.CascadeClassifier(path)
        if cascade.empty():
            return False
        self._haar = cascade
        self.kind = "haar"
        self.has_landmarks = False
        self.has_blendshapes = False
        return True

    # ---------------- 얼굴 검출 ----------------
    def detect(self, bgr):
        """
        얼굴 목록을 돌려줍니다. 각 항목: {"box": (x, y, w, h), "score": 0~1}
        설정값(FACE_MIN_CONFIDENCE)보다 낮은 신뢰도는 여기서 걸러냅니다.
        """
        if self.kind == "tasks":
            faces = self._detect_tasks(bgr)
        elif self.kind == "legacy":
            faces = self._detect_legacy(bgr)
        else:
            faces = self._detect_haar(bgr)
        faces = [f for f in faces if f["score"] >= config.FACE_MIN_CONFIDENCE]
        faces.sort(key=lambda f: f["box"][2] * f["box"][3], reverse=True)
        return faces

    def _detect_tasks(self, bgr):
        mp = self._mp
        img = mp.Image(image_format=mp.ImageFormat.SRGB,
                       data=cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
        res = self._detector.detect(img)
        out = []
        for d in res.detections:
            b = d.bounding_box
            score = float(d.categories[0].score) if d.categories else 0.0
            out.append({"box": (int(b.origin_x), int(b.origin_y),
                                int(b.width), int(b.height)), "score": score})
        return out

    def _detect_legacy(self, bgr):
        h, w = bgr.shape[:2]
        res = self._detector.process(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
        out = []
        for d in (res.detections or []):
            rb = d.location_data.relative_bounding_box
            out.append({
                "box": (int(rb.xmin * w), int(rb.ymin * h),
                        int(rb.width * w), int(rb.height * h)),
                "score": float(d.score[0]) if d.score else 0.0,
            })
        return out

    def _detect_haar(self, bgr):
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        rects = self._haar.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5,
                                            minSize=(40, 40))
        # Haar는 신뢰도를 주지 않으므로 통과값(0.9)을 넣습니다.
        return [{"box": (int(x), int(y), int(w), int(h)), "score": 0.9}
                for (x, y, w, h) in rects]

    def detect_tiled(self, bgr, rows=2, cols=2, overlap=0.25):
        """
        화면을 겹치게 나눠 조각마다 얼굴을 찾습니다.
        조각 안에서는 얼굴이 상대적으로 커 보이므로, 전신 샷처럼 얼굴이 작은 사진에서
        전체 화면으로는 못 찾던 얼굴을 찾을 수 있습니다.
        (전체 화면에서 하나도 못 찾았을 때만 쓰는 보조 수단입니다)
        """
        H, W = bgr.shape[:2]
        th = int(H / rows * (1 + overlap))
        tw = int(W / cols * (1 + overlap))
        found = []
        for r in range(rows):
            for c in range(cols):
                y0, x0 = int(r * H / rows), int(c * W / cols)
                y1, x1 = min(H, y0 + th), min(W, x0 + tw)
                y0, x0 = max(0, y1 - th), max(0, x1 - tw)
                sub = bgr[y0:y1, x0:x1]
                if sub.size == 0:
                    continue
                for f in self.detect(sub):
                    x, y, w, h = f["box"]
                    found.append({"box": (x + x0, y + y0, w, h), "score": f["score"]})
        return _dedupe(found)

    # ---------------- 눈 landmark ----------------
    def eye_metrics(self, bgr, box, margin=0.6, size=384):
        """
        얼굴 상자 주변을 잘라 확대한 뒤 landmark를 찍고 EAR을 계산합니다.
        작은 얼굴도 크롭 후 확대하면 landmark 정확도가 크게 올라갑니다.

        반환: {"ear_left","ear_right","blink_left","blink_right"} 또는 None(실패)
        """
        if not self.has_landmarks:
            return None
        crop = _crop_square(bgr, box, margin)
        if crop is None:
            return None
        scale = size / float(max(crop.shape[:2]))
        if scale > 1.0:
            crop = cv2.resize(crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        else:
            crop = cv2.resize(crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)

        if self.kind == "tasks":
            mp = self._mp
            img = mp.Image(image_format=mp.ImageFormat.SRGB,
                           data=cv2.cvtColor(crop, cv2.COLOR_BGR2RGB))
            res = self._landmarker.detect(img)
            if not res.face_landmarks:
                return None
            h, w = crop.shape[:2]
            pts = [(p.x * w, p.y * h) for p in res.face_landmarks[0]]
            blink_l = blink_r = None
            if res.face_blendshapes:
                bs = {c.category_name: float(c.score) for c in res.face_blendshapes[0]}
                blink_l = bs.get("eyeBlinkLeft")
                blink_r = bs.get("eyeBlinkRight")
        else:  # legacy
            res = self._landmarker.process(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB))
            if not res.multi_face_landmarks:
                return None
            h, w = crop.shape[:2]
            pts = [(p.x * w, p.y * h) for p in res.multi_face_landmarks[0].landmark]
            blink_l = blink_r = None

        if len(pts) < 468:
            return None
        return {
            "ear_right": eye_aspect_ratio(pts, RIGHT_EYE_IDX),
            "ear_left": eye_aspect_ratio(pts, LEFT_EYE_IDX),
            "blink_right": blink_r,
            "blink_left": blink_l,
            "_points": pts,          # 디버그 이미지 그릴 때만 사용
            "_crop_shape": crop.shape[:2],
        }

    def close(self):
        for name in ("_detector", "_landmarker"):
            obj = getattr(self, name, None)
            if obj is None:
                continue
            try:
                obj.close()
            except Exception:
                pass
            setattr(self, name, None)


def _iou(a, b):
    """두 상자가 얼마나 겹치는지(0~1). 조각별 검출 결과의 중복 제거에 씁니다."""
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    x0, y0 = max(ax, bx), max(ay, by)
    x1, y1 = min(ax + aw, bx + bw), min(ay + ah, by + bh)
    inter = max(0, x1 - x0) * max(0, y1 - y0)
    union = aw * ah + bw * bh - inter
    return inter / union if union > 0 else 0.0


def _dedupe(faces, iou_threshold=0.35):
    """같은 얼굴이 여러 조각에서 중복 검출된 것을 하나로 합칩니다."""
    faces = sorted(faces, key=lambda f: f["score"], reverse=True)
    kept = []
    for f in faces:
        if all(_iou(f["box"], k["box"]) < iou_threshold for k in kept):
            kept.append(f)
    return kept


def _crop_square(bgr, box, margin):
    """얼굴 상자를 정사각형으로 여유 있게 잘라냅니다."""
    x, y, w, h = box
    H, W = bgr.shape[:2]
    cx, cy = x + w / 2.0, y + h / 2.0
    side = max(w, h) * (1.0 + margin)
    x0 = int(max(0, round(cx - side / 2)))
    y0 = int(max(0, round(cy - side / 2)))
    x1 = int(min(W, round(cx + side / 2)))
    y1 = int(min(H, round(cy + side / 2)))
    if x1 - x0 < 8 or y1 - y0 < 8:
        return None
    return bgr[y0:y1, x0:x1]


def download_models(verbose=True):
    """모델 파일을 내려받습니다. (python cull.py setup 에서 호출)"""
    import urllib.request
    os.makedirs(MODEL_DIR, exist_ok=True)
    for dest, url in MODEL_URLS.items():
        if os.path.exists(dest) and os.path.getsize(dest) > 10000:
            if verbose:
                print("  이미 있음: %s" % os.path.basename(dest))
            continue
        if verbose:
            print("  내려받는 중: %s" % os.path.basename(dest))
        tmp = dest + ".part"
        urllib.request.urlretrieve(url, tmp)
        os.replace(tmp, dest)
        if verbose:
            print("    완료 (%.1f MB)" % (os.path.getsize(dest) / 1024 / 1024))
    return True


def models_ready():
    return (os.path.exists(LANDMARKER_MODEL)
            and (os.path.exists(DETECTOR_MODEL_FULL) or os.path.exists(DETECTOR_MODEL_SHORT)))
