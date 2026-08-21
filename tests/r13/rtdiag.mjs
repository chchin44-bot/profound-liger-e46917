/* 即時報價的診斷彈窗，必須印「量到的東西」，不是我事先寫好的話。
   舊版寫死一句「四種都回 Failed to fetch」——那是猜的。
   這支就是守住這件事：換一種失敗方式，畫面上的字必須跟著換。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport:{width:390,height:844} });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2200);
await p.evaluate(()=>{try{closeModal()}catch(e){}});

const show = trace => p.evaluate(tr=>{
  const e = { kind:'rtunknown', message:'測試', detail:'測試', trace:tr };
  showSponsorModal(e);
  return document.getElementById('modalBody').innerText;
}, trace);
const close = () => p.evaluate(()=>{ try{ closeAllModals(); }catch(e){ try{ closeBig(); }catch(_){}} });

/* 一、全部 Failed to fetch —— 拿不到狀態碼 */
let txt = await show([
  {how:'專屬端點 + Authorization 標頭', what:'TypeError: Failed to fetch'},
  {how:'專屬端點 + ?token=',            what:'TypeError: Failed to fetch'},
]);
T('印出每一種呼叫形式', /專屬端點 \+ Authorization 標頭/.test(txt) && /專屬端點 \+ \?token=/.test(txt));
T('印出實際的底層錯誤', /Failed to fetch/.test(txt));
T('結論說「連狀態碼都拿不到」', /連狀態碼都拿不到/.test(txt), txt.slice(0,60).replace(/\n/g,' '));
T('沒有斷言是權限問題', !/需要 sponsor 會員|你是免費帳號/.test(txt));
await close();

/* 二、對方有回應，而且回應裡寫了原因 */
txt = await show([
  {how:'專屬端點 + ?token=', what:'HTTP 403 — {"msg":"Sponsor member only","status":403}'},
]);
T('有可讀內容時，把內容原樣印出來', /Sponsor member only/.test(txt), txt.slice(0,80).replace(/\n/g,' '));
T('結論改成「這次有問到原因了」', /有問到原因/.test(txt));
T('不再說「連狀態碼都拿不到」', !/連狀態碼都拿不到/.test(txt));
await close();

/* 三、有狀態碼但沒有內容 */
txt = await show([
  {how:'/data?dataset= + ?token=', what:'HTTP 422（回應沒有內容）'},
]);
T('印出狀態碼 422', /422/.test(txt));
T('結論是「有回應但沒說明原因」', /有回應，但沒有說明原因/.test(txt), txt.slice(0,80).replace(/\n/g,' '));
T('明說不是防火牆／網路問題', /不是防火牆/.test(txt));
await close();

/* 四、完全沒有紀錄時，不得假裝有 */
txt = await show([]);
T('沒有紀錄就說沒有紀錄', /沒有留下逐項紀錄/.test(txt));
await close();

T('全程沒有執行期錯誤', errs.length===0, errs.join(' | '));
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
