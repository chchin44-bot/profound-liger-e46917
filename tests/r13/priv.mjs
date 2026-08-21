/* v85：隱私模式必須真的遮住所有金額——包含交易紀錄頁、分享文字、圖表座標軸、營業員電話。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await (await b.newContext({viewport:{width:390,height:844},
  permissions:['clipboard-read','clipboard-write']})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2400);
await p.evaluate(()=>{
  try{closeAllModals()}catch(e){}
  const s=state.watchlist.find(x=>x.id==='2330'); s.inWatch=true;
  s.txns=[{id:'b',kind:'buy',date:'2021-03-05',shares:8000,price:512.50},
          {id:'s',kind:'sell',date:'2024-06-11',shares:2000,price:880}];
  s.txnsMigrated=true;
  const ser=[],ph=[],t=new Date('2026-08-18');
  for(let k=600;k>=0;k--){ser.push({date:new Date(t-k*86400000).toISOString().slice(0,10),close:1150});ph.push(24);}
  applyStockData(s,{price:1150,eps:44,debt:.3,series:ser,asOf:'2026-08-18',per:24,perHist:ph,perAsOf:'2026-08-18'},'live');
  applyPosition(s);
  state.brokerName='王小姐'; state.brokerTel='0912-345-678'; state.myRule='跌破月線就賣';
  setPrivacy(true); renderAll();
});
await p.waitForTimeout(500);
const SECRETS = ['512.50','512.5','8,000','4,100,000','1,150','880','6,000','9,200,000','0912-345-678'];
const leak = (txt) => SECRETS.filter(x=>txt.includes(x));

/* 交易紀錄頁 */
const txn = await p.evaluate(()=>{ openTxnPage('2330');
  return document.getElementById('bigBody').innerText.replace(/\s+/g,' '); });
const l1 = leak(txn);
T('隱私模式下交易紀錄頁沒有露出金額或股數', l1.length===0, JSON.stringify(l1)+' ｜ '+txn.slice(0,90));
await p.evaluate(()=>{try{closeAllModals()}catch(e){}});

/* 印一份給人看：要先攔下來 */
const share = await p.evaluate(async ()=>{
  document.querySelectorAll('.toast-sa').forEach(e=>e.remove());
  document.getElementById('shareBtn').click();
  await new Promise(r=>setTimeout(r,500));
  const m=document.getElementById('modal');
  return { blocked: m && !m.classList.contains('hidden'),
           body: (document.getElementById('modalBody')||{}).textContent||'' };
});
T('隱私模式下按「印一份給人看」會先攔下來確認', share.blocked===true, share.body.slice(0,60));
T('攔截訊息說清楚印出來的是完整明細', /完整明細/.test(share.body), share.body.slice(0,80));
await p.evaluate(()=>{try{closeModal()}catch(e){}});

/* 關掉隱私模式後仍要能正常分享 */
const ok2 = await p.evaluate(async ()=>{
  setPrivacy(false);
  document.querySelectorAll('.toast-sa').forEach(e=>e.remove());
  document.getElementById('shareBtn').click();
  await new Promise(r=>setTimeout(r,600));
  return { modal:!document.getElementById('modal').classList.contains('hidden'),
           toast:[...document.querySelectorAll('.toast-sa')].map(e=>e.textContent.slice(0,30)) };
});
T('關掉隱私模式後分享照常運作', ok2.toast.length>0 || ok2.modal, JSON.stringify(ok2));

T('全程沒有執行期錯誤', errs.length===0, errs.join(' | '));
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
