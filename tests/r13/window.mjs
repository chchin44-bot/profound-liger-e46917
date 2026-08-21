import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await (await b.newContext({viewport:{width:390,height:844}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2200);
await p.evaluate(()=>{try{closeModal()}catch(e){}});
const r = await p.evaluate(()=>{
  const mk=(txns)=>({id:'2330',txns,txnsMigrated:true,data:{},cost:0,shares:0});
  const five = dstr(-1830);
  const out={five};
  // ① 2011 年買進 → 視窗要拉到 2011 之前
  let s = mk([{id:'a',kind:'buy',date:'2011-06-15',shares:2000,price:72}]);
  out.old = corpEventStart(s);
  // ② 今年買進 → 不得比 5 年還短
  s = mk([{id:'b',kind:'buy',date:todayISO(),shares:1000,price:100}]);
  out.recent = corpEventStart(s);
  // ③ 日期不詳 → 沿用 5 年
  s = mk([{id:'c',kind:'buy',date:'',dateUnknown:true,shares:1000,price:100}]);
  out.unknown = corpEventStart(s);
  // ④ 沒有帳本
  s = mk([]);
  out.empty = corpEventStart(s);
  // ⑤ 髒日期不得炸掉
  s = mk([{id:'d',kind:'buy',date:'not-a-date',shares:1000,price:100}]);
  out.dirty = corpEventStart(s);
  return out;});
T('2011 年買進 → 視窗拉到 2011-05-16', r.old==='2011-05-16', `old=${r.old}（5年基準=${r.five}）`);
T('今年買進 → 不得比 5 年短', r.recent===r.five, `recent=${r.recent}`);
T('日期不詳 → 沿用 5 年', r.unknown===r.five, `unknown=${r.unknown}`);
T('空帳本 → 沿用 5 年', r.empty===r.five, `empty=${r.empty}`);
T('髒日期不炸掉、退回 5 年', r.dirty===r.five, `dirty=${r.dirty}`);
// 快取保留筆數
const keep = await p.evaluate(()=>{
  const ev=[]; for(let y=2006;y<=2026;y++) for(const m of ['03','06','09','12'])
    ev.push({kind:'div',date:`${y}-${m}-15`,before:100,after:99,amt:1,type:'息'});
  /* 用真的自選標的，讓快取真的被寫進 snapshot——否則 cached 會是 null，
     測試就變成空跑。 */
  const s=state.watchlist.find(x=>x.id==='2330');
  s.inWatch=true; s.txnsMigrated=true;
  s.txns=[{id:'a',kind:'buy',date:'2006-01-05',shares:1000,price:50}];
  applyStockData(s,{price:100,eps:5,debt:.3,holder:null,holderPrev:null,
    series:[{date:'2026-08-14',close:100}],asOf:'2026-08-14',per:20,corpEvents:ev},'live');
  applyPosition(s);
  const snap=JSON.parse(JSON.stringify(snapshot()));
  const kept=s.data.corpEvents.length, oldest=s.data.corpEvents[0]&&s.data.corpEvents[0].date;
  /* sanitizeCache 只在**匯入**時跑，所以必須真的還原一次才測得到它。
     量匯出的那一份等於沒測到 —— 突變測試證明過。 */
  state.watchlist.forEach(x=>{x.data={};x.loaded=false;x.txns=null;x.txnsMigrated=false;});
  applySnapshot(snap,{trusted:true});
  const t=state.watchlist.find(x=>x.id==='2330');
  const rev=(t.data&&t.data.corpEvents)||null;
  return {kept, input:ev.length, oldest,
          cached:rev?rev.length:null,
          cachedNewest:rev?rev[rev.length-1].date:null};});
T('20 年的事件不會被截成 40 筆', keep.kept>=80, JSON.stringify(keep));
T('最舊的事件有留下來', keep.oldest && keep.oldest < '2010-01-01', 'oldest='+keep.oldest);
T('快取真的有寫進去（不是空跑）', keep.cached!==null, 'cached='+keep.cached);
T('快取留得住 20 年的事件', keep.cached>=80, 'cached='+keep.cached);
T('快取保留的是最新的那一端（不是丟掉最近幾年）', keep.cachedNewest && keep.cachedNewest>='2026-01-01', 'newest='+keep.cachedNewest);
T('無執行期錯誤', errs.length===0, errs[0]||'');
console.log(fail?`\n❌ ${fail} 項失敗`:'\n✅ 全部通過');
await b.close(); process.exit(fail?1:0);
