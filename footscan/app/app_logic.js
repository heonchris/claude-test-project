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
  processing: { title: '측정 중', back: false, hist: false },
  result: { title: '측정 결과', back: true, hist: true },
  error: { title: '측정 실패', back: true, hist: false },
  history: { title: '측정 이력', back: true, hist: false },
};
let current = 'boot';

function show(name, { push = true } = {}) {
  if (!SCREENS[name]) return;
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
    $('#filepick').click();
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
        <button class="iconbtn" data-del="${s.id}" aria-label="이 기록 지우기" style="width:36px;height:36px;font-size:16px">🗑</button>
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
  if (bootSec === 25) $('#boot-msg').innerHTML = '연결이 느린 것 같습니다.<br>와이파이에서 열면 더 빠릅니다.';
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
      인터넷 연결을 확인하고 화면을 새로고침해 주세요.
      (처음 한 번은 인터넷이 필요합니다. 그 다음부터는 저장된 것을 씁니다)
    </div>`;
}
