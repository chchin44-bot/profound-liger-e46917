import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
let fail=0;const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'PASS':'FAIL')+'  '+n+(x?'  '+x:''));};
for(const [w,h] of [[390,844],[360,780],[320,844]]){
 for(const fs of ['sm','mid','big']){
  const c=await b.newContext({viewport:{width:w,height:h}});
  const p=await c.newPage();const e=[];p.on('pageerror',x=>e.push(x.message));
  await p.goto('file://'+process.cwd()+'/index.html');await p.waitForTimeout(500);
  await p.evaluate(v=>{try{closeModal();closeGuide();}catch(_){}
    state.fontScale=v;applyFontScale();
    const s=state.watchlist.find(x=>x.id==='2356')||state.watchlist[0];
    /* v56：成本對話框已由交易紀錄頁取代。這一檔測的是同一件事——
       兩欄輸入框在三檔字級下必須對齊、說明必須預設收合、按鈕必須在畫面內。 */
    s.name='英業達';s.inWatch=true;s.txns=[{id:'a',kind:'buy',date:'2024-01-05',shares:50,price:69.7}];
    applyPosition(s);openTxnPage(s.id);},fs);
  await p.waitForTimeout(250);
  const r=await p.evaluate(()=>{
    const g=id=>{const el=document.getElementById(id);const r=el.getBoundingClientRect();
      return {top:Math.round(r.top),h:Math.round(r.height),fs:parseFloat(getComputedStyle(el).fontSize)};};
    const cost=g('txDate'), lots=g('txShares');
    /* v57：表單多了「這是什麼」的類型選擇器，兩個要對齊的標籤是 grid 裡的那兩個
       （哪一天／幾股）。取 grid 內的 .cd-lab，不是整頁的前兩個。 */
    const labs=[...document.querySelectorAll('#bigBody .grid .cd-lab')].map(e=>Math.round(e.getBoundingClientRect().top));
    const det=[...document.querySelectorAll('#bigBody details')];
    const box=document.querySelector('#bigModal > div');
    const acts=document.getElementById('txAdd').getBoundingClientRect();
    return {cost,lots, labTops:labs.slice(0,2), details:det.length, open:det.filter(d=>d.open).length,
      modalH:Math.round(box.getBoundingClientRect().height), vh:innerHeight,
      actionsVisible: acts.bottom<=innerHeight+1 && acts.top>=0,
      sw:document.documentElement.scrollWidth, cw:document.documentElement.clientWidth};});
  T(`${w}x${h} fs=${fs} 兩欄輸入框對齊`, r.cost.top===r.lots.top, `成本 y=${r.cost.top} / 股數 y=${r.lots.top}`);
  T(`${w}x${h} fs=${fs} 兩欄標籤對齊`, r.labTops[0]===r.labTops[1], JSON.stringify(r.labTops));
  T(`${w}x${h} fs=${fs} 說明預設收合`, r.details>=1 && r.open===0, `details=${r.details} open=${r.open}`);
  T(`${w}x${h} fs=${fs} 按鈕在畫面內`, r.actionsVisible, `彈窗高 ${r.modalH}/${r.vh}`);
  T(`${w}x${h} fs=${fs} 無橫向溢出`, r.sw-r.cw<=1, 'ov='+(r.sw-r.cw));
  if(e.length) T(`${w}x${h} fs=${fs} 無錯誤`, false, e[0]);
  await c.close();
 }
}
// 展開後仍可用
{const c=await b.newContext({viewport:{width:390,height:844}});const p=await c.newPage();
 await p.goto('file://'+process.cwd()+'/index.html');await p.waitForTimeout(500);
 const r=await p.evaluate(()=>{try{closeModal()}catch(e){}
   state.fontScale='big';applyFontScale();
   const s=state.watchlist[0];s.inWatch=true;s.txns=[];applyPosition(s);openTxnPage(s.id);
   document.querySelectorAll('#bigBody details').forEach(d=>d.open=true);
   document.getElementById('txDate').value='2021-03-01';
   document.getElementById('txKind').value='buy';
   document.getElementById('txShares').value='137';
   document.getElementById('txPrice').value='88.8';
   txnForce=true; txnAdd();
   const t=state.watchlist[0]; const q=positionOf(t);
   return {cost:+t.cost.toFixed(2), shares:t.shares, when:q.firstBuy};});
 T('展開說明後仍能記下一筆', Math.abs(r.cost-88.8)<0.2 && r.shares===137 && r.when==='2021-03-01', JSON.stringify(r));
 await c.close();}
console.log(fail?`\n❌ ${fail} 項失敗`:'\n✅ 全部通過');
await b.close();
