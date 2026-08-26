/* ============================================================
 * 07-app.js — 화면 배선
 *
 * 탭 전환, 측정 시작/정지, 기록 저장, 리포트 시트를 담당합니다.
 * 계산 로직은 03-metrics / 06-report 에 있고 여기엔 없습니다.
 * ============================================================ */
(function () {
  "use strict";
  var C = INSOLE.config, S = INSOLE.sensor, M = INSOLE.metrics;

  var running = false, rafId = null, t0 = 0, lastFrame = 0, elapsed = 0;
  var history = [], session = null, records = [], nextId = 1;

  var $ = function (id) { return document.getElementById(id); };
  var pct = function (x) { return Math.round(x * 100); };

  /* ── 발산형 게이지 ────────────────────────────────────────
   * 중앙(50:50)을 기준으로 어느 쪽으로 얼마나 벗어났는지를
   * 막대의 방향과 길이로 보여줍니다. */
  function setGauge(fillId, textId, devId, ratio) {
    var dev = ratio - 0.5;
    var fill = $(fillId);
    fill.className = "bal-f" + (dev > 0 ? "" : " b");
    fill.style.left  = dev > 0 ? (50 - Math.abs(dev) * 100) + "%" : "50%";
    fill.style.width = (Math.abs(dev) * 100) + "%";
    $(textId).textContent = pct(ratio) + " : " + (100 - pct(ratio));
    $(devId).textContent  = "편차 " + Math.abs(pct(ratio) - 50) + "%p";
  }

  function renderLive() {
    var v = S.read();
    var total = M.sum(v.L) + M.sum(v.R);
    var lr = M.leftRightRatio(v);
    var ap = M.foreAftAverage(v);

    setGauge("balFill", "balTxt", "balDev", lr);
    setGauge("apFill",  "apTxt",  "apDev",  ap);

    $("pctL").textContent = total < 1 ? "–" : pct(lr) + "%";
    $("pctR").textContent = total < 1 ? "–" : (100 - pct(lr)) + "%";
    $("mTot").textContent  = total;
    $("mPeak").textContent = M.peak(v);
    $("mReps").textContent = S.getReps();
    $("liveT").textContent = running ? (elapsed.toFixed(1) + "초 측정 중") : "대기 중";
  }

  function frame(ts) {
    if (!running) return;
    if (!t0) t0 = ts;
    elapsed = (ts - t0) / 1000;

    /* 화면은 브라우저 주사율로 돌지만 데이터는 SAMPLE_HZ 로 고정합니다. */
    if (ts - lastFrame >= 1000 / C.SAMPLE_HZ) {
      lastFrame = ts;

      /* ★ 실제 센서를 붙이면 이 한 줄을 지우세요.
       *   BLE 알림이 INSOLE.sensor.values 를 직접 갱신합니다. */
      S.step(elapsed);

      var v = S.read();
      var tl = M.sum(v.L), tr = M.sum(v.R);
      history.push({ t: elapsed, l: tl, r: tr });
      if (history.length > 900) history.shift();

      if (session) {
        session.lr.push(M.leftRightRatio(v));
        session.ap.push(M.foreAftAverage(v));
        var cl = M.centerOfPressure(v, "L"), cr = M.centerOfPressure(v, "R");
        if (cl.total > 60 || cr.total > 60) {
          session.cop.push({ lx: cl.x, ly: cl.y, rx: cr.x, ry: cr.y });
        }
      }

      INSOLE.heatmap.draw($("footL"), "L", v);
      INSOLE.heatmap.draw($("footR"), "R", v);
      INSOLE.chart.draw(history);
      renderLive();
    }
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    running = true; t0 = 0; lastFrame = 0; history = [];
    S.resetReps();
    session = { lr: [], ap: [], cop: [] };
    $("recBtn").classList.add("on");
    $("recTxt").textContent = "측정 정지";
    $("recBtn").querySelector("span").className = "sq";
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    $("recBtn").classList.remove("on");
    $("recTxt").textContent = "측정 시작";
    $("recBtn").querySelector("span").className = "ci";

    /* 너무 짧은 세션은 통계가 무의미하므로 버립니다. */
    if (session && session.lr.length >= 10) {
      var now = new Date();
      var v = S.read();
      var rec = INSOLE.report.build(session, {
        id: nextId++,
        scenario: S.labelOf(S.getScenario()),
        time: String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0"),
        duration: elapsed.toFixed(1),
        reps: S.getReps(),
        snapshot: v
      });
      records.unshift(rec);
      renderHistory();
      openReport(rec);
    }
    session = null;
  }

  /* ── 리포트 시트 ──────────────────────────────────────────*/
  function tile(label, value) {
    return '<div class="rgi"><span class="l">' + label + '</span><span class="v">' + value + '</span></div>';
  }
  function openReport(rec) {
    var j = rec.judge;
    var statusVar = j.severity === 0 ? "good" : j.severity === 1 ? "warning" : "serious";
    var html =
      '<div class="verd ' + j.cls + '"><div class="vh">' +
      '<span style="color:var(--' + statusVar + ')">●</span><b>' + j.title + '</b></div>' +
      '<p>' + j.message + '</p></div>' +
      '<div class="rg">' +
        tile("평균 좌우", rec.lrText) + tile("최대 편차", rec.maxDev + "%p") +
        tile("평균 전후", rec.apText) + tile("COP 이동폭", rec.copRange + "mm") +
        tile("반복 횟수", rec.reps + "회") + tile("측정 시간", rec.duration + "초") +
      '</div>' +
      '<div class="card" style="margin-top:.7rem"><div class="card-t"><h2>채널별 수치</h2>' +
      '<span class="n">측정 종료 시점</span></div><table class="ch">';

    ["L", "R"].forEach(function (side) {
      for (var i = 0; i < C.CHANNELS; i++) {
        var num = side === "L" ? i + 1 : i + 1 + C.CHANNELS;
        var val = rec.snapshot[side][i];
        html += '<tr><td class="n">ch' + num + '</td><td>' +
                (side === "L" ? "왼" : "오른") + '·' + C.SENSORS[i].name + '</td>' +
                '<td class="n">' + val + '</td><td style="width:32%">' +
                '<span class="bar' + (side === "R" ? " r" : "") + '" style="width:' +
                (val / C.MAX_RAW * 100) + '%"></span></td></tr>';
      }
    });
    html += '</table></div><p class="disc"><b>본 리포트는 운동 자세 참고용입니다.</b> ' +
            '의학적 진단이나 질환 판정이 아니며, 통증이나 이상이 있으면 전문가와 상담하세요.</p>';

    $("sheetBody").innerHTML = html;
    $("sheet").classList.add("on");
  }

  /* ── 기록 목록 ────────────────────────────────────────────*/
  function renderHistory() {
    var el = $("histList");
    if (!records.length) {
      el.innerHTML = '<div class="empty"><b>기록이 없습니다</b>' +
                     '측정 탭에서 세트를 진행하면<br>여기에 자동으로 저장됩니다.</div>';
      return;
    }
    el.innerHTML = records.map(function (r) {
      return '<button class="rec-item" type="button" data-id="' + r.id + '">' +
             '<div class="ri-b"><span class="ri-t">' + r.scenario + '</span>' +
             '<span class="ri-s">' + r.time + ' · ' + r.duration + '초 · ' + r.reps +
             '회 · 좌우 ' + r.lrText + '</span></div>' +
             '<span class="chip ' + r.judge.chip + '">' + r.judge.short + '</span>' +
             '<span class="arrow">›</span></button>';
    }).join("");
  }

  /* ── 시나리오 목록 (시연 전용) ────────────────────────────*/
  function renderScenarios() {
    $("scenList").innerHTML = S.SCENARIOS.map(function (s) {
      return '<button class="opt" type="button" data-s="' + s.key + '">' +
             '<span class="ob">' + s.label + '<span class="od">' + s.desc + '</span></span>' +
             '<span class="ck">' + (s.key === S.getScenario() ? "✓" : "") + '</span></button>';
    }).join("");
  }

  /* ── 배선 ─────────────────────────────────────────────────*/
  var TITLES = { live: "측정", hist: "기록", set: "설정" };

  function wire() {
    $("recBtn").addEventListener("click", function () { running ? stop() : start(); });
    $("sheetClose").addEventListener("click", function () { $("sheet").classList.remove("on"); });

    document.querySelector(".tabbar").addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-t]");
      if (!btn) return;
      var key = btn.getAttribute("data-t");
      Array.prototype.forEach.call(this.querySelectorAll(".tab"), function (t) {
        t.setAttribute("aria-selected", String(t === btn));
      });
      ["live", "hist", "set"].forEach(function (s) {
        $("sc-" + s).classList.toggle("on", s === key);
      });
      $("screenTitle").textContent = TITLES[key];
      $("recdock").hidden = (key !== "live");
      $("sheet").classList.remove("on");
      if (key === "live") requestAnimationFrame(function () {
        INSOLE.chart.resize(); INSOLE.chart.draw(history);
      });
    });

    $("histList").addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-id]");
      if (!btn) return;
      var id = +btn.getAttribute("data-id");
      for (var i = 0; i < records.length; i++) {
        if (records[i].id === id) { openReport(records[i]); return; }
      }
    });

    $("scenList").addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-s]");
      if (!btn) return;
      S.setScenario(btn.getAttribute("data-s"));
      renderScenarios();
      if (running) { t0 = 0; history = []; S.resetReps(); session = { lr: [], ap: [], cop: [] }; }
    });
  }

  function paintRamp() {
    var stops = INSOLE.heatmap.buildRamp();
    var bar = $("rampBar");
    if (bar) bar.style.background = "linear-gradient(90deg," + stops.join(",") + ")";
  }

  function tickClock() {
    var d = new Date();
    $("clock").textContent = d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function boot() {
    paintRamp();
    INSOLE.chart.attach($("chart"));
    wire();
    renderScenarios();
    renderHistory();
    tickClock();
    setInterval(tickClock, 20000);

    var v = S.read();
    INSOLE.heatmap.draw($("footL"), "L", v);
    INSOLE.heatmap.draw($("footR"), "R", v);
    INSOLE.chart.draw(history);
    renderLive();
  }

  /* 테마가 바뀌면 램프를 다시 만들고 캔버스를 다시 그립니다.
   * 캔버스는 CSS 변수를 자동으로 따라가지 않기 때문입니다. */
  function onThemeChange() {
    paintRamp();
    var v = S.read();
    INSOLE.heatmap.draw($("footL"), "L", v);
    INSOLE.heatmap.draw($("footR"), "R", v);
    INSOLE.chart.draw(history);
  }
  var mq = window.matchMedia("(prefers-color-scheme: dark)");
  if (mq.addEventListener) mq.addEventListener("change", onThemeChange);
  else if (mq.addListener) mq.addListener(onThemeChange);
  new MutationObserver(onThemeChange).observe(document.documentElement,
    { attributes: true, attributeFilter: ["data-theme"] });

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      INSOLE.chart.resize();
      INSOLE.chart.draw(history);
    }, 140);
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
