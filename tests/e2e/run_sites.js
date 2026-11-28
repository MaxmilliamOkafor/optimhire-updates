// E2E: site notes from AIHawk (github.com/feder-cr/Jobs_Applier_AI_Agent, MIT) applied to the autofill,
// on stand-ins built from what those notes say the real forms hold:
//  - Ashby: two upload boxes, "Autofill from resume" and the real #_systemfield_resume — the CV goes only
//    into the real one; an "Apply with LinkedIn" button above the real Submit is never pressed.
//  - Workable: a "Cookie Consent" banner with "Accept all" / "Decline all" — declined.
//  - Lever: the site fills the phone from the CV after the upload, wrongly — put back to yours.
//  - Paylocity: "Fill out application with my resume" starts ticked — unticked; its ids (info.firstName,
//    info.cellPhone) filled; the phone typed without spaces.
const path=require('path'), https=require('https'), fs=require('fs');
const {chromium}=require(require('child_process').execSync('npm root -g').toString().trim()+'/playwright/index.js');
const EXT=process.argv[2];
let bad=0; const T0=Date.now(); const check=(c,m)=>{console.log((c?'PASS':'FAIL').padEnd(5),m,'['+Math.round((Date.now()-T0)/1000)+'s]'); if(!c)bad++;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const PDF=Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const PAGES={
'jobs.ashbyhq.com':`<h1>Software Engineer</h1>
<div id="autofill-section"><h3>Autofill from resume</h3><p>Upload your resume here to autofill key application fields.</p><input type="file" id="autofill-input"></div>
<div><button type="button" id="li" onclick="__c.li++">Apply with LinkedIn</button></div>
<form id="form"><div><label for="_systemfield_name">Name</label><input id="_systemfield_name" name="_systemfield_name"></div>
<div><label for="_systemfield_email">Email</label><input id="_systemfield_email" name="_systemfield_email" type="email"></div>
<div><label for="_systemfield_resume">Resume</label><input type="file" id="_systemfield_resume"></div>
<button type="submit" id="send" onclick="__c.send++">Submit Application</button></form>`,
'apply.workable.com':`<div aria-label="Cookie Consent" id="cc" style="position:fixed;bottom:0;left:0;right:0;background:#eee;padding:20px">We use cookies.
<button onclick="__c.accept++;this.parentNode.remove()">Accept all</button><button onclick="__c.decline++;this.parentNode.remove()">Decline all</button></div>
<h1>Software Engineer</h1><form><div><label for="firstname">First name</label><input id="firstname" name="firstname"></div>
<div><label for="lastname">Last name</label><input id="lastname" name="lastname"></div><div><label for="email">Email</label><input id="email" type="email"></div></form>`,
'jobs.lever.co':`<h1>Software Engineer</h1><h4>Submit your application</h4><form id="f">
<div class="application-question"><label for="resume-upload-input">Resume/CV ✱</label><input type="file" id="resume-upload-input" name="resume"></div>
<div class="application-question"><label for="name">Full name ✱</label><input id="name" name="name"></div>
<div class="application-question"><label for="email">Email ✱</label><input id="email" name="email" type="email"></div>
<div class="application-question"><label for="phone">Phone</label><input id="phone" name="phone"></div>
<button type="button" id="btn-submit">Submit application</button></form>
<script>document.getElementById('resume-upload-input').addEventListener('change',()=>{ setTimeout(()=>{ const p=document.getElementById('phone');
  const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(p,'087-555-0000'); p.dispatchEvent(new Event('input',{bubbles:true})); __c.parsed++; },1000); });</script>`,
'recruiting.paylocity.com':`<h1>Software Engineer</h1><form>
<div><input type="checkbox" id="useAttachedResumeToFillOutApplication" checked><label for="useAttachedResumeToFillOutApplication">Fill out application with my resume</label></div>
<div><label for="info.firstName">First Name</label><input id="info.firstName"></div>
<div><label for="info.lastName">Last Name</label><input id="info.lastName"></div>
<div><label for="info.cellPhone">Mobile Phone</label><input id="info.cellPhone" type="tel"></div>
<div><label for="info.email">Email</label><input id="info.email" type="email"></div></form>`};
const page=body=>`<!doctype html><html><head><meta charset="utf-8"><title>Apply</title></head><body><script>window.__c={li:0,send:0,accept:0,decline:0,parsed:0};
document.addEventListener('submit',e=>e.preventDefault(),true);</script>${body}</body></html>`;
const srv=https.createServer({key:fs.readFileSync(path.join(__dirname,'oh_key.pem')),cert:fs.readFileSync(path.join(__dirname,'oh_cert.pem'))},(q,r)=>{
  const host=String(q.headers.host||'').split(':')[0];
  if(q.url.startsWith('/files/cv.pdf')){ r.writeHead(200,{'content-type':'application/pdf'}); return r.end(PDF); }
  r.writeHead(200,{'content-type':'text/html'}); r.end(page(PAGES[host]||'<h1>?</h1>'));
});
(async()=>{
  await new Promise(r=>srv.listen(443,r));
  const prof=path.join(__dirname,'profile_sites'); fs.rmSync(prof,{recursive:true,force:true});
  const hosts=Object.keys(PAGES).map(h=>`MAP ${h} 127.0.0.1`).join(',');
  const ctx=await chromium.launchPersistentContext(prof,{channel:'chromium',headless:true,ignoreHTTPSErrors:true,viewport:{width:1100,height:900},
    args:[`--disable-extensions-except=${EXT}`,`--load-extension=${EXT}`,`--host-resolver-rules=${hosts}`,'--ignore-certificate-errors','--no-proxy-server']});
  let sw=ctx.serviceWorkers()[0]; if(!sw) sw=await ctx.waitForEvent('serviceworker'); const id=sw.url().split('/')[2];
  const qm=await ctx.newPage(); await qm.goto(`chrome-extension://${id}/tabs/jobQueue.html`); await sleep(1500);
  const set=o=>qm.evaluate(o=>new Promise(r=>chrome.storage.local.set(o,r)),o);
  async function open(url,ats,waitMs){
    await set({isAutoProcessStartJob:true,ohAutomationDisabled:false,ohMyPhone:'+353 87 123 4567',candidateDetails:{first_name:'Maxmilliam',last_name:'Okafor'},
      autoApplyState:{isActive:true,applicationDetails:{copilot_job_id:'S'+Date.now(),ats_name:ats,source:{apply_now_url:url},
        seeker:{first_name:'Maxmilliam',last_name:'Okafor',email:'max@example.com',city:'Dublin',country:'Ireland',resume:new URL('/files/cv.pdf',url).href}}}});
    const P=await ctx.newPage(); const logs=[]; P.on('console',m=>{const t=m.text(); if(/OH-Patch/.test(t)) logs.push(t);}); await P.goto(url); await sleep(waitMs); return {P,logs};
  }
  // Ashby
  let {P,logs}=await open('https://jobs.ashbyhq.com/acme/1/application','Ashby',14000);
  let a=await P.evaluate(()=>({auto:document.getElementById('autofill-input').files.length,real:document.getElementById('_systemfield_resume').files.length,li:__c.li}));
  check(a.real===1&&a.auto===0,`Ashby: the CV goes into the real Resume box only, not "Autofill from resume" (real ${a.real}, autofill ${a.auto})`);
  check(a.li===0,'Ashby: "Apply with LinkedIn" above the real Submit is never pressed');
  await P.close();
  // Workable
  ({P,logs}=await open('https://apply.workable.com/acme/j/ABC123/apply/','Workable',9000));
  a=await P.evaluate(()=>({accept:__c.accept,decline:__c.decline,banner:!!document.getElementById('cc')}));
  check(a.decline===1&&a.accept===0&&!a.banner,`Workable: the cookie banner is declined ("Decline all"), not accepted (${JSON.stringify(a)})`);
  await P.close();
  // Lever
  ({P,logs}=await open('https://jobs.lever.co/acme/1/apply','Lever',16000));
  a=await P.evaluate(()=>({phone:document.getElementById('phone').value,parsed:__c.parsed,cv:document.getElementById('resume-upload-input').files.length}));
  console.log('      lever:',JSON.stringify(a),logs.filter(l=>/Prefill repaired/.test(l)).map(l=>l.replace(/.*OH-Patch\]\s*/,'')).join(' | '));
  check(a.cv===1&&a.parsed>=1&&/87\s?123\s?4567/.test(a.phone),`Lever: the site filled the phone from the CV ("087-555-0000"); yours is put back ("${a.phone}")`);
  await P.close();
  // Paylocity
  ({P,logs}=await open('https://recruiting.paylocity.com/Recruiting/Jobs/Apply/123','Paylocity',12000));
  a=await P.evaluate(()=>({tick:document.getElementById('useAttachedResumeToFillOutApplication').checked,first:document.getElementById('info.firstName').value,phone:document.getElementById('info.cellPhone').value}));
  check(a.tick===false,'Paylocity: "Fill out application with my resume" unticked');
  check(a.first==='Maxmilliam'&&a.phone==='+353871234567',`Paylocity: its own ids filled, the phone without spaces (${a.first}, "${a.phone}")`);
  await P.close();
  console.log(bad?`\n${bad} FAILED`:'\nALL PASS'); await ctx.close(); srv.close(); process.exit(bad?1:0);
})().catch(e=>{console.error(e); process.exit(2);});
