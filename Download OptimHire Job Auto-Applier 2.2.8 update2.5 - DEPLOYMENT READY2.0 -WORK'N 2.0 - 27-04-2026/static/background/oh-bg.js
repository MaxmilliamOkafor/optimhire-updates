/**
 * oh-bg.js — service-worker entry point. Loads OptimHire's background
 * (index.js, unchanged) after narrowing two things in it that kept the
 * WHOLE BROWSER busy, all the time, whether or not anything was running:
 *
 * 1. A network hook on EVERY request in every tab.
 *    webRequest.onBeforeRequest({urls:['<all_urls>']}, ['requestBody'])
 *    fires for every image, script, ad and API call the browser makes,
 *    has Chrome copy each request body across to the extension, and does
 *    a storage read per request — only to act when the request comes from
 *    the job tab while a form's "success" API call is awaited. It now only
 *    listens to the job tab (copilotTabId), only while a run is live, and
 *    only to page/API request types, with no request bodies. Idle: no hook
 *    at all.
 *
 * 2. A permanent keep-alive lifeline.
 *    Every 60s it re-injected a script into a tab (the first normal web
 *    tab it found — often the one you were using) to hold a port open, so
 *    the service worker never slept and the hook above ran forever. The
 *    lifeline is kept while a run is live, and only in the job tab; when
 *    idle the service worker is allowed to sleep like any other extension.
 *
 * Wiring: manifest.json background.service_worker points here. On an
 * OptimHire update, copy the new index.js in and keep this entry point.
 * Same directory as index.js on purpose, so nothing that resolves paths
 * relative to the worker script changes.
 */
/* global importScripts */   // service-worker global
(function () {
  'use strict';
  var KEYS = ['copilotTabId', 'isAutoProcessStartJob', 'isManuallyStartJob', 'autoApplyState'];
  var state = { tab: null, live: false, loaded: false };
  var ohSuccessWatch = null;      // OptimHire's handler, once it registers it
  var registered = null;          // { fn, tab } currently registered with Chrome
  var TYPES = ['main_frame', 'sub_frame', 'xmlhttprequest', 'ping', 'other'];

  function isLive(d) {
    var st = d && d.autoApplyState;
    return !!(d && (d.isAutoProcessStartJob || d.isManuallyStartJob || (st && st.isActive === true)));
  }

  var wr = chrome.webRequest && chrome.webRequest.onBeforeRequest;
  var origAdd = wr && wr.addListener.bind(wr);
  var origRemove = wr && wr.removeListener.bind(wr);

  /* (Re)register the success hook for the current job tab, or drop it. */
  function syncHook() {
    if (!wr || !ohSuccessWatch) return;
    var want = state.live && state.tab != null ? state.tab : null;
    if (registered && registered.tab === want) return;
    if (registered) { try { origRemove(registered.fn); } catch (_) {} registered = null; }
    if (want == null) return;
    var cb = ohSuccessWatch;
    var fn = function (details) { return cb(details); };
    try {
      origAdd(fn, { urls: ['<all_urls>'], tabId: want, types: TYPES });
      registered = { fn: fn, tab: want };
    } catch (_) {}
  }

  if (wr) {
    wr.addListener = function (cb, filter, extra) {
      try {
        var urls = filter && filter.urls;
        if (typeof cb === 'function' && Array.isArray(urls) && urls.indexOf('<all_urls>') !== -1 &&
            filter.tabId == null && !filter.types) {
          ohSuccessWatch = cb;       // held; registered per job tab by syncHook()
          if (state.loaded) syncHook();
          return;
        }
      } catch (_) {}
      return origAdd.apply(null, arguments);
    };
  }

  /* Keep-alive lifeline: only into the job tab, only while a run is live. */
  var sc = chrome.scripting;
  if (sc && sc.executeScript) {
    var origExec = sc.executeScript.bind(sc);
    sc.executeScript = function (injection, cb) {
      try {
        var f = injection && injection.func;
        if (typeof f === 'function' && /keepAlive/.test(String(f))) {
          var tabId = injection.target && injection.target.tabId;
          if (!(state.live && state.tab != null && tabId === state.tab)) {
            /* "Could not connect here" — OptimHire moves on to the next tab,
               then waits for a tab update, and the worker may sleep. */
            var res = [{ result: false }];
            if (typeof cb === 'function') { setTimeout(function () { cb(res); }, 0); return undefined; }
            return Promise.resolve(res);
          }
        }
      } catch (_) {}
      return origExec.apply(null, arguments);
    };
  }

  function apply(d) {
    var wasLive = state.live, wasTab = state.tab;
    state.tab = d.copilotTabId == null ? null : d.copilotTabId;
    state.live = isLive(d);
    state.loaded = true;
    syncHook();
    /* A run just started (or moved tabs): open the lifeline in the job tab
       straight away rather than waiting for the next tab update. */
    if (state.live && state.tab != null && (!wasLive || wasTab !== state.tab) && sc && origExec) {
      origExec({ target: { tabId: state.tab }, func: function () {
        try { chrome.runtime.connect({ name: 'keepAlive' }); return true; } catch (e) { return false; }
      } }).catch(function () {});
    }
  }

  var snap = {};
  try {
    chrome.storage.local.get(KEYS, function (d) { snap = d || {}; apply(snap); });
    chrome.storage.onChanged.addListener(function (c, area) {
      if (area !== 'local') return;
      var hit = false;
      KEYS.forEach(function (k) {
        if (c[k]) { hit = true; if (c[k].newValue === undefined) delete snap[k]; else snap[k] = c[k].newValue; }
      });
      if (hit) apply(snap);
    });
  } catch (_) {}
})();

importScripts('index.js');
