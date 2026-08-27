/* ============================================================
 * 10-wakelock.js — 측정 중 화면 꺼짐 방지
 *
 * 운동 중에는 화면을 계속 켜둬야 합니다. 기본 상태로는
 * 30초쯤 지나면 화면이 꺼져서 측정을 볼 수 없습니다.
 *
 * iOS 는 16.4 부터, 안드로이드 크롬은 오래전부터 지원합니다.
 * 지원하지 않는 기기에서는 조용히 아무 일도 하지 않습니다.
 * ============================================================ */
var INSOLE = window.INSOLE || {};

INSOLE.wakelock = (function () {
  "use strict";
  var lock = null, wanted = false;

  function supported() {
    return !!(navigator.wakeLock && navigator.wakeLock.request);
  }

  function acquire() {
    wanted = true;
    if (!supported()) return Promise.resolve(false);
    return navigator.wakeLock.request("screen").then(function (l) {
      lock = l;
      /* 사용자가 다른 앱에 갔다 오면 잠금이 풀립니다. */
      lock.addEventListener("release", function () { lock = null; });
      return true;
    }).catch(function () { return false; });
  }

  function release() {
    wanted = false;
    if (lock) { try { lock.release(); } catch (e) {} lock = null; }
  }

  /* 앱으로 돌아왔을 때 다시 잠급니다. 이걸 안 하면
   * 알림 하나 확인하고 온 사이에 화면이 꺼져버립니다. */
  document.addEventListener("visibilitychange", function () {
    if (wanted && document.visibilityState === "visible" && !lock) acquire();
  });

  return { supported: supported, acquire: acquire, release: release,
           isHeld: function () { return !!lock; } };
})();
