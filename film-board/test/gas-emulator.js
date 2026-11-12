// 최소한의 Apps Script 흉내: 시트(2차원 배열), 속성, 잠금, 드라이브
const fs=require('fs'),crypto=require('crypto');
function makeGas(){
  const props={},files=[];let sheetCount=0;
  function Sheet(name){this.name=name;this.rows=[];this.fmt={}}
  Sheet.prototype={
    getLastRow(){return this.rows.length},
    getRange(r,c,nr,nc){const sh=this;
      if(typeof r==='string')return{setNumberFormat(f){sh.fmt[r]=f;return this}};
      nr=nr||1;nc=nc||1;
      return{
        setValues(v){v.forEach((row,i)=>{while(sh.rows.length<r-1+i+1)sh.rows.push([]);sh.rows[r-1+i]=row.slice()});return this},
        getValues(){const out=[];for(let i=0;i<nr;i++){const row=sh.rows[r-1+i]||[];out.push(Array.from({length:nc},(_,j)=>row[c-1+j]===undefined?'':row[c-1+j]))}return out},
        setFontWeight(){return this}};},
    appendRow(v){this.rows.push(v.slice())},
    deleteRows(start,n){this.rows.splice(start-1,n)},
    setFrozenRows(){},
    getParent(){return{getUrl:()=>'https://docs.google.com/spreadsheets/d/FAKE'}}
  };
  function SS(){this.sheets={};this.id='ss'+(++sheetCount)}
  SS.prototype={getSheetByName(n){return this.sheets[n]||null},insertSheet(n){return this.sheets[n]=new Sheet(n)},getId(){return this.id}};
  const book=new SS();
  const g={
    Logger:{log:m=>g.__log.push(m)},__log:[],
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]??null,setProperty:(k,v)=>{props[k]=v},deleteProperty:k=>{delete props[k]}})},
    SpreadsheetApp:{openById:id=>{if(id!==book.id)throw new Error('nf');return book},getActiveSpreadsheet:()=>null,create:()=>book},
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
    Utilities:{getUuid:()=>crypto.randomUUID(),base64Decode:b=>Buffer.from(b,'base64'),newBlob:(bytes,mime,name)=>({bytes,mime,name})},
    DriveApp:{Access:{ANYONE_WITH_LINK:1},Permission:{VIEW:1},
      createFolder:()=>({getId:()=>'fold',createFile:b=>{const id='f'+files.length;files.push(b);return{getId:()=>id,getName:()=>b.name,getMimeType:()=>b.mime,getSize:()=>b.bytes.length,setSharing(){}}}}),
      getFolderById:()=>{throw new Error('x')}},
    HtmlService:{},
    DocumentApp:{openById:id=>{const d=g.__docs[id];if(!d)throw new Error('문서를 찾을 수 없습니다');
      const tab=t=>({getTitle:()=>t.title,asDocumentTab:()=>({getBody:()=>({getText:()=>t.text})}),getChildTabs:()=>[]});
      return{getName:()=>d.title,getTabs:()=>d.tabs.map(tab),getBody:()=>({getText:()=>d.tabs[0].text})}}},
    __docs:{},
    __props:props,__book:book,__files:files
  };
  const src=fs.readFileSync(require('path').join(__dirname,'..','Code.gs'),'utf8');
  const names=['apiInfo','apiList','apiSave','apiSaveMany','apiReadDoc','apiDelete','apiAck','apiUpload','setup','resetAndSetup','setPasscode'];
  const fn=new Function(...Object.keys(g).filter(k=>!k.startsWith('__')),src+';return {'+names.join(',')+'}');
  Object.assign(g,fn(...Object.keys(g).filter(k=>!k.startsWith('__')).map(k=>g[k])));
  return g;
}
module.exports=makeGas;
