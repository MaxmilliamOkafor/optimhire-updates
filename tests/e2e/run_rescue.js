// E2E: "Loading your Job" never spins for good. OptimHire's own start (START_JOB_APPLICATION_VIA_WEB →
// "Loading your Job" → your profile → the job) runs against a fake optimhire.com that misbehaves:
// a 503 once, no answer once, failing every try for a while, failing for good, signed out. Each time
// the start either gets going on its own or is restarted; the panel is reset (never left spinning)
// when it can't, and the card is told why. A page that never answers the panel notice doesn't stall it.
const path=require('path'), https=require('https'), http=require('http'), fs=require('fs');
const {chromium}=require(require('child_process').execSync('npm root -g').toString().trim()+'/playwright/index.js');
const EXT=process.argv[2];
let bad=0; const T0=Date.now(); const check=(c,m)=>{console.log((c?'PASS':'FAIL').padEnd(5),m,'['+Math.round((Date.now()-T0)/1000)+'s]'); if(!c)bad++;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let mode='ok', profileCalls=0, jobCalls=0, failLeft=0;
const api=https.createServer({key:fs.readFileSync(path.join(__dirname,'oh_key.pem')),cert:fs.readFileSync(path.join(__dirname,'oh_cert.pem'))},(q,r)=>{
  const u=new URL(q.url,'https://optimhire.com'); r.setHeader('content-type','application/json');
  if(/^\/api\/v1\/candidate\/[^/]+$/.test(u.pathname)){
    profileCalls++;
    if(failLeft>0){ failLeft--; if(mode==='hang') return; r.writeHead(mode==='500'?500:503); return r.end('{"status":0,"message":"busy"}'); }
    return r.end(JSON.stringify({status:1,data:{first_name:'Maxmilliam',last_name:'Okafor',free_left_credits:'500',copilot_status:'paid',is_copilot_active:'1'}}));
  }
  if(/^\/api\/v1\/candidate\/[^/]+\/application$/.test(u.pathname)){
    jobCalls++;
    return r.end(JSON.stringify({status:1,data:{copilot_job_id:'J1',application_id:'A1',ats_name:'Greenhouse',
      source:{job_title:'Engineer',company_name:'Acme',apply_now_url:'http://127.0.0.1:8793/job'},seeker:{first_name:'Maxmilliam'}}}));
  }
  r.writeHead(404); r.end('{"status":0}');
});
const jobs=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'}); r.end('<html><body><h1>Engineer</h1></body></html>');});
async function scenario(name, setup, expect){
  const prof=path.join(__dirname,'profile_rescue'); fs.rmSync(prof,{recursive:true,force:true});
  const ctx=await chromium.launchPersistentContext(prof,{channel:'chromium',headless:true,ignoreHTTPSErrors:true,
    args:[`--disable-extensions-except=${EXT}`,`--load-extension=${EXT}`,'--host-resolver-rules=MAP optimhire.com 127.0.0.1','--ignore-certificate-errors','--no-proxy-server']});
  let sw=ctx.serviceWorkers()[0]; if(!sw) sw=await ctx.waitForEvent('serviceworker'); const id=sw.url().split('/')[2];
  const pg=await ctx.newPage(); await pg.goto(`chrome-extension://${id}/tabs/jobQueue.html`); await sleep(2500);
  // a page that keeps every message open and never answers (what can stall "await sendMessage")
  await pg.evaluate(()=>{ window.__seen=[]; chrome.runtime.onMessage.addListener(m=>{ window.__seen.push((m&&m.type)||'?'); return true; }); });
  const job=await ctx.newPage(); await job.goto('about:blank');
  const tabId=await sw.evaluate(async()=> (await chrome.tabs.query({url:'about:blank'}))[0].id);
  await sw.evaluate(async(signedIn)=>{ if(signedIn){ await chrome.cookies.set({url:'https://optimhire.com',name:'at',value:'tok-test',domain:'optimhire.com'});
                                         await chrome.cookies.set({url:'https://optimhire.com',name:'did',value:'77',domain:'optimhire.com'}); } }, setup.signedIn!==false);
  await pg.evaluate(t=>new Promise(r=>chrome.storage.local.set({copilotTabId:t},r)),tabId);
  mode=setup.mode||'ok'; failLeft=setup.failLeft||0; profileCalls=0; jobCalls=0;
  const t0=Date.now();
  await pg.evaluate(()=>{ chrome.runtime.sendMessage({action:'START_JOB_APPLICATION_VIA_WEB',jobId:'J1'}).catch(()=>{}); });
  const get=k=>pg.evaluate(k=>new Promise(r=>chrome.storage.local.get(k,d=>r(d[k]))),k);
  let started=false, reset=false;
  for(let i=0;i<(setup.waitS||60);i++){ await sleep(1000);
    const st=await get('autoApplyState'); const seen=await pg.evaluate(()=>window.__seen);
    started=!!(st&&st.isActive&&st.applicationDetails&&st.applicationDetails.copilot_job_id==='J1');
    reset=seen.includes('RELOAD_SIDE');
    if(started||reset) break; }
  const secs=Math.round((Date.now()-t0)/1000), rescue=await get('ohLoadRescue'), seen=await pg.evaluate(()=>window.__seen);
  console.log(`      ${name}: ${secs}s, profile requests ${profileCalls}, job requests ${jobCalls}, panel saw ${[...new Set(seen)].join(',')}${rescue?`, card: "${rescue.msg}"`:''}`);
  const callsAtEnd=profileCalls;
  if(setup.quietAfter){ await sleep(setup.quietAfter); }
  expect({started,reset,secs,rescue,seen,callsAtEnd});
  await ctx.close();
}
(async()=>{
  await new Promise(r=>api.listen(443,r)); await new Promise(r=>jobs.listen(8793,r));
  await scenario('normal',{},o=>{ check(o.started&&!o.reset&&o.secs<10,'a normal start gets going — even with a page that never answers the panel notice'); check(profileCalls===1,'one profile request'); });
  await scenario('503 once',{mode:'503',failLeft:1},o=>{ check(o.started&&!o.reset&&profileCalls===2&&o.secs<12,'optimhire.com answers 503 once: asked again, the run gets going'); });
  await scenario('no answer once',{mode:'hang',failLeft:1,waitS:45},o=>{ check(o.started&&!o.reset&&profileCalls===2&&o.secs<30,'optimhire.com never answers once: given up on after 15 s, asked again, the run gets going'); });
  await scenario('fails every try for a while',{mode:'500',failLeft:3,waitS:60},o=>{
    check(o.started&&!o.reset,'every try of the start fails: OptimHire stops — and the start is restarted, and gets going');
    check(o.rescue&&/starting it again \(1\/2\)/.test(o.rescue.msg),'the card is told it was restarted'); });
  await scenario('fails for good',{mode:'500',failLeft:999,waitS:90,quietAfter:12000},o=>{
    check(!o.started&&o.reset,'optimhire.com never hands out the job: after the restarts the panel is reset, not left spinning');
    check(o.rescue&&o.rescue.final&&/after 3 tries/.test(o.rescue.msg),'…and the card says why');
    check(o.callsAtEnd>=7&&o.callsAtEnd<=9&&profileCalls===o.callsAtEnd,`3 starts (each asking up to 3 times), then it stops asking: ${o.callsAtEnd} requests, none in the 12 s after`); });
  await scenario('signed out',{signedIn:false,waitS:40},o=>{
    check(!o.started&&o.reset&&o.rescue&&/signed out of optimhire\.com/.test(o.rescue.msg),'signed out of optimhire.com: panel reset, the card says sign in'); });
  console.log(bad?`\n${bad} FAILED`:'\nALL PASS'); api.close(); jobs.close(); process.exit(bad?1:0);
})().catch(e=>{console.error(e); process.exit(2);});
