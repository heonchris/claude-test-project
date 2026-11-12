const {chromium}=require('playwright');const makeGas=require('./gas-emulator.js');
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1};
(async()=>{
  const G=makeGas();
  G.setup();const sh=G.__book.sheets.items;
  ok(sh.rows.length===1+2,'setup이 헤더+2행(제목, 제안 공지)을 만든다 ('+sh.rows.length+')');
  ok(sh.rows.slice(1).every(r=>/^i[0-9a-f]{15}$/.test(r[0])),'모든 id가 문자로 시작');
  G.setup();ok(sh.rows.length===3,'setup을 두 번 실행해도 중복 없음');
  G.resetAndSetup();ok(sh.rows.length===3,'resetAndSetup 후 다시 2행');
  // 테스트용 데이터 (실제 초기 데이터와 무관)
  G.apiSave('',{kind:'day',data:{date:'2099-01-01',call:'17:00',location:'테스트 골목',scenes:'S#1~4',crew:'촬영 손채환',status:'confirmed'}},'세팅');
  G.apiSave('',{kind:'gear',data:{name:'카메라 가방',category:'카메라',checked:false}},'세팅');
  G.apiSave('',{kind:'gear',data:{name:'삼각대',category:'카메라',checked:false}},'세팅');
  G.apiSave('',{kind:'prop',data:{name:'달력',space:'설아 방',status:'need'}},'세팅');
  G.apiSave('',{kind:'prop',data:{name:'펜',space:'인물 소품',status:'finding'}},'세팅');
  const b=await chromium.launch();
  async function open(name,team,code){
    const p=await b.newPage({viewport:{width:390,height:850}});
    const errs=[];p.on('pageerror',e=>errs.push(e.message));p.__errs=errs;
    await p.exposeFunction('__gas',(fn,args)=>{try{return{ok:JSON.parse(JSON.stringify(G[fn](...args)))}}catch(e){return{err:'Exception: '+e.message}}});
    await p.addInitScript(()=>{function run(s,f){const r={withSuccessHandler:fn=>run(fn,f),withFailureHandler:fn=>run(s,fn)};
      ['apiInfo','apiList','apiSave','apiSaveMany','apiReadDoc','apiDelete','apiAck','apiUpload'].forEach(k=>r[k]=(...a)=>{window.__gas(k,a).then(x=>x.err?f&&f(new Error(x.err)):s&&s(x.ok))});return r}
      window.google={script:{run:run(null,null)}}});
    await p.addInitScript(([n,t,c])=>{if(n)localStorage.setItem('fb-me',JSON.stringify({name:n,team:t}));if(c)localStorage.setItem('fb-code',c)},[name,team,code]);
    await p.goto('file://'+require('path').join(__dirname,'..','index.html'));await p.waitForTimeout(400);return p;
  }
  // 처음 온 사람: 이름 묻기
  const n=await open(null,null);ok(await n.isVisible('#me-name'),'처음 열면 이름 입력 창이 뜬다');
  await n.fill('#me-name','하은');await n.selectOption('#me-team','prop');await n.click('#f-submit');await n.waitForTimeout(100);
  ok((await n.textContent('#meBtn')).includes('하은'),'이름 저장 후 헤더에 표시');
  ok(Number(await n.textContent('[data-tab=board] .count'))===1,'새 사람에게 확인 안 한 공지 1건 (즉흥영화 제안)');
  const A=await open('경현','dir'),B=await open('민지','prod');
  // A가 11/12 콜타임 변경
  await A.click('[data-tab=schedule]');await A.click('details[open] >> text=촬영일 수정');
  await A.fill('#f-call','16:30');await A.click('#f-submit');await A.waitForTimeout(300);
  const d=JSON.parse(sh.rows.find(r=>r[1]==='day'&&r[3].includes('2099-01-01'))[3]);
  ok(d.call==='16:30'&&d.status==='changed','시트에 콜타임 16:30·상태 변경됨 저장');
  ok(d.crew.includes('손채환'),'수정해도 다른 필드(스태프) 유지');
  await B.evaluate(()=>sync());await B.waitForTimeout(200);
  ok((await B.textContent('#main')).includes('16:30'),'민지 화면 홈에 16:30 반영');
  await B.click('[data-tab=board]');const first=B.locator('article').first();
  ok((await first.textContent()).includes('콜타임: 17:00 → 16:30'),'변경 글 자동 생성: 콜타임 17:00 → 16:30');
  ok((await first.getAttribute('class')).includes('is-new'),'민지에게 NEW 표시');
  await first.locator('[data-ack]').click();await B.waitForTimeout(200);
  await A.evaluate(()=>sync());await A.click('[data-tab=board]');await A.waitForTimeout(100);
  const af=await A.locator('article').first().textContent();
  ok(af.includes('확인: 민지'),'경현 화면에 "확인: 민지"');
  ok(af.includes('경현 ·'),'작성자는 경현으로 유지');
  // 확인했어요가 NEW를 다시 켜지 않는지 (하은 기준)
  await n.evaluate(()=>{S.lastSeen=Date.now()});await n.evaluate(()=>sync());await n.click('[data-tab=board]');await n.waitForTimeout(100);
  ok(await n.locator('article.is-new').count()===0,'다른 사람의 확인 표시로 NEW가 다시 켜지지 않음');
  // 장비 체크 공유
  await A.click('[data-tab=gear]');await A.click('[data-check] >> nth=0');await A.waitForTimeout(200);
  await B.evaluate(()=>sync());await B.click('[data-tab=gear]');await B.waitForTimeout(100);
  ok(await B.locator('[data-check]:checked').count()===1,'장비 체크가 민지 화면에도 반영');
  ok((await B.textContent('#main')).includes('✓ 경현'),'누가 체크했는지 표시');
  // 사진 업로드
  await B.click('[data-tab=props]');await B.click('[data-pview=mood]');await B.click('[data-new=mood]');
  await B.fill('#f-title','창가 블루 톤');
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNk+M8ABIxAwMDAwMDAAAAZ5gIEKfxaFgAAAABJRU5ErkJggg==','base64');
  await B.setInputFiles('#f-image',{name:'ref.png',mimeType:'image/png',buffer:png});
  await B.click('#f-submit');await B.waitForTimeout(500);
  ok(G.__files.length===1&&G.__files[0].mime==='image/jpeg','사진이 JPEG로 줄여져 드라이브에 저장');
  ok(await B.locator('.mood img').count()===1,'무드보드에 이미지 표시');
  // 삭제
  await A.evaluate(()=>sync());await A.click('[data-tab=props]');
  const before=await A.locator('.it').count();
  await A.click('.it >> nth=0');await A.click('#form [data-del]');await A.click('#form [data-del]');await A.waitForTimeout(300);
  ok(await A.locator('.it').count()===before-1,'소품 삭제');
  await B.evaluate(()=>sync());await B.click('[data-pview=list]');await B.waitForTimeout(100);
  ok(await B.locator('.it').count()===before-1,'삭제가 민지 화면에도 반영');
  // 문서에서 씬 가져오기 ① 붙여 넣기
  await A.click('[data-tab=scenes]');await A.click('.empty [data-act=import]');
  await A.fill('#imp-text','S#1 옆동네 (밤)\n설아가 걷는다.\n설아: 응\n\nS#2 굴다리 (밤)\n헤맨다.\n\nS#3 옆 동네 (밤)\n행인1: 네?');
  await A.click('#f-submit');await A.waitForTimeout(100);
  ok((await A.textContent('#form h2')).includes('3개'),'붙여 넣은 대본에서 씬 3개 찾음');
  await A.uncheck('[data-imp="2"]');ok((await A.textContent('#f-submit')).includes('2개'),'체크 풀면 올릴 개수 갱신');
  await A.click('#f-submit');await A.waitForTimeout(300);
  ok(sh.rows.filter(r=>r[1]==='scene').length===2,'선택한 씬 2개만 시트에 저장');
  ok(await A.locator('.it').count()===2,'씬 탭에 2개 표시');
  // 상태를 바꿔 둔 뒤 다시 가져와도 상태가 유지되는지
  await A.click('.it >> nth=0');await A.selectOption('#f-status','done');await A.fill('#f-shotPlace','시립대 골목');await A.click('#f-submit');await A.waitForTimeout(300);
  // ② 구글 문서 링크 (탭 여러 개)
  G.__docs['1vs349ijK4dgB75RcBPBGSgnOilUtqZrGlfCBG6pTHLY']={title:'테스트 문서',tabs:[{title:'메모',text:'아무 내용'},{title:'시나리오',text:'S#1 옆동네 (밤)\n설아가 휴대전화를 보며 걷는다.\n동생 VO (전화): 응\n\nS#4 벤치 쪽 (밤)\n은호가 지나간다.\n은호: 네?'}]};
  await A.click('[data-act=import]');await A.fill('#imp-url','이상한 주소');await A.click('[data-act=imp-load]');await A.waitForTimeout(200);
  ok((await A.textContent('#f-err')).includes('링크 모양'),'잘못된 링크면 안내');
  await A.fill('#imp-url','https://docs.google.com/document/d/1vs349ijK4dgB75RcBPBGSgnOilUtqZrGlfCBG6pTHLY/edit?usp=drivesdk');await A.click('[data-act=imp-load]');await A.waitForTimeout(300);
  ok(await A.locator('#imp-tab').inputValue()==='1','씬이 있는 탭(시나리오)을 자동 선택');
  ok((await A.inputValue('#imp-text')).includes('S#4 벤치'),'문서 내용이 칸에 채워짐');
  await A.click('#f-submit');await A.waitForTimeout(100);
  ok(await A.locator('.imp-list .p-info').count()===1&&await A.locator('.imp-list .p-ok').count()===1,'S#1은 갱신, S#4는 새로');
  await A.click('#f-submit');await A.waitForTimeout(300);
  const s1=JSON.parse(sh.rows.find(r=>r[1]==='scene'&&r[3].includes('"no":"S#1"'))[3]);
  ok(s1.status==='done'&&s1.shotPlace==='시립대 골목','다시 가져와도 상태·촬영 기록 유지');
  ok(s1.summary.startsWith('설아가 휴대전화를')&&s1.cast==='동생','요약·등장인물은 새 문서 내용으로 갱신');
  ok(sh.rows.filter(r=>r[1]==='scene').length===3,'씬은 중복 없이 3개');
  await B.evaluate(()=>sync());await B.click('[data-tab=board]');await B.waitForTimeout(100);
  ok((await B.textContent('#main')).includes('문서에서 가져왔어요'),'가져오기 공지가 다른 사람에게도 보임');
  // ③ 한 줄 = 씬 하나
  await A.click('[data-tab=scenes]');await A.click('[data-act=import]');
  await A.fill('#imp-text','1. 비 오는 날 우연히 만난다\n2. 우산을 나눠 쓴다');await A.check('[name=imp-mode][value=lines]');await A.click('#f-submit');await A.waitForTimeout(100);
  ok((await A.textContent('#form h2')).includes('2개'),'한 줄 = 씬 하나 모드');
  await A.click('[data-close]');
  // ④ 소품 가져오기 (기존 "펜"은 갱신)
  await A.click('[data-tab=props]');await A.click('[data-act=import][data-target=prop]');
  ok((await A.textContent('#form h2')).includes('소품 가져오기'),'소품 탭에서 소품 가져오기 창');
  await A.fill('#imp-text','[설아 방]\n필름카메라 - 승헌\n전자지도(0)\n펜 - 소현');await A.click('#f-submit');await A.waitForTimeout(100);
  ok(await A.locator('.imp-list .p-info').count()===1,'이미 있는 "펜"은 갱신으로 표시');
  await A.click('#f-submit');await A.waitForTimeout(300);
  const propRows=sh.rows.filter(r=>r[1]==='prop'&&r[6]!==true).map(r=>JSON.parse(r[3]));
  const pen=propRows.find(d=>d.name==='펜'),cam=propRows.find(d=>d.name==='필름카메라'),map=propRows.find(d=>d.name==='전자지도');
  ok(pen&&pen.owner==='소현'&&propRows.filter(d=>d.name==='펜').length===1,'펜: 중복 없이 담당 소현으로 갱신');
  ok(cam&&cam.owner==='승헌'&&cam.status==='finding'&&cam.space==='설아 방','필름카메라: 새로, 담당 승헌, 구하는 중, 공간 설아 방');
  ok(map&&map.status==='secured','전자지도(0) → 확보');
  // ⑤ 장비 가져오기
  await A.click('[data-tab=gear]');await A.click('[data-act=import][data-target=gear]');
  await A.fill('#imp-text','[조명]\n- 반사판\n- 삼각대 (채환 챙김)');await A.click('#f-submit');await A.waitForTimeout(100);await A.click('#f-submit');await A.waitForTimeout(300);
  const gearRows=sh.rows.filter(r=>r[1]==='gear').map(r=>JSON.parse(r[3]));
  ok(gearRows.find(d=>d.name==='반사판')?.category==='조명','반사판 새로, 분류 조명');
  ok(gearRows.filter(d=>d.name==='삼각대').length===1&&gearRows.find(d=>d.name==='삼각대').owner==='채환','삼각대는 갱신(중복 없음), 챙길 사람 채환');
  // ⑥ 일정 가져오기
  await A.click('[data-tab=schedule]');await A.click('[data-act=import][data-target=schedule]');
  await A.fill('#imp-text','<11/12 촬영>\n5시 집합\nS#1~4\n시립대 자과관 뒤쪽 골목\n촬영: 손채환\n12:00 점심 김밥천국');await A.click('#f-submit');await A.waitForTimeout(100);
  ok(await A.locator('.imp-list .it').count()===3,'촬영일·집합 시간대·식사 3개 찾음');
  await A.click('#f-submit');await A.waitForTimeout(300);
  const yr=new Date().getFullYear();const dayRow=sh.rows.slice(1).map(r=>[r[1],JSON.parse(r[3]||'{}')]).find(([k,d])=>k==='day'&&d.date===yr+'-11-12');
  ok(dayRow&&dayRow[1].call==='17:00'&&dayRow[1].location==='시립대 자과관 뒤쪽 골목'&&dayRow[1].crew==='촬영 손채환','11/12 촬영일: 콜 17:00, 장소, 스태프');
  ok(sh.rows.some(r=>r[1]==='meal'&&/김밥천국/.test(r[3])),'점심 식사도 저장');
  await B.evaluate(()=>sync());await B.click('[data-tab=board]');await B.waitForTimeout(100);
  ok((await B.textContent('#main')).includes('일정 3개를 문서에서 가져왔어요'),'일정 가져오기 공지');
  // 비밀번호
  G.__props.PASSCODE='film1114';
  const C=await open('지수','cam');ok(await C.isVisible('#code'),'비밀번호 설정 후 비밀번호 창');
  await C.fill('#code','wrong');await C.click('#f-submit');await C.waitForTimeout(200);
  ok(await C.isVisible('#code'),'틀린 비밀번호면 다시 묻는다');
  await C.fill('#code','film1114');await C.click('#f-submit');await C.waitForTimeout(300);
  ok((await C.textContent('#main')).includes('다음 촬영'),'맞는 비밀번호면 열린다');
  const allErrs=[n,A,B,C].flatMap(p=>p.__errs);ok(allErrs.length===0,'페이지 오류 없음 '+JSON.stringify(allErrs));
  await b.close();
})();
