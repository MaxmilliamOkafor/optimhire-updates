// E2E: the CSV queue skips closed postings without opening them — one plain request, and only the
// sign the site itself gives (AIHawk's measured signals, github.com/feder-cr/Jobs_Applier_AI_Agent, MIT):
// Workday's job JSON answers 403 with errorCode S22; Lever's posting answers 404. An open job, and a
// job whose check says nothing clear (Workday answering 500), are opened as always.
const path=require('path'), https=require('https'), fs=require('fs');
const {chromium}=require(require('child_process').execSync('npm root -g').toString().trim()+'/playwright/index.js');
const EXT=process.argv[2];
let bad=0; const T0=Date.now(); const check=(c,m)=>{console.log((c?'PASS':'FAIL').padEnd(5),m,'['+Math.round((Date.now()-T0)/1000)+'s]'); if(!c)bad++;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pages=[];   // job pages a tab actually opened
const srv=https.createServer({key:fs.readFileSync(path.join(__dirname,'oh_key.pem')),cert:fs.readFileSync(path.join(__dirname,'oh_cert.pem'))},(q,r)=>{
  const host=String(q.headers.host||'').split(':')[0], u=q.url;
  if(host==='acme.wd1.myworkdayjobs.com'&&u.startsWith('/wday/cxs/acme/Careers/job/')){
    r.setHeader('content-type','application/json');
    if(/Closed_R1/.test(u)){ r.writeHead(403); return r.end('{"errorCode":"S22","httpStatus":403,"message":"The page you are looking for doesn\'t exist."}'); }
    if(/Flaky_R3/.test(u)){ r.writeHead(500); return r.end('{}'); }
    return r.end('{"jobPostingInfo":{"title":"Engineer"}}');
  }
  if(host==='jobs.lever.co'&&/gone/.test(u)){ r.writeHead(404,{'content-type':'text/html'}); return r.end('<title>Not found</title>Sorry, we couldn\'t find anything here'); }
  if(q.headers['sec-fetch-dest']==='document') pages.push(host+u);
  r.writeHead(200,{'content-type':'text/html'}); r.end('<html><body><h1>Job</h1></body></html>');
});
(async()=>{
  await new Promise(r=>srv.listen(443,r));
  const prof=path.join(__dirname,'profile_closed'); fs.rmSync(prof,{recursive:true,force:true});
  const ctx=await chromium.launchPersistentContext(prof,{channel:'chromium',headless:true,ignoreHTTPSErrors:true,
    args:[`--disable-extensions-except=${EXT}`,`--load-extension=${EXT}`,'--host-resolver-rules=MAP acme.wd1.myworkdayjobs.com 127.0.0.1,MAP jobs.lever.co 127.0.0.1','--ignore-certificate-errors','--no-proxy-server']});
  let sw=ctx.serviceWorkers()[0]; if(!sw) sw=await ctx.waitForEvent('serviceworker'); const id=sw.url().split('/')[2];
  const qm=await ctx.newPage(); await qm.goto(`chrome-extension://${id}/tabs/jobQueue.html`); await sleep(1500);
  const get=k=>qm.evaluate(k=>new Promise(r=>chrome.storage.local.get(k,d=>r(d[k]))),k);
  const W='https://acme.wd1.myworkdayjobs.com/en-US/Careers/job/Dublin/';
  const jobs=[{id:'a',title:'Closed Workday job',url:W+'Engineer_Closed_R1/apply/applyManually',status:'pending'},
              {id:'b',title:'Gone Lever job',url:'https://jobs.lever.co/acme/gone-123/apply',status:'pending'},
              {id:'c',title:'Open Workday job',url:W+'Engineer_Open_R2',status:'pending'},
              {id:'d',title:'Workday job, check unclear',url:W+'Engineer_Flaky_R3',status:'pending'}];
  await qm.evaluate(j=>new Promise(r=>chrome.storage.local.set({ohJobQueue:j,ohPreferAts:false},r)),jobs);
  await qm.evaluate(()=>new Promise(r=>chrome.runtime.sendMessage({type:'OH_QUEUE_START',concurrency:4},()=>{void chrome.runtime.lastError; r();})));
  await sleep(6000);
  const q=await get('ohJobQueue'), by=Object.fromEntries(q.map(j=>[j.id,j]));
  console.log('      '+q.map(j=>`${j.id}:${j.status}${j.lastError?' ('+j.lastError+')':''}`).join(' | '));
  console.log('      tabs opened for: '+pages.join(', '));
  check(by.a.status==='failed'&&/posting closed — Workday says the job is no longer posted/.test(by.a.lastError)&&!pages.some(p=>/Closed_R1/.test(p)),'Workday job whose JSON answers 403 / S22: marked closed, never opened');
  check(by.b.status==='failed'&&/Lever/.test(by.b.lastError)&&!pages.some(p=>/gone/.test(p)),'Lever posting that answers 404: marked closed, never opened');
  check(by.c.status==='running'&&pages.some(p=>/Open_R2/.test(p)),'open Workday job: opened as always');
  check(by.d.status==='running'&&pages.some(p=>/Flaky_R3/.test(p)),'a check with no clear answer (Workday 500): opened as always, never skipped');
  await qm.evaluate(()=>new Promise(r=>chrome.runtime.sendMessage({type:'OH_QUEUE_STOP'},()=>{void chrome.runtime.lastError; r();})));
  console.log(bad?`\n${bad} FAILED`:'\nALL PASS'); await ctx.close(); srv.close(); process.exit(bad?1:0);
})().catch(e=>{console.error(e); process.exit(2);});
