/* v87：輸入端與還原端的上限必須一致——「存得進去、讀不回來」是最糟的失敗模式。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await (await b.newContext({viewport:{width:390,height:900}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
await p.goto('http://localhost:8251/index.html'); await p.waitForTimeout(2400);
await p.evaluate(()=>{try{closeAllModals()}catch(e){}});

/* ① 每股價 500000（把總金額填成每股價）→ 要當場擋下 */
const r1 = await p.evaluate(()=>{
  const s=state.watchlist.find(x=>x.id==='2330'); s.inWatch=true; openTxnPage('2330');
  document.getElementById('txDate').value='2024-03-01';
  document.getElementById('txKind').value='buy';
  document.getElementById('txShares').value='1000';
  document.getElementById('txPrice').value='500000';
  txnAdd();
  const err=(document.getElementById('txnErr')||document.querySelector('#bigBody .text-rose-300,#bigBody .text-rose-400')||{}).textContent||'';
  return { err: err.replace(/\s+/g,' ').slice(0,90), n: (state.watchlist.find(x=>x.id==='2330').txns||[]).length };
});
console.log('  ', JSON.stringify(r1));
T('每股價 500000 當場被擋下，沒有存進去', r1.n===0, String(r1.n));
T('錯誤訊息點出可能的填法錯誤', /總共花了多少錢|一股/.test(r1.err), r1.err);

/* ② 正常價格仍然存得進去 */
const r2 = await p.evaluate(()=>{
  document.getElementById('txPrice').value='800'; txnAdd();
  return (state.watchlist.find(x=>x.id==='2330').txns||[]).length;
});
T('正常價格不受影響', r2===1, String(r2));
await p.evaluate(()=>{try{closeAllModals()}catch(e){}});

/* ③ 成本價 1e308 → 擋下，不會產生 Infinity */
const r3 = await p.evaluate(()=>{
  document.getElementById('addPanel').classList.remove('hidden');
  document.getElementById('newId').value='2317';
  document.getElementById('newCost').value='1e308';
  document.getElementById('newLots').value='1000';
  addStock();
  const s=state.watchlist.find(x=>x.id==='2317');
  return { msg:(document.getElementById('addMsg')||{}).textContent.slice(0,70),
           inWatch: !!(s&&s.inWatch), cost: s?s.cost:null };
});
console.log('  ', JSON.stringify(r3));
T('成本價 1e308 被擋下', r3.inWatch===false, JSON.stringify(r3));
T('訊息說明這一格要填每股價', /一股|總金額/.test(r3.msg), r3.msg);
T('沒有任何 Infinity 進到狀態裡',
  await p.evaluate(()=>state.watchlist.every(x=>isFinite(x.cost) && isFinite(x.shares))));

/* ④ 舊存檔裡真的有超限紀錄時，載回來要「講出來」而不是靜默丟掉 */
const r4 = await p.evaluate(async ()=>{
  const snap = { v:1, savedAt:new Date().toISOString(), autoSave:true,
    watch:[{ id:'2330', name:'台積電', ind:'半導體業', type:'top100', cost:0, shares:0,
             txns:[{id:'x',kind:'buy',date:'2024-03-01',shares:1000,price:500000},
                   {id:'y',kind:'buy',date:'2024-03-02',shares:1000,price:800}] }] };
  localStorage.setItem(STORE_KEY, JSON.stringify(snap));
  return 'set';
});
await p.reload(); await p.waitForTimeout(2600);
const r5 = await p.evaluate(()=>({
  dropped: state.lastTxnDropped,
  modalOpen: !document.getElementById('modal').classList.contains('hidden'),
  title: (document.getElementById('modalTitle')||{}).textContent||'',
  body: (document.getElementById('modalBody')||{}).textContent.replace(/\s+/g,' ').slice(0,120),
  kept: (state.watchlist.find(x=>x.id==='2330').txns||[]).length,
}));
console.log('  ', JSON.stringify(r5).slice(0,260));
T('有數出被丟掉的筆數', r5.dropped===1, String(r5.dropped));
T('用擋路的彈窗講出來（不是會自己消失的提示）', r5.modalOpen===true);
T('標題講出有幾筆讀不回來', /1 筆交易紀錄讀不回來/.test(r5.title), r5.title);
T('內容說明最可能的原因', /總共花了多少錢/.test(r5.body), r5.body.slice(0,80));
T('沒問題的那一筆仍然載回來了', r5.kept===1, String(r5.kept));

T('全程沒有執行期錯誤', errs.length===0, errs.join(' | '));
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
