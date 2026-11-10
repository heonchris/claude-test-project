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
  seedItems_().forEach(function (x, i) {
    write_(sh, -1, { id: newId_(), kind: x[0], data: x[1], updatedAt: now - i, updatedBy: '세팅', deleted: false });
  });
  Logger.log('완료. 시트: ' + sh.getParent().getUrl());
}

/** 주의: 시트의 모든 데이터를 지우고 setup을 다시 실행합니다. 팀원이 쓰기 전에만 쓰세요. */
function resetAndSetup() {
  var sh = sheet_();
  if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
  setup();
}

/** 「정상회」 문서(시나리오 초본, 소품 리스트, 장비 체크리스트, 일정, 11/10 회의)를 정리한 초기 데이터 */
function seedItems_() {
  var out = [];
  function add(kind, data) { out.push([kind, data]); }

  add('meta', { title: '정상회 단편영화', subtitle: '정기상영회 · 이경현 각본' });

  /* ----- 촬영일 ----- */
  add('day', { date: '2026-10-24', call: '08:50', wrap: '19:00', status: 'done', location: '카페 → 북서울 꿈의숲 → 소품샵',
    scenes: 'S#15, S#16, 몽타주(편지·키링)', note: '약 7명. 일정표 기준 기록이에요. 실제로 못 찍은 컷이 있으면 씬 탭에서 상태를 바꿔 주세요.' });
  add('day', { date: '2026-11-12', call: '17:00', wrap: '', status: 'confirmed', location: '학교 인근 콘크리트벽 / 어두운 외곽',
    scenes: 'S#1, 2, 3, 4 (밤)', note: '야간 터널 입구·인물 연기 (치팅). 필요 인원 7명 이상.\n야외 야간 조명 세팅, 안전·통제 인원 확보.\n17:00부터 촬영, 종료 시각 미정.' });
  add('day', { date: '2026-11-14', call: '09:00', wrap: '', status: 'confirmed', location: '남양주 — 물의 정원 / 아이스크림 가게 / 버스 / 숙소(조안스테이)',
    scenes: 'S#12 재촬영(3컷), 13, 14 · S#5 · S#11 · S#6, 18, 19(달력)',
    note: '1박 2일 1일차. 9시 동방 출발 → 10시 남양주 도착·촬영 시작.\n장비: 카카오T 벤티(4~5명 + 장비) 규빈 예약, 엔빵.\n숙소에 짐 미리 둘 수 있으면 숙소로, 안 되면 물의 정원(운길산역)으로.\n숙소 15명/8명. 씻기는 나눠서 택시 6분 거리 사우나·찜질방.\n설아 집(숙소) 씬은 오후~밤에 다 찍고 자기.\n최종 촬영 순서는 감독님이 11/12(목)까지 전달.\n한낮 12:15 · 일몰 17:21' });
  add('day', { date: '2026-11-15', call: '', wrap: '', status: 'confirmed', location: '남양주 숙소(조안스테이)·주변',
    scenes: '숙소·주변 인서트, S#20', note: '1박 2일 2일차. 1일차만 / 2일차만 참석 가능한 사람 투표 예정.' });
  add('day', { date: '2026-11-19', call: '', wrap: '', status: 'tentative', location: '', scenes: '',
    note: '예비일. 시간 비워두기 — 3~4일 전에 촬영 여부 공지.' });
  add('day', { date: '2026-11-21', call: '', wrap: '', status: 'confirmed', location: '서울숲 공중전화 · 본가(은설이 집) · 렌탈 스튜디오',
    scenes: 'S#9 · S#10 (+S#17) · S#22', note: '본가·공중전화는 오전까지, 13시부터 스튜디오(3~4시간 대관).' });

  /* ----- 시간대별 장소·씬 ----- */
  add('slot', { date: '2026-10-24', start: '09:00', end: '11:00', location: '카페', scenes: 'S#16, 몽타주(편지)', note: '조명 1, 붐마이크' });
  add('slot', { date: '2026-10-24', start: '12:00', end: '13:30', location: '꿈의숲 벤치', scenes: 'S#15 앞부분 (기다림·재회)', note: '삼각대 고정, 점프컷 3~4회' });
  add('slot', { date: '2026-10-24', start: '13:30', end: '14:50', location: '꿈의숲 산책로', scenes: 'S#15 데이트 몽타주', note: '아이스크림 · 사슴 구경 · 산책 · 새끼손가락. 핸드헬드' });
  add('slot', { date: '2026-10-24', start: '15:10', end: '17:40', location: '청운답원 잔디광장 돗자리', scenes: 'S#15 후반부·노을 엔딩', note: '화분 각본 대화, 소매, "은호야". 17:40 일몰' });
  add('slot', { date: '2026-10-24', start: '18:00', end: '18:45', location: '소품샵', scenes: '몽타주(키링 구매) 인서트', note: '' });
  add('slot', { date: '2026-11-12', start: '17:00', end: '', location: '학교 인근 콘크리트벽 / 어두운 외곽', scenes: 'S#1 → 2 → 3 → 4', note: '세부 순서 미정' });
  add('slot', { date: '2026-11-14', start: '10:00', end: '17:21', location: '물의 정원', scenes: 'S#12 재촬영(3컷), S#13, S#14', note: '1일차 낮. 시간은 감독님 최종 순서 나오면 고치기' });
  add('slot', { date: '2026-11-14', start: '', end: '', location: '버스', scenes: 'S#5', note: '1일차 저녁. 시간 미정' });
  add('slot', { date: '2026-11-14', start: '', end: '', location: '아이스크림 가게 & 밤길', scenes: 'S#11', note: '1일차 밤. 시간 미정' });
  add('slot', { date: '2026-11-14', start: '', end: '', location: '숙소(설아 방)', scenes: 'S#6, S#18, 몽타주(달력)', note: '심야. 오후~밤에 다 찍고 자기' });
  add('slot', { date: '2026-11-15', start: '', end: '', location: '숙소·주변', scenes: '인서트, S#20', note: '2일차 오전. 시간 미정' });
  add('slot', { date: '2026-11-21', start: '', end: '13:00', location: '서울숲 공중전화 / 본가(은설이 집)', scenes: 'S#9, S#10, S#17', note: '오전까지' });
  add('slot', { date: '2026-11-21', start: '13:00', end: '', location: '렌탈 스튜디오', scenes: 'S#22', note: '3~4시간 대관. 조명·카메라 사전 세팅 후 집중 촬영' });

  /* ----- 식사 (11/14~15) ----- */
  var mealNote = '후보: 칠오닭갈비 (조안면 북한강로, 물의 정원에서 도보 5~15분, 19:15 라스트오더, 20:00 마감)';
  add('meal', { date: '2026-11-14', time: '', meal: '점심', how: '식당', place: '', people: '', owner: '제작팀', status: 'none', note: '11/12(목)까지 확정해서 공유. ' + mealNote });
  add('meal', { date: '2026-11-14', time: '', meal: '저녁', how: '배달', place: '피자 / 치킨 / 닭볶음탕 중 (배달 가능)', people: '', owner: '제작팀', status: 'none', note: '' });
  add('meal', { date: '2026-11-14', time: '', meal: '간식', how: '편의점', place: '근처 마트 장보기', people: '', owner: '제작팀', status: 'none', note: '마트 위치·영업시간 알아보기' });
  add('meal', { date: '2026-11-15', time: '', meal: '아침', how: '각자', place: '마트에서 사 둔 시리얼 등', people: '', owner: '제작팀', status: 'none', note: '간편하게 먹을 수 있는 것' });
  add('meal', { date: '2026-11-15', time: '', meal: '점심', how: '식당', place: '', people: '', owner: '제작팀', status: 'none', note: '11/12(목)까지 확정해서 공유' });

  /* ----- 씬 (시나리오 초본) ----- */
  function sc(no, summary, place, ie, dn, cast, props, planned, status, note, shot) {
    var d = { no: no, summary: summary, place: place, ie: ie, dn: dn, cast: cast, props: props, planned: planned || '', status: status || 'todo', note: note || '', shotDate: '', shotPlace: '', shotNote: '' };
    if (shot) { d.shotDate = shot[0]; d.shotPlace = shot[1]; d.shotNote = shot[2]; }
    add('scene', d);
  }
  sc('S#1', '통화하며 길을 찾던 설아가 굴다리 안으로 들어간다', '옆동네 → 굴다리 입구', 'EXT.', '밤', '설아, 동생(VO)', '휴대전화, 설아 숄더백', '2026-11-12', 'todo', '나레이션: 엄마의 쉰다섯 번째 생일 / 아흔 번. 멀리서 자전거 벨 "딸랑".');
  sc('S#2', '어둠 속을 헤매다 빠져나오니 핸드폰이 없고, 뒤의 굴다리는 폐쇄돼 있다', '굴다리', 'EXT.', '밤', '설아', '설아 숄더백, 표지판 "동절기 통행 제한 안내"', '2026-11-12', 'todo', '학교 인근 콘크리트벽에서 터널 입구 치팅.');
  sc('S#3', '행인들에게 핸드폰을 빌려 달라고 하지만 거절당하고, 공중전화를 안내받는다', '옆 동네 (사람 많은 곳)', 'EXT.', '밤', '설아, 행인1(커플), 행인2', '', '2026-11-12', 'todo', '');
  sc('S#4', '아이스크림 배달 가던 은호와 첫 만남. 전자 지도를 핸드폰으로 착각한다', '벤치 쪽', 'EXT.', '밤', '설아, 은호', '전자 지도 단말기, 보냉박스, 자전거, 자전거 풍경', '2026-11-12', 'todo', '은호가 알려 주는 길 이름은 로케 보고 확정.');
  sc('S#5', '202번 버스로 자취방에 가는 설아. 승객들은 모두 책과 신문을 읽는다', '버스', 'INT.', '밤', '설아, 승객들', '책, 신문', '2026-11-14', 'todo', '버스 안/밖은 편의에 따라. 문서의 11/12 메모엔 "S#1~5"로 적혀 있어 날짜 확인 필요.');
  sc('S#6', '엄마 생일 비밀번호로 들어온 자취방이 낯설다: 충전기 대신 집전화기, 포스터, 아날로그 시계', '설아 자취방', 'INT.', '밤', '설아', '도어락, 벽 포스터, 아날로그 시계, 집전화기, 달력("엄마 생일" 손글씨)', '2026-11-14', 'todo', 'INSERT: 콘센트 선을 따라 집전화기 / 포스터와 시계 / 달력. 초침 소리가 점점 도드라지게.');
  sc('S#7', '다시 가본 굴다리는 폐쇄돼 있다', '굴다리', 'EXT.', '낮', '설아', '표지판', '', 'todo', '촬영 일정에 배정되지 않았어요. 확인 필요.');
  sc('S#8', '벤치 앞에서 은호와 재회. 컵 아이스크림을 받고 이름을 나눈다', '벤치 앞', 'EXT.', '낮', '설아, 은호', '보냉박스, 컵 아이스크림·스푼, 자전거 풍경', '', 'done', '', ['', '북한강 물의 정원', '물의 정원 촬영분 (씬 8 → 씬 12 → 인서트 순서로 촬영)']);
  sc('S#9', '구급차 소리에 불안해져 공중전화로 엄마·아빠에게 걸지만 없는 번호', '공중전화 부스', 'EXT.', '낮', '설아', '동전, 공중전화', '2026-11-21', 'todo', '서울숲. 초경량 게릴라 3명 (연출·촬영·배우, 자연광 + 핀마이크).');
  sc('S#10', '본가 도어락이 열리지 않고, 안에서 낯선 남자가 "누구세요?"', '본가 복도', 'INT.', '낮', '설아, 낯선 남자(VO)', '도어락', '2026-11-21', 'todo', '은설이 집(후문 인근). 4명 이상, 공간 협소. 카메라는 계속 멀리서. 마지막에 자동등 꺼짐.');
  sc('S#11', '아이스크림 가게 앞에서 은호를 만나 집까지 함께 걷는다', '아이스크림 가게 앞 · 골목', 'EXT.', '밤', '설아, 은호', '아이스크림 가게 포스터·간판', '2026-11-14', 'todo', '종합 일정표엔 1일차 밤(가게 & 밤길)으로 잡혀 있지만 11/10 회의 촬영 순서엔 없어요. 확인 필요.');
  sc('S#12', '[꿈1] 벤치에서 깬 설아. 굴다리는 입춘에 열린다. 은호가 번호를 적어 준다 + 집전화 통화 인서트', '벤치', 'EXT.', '오후', '설아, 은호', '펜, 집전화기', '2026-11-14', 'reshoot', '1일차 낮 물의 정원에서 3컷 재촬영.');
  sc('S#13', '은호가 설아를 자전거 뒤에 태우고 달린다', '길거리', 'EXT.', '오후', '설아, 은호', '자전거, 보조안장, 자전거 풍경', '2026-11-14', 'todo', '은호는 평소 점퍼가 아닌 단정한 옷.');
  sc('S#14', '북한강 물의 정원. 은호의 각본 미팅 이야기, 설아의 구급차 이야기', '북한강 물의 정원', 'EXT.', '저녁', '설아, 은호', '', '2026-11-14', 'todo', '해질 때 ~ 밤. S#15 첫 장면과 설아 위치를 비슷하게 맞춰 연결.');
  sc('S#15', '북서울 꿈의 숲 첫 데이트: 기다림, 아이스크림, 사슴, 새끼손가락, 돗자리 "화분 각본" 대화, "은호야"', '북서울 꿈의 숲', 'EXT.', '낮', '설아, 은호', '아이스크림, 캔 음료, 돗자리', '2026-10-24', 'done', '', ['2026-10-24', '북서울 꿈의 숲', '10/24 일정표 기준 (블록 2~5)']);
  sc('S#16', '[꿈2] 현대식 카페. 핸드폰 액정으로 앞머리 정리, "바이킹 타러 가자"', '카페', 'INT.', '낮', '설아, 은호', '스마트폰', '2026-10-24', 'done', '', ['2026-10-24', '카페', '10/24 일정표 기준 09:00~11:00']);
  sc('S#17', '칠흑 같은 어둠, 쏟아지는 알림 소리 속에 은호가 멀어진다', '굴다리 (암전)', 'INT.', '밤', '설아, 은호', '', '2026-11-21', 'todo', '종합 일정표: 은설이 집에서 불 끄고 암막·틈새 빛으로 치팅 (S#10과 함께).');
  sc('S#18', '새해 카운트다운을 홀로 보던 설아. 창밖에서 은호가 부른다', '설아 자취방', 'INT.', '밤', '설아, 은호, 아나운서(VO)', '아날로그 탁상시계, TV 또는 라디오, 달력("12.31 본가 내려가기")', '2026-11-14', 'todo', '숙소에서 오후~밤에 촬영.');
  sc('S#19', '몽타주: 달력에 입춘 표시(자취방) · 편지 썼다 지우기(카페) · 키링 구매(선물가게)', '자취방 · 카페 · 선물가게', 'INT.', '낮', '설아', '달력, 편지, 키링', '2026-11-14', 'shooting', '나레이션: 은호 머리 위의 숫자 "열여덟".', ['2026-10-24', '카페 · 소품샵', '편지·키링 컷은 10/24 촬영. 달력 컷은 11/14 숙소에서']);
  sc('S#20', '한겨울 벤치. 구급차 소리에 은호가 자전거 종을 울려 준다. 필름카메라로 서로 찍기', '벤치', 'EXT.', '오후', '설아, 은호', '장갑, 자전거 풍경, 필름카메라, 눈송이 아이스크림(인서트), 두꺼운 겨울옷', '2026-11-15', 'todo', '종합 일정표엔 2일차 오전, 11/10 회의에선 북한강 쪽(S#13, 14와 함께). 최종 순서 확인.');
  sc('S#21', '입춘. 열려 있는 굴다리와 새싹', '굴다리', 'EXT.', '낮', '', '', '', 'todo', '촬영 일정에 배정되지 않았어요. 확인 필요.');
  sc('S#22', '은호의 방: 같은 구도에서 책상 위 물건이 하나씩 사라지고 각본을 완성한다. 창밖 자전거와 풍경소리', '은호 집', 'INT.', '오후', '은호', '각본(표지 "<제목> 각본 | 이은호"), 설아의 편지, 키링, 눈송이 아이스크림, 자전거, 자전거 풍경', '2026-11-21', 'todo', '렌탈 스튜디오 3~4시간. CUT 1~4는 의상 다르게, CUT 4는 롱테이크 후 창문 쪽 패닝.');

  /* ----- 소품 (11/10 회의 기준: (0) 있음 → 확보, (x) 없음 → 담당 있으면 구하는 중, 없으면 필요) ----- */
  function pr(name, space, scenes, source, owner, status, note, cost, link) {
    add('prop', { name: name, space: space, scenes: scenes, qty: '', source: source, owner: owner || '', status: status, cost: cost || '', link: link || '', note: note || '' });
  }
  var ROOM = '설아 방 (조안스테이 숙소)';
  pr('벽 포스터 (9·10월 / 2월)', ROOM, 'S#6', '제작', '소현', 'finding', '소현 또는 소품팀에서 제작');
  pr('아날로그 시계 (벽시계·탁상시계)', ROOM, 'S#6, S#18', '구매', '', 'need', 'S#18은 탁상시계 알람 소리로 깸');
  pr('달력', ROOM, 'S#6, S#18, S#19', '구매', '', 'need', 'S#6 내일 날짜 "엄마 생일" 손글씨 · S#18 "12.31 본가 내려가기" · S#19 입춘 표시');
  pr('집전화기 2개', ROOM, 'S#6, S#12', '구매', '혜민', 'finding', '당근마켓에서 구매', '개당 5,000~7,000원');
  pr('TV 또는 라디오', ROOM, 'S#18', '보유', '', 'need', '새해 카운트다운 방송. 숙소 TV를 쓸 수 있는지 확인');
  pr('자전거 풍경 (종·방울)', '은호 · 자전거', 'S#4, 8, 13, 20, 22', '구매', '', 'secured', '맑고 따뜻한 소리', '', 'https://www.coupang.com/vp/products/9031448307?itemId=26472160966&vendorItemId=93447284397');
  pr('자전거', '은호 · 자전거', 'S#4, 13, 20, 22', '대여', '', 'need', '지난 물의 정원 촬영 땐 운길산역에서 대여. 이번에도 대여할지 확인');
  pr('보조안장', '은호 · 자전거', 'S#13', '구매', '', 'need', '설아를 뒤에 태우는 씬');
  pr('보냉박스 + 아이스팩', '은호 · 자전거', 'S#4, 8', '보유', '', 'secured', '지난 촬영에 사용', '', 'http://reknit0012.godomall.com/goods/goods_view.php?goodsNo=1000696825');
  pr('전자 지도 단말기', '은호 · 자전거', 'S#4', '구매', '', 'secured', '버튼 있는 구형 기기 (전자사전·mp3 형식)');
  pr('컵 아이스크림 통·뚜껑·스푼 + 드라이아이스', '은호 · 자전거', 'S#8, 15', '구매', '', 'secured', '10/5 소품 리스트 항목. 남은 촬영에 또 필요하면 상태를 바꿔 주세요', '', 'https://smartstore.naver.com/ilux/products/10957556434');
  pr('아이스크림 가게 포스터', '아이스크림 가게', 'S#11', '제작', '소현', 'finding', '밤 골목용. 부착용 테이프 같이 챙기기');
  pr('아이스크림 가게 간판', '아이스크림 가게', 'S#11', '제작', '', 'need', '회의록에 "간판?"으로 적혀 있어요. 필요 여부 확인');
  pr('책, 신문', '버스', 'S#5', '보유', '하은', 'finding', '승객들이 읽는 용도');
  pr('표지판 "동절기 통행 제한 안내 — ~일부터 ~일까지"', '굴다리', 'S#2, S#7', '제작', '', 'need', '11/12 촬영 전에 필요');
  pr('설아 가방 (숄더백)', '인물 소품', 'S#1, S#2', '보유', '', 'need', '회의록엔 "휴대전화 가방?"으로 적혀 있어요. 11/12 촬영에 필요');
  pr('장갑', '인물 소품', 'S#20', '보유', '소현', 'finding', '');
  pr('펜', '인물 소품', 'S#12', '보유', '소현', 'finding', '은호가 주머니에서 꺼내는 펜');
  pr('필름카메라', '인물 소품', 'S#20', '보유', '승헌', 'finding', '촬영팀 승헌 제공');
  pr('동전', '인물 소품', 'S#9', '보유', '경현', 'finding', '');
  pr('편지', '몽타주 · 엔딩', 'S#19, S#22', '제작', '경현', 'finding', '');
  pr('키링', '몽타주 · 엔딩', 'S#19, S#22', '구매', '경현', 'finding', '');
  pr('눈송이 아이스크림', '몽타주 · 엔딩', 'S#20, S#22', '구매', '', 'need', 'S#20 녹아가는 인서트, S#22 책상 위');
  pr('은호 각본 (표지 "<제목> 각본 | 이은호")', '은호 집 (스튜디오)', 'S#22', '제작', '', 'need', '대본에는 있지만 소품 리스트엔 없던 항목이에요');

  add('mood', { title: '설아 방: 차가운 느낌, 블루·화이트 계열', space: ROOM, link: '',
    note: '11/10 회의 결정.\nS#6에서 설아가 "왠지 어색함"을 느껴야 해요. 침대 밑 충전기는 없고, 벽에 포스터와 아날로그 시계, 콘센트에 연결된 집전화기, 달력이 보여야 해요.\n초침 소리만 가득한 방.' });

  /* ----- 장비 (문서의 장비 체크리스트) ----- */
  var gear = [
    ['카메라', [['카메라 가방', '바디 + ND 필터 + 미스트 필터', ''], ['렌즈 가방', '', '경현, 채환'], ['삼각대', '', ''], ['카메라 배터리 & 충전기', '', ''], ['짐벌', '', '']]],
    ['조명', [['판조명 가방', '', ''], ['조명 1 + 조명 스탠드', '', ''], ['디퓨저', '', ''], ['반사판', '', ''], ['조명용 배터리', '', '']]],
    ['음향', [['마이크 세트', '', ''], ['SD카드', '카메라·마이크 내부 장착 확인', '']]],
    ['현장', [['카트', '', ''], ['슬레이트', '', ''], ['출력된 시나리오·스토리보드', '', '경현'], ['포스터 부착용 테이프', '', ''], ['물티슈·휴지', '아이스크림 손·입 닦기용', '']]]
  ];
  gear.forEach(function (g) {
    g[1].forEach(function (x) { add('gear', { name: x[0], category: g[0], qty: '', owner: x[2], note: x[1], checked: false }); });
  });

  /* ----- 공지·결정 (11/10 회의) ----- */
  add('log', { type: 'notice', team: 'prod', title: '제작팀: 11/12(목)까지 할 일', acks: {},
    body: '1. 1일차·2일차 점심 식사 확정해서 공유\n2. 숙소 근처 마트 위치·영업시간 알아보기\n3. 장보기 리스트: 1일차 간식, 2일차 아침(시리얼 등 간편식)\n4. 카카오T 벤티 예약 (규빈, 11/14 9시)\n→ 일정 탭 11/14·15 식사 칸에 정리해 주세요.' });
  add('log', { type: 'decision', team: 'prod', title: '11/14~15 남양주 이동·숙박', acks: {},
    body: '· 9시 동방 출발 → 10시 남양주 도착, 촬영 시작\n· 장비: 카카오T 벤티(4~5명 + 장비) 규빈 예약, 비용은 엔빵\n· 숙소에 짐 미리 둘 수 있는지 전화로 확인 → 되면 숙소, 안 되면 물의 정원(운길산역)\n· 숙소 15명/8명. 씻기는 나눠서 택시 6분 거리 사우나·찜질방\n· 식사: 1일차 점심·저녁·간식(마트), 2일차 아침(마트)·점심. 배달 가능: 피자, 치킨, 닭볶음탕\n· 설아 집(숙소) 씬은 오후~밤에 다 찍고 자기' });
  add('log', { type: 'decision', team: 'prop', title: '소품 담당 확정', acks: {},
    body: '필름카메라 — 승헌 (촬영팀)\n장갑, 펜 — 소현\n책, 신문 — 하은\n포스터 (설아 방, 아이스크림 가게) — 소현 / 소품팀 제작\n편지, 키링, 동전 — 경현\n집전화기 2개 — 혜민 (당근 5~7천원)\n\n소품 탭에서 확보하면 상태를 "확보"로 바꿔 주세요.' });
  add('log', { type: 'decision', team: 'prop', title: '설아 방 톤: 차가운 느낌, 블루·화이트 계열', acks: {},
    body: '레퍼런스 이미지는 소품 탭 → 무드보드에 올려 주세요.' });
  add('log', { type: 'notice', team: 'dir', title: '최종 촬영 순서는 감독님이 11/12(목)까지 전달', acks: {},
    body: '11/14~15 회의 때 묶은 순서 (확정 전):\n· S#13, 14, 20 — 북한강 쪽\n· S#5, 6, 18, 19 — 숙소\n· S#12, 못 찍은 씬, 인서트\n확정되면 일정 탭 11/14 시간대를 고쳐 주세요. 변경 글이 자동으로 올라가요.' });
  add('log', { type: 'notice', team: 'all', title: '11/14~15 참석 투표 예정', acks: {},
    body: '1일차만 / 2일차만 참석 가능한 사람을 투표로 받을 예정이에요.' });
  add('log', { type: 'notice', team: 'dir', title: '문서 정리하다 나온 확인할 것', acks: {},
    body: '· S#5 버스: 11/12 메모엔 "S#1~5", 종합 일정표엔 11/14 1일차 저녁\n· S#11: 종합 일정표엔 11/14 밤, 11/10 회의 순서엔 없음 (재촬영 필요한지?)\n· S#20: 종합 일정표엔 2일차 오전, 회의에선 북한강 쪽\n· S#7, S#21 (굴다리 낮·입춘): 촬영 일정에 없음\n· 회의록의 "S#23": 시나리오 초본은 S#22까지예요\n· 11/12 메모의 "S#19?": 몽타주 중 어떤 컷인지\n· S#22 은호 각본 표지 소품이 소품 리스트에 없음' });
  add('log', { type: 'notice', team: 'all', title: '촬영 보드를 열었어요', acks: {},
    body: '「정상회」 문서의 시나리오, 일정, 소품·장비 리스트, 11/10 회의 내용을 옮겨 두었어요.\n처음 열면 이름과 팀을 적어 주세요. 공지를 읽으면 "확인했어요"를 눌러 주세요.' });

  return out;
}

/** 팀 비밀번호를 정합니다. 편집기에서 값을 바꿔 한 번 실행하세요. 바꾸지 않고 실행하면 해제돼요. */
function setPasscode() {
  var code = '여기에-비밀번호';
  if (code && code !== '여기에-비밀번호') props_().setProperty('PASSCODE', code);
  else props_().deleteProperty('PASSCODE');
  Logger.log(props_().getProperty('PASSCODE') ? '비밀번호를 설정했어요.' : '비밀번호 없이 열려 있어요.');
}
