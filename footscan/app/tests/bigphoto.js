const { chromium, devices } = require('/tmp/node_modules/playwright');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const c=await b.newContext({...devices['iPhone 13'],locale:'ko-KR'});
  const p=await c.newPage(); p.on('pageerror',e=>console.log('ERR',e.message.slice(0,200)));
  await p.goto('http://127.0.0.1:8777/runner_ori.html');
  await p.waitForFunction(()=>window.__ready===true,{timeout:30000});
  const r=await p.evaluate(async()=>{
    async function f(n){const r=await fetch(n);const b=await r.blob();return new File([b],n,{type:'image/jpeg'});}
    const top=await f('iphone12mp_top.jpg'), side=await f('iphone12mp_side.jpg');
    const t0=performance.now();
    const m=await loadImageMat(top);
    const tLoad=Math.round(performance.now()-t0);
    const t1=performance.now();
    try{
      const res=await scan({rightTop:top, rightSide:side});
      return {원본크기:'4032x3024', 읽은EXIF:m.exifOrientation, 처리크기:m.w+'x'+m.h,
              사진읽기ms:tLoad, 전체ms:Math.round(performance.now()-t1),
              길이:+res.right.top.foot_length_mm.toFixed(1), 발볼:+res.right.top.ball_width_mm.toFixed(1),
              아치:res.right.lateral?+res.right.lateral.arch_clearance_mm.toFixed(1):null,
              신뢰도:res.right.confidence};
    }catch(e){return {오류:e.code||String(e.message||e), 읽은EXIF:m.exifOrientation, 처리크기:m.w+'x'+m.h};}
  });
  console.log(JSON.stringify(r,null,1));
  await b.close();
})();
