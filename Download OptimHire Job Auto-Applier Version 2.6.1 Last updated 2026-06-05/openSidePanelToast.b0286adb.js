var t,e;"function"==typeof(t=globalThis.define)&&(e=t,t=null),function(e,i,o,r,n){var a="undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:"undefined"!=typeof window?window:"undefined"!=typeof global?global:{},p="function"==typeof a[r]&&a[r],l=p.cache||{},s="undefined"!=typeof module&&"function"==typeof module.require&&module.require.bind(module);function d(t,i){if(!l[t]){if(!e[t]){var o="function"==typeof a[r]&&a[r];if(!i&&o)return o(t,!0);if(p)return p(t,!0);if(s&&"string"==typeof t)return s(t);var n=Error("Cannot find module '"+t+"'");throw n.code="MODULE_NOT_FOUND",n}c.resolve=function(i){var o=e[t][1][i];return null!=o?o:i},c.cache={};var m=l[t]=new d.Module(t);e[t][0].call(m.exports,c,m,m.exports,this)}return l[t].exports;function c(t){var e=c.resolve(t);return!1===e?{}:d(e)}}d.isParcelRequire=!0,d.Module=function(t){this.id=t,this.bundle=d,this.exports={}},d.modules=e,d.cache=l,d.parent=p,d.register=function(t,i){e[t]=[function(t,e){e.exports=i},{}]},Object.defineProperty(d,"root",{get:function(){return a[r]}}),a[r]=d;for(var m=0;m<i.length;m++)d(i[m]);if(o){var c=d(o);"object"==typeof exports&&"undefined"!=typeof module?module.exports=c:"function"==typeof t&&t.amd?t(function(){return c}):n&&(this[n]=c)}}({"6YFM9":[function(t,e,i){var o=t("@parcel/transformer-js/src/esmodule-helpers.js");o.defineInteropFlag(i),o.export(i,"removeToast",()=>n),o.export(i,"showToast",()=>a),o.export(i,"sendMessageToSidePanelOrNotify",()=>p);var r=t("./clickNotification");let n=()=>{try{let t=document.getElementById("optimhire-toast-shadow-host");t&&t.parentNode&&t.parentNode.removeChild(t);let e=document.getElementById("optimhire-toaster");e&&e.parentNode&&e.parentNode.removeChild(e);let i=document.getElementById("optimhire-toast-backdrop");i&&i.parentNode&&i.parentNode.removeChild(i)}catch(t){}},a=()=>{let t=document.getElementById("optimhire-toast-shadow-host");if(t)return t;try{let t=document.createElement("div");t.id="optimhire-toast-shadow-host",t.style.position="fixed",t.style.top="0",t.style.left="0",t.style.width="100vw",t.style.height="100vh",t.style.zIndex="2147483647";let e=t.attachShadow({mode:"open"}),i=document.createElement("div");i.id="optimhire-toast-backdrop",i.setAttribute("style",`
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
        `);let o=document.createElement("div");o.id="optimhire-toaster",Object.assign(o.style,{position:"fixed",top:"24px",left:"50%",transform:"translateX(-50%)",width:"598px",height:"400px",minWidth:"598px",maxWidth:"598px",minHeight:"400px",maxHeight:"400px",boxShadow:"0 6px 24px rgba(60,72,88,0.14), 0 1.5px 4px rgba(44,62,80,0.16)",background:"#fff",border:"1.2px solid #2196f3",borderRadius:"16px",zIndex:"2147483647",padding:"30px",transition:"opacity 0.25s, transform 0.24s cubic-bezier(.45,0,.2,1)",opacity:"1",pointerEvents:"auto",fontFamily:"system-ui, Arial, sans-serif",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",textAlign:"center",boxSizing:"border-box"}),o.innerHTML=`
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
      `;try{o.animate([{opacity:0,transform:"translateX(-50%) translateY(-24px)"},{opacity:1,transform:"translateX(-50%) translateY(0)"}],{duration:260,fill:"forwards",easing:"cubic-bezier(.33,2,.36,.99)"})}catch(t){}e.appendChild(i),e.appendChild(o);let a=document.documentElement?document.documentElement:document.body;return a?a.appendChild(t):document.body.appendChild(t),(0,r.removeHtmlNotificationAndBackdrop)(!1),o.addEventListener("click",()=>{try{chrome.runtime.sendMessage({action:"OPEN_SIDE_PANEL_BY_TOAST_CLICK"})}catch(t){}try{o.animate([{opacity:1,transform:"translateX(-50%) translateY(0)"},{opacity:0,transform:"translateX(-50%) translateY(-32px)"}],{duration:220,fill:"forwards",easing:"ease"})}catch(t){}setTimeout(()=>{n()},240)}),setTimeout(()=>{try{o.animate([{opacity:1,transform:"translateX(-50%) translateY(0)"},{opacity:0,transform:"translateX(-50%) translateY(-32px)"}],{duration:220,fill:"forwards",easing:"ease"})}catch(t){}setTimeout(()=>{n()},240)},36e5),t}catch(t){}},p=async()=>{try{let{copilotTabId:t}=await chrome.storage.local.get("copilotTabId");if(!t)return;chrome.runtime.sendMessage({type:"IS_PANEL_OPEN"},t=>{!chrome.runtime.lastError&&t&&t.is_panel_open||a()})}catch(t){console.error("Error sending message to side panel or notify:",t);return}}},{"./clickNotification":"isG7X","@parcel/transformer-js/src/esmodule-helpers.js":"fRZO2"}],isG7X:[function(t,e,i){var o=t("@parcel/transformer-js/src/esmodule-helpers.js");o.defineInteropFlag(i),o.export(i,"createNotificationHtmlBase",()=>p),o.export(i,"hideHtmlNotificationOnly",()=>l),o.export(i,"removeHtmlNotificationAndBackdrop",()=>s),o.export(i,"showHtmlNotificationAt",()=>d),o.export(i,"showFormFillingProcessNotification",()=>m);var r=t("~config/optimhire");let n="optimhire-shadow-container",a=null,p=()=>{if(r.STOP_INJECT_POPUP||document.getElementById(n))return;let t=document.createElement("div");t.id=n,t.style.position="absolute",t.style.top="0",t.style.left="0",t.style.zIndex="2147483640";let e=document.documentElement?document.documentElement:document.body;e?e.appendChild(t):document.body.appendChild(t),a=t.attachShadow({mode:"open"});let i=document.createElement("style");i.textContent=`
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
  `;a.appendChild(i);let p=document.createElement("div");for(let t of(p.innerHTML=o,Array.from(p.childNodes)))a.appendChild(t);let l=a.getElementById("optimhire-html-profile-img");if(l)try{l.src=chrome.runtime.getURL("assets/icon.png")}catch(t){}},l=()=>{if(!a)return;let t=a.getElementById("optimhire-html-click-notification");t&&(t.style.display="none")},s=(t=!0)=>{t&&(localStorage.removeItem("setFormFillingProcess"),localStorage.removeItem("setOneMinuteBackdrop")),localStorage.setItem("setFormFillingProcess","false");let e=document.querySelector(`#${n}`);setTimeout(()=>{e&&(e?.remove(),a=null)},200)},d=(t,e)=>{if(!a)return;let i=a.getElementById("optimhire-html-click-notification"),o=a.getElementById("optimhire-html-click-notification-backdrop");if(!i||!o)return;let r=t-40,n=e-10,p=Math.max(window.innerWidth,document.documentElement.clientWidth),l=Math.max(window.innerHeight,document.documentElement.clientHeight);r=Math.min(r=Math.max(r,195),p-160-45),n=Math.min(n=Math.max(n,178),l-24),i.style.left=`${r}px`,i.style.top=`${n}px`,i.style.opacity="0",i.style.transform="translate(-50%, -120%)",i.style.display="flex",o.style.display="block",requestAnimationFrame(()=>{i.style.opacity="1",i.style.transform="translate(-50%, -100%)"})},m=()=>{"true"===localStorage.getItem("setOneMinuteBackdrop")&&(localStorage.setItem("setFormFillingProcess","true"),setTimeout(()=>{let t=document.querySelector(r.OPTIMHIRE_CONFIG.iframeId.ignore);if(t){s(!1);return}p();let e=a?.getElementById("optimhire-html-click-notification-backdrop");e&&(e.style.display="block")},100))}},{"~config/optimhire":"h1TGN","@parcel/transformer-js/src/esmodule-helpers.js":"fRZO2"}],h1TGN:[function(t,e,i){var o=t("@parcel/transformer-js/src/esmodule-helpers.js");o.defineInteropFlag(i),o.export(i,"GLOBAL_SUBAPP_URL",()=>n),o.export(i,"SERVICE_LOG",()=>a),o.export(i,"CONTENT_LOG",()=>p),o.export(i,"STOP_INJECT_POPUP",()=>l),o.export(i,"OPTIMHIRE_CONFIG",()=>s);let r="https://optimhire.com",n="https://*.optimhire.com/*",a=!0,p=!0,l=!1,s={urls:{login:r+"/d/login",signup:r+"/d/signup",dashboard:r+"/dashboard",help:r+"/help",privacy:r+"/privacy",copilotSetup:r+"/d/copilot-form/1",upgrade:r+"/d/my-jobs?q=upgrade_copilot_plan",missingQuestions:r+"/d/screening-questions",myJobs:r+"/d/my-jobs",SearchJob:r+"/d/Search-job/",appURL:r,upgradeMembership:r+"/d/membership",upgradeMembershipModel:r+"/d/membership?openUpgradePlan=1",referralurl:r+"/d/my-jobs?openReferEarn=1",feedbackUrl:r+"/d/job-auto-applier-uninstall-feedback",updatepluginUrl:"chrome://extensions/",jobPostUrl:r+"/d/jv/",myResumes:r+"/d/my-resumes",howItWorkUrl:"https://help.optimhire.com/how-to-use-the-optimhire-ai-job-auto-applier-extension/",whyOptimHireUrl:"https://help.optimhire.com/why-use-the-optimhire-ai-job-auto-applier/"},api:{baseUrl:r+"/api/v1",authTokenKey:"Talent_Auth_Token",candidateId:"developer_id"},support:{phone1:"+1 (415) 525 1604",phone2:"+1 (415) 718 7963",email:"support@optimhire.com"},extension:{version:"0.0.1",name:"OptimHire Copilot"},popup:{width:360},autoApply:{autoSkipDuration:180,loginWaitDuration:600,pageLoadDelay:3e3,mockDataType:"complex"},storage:{keys:{appliedCount:"appliedCount",autoApplyState:"autoApplyState",candidateDetails:"candidateDetails",preferredJobsite:"preferredJobsite"}},messages:{types:{stateUpdate:"AUTO_APPLY_STATE_UPDATE",candidateLoaded:"CANDIDATE_DETAILS_LOADED",authError:"AUTH_ERROR",autofillCompleted:"AUTOFILL_COMPLETED",formSubmitted:"FORM_SUBMITTED",complexFormError:"COMPLEX_FORM_ERROR"}},applicationStatus:{codes:{success:"1",error:"2",skipped:"4",notProcessed:"0"}},appCookie:{isPilotRunning:"isPilotRunning",at:"at",did:"did"},liveATS:["indeed","lever","greenhouse","manatal","breezyhr","jazzhr","dice","workable","workday","ziprecruiter","ziprecruiterpaid","jobvite","paylocity","ashby","bamboohr","linkedin","adzuna","adzunapaid","smartrecruiters","freshteam","recruitee","recooty","goHire","rippling"],iframeId:{optimhireMissingDetails:"optimhire-missing-details",confinityWelcomeScreen:"confinity-welcome-screen",optimhireResumeScoreRecord:"optimhire-resume-score-record",optimhireQueastionCoverLetter:"optimhire-queastion-cover-letter",ignore:"#optimhire-missing-details, #optimhire-toast-shadow-host, #optimhire-resume-score-record, #optimhire-queastion-cover-letter"}}},{"@parcel/transformer-js/src/esmodule-helpers.js":"fRZO2"}],fRZO2:[function(t,e,i){i.interopDefault=function(t){return t&&t.__esModule?t:{default:t}},i.defineInteropFlag=function(t){Object.defineProperty(t,"__esModule",{value:!0})},i.exportAll=function(t,e){return Object.keys(t).forEach(function(i){"default"===i||"__esModule"===i||e.hasOwnProperty(i)||Object.defineProperty(e,i,{enumerable:!0,get:function(){return t[i]}})}),e},i.export=function(t,e,i){Object.defineProperty(t,e,{enumerable:!0,get:i})}},{}]},["6YFM9"],"6YFM9","parcelRequire46b6"),globalThis.define=e;