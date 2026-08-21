import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'PASS  ':'!!FAIL')+'  '+n+(x?'  '+x:''));};
await p.goto('file://'+process.cwd()+'/index.html');
await p.waitForTimeout(2200);
await p.evaluate(()=>{try{closeModal()}catch(e){};try{closeBig()}catch(e){}});

// 開交易紀錄
/* v68：手機版每一檔預設收起來，「交易紀錄」要先點「看詳細」才會出現。
   這是刻意的（一檔卡片從 700px 降到 235px），所以測試跟著走真實使用者的兩步。 */
await p.click('button[data-act="fold"]',{timeout:6000});
await p.waitForTimeout(400);
await p.click('button[data-act="txn"]',{timeout:6000});
await p.waitForTimeout(500);
T('交易紀錄頁打得開', await p.isVisible('#txAdd'));

// 第一筆買進
await p.fill('#txDate','2024-01-05'); await p.selectOption('#txKind','buy');
await p.fill('#txShares','2000'); await p.fill('#txPrice','600');
await p.click('#txAdd'); await p.waitForTimeout(600);
let r = await p.evaluate(()=>{const s=state.watchlist.find(x=>x.id===state.txnStock);const q=positionOf(s);
  return {shares:q.shares,avg:+q.avgCost.toFixed(4),n:s.txns.length, body:document.getElementById('bigBody').innerText.slice(0,200)};});
T('第一筆買進進帳', r.shares===2000 && r.n===1, JSON.stringify({s:r.shares,n:r.n}));

// 第二筆買進 → 加權平均
await p.fill('#txDate','2025-01-05'); await p.fill('#txShares','1000'); await p.fill('#txPrice','900');
await p.click('#txAdd'); await p.waitForTimeout(600);
r = await p.evaluate(()=>{const s=state.watchlist.find(x=>x.id===state.txnStock);const q=positionOf(s);
  return {shares:q.shares,avg:+q.avgCost.toFixed(2),cost:s.cost,sh:s.shares};});
T('加權平均成本正確', r.shares===3000 && Math.abs(r.avg-700.29)<1.5, JSON.stringify(r));
T('s.cost / s.shares 跟帳本一致', Math.abs(r.cost-r.avg)<0.01 && r.sh===r.shares, JSON.stringify(r));

// 賣一筆
await p.fill('#txDate','2025-06-05'); await p.selectOption('#txKind','sell');
await p.fill('#txShares','1000'); await p.fill('#txPrice','1000');
await p.click('#txAdd'); await p.waitForTimeout(600);
r = await p.evaluate(()=>{const s=state.watchlist.find(x=>x.id===state.txnStock);const q=positionOf(s);
  return {shares:q.shares, realized:Math.round(q.realized), body:document.getElementById('bigBody').innerText};});
T('賣出後股數減少', r.shares===2000, `shares=${r.shares}`);
T('畫面出現「已經賣掉的部分」', /已經賣掉的部分/.test(r.body), '');
T('已實現損益為正', r.realized>0, `realized=${r.realized}`);

// 存檔往返
r = await p.evaluate(()=>{
  const snap=JSON.parse(JSON.stringify(snapshot()));
  const before=positionOf(state.watchlist.find(x=>x.id===state.txnStock));
  state.watchlist.forEach(x=>{x.txns=null;x.cost=0;x.shares=1000;x.loaded=false;x.data={};});
  applySnapshot(snap,{trusted:true}); renderAll();
  const after=positionOf(state.watchlist.find(x=>x.id===state.txnStock));
  return {b:{s:before.shares,c:+before.cost.toFixed(2),r:+before.realized.toFixed(2)},
          a:{s:after.shares, c:+after.cost.toFixed(2), r:+after.realized.toFixed(2)}};});
T('存檔往返後帳本完全相同', JSON.stringify(r.b)===JSON.stringify(r.a), JSON.stringify(r));

// 惡意備份檔：不得讓帳本吃進髒資料
r = await p.evaluate(()=>{
  const bad={v:1,watch:[{id:'2330',name:'x',cost:100,shares:1000,
    txns:[{kind:'buy',date:'2024-01-05',shares:'1e999',price:600},
          {kind:'evil',date:'2024-01-05',shares:1,price:1},
          {kind:'buy',date:'not-a-date',shares:1000,price:-5},
          {kind:'buy',date:'2024-02-05',shares:'1,000',price:'600.5'}]}]};
  try{ applySnapshot(bad,{}); }catch(e){ return {err:e.message}; }
  const s=state.watchlist.find(x=>x.id==='2330'); const q=positionOf(s);
  return {n:(s.txns||[]).length, shares:q.shares, cost:q.cost, nan:[q.shares,q.cost,q.avgCost].some(isNaN)};});
T('惡意備份檔不產生 NaN', !r.nan, JSON.stringify(r));
T('惡意備份檔只留下合法的那一筆', r.n===1 && r.shares===1000, JSON.stringify(r));

console.log('\nPAGE ERRORS:', errs.length?errs:'none');
console.log(fail?`\n❌ ${fail} 項失敗`:'\n✅ 全部通過');
await p.screenshot({path:'./tests/txn_page.png'});
await b.close(); process.exit(fail?1:0);
