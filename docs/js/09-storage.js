/* ============================================================
 * 09-storage.js — 기록 저장과 내보내기
 *
 * 저장은 브라우저(localStorage)에 합니다. 서버가 없으므로
 * 이 휴대폰 안에만 남고 다른 기기로는 넘어가지 않습니다.
 * 실제 제품은 사업 정의서 6단계의 DB 가 이 자리를 대신합니다.
 * ============================================================ */
var INSOLE = window.INSOLE || {};

INSOLE.storage = (function () {
  "use strict";
  var C = INSOLE.config;

  /* 저장이 막힌 환경(사생활 보호 모드 등)에서도 앱이 죽지 않도록
   * 모든 접근을 try/catch 로 감쌉니다. */
  function load() {
    try {
      var raw = localStorage.getItem(C.STORAGE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function save(records) {
    try {
      /* 오래된 것부터 버립니다. 용량 한도를 넘으면 저장 자체가 실패합니다. */
      var trimmed = records.slice(0, C.MAX_RECORDS);
      localStorage.setItem(C.STORAGE_KEY, JSON.stringify(trimmed));
      return true;
    } catch (e) { return false; }
  }

  function clear() {
    try { localStorage.removeItem(C.STORAGE_KEY); return true; }
    catch (e) { return false; }
  }

  function available() {
    try {
      var k = "__t";
      localStorage.setItem(k, "1"); localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  }

  /* ── 내보내기 ─────────────────────────────────────────────
   * 엑셀에서 바로 열리도록 CSV 로 만듭니다.
   * 한글이 깨지지 않게 BOM 을 붙입니다.
   */
  function toCSV(records) {
    var head = ["측정시각","시나리오","측정시간(초)","반복(회)",
                "좌우비율","최대편차(%p)","전후비율","COP이동폭(mm)","판정"];
    for (var i = 1; i <= C.CHANNELS * 2; i++) head.push("ch" + i);

    var rows = [head];
    records.forEach(function (r) {
      var row = [r.time, r.scenario, r.duration, r.reps,
                 r.lrText, r.maxDev, r.apText, r.copRange, r.judge.title];
      ["L", "R"].forEach(function (s) {
        for (var i = 0; i < C.CHANNELS; i++) row.push(r.snapshot[s][i]);
      });
      rows.push(row);
    });

    return rows.map(function (r) {
      return r.map(function (cell) {
        var v = String(cell == null ? "" : cell);
        /* 쉼표나 따옴표가 들어 있으면 감싸줍니다. */
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(",");
    }).join("\n");
  }

  /** 파일로 내려받기. 일부 환경(아티팩트 뷰어)에서는 막혀 있습니다. */
  function download(text, filename) {
    try {
      var blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
      return true;
    } catch (e) { return false; }
  }

  /** 클립보드 복사. 내려받기가 막힌 곳에서 쓰는 대안입니다. */
  function copy(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
      }
    } catch (e) {}
    /* 구형 대체 경로 */
    try {
      var ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return Promise.resolve();
    } catch (e) { return Promise.reject(e); }
  }

  return { load: load, save: save, clear: clear, available: available,
           toCSV: toCSV, download: download, copy: copy };
})();
