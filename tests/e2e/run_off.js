// E2E: one switch turns autofill off, and off means off. The bar at the top of the side panel (and
// the card's Automation row, the toolbar menu, Alt+Shift+O) sets it; the toolbar icon says OFF in
// red. Off: a run that is going is stopped; OptimHire's start requests are refused (the panel says
// why); a job page opened during an "engaged" run, with "Auto-fill on ATS pages" on, is not filled
// and shows no banner; OptimHire's on-page card / pop-ups are hidden while another extension's
// look-alike panel stays visible. On again: the same page fills.
const path=require('path'), https=require('https'), fs=require('fs');
const {chromium}=require(require('child_process').execSync('npm root -g').toString().trim()+'/playwright/index.js');
const EXT=process.argv[2];
let bad=0; const T0=Date.now(); const check=(c,m)=>{console.log((c?'PASS':'FAIL').padEnd(5),m,'['+Math.round((Date.now()-T0)/1000)+'s]'); if(!c)bad++;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const site=https.createServer({key:fs.readFileSync(path.join(__dirname,'oh_key.pem')),cert:fs.readFileSync(path.join(__dirname,'oh_cert.pem'))},(q,r)=>{
  r.writeHead(200,{'content-type':'text/html'}); r.end(fs.readFileSync(path.join(__dirname,'site','gh_phone.html')));});
(async()=>{
  await new Promise(r=>site.listen(443,r));
  const prof=path.join(__dirname,'profile_off'); fs.rmSync(prof,{recursive:true,force:true});
  const ctx=await chromium.launchPersistentContext(prof,{channel:'chromium',headless:true,ignoreHTTPSErrors:true,viewport:{width:420,height:900},
    args:[`--disable-extensions-except=${EXT}`,`--load-extension=${EXT}`,'--host-resolver-rules=MAP job-boards.greenhouse.io 127.0.0.1','--ignore-certificate-errors','--no-proxy-server']});
  let sw=ctx.serviceWorkers()[0]; if(!sw) sw=await ctx.waitForEvent('serviceworker'); const id=sw.url().split('/')[2];
  const qm=await ctx.newPage(); await qm.goto(`chrome-extension://${id}/tabs/jobQueue.html`); await sleep(1500);
  const set=o=>qm.evaluate(o=>new Promise(r=>chrome.storage.local.set(o,r)),o);
  const get=k=>qm.evaluate(k=>new Promise(r=>chrome.storage.local.get(k,d=>r(d[k]))),k);
  const badge=()=>sw.evaluate(async()=>({text:await chrome.action.getBadgeText({}),title:await chrome.action.getTitle({}),color:await chrome.action.getBadgeBackgroundColor({})}));
  const U='https://job-boards.greenhouse.io/striveworks/jobs/9';
  const engaged={ohAutoTrigger:true,ohAutoApplyEngaged:true,ohAutoApplyEngagedTs:Date.now(),candidateDetails:{first_name:'Maxmilliam',last_name:'Okafor'},
    ohMyPhone:'+353 87 123 4567',ohWdSeeker:{first_name:'Maxmilliam',last_name:'Okafor',email:'max@example.com',city:'Dublin',country:'Ireland'}};

  // 1. the bar at the top of the side panel
  const sp=await ctx.newPage(); await sp.goto(`chrome-extension://${id}/sidepanel.html`); await sleep(3000);
  const bar=()=>sp.evaluate(()=>{const b=document.getElementById('oh-autofill-bar'); if(!b) return null; const r=b.getBoundingClientRect();
    return {text:b.innerText.replace(/\s+/g,' '),cls:b.className,top:r.top,h:r.height,w:r.width,bg:getComputedStyle(b).backgroundColor,checked:b.getAttribute('aria-checked')};});
  let b=await bar();
  check(b&&b.top===0&&b.h>=40&&b.w>=400&&/Autofill ON/.test(b.text)&&b.cls==='on','side panel: a full-width bar at the very top — "Autofill ON" (green)');
  // a run is going when you switch off
  await set({isAutoProcessStartJob:true,autoApplyState:{isActive:true,applicationDetails:{copilot_job_id:'R1',source:{apply_now_url:U}}},ohJobQueueActive:true});
  await sp.click('#oh-autofill-bar'); await sleep(2500);
  b=await bar();
  check(await get('ohAutomationDisabled')===true&&/Autofill OFF/.test(b.text)&&b.cls==='off'&&b.checked==='false','one tap: "Autofill OFF" (red)');
  check(await get('isAutoProcessStartJob')===false&&!(await get('autoApplyState'))&&await get('ohJobQueueActive')===false,'…and the run that was going is stopped (OptimHire\'s own Stop), the CSV queue too');
  let bd=await badge();
  check(bd.text==='OFF'&&/Autofill is OFF/.test(bd.title)&&bd.color[0]>200&&bd.color[1]<60,`toolbar icon: red "OFF" (${bd.text}, rgb ${bd.color.slice(0,3)})`);
  await sleep(5500);
  check(await sp.evaluate(()=>document.getElementById('oh-qc-master')?.getAttribute('aria-checked'))==='false','the card\'s Automation row shows the same switch, off');

  // 2. OptimHire's start requests are refused while off; the panel says why
  const seen=[]; await qm.evaluate(()=>{window.__seen=[]; chrome.runtime.onMessage.addListener(m=>{window.__seen.push(m&&m.type);});});
  const ans=await qm.evaluate(()=>new Promise(r=>chrome.runtime.sendMessage({action:'START_JOB_APPLICATION_VIA_WEB',jobId:'J1'},x=>{void chrome.runtime.lastError; r(x);})));
  await sleep(2500);
  const s2=await qm.evaluate(()=>window.__seen);
  check(ans&&ans.disabled===true&&!s2.includes('STARTED_LOADING_SCREEN'),'"Start" while off: refused, no "Loading your Job"');
  check(/Turn autofill on first/.test((await bar()).text),'…the bar says to turn autofill on first');

  // 3. a job page while off — engaged, "Auto-fill on ATS pages" on — nothing fills, nothing shows
  await set(Object.assign({},engaged,{ohAutoApplyEngagedTs:Date.now()}));
  let P=await ctx.newPage(); await P.goto(U); await sleep(9000);
  let pg=await P.evaluate(()=>({first:document.getElementById('first_name').value,phone:document.getElementById('phone').value,banner:!!document.getElementById('oh-autofill-banner'),off:document.documentElement.hasAttribute('data-oh-autofill-off')}));
  check(pg.off&&!pg.first&&!pg.phone&&!pg.banner,`job page while off: nothing filled, no banner (${JSON.stringify(pg)})`);
  // OptimHire's on-page card (made in the extension's world) hidden; another extension's look-alike panel left alone
  const tabId=await sw.evaluate(async u=>(await chrome.tabs.query({url:u}))[0].id,U);
  await sw.evaluate(async tabId=>{ await chrome.scripting.executeScript({target:{tabId},func:()=>{
    const h=document.createElement('plasmo-csui'); h.id='oh-test-card'; const r=h.attachShadow({mode:'open'}); r.innerHTML='<div class="oh-card"><button class="oh-btn">Autofill Application</button></div>';
    document.body.appendChild(h); const d=document.createElement('div'); d.id='optimhire-apply-dialog'; d.textContent='OptimHire dialog'; document.body.appendChild(d); }}); },tabId);
  await P.evaluate(()=>{ const h=document.createElement('plasmo-csui'); h.id='other-ext-card'; h.attachShadow({mode:'open'}).innerHTML='<div>Other extension</div>'; document.body.appendChild(h); });
  const vis=()=>P.evaluate(()=>['oh-test-card','optimhire-apply-dialog','other-ext-card'].map(i=>getComputedStyle(document.getElementById(i)).display));
  let v=await vis();
  check(v[0]==='none'&&v[1]==='none'&&v[2]!=='none',`off: OptimHire's on-page card and dialog hidden, another extension's panel still shown (${v})`);
  await P.close();

  // 4. on again: the same page fills; OptimHire's card shows again
  await sp.click('#oh-autofill-bar'); await sleep(1500);
  check(await get('ohAutomationDisabled')===false&&/Autofill ON/.test((await bar()).text),'tap again: "Autofill ON"');
  bd=await badge(); check(bd.text!=='OFF','toolbar icon: OFF gone');
  await set(Object.assign({},engaged,{ohAutoApplyEngagedTs:Date.now()}));
  P=await ctx.newPage(); await P.goto(U);
  let phone=''; for(let i=0;i<20&&!phone;i++){ await sleep(800); phone=await P.evaluate(()=>document.getElementById('phone').value); }
  check(/87/.test(phone),`on: the same page fills again (phone "${phone}")`);
  await P.evaluate(()=>{ const d=document.createElement('div'); d.id='optimhire-apply-dialog'; d.textContent='x'; document.body.appendChild(d); });
  check(await P.evaluate(()=>getComputedStyle(document.getElementById('optimhire-apply-dialog')).display)!=='none','on: OptimHire\'s pop-ups show again');
  // 5. the toolbar menu / Alt+Shift+O switch (the same function the menu and the shortcut call)
  await sw.evaluate(()=>new Promise(r=>self.ohSetAutomation(true,r))); await sleep(800);
  check(await get('ohAutomationDisabled')===true&&/Autofill OFF/.test((await bar()).text),'toolbar menu / shortcut: off, and the panel bar follows');
  await sw.evaluate(()=>new Promise(r=>self.ohSetAutomation(false,r)));
  console.log(bad?`\n${bad} FAILED`:'\nALL PASS'); await ctx.close(); site.close(); process.exit(bad?1:0);
})().catch(e=>{console.error(e); process.exit(2);});
