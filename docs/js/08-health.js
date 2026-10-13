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
  /* 하중 판정용 참조값 캐시. 자세한 설명은 loadRef() 에 있습니다. */
  var seq = 0;
  var refCache = { L: null, R: null };
  /* 영점: 발을 올리기 전 기준값. 빼고 나서 화면에 씁니다. */
  var zero = { L: null, R: null };
  /* 떨림 완화용 최근값 */
  var smooth = { L: [], R: [] };

  function init() {
    ["L", "R"].forEach(function (s) {
      win[s] = []; smooth[s] = []; refCache[s] = null;
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
    seq++;
  }

  /* ── 하중 참조값 ──────────────────────────────────────────
   * "이 채널이 조용한데, 발에는 체중이 실려 있었나?" 를 답하기 위한 값.
   *
   * 프레임마다 '다른 채널 중 가장 큰 값' 을 본다. 합이 아니라 최대를
   * 쓰는 이유는, 채널이 늘어날수록 합의 기준이 흔들리기 때문이다.
   *
   * 두 가지를 참조에서 제외한다.
   *   · 판정 대상 자신 — 자기가 자기의 증거가 될 수 없다.
   *   · 포화된 채널 — 1023 에 붙어 버린 고장 채널은 하중이 아니다.
   *     빼지 않으면 고장난 채널 하나가 "체중이 실려 있다" 고 우겨서
   *     옆의 멀쩡한 채널까지 끊김으로 몰고 간다.
   *
   * 자신을 O(1) 로 빼내려고 1등과 2등을 같이 들고 있는다.
   * 캐시는 push 횟수로 무효화한다. */
  function satMask(side) {
    var m = [];
    for (var i = 0; i < C.CHANNELS; i++) {
      var w = win[side][i], mn = C.MAX_RAW + 1;
      for (var k = 0; k < w.length; k++) if (w[k] < mn) mn = w[k];
      m.push(w.length > 0 && mn >= C.SAT_MIN);
    }
    return m;
  }

  function loadRef(side) {
    var c = refCache[side];
    if (c && c.seq === seq) return c;
    var sat = satMask(side);
    var len = win[side][0] ? win[side][0].length : 0;
    var t1 = new Array(len), t1c = new Array(len), t2 = new Array(len);
    for (var j = 0; j < len; j++) {
      var a = -1, ac = -1, b = -1;
      for (var i = 0; i < C.CHANNELS; i++) {
        if (!isActive(side, i) || sat[i]) continue;
        var v = win[side][i][j];
        if (v > a) { b = a; a = v; ac = i; }
        else if (v > b) { b = v; }
      }
      t1[j] = a; t1c[j] = ac; t2[j] = b;
    }
    c = { seq: seq, t1: t1, t1c: t1c, t2: t2 };
    refCache[side] = c;
    return c;
  }

  /**
   * 채널 하나의 상태.
   * @returns {"ok"|"dead"|"sat"|"idle"|"unknown"|"off"}
   */
  /* 2점 구성에서는 나머지 자리가 추정값이므로 고장 판정을 하지 않습니다.
   * 하지 않으면 멀쩡한 기기가 '문제 채널 14개' 로 보입니다. */
  function isActive(side, i) {
    if (!INSOLE.expand) return true;
    return INSOLE.expand.isActive(side, i);
  }

  function channelState(side, i) {
    if (!isActive(side, i)) return "off";
    if (!isLive(side)) return "unknown";

    /* 데이터가 안 들어오는 중이면 상태를 단정하면 안 됩니다.
     * 이 처리가 없으면 측정을 멈춘 뒤에도 마지막 상태가 그대로 굳어서
     * "포화" 경고가 영영 남아 있게 됩니다. */
    var w = win[side][i];
    /* 창이 덜 찼으면 판단하지 않습니다. 성급한 경고는 혼란만 줍니다. */
    if (w.length < Math.min(30, C.HEALTH_WINDOW)) return "unknown";
    var mx = -1, mn = C.MAX_RAW + 1;
    for (var k = 0; k < w.length; k++) {
      if (w[k] > mx) mx = w[k];
      if (w[k] < mn) mn = w[k];
    }

    /* 계속 최대치에 붙어 있으면 하중과 무관하게 포화입니다. */
    if (mn >= C.SAT_MIN) return "sat";

    /* 스스로 큰 값을 낸 적이 있으면 그것만으로 살아 있는 증거입니다.
     * 지금 발을 떼고 있어도 고장이 아닙니다. */
    if (mx >= C.LOAD_MIN) return "ok";

    /* 여기부터는 이 채널이 조용한 경우입니다. 조용한 이유가
     * 고장인지 안 밟아서인지는, 같은 발의 '다른' 채널이 하중을
     * 보고 있었는지로만 갈립니다. */
    var ref = loadRef(side), loaded = 0, mxLoaded = -1;
    for (var j = 0; j < w.length; j++) {
      var other = (ref.t1c[j] === i) ? ref.t2[j] : ref.t1[j];
      if (other < C.LOAD_MIN) continue;
      loaded++;
      if (w[j] > mxLoaded) mxLoaded = w[j];
    }
    /* 하중이 실린 적이 없으면 판정 근거가 없습니다.
     * 여기서 "끊김" 이라고 하면, 가만히 있는 멀쩡한 기기가
     * 매번 '문제 채널 3개' 로 보입니다. */
    if (loaded < C.LOAD_FRAMES) return "idle";

    if (mxLoaded <= C.DEAD_MAX) return "dead";
    return "ok";
  }

  /** 전체 요약. { ok, dead, sat, unknown, problems: [{side,ch,state}] } */
  function summary() {
    var out = { ok: 0, dead: 0, sat: 0, idle: 0, unknown: 0, off: 0, total: 0, problems: [] };
    ["L", "R"].forEach(function (side) {
      for (var i = 0; i < C.CHANNELS; i++) {
        var st = channelState(side, i);
        out[st]++;
        if (st !== "off") out.total++;        /* 쓰지 않는 자리는 분모에서 뺀다 */
        if (st === "dead" || st === "sat") out.problems.push({ side: side, ch: i, state: st });
      }
    });
    return out;
  }

  /* ── 수신 주기와 연결 상태 ────────────────────────────────
   * 데이터가 끊겼는데 "30Hz 수신 중"이라고 표시하면 진단 화면이
   * 무의미해집니다. 반드시 마지막 수신 시각을 함께 봐야 합니다.
   */
  /* 발마다 따로 셉니다. 발마다 기기가 하나씩이라 한쪽만 끊길 수 있는데,
   * 하나로 묶어 보면 오른발이 죽어도 왼발 덕분에 '수신 중' 으로 보입니다.
   * 그러면 0 으로 남은 오른발 때문에 **없는 좌우 쏠림**이 만들어집니다. */
  var feed = {
    L: { stamps: [], last: 0 },
    R: { stamps: [], last: 0 }
  };
  var STALE_MS = 1000;   /* 이만큼 소식이 없으면 끊긴 것으로 봅니다 */

  function now() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  /** side 를 주지 않으면 양발 모두 표시합니다(시뮬레이터용). */
  function markFrame(side) {
    var t = now();
    var sides = (side === "L" || side === "R") ? [side] : ["L", "R"];
    sides.forEach(function (s) {
      var f = feed[s];
      f.last = t;
      f.stamps.push(t);
      if (f.stamps.length > 40) f.stamps.shift();
    });
  }

  /** 마지막 수신 이후 지난 시간(ms). 한 번도 못 받았으면 Infinity. */
  function sinceLast(side) {
    if (side === "L" || side === "R") {
      return feed[side].last ? (now() - feed[side].last) : Infinity;
    }
    return Math.min(sinceLast("L"), sinceLast("R"));
  }

  /** 데이터가 살아 있는가. side 를 주면 그 발만. */
  function isLive(side) { return sinceLast(side) < STALE_MS; }

  /** 양발이 모두 살아 있는가. 좌우 비교는 이때만 뜻이 있습니다. */
  function bothLive() { return isLive("L") && isLive("R"); }

  /** 끊긴 발 목록. */
  function deadSides() {
    return ["L", "R"].filter(function (s) { return !isLive(s); });
  }

  function actualHz(side) {
    if (!side) {
      /* 둘 중 빠른 쪽을 대표값으로. 한쪽만 연결된 경우를 위해서입니다. */
      return Math.max(actualHz("L"), actualHz("R"));
    }
    /* 끊겼으면 과거 평균을 돌려주면 안 됩니다. */
    if (!isLive(side)) return 0;
    var st = feed[side].stamps;
    if (st.length < 5) return 0;
    var span = st[st.length - 1] - st[0];
    if (span <= 0) return 0;
    return (st.length - 1) / (span / 1000);
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

  function reset() {
    init();
    seq++;
    feed = { L: { stamps: [], last: 0 }, R: { stamps: [], last: 0 } };
  }

  return {
    push: push, sanitize: sanitize, isActive: isActive,
    channelState: channelState, summary: summary,
    markFrame: markFrame, actualHz: actualHz, isLive: isLive, sinceLast: sinceLast,
    bothLive: bothLive, deadSides: deadSides,
    captureZero: captureZero, clearZero: clearZero, hasZero: hasZero, loadZero: loadZero,
    corrected: corrected, reset: reset
  };
})();
