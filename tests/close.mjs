/* 每一個彈窗都必須關得起來。
   v58 的教訓：目標價面板復原時留下一個未閉合的 /* 註解，吃掉了 closeBig 與 closeAllModals，
   結果「關閉」按鈕按了沒反應。node --check 通過、15 條不變量通過、100 組隨機情境通過，
   因為沒有任何一個測試按過「關閉」。使用者一開就撞到。
   這一支就是補那個洞：每個彈窗開起來、按每一顆關閉鍵、確認真的關掉。 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'PASS  ':'!!FAIL')+'  '+n+(x?'  '+x:''));};

for (const fs of ['sm','big']){
  const ctx = await b.newContext({ viewport:{width:390,height:844} });
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2200);
  await p.evaluate(v=>{ try{closeModal()}catch(e){} state.fontScale=v; applyFontScale(); }, fs);

  // 全域關閉函式必須存在（這是 v58 壞掉的地方）
  const g = await p.evaluate(()=>['closeModal','closeBig','closeGuide','closeAllModals']
    .map(n=>n+':'+typeof window[n]).join(' '));
  T(`${fs} 四個關閉函式都是全域函式`, !/undefined/.test(g), g);

  // 造資料，讓每個彈窗都開得起來
  await p.evaluate(()=>{
    const s=state.watchlist.find(x=>x.id==='2330'); s.inWatch=true; s.txnsMigrated=true;
    s.txns=[{id:'a',kind:'buy',date:'2024-01-05',shares:2000,price:800}];
    const ser=[],pr=[]; const t=new Date('2026-08-14');
    for(let i=1300;i>=0;i--){const d=new Date(t-i*86400000);
      const px=+(1000*(1+Math.sin(i/53)*0.2)).toFixed(2);
      ser.push({date:d.toISOString().slice(0,10),close:px}); pr.push({date:d.toISOString().slice(0,10),per:+(px/55).toFixed(2)});}
    ser[ser.length-1].close=1000;
    applyStockData(s,{price:1000,eps:55,debt:.3,holder:null,holderPrev:null,series:ser,
      asOf:'2026-08-14',per:18,perHist:pr.map(r=>r.per),perRows:pr,perAsOf:'2026-08-14'},'live');
    applyPosition(s); state.selected='2330'; renderAll();
  });
  await p.waitForTimeout(500);

  const isOpen = id => p.evaluate(i=>!document.getElementById(i).classList.contains('hidden'), id);

  // 目標價面板：按「關閉」
  for (const how of ['底部關閉鍵','右上關閉 ✕','點遮罩']){
    await p.evaluate(()=>{const b=document.querySelector('button[data-act="target"]'); if(b) b.click();});
    await p.waitForTimeout(600);
    T(`${fs} 目標價面板打得開（${how}）`, await isOpen('bigModal'));
    if(how==='底部關閉鍵')
      await p.evaluate(()=>{const bs=[...document.querySelectorAll('#bigModal button')];
        bs.filter(x=>x.textContent.trim()==='關閉').pop().click();});
    else if(how==='右上關閉 ✕')
      await p.evaluate(()=>{const bs=[...document.querySelectorAll('#bigModal button')];
        (bs.find(x=>/關閉 ✕/.test(x.textContent))||bs[0]).click();});
    else
      await p.evaluate(()=>document.getElementById('bigModal').click());
    await p.waitForTimeout(500);
    T(`${fs} 目標價面板關得掉（${how}）`, !(await isOpen('bigModal')));
  }

  // 交易紀錄頁
  await p.evaluate(()=>{const b=document.querySelector('button[data-act="txn"]'); if(b) b.click();});
  await p.waitForTimeout(600);
  T(`${fs} 交易紀錄頁打得開`, await isOpen('bigModal'));
  await p.evaluate(()=>{const bs=[...document.querySelectorAll('#bigModal button')];
    bs.filter(x=>x.textContent.trim()==='關閉').pop().click();});
  await p.waitForTimeout(500);
  T(`${fs} 交易紀錄頁關得掉`, !(await isOpen('bigModal')));

  // 資料儲存面板
  await p.evaluate(()=>{const b=document.getElementById('dataBtn'); if(b) b.click();});
  await p.waitForTimeout(600);
  if(await isOpen('bigModal')){
    await p.evaluate(()=>{const bs=[...document.querySelectorAll('#bigModal button')];
      bs.filter(x=>x.textContent.trim()==='關閉').pop().click();});
    await p.waitForTimeout(500);
    T(`${fs} 資料儲存面板關得掉`, !(await isOpen('bigModal')));
  }

  // 使用說明
  await p.evaluate(()=>{const b=document.getElementById('guideBtn'); if(b) b.click();});
  await p.waitForTimeout(600);
  if(await isOpen('guideModal')){
    await p.evaluate(()=>closeGuide());
    await p.waitForTimeout(400);
    T(`${fs} 使用說明關得掉`, !(await isOpen('guideModal')));
  }

  // Esc 要能關掉
  await p.evaluate(()=>{const b=document.querySelector('button[data-act="target"]'); if(b) b.click();});
  await p.waitForTimeout(500);
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  T(`${fs} Esc 關得掉彈窗`, !(await isOpen('bigModal')));

  // 關掉之後頁面必須可以捲動（不得殘留 modal-open）
  const scrollable = await p.evaluate(()=>!document.body.classList.contains('modal-open'));
  T(`${fs} 關閉後頁面恢復可捲動`, scrollable);

  if(errs.length) T(`${fs} 無 page error`, false, errs[0]);
  await ctx.close();
}
console.log(fail?`\n❌ ${fail} 項失敗`:'\n✅ 全部通過');
await b.close(); process.exit(fail?1:0);
