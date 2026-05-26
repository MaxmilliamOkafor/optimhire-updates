var t,e;"function"==typeof(t=globalThis.define)&&(e=t,t=null),function(e,n,o,r,i){var a="undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:"undefined"!=typeof window?window:"undefined"!=typeof global?global:{},p="function"==typeof a[r]&&a[r],s=p.cache||{},l="undefined"!=typeof module&&"function"==typeof module.require&&module.require.bind(module);function d(t,n){if(!s[t]){if(!e[t]){var o="function"==typeof a[r]&&a[r];if(!n&&o)return o(t,!0);if(p)return p(t,!0);if(l&&"string"==typeof t)return l(t);var i=Error("Cannot find module '"+t+"'");throw i.code="MODULE_NOT_FOUND",i}c.resolve=function(n){var o=e[t][1][n];return null!=o?o:n},c.cache={};var m=s[t]=new d.Module(t);e[t][0].call(m.exports,c,m,m.exports,this)}return s[t].exports;function c(t){var e=c.resolve(t);return!1===e?{}:d(e)}}d.isParcelRequire=!0,d.Module=function(t){this.id=t,this.bundle=d,this.exports={}},d.modules=e,d.cache=s,d.parent=p,d.register=function(t,n){e[t]=[function(t,e){e.exports=n},{}]},Object.defineProperty(d,"root",{get:function(){return a[r]}}),a[r]=d;for(var m=0;m<n.length;m++)d(n[m]);if(o){var c=d(o);"object"==typeof exports&&"undefined"!=typeof module?module.exports=c:"function"==typeof t&&t.amd?t(function(){return c}):i&&(this[i]=c)}}({"6YFM9":[function(t,e,n){var o=t("@parcel/transformer-js/src/esmodule-helpers.js");o.defineInteropFlag(n),o.export(n,"removeToast",()=>r),o.export(n,"showToast",()=>i);let r=()=>{try{chrome.storage.local.set({openSidepanelInTab:!0});let t=document.getElementById("optimhire-toast-shadow-host");t&&t.parentNode&&t.parentNode.removeChild(t);let e=document.getElementById("optimhire-toaster");e&&e.parentNode&&e.parentNode.removeChild(e);let n=document.getElementById("optimhire-toast-backdrop");n&&n.parentNode&&n.parentNode.removeChild(n)}catch(t){}},i=()=>{try{let t=document.createElement("div");t.id="optimhire-toast-shadow-host",t.style.position="fixed",t.style.top="0",t.style.left="0",t.style.width="100vw",t.style.height="100vh",t.style.zIndex="1073741821",r();let e=t.attachShadow({mode:"open"}),n=document.createElement("div");n.id="optimhire-toast-backdrop",n.setAttribute("style",`
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background: rgba(0,0,0,0.34) !important;
            z-index: 1073741822 !important;
            pointer-events: none !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
        `);let o=document.createElement("div");o.id="optimhire-toaster",Object.assign(o.style,{position:"fixed",top:"24px",left:"50%",transform:"translateX(-50%)",width:"598px",height:"400px",minWidth:"598px",maxWidth:"598px",minHeight:"400px",maxHeight:"400px",boxShadow:"0 6px 24px rgba(60,72,88,0.14), 0 1.5px 4px rgba(44,62,80,0.16)",background:"#fff",border:"1.2px solid #2196f3",borderRadius:"16px",zIndex:"1073741823",padding:"30px",transition:"opacity 0.25s, transform 0.24s cubic-bezier(.45,0,.2,1)",opacity:"1",pointerEvents:"auto",fontFamily:"system-ui, Arial, sans-serif",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",textAlign:"center",boxSizing:"border-box"}),o.innerHTML=`
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
      `;try{o.animate([{opacity:0,transform:"translateX(-50%) translateY(-24px)"},{opacity:1,transform:"translateX(-50%) translateY(0)"}],{duration:260,fill:"forwards",easing:"cubic-bezier(.33,2,.36,.99)"})}catch(t){}e.appendChild(n),e.appendChild(o),document.body.appendChild(t),o.addEventListener("click",()=>{try{chrome.runtime.sendMessage({action:"OPEN_SIDE_PANEL_BY_TOAST_CLICK"})}catch(t){}try{o.animate([{opacity:1,transform:"translateX(-50%) translateY(0)"},{opacity:0,transform:"translateX(-50%) translateY(-32px)"}],{duration:220,fill:"forwards",easing:"ease"})}catch(t){}setTimeout(()=>{r()},240)}),setTimeout(()=>{try{o.animate([{opacity:1,transform:"translateX(-50%) translateY(0)"},{opacity:0,transform:"translateX(-50%) translateY(-32px)"}],{duration:220,fill:"forwards",easing:"ease"})}catch(t){}setTimeout(()=>{r();try{chrome.storage.local.set({openSidepanelInTab:!0})}catch(t){}},240)},36e5)}catch(t){}}},{"@parcel/transformer-js/src/esmodule-helpers.js":"fRZO2"}],fRZO2:[function(t,e,n){n.interopDefault=function(t){return t&&t.__esModule?t:{default:t}},n.defineInteropFlag=function(t){Object.defineProperty(t,"__esModule",{value:!0})},n.exportAll=function(t,e){return Object.keys(t).forEach(function(n){"default"===n||"__esModule"===n||e.hasOwnProperty(n)||Object.defineProperty(e,n,{enumerable:!0,get:function(){return t[n]}})}),e},n.export=function(t,e,n){Object.defineProperty(t,e,{enumerable:!0,get:n})}},{}]},["6YFM9"],"6YFM9","parcelRequire46b6"),globalThis.define=e;