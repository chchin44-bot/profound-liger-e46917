/* 交易帳本的不變量。這是錢的算術，所以先測再接 UI。
   每一條都附「壞掉的話使用者會看到什麼」。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport:{width:900,height:900} });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+process.cwd()+'/index.html');
await p.waitForTimeout(2000);
await p.evaluate(()=>{ try{closeModal();}catch(e){} try{closeBig();}catch(e){} });

let fail=0;
const T=(name, ok, extra='')=>{ if(!ok) fail++; console.log((ok?'PASS  ':'!!FAIL')+'  '+name+(extra?'  '+extra:'')); };

const pos = (txns, id='2330', corpEvents=null) => p.evaluate(([txns,id,ce])=>{
  const s = { id, shares:0, cost:0, txns, data: ce ? {corpEvents:ce} : {} };
  const r = positionOf(s);
  return { shares:r.shares, cost:+r.cost.toFixed(4), avgCost:+r.avgCost.toFixed(6),
           realized:+r.realized.toFixed(4), divCash:+r.divCash.toFixed(4),
           feePaid:r.feePaid, taxPaid:r.taxPaid, problems:r.problems.map(x=>x.msg), unresolved:r.unresolved };
}, [txns,id,corpEvents]);

// L1 單筆買進：成本 = 股數×價格 + 手續費
{ const r = await pos([{kind:'buy',date:'2024-01-05',shares:2000,price:600}]);
  const want = 2000*600 + Math.max(20, Math.round(2000*600*0.001425));
  T('L1 單筆買進成本含手續費', r.shares===2000 && r.cost===want, `cost=${r.cost} want=${want}`); }

// L2 加權平均：兩筆不同價格
{ const r = await pos([{kind:'buy',date:'2024-01-05',shares:1000,price:500,fee:0},
                       {kind:'buy',date:'2024-06-05',shares:1000,price:700,fee:0}]);
  T('L2 兩筆買進的平均成本 = 600', r.shares===2000 && Math.abs(r.avgCost-600)<1e-9, `avg=${r.avgCost}`); }

// L3 賣一半：股數減半、成本總額減半、平均成本不變
{ const r = await pos([{kind:'buy',date:'2024-01-05',shares:2000,price:600,fee:0},
                       {kind:'sell',date:'2025-01-05',shares:1000,price:800,fee:0,tax:0}]);
  T('L3 賣一半後平均成本不變', r.shares===1000 && Math.abs(r.avgCost-600)<1e-9, `avg=${r.avgCost}`);
  T('L3 已實現損益 = (800-600)*1000', Math.abs(r.realized-200000)<1e-6, `realized=${r.realized}`); }

// L4 賣光：股數與成本都歸零（不得留下殘值）
{ const r = await pos([{kind:'buy',date:'2024-01-05',shares:2000,price:600,fee:0},
                       {kind:'sell',date:'2025-01-05',shares:2000,price:800,fee:0,tax:0}]);
  T('L4 賣光後股數與成本都是 0', r.shares===0 && Math.abs(r.cost)<1e-6, JSON.stringify(r)); }

// L5 賣超過持有：必須出現 problem，且股數不得為負
{ const r = await pos([{kind:'buy',date:'2024-01-05',shares:1000,price:600,fee:0},
                       {kind:'sell',date:'2025-01-05',shares:3000,price:800,fee:0,tax:0}]);
  T('L5 賣超過持有會出現警告', r.problems.length>0, r.problems[0]||'（沒有警告）');
  T('L5 股數不得為負', r.shares===0, `shares=${r.shares}`); }

// L6 配股：股數增加、成本總額不變、平均成本下降
{ const r = await pos([{kind:'buy',date:'2024-01-05',shares:1000,price:600,fee:0},
                       {kind:'stkdiv',date:'2024-07-15',ratio:1.1}]);
  T('L6 配股後成本總額不變', Math.abs(r.cost-600000)<1e-6, `cost=${r.cost}`);
  T('L6 配股後股數 ×1.1', Math.abs(r.shares-1100)<1e-9, `shares=${r.shares}`);
  T('L6 配股後平均成本下降', r.avgCost < 600, `avg=${r.avgCost}`); }

// L7 現金股利：不改變成本與股數，單獨累計
{ const r = await pos([{kind:'buy',date:'2024-01-05',shares:1000,price:600,fee:0},
                       {kind:'div',date:'2024-07-15',price:4.5}]);
  T('L7 配息不動成本與股數', r.shares===1000 && Math.abs(r.cost-600000)<1e-6, JSON.stringify(r));
  T('L7 領到的現金 = 1000×4.5', Math.abs(r.divCash-4500)<1e-9, `div=${r.divCash}`); }

// L8 減資（彌補虧損，無退款）：股數減少、成本不變 → 平均成本上升
{ const r = await pos([{kind:'buy',date:'2024-01-05',shares:1000,price:600,fee:0},
                       {kind:'reduce',date:'2024-09-01',ratio:0.4}]);
  T('L8 減資後股數 ×0.4', Math.abs(r.shares-400)<1e-9, `shares=${r.shares}`);
  T('L8 減資後成本總額不變', Math.abs(r.cost-600000)<1e-6, `cost=${r.cost}`);
  T('L8 減資後平均成本上升', r.avgCost > 600, `avg=${r.avgCost}`); }

// L9 順序無關性：同一組紀錄，輸入順序打亂，結果必須一致
{ const A=[{kind:'buy',date:'2024-01-05',shares:1000,price:500,fee:0},
           {kind:'stkdiv',date:'2024-07-15',ratio:1.1},
           {kind:'buy',date:'2025-01-05',shares:1000,price:700,fee:0},
           {kind:'sell',date:'2025-06-05',shares:500,price:800,fee:0,tax:0}];
  const r1 = await pos(A);
  const r2 = await pos([A[3],A[1],A[0],A[2]]);
  T('L9 輸入順序不影響結果', JSON.stringify(r1)===JSON.stringify(r2), JSON.stringify(r1)+' vs '+JSON.stringify(r2)); }

// L10 同一天：公司行為排在買賣之前
{ const r = await pos([{kind:'buy',date:'2024-01-05',shares:1000,price:600,fee:0},
                       {kind:'buy',date:'2024-07-15',shares:1000,price:600,fee:0},
                       {kind:'stkdiv',date:'2024-07-15',ratio:1.1}]);
  // 配股先算 → 1000×1.1=1100，再買 1000 → 2100
  T('L10 同日公司行為先於買賣', Math.abs(r.shares-2100)<1e-9, `shares=${r.shares}（若為 2200 代表順序反了）`); }

// L11 權息同日：不得猜，必須標成 unresolved
{ const ce=[{kind:'div',date:'2024-07-15',before:600,after:580,amt:20,type:'權息'}];
  const r = await pos([{kind:'buy',date:'2024-01-05',shares:1000,price:600,fee:0}], '2330', ce);
  T('L11 權息同日標成分不出來', r.unresolved===1, `unresolved=${r.unresolved}`);
  T('L11 權息同日不得偷偷改股數', r.shares===1000, `shares=${r.shares}`);
  T('L11 警告要說出後果', /偏低/.test(r.problems.join('')), r.problems.join('')); }

// L12 純息自動紀錄：從 corpEvents 推導
{ const ce=[{kind:'div',date:'2024-07-15',before:600,after:595.5,amt:4.5,type:'息'}];
  const r = await pos([{kind:'buy',date:'2024-01-05',shares:1000,price:600,fee:0}], '2330', ce);
  T('L12 純現金股利自動入帳', Math.abs(r.divCash-4500)<1e-9, `div=${r.divCash}`); }

// L13 未來的除權息不得入帳
{ const ce=[{kind:'div',date:'2099-07-15',before:600,after:595.5,amt:4.5,type:'息'}];
  const r = await pos([{kind:'buy',date:'2024-01-05',shares:1000,price:600,fee:0}], '2330', ce);
  T('L13 未來事件不入帳', r.divCash===0, `div=${r.divCash}`); }

// L14 買進之前的除權息不得算到你頭上
{ const ce=[{kind:'div',date:'2020-07-15',before:600,after:595.5,amt:4.5,type:'息'}];
  const r = await pos([{kind:'buy',date:'2024-01-05',shares:1000,price:600,fee:0}], '2330', ce);
  T('L14 買進之前的配息不算你的', r.divCash===0, `div=${r.divCash}`); }

// L15 ETF 證交稅 0.1%
{ const r1 = await pos([{kind:'buy',date:'2024-01-05',shares:1000,price:100,fee:0},
                        {kind:'sell',date:'2025-01-05',shares:1000,price:100,fee:0}], '0050');
  const r2 = await pos([{kind:'buy',date:'2024-01-05',shares:1000,price:100,fee:0},
                        {kind:'sell',date:'2025-01-05',shares:1000,price:100,fee:0}], '2330');
  T('L15 ETF 證交稅 0.1%', r1.taxPaid===100, `ETF tax=${r1.taxPaid}`);
  T('L15 一般股票 0.3%', r2.taxPaid===300, `tax=${r2.taxPaid}`); }

// L16 零股最低手續費 20 元
{ const r = await pos([{kind:'buy',date:'2024-01-05',shares:10,price:100}]);
  T('L16 零股小額走最低手續費 20 元', r.feePaid===20, `fee=${r.feePaid}`); }

// L17 舊存檔轉換：轉出來的部位必須跟舊欄位完全相同
{ const r = await p.evaluate(()=>{
    const s={id:'2330',cost:800,shares:2000,costAsOf:'2024-01-05',data:{}};
    migrateToTxns(s); normalizeTxnDates(s);
    const q=positionOf(s);
    return {shares:q.shares, avg:+q.avgCost.toFixed(6), n:s.txns.length};});
  T('L17 舊存檔轉換後股數相同', r.shares===2000, JSON.stringify(r));
  T('L17 舊存檔轉換後平均成本相同', Math.abs(r.avg-800)<1e-9, JSON.stringify(r)); }

// L18 沒有買進日期時，不得把任何公司行為套到他頭上
{ const r = await p.evaluate(()=>{
    const s={id:'2330',cost:800,shares:2000,costAsOf:null,
             data:{corpEvents:[{kind:'div',date:'2024-07-15',before:600,after:595.5,amt:4.5,type:'息'},
                               {kind:'cut', date:'2024-09-01',before:600,after:1500}]}};
    migrateToTxns(s); normalizeTxnDates(s);
    const q=positionOf(s);
    return {shares:q.shares, avg:+q.avgCost.toFixed(6), div:q.divCash};});
  T('L18 日期不詳時股數不被減資動到', r.shares===2000, JSON.stringify(r));
  T('L18 日期不詳時不亂算配息', r.div===0, JSON.stringify(r)); }

// L19 空帳本
{ const r = await pos([]);
  T('L19 空帳本回傳 0 而不是 NaN', r.shares===0 && r.cost===0 && r.avgCost===0 && !isNaN(r.avgCost), JSON.stringify(r)); }

// L20 髒資料不得產生 NaN
{ const r = await pos([{kind:'buy',date:'2024-01-05',shares:'abc',price:null},
                       {kind:'buy',date:'2024-02-05',shares:1000,price:600,fee:0},
                       {kind:'sell',date:'2024-03-05',shares:-5,price:700}]);
  T('L20 髒資料不產生 NaN', !isNaN(r.shares)&&!isNaN(r.cost)&&!isNaN(r.avgCost)&&!isNaN(r.realized), JSON.stringify(r));
  T('L20 髒資料會被記成問題', r.problems.length>=2, r.problems.join(' | ')); }

console.log('\nPAGE ERRORS:', errs.length?errs:'none');
console.log(fail?`\n❌ ${fail} 項失敗`:'\n✅ 全部通過');
await b.close();
process.exit(fail?1:0);
