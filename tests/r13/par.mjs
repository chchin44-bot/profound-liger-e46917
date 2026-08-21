/* v84：面額不再用猜的。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await (await b.newContext()).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2200);
await p.evaluate(()=>{try{closeAllModals()}catch(e){}});

const base = (over={}) => Object.assign({
  ind:'半導體業', id:'2330', price:100, per:20, perAsOf:'2026-08-14',
  series:[{date:'2026-08-14',close:100}], fcfTTM:1e10,
}, over);

const q = (d) => p.evaluate(d=>({ sh: sharesOutstanding(d), f: fcfYield(d),
                                  par: parNote(d).replace(/<[^>]+>/g,'') }), d);

/* ① 面額 10 元：股本 100 億 → 10 億股。官方路線要得到同一個答案。 */
let r = await q(base({ capStock:1e10, equity:5e10, pbr:2 }));   // shares = 5e10*2/100 = 1e9
console.log('   面額10：', JSON.stringify({sh:r.sh, par:r.par}));
T('面額 10 元：股數 10 億', r.sh.shares===1e9, r.sh.shares);
T('面額 10 元：走官方路線（不是假設）', r.sh.src==='official', r.sh.src);
T('面額 10 元：推算回來就是 10', r.sh.par===10, r.sh.par);
T('面額 10 元：說明講「就是常見的 10 元」', /就是常見的 10 元/.test(r.par), r.par);

/* ② 面額 1 元（KY 股與創新板真的有）：舊版會把股數算成 10 倍，每股數字全歪 */
r = await q(base({ capStock:1e10, equity:5e11, pbr:2 }));       // shares = 5e11*2/100 = 1e10
console.log('   面額1 ：', JSON.stringify({sh:r.sh, perShare:r.f&&r.f.perShare, par:r.par}));
T('面額 1 元：股數 100 億（不是用 ÷10 算出來的 10 億）', r.sh.shares===1e10, r.sh.shares);
T('面額 1 元：推算得出面額是 1', r.sh.par===1, r.sh.par);
T('面額 1 元：明說不是 10 元', /不是 10 元/.test(r.par), r.par);
T('面額 1 元：不再被擋掉，而是給出正確答案', r.f && !r.f.blocked, JSON.stringify(r.f&&{blocked:r.f.blocked}));
T('面額 1 元：每股現金流 ＝ 100 億 ÷ 100 億股 ＝ 1 元', r.f.perShare===1, r.f.perShare);
T('面額 1 元：舊算法（股本÷10）會算成 10 元，差 10 倍', 1e10/10 === 1e9 && r.sh.shares/1e9 === 10);

/* ③ 面額 5 元 */
r = await q(base({ capStock:1e10, equity:1e11, pbr:2 }));       // shares = 2e9 → par = 5
T('面額 5 元：推算得出 5', r.sh.par===5, r.sh.par);
T('面額 5 元：股數 20 億', r.sh.shares===2e9, r.sh.shares);

/* ④ 沒有官方 PBR → 才退回面額假設，而且要說出來 */
r = await q(base({ capStock:1e10, equity:5e10, pbr:null }));
console.log('   無PBR ：', JSON.stringify({sh:r.sh, par:r.par}));
T('沒有官方 PBR 時退回假設', r.sh.src==='assumed', r.sh.src);
T('退回假設時股數 ＝ 股本 ÷ 10', r.sh.shares===1e9, r.sh.shares);
T('退回假設時畫面明說是「假設」', /假設/.test(r.par), r.par);

/* ⑤ 數字兜不起來（推回來的面額荒謬）→ 擋掉，不給看起來很具體的錯數字 */
r = await q(base({ capStock:1e10, equity:1e6, pbr:2 }));        // shares=2e4 → par=500000
console.log('   兜不起來：', JSON.stringify(r.sh));
T('面額推回來荒謬時擋下來', r.sh.blocked===true, JSON.stringify(r.sh));
T('擋下來時說得出原因', /不合理/.test(r.sh.why||''), r.sh.why);
T('擋下來時 fcfYield 也不給數字', r.f && r.f.blocked===true && r.f.yield===undefined);
const line = await p.evaluate(d=>fcfLine(d), base({ capStock:1e10, equity:1e6, pbr:2 }));
T('畫面上不給百分比', !/%/.test(line), line.replace(/<[^>]+>/g,'').slice(0,70));

/* ⑥ 貼齊：推算值有雜訊（官方 PBR 用母公司權益，財報權益含非控制權益），
      台積電實測差 0.7%——必須貼回 10 元，不能因為 9.93 就宣稱面額是 9.93。 */
r = await q(base({ capStock:2.59323701e11, equity:6.474470981e12, pbr:9.66, price:2395,
                   series:[{date:'2026-08-14',close:2395}], per:27.76 }));
console.log('   台積電：', JSON.stringify({par:r.sh.par, raw:r.sh.rawPar, shares:r.sh.shares}));
T('推算值 9.93 會貼回 10 元', r.sh.par===10, `par=${r.sh.par} raw=${r.sh.rawPar}`);
T('原始推算值有留著，沒有假裝它是 10', r.sh.rawPar!==10 && r.sh.rawPar>9.5 && r.sh.rawPar<10, r.sh.rawPar);
T('貼齊之後股數改用 股本÷面額（定義上精確）', r.sh.shares===2.59323701e11/10, r.sh.shares);
T('說明講得出是「推算」不是「假設」', /推算/.test(r.sh.how) && !/假設/.test(r.sh.how), r.sh.how);

/* ⑦ 貼不上任何常見面額 → 不宣稱知道面額，改用推算股數本身 */
r = await q(base({ capStock:1e10, equity:1.7e11, pbr:2 }));   // shares=3.4e9 → par≈2.94，貼不上
console.log('   貼不上：', JSON.stringify({par:r.sh.par, raw:r.sh.rawPar}));
T('貼不上時 par 回 null（不亂認一個）', r.sh.par===null, JSON.stringify(r.sh.par));
T('貼不上時仍給得出股數（用官方推算值）', r.sh.shares>0 && !r.sh.blocked, r.sh.shares);
T('貼不上時畫面明說「對不上任何常見面額」', /對不上任何常見面額/.test(r.par), r.par);

/* ⑧ 完全沒有股本也沒有 PBR */
r = await q(base({ capStock:null, equity:null, pbr:null }));
T('什麼都沒有時回 null，不編造', r.sh===null, JSON.stringify(r.sh));
T('什麼都沒有時面額那句話留白', r.par==='', JSON.stringify(r.par));

T('全程沒有執行期錯誤', errs.length===0, errs.join(' | '));
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
