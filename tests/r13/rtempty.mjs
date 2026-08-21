/* 即時報價回「HTTP 200 / success / 空資料」時，不得講成錯誤。
   實機量到的就是這一種（2026-08-17 16:21，收盤後）。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await (await b.newContext({viewport:{width:390,height:844}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2400);
await p.evaluate(()=>{try{closeModal()}catch(e){}});

/* 1. 呼叫形式的順序：會通的那一個必須排第一 */
const order = await p.evaluate(()=>{
  const seen=[]; const of=window.fetch;
  window.fetch = (u,o)=>{ seen.push({u:String(u), hdr:!!(o&&o.headers)}); return Promise.reject(new TypeError('Load failed')); };
  state.token='TESTONLY'; state.live=true;
  return fetchSnapshot(['2330']).catch(()=>0).then(()=>{ window.fetch=of; return seen; });
});
T('第一個試的是「專屬端點 + ?token=」（實機唯一會通的形式）',
  order.length && /taiwan_stock_tick_snapshot/.test(order[0].u) && !order[0].hdr,
  order.map(x=>(x.hdr?'[標頭]':'[token]')+x.u.split('/api/v4/')[1].slice(0,40)).join(' | '));
T('單一檔案時 data_id 只送一檔（跟官方範例一樣）',
  /data_id=2330(&|$)/.test(order[0].u), order[0].u.split('?')[1]);

const many = await p.evaluate(()=>{
  const seen=[]; const of=window.fetch;
  window.fetch = (u)=>{ seen.push(String(u)); return Promise.reject(new TypeError('Load failed')); };
  return fetchSnapshot(['2330','2412','0056']).catch(()=>0).then(()=>{ window.fetch=of; return seen; });
});
T('多檔時不送逗號串（官方沒有這個形式）', !many.some(u=>/data_id=[^&]*%2C|data_id=[^&]*,/.test(u)),
  many[0].split('?')[1]);

/* 2. 200 + success + 空資料 → 不得繼續試、不得講成錯誤 */
const empty = await p.evaluate(()=>{
  const seen=[]; const of=window.fetch;
  window.fetch = (u)=>{ seen.push(String(u));
    return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({msg:'success', status:200, data:[]}) }); };
  return fetchSnapshot(['2330']).then(()=>({err:null,seen}), e=>({err:{kind:e.kind,message:e.message,detail:e.detail,trace:e.trace},seen}))
    .then(r=>{ window.fetch=of; return r; });
});
T('200＋空資料只打一次請求，不再試其他形式', empty.seen.length===1, `${empty.seen.length} 次`);
T('錯誤類別是 rtempty', empty.err && empty.err.kind==='rtempty', empty.err&&empty.err.kind);
T('訊息不說「失敗」也不說「錯誤」', empty.err && !/失敗|錯誤/.test(empty.err.message), empty.err&&empty.err.message);
T('紀錄裡看得到 success', empty.err && JSON.stringify(empty.err.trace).includes('success'));

/* 3. 彈窗要說「這一次其實是成功的」 */
const txt = await p.evaluate(err=>{ showRtEmptyModal(err); return document.getElementById('modalBody').innerText; }, empty.err);
T('彈窗明說這次是成功的', /這一次其實是成功的/.test(txt));
T('彈窗明說 Token 與會員資格沒問題', /會員資格/.test(txt) && /沒有問題/.test(txt));
T('彈窗不叫使用者去升級 sponsor', !/需要 sponsor 會員|去升級/.test(txt));
T('彈窗說明實際影響是「沒有」', /實際影響：沒有/.test(txt), txt.slice(-80).replace(/\n/g,' '));
await p.evaluate(()=>closeModal());

/* 4. 收盤時按鈕自己要講清楚 */
const btn = await p.evaluate(()=>{ updateRtButton(); const s=marketSession();
  return { open:s.open, label:s.label, txt:document.getElementById('rtBtn').textContent.trim(),
           title:document.getElementById('rtBtn').title }; });
if(!btn.open){
  T('收盤時按鈕標示現在的狀態', btn.txt.includes(btn.label), btn.txt);
  T('按鈕的說明講明盤中才有', /盤中/.test(btn.title), btn.title.slice(0,50));
} else {
  T('盤中時按鈕是乾淨的「更新即時報價」', btn.txt==='更新即時報價', btn.txt);
}

T('全程沒有執行期錯誤', errs.length===0, errs.join(' | '));
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
