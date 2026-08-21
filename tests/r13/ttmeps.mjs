/* v85：TTM EPS 必須認得累計制（YTD）。台灣財報 Q2 是上半年合計，四列直接相加會高估一倍。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await (await b.newContext()).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2200);

const r = await p.evaluate(()=>{
  const mk = arr => new Map(arr);
  /* 台積電形狀：累計制。單季 15.2/16.4/17.3/18.0（2025）、16.0/17.5/…（2026）
     → 累計列：2025 Q1 15.2、H1 31.6、Q1-3 48.9、全年 66.9；2026 Q1 16.0、H1 33.5 */
  const ytd = mk([['2025-03-31',15.2],['2025-06-30',31.6],['2025-09-30',48.9],['2025-12-31',66.9],
                  ['2026-03-31',16.0],['2026-06-30',33.5]]);
  // 正確 TTM = 本年累計 33.5 ＋ 去年全年 66.9 − 去年同期累計 31.6 = 68.8
  const trueTtm = 33.5 + 66.9 - 31.6;
  const naiveSum = 48.9 + 66.9 + 16.0 + 33.5;   // 舊版會算出這個
  const out = { trueTtm:+trueTtm.toFixed(2), naiveSum:+naiveSum.toFixed(2) };
  /* officialEps 是「官方本益比反推出來的 EPS」＝ 股價 ÷ 官方PER，
     它本身就是一個 EPS（元／股），不是倍數。
     第一版我把 1400/68.8＝20.35（那是 PER）傳進來，兩個案例都算錯——
     累計制那個碰巧選對（48 < 145），單季那個就選錯了。夾具寫錯比程式寫錯更難發現。 */
  out.withOfficial = epsFromRows(ytd, { officialEps: trueTtm });
  out.noOfficial   = epsFromRows(ytd, {});
  /* 真的單季資料（不是累計制）：四季相加才對 */
  const q = mk([['2025-03-31',15.2],['2025-06-30',16.4],['2025-09-30',17.3],['2025-12-31',18.0],
                ['2026-03-31',16.0],['2026-06-30',17.5]]);
  const qTrue = 17.3+18.0+16.0+17.5;
  out.qTrue=qTrue;
  out.quarterly = epsFromRows(q, { officialEps: qTrue });
  out.tooFew = epsFromRows(mk([['2026-03-31',16.0],['2026-06-30',33.5]]), {});
  return out;
});
console.log('  ', JSON.stringify(r, null, 1).replace(/\n\s*/g,' ').slice(0,700));
T('累計制：有官方本益比時算出正確的 68.80（不是 165.30）',
  Math.abs(r.withOfficial.eps - r.trueTtm) < 0.02, `${r.withOfficial.eps} vs 正確 ${r.trueTtm}`);
T('舊版的四季相加確實會高估到 165.30（證明這個錯是真的）', Math.abs(r.naiveSum-165.3)<0.02, String(r.naiveSum));
T('採用的算法有講出來', /累計制/.test(r.withOfficial.how||''), r.withOfficial.how);
T('說明有寫出官方值與兩種算法的差', /官方本益比反推/.test(r.withOfficial.note||''), (r.withOfficial.note||'').slice(0,60));
/* 夾具自我檢查：officialEps 傳錯數量級的話，上面那些斷言會變成碰運氣 */
T('（夾具自我檢查）官方 EPS 與正確 TTM 同一個量級',
  Math.abs(r.trueTtm - 68.8) < 0.01 && Math.abs(r.qTrue - 68.8) < 0.01, `${r.trueTtm} / ${r.qTrue}`);
T('沒有官方本益比時取保守值（不會誤判成便宜）',
  r.noOfficial.eps === Math.min(r.naiveSum, r.trueTtm), `${r.noOfficial.eps}`);
T('沒有官方本益比時明說有兩種可能', /兩種可能/.test(r.noOfficial.note||''), (r.noOfficial.note||'').slice(0,50));
T('真的單季資料仍然用四季相加', Math.abs(r.quarterly.eps - r.qTrue) < 0.02, `${r.quarterly.eps} vs ${r.qTrue}`);
T('單季資料不會被誤判成累計制', /四季相加/.test(r.quarterly.how||''), r.quarterly.how);
T('不足四季時不硬算', r.tooFew.eps===null && /不足四季/.test(r.tooFew.note||''), JSON.stringify(r.tooFew));
T('全程沒有執行期錯誤', errs.length===0, errs.join(' | '));
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
