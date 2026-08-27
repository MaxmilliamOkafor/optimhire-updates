var e,t;"function"==typeof(e=globalThis.define)&&(t=e,e=null),function(t,o,i,r,n){var l="undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:"undefined"!=typeof window?window:"undefined"!=typeof global?global:{},a="function"==typeof l[r]&&l[r],d=a.cache||{},s="undefined"!=typeof module&&"function"==typeof module.require&&module.require.bind(module);function p(e,o){if(!d[e]){if(!t[e]){var i="function"==typeof l[r]&&l[r];if(!o&&i)return i(e,!0);if(a)return a(e,!0);if(s&&"string"==typeof e)return s(e);var n=Error("Cannot find module '"+e+"'");throw n.code="MODULE_NOT_FOUND",n}m.resolve=function(o){var i=t[e][1][o];return null!=i?i:o},m.cache={};var c=d[e]=new p.Module(e);t[e][0].call(c.exports,m,c,c.exports,this)}return d[e].exports;function m(e){var t=m.resolve(e);return!1===t?{}:p(t)}}p.isParcelRequire=!0,p.Module=function(e){this.id=e,this.bundle=p,this.exports={}},p.modules=t,p.cache=d,p.parent=a,p.register=function(e,o){t[e]=[function(e,t){t.exports=o},{}]},Object.defineProperty(p,"root",{get:function(){return l[r]}}),l[r]=p;for(var c=0;c<o.length;c++)p(o[c]);if(i){var m=p(i);"object"==typeof exports&&"undefined"!=typeof module?module.exports=m:"function"==typeof e&&e.amd?e(function(){return m}):n&&(this[n]=m)}}({isG7X:[function(e,t,o){var i=e("@parcel/transformer-js/src/esmodule-helpers.js");i.defineInteropFlag(o),i.export(o,"createNotificationHtmlBase",()=>d),i.export(o,"hideHtmlNotificationOnly",()=>s),i.export(o,"removeHtmlNotificationAndBackdrop",()=>p),i.export(o,"showHtmlNotificationAt",()=>c),i.export(o,"showFormFillingProcessNotification",()=>m);var r=e("~config/optimhire"),n=e("~helper/injectCustomUI");let l="optimhire-shadow-container",a=null,d=()=>{if(r.STOP_INJECT_POPUP||document.getElementById(l))return;let e=document.createElement("div");e.id=l,e.style.position="absolute",e.style.top="0",e.style.left="0",e.style.zIndex="2147483640";let t=document.documentElement?document.documentElement:document.body;if(t){if((0,n.isDialogPopupOrNot)()){let o=document.createElement("dialog");o.id="optimhire-one-minute-dialog",t.appendChild(o),o.appendChild(e),o.showModal()}else t.appendChild(e)}else if((0,n.isDialogPopupOrNot)()){let t=document.createElement("dialog");t.id="optimhire-one-minute-dialog",document.body.appendChild(t),t.appendChild(e),t.showModal()}else document.body.appendChild(e);a=e.attachShadow({mode:"open"});let o=document.createElement("style");o.textContent=`
    #optimhire-html-click-notification-backdrop {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.12);
      z-index: 2147483643;
    }
    #optimhire-html-click-notification {
      display: none;
      position: fixed;
      z-index: 2147483647;
      align-items: flex-end;
      transition: opacity 0.15s, transform 0.18s;
    }
    #optimhire-html-click-notification > div:first-child {
      background: #383C42;
      color: #fff;
      padding: 20px;
      border-radius: 13px;
      box-shadow: 0 6px 32px rgba(0,0,0,0.22);
      font-size: 15px;
      font-family: system-ui,Arial,sans-serif;
      width: 305px;
      text-align: left;
      display: flex;
      flex-direction: column;
      gap: 12px;
      position: relative;
    }
    #optimhire-html-click-notification > div:first-child > div[style*="position:absolute;"] {
      position: absolute;
      right: -17px;
      top: 35px;
      width: 0;
      height: 0;
      border-top: 11px solid transparent;
      border-bottom: 11px solid transparent;
      border-left: 18px solid #383C42;
      pointer-events: none;
    }
    #optimhire-html-msg {
      font-weight: 500;
      line-height: 1.35;
    }
    #optimhire-html-ok-btn {
      background: #247fd9;
      color: #fff;
      padding: 6px 18px;
      font-weight: 600;
      font-size: 13.5px;
      border: none;
      border-radius: 7px;
      box-shadow: 0 2px 6px #1b4e8822;
      margin-top: 5px;
      margin-right: auto;
      cursor: pointer;
      display: inline-block;
    }
    #optimhire-html-click-notification > div:last-child {
      margin-left: 20px;
      margin-bottom: 45px;
      position: relative;
      z-index: 1;
    }
    #optimhire-html-profile-img {
      display: block;
      width: 54px;
      height: 54px;
      border-radius: 50%;
      box-shadow: 0 3px 10px rgba(44,49,55,0.22);
      border: 4px solid #fff;
      background: #f4f4f4;
    }
    #optimhire-html-close-btn {
      position: absolute;
      left: 18px;
      top: 13px;
      width: 56px;
      height: 56px;
      background: #333;
      border: none;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 2147483644;
    }
  `;let i=`
    <div id="optimhire-html-click-notification-backdrop">
      <button type="button"
              id="optimhire-html-close-btn"
              class="ignore-one-minute-backdrop"
              aria-label="Close notification">
        <svg width="40" height="40" viewBox="0 0 40 40" style="display:block" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="20" cy="20" r="20" fill="#333"/>
          <line x1="12" y1="12" x2="28" y2="28" stroke="#fff" stroke-width="5.5" stroke-linecap="round"/>
          <line x1="28" y1="12" x2="12" y2="28" stroke="#fff" stroke-width="5.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
    <div id="optimhire-html-click-notification">
      <div>
        <div style="position:absolute; right:-17px; top:35px; width:0; height:0;
          border-top:11px solid transparent; border-bottom:11px solid transparent; border-left:18px solid #383C42; pointer-events:none;"></div>
        <div id="optimhire-html-msg">Just give me a minute more to finish filling out the form.</div>
        <button id="optimhire-html-ok-btn"
                class="ignore-one-minute-backdrop"
                type="button">
          OK
        </button>
      </div>
      <div>
        <img id="optimhire-html-profile-img"
             src=""
             alt="User"
             width="54"
             height="54"/>
      </div>
    </div>
  `;a.appendChild(o);let d=document.createElement("div");for(let e of(d.innerHTML=i,Array.from(d.childNodes)))a.appendChild(e);let s=a.getElementById("optimhire-html-profile-img");if(s)try{s.src=chrome.runtime.getURL("assets/icon.png")}catch(e){}},s=()=>{if(!a)return;let e=a.getElementById("optimhire-html-click-notification");e&&(e.style.display="none")},p=(e=!0)=>{e&&localStorage.removeItem("setOneMinuteBackdrop");let t=document.querySelector(`#${l}`);setTimeout(()=>{t&&(t?.remove(),a=null);let e=document.getElementById("optimhire-one-minute-dialog");e&&(e.close(),e.remove())},200)},c=(e,t)=>{if(!a)return;let o=a.getElementById("optimhire-html-click-notification"),i=a.getElementById("optimhire-html-click-notification-backdrop");if(!o||!i)return;let r=e-40,n=t-10,l=Math.max(window.innerWidth,document.documentElement.clientWidth),d=Math.max(window.innerHeight,document.documentElement.clientHeight);r=Math.min(r=Math.max(r,195),l-160-45),n=Math.min(n=Math.max(n,178),d-24),o.style.left=`${r}px`,o.style.top=`${n}px`,o.style.opacity="0",o.style.transform="translate(-50%, -120%)",o.style.display="flex",i.style.display="block",requestAnimationFrame(()=>{o.style.opacity="1",o.style.transform="translate(-50%, -100%)"})},m=()=>{"true"===localStorage.getItem("setOneMinuteBackdrop")&&setTimeout(()=>{let e=document.querySelector(r.OPTIMHIRE_CONFIG.iframeId.ignore);if(e){p(!1);return}d();let t=a?.getElementById("optimhire-html-click-notification-backdrop");t&&(t.style.display="block")},100)}},{"~config/optimhire":"h1TGN","~helper/injectCustomUI":"kJGNf","@parcel/transformer-js/src/esmodule-helpers.js":"fRZO2"}],h1TGN:[function(e,t,o){var i=e("@parcel/transformer-js/src/esmodule-helpers.js");i.defineInteropFlag(o),i.export(o,"GLOBAL_SUBAPP_URL",()=>n),i.export(o,"SERVICE_LOG",()=>l),i.export(o,"CONTENT_LOG",()=>a),i.export(o,"STOP_INJECT_POPUP",()=>d),i.export(o,"IS_PROD",()=>s),i.export(o,"OPTIMHIRE_CONFIG",()=>p);let r="https://optimhire.com",n="https://*.optimhire.com/*",l=!0,a=!0,d=!1,s=!0,p={urls:{login:r+"/d/login",signup:r+"/d/signup",dashboard:r+"/dashboard",help:r+"/help",privacy:r+"/privacy",copilotSetup:r+"/d/copilot-form/1",upgrade:r+"/d/my-jobs?q=upgrade_copilot_plan",missingQuestions:r+"/d/screening-questions",myJobs:r+"/d/my-jobs",jobApply:r+"/d/job-apply",SearchJob:r+"/d/Search-job/",appURL:r,upgradeMembership:r+"/d/membership",upgradeMembershipModel:r+"/d/membership?openUpgradePlan=1",referralurl:r+"/d/my-jobs?openReferEarn=1",feedbackUrl:r+"/d/job-auto-applier-uninstall-feedback",updatepluginUrl:"chrome://extensions/",jobPostUrl:r+"/d/jv/",myResumes:r+"/d/my-resumes",howItWorkUrl:"https://help.optimhire.com/how-to-use-the-optimhire-ai-job-auto-applier-extension/",whyOptimHireUrl:"https://help.optimhire.com/why-use-the-optimhire-ai-job-auto-applier/"},api:{baseUrl:r+"/api/v1",authTokenKey:"Talent_Auth_Token",candidateId:"developer_id"},support:{phone1:"+1 (415) 525 1604",phone2:"+1 (415) 718 7963",email:"support@optimhire.com"},extension:{version:"0.0.1",name:"OptimHire Copilot"},popup:{width:360},autoApply:{autoSkipDuration:180,loginWaitDuration:600,pageLoadDelay:3e3,mockDataType:"complex"},storage:{keys:{appliedCount:"appliedCount",autoApplyState:"autoApplyState",candidateDetails:"candidateDetails",preferredJobsite:"preferredJobsite"}},messages:{types:{stateUpdate:"AUTO_APPLY_STATE_UPDATE",candidateLoaded:"CANDIDATE_DETAILS_LOADED",authError:"AUTH_ERROR",autofillCompleted:"AUTOFILL_COMPLETED",formSubmitted:"FORM_SUBMITTED",complexFormError:"COMPLEX_FORM_ERROR",stopSkipTimer:"STOP_SKIP_TIMER"}},applicationStatus:{codes:{success:"1",error:"2",skipped:"4",notProcessed:"0",jobClosed:"3"}},appCookie:{isPilotRunning:"isPilotRunning",at:"at",did:"did"},liveATS:{indeed:"Indeed",lever:"Lever",greenhouse:"Greenhouse",manatal:"Manatal",breezyhr:"BreezyHR",jazzhr:"JazzHR",dice:"Dice",workable:"Workable",workday:"Workday",ziprecruiter:"ZipRecruiter",ziprecruiterpaid:"ZipRecruiter",jobvite:"Jobvite",paylocity:"Paylocity",ashby:"Ashby",bamboohr:"BambooHR",linkedin:"LinkedIn",adzuna:"Adzuna",adzunapaid:"Adzuna",smartrecruiters:"SmartRecruiters",freshteam:"Freshteam",recruitee:"Recruitee",recooty:"Recooty",gohire:"GoHire",rippling:"Rippling"},supportedJobBoardDomains:["indeed.com","lever.co","greenhouse.io","manatal.com","breezy.hr","breezyhr.com","jazz.co","jazzhr.com","dice.com","workable.com","myworkdayjobs.com","workday.com","ziprecruiter.com","jobvite.com","paylocity.com","ashbyhq.com","bamboohr.com","linkedin.com","adzuna.com","smartrecruiters.com","freshteam.com","recruitee.com","recooty.com","gohire.io","rippling.com"],iframeId:{optimhireMissingDetails:"optimhire-missing-details",confinityWelcomeScreen:"confinity-welcome-screen",optimhireResumeScoreRecord:"optimhire-resume-score-record",optimhireQueastionCoverLetter:"optimhire-queastion-cover-letter",optimhireUnlockAutofill:"optimhire-unlock-autofill",ignore:"#optimhire-missing-details, #optimhire-toast-shadow-host, #optimhire-resume-score-record, #optimhire-queastion-cover-letter, #optimhire-unlock-autofill"},free_credits:2,subscription:{free:"free",paid:"paid",expired:"expired"},ifremAllowedATSList:['iframe[id="grnhse_iframe"]','iframe[class*="gohire_iframe"]','iframe[class*="comeet-iframe"]:not([class*="comeet-social"])','iframe[src*="job-boards.greenhouse.io/embed"]']}},{"@parcel/transformer-js/src/esmodule-helpers.js":"fRZO2"}],fRZO2:[function(e,t,o){o.interopDefault=function(e){return e&&e.__esModule?e:{default:e}},o.defineInteropFlag=function(e){Object.defineProperty(e,"__esModule",{value:!0})},o.exportAll=function(e,t){return Object.keys(e).forEach(function(o){"default"===o||"__esModule"===o||t.hasOwnProperty(o)||Object.defineProperty(t,o,{enumerable:!0,get:function(){return e[o]}})}),t},o.export=function(e,t,o){Object.defineProperty(e,t,{enumerable:!0,get:o})}},{}],kJGNf:[function(e,t,o){var i=e("@parcel/transformer-js/src/esmodule-helpers.js");i.defineInteropFlag(o),i.export(o,"injectMissingDetailsUI",()=>l),i.export(o,"injectResumeScoreRecordUI",()=>a),i.export(o,"injectResumeCoverLetterUI",()=>d),i.export(o,"injectConfinityScreenUI",()=>s),i.export(o,"injectUnlockAutofillModalUI",()=>p),i.export(o,"isDialogPopupOrNot",()=>m);var r=e("~config/optimhire"),n=e("~contents/clickNotification");let l=()=>{if(r.STOP_INJECT_POPUP||((0,n.removeHtmlNotificationAndBackdrop)(!1),document.getElementById(r.OPTIMHIRE_CONFIG.iframeId.optimhireMissingDetails)))return;let e=document.createElement("iframe");e.id=r.OPTIMHIRE_CONFIG.iframeId.optimhireMissingDetails,e.src=chrome.runtime.getURL("tabs/missingDetails.html"),e.style.position="fixed",e.style.top="0",e.style.left="0",e.style.width="100%",e.style.height="100%",e.style.border="none",e.style.zIndex="2147483647",e.style.background="transparent",document.body.style.overflow="hidden",c(e)},a=async()=>{if(r.STOP_INJECT_POPUP||((0,n.removeHtmlNotificationAndBackdrop)(!1),document.getElementById(r.OPTIMHIRE_CONFIG.iframeId.optimhireResumeScoreRecord)))return;let{candidateDetails:e,active_copilot_job_id:t,complexFormData:o,manualComplexInstructions:i}=await chrome.storage.local.get(["candidateDetails","active_copilot_job_id","complexFormData","manualComplexInstructions"]),l=document.createElement("iframe");return l.id=r.OPTIMHIRE_CONFIG.iframeId.optimhireResumeScoreRecord,l.src=chrome.runtime.getURL("tabs/resumeScoreRecord.html"),l.style.position="fixed",l.style.top="0",l.style.left="0",l.style.width="100%",l.style.height="100%",l.style.border="none",l.style.zIndex="2147483647",l.style.background="transparent",document.body.style.overflow="hidden",c(l),l.addEventListener("load",()=>{setTimeout(()=>{l.contentWindow?.postMessage({type:"INIT_RESUME_SCORE_RECORD_DATA",payload:{candidateDetails:e,active_copilot_job_id:t,complexFormData:o||i}},"*")},500)}),null},d=()=>{if(r.STOP_INJECT_POPUP||((0,n.removeHtmlNotificationAndBackdrop)(!1),document.getElementById(r.OPTIMHIRE_CONFIG.iframeId.optimhireQueastionCoverLetter)))return;let e=document.createElement("iframe");e.id=r.OPTIMHIRE_CONFIG.iframeId.optimhireQueastionCoverLetter,e.src=chrome.runtime.getURL("tabs/coverLetter.html"),e.style.position="fixed",e.style.top="0",e.style.left="0",e.style.width="100%",e.style.height="100%",e.style.border="none",e.style.zIndex="2147483647",e.style.background="transparent",document.body.style.overflow="hidden",c(e)},s=()=>{if((0,n.removeHtmlNotificationAndBackdrop)(),document.getElementById(r.OPTIMHIRE_CONFIG.iframeId.confinityWelcomeScreen))return;let e=document.createElement("iframe");e.id=r.OPTIMHIRE_CONFIG.iframeId.confinityWelcomeScreen,e.src=chrome.runtime.getURL("tabs/trackerPages.html"),e.style.position="fixed",e.style.top="0",e.style.left="0",e.style.width="100%",e.style.height="100%",e.style.border="none",e.style.zIndex="2147483647",e.style.background="transparent",document.body.style.overflow="hidden",c(e)},p=()=>{if(r.STOP_INJECT_POPUP)return;(0,n.removeHtmlNotificationAndBackdrop)(!1);let e=r.OPTIMHIRE_CONFIG.iframeId.optimhireUnlockAutofill;if(document.getElementById(e))return;let t=document.createElement("iframe");t.id=e,t.src=chrome.runtime.getURL("tabs/unlockAutofillModal.html"),t.style.position="fixed",t.style.top="0",t.style.left="0",t.style.width="100%",t.style.height="100%",t.style.border="none",t.style.zIndex="2147483647",t.style.background="transparent",document.body.style.overflow="hidden",c(t)},c=e=>{if(m()){let t=document.createElement("dialog");t.id="optimhire-apply-dialog",document.body.appendChild(t),t.appendChild(e),t.showModal()}else document.body.appendChild(e)},m=()=>{if(location.host.indexOf("linkedin.com")>-1){let e=document.querySelector('button[aria-label*="Apply to this job"]');return!!e&&"BUTTON"===e.tagName}return!1}},{"~config/optimhire":"h1TGN","~contents/clickNotification":"isG7X","@parcel/transformer-js/src/esmodule-helpers.js":"fRZO2"}]},["isG7X"],"isG7X","parcelRequire46b6"),globalThis.define=t;