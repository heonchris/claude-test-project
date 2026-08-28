/* ============================================================
 * 11-ble.js — 실제 인솔과 블루투스 연결 (안드로이드 우선)
 *
 * 웹에서 직접 블루투스를 씁니다. 안드로이드 크롬·엣지·삼성인터넷에서
 * 동작하며, 앱을 따로 설치할 필요가 없습니다.
 *
 * 아이폰은 사파리를 포함한 모든 브라우저가 이 기능을 지원하지 않습니다.
 * (아이폰의 모든 브라우저는 내부적으로 같은 엔진을 씁니다)
 * 아이폰에서는 Xcode 로 만든 앱에서 Swift 가 대신 연결해 줘야 합니다.
 *
 * 패킷 형식은 DATA_CONTRACT.md 를 따릅니다.
 * ============================================================ */
var INSOLE = window.INSOLE || {};

INSOLE.ble = (function () {
  "use strict";
  var C = INSOLE.config;

  /* DATA_CONTRACT.md 의 값. 펌웨어가 확정되면 여기만 바꾸면 됩니다. */
  var SERVICE_UUID = "0000fff0-0000-1000-8000-00805f9b34fb";
  var NOTIFY_UUID  = "0000fff1-0000-1000-8000-00805f9b34fb";
  var PACKET_BYTES = 2 + C.CHANNELS * 2 * 2;   /* 헤더1 + 순번1 + 16채널×2바이트 = 34 */
  var HEADER = 0xA5;

  var device = null, characteristic = null;
  var listeners = [];
  var stats = { packets: 0, dropped: 0, bad: 0, lastSeq: -1 };

  function emit(type, detail) {
    listeners.forEach(function (fn) { try { fn(type, detail); } catch (e) {} });
  }
  function onChange(fn) { listeners.push(fn); }

  /** 이 브라우저가 웹 블루투스를 지원하는가. */
  function supported() {
    return typeof navigator !== "undefined" &&
           !!navigator.bluetooth && typeof navigator.bluetooth.requestDevice === "function";
  }

  /** 왜 못 쓰는지 사람이 읽을 수 있는 이유. */
  function unsupportedReason() {
    if (supported()) return null;
    var ua = navigator.userAgent || "";
    /* 아이폰·아이패드는 브라우저를 바꿔도 안 됩니다. 엔진이 같기 때문입니다. */
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
      return "아이폰·아이패드는 브라우저에서 블루투스를 쓸 수 없습니다. 크롬을 깔아도 마찬가지입니다. 실제 센서 연결은 안드로이드 휴대폰을 쓰시거나, Xcode 로 설치한 앱이 필요합니다.";
    }
    if (location.protocol !== "https:" && location.hostname !== "localhost") {
      return "보안 연결(https)에서만 블루투스를 쓸 수 있습니다. 주소가 https 로 시작하는지 확인하세요.";
    }
    return "이 브라우저는 블루투스를 지원하지 않습니다. 안드로이드에서 크롬·엣지·삼성인터넷을 쓰세요.";
  }

  function isConnected() {
    return !!(device && device.gatt && device.gatt.connected);
  }

  /* ── 패킷 해석 ────────────────────────────────────────────
   * 34바이트를 받아 채널값으로 풉니다. 형식이 어긋나면 버립니다.
   * 잘못된 패킷을 그냥 쓰면 화면이 튀고 원인을 찾기 어려워집니다.
   */
  function handlePacket(dv) {
    if (dv.byteLength !== PACKET_BYTES || dv.getUint8(0) !== HEADER) {
      stats.bad++;
      return;
    }

    /* 순번으로 유실을 셉니다. 무선이 불안정한지 판단하는 근거가 됩니다. */
    var seq = dv.getUint8(1);
    if (stats.lastSeq >= 0) {
      var gap = (seq - stats.lastSeq + 256) % 256;
      if (gap > 1) stats.dropped += gap - 1;
    }
    stats.lastSeq = seq;
    stats.packets++;

    var v = INSOLE.sensor.values;
    for (var i = 0; i < C.CHANNELS; i++) {
      v.L[i] = dv.getUint16(2 + i * 2, true);                          /* ch1~8  */
      v.R[i] = dv.getUint16(2 + (i + C.CHANNELS) * 2, true);           /* ch9~16 */
    }
    /* 오류값 정리와 수신 시각 기록은 health 가 담당합니다. */
    INSOLE.health.sanitize(v);
    INSOLE.health.markFrame();
  }

  /**
   * 인솔에 연결합니다.
   * 반드시 사용자가 버튼을 눌러 호출해야 합니다 —
   * 브라우저가 기기 선택 창을 띄우려면 사용자 동작이 필요합니다.
   */
  function connect() {
    if (!supported()) return Promise.reject(new Error(unsupportedReason()));

    return navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE_UUID] }],
      optionalServices: [SERVICE_UUID]
    }).then(function (d) {
      device = d;
      device.addEventListener("gattserverdisconnected", function () {
        characteristic = null;
        INSOLE.sensor.setSource("sim");
        emit("disconnected", { name: device && device.name });
      });
      emit("connecting", { name: d.name });
      return d.gatt.connect();
    }).then(function (server) {
      return server.getPrimaryService(SERVICE_UUID);
    }).then(function (service) {
      return service.getCharacteristic(NOTIFY_UUID);
    }).then(function (ch) {
      characteristic = ch;
      ch.addEventListener("characteristicvaluechanged", function (e) {
        handlePacket(e.target.value);
      });
      return ch.startNotifications();
    }).then(function () {
      stats = { packets: 0, dropped: 0, bad: 0, lastSeq: -1 };
      /* 이제 시뮬레이터 대신 실제 값이 들어옵니다. */
      INSOLE.sensor.setSource("ble");
      emit("connected", { name: device.name || "인솔" });
      return true;
    }).catch(function (err) {
      /* 사용자가 선택 창을 닫은 것은 오류가 아닙니다. */
      if (err && err.name === "NotFoundError") {
        emit("cancelled", {});
        return false;
      }
      emit("error", { message: (err && err.message) || String(err) });
      throw err;
    });
  }

  function disconnect() {
    try { if (device && device.gatt && device.gatt.connected) device.gatt.disconnect(); } catch (e) {}
    characteristic = null;
    INSOLE.sensor.setSource("sim");
    emit("disconnected", {});
  }

  function deviceName() { return device && device.name ? device.name : null; }
  function getStats() { return stats; }

  return {
    supported: supported, unsupportedReason: unsupportedReason,
    connect: connect, disconnect: disconnect, isConnected: isConnected,
    deviceName: deviceName, stats: getStats, onChange: onChange,
    SERVICE_UUID: SERVICE_UUID, NOTIFY_UUID: NOTIFY_UUID, PACKET_BYTES: PACKET_BYTES
  };
})();
