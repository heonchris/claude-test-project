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
  var KEY = "insole.count.v3";
  var N = C.CHANNELS;

  /* 센서를 몇 개만 달 때 어디부터 다는 것이 좋은지. 앞에서부터 고른다.
   * 스쿼트에서 중요한 순서 — 뒤꿈치, 엄지볼, 새끼볼, 뒤꿈치 바깥… */
  var PRIORITY = [6, 2, 4, 7, 0, 3, 5, 1];

  /* 실측 센서의 **개수**만 여기서 갖는다.
   *
   * 어느 자리가 실측인지는 따로 갖지 않는다. 아두이노는 ch1·ch2… 순서로
   * 보내고, 그 채널이 발의 어디인지는 12-mapping.js 가 정하기 때문이다.
   * 둘을 따로 보관했더니 서로 어긋나서, 실제로 값이 들어온 자리를
   * '빈 자리' 로 알고 추정값으로 덮어써 **실측값이 전부 0 이 되는**
   * 일이 있었다. 그래서 실측 자리는 항상 매핑에서 끌어온다.
   */
  var nActive = N;

  function sorted(a) { return a.slice().sort(function (x, y) { return x - y; }); }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw === null) return;
      var n = parseInt(raw, 10);
      if (n >= 1 && n <= N) nActive = n;
    } catch (e) { /* 저장이 막힌 환경이면 기본값 */ }
  }
  function save() { try { localStorage.setItem(KEY, String(nActive)); } catch (e) {} }

  function count() { return nActive; }
  function isFull() { return nActive >= N; }

  /* 매핑은 16자리(0~7 왼발, 8~15 오른발) 공간을 쓰고, 추정 분포는
   * 발 하나(0~7) 공간에서 돈다. 둘을 섞으면 왼발 기준 자리를 오른발에도
   * 그대로 적용해, 오른발을 붙이는 순간 값이 어긋난다. 그래서 발별로
   * 따로 구한다. */
  function mapSlot(ch) { return INSOLE.mapping ? INSOLE.mapping.slotOf(ch) : ch; }

  /** 그 발에서 실측 채널이 놓인 자리 (0~7). 채널 순서 그대로. */
  function slotsInOrder(side) {
    var base = (side === "R") ? N : 0, out = [], i, sl;
    for (i = 0; i < nActive; i++) {
      sl = mapSlot(base + i);
      /* 그 발 안에 있는 자리만 센다. 다른 발로 보낸 채널은 건너뛴다. */
      if (side === "R") { if (sl >= N) out.push(sl - N); }
      else              { if (sl < N)  out.push(sl); }
    }
    return out;
  }

  /** 왼발 기준 실측 자리. 설정 화면이 쓴다. */
  function activeSlots() { return isFull() ? null : sorted(slotsInOrder("L")); }

  function isActive(side, slot) {
    if (isFull()) return true;
    if (typeof slot === "undefined") { slot = side; side = "L"; }   /* 옛 호출 방식 */
    return slotsInOrder(side).indexOf(slot) >= 0;
  }

  /** 그 자리에 있는 채널 번호(발 내부 기준). 없으면 -1. */
  function channelAt(slot) {
    var act = slotsInOrder("L");
    return act.indexOf(slot);
  }

  /**
   * 개수를 정한다. 실측 채널들을 중요한 자리로 함께 옮긴다.
   * 개수만 바꾸고 매핑을 그대로 두면 둘이 어긋나므로 반드시 같이 바꾼다.
   */
  function setCount(n) {
    nActive = Math.max(1, Math.min(N, n | 0));

    if (INSOLE.mapping) {
      if (isFull()) {
        /* 8개를 다 달면 DATA_CONTRACT 의 채널 표 그대로 간다.
         * 우선순위 순서로 섞어 두면 규격과 어긋나 혼란만 생긴다. */
        INSOLE.mapping.reset();
      } else {
        /* 실측 채널을 중요한 자리로, 나머지 채널은 남는 자리에 차례로.
         * 개수만 바꾸고 매핑을 그대로 두면 둘이 어긋나 실측값이
         * 추정값에 덮어써진다. 그래서 반드시 함께 바꾼다. */
        var order = PRIORITY.slice(0, nActive), used = {}, i;
        order.forEach(function (sl) { used[sl] = 1; });
        for (i = 0; i < N; i++) if (!used[i]) order.push(i);
        /* 양발을 같은 모양으로. 오른발 채널(8~15)도 같은 자리에 둔다. */
        for (i = 0; i < N; i++) INSOLE.mapping.assign(i, order[i]);
        for (i = 0; i < N; i++) INSOLE.mapping.assign(N + i, N + order[i]);
      }
    }
    save();
    return nActive;
  }

  function pos(i) {
    return INSOLE.layout ? INSOLE.layout.get(i) : C.SENSORS[i];
  }

  /**
   * 빈 자리를 실측값의 거리 가중평균으로 채운다.
   * 가까운 센서일수록 크게 반영된다. 분모의 상수는 센서가 바로 옆일 때
   * 값이 튀지 않게 눌러 주는 역할이다 (히트맵과 같은 방식).
   */
  function fillFoot(arr, side) {
    if (isFull()) return arr;
    var act = slotsInOrder(side);
    if (!act.length) return arr;   /* 그 발에 실측이 없으면 손대지 않는다 */
    var i, k, p, q, dx, dy, w, num, den;
    for (i = 0; i < N && i < arr.length; i++) {
      if (act.indexOf(i) >= 0) continue;         /* 실측은 건드리지 않는다 */
      p = pos(i); num = 0; den = 0;
      for (k = 0; k < act.length; k++) {
        q = pos(act[k]);
        dx = p.x - q.x; dy = p.y - q.y;
        w = 1 / (Math.pow(dx * dx + dy * dy, 1.5) + 300);
        num += w * (arr[act[k]] || 0);
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
    fillFoot(values.L, "L");
    fillFoot(values.R, "R");
    return values;
  }

  /* ── 숫자는 실측만 ────────────────────────────────────── */

  /** 한쪽 발이 받는 하중. 실측 채널의 합. */
  function footLoad(values, side) {
    var a = values[side] || [], t = 0, act = slotsInOrder(side);
    for (var k = 0; k < act.length; k++) t += a[act[k]] || 0;
    return t;
  }

  /** 실측 센서들이 앞뒤로 얼마나 벌어져 있는지 {min, max, span}. */
  function span(side) {
    var lo = Infinity, hi = -Infinity, act = slotsInOrder(side || "L");
    for (var k = 0; k < act.length; k++) {
      var y = pos(act[k]).y;
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    }
    return { min: lo, max: hi, span: hi - lo };
  }

  /* 앞뒤를 가리려면 센서가 둘 이상이고 앞뒤로 충분히 떨어져 있어야 한다.
   * 둘 다 앞꿈치에 붙여 놓으면 개수가 둘이어도 앞뒤는 알 수 없다. */
  var MIN_SPAN = 20;
  function canForeAft(side) { return nActive >= 2 && span(side).span >= MIN_SPAN; }

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
    if (!canForeAft(side)) return 0.5;
    var sp = span(side);
    var a = values[side] || [], t = 0, y = 0, k, v, act = slotsInOrder(side);
    for (k = 0; k < act.length; k++) {
      v = a[act[k]] || 0;
      t += v; y += pos(act[k]).y * v;
    }
    if (t < 1) return 0.5;
    var r = (sp.max - (y / t)) / sp.span;
    return Math.max(0, Math.min(1, r));
  }

  load();

  return {
    apply: apply, foreAft: foreAft, footLoad: footLoad,
    count: count, setCount: setCount,
    slotsInOrder: slotsInOrder, channelAt: channelAt,
    isActive: isActive, activeSlots: activeSlots, isFull: isFull,
    canForeAft: canForeAft, span: span, PRIORITY: PRIORITY, N: N,
    slotName: function (i) { var s = C.SENSORS[i]; return s ? s.name : ("자리 " + i); }
  };
})();

window.INSOLE = INSOLE;
