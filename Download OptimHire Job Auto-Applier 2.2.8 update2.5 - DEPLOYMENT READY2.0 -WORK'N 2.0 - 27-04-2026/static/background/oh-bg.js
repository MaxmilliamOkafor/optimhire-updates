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
 * 3. The toolbar badge shows how many jobs are LEFT in the queue while a
 *    run is going — OptimHire's own run (summary kept by the side panel in
 *    ohRunStats) or our CSV Job Queue — with the full breakdown on hover,
 *    and clears when nothing is running. Done here so it stays correct
 *    even when the side panel is closed.
 *
 * 4. ATS jobs first, Reed last. OptimHire's server hands out ONE job per
 *    request (GET /candidate/{id}/application), optionally filtered by
 *    ?jobsite=<key> (its liveATS list). With ohPreferAts on (default), each
 *    "next job" request asks the ATS sites first (sticking with the one
 *    that last had jobs), then the other job boards, and only then the
 *    normal mixed queue — which is where Reed comes from. A site with no
 *    jobs is skipped for 15 minutes, so this is ~1 request per job. A
 *    jobsite the user chose in OptimHire's own settings is left alone.
 *    Runs driven from the optimhire.com job-apply page ask for a specific
 *    job (?job_id=); during a run, a reed.co.uk / job-board job asked for
 *    that way is held back in favour of a waiting ATS job (not skipped —
 *    it stays in OptimHire's queue for later).
 *
 * Wiring: manifest.json background.service_worker points here. On an
 * OptimHire update, copy the new index.js in and keep this entry point.
 * Same directory as index.js on purpose, so nothing that resolves paths
 * relative to the worker script changes.
 */
/* global importScripts */   // service-worker global
(function () {
  'use strict';
  var KEYS = ['copilotTabId', 'isAutoProcessStartJob', 'isManuallyStartJob', 'autoApplyState',
              'ohRunStats', 'ohJobQueueActive', 'ohJobQueue', 'ohAutomationDisabled', 'ohPreferAts',
              'ohAutoApplyEngaged', 'ohAutoApplyEngagedTs', 'ohAutoPressTs', 'preferredJobsite'];
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

  /* ── Toolbar badge: jobs left in the queue ── */
  var _badge = null;
  var DEFAULT_TITLE = (function () {
    try { var a = chrome.runtime.getManifest().action; return (a && a.default_title) || 'OptimHire Job Auto-Applier'; }
    catch (_) { return 'OptimHire Job Auto-Applier'; }
  })();
  function short(n) { return n >= 10000 ? Math.floor(n / 1000) + 'k' : String(n); }
  function paintBadge(d) {
    if (!chrome.action) return;
    var text = '', title = DEFAULT_TITLE;
    var rs = d.ohRunStats && d.ohRunStats.summary;
    if (d.ohAutomationDisabled === true) {
      /* nothing runs */
    } else if (d.ohJobQueueActive && Array.isArray(d.ohJobQueue)) {
      var left = 0, applied = 0, failed = 0;
      d.ohJobQueue.forEach(function (j) {
        if (!j) return;
        if (j.status === 'pending' || j.status === 'running') left++;
        else if (j.status === 'applied') applied++;
        else if (j.status === 'failed') failed++;
      });
      text = short(left);
      title = 'Job Queue: ' + left + ' left · ' + applied + ' applied · ' + failed + ' failed';
    } else if (isLive(d) && rs) {
      text = rs.left != null ? short(rs.left) : short(rs.position || 0);
      title = 'OptimHire queue: job ' + (rs.position || 0) + (rs.total ? ' of ' + rs.total : '') +
              (rs.left != null ? ' · ' + rs.left + ' left' : '') + '\n' +
              rs.submitted + ' submitted · ' + rs.skipped + ' skipped · ' + rs.closed + ' closed' +
              (rs.error ? ' · ' + rs.error + ' errors' : '');
    }
    var sig = text + '|' + title;
    if (sig === _badge) return;
    _badge = sig;
    try {
      chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
      chrome.action.setBadgeText({ text: text });
      chrome.action.setTitle({ title: title });
    } catch (_) {}
  }

  function apply(d) {
    try { paintBadge(d); } catch (_) {}
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

  /* ── ATS jobs first, Reed last ── */
  var ATS_SITES = ['greenhouse', 'lever', 'ashby', 'workday', 'smartrecruiters', 'workable', 'bamboohr',
                   'breezyhr', 'jazzhr', 'jobvite', 'recruitee', 'rippling', 'comeet', 'paylocity',
                   'manatal', 'freshteam', 'recooty', 'gohire'];
  var BOARD_SITES = ['linkedin', 'indeed', 'ziprecruiter', 'ziprecruiterpaid', 'adzuna', 'adzunapaid', 'dice'];
  var EMPTY_TTL_MS = 15 * 60 * 1000;
  var _emptyUntil = {};
  var _sticky = null;
  var _tierSig = '';
  var NEXT_JOB_RE = /\/candidate\/[^/?#]+\/application(?:[?#]|$)/;
  var REED_HOST_RE = /(^|\.)reed\.co\.uk$/i;
  var BOARD_HOST_RE = /(^|\.)(linkedin|indeed|ziprecruiter|adzuna|dice|glassdoor|monster|totaljobs|cv-library|simplyhired|careerbuilder|jooble)\./i;
  var ATS_HOST_RE = /greenhouse|lever\.co|myworkdayjobs|workday|ashbyhq|smartrecruiters|workable|bamboohr|breezy|jazzhr|resumatorapi|jobvite|recruitee|rippling|comeet|paylocity|manatal|freshteam|recooty|gohire|icims|taleo|oraclecloud|successfactors|ultipro|teamtailor|pinpointhq|avature/i;
  var _fetch = self.fetch.bind(self);

  function noteTier(tier, site, heldBack) {
    var sig = tier + '|' + (site || '') + '|' + (heldBack || '');
    if (sig === _tierSig) return;
    _tierSig = sig;
    try { chrome.storage.local.set({ ohQueueTier: { tier: tier, site: site || '', heldBack: heldBack || '', ts: Date.now() } }); } catch (_) {}
  }
  function withSite(url, site) {
    var i = url.indexOf('#'), base = i >= 0 ? url.slice(0, i) : url;
    return base + (base.indexOf('?') >= 0 ? '&' : '?') + 'jobsite=' + encodeURIComponent(site);
  }
  /* The job inside an OptimHire reply (ok, status != 0, data.data), or null. */
  function jobOf(res) {
    if (!res || !res.ok) return Promise.resolve(null);
    return res.clone().json().then(function (b) {
      var j = b && b.status !== 0 && b.data;
      return j && (j.source || j.copilot_job_id) ? j : null;
    }, function () { return null; });
  }
  /* reed | board | ats | other (a company's own career site) */
  function jobKind(j) {
    var src = (j && j.source) || {};
    var host = '';
    try { host = new URL(src.apply_now_url || src.job_url || '').hostname.toLowerCase(); } catch (_) {}
    var ai = j && j.additional_info && !Array.isArray(j.additional_info) ? j.additional_info : {};
    var names = [j && j.ats_name, ai.source_name, src.source_name, src.job_board].filter(Boolean).join(' ');
    if (REED_HOST_RE.test(host) || /\breed\b/i.test(names)) return 'reed';
    if (BOARD_HOST_RE.test(host) || /\b(linkedin|indeed|ziprecruiter|adzuna|dice)\b/i.test(names)) return 'board';
    if (ATS_HOST_RE.test(host) || ATS_HOST_RE.test(names)) return 'ats';
    return 'other';
  }
  /* First job from these jobsite tiers (ATS, then boards…), skipping sites
     known to be empty and `excludeId`. Returns {res, tier, site},
     {auth:true} on a login error, or null. */
  async function firstJobFrom(tiers, url, init, excludeId) {
    for (var t = 0; t < tiers.length; t++) {
      var now = Date.now();
      var order = tiers[t][1].filter(function (k) { return !(_emptyUntil[k] > now); });
      if (_sticky && order.indexOf(_sticky) > 0) { order.splice(order.indexOf(_sticky), 1); order.unshift(_sticky); }
      for (var i = 0; i < order.length; i++) {
        var site = order[i], res = null;
        try { res = await _fetch(withSite(url, site), init); } catch (_) { continue; }   // network: don't mark empty
        if (res && (res.status === 401 || res.status === 403)) return { auth: true };
        var j = await jobOf(res);
        if (j && !(excludeId && String(j.copilot_job_id || '') === excludeId)) {
          _sticky = site;
          return { res: res, tier: tiers[t][0], site: site };
        }
        _emptyUntil[site] = Date.now() + EMPTY_TTL_MS;
        if (_sticky === site) _sticky = null;
      }
    }
    return null;
  }
  /* "Give me the next job": ATS first, then other boards, then the normal
     mixed queue (where Reed comes from). */
  async function nextJobAtsFirst(url, init) {
    var hit = await firstJobFrom([['ATS', ATS_SITES], ['job boards', BOARD_SITES]], url, init, '');
    if (hit && hit.res) { noteTier(hit.tier, hit.site, ''); return hit.res; }
    if (!(hit && hit.auth)) noteTier('everything else (incl. Reed)', '', '');
    return _fetch(url, init);
  }
  /* A run driven from optimhire.com (the job-apply page's Apply — which is
     what the automation presses) asks for ONE SPECIFIC job by job_id, so
     the page, not the server, picks the order and Reed kept coming first.
     While a run is going, if that job is a reed.co.uk job (or another job
     board's) and an ATS job is waiting, apply the ATS job instead. The
     Reed job is not skipped or marked — it stays in OptimHire's queue and
     comes back once the ATS jobs are done. */
  function automationDriven() {
    var now = Date.now();
    if (now - (+snap.ohAutoPressTs || 0) < 30000) return true;         // our auto-clicker just pressed Apply
    return !!snap.ohAutoApplyEngaged && now - (+snap.ohAutoApplyEngagedTs || 0) < 10 * 60 * 1000;
  }
  async function heldBackSwap(url, init) {
    var res = await _fetch(url, init);
    if (!automationDriven() || snap.preferredJobsite) return res;
    var j = await jobOf(res);
    if (!j) return res;
    var kind = jobKind(j);
    if (kind !== 'reed' && kind !== 'board') return res;
    var base = url.replace(/[?#].*$/, '');
    var tiers = kind === 'reed' ? [['ATS', ATS_SITES], ['job boards', BOARD_SITES]] : [['ATS', ATS_SITES]];
    var hit = await firstJobFrom(tiers, base, init, String(j.copilot_job_id || ''));
    if (hit && hit.res) {
      noteTier(hit.tier, hit.site, kind);
      try { console.info('[OH-BG] held back a ' + kind + ' job (' + ((j.source && j.source.job_title) || j.copilot_job_id) + ') — applying a ' + hit.tier + ' job from ' + hit.site + ' first'); } catch (_) {}
      return hit.res;
    }
    noteTier(kind === 'reed' ? 'Reed (no ATS or other jobs waiting)' : 'job boards (no ATS jobs waiting)', '', '');
    return res;
  }
  self.fetch = function (input, init) {
    try {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      if (method === 'GET' && NEXT_JOB_RE.test(url) && snap.ohPreferAts !== false && snap.ohAutomationDisabled !== true) {
        if (/[?&]job_id=/.test(url)) return heldBackSwap(url, init);
        if (!/[?&]jobsite=/.test(url)) return nextJobAtsFirst(url, init);
      }
    } catch (_) {}
    return _fetch(input, init);
  };

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
