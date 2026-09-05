const { chromium, devices } = require('/tmp/node_modules/playwright');
const SP='/tmp/claude-0/-home-user-claude-test-project/8474b402-a113-54c2-8af8-3986351a5477/scratchpad/';
async function run(label, y4m, shot) {
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-video-capture='+y4m]});
  const c=await b.newContext({...devices['Galaxy S9+'],locale:'ko-KR',permissions:['camera']});
  const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,180)));
  await p.goto('http://127.0.0.1:8777/app_test.html');
  await p.waitForSelector('#s-home:not([hidden])',{timeout:120000});
  await p.click('#go-guide'); await p.click('#go-capture');
  await p.click('.slot[data-k="right_top"]');
  await p.waitForTimeout(4000);
  const chips=(await p.locator('#cam-chips').innerText()).replace(/\n+/g,' · ');
  const res=await p.evaluate(()=>{const v=document.querySelector('#cam-video');return v.videoWidth+'x'+v.videoHeight;});
  const ms=await p.evaluate(()=>{const t=performance.now();camCheck();return Math.round(performance.now()-t);});
  console.log(`${label.padEnd(8)} ${res} | ${chips} | 실시간검사 ${ms}ms`);
  await p.screenshot({path:SP+'cam_'+label+'.png'});
  if (shot) {
    await p.click('#cam-shot');
    await p.waitForFunction(()=>{const e=document.querySelector('.slot[data-k="right_top"] .mark');return e&&e.textContent&&e.textContent!=='검사 중…';},null,{timeout:60000});
    console.log('         → 촬영 결과:', (await p.locator('.slot[data-k="right_top"] .mark').innerText()).trim(),
      '| 복귀', await p.locator('#s-capture').isVisible(), '| 카메라꺼짐', await p.evaluate(()=>!camStream));
    // 그대로 측정까지
    await p.click('#measure');
    await p.waitForSelector('#s-result:not([hidden])',{timeout:180000});
    const t=await p.locator('#result-body').innerText();
    console.log('         → 카메라로 찍은 사진 측정:', (t.match(/(\d{3}\.\d)mm/)||[])[1]+'mm');
  }
  console.log('         오류:', errs.length?errs:'없음');
  await b.close();
}
(async()=>{
  await run('정상', '/tmp/fakecam_top.y4m', true);
  await run('어두움','/tmp/fakecam_dark.y4m');
  await run('흔들림','/tmp/fakecam_blur.y4m');
  await run('종이없음','/tmp/fakecam_nopaper.y4m');
})();
