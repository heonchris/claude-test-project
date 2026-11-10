/**
 * 촬영 보드 — Google Apps Script 백엔드
 *
 * 구글 시트 한 장을 데이터베이스로, 구글 드라이브 폴더 하나를 파일 보관함으로 씁니다.
 * 팀원은 웹 앱 링크만 있으면 로그인 없이 보고 쓸 수 있습니다.
 * 설치 방법은 같은 폴더의 README.md를 보세요.
 */

var SHEET_NAME = 'items';
var HEADER = ['id', 'kind', 'title', 'data', 'updatedAt', 'updatedBy', 'deleted'];
var FOLDER_NAME = '촬영 보드 업로드';

/* ---------- 웹 페이지 ---------- */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('촬영 보드')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ---------- 저장소 ---------- */

function props_() {
  return PropertiesService.getScriptProperties();
}

function sheet_() {
  var p = props_();
  var id = p.getProperty('SHEET_ID');
  var ss = null;
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; }
  }
  if (!ss) {
    try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; }
    if (!ss) ss = SpreadsheetApp.create('촬영 보드 데이터');
    p.setProperty('SHEET_ID', ss.getId());
  }
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, HEADER.length).setValues([HEADER]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function folder_() {
  var p = props_();
  var id = p.getProperty('FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* 다시 만듦 */ }
  }
  var f = DriveApp.createFolder(FOLDER_NAME);
  p.setProperty('FOLDER_ID', f.getId());
  return f;
}

function checkCode_(code) {
  var pc = props_().getProperty('PASSCODE');
  if (pc && String(code || '') !== pc) throw new Error('PASSCODE');
}

function rows_() {
  var sh = sheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, HEADER.length).getValues();
}

function toItem_(r) {
  var data = {};
  try { data = JSON.parse(r[3] || '{}'); } catch (e) { data = {}; }
  return {
    id: String(r[0]),
    kind: String(r[1]),
    data: data,
    updatedAt: Number(r[4]) || 0,
    updatedBy: String(r[5] || ''),
    deleted: r[6] === true || r[6] === 'TRUE'
  };
}

function findRow_(sh, id) {
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return i + 2;
  return -1;
}

function write_(sh, row, item) {
  var title = item.data.title || item.data.name || item.data.no || item.data.date || '';
  var values = [[item.id, item.kind, String(title), JSON.stringify(item.data), item.updatedAt, item.updatedBy, !!item.deleted]];
  if (row < 0) sh.appendRow(values[0]);
  else sh.getRange(row, 1, 1, HEADER.length).setValues(values);
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function newId_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 16);
}

/* ---------- 페이지에서 부르는 함수 ---------- */

/** 비밀번호가 필요한지 알려 줍니다. */
function apiInfo() {
  return { needsCode: !!props_().getProperty('PASSCODE'), now: Date.now() };
}

/** since 이후 바뀐 항목을 돌려줍니다. since가 0이면 전부. */
function apiList(code, since) {
  checkCode_(code);
  since = Number(since) || 0;
  var items = rows_().map(toItem_).filter(function (it) { return it.updatedAt > since; });
  return { now: Date.now(), items: items };
}

/** 항목을 만들거나 고칩니다. 기존 필드는 유지하고 보낸 필드만 덮어씁니다. */
function apiSave(code, item, by) {
  checkCode_(code);
  return withLock_(function () {
    var sh = sheet_();
    var id = item.id || newId_();
    var row = findRow_(sh, id);
    var old = row > 0 ? toItem_(sh.getRange(row, 1, 1, HEADER.length).getValues()[0]) : null;
    var data = old ? old.data : {};
    var src = item.data || {};
    for (var k in src) if (src.hasOwnProperty(k)) data[k] = src[k];
    var out = { id: id, kind: item.kind || (old && old.kind) || 'log', data: data, updatedAt: Date.now(), updatedBy: String(by || '').slice(0, 40), deleted: false };
    write_(sh, row, out);
    return out;
  });
}

/** 항목을 지웁니다 (다른 사람 화면에서도 사라지도록 삭제 표시만 남김). */
function apiDelete(code, id, by) {
  checkCode_(code);
  return withLock_(function () {
    var sh = sheet_();
    var row = findRow_(sh, id);
    if (row < 0) return null;
    var it = toItem_(sh.getRange(row, 1, 1, HEADER.length).getValues()[0]);
    it.deleted = true;
    it.updatedAt = Date.now();
    it.updatedBy = String(by || '').slice(0, 40);
    write_(sh, row, it);
    return it;
  });
}

/** 공지·변경에 '확인했어요'를 표시하거나 취소합니다. */
function apiAck(code, id, name, on) {
  checkCode_(code);
  name = String(name || '').slice(0, 40);
  if (!name) throw new Error('NAME');
  return withLock_(function () {
    var sh = sheet_();
    var row = findRow_(sh, id);
    if (row < 0) return null;
    var it = toItem_(sh.getRange(row, 1, 1, HEADER.length).getValues()[0]);
    var acks = it.data.acks || {};
    if (on) acks[name] = Date.now(); else delete acks[name];
    it.data.acks = acks;
    it.updatedAt = Date.now();
    write_(sh, row, it);
    return it;
  });
}

/** 파일을 드라이브에 올리고 링크를 돌려줍니다. */
function apiUpload(code, name, mime, base64) {
  checkCode_(code);
  var bytes = Utilities.base64Decode(base64);
  var blob = Utilities.newBlob(bytes, mime || 'application/octet-stream', name || 'file');
  var file = folder_().createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* 계정 정책상 막힐 수 있음 */ }
  var id = file.getId();
  return {
    id: id,
    name: file.getName(),
    mime: file.getMimeType(),
    size: file.getSize(),
    url: 'https://drive.google.com/file/d/' + id + '/view',
    thumb: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1000'
  };
}

/* ---------- 처음 한 번 실행 ---------- */

/**
 * 편집기에서 이 함수를 한 번 실행하세요.
 * 시트와 드라이브 폴더를 만들고, 캘린더에 있던 촬영 일정과 기본 장비 목록을 넣습니다.
 */
function setup() {
  var sh = sheet_();
  folder_();
  if (rows_().length) {
    Logger.log('이미 데이터가 있어서 기본값은 넣지 않았어요. 시트: ' + sh.getParent().getUrl());
    return;
  }
  var by = '세팅';
  var now = Date.now();
  var seed = [];
  function add(kind, data) { seed.push({ id: newId_(), kind: kind, data: data, updatedAt: now, updatedBy: by, deleted: false }); }

  // 캘린더의 🎬 영화 촬영 일정
  add('day', { date: '2026-11-12', call: '17:00', wrap: '', location: '', scenes: 'S#1~5', status: 'confirmed', note: '17:00부터 촬영 시작 예정 (종료 시각 미정)' });
  add('day', { date: '2026-11-14', call: '', wrap: '', location: '남양주', scenes: '남은 씬들, 자취방 씬들', status: 'confirmed', note: '남양주 메인 촬영 1일차 (캘린더: 11/14~15 이틀 일정)' });
  add('day', { date: '2026-11-15', call: '', wrap: '', location: '남양주', scenes: '남은 씬들, 자취방 씬들', status: 'confirmed', note: '남양주 메인 촬영 2일차' });
  add('day', { date: '2026-11-19', call: '', wrap: '', location: '', scenes: '', status: 'tentative', note: '예비일. 시간 비워두기 — 3~4일 전에 촬영 여부 공지' });
  add('day', { date: '2026-11-21', call: '', wrap: '', location: '', scenes: '엔딩 · 본가 · 공중전화 씬', status: 'confirmed', note: '' });

  // 기본 장비 목록 (단편영화 촬영 템플릿 — 우리 장비에 맞게 고치세요)
  var gear = [
    ['카메라', ['카메라 바디', '렌즈', '카메라 배터리 (전날 충전)', '메모리카드 (포맷 완료)', '배터리 충전기', '삼각대', '짐벌', '외부 모니터']],
    ['조명', ['LED 조명', '조명 스탠드', '반사판', '디퓨저·확산지', '컬러 젤']],
    ['음향', ['붐 마이크 + 붐폴', '무선 핀마이크', '레코더', '헤드폰', '바람막이 (데드캣)']],
    ['현장', ['멀티탭·릴선', '슬레이트', '콘티·대본 출력본', '테이프 (청테이프·마스킹)', '구급상자', '물·간식', '쓰레기봉투', '보조배터리']]
  ];
  gear.forEach(function (g) {
    g[1].forEach(function (name) { add('gear', { name: name, category: g[0], qty: '', owner: '', note: '', checked: false }); });
  });

  add('log', { type: 'notice', team: 'all', title: '촬영 보드를 열었어요', body: '캘린더에 있던 촬영 일정 5일과 기본 장비 목록을 넣어 두었어요.\n장비 목록은 일반적인 단편 촬영 템플릿이라 우리 장비에 맞게 고쳐 주세요.\n최종 대본이 정리되면 씬 목록이 채워질 예정이에요.', acks: {} });

  seed.forEach(function (it) { write_(sh, -1, it); });
  Logger.log('완료. 시트: ' + sh.getParent().getUrl());
}

/** 팀 비밀번호를 정합니다. 편집기에서 값을 바꿔 한 번 실행하세요. 빈 문자열이면 해제. */
function setPasscode() {
  var code = '여기에-비밀번호';
  if (code && code !== '여기에-비밀번호') props_().setProperty('PASSCODE', code);
  else props_().deleteProperty('PASSCODE');
  Logger.log(props_().getProperty('PASSCODE') ? '비밀번호를 설정했어요.' : '비밀번호 없이 열려 있어요.');
}
