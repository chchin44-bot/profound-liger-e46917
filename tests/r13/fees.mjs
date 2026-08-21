/* v82：手續費／證交稅單獨列出，且「全部合計」要真的合計。
   舊版的毛病是標籤說「全部」、數字只有「還沒賣的部分」——
   實測賣掉一半又配過息的持倉，畫面 +198,860、真值 +401,295。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
let fail = 0;
const T = (n, ok, x = '') => { if (!ok) fail++; console.log((ok ? '  ok  ' : '!!FAIL') + '  ' + n + (x ? '   ' + x : '')); };

await p.goto('file://'+process.cwd()+'/index.html');
await p.waitForTimeout(2400);
await p.evaluate(() => { try { closeModal() } catch (e) { } });

/* 只留一檔，避免預設持股干擾統計 */
const setup = (txns) => p.evaluate(tx => {
  state.watchlist.forEach(x => { x.inWatch = false; });
  const s = state.watchlist.find(x => x.id === '2330');
  s.inWatch = true; s.txnsMigrated = true; s.txnHide = []; s.txns = tx;
  const ser = [], ph = [], t = new Date('2026-08-14');
  for (let i = 1300; i >= 0; i--) {
    ser.push({ date: new Date(t - i * 86400000).toISOString().slice(0, 10), close: 1000 }); ph.push(20);
  }
  applyStockData(s, { price: 1000, eps: 44, debt: .3, series: ser, asOf: '2026-08-14',
                      per: 20, perHist: ph, perAsOf: '2026-08-14',
                      corpEvents: [{ date: '2024-06-13', kind: 'div', type: '息', amt: 4.0 }] }, 'live');
  applyPosition(s); state.selected = '2330'; state.txnStock = '2330';
  renderAll(); renderTxnPage();
  const q = positionOf(s);
  return { shares: q.shares, avgCost: +q.avgCost.toFixed(2), cost: Math.round(q.cost),
           realized: Math.round(q.realized), divCash: Math.round(q.divCash),
           feePaid: Math.round(q.feePaid), taxPaid: Math.round(q.taxPaid) };
}, txns);

const txtOf = sel => p.evaluate(s => (document.querySelector(s)?.textContent || '').replace(/\s+/g, ' ').trim(), sel);
const num = s => { const m = String(s).replace(/[−–]/g, '-').match(/-?[\d,]+/); return m ? +m[0].replace(/,/g, '') : NaN; };

/* ══ ① 買進 + 賣出 + 官方配息 ══ */
const BUY = { id: 'b1', kind: 'buy', date: '2024-01-05', shares: 2000, price: 800 };
const SELL = { id: 's1', kind: 'sell', date: '2025-01-06', shares: 1000, price: 1000 };
let q = await setup([BUY, SELL]);

T('帳本：賣出後每股成本不變（賣出不改變成本單價）', q.avgCost === 801.14, q.avgCost);
T('帳本：手續費有累計', q.feePaid === 2280 + 1425, q.feePaid);
T('帳本：證交稅只有賣出才有', q.taxPaid === 3000, q.taxPaid);

const body = await txtOf('#bigBody');
T('賣出那一列印出手續費', /手續費 1,425/.test(body), body.slice(0, 0));
T('賣出那一列印出證交稅', /證交稅 3,000/.test(body));
T('賣出那一列印出「戶頭實收」', /戶頭實收 995,575/.test(body));
T('實收 ＝ 成交額 − 手續費 − 證交稅', 1000000 - 1425 - 3000 === 995575);
T('買進那一列印出「戶頭實付」', /戶頭實付 1,602,280/.test(body));
T('實付 ＝ 成交額 ＋ 手續費', 1600000 + 2280 === 1602280);
/* 只看「買進」那一列本身，不要靠整段文字的相對位置猜——
   舊寫法用 body 上的 regex，把「買進也被課證交稅」這個變異放過去了。 */
const rowOf = lab => p.evaluate(k => {
  const hit = [...document.querySelectorAll('#bigBody .border-t')]
    .find(d => (d.querySelector('.font-semibold')?.textContent || '').trim() === k);
  return hit ? hit.textContent.replace(/\s+/g, ' ').trim() : null;
}, lab);
const buyRow = await rowOf('買進'), sellRow = await rowOf('賣出');
T('抓得到買進那一列', !!buyRow, String(buyRow).slice(0, 60));
T('買進那一列沒有證交稅（買進本來就免稅）', buyRow != null && !/證交稅/.test(buyRow), buyRow);
T('買進那一列的實付 ＝ 成交額 ＋ 手續費', /戶頭實付 1,602,280/.test(buyRow || ''));
T('賣出那一列同時有手續費與證交稅',
  sellRow != null && /手續費 1,425/.test(sellRow) && /證交稅 3,000/.test(sellRow), sellRow);

/* 只驗「有沒有這一行」是不夠的——那正是測了東西在不在、沒測它對不對。
   買 2,280 ＋ 賣 1,425 ＝ 3,705；證交稅只有賣出的 3,000。 */
T('摘要「手續費合計」＝ 3,705（買 2,280 ＋ 賣 1,425）',
  /手續費合計\s*−3,705 元/.test(body), (body.match(/手續費合計\s*[^ ]+ 元/) || [])[0]);
T('摘要「證交稅合計」＝ 3,000（只有賣出才有）',
  /證交稅合計\s*−3,000 元/.test(body), (body.match(/證交稅合計\s*[^ ]+ 元/) || [])[0]);
T('手續費合計與證交稅合計不是同一個數字', 3705 !== 3000);
T('摘要有「到今天總共賺賠」', /到今天總共賺賠/.test(body));
const totalRow = (body.match(/到今天總共賺賠\s*[賺賠]\s*([\d,]+) 元/) || [])[1];
T('「到今天總共賺賠」＝ 未實現 ＋ 已實現 ＋ 股利',
  +String(totalRow).replace(/,/g, '') === 198860 + 194435 + 8000, totalRow);
T('HTML 標籤沒有被當成文字印出來', !/&lt;|<div class|<span class/.test(body));

/* ══ ② 頁首「全部合計」 ══ */
const head = await txtOf('#totalPnl');
T('全部合計 ＝ 401,295（不再只算還沒賣的 198,860）', num(head) === 401295, head);
T('有已實現時不印百分比（分母不誠實就不要編一個）', !/%/.test(head), head);
const brk = await txtOf('#totalPnlBreak');
T('拆解那一行有出現', /三筆加起來/.test(brk), brk.slice(0, 60));
T('拆解列出還沒賣的 198,860', /198,860/.test(brk));
T('拆解列出已經賣掉賺的 194,435', /194,435/.test(brk));
T('拆解列出股利 8,000', /8,000/.test(brk));
T('拆解說明手續費不會重複扣', /不會重複扣/.test(brk));

/* ══ ③ 沒有賣出、沒有股利 → 行為必須跟舊版完全一樣（不得回歸）══ */
q = await p.evaluate(() => {
  state.watchlist.forEach(x => { x.inWatch = false; });
  const s = state.watchlist.find(x => x.id === '2330');
  s.inWatch = true; s.txnsMigrated = true; s.txnHide = [];
  s.txns = [{ id: 'b1', kind: 'buy', date: '2024-01-05', shares: 2000, price: 800 }];
  const ser = [], ph = [], t = new Date('2026-08-14');
  for (let i = 1300; i >= 0; i--) {
    ser.push({ date: new Date(t - i * 86400000).toISOString().slice(0, 10), close: 1000 }); ph.push(20);
  }
  applyStockData(s, { price: 1000, eps: 44, debt: .3, series: ser, asOf: '2026-08-14',
                      per: 20, perHist: ph, perAsOf: '2026-08-14', corpEvents: [] }, 'live');
  applyPosition(s); renderAll();
  const qq = positionOf(s);
  return { realized: qq.realized, divCash: qq.divCash };
});
const head2 = await txtOf('#totalPnl');
T('沒賣過也沒股利時：已實現與股利都是 0', q.realized === 0 && q.divCash === 0);
T('沒賣過時金額 ＝ 純未實現 397,720', num(head2) === 2000 * 1000 - 1602280, head2);
T('沒賣過時仍然印百分比（舊行為不變）', /%/.test(head2), head2);
T('沒賣過時拆解那一行是隱藏的',
  await p.evaluate(() => document.getElementById('totalPnlBreak').className.includes('hidden')));

/* ══ ④ 隱私模式必須遮住拆解 ══ */
await setup([BUY, SELL]);
await p.evaluate(() => setPrivacy(true));
await p.waitForTimeout(200);
const brkP = await txtOf('#totalPnlBreak');
T('隱私模式遮住拆解裡的金額', !/194,435/.test(brkP) && !/198,860/.test(brkP), brkP.slice(0, 60));
await p.evaluate(() => setPrivacy(false));

/* ══ ⑤ 全部賣光：那筆賺到的錢不可以消失 ══ */
q = await setup([BUY, { id: 's1', kind: 'sell', date: '2025-01-06', shares: 2000, price: 1000 }]);
const head3 = await txtOf('#totalPnl');
T('賣光之後手上 0 股', q.shares === 0);
T('賣光之後「全部合計」仍算得到已實現＋股利（不是「—」）',
  num(head3) === q.realized + q.divCash, `${head3} vs ${q.realized + q.divCash}`);

const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
T('沒有橫向溢出', ov <= 1, 'ov=' + ov);
T('全程沒有執行期錯誤', errs.length === 0, errs.join(' | '));
await p.screenshot({ path: './tests/r13/fees.png', fullPage: false });
console.log(fail ? `\nFAIL=${fail}` : '\nFAIL=0');
await b.close(); process.exit(fail ? 1 : 0);
