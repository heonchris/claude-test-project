/* ============================================================
 * 01-config.js — 설정값
 *
 * 튜닝이 필요한 값은 전부 이 파일에 있습니다.
 * 다른 파일을 열지 않고도 센서 배치·판정 기준·색상을 바꿀 수 있습니다.
 * ============================================================ */
var INSOLE = window.INSOLE || {};

INSOLE.config = (function () {
  "use strict";

  /* ── 발 좌표계 ────────────────────────────────────────────
   * 오른발 기준. 폭 100 × 길이 260, 위쪽이 발끝.
   * 실측 mm 와 대략 1:1 로 맞춘 값이라 COP 이동폭이 mm 로 읽힙니다.
   * 왼발은 x 를 좌우 반전(FOOT_W - x)해서 씁니다.
   */
  var FOOT_W = 100;
  var FOOT_H = 260;

  /* ── 센서 배치 (발당 8채널) ───────────────────────────────
   * 순서가 곧 채널 번호입니다.
   *   왼발  = ch1 ~ ch8   (배열 인덱스 0~7)
   *   오른발 = ch9 ~ ch16  (배열 인덱스 0~7)
   *
   * 실제 인솔의 센서 위치가 확정되면 이 좌표만 고치면
   * 히트맵·무게중심·전후 비율이 전부 따라 바뀝니다.
   */
  var SENSORS = [
    { x: 30, y: 30,  name: "엄지",          group: "fore" },
    { x: 62, y: 38,  name: "2–3지",         group: "fore" },
    { x: 28, y: 78,  name: "제1중족골두",   group: "fore" },
    { x: 55, y: 72,  name: "제2–3중족골두", group: "fore" },
    { x: 80, y: 85,  name: "제5중족골두",   group: "fore" },
    { x: 78, y: 145, name: "중족부 외측",   group: "mid"  },
    { x: 36, y: 210, name: "뒤꿈치 내측",   group: "heel" },
    { x: 66, y: 208, name: "뒤꿈치 외측",   group: "heel" }
  ];

  /* ── 신호 규격 ────────────────────────────────────────────
   * MAX_RAW: 아두이노 10bit ADC 기준. ESP32(12bit)로 바꾸면 4095.
   *          바꿀 경우 앱 전체가 이 값을 기준으로 정규화하므로
   *          다른 파일은 손대지 않아도 됩니다.
   */
  var MAX_RAW   = 1023;
  var CHANNELS  = 8;      // 발당
  var SAMPLE_HZ = 30;

  /* ── 전후 비율 기준선 ─────────────────────────────────────
   * 무게중심 y 좌표를 0~1 로 환산할 때 쓰는 두 기준점.
   * FORE_Y = 전족부 중심, HEEL_Y = 뒤꿈치 중심.
   */
  var FORE_Y = 60;
  var HEEL_Y = 209;

  /* ── 판정 임계값 ──────────────────────────────────────────
   * ⚠️ 임시값입니다. 실측 데이터를 모은 뒤 반드시 재조정하세요.
   *
   * LR_*: 좌우 편차(%p). 50:50 에서 얼마나 벗어났는가.
   * AP_*: 전후 비율(%). 앞쪽 비중이 이 값을 넘으면 경고.
   */
  var THRESHOLD = {
    LR_OK:      3,    // 이하면 양호
    LR_WARN:    8,    // 이하면 주의, 초과면 심각
    AP_WARN:   58,    // 앞쪽 비중 % — 이상이면 주의
    AP_SERIOUS: 70    // 이상이면 뒤꿈치 들림으로 판단
  };

  /* ── 히트맵 색상 램프 ─────────────────────────────────────
   * 압력 "크기"를 나타내므로 단일 색상(파랑)의 밝기 단계입니다.
   * 무지개 배색을 쓰지 마세요 — 어느 쪽이 큰지 눈에 읽히지 않습니다.
   * 다크 모드는 어두운 배경에서 밝을수록 강한 압력이 되도록 뒤집습니다.
   */
  var RAMP_LIGHT = ["#eef4fd","#cde2fb","#b7d3f6","#9ec5f4","#86b6ef","#6da7ec","#5598e7",
                    "#3987e5","#2a78d6","#256abf","#1c5cab","#184f95","#104281","#0d366b"];
  var RAMP_DARK  = ["#15202e","#0d366b","#104281","#184f95","#1c5cab","#256abf","#2a78d6",
                    "#3987e5","#5598e7","#6da7ec","#86b6ef","#9ec5f4","#b7d3f6","#cde2fb"];

  /* ── 히트맵 렌더 해상도 ───────────────────────────────────
   * 이 격자로 보간한 뒤 확대합니다. 올리면 선명해지고 느려집니다.
   */
  var GRID_W = 40;
  var GRID_H = 104;

  /* ── 시계열 창 ────────────────────────────────────────────*/
  var CHART_WINDOW_SEC = 10;

  /* ── 채널 상태 판정 ───────────────────────────────────────
   * 최근 HEALTH_WINDOW 프레임을 보고 채널이 정상인지 판정합니다.
   * 30Hz 기준 90프레임 = 3초.
   *
   * DEAD_MAX  : 이 값 이하에서만 머물면 '끊김'.
   *             배선이 빠졌거나 센서가 죽은 경우입니다.
   * SAT_MIN   : 이 값 이상에서만 머물면 '포화'.
   *             힘이 측정 범위를 넘어 더 이상 구분이 안 되는 상태입니다.
   */
  var HEALTH_WINDOW = 90;
  var DEAD_MAX = 4;
  var SAT_MIN  = MAX_RAW - 2;

  /* ── 값 떨림 완화 ─────────────────────────────────────────
   * 최근 N개의 이동평균을 씁니다. 1이면 필터 없음.
   * FSR 은 값이 미세하게 계속 떨리므로 3~5 정도가 적당합니다.
   */
  var SMOOTH_N = 3;

  /* ── 저장 ─────────────────────────────────────────────────*/
  var STORAGE_KEY = "insole.records.v1";
  var MAX_RECORDS = 50;

  return {
    FOOT_W: FOOT_W, FOOT_H: FOOT_H,
    SENSORS: SENSORS,
    MAX_RAW: MAX_RAW, CHANNELS: CHANNELS, SAMPLE_HZ: SAMPLE_HZ,
    FORE_Y: FORE_Y, HEEL_Y: HEEL_Y,
    THRESHOLD: THRESHOLD,
    RAMP_LIGHT: RAMP_LIGHT, RAMP_DARK: RAMP_DARK,
    GRID_W: GRID_W, GRID_H: GRID_H,
    CHART_WINDOW_SEC: CHART_WINDOW_SEC,
    HEALTH_WINDOW: HEALTH_WINDOW, DEAD_MAX: DEAD_MAX, SAT_MIN: SAT_MIN,
    SMOOTH_N: SMOOTH_N,
    STORAGE_KEY: STORAGE_KEY, MAX_RECORDS: MAX_RECORDS,
    /* 발당 채널이 전부 최대일 때의 합. 게이지 상한으로 씁니다. */
    footMax: function () { return CHANNELS * MAX_RAW; }
  };
})();
