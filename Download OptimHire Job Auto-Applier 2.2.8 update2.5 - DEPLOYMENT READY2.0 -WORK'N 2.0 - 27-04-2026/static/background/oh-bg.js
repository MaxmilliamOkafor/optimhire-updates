/**
 * oh-bg.js — service-worker entry point. Loads OptimHire's background
 * (index.js — unchanged but for the pauses in 8) after narrowing two things in it that kept the
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
 * 6. OptimHire's own auto-submit, back on. 2.9.0 overwrites
 *    is_copilot_automatic_apply_to_job with "0" every time it saves your
 *    profile, so its engine filled each form and then STOPPED at "Review and
 *    submit the form" — and did not move on after a success either. That
 *    stored flag decides whether OptimHire submits the form itself (with
 *    its per-site knowledge of each ATS) and goes to the next job. It is
 *    kept at "1" while automation is ON (master switch).
 *
 * 7. Workday sign-in before OptimHire's login check (see 7 below).
 *
 * 8. Shorter fixed pauses between jobs — edited in index.js itself (the
 *    only edits there): after a submission 3 s → 0.4 s, after an error 5 s →
 *    0.6 s, "Loading next job" 2 s → 0.3 s, job closed 2 s → 0.5 s, around
 *    fetching the next job 1 s → 0.25 s, and the settle after a job page
 *    loads 2 s (5 s on redirecting sites) → 1 s (2.5 s). Search index.js
 *    for "setTimeout(e,400)" etc. to re-apply after an OptimHire update.
 *
 * 9. Workday jobs go to the Workday engine (assets/wd-engine.js, built from
 *    workday-engine/): OptimHire's FILL_COMPLEX_FORM for a Workday tab is
 *    handed to it as oh:wd:start; it signs in, uploads the CV, fills every
 *    step, submits and reports back like OptimHire's own filler. If it
 *    doesn't answer within 8 s the message goes to OptimHire's filler as
 *    before. ohWdEngineOff: true in storage turns it off.
 *
 * 10. Verification codes from the Gmail you are signed in to (opt-in:
 *    ohGmailCodes, Queue Manager → Workday sign-in). Oracle's "Confirm Your
 *    Identity" (and Workday / others) email a code; a content script asks
 *    OH_MAIL_FIND_CODE and this reads Gmail's own unread-inbox feed
 *    (mail.google.com/mail/feed/atom — what Gmail notifiers read): only mail
 *    from the last 15 minutes, newer than the code screen, that reads like a
 *    verification email. Read-only; nothing is stored. Ported from the
 *    Jobright build (ua-mailbox.js).
 *    10b. The same feed gives the Workday engine the links in Workday's
 *    emails: a password reset for an account made before with another
 *    password (or locked) — the link is opened in a background tab and your
 *    Workday password set there — and "verify your email".
 *
 * 11. Other job-autofill extensions (ATS TAILOR, Job Genie, Simplify…) are
 *    paused while a run is going — two fillers on one form undo each other —
 *    and turned back on when it ends (also after a restart). ohPauseOthers:
 *    false (the switch on the side panel's Job Queue card) leaves them alone.
 *
 * 12. The CSV Job Queue is run from here (queue-runner.js): closing the Queue
 *    Manager no longer slows a run down to one job at a time.
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
              'ohAutoApplyEngaged', 'ohAutoApplyEngagedTs', 'ohAutoPressTs', 'preferredJobsite', 'ohWdEngineOff', 'ohPauseOthers'];
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

  /* 11. Other autofill extensions, paused during runs. */
  var OTHER_FILLER_RE = /ats ?tailor|job ?genie|simplify|jobright|speedy ?apply|lazy ?apply|auto ?fill|auto[- ]?appl|job ?assist|careerflow|huntr|job ?copilot|\bteal\b|apply ?ai|ai ?apply|jobscan|massapply|loopcv|sonara/i;
  var _othersBusy = false;
  function syncOthers(d) {
    var mg = chrome.management;
    if (!mg || _othersBusy) return;
    var live = !!(isLive(d) || d.ohJobQueueActive);
    var want = live && d.ohPauseOthers !== false && d.ohAutomationDisabled !== true;
    _othersBusy = true;
    chrome.storage.local.get(['ohPausedExts'], function (st) {
      var paused = (st && Array.isArray(st.ohPausedExts)) ? st.ohPausedExts : [];
      var done = function () { _othersBusy = false; };
      if (want && !paused.length) {
        mg.getAll(function (list) {
          void chrome.runtime.lastError;
          var hit = (list || []).filter(function (e) {
            return e.id !== chrome.runtime.id && e.enabled && e.type === 'extension' && e.mayDisable !== false &&
                   OTHER_FILLER_RE.test((e.name || '') + ' ' + (e.shortName || ''));
          });
          if (!hit.length) { done(); return; }
          hit.forEach(function (e) { mg.setEnabled(e.id, false, function () { void chrome.runtime.lastError; }); });
          chrome.storage.local.set({ ohPausedExts: hit.map(function (e) { return { id: e.id, name: e.name }; }) }, done);
          try { console.info('[OH-BG] paused during the run: ' + hit.map(function (e) { return e.name; }).join(', ')); } catch (_) {}
        });
      } else if (!want && paused.length) {
        paused.forEach(function (e) { mg.setEnabled(e.id, true, function () { void chrome.runtime.lastError; }); });
        chrome.storage.local.set({ ohPausedExts: [] }, done);
        try { console.info('[OH-BG] turned back on: ' + paused.map(function (e) { return e.name; }).join(', ')); } catch (_) {}
      } else done();
    });
  }

  function apply(d) {
    try { paintBadge(d); } catch (_) {}
    try { syncOthers(d); } catch (_) {}
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
     {auth:true} on a login error, or null (nothing, or out of time).

     Must be FAST: this runs while the panel shows "Loading your Job". The
     first version asked one site at a time with no time limit — up to 25
     slow requests in a row — and a run could sit on "Loading your Job"
     for minutes. Now: the site that last had jobs is asked alone first
     (1 request per job in steady state); otherwise the remaining sites are
     asked IN PARALLEL, each capped at PROBE_TIMEOUT_MS, and the whole
     search at BUDGET_MS — after which OptimHire's normal request runs. */
  var PROBE_TIMEOUT_MS = 5000;
  var BUDGET_MS = 10000;               // browsers run ~6 requests per host at once, so allow two waves
  var FAIL_TTL_MS = 5 * 60 * 1000;     // a site that timed out/errored is left alone this long
  function probe(url, init, site, handle) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var cancelled = false, timedOut = false;
    /* The pool can cancel a probe it no longer needs (a job was found) —
       that frees the connection and says nothing about the site. */
    if (handle) handle.cancel = function () { cancelled = true; try { if (ctl) ctl.abort(); } catch (_) {} };
    var timer = setTimeout(function () { timedOut = true; try { if (ctl) ctl.abort(); } catch (_) {} }, PROBE_TIMEOUT_MS);
    var opts = Object.assign({}, init || {});
    if (ctl) opts.signal = ctl.signal;
    return _fetch(withSite(url, site), opts).then(function (res) {
      if (res.status === 401 || res.status === 403) { clearTimeout(timer); return { site: site, auth: true }; }
      return jobOf(res).then(function (j) {
        clearTimeout(timer);
        /* Aborted while the body was being read: that is NOT "no jobs". */
        if (cancelled) return { site: site, cancelled: true };
        if (!j && timedOut) return { site: site, failed: true };
        return { site: site, res: j ? res : null, job: j };
      });
    }, function () { clearTimeout(timer); return cancelled ? { site: site, cancelled: true } : { site: site, failed: true }; }).then(function (r) {
      /* Learn from every answer — also ones that arrive after the search
         gave up — so the next lookup goes straight to a site with jobs. */
      if (r.res) { if (!_sticky) _sticky = site; }
      else if (!r.auth && !r.cancelled) _emptyUntil[site] = Date.now() + (r.failed ? FAIL_TTL_MS : EMPTY_TTL_MS);
      return r;
    });
  }
  /* At most `limit` requests in flight (a browser queues the rest itself,
     and a queued request's timeout would run out before it is even sent).
     Results come back per site, in the given order; stop() ends launching. */
  function probePool(sites, url, init, limit) {
    var slots = sites.map(function () { var o = {}; o.p = new Promise(function (r) { o.done = r; }); return o; });
    var next = 0, stopped = false, handles = [];
    function launch() {
      if (stopped || next >= sites.length) return;
      var i = next++;
      handles[i] = {};
      probe(url, init, sites[i], handles[i]).then(function (r) { handles[i] = null; slots[i].done(r); launch(); });
    }
    for (var k = 0; k < Math.min(limit, sites.length); k++) launch();
    return { results: slots.map(function (o) { return o.p; }),
             stop: function () { stopped = true; handles.forEach(function (h) { if (h && h.cancel) h.cancel(); }); } };
  }
  function within(p, ms) {
    return Promise.race([p, new Promise(function (r) { setTimeout(function () { r(null); }, Math.max(0, ms)); })]);
  }
  async function firstJobFrom(tiers, url, init, excludeId) {
    var deadline = Date.now() + BUDGET_MS;
    function take(r, tier) {
      if (!r) return 'timeout';
      if (r.auth) return { auth: true };
      if (r.cancelled) return null;
      if (r.res && !(excludeId && String((r.job && r.job.copilot_job_id) || '') === excludeId)) {
        _sticky = r.site;
        return { res: r.res, tier: tier, site: r.site };
      }
      _emptyUntil[r.site] = Date.now() + (r.failed ? FAIL_TTL_MS : EMPTY_TTL_MS);
      if (_sticky === r.site) _sticky = null;
      return null;
    }
    for (var t = 0; t < tiers.length; t++) {
      var now = Date.now();
      var order = tiers[t][1].filter(function (k) { return !(_emptyUntil[k] > now); });
      if (!order.length) continue;
      /* Steady state: the site that just had jobs, on its own. */
      if (_sticky && order.indexOf(_sticky) !== -1) {
        var first = take(await within(probe(url, init, _sticky), deadline - Date.now()), tiers[t][0]);
        if (first === 'timeout') return null;
        if (first) return first;
        order = order.filter(function (k) { return k !== _sticky && !(_emptyUntil[k] > Date.now()); });
      }
      /* Otherwise the remaining sites in parallel (6 at a time); take the
         best-ranked hit. */
      var pool = probePool(order, url, init, 6);
      for (var i = 0; i < order.length; i++) {
        var hit = take(await within(pool.results[i], deadline - Date.now()), tiers[t][0]);
        if (hit === 'timeout') { pool.stop(); return null; }
        if (hit) { pool.stop(); return hit; }
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

  /* 7. Workday: sign in before OptimHire checks. Each company's Workday
     site needs its own account; OptimHire only checks whether one is
     signed in (CHECK_LOGIN_STATUS to the job tab) and otherwise shows
     "Login required" and skips — every Workday job was skipped. On a
     Workday tab our content script signs in / creates the account first
     (OH_WORKDAY_SIGN_IN), then OptimHire's own check runs as usual. */
  var WD_HOST_RE = /(^|\.)(myworkdayjobs\.com|myworkdaysite\.com|workday\.com)$/i;
  var WD_SIGN_IN_MS = 75000;
  /* 9. Hosts the Workday engine's content script runs on (manifest). */
  var WD_ENGINE_RE = /(^|\.)(myworkdayjobs|myworkdaysite|myworkday|workdayjobs)\.com$/i;
  var WD_ENGINE_ACK_MS = 8000;
  var tabsApi = chrome.tabs;
  function tabHost(tabId) {
    return new Promise(function (resolve) {
      tabsApi.get(tabId, function (t) {
        void chrome.runtime.lastError;
        var host = '';
        try { host = new URL((t && (t.url || t.pendingUrl)) || '').hostname; } catch (_) {}
        resolve(host);
      });
    });
  }
  if (tabsApi && typeof tabsApi.sendMessage === 'function') {
    var origSend = tabsApi.sendMessage.bind(tabsApi);
    tabsApi.sendMessage = function (tabId, msg) {
      var args = arguments;
      try {
        if (msg && msg.type === 'FILL_COMPLEX_FORM' && typeof tabId === 'number' &&
            typeof args[args.length - 1] !== 'function' && snap.ohAutomationDisabled !== true && snap.ohWdEngineOff !== true) {
          return tabHost(tabId).then(function (host) {
            if (!WD_ENGINE_RE.test(host)) return origSend.apply(null, args);
            var start = Object.assign({}, msg, { type: 'oh:wd:start' });
            return within(origSend(tabId, start, { frameId: 0 }).catch(function () { return null; }), WD_ENGINE_ACK_MS)
              .then(function (r) {
                if (r && r.acknowledged) {
                  try { console.info('[OH-BG] Workday job handed to the Workday engine on ' + host); } catch (_) {}
                  return { acknowledged: true };
                }
                try { console.info('[OH-BG] Workday engine did not answer on ' + host + ' — OptimHire fills it'); } catch (_) {}
                return origSend.apply(null, args);
              });
          });
        }
        if (msg && msg.type === 'CHECK_LOGIN_STATUS' && typeof tabId === 'number' &&
            typeof args[args.length - 1] !== 'function' && snap.ohAutomationDisabled !== true) {
          return new Promise(function (resolve) {
            tabsApi.get(tabId, function (t) { void chrome.runtime.lastError; resolve((t && (t.url || t.pendingUrl)) || ''); });
          }).then(function (url) {
            var host = '';
            try { host = new URL(url).hostname; } catch (_) {}
            if (!WD_HOST_RE.test(host)) return origSend.apply(null, args);
            return within(origSend(tabId, { type: 'OH_WORKDAY_SIGN_IN' }, { frameId: 0 }).catch(function () { return null; }), WD_SIGN_IN_MS)
              .then(function (r) {
                try { console.info('[OH-BG] Workday sign-in on ' + host + ': ' + JSON.stringify(r)); } catch (_) {}
                return origSend.apply(null, args);
              });
          });
        }
      } catch (_) {}
      return origSend.apply(null, args);
    };
  }

  /* 9. Reading your CV (roles, education, skills): the reader — pdf.js, 1.4 MB —
     is put into the asking tab only when a CV has to be read. */
  try {
    chrome.runtime.onMessage.addListener(function (msg, sender, reply) {
      if (!msg || msg.type !== 'OH_CV_LOAD' || sender.id !== chrome.runtime.id || !sender.tab) return;
      chrome.scripting.executeScript({ target: { tabId: sender.tab.id, frameIds: [sender.frameId || 0] }, files: ['assets/wd-cvtext.js'] })
        .then(function () { reply({ ok: true }); }, function (e) { reply({ ok: false, error: String((e && e.message) || e) }); });
      return true;
    });
  } catch (_) {}

  /* 9. The Workday engine fetches the CV here when the page may not (CORS). */
  try {
    chrome.runtime.onMessage.addListener(function (msg, sender, reply) {
      if (!msg || msg.type !== 'OH_WD_FETCH_FILE' || sender.id !== chrome.runtime.id ||
          typeof msg.url !== 'string' || !/^https:\/\//i.test(msg.url)) return;
      fetch(msg.url).then(function (r) {
        if (!r.ok) return null;
        var mime = r.headers.get('content-type') || '';
        return r.arrayBuffer().then(function (buf) {
          var bytes = new Uint8Array(buf), bin = '';
          for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
          return { base64: btoa(bin), mime: mime };
        });
      }).then(reply, function () { reply(null); });
      return true;
    });
  } catch (_) {}

  /* 10. Verification codes from the signed-in Gmail. */
  var MAIL_MAX_AGE_MS = 15 * 60000;
  var MAIL_LABELS = ['', '%5Esq_ig_i_notification'];      // the inbox, and Gmail's "Updates" tab
  var VERIFY_WORDS_RE = /verif|confirm|identity|one.?time|passcode|security code|your code|code requested|pin\b|otp\b|sign.?in code|log.?in code/i;
  var CODE_NEAR_RE = /(?:code|pin|passcode|otp)[^0-9]{0,80}?\b(\d{4,8})\b/i;
  function xmlText(x) {
    return String(x || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
  }
  function xmlTag(block, name) {
    var m = block.match(new RegExp('<' + name + '\\b[^>]*>([\\s\\S]*?)</' + name + '>', 'i'));
    return m ? xmlText(m[1]) : '';
  }
  function parseAtom(xml) {
    var out = [], re = /<entry\b[\s\S]*?<\/entry>/gi, m;
    while ((m = re.exec(String(xml || '')))) {
      var b = m[0], author = (b.match(/<author\b[\s\S]*?<\/author>/i) || [''])[0];
      var lk = b.match(/<link\b[^>]*\bhref="([^"]+)"/i);
      out.push({ title: xmlTag(b, 'title'), summary: xmlTag(b, 'summary'),
                 issued: Date.parse(xmlTag(b, 'issued') || xmlTag(b, 'modified')) || 0,
                 from: (xmlTag(author, 'name') + ' ' + xmlTag(author, 'email')).trim(),
                 link: lk ? xmlText(lk[1]) : '' });
    }
    return out;
  }
  async function findCodeInGmail(hints) {
    var since = Number(hints.since) || 0;
    var cutoff = Math.max(Date.now() - MAIL_MAX_AGE_MS, since - 60000);
    var tokens = [];
    (hints.hosts || []).concat(hints.companies || []).forEach(function (h) {
      String(h || '').toLowerCase().split(/[^a-z0-9]+/).forEach(function (w) {
        if (w.length > 2 && !/^(www|com|net|org|jobs|careers|apply|oraclecloud|oracle|fa|ocs|myworkdayjobs|wd\d+|hcmui)$/.test(w) && tokens.indexOf(w) < 0) tokens.push(w);
      });
    });
    var found = [], signedIn = false;
    for (var u = 0; u < 4; u++) {
      for (var li = 0; li < MAIL_LABELS.length; li++) {
        var res;
        try { res = await _fetch('https://mail.google.com/mail/u/' + u + '/feed/atom/' + MAIL_LABELS[li], { credentials: 'include', cache: 'no-store' }); }
        catch (_) { continue; }
        if (!res.ok) { if (li === 0) break; continue; }
        var xml = await res.text();
        if (!/<feed\b/i.test(xml)) { if (li === 0) break; continue; }
        signedIn = true;
        parseAtom(xml).forEach(function (e) {
          if (e.issued && e.issued < cutoff) return;
          var text = e.title + ' ' + e.summary;
          if (!VERIFY_WORDS_RE.test(text)) return;
          var m = text.match(CODE_NEAR_RE) || text.match(/\b(\d{6})\b/);
          if (!m) return;
          var hay = (e.from + ' ' + text).toLowerCase();
          found.push({ code: m[1], issued: e.issued, tie: tokens.some(function (t) { return hay.indexOf(t) >= 0; }) ? 1 : 0 });
        });
      }
    }
    if (!signedIn) return { ok: false, reason: 'gmail-not-signed-in' };
    if (!found.length) return { ok: false, reason: 'no-message' };
    found.sort(function (a, b) { return (b.tie - a.tie) || (b.issued - a.issued); });
    return { ok: true, code: found[0].code, tie: !!found[0].tie };
  }
  try {
    chrome.runtime.onMessage.addListener(function (msg, sender, reply) {
      if (!msg || msg.type !== 'OH_MAIL_FIND_CODE' || sender.id !== chrome.runtime.id) return;
      chrome.storage.local.get(['ohGmailCodes'], function (d) {
        if (!d || d.ohGmailCodes !== true) { reply({ ok: false, reason: 'off' }); return; }
        var hosts = Array.isArray(msg.hosts) ? msg.hosts.slice(0, 6) : [];
        if (!hosts.length && sender.tab && sender.tab.url) { try { hosts.push(new URL(sender.tab.url).hostname); } catch (_) {} }
        findCodeInGmail({ hosts: hosts, companies: (msg.companies || []).slice(0, 3), since: msg.since })
          .then(reply, function (e) { reply({ ok: false, reason: String((e && e.message) || e) }); });
      });
      return true;
    });
  } catch (_) {}

  /* 10b. Links in Workday emails, for the Workday engine: a password reset (your account at an
     employer was made before with another password, or is locked) and "verify your email". The
     email is found in the same Gmail feed (same opt-in), opened in a background tab to read its
     link, and the link is opened in another background tab: for a reset, your Workday password is
     set there. Both tabs are closed afterwards; nothing is kept. */
  var LINK_MAIL_RE = { reset: /password|reset|passwort|mot de passe|contraseña|senha|wachtwoord|hasło/i,
                       verify: /verif|activat|confirm|bestätig|vérifi|welcome|account/i };
  var LINK_HREF_RE = { reset: /reset|password|passwort|token|recover/i, verify: /verif|activat|confirm|token/i };
  var WD_LINK_RE = /myworkday(jobs|site)?\.com|workdayjobs\.com|\.workday\.com/i;
  function keepAlive() { try { chrome.runtime.getPlatformInfo(function () {}); } catch (_) {} }
  function sleepMs(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function gmailEntries(kind, hosts, since) {
    var tokens = [];
    (hosts || []).forEach(function (h) {
      String(h || '').toLowerCase().split(/[^a-z0-9]+/).forEach(function (w) {
        if (w.length > 2 && !/^(www|com|net|org|jobs|careers|myworkdayjobs|myworkdaysite|myworkday|workday|wd\d+)$/.test(w) && tokens.indexOf(w) < 0) tokens.push(w);
      });
    });
    var out = [], signedIn = false;
    for (var u = 0; u < 4; u++) {
      for (var li = 0; li < MAIL_LABELS.length; li++) {
        var res;
        try { res = await _fetch('https://mail.google.com/mail/u/' + u + '/feed/atom/' + MAIL_LABELS[li], { credentials: 'include', cache: 'no-store' }); }
        catch (_) { continue; }
        if (!res.ok) { if (li === 0) break; continue; }
        var xml = await res.text();
        if (!/<feed\b/i.test(xml)) { if (li === 0) break; continue; }
        signedIn = true;
        parseAtom(xml).forEach(function (e) {
          if (!e.link || (e.issued && e.issued < since - 120000)) return;
          var text = e.title + ' ' + e.summary;
          if (!LINK_MAIL_RE[kind].test(text)) return;
          var hay = (e.from + ' ' + text).toLowerCase();
          var tie = (tokens.some(function (t) { return hay.indexOf(t) >= 0; }) ? 2 : 0) + (/workday/.test(hay) ? 1 : 0);
          if (tie) out.push({ link: e.link, issued: e.issued, tie: tie });
        });
      }
    }
    out.sort(function (a, b) { return (b.tie - a.tie) || (b.issued - a.issued); });
    return { signedIn: signedIn, entries: out };
  }
  /* Open a page in a background tab, run fn there (with args), close it. */
  async function inTab(url, fn, args) {
    var tab = await chrome.tabs.create({ url: url, active: false });
    try {
      for (var i = 0; i < 60; i++) {
        var t = await chrome.tabs.get(tab.id).catch(function () { return null; });
        if (!t) return null;
        if (t.status === 'complete') break;
        await sleepMs(500);
      }
      var r = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: fn, args: args || [] });
      return r && r[0] ? r[0].result : null;
    } catch (e) {
      return { ok: false, reason: String((e && e.message) || e).slice(0, 120) };
    } finally {
      try { await chrome.tabs.remove(tab.id); } catch (_) {}
    }
  }
  /* In the Gmail message tab: every link once the message has rendered. */
  function scrapeLinks() {
    return new Promise(function (resolve) {
      var n = 0;
      var t = setInterval(function () {
        var links = Array.prototype.map.call(document.querySelectorAll('a[href]'), function (a) {
          return { href: a.href, text: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) };
        });
        if (links.some(function (l) { return /myworkday|workdayjobs|workday\.com/i.test(l.href); }) || ++n > 40) { clearInterval(t); resolve(links); }
      }, 500);
    });
  }
  /* On Workday's reset page: your password in both boxes, then submit. */
  function fillReset(password, email) {
    return new Promise(function (resolve) {
      var vis = function (el) { return !!(el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'); };
      var setVal = function (el, v) {
        var d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        el.focus(); d.set.call(el, v);
        ['input', 'change', 'blur'].forEach(function (ty) { el.dispatchEvent(new Event(ty, { bubbles: true })); });
      };
      var click = function (el) {
        var f = el.parentElement && el.parentElement.querySelector('[data-automation-id="click_filter"]');
        var t = f && vis(f) ? f : el;
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function (ty) { t.dispatchEvent(new MouseEvent(ty, { bubbles: true, cancelable: true, view: window })); });
      };
      var DONE_RE = /(password|passwort|mot de passe|contraseña|senha|wachtwoord|hasło)\b[^.]{0,40}\b(reset|changed|updated|geändert|zurückgesetzt|modifié|réinitialisé|cambiad|restablecid|alterad|redefinid|gewijzigd)|successfully|erfolgreich|succès|éxito|sucesso/i;
      var n = 0, sent = false;
      var tick = setInterval(function () {
        n++;
        var body = (document.body && document.body.innerText) || '';
        var pws = Array.prototype.filter.call(document.querySelectorAll('input[type="password"]'), vis);
        if (sent) {
          if (DONE_RE.test(body)) { clearInterval(tick); resolve({ ok: true }); }
          else if (n > 24) {
            var err = document.querySelector('[data-automation-id="errorMessage"],[role="alert"]');
            clearInterval(tick);
            resolve(err && err.textContent.trim() ? { ok: false, reason: err.textContent.trim().slice(0, 140) } : { ok: false, submitted: true, reason: 'no confirmation' });
          }
          return;
        }
        if (!pws.length) {
          if (n > 40) { clearInterval(tick); resolve({ ok: false, reason: /expired|invalid|no longer valid/i.test(body) ? 'the reset link has expired' : 'no reset form on the emailed link' }); }
          return;
        }
        var em = Array.prototype.find.call(document.querySelectorAll('input[type="email"],input[data-automation-id="email"]'), vis);
        if (em && !em.value && email) setVal(em, email);
        pws.forEach(function (p) { setVal(p, password); });
        var btn = Array.prototype.filter.call(document.querySelectorAll('[data-automation-id*="ubmit" i],button,[role="button"],input[type="submit"]'), vis)
          .find(function (b) { return /^(submit|reset|change|update|save|set|continue|confirm|ok)\b/i.test((b.textContent || b.value || '').trim()); });
        if (!btn) return;
        sent = true; n = 0;
        setTimeout(function () { click(btn); }, 300);
      }, 500);
    });
  }
  /* On the emailed verify link: press Verify / Activate / Continue if the page asks. */
  function pressVerify() {
    return new Promise(function (resolve) {
      var n = 0;
      var t = setInterval(function () {
        n++;
        var b = Array.prototype.find.call(document.querySelectorAll('button,[role="button"],a,input[type="submit"]'), function (x) {
          return x.getClientRects().length && /^(verify|activate|confirm|continue)\b/i.test((x.textContent || x.value || '').trim());
        });
        if (b) { b.click(); }
        if (b || n > 8) { clearInterval(t); setTimeout(function () { resolve({ ok: true }); }, 2500); }
      }, 500);
    });
  }
  async function workdayMailLink(msg) {
    var kind = msg.kind === 'verify' ? 'verify' : 'reset';
    var since = Number(msg.since) || Date.now();
    var seen = {}, start = Date.now(), signedIn = false;
    while (Date.now() - start < 150000) {
      keepAlive();
      var r = await gmailEntries(kind, [msg.host], since);
      signedIn = signedIn || r.signedIn;
      if (!r.signedIn) return { ok: false, reason: 'not signed in to Gmail in this browser' };
      for (var i = 0; i < r.entries.length; i++) {
        var e = r.entries[i];
        if (seen[e.link]) continue;
        seen[e.link] = 1;
        var links = await inTab(e.link, scrapeLinks, []) || [];
        if (!Array.isArray(links)) continue;
        var hit = links.find(function (l) { return WD_LINK_RE.test(l.href) && LINK_HREF_RE[kind].test(l.href + ' ' + l.text); });
        if (!hit) continue;
        if (kind === 'verify') { await inTab(hit.href, pressVerify, []); return { ok: true }; }
        var done = await inTab(hit.href, fillReset, [String(msg.password || ''), String(msg.email || '')]);
        return done || { ok: false, reason: 'the reset page did not load' };
      }
      await sleepMs(6000);
    }
    return { ok: false, reason: kind === 'verify' ? 'no verification email arrived' : 'no reset email arrived' };
  }
  try {
    chrome.runtime.onMessage.addListener(function (msg, sender, reply) {
      if (!msg || msg.type !== 'OH_WD_MAIL_LINK' || sender.id !== chrome.runtime.id) return;
      chrome.storage.local.get(['ohGmailCodes'], function (d) {
        if (!d || d.ohGmailCodes !== true) { reply({ ok: false, reason: 'emailed codes are off' }); return; }
        workdayMailLink(msg).then(reply, function (e) { reply({ ok: false, reason: String((e && e.message) || e) }); });
      });
      return true;
    });
  } catch (_) {}

  /* CSV queue entries that are not job links (an old import turned a scraped
     page's cells into "jobs" like https://font-semibold/) can never be
     opened; dropped once at start-up so every count is right. */
  try {
    chrome.storage.local.get(['ohJobQueue'], function (d) {
      var q = d && Array.isArray(d.ohJobQueue) ? d.ohJobQueue : null;
      if (!q || !q.length) return;
      var ok = q.filter(function (j) {
        try {
          var u = new URL(String((j && j.url) || ''));
          return /^https?:$/.test(u.protocol) && /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(u.hostname) &&
                 !/\.(png|jpe?g|gif|svg|webp|ico|css|js|pdf)(\?|$)/i.test(u.pathname);
        } catch (_) { return false; }
      });
      if (ok.length < q.length) chrome.storage.local.set({ ohJobQueue: ok });
    });
  } catch (_) {}

  /* Auto-submit: keep OptimHire's "automatic apply" flag on (see 6 above). */
  var AUTO_FLAG = 'is_copilot_automatic_apply_to_job';
  var area = chrome.storage && chrome.storage.local;
  var _origSet = area && area.set ? area.set.bind(area) : null;
  if (_origSet) {
    area.set = function (items, cb) {
      try {
        var cd = items && items.candidateDetails;
        if (cd && typeof cd === 'object' && cd[AUTO_FLAG] !== '1' && snap.ohAutomationDisabled !== true) {
          var copy = Object.assign({}, cd); copy[AUTO_FLAG] = '1';
          items = Object.assign({}, items, { candidateDetails: copy });
        }
      } catch (_) {}
      return typeof cb === 'function' ? _origSet(items, cb) : _origSet(items);
    };
  }
  /* …and every READ of the profile by OptimHire's background sees it on —
     its auto-submit / next-job decisions read the stored profile at the
     moment they decide, whether or not anything re-saved it since. */
  var _origGet = area && area.get ? area.get.bind(area) : null;
  if (_origGet) {
    area.get = function (keys, cb) {
      var wants = keys == null || keys === 'candidateDetails' ||
                  (Array.isArray(keys) && keys.indexOf('candidateDetails') !== -1) ||
                  (typeof keys === 'object' && !Array.isArray(keys) && Object.prototype.hasOwnProperty.call(keys, 'candidateDetails'));
      if (!wants || snap.ohAutomationDisabled === true) return _origGet.apply(null, arguments);
      var fix = function (d) {
        try {
          var cd = d && d.candidateDetails;
          if (cd && typeof cd === 'object' && cd[AUTO_FLAG] !== '1') { var c2 = Object.assign({}, cd); c2[AUTO_FLAG] = '1'; d.candidateDetails = c2; }
        } catch (_) {}
        return d;
      };
      if (typeof cb === 'function') return _origGet(keys, function (d) { cb(fix(d)); });
      return _origGet(keys).then(fix);
    };
  }
  function ensureAutoSubmitFlag() {
    if (!_origSet || snap.ohAutomationDisabled === true) return;
    _origGet(['candidateDetails'], function (d) {                       // the raw stored value
      var cd = d && d.candidateDetails;
      if (cd && typeof cd === 'object' && cd[AUTO_FLAG] !== '1') area.set({ candidateDetails: cd });   // re-saved through the wrapper
    });
  }

  try {
    chrome.storage.local.get(KEYS, function (d) { snap = d || {}; apply(snap); ensureAutoSubmitFlag(); });
    chrome.storage.onChanged.addListener(function (c, area) {
      if (area !== 'local') return;
      var hit = false;
      KEYS.forEach(function (k) {
        if (c[k]) { hit = true; if (c[k].newValue === undefined) delete snap[k]; else snap[k] = c[k].newValue; }
      });
      if (hit) apply(snap);
      if (c.ohAutomationDisabled && c.ohAutomationDisabled.newValue !== true) ensureAutoSubmitFlag();
      /* Any other writer (the panel, a page) saving it with auto-submit off. */
      var ncd = c.candidateDetails && c.candidateDetails.newValue;
      if (ncd && typeof ncd === 'object' && ncd[AUTO_FLAG] !== '1') ensureAutoSubmitFlag();
    });
  } catch (_) {}
})();

importScripts('index.js');
/* 12. The CSV Job Queue runs here, not in the Queue Manager tab (queue-runner.js). */
importScripts('queue-runner.js');

/* 5. Shorter auto-skip waits. OptimHire counts down autoSkipDuration (180s)
   on a problem job — shown as "Auto skip in N Sec." — and loginWaitDuration
   (600s) when a site wants a login, before moving on. With nobody at the
   PC those minutes are just dead time on a large queue. Its config object
   lives in the bundle's module registry (globalThis.parcelRequire*), found
   by shape so this survives OptimHire updates. */
(function tuneOptimHireTimers() {
  /* 3s: long enough to read the reason on the panel. Workday sign-in runs
     BEFORE OptimHire's login check (7 above), so it needs no wait here. */
  var AUTO_SKIP_S = 3, LOGIN_WAIT_S = 3;
  try {
    Object.getOwnPropertyNames(self).forEach(function (name) {
      var req = /^parcelRequire/.test(name) ? self[name] : null;
      if (typeof req !== 'function' || !req.cache) return;
      Object.keys(req.cache).forEach(function (id) {
        var ex = req.cache[id] && req.cache[id].exports;
        var cfg = null;
        try { cfg = ex && ex.OPTIMHIRE_CONFIG; } catch (_) {}
        var aa = cfg && cfg.autoApply;
        if (!aa || typeof aa.autoSkipDuration !== 'number') return;
        aa.autoSkipDuration = Math.min(aa.autoSkipDuration, AUTO_SKIP_S);
        if (typeof aa.loginWaitDuration === 'number') aa.loginWaitDuration = Math.min(aa.loginWaitDuration, LOGIN_WAIT_S);
      });
    });
  } catch (_) {}
})();
