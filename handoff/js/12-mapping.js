/* ============================================================
 * 12-mapping.js — 센서 채널을 발의 어느 자리에 붙일지 정합니다
 *
 * 왜 필요한가:
 *   아두이노의 A0 에 꽂은 센서가 실제로 발의 어디에 깔려 있는지는
 *   배선한 사람만 압니다. 코드를 고치지 않고 앱에서 바꿀 수 있어야
 *   현장에서 선을 다시 뽑지 않아도 됩니다.
 *
 * 쓰는 말:
 *   채널(ch)  — 아두이노가 보내는 순서. ch1 = A0, ch2 = A1 …
 *   자리(slot) — 화면 발바닥 그림의 위치. 0~7 왼발, 8~15 오른발
 *
 * map[채널] = 자리   한 자리에 두 채널을 넣을 수는 없습니다.
 * ============================================================ */
var INSOLE = window.INSOLE || {};

INSOLE.mapping = (function () {
  "use strict";
  var C = INSOLE.config;
  var N = C.CHANNELS * 2;                 /* 16 */
  var KEY = "insole.chmap.v1";

  /* 기본값은 순서 그대로입니다. ch1 → 왼발 엄지, ch9 → 오른발 엄지. */
  function identity() {
    var a = [], i;
    for (i = 0; i < N; i++) a.push(i);
    return a;
  }

  var map = identity();

  /** 자리 번호를 사람이 읽는 이름으로. 0~7 왼발, 8~15 오른발 */
  function slotName(slot) {
    var foot = slot < C.CHANNELS ? "왼발" : "오른발";
    var s = C.SENSORS[slot % C.CHANNELS];
    return foot + " " + (s ? s.name : "?");
  }

  function isValid(a) {
    if (!Array.isArray(a) || a.length !== N) return false;
    var seen = {}, i, v;
    for (i = 0; i < N; i++) {
      v = a[i];
      if (typeof v !== "number" || v < 0 || v >= N || seen[v]) return false;
      seen[v] = 1;
    }
    return true;
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return;
      var a = JSON.parse(raw);
      if (isValid(a)) map = a;
    } catch (e) { /* 저장이 막힌 환경이면 기본값으로 둡니다 */ }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(map)); return true; }
    catch (e) { return false; }
  }

  /**
   * 채널을 어떤 자리에 붙일지 정합니다.
   * 그 자리를 이미 쓰고 있던 채널과 서로 바꿉니다 —
   * 그래야 두 채널이 한 자리에 겹치는 일이 생기지 않습니다.
   */
  function assign(ch, slot) {
    if (ch < 0 || ch >= N || slot < 0 || slot >= N) return false;
    var other = map.indexOf(slot);
    if (other === ch) return true;
    if (other >= 0) map[other] = map[ch];
    map[ch] = slot;
    save();
    return true;
  }

  function reset() { map = identity(); save(); }

  /**
   * 들어온 16개 채널값을 화면 자리 순서로 옮겨 담습니다.
   * raw[0..15] → out.L[0..7], out.R[0..7]
   */
  function apply(raw, out) {
    var i, slot;
    for (i = 0; i < N; i++) {
      slot = map[i];
      if (slot < C.CHANNELS) out.L[slot] = raw[i];
      else                   out.R[slot - C.CHANNELS] = raw[i];
    }
    return out;
  }

  function isDefault() {
    for (var i = 0; i < N; i++) if (map[i] !== i) return false;
    return true;
  }

  load();

  return {
    N: N,
    get: function () { return map.slice(); },
    slotOf: function (ch) { return map[ch]; },
    slotName: slotName,
    assign: assign, reset: reset, apply: apply,
    isDefault: isDefault, isValid: isValid
  };
})();

window.INSOLE = INSOLE;
