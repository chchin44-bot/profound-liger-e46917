/* 即時報價與重複請求的實測。用攔截的假 FinMind 回應，不需要真 Token。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};

// ── 1. 即時報價：四種呼叫形式、Authorization 標頭 ──
{
const ctx = await b.newContext({ viewport:{width:390,height:844} });
const p = await ctx.newPage();
const seen=[];
await ctx.route('**/api.finmindtrade.com/**', async route=>{
  const r=route.request(); const u=r.url();
  seen.push({url:u.replace(/token=[^&]*/,'token=***'), auth:(r.headers()['authorization']||'').slice(0,14)});
  if(/tick_snapshot|dataset=taiwan_stock_tick_snapshot/.test(u)) return route.abort('failed');   // 模擬 Failed to fetch
  return route.fulfill({status:200, contentType:'application/json', body:JSON.stringify({msg:'success',data:[]})});
});
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2200);
await p.evaluate(()=>{try{closeModal()}catch(e){}});
const r = await p.evaluate(async ()=>{
  state.token='TESTTOKEN'; state.live=true;
  try{ await fetchSnapshot(['2330']); return {ok:true}; }
  catch(e){ return {kind:e.kind, msg:e.message, detail:(e.detail||'').slice(0,200)}; }});
const snap = seen.filter(x=>/tick_snapshot/.test(x.url));
T('即時報價試了 4 種呼叫形式', snap.length===4, 'attempts='+snap.length);
T('其中有帶 Authorization: Bearer 的', snap.some(x=>/^Bearer TEST/.test(x.auth)), JSON.stringify(snap.map(x=>x.auth)));
T('其中有不帶標頭、走 ?token= 的', snap.some(x=>!x.auth && /token=/.test(x.url)), '');
T('錯誤不再宣稱「需要 sponsor 會員」', !/sponsor 會員權限/.test(r.msg||''), r.msg);
T('錯誤明說分不出原因', /分不出/.test(r.msg||''), r.msg);
T('錯誤有列出試過幾種', /4 種呼叫形式/.test(r.detail||''), (r.detail||'').slice(0,80));
await ctx.close();
}

// ── 2. 連線成功後不得重複抓自選清單 ──
{
const ctx = await b.newContext({ viewport:{width:390,height:844} });
const p = await ctx.newPage();
const calls=[];
await ctx.route('**/api.finmindtrade.com/**', async route=>{
  const u=route.request().url();
  const ds=(u.match(/dataset=([A-Za-z_]+)/)||[])[1]||'(snapshot)';
  const id=(u.match(/data_id=([0-9A-Z,]+)/)||[])[1]||'-';
  calls.push(ds+':'+id);
  if(/tick_snapshot/.test(u)) return route.abort('failed');
  const today=new Date().toISOString().slice(0,10);
  return route.fulfill({status:200, contentType:'application/json',
    body:JSON.stringify({msg:'success', data:[{date:today, stock_id:id.split(',')[0]||'2330',
      close:100, open:100, max:100, min:100, Trading_Volume:1000, PER:15, PBR:2, dividend_yield:3}]})});
});
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2200);
await p.evaluate(()=>{try{closeModal()}catch(e){}});
/* 必須真的進入 live 路徑，否則 refreshCurrentPage 會直接跳過抓取，
   測出 0 次請求然後「通過」——那種通過沒有意義。 */
await p.evaluate(()=>{
  state.token='TESTTOKEN'; state.live=true; state.demoMode=false;
  state.watchlist.forEach(x=>{x.inWatch=false;});
  ['2330','2308','2412'].forEach(id=>{
    const s=state.watchlist.find(x=>x.id===id); if(!s) return;
    s.inWatch=true; s.txnsMigrated=true;
    s.txns=[{id:'t'+id,kind:'buy',date:'2024-01-05',shares:1000,price:100}];
    applyPosition(s);});
  state.page=1; renderAll();});
await p.waitForTimeout(400);
calls.length=0;
await p.evaluate(async ()=>{ await refreshCurrentPage(); });
await p.waitForTimeout(3000);
const byStock={}; calls.forEach(c=>{ byStock[c]=(byStock[c]||0)+1; });
const dup = Object.entries(byStock).filter(([k,v])=>v>1);
T('測試真的有打出請求（不是空跑）', calls.length>0, 'calls='+calls.length);
T('一次「重新整理本頁」不重複打同一個 dataset+個股', calls.length>0 && dup.length===0, JSON.stringify(dup.slice(0,5)));
console.log(`     （共 ${calls.length} 次請求，${Object.keys(byStock).length} 個不重複組合）`);
T('refreshCurrentPage 不再吃被忽略的 which 參數',
  await p.evaluate(()=>!/which/.test(refreshCurrentPage.toString().split('\n')[0])), '');
await ctx.close();
}

// ── 3. 連線成功之後，自選清單只能被抓一次（Eddie 回報的「連續抓兩次」） ──
{
const ctx = await b.newContext({ viewport:{width:390,height:844} });
const p = await ctx.newPage();
const toasts=[]; const calls=[];
await ctx.route('**/api.finmindtrade.com/**', async route=>{
  const u=route.request().url();
  calls.push(u);
  if(/tick_snapshot/.test(u)) return route.abort('failed');
  const today=new Date().toISOString().slice(0,10);
  const id=(u.match(/data_id=([0-9A-Z,]+)/)||[])[1]||'2330';
  return route.fulfill({status:200, contentType:'application/json',
    body:JSON.stringify({msg:'success', data:[{date:today, stock_id:id.split(',')[0],
      close:100, open:100, max:100, min:100, Trading_Volume:1000, PER:15, PBR:2, dividend_yield:3,
      stock_name:'測試', industry_category:'半導體'}]})});
});
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2200);
await p.evaluate(()=>{try{closeModal()}catch(e){}});
await p.evaluate(()=>{ window.__toasts=[]; const o=window.toast;
  window.toast=(m,k)=>{ window.__toasts.push(String(m)); return o(m,k); }; });
await p.evaluate(()=>{ document.getElementById('tokenInput').value='TESTTOKEN'; });
await p.evaluate(()=>{ const b=document.getElementById('verifyBtn'); if(b) b.click(); });
await p.waitForTimeout(6000);
const tl = await p.evaluate(()=>window.__toasts||[]);
const batch = tl.filter(t=>/本頁 \d+ 檔，約送出/.test(t));
T('連線成功後「本頁 N 檔」只出現一次', batch.length<=1, `出現 ${batch.length} 次：${JSON.stringify(batch)}`);
const fetching = tl.filter(t=>/已更新|抓取/.test(t));
console.log(`     （連線流程共 ${calls.length} 次請求；批次提示 ${batch.length} 次）`);
await ctx.close();
}

console.log(fail?`\n❌ ${fail} 項失敗`:'\n✅ 全部通過');
await b.close(); process.exit(fail?1:0);
