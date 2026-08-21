/* v87：減資。面額不再寫死 10；事由沒寫「現金」也要認得出來。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await (await b.newContext()).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2300);

const run = (ev, par, buyPx) => p.evaluate(([ev,par,buyPx])=>{
  /* 給足官方欄位，讓 sharesOutstanding() 推得出面額：
     股數 = 權益 × PBR ÷ 股價；面額 = 股本 ÷ 股數 */
  const price = buyPx, shares = 1e9;
  const data = { corpEvents:[ev], price, per:20, perAsOf:'2026-08-18',
                 series:[{date:'2026-08-18',close:price}],
                 capStock: shares*par, equity: shares*price/2, pbr:2 };
  const s={id:'9999',name:'測試',ind:'其他',type:'user',inWatch:true,cost:0,shares:0,
           txns:[{id:'b',kind:'buy',date:'2024-01-05',shares:1000,price:buyPx}],
           txnHide:[], txnsMigrated:true, data};
  const so = sharesOutstanding(data);
  const auto = autoTxns(s).filter(t=>t.kind==='reduce'||t.kind==='mixed');
  const q = positionOf(s);
  return { detectedPar: so && so.par, kind:auto[0]&&auto[0].kind,
           ratio: auto[0] && +(auto[0].ratio||0).toFixed(6), back: auto[0] && auto[0].price,
           note: auto[0] && String(auto[0].note||'').slice(0,50),
           shares:+q.shares.toFixed(2), cost:Math.round(q.cost), realized:Math.round(q.realized),
           problems:q.problems.length, probMsg:(q.problems[0]||{}).msg||'' };
}, [ev,par,buyPx]);

/* ① 面額 5 元、現金減資 20%、每股退還 1 元：前收 40 → 參考價 (40−1)/0.8 = 48.75 */
const a = await run({date:'2025-03-01',kind:'cut',before:40,after:48.75,reason:'現金減資退還股款'}, 5, 40);
console.log('  面額5：', JSON.stringify(a));
T('推算得出面額是 5', a.detectedPar===5, String(a.detectedPar));
T('換股比例 0.8（不是寫死 10 算出來的 0.774）', Math.abs(a.ratio-0.8)<0.002, String(a.ratio));
T('每股退還 1.00 元（不是 2.2581）', Math.abs(a.back-1)<0.01, String(a.back));
T('減資後 800 股（不是 774.19）', Math.abs(a.shares-800)<0.5, String(a.shares));
T('說明有寫出用了哪個面額', /面額以 5 元計/.test(a.note||''), a.note);

/* ② 面額 10 元的對照組，行為不可以變 */
const c = await run({date:'2025-03-01',kind:'cut',before:40,after:47.5,reason:'現金減資退還股款'}, 10, 40);
console.log('  面額10：', JSON.stringify(c));
T('面額 10 仍算出 0.8', Math.abs(c.ratio-0.8)<0.002, String(c.ratio));
T('面額 10 每股退還 2 元', Math.abs(c.back-2)<0.01, String(c.back));
T('面額 10 減資後 800 股', Math.abs(c.shares-800)<0.5, String(c.shares));

/* ③ 事由只寫「減資」：兩種減資從 before/after 數學上分不開，所以不猜——但要講出來。
   （我第一版試圖用公式分辨，跑測試才發現彌補虧損也解得出「合理」的 r，那是錯的。） */
const d = await run({date:'2025-03-01',kind:'cut',before:40,after:47.5,reason:'減資'}, 10, 40);
console.log('  無關鍵字：', JSON.stringify(d));
T('事由不明時不亂猜，維持保守處理', !d.back, `每股退還 ${d.back}`);
T('但畫面上明說事由不明、可能要自己補一筆',
  /沒寫是哪一種|先當成彌補虧損/.test(d.note||''), d.note);
T('而且進了 problems，使用者看得到', d.problems>0, String(d.problems));

/* ④ 真正的彌補虧損減資：不可以被誤判成現金減資 */
const e = await run({date:'2025-03-01',kind:'cut',before:40,after:50,reason:'彌補虧損'}, 10, 40);
console.log('  彌補虧損：', JSON.stringify(e));
T('明寫彌補虧損時不會被當成現金減資', !e.back, String(e.back));
T('明寫彌補虧損時不會冒出歧義警告', e.problems===0, e.probMsg.slice(0,50));
T('彌補虧損：股數 800（40/50＝0.8）', Math.abs(e.shares-800)<0.5, String(e.shares));
T('彌補虧損：成本不變', Math.abs(e.cost-40057)<2, String(e.cost));

T('全程沒有執行期錯誤', errs.length===0, errs.join(' | '));
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
