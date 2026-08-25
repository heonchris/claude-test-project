/* ============================================================
 * 04-heatmap.js — 발바닥 히트맵
 *
 * 측정점 8개 사이를 역거리가중(IDW)으로 보간해 연속적인
 * 압력 분포로 그립니다. 이 보간이 없으면 점 8개만 찍혀
 * 히트맵이 성립하지 않습니다. (사업 정의서 기능 1번의 숨은 작업)
 * ============================================================ */
var INSOLE = window.INSOLE || {};

INSOLE.heatmap = (function () {
  "use strict";
  var C = INSOLE.config;
  var ramp = [], offscreen = {};

  function hexToRgb(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  function isDark() {
    var stamp = document.documentElement.getAttribute("data-theme");
    if (stamp === "dark") return true;
    if (stamp === "light") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  /** 테마가 바뀔 때마다 호출해야 램프가 갱신됩니다. */
  function buildRamp() {
    var dark = isDark();
    ramp = (dark ? C.RAMP_DARK : C.RAMP_LIGHT).map(hexToRgb);
    return dark ? C.RAMP_DARK : C.RAMP_LIGHT;
  }
  /** 0~1 을 색으로. 구간 사이는 선형 보간. */
  function colorAt(t) {
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var p = t * (ramp.length - 1), i = Math.floor(p), f = p - i;
    var a = ramp[i], b = ramp[Math.min(i + 1, ramp.length - 1)];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  /* 발 외곽선. mirror=true 면 왼발.
   * 좌표는 발 좌표계(100 × 260) 기준입니다. */
  function footPath(mirror) {
    var p = new Path2D(), W = C.FOOT_W;
    function X(x) { return mirror ? W - x : x; }
    p.moveTo(X(46), 2);
    p.bezierCurveTo(X(74), 2,   X(90), 22,  X(88), 48);
    p.bezierCurveTo(X(86), 70,  X(92), 86,  X(90), 104);
    p.bezierCurveTo(X(88), 128, X(80), 142, X(80), 162);
    p.bezierCurveTo(X(80), 186, X(88), 196, X(86), 216);
    p.bezierCurveTo(X(84), 244, X(66), 258, X(50), 258);
    p.bezierCurveTo(X(32), 258, X(16), 244, X(15), 218);
    p.bezierCurveTo(X(14), 196, X(22), 184, X(23), 162);
    p.bezierCurveTo(X(24), 138, X(14), 120, X(13), 96);
    p.bezierCurveTo(X(12), 58,  X(20), 2,   X(46), 2);
    p.closePath();
    return p;
  }
  var PATH_L = null, PATH_R = null;

  /**
   * 한쪽 발을 캔버스에 그립니다.
   * @param {HTMLCanvasElement} canvas
   * @param {"L"|"R"} side
   * @param {{L:number[],R:number[]}} values
   */
  function draw(canvas, side, values) {
    if (!canvas) return;
    if (!PATH_L) { PATH_L = footPath(true); PATH_R = footPath(false); }

    var ctx = canvas.getContext("2d");
    var scale = canvas.width / C.FOOT_W;
    var mirror = side === "L";
    var path = mirror ? PATH_L : PATH_R;
    var v = values[side];

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    /* 1) 저해상도 격자에 보간값을 채운 뒤 확대합니다.
     *    격자를 그대로 크게 그리면 느리고, 확대하면 자연스럽게 부드러워집니다. */
    if (!offscreen[side]) {
      var o = document.createElement("canvas");
      o.width = C.GRID_W; o.height = C.GRID_H;
      offscreen[side] = o;
    }
    var oc = offscreen[side], octx = oc.getContext("2d");
    var img = octx.createImageData(C.GRID_W, C.GRID_H), d = img.data;

    for (var gy = 0; gy < C.GRID_H; gy++) {
      for (var gx = 0; gx < C.GRID_W; gx++) {
        var px = (gx + 0.5) / C.GRID_W * C.FOOT_W;
        var py = (gy + 0.5) / C.GRID_H * C.FOOT_H;
        var num = 0, den = 0;

        for (var i = 0; i < C.CHANNELS; i++) {
          var sx = mirror ? C.FOOT_W - C.SENSORS[i].x : C.SENSORS[i].x;
          var dx = px - sx, dy = py - C.SENSORS[i].y;
          var dd = dx * dx + dy * dy;
          if (dd < 1) dd = 1;
          /* 거리 3승 반비례. 낮추면 뭉개지고, 높이면 점처럼 도드라집니다.
           * +300 은 센서 바로 위에서 값이 발산하지 않게 막는 항입니다. */
          var dist = Math.sqrt(dd);
          var w = 1 / (dist * dist * dist + 300);
          num += v[i] * w;
          den += w;
        }
        var val = den > 0 ? num / den : 0;
        var col = colorAt(val / C.MAX_RAW);
        var off = (gy * C.GRID_W + gx) * 4;
        d[off] = col[0] | 0; d[off + 1] = col[1] | 0; d[off + 2] = col[2] | 0; d[off + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);

    /* 2) 발 모양으로 잘라서 확대 그리기 */
    ctx.save();
    ctx.scale(scale, scale);
    ctx.clip(path);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(oc, 0, 0, C.FOOT_W, C.FOOT_H);
    ctx.restore();

    /* 3) 외곽선 */
    ctx.save();
    ctx.scale(scale, scale);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = cssVar("--rule-2");
    ctx.stroke(path);
    ctx.restore();

    /* 4) 센서 위치 표시 */
    ctx.save();
    ctx.scale(scale, scale);
    for (var j = 0; j < C.CHANNELS; j++) {
      var jx = mirror ? C.FOOT_W - C.SENSORS[j].x : C.SENSORS[j].x;
      ctx.beginPath();
      ctx.arc(jx, C.SENSORS[j].y, 1.9, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,.5)";
      ctx.fill();
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = "rgba(0,0,0,.3)";
      ctx.stroke();
    }
    ctx.restore();

    /* 5) 무게중심. 흰 테두리를 덧대야 어느 색 위에서도 보입니다. */
    var cop = INSOLE.metrics.centerOfPressure(values, side);
    if (cop.total > 60) {
      ctx.save();
      ctx.scale(scale, scale);
      ctx.beginPath();
      ctx.arc(cop.x, cop.y, 5.2, 0, Math.PI * 2);
      ctx.lineWidth = 2.6; ctx.strokeStyle = "#fff"; ctx.stroke();
      ctx.lineWidth = 1.5; ctx.strokeStyle = cssVar(side === "L" ? "--s1" : "--s2"); ctx.stroke();
      ctx.restore();
    }
  }

  return { buildRamp: buildRamp, colorAt: colorAt, draw: draw, footPath: footPath, cssVar: cssVar };
})();
