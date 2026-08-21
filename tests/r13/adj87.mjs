/* v87：#3 除息日晚於序列最後一天的重複計算；#8 同日除息＋減資被丟掉一筆。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await (await b.newContext()).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2300);

/* ── #3：除息日 > 收盤價序列最後一天 ── */
const r3 = await p.evaluate(()=>{
  const mk = lastDate => {
    const ser=[]; const t=Date.parse(lastDate+'T00:00:00Z');
    for(let k=400;k>=0;k--) ser.push({date:new Date(t-k*86400000).toISOString().slice(0,10), close:1000});
    const s={id:'2330',name:'台積電',ind:'半導體業',type:'top100',inWatch:true,cost:0,shares:0,
      txns:[{id:'b',kind:'buy',date:'2024-01-05',shares:2000,price:800}], txnHide:[], txnsMigrated:true,
      data:{ price:1000, series:ser, asOf:lastDate,
             corpEvents:[{date:'2026-08-17',kind:'div',type:'息',amt:4.5,before:1000,after:995.5}] }};
    const q=positionOf(s);
    return { divCash:Math.round(q.divCash), total:Math.round(q.shares*1000 - q.cost + q.realized + q.divCash) };
  };
  return { 序列到0816: mk('2026-08-16'), 序列到0818: mk('2026-08-18') };
});
console.log('  ', JSON.stringify(r3));
T('收盤價還沒公布時，那筆股利不會先被算進去（避免重複）',
  r3.序列到0816.divCash===0, String(r3.序列到0816.divCash));
T('收盤價出來之後，股利照常算', r3.序列到0818.divCash===9000, String(r3.序列到0818.divCash));
T('兩種情況的總損益不會差一整筆股利',
  Math.abs(r3.序列到0816.total - (r3.序列到0818.total - 9000)) < 2,
  `${r3.序列到0816.total} vs ${r3.序列到0818.total-9000}`);

/* ── #8：同日除息 ＋ 減資 ── */
const r8 = await p.evaluate(()=>{
  const mkSer = ()=>{ const ser=[]; const t=Date.parse('2026-08-18T00:00:00Z');
    for(let k=400;k>=0;k--) ser.push({date:new Date(t-k*86400000).toISOString().slice(0,10), close:100});
    return ser; };
  const ev = [{date:'2026-03-02',kind:'div',type:'息',amt:4,before:100,after:96},
              {date:'2026-03-02',kind:'cut',before:100,after:200,reason:'彌補虧損'}];
  const a = adjustSeries(mkSer(), ev);
  const bRev = adjustSeries(mkSer(), ev.slice().reverse());
  const dupOnly = adjustSeries(mkSer(), [
    {date:'2026-03-02',kind:'div',type:'息',amt:4,before:100,after:96},
    {date:'2026-03-02',kind:'div',type:'息',amt:4,before:100,after:96}]);
  const f = x => +(x.series ? x.series[0].close : x[0].close).toFixed(2);
  return { 正序:f(a), 反序:f(bRev), 重複回報:f(dupOnly) };
});
console.log('  ', JSON.stringify(r8));
T('同日除息＋減資：兩筆都套用（100 × 0.96 × 2 ＝ 192）', Math.abs(r8.正序-192)<0.5, String(r8.正序));
T('結果不受輸入順序影響', Math.abs(r8.正序-r8.反序)<0.01, `${r8.正序} vs ${r8.反序}`);
T('同一個事件被回報兩次時仍然只算一次（96，不是 92.16）',
  Math.abs(r8.重複回報-96)<0.5, String(r8.重複回報));

T('全程沒有執行期錯誤', errs.length===0, errs.join(' | '));
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
