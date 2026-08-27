/* ============================================================
 * 08-health.js — 채널 상태 진단
 *
 * 실물 센서를 붙이면 채널 하나가 죽거나 포화되는 일이 흔합니다.
 * 히트맵만 봐서는 알아채기 어려우므로 여기서 판정해 알려줍니다.
 *
 * 부가로 영점 보정과 값 떨림 완화도 담당합니다.
 * ============================================================ */
var INSOLE = window.INSOLE || {};

INSOLE.health = (function () {
  "use strict";
  var C = INSOLE.config;

  /* 채널별 최근값 링버퍼. [side][ch] = [값, 값, ...] */
  var win = { L: [], R: [] };
  /* 영점: 발을 올리기 전 기준값. 빼고 나서 화면에 씁니다. */
  var zero = { L: null, R: null };
  /* 떨림 완화용 최근값 */
  var smooth = { L: [], R: [] };

  function init() {
    ["L", "R"].forEach(function (s) {
      win[s] = []; smooth[s] = [];
      for (var i = 0; i < C.CHANNELS; i++) { win[s].push([]); smooth[s].push([]); }
    });
  }
  init();

  /**
   * 수신한 원시값을 앱이 쓸 수 있게 정리합니다.
   * DATA_CONTRACT 에서 0xFFFF 는 채널 미연결/오류로 약속했습니다.
   * 그대로 두면 65535 가 히트맵과 합계를 전부 망가뜨립니다.
   */
  var ERR_VALUE = 0xFFFF;
  function sanitize(values) {
    ["L", "R"].forEach(function (side) {
      for (var i = 0; i < C.CHANNELS; i++) {
        var v = values[side][i];
        if (v === ERR_VALUE || v > C.MAX_RAW || v < 0 || typeof v !== "number" || isNaN(v)) {
          values[side][i] = 0;   /* 0 이면 창 판정에서 '끊김' 으로 잡힙니다 */
        }
      }
    });
    return values;
  }

  /** 매 프레임 호출. 원시값을 받아 창에 쌓습니다. */
  function push(values) {
    sanitize(values);
    ["L", "R"].forEach(function (side) {
      for (var i = 0; i < C.CHANNELS; i++) {
        var w = win[side][i];
        w.push(values[side][i]);
        if (w.length > C.HEALTH_WINDOW) w.shift();
      }
    });
  }

  /**
   * 채널 하나의 상태.
   * @returns {"ok"|"dead"|"sat"|"unknown"}
   */
  function channelState(side, i) {
    var w = win[side][i];
    /* 창이 덜 찼으면 판단하지 않습니다. 성급한 경고는 혼란만 줍니다. */
    if (w.length < Math.min(30, C.HEALTH_WINDOW)) return "unknown";
    var mx = -1, mn = C.MAX_RAW + 1;
    for (var k = 0; k < w.length; k++) {
      if (w[k] > mx) mx = w[k];
      if (w[k] < mn) mn = w[k];
    }
    if (mx <= C.DEAD_MAX) return "dead";
    if (mn >= C.SAT_MIN)  return "sat";
    return "ok";
  }

  /** 전체 요약. { ok, dead, sat, unknown, problems: [{side,ch,state}] } */
  function summary() {
    var out = { ok: 0, dead: 0, sat: 0, unknown: 0, problems: [] };
    ["L", "R"].forEach(function (side) {
      for (var i = 0; i < C.CHANNELS; i++) {
        var st = channelState(side, i);
        out[st]++;
        if (st === "dead" || st === "sat") out.problems.push({ side: side, ch: i, state: st });
      }
    });
    return out;
  }

  /* ── 수신 주기와 연결 상태 ────────────────────────────────
   * 데이터가 끊겼는데 "30Hz 수신 중"이라고 표시하면 진단 화면이
   * 무의미해집니다. 반드시 마지막 수신 시각을 함께 봐야 합니다.
   */
  var stamps = [], lastStamp = 0;
  var STALE_MS = 1000;   /* 이만큼 소식이 없으면 끊긴 것으로 봅니다 */

  function now() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }
  function markFrame() {
    var t = now();
    lastStamp = t;
    stamps.push(t);
    if (stamps.length > 40) stamps.shift();
  }
  /** 마지막 수신 이후 지난 시간(ms). 한 번도 못 받았으면 Infinity. */
  function sinceLast() {
    return lastStamp ? (now() - lastStamp) : Infinity;
  }
  /** 데이터가 살아 있는가. */
  function isLive() { return sinceLast() < STALE_MS; }

  function actualHz() {
    /* 끊겼으면 과거 평균을 돌려주면 안 됩니다. */
    if (!isLive()) return 0;
    if (stamps.length < 5) return 0;
    var span = stamps[stamps.length - 1] - stamps[0];
    if (span <= 0) return 0;
    return (stamps.length - 1) / (span / 1000);
  }

  /* ── 영점 보정 ────────────────────────────────────────────
   * 발을 올리지 않은 상태에서 잡습니다. 센서마다 무부하 값이
   * 조금씩 달라서, 이걸 빼줘야 좌우 비교가 정확해집니다.
   */
  /**
   * 영점을 잡습니다.
   * 한 프레임만 쓰면 하필 값이 튄 순간에 걸려 기준선이 틀어지므로,
   * 최근 창의 평균을 씁니다. 창이 비어 있으면 현재값으로 대체합니다.
   */
  function captureZero(values) {
    ["L", "R"].forEach(function (side) {
      var base = [];
      for (var i = 0; i < C.CHANNELS; i++) {
        var w = win[side][i];
        if (w.length >= 5) {
          var sum = 0;
          for (var k = 0; k < w.length; k++) sum += w[k];
          base.push(Math.round(sum / w.length));
        } else {
          base.push(values[side][i]);
        }
      }
      zero[side] = base;
    });
    /* 이전 값이 남아 있으면 보정 직후 값이 0 으로 안 내려옵니다. */
    clearSmooth();
    saveZero();
  }
  function clearZero() { zero.L = null; zero.R = null; clearSmooth(); saveZero(); }
  function clearSmooth() {
    ["L", "R"].forEach(function (side) {
      for (var i = 0; i < C.CHANNELS; i++) smooth[side][i] = [];
    });
  }
  function hasZero() { return zero.L !== null; }

  /** 영점을 빼고 떨림을 완화한 값. 화면에는 이 값을 씁니다. */
  function corrected(values) {
    var out = { L: [], R: [] };
    ["L", "R"].forEach(function (side) {
      for (var i = 0; i < C.CHANNELS; i++) {
        var v = values[side][i];
        if (zero[side]) v = Math.max(0, v - zero[side][i]);

        var sm = smooth[side][i];
        sm.push(v);
        if (sm.length > C.SMOOTH_N) sm.shift();
        var sum = 0;
        for (var k = 0; k < sm.length; k++) sum += sm[k];
        out[side][i] = Math.round(sum / sm.length);
      }
    });
    return out;
  }

  /* 영점을 저장해 두면 앱을 껐다 켜도 다시 잡을 필요가 없습니다. */
  var ZKEY = "insole.zero.v1";
  function saveZero() {
    try {
      if (zero.L) localStorage.setItem(ZKEY, JSON.stringify(zero));
      else localStorage.removeItem(ZKEY);
    } catch (e) {}
  }
  function loadZero() {
    try {
      var raw = localStorage.getItem(ZKEY);
      if (!raw) return;
      var z = JSON.parse(raw);
      if (z && Array.isArray(z.L) && z.L.length === C.CHANNELS) { zero.L = z.L; zero.R = z.R; }
    } catch (e) {}
  }

  function reset() { init(); stamps = []; lastStamp = 0; }

  return {
    push: push, sanitize: sanitize,
    channelState: channelState, summary: summary,
    markFrame: markFrame, actualHz: actualHz, isLive: isLive, sinceLast: sinceLast,
    captureZero: captureZero, clearZero: clearZero, hasZero: hasZero, loadZero: loadZero,
    corrected: corrected, reset: reset
  };
})();
