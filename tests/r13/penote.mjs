/* v83：本益比欄的說明句必須貼在數字底下，不能被欄寬拋到畫面另一邊。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
const p = await (await b.newContext({viewport:{width:1280,height:900}})).newPage();
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2200);
await p.evaluate(()=>{try{closeAllModals()}catch(e){}});
await p.evaluate(()=>{
  state.watchlist.filter(x=>x.type==='top100').slice(0,3).forEach((s,i)=>{
    s.inWatch=true; s.cost=[599.95,69.70,28.18][i]; s.shares=[30,50,13000][i]; s.txns=null; s.txnsMigrated=false;
    const ser=[],ph=[],t=new Date('2026-08-17');
    for(let k=1200;k>=0;k--){ const px=[608,66.7,27.85][i]*(1+Math.sin(k/61)*0.3);
      ser.push({date:new Date(t-k*86400000).toISOString().slice(0,10),close:+px.toFixed(2)}); ph.push(+(5.7+Math.abs(Math.sin(k/37))*84).toFixed(1)); }
    applyStockData(s,{price:[608,66.7,27.85][i],eps:[15,3,1][i],debt:[.647,.836,.698][i],
      holder:.3,holderPrev:.29,series:ser,asOf:'2026-08-17',per:[40.9,21.5,12][i],perHist:ph,
      perAsOf:'2026-08-17',peSrc:'official'},'live');
    applyPosition(s);
  });
  renderAll();
});
await p.waitForTimeout(600);
const r = await p.evaluate(()=>{
  const out=[];
  document.querySelectorAll('#wlBody .pe-note').forEach(n=>{
    const td=n.closest('td'); if(!td) return;
    const num=[...td.childNodes].find(x=>x.nodeType===3 && x.textContent.trim());
    const rg=document.createRange(); if(num) rg.selectNodeContents(num);
    const nr = num? rg.getBoundingClientRect() : td.getBoundingClientRect();
    const pr = n.getBoundingClientRect();
    out.push({ note:n.textContent.trim().slice(0,20),
      numRight:Math.round(nr.right), noteLeft:Math.round(pr.left), noteRight:Math.round(pr.right),
      gap:Math.round(nr.right-pr.right), width:Math.round(pr.width) });
  });
  return out;
});
r.forEach(x=>console.log('  ', JSON.stringify(x)));
T('說明句有出現', r.length>0, String(r.length));
T('說明句的右緣貼齊數字（相差 <30px）', r.every(x=>Math.abs(x.gap)<30), JSON.stringify(r.map(x=>x.gap)));
T('說明句寬度有上限（不會撐開整欄）', r.every(x=>x.width<=240), JSON.stringify(r.map(x=>x.width)));
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
