/* ============================================================
 * 14-layout.js — 센서를 발의 어디에 둘지 (좌표)
 *
 * 인솔 설계가 확정되기 전에는 센서 위치가 계속 바뀝니다.
 * 그때마다 코드를 고치지 않도록, 좌표를 앱에서 옮기고 저장합니다.
 *
 * 좌표계는 01-config.js 의 SENSORS 와 같습니다.
 *   x: 0 ~ FOOT_W,  y: 0 ~ FOOT_H  (왼발 기준. 오른발은 그려질 때 뒤집힙니다)
 *
 * 히트맵·무게중심·추정 분포가 모두 이 좌표를 봅니다.
 * 따라서 점을 옮기면 화면과 숫자가 함께 따라옵니다.
 * ============================================================ */
var INSOLE = window.INSOLE || {};

INSOLE.layout = (function () {
  "use strict";
  var C = INSOLE.config;
  var KEY = "insole.layout.v1";
  var N = C.CHANNELS;

  function defaults() {
    return C.SENSORS.map(function (s) {
      return { x: s.x, y: s.y, name: s.name, group: s.group };
    });
  }

  var pts = defaults();

  function valid(a) {
    if (!Array.isArray(a) || a.length !== N) return false;
    for (var i = 0; i < N; i++) {
      var p = a[i];
      if (!p || typeof p.x !== "number" || typeof p.y !== "number") return false;
      if (p.x < 0 || p.x > C.FOOT_W || p.y < 0 || p.y > C.FOOT_H) return false;
    }
    return true;
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return;
      var a = JSON.parse(raw);
      if (!valid(a)) return;
      /* 이름과 묶음은 설정에서 바꾸지 않으므로 기본값을 유지합니다. */
      for (var i = 0; i < N; i++) { pts[i].x = a[i].x; pts[i].y = a[i].y; }
    } catch (e) { /* 저장이 막힌 환경이면 기본값 */ }
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(pts.map(function (p) {
        return { x: Math.round(p.x), y: Math.round(p.y) };
      })));
      return true;
    } catch (e) { return false; }
  }

  function get(i) { return pts[i]; }
  function all() { return pts; }

  /** 발 안쪽으로만 움직이도록 가둡니다. */
  function setPos(i, x, y) {
    if (i < 0 || i >= N) return false;
    pts[i].x = Math.max(4, Math.min(C.FOOT_W - 4, x));
    pts[i].y = Math.max(6, Math.min(C.FOOT_H - 6, y));
    save();
    return true;
  }

  function reset() { pts = defaults(); save(); }

  function isDefault() {
    var d = defaults();
    for (var i = 0; i < N; i++) {
      if (Math.round(pts[i].x) !== Math.round(d[i].x)) return false;
      if (Math.round(pts[i].y) !== Math.round(d[i].y)) return false;
    }
    return true;
  }

  load();

  return { get: get, all: all, setPos: setPos, reset: reset, isDefault: isDefault, N: N };
})();

window.INSOLE = INSOLE;
