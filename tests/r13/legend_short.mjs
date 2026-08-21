/* v84：① 動物圖鑑裝回首頁（預設收合）② 超買／超賣露到清單上，而且找得到是誰。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await (await b.newContext({viewport:{width:1280,height:900}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
await p.goto('http://localhost:8251/index.html'); await p.waitForTimeout(2400);
await p.evaluate(()=>{try{closeAllModals()}catch(e){}});

/* ══ 動物圖鑑 ══ */
const lg = await p.evaluate(()=>{
  const d=[...document.querySelectorAll('details.secfold')].find(x=>x.getAttribute('data-sec')==='動物圖鑑');
  const g=document.getElementById('legendGrid');
  return { section:!!d, open:d&&d.open, cards:g?g.children.length:0,
           txt:g?g.textContent.replace(/\s+/g,' ').trim():'' };
});
T('首頁有「動物圖鑑」這一區', lg.section===true);
T('預設是收合的（不佔畫面）', lg.open===false, String(lg.open));
T('圖鑑真的有畫出內容（不是空殼）', lg.cards>=5, lg.cards+' 張卡');
T('圖鑑講得出鯨魚', /鯨魚/.test(lg.txt));
T('圖鑑講得出鱷魚', /鱷魚/.test(lg.txt));
T('圖鑑講得出沒有對照面的三隻', /沒有對照面的三隻/.test(lg.txt));
await p.evaluate(()=>{[...document.querySelectorAll('details.secfold')]
  .find(x=>x.getAttribute('data-sec')==='動物圖鑑').open=true;});
await p.waitForTimeout(300);
T('點開之後看得見', await p.evaluate(()=>document.getElementById('legendGrid').checkVisibility()));

/* ══ 短線超買／超賣 ══ */
const mk = (id,i,price,lo,hi) => ({id,i,price,lo,hi});
const r = await p.evaluate(()=>{
  const ids=['2330','2317','2454'];
  // 造三檔：超賣、超買、中性。用價格相對 20MA±2σ 的位置決定。
  const shapes=[
    {amp:0, last:800},    // 一路平盤然後最後一天暴跌 → 超賣
    {amp:0, last:1200},   // 最後一天暴衝 → 超買
    {amp:0, last:1000},   // 不動 → 中性
  ];
  const out={};
  ids.forEach((id,i)=>{
    const s=state.watchlist.find(x=>x.id===id); if(!s) return;
    s.inWatch=true;
    const ser=[],ph=[],t=new Date('2026-08-18');
    for(let k=600;k>=0;k--) ser.push({date:new Date(t-k*86400000).toISOString().slice(0,10),close:1000+(k%2?1:-1)*2});
    ser[ser.length-1].close=shapes[i].last;
    for(let k=0;k<601;k++) ph.push(20);
    applyStockData(s,{price:shapes[i].last,eps:44,debt:.3,series:ser,asOf:'2026-08-18',
      per:20,perHist:ph,perAsOf:'2026-08-18'},'live');
    applyPosition(s);
    out[id]=shortState(s.data);
  });
  state.watchlist.forEach(x=>{ if(!ids.includes(x.id)) x.inWatch=false; });
  renderAll();
  return out;
});
console.log('   三檔的短線位階：', JSON.stringify(r));
T('造得出「超賣」', r['2330']==='oversold', r['2330']);
T('造得出「超買」', r['2317']==='overbought', r['2317']);
T('造得出「中性」', r['2454']==='mid', r['2454']);

const tags = await p.evaluate(()=>[...document.querySelectorAll('#wlBody tr')].map(tr=>({
  /* 第一格裡有「百大企業」這種類型徽章，直接 slice(0,4) 會抓到它。
     要的是那個四位數代號，用 regex 從整列文字裡挑出來。 */
  id:((tr.textContent||'').match(/\b(\d{4})\b/)||[])[1],
  tags:[...tr.querySelectorAll('td[data-label="長線位階"] .tag')].map(x=>x.textContent.trim()) })));
console.log('   清單上的位階標籤：', JSON.stringify(tags));
T('超賣那檔在清單上就看得到「短線超賣」',
  tags.some(x=>x.id==='2330' && x.tags.some(t=>/短線超賣/.test(t))), JSON.stringify(tags[0]));
T('超買那檔在清單上就看得到「短線超買」',
  tags.some(x=>x.id==='2317' && x.tags.some(t=>/短線超買/.test(t))));
T('中性那檔不會多一個標籤（不製造雜訊）',
  tags.some(x=>x.id==='2454' && !x.tags.some(t=>/短線/.test(t))));

/* 沒有資料的那些，絕對不可以被說成「中性」——那是把「不知道」講成「知道」 */
const nod = await p.evaluate(()=>{
  const out = {};
  out.noTargets = shortState({ price:1000 });
  out.noPrice   = shortState({ targets:{shortBuy:990, shortSell:1010} });
  out.halfBand  = shortState({ price:1000, targets:{shortBuy:990, shortSell:null} });
  out.empty     = shortState(null);
  // 畫面上也不能因此冒出標籤
  const s = state.watchlist.find(x=>x.id==='2454');
  s.data.targets = null; renderAll();
  const tr = [...document.querySelectorAll('#wlBody tr')]
    .find(t=>/\b2454\b/.test(t.textContent||''));
  out.tags = tr ? [...tr.querySelectorAll('td[data-label="長線位階"] .tag')].map(x=>x.textContent.trim()) : null;
  return out;
});
console.log('   沒資料時：', JSON.stringify(nod));
T('沒有目標價時回 na，不會謊稱中性', nod.noTargets==='na', nod.noTargets);
T('沒有價格時回 na', nod.noPrice==='na', nod.noPrice);
T('通道只有半邊時也回 na（不猜另一半）', nod.halfBand==='na', nod.halfBand);
T('傳 null 進去不會炸，回 na', nod.empty==='na', nod.empty);
T('沒資料的那一列不會冒出任何短線標籤',
  nod.tags && !nod.tags.some(t=>/短線/.test(t)), JSON.stringify(nod.tags));

/* 篩選：找得到「是誰」 */
const f = await p.evaluate(()=>{
  const sel=document.getElementById('shortFilter');
  return { exists:!!sel, opts:sel?[...sel.options].map(o=>o.value):[] };
});
T('百大資料庫有「短線位階」篩選', f.exists===true);
T('篩選有超賣與超買兩個選項', f.opts.includes('oversold')&&f.opts.includes('overbought'), JSON.stringify(f.opts));

const filt = await p.evaluate(()=>{
  const all = state.watchlist.filter(x=>x.type==='top100');
  state.filter.short='oversold'; applyFilter();
  const shown = filteredList();
  const wrong = shown.filter(x=>!dataReal(x.data) || shortState(x.data)!=='oversold');
  state.filter.short=''; applyFilter();
  return { total:all.length, shown:shown.length, wrong:wrong.length,
           wrongIds:wrong.slice(0,3).map(x=>x.id) };
});
console.log('   篩「超賣」：', JSON.stringify(filt));
T('篩選會縮小範圍（不是全部都列出來）', filt.shown < filt.total, `${filt.shown}/${filt.total}`);
T('篩出來的每一檔都真的是超賣', filt.wrong===0, JSON.stringify(filt.wrongIds));

/* 上面那條在「剛好沒有任何示範值是超賣」時會空過——那正是最危險的假通過。
   把 shortState 暫時換成「一律回超賣」，逼所有標的都符合條件，
   這時還留在清單裡的就只可能是被 dataReal 那道閘門放行的。
   閘門若被拿掉，這裡會立刻看到一整排示範值。 */
const gate = await p.evaluate(()=>{
  const orig = window.shortState;
  window.shortState = () => 'oversold';
  state.filter.short='oversold'; applyFilter();
  const shown = filteredList();
  const mock = shown.filter(x=>!dataReal(x.data));
  const out = { shown:shown.length, mock:mock.length, mockIds:mock.slice(0,4).map(x=>x.id),
                allReal: shown.every(x=>dataReal(x.data)) };
  window.shortState = orig;
  state.filter.short=''; applyFilter();
  return out;
});
console.log('   （強制全部符合條件）：', JSON.stringify(gate));
T('（前置）強制之後確實有東西被列出來，這條檢查不是空過的', gate.shown>0, gate.shown+' 檔');
T('即使全部都符合條件，示範值一檔都不得混入超賣清單', gate.mock===0, JSON.stringify(gate.mockIds));
T('列出來的每一檔都是真實資料', gate.allReal===true);

T('全程沒有執行期錯誤', errs.length===0, errs.join(' | '));
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
