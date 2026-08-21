import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let fail=0; const T=(n,ok,x='')=>{if(!ok)fail++;console.log((ok?'  ok  ':'!!FAIL')+'  '+n+(x?'   '+x:''));};
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(2400);
await p.evaluate(()=>{try{closeModal()}catch(e){}});

// 頁首只留三樣
const hdr = await p.evaluate(()=>{
  const h=document.querySelector('header');
  /* 觸控目標的判準是「使用者點得到嗎」。
     opacity:0 或 pointer-events:none 的元素點不到，不該算進來——
     例如被 label 包住、視覺上完全隱藏的原生 checkbox（真正的觸控目標是那個 label）。 */
  const vis=el=>{const s=getComputedStyle(el),b=el.getBoundingClientRect();
    return s.display!=='none'&&s.visibility!=='hidden'&&+s.opacity>0&&s.pointerEvents!=='none'&&b.width>0&&b.height>0;};
  const btns=[...h.querySelectorAll('button')].filter(vis).map(x=>x.textContent.trim().slice(0,10));
  return {btns, h:Math.round(h.getBoundingClientRect().height)};});
T('設定預設是收起來的', !hdr.btns.includes('登出／清除') && !hdr.btns.includes('連線診斷'), JSON.stringify(hdr.btns));
T('頁首有「設定」', hdr.btns.includes('設定'), JSON.stringify(hdr.btns));
T('頁首有字級三顆', ['小','中','大'].every(x=>hdr.btns.includes(x)), JSON.stringify(hdr.btns));
console.log(`     （頁首高 ${hdr.h}px）`);

// 展開設定
await p.click('#settingsBtn'); await p.waitForTimeout(500);
const open1 = await p.evaluate(()=>{
  /* 觸控目標的判準是「使用者點得到嗎」。
     opacity:0 或 pointer-events:none 的元素點不到，不該算進來——
     例如被 label 包住、視覺上完全隱藏的原生 checkbox（真正的觸控目標是那個 label）。 */
  const vis=el=>{const s=getComputedStyle(el),b=el.getBoundingClientRect();
    return s.display!=='none'&&s.visibility!=='hidden'&&+s.opacity>0&&s.pointerEvents!=='none'&&b.width>0&&b.height>0;};
  return {btns:[...document.querySelector('header').querySelectorAll('button')].filter(vis).map(x=>x.textContent.trim().slice(0,8)),
          label:document.getElementById('settingsBtn').textContent.trim(),
          token:!!document.getElementById('tokenInput') && vis(document.getElementById('tokenInput'))};});
T('展開後七個功能都在', ['使用說明','資料儲存','隱私模式','連線診斷','登出／清除'].every(x=>open1.btns.some(y=>y.startsWith(x.slice(0,4)))), JSON.stringify(open1.btns));
T('展開後 Token 欄位看得到', open1.token);
T('按鈕文字會變「收起設定」', /收起/.test(open1.label), open1.label);
await p.click('#settingsBtn'); await p.waitForTimeout(400);
T('可以再收起來', await p.evaluate(()=>document.getElementById('settingsPanel').classList.contains('hidden')));

// 顏色收斂：計算頁首＋首屏可見按鈕的背景色種類
/* 動作按鈕與狀態晶片是兩個不同的類別，分開數。
   重點不是「顏色越少越好」，是「同一類東西不得有兩種以上的樣子」。 */
/* 先把滑鼠移開——上一輪量到 rgba(71,85,105,.9) 其實是 .btn-ghost 的 hover，
   那不是第四種顏色，是同一顆按鈕的另一個狀態。 */
await p.mouse.move(5,5); await p.waitForTimeout(200);
const colors = await p.evaluate(()=>{
  /* 觸控目標的判準是「使用者點得到嗎」。
     opacity:0 或 pointer-events:none 的元素點不到，不該算進來——
     例如被 label 包住、視覺上完全隱藏的原生 checkbox（真正的觸控目標是那個 label）。 */
  const vis=el=>{const s=getComputedStyle(el),b=el.getBoundingClientRect();
    return s.display!=='none'&&s.visibility!=='hidden'&&+s.opacity>0&&s.pointerEvents!=='none'&&b.width>0&&b.height>0;};
  const act=new Set(), chip=new Set(), seg=new Set();
  for(const el of document.querySelectorAll('header button, #myPnl button, #wlBody button')){
    if(!vis(el))continue;
    const bg=getComputedStyle(el).backgroundColor;
    if(el.classList.contains('chip')) chip.add(bg);
    else if(el.classList.contains('fs-btn')) seg.add(bg);   // 分段選擇器：選中/未選中，本來就兩種
    else act.add(bg);}
  return {act:[...act], chip:[...chip], seg:[...seg]};});
console.log(`     （字級分段選擇器 ${colors.seg.length} 種：${colors.seg.join(' ')}）`);
T('動作按鈕的底色 ≤3 種（主要／次要／危險）', colors.act.length<=3, colors.act.join(' | '));
T('狀態晶片的底色 ≤3 種（正常／注意／壞掉）', colors.chip.length<=3, colors.chip.join(' | '));

// 區塊名稱
const body = await p.evaluate(()=>document.body.innerText);
T('畫面上沒有「區塊 A／B／D」這種代號', !/區塊\s*[ABDE]\s*·/.test(body), (body.match(/區塊\s*[A-E]\s*·[^\n]{0,14}/)||[])[0]||'');
T('大盤改成白話', /大盤現在怎麼樣/.test(body));
T('資產配置改成白話', /每一檔佔你多少/.test(body));
T('心理快篩改成白話', /問自己三個問題/.test(body));

// 觸控與溢出
const ui = await p.evaluate(()=>{
  /* 觸控目標的判準是「使用者點得到嗎」：opacity:0 或 pointer-events:none 點不到，不算。
     例如被 label 包住、視覺上完全隱藏的原生 checkbox——真正的觸控目標是那個 label。 */
  const vis=el=>{const s=getComputedStyle(el),b=el.getBoundingClientRect();
    return s.display!=='none'&&s.visibility!=='hidden'&&+s.opacity>0&&s.pointerEvents!=='none'&&b.width>0&&b.height>0;};
  let small=[];
  for(const el of document.querySelectorAll('a,button,[role="button"],input,select,textarea')){
    if(!vis(el))continue;const b=el.getBoundingClientRect();
    if(b.width<44||b.height<44) small.push(`${el.tagName}#${el.id||''} ${Math.round(b.width)}x${Math.round(b.height)}`);}
  return {small, ov:document.documentElement.scrollWidth-document.documentElement.clientWidth};});
T('無過小觸控目標', ui.small.length===0, JSON.stringify(ui.small.slice(0,4)));
T('無橫向溢出', ui.ov<=1, 'ov='+ui.ov);
/* v70：版本標記必須真的被填進去，而且看得見。
   起因：改好的東西沒部署，畫面上看不出手上這份是哪一版，兩邊各講各的。
   守門要同時擋住「佔位符沒被替換」與「標記被藏起來」兩種失效。 */
const bt = await p.evaluate(()=>{
  const el=document.getElementById('buildTag');
  return el ? {t:el.textContent.trim(), vis: el.checkVisibility? el.checkVisibility():true} : null;});
T('畫面上有版本標記', !!bt && bt.vis, bt && bt.t);
T('版本標記已被建置流程填入（不是佔位符）', bt && !/@@/.test(bt.t) && /^v\d+ · \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(bt.t), bt && bt.t);

/* v69：畫面上不得出現被跳脫的 HTML 標籤。
   實際發生過：權息同日那段訊息裡寫了 <strong>，而它的兩個消費端都會經過 esc()，
   於是使用者看到「結果是：<strong>股數偏低…</strong>」。
   這是「同一段字在 N 個地方被不同方式處理」的老毛病，用掃全頁文字來守。 */
const leaked = await p.evaluate(()=>{
  const t = document.body.innerText;
  const hits = t.match(/<\/?(strong|em|b|div|span|br|p|code)\b[^>]*>/gi) || [];
  return [...new Set(hits)].slice(0,5);
});
T('畫面文字沒有印出 HTML 標籤', leaked.length===0, leaked.join(' '));

T('無執行期錯誤', errs.length===0, errs[0]||'');
console.log(fail?`\n❌ ${fail} 項失敗`:'\n✅ 全部通過');
await b.close(); process.exit(fail?1:0);
