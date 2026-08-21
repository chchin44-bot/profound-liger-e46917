/* longValuation() 契約測試（v93i）
   守六件事：
     ① 五個維度不互相塌陷，尤其 pricing 不被 confidence 決定
     ② 信心不足時不發綠燈
     ③ 任何 confidence 降級都必須留下 machine-readable 的理由
     ④ pricing 是第二層唯一的價格權威（buildTargets 只抄不判）
     ⑤ 第三層服從 capabilities，而且降級不等於把中短線一起殺掉
     ⑥ 說明頁不再教一條 production 不保證成立的規則 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport:{ width:390, height:900 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(1200);

const R = await p.evaluate(() => {
  const ser=(px,n)=>{const a=[];for(let i=n;i>=0;i--){const d=new Date(new Date('2026-08-14')-i*86400000);
    a.push({date:d.toISOString().slice(0,10),close:px});}return a;};
  const flat = Array.from({length:1200},(_,i)=>12+(i%20)/3);   // 震盪，不是趨勢
  const out=[];
  const mk=(label,extra)=>{
    const s=state.watchlist[0]; s.ind=extra.ind||'半導體業'; s.inWatch=true;
    applyStockData(s, Object.assign({ price:60,eps:4,debt:.4,series:ser(60,320),asOf:'2026-08-14',
      per:15,pbr:2,perHist:flat,pbrHist:null,perAsOf:'2026-08-14',ma60:58,ma240:55 }, extra),'live');
    const d=s.data, L=longValuation(d), v=valuate(d.pe,d), t=d.targets, tc=tacticFor(s);
    out.push({label, shape:epsShape(d), method:L.method, basis:L.basis, position:L.position,
      confidence:L.confidence, pricing:L.pricing, caps:L.capabilities, reasons:L.reasons,
      den:L.denominator, hasPrices:!!L.prices,
      level:v.level, light:v.light, key:v.key, vlabel:v.label,
      tOk:!!t.longOk, tBroken:!!t.longBroken, tCheap:t.cheap,
      ladder:(()=>{const x=document.createElement('div'); x.innerHTML=priceLadder(d);
              return /長期便宜參考價|長期合理參考價|長期偏貴參考價/.test(x.textContent);})(),
      tcKey:tc&&tc.key, tcMuted:!!(tc&&tc.muted), tcConf:tc&&tc.longConfidence,
      tcLongSt:tc&&tc.longSt, tcLongRaw:tc&&tc.longStRaw, tcTacticOk:tc&&tc.longTacticOk,
      tcBody:(tc&&tc.body)||'', tcMid:tc&&tc.midSt, tcShort:tc&&tc.shortSt});
  };
  mk('穩定獲利',              { epsVals:[1.2,1.25,1.18,1.22], per:15 });
  mk('連四季走高（成長）',     { epsVals:[1,2,3,4], per:15 });
  mk('連四季縮小（在便宜區）', { epsVals:[4,3,2,1], per:5 });
  mk('忽高忽低',              { epsVals:[1,9,2,7], per:15 });
  mk('沒有 epsVals（形狀不明）',{ epsVals:null, per:15 });
  mk('換算價已脫鉤（國巨式）', { epsVals:[3,3.1,3.05,3.08], per:40, price:608, eps:14.88,
                               perHist:Array.from({length:1200},(_,i)=> i%10===0 ? 5.7+(i%97) : 5.7+(i%9)) });
  mk('金融股有 PBR',          { ind:'金融保險業', pbr:1.0, pbrHist:Array.from({length:1200},(_,i)=>0.6+(i%20)/60), epsVals:[1,1.1,1.05,1.08] });
  mk('金融股無 PBR',          { ind:'金融保險業', pbrHist:null, epsVals:[1,1.1,1.05,1.08] });
  mk('EPS 缺漏',              { eps:null, per:null, epsVals:null });
  return out;
});

let fail=0,n=0; const T=(ok,m,x='')=>{n++; if(ok) console.log('  ok   '+m); else {fail++; console.log('!!FAIL '+m+(x?'   '+x:''));} };

for(const r of R){
  console.log(`\n── ${r.label}: shape=${r.shape} ${r.method}/${r.basis} pos=${r.position} conf=${r.confidence} price=${r.pricing} → ${r.level}/${r.light}「${r.vlabel}」 卡=${r.tcKey}`);
  console.log('   reasons: ' + JSON.stringify(r.reasons));
  if(r.confidence !== 'normal')
    T(r.level !== 'buy' && r.light !== '🟢', r.label + '：② 信心不足時沒有發綠燈', r.level+'/'+r.light);
  if(r.confidence !== 'normal')
    T(r.reasons.length > 0, r.label + '：③ 降級一定說得出理由（reasons 不可為空）');
  T(r.caps.position === (r.confidence !== 'off' && r.method !== 'none'), r.label + '：capabilities.position 與 confidence／method 一致');
  T(r.caps.longPrices === (r.pricing === 'available'), r.label + '：capabilities.longPrices 就是 pricing');
  T(!r.caps.tactic || r.confidence === 'normal', r.label + '：可信度不足時 capabilities.tactic 為 false');
  // ④ 第二層唯一權威：畫面上有沒有長線三條，必須等於 pricing
  T(r.ladder === (r.pricing === 'available'), r.label + '：④ 價位階梯顯示與否 ＝ pricing', `ladder=${r.ladder} pricing=${r.pricing}`);
  // ⑤ 第三層：不可用就靜音，可用但可信度低就降級——中短線一律不受影響
  if(r.pricing === 'blocked' || !r.caps.position)
    T(r.tcKey === 'V' || r.tcKey === 'X', r.label + '：⑤ 價位不可用時第三層不下結論', 'card=' + r.tcKey);
  if(r.confidence === 'limited' && r.pricing === 'available'){
    T(/這次可信度有限/.test(r.tcBody), r.label + '：⑤ 可信度有限時卡片有降級說明（但沒有靜音）');
    /* 審查指出的 overclaim：只驗「caps.tactic 是 false」與「卡片有警語」，
       不能證明第三層真的服從 capabilities——欄位可以算出來卻沒人讀（dead contract）。
       這一條直接驗決策鏈：capabilities.tactic 為 false 時，
       長線位階不得再參與命名（longSt 降成 'na'），但降級前的值要留著給說明用。 */
    T(r.tcTacticOk === false && r.tcLongSt === 'na' && r.tcLongRaw !== 'na',
      r.label + '：⑤ capabilities.tactic=false 時長線位階退出決策鏈（但保留原值）',
      `tacticOk=${r.tcTacticOk} longSt=${r.tcLongSt} raw=${r.tcLongRaw}`);
  }
  if(r.confidence === 'normal' && r.pricing === 'available')
    T(r.tcTacticOk === true && r.tcLongSt === r.tcLongRaw,
      r.label + '：⑤ 可信時長線位階照常參與決策（沒有被誤殺）',
      `longSt=${r.tcLongSt} raw=${r.tcLongRaw}`);
}

const g = l => R.find(x => x.label === l);
// ① 兩個方向都驗：limited 仍出價、normal 也可能不出價
T(g('連四季走高（成長）').confidence==='limited' && g('連四季走高（成長）').pricing==='available',
  '① 單調上升：limited 但價位照給（pricing 不被 confidence 綁架）');
T(g('金融股有 PBR').confidence==='normal' && g('金融股有 PBR').pricing==='blocked',
  '① 金融股：normal 但不出長線價位（反方向也成立）');
// ③ insufficient 一定要有理由碼
T(g('沒有 epsVals（形狀不明）').reasons.includes('EPS_INSUFFICIENT'),
  '③ 形狀不明時推得出 EPS_INSUFFICIENT', JSON.stringify(g('沒有 epsVals（形狀不明）').reasons));
// ④ buildTargets 只抄不判：longBroken 必須來自理由碼
const brk = g('換算價已脫鉤（國巨式）');
T(brk.reasons.includes('PRICE_MODEL_DIVERGED') && brk.pricing==='blocked' && brk.tBroken,
  '④ 脫鉤改由理由碼表示，longBroken 只是它的別名', JSON.stringify({r:brk.reasons,broken:brk.tBroken}));
T(brk.hasPrices && brk.tCheap != null,
  '④ 脫鉤時價位仍然算得出來（面板要拿它們解釋「這不是目標價」）');
// ⑤ 中短線不得被長線可信度連坐
for(const l of ['忽高忽低','金融股有 PBR','換算價已脫鉤（國巨式）']){
  const r=g(l);
  T(r.tcMid !== 'na' || r.tcShort !== 'na', l + '：⑤ 中線或短線沒有被長線一起靜音', `mid=${r.tcMid} short=${r.tcShort}`);
}
// epsShape 五態
T(g('連四季走高（成長）').shape==='monotonic_up' && g('忽高忽低').shape==='erratic'
  && g('連四季縮小（在便宜區）').shape==='monotonic_down' && g('穩定獲利').shape==='stable',
  'epsShape 四種形狀都分得出來（舊版 epsVolatile 只是一個 boolean）');
T(g('連四季縮小（在便宜區）').den.trend==='down' && g('連四季走高（成長）').den.trend==='up'
  && g('金融股有 PBR').den.metric==='book_value',
  'denominator 說得出分母是什麼、往哪邊走');

// 理由碼 ≠ 文案
const meta = await p.evaluate(()=>Object.keys(LONG_REASON_COPY).map(k=>({k,
  code:/^[A-Z][A-Z0-9_]*$/.test(k), copy:!!(LONG_REASON_COPY[k].gist&&LONG_REASON_COPY[k].detail&&LONG_REASON_COPY[k].lim)})));
T(meta.every(x=>x.code), '理由碼都是代碼形狀，不是句子');
T(meta.every(x=>x.copy), '每個理由碼都有 gist／detail／lim 三層');
const used=[...new Set(R.flatMap(x=>x.reasons))];
T(used.every(c=>meta.some(x=>x.k===c)), '實際吐出來的理由碼都有文案：'+JSON.stringify(used));

// ⑥ 說明頁
const help = await p.evaluate(()=>{const gg=GUIDE.find(x=>x.k==='targets');
  const t=document.createElement('div'); t.innerHTML=gg.html(); return t.textContent.replace(/\s+/g,' ');});
T(/股價淨值比/.test(help) && /金融/.test(help), '⑥ 說明頁講到金融股用 PBR');
T(/同業中位數/.test(help) && /產業慣例/.test(help), '⑥ 說明頁講到基準會退階');
T(/計算依據/.test(help), '⑥ 說明頁叫使用者以個股畫面的「計算依據」為準');
T(!/倍數依這檔自己過去五年的本益比決定/.test(help), '⑥ 說明頁不再把自身五年歷史寫成唯一基準');

console.log('\n' + (fail ? 'FAIL='+fail+' / '+n : '全部通過（'+n+' 條）'));
console.log('pageerror: ' + (errs.length?errs.join(' | '):'none'));
await b.close(); process.exit(fail?1:0);
