import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await (await b.newContext({viewport:{width:390,height:844}, deviceScaleFactor:2})).newPage();
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2400);
await p.evaluate(()=>{try{closeModal()}catch(e){}});
await p.evaluate(()=>{
  const mk=(id,name,ind,price,cost,sh,per)=>{
    let s=state.watchlist.find(x=>x.id===id);
    if(!s){ s={id,name,ind,inWatch:true,txns:[],type:'stock'}; state.watchlist.push(s); }
    s.inWatch=true; s.name=name; s.ind=ind; s.txnsMigrated=true;
    s.txns=[{id:'t'+id,kind:'buy',date:'2023-05-11',shares:sh,price:cost}];
    const ser=[]; const t=new Date('2026-08-14');
    for(let i=400;i>=0;i--){const d=new Date(t-i*86400000);
      ser.push({date:d.toISOString().slice(0,10),close:+(price*(1+Math.sin(i/41)*0.09)).toFixed(2)});}
    ser[ser.length-1].close=price;
    applyStockData(s,{price,eps:+(price/per).toFixed(2),debt:.34,holder:0.4,holderPrev:0.31,series:ser,
      asOf:'2026-08-14',per,pbr:2.1,divYield:2.4,perHist:ser.map((_,i)=>+(per*(1+Math.sin(i/29)*0.22)).toFixed(2)),
      perAsOf:'2026-08-14'},'live');
    applyPosition(s);
  };
  mk('2330','台積電','半導體業',2395,1900,2000,27.76);
  mk('2412','中華電','通信網路業',135,142,5000,26.52);
  mk('2603','長榮','航運業',186,240,3000,8.4);
  state.selected='2330'; state.fontScale='mid'; applyFontScale(); renderAll();
});
await p.waitForTimeout(900);
const H = await p.evaluate(()=>document.documentElement.scrollHeight);
console.log(JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('main > section')]
  .map(x=>({t:(x.querySelector('h2')?.innerText||'').split('\n')[0], h:Math.round(x.getBoundingClientRect().height)}))),null,0));
console.log(JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('#wlBody tr')]
  .map(r=>Math.round(r.getBoundingClientRect().height)))));
for(let i=0;i<6;i++){
  await p.evaluate(y=>window.scrollTo(0,y), i*760);
  await p.waitForTimeout(400);
  await p.screenshot({path:`./tests/r13/ux_${i}.png`});
}
console.log('全頁高', H, '=', (H/844).toFixed(1), '屏');
await b.close();
