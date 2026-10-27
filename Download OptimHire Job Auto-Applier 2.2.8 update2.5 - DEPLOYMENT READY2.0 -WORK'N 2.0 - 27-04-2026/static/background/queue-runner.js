/**
 * queue-runner.js — runs the CSV Job Queue from the service worker (loaded by
 * oh-bg.js). It used to live in the Queue Manager tab, so closing that tab
 * dropped a run to one job at a time; now the page is only a view and the run
 * carries on whether it is open or not (as in the Jobright build).
 *
 * The worker opens each pending job in its own background tab (up to the
 * "Parallel tabs" setting, ATS jobs first and Reed last), the job tab's
 * content script fills / submits / records the result and asks to advance
 * (ohJobQueueAdvanceReq), and this closes that tab and opens the next.
 * Everything it needs is in storage — the open tabs too (ohQueueTabs) — so a
 * worker that Chrome stopped and restarted picks up where it was; a
 * one-minute alarm re-checks the run (lost tabs, empty slots, the end).
 *
 * Messages: OH_QUEUE_START { concurrency }, OH_QUEUE_STOP,
 * OH_QUEUE_REQUEST_FOCUS (a job that redirected to Paylocity).
 */
/* global chrome */
(function () {
  'use strict';
  var ST = chrome.storage.local;
  var K = {
    queue: 'ohJobQueue', active: 'ohJobQueueActive', current: 'ohJobQueueCurrentId', startTs: 'ohJobQueueStartTs',
    conc: 'ohJobQueueConcurrency', adv: 'ohJobQueueAdvanceReq', tabs: 'ohQueueTabs', prefer: 'ohPreferAts', owner: 'ohJobQueueOwnerTab',
  };
  var MAX_OPEN_ATTEMPTS = 3;
  /* Backstop, checked every minute: a job still "running" this long after its tab opened has its
     tab closed, is marked failed and the next job opens. The job page's own limits (3 min, 8 on
     Workday) normally end it first, but only while its script runs on a page that still matches
     the CSV link: after a redirect (Citi → Workday, a board → the company site), a login wall, an
     error page or a hung tab, nothing ended the job and the queue stood still. */
  var JOB_HARD_CAP_MS = 6 * 60 * 1000;
  var WD_JOB_HARD_CAP_MS = 14 * 60 * 1000;
  var WD_URL_RE = /myworkday(jobs|site)?\.com|workdayjobs\.com|\.workday\.com/i;
  var MAX_CONCURRENCY = 8;
  var TERMINAL = { applied: 1, failed: 1, skipped: 1 };
  var ALARM = 'ohQueueBeat';

  function get(keys) { return new Promise(function (r) { ST.get(keys, function (d) { r(d || {}); }); }); }
  function set(o) { return new Promise(function (r) { ST.set(o, function () { r(); }); }); }
  function tabGet(id) {
    return new Promise(function (r) {
      try { chrome.tabs.get(id, function (t) { r(chrome.runtime.lastError ? null : t); }); } catch (_) { r(null); }
    });
  }
  function log(msg) { try { console.info('[OH-Queue] ' + msg); } catch (_) {} }

  /* One operation at a time: start, stop, advance, refill and the alarm never interleave. */
  var chain = Promise.resolve();
  function serial(fn) {
    var p = chain.then(fn, fn);
    chain = p.catch(function (e) { log('error: ' + ((e && e.message) || e)); });
    return p;
  }

  /* ── order: quickest company ATS first, then account ATS, career sites, job boards, Reed last ──
     self.ohJobRank (oh-bg.js): Greenhouse 0, Lever 1 … Workday 20 … career sites 30, boards 40+, Reed 99. */
  function tier(url) { return typeof self.ohJobRank === 'function' ? self.ohJobRank(url) : 30; }
  function pickNext(q, ok, preferAts) {
    if (!preferAts) { for (var i = 0; i < q.length; i++) if (ok(q[i])) return q[i]; return null; }
    var best = null, bestTier = 1e9;
    for (var j = 0; j < q.length; j++) {
      if (!ok(q[j])) continue;
      var t = tier(q[j].url);
      if (t < bestTier) { best = q[j]; bestTier = t; if (t === 0) break; }      // queue order within a rank
    }
    return best;
  }
  /* A Workday link straight into "Autofill with Resume" or "Use My Last Application" opens
     "Apply Manually" instead — every field is filled from your details. */
  function safeUrl(u) {
    try {
      var x = new URL(String(u || '').trim());
      if (!/^https?:$/.test(x.protocol)) return '';
      if (/myworkday(jobs|site)?\.com$|workdayjobs\.com$/i.test(x.hostname))
        x.pathname = x.pathname.replace(/\/apply\/(autofillWithResume|useMyLastApplication)\b/i, '/apply/applyManually');
      return x.href;
    } catch (_) { return ''; }
  }
  function normUrl(u) { try { return new URL(u).href; } catch (_) { return String(u || ''); } }

  /* Write job changes into whatever is stored NOW. A result the job's own tab
     already wrote (applied / failed / skipped) is never undone. */
  async function writeJobs(changes) {
    if (!Object.keys(changes).length) return;
    var d = await get([K.queue]);
    var q = Array.isArray(d[K.queue]) ? d[K.queue] : [];
    q.forEach(function (j) {
      var p = changes[j.id];
      if (!p) return;
      if (TERMINAL[j.status] && p.status && !TERMINAL[p.status]) return;
      Object.assign(j, p);
    });
    await set({ [K.queue]: q });
  }

  async function liveTabs(map) {
    var out = {};
    for (var id in map) {
      if (!Object.prototype.hasOwnProperty.call(map, id)) continue;
      var tid = map[id];
      if (tid === -1 || await tabGet(tid)) out[id] = tid;
    }
    return out;
  }

  /* ── Paylocity tabs to the front (it pauses while hidden), one at a time ── */
  var PAYLOCITY_RE = /(^|\.)paylocity\.com$/i;
  var focus = { tab: null, back: null, log: {} };
  async function focusTab(tabId, reason) {
    var now = Date.now(), rec = focus.log[tabId] || { last: 0, n: 0 };
    if (now - rec.last < 15000 || rec.n >= 4) return;
    if (focus.tab != null && focus.tab !== tabId && await tabGet(focus.tab)) return;
    var t = await tabGet(tabId);
    if (!t) return;
    rec.last = now; rec.n++; focus.log[tabId] = rec;
    if (!t.active && !focus.back) {
      var cur = await new Promise(function (r) { chrome.tabs.query({ active: true, windowId: t.windowId }, function (ts) { r((ts && ts[0]) || null); }); });
      if (cur && cur.id !== tabId) focus.back = { tabId: cur.id };
    }
    focus.tab = tabId;
    chrome.tabs.update(tabId, { active: true }, function () { void chrome.runtime.lastError; });
    log('brought a job tab to the front (' + reason + ')');
  }
  async function releaseFocus(tabId) {
    if (focus.tab !== tabId) return;
    var t = await tabGet(tabId);
    var back = t && t.active ? focus.back : null;
    focus.tab = null; focus.back = null;
    if (back && await tabGet(back.tabId)) chrome.tabs.update(back.tabId, { active: true }, function () { void chrome.runtime.lastError; });
  }

  /* ── the run ── */
  async function fillSlots() {
    var d = await get([K.queue, K.active, K.conc, K.tabs, K.prefer]);
    if (!d[K.active]) return;
    var q = Array.isArray(d[K.queue]) ? d[K.queue] : [];
    var conc = Math.min(MAX_CONCURRENCY, Math.max(1, parseInt(d[K.conc], 10) || 1));
    var map = await liveTabs(d[K.tabs] || {});
    var changes = {}, now = Date.now();
    for (var si = 0; si < q.length; si++) {
      var sj = q[si];
      if (sj.status !== 'running' || !(sj.id in map) || !sj.lastActionTs) continue;
      var cap = WD_URL_RE.test(String(sj.url || '')) ? WD_JOB_HARD_CAP_MS : JOB_HARD_CAP_MS;
      if (now - sj.lastActionTs < cap) continue;
      var stuckTab = map[sj.id];
      var mins = Math.round((now - sj.lastActionTs) / 60000);
      log('timed out after ' + mins + ' min, moving on: ' + (sj.title || sj.url));
      changes[sj.id] = { status: 'failed', lastError: 'timed out after ' + mins + ' min with no result from the job page', lastActionTs: now };
      sj.status = 'failed';
      delete map[sj.id];
      if (stuckTab != null && stuckTab !== -1) {
        await releaseFocus(stuckTab);
        chrome.tabs.remove(stuckTab, function () { void chrome.runtime.lastError; });
      }
    }
    if (Object.keys(changes).length) await set({ [K.tabs]: map });
    q.forEach(function (j) {
      /* "running" with no tab: its tab was lost (closed, crashed) — back in line. */
      if (j.status === 'running' && !(j.id in map)) { changes[j.id] = { status: 'pending' }; j.status = 'pending'; }
      if (j.status === 'pending' && (j.attempts || 0) >= MAX_OPEN_ATTEMPTS) {
        changes[j.id] = { status: 'failed', lastError: 'gave up after ' + MAX_OPEN_ATTEMPTS + ' open attempts', lastActionTs: now };
        j.status = 'failed';
      }
    });
    await writeJobs(changes);
    for (var guard = 0; guard < conc; guard++) {
      if (Object.keys(map).length >= conc) break;
      var open = {};
      Object.keys(map).forEach(function (id) { var t = q.find(function (x) { return x.id === id; }); if (t && t.url) open[normUrl(t.url)] = 1; });
      var cand = pickNext(q, function (j) {
        return j.status === 'pending' && !(j.id in map) && (j.attempts || 0) < MAX_OPEN_ATTEMPTS && !(j.url && open[normUrl(j.url)]);
      }, d[K.prefer] !== false);
      if (!cand) break;
      var url = safeUrl(cand.url);
      if (!url) { cand.status = 'failed'; await writeJobs({ [cand.id]: { status: 'failed', lastError: 'missing URL', lastActionTs: Date.now() } }); continue; }
      cand.status = 'running';
      cand.attempts = (cand.attempts || 0) + 1;
      map[cand.id] = -1;                                   // reserved before the tab exists
      await writeJobs({ [cand.id]: { status: 'running', attempts: cand.attempts, lastActionTs: Date.now() } });
      await set({ [K.tabs]: map });
      var tab = await new Promise(function (r) {
        try { chrome.tabs.create({ url: url, active: false }, function (t) { r(chrome.runtime.lastError ? null : t); }); } catch (_) { r(null); }
      });
      if (tab && tab.id != null) {
        map[cand.id] = tab.id;
        log('opened ' + (cand.title || url));
        try { if (PAYLOCITY_RE.test(new URL(url).hostname)) await focusTab(tab.id, 'paylocity'); } catch (_) {}
      } else {
        delete map[cand.id];
        cand.status = 'failed';
        await writeJobs({ [cand.id]: { status: 'failed', lastError: 'could not open tab', lastActionTs: Date.now() } });
      }
      await set({ [K.tabs]: map });
    }
    var after = await get([K.queue]);
    var left = (Array.isArray(after[K.queue]) ? after[K.queue] : []).some(function (j) { return j.status === 'pending' || j.status === 'running'; });
    if (!left && !Object.keys(map).length) await finish();
  }

  async function finish() {
    await set({ [K.active]: false, [K.current]: null, [K.adv]: null, [K.tabs]: {} });
    try { chrome.alarms.clear(ALARM); } catch (_) {}
    log('queue complete');
    try {
      var icons = (chrome.runtime.getManifest().icons) || {};
      chrome.notifications.create('ohQueueDone', { type: 'basic', iconUrl: chrome.runtime.getURL(icons['128'] || icons['48'] || ''),
        title: 'Job Queue finished', message: 'Every job in your CSV queue has been tried.' }, function () { void chrome.runtime.lastError; });
    } catch (_) {}
  }

  async function onAdvance(req) {
    if (!req || !req.ts) return;
    var d = await get([K.tabs, K.adv]);
    var map = d[K.tabs] || {};
    var tabId = map[req.jobId];
    delete map[req.jobId];
    /* Clearing the request tells the job tab's fallback that it was handled. */
    await set({ [K.tabs]: map, [K.adv]: (d[K.adv] && d[K.adv].ts === req.ts) ? null : d[K.adv] });
    if (tabId != null && tabId !== -1) {
      await releaseFocus(tabId);
      chrome.tabs.remove(tabId, function () { void chrome.runtime.lastError; });
    }
    await fillSlots();
  }

  async function start(concurrency) {
    var d = await get([K.queue]);
    var q = Array.isArray(d[K.queue]) ? d[K.queue] : [];
    var changes = {};
    q.forEach(function (j) { if (j.status === 'running') changes[j.id] = { status: 'pending' }; });
    await writeJobs(changes);
    var o = { [K.active]: true, [K.current]: null, [K.adv]: null, [K.startTs]: Date.now(), [K.tabs]: {},
              /* OptimHire's own auto-apply stands down while the CSV queue runs. */
              ohAutoApplyEngaged: false };
    if (concurrency) o[K.conc] = Math.min(MAX_CONCURRENCY, Math.max(1, parseInt(concurrency, 10) || 1));
    await set(o);
    try { chrome.alarms.create(ALARM, { periodInMinutes: 1 }); } catch (_) {}
    log('queue started');
    await fillSlots();
  }

  async function stop() {
    var d = await get([K.tabs, K.queue]);
    var map = d[K.tabs] || {};
    for (var id in map) {
      if (map[id] !== -1) chrome.tabs.remove(map[id], function () { void chrome.runtime.lastError; });
    }
    var changes = {};
    (Array.isArray(d[K.queue]) ? d[K.queue] : []).forEach(function (j) { if (j.status === 'running') changes[j.id] = { status: 'pending' }; });
    await set({ [K.active]: false, [K.current]: null, [K.adv]: null, [K.tabs]: {} });
    await writeJobs(changes);
    try { chrome.alarms.clear(ALARM); } catch (_) {}
    focus.tab = null; focus.back = null;
    log('queue stopped');
  }

  /* ── wiring (top level, so a stopped worker is woken by these) ── */
  chrome.runtime.onMessage.addListener(function (msg, sender, reply) {
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'OH_QUEUE_START') { serial(function () { return start(msg.concurrency); }).then(function () { reply({ ok: true }); }); return true; }
    if (msg.type === 'OH_QUEUE_STOP') { serial(stop).then(function () { reply({ ok: true }); }); return true; }
    if (msg.type === 'OH_QUEUE_REQUEST_FOCUS') {
      var tabId = sender && sender.tab && sender.tab.id;
      if (tabId == null) return;
      get([K.tabs]).then(function (d) {
        var map = d[K.tabs] || {};
        if (Object.keys(map).some(function (k) { return map[k] === tabId; })) focusTab(tabId, msg.reason || 'requested');
      });
    }
  });

  chrome.storage.onChanged.addListener(function (c, area) {
    if (area !== 'local') return;
    if (c[K.adv] && c[K.adv].newValue) { var req = c[K.adv].newValue; serial(function () { return onAdvance(req); }); }
    /* Stopped from elsewhere (the side panel's Automation switch…): close the tabs. */
    if (c[K.active] && c[K.active].oldValue && !c[K.active].newValue) {
      serial(function () {
        return get([K.tabs]).then(function (d) { if (Object.keys(d[K.tabs] || {}).length) return stop(); });
      });
    }
  });

  chrome.tabs.onRemoved.addListener(function (tabId) {
    serial(async function () {
      var d = await get([K.tabs, K.active, K.queue]);
      var map = d[K.tabs] || {};
      var jobId = Object.keys(map).find(function (k) { return map[k] === tabId; });
      if (jobId == null) return;
      delete map[jobId];
      await set({ [K.tabs]: map });
      if (focus.tab === tabId) { focus.tab = null; focus.back = null; }
      if (!d[K.active]) return;
      /* Closed by hand before it finished: back in line. */
      await writeJobs({ [jobId]: { status: 'pending' } });
      await fillSlots();
    });
  });

  try {
    chrome.alarms.onAlarm.addListener(function (a) { if (a && a.name === ALARM) serial(fillSlots); });
  } catch (_) {}

  /* A worker (re)starting in the middle of a run: check it straight away. */
  get([K.active]).then(function (d) {
    if (d[K.active]) {
      try { chrome.alarms.create(ALARM, { periodInMinutes: 1 }); } catch (_) {}
      serial(fillSlots);
    }
  });
})();
