/* 官方本益比的「倍率」問題
   ────────────────────────────────────────────────────────────
   官方 PER 是「當日收盤價 ÷ 官方認定的近四季 EPS」，也就是說
       官方 EPS ＝ 那一天的收盤價 ÷ 官方 PER
   目標價是 epsBase × 倍率。如果 epsBase 拿「現在的價格」去除以「昨天的 PER」，
   那 epsBase 會跟著盤中報價一起動，於是便宜價／合理價／昂貴價
   會隨著今天漲跌等比例平移——股價漲 3%，合理價也漲 3%，等於沒有基準。
   這支測的就是：估值的基準不得隨盤中價格移動。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'PASS  ':'!!FAIL')+'  '+n+(x?'  '+x:''));};
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2400);
await p.evaluate(()=>{try{closeModal()}catch(e){}});

/* 造一檔：收盤 1000、官方 PER 20 → 官方 EPS 恰好 50 */
const setup = () => p.evaluate(()=>{
  const s=state.watchlist.find(x=>x.id==='2330'); s.inWatch=true;
  s.txns=[{id:'a',kind:'buy',date:'2024-01-05',shares:2000,price:800}]; s.txnsMigrated=true;
  const ser=[],ph=[]; const t=new Date('2026-08-14');
  for(let i=1300;i>=0;i--){ const d=new Date(t-i*86400000), dt=d.toISOString().slice(0,10);
    const px=+(1000*(1+Math.sin(i/53)*0.2)).toFixed(2);
    ser.push({date:dt,close:px}); ph.push(+(px/50).toFixed(2)); }
  ser[ser.length-1].close=1000; ph[ph.length-1]=20;
  applyStockData(s,{price:1000,eps:44,debt:.3,holder:null,holderPrev:null,series:ser,
    asOf:'2026-08-14',per:20,perHist:ph,perAsOf:'2026-08-14'},'live');
  applyPosition(s); state.selected='2330'; renderAll();
  const d=s.data, T=d.targets;
  return {eps:d.eps, per:d.per, price:d.price, epsBase:T.epsBase, cheap:T.cheap, fair:T.fair, rich:T.rich};
});

const before = await setup();
T('官方 EPS 由「當天收盤 ÷ 當天 PER」推得＝50（不是自算的 44）',
  Math.abs(before.epsBase-50)<0.01, `epsBase=${before.epsBase}`);

/* 盤中報價進來：價格 1000 → 1100（+10%），官方 PER 仍是昨天的 20 */
const after = await p.evaluate(()=>{
  const s=state.watchlist.find(x=>x.id==='2330');
  s.data.price=1100; s.data.src='rt'; s.data.rtStale=true; renderAll();
  const T=s.data.targets;
  return {epsBase:T.epsBase, cheap:T.cheap, fair:T.fair, rich:T.rich};
});
T('盤中報價 +10% 之後，估值基準 EPS 不變',
  Math.abs(after.epsBase-before.epsBase)<0.01, `${before.epsBase} → ${after.epsBase}`);
T('便宜價不隨盤中報價平移', Math.abs(after.cheap-before.cheap)<0.05, `${before.cheap} → ${after.cheap}`);
T('合理價不隨盤中報價平移', Math.abs(after.fair -before.fair )<0.05, `${before.fair} → ${after.fair}`);
T('昂貴價不隨盤中報價平移', Math.abs(after.rich -before.rich )<0.05, `${before.rich} → ${after.rich}`);

/* 官方 PER 的日期比價格舊（很常見：PER 盤後才更新）—— 基準要用 PER 那天的收盤 */
const lag = await p.evaluate(()=>{
  const s=state.watchlist.find(x=>x.id==='2330');
  const ser=s.data.series;
  const prevDate=ser[ser.length-2].date, prevClose=ser[ser.length-2].close;
  s.data.perAsOf=prevDate;           // PER 停在前一天
  s.data.price=1100;                 // 今天的價格
  renderAll();
  return {want:+(prevClose/20).toFixed(4), got:+s.data.targets.epsBase.toFixed(4), prevDate, prevClose};
});
T('PER 落後一天時，基準用 PER 那天的收盤', Math.abs(lag.want-lag.got)<0.01,
  `期望 ${lag.want}（${lag.prevDate} 收 ${lag.prevClose}），實得 ${lag.got}`);

T('全程沒有執行期錯誤', errs.length===0, errs.join(' | '));
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
