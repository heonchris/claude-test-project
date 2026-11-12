// 대본 분석기 단위 시험: index.html 안의 parseScenes/parseLines를 꺼내 돌린다.
const fs=require('fs'),path=require('path');
const h=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const pick=n=>{const a=h.indexOf('function '+n+'(');let d=0,i=h.indexOf('{',a);for(;i<h.length;i++){if(h[i]==='{')d++;else if(h[i]==='}'&&--d===0)break}return h.slice(a,i+1)};
const P=new Function(['cleanLine','sceneKey','parseScenes','buildScene','parseLines'].map(pick).join('\n')+';return{parseScenes,parseLines,sceneKey}')();
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
process.exitCode=fail?1:0;
