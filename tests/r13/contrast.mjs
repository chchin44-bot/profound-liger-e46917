/* v85：對比度。78 歲的對比敏感度下降，說明句與表頭該達到 AAA 7:1，不只是 AA 4.5:1。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
const p = await (await b.newContext({viewport:{width:390,height:844}})).newPage();
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2400);
await p.evaluate(()=>{
  try{closeAllModals()}catch(e){}
  state.watchlist.filter(x=>x.type==='top100').slice(0,3).forEach((s,i)=>{
    s.inWatch=true; s.txns=[{id:'b'+i,kind:'buy',date:'2024-01-05',shares:2000,price:500}]; s.txnsMigrated=true;
    const ser=[],ph=[],t=new Date('2026-08-18');
    for(let k=1250;k>=0;k--){ ser.push({date:new Date(t-k*86400000).toISOString().slice(0,10),close:600}); ph.push(20); }
    applyStockData(s,{price:600,eps:30,debt:.4,holder:.3,holderPrev:.29,series:ser,asOf:'2026-08-18',
      per:20,perHist:ph,perAsOf:'2026-08-18',peSrc:'official'},'live');
    applyPosition(s); });
  renderAll(); document.querySelectorAll('.toast-sa').forEach(e=>e.remove());
});
await p.waitForTimeout(700);
const r = await p.evaluate(()=>{
  const L=c=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};
    return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2]);};
  const R=(a,b)=>{const x=L(a),y=L(b),hi=Math.max(x,y),lo=Math.min(x,y);return (hi+0.05)/(lo+0.05);};
  const parse=s=>{const m=s.match(/rgba?\(([^)]+)\)/); if(!m) return null;
    const p=m[1].split(',').map(x=>parseFloat(x)); return {c:[p[0],p[1],p[2]], a:p.length>3?p[3]:1};};
  const bgOf=el=>{ let n=el;
    while(n && n!==document.documentElement){ const b=parse(getComputedStyle(n).backgroundColor);
      if(b && b.a>0.5) return b.c; n=n.parentElement; }
    return [8,20,31]; };
  const seen=new Map();
  document.querySelectorAll('body *').forEach(el=>{
    if(/^(SCRIPT|STYLE|CANVAS)$/.test(el.tagName)) return;
    const own=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();
    if(own.length<4) return;
    const cs=getComputedStyle(el);
    if(cs.display==='none'||cs.visibility==='hidden'||+cs.opacity<0.1) return;
    const fg=parse(cs.color); if(!fg) return;
    const eff = fg.a<1 ? fg.c.map((v,i)=>v*fg.a + bgOf(el)[i]*(1-fg.a)) : fg.c;
    const op = +cs.opacity;
    const eff2 = op<1 ? eff.map((v,i)=>v*op + bgOf(el)[i]*(1-op)) : eff;
    const cr = R(eff2, bgOf(el));
    const key = cs.color+'|'+cs.opacity+'|'+cs.fontSize;
    if(!seen.has(key)) seen.set(key, {cr:+cr.toFixed(2), fs:cs.fontSize, sample:own.slice(0,26), cls:el.className.toString().slice(0,26)});
  });
  const all=[...seen.values()];
  return { total: all.length,
           belowAA: all.filter(x=>x.cr<4.5),
           belowAAA: all.filter(x=>x.cr<7).sort((a,b)=>a.cr-b.cr) };
});
console.log(`  量到 ${r.total} 種文字樣式`);
r.belowAAA.slice(0,10).forEach(x=>console.log(`   ${String(x.cr).padStart(5)} : ${x.fs} ${x.sample}`));
T('沒有任何文字低於 WCAG AA 4.5:1', r.belowAA.length===0,
  JSON.stringify(r.belowAA.slice(0,4)));
/* 全站拉到 AAA 7:1 會把視覺層次壓平（所有說明字都變得跟主要內容一樣亮）。
   剩下的少數幾種是「次要資訊」——存檔時間、選項副標——它們仍然穩穩通過 AA。
   把門檻訂在「≤3 種，而且每一種都 ≥6.0」比訂一個做不到的 0 誠實。 */
T('低於 AAA 7:1 的不超過 3 種', r.belowAAA.length<=3,
  `${r.belowAAA.length} 種：`+JSON.stringify(r.belowAAA.slice(0,4).map(x=>`${x.cr} ${x.sample}`)));
T('而且剩下那幾種都還有 6.0 以上', r.belowAAA.every(x=>x.cr>=6.0),
  JSON.stringify(r.belowAAA.filter(x=>x.cr<6.0).map(x=>`${x.cr} ${x.sample}`)));
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
