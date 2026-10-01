/* ============================================================
 * 13-expand.js — 실제로 단 센서 몇 개로 발 전체 분포를 그려 낸다
 *
 * 왜 필요한가:
 *   센서를 8개 다 달지 않는 구성에서는 히트맵에 점이 몇 개만 찍혀
 *   허전하다. 사람이 "발 전체 압력" 으로 읽게 하려면 빈 자리를 채워야
 *   한다.
 *
 * 어떻게 채우는가:
 *   없는 값을 지어내는 것이 아니라, **실측한 값들을 거리로 가중평균**
 *   해서 빈 자리를 만든다. 가까운 센서의 영향을 더 크게 받는다
 *   (히트맵이 쓰는 것과 같은 방식). 그래서 센서를 옮기면 추정 분포도
 *   따라 움직인다.
 *
 * 정직성 — 섞지 않는다:
 *   추정은 **보이는 것**에만 쓴다. 좌우 비율·전후 비율 같은 숫자는
 *   **실측 채널만** 보고 계산한다. 그러지 않으면 빈 자리를 앞쪽에 많이
 *   채웠다는 이유만으로 '앞으로 쏠림' 이 만들어진다.
 *   저장되는 원본에도 추정값은 들어가지 않는다.
 * ============================================================ */
var INSOLE = window.INSOLE || {};

INSOLE.expand = (function () {
  "use strict";
  var C = INSOLE.config;
  var KEY = "insole.active.v2";
  var N = C.CHANNELS;

  /* 센서를 몇 개만 달 때 어디부터 다는 것이 좋은지. 앞에서부터 고른다.
   * 스쿼트에서 중요한 순서 — 뒤꿈치, 엄지볼, 새끼볼, 뒤꿈치 바깥… */
  var PRIORITY = [6, 2, 4, 7, 0, 3, 5, 1];

  var active = PRIORITY.slice();       /* 실측 센서가 있는 자리 */

  function sorted(a) { return a.slice().sort(function (x, y) { return x - y; }); }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return;
      var a = JSON.parse(raw);
      if (!Array.isArray(a) || a.length < 1 || a.length > N) return;
      var seen = {}, ok = true;
      a.forEach(function (v) {
        if (typeof v !== "number" || v < 0 || v >= N || seen[v]) ok = false;
        seen[v] = 1;
      });
      if (ok) active = a;
    } catch (e) { /* 저장이 막힌 환경이면 기본값 */ }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(active)); } catch (e) {} }

  function count() { return active.length; }
  function isActive(i) { return active.indexOf(i) >= 0; }
  function activeSlots() { return active.length === N ? null : sorted(active); }
  function isFull() { return active.length === N; }

  /** 개수만 정하면 중요한 자리부터 자동으로 고른다. */
  function setCount(n) {
    n = Math.max(1, Math.min(N, n | 0));
    active = PRIORITY.slice(0, n);
    save();
    return active.length;
  }

  /** 자리 하나를 켜고 끈다. 마지막 하나는 끌 수 없다. */
  function toggle(i) {
    if (i < 0 || i >= N) return false;
    var k = active.indexOf(i);
    if (k >= 0) {
      if (active.length <= 1) return false;   /* 전부 끄면 아무것도 못 잰다 */
      active.splice(k, 1);
    } else {
      active.push(i);
    }
    save();
    return true;
  }

  function pos(i) {
    return INSOLE.layout ? INSOLE.layout.get(i) : C.SENSORS[i];
  }

  /**
   * 빈 자리를 실측값의 거리 가중평균으로 채운다.
   * 가까운 센서일수록 크게 반영된다. 분모의 상수는 센서가 바로 옆일 때
   * 값이 튀지 않게 눌러 주는 역할이다 (히트맵과 같은 방식).
   */
  function fillFoot(arr) {
    if (isFull()) return arr;
    var i, k, p, q, dx, dy, w, num, den;
    for (i = 0; i < N && i < arr.length; i++) {
      if (isActive(i)) continue;                 /* 실측은 건드리지 않는다 */
      p = pos(i); num = 0; den = 0;
      for (k = 0; k < active.length; k++) {
        q = pos(active[k]);
        dx = p.x - q.x; dy = p.y - q.y;
        w = 1 / (Math.pow(dx * dx + dy * dy, 1.5) + 300);
        num += w * (arr[active[k]] || 0);
        den += w;
      }
      arr[i] = den > 0
        ? Math.max(0, Math.min(C.MAX_RAW, Math.round(num / den)))
        : 0;
    }
    return arr;
  }

  function apply(values) {
    if (isFull() || !values) return values;
    fillFoot(values.L);
    fillFoot(values.R);
    return values;
  }

  /* ── 숫자는 실측만 ────────────────────────────────────── */

  /** 한쪽 발이 받는 하중. 실측 채널의 합. */
  function footLoad(values, side) {
    var a = values[side] || [], t = 0;
    for (var k = 0; k < active.length; k++) t += a[active[k]] || 0;
    return t;
  }

  /** 실측 센서들이 앞뒤로 얼마나 벌어져 있는지 {min, max, span}. */
  function span() {
    var lo = Infinity, hi = -Infinity;
    for (var k = 0; k < active.length; k++) {
      var y = pos(active[k]).y;
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    }
    return { min: lo, max: hi, span: hi - lo };
  }

  /* 앞뒤를 가리려면 센서가 둘 이상이고 앞뒤로 충분히 떨어져 있어야 한다.
   * 둘 다 앞꿈치에 붙여 놓으면 개수가 둘이어도 앞뒤는 알 수 없다. */
  var MIN_SPAN = 20;
  function canForeAft() { return active.length >= 2 && span().span >= MIN_SPAN; }

  /**
   * 한쪽 발의 앞쪽 비율 0~1.
   *
   * 실측 센서들의 무게중심 y 를 **그 센서들이 놓인 범위** 안에서 환산한다.
   * 고정된 앞·뒤 기준선(FORE_Y·HEEL_Y)을 쓰면, 센서가 그 사이 어딘가에만
   * 있을 때 앞뒤를 똑같이 눌러도 50% 가 나오지 않는다. 실제로 2점 구성에서
   * 똑같이 눌렀는데 43.6% 가 나왔다. 범위로 환산하면 정확히 50% 가 되고,
   * 센서가 둘일 때는 두 값의 비율과 정확히 같아진다.
   */
  function foreAft(values, side) {
    if (!canForeAft()) return 0.5;
    var sp = span();
    var a = values[side] || [], t = 0, y = 0, k, v;
    for (k = 0; k < active.length; k++) {
      v = a[active[k]] || 0;
      t += v; y += pos(active[k]).y * v;
    }
    if (t < 1) return 0.5;
    var r = (sp.max - (y / t)) / sp.span;
    return Math.max(0, Math.min(1, r));
  }

  load();

  return {
    apply: apply, foreAft: foreAft, footLoad: footLoad,
    count: count, setCount: setCount, toggle: toggle,
    isActive: isActive, activeSlots: activeSlots, isFull: isFull,
    canForeAft: canForeAft, span: span, PRIORITY: PRIORITY, N: N,
    slotName: function (i) { var s = C.SENSORS[i]; return s ? s.name : ("자리 " + i); }
  };
})();

window.INSOLE = INSOLE;
