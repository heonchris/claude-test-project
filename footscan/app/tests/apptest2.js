const { chromium, devices } = require('/tmp/node_modules/playwright');
const SP='/tmp/claude-0/-home-user-claude-test-project/8474b402-a113-54c2-8af8-3986351a5477/scratchpad/';
const J=SP+'jstest/';
async function put(p, key, file){
  // 이전 결과를 지워두고 시작해야, 새 결과를 확실히 기다릴 수 있습니다
  await p.evaluate((k)=>{document.querySelector(`.slot[data-k="${k}"] .mark`).textContent='';},key);
  const ch=p.waitForEvent('filechooser');
  await p.click(`.slot[data-k="${key}"]`);
  (await ch).setFiles(J+file);
  await p.waitForFunction((k)=>{const e=document.querySelector(`.slot[data-k="${k}"] .mark`);
    return e && e.textContent && e.textContent!=='' && e.textContent!=='검사 중…';},key,{timeout:60000});
  return (await p.locator(`.slot[data-k="${key}"] .mark`).textContent()).trim();
}
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--js-flags=--expose-gc']});
  const c=await b.newContext({...devices['Galaxy S9+'],locale:'ko-KR'});
  const p=await c.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,160)));
  await p.goto('http://127.0.0.1:8777/app_test.html');
  await p.waitForSelector('#s-home:not([hidden])',{timeout:180000});
  await p.click('#go-guide'); await p.click('#go-capture');

  console.log('=== 1. 촬영 품질 검사가 나쁜 사진을 잡아내는가 ===');
  for (const [label, file] of [['어두운 사진','dark_top.jpg'], ['흔들린 사진','blur_top.jpg'], ['그림자 사진','shadow_top.jpg'], ['정상 사진','right_top.jpg']]) {
    const mark = await put(p,'right_top',file);
    const note = (await p.locator('#quality-note').innerText()).replace(/\n+/g,' ').trim();
    console.log(`  ${label.padEnd(8)} → ${mark.padEnd(8)} | ${note.slice(0,64)}`);
  }

  console.log('\n=== 2. 종이가 없는 사진 → 오류 안내 ===');
  await put(p,'right_top','nopaper.jpg');
  await p.click('#measure');
  await p.waitForSelector('#s-error:not([hidden])',{timeout:120000});
  const et=(await p.locator('#error-body').innerText()).split('\n');
  console.log('  ', et[0]);
  console.log('  ', et.find(l=>l.includes('오류 코드'))||'');
  await p.screenshot({path:SP+'app_8_error.png', fullPage:true});
  await p.click('#err-retry');

  console.log('\n=== 3. 반복 측정 — 메모리가 계속 늘어나는가 (누수 확인) ===');
  const heaps=[];
  for(let i=0;i<4;i++){
    await put(p,'right_top','right_top.jpg');
    await put(p,'right_side','right_side.jpg');
    await p.click('#measure');
    await p.waitForSelector('#s-result:not([hidden])',{timeout:180000});
    const h=await p.evaluate(()=>performance.memory? Math.round(performance.memory.usedJSHeapSize/1048576):null);
    heaps.push(h);
    const len=(await p.locator('#result-body').innerText()).match(/(\d{3}\.\d)/);
    console.log(`  ${i+1}회차: 길이 ${len?len[1]:'?'}mm, JS 힙 ${h}MB`);
    await p.click('#again');
  }
  const growth = heaps[3]-heaps[0];
  console.log(`  → 4회 반복 후 힙 증가: ${growth}MB ${Math.abs(growth)<60?'(정상 범위)':'(누수 의심)'}`);

  console.log('\n=== 4. 저장된 이력 ===');
  await p.evaluate(()=>history.pushState({screen:'home'},'','#home'));
  await p.goto('http://127.0.0.1:8777/app_test.html#home');
  await p.waitForSelector('#s-home:not([hidden])',{timeout:180000});
  await p.click('#histbtn'); await p.waitForSelector('#s-history:not([hidden])');
  const rows=await p.evaluate(()=>document.querySelectorAll('#hist-body .card').length);
  console.log('  기록', rows, '건 (성공한 측정 4회 → 4건이 맞음. 실패한 측정은 저장하지 않습니다)');
  console.log('\n오류:', errs.length?errs:'없음');
  await b.close();
})();
