/* 進到每一個視窗裡面，把裡面的東西也按過一次。
   檢查：可點區尺寸、內容有沒有溢出視窗、捲得到底嗎、關閉鈕永遠碰得到、
   表單填得動嗎、按了會不會噴錯、有沒有字重疊。 */
import { chromium } from 'playwright';

const VIEWS = [
  { w:390,  h:844, name:'手機 390', touch:true },
  { w:768,  h:900, name:'桌機放大200% 768', touch:false },
  { w:1280, h:900, name:'桌機 1280', touch:false },
];
const problems = [];
const note = (v,where,what,detail='') => problems.push({v,where,what,detail});

const WINDOWS = [
  ['使用說明',      `openGuide()`],
  ['交易紀錄',      `openTxnPage('2330')`],
  ['三維度目標價',  `openTargetModal('2330')`],
  ['資料儲存',      `openDataPanel()`],
  ['連線診斷',      `document.getElementById('diagBtn').click()`],
  ['印一份給人看',  `document.getElementById('shareBtn').click()`],
  ['打給我的營業員',`document.getElementById('brokerBtn').click()`],
  ['刪除確認',      `removeStock('2330')`],
  ['清空持倉確認',  `document.getElementById('clearHoldBtn').click()`],
  ['即時報價（未連線）', `document.getElementById('rtBtn').click()`],
  ['新增標的',      `document.getElementById('addToggle').click()`],
];
/* 有些動作本來就不該開視窗（例如「印一份給人看」是複製到剪貼簿＋提示），
   對這些只驗「有沒有給使用者回饋」，不驗有沒有彈窗。 */
const NO_MODAL_OK = new Set(['印一份給人看','即時報價（未連線）','新增標的']);

const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
for(const V of VIEWS){
  const ctx = await b.newContext({viewport:{width:V.w,height:V.h}, hasTouch:V.touch, isMobile:V.touch});
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2500);
  await p.evaluate(()=>{
    try{closeAllModals()}catch(e){}
    state.watchlist.filter(x=>x.type==='top100').slice(0,3).forEach((s,i)=>{
      s.inWatch=true; s.txns=[{id:'b'+i,kind:'buy',date:'2024-01-05',shares:2000,price:500},
                              {id:'s'+i,kind:'sell',date:'2025-03-01',shares:500,price:640}];
      s.txnsMigrated=true;
      const ser=[],ph=[],t=new Date('2026-08-18');
      for(let k=1250;k>=0;k--){ const px=600*(1+Math.sin(k/61)*0.25);
        ser.push({date:new Date(t-k*86400000).toISOString().slice(0,10),close:+px.toFixed(2)});
        ph.push(+(12+Math.abs(Math.sin(k/37))*30).toFixed(1)); }
      applyStockData(s,{price:576,eps:14,debt:.42,holder:.31,holderPrev:.30,series:ser,
        asOf:'2026-08-18',per:24.5,perHist:ph,perAsOf:'2026-08-18',peSrc:'official',
        capStock:1e10,equity:5e10,pbr:2},'live');
      applyPosition(s);
    });
    renderAll(); document.querySelectorAll('.toast-sa').forEach(e=>e.remove());
  });
  await p.waitForTimeout(600);
  console.log(`\n══ ${V.name} ══`);

  for(const [name, opener] of WINDOWS){
    await p.evaluate(()=>{try{closeAllModals()}catch(e){}});
    await p.waitForTimeout(180);
    const before = errs.length;
    const opened = await p.evaluate(async src=>{
      document.querySelectorAll('.toast-sa').forEach(e=>e.remove());
      try{ eval(src); }catch(e){ return {err:String(e).slice(0,90)}; }
      /* 診斷類動作要打幾次 API 才畫得出來，固定等 400ms 會誤判成「沒反應」。
         改成輪詢最多 6 秒。 */
      /* 提示會自己消失（小字級 4.2 秒），輪詢 6 秒之後才去看一定看不到——
         那會誤判成「按了完全沒有回饋」。邊等邊收。 */
      const seen=[];
      for(let i=0;i<20;i++){
        await new Promise(r=>setTimeout(r,300));
        document.querySelectorAll('.toast-sa').forEach(e=>{ const t=e.textContent.trim().slice(0,50);
          if(!seen.includes(t)) seen.push(t); });
        const box=['modal','bigModal','guideModal'].map(id=>document.getElementById(id))
          .filter(e=>e&&!e.classList.contains('hidden')).pop();
        if(box) return {id:box.id};
      }
      return { none:true, toast:seen };
    }, opener);
    if(opened.err){ note(V.name,name,'打不開（丟出錯誤）',opened.err); continue; }
    if(opened.none){
      if(NO_MODAL_OK.has(name)){
        const changed = await p.evaluate(()=>({ addOpen: !document.getElementById('addPanel')?.classList.contains('hidden') }));
        if(!opened.toast.length && !changed.addOpen) note(V.name,name,'按了沒有任何回饋（沒有彈窗也沒有提示）');
        else console.log(`  ${name}：不開視窗，回饋＝${opened.toast[0]||'展開了輸入面板'} ✓`);
      } else note(V.name,name,'按了沒有開出任何視窗');
      continue;
    }

    /* ── 視窗內部檢查 ── */
    const r = await p.evaluate(async boxId=>{
      const box=document.getElementById(boxId);
      const panel=box.firstElementChild;
      const pr=panel.getBoundingClientRect();
      const bad={small:[], spill:[], overlapish:[], noClose:false, cantScroll:false, tabs:0};
      const vis=el=>{const s=getComputedStyle(el),q=el.getBoundingClientRect();
        return s.display!=='none'&&s.visibility!=='hidden'&&+s.opacity>0&&s.pointerEvents!=='none'&&q.width>0&&q.height>0;};

      /* 可點區尺寸 */
      [...box.querySelectorAll('button,summary,select,input,[role="button"]')].forEach(el=>{
        if(!vis(el)) return;
        const q=el.getBoundingClientRect();
        if(el.type==='checkbox'||el.type==='radio') return;   // 由外層 label 提供觸控面積
        if(q.height<43.5||q.width<24)
          bad.small.push(((el.textContent||el.value||el.id||el.tagName).replace(/\\s+/g,' ').trim().slice(0,20))+` ${Math.round(q.width)}x${Math.round(q.height)}`);
      });

      /* 內容有沒有橫向衝出視窗 */
      [...panel.querySelectorAll('*')].forEach(el=>{
        if(!vis(el)) return;
        const q=el.getBoundingClientRect();
        const over=Math.round(Math.max(0, pr.left-q.left)+Math.max(0, q.right-pr.right));
        if(over>6) bad.spill.push(((el.textContent||'').replace(/\\s+/g,' ').trim().slice(0,24))+` 溢出${over}px`);
      });

      /* 關閉鈕：一定要有、而且要碰得到 */
      const closers=[...box.querySelectorAll('button')].filter(x=>vis(x)&&/關閉|取消|✕|開始使用|先不要|知道了/.test(x.textContent));
      bad.noClose = closers.length===0;
      bad.closerOffscreen = closers.length>0 && closers.every(x=>{
        const q=x.getBoundingClientRect(); return q.bottom>innerHeight+1 || q.top<0; });

      /* 內容捲得到底嗎 */
      const scroller=[...box.querySelectorAll('*')].find(el=>el.scrollHeight>el.clientHeight+8 &&
        /auto|scroll/.test(getComputedStyle(el).overflowY));
      if(scroller){
        scroller.scrollTop=scroller.scrollHeight;
        await new Promise(r=>setTimeout(r,150));
        bad.cantScroll = scroller.scrollTop < scroller.scrollHeight-scroller.clientHeight-4;
        scroller.scrollTop=0;
      }
      /* 視窗本身有沒有高過螢幕 */
      bad.tallerThanScreen = pr.height > innerHeight+2;
      bad.panelTop = Math.round(pr.top);
      /* 分頁（使用說明） */
      bad.tabs = box.querySelectorAll('#guideTabs button').length;
      return bad;
    }, opened.id);

    r.small.forEach(x=>{ if(V.touch) note(V.name,name,'視窗內可點區過小',x); });
    r.spill.slice(0,3).forEach(x=>note(V.name,name,'內容衝出視窗邊界',x));
    if(r.noClose) note(V.name,name,'視窗裡沒有任何關閉鈕');
    if(r.closerOffscreen) note(V.name,name,'關閉鈕在螢幕外，要捲動才碰得到');
    if(r.cantScroll) note(V.name,name,'內容捲不到底');
    if(r.tallerThanScreen) note(V.name,name,'視窗比螢幕還高', `top=${r.panelTop}`);

    /* 使用說明的每一個分頁都點一次 */
    if(r.tabs>0){
      const tabBad = await p.evaluate(async ()=>{
        const bad=[]; const tabs=[...document.querySelectorAll('#guideTabs button')];
        for(const t of tabs){
          t.click(); await new Promise(r=>setTimeout(r,200));
          const body=document.getElementById('guideBody');
          const txt=(body.textContent||'').trim();
          if(txt.length<20) bad.push(t.textContent.trim().slice(0,10)+'：分頁是空的');
          if(document.documentElement.scrollWidth>document.documentElement.clientWidth+1)
            bad.push(t.textContent.trim().slice(0,10)+'：造成橫向捲軸');
          const pr=body.getBoundingClientRect();
          const spill=[...body.querySelectorAll('*')].some(el=>{
            const q=el.getBoundingClientRect();
            return q.width>0 && (q.right>pr.right+8 || q.left<pr.left-8); });
          if(spill) bad.push(t.textContent.trim().slice(0,10)+'：內容衝出面板');
        }
        return {bad, n:tabs.length};
      });
      console.log(`  使用說明共 ${tabBad.n} 個分頁`);
      tabBad.bad.forEach(x=>note(V.name,'使用說明分頁',x));
    }

    /* 交易紀錄：表單要填得動 */
    if(name==='交易紀錄'){
      const form = await p.evaluate(async ()=>{
        const out={};
        const k=document.getElementById('txKind'), d=document.getElementById('txDate'),
              sh=document.getElementById('txShares'), pr=document.getElementById('txPrice');
        out.hasForm = !!(k&&sh&&pr);
        if(!out.hasForm) return out;
        out.kinds=[...k.options].map(o=>o.value);
        /* 逐一切換交易種類，該顯示／隱藏的欄位要跟著變 */
        out.perKind=[];
        for(const o of k.options){
          k.value=o.value; k.dispatchEvent(new Event('change',{bubbles:true}));
          await new Promise(r=>setTimeout(r,160));
          const visible=['txDate','txShares','txPrice','txRatio'].filter(id=>{
            const el=document.getElementById(id); if(!el) return false;
            const s=getComputedStyle(el); return s.display!=='none' && el.getBoundingClientRect().height>0; });
          out.perKind.push({kind:o.value, fields:visible});
        }
        k.value='buy'; k.dispatchEvent(new Event('change',{bubbles:true}));
        return out;
      });
      if(!form.hasForm) note(V.name,'交易紀錄','找不到新增紀錄的表單');
      else {
        const empty=form.perKind.filter(x=>x.fields.length===0);
        if(empty.length) note(V.name,'交易紀錄','某些交易種類沒有任何可填欄位', empty.map(x=>x.kind).join(','));
        console.log(`  交易紀錄表單：${form.kinds.join('/')}`);
      }
    }

    /* 關掉 */
    const closed = await p.evaluate(async ()=>{
      const open=()=>['modal','bigModal','guideModal'].filter(id=>{const e=document.getElementById(id);return e&&!e.classList.contains('hidden');});
      const box=['modal','bigModal','guideModal'].map(id=>document.getElementById(id)).filter(e=>e&&!e.classList.contains('hidden')).pop();
      const btn=box?[...box.querySelectorAll('button')].find(x=>/關閉|取消|✕|開始使用|先不要/.test(x.textContent)):null;
      if(btn){ btn.click(); await new Promise(r=>setTimeout(r,300)); }
      return open();
    });
    if(closed.length) note(V.name,name,'用視窗自己的按鈕關不掉', closed.join(','));
    if(errs.length>before) note(V.name,name,'操作過程噴出錯誤', errs[before]);
    await p.evaluate(()=>{try{closeAllModals()}catch(e){}});
  }
  await ctx.close();
}
await b.close();

console.log('\n════════ 視窗內部巡檢 ════════');
if(!problems.length) console.log('沒有發現無法操作或反人性的地方。');
else{
  const by={}; problems.forEach(x=>{(by[x.v]=by[x.v]||[]).push(x);});
  for(const v in by){ console.log(`\n【${v}】${by[v].length} 項`);
    by[v].forEach(x=>console.log(`  ・${x.where} → ${x.what}${x.detail?'（'+x.detail+'）':''}`)); }
}
console.log(`\n合計 ${problems.length} 項`);
