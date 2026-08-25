/* ============================================================
 * 05-chart.js — 압력 추이 그래프
 *
 * 왼발/오른발 총압력 2계열을 롤링 윈도우로 그립니다.
 * ============================================================ */
var INSOLE = window.INSOLE || {};

INSOLE.chart = (function () {
  "use strict";
  var C = INSOLE.config;
  var canvas = null, ctx = null;
  var PAD = { l: 30, r: 4, t: 7, b: 12 };
  var HEIGHT = 104;

  function attach(el) {
    canvas = el;
    ctx = canvas.getContext("2d");
    resize();
  }

  /** 레티나 대응. 창 크기가 바뀌면 다시 호출해야 합니다. */
  function resize() {
    if (!canvas) return;
    var r = canvas.getBoundingClientRect();
    if (r.width < 2) return;
    var dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(r.width * dpr);
    canvas.height = Math.round(HEIGHT * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * @param {Array<{t:number,l:number,r:number}>} history 시간(초)과 좌우 총압력
   */
  function draw(history) {
    if (!canvas) return;
    var box = canvas.getBoundingClientRect(), W = box.width, H = HEIGHT;
    if (W < 2) return;

    var maxY = C.footMax();
    ctx.clearRect(0, 0, W, H);

    /* 그리드는 배경으로 물러나야 합니다. 데이터보다 눈에 띄면 안 됩니다. */
    ctx.strokeStyle = INSOLE.heatmap.cssVar("--grid");
    ctx.lineWidth = 1;
    ctx.fillStyle = INSOLE.heatmap.cssVar("--faint");
    ctx.font = "9px 'IBM Plex Mono', monospace";
    ctx.textAlign = "right";
    for (var g = 0; g <= 2; g++) {
      var y = PAD.t + (H - PAD.t - PAD.b) * (1 - g / 2);
      ctx.beginPath();
      ctx.moveTo(PAD.l, y); ctx.lineTo(W - PAD.r, y);
      ctx.stroke();
      ctx.fillText(String(Math.round(maxY * g / 2)), PAD.l - 4, y + 3);
    }

    if (history.length < 2) return;
    var tEnd = history[history.length - 1].t;
    var tStart = tEnd - C.CHART_WINDOW_SEC;

    function X(t) { return PAD.l + (W - PAD.l - PAD.r) * ((t - tStart) / C.CHART_WINDOW_SEC); }
    function Y(v) { return PAD.t + (H - PAD.t - PAD.b) * (1 - Math.min(1, v / maxY)); }

    /* 좌우가 균형이면 두 선이 완전히 겹칩니다. 같은 굵기로 그리면
     * 아래 선이 사라진 것처럼 보이므로, 왼발을 굵게 깔고 오른발을 얹습니다.
     * 겹쳐 보이는 파란 테두리가 곧 "균형 잡혔다"는 신호가 됩니다. */
    [["l", "--s1", 3.2], ["r", "--s2", 2]].forEach(function (series) {
      ctx.beginPath();
      var started = false;
      for (var i = 0; i < history.length; i++) {
        var h = history[i];
        if (h.t < tStart) continue;
        var x = X(h.t), y = Y(h[series[0]]);
        if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
      }
      ctx.strokeStyle = INSOLE.heatmap.cssVar(series[1]);
      ctx.lineWidth = series[2];
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();
    });
  }

  return { attach: attach, resize: resize, draw: draw };
})();
