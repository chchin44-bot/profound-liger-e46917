/* 黃色警語收合：可以收，但不可以「收到看不見」。
   收起來之後畫面上仍必須讀得到那句操作性警告，而且一定要點得開。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport:{width:390,height:844} });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2400);
await p.evaluate(()=>{try{closeModal()}catch(e){}});
/* v74：進階區塊改成預設收合，測試要跟真實使用者走同一步——先點開標題。 */
const openSec = async (kw) => { await p.evaluate(k=>{
  [...document.querySelectorAll('details.secfold')].forEach(d=>{ if(new RegExp(k).test(d.textContent)) d.open = true; });
}, kw); await p.waitForTimeout(300); };
await openSec('三維度目標價');


await p.evaluate(()=>{
  const s=state.watchlist.find(x=>x.id==='2330'); s.inWatch=true;
  s.txns=[{id:'a',kind:'buy',date:'2024-01-05',shares:2000,price:800}]; s.txnsMigrated=true;
  const ser=[],ph=[]; const t=new Date('2026-08-14');
  for(let i=1300;i>=0;i--){ const d=new Date(t-i*86400000), dt=d.toISOString().slice(0,10);
    const px=+(1000*(1+Math.sin(i/53)*0.2)).toFixed(2); ser.push({date:dt,close:px}); ph.push(+(px/50).toFixed(2)); }
  ser[ser.length-1].close=1000; ph[ph.length-1]=20;
  applyStockData(s,{price:1000,eps:44,debt:.3,holder:null,holderPrev:null,series:ser,
    asOf:'2026-08-14',per:20,perHist:ph,perAsOf:'2026-08-14'},'live');
  applyPosition(s); state.selected='2330'; renderAll();
});
await p.waitForTimeout(600);

const info = () => p.evaluate(()=>{
  const d=document.querySelector('.warnbox');
  if(!d) return null;
  const sum=d.querySelector('summary'), body=d.querySelector('.warnbody');
  const r=sum.getBoundingClientRect(), br=body.getBoundingClientRect();
  return { open:d.open, head:sum.innerText.trim(), sumH:Math.round(r.height), sumW:Math.round(r.width),
           /* 收起的 <details> 內容在 Chromium 是用 content-visibility 藏的，
              getBoundingClientRect 仍量得到尺寸——要用 checkVisibility() 才問得到「使用者看不看得到」。 */
           bodyVisible: body.checkVisibility ? body.checkVisibility() : br.height>0,
           bodyText: body.innerText.trim().slice(0,40),
           boxH:Math.round(d.getBoundingClientRect().height) };
});

let a = await info();
T('目標價面板有黃色警語框', !!a);
T('預設是收起來的', a && a.open===false, JSON.stringify(a&&{open:a.open}));
T('收起時「不是該買賣的價格」這句仍看得見', a && /不是「該買賣的價格」/.test(a.head), a&&a.head.slice(0,40));
T('收起時細節確實藏起來', a && a.bodyVisible===false);
T('可點區夠大（≥44px 高）', a && a.sumH>=44, a&&`${a.sumW}x${a.sumH}`);
T('收起時整框不超過 120px', a && a.boxH<=120, a&&`${a.boxH}px`);
const hCollapsed = a.boxH;

await p.click('.warnbox > summary'); await p.waitForTimeout(350);
let o = await info();
T('點一下展開', o && o.open===true);
T('展開後看得到「不推介任何個股」', o && /不推介任何個股/.test(o.bodyText+await p.evaluate(()=>document.querySelector('.warnbox .warnbody').innerText)));
T('展開後看得到「±10%」漲跌幅那段', await p.evaluate(()=>/±10%/.test(document.querySelector('.warnbox .warnbody').innerText)));
T('展開後確實變高', o && o.boxH > hCollapsed + 60, `${hCollapsed} → ${o&&o.boxH}px`);

await p.click('.warnbox > summary'); await p.waitForTimeout(350);
T('再點一下收回去', await p.evaluate(()=>!document.querySelector('.warnbox').open));

/* 列印時必須自動展開——不能因為收合而讓交給營業員的那張紙少了警語 */
await p.emulateMedia({ media:'print' }); await p.waitForTimeout(250);
T('列印時強制展開（紙本不會漏掉警語）',
  await p.evaluate(()=>getComputedStyle(document.querySelector('.warnbox .warnbody')).display!=='none'));
await p.emulateMedia({ media:'screen' });

const ov = await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
T('沒有橫向溢出', ov<=1, 'ov='+ov);
T('全程沒有執行期錯誤', errs.length===0, errs.join(' | '));
await p.screenshot({path:'./tests/r13/warn.png'});
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
