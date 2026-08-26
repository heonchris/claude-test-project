/* ============================================================
 * 06-report.js — 세트 판정
 *
 * 세션 평균값에서 자세 피드백 문구를 만듭니다.
 *
 * ⚠️ 규제 주의
 * 문구는 반드시 "운동 자세 피드백" 범위 안에 있어야 합니다.
 * 진단·질환·치료를 시사하는 표현을 쓰면 의료기기 인허가
 * 대상이 될 수 있습니다. 문구를 고칠 때 이 선을 넘지 마세요.
 * ============================================================ */
var INSOLE = window.INSOLE || {};

INSOLE.report = (function () {
  "use strict";
  var C = INSOLE.config;

  /**
   * @param {number} avgLR 세션 평균 좌우 비율 (1에 가까울수록 왼발)
   * @param {number} avgAP 세션 평균 전후 비율 (1에 가까울수록 앞쪽)
   */
  function judge(avgLR, avgAP) {
    var T = C.THRESHOLD;
    var lrDev = Math.abs(Math.round(avgLR * 100) - 50);   // %p
    var apPct = Math.round(avgAP * 100);                  // %
    var side  = avgLR > 0.5 ? "왼" : "오른";

    var lrSev = lrDev <= T.LR_OK ? 0 : lrDev <= T.LR_WARN ? 1 : 2;
    var apSev = apPct >= T.AP_SERIOUS ? 2 : apPct >= T.AP_WARN ? 1 : 0;

    var lrTitle = ["좌우 균형 양호", "한쪽으로 치우침", "좌우 편차 큼"][lrSev];
    var lrShort = ["양호", "치우침", "편차 큼"][lrSev];
    var lrMsg = [
      "세트 내내 양발에 고르게 실렸습니다. 이 감각을 유지하세요.",
      side + "쪽에 평균 " + lrDev + "%p 더 실렸습니다. 바벨 위치와 발 간격을 점검해 보세요.",
      side + "쪽에 평균 " + lrDev + "%p 더 실렸습니다. 중량을 낮추고 자세를 먼저 잡는 편이 좋습니다."
    ][lrSev];

    var apTitle = ["앞뒤 배분 안정", "무게가 앞쪽으로 쏠림", "뒤꿈치가 뜬 것으로 보임"][apSev];
    var apShort = ["양호", "앞쏠림", "뒤꿈치 뜸"][apSev];
    var apMsg = [
      apPct <= 42 ? "무게가 뒤쪽에 실려 안정적입니다." : "앞뒤 배분이 균형적입니다.",
      "평균 " + apPct + "%가 앞쪽에 실렸습니다. 뒤꿈치가 뜨는지 확인하세요.",
      "무게의 " + apPct + "%가 앞쪽에 실렸습니다. 중량을 낮추고 발 전체로 바닥을 밀어내는 감각을 잡으세요."
    ][apSev];

    /* 좌우와 전후 중 더 심한 쪽을 제목으로 올립니다.
     * 좌우만 보면 뒤꿈치가 떠도 "좌우 균형 양호"가 제목이 되어
     * 정작 중요한 문제가 묻힙니다. */
    var apLeads = apSev > lrSev;
    var severity = Math.max(lrSev, apSev);

    return {
      severity: severity,                                  // 0 양호 · 1 주의 · 2 심각
      cls:   ["g", "w", "s"][severity],                    // CSS 클래스
      chip:  ["c-good", "c-warn", "c-ser"][severity],      // 목록용 칩 클래스
      title: apLeads ? apTitle : lrTitle,
      short: apLeads ? apShort : lrShort,                  // 기록 목록용 짧은 라벨
      message: apLeads ? (apMsg + " " + lrMsg) : (lrMsg + " " + apMsg),
      lrDev: lrDev,
      apPct: apPct
    };
  }

  /** 세션 원본에서 리포트 한 건을 만듭니다. */
  function build(session, meta) {
    var avgLR = session.lr.reduce(function (a, b) { return a + b; }, 0) / session.lr.length;
    var avgAP = session.ap.reduce(function (a, b) { return a + b; }, 0) / session.ap.length;
    var maxDev = 0;
    session.lr.forEach(function (x) { maxDev = Math.max(maxDev, Math.abs(x - 0.5)); });

    var lrPct = Math.round(avgLR * 100);
    var apPct = Math.round(avgAP * 100);

    return {
      id: meta.id,
      scenario: meta.scenario,
      time: meta.time,
      duration: meta.duration,
      reps: meta.reps,
      lrText: lrPct + ":" + (100 - lrPct),
      apText: apPct + " : " + (100 - apPct),
      maxDev: Math.round(maxDev * 100),
      copRange: Math.round(INSOLE.metrics.copRange(session.cop)),
      judge: judge(avgLR, avgAP),
      snapshot: { L: meta.snapshot.L.slice(), R: meta.snapshot.R.slice() }
    };
  }

  return { judge: judge, build: build };
})();
