/* v85：「查一檔（不加入清單）」——看一檔跟持有一檔是兩件事。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const ctx = await b.newContext({viewport:{width:390,height:844}});
await ctx.route('**/api.finmindtrade.com/**', async route=>{
  const u=new URL(route.request().url()), ds=u.searchParams.get('dataset');
  const id=u.searchParams.get('data_id')||'';
  let data=[];
  if(id==='9999'){ await route.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({msg:'success',status:200,data:[]})}); return; }
  const t=new Date('2026-08-18');
  if(ds==='TaiwanStockPrice') for(let k=600;k>=0;k--)
    data.push({date:new Date(t-k*86400000).toISOString().slice(0,10),stock_id:id,close:88+(k%5),open:88,max:90,min:86,Trading_Volume:9000});
  else if(ds==='TaiwanStockPER') for(let k=600;k>=0;k--)
    data.push({date:new Date(t-k*86400000).toISOString().slice(0,10),stock_id:id,PER:14+(k%6),PBR:1.5,dividend_yield:4});
  else if(ds==='TaiwanStockInfo') data=[{stock_id:id,stock_name:'長榮',industry_category:'航運業',type:'twse',date:'2026-08-18'}];
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({msg:'success',status:200,data})});
});
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2400);
await p.evaluate(()=>{try{closeAllModals()}catch(e){}});

T('畫面上有「查一檔」的按鈕', await p.evaluate(()=>!!document.getElementById('lookupBtn')));
T('按鈕文字說清楚不會加入清單',
  /不加入清單/.test(await p.evaluate(()=>document.getElementById('lookupBtn').textContent)));
await p.click('#lookupBtn'); await p.waitForTimeout(300);
T('點開會出現輸入面板',
  await p.evaluate(()=>!document.getElementById('lookupPanel').classList.contains('hidden')));

/* 未連線時要講人話，不要空轉 */
await p.fill('#lookupId','2603'); await p.click('#lookupGo'); await p.waitForTimeout(400);
T('未連線時說明要先連線',
  /先連線/.test(await p.evaluate(()=>document.getElementById('lookupMsg').textContent)),
  await p.evaluate(()=>document.getElementById('lookupMsg').textContent));

/* 連線後查一檔不在任何清單裡的股票 */
await p.evaluate(()=>{ state.live=true; state.token='ey.TEST'; });
/* 一定要挑一個**真的不在**任何清單裡的代號。第一版寫死 2603，
   但它本來就在百大裡——測試因此測到了另一條路徑，還誤以為程式壞掉。 */
const NEW_ID = await p.evaluate(()=>{
  for(let n=1101;n<9999;n++){ const id=String(n);
    if(!state.watchlist.find(x=>x.id===id)) return id; }
  return null;
});
const before = await p.evaluate(id=>({ watch: watchItems().length,
  total: state.watchlist.length, has: !!state.watchlist.find(x=>x.id===id) }), NEW_ID);
console.log('   用來測試的代號：', NEW_ID);
T('（前置）這個代號本來不在任何清單裡', NEW_ID && before.has===false, JSON.stringify(before));

await p.fill('#lookupId',NEW_ID); await p.click('#lookupGo'); await p.waitForTimeout(2500);
await p.evaluate(id=>{ window.__NEW_ID=id; }, NEW_ID);
const after = await p.evaluate(()=>({
  msg: document.getElementById('lookupMsg').textContent,
  modalOpen: !document.getElementById('bigModal').classList.contains('hidden'),
  title: (document.getElementById('bigTitle')||{}).textContent||'',
  body: (document.getElementById('bigBody')||{}).textContent.replace(/\s+/g,' '),
  watch: watchItems().length,
  inT100: state.watchlist.filter(x=>x.type==='top100').length,
  found: (()=>{const x=state.watchlist.find(y=>y.id===window.__NEW_ID); return x?{type:x.type,inWatch:x.inWatch}:null;})(),
  dupes: state.watchlist.filter(y=>y.id===window.__NEW_ID).length,
}));
console.log('  ', JSON.stringify({...after, body:after.body.slice(0,60)}).slice(0,260));
T('查完會直接開出三維度目標價視窗', after.modalOpen===true);
T('視窗標題是那一檔', after.title.includes(NEW_ID), after.title.slice(0,40));
T('沒有製造出重複的同代號項目', after.dupes===1, String(after.dupes));
T('視窗裡有長期目標價', /長期目標價/.test(after.body), after.body.slice(0,60));
T('視窗裡有中期目標價', /中期目標價/.test(after.body));
T('視窗裡有短期目標價', /短期目標價/.test(after.body));
T('自選清單的檔數沒有變（沒有偷偷加進去）', after.watch===before.watch, `${before.watch} → ${after.watch}`);
T('百大資料庫的檔數也沒有變', after.inT100===100, String(after.inT100));
T('那一檔的 inWatch 是 false、type 標成 lookup',
  after.found && after.found.inWatch===false && after.found.type==='lookup', JSON.stringify(after.found));

/* 不可以被寫進備份或本機儲存 */
const snap = await p.evaluate(()=>{ const o=snapshot(false,{forExport:true});
  return { ids:(o.watch||[]).map(x=>x.id) }; });
T('查過的股票不會被寫進備份檔', !snap.ids.includes(NEW_ID), JSON.stringify(snap.ids));
const ls = await p.evaluate(()=>{ persist();
  try{ return JSON.stringify(JSON.parse(localStorage.getItem(STORE_KEY)).watch.map(x=>x.id)); }catch(e){ return 'n/a'; } });
T('查過的股票不會被寫進本機儲存', !String(ls).includes(NEW_ID), String(ls));

/* 查不到的代號要講清楚 */
await p.evaluate(()=>{try{closeAllModals()}catch(e){}});
await p.fill('#lookupId','9999'); await p.click('#lookupGo'); await p.waitForTimeout(2000);
T('查不到時說明原因，不是空白',
  /查不到/.test(await p.evaluate(()=>document.getElementById('lookupMsg').textContent)),
  await p.evaluate(()=>document.getElementById('lookupMsg').textContent).then(x=>x.slice(0,60)));
/* 亂輸入 */
await p.fill('#lookupId','abc'); await p.click('#lookupGo'); await p.waitForTimeout(300);
T('代號格式錯誤時擋下來', /正確的台股代號/.test(await p.evaluate(()=>document.getElementById('lookupMsg').textContent)));

T('全程沒有執行期錯誤', errs.length===0, errs.join(' | '));
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
