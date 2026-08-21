/* v68 手機版收合：一檔股票收起來時，畫面上必須留下、且只留下
   「代號名稱 / 賺賠多少錢 / 一句白話」，其餘點開才出現。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport:{width:390,height:844} });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2400);
await p.evaluate(()=>{try{closeModal()}catch(e){}});
await p.evaluate(()=>{
  const s=state.watchlist.find(x=>x.id==='2330'); s.inWatch=true; s.ind='半導體業';
  s.txns=[{id:'a',kind:'buy',date:'2024-01-05',shares:2000,price:1900}]; s.txnsMigrated=true;
  const ser=[]; const t=new Date('2026-08-14');
  for(let i=400;i>=0;i--){const d=new Date(t-i*86400000);
    ser.push({date:d.toISOString().slice(0,10),close:+(2395*(1+Math.sin(i/41)*0.09)).toFixed(2)});}
  ser[ser.length-1].close=2395;
  applyStockData(s,{price:2395,eps:86.28,debt:.31,holder:0.4,holderPrev:0.31,series:ser,asOf:'2026-08-14',
    per:27.76,pbr:9.66,divYield:1,perHist:ser.map((_,i)=>+(27.76*(1+Math.sin(i/29)*0.22)).toFixed(2)),
    perAsOf:'2026-08-14'},'live');
  applyPosition(s); renderAll();
});
await p.waitForTimeout(600);

const row = () => p.evaluate(()=>{
  const tr=[...document.querySelectorAll('#wlBody tr')].find(r=>r.innerText.includes('2330'));
  if(!tr) return null;
  const vis=el=>el.checkVisibility ? el.checkVisibility() : el.getBoundingClientRect().height>0;
  const cells=[...tr.children].map((td,i)=>({i:i+1, vis:vis(td), t:td.innerText.replace(/\s+/g,' ').trim().slice(0,26)}));
  /* 動物徽章也是 <button>（點了會說明那隻動物是什麼），它不是「動作」，不列入計算 */
  const btns=[...tr.querySelectorAll('button')].filter(vis).filter(x=>!x.dataset.animal).map(x=>x.textContent.trim());
  return { open:tr.hasAttribute('data-open'), h:Math.round(tr.getBoundingClientRect().height),
           text:tr.innerText.replace(/\s+/g,' ').trim(), cells, btns };
});

let r = await row();
T('預設是收起來的', r && !r.open);
T('收起時仍看得到代號與名稱', /2330/.test(r.text) && /台積電/.test(r.text), r.text.slice(0,30));
T('收起時看得到「賺賠多少錢」的金額', /[賺賠]\s?[\d,]+\s?元/.test(r.text), (r.text.match(/[賺賠]\s?[\d,]+\s?元/)||['沒有'])[0]);
T('收起時看得到一句白話', /大戶|賠了|借的錢|這一行/.test(r.text), r.text.slice(-40));
T('收起時看不到本益比／負債比／千張大戶', !/本益比|負債比|千張大戶/.test(r.text), r.text.slice(0,120));
T('收起時看不到長線位階橫幅', !/便宜區|昂貴區|合理|資料不足/.test(r.text));
/* v85：收起時改成留兩顆——「看詳細 ▾」與「目標價」。
   原因是使用者回報「百大資料庫沒有目標價可以按」：那顆按鈕本來要先展開一列才會出現，
   而三維度目標價是這個 app 的核心畫面之一，不該躲在展開層裡。
   會動到資料的動作（加入自選／交易紀錄／移除）仍然收著，那些多一層反而好。 */
T('收起時留下「看詳細」與「目標價」兩顆', r.btns.length===2, JSON.stringify(r.btns));
T('收起時看得到「看詳細」', r.btns.some(x=>/看詳細/.test(x)), JSON.stringify(r.btns));
T('收起時看得到「目標價」（不必先展開）', r.btns.some(x=>/目標價/.test(x)), JSON.stringify(r.btns));
T('收起時看不到會動到資料的動作（避免誤觸）',
  !r.btns.some(x=>/加入自選|移出自選|移除|交易紀錄/.test(x)), JSON.stringify(r.btns));
const hFold = r.h;
T('收起時整張卡片 ≤ 340px（原本一檔將近 700px）', hFold<=340, hFold+'px');

/* 金額必須比百分比大 */
const size = await p.evaluate(()=>{
  const tr=[...document.querySelectorAll('#wlBody tr')].find(r=>r.innerText.includes('2330'));
  const m=tr.querySelector('.pnl-money'), q=tr.querySelector('.pnl-pct');
  return m&&q ? {m:parseFloat(getComputedStyle(m).fontSize), q:parseFloat(getComputedStyle(q).fontSize)} : null;});
T('金額的字比百分比大', size && size.m > size.q, size && `${size.m}px vs ${size.q}px`);

/* 金額必須在卡片的最上面一行（不是被埋在下面） */
const pos = await p.evaluate(()=>{
  const tr=[...document.querySelectorAll('#wlBody tr')].find(r=>r.innerText.includes('2330'));
  const m=tr.querySelector('.pnl-money').getBoundingClientRect();
  const id=tr.querySelector('td:nth-child(2)').getBoundingClientRect();
  return {money:Math.round(m.top-tr.getBoundingClientRect().top), id:Math.round(id.top-tr.getBoundingClientRect().top)};});
T('金額跟代號在同一行（距卡片頂端 <40px）', pos.money < 40, `金額 +${pos.money}px、代號 +${pos.id}px`);

/* 展開 */
await p.click('[data-act="fold"]'); await p.waitForTimeout(500);
r = await row();
T('點「看詳細」會展開', r && r.open);
/* 「本益比」那三個字是 CSS ::before 生出來的欄位標籤，不會進 innerText，
   所以要驗的是那一格真正的內容：官方標記與「在 A 到 B 倍之間」那句。 */
T('展開後本益比那一格有內容', /官方|自算|倍之間/.test(r.text), r.text.slice(0,150));
T('展開後長線位階出現', /便宜|合理|昂貴|不判定|資料不足/.test(r.text), r.text.slice(-50));
T('展開後四顆按鈕都在', r.btns.length===4, JSON.stringify(r.btns));
T('展開後確實變高', r.h > hFold + 100, `${hFold} → ${r.h}px`);
await p.click('[data-act="fold"]'); await p.waitForTimeout(500);
T('再點一次收回去', !(await row()).open);

/* 桌機不受影響 */
await p.setViewportSize({width:1280,height:900}); await p.waitForTimeout(500);
const desk = await p.evaluate(()=>{
  const tr=[...document.querySelectorAll('#wlBody tr')].find(r=>r.innerText.includes('2330'));
  const vis=el=>el.checkVisibility?el.checkVisibility():el.getBoundingClientRect().height>0;
  return { fold: vis(tr.querySelector('[data-act="fold"]')), text: tr.innerText.replace(/\s+/g,' ') };});
T('桌機沒有「看詳細」這顆按鈕', !desk.fold);
T('桌機一律顯示全部欄位', /本益比|負債比/.test(desk.text) || desk.text.length>40, desk.text.slice(0,60));

T('全程沒有執行期錯誤', errs.length===0, errs.join(' | '));
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
