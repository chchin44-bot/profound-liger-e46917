import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
const p = await ctx.newPage();
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2400);
await p.evaluate(()=>{try{closeModal()}catch(e){}});
await p.evaluate(()=>{
  state.demoMode=true; loadMarket();
  const mk=(id,price,cost,sh)=>{const s=state.watchlist.find(x=>x.id===id); if(!s)return;
    s.inWatch=true; s.txnsMigrated=true;
    s.txns=[{id:'a'+id,kind:'buy',date:'2021-06-15',shares:sh,price:cost}];
    const ser=[],pr=[]; const t=new Date('2026-08-14');
    for(let i=1300;i>=0;i--){const d=new Date(t-i*86400000);const px=+(price*(1+Math.sin(i/53)*0.2)).toFixed(2);
      ser.push({date:d.toISOString().slice(0,10),close:px});pr.push({date:d.toISOString().slice(0,10),per:+(px/(price/18)).toFixed(2)});}
    ser[ser.length-1].close=price;
    applyStockData(s,{price,eps:price/18,debt:0.35,holder:0.5,holderPrev:0.3,series:ser,asOf:'2026-08-14',
      per:18,pbr:2,divYield:3,perHist:pr.map(r=>r.per),perRows:pr,perAsOf:'2026-08-14'},'live');
    applyPosition(s);};
  mk('2330',1105,800,2000); mk('2308',388,420,1000); mk('2412',131,118,3000);
  state.myRule='跌的時候不賣，要賣先隔一個晚上。'; state.myRuleAt=todayISO();
  state.brokerName='王小姐'; state.brokerTel='02-2345-6789';
  state.selected='2330'; renderAll();});
await p.waitForTimeout(900);
const h = await p.evaluate(()=>document.documentElement.scrollHeight);
// 分段截圖
for(let i=0,y=0; y<h && i<6; i++, y+=800){
  await p.evaluate(v=>window.scrollTo(0,v), y);
  await p.waitForTimeout(350);
  await p.screenshot({path:`./tests/r13/look_${i}.png`});
}
console.log('全頁高', h, 'px =', (h/844).toFixed(1), '屏');
await b.close();
