/* 目標價面板的標題，不可以指名一把這一檔其實沒在用的尺（v93g）。
   實測到的病灶：金融保險業 ＋ 完整 PBR 歷史，標題寫「本益比估值法（近 4 季累積 EPS 4.00 元）」，
   而隔一段的正文寫「本頁的長線位階是用股價淨值比判定的，兩種尺不能混用」。
   標題與正文相隔一行互相打臉，而高齡使用者相信的是大的那幾個字。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport:{ width:390, height:900 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('file:///mnt/user-data/working/index.html'); await p.waitForTimeout(1200);
await p.evaluate(()=>{ [...document.querySelectorAll('details.secfold')].forEach(d=>{ if(/三維度目標價/.test(d.textContent)) d.open = true; }); });

const run = (ind, pbrHist) => p.evaluate(([ind,pbrHist])=>{
  const ser=(px,n)=>{const a=[];for(let i=n;i>=0;i--){const d=new Date(new Date('2026-08-14')-i*86400000);
    a.push({date:d.toISOString().slice(0,10),close:px});}return a;};
  const s=state.watchlist[0]; s.ind=ind; s.inWatch=true;
  applyStockData(s,{price:60,eps:4,debt:.4,series:ser(60,320),asOf:'2026-08-14',per:15,pbr:3,
    pbrHist, perHist:Array.from({length:1200},(_,i)=>12+(i%20)/3), perAsOf:'2026-08-14',
    epsVals:[4,4.02,3.99,4.01]},'live');
  applyPosition(s); state.selected=s.id; renderAll();
  const txt=document.getElementById('targetPanel').innerText.replace(/\s+/g,' ');
  const i=txt.indexOf('🏛️');
  return { title: i<0 ? '' : txt.slice(i, i+120), blocked: s.data.targets.longBlocked || null, full:txt };
}, [ind,pbrHist]);

let fail=0,n=0; const T=(ok,m)=>{n++; if(ok) console.log('  ok   '+m); else {fail++; console.log('!!FAIL '+m);} };

const fin = await run('金融保險業', Array.from({length:1200},(_,i)=>0.6+(i%20)/60));
console.log('金融股標題：', fin.title.slice(0,60), '| blocked=', fin.blocked);
T(fin.blocked === 'finPBR', '金融股確實走到「不列 PE 長線目標價」這條路（前置條件成立）');
T(!/本益比估值法/.test(fin.title), '金融股的標題沒有自稱本益比估值法');
T(!/EPS/.test(fin.title), '金融股的標題沒有附一個跟結論無關的 EPS');
T(/這次的判定可信度/.test(fin.full), '金融股也看得到第四層的可信度／原因');

const gen = await run('半導體業', null);
console.log('一般股標題：', gen.title.slice(0,60), '| blocked=', gen.blocked);
T(!gen.blocked, '一般股沒有被擋（前置條件成立）');
T(/本益比估值法/.test(gen.title), '一般股的標題照舊講清楚用的是本益比');
T(/EPS/.test(gen.title), '一般股的標題照舊附上 EPS 口徑');

console.log('\n' + (fail ? 'FAIL='+fail+' / '+n : '全部通過（'+n+' 條）'));
console.log('pageerror: ' + (errs.length?errs.join(' | '):'none'));
await b.close(); process.exit(fail?1:0);
