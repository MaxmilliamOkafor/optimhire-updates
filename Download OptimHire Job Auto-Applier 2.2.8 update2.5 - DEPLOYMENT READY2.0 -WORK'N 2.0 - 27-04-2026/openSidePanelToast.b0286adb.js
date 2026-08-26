var e,t;"function"==typeof(e=globalThis.define)&&(t=e,e=null),function(t,o,i,r,n){var a="undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:"undefined"!=typeof window?window:"undefined"!=typeof global?global:{},l="function"==typeof a[r]&&a[r],s=l.cache||{},d="undefined"!=typeof module&&"function"==typeof module.require&&module.require.bind(module);function p(e,o){if(!s[e]){if(!t[e]){var i="function"==typeof a[r]&&a[r];if(!o&&i)return i(e,!0);if(l)return l(e,!0);if(d&&"string"==typeof e)return d(e);var n=Error("Cannot find module '"+e+"'");throw n.code="MODULE_NOT_FOUND",n}c.resolve=function(o){var i=t[e][1][o];return null!=i?i:o},c.cache={};var m=s[e]=new p.Module(e);t[e][0].call(m.exports,c,m,m.exports,this)}return s[e].exports;function c(e){var t=c.resolve(e);return!1===t?{}:p(t)}}p.isParcelRequire=!0,p.Module=function(e){this.id=e,this.bundle=p,this.exports={}},p.modules=t,p.cache=s,p.parent=l,p.register=function(e,o){t[e]=[function(e,t){t.exports=o},{}]},Object.defineProperty(p,"root",{get:function(){return a[r]}}),a[r]=p;for(var m=0;m<o.length;m++)p(o[m]);if(i){var c=p(i);"object"==typeof exports&&"undefined"!=typeof module?module.exports=c:"function"==typeof e&&e.amd?e(function(){return c}):n&&(this[n]=c)}}({"6YFM9":[function(e,t,o){var i=e("@parcel/transformer-js/src/esmodule-helpers.js");i.defineInteropFlag(o),i.export(o,"removeToast",()=>a),i.export(o,"showToast",()=>l),i.export(o,"sendMessageToSidePanelOrNotify",()=>s);var r=e("../helper/runtimeMessaging"),n=e("./clickNotification");let a=()=>{try{let e=document.getElementById("optimhire-toast-shadow-host");e&&e.parentNode&&e.parentNode.removeChild(e);let t=document.getElementById("optimhire-toaster");t&&t.parentNode&&t.parentNode.removeChild(t);let o=document.getElementById("optimhire-toast-backdrop");o&&o.parentNode&&o.parentNode.removeChild(o)}catch(e){}},l=()=>{let e=document.getElementById("optimhire-toast-shadow-host");if(e)return e;try{let e=document.createElement("div");e.id="optimhire-toast-shadow-host",e.style.position="fixed",e.style.top="0",e.style.left="0",e.style.width="100vw",e.style.height="100vh",e.style.zIndex="2147483647";let t=e.attachShadow({mode:"open"}),o=document.createElement("div");o.id="optimhire-toast-backdrop",o.setAttribute("style",`
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background: rgba(0,0,0,0.34) !important;
            z-index: 2147483647 !important;
            pointer-events: none !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
        `);let i=document.createElement("div");i.id="optimhire-toaster",Object.assign(i.style,{position:"fixed",top:"24px",left:"50%",transform:"translateX(-50%)",width:"598px",height:"400px",minWidth:"598px",maxWidth:"598px",minHeight:"400px",maxHeight:"400px",boxShadow:"0 6px 24px rgba(60,72,88,0.14), 0 1.5px 4px rgba(44,62,80,0.16)",background:"#fff",border:"1.2px solid #2196f3",borderRadius:"16px",zIndex:"2147483647",padding:"30px",transition:"opacity 0.25s, transform 0.24s cubic-bezier(.45,0,.2,1)",opacity:"1",pointerEvents:"auto",fontFamily:"system-ui, Arial, sans-serif",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",textAlign:"center",boxSizing:"border-box"}),i.innerHTML=`
        <div
          style="
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            cursor: pointer !important;
            box-sizing: border-box !important;
            text-align: center !important;
            height: 100% !important;
            position: relative !important;
            width: 100% !important;
            z-index: 2 !important;
          "
        >
          <img
            src="${chrome.runtime.getURL("assets/logo-wide.svg")}"
            alt="icon"
            style="
              border-radius: 20px !important;
              box-sizing: border-box !important;
              margin-bottom: 26px !important;
              display: block !important;
              margin-left: auto !important;
              margin-right: auto !important;
              width: 265px !important;
            "
          />
          <div style="display: flex !important; flex-direction: column !important; align-items: center !important;">
            <span
              style="
                font-size: 23px !important;
                font-weight: 700 !important;
                color: red !important;
                letter-spacing: 0.12px !important;
                font-family: system-ui, Arial, sans-serif !important;
                margin-bottom: 25px !important;
                text-align: center !important;
              "
            >
              Action required
            </span>
            <span
              style="
                font-size: 16px !important;
                font-weight: 600 !important;
                color: #000000 !important;
                font-family: system-ui, Arial, sans-serif !important;
                text-align: center !important;
                margin-bottom: 40px !important;
                width: 368px !important;
                line-height: 1.5 !important;
              "
            >
              Please click the button below to open OptimHire's side panel.
            </span>
          </div>
          <button
            id="optimhire-toast-button"
            style="
              padding: 15px 40px !important;
              font-size: 15px !important;
              font-weight: 600 !important;
              background: #2196f3 !important;
              border-radius: 8px !important;
              border: none !important;
              color: #fff !important;
              cursor: pointer !important;
              box-shadow: 0px 2px 8px 0 rgba(60, 72, 88, 0.14) !important;
              transition: background 0.18s !important;
              outline: none !important;
              font-family: system-ui, Arial, sans-serif !important;
            "
          >
            Open Side Panel
          </button>
        </div>
      `;try{i.animate([{opacity:0,transform:"translateX(-50%) translateY(-24px)"},{opacity:1,transform:"translateX(-50%) translateY(0)"}],{duration:260,fill:"forwards",easing:"cubic-bezier(.33,2,.36,.99)"})}catch(e){}t.appendChild(o),t.appendChild(i);let l=document.documentElement?document.documentElement:document.body;return l?l.appendChild(e):document.body.appendChild(e),(0,n.removeHtmlNotificationAndBackdrop)(!1),i.addEventListener("click",()=>{try{(0,r.sendRuntimeMessage)({action:"OPEN_SIDE_PANEL_BY_TOAST_CLICK"})}catch(e){}try{i.animate([{opacity:1,transform:"translateX(-50%) translateY(0)"},{opacity:0,transform:"translateX(-50%) translateY(-32px)"}],{duration:220,fill:"forwards",easing:"ease"})}catch(e){}setTimeout(()=>{a()},240)}),setTimeout(()=>{try{i.animate([{opacity:1,transform:"translateX(-50%) translateY(0)"},{opacity:0,transform:"translateX(-50%) translateY(-32px)"}],{duration:220,fill:"forwards",easing:"ease"})}catch(e){}setTimeout(()=>{a()},240)},36e5),e}catch(e){console.log("Error showing toast:",e)}},s=async()=>{try{let{copilotTabId:e}=await chrome.storage.local.get("copilotTabId");if(!e)return;(0,r.sendRuntimeMessageCallback)({type:"IS_PANEL_OPEN"},e=>{!chrome.runtime.lastError&&e&&e.is_panel_open||l()})}catch(e){console.log("Error sending message to side panel or notify:",e);return}}},{"../helper/runtimeMessaging":"HtSZt","./clickNotification":"isG7X","@parcel/transformer-js/src/esmodule-helpers.js":"fRZO2"}],HtSZt:[function(e,t,o){var i=e("@parcel/transformer-js/src/esmodule-helpers.js");i.defineInteropFlag(o),i.export(o,"sendRuntimeMessage",()=>r),i.export(o,"sendRuntimeMessageAsync",()=>n),i.export(o,"sendRuntimeMessageCallback",()=>a);let r=e=>{try{if(!chrome?.runtime?.sendMessage)return;chrome.runtime.sendMessage(e).catch(()=>void 0)}catch(e){}},n=async e=>{try{return await chrome.runtime.sendMessage(e)}catch{return}},a=(e,t)=>{chrome.runtime.sendMessage(e,t)}},{"@parcel/transformer-js/src/esmodule-helpers.js":"fRZO2"}],fRZO2:[function(e,t,o){o.interopDefault=function(e){return e&&e.__esModule?e:{default:e}},o.defineInteropFlag=function(e){Object.defineProperty(e,"__esModule",{value:!0})},o.exportAll=function(e,t){return Object.keys(e).forEach(function(o){"default"===o||"__esModule"===o||t.hasOwnProperty(o)||Object.defineProperty(t,o,{enumerable:!0,get:function(){return e[o]}})}),t},o.export=function(e,t,o){Object.defineProperty(e,t,{enumerable:!0,get:o})}},{}],isG7X:[function(e,t,o){var i=e("@parcel/transformer-js/src/esmodule-helpers.js");i.defineInteropFlag(o),i.export(o,"createNotificationHtmlBase",()=>s),i.export(o,"hideHtmlNotificationOnly",()=>d),i.export(o,"removeHtmlNotificationAndBackdrop",()=>p),i.export(o,"showHtmlNotificationAt",()=>m),i.export(o,"showFormFillingProcessNotification",()=>c);var r=e("~config/optimhire"),n=e("~helper/injectCustomUI");let a="optimhire-shadow-container",l=null,s=()=>{if(r.STOP_INJECT_POPUP||document.getElementById(a))return;let e=document.createElement("div");e.id=a,e.style.position="absolute",e.style.top="0",e.style.left="0",e.style.zIndex="2147483640";let t=document.documentElement?document.documentElement:document.body;if(t){if((0,n.isDialogPopupOrNot)()){let o=document.createElement("dialog");o.id="optimhire-one-minute-dialog",t.appendChild(o),o.appendChild(e),o.showModal()}else t.appendChild(e)}else if((0,n.isDialogPopupOrNot)()){let t=document.createElement("dialog");t.id="optimhire-one-minute-dialog",document.body.appendChild(t),t.appendChild(e),t.showModal()}else document.body.appendChild(e);l=e.attachShadow({mode:"open"});let o=document.createElement("style");o.textContent=`
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
  `;l.appendChild(o);let s=document.createElement("div");for(let e of(s.innerHTML=i,Array.from(s.childNodes)))l.appendChild(e);let d=l.getElementById("optimhire-html-profile-img");if(d)try{d.src=chrome.runtime.getURL("assets/icon.png")}catch(e){}},d=()=>{if(!l)return;let e=l.getElementById("optimhire-html-click-notification");e&&(e.style.display="none")},p=(e=!0)=>{e&&localStorage.removeItem("setOneMinuteBackdrop");let t=document.querySelector(`#${a}`);setTimeout(()=>{t&&(t?.remove(),l=null);let e=document.getElementById("optimhire-one-minute-dialog");e&&(e.close(),e.remove())},200)},m=(e,t)=>{if(!l)return;let o=l.getElementById("optimhire-html-click-notification"),i=l.getElementById("optimhire-html-click-notification-backdrop");if(!o||!i)return;let r=e-40,n=t-10,a=Math.max(window.innerWidth,document.documentElement.clientWidth),s=Math.max(window.innerHeight,document.documentElement.clientHeight);r=Math.min(r=Math.max(r,195),a-160-45),n=Math.min(n=Math.max(n,178),s-24),o.style.left=`${r}px`,o.style.top=`${n}px`,o.style.opacity="0",o.style.transform="translate(-50%, -120%)",o.style.display="flex",i.style.display="block",requestAnimationFrame(()=>{o.style.opacity="1",o.style.transform="translate(-50%, -100%)"})},c=()=>{"true"===localStorage.getItem("setOneMinuteBackdrop")&&setTimeout(()=>{let e=document.querySelector(r.OPTIMHIRE_CONFIG.iframeId.ignore);if(e){p(!1);return}s();let t=l?.getElementById("optimhire-html-click-notification-backdrop");t&&(t.style.display="block")},100)}},{"~config/optimhire":"h1TGN","~helper/injectCustomUI":"kJGNf","@parcel/transformer-js/src/esmodule-helpers.js":"fRZO2"}],h1TGN:[function(e,t,o){var i=e("@parcel/transformer-js/src/esmodule-helpers.js");i.defineInteropFlag(o),i.export(o,"GLOBAL_SUBAPP_URL",()=>n),i.export(o,"SERVICE_LOG",()=>a),i.export(o,"CONTENT_LOG",()=>l),i.export(o,"STOP_INJECT_POPUP",()=>s),i.export(o,"IS_PROD",()=>d),i.export(o,"OPTIMHIRE_CONFIG",()=>p);let r="https://optimhire.com",n="https://*.optimhire.com/*",a=!0,l=!0,s=!1,d=!0,p={urls:{login:r+"/d/login",signup:r+"/d/signup",dashboard:r+"/dashboard",help:r+"/help",privacy:r+"/privacy",copilotSetup:r+"/d/copilot-form/1",upgrade:r+"/d/my-jobs?q=upgrade_copilot_plan",missingQuestions:r+"/d/screening-questions",myJobs:r+"/d/my-jobs",jobApply:r+"/d/job-apply",SearchJob:r+"/d/Search-job/",appURL:r,upgradeMembership:r+"/d/membership",upgradeMembershipModel:r+"/d/membership?openUpgradePlan=1",referralurl:r+"/d/my-jobs?openReferEarn=1",feedbackUrl:r+"/d/job-auto-applier-uninstall-feedback",updatepluginUrl:"chrome://extensions/",jobPostUrl:r+"/d/jv/",myResumes:r+"/d/my-resumes",howItWorkUrl:"https://help.optimhire.com/how-to-use-the-optimhire-ai-job-auto-applier-extension/",whyOptimHireUrl:"https://help.optimhire.com/why-use-the-optimhire-ai-job-auto-applier/"},api:{baseUrl:r+"/api/v1",authTokenKey:"Talent_Auth_Token",candidateId:"developer_id"},support:{phone1:"+1 (415) 525 1604",phone2:"+1 (415) 718 7963",email:"support@optimhire.com"},extension:{version:"0.0.1",name:"OptimHire Copilot"},popup:{width:360},autoApply:{autoSkipDuration:180,loginWaitDuration:600,pageLoadDelay:3e3,mockDataType:"complex"},storage:{keys:{appliedCount:"appliedCount",autoApplyState:"autoApplyState",candidateDetails:"candidateDetails",preferredJobsite:"preferredJobsite"}},messages:{types:{stateUpdate:"AUTO_APPLY_STATE_UPDATE",candidateLoaded:"CANDIDATE_DETAILS_LOADED",authError:"AUTH_ERROR",autofillCompleted:"AUTOFILL_COMPLETED",formSubmitted:"FORM_SUBMITTED",complexFormError:"COMPLEX_FORM_ERROR",stopSkipTimer:"STOP_SKIP_TIMER"}},applicationStatus:{codes:{success:"1",error:"2",skipped:"4",notProcessed:"0",jobClosed:"3"}},appCookie:{isPilotRunning:"isPilotRunning",at:"at",did:"did"},liveATS:{indeed:"Indeed",lever:"Lever",greenhouse:"Greenhouse",manatal:"Manatal",breezyhr:"BreezyHR",jazzhr:"JazzHR",dice:"Dice",workable:"Workable",workday:"Workday",ziprecruiter:"ZipRecruiter",ziprecruiterpaid:"ZipRecruiter",jobvite:"Jobvite",paylocity:"Paylocity",ashby:"Ashby",bamboohr:"BambooHR",linkedin:"LinkedIn",adzuna:"Adzuna",adzunapaid:"Adzuna",smartrecruiters:"SmartRecruiters",freshteam:"Freshteam",recruitee:"Recruitee",recooty:"Recooty",gohire:"GoHire",rippling:"Rippling"},supportedJobBoardDomains:["indeed.com","lever.co","greenhouse.io","manatal.com","breezy.hr","breezyhr.com","jazz.co","jazzhr.com","dice.com","workable.com","myworkdayjobs.com","workday.com","ziprecruiter.com","jobvite.com","paylocity.com","ashbyhq.com","bamboohr.com","linkedin.com","adzuna.com","smartrecruiters.com","freshteam.com","recruitee.com","recooty.com","gohire.io","rippling.com"],iframeId:{optimhireMissingDetails:"optimhire-missing-details",confinityWelcomeScreen:"confinity-welcome-screen",optimhireResumeScoreRecord:"optimhire-resume-score-record",optimhireQueastionCoverLetter:"optimhire-queastion-cover-letter",optimhireUnlockAutofill:"optimhire-unlock-autofill",ignore:"#optimhire-missing-details, #optimhire-toast-shadow-host, #optimhire-resume-score-record, #optimhire-queastion-cover-letter, #optimhire-unlock-autofill"},free_credits:2,subscription:{free:"free",paid:"paid",expired:"expired"},ifremAllowedATSList:['iframe[id="grnhse_iframe"]','iframe[class*="gohire_iframe"]','iframe[class*="comeet-iframe"]:not([class*="comeet-social"])','iframe[src*="job-boards.greenhouse.io/embed"]']}},{"@parcel/transformer-js/src/esmodule-helpers.js":"fRZO2"}],kJGNf:[function(e,t,o){var i=e("@parcel/transformer-js/src/esmodule-helpers.js");i.defineInteropFlag(o),i.export(o,"injectMissingDetailsUI",()=>a),i.export(o,"injectResumeScoreRecordUI",()=>l),i.export(o,"injectResumeCoverLetterUI",()=>s),i.export(o,"injectConfinityScreenUI",()=>d),i.export(o,"injectUnlockAutofillModalUI",()=>p),i.export(o,"isDialogPopupOrNot",()=>c);var r=e("~config/optimhire"),n=e("~contents/clickNotification");let a=()=>{if(r.STOP_INJECT_POPUP||((0,n.removeHtmlNotificationAndBackdrop)(!1),document.getElementById(r.OPTIMHIRE_CONFIG.iframeId.optimhireMissingDetails)))return;let e=document.createElement("iframe");e.id=r.OPTIMHIRE_CONFIG.iframeId.optimhireMissingDetails,e.src=chrome.runtime.getURL("tabs/missingDetails.html"),e.style.position="fixed",e.style.top="0",e.style.left="0",e.style.width="100%",e.style.height="100%",e.style.border="none",e.style.zIndex="2147483647",e.style.background="transparent",document.body.style.overflow="hidden",m(e)},l=async()=>{if(r.STOP_INJECT_POPUP||((0,n.removeHtmlNotificationAndBackdrop)(!1),document.getElementById(r.OPTIMHIRE_CONFIG.iframeId.optimhireResumeScoreRecord)))return;let{candidateDetails:e,active_copilot_job_id:t,complexFormData:o,manualComplexInstructions:i}=await chrome.storage.local.get(["candidateDetails","active_copilot_job_id","complexFormData","manualComplexInstructions"]),a=document.createElement("iframe");return a.id=r.OPTIMHIRE_CONFIG.iframeId.optimhireResumeScoreRecord,a.src=chrome.runtime.getURL("tabs/resumeScoreRecord.html"),a.style.position="fixed",a.style.top="0",a.style.left="0",a.style.width="100%",a.style.height="100%",a.style.border="none",a.style.zIndex="2147483647",a.style.background="transparent",document.body.style.overflow="hidden",m(a),a.addEventListener("load",()=>{setTimeout(()=>{a.contentWindow?.postMessage({type:"INIT_RESUME_SCORE_RECORD_DATA",payload:{candidateDetails:e,active_copilot_job_id:t,complexFormData:o||i}},"*")},500)}),null},s=()=>{if(r.STOP_INJECT_POPUP||((0,n.removeHtmlNotificationAndBackdrop)(!1),document.getElementById(r.OPTIMHIRE_CONFIG.iframeId.optimhireQueastionCoverLetter)))return;let e=document.createElement("iframe");e.id=r.OPTIMHIRE_CONFIG.iframeId.optimhireQueastionCoverLetter,e.src=chrome.runtime.getURL("tabs/coverLetter.html"),e.style.position="fixed",e.style.top="0",e.style.left="0",e.style.width="100%",e.style.height="100%",e.style.border="none",e.style.zIndex="2147483647",e.style.background="transparent",document.body.style.overflow="hidden",m(e)},d=()=>{if((0,n.removeHtmlNotificationAndBackdrop)(),document.getElementById(r.OPTIMHIRE_CONFIG.iframeId.confinityWelcomeScreen))return;let e=document.createElement("iframe");e.id=r.OPTIMHIRE_CONFIG.iframeId.confinityWelcomeScreen,e.src=chrome.runtime.getURL("tabs/trackerPages.html"),e.style.position="fixed",e.style.top="0",e.style.left="0",e.style.width="100%",e.style.height="100%",e.style.border="none",e.style.zIndex="2147483647",e.style.background="transparent",document.body.style.overflow="hidden",m(e)},p=()=>{if(r.STOP_INJECT_POPUP)return;(0,n.removeHtmlNotificationAndBackdrop)(!1);let e=r.OPTIMHIRE_CONFIG.iframeId.optimhireUnlockAutofill;if(document.getElementById(e))return;let t=document.createElement("iframe");t.id=e,t.src=chrome.runtime.getURL("tabs/unlockAutofillModal.html"),t.style.position="fixed",t.style.top="0",t.style.left="0",t.style.width="100%",t.style.height="100%",t.style.border="none",t.style.zIndex="2147483647",t.style.background="transparent",document.body.style.overflow="hidden",m(t)},m=e=>{if(c()){let t=document.createElement("dialog");t.id="optimhire-apply-dialog",document.body.appendChild(t),t.appendChild(e),t.showModal()}else document.body.appendChild(e)},c=()=>{if(location.host.indexOf("linkedin.com")>-1){let e=document.querySelector('button[aria-label*="Apply to this job"]');return!!e&&"BUTTON"===e.tagName}return!1}},{"~config/optimhire":"h1TGN","~contents/clickNotification":"isG7X","@parcel/transformer-js/src/esmodule-helpers.js":"fRZO2"}]},["6YFM9"],"6YFM9","parcelRequire46b6"),globalThis.define=t;