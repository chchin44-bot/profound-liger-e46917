/* provenance 回歸測試（v93g／v93h）
   問題只有一個：畫面上那句「我是用什麼尺量的」，跟 valuate() 實際用的尺一不一樣。
   舊版三種情況會說錯：①金融股其實是 PBR ②basis='ind' 其實是同業中位數 ③basis='conv' 其實是產業慣例。
   這裡不寫死「應該出現哪句話」——那只是把同一個假設抄第二遍。
   做法是先問程式 v.method／v.basis，再驗畫面上的字與數字有沒有跟著那個答案走。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport:{ width:390, height:900 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('file://'+process.cwd()+'/index.html');
await p.waitForTimeout(1000);

const R = await p.evaluate(() => {
  const ser = (px,n) => { const a=[]; for(let i=n;i>=0;i--){ const d=new Date(new Date('2026-08-14')-i*86400000);
    a.push({date:d.toISOString().slice(0,10), close:+(px*(1+Math.sin(i/17)*0.06)).toFixed(2)}); } a[a.length-1].close=px; return a; };
  const out = [];
  const mk = (label, ind, extra) => {
    const s = state.watchlist[0]; s.ind = ind; s.inWatch = true;
    applyStockData(s, Object.assign({
      price:60, eps:1, debt:.4, holder:null, holderPrev:null, series:ser(60,320),
      asOf:'2026-08-14', per:60, pbr:3.0, divYield:1, ind, perAsOf:'2026-08-14',
      epsVals:[1,1.02,0.99,1.01], perHist:null, pbrHist:null }, extra), 'live');
    const d = s.data;
    const v = valuate(d.pe, d);
    /* stockAnimals 吃的是「資料形狀」，不是自選清單那一列（呼叫端一律這樣拼）。 */
    const animals = stockAnimals({ ...d, id:s.id, ind:s.ind, pnl:null });
    const note = noteLine(s, d, animals, v, true);
    /* 只驗資料層跟 noteLine 不夠：動物卡的證據列是另一份程式，
       之前就發生過「資料層對、卡片上那句話錯」。這裡把卡片真的打開來讀。 */
    let card = '';
    if(animals.includes('pig@val')){ showAnimalInfo('pig@val', s.id); card = ($('modalBody').textContent||''); closeModal(); }
    out.push({ label, method:v.method, basis:v.basis||null, level:v.level, key:v.key,
               pe:d.pe, pbr:d.pbr, animals, note, card,
               basisName:VAL_BASIS_NAME[v.basis]||null, methodName:VAL_METHOD_NAME[v.method]||null });
  };
  mk('一般股·自身歷史·昂貴', '半導體業', { perHist: Array.from({length:1200},(_,i)=>12+(i%20)/3) });
  mk('一般股·無自身歷史·昂貴', '半導體業', {});
  /* basis='ind' 要有「至少 5 檔同業、而且不含自己」才成立。
     沒有這段的話這支測試會全綠，但同業中位數那條分支從頭到尾沒被走過——
     那正是這份程式反覆出現的「綠燈但其實什麼都沒測到」。 */
  for(let i=0;i<5;i++) state.watchlist.push({ id:'900'+i, ind:'半導體業', loaded:true,
    data:{ src:'live', pe:14+i, asOf:'2026-08-14' } });
  mk('一般股·同業中位數·昂貴', '半導體業', {});
  state.watchlist = state.watchlist.filter(x => !/^900\d$/.test(x.id));
  mk('金融股·有PBR歷史·高檔', '金融保險業',
     { pbrHist: Array.from({length:1200},(_,i)=>0.6+(i%20)/60), pbr:3.0 });
  mk('金融股·無PBR歷史', '金融保險業', {});
  mk('EPS 缺漏', '半導體業', { eps:null, per:null });
  return out;
});

let fail = 0, n = 0;
const T = (ok, msg) => { n++; if(ok) console.log('  ok   ' + msg); else { fail++; console.log('!!FAIL ' + msg); } };

for(const r of R){
  console.log('\n── ' + r.label + ' ── method=' + r.method + ' basis=' + r.basis + ' key=' + r.key);
  console.log('   note: ' + r.note.replace(/<[^>]+>/g,'').trim());
  T(['pe','pbr','none'].includes(r.method), r.label + '：valuate 有回傳合法的 method');
  if(r.method !== 'none') T(!!r.basis && !!r.basisName, r.label + '：method 不是 none 時一定要有認得出來的 basis');
  if(r.method === 'none') T(!r.animals.includes('pig@val'), r.label + '：判不出估值方法就不該掛 🐖 估值過熱');

  if(r.animals.includes('pig@val')){
    const txt = r.note.replace(/<[^>]+>/g,'');
    const other = r.method === 'pbr' ? '本益比' : '股價淨值比';
    const want = r.method === 'pbr' ? r.pbr.toFixed(2) : r.pe.toFixed(1);
    T(txt.includes(r.methodName), r.label + '：說明講的是實際用的尺（' + r.methodName + '）');
    T(!txt.includes(other), r.label + '：沒有講到另一把它其實沒用的尺（' + other + '）');
    T(txt.includes(r.basisName), r.label + '：說明講的是實際的比較基準（' + r.basisName + '）');
    T(txt.includes(want), r.label + '：印出來的數字是那把尺量到的（' + want + '）');
    if(r.method === 'pbr') T(!txt.includes(r.pe.toFixed(1)) || r.pe.toFixed(1) === want, r.label + '：金融股沒有把本益比的數字印出來');
    const c = r.card;
    T(!!c, r.label + '：動物卡有打開');
    T(c.includes(r.methodName), r.label + '：動物卡的證據層講的是實際用的尺');
    T(!c.includes(other), r.label + '：動物卡沒有講到它其實沒用的那把尺');
    T(c.includes(r.basisName), r.label + '：動物卡的證據層講的是實際的比較基準');
    T(c.includes(want), r.label + '：動物卡印出來的數字是那把尺量到的');
  }
}

const fs = await import('node:fs');
const html = fs.readFileSync(process.cwd()+'/index.html','utf8');
for(const bad of ['本益比在這檔自己五年裡', '這一檔現在的本益比']){
  T(!html.includes(bad), '原始碼裡沒有寫死的舊句子：「' + bad + '」');
}

console.log('\n' + (fail ? 'FAIL=' + fail + ' / ' + n : '全部通過（' + n + ' 條）'));
console.log('pageerror: ' + (errs.length ? errs.join(' | ') : 'none'));
await b.close();
process.exit(fail ? 1 : 0);
