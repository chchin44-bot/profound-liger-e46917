/* ══════════════════════════════════════════════════════════════════════
   invariants.mjs —— 台股儀表板「不變量 / 性質測試」長期用測試庫
   ────────────────────────────────────────────────────────────────────
   用法：
     import { launch, runScenario, checkAll, genScenario, mulberry32 } from './invariants.mjs';
     const rng = mulberry32(1234);
     const { b, p } = await launch();
     for(let i=0;i<500;i++){
       const sc = genScenario(rng);
       const F  = await runScenario(p, sc);        // {A, B, C} 三個觀測畫格
       const v  = checkAll(F, sc);                 // 違反的不變量清單
     }

   設計原則：
   ① 不變量寫成「必須永遠成立」的斷言，跟具體情境無關。
   ② 每一條有 id / 嚴重度 / 一句話說明，方便長期追蹤（回歸測試）。
   ③ 三個畫格：A = 一般、B = 同一組資料開隱私、C = snapshot→applySnapshot 往返後。
      跨畫格的不變量（隱私不得改變結論、往返必須冪等）只有這樣才測得到。
   ══════════════════════════════════════════════════════════════════════ */
import { chromium } from 'playwright';

export const FILE = 'file://'+process.cwd()+'/index.html';

export function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const pick = (rng, arr) => arr[Math.floor(rng()*arr.length)];
const rint = (rng, lo, hi) => lo + Math.floor(rng()*(hi-lo+1));
const rflt = (rng, lo, hi) => lo + rng()*(hi-lo);

/* 內建百大裡的代表性標的：一般 / 金融 / 高負債產業 / 租賃(代號白名單) / ETF 型代號 */
const IDS = ['2330','2308','2383','2603','2412','2881','5871','2382','1301','2409','3008','1216'];

/* 同產業叢集：讓 peBands 有機會走到「同業中位數」那一層（需要 ≥5 檔同業） */
const CLUSTER = {
  '電腦及週邊': ['2382','2357','2377','2376','2356','2324','4938','2353'],
  '金融保險':   ['2881','2882','2891','2886','2884','2885','2892','2880'],
  '半導體':     ['2330','2454','2303','3711','3034','2379','2344','2337']
};

export function genScenario(rng){
  const cluster = rng() < 0.35 ? pick(rng, Object.keys(CLUSTER)) : null;
  const pool = cluster ? CLUSTER[cluster] : IDS;
  const n = cluster ? rint(rng, 5, 7) : rint(rng, 1, 4);
  const noHistAll = cluster ? rng() < 0.8 : false;   // 沒有自身歷史才會退到同業中位數
  const stocks = [];
  const used = new Set();
  for(let i=0;i<n;i++){
    let id = pick(rng, pool); let guard=0;
    while(used.has(id) && guard++<20) id = pick(rng, pool);
    if(used.has(id)) continue;
    used.add(id);
    const base = rflt(rng, 8, 1200);
    stocks.push({
      id,
      cost:   rng() < 0.15 ? 0 : +rflt(rng, base*0.4, base*1.8).toFixed(2),
      shares: pick(rng, [1000, 2000, 5000, 1, 137, 999, 1999, 12000]),
      src:    pick(rng, ['live','live','live','stale','mock','none']),
      price:  +base.toFixed(2),
      eps:    rng() < 0.12 ? -Math.abs(+rflt(rng,0.1,5).toFixed(2)) : +rflt(rng, 0.2, base/8).toFixed(2),
      debt:   +rflt(rng, 0.05, 0.97).toFixed(4),
      /* 千張大戶「週變動」是有號數 —— 正負都要生 */
      holder:     rng()<0.1 ? null : +rflt(rng,-1.2,1.2).toFixed(2),
      holderPrev: rng()<0.1 ? null : +rflt(rng,-1.2,1.2).toFixed(2),
      per:    rng() < 0.1 ? null : +rflt(rng, 3, 90).toFixed(2),
      pbr:    rng() < 0.2 ? null : +rflt(rng, 0.3, 8).toFixed(2),
      divYield: rng() < 0.3 ? null : +rflt(rng, 0, 9).toFixed(2),
      nSer:   noHistAll ? pick(rng,[0,5,60]) : pick(rng, [0, 5, 60, 300, 1300]),
      noHist: noHistAll,
      vol:    +rflt(rng, 0.03, 0.45).toFixed(3),
      drift:  +rflt(rng, -0.5, 0.9).toFixed(3),
      nEv:    rint(rng, 0, 5),
      cutEv:  rng() < 0.25,
      perSpread: +rflt(rng, 0.15, 1.4).toFixed(2)
    });
  }
  return {
    seed: Math.floor(rng()*1e9),
    cluster,
    stocks,
    privacy: false,
    fontScale: pick(rng, ['sm','mid','big']),
    demoMode: rng() < 0.2,
    live:     rng() < 0.7,
    width:    pick(rng, [320, 390, 414, 768, 1280])
  };
}

/* ── 注入頁面的建置 + 觀測程式（字串，於 page.evaluate 內執行）── */
export const PAGE_SRC = `
(() => {
  const G = (typeof globalThis !== 'undefined') ? globalThis : window;
  function rnd(seed){ let a = seed>>>0; return function(){ a|=0; a=a+0x6D2B79F5|0;
    let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
  function iso(d){ return new Date(d).toISOString().slice(0,10); }

  G.__build = function(sc){
    // 全清：把 100 檔全部歸零，只留 type=top100 骨架
    state.watchlist.forEach(x=>{ x.inWatch=false; x.cost=0; x.shares=1000; x.data={}; x.loaded=false; x.costAsOf=null; });
    state.privacy = false; state.page = 1; state.page100 = 1;
    state.filter = { q:'', ind:'', holdOnly:false, level:'', animal:'' };
    state.demoMode = !!sc.demoMode; state.live = !!sc.live;
    state.fontScale = sc.fontScale; applyFontScale();
    const T0 = Date.parse('2026-08-14T00:00:00Z');
    sc.stocks.forEach((k, ki) => {
      const s = state.watchlist.find(x=>x.id===k.id); if(!s) return;
      const r = rnd(sc.seed + ki*7919);
      const ser = [], perRows = [];
      let px = k.price * 0.7;
      const N = k.nSer;
      for(let i=N-1;i>=0;i--){
        const dt = iso(T0 - i*86400000);
        px = Math.max(0.5, px * (1 + (r()-0.5)*k.vol*0.1 + k.drift/Math.max(N,1)*0.01));
        ser.push({ date: dt, close: +px.toFixed(2) });
        perRows.push({ date: dt, per: +Math.max(0.5, (k.per||15) * (1 + (r()-0.5)*k.perSpread)).toFixed(2) });
      }
      if(ser.length) ser[ser.length-1].close = k.price;
      /* 事件必須真的在序列上造成跳空，否則 fillStats / adjustSeries 測不到 */
      const events = [];
      for(let e=0;e<k.nEv;e++){
        const at = Math.floor(N * (0.15 + 0.7*e/Math.max(1,k.nEv)));
        if(!ser[at] || at < 1) continue;
        const before = ser[at-1].close;
        if(k.cutEv && e===0){
          const kk = rflt2(r,1.2,3);
          for(let j=at;j<ser.length;j++) ser[j].close = +(ser[j].close*kk).toFixed(2);
          events.push({ kind:'cut', date: ser[at].date, before, after:+(before*kk).toFixed(2), amt:0, type:'減資', reason:'' });
        } else {
          const amt = +(before*rflt2(r,0.01,0.06)).toFixed(2);
          for(let j=at;j<ser.length;j++) ser[j].close = +Math.max(0.5, ser[j].close-amt).toFixed(2);
          events.push({ kind:'div', date: ser[at].date, before, after:+(before-amt).toFixed(2), amt, type:'息', reason:'' });
        }
      }
      if(ser.length) ser[ser.length-1].close = k.price;
      /* v56：每一組情境都要從乾淨的帳本開始，否則上一組的交易紀錄會殘留，
         而 applyPosition 會用舊帳本蓋掉這一組設定的 cost。 */
      s.inWatch = true; s.cost = k.cost; s.shares = k.shares; s.txns = null; s.txnHide = [];
      applyStockData(s, {
        price: k.src==='none' ? null : k.price,
        eps: k.eps, debt: k.debt, holder: k.holder, holderPrev: k.holderPrev,
        series: ser, asOf: ser.length ? ser[ser.length-1].date : null,
        per: k.per, pbr: k.pbr, divYield: k.divYield,
        perHist: k.noHist ? null : perRows.map(x=>x.per), perRows: k.noHist ? null : perRows,
        pbrHist: (k.pbr && !k.noHist) ? perRows.map(x=>+(k.pbr*(1+(x.per/(k.per||15)-1)*0.4)).toFixed(3)) : null,
        perAsOf: ser.length ? ser[ser.length-1].date : null,
        corpEvents: events.length ? events : null
      }, k.src);
      if(k.src==='none'){ s.data.err = '尚未連線 FinMind，因此沒有任何數值'; }
    });
    function rflt2(r,lo,hi){ return lo + r()*(hi-lo); }
    renderAll();
    return true;
  };

  G.__observe = function(){
    const T = el => el ? (el.textContent||'').replace(/\\s+/g,' ').trim() : null;
    const rows = [...document.querySelectorAll('#wlBody tr')].map(tr=>{
      const td = [...tr.children];
      const cell = i => td[i] ? (td[i].textContent||'').replace(/\\s+/g,' ').trim() : '';
      return {
        level: tr.getAttribute('data-level'),
        crocAttr: tr.getAttribute('data-croc') === '1',
        crocRow: tr.classList.contains('croc-row'),
        id: (td[1] ? td[1].querySelector('.font-bold') : null) ? td[1].querySelector('.font-bold').textContent.trim() : '',
        idCell: cell(1),
        priceCell: cell(2),
        pnlCell: cell(3),
        pnlCls: td[3] ? td[3].className : '',
        holderCell: cell(4),
        debtCell: cell(5),
        peCell: cell(6),
        animals: [...tr.querySelectorAll('[data-animal]')].map(x=>x.getAttribute('data-animal')),
        levelCell: cell(8),
        titles: [...tr.querySelectorAll('[title]')].map(x=>x.getAttribute('title')),
        html: tr.innerHTML
      };
    });
    const st = state.watchlist.filter(x=>x.inWatch).map(x=>({
      id:x.id, cost:x.cost, shares:x.shares, ind:x.ind,
      src:x.data&&x.data.src, price:x.data&&x.data.price, pe:x.data&&x.data.pe,
      pnl:x.data&&x.data.pnl, debt:x.data&&x.data.debt,
      holder:x.data&&x.data.holder, holderPrev:x.data&&x.data.holderPrev,
      per:x.data&&x.data.per, divYield:x.data&&x.data.divYield,
      adjusted:x.data&&x.data.adjusted,
      real: dataReal(x.data),
      animals: (x.loaded && dataReal(x.data)) ? stockAnimals({...x.data, id:x.id, ind:x.ind, pnl:(x.data.pnl==null?null:x.data.pnl)}) : [],
      bandsCached: (x.data && x.data.targets && x.data.targets.bands) || null,
      bandsFresh: (function(){ try{ return dataReal(x.data) ? peBands(x.ind, x.data) : null; }catch(e){ return null; } })(),
      valKey: dataReal(x.data) ? valuate(x.data.pe==null?null:x.data.pe, x.data).key : null,
      valLevel: dataReal(x.data) ? valuate(x.data.pe==null?null:x.data.pe, x.data).level : null,
      note: (function(){ try{ const a=(x.loaded && dataReal(x.data)) ? stockAnimals({...x.data,id:x.id,ind:x.ind,pnl:(x.data.pnl==null?null:x.data.pnl)}) : [];
              return noteLine(x, x.data||{}, a, dataReal(x.data)?valuate(x.data.pe==null?null:x.data.pe,x.data):null, dataReal(x.data)).replace(/\\s+/g,' ').trim(); }catch(e){ return 'ERR:'+e.message; } })(),
      base: (function(){ try{ return peBaseRate(x.data||{}, dataReal(x.data)?valuate(x.data.pe==null?null:x.data.pe,x.data):null, dataReal(x.data)).replace(/\\s+/g,' ').trim(); }catch(e){ return 'ERR:'+e.message; } })()
    }));
    /* 位階篩選的結果（不受隱私影響才對） */
    const filterProbe = {};
    ['cheap','fair','warm','rich','trap','fin','na'].forEach(k=>{
      state.filter.level = k;
      try{ filterProbe[k] = filteredList().map(x=>x.id).join(','); }catch(e){ filterProbe[k] = 'ERR'; }
    });
    state.filter.level = '';
    return {
      privacy: state.privacy,
      rows, st, filterProbe,
      myPnl: T(document.getElementById('myPnlBody')),
      myPnlHTML: document.getElementById('myPnlBody') ? document.getElementById('myPnlBody').innerHTML : '',
      totalPnl: T(document.getElementById('totalPnl')),
      totalPnlHTML: document.getElementById('totalPnl') ? document.getElementById('totalPnl').innerHTML : '',
      rhinoCount: T(document.getElementById('rhinoCount')),
      rhinoWarn: T(document.getElementById('rhinoWarn')),
      crocCount: T(document.getElementById('crocCount')),
      blockCQuality: T(document.getElementById('blockCQuality')),
      allocWarn: T(document.getElementById('allocWarn')),
      allocBars: T(document.getElementById('allocBars')),
      allocAria: document.getElementById('allocBars') ? document.getElementById('allocBars').getAttribute('aria-label') : null,
      whaleList: T(document.getElementById('whaleList')),
      bodyText: (document.body.innerText||'').replace(/\\u00a0/g,' '),
      allTitles: [...document.querySelectorAll('[title]')].map(x=>x.getAttribute('title')).join(' || '),
      allAria: [...document.querySelectorAll('[aria-label]')].map(x=>x.getAttribute('aria-label')).join(' || ')
    };
  };

  /* 賣出/買進前檢查的守門：回傳彈窗標題 */
  G.__trade = function(id, act){
    try{ closeAllModals(); }catch(e){}
    try{ handleTrade(id, act); }catch(e){ return 'ERR:'+e.message; }
    const m = document.getElementById('modal');
    const t = m && !m.classList.contains('hidden') ? (m.textContent||'').replace(/\\s+/g,' ').trim().slice(0,220) : '(no modal)';
    try{ closeModal(); }catch(e){}
    return t;
  };

  G.__roundtrip = function(){
    const snap = JSON.parse(JSON.stringify(snapshot()));
    applySnapshot(snap, { trusted:true });
    renderAll();
    return true;
  };
  G.__setPrivacy = function(on){ setPrivacy(!!on); renderAll(); return state.privacy; };
  return true;
})()`;

export async function launch(opts = {}){
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const c = await b.newContext({ viewport:{ width: opts.width||414, height: opts.height||900 } });
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console',  m => { if(m.type()==='error' && !/frame-ancestors/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
  p.on('dialog', d => d.dismiss().catch(()=>{}));
  await p.goto(FILE);
  await p.waitForTimeout(500);
  await p.evaluate(()=>{ try{ closeAllModals(); }catch(e){} });
  await p.evaluate(PAGE_SRC);
  p.__errs = errs;
  return { b, c, p, errs };
}

/* 一組情境 → 三個觀測畫格 */
export async function runScenario(p, sc){
  await p.evaluate(PAGE_SRC);                       // 每次都重新注入（reload 後也有效）
  await p.evaluate(s => __build(s), sc);
  const A = await p.evaluate(() => __observe());
  const tradeA = {};
  for(const s of sc.stocks){
    tradeA[s.id+'/sell'] = await p.evaluate(([i,a]) => __trade(i,a), [s.id,'sell']);
    tradeA[s.id+'/buy']  = await p.evaluate(([i,a]) => __trade(i,a), [s.id,'buy']);
  }
  await p.evaluate(() => __setPrivacy(true));
  const B = await p.evaluate(() => __observe());
  const tradeB = {};
  for(const s of sc.stocks){
    tradeB[s.id+'/sell'] = await p.evaluate(([i,a]) => __trade(i,a), [s.id,'sell']);
    tradeB[s.id+'/buy']  = await p.evaluate(([i,a]) => __trade(i,a), [s.id,'buy']);
  }
  await p.evaluate(() => __setPrivacy(false));
  await p.evaluate(() => __roundtrip());
  const C = await p.evaluate(() => __observe());
  return { A, B, C, tradeA, tradeB };
}

/* ══════════════════════════════════════════════════════════════════════
   不變量清單
   sev: 'S1' 會讓使用者做出錯誤金錢決定 / 'S2' 前後矛盾或洩漏 / 'S3' 品質
   ══════════════════════════════════════════════════════════════════════ */
const NUM_RE   = /(NaN|Infinity|undefined|\bnull\b|\[object Object\])/;
const MONEY_RE = /[0-9][0-9,]*(\.[0-9]+)?\s*元/;

export const INVARIANTS = [

/* ── 1. 數值衛生 ── */
{ id:'N1', sev:'S1', desc:'畫面上任何文字都不得出現 NaN / Infinity / undefined / null / [object Object]',
  check: ({A,B,C}) => {
    const out = [];
    for(const [tag,F] of [['A',A],['B',B],['C',C]]){
      const m = (F.bodyText||'').match(NUM_RE);
      if(m) out.push(`${tag}: 內文出現「${m[0]}」`);
      const t = (F.allTitles||'').match(NUM_RE); if(t) out.push(`${tag}: title 出現「${t[0]}」`);
      const a = (F.allAria||'').match(NUM_RE);   if(a) out.push(`${tag}: aria-label 出現「${a[0]}」`);
    }
    return out;
  }},

{ id:'N2', sev:'S3', desc:'不得顯示負零（−0 元 / −0.0%）',
  check: ({A,B,C}) => {
    const out = [];
    for(const [tag,F] of [['A',A],['C',C]]){
      if(/[−-]0(\.0+)?\s*(元|%)/.test(F.bodyText||'')) out.push(`${tag}: 出現負零`);
    }
    return out;
  }},

/* ── 2. 未連線 / 非真實資料 ── */
{ id:'R1', sev:'S1', desc:'dataReal(d)===false 時，該檔不得產生任何位階判定或動物',
  check: ({A}) => A.st.filter(s=>!s.real && (s.animals.length || (s.valKey && s.valKey!=='na')))
                     .map(s=>`${s.id} src=${s.src} animals=${s.animals} val=${s.valKey}`)},

{ id:'R2', sev:'S1', desc:'完全沒有真實資料時，首屏不得出現任何由價格導出的金額',
  check: ({A}) => {
    if(A.st.some(s=>s.real && s.price>0)) return [];
    return MONEY_RE.test(A.myPnl||'') && !/沒有真實股價|還沒有填入/.test(A.myPnl||'')
      ? [`未連線卻在首屏印出金額：${(A.myPnl||'').slice(0,120)}`] : [];
  }},

{ id:'R3', sev:'S1', desc:'非真實資料的持股不得進入資產配置 / 集中度統計',
  check: ({A}) => {
    const fake = A.st.filter(s=>!s.real && s.price>0).map(s=>s.id);
    return fake.filter(id => (A.allocAria||'').includes(id) || (A.allocWarn||'').includes(id))
               .map(id=>`${id} 是示範/未連線值卻出現在資產配置`);
  }},

/* ── 3. 隱私模式 ── */
{ id:'P1', sev:'S1', desc:'隱私模式下不得出現任何金額 / 成本 / 股數 / 報酬率的明文',
  check: ({A,B}) => {
    const out = [];
    // 由情境算出真正的敏感數字，逐一在隱私畫面裡找（避免把「最低手續費 20 元」誤判）
    const held = A.st.filter(s=>s.real && s.price>0 && s.cost>0 && s.shares>0);
    const fm = n => Math.round(n).toLocaleString('zh-TW');
    const secrets = [];
    let cost=0, mv=0;
    held.forEach(s=>{ cost += s.cost*s.shares; mv += s.price*s.shares;
      secrets.push([`${s.id} 該檔賺賠`, fm(Math.abs((s.price-s.cost)*s.shares))]); });
    if(held.length){ secrets.push(['買進總成本', fm(cost)], ['現在總市值', fm(mv)], ['總賺賠', fm(Math.abs(mv-cost))]); }
    const body = B.bodyText || '';
    secrets.forEach(([lab,v])=>{ if(v.length>=4 && new RegExp(v.replace(/,/g,',')+'\\s*元').test(body)) out.push(`${lab} ${v} 元 在隱私模式下仍可見`); });
    if(/[+\-−][0-9]+\.[0-9]{2}%/.test(B.totalPnl||'')) out.push(`區塊C 總損益出現報酬率：${B.totalPnl}`);
    B.rows.forEach(r=>{ if(/[+\-−][0-9]+\.[0-9]{2}%/.test(r.pnlCell)) out.push(`${r.id} 列的未實現損益未遮蔽：${r.pnlCell}`); });
    return out;
  }},

{ id:'P8', sev:'S2', desc:'隱私模式下表格不得印出目標價（目標價面板自己宣稱「位階、目標價與所有價位一併隱藏」）',
  check: ({B}) => B.rows.filter(r=>/便宜 \$|合理 \$|昂貴 \$/.test(r.levelCell))
                        .map(r=>`${r.id}：${r.levelCell}`)},

{ id:'P9', sev:'S2', desc:'隱私模式下不得洩漏部位結構（單一持股佔比、集中度警示）',
  check: ({B}) => {
    const out = [];
    if(/佔比 [0-9]/.test(B.allocWarn||'')) out.push(`集中度警示未遮蔽：${(B.allocWarn||'').slice(0,60)}`);
    if(/佔 [0-9]+\.[0-9]%/.test(B.allocAria||'')) out.push(`資產配置 aria-label 未遮蔽：${B.allocAria}`);
    return out;
  }},

{ id:'P2', sev:'S2', desc:'隱私模式下不得用顏色 / 底色洩漏賺賠方向',
  check: ({B}) => {
    const out = [];
    B.rows.forEach(r=>{
      if(/text-rose-400|text-emerald-400/.test(r.pnlCls) && r.pnlCell && r.pnlCell !== '—' )
        out.push(`${r.id} 未實現損益格仍帶方向色 class="${r.pnlCls.match(/text-(rose|emerald)-400/)[0]}"（內容 ${r.pnlCell}）`);
      if(r.crocRow || r.crocAttr) out.push(`${r.id} 仍帶 croc-row / data-croc=1（＝公開「賠超過 15%」）`);
    });
    return out;
  }},

{ id:'P3', sev:'S1', desc:'隱私模式下不得出現任何由「你的成本」導出的動物（🐊 croc / 🐎 horse）',
  check: ({B}) => B.rows.filter(r=>r.animals.includes('croc')||r.animals.includes('horse'))
                        .map(r=>`${r.id} 在隱私模式仍顯示 ${r.animals.filter(a=>a==='croc'||a==='horse')}`)},

{ id:'P4', sev:'S2', desc:'隱私模式不得「新增」任何非隱私模式沒有的結論（動物只能減不能增）',
  check: ({A,B}) => {
    const out = [];
    const ma = new Map(A.rows.map(r=>[r.id,r.animals]));
    B.rows.forEach(r=>{
      const before = ma.get(r.id) || [];
      const added = r.animals.filter(a=>!before.includes(a));
      if(added.length) out.push(`${r.id} 隱私模式多出 ${added.join(',')}（非隱私時是 ${before.join(',')||'無'}）`);
    });
    return out;
  }},

{ id:'P5', sev:'S1', desc:'隱私模式不得停用安全守門：🟢 便宜區賣出必出 🐔、🔴 昂貴區買進必出 🐖',
  check: ({A,tradeA,tradeB}) => {
    const out = [];
    A.st.forEach(s=>{
      if(s.valLevel === 'buy'){
        const a = tradeA[s.id+'/sell']||'', b = tradeB[s.id+'/sell']||'';
        if(/小雞警告/.test(a) && !/小雞警告/.test(b)) out.push(`${s.id} 便宜區賣出：一般模式有 🐔，隱私模式變成「${b.slice(0,40)}」`);
      }
      if(s.valLevel === 'sell'){
        const a = tradeA[s.id+'/buy']||'', b = tradeB[s.id+'/buy']||'';
        if(/小豬警告/.test(a) && !/小豬警告/.test(b)) out.push(`${s.id} 昂貴區買進：一般模式有 🐖，隱私模式變成「${b.slice(0,40)}」`);
      }
    });
    return out;
  }},

{ id:'P6', sev:'S1', desc:'隱私模式下彈窗不得印出未遮蔽的報酬率',
  check: ({tradeB}) => Object.entries(tradeB)
      .filter(([,v]) => /未實現損益為\s*[+\-−][0-9]/.test(v||''))
      .map(([k,v])=>`${k} 彈窗印出報酬率：${(v.match(/未實現損益為\s*[^，。]{0,14}/)||[''])[0]}`)},

{ id:'P7', sev:'S2', desc:'隱私模式不得改變「位階篩選」的結果（篩選是導覽，不是揭露）',
  check: ({A,B}) => Object.keys(A.filterProbe)
      .filter(k => A.filterProbe[k] !== B.filterProbe[k])
      .map(k => `篩選 level=${k}：一般模式 [${A.filterProbe[k]}] → 隱私模式 [${B.filterProbe[k]}]`)},

/* ── 4. 跨模組一致性 ── */
{ id:'X1', sev:'S1', desc:'🦏 灰犀牛的門檻在「動物標籤」與「區塊 C 計數」與「門檻總表」必須是同一個',
  check: ({A}) => {
    const tagged = A.st.filter(s=>s.animals.includes('rhino')).map(s=>({id:s.id, debt:s.debt}));
    const counted = parseInt(A.rhinoCount||'0',10) || 0;
    const out = [];
    tagged.forEach(t=>{ if(t.debt != null && t.debt <= 0.80)
      out.push(`${t.id} 負債比 ${(t.debt*100).toFixed(1)}% 被貼 🦏，但區塊C（>80%）與說明頁門檻表都不算它（rhinoCount=${counted}）`); });
    return out;
  }},

{ id:'X2', sev:'S2', desc:'同一列裡，動物與燈號不得互相矛盾（🐖 vs 🟢 / 🐋 vs 🔴）',
  check: ({A}) => {
    const out = [];
    A.rows.forEach(r=>{
      if(r.animals.includes('pig') && /便宜區/.test(r.levelCell)) out.push(`${r.id}：同列 🐖 豬 ＋ 綠燈便宜區`);
      if(r.animals.includes('whale') && /昂貴區/.test(r.levelCell) && !r.animals.includes('pig')) {/* 🐋 可由籌碼觸發，不算矛盾 */}
      if(r.animals.includes('horse') && /昂貴區/.test(r.levelCell)) out.push(`${r.id}：同列 🐎 駿馬（宣稱「未進入昂貴區」）＋ 🔴 昂貴區`);
    });
    return out;
  }},

{ id:'X3', sev:'S1', desc:'「我的持股」的定義在首屏 / 資產配置 / 區塊C 必須一致',
  check: ({A}) => {
    const held = A.st.filter(s=>s.real && s.price>0);
    const noCost = held.filter(s=>!(s.cost>0)).map(s=>s.id);
    const out = [];
    // 首屏只算 cost>0；資產配置卻把 cost=0（＝沒買）的也算成市值
    noCost.forEach(id=>{ if((A.allocAria||'').includes(id) || (A.allocWarn||'').includes(id))
      out.push(`${id} 沒有填成本（首屏視為「沒買」），卻以預設股數計入資產配置／集中度`); });
    return out;
  }},

{ id:'X4', sev:'S2', desc:'首屏總額的賺賠方向必須等於各列賺賠金額加總的方向',
  check: ({A}) => {
    const m = (A.myPnl||'').match(/現在總共(賺|賠)/); if(!m) return [];
    const held = A.st.filter(s=>s.real && s.price>0 && s.cost>0 && s.shares>0);
    if(!held.length) return [];
    const amt = held.reduce((a,s)=>a+(s.price-s.cost)*s.shares, 0);
    const word = amt >= 0 ? '賺' : '賠';
    return word === m[1] ? [] : [`首屏說「${m[1]}」，逐檔加總是 ${word}（${Math.round(amt)}）`];
  }},

{ id:'X5', sev:'S2', desc:'同一檔的 🐊 標籤與該列的未實現損益必須同號（croc ⟺ pnl < −15%）',
  check: ({A}) => A.st.filter(s=>s.real).filter(s=>{
      const has = s.animals.includes('croc');
      const should = s.pnl != null && s.pnl < -15;
      return has !== should;
    }).map(s=>`${s.id} pnl=${s.pnl} croc=${s.animals.includes('croc')}`)},

{ id:'X6', sev:'S1', desc:'策略卡不得在燈號說「昂貴」時輸出加碼形態（E 卡）或多頭卡（B 卡）',
  check: ({A}) => A.st.filter(s=>s.real && s.valLevel==='sell' && (s.tactic==='E'||s.tactic==='B'))
                      .map(s=>`${s.id} 燈號 ${s.valKey} 但策略卡是 ${s.tactic}`)},

{ id:'X7', sev:'S1', desc:'同一格裡，燈號與它旁邊印的三檔目標價不得互相矛盾',
  check: ({A}) => {
    const out = [];
    const pm = new Map(A.st.map(s=>[s.id, s.price]));
    A.rows.forEach(r=>{
      const p = pm.get(r.id); if(!(p>0)) return;
      const g = k => { const m = new RegExp(k+' \\$([\\d,]+(\\.\\d+)?)').exec(r.levelCell); return m ? +m[1].replace(/,/g,'') : null; };
      const cheap = g('便宜'), rich = g('昂貴');
      if(rich != null && /昂貴區/.test(r.levelCell) && p < rich*0.98)
        out.push(`${r.id} 燈號「🔴 昂貴區」但同格印「昂貴 $${rich}」而現價只有 $${p}（＝還要漲 ${((rich/p-1)*100).toFixed(0)}% 才昂貴）`);
      if(cheap != null && /便宜區/.test(r.levelCell) && p > cheap*1.02)
        out.push(`${r.id} 燈號「🟢 便宜區」但同格印「便宜 $${cheap}」而現價已是 $${p}`);
    });
    return out;
  }},

{ id:'X8', sev:'S1', desc:'d.targets（抓取時算好的目標價）必須與現算的 peBands 一致',
  check: ({A}) => A.st.filter(s=>s.real && s.bandsCached && s.bandsFresh)
      .filter(s=>Math.abs(s.bandsCached.rich - s.bandsFresh.rich) > 0.051
              || Math.abs(s.bandsCached.fair - s.bandsFresh.fair) > 0.051)
      .map(s=>`${s.id} 快取的倍數區間 ${s.bandsCached.cheap}/${s.bandsCached.fair}/${s.bandsCached.rich}（${s.bandsCached.short}）`
             + ` ≠ 現算 ${s.bandsFresh.cheap}/${s.bandsFresh.fair}/${s.bandsFresh.rich}（${s.bandsFresh.short}）`)},

/* ── 5. 往返冪等 ── */
{ id:'I1', sev:'S1', desc:'snapshot() → applySnapshot() 往返後，所有使用者可見的金額必須不變',
  check: ({A,C}) => {
    const out = [];
    const norm = t => String(t||'').replace(/價格日期：\d{4}-\d{2}-\d{2}/g,'').replace(/\s+/g,' ').trim();
    const a = norm(A.myPnl), c = norm(C.myPnl);
    if(a !== c){
      const am = (a.match(/[0-9][0-9,]*\s*元/g)||[]).join('|');
      const cm = (c.match(/[0-9][0-9,]*\s*元/g)||[]).join('|');
      if(am !== cm) out.push(`首屏金額往返後改變：\n    前：${am}\n    後：${cm}`);
    }
    if(norm(A.totalPnl) !== norm(C.totalPnl)) out.push(`區塊C 總損益往返後改變：${A.totalPnl} → ${C.totalPnl}`);
    return out;
  }},

{ id:'I2', sev:'S1', desc:'往返後每一檔的位階燈號與動物集合必須不變',
  check: ({A,C}) => {
    const out = [];
    const cm = new Map(C.st.map(s=>[s.id,s]));
    A.st.forEach(s=>{
      const c = cm.get(s.id); if(!c) { out.push(`${s.id} 往返後消失`); return; }
      if(!s.real) return;                       // 只有真實資料進快取，示範值不還原是刻意的
      if(s.valKey !== c.valKey) out.push(`${s.id} 燈號 ${s.valKey} → ${c.valKey}`);
      const A1 = s.animals.slice().sort().join(','), C1 = c.animals.slice().sort().join(',');
      if(A1 !== C1) out.push(`${s.id} 動物 [${A1}] → [${C1}]`);
    });
    return out;
  }},

{ id:'I3', sev:'S1', desc:'往返後每一檔的基本欄位（價格 / 本益比 / 負債比 / 千張大戶 / 殖利率）必須不變',
  check: ({A,C}) => {
    const out = [];
    const cm = new Map(C.st.map(s=>[s.id,s]));
    A.st.forEach(s=>{
      const c = cm.get(s.id); if(!c || !s.real) return;
      ['price','pe','debt','holder','holderPrev','divYield'].forEach(k=>{
        const x = s[k], y = c[k];
        if(x == null && y == null) return;
        if(typeof x === 'number' && typeof y === 'number' && Math.abs(x-y) < 1e-6) return;
        if(x !== y) out.push(`${s.id}.${k}: ${JSON.stringify(x)} → ${JSON.stringify(y)}`);
      });
    });
    return out;
  }},

{ id:'I4', sev:'S2', desc:'往返後「出場參考 / 目標價」面板的顯示狀態不得改變（不得只剩漲幅、或反之）',
  check: ({A,C}) => {
    const out = [];
    const cm = new Map(C.st.map(s=>[s.id,s]));
    A.st.forEach(s=>{
      const c = cm.get(s.id); if(!c || !s.real) return;
      const ea = s.exit > 400, ec = c.exit > 400;   // >400 字元 ≒ 有完整統計表
      if(ea !== ec) out.push(`${s.id} 出場參考面板 ${ea?'有':'無'} → ${ec?'有':'無'}（往返後改變）`);
    });
    return out;
  }},

{ id:'I5', sev:'S2', desc:'往返本身不得丟出例外或讓任何面板變成 ERR',
  check: ({A,C}) => {
    const out = [];
    [['A',A],['C',C]].forEach(([t,F])=>{
      F.st.forEach(s=>{
        if(String(s.note).startsWith('ERR')) out.push(`${t}:${s.id} noteLine ${s.note}`);
        if(String(s.base).startsWith('ERR')) out.push(`${t}:${s.id} peBaseRate ${s.base}`);
      });
    });
    return out;
  }},

/* ── 6. 單調性 / 方向性 ── */
{ id:'D1', sev:'S2', desc:'「賺 / 賠」的方向在同一頁的所有出現處必須一致',
  check: ({A}) => {
    const out = [];
    const m = (A.myPnl||'').match(/現在總共(賺|賠)/); if(!m) return [];
    // 首屏大字的顏色（賺＝rose、賠＝emerald）
    const big = /text-3xl[^"]*"[^>]*>(?:<[^>]*>)*\s*(賺|賠)/.exec(A.myPnlHTML||'');
    if(big && big[1] !== m[1]) out.push(`首屏說明文字「${m[1]}」與大字「${big[1]}」不一致`);
    return out;
  }}
];

export function checkAll(F, sc){
  const out = [];
  for(const inv of INVARIANTS){
    let r = [];
    try{ r = inv.check(F, sc) || []; }
    catch(e){ r = ['(檢查器自身錯誤) ' + e.message]; }
    if(r.length) out.push({ id:inv.id, sev:inv.sev, desc:inv.desc, hits:r });
  }
  return out;
}

/* 最小化：把違反 inv.id 的情境逐檔 / 逐欄位刪減，直到不能再刪 */
export async function shrink(p, sc, invId){
  const has = async s => {
    const F = await runScenario(p, s);
    return checkAll(F, s).some(v=>v.id===invId);
  };
  let cur = JSON.parse(JSON.stringify(sc));
  if(!await has(cur)) return null;
  // 1) 刪股票
  for(let i=cur.stocks.length-1;i>=0 && cur.stocks.length>1;i--){
    const t = JSON.parse(JSON.stringify(cur)); t.stocks.splice(i,1);
    if(await has(t)) cur = t;
  }
  // 2) 簡化欄位
  const simplify = [
    ['nEv', 0], ['cutEv', false], ['perSpread', 0.5], ['vol', 0.1], ['drift', 0],
    ['shares', 1000], ['pbr', null], ['divYield', null]
  ];
  for(const [k,v] of simplify){
    const t = JSON.parse(JSON.stringify(cur));
    t.stocks.forEach(s=>{ s[k] = v; });
    if(await has(t)) cur = t;
  }
  return cur;
}

/* ══════════════════════════════════════════════════════════════════════
   定點不變量（需要特製狀態才測得到，產生式測試碰不到的角落）
   每一條都是 run(page) → 空字串代表成立，非空字串代表違反並附證據
   ══════════════════════════════════════════════════════════════════════ */
export const MK_SRC = `(()=>{
  globalThis.__mk = function(id,o){
    const s=state.watchlist.find(x=>x.id===id); if(!s) return null;
    const N=o.n||400, ser=[], per=[]; const T0=Date.parse('2026-08-14T00:00:00Z');
    let a=(o.seed||1)>>>0; const rr=()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
      t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296;};
    let px=(o.price||100)*0.85;
    for(let i=N-1;i>=0;i--){ const dt=new Date(T0-i*86400000).toISOString().slice(0,10);
      px=Math.max(1,px*(1+(rr()-0.5)*0.03)); ser.push({date:dt,close:+px.toFixed(2)});
      per.push({date:dt,per:+Math.max(1,(o.per||15)*(1+(rr()-0.5)*(o.spread==null?0.7:o.spread))).toFixed(2)});}
    if(ser.length) ser[ser.length-1].close=o.price||100;
    s.inWatch=true; s.cost=o.cost||0; s.shares=o.shares||1000; s.txns=o.txns||null; s.txnHide=[];
    applyStockData(s,{price:o.price||100,eps:o.eps==null?5:o.eps,debt:o.debt==null?0.4:o.debt,
      holder:o.holder===undefined?null:o.holder, holderPrev:o.holderPrev===undefined?null:o.holderPrev,
      series:ser,asOf:'2026-08-14',per:o.per==null?null:o.per,pbr:o.pbr==null?null:o.pbr,
      divYield:o.divYield==null?null:o.divYield,
      perHist:o.noHist?null:per.map(x=>x.per),perRows:o.noHist?null:per,pbrHist:null,
      perAsOf:'2026-08-14',corpEvents:o.corpEvents||null}, o.src||'live');
    return s; };
  globalThis.__reset = function(){
    /* v56：清空持股必須連交易帳本一起清。少了 txns/txnHide 這兩個欄位，
       上一個情境的帳本會殘留到下一個情境，__mk 設的 cost 會被舊帳本蓋掉——
       產品端的 doClearHoldings 與 initWatchlist 同樣要清，已修。 */
    state.watchlist.forEach(x=>{x.inWatch=false;x.cost=0;x.shares=1000;x.data={};x.loaded=false;x.costAsOf=null;x.txns=null;x.txnHide=[];});
    state.privacy=false; state.page=1; state.page100=1;
    state.filter={q:'',ind:'',holdOnly:false,level:'',animal:''}; };
  return true; })()`;

export const TARGETED = [
{ id:'G1', sev:'S3', desc:'renderAll() 必須冪等（連呼叫兩次 DOM 相同）',
  run: p => p.evaluate(()=>{ __reset();
    __mk('2330',{price:1000,cost:800,shares:2000,per:22,eps:45,divYield:2,holder:0.4,holderPrev:0.3});
    __mk('2603',{price:150,cost:200,shares:3000,per:8,eps:20,debt:0.42,seed:9});
    renderAll(); const a=document.body.innerHTML; renderAll();
    return a===document.body.innerHTML ? '' : 'DOM 長度 '+a.length+' → '+document.body.innerHTML.length; })},

{ id:'G2', sev:'S3', desc:'隱私模式開再關必須完全回到原狀（involution）',
  run: p => p.evaluate(()=>{ renderAll(); const a=document.body.innerHTML;
    setPrivacy(true); renderAll(); setPrivacy(false); renderAll();
    return a===document.body.innerHTML ? '' : 'DOM 不同'; })},

{ id:'G3', sev:'S2', desc:'首屏金額必須隨股數線性縮放',
  run: p => p.evaluate(()=>{ __reset(); __mk('2330',{price:1000,cost:800,shares:1000,per:22,eps:45});
    renderAll();
    const g=()=>+((document.getElementById('myPnlBody').textContent.match(/準確金額是 ([\d,]+) 元|賺 ([\d,]+) 元|賠 ([\d,]+) 元/)||[''])[0]||'').replace(/[^\d]/g,'');
    /* v56：股數是帳本推導出來的，直接寫 s.shares 已經沒有作用（G13 就是守這件事）。
       要放大部位，就在帳本裡再買一模一樣的一筆——金額必須跟著剛好變兩倍。 */
    const a=g(); const s=state.watchlist.find(x=>x.id==='2330');
    s.txns=[{id:'x1',kind:'buy',date:'2024-01-05',shares:1000,price:800,fee:0},
            {id:'x2',kind:'buy',date:'2024-01-06',shares:1000,price:800,fee:0}];
    applyPosition(s); reapply(s); renderAll();
    const b=g(); return Math.abs(b/a-2)<1e-9 ? '' : `股數 ×2 但金額 ${a} → ${b}`; })},

{ id:'G4', sev:'S2', desc:'燈號必須對本益比單調（PE 越高不得越便宜）',
  run: p => p.evaluate(()=>{ const order={cheap:0,fair:1,warm:2,rich:3}; const bad=[];
    let prev=-1, prevPe=null;
    for(const pe of [3,5,8,10,12,15,18,22,26,30,40,60,90]){
      __reset(); __mk('2330',{price:pe*10,per:pe,eps:10,spread:0.9,seed:11});
      const s=state.watchlist.find(x=>x.id==='2330'); const k=valuate(s.data.pe,s.data).key;
      const o=order[k]; if(o==null) continue;
      if(prev>=0 && o<prev) bad.push(`PE ${prevPe}→${pe}：${prev}→${o}(${k}) 倒退`);
      prev=o; prevPe=pe; }
    return bad.join('; '); })},

{ id:'G5', sev:'S1', desc:'v61：位階燈號回來了，但它必須對本益比單調，而且失真時一律不判定',
  /* 這一條原本是「表格不得再出現燈號顏色、等第或百分位」——第十二輪的 R1。
     v61 由作者明示要它回來，所以這一條不是被關掉，是換靶：
     燈號可以在，但它必須守住三件當初刪它的理由裡**還站得住的**那幾件。

     為什麼不是把 R1 整個丟掉：C2 的實測沒有被推翻——中華電五年本益比區間只有
     24% 寬，敏感度 10.95 個百分點／1%；玉山金 2022-08-19 本益比 +13.1%、
     股價一毛沒動，分位跳了 43.3 個百分點。那個脆弱性還在，只是作者決定接受它。
     能守的是：不得自相矛盾、不得在已知失真時還給顏色、不得在沒有真實資料時給顏色。 */
  run: p => p.evaluate(()=>{ __reset();
    const bad = [];
    /* ① 單調：**同一檔、同一份歷史**，本益比越高，燈號不得越便宜。
       舊版（與 G4）每一圈都重建股票，於是 peBands 的門檻也跟著變——
       它比較的是十一檔不同的股票，不是同一檔的十一個本益比。
       這裡把 d 固定下來，只換 pe，才是真的單調性。 */
    const order = {cheap:0, fair:1, warm:2, rich:3};
    __reset(); __mk('2330',{price:1000, per:18, eps:55, spread:0.9, seed:11});
    const d0 = state.watchlist.find(x=>x.id==='2330').data;
    let prev = -1, prevPe = null;
    for(const pe of [2,5,8,10,12,15,18,22,26,30,40,60,90,150]){
      const k = valuate(pe, d0).key;
      if(order[k] === undefined) continue;
      if(order[k] < prev) bad.push(`同一份歷史下，本益比 ${prevPe}→${pe} 燈號反而變便宜（${k}）`);
      prev = order[k]; prevPe = pe;
    }
    if(prev < 0) bad.push('整條本益比掃描沒有產生任何等第，單調性等於沒測到');
    /* ② 已判定失真／金融業待補 PBR 時，不得輸出任何顏色或等第 */
    __reset();
    __mk('2409',{price:20, per:5, eps:1, epsVals:[3,2,1,0.4]});
    const a = state.watchlist.find(x=>x.id==='2409');
    a.data.epsVals = [3,2,1,0.4];
    const va = valuate(a.data.pe, a.data);
    if(va.key === 'trap' && /便宜區|合理區|偏貴區|昂貴區/.test(va.label))
      bad.push('已判定本益比失真，label 卻仍是等第：' + va.label);
    /* ③ 沒有真實資料時不得有顏色（dataReal 閘門） */
    __reset(); __mk('2330',{price:1000,cost:800,per:22,eps:45,src:'mock'});
    renderAll();
    const cell = document.getElementById('wlBody').innerText;
    if(/便宜區|合理區|偏貴區|昂貴區/.test(cell))
      bad.push('示範值狀態下表格仍印出等第');
    return bad.join('; '); })},

{ id:'G6', sev:'S2', desc:'同業中位數必須排除「被判定的那一檔自己」',
  run: p => p.evaluate(()=>{ __reset();
    ['2382','2357','2377','2376','2356','2324'].forEach((id,i)=>__mk(id,{price:100,per:[150,10,11,12,13,14][i],eps:2,noHist:true}));
    const A=state.watchlist.find(x=>x.id==='2382');
    const b=peBands('電腦及週邊',A.data), o=industryMedianPE('電腦及週邊','2382');
    return (b.n===o.n && b.fair===o.med) ? '' :
      `peBands 用 ${b.n} 檔中位數 ${b.fair}（含自己 PE=${A.data.pe}）；排除自己應是 ${o.n} 檔 / ${o.med}｜呼叫點：${(peBands.toString().match(/industryMedianPE\([^)]*\)/)||[])[0]}`; })},

{ id:'G7', sev:'S1', desc:'千張大戶（有號欄位）必須能通過 snapshot→applySnapshot 往返',
  run: p => p.evaluate(()=>{ __reset();
    __mk('2330',{price:1000,cost:800,per:22,eps:45,holder:-0.42,holderPrev:-0.31}); renderAll();
    const g=()=>{const s=state.watchlist.find(x=>x.id==='2330');
      return {h:s.data.holder, a:stockAnimals({...s.data,id:s.id,ind:s.ind}).join(',')};};
    const b=g(); applySnapshot(JSON.parse(JSON.stringify(snapshot())),{trusted:true}); renderAll();
    const c=g();
    return (b.h===c.h && b.a===c.a) ? '' : `holder ${b.h}→${c.h}，動物 [${b.a}]→[${c.a}]`; })},

{ id:'G8', sev:'S2', desc:'隱私模式下「需要注意的事」不得洩漏部位損益',
  /* 新的一句話欄位會印「這檔賠了 −18.2%」「這檔賺了 +41%」——那是部位狀態，
     隱私模式的定義（把畫面拿給別人看）要求它消失。 */
  run: p => p.evaluate(()=>{ __reset(); __mk('2330',{price:1000,cost:1400,per:22,eps:45}); renderAll();
    setPrivacy(true); renderAll();
    const c=document.getElementById('wlBody').textContent.replace(/\s+/g,' ').trim();
    setPrivacy(false); renderAll();
    const bad=[];
    if(/賠了|賺了/.test(c)) bad.push('隱私模式仍印出損益句：'+c.slice(0,120));
    return bad.join('; '); })},

{ id:'G9', sev:'S2', desc:'說明頁「門檻總表」列的數字必須等於程式常數',
  run: p => p.evaluate(()=>{
    const txt = GUIDE.find(x=>x.k==='thresh').html().replace(/<[^>]*>/g,'')
                 .replace(/&gt;/g,'>').replace(/&lt;/g,'<').replace(/\s+/g,' ');
    /* 門檻已收斂成具名常數 RHINO_HI，所以直接讀常數本身；
       同時檢查 stockAnimals 確實引用了它，而不是又抄了一份字面值。 */
    const src = stockAnimals.toString();
    const usesConst = /debt\s*>\s*RHINO_HI/.test(src);
    const literal = (src.match(/debt\s*>\s*(0\.\d+)\s*&&\s*!isFinancial/)||[])[1];
    const tagThresh = usesConst ? RHINO_HI.toFixed(2) : literal;
    const near = (exitStats.toString().match(/NEAR\s*=\s*([\d.]+)/)||[])[1];
    const bad = [];
    const docPct = (txt.match(/負債比\s*>\s*(\d+)%/)||[])[1];
    if(docPct && Math.abs(Number(docPct)/100 - RHINO_HI) > 1e-9)
      bad.push(`門檻表寫「負債比 > ${docPct}%」，程式常數 RHINO_HI = ${RHINO_HI}`);
    if(literal && !usesConst)
      bad.push(`stockAnimals 又抄了一份字面值 ${literal}，應改用 RHINO_HI`);
    if(/±5\s*百分位/.test(txt) && /Math\.abs\(Math\.log/.test(exitStats.toString()))
      bad.push(`門檻表寫「本益比歷史 ±5 百分位」，exitStats 實際是本益比絕對值 ±${+near*100}%（log 距離）`);
    return bad.join('; '); })},

{ id:'G10', sev:'S2', desc:'本益比基準率句子的區間必須等於實際 perHist 的最小／最大值',
  /* 取代原本的「百分位徽章 tooltip 年數」——徽章已刪。
     新句子宣稱「這檔近 N 年裡，這個數字在 lo 到 hi 倍之間（M 天）」，
     三個數字全部必須可由 perHist 直接驗證，否則它就是另一個「把不知道寫成知道」。 */
  run: p => p.evaluate(()=>{ __reset(); __mk('2330',{price:1000,cost:800,per:22,eps:45,n:300}); renderAll();
    const s0 = state.watchlist.find(x=>x.id==='2330');
    const H = (s0.data.perHist||[]).filter(x=>x>0&&isFinite(x));
    if(!H.length) return '';
    const txt = peBaseRate(s0.data, valuate(s0.data.pe, s0.data), true).replace(/<[^>]*>/g,'');
    const m = txt.match(/在\s*([\d.]+)\s*到\s*([\d.]+)\s*倍之間（(\d+) 天）/);
    if(!m) return '句子格式不符，無法驗證：'+txt;
    const bad=[];
    const lo=Math.min(...H), hi=Math.max(...H);
    if(Math.abs(+m[1]-lo) > 0.06) bad.push(`句子寫最低 ${m[1]}，實際 ${lo.toFixed(2)}`);
    if(Math.abs(+m[2]-hi) > 0.06) bad.push(`句子寫最高 ${m[2]}，實際 ${hi.toFixed(2)}`);
    if(+m[3] !== H.length) bad.push(`句子寫 ${m[3]} 天，實際 ${H.length} 天`);
    return bad.join('; '); })},

{ id:'G11', sev:'S1', desc:'v56：買進日期不詳時，系統不得替它編一個日期',
  /* 前身是「costAsOf 必須代表買進日而不是填表日」。v56 之後買進日期住在帳本裡，
     這一條守的是同一件事的新形狀，而且它是實際抓到的缺陷寫成的：
     舊的 normalizeTxnDates 會把 dateUnknown 的紀錄填上今天的日期，
     存檔往返一次之後旗標就消失，畫面從「買進日期不詳」變成「2026-08-17 買進」。
     那是把「我不知道」寫成「我知道」的第 N 次重演。 */
  run: p => p.evaluate(()=>{
    const bad = [];
    __reset();
    const ev=[{kind:'div',date:'2024-07-15',before:900,after:886,amt:14,type:'息',reason:''}];
    __mk('2330',{price:1000,cost:800,per:22,eps:45,corpEvents:ev});
    const s=state.watchlist.find(x=>x.id==='2330');
    s.costAsOf = null; s.txns = null; applyPosition(s);
    const t = (s.txns||[])[0];
    if(!t) { bad.push('舊存檔沒有轉成任何一筆交易紀錄'); return bad.join('; '); }
    if(!t.dateUnknown) bad.push('沒有買進日期，卻沒有標成「日期不詳」');
    if(t.date) bad.push(`沒有買進日期，卻被填上 ${t.date}`);

    /* 日期不詳 → 不得把任何除權息算到他頭上 */
    let q = positionOf(s);
    if(q.divCash !== 0) bad.push(`日期不詳卻算了 ${q.divCash} 元的配息`);
    if(q.firstBuy) bad.push(`日期不詳卻回報買進日 ${q.firstBuy}`);

    /* 存檔往返之後旗標必須還在——這是實際壞過的地方 */
    const snap = JSON.parse(JSON.stringify(snapshot()));
    state.watchlist.forEach(x=>{x.txns=null;x.cost=0;x.shares=1000;});
    applySnapshot(snap,{trusted:true});
    const t2 = ((state.watchlist.find(x=>x.id==='2330')||{}).txns||[])[0];
    if(!t2) bad.push('往返後交易紀錄不見了');
    else {
      if(!t2.dateUnknown) bad.push('往返後「日期不詳」的旗標消失了');
      if(t2.date) bad.push(`往返後被填上日期 ${t2.date}`);
    }
    /* 寫入點都不得把買進日寫死成今天 */
    if(/date:\s*todayISO\(\)/.test(migrateToTxns.toString()))
      bad.push('migrateToTxns 把買進日寫死成今天');
    return bad.join('; '); })},

{ id:'G13', sev:'S1', desc:'v56：s.cost／s.shares 必須等於帳本算出來的值（沒有人繞過 applyPosition）',
  /* 前十一輪反覆出現的形狀是「同一個概念有 N 份手抄副本，其中一份沒跟上」。
     v56 把成本與股數收斂成帳本的推導值，這一條就是那個收斂的守門：
     任何一個地方直接寫 s.cost = ... 而沒有走 applyPosition，這裡立刻紅。 */
  run: p => p.evaluate(()=>{ __reset();
    ['2330','2412','2884'].forEach((id,i)=>__mk(id,{price:[1000,120,28][i],cost:[800,100,25][i],per:22,eps:45}));
    const s0 = state.watchlist.find(x=>x.id==='2330');
    s0.txns = [{id:'a',kind:'buy',date:'2024-01-05',shares:2000,price:600},
               {id:'b',kind:'buy',date:'2025-01-05',shares:1000,price:900},
               {id:'c',kind:'sell',date:'2025-06-05',shares:1000,price:1000}];
    applyPosition(s0);
    renderAll(); renderAll();          // 冪等：跑兩次也不得漂移
    const bad = [];
    state.watchlist.filter(x=>x.inWatch).forEach(x=>{
      const q = positionOf(x);
      if(q.shares > 0 && Math.abs(x.cost - q.avgCost) > 0.005)
        bad.push(`${x.id} s.cost=${x.cost} 但帳本算出來是 ${q.avgCost.toFixed(4)}`);
      if(q.shares > 0 && x.shares !== q.shares)
        bad.push(`${x.id} s.shares=${x.shares} 但帳本算出來是 ${q.shares}`);
      if([x.cost, x.shares].some(v=>typeof v === 'number' && !isFinite(v)))
        bad.push(`${x.id} cost/shares 出現非有限值`);
    });
    return bad.join('; '); })},

{ id:'G14', sev:'S1', desc:'v56：帳本必須通過 snapshot→applySnapshot 往返，已實現損益不得歸零',
  /* 這一條是實際抓到的缺陷寫成的：applySnapshot 有一份「先驗證再動手」的 clean 副本，
     而 txns 沒有被抄進去，於是還原之後帳本被 migrateToTxns 用 cost/shares 重建成一筆買進，
     已實現損益 294,577 → 0，畫面完全不說有東西不見了。 */
  run: p => p.evaluate(()=>{ __reset();
    __mk('2330',{price:1000,cost:800,per:22,eps:45});
    const s0 = state.watchlist.find(x=>x.id==='2330');
    s0.txns = [{id:'a',kind:'buy',date:'2024-01-05',shares:2000,price:600},
               {id:'b',kind:'sell',date:'2025-06-05',shares:1000,price:1000}];
    applyPosition(s0);
    const before = positionOf(s0);
    const snap = JSON.parse(JSON.stringify(snapshot()));
    state.watchlist.forEach(x=>{ x.txns=null; x.cost=0; x.shares=1000; });
    applySnapshot(snap,{trusted:true}); renderAll();
    const after = positionOf(state.watchlist.find(x=>x.id==='2330'));
    const bad=[];
    if(after.shares !== before.shares) bad.push(`股數 ${before.shares} → ${after.shares}`);
    if(Math.abs(after.realized - before.realized) > 0.01) bad.push(`已實現損益 ${before.realized.toFixed(2)} → ${after.realized.toFixed(2)}`);
    if(Math.abs(after.cost - before.cost) > 0.01) bad.push(`成本總額 ${before.cost.toFixed(2)} → ${after.cost.toFixed(2)}`);
    if(after.txns.length !== before.txns.length) bad.push(`筆數 ${before.txns.length} → ${after.txns.length}`);
    return bad.join('; '); })},

{ id:'G15', sev:'S1', desc:'v56：權息同日不得偷偷改動股數（欠定就要說欠定）',
  /* FinMind 的 stock_and_cache_dividend 是「權值＋息值」的合計，
     除權比例與現金金額在數學上是欠定的。舊版 suggestCost 硬用前後參考價的比例去推，
     台積電五年 20 次季配息連乘之後會把 2,000 股建議成約 2,400 股。 */
  run: p => p.evaluate(()=>{ __reset();
    __mk('2330',{price:1000,cost:800,per:22,eps:45});
    const s0 = state.watchlist.find(x=>x.id==='2330');
    s0.txns = [{id:'a',kind:'buy',date:'2020-01-05',shares:2000,price:600}];
    s0.data.corpEvents = [];
    for(let y=2020;y<=2024;y++) for(const m of ['03','06','09','12'])
      s0.data.corpEvents.push({kind:'div',date:`${y}-${m}-15`,before:600,after:590,amt:10,type:'權息'});
    const q = applyPosition(s0);
    const bad=[];
    if(q.shares !== 2000) bad.push(`20 筆權息之後股數變成 ${q.shares}，應該一動也不動`);
    if(q.unresolved !== 20) bad.push(`unresolved=${q.unresolved}，應該是 20`);
    if(q.divCash !== 0) bad.push(`divCash=${q.divCash}，權息合計不得當成現金股利`);
    return bad.join('; '); })},

{ id:'G16', sev:'S1', desc:'v58：畫面上每一個 onclick 引用的函式都必須是真的全域函式',
  /* 這一條是實際壞掉之後補的，而且它補的是**整個類別**，不是那一個 bug。
     v58 復原目標價面板時留下一個未閉合的 /* 註解，它一路吃到下一個結束標記，
     把 const TONE、function closeBig、function closeAllModals 三個宣告吃進註解裡。
     結果：目標價彈窗的「關閉」按鈕按了完全沒反應。
     而 node --check 通過（語法完全合法）、15 條定點不變量通過、100 組隨機情境通過——
     因為當時沒有任何一個測試按過「關閉」，也沒有任何一條檢查 onclick 指向的東西存不存在。
     inline onclick 的失敗是靜默的：瀏覽器只在 console 留一行，畫面上什麼都不會發生。 */
  run: p => p.evaluate(()=>{
    const bad = [];
    const seen = new Set();
    for(const el of document.querySelectorAll('[onclick]')){
      const code = el.getAttribute('onclick') || '';
      for(const m of code.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)){
        const fn = m[1];
        if(seen.has(fn)) continue; seen.add(fn);
        if(typeof window[fn] !== 'function')
          bad.push(`onclick="${code.slice(0,40)}" 指向的 ${fn} 不是全域函式（typeof = ${typeof window[fn]}）`);
      }
    }
    /* 同時守住那三個被吃掉的名字，就算它們哪天不再被 onclick 引用也要在。 */
    for(const n of ['closeModal','closeBig','closeGuide','closeAllModals','renderAll','openTxnPage'])
      if(typeof window[n] !== 'function') bad.push(`${n} 不是全域函式（typeof = ${typeof window[n]}）`);
    return bad.join('; '); })},

{ id:'G17', sev:'S1', desc:'v58：每一個彈窗都必須真的關得掉（不是只把 class 拿掉）',
  run: p => p.evaluate(async ()=>{ __reset();
    __mk('2330',{price:1000,cost:800,per:22,eps:45});
    const s = state.watchlist.find(x=>x.id==='2330');
    s.txns=[{id:'a',kind:'buy',date:'2024-01-05',shares:2000,price:800}]; s.txnsMigrated=true;
    applyPosition(s); state.selected='2330'; renderAll();
    const bad = [];
    const open = id => !document.getElementById(id).classList.contains('hidden');
    const cases = [
      ['bigModal', ()=>openTargetModal('2330'), ()=>closeBig()],
      ['bigModal', ()=>openTxnPage('2330'),     ()=>closeBig()],
      ['guideModal', ()=>openGuide('start'),    ()=>closeGuide()],
    ];
    for(const [id, show, hide] of cases){
      try{ show(); }catch(e){ bad.push(`${id} 打不開：${e.message}`); continue; }
      if(!open(id)){ bad.push(`${id} 呼叫開啟之後仍是關的`); continue; }
      try{ hide(); }catch(e){ bad.push(`${id} 關閉時丟例外：${e.message}`); continue; }
      if(open(id)) bad.push(`${id} 關不掉`);
      if(document.body.classList.contains('modal-open')) bad.push(`${id} 關掉之後 body 仍卡在 modal-open（頁面捲不動）`);
    }
    return bad.join('; '); })},

{ id:'G12', sev:'S1', desc:'未連線（demoMode=false、無 Token）時不得有任何由價格導出的數字',
  run: p => p.evaluate(()=>{ __reset(); state.demoMode=false; state.live=false;
    state.watchlist.filter(x=>['2330','2308','2383'].includes(x.id))
      .forEach(x=>{x.inWatch=true;x.cost=0;x.shares=1000;loadStockMock(x);});
    renderAll();
    const bad=[];
    if(document.getElementById('totalPnl').textContent.trim()!=='—') bad.push('totalPnl 有數字');
    if(document.getElementById('rhinoCount').textContent!=='0') bad.push('rhinoCount≠0');
    if(document.getElementById('crocCount').textContent!=='0') bad.push('crocCount≠0');
    if(/[0-9][0-9,]*\s*元/.test(document.getElementById('myPnlBody').textContent)) bad.push('首屏有金額');
    return bad.join('; '); })}
];

export async function runTargeted(p){
  await p.evaluate(PAGE_SRC); await p.evaluate(MK_SRC);
  const out = [];
  for(const t of TARGETED){
    let msg = '';
    try{ msg = await t.run(p) || ''; }catch(e){ msg = '(檢查器錯誤) ' + e.message; }
    out.push({ ...t, ok: !msg, msg });
  }
  return out;
}

/* ── CLI：node invariants.mjs [情境數] [亂數種子] ── */
if(import.meta.url === `file://${process.argv[1]}`){
  const N = +(process.argv[2] || 100), SEED = +(process.argv[3] || Date.now()%1e9);
  const { b, p, errs } = await launch();
  console.log('── 定點不變量 ──');
  for(const t of await runTargeted(p))
    console.log((t.ok?'  ok  ':'!!FAIL')+`  ${t.id} [${t.sev}] ${t.desc}` + (t.msg?`\n        ${t.msg}`:''));
  console.log(`\n── 產生式測試（${N} 組，seed=${SEED}）──`);
  const rng = mulberry32(SEED); const agg = new Map(); let bad = 0;
  for(let i=0;i<N;i++){
    const sc = genScenario(rng);
    let F; try{ F = await runScenario(p, sc); }catch(e){ console.log('RUNERR', i, e.message); continue; }
    const v = checkAll(F, sc); if(v.length) bad++;
    for(const x of v){
      if(!agg.has(x.id)) agg.set(x.id, { ...x, n:0, sample:null, sc:null });
      const a = agg.get(x.id); a.n++;
      if(!a.sample || x.hits.join('').length < a.sample.join('').length){ a.sample = x.hits; a.sc = sc; }
    }
  }
  console.log(`${bad}/${N} 組至少違反一條`);
  for(const [,a] of [...agg.entries()].sort())
    console.log(`\n[${a.sev}] ${a.id}  ${a.n}/${N}  ${a.desc}\n   · ` + a.sample.slice(0,3).join('\n   · '));
  console.log('\npage errors:', [...new Set(errs)].slice(0,5));
  
/* v87：我曾經在改動時把 techFrom() 的 `return out;` 砍掉，
   結果均線／布林全部變成 null，而它是靠另一支測試（target.mjs）偶然抓到的。
   純函式沒有回傳值是一種結構性錯誤，值得一條專門的守衛。 */
{
  const bad = await p.evaluate(()=>{
    const out=[];
    const cases = [
      ['techFrom', ()=>techFrom([1,2,3,4,5])],
      ['positionOf', ()=>positionOf({id:'x',txns:[],txnHide:[],txnsMigrated:true,data:{}})],
      ['shortState', ()=>shortState({price:1,targets:{shortBuy:1,shortSell:2}})],
      ['sharesOutstanding', ()=>sharesOutstanding({capStock:1e10,equity:5e10,pbr:2,price:100})],
      ['pnlOf', ()=>pnlOf({id:'x',txns:[],txnHide:[],txnsMigrated:true,data:{price:100}})],
      ['ttmFromYTD', ()=>ttmFromYTD(new Map([['2025-12-31',1],['2026-06-30',2],['2025-06-30',1]]))],
    ];
    cases.forEach(([n,f])=>{ let v; try{ v=f(); }catch(e){ out.push(n+' 丟出例外：'+e.message); return; }
      if(v === undefined) out.push(n+' 沒有回傳值'); });
    return out;
  });
  console.log(bad.length ? ('!!FAIL  純函式沒有回傳值：'+JSON.stringify(bad)) : '  ok    核心純函式都有回傳值');
  if(bad.length) process.exitCode = 1;
}
await b.close();
}
