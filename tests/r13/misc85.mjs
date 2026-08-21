/* v85 雜項修正：稅率第二份副本、配息年數、減資退款、離線徽章、營業員隱私、文案重複字。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const ctx = await b.newContext({viewport:{width:390,height:844}});
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2300);
await p.evaluate(()=>{try{closeAllModals()}catch(e){}});

/* ① 證交稅率只有一份 */
const tax = await p.evaluate(()=>({
  common: txnTaxRate('2330'), etf: txnTaxRate('0050'), bond: txnTaxRate('00679B'),
}));
console.log('  ', JSON.stringify(tax));
T('一般股 0.3%', tax.common===0.003);
T('股票 ETF 0.1%', tax.etf===0.001);
T('債券 ETF 停徵 0%', tax.bond===0, String(tax.bond));

/* ② 配息年數用「不同年份數」，不是跨距+1 */
const dv = await p.evaluate(()=>{
  const evs=[]; // 五年、季配、每季 3.4375 元 → 共 68.75
  for(let y=2021;y<=2025;y++) for(const md of ['-03-15','-06-15','-09-15','-12-15'])
    evs.push({kind:'div', type:'息', amt:3.4375, date:y+md});
  return divPerShare(evs);
});
console.log('  ', JSON.stringify(dv));
T('五年季配息算成 5 年（不是 6 年）', dv.yrs===5, String(dv.yrs));
T('平均一年 13.75 元（不是 11.46）', Math.abs(dv.perYear-13.75)<0.01, String(dv.perYear));

/* ③ 減資退還股款超過成本時，差額進已實現，不會消失 */
const rd = await p.evaluate(()=>{
  const s={id:'9999',name:'測試',ind:'其他',inWatch:true,cost:0,shares:0,txnHide:[],txnsMigrated:true,
    txns:[{id:'b',kind:'buy',date:'2024-01-05',shares:1000,price:1}],
    data:{corpEvents:[{date:'2025-01-10',kind:'cut',before:6,after:1.25,reason:'現金減資退還股款'}]}};
  const q=positionOf(s);
  return {shares:q.shares, cost:Math.round(q.cost), realized:Math.round(q.realized),
          txns:q.txns.map(t=>({k:t.kind,p:t.price,r:t.ratio}))};
});
console.log('  ', JSON.stringify(rd));
T('減資退款超過成本時，差額有進已實現（不是憑空消失）', rd.realized > 0, JSON.stringify(rd));
T('成本不會變成負數', rd.cost >= 0, String(rd.cost));

/* ④ 營業員電話在隱私模式下遮起來 */
const bk = await p.evaluate(()=>{
  state.brokerName='王小姐'; state.brokerTel='0912-345-678';
  setPrivacy(false); renderBrokerBtn(); const open=document.getElementById('brokerBtn').textContent;
  setPrivacy(true); renderBrokerBtn(); const hid=document.getElementById('brokerBtn').textContent;
  setPrivacy(false);
  return {open, hid};
});
console.log('  ', JSON.stringify(bk));
T('平常看得到姓名電話', /王小姐/.test(bk.open) && /0912/.test(bk.open));
T('隱私模式遮掉姓名與電話', !/王小姐/.test(bk.hid) && !/0912/.test(bk.hid), bk.hid);
T('遮掉之後按鈕仍看得懂', /營業員/.test(bk.hid), bk.hid);

/* ⑤ 首屏文案不再「總共賺　賺」 */
const hd = await p.evaluate(()=>{
  const s=state.watchlist.find(x=>x.id==='2330'); s.inWatch=true;
  s.txns=[{id:'b',kind:'buy',date:'2024-01-05',shares:2000,price:500}]; s.txnsMigrated=true;
  const ser=[],ph=[],t=new Date('2026-08-18');
  for(let k=600;k>=0;k--){ser.push({date:new Date(t-k*86400000).toISOString().slice(0,10),close:800});ph.push(20);}
  applyStockData(s,{price:800,eps:40,debt:.3,series:ser,asOf:'2026-08-18',per:20,perHist:ph,perAsOf:'2026-08-18'},'live');
  applyPosition(s); state.watchlist.forEach(x=>{if(x.id!=='2330')x.inWatch=false;}); renderAll();
  return (document.getElementById('myPnl')||{}).innerText.replace(/\s+/g,' ');
});
console.log('  ', hd.slice(0,80));
T('不會出現「總共賺 賺」這種重複', !/總共\s*[賺賠]\s*[賺賠]/.test(hd), hd.slice(0,60));
T('大字仍然講得出賺賠', /[賺賠]\s?[\d.]+/.test(hd), hd.slice(0,60));

/* ⑥ 離線時徽章不可以說「已連線」 */
await p.evaluate(()=>{ state.live=true; setConnBadge('live'); });
await ctx.setOffline(true);
const off = await p.evaluate(async ()=>{
  try{ degradeConnection(new ApiError('這台裝置目前沒有網路連線','offline','')); }catch(e){}
  await new Promise(r=>setTimeout(r,200));
  return { badge:(document.getElementById('connBadge')||{}).textContent.replace(/\s+/g,' ').trim(),
           live: state.live };
});
await ctx.setOffline(false);
console.log('  ', JSON.stringify(off));
T('離線時徽章不再寫「已連線」', !/已連線/.test(off.badge), off.badge);
T('離線時 state.live 是 false', off.live===false);
T('徽章講出是沒網路', /沒有網路|離線/.test(off.badge), off.badge);

T('全程沒有執行期錯誤', errs.length===0, errs.join(' | '));
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
