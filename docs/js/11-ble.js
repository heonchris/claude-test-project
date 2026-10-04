/* ============================================================
 * 11-ble.js — 인솔과 블루투스 연결 (발마다 하나씩, 동시 2개)
 *
 * 발마다 아두이노 + 블루투스 모듈이 하나씩 붙습니다. 두 신발 사이에
 * 선을 둘 수 없으므로 이 구조 외에 선택지가 없습니다. 그래서 앱은
 * **두 기기에 동시에 연결**합니다. 안드로이드는 동시 7개까지 허용하므로
 * 2개는 여유롭습니다.
 *
 * 왼발·오른발은 각각 따로 연결하고 따로 끊습니다. 한쪽만 연결된
 * 상태에서도 그 발은 정상 동작합니다.
 *
 * ── 패킷 ───────────────────────────────────────────────
 * 두 가지를 모두 받습니다. 헤더로 구분하므로 섞여도 안전합니다.
 *
 *   0xA5  34바이트  16채널. 예전 형식. 앞 8채널만 그 발의 값으로 씁니다
 *   0xA6  19바이트  8채널 + 발 표시. 한 번에 보낼 수 있어 분할이 없습니다
 *
 * 0xA6 을 권장합니다. BLE 는 한 번에 20바이트까지만 보내므로 34바이트는
 * 쪼개져 오고, 9600 baud 로는 30Hz 가 들어가지도 않습니다.
 * 19바이트면 둘 다 해결됩니다.
 *
 * 아이폰은 사파리를 포함한 모든 브라우저가 이 기능을 지원하지 않습니다.
 * ============================================================ */
var INSOLE = window.INSOLE || {};

INSOLE.ble = (function () {
  "use strict";
  var C = INSOLE.config;
  var N = C.CHANNELS;                 /* 발당 채널 수 = 8 */

  /* 쓰는 모듈마다 UUID 가 다릅니다. 위에서부터 차례로 시도합니다. */
  var PROFILES = [
    { name: "HM-10 / AT-09 계열",
      service: "0000ffe0-0000-1000-8000-00805f9b34fb",
      notify:  "0000ffe1-0000-1000-8000-00805f9b34fb" },
    { name: "자체 펌웨어 (DATA_CONTRACT)",
      service: "0000fff0-0000-1000-8000-00805f9b34fb",
      notify:  "0000fff1-0000-1000-8000-00805f9b34fb" }
  ];

  var HDR_FULL = 0xA5, LEN_FULL = 2 + N * 2 * 2;   /* 34 */
  var HDR_FOOT = 0xA6, LEN_FOOT = 3 + N * 2;       /* 19 */
  var FOOT_BYTE = { L: 0x4C, R: 0x52 };

  var SIDES = ["L", "R"];
  var SIDE_LABEL = { L: "왼발", R: "오른발" };

  var listeners = [];
  function emit(type, detail) {
    listeners.forEach(function (fn) { try { fn(type, detail); } catch (e) {} });
  }
  function onChange(fn) { listeners.push(fn); }

  function blank(side) {
    return {
      side: side, device: null, ch: null, profile: null,
      buf: [],
      rx: { bytes: 0, notifies: 0, last: [], at: 0 },
      stats: { packets: 0, dropped: 0, bad: 0, lastSeq: -1, mismatched: 0 },
      lastRaw: null
    };
  }
  var links = { L: blank("L"), R: blank("R") };

  function supported() {
    return typeof navigator !== "undefined" &&
           !!navigator.bluetooth && typeof navigator.bluetooth.requestDevice === "function";
  }

  function unsupportedReason() {
    if (supported()) return null;
    var ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
      return "아이폰·아이패드는 브라우저에서 블루투스를 쓸 수 없습니다. 크롬을 깔아도 마찬가지입니다. 안드로이드 휴대폰을 쓰시거나, Xcode 로 설치한 앱이 필요합니다.";
    }
    if (location.protocol !== "https:" && location.hostname !== "localhost") {
      return "보안 연결(https)에서만 블루투스를 쓸 수 있습니다. 주소가 https 로 시작하는지 확인하세요.";
    }
    return "이 브라우저는 블루투스를 지원하지 않습니다. 안드로이드에서 크롬·엣지·삼성인터넷을 쓰세요.";
  }

  function isConnected(side) {
    if (!side) return SIDES.some(isConnected);
    var l = links[side];
    return !!(l.device && l.device.gatt && l.device.gatt.connected && l.ch);
  }
  function connectedSides() { return SIDES.filter(isConnected); }

  /* ── 패킷 해석 ────────────────────────────────────────────
   * BLE 는 한 번에 20바이트까지만 보내므로 34바이트짜리는 쪼개져 옵니다.
   * 받은 조각을 이어 붙였다가 헤더를 찾아 한 패킷이 모이면 넘깁니다.
   */
  function lenFor(h) {
    if (h === HDR_FOOT) return LEN_FOOT;
    if (h === HDR_FULL) return LEN_FULL;
    return 0;
  }

  function feed(side, dv) {
    var l = links[side], i, b;

    /* 해석하기 전에 먼저 기록합니다. 화면이 조용할 때, 모듈이 아무것도
     * 안 보내는 것인지 내용이 깨진 것인지 가리는 유일한 근거입니다. */
    l.rx.notifies++;
    l.rx.bytes += dv.byteLength;
    l.rx.at = Date.now();
    for (i = 0; i < dv.byteLength; i++) {
      b = dv.getUint8(i);
      l.rx.last.push(b);
      l.buf.push(b);
    }
    if (l.rx.last.length > 24) l.rx.last = l.rx.last.slice(l.rx.last.length - 24);

    for (;;) {
      while (l.buf.length && !lenFor(l.buf[0])) { l.buf.shift(); l.stats.bad++; }
      if (!l.buf.length) break;
      var need = lenFor(l.buf[0]);
      if (l.buf.length < need) break;
      var frame = l.buf.slice(0, need);
      l.buf = l.buf.slice(need);
      handlePacket(side, frame);
    }

    if (l.buf.length > LEN_FULL * 4) l.buf = l.buf.slice(l.buf.length - LEN_FULL * 4);
  }

  /**
   * 한 발의 8채널을 그 발의 자리에 담는다.
   * 어느 채널이 발의 어디인지는 12-mapping.js 가 정한다.
   */
  function handlePacket(side, bytes) {
    var l = links[side];
    var foot = side, off;

    if (bytes[0] === HDR_FOOT) {
      /* 펌웨어가 밝힌 발을 믿는다. 연결할 때 고른 것과 다르면 기록해 둔다 */
      var m = bytes[2];
      var declared = (m === FOOT_BYTE.L) ? "L" : (m === FOOT_BYTE.R) ? "R" : null;
      if (declared && declared !== side) l.stats.mismatched++;
      if (declared) foot = declared;
      off = 3;
    } else {
      off = 2;   /* 0xA5 예전 형식 — 앞 8채널만 그 발의 값으로 쓴다 */
    }

    var seq = bytes[1];
    if (l.stats.lastSeq >= 0) {
      var gap = (seq - l.stats.lastSeq + 256) % 256;
      if (gap > 1) l.stats.dropped += gap - 1;
    }
    l.stats.lastSeq = seq;
    l.stats.packets++;

    var raw = [], i;
    for (i = 0; i < N; i++) raw.push(bytes[off + i * 2] | (bytes[off + i * 2 + 1] << 8));
    l.lastRaw = raw;

    /* 글로벌 채널 번호: 왼발 0~7, 오른발 8~15 */
    var base = (foot === "R") ? N : 0;
    var arr = INSOLE.sensor.values[foot];
    for (i = 0; i < N; i++) {
      var slot = INSOLE.mapping ? INSOLE.mapping.slotOf(base + i) : (base + i);
      var local = slot - base;
      if (local < 0 || local >= N) continue;   /* 다른 발로 보낸 채널은 건너뛴다 */
      arr[local] = raw[i];
    }

    INSOLE.health.sanitize(INSOLE.sensor.values);
    /* 센서를 다 달지 않았으면 빈 자리를 추정으로 채웁니다. */
    if (INSOLE.expand) INSOLE.expand.apply(INSOLE.sensor.values);
    INSOLE.health.markFrame(foot);
  }

  /* ── 연결 ─────────────────────────────────────────────── */
  function connect(side, opts) {
    if (SIDES.indexOf(side) < 0) side = "L";
    if (!supported()) return Promise.reject(new Error(unsupportedReason()));

    var l = links[side];
    var anyDevice = !!(opts && opts.any);
    var all = PROFILES.map(function (p) { return p.service; });

    var filters = all.map(function (u) { return { services: [u] }; });
    ["HMSoft", "HM-", "BT05", "AT-", "JDY"].forEach(function (n) {
      filters.push({ namePrefix: n });
    });

    var req = anyDevice
      ? { acceptAllDevices: true, optionalServices: all }
      : { filters: filters, optionalServices: all };

    return navigator.bluetooth.requestDevice(req).then(function (d) {
      /* 같은 기기를 양쪽에 연결하면 두 발이 같은 값을 받아 좌우 비교가
       * 무의미해집니다. 사람 눈에는 정상처럼 보이므로 막아 둡니다. */
      var other = (side === "L") ? "R" : "L";
      if (links[other].device && links[other].device.id === d.id) {
        throw new Error("이 기기는 이미 " + SIDE_LABEL[other] + "에 연결되어 있습니다. 다른 기기를 고르세요.");
      }
      l.device = d;
      d.addEventListener("gattserverdisconnected", function () {
        l.ch = null;
        if (!isConnected()) INSOLE.sensor.setSource("sim");
        emit("disconnected", { side: side, name: d.name });
      });
      emit("connecting", { side: side, name: d.name });
      return d.gatt.connect();
    }).then(function (server) {
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
          .then(function (ch) { l.profile = p; return ch; })
          .catch(tryNext);
      }
      return tryNext();
    }).then(function (ch) {
      l.ch = ch;
      ch.addEventListener("characteristicvaluechanged", function (e) {
        feed(side, e.target.value);
      });
      return ch.startNotifications();
    }).then(function () {
      l.buf = [];
      l.rx = { bytes: 0, notifies: 0, last: [], at: 0 };
      l.stats = { packets: 0, dropped: 0, bad: 0, lastSeq: -1, mismatched: 0 };
      INSOLE.sensor.setSource("ble");
      emit("connected", { side: side, name: l.device.name || SIDE_LABEL[side] });
      return true;
    }).catch(function (err) {
      if (err && err.name === "NotFoundError") {
        emit("cancelled", { side: side });
        return false;
      }
      emit("error", { side: side, message: (err && err.message) || String(err) });
      throw err;
    });
  }

  function disconnect(side) {
    if (!side) { SIDES.forEach(disconnect); return; }
    var l = links[side];
    try { if (l.device && l.device.gatt && l.device.gatt.connected) l.device.gatt.disconnect(); } catch (e) {}
    links[side] = blank(side);
    /* 그 발의 값은 비워 둡니다. 남겨 두면 끊긴 발이 계속 눌려 있는 것처럼
     * 보여 좌우 비교가 거짓이 됩니다. */
    var arr = INSOLE.sensor.values[side];
    for (var i = 0; i < arr.length; i++) arr[i] = 0;
    if (!isConnected()) INSOLE.sensor.setSource("sim");
    emit("disconnected", { side: side });
  }

  /** 앱에서 모듈로 글자를 보냅니다. 배선 점검용입니다. */
  function send(side, text) {
    var l = links[side || "L"];
    if (!l.ch) return Promise.reject(new Error(SIDE_LABEL[side || "L"] + "이 연결되어 있지 않습니다."));
    var bytes = new TextEncoder().encode(text);
    if (l.ch.writeValueWithoutResponse) {
      return l.ch.writeValueWithoutResponse(bytes)
        .catch(function () { return l.ch.writeValue(bytes); });
    }
    return l.ch.writeValue(bytes);
  }

  function deviceName(side) {
    var l = links[side];
    return (l && l.device && l.device.name) ? l.device.name : null;
  }
  function profileName(side) { return links[side] && links[side].profile ? links[side].profile.name : null; }

  /** 합산 통계. side 를 주면 그 발만. */
  function getStats(side) {
    if (side) return links[side].stats;
    var out = { packets: 0, dropped: 0, bad: 0, lastSeq: -1, mismatched: 0 };
    SIDES.forEach(function (s) {
      out.packets += links[s].stats.packets;
      out.dropped += links[s].stats.dropped;
      out.bad     += links[s].stats.bad;
      out.mismatched += links[s].stats.mismatched;
    });
    return out;
  }
  function getRx(side) {
    if (side) return links[side].rx;
    var out = { bytes: 0, notifies: 0, last: [], at: 0 };
    SIDES.forEach(function (s) {
      out.bytes += links[s].rx.bytes;
      out.notifies += links[s].rx.notifies;
      if (links[s].rx.at > out.at) { out.at = links[s].rx.at; out.last = links[s].rx.last; }
    });
    return out;
  }
  function lastRaw(side) {
    if (side) return links[side].lastRaw;
    return links.L.lastRaw || links.R.lastRaw;
  }

  return {
    supported: supported, unsupportedReason: unsupportedReason,
    connect: connect, disconnect: disconnect,
    isConnected: isConnected, connectedSides: connectedSides,
    deviceName: deviceName, profileName: profileName,
    stats: getStats, rx: getRx, lastRaw: lastRaw,
    send: send, onChange: onChange,
    SIDES: SIDES, SIDE_LABEL: SIDE_LABEL,
    PROFILES: PROFILES, PACKET_BYTES: LEN_FULL, FOOT_PACKET_BYTES: LEN_FOOT,
    _feed: feed   /* 테스트용 */
  };
})();

window.INSOLE = INSOLE;
