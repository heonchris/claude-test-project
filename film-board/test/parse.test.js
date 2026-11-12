// 대본 분석기 단위 시험: index.html 안의 parseScenes/parseLines를 꺼내 돌린다.
const fs=require('fs'),path=require('path');
const h=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const pick=n=>{const a=h.indexOf('function '+n+'(');let d=0,i=h.indexOf('{',a);for(;i<h.length;i++){if(h[i]==='{')d++;else if(h[i]==='}'&&--d===0)break}return h.slice(a,i+1)};
const fnNames=['pad','cleanLine','sceneKey','nameKey','parseScenes','buildScene','parseLines','stripMarker','maskParens','splitTop','cutTop','isHeader','headerText','cleanOwner','parseItem','looksProse','parseList','gearCategory','isoDate','parseTime','isMeal','parseSchedule'];
const dateRe=h.match(/var DATE_RE=.*?;\n/)[0];
const P=new Function(dateRe+fnNames.map(pick).join('\n')+';return{'+fnNames.join(',')+'}')();
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};

const plain=`정상회 시나리오 초본

S#1 옆동네 (밤)
설아가 휴대전화를 보며 걷고 있다. 지도 앱에 표시된 목적지를 확인한다.
설아: 응, 나 지금 가는 중이야.
동생 VO (전화): 응. 넘어가면 금방 나와
설아 (N): 내일은 엄마의 쉰다섯 번째 생일
CUT TO.

S#2 굴다리 (밤)
어두운 굴다리 안으로 들어가, 헤매고 있는 설아.
“동절기 통행 제한 안내 — ~일부터 ~일까지”

S#6 설아 자취방 (밤)
현관 앞에 선 설아. 도어락 앞에서 손이 멈춘다.
INSERT: 콘센트에 연결된 선을 따라가니, 집전화기가 보인다.
INSERT: 벽의 포스터와 아날로그 시계
(소리) 초침 소리

S#12 벤치 (오후)
[꿈1]
자다가 어둠 속에서 희미한 진동 소리에 잠에서 깬다.
은호: 설아씨, 괜찮아요?
설아:

S#14 북한강 (해질 때~밤)
도착한 곳은 북한강 물의 정원
은호: 저는 오늘 미팅하고 왔어요

[꿈 2]

S#16 카페
햇살이 드는 현대식 카페. 옆에 앉아 있는 은호.

S#15 북서울 꿈의 숲

1
설아는 먼저 도착해서 벤치에 앉아있다.
은호(V.O): 설아씨 늦어서 미안해요

S#10 본가 (낮)
낯선 남자 (VO.): 누구세요?

S#3 INT. 버스 - 밤
행인1: 네?

끝.

# 소품 리스트
S#99 이건 끝 뒤라 무시돼야 함`;
const r=P.parseScenes(plain);
ok(r.length===9,'씬 9개 찾음 ('+r.length+')');
const by=n=>r.find(x=>x.no===n)||{};
ok(by('S#1').place==='옆동네'&&by('S#1').dn==='밤','S#1 장소 옆동네·밤');
ok(by('S#1').cast==='설아, 동생','S#1 등장인물 설아, 동생 ('+by('S#1').cast+')');
ok(by('S#1').summary.startsWith('설아가 휴대전화를'),'S#1 요약은 첫 지문');
ok(by('S#6').note.includes('콘센트')&&!by('S#6').cast,'S#6 INSERT는 메모로, 등장인물로 안 셈');
ok(by('S#12').summary.startsWith('[꿈1] 자다가'),'S#12 [꿈1] 표시 + 지문');
ok(by('S#12').dn==='낮'&&by('S#12').cast==='은호, 설아','S#12 오후→낮, 은호·설아');
ok(by('S#14').dn==='저녁'&&by('S#14').place==='북한강','S#14 해질 때~밤→저녁');
ok(by('S#16').summary.startsWith('[꿈 2] 햇살'),'씬 앞의 [꿈 2]는 다음 씬에 붙음');
ok(!by('S#14').summary.includes('꿈 2'),'[꿈 2]가 앞 씬에 섞이지 않음');
ok(by('S#15').place==='북서울 꿈의 숲'&&by('S#15').summary.startsWith('설아는 먼저')&&by('S#15').cast==='은호','S#15 번호 줄 건너뛰고 V.O 정리');
ok(by('S#10').cast==='낯선 남자','S#10 낯선 남자 (VO.)');
ok(by('S#3').ie==='INT.'&&by('S#3').dn==='밤'&&by('S#3').place==='버스','INT. 버스 - 밤 형식');
ok(!r.some(x=>x.no==='S#99'),'끝. 이후는 무시');

const md=P.parseScenes('**S\\#1 옆동네 (밤)**\n\n설아가 걷는다.\n\n**설아:** 응\n\n**S\\#2 굴다리 (밤)**\n\n헤맨다.');
ok(md.length===2&&md[0].cast==='설아','마크다운으로 복사한 대본도 처리');
const loose=P.parseScenes('씬 1. 카페 (낮)\n두 사람이 만난다.\n씬 2. 공원 (밤)\n헤어진다.');
ok(loose.length===2&&loose[1].place==='공원','S# 없이 "씬 1." 형식도 처리');
const lines=P.parseLines('1. 설아가 굴다리를 지나 과거로 간다\n2. 은호를 만난다\n- 입춘에 굴다리가 열린다\n');
ok(lines.length===3&&lines[2].no==='S#3'&&lines[2].summary==='입춘에 굴다리가 열린다','한 줄 = 씬 하나, 번호·글머리 제거');
ok(P.sceneKey('S# 12')===P.sceneKey('s#12'),'씬 번호 비교는 띄어쓰기·대소문자 무시');

/* ---- 소품 ---- */
const props=P.parseList(`<11/14 소품 준비>
필름카메라 - 승헌
장갑 - 소현
책, 신문 - 하은
편지, 키링, 동전 - 경현
집전화기 2개(당근에서 5-7천원) : 혜민

11/12 : 평일 1(씬 1,2,3,4)->휴대전화 가방?, 표지판(동절기 통행 제한 안내 -~일부터 ~일까지)(x), 전자지도(0).
11/14~11/15(씬 13, 14, 20) : 자전거, 풍경소리(0), 장갑, 눈송이 아이스크림(x), 필름카메라(x), 펜, 아날로그 시계(x)

[소품 및 의상 체크리스트]
- 보냉박스 (아이스크림 통)
https://reknit0012.godomall.com/goods/goods_view.php?goodsNo=1
- 좋은 소리가 나는 자전거 장식 (택 1): 풍경, 황동 방울, 도어벨, 나무 모빌 등 맑고 따뜻한 소리가 나는 소품.
설아는 특별히 슬픈 표정을 짓지 않는다. 잠시 휴대전화 화면을 확인하고는 다시 걷는다.
| 09:00 | 카페 | S#16 |`);
const pp=n=>props.find(x=>P.nameKey(x.name)===P.nameKey(n))||{note:'',name:'',link:''};
ok(pp('필름카메라').owner==='승헌'&&pp('필름카메라').status==='need','필름카메라: 담당 승헌 + (x) 합쳐짐 ('+JSON.stringify(pp('필름카메라'))+')');
ok(props.filter(x=>P.nameKey(x.name)==='필름카메라').length===1,'같은 소품은 하나로 합침');
ok(pp('장갑').owner==='소현','장갑 - 소현');
ok(pp('집전화기').qty==='2'&&pp('집전화기').owner==='혜민'&&pp('집전화기').cost==='5-7천원'&&pp('집전화기').source==='구매','집전화기 2개, 혜민, 5-7천원, 구매');
ok(pp('표지판').status==='need'&&pp('표지판').note.includes('동절기'),'표지판 (x) + 괄호 내용은 메모');
ok(pp('전자지도').status==='secured','전자지도 (0) → 확보');
ok(pp('휴대전화 가방').note.includes('필요한지'),'"가방?"은 필요한지 확인 메모');
ok(pp('풍경소리').status==='secured','쉼표 목록 속 풍경소리(0)');
ok(pp('보냉박스').link.startsWith('https://reknit')&&pp('보냉박스').group==='소품 및 의상 체크리스트','다음 줄 링크가 앞 소품에 붙고, 머리말은 공간');
ok(pp('좋은 소리가 나는 자전거 장식').note.includes('황동 방울'),'긴 설명은 메모로');
ok(!props.some(x=>/설아는|카페|09/.test(x.name)),'지문 문장·표는 무시');
ok(['책','신문','편지','키링','동전'].every(n=>pp(n).name),'쉼표로 나열한 소품도 각각 ('+props.map(x=>x.name).join('/')+')');

/* ---- 장비 ---- */
const gear=P.parseList(`[장비 체크리스트]
- 카메라 가방 (카메라 바디 + ND 필터 + 미스트 필터)
- 렌즈 가방 (경현, 채환이 챙김)
- 삼각대
- 판조명 가방
- 마이크 세트
- SD카드 (카메라, 마이크 내부 장착 확인 완료)
[현장 운영 및 소모품]
- 물티슈 및 휴지 (아이스크림 손/입 묻음 닦기용)
- 출력된 시나리오 및 스토리보드 (경현 챙김)
[소품 및 의상 체크리스트]
- 아이스크림 컵, 뚜껑`);
const gg=n=>gear.find(x=>x.name===n)||{note:'',group:''};
ok(gg('렌즈 가방').owner==='경현, 채환','렌즈 가방 (경현, 채환이 챙김) → 챙길 사람');
ok(gg('카메라 가방').note.includes('ND 필터')&&!gg('카메라 가방').owner,'카메라 가방 괄호는 메모');
ok(P.gearCategory(gg('렌즈 가방').group,'렌즈 가방')==='카메라','머리말 "장비 체크리스트" + 이름으로 카메라 분류');
ok(P.gearCategory(gg('판조명 가방').group,'판조명 가방')==='조명'&&P.gearCategory('', '마이크 세트')==='음향','판조명→조명, 마이크→음향');
ok(P.gearCategory(gg('출력된 시나리오 및 스토리보드').group,'출력된 시나리오 및 스토리보드')==='현장'&&gg('출력된 시나리오 및 스토리보드').owner==='경현','현장 운영 머리말 → 현장, 경현 챙김');
ok(gg('SD카드').note.includes('장착')&&!gg('SD카드').owner,'SD카드 괄호 속 쉼표는 나누지 않음');

/* ---- 일정 ---- */
const sch=P.parseSchedule(`[촬영 일정 및 역할]
<11/12 촬영>
   ⁃   5시 집합
   ⁃   S#1~4
   ⁃   시립대 자과관 뒤쪽 골목
촬영: 손채환
사운드: 정은설

<11/14 집합>
- 규빈, 성빈, 하은, 은설 - 학교로, 9시까지
09:00 학교 집합 (장비조)
10:00 운길산역 집합
12:00 점심 칠오닭갈비
~19:10 | 저녁 식사지로 도보 이동 | 칠오닭갈비
~20:00 | 저녁식사 |
~22:00 쯤 | 씬 11 촬영 (여유 시 씬 1~4) |

11. 21 토 > 스튜디오, 본가, 공중전화
11.14 (토) ~ 15 (일) 남양주 1박 2일
11/19 예비일
| 09:00 - 11:00 | 카페 | S#16 & 몽타주(편지) | 조명 1 |`);
const day=d=>sch.find(e=>e.kind==='day'&&e.data.date===d)||{data:{}};
ok(day('2026-11-12').data.call==='17:00','11/12 "5시 집합" → 콜 17:00');
ok(day('2026-11-12').data.location==='시립대 자과관 뒤쪽 골목'&&day('2026-11-12').data.scenes==='S#1~4','11/12 장소·씬');
ok(day('2026-11-12').data.crew==='촬영 손채환\n사운드 정은설','11/12 스태프');
const sl=sch.filter(e=>e.kind==='slot'&&e.data.date==='2026-11-14');
ok(day('2026-11-14').data.call==='09:00','11/14 첫 집합 시간이 콜');
ok(sl.some(e=>e.data.start==='10:00'&&/운길산역/.test(e.data.location)),'10:00 운길산역 집합 시간대');
ok(sl.some(e=>e.data.start==='19:10'&&/도보 이동/.test(e.data.location)),'"저녁 식사지로 이동"은 식사가 아니라 시간대');
const ml=sch.filter(e=>e.kind==='meal'&&e.data.date==='2026-11-14');
ok(ml.length===2&&ml.some(e=>e.data.meal==='점심'&&/칠오닭갈비/.test(e.data.place))&&ml.some(e=>e.data.meal==='저녁'&&e.data.time==='20:00'),'점심·저녁식사는 식사로 ('+JSON.stringify(ml.map(e=>e.data))+')');
ok(sl.some(e=>e.data.start==='22:00'),'"~22:00 쯤" 표 행도 시간대');
ok(day('2026-11-21').data.location==='스튜디오, 본가, 공중전화','"11. 21 토 > …" 형식');
ok(day('2026-11-15').data.date==='2026-11-15'&&/남양주/.test(day('2026-11-15').data.location),'11.14 ~ 15 범위는 이틀 모두');
ok(day('2026-11-19').data.status==='tentative','예비일 → 예비 상태');
ok(sch.some(e=>e.kind==='slot'&&e.data.start==='09:00'&&e.data.end==='11:00'&&e.data.location==='카페'&&/S#16/.test(e.data.scenes)),'표 행: 09:00–11:00 카페 S#16');
ok(P.parseTime('5시').t==='17:00'&&P.parseTime('오전 5시').t==='05:00'&&P.parseTime('17시 21분').t==='17:21'&&P.parseTime('9시 반').t==='09:30','시간 읽기');
ok(!P.parseSchedule('1.5시간 정도 걸림\n설아가 걷는다').length,'"1.5시간"을 날짜로 오해하지 않음');
process.exitCode=fail?1:0;
