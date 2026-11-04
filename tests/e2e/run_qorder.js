// E2E: optimhire.com's own job lists come ATS first — company ATS, then career sites, then job boards
// (eFinancialCareers, Totaljobs, LinkedIn…), Reed last — whether the page asks with fetch or XHR.
// Order inside a group is kept; "Quickest ATS first" off leaves the site's order. And a board job the
// job page picks (eFinancialCareers) is swapped for a waiting ATS job, like Reed.
const path=require('path'), https=require('https'), fs=require('fs');
const {chromium}=require(require('child_process').execSync('npm root -g').toString().trim()+'/playwright/index.js');
const EXT=process.argv[2];
let bad=0; const T0=Date.now(); const check=(c,m)=>{console.log((c?'PASS':'FAIL').padEnd(5),m,'['+Math.round((Date.now()-T0)/1000)+'s]'); if(!c)bad++;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const J=(id,url,extra)=>Object.assign({job_id:id,job_title:'Job '+id,company_name:'Co '+id,source:{apply_now_url:url}},extra||{});
const LIST=[J('reed1','https://www.reed.co.uk/jobs/a/1'), J('efc1','https://www.efinancialcareers.co.uk/jobs-UK-London-x.id1'),
  J('gh1','https://job-boards.greenhouse.io/acme/jobs/1'), J('site1','https://careers.acme.com/jobs/1'), J('li1','https://www.linkedin.com/jobs/view/1'),
  J('wd1','https://acme.wd1.myworkdayjobs.com/en-US/ext/job/X_1'), J('lev1','https://jobs.lever.co/acme/1'), J('tj1','https://www.totaljobs.com/job/1'),
  J('gh2','https://job-boards.greenhouse.io/acme/jobs/2'), J('named','',{ats_name:'eFinancialCareers'})];
let byIdMode='efc', calls=[];
const srv=https.createServer({key:fs.readFileSync(path.join(__dirname,'oh_key.pem')),cert:fs.readFileSync(path.join(__dirname,'oh_cert.pem'))},(q,r)=>{
  const u=new URL(q.url,'https://optimhire.com'); calls.push(u.pathname+u.search);
  if(u.pathname==='/api/v1/candidate/77/jobs'){ r.writeHead(200,{'content-type':'application/json'}); return r.end(JSON.stringify({status:1,data:{total:10,jobs:LIST}})); }
  if(u.pathname==='/api/v1/candidate/77/application'){ r.setHeader('content-type','application/json');
    if(u.searchParams.get('job_id')) return r.end(JSON.stringify({status:1,data:{copilot_job_id:'E1',ats_name:'eFinancialCareers',source:{job_title:'Analyst',apply_now_url:'https://www.efinancialcareers.co.uk/jobs-UK-London-x.id9'}}}));
    const site=u.searchParams.get('jobsite');
    if(site==='greenhouse') return r.end(JSON.stringify({status:1,data:{copilot_job_id:'G7',ats_name:'Greenhouse',source:{job_title:'Engineer',apply_now_url:'https://job-boards.greenhouse.io/acme/jobs/7'}}}));
    r.writeHead(404); return r.end('{"status":0,"message":"No data found"}'); }
  r.writeHead(200,{'content-type':'text/html'});
  r.end(`<!doctype html><html><body><h1>Job apply</h1><script>
    window.viaFetch=async()=>{const r=await fetch('/api/v1/candidate/77/jobs'); const b=await r.json(); return b.data.jobs.map(j=>j.job_id);};
    window.viaXhr=(type)=>new Promise(res=>{const x=new XMLHttpRequest(); x.open('GET','/api/v1/candidate/77/jobs'); if(type) x.responseType=type;
      x.onload=()=>{const b=type==='json'?x.response:JSON.parse(x.responseText); res(b.data.jobs.map(j=>j.job_id));}; x.send();});
  </script></body></html>`);
});
(async()=>{
  await new Promise(r=>srv.listen(443,r));
  const prof=path.join(__dirname,'profile_qorder'); fs.rmSync(prof,{recursive:true,force:true});
  const ctx=await chromium.launchPersistentContext(prof,{channel:'chromium',headless:true,ignoreHTTPSErrors:true,
    args:[`--disable-extensions-except=${EXT}`,`--load-extension=${EXT}`,'--host-resolver-rules=MAP optimhire.com 127.0.0.1','--ignore-certificate-errors','--no-proxy-server']});
  let sw=ctx.serviceWorkers()[0]; if(!sw) sw=await ctx.waitForEvent('serviceworker'); const id=sw.url().split('/')[2];
  const qm=await ctx.newPage(); await qm.goto(`chrome-extension://${id}/tabs/jobQueue.html`); await sleep(1500);
  const set=o=>qm.evaluate(o=>new Promise(r=>chrome.storage.local.set(o,r)),o);
  const P=await ctx.newPage(); await P.goto('https://optimhire.com/d/job-apply'); await sleep(1500);
  const f=await P.evaluate(()=>window.viaFetch()); console.log('      fetch:',f.join(' '));
  const x=await P.evaluate(()=>window.viaXhr('')); console.log('      xhr  :',x.join(' '));
  const xj=await P.evaluate(()=>window.viaXhr('json')); console.log('      xhr/json:',xj.join(' '));
  const order=['gh1','gh2','wd1','lev1','site1','li1','tj1','reed1','efc1','named'];
  check(f.join()===order.join(),'fetch: Greenhouse, Workday, Lever (your order), company site, LinkedIn, Totaljobs, Reed, then eFinancialCareers last');
  check(x.join()===order.join()&&xj.join()===order.join(),'XHR (text and json): the same order');
  check(f.indexOf('gh1')<f.indexOf('gh2')&&f.indexOf('efc1')<f.indexOf('named'),'order inside a group kept (as the site had it)');
  await set({ohPreferAts:false}); await sleep(800);
  const off=await P.evaluate(()=>window.viaFetch());
  check(off.join()===LIST.map(j=>j.job_id).join(),'"Quickest ATS first" off: the site\'s own order');
  await set({ohPreferAts:true}); await sleep(500);
  // the job page picks an eFinancialCareers job: an ATS job waiting goes first (job board, like Reed)
  await set({ohAutoPressTs:Date.now()}); await sleep(500);
  const swapped=await sw.evaluate(async()=>{const r=await fetch('https://optimhire.com/api/v1/candidate/77/application?job_id=E1',{headers:{Auth_Token:'t'}}); const b=await r.json(); return b.data&&b.data.copilot_job_id;});
  check(swapped==='G7',`the job page picks an eFinancialCareers job → a waiting Greenhouse job is applied to first (got ${swapped})`);
  console.log(bad?`\n${bad} FAILED`:'\nALL PASS'); await ctx.close(); srv.close(); process.exit(bad?1:0);
})().catch(e=>{console.error(e); process.exit(2);});
