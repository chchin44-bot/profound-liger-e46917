import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
for(const fs of ['sm','mid','big']){
  const p = await (await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2})).newPage();
  await p.goto('http://localhost:8251/index.html'); await p.waitForTimeout(2300);
  const r = await p.evaluate(f=>{
    try{closeAllModals()}catch(e){}
    ['2330','2308','2383'].forEach((id,i)=>{
      const s=state.watchlist.find(x=>x.id===id); s.inWatch=true;
      s.txns=[{id:'b'+i,kind:'buy',date:'2024-01-05',shares:9000,price:1150},
              {id:'s'+i,kind:'sell',date:'2025-06-01',shares:2000,price:900}];
      /* 用大金額：三格裡最右邊那格的數字最長，窄欄最容易撐破 */
      s.txnsMigrated=true;
      const ser=[],ph=[],t=new Date('2026-08-18');
      for(let k=600;k>=0;k--){ser.push({date:new Date(t-k*86400000).toISOString().slice(0,10),close:640});ph.push(20);}
      applyStockData(s,{price:640,eps:5,debt:[0.65,0.72,0.30][i],series:ser,asOf:'2026-08-18',
        per:20,perHist:ph,perAsOf:'2026-08-18'},'live');
      applyPosition(s);
    });
    state.fontScale=f; applyFontScale(); renderAll();
    document.querySelectorAll('.toast-sa').forEach(e=>e.remove());
    const grid=[...document.querySelectorAll('#rhinoCount')][0].closest('.grid');
    const cards=[...grid.children];
    const out=cards.map((c,i)=>{
      const cr=c.getBoundingClientRect();
      const kids=[...c.querySelectorAll('*')];
      const over=Math.max(0,...kids.map(k=>Math.round(k.getBoundingClientRect().bottom-cr.bottom)));
      const oh=Math.max(0,...kids.map(k=>Math.round(k.getBoundingClientRect().right-cr.right)),
                          ...kids.map(k=>Math.round(cr.left-k.getBoundingClientRect().left)));
      const scrollX=Math.max(0,...kids.map(k=>k.scrollWidth-k.clientWidth));
      return { i, h:Math.round(cr.height), overflowBottom:over, overflowSide:oh, innerScrollX:scrollX,
               txt:c.textContent.replace(/\s+/g,' ').trim().slice(0,34) };
    });
    const heights=cards.map(c=>Math.round(c.getBoundingClientRect().height));
    return { cards:out, sameHeight: new Set(heights).size===1, heights,
             brk:(document.getElementById('totalPnlBreak')||{}).textContent.replace(/\s+/g,' ').slice(0,90) };
  }, fs);
  console.log(`[${fs}]`, JSON.stringify(r.cards), 'sameH=',r.sameHeight, r.heights);
  console.log(`     拆解：`, r.brk);
  await p.screenshot({path:`./tests/r13/blockc_${fs}.png`, fullPage:false});
}
await b.close();
