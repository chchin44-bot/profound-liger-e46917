/* 使用者截圖：表格裡的說明文字互相重疊。1395px 桌機寬。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await (await b.newContext({viewport:{width:1395,height:900}})).newPage();
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2400);
await p.evaluate(()=>{try{closeAllModals()}catch(e){}});
await p.evaluate(()=>{
  const ids=['2327','2356','7781'];
  state.watchlist.forEach(x=>{x.inWatch=false;});
  ids.forEach((id,i)=>{
    let s=state.watchlist.find(x=>x.id===id);
    if(!s){ s={id,name:['國巨','英濟','旭富'][i],ind:'電子零組件',type:'user',inWatch:true,
              cost:0,shares:1000,txns:[],txnHide:[],txnsMigrated:true,data:{}}; state.watchlist.push(s); }
    s.inWatch=true; s.cost=[599.95,69.70,28.18][i]; s.shares=[30,50,13000][i];
    s.txns=[{id:'b'+i,kind:'buy',date:'2024-01-05',shares:s.shares,price:s.cost}]; s.txnsMigrated=true;
    const ser=[],ph=[],t=new Date('2026-08-18');
    for(let k=1200;k>=0;k--){ const px=[576,64.9,27.4][i]*(1+Math.sin(k/61)*0.3);
      ser.push({date:new Date(t-k*86400000).toISOString().slice(0,10),close:+px.toFixed(2)});
      ph.push(+(5.7+Math.abs(Math.sin(k/37))*84).toFixed(1)); }
    applyStockData(s,{price:[576,64.9,27.4][i],eps:[14,3,-1][i],debt:[.647,.836,.698][i],
      holder:[.30,.92,-.03][i],holderPrev:[.2997,.9108,-.0297][i],series:ser,asOf:'2026-08-18',
      per:[40.9,21.5,null][i],perHist:ph,perAsOf:'2026-08-17',peSrc:'official'},'live');
    applyPosition(s);
  });
  renderAll();
});
await p.waitForTimeout(700);

const r = await p.evaluate(()=>{
  const bad=[], lit=[];
  const cells=[...document.querySelectorAll('#wlBody td')];
  // ① 內容有沒有溢出自己的儲存格
  cells.forEach(td=>{
    const tr=td.getBoundingClientRect();
    [...td.querySelectorAll('*')].forEach(el=>{
      const r=el.getBoundingClientRect();
      if(r.width===0||r.height===0) return;
      const over = Math.round(Math.max(0, tr.left - r.left) + Math.max(0, r.right - tr.right));
      if(over > 4) bad.push({ cell: td.getAttribute('data-label')||'?',
        el: el.className.toString().slice(0,26), over,
        txt: (el.textContent||'').replace(/\s+/g,' ').trim().slice(0,32) });
    });
  });
  // ② 畫面上有沒有字面的 ${...}
  /* <script>／<style> 的內容也是文字節點，裡面出現 ${} 完全正常——
     要掃的是「使用者眼睛看得到的字」，不是原始碼。 */
  document.querySelectorAll('body *').forEach(el=>{
    if(/^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT)$/.test(el.tagName)) return;
    [...el.childNodes].forEach(n=>{ if(n.nodeType===3 && /\$\{/.test(n.textContent))
      lit.push(n.textContent.replace(/\s+/g,' ').trim().slice(0,60)); });
  });
  /* 只驗「有沒有溢出」是靠運氣的——句子夠短就不會溢出，測試就通過了，
     然後某天資料變長，使用者又看到重疊。
     所以再加一條結構性的檢查：儲存格裡凡是「一整句話」的區塊，
     它的 white-space 就不可以是 nowrap，跟這次那句話多長無關。 */
  const nowrapProse=[];
  [...document.querySelectorAll('#wlBody td, #t100Body td')].forEach(td=>{
    [...td.querySelectorAll('div,p,span')].forEach(el=>{
      /* 要看的是「這個元素自己直接持有的文字」，不是 textContent。
         textContent 會把子元素的字全接起來，於是純容器（例如三行資訊的外框、
         裝兩顆按鈕的 flex 容器）也被算成「一整句話」——那是誤報，
         它們的子元素各自會換行，容器 nowrap 不影響任何東西。 */
      const t=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();
      if(t.length < 18) return;                       // 短的是數字或標籤，本來就該 nowrap
      if(el.closest('.tag,.btn,.chip,.nb')) return;   // 徽章與按鈕是刻意不換行的
      if(getComputedStyle(el).whiteSpace === 'nowrap')
        nowrapProse.push({ cell: td.getAttribute('data-label')||'?',
                           cls: el.className.toString().slice(0,30), txt: t.slice(0,40) });
    });
  });
  return { overflow: bad, nowrapProse, literal:[...new Set(lit)],
           scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth };
});
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
r.overflow.slice(0,12).forEach(x=>console.log('   溢出：', JSON.stringify(x)));
T('表格裡沒有任何內容溢出自己的儲存格（字不會重疊）', r.overflow.length===0,
  r.overflow.length + ' 個：' + JSON.stringify(r.overflow.slice(0,3)));
r.nowrapProse.slice(0,8).forEach(x=>console.log('   不換行的句子：', JSON.stringify(x)));
T('儲存格裡沒有「不換行的整句話」（跟這次的字長無關的結構檢查）',
  r.nowrapProse.length===0, r.nowrapProse.length+' 個：'+JSON.stringify(r.nowrapProse.slice(0,3)));
T('畫面上沒有字面的 ${...}（樣板字串沒有寫成單引號）', r.literal.length===0, JSON.stringify(r.literal));
T('沒有橫向溢出', r.scrollW - r.clientW <= 1, String(r.scrollW - r.clientW));

/* 頁尾那句「本頁 N 檔都是真實數據」是漏字的原點，直接驗它印出數字 */
const foot = await p.evaluate(()=>document.getElementById('pageInfo').textContent.replace(/\s+/g,' ').trim());
console.log('   頁尾：', foot);
T('頁尾印出真正的檔數，不是 ${items.length}', /本頁 \d+ 檔/.test(foot) && !/\$\{/.test(foot), foot);

/* 說明句要真的折成多行（不是靠縮字級硬塞成一行） */
const lines = await p.evaluate(()=>{
  const n=document.querySelector('#wlBody .pe-note'); if(!n) return null;
  const cs=getComputedStyle(n);
  return { h:Math.round(n.getBoundingClientRect().height), lh:parseFloat(cs.lineHeight)||16,
           ws:cs.whiteSpace, w:Math.round(n.getBoundingClientRect().width) };
});
console.log('   說明句：', JSON.stringify(lines));
T('說明句可以換行（white-space 不是 nowrap）', lines && lines.ws!=='nowrap', lines&&lines.ws);
T('說明句確實折成多行', lines && lines.h > lines.lh*1.5, lines&&`高 ${lines.h}px / 行高 ${lines.lh}px`);
T('說明句有寬度上限，不會把整欄撐開', lines && lines.w <= 240, lines&&lines.w+'px');
T('說明句有寬度下限，不會擠成細長條', lines && lines.w >= 170, lines&&lines.w+'px');

await p.screenshot({path:'./tests/r13/overlap.png', fullPage:false});
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
