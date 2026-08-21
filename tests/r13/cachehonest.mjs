/* v87：API 掛掉時，不可以用一個新鮮的時間戳背書一批快取來的舊數字。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const ctx = await b.newContext({viewport:{width:390,height:900}});
let mode = 'ok'; const calls=[];
await ctx.route('**/api.finmindtrade.com/**', async route=>{
  const u=new URL(route.request().url()), ds=u.searchParams.get('dataset'), id=u.searchParams.get('data_id')||'';
  calls.push(mode+':'+ds);
  if(mode==='dead'){ await route.fulfill({status:500, contentType:'text/html', body:'<html>502</html>'}); return; }
  let data=[]; const t=new Date('2026-08-18');
  if(ds==='TaiwanStockPrice'){ for(let k=600;k>=0;k--)
    data.push({date:new Date(t-k*86400000).toISOString().slice(0,10),stock_id:id,close:1000,open:1000,max:1000,min:1000,Trading_Volume:9000}); }
  else if(ds==='TaiwanStockPER'){ for(let k=600;k>=0;k--)
    data.push({date:new Date(t-k*86400000).toISOString().slice(0,10),stock_id:id,PER:20,PBR:2,dividend_yield:3}); }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({msg:'success',status:200,data})});
});
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2400);
await p.evaluate(()=>{try{closeAllModals()}catch(e){}
  state.live=true; state.token='ey.T';
  state.watchlist.forEach(x=>{x.inWatch = x.id==='2330';});});

/* 第一次抓：真的連上 */
await p.evaluate(async ()=>{ await fetchOneLive(state.watchlist.find(x=>x.id==='2330')); });
await p.waitForTimeout(600);
const first = await p.evaluate(()=>{
  const d=state.watchlist.find(x=>x.id==='2330').data;
  return { fromCache:!!d.fromCache, hasFetchedAt:!!d.fetchedAt,
           badge:(()=>{const t=document.createElement('div'); t.innerHTML=srcBadge(d); return t.textContent.trim();})(),
           title:(()=>{const t=document.createElement('div'); t.innerHTML=srcBadge(d); return t.querySelector('.tag').title;})() };
});
console.log('  真的連上：', JSON.stringify(first));
T('真的連上時不標快取', first.fromCache===false);
T('真的連上時徽章沒有「快取」字樣', !/快取/.test(first.badge), first.badge);
T('提示寫「抓取於」', /抓取於/.test(first.title), first.title.slice(0,60));

/* API 全掛，再抓一次 —— 所有請求都會命中快取 */
mode='dead'; calls.length=0;
await p.evaluate(async ()=>{ await fetchOneLive(state.watchlist.find(x=>x.id==='2330')); });
await p.waitForTimeout(600);
const dead = await p.evaluate(()=>{
  const d=state.watchlist.find(x=>x.id==='2330').data;
  const t=document.createElement('div'); t.innerHTML=srcBadge(d);
  return { fromCache:!!d.fromCache, badge:t.textContent.trim(), title:t.querySelector('.tag').title };
});
console.log('  API 全掛後：', JSON.stringify(dead));
console.log('  實際發出的請求：', JSON.stringify([...new Set(calls)]));
T('整批來自快取時有標出來', dead.fromCache===true, String(dead.fromCache));
T('徽章上看得到「快取」', /快取/.test(dead.badge), dead.badge);
T('提示明說「本次沒有重新向 FinMind 確認」', /沒有重新向 FinMind 確認/.test(dead.title), dead.title.slice(0,80));
T('提示的時間是快取寫入那一刻，不是現在', /這批數字是台北時間/.test(dead.title));

T('全程沒有執行期錯誤', errs.length===0, errs.join(' | '));
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
