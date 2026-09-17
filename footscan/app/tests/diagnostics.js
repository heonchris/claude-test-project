const { chromium, devices } = require('/tmp/node_modules/playwright');
const SP='/tmp/claude-0/-home-user-claude-test-project/8474b402-a113-54c2-8af8-3986351a5477/scratchpad/';
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-video-capture=/tmp/fakecam_top.y4m']});
  const c=await b.newContext({...devices['iPhone 13'],locale:'ko-KR',permissions:['camera','clipboard-write']});
  const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,180)));
  await p.goto('http://127.0.0.1:8777/app_test.html');
  await p.waitForSelector('#s-home:not([hidden])',{timeout:120000});
  await p.click('#go-diag'); await p.waitForSelector('#s-diag:not([hidden])');
  await p.waitForTimeout(400);
  console.log('--- 환경 ---'); console.log((await p.locator('#diag-env').innerText()).trim());
  await p.click('#diag-run');
  await p.waitForFunction(()=>document.querySelector('#diag-result').innerText.includes('발 길이')||document.querySelector('#diag-result').innerText.includes('실패'),null,{timeout:180000});
  console.log('--- 자체 시험 ---'); console.log((await p.locator('#diag-result').innerText()).trim());
  await p.click('#diag-cam');
  await p.waitForFunction(()=>!document.querySelector('#diag-cam-result').innerText.includes('여는 중'),null,{timeout:60000});
  console.log('--- 카메라 ---'); console.log((await p.locator('#diag-cam-result').innerText()).trim());
  console.log('--- 복사될 내용 ---'); console.log((await p.locator('#diag-raw').innerText()).trim());
  console.log('가로 넘침:', await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth));
  await p.screenshot({path:SP+'new_11_diag.png', fullPage:true});
  console.log('오류:', errs.length?errs:'없음');
  await b.close();
})();
