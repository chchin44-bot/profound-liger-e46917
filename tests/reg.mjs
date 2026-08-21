import { chromium } from 'playwright';
const F='file://'+process.cwd()+'/index.html';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const errs=[];
async function page(w=1280,h=900){
  const c=await b.newContext({viewport:{width:w,height:h}});
  const p=await c.newPage();
  p.on('pageerror',e=>errs.push(w+': '+e.message));
  p.on('dialog',d=>d.dismiss());
  await p.goto(F); await p.waitForTimeout(700);
  await p.evaluate(()=>{ try{closeModal()}catch(e){} });
  return {c,p};
}
const {c,p}=await page();

// T1: 首屏面板存在且在最前
const t1=await p.evaluate(()=>{
  const el=document.getElementById('myPnl');
  if(!el) return {ok:false};
  const r=el.getBoundingClientRect();
  return {ok:true, top:Math.round(r.top+window.scrollY), text:document.getElementById('myPnlBody').innerText.slice(0,120)};
});
console.log('T1 首屏面板', JSON.stringify(t1));

// T2: 未連線 -> 不出現任何金額
console.log('T2 未連線無金額:', !/[0-9],[0-9]{3} 元/.test(t1.text) ? 'PASS' : 'FAIL '+t1.text);

// T3: 注入真實資料後的損益面板
const t3=await p.evaluate(()=>{
  const mk=(id,name,price,cost,shares)=>{
    const s=state.watchlist.find(x=>x.id===id);
    /* v61：成本與股數由交易帳本推導（invariants G13 守這件事），
       直接寫 s.cost 已經沒有作用。這裡改成給帳本一筆買進，
       fee:0 讓金額跟舊版斷言一致（舊版的成本價本來就不含手續費）。 */
    s.inWatch=true; s.txnsMigrated=true;
    s.txns=[{id:'r'+id,kind:'buy',date:'2024-01-05',shares,price:cost,fee:0}];
    const series=[]; const today=new Date('2026-08-14');
    for(let i=300;i>=0;i--){ const d=new Date(today-i*86400000);
      series.push({date:d.toISOString().slice(0,10), close:+(price*(1+Math.sin(i/17)*0.05)).toFixed(2)}); }
    series[series.length-1].close=price;
    applyStockData(s,{price,eps:price/18,debt:0.35,holder:70,holderPrev:69,series,
      asOf:'2026-08-14',per:18,pbr:4,divYield:2,perHist:Array.from({length:1200},(_,i)=>12+ (i%40)/4),
      perAsOf:'2026-08-14'},'live');
  };
  mk('2330','台積電',1000,800,2000);
  mk('2308','台達電',400,500,1000);
  state.watchlist.forEach(x=>{ if(x.inWatch) applyPosition(x); });
  renderAll();
  const t=document.getElementById('myPnlBody').innerText;
  return {text:t, totalPnl:document.getElementById('totalPnl').innerText};
});
console.log('T3 面板文字:\n'+t3.text.split('\n').slice(0,10).join('\n'));
console.log('T3 組合總損益:', t3.totalPnl);
// 2000*(1000-800)=+400000 ; 1000*(400-500)=-100000 ; net +300000
console.log('T3 金額正確:', t3.text.includes('賺 30 萬元') ? 'PASS':'FAIL');
console.log('T3 萬元口語:', t3.text.includes('30 萬元') ? 'PASS':'FAIL');
console.log('T3 blockC 有金額:', /\+300,000 元/.test(t3.totalPnl)?'PASS':'FAIL '+t3.totalPnl);

// T4: 紀律檢查文案
// 第十二輪 R2：買進前檢查／賣出前檢查（handleTrade）整個刪除。
// 那個面板裡最大的字是「便宜時別賣、昂貴時別買、虧超過 15% 別攤平」與「不追高不殺低」——
// 十一輪宣稱刪光祈使句，實際上它們一直在。這條斷言守它不得復活。
const t4=await p.evaluate(()=>({
  fn: typeof handleTrade,
  btns: [...document.querySelectorAll('#wlBody button')].map(b=>b.textContent.trim()),
  body: document.body.innerText }));
console.log('T4 handleTrade 已刪除:', t4.fn==='undefined' ? 'PASS':'FAIL '+t4.fn);
/* v61：目標價按鈕依作者要求復原，所以不再列入禁止清單。
   買進前檢查／賣出前檢查（handleTrade）仍然不得復活——那個面板裡最大的字是
   「便宜時別賣、昂貴時別買、虧超過 15% 別攤平」，是十一輪宣稱刪光卻一直都在的祈使句。 */
console.log('T4 表格無買賣前檢查鈕:', !t4.btns.some(x=>/買進前|賣出前/.test(x)) ? 'PASS':'FAIL '+JSON.stringify(t4.btns));
console.log('T4 無祈使句:', !/別攤平|不追高不殺低|便宜時別賣/.test(t4.body) ? 'PASS':'FAIL');

// T5: 動物 vs 燈號一致（A1-A3）
const t5=await p.evaluate(()=>{
  const rows=[...document.querySelectorAll('#wlBody tr')].map(r=>({
    lvl:r.getAttribute('data-level'), txt:r.innerText.replace(/\n/g,' ')}));
  return rows;
});
const bad=t5.filter(r=>(r.lvl==='cheap'&&/🐖/.test(r.txt))||(r.lvl==='rich'&&/🐂/.test(r.txt)));
console.log('T5 動物燈號矛盾:', bad.length===0?'PASS':'FAIL '+JSON.stringify(bad));

// T6: snapshot 快取往返
const t6=await p.evaluate(()=>{
  const snap=JSON.parse(JSON.stringify(snapshot()));
  const bytes=JSON.stringify(snap).length;
  const hasD=snap.watch.filter(w=>w.d).length;
  // 模擬重新整理
  state.watchlist.forEach(x=>{ x.loaded=false; x.data={}; });
  const n=applySnapshot(snap,{trusted:true});
  renderAll();
  const s=state.watchlist.find(x=>x.id==='2330');
  return {bytes,hasD,n,price:s.data.price,src:s.data.src,perHist:(s.data.perHist||[]).length,
    series:(s.data.series||[]).length, dashes:(document.body.innerText.match(/—/g)||[]).length,
    panel:document.getElementById('myPnlBody').innerText.slice(0,80)};
});
console.log('T6 快取:', JSON.stringify(t6));
console.log('T6 還原成功:', (t6.price===1000 && t6.src==='stale' && t6.perHist>1000)?'PASS':'FAIL');

// T7: 黑天鵝兩種模式
const t7=await p.evaluate(()=>{
  state.swanMode='add'; runBlackSwan(); const a=document.getElementById('swanText').innerText;
  state.swanMode='draw'; runBlackSwan(); const d=document.getElementById('swanText').innerText;
  return {add:a.slice(0,150), draw:d.slice(0,150), drawFull:d};
});
console.log('T7 add:', t7.add.replace(/\n/g,' | ').slice(0,120));
console.log('T7 draw:', t7.draw.replace(/\n/g,' | ').slice(0,120));
console.log('T7 提領模式生效:', /提領/.test(t7.drawFull)?'PASS':'FAIL');
console.log('T7 報酬順序風險:', /報酬順序風險/.test(t7.drawFull)?'PASS':'FAIL');

// T8: quizGood 讀取
const t8=await p.evaluate(()=>{ answerQuiz(0,'no'); answerQuiz(1,'no'); answerQuiz(2,'no');
  return document.getElementById('quizSummary').innerText; });
console.log('T8 quizGood:', /🦉/.test(t8)?'PASS':'FAIL '+t8.slice(0,100));

// T9: exitStats
const t9=await p.evaluate(()=>{
  const s=state.watchlist.find(x=>x.id==='2330');
  const es=exitStats(s.data);
  return es ? {cur:es.cur, unpre:es.unprecedented, rows:(es.rows||[]).map(r=>({h:r.h,n:r.n,seg:r.seg,mdd:r.mdd,mddMed:r.mddMed}))} : null;
});
console.log('T9 exitStats:', JSON.stringify(t9));

// T10: 多寬度溢出
for(const w of [320,360,390,768,1280,1920]){
  const {c:cc,p:pp}=await page(w,900);
  await pp.evaluate(()=>{ const s=state.watchlist.find(x=>x.id==='2330'); });
  const o=await pp.evaluate(()=>({sw:document.documentElement.scrollWidth, cw:document.documentElement.clientWidth}));
  console.log(`T10 ${w}px overflow=${o.sw-o.cw}`, (o.sw-o.cw)<=1?'PASS':'FAIL');
  await cc.close();
}

// T11: text-size-adjust
const t11=await p.evaluate(()=>getComputedStyle(document.documentElement).webkitTextSizeAdjust||getComputedStyle(document.documentElement).textSizeAdjust);
console.log('T11 text-size-adjust:', t11);

console.log('\nPAGE ERRORS:', errs.length? errs : 'none');
await b.close();
