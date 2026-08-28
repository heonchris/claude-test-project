/* ============================================================
 * 02-sensor.js — 데이터 소스
 *
 * ★ 실제 센서로 교체할 때 고칠 파일은 여기 하나입니다.
 *
 * 앱의 나머지 부분은 INSOLE.sensor.read() 가 돌려주는
 *   { L: [8개 정수], R: [8개 정수] }   각 값 0 ~ MAX_RAW
 * 이 형태만 알고 있습니다. 이 형태만 지키면 됩니다.
 *
 * 교체 방법은 파일 맨 아래 INSOLE.sensor.connectBLE() 주석 참고.
 * ============================================================ */
var INSOLE = window.INSOLE || {};

INSOLE.sensor = (function () {
  "use strict";
  var C = INSOLE.config;

  /* 현재 채널값. 앱 전체가 이 객체를 읽습니다. */
  var values = { L: new Array(C.CHANNELS).fill(0), R: new Array(C.CHANNELS).fill(0) };

  /* ── 시연용 시나리오 ──────────────────────────────────────
   * 실제 센서를 붙이면 이 블록은 통째로 지워도 됩니다.
   */
  var SCENARIOS = [
    { key: "normal",    label: "정상 스쿼트",  desc: "양발에 고르게 실리는 이상적인 패턴" },
    { key: "imbalance", label: "좌우 불균형",  desc: "한쪽 발에 무게가 쏠리는 상황" },
    { key: "heel",      label: "뒤꿈치 들림",  desc: "무게가 앞쪽으로 쏠려 뒤꿈치가 뜨는 상황" },
    { key: "stand",     label: "가만히 서기",  desc: "움직임 없이 서 있는 기준 상태" }
  ];
  var scenario = "normal";
  var reps = 0, lastPhase = 0;

  /* "sim" 이면 시뮬레이터가 값을 만들고,
   * "ble" 이면 실제 인솔이 보낸 값이 들어옵니다.
   * 실제 연결 중에는 시뮬레이터가 값을 덮어쓰면 안 됩니다. */
  var source = "sim";

  function labelOf(key) {
    for (var i = 0; i < SCENARIOS.length; i++) if (SCENARIOS[i].key === key) return SCENARIOS[i].label;
    return key;
  }
  function noise(amp) { return (Math.random() - 0.5) * amp; }

  /* 스쿼트 1회를 3초 주기로 흉내냅니다.
   * load   : 전체 하중 (0.4 = 서 있는 상태, 0.88 = 스쿼트 바닥)
   * leftShare : 왼발이 가져가는 비율
   * fwdBias   : + 면 앞쪽으로, - 면 뒤꿈치로 무게가 이동
   */
  function step(tSec) {
    /* 실제 인솔이 붙어 있으면 시뮬레이터는 아무것도 하지 않습니다. */
    if (source === "ble") return;

    var phase = 0, load;
    if (scenario === "stand") {
      load = 0.42 + Math.sin(tSec * 0.7) * 0.015 + noise(0.01);
    } else {
      var u = (tSec % 3) / 3;
      phase = u;
      load = 0.40 + (0.5 - 0.5 * Math.cos(u * Math.PI * 2)) * 0.48 + noise(0.012);
    }

    var leftShare = 0.5, fwdBias = 0;
    if (scenario === "imbalance") leftShare = 0.5 - (0.13 + Math.sin(tSec * 0.5) * 0.02);
    if (scenario === "heel")      fwdBias = 0.30 + (0.5 - 0.5 * Math.cos(phase * Math.PI * 2)) * 0.28;
    if (scenario === "normal")    fwdBias = -0.10 - (0.5 - 0.5 * Math.cos(phase * Math.PI * 2)) * 0.10;
    if (scenario === "stand")     fwdBias = -0.06;

    ["L", "R"].forEach(function (side) {
      var share = side === "L" ? leftShare : 1 - leftShare;
      /* 발당 총합 스케일. 채널별 가중치의 합이 대략 1 이 되도록 잡혀 있습니다. */
      var base = load * share * 2 * C.CHANNELS * C.MAX_RAW * 0.55;

      for (var i = 0; i < C.CHANNELS; i++) {
        var g = C.SENSORS[i].group, w;
        if (g === "fore")      w = 0.115 + fwdBias * 0.075;
        else if (g === "heel") w = 0.230 - fwdBias * 0.170;
        else                   w = 0.070;
        if (i === 0) w *= 1.15;   // 엄지에 조금 더
        if (i === 5) w *= 0.75;   // 중족부는 약하게

        var v = base * w + noise(26);
        if (scenario === "heel" && g === "heel") v *= 0.35;
        values[side][i] = Math.max(0, Math.min(C.MAX_RAW, Math.round(v)));
      }
    });

    /* 한 주기가 끝나면 1회로 셉니다. */
    if (scenario !== "stand" && lastPhase > 0.75 && phase < 0.25) reps++;
    lastPhase = phase;

    /* 새 데이터가 들어온 시점을 기록합니다.
     * 실제 BLE 를 붙일 때도 패킷 수신 핸들러에서 이 줄을 호출하세요.
     * 화면 갱신 루프에서 부르면 데이터가 끊겨도 정상으로 보입니다. */
    if (INSOLE.health) INSOLE.health.markFrame();
  }

  return {
    SCENARIOS: SCENARIOS,
    values: values,
    labelOf: labelOf,

    /** 현재 채널값을 돌려줍니다. { L: [...], R: [...] } */
    read: function () { return values; },

    /** 시뮬레이터를 한 프레임 진행시킵니다. 실제 센서를 쓰면 호출하지 않습니다. */
    step: step,

    getScenario: function () { return scenario; },
    setScenario: function (k) { scenario = k; },

    /** "sim" 또는 "ble". 11-ble.js 가 연결·해제 시 바꿉니다. */
    getSource: function () { return source; },
    setSource: function (s) {
      source = s;
      if (s === "ble") { reps = 0; lastPhase = 0; }
    },

    getReps: function () { return reps; },
    resetReps: function () { reps = 0; lastPhase = 0; },

    /* ────────────────────────────────────────────────────────
     * 실제 BLE 인솔을 붙이는 자리
     *
     * 아래 주석을 참고해 구현하고, 07-app.js 의 루프에서
     * INSOLE.sensor.step() 호출만 지우면 됩니다.
     * (step 은 시뮬레이터 전용이고, 실제 센서는 알림으로 값이 들어옵니다.)
     *
     * 패킷 규격은 DATA_CONTRACT.md 를 따르세요.
     *
     *   connectBLE: async function () {
     *     var device = await navigator.bluetooth.requestDevice({
     *       filters: [{ services: ["0000fff0-0000-1000-8000-00805f9b34fb"] }]
     *     });
     *     var server = await device.gatt.connect();
     *     var svc    = await server.getPrimaryService("0000fff0-...");
     *     var ch     = await svc.getCharacteristic("0000fff1-...");
     *     await ch.startNotifications();
     *     ch.addEventListener("characteristicvaluechanged", function (e) {
     *       var dv = e.target.value;               // DataView, 34 bytes
     *       for (var i = 0; i < 8; i++) {
     *         values.L[i] = dv.getUint16(2 + i * 2, true);       // little endian
     *         values.R[i] = dv.getUint16(2 + (i + 8) * 2, true);
     *       }
     *       INSOLE.health.markFrame();   // ← 수신 주기 측정. 빠뜨리지 마세요
     *     });
     *   }
     * ──────────────────────────────────────────────────────── */
    connectBLE: function () {
      throw new Error("미구현: DATA_CONTRACT.md 규격에 맞춰 구현하세요.");
    }
  };
})();
