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

  /* 쓰는 모듈마다 UUID 가 다릅니다. 위에서부터 차례로 시도합니다.
   *
   * HM-10 · AT-09 · BT05 (CC2541) 은 공장 기본값이 FFE0/FFE1 입니다.
   * DATA_CONTRACT.md 의 FFF0/FFF1 은 자체 펌웨어를 만들 때 쓸 임시값이라,
   * 시중 모듈을 그냥 꽂으면 FFE0 쪽으로 잡힙니다.
   * 펌웨어가 확정되면 그 UUID 하나만 남기면 됩니다.
   */
  var PROFILES = [
    { name: "HM-10 / AT-09 계열",
      service: "0000ffe0-0000-1000-8000-00805f9b34fb",
      notify:  "0000ffe1-0000-1000-8000-00805f9b34fb" },
    { name: "자체 펌웨어 (DATA_CONTRACT)",
      service: "0000fff0-0000-1000-8000-00805f9b34fb",
      notify:  "0000fff1-0000-1000-8000-00805f9b34fb" }
  ];
  var SERVICE_UUID = PROFILES[0].service;   /* 하위 호환용 참고값 */
  var NOTIFY_UUID  = PROFILES[0].notify;
  var PACKET_BYTES = 2 + C.CHANNELS * 2 * 2;   /* 헤더1 + 순번1 + 16채널×2바이트 = 34 */
  var HEADER = 0xA5;
  var profile = null;   /* 실제로 잡힌 프로필 */

  var device = null, characteristic = null;
  var lastRaw = null;   /* 매핑 전 원래 채널 순서. 설정 화면이 씁니다. */

  /* 들어온 바이트를 해석 전에 그대로 보관합니다.
   *
   * 해석에 실패하면 화면은 그냥 조용합니다. 그러면 모듈이 아무것도
   * 안 보내는 것인지, 보내는데 내용이 깨진 것인지 구분할 수가 없어
   * 원인을 하드웨어에서 찾게 됩니다. 날것을 보여 주면 한 번에 갈립니다. */
  var rx = { bytes: 0, notifies: 0, last: [], at: 0 };
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

  /* ── 조각 모으기 ──────────────────────────────────────────
   * BLE 는 한 번에 20바이트까지만 보냅니다. 34바이트 패킷은 20 + 14 로
   * 쪼개져 도착하므로, 받은 조각을 이어 붙였다가 헤더(0xA5)를 찾아
   * 34바이트가 모이면 한 패킷으로 넘깁니다.
   *
   * 한계: 데이터 안에 우연히 0xA5 가 있으면 한 번 어긋날 수 있습니다.
   * 그 경우 다음 패킷에서 순번이 튀므로 아래에서 자동으로 다시 맞춥니다.
   */
  var buf = [];
  var MAX_BUF = PACKET_BYTES * 4;   /* 쓰레기가 쌓이지 않게 상한을 둔다 */

  function feed(dv) {
    var i, b;

    /* 해석하기 전에 먼저 기록합니다. */
    rx.notifies++;
    rx.bytes += dv.byteLength;
    rx.at = Date.now();
    for (i = 0; i < dv.byteLength; i++) {
      b = dv.getUint8(i);
      rx.last.push(b);
      buf.push(b);
    }
    if (rx.last.length > 24) rx.last = rx.last.slice(rx.last.length - 24);

    for (;;) {
      /* 맨 앞이 헤더가 아니면 헤더가 나올 때까지 버린다 */
      while (buf.length && buf[0] !== HEADER) { buf.shift(); stats.bad++; }
      if (buf.length < PACKET_BYTES) break;

      var frame = buf.slice(0, PACKET_BYTES);
      buf = buf.slice(PACKET_BYTES);
      handlePacket(frame);
    }

    if (buf.length > MAX_BUF) buf = buf.slice(buf.length - MAX_BUF);
  }

  /* ── 패킷 해석 ────────────────────────────────────────────
   * 34바이트 배열을 받아 채널값으로 풉니다.
   */
  function handlePacket(bytes) {
    function u16(off) { return bytes[off] | (bytes[off + 1] << 8); }   /* little-endian */

    /* 순번으로 유실을 셉니다. 무선이 불안정한지 판단하는 근거가 됩니다. */
    var seq = bytes[1];
    if (stats.lastSeq >= 0) {
      var gap = (seq - stats.lastSeq + 256) % 256;
      if (gap > 1) stats.dropped += gap - 1;
    }
    stats.lastSeq = seq;
    stats.packets++;

    /* 채널 순서대로 먼저 읽고, 사용자가 정한 자리로 옮겨 담습니다.
     * 어느 센서가 발의 어디에 깔려 있는지는 12-mapping.js 가 압니다. */
    var raw = [];
    for (var i = 0; i < C.CHANNELS * 2; i++) raw.push(u16(2 + i * 2));

    var v = INSOLE.sensor.values;
    INSOLE.mapping.apply(raw, v);
    lastRaw = raw;
    /* 오류값 정리와 수신 시각 기록은 health 가 담당합니다. */
    INSOLE.health.sanitize(v);
    INSOLE.health.markFrame();
  }

  /**
   * 인솔에 연결합니다.
   * 반드시 사용자가 버튼을 눌러 호출해야 합니다 —
   * 브라우저가 기기 선택 창을 띄우려면 사용자 동작이 필요합니다.
   */
  function connect(opts) {
    if (!supported()) return Promise.reject(new Error(unsupportedReason()));

    var anyDevice = !!(opts && opts.any);
    var all = PROFILES.map(function (p) { return p.service; });

    /* 선택 창에 띄울 조건입니다. 여러 개를 주면 OR 로 걸립니다.
     *
     * 서비스로만 거르면, 광고 패킷에 서비스 UUID 를 싣지 않는 일부
     * 짝퉁 모듈이 목록에 아예 안 나옵니다. 흔한 공장 기본 이름도
     * 함께 걸어 두면 그런 경우에도 보입니다.
     *   HMSoft = HM-10 기본 이름 · BT05 · AT-09 · JDY-08
     */
    var filters = all.map(function (u) { return { services: [u] }; });
    ["HMSoft", "HM-", "BT05", "AT-", "JDY"].forEach(function (n) {
      filters.push({ namePrefix: n });
    });

    /* anyDevice: 조건을 전부 빼고 주변의 모든 기기를 보여 줍니다.
     * 모듈이 조건에 안 걸려 목록이 비는 것인지, 아예 신호를 안 내보내는
     * 것인지 구분하는 용도입니다. 목록이 지저분해지므로 진단 전용입니다. */
    var req = anyDevice
      ? { acceptAllDevices: true, optionalServices: all }
      : { filters: filters, optionalServices: all };

    return navigator.bluetooth.requestDevice(req).then(function (d) {
      device = d;
      device.addEventListener("gattserverdisconnected", function () {
        characteristic = null;
        INSOLE.sensor.setSource("sim");
        emit("disconnected", { name: device && device.name });
      });
      emit("connecting", { name: d.name });
      return d.gatt.connect();
    }).then(function (server) {
      /* 아는 프로필을 위에서부터 시도합니다. 먼저 잡히는 것을 씁니다. */
      var i = 0;
      function tryNext() {
        if (i >= PROFILES.length) {
          throw new Error(
            "이 기기에서 아는 블루투스 서비스를 찾지 못했습니다. " +
            "모듈이 HM-10 · AT-09 계열인지 확인하세요. " +
            "HC-05 · HC-06 은 방식이 달라 브라우저에서 연결할 수 없습니다.");
        }
        var p = PROFILES[i++];
        return server.getPrimaryService(p.service)
          .then(function (svc) { return svc.getCharacteristic(p.notify); })
          .then(function (ch) { profile = p; return ch; })
          .catch(tryNext);
      }
      return tryNext();
    }).then(function (ch) {
      characteristic = ch;
      ch.addEventListener("characteristicvaluechanged", function (e) {
        feed(e.target.value);
      });
      return ch.startNotifications();
    }).then(function () {
      stats = { packets: 0, dropped: 0, bad: 0, lastSeq: -1 };
      buf = [];
      rx = { bytes: 0, notifies: 0, last: [], at: 0 };
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

  /* 앱 -> 모듈 -> 아두이노 방향 시험용.
   *
   * 지금까지는 아두이노가 모듈로 보내는 쪽만 확인했습니다. 반대로
   * 보내 보면 모듈의 어느 쪽이 죽었는지 가려집니다. HM-10 계열은
   * 같은 특성(FFE1)으로 읽고 쓰기를 모두 합니다. */
  function send(text) {
    if (!characteristic) return Promise.reject(new Error("연결되어 있지 않습니다."));
    var bytes = new TextEncoder().encode(text);
    if (characteristic.writeValueWithoutResponse) {
      return characteristic.writeValueWithoutResponse(bytes)
        .catch(function () { return characteristic.writeValue(bytes); });
    }
    return characteristic.writeValue(bytes);
  }

  function deviceName() { return device && device.name ? device.name : null; }
  function profileName() { return profile ? profile.name : null; }
  function getStats() { return stats; }

  return {
    supported: supported, unsupportedReason: unsupportedReason,
    connect: connect, disconnect: disconnect, isConnected: isConnected,
    deviceName: deviceName, profileName: profileName,
    lastRaw: function () { return lastRaw; },
    send: send,
    rx: function () { return rx; },
    stats: getStats, onChange: onChange,
    PROFILES: PROFILES, PACKET_BYTES: PACKET_BYTES,
    SERVICE_UUID: SERVICE_UUID, NOTIFY_UUID: NOTIFY_UUID,
    _feed: feed   /* 테스트용 */
  };
})();
