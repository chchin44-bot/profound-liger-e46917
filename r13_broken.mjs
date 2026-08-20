/* v72：本益比分位模型脫鉤時不得列出價位。
   用 2327 國巨 2026-08-18 的真實數字重現：EPS 14.88、現價 608、
   自身五年本益比區間 5.7~89.8（分位 9.5/12.6/17.1）→ 換算價 141/187/254，
   現價是「昂貴價」的 2.4 倍。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await (await b.newContext({viewport:{width:390,height:844}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
await p.goto('file:///mnt/user-data/working/index.html'); await p.waitForTimeout(2400);
await p.evaluate(()=>{try{closeModal()}catch(e){}});
/* v74：進階區塊改成預設收合，測試要跟真實使用者走同一步——先點開標題。 */
const openSec = async (kw) => { await p.evaluate(k=>{
  [...document.querySelectorAll('details.secfold')].forEach(d=>{ if(new RegExp(k).test(d.textContent)) d.open = true; });
}, kw); await p.waitForTimeout(300); };
await openSec('三維度目標價');


const setup = (opts) => p.evaluate(o=>{
  const s = state.watchlist.find(x=>x.id==='2330') || state.watchlist[0];
  s.id='2327'; s.name='國巨'; s.ind='電子零組件業'; s.inWatch=true; s.txnsMigrated=true;
  s.txns=[{id:'a',kind:'buy',date:'2024-01-05',shares:1000,price:o.cost}];
  const ser=[],ph=[]; const t=new Date('2026-08-17');
  for(let i=1250;i>=0;i--){
    const d=new Date(t-i*86400000);
    ser.push({date:d.toISOString().slice(0,10), close:o.price});
    /* 用「多數時間在低檔、少數時間噴高」的分布，逼近國巨實際的 5.7~89.8 倍區間：
       第 80 百分位只有十幾倍，但現在的本益比是 40 倍。 */
    ph.push(o.wide ? (i % 10 === 0 ? o.peLo + (i%97) : o.peLo + (i%9)) 
                   : o.peLo + Math.abs(Math.sin(i/37))*(o.peHi-o.peLo));
  }
  applyStockData(s,{price:o.price, eps:o.eps, debt:.4, holder:null, holderPrev:null, series:ser,
    asOf:'2026-08-17', per:+(o.price/o.eps).toFixed(2), pbr:3, perHist:ph, perAsOf:'2026-08-17'},'live');
  applyPosition(s); state.selected='2327'; renderAll();
  const tg = s.data.targets;
  return { broken:!!tg.longBroken, why:tg.longWhy, cheap:tg.cheap, fair:tg.fair, rich:tg.rich,
           peNow:tg.peNow, panel:document.getElementById('targetPanel').innerText.replace(/\s+/g,' ') };
}, opts);

/* ── 案例 A：國巨式 —— 本益比一路上修，現價遠高於換算區間 ── */
let r = await setup({ price:608, eps:14.88, cost:601, peLo:5.7, peHi:89.8, wide:true });

console.log(`   國巨式：換算價 ${r.cheap}/${r.fair}/${r.rich}、現價 608、目前本益比 ${r.peNow}`);
T('[國巨式] 判定為模型脫鉤', r.broken === true, JSON.stringify({broken:r.broken, why:r.why}));
T('[國巨式] 面板不再印出「合理參考價」的金額', !/合理參考價/.test(r.panel), r.panel.slice(0,90));
T('[國巨式] 明說「算不出有意義的長期價位」', /算不出有意義的長期價位/.test(r.panel));
T('[國巨式] 有解釋那三個數字不是目標價', /不是目標價/.test(r.panel));
T('[國巨式] 印出目前的本益比', r.peNow > 35 && new RegExp(String(r.peNow).replace('.','\\.')).test(r.panel), 'peNow='+r.peNow);
/* 手機版每一列預設收起來，位階那一格要展開才看得到 */
await p.evaluate(()=>{ state.openRows=['2327']; renderAll(); });
await p.waitForTimeout(400);
const row = await p.evaluate(()=>{
  const tr=[...document.querySelectorAll('#wlBody tr')].find(x=>x.innerText.includes('2327'));
  return tr ? tr.innerText.replace(/\s+/g,' ') : '';});
T('[國巨式] 表格列也不印那三個價位', !/便宜 \$/.test(row), row.slice(0,110));
T('[國巨式] 表格列改講「脫離歷史區間」', /脫離它自己的歷史區間/.test(row), row.slice(-70));

/* ── 案例 B：正常股 —— 本益比穩定、現價落在區間內，價位必須照印 ── */
r = await setup({ price:100, eps:5, cost:90, peLo:15, peHi:25, wide:false });
console.log(`   正常股：換算價 ${r.cheap}/${r.fair}/${r.rich}、現價 100、目前本益比 ${r.peNow||20}`);
T('[正常股] 不判定為脫鉤', r.broken === false, JSON.stringify({broken:r.broken}));
/* v93g：第二個條件驗的是「本益比低檔換算價」——那是 v93e 之前的舊標籤。
   v93e 改寫成「計算依據：EPS × N 倍（…）」之後，這條再也不可能為真：
   面板其實照印三個價位，測試卻紅了三個版本。改成驗它真正要驗的事。 */
T('[正常股] 照常印出三個價位',
  /便宜參考價/.test(r.panel) && /合理參考價/.test(r.panel) && /偏貴參考價/.test(r.panel), r.panel.slice(0,300));

T('全程沒有執行期錯誤', errs.length===0, errs.join(' | '));
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
