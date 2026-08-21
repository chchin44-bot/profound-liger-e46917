/* v79：台灣百大企業資料庫（復原第十二輪之前的版本）
   核心是兩件事：可以篩、可以翻；而且「翻到哪頁才抓哪頁」。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
const reqs=[]; p.on('request',r=>{ if(/finmindtrade/.test(r.url())) reqs.push(r.url()); });
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2600);
await p.evaluate(()=>{try{closeModal()}catch(e){}});

/* 1. 表格結構 */
const base = await p.evaluate(()=>({
  rows: document.querySelectorAll('#t100Body tr').length,
  cols: document.querySelectorAll('#t100Body tr:first-child td').length,
  heads: [...document.querySelectorAll('#t100Body')].length && [...document.querySelectorAll('table.fin thead th')].map(th=>th.textContent.trim()),
  pages: totalPages100(),
}));
T('單頁 5 檔', base.rows===5, base.rows+' 列');
T('共 20 頁', base.pages===20, base.pages+' 頁');
T('每一列 9 欄', base.cols===9, base.cols+' 欄');
const want = ['代號 / 名稱','產業','最新價格','本益比','負債比','千張大戶變動','動物狀態','長線位階','操作'];
T('欄位齊全（含本益比／負債比／千張大戶／動物／位階）',
  want.every(w=>base.heads.includes(w)), want.filter(w=>!base.heads.includes(w)).join(',')||'全部都在');

/* 2. 翻頁不發請求 */
reqs.length=0;
await p.evaluate(()=>{ state.page100=7; renderT100(); }); await p.waitForTimeout(400);
T('翻頁不發任何 API 請求', reqs.length===0, reqs.length+' 次');
T('翻到第 7 頁還是 5 檔', await p.evaluate(()=>document.querySelectorAll('#t100Body tr').length)===5);

/* 3. 篩選 */
await p.evaluate(()=>{ state.page100=1; renderT100(); });
const q = await p.evaluate(()=>{ state.filter.q='台積'; applyFilter();
  return { n:filteredList().length, txt:document.getElementById('t100Body').innerText.slice(0,40) }; });
T('搜尋代號／名稱有效', q.n>=1 && /台積/.test(q.txt), JSON.stringify(q));
const ind = await p.evaluate(()=>{ state.filter.q=''; state.filter.ind='半導體'; applyFilter();
  return filteredList().every(s=>s.ind==='半導體') && filteredList().length>0; });
T('依產業篩選有效', ind);
const hold = await p.evaluate(()=>{ state.filter.ind=''; state.filter.holdOnly=true; applyFilter();
  return filteredList().every(s=>s.inWatch); });
T('「只看已加入自選」有效', hold);

/* 4. 示範值不得進入位階／動物篩選 —— 這是最重要的一條 */
const lvl = await p.evaluate(()=>{ state.filter.holdOnly=false; state.filter.level='cheap'; applyFilter();
  return { n:filteredList().length, notice:document.getElementById('filterNotice').classList.contains('hidden') }; });
T('未連線時，篩「便宜區」不得列出任何股票', lvl.n===0, lvl.n+' 檔');
T('而且要跳出說明為什麼是空的', lvl.notice===false);
const ani = await p.evaluate(()=>{ state.filter.level=''; state.filter.animal='whale'; applyFilter();
  return filteredList().length; });
T('未連線時，篩動物也不得列出任何股票', ani===0, ani+' 檔');
await p.evaluate(()=>{ state.filter={q:'',ind:'',holdOnly:false,level:'',animal:''}; applyFilter(); });

/* 5. 有真實資料之後，篩選才會列出來 */
const after = await p.evaluate(()=>{
  const s=state.watchlist.find(x=>x.id==='2330');
  const ser=[],ph=[]; const t=new Date('2026-08-17');
  for(let i=1200;i>=0;i--){const d=new Date(t-i*86400000);ser.push({date:d.toISOString().slice(0,10),close:1000});ph.push(30+Math.sin(i/13)*10);}
  applyStockData(s,{price:1000,eps:50,debt:.3,holder:0.4,holderPrev:0.3,series:ser,asOf:'2026-08-17',
    per:12,perHist:ph,perAsOf:'2026-08-17',epsVals:[12,12.5,12.5,13]},'live');
  state.filter.level='cheap'; applyFilter();
  return { n:filteredList().length, ids:filteredList().map(x=>x.id),
           info:document.getElementById('filterInfo').textContent };
});
T('抓到真實資料的那一檔才會被篩出來', after.n===1 && after.ids[0]==='2330', JSON.stringify(after.ids));
T('右上角顯示已取得真實數據的檔數', /已取得真實數據 1 \/ 100 檔/.test(after.info), after.info);
await p.evaluate(()=>{ state.filter={q:'',ind:'',holdOnly:false,level:'',animal:''}; applyFilter(); });

/* 5-B. 從 r13/t100.mjs 併過來：資料完整性，以及「加入自選會打開交易紀錄頁」
   （原本那支測的是 v57 的卡片版，主題已經不存在，改在這裡守同一件事） */
T('資料 100 檔完整', await p.evaluate(()=>TOP100.length)===100);
T('產業分類齊全', await p.evaluate(()=>INDUSTRIES.length)>=20);
await p.evaluate(()=>{ state.filter.q='2412'; applyFilter(); }); await p.waitForTimeout(400);
const star = await p.$('#t100Body [data-act="star"]');
T('找得到 2412 並且有「加入自選」按鈕', !!star);
if(star){
  await star.click(); await p.waitForTimeout(700);
  const after = await p.evaluate(()=>({
    open: !document.getElementById('bigModal').classList.contains('hidden'),
    title: (document.getElementById('bigTitle')||{}).textContent||'' }));
  /* 「加入自選」不會直接把它塞進清單——它會打開交易紀錄頁要你先記一筆。
     這是刻意的：沒有成本價的持股，損益那一欄永遠是空的，加了等於沒加。 */
  T('按下去會打開交易紀錄頁（要先記一筆才算加入）', after.open && /2412/.test(after.title), JSON.stringify(after));
  await p.evaluate(()=>{ try{closeBig()}catch(e){} });
}
await p.evaluate(()=>{ state.filter={q:'',ind:'',holdOnly:false,level:'',animal:''}; applyFilter(); });

/* 6. 兩顆按鈕都在，而且批次抓取有進度條 */
const ui = await p.evaluate(()=>({
  refresh: !!document.getElementById('refresh100Btn'),
  all: !!document.getElementById('fetchAllTBtn'),
  bar: !!document.getElementById('bulkBar') && !!document.getElementById('bulkFill') && !!document.getElementById('bulkCancel'),
}));
T('有「重新整理本頁」', ui.refresh);
T('有「抓取全部 100 檔」', ui.all);
T('批次抓取有進度條與停止鈕', ui.bar);

T('全程沒有執行期錯誤', errs.length===0, errs.join(' | '));
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
