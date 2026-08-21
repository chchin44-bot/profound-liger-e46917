/* v87：#4 兩個分頁、#5 區塊B閘門、#6 抓取中止後卡在 loading。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};

/* ── #4 兩個分頁 ── */
{
  const ctx = await b.newContext({viewport:{width:390,height:844}});
  const A = await ctx.newPage(); await A.goto('http://localhost:8251/index.html'); await A.waitForTimeout(2400);
  await A.evaluate(()=>{try{closeAllModals()}catch(e){}
    const s=state.watchlist.find(x=>x.id==='2330'); s.inWatch=true;
    s.txns=[{id:'a',kind:'buy',date:'2024-01-05',shares:5000,price:800}]; s.txnsMigrated=true;
    applyPosition(s); state.autoSave=true; persist();});
  const B = await ctx.newPage(); await B.goto('http://localhost:8251/index.html'); await B.waitForTimeout(2400);
  await B.evaluate(()=>{try{closeAllModals()}catch(e){}
    const s=state.watchlist.find(x=>x.id==='2308'); s.inWatch=true;
    s.txns=[{id:'b',kind:'buy',date:'2024-02-05',shares:2000,price:300}]; s.txnsMigrated=true;
    applyPosition(s); persist();});
  await A.waitForTimeout(900);
  const warn = await A.evaluate(()=>({
    modal: !document.getElementById('modal').classList.contains('hidden'),
    title: (document.getElementById('modalTitle')||{}).textContent||'',
    autoSave: state.autoSave }));
  console.log('  分頁 A：', JSON.stringify(warn));
  T('[兩個分頁] 舊分頁會被告知資料在別處改過', warn.modal===true, JSON.stringify(warn));
  T('[兩個分頁] 標題講清楚是什麼事', /另一個分頁被改過/.test(warn.title), warn.title);
  T('[兩個分頁] 先暫停舊分頁的自動儲存（止血）', warn.autoSave===false);
  /* 舊分頁不可以再蓋掉新的 */
  await A.evaluate(()=>{ try{closeModal()}catch(e){}; state.page=1; persist(); });
  await A.waitForTimeout(300);
  const C = await ctx.newPage(); await C.goto('http://localhost:8251/index.html'); await C.waitForTimeout(2400);
  const kept = await C.evaluate(()=>watchItems().map(x=>x.id+':'+positionOf(x).shares).join(','));
  console.log('  分頁 C 看到：', kept);
  T('[兩個分頁] 新分頁存的資料沒有被蓋掉', /2308:2000/.test(kept), kept);
  T('[兩個分頁] 舊分頁的資料也還在', /2330:5000/.test(kept), kept);
  await ctx.close();
}

/* ── #5 區塊 B 的閘門 ── */
{
  const p = await (await b.newContext({viewport:{width:390,height:900}})).newPage();
  await p.goto('http://localhost:8251/index.html'); await p.waitForTimeout(2300);
  const r = await p.evaluate(()=>{
    try{closeAllModals()}catch(e){}
    ['2330','2308'].forEach((id,i)=>{
      const s=state.watchlist.find(x=>x.id===id); s.inWatch=true;
      s.txns=[{id:'b'+i,kind:'buy',date:'2020-01-05',shares:1000,price:100}]; s.txnsMigrated=true;
      const ser=[],ph=[],t=new Date('2026-05-10');   // 100 天前
      for(let k=400;k>=0;k--){ser.push({date:new Date(t-k*86400000).toISOString().slice(0,10),close:[1000,400][i]});ph.push(20);}
      applyStockData(s,{price:[1000,400][i],eps:50,debt:.3,series:ser,asOf:'2026-05-10',
        per:20,perHist:ph,perAsOf:'2026-05-10'},'live');
      applyPosition(s);
    });
    state.watchlist.forEach(x=>{ if(!['2330','2308'].includes(x.id)) x.inWatch=false; });
    renderAll();
    const bb=(document.getElementById('blockB')||document.getElementById('allocRows')||{});
    /* 只看區塊 B 自己，不要掃全頁——動物圖鑑裡本來就寫著「貪婪集中警示」，
       用 document.body 去比對會抓到說明文字，永遠是 true。 */
    const sec = document.getElementById('blockB') ||
      [...document.querySelectorAll('section')].find(x=>/資產配置|佔比/.test(x.textContent));
    const secTxt = sec ? sec.textContent.replace(/\s+/g,' ') : '';
    return { blockB: secTxt.slice(0,160),
             rows: sec ? sec.querySelectorAll('[data-alloc-row], .alloc-row').length : -1,
             pig: /貪婪集中警示/.test(secTxt),
             pct: /\d+\.\d%/.test(secTxt),
             totalPnl:(document.getElementById('totalPnl')||{}).textContent.trim() };
  });
  console.log('  區塊B：', JSON.stringify(r).slice(0,220));
  T('[100天前的資料] 區塊 C 不算（跟首屏一致）', r.totalPnl==='—', r.totalPnl);
  T('[100天前的資料] 區塊 B 不再印出貪婪集中警示', !r.pig, r.blockB.slice(0,90));
T('[100天前的資料] 區塊 B 不再印出佔比百分比', !r.pct, r.blockB.slice(0,90));
T('[100天前的資料] 排除的理由講對了（是太舊，不是示範值）',
  /資料太舊/.test(r.blockB) && !/全是示範值/.test(r.blockB), r.blockB.slice(0,120));
}

/* ── #6 抓取中止 ── */
{
  const ctx = await b.newContext({viewport:{width:390,height:844}});
  /* 每個請求延遲 300ms（一檔要打 9 次，2.5 秒 × 9 ＝ 22 秒，
     第一版等 3.5 秒就斷言，量到的是「還在跑」不是「卡住」）。 */
  await ctx.route('**/api.finmindtrade.com/**', async route=>{
    await new Promise(r=>setTimeout(r,300));
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({msg:'success',status:200,data:[]})});
  });
  const p = await ctx.newPage(); await p.goto('http://localhost:8251/index.html'); await p.waitForTimeout(2300);
  const r = await p.evaluate(async ()=>{
    try{closeAllModals()}catch(e){}
    state.live=true; state.token='ey.T';
    const s={id:'6666',name:'測試',ind:'其他',type:'user',inWatch:true,cost:100,shares:1000,
             txns:[],txnHide:[],txnsMigrated:true,data:{},loaded:false};
    state.watchlist.push(s);
    fetchOneLive(s);                       // 不 await，讓它還在跑
    await new Promise(r=>setTimeout(r,300));
    const during = s.data.src;
    invalidateGeneration();                // 模擬使用者刪掉別的標的
    await new Promise(r=>setTimeout(r,6000));
    return { during, after: s.data.src, gen:state.gen };
  });
  console.log('  中止後：', JSON.stringify(r));
  T('[中止] 抓取中確實是 loading', r.during==='loading', r.during);
  T('[中止] 中止之後不會永遠卡在「抓取中」', r.after!=='loading', r.after);
  await ctx.close();
}
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
