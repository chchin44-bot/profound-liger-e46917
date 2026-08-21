/* 「桌機也沒有按鈕」的最可能解釋：瀏覽器放大。
   放大 150% 之後 CSS 視窗寬度會掉到 820px 以下，整頁切成手機版面。
   量一下各種放大倍率下，目標價按鈕在不在。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
/* 1536px 的螢幕在 100/125/150/175/200% 放大之後的 CSS 寬度 */
for(const [z,w] of [[100,1536],[125,1229],[150,1024],[175,878],[200,768],[250,614]]){
  const ctx = await b.newContext({viewport:{width:w,height:864}});
  const p = await ctx.newPage();
  await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(1900);
  await p.evaluate(()=>{try{closeAllModals()}catch(e){}});
  const r = await p.evaluate(()=>{
    const out={};
    for(const [sel,name] of [['#t100Body','百大'],['#wlBody','自選']]){
      const tr=document.querySelector(sel+' tr');
      const btn=tr?[...tr.querySelectorAll('button')].find(x=>x.dataset.act==='target'):null;
      out[name] = btn ? (btn.checkVisibility?btn.checkVisibility({checkVisibilityCSS:true}):true) : null;
    }
    /* 百大的「加入自選」也要一起驗——它是建立自選清單的唯一入口，
       而百大的列沒有展開鈕，被藏起來就是完全按不到。 */
    const t100star=[...document.querySelectorAll('#t100Body tr:first-child button')].find(x=>x.dataset.act==='star');
    out['百大加入自選'] = t100star ? (t100star.checkVisibility?t100star.checkVisibility({checkVisibilityCSS:true}):true) : null;
    out.mobileLayout = !!document.querySelector('[data-act="fold"]') &&
      getComputedStyle(document.querySelector('[data-act="fold"]')).display !== 'none';
    return out;
  });
  console.log(`  放大 ${z}%（CSS 寬 ${w}px）版面=${r.mobileLayout?'手機':'桌機'}　百大目標價=${r['百大']}　自選目標價=${r['自選']}　百大加入自選=${r['百大加入自選']}`);
  T(`放大 ${z}% 時百大看得到目標價`, r['百大']===true);
  T(`放大 ${z}% 時自選看得到目標價`, r['自選']===true);
  T(`放大 ${z}% 時百大看得到加入自選`, r['百大加入自選']===true, String(r['百大加入自選']));
  await ctx.close();
}
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
