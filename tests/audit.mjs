/* 全功能走查：把每一個功能當使用者實際操作一次，不是只檢查 DOM 存不存在。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
let fail=0, warn=0;
const T=(n,ok,x='')=>{ if(!ok)fail++; console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:'')); };
const W=(n,x='')=>{ warn++; console.log('  ⚠   '+n+(x?'   '+x:'')); };
const S=t=>console.log('\n── '+t+' '+'─'.repeat(Math.max(0,54-t.length)));

const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
const p = await ctx.newPage();
/* v74：進階區塊改成預設收合，測試要跟真實使用者走同一步——先點開標題。 */
const openSec = async (kw) => { await p.evaluate(k=>{
  [...document.querySelectorAll('details.secfold')].forEach(d=>{ if(new RegExp(k).test(d.textContent)) d.open = true; });
}, kw); await p.waitForTimeout(300); };

const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
p.on('console',m=>{ if(m.type()==='error' && !/frame-ancestors/.test(m.text())) errs.push('CONSOLE: '+m.text().slice(0,140)); });
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2400);
await p.evaluate(()=>{ try{closeModal()}catch(e){} });
const open = id => p.evaluate(i=>!document.getElementById(i).classList.contains('hidden'), id);
const txt  = sel => p.evaluate(s=>{const e=document.querySelector(s);return e?e.innerText.replace(/\s+/g,' ').trim():null;}, sel);

S('1. 開機');
T('頁面載入無錯誤', errs.length===0, errs[0]||'');
T('首屏區塊存在', !!(await p.$('#myPnl')));
T('自選清單存在', !!(await p.$('#wlBody')));
T('三維度目標價區塊存在', !!(await p.$('#targetPanel')));
T('百大企業搜尋框存在', !!(await p.$('#searchInput')));
T('心理快篩存在', !!(await p.$('#quizGrid')));
T('需要注意的事區塊存在', !!(await p.$('#totalPnl')));

S('2. 交易紀錄：五種類型');
await p.evaluate(()=>{const b=document.querySelector('button[data-act="txn"]');b.click();});
await p.waitForTimeout(600);
T('交易紀錄頁打得開', await open('bigModal'));
const kinds = await p.$$eval('#txKind option', e=>e.map(x=>x.value));
T('五種類型齊全', JSON.stringify(kinds)==='["buy","sell","div","stkdiv","reduce"]', JSON.stringify(kinds));
const steps=[
 ['買進', 'buy',    {date:'2024-01-05', shares:'2000', price:'600'}],
 ['賣出', 'sell',   {date:'2025-06-05', shares:'500',  price:'900'}],
 ['配股', 'stkdiv', {date:'2025-07-15', shares:'1650'}],
 ['配息', 'div',    {date:'2025-08-15', price:'4.5'}],
 ['減資', 'reduce', {date:'2025-09-01', shares:'1320', price:'2'}],
];
for(const [label,kind,f] of steps){
  await p.selectOption('#txKind', kind); await p.waitForTimeout(250);
  if(f.date)   await p.fill('#txDate', f.date);
  if(f.shares) await p.fill('#txShares', f.shares);
  if(f.price)  await p.fill('#txPrice', f.price);
  await p.click('#txAdd'); await p.waitForTimeout(450);
  const m = await txt('#txMsg');
  T(`記得下「${label}」`, /記下了/.test(m||''), (m||'').slice(0,50));
}
let pos = await p.evaluate(()=>{const s=state.watchlist.find(x=>x.id===state.txnStock);const q=positionOf(s);
  return {n:q.txns.length, shares:q.shares, avg:+q.avgCost.toFixed(2), real:Math.round(q.realized), div:Math.round(q.divCash)};});
T('五筆都進帳本', pos.n===5, JSON.stringify(pos));
T('股數 2000→賣500→配股1650→減資1320', pos.shares===1320, 'shares='+pos.shares);
T('已實現損益算得出來', pos.real>0, 'realized='+pos.real);
T('現金股利算得出來', pos.div>0, 'divCash='+pos.div);
T('沒有 NaN', !Object.values(pos).some(v=>typeof v==='number'&&isNaN(v)), JSON.stringify(pos));

S('3. 交易紀錄：防呆與刪除');
await p.selectOption('#txKind','buy'); await p.waitForTimeout(200);
await p.fill('#txShares',''); await p.fill('#txPrice',''); await p.click('#txAdd'); await p.waitForTimeout(350);
T('空白會擋下並說原因', /請填/.test(await txt('#txMsg')||''), (await txt('#txMsg')||'').slice(0,40));
/* max 屬性只擋使用者用日期選擇器選，不擋程式塞值——真正的守門在 txnAdd 裡。
   所以這裡直接塞一個未來日期，測程式端會不會擋。 */
await p.evaluate(()=>{document.getElementById('txDate').value='2099-01-01';});
await p.fill('#txShares','1000'); await p.fill('#txPrice','600');
const nBefore = await p.evaluate(()=>positionOf(state.watchlist.find(x=>x.id===state.txnStock)).txns.length);
await p.click('#txAdd'); await p.waitForTimeout(400);
const fut = await p.evaluate(()=>({msg:document.getElementById('txMsg').innerText.trim(),
  n:positionOf(state.watchlist.find(x=>x.id===state.txnStock)).txns.length}));
T('未來日期會被擋下且不入帳', /不能是未來/.test(fut.msg) && fut.n===nBefore, JSON.stringify(fut));
await p.check('#txNoDate'); await p.waitForTimeout(250);
T('勾「不記得」會停用日期欄', await p.evaluate(()=>document.getElementById('txDate').disabled));
await p.uncheck('#txNoDate'); await p.waitForTimeout(200);
const before = await p.evaluate(()=>positionOf(state.watchlist.find(x=>x.id===state.txnStock)).txns.length);
await p.evaluate(()=>{document.querySelector('#bigBody button[data-txn="del"]').click();});
await p.waitForTimeout(450);
/* v85：刪除改成要先確認（那顆會清掉成本基礎，全站其他破壞性動作本來就都有確認）。
   沒有按掉這個彈窗的話，它會擋住後面每一個點擊——實測 #txPxSave 就因此點不到。 */
await p.click('[data-conf="txndel"]'); await p.waitForTimeout(400);
const after = await p.evaluate(()=>positionOf(state.watchlist.find(x=>x.id===state.txnStock)).txns.length);
T('刪得掉（而且不會長回來）', after===before-1, `${before} → ${after}`);

S('4. 自己填收盤價（免 Token）');
await p.evaluate(()=>{document.querySelector('#bigBody details').open=true;});
await p.waitForTimeout(250);
await p.fill('#holdPx','1105.5'); await p.click('#txPxSave'); await p.waitForTimeout(600);
const self = await p.evaluate(()=>{const s=state.watchlist.find(x=>x.id===state.txnStock);
  return {src:s.data.src, price:s.data.price, asOf:s.data.asOf, pnl:s.data.pnl};});
T('自填價格生效', self.src==='self' && self.price===1105.5, JSON.stringify(self));
T('每一檔各記各的日期', !!self.asOf, 'asOf='+self.asOf);
T('損益百分比跟著算出來', self.pnl!==null && !isNaN(self.pnl), 'pnl='+self.pnl);
await p.evaluate(()=>closeBig()); await p.waitForTimeout(400);

S('5. 首屏');
await p.evaluate(()=>window.scrollTo(0,0)); await p.waitForTimeout(400);
const hero = await txt('#myPnlBody');
T('首屏印出金額', /元/.test(hero||'') && /賺|賠/.test(hero||''), (hero||'').slice(0,60));
const heroPx = await p.evaluate(()=>{
  const h=document.getElementById('myPnlBody');
  const c=[...h.querySelectorAll('*')].filter(e=>{const b=e.getBoundingClientRect();return b.height>0&&/[0-9]/.test(e.textContent)&&/元|賺|賠/.test(e.textContent);});
  return c.length?Math.round(c[0].getBoundingClientRect().top+window.scrollY):null;});
T('金額在首屏 1200px 內', heroPx!==null && heroPx<=1200, 'y='+heroPx);
T('賣出成本有算', /手續費|證交稅/.test(hero||''));

S('6. 你自己寫的規則');
await p.evaluate(()=>document.getElementById('ruleEdit').click()); await p.waitForTimeout(400);
await p.fill('#ruleText','跌的時候不賣，要賣先隔一個晚上。');
await p.evaluate(()=>document.querySelector('[data-conf="ruleSave"]').click()); await p.waitForTimeout(450);
T('規則寫得下去', /跌的時候不賣/.test(await txt('#myRuleBox')||''));
await p.evaluate(()=>document.getElementById('ruleEdit').click()); await p.waitForTimeout(350);
await p.fill('#ruleText','其實我想馬上全部賣掉。');
await p.evaluate(()=>document.querySelector('[data-conf="ruleSave"]').click()); await p.waitForTimeout(450);
const rb = await txt('#myRuleBox');
T('改規則要隔一天才生效', /明天/.test(rb||''), (rb||'').slice(-50));
T('原本的規則還在首屏', /跌的時候不賣/.test(rb||''));

S('7. 印一份給人看 / 營業員');
const share = await p.evaluate(()=>{try{return shareText2();}catch(e){return 'ERR '+e.message;}});
T('分享文字產得出來', !/^ERR/.test(share) && /我的持股/.test(share), share.split('\n')[0]);
T('分享文字帶資料日期', /資料日期|自己填的/.test(share));
T('分享文字帶免責', /沒有經過任何人審核/.test(share));
T('分享文字帶自己的規則', /我自己寫的規則/.test(share));
await p.evaluate(()=>document.getElementById('brokerBtn').click()); await p.waitForTimeout(400);
await p.fill('#brName','王小姐'); await p.fill('#brTel','02-2345-6789');
await p.evaluate(()=>document.querySelector('[data-conf="brokerSave"]').click()); await p.waitForTimeout(400);
T('營業員存得起來', /王小姐/.test(await txt('#brokerBtn')||''), await txt('#brokerBtn'));

S('8. 三維度目標價');
await p.evaluate(()=>{const s=state.watchlist.find(x=>x.id==='2330');
  const ser=[],pr=[];const t=new Date('2026-08-14');
  for(let i=1300;i>=0;i--){const d=new Date(t-i*86400000);const px=+(1000*(1+Math.sin(i/53)*0.2)).toFixed(2);
    ser.push({date:d.toISOString().slice(0,10),close:px});pr.push({date:d.toISOString().slice(0,10),per:+(px/55).toFixed(2)});}
  ser[ser.length-1].close=1000;
  applyStockData(s,{price:1000,eps:55,debt:.3,holder:0.4,holderPrev:0.3,series:ser,asOf:'2026-08-14',
    per:18,perHist:pr.map(r=>r.per),perRows:pr,perAsOf:'2026-08-14'},'live');
  applyPosition(s);state.selected='2330';renderAll();});
await p.waitForTimeout(600);
const tg = await p.evaluate(()=>state.watchlist.find(x=>x.id==='2330').data.targets);
T('長期三價位遞增', tg.cheap<=tg.fair && tg.fair<=tg.rich, JSON.stringify({c:tg.cheap,f:tg.fair,r:tg.rich}));
T('中期季線有值', tg.midBuy>0, 'midBuy='+tg.midBuy);
T('短期布林有值', tg.shortBuy!=null && tg.shortSell!=null, JSON.stringify({sb:tg.shortBuy,ss:tg.shortSell}));
  await openSec('三維度目標價');
T('區塊 E 面板有內容', ((await txt('#targetPanel'))||'').length>50);
await p.evaluate(()=>{document.querySelector('button[data-act="target"]').click();}); await p.waitForTimeout(600);
const panel = await txt('#bigBody');
T('目標價面板打得開', await open('bigModal'));
T('面板有三個維度', /長期|長線/.test(panel||'') && /季線/.test(panel||'') && /布林/.test(panel||''));
T('面板頂端有那句警語', /算式的答案/.test(panel||''));
await p.evaluate(()=>closeBig()); await p.waitForTimeout(400);
T('目標價面板關得掉', !(await open('bigModal')));

S('9. 百大企業資料庫');
  await openSec('台灣百大企業');
await p.fill('#searchInput','台積'); await p.waitForTimeout(500);
T('搜尋找得到', /台積電/.test(await txt('#t100Body')||''));
await p.fill('#searchInput','2412'); await p.waitForTimeout(500);
const addBtn = await p.$('#t100Body [data-act="star"]');
T('可加入的標的有按鈕', !!addBtn);
if(addBtn){ const label = await addBtn.evaluate(e=>e.textContent.trim());
  T('按鈕文字是「加入自選」或「移出自選」', /加入自選|移出自選/.test(label), label); }
await p.fill('#searchInput',''); await p.waitForTimeout(400);
T('單頁只顯示 5 檔', (await p.$$('#t100Body tr')).length===5);
T('有分頁列', (await p.$$('#pager100 button')).length>=5);
T('有「重新整理本頁」與「抓取全部 100 檔」',
  !!(await p.$('#refresh100Btn')) && !!(await p.$('#fetchAllTBtn')));
T('有產業／位階／動物三個篩選',
  !!(await p.$('#indFilter')) && !!(await p.$('#levelFilter')) && !!(await p.$('#animalFilter')));
await p.fill('#searchInput','');

S('10. 心理快篩');
await openSec('問自己三個問題');
const qz = await p.$$('#quizGrid [data-quiz]');
T('三題各有兩顆按鈕', qz.length===6, 'buttons='+qz.length);
if(qz.length){ await qz[0].click(); await p.waitForTimeout(400);
  T('作答有回饋', ((await txt('#quizGrid'))||'').length>50); }
const qe = await p.evaluate(()=>{const e=document.querySelector('.quiz-e');return e?parseFloat(getComputedStyle(e).fontSize):0;});
T('快篩圖示 ≥72px', qe>=72, 'fontSize='+qe);

S('11. 需要注意的事 / 黑天鵝');
T('三張計數卡有值', /\d/.test(await txt('#totalPnl')||''), await txt('#totalPnl'));
await p.evaluate(()=>{document.querySelector('[data-swanmode="draw"]').click();}); await p.waitForTimeout(300);
await p.evaluate(()=>document.getElementById('swanBtn').click()); await p.waitForTimeout(900);
T('崩跌情境跑得動', !(await p.evaluate(()=>document.getElementById('swanResult').classList.contains('hidden'))));
T('崩跌情境有文字說明', ((await txt('#swanText'))||'').length>30);

S('12. 儲存 / 匯出 / 隱私 / 字級');
const rt = await p.evaluate(()=>{
  const snap=JSON.parse(JSON.stringify(snapshot()));
  const b4=positionOf(state.watchlist.find(x=>x.id==='2330'));
  state.watchlist.forEach(x=>{x.txns=null;x.txnsMigrated=false;x.cost=0;x.shares=1000;x.loaded=false;x.data={};});
  applySnapshot(snap,{trusted:true}); renderAll();
  const af=positionOf(state.watchlist.find(x=>x.id==='2330'));
  return {b:{s:b4.shares,r:Math.round(b4.realized)},a:{s:af.shares,r:Math.round(af.realized)},
          rule:state.myRule, tel:state.brokerTel};});
T('存檔往返後帳本不變', JSON.stringify(rt.b)===JSON.stringify(rt.a), JSON.stringify(rt));
T('存檔往返後規則還在', /跌的時候不賣/.test(rt.rule||''));
T('存檔往返後營業員還在', /2345/.test(rt.tel||''));
await p.evaluate(()=>setPrivacy(true)); await p.waitForTimeout(400);
const priv = await txt('#wlBody');
T('隱私模式遮住金額', !/賠了|賺了/.test(priv||'') && /•/.test(priv||''));
await p.evaluate(()=>setPrivacy(false)); await p.waitForTimeout(400);
for(const fs of ['sm','mid','big']){
  await p.evaluate(v=>{state.fontScale=v;applyFontScale();},fs); await p.waitForTimeout(300);
  const o=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  T(`字級 ${fs} 無橫向溢出`, o<=1, 'ov='+o);
}
await p.evaluate(()=>{state.fontScale='sm';applyFontScale();});

S('13. 觸控目標與符號');
const ui = await p.evaluate(()=>{
  /* 觸控目標的判準是「使用者點得到嗎」：opacity:0 或 pointer-events:none 點不到，不算。
     例如被 label 包住、視覺上完全隱藏的原生 checkbox——真正的觸控目標是那個 label。 */
  const vis=el=>{const s=getComputedStyle(el),b=el.getBoundingClientRect();
    return s.display!=='none'&&s.visibility!=='hidden'&&+s.opacity>0&&s.pointerEvents!=='none'&&b.width>0&&b.height>0;};
  let small=[];
  for(const el of document.querySelectorAll('a,button,[role="button"],input,select,textarea')){
    if(!vis(el))continue;const b=el.getBoundingClientRect();
    if(b.width<44||b.height<44) small.push(`${el.tagName}#${el.id||''} ${Math.round(b.width)}x${Math.round(b.height)}`);}
  /* 符號分兩塊算：
     「每日掃描面」＝首屏、自選清單表格、需要注意的事、心理快篩——這是使用者每次都會看到的。
     「三維度目標價」是 v58 依作者要求照舊版原封還原的面板，它自帶約 15 個符號，
     那是還原的直接後果，不是缺陷。兩個數字分開報，不混在一起。 */
  const inPanel = el => !!(el.closest('#targetPanel') || el.closest('section') && /三維度目標價/.test((el.closest('section').querySelector('h2')||{}).innerText||''));
  const daily=new Set(), panel=new Set();
  const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT); let n;
  while((n=w.nextNode())){const pa=n.parentElement; if(!pa||!vis(pa))continue;
    for(const ch of n.nodeValue.match(/\p{Extended_Pictographic}/gu)||[]) (inPanel(pa)?panel:daily).add(ch);}
  return {small, daily:[...daily], panel:[...panel], h:document.documentElement.scrollHeight};});
T('無過小觸控目標', ui.small.length===0, JSON.stringify(ui.small.slice(0,4)));
/* v61：作者明示把 17 隻動物與位階燈號裝回來，所以「符號越少越好」不再是目標。
   改成守 C4 那條還站得住的條件：**符號不得是唯一的資訊來源**——
   每一個帶符號的元素，同一格裡必須有中文字。 */
const sym = await p.evaluate(()=>{
  /* 觸控目標的判準是「使用者點得到嗎」：opacity:0 或 pointer-events:none 點不到，不算。
     例如被 label 包住、視覺上完全隱藏的原生 checkbox——真正的觸控目標是那個 label。 */
  const vis=el=>{const s=getComputedStyle(el),b=el.getBoundingClientRect();
    return s.display!=='none'&&s.visibility!=='hidden'&&+s.opacity>0&&s.pointerEvents!=='none'&&b.width>0&&b.height>0;};
  const naked=[];
  const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT); let n;
  while((n=w.nextNode())){
    const pa=n.parentElement; if(!pa||!vis(pa))continue;
    if(!/\p{Extended_Pictographic}/u.test(n.nodeValue)) continue;
    if(pa.closest('.quiz-e')) continue;                    // 心理快篩的大圖示，下面單獨測尺寸
    const cell = pa.closest('td, .tag, button, h2, h3, div') || pa;
    const t = (cell.textContent||'').replace(/\p{Extended_Pictographic}/gu,'').replace(/\s+/g,'');
    if(t.length < 2) naked.push((n.nodeValue.trim()||'').slice(0,8)+' :: '+(pa.className||'').slice(0,30));
  }
  return naked;});
T('沒有「只有符號、沒有文字」的元素', sym.length===0, JSON.stringify(sym.slice(0,4)));
console.log(`     （每日掃描面 ${ui.daily.length} 種符號：${ui.daily.join('')}　目標價面板另有 ${ui.panel.length} 種：${ui.panel.join('')}）`);
console.log(`     （全頁高 ${ui.h}px = ${(ui.h/844).toFixed(2)} 屏）`);

S('14. 彈窗全部關得掉');
for(const [name,openFn] of [['目標價',()=>openTargetModal('2330')],['交易紀錄',()=>openTxnPage('2330')],['使用說明',()=>openGuide('start')]]){
  const id = name==='使用說明' ? 'guideModal' : 'bigModal';
  await p.evaluate(f=>eval('('+f+')()'), openFn.toString()); await p.waitForTimeout(450);
  T(`${name} 開得起來`, await open(id));
  await p.evaluate(i=>{ i==='guideModal'?closeGuide():closeBig(); }, id); await p.waitForTimeout(350);
  T(`${name} 關得掉`, !(await open(id)));
}
T('關閉後頁面可捲動', await p.evaluate(()=>!document.body.classList.contains('modal-open')));

S('15. 執行期錯誤');
T('全程無 page error / console error', errs.length===0, errs.slice(0,3).join(' | '));

console.log('\n'+'═'.repeat(60));
console.log(fail? `❌ ${fail} 項失敗` : '✅ 全部通過');
if(warn) console.log(`⚠ ${warn} 項提醒`);
await p.screenshot({path:'./tests/audit.png', fullPage:false});
await b.close(); process.exit(fail?1:0);
