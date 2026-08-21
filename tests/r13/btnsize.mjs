/* v83：表格裡的按鈕在桌機縮小，但觸控裝置一定要維持 44px。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};

const measure = async (opts, label) => {
  const ctx = await b.newContext(opts);
  const p = await ctx.newPage();
  await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2200);
  await p.evaluate(()=>{try{closeAllModals()}catch(e){}});
  /* 手機版把「操作」欄收在每一列的展開區裡（見 #t100Body tr:not([data-open]) 那條 CSS），
     不先展開就量到 0 顆——那會讓測試「通過」卻什麼都沒量到。 */
  await p.evaluate(()=>{ document.querySelectorAll('[data-act="fold"]').forEach((b,i)=>{ if(i<2) b.click(); }); });
  await p.waitForTimeout(400);
  const r = await p.evaluate(()=>{
    const rows=[...document.querySelectorAll('#t100Body .btn-row, #wlBody .btn-row')]
      .filter(e=>e.checkVisibility&&e.checkVisibility());
    const main=[...document.querySelectorAll('.btn:not(.btn-row)')]
      .filter(e=>e.checkVisibility&&e.checkVisibility());
    const h=e=>Math.round(e.getBoundingClientRect().height);
    return { rowN:rows.length, rowMin:rows.length?Math.min(...rows.map(h)):null,
             rowMax:rows.length?Math.max(...rows.map(h)):null,
             mainMin:main.length?Math.min(...main.map(h)):null, mainN:main.length };
  });
  console.log(`  [${label}] 表格按鈕 ${r.rowN} 顆，高 ${r.rowMin}~${r.rowMax}px；主要按鈕 ${r.mainN} 顆，最矮 ${r.mainMin}px`);
  await ctx.close(); return r;
};

const desk = await measure({viewport:{width:1280,height:900}}, '桌機/滑鼠');
T('桌機：表格按鈕縮小到 40px 以下', desk.rowMax!=null && desk.rowMax<=40, desk.rowMax+'px');
T('桌機：主要動作按鈕沒有被縮到', desk.mainMin>=44, desk.mainMin+'px');

const phone = await measure({viewport:{width:390,height:844}, hasTouch:true, isMobile:true}, '手機/觸控');
T('手機：表格按鈕仍然 ≥44px（老花與手抖要按得到）', phone.rowMin>=44, phone.rowMin+'px');
T('手機：主要動作按鈕仍然 ≥44px', phone.mainMin>=44, phone.mainMin+'px');

console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
