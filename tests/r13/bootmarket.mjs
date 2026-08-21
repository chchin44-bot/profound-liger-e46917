/* v85：自動連線成功之後，大盤與個股都必須補上——
   不能出現「已連線 FinMind 真實數據」跟「還沒有大盤資料」同時在一個畫面上。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const ctx = await b.newContext({viewport:{width:390,height:844}});
const calls=[];
await ctx.route('**/api.finmindtrade.com/**', async route=>{
  const u=new URL(route.request().url()), ds=u.searchParams.get('dataset'), id=u.searchParams.get('data_id')||'';
  calls.push(ds+':'+id);
  let data=[]; const t=new Date('2026-08-18');
  if(ds==='TaiwanStockPrice'){ for(let k=600;k>=0;k--)
    data.push({date:new Date(t-k*86400000).toISOString().slice(0,10),stock_id:id,
      close: id==='TAIEX'?23000+(k%50):600+(k%7)*3, open:600,max:610,min:590,Trading_Volume:12000}); }
  else if(ds==='TaiwanStockPER'){ for(let k=600;k>=0;k--)
    data.push({date:new Date(t-k*86400000).toISOString().slice(0,10),stock_id:id,PER:20+(k%9),PBR:2,dividend_yield:3}); }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({msg:'success',status:200,data})});
});
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};

await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2500);
await p.evaluate(()=>{ state.token='ey.TEST'; state.rememberToken=true; state.rememberAsked=true;
  state.autoSave=true; state.autoConnect=true; persist(); });
calls.length=0;
await p.reload(); await p.waitForTimeout(6000);

const r = await p.evaluate(()=>({
  live: state.live,
  marketSrc: state.market && state.market.src,
  hasSeries: !!(state.market && state.market.series && state.market.series.length>60),
  /* textContent 會把「已經被 hidden 的那一塊」也讀進來——要問的是「使用者看不看得到」。 */
  emptyShown: (()=>{ const e=document.getElementById('blockAEmpty');
    return e ? (e.checkVisibility?e.checkVisibility({checkVisibilityCSS:true}):!e.classList.contains('hidden')) : null; })(),
  fullShown: (()=>{ const f=document.getElementById('blockAFull');
    return f ? (f.checkVisibility?f.checkVisibility({checkVisibilityCSS:true}):!f.classList.contains('hidden')) : null; })(),
  blockA: (document.getElementById('blockAFull')||{}).textContent?.replace(/\s+/g,' ').slice(0,120)||'',
  badge: (document.getElementById('connBadge')||{}).textContent.trim(),
}));
console.log('  ', JSON.stringify(r).slice(0,260));
console.log('   API 呼叫：', JSON.stringify([...new Set(calls)]).slice(0,200));
T('自動連線成功', r.live===true);
T('大盤資料也跟著載入了（src=live）', r.marketSrc==='live', String(r.marketSrc));
T('大盤真的有序列，不是空殼', r.hasSeries===true);
T('「還沒有大盤資料」那一塊已經被收起來', r.emptyShown===false, String(r.emptyShown));
T('大盤內容那一塊看得見', r.fullShown===true, String(r.fullShown));
T('看得見的內容裡有指數與年線', /年線|乖離/.test(r.blockA), r.blockA.slice(0,80));
T('大盤只抓一次，沒有重複打', calls.filter(x=>x==='TaiwanStockPrice:TAIEX').length===1,
  String(calls.filter(x=>x==='TaiwanStockPrice:TAIEX').length));

/* 同一天再打開：資料已經是新鮮的 → 只驗證，不重抓 */
calls.length=0;
await p.reload(); await p.waitForTimeout(5000);
const again = await p.evaluate(()=>({ live:state.live, marketSrc:state.market&&state.market.src }));
console.log('   同一天再開的 API 呼叫：', JSON.stringify(calls).slice(0,160));
T('同一天再開仍然連得上', again.live===true);
T('同一天再開不會把整輪重抓一次', calls.length <= 3, calls.length+' 次：'+JSON.stringify(calls).slice(0,100));

T('全程沒有執行期錯誤', errs.length===0, errs.join(' | '));
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
