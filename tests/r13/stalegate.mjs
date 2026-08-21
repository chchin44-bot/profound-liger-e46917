/* v85：新鮮度閘門的四個洞。舊版每一個都會把過期資料端上桌並蓋章「真實」。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await (await b.newContext({viewport:{width:390,height:900}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2400);
await p.evaluate(()=>{try{closeAllModals()}catch(e){}});

/* ① 完全沒有日期 → 不能當成新鮮 */
const r1 = await p.evaluate(()=>({
  noDate: staleDays(null), empty: staleDays(''), undef: staleDays(undefined),
  badFmt: staleDays('2026/08/18'), future: staleDays('2099-01-01'),
  usableNoDate: dataUsable({src:'live', price:100, asOf:null}),
  usableOld: dataUsable({src:'live', price:100, asOf:'2020-01-01'}),
  usableOk: dataUsable({src:'live', price:100, asOf: todayISO()}),
}));
console.log('  ', JSON.stringify(r1));
T('沒有日期 → 回 unknown，不是 null', r1.noDate==='unknown', String(r1.noDate));
T('空字串 → unknown', r1.empty==='unknown');
T('undefined → unknown', r1.undef==='unknown');
T('沒有日期的資料不可用（不會被當成今天的）', r1.usableNoDate===false);
T('太舊的資料不可用', r1.usableOld===false);
T('今天的資料可用（防呆沒有誤傷正常值）', r1.usableOk===true);
T('未來日期擋下', r1.future==='future');

/* ② 即時報價不得解鎖過期的財報判定 */
const r2 = await p.evaluate(()=>{
  const old = { src:'live', price:100, asOf:'2020-01-01', per:12 };
  const before = dataUsable(old);
  const afterRt = dataUsable({ ...old, src:'rt', rtBaseAsOf:'2020-01-01', price:330 });
  const freshRt = dataUsable({ src:'rt', price:330, rtBaseAsOf: todayISO(), asOf: todayISO() });
  return { before, afterRt, freshRt };
});
console.log('  ', JSON.stringify(r2));
T('200天前的資料本來就不可用', r2.before===false);
T('按了「更新即時報價」也不會讓它變可用（財報還是舊的）', r2.afterRt===false);
T('底下資料是新的時候，即時報價仍然可用', r2.freshRt===true);

/* ③ 區塊 C 與首屏用同一道閘門 */
const r3 = await p.evaluate(()=>{
  const s=state.watchlist.find(x=>x.id==='2330'); s.inWatch=true;
  s.txns=[{id:'b',kind:'buy',date:'2020-01-02',shares:1000,price:300}]; s.txnsMigrated=true;
  const ser=[],ph=[],t=new Date('2020-01-02');
  for(let k=300;k>=0;k--){ser.push({date:new Date(t-k*86400000).toISOString().slice(0,10),close:600});ph.push(12);}
  applyStockData(s,{price:600,eps:50,debt:.3,series:ser,asOf:'2020-01-02',per:12,perHist:ph,perAsOf:'2020-01-02'},'live');
  applyPosition(s);
  state.watchlist.forEach(x=>{ if(x.id!=='2330') x.inWatch=false; });
  renderAll();
  return { total:(document.getElementById('totalPnl')||{}).textContent.trim(),
           quality:(document.getElementById('blockCQuality')||{}).textContent.trim(),
           myPnl:(document.getElementById('myPnl')||{}).innerText.replace(/\s+/g,' ').slice(0,60) };
});
console.log('  ', JSON.stringify(r3));
T('過期資料不會被算進「全部合計」', r3.total==='—', r3.total);
T('不會蓋章說「全部基於真實資料」', !/全部基於 FinMind 真實資料。$/.test(r3.quality) || /30 天內/.test(r3.quality), r3.quality.slice(0,60));
T('有講出「資料太舊沒有算進去」', /太舊|沒有可用的資料/.test(r3.quality), r3.quality.slice(0,70));

T('全程沒有執行期錯誤', errs.length===0, errs.join(' | '));
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
