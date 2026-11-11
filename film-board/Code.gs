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
    sh.getRange('A:D').setNumberFormat('@');
    sh.getRange('F:F').setNumberFormat('@');
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
  var title = String(item.data.title || item.data.name || item.data.no || item.data.date || '').replace(/^[=+\-@]/, "'$&");
  var values = [[item.id, item.kind, title, JSON.stringify(item.data), item.updatedAt, item.updatedBy, !!item.deleted]];
  if (row < 0) sh.appendRow(values[0]);
  else sh.getRange(row, 1, 1, HEADER.length).setValues(values);
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function newId_() {
  return 'i' + Utilities.getUuid().replace(/-/g, '').slice(0, 15);
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
 * 시트와 드라이브 폴더를 만들고, 「정상회」 문서에 있던 일정·씬·소품·장비·회의 결정을 넣습니다.
 */
function setup() {
  var sh = sheet_();
  folder_();
  if (rows_().length) {
    Logger.log('이미 데이터가 있어서 기본값은 넣지 않았어요. 처음부터 다시 넣으려면 resetAndSetup을 실행하세요. 시트: ' + sh.getParent().getUrl());
    return;
  }
  var now = Date.now();
  var seed = seedItems_();
  var values = seed.map(function (x, i) {
    var t = String(x[1].title || x[1].name || x[1].no || x[1].date || '');
    return [newId_(), x[0], t, JSON.stringify(x[1]), now - i, '세팅', false];
  });
  sh.getRange(2, 1, values.length, HEADER.length).setValues(values);
  Logger.log('완료. 시트: ' + sh.getParent().getUrl());
}

/** 주의: 시트의 모든 데이터를 지우고 setup을 다시 실행합니다. 팀원이 쓰기 전에만 쓰세요. */
function resetAndSetup() {
  var sh = sheet_();
  if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
  setup();
}

/**
 * 초기 데이터. 촬영 방식이 즉흥영화로 바뀌는 중이라 이전 계획(시나리오 초본 기준 일정·씬·소품·장비)은 비워 두었어요.
 * 이전 내용이 필요하면 git 기록에서 이 함수의 예전 버전을 보세요.
 */
function seedItems_() {
  var out = [];
  function add(kind, data) { out.push([kind, data]); }

  add('meta', { title: '정상회 단편영화', subtitle: '정기상영회 · 영화 방향 논의 중' });

  add('log', { type: 'notice', team: 'dir', title: '[필독] 남양주 촬영 관련 중요 논의: 즉흥영화 제안', acks: {},
    body: '14일에 비가 많이 올 것으로 예보되어 있어 기존에 계획했던 야외 촬영을 그대로 진행하기는 많이 어려울 것 같습니다. ' +
      '그래서 촬영을 무리하게 진행하기보다는, 이번 기회에 아예 새로운 방식으로 영화를 만들어보는 건 어떨까 생각했습니다.\n\n' +
      '제안하는 방식: 즉흥영화\n' +
      '· 미리 정해 갈 것: 주제, 소재, 인물 설정, 이야기의 전체적인 흐름, 핵심 사건\n' +
      '· 현장에서 다 함께 만들 것: 구체적인 대사, 연출, 카메라 구도\n\n' +
      '아무런 준비 없이 촬영하는 것은 아니고, 이야기의 핵심 사건은 미리 정해 두면서 세부적인 표현은 현장에서 다 함께 만들어 가는 방식이에요.\n\n' +
      '소품 구매처럼 비용이 발생하는 부분이나 스토리보드, 촬영 준비 등 사전에 결정해야 할 사항들이 있어서 영화의 방향성을 먼저 정하려고 합니다. ' +
      '갑작스러운 변경이라 걱정되는 부분도 있을 것 같아요. 읽었으면 "확인했어요"를 누르고, 의견은 단톡방이나 회의 때 나눠 주세요.' });

  return out;
}

/** 팀 비밀번호를 정합니다. 편집기에서 값을 바꿔 한 번 실행하세요. 바꾸지 않고 실행하면 해제돼요. */
function setPasscode() {
  var code = '여기에-비밀번호';
  if (code && code !== '여기에-비밀번호') props_().setProperty('PASSCODE', code);
  else props_().deleteProperty('PASSCODE');
  Logger.log(props_().getProperty('PASSCODE') ? '비밀번호를 설정했어요.' : '비밀번호 없이 열려 있어요.');
}
