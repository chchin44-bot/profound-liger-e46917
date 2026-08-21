/* v85：字級「大」時的兩個版面問題——手機卡片重疊、桌機表格被切掉且沒有線索。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
const seed = `(()=>{ state.watchlist.filter(x=>x.type==='top100').slice(0,3).forEach((s,i)=>{
  s.inWatch=true; s.txns=[{id:'b'+i,kind:'buy',date:'2024-01-05',shares:2000,price:801.14}]; s.txnsMigrated=true;
  const ser=[],ph=[],t=new Date('2026-08-18');
  for(let k=1250;k>=0;k--){ const px=1105*(1+Math.sin(k/61)*0.2);
    ser.push({date:new Date(t-k*86400000).toISOString().slice(0,10),close:+px.toFixed(2)}); ph.push(+(12+Math.abs(Math.sin(k/37))*30).toFixed(1)); }
  applyStockData(s,{price:1105,eps:44,debt:.42,holder:.31,holderPrev:.30,series:ser,asOf:'2026-08-18',
    per:24.5,perHist:ph,perAsOf:'2026-08-18',peSrc:'official',capStock:1e10,equity:5e10,pbr:2},'live');
  applyPosition(s); });
  renderAll(); document.querySelectorAll('.toast-sa').forEach(e=>e.remove()); })()`;

/* ① 手機 390 × 字級大：左右欄不可重疊 */
{
  const p = await (await b.newContext({viewport:{width:390,height:844}})).newPage();
  await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2300);
  await p.evaluate(s=>{ try{closeAllModals()}catch(e){}; eval(s);
    state.fontScale='big'; applyFontScale(); renderAll(); }, seed);
  await p.waitForTimeout(700);
  const r = await p.evaluate(()=>{
    const row=document.querySelector('#myPnl .pnl-row'); if(!row) return {none:true};
    const L=row.children[0].getBoundingClientRect(), R=row.children[1].getBoundingClientRect();
    const ox = Math.min(L.right,R.right)-Math.max(L.left,R.left);
    const oy = Math.min(L.bottom,R.bottom)-Math.max(L.top,R.top);
    const inner=row.children[0].querySelector('div:nth-child(2)');
    return { overlapX:Math.round(ox), overlapY:Math.round(oy),
             stacked: getComputedStyle(row).display==='block',
             innerOverflow: inner ? Math.round(inner.scrollWidth-inner.clientWidth) : null };
  });
  console.log('  [390/big]', JSON.stringify(r));
  T('[390/big] 左右欄改成上下排（不再硬擠一行）', r.stacked===true, String(r.stacked));
  T('[390/big] 兩欄不再重疊', !(r.overlapX>0 && r.overlapY>0), `${r.overlapX}x${r.overlapY}`);
  T('[390/big] 左欄內容沒有溢出', (r.innerOverflow||0)<=1, String(r.innerOverflow));
}
/* ② 桌機 1280 × 字級大：表格要嘛塞得下，要嘛給提示 */
for(const fs of ['sm','big']){
  const p = await (await b.newContext({viewport:{width:1280,height:900}})).newPage();
  await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2300);
  await p.evaluate(([s,f])=>{ try{closeAllModals()}catch(e){}; eval(s);
    state.fontScale=f; applyFontScale(); renderAll(); }, [seed,fs]);
  await p.waitForTimeout(900);
  const r = await p.evaluate(()=>{
    const w=document.querySelector('#wlBody')?.closest('.tblwrap');
    const cut = w ? Math.round(w.scrollWidth-w.clientWidth) : null;
    const hint = w && w.parentElement.querySelector('.scroll-hint');
    const act = [...document.querySelectorAll('#wlBody button')].find(x=>x.dataset.act==='target');
    const ar = act?act.getBoundingClientRect():null;
    return { cut, hintShown: hint ? getComputedStyle(hint).display!=='none' : false,
             actVisible: ar ? (ar.right <= (w?w.getBoundingClientRect().right:innerWidth)+1) : null };
  });
  console.log(`  [1280/${fs}]`, JSON.stringify(r));
  T(`[1280/${fs}] 表格塞得下，或有明確提示可左右滑`,
    r.cut<=2 || r.hintShown===true, `切掉 ${r.cut}px，提示=${r.hintShown}`);
  if(r.cut<=2) T(`[1280/${fs}] 「目標價」按鈕在可視範圍內`, r.actVisible===true);
}
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
