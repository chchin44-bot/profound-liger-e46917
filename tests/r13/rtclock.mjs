/* v84：即時報價徽章的時間。FinMind 回的是帶微秒的字串，
   舊版切最後 8 個字，畫面上印出「⚡ 即時 6.992000」——像股價、其實什麼都不是。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await (await b.newContext({viewport:{width:390,height:844}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2200);
await p.evaluate(()=>{try{closeAllModals()}catch(e){}});

const cases = await p.evaluate(()=>({
  '帶微秒（FinMind 實際回傳）': rtClock('2026-08-18 13:30:06.992000'),
  '帶微秒的早盤':               rtClock('2026-08-18 09:15:06.992000'),
  '乾淨的 HH:MM:SS':            rtClock('13:30:00'),
  '只有 HH:MM':                 rtClock('09:05'),
  '單位數小時（要補零）':          rtClock('2026-08-18 9:05:06.992000'),
  'ISO 格式':                   rtClock('2026-08-18T13:30:06'),
  'Unix 秒':                    rtClock(1755500886),
  'Unix 毫秒':                  rtClock(1755500886000),
  '認不出來的東西':             rtClock('banana'),
  'null':                       rtClock(null),
  '空字串':                     rtClock(''),
}));
Object.entries(cases).forEach(([k,v])=>console.log(`   ${k.padEnd(24)} → ${JSON.stringify(v)}`));
T('帶微秒的時間印成 13:30（不是 6.992000）', cases['帶微秒（FinMind 實際回傳）']==='13:30');
T('早盤的也對', cases['帶微秒的早盤']==='09:15');
T('乾淨格式仍然正確', cases['乾淨的 HH:MM:SS']==='13:30');
T('只有 HH:MM 也正確', cases['只有 HH:MM']==='09:05');
/* 補零這件事單靠上面的案例測不到——它們的小時本來就是兩位數。
   要抓「忘了 padStart」只能拿單位數小時去問。 */
T('單位數小時會補成兩位（9:05 → 09:05）', cases['單位數小時（要補零）']==='09:05', cases['單位數小時（要補零）']);
T('所有時間都是 HH:MM 五個字元',
  Object.values(cases).filter(Boolean).every(v=>/^\d{2}:\d{2}$/.test(v)), JSON.stringify(cases));
T('ISO 格式也正確', cases['ISO 格式']==='13:30');
T('Unix 秒轉得出台北時間', /^\d{2}:\d{2}$/.test(cases['Unix 秒']), cases['Unix 秒']);
T('Unix 毫秒跟秒得到同一個時間', cases['Unix 秒']===cases['Unix 毫秒']);
T('認不出來就回空字串，不印假數字', cases['認不出來的東西']==='');
T('null 回空字串', cases['null']==='');
T('空字串回空字串', cases['空字串']==='');
T('任何情況都不會吐出小數點數字', Object.values(cases).every(v=>!/\d\.\d/.test(String(v))), JSON.stringify(cases));

/* 端到端：套上即時報價之後，畫面上的徽章長什麼樣 */
const badge = await p.evaluate(()=>{
  const s=state.watchlist.find(x=>x.id==='2330'); s.inWatch=true;
  const ser=[],ph=[],t=new Date('2026-08-17');
  for(let i=600;i>=0;i--){ser.push({date:new Date(t-i*86400000).toISOString().slice(0,10),close:1000});ph.push(20);}
  applyStockData(s,{price:1000,eps:44,debt:.3,series:ser,asOf:'2026-08-17',per:20,perHist:ph,perAsOf:'2026-08-17'},'live');
  s.data.price=1012; s.data.rtTime='2026-08-18 13:30:06.992000'; s.data.src='rt';
  applyPosition(s); renderAll();
  const td=[...document.querySelectorAll('#wlBody td')].find(x=>x.getAttribute('data-label')==='最新價格');
  return { badge:(td.querySelector('.tag')||{}).textContent?.trim(),
           title:(td.querySelector('.tag')||{}).title,
           header:[...document.querySelectorAll('#wlBody, table th')].length &&
                  [...document.querySelectorAll('th')].map(x=>x.textContent.trim()).filter(x=>/最新/.test(x)) };
});
console.log('   徽章：', JSON.stringify(badge));
T('畫面上的徽章是「⚡ 即時 13:30」', /^⚡ 即時 13:30$/.test(badge.badge||''), badge.badge);
T('徽章不再出現 6.992000', !/6\.992/.test(badge.badge||''));
T('滑鼠移上去說得出這是 FinMind 的哪個端點', /tick_snapshot/.test(badge.title||''), (badge.title||'').slice(0,60));
T('提示有說「這不是收盤價」', /不是收盤價/.test(badge.title||''));
T('欄位標題改成「最新價格」（套即時報價時那格不是收盤價）',
  badge.header.every(h=>h==='最新價格'), JSON.stringify(badge.header));
T('全程沒有執行期錯誤', errs.length===0, errs.join(' | '));
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
