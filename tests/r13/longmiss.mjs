/* v86：長線價位被抑制時，畫面必須在**原地**說明為什麼——
   使用者的原話是「為什麼沒有長期價格」，舊版是默默消失，一個字都沒有。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await (await b.newContext({viewport:{width:390,height:900}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2400);
await p.evaluate(()=>{try{closeAllModals()}catch(e){}});

/* 重現國巨的形狀：本益比 38.8，而過去五年都在 8~18 倍 → 現價遠高於昂貴價 */
const mk = (perNow, perHistLo, perHistHi, price) => p.evaluate(([perNow,lo,hi,price])=>{
  const s=state.watchlist.find(x=>x.id==='2330'); s.inWatch=true;
  const ser=[],ph=[],t=new Date('2026-08-18');
  for(let k=1250;k>=0;k--){
    ser.push({date:new Date(t-k*86400000).toISOString().slice(0,10), close: k<5 ? price : price*1.3});
    ph.push(+(lo + (hi-lo)*Math.abs(Math.sin(k/53))).toFixed(1));
  }
  ph[ph.length-1]=perNow;
  applyStockData(s,{price,eps:price/perNow,debt:.4,series:ser,asOf:'2026-08-18',
    per:perNow,perHist:ph,perAsOf:'2026-08-18',peSrc:'official'},'live');
  applyPosition(s);
  const html = priceLadder(s.data);
  const tmp=document.createElement('div'); tmp.innerHTML=html;
  const txt = tmp.textContent.replace(/\s+/g,' ');
  /* 只看價位清單那一塊。說明文字裡本來就會寫那三個名字，
     拿整段文字去 regex 會把說明本身當成「有列出來」——第一版就這樣自打嘴巴。 */
  const listBox = tmp.querySelector('.bg-slate-950\\/50');
  const listTxt = listBox ? listBox.textContent.replace(/\s+/g,' ') : '';
  return { txt, listTxt, broken: !!s.data.targets.longBroken, longOk: !!s.data.targets.longOk,
           /* v93g：這三個名字在 v93e 就被改掉了，舊 regex 因此永遠回 false——
              「不列出長線三條」那一條於是綠得毫無意義，而「正常股仍然列出」永遠紅。
              同一個錯誤同時製造假綠與假紅。 */
           hasLong: /長期便宜參考價|長期合理參考價|長期偏貴參考價/.test(listTxt) };
}, [perNow,perHistLo,perHistHi,price]);

const brk = await mk(38.8, 8, 18, 576);
console.log('  國巨形狀：', JSON.stringify({broken:brk.broken, hasLong:brk.hasLong}), brk.txt.slice(0,80));
T('（前置）這個形狀確實會觸發長線抑制', brk.broken===true, String(brk.broken));
T('長線三條確實沒有列出來（不硬算荒謬的數字）', brk.hasLong===false);
T('但畫面在原地說明了為什麼', /為什麼上面沒有/.test(brk.txt), brk.txt.slice(0,60));
T('說明講出實際的本益比', /脫離|往上走/.test(brk.txt), (brk.txt.match(/為什麼上面沒有[^。]*。/)||[''])[0].slice(0,90));
T('說明有告訴使用者「剩下四條仍然有效」', /技術面.*仍然有效|它們仍然有效/.test(brk.txt));
T('短中期四條還在', /短期跌過頭參考價/.test(brk.txt) && /最近三個月平均價/.test(brk.txt));

/* 正常的股票不可以被誤傷 */
const ok = await mk(15, 8, 18, 300);
console.log('  正常形狀：', JSON.stringify({broken:ok.broken, hasLong:ok.hasLong}));
T('正常股票仍然列出長線三條', ok.hasLong===true, String(ok.hasLong));
T('正常股票不會冒出那段說明', !/為什麼上面沒有/.test(ok.txt));

T('全程沒有執行期錯誤', errs.length===0, errs.join(' | '));
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
