const { chromium, devices } = require('/tmp/node_modules/playwright');
const SP='/tmp/claude-0/-home-user-claude-test-project/8474b402-a113-54c2-8af8-3986351a5477/scratchpad/';
const J=SP+'jstest/';
async function put(p,k,f){await p.evaluate((k)=>{const e=document.querySelector(`.slot[data-k="${k}"] .mark`);if(e)e.textContent='';},k);
  await p.click(`.slot[data-k="${k}"]`);
  // 카메라가 열리면 '사진첩에서 고르기'를 눌러 파일을 넣습니다
  if (await p.locator('#s-camera').isVisible()) { const ch=p.waitForEvent('filechooser'); await p.click('#cam-pick'); (await ch).setFiles(J+f); }
  else { const ch=p.waitForEvent('filechooser'); await p.click(`.slot[data-k="${k}"]`); (await ch).setFiles(J+f); }
  await p.waitForFunction((k)=>{const e=document.querySelector(`.slot[data-k="${k}"] .mark`);return e&&e.textContent&&e.textContent!=='검사 중…';},k,{timeout:60000});}
async function audit(p,name){
  const r=await p.evaluate(()=>{
    const de=document.documentElement;
    const over=[...document.querySelectorAll('main *')].filter(e=>{
      const b=e.getBoundingClientRect();
      return b.width>0 && (b.right>de.clientWidth+1 || b.left<-1);
    }).slice(0,4).map(e=>e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(e.className&&typeof e.className==='string'?'.'+e.className.split(' ')[0]:''));
    const tiny=[...document.querySelectorAll('main button, main a')].filter(e=>{
      const b=e.getBoundingClientRect(); return b.width>0 && b.height<40;
    }).slice(0,4).map(e=>(e.id?'#'+e.id:e.tagName.toLowerCase())+' '+Math.round(e.getBoundingClientRect().height)+'px');
    return {hOver:de.scrollWidth-de.clientWidth, over, tiny};
  });
  console.log(`${name.padEnd(10)} 가로넘침 ${r.hOver}px | 튀어나온 요소 ${r.over.length?r.over.join(','):'없음'} | 손가락에 작은 버튼 ${r.tiny.length?r.tiny.join(','):'없음'}`);
}
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-video-capture=/tmp/fakecam_top.y4m']});
  // 좁은 폰(320px) 과 큰 폰(430px) 둘 다
  for (const dev of [{name:'좁은폰320', vp:{width:320,height:658}}, {name:'큰폰430', vp:{width:430,height:932}}]) {
    console.log('── '+dev.name+' ──');
    const c=await b.newContext({viewport:dev.vp,deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'ko-KR',permissions:['camera']});
    const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,140)));
    await p.goto('http://127.0.0.1:8777/app_test.html');
    await p.waitForSelector('#s-home:not([hidden])',{timeout:120000}); await audit(p,'홈');
    await p.click('#go-guide'); await p.waitForTimeout(200); await audit(p,'촬영안내');
    await p.click('#go-capture'); await p.waitForTimeout(200); await audit(p,'사진넣기');
    await p.click('.slot[data-k="right_top"]'); await p.waitForTimeout(2500); await audit(p,'카메라');
    await p.screenshot({path:SP+'lay_cam_'+dev.vp.width+'.png'});
    await p.click('#cam-shot'); await p.waitForTimeout(1500);
    await put(p,'right_side','right_side.jpg');
    await p.click('#measure'); await p.waitForTimeout(2000); await audit(p,'측정중');
    await p.waitForSelector('#s-result:not([hidden])',{timeout:180000}); await audit(p,'결과');
    await p.locator('details summary').first().click(); await p.waitForTimeout(600); await audit(p,'결과+과정');
    await p.screenshot({path:SP+'lay_res_'+dev.vp.width+'.png'});
    // 신발 종류 탭이 좁은 화면에서 옆으로 넘길 수 있는지, 마지막 탭까지 누를 수 있는지
    const tab=await p.evaluate(()=>{
      const t=document.querySelector('.tabs'); if(!t) return null;
      t.scrollLeft=t.scrollWidth;
      const last=[...document.querySelectorAll('.tab')].pop(), lb=last.getBoundingClientRect();
      return {옆으로넘김가능:t.scrollWidth>t.clientWidth, 마지막탭:last.textContent.trim(),
              끝까지밀면보임: lb.right<=document.documentElement.clientWidth+1};
    });
    await p.locator('.tab').last().click(); await p.waitForTimeout(250);
    console.log('  신발탭', JSON.stringify(tab), '→ 선택됨', (await p.locator('.tab.on').innerText()).trim());
    await p.click('#histbtn'); await p.waitForTimeout(400); await audit(p,'이력');
    console.log('  이력 삭제 버튼', await p.evaluate(()=>{const b=document.querySelector('[data-del]').getBoundingClientRect();return Math.round(b.width)+'x'+Math.round(b.height)+'px';}));
    console.log('오류:', errs.length?errs:'없음');
    await c.close();
  }
  await b.close();
})();
