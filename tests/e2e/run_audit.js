// E2E: one-click audit. The card's "Audit" switches recording on everywhere for 8 h (pages, side panel,
// service worker) and opens the live log; "Export audit file" downloads ONE JSON with a summary, the
// details forms get (and where each comes from), settings, the run's jobs, open tabs, the service
// worker's log and every log entry — with login tokens and passwords removed. The Debug Log viewer's
// "Export full audit" and the old "Diagnostic snapshot" give the same redacted file; Record/Stop work there.
const path=require('path'), fs=require('fs');
const {chromium}=require(require('child_process').execSync('npm root -g').toString().trim()+'/playwright/index.js');
const EXT=process.argv[2];
let bad=0; const T0=Date.now(); const check=(c,m)=>{console.log((c?'PASS':'FAIL').padEnd(5),m,'['+Math.round((Date.now()-T0)/1000)+'s]'); if(!c)bad++;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const TOKEN='eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0dXNlcjEyMyJ9.c2lnbmF0dXJlU0VDUkVUeHl6';
const PW='Sup3r$ecretPw!9', WDPW='OhWorkdayPw#77';
(async()=>{
  const prof=path.join(__dirname,'profile_audit'); fs.rmSync(prof,{recursive:true,force:true});
  const ctx=await chromium.launchPersistentContext(prof,{channel:'chromium',headless:true,acceptDownloads:true,args:[`--disable-extensions-except=${EXT}`,`--load-extension=${EXT}`]});
  let sw=ctx.serviceWorkers()[0]; if(!sw) sw=await ctx.waitForEvent('serviceworker'); const id=sw.url().split('/')[2];
  const qm=await ctx.newPage(); await qm.goto(`chrome-extension://${id}/tabs/jobQueue.html`); await qm.waitForTimeout(1500);
  const set=o=>qm.evaluate(o=>new Promise(r=>chrome.storage.local.set(o,r)),o);
  const get=k=>qm.evaluate(k=>new Promise(r=>chrome.storage.local.get(k,d=>r(d[k]))),k);
  await set({Talent_Auth_Token:TOKEN,appAccountEmail:'max@example.com',appAccountPassword:PW,
    ohWorkdayLogin:{email:'max@example.com',password:WDPW,otherPasswords:['OldPw123!'],sites:{'acme.wd1.myworkdayjobs.com':{state:'account',password:WDPW,ts:Date.now()}}},
    ohMyPhone:'+353 87 123 4567',candidateDetails:JSON.stringify({first_name:'Maxmilliam',last_name:'Okafor',auth_token:TOKEN}),
    ohHarvestedJobs:{'1':{id:'1',title:'Engineer',company:'Acme',ats:'Greenhouse',applyUrl:'https://job-boards.greenhouse.io/acme/jobs/1',outcome:'submitted',firstSeen:Date.now()-5000},
                     '2':{id:'2',title:'SRE',company:'Globex',ats:'Lever',applyUrl:'https://jobs.lever.co/globex/2',outcome:'skipped',reason:'Phone required',firstSeen:Date.now()-3000}},
    ohDebugLog:[{ts:Date.now()-2000,src:'content',cat:'Greenhouse',lvl:'error',msg:'Phone field empty',url:'https://job-boards.greenhouse.io/acme/jobs/1'},
                {ts:Date.now()-1000,src:'content',cat:'Fill',lvl:'info',msg:'Filled 12 fields',url:'https://job-boards.greenhouse.io/acme/jobs/1'}]});
  // 1. the card's Audit row: one click → recording on for 8 h, live log opened
  const sp=await ctx.newPage(); await sp.goto(`chrome-extension://${id}/sidepanel.html`); await sleep(3000);
  check(await sp.evaluate(()=>!!document.getElementById('oh-qc-audit')&&!!document.getElementById('oh-qc-auditx')),'card has "Audit" and "Export audit file"');
  const opened=ctx.waitForEvent('page',{timeout:8000}).catch(()=>null);
  await sp.click('#oh-qc-audit');
  const dbg=await opened; await sleep(1500);
  const until=await get('ohDebugUntil');
  check(await get('ohDebugEnabled')===true&&until>Date.now()+7.9*3600e3&&until<Date.now()+8.1*3600e3,'one click: recording everything for 8 hours');
  check(dbg&&/tabs\/debug\.html/.test(dbg.url()),`…and the live log opens (${dbg&&dbg.url()})`);
  const sub=await sp.evaluate(()=>document.getElementById('oh-qc-audit-sub').textContent);
  check(/Recording — (8h 0m|7h 59m) left/.test(sub),`card shows it: "${sub}"`);
  // 2. the service worker's log is recorded while on
  await sw.evaluate(()=>{ console.log('[OH-BG] audit-probe background line'); console.warn('Bearer token: '+'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4eXoxMjM0NSJ9.c2lnbmF0dXJlYWJjZGVm'); });
  await sleep(3500);
  const bg=await get('ohBgLog')||[];
  check(bg.some(e=>/audit-probe background line/.test(e.msg)),`the service worker's own lines are recorded (${bg.length})`);
  check(!bg.some(e=>/eyJ/.test(e.msg)),'a background line carrying a token is not kept');
  await dbg.reload(); await sleep(2000);
  const viewerHasBg=await dbg.evaluate(()=>document.body.innerText.includes('audit-probe background line'));
  check(viewerHasBg,'the live log viewer shows the service worker\'s lines too');
  const bar=await dbg.evaluate(()=>document.getElementById('auditBar').innerText);
  check(/Recording everything/.test(bar)&&/Stop recording/.test(bar),`viewer: "${bar.replace(/\s+/g,' ').slice(0,120)}"`);
  // 3. Export audit file from the card: one JSON, everything in it, no secrets
  await set({Talent_Auth_Token:TOKEN}); // OptimHire drops a token it cannot verify — put it back for the export
  const dl=[]; sp.on('download',d=>dl.push(d));
  await sp.click('#oh-qc-auditx'); await sleep(2500);
  check(dl.length===1&&/^optimhire-audit-\d{8}-\d{6}\.json$/.test(dl[0].suggestedFilename()),`one file: ${dl.map(d=>d.suggestedFilename()).join(', ')}`);
  const f1=path.join(__dirname,'audit_out.json'); await dl[0].saveAs(f1);
  const raw=fs.readFileSync(f1,'utf8'); const A=JSON.parse(raw);
  check(['about','summary','yourDetails','settings','optimhireRun','csvQueue','workday','openTabs','backgroundLog','log','storage'].every(k=>k in A),'sections: '+Object.keys(A).join(', '));
  check(A.about.recording.on===true&&A.summary.errors>=1&&A.summary.lastErrors.some(e=>/Phone field empty/.test(e.msg)),'summary: recording on, errors counted, last errors listed');
  check(A.summary.optimhireQueue.jobsHandedOut===2&&A.summary.optimhireQueue.byOutcome.submitted===1&&A.summary.optimhireQueue.byOutcome.skipped===1,'summary: OptimHire jobs and outcomes');
  check(A.yourDetails.phone&&A.yourDetails.phone.value==='+353 87 123 4567'&&/typed on the side panel/.test(A.yourDetails.phone.from),`your details: phone ${JSON.stringify(A.yourDetails.phone)}`);
  check(A.openTabs.some(t=>/debug\.html/.test(t.url||'')),'open tabs listed');
  check(A.backgroundLog.some(e=>/audit-probe/.test(e.msg))&&A.log.length>=2,'service worker log + page log included');
  check(!raw.includes(TOKEN)&&!raw.includes(PW)&&!raw.includes(WDPW)&&!raw.includes('OldPw123!')&&!/eyJ[\w-]{8,}\.[\w-]{8,}\./.test(raw),'NO login token, password or Workday passwords anywhere in the file');
  check(A.storage.Talent_Auth_Token==='[redacted]'&&A.storage.appAccountPassword==='[redacted]'&&A.workday.signIn.password==='[redacted]','…they read "[redacted]"');
  check(A.storage.appAccountEmail==='max@example.com'&&A.workday.signIn.sites['acme.wd1.myworkdayjobs.com'].state==='account','useful non-secret details kept');
  // 4. the viewer's buttons: Export full audit + the old Diagnostic snapshot → same redacted file
  for(const btn of ['#btnAudit','#btnSnapshot']){
    const d2=[]; const h=d=>d2.push(d); dbg.on('download',h);
    await dbg.click(btn); await sleep(2500); dbg.off('download',h);
    let ok=d2.length===1&&/^optimhire-audit-/.test(d2[0].suggestedFilename()), clean=false;
    if(ok){ const f=path.join(__dirname,'audit_out2.json'); await d2[0].saveAs(f); const r=fs.readFileSync(f,'utf8'); clean=!r.includes(TOKEN)&&!r.includes(PW)&&!r.includes(WDPW)&&'summary' in JSON.parse(r); }
    check(ok&&clean,`viewer ${btn}: full audit file, secrets removed`);
  }
  // 5. Stop / Record from the viewer
  await dbg.click('#auditBar button'); await sleep(800);
  check(await get('ohDebugEnabled')===false,'viewer: Stop recording');
  await sleep(800);
  check(/Record everything \(8 h\)/.test(await dbg.evaluate(()=>document.getElementById('auditBar').innerText)),'…then offers Record everything (8 h)');
  await dbg.click('#auditBar button'); await sleep(800);
  check(await get('ohDebugEnabled')===true&&(await get('ohDebugUntil'))>Date.now()+7.9*3600e3,'viewer: Record everything again');
  await sleep(1000);
  const sub2=await sp.evaluate(()=>document.getElementById('oh-qc-audit-sub').textContent);
  check(/Recording/.test(sub2),'card follows the viewer\'s switch');
  console.log(bad?`\n${bad} FAILED`:'\nALL PASS'); await ctx.close(); process.exit(bad?1:0);
})().catch(e=>{console.error(e); process.exit(2);});
