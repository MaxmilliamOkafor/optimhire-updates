// E2E: the phone always reaches the form. Greenhouse's Phone box (required) gets: the phone you typed
// on the side panel's card (it wins); else your details kept from an earlier OptimHire job (every job's
// details are kept now, not only Workday's); else your CV's header — even when the job running now
// carries no phone. And the card's Phone row says which phone forms get, and saves the one you type.
const path=require('path'), https=require('https'), fs=require('fs');
const {chromium}=require(require('child_process').execSync('npm root -g').toString().trim()+'/playwright/index.js');
const EXT=process.argv[2];
let bad=0; const T0=Date.now(); const check=(c,m)=>{console.log((c?'PASS':'FAIL').padEnd(5),m,'['+Math.round((Date.now()-T0)/1000)+'s]'); if(!c)bad++;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const site=https.createServer({key:fs.readFileSync(path.join(__dirname,'oh_key.pem')),cert:fs.readFileSync(path.join(__dirname,'oh_cert.pem'))},(q,r)=>{
  r.writeHead(200,{'content-type':'text/html'}); r.end(fs.readFileSync(path.join(__dirname,'site','gh_phone.html')));});
(async()=>{
  await new Promise(r=>site.listen(443,r));
  const prof=path.join(__dirname,'profile_phone'); fs.rmSync(prof,{recursive:true,force:true});
  const ctx=await chromium.launchPersistentContext(prof,{channel:'chromium',headless:true,ignoreHTTPSErrors:true,viewport:{width:420,height:900},
    args:[`--disable-extensions-except=${EXT}`,`--load-extension=${EXT}`,'--host-resolver-rules=MAP job-boards.greenhouse.io 127.0.0.1','--ignore-certificate-errors','--no-proxy-server']});
  let sw=ctx.serviceWorkers()[0]; if(!sw) sw=await ctx.waitForEvent('serviceworker'); const id=sw.url().split('/')[2];
  const qm=await ctx.newPage(); await qm.goto(`chrome-extension://${id}/tabs/jobQueue.html`); await qm.waitForTimeout(1500);
  const set=o=>qm.evaluate(o=>new Promise(r=>chrome.storage.local.set(o,r)),o);
  const get=k=>qm.evaluate(k=>new Promise(r=>chrome.storage.local.get(k,d=>r(d[k]))),k);
  const noPhone={first_name:'Maxmilliam',last_name:'Okafor',email:'max@example.com',city:'Dublin',country:'Ireland'};
  async function job(n,extra){
    const U=`https://job-boards.greenhouse.io/striveworks/jobs/${n}`;
    await set(Object.assign({isAutoProcessStartJob:true,ohAutomationDisabled:false,candidateDetails:{first_name:'Maxmilliam',last_name:'Okafor'},
      autoApplyState:{isActive:true,applicationDetails:{copilot_job_id:'P'+n,ats_name:'Greenhouse',seeker:noPhone,source:{apply_now_url:U}}}},extra||{}));
    const P=await ctx.newPage(); await P.goto(U);
    let v=''; for(let i=0;i<20;i++){await sleep(800); v=await P.evaluate(()=>document.getElementById('phone').value); if(v) break;}
    await P.close(); return v;
  }
  // 1. an earlier OptimHire job had your phone: it is kept, and used when the job now has none
  await set({autoApplyState:{isActive:true,applicationDetails:{copilot_job_id:'EARLIER',seeker:{...noPhone,mobile_code:'353',mobile_num:'871234567'}}}}); await sleep(1500);
  const kept=await get('ohWdSeeker');
  check(kept&&kept.mobile_num==='871234567'&&kept.mobile_code==='353','an OptimHire job\'s details (phone included) are kept for later — not only Workday jobs\'');
  let v=await job(1);
  check(/871234567|87 ?123 ?4567/.test(v.replace(/\s/g,'').replace('+353','')) ,`the job running now has no phone: the kept one goes into Greenhouse's Phone ("${v}")`);
  // 2. the phone you type on the card wins
  const sp=await ctx.newPage(); await sp.goto(`chrome-extension://${id}/sidepanel.html`); await sleep(3000);
  const note1=await sp.evaluate(()=>document.getElementById('oh-qc-acct-phone-note').textContent);
  check(/Using \+353 871234567 from your OptimHire details/.test(note1),`card: "${note1}"`);
  await sp.evaluate(()=>{const c=document.getElementById('oh-queue-card'); if(c) c.classList.add('qc-open'); const f=document.getElementById('oh-qc-acct-fold'); if(f) f.open=true;}); // the card is a closed dock by default: open it
  await sp.fill('#oh-qc-acct-phone','+44 7700 900123'); await sp.press('#oh-qc-acct-phone','Tab'); await sleep(800);
  check(await get('ohMyPhone')==='+44 7700 900123','typed on the card → saved');
  v=await job(2);
  check(/7700\s?900123/.test(v),`the typed phone wins ("${v}")`);
  // 3. nothing typed, nothing kept: your CV's header
  await set({ohMyPhone:'',ohWdSeeker:{first_name:'Maxmilliam'},ohCvProfile:{url:'x',at:Date.now(),roles:1,profile:{work:[],education:[],skills:[],languages:[],summary:'',contact:{email:'max@example.com',phone:'+353 86 555 1234',linkedin:''}}}});
  v=await job(3);
  check(/86\s?555\s?1234/.test(v),`no phone anywhere else: the one in your CV's header ("${v}")`);
  await sp.reload(); await sleep(3000);
  const note3=await sp.evaluate(()=>document.getElementById('oh-qc-acct-phone-note').textContent);
  check(/from your CV/.test(note3),`card says where it comes from: "${note3}"`);
  console.log(bad?`\n${bad} FAILED`:'\nALL PASS'); await ctx.close(); site.close(); process.exit(bad?1:0);
})().catch(e=>{console.error(e); process.exit(2);});
