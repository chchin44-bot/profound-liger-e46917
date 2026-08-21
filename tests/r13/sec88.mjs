/* v88 安全稽核的七項修正。
   每一項都要驗「修好了」而不是「有寫這段程式」——
   所以每一項下面都跟著一個「把修正拿掉就會被抓到」的變異驗證（見檔尾 MUTATIONS 註記）。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
let fail = 0;
const T = (n, ok, x = '') => { if (!ok) fail++; console.log((ok ? '  ok  ' : '!!FAIL') + '  ' + n + (x ? '   ' + x : '')); };

await p.goto('file://'+process.cwd()+'/index.html');
await p.waitForTimeout(2400);
await p.evaluate(() => { try { closeAllModals() } catch (e) { } });

/* 一組看得出金額的持倉，讓每一項洩漏都真的有東西可以洩 */
const seed = () => p.evaluate(() => {
  state.watchlist.forEach(x => { x.inWatch = false; });
  const s = state.watchlist.find(x => x.id === '2330');
  s.inWatch = true; s.txnsMigrated = true; s.txnHide = [];
  s.txns = [{ id: 'b1', kind: 'buy', date: '2024-01-05', shares: 2000, price: 800 }];
  const ser = [], ph = [], t = new Date('2026-08-14');
  for (let i = 400; i >= 0; i--) { ser.push({ date: new Date(t - i * 86400000).toISOString().slice(0, 10), close: 1000 }); ph.push(20); }
  applyStockData(s, { price: 1000, eps: 44, debt: .9, series: ser, asOf: todayISO(),
                      per: 20, perHist: ph, perAsOf: todayISO(), corpEvents: [] }, 'live');
  /* 再放一檔跌很多的，讓 🐊 也有數字 */
  const s2 = state.watchlist.find(x => x.id === '2317');
  s2.inWatch = true; s2.cost = 200; s2.shares = 1000; s2.txnsMigrated = true; s2.txns = [];
  applyStockData(s2, { price: 100, eps: 5, debt: .5, series: ser.map(r => ({ date: r.date, close: 100 })),
                       asOf: todayISO(), per: 20, perHist: ph, perAsOf: todayISO(), corpEvents: [] }, 'live');
  applyPosition(s); applyPosition(s2);
  state.selected = '2330'; state.txnStock = '2330';
  renderAll();
  return { rhino: $('rhinoCount').textContent.trim(), croc: $('crocCount').textContent.trim() };
});
const base = await seed();
T('前置：🦏 與 🐊 在關閉隱私模式時是真的有數字的（不然後面遮什麼都算過）',
  /^[1-9]/.test(base.rhino) || /^[1-9]/.test(base.croc), JSON.stringify(base));

/* ══════════ ① 黑天鵝圖的 tooltip ══════════ */
console.log('\n── ① 黑天鵝圖 tooltip ──');
const swanTip = async () => p.evaluate(() => {
  const ch = state.charts.swan;
  if (!ch) return { err: 'no-chart' };
  /* 用 Chart.js 自己的 active-element 路徑，跟真的把手指按在圖上走同一段程式碼 */
  const el = ch.getDatasetMeta(0).data[0];
  ch.tooltip.setActiveElements(
    ch.data.datasets.map((_, i) => ({ datasetIndex: i, index: 0 })),
    { x: el.x, y: el.y });
  ch.tooltip.update(true);
  return { lines: (ch.tooltip.body || []).flatMap(x => x.lines) };
});
await p.evaluate(() => { state.swanMode = 'add'; runBlackSwan(); });
await p.waitForTimeout(400);
const tipOpen = await swanTip();
T('前置：關閉隱私模式時 tooltip 印得出金額', !tipOpen.err && tipOpen.lines.some(l => /[\d,]{5,}/.test(l)), JSON.stringify(tipOpen).slice(0, 160));
const mvNow = await p.evaluate(() => Math.round(state.watchlist.filter(s => s.inWatch && s.loaded && s.data.price).reduce((a, s) => a + s.data.price * s.shares, 0)));
T('前置：這筆市值不是零（有東西可以洩）', mvNow > 0, String(mvNow));

await p.evaluate(() => setPrivacy(true));
await p.evaluate(() => { runBlackSwan(); });
await p.waitForTimeout(400);
const tipPriv = await swanTip();
T('隱私模式：tooltip 三條線全部是 •••••',
  !tipPriv.err && tipPriv.lines.length >= 3 && tipPriv.lines.every(l => /•••••/.test(l)),
  JSON.stringify(tipPriv).slice(0, 200));
T('隱私模式：tooltip 裡沒有任何 3 位數以上的數字（市值不會漏出來）',
  !tipPriv.err && !tipPriv.lines.some(l => /\d[\d,]{2,}/.test(l)), JSON.stringify(tipPriv.lines));
T('隱私模式：tooltip 仍看得出是哪一條線（遮的是金額，不是意義）',
  !tipPriv.err && tipPriv.lines.some(l => /崩跌/.test(l)), JSON.stringify(tipPriv.lines).slice(0, 160));
const yTick = await p.evaluate(() => {
  const sc = state.charts.swan.scales.y;
  return sc.ticks.map(t => sc.options.ticks.callback(t.value));
});
T('隱私模式：Y 軸刻度仍然是空的（v85 那道防線沒有被這次改動弄壞）',
  yTick.every(v => v === ''), JSON.stringify(yTick).slice(0, 80));

/* ══════════ ② 刪除確認彈窗 ══════════ */
console.log('\n── ② 刪掉這一筆的確認彈窗 ──');
const delBody = async () => {
  await p.evaluate(() => { closeAllModals(); openTxnPage('2330'); });
  await p.waitForTimeout(250);
  await p.evaluate(() => {
    const s = state.watchlist.find(x => x.id === '2330');
    txnDelete((s.txns || [])[0].id);
  });
  await p.waitForTimeout(250);
  return p.evaluate(() => ($('modalBody') || document.getElementById('modalBody') || {}).textContent || '');
};
const dPriv = await delBody();
T('隱私模式：確認彈窗沒有印出股數（2,000 / 2 張）', !/2,000|2 張/.test(dPriv), dPriv.slice(0, 140));
T('隱私模式：確認彈窗沒有印出每股價格 800.00', !/800\.00/.test(dPriv), dPriv.slice(0, 140));
T('隱私模式：確認彈窗有 •••••（有遮，不是整段消失）', /•••••/.test(dPriv), dPriv.slice(0, 140));
T('隱私模式：確認彈窗仍看得出日期與種類（還是回答得了「我要刪哪一筆」）',
  /2024-01-05/.test(dPriv) && /買進/.test(dPriv), dPriv.slice(0, 140));
T('隱私模式：不可復原的警告還在', /沒辦法復原/.test(dPriv), dPriv.slice(0, 60));

await p.evaluate(() => { closeAllModals(); setPrivacy(false); });
await p.waitForTimeout(200);
const dOpen = await delBody();
T('關閉隱私模式：確認彈窗照常印出股數與價格（沒有把功能遮死）',
  /2,000/.test(dOpen) && /800\.00/.test(dOpen), dOpen.slice(0, 140));
await p.evaluate(() => closeAllModals());

/* 配股／減資的錯誤訊息也會講出持股數 */
const stkErr = async (priv) => {
  await p.evaluate(v => setPrivacy(v), priv);
  await p.evaluate(() => { closeAllModals(); openTxnPage('2330'); });
  await p.waitForTimeout(250);
  return p.evaluate(() => {
    $('txKind').value = 'stkdiv'; try { syncTxnForm() } catch (e) { }
    $('txShares').value = '10';               // 比現有 2000 股少 → 一定會噴錯
    $('txDate').value = '2025-01-06';
    txnAdd();
    return ($('txMsg') || {}).textContent || '';
  });
};
const eP = await stkErr(true);
T('隱私模式：配股錯誤訊息沒有講出「你現在有 2,000 股」', !/2,000/.test(eP), eP.slice(0, 90));
T('隱私模式：配股錯誤訊息仍講得出「該填比較大的數字」（沒有變成廢話）',
  /變多/.test(eP) && /隱私模式/.test(eP), eP.slice(0, 90));
const eO = await stkErr(false);
T('關閉隱私模式：配股錯誤訊息照常講出目前股數', /2,000 股/.test(eO), eO.slice(0, 90));
await p.evaluate(() => closeAllModals());

/* ══════════ ③ 匯入會偷偷打開自動儲存 ══════════ */
console.log('\n── ③ 匯入與自動儲存 ──');
/* 畫面上一次只留一則提示，後面的排在 toastQueue 裡——只看 DOM 會漏掉第二則。 */
const toasts = () => p.evaluate(() =>
  [...document.querySelectorAll('.toast-sa')].map(e => e._msg || e.textContent)
    .concat(toastQueue.map(q => q.msg)).join(' | '));
const importWith = (autoSaveBefore) => p.evaluate(async (asb) => {
  document.querySelectorAll('.toast-sa').forEach(e => e.remove());
  toastQueue.length = 0;
  state.autoSave = asb;
  state.pendingImport = { v: 1, savedAt: '2026-08-01T00:00:00Z', autoSave: undefined,
    watch: [{ id: '2454', name: '聯發科', cost: 900, shares: 1000 }] };
  doImport();
  return { after: state.autoSave };
}, autoSaveBefore);

let r = await importWith(false);
await p.waitForTimeout(300);
let tx = await toasts();
T('原本關著自動儲存 → 匯入後被打開（既有行為不變）', r.after === true);
T('而且有明講：提示裡出現「自動儲存」與「打開」', /自動儲存/.test(tx) && /打開/.test(tx), tx.slice(0, 220));
T('提示裡告訴他怎麼關回去', /資料儲存/.test(tx), tx.slice(0, 220));

r = await importWith(true);
await p.waitForTimeout(300);
tx = await toasts();
T('原本就開著自動儲存 → 不會多跳一則沒必要的警告',
  !/已經把它打開/.test(tx), tx.slice(0, 200));
T('匯入成功的提示照常出現', /已從備份檔還原/.test(tx), tx.slice(0, 120));
T('匯入提示不再提「代理設定」（v75 就移除了的東西）', !/代理/.test(tx), tx.slice(0, 200));

await seed();

/* ══════════ ④ 區塊 C 的 🦏／🐊 計數 ══════════ */
console.log('\n── ④ 區塊 C 計數 ──');
await p.evaluate(() => setPrivacy(true));
await p.waitForTimeout(250);
const cPriv = await p.evaluate(() => ({
  rhino: $('rhinoCount').textContent.trim(),
  croc: $('crocCount').textContent.trim(),
  warn: ($('rhinoWarn') || {}).textContent || '',
  tableAnimals: [...document.querySelectorAll('#tblBody tr')].map(r => r.textContent).join(' '),
}));
T('隱私模式：🦏 計數被遮住', /^•+$/.test(cPriv.rhino), cPriv.rhino);
T('隱私模式：🐊 計數被遮住', /^•+$/.test(cPriv.croc), cPriv.croc);
T('隱私模式：「另有 N 檔偏高」的 N 也被遮住', !/另有 \d/.test(cPriv.warn), cPriv.warn);
T('對照組：表格逐列的位階本來就已經遮著（兩者現在一致）',
  !/便宜|昂貴|合理/.test(cPriv.tableAnimals) || /•••••/.test(cPriv.tableAnimals), cPriv.tableAnimals.slice(0, 80));
await p.evaluate(() => setPrivacy(false));
await p.waitForTimeout(250);
const cOpen = await p.evaluate(() => ({
  rhino: $('rhinoCount').textContent.trim(), croc: $('crocCount').textContent.trim() }));
T('關閉隱私模式：🦏／🐊 計數回到真的數字', /^\d+$/.test(cOpen.rhino) && /^\d+$/.test(cOpen.croc), JSON.stringify(cOpen));
T('關閉隱私模式的計數跟一開始一樣（遮罩沒有改到算法）',
  cOpen.rhino === base.rhino && cOpen.croc === base.croc, JSON.stringify(cOpen) + ' vs ' + JSON.stringify(base));

/* ══════════ ⑤ CSP ══════════ */
console.log('\n── ⑤ CSP ──');
const csp = await p.evaluate(() =>
  (document.querySelector('meta[http-equiv="Content-Security-Policy"]') || {}).content || '');
T('connect-src 收斂到 FinMind 一個網域', /connect-src https:\/\/api\.finmindtrade\.com/.test(csp), csp.slice(0, 200));
T('connect-src 不再是 https:（任何網站都能送資料出去）', !/connect-src https:;/.test(csp), csp.slice(0, 200));
T('default-src 仍然是 none', /default-src 'none'/.test(csp));
/* 「meta 標籤裡有那一行」跟「瀏覽器真的擋得住」是兩件事——
   直接叫頁面對第三方送一個請求。注意不能用 fetch 的錯誤訊息判斷：
   被 CSP 擋掉與單純連不上，兩者都是 "Failed to fetch"，這個沙盒本來就沒有外網。
   要看的是只有 CSP 才會發的 securitypolicyviolation 事件。 */
const probe = await p.evaluate(async () => {
  const hits = [];
  const h = e => hits.push({ uri: e.blockedURI, dir: e.violatedDirective });
  document.addEventListener('securitypolicyviolation', h);
  const go = async u => { try { await fetch(u, { mode: 'no-cors' }); } catch (e) { } };
  await go('https://example.com/x');
  await go('https://api.finmindtrade.com/api/v4/data?x=1');
  await new Promise(r => setTimeout(r, 200));
  document.removeEventListener('securitypolicyviolation', h);
  return hits;
});
T('CSP 真的擋掉往第三方網域送資料（example.com 觸發 connect-src 違規）',
  probe.some(x => /example\.com/.test(x.uri) && /connect-src/.test(x.dir)), JSON.stringify(probe));
T('CSP 沒有把 FinMind 自己擋掉（連線功能還活著）',
  !probe.some(x => /finmindtrade/.test(x.uri)), JSON.stringify(probe));
/* 程式碼裡真正會被 fetch 的位址只有 FinMind——註解與說明文字裡的網址不算。
   fetch() 的參數是變數（buildUrl(...)），所以改看組出網址的那個常數。 */
const apiBases = await p.evaluate(() => {
  const js = [...document.querySelectorAll('script')].map(s => s.textContent).join('\n');
  return [...new Set((js.match(/["'`]https:\/\/[a-zA-Z0-9.-]+\/api[^"'`]*/g) || [])
    .map(m => m.slice(1)))];
});
T('程式裡所有 API 位址都在 FinMind 網域內',
  apiBases.length > 0 && apiBases.every(u => /^https:\/\/api\.finmindtrade\.com\//.test(u)), apiBases.join(' '));

/* ══════════ ⑥ 匯出檔裡的「我自己寫的規則」 ══════════ */
console.log('\n── ⑥ 匯出內容 ──');
const snap = await p.evaluate(() => {
  state.myRule = '等我孫子上大學再賣，中間跌多少都不看';
  state.myRuleAt = '2026-05-01';
  state.myRulePending = '改成滿七十五歲再說';
  state.myRulePendingAt = '2026-08-01';
  state.brokerName = '王先生'; state.brokerTel = '0912345678';
  state.token = 'SECRET-TOKEN-XYZ'; state.rememberToken = true;
  return { exp: snapshot(false, { forExport: true }), local: snapshot(false) };
});
const expJson = JSON.stringify(snap.exp);
T('匯出檔：沒有那句規則', !/孫子上大學/.test(expJson), expJson.slice(0, 120));
T('匯出檔：沒有還沒生效的那句', !/七十五歲/.test(expJson));
T('匯出檔：沒有 Token', !/SECRET-TOKEN-XYZ/.test(expJson));
T('匯出檔：沒有券商姓名電話', !/王先生/.test(expJson) && !/0912345678/.test(expJson));
T('匯出檔：自選清單還在（不是把整份存檔清空了事）',
  Array.isArray(snap.exp.watch) && snap.exp.watch.length > 0, String((snap.exp.watch || []).length));
const locJson = JSON.stringify(snap.local);
T('本機快照：那句規則還在（只有「匯出」才拿掉，不影響自己這台裝置）', /孫子上大學/.test(locJson));
T('本機快照：Token 還在（「記住 Token」這個功能本身沒被弄壞）', /SECRET-TOKEN-XYZ/.test(locJson));

/* 匯入端本來就不還原規則——所以拿掉不會少任何還原能力。這一條是「拿掉是安全的」的證明。 */
const rt = await p.evaluate(() => {
  state.myRule = ''; state.myRuleAt = '';
  applySnapshot({ v: 1, watch: [], myRule: '別人的檔案偷偷寫進來的字', myRuleAt: '2026-01-01' }, { withToken: false });
  return state.myRule;
});
T('匯入別人的檔案不會在你的畫面上寫字（原本的防線仍在）', rt === '', rt);

/* ══════════ ⑦ Token 欄位的「顯示」 ══════════ */
console.log('\n── ⑦ Token 欄位 ──');
const tokState = () => p.evaluate(() => ({
  type: $('tokenInput').type, btn: ($('toggleToken') || {}).textContent }));
const openSettings = () => p.evaluate(() => {
  const pn = $('settingsPanel'); if (pn) pn.classList.remove('hidden');
  setTokenCollapsed(false);
});
const showToken = async () => {
  await p.evaluate(() => { $('tokenInput').type = 'password'; $('toggleToken').textContent = '顯示'; });
  await openSettings();
  await p.click('#toggleToken');
  await p.waitForTimeout(120);
};
await showToken();
T('前置：按「顯示」之後真的變明文', (await tokState()).type === 'text', JSON.stringify(await tokState()));
await p.evaluate(() => setPrivacy(true));
await p.waitForTimeout(200);
let ts = await tokState();
T('開隱私模式 → Token 欄位收回遮蔽', ts.type === 'password', JSON.stringify(ts));
T('開隱私模式 → 按鈕字也回到「顯示」（不會變成按了沒反應）', ts.btn === '顯示', JSON.stringify(ts));
await p.evaluate(() => setPrivacy(false));

await showToken();
await p.evaluate(() => setTokenCollapsed(true));
await p.waitForTimeout(150);
ts = await tokState();
T('收起設定區 → Token 欄位收回遮蔽（下次展開不會整串躺在畫面上）', ts.type === 'password', JSON.stringify(ts));
await openSettings();
await p.waitForTimeout(150);
ts = await tokState();
T('重新展開設定區時仍是遮蔽的', ts.type === 'password', JSON.stringify(ts));
await p.click('#toggleToken'); await p.waitForTimeout(120);
T('「顯示」這顆按鈕本身還能用（沒有被鎖死）', (await tokState()).type === 'text');

/* ══════════ 收尾 ══════════ */
console.log('');
const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
T('沒有橫向溢出', ov <= 1, 'ov=' + ov);
T('全程沒有執行期錯誤', errs.length === 0, errs.join(' | '));
await p.screenshot({ path: './tests/r13/sec88.png' });
console.log(fail ? `\nFAIL=${fail}` : '\nFAIL=0');
await b.close(); process.exit(fail ? 1 : 0);

/* ══════════ MUTATIONS（2026-08-18 實跑，10 個變異全部被抓到）══════════
   把修正一個一個拆掉，確認這支測試會失敗——不然它只是在驗「有沒有寫這段程式」。
     ① tooltip callback 拿掉 state.privacy 判斷          → 2 項失敗
     ② 刪除確認框的 detail 改回 esc()（不經 SENS）        → 3 項失敗
     ②b 配股／減資錯誤訊息的 state.privacy 改成 false     → 2 項失敗
     ③ lastImportTurnedOnAutoSave 改成永遠 false          → 2 項失敗
     ④ rhinoCount 改回 textContent                        → 1 項失敗
     ④b crocCount 改回 textContent                        → 1 項失敗
     ⑤ CSP connect-src 放寬回 https:                      → 3 項失敗
     ⑥ 匯出 snapshot 的 myRule 拿掉 forExport 判斷        → 1 項失敗
     ⑦ setPrivacy 裡的 hideTokenField() 停用              → 2 項失敗
     ⑦b setTokenCollapsed 裡的 hideTokenField() 拿掉      → 3 項失敗
*/
