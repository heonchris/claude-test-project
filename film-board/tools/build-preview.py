#!/usr/bin/env python3
"""index.html + Code.gs의 초기 데이터로 '미리보기' 페이지를 만든다.
구글 서버 대신 브라우저 안의 가짜 서버로 동작해서 저장·공유는 안 된다.
사용법: python3 film-board/tools/build-preview.py <출력 파일>"""
import sys, re, json, subprocess, os
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
out_path = sys.argv[1]
h = open(os.path.join(root, 'index.html'), encoding='utf8').read()
seed = json.loads(subprocess.check_output(['node', '-e', '''
const fs=require("fs");const items=new Function(fs.readFileSync(process.argv[1],"utf8")+";return seedItems_();")();
let n=0;console.log(JSON.stringify(items.map(x=>({id:"s"+(++n),kind:x[0],data:x[1],updatedAt:Date.now()-86400000-n,updatedBy:"세팅",deleted:false}))));''',
    os.path.join(root, 'Code.gs')]))
head = h[h.index('<title>'):h.index('</head>')].replace('<title>촬영 보드</title>', '<title>정상회 촬영 보드</title>')
body = h[h.index('<body>') + 6:h.index('</body>')]
m = re.search(r'@media \(prefers-color-scheme: dark\)\{:root\{(.*?)\}\}', head, re.S)
head = head.replace(m.group(0), '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){' + m.group(1) + '}}\n:root[data-theme="dark"]{' + m.group(1) + '}')
mock = '''<script>
/* 미리보기 전용: 구글 서버 대신 이 브라우저 안에서만 동작하는 가짜 서버 */
(function(){
  var rows={},n=0;(%s).forEach(function(r){rows[r.id]=r});
  function c(x){return JSON.parse(JSON.stringify(x))}
  function saveOne(item,by){var id=item.id||("p"+(++n));var o=rows[id];var d=o?o.data:{};for(var k in item.data)d[k]=item.data[k];rows[id]={id:id,kind:item.kind||o.kind,data:d,updatedAt:Date.now(),updatedBy:by,deleted:false};return c(rows[id])}
  var api={
    apiList:function(code,since){return{now:Date.now(),items:Object.keys(rows).map(function(k){return rows[k]}).filter(function(r){return r.updatedAt>since}).map(c)}},
    apiSave:function(code,item,by){return saveOne(item,by)},
    apiSaveMany:function(code,items,by){return items.map(function(it){return saveOne(it,by)})},
    apiReadDoc:function(){throw new Error("DOC_PREVIEW")},
    apiDelete:function(code,id,by){rows[id].deleted=true;rows[id].updatedAt=Date.now();rows[id].updatedBy=by;return c(rows[id])},
    apiAck:function(code,id,name,on){var a=rows[id].data.acks=rows[id].data.acks||{};if(on)a[name]=Date.now();else delete a[name];rows[id].updatedAt=Date.now();return c(rows[id])},
    apiUpload:function(code,name,mime,b64){var u="data:"+mime+";base64,"+b64;return{id:"u"+(++n),name:name,mime:mime,size:b64.length,url:u,thumb:u}}
  };
  function run(s,f){var r={withSuccessHandler:function(fn){return run(fn,f)},withFailureHandler:function(fn){return run(s,fn)}};
    Object.keys(api).forEach(function(k){r[k]=function(){var a=arguments;setTimeout(function(){try{s&&s(api[k].apply(null,a))}catch(e){f&&f(e)}},120)}});return r}
  window.google={script:{run:run(null,null)}};
})();
</script>
''' % json.dumps(seed, ensure_ascii=False)
banner = '<div style="background:var(--hold-soft);color:var(--ink);font-size:13px;padding-block:8px;text-align:center" class="wrap">미리보기예요. 눌러 보고 입력해 봐도 되지만 저장되거나 다른 사람에게 보이지 않아요. 구글 문서 불러오기는 실제 보드에서만 돼요.</div>\n'
body = body.replace('<header class="top">', banner + '<header class="top">', 1)
marker = '<script>\n/* ================= 설정'
assert marker in body
body = body.replace(marker, mock + marker, 1)
open(out_path, 'w', encoding='utf8').write(head + '\n' + body)
print('wrote', out_path)
