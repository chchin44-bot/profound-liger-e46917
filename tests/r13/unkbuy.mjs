/* v87：日期不詳的買進不可以把後面的賣出吞掉。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await (await b.newContext({viewport:{width:390,height:900}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2300);
await p.evaluate(()=>{try{closeAllModals()}catch(e){}});

const q = (txns, corp) => p.evaluate(([txns,corp])=>{
  const s={id:'2330',name:'台積電',ind:'半導體業',type:'top100',inWatch:true,cost:0,shares:0,
           txns, txnHide:[], txnsMigrated:true, data:{corpEvents:corp||[], price:1000}};
  const r=positionOf(s);
  return { shares:+r.shares.toFixed(2), cost:Math.round(r.cost), realized:Math.round(r.realized),
           divCash:Math.round(r.divCash), fee:Math.round(r.feePaid), tax:Math.round(r.taxPaid),
           order:r.txns.map(t=>t.kind+'@'+(t.dateUnknown?'UNK':String(t.date||'').slice(0,10))),
           problems:r.problems.length, unknownBuy:!!r.unknownBuy };
}, [txns, corp]);

/* ① 日期不詳買進 ＋ 之後賣出 */
const a = await q([{id:'b',kind:'buy',dateUnknown:true,shares:1000,price:800},
                   {id:'s',kind:'sell',date:'2025-06-01',shares:500,price:1000}]);
console.log('  ', JSON.stringify(a));
T('排序：日期不詳的買進排在賣出前面', a.order[0].startsWith('buy@UNK'), JSON.stringify(a.order));
T('賣出有被算到（手上剩 500 股，不是 1000）', a.shares===500, String(a.shares));
T('已實現損益不是 0', a.realized>0, String(a.realized));
T('證交稅有算（1000×500×0.3%＝1500）', a.tax===1500, String(a.tax));
T("手續費有算（買 1140 ＋ 賣 713）", a.fee===1140+713, String(a.fee));
const truth = 500000 - 712 - 1500 - (801140/1000*500);
T('已實現金額正確', Math.abs(a.realized - Math.round(truth))<=1, `${a.realized} vs ${Math.round(truth)}`);

/* ② 日期不詳時，官方除權息一律不套用（不然會高估好幾倍） */
const c = await q([{id:'b',kind:'buy',dateUnknown:true,shares:1000,price:800}],
  [{date:'2022-06-13',kind:'div',type:'息',amt:11},{date:'2023-06-13',kind:'div',type:'息',amt:11},
   {date:'2024-06-13',kind:'div',type:'息',amt:11},{date:'2025-06-13',kind:'div',type:'息',amt:11}]);
console.log('  ', JSON.stringify(c));
T('日期不詳時不套用自動除權息（不會把五年股利都算給他）', c.divCash===0, String(c.divCash));
T('unknownBuy 旗標有立起來', c.unknownBuy===true);

/* ③ 有明確日期時，除權息照常套用 */
const d = await q([{id:'b',kind:'buy',date:'2024-01-05',shares:1000,price:800}],
  [{date:'2022-06-13',kind:'div',type:'息',amt:11},{date:'2025-06-13',kind:'div',type:'息',amt:11}]);
console.log('  ', JSON.stringify(d));
T('有日期時只算買進之後的那次股利（11×1000＝11,000）', d.divCash===11000, String(d.divCash));
T('買進之前的那次不算', d.divCash!==22000);

/* ④ 混合：一筆有日期、一筆沒日期 → 保守，不套用 */
const e = await q([{id:'b1',kind:'buy',date:'2024-01-05',shares:1000,price:800},
                   {id:'b2',kind:'buy',dateUnknown:true,shares:1000,price:700},
                   {id:'s',kind:'sell',date:'2025-06-01',shares:1500,price:1000}],
  [{date:'2025-01-10',kind:'div',type:'息',amt:11}]);
console.log('  ', JSON.stringify(e));
T('混合時賣出仍然算得到（剩 500 股）', e.shares===500, String(e.shares));
T('混合時保守不套用自動除權息', e.divCash===0, String(e.divCash));

/* ⑤ 賣出的日期不詳 → 仍然排最後（不能讓它跑到買進前面） */
const f = await q([{id:'b',kind:'buy',date:'2024-01-05',shares:1000,price:800},
                   {id:'s',kind:'sell',dateUnknown:true,shares:400,price:1000}]);
T('日期不詳的賣出仍排在最後', f.order[f.order.length-1].startsWith('sell@UNK'), JSON.stringify(f.order));
T('日期不詳的賣出也算得到（剩 600 股）', f.shares===600, String(f.shares));

T('全程沒有執行期錯誤', errs.length===0, errs.join(' | '));
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
