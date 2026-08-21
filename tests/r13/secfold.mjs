/* v78：區塊的開合由使用者決定，而且要記住。
   預設值可以由我決定，最終狀態必須由使用者決定。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const ctx = await b.newContext({viewport:{width:390,height:844}});
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
const st = () => p.evaluate(()=>Object.fromEntries(
  [...document.querySelectorAll('details.secfold[data-sec]')].map(d=>[d.getAttribute('data-sec'), d.open])));

await p.goto('http://localhost:8251/index.html'); await p.waitForTimeout(2500);
await p.evaluate(()=>{try{closeModal()}catch(e){}});
let a = await st();
T('預設：三維度目標價是展開的', a['三維度目標價']===true, JSON.stringify(a));
/* v79：百大企業改回完整資料庫版之後，預設也跟著展開（作者指定的那個版面）。
   仍然收起來的只有「問自己三個問題」——那是一輩子做一兩次的東西。 */
T('預設：百大企業資料庫是展開的', a['台灣百大企業']===true, JSON.stringify(a));
T('預設：問自己三個問題是收起來的', a['問自己三個問題']===false);
/* v80：回測整個移除，畫面上不該再有任何一處提到它 */
T('畫面上沒有回測功能了', await p.evaluate(()=>!document.getElementById('btRun') && !document.getElementById('btResult')));

/* 使用者自己改：目標價收起來、百大打開 */
await p.evaluate(()=>{
  [...document.querySelectorAll('details.secfold[data-sec]')].forEach(d=>{
    const k=d.getAttribute('data-sec');
    if(k==='三維度目標價') d.open=false;
    if(k==='台灣百大企業') d.open=true;
  });
});
await p.waitForTimeout(500);
const saved = await p.evaluate(()=>JSON.parse(localStorage.getItem(STORE_KEY)||'{}').secOpen);
T('改動有寫進本機儲存', saved && saved['三維度目標價']===false && saved['台灣百大企業']===true, JSON.stringify(saved));

/* 重新開啟：要維持使用者上次離開的樣子 */
const p2 = await ctx.newPage();
await p2.goto('http://localhost:8251/index.html'); await p2.waitForTimeout(2600);
const b2 = await p2.evaluate(()=>Object.fromEntries(
  [...document.querySelectorAll('details.secfold[data-sec]')].map(d=>[d.getAttribute('data-sec'), d.open])));
T('重開之後維持使用者的設定（目標價仍收起）', b2['三維度目標價']===false, JSON.stringify(b2));
T('重開之後維持使用者的設定（百大仍展開）', b2['台灣百大企業']===true);
T('沒改過的那個仍是預設值', b2['問自己三個問題']===false);

T('全程沒有執行期錯誤', errs.length===0, errs.join(' | '));
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
