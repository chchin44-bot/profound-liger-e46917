/* 「好多視窗打開後關不掉」——把畫面上每一個會開視窗的東西點一遍，
   然後用使用者真的會用的三種方式試著關：右下角 ✕、視窗自己的關閉鈕、Esc。
   關不掉的就印出來。手機尺寸，因為問題是在手機上遇到的。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
let fail = 0;
const T = (n, ok, x = '') => { if (!ok) fail++; console.log((ok ? '  ok  ' : '!!FAIL') + '  ' + n + (x ? '   ' + x : '')); };

await p.goto('file://'+process.cwd()+'/index.html');
await p.waitForTimeout(2400);

/* 開著的遮罩有哪些 */
const openIds = () => p.evaluate(() => ['modal', 'bigModal', 'guideModal']
  .filter(id => { const e = document.getElementById(id); return e && !e.classList.contains('hidden'); }));

/* 右下角 ✕ 現在看不看得到、點不點得到 */
const floatState = () => p.evaluate(() => {
  const f = document.getElementById('floatClose');
  if (!f) return { exists: false };
  const r = f.getBoundingClientRect(), cs = getComputedStyle(f);
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const top = document.elementFromPoint(cx, cy);
  return {
    exists: true,
    /* 預設的 checkVisibility() 不看 visibility:hidden——syncModalOpen 正是用它藏 ✕ 的，
       不開 checkVisibilityCSS 會量到「看得見」然後點不到，測試自己前後矛盾。 */
    visible: f.checkVisibility ? f.checkVisibility({checkVisibilityCSS:true}) : cs.display !== 'none',
    w: Math.round(r.width), h: Math.round(r.height),
    inViewport: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1,
    /* 「看得到」不等於「點得到」：有東西蓋在上面一樣按不到 */
    hitsSelf: !!top && (top === f || f.contains(top)),
    blockedBy: top ? (top.id || top.className || top.tagName).toString().slice(0, 50) : null,
    z: cs.zIndex,
  };
});

/* 開視窗的入口：[說明, 呼叫的函式] */
const OPENERS = [
  ['使用說明', () => openGuide()],
  ['交易紀錄（大視窗）', () => { const s = state.watchlist.find(x => x.id === '2330'); s.inWatch = true; openTxnPage('2330'); }],
  ['確認類彈窗（刪除）', () => removeStock('2330')],
  ['清空持倉確認', () => { const el = document.querySelector('[data-conf]'); showModal({ icon: '🧹', title: '測試', body: '測試內容', actions: '<button onclick="closeModal()">取消</button>' }); }],
];

for (const [name, fn] of OPENERS) {
  await p.evaluate(() => closeAllModals());
  await p.waitForTimeout(150);
  try { await p.evaluate(f => eval('(' + f + ')()'), fn.toString()); }
  catch (e) { T(`${name}：打得開`, false, String(e).slice(0, 80)); continue; }
  await p.waitForTimeout(300);
  const opened = await openIds();
  T(`${name}：打得開`, opened.length > 0, opened.join(','));
  if (!opened.length) continue;

  const fs = await floatState();
  /* 防呆彈窗（#modal）開著時，syncModalOpen 會**故意**把右下角 ✕ 藏起來——
     「確定要刪除嗎」這種問題必須用視窗裡的按鈕回答，不能被一根拇指誤掃掉。
     所以這裡的期望值要跟著是哪一種視窗走，不能一律要求 ✕ 可按。 */
  const isConfirm = opened.includes('modal');
  if(isConfirm){
    T(`${name}：防呆彈窗開著時右下角 ✕ 故意藏起來`, fs.hitsSelf === false, '被擋：' + fs.blockedBy);
  }else{
    T(`${name}：右下角 ✕ 看得到`, fs.visible === true, JSON.stringify(fs));
    T(`${name}：右下角 ✕ 在畫面內`, fs.inViewport === true, `${fs.w}x${fs.h}`);
    T(`${name}：右下角 ✕ 點得到（沒有被蓋住）`, fs.hitsSelf === true, '被擋：' + fs.blockedBy);
    T(`${name}：右下角 ✕ 夠大（≥44px）`, fs.w >= 44 && fs.h >= 44, `${fs.w}x${fs.h}`);
  }

  /* ① 用右下角 ✕ 關 */
  if (fs.hitsSelf) {
    await p.click('#floatClose'); await p.waitForTimeout(300);
    T(`${name}：按右下角 ✕ 之後全部關掉`, (await openIds()).length === 0, (await openIds()).join(','));
  }

  /* ② 重開，用 Esc 關 */
  await p.evaluate(f => eval('(' + f + ')()'), fn.toString());
  await p.waitForTimeout(250);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  T(`${name}：按 Esc 之後全部關掉`, (await openIds()).length === 0, (await openIds()).join(','));

  /* ③ 重開，點視窗自己的「關閉」鈕 */
  await p.evaluate(f => eval('(' + f + ')()'), fn.toString());
  await p.waitForTimeout(250);
  const clicked = await p.evaluate(() => {
    const box = ['modal', 'bigModal', 'guideModal'].map(id => document.getElementById(id))
      .filter(e => e && !e.classList.contains('hidden')).pop();
    if (!box) return 'no-modal';
    const btn = [...box.querySelectorAll('button')]
      .find(x => /關閉|取消|✕|開始使用/.test(x.textContent));
    if (!btn) return 'no-button';
    btn.click(); return 'clicked:' + btn.textContent.trim().slice(0, 10);
  });
  await p.waitForTimeout(300);
  T(`${name}：視窗自己的關閉鈕有效`, (await openIds()).length === 0, clicked + ' → 仍開著:' + (await openIds()).join(','));
}

/* ══ 疊起來的情況：大視窗上面再開一個確認視窗 ══ */
await p.evaluate(() => closeAllModals()); await p.waitForTimeout(150);
await p.evaluate(() => {
  const s = state.watchlist.find(x => x.id === '2330'); s.inWatch = true; openTxnPage('2330');
  showModal({ icon: '⚠️', title: '疊在上面的確認視窗', body: '測試', actions: '<button onclick="closeModal()">取消</button>' });
});
await p.waitForTimeout(350);
T('兩個視窗同時開著（重現「好多視窗」）', (await openIds()).length === 2, (await openIds()).join(','));
const fs2 = await floatState();
/* 疊起來時最上面是防呆彈窗，✕ 一樣是故意藏的。
   要驗的不是「✕ 能不能關掉兩個」，而是「用彈窗自己的按鈕退掉之後，
   使用者不會被卡在下面那個大視窗裡」——那才是「關不掉」真正會發生的地方。 */
T('疊起來時右下角 ✕ 故意藏起來（防呆彈窗要用自己的按鈕回答）', fs2.hitsSelf === false, '被擋：' + fs2.blockedBy);
await p.evaluate(() => closeModal()); await p.waitForTimeout(350);
T('關掉上層彈窗後，下面的大視窗還在（沒有一起被關掉）', (await openIds()).join(',') === 'bigModal', (await openIds()).join(','));
const fs2b = await floatState();
T('這時右下角 ✕ 回來了', fs2b.hitsSelf === true, '被擋：' + fs2b.blockedBy);
await p.click('#floatClose'); await p.waitForTimeout(350);
T('再按 ✕ 就把大視窗也關掉（不會被卡住）', (await openIds()).length === 0, (await openIds()).join(','));

/* ══ 背景遮罩：點視窗外面的暗色區域會不會關？ ══ */
await p.evaluate(() => openGuide()); await p.waitForTimeout(300);
await p.mouse.click(5, 5);          // 左上角，一定在對話框外面
await p.waitForTimeout(300);
const afterBackdrop = await openIds();
console.log(`\n  [參考] 點視窗外面的暗色背景 → ${afterBackdrop.length ? '不會關（仍開著 ' + afterBackdrop.join(',') + '）' : '會關'}`);

/* ══ 滾到最下面時，✕ 還在不在 ══ */
await p.evaluate(() => closeAllModals()); await p.waitForTimeout(150);
await p.evaluate(() => openGuide()); await p.waitForTimeout(300);
await p.evaluate(() => { const g = document.getElementById('guideBody'); if (g) g.scrollTop = g.scrollHeight; });
await p.waitForTimeout(200);
const fs3 = await floatState();
T('視窗內容捲到最底時，右下角 ✕ 仍點得到', fs3.hitsSelf === true, '被擋：' + fs3.blockedBy);
await p.screenshot({ path: './tests/r13/closeall.png' });

T('全程沒有執行期錯誤', errs.length === 0, errs.join(' | '));
console.log(fail ? `\nFAIL=${fail}` : '\nFAIL=0');
await b.close(); process.exit(fail ? 1 : 0);
