/* v85：大盤也要有新鮮度閘門。舊版 400 天前的指數會印出「便宜買點・可以考慮動用生活費」。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
const run = async (daysOld, label) => {
  const ctx = await b.newContext({viewport:{width:390,height:844}});
  await ctx.route('**/api.finmindtrade.com/**', async route=>{
    const u=new URL(route.request().url()), ds=u.searchParams.get('dataset'), id=u.searchParams.get('data_id')||'';
    let data=[]; const end=new Date(Date.parse('2026-08-18T00:00:00Z') - daysOld*86400000);
    if(ds==='TaiwanStockPrice'){ for(let k=560;k>=0;k--){
      const d=new Date(end-k*86400000).toISOString().slice(0,10);
      /* 讓大盤在年線下方、負乖離超過 10%：最後一段大跌 */
      const base = id==='TAIEX' ? (k<30 ? 19000 : 24000) : 600;
      data.push({date:d, stock_id:id, close:base, open:base, max:base, min:base, Trading_Volume:12000}); } }
    else if(ds==='TaiwanStockPER'){ for(let k=560;k>=0;k--)
      data.push({date:new Date(end-k*86400000).toISOString().slice(0,10),stock_id:id,PER:20,PBR:2,dividend_yield:3}); }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({msg:'success',status:200,data})});
  });
  const p = await ctx.newPage();
  await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2200);
  await p.evaluate(async ()=>{ try{closeAllModals()}catch(e){}
    state.live=true; state.token='ey.T'; await loadMarket(); });
  await p.waitForTimeout(1200);
  const r = await p.evaluate(()=>({
    asOf: state.market && state.market.asOf, stale: state.market && state.market.stale,
    badge: (document.getElementById('taiexClose')||{}).textContent.replace(/\s+/g,' ').trim(),
    animals: (document.getElementById('marketAnimals')||{}).textContent.replace(/\s+/g,' ').trim(),
    box: (document.getElementById('marketBox')||document.getElementById('taiexAdvice')||
          [...document.querySelectorAll('#blockAFull div')].find(d=>/訊號|區間|加碼/.test(d.textContent))||{})
          .textContent?.replace(/\s+/g,' ').slice(0,140)||'',
    all: (document.getElementById('blockAFull')||{}).textContent.replace(/\s+/g,' ')||'',
  }));
  console.log(`  [${label}] asOf=${r.asOf} stale=${r.stale}`);
  console.log(`     徽章：${r.badge.slice(0,50)}`);
  console.log(`     動物：${r.animals.slice(0,60)}`);
  await ctx.close(); return r;
};
const old = await run(400, '400 天前');
T('400 天前的大盤被標成過期', old.stale===true, String(old.stale));
T('徽章講出資料多舊', /天前|日期/.test(old.badge), old.badge.slice(0,50));
T('不判定大盤方向', /不判定方向/.test(old.animals), old.animals.slice(0,60));
T('不會印出「加碼訊號（便宜買點）」', !/加碼訊號/.test(old.all), (old.all.match(/加碼訊號[^。]*/)||[''])[0]);
T('不會叫人動用生活費', !/動用生活費/.test(old.all));
T('有講出資料只到哪一天', /只到/.test(old.all), (old.all.match(/大盤資料只到[^。]*/)||[''])[0].slice(0,50));

const fresh = await run(0, '今天');
T('今天的大盤不會被誤擋', fresh.stale===false, String(fresh.stale));
T('今天的大盤會正常判定方向', !/不判定方向/.test(fresh.animals), fresh.animals.slice(0,60));
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
