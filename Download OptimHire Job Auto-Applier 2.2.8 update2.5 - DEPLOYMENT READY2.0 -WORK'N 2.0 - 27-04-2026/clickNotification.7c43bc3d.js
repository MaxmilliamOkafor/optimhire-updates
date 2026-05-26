var e,t;"function"==typeof(e=globalThis.define)&&(t=e,e=null),function(t,i,o,n,r){var l="undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:"undefined"!=typeof window?window:"undefined"!=typeof global?global:{},d="function"==typeof l[n]&&l[n],a=d.cache||{},s="undefined"!=typeof module&&"function"==typeof module.require&&module.require.bind(module);function p(e,i){if(!a[e]){if(!t[e]){var o="function"==typeof l[n]&&l[n];if(!i&&o)return o(e,!0);if(d)return d(e,!0);if(s&&"string"==typeof e)return s(e);var r=Error("Cannot find module '"+e+"'");throw r.code="MODULE_NOT_FOUND",r}f.resolve=function(i){var o=t[e][1][i];return null!=o?o:i},f.cache={};var c=a[e]=new p.Module(e);t[e][0].call(c.exports,f,c,c.exports,this)}return a[e].exports;function f(e){var t=f.resolve(e);return!1===t?{}:p(t)}}p.isParcelRequire=!0,p.Module=function(e){this.id=e,this.bundle=p,this.exports={}},p.modules=t,p.cache=a,p.parent=d,p.register=function(e,i){t[e]=[function(e,t){t.exports=i},{}]},Object.defineProperty(p,"root",{get:function(){return l[n]}}),l[n]=p;for(var c=0;c<i.length;c++)p(i[c]);if(o){var f=p(o);"object"==typeof exports&&"undefined"!=typeof module?module.exports=f:"function"==typeof e&&e.amd?e(function(){return f}):r&&(this[r]=f)}}({isG7X:[function(e,t,i){var o=e("@parcel/transformer-js/src/esmodule-helpers.js");o.defineInteropFlag(i),o.export(i,"createNotificationHtmlBase",()=>l),o.export(i,"removeHtmlNotificationAndBackdrop",()=>a),o.export(i,"showHtmlNotificationAt",()=>s);let n="optimhire-shadow-container",r=null,l=()=>{if(document.getElementById(n))return;let e=document.createElement("div");e.id=n,e.style.position="absolute",e.style.top="0",e.style.left="0",e.style.zIndex="2147483640";let t=document.documentElement?document.documentElement:document.body;t?t.appendChild(e):document.body.appendChild(e),r=e.attachShadow({mode:"open"});let i=document.createElement("style");i.textContent=`
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
        <div id="optimhire-html-msg">Auto-fill is running — you can keep editing the form manually too.</div>
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
  `;r.appendChild(i);let l=document.createElement("div");for(let e of(l.innerHTML=o,Array.from(l.childNodes)))r.appendChild(e);let d=r.getElementById("optimhire-html-profile-img");if(d)try{d.src=chrome.runtime.getURL("assets/icon.png")}catch(e){}p()},d=()=>{if(!r)return;let e=r.getElementById("optimhire-html-click-notification");e&&(e.style.display="none")},a=(e=!0)=>{e&&localStorage.removeItem("setFormFillingProcess");let t=document.getElementById(n);t&&t.parentElement&&(t.parentElement.removeChild(t),r=null)},s=(e,t)=>{if(!r)return;let i=r.getElementById("optimhire-html-click-notification"),o=r.getElementById("optimhire-html-click-notification-backdrop");if(!i||!o)return;let n=e-40,l=t-10,d=Math.max(window.innerWidth,document.documentElement.clientWidth),a=Math.max(window.innerHeight,document.documentElement.clientHeight);n=Math.min(n=Math.max(n,195),d-160-45),l=Math.min(l=Math.max(l,178),a-24),i.style.left=`${n}px`,i.style.top=`${l}px`,i.style.opacity="0",i.style.transform="translate(-50%, -120%)",i.style.display="flex",o.style.display="block",requestAnimationFrame(()=>{i.style.opacity="1",i.style.transform="translate(-50%, -100%)"})},p=()=>{setTimeout(()=>{if(!r)return;let e=r.getElementById("optimhire-html-ok-btn");e&&!e.hasAttribute("__one_minute_ok_handler")&&(e.addEventListener("click",e=>{e.stopPropagation(),d()}),e.setAttribute("__one_minute_ok_handler","true"));let t=r.getElementById("optimhire-html-close-btn");t&&!t.hasAttribute("__one_minute_close_handler")&&(t.addEventListener("click",e=>{e.stopPropagation(),a()}),t.setAttribute("__one_minute_close_handler","true"))},20)}},{"@parcel/transformer-js/src/esmodule-helpers.js":"fRZO2"}],fRZO2:[function(e,t,i){i.interopDefault=function(e){return e&&e.__esModule?e:{default:e}},i.defineInteropFlag=function(e){Object.defineProperty(e,"__esModule",{value:!0})},i.exportAll=function(e,t){return Object.keys(e).forEach(function(i){"default"===i||"__esModule"===i||t.hasOwnProperty(i)||Object.defineProperty(t,i,{enumerable:!0,get:function(){return e[i]}})}),t},i.export=function(e,t,i){Object.defineProperty(e,t,{enumerable:!0,get:i})}},{}]},["isG7X"],"isG7X","parcelRequire46b6"),globalThis.define=t;