/**
 * sidepanel-patch.js — CSP-safe JS for sidepanel.html
 * Auto-Apply Mode status panel: live status log, field tracking,
 * progress bar, Skip/Stop controls.
 *
 * Also: targeted CSS/DOM hide of the Upgrade banner, the credit
 * counter, and the "Earn While You Search for a Job" referral card,
 * scoped narrowly so the rest of the React app keeps rendering.
 */
(function () {
  'use strict';

  /* ════════════════════════════════════════════════════════════
     ZERO LIMITATION — DOM hide + safe storage WRITE-wrap
     ════════════════════════════════════════════════════════════
     We never wrap chrome.storage.local.get in the sidepanel (last
     time that broke the React app), but we DO wrap .set so any
     candidateDetails / planDetails that flows through it gets
     normalised to "premium / unlimited credits" before it lands
     in storage. We also do ONE forced rewrite of candidateDetails
     on startup so the React state re-reads as premium. */

  var SP_CREDIT_FIELDS = [
    'free_left_credits','leftCredits','remainingCredits','credits',
    'autofillCredits','plan_credits','totalCredits','daily_credits',
    'remaining_credits','autoFillCredits','autofill_credits',
    'free_credits','credit_balance','creditsLeft','creditLeft',
    'availableCredits','available_credits'
  ];
  var SP_PLAN_STR_PATCHES = {
    copilot_status: 'PREMIUM',
    plan: 'premium',
    planName: 'Premium',
    plan_name: 'premium',
    subscriptionPlan: 'premium',
    subscription_plan: 'premium',
    tier: 'premium',
    accountType: 'PREMIUM',
    account_type: 'PREMIUM'
  };
  var SP_BOOL_FLIP = [
    'isCreditLeft','is_credit_left','isPremium','is_premium',
    'is_pro','isPro','isPaid','is_paid','isSubscribed','is_subscribed',
    'isUnlimited','is_unlimited','is_copilot_active',
    'is_first_attempt_completed','isUpgraded'
  ];
  var SP_COUNTER_ZERO = [
    'appliedCount','applied_count','dailyApplied','daily_applied',
    'appliedToday','today_applied','isManualAppliedCount'
  ];

  function spDeepPatch(obj, seen) {
    if (!obj || typeof obj !== 'object') return obj;
    seen = seen || new WeakSet();
    if (seen.has(obj)) return obj;
    seen.add(obj);
    SP_CREDIT_FIELDS.forEach(function (f) { if (f in obj) obj[f] = 9999; });
    SP_BOOL_FLIP.forEach(function (f) {
      if (!(f in obj)) return;
      var cur = obj[f];
      if (cur === '0' || cur === 0 || cur === false) {
        obj[f] = (typeof cur === 'string') ? '1' : true;
      }
    });
    Object.keys(SP_PLAN_STR_PATCHES).forEach(function (f) {
      if (f in obj && typeof obj[f] === 'string') {
        obj[f] = SP_PLAN_STR_PATCHES[f];
      }
    });
    SP_COUNTER_ZERO.forEach(function (f) {
      if (f in obj && typeof obj[f] === 'number' && obj[f] > 0) obj[f] = 0;
    });
    Object.keys(obj).forEach(function (k) {
      if (obj[k] && typeof obj[k] === 'object') obj[k] = spDeepPatch(obj[k], seen);
    });
    return obj;
  }

  /* Wrap chrome.storage.local.set so any future writes carry
     premium / unlimited values. Defensive: bails to original on
     any unexpected return type. */
  function installSetWrap() {
    try {
      var _spOrigSet = chrome.storage.local.set.bind(chrome.storage.local);
      if (chrome.storage.local.set.__ohWrapped) return; // idempotent
      var wrapped = function (items, cb) {
        try {
          if (items && typeof items === 'object') {
            Object.keys(items).forEach(function (k) {
              var v = items[k];
              if (v && typeof v === 'object') {
                try { items[k] = spDeepPatch(JSON.parse(JSON.stringify(v))); } catch (_) {}
              } else if (typeof v === 'string' && /^[\[{]/.test(v.trim())) {
                try {
                  var parsed = JSON.parse(v);
                  if (parsed && typeof parsed === 'object') {
                    items[k] = JSON.stringify(spDeepPatch(parsed));
                  }
                } catch (_) {}
              } else if (typeof v === 'number' && SP_COUNTER_ZERO.indexOf(k) !== -1 && v > 0) {
                items[k] = 0;
              }
            });
          }
        } catch (_) {}
        if (typeof cb === 'function') {
          try { return _spOrigSet(items, cb); }
          catch (_) { try { cb(); } catch (__) {} return; }
        }
        try {
          var ret = _spOrigSet(items);
          /* Defensive: only attach .catch if ret looks like a Promise */
          if (ret && typeof ret.catch === 'function') {
            return ret.catch(function () {});
          }
          return ret;
        } catch (_) { return undefined; }
      };
      wrapped.__ohWrapped = true;
      chrome.storage.local.set = wrapped;
    } catch (_) {}
  }

  /* Periodic re-write so candidateDetails stays premium. Diff-checks
     to avoid pointless storage.onChanged firings. */
  function spForceRewrite() {
    try {
      var keys = ['candidateDetails','userDetails','planDetails',
                  'subscriptionDetails','cachedSeekerInfo','seekerDetails',
                  'appliedCount','isManualAppliedCount'];
      chrome.storage.local.get(keys, function (data) {
        var upd = {};
        keys.forEach(function (k) {
          if (data[k] == null) return;
          try {
            if (typeof data[k] === 'number' && SP_COUNTER_ZERO.indexOf(k) !== -1) {
              if (data[k] > 0) upd[k] = 0;
              return;
            }
            var wasStr = typeof data[k] === 'string';
            if (wasStr && !/^[\[{]/.test(data[k].trim())) return;
            var parsed = wasStr ? JSON.parse(data[k]) : data[k];
            if (!parsed || typeof parsed !== 'object') return;
            var patched = spDeepPatch(JSON.parse(JSON.stringify(parsed)));
            var serialized = wasStr ? JSON.stringify(patched) : patched;
            var sCmp = typeof serialized === 'string' ? serialized : JSON.stringify(serialized);
            var origCmp = wasStr ? data[k] : JSON.stringify(data[k]);
            if (sCmp === origCmp) return;
            upd[k] = serialized;
          } catch (_) {}
        });
        if (Object.keys(upd).length) {
          try { chrome.storage.local.set(upd); } catch (_) {}
        }
      });
    } catch (_) {}
  }

  /* DEFER both the storage write-wrap AND the first force-rewrite.
     The 2.6.1 bundle's React init reads storage synchronously near
     mount; wrapping/writing too early can race that init and leave
     the sidepanel blank. 1.5s gives React time to mount its tree
     before we start interfering. */
  setTimeout(function () {
    installSetWrap();
    spForceRewrite();
    setInterval(spForceRewrite, 30_000);
  }, 1500);

  /* ════════════════════════════════════════════════════════════
     ZERO LIMITATION — targeted DOM hide (no storage READ tampering)
     ZERO LIMITATION — targeted hide only (no storage READ tampering)
     The previous version intercepted chrome.storage.local.get
     and walked up unbounded DOM ancestors hiding any with
     bg-/border/rounded/card in their class — which killed the
     React root. This version is CSS-first + narrow DOM matches.
     ════════════════════════════════════════════════════════════ */

  /* Always-safe CSS rules: hide upgrade CTAs and known referral
     class names. Selectors stay specific (link href / explicit
     "referral|affiliate|upgrade-banner" tokens) so they cannot
     match the app root. */
  try {
    var style = document.createElement('style');
    style.id = 'oh-zero-limit-style';
    style.textContent = [
      /* Upgrade buttons that link to the membership / upgrade flow */
      'a[href*="openUpgradePlan"],',
      'a[href*="/d/membership"],',
      /* Explicit referral / affiliate / upgrade-banner components */
      '[class*="referral" i]:not(html):not(body):not(#__plasmo),',
      '[id*="referral" i]:not(html):not(body):not(#__plasmo),',
      '[data-testid*="referral" i],',
      '[class*="affiliate" i]:not(html):not(body):not(#__plasmo),',
      '[class*="earnCredit" i],',
      '[class*="inviteFriend" i],',
      '[class*="invite-friend" i],',
      '[class*="ReferralScreen" i],',
      '[class*="UpgradeBanner" i],',
      '[class*="upgrade-banner" i]',
      '{display:none!important}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  } catch (_) {}

  /* Hide-by-text patterns. Two passes per element:
       (a) ownText (direct text-node children) — most precise, for
           short labels and CTAs.
       (b) textContent (descendants included) — needed when the
           bundle wraps variable parts (20, $10, plan name) in
           child spans so ownText is missing them. Constrained to
           leaf-ish containers so we never hide the React root. */
  var HIDE_TEXT_PATTERNS = [
    'Get unlimited Credits',
    'AI cover letter & more',
    'Earn While You Search',
    'Help your friends avoid applying',
    'Auto-fill Credits for every signup',
    'referral who upgrades to premium',
    'referral who upgrades',
    'One Referral 3 Benefits',
    'Refer your friend to get',
    'commission on hire',
    /* 2.6.0 limit / upgrade banners in the sidepanel */
    'Upgrade to get Unlimited Credits',
    'Upgrade to get unlimited credits',
    'free Credits daily',
    'Auto-fill Credits left today',
    'matching jobs by manually filling',
    'Start Applying Manually',
    'You can still apply to',
    'Upgrade and save countless hours',
    /* Resume-fetch error message — smart-quote variant in bundle */
    "couldn’t fetch details for this resume",
    "couldn't fetch details for this resume",
    'fetch details for this resume right now'
  ];

  function ownText(el) {
    if (!el) return '';
    var s = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3) s += n.nodeValue;
    }
    return s;
  }

  function isSidepanelRoot(el) {
    if (!el) return false;
    if (el.id === '__plasmo') return true;
    if (el.tagName === 'BODY' || el.tagName === 'HTML') return true;
    if (el.id === 'oh-aap') return true;
    return false;
  }

  function safeHide(el) {
    if (!el || isSidepanelRoot(el)) return;
    if (el.dataset && el.dataset.ohHidden === '1') return;
    /* Never hide an element that contains the Auto-Apply panel */
    if (el.querySelector && el.querySelector('#oh-aap')) return;
    /* Never hide the React root container */
    if (el.querySelector && el.querySelector('#__plasmo')) return;
    el.style.setProperty('display', 'none', 'important');
    if (el.dataset) el.dataset.ohHidden = '1';
  }

  function pickAncestorToHide(el) {
    var node = el;
    /* Walk up at most 4 levels, stop at sidepanel root, and refuse
       to return ancestors whose text is enormous (likely whole page) */
    for (var i = 0; i < 4; i++) {
      if (!node || isSidepanelRoot(node)) return null;
      var len = (node.textContent || '').length;
      if (len > 350) {
        /* If we're already too big, hide the previous candidate */
        return null;
      }
      var parent = node.parentElement;
      if (!parent || isSidepanelRoot(parent)) return node;
      var parentLen = (parent.textContent || '').length;
      /* If the parent's text isn't much bigger than node's, climb */
      if (parentLen <= len + 80 && parentLen < 350) {
        node = parent;
        continue;
      }
      return node;
    }
    return node;
  }

  function hideMatching() {
    try {
      var nodes = document.querySelectorAll('h1,h2,h3,h4,p,li,span,div,a,button');
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (!el || (el.dataset && el.dataset.ohHidden === '1')) continue;
        var matched = false;
        /* Pass 1: ownText (direct text-node children) — fast, precise
           for plain labels. */
        var t = ownText(el).trim();
        if (t && t.length <= 200) {
          for (var j = 0; j < HIDE_TEXT_PATTERNS.length; j++) {
            if (t.indexOf(HIDE_TEXT_PATTERNS[j]) !== -1) {
              safeHide(pickAncestorToHide(el));
              matched = true;
              break;
            }
          }
        }
        if (matched) continue;
        /* Pass 2: textContent — catches "Get [20] Auto-fill Credits"
           where variable parts are wrapped in child spans. Bounded
           length + bounded children so we never match a huge container. */
        var tc = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!tc || tc.length > 300) continue;
        var childElems = el.children ? el.children.length : 0;
        if (childElems > 3 && el.tagName !== 'LI' && el.tagName !== 'P') continue;
        for (var p = 0; p < HIDE_TEXT_PATTERNS.length; p++) {
          if (tc.indexOf(HIDE_TEXT_PATTERNS[p]) !== -1) {
            safeHide(pickAncestorToHide(el));
            break;
          }
        }
      }

      /* Replace credit counter text "N Auto-fill Credits" with "∞" */
      var creditNodes = document.querySelectorAll('span,div,p');
      for (var k = 0; k < creditNodes.length; k++) {
        var c = creditNodes[k];
        if (!c || (c.dataset && c.dataset.ohCredit === '1')) continue;
        var ct = ownText(c).trim();
        if (/^\d+\s+Auto-fill\s+Credits?(\s+left.*)?$/i.test(ct) ||
            /^\d+\s+Credits?\s+available$/i.test(ct) ||
            /^\d+\s+Credits?\s+left$/i.test(ct)) {
          /* Replace just the leading number in the direct text nodes */
          for (var n = 0; n < c.childNodes.length; n++) {
            var tn = c.childNodes[n];
            if (tn.nodeType === 3 && /\d/.test(tn.nodeValue)) {
              tn.nodeValue = tn.nodeValue.replace(/\d+/, '∞');
            }
          }
          if (c.dataset) c.dataset.ohCredit = '1';
        }
      }
    } catch (_) {}
  }

  function startHideLoop() {
    hideMatching();
    setInterval(hideMatching, 1500);
    if (document.body) {
      try {
        new MutationObserver(hideMatching).observe(document.body, {
          childList: true, subtree: true
        });
      } catch (_) {}
    }
  }
  if (document.body) startHideLoop();
  else document.addEventListener('DOMContentLoaded', startHideLoop);

  /* ════════════════════════════════════════════════════════════
     AUTO-APPLY STATUS PANEL (original behaviour)
     ════════════════════════════════════════════════════════════ */

  var $  = function (id) { return document.getElementById(id); };

  /* ── DOM refs ── */
  var panel       = $('oh-aap');
  var pulse       = $('aapPulse');
  var title       = $('aapTitle');
  var counter     = $('aapCounter');
  var logEl       = $('aapLog');
  var progressSec = $('aapProgressSection');
  var progressLbl = $('aapProgressLabel');
  var progressPct = $('aapProgressPct');
  var progressFill= $('aapProgressFill');
  var fillStats   = $('aapFillStats');
  var responsesEl = $('aapResponses');
  var fieldsEl    = $('aapFields');
  var btnCsv      = $('aapBtnCsv');
  var btnSkip     = $('aapBtnSkip');
  var btnStop     = $('aapBtnStop');
  var header      = $('aapHeader');
  var arrow       = $('aapArrow');
  var toggle      = $('oh-auto-trigger-toggle');

  /* ── State ── */
  var _totalApplied = 0;
  var _totalJobs    = 0;
  var _isRunning    = false;
  var _fieldMap     = {}; // fieldName -> {name, status, required}

  /* ── Show/hide panel ──
     showPanel() only un-hides; it does NOT force-expand. Once the user
     collapses the panel (header click), it stays collapsed across status
     updates until the user explicitly expands it again. */
  var _userCollapsed = false;
  function showPanel() {
    if (panel) panel.classList.remove('hidden');
  }
  function hidePanel() {
    if (panel) panel.classList.add('hidden');
  }

  /* ── Log helpers ── */
  function addLog(text, cls) {
    if (!logEl) return;
    var entry = document.createElement('div');
    entry.className = 'aap-log-entry' + (cls ? ' ' + cls : '');
    var icon = document.createElement('span');
    icon.className = 'aap-log-icon';
    if (cls === 'success') icon.textContent = '\u2705';
    else if (cls === 'error') icon.textContent = '\u274C';
    else icon.textContent = '\u25CF';
    var span = document.createElement('span');
    span.textContent = text;
    entry.appendChild(icon);
    entry.appendChild(span);
    logEl.appendChild(entry);
    logEl.scrollTop = logEl.scrollHeight;
    // Keep last 50 entries
    while (logEl.children.length > 50) logEl.removeChild(logEl.firstChild);
  }

  function clearLog() {
    if (logEl) logEl.innerHTML = '';
  }

  /* ── Counter ── */
  function updateCounter(applied, total) {
    _totalApplied = applied;
    _totalJobs = total;
    if (counter) counter.textContent = applied + ' of ' + total + ' applied';
  }

  /* ── Progress bar ── */
  function updateProgress(filled, total, responses) {
    if (!progressSec) return;
    progressSec.style.display = '';
    var pct = total > 0 ? Math.round((filled / total) * 100) : 0;
    if (progressPct) progressPct.textContent = pct + '%';
    if (progressFill) progressFill.style.width = pct + '%';
    if (progressLbl) progressLbl.textContent = 'Filling application form...';
    if (fillStats) fillStats.textContent = filled + ' of ' + total + ' required fields filled';
    if (responsesEl && responses > 0) responsesEl.textContent = responses + ' responses from API';
  }

  /* ── Field list ── */
  function setFieldList(fields) {
    if (!fieldsEl) return;
    fieldsEl.innerHTML = '';
    _fieldMap = {};
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      _fieldMap[f.name] = f;
      appendFieldEl(f);
    }
  }

  function appendFieldEl(f) {
    var div = document.createElement('div');
    div.className = 'aap-field ' + (f.status || 'pending');
    div.setAttribute('data-field', f.name);
    var iconEl = document.createElement('span');
    iconEl.className = 'aap-field-icon';
    if (f.status === 'filled') iconEl.textContent = '\u2705';
    else if (f.status === 'failed') iconEl.textContent = '\u274C';
    else iconEl.textContent = '\u23F3';
    var nameEl = document.createElement('span');
    nameEl.className = 'aap-field-name';
    nameEl.textContent = f.name;
    nameEl.title = f.name;
    div.appendChild(iconEl);
    div.appendChild(nameEl);
    if (f.required) {
      var tag = document.createElement('span');
      tag.className = 'aap-field-tag required';
      tag.textContent = 'required';
      div.appendChild(tag);
    }
    fieldsEl.appendChild(div);
  }

  function updateField(name, status) {
    if (!fieldsEl) return;
    var el = fieldsEl.querySelector('[data-field="' + CSS.escape(name) + '"]');
    if (!el) return;
    el.className = 'aap-field ' + status;
    var icon = el.querySelector('.aap-field-icon');
    if (icon) {
      if (status === 'filled') icon.textContent = '\u2705';
      else if (status === 'failed') icon.textContent = '\u274C';
      else icon.textContent = '\u23F3';
    }
  }

  /* ── Set pulse state ── */
  function setPulse(state) {
    if (!pulse) return;
    pulse.className = 'aap-pulse';
    if (state === 'active') { /* default green pulse */ }
    else if (state === 'idle') pulse.classList.add('idle');
    else if (state === 'error') pulse.classList.add('error');
  }

  /* ── Collapse/expand ── */
  if (header) {
    header.addEventListener('click', function () {
      if (!panel) return;
      panel.classList.toggle('collapsed');
      _userCollapsed = panel.classList.contains('collapsed');
    });
  }

  /* ── Button actions ── */
  if (btnCsv) {
    btnCsv.addEventListener('click', function () {
      chrome.tabs.create({ url: chrome.runtime.getURL('tabs/csvImport.html') });
    });
  }
  if (btnSkip) {
    btnSkip.addEventListener('click', function () {
      chrome.runtime.sendMessage({ action: 'skipCurrent' }).catch(function () {});
      addLog('Skipping current job...', '');
    });
  }
  if (btnStop) {
    btnStop.addEventListener('click', function () {
      chrome.runtime.sendMessage({ action: 'stopQueue' }).catch(function () {});
      addLog('Stopping queue...', 'error');
      setPulse('idle');
      _isRunning = false;
    });
  }

  /* ── Auto-trigger toggle ── */
  if (toggle) {
    chrome.storage.local.get('ohAutoTrigger', function (data) {
      var enabled = data.ohAutoTrigger !== false;
      toggle.classList.toggle('active', enabled);
    });
    toggle.addEventListener('click', function () {
      var isActive = toggle.classList.toggle('active');
      chrome.storage.local.set({ ohAutoTrigger: isActive });
    });
  }

  /* ── Auto-skip timer cap + FORCE-SKIP fix ─────────────────────────────────
   * The background sends AUTO_APPLY_STATE_UPDATE with autoSkipSeconds: 180.
   * We cap the display AND fire a real skipCurrent after AUTO_SKIP_MAX+1s.
   *
   * IMPORTANT: Skip is SUPPRESSED for 30s if:
   *   - SUBMIT_ATTEMPTED was received (content script just clicked submit)
   *   - The current status is "submitting" (from SIDEBAR_STATUS event)
   * ─────────────────────────────────────────────────────────────────────── */
  const AUTO_SKIP_MAX = 15;
  let _forceSkipTimer  = null;
  let _forceSkipJobKey = '';
  let _submitAttemptedTs = 0; // timestamp of last SUBMIT_ATTEMPTED message
  const SUBMIT_SUPPRESS_MS = 30_000; // suppress skips for 30s after submit attempted

  function isSubmitSuppressed() {
    return Date.now() - _submitAttemptedTs < SUBMIT_SUPPRESS_MS;
  }

  function clearAllSkipTimers() {
    clearTimeout(_forceSkipTimer);
    _forceSkipTimer  = null;
    _forceSkipJobKey = '';
    clearTimeout(_watchdogTimer);
    _watchdogTimer   = null;
    _watchdogJobKey  = '';
  }

  function scheduleForceSkip(jobKey) {
    if (_forceSkipJobKey === jobKey) return;
    _forceSkipJobKey = jobKey;
    clearTimeout(_forceSkipTimer);
    _forceSkipTimer = setTimeout(function () {
      if (isSubmitSuppressed()) {
        // Submit was attempted — don't skip, let the page confirm
        _forceSkipJobKey = '';
        return;
      }
      chrome.runtime.sendMessage({ action: 'skipCurrent' }).catch(function () {});
      _forceSkipJobKey = '';
    }, (AUTO_SKIP_MAX + 1) * 1000);
  }

  /* Per-job countdown rescale. Background ticks autoSkipSeconds from
     ~180 down to 0 each second; flat-clamping every tick to
     AUTO_SKIP_MAX would show "15" frozen for ~165s before it
     actually started decrementing. Instead we track the moment we
     first saw a >MAX value for each job and serve a real local
     countdown from AUTO_SKIP_MAX → 0. */
  var _countdownStartByJob = Object.create(null); // jobKey → start ts (ms)

  function rescaleAutoSkip(msg) {
    var jobKey = String(msg.url || msg.jobUrl || msg.jobId || msg.id || 'cur');
    var now = Date.now();
    if (!_countdownStartByJob[jobKey]) _countdownStartByJob[jobKey] = now;
    var elapsed = (now - _countdownStartByJob[jobKey]) / 1000;
    return Math.max(0, Math.round(AUTO_SKIP_MAX - elapsed));
  }

  (function patchOnMessage() {
    const _origAddListener = chrome.runtime.onMessage.addListener.bind(chrome.runtime.onMessage);
    chrome.runtime.onMessage.addListener = function (listener) {
      return _origAddListener(function (msg, sender, sendResponse) {
        if (msg && msg.type === 'AUTO_APPLY_STATE_UPDATE' &&
            typeof msg.autoSkipSeconds === 'number') {
          if (msg.autoSkipSeconds > AUTO_SKIP_MAX) {
            if (!isSubmitSuppressed()) {
              var jobKey = String(msg.url || msg.jobUrl || msg.jobId || msg.id || 'cur');
              scheduleForceSkip(jobKey);
            }
            msg = Object.assign({}, msg, { autoSkipSeconds: rescaleAutoSkip(msg) });
          } else {
            /* Value already within cap — clear our local tracking so
               the next re-trigger restarts from MAX. */
            var jk = String(msg.url || msg.jobUrl || msg.jobId || msg.id || 'cur');
            delete _countdownStartByJob[jk];
          }
        }
        return listener(msg, sender, sendResponse);
      });
    };
  })();

  /* ── DOM-driven "Please fill the missing details" countdown + skip ────
   * The 2.6.0 sidepanel's own countdown text only renders when
   * autoSkipSeconds is within a narrow range and the bundle's
   * listener was registered before our wrap, so we can't rewrite
   * what it sees. Instead we watch the rendered DOM directly:
   *   1. When the warning text appears, start a local 15-second
   *      countdown.
   *   2. Each second, render "Auto skip in N Sec." below the Skip
   *      button (creating the element if the sidepanel hasn't,
   *      otherwise rewriting the number in the existing text).
   *   3. When N hits 0, find the visible Skip button and click it.
   *   4. Aborted if the warning disappears OR a submit was just
   *      attempted (30-second submit-suppression window).
   * ─────────────────────────────────────────────────────────────────── */
  var MD_TIMEOUT_MS = 15_000;
  var _mdStartAt = 0;
  var _mdTimerId = null;
  var _mdCountdownEl = null;

  var MD_WARNING_PATTERNS = [
    'please fill the missing details',
    'fill the missing details and submit'
  ];

  function findWarningContainer() {
    var nodes = document.querySelectorAll('h1,h2,h3,h4,p,span,div');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (!n) continue;
      var t = ((n.textContent || '') + '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (!t || t.length > 300) continue;
      for (var j = 0; j < MD_WARNING_PATTERNS.length; j++) {
        if (t.indexOf(MD_WARNING_PATTERNS[j]) !== -1) return n;
      }
    }
    return null;
  }

  function findVisibleSkipButton() {
    var btns = document.querySelectorAll('button, [role="button"]');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      if (!b || b.id === 'aapBtnSkip') continue; // ignore our own panel's Skip
      if (b.disabled) continue;
      var r = b.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      var t = ((b.innerText || b.textContent || '') + '').replace(/\s+/g, ' ').trim();
      if (t === 'Skip') return b;
    }
    return null;
  }

  function renderCountdown(remaining) {
    /* Find the actual Skip button container so we can insert the
       countdown text right below it where it belongs. */
    var skipBtn = findVisibleSkipButton();
    if (!skipBtn) return;
    /* Look for an existing countdown text node ("Auto skip in N Sec.")
       anywhere near the skip button. If found, rewrite the number. */
    var parent = skipBtn.parentElement;
    for (var hop = 0; hop < 3 && parent; hop++) {
      var spans = parent.querySelectorAll('span,div,p');
      for (var i = 0; i < spans.length; i++) {
        var s = spans[i];
        var txt = ((s.textContent || '') + '').trim();
        if (/^Auto\s*skip\s+in\s+\d+\s+Sec\.?$/i.test(txt)) {
          /* Rewrite the number in-place via text-node traversal */
          for (var k = 0; k < s.childNodes.length; k++) {
            var ch = s.childNodes[k];
            if (ch.nodeType === 3 && /\d+/.test(ch.nodeValue)) {
              ch.nodeValue = ch.nodeValue.replace(/\d+/, String(remaining));
              return;
            }
            if (ch.nodeType === 1 && /^\d+$/.test((ch.textContent || '').trim())) {
              ch.textContent = String(remaining);
              return;
            }
          }
        }
      }
      parent = parent.parentElement;
    }
    /* No native countdown text in the DOM — inject our own next to
       the Skip button. Created once, reused across ticks. */
    if (!_mdCountdownEl || !document.body.contains(_mdCountdownEl)) {
      _mdCountdownEl = document.createElement('div');
      _mdCountdownEl.id = 'oh-md-countdown';
      _mdCountdownEl.style.cssText =
        'text-align:center;margin-top:8px;font-size:13px;color:#a78bfa;' +
        'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;';
      var host = skipBtn.parentElement || skipBtn;
      host.appendChild(_mdCountdownEl);
    }
    _mdCountdownEl.textContent = 'Auto skip in ' + remaining + ' Sec.';
  }

  function clearMdCountdown() {
    if (_mdTimerId) { clearInterval(_mdTimerId); _mdTimerId = null; }
    _mdStartAt = 0;
    if (_mdCountdownEl && _mdCountdownEl.parentElement) {
      _mdCountdownEl.parentElement.removeChild(_mdCountdownEl);
    }
    _mdCountdownEl = null;
  }

  function tickMdCountdown() {
    if (!_mdStartAt) return;
    if (isSubmitSuppressed()) { clearMdCountdown(); return; }
    var warning = findWarningContainer();
    if (!warning) { clearMdCountdown(); return; }
    var elapsed = (Date.now() - _mdStartAt) / 1000;
    var remaining = Math.max(0, Math.round(MD_TIMEOUT_MS / 1000 - elapsed));
    renderCountdown(remaining);
    if (remaining <= 0) {
      clearMdCountdown();
      var btn = findVisibleSkipButton();
      if (btn) {
        try {
          btn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
          btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          btn.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true }));
          btn.click();
        } catch (_) { try { btn.click(); } catch (__) {} }
        addLog('Missing-details: countdown reached 0, clicked Skip', '');
      } else {
        try { chrome.runtime.sendMessage({ action: 'skipCurrent' }).catch(function(){}); }
        catch (_) {}
        addLog('Missing-details: countdown reached 0, sent skipCurrent', '');
      }
    }
  }

  function checkMissingDetails() {
    var visible = !!findWarningContainer();
    if (!visible) {
      if (_mdStartAt || _mdCountdownEl) clearMdCountdown();
      return;
    }
    if (_mdStartAt) return; // already counting
    if (isSubmitSuppressed()) return;
    _mdStartAt = Date.now();
    renderCountdown(Math.round(MD_TIMEOUT_MS / 1000));
    _mdTimerId = setInterval(tickMdCountdown, 1000);
  }

  /* Drive on tight poll + MutationObserver so we react quickly when
     the warning paints. */
  setInterval(checkMissingDetails, 500);
  if (document.body) {
    try {
      new MutationObserver(checkMissingDetails).observe(document.body, {
        childList: true, subtree: true, characterData: true
      });
    } catch (_) {}
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      checkMissingDetails();
      try {
        new MutationObserver(checkMissingDetails).observe(document.body, {
          childList: true, subtree: true, characterData: true
        });
      } catch (_) {}
    });
  }
  /* ── Stuck-job watchdog ────────────────────────────────────────────────────
   * If the same job has been "active" for more than 25 seconds without
   * completing, force-skip — UNLESS a submit was recently attempted.         */
  var _watchdogJobKey = '';
  var _watchdogTimer  = null;

  function resetWatchdog(key) {
    if (_watchdogJobKey === key) return;
    _watchdogJobKey = key;
    clearTimeout(_watchdogTimer);
    _watchdogTimer = setTimeout(function () {
      if (isSubmitSuppressed()) {
        // Submit was attempted — give it more time (re-arm for another 25s)
        _watchdogJobKey = '';
        resetWatchdog(key + '_retry');
        return;
      }
      chrome.runtime.sendMessage({ action: 'skipCurrent' }).catch(function () {});
      _watchdogJobKey = '';
    }, 25_000);
  }

  /* ── "Please fill the missing details" DOM-driven skip ───────────────────
   * The sidepanel-bundle's own onMessage listener was registered BEFORE
   * our wrap, so the autoSkipSeconds interception doesn't always fire
   * scheduleForceSkip(). Watch the sidepanel DOM directly for the warning
   * card, then click its Skip button after MISSING_DETAILS_TIMEOUT_MS so
   * the queue advances reliably regardless of message-interception. */
  var MISSING_DETAILS_TIMEOUT_MS = 7_000;
  var _missingTimer = null;
  var _missingShownAt = 0;

  function findSkipButton() {
    /* Look for a visible <button> (or role=button) whose own text is
       exactly "Skip" — the sidepanel renders it as a plain Skip button.
       Avoid our own #aapBtnSkip (that one belongs to the Auto-Apply
       Status Panel and may be hidden). */
    var btns = document.querySelectorAll('button, [role="button"]');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      if (!b || b.id === 'aapBtnSkip') continue;
      if (b.disabled) continue;
      var r = b.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      var t = ((b.innerText || b.textContent || '') + '').replace(/\s+/g, ' ').trim();
      if (t === 'Skip') return b;
    }
    return null;
  }

  function ownTextLower(el) {
    if (!el) return '';
    var s = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3) s += n.nodeValue;
    }
    return s.toLowerCase();
  }

  var MISSING_PATTERNS = [
    'please fill the missing details',
    'fill the missing details and submit',
    'job auto-applier needs your preferences'
  ];

  function isMissingDetailsVisible() {
    var nodes = document.querySelectorAll('h1,h2,h3,h4,p,span,div');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (!n) continue;
      var t = ownTextLower(n);
      if (!t || t.length > 300) continue;
      for (var j = 0; j < MISSING_PATTERNS.length; j++) {
        if (t.indexOf(MISSING_PATTERNS[j]) !== -1) return true;
      }
    }
    return false;
  }

  function checkMissingDetails() {
    var visible = isMissingDetailsVisible();
    if (!visible) {
      /* Warning gone — clear the pending timer */
      if (_missingTimer) { clearTimeout(_missingTimer); _missingTimer = null; }
      _missingShownAt = 0;
      return;
    }
    if (_missingTimer || _missingShownAt) return; // already armed
    if (isSubmitSuppressed()) return;
    _missingShownAt = Date.now();
    _missingTimer = setTimeout(function () {
      _missingTimer = null;
      if (isSubmitSuppressed()) { _missingShownAt = 0; return; }
      if (!isMissingDetailsVisible()) { _missingShownAt = 0; return; }
      var btn = findSkipButton();
      if (btn) {
        try {
          btn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
          btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          btn.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true }));
          btn.click();
        } catch (_) { try { btn.click(); } catch (__) {} }
        addLog('Missing-details: clicked Skip', '');
      } else {
        try { chrome.runtime.sendMessage({ action: 'skipCurrent' }).catch(function () {}); }
        catch (_) {}
        addLog('Missing-details: sent skipCurrent (no Skip button)', '');
      }
      _missingShownAt = 0;
    }, MISSING_DETAILS_TIMEOUT_MS);
  }

  /* Run on a tight poll + on every DOM mutation */
  setInterval(checkMissingDetails, 600);
  if (document.body) {
    try {
      new MutationObserver(checkMissingDetails).observe(document.body, {
        childList: true, subtree: true, characterData: true
      });
    } catch (_) {}
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      try {
        new MutationObserver(checkMissingDetails).observe(document.body, {
          childList: true, subtree: true, characterData: true
        });
      } catch (_) {}
    });
  }

  chrome.runtime.onMessage.addListener(function (msg) {
    if (!msg) return;

    // Submit was attempted from content script — suppress all skip timers
    if (msg.type === 'SUBMIT_ATTEMPTED') {
      _submitAttemptedTs = msg.ts || Date.now();
      clearAllSkipTimers();
      addLog('Submit attempted — skip timers paused for 30s', '');
      return;
    }

    // New job started → reset watchdog
    if (msg.type === 'CSV_JOB_STARTED' || msg.type === 'CSV_JOB_OPENING') {
      _submitAttemptedTs = 0; // new job — allow skipping again
      resetWatchdog(String(Date.now()));
    }
    if (msg.type === 'SIDEBAR_STATUS' && msg.url) {
      if (msg.event !== 'submitting') resetWatchdog(msg.url);
      // submitting state → suppress watchdog
      if (msg.event === 'submitting') {
        _submitAttemptedTs = Date.now();
        clearAllSkipTimers();
      }
    }
    // Job completed → cancel watchdog
    if (msg.type === 'CSV_JOB_COMPLETE' || msg.type === 'CSV_QUEUE_DONE') {
      clearTimeout(_watchdogTimer);
      _watchdogJobKey  = '';
      _submitAttemptedTs = 0;
    }
  });

  /* ── Message listener — receives status from background / content scripts ── */
  chrome.runtime.onMessage.addListener(function (msg) {
    if (!msg || !msg.type) return;

    /* ── CSV Job Started ── */
    if (msg.type === 'CSV_JOB_STARTED') {
      showPanel();
      setPulse('active');
      _isRunning = true;
      clearFieldList();
      if (progressSec) progressSec.style.display = 'none';
      addLog('Opening job page...', 'active');
      if (title) title.textContent = 'Auto-Apply Mode';
    }

    /* ── CSV Job Complete ── */
    if (msg.type === 'CSV_JOB_COMPLETE') {
      var st = msg.status;
      if (st === 'done') {
        addLog('Application submitted successfully', 'success');
      } else if (st === 'duplicate') {
        addLog('Already applied — skipping', '');
      } else if (st === 'skipped') {
        addLog('Skipped', '');
      } else {
        addLog('Failed: ' + (msg.reason || 'unknown'), 'error');
      }
      clearFieldList();
      if (progressSec) progressSec.style.display = 'none';
    }

    /* ── CSV Queue Done ── */
    if (msg.type === 'CSV_QUEUE_DONE') {
      setPulse('idle');
      _isRunning = false;
      addLog('All jobs processed!', 'success');
      if (title) title.textContent = 'Auto-Apply Complete';
    }

    /* ── Sidebar status messages from background ── */
    if (msg.type === 'SIDEBAR_STATUS') {
      showPanel();
      var evt = msg.event;
      if (evt === 'opening_page') {
        addLog('Opening job page...', 'active');
        if (msg.jobTitle) addLog('Job: ' + msg.jobTitle, '');
      }
      if (evt === 'ats_detected') {
        addLog('Detected ' + msg.atsName + ' application page', 'active');
        setPulse('active');
        showPanel();
      }
      if (evt === 'analyzing_form') {
        addLog('Analyzing form...', 'active');
        if (msg.atsName) addLog('ATS: ' + msg.atsName, '');
      }
      if (evt === 'filling_form') {
        addLog('Filling ' + (msg.atsName || '') + ' application form...', 'active');
      }
      if (evt === 'filling_progress') {
        updateProgress(msg.filled || 0, msg.total || 0, msg.responses || 0);
        addLog('Start applying \u2014 ' + (msg.responses || 0) + ' responses from API', '');
      }
      if (evt === 'submitting') {
        addLog('Submitting application...', 'active');
      }
      if (evt === 'skipping') {
        addLog('Skipping current job...', '');
      }
      if (evt === 'next_page') {
        addLog('Moved to next page, waiting for form to load...', 'active');
      }
      if (evt === 'job_complete') {
        /* Counter update happens via storage listener below */
      }
      if (evt === 'queue_stopped') {
        setPulse('idle');
        _isRunning = false;
        addLog('Queue stopped', 'error');
      }
    }

    /* ── Field list from content script ── */
    if (msg.type === 'SIDEBAR_FIELD_LIST') {
      setFieldList(msg.fields || []);
    }

    /* ── Individual field update ── */
    if (msg.type === 'SIDEBAR_FIELD_UPDATE') {
      updateField(msg.fieldName, msg.status);
    }
  });

  function clearFieldList() {
    if (fieldsEl) fieldsEl.innerHTML = '';
    _fieldMap = {};
  }

  /* ── Live counter from storage ── */
  function syncCounter() {
    try {
      chrome.storage.local.get('csvJobQueue', function (data) {
        if (chrome.runtime.lastError) return;
        var q = data.csvJobQueue || [];
        if (!q.length) { hidePanel(); return; }
        var done = 0, total = q.length, running = false;
        for (var i = 0; i < q.length; i++) {
          if (q[i].status === 'done') done++;
          if (q[i].status === 'running') running = true;
        }
        updateCounter(done, total);
        if (running || _isRunning) { showPanel(); setPulse('active'); _isRunning = true; }
      });
    } catch (_) {}
  }
  syncCounter();
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'local' && changes.csvJobQueue) syncCounter();
  });

  /* ── MutationObserver fallback to kill referral cards React renders ── */
  if (document.body) {
    new MutationObserver(function () {
      document.querySelectorAll('h2,h3,p,span').forEach(function (el) {
        var t = el.textContent || '';
        if (t.indexOf('One Referral 3 Benefits') !== -1 ||
            t.indexOf('Get 20 Auto-fill Credits for every signup') !== -1) {
          var node = el;
          for (var i = 0; i < 8; i++) {
            if (!node.parentElement) break;
            node = node.parentElement;
            var c = node.className || '';
            if (typeof c === 'string' && (c.indexOf('bg-') !== -1 || c.indexOf('border') !== -1)) {
              node.style.cssText = 'display:none!important';
              break;
            }
          }
        }
      });
    }).observe(document.body, { childList: true, subtree: true });
  }
})();
