var e,t;"function"==typeof(e=globalThis.define)&&(t=e,e=null),function(t,a,r,o,i){var s="undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:"undefined"!=typeof window?window:"undefined"!=typeof global?global:{},n="function"==typeof s[o]&&s[o],c=n.cache||{},l="undefined"!=typeof module&&"function"==typeof module.require&&module.require.bind(module);function p(e,a){if(!c[e]){if(!t[e]){var r="function"==typeof s[o]&&s[o];if(!a&&r)return r(e,!0);if(n)return n(e,!0);if(l&&"string"==typeof e)return l(e);var i=Error("Cannot find module '"+e+"'");throw i.code="MODULE_NOT_FOUND",i}d.resolve=function(a){var r=t[e][1][a];return null!=r?r:a},d.cache={};var u=c[e]=new p.Module(e);t[e][0].call(u.exports,d,u,u.exports,this)}return c[e].exports;function d(e){var t=d.resolve(e);return!1===t?{}:p(t)}}p.isParcelRequire=!0,p.Module=function(e){this.id=e,this.bundle=p,this.exports={}},p.modules=t,p.cache=c,p.parent=n,p.register=function(e,a){t[e]=[function(e,t){t.exports=a},{}]},Object.defineProperty(p,"root",{get:function(){return s[o]}}),s[o]=p;for(var u=0;u<a.length;u++)p(a[u]);if(r){var d=p(r);"object"==typeof exports&&"undefined"!=typeof module?module.exports=d:"function"==typeof e&&e.amd?e(function(){return d}):i&&(this[i]=d)}}({kgW6q:[function(e,t,a){e("../../../src/background")},{"../../../src/background":"fx8Od"}],fx8Od:[function(e,t,a){var r=e("./config/optimhire"),o=e("./services/api"),i=e("~services/mockData"),s=e("~config/status"),n=e("./config/keepAlive"),c=e("~config/atsNames"),l=e("~helper/autoPilotBackground"),p=e("~helper/GoogleAnalytics"),u=e("~helper/analyticsEvent");(0,n.setupKeepAlive)();let d=null,m={applicationDetails:null},g=null,h=0,S=0,E=(e,...t)=>{r.SERVICE_LOG&&console.log(`\ud83d Service Worker: ${e}`,...t.length>0?t:[])},I=(e,...t)=>{r.SERVICE_LOG&&console.error(`\ud83d Service Worker: ${e}`,...t.length>0?t:[])};E("\uD83D\uDFE3 Service Worker: Background script initialized");let _=async e=>{let t=0;for(;t<5;){try{let a=await chrome.tabs.sendMessage(e,{type:"PING"});if(a&&a.ready)return E(`\u2705 Service Worker: Content script responded as ready (retry ${t})`),!0}catch(e){E(`\u23f3 Service Worker: Waiting for content script (retry ${t})...`)}await new Promise(e=>setTimeout(e,1e3)),t++}return E(`\u274c Service Worker: Content script not ready after 5 retries.`),!1},f=async()=>{let e=await chrome.storage.local.get(r.OPTIMHIRE_CONFIG.storage.keys.appliedCount);return e[r.OPTIMHIRE_CONFIG.storage.keys.appliedCount]||0},A=async e=>{let{isAutoProcessStartJob:t}=await chrome.storage.local.get("isAutoProcessStartJob");t&&(d={...d,...e},await chrome.storage.local.set({[r.OPTIMHIRE_CONFIG.storage.keys.autoApplyState]:d}),chrome.runtime.sendMessage({type:r.OPTIMHIRE_CONFIG.messages.types.stateUpdate,...d}).catch(()=>{}))},D=async()=>{try{E(`\ud83e Clearing autofill cache from previous job`),await chrome.storage.local.remove(["complexFormInProgress","complexFormData","applicationDetails","waitingForSubmissionResult"]),E(`\u2705 Cleared autofill cache storage`)}catch(e){E(`\u26a0\ufe0f Error clearing autofill cache:`,e)}},b=async e=>{try{let t;let{copilotTabId:a}=await chrome.storage.local.get("copilotTabId");if(E(`\ud83e Loaded stored tab ID: ${a}`),a){let e=await chrome.tabs.query({});if(t=e.find(e=>e.id===a))E(`\u2705 Found stored copilot tab ${t.id}`);else{E(`\u26a0\ufe0f Stored copilot tab ${a} no longer exists`),y();return}}if(!t){E(`\ud83d No valid stored tab found, using current active tab`);let[e]=await chrome.tabs.query({active:!0,currentWindow:!0});e&&e.id?(t=e,await chrome.storage.local.set({copilotTabId:e.id}),E(`\ud83d Stored new copilot tab ID: ${e.id}`)):(E(`\u26a0\ufe0f No active tab found \u2014 creating new one`),t=await chrome.tabs.create({url:"about:blank",active:!0}),await chrome.storage.local.set({copilotTabId:t.id}),E(`\ud83d Created and stored new copilot tab ID: ${t.id}`))}let r=await chrome.tabs.update(t.id,{url:e});return await new Promise(e=>{let t=(a,o)=>{a===r.id&&"complete"===o.status&&(chrome.tabs.onUpdated.removeListener(t),e())};chrome.tabs.onUpdated.addListener(t)}),E(`\u2705 Tab loaded successfully for URL: ${e}`),r.id}catch(e){return E(`\u274c Tab navigation error: ${e}`),null}},y=async(e=!1)=>{try{let{copilotTabId:t}=await chrome.storage.local.get("copilotTabId");T(),d=null,await chrome.storage.local.remove(["autoApplyState","appliedCount","complexFormInProgress","complexFormData","copilotTabId"]),chrome.storage.local.remove(["isManualAppliedCount","isManualSubmit","manualApplicationDetail","manualComplexInstructions"]),E("\uD83D\uDCBE Service Worker: Cleared auto-apply state, appliedCount, form storage, and window tracking from cache"),chrome.storage.local.set({isManuallyStartJob:!1}),chrome.storage.local.set({isAutoProcessStartJob:!1}),chrome.storage.local.set({isSuccessProcessing:!1}),chrome.storage.local.set({isErrorProcessing:!1}),(0,l.setCookie)(r.OPTIMHIRE_CONFIG.urls.appURL,r.OPTIMHIRE_CONFIG.appCookie.isPilotRunning,"false","/");let a=await chrome.tabs.query({});for(let e of(E(`\ud83d Service Worker: Sending stop message to ${a.length} tabs`),a))e.id&&chrome.tabs.sendMessage(e.id,{type:"STOP_ALL_PROCESSES"}).catch(()=>{});let o=await chrome.storage.local.get([r.OPTIMHIRE_CONFIG.api.authTokenKey,"candidateId"]);if(chrome.runtime.sendMessage({type:"PILOT_STOP"}),o[r.OPTIMHIRE_CONFIG.api.authTokenKey]&&o.candidateId&&(await N(o[r.OPTIMHIRE_CONFIG.api.authTokenKey],o.candidateId),e&&t)){let e=r.OPTIMHIRE_CONFIG.urls.upgradeMembershipModel;await chrome.tabs.update(t,{url:e})}E("\u2705 Service Worker: Auto-apply stopped successfully")}catch(e){I("\uD83D\uDD34 Service Worker: Error stopping auto-apply:",e)}},C=(e,t)=>{chrome.notifications.create({type:"basic",iconUrl:chrome.runtime.getURL("assets/icon.png"),title:e,message:t},e=>{E("Notification created with ID:",e)})},T=()=>{g&&(clearInterval(g),g=null,E("\u23f0 Service Worker: Cleared countdown interval")),g=null},w=async(e,t=!1)=>{E(`\u23ed\ufe0f Executing skip - Reason: ${e}, IsTimeout: ${t}`);try{T();let a=await chrome.storage.local.get("appliedCount"),r=a.appliedCount||0,o=r+1;if(await chrome.storage.local.set({appliedCount:o}),E(`\ud83d Incremented appliedCount from ${r} to ${o}`),d?.applicationDetails){if(t){E("\uD83D\uDD04 Updating application status to Failed (timeout)");let{copilotTabId:t}=await chrome.storage.local.get("copilotTabId"),a=await W(t)||"";await v(d.applicationDetails,"2",e,{reason:e,timeout:!0},a)}else E("\uD83D\uDD04 Updating application status to Skipped (manual)"),await v(d.applicationDetails,"4",`Skipped by ${e}`,{reason:e})}await A({isActive:!0,applicationDetails:null,applicationState:s.ApplicationPopStatus.IN_PROGRESS,progress:0,statusMessage:"Loading next job...",appliedCount:o}),E("\uD83D\uDCE4 Sent loading state to popup"),E("\uD83D\uDD04 Loading next job after skip");let i=await M();if(!i){E("\uD83C\uDFC1 No more jobs available"),await A({isActive:!1,applicationDetails:null,applicationState:"no-jobs",progress:100,statusMessage:"No more jobs available",appliedCount:o}),chrome.runtime.sendMessage({type:"AUTO_APPLY_COMPLETE"}).catch(()=>{}),y();return}E("\uD83D\uDE80 Starting application process for next job"),await A({isActive:!0,applicationDetails:i,applicationState:s.ApplicationPopStatus.IN_PROGRESS,progress:0,statusMessage:"Ready to start next application",appliedCount:o}),E("\uD83D\uDCE4 Sent next job state to popup");try{await U(i)}catch(e){await A({isActive:!0,applicationDetails:i,applicationState:"error",progress:0,statusMessage:`Error loading next job: ${e.message}`,appliedCount:o}),await k("error-loading-next-job",async()=>{await w("Timeout: Error loading job",!0)})}}catch(e){E("\u274c Critical error in executeSkipAndLoadNext:",e),d&&(d.isActive=!1,d.applicationState="error",d.statusMessage="Critical error loading next job",await A({...d}))}},k=async(e,t,a)=>{T();let o=a;o||(o="login-required"===e||"login-check-error"===e||"login_timeout"===e?r.OPTIMHIRE_CONFIG.autoApply.loginWaitDuration:r.OPTIMHIRE_CONFIG.autoApply.autoSkipDuration),d.autoSkipSeconds=o,E(`\u23f0 Starting ${o}s auto-skip countdown for ${e}`),await A({...d}),g=setInterval(async()=>{if(!d){T();return}d.autoSkipSeconds=Math.max(0,d.autoSkipSeconds-1),await chrome.storage.local.set({[r.OPTIMHIRE_CONFIG.storage.keys.autoApplyState]:d}),await A({...d}),d.autoSkipSeconds<=0&&(T(),E(`\u23f0 ========================================`),E(`\u23f0 Auto-skip countdown completed for ${e}`),E(`\u23f0 Executing onSkip callback...`),E(`\u23f0 ========================================`),await t(),E(`\u23f0 onSkip callback completed`))},1e3)},O=async()=>{E("\uD83D\uDD04 Service Worker: Reloading candidate profile after application completion");try{let e=await chrome.storage.local.get([r.OPTIMHIRE_CONFIG.api.authTokenKey,"candidateId"]);if(e[r.OPTIMHIRE_CONFIG.api.authTokenKey]&&e.candidateId){let t=await N(e[r.OPTIMHIRE_CONFIG.api.authTokenKey],e.candidateId),a=parseInt(t.matching_job_count)||0;if(E(`\ud83d Service Worker: Updated candidate profile - ${a} jobs remaining`),0===a){E("\uD83C\uDFC1 Service Worker: No more jobs available after completion");let e=await chrome.storage.local.get("appliedCount"),t=e.appliedCount||0;return await A({isActive:!1,applicationDetails:null,applicationState:"no-jobs",progress:100,statusMessage:"No more jobs available",appliedCount:t}),E("\uD83D\uDCE4 Service Worker: Sent no-jobs state to popup"),y(),!1}return!0}return E("\u26a0\ufe0f Service Worker: No auth data available for candidate reload"),!0}catch(e){return E("\u274c Service Worker: Error reloading candidate profile:",e),!0}},P=async e=>{I("\uD83D\uDD34 Service Worker: Authentication error:",e),await chrome.storage.local.clear(),E("\uD83D\uDFE1 Service Worker: Cleared all auth data"),chrome.runtime.sendMessage({type:"AUTH_ERROR",message:e}).catch(()=>{}),E("\uD83D\uDCE4 Service Worker: Sent AUTH_ERROR message to popup")},R=(e,t,a)=>{if("2"===t){let t=e.toLowerCase();return"redirectToCompanySite"===a?"Apply on company site":"missing-questions"===a?"Missing Questions":"submissionError"===a?"Submission Error":t.includes("captcha")?"Captcha Failed":t.includes("missing")&&t.includes("question")?"Missing Questions":t.includes("login")&&t.includes("require")?"Require Login":t.includes("company")&&t.includes("site")?"Apply on company site":"Others"}return e},v=async(e,t,a,o={},i="",s="",n="",c=!1)=>{E(`\ud83d Service Worker: Updating application status - ID: ${e?.application_id}, Status: ${t}, Message: ${a}`);try{let p=await chrome.storage.local.get("skipStatusUpdates");if(!0===p.skipStatusUpdates)return E("\u23ed\ufe0f Service Worker: Skipping status update - disabled by user in options"),!0;let u=await chrome.storage.local.get(["candidateId",r.OPTIMHIRE_CONFIG.api.authTokenKey]);if(!u.candidateId)return E("\u26a0\ufe0f Service Worker: Skipping status update - no auth data available"),!1;if(!e?.application_id)return E("\u26a0\ufe0f Service Worker: application_id not available"),!1;let d=`${r.OPTIMHIRE_CONFIG.api.baseUrl}/candidate/${u.candidateId}/application/${e.application_id}/status`;E(`\ud83d Service Worker: Making PUT request to: ${d}`);let m=o?.errorType;if(!m&&"string"==typeof o)try{let e=JSON.parse(o);m=e?.errorType||e?.type}catch(e){}let g=R(a,t,m),S=await chrome.storage.local.get(["candidateDetails"]),I=S?.candidateDetails?.is_first_attempt_completed,_={status:t,status_message:g,applied_screenshot_url:s??"",screenshot_txt:i,error:"string"==typeof o?o:JSON.stringify(o),ats_name:n||e?.ats_name||"",isFirstAttemptCompleted:I};E("\uD83D\uDCE6 Service Worker: Request payload:",_);let f=await fetch(d,{method:"PUT",headers:{"Content-Type":"application/json",Auth_Token:u[r.OPTIMHIRE_CONFIG.api.authTokenKey]},body:JSON.stringify(_)});if(E(`\ud83d Service Worker: API response status: ${f.status}`),401===f.status||403===f.status)return!1;e?.copilot_job_id&&(0,l.broadcastJobProcessingCompletedToAllOptimhireTabs)(e?.copilot_job_id);let A=await f.json();h=9999;let D=A?.data?.is_missing_questions??!1;chrome.runtime.sendMessage({type:"SHOW_MISSING_QUESTION",value:D}).catch(()=>{});return E("\uD83D\uDCE5 Service Worker: API response data:",A),f.ok}catch(e){return I("\uD83D\uDD34 Service Worker: Error updating application status:",e),!1}},M=async()=>{E("\uD83D\uDD04 Loading next job");try{if(i.USE_MOCK_DATA){E("\uD83E\uDDEA Using mock data");let e=(0,i.mockApplicationDetails)(r.OPTIMHIRE_CONFIG.autoApply.mockDataType);return e?.seeker&&(await chrome.storage.local.set({cachedSeekerInfo:e.seeker}),E("\uD83D\uDCBE Cached mock seeker info for autofill")),e}let e=await chrome.storage.local.get(["candidateDetails"]),t=e.candidateDetails?.copilot_status==="FREE";let{isAutoProcessStartJob:a}=await chrome.storage.local.get("isAutoProcessStartJob");if(!a)return null;let{[r.OPTIMHIRE_CONFIG.storage.keys.preferredJobsite]:s}=await chrome.storage.local.get(r.OPTIMHIRE_CONFIG.storage.keys.preferredJobsite);E(s?`\ud83c Using preferred jobsite: ${s}`:"\u26a0\ufe0f No preferred jobsite");let n=await (0,o.optimhireApi).getApplicationDetails(s),c={};if(n?.status===200)return c=n?.data?.data??null,E(`\u2705 Loaded next job: ${c?.source?.job_title}`),c?.seeker&&(await chrome.storage.local.set({cachedSeekerInfo:c.seeker}),E("\uD83D\uDCBE Cached seeker info for autofill")),c;return null}catch(e){return I("\uD83D\uDD34 Error loading next job:",e),null}},N=async(e,t)=>{if(E(`\ud83d Fetching candidate details for ID: ${t}`),i.USE_MOCK_DATA)return E("\uD83E\uDDEA Using mock candidate details"),await chrome.storage.local.set({[r.OPTIMHIRE_CONFIG.storage.keys.candidateDetails]:i.mockCandidateDetails}),chrome.runtime.sendMessage({type:r.OPTIMHIRE_CONFIG.messages.types.candidateLoaded,candidateDetails:i.mockCandidateDetails}).catch(()=>{}),i.mockCandidateDetails;let a=`${r.OPTIMHIRE_CONFIG.api.baseUrl}/candidate/${t}`;try{let t=await fetch(a,{method:"GET",headers:{"Content-Type":"application/json",Auth_Token:e}});if(E(`\ud83d Service Worker: Candidate API response status: ${t.status}`),401===t.status||403===t.status)throw I(`\ud83d Service Worker: Auth error fetching candidate: ${t.status}`),await P(`Authentication failed: ${t.status} ${t.statusText}`),Error("Authentication failed");if(t.ok){let e=await t.json();if(E("\uD83D\uDCE5 Service Worker: Candidate API response:",e),1===e.status&&e.data)return h=9999,await chrome.storage.local.set({candidateDetails:Object.assign({},e.data,{free_left_credits:9999})}),E("\uD83D\uDCBE Service Worker: Saved candidate details to storage"),chrome.runtime.sendMessage({type:"CANDIDATE_DETAILS_LOADED",candidateDetails:e.data}).catch(()=>{}),E("\uD83D\uDCE4 Service Worker: Sent candidate details to popup"),e.data}throw Error(`API request failed: ${t.status} ${t.statusText}`)}catch(e){if("Authentication failed"===e.message)throw e;throw I("\uD83D\uDD34 Service Worker: Network error fetching candidate details:",e),Error("Network error occurred")}},L=async(e,t,a)=>{try{let r=e?.applicationStatus;if(!r?.jobClosed?.length||t?.isJobClose)return!1;for(let e of r.jobClosed){if("Network"!==e.type)continue;let t="self"===e.apiEndpoint?a?.source?.apply_now_url:e.apiEndpoint;if(t)try{let e=new AbortController,a=setTimeout(()=>e.abort(),8e3),r=await fetch(t,{method:"GET",redirect:"manual",signal:e.signal});if(clearTimeout(a),"opaqueredirect"===r.type)return E("Detected 302 redirect (opaqueredirect):",t),!0;if(302===r.status||400===r.status||404===r.status)return E(`Detected HTTP ${r.status} for:`,t),!0}catch(e){"AbortError"===e.name?E("Fetch timeout:",t):E("Fetch error for",t,e)}}return!1}catch(e){return!1}},U=async(e,t=!1)=>{let a=t?"retry":"start";if(E(`\ud83d Service Worker: ${t?"Retrying":"Starting"} application process for: ${e.source?.job_title}`),await D(),await chrome.storage.local.set({pageQuestions:[]}),chrome.storage.local.set({isMissingUIShow:{isShow:!1,time:Date.now()}}),chrome.runtime.sendMessage({type:"UPDATE_PAGE_QUESTIONS",questions:[]}).catch(()=>{}),E(`\ud83e Starting new job`),!e.source?.apply_now_url){I(`\ud83d Service Worker: No job URL available for ${a}`),await A({isActive:!1,applicationDetails:null,applicationState:"error",progress:0,statusMessage:`No job URL available for ${a}`});return}let r=!e.additional_info||Array.isArray(e.additional_info)||!e.additional_info.additional_info;E(`\ud83d Service Worker: Simple instructions: ${r}`),E(`\ud83c Service Worker: ${t?"Retrying":"Opening"} job page: ${e.source.apply_now_url}`);let o=await f();await A({isActive:!0,applicationDetails:e,applicationState:s.ApplicationPopStatus.IN_PROGRESS,progress:10,statusMessage:"Opening job page...",appliedCount:o}),E(`\ud83d Service Worker: Sent ${a} update to popup`);let n=await b(e.source.apply_now_url);if(!n){await A({applicationState:"error",progress:0,statusMessage:`Could not load page properly ${t?"after retry":""}`,appliedCount:o});return}chrome.tabs.sendMessage(n,{type:"START_FILLING_PROCESS_FORM"}).catch(()=>{}),E(`\u2705 Service Worker: Navigating tab ${n} to job URL for ${a}`);let c=!1,l=!1,p=null;if(e.additional_info&&!Array.isArray(e.additional_info)){if(e.additional_info.additional_info)try{let t=e.additional_info.additional_info,a=t.replace(/[\n\r\t]+/g,"").trim(),r=JSON.parse(a);p=r,E("\uD83D\uDCCB Service Worker: Parsed complex instructions:",p),!0===p.requiresLogin?c=!0:!1===p.requiresLogin&&(c=!1),!0===p.isCaptchaRequired&&(l=!0,E("\uD83E\uDD16 Service Worker: Captcha detected in complex instructions"))}catch(e){E("\u26a0\ufe0f Service Worker: Failed to parse additional_info JSON:",e)}!0===e.additional_info.requiresLogin?c=!0:!1===e.additional_info.requiresLogin&&(c=!1)}if(E(`\ud83d Service Worker: Login required: ${c}, Captcha present: ${l}`),E(`\ud83d Service Worker: Waiting for content script to load on ${a} page...`),await new Promise(e=>setTimeout(e,1e3)),!await _(n)){E("\u274c Service Worker: Content script failed to respond after retries"),await A({applicationState:"error",progress:0,statusMessage:"Could not establish connection to content script",appliedCount:o}),await k("login-check-error",async()=>{E(`\u23f0 Auto-skip triggered: content script not ready`),await w("Require Login",!0)}),E(`\ud83d Service Worker: Sent ${a} content script readiness error to popup`);return}if(await A({isActive:!0,applicationDetails:e,applicationState:s.ApplicationPopStatus.IN_PROGRESS,progress:30,statusMessage:"Checking page status...",appliedCount:o}),await new Promise(e=>setTimeout(e,5e3)),E(`\ud83d Service Worker: Updated ${a} state - checking login`),!c){E("\uD83D\uDE80 Service Worker: requiresLogin is false - skipping login check, going directly to autofill with complex instructions");let t=p?.checkFormInIframe,r="boolean"==typeof t?t:t?.enabled??!0,c="object"==typeof t&&Array.isArray(t?.srcIncludes)?t.srcIncludes:[],l="";if(r&&c.length>0){try{l=await chrome.tabs.sendMessage(n,{type:"GET_IFRAME",applicationDetails:e,complexInstructions:p})}catch(e){E(`\u26a0\ufe0f Could not check iframe job URL:`,e.message)}l&&(await chrome.tabs.update(n,{url:l}),await new Promise(e=>setTimeout(e,1e3)))}E(l,"Ifrem URL");let u={isJobClose:!1};try{u=await chrome.tabs.sendMessage(n,{type:"CHECK_JOB_CLOSE",applicationDetails:e,complexInstructions:p})}catch(e){E(`\u26a0\ufe0f Could not check job close status:`,e.message)}let d=await L(p,u,e);if(d&&(u={isJobClose:!0}),u.isJobClose){await v(e,s.ApplicationErrorStateCode.JOB_CLOSED,s.ApplicationStatusMessage.JOB_CLOSED,{errorType:s.ApplicationErrorState.JOB_CLOSED}),await A({isActive:!0,applicationDetails:e,applicationState:s.ApplicationErrorState.JOB_CLOSED,statusMessage:"Job posting has closed"}),await new Promise(e=>setTimeout(e,500)),await x();return}let m=p;await A({isActive:!0,applicationDetails:e,applicationState:s.ApplicationPopStatus.IN_PROGRESS,progress:60,statusMessage:"Filling application form...",appliedCount:o}),E(`\ud83d Service Worker: Sent ${a} autofill progress to popup (complex, no login required)`);try{E(`\ud83d Service Worker: Sending complex form instructions to tab ${n}`);let t=await chrome.storage.local.get(["candidateDetails"]),a=!!i.USE_MOCK_DATA||t.candidateDetails?.is_copilot_automatic_apply_to_job==="1";E(`\ud83e Auto-submit enabled: ${a}`),await chrome.tabs.sendMessage(n,{type:"FILL_COMPLEX_FORM",applicationDetails:e,complexInstructions:m,autoApplyEnabled:a}),E("\uD83D\uDCE4 Service Worker: Complex form instructions sent")}catch(e){E("\u274c Service Worker: Error sending complex form instructions:",e),await A({applicationState:"error",progress:0,statusMessage:"Error communicating with page",appliedCount:o}),await k("communication-error",async()=>{E(`\u23f0 Auto-skip triggered for communication error`),await w("Timeout: Communication error",!0)})}return}E(`\u2705 Service Worker: Content script ready, starting ${a} login status check`);try{let t=null;p&&p.loginConfig&&(t=p.loginConfig,E(`\ud83d Service Worker: Passing loginConfig to content script:`,t));let r={isJobClose:!1};try{r=await chrome.tabs.sendMessage(n,{type:"CHECK_JOB_CLOSE",applicationDetails:e,complexInstructions:p})}catch(e){E(`\u26a0\ufe0f Could not check job close status:`,e?.message)}let c=await L(p,r,e);if(c&&(r={isJobClose:!0}),r.isJobClose){await v(e,s.ApplicationErrorStateCode.JOB_CLOSED,s.ApplicationStatusMessage.JOB_CLOSED,{errorType:s.ApplicationErrorState.JOB_CLOSED}),await A({isActive:!0,applicationDetails:e,applicationState:s.ApplicationErrorState.JOB_CLOSED,statusMessage:"Job posting has closed"}),await new Promise(e=>setTimeout(e,500)),await x();return}await A({isActive:!0,applicationDetails:e,applicationState:s.ApplicationPopStatus.IN_PROGRESS,statusMessage:"Checking login status..."});let l=await chrome.tabs.sendMessage(n,{type:"CHECK_LOGIN_STATUS",loginConfig:t});if(E(`\ud83d Service Worker: ${a} login status response:`,l),!0){E(`\u2705 Service Worker: User logged in for ${a}, continuing with complex form fill`),await A({progress:60,statusMessage:"Filling application form...",appliedCount:o}),E(`\ud83d Service Worker: Sent ${a} autofill progress to popup`);try{E(`\ud83d Service Worker: Sending complex form instructions to tab ${n} after login check`);let t=await chrome.storage.local.get(["candidateDetails"]),a=!!i.USE_MOCK_DATA||t.candidateDetails?.is_copilot_automatic_apply_to_job==="1";E(`\ud83e Auto-submit enabled: ${a}`),E("\uD83E\uDDF9 Service Worker: Clearing old complex form storage before starting new job"),await chrome.storage.local.remove(["complexFormInProgress","complexFormData"]),await chrome.tabs.sendMessage(n,{type:"FILL_COMPLEX_FORM",applicationDetails:e,complexInstructions:p,autoApplyEnabled:a}),E("\uD83D\uDCE4 Service Worker: Complex form instructions sent after login success")}catch(e){E("\u274c Service Worker: Error sending complex form instructions after login:",e),await A({applicationState:"error",progress:0,statusMessage:"Error starting form fill",appliedCount:o}),await k("form-fill-error",async()=>{E(`\u23f0 Auto-skip triggered for form fill error`),await w("Timeout: Form fill error",!0)})}}else{E(`\u26a0\ufe0f Service Worker: Login required for ${a}`);let t=Array.isArray(e.additional_info)?"this platform":e.additional_info?.source_name||"this platform";if(p?.workdayNextButtonClickOnUserNotLoggedIn){let e=await chrome.tabs.sendMessage(n,{type:"WORKDAY_NEXT_BUTTON_CLICK_USER_NOT_LOGGED_IN",multiFormData:p.workdayNextButtonClickOnUserNotLoggedIn});e?.success&&E("Workday next button clicked (user not logged in)")}await v(e,s.ApplicationErrorStateCode.LOGIN_REQUIRED,s.ApplicationStatusMessage.LOGIN_REQUIRED,{errorType:s.ApplicationErrorState.LOGIN_REQUIRED}),await A({applicationState:"login-required",progress:0,statusMessage:`Login required for ${t}`,appliedCount:o}),chrome.tabs.sendMessage(n,{type:"REMOVE_AUTOFILL_NOTIFICATION"}).catch(()=>{}),E(`\ud83d Service Worker: Sent ${a} error state to popup`),C("Require Login",`Login required for ${t}`),await k("login-required",async()=>{E(`\u23f0 Auto-skip timer triggered for login required`),await w("Require Login",!0)})}}catch(e){}},j=async(e,t)=>{let a=await F(e.source.apply_now_url,t);if(!a)return;chrome.runtime.sendMessage({type:"MANUALLY_APPLY_STATE_UPDATE",manuallyAply:{applicationState:"check-job"},isLoadingNextJob:!0}).catch(e=>{E("\u26a0\ufe0f Error sending no-jobs manual apply state update:",e)});let r=!1,o=!1,i=null;try{let a=await chrome.storage.local.get("isManualAppliedCount"),s=a?.isManualAppliedCount||0;if(e.additional_info&&!Array.isArray(e.additional_info)){if(e.additional_info.additional_info)try{let t=e.additional_info.additional_info,a=t.replace(/[\n\r\t]+/g,"").trim(),s=JSON.parse(a);i=s,E("\uD83D\uDCCB Service Worker: Parsed complex instructions:",i),!0===i.requiresLogin?r=!0:!1===i.requiresLogin&&(r=!1),!0===i.isCaptchaRequired&&(o=!0,E("\uD83E\uDD16 Service Worker: Captcha detected in complex instructions"))}catch(e){E("\u26a0\ufe0f Service Worker: Failed to parse additional_info JSON:",e)}!0===e.additional_info.requiresLogin?r=!0:!1===e.additional_info.requiresLogin&&(r=!1)}E(`\ud83d Service Worker: Login required: ${r}, Captcha present: ${o}`),E(`\ud83d Service Worker: Waiting for content script to load on manual form page...`);let n=await _(t);n||E(`\u26a0\ufe0f Service Worker: Content script ping failed, but proceeding anyway (it may auto-resume)`),await chrome.storage.local.set({isManualAppliedCount:s+1,isManualSubmit:!0,manualApplicationDetail:e,manualComplexInstructions:i});let c=i;await chrome.runtime.sendMessage({type:"MANUALLY_APPLY_STATE_UPDATE",isLoadJobDetailsSuccess:!0,applicationDetails:e,progressAppliedCount:s}).catch(()=>{}),await chrome.tabs.sendMessage(t,{type:"MANUALLY_FORM_SUBMIT",applicationDetails:e,complexInstructions:c,autoApplyEnabled:!1,isTrack:!0})}catch(e){E("\u274c Service Worker: Error in manual application process:",e)}},F=async(e,t)=>{try{if(!t)return null;let a=await chrome.tabs.update(t,{url:e});return await new Promise(e=>{let t=(r,o)=>{r===a.id&&"complete"===o.status&&(chrome.tabs.onUpdated.removeListener(t),e())};chrome.tabs.onUpdated.addListener(t)}),E(`\u2705 Tab loaded successfully for URL: ${e}`),a.id}catch(e){return E(`\u274c Tab navigation error: ${e}`),null}},x=async()=>{try{T();let e=await chrome.storage.local.get("appliedCount"),t=e.appliedCount||0,a=t+1;await chrome.storage.local.set({appliedCount:a}),await A({isActive:!0,applicationDetails:null,applicationState:s.ApplicationPopStatus.IN_PROGRESS,progress:0,statusMessage:"Loading next job...",appliedCount:a}),E("\uD83D\uDCE4 Service Worker: Sent loading state to popup"),await new Promise(e=>setTimeout(e,500));let r=await M();if(!r){E("\uD83C\uDFC1 Service Worker: No more jobs available, completing auto-apply"),await A({isActive:!1,applicationDetails:null,applicationState:"no-jobs",progress:100,statusMessage:"No more jobs available",appliedCount:a}),chrome.runtime.sendMessage({type:"AUTO_APPLY_COMPLETE"}).catch(()=>{}),y();return}await A({isActive:!0,applicationDetails:r,applicationState:s.ApplicationPopStatus.IN_PROGRESS,progress:0,statusMessage:"Opening job page...",appliedCount:a}),E("\uD83D\uDE80 Service Worker: Starting application process for next job"),await new Promise(e=>setTimeout(e,500)),await U(r)}catch(e){E("\u274c Error in handleNextJobAutoApply:",e)}},W=e=>new Promise((t,a)=>{chrome.tabs.captureVisibleTab(e,{format:"png"},e=>{if(chrome.runtime.lastError)return t("");t(e)})}),G=async e=>{chrome.runtime.sendMessage({type:"MANUALLY_APPLY_STATE_UPDATE",isLoadingNextJob:!0}).catch(e=>{E("\u26a0\ufe0f Error sending no-jobs manual apply state update:",e)}),chrome.storage.local.remove(["isManualSubmit","manualApplicationDetail","manualComplexInstructions"]),E("\uD83D\uDD04 Loading manual next job...");let{isManuallyStartJob:t}=await chrome.storage.local.get("isManuallyStartJob");if(!t)return!0;let a=null;try{if(i.USE_MOCK_DATA)E("\uD83E\uDDEA Using mock data"),a=(0,i.mockApplicationDetails)(r.OPTIMHIRE_CONFIG.autoApply.mockDataType),a?.seeker&&(await chrome.storage.local.set({cachedSeekerInfo:a.seeker}),E("\uD83D\uDCBE Cached mock seeker info for autofill"));else{let{[r.OPTIMHIRE_CONFIG.storage.keys.preferredJobsite]:e}=await chrome.storage.local.get(r.OPTIMHIRE_CONFIG.storage.keys.preferredJobsite);E(e?`\ud83c Using preferred jobsite: ${e}`:"\u26a0\ufe0f No preferred jobsite");let t=null;try{t=await (0,o.optimhireApi).getApplicationDetails(e)}catch(e){E("\u274c Error fetching application details:",e),t=null}t?.status===200&&(a=t?.data?.data??null,E(`\u2705 Loaded next job: ${a?.source?.job_title}`),a?.seeker&&(await chrome.storage.local.set({cachedSeekerInfo:a.seeker}),E("\uD83D\uDCBE Cached seeker info for autofill")))}if(!a){E("\uD83C\uDFC1 No more jobs available"),chrome.runtime.sendMessage({type:"MANUALLY_APPLY_STATE_UPDATE",manuallyAply:{isActive:!1,applicationDetails:null,applicationState:"no-jobs",progress:100,statusMessage:"No more jobs available",appliedCount:0}}).catch(e=>{E("\u26a0\ufe0f Error sending no-jobs manual apply state update:",e)});return}if(e&&a?.source?.apply_now_url){await new Promise(e=>setTimeout(e,5e3));try{m.applicationDetails=a,j(a,e)}catch(e){E("\u274c Error updating tab with apply_now_url:",e)}}}catch(e){E("\u274c Exception in loadManualNextJob:",e),chrome.runtime.sendMessage({type:"MANUALLY_APPLY_STATE_UPDATE",manuallyAply:{isActive:!1,applicationDetails:null,applicationState:"error",progress:0,statusMessage:"Failed to load next job. Please try again.",appliedCount:0}}).catch(e=>{E("\u26a0\ufe0f Error sending manual apply error state update:",e)})}},$=async e=>{chrome.sidePanel.open({tabId:e},()=>{chrome.runtime.lastError}),chrome.sidePanel.setOptions({enabled:!0,tabId:e,path:"sidepanel.html"}),chrome.sidePanel.open({tabId:e},()=>{chrome.runtime.lastError})},q=e=>(e||[]).filter(e=>{let t="name"===(e.type||"").toLowerCase(),a="string"==typeof e.name?e.name.trim().toLowerCase():"",r=(0,c.IGNORED_QUESTION_NAMES).some(e=>e.trim().toLowerCase()===a);return!t&&!r}),J=()=>{chrome.runtime.requestUpdateCheck((e,t)=>{switch(e){case"update_available":E("Update available:",t.version),chrome.runtime.reload();break;case"no_update":E("Extension is up to date");break;case"throttled":E("Update check throttled by Chrome");break;default:E("Unknown update status:")}})},H=async(e,t)=>{try{let{copilotTabId:a}=await chrome.storage.local.get("copilotTabId");if(E(`fetchMissingJobQuestions: userClickActiveTab=${S}, copilotTabId=${a}`),a&&S&&S===a&&e){let r=await (0,o.optimhireApi).getJobQuestions(e);r?.data?.job_post_id&&(chrome.storage.local.set({isMissingUIShow:{isShow:!0,time:Date.now()}}),await chrome.tabs.sendMessage(a,{type:"OPEN_MISSING_DETAILS_UI"}),await new Promise(e=>setTimeout(e,1e3)),chrome.tabs.sendMessage(a,{type:"MISSING_QUESTION_DETAILS_API",data:r,requirementQuestions:t}).catch(()=>{}))}}catch(e){I("Error in fetchMissingJobQuestions:",e)}};chrome.runtime.onMessage.addListener((e,t,a)=>{
if("IMPORT_CSV_JOBS"===e.action){(async()=>{let _ex=(await chrome.storage.local.get('csvJobQueue')).csvJobQueue||[];let _m=[..._ex,...(e.urls||[])];await chrome.storage.local.set({csvJobQueue:_m});chrome.runtime.sendMessage({type:'CSV_QUEUE_UPDATED',count:_m.length}).catch(()=>{});a({success:!0,count:_m.length})})();return!0;}
if("CLEAR_CSV_QUEUE"===e.action){(async()=>{await chrome.storage.local.set({csvJobQueue:[]});chrome.runtime.sendMessage({type:'CSV_QUEUE_UPDATED',count:0}).catch(()=>{});a({success:!0,count:0})})();return!0;}
if("GET_CSV_QUEUE"===e.action){(async()=>{let _q=(await chrome.storage.local.get('csvJobQueue')).csvJobQueue||[];a({success:!0,count:_q.length,urls:_q})})();return!0;}
let n=t?.tab?.id;if("COMPLEX_FORM_SUCCESS"===e.type)return(async()=>{if(E("\uD83D\uDCE5 Service Worker: Received complex form success:",e),!d){E("\u26a0\ufe0f Service Worker: No auto-apply state for complex form success");return}E("\uD83C\uDF89 Service Worker: Complex form application submitted successfully");let t=await chrome.storage.local.get("appliedCount"),a=t.appliedCount||0;await A({isActive:!0,applicationState:"completed",progress:100,statusMessage:"Application submitted successfully",appliedCount:a}),E("\uD83D\uDCE4 Service Worker: Sent complex form success to popup");let{isSuccessProcessing:r}=await chrome.storage.local.get("isSuccessProcessing");if(E(r,"isProcessing"),!0===r)return;if(chrome.tabs.sendMessage(n,{type:"SUCCESS_CONFINITY_SCREEN"}).catch(()=>{}),await chrome.storage.local.set({isSuccessProcessing:!0}),d.applicationDetails){await v(d.applicationDetails,"1",e.message||"Application successfully submitted",{});let t=await O();if(!t){await chrome.storage.local.set({isSuccessProcessing:!1});return}}let o=await chrome.storage.local.get(["candidateDetails"]),s=!!i.USE_MOCK_DATA||o.candidateDetails?.is_copilot_automatic_apply_to_job==="1";s&&(await new Promise(e=>setTimeout(e,3e3)),await chrome.storage.local.set({isSuccessProcessing:!1}),chrome.tabs.sendMessage(n,{type:"REMOVE_CONFINITY_SCREEN"}).catch(()=>{}),await x()),!s&&e?.success_next_job&&(await new Promise(e=>setTimeout(e,3e3)),chrome.tabs.sendMessage(n,{type:"REMOVE_CONFINITY_SCREEN"}).catch(()=>{}),await chrome.storage.local.set({isSuccessProcessing:!1}),await x())})(),!0;if("COMPLEX_FORM_ERROR"===e.type)return(async()=>{if(chrome.tabs.sendMessage(n,{type:"REMOVE_AUTOFILL_NOTIFICATION"}).catch(()=>{}),E("\uD83D\uDCE5 Service Worker: Received complex form error:",e),!d){E("\u26a0\ufe0f Service Worker: No auto-apply state for complex form error");return}E("\u274c Service Worker: Complex form error:",e.errorType,e.message),E(`\ud83d Debug - errorType: ${e.errorType}, will check if skipNewApplicationJob should be true`);let a=await chrome.storage.local.get("appliedCount"),r=a.appliedCount||0,o=s.ApplicationErrorState.ERROR,i=e.message||s.ApplicationStatusMessage.GENERIC_ERROR,c=e.missingQuestions||[],l="2",p=!1;switch(e.errorType){case"alreadyApplied":o=s.ApplicationErrorState.ALREADY_APPLIED,i=e.message||s.ApplicationStatusMessage.ALREADY_APPLIED,l=s.ApplicationErrorStateCode.ALREADY_APPLIED,p=!0;break;case"redirectToCompanySite":o=s.ApplicationErrorState.REDIRECT_TO_COMPANY_SITE,i=s.ApplicationStatusMessage.REDIRECT_TO_COMPANY_SITE,l=s.ApplicationErrorStateCode.REDIRECT_TO_COMPANY_SITE,p=!0;break;case"incomplete":o=s.ApplicationErrorState.ERROR,i=e.message,l=s.ApplicationErrorStateCode.ERROR;break;case"jobClosed":o=s.ApplicationErrorState.JOB_CLOSED,i=e.message||s.ApplicationStatusMessage.JOB_CLOSED,l=s.ApplicationErrorStateCode.JOB_CLOSED,p=!0;break;case"captcha":o=s.ApplicationErrorState.CAPTCHA_REQUIRED,i=e.message||s.ApplicationStatusMessage.CAPTCHA_REQUIRED,l=s.ApplicationErrorStateCode.CAPTCHA_REQUIRED,C("Captcha Failed",i),E("\uD83E\uDD16 Service Worker: Captcha error detected");break;case"submissionError":o=s.ApplicationErrorState.ERROR,i=e.message||"Application submission failed due to system error",l=s.ApplicationErrorStateCode.ERROR,E(`\ud83d Service Worker: Submission error - ${i}`);break;case"missing-questions":o=s.ApplicationErrorState.MISSING_QUESTIONS,i=e.message||s.ApplicationStatusMessage.MISSING_QUESTIONS,l=s.ApplicationErrorStateCode.MISSING_QUESTIONS;break;case"submit-failed":o=s.ApplicationErrorState.MISSING_QUESTIONS,i=e.message||s.ApplicationStatusMessage.MISSING_QUESTIONS,l=s.ApplicationErrorStateCode.MISSING_QUESTIONS,E(`\ud83d Service Worker: Missing questions error - ${c.length} questions need attention`);break;case"failure":o=s.ApplicationErrorState.ERROR,i=e.message||s.ApplicationStatusMessage.APPLICATION_FAILED,l=s.ApplicationErrorStateCode.ERROR;break;case"buttonNotFound":o=s.ApplicationErrorState.ERROR,i=s.ApplicationStatusMessage.SUBMIT_FAILED,l=s.ApplicationErrorStateCode.ERROR}E(`\ud83d After switch - skipNewApplicationJob: ${p}, errorType: ${e.errorType}`),d.applicationState=o,d.progress=0,d.statusMessage=i,d.missingQuestions=c,d.appliedCount=r,d.errorType=e.errorType,p&&(d.autoSkipSeconds=0,E(`\u23ed\ufe0f Setting autoSkipSeconds to 0 for immediate skip: ${e.errorType}`)),await A({...d}),E("\uD83D\uDCE4 Service Worker: Sent complex form error to popup"),!p&&[(0,s.ApplicationErrorState).JOB_CLOSED,(0,s.ApplicationErrorState).ERROR,(0,s.ApplicationErrorState).MISSING_QUESTIONS,(0,s.ApplicationErrorState).CAPTCHA_REQUIRED].includes(o)&&await k(o,async()=>{E(`\u23f0 Auto-skip timer triggered for ${o}`);let e="Others";o===s.ApplicationErrorState.CAPTCHA_REQUIRED?e="Captcha Failed":o===s.ApplicationErrorState.MISSING_QUESTIONS&&(e="Missing Questions"),await w(e,!0)});let u=await W(t?.tab?.windowId)||"";E("\uD83D\uDCF8 Screenshot captured for error");let{isErrorProcessing:m}=await chrome.storage.local.get("isErrorProcessing");!0!==m&&(await chrome.storage.local.set({isErrorProcessing:!0}),d.applicationDetails&&await v(d.applicationDetails,l,String(i),{errorType:e.errorType},u),E(`\ud83d Checking skipNewApplicationJob: ${p}`),p?(E(`\u23f3 Waiting 5 seconds before loading next job.`),await new Promise(e=>setTimeout(e,5e3)),await chrome.storage.local.set({isErrorProcessing:!1}),await x(),E(`\u2705 Load completed`)):(await chrome.storage.local.set({isErrorProcessing:!1}),E(`\u2139\ufe0f Not skipping immediately - skipNewApplicationJob is false`)))})(),!0;if("COMPLEX_FORM_PROGRESS"===e.type)return(async()=>{if(E("\uD83D\uDCE5 Service Worker: Received complex form progress:",e),e?.removeNotification&&chrome.tabs.sendMessage(n,{type:"REMOVE_AUTOFILL_NOTIFICATION"}).catch(()=>{}),!d){E("\u26a0\ufe0f Service Worker: No auto-apply state for complex form progress");return}let t=await chrome.storage.local.get("appliedCount"),a=t.appliedCount||0;d.applicationState=s.ApplicationPopStatus.IN_PROGRESS,d.progress=e.progress||d.progress,d.statusMessage=e.message||d.statusMessage,d.appliedCount=a,e?.autoSkipSeconds!==void 0&&(d.autoSkipSeconds=e.autoSkipSeconds),await A({...d})})(),!0;if("AUTO_APPLY_RETRY"===e.type)return(async()=>{E("\uD83D\uDD04 Service Worker: Retrying auto-apply process");try{T();let t=e.applicationDetails||d?.applicationDetails;if(!t){I("\uD83D\uDD34 Service Worker: No application details available for retry"),I("Debug: request.applicationDetails =",e.applicationDetails),I("Debug: autoApplyState?.applicationDetails =",d?.applicationDetails);try{let e=await chrome.storage.local.get("preferredJobsite"),a=e.preferredJobsite,r=await (0,o.optimhireApi).getApplicationDetails(a),i={};i=r?.data?.data??null,E(`\u2705 Loaded next job: ${i?.source?.job_title}`),i?.seeker&&await chrome.storage.local.set({cachedSeekerInfo:i.seeker}),t=i}catch(e){t=null}}E(`\u2713 Retrying application for: ${t.source?.job_title||"Unknown job"}`),await U(t,!0),a({success:!0})}catch(e){I("\uD83D\uDD34 Service Worker: Error retrying auto-apply:",e),a({success:!1,error:e.message})}})(),!0;if("AUTO_APPLY_STOP"===e.type)return(async()=>{(0,p.GoogleAnalytics).trackEvent(u.AnalyticsEvent.STOP_PILOT,{}),E("\u23f9\ufe0f Service Worker: Stopping auto-apply process");try{y(),E("\u2705 Service Worker: Auto-apply stopped successfully"),a({success:!0})}catch(e){I("\uD83D\uDD34 Service Worker: Error stopping auto-apply:",e),a({success:!1,error:e.message})}})(),!0;if("AUTH_CLEARED"===e.type)return(async()=>{E("\uD83D\uDDD1\ufe0f Service Worker: Auth cleared, resetting state"),d=null,T()})(),!0;if("MANUAL_FORM_ERROR_SUCCESS_MESSAGE"===e.type)return(async()=>{if(chrome.storage.local.remove(["isManualSubmit","manualApplicationDetail","manualComplexInstructions"]),e?.isSuccess){try{let e=await chrome.storage.local.get([r.OPTIMHIRE_CONFIG.api.authTokenKey,"candidateId"]);e[r.OPTIMHIRE_CONFIG.api.authTokenKey]&&e.candidateId&&await N(e[r.OPTIMHIRE_CONFIG.api.authTokenKey],e.candidateId)}catch(e){}chrome.runtime.sendMessage({type:"MANUALLY_APPLY_STATE_UPDATE",isManualSubmited:!0}).catch(()=>{}),E("\uD83D\uDCE4 Service Worker: Sent complex form error to popup");let{isSuccessProcessing:a}=await chrome.storage.local.get("isSuccessProcessing");if(E(a,"isProcessing"),!0===a)return;chrome.tabs.sendMessage(n,{type:"SUCCESS_CONFINITY_SCREEN"}).catch(()=>{}),await chrome.storage.local.set({isSuccessProcessing:!0}),await v(e?.applicationDetails,"1",e.message||"Application successfully submitted",{},null,null,null,!0),await new Promise(e=>setTimeout(e,500)),await chrome.storage.local.set({isSuccessProcessing:!1}),chrome.tabs.sendMessage(n,{type:"REMOVE_CONFINITY_SCREEN"}).catch(()=>{}),G(t?.tab?.id);return}let a=s.ApplicationErrorState.ERROR,o=e.message||s.ApplicationStatusMessage.GENERIC_ERROR,i=e.missingQuestions||[],c="2",l=!1,p=!1;switch(e.errorType){case"alreadyApplied":a=s.ApplicationErrorState.ALREADY_APPLIED,o=e.message||s.ApplicationStatusMessage.ALREADY_APPLIED,c=s.ApplicationErrorStateCode.ALREADY_APPLIED,l=!0;break;case"redirectToCompanySite":a=s.ApplicationErrorState.ERROR,o=s.ApplicationStatusMessage.REDIRECT_TO_COMPANY_SITE,c=s.ApplicationErrorStateCode.REDIRECT_TO_COMPANY_SITE,l=!0,p=!0;break;case"incomplete":a=s.ApplicationErrorState.ERROR,o=e.message,c=s.ApplicationErrorStateCode.ERROR;break;case"jobClosed":a=s.ApplicationErrorState.JOB_CLOSED,o=s.ApplicationStatusMessage.JOB_CLOSED,c=s.ApplicationErrorStateCode.JOB_CLOSED,l=!0,p=!0;break;case"captcha":a=s.ApplicationErrorState.CAPTCHA_REQUIRED,o=s.ApplicationStatusMessage.CAPTCHA_REQUIRED,c=s.ApplicationErrorStateCode.CAPTCHA_REQUIRED,E("\uD83E\uDD16 Service Worker: Captcha error detected");break;case"submissionError":a=s.ApplicationErrorState.ERROR,o=e.message||"Application submission failed due to system error",c=s.ApplicationErrorStateCode.ERROR,E(`\ud83d Service Worker: Submission error - ${o}`);break;case"missing-questions":a=s.ApplicationErrorState.MISSING_QUESTIONS,o=s.ApplicationStatusMessage.MISSING_QUESTIONS,c=s.ApplicationErrorStateCode.MISSING_QUESTIONS;break;case"submit-failed":a=s.ApplicationErrorState.MISSING_QUESTIONS,o=s.ApplicationStatusMessage.MISSING_QUESTIONS,c=s.ApplicationErrorStateCode.MISSING_QUESTIONS,E(`\ud83d Service Worker: Missing questions error - ${i.length} questions need attention`);break;case"failure":a=s.ApplicationErrorState.ERROR,o=e.message||s.ApplicationStatusMessage.APPLICATION_FAILED,c=s.ApplicationErrorStateCode.ERROR}let{isErrorProcessing:u}=await chrome.storage.local.get("isErrorProcessing");if(!0===u)return;await chrome.storage.local.set({isErrorProcessing:!0});let d=await W(t?.tab?.windowId)||"";if(E("\uD83D\uDCF8 Screenshot captured for error"),await v(e?.applicationDetails,c,String(o),{errorType:e.errorType},d,null,null,!0),p){let e={isActive:!1,applicationDetails:null,applicationState:a,progress:100,statusMessage:o,appliedCount:0};chrome.runtime.sendMessage({type:"MANUALLY_APPLY_STATE_UPDATE",manuallyAply:e}).catch(e=>{E("\u26a0\ufe0f Error sending no-jobs manual apply state update:",e)})}l&&(await new Promise(e=>setTimeout(e,500)),await chrome.storage.local.set({isErrorProcessing:!1}),G(t?.tab?.id)),await chrome.storage.local.set({isErrorProcessing:!1})})(),!0;if("MANUAL_FORM_PROGRESS"===e.type)return(async()=>{chrome.runtime.sendMessage({type:"MANUALLY_APPLY_STATE_UPDATE",isRunningJobApply:!0}).catch(e=>{E("\u26a0\ufe0f Error sending no-jobs manual apply state update:",e)})})(),!0;if("MANUAL_APPLY_STOP"===e.type)return(async()=>{y()})(),!0;if("LOAD_CANDIDATE_INFO"===e.action)return E("\uD83D\uDD04 Service Worker: Loading candidate info requested by popup"),(async()=>{try{let e=await chrome.storage.local.get([r.OPTIMHIRE_CONFIG.api.authTokenKey,"candidateId"]);if(e[r.OPTIMHIRE_CONFIG.api.authTokenKey]&&e.candidateId){E("\uD83D\uDE80 Service Worker: Starting candidate details fetch");try{let t=await N(e[r.OPTIMHIRE_CONFIG.api.authTokenKey],e.candidateId);E("\u2705 Service Worker: Successfully loaded candidate details"),a({success:!0,candidateDetails:t})}catch(e){I("\uD83D\uDD34 Service Worker: Error loading candidate info:",e),"Authentication failed"===e.message?a({success:!1,error:e.message,authError:!0}):a({success:!1,error:e.message})}finally{E("\uD83C\uDFC1 Service Worker: Finished candidate details fetch")}}else I("\uD83D\uDD34 Service Worker: No auth data found for candidate loading"),a({success:!1,message:"No auth data found"})}catch(e){I("\uD83D\uDD34 Service Worker: Error handling LOAD_CANDIDATE_INFO:",e),a({success:!1,error:e.message})}})(),!0;if("CHECK_COOKIE"===e.action)return(async()=>{E("\uD83C\uDF6A Service Worker: Checking cookie");try{let t=e.domain.startsWith(".")?e.domain.substring(1):e.domain,r=`https://${t}`,o=await chrome.cookies.get({name:e.cookieName,url:r});o?(E(`\u2705 Cookie "${e.cookieName}" exists`),a({exists:!0,cookie:o})):(E(`\u274c Cookie "${e.cookieName}" not found`),a({exists:!1}))}catch(e){E("Cookie check failed:",e),a({exists:!1,error:e.message})}})(),!0;if("FETCH_ADDITIONAL_REQUIREMENTS"===e.action)return(async()=>{try{E("\uD83D\uDCE5 Service Worker: Fetching additional requirements from API"),E(`   Job ID: ${e.jobId}`),E(`   Application ID: ${e.applicationId}`),E(`   Requirements count: ${e.requirements?.length||0}`);let t=!1,r=await chrome.storage.local.get(["autoApplyState"]),i=r?.autoApplyState?.applicationDetails?.copilot_job_id;if(E(`${i} 'CheckID' ${e.jobId}`),!i){E("job ID is missing"),a({success:!1,error:"Unknown error"});return}if(i&&e?.jobId!=i){E("Log when a job ID is missing"),a({success:!1,error:"Unknown error"});return}E(`${i} 'Passed' ${e.jobId}`);let s=q(e.requirements);if(0===s.length){E("No requirements to fetch"),a({success:!1,error:"No requirements to fetch"});return}if(t&&e?.jobId!=i){E("API is hitting multiple time");return}t=!0;let n=await Promise.race([(0,o.optimhireApi).fetchAdditionalRequirements(e.jobId,e.applicationId,s),new Promise(e=>setTimeout(()=>e(null),18e4))]);t=!0,E("\u2705 Service Worker: Successfully fetched additional requirements from API"),E(`   Received ${n?.seeker?.seeker_response?.length||0} answers`),n?.seeker?.seeker_response?.length&&n?.seeker?.show_missing_detail?H(e.jobId,s):chrome.storage.local.set({isMissingUIShow:{isShow:!1,time:Date.now()}}),a({success:!0,data:n})}catch(e){E("\u274c Service Worker: Error fetching additional requirements:",e),a({success:!1,error:e instanceof Error?e.message:"Unknown error"})}})(),!0;if("GET_AUTH_COOKIES"===e.action)return(async()=>{try{let[e,t]=await Promise.all([new Promise(e=>{chrome.cookies.get({url:r.OPTIMHIRE_CONFIG.urls.appURL,name:r.OPTIMHIRE_CONFIG.appCookie.at},t=>e(t))}),new Promise(e=>{chrome.cookies.get({url:r.OPTIMHIRE_CONFIG.urls.appURL,name:r.OPTIMHIRE_CONFIG.appCookie.did},t=>e(t))})]);if(!e){await chrome.storage.local.clear(),a({success:!1,error:"cookie not found"});return}let o={token:e?.value||null,developerId:t?.value||null},i=await chrome.storage.local.get(["candidateId"]),s={[r.OPTIMHIRE_CONFIG.api.authTokenKey]:o.token};o?.developerId&&(s.candidateId=o.developerId),o?.developerId!==i.candidateId&&(s.candidateDetails=null),await chrome.storage.local.set(s),a({success:!0,...o})}catch(e){await chrome.storage.local.clear(),a({success:!1,error:"Failed to read cookies"})}})(),!0;if("AUTO_APPLY_SKIP"===e.action)return E(`\u23ed\ufe0f Service Worker: Skipping job - Reason: ${e.skipReason||"user_skip"}`),(async()=>{try{T();let r=await chrome.storage.local.get("appliedCount"),o=r.appliedCount||0,i=o+1;if(await chrome.storage.local.set({appliedCount:i}),E(`\ud83d Service Worker: Incremented appliedCount from ${o} to ${i}`),d?.applicationDetails||e.applicationDetails){let a=d?.applicationDetails||e.applicationDetails;if(E("\uD83D\uDD04 Service Worker: Updating application status to skipped"),!e.stopStatus){let r=await W(t?.tab?.windowId)||"";await v(a,e.status||"4",e.status_message||`Skipped by ${e.skipReason||"user"}`,e.error||{reason:e.skipReason},r,e.ats_name||"")}}await A({isActive:!0,applicationDetails:null,applicationState:s.ApplicationPopStatus.IN_PROGRESS,progress:0,statusMessage:"Loading next job...",appliedCount:i}),E("\uD83D\uDCE4 Service Worker: Sent loading state to popup"),E("\uD83D\uDD04 Service Worker: Loading next job after skip");let n=await M();n?(E("\uD83D\uDE80 Service Worker: Starting application process for next job"),await A({isActive:!0,applicationDetails:n,applicationState:s.ApplicationPopStatus.IN_PROGRESS,progress:0,statusMessage:"Opening job page...",appliedCount:i}),await new Promise(e=>setTimeout(e,500)),await U(n)):(E("\uD83C\uDFC1 Service Worker: No more jobs available, completing auto-apply"),await A({isActive:!1,applicationDetails:null,applicationState:"no-jobs",progress:100,statusMessage:"No more jobs available",appliedCount:i}),chrome.runtime.sendMessage({type:"AUTO_APPLY_COMPLETE"}).catch(()=>{}),y()),a({success:!0})}catch(e){I("\uD83D\uDD34 Service Worker: Error skipping job:",e),a({success:!1,error:e.message})}})(),!0;if("START_COPILOT_WEB"===e.action)return(0,p.GoogleAnalytics).trackEvent(u.AnalyticsEvent.START_PILOT,{}),(async()=>{E("\uD83D\uDE80 Service Worker: Starting copilot process");try{(0,l.setCookie)(r.OPTIMHIRE_CONFIG.urls.appURL,r.OPTIMHIRE_CONFIG.appCookie.isPilotRunning,"true","/"),await chrome.storage.local.set({isAutoProcessStartJob:!0,appliedCount:0}),E("\uD83D\uDCBE Service Worker: Initialized appliedCount to 0"),await new Promise(e=>setTimeout(e,1e3)),chrome.runtime.sendMessage({type:"SIDE_PANEL_RELOAD"}).catch(()=>{});let e=null;if(i.USE_MOCK_DATA)E("\uD83E\uDDEA Service Worker: Using mock application details"),e=(0,i.mockApplicationDetails)(r.OPTIMHIRE_CONFIG.autoApply.mockDataType),e?.seeker&&(await chrome.storage.local.set({cachedSeekerInfo:e.seeker}),E("\uD83D\uDCBE Service Worker: Cached mock seeker info for autofill"));else{E("\uD83D\uDCE1 Service Worker: Fetching real application details");let{preferredJobsite:t}=await chrome.storage.local.get("preferredJobsite");t?E(`\ud83c Service Worker: Using preferred jobsite: ${t}`):E("\u26a0\ufe0f Service Worker: No preferred jobsite set, using default");let r=await (0,o.optimhireApi).getApplicationDetails(t);if(r?.error?.message&&(r?.status===404||r?.status===403)){let e=t?`No more jobs available for ${t}`:"No more jobs available";E("\uD83C\uDFC1 Service Worker: No jobs available when starting copilot"),await A({isActive:!0,applicationDetails:null,applicationState:"no-jobs",progress:100,statusMessage:e,appliedCount:0}),E("\uD83D\uDCE4 Service Worker: Sent no-jobs state to popup"),a({success:!0,noJobs:!0});return}e=r?.data?.data??null}if(!e){E("\uD83C\uDFC1 Service Worker: No job details available - showing no jobs state"),await A({isActive:!0,applicationDetails:null,applicationState:"no-jobs",progress:100,statusMessage:"No more jobs available",appliedCount:0}),E("\uD83D\uDCE4 Service Worker: Sent no-jobs state to popup"),a({success:!0,noJobs:!0});return}await A({isActive:!0,applicationDetails:e,applicationState:s.ApplicationPopStatus.IN_PROGRESS,progress:0,statusMessage:"Opening job page...",appliedCount:0}),E("\uD83D\uDCE4 Service Worker: Sent initial copilot state to popup"),await U(e),a({success:!0})}catch(e){I("\uD83D\uDD34 Service Worker: Error starting copilot:",e),await A({isActive:!0,applicationDetails:null,applicationState:"error",progress:0,statusMessage:"Error starting application",appliedCount:0}),E("\uD83D\uDCE4 Service Worker: Sent start error to popup"),a({success:!1,error:e?.message})}})(),!0;if("OPEN_SIDE_PANEL"===e.action)return chrome.tabs.create({url:e.url?e.url:"about:blank",active:!0},e=>{$(e.id),chrome.storage.local.set({copilotTabId:e.id})}),setTimeout(()=>{a({success:!0})},300),!0;if("OPEN_MANUAL_APPLICATION"===e.action)return(async()=>{e?.isSkipped&&await v(m.applicationDetails,"4","Skipped by user",e.error||{reason:"user_skip"},e.screenshot_txt||"",e.applied_screenshot_url||"","",!0),e?.isSkipped||((0,l.setCookie)(r.OPTIMHIRE_CONFIG.urls.appURL,r.OPTIMHIRE_CONFIG.appCookie.isPilotRunning,"true","/"),(0,p.GoogleAnalytics).trackEvent(u.AnalyticsEvent.START_PILOT_MANUAL,{}),chrome.storage.local.set({isManuallyStartJob:!0})),await new Promise(e=>setTimeout(e,1e3));let t=null,{copilotTabId:o}=await chrome.storage.local.get("copilotTabId");if(o)t=o;else{let[e]=await chrome.tabs.query({active:!0,currentWindow:!0});if(e&&e.id)t=e?.id;else{E(`\u26a0\ufe0f No active tab found \u2014 creating new one`);let e=await chrome.tabs.create({url:"about:blank",active:!0});t=e?.id}}if(t){chrome.runtime.sendMessage({type:"SIDE_PANEL_MANUAL_RELOAD"}).catch(()=>{}),G(t);return}a({status:!1,error:"Could not open job page"})})(),!0;if("OPEN_UPGRADE_MEMBERSHIP_PAGE"===e.action&&(async()=>{let t,a="upgrade"==e.type?r.OPTIMHIRE_CONFIG.urls.upgradeMembership:r.OPTIMHIRE_CONFIG.urls.upgradeMembershipModel,[o]=await chrome.tabs.query({active:!0,currentWindow:!0});t=o&&o.id?o:await chrome.tabs.create({url:"about:blank",active:!0}),await chrome.tabs.update(t.id,{url:a})})(),"START_SINGLE_MANUAL_APPLICATION"===e.action)return(0,p.GoogleAnalytics).trackEvent(u.AnalyticsEvent.START_SINGLE_APPLY_JOB,{}),(async()=>{let{copilotTabId:t}=await chrome.storage.local.get("copilotTabId");await new Promise(e=>setTimeout(e,1e3)),e.openAutoAply?chrome.runtime.sendMessage({type:"SIDE_PANEL_RELOAD"}).catch(()=>{}):chrome.runtime.sendMessage({type:"SIDE_PANEL_MANUAL_RELOAD"}).catch(()=>{});let a=await (0,o.optimhireApi).getApplicationDetailsById(e.jobId,e.jobTab),i=null;a?.status===200&&(i=a?.data?.data??null),await new Promise(e=>setTimeout(e,1e3));try{if(e.openAutoAply){if(!i){E("\uD83C\uDFC1 No more jobs available"),await A({isActive:!1,applicationDetails:null,applicationState:"no-jobs",progress:100,statusMessage:"No more jobs available",appliedCount:0}),y();return}(0,l.setCookie)(r.OPTIMHIRE_CONFIG.urls.appURL,r.OPTIMHIRE_CONFIG.appCookie.isPilotRunning,"true","/"),await chrome.storage.local.set({isAutoProcessStartJob:!0}),await chrome.storage.local.set({appliedCount:0}),E("\uD83D\uDCBE Service Worker: Initialized appliedCount to 0"),await new Promise(e=>setTimeout(e,1e3)),await A({isActive:!0,applicationDetails:i,applicationState:s.ApplicationPopStatus.IN_PROGRESS,progress:0,statusMessage:"Opening job page...",appliedCount:0}),E("\uD83D\uDCE4 Service Worker: Sent initial copilot state to popup"),await U(i);return}if(!e.openAutoAply&&t){if(chrome.storage.local.set({isManuallyStartJob:!0}),(0,l.setCookie)(r.OPTIMHIRE_CONFIG.urls.appURL,r.OPTIMHIRE_CONFIG.appCookie.isPilotRunning,"true","/"),m.applicationDetails=i,!i){E("\uD83C\uDFC1 No more jobs available"),chrome.runtime.sendMessage({type:"MANUALLY_APPLY_STATE_UPDATE",manuallyAply:{applicationState:"check-job"},isLoadingNextJob:!0}).catch(e=>{E("\u26a0\ufe0f Error sending no-jobs manual apply state update:",e)}),await new Promise(e=>setTimeout(e,500)),chrome.runtime.sendMessage({type:"MANUALLY_APPLY_STATE_UPDATE",manuallyAply:{isActive:!1,applicationDetails:null,applicationState:"no-jobs",progress:100,statusMessage:"No more jobs available",appliedCount:0}}).catch(e=>{E("\u26a0\ufe0f Error sending no-jobs manual apply state update:",e)});return}j(i,t);return}}catch(e){E("\u274c Error updating tab with apply_now_url:",e)}})(),!0;if("FOCUSED_ACTIVE_TAB"===e.action){try{chrome.storage.local.get("copilotTabId",async e=>{e?.copilotTabId?(chrome.tabs.update(e?.copilotTabId,{active:!0}),$(e?.copilotTabId),a({status:!0})):a({status:!1})})}catch(e){a({status:!0})}return!0}return"COPILOT_TABID"===e.action?(chrome.storage.local.get("copilotTabId",e=>{let t=e?.copilotTabId;if(!t){a({sameTab:!1});return}if(n===t){a({sameTab:!0});return}a({sameTab:!1})}),!0):"ATS_PAGE_QUESTIONS"===e.action?((async()=>{d&&(await chrome.storage.local.set({pageQuestions:e.questions}),chrome.runtime.sendMessage({type:"UPDATE_PAGE_QUESTIONS",questions:e?.questions}).catch(()=>{}))})(),!0):"ATS_QUESTION_RESULT"===e.action?((async()=>{let t=[],a=await chrome.storage.local.get("pageQuestions");if(Array.isArray(a.pageQuestions)&&(t=a.pageQuestions),t.length>0){let a=(e.questionName||"").toLowerCase().trim(),r=e.status,o=t.map(t=>{let o=(t.name||"").toLowerCase().trim();return o===a||o&&a&&-1!==o.indexOf(a)?{...t,status:r||(e.success?"success":"failed")}:t});await chrome.storage.local.set({pageQuestions:o}),d&&chrome.runtime.sendMessage({type:"UPDATE_PAGE_QUESTIONS",questions:o}).catch(()=>{})}})(),!0):"SAVE_MISSING_DETAILS"===e.action?((async()=>{try{let t=e?.payload;try{if(!t?.missing_details||!t?.missing_details?.job_post_id)throw Error("Missing required details (must contain copilot_job_id)");E("\uD83D\uDCE5 Saving missing details for job:",t.missing_details.job_post_id);let e=await (0,o.optimhireApi).saveMissingJobDetails(t.missing_details.job_post_id,t);E("\u2705 Successfully saved missing job details:",e),a({success:!0,data:e})}catch(e){E("\u274c Error saving missing details:",e),a({success:!1,error:String(e)})}}catch(e){E("\u274c Error in SAVE_MISSING_DETAILS handler:",e),a({success:!1,error:String(e)})}})(),!0):"CHECK_IF_SIDE_PANEL_IS_OPEN"===e.action?((async()=>{B(),a({success:!0})})(),!0):"OPEN_SIDE_PANEL_BY_TOAST_CLICK"===e.action?((async()=>{chrome.storage.local.set({openSidepanelInTab:!0});try{chrome.storage.local.get("copilotTabId",async e=>{if(e?.copilotTabId){chrome.tabs.update(e?.copilotTabId,{active:!0}),$(e?.copilotTabId);return}})}catch(e){E("Cannot open side panel:",e)}})(),!0):void 0}),chrome.runtime.onInstalled.addListener(async e=>{E("\uD83D\uDD27 Service Worker: Extension installed/updated",e);try{d=null,T();let e=await chrome.storage.local.get(["preferredJobsite"]);await chrome.storage.local.clear(),e.preferredJobsite?(await chrome.storage.local.set({preferredJobsite:e.preferredJobsite}),E(`\ud83e Service Worker: Cleared storage but preserved jobsite: ${e.preferredJobsite}`)):E("\uD83E\uDDF9 Service Worker: Cleared all storage on extension reload"),chrome.contextMenus.create({id:"openSidePanel",title:"Open Optim Hire panel",contexts:["all"]})}catch(e){E("\u274c Service Worker: Error clearing storage:",e)}chrome.runtime.setUninstallURL(r.OPTIMHIRE_CONFIG.urls.feedbackUrl),(0,l.injectHiddenElementIfOptimhire)(),"install"===e.reason&&((0,l.focusOrOpenMyJobsTab)(),(0,p.GoogleAnalytics).trackEvent(u.AnalyticsEvent.INSTALL,{})),E("\u2705 Service Worker: Startup complete")}),chrome.runtime.onStartup.addListener(async()=>{E("\uD83D\uDE80 Service Worker: Extension startup");try{let e=await chrome.storage.local.get(["preferredJobsite"]);await chrome.storage.local.clear(),e.preferredJobsite?(await chrome.storage.local.set({preferredJobsite:e.preferredJobsite}),E(`\ud83e Service Worker: Cleared storage but preserved jobsite: ${e.preferredJobsite}`)):E("\uD83E\uDDF9 Service Worker: Cleared all storage on extension startup")}catch(e){E("\u274c Service Worker: Error clearing storage on startup:",e)}d=null,T(),J(),E("\u2705 Service Worker: Startup complete")}),chrome.tabs.onRemoved.addListener(async e=>{let{copilotTabId:t}=await chrome.storage.local.get("copilotTabId");void 0!==t&&t===e&&(chrome.storage.local.remove("copilotTabId"),y())}),chrome.tabs.onActivated.addListener(async e=>{let t=e.tabId;S=t;let{copilotTabId:a,isManuallyStartJob:r,isAutoProcessStartJob:o}=await chrome.storage.local.get(["copilotTabId","isManuallyStartJob","isAutoProcessStartJob"]);void 0!==a&&a!=t&&(r||o)&&await chrome.sidePanel.setOptions({tabId:t,enabled:!1})}),chrome.action.onClicked.addListener(e=>{if(e.id)try{chrome.storage.local.get("copilotTabId",async t=>{if(t?.copilotTabId&&t?.copilotTabId!=e.id){chrome.tabs.update(t?.copilotTabId,{active:!0}),$(t?.copilotTabId);return}if(t?.copilotTabId&&t?.copilotTabId===e.id){$(t?.copilotTabId);return}t?.copilotTabId||$(e.id)})}catch(e){E("Cannot open side panel:",e)}}),chrome.notifications.onClicked.addListener(e=>{try{chrome.storage.local.get("copilotTabId",async e=>{if(e?.copilotTabId){chrome.tabs.update(e?.copilotTabId,{active:!0}),$(e?.copilotTabId);return}})}catch(e){E("Cannot open side panel:",e)}}),chrome.contextMenus.onClicked.addListener((e,t)=>{"openSidePanel"===e.menuItemId&&chrome.storage.local.get("copilotTabId",async e=>{if(e?.copilotTabId&&e?.copilotTabId!=t.id){chrome.tabs.update(e?.copilotTabId,{active:!0}),$(e?.copilotTabId);return}e?.copilotTabId||chrome.sidePanel.open({tabId:t.id})})}),chrome.runtime.onUpdateAvailable.addListener(e=>{console.log(`New version available:${e.version}`),chrome.runtime.reload()});let B=async()=>{try{chrome.storage.local.set({openSidepanelInTab:!0});let{copilotTabId:e}=await chrome.storage.local.get("copilotTabId");console.log(`copilotTabId: -----' ${e}`),e&&chrome.runtime.sendMessage({type:"IS_PANEL_OPEN"},e=>{console.log("Show notification-----",e),!chrome.runtime.lastError&&e&&e.is_panel_open||chrome.storage.local.set({openSidepanelInTab:!1})})}catch(e){chrome.storage.local.set({openSidepanelInTab:!1});return}}},{"./config/optimhire":"5zHFH","./services/api":"8j0lC","~services/mockData":"6TIpD","~config/status":"iDtzz","./config/keepAlive":"grMxa","~config/atsNames":"kZsez","~helper/autoPilotBackground":"hrmzu","~helper/GoogleAnalytics":"9lucQ","~helper/analyticsEvent":"cguIg"}],"5zHFH":[function(e,t,a){var r=e("@parcel/transformer-js/src/esmodule-helpers.js");r.defineInteropFlag(a),r.export(a,"GLOBAL_SUBAPP_URL",()=>i),r.export(a,"SERVICE_LOG",()=>s),r.export(a,"PANEL_LOG",()=>n),r.export(a,"CONTENT_LOG",()=>c),r.export(a,"OPTIMHIRE_CONFIG",()=>l);let o="https://optimhire.com",i="https://*.optimhire.com/*",s=!0,n=!0,c=!0,l={urls:{login:o+"/d/login",signup:o+"/d/signup",dashboard:o+"/dashboard",help:o+"/help",privacy:o+"/privacy",copilotSetup:o+"/d/copilot-form/1",upgrade:o+"/d/my-jobs?q=upgrade_copilot_plan",missingQuestions:o+"/d/screening-questions",myJobs:o+"/d/my-jobs",SearchJob:o+"/d/Search-job/",appURL:o,upgradeMembership:o+"/d/membership",upgradeMembershipModel:o+"/d/membership?openUpgradePlan=1",referralurl:o+"/d/my-jobs?openReferEarn=1",feedbackUrl:o+"/d/job-auto-applier-uninstall-feedback",updatepluginUrl:"chrome://extensions/",jobPostUrl:o+"/d/jv/",howItWorkUrl:"https://help.optimhire.com/how-to-use-the-optimhire-ai-job-auto-applier-extension/",whyOptimHireUrl:"https://help.optimhire.com/why-use-the-optimhire-ai-job-auto-applier/"},api:{baseUrl:o+"/api/v1",authTokenKey:"Talent_Auth_Token",candidateId:"developer_id"},support:{phone1:"+1 (415) 525 1604",phone2:"+1 (415) 718 7963",email:"support@optimhire.com"},extension:{version:"0.0.1",name:"OptimHire Copilot"},popup:{width:360},autoApply:{autoSkipDuration:5,loginWaitDuration:5,pageLoadDelay:3e3,mockDataType:"complex"},storage:{keys:{appliedCount:"appliedCount",autoApplyState:"autoApplyState",candidateDetails:"candidateDetails",preferredJobsite:"preferredJobsite"}},messages:{types:{stateUpdate:"AUTO_APPLY_STATE_UPDATE",candidateLoaded:"CANDIDATE_DETAILS_LOADED",authError:"AUTH_ERROR",autofillCompleted:"AUTOFILL_COMPLETED",formSubmitted:"FORM_SUBMITTED",complexFormError:"COMPLEX_FORM_ERROR"}},applicationStatus:{codes:{success:"1",error:"2",skipped:"4",notProcessed:"0"}},appCookie:{isPilotRunning:"isPilotRunning",at:"at",did:"did"},liveATS:["dice","jazzhr","indeed","workable","breezyhr","lever","manatal","greenhouse","workday","ziprecruiter","ziprecruiterpaid","jobvite","paylocity"]}},{"@parcel/transformer-js/src/esmodule-helpers.js":"f6DG4"}],f6DG4:[function(e,t,a){a.interopDefault=function(e){return e&&e.__esModule?e:{default:e}},a.defineInteropFlag=function(e){Object.defineProperty(e,"__esModule",{value:!0})},a.exportAll=function(e,t){return Object.keys(e).forEach(function(a){"default"===a||"__esModule"===a||t.hasOwnProperty(a)||Object.defineProperty(t,a,{enumerable:!0,get:function(){return e[a]}})}),t},a.export=function(e,t,a){Object.defineProperty(e,t,{enumerable:!0,get:a})}},{}],"8j0lC":[function(e,t,a){var r=e("@parcel/transformer-js/src/esmodule-helpers.js");r.defineInteropFlag(a),r.export(a,"OptimHireApi",()=>o.OptimHireApi),r.export(a,"optimhireApi",()=>o.optimhireApi);var o=e("./optimhireApi"),i=e("./types");r.exportAll(i,a)},{"./optimhireApi":"6BtW2","./types":"7rmWC","@parcel/transformer-js/src/esmodule-helpers.js":"f6DG4"}],"6BtW2":[function(e,t,a){var r=e("@parcel/transformer-js/src/esmodule-helpers.js");r.defineInteropFlag(a),r.export(a,"OptimHireApi",()=>n),r.export(a,"optimhireApi",()=>c);var o=e("./types");let i="https://optimhire.com/api/v1",s="Talent_Auth_Token";class n{constructor(){this.authToken=null,this.candidateId=null,this.candidateDetailsCache=null,this.loadAuthFromStorage(),chrome.storage.onChanged.addListener((e,t)=>{"local"===t&&(e[s]&&(this.authToken=e[s].newValue),e.candidateId&&(this.candidateId=e.candidateId.newValue))})}async loadAuthFromStorage(){try{let e=await chrome.storage.local.get([s,"candidateId"]);console.log("\uD83D\uDD0D Auth data loaded from storage:",e),this.authToken=e[s]||null,this.candidateId=e.candidateId||null}catch(e){console.error("Failed to load auth from storage:",e),this.authToken=null,this.candidateId=null}}async setAuthToken(e){this.authToken=e;try{await chrome.storage.local.set({[s]:e})}catch(e){console.error("Failed to save auth token to storage:",e)}}async clearAuth(){this.authToken=null,this.candidateId=null,this.candidateDetailsCache=null;try{await chrome.storage.local.remove([s,"candidateId","candidateDetails"]),chrome.runtime.sendMessage({type:"AUTH_CLEARED"}).catch(()=>{})}catch(e){console.error("Failed to clear auth from storage:",e)}}isAuthenticated(){return!!this.authToken}async getCandidateId(){if(this.candidateId)return this.candidateId;try{let e=await chrome.storage.local.get(["candidateId"]);if(e.candidateId)return this.candidateId=e.candidateId,this.candidateId}catch(e){console.error("Failed to load candidateId from storage:",e)}if(!this.authToken&&(await this.loadAuthFromStorage(),!this.authToken))throw new o.ApiError(401,"Authentication required. Please log in.");try{let e=this.authToken.split(".");if(3===e.length){let t=JSON.parse(atob(e[1]));if(t.user_id||t.candidate_id||t.id)return this.candidateId=String(t.user_id||t.candidate_id||t.id),await chrome.storage.local.set({candidateId:this.candidateId}),this.candidateId}}catch(e){console.log("Unable to extract candidate ID from JWT token")}throw new o.ApiError(400,"Unable to determine candidate ID. Please log in again.")}async makeRequest(e,t,a){if(!this.authToken&&(await this.loadAuthFromStorage(),!this.authToken))throw new o.ApiError(401,"Authentication required. Please log in.");let r=`${i}${t}`;try{let t=await fetch(r,{method:e,headers:{"Content-Type":"application/json",Auth_Token:this.authToken},body:a?JSON.stringify(a):void 0});if(401===t.status||403===t.status){console.error(`Authentication failed: ${t.status} ${t.statusText}`),await this.clearAuth();try{chrome.runtime.sendMessage({type:"AUTH_ERROR",message:`Authentication failed: ${t.status} ${t.statusText}`})}catch(e){console.error("Failed to send auth error message:",e)}throw new o.ApiError(t.status,`Authentication failed: ${t.statusText}`)}let i=await t.json();if(!t.ok||0===i.status)throw new o.ApiError(t.status,i.message,i);return i}catch(e){if(e instanceof o.ApiError)throw e;if(e instanceof Error)throw new o.ApiError(500,e.message);throw new o.ApiError(500,"Unknown error occurred")}}async getCandidateDetails(){let e=await this.getCandidateId(),t=await this.makeRequest("GET",`/candidate/${e}`);return this.candidateDetailsCache=t.data,this.candidateId=e,t.data}async getApplicationDetails(e){let t=await this.getCandidateId(),a=`/candidate/${t}/application`;return e&&(a+=`?jobsite=${encodeURIComponent(e)}`),await this.apiRequest("GET",a)}async getApplicationDetailsById(e,t){let a=await this.getCandidateId(),r=`/candidate/${a}/application`;return e&&(r+=`?job_id=${encodeURIComponent(e)}`),t&&(r+=e?`&tab_name=${t}`:`?tab_name=${t}`),await this.apiRequest("GET",r)}async updateApplicationStatus(e,t){let a=await this.getCandidateId();await this.makeRequest("PUT",`/candidate/${a}/application/${e}/status`,t)}async fetchAdditionalRequirements(e,t,a){let r=await this.getCandidateId(),o={type:"copilot",application_id:t,requirements:a};e&&(o.job_id=e);let i=await this.makeRequest("POST",`/candidate/${r}/application/requirements`,o);return i.data}static async imageToBase64(e){return new Promise((t,a)=>{try{if(e instanceof HTMLCanvasElement){t(e.toDataURL("image/png"));return}let r=document.createElement("canvas"),o=r.getContext("2d");if(!o){a(Error("Failed to get canvas context"));return}r.width=e.width,r.height=e.height,o.drawImage(e,0,0),t(r.toDataURL("image/png"))}catch(e){a(e)}})}static async captureScreenshot(){try{let e=await chrome.tabs.captureVisibleTab(null,{format:"png",quality:90});return e}catch(e){throw console.error("Failed to capture screenshot:",e),new o.ApiError(500,"Failed to capture screenshot")}}async apiRequest(e,t,a){if(!this.authToken&&(await this.loadAuthFromStorage(),!this.authToken))return{success:!1,status:401,error:"Authentication required. Please log in."};let r=`${i}${t}`;try{let t=await fetch(r,{method:e,headers:{"Content-Type":"application/json",Auth_Token:this.authToken},body:a?JSON.stringify(a):void 0}),o=null;try{o=await t.json()}catch{o=null}if(!t.ok||o?.status===0)return{success:!1,status:t.status,error:o||t.statusText};return{success:!0,status:t.status,data:o}}catch(e){return{success:!1,status:500,error:e instanceof Error?e.message:"Unknown error occurred"}}}async updateCopilotMode(e){let t=await this.getCandidateId();return await this.apiRequest("POST",`/candidate/${t}/settings`,{copilot_mode:e})}async getJobQuestions(e){let t=await this.getCandidateId(),a=`/candidate/${t}/jobs/${e}/questions?status=missing-questions`,r=await this.makeRequest("GET",a);return r}async saveMissingJobDetails(e,t){let a=await this.getCandidateId(),r=`/candidate/${a}/jobs/${e}/questions?action=save-answers`;return this.makeRequest("POST",r,t)}}let c=new n},{"./types":"7rmWC","@parcel/transformer-js/src/esmodule-helpers.js":"f6DG4"}],"7rmWC":[function(e,t,a){var r=e("@parcel/transformer-js/src/esmodule-helpers.js");r.defineInteropFlag(a),r.export(a,"ApiError",()=>o);class o extends Error{constructor(e,t,a){super(t),this.status=e,this.message=t,this.data=a,this.name="ApiError"}}},{"@parcel/transformer-js/src/esmodule-helpers.js":"f6DG4"}],"6TIpD":[function(e,t,a){var r=e("@parcel/transformer-js/src/esmodule-helpers.js");r.defineInteropFlag(a),r.export(a,"mockCandidateDetails",()=>o),r.export(a,"USE_MOCK_DATA",()=>i),r.export(a,"IGNORE_MISSING_QUESTION",()=>s),r.export(a,"mockApplicationDetails",()=>n),r.export(a,"mockApplicationDetailsComplex",()=>c);let o={first_name:"Michael",last_name:"Kaminski",is_copilot_active:"1",profile_image:"https://optimhire.com/assets/img/avatar-blue.svg",help_text:"+1 (415) 525 1604 | +1 (415) 718 7963",is_copilot_automatic_apply_to_job:"1",matching_job_count:"100",applied_count:"2045",copilot_status:"PAID",is_missing_questions:!1,free_left_credits:0,referral_url:"",is_first_attempt_completed:"1",plugin_version:{chrome:"1.0.2",safari:"1.0.4",firefox:"1.0.4",edge:"1.0.4"}},i=!1,s=i,n=(e="complex")=>{if("complex"===e)return c},c={seeker:{zip:0,city:"New York",email:"dyexjjqhcnmxmedfcz@nesopf.com",state:"New York",gender:"male",resume:"https://mrd-live.s3.amazonaws.com/mrd-developer-resume/2025121012463020251204063625Rathipriya_Vijayaraghavan.pdf",address:"New York, NY, USA",country:"United States",last_name:"Ravi",first_name:"Priya",mobile_num:"9618856334",desired_pay:1e5,mobile_code:"1",currency_type:"USD",current_salary:8e3,expected_salary:1e5,seeker_response:[],linkedin_profile_url:"https://www.linkedin.com/in/rathipriya-vijay/",is_watermarked_resume:0,notice_period_in_days:1},source:{country:"United States",apply_now_url:"https://jobs.lever.co/sensortower/24554454-3b59-4a50-8106-766b1f5719e2/apply",job_title:"Senior Software Engineer - Java (m/f/d)",company_name:"Sport Alliance GmbH"},ats_name:"Lever",mongodb_id:"686a1e2c1a3f4ce9a10e636c",copilot_job_id:2584912,application_id:"2983995",additional_info:{id:"12",source_name:"Lever",additional_info:'{"multiFormFlag":true,"requiresLogin":false,"isCaptchaRequired":false,"multiFormData":[{"type":"lastButtonText","lastButtonText":"Submit application"}],"applicationStatus":{"success":[{"type":"screenText","screenText":"Application submitted!"}],"failure":[{"type":"toasterText","toasterText":"Please fill out this field"}],"alreadyApplied":[{"type":"screenText","screenText":"Your application was already submitted"}],"jobClosed":[{"type":"screenText","screenText":"Sorry, we couldn\'t find anything here"}]},"requiredquestionstatus":[{"type":"class","selector":".required"}],"mandatory_fields_errors_text":["Please fill out this feild."],"mandatory_fields_errors_elements":[".required",".field-error"]}'}}},{"@parcel/transformer-js/src/esmodule-helpers.js":"f6DG4"}],iDtzz:[function(e,t,a){var r,o,i,s,n,c,l,p,u,d,m,g,h=e("@parcel/transformer-js/src/esmodule-helpers.js");h.defineInteropFlag(a),h.export(a,"ApplicationStatus",()=>c),h.export(a,"ApplicationErrorState",()=>l),h.export(a,"ApplicationStatusMessage",()=>p),h.export(a,"ApplicationErrorStateCode",()=>u),h.export(a,"ApplicationErrorType",()=>d),h.export(a,"ApplicationPopStatus",()=>m),h.export(a,"ApplicationMessagestatus",()=>g),(r=c||(c={})).NOT_PROCESSED="0",r.SUCCESS="1",r.FAILED="2",r.CLOSED="3",r.SKIPPED="4",(o=l||(l={})).ERROR="error",o.ALREADY_APPLIED="already-applied",o.JOB_CLOSED="job-closed",o.CAPTCHA_REQUIRED="captcha-required",o.MISSING_QUESTIONS="missing-questions",o.LOGIN_REQUIRED="login-required",o.REDIRECT_TO_COMPANY_SITE="redirect-to-company-site",o.SUBMISSION_ERROR="submission-error",o.BUTTON_NOT_FOUND="button-not-found",(i=p||(p={})).ALREADY_APPLIED="Already applied to this job",i.JOB_CLOSED="Job posting has closed",i.REDIRECT_TO_COMPANY_SITE="Apply on company site",i.CAPTCHA_REQUIRED="Captcha Failed",i.MISSING_QUESTIONS="Missing Questions",i.APPLICATION_FAILED="Others",i.GENERIC_ERROR="Others",i.LOGIN_REQUIRED="Require Login",i.SUBMIT_FAILED="Submit button not found",(s=u||(u={})).ERROR="2",s.ALREADY_APPLIED="2",s.JOB_CLOSED="3",s.CAPTCHA_REQUIRED="2",s.MISSING_QUESTIONS="2",s.LOGIN_REQUIRED="2",s.REDIRECT_TO_COMPANY_SITE="2",(n=d||(d={})).ALREADY_APPLIED="alreadyApplied",n.JOB_CLOSED="jobClosed",n.CAPTCHA_REQUIRED="captcha",n.MISSING_QUESTIONS="missing-questions",n.SUBMIT_FAILED="submit-failed",n.FAILURE="failure",(m||(m={})).IN_PROGRESS="in-progress",(g||(g={})).IS_CLOSE="Job posting is closed"},{"@parcel/transformer-js/src/esmodule-helpers.js":"f6DG4"}],grMxa:[function(e,t,a){var r=e("@parcel/transformer-js/src/esmodule-helpers.js");r.defineInteropFlag(a),r.export(a,"setupKeepAlive",()=>i);let o={info:console.info.bind(console,"[keepAlive]"),debug:console.debug.bind(console,"[keepAlive]"),warn:console.warn.bind(console,"[keepAlive]")};function i(){o.info("Initializing keep alive mechanism...");let e=null,t=async(e,t,r)=>{t.url&&/^(file|https?):/.test(t.url)&&(o.debug(`Detected tab update url (${t.url}), retrying keepAlive`),a())},a=async()=>{let a;if(e){o.debug("Lifeline already exists, skipping keepAlive.");return}try{a=await chrome.tabs.query({url:"*://*/*"}),o.debug(`Queried tabs count: ${a.length}`)}catch(e){o.warn("Failed to query tabs",e),a=[]}for(let e of a)try{await chrome.scripting.executeScript({target:{tabId:e.id},func:()=>window.chrome.runtime.connect({name:"keepAlive"})}),o.info(`Successfully injected keepAlive script into tab ${e.id}`),chrome.tabs.onUpdated.removeListener(t);return}catch(t){o.debug(`Failed to inject keepAlive in tab ${e.id}:`,t)}o.warn("Unable to inject keepAlive, waiting for a tab update..."),chrome.tabs.onUpdated.addListener(t)},r=()=>{if(o.info("Forcing keepAlive refresh"),e){try{e.disconnect(),o.debug("Disconnected old lifeline")}catch(e){o.warn("Error disconnecting lifeline",e)}e=null}a()};chrome.runtime.onConnect.addListener(t=>{"keepAlive"===t.name&&(o.info("Lifeline established via port connect"),e=t,setTimeout(r,295e3),t.onDisconnect.addListener(r))}),a()}},{"@parcel/transformer-js/src/esmodule-helpers.js":"f6DG4"}],kZsez:[function(e,t,a){var r=e("@parcel/transformer-js/src/esmodule-helpers.js");r.defineInteropFlag(a),r.export(a,"atsNamesWithoutSuccessURLCheck",()=>o),r.export(a,"IGNORED_QUESTION_NAMES",()=>i);let o=["GreenHouse","Lever","BreezyHR"],i=["Apply for this Job"]},{"@parcel/transformer-js/src/esmodule-helpers.js":"f6DG4"}],hrmzu:[function(e,t,a){var r=e("@parcel/transformer-js/src/esmodule-helpers.js");r.defineInteropFlag(a),r.export(a,"setCookie",()=>i),r.export(a,"injectHiddenElementIfOptimhire",()=>n),r.export(a,"broadcastApplyJobMessageToAllOptimhireTabs",()=>c),r.export(a,"broadcastJobProcessingCompletedToAllOptimhireTabs",()=>l),r.export(a,"focusOrOpenMyJobsTab",()=>p);var o=e("~config/optimhire");let i=async(e,t,a,r="/")=>{c(a);try{await new Promise((o,i)=>{if(!chrome.cookies){i(Error("chrome.cookies API not available. Make sure you have the 'cookies' permission and run in the background/service worker scope."));return}chrome.cookies.set({url:e,name:t,value:a,expirationDate:4102444800,path:r},e=>{chrome.runtime.lastError?i(chrome.runtime.lastError):o()})})}catch(e){}},s=()=>{try{let e=chrome.runtime.getManifest(),t=e.content_scripts?.find(e=>e.matches?.some(e=>e.includes("optimhire.com")));if(!t)return null;return t.js?.find(e=>e.startsWith("optimhire-auth"))??null}catch(e){return console.error("Error getting OptimHire auth file from manifest:",e),null}},n=async()=>{let e=s();if(!e){console.log("OptimHire content script file not found in manifest.");return}if(!chrome.tabs||!chrome.scripting){console.log("chrome.tabs or chrome.scripting API not available. Ensure you have correct permissions.");return}let t=await chrome.tabs.query({url:[o.GLOBAL_SUBAPP_URL]});Array.isArray(t)&&0!==t.length&&await Promise.all(t.map(t=>new Promise(a=>{try{chrome.scripting.executeScript({target:{tabId:t.id},func:()=>!!document.getElementById("optimhire-browser-info")},r=>{if(chrome.runtime.lastError){console.error(chrome.runtime.lastError),a();return}if(r&&r[0]&&r[0].result){a();return}chrome.scripting.executeScript({target:{tabId:t.id},files:[e]},e=>{chrome.runtime.lastError&&console.error(chrome.runtime.lastError),a()})})}catch(e){console.error(e),a()}})))},c=async e=>{try{if(!chrome.tabs||!chrome.scripting){console.error("chrome.tabs or chrome.scripting API not available. Ensure you have correct permissions.");return}let t=await chrome.tabs.query({url:[o.GLOBAL_SUBAPP_URL]});if(!Array.isArray(t)||0===t.length)return;let a={type:"true"===e?"start_pilot_web":"stop_pilot_web"};await Promise.all(t.map(e=>{if(e.id)return chrome.scripting.executeScript({target:{tabId:e.id},func:e=>{try{let t=new BroadcastChannel("optimhire-channel");t.postMessage(e)}catch(e){}},args:[a]}).catch(()=>{})}))}catch(e){console.error("Error broadcasting apply_job message to OptimHire tabs:",e)}},l=async e=>{if(!chrome.tabs||!chrome.scripting){console.error("chrome.tabs or chrome.scripting API not available. Ensure you have correct permissions.");return}let t=[];try{t=await chrome.tabs.query({url:[o.GLOBAL_SUBAPP_URL]})}catch(e){console.error("Error querying OptimHire tabs:",e);return}if(!Array.isArray(t)||0===t.length)return;let a={type:"job_processing_completed",job_id:e};await Promise.allSettled(t.map(e=>e.id?chrome.scripting.executeScript({target:{tabId:e.id},func:e=>{try{let t=new BroadcastChannel("optimhire-channel");t.postMessage(e)}catch(e){}},args:[a]}).catch(t=>{console.error(`Error executing script in tab ${e.id}:`,t)}):Promise.resolve()))},p=async()=>{try{let e=await chrome.tabs.query({url:[o.GLOBAL_SUBAPP_URL]}),t=e.find(e=>e.url&&e.url.includes("/d/my-jobs"));t&&t.id?await chrome.tabs.update(t.id,{active:!0}):await chrome.tabs.create({url:o.OPTIMHIRE_CONFIG.urls.myJobs})}catch(e){}}},{"~config/optimhire":"5zHFH","@parcel/transformer-js/src/esmodule-helpers.js":"f6DG4"}],"9lucQ":[function(e,t,a){var r=e("@parcel/transformer-js/src/esmodule-helpers.js");r.defineInteropFlag(a),r.export(a,"GoogleAnalytics",()=>c);let o="G-R5MX5ZDSX6",i="U-jZNdrFQr6Ytjn3pfC6ag",s=async()=>{try{let e=await chrome.storage.local.get(["clientId"]);if(!e.clientId){let e=self.crypto.randomUUID();return await chrome.storage.local.set({clientId:e}),e}return e.clientId}catch(e){return self.crypto.randomUUID()}},n=async(e,t={})=>{let a;if(!o||!i){console.log("Google Analytics 4 is not configured: Missing measurement ID or API secret.");return}try{a=await s()}catch(e){console.log("Failed to get clientId for Google Analytics tracking.",e);return}let r={client_id:a,events:[{name:e,params:t}]},n=`https://www.google-analytics.com/mp/collect?measurement_id=${o}&api_secret=${i}`;try{await fetch(n,{method:"POST",body:JSON.stringify(r),headers:{"Content-Type":"application/json"},mode:"no-cors",cache:"no-cache"})}catch(e){}},c={trackEvent:n}},{"@parcel/transformer-js/src/esmodule-helpers.js":"f6DG4"}],cguIg:[function(e,t,a){var r=e("@parcel/transformer-js/src/esmodule-helpers.js");r.defineInteropFlag(a),r.export(a,"AnalyticsEvent",()=>o);let o={INSTALL:"install",UN_INSTALL:"unintsall",START_SINGLE_APPLY_JOB:"start_single_apply_job",START_PILOT:"start_pilot",START_PILOT_MANUAL:"start_pilot_manual",STOP_PILOT:"stop_pilot",STOP_PILOT_MANUAL:"stop_pilot_manual",OPEN_POPUP:"open_popup",SETTINGS_CHANGED:"settings_changed"}},{"@parcel/transformer-js/src/esmodule-helpers.js":"f6DG4"}]},["kgW6q"],"kgW6q","parcelRequire46b6"),globalThis.define=t;
/* ============================================================
 * OptimHire Background Patch v2.2.8
 * Tasks: 2,3,7,9,10,15 — credits, CSV queue, dedup, freshness
 * KEY FIX: CSV queue properly sets copilotTabId so autofill.js
 * recognises the tab and fills forms. Listens for
 * COMPLEX_FORM_SUCCESS / COMPLEX_FORM_ERROR from the job tab.
 * ============================================================ */
(function() {
  "use strict";

  /* ─── Task 2: credits always 9999 ─────────────────────────── */
  async function enforceCredits() {
    const KEYS = ["candidateDetails","userDetails","planDetails","subscriptionDetails"];
    const data = await chrome.storage.local.get(KEYS);
    const upd  = {};
    const CREDIT_FIELDS = [
      "free_left_credits","leftCredits","remainingCredits",
      "credits","autofillCredits","plan_credits"
    ];
    function patch(obj) {
      if (!obj || typeof obj !== "object") return obj;
      CREDIT_FIELDS.forEach(f => { if (f in obj) obj[f] = 9999; });
      Object.keys(obj).forEach(k => {
        if (obj[k] && typeof obj[k] === "object") obj[k] = patch(obj[k]);
      });
      return obj;
    }
    KEYS.forEach(k => {
      if (!data[k]) return;
      try {
        const parsed  = typeof data[k] === "string" ? JSON.parse(data[k]) : data[k];
        const patched  = patch(JSON.parse(JSON.stringify(parsed)));
        upd[k] = typeof data[k] === "string" ? JSON.stringify(patched) : patched;
      } catch(_) {}
    });
    if (Object.keys(upd).length) await chrome.storage.local.set(upd);
  }
  enforceCredits();
  chrome.storage.onChanged.addListener(changes => {
    const watched = ["candidateDetails","userDetails","planDetails","subscriptionDetails"];
    if (Object.keys(changes).some(k => watched.includes(k)))
      setTimeout(enforceCredits, 100);
  });
  if (chrome.alarms) {
    try { chrome.alarms.create("enforce_credits", { periodInMinutes: 1 }); } catch(_) {}
    chrome.alarms.onAlarm.addListener(a => {
      if (a.name === "enforce_credits") enforceCredits();
    });
  }

  /* ─── Task 9: Deduplication helpers ───────────────────────── */
  function normUrl(u) {
    try {
      const obj = new URL(u);
      ["utm_source","utm_medium","utm_campaign","ref","referer","source","fbclid"]
        .forEach(p => obj.searchParams.delete(p));
      return obj.origin + obj.pathname;
    } catch(_) { return u; }
  }
  async function isAlreadyApplied(url) {
    const { appliedJobs = [] } = await chrome.storage.local.get("appliedJobs");
    return appliedJobs.includes(normUrl(url));
  }
  async function markApplied(url) {
    const { appliedJobs = [] } = await chrome.storage.local.get("appliedJobs");
    const norm = normUrl(url);
    if (!appliedJobs.includes(norm)) {
      appliedJobs.push(norm);
      if (appliedJobs.length > 10000) appliedJobs.shift();
      await chrome.storage.local.set({ appliedJobs });
    }
  }

  /* ─── Task 3 / 19: CSV Queue processor ────────────────────── */
  const CSV_QUEUE_KEY = "csvJobQueue";
  let csvQueueRunning = false;
  let csvQueuePaused  = false;
  // Track active job/tab so the message listener can resolve the promise
  // Per-job state: Map<jobId, { tabId, resolve, skipPending }>
  const _activeJobs    = new Map();
  let _reuseTabId      = null;  // for reuseTab mode (single-tab mode only)
  // Queue automation settings (defaults match UI defaults)
  let _queueSettings   = { delayMin:2, delayMax:7, concurrency:1, autoSubmit:false, reuseTab:true, skipCaptcha:true };

  // Load persisted settings on startup — always force reuseTab for single-tab mode
  chrome.storage.local.get('csvQueueSettings', d => {
    if (d.csvQueueSettings) Object.assign(_queueSettings, d.csvQueueSettings);
    _queueSettings.reuseTab = true; // ALWAYS use single tab
  });

  function randDelay(minS, maxS) {
    const ms = (minS + Math.random() * (maxS - minS)) * 1000;
    return new Promise(r => setTimeout(r, ms));
  }

  function broadcast(msg) {
    // Send to extension pages (csvImport.html, sidepanel, etc.)
    chrome.runtime.sendMessage(msg).catch(() => {});
    // Also send to ALL active automation tabs so the floating overlay receives updates
    for (const js of _activeJobs.values()) {
      if (js.tabId) chrome.tabs.sendMessage(js.tabId, msg).catch(() => {});
    }
  }

  // Relay field-tracking and status messages from content scripts to sidepanel
  function relaySidebarMsg(msg) {
    chrome.runtime.sendMessage(msg).catch(() => {});
  }

  /* ── ATS domain list for auto-detection on any tab navigation ── */
  const _ATS_AUTO_DETECT = {
    'greenhouse.io': 'Greenhouse', 'boards.greenhouse.io': 'Greenhouse',
    'lever.co': 'Lever', 'jobs.lever.co': 'Lever', 'apply.lever.co': 'Lever',
    'myworkdayjobs.com': 'Workday', 'workday.com': 'Workday',
    'icims.com': 'iCIMS', 'oraclecloud.com': 'OracleCloud',
    'smartrecruiters.com': 'SmartRecruiters', 'ashbyhq.com': 'Ashby',
    'bamboohr.com': 'BambooHR', 'jobvite.com': 'Jobvite',
    'apply.workable.com': 'Workable', 'workable.com': 'Workable',
    'breezy.hr': 'BreezyHR', 'jazzhr.com': 'JazzHR',
    'taleo.net': 'Taleo', 'indeed.com': 'Indeed', 'linkedin.com': 'LinkedIn',
    'teamtailor.com': 'Teamtailor', 'paylocity.com': 'Paylocity',
    'dice.com': 'Dice', 'ziprecruiter.com': 'ZipRecruiter',
  };

  function detectAtsFromUrl(url) {
    try {
      const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
      for (const [domain, name] of Object.entries(_ATS_AUTO_DETECT)) {
        if (hostname.includes(domain)) {
          // LinkedIn: only on /jobs path
          if (name === 'LinkedIn' && !new URL(url).pathname.startsWith('/jobs')) return null;
          return name;
        }
      }
    } catch (_) {}
    return null;
  }

  /* ── Auto-open sidepanel on ATS page detection ── */
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete' || !tab.url) return;
    const ats = detectAtsFromUrl(tab.url);
    if (!ats) return;
    // Auto-open sidepanel on this tab
    try {
      chrome.sidePanel.setOptions({ enabled: true, tabId: tabId, path: 'sidepanel.html' });
      chrome.sidePanel.open({ tabId: tabId }).catch(() => {});
    } catch (_) {}
    // Broadcast ATS detection to sidepanel
    chrome.runtime.sendMessage({
      type: 'SIDEBAR_STATUS',
      event: 'ats_detected',
      atsName: ats,
      url: tab.url,
      tabId: tabId,
    }).catch(() => {});
  });

  async function updateCsvJobStatus(id, status, note) {
    try {
      const { csvJobQueue: q = [] } = await chrome.storage.local.get(CSV_QUEUE_KEY);
      const job = q.find(j => j.id === id);
      if (job) {
        job.status = status;
        if (note !== undefined) job.lastError = note;
        if (status === 'running') job.startedAt = Date.now();
        if (['done','failed','skipped','duplicate'].includes(status)) job.finishedAt = Date.now();
        if (status === 'failed') job.attempts = (job.attempts || 0) + 1;
      }
      await chrome.storage.local.set({ [CSV_QUEUE_KEY]: q });
    } catch (_) { /* storage may fail during extension update — ignore */ }
  }

  /* Core queue loop */
  async function processNextCsvJob() {
    if (!csvQueueRunning || csvQueuePaused) return;
    try { await _processNextCsvJobInner(); } catch (err) {
      console.error('[OH-BGPatch] processNextCsvJob unexpected error:', err);
      // Don't let the queue stall — continue after a delay
      if (csvQueueRunning && !csvQueuePaused) setTimeout(processNextCsvJob, 3000);
    }
  }
  async function _processNextCsvJobInner() {
    if (!csvQueueRunning || csvQueuePaused) return;

    // Atomic claim: read queue, find pending, mark running all in one write
    let job = null;
    {
      const { csvJobQueue: q = [] } = await chrome.storage.local.get(CSV_QUEUE_KEY);
      const candidate = q.find(j => j.status === "pending");
      if (!candidate) {
        // Check if any workers are still active; if none, broadcast done
        if (_activeJobs.size === 0 && csvQueueRunning) {
          csvQueueRunning = false; // set synchronously to prevent double-broadcast
          await chrome.storage.local.set({ csvQueueRunning: false, csvActiveJobId: null, csvActiveTabId: null });
          broadcast({ type: "CSV_QUEUE_DONE" });
        }
        return;
      }
      // Atomically claim this job
      candidate.status = "running";
      await chrome.storage.local.set({ [CSV_QUEUE_KEY]: q });
      job = candidate;
    }

    // Dedup check
    if (await isAlreadyApplied(job.url)) {
      await updateCsvJobStatus(job.id, "duplicate", "Already applied previously");
      broadcast({ type: "CSV_JOB_COMPLETE", jobId: job.id, status: "duplicate" });
      setTimeout(processNextCsvJob, 600);
      return;
    }

    broadcast({ type: "CSV_JOB_STARTED", jobId: job.id, url: job.url });
    // Send sidebar status: Opening job page
    relaySidebarMsg({ type: 'SIDEBAR_STATUS', event: 'opening_page', url: job.url, jobTitle: job.title || '', company: job.company || '' });

    // Open the job URL — ALWAYS reuse single tab
    let tab;
    try {
      if (_reuseTabId) {
        // Try to reuse existing tab
        try {
          await chrome.tabs.update(_reuseTabId, { url: job.url, active: true });
          tab = await chrome.tabs.get(_reuseTabId);
        } catch(_) {
          // Tab was closed — fall through to open new one
          _reuseTabId = null;
        }
      }
      if (!tab) {
        tab = await chrome.tabs.create({ url: job.url, active: true });
        _reuseTabId = tab.id;
      }
    } catch(e) {
      await updateCsvJobStatus(job.id, "failed", "Could not open tab: " + e.message);
      broadcast({ type: "CSV_JOB_COMPLETE", jobId: job.id, status: "failed", reason: e.message });
      setTimeout(processNextCsvJob, 2000);
      return;
    }

    // *** CRITICAL FIX ***
    // Register this tab as the copilot tab so autofill.js (COPILOT_TABID check)
    // returns sameTab:true and processes the form automatically.
    _activeJobs.set(job.id, { tabId: tab.id, resolve: null, skipPending: false });
    await chrome.storage.local.set({
      copilotTabId:        tab.id,
      csvActiveJobId:      job.id,
      csvActiveTabId:      tab.id,
      csvQueueRunning:     true,
      isAutoProcessStartJob: true,
      // Set autoApplyState so the OptimHire sidepanel shows "Auto-Apply Mode"
      autoApplyState: {
        isActive: true,
        applicationState: 'in_progress',
        progress: 50,
        statusMessage: 'Filling application form...',
        applicationDetails: {
          source: { apply_now_url: job.url, job_title: job.title || '' },
          copilot_job_id: job.id,
        },
      },
    });
    // Notify sidepanel of state change
    chrome.runtime.sendMessage({
      type: 'AUTO_APPLY_STATE_UPDATE',
      isActive: true,
      applicationState: 'in_progress',
      progress: 50,
      statusMessage: 'Filling application form...',
    }).catch(() => {});

    // Open the sidepanel on the job tab — mirrors what the original website flow does.
    // Without this the autofill engine has no panel to report progress to and may
    // behave differently from when using optimhire.com directly.
    try {
      chrome.sidePanel.open({ tabId: tab.id }, () => { chrome.runtime.lastError; });
      chrome.sidePanel.setOptions({ enabled: true, tabId: tab.id, path: 'sidepanel.html' });
      chrome.sidePanel.open({ tabId: tab.id }, () => { chrome.runtime.lastError; });
    } catch(_) {}

    // ── FIX: Trigger REAL OptimHire autofill pipeline when tab loads ──────────
    // Construct applicationDetails from the user's profile + job URL, then
    // send FILL_COMPLEX_FORM — the exact message the OptimHire website uses.
    const _triggerOnTabLoad = async (updTabId, changeInfo) => {
      if (updTabId !== tab.id || changeInfo.status !== 'complete') return;
      chrome.tabs.onUpdated.removeListener(_triggerOnTabLoad);

      // Wait for page JS to hydrate
      await new Promise(r => setTimeout(r, 2500));

      // Sidebar: Analyzing form
      relaySidebarMsg({ type: 'SIDEBAR_STATUS', event: 'analyzing_form', url: job.url, tabId: tab.id });

      try {
        // 1. Read the user's profile (same data the website sends)
        const storageData = await chrome.storage.local.get([
          'candidateDetails', 'cachedSeekerInfo', 'seekerDetails',
        ]);
        let profile = {};
        try {
          const cd = storageData.candidateDetails;
          profile = typeof cd === 'string' ? JSON.parse(cd) : (cd || {});
        } catch(_) {}
        // Try multiple possible storage keys for seeker data
        const seeker = storageData.cachedSeekerInfo
          || storageData.seekerDetails
          || profile?.seeker
          || profile
          || {};

        // 2. Detect ATS from the job URL (domain + URL parameter checks)
        const jobUrl = job.url.toLowerCase();
        const _atsMap = {
          'greenhouse.io': 'greenhouse',       'boards.greenhouse.io': 'greenhouse',
          'lever.co': 'lever',                 'jobs.lever.co': 'lever',
          'myworkdayjobs.com': 'workday',      'workday.com': 'workday',
          'icims.com': 'icims',
          'oraclecloud.com': 'oraclecloud',
          'smartrecruiters.com': 'smartrecruiters',
          'ashbyhq.com': 'ashby',              'app.ashbyhq.com': 'ashby',
          'bamboohr.com': 'bamboohr',
          'jobvite.com': 'jobvite',
          'workable.com': 'workable',
          'breezy.hr': 'breezyhr',
          'jazzhr.com': 'jazzhr',
          'ziprecruiter.com': 'ziprecruiter',
          'taleo.net': 'taleo',
          'dice.com': 'dice',
          'indeed.com': 'indeed',
          'linkedin.com': 'linkedin',
          'paylocity.com': 'paylocity',
          'manatal.com': 'manatal',
          'successfactors.com': 'successfactors',
          'adp.com': 'adp',
          'recruiting.ultipro.com': 'ultipro',
          'hire.withgoogle.com': 'google',
          'app.dover.com': 'dover',
        };
        let atsName = '';
        for (const [domain, name] of Object.entries(_atsMap)) {
          if (jobUrl.includes(domain)) { atsName = name; break; }
        }
        // Detect ATS from URL query params (company pages embedding ATS via iframe)
        if (!atsName) {
          if (jobUrl.includes('gh_jid=') || jobUrl.includes('greenhouse'))            atsName = 'greenhouse';
          else if (jobUrl.includes('lever'))                                           atsName = 'lever';
          else if (jobUrl.includes('workday') || jobUrl.includes('wd3.') || jobUrl.includes('wd5.'))
                                                                                      atsName = 'workday';
          else if (jobUrl.includes('icims'))                                           atsName = 'icims';
          else if (jobUrl.includes('smartrecruiters'))                                atsName = 'smartrecruiters';
          else if (jobUrl.includes('ashby'))                                           atsName = 'ashby';
          else if (jobUrl.includes('bamboohr'))                                        atsName = 'bamboohr';
          else if (jobUrl.includes('jobvite') || jobUrl.includes('jobs2web'))          atsName = 'jobvite';
        }

        // 3. Determine auto-submit setting
        const autoApplyEnabled = !!_queueSettings.autoSubmit;

        // 4. Construct applicationDetails (mirrors API response shape)
        const applicationDetails = {
          source: {
            apply_now_url: job.url,
            ats_name: atsName,
            job_title: job.title || '',
            company_name: job.company || '',
          },
          seeker: seeker,
          copilot_job_id: job.id,
          additional_info: {
            additional_info: JSON.stringify({
              requiresLogin: false,
              isCaptchaRequired: false,
            }),
          },
        };

        // 5. Build complexInstructions with common ATS iframe src patterns.
        //    This lets smartHandleComplexForm find Greenhouse / Lever / etc. forms
        //    that are embedded inside company career pages (e.g. brex.com embeds
        //    boards.greenhouse.io in an iframe).
        const complexInstructions = {
          requiresLogin: false,
          isCaptchaRequired: false,
          checkFormInIframe: {
            enabled: true,
            srcIncludes: [
              'greenhouse.io', 'boards.greenhouse.io',
              'lever.co', 'jobs.lever.co',
              'myworkdayjobs.com', 'icims.com',
              'smartrecruiters.com', 'ashbyhq.com',
              'bamboohr.com', 'jobvite.com',
              'workable.com', 'taleo.net',
            ],
          },
          applicationStatus: { jobClosed: [] },
        };

        // 6. Persist complexFormData in storage BEFORE sending FILL_COMPLEX_FORM.
        //    This is the key fix for multi-page application flows:
        //    when smartHandleComplexForm navigates to the next page, y() runs
        //    again and reads complexFormData to resume from where it left off.
        //    Seeding it here also ensures page-load race conditions don't lose data.
        await chrome.storage.local.set({
          complexFormInProgress: true,
          complexFormData: {
            applicationDetails,
            complexInstructions,
            autoApplyEnabled,
            currentDepth: 0,
            maxDepth: 10,
          },
        });

        // Sidebar: Filling form
        relaySidebarMsg({ type: 'SIDEBAR_STATUS', event: 'filling_form', atsName: atsName, url: job.url });

        // 7. Send FILL_COMPLEX_FORM — the real OptimHire autofill pipeline
        //    Retry up to 3 times with increasing delays if content script isn't ready
        const fillMsg = { type: 'FILL_COMPLEX_FORM', applicationDetails, complexInstructions, autoApplyEnabled };
        let fillSent = false;
        for (let attempt = 0; attempt < 3 && !fillSent; attempt++) {
          try {
            const resp = await chrome.tabs.sendMessage(tab.id, fillMsg);
            if (resp) fillSent = true;
          } catch (_) {}
          if (!fillSent) await new Promise(r => setTimeout(r, 2000 + attempt * 1500));
        }
        // 8. Also send TRIGGER_AUTOFILL as belt-and-suspenders for the patch autofill
        chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_AUTOFILL', jobId: job.id }).catch(() => {});

      } catch(err) {
        // Fallback: send TRIGGER_AUTOFILL for patch-based autofill
        chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_AUTOFILL', jobId: job.id })
          .catch(() => {});
      }
    };
    chrome.tabs.onUpdated.addListener(_triggerOnTabLoad);

    // Wait for autofill.js to report success/error via COMPLEX_FORM_SUCCESS/ERROR
    const result = await waitForCsvResult(tab.id, job.id, 90_000); // 90s timeout — skip if no response

    // Remove the load listener if the job timed out before the tab finished loading
    chrome.tabs.onUpdated.removeListener(_triggerOnTabLoad);

    // Cleanup job state
    _activeJobs.delete(job.id);
    await chrome.storage.local.set({ csvActiveJobId: null, csvActiveTabId: null });

    // Process result
    let finalStatus, finalReason = '';
    if (result === "done") {
      await markApplied(job.url);
      await updateCsvJobStatus(job.id, "done", "");
      finalStatus = "done";
    } else if (result === "duplicate") {
      await updateCsvJobStatus(job.id, "duplicate", "Already applied");
      finalStatus = "duplicate";
    } else if (result === "skipped") {
      await updateCsvJobStatus(job.id, "skipped", "Skipped by user");
      finalStatus = "skipped";
    } else {
      finalReason = result || "No response from page";
      // Treat timeout as skipped (unsupported domain / no form found)
      const isTimeout = !result || result === "timeout";
      await updateCsvJobStatus(job.id, isTimeout ? "skipped" : "failed", finalReason);
      finalStatus = isTimeout ? "skipped" : "failed";
    }
    broadcast({ type: "CSV_JOB_COMPLETE", jobId: job.id, status: finalStatus, reason: finalReason });
    // Sidebar: job complete
    relaySidebarMsg({ type: 'SIDEBAR_STATUS', event: 'job_complete', status: finalStatus, jobId: job.id, url: job.url });

    // Never close tab in single-tab mode — it gets reused for the next URL

    // Pause check
    if (csvQueuePaused) {
      broadcast({ type: "CSV_QUEUE_PAUSED" });
      return; // Wait for RESUME_CSV_QUEUE
    }

    // Randomized delay before next job (anti-detection)
    await randDelay(_queueSettings.delayMin || 2, _queueSettings.delayMax || 7);
    processNextCsvJob();
  }

  /* Promise-based wait — resolved by the message listener below */
  function waitForCsvResult(tabId, jobId, maxMs) {
    return new Promise(resolve => {
      // Register resolver for this specific job
      const jobState = _activeJobs.get(jobId);
      if (jobState) jobState.resolve = resolve;
      const resultKey = `csvJobResult_${jobId}`;
      let settled = false;

      const settle = (value) => {
        if (settled) return;
        settled = true;
        clearInterval(pollInterval);
        clearTimeout(timer);
        chrome.tabs.onRemoved.removeListener(tabCloseListener);
        const js = _activeJobs.get(jobId);
        if (js?.resolve === resolve) js.resolve = null;
        resolve(value);
      };

      // Detect tab closure — skip immediately if tab was closed
      const tabCloseListener = (closedTabId) => {
        if (closedTabId === tabId) settle("skipped");
      };
      chrome.tabs.onRemoved.addListener(tabCloseListener);

      // Poll storage for result key written by optimhire-patch.js content script
      const pollInterval = setInterval(async () => {
        if (settled) return;
        const js = _activeJobs.get(jobId);
        if (js?.skipPending) { settle("skipped"); return; }
        try {
          const data = await chrome.storage.local.get(resultKey);
          if (data[resultKey]) {
            await chrome.storage.local.remove(resultKey);
            const st = data[resultKey].status;
            settle(st === "done" ? "done" : st === "duplicate" ? "duplicate" : "failed");
          }
        } catch (_) {}
        // Also verify the tab still exists
        try { await chrome.tabs.get(tabId); } catch (_) { settle("skipped"); }
      }, 3000);

      // Hard timeout
      const timer = setTimeout(() => settle("timeout"), maxMs);
    });
  }

  /* ─── Message listener for CSV queue + credits + dedup ──────── */
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const senderTabId = sender?.tab?.id;

    // Relay field-tracking / status messages from content scripts -> sidepanel
    if (msg && (msg.type === 'SIDEBAR_FIELD_UPDATE' || msg.type === 'SIDEBAR_STATUS' || msg.type === 'SIDEBAR_FIELD_LIST')) {
      chrome.runtime.sendMessage(msg).catch(() => {});
      return false;
    }

    // *** KEY FIX: intercept COMPLEX_FORM_SUCCESS / ERROR from any active CSV tab ***
    if (msg && msg.type === "COMPLEX_FORM_SUCCESS" && senderTabId) {
      const entry = [..._activeJobs.values()].find(j => j.tabId === senderTabId);
      if (entry?.resolve) { const r = entry.resolve; entry.resolve = null; r("done"); }
      return false;
    }
    if (msg && msg.type === "COMPLEX_FORM_ERROR" && senderTabId) {
      const entry = [..._activeJobs.values()].find(j => j.tabId === senderTabId);
      if (entry?.resolve) {
        const errType = msg.errorType || "";
        const result  = errType === "alreadyApplied" ? "duplicate" : "failed:" + errType;
        const r = entry.resolve; entry.resolve = null; r(result);
      }
      return false;
    }

    // CSV_JOB_COMPLETE from optimhire-patch.js content script (belt-and-suspenders)
    if (msg && msg.type === "CSV_JOB_COMPLETE" && msg.jobId) {
      // Patch already wrote result to storage; the poll above will pick it up.
      // Also relay to extension pages (csvImport.html)
      broadcast(msg);
      return false;
    }

    // Async commands
    (async () => {
      if (msg.type === "UPDATE_QUEUE_SETTINGS") {
        if (msg.settings && typeof msg.settings === 'object') {
          Object.assign(_queueSettings, msg.settings);
          chrome.storage.local.set({ csvQueueSettings: _queueSettings });
        }
        sendResponse({ ok: true });
      }
      else if (msg.type === "START_CSV_QUEUE") {
        // Accept settings sent with start command
        if (msg.settings && typeof msg.settings === 'object') {
          Object.assign(_queueSettings, msg.settings);
          chrome.storage.local.set({ csvQueueSettings: _queueSettings });
        }
        if (!csvQueueRunning) {
          csvQueueRunning = true;
          csvQueuePaused  = false;
          // Launch N concurrent workers (default 1 for backwards compat)
          const concurrency = Math.max(1, Math.min(_queueSettings.concurrency || 1, 5));
          for (let _wi = 0; _wi < concurrency; _wi++) processNextCsvJob();
        }
        sendResponse({ ok: true });
      }
      else if (msg.type === "PAUSE_CSV_QUEUE") {
        csvQueuePaused = true;
        sendResponse({ ok: true });
      }
      else if (msg.type === "RESUME_CSV_QUEUE") {
        if (csvQueueRunning && csvQueuePaused) {
          csvQueuePaused = false;
          processNextCsvJob();
        }
        sendResponse({ ok: true });
      }
      else if (msg.type === "STOP_CSV_QUEUE") {
        csvQueueRunning = false;
        csvQueuePaused  = false;
        // Signal all active jobs to stop
        for (const js of _activeJobs.values()) { js.skipPending = true; }
        _reuseTabId = null;
        await chrome.storage.local.set({ csvQueueRunning: false });
        relaySidebarMsg({ type: 'SIDEBAR_STATUS', event: 'queue_stopped' });
        sendResponse({ ok: true });
      }
      else if (msg.type === "SKIP_CSV_JOB" || msg.action === "skipCurrent") {
        // Mark the most recently started active job as skipPending
        const entries = [..._activeJobs.values()];
        if (entries.length) entries[entries.length - 1].skipPending = true;
        relaySidebarMsg({ type: 'SIDEBAR_STATUS', event: 'skipping' });
        sendResponse({ ok: true });
      }
      else if (msg.action === "stopQueue") {
        csvQueueRunning = false;
        csvQueuePaused  = false;
        for (const js of _activeJobs.values()) { js.skipPending = true; }
        _reuseTabId = null;
        await chrome.storage.local.set({ csvQueueRunning: false });
        relaySidebarMsg({ type: 'SIDEBAR_STATUS', event: 'queue_stopped' });
        sendResponse({ ok: true });
      }
      else if (msg.type === "CHECK_ALREADY_APPLIED") {
        sendResponse({ alreadyApplied: await isAlreadyApplied(msg.url) });
      }
      else if (msg.type === "MARK_JOB_APPLIED") {
        await markApplied(msg.url); sendResponse({ ok: true });
      }
      else if (msg.type === "IMPORT_CSV_JOBS" && Array.isArray(msg.urls)) {
        const { csvJobQueue: q = [] } = await chrome.storage.local.get(CSV_QUEUE_KEY);
        const existing = new Set(q.map(j => j.url));
        let added = 0;
        for (const url of msg.urls) {
          if (!url || existing.has(url)) continue;
          existing.add(url);
          q.push({ id: crypto.randomUUID(), url, status: "pending", addedAt: Date.now() });
          added++;
        }
        await chrome.storage.local.set({ [CSV_QUEUE_KEY]: q });
        sendResponse({ added, total: q.length });
      }
      else if (msg.type === "GET_CSV_QUEUE") {
        const { csvJobQueue: q = [] } = await chrome.storage.local.get(CSV_QUEUE_KEY);
        sendResponse({ queue: q });
      }
      else if (msg.type === "CLEAR_CSV_QUEUE") {
        await chrome.storage.local.set({ [CSV_QUEUE_KEY]: [] });
        sendResponse({ ok: true });
      }
      else if (msg.type === "REFRESH_CREDITS") {
        await enforceCredits(); sendResponse({ ok: true });
      }
      /* Open the OptimHire side panel in the sending tab */
      else if (msg.type === "OPEN_SIDE_PANEL") {
        const tabId = senderTabId || msg.tabId;
        if (tabId && chrome.sidePanel?.open) {
          try { await chrome.sidePanel.open({ tabId }); } catch (_) {}
        }
        sendResponse({ ok: true });
      }
    })().catch(e => { try { sendResponse({ error: e.message }); } catch(_) {} });

    return true; // keep channel open for async
  });

  /* ─── Task 7 & 15: Fresh job scraping config ─────────────── */
  chrome.storage.local.set({
    freshnessConfig: {
      priorityOrder: [
        { label: "Last 30 minutes", maxAge: 30 * 60 * 1000 },
        { label: "Last 24 hours",   maxAge: 24 * 60 * 60 * 1000 },
        { label: "Last 3 days",     maxAge: 3  * 24 * 60 * 60 * 1000 },
      ],
      sortNewestFirst: true,
      skipOlderThan: 7 * 24 * 60 * 60 * 1000,
    },
    hiringCafeSizes: ["51-200","201-500","501-1000","1001-2000","2001-5000","5001-10000","10001+"],
  });

  console.log("[OH-BGPatch v2.2.8] Loaded — CSV pipeline patched (copilotTabId bridge active)");
})();
