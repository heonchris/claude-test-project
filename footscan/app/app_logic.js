/* ══════════════════════════════════════════════════════════════════
   앱 동작 — 화면 이동, 사진 넣기, 품질 검사, 측정, 저장, 공유
   ══════════════════════════════════════════════════════════════════ */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const TOE_KR = { egyptian: '이집트형 (엄지가 가장 김)', greek: '그리스형 (검지가 가장 김)', roman: '로마형 (엄지≈검지)' };
const ARCH_KR = { low: '낮은 편', normal: '보통', high: '높은 편' };
const SHOE_KR = { dress: '구두', sneakers: '스니커즈', running: '러닝화', hiking: '등산화', sandals: '샌들' };
const SLOT_KR = { right_top: '오른발 위', right_side: '오른발 옆', left_top: '왼발 위', left_side: '왼발 옆' };

/* ── 화면 이동 (뒤로가기 버튼이 자연스럽게 동작하도록 history 사용) ── */
const SCREENS = {
  boot: { title: '발 스캔', back: false, hist: false },
  home: { title: '발 스캔', back: false, hist: true },
  guide: { title: '촬영 안내', back: true, hist: false },
  capture: { title: '사진 넣기', back: true, hist: false },
  camera: { title: '카메라로 찍기', back: true, hist: false },
  processing: { title: '측정 중', back: false, hist: false },
  result: { title: '측정 결과', back: true, hist: true },
  error: { title: '측정 실패', back: true, hist: false },
  history: { title: '측정 이력', back: true, hist: false },
};
let current = 'boot';

function show(name, { push = true } = {}) {
  if (!SCREENS[name]) return;
  if (current === 'camera' && name !== 'camera') stopCamera();
  current = name;
  Object.keys(SCREENS).forEach(k => { const el = $('#s-' + k); if (el) el.hidden = (k !== name); });
  const cfg = SCREENS[name];
  $('#bartitle').textContent = cfg.title;
  $('#back').hidden = !cfg.back;
  $('#histbtn').hidden = !cfg.hist;
  window.scrollTo(0, 0);
  if (push && location.hash !== '#' + name) history.pushState({ screen: name }, '', '#' + name);
  // 화면이 바뀌었음을 보조기기에 알립니다
  $('#live').textContent = cfg.title + ' 화면';
  const h = $('#s-' + name)?.querySelector('h1, h2');
  if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  if (name === 'camera') startCamera();
}
window.addEventListener('popstate', (e) => {
  const s = (e.state && e.state.screen) || (location.hash || '#home').slice(1);
  if (s === 'processing' || s === 'boot') { show('home', { push: false }); return; }
  show(SCREENS[s] ? s : 'home', { push: false });
});
$('#back').addEventListener('click', () => history.back());
$('#histbtn').addEventListener('click', () => { renderHistory(); show('history'); });

/* ── 사진 보관 ── */
const photos = {};        // {right_top: {file, url, quality}}
let pendingKey = null;

function slotEl(k) { return document.querySelector(`.slot[data-k="${k}"]`); }

$$('.slot').forEach(btn => {
  btn.addEventListener('click', () => {
    pendingKey = btn.dataset.k;
    if (cameraSupported()) show('camera'); else $('#filepick').click();
  });
});

$('#filepick').addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f || !pendingKey) return;
  await addPhoto(pendingKey, f);
});

/** 사진을 넣고, 바로 품질을 검사해 알려 줍니다 */
async function addPhoto(key, file) {
  const el = slotEl(key);
  const mark = el.querySelector('.mark');
  const thumb = el.querySelector('.thumb');
  mark.textContent = '검사 중…';
  el.classList.remove('done', 'bad');

  if (photos[key]?.url) URL.revokeObjectURL(photos[key].url);
  const url = URL.createObjectURL(file);
  thumb.innerHTML = '';
  const img = new Image(); img.src = url; img.alt = '';
  thumb.appendChild(img);

  let quality = null;
  try {
    // 메모리는 자바스크립트가 알아서 정리합니다 (예전 OpenCV 판과 달리 수동 해제 불필요)
    const mat = await loadImageMat(file);
    quality = checkPhotoQuality(mat);
  } catch (err) {
    mark.textContent = '열 수 없음';
    el.classList.add('bad');
    photos[key] = { file, url, quality: null, unreadable: true };
    renderQualityNotes(); refreshMeasureBtn();
    return;
  }

  photos[key] = { file, url, quality };
  const bad = quality.issues.some(i => i.level === 'bad');
  el.classList.add(bad ? 'bad' : 'done');
  mark.textContent = bad ? '다시 찍기' : '✓ 좋음';
  $('#live').textContent = SLOT_KR[key] + (bad ? ' 사진에 문제가 있습니다' : ' 사진이 준비되었습니다');
  renderQualityNotes();
  refreshMeasureBtn();
}

function renderQualityNotes() {
  const box = $('#quality-note');
  const items = [];
  for (const [k, p] of Object.entries(photos)) {
    if (p.unreadable) { items.push(`<div class="note bad"><b>${SLOT_KR[k]}</b> — 사진을 열 수 없습니다. JPG 또는 PNG 인지 확인해 주세요.</div>`); continue; }
    (p.quality?.issues || []).forEach(i => {
      items.push(`<div class="note ${i.level === 'bad' ? 'bad' : 'warn'}"><b>${SLOT_KR[k]}</b> — ${esc(i.text)}</div>`);
    });
  }
  const anyGood = Object.values(photos).some(p => p.quality && p.quality.ok);
  if (!items.length && anyGood) items.push('<div class="note good">사진 품질이 좋습니다. 측정할 수 있습니다.</div>');
  box.innerHTML = items.join('');
}

function refreshMeasureBtn() {
  const ok = !!(photos.right_top || photos.left_top);
  $('#measure').disabled = !ok;
}

/* 예시 사진 넣기 — 발을 찍지 않고도 앱을 끝까지 체험해 볼 수 있습니다 */
$('#use-sample').addEventListener('click', async () => {
  const btn = $('#use-sample');
  btn.disabled = true;
  const before = btn.textContent;
  btn.textContent = '예시 사진 넣는 중…';
  try {
    for (const k of ['right_top', 'right_side']) {
      const f = window.samplePhotoFile && window.samplePhotoFile(k);
      if (f) await addPhoto(k, f);
    }
    $('#live').textContent = '예시 사진을 넣었습니다. 측정하기를 누르세요.';
  } finally {
    btn.textContent = before;
    btn.disabled = false;
  }
});

$('#clear-photos').addEventListener('click', () => {
  Object.values(photos).forEach(p => p.url && URL.revokeObjectURL(p.url));
  Object.keys(photos).forEach(k => delete photos[k]);
  $$('.slot').forEach(el => {
    el.classList.remove('done', 'bad');
    el.querySelector('.mark').textContent = '';
    const k = el.dataset.k;
    el.querySelector('.thumb').textContent = k.endsWith('_top') ? '📄' : '👣';
  });
  renderQualityNotes(); refreshMeasureBtn();
});


/* ══════════════════════════════════════════════════════════════════
   카메라로 직접 찍기
   ------------------------------------------------------------------
   찍은 뒤에 "어둡습니다"라고 하면 이미 늦습니다. 찍기 '전에' 화면에서
   밝기·흔들림·A4 인식을 실시간으로 확인해 알려 줍니다.
   카메라를 못 쓰는 환경(권한 거부, 지원 안 함)에서는 사진첩으로 넘깁니다.
   ══════════════════════════════════════════════════════════════════ */
let camStream = null;      // 켜져 있는 카메라
let camTimer = null;       // 실시간 검사 타이머
let camTrack = null;       // 손전등 제어용
let camBusy = false;       // 검사가 겹치지 않게
let camLast = null;        // 마지막 검사 결과
const CAM = {
  CHECK_MS: 550,           // 실시간 검사 간격 — 내리면 더 즉각적이지만 폰이 뜨거워집니다
  PAPER_LONG_PX: 700,      // 종이 인식용 축소 크기 — 올리면 더 잘 찾지만 느려집니다
  MIN_LONG_PX: 1600,       // 이보다 작게 찍히면 정확도가 급격히 나빠집니다
};

let camDisabled = false;   // 한 번 실패하면 다시 시도하지 않고 바로 사진첩으로 갑니다
function cameraSupported() {
  return !camDisabled &&
    !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext);
}
function isTopSlot(k) { return !k || k.endsWith('_top'); }

async function startCamera() {
  const hint = $('#cam-hint');
  hint.textContent = '카메라를 켜는 중…';
  $('#cam-shot').disabled = true;
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
  } catch (e) {
    // 권한 거부, 카메라 없음, 브라우저 정책 등 — 사진첩으로 대신합니다
    camFallback(e);
    return;
  }
  const v = $('#cam-video');
  v.srcObject = camStream;
  camTrack = camStream.getVideoTracks()[0] || null;
  try { await v.play(); } catch (e) { }
  // 손전등을 지원하는 폰에서만 버튼을 보여 줍니다
  const caps = camTrack && camTrack.getCapabilities ? camTrack.getCapabilities() : {};
  $('#cam-torch').hidden = !(caps && caps.torch);
  $('#cam-shot').disabled = false;
  hint.innerHTML = isTopSlot(pendingKey)
    ? '<b>종이 네 모서리</b>가 모두 틀 안에 들어오게, 바닥과 수평으로 40~60cm 높이에서.'
    : '폰을 <b>바닥 가까이(10~15cm)</b> 낮추고, 종이 <b>긴 변</b>이 가로로 꽉 차게.';
  $('#live').textContent = '카메라가 켜졌습니다.';
  clearInterval(camTimer);
  camTimer = setInterval(camCheck, CAM.CHECK_MS);
  camCheck();
}

function camFallback(err) {
  const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
  camDisabled = true;
  history.back();                                  // 카메라 화면을 빠져나가고
  const el = $('#cam-note');
  if (el) {
    el.hidden = false;
    el.className = 'note warn';
    el.innerHTML = denied
      ? '<b>카메라 권한이 꺼져 있어</b> 사진첩에서 고릅니다. 주소창의 자물쇠 아이콘에서 권한을 켤 수 있습니다.'
      : '이 환경에서는 <b>카메라를 열 수 없어</b> 사진첩에서 고릅니다. 미리 찍어 둔 사진을 골라 주세요.';
  }
  setTimeout(() => $('#filepick').click(), 80);    // 사진첩을 엽니다
}

function stopCamera() {
  clearInterval(camTimer); camTimer = null;
  if (camStream) camStream.getTracks().forEach(t => t.stop());
  camStream = null; camTrack = null; camLast = null;
  const v = $('#cam-video'); if (v) v.srcObject = null;
  $('#cam-chips').innerHTML = '';
}

/* 현재 화면을 축소해 CVL 이미지로 만듭니다 (측정 때와 같은 축소 규칙) */
const camCvs = document.createElement('canvas');
function frameToMat(longEdge) {
  const v = $('#cam-video');
  if (!v || !v.videoWidth) return null;
  const long = Math.max(v.videoWidth, v.videoHeight);
  const sc = long > longEdge ? longEdge / long : 1;
  const w = Math.max(1, Math.round(v.videoWidth * sc)), h = Math.max(1, Math.round(v.videoHeight * sc));
  camCvs.width = w; camCvs.height = h;
  const ctx = camCvs.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(v, 0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h);
  const m = CVL.img(w, h, 3), d = m.data, sd = id.data;
  for (let p = 0, i = 0, j = 0; p < w * h; p++, i += 4, j += 3) { d[j] = sd[i]; d[j + 1] = sd[i + 1]; d[j + 2] = sd[i + 2]; }
  return m;
}

function camCheck() {
  if (camBusy || !camStream || current !== 'camera') return;
  camBusy = true;
  try {
    // 한 번 줄인 그림 하나로 세 가지를 모두 봅니다 (폰이 덜 뜨겁도록)
    const m = frameToMat(CAM.PAPER_LONG_PX);
    if (!m) return;
    const gray = CVL.toGray(m);
    const mean = CVL.meanStd(gray.data).mean;
    // 흔들림 값은 그림을 줄이면 함께 낮아집니다. 700px 에서 잰 값은 측정 때(1600px)보다
    // 15~20% 정도 낮게 나오지만, 합격선(5)과의 거리가 충분히 멀어 그대로 씁니다.
    //   정상 173 · 어두움 27  vs  흔들림 2 · 종이없음 0  (측정값)
    const sharp = CVL.laplacianVar(gray);
    let paper = false;
    try { paper = !!detectPaper(m).quad; } catch (e) { paper = false; }
    camLast = { mean, sharp, paper };
    drawCamChips(camLast);
    drawCamGuide(paper);
  } catch (e) {
    // 실시간 검사가 실패해도 촬영 자체는 막지 않습니다
  } finally { camBusy = false; }
}

function drawCamChips({ mean, sharp, paper }) {
  const dark = mean < CFG.QUALITY_MIN_BRIGHTNESS;
  const bright = mean > CFG.QUALITY_MAX_BRIGHTNESS;
  const shake = sharp < CFG.QUALITY_MIN_SHARPNESS;
  const chips = [
    paper ? ['ok', 'A4 인식됨'] : ['no', 'A4 안 보임'],
    dark ? ['no', '어두움'] : bright ? ['no', '너무 밝음'] : ['ok', '밝기 좋음'],
    shake ? ['no', '흔들림'] : ['ok', '선명함'],
  ];
  $('#cam-chips').innerHTML = chips.map(([c, t]) => `<span class="cam-chip ${c}">${t}</span>`).join('');
  $('#cam-shot').classList.toggle('warn', !(paper && !dark && !bright && !shake));
}

function drawCamChips({ mean, sharp, paper }) {
  const dark = mean < CFG.QUALITY_MIN_BRIGHTNESS;
  const bright = mean > CFG.QUALITY_MAX_BRIGHTNESS;
  const shake = sharp !== null && sharp < CFG.QUALITY_MIN_SHARPNESS;
  const chips = [
    paper ? ['ok', 'A4 인식됨'] : ['no', 'A4 안 보임'],
    dark ? ['no', '어두움'] : bright ? ['no', '너무 밝음'] : ['ok', '밝기 좋음'],
    shake ? ['no', '흔들림'] : ['ok', '선명함'],
  ];
  $('#cam-chips').innerHTML = chips.map(([c, t]) => `<span class="cam-chip ${c}">${t}</span>`).join('');
  $('#cam-shot').classList.toggle('warn', !(paper && !dark && !bright && !shake));
}

/* 화면 위에 A4 안내틀을 그립니다. 종이가 인식되면 초록으로 바뀝니다. */
function drawCamGuide(paper) {
  const cvs = $('#cam-guide'), v = $('#cam-video');
  if (!cvs || !v || !v.videoWidth) return;
  const box = v.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (cvs.width !== Math.round(box.width * dpr) || cvs.height !== Math.round(box.height * dpr)) {
    cvs.width = Math.round(box.width * dpr); cvs.height = Math.round(box.height * dpr);
  }
  const ctx = cvs.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, box.width, box.height);
  // 영상이 'contain' 으로 들어가므로 실제로 그림이 그려진 영역을 구합니다
  const vr = v.videoWidth / v.videoHeight, br = box.width / box.height;
  const dw = vr > br ? box.width : box.height * vr;
  const dh = vr > br ? box.width / vr : box.height;
  const ox = (box.width - dw) / 2, oy = (box.height - dh) / 2;
  ctx.strokeStyle = paper ? 'rgba(60,220,150,.95)' : 'rgba(255,255,255,.55)';
  ctx.lineWidth = paper ? 3 : 2;
  ctx.setLineDash(paper ? [] : [10, 8]);
  if (isTopSlot(pendingKey)) {
    // A4 비율(1:1.414) 세로 틀
    let fh = dh * 0.9, fw = fh / 1.414;
    if (fw > dw * 0.88) { fw = dw * 0.88; fh = fw * 1.414; }
    const x = ox + (dw - fw) / 2, y = oy + (dh - fh) / 2;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, fw, fh, 10) : ctx.rect(x, y, fw, fh); ctx.stroke();
  } else {
    // 옆에서 찍을 때 — 종이 긴 변이 가로로 꽉 차야 합니다
    const y = oy + dh * 0.78, x0 = ox + dw * 0.04, x1 = ox + dw * 0.96;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x0, y - 14); ctx.lineTo(x0, y + 14);
    ctx.moveTo(x1, y - 14); ctx.lineTo(x1, y + 14);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

/* 사진 찍기 — 화면에 보이는 것이 아니라 카메라 원본 해상도로 저장합니다 */
$('#cam-shot').addEventListener('click', async () => {
  const v = $('#cam-video');
  if (!v || !v.videoWidth) return;
  $('#cam-shot').disabled = true;
  const cvs = document.createElement('canvas');
  cvs.width = v.videoWidth; cvs.height = v.videoHeight;
  cvs.getContext('2d').drawImage(v, 0, 0);
  const blob = await new Promise(r => cvs.toBlob(r, 'image/jpeg', 0.92));
  const key = pendingKey;
  const small = Math.max(v.videoWidth, v.videoHeight) < CAM.MIN_LONG_PX;
  history.back();                                  // 카메라를 끄고 사진 넣기 화면으로
  if (blob && key) {
    const f = new File([blob], key + '.jpg', { type: 'image/jpeg' });
    await addPhoto(key, f);
    if (small) {
      $('#quality-note').insertAdjacentHTML('afterbegin',
        '<div class="note warn">카메라 해상도가 낮습니다(가로 ' + Math.max(v.videoWidth, v.videoHeight) +
        'px). 값이 크게 틀릴 수 있어 <b>사진첩의 원본 사진</b>을 쓰시길 권합니다.</div>');
    }
  }
  $('#cam-shot').disabled = false;
});

$('#cam-pick').addEventListener('click', () => { history.back(); setTimeout(() => $('#filepick').click(), 80); });

$('#cam-torch').addEventListener('click', async () => {
  if (!camTrack) return;
  const on = !($('#cam-torch').dataset.on === '1');
  try {
    await camTrack.applyConstraints({ advanced: [{ torch: on }] });
    $('#cam-torch').dataset.on = on ? '1' : '0';
    $('#cam-torch').textContent = on ? '손전등 끄기' : '손전등';
  } catch (e) { $('#cam-torch').hidden = true; }
});

/* ── 측정 ── */
const STEPS = ['사진 읽는 중', '종이 인식 중', '원근 펴는 중', '발 인식 중', '치수 재는 중',
  '옆면 읽는 중', '기준자 찾는 중', '아치 재는 중', '교차검증 중', '완료'];

function setProgress(step, frac) {
  const pct = Math.round(frac * 100);
  $('#ring-val').textContent = pct + '%';
  const C = 2 * Math.PI * 58;
  $('#ring-fg').style.strokeDashoffset = String(C * (1 - frac));
  $('#proc-step').textContent = step;
  const idx = STEPS.indexOf(step);
  $('#steplist').innerHTML = STEPS.slice(0, 5).concat(hasSide() ? STEPS.slice(5, 9) : []).map(s => {
    const i = STEPS.indexOf(s);
    const cls = i < idx ? 'done' : (i === idx ? 'on' : '');
    return `<div class="stepline ${cls}"><span class="dot"></span>${s}</div>`;
  }).join('');
}
const hasSide = () => !!(photos.right_side || photos.left_side);

$('#measure').addEventListener('click', async () => {
  show('processing');
  setProgress('사진 읽는 중', 0.02);
  $('#live').textContent = '측정을 시작합니다';
  try {
    const res = await scan({
      rightTop: photos.right_top?.file, rightSide: photos.right_side?.file,
      leftTop: photos.left_top?.file, leftSide: photos.left_side?.file,
    }, (step, frac) => setProgress(step, frac));
    saveScan(res);
    renderResult(res);
    show('result');
    $('#live').textContent = '측정이 끝났습니다';
  } catch (err) {
    renderError(err);
    show('error');
  }
});

/* ── 결과 그리기 ── */
let lastResult = null;

function footCard(f) {
  if (!f) return '';
  const t = f.top, s = f.lateral;
  const name = f.side === 'right' ? '오른발' : '왼발';
  let h = `<div class="card"><h2>${name}</h2>
    <div class="hero"><div class="big">${t.foot_length_mm.toFixed(1)}<span class="u">mm</span></div>
    <div class="cap">발 길이</div></div>`;
  h += `<div class="row"><span class="k">발볼 너비</span><span class="v">${t.ball_width_mm.toFixed(1)} mm</span></div>`;
  h += `<div class="row"><span class="k">뒤꿈치 너비</span><span class="v">${t.heel_width_mm.toFixed(1)} mm</span></div>`;
  h += `<div class="row"><span class="k">발가락 형태</span><span class="v">${TOE_KR[t.toe_type] || t.toe_type}</span></div>`;
  if (t.hallux_valgus_angle_deg != null) {
    h += `<div class="row"><span class="k">엄지 기울기<br><span style="font-size:12px">겉모양 기반 추정</span></span><span class="v">${t.hallux_valgus_angle_deg.toFixed(1)}°</span></div>`;
  }
  if (s) {
    h += `<div class="row"><span class="k">아치</span><span class="v"><span class="grade ${s.arch_grade}">${ARCH_KR[s.arch_grade]}</span></span></div>`;
    h += `<div class="row"><span class="k">아치 들림 <span style="font-size:12px">(보조값)</span></span><span class="v">${s.arch_clearance_mm.toFixed(1)} mm</span></div>`;
    h += `<div class="row"><span class="k">발등 높이</span><span class="v">${s.instep_height_mm.toFixed(1)} mm</span></div>`;
    h += `<div class="row"><span class="k">길이 교차검증</span><span class="v">옆면 ${s.foot_length_side_mm.toFixed(1)}mm · 차이 ${s.cross_check_delta_mm.toFixed(1)}mm</span></div>`;
  } else {
    h += `<div class="row"><span class="k">아치 · 발등</span><span class="v" style="color:var(--muted)">미측정</span></div>`;
  }
  const imgs = f.debug_images || {};
  if (imgs.top || imgs.side) {
    h += `<details><summary>측정 과정 사진 보기 — 값이 이상할 때 확인용</summary>`;
    if (imgs.top) h += `<figure style="margin:0"><img src="${imgs.top}" alt="위에서 잰 과정"><figcaption>초록=발 윤곽, 파랑=측정선, 점=찾아낸 발가락(빨강이 엄지)</figcaption></figure>`;
    if (imgs.side) h += `<figure style="margin:12px 0 0"><img src="${imgs.side}" alt="옆에서 잰 과정"><figcaption>빨강=바닥선, 분홍=바닥에 닿은 구간, 노랑=아치 최고점, 파랑=발등 높이</figcaption></figure>`;
    h += `</details>`;
  }
  return h + `</div>`;
}

function sizeCard(rec) {
  if (!rec) return '';
  let h = `<div class="card"><h2>신발 사이즈 <span class="sub">(참고용)</span></h2><div class="tabs" id="shoe-tabs">`;
  rec.options.forEach((o, i) => {
    h += `<button class="tab ${i === 1 ? 'on' : ''}" data-i="${i}">${SHOE_KR[o.shoe_type] || o.shoe_type}</button>`;
  });
  h += `</div><div id="size-body"></div>`;
  if (rec.width_grade_label) {
    h += `<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line-soft)">
            <div class="sub" style="font-size:14px">발볼 폭</div>
            <div style="font-weight:800;font-size:17px;margin-top:2px">${esc(rec.width_grade_label)}</div></div>`;
  }
  rec.notes.forEach(n => { h += `<p class="sub" style="margin:10px 0 0;font-size:13.5px">· ${esc(n)}</p>`; });
  return h + `</div>`;
}

function drawSize(rec, i) {
  const o = rec.options[i];
  const f = v => (v == null ? '–' : v);
  $('#size-body').innerHTML =
    `<div class="hero" style="padding:2px 0 0"><div class="big">${o.kr_jp_mm}<span class="u">mm</span></div>
     <div class="cap">KR / JP · 발 길이 ${rec.based_on_length_mm.toFixed(1)}mm + 여유 ${o.allowance_mm}mm</div></div>
     <div class="sizegrid">
       <div><div class="lab">US 남</div><div class="val">${f(o.us_men)}</div></div>
       <div><div class="lab">US 여</div><div class="val">${f(o.us_women)}</div></div>
       <div><div class="lab">EU</div><div class="val">${f(o.eu)}</div></div>
       <div><div class="lab">UK</div><div class="val">${f(o.uk)}</div></div>
     </div>`;
}

function renderResult(d) {
  lastResult = d;
  const feet = [d.right, d.left].filter(Boolean);
  const minConf = Math.min(...feet.map(f => f.confidence));
  let h = '';

  if (minConf < 0.7) {
    h += `<div class="note bad"><b>측정 신뢰도가 낮습니다 (${minConf.toFixed(2)})</b><br>
          아래 값은 참고만 하시고, 안내에 맞춰 다시 찍어 주세요.</div>`;
  }
  const warns = [...new Set(feet.flatMap(f => f.warnings))].filter(w => !w.startsWith('[LOW_CONFIDENCE]'));
  warns.forEach(w => { h += `<div class="note warn">${esc(w)}</div>`; });

  h += feet.map(footCard).join('');

  if (d.asymmetry_mm != null) {
    h += `<div class="card"><h2>좌우 비교</h2>
      <div class="row"><span class="k">길이 차이</span><span class="v">${d.asymmetry_mm.toFixed(1)} mm</span></div>
      <p class="sub" style="margin:10px 0 0">${d.asymmetry_mm >= 4
        ? '차이가 있어 큰 발 기준으로 사이즈를 잡았습니다.' : '좌우가 거의 같습니다.'}</p></div>`;
  }
  h += sizeCard(d.recommended_size);
  h += `<p class="sub" style="text-align:center">측정 ${d.elapsed_sec}초 · ${new Date(d.scanned_at).toLocaleString('ko-KR')}</p>`;
  $('#result-body').innerHTML = h;

  if (d.recommended_size) {
    drawSize(d.recommended_size, 1);
    $$('#shoe-tabs .tab').forEach(tab => tab.addEventListener('click', () => {
      $$('#shoe-tabs .tab').forEach(t => t.classList.remove('on'));
      tab.classList.add('on');
      drawSize(d.recommended_size, +tab.dataset.i);
    }));
  }
}

function renderError(e) {
  const code = e.code || 'UNKNOWN';
  const msg = e.userMessage || e.message || '측정에 실패했습니다.';
  $('#error-body').innerHTML =
    `<div class="note bad"><b>${esc(msg)}</b></div>` +
    (e.hint ? `<div class="card"><h2>이렇게 해보세요</h2><p style="margin:0">${esc(e.hint)}</p></div>` : '') +
    `<p class="sub">오류 코드: ${esc(code)}${e.stage ? ' · 단계: ' + esc(e.stage) : ''}</p>`;
  $('#live').textContent = '측정에 실패했습니다. ' + msg;
}

$('#again').addEventListener('click', () => { show('capture'); });
$('#err-retry').addEventListener('click', () => { show('capture'); });
$('#err-home').addEventListener('click', () => { show('home'); });
$('#go-guide').addEventListener('click', () => show('guide'));
$('#go-capture').addEventListener('click', () => show('capture'));

/* ── 결과 저장 · 공유 ── */
$('#share').addEventListener('click', async () => {
  if (!lastResult) return;
  const d = lastResult;
  const f = d.right || d.left;
  const lines = [
    '발 스캔 결과 (' + new Date(d.scanned_at).toLocaleDateString('ko-KR') + ')',
    '',
  ];
  [d.right, d.left].filter(Boolean).forEach(x => {
    lines.push(`${x.side === 'right' ? '오른발' : '왼발'} — 길이 ${x.top.foot_length_mm}mm · 발볼 ${x.top.ball_width_mm}mm`);
    if (x.lateral) lines.push(`  아치 ${ARCH_KR[x.lateral.arch_grade]} · 발등 ${x.lateral.instep_height_mm}mm`);
  });
  const rec = d.recommended_size;
  if (rec) {
    lines.push('', '추천 사이즈 (참고용)');
    rec.options.forEach(o => lines.push(`  ${SHOE_KR[o.shoe_type]} ${o.kr_jp_mm}mm`));
  }
  lines.push('', CFG.DISCLAIMER);
  const text = lines.join('\n');
  try {
    if (navigator.share) { await navigator.share({ title: '발 스캔 결과', text }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  try {
    await navigator.clipboard.writeText(text);
    $('#live').textContent = '결과를 복사했습니다';
    alert('결과를 복사했습니다. 메모나 메시지에 붙여넣어 주세요.');
  } catch (e) {
    alert(text);
  }
});

/* ── 측정 이력 (이 폰에만 저장) ── */
const STORE_KEY = 'footscan.scans.v1';
function loadScans() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch (e) { return []; }
}
function saveScan(d) {
  // 확인용 사진은 용량이 커서 저장하지 않고, 측정값만 남깁니다
  const slim = {
    id: Date.now().toString(36),
    at: d.scanned_at,
    asym: d.asymmetry_mm,
    conf: Math.min(...[d.right, d.left].filter(Boolean).map(f => f.confidence)),
    size: d.recommended_size ? d.recommended_size.options.find(o => o.shoe_type === 'sneakers')?.kr_jp_mm : null,
    feet: [d.right, d.left].filter(Boolean).map(f => ({
      side: f.side, len: f.top.foot_length_mm, ball: f.top.ball_width_mm,
      heel: f.top.heel_width_mm, toe: f.top.toe_type,
      arch: f.lateral ? f.lateral.arch_grade : null,
      archMm: f.lateral ? f.lateral.arch_clearance_mm : null,
      instep: f.lateral ? f.lateral.instep_height_mm : null,
    })),
  };
  try {
    const all = loadScans();
    all.unshift(slim);
    localStorage.setItem(STORE_KEY, JSON.stringify(all.slice(0, 50)));
  } catch (e) { /* 저장 공간이 없어도 측정 자체는 계속됩니다 */ }
  renderHomeRecent();
}
function deleteScan(id) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(loadScans().filter(s => s.id !== id)));
  } catch (e) { }
  renderHistory(); renderHomeRecent();
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}

function renderHomeRecent() {
  const all = loadScans();
  const box = $('#home-recent');
  if (!all.length) { box.innerHTML = ''; return; }
  const s = all[0];
  const big = Math.max(...s.feet.map(f => f.len));
  box.innerHTML = `<h2 style="margin:20px 0 10px">최근 측정</h2>
    <button class="hist" data-id="${s.id}">
      <span class="d"><b>${fmtDate(s.at)}</b><span>${s.feet.map(f => (f.side === 'right' ? '오른' : '왼') + ' ' + f.len.toFixed(1) + 'mm').join(' · ')}${s.size ? ' · 스니커즈 ' + s.size + 'mm' : ''}</span></span>
      <span class="n">${big.toFixed(0)}<small>mm</small></span>
    </button>`;
  box.querySelector('.hist').addEventListener('click', () => { renderHistory(); show('history'); });
}

function renderHistory() {
  const all = loadScans();
  const box = $('#hist-body');
  if (!all.length) {
    box.innerHTML = `<div class="empty"><span class="ico">🕘</span>아직 측정 기록이 없습니다.<br>측정을 한 번 하면 여기에 쌓입니다.</div>`;
    return;
  }
  box.innerHTML = all.map(s => {
    const big = Math.max(...s.feet.map(f => f.len));
    const arch = s.feet.find(f => f.arch);
    return `<div class="card flat" style="padding:14px">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="flex:1;min-width:0">
          <b style="font-size:15.5px">${fmtDate(s.at)}</b>
          <div class="sub" style="font-size:13px">
            ${s.feet.map(f => (f.side === 'right' ? '오른' : '왼') + ' ' + f.len.toFixed(1) + 'mm').join(' · ')}
            ${arch ? ' · 아치 ' + ARCH_KR[arch.arch] : ''}
            ${s.conf < 0.7 ? ' · <span style="color:var(--bad)">신뢰도 낮음</span>' : ''}
          </div>
        </div>
        <div class="n" style="font-size:20px;font-weight:800">${big.toFixed(0)}<small style="font-size:12px;color:var(--muted)">mm</small></div>
        <button class="iconbtn" data-del="${s.id}" aria-label="이 기록 지우기" style="flex:0 0 44px;width:44px;height:44px;font-size:17px">🗑</button>
      </div></div>`;
  }).join('') + `<button class="btn quiet" id="clear-all" style="margin-top:8px">기록 전체 지우기</button>`;

  box.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    if (confirm('이 기록을 지울까요?')) deleteScan(b.dataset.del);
  }));
  const ca = box.querySelector('#clear-all');
  if (ca) ca.addEventListener('click', () => {
    if (confirm('측정 기록을 모두 지울까요? 되돌릴 수 없습니다.')) {
      try { localStorage.removeItem(STORE_KEY); } catch (e) { }
      renderHistory(); renderHomeRecent();
    }
  });
}

/* ── 시작 ── */
let bootSec = 0;
const bootTimer = setInterval(() => {
  bootSec++;
  $('#boot-sec').textContent = bootSec + '초 경과';
  // 내려받는 것이 없으므로 보통 1초 안에 끝납니다. 오래 걸리면 브라우저 문제입니다.
  if (bootSec === 10) $('#boot-msg').innerHTML = '평소보다 오래 걸립니다.<br>화면을 새로고침해 주세요.';
}, 1000);

function onEngineReady() {
  clearInterval(bootTimer);
  renderHomeRecent();
  const s = (location.hash || '#home').slice(1);
  show(SCREENS[s] && s !== 'boot' && s !== 'processing' ? s : 'home', { push: false });
  history.replaceState({ screen: current }, '', '#' + current);
}

function onEngineFailed() {
  clearInterval(bootTimer);
  $('#s-boot').innerHTML = `
    <div class="note bad" style="margin-top:40px">
      <b>측정 엔진을 불러오지 못했습니다.</b><br>
      화면을 새로고침해 주세요. 그래도 안 되면 <b>크롬 최신 버전</b>에서 열어 주세요.
      (인터넷 문제는 아닙니다 &mdash; 이 앱은 인터넷을 쓰지 않습니다)
    </div>`;
}
