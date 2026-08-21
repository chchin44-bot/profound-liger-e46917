/* v85：出場參考的 EPS 要跟本益比同一天，不能拿今天的價格去除昨天的倍數。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await (await b.newContext({viewport:{width:900,height:900}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2300);
await p.evaluate(()=>{try{closeAllModals()}catch(e){}});
const rows = [];
for(const px of [700,1000,1500]){
  const r = await p.evaluate(px=>{
    const s=state.watchlist.find(x=>x.id==='2330'); s.inWatch=true;
    const ser=[],ph=[],t=new Date('2026-08-17');
    for(let k=1250;k>=0;k--){ ser.push({date:new Date(t-k*86400000).toISOString().slice(0,10),close:1000}); ph.push(20); }
    /* exitPanelHTML 需要 perRows（帶日期的本益比序列）才畫得出出場統計，
       那份只有 inWatch 的標的才會抓。夾具要給，不然整個面板回空字串，
       測試會「通過」但什麼都沒量到。 */
    const perRows = ser.map(x=>({date:x.date, per:20}));
    applyStockData(s,{price:1000,eps:50,debt:.3,series:ser,asOf:'2026-08-17',
      per:20,perHist:ph,perRows,perAsOf:'2026-08-17',peSrc:'official'},'live');
    applyPosition(s);
    /* 只換「現價」，官方本益比那一天的收盤仍是 1000 —— 模擬盤中跳動 */
    s.data.price = px; s.data.src='rt'; s.data.rtBaseAsOf='2026-08-17';
    state.selected='2330'; renderAll();
    const html = exitPanelHTML(s);
    const nums = (html.match(/\$[\d,]+\.?\d*/g)||[]).slice(0,6);
    return { nums, pct:(html.match(/[+−-]\d+\.\d%/g)||[]).slice(0,4),
             len: html.length, band: (()=>{ try{ const B=peBands(s.ind,s.data); return B&&B.basis; }catch(e){ return 'err'; } })() };
  }, px);
  rows.push({px, ...r});
  console.log(`  現價 ${px}：`, JSON.stringify(r).slice(0,150));
}
/* 出場價位是「本益比 × EPS」，EPS 錨在官方那一天 → 三種現價下價位應該完全相同 */
T('（前置）面板真的有畫出東西，這些檢查不是空過的',
  rows.every(r=>r.len>200 && r.nums.length>0), rows.map(r=>`${r.px}:len=${r.len},n=${r.nums.length}`).join(' '));
const same = rows.every(r=>JSON.stringify(r.nums)===JSON.stringify(rows[0].nums));
T('出場價位不隨盤中報價漂移（EPS 錨在官方本益比那一天）', same,
  rows.map(r=>`${r.px}→${(r.nums||[])[0]}`).join(' , '));
/* 但「距現價」必須隨現價改變——不然就是另一種錯（永遠印同一組） */
const pctDiffer = new Set(rows.map(r=>JSON.stringify(r.pct))).size === rows.length;
T('「距現價」的百分比會隨現價改變（不是永遠同一組）', pctDiffer,
  rows.map(r=>`${r.px}→${JSON.stringify(r.pct)}`).join(' , '));
T('全程沒有執行期錯誤', errs.length===0, errs.join(' | '));
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
