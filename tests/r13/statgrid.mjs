/* v88：「需要注意的事」三格卡片。金額沒有上限，數字不可以被切掉。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
const AMOUNTS = [ [9000,1150,640,'千萬級'], [1000,100,98,'千元級'], [50000,2000,1800,'億級'] ];
for(const [w,label] of [[390,'手機390'],[430,'手機430'],[1280,'桌機1280']]){
  for(const fs of ['sm','big']){
    for(const [sh,px,now,tag] of AMOUNTS){
      const p = await (await b.newContext({viewport:{width:w,height:900}})).newPage();
      await p.goto('http://localhost:8251/index.html'); await p.waitForTimeout(2200);
      const r = await p.evaluate(([sh,px,now,f])=>{
        try{closeAllModals()}catch(e){}
        ['2330','2308','2383'].forEach((id,i)=>{
          const s=state.watchlist.find(x=>x.id===id); s.inWatch=true;
          s.txns=[{id:'b'+i,kind:'buy',date:'2024-01-05',shares:sh,price:px},
                  {id:'s'+i,kind:'sell',date:'2025-06-01',shares:Math.round(sh/5),price:px*0.8}];
          s.txnsMigrated=true;
          const ser=[],ph=[],t=new Date('2026-08-18');
          for(let k=600;k>=0;k--){ser.push({date:new Date(t-k*86400000).toISOString().slice(0,10),close:now});ph.push(20);}
          applyStockData(s,{price:now,eps:5,debt:[0.65,0.72,0.30][i],series:ser,asOf:'2026-08-18',
            per:20,perHist:ph,perAsOf:'2026-08-18'},'live');
          applyPosition(s);
        });
        state.fontScale=f; applyFontScale(); renderAll();
        const grid=document.querySelector('.statgrid');
        const cards=[...grid.children];
        let worstX=0, worstY=0;
        cards.forEach(c=>{
          const cr=c.getBoundingClientRect();
          [...c.querySelectorAll('*')].forEach(k=>{
            const kr=k.getBoundingClientRect();
            worstX=Math.max(worstX, Math.round(kr.right-cr.right), Math.round(cr.left-kr.left),
                            k.scrollWidth-k.clientWidth);
            worstY=Math.max(worstY, Math.round(kr.bottom-cr.bottom));
          });
        });
        return { worstX, worstY, total:(document.getElementById('totalPnl')||{}).textContent.trim(),
                 pageOv: document.documentElement.scrollWidth-document.documentElement.clientWidth };
      }, [sh,px,now,fs]);
      T(`[${label}/${fs}/${tag}] 數字沒有被切掉`, r.worstX<=1, `溢出 ${r.worstX}px　${r.total}`);
      T(`[${label}/${fs}/${tag}] 內容沒有掉出格子底部`, r.worstY<=1, `${r.worstY}px`);
      T(`[${label}/${fs}/${tag}] 整頁沒有橫向捲軸`, r.pageOv<=1, `${r.pageOv}px`);
      await p.context().close();
    }
  }
}
console.log(fail?`\nFAIL=${fail}`:'\nFAIL=0');
await b.close(); process.exit(fail?1:0);
