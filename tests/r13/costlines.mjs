/* v84：標的欄的名稱／成本／股數要各自一行。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
const run = async (vp, label) => {
  const ctx = await b.newContext({ viewport: vp });
  const p = await ctx.newPage();
  await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2200);
  await p.evaluate(()=>{try{closeAllModals()}catch(e){}});
  await p.evaluate(()=>{
    const s=state.watchlist.find(x=>x.id==='2330'); s.inWatch=true;
    s.txns=[{id:'a',kind:'buy',date:'2024-01-05',shares:30,price:599.95}]; s.txnsMigrated=true;
    const ser=[],ph=[],t=new Date('2026-08-18');
    for(let k=600;k>=0;k--){ser.push({date:new Date(t-k*86400000).toISOString().slice(0,10),close:576});ph.push(40);}
    applyStockData(s,{price:576,eps:14,debt:.6,series:ser,asOf:'2026-08-18',per:40.9,perHist:ph,perAsOf:'2026-08-17'},'live');
    applyPosition(s); renderAll();
  });
  await p.waitForTimeout(500);
  const r = await p.evaluate(()=>{
    const box=(sel)=>{const e=document.querySelector('#wlBody '+sel); if(!e) return null;
      const b=e.getBoundingClientRect(); return {t:Math.round(b.top),h:Math.round(b.height),
        txt:e.textContent.trim(),d:getComputedStyle(e).display};};
    return { name:box('.c-name'), cost:box('.c-cost'), shares:box('.c-shares') };
  });
  console.log(`  [${label}]`, JSON.stringify(r));
  T(`[${label}] 名稱、成本、股數三個都在`, r.name&&r.cost&&r.shares);
  T(`[${label}] 三個都是獨立一行（display:block）`,
    [r.name,r.cost,r.shares].every(x=>x&&x.d==='block'), JSON.stringify([r.name?.d,r.cost?.d,r.shares?.d]));
  T(`[${label}] 成本在名稱下面（不同一行）`, r.cost.t > r.name.t, `${r.name.t} → ${r.cost.t}`);
  T(`[${label}] 股數在成本下面（不同一行）`, r.shares.t > r.cost.t, `${r.cost.t} → ${r.shares.t}`);
  T(`[${label}] 成本那行寫的是成本`, /^成本/.test(r.cost.txt), r.cost.txt);
  T(`[${label}] 股數那行寫的是股數`, /股/.test(r.shares.txt), r.shares.txt);
  T(`[${label}] 中間沒有殘留的分隔點`, !/·/.test(r.cost.txt) && !/·/.test(r.shares.txt),
    r.cost.txt+' | '+r.shares.txt);
  /* 隱私模式要同時遮住這兩行 */
  await p.evaluate(()=>setPrivacy(true)); await p.waitForTimeout(300);
  const pv = await p.evaluate(()=>({
    cost:document.querySelector('#wlBody .c-cost').textContent,
    shares:document.querySelector('#wlBody .c-shares').textContent }));
  T(`[${label}] 隱私模式遮住成本`, !/599|600/.test(pv.cost), pv.cost);
  T(`[${label}] 隱私模式遮住股數`, !/30/.test(pv.shares), pv.shares);
  await ctx.close();
};
await run({width:1395,height:900}, '桌機');
await run({width:390,height:844}, '手機');
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
