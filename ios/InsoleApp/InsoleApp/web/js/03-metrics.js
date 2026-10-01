/* ============================================================
 * 03-metrics.js — 파생 지표
 *
 * 채널값에서 무게중심·좌우 비율·전후 비율을 계산합니다.
 * 화면과 무관한 순수 계산이라 다른 플랫폼으로 옮기기 쉽습니다.
 * ============================================================ */
var INSOLE = window.INSOLE || {};

INSOLE.metrics = (function () {
  "use strict";
  var C = INSOLE.config;

  function sum(arr) {
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s;
  }

  /** 한쪽 발의 무게중심. { x, y, total } — 좌표는 발 좌표계(≈mm). */
  function centerOfPressure(values, side) {
    var v = values[side], total = sum(v);
    if (total < 1) return { x: C.FOOT_W / 2, y: C.FOOT_H / 2, total: 0 };
    var x = 0, y = 0;
    for (var i = 0; i < C.CHANNELS; i++) {
      /* 왼발은 좌우 반전된 위치에 센서가 있습니다. */
      var sp = INSOLE.layout ? INSOLE.layout.get(i) : C.SENSORS[i];
      var sx = side === "L" ? C.FOOT_W - sp.x : sp.x;
      x += sx * v[i];
      y += sp.y * v[i];
    }
    return { x: x / total, y: y / total, total: total };
  }

  /* ── 전후 비율 ────────────────────────────────────────────
   * ⚠️ 채널 합계로 계산하지 마세요.
   *
   * 전족부는 5채널, 뒤꿈치는 2채널입니다. 단순 합계로 재면
   * 채널 개수가 많은 전족부가 항상 커져서, 히트맵은 뒤꿈치가
   * 새까만데 지표는 "앞쪽 56%"라고 나오는 모순이 생깁니다.
   *
   * 그래서 무게중심 y 위치를 기준선 두 개 사이에서 환산합니다.
   * 화면이 보여주는 것과 숫자가 항상 일치합니다.
   *
   * 반환값: 1에 가까울수록 앞쪽, 0에 가까울수록 뒤꿈치.
   */
  function foreAftRatio(values, side) {
    /* 2점 구성에서는 추정으로 채운 자리가 섞여 있으므로, 무게중심이
     * 아니라 실측한 두 값에서 직접 구합니다. 그러지 않으면 앞쪽에
     * 채운 자리가 많아 똑바로 서 있어도 앞으로 쏠린 것으로 나옵니다. */
    if (INSOLE.expand && !INSOLE.expand.isFull()) {
      return INSOLE.expand.foreAft(values, side);
    }
    var cop = centerOfPressure(values, side);
    if (cop.total < 1) return 0.5;
    var r = (C.HEEL_Y - cop.y) / (C.HEEL_Y - C.FORE_Y);
    return Math.max(0, Math.min(1, r));
  }

  /** 좌우 비율. 1에 가까울수록 왼발에 쏠린 것. */
  function leftRightRatio(values) {
    var l, r;
    /* 2점 구성에서는 실측 두 값의 합만 씁니다. 추정값을 포함하면,
     * 한 발은 앞쪽에 한 발은 뒤쪽에 실렸을 때 앞쪽 자리가 더 많은
     * 쪽이 무겁게 계산되어 없는 좌우 쏠림이 만들어집니다. */
    if (INSOLE.expand && !INSOLE.expand.isFull()) {
      l = INSOLE.expand.footLoad(values, "L");
      r = INSOLE.expand.footLoad(values, "R");
    } else {
      l = sum(values.L); r = sum(values.R);
    }
    var t = l + r;
    return t < 1 ? 0.5 : l / t;
  }

  /** 양발 평균 전후 비율. */
  function foreAftAverage(values) {
    return (foreAftRatio(values, "L") + foreAftRatio(values, "R")) / 2;
  }

  /** 채널 전체에서 가장 큰 값. */
  function peak(values) {
    var p = 0;
    ["L", "R"].forEach(function (s) {
      values[s].forEach(function (v) { if (v > p) p = v; });
    });
    return p;
  }

  /** 세션 동안 무게중심이 움직인 범위(대각 길이, ≈mm). */
  function copRange(points) {
    if (!points || points.length < 2) return 0;
    var xs = [], ys = [];
    points.forEach(function (p) { xs.push(p.lx, p.rx); ys.push(p.ly, p.ry); });
    return Math.hypot(
      Math.max.apply(null, xs) - Math.min.apply(null, xs),
      Math.max.apply(null, ys) - Math.min.apply(null, ys)
    );
  }

  return {
    sum: sum,
    centerOfPressure: centerOfPressure,
    foreAftRatio: foreAftRatio,
    foreAftAverage: foreAftAverage,
    leftRightRatio: leftRightRatio,
    peak: peak,
    copRange: copRange
  };
})();
