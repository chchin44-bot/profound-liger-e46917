import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
for(const [w,h] of [[320,844],[360,780],[390,844],[430,932],[768,1024],[1280,900],[1920,1080]]){
 for(const fs of ['sm','big']){
  const c=await b.newContext({viewport:{width:w,height:h}}); const p=await c.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(1600);
  await p.evaluate(v=>{try{closeModal()}catch(e){} state.fontScale=v; applyFontScale();
    const s=state.watchlist.find(x=>x.id==='2330'); s.inWatch=true; s.txnsMigrated=true;
    s.txns=[{id:'a',kind:'buy',date:'2024-01-05',shares:2000,price:800}];
    const ser=[],pr=[]; const t=new Date('2026-08-14');
    for(let i=1300;i>=0;i--){const d=new Date(t-i*86400000);const px=+(1000*(1+Math.sin(i/53)*0.2)).toFixed(2);
      ser.push({date:d.toISOString().slice(0,10),close:px});pr.push({date:d.toISOString().slice(0,10),per:+(px/55).toFixed(2)});}
    ser[ser.length-1].close=1000;
    applyStockData(s,{price:1000,eps:55,debt:.3,holder:0.4,holderPrev:0.3,series:ser,asOf:'2026-08-14',
      per:18,perHist:pr.map(r=>r.per),perRows:pr,perAsOf:'2026-08-14'},'live');
    applyPosition(s); state.selected='2330'; renderAll();}, fs);
  await p.waitForTimeout(500);
  const r=await p.evaluate(()=>({ov:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    h:document.documentElement.scrollHeight}));
  T(`${w}x${h} fs=${fs} 無橫向溢出`, r.ov<=1, `ov=${r.ov} 高=${r.h}px`);
  if(errs.length) T(`${w}x${h} fs=${fs} 無錯誤`, false, errs[0]);
  await c.close();
 }
}
console.log(fail?`\n❌ ${fail} 項失敗`:'\n✅ 全部通過');
await b.close(); process.exit(fail?1:0);
