/**
 * oh-audit.js — one-click audit: record everything, export everything.
 *
 * Loaded by the side panel (the Job Queue card's "Audit" row and "Export
 * audit file" link) and the Debug Log viewer (tabs/debug.html).
 *
 *   OH_AUDIT.record(hours)   switch recording on for every tab, the side
 *                            panel and the service worker (debug-logger.js,
 *                            oh-bg.js 16) — 8 h unless said otherwise
 *   OH_AUDIT.stop()          switch it off
 *   OH_AUDIT.status(cb)      { on, until, since, entries, bgEntries }
 *   OH_AUDIT.exportFile(cb)  download ONE JSON with everything below
 *
 * The file holds: a summary (errors, warnings, busiest categories, the last
 * errors, queue / run / Workday totals), which of your details forms get
 * (phone, e-mail, city — and where each comes from), every setting, the
 * OptimHire run and each job it handed out with its outcome, the CSV queue,
 * the Workday engine's runs and sign-in sites, the open tabs, the service
 * worker's log, every recorded log entry, and the rest of storage.
 * Secrets never leave: login tokens, passwords, cookies and the like are
 * replaced by "[redacted]" wherever they appear.
 */
(function () {
  'use strict';
  if (window.OH_AUDIT) return;
  var ST = chrome.storage.local;
  var SECRET_KEY_RE = /token|password|passwd|secret|auth|cookie|session|credential|api.?key|passcode/i;
  var JWT_RE = /^eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}$/;

  function redact(v, depth) {
    depth = depth || 0;
    if (depth > 12) return '[deep]';
    if (Array.isArray(v)) return v.map(function (x) { return redact(x, depth + 1); });
    if (v && typeof v === 'object') {
      var o = {};
      Object.keys(v).forEach(function (k) {
        var x = v[k];
        o[k] = SECRET_KEY_RE.test(k) && x !== null && x !== '' && typeof x !== 'boolean' && typeof x !== 'number'
          ? '[redacted]' : redact(x, depth + 1);
      });
      return o;
    }
    if (typeof v === 'string' && JWT_RE.test(v.trim())) return '[redacted token]';
    return v;
  }
  function parse(v) { if (typeof v === 'string') { try { return JSON.parse(v); } catch (_) { return null; } } return v; }
  function countBy(list, fn) {
    var out = {};
    list.forEach(function (x) { var k = fn(x) || '—'; out[k] = (out[k] || 0) + 1; });
    return out;
  }
  function top(obj, n) {
    return Object.keys(obj).sort(function (a, b) { return obj[b] - obj[a]; }).slice(0, n)
      .map(function (k) { return { name: k, count: obj[k] }; });
  }
  function iso(ts) { return ts ? new Date(ts).toISOString() : null; }

  /* Which details application forms get, and where each comes from (same order as the fillers). */
  function yourDetails(all) {
    var seekers = [];
    ['manualApplicationDetail', 'complexFormData', 'autoApplyState'].forEach(function (k) {
      var v = parse(all[k]); var ad = v && (v.applicationDetails || v);
      if (ad && ad.seeker) seekers.push({ from: 'the OptimHire job now (' + k + ')', s: ad.seeker });
    });
    if (all.ohWdSeeker) seekers.push({ from: 'your details kept from OptimHire jobs (ohWdSeeker)', s: all.ohWdSeeker });
    var cd = parse(all.candidateDetails);
    if (cd) seekers.push({ from: 'your OptimHire profile (candidateDetails)', s: cd });
    var cv = all.ohCvProfile && all.ohCvProfile.profile;
    function first(fields) {
      for (var i = 0; i < seekers.length; i++) {
        for (var j = 0; j < fields.length; j++) {
          var v = seekers[i].s[fields[j]];
          if (v != null && String(v).trim()) return { value: String(v), from: seekers[i].from };
        }
      }
      return null;
    }
    var phone = all.ohMyPhone ? { value: all.ohMyPhone, from: 'typed on the side panel (Applications Account → Phone)' } : null;
    if (!phone) {
      for (var i = 0; i < seekers.length && !phone; i++) {
        var s = seekers[i].s, num = String(s.mobile_num || '').replace(/\D/g, '');
        if (num) phone = { value: (s.mobile_code ? '+' + String(s.mobile_code).replace(/\D/g, '') + ' ' : '') + num, from: seekers[i].from };
        else if (s.phone) phone = { value: String(s.phone), from: seekers[i].from };
      }
    }
    if (!phone && cv && cv.contact && cv.contact.phone) phone = { value: cv.contact.phone, from: 'your CV header' };
    var email = first(['email', 'email_address']) || (cv && cv.contact && cv.contact.email ? { value: cv.contact.email, from: 'your CV header' } : null) ||
                (all.appAccountEmail ? { value: all.appAccountEmail, from: 'Applications Account' } : null);
    return {
      phone: phone || 'NOT FOUND — forms that require a phone (Greenhouse…) will stay incomplete',
      email: email || 'NOT FOUND',
      firstName: first(['first_name', 'firstName']) || 'NOT FOUND',
      lastName: first(['last_name', 'lastName']) || 'NOT FOUND',
      city: first(['city']) || 'NOT FOUND',
      country: first(['country']) || 'NOT FOUND',
      location: first(['location']),
      linkedin: first(['linkedin_profile_url', 'linkedin']) || (cv && cv.contact && cv.contact.linkedin ? { value: cv.contact.linkedin, from: 'your CV header' } : null),
      resume: first(['resume', 'resume_url']),
      cvRead: cv ? { roles: (cv.work || []).length, education: (cv.education || []).length, skills: (cv.skills || []).length, readAt: iso(all.ohCvProfile.at) } : 'not read yet',
    };
  }

  function build(cb) {
    ST.get(null, function (all) {
      all = all || {};
      chrome.tabs.query({}, function (tabs) {
        void chrome.runtime.lastError;
        var m = chrome.runtime.getManifest ? chrome.runtime.getManifest() : {};
        var log = Array.isArray(all.ohDebugLog) ? all.ohDebugLog : [];
        var bg = Array.isArray(all.ohBgLog) ? all.ohBgLog : [];
        var both = log.concat(bg.map(function (e) { return { ts: e.ts, src: 'service-worker', cat: 'background', lvl: e.lvl, msg: e.msg }; }));
        var errors = both.filter(function (e) { return e.lvl === 'error'; });
        var warns = both.filter(function (e) { return e.lvl === 'warn'; });
        var queue = Array.isArray(all.ohJobQueue) ? all.ohJobQueue : [];
        var harvested = Object.keys(all.ohHarvestedJobs || {}).map(function (k) { return all.ohHarvestedJobs[k]; })
          .sort(function (a, b) { return ((a && a.firstSeen) || 0) - ((b && b.firstSeen) || 0); });
        var wdRuns = Array.isArray(all.ohWdEngineLog) ? all.ohWdEngineLog : [];
        var on = all.ohDebugEnabled === true && Date.now() < (+all.ohDebugUntil || 0);
        var skip = { ohDebugLog: 1, ohBgLog: 1 };
        var storage = {};
        Object.keys(all).forEach(function (k) { if (!skip[k]) storage[k] = all[k]; });
        var audit = {
          about: {
            file: 'OptimHire Job Auto-Applier — full audit',
            exportedAt: new Date().toISOString(),
            extension: { name: m.name, version: m.version },
            browser: { userAgent: navigator.userAgent, language: navigator.language },
            recording: { on: on, since: iso(+all.ohAuditSince || 0), until: iso(+all.ohDebugUntil || 0),
                         note: on ? 'Recording: every tab, the side panel and the service worker' : 'Recording is OFF — press Audit on the side panel to record what happens next' },
            secrets: 'Login tokens, passwords and cookies are replaced by [redacted]',
          },
          summary: {
            logEntries: log.length, backgroundEntries: bg.length,
            errors: errors.length, warnings: warns.length,
            busiestCategories: top(countBy(both, function (e) { return e.cat; }), 15),
            busiestSites: top(countBy(log, function (e) { try { return new URL(e.url).hostname; } catch (_) { return ''; } }), 15),
            lastErrors: errors.slice(-40).map(function (e) { return { at: iso(e.ts), where: e.src + (e.url ? ' ' + e.url : ''), cat: e.cat, msg: e.msg }; }),
            csvQueue: { jobs: queue.length, byStatus: countBy(queue, function (j) { return j && j.status; }), running: all.ohJobQueueActive === true },
            optimhireQueue: { jobsHandedOut: harvested.length, byOutcome: countBy(harvested, function (j) { return j && (j.outcome || 'pending'); }),
                              run: (all.ohRunStats && all.ohRunStats.summary) || null, order: all.ohQueueTier || null },
            workdayRuns: { recorded: wdRuns.length, byOutcome: countBy(wdRuns, function (r) { return r && r.outcome; }) },
          },
          yourDetails: yourDetails(all),
          settings: redact({
            automationOn: all.ohAutomationDisabled !== true,
            autoFillOnAtsPages: all.ohAutoTrigger !== false,
            quickestAtsFirst: all.ohPreferAts !== false,
            tailorCvToEachJob: all.ohTailorCv === true,
            workdayEngineOn: all.ohWdEngineOff !== true,
            readVerificationEmails: all.ohGmailCodes === true,
            knockoutAnswers: all.ohKnockout || null,
            applicationsAccountEmail: all.appAccountEmail || null,
          }),
          optimhireRun: redact({
            running: !!(all.isAutoProcessStartJob || all.isManuallyStartJob || (all.autoApplyState && all.autoApplyState.isActive)),
            autoApplyState: all.autoApplyState || null,
            runStats: all.ohRunStats || null,
            jobs: harvested,
          }),
          csvQueue: { active: all.ohJobQueueActive === true, parallelTabs: all.ohJobQueueConcurrency || 1, tabs: all.ohQueueTabs || {}, jobs: queue },
          workday: redact({ engineRuns: wdRuns, signIn: all.ohWorkdayLogin || null }),
          openTabs: (tabs || []).map(function (t) { return { id: t.id, active: t.active, status: t.status, title: t.title, url: t.url }; }),
          backgroundLog: redact(bg),
          log: redact(log),
          storage: redact(storage),
        };
        cb(audit);
      });
    });
  }

  function stamp() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  window.OH_AUDIT = {
    record: function (hours, cb) {
      var now = Date.now();
      ST.set({ ohDebugEnabled: true, ohDebugPaused: false, ohDebugUntil: now + (hours || 8) * 3600e3, ohAuditSince: now }, function () { if (cb) cb(); });
    },
    stop: function (cb) { ST.set({ ohDebugEnabled: false }, function () { if (cb) cb(); }); },
    status: function (cb) {
      ST.get(['ohDebugEnabled', 'ohDebugUntil', 'ohAuditSince', 'ohDebugLog', 'ohBgLog'], function (d) {
        d = d || {};
        cb({ on: d.ohDebugEnabled === true && Date.now() < (+d.ohDebugUntil || 0), until: +d.ohDebugUntil || 0, since: +d.ohAuditSince || 0,
             entries: (d.ohDebugLog || []).length, bgEntries: (d.ohBgLog || []).length });
      });
    },
    build: build,
    exportFile: function (cb) {
      build(function (audit) {
        var text = JSON.stringify(audit, null, 2);
        var blob = new Blob([text], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'optimhire-audit-' + stamp() + '.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
        if (cb) cb(audit, a.download);
      });
    },
  };
})();
