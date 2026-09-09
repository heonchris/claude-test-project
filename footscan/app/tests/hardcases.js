const { chromium } = require('/tmp/node_modules/playwright');
const fs = require('fs');
const SP='/tmp/claude-0/-home-user-claude-test-project/8474b402-a113-54c2-8af8-3986351a5477/scratchpad/jstest/';
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage();
  p.on('pageerror',e=>console.log('ERR',e.message.slice(0,160)));
  await p.goto('http://127.0.0.1:8777/runner_hard.html');
  await p.waitForFunction(()=>window.__ready===true,null,{timeout:30000});
  const gt=JSON.parse(fs.readFileSync(SP+'hard_gt.json','utf8'));
  let ok=0, n=0;
  console.log(`${'사진'.padEnd(13)} ${'결과'.padEnd(16)} 오차   시간`);
  for (const [name, quad] of Object.entries(gt)) {
    n++;
    const r=await p.evaluate(([n,q])=>window.__hard(n,q), [name, quad]);
    if (r.ok && r.err < 15) { ok++; console.log(`${name.padEnd(13)} ${'찾음'.padEnd(16)} ${String(r.err).padStart(5)}px ${r.ms}ms`); }
    else if (r.ok) console.log(`${name.padEnd(13)} ${'엉뚱한 것'.padEnd(15)} ${String(r.err).padStart(5)}px ${r.ms}ms`);
    else console.log(`${name.padEnd(13)} ${('못 찾음 ('+r.code+')').padEnd(16)}        ${r.ms}ms`);
  }
  console.log(`\n${ok}/${n} 성공`);
  await b.close();
})();
