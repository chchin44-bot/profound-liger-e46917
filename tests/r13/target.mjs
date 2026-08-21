import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'PASS  ':'!!FAIL')+'  '+n+(x?'  '+x:''));};
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2400);
await p.evaluate(()=>{try{closeModal()}catch(e){}});
/* v74：進階區塊改成預設收合，測試要跟真實使用者走同一步——先點開標題。 */
const openSec = async (kw) => { await p.evaluate(k=>{
  [...document.querySelectorAll('details.secfold')].forEach(d=>{ if(new RegExp(k).test(d.textContent)) d.open = true; });
}, kw); await p.waitForTimeout(300); };
await openSec('三維度目標價');

// 造一檔有完整歷史的真實資料
await p.evaluate(()=>{
  const s=state.watchlist.find(x=>x.id==='2330'); s.inWatch=true;
  s.txns=[{id:'a',kind:'buy',date:'2024-01-05',shares:2000,price:800}]; s.txnsMigrated=true;
  const ser=[],pr=[]; const t=new Date('2026-08-14');
  for(let i=1300;i>=0;i--){const d=new Date(t-i*86400000),dt=d.toISOString().slice(0,10);
    const px=+(1000*(1+Math.sin(i/53)*0.2)).toFixed(2);
    ser.push({date:dt,close:px}); pr.push({date:dt,per:+(px/55).toFixed(2)});}
  ser[ser.length-1].close=1000;
  applyStockData(s,{price:1000,eps:55,debt:.3,holder:null,holderPrev:null,series:ser,
    asOf:'2026-08-14',per:18,perHist:pr.map(r=>r.per),perRows:pr,perAsOf:'2026-08-14'},'live');
  applyPosition(s); state.selected='2330'; renderAll();
});
await p.waitForTimeout(700);
let r = await p.evaluate(()=>{
  const t=state.watchlist.find(x=>x.id==='2330').data.targets;
  return {t, panel:document.getElementById('targetPanel').innerText.slice(0,400),
          sel:document.getElementById('targetSelect').options.length};});
T('三個維度都算得出來', r.t && r.t.cheap>0 && r.t.fair>0 && r.t.rich>0, JSON.stringify(r.t&&{c:r.t.cheap,f:r.t.fair,r:r.t.rich}));
T('中期季線有值', r.t && r.t.midBuy>0, 'midBuy='+(r.t&&r.t.midBuy));
T('短期布林有值', r.t && r.t.shortBuy!=null && r.t.shortSell!=null, JSON.stringify(r.t&&{sb:r.t.shortBuy,ss:r.t.shortSell}));
T('區塊 E 面板有內容', r.panel.length>50, r.panel.slice(0,80).replace(/\n/g,' '));
T('下拉有選項', r.sel>=1, 'options='+r.sel);
// 表格的目標價按鈕
await p.evaluate(()=>window.scrollTo(0,0));
/* v68：手機版每一檔預設收起來，動作按鈕要先點「看詳細」。走真實使用者的兩步。 */
await p.click('button[data-act="fold"]',{timeout:6000}); await p.waitForTimeout(400);
const btn = await p.$('button[data-act="target"]');
T('表格有目標價按鈕', !!btn);
if(btn){ await btn.click(); await p.waitForTimeout(700);
  r = await p.evaluate(()=>({open:!document.getElementById('bigModal').classList.contains('hidden'),
    body:document.getElementById('bigBody').innerText.slice(0,300)}));
  T('目標價面板打得開', r.open && /長期|中期|短期|便宜|季線/.test(r.body), r.body.slice(0,100).replace(/\n/g,' '));
}
// 觸控與溢出
await p.evaluate(()=>{const m=document.getElementById('bigModal');m.classList.add('hidden');m.classList.remove('flex');});
await p.waitForTimeout(300);
r = await p.evaluate(()=>{
  /* 觸控目標的判準是「使用者點得到嗎」。
     opacity:0 或 pointer-events:none 的元素點不到，不該算進來——
     例如被 label 包住、視覺上完全隱藏的原生 checkbox（真正的觸控目標是那個 label）。 */
  const vis=el=>{const s=getComputedStyle(el),b=el.getBoundingClientRect();
    return s.display!=='none'&&s.visibility!=='hidden'&&+s.opacity>0&&s.pointerEvents!=='none'&&b.width>0&&b.height>0;};
  let small=[];
  for(const el of document.querySelectorAll('a,button,[role="button"],input,select,textarea')){
    if(!vis(el))continue; const bb=el.getBoundingClientRect();
    if(bb.width<44||bb.height<44) small.push(`${el.tagName}#${el.id||''} ${Math.round(bb.width)}x${Math.round(bb.height)}`);}
  return {small, ov:document.documentElement.scrollWidth-document.documentElement.clientWidth,
          h:document.documentElement.scrollHeight};});
T('無過小觸控目標', r.small.length===0, JSON.stringify(r.small.slice(0,4)));
T('無橫向溢出', r.ov<=1, 'ov='+r.ov);
console.log(`（全頁高 ${r.h}px = ${(r.h/844).toFixed(2)} 屏）`);
console.log('\nPAGE ERRORS:', errs.length?errs:'none');
console.log(fail?`\n❌ ${fail} 項失敗`:'\n✅ 全部通過');
await p.screenshot({path:'./tests/r13/target.png'});
await b.close(); process.exit(fail?1:0);
