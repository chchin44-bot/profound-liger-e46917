import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const F='file:///mnt/user-data/working/index.html';
let fail=0;const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'PASS':'FAIL')+'  '+n+(x?'  '+x:''));};
const MK=`globalThis.__mk=(id,name,opt={})=>{let s=state.watchlist.find(x=>x.id===id);
 if(!s){s={id,name,ind:opt.ind||'半導體業',cost:0,shares:1000,inWatch:false,type:'user',loaded:false,data:{}};state.watchlist.push(s);}
 /* v57：這個 helper 模擬的是「舊版存檔的一檔股票」，所以帳本要先清空，
    否則開機時已經轉換過（txnsMigrated=true、txns=[]）的股票不會再轉換一次，
    這裡設的 cost 會被空帳本蓋回 0。 */
 s.inWatch=true;s.cost=opt.cost??800;s.shares=opt.shares??1000;s.ind=opt.ind||s.ind;
 s.txns=null;s.txnsMigrated=false;s.txnHide=[];
 const ser=[],pr=[];const t=new Date(opt.asOf||'2026-08-14');
 for(let i=(opt.n??600);i>=0;i--){const d=new Date(t-i*86400000),dt=d.toISOString().slice(0,10);
  const px=+((opt.price??1000)*(1+Math.sin(i/53)*0.15)).toFixed(2);
  ser.push({date:dt,close:px});pr.push({date:dt,per:+(opt.per??18).toFixed(2)});}
 ser[ser.length-1].close=opt.price??1000;
 applyStockData(s,{price:opt.price??1000,eps:(opt.price??1000)/(opt.per??18),debt:opt.debt??0.35,
  holder:opt.holder??0.5,holderPrev:opt.holderPrev??0.3,series:ser,asOf:opt.asOf||'2026-08-14',
  per:opt.per??18,pbr:2,divYield:4,perHist:opt.perHist||pr.map(r=>r.per),perRows:pr,
  epsVals:opt.epsVals,corpEvents:opt.corpEvents},'live');return s;};`;
async function P(w=390,h=844,clock){const c=await b.newContext({viewport:{width:w,height:h}});
  const p=await c.newPage();const e=[];p.on('pageerror',x=>e.push(x.message));p.on('dialog',d=>d.dismiss());
  if(clock) await p.clock.install({time:new Date(clock)});
  await p.goto(F);await p.waitForTimeout(600);await p.evaluate(()=>{try{closeModal();closeGuide();}catch(_){}});
  await p.evaluate(src=>{ (0,eval)(src); }, MK);
  return {c,p,e};}


// 1. 隱私模式：判定層不受影響、顯示層全遮
{const {c,p}=await P();
 const r=await p.evaluate(v=>{const __mk=globalThis.__mk;
   state.watchlist.forEach(x=>x.inWatch=false);
   __mk('2330','台積電',{cost:1400,price:1000});          // 賠 28.6% → 🐊
   __mk('2308','台達電',{cost:600,price:1000});           // 賺 66% → 🐎
   renderAll();
   const off={txt:document.getElementById('wlBody').innerText, lv:state.watchlist.find(x=>x.id==='2330').data.pnl};
   setPrivacy(true);renderAll();
   const on={txt:document.getElementById('wlBody').innerText,
     html:document.getElementById('wlBody').innerHTML,
     croc:document.querySelectorAll('#wlBody tr[data-croc="1"]').length};
   // 第十二輪 R2：handleTrade 與百大篩選（filteredList）都已刪除。
   const gone={trade:typeof handleTrade, filter:typeof filteredList};
   setPrivacy(false);
   return {off,on,gone};});
 T('隱私模式不洩漏 🐊／🐎', !/🐊|🐎/.test(r.on.txt), (r.on.txt.match(/🐊|🐎/g)||[]).join(''));
 T('隱私模式不留紅綠色', !/text-rose-400|text-emerald-400/.test(r.on.html.split('m-lab')[2]||''), '');
 T('隱私模式不留 croc-row', r.on.croc===0, 'croc rows='+r.on.croc);
 T('handleTrade 已刪除且未復活', r.gone.trade==='undefined', r.gone.trade);
 T('百大篩選 filteredList 已刪除', r.gone.filter==='undefined', r.gone.filter);
 // 隱私模式現在要守的是新的一句話欄位（見 invariants G8）
 T('隱私模式下不印出損益句', !/賠了|賺了/.test(r.on.txt), (r.on.txt.match(/.{0,10}(賠了|賺了).{0,8}/)||[''])[0]);
 T('隱私模式不影響判定值', r.off.lv!=null, 'pnl='+r.off.lv);
 await c.close();}
// 2. 🦈 鯊魚要能活過重新整理
{const {c,p}=await P();
 const r=await p.evaluate(v=>{const __mk=globalThis.__mk;
   state.watchlist.forEach(x=>x.inWatch=false);
   __mk('2454','聯發科',{holder:-0.42,holderPrev:-0.31});
   const before={h:state.watchlist.find(x=>x.id==='2454').data.holder,
     a:stockAnimals({...state.watchlist.find(x=>x.id==='2454').data,id:'2454'})};
   const snap=JSON.parse(JSON.stringify(snapshot()));
   state.watchlist.forEach(x=>{x.loaded=false;x.data={};});
   applySnapshot(snap,{trusted:true});
   const s=state.watchlist.find(x=>x.id==='2454');
   return {before, after:{h:s.data.holder, a:stockAnimals({...s.data,id:'2454'})}};});
 T('負的大戶變動能存活重新整理', r.after.h===-0.42, JSON.stringify(r));
 T('🦈 鯊魚不會因為存檔而消失', JSON.stringify(r.before.a)===JSON.stringify(r.after.a), JSON.stringify(r));
 await c.close();}
// 3. 🦏 門檻只有一個
{const {c,p}=await P();
 const r=await p.evaluate(v=>{const __mk=globalThis.__mk;
   state.watchlist.forEach(x=>x.inWatch=false);
   __mk('1111','測試A',{debt:0.75}); __mk('2222','測試B',{debt:0.85});
   renderAll();
   const tbl=document.getElementById('wlBody').innerText;
   return {tbl, rhino:document.getElementById('rhinoCount').textContent,
     warn:document.getElementById('rhinoWarn').textContent,
     // 第十二輪 R4：表格已無符號，改數中文句子「借的錢佔資產 N%，超過八成」。
     // 這一條守的東西沒變：表格裡的列數必須等於上方的計數，不得各算各的。
     n75:(tbl.match(/超過八成/g)||[]).length, emoji:(tbl.match(/🦏/g)||[]).length};});
 /* v61：動物欄依作者要求復原，所以 🦏 會回到表格。守的東西沒變：
    表格裡出現幾次，上方的計數就必須是幾——不得各算各的。 */
 T('0.75 不貼 🦏（門檻統一為 80%）', r.emoji===1, `🦏 出現 ${r.emoji} 次，計數 ${r.rhino}`);
 T('白話句子與符號同進同出', r.n75===r.emoji, `句子 ${r.n75} 次 / 符號 ${r.emoji} 次`);
 T('計數與標籤一致', r.rhino==='1', 'count='+r.rhino);
 await c.close();}
// 4. 太舊的資料不判定位階
{const {c,p}=await P();
 const r=await p.evaluate(v=>{const __mk=globalThis.__mk;
   state.watchlist.forEach(x=>x.inWatch=false);
   const s=__mk('2330','台積電',{asOf:'2026-08-14'});
   const fresh=valuate(s.data.pe,s.data);
   s.data.asOf='2026-04-01';                    // 135 天前
   const old=valuate(s.data.pe,s.data);
   s.data.asOf='2026/08/14';                    // 日期格式改變
   const fmt2=valuate(s.data.pe,s.data);
   s.data.asOf='not-a-date';
   const bad=valuate(s.data.pe,s.data);
   return {fresh:fresh.key, old:old.key, oldLabel:old.label, fmt2:fmt2.key, bad:bad.key, badLabel:bad.label,
     sd1:staleDays('2026/08/14'), sd2:staleDays('2026-08-14 00:00:00'), sd3:staleDays('xyz')};});
 T('135 天前的資料不判定位階', r.old==='demo' && /太舊/.test(r.oldLabel), JSON.stringify({k:r.old,l:r.oldLabel}));
 T('斜線日期格式仍可判讀', typeof r.sd1==='number', 'staleDays=' + r.sd1);
 T('帶時分秒的日期仍可判讀', typeof r.sd2==='number', 'staleDays=' + r.sd2);
 T('無法判讀的日期不當成正常', r.sd3==='unknown' && r.bad==='demo', JSON.stringify({sd3:r.sd3,k:r.bad}));
 await c.close();}
// 5. 休市表過期要說出來
{const {c,p}=await P(390,844,'2029-02-13T02:30:00Z');   // 台北 10:30，農曆年（表外）
 const r=await p.evaluate(()=>{updateSessionBadge();
   const b=document.getElementById('sessionBadge');
   return {txt:b.textContent.trim(), stale:holidayTableStale(), open:marketSession().open};});
 T('休市表過期時不謊報盤中', !/盤中/.test(r.txt), JSON.stringify(r));
 T('休市表過期要說出來', /過期/.test(r.txt), r.txt);
 await c.close();}
// 6. 景氣循環股不給綠燈
{const {c,p}=await P();
 const r=await p.evaluate(v=>{const __mk=globalThis.__mk;
   state.watchlist.forEach(x=>x.inWatch=false);
   // 長榮形狀：四季連續創新高、本益比 1.4 倍、五年歷史 30~90
   const hist=Array.from({length:1200},(_,i)=>30+i/1200*60);
   const s=__mk('2603','長榮',{price:170,per:1.4,perHist:hist,epsVals:[12,22,35,45]});
   const cyc=valuate(s.data.pe,s.data);
   // 穩定獲利的公司不該被誤殺
   const s2=__mk('2412','中華電',{price:120,per:24,perHist:Array.from({length:1200},()=>24+Math.sin(Math.random())*2),epsVals:[1.2,1.25,1.18,1.22]});
   const stable=valuate(s2.data.pe,s2.data);
   return {cyc:{k:cyc.key,l:cyc.label,lv:cyc.level,li:cyc.light,rs:cyc.long&&cyc.long.reasons,cf:cyc.long&&cyc.long.confidence},
           stable:{k:stable.key,l:stable.label,lv:stable.level,li:stable.light}};});
 /* v93g：這一條原本驗 key==='trap'，那是**實作**不是**不變量**。
    真正要守的事寫在這一節標題上：景氣循環股不給綠燈。
    longValuation() 之後長榮這個形狀改判成 position=cheap／confidence=limited／
    pricing=available——價位照給（使用者定的契約），但燈號降階。
    實測前提：長榮式 [12,22,35,45] 與純成長股 [1,2,3,4] 的 cv（0.44 vs 0.45）
    與高低差（3.75 vs 4.00）幾乎相同，EPS 形狀分不出「成長」與「循環頂點」，
    所以這裡守的只能是「不給綠燈」，不可能是「認出循環股」。 */
 T('景氣循環頂點不給綠燈', r.cyc.lv!=='buy' && r.cyc.li!=='🟢', JSON.stringify(r.cyc));
 T('而且要說出為什麼降階', (r.cyc.rs||[]).includes('EPS_MONOTONIC_UP') && r.cyc.cf==='limited', JSON.stringify(r.cyc.rs));
 T('穩定獲利的公司不被誤殺', r.stable.k!=='trap' && r.stable.l.indexOf('不夠可信')<0, JSON.stringify(r.stable));
 await c.close();}
// 7. 本益比是趨勢時要說出來
{const {c,p}=await P();
 const r=await p.evaluate(v=>{const __mk=globalThis.__mk;
   const trend=Array.from({length:1200},(_,i)=>30-i/1200*20);      // 30 → 10 單調下修
   const flat=Array.from({length:1200},(_,i)=>18+Math.sin(i/37)*4);
   return {t:peBands('半導體業',{perHist:trend,id:'X'}).short,
           f:peBands('半導體業',{perHist:flat,id:'Y'}).short};});
 T('單調下修的本益比會標「趨勢中」', /趨勢/.test(r.t), JSON.stringify(r));
 T('震盪的本益比不會誤標', !/趨勢/.test(r.f), JSON.stringify(r));
 await c.close();}
// 8. 殖利率不再乘成金額
{const {c,p}=await P();
 const r=await p.evaluate(v=>{const __mk=globalThis.__mk;
   state.watchlist.forEach(x=>x.inWatch=false);
   __mk('2412','中華電',{cost:100,price:120,shares:3000,
     corpEvents:[{kind:'div',date:'2024-07-15',before:120,after:115.5,amt:4.5,type:'息'},
                 {kind:'div',date:'2025-07-15',before:120,after:115.5,amt:4.5,type:'息'}]});
   renderAll();return document.getElementById('myPnlBody').innerText;});
 T('不再把殖利率乘成「一年可領 X 元」', !/一年大約 [\d,]+ 元/.test(r), (r.match(/一年大約[^\n]*/)||[''])[0]);
 T('仍顯示過去實際配的現金', /實際配了現金/.test(r), '');
 await c.close();}
// 9. 不再宣稱「配置健康」
{const {c,p}=await P();
 const r=await p.evaluate(v=>{const __mk=globalThis.__mk;
   state.watchlist.forEach(x=>x.inWatch=false);
   __mk('2330','台積電',{cost:800,price:1000}); __mk('2308','台達電',{cost:400,price:500});
   __mk('2454','聯發科',{cost:900,price:1000}); __mk('2412','中華電',{cost:100,price:120});
   // 第十二輪 R2：區塊 B（資產配置）整段刪除，allocWarn 不再存在。
   // 這一條斷言的內容（不得宣稱「配置健康」）改成掃全頁——刪掉之後更不能有人把它加回來。
   renderAll();return {warn:!!document.getElementById('allocWarn'), body:document.body.innerText};});
 T('allocWarn 存在（區塊 B 已於 v61 復原）', r.warn, String(r.warn));
 T('全頁不再宣稱「配置健康／分散程度良好」', !/配置健康|分散程度良好/.test(r.body), '');
 await c.close();}
// 10. 溢出
for(const w of [320,390,768,1280]) for(const fs of ['sm','big']){
  const {c,p}=await P(w,900);
  await p.evaluate(v=>{state.fontScale=v;applyFontScale();},fs);
  await p.waitForTimeout(200);
  const o=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  T(`overflow ${w}px fs=${fs}`, o<=1,'ov='+o); await c.close();
}
console.log(fail?`\n❌ ${fail} 項失敗`:'\n✅ 全部通過');
await b.close();
