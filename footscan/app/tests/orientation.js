const { chromium } = require('/tmp/node_modules/playwright');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage(); p.on('pageerror',e=>console.log('ERR',e.message.slice(0,140)));
  await p.goto('http://127.0.0.1:8777/runner_ori.html');
  await p.waitForFunction(()=>window.__ready===true,{timeout:30000});
  console.log('EXIF  크기        길이     발볼    발가락      엄지기울기 아치   신뢰도');
  const rows=[];
  for(let o=1;o<=8;o++){
    const r=await p.evaluate(o=>window.__ori(o), o);
    rows.push(r);
    if(r.err) console.log(`${r.o}  읽은EXIF=${r.exif}  ${r.w}x${r.h}   실패: ${r.err}`);
    else console.log(`${r.o}  읽은EXIF=${r.exif}  ${String(r.w+'x'+r.h).padEnd(11)} ${String(r.len).padEnd(8)} ${String(r.ball).padEnd(7)} ${r.toe.padEnd(10)} ${String(r.hv).padEnd(9)} ${String(r.arch).padEnd(6)} ${r.conf}`);
  }
  const ok=rows.filter(r=>!r.err);
  if(ok.length){
    const L=ok.map(r=>r.len), B=ok.map(r=>r.ball);
    console.log(`\n성공 ${ok.length}/8 · 길이 ${Math.min(...L)}~${Math.max(...L)}mm (퍼짐 ${(Math.max(...L)-Math.min(...L)).toFixed(1)}mm) · 발볼 퍼짐 ${(Math.max(...B)-Math.min(...B)).toFixed(1)}mm`);
  }
  await b.close();
})();
