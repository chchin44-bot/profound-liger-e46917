import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await (await b.newContext({viewport:{width:390,height:844}, deviceScaleFactor:2})).newPage();
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2400);
await p.evaluate(()=>{try{closeModal()}catch(e){}});
await p.evaluate(()=>{
  const mk=(id,name,ind,price,cost,sh,per,dy)=>{
    let s=state.watchlist.find(x=>x.id===id);
    if(!s){ s={id,name,ind,inWatch:true,txns:[],type:'stock'}; state.watchlist.push(s); }
    s.inWatch=true; s.name=name; s.ind=ind; s.txnsMigrated=true;
    s.txns=[{id:'t'+id,kind:'buy',date:'2023-05-11',shares:sh,price:cost}];
    const ser=[],ev=[]; const t=new Date('2026-08-14');
    for(let i=800;i>=0;i--){const d=new Date(t-i*86400000);
      ser.push({date:d.toISOString().slice(0,10),close:+(price*(1+Math.sin(i/41)*0.09)).toFixed(2)});}
    ser[ser.length-1].close=price;
    ['2024-07-15','2025-07-14','2026-07-13'].forEach(dt=>ev.push({kind:'div',date:dt,before:price*1.02,after:price,amt:price*0.02,type:'cash'}));
    applyStockData(s,{price,eps:+(price/per).toFixed(2),debt:.34,holder:0.4,holderPrev:0.31,series:ser,corpEvents:ev,
      asOf:'2026-08-14',per,pbr:2.1,divYield:dy,perHist:ser.map((_,i)=>+(per*(1+Math.sin(i/29)*0.22)).toFixed(2)),
      perAsOf:'2026-08-14'},'live');
    applyPosition(s);
  };
  mk('7781','昕力資','資訊服務業',25.20,28.18,14000,18,3.1);
  mk('2356','英業達','電腦及週邊設備業',66.70,69.70,50,14,4.2);
  mk('2327','國巨','電子零組件業',608,601.43,20,30,1.1);
  state.selected='7781'; state.fontScale='sm'; applyFontScale(); renderAll();
});
await p.waitForTimeout(900);
await p.evaluate(()=>{document.querySelectorAll('.toast-sa').forEach(e=>e.remove());});
await p.screenshot({path:'./tests/r13/eddie_0.png'});
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};

/* 1. 除權息教學區塊預設收合 */
const fold = await p.evaluate(()=>{
  /* v85 之後畫面上有多個 .foldbox，第一個不一定是除權息教學那塊。
     用標題文字定位，不要靠出現順序——靠順序的測試遲早會抓到別人。 */
  /* 只看 <summary> 的文字，不要看整塊的 textContent——
     手續費那一塊的內文裡也有「配息」兩個字，用 textContent 會抓錯人。 */
  const d=[...document.querySelectorAll('.foldbox')]
      .find(x=>/除權息|除息/.test((x.querySelector('summary')||{}).textContent||''))
        || document.querySelector('.foldbox');
  if(!d) return null;
  if(!d.querySelector('.foldbody')) return {noBody:true, head:(d.querySelector('summary')||{}).innerText};
  const body=d.querySelector('.foldbody');
  return {open:d.open, h:Math.round(d.getBoundingClientRect().height),
          head:d.querySelector('summary').innerText.replace(/\s+/g,' ').trim(),
          bodyVis: body.checkVisibility? body.checkVisibility() : false,
          sumH: Math.round(d.querySelector('summary').getBoundingClientRect().height)};});
T('除權息區塊存在', !!fold);
T('預設是收起來的', fold && !fold.open);
T('收起時標題那句仍看得見', fold && /錢沒有不見/.test(fold.head), fold&&fold.head.slice(0,30));
T('收起時內文確實藏起來', fold && !fold.bodyVis);
T('收起時整塊 ≤ 120px（原本約 500px）', fold && fold.h<=120, fold&&fold.h+'px');
T('可點區 ≥ 44px', fold && fold.sumH>=44, fold&&fold.sumH+'px');
const hFold = fold.h;
/* 用同一個定位方式貫穿整支測試。先前只修了第一個 evaluate，
   後面的 click 與 re-query 還在抓 document.querySelector('.foldbox')（＝別人）。 */
const DIV = '[data-t=divbox] > summary';
await p.evaluate(()=>{ const d=[...document.querySelectorAll('.foldbox')]
    .find(x=>/除權息|除息/.test((x.querySelector('summary')||{}).textContent||''));
  if(d) d.setAttribute('data-t','divbox'); });
await p.click(DIV); await p.waitForTimeout(350);
const opened = await p.evaluate(()=>{const d=document.querySelector('[data-t=divbox]');
  return {open:d.open, h:Math.round(d.getBoundingClientRect().height), t:d.innerText};});
T('點開會展開', opened.open && opened.h > hFold + 150, `${hFold} → ${opened.h}px`);
T('展開後看得到殖利率的警語', /殖利率是/.test(opened.t));
T('展開後看得到二代健保那一句', /二代健保/.test(opened.t));
await p.click(DIV); await p.waitForTimeout(350);
T('再點一次收回去', !(await p.evaluate(()=>document.querySelector('[data-t=divbox]').open)));

/* 2. 這個情境會觸發「權息同日」訊息——正是印出 <strong> 的那一段 */
const txt = await p.evaluate(()=>document.body.innerText);
T('畫面上出現權息同日的提醒', /又除權又除息/.test(txt));
const leaked = [...new Set((txt.match(/<\/?(strong|em|b|div|span|br|p|code)\b[^>]*>/gi)||[]))];
T('畫面文字沒有印出 HTML 標籤', leaked.length===0, leaked.join(' '));

/* 3. 首屏那一塊不該再是一整個螢幕的教學文 */
const firstH = await p.evaluate(()=>Math.round(document.body.children[0].getBoundingClientRect().height));
console.log(`     （首屏區塊高 ${firstH}px、全頁 ${await p.evaluate(()=>document.documentElement.scrollHeight)}px）`);

console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
