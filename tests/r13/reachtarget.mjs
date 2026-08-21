/* v85：三維度目標價必須「一步就按得到」，桌機與手機、自選清單與百大資料庫都一樣。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};

for(const [vp,label] of [[{width:1280,height:900},'桌機'],[{width:390,height:844},'手機']]){
  const ctx = await b.newContext({viewport:vp, hasTouch:label==='手機', isMobile:label==='手機'});
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2300);
  await p.evaluate(()=>{try{closeAllModals()}catch(e){}});

  for(const [body,name] of [['#t100Body','百大資料庫'],['#wlBody','自選清單']]){
    /* elementFromPoint 用的是**視窗**座標。表格在頁面很下面，不先捲過去
       量到的就是「視窗外」，clickable 永遠是 false——那是測法錯，不是按鈕被蓋住。 */
    await p.evaluate(sel=>{
      const btn=[...document.querySelectorAll(sel+' tr button')].find(x=>x.dataset.act==='target');
      if(btn) btn.scrollIntoView({block:'center'});
    }, body);
    await p.waitForTimeout(250);
    const r = await p.evaluate(sel=>{
      const tr=document.querySelector(sel+' tr');
      if(!tr) return null;
      const btn=[...tr.querySelectorAll('button')].find(x=>x.dataset.act==='target');
      if(!btn) return {missing:true};
      const b=btn.getBoundingClientRect();
      const cx=b.left+b.width/2, cy=b.top+b.height/2;
      const top=document.elementFromPoint(cx,cy);
      return { opened: tr.hasAttribute('data-open'),
               visible: btn.checkVisibility?btn.checkVisibility({checkVisibilityCSS:true}):true,
               w:Math.round(b.width), h:Math.round(b.height),
               inView: b.right<=innerWidth+1 && b.left>=0 && b.top>=0 && b.bottom<=innerHeight+1,
               clickable: !!top && (top===btn || btn.contains(top)) };
    }, body);
    console.log(`  [${label}·${name}]`, JSON.stringify(r));
    T(`[${label}] ${name}：不必先展開就有目標價按鈕`, r && !r.missing && r.opened===false && r.visible===true, JSON.stringify(r));
    T(`[${label}] ${name}：按鈕在畫面內`, r && r.inView===true);
    T(`[${label}] ${name}：按鈕點得到（沒有被蓋住）`, r && r.clickable===true);
    if(label==='手機') T(`[手機] ${name}：按鈕是拇指尺寸 ≥44px`, r && r.h>=44, `${r&&r.w}x${r&&r.h}`);

    /* 真的按下去，要開出三維度目標價 */
    const res = await p.evaluate(sel=>{
      try{ closeAllModals(); }catch(e){}
      const btn=[...document.querySelectorAll(sel+' tr button')].find(x=>x.dataset.act==='target');
      if(!btn) return {no:true};
      btn.click();
      const bm=document.getElementById('bigModal');
      return { open: bm && !bm.classList.contains('hidden'),
               title: (document.getElementById('bigTitle')||{}).textContent||'' };
    }, body);
    T(`[${label}] ${name}：按下去真的開出目標價視窗`, res.open===true, JSON.stringify(res));
    T(`[${label}] ${name}：標題是三維度估值`, /三維度/.test(res.title), res.title.slice(0,40));
    await p.evaluate(()=>{try{closeAllModals()}catch(e){}});
  }

  /* 收合狀態下，「動到資料」的那些動作仍然要收著（不能誤觸） */
  const hidden = await p.evaluate(()=>{
    const tr=document.querySelector('#t100Body tr');
    return [...tr.querySelectorAll('button')].filter(x=>['star','del','txn'].includes(x.dataset.act))
      .map(x=>({act:x.dataset.act, vis:x.checkVisibility?x.checkVisibility({checkVisibilityCSS:true}):true}));
  });
  if(label==='手機'){
    console.log('  [手機] 百大收合時其他按鈕：', JSON.stringify(hidden));
    /* 百大表格不收——那張表只有「目標價／加入自選」兩顆，而且百大的列沒有展開鈕，
       收起來就等於完全按不到。「加入自選」是建立自選清單的唯一入口。 */
    T('[手機] 百大的「加入自選」看得到（那是建立清單的唯一入口）',
      hidden.filter(x=>x.act==='star').every(x=>x.vis===true), JSON.stringify(hidden));
    const wl = await p.evaluate(()=>{
      const tr=document.querySelector('#wlBody tr');
      return [...tr.querySelectorAll('button')].filter(x=>['star','del','txn'].includes(x.dataset.act))
        .map(x=>({act:x.dataset.act, vis:x.checkVisibility?x.checkVisibility({checkVisibilityCSS:true}):true}));
    });
    console.log('  [手機] 自選清單收合時其他按鈕：', JSON.stringify(wl));
    T('[手機] 自選清單的「移除／交易紀錄」仍然收著（避免誤觸，而且它有展開鈕）',
      wl.every(x=>x.vis===false), JSON.stringify(wl));
  }else{
    T('[桌機] 桌機不收，全部按鈕都在', hidden.every(x=>x.vis===true), JSON.stringify(hidden));
  }
  T(`[${label}] 全程沒有執行期錯誤`, errs.length===0, errs.join(' | '));
  await ctx.close();
}
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
