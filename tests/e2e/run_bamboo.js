// E2E: BambooHR. Country is BambooHR's own dropdown (button + menu with Search + options + hidden
// <select>) and stayed on "United States"; ZIP held a place ("Dublin, D08 XY12"); menus were left open.
// Now Country → Ireland through its menu, State → Dublin from Ireland's list, ZIP → the postcode, no
// menu left open. And OptimHire's "cover-letter.txt" goes into the Cover Letter box as a PDF with your name.
const path=require('path'), https=require('https'), fs=require('fs');
const {chromium}=require(require('child_process').execSync('npm root -g').toString().trim()+'/playwright/index.js');
const EXT=process.argv[2];
let bad=0; const T0=Date.now(); const check=(c,m)=>{console.log((c?'PASS':'FAIL').padEnd(5),m,'['+Math.round((Date.now()-T0)/1000)+'s]'); if(!c)bad++;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const site=https.createServer({key:fs.readFileSync(path.join(__dirname,'oh_key.pem')),cert:fs.readFileSync(path.join(__dirname,'oh_cert.pem'))},(q,r)=>{
  r.writeHead(200,{'content-type':'text/html'}); r.end(fs.readFileSync(path.join(__dirname,'site','bamboo.html')));});
(async()=>{
  await new Promise(r=>site.listen(443,r));
  const prof=path.join(__dirname,'profile_bamboo'); fs.rmSync(prof,{recursive:true,force:true});
  const ctx=await chromium.launchPersistentContext(prof,{channel:'chromium',headless:true,ignoreHTTPSErrors:true,viewport:{width:900,height:1000},
    args:[`--disable-extensions-except=${EXT}`,`--load-extension=${EXT}`,'--host-resolver-rules=MAP nylontechnology.bamboohr.com 127.0.0.1','--ignore-certificate-errors','--no-proxy-server']});
  let sw=ctx.serviceWorkers()[0]; if(!sw) sw=await ctx.waitForEvent('serviceworker'); const id=sw.url().split('/')[2];
  const qm=await ctx.newPage(); await qm.goto(`chrome-extension://${id}/tabs/jobQueue.html`); await qm.waitForTimeout(1500);
  const U='https://nylontechnology.bamboohr.com/careers/27';
  await qm.evaluate(o=>new Promise(r=>chrome.storage.local.set(o,r)),{isAutoProcessStartJob:true,ohAutomationDisabled:false,candidateDetails:{first_name:'Maxmilliam',last_name:'Okafor'},
    autoApplyState:{isActive:true,applicationDetails:{copilot_job_id:'B1',ats_name:'BambooHR',source:{apply_now_url:U},
      seeker:{first_name:'Maxmilliam',last_name:'Okafor',email:'max@example.com',city:'Dublin',country:'Ireland',mobile_code:'353',mobile_num:'871234567'}}}});
  const P=await ctx.newPage(); await P.goto(U);
  const state=()=>P.evaluate(()=>({country:document.querySelector('#countrySel button').textContent,state:document.querySelector('#stateSel button').textContent,
     zip:document.getElementById('zip').value,open:document.querySelectorAll('[data-helium-id]').length,events:window.__events.slice()}));
  let s; for(let i=0;i<30;i++){ await sleep(1000); s=await state(); if(s.country==='Ireland'&&s.state==='Dublin'&&!s.open) break; }
  console.log('      '+JSON.stringify(s));
  check(s.country==='Ireland','Country: Ireland, picked from BambooHR\'s own menu (was left on "United States")');
  check(s.state==='Dublin','State: Dublin, from Ireland\'s list');
  check(s.zip==='D08 XY12','ZIP: the postcode, not "Dublin, D08 XY12"');
  check(s.open===0,'no dropdown menu left open over the form');
  await sleep(10000); s=await state();
  check(s.country==='Ireland'&&s.state==='Dublin'&&s.events.filter(e=>e.startsWith('m-country')).length===1,`still right 10 s later, chosen once (${s.events.join(', ')})`);
  // OptimHire's cover letter, attached the way its filler does (from the extension's world)
  const tabId=await sw.evaluate(async u=>(await chrome.tabs.query({url:u+'*'}))[0].id,U);
  await sw.evaluate(async tabId=>{ await chrome.scripting.executeScript({target:{tabId},func:()=>{
    const text='Dear Hiring Manager,\n\nI am excited to apply for the Software Engineer role at Nylon Technology. Over seven years I have built and shipped production systems on AWS.\n\nSincerely,\nMaxmilliam Okafor';
    const f=new File([text],'cover-letter.txt',{type:'text/plain'}); const dt=new DataTransfer(); dt.items.add(f);
    const inp=document.getElementById('cl'); inp.files=dt.files; inp.dispatchEvent(new Event('change',{bubbles:true})); }}); },tabId);
  let f=null; for(let i=0;i<20;i++){ await sleep(500); f=await P.evaluate(async()=>{const x=document.getElementById('cl').files[0]; if(!x) return null;
     const t=await x.text(); return {name:x.name,type:x.type,pdf:t.startsWith('%PDF'),hasText:t.includes('Dear Hiring Manager'),hasName:t.includes('Maxmilliam Okafor'),contact:t.includes('max@example.com')};}); if(f&&f.pdf) break; }
  console.log('      '+JSON.stringify(f));
  check(f&&f.pdf&&f.type==='application/pdf'&&/^Maxmilliam-Okafor-.*Cover-Letter\.pdf$/.test(f.name),`cover-letter.txt goes in as a PDF named for you (${f&&f.name})`);
  check(f&&f.hasText&&f.hasName,'…with the letter as written');
  check(f&&!f.contact,'…signed with your name already, so no second name header on top');
  console.log(bad?`\n${bad} FAILED`:'\nALL PASS'); await ctx.close(); site.close(); process.exit(bad?1:0);
})().catch(e=>{console.error(e); process.exit(2);});
