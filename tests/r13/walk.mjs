/* 全站互動巡檢：把畫面上每一個按得動的東西按過一次，記錄有沒有
   ① 執行期錯誤 ② 開了關不掉 ③ 內容溢出／重疊 ④ 觸控目標過小
   ⑤ 按了完全沒反應 ⑥ 需要橫向捲動才碰得到
   三種寬度各走一輪：手機、放大 200% 的桌機、一般桌機。 */
import { chromium } from 'playwright';

const VIEWS = [
  { w:390,  h:844, name:'手機 390', touch:true  },
  { w:768,  h:900, name:'桌機放大200% 768', touch:false },
  { w:1280, h:900, name:'桌機 1280', touch:false },
];
const problems = [];
const note = (view, where, what, detail='') => problems.push({ view, where, what, detail });

const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });

for(const V of VIEWS){
  const ctx = await b.newContext({ viewport:{width:V.w,height:V.h}, hasTouch:V.touch, isMobile:V.touch });
  /* 全部 API 一律給假資料：巡檢要可重現，而且不能用到任何人的 Token */
  await ctx.route('**/api.finmindtrade.com/**', async route=>{
    const u=new URL(route.request().url()), ds=u.searchParams.get('dataset');
    const id=u.searchParams.get('data_id')||'2330';
    let data=[];
    if(ds==='TaiwanStockPrice'){
      const t=new Date('2026-08-18');
      for(let k=600;k>=0;k--) data.push({date:new Date(t-k*86400000).toISOString().slice(0,10),
        stock_id:id, close:600+(k%7)*3, open:600, max:610, min:590, Trading_Volume:12000});
    } else if(ds==='TaiwanStockPER'){
      const t=new Date('2026-08-18');
      for(let k=600;k>=0;k--) data.push({date:new Date(t-k*86400000).toISOString().slice(0,10),
        stock_id:id, PER:20+(k%9), PBR:2+(k%3)*0.1, dividend_yield:2.5});
    }
    await route.fulfill({status:200, contentType:'application/json',
      body:JSON.stringify({msg:'success', status:200, data})});
  });
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+process.cwd()+'/index.html');
  await p.waitForTimeout(2600);
  await p.evaluate(()=>{ try{closeAllModals()}catch(e){}; document.querySelectorAll('.toast-sa').forEach(e=>e.remove()); });

  /* 載入資料，讓每一列都有東西可按 */
  await p.evaluate(()=>{
    state.watchlist.filter(x=>x.type==='top100').slice(0,6).forEach((s,i)=>{
      if(i<3){ s.inWatch=true; s.txns=[{id:'b'+i,kind:'buy',date:'2024-01-05',shares:2000,price:500}]; s.txnsMigrated=true; }
      const ser=[],ph=[],t=new Date('2026-08-18');
      for(let k=1250;k>=0;k--){ const px=600*(1+Math.sin(k/61)*0.25);
        ser.push({date:new Date(t-k*86400000).toISOString().slice(0,10),close:+px.toFixed(2)});
        ph.push(+(12+Math.abs(Math.sin(k/37))*30).toFixed(1)); }
      applyStockData(s,{price:576,eps:14,debt:.42,holder:.31,holderPrev:.30,series:ser,
        asOf:'2026-08-18',per:24.5,perHist:ph,perAsOf:'2026-08-18',peSrc:'official',
        capStock:1e10, equity:5e10, pbr:2},'live');
      applyPosition(s);
    });
    renderAll();
    document.querySelectorAll('.toast-sa').forEach(e=>e.remove());
  });
  await p.waitForTimeout(700);

  /* 收起來的東西也要檢查——「清空我的持倉」就是躲在收合面板裡逃過歷來所有巡檢的。
     先把所有 <details> 打開、把所有可展開的面板叫出來，再盤點。 */
  await p.evaluate(()=>{
    document.querySelectorAll('details').forEach(d=>d.open=true);
    const ap=document.getElementById('addPanel'); if(ap) ap.classList.remove('hidden');
    try{ setTokenCollapsed(false); }catch(e){}
    try{ setHelpCollapsed(false); }catch(e){}
    document.querySelectorAll('#wlBody tr, #t100Body tr').forEach(tr=>tr.setAttribute('data-open',''));
  });
  await p.waitForTimeout(500);

  /* ── 盤點所有可操作元件 ── */
  const inventory = await p.evaluate(()=>{
    const out=[];
    const vis=el=>{ const s=getComputedStyle(el), r=el.getBoundingClientRect();
      return s.display!=='none' && s.visibility!=='hidden' && +s.opacity>0 &&
             s.pointerEvents!=='none' && r.width>0 && r.height>0; };
    document.querySelectorAll('button, summary, select, input, a[href]').forEach((el,i)=>{
      if(!vis(el)) return;
      if(el.id==='importFile') return;                 // 會開系統檔案視窗
      if(el.tagName==='A') return;                     // 外連，不點
      el.setAttribute('data-walk', 'w'+i);
      const r=el.getBoundingClientRect();
      out.push({ key:'w'+i, tag:el.tagName,
        label:(el.textContent||el.value||el.getAttribute('aria-label')||el.id||'').replace(/\s+/g,' ').trim().slice(0,26),
        id:el.id||'', act:el.dataset.act||'', w:Math.round(r.width), h:Math.round(r.height),
        inModal: !!el.closest('#modal,#bigModal,#guideModal') });
    });
    return out;
  });
  console.log(`\n══ ${V.name}：盤點到 ${inventory.length} 個可操作元件 ══`);

  /* ── 觸控目標尺寸 ── */
  for(const it of inventory){
    if(V.touch && (it.h < 44 || it.w < 24))
      note(V.name, it.label||it.id, '觸控目標過小', `${it.w}x${it.h}`);
  }

  /* ── 逐一按過去 ── */
  const state0 = { err: errs.length };
  for(const it of inventory){
    if(it.tag==='SELECT' || it.tag==='INPUT') continue;   // 下面單獨處理
    const before = errs.length;
    const res = await p.evaluate(async k=>{
      const el=document.querySelector(`[data-walk="${k}"]`);
      if(!el) return { gone:true };
      const snap = ()=>({ modals:['modal','bigModal','guideModal']
          .filter(id=>{const e=document.getElementById(id); return e && !e.classList.contains('hidden');}),
        html: document.body.innerHTML.length,
        scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth });
      const a = snap();
      el.click();
      await new Promise(r=>setTimeout(r,260));
      const c = snap();
      return { a, c, changed: a.html!==c.html || a.modals.join()!==c.modals.join() };
    }, it.key);
    if(res.gone) continue;
    const after = errs.length;
    if(after>before) note(V.name, it.label||it.id, '按下去噴出執行期錯誤', errs[before]);
    if(res.c.scrollW > res.c.clientW+1) note(V.name, it.label||it.id, '按下去出現橫向捲軸', `${res.c.scrollW}>${res.c.clientW}`);

    /* 開了視窗 → 必須關得掉 */
    if(res.c.modals.length){
      const esc = await p.evaluate(async ()=>{
        const open=()=>['modal','bigModal','guideModal'].filter(id=>{const e=document.getElementById(id);return e&&!e.classList.contains('hidden');});
        // 先找視窗裡的關閉鈕
        const box=['modal','bigModal','guideModal'].map(id=>document.getElementById(id))
          .filter(e=>e&&!e.classList.contains('hidden')).pop();
        const btn=box?[...box.querySelectorAll('button')].find(x=>/關閉|取消|✕|開始使用|知道了|先不要/.test(x.textContent)):null;
        let how='';
        if(btn){ btn.click(); await new Promise(r=>setTimeout(r,260)); how='視窗內按鈕'; }
        if(open().length){ document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); await new Promise(r=>setTimeout(r,260)); how='Esc'; }
        if(open().length){ try{closeAllModals()}catch(e){} await new Promise(r=>setTimeout(r,200)); how='closeAllModals'; }
        return { left: open(), how, hadBtn: !!btn };
      });
      if(esc.left.length) note(V.name, it.label||it.id, '開了視窗但關不掉', esc.left.join(','));
      else if(!esc.hadBtn) note(V.name, it.label||it.id, '視窗裡沒有明確的關閉鈕（只能靠 Esc）', esc.how);
    }
    await p.evaluate(()=>{ try{closeAllModals()}catch(e){}; document.querySelectorAll('.toast-sa').forEach(e=>e.remove()); });
  }

  /* ── 下拉選單：每個選項都選一次 ── */
  for(const it of inventory.filter(x=>x.tag==='SELECT')){
    const r = await p.evaluate(async k=>{
      const el=document.querySelector(`[data-walk="${k}"]`); if(!el) return null;
      const bad=[];
      for(const o of [...el.options]){
        el.value=o.value; el.dispatchEvent(new Event('change',{bubbles:true}));
        await new Promise(r=>setTimeout(r,140));
        if(document.documentElement.scrollWidth > document.documentElement.clientWidth+1)
          bad.push(o.textContent.trim().slice(0,16)+'→橫向溢出');
      }
      el.selectedIndex=0; el.dispatchEvent(new Event('change',{bubbles:true}));
      await new Promise(r=>setTimeout(r,140));
      return bad;
    }, it.key);
    if(r && r.length) note(V.name, it.label||it.id, '某些選項造成版面問題', r.join('、'));
  }

  /* ── 收合區塊：開了要能關 ── */
  const fold = await p.evaluate(async ()=>{
    const bad=[];
    for(const d of [...document.querySelectorAll('details')]){
      const sum=d.querySelector('summary'); const lab=(sum?sum.textContent:'').replace(/\s+/g,' ').trim().slice(0,20);
      if(!sum){ bad.push(lab+'：沒有可點的標題'); continue; }
      const was=d.open;
      sum.click(); await new Promise(r=>setTimeout(r,120)); const o=d.open;
      sum.click(); await new Promise(r=>setTimeout(r,120)); const c=d.open;
      if(o===was) bad.push(lab+'：點了打不開');
      else if(c!==was) bad.push(lab+'：打開之後關不回去');
      d.open=was;
    }
    return bad;
  });
  fold.forEach(x=>note(V.name,'收合區塊',x));

  /* ── 最後一次整體檢查 ── */
  const fin = await p.evaluate(()=>{
    const ov = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const lit=[]; document.querySelectorAll('body *').forEach(el=>{
      if(/^(SCRIPT|STYLE|TEMPLATE)$/.test(el.tagName)) return;
      [...el.childNodes].forEach(n=>{ if(n.nodeType===3 && /\$\{/.test(n.textContent)) lit.push(n.textContent.trim().slice(0,40)); });
    });
    return { ov, lit:[...new Set(lit)] };
  });
  if(fin.ov>1) note(V.name,'整頁','走完之後有橫向捲軸', String(fin.ov));
  if(fin.lit.length) note(V.name,'整頁','畫面上有沒被代入的樣板變數', JSON.stringify(fin.lit));
  if(errs.length>state0.err) note(V.name,'整頁',`全程共 ${errs.length} 個執行期錯誤`, errs.slice(0,3).join(' | '));

  await ctx.close();
}
await b.close();

console.log('\n════════ 巡檢結果 ════════');
if(!problems.length){ console.log('沒有發現無法操作或反人性的地方。'); }
else{
  const byView={};
  problems.forEach(x=>{ (byView[x.view]=byView[x.view]||[]).push(x); });
  for(const v in byView){
    console.log(`\n【${v}】${byView[v].length} 項`);
    byView[v].forEach(x=>console.log(`  ・${x.where} → ${x.what}${x.detail?'（'+x.detail+'）':''}`));
  }
}
console.log(`\n合計 ${problems.length} 項`);
process.exit(0);
