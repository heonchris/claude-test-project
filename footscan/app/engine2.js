/* ══════════════════════════════════════════════════════════════════════
   footscan 측정 엔진 (브라우저용)

   파이썬으로 먼저 만들어 검증한 엔진을 그대로 옮긴 것입니다.
   영상처리는 cvlite.js 로 직접 구현해, 외부 라이브러리 없이 동작합니다.
     → 다운로드 0MB, 즉시 실행, 오프라인 동작, 사진이 폰 밖으로 안 나감

   원본 대응
     config.py → CFG          top/paper.py   → detectPaper
     imageio.py → loadImage   top/warp.py    → warpToA4
     top/segment.py → segmentFootTop          top/measure.py → measureTop
     side/reference.py → detectReference       side/segment.py → segmentFootSide
     side/measure.py → measureSide             crosscheck.py → crossCheck
     sizing.py → recommendSize
   ══════════════════════════════════════════════════════════════════════ */

const CFG = {
  A4_SHORT_MM: 210.0,
  A4_LONG_MM: 297.0,

  /* 원근을 편 뒤 1mm 를 몇 픽셀로 다룰지.
     파이썬(연구용)은 10 이지만, 휴대폰에서는 5 로도 정확도가 충분하고
     (1px = 0.2mm, 허용 오차 3mm) 처리 속도가 4배 빨라집니다. */
  PX_PER_MM: 5.0,

  RESIZE_LONG_EDGE_PX: 1600,
  BLUR_KERNEL: 5,

  // ── 상면: A4 검출 ──
  CANNY_SIGMA: 0.33,
  PAPER_EDGE_DILATE_R: 1,
  PAPER_STRAIGHTNESS_SAMPLE_RANGE: [0.2, 0.8],
  CONTOUR_TOP_N: 10,
  APPROX_EPS_RATIO: 0.02,
  PAPER_MIN_AREA_RATIO: 0.15,
  PAPER_ASPECT_TOLERANCE: 0.25,
  PAPER_STRAIGHTNESS_TOLERANCE: 0.03,

  // ── 상면: 발 분할 ──
  TOP_PAPER_SAMPLE_BAND_RATIO: 0.06,
  TOP_PAPER_SAMPLE_EXCLUDE_BOTTOM: 0.10,
  TOP_ADAPTIVE_BLOCK_MM: 15.0,
  TOP_ADAPTIVE_C: 12,
  TOP_COLOR_DIST_MIN: 18.0,
  /* 발가락 사이 틈을 메우는 정도.
     파이썬은 1.5mm 이지만 여기는 0.9mm 입니다.
     파이썬은 타원 커널, 여기는 속도를 위해 사각 커널을 쓰는데
     사각은 대각선 방향으로 40% 더 넓게 메워, 발가락 사이 골짜기를
     지워버립니다. 실험으로 0.9mm 에서 발가락 5개가 모두 잡혔습니다. */
  TOP_MORPH_CLOSE_MM: 0.9,
  TOP_MORPH_OPEN_MM: 0.9,      // 작은 얼룩을 지우는 정도
  TOP_MIN_BLOB_AREA_MM2: 2000.0,
  TOP_CONTOUR_SMOOTH_EPS_MM: 0.2,

  // ── 상면: 측정 ──
  BALL_WIDTH_RANGE: [0.60, 0.75],
  HEEL_WIDTH_RANGE: [0.12, 0.22],
  END_PROBE_RATIO: 0.06,
  TOE_REGION_RATIO: 0.18,
  TOE_PEAK_MIN_DISTANCE_MM: 8.0,
  TOE_PEAK_MIN_PROMINENCE_MM: 6.0,
  TOE_BASE_WIDTH_DROP_MM: 6.0,
  TOE_BASE_WIDTH_MAX_MM: 30.0,
  TOE_TYPE_ROMAN_TOLERANCE_MM: 2.0,
  HVA_HALLUX_EDGE_RANGE: [0.84, 0.96],
  HVA_MIN_EDGE_POINTS: 20,
  HVA_CALIB_SCALE: 1.0,
  HVA_CALIB_OFFSET_DEG: 0.0,

  // ── 측면: 기준 스케일 ──
  SIDE_PAPER_MIN_AREA_RATIO: 0.0005,
  SIDE_REF_EDGE_MIN_WIDTH_RATIO: 0.35,
  SIDE_REF_EDGE_MAX_TILT_DEG: 20.0,
  SIDE_REF_SEARCH_TOP_RATIO: 0.35,
  SIDE_REF_EDGE_MIN_Y_RATIO: 0.45,
  SIDE_BRIGHT_PERCENTILES: [99.0, 97.0, 95.0, 92.0, 88.0],
  SIDE_REJECT_TOP_TOUCHING: true,
  SIDE_REF_BAND_MAX_HEIGHT_RATIO: 0.55,
  SIDE_REF_INLIER_TOL_RATIO: 0.006,
  SIDE_BRIGHT_CLOSE_R: 3,

  // ── 측면: 발 분할 ──
  SIDE_BG_CLUSTERS: 3,
  SIDE_BG_MAX_SAMPLES: 6000,
  SIDE_BG_SAMPLE_MARGIN_RATIO: 0.08,
  SIDE_COLOR_DIST_FLOOR: 8.0,
  SIDE_COLOR_DIST_CEIL: 60.0,
  SIDE_COLOR_DIST_MIN: 22.0,
  SIDE_MASK_AREA_RANGE: [0.01, 0.55],
  SIDE_PAPER_CHROMA_TOL: 9.0,
  SIDE_PAPER_MIN_L_RATIO: 0.55,
  SIDE_MORPH_CLOSE_R: 5,
  SIDE_MORPH_OPEN_R: 2,
  SIDE_FOOT_MUST_TOUCH_FLOOR_MM: 12.0,
  SIDE_HEEL_PROBE_RATIO: 0.15,

  // ── 측면: 측정 ──
  CONTACT_HEIGHT_MM: 3.0,
  CONTACT_MIN_RUN_MM: 8.0,
  INSTEP_MEASURE_AT: 0.50,
  SIDE_MAX_CONTACT_RUNS: 2,
  SIDE_MIN_HEEL_CONTACT_RATIO: 0.08,
  SIDE_CONTACT_TOTAL_RATIO_RANGE: [0.35, 0.85],
  SIDE_QUALITY_PENALTY: 0.5,

  // ── 아치 등급 (초기 가정치 — 실측으로 재보정 필요) ──
  ARCH_CLEARANCE_LOW_MM: 8.0,
  ARCH_CLEARANCE_HIGH_MM: 18.0,
  ARCH_GAP_RATIO_LOW: 0.20,
  ARCH_GAP_RATIO_HIGH: 0.40,
  ARCH_HEIGHT_INDEX_HIGH: 0.37,

  // ── 교차 검증 ──
  CROSSCHECK_GOOD_MM: 3.0,
  CROSSCHECK_WARN_MM: 6.0,
  CROSSCHECK_CONF_GOOD: 1.0,
  CROSSCHECK_CONF_WARN: 0.7,
  CROSSCHECK_CONF_BAD: 0.3,
  LOW_CONFIDENCE_THRESHOLD: 0.7,

  // ── 사이즈 ──
  SHOE_ALLOWANCE_MM: { dress: 7.5, sneakers: 10.0, running: 12.5, hiking: 13.5, sandals: 5.0 },
  SIZE_ROUND_STEP_MM: 5.0,
  WIDTH_RATIO_NARROW: 0.375,
  WIDTH_RATIO_REGULAR: 0.395,
  WIDTH_RATIO_WIDE: 0.415,
  ASYMMETRY_WARN_MM: 4.0,

  /* ── 촬영 품질 검사 ──
     한계 시험에서 '실제로 측정이 깨지는' 값으로 맞췄습니다.
     ⚠ 합성 사진 기준이라 실제 사진으로 다시 맞춰야 합니다.
     ⚠ 이 검사는 측정을 막지 않고 알려주기만 합니다.
        기준이 검증 전이라, 멀쩡한 사진을 거부하는 쪽이 더 나쁩니다. */
  QUALITY_MIN_BRIGHTNESS: 85,
  QUALITY_MAX_BRIGHTNESS: 195,
  QUALITY_MIN_SHARPNESS: 5,
  QUALITY_MAX_SHARPNESS: 4000,
  /* 그림자는 사전 검사로 잡을 수 없습니다. 밝기 편차·조명 기울기 모두
     시험했지만 정상 사진과 구분되지 않았습니다. 대신 촬영 안내로 예방하고,
     측정 후 신뢰도(발바닥 점검·교차검증)로 잡습니다. */

  DISCLAIMER: '본 측정값은 참고용이며 의료적 진단이 아닙니다.',
};
let PPM = CFG.PX_PER_MM;
let WARP_W = Math.round(CFG.A4_SHORT_MM * PPM);
let WARP_H = Math.round(CFG.A4_LONG_MM * PPM);
const mm2r = (mm) => Math.max(1, Math.round(mm * PPM / 2));
/* 시험용 — 해상도를 바꿔가며 정확도/속도를 비교할 때 씁니다 */
window.__setPPM = (v) => { CFG.PX_PER_MM = v; PPM = v; WARP_W = Math.round(CFG.A4_SHORT_MM * v); WARP_H = Math.round(CFG.A4_LONG_MM * v); };

/* ── 에러 ─────────────────────────────────────────────────────────── */
class FootScanError extends Error {
  constructor(code, message, stage, hint) {
    super(`[${code}] ${message}`);
    this.code = code; this.userMessage = message; this.stage = stage || ''; this.hint = hint || '';
  }
}
const ERR = {
  paperNotFound: () => new FootScanError('PAPER_NOT_FOUND',
    '사진에서 A4 용지를 찾지 못했습니다.', 'A2 A4 검출',
    '종이 네 모서리가 모두 화면 안에 보이게, 조명을 켜고 다시 찍어 주세요. 카펫이 아닌 단단하고 평평한 바닥에 놓아야 합니다.'),
  footNotFound: (stage, detail, hint) => new FootScanError('FOOT_NOT_FOUND',
    '사진에서 발을 찾지 못했습니다.' + (detail ? ` (${detail})` : ''), stage || 'A4 발 분할',
    hint || '맨발 또는 어두운 색 양말로, 종이 위에 발 전체가 들어오게 딛고 다시 찍어 주세요. 흰 양말은 종이와 구분되지 않습니다.'),
  sideRefNotFound: (detail) => new FootScanError('SIDE_REF_NOT_FOUND',
    '옆면 사진에서 기준이 되는 A4 긴 변을 찾지 못했습니다.' + (detail ? ` (${detail})` : ''), 'B2 기준 스케일 검출',
    "① 발을 종이 긴 변의 '가운데'에 딛어 종이 양 끝이 가려지지 않게 해 주세요. ② 휴대폰을 바닥에서 10~15cm 높이로 낮추고 지면과 수직으로 세워 주세요. ③ 종이의 긴 변이 화면 가로로 꽉 차게 찍어 주세요."),
  imageReadFailed: () => new FootScanError('IMAGE_READ_FAILED',
    '사진을 열 수 없습니다.', '전처리',
    'JPG 또는 PNG 사진인지 확인해 주세요. 아이폰의 HEIC 형식은 지원하지 않습니다.'),
};

/* ── 작은 도우미 ──────────────────────────────────────────────────── */
const deg = (r) => r * 180 / Math.PI;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round1 = (v) => Math.round(v * 10) / 10;
const round4 = (v) => Math.round(v * 10000) / 10000;

/** 봉우리 찾기 — scipy.signal.find_peaks 와 같은 규칙 */
function findPeaks(y, { distance = 1, prominence = 0 } = {}) {
  const n = y.length, peaks = [];
  let i = 1;
  while (i < n - 1) {
    if (y[i - 1] < y[i]) {
      let j = i;
      while (j < n - 1 && y[j + 1] === y[i]) j++;
      if (y[j + 1] < y[i]) peaks.push(Math.floor((i + j) / 2));
      i = j + 1;
    } else i++;
  }
  if (!peaks.length) return { peaks: [], prominences: [] };
  const alive = peaks.map(() => true);
  if (distance > 1) {
    const order = peaks.map((_, k) => k).sort((a, b) => y[peaks[b]] - y[peaks[a]]);
    for (const oi of order) {
      if (!alive[oi]) continue;
      for (let k = 0; k < peaks.length; k++)
        if (k !== oi && alive[k] && Math.abs(peaks[k] - peaks[oi]) < distance) alive[k] = false;
    }
  }
  const kept = peaks.filter((_, k) => alive[k]);
  const out = [], proms = [];
  for (const p of kept) {
    const h = y[p];
    let lmin = h; for (let k = p - 1; k >= 0; k--) { if (y[k] > h) break; if (y[k] < lmin) lmin = y[k]; }
    let rmin = h; for (let k = p + 1; k < n; k++) { if (y[k] > h) break; if (y[k] < rmin) rmin = y[k]; }
    const prom = h - Math.max(lmin, rmin);
    if (prom >= prominence) { out.push(p); proms.push(prom); }
  }
  return { peaks: out, prominences: proms };
}

/** 점들의 주축 (PCA) — 2x2 공분산의 고유벡터 */
function principalAxis(xs, ys) {
  const n = xs.length;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
  mx /= n; my /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  sxx /= n; syy /= n; sxy /= n;
  const tr = sxx + syy, det = sxx * syy - sxy * sxy;
  const lam = tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - det));
  let vx, vy;
  if (Math.abs(sxy) > 1e-9) { vx = lam - syy; vy = sxy; }
  else if (sxx >= syy) { vx = 1; vy = 0; } else { vx = 0; vy = 1; }
  const L = Math.hypot(vx, vy) || 1;
  return { cx: mx, cy: my, vx: vx / L, vy: vy / L };
}
function fitLineLS(pts) {
  const a = principalAxis(pts.map(p => p[0]), pts.map(p => p[1]));
  return { vx: a.vx, vy: a.vy, x0: a.cx, y0: a.cy };
}

/* ══════════════════════════════════════════════════════════════════
   1. 사진 읽기
   ══════════════════════════════════════════════════════════════════ */
async function loadImageMat(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch (e) { try { bmp = await createImageBitmap(file); } catch (e2) { throw ERR.imageReadFailed(); } }
  const long = Math.max(bmp.width, bmp.height);
  const s = long > CFG.RESIZE_LONG_EDGE_PX ? CFG.RESIZE_LONG_EDGE_PX / long : 1;
  const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
  const cvs = document.createElement('canvas');
  cvs.width = w; cvs.height = h;
  const ctx = cvs.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const id = ctx.getImageData(0, 0, w, h);
  const out = CVL.img(w, h, 3), d = out.data, sd = id.data;
  for (let p = 0, i = 0, j = 0; p < w * h; p++, i += 4, j += 3) { d[j] = sd[i]; d[j + 1] = sd[i + 1]; d[j + 2] = sd[i + 2]; }
  return out;
}

function autoCanny(gray) {
  const med = CVL.median(gray.data, 7);
  return CVL.canny(gray, Math.max(0, (1 - CFG.CANNY_SIGMA) * med), Math.min(255, (1 + CFG.CANNY_SIGMA) * med));
}

/* ══════════════════════════════════════════════════════════════════
   2. 촬영 품질 검사
   ══════════════════════════════════════════════════════════════════ */
function checkPhotoQuality(m) {
  const gray = CVL.toGray(m);
  const { mean } = CVL.meanStd(gray.data);
  const sharp = CVL.laplacianVar(gray);
  const issues = [];
  if (mean < CFG.QUALITY_MIN_BRIGHTNESS) issues.push({ level: 'bad', text: '사진이 어둡습니다. 불을 켜고 다시 찍으면 훨씬 정확해집니다.' });
  else if (mean > CFG.QUALITY_MAX_BRIGHTNESS) issues.push({ level: 'bad', text: '사진이 너무 밝아 발과 종이가 구분되지 않을 수 있습니다.' });
  if (sharp < CFG.QUALITY_MIN_SHARPNESS) issues.push({ level: 'bad', text: '사진이 흔들렸습니다. 폰을 고정하고 다시 찍어 주세요.' });
  else if (sharp > CFG.QUALITY_MAX_SHARPNESS) issues.push({ level: 'warn', text: '어두운 곳에서 찍어 노이즈가 많습니다. 아치 값이 부정확할 수 있습니다.' });
  return { brightness: mean, sharpness: sharp, issues, ok: !issues.some(i => i.level === 'bad') };
}

/* ══════════════════════════════════════════════════════════════════
   3. 상면 — A4 검출
   ══════════════════════════════════════════════════════════════════ */
function orderCorners(pts) {
  let tl, tr, br, bl, minS = Infinity, maxS = -Infinity, minD = Infinity, maxD = -Infinity;
  for (const [x, y] of pts) {
    const s = x + y, d = y - x;
    if (s < minS) { minS = s; tl = [x, y]; }
    if (s > maxS) { maxS = s; br = [x, y]; }
    if (d < minD) { minD = d; tr = [x, y]; }
    if (d > maxD) { maxD = d; bl = [x, y]; }
  }
  return [tl, tr, br, bl];
}
function edgeLengths(q) {
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  return [(d(q[1], q[0]) + d(q[2], q[3])) / 2, (d(q[3], q[0]) + d(q[2], q[1])) / 2];
}
function straightnessError(cpts, quad) {
  if (cpts.length < 8) return 0;
  const [lo, hi] = CFG.PAPER_STRAIGHTNESS_SAMPLE_RANGE;
  const per = [[], [], [], []];
  for (const [px, py] of cpts) {
    let best = Infinity, bestE = -1, bestT = 0;
    for (let k = 0; k < 4; k++) {
      const A = quad[k], B = quad[(k + 1) % 4];
      const ux = B[0] - A[0], uy = B[1] - A[1], L2 = ux * ux + uy * uy;
      const t = L2 > 0 ? clamp(((px - A[0]) * ux + (py - A[1]) * uy) / L2, 0, 1) : 0;
      const d = Math.hypot(px - (A[0] + t * ux), py - (A[1] + t * uy));
      if (d < best) { best = d; bestE = k; bestT = t; }
    }
    if (bestT > lo && bestT < hi) per[bestE].push(best);
  }
  let worst = 0;
  for (let k = 0; k < 4; k++) {
    if (per[k].length < 3) continue;
    const L = Math.hypot(quad[(k + 1) % 4][0] - quad[k][0], quad[(k + 1) % 4][1] - quad[k][1]);
    if (L < 1e-6) continue;
    per[k].sort((a, b) => a - b);
    worst = Math.max(worst, per[k][Math.min(per[k].length - 1, Math.floor(per[k].length * 0.95))] / L);
  }
  return worst;
}
function detectPaper(m) {
  const warnings = [];
  const area = m.w * m.h;
  const gray = CVL.blur(CVL.toGray(m), CFG.BLUR_KERNEL);
  let edges = autoCanny(gray);
  edges = CVL.dilate(edges, CFG.PAPER_EDGE_DILATE_R);

  // 종이는 사진의 15% 이상을 차지해야 하므로, 그보다 작은 조각은 볼 필요가 없습니다
  const cnts = CVL.findContours(edges, CFG.PAPER_MIN_AREA_RATIO * area * 0.7)
    .map(c => ({ ...c, a: CVL.contourArea(c.pts) }))
    .sort((x, y) => y.a - x.a)
    .slice(0, CFG.CONTOUR_TOP_N);

  let best = null, bestErr = Infinity;
  const target = CFG.A4_LONG_MM / CFG.A4_SHORT_MM;
  for (const c of cnts) {
    const peri = CVL.arcLength(c.pts, true);
    const ap = CVL.approxPolyDP(c.pts, CFG.APPROX_EPS_RATIO * peri, true);
    if (ap.length !== 4) continue;
    if (!CVL.isConvex(ap)) continue;
    const a = CVL.contourArea(ap);
    if (a < CFG.PAPER_MIN_AREA_RATIO * area) continue;
    const quad = orderCorners(ap);
    const [ew, eh] = edgeLengths(quad);
    if (Math.min(ew, eh) < 1e-6) continue;
    const aspect = Math.max(ew, eh) / Math.min(ew, eh);
    const err = Math.abs(aspect - target) / target;
    if (err > CFG.PAPER_ASPECT_TOLERANCE) continue;
    if (err < bestErr) { bestErr = err; best = { quad, cpts: c.pts, aspect }; }
  }
  if (!best) throw ERR.paperNotFound();

  const bend = straightnessError(best.cpts, best.quad);
  if (bend > CFG.PAPER_STRAIGHTNESS_TOLERANCE) {
    warnings.push(`종이가 휘어 있는 것 같습니다(휘어짐 ${(bend * 100).toFixed(1)}%). 단단하고 평평한 바닥에서 다시 찍으면 더 정확합니다.`);
  }
  return { quad: best.quad, aspect: best.aspect, bend, warnings };
}

/* ══════════════════════════════════════════════════════════════════
   4. 상면 — 원근 펴기 (여기부터 1px = 0.2mm 고정)
   ══════════════════════════════════════════════════════════════════ */
function warpToA4(m, quad) {
  const [ew, eh] = edgeLengths(quad);
  const landscape = ew > eh;
  const ow = landscape ? WARP_H : WARP_W, oh = landscape ? WARP_W : WARP_H;
  const M = CVL.getPerspectiveTransform(quad, [[0, 0], [ow - 1, 0], [ow - 1, oh - 1], [0, oh - 1]]);
  const warped = CVL.warpPerspective(m, M, ow, oh);
  return landscape ? CVL.rotate90(warped) : warped;
}

/* ══════════════════════════════════════════════════════════════════
   5. 상면 — 발 분할
   ══════════════════════════════════════════════════════════════════ */
function segmentFootTop(warped) {
  const warnings = [];
  const { w, h } = warped;
  const lab = CVL.rgb2lab(CVL.blur3(warped));
  const d = lab.data;

  // 종이 색 추정 (가장자리 띠의 중앙값)
  const band = Math.max(4, Math.round(w * CFG.TOP_PAPER_SAMPLE_BAND_RATIO));
  const yEnd = Math.round(h * (1 - CFG.TOP_PAPER_SAMPLE_EXCLUDE_BOTTOM));
  const hists = [new Int32Array(256), new Int32Array(256), new Int32Array(256)];
  let cnt = 0;
  const add = (r, c) => { const i = (r * w + c) * 3; hists[0][d[i]]++; hists[1][d[i + 1]]++; hists[2][d[i + 2]]++; cnt++; };
  for (let r = 0; r < yEnd; r += 2) {
    for (let c = 0; c < band; c += 2) add(r, c);
    for (let c = w - band; c < w; c += 2) add(r, c);
  }
  for (let r = 0; r < band; r += 2) for (let c = 0; c < w; c += 2) add(r, c);
  const paper = hists.map(hi => { let a = 0; for (let v = 0; v < 256; v++) { a += hi[v]; if (a >= cnt / 2) return v; } return 200; });

  // 종이 색과의 거리
  const dist = CVL.img(w, h, 1), dd = dist.data;
  for (let p = 0, i = 0; p < w * h; p++, i += 3) {
    const dl = d[i] - paper[0], da = d[i + 1] - paper[1], db = d[i + 2] - paper[2];
    dd[p] = Math.sqrt(dl * dl + da * da + db * db);
  }
  const thr = Math.max(CVL.otsu(dd), CFG.TOP_COLOR_DIST_MIN);

  const rc = mm2r(CFG.TOP_MORPH_CLOSE_MM), ro = mm2r(CFG.TOP_MORPH_OPEN_MM);
  const build = (t) => CVL.fillHoles(CVL.morphOpen(CVL.morphClose(CVL.threshold(dist, t), rc), ro));

  let comp = CVL.largestComponent(build(thr));
  const minArea = CFG.TOP_MIN_BLOB_AREA_MM2 * PPM * PPM;

  if (comp.area < minArea) {
    warnings.push('일반 방식으로 발을 찾지 못해 보조 방식(적응형 이진화)으로 재시도했습니다.');
    const blockPx = Math.max(3, Math.round(CFG.TOP_ADAPTIVE_BLOCK_MM * PPM) | 1);
    const ad = CVL.adaptiveThresholdInv(CVL.toGray(warped), blockPx, CFG.TOP_ADAPTIVE_C);
    comp = CVL.largestComponent(CVL.fillHoles(CVL.morphOpen(CVL.morphClose(ad, rc), ro)));
  }
  if (comp.area < minArea) {
    throw ERR.footNotFound('A4 발 분할', '종이 위에서 발만 한 크기의 덩어리를 찾지 못했습니다');
  }

  // 윤곽 다듬기
  const cs = CVL.findContours(comp.mask);
  let mask = comp.mask;
  if (cs.length) {
    const big = cs.reduce((a, b) => (CVL.contourArea(b.pts) > CVL.contourArea(a.pts) ? b : a));
    const ap = CVL.approxPolyDP(big.pts, CFG.TOP_CONTOUR_SMOOTH_EPS_MM * PPM, true);
    mask = CVL.fillPoly(CVL.img(w, h, 1), ap, 255);
  }

  // 발이 종이 밖으로 나갔는지
  const md = mask.data;
  let L = false, R = false, T = false;
  for (let r = 0; r < h; r++) { if (md[r * w]) L = true; if (md[r * w + w - 1]) R = true; }
  for (let c = 0; c < w; c++) if (md[c]) T = true;
  const touch = []; if (L) touch.push('왼쪽'); if (R) touch.push('오른쪽'); if (T) touch.push('위쪽');
  if (touch.length) warnings.push(`발이 종이 ${touch.join('/')} 밖으로 나간 것 같습니다. 발 전체가 종이 안에 들어오게 다시 찍어 주세요. 측정값이 짧게 나올 수 있습니다.`);

  return { mask, warnings, threshold: thr };
}

/* ══════════════════════════════════════════════════════════════════
   6. 상면 — 측정
   ══════════════════════════════════════════════════════════════════ */
function maskPoints(m) {
  const xs = [], ys = [], d = m.data;
  for (let y = 0; y < m.h; y++) { const off = y * m.w; for (let x = 0; x < m.w; x++) if (d[off + x]) { xs.push(x); ys.push(y); } }
  return { xs, ys };
}
function rowSpans(m) {
  const spans = new Map(), d = m.data;
  for (let y = 0; y < m.h; y++) {
    const off = y * m.w; let a = -1, b = -1;
    for (let x = 0; x < m.w; x++) if (d[off + x]) { if (a < 0) a = x; b = x; }
    if (a >= 0) spans.set(y, [a, b]);
  }
  return spans;
}
function alignByPCA(mask) {
  const { xs, ys } = maskPoints(mask);
  if (xs.length < 10) throw ERR.footNotFound('A5 측정', '마스크가 너무 작습니다');
  const { cx, cy, vx, vy } = principalAxis(xs, ys);
  const angleDeg = deg(Math.atan2(-vx, vy));
  const diag = Math.round(Math.hypot(mask.w, mask.h)) + 8;
  const rot = CVL.rotateAbout(mask, angleDeg, cx, cy, diag, diag, diag / 2 - cx, diag / 2 - cy);
  return { mask: rot, angleDeg };
}
function orientHeelDown(mask) {
  const spans = rowSpans(mask);
  const rows = [...spans.keys()].sort((a, b) => a - b);
  const r0 = rows[0], r1 = rows[rows.length - 1];
  const probe = Math.max(1, Math.round((r1 - r0) * CFG.END_PROBE_RATIO));
  const wAt = (r) => { const s = spans.get(clamp(r, r0, r1)); return s ? s[1] - s[0] : 0; };
  if (wAt(r0 + probe) > wAt(r1 - probe)) return { mask: CVL.rotate180(mask), flipped: true };
  return { mask, flipped: false };
}
function toeProfile(mask, rHeel) {
  const d = mask.data, xs = [], hs = [];
  for (let c = 0; c < mask.w; c++) {
    let minR = -1;
    for (let r = 0; r < mask.h; r++) if (d[r * mask.w + c]) { minR = r; break; }
    if (minR >= 0) { xs.push(c); hs.push((rHeel - minR) / PPM); }
  }
  return { xs, hs };
}
function analyzeToes(mask, rHeel, rToe) {
  const lengthMm = (rHeel - rToe) / PPM;
  const { xs, hs } = toeProfile(mask, rHeel);
  if (xs.length < 5) return { toeType: 'roman', count: 0, toes: [] };

  let { peaks, prominences } = findPeaks(hs, {
    distance: Math.max(2, Math.round(CFG.TOE_PEAK_MIN_DISTANCE_MM * PPM)),
    prominence: CFG.TOE_PEAK_MIN_PROMINENCE_MM,
  });
  const cut = lengthMm * (1 - CFG.TOE_REGION_RATIO);
  const keep = peaks.map((_, i) => i).filter(i => hs[peaks[i]] >= cut);
  peaks = keep.map(i => peaks[i]); prominences = keep.map(i => prominences[i]);
  if (!peaks.length) return { toeType: 'roman', count: 0, toes: [] };
  if (peaks.length > 5) {
    const sel = prominences.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 5).map(x => x[1]).sort((a, b) => a - b);
    peaks = sel.map(i => peaks[i]); prominences = sel.map(i => prominences[i]);
  }

  // 밑동 폭은 옆 발가락 중간까지, 그리고 최대 폭까지만 (안 그러면 발 전체로 번집니다)
  const capPx = Math.round(CFG.TOE_BASE_WIDTH_MAX_MM * PPM / 2);
  const toes = peaks.map((p, k) => {
    const lvl = hs[p] - CFG.TOE_BASE_WIDTH_DROP_MM;
    const prev = k > 0 ? peaks[k - 1] : -1, next = k < peaks.length - 1 ? peaks[k + 1] : hs.length;
    const lLim = Math.max(prev >= 0 ? Math.floor((prev + p) / 2) : 0, p - capPx);
    const rLim = Math.min(next < hs.length ? Math.ceil((p + next) / 2) : hs.length - 1, p + capPx);
    let li = p; while (li > lLim && hs[li - 1] >= lvl) li--;
    let ri = p; while (ri < rLim && hs[ri + 1] >= lvl) ri++;
    return { x: xs[p], protrusionMm: hs[p], baseWidthMm: (xs[ri] - xs[li]) / PPM };
  });
  toes.sort((a, b) => a.x - b.x);
  if (toes.length < 2) { toes[0].isHallux = true; return { toeType: 'roman', count: toes.length, toes }; }

  const hi = toes[0].baseWidthMm >= toes[toes.length - 1].baseWidthMm ? 0 : toes.length - 1;
  const si = hi === 0 ? 1 : toes.length - 2;
  const diff = toes[hi].protrusionMm - toes[si].protrusionMm;
  const toeType = Math.abs(diff) < CFG.TOE_TYPE_ROMAN_TOLERANCE_MM ? 'roman' : (diff > 0 ? 'egyptian' : 'greek');
  toes.forEach((t, i) => { t.isHallux = (i === hi); });
  return { toeType, count: toes.length, toes };
}
function estimateHalluxValgus(spans, rHeel, rToe, medialIsLeft) {
  const L = rHeel - rToe;
  if (L <= 0) return null;
  const mx = (r) => { const s = spans.get(r); return medialIsLeft ? s[0] : s[1]; };
  const mp = (lo, hi) => {
    let best = null;
    const a = Math.round(rHeel - hi * L), b = Math.round(rHeel - lo * L);
    for (let r = Math.min(a, b); r <= Math.max(a, b); r++) {
      if (!spans.has(r)) continue;
      const x = mx(r);
      if (!best || (medialIsLeft ? x < best[0] : x > best[0])) best = [x, r];
    }
    return best;
  };
  const pH = mp(...CFG.HEEL_WIDTH_RANGE), pB = mp(...CFG.BALL_WIDTH_RANGE);
  if (!pH || !pB) return null;
  const vRef = [pB[0] - pH[0], pB[1] - pH[1]];
  const [lo, hi] = CFG.HVA_HALLUX_EDGE_RANGE;
  const pts = [];
  for (const [r] of spans) { const t = (rHeel - r) / L; if (t >= lo && t <= hi) pts.push([mx(r), r]); }
  if (pts.length < CFG.HVA_MIN_EDGE_POINTS) return null;
  const line = fitLineLS(pts);
  const ang = (v) => deg(Math.atan2(v[0], v[1]));
  let a = Math.abs(ang(vRef) - ang([line.vx, line.vy])) % 180;
  if (a > 90) a = 180 - a;
  return round1(a * CFG.HVA_CALIB_SCALE + CFG.HVA_CALIB_OFFSET_DEG);
}
function measureTop(maskIn) {
  const warnings = [];
  const aligned = alignByPCA(maskIn);
  const oriented = orientHeelDown(aligned.mask);
  const mask = oriented.mask;

  const spans = rowSpans(mask);
  const rows = [...spans.keys()].sort((a, b) => a - b);
  const rToe = rows[0], rHeel = rows[rows.length - 1];
  const L = rHeel - rToe;
  const footLengthMm = (L + 1) / PPM;

  const maxWidth = (lo, hi) => {
    let best = 0, row = rHeel, span = [0, 0];
    const a = Math.round(rHeel - hi * L), b = Math.round(rHeel - lo * L);
    for (let r = Math.min(a, b); r <= Math.max(a, b); r++) {
      const s = spans.get(r); if (!s) continue;
      if (s[1] - s[0] > best) { best = s[1] - s[0]; row = r; span = s; }
    }
    return { mm: (best + 1) / PPM, row, span };
  };
  const ball = maxWidth(...CFG.BALL_WIDTH_RANGE);
  const heel = maxWidth(...CFG.HEEL_WIDTH_RANGE);
  const widthRatio = footLengthMm > 0 ? ball.mm / footLengthMm : 0;

  const { toeType, count, toes } = analyzeToes(mask, rHeel, rToe);
  if (count < 4) warnings.push(`발가락을 ${count}개만 찾았습니다. 발가락 형태 판정이 부정확할 수 있습니다.`);

  let medialIsLeft = true;
  if (toes.length) {
    const h = toes.find(t => t.isHallux) || toes[0];
    const cx = ball.span[1] ? (ball.span[0] + ball.span[1]) / 2 : h.x;
    medialIsLeft = h.x < cx;
  }
  const hva = estimateHalluxValgus(spans, rHeel, rToe, medialIsLeft);

  return {
    measurement: {
      foot_length_mm: round1(footLengthMm),
      ball_width_mm: round1(ball.mm),
      heel_width_mm: round1(heel.mm),
      width_ratio: round4(widthRatio),
      toe_type: toeType,
      hallux_valgus_angle_deg: hva,
      toe_count_detected: count,
    },
    warnings,
    overlay: { mask, rToe, rHeel, ball, heel, toes, pcaAngle: aligned.angleDeg, flipped: oriented.flipped },
  };
}

/* ══════════════════════════════════════════════════════════════════
   7. 측면 — 기준 스케일 (A4 긴 변 = 자 + 바닥선)
   ══════════════════════════════════════════════════════════════════ */
function* brightMasks(gray, yStart) {
  const { w, h } = gray;
  const roi = [];
  for (let r = yStart; r < h; r++) for (let c = 0; c < w; c += 3) roi.push(gray.data[r * w + c]);
  const roiArr = Uint8ClampedArray.from(roi);
  const ts = [CVL.otsu(roiArr), ...CFG.SIDE_BRIGHT_PERCENTILES.map(p => CVL.percentile(roiArr, p))];
  for (const t of ts) {
    const m = CVL.img(w, h, 1), md = m.data, gd = gray.data;
    for (let r = yStart; r < h; r++) { const off = r * w; for (let c = 0; c < w; c++) md[off + c] = gd[off + c] >= t ? 255 : 0; }
    yield { t, mask: CVL.morphClose(m, CFG.SIDE_BRIGHT_CLOSE_R) };
  }
}
function bottomBoundaryPoints(mask, minArea, yStart) {
  const cc = CVL.connectedComponents(mask);
  const ok = new Uint8Array(cc.n);
  for (let i = 1; i < cc.n; i++) {
    const s = cc.stats[i];
    if (s.area < minArea) continue;
    if (CFG.SIDE_REJECT_TOP_TOUCHING && s.y0 <= yStart) continue;   // 벽은 위로 이어집니다
    ok[i] = 1;
  }
  const { w, h } = mask;
  const keep = CVL.img(w, h, 1), kd = keep.data;
  for (let i = 0; i < cc.labels.length; i++) if (ok[cc.labels[i]]) kd[i] = 255;
  const pts = [];
  for (let c = 0; c < w; c++) {
    for (let r = h - 1; r >= 0; r--) if (kd[r * w + c]) { pts.push([c, r]); break; }
  }
  return { pts, keepMask: keep };
}
function fitRobustLine(pts, tol) {
  let line = fitLineLS(pts);
  for (let i = 0; i < 2; i++) {
    const inl = pts.filter(([x, y]) => Math.abs((x - line.x0) * line.vy - (y - line.y0) * line.vx) <= tol);
    if (inl.length < 10) break;
    line = fitLineLS(inl);
  }
  return { line, inliers: pts.filter(([x, y]) => Math.abs((x - line.x0) * line.vy - (y - line.y0) * line.vx) <= tol) };
}
function paperColorLab(m, inliers) {
  const lab = CVL.rgb2lab(m), d = lab.data, { w, h } = lab;
  const samples = [], Ls = [];
  for (const [x, y] of inliers) {
    for (let r = Math.max(0, y - 16); r < Math.max(0, y - 3); r++) {
      if (x < 0 || x >= w || r >= h) continue;
      const i = (r * w + x) * 3;
      samples.push([d[i], d[i + 1], d[i + 2]]); Ls.push(d[i]);
    }
  }
  if (!samples.length) return [245, 128, 128];
  const t = CVL.otsu(Uint8ClampedArray.from(Ls));
  const bright = samples.filter(s => s[0] >= t);
  const use = bright.length >= 20 ? bright : samples;
  return [0, 1, 2].map(ch => { const a = use.map(s => s[ch]).sort((x, y) => x - y); return a[a.length >> 1]; });
}
function detectReference(m) {
  const warnings = [];
  const { w, h } = m;
  const yStart = Math.round(h * CFG.SIDE_REF_SEARCH_TOP_RATIO);
  const minArea = CFG.SIDE_PAPER_MIN_AREA_RATIO * h * w;
  const tol = CFG.SIDE_REF_INLIER_TOL_RATIO * w;
  const gray = CVL.blur(CVL.toGray(m), CFG.BLUR_KERNEL);

  let found = null; const tried = [];
  for (const { t, mask } of brightMasks(gray, yStart)) {
    const bb = bottomBoundaryPoints(mask, minArea, yStart);
    if (bb.pts.length < 20) { tried.push(`thr=${t}:점부족`); continue; }
    const { line, inliers } = fitRobustLine(bb.pts, tol);
    if (inliers.length < 20) { tried.push(`thr=${t}:직선없음`); continue; }
    let tilt = deg(Math.atan2(line.vy, line.vx));
    if (tilt > 90) tilt -= 180; if (tilt < -90) tilt += 180;
    if (Math.abs(tilt) > CFG.SIDE_REF_EDGE_MAX_TILT_DEG) { tried.push(`thr=${t}:기울기${tilt.toFixed(0)}도`); continue; }
    const xl = Math.min(...inliers.map(p => p[0])), xr = Math.max(...inliers.map(p => p[0]));
    const slope = Math.abs(line.vx) > 1e-6 ? line.vy / line.vx : 0;
    const segLen = Math.hypot(xr - xl, (xr - xl) * slope);
    if (segLen < CFG.SIDE_REF_EDGE_MIN_WIDTH_RATIO * w) { tried.push(`thr=${t}:너무짧음`); continue; }
    const yMid = line.y0 + ((xl + xr) / 2 - line.x0) * slope;
    if (yMid < CFG.SIDE_REF_EDGE_MIN_Y_RATIO * h) { tried.push(`thr=${t}:위치가너무높음`); continue; }
    const kd = bb.keepMask.data;
    let yMin = h, yMax = -1;
    for (let r = 0; r < h; r++) { const off = r * w; for (let c = 0; c < w; c++) if (kd[off + c]) { if (r < yMin) yMin = r; if (r > yMax) yMax = r; break; } }
    const bandH = yMax >= 0 ? yMax - yMin + 1 : 0;
    if (bandH > CFG.SIDE_REF_BAND_MAX_HEIGHT_RATIO * segLen) { tried.push(`thr=${t}:띠가너무두꺼움`); continue; }
    found = { t, line, inliers, segLen, tilt, xl, xr, slope };
    break;
  }
  if (!found) throw ERR.sideRefNotFound(tried.slice(0, 4).join(' / '));

  const pxPerMm = found.segLen / CFG.A4_LONG_MM;
  const paperLab = paperColorLab(m, found.inliers);

  // 기준 변이 수평이 되도록 회전
  const rot = CVL.rotateAbout(m, found.tilt, w / 2, h / 2, w, h, 0, 0);
  const a = -found.tilt * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const tf = (x, y) => {
    const px = x - w / 2, py = y - h / 2;
    return [ca * px - sa * py + w / 2, sa * px + ca * py + h / 2];
  };
  const p1 = tf(found.xl, found.line.y0 + (found.xl - found.line.x0) * found.slope);
  const p2 = tf(found.xr, found.line.y0 + (found.xr - found.line.x0) * found.slope);
  const floorY = (p1[1] + p2[1]) / 2;

  if (Math.abs(found.tilt) > CFG.SIDE_REF_EDGE_MAX_TILT_DEG * 0.5) {
    warnings.push(`휴대폰이 ${Math.abs(found.tilt).toFixed(0)}도 기울어져 있었습니다. 지면과 수직으로 세워서 찍으면 아치 측정이 더 정확합니다.`);
  }
  return { pxPerMm, floorY, xLeft: Math.min(p1[0], p2[0]), xRight: Math.max(p1[0], p2[0]), rotationDeg: found.tilt, image: rot, paperLab, warnings };
}

/* ══════════════════════════════════════════════════════════════════
   8. 측면 — 발 분할
   ══════════════════════════════════════════════════════════════════ */
function backgroundClusters(lab, floorY) {
  const { w, h, data } = lab;
  const m = Math.max(4, Math.round(w * CFG.SIDE_BG_SAMPLE_MARGIN_RATIO));
  const yEnd = Math.min(h, Math.round(floorY) + 1);
  const pts = [];
  const step = Math.max(1, Math.round(Math.sqrt(yEnd * 2 * m / CFG.SIDE_BG_MAX_SAMPLES)));
  for (let r = 0; r < yEnd; r += step) {
    for (let c = 0; c < m; c += step) { const i = (r * w + c) * 3; pts.push([data[i], data[i + 1], data[i + 2]]); }
    for (let c = w - m; c < w; c += step) { const i = (r * w + c) * 3; pts.push([data[i], data[i + 1], data[i + 2]]); }
  }
  return CVL.kmeans(pts, CFG.SIDE_BG_CLUSTERS);
}
function largestTouchingFloor(mask, floorY, pxPerMm) {
  const band = Math.max(2, Math.round(CFG.SIDE_FOOT_MUST_TOUCH_FLOOR_MM * pxPerMm));
  const y0 = Math.max(0, Math.round(floorY) - band), y1 = Math.min(mask.h, Math.round(floorY) + 2);
  const cc = CVL.connectedComponents(mask);
  const touch = new Uint8Array(cc.n);
  for (let r = y0; r < y1; r++) { const off = r * mask.w; for (let c = 0; c < mask.w; c++) { const l = cc.labels[off + c]; if (l) touch[l] = 1; } }
  let bi = -1, ba = 0;
  for (let i = 1; i < cc.n; i++) if (touch[i] && cc.stats[i].area > ba) { ba = cc.stats[i].area; bi = i; }
  const out = CVL.img(mask.w, mask.h, 1);
  if (bi < 0) return out;
  for (let i = 0; i < out.data.length; i++) out.data[i] = cc.labels[i] === bi ? 255 : 0;
  return out;
}
function segmentFootSide(ref) {
  const warnings = [];
  const img0 = ref.image, { w, h } = img0;
  const lab = CVL.rgb2lab(CVL.blur3(img0)), d = lab.data;

  const centers = backgroundClusters(lab, ref.floorY);
  centers.push(ref.paperLab.map(Number));            // 종이도 배경입니다

  const npx = w * h;
  const dist = new Float32Array(npx), ignore = new Uint8Array(npx);
  const pl = ref.paperLab, tol2 = CFG.SIDE_PAPER_CHROMA_TOL ** 2, minL = CFG.SIDE_PAPER_MIN_L_RATIO * pl[0];
  const floorRow = Math.round(ref.floorY) + 1;
  for (let p = 0, i = 0; p < npx; p++, i += 3) {
    const L = d[i], A = d[i + 1], B = d[i + 2];
    let best = Infinity;
    for (const c of centers) { const a = L - c[0], b = A - c[1], e = B - c[2]; const v = a * a + b * b + e * e; if (v < best) best = v; }
    dist[p] = Math.sqrt(best);
    const ca = A - pl[1], cb = B - pl[2];
    // 종이(그림자 진 것 포함)는 색감만으로 판정합니다 — 그림자는 밝기만 바꾸기 때문
    if ((ca * ca + cb * cb < tol2 && L > minL) || ((p / w) | 0) >= floorRow) ignore[p] = 1;
  }

  const dU8 = CVL.img(w, h, 1);
  for (let p = 0; p < npx; p++) dU8.data[p] = ignore[p] ? 0 : Math.min(255, dist[p]);
  const autoT = clamp(CVL.otsu(dU8.data), CFG.SIDE_COLOR_DIST_FLOOR, CFG.SIDE_COLOR_DIST_CEIL);

  const build = (t) => {
    const m = CVL.img(w, h, 1);
    for (let p = 0; p < npx; p++) m.data[p] = (!ignore[p] && dist[p] >= t) ? 255 : 0;
    for (let r = floorRow; r < h; r++) m.data.fill(0, r * w, r * w + w);
    const cleaned = CVL.fillHoles(CVL.morphOpen(CVL.morphClose(m, CFG.SIDE_MORPH_CLOSE_R), CFG.SIDE_MORPH_OPEN_R));
    return largestTouchingFloor(cleaned, ref.floorY, ref.pxPerMm);
  };

  let mask = build(autoT);
  const [lo, hi] = CFG.SIDE_MASK_AREA_RANGE;
  let ratio = CVL.countNonZero(mask) / npx;
  if (ratio < lo || ratio > hi) {
    warnings.push('자동 임계값으로 발을 찾지 못해 고정 임계값으로 재시도했습니다.');
    mask = build(CFG.SIDE_COLOR_DIST_MIN);
    ratio = CVL.countNonZero(mask) / npx;
  }
  if (ratio < lo || ratio > hi) {
    throw ERR.footNotFound('B3 측면 발 분할',
      `발로 볼 만한 덩어리를 찾지 못했습니다(면적 ${(ratio * 100).toFixed(1)}%)`,
      '발 뒤에 어두운 색 수건이나 종이를 놓고, 발 전체가 화면에 들어오게 다시 찍어 주세요.');
  }
  return { mask, warnings };
}

/* ══════════════════════════════════════════════════════════════════
   9. 측면 — 측정
   ══════════════════════════════════════════════════════════════════ */
function boundaries(mask, floorY, ppm) {
  const d = mask.data, { w, h } = mask;
  const xs = [], bot = [], top = [];
  for (let c = 0; c < w; c++) {
    let minR = -1, maxR = -1;
    for (let r = 0; r < h; r++) if (d[r * w + c]) { if (minR < 0) minR = r; maxR = r; }
    if (minR < 0) continue;
    xs.push(c); bot.push((floorY - maxR) / ppm); top.push((floorY - minR) / ppm);
  }
  return { xs, bot, top };
}
function runsOf(flags, minLen) {
  const out = []; let s = null;
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] && s === null) s = i;
    else if (!flags[i] && s !== null) { if (i - s >= minLen) out.push([s, i - 1]); s = null; }
  }
  if (s !== null && flags.length - s >= minLen) out.push([s, flags.length - 1]);
  return out;
}
function classifyArch(clr, gap) {
  if (clr < CFG.ARCH_CLEARANCE_LOW_MM || gap < CFG.ARCH_GAP_RATIO_LOW) return 'low';
  if (clr > CFG.ARCH_CLEARANCE_HIGH_MM || gap > CFG.ARCH_GAP_RATIO_HIGH) return 'high';
  return 'normal';
}
/** 발바닥이 상식적인 모양으로 잡혔는지 스스로 점검 (길이 교차검증이 못 잡는 오류를 잡습니다) */
function checkSolePlausibility(runs, xs, ppm, footLengthMm) {
  const warnings = []; let quality = 1;
  if (footLengthMm <= 0) return { quality, warnings };
  if (runs.length > CFG.SIDE_MAX_CONTACT_RUNS) {
    quality *= CFG.SIDE_QUALITY_PENALTY;
    warnings.push(`발바닥이 바닥에 닿은 부분이 ${runs.length}조각으로 잘게 나뉘었습니다. 발 아랫면을 제대로 못 잡았을 가능성이 큽니다. 더 밝은 곳에서 다시 찍어 주세요.`);
  }
  if (runs.length) {
    const heelMm = (xs[runs[0][1]] - xs[runs[0][0]]) / ppm;
    if (heelMm / footLengthMm < CFG.SIDE_MIN_HEEL_CONTACT_RATIO) {
      quality *= CFG.SIDE_QUALITY_PENALTY;
      warnings.push(`뒤꿈치가 바닥에 닿은 부분이 ${heelMm.toFixed(0)}mm 밖에 안 됩니다(보통 발 길이의 20% 안팎). 체중을 실어 똑바로 서고, 더 밝은 곳에서 다시 찍어 주세요.`);
    }
    let total = 0; for (const [a, b] of runs) total += (xs[b] - xs[a]) / ppm;
    const [lo, hi] = CFG.SIDE_CONTACT_TOTAL_RATIO_RANGE, ratio = total / footLengthMm;
    if (ratio < lo || ratio > hi) {
      quality *= CFG.SIDE_QUALITY_PENALTY;
      warnings.push(`바닥에 닿은 부분이 발 길이의 ${(ratio * 100).toFixed(0)}% 입니다(정상 ${lo * 100}~${hi * 100}%). 아치 값을 믿기 어렵습니다.`);
    }
  }
  return { quality: clamp(quality, 0, 1), warnings };
}
function measureSide(maskIn, ref, footLengthTopMm) {
  const warnings = [];
  const ppm = ref.pxPerMm;
  let mask = maskIn, b = boundaries(mask, ref.floorY, ppm);
  if (b.xs.length < 20) throw ERR.footNotFound('B4 측면 측정', '발 마스크가 너무 작습니다');

  const probe = Math.max(3, Math.round(b.xs.length * CFG.SIDE_HEEL_PROBE_RATIO));
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  let flipped = false;
  if (mean(b.top.slice(0, probe)) < mean(b.top.slice(-probe))) {
    mask = CVL.flipH(mask); flipped = true;
    b = boundaries(mask, ref.floorY, ppm);
  }

  const x0 = Math.min(...b.xs), x1 = Math.max(...b.xs);
  const footLengthSideMm = (x1 - x0 + 1) / ppm;
  const lengthForRatio = footLengthTopMm || footLengthSideMm;

  const contact = b.bot.map(v => v < CFG.CONTACT_HEIGHT_MM);
  const runs = runsOf(contact, Math.max(2, Math.round(CFG.CONTACT_MIN_RUN_MM * ppm)));
  let heelEnd = 0, foreStart = 0;
  if (runs.length >= 2) { heelEnd = runs[0][1]; foreStart = runs[runs.length - 1][0]; }
  else if (runs.length === 1) { heelEnd = foreStart = runs[0][1]; warnings.push('발바닥이 거의 전부 바닥에 닿아 있습니다. 아치가 매우 낮게 측정되었습니다.'); }
  else warnings.push('바닥에 닿은 부분을 찾지 못했습니다. 체중을 실어 똑바로 선 상태로 다시 찍어 주세요.');

  const gapMm = Math.max(0, (b.xs[foreStart] - b.xs[heelEnd]) / ppm);
  const gapRatio = lengthForRatio > 0 ? gapMm / lengthForRatio : 0;
  let clearance = 0, apexI = heelEnd;
  if (foreStart > heelEnd) {
    let best = -Infinity;
    for (let i = heelEnd; i <= foreStart; i++) if (b.bot[i] > best) { best = b.bot[i]; apexI = i; }
    clearance = best;
  }
  const midX = x0 + CFG.INSTEP_MEASURE_AT * (x1 - x0);
  let midI = 0, bd = Infinity;
  for (let i = 0; i < b.xs.length; i++) { const dd = Math.abs(b.xs[i] - midX); if (dd < bd) { bd = dd; midI = i; } }
  const instep = b.top[midI];
  const ahi = lengthForRatio > 0 ? instep / lengthForRatio : 0;
  const grade = classifyArch(clearance, gapRatio);
  const pl = checkSolePlausibility(runs, b.xs, ppm, footLengthSideMm);
  warnings.push(...pl.warnings);

  return {
    measurement: {
      foot_length_side_mm: round1(footLengthSideMm),
      arch_clearance_mm: round1(clearance),
      arch_gap_length_mm: round1(gapMm),
      arch_gap_ratio: round4(gapRatio),
      instep_height_mm: round1(instep),
      arch_height_index: round4(ahi),
      arch_grade: grade,
      cross_check_delta_mm: round1(footLengthTopMm ? Math.abs(lengthForRatio - footLengthSideMm) : 0),
    },
    warnings, quality: pl.quality,
    overlay: { mask, flipped, runs, xs: b.xs, apexI, archClearanceMm: clearance, midI, instepHeightMm: instep, x0, x1, floorY: ref.floorY, ppm },
  };
}

/* ══════════════════════════════════════════════════════════════════
   10. 교차 검증 · 사이즈
   ══════════════════════════════════════════════════════════════════ */
function crossCheck(topMm, sideMm) {
  const delta = Math.abs(topMm - sideMm), warnings = [];
  let conf;
  if (delta <= CFG.CROSSCHECK_GOOD_MM) conf = CFG.CROSSCHECK_CONF_GOOD;
  else if (delta <= CFG.CROSSCHECK_WARN_MM) { conf = CFG.CROSSCHECK_CONF_WARN; warnings.push(`위/옆 사진의 발 길이가 ${delta.toFixed(1)}mm 차이 납니다. 아치 값은 참고만 해 주세요.`); }
  else { conf = CFG.CROSSCHECK_CONF_BAD; warnings.push(`위/옆 사진의 발 길이가 ${delta.toFixed(1)}mm 나 차이 납니다. 옆면을 다시 찍어 주세요. 휴대폰을 종이 긴 변과 수직으로 세우는 것이 가장 중요합니다.`); }
  return { confidence: conf, warnings };
}

/* US/EU/UK 는 계산하지 않고 표에서 찾기만 합니다.
   브랜드마다 기준이 달라 공식으로 만들면 그럴듯하지만 틀린 값이 나옵니다. */
const SIZE_TABLE = {
  215: { us_men: null, us_women: 4.5, uk: 3.0, eu: 34.5 }, 220: { us_men: 4.0, us_women: 5.0, uk: 3.5, eu: 35.0 },
  225: { us_men: 4.5, us_women: 5.5, uk: 4.0, eu: 36.0 }, 230: { us_men: 5.0, us_women: 6.0, uk: 4.5, eu: 36.5 },
  235: { us_men: 5.5, us_women: 6.5, uk: 5.0, eu: 37.0 }, 240: { us_men: 6.0, us_women: 7.0, uk: 5.5, eu: 38.0 },
  245: { us_men: 6.5, us_women: 7.5, uk: 6.0, eu: 38.5 }, 250: { us_men: 7.0, us_women: 8.0, uk: 6.5, eu: 39.5 },
  255: { us_men: 7.5, us_women: 8.5, uk: 7.0, eu: 40.0 }, 260: { us_men: 8.0, us_women: 9.0, uk: 7.5, eu: 41.0 },
  265: { us_men: 8.5, us_women: 9.5, uk: 8.0, eu: 42.0 }, 270: { us_men: 9.0, us_women: 10.0, uk: 8.5, eu: 42.5 },
  275: { us_men: 9.5, us_women: 10.5, uk: 9.0, eu: 43.0 }, 280: { us_men: 10.0, us_women: 11.0, uk: 9.5, eu: 44.0 },
  285: { us_men: 10.5, us_women: 11.5, uk: 10.0, eu: 44.5 }, 290: { us_men: 11.0, us_women: 12.0, uk: 10.5, eu: 45.0 },
  295: { us_men: 11.5, us_women: null, uk: 11.0, eu: 45.5 }, 300: { us_men: 12.0, us_women: null, uk: 11.5, eu: 46.0 },
};
const SIZE_TABLE_VERIFIED = false;
const WIDTH_LABELS = { narrow: '좁은 편 (narrow)', regular: '보통 (regular / D)', wide: '넓은 편 (wide / 2E)', extra_wide: '매우 넓은 편 (extra wide / 4E)' };
const toKrJpMm = (len, allow) => Math.round((len + allow) / CFG.SIZE_ROUND_STEP_MM) * CFG.SIZE_ROUND_STEP_MM;
function widthGrade(r) {
  if (r < CFG.WIDTH_RATIO_NARROW) return 'narrow';
  if (r < CFG.WIDTH_RATIO_REGULAR) return 'regular';
  if (r < CFG.WIDTH_RATIO_WIDE) return 'wide';
  return 'extra_wide';
}
function recommendSize(top, side, basedOn, asym) {
  const options = Object.entries(CFG.SHOE_ALLOWANCE_MM).map(([shoe, allow]) => {
    const kr = toKrJpMm(top.foot_length_mm, allow), row = SIZE_TABLE[kr] || {};
    return {
      shoe_type: shoe, allowance_mm: allow, inner_length_mm: round1(top.foot_length_mm + allow), kr_jp_mm: kr,
      us_men: row.us_men ?? null, us_women: row.us_women ?? null, eu: row.eu ?? null, uk: row.uk ?? null,
    };
  });
  const grade = widthGrade(top.width_ratio);
  const notes = ["발볼 '둘레'를 잰 것이 아니라 '너비'로 추정한 값입니다. 정확한 폭 등급은 줄자로 발볼 둘레를 재서 입력해 주세요."];
  if (!SIZE_TABLE_VERIFIED) notes.push('US/EU/UK 표기는 아직 검증되지 않은 대응표를 쓴 참고값입니다. 브랜드마다 반 사이즈씩 다를 수 있습니다.');
  if (side) {
    if (side.arch_height_index > CFG.ARCH_HEIGHT_INDEX_HIGH) notes.push('발등이 높은 편으로 측정되었습니다. 끈 여유가 있거나 볼륨이 큰 모델을 참고해 보세요.');
    if (side.arch_grade === 'low') notes.push('아치가 낮은 편으로 측정되었습니다. 아치 서포트가 있는 안정화 계열을 참고해 보세요.');
    else if (side.arch_grade === 'high') notes.push('아치가 높은 편으로 측정되었습니다. 쿠셔닝 위주 모델을 참고해 보세요.');
  }
  if (asym != null && asym >= CFG.ASYMMETRY_WARN_MM) notes.push(`좌우 발 길이가 ${asym.toFixed(1)}mm 차이 납니다. 큰 발 기준으로 사이즈를 잡았습니다.`);
  notes.push('저녁에는 발이 부어 아침보다 크게 측정됩니다. 신발은 오후~저녁 기준으로 고르는 것이 편합니다.');
  return { based_on_foot: basedOn, based_on_length_mm: top.foot_length_mm, options, width_grade: grade, width_grade_label: WIDTH_LABELS[grade] + ' · 추정값', notes };
}

/* ══════════════════════════════════════════════════════════════════
   11. 확인용 사진 (측정선을 그려 눈으로 검증할 수 있게)
   ══════════════════════════════════════════════════════════════════ */
const CSS = { foot: '#0aa60a', measure: '#1e6eff', floor: '#e02626', contact: '#d000d0', arch: '#c98a00', hallux: '#e03b3b' };
function drawLabel(ctx, text, x, y, color, size = 15, align = 'left') {
  ctx.save();
  ctx.font = `700 ${size}px -apple-system, BlinkMacSystemFont, "Noto Sans KR", "Malgun Gothic", sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size * 0.32); ctx.strokeStyle = 'rgba(255,255,255,.92)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
  ctx.restore();
}
function imgToCanvas(m, x0, y0, cw, ch, maxLong) {
  const scale = Math.min(1, maxLong / Math.max(cw, ch));
  const W = Math.max(1, Math.round(cw * scale)), H = Math.max(1, Math.round(ch * scale));
  const cvs = document.createElement('canvas'); cvs.width = W; cvs.height = H;
  const ctx = cvs.getContext('2d');
  const id = ctx.createImageData(W, H);
  const s = m.data, c = m.c;
  for (let y = 0; y < H; y++) {
    const sy = Math.min(m.h - 1, y0 + Math.floor(y / scale));
    for (let x = 0; x < W; x++) {
      const sx = Math.min(m.w - 1, x0 + Math.floor(x / scale));
      const si = (sy * m.w + sx) * c, di = (y * W + x) * 4;
      if (c === 1) { id.data[di] = id.data[di + 1] = id.data[di + 2] = s[si]; }
      else { id.data[di] = s[si]; id.data[di + 1] = s[si + 1]; id.data[di + 2] = s[si + 2]; }
      id.data[di + 3] = 255;
    }
  }
  ctx.putImageData(id, 0, 0);
  return { cvs, ctx, scale, x0, y0 };
}
function drawTopOverlay(ov, meas) {
  const { mask, rToe, rHeel, ball, heel, toes } = ov;
  const pad = Math.round(14 * PPM);
  const allX = toes.map(t => t.x).concat([ball.span[0], ball.span[1], heel.span[0], heel.span[1]]);
  const x0 = Math.max(0, Math.min(...allX) - pad), x1 = Math.min(mask.w - 1, Math.max(...allX) + pad);
  const y0 = Math.max(0, rToe - pad), y1 = Math.min(mask.h - 1, rHeel + pad);

  // 배경(연회색) + 발(살구색) 이미지를 만든 뒤 그 위에 선을 그립니다
  const vis = CVL.img(mask.w, mask.h, 3);
  const vd = vis.data, md = mask.data;
  for (let p = 0, i = 0; p < md.length; p++, i += 3) {
    if (md[p]) { vd[i] = 214; vd[i + 1] = 186; vd[i + 2] = 160; }
    else { vd[i] = 245; vd[i + 1] = 245; vd[i + 2] = 248; }
  }
  const { cvs, ctx, scale } = imgToCanvas(vis, x0, y0, x1 - x0, y1 - y0, 700);
  const X = (x) => (x - x0) * scale, Y = (y) => (y - y0) * scale;

  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = CSS.foot; ctx.lineWidth = Math.max(2, 3 * scale * 2);
  for (const c of CVL.findContours(mask)) {
    ctx.beginPath();
    c.pts.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)));
    ctx.closePath(); ctx.stroke();
  }
  const cx = (ball.span[0] + ball.span[1]) / 2 || mask.w / 2;
  ctx.strokeStyle = CSS.measure; ctx.lineWidth = Math.max(2, 2.6);
  const seg = (ax, ay, bx, by) => { ctx.beginPath(); ctx.moveTo(X(ax), Y(ay)); ctx.lineTo(X(bx), Y(by)); ctx.stroke(); };
  seg(cx, rToe, cx, rHeel);
  seg(cx - 12 * PPM, rToe, cx + 12 * PPM, rToe);
  seg(cx - 12 * PPM, rHeel, cx + 12 * PPM, rHeel);
  ctx.lineWidth = Math.max(2, 3.4);
  seg(ball.span[0], ball.row, ball.span[1], ball.row);
  seg(heel.span[0], heel.row, heel.span[1], heel.row);
  for (const t of toes) {
    ctx.beginPath();
    ctx.arc(X(t.x), Y(rHeel - t.protrusionMm * PPM), 6, 0, 7);
    ctx.fillStyle = t.isHallux ? CSS.hallux : CSS.arch; ctx.fill();
  }
  drawLabel(ctx, `길이 ${meas.foot_length_mm.toFixed(1)}mm`, X(cx) + 9, (Y(rToe) + Y(rHeel)) / 2, CSS.measure, 16);
  drawLabel(ctx, `발볼 ${meas.ball_width_mm.toFixed(1)}mm`, X(ball.span[1]) - 5, Y(ball.row) - 13, CSS.measure, 14, 'right');
  drawLabel(ctx, `뒤꿈치 ${meas.heel_width_mm.toFixed(1)}mm`, X(heel.span[1]) - 5, Y(heel.row) - 13, CSS.measure, 14, 'right');
  const hx = toes.find(t => t.isHallux);
  if (hx) drawLabel(ctx, '엄지', X(hx.x), Y(rHeel - hx.protrusionMm * PPM) - 20, CSS.hallux, 14, 'center');
  return cvs.toDataURL('image/jpeg', 0.78);
}
function drawSideOverlay(ref, ov, meas) {
  const base = ov.flipped ? CVL.flipH(ref.image) : ref.image;
  const fy = Math.round(ov.floorY);
  const ix = ov.xs[ov.midI], iy = Math.round(ov.floorY - ov.instepHeightMm * ov.ppm);
  let ax = null, ay = null;
  if (ov.archClearanceMm > 0) { ax = ov.xs[ov.apexI]; ay = Math.round(ov.floorY - ov.archClearanceMm * ov.ppm); }

  const padX = Math.round(20 * ov.ppm), padTop = Math.round(30 * ov.ppm), padBot = Math.round(14 * ov.ppm);
  const x0 = Math.max(0, ov.x0 - padX), x1 = Math.min(base.w - 1, ov.x1 + padX);
  const y0 = Math.max(0, Math.min(iy, ay === null ? iy : ay) - padTop), y1 = Math.min(base.h - 1, fy + padBot);
  const { cvs, ctx, scale } = imgToCanvas(base, x0, y0, x1 - x0, y1 - y0, 700);
  const X = (x) => (x - x0) * scale, Y = (y) => (y - y0) * scale;

  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = CSS.foot; ctx.lineWidth = 2.2;
  for (const c of CVL.findContours(ov.mask)) {
    ctx.beginPath();
    c.pts.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)));
    ctx.closePath(); ctx.stroke();
  }
  ctx.strokeStyle = CSS.floor; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(0, Y(fy)); ctx.lineTo(cvs.width, Y(fy)); ctx.stroke();
  ctx.strokeStyle = CSS.contact; ctx.lineWidth = 6;
  for (const [a, b] of ov.runs) { ctx.beginPath(); ctx.moveTo(X(ov.xs[a]), Y(fy) - 4); ctx.lineTo(X(ov.xs[b]), Y(fy) - 4); ctx.stroke(); }
  if (ax !== null) {
    ctx.strokeStyle = CSS.arch; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(X(ax), Y(fy)); ctx.lineTo(X(ax), Y(ay)); ctx.stroke();
    ctx.beginPath(); ctx.arc(X(ax), Y(ay), 5, 0, 7); ctx.fillStyle = CSS.arch; ctx.fill();
  }
  ctx.strokeStyle = CSS.measure; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(X(ix), Y(fy)); ctx.lineTo(X(ix), Y(iy)); ctx.stroke();
  ctx.beginPath(); ctx.arc(X(ix), Y(iy), 5, 0, 7); ctx.fillStyle = CSS.measure; ctx.fill();

  drawLabel(ctx, '바닥선', 6, Y(fy) - 11, CSS.floor, 13);
  if (ov.runs.length) drawLabel(ctx, '바닥에 닿은 구간', X(ov.xs[ov.runs[0][0]]) + 3, Y(fy) + 13, CSS.contact, 12);
  if (ax !== null) drawLabel(ctx, `아치 ${meas.arch_clearance_mm.toFixed(1)}mm`, X(ax) + 7, Y(ay) - 6, CSS.arch, 14);
  drawLabel(ctx, `발등 ${meas.instep_height_mm.toFixed(1)}mm`, X(ix) + 7, Y(iy) + 3, CSS.measure, 14);
  return cvs.toDataURL('image/jpeg', 0.78);
}

/* ══════════════════════════════════════════════════════════════════
   12. 전체 흐름
   ══════════════════════════════════════════════════════════════════ */
const nextFrame = () => new Promise(r => setTimeout(r, 0));   // 화면이 멈추지 않게 잠깐 양보

async function scanFoot(topFile, sideFile, footSide, onProgress) {
  const prog = onProgress || (() => { });
  const warnings = [], debugImages = {};
  let confidence = 1;

  prog('사진 읽는 중', 0.05); await nextFrame();
  const topMat = await loadImageMat(topFile);
  const q = checkPhotoQuality(topMat);
  q.issues.forEach(i => warnings.push(i.text));
  if (q.issues.some(i => i.level === 'bad')) confidence = Math.min(confidence, 0.5);

  prog('종이 인식 중', 0.15); await nextFrame();
  const paper = detectPaper(topMat);
  warnings.push(...paper.warnings);

  prog('원근 펴는 중', 0.3); await nextFrame();
  const warped = warpToA4(topMat, paper.quad);

  prog('발 인식 중', 0.45); await nextFrame();
  const seg = segmentFootTop(warped);
  warnings.push(...seg.warnings);

  prog('치수 재는 중', 0.6); await nextFrame();
  const top = measureTop(seg.mask);
  warnings.push(...top.warnings);
  debugImages.top = drawTopOverlay(top.overlay, top.measurement);

  if (warnings.some(w => w.includes('종이') && w.includes('밖으로'))) confidence = Math.min(confidence, 0.6);
  if (warnings.some(w => w.includes('휘어'))) confidence = Math.min(confidence, 0.85);

  let sideMeasurement = null;
  if (sideFile) {
    prog('옆면 읽는 중', 0.7); await nextFrame();
    const sideMat = await loadImageMat(sideFile);
    const qs = checkPhotoQuality(sideMat);
    qs.issues.forEach(i => warnings.push('(옆면) ' + i.text));
    if (qs.issues.some(i => i.level === 'bad')) confidence = Math.min(confidence, 0.5);

    prog('기준자 찾는 중', 0.78); await nextFrame();
    const ref = detectReference(sideMat);
    warnings.push(...ref.warnings);

    prog('아치 재는 중', 0.88); await nextFrame();
    const segS = segmentFootSide(ref);
    warnings.push(...segS.warnings);
    const side = measureSide(segS.mask, ref, top.measurement.foot_length_mm);
    warnings.push(...side.warnings);
    confidence = Math.min(confidence, side.quality);
    sideMeasurement = side.measurement;
    debugImages.side = drawSideOverlay(ref, side.overlay, side.measurement);

    prog('교차검증 중', 0.95); await nextFrame();
    const cc = crossCheck(top.measurement.foot_length_mm, side.measurement.foot_length_side_mm);
    warnings.push(...cc.warnings);
    confidence = Math.min(confidence, cc.confidence);
  }

  if (confidence < CFG.LOW_CONFIDENCE_THRESHOLD) {
    warnings.push('[LOW_CONFIDENCE] 측정 신뢰도가 낮습니다. 결과를 그대로 믿지 말고 다시 촬영해 주세요.');
  }
  prog('완료', 1);
  return {
    side: footSide, top: top.measurement, lateral: sideMeasurement,
    confidence: Math.round(confidence * 100) / 100, warnings, debug_images: debugImages,
    quality: { brightness: Math.round(q.brightness), sharpness: Math.round(q.sharpness) },
  };
}

async function scan({ rightTop, rightSide, leftTop, leftSide }, onProgress) {
  const t0 = performance.now();
  const right = rightTop ? await scanFoot(rightTop, rightSide, 'right', onProgress) : null;
  const left = leftTop ? await scanFoot(leftTop, leftSide, 'left', onProgress) : null;
  let asym = null;
  if (right && left) asym = round1(Math.abs(right.top.foot_length_mm - left.top.foot_length_mm));
  let base = right || left;
  if (right && left) base = right.top.foot_length_mm >= left.top.foot_length_mm ? right : left;
  return {
    left, right, asymmetry_mm: asym,
    recommended_size: base ? recommendSize(base.top, base.lateral, base.side, asym) : null,
    scanned_at: new Date().toISOString(),
    elapsed_sec: Math.round((performance.now() - t0) / 100) / 10,
    disclaimer: CFG.DISCLAIMER,
  };
}
