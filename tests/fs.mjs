import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for(const w of [320,360,390,768,1280]){
 for(const fs of ['sm','mid','big']){
  const c=await b.newContext({viewport:{width:w,height:844}});
  const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(450);
  await p.evaluate(()=>{try{closeModal()}catch(e){}});
  await p.evaluate(v=>{state.fontScale=v;applyFontScale();
    const mk=(id,price,cost,sh)=>{const s=state.watchlist.find(x=>x.id===id);if(!s)return;s.inWatch=true;s.cost=cost;s.shares=sh;
      const ser=[];for(let i=300;i>=0;i--){const d=new Date(new Date('2026-08-14')-i*86400000);
      ser.push({date:d.toISOString().slice(0,10),close:+(price*(1+Math.sin(i/17)*0.05)).toFixed(2)});}
      ser[ser.length-1].close=price;
      applyStockData(s,{price,eps:price/18,debt:0.35,holder:70,holderPrev:69,series:ser,asOf:'2026-08-14',
        per:18,pbr:4,divYield:2,perHist:Array.from({length:1200},(_,i)=>12+(i%40)/4),perAsOf:'2026-08-14'},'live');};
    mk('2330',1000,800,2000);mk('2308',400,500,1000);renderAll();},fs);
  await p.waitForTimeout(300);
  const o=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}));
  const ov=o.sw-o.cw;
  console.log(`${w}px fs=${fs} overflow=${ov} ${ov<=1?'PASS':'FAIL'}${errs.length?' ERR:'+errs[0]:''}`);
  await c.close();
 }
}
const c=await b.newContext({viewport:{width:390,height:844}});
const p=await c.newPage(); await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(500);
for(const fs of ['sm','big']){
  await p.evaluate(v=>{try{closeModal()}catch(e){};state.fontScale=v;applyFontScale();},fs);
  await p.waitForTimeout(200);
  const f=await p.evaluate(()=>{const c={};document.querySelectorAll('body *').forEach(e=>{
    if(!e.offsetParent&&e.tagName!=='BODY')return;const t=(e.textContent||'').trim();
    if(!t||e.children.length)return;const s=parseFloat(getComputedStyle(e).fontSize);
    c[s]=(c[s]||0)+1;});
    const tot=Object.values(c).reduce((a,b)=>a+b,0);
    const small=Object.entries(c).filter(([k])=>+k<14).reduce((a,[,v])=>a+v,0);
    return {dist:c, tot, smallPct:Math.round(small/tot*100)};});
  console.log(`fs=${fs} <14px 佔比 ${f.smallPct}%  分布:`, JSON.stringify(f.dist));
}
// 存檔往返
const rt=await p.evaluate(()=>{state.fontScale='big';applyFontScale();
  const s=JSON.parse(JSON.stringify(snapshot())); state.fontScale='sm';applyFontScale();
  applySnapshot(s,{trusted:true});
  return {fs:state.fontScale, attr:document.documentElement.getAttribute('data-fs')};});
console.log('字級存檔往返:', JSON.stringify(rt), rt.fs==='big'?'PASS':'FAIL');
await b.close();
