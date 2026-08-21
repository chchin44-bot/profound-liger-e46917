/* v64：提示訊息（toast）改從上方進來。
   這支測的不是「toast 在不在」，是「toast 有沒有蓋住待按的按鈕」——
   上一輪的教訓就是測了東西在不在、沒測它會不會擋路。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};

await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2400);
await p.evaluate(()=>{try{closeModal()}catch(e){}});
await p.mouse.move(5,5);

async function shoot(n){ await p.screenshot({path:`./tests/r13/toast_${n}.png`}); }

/* 可見按鈕清單（頁首 + 首屏），toast 不得與其中任何一顆相交 */
const buttons = () => p.evaluate(()=>{
  const vis=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();
    return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0&&r.top<innerHeight&&r.bottom>0;};
  /* v83：提示訊息本身現在帶一顆 ✕（讓使用者關得掉）。
     那顆按鈕當然「被提示蓋住」——它就在提示裡面。把它算進來的話，
     這個檢查會永遠失敗，而且失敗的理由跟它想守的東西無關。 */
  return [...document.querySelectorAll('button,a[href],input,select,[role="button"],[onclick]')]
    .filter(el=>!el.closest('.toast-sa')).filter(vis)
    .map(el=>{const r=el.getBoundingClientRect();
      return {t:(el.textContent||el.value||el.id||'').trim().slice(0,14),
              x:r.left,y:r.top,w:r.width,h:r.height};});
});
const toasts = () => p.evaluate(()=>[...document.querySelectorAll('.toast-sa')].map(el=>{
  const r=el.getBoundingClientRect(); return {t:el.textContent.slice(0,14),x:r.left,y:r.top,w:r.width,h:r.height};}));
const overlap=(a,c)=> !(a.x+a.w<=c.x || c.x+c.w<=a.x || a.y+a.h<=c.y || c.y+c.h<=a.y);

for(const fs of ['sm','big']){
  /* 一定要真的切字級：上一版呼叫了一個根本不存在的函式，
     於是 [sm] 與 [big] 量到同一組數字，測試「通過」了但什麼也沒測到。 */
  await p.evaluate(f=>{ state.fontScale = f; applyFontScale(); }, fs);
  await p.waitForTimeout(400);
  const hdrH = await p.evaluate(()=>Math.round(document.querySelector('header').getBoundingClientRect().height));
  T(`[${fs}] 字級真的切過去了`, await p.evaluate(f=>state.fontScale===f, fs), fs);

  // 一則
  await p.evaluate(()=>{ document.querySelectorAll('.toast-sa').forEach(e=>e.remove()); toastQueue.length=0; toast('資料已經存好了','ok'); });
  await p.waitForTimeout(350);
  let ts = await toasts();
  T(`[${fs}] 一則提示會出現`, ts.length===1, JSON.stringify(ts));
  /* 位置的判準只有一條：掛在頁首下緣。
     「在上半部」這種說法對這個版面不成立——首屏金額在頁首**上面**，
     所以「上半部」正好是最不能蓋的那一塊。 */
  /* v68：提示改用 position:sticky 且插在 <body> 最前面——
     它在文件流裡佔位置（內容被往下推、不被蓋住），捲動時又黏在頂端（捲下去也看得到）。 */
  const model = await p.evaluate(()=>{
    const t=document.querySelector('.toast-sa');
    return { pos:getComputedStyle(t).position, first: document.body.firstElementChild===t };});
  T(`[${fs}] 提示是 sticky（會佔位置，不覆蓋）`, model.pos==='sticky', model.pos);
  T(`[${fs}] 提示插在頁面最前面`, model.first);
  T(`[${fs}] 提示貼在畫面頂端`, ts[0].y <= 24, `y=${Math.round(ts[0].y)}`);

  /* 連丟三則：畫面上一次只能有一則，其餘進排隊區。
     實測理由寫在 source 的 flushToasts 註解裡——第三則一定會蓋住首屏金額。 */
  await p.evaluate(()=>{ toast('已經抓到 3 檔的最新價格','info'); toast('本益比是官方公布的','warn'); });
  await p.waitForTimeout(400);
  ts = await toasts();
  T(`[${fs}] 一次只放一則，其餘排隊`, ts.length===1, `畫面上 ${ts.length} 則，排隊 ${await p.evaluate(()=>toastQueue.length)} 則`);
  T(`[${fs}] 後到的沒有被丟掉（有進排隊區）`, await p.evaluate(()=>toastQueue.length)>=2, `排隊 ${await p.evaluate(()=>toastQueue.length)} 則`);
  T(`[${fs}] 這一則在畫面內`, ts.every(t=>t.y>=0 && t.y+t.h<=844), JSON.stringify(ts.map(t=>Math.round(t.y+t.h))));

  // 核心：一顆按鈕都不能被蓋住
  const btns = await buttons();
  const hit = [];
  for(const t of ts) for(const bn of btns) if(overlap(t,bn)) hit.push(`${t.t}→${bn.t}`);
  T(`[${fs}] 沒有蓋住任何按鈕`, hit.length===0, hit.join(' , '));
  T(`[${fs}] 「印一份給人看」沒被蓋住`, !hit.some(h=>/印一份/.test(h)), hit.join(' , '));

  await shoot(fs);
  await p.evaluate(()=>{ document.querySelectorAll('.toast-sa').forEach(e=>e.remove()); toastQueue.length=0; });
}

// 捲到頁面下方時，提示仍然固定在上方（不會跟著跑到內容中間）
await p.evaluate(()=>{ try{ setFontScale('mid'); }catch(e){} window.scrollTo(0, 1200); });
await p.waitForTimeout(300);
await p.evaluate(()=>toast('捲動之後的提示','info'));
await p.waitForTimeout(350);
const st = (await toasts())[0];
T('捲到頁面下方時提示仍看得到（sticky 黏在頂端）', st && st.y >= 0 && st.y < 100, st?`y=${Math.round(st.y)}`:'沒有 toast');

/* 回到頂端：版面順序是「首屏金額 → 頁首 → 其餘」，
   提示必須掛在頁首下緣，絕對不能蓋住那塊金額。 */
/* 直接重載，拿一個乾淨的頂端狀態——用 scrollTo(0,0) 回捲在這頁不可靠（量到過負的 scrollY）。 */
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2400);
await p.evaluate(()=>{try{closeModal()}catch(e){}}); await p.mouse.move(5,5);
/* 要有真實部位，首屏才會印出那個大字金額；空白狀態下量到的「最大的字」
   會是某顆按鈕的標籤，那就不是這條斷言要守的東西了。 */
await p.evaluate(()=>{
  const s=state.watchlist.find(x=>x.id==='2330'); s.inWatch=true;
  s.txns=[{id:'a',kind:'buy',date:'2024-01-05',shares:2000,price:1900}]; s.txnsMigrated=true;
  const ser=[]; const t=new Date('2026-08-14');
  for(let i=400;i>=0;i--){const d=new Date(t-i*86400000);ser.push({date:d.toISOString().slice(0,10),close:2395});}
  applyStockData(s,{price:2395,eps:86.28,debt:.31,holder:null,holderPrev:null,series:ser,
    asOf:'2026-08-14',per:27.76,perHist:new Array(400).fill(27.76),perAsOf:'2026-08-14'},'live');
  applyPosition(s); renderAll();
});
await p.waitForTimeout(500);
await p.evaluate(()=>{ toast('回到頂端的提示','info'); toast('第二則','info'); });
await p.waitForTimeout(400);
const back = await toasts();
const hb0 = await p.evaluate(()=>Math.round(document.querySelector('header').getBoundingClientRect().bottom));
T('回到頂端時，提示仍貼在畫面頂端', back[0] && back[0].y <= 24, `y=${back[0]&&Math.round(back[0].y)} / header.bottom=${hb0}`);
/* 版面順序是「首屏金額區 → 頁首 → 其餘內容」。
   首屏金額區＝頁首上方的整塊，提示一寸都不能侵入。 */
/* 貼頂端的代價是蓋到最上面那行小標題，但不能蓋到金額本身。
   這裡量的是首屏區塊裡字最大的那個元素。 */
const big = await p.evaluate(()=>{
  const h=document.querySelector('header').getBoundingClientRect();
  const els=[...document.querySelectorAll('div,span,strong,p')]
    .filter(el=>el.children.length===0 && el.textContent.trim())
    .map(el=>({el, r:el.getBoundingClientRect(), fs:parseFloat(getComputedStyle(el).fontSize)}))
    .filter(o=>o.r.top < h.top && o.r.height>0);
  if(!els.length) return null;
  const b=els.sort((a,c)=>c.fs-a.fs)[0];
  return {t:b.el.textContent.trim().slice(0,18), fs:b.fs, x:b.r.left,y:b.r.top,w:b.r.width,h:b.r.height};
});
T('找得到首屏最大的那個字', !!big, big && `「${big.t}」${big.fs}px @y=${Math.round(big.y)}`);
if(big) T('首屏最大的那個字沒有被提示蓋住', !back.some(t=>overlap(t,big)),
  `字 y=${Math.round(big.y)}~${Math.round(big.y+big.h)}，提示 y=${back.map(t=>Math.round(t.y)).join(',')}`);
const btns0 = await buttons();
const hit0 = [];
for(const t of back) for(const bn of btns0) if(overlap(t,bn)) hit0.push(`${t.t}→${bn.t}`);
T('回到頂端時也沒有蓋住任何按鈕', hit0.length===0, hit0.join(' , '));

T('全程沒有執行期錯誤', errs.length===0, errs.join(' | '));
console.log(fail? `\nFAIL=${fail}` : '\nFAIL=0');
await b.close();
process.exit(fail?1:0);
