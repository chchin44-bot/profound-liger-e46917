/* 自由現金流必須通過 存檔→重開 的往返。
   perRows 當年就是漏在這一關：畫面上看得到，重開瀏覽器就沒了。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await (await b.newContext({viewport:{width:390,height:844}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2400);
await p.evaluate(()=>{try{closeModal()}catch(e){}});

const r = await p.evaluate(()=>{
  const s = state.watchlist.find(x=>x.id==='2330'); s.inWatch=true; s.ind='半導體業';
  s.txns=[{id:'a',kind:'buy',date:'2024-01-05',shares:1000,price:1900}]; s.txnsMigrated=true;
  const ser=[]; const t=new Date('2026-08-14');
  for(let i=400;i>=0;i--){ const d=new Date(t-i*86400000);
    ser.push({date:d.toISOString().slice(0,10), close:2395}); }
  applyStockData(s,{price:2395,eps:86.28,debt:.31,holder:null,holderPrev:null,series:ser,
    asOf:'2026-08-14',per:27.76,pbr:9.66,perHist:new Array(400).fill(27.76),perAsOf:'2026-08-14',
    ocfTTM:2634679110000, capexTTM:1491122744000, fcfTTM:1143556366000,
    fcfAsOf:'2026-06-30', fcfHow:'2026-06-30 累計 ＋ 2025 全年 − 2025-06-30 累計',
    capStock:259323701000, equity:6474470981000},'live');
  applyPosition(s);
  const before = fcfYield(s.data);
  const snap = JSON.parse(JSON.stringify(snapshot()));
  applySnapshot(snap);
  const s2 = state.watchlist.find(x=>x.id==='2330');
  const after = fcfYield(s2.data);
  return { before, after, note: s2.data.fcfHow, asOf: s2.data.fcfAsOf };
});
T('往返後每股自由現金流不變', r.after && Math.abs(r.before.perShare-r.after.perShare)<0.01, `${r.before.perShare} → ${r.after&&r.after.perShare}`);
T('往返後殖利率不變', r.after && Math.abs(r.before.yield-r.after.yield)<0.01, `${r.before.yield}% → ${r.after&&r.after.yield}%`);
T('往返後期別日期還在', r.asOf==='2026-06-30', String(r.asOf));
T('往返後算法說明還在', /累計/.test(String(r.note)), String(r.note).slice(0,40));

/* 惡意備份檔不得產生 NaN 或 Infinity */
const evil = await p.evaluate(()=>{
  const s = state.watchlist.find(x=>x.id==='2330');
  const snap = JSON.parse(JSON.stringify(snapshot()));
  const c = snap.watch.find(x=>x.id==='2330').d;
  c.fcfTTM = 'NaN'; c.capStock = -1; c.equity = 1e99; c.fcfAsOf='2026'; c.fcfHow={};
  applySnapshot(snap);
  const d = state.watchlist.find(x=>x.id==='2330').data;
  return { f: fcfYield(d), line: fcfLine(d), cap:d.capStock, fcf:d.fcfTTM };
});
T('毒備份檔：股本負數被擋掉', evil.cap===null, String(evil.cap));
T('毒備份檔：不產生 NaN／Infinity', !/NaN|Infinity/.test(evil.line), evil.line.replace(/<[^>]+>/g,'').slice(0,60));
T('毒備份檔：沒有百分比就不印百分比', evil.f===null);
T('全程沒有執行期錯誤', errs.length===0, errs.join(' | '));
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
