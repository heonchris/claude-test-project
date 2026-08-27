/* ============================================================
 * sw.js — 오프라인 실행
 *
 * 한 번 열어두면 인터넷이 없어도 앱이 실행됩니다.
 * 헬스장 지하처럼 신호가 약한 곳을 위한 것입니다.
 *
 * 주의: 파일을 고친 뒤에는 아래 VERSION 을 반드시 올리세요.
 * 올리지 않으면 사용자 기기에 옛날 파일이 계속 남습니다.
 * ============================================================ */
var VERSION = "insole-v1";

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

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  /* 구글 폰트 등 외부 자원은 건드리지 않습니다.
   * 없으면 기기 기본 서체로 대체되며 레이아웃은 유지됩니다. */
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) {
        /* 캐시를 먼저 주고, 뒤에서 조용히 갱신합니다. */
        fetch(req).then(function (res) {
          if (res && res.ok) caches.open(VERSION).then(function (c) { c.put(req, res.clone()); });
        }).catch(function () {});
        return hit;
      }
      return fetch(req).catch(function () { return caches.match("./index.html"); });
    })
  );
});
