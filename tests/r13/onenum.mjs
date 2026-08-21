/* v87：同一個持倉，全站三個地方必須是同一個數字。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await (await b.newContext({viewport:{width:390,height:900}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2400);
await p.evaluate(()=>{try{closeAllModals()}catch(e){}});
const r = await p.evaluate(()=>{
  const s=state.watchlist.find(x=>x.id==='2330'); s.inWatch=true; s.txnHide=[]; s.txnsMigrated=true;
  s.txns=[{id:'b',kind:'buy',date:'2024-01-05',shares:2000,price:800},
          {id:'s',kind:'sell',date:'2025-01-06',shares:1000,price:1000}];
  const ser=[],ph=[],t=new Date('2026-08-18');
  for(let k=900;k>=0;k--){ser.push({date:new Date(t-k*86400000).toISOString().slice(0,10),close:1000});ph.push(20);}
  applyStockData(s,{price:1000,eps:44,debt:.3,series:ser,asOf:'2026-08-18',per:20,perHist:ph,perAsOf:'2026-08-18',
    corpEvents:[{date:'2024-06-13',kind:'div',type:'息',amt:4.0}]},'live');
  applyPosition(s);
  state.watchlist.forEach(x=>{ if(x.id!=='2330') x.inWatch=false; });
  renderAll();
  const q=positionOf(s);
  const truth = Math.round(q.shares*1000 - q.cost + q.realized + q.divCash);
  const num = t => { const m=String(t).replace(/[−–]/g,'-').match(/-?[\d,]+/g)||[]; return m.map(x=>+x.replace(/,/g,'')); };
  const front=(document.getElementById('myPnlBody')||{}).innerText.replace(/\s+/g,' ');
  const total=(document.getElementById('totalPnl')||{}).textContent.trim();
  openTxnPage('2330');
  const txn=(document.getElementById('bigBody')||{}).innerText.replace(/\s+/g,' ');
  closeBig();
  return { truth, front, total, frontNums:num(front).slice(0,6),
           totalNum:num(total)[0],
           txnTotal:(txn.match(/到今天總共賺賠\s*[賺賠]\s*([\d,]+)/)||[])[1] };
});
console.log('   正確答案：', r.truth);
console.log('   首屏：', r.front.slice(0,120));
console.log('   區塊C：', r.total, '　交易紀錄頁：', r.txnTotal);
T('（前置）正確答案是 401,295', r.truth===401295, String(r.truth));
T('首屏印的是 401,295（不是只算未實現的 198,860）',
  r.frontNums.includes(401295), JSON.stringify(r.frontNums));
T('首屏沒有印出舊的錯誤數字 198,860', !r.frontNums.includes(198860), JSON.stringify(r.frontNums));
T('區塊 C 也是 401,295', r.totalNum===401295, String(r.totalNum));
T('交易紀錄頁也是 401,295', +String(r.txnTotal).replace(/,/g,'')===401295, String(r.txnTotal));
T('首屏有拆解成三筆', /三筆加起來/.test(r.front), r.front.slice(0,60));
T('拆解裡有已實現 194,435', /194,435/.test(r.front));
T('拆解裡有股利 8,000', /8,000/.test(r.front));

/* 沒有賣出也沒股利的人，行為不變 */
const plain = await p.evaluate(()=>{
  const s=state.watchlist.find(x=>x.id==='2330');
  s.txns=[{id:'b',kind:'buy',date:'2024-01-05',shares:2000,price:800}];
  applyStockData(s,{price:1000,eps:44,debt:.3,series:s.data.series,asOf:'2026-08-18',
    per:20,perHist:s.data.perHist,perAsOf:'2026-08-18',corpEvents:[]},'live');
  applyPosition(s); renderAll();
  return (document.getElementById('myPnlBody')||{}).innerText.replace(/\s+/g,' ');
});
T('沒賣過也沒股利時，仍然印百分比', /%/.test(plain), plain.slice(0,90));
T('沒賣過也沒股利時，不會冒出拆解那一行', !/三筆加起來/.test(plain));
T('全程沒有執行期錯誤', errs.length===0, errs.join(' | '));
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
