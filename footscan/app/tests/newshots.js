const { chromium } = require('/tmp/node_modules/playwright');
const SP='/tmp/claude-0/-home-user-claude-test-project/8474b402-a113-54c2-8af8-3986351a5477/scratchpad/';
const J=SP+'jstest/';
async function put(p,k,f){await p.evaluate((k)=>{const e=document.querySelector(`.slot[data-k="${k}"] .mark`);if(e)e.textContent='';},k);
  await p.click(`.slot[data-k="${k}"]`); await p.waitForTimeout(400);
  if (await p.locator('#s-camera').isVisible()) { const c2=p.waitForEvent('filechooser'); await p.click('#cam-pick'); (await c2).setFiles(J+f); }
  else { const c3=p.waitForEvent('filechooser'); await p.click(`.slot[data-k="${k}"]`); (await c3).setFiles(J+f); }
  await p.waitForFunction((k)=>{const e=document.querySelector(`.slot[data-k="${k}"] .mark`);return e&&e.textContent&&e.textContent!=='검사 중…';},k,{timeout:60000});}
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-video-capture=/tmp/fakecam_top.y4m']});
  const c=await b.newContext({viewport:{width:390,height:800},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'ko-KR',permissions:['camera']});
  const p=await c.newPage();
  await p.goto('http://127.0.0.1:8777/app_test.html');
  await p.waitForSelector('#s-home:not([hidden])',{timeout:60000});
  await p.waitForTimeout(400);
  await p.screenshot({path:SP+'new_1_home.png'});
  await p.click('#go-guide'); await p.waitForTimeout(400);
  await p.screenshot({path:SP+'new_2_guide.png'});
  await p.click('#go-capture');
  await p.click('.slot[data-k="right_top"]'); await p.waitForTimeout(2500);
  await p.screenshot({path:SP+'new_10_camera.png'});
  await p.evaluate(()=>history.back()); await p.waitForTimeout(400);
  await put(p,'right_top','right_top.jpg'); await put(p,'right_side','right_side.jpg');
  await put(p,'left_top','left_top.jpg'); await put(p,'left_side','left_side.jpg');
  await p.waitForTimeout(300);
  await p.screenshot({path:SP+'new_3_capture.png'});
  // 품질 경고 화면
  await put(p,'left_side','dark_side.jpg'); await p.waitForTimeout(300);
  await p.evaluate(()=>window.scrollTo(0,0));
  await p.screenshot({path:SP+'new_4_quality.png'});
  await put(p,'left_side','left_side.jpg');
  await p.click('#measure'); await p.waitForTimeout(2500);
  await p.screenshot({path:SP+'new_5_progress.png'});
  await p.waitForSelector('#s-result:not([hidden])',{timeout:180000});
  await p.waitForTimeout(600);
  await p.screenshot({path:SP+'new_6_result.png',fullPage:true});
  await p.locator('details summary').first().click(); await p.waitForTimeout(900);
  await p.evaluate(()=>{const d=document.querySelector('.disc'); if(d) d.style.display='none';});
  const dbg = p.locator('details').first().locator('img');
  const n = await dbg.count();
  for (let i=0;i<Math.min(n,2);i++) await dbg.nth(i).screenshot({path:SP+`new_7_debug${i+1}.png`});
  await p.evaluate(()=>{const d=document.querySelector('.disc'); if(d) d.style.display='';});
  await p.evaluate(()=>{history.pushState({screen:'home'},'','#home');});
  await p.goto('http://127.0.0.1:8777/app_test.html#home');
  await p.waitForSelector('#s-home:not([hidden])',{timeout:60000});
  await p.click('#histbtn'); await p.waitForTimeout(500);
  await p.screenshot({path:SP+'new_8_history.png'});
  console.log('새 화면 캡처 완료');
  await b.close();
})();
