/* ============================================================
 * 13-expand.js — 센서 2점으로 발 전체 분포를 그려 낸다
 *
 * 왜 필요한가:
 *   센서를 발당 2개(앞·뒤)만 다는 구성에서는 히트맵에 점이 두 개만
 *   찍혀 허전하다. 사람이 보기에 "발 전체 압력" 으로 읽히게 하려면
 *   나머지 자리의 값을 채워야 한다.
 *
 * 어떻게 채우는가:
 *   없는 값을 지어내는 것이 아니라, **실측한 두 값에 해부학적 가중치를
 *   곱해** 나머지 자리를 만든다. 앞을 누르면 앞쪽 자리들이 같이 오르고
 *   뒤를 누르면 뒤쪽이 오른다. 사람이 서 있을 때 하중이 실제로 어떻게
 *   퍼지는지를 본뜬 것이다.
 *
 * 정직성:
 *   이 값들은 **추정이지 측정이 아니다.** 화면에 그렇게 표시해야 한다.
 *   다만 두 실측값의 단조 함수이므로, 좌우 비율·전후 비율 같은 지표는
 *   왜곡되지 않는다. 더 부드러워질 뿐이다.
 *
 *   진단 탭과 저장되는 원본은 **실측 채널만** 다룬다. 추정값이 기록으로
 *   남으면 나중에 실측과 구분할 수 없게 되기 때문이다.
 * ============================================================ */
var INSOLE = window.INSOLE || {};

INSOLE.expand = (function () {
  "use strict";
  var C = INSOLE.config;
  var KEY = "insole.sensormode.v1";

  /* 실측 센서가 꽂힌 자리 (01-config.js 의 SENSORS 순번)
   *   2 = 제1중족골두  — 앞쪽 하중이 실리는 곳
   *   6 = 뒤꿈치 내측  — 뒤꿈치가 뜨면 먼저 0 이 되는 곳 */
  var FORE_SLOT = 2;
  var HEEL_SLOT = 6;

  /* 각 자리를 앞·뒤 실측값에서 얼마씩 받아올지.
   * 선 자세에서의 대략적인 하중 분포를 따랐다. 합이 1 일 필요는 없다. */
  var W = [
    { fore: 0.55, heel: 0.00 },   /* 0 엄지            */
    { fore: 0.38, heel: 0.00 },   /* 1 2–3지           */
    { fore: 1.00, heel: 0.00 },   /* 2 제1중족골두 ★실측 */
    { fore: 0.86, heel: 0.00 },   /* 3 제2–3중족골두   */
    { fore: 0.62, heel: 0.04 },   /* 4 제5중족골두     */
    { fore: 0.16, heel: 0.22 },   /* 5 중족부 외측 — 아치라 하중이 적다 */
    { fore: 0.00, heel: 1.00 },   /* 6 뒤꿈치 내측 ★실측 */
    { fore: 0.00, heel: 0.84 }    /* 7 뒤꿈치 외측     */
  ];

  var mode = "full";   /* "full" = 8채널 실측 · "pair" = 앞뒤 2점 추정 */

  function load() {
    try {
      var v = localStorage.getItem(KEY);
      if (v === "pair" || v === "full") mode = v;
    } catch (e) { /* 저장이 막힌 환경이면 기본값 */ }
  }
  function save() { try { localStorage.setItem(KEY, mode); } catch (e) {} }

  function getMode() { return mode; }
  function setMode(m) {
    if (m !== "pair" && m !== "full") return false;
    mode = m; save(); return true;
  }
  function isPair() { return mode === "pair"; }

  /** 실측 2채널이 들어 있는 자리 번호 (진단·건강검사가 쓴다) */
  function activeSlots() {
    return isPair() ? [FORE_SLOT, HEEL_SLOT] : null;   /* null = 전부 */
  }

  /**
   * 한쪽 발 배열을 제자리에서 채운다.
   * 앞·뒤 실측값은 그대로 두고 나머지 자리만 가중치로 만든다.
   */
  function fillFoot(arr) {
    var fore = arr[FORE_SLOT] || 0;
    var heel = arr[HEEL_SLOT] || 0;
    for (var i = 0; i < W.length && i < arr.length; i++) {
      if (i === FORE_SLOT || i === HEEL_SLOT) continue;   /* 실측은 건드리지 않는다 */
      var v = fore * W[i].fore + heel * W[i].heel;
      arr[i] = Math.max(0, Math.min(C.MAX_RAW, Math.round(v)));
    }
    return arr;
  }

  /** 양발을 채운다. pair 모드가 아니면 아무것도 하지 않는다. */
  function apply(values) {
    if (!isPair() || !values) return values;
    fillFoot(values.L);
    fillFoot(values.R);
    return values;
  }

  /* ── 지표는 실측값으로만 ──────────────────────────────
   * 추정으로 채운 자리를 지표 계산에 쓰면 안 됩니다. 앞쪽에 채워 넣은
   * 자리가 뒤쪽보다 많아서, 앞뒤를 똑같이 눌러도 '앞으로 쏠림' 으로
   * 나옵니다. 그림은 꾸미되 숫자는 실제로 잰 두 값만 씁니다.
   */

  /** 한쪽 발의 앞쪽 비율 0~1. 실측 두 값만 본다. */
  function foreAft(values, side) {
    var a = values[side] || [];
    var fore = a[FORE_SLOT] || 0, heel = a[HEEL_SLOT] || 0;
    var t = fore + heel;
    if (t < 1) return 0.5;
    return fore / t;
  }

  /** 한쪽 발이 받는 하중. 실측 두 값의 합. */
  function footLoad(values, side) {
    var a = values[side] || [];
    return (a[FORE_SLOT] || 0) + (a[HEEL_SLOT] || 0);
  }

  load();

  return {
    foreAft: foreAft, footLoad: footLoad,
    apply: apply, isPair: isPair,
    getMode: getMode, setMode: setMode,
    activeSlots: activeSlots,
    FORE_SLOT: FORE_SLOT, HEEL_SLOT: HEEL_SLOT,
    slotName: function (i) {
      var s = C.SENSORS[i];
      return s ? s.name : ("자리 " + i);
    }
  };
})();

window.INSOLE = INSOLE;
