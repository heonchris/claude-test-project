/* ══════════════════════════════════════════════════════════════════════
   cvlite — 이 앱에 필요한 영상처리만 직접 구현한 작은 라이브러리

   왜 직접 만들었나?
     처음에는 OpenCV.js(10MB)를 썼는데, 두 가지 문제가 있었습니다.
       1) 브라우저 보안 정책이 막으면 앱 전체가 동작하지 않습니다
          (OpenCV.js 는 내부적으로 문자열을 코드로 실행합니다)
       2) 열 때마다 10MB 를 받아야 합니다
     필요한 기능은 20개 남짓이라 직접 구현하는 편이 낫다고 판단했습니다.
     결과: 다운로드 0MB, 즉시 실행, 오프라인 동작.

   이미지 표현
     { w, h, c, data }  c=1(흑백) 또는 3(RGB), data 는 Uint8ClampedArray
   ══════════════════════════════════════════════════════════════════════ */

const CVL = (() => {

  /* ── 기본 ─────────────────────────────────────────────────────── */
  const img = (w, h, c = 1, fill = 0) => {
    const d = new Uint8ClampedArray(w * h * c);
    if (fill) d.fill(fill);
    return { w, h, c, data: d };
  };
  const clone = (m) => ({ w: m.w, h: m.h, c: m.c, data: m.data.slice() });

  /* ── 색 변환 ──────────────────────────────────────────────────── */
  function toGray(m) {
    if (m.c === 1) return clone(m);
    const o = img(m.w, m.h, 1), s = m.data, d = o.data;
    for (let p = 0, i = 0; i < s.length; i += 3, p++) {
      // OpenCV 와 같은 가중치
      d[p] = (s[i] * 0.299 + s[i + 1] * 0.587 + s[i + 2] * 0.114) | 0;
    }
    return o;
  }

  // sRGB → Lab (OpenCV 8비트 규약: L 0~255, a/b 는 128 이 중심)
  const _labLut = (() => {
    const t = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const v = i / 255;
      t[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }
    return t;
  })();
  // 세제곱근을 매번 계산하면 느려서, 미리 표로 만들어 둡니다 (색 변환이 전체의 30% 를 차지했습니다)
  const _F_N = 8192, _F_MAX = 1.32;
  const _fLut = (() => {
    const t = new Float32Array(_F_N + 1);
    for (let i = 0; i <= _F_N; i++) {
      const v = i * _F_MAX / _F_N;
      t[i] = v > 0.008856 ? Math.cbrt(v) : (7.787 * v + 16 / 116);
    }
    return t;
  })();
  const _f = (v) => {
    if (v <= 0) return 16 / 116;
    if (v >= _F_MAX) return Math.cbrt(v);
    return _fLut[(v * (_F_N / _F_MAX)) | 0];
  };
  function rgb2lab(m) {
    const o = { w: m.w, h: m.h, c: 3, data: new Uint8ClampedArray(m.w * m.h * 3) };
    const s = m.data, d = o.data;
    const Xn = 0.950456, Zn = 1.088754;
    const f = _f;
    for (let i = 0; i < s.length; i += 3) {
      const R = _labLut[s[i]], G = _labLut[s[i + 1]], B = _labLut[s[i + 2]];
      const X = (0.412453 * R + 0.357580 * G + 0.180423 * B) / Xn;
      const Y = (0.212671 * R + 0.715160 * G + 0.072169 * B);
      const Z = (0.019334 * R + 0.119193 * G + 0.950227 * B) / Zn;
      const fx = f(X), fy = f(Y), fz = f(Z);
      const L = Y > 0.008856 ? (116 * fy - 16) : (903.3 * Y);
      d[i] = L * 255 / 100;
      d[i + 1] = 500 * (fx - fy) + 128;
      d[i + 2] = 200 * (fy - fz) + 128;
    }
    return o;
  }

  /* ── 크기 조절 (면적 평균 — 축소에 적합) ───────────────────────── */
  function resize(m, nw, nh) {
    const o = img(nw, nh, m.c);
    const sx = m.w / nw, sy = m.h / nh, s = m.data, d = o.data, c = m.c;
    for (let y = 0; y < nh; y++) {
      const y0 = Math.floor(y * sy), y1 = Math.min(m.h, Math.max(y0 + 1, Math.ceil((y + 1) * sy)));
      for (let x = 0; x < nw; x++) {
        const x0 = Math.floor(x * sx), x1 = Math.min(m.w, Math.max(x0 + 1, Math.ceil((x + 1) * sx)));
        const n = (y1 - y0) * (x1 - x0);
        for (let ch = 0; ch < c; ch++) {
          let acc = 0;
          for (let yy = y0; yy < y1; yy++) {
            let base = (yy * m.w + x0) * c + ch;
            for (let xx = x0; xx < x1; xx++, base += c) acc += s[base];
          }
          d[(y * nw + x) * c + ch] = acc / n;
        }
      }
    }
    return o;
  }

  /* ── 가우시안 블러 (가로·세로로 나눠서 빠르게) ─────────────────── */
  function gaussKernel(k) {
    const sigma = 0.3 * ((k - 1) * 0.5 - 1) + 0.8;
    const r = (k - 1) / 2, v = new Float32Array(k);
    let sum = 0;
    for (let i = 0; i < k; i++) { const x = i - r; v[i] = Math.exp(-x * x / (2 * sigma * sigma)); sum += v[i]; }
    for (let i = 0; i < k; i++) v[i] /= sum;
    return v;
  }
  function blur(m, k = 5) {
    const kern = gaussKernel(k), r = (k - 1) / 2;
    const tmp = new Float32Array(m.w * m.h), out = img(m.w, m.h, 1);
    const s = m.data, d = out.data;
    for (let y = 0; y < m.h; y++) {
      const row = y * m.w;
      for (let x = 0; x < m.w; x++) {
        let acc = 0;
        for (let i = 0; i < k; i++) {
          const xx = Math.min(m.w - 1, Math.max(0, x + i - r));
          acc += s[row + xx] * kern[i];
        }
        tmp[row + x] = acc;
      }
    }
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        let acc = 0;
        for (let i = 0; i < k; i++) {
          const yy = Math.min(m.h - 1, Math.max(0, y + i - r));
          acc += tmp[yy * m.w + x] * kern[i];
        }
        d[y * m.w + x] = acc;
      }
    }
    return out;
  }

  /** 3채널(RGB) 블러 — 채널별로 나눠 처리 */
  function blur3(m, k = 5) {
    if (m.c === 1) return blur(m, k);
    const out = img(m.w, m.h, 3);
    for (let ch = 0; ch < 3; ch++) {
      const one = img(m.w, m.h, 1);
      for (let p = 0; p < m.w * m.h; p++) one.data[p] = m.data[p * 3 + ch];
      const b = blur(one, k);
      for (let p = 0; p < m.w * m.h; p++) out.data[p * 3 + ch] = b.data[p];
    }
    return out;
  }

  /* ── 통계 ─────────────────────────────────────────────────────── */
  function histogram(data, step = 1) {
    const h = new Int32Array(256);
    for (let i = 0; i < data.length; i += step) h[data[i]]++;
    return h;
  }
  function median(data, step = 1) {
    const h = histogram(data, step);
    let n = 0; for (let i = 0; i < 256; i++) n += h[i];
    let acc = 0; for (let v = 0; v < 256; v++) { acc += h[v]; if (acc >= n / 2) return v; }
    return 127;
  }
  function percentile(data, p, step = 1) {
    const h = histogram(data, step);
    let n = 0; for (let i = 0; i < 256; i++) n += h[i];
    const t = n * p / 100;
    let acc = 0; for (let v = 0; v < 256; v++) { acc += h[v]; if (acc >= t) return v; }
    return 255;
  }
  /** Otsu 임계값 — 두 무리로 가장 잘 나뉘는 지점을 자동으로 찾습니다 */
  function otsu(data, step = 1) {
    const h = histogram(data, step);
    let total = 0, sum = 0;
    for (let i = 0; i < 256; i++) { total += h[i]; sum += i * h[i]; }
    let sumB = 0, wB = 0, best = -1, thr = 0;
    for (let i = 0; i < 256; i++) {
      wB += h[i]; if (!wB) continue;
      const wF = total - wB; if (!wF) break;
      sumB += i * h[i];
      const mB = sumB / wB, mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; thr = i; }
    }
    return thr;
  }
  function meanStd(data) {
    let s = 0, n = data.length;
    for (let i = 0; i < n; i++) s += data[i];
    const m = s / n;
    let v = 0;
    for (let i = 0; i < n; i++) { const d = data[i] - m; v += d * d; }
    return { mean: m, std: Math.sqrt(v / n) };
  }
  /** 라플라시안 분산 — 사진이 흔들렸는지(낮음) / 노이즈가 심한지(높음) */
  function laplacianVar(gray) {
    const { w, h, data } = gray;
    let s = 0, s2 = 0, n = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const v = -4 * data[i] + data[i - 1] + data[i + 1] + data[i - w] + data[i + w];
        s += v; s2 += v * v; n++;
      }
    }
    const m = s / n;
    return s2 / n - m * m;
  }

  /* ── Canny 경계 검출 ──────────────────────────────────────────── */
  function canny(gray, lo, hi) {
    const { w, h, data } = gray;
    const gx = new Float32Array(w * h), gy = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        gx[i] = -data[i - w - 1] - 2 * data[i - 1] - data[i + w - 1]
          + data[i - w + 1] + 2 * data[i + 1] + data[i + w + 1];
        gy[i] = -data[i - w - 1] - 2 * data[i - w] - data[i - w + 1]
          + data[i + w - 1] + 2 * data[i + w] + data[i + w + 1];
      }
    }
    const mag = new Float32Array(w * h);
    for (let i = 0; i < mag.length; i++) mag[i] = Math.hypot(gx[i], gy[i]);

    // 비최대 억제 — 경계선을 한 픽셀 두께로
    const nms = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x, gxv = gx[i], gyv = gy[i], m = mag[i];
        if (m === 0) continue;
        const ang = Math.atan2(gyv, gxv) * 180 / Math.PI;
        const a = ((ang % 180) + 180) % 180;
        let n1, n2;
        if (a < 22.5 || a >= 157.5) { n1 = mag[i - 1]; n2 = mag[i + 1]; }
        else if (a < 67.5) { n1 = mag[i - w + 1]; n2 = mag[i + w - 1]; }
        else if (a < 112.5) { n1 = mag[i - w]; n2 = mag[i + w]; }
        else { n1 = mag[i - w - 1]; n2 = mag[i + w + 1]; }
        if (m >= n1 && m >= n2) nms[i] = m;
      }
    }
    // 이중 임계값 + 연결 (약한 경계는 강한 경계에 이어질 때만 살립니다)
    const out = img(w, h, 1);
    const d = out.data;
    const stack = [];
    for (let i = 0; i < nms.length; i++) if (nms[i] >= hi) { d[i] = 255; stack.push(i); }
    while (stack.length) {
      const i = stack.pop();
      const y = (i / w) | 0, x = i % w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = y + dy, nx = x + dx;
          if (ny < 0 || nx < 0 || ny >= h || nx >= w) continue;
          const j = ny * w + nx;
          if (!d[j] && nms[j] >= lo) { d[j] = 255; stack.push(j); }
        }
      }
    }
    return out;
  }

  /* ── 팽창/침식 (사각 커널, 슬라이딩 최대/최소 — 크기와 무관하게 빠름) ─ */
  function _slide(src, w, h, r, isMax) {
    const out = new Uint8ClampedArray(w * h);
    const tmp = new Uint8ClampedArray(w * h);
    const cmp = isMax ? (a, b) => a >= b : (a, b) => a <= b;
    const dq = new Int32Array(Math.max(w, h) + 2);
    // 가로
    for (let y = 0; y < h; y++) {
      const off = y * w;
      let head = 0, tail = 0;
      for (let x = 0; x < w + r; x++) {
        if (x < w) {
          while (tail > head && cmp(src[off + x], src[dq[tail - 1]])) tail--;
          dq[tail++] = off + x;
        }
        const c = x - r;
        if (c >= 0) {
          while (dq[head] < off + c - r) head++;
          tmp[off + c] = src[dq[head]];
        }
      }
    }
    // 세로
    for (let x = 0; x < w; x++) {
      let head = 0, tail = 0;
      for (let y = 0; y < h + r; y++) {
        if (y < h) {
          while (tail > head && cmp(tmp[y * w + x], tmp[dq[tail - 1]])) tail--;
          dq[tail++] = y * w + x;
        }
        const c = y - r;
        if (c >= 0) {
          while (((dq[head] / w) | 0) < c - r) head++;
          out[c * w + x] = tmp[dq[head]];
        }
      }
    }
    return out;
  }
  const dilate = (m, r) => ({ w: m.w, h: m.h, c: 1, data: _slide(m.data, m.w, m.h, r, true) });
  const erode = (m, r) => ({ w: m.w, h: m.h, c: 1, data: _slide(m.data, m.w, m.h, r, false) });
  const morphClose = (m, r) => erode(dilate(m, r), r);
  const morphOpen = (m, r) => dilate(erode(m, r), r);

  /* ── 연결 요소 (덩어리 찾기) ──────────────────────────────────── */
  function connectedComponents(m) {
    const { w, h, data } = m;
    const labels = new Int32Array(w * h);
    const parent = [0];
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); };
    let next = 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!data[i]) continue;
        let best = 0;
        for (const [dy, dx] of [[-1, -1], [-1, 0], [-1, 1], [0, -1]]) {
          const ny = y + dy, nx = x + dx;
          if (ny < 0 || nx < 0 || nx >= w) continue;
          const l = labels[ny * w + nx];
          if (l) { if (!best) best = l; else union(best, l); }
        }
        if (!best) { best = next; parent[next] = next; next++; }
        labels[i] = best;
      }
    }
    const remap = new Int32Array(next);
    let cnt = 1;
    for (let i = 1; i < next; i++) { const r = find(i); if (r === i) remap[i] = cnt++; }
    for (let i = 1; i < next; i++) remap[i] = remap[find(i)];
    const stats = Array.from({ length: cnt }, () => ({ area: 0, x0: 1e9, y0: 1e9, x1: -1, y1: -1 }));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!labels[i]) continue;
        const l = remap[labels[i]];
        labels[i] = l;
        const s = stats[l];
        s.area++;
        if (x < s.x0) s.x0 = x; if (x > s.x1) s.x1 = x;
        if (y < s.y0) s.y0 = y; if (y > s.y1) s.y1 = y;
      }
    }
    return { n: cnt, labels, stats };
  }

  /** 가장 큰 덩어리만 남긴 마스크 */
  function largestComponent(m) {
    const cc = connectedComponents(m);
    if (cc.n <= 1) return { mask: img(m.w, m.h, 1), area: 0, stat: null };
    let bi = 1;
    for (let i = 2; i < cc.n; i++) if (cc.stats[i].area > cc.stats[bi].area) bi = i;
    const out = img(m.w, m.h, 1), d = out.data;
    for (let i = 0; i < d.length; i++) d[i] = cc.labels[i] === bi ? 255 : 0;
    return { mask: out, area: cc.stats[bi].area, stat: cc.stats[bi] };
  }

  /* ── 외곽선 추적 (덩어리마다 바깥 테두리 한 줄) ─────────────────── */
  const _N8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  function traceContour(labels, w, h, label, sx, sy) {
    const pts = [[sx, sy]];
    let cx = sx, cy = sy, dir = 6;                 // 왼쪽부터 탐색
    const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h && labels[y * w + x] === label);
    for (let guard = 0; guard < 4 * w * h; guard++) {
      let found = false;
      for (let k = 0; k < 8; k++) {
        const nd = (dir + k) & 7;
        const nx = cx + _N8[nd][0], ny = cy + _N8[nd][1];
        if (at(nx, ny)) {
          cx = nx; cy = ny; dir = (nd + 5) & 7;     // 되돌아보며 계속
          pts.push([cx, cy]); found = true; break;
        }
      }
      if (!found) break;
      if (cx === sx && cy === sy) { pts.pop(); break; }
    }
    return pts;
  }
  /** 바깥 윤곽선들을 찾습니다 (OpenCV 의 RETR_EXTERNAL 에 해당) */
  function findContours(m, minBBoxArea = 0) {
    const cc = connectedComponents(m);
    const out = [];
    const seen = new Uint8Array(cc.n);
    const { w, h } = m;
    // 아주 작은 조각까지 전부 추적하면 느립니다.
    // 경계선 사진에는 자잘한 조각이 수백 개 생기므로 미리 걸러냅니다.
    if (minBBoxArea > 0) {
      for (let l = 1; l < cc.n; l++) {
        const st = cc.stats[l];
        if ((st.x1 - st.x0 + 1) * (st.y1 - st.y0 + 1) < minBBoxArea) seen[l] = 1;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const l = cc.labels[y * w + x];
        if (!l || seen[l]) continue;
        seen[l] = 1;
        out.push({ pts: traceContour(cc.labels, w, h, l, x, y), label: l, stat: cc.stats[l] });
      }
    }
    return out;
  }

  /* ── 다각형 계산 ──────────────────────────────────────────────── */
  function contourArea(pts) {
    let a = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n];
      a += x1 * y2 - x2 * y1;
    }
    return Math.abs(a) / 2;
  }
  function arcLength(pts, closed = true) {
    let L = 0;
    for (let i = 0; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    if (closed && pts.length > 1) {
      const a = pts[pts.length - 1], b = pts[0];
      L += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    return L;
  }
  function isConvex(pts) {
    let sign = 0;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n], c = pts[(i + 2) % n];
      const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (cr !== 0) { const s = cr > 0 ? 1 : -1; if (!sign) sign = s; else if (s !== sign) return false; }
    }
    return true;
  }
  /** 다글라스-포이커 단순화 — 윤곽선을 몇 개의 꼭짓점으로 줄입니다 */
  function approxPolyDP(pts, eps, closed = true) {
    if (pts.length < 3) return pts.slice();
    const dp = (arr) => {
      if (arr.length < 3) return arr;
      const [ax, ay] = arr[0], [bx, by] = arr[arr.length - 1];
      const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
      let maxD = -1, idx = -1;
      for (let i = 1; i < arr.length - 1; i++) {
        const [px, py] = arr[i];
        const d = L < 1e-9 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * px - dx * py + bx * ay - by * ax) / L;
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (maxD <= eps) return [arr[0], arr[arr.length - 1]];
      const left = dp(arr.slice(0, idx + 1)), right = dp(arr.slice(idx));
      return left.slice(0, -1).concat(right);
    };
    if (!closed) return dp(pts);
    // 닫힌 곡선은 가장 먼 두 점으로 나눠서 각각 단순화합니다
    let far = 0, fd = -1;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
      if (d > fd) { fd = d; far = i; }
    }
    const a = dp(pts.slice(0, far + 1));
    const b = dp(pts.slice(far).concat([pts[0]]));
    return a.slice(0, -1).concat(b.slice(0, -1));
  }

  /* ── 원근 변환 ────────────────────────────────────────────────── */
  /** 네 점을 네 점으로 보내는 변환 행렬 (3x3) */
  function getPerspectiveTransform(src, dst) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -x * v, -y * v]); b.push(v);
    }
    // 가우스 소거법
    const n = 8;
    for (let i = 0; i < n; i++) {
      let piv = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
      [A[i], A[piv]] = [A[piv], A[i]]; [b[i], b[piv]] = [b[piv], b[i]];
      const d = A[i][i];
      if (Math.abs(d) < 1e-12) continue;
      for (let c = i; c < n; c++) A[i][c] /= d;
      b[i] /= d;
      for (let r = 0; r < n; r++) {
        if (r === i) continue;
        const f = A[r][i];
        if (!f) continue;
        for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
        b[r] -= f * b[i];
      }
    }
    return [b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7], 1];
  }
  function invert3(M) {
    const [a, b, c, d, e, f, g, h, i] = M;
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-12) return null;
    return [
      A / det, (c * h - b * i) / det, (b * f - c * e) / det,
      B / det, (a * i - c * g) / det, (c * d - a * f) / det,
      C / det, (b * g - a * h) / det, (a * e - b * d) / det,
    ];
  }
  /** 원근을 펴서 직사각형으로 만듭니다 (역방향 + 이중선형 보간) */
  function warpPerspective(m, M, ow, oh) {
    const Mi = invert3(M);
    if (!Mi) return img(ow, oh, m.c);
    const out = img(ow, oh, m.c);
    const s = m.data, d = out.data, c = m.c, sw = m.w, sh = m.h;
    for (let y = 0; y < oh; y++) {
      for (let x = 0; x < ow; x++) {
        const wz = Mi[6] * x + Mi[7] * y + Mi[8];
        if (Math.abs(wz) < 1e-12) continue;
        const sx = (Mi[0] * x + Mi[1] * y + Mi[2]) / wz;
        const sy = (Mi[3] * x + Mi[4] * y + Mi[5]) / wz;
        if (sx < 0 || sy < 0 || sx >= sw - 1 || sy >= sh - 1) continue;
        const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0;
        const i00 = (y0 * sw + x0) * c, i10 = i00 + c, i01 = i00 + sw * c, i11 = i01 + c;
        const o = (y * ow + x) * c;
        for (let ch = 0; ch < c; ch++) {
          d[o + ch] = s[i00 + ch] * (1 - fx) * (1 - fy) + s[i10 + ch] * fx * (1 - fy)
            + s[i01 + ch] * (1 - fx) * fy + s[i11 + ch] * fx * fy;
        }
      }
    }
    return out;
  }

  /* ── 회전 (마스크용, 최근접) ──────────────────────────────────── */
  function rotateAbout(m, angleDeg, cx, cy, ow, oh, offX, offY) {
    const a = angleDeg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    // 정방향: (x,y) → (ca*(x-cx)+sa*(y-cy)+cx+offX, -sa*(x-cx)+ca*(y-cy)+cy+offY)
    const out = img(ow, oh, m.c), s = m.data, d = out.data, c = m.c;
    for (let y = 0; y < oh; y++) {
      for (let x = 0; x < ow; x++) {
        const px = x - offX - cx, py = y - offY - cy;
        const sx = Math.round(ca * px - sa * py + cx);
        const sy = Math.round(sa * px + ca * py + cy);
        if (sx < 0 || sy < 0 || sx >= m.w || sy >= m.h) continue;
        const si = (sy * m.w + sx) * c, oi = (y * ow + x) * c;
        for (let ch = 0; ch < c; ch++) d[oi + ch] = s[si + ch];
      }
    }
    return out;
  }
  function flipH(m) {
    const out = img(m.w, m.h, m.c), s = m.data, d = out.data, c = m.c;
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        const si = (y * m.w + x) * c, di = (y * m.w + (m.w - 1 - x)) * c;
        for (let ch = 0; ch < c; ch++) d[di + ch] = s[si + ch];
      }
    return out;
  }
  function rotate180(m) {
    const out = img(m.w, m.h, m.c), s = m.data, d = out.data, c = m.c, n = m.w * m.h;
    for (let p = 0; p < n; p++) {
      const si = p * c, di = (n - 1 - p) * c;
      for (let ch = 0; ch < c; ch++) d[di + ch] = s[si + ch];
    }
    return out;
  }
  function rotate90(m) {                     // 시계 방향
    const out = img(m.h, m.w, m.c), s = m.data, d = out.data, c = m.c;
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        const si = (y * m.w + x) * c, di = (x * m.h + (m.h - 1 - y)) * c;
        for (let ch = 0; ch < c; ch++) d[di + ch] = s[si + ch];
      }
    return out;
  }

  /* ── 다각형 채우기 (마스크 만들기) ─────────────────────────────── */
  function fillPoly(m, pts, val = 255) {
    if (pts.length < 3) return m;
    let minY = 1e9, maxY = -1e9;
    for (const [, y] of pts) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
    minY = Math.max(0, Math.floor(minY)); maxY = Math.min(m.h - 1, Math.ceil(maxY));
    const xs = [];
    for (let y = minY; y <= maxY; y++) {
      xs.length = 0;
      for (let i = 0, n = pts.length; i < n; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n];
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
          xs.push(x1 + (y - y1) / (y2 - y1) * (x2 - x1));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const a = Math.max(0, Math.ceil(xs[k])), b = Math.min(m.w - 1, Math.floor(xs[k + 1]));
        const row = y * m.w;
        for (let x = a; x <= b; x++) m.data[row + x] = val;
      }
    }
    return m;
  }
  /** 마스크 안의 구멍을 메웁니다 (바깥 윤곽선을 다시 채워 넣기) */
  function fillHoles(m) {
    const out = img(m.w, m.h, 1);
    for (const c of findContours(m)) fillPoly(out, c.pts, 255);
    return out;
  }

  /* ── k-평균 (배경 대표색 학습용) ───────────────────────────────── */
  function kmeans(points, k, iters = 20) {
    const n = points.length;
    if (!n) return [];
    const dim = points[0].length;
    // k-means++ 로 초기 중심 고르기
    const centers = [points[(Math.random() * n) | 0].slice()];
    while (centers.length < k) {
      const d2 = points.map(p => {
        let best = Infinity;
        for (const c of centers) { let s = 0; for (let j = 0; j < dim; j++) { const t = p[j] - c[j]; s += t * t; } if (s < best) best = s; }
        return best;
      });
      const sum = d2.reduce((a, b) => a + b, 0);
      let r = Math.random() * sum, idx = 0;
      for (let i = 0; i < n; i++) { r -= d2[i]; if (r <= 0) { idx = i; break; } }
      centers.push(points[idx].slice());
    }
    const assign = new Int32Array(n);
    for (let it = 0; it < iters; it++) {
      let moved = false;
      for (let i = 0; i < n; i++) {
        let best = 0, bd = Infinity;
        for (let c = 0; c < centers.length; c++) {
          let s = 0;
          for (let j = 0; j < dim; j++) { const t = points[i][j] - centers[c][j]; s += t * t; }
          if (s < bd) { bd = s; best = c; }
        }
        if (assign[i] !== best) { assign[i] = best; moved = true; }
      }
      const sums = centers.map(() => new Float64Array(dim)), cnts = new Int32Array(centers.length);
      for (let i = 0; i < n; i++) { const a = assign[i]; cnts[a]++; for (let j = 0; j < dim; j++) sums[a][j] += points[i][j]; }
      for (let c = 0; c < centers.length; c++) if (cnts[c]) for (let j = 0; j < dim; j++) centers[c][j] = sums[c][j] / cnts[c];
      if (!moved) break;
    }
    return centers;
  }

  /* ── 그 밖 ────────────────────────────────────────────────────── */
  function countNonZero(m) { let n = 0; const d = m.data; for (let i = 0; i < d.length; i++) if (d[i]) n++; return n; }
  function threshold(m, t) {
    const out = img(m.w, m.h, 1), s = m.data, d = out.data;
    for (let i = 0; i < d.length; i++) d[i] = s[i] >= t ? 255 : 0;
    return out;
  }
  /** 적응형 이진화 (그림자가 짙을 때 쓰는 보조 수단) */
  function adaptiveThresholdInv(gray, block, C) {
    const r = (block - 1) / 2;
    const b = blur(gray, block % 2 ? block : block + 1);
    const out = img(gray.w, gray.h, 1), s = gray.data, m = b.data, d = out.data;
    for (let i = 0; i < d.length; i++) d[i] = (s[i] < m[i] - C) ? 255 : 0;
    return out;
  }

  return {
    img, clone, toGray, rgb2lab, resize, blur, blur3, canny,
    dilate, erode, morphClose, morphOpen,
    connectedComponents, largestComponent, findContours,
    contourArea, arcLength, isConvex, approxPolyDP,
    getPerspectiveTransform, invert3, warpPerspective,
    rotateAbout, flipH, rotate180, rotate90,
    fillPoly, fillHoles, kmeans,
    histogram, median, percentile, otsu, meanStd, laplacianVar,
    countNonZero, threshold, adaptiveThresholdInv,
  };
})();
