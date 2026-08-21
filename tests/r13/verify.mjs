import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'PASS  ':'!!FAIL')+'  '+n+(x?'  '+x:''));};
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2200);
await p.evaluate(()=>{try{closeModal()}catch(e){};try{closeBig()}catch(e){}});
/* v68：手機版收合後，「交易紀錄」要先點「看詳細」才看得到 */
await p.click('button[data-act="fold"]',{timeout:6000}); await p.waitForTimeout(400);
await p.click('button[data-act="txn"]',{timeout:6000}); await p.waitForTimeout(500);

// S1：五種類型都在
const opts = await p.$$eval('#txKind option', els=>els.map(e=>e.value));
T('S1 五種交易類型都有', JSON.stringify(opts)===JSON.stringify(['buy','sell','div','stkdiv','reduce']), JSON.stringify(opts));

// 先買一筆
await p.fill('#txDate','2024-01-05'); await p.fill('#txShares','1000'); await p.fill('#txPrice','600');
await p.click('#txAdd'); await p.waitForTimeout(500);

// C-1：刪得掉
let n = await p.evaluate(()=>positionOf(state.watchlist.find(x=>x.id===state.txnStock)).txns.length);
/* v85：刪除改成要先確認（那顆按鈕會清掉成本基礎，全站其他破壞性動作本來就都有確認）。
   測試要跟真的使用者走同一步：按刪掉 → 在彈窗按「確認刪掉」。 */
await p.click('button[data-txn="del"]'); await p.waitForTimeout(400);
await p.click('[data-conf="txndel"]'); await p.waitForTimeout(500);
let after = await p.evaluate(()=>{const s=state.watchlist.find(x=>x.id===state.txnStock);const q=positionOf(s);return {n:q.txns.length,shares:q.shares,cost:s.cost};});
T('C-1 刪得掉自己的紀錄', after.n===0 && after.shares===0 && after.cost===0, JSON.stringify({before:n,after}));

// 重新買，測配股
await p.fill('#txDate','2024-01-05'); await p.fill('#txShares','1000'); await p.fill('#txPrice','600');
await p.click('#txAdd'); await p.waitForTimeout(400);
await p.selectOption('#txKind','stkdiv'); await p.waitForTimeout(300);
const pxHidden = await p.evaluate(()=>getComputedStyle(document.getElementById('txPrice')).display);
T('S1 配股時不問價格', pxHidden==='none', 'display='+pxHidden);
await p.fill('#txDate','2024-07-15'); await p.fill('#txShares','1100');
await p.click('#txAdd'); await p.waitForTimeout(500);
let r = await p.evaluate(()=>{const s=state.watchlist.find(x=>x.id===state.txnStock);const q=positionOf(s);return {shares:q.shares,cost:+q.cost.toFixed(0),avg:+q.avgCost.toFixed(2)};});
T('S1 配股：股數變 1100、成本總額不變', r.shares===1100 && Math.abs(r.cost-600855)<5, JSON.stringify(r));

// 配息
await p.selectOption('#txKind','div'); await p.waitForTimeout(300);
await p.fill('#txDate','2024-08-15'); await p.fill('#txPrice','4.5');
await p.click('#txAdd'); await p.waitForTimeout(500);
r = await p.evaluate(()=>{const s=state.watchlist.find(x=>x.id===state.txnStock);return {div:+positionOf(s).divCash.toFixed(0)};});
T('S1 配息：1100×4.5 = 4950', r.div===4950, JSON.stringify(r));

// 減資
await p.selectOption('#txKind','reduce'); await p.waitForTimeout(300);
await p.fill('#txDate','2024-09-01'); await p.fill('#txShares','440'); await p.fill('#txPrice','2');
await p.click('#txAdd'); await p.waitForTimeout(500);
r = await p.evaluate(()=>{const s=state.watchlist.find(x=>x.id===state.txnStock);const q=positionOf(s);return {shares:q.shares,cost:+q.cost.toFixed(0)};});
T('S1 減資：股數 1100→440、成本扣掉退還股款 2200', r.shares===440 && Math.abs(r.cost-598655)<5, JSON.stringify(r));

// 行內錯誤（不是 toast）
await p.selectOption('#txKind','buy'); await p.waitForTimeout(300);
await p.fill('#txShares',''); await p.fill('#txPrice','');
await p.click('#txAdd'); await p.waitForTimeout(400);
const msg = await p.evaluate(()=>{const el=document.getElementById('txMsg');
  return {text:el.textContent.trim(), vis:getComputedStyle(el).visibility, h:el.getBoundingClientRect().height};});
T('B/E 錯誤訊息看得見（不是被吃掉的 toast）', msg.text.length>0 && msg.vis==='visible' && msg.h>0, JSON.stringify(msg));

// 日期不詳
await p.check('#txNoDate'); await p.waitForTimeout(300);
const dis = await p.evaluate(()=>document.getElementById('txDate').disabled);
T('E 勾了「不記得」日期欄會停用', dis===true, 'disabled='+dis);
await p.fill('#txShares','500'); await p.fill('#txPrice','700');
await p.click('#txAdd'); await p.waitForTimeout(500);
r = await p.evaluate(()=>{const s=state.watchlist.find(x=>x.id===state.txnStock);
  const t=(s.txns||[]).slice(-1)[0]; return {unknown:t.dateUnknown, date:t.date};});
T('E 日期不詳不填假日期', r.unknown===true && !r.date, JSON.stringify(r));

// C-2：金額與百分比同源
r = await p.evaluate(()=>{
  const s=state.watchlist.find(x=>x.id===state.txnStock);
  applyStockData(s,{price:300,eps:null,debt:null,holder:null,holderPrev:null,series:[]},'self');
  s.data.asOf=todayISO(); applyPosition(s); renderAll();
  const q=positionOf(s);
  const truth = +((300-q.avgCost)/q.avgCost*100).toFixed(2);
  return {pnl:s.data.pnl, truth};});
T('C-2 百分比與帳本同源', Math.abs(r.pnl-r.truth)<0.02, JSON.stringify(r));

// C-3：清空持倉要清帳本
r = await p.evaluate(()=>{ doClearHoldings();
  const s=state.watchlist.find(x=>x.id==='2330');
  return {n:(s.txns||[]).length, shares:positionOf(s).shares};});
T('C-3 清空持倉會清掉帳本', r.n===0 && r.shares===0, JSON.stringify(r));

console.log('\nPAGE ERRORS:', errs.length?errs:'none');
console.log(fail?`\n❌ ${fail} 項失敗`:'\n✅ 全部通過');
await b.close(); process.exit(fail?1:0);
