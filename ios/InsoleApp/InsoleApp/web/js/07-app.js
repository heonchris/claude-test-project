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
  /* 화면에 쓰는 값. 원시값에서 영점을 빼고 떨림을 완화한 결과입니다. */
  var shown = { L: new Array(C.CHANNELS).fill(0), R: new Array(C.CHANNELS).fill(0) };

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
    var v = shown;
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

      var raw = S.read();
      INSOLE.health.push(raw);
      /* 영점 보정 + 떨림 완화를 거친 값을 화면에 씁니다. */
      shown = INSOLE.health.corrected(raw);

      var v = shown;
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
      renderHealth();
    }
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    running = true; t0 = 0; lastFrame = 0; history = [];
    S.resetReps();
    INSOLE.health.reset();
    /* 측정 중 화면이 꺼지면 아무 소용이 없습니다. */
    INSOLE.wakelock.acquire();
    session = { lr: [], ap: [], cop: [] };
    $("recBtn").classList.add("on");
    $("recTxt").textContent = "측정 정지";
    $("recBtn").querySelector("span").className = "sq";
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    INSOLE.wakelock.release();
    $("recBtn").classList.remove("on");
    $("recTxt").textContent = "측정 시작";
    $("recBtn").querySelector("span").className = "ci";

    /* 너무 짧은 세션은 통계가 무의미하므로 버립니다. */
    if (session && session.lr.length >= 10) {
      var now = new Date();
      var v = shown;
      var rec = INSOLE.report.build(session, {
        id: nextId++,
        scenario: S.labelOf(S.getScenario()),
        time: String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0"),
        duration: elapsed.toFixed(1),
        reps: S.getReps(),
        snapshot: v
      });
      records.unshift(rec);
      if (records.length > C.MAX_RECORDS) records.length = C.MAX_RECORDS;
      INSOLE.storage.save(records);
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
    $("histBar").hidden = !records.length;

    /* 한도에 다다르면 알려줍니다. 말없이 사라지면 안 됩니다. */
    var note = $("capNote");
    if (records.length >= C.MAX_RECORDS) {
      note.innerHTML = "기록이 가득 찼습니다 (" + C.MAX_RECORDS + "건). " +
        "새로 측정하면 <b>가장 오래된 기록이 사라집니다.</b> 필요하면 먼저 내보내기 하세요.";
      note.hidden = false;
    } else {
      note.hidden = true;
    }
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

  /* ── 진단 화면 ────────────────────────────────────────────*/
  var STATE_LABEL = { ok: "정상", dead: "끊김", sat: "포화", unknown: "확인 중" };

  function renderHealth() {
    var sum = INSOLE.health.summary();

    /* 문제가 있을 때만 측정 화면에 경고 줄을 띄웁니다.
     * 항상 띄우면 아무도 보지 않게 됩니다. */
    var bar = $("alertBar");
    if (sum.problems.length) {
      var dead = sum.problems.filter(function (p) { return p.state === "dead"; }).length;
      var sat  = sum.problems.length - dead;
      var parts = [];
      if (dead) parts.push("끊김 " + dead + "개");
      if (sat)  parts.push("포화 " + sat + "개");
      bar.innerHTML = '<b>채널 이상</b> ' + parts.join(" · ") +
                      '<span class="go">진단 보기 ›</span>';
      bar.hidden = false;
    } else {
      bar.hidden = true;
    }

    /* 진단 탭이 보일 때만 표를 그립니다. 30Hz 로 항상 그리면 낭비입니다. */
    if (!$("sc-diag").classList.contains("on")) return;

    var hz = INSOLE.health.actualHz();
    var live = INSOLE.health.isLive();
    /* 측정 중인데 데이터가 안 오면 '끊김'. 이게 진단의 핵심입니다. */
    var st = !running ? "대기" : (live ? "수신 중" : "끊김");
    var dEl = $("dState");
    dEl.textContent = st;
    dEl.className = "v " + (st === "끊김" ? "bad" : st === "수신 중" ? "good" : "");
    $("dHz").innerHTML = (hz ? hz.toFixed(1) : "–") + '<small>Hz</small>';
    $("dOk").innerHTML = sum.ok + '<small>/' + (C.CHANNELS * 2) + '</small>';
    var bad = $("dBad");
    bad.textContent = sum.problems.length ? String(sum.problems.length) : "0";
    bad.className = "v " + (sum.problems.length ? "bad" : "good");

    /* 무선이 불안정한지 판단하는 근거입니다. 시뮬레이션 중에는 뜻이 없어
     * 가로줄로 둡니다. */
    var st = INSOLE.ble.stats();
    var onBle = INSOLE.sensor.getSource() === "ble";
    $("dPkt").textContent  = onBle ? String(st.packets) : "–";
    var dp = $("dDrop");
    dp.textContent = onBle ? String(st.dropped) : "–";
    dp.className = "v " + (onBle && st.dropped > 0 ? "bad" : "");

    var html = "";
    ["L", "R"].forEach(function (side) {
      for (var i = 0; i < C.CHANNELS; i++) {
        var n = side === "L" ? i + 1 : i + 1 + C.CHANNELS;
        var val = shown[side][i];
        var st = INSOLE.health.channelState(side, i);
        html += '<tr><td class="n">ch' + n + '</td><td>' +
                (side === "L" ? "왼" : "오른") + '·' + C.SENSORS[i].name + '</td>' +
                '<td class="n">' + val + '</td>' +
                '<td style="width:26%"><span class="bar' + (side === "R" ? " r" : "") +
                '" style="width:' + (val / C.MAX_RAW * 100) + '%"></span></td>' +
                '<td><span class="st st-' + st + '">' + STATE_LABEL[st] + '</span></td></tr>';
      }
    });
    $("diagTable").querySelector("tbody").innerHTML = html;
  }

  /* 앱바의 연결 표시와 진단 탭의 연결 카드를 한 곳에서 갱신합니다. */
  function renderConnection() {
    var onBle = INSOLE.sensor.getSource() === "ble";
    var pill = $("conn"), txt = $("connTxt");
    pill.classList.toggle("live", onBle);
    txt.textContent = onBle ? (INSOLE.ble.deviceName() || "인솔 연결됨") : "시뮬레이션";

    $("bleMode").textContent = onBle ? "실제 인솔" : "시뮬레이션";
    $("bleConnect").hidden = onBle;
    $("bleDisconnect").hidden = !onBle;

    var hint = $("bleHint");
    if (onBle) {
      hint.innerHTML = "<b>" + (INSOLE.ble.deviceName() || "인솔") + "</b> 에서 실제 값을 받고 있습니다. " +
                       "설정 탭의 시연 시나리오는 이때 동작하지 않습니다.";
    } else if (INSOLE.ble.supported()) {
      hint.textContent = "실제 인솔을 연결하면 시뮬레이션 대신 진짜 값이 들어옵니다.";
      $("bleConnect").disabled = false;
    } else {
      hint.textContent = INSOLE.ble.unsupportedReason();
      $("bleConnect").disabled = true;
    }
  }

  function renderZeroState() {
    $("zeroState").textContent = INSOLE.health.hasZero() ? "적용 중" : "설정 안 됨";
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
  var TITLES = { live: "측정", hist: "기록", diag: "진단", set: "설정" };

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
      ["live", "hist", "diag", "set"].forEach(function (s) {
        $("sc-" + s).classList.toggle("on", s === key);
      });
      $("screenTitle").textContent = TITLES[key];
      $("recdock").hidden = (key !== "live");
      $("sheet").classList.remove("on");
      if (key === "live") requestAnimationFrame(function () {
        INSOLE.chart.resize(); INSOLE.chart.draw(history);
      });
      if (key === "diag") renderHealth();
      /* 탭에 들어올 때마다 다시 그립니다. 안 그러면 한도 안내 같은 것이
       * 낡은 상태로 남습니다. */
      if (key === "hist") renderHistory();
    });

    $("histList").addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-id]");
      if (!btn) return;
      var id = +btn.getAttribute("data-id");
      for (var i = 0; i < records.length; i++) {
        if (records[i].id === id) { openReport(records[i]); return; }
      }
    });

    /* 경고 줄을 누르면 진단 탭으로 이동 */
    $("alertBar").addEventListener("click", function () {
      var t = document.querySelector('.tabbar button[data-t="diag"]');
      if (t) t.click();
    });

    /* 기기 선택 창은 사용자가 버튼을 눌러야만 열 수 있습니다. */
    $("bleConnect").addEventListener("click", function () {
      var btn = this;
      btn.disabled = true; btn.textContent = "연결 중…";
      INSOLE.ble.connect().catch(function () {}).then(function () {
        btn.disabled = false; btn.textContent = "인솔 연결";
        renderConnection();
      });
    });
    $("bleDisconnect").addEventListener("click", function () {
      INSOLE.ble.disconnect();
      renderConnection();
    });
    /* 앱바의 연결 표시를 누르면 진단 탭으로 갑니다. */
    $("conn").addEventListener("click", function () {
      var t = document.querySelector('.tabbar button[data-t="diag"]');
      if (t) t.click();
    });

    /* 연결이 끊기면 사용자에게 바로 알려야 합니다. 조용히 시뮬레이션으로
     * 돌아가면 가짜 데이터를 실제 값으로 착각하게 됩니다. */
    INSOLE.ble.onChange(function (type, detail) {
      renderConnection();
      if (type === "disconnected" && running) {
        $("bleHint").innerHTML = "<b>연결이 끊겼습니다.</b> 인솔 전원과 거리를 확인한 뒤 다시 연결하세요.";
      }
      if (type === "error") {
        $("bleHint").textContent = "연결하지 못했습니다 — " + (detail.message || "알 수 없는 오류");
      }
    });

    $("zeroBtn").addEventListener("click", function () {
      INSOLE.health.captureZero(S.read());
      renderZeroState();
      renderHealth();
    });
    $("zeroClear").addEventListener("click", function () {
      INSOLE.health.clearZero();
      renderZeroState();
      renderHealth();
    });

    $("exportBtn").addEventListener("click", function () {
      var csv = INSOLE.storage.toCSV(records);
      $("exportText").value = csv;
      $("exportBox").hidden = false;
      /* 되는 환경에서는 바로 파일로 내려받고, 막힌 곳에서는 위 상자를 씁니다. */
      INSOLE.storage.download(csv, "insole-records.csv");
      $("exportBox").scrollIntoView({ block: "nearest" });
    });
    $("copyBtn").addEventListener("click", function () {
      var btn = this;
      Promise.resolve(INSOLE.storage.copy($("exportText").value)).then(function () {
        btn.textContent = "복사됨";
        setTimeout(function () { btn.textContent = "복사"; }, 1500);
      });
    });
    $("exportClose").addEventListener("click", function () { $("exportBox").hidden = true; });

    /* 확인 창(confirm)은 일부 환경에서 차단됩니다. 차단되면 삭제가
     * 조용히 무시되어 사용자가 영문을 모릅니다. 두 번 누르기로 대신합니다. */
    var clearArmed = false, clearTimer = null;
    $("clearBtn").addEventListener("click", function () {
      var btn = this;
      if (!clearArmed) {
        clearArmed = true;
        btn.textContent = "한 번 더 누르면 삭제";
        clearTimer = setTimeout(function () {
          clearArmed = false; btn.textContent = "전체 삭제";
        }, 4000);
        return;
      }
      clearTimeout(clearTimer);
      clearArmed = false; btn.textContent = "전체 삭제";
      records = [];
      INSOLE.storage.clear();
      $("exportBox").hidden = true;
      renderHistory();
    });

    $("scenList").addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-s]");
      if (!btn) return;
      if (S.getSource() === "ble") return;   /* 실제 연결 중에는 무시 */
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
    /* 지난번에 저장해 둔 기록을 되살립니다. */
    records = INSOLE.storage.load();
    records.forEach(function (r) { if (r.id >= nextId) nextId = r.id + 1; });
    INSOLE.health.loadZero();

    paintRamp();
    INSOLE.chart.attach($("chart"));
    wire();
    renderScenarios();
    renderHistory();
    tickClock();
    setInterval(tickClock, 20000);

    shown = S.read();
    INSOLE.heatmap.draw($("footL"), "L", shown);
    INSOLE.heatmap.draw($("footR"), "R", shown);
    INSOLE.chart.draw(history);
    renderLive();
    renderZeroState();
    renderConnection();
    renderHealth();
  }

  /* 테마가 바뀌면 램프를 다시 만들고 캔버스를 다시 그립니다.
   * 캔버스는 CSS 변수를 자동으로 따라가지 않기 때문입니다. */
  function onThemeChange() {
    paintRamp();
    INSOLE.heatmap.draw($("footL"), "L", shown);
    INSOLE.heatmap.draw($("footR"), "R", shown);
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
