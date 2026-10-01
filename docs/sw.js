/* ============================================================
 * sw.js — 오프라인 실행
 *
 * 한 번 열어두면 인터넷이 없어도 앱이 실행됩니다.
 * 헬스장 지하처럼 신호가 약한 곳을 위한 것입니다.
 *
 * 주의: 파일을 고친 뒤에는 아래 VERSION 을 반드시 올리세요.
 * 올리지 않으면 사용자 기기에 옛날 파일이 계속 남습니다.
 * ============================================================ */
var VERSION = "insole-v10";

var SHELL = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/01-config.js",
  "./js/02-sensor.js",
  "./js/03-metrics.js",
  "./js/04-heatmap.js",
  "./js/05-chart.js",
  "./js/06-report.js",
  "./js/07-app.js",
  "./js/08-health.js",
  "./js/09-storage.js",
  "./js/10-wakelock.js",
  "./js/11-ble.js",
  "./js/12-mapping.js",
  "./icon-512.png",
  "./manifest.webmanifest"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (c) {
      /* 하나라도 실패하면 전체가 실패하므로 개별 처리합니다. */
      return Promise.all(SHELL.map(function (u) {
        return c.add(u).catch(function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === VERSION ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* 네트워크 우선 — 연결돼 있으면 항상 최신 파일을 씁니다.
 *
 * 전에는 캐시를 먼저 주고 뒤에서 갱신했습니다(stale-while-revalidate).
 * 오프라인에는 강하지만, 고친 코드가 **다음 번 실행**에야 적용됩니다.
 * 브링업 중에는 이게 치명적입니다 — 고쳤는데도 그대로인 것처럼 보이고,
 * 원인을 하드웨어에서 찾게 됩니다. 실제로 그런 일이 있었습니다.
 *
 * 그래서 온라인이면 네트워크를 먼저 쓰고, 실패할 때만 캐시로 돌아갑니다.
 * 지하 헬스장 같은 오프라인 상황은 캐시 대체로 그대로 지원됩니다.
 */
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  /* 구글 폰트 등 외부 자원은 건드리지 않습니다.
   * 없으면 기기 기본 서체로 대체되며 레이아웃은 유지됩니다. */
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || caches.match("./index.html");
      });
    })
  );
});
