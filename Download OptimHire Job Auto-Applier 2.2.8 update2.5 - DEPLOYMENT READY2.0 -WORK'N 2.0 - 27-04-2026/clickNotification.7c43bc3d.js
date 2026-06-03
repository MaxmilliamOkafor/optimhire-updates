var e,t;"function"==typeof(e=globalThis.define)&&(t=e,e=null),function(t,i,o,r,n){var l="undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:"undefined"!=typeof window?window:"undefined"!=typeof global?global:{},a="function"==typeof l[r]&&l[r],p=a.cache||{},s="undefined"!=typeof module&&"function"==typeof module.require&&module.require.bind(module);function d(e,i){if(!p[e]){if(!t[e]){var o="function"==typeof l[r]&&l[r];if(!i&&o)return o(e,!0);if(a)return a(e,!0);if(s&&"string"==typeof e)return s(e);var n=Error("Cannot find module '"+e+"'");throw n.code="MODULE_NOT_FOUND",n}m.resolve=function(i){var o=t[e][1][i];return null!=o?o:i},m.cache={};var c=p[e]=new d.Module(e);t[e][0].call(c.exports,m,c,c.exports,this)}return p[e].exports;function m(e){var t=m.resolve(e);return!1===t?{}:d(t)}}d.isParcelRequire=!0,d.Module=function(e){this.id=e,this.bundle=d,this.exports={}},d.modules=t,d.cache=p,d.parent=a,d.register=function(e,i){t[e]=[function(e,t){t.exports=i},{}]},Object.defineProperty(d,"root",{get:function(){return l[r]}}),l[r]=d;for(var c=0;c<i.length;c++)d(i[c]);if(o){var m=d(o);"object"==typeof exports&&"undefined"!=typeof module?module.exports=m:"function"==typeof e&&e.amd?e(function(){return m}):n&&(this[n]=m)}}({isG7X:[function(e,t,i){var o=e("@parcel/transformer-js/src/esmodule-helpers.js");o.defineInteropFlag(i),o.export(i,"createNotificationHtmlBase",()=>a),o.export(i,"hideHtmlNotificationOnly",()=>p),o.export(i,"removeHtmlNotificationAndBackdrop",()=>s),o.export(i,"showHtmlNotificationAt",()=>d),o.export(i,"showFormFillingProcessNotification",()=>c);var r=e("~config/optimhire");let n="optimhire-shadow-container",l=null,a=()=>{if(r.STOP_INJECT_POPUP||document.getElementById(n))return;let e=document.createElement("div");e.id=n,e.style.position="absolute",e.style.top="0",e.style.left="0",e.style.zIndex="2147483640";let t=document.documentElement?document.documentElement:document.body;t?t.appendChild(e):document.body.appendChild(e),l=e.attachShadow({mode:"open"});let i=document.createElement("style");i.textContent=`
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
  `;let o=`
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
  `;l.appendChild(i);let a=document.createElement("div");for(let e of(a.innerHTML=o,Array.from(a.childNodes)))l.appendChild(e);let p=l.getElementById("optimhire-html-profile-img");if(p)try{p.src=chrome.runtime.getURL("assets/icon.png")}catch(e){}},p=()=>{if(!l)return;let e=l.getElementById("optimhire-html-click-notification");e&&(e.style.display="none")},s=(e=!0)=>{e&&(localStorage.removeItem("setFormFillingProcess"),localStorage.removeItem("setOneMinuteBackdrop")),localStorage.setItem("setFormFillingProcess","false");let t=document.querySelector(`#${n}`);setTimeout(()=>{t&&(t?.remove(),l=null)},200)},d=(e,t)=>{if(!l)return;let i=l.getElementById("optimhire-html-click-notification"),o=l.getElementById("optimhire-html-click-notification-backdrop");if(!i||!o)return;let r=e-40,n=t-10,a=Math.max(window.innerWidth,document.documentElement.clientWidth),p=Math.max(window.innerHeight,document.documentElement.clientHeight);r=Math.min(r=Math.max(r,195),a-160-45),n=Math.min(n=Math.max(n,178),p-24),i.style.left=`${r}px`,i.style.top=`${n}px`,i.style.opacity="0",i.style.transform="translate(-50%, -120%)",i.style.display="flex",o.style.display="block",requestAnimationFrame(()=>{i.style.opacity="1",i.style.transform="translate(-50%, -100%)"})},c=()=>{"true"===localStorage.getItem("setOneMinuteBackdrop")&&(localStorage.setItem("setFormFillingProcess","true"),setTimeout(()=>{let e=document.querySelector(r.OPTIMHIRE_CONFIG.iframeId.ignore);if(e){s(!1);return}a();let t=l?.getElementById("optimhire-html-click-notification-backdrop");t&&(t.style.display="block")},100))}},{"~config/optimhire":"h1TGN","@parcel/transformer-js/src/esmodule-helpers.js":"fRZO2"}],h1TGN:[function(e,t,i){var o=e("@parcel/transformer-js/src/esmodule-helpers.js");o.defineInteropFlag(i),o.export(i,"GLOBAL_SUBAPP_URL",()=>n),o.export(i,"SERVICE_LOG",()=>l),o.export(i,"CONTENT_LOG",()=>a),o.export(i,"STOP_INJECT_POPUP",()=>p),o.export(i,"OPTIMHIRE_CONFIG",()=>s);let r="https://optimhire.com",n="https://*.optimhire.com/*",l=!0,a=!0,p=!1,s={urls:{login:r+"/d/login",signup:r+"/d/signup",dashboard:r+"/dashboard",help:r+"/help",privacy:r+"/privacy",copilotSetup:r+"/d/copilot-form/1",upgrade:r+"/d/my-jobs?q=upgrade_copilot_plan",missingQuestions:r+"/d/screening-questions",myJobs:r+"/d/my-jobs",SearchJob:r+"/d/Search-job/",appURL:r,upgradeMembership:r+"/d/membership",upgradeMembershipModel:r+"/d/membership?openUpgradePlan=1",referralurl:r+"/d/my-jobs?openReferEarn=1",feedbackUrl:r+"/d/job-auto-applier-uninstall-feedback",updatepluginUrl:"chrome://extensions/",jobPostUrl:r+"/d/jv/",myResumes:r+"/d/my-resumes",howItWorkUrl:"https://help.optimhire.com/how-to-use-the-optimhire-ai-job-auto-applier-extension/",whyOptimHireUrl:"https://help.optimhire.com/why-use-the-optimhire-ai-job-auto-applier/"},api:{baseUrl:r+"/api/v1",authTokenKey:"Talent_Auth_Token",candidateId:"developer_id"},support:{phone1:"+1 (415) 525 1604",phone2:"+1 (415) 718 7963",email:"support@optimhire.com"},extension:{version:"0.0.1",name:"OptimHire Copilot"},popup:{width:360},autoApply:{autoSkipDuration:180,loginWaitDuration:600,pageLoadDelay:3e3,mockDataType:"complex"},storage:{keys:{appliedCount:"appliedCount",autoApplyState:"autoApplyState",candidateDetails:"candidateDetails",preferredJobsite:"preferredJobsite"}},messages:{types:{stateUpdate:"AUTO_APPLY_STATE_UPDATE",candidateLoaded:"CANDIDATE_DETAILS_LOADED",authError:"AUTH_ERROR",autofillCompleted:"AUTOFILL_COMPLETED",formSubmitted:"FORM_SUBMITTED",complexFormError:"COMPLEX_FORM_ERROR"}},applicationStatus:{codes:{success:"1",error:"2",skipped:"4",notProcessed:"0"}},appCookie:{isPilotRunning:"isPilotRunning",at:"at",did:"did"},liveATS:["indeed","lever","greenhouse","manatal","breezyhr","jazzhr","dice","workable","workday","ziprecruiter","ziprecruiterpaid","jobvite","paylocity","ashby","bamboohr","linkedin","adzuna","adzunapaid","smartrecruiters","freshteam","recruitee","recooty","goHire","rippling"],iframeId:{optimhireMissingDetails:"optimhire-missing-details",confinityWelcomeScreen:"confinity-welcome-screen",optimhireResumeScoreRecord:"optimhire-resume-score-record",optimhireQueastionCoverLetter:"optimhire-queastion-cover-letter",ignore:"#optimhire-missing-details, #optimhire-toast-shadow-host, #optimhire-resume-score-record, #optimhire-queastion-cover-letter"}}},{"@parcel/transformer-js/src/esmodule-helpers.js":"fRZO2"}],fRZO2:[function(e,t,i){i.interopDefault=function(e){return e&&e.__esModule?e:{default:e}},i.defineInteropFlag=function(e){Object.defineProperty(e,"__esModule",{value:!0})},i.exportAll=function(e,t){return Object.keys(e).forEach(function(i){"default"===i||"__esModule"===i||t.hasOwnProperty(i)||Object.defineProperty(t,i,{enumerable:!0,get:function(){return e[i]}})}),t},i.export=function(e,t,i){Object.defineProperty(e,t,{enumerable:!0,get:i})}},{}]},["isG7X"],"isG7X","parcelRequire46b6"),globalThis.define=t;