const { chromium } = require('/tmp/node_modules/playwright');
const fs=require('fs');
const SP='/tmp/claude-0/-home-user-claude-test-project/8474b402-a113-54c2-8af8-3986351a5477/scratchpad/jstest/';
const names=['right','left','arch_low','arch_high','narrow','wide','exif_rotated'];
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage();
  p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,220)));
  await p.goto('http://127.0.0.1:8777/runner2.html');
  await p.waitForFunction(()=>window.__ready===true,null,{timeout:30000});
  console.log('샘플         길이 JS/정답        발볼 JS/정답      발가락  아치 JS/정답   등급   시간');
  const rows=[];
  for(const n of names){
    const gt=JSON.parse(fs.readFileSync(SP+n+'_gt.json','utf8'));
    let r; try{ r=await p.evaluate(([n])=>window.__run(n,true),[n]); }
    catch(e){ console.log(`${n.padEnd(13)} 실패: ${String(e.message||e).slice(0,150)}`); continue; }
    const t=r.result.top,s=r.result.lateral;
    const gl=gt.top.foot_length_mm,gb=gt.top.ball_width_mm,ga=gt.side.arch_clearance_mm;
    const dl=t.foot_length_mm-gl,db=t.ball_width_mm-gb,da=s?s.arch_clearance_mm-ga:NaN;
    rows.push({dl,db,da,toeOk:t.toe_type===gt.top.toe_type,ms:r.ms});
    console.log(`${n.padEnd(13)} ${t.foot_length_mm.toFixed(1)}/${gl.toFixed(1)}(${dl>=0?'+':''}${dl.toFixed(1)})  ${t.ball_width_mm.toFixed(1)}/${gb.toFixed(1)}(${db>=0?'+':''}${db.toFixed(1)})  ${t.toe_type===gt.top.toe_type?'OK':'XX'} ${(t.toe_type||'').padEnd(9)} ${s?s.arch_clearance_mm.toFixed(1)+'/'+ga.toFixed(1):'—'} ${s?s.arch_grade.padEnd(6):'—'} ${(r.ms/1000).toFixed(1)}s`);
  }
  if(rows.length){
    console.log('\n요약');
    console.log('  발 길이 최대 오차:', Math.max(...rows.map(r=>Math.abs(r.dl))).toFixed(2),'mm (허용 3)');
    console.log('  발볼 최대 오차:', Math.max(...rows.map(r=>Math.abs(r.db))).toFixed(2),'mm (허용 3)');
    const das=rows.filter(r=>!isNaN(r.da)).map(r=>Math.abs(r.da));
    console.log('  아치 최대 오차:', das.length?Math.max(...das).toFixed(2):'—','mm (허용 4)');
    console.log('  발가락 형태:', rows.filter(r=>r.toeOk).length+'/'+rows.length);
    console.log('  평균 시간:', (rows.reduce((s,r)=>s+r.ms,0)/rows.length/1000).toFixed(1),'초');
  }
  await b.close();
})();
