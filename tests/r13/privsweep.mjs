/* 隱私模式的「全頁掃描」。
   v85 補了 Y 軸、v88 補了 tooltip、刪除彈窗、區塊 C 計數——每一次都是被單獨抓到、單獨修的。
   這種一個一個補的做法會一直漏，因為沒有人在問「還有哪裡沒補」。
   這支測試改成反過來問：把一組獨一無二的金額餵進去，開隱私模式，
   然後把每一個畫面（含每個彈窗）的文字全部撈出來，看那些數字還在不在。
   任何新加的畫面只要洩漏，這支就會紅。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
let fail = 0;
const T = (n, ok, x = '') => { if (!ok) fail++; console.log((ok ? '  ok  ' : '!!FAIL') + '  ' + n + (x ? '   ' + x : '')); };

await p.goto('file://'+process.cwd()+'/index.html');
await p.waitForTimeout(2400);
await p.evaluate(() => { try { closeAllModals() } catch (e) { } });

/* 用不會跟版本號、日期、比率、股票代號撞在一起的怪數字，
   這樣「掃到它」就一定是洩漏，不是巧合。 */
const COST = 731.37, SHARES = 4321, PRICE = 1289;
const seeded = await p.evaluate(([cost, shares, price]) => {
  state.watchlist.forEach(x => { x.inWatch = false; });
  const s = state.watchlist.find(x => x.id === '2330');
  s.inWatch = true; s.txnsMigrated = true; s.txnHide = [];
  s.txns = [{ id: 'b1', kind: 'buy', date: '2024-01-05', shares, price: cost }];
  const ser = [], ph = [], t = new Date();
  for (let i = 400; i >= 0; i--) ser.push({ date: new Date(t - i * 86400000).toISOString().slice(0, 10), close: price });
  for (let i = 0; i < 401; i++) ph.push(20);
  applyStockData(s, { price, eps: 44, debt: .9, series: ser, asOf: todayISO(),
                      per: 20, perHist: ph, perAsOf: todayISO(), corpEvents: [] }, 'live');
  applyPosition(s); state.selected = '2330'; state.txnStock = '2330';
  renderAll();
  const q = positionOf(s);
  return { shares: q.shares, cost: Math.round(q.cost), mv: Math.round(q.shares * price),
           pnl: Math.round(q.shares * price - q.cost) };
}, [COST, SHARES, PRICE]);

/* 這些字串一旦出現在隱私模式下的畫面上就是洩漏。
   千分位與不加千分位兩種寫法都要找——程式裡兩種都有人用。 */
const grp = n => Math.round(n).toLocaleString('en-US');
const SECRETS = [
  ['每股成本', String(COST)], ['每股成本(千分位)', grp(COST)],
  ['股數', String(SHARES)], ['股數(千分位)', grp(SHARES)],
  ['總成本', grp(seeded.cost)], ['總成本(無千分位)', String(seeded.cost)],
  ['市值', grp(seeded.mv)], ['市值(無千分位)', String(seeded.mv)],
  ['損益', grp(seeded.pnl)], ['損益(無千分位)', String(seeded.pnl)],
];
console.log('  種下的秘密：' + JSON.stringify(seeded) + '\n');

/* 只看「使用者看得到」的文字：display:none / hidden 的節點不算。
   textContent 會把藏起來的東西一起撈出來，那會製造假警報。 */
const visibleText = () => p.evaluate(() => {
  const out = [];
  const walk = el => {
    if (!el || el.nodeType !== 1) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.classList.contains('hidden')) return;
    for (const n of el.childNodes) {
      if (n.nodeType === 3) { const t = n.textContent.trim(); if (t) out.push(t); }
      else walk(n);
    }
  };
  walk(document.body);
  return out.join(' ┃ ');
});

const scan = async (label) => {
  const txt = await visibleText();
  const leaks = SECRETS.filter(([, v]) => v.length >= 3 && txt.includes(v)).map(([k]) => k);
  T(`${label}：沒有洩漏任何金額`, leaks.length === 0, leaks.join('、') || '');
  return txt;
};

/* ── 逐個畫面走一遍 ── */
await p.evaluate(() => setPrivacy(true));
await p.waitForTimeout(350);
const screens = [
  ['首頁（自選表格＋區塊 B／C）', () => { closeAllModals(); }],
  ['交易紀錄', () => { closeAllModals(); openTxnPage('2330'); }],
  ['刪除確認彈窗', () => { const s = state.watchlist.find(x => x.id === '2330'); openTxnPage('2330'); txnDelete(s.txns[0].id); }],
  ['移除標的確認彈窗', () => { closeAllModals(); removeStock('2330'); }],
  ['使用說明', () => { closeAllModals(); openGuide(); }],
  ['資料儲存面板', () => { closeAllModals(); openDataPanel(); }],
  ['黑天鵝（持續扣款）', () => { closeAllModals(); state.swanMode = 'add'; runBlackSwan(); }],
  ['黑天鵝（提領）', () => { closeAllModals(); state.swanMode = 'draw'; runBlackSwan(); }],
];
for (const [name, fn] of screens) {
  try { await p.evaluate(f => eval('(' + f + ')()'), fn.toString()); }
  catch (e) { T(`${name}：打得開`, false, String(e).slice(0, 90)); continue; }
  await p.waitForTimeout(320);
  await scan(name);
}
await p.evaluate(() => closeAllModals());

/* ── 圖表是畫在 canvas 上的，文字掃不到：三張圖各自問一次 ── */
const chartLeak = async (key, label) => {
  const r = await p.evaluate(k => {
    const ch = state.charts[k];
    if (!ch) return { none: true };
    const out = { ticks: [], tips: [] };
    Object.values(ch.scales || {}).forEach(sc => {
      const cb = sc.options && sc.options.ticks && sc.options.ticks.callback;
      (sc.ticks || []).forEach(t => out.ticks.push(cb ? String(cb.call(sc, t.value, 0, sc.ticks)) : String(t.value)));
    });
    try {
      const el = ch.getDatasetMeta(0).data[0];
      if (el) {
        ch.tooltip.setActiveElements(ch.data.datasets.map((_, i) => ({ datasetIndex: i, index: 0 })), { x: el.x, y: el.y });
        ch.tooltip.update(true);
        (ch.tooltip.body || []).forEach(x => out.tips.push(...x.lines));
        (ch.tooltip.title || []).forEach(x => out.tips.push(x));
      }
    } catch (e) { out.tipErr = String(e).slice(0, 60); }
    return out;
  }, key);
  if (r.none) { console.log(`  --    ${label}：這次沒有畫出來，略過`); return; }
  const blob = [...r.ticks, ...r.tips].join(' ┃ ');
  const leaks = SECRETS.filter(([, v]) => v.length >= 3 && blob.includes(v)).map(([k]) => k);
  T(`${label}：刻度與 tooltip 都沒有洩漏`, leaks.length === 0, (leaks.join('、') || '') + ' ｜ ' + blob.slice(0, 120));
};
await p.evaluate(() => { state.swanMode = 'add'; runBlackSwan(); });
await p.waitForTimeout(350);
await chartLeak('swan', '黑天鵝圖');
/* 配置圖在 v6x 之後已經不是 canvas 而是 HTML 長條，上面的文字掃描已經涵蓋它；
   大盤圖畫的是加權指數，公開資料，本來就不必遮。兩者留在這裡是為了
   「哪天有人把它們改回 canvas」時不會沒人看著。 */
await chartLeak('alloc', '配置圖（目前是 HTML 長條，已由文字掃描涵蓋）');
await chartLeak('taiex', '大盤圖（公開資料，本來就不必遮）');

/* ── 反向：關掉隱私模式，這些數字必須回得來，否則就是把功能遮死了 ── */
await p.evaluate(() => { closeAllModals(); setPrivacy(false); });
await p.waitForTimeout(350);
const open = await visibleText();
const back = SECRETS.filter(([, v]) => v.length >= 3 && open.includes(v)).map(([k]) => k);
T('關掉隱私模式後，金額真的回得來（不是被遮死）', back.length >= 2, '看得到：' + back.join('、'));

console.log('');
T('全程沒有執行期錯誤', errs.length === 0, errs.join(' | '));
console.log(fail ? `\nFAIL=${fail}` : '\nFAIL=0');
await b.close(); process.exit(fail ? 1 : 0);

/* ══════════ MUTATIONS（2026-08-18 實跑，3 個變異全部被抓到）══════════
     SENS() 停用（等於整頁遮罩失效）        → 抓到
     黑天鵝 tooltip 的 privacy 判斷停用      → 抓到
     刪除確認框的 detail 不經 SENS           → 抓到
   也就是說：這支測試不是在看「有沒有寫遮罩」，是真的在看數字有沒有出現在畫面上。
*/
