/* v84：打開網頁就自動連線；當天第一次還會自動更新一次自選清單。
   最重要的一條是「額度不能被開開關關打光」——同一天重開必須只連線、不重抓。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport:{width:390,height:844} });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};

/* 攔截所有 FinMind 請求，數數看打了幾次、打去哪裡。不動真的網路、不用任何人的 Token。 */
const calls = [];
await ctx.route('**/api.finmindtrade.com/**', async route => {
  const u = new URL(route.request().url());
  calls.push(u.searchParams.get('dataset') || u.pathname.split('/').pop());
  const ds = u.searchParams.get('dataset');
  const body = ds === 'TaiwanStockPrice'
    ? { msg:'success', status:200, data:[{date:'2026-08-17',stock_id:u.searchParams.get('data_id')||'2330',
        close:1000, open:990, max:1005, min:988, Trading_Volume:1000}] }
    : { msg:'success', status:200, data:[] };
  await route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(body) });
});

const boot = async () => { calls.length = 0; await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(3000); };
const st = () => p.evaluate(()=>({ live:state.live, autoConnect:state.autoConnect,
  lastAutoFetch:state.lastAutoFetch, remember:state.rememberToken, hasToken:!!state.token }));

/* ══ ① 沒存 Token → 不可以自己去連（不然會拿空 Token 打 API）══ */
await boot();
let a = await st();
T('沒存 Token 時預設沒有連線', a.live===false, JSON.stringify(a));
T('沒存 Token 時一次 API 都沒打', calls.length===0, JSON.stringify(calls));
T('autoConnect 預設是開的', a.autoConnect===true);

/* ══ ② 存了 Token → 開機自動連線 ══ */
await p.evaluate(()=>{
  state.token='ey.TEST.fake'; state.rememberToken=true; state.rememberAsked=true;
  state.autoSave=true; persist();
});
await boot();
a = await st();
T('存了 Token 之後，開機就自動連上線了', a.live===true, JSON.stringify(a));
T('今天的日期有記下來（額度閘門）', /^\d{4}-\d{2}-\d{2}$/.test(a.lastAutoFetch||''), a.lastAutoFetch);
const firstOpen = calls.length;
console.log(`   第一次打開共 ${firstOpen} 次請求：${JSON.stringify(calls.slice(0,12))}${calls.length>12?'…':''}`);
T('第一次打開有去抓資料（不只驗證）', firstOpen > 1, firstOpen+' 次');

/* ══ ③ 同一天再打開 → 只驗證，不重抓（這條是額度的命脈）══ */
await boot();
const secondOpen = calls.length;
console.log(`   同一天再打開共 ${secondOpen} 次請求：${JSON.stringify(calls)}`);
T('同一天再打開仍然自動連線', (await st()).live===true);
/* v85 起，連線一變綠就會補抓大盤（舊版只有「手動按驗證」那條路會做，
   自動連線那條沒跟上，於是畫面同時出現「已連線」與「還沒有大盤資料」）。
   所以同一天再打開是 2 次：1 次驗證 ＋ 1 次大盤。不是 1 次。
   這裡要驗「是哪兩次」，光數次數看不出有沒有偷抓個股。 */
T('同一天再打開只花 2 次額度（驗證＋大盤，不重抓個股）', secondOpen===2, secondOpen+' 次：'+JSON.stringify(calls));
T('沒有任何財報／資產負債表請求（那才是貴的）',
  !calls.some(c=>/Financial|Balance|Dividend|Holding|CashFlows/.test(c)), JSON.stringify(calls));
T('連開三次也還是 2 次', await (async()=>{ await boot(); return calls.length===2; })(),
  JSON.stringify(calls));

/* ══ ④ 換一天 → 會再自動更新一次 ══ */
await p.evaluate(()=>{ state.lastAutoFetch='2020-01-01'; persist(); });
await boot();
console.log(`   「昨天」之後再打開共 ${calls.length} 次請求`);
T('日期換了就會再自動更新一次', calls.length > 1, calls.length+' 次');
T('更新完日期又回到今天', (await st()).lastAutoFetch === await p.evaluate(()=>todayISO()));

/* ══ ⑤ 關掉開關 → 完全不連 ══ */
await p.evaluate(()=>{ state.autoConnect=false; persist(); });
await boot();
a = await st();
T('關掉之後不會自動連線', a.live===false, JSON.stringify(a));
T('關掉之後一次 API 都不打', calls.length===0, JSON.stringify(calls));
T('關掉的設定有存下來（重開仍是關的）', a.autoConnect===false);

/* ══ ⑤b 驗證失敗時，絕對不可以往下抓 25 次 ══
   這是最貴的一種錯：連線根本是壞的，卻照樣把整輪額度打光。 */
/* 這條假路由也要記帳——不記的話「打了 0 次」看起來像通過，
   其實是量錯了東西（請求有發出去，只是沒被數到）。 */
await ctx.route('**/api.finmindtrade.com/**', route => {
  const u = new URL(route.request().url());
  calls.push(u.searchParams.get('dataset') || u.pathname.split('/').pop());
  return route.fulfill({ status:402, contentType:'application/json',
                         body: JSON.stringify({ msg:'quota exceeded', status:402 }) });
}, { times: 99 });
await p.evaluate(()=>{ state.autoConnect=true; state.rememberToken=true; state.lastAutoFetch='2020-01-01'; persist(); });
await boot();
console.log(`   驗證失敗時共 ${calls.length} 次請求：${JSON.stringify(calls)}`);
T('驗證失敗時只打 1 次就停手（不會往下抓一整輪）', calls.length===1, calls.length+' 次');
T('驗證失敗時不會把日期記成今天（下次還要再試）',
  (await st()).lastAutoFetch === '2020-01-01', (await st()).lastAutoFetch);
await ctx.unroute('**/api.finmindtrade.com/**');
await ctx.route('**/api.finmindtrade.com/**', async route => {
  const u = new URL(route.request().url());
  calls.push(u.searchParams.get('dataset') || u.pathname.split('/').pop());
  const ds = u.searchParams.get('dataset');
  await route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(
    ds === 'TaiwanStockPrice'
      ? { msg:'success', status:200, data:[{date:'2026-08-17',stock_id:u.searchParams.get('data_id')||'2330',
          close:1000, open:990, max:1005, min:988, Trading_Volume:1000}] }
      : { msg:'success', status:200, data:[] }) });
});

/* ══ ⑤c 有 Token 但沒勾「記住」→ 仍然不可以自動連 ══ */
const noRemember = await p.evaluate(async ()=>{
  state.live=false; state.autoConnect=true; state.token='ey.TEST.fake';
  state.rememberToken=false; state.lastAutoFetch='';
  return await bootAutoConnect();
});
T('有 Token 但沒勾「記住 Token」時不自動連', noRemember===false, String(noRemember));

/* ══ ⑥ 設定面板裡的開關 ══ */
await p.evaluate(()=>{ state.autoConnect=true; persist(); openDataPanel(); });
await p.waitForTimeout(400);
const ui = await p.evaluate(()=>{
  const c=document.getElementById('optAutoConn');
  return { exists:!!c, checked:c&&c.checked, disabled:c&&c.disabled,
           text:c?c.closest('label').textContent.replace(/\s+/g,' ').trim():'' };
});
T('設定面板有這個開關', ui.exists);
T('開關反映目前狀態', ui.checked===true);
T('說明有寫「連線本身只花 1 次」', /只花 1 次/.test(ui.text), ui.text.slice(0,80));
T('說明有寫「當天第一次」', /當天第一次/.test(ui.text));

/* 只驗「打勾時是打勾的」抓不到寫死 checked 的錯，要反過來再問一次 */
await p.evaluate(()=>{ state.autoConnect=false; openDataPanel(); });
await p.waitForTimeout(300);
T('關掉時開關要是沒打勾的（不是寫死 checked）',
  await p.evaluate(()=>document.getElementById('optAutoConn').checked)===false);

/* 使用者自己去點那個勾勾 → 必須存得起來，重開還在 */
await p.evaluate(()=>{ state.autoConnect=false; state.rememberToken=true; persist(); openDataPanel(); });
await p.waitForTimeout(300);
await p.click('#optAutoConn');
await p.waitForTimeout(300);
T('點一下之後狀態變成開', await p.evaluate(()=>state.autoConnect)===true);
const savedOn = await p.evaluate(()=>{ try{ return !!JSON.parse(localStorage.getItem(STORE_KEY)).autoConnect; }catch(e){ return null; } });
T('點一下之後有寫進本機儲存', savedOn===true, String(savedOn));
await p.evaluate(()=>{ openDataPanel(); });
await p.waitForTimeout(200);
await p.click('#optAutoConn');
await p.waitForTimeout(300);
const savedOff = await p.evaluate(()=>{ try{ return JSON.parse(localStorage.getItem(STORE_KEY)).autoConnect; }catch(e){ return null; } });
T('再點一下關掉，也有寫進本機儲存', savedOff===false, String(savedOff));
await boot();
T('重開之後記得是關的（設定真的存下來了）', (await st()).autoConnect===false);
await p.evaluate(()=>{ state.autoConnect=true; persist(); });

/* 沒記 Token 時開關要反灰，並說明原因 */
await p.evaluate(()=>{ state.rememberToken=false; persist(); openDataPanel(); });
await p.waitForTimeout(300);
const ui2 = await p.evaluate(()=>{
  const c=document.getElementById('optAutoConn');
  return { disabled:c&&c.disabled, text:c?c.closest('label').textContent.replace(/\s+/g,' '):'' };
});
T('沒記 Token 時開關是反灰的', ui2.disabled===true);
T('沒記 Token 時說明講出原因', /要先開啟.*記住 Token/.test(ui2.text), ui2.text.slice(0,120));

/* ══ ⑦ 壞掉的存檔不可以讓自動更新永久失效 ══ */
const badVals = ['tomorrow', '9999-99-99', '2099-01-01', '', '2026/08/18'];
for(const bad of badVals){
  await p.evaluate(v=>{
    state.autoConnect=true; state.rememberToken=true; state.token='ey.TEST.fake';
    state.lastAutoFetch=''; persist();
    const o=JSON.parse(localStorage.getItem(STORE_KEY)); o.lastAutoFetch=v;
    localStorage.setItem(STORE_KEY, JSON.stringify(o));
  }, bad);
  await boot();
  const got = (await st()).lastAutoFetch;
  T(`存檔裡是「${bad||'(空字串)'}」時不會被原封不動吃進去`, got !== bad, `讀到 ${JSON.stringify(got)}`);
}
/* 未來日期是最陰險的一種：形狀完全合法，但會讓「今天 !== 上次」永遠不成立 */
await p.evaluate(()=>{
  state.autoConnect=true; state.rememberToken=true; state.token='ey.TEST.fake';
  state.lastAutoFetch=''; persist();
  const o=JSON.parse(localStorage.getItem(STORE_KEY)); o.lastAutoFetch='2099-01-01';
  localStorage.setItem(STORE_KEY, JSON.stringify(o));
});
await boot();
T('未來日期的存檔不會讓自動更新永久失效（仍然抓得動）', calls.length > 1, calls.length+' 次');
T('抓完之後日期被改回今天', (await st()).lastAutoFetch === await p.evaluate(()=>todayISO()));

/* 合法的過去日期仍然要讀得回來，別為了防呆把功能一起關掉 */
await p.evaluate(()=>{
  const o=JSON.parse(localStorage.getItem(STORE_KEY)); o.lastAutoFetch='2026-08-01';
  localStorage.setItem(STORE_KEY, JSON.stringify(o));
});
await boot();
T('合法的過去日期讀得回來（防呆沒有誤傷正常值）',
  ['2026-08-01', await p.evaluate(()=>todayISO())].includes((await st()).lastAutoFetch),
  (await st()).lastAutoFetch);

T('全程沒有執行期錯誤', errs.length===0, errs.join(' | '));
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
