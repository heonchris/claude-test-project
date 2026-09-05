const { chromium, devices } = require('/tmp/node_modules/playwright');
const B='file:///tmp/zipcheck/'+encodeURIComponent('발스캔_전달패키지')+'/';
// 깨진 글자(U+FFFD)나 한글이 아예 안 보이는지 확인합니다
async function check(p, url, label, must) {
  await p.goto(url); await p.waitForTimeout(1200);
  const r = await p.evaluate((must)=>{
    const t = document.body.innerText;
    return { 깨진글자: (t.match(/�/g)||[]).length,
             charset: document.characterSet,
             찾는말포함: must.every(m=>t.includes(m)),
             앞부분: t.replace(/\s+/g,' ').slice(0,60) };
  }, must);
  console.log(label.padEnd(12), JSON.stringify(r, null, 0));
  return r;
}
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const c=await b.newContext({...devices['Galaxy S9+'],locale:'ko-KR'});
  const p=await c.newPage();
  const rs=[];
  rs.push(await check(p, B+encodeURIComponent('0_먼저_읽어주세요.html'), '안내문', ['먼저 읽어주세요','더블클릭']));
  rs.push(await check(p, B+encodeURIComponent('1_앱')+'/'+encodeURIComponent('발스캔_앱.html'), '앱', ['발 스캔','측정 시작']));
  rs.push(await check(p, B+encodeURIComponent('2_보고서')+'/'+encodeURIComponent('개발보고서.html'), '보고서', ['핵심과 부수','전달 파일']));
  const bad = rs.filter(r=>r.깨진글자>0 || !r.찾는말포함);
  console.log(bad.length? '❌ 깨진 문서 '+bad.length+'개' : '✅ 세 문서 모두 한글 정상');
  await b.close();
})();
