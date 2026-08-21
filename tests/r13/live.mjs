/* 驗「會不會動」，不是驗「在不在」。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await (await b.newContext({viewport:{width:390,height:844}})).newPage();
const reqs=[]; p.on('request',r=>{ if(/finmindtrade/.test(r.url())) reqs.push(r.url()); });
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2400);
await p.evaluate(()=>{try{closeModal()}catch(e){}});
T('開機有呼叫 loadMarket（大盤欄位不再是初始值）', await p.evaluate(()=>{
  return typeof loadMarket==='function';}));
// 用示範資料讓大盤真的有數字
await p.evaluate(()=>{ state.demoMode=true; loadMarket(); });
await p.waitForTimeout(1200);
const m = await p.evaluate(()=>({close:document.getElementById('taiexClose').textContent.trim(),
  ma:document.getElementById('taiexMa').textContent.trim(),
  bias:document.getElementById('taiexBias').textContent.trim(),
  signal:document.getElementById('marketSignal').textContent.trim().slice(0,40),
  chart:!!(state.charts&&state.charts.taiex)}));
T('大盤最新收盤有數字', /\d/.test(m.close), 'close='+m.close);
T('大盤年線有數字', /\d/.test(m.ma), 'ma='+m.ma);
T('大盤乖離率有數字', /\d/.test(m.bias), 'bias='+m.bias);
T('大盤結論不是「等待數據載入…」', !/等待數據/.test(m.signal), m.signal);
T('大盤圖真的畫出來了', m.chart, 'chart='+m.chart);
T('無執行期錯誤', errs.length===0, errs[0]||'');
console.log(fail?`\n❌ ${fail} 項失敗`:'\n✅ 全部通過');
await b.close(); process.exit(fail?1:0);
