/* v83：提示訊息必須關得掉。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await (await b.newContext({viewport:{width:390,height:844}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2400);
await p.evaluate(()=>{try{closeAllModals()}catch(e){}});

const fire = (n, fs='big') => p.evaluate(([n,fs])=>{
  state.fontScale=fs; applyFontScale();
  document.querySelectorAll('.toast-sa').forEach(e=>e.remove());
  toastQueue.length=0;
  for(let i=1;i<=n;i++) toast('測試訊息第 '+i+' 則','info');
}, [n,fs]);
const shown = ()=>p.evaluate(()=>document.querySelectorAll('.toast-sa').length);
const queued = ()=>p.evaluate(()=>toastQueue.length);

await fire(6); await p.waitForTimeout(300);
T('一次只顯示一則（舊行為不變）', await shown()===1);
T('其餘進排隊', await queued()===5, String(await queued()));

const info = await p.evaluate(()=>{
  const el=document.querySelector('.toast-sa'), x=el.querySelector('.toast-x');
  const r=x.getBoundingClientRect();
  return { hasX:!!x, w:Math.round(r.width), h:Math.round(r.height),
           label:x.getAttribute('aria-label'), text:el.querySelector('.toast-msg').textContent,
           clickable: document.elementFromPoint(r.left+r.width/2, r.top+r.height/2)===x };
});
T('提示上有 ✕ 關閉鈕', info.hasX);
T('✕ 是拇指尺寸（≥44px）', info.w>=44 && info.h>=44, `${info.w}x${info.h}`);
T('✕ 真的點得到（沒有被蓋住）', info.clickable===true);
T('訊息會說後面還有幾則', /後面還有 5 則/.test(info.text), info.text);
T('✕ 的無障礙標籤說清楚會關掉幾則', /關掉全部 6 則/.test(info.label||''), info.label);

await p.click('.toast-sa .toast-x'); await p.waitForTimeout(400);
T('按 ✕ 之後畫面上沒有提示了', await shown()===0);
T('按 ✕ 之後排隊的也一起清掉（不會又冒一則）', await queued()===0, String(await queued()));
await p.waitForTimeout(1200);
T('等一下也不會自己再冒出來', await shown()===0 && await queued()===0);

/* 點訊息本身也要能關 */
await fire(3); await p.waitForTimeout(300);
await p.click('.toast-sa .toast-msg'); await p.waitForTimeout(400);
T('點訊息本身也關得掉', await shown()===0 && await queued()===0);

/* 連點兩下不可以把「下一則」也誤殺成畫面亂跳 */
await fire(3); await p.waitForTimeout(300);
await p.evaluate(()=>{ const e=document.querySelector('.toast-sa'); e.click(); e.click(); e.click(); });
await p.waitForTimeout(400);
T('連點三下不會出錯', await shown()===0 && errs.length===0);

/* 沒有排隊時，標籤要講「這則」不是「全部」 */
await fire(1); await p.waitForTimeout(300);
T('只有一則時標籤是「關掉這則提示」',
  await p.evaluate(()=>document.querySelector('.toast-x').getAttribute('aria-label'))==='關掉這則提示');
T('只有一則時訊息不會多寫「後面還有」',
  !/後面還有/.test(await p.evaluate(()=>document.querySelector('.toast-msg').textContent)));

/* 自動消失的舊行為要留著 */
await p.evaluate(()=>{document.querySelectorAll('.toast-sa').forEach(e=>e.remove());toastQueue.length=0;
  state.fontScale='sm'; applyFontScale(); toast('會自己消失','info');});
await p.waitForTimeout(300); T('小字級時提示有出現', await shown()===1);
await p.waitForTimeout(5200); T('沒人按的話仍會自己消失（4.2 秒）', await shown()===0);

/* 彈窗開著時提示仍不顯示（舊防線不得被破壞） */
await p.evaluate(()=>{ showModal({icon:'⚠️',title:'測試',body:'x',actions:'<button onclick="closeModal()">取消</button>'});
  toast('彈窗開著時不該出現','info'); });
await p.waitForTimeout(300);
T('彈窗開著時提示仍然排隊、不顯示', await queued()>=1);
await p.evaluate(()=>closeModal()); await p.waitForTimeout(400);
T('彈窗關掉後排隊的提示才放出來', await shown()===1);

const ov = await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
T('沒有橫向溢出', ov<=1, 'ov='+ov);
T('全程沒有執行期錯誤', errs.length===0, errs.join(' | '));
await p.screenshot({path:'./tests/r13/toastclose.png'});
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
