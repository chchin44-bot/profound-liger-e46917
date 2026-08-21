/* 自由現金流殖利率：用**真的官方數字**驗算，不是自己編的 fixture。
   下面每一個數字都是 FinMind 官方現金流量表／資產負債表／股價回傳的原值（2026-08 取得）。
   期別是累計制(YTD)，所以近四季 ＝ 本年累計 ＋ 去年全年 − 去年同期累計。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport:{width:390,height:844} });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2400);
await p.evaluate(()=>{try{closeModal()}catch(e){}});

/* ── 1. 累計制還原：ttmFromYTD 必須拼對，缺一塊就回 null ── */
const ytd = await p.evaluate(()=>{
  const m = new Map([
    ['2025-03-31', 625573672000],['2025-06-30',1122637757000],
    ['2025-09-30',1549466838000],['2025-12-31',2274975625000],
    ['2026-03-31', 698976265000],['2026-06-30',1482341242000]]);
  const full  = ttmFromYTD(m);
  const q4    = ttmFromYTD(new Map([...m].filter(([k])=>k<='2025-12-31')));
  const short = ttmFromYTD(new Map([['2026-06-30',1482341242000]]));
  const gap   = ttmFromYTD(new Map([['2025-12-31',2274975625000],['2026-06-30',1482341242000]])); // 缺去年同期
  return {full, q4, short, gap};
});
T('近四季 ＝ 本年累計 ＋ 去年全年 − 去年同期', ytd.full && ytd.full.value === 2634679110000,
  ytd.full ? (ytd.full.value/1e8).toFixed(0)+' 億' : 'null');
T('最新一列是 12-31 時直接用全年', ytd.q4 && ytd.q4.value === 2274975625000 && /全年報表/.test(ytd.q4.how));
T('只有一季時不硬湊，回 null', ytd.short === null);
T('缺去年同期時不估算，回 null', ytd.gap === null);

/* ── 2. 三檔真實個股 ── */
const CASES = [
  { id:'2330', name:'台積電', ind:'半導體業', price:2395, per:27.76, pbr:9.66,
    ocf:[['2025-06-30',1122637757000],['2025-12-31',2274975625000],['2026-06-30',1482341242000]],
    cap:[['2025-06-30',-628052531000],['2025-12-31',-1272410529000],['2026-06-30',-846764746000]],
    capStock:259323701000, equity:6474470981000,
    wantFcfYield:1.84, wantPerShare:44.10 },
  { id:'2412', name:'中華電', ind:'通信網路業', price:135, per:26.52, pbr:2.86,
    ocf:[['2025-06-30',29282911000],['2025-12-31',77445547000],['2026-06-30',31741601000]],
    cap:[['2025-06-30',-11490083000],['2025-12-31',-27698023000],['2026-06-30',-9847432000]],
    capStock:77574465000, equity:null,
    wantFcfYield:5.14, wantPerShare:6.94 },
  { id:'2317', name:'鴻海', ind:'其他電子業', price:200, per:17.11, pbr:1.91,
    ocf:[['2025-06-30',21875585000],['2025-12-31',226852474000],['2026-06-30',-69122283000]],
    cap:[['2025-06-30',-77150396000],['2025-12-31',-173763139000],['2026-06-30',-80886319000]],
    capStock:138629000000, equity:null,
    wantNegative:true },
];

for(const c of CASES){
  const r = await p.evaluate(cc=>{
    const s = state.watchlist.find(x=>x.id===cc.id) || state.watchlist[0];
    s.id = cc.id; s.ind = cc.ind; s.inWatch = true;
    s.txns=[{id:'a',kind:'buy',date:'2024-01-05',shares:1000,price:cc.price*0.8}]; s.txnsMigrated=true;
    const ser=[],ph=[]; const t=new Date('2026-08-14');
    for(let i=400;i>=0;i--){ const d=new Date(t-i*86400000);
      ser.push({date:d.toISOString().slice(0,10), close:+(cc.price*(1+Math.sin(i/37)*0.08)).toFixed(2)});
      ph.push(cc.per); }
    ser[ser.length-1].close = cc.price;
    const ocfM = new Map(cc.ocf), capM = new Map(cc.cap);
    const o = ttmFromYTD(ocfM), k = ttmFromYTD(capM);
    applyStockData(s, { price:cc.price, eps:cc.price/cc.per, debt:0.4, holder:null, holderPrev:null,
      series:ser, asOf:'2026-08-14', per:cc.per, pbr:cc.pbr, perHist:ph, perAsOf:'2026-08-14',
      ocfTTM:o.value, capexTTM:Math.abs(k.value), fcfTTM:o.value-Math.abs(k.value),
      fcfAsOf:o.asOf, fcfHow:o.how, capStock:cc.capStock, equity:cc.equity }, 'live');
    applyPosition(s);
    return { f: fcfYield(s.data), line: fcfLine(s.data),
             fcf: s.data.fcfTTM, ocf: s.data.ocfTTM, capex: s.data.capexTTM };
  }, c);
  console.log(`\n── ${c.name} ${c.id}：營業 ${(r.ocf/1e8).toFixed(0)} 億 − 資本支出 ${(r.capex/1e8).toFixed(0)} 億 = 自由現金流 ${(r.fcf/1e8).toFixed(0)} 億`);
  if(c.wantNegative){
    T(`${c.name} 自由現金流是負的`, r.fcf < 0, (r.fcf/1e8).toFixed(0)+' 億');
    T(`${c.name} 畫面明說「沒有生出自由現金」`, /沒有生出自由現金/.test(r.line), r.line.replace(/<[^>]+>/g,'').slice(0,60));
    T(`${c.name} 不印出一個負的百分比當殖利率`, !/-\d+\.\d+%/.test(r.line));
  } else {
    T(`${c.name} 每股自由現金流 ≈ ${c.wantPerShare}`, r.f && Math.abs(r.f.perShare - c.wantPerShare) < 0.05, r.f && r.f.perShare);
    T(`${c.name} 自由現金流殖利率 ≈ ${c.wantFcfYield}%`, r.f && Math.abs(r.f.yield - c.wantFcfYield) < 0.03, r.f && r.f.yield + '%');
    T(`${c.name} 白話句子帶出金額與百分比`, /元/.test(r.line) && /%/.test(r.line), r.line.replace(/<[^>]+>/g,'').slice(0,70));
  }
}

/* ── 3. 台積電：現金殖利率必須明顯低於盈餘殖利率（資本支出吃掉一半） ── */
const cmp = await p.evaluate(()=>{
  const s = state.watchlist.find(x=>x.id==='2330');
  return s && s.data ? { fcf: fcfYield(s.data), per: s.data.per } : null;
});
if(cmp && cmp.fcf) {
  T('台積電：現金殖利率 < 盈餘殖利率（資本支出吃掉一半以上）',
    cmp.fcf.yield < 100/cmp.per * 0.7, `現金 ${cmp.fcf.yield}% vs 盈餘 ${(100/cmp.per).toFixed(2)}%`);
}

/* ── 4. 金融股不得顯示自由現金流 ── */
const fin = await p.evaluate(()=>{
  const s = state.watchlist.find(x=>x.id==='2884') || state.watchlist[0];
  s.id='2884'; s.ind='金融保險業';
  s.data = Object.assign({}, s.data, { ind:'金融保險業', id:'2884' });
  return fcfLine(s.data);
});
T('金融股明說不適用', /金融業不適用/.test(fin), fin.replace(/<[^>]+>/g,'').slice(0,50));

/* ── 5. 沒有資料時不得編造 ── */
const none = await p.evaluate(()=>fcfLine({ ind:'半導體業', id:'2330', fcfTTM:null, capStock:null }));
T('沒有現金流量表時不給數字', !/%/.test(none), none.replace(/<[^>]+>/g,'').slice(0,50));

/* ── 6. v84：面額不再假設 10 元 ──
   舊版這裡驗的是「面額不是 10 元就擋掉」。那個行為已經被取代：
   面額現在由官方權益與股價淨值比**推算**出來，推得到就照它算，不再擋。
   （面額本身的完整測試在 r13/par.mjs） */
const bad = await p.evaluate(()=>{
  const d = { ind:'半導體業', id:'9999', fcfTTM:1e10, capStock:1e10, equity:5e11, pbr:2, price:100,
              series:[{date:'2026-08-14',close:100}], perAsOf:'2026-08-14', per:20 };
  return { f: fcfYield(d), line: fcfLine(d), sh: sharesOutstanding(d) };
});
T('面額 1 元的股票不再被擋掉', bad.f && !bad.f.blocked, JSON.stringify(bad.f&&{blocked:bad.f.blocked}));
T('而且推算得出面額就是 1 元', bad.sh && bad.sh.par === 1, JSON.stringify(bad.sh&&{par:bad.sh.par}));
T('股數用推算出來的面額換算（100 億股，不是 10 億）', bad.sh.shares === 1e10, bad.sh.shares);
T('每股現金流因此是 1 元（舊版會算成 10 元，差 10 倍）', bad.f.perShare === 1, bad.f.perShare);

/* 真正兜不起來的資料才擋 */
const inco = await p.evaluate(()=>{
  const d = { ind:'半導體業', id:'9998', fcfTTM:1e10, capStock:1e10, equity:1e6, pbr:2, price:100,
              series:[{date:'2026-08-14',close:100}], perAsOf:'2026-08-14', per:20 };
  return { f: fcfYield(d), line: fcfLine(d) };
});
T('數字兜不起來時仍然擋下來', inco.f && inco.f.blocked === true, JSON.stringify(inco.f&&{blocked:inco.f.blocked}));
T('擋下來時說明原因，不給百分比', /不顯示每股現金流/.test(inco.line) && !/%/.test(inco.line));

/* ── 7. 分母不隨盤中報價跳動（跟本益比同一個錨） ── */
const anchor = await p.evaluate(()=>{
  const s = state.watchlist.find(x=>x.id==='2330');
  const before = fcfYield(s.data).yield;
  s.data.price = s.data.price * 1.1; s.data.src='rt';
  return { before, after: fcfYield(s.data).yield };
});
T('盤中報價 +10% 時，現金殖利率不變', Math.abs(anchor.before-anchor.after) < 0.001,
  `${anchor.before}% → ${anchor.after}%`);

T('全程沒有執行期錯誤', errs.length===0, errs.join(' | '));
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
