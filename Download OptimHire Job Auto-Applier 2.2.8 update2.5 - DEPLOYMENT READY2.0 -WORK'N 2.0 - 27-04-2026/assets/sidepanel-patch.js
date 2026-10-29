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

  /* ── Idle governor (sidepanel) ───────────────────────────────────────
   * The side panel is open the whole time the extension is used, and it
   * was running ~10 polling loops plus 4 body-subtree MutationObservers
   * continuously — including a 500ms pass that did
   * querySelectorAll('h1,h2,h3,h4,p,span,div') and read textContent of
   * every node, re-triggered by each observer on every React re-render.
   * That was a constant CPU drain even with nothing being automated.
   *
   * Same approach as the content script: local setInterval /
   * MutationObserver shadows. When automation is not engaged, sub-15s
   * loop bodies are skipped and observers are disconnected. Observer
   * callbacks are additionally coalesced so a burst of re-render
   * mutations costs one pass, not hundreds.
   * ────────────────────────────────────────────────────────────────── */
  var _spNativeSetInterval = window.setInterval.bind(window);
  var _SpNativeMO = window.MutationObserver;
  var _spEngaged = false;
  var _spObservers = new Set();
  var _SP_KEYS = ['autoApplyState', 'isAutoProcessStartJob', 'isManuallyStartJob', 'ohJobQueueActive',
                  'ohAutoApplyEngaged', 'ohAutoApplyEngagedTs', 'ohAutomationDisabled'];
  function _spRefreshEngaged() {
    try {
      chrome.storage.local.get(_SP_KEYS, function (d) {
        try {
          var on = false;
          if (!d || d.ohAutomationDisabled !== true) {
            var st = d && d.autoApplyState;
            on = !!(st && st.isActive === true) || !!(d && d.isAutoProcessStartJob) ||
                 !!(d && d.isManuallyStartJob) || !!(d && d.ohJobQueueActive);
            if (!on && d && d.ohAutoApplyEngaged) {
              var ts = d.ohAutoApplyEngagedTs || 0;
              on = !!ts && (Date.now() - ts < 10 * 60 * 1000);
            }
          }
          _spEngaged = on;
          _spObservers.forEach(function (g) {
            if (on && !g.connected && g.args) { try { g.obs.observe.apply(g.obs, g.args); g.connected = true; } catch (_) {} }
            else if (!on && g.connected) { try { g.obs.disconnect(); } catch (_) {} g.connected = false; }
          });
        } catch (_) {}
      });
    } catch (_) {}
  }
  _spNativeSetInterval(_spRefreshEngaged, 5000);
  setTimeout(_spRefreshEngaged, 500);

  function setInterval(fn, ms) {
    return _spNativeSetInterval(function () {
      if (!_spEngaged && ms < 15000) return;
      return fn.apply(this, arguments);
    }, ms);
  }
  function MutationObserver(cb) {
    var g = { args: null, connected: false, pending: false };
    /* Coalesce: one callback per animation-frame-ish window instead of
       one per mutation record burst. */
    g.obs = new _SpNativeMO(function () {
      if (!_spEngaged || g.pending) return;
      g.pending = true;
      setTimeout(function () { g.pending = false; try { cb(); } catch (_) {} }, 250);
    });
    _spObservers.add(g);
    return {
      observe: function () { g.args = arguments; if (_spEngaged) { try { g.obs.observe.apply(g.obs, arguments); g.connected = true; } catch (_) {} } },
      disconnect: function () { try { g.obs.disconnect(); } catch (_) {} g.connected = false; },
      takeRecords: function () { return g.obs.takeRecords(); }
    };
  }

  /* ════════════════════════════════════════════════════════════
     ONE JOB TAB — the run never touches the tab you are using
     ════════════════════════════════════════════════════════════
     OptimHire decides "the job tab" by asking Chrome for whichever tab
     is ACTIVE at that instant, in several places:
       - Start / Resume from this panel sends the active tab's id as
         activeTabId → the background navigates THAT tab to job-apply
         and focuses it;
       - "Back to Main" calls tabs.update({url}) with NO tab id, which
         navigates whatever tab is in front;
       - when copilotTabId is missing (it is removed every time a run
         stops, completes or is auto-resumed) the background adopts the
         active tab as the new job tab.
     So anything that happened while the user was on another tab (their
     LinkedIn, say) — including our own auto-resume and stall recovery —
     dragged that tab into the run: "it uses OptimHire on both tabs".

     Fix, without touching OptimHire's code:
       - PIN the job tab (ohJobTab {id, ts}) when a run starts;
       - in this panel, "active tab" queries resolve to the pinned tab and
         tab updates without an id go to it; automation never steals
         focus (active:true is dropped unless the user just clicked);
       - keep OptimHire's copilotTabId on the pinned tab;
       - ping the pinned tab so content scripts know which tab is the job
         tab, and every other tab stands down (optimhire-patch.js).
     The pin is released on Stop, when the master switch goes OFF, or
     when the job tab is closed. */
  var _realTabsQuery = chrome.tabs.query;
  var _realTabsUpdate = chrome.tabs.update;
  var _realSendMessage = chrome.runtime.sendMessage;
  /* The tab the user is actually looking at — for OUR "Autofill this
     page", which must target the visible tab, never the pinned one. */
  function realActiveTabs(q, cb) { return _realTabsQuery.call(chrome.tabs, q, cb); }
  var _jobTabPin = null;              // pinned job tab id
  var _lastUserGestureTs = 0;
  var releaseJobTab = function () {};  // replaced by the guard below
  (function installJobTabGuard() {
    var PIN_KEY = 'ohJobTab';
    var GESTURE_MS = 2500;
    var JOB_APPLY_URL = 'https://optimhire.com/d/job-apply';
    var START_ACTIONS = { START_COPILOT_WEB: 1, OPEN_MANUAL_APPLICATION: 1,
                          START_SINGLE_MANUAL_APPLICATION: 1, START_TEST_AUTO_APPLICATION: 1 };

    ['pointerdown', 'keydown'].forEach(function (ev) {
      document.addEventListener(ev, function (e) { if (e.isTrusted) _lastUserGestureTs = Date.now(); }, true);
    });
    function userJustActed() { return Date.now() - _lastUserGestureTs < GESTURE_MS; }
    function note(msg) { try { if (typeof addLog === 'function') addLog(msg, ''); } catch (_) {} }

    function writePin(id) {
      _jobTabPin = id;
      try { chrome.storage.local.set({ ohJobTab: id == null ? null : { id: id, ts: Date.now() } }); } catch (_) {}
    }
    function pin(id, why) {
      if (id == null || id === _jobTabPin) return;
      writePin(id);
      note('Job tab pinned — the run stays in this one tab (' + why + ')');
    }
    releaseJobTab = function (why) {
      if (_jobTabPin == null) return;
      writePin(null);
      note('Job tab released (' + why + ')');
    };
    function withLiveTab(id, cb) {
      try {
        chrome.tabs.get(id, function (t) {
          var ok = !chrome.runtime.lastError && !!t;
          cb(ok ? t : null);
        });
      } catch (_) { cb(null); }
    }
    /* Keep OptimHire's own notion of the job tab on the pinned tab. */
    function syncCopilotTab() {
      if (_jobTabPin == null) return;
      chrome.storage.local.get(['copilotTabId', 'ohAutomationDisabled'], function (d) {
        if (!d || d.ohAutomationDisabled === true || _jobTabPin == null) return;
        if (d.copilotTabId === _jobTabPin) return;
        var id = _jobTabPin;
        withLiveTab(id, function (t) {
          if (!t) { releaseJobTab('job tab closed'); return; }
          chrome.storage.local.set({ copilotTabId: id });
        });
      });
    }

    /* Start state. */
    chrome.storage.local.get([PIN_KEY, 'copilotTabId', 'isAutoProcessStartJob', 'isManuallyStartJob',
                              'autoApplyState', 'ohAutomationDisabled'], function (d) {
      d = d || {};
      if (d.ohAutomationDisabled === true) return;
      var p = d[PIN_KEY];
      if (p && p.id != null) {
        withLiveTab(p.id, function (t) { if (t) { _jobTabPin = p.id; syncCopilotTab(); } else writePin(null); });
        return;
      }
      var live = d.isAutoProcessStartJob || d.isManuallyStartJob || (d.autoApplyState && d.autoApplyState.isActive);
      if (live && d.copilotTabId != null) {
        withLiveTab(d.copilotTabId, function (t) { if (t) pin(d.copilotTabId, 'running job tab'); });
      }
    });

    chrome.storage.onChanged.addListener(function (c, area) {
      if (area !== 'local') return;
      if (c[PIN_KEY]) {
        var nv = c[PIN_KEY].newValue;
        _jobTabPin = nv && nv.id != null ? nv.id : null;
      }
      if (c.ohAutomationDisabled && c.ohAutomationDisabled.newValue === true) releaseJobTab('automation switched OFF');
      if (c.copilotTabId) {
        var id = c.copilotTabId.newValue;
        if (id != null && _jobTabPin == null) {
          withLiveTab(id, function (t) { if (t) pin(id, 'run started'); });
        } else if (_jobTabPin != null && id !== _jobTabPin) {
          /* OptimHire moved (or dropped) its job tab. Put it back — after a
             beat for a removal, so a genuine stop can clear the pin first. */
          setTimeout(syncCopilotTab, id == null ? 600 : 0);
          if (id != null) note('Kept the run in its own tab (OptimHire tried to switch to another tab)');
        }
      }
    });
    try {
      chrome.tabs.onRemoved.addListener(function (tabId) {
        if (tabId !== _jobTabPin) return;
        releaseJobTab('job tab closed');
        /* OptimHire ends the run when its tab closes. Disengage too, so
           auto-resume can't restart it in whatever tab is in front. */
        try { chrome.storage.local.set({ ohAutoApplyEngaged: false, ohAutoApplyEngagedTs: 0 }); } catch (_) {}
      });
    } catch (_) {}

    /* "Active tab" = the pinned job tab, unless the user just clicked. */
    chrome.tabs.query = function (q, cb) {
      try {
        if (_jobTabPin != null && q && q.active === true && (q.currentWindow || q.lastFocusedWindow) &&
            !q.url && !userJustActed()) {
          var id = _jobTabPin;
          var p = new Promise(function (res) {
            withLiveTab(id, function (t) {
              if (t) { res([t]); return; }
              Promise.resolve(_realTabsQuery.call(chrome.tabs, q)).then(res, function () { res([]); });
            });
          });
          if (typeof cb === 'function') { p.then(cb); return undefined; }
          return p;
        }
      } catch (_) {}
      return _realTabsQuery.apply(chrome.tabs, arguments);
    };

    /* No focus stealing by automation; id-less updates go to the job tab. */
    chrome.tabs.update = function () {
      var args = Array.prototype.slice.call(arguments);
      try {
        var hasId = typeof args[0] === 'number';
        var props = hasId ? args[1] : args[0];
        if (props && typeof props === 'object' && !userJustActed()) {
          if (props.active === true) {
            props = Object.assign({}, props);
            delete props.active;
          }
          if (!hasId && _jobTabPin != null) args = [_jobTabPin, props].concat(args.slice(1));
          else if (hasId) args[1] = props;
          else args[0] = props;
        }
      } catch (_) {}
      return _realTabsUpdate.apply(chrome.tabs, args);
    };

    /* Start messages: pin first, keep OptimHire on the pinned tab, and
       start the web run in the job tab WITHOUT pulling it to the front. */
    function whenPinned(msg) {
      return new Promise(function (res) {
        if (_jobTabPin != null) {
          var id = _jobTabPin;
          withLiveTab(id, function (t) {
            if (!t) { releaseJobTab('job tab closed'); res(null); return; }
            chrome.storage.local.set({ copilotTabId: id }, function () { res(id); });
          });
          return;
        }
        var cand = msg && typeof msg.activeTabId === 'number' ? msg.activeTabId : null;
        var finish = function (id) {
          if (id == null) { res(null); return; }
          pin(id, 'run started');
          chrome.storage.local.set({ copilotTabId: id }, function () { res(id); });
        };
        if (cand != null) { finish(cand); return; }
        Promise.resolve(_realTabsQuery.call(chrome.tabs, { active: true, currentWindow: true }))
          .then(function (tabs) { finish(tabs && tabs[0] && tabs[0].id != null ? tabs[0].id : null); },
                function () { res(null); });
      });
    }
    chrome.runtime.sendMessage = function () {
      var args = Array.prototype.slice.call(arguments);
      var msg = args[0];
      if (!msg || typeof msg !== 'object' || !START_ACTIONS[msg.action]) {
        return _realSendMessage.apply(chrome.runtime, args);
      }
      var cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
      var gesture = userJustActed();
      var p = whenPinned(msg).then(function (id) {
        if (id != null && typeof msg.activeTabId === 'number') msg.activeTabId = id;
        if (msg.action === 'START_COPILOT_WEB' && id != null && !gesture) {
          /* The background would do tabs.update(id, {url, active:true}).
             Same navigation, minus the focus grab. */
          return Promise.resolve(_realTabsUpdate.call(chrome.tabs, id, { url: JOB_APPLY_URL }))
            .then(function () { return { success: true }; }, function () { return { success: false }; });
        }
        return _realSendMessage.call(chrome.runtime, msg);
      });
      if (cb) { p.then(function (r) { try { cb(r); } catch (_) {} }, function () { try { cb(); } catch (_) {} }); return undefined; }
      return p;
    };

    /* Tell the job tab it is the job tab (content scripts in every other
       tab stand down), refresh the pin's heartbeat, answer "am I it?". */
    var _lastBeat = 0, _lastHeal = 0;
    _spNativeSetInterval(function () {
      /* Self-heal: panel opened mid-run, or the start went unseen — adopt
         OptimHire's running job tab. */
      if (_jobTabPin == null) {
        if (Date.now() - _lastHeal < 6000) return;
        _lastHeal = Date.now();
        chrome.storage.local.get(['copilotTabId', 'isAutoProcessStartJob', 'isManuallyStartJob',
                                  'autoApplyState', 'ohAutomationDisabled'], function (d) {
          d = d || {};
          if (_jobTabPin != null || d.ohAutomationDisabled === true || d.copilotTabId == null) return;
          if (!(d.isAutoProcessStartJob || d.isManuallyStartJob || (d.autoApplyState && d.autoApplyState.isActive))) return;
          var id = d.copilotTabId;
          withLiveTab(id, function (t) { if (t) pin(id, 'running job tab'); });
        });
        return;
      }
      try { Promise.resolve(chrome.tabs.sendMessage(_jobTabPin, { type: 'OH_JOB_TAB_PING' })).catch(function () {}); } catch (_) {}
      if (Date.now() - _lastBeat > 20000) {
        _lastBeat = Date.now();
        try { chrome.storage.local.set({ ohJobTab: { id: _jobTabPin, ts: _lastBeat } }); } catch (_) {}
      }
    }, 3000);
    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      if (!msg || msg.type !== 'OH_JOB_TAB_WHO') return;
      sendResponse({ job: !!(sender && sender.tab && _jobTabPin != null && sender.tab.id === _jobTabPin) });
    });
  })();

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
  /* Do NOT zero applied-count fields — they drive the "X of N
     applied" progress display. Empty list keeps references valid. */
  var SP_COUNTER_ZERO = [];

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
    /* SIZE GUARD: never hide a large element. The referral/upgrade
       cards we want to hide are small (< ~220px tall, few children).
       A main content container is tall and/or has many descendants —
       hiding it blanks the panel. This guard is the safety net that
       prevents the "blank middle" bug. */
    try {
      var rect = el.getBoundingClientRect && el.getBoundingClientRect();
      if (rect && rect.height > 240) return;             // too tall to be a card
      var descendants = el.querySelectorAll ? el.querySelectorAll('*').length : 0;
      if (descendants > 25) return;                      // too complex to be a card
    } catch (_) {}
    el.style.setProperty('display', 'none', 'important');
    if (el.dataset) el.dataset.ohHidden = '1';
  }

  function pickAncestorToHide(el) {
    var node = el;
    /* Walk up at most 3 levels, stop at sidepanel root, and refuse to
       return ancestors with large text (likely a content container). */
    for (var i = 0; i < 3; i++) {
      if (!node || isSidepanelRoot(node)) return null;
      var len = (node.textContent || '').length;
      if (len > 220) return null;
      var parent = node.parentElement;
      if (!parent || isSidepanelRoot(parent)) return node;
      var parentLen = (parent.textContent || '').length;
      /* Only climb if the parent is barely bigger than node (i.e. it's
         a thin wrapper, not a content section). */
      if (parentLen <= len + 60 && parentLen < 220) {
        node = parent;
        continue;
      }
      return node;
    }
    return node;
  }

  /* Safety: if anything we do ever leaves the app root nearly empty,
     we revert ALL our hides and stop hiding. Keeping the panel usable
     always wins over hiding upgrade/referral cards. */
  var _hideDisabled = false;
  function revertAllHides() {
    try {
      var hidden = document.querySelectorAll('[data-oh-hidden="1"]');
      for (var i = 0; i < hidden.length; i++) {
        hidden[i].style.removeProperty('display');
        hidden[i].removeAttribute('data-oh-hidden');
      }
    } catch (_) {}
  }

  function hideMatching() {
    if (_hideDisabled) return;
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

  /* React mounted? The Plasmo root has children once the app rendered.
     We delay the hide loop until then so we never act on a half-mounted
     tree (and the size-guarded hideMatching only ever hides small cards). */
  function reactMounted() {
    try {
      var root = document.getElementById('__plasmo');
      return !!(root && root.childElementCount > 0);
    } catch (_) { return true; }
  }
  function startHideLoop() {
    var started = false;
    function begin() {
      if (started) return; started = true;
      hideMatching();
      /* Native + slower: the limit/upgrade hiding must apply even when no
       automation is running, but it does a text scan so 1.5s was wasteful. */
    _spNativeSetInterval(hideMatching, 4000);
      if (document.body) {
        try {
          new MutationObserver(hideMatching).observe(document.body, {
            childList: true, subtree: true
          });
        } catch (_) {}
      }
    }
    /* Poll up to ~10s for React to mount; if it never does, begin anyway
       (the size guard makes hiding safe regardless). */
    var waited = 0;
    var iv = setInterval(function () {
      waited += 200;
      if (reactMounted() || waited >= 10000) { clearInterval(iv); begin(); }
    }, 200);
  }
  if (document.body) startHideLoop();
  else document.addEventListener('DOMContentLoaded', startHideLoop);

  /* Blank-app safety watchdog: if the React root has mounted children
     but shows almost no visible text, we over-hid (or something went
     wrong) — revert every hide and stop hiding so the panel is usable. */
  setInterval(function () {
    if (_hideDisabled) return;
    try {
      var root = document.getElementById('__plasmo');
      if (!root || root.childElementCount === 0) return; // not mounted yet
      var txt = (root.innerText || '').trim();
      if (txt.length < 40) {
        _hideDisabled = true;
        revertAllHides();
      }
    } catch (_) {}
  }, 1500);

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
    /* Mirror EVERY sidepanel log entry into the debug ring buffer. We do
       this even when logEl is missing (panel collapsed / not yet built)
       so the viewer still captures the event. */
    try {
      if (window.OH_DEBUG) {
        var lvl = cls === 'error' ? 'error' : 'info';
        window.OH_DEBUG.log('sidepanel', String(text || ''), cls ? { cls: cls } : undefined, lvl);
      }
    } catch (_) {}
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
    try { var nowEl = document.getElementById('oh-qc-now'); if (nowEl && text) nowEl.textContent = String(text); } catch (_) {}
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
    cardForm(true, filled, total);
  }
  /* The form progress, on the Job Queue card. */
  function cardForm(show, filled, total) {
    try {
      var box = document.getElementById('oh-qc-form');
      if (!box) return;
      box.style.display = show && total > 0 ? '' : 'none';
      if (!show || !(total > 0)) return;
      var pct = Math.round((filled / total) * 100);
      document.getElementById('oh-qc-form-pct').textContent = pct + '%';
      document.getElementById('oh-qc-form-bar').style.width = pct + '%';
      document.getElementById('oh-qc-form-stats').textContent = filled + ' of ' + total + ' required fields filled';
    } catch (_) {}
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
      sendOhSkip('Skip pressed');
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
  const AUTO_SKIP_MAX = 3;          // seconds (was 15, then 10); OptimHire's own 180s is cut to 3s in oh-bg.js
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
      forceAdvanceSkip('Auto-skip timer elapsed');
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
  var MD_TIMEOUT_MS = 10_000;       // was 15s
  var _mdStartAt = 0;
  var _mdTimerId = null;
  var _mdCountdownEl = null;
  var _lastMdSkipTs = 0;             // cooldown so we never spam-skip
  var MD_SKIP_COOLDOWN_MS = 12_000;  // min gap between auto-skips

  /* ── Stuck-job circuit breaker ──────────────────────────────────────────
   * When OptimHire is broken on a particular job (e.g. a Lever 404 / the
   * same job served over and over), the missing-details warning never
   * clears, so we'd auto-skip it again every cooldown — driving the
   * "X of Y applied" counter up (185→186→187…) while the page never
   * actually changes. Detect that runaway loop: if we auto-skip more than
   * MD_BURST_MAX times inside MD_BURST_WINDOW_MS, we're clearly stuck →
   * stop auto-skipping for MD_BREAKER_COOLDOWN_MS and attempt ONE real
   * recovery (Back to Main → re-start) so OptimHire fetches a fresh batch
   * instead of thrashing the same broken job. */
  var _mdSkipTimes = [];                  // recent auto-skip timestamps
  var MD_BURST_WINDOW_MS = 60_000;        // look-back window
  var MD_BURST_MAX = 3;                   // > this many skips in window = stuck loop
  var _mdBreakerUntil = 0;                // suppress auto-skip until this ts
  var MD_BREAKER_COOLDOWN_MS = 120_000;   // how long to back off when stuck
  var _mdLastEscalateTs = 0;
  /* Consecutive auto-skips where the warning never sustainedly cleared.
     This catches a SLOW stuck-loop: now that the 12s cooldown actually
     holds, a broken job is only re-skipped ~once per ~27s — too slow to
     trip the 60s rate window, but it would still climb the counter
     forever. If we skip the same unchanged warning MD_MAX_CONSECUTIVE
     times in a row without it ever going away, we're stuck. */
  var _mdConsecutiveSkips = 0;
  var MD_MAX_CONSECUTIVE = 3;
  var _mdWarningGoneSince = 0;            // when the warning first went absent
  var MD_CLEAR_GRACE_MS = 4_000;          // absent this long ⇒ genuinely advanced

  /* Specific OptimHire stall phrases ONLY. These are the exact
     messages OptimHire shows when a job genuinely can't proceed.
     Kept tight on purpose — an over-generic phrase (e.g. "you have
     to fill out") matches normal helper text on every job and makes
     the queue skip everything. */
  var MD_WARNING_PATTERNS = [
    'please fill the missing details',
    'fill the missing details and submit',
    'fill out the form manually',
    'fill the form manually',
    'job auto-applier needs your preferences'
  ];

  /* Count an auto-skip and report whether we've tripped the stuck-loop
     breaker. Called right before each real skip fires. Trips on EITHER a
     fast burst (rate window) OR a slow loop (too many consecutive skips
     without the warning ever clearing). */
  function noteAutoSkipAndCheckBreaker() {
    var now = Date.now();
    _mdSkipTimes.push(now);
    _mdSkipTimes = _mdSkipTimes.filter(function (t) { return now - t < MD_BURST_WINDOW_MS; });
    _mdConsecutiveSkips++;
    var stuck = (_mdSkipTimes.length > MD_BURST_MAX) ||
                (_mdConsecutiveSkips > MD_MAX_CONSECUTIVE);
    if (stuck) {
      _mdBreakerUntil = now + MD_BREAKER_COOLDOWN_MS;
      _mdSkipTimes = [];
      _mdConsecutiveSkips = 0;
      try { addLog('Stuck on a job that can’t auto-complete — pausing auto-skip ' +
                   Math.round(MD_BREAKER_COOLDOWN_MS / 1000) + 's and recovering', ''); } catch (_) {}
      escalateStuckJob();
      return true;  // breaker tripped — caller should NOT skip again now
    }
    return false;
  }

  /* Called when the warning has been absent for MD_CLEAR_GRACE_MS — i.e.
     a skip genuinely advanced us to a different job. Reset the consecutive
     counter so legitimately-consecutive different jobs never trip the
     breaker; only an unchanging, never-clearing warning does. */
  function noteWarningGenuinelyCleared() {
    _mdConsecutiveSkips = 0;
  }

  /* One real recovery attempt when stuck in a skip-loop: click a visible
     "Back to Main" button if present (OptimHire then lets us re-start the
     search on a fresh batch via installAutoApplyResume). Rate-limited so
     it can't itself loop. */
  function escalateStuckJob() {
    var now = Date.now();
    if (now - _mdLastEscalateTs < MD_BREAKER_COOLDOWN_MS) return;
    _mdLastEscalateTs = now;
    try {
      var btns = document.querySelectorAll('button, [role="button"], a');
      for (var i = 0; i < btns.length; i++) {
        var b = btns[i];
        if (!b) continue;
        var r = b.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        var t = ((b.innerText || b.textContent || '') + '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (t === 'back to main' || t === 'back to home' || t === 'go to dashboard') {
          try { b.click(); addLog('Stuck-recovery: clicked "Back to Main" for a fresh batch', ''); } catch (_) {}
          return;
        }
      }
    } catch (_) {}
  }

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

  /* Force OptimHire to advance to the next job. The debug logs proved
     that chrome.runtime.sendMessage({action:'skipCurrent'}) does NOT
     reliably advance OptimHire when it's stuck in the 'missing-questions'
     blocked state — it just sits on OptimHire's own ~120s auto-skip
     timer (the freeze the user kept hitting). Clicking the REAL Skip
     button in the sidepanel DOES advance it. So we click the button
     first and only fall back to the message if no button is present. */
  /* Skip the current job the way OptimHire 2.9.0 actually understands.
     Its background has NO handler for {action:'skipCurrent'} any more —
     every "sent skipCurrent" (stall recovery, watchdogs, our Skip button)
     was silently ignored, which is why a stuck "Loading your Job" never
     recovered. AUTO_APPLY_SKIP records the skip and loads the next job
     (or, for a job started from the optimhire.com page, ends it and goes
     back to the page); the one-job-at-a-time mode takes a skip flag on
     OPEN_MANUAL_APPLICATION. */
  function sendOhSkip(reason) {
    try {
      chrome.storage.local.get(['autoApplyState', 'isAutoProcessStartJob', 'isManuallyStartJob', 'isSingleManualApplication'], function (d) {
        d = d || {};
        var st = d.autoApplyState;
        var msg;
        if (d.isManuallyStartJob && !d.isSingleManualApplication && !(st && st.isActive)) {
          msg = { action: 'OPEN_MANUAL_APPLICATION', isSkipped: true, error: { reason: 'auto_' + (reason || 'skip') } };
        } else {
          msg = { action: 'AUTO_APPLY_SKIP', skipReason: 'auto_skip', status: '4',
                  status_message: 'Skipped automatically: ' + (reason || 'stuck'),
                  applicationDetails: (st && st.applicationDetails) || undefined };
        }
        Promise.resolve(chrome.runtime.sendMessage(msg)).catch(function () {});
      });
    } catch (_) {}
  }

  function forceAdvanceSkip(reason) {
    var btn = findVisibleSkipButton();
    if (btn) {
      try {
        btn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        btn.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true }));
        btn.click();
      } catch (_) { try { btn.click(); } catch (__) {} }
      addLog((reason ? reason + ' — ' : '') + 'clicked Skip to advance', '');
      return true;
    }
    sendOhSkip(reason);
    addLog((reason ? reason + ' — ' : '') + 'told OptimHire to skip (no Skip button showing)', '');
    return false;
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
      _lastMdSkipTs = Date.now();   // start cooldown so we don't spam-skip
      /* If we're in a runaway skip-loop on a stuck/broken job, trip the
         breaker and run ONE recovery instead of skipping (which would
         just inflate the counter on the same page again). */
      if (noteAutoSkipAndCheckBreaker()) return;
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
        sendOhSkip('missing details');
        addLog('Missing-details: countdown reached 0, told OptimHire to skip', '');
      }
    }
  }

  function checkMissingDetails() {
    var visible = !!findWarningContainer();
    if (!visible) {
      if (_mdStartAt || _mdCountdownEl) clearMdCountdown();
      /* Warning gone. If it stays gone for MD_CLEAR_GRACE_MS we genuinely
         advanced to a new job → reset the consecutive-skip counter so the
         next stuck job is judged on its own. A brief flicker between the
         skip click and the re-render does NOT reset it. */
      if (!_mdWarningGoneSince) _mdWarningGoneSince = Date.now();
      else if (Date.now() - _mdWarningGoneSince >= MD_CLEAR_GRACE_MS) noteWarningGenuinelyCleared();
      return;
    }
    _mdWarningGoneSince = 0; // warning present again → not cleared
    if (_mdStartAt) return; // already counting
    if (isSubmitSuppressed()) return;
    /* Stuck-loop breaker tripped → stop auto-skipping this broken job for
       a while so the counter can't keep climbing on an unchanged page. */
    if (Date.now() < _mdBreakerUntil) return;
    /* Cooldown: don't immediately re-arm a new countdown right after a
       skip — prevents back-to-back spam-skipping across jobs. */
    if (Date.now() - _lastMdSkipTs < MD_SKIP_COOLDOWN_MS) return;
    _mdStartAt = Date.now();
    renderCountdown(Math.round(MD_TIMEOUT_MS / 1000));
    _mdTimerId = setInterval(tickMdCountdown, 1000);
  }

  /* Drive on tight poll + MutationObserver so we react quickly when
     the warning paints. */
  setInterval(checkMissingDetails, 1500);
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
      forceAdvanceSkip('Stuck 25s with no progress');
      _watchdogJobKey = '';
    }, 25_000);
  }

  /* ── Blocked-state FAST skip ──────────────────────────────────────────
   * Root cause of the long freezes (confirmed from the debug export):
   * OptimHire enters applicationState 'missing-questions' with
   * "Required fields are missing or invalid - submission blocked" and
   * then sits on its OWN ~120-second auto-skip timer (autoSkipSeconds:126
   * in the snapshot). Our skipCurrent message doesn't move it, so the
   * user had to skip by hand. Here we watch OptimHire's own state object
   * (autoApplyState) and, once the blocked state is STABLE for a few
   * seconds (so we never skip a job that's still being answered/filled),
   * click the real Skip button to advance immediately. Feeds the same
   * stuck-loop breaker so an unrecoverable job can't loop. */
  (function installBlockedStateFastSkip() {
    var BLOCKED_STABLE_MS  = 6_000;   // confirm the block is real, not transient
    var SKIP_COOLDOWN_MS   = 8_000;   // min gap between blocked-state skips
    var _blockedSince      = 0;
    var _blockedKey        = '';
    var _lastBlockedSkipTs = 0;

    var BLOCK_MSG_RE = /required fields are missing or invalid|submission blocked|missing or invalid/i;

    function isBlocked(st) {
      if (!st || typeof st !== 'object') return false;
      var state = st.applicationState || '';
      var err   = st.errorType || '';
      var msg   = String(st.statusMessage || '');
      /* Still actively fetching AI answers → NOT a terminal block; wait. */
      if (/fetching answers|analy[sz]ing|generating|loading|filling/i.test(msg)) return false;
      if (state === 'missing-questions' && (BLOCK_MSG_RE.test(msg) || st.progress === 0)) return true;
      if (err === 'missing-questions' && BLOCK_MSG_RE.test(msg)) return true;
      return false;
    }

    function jobKeyOf(st) {
      try {
        var ad = st.applicationDetails || {};
        return String(ad.jobId || ad.job_id || ad.url || '') + '|' +
               String(st.appliedCount != null ? st.appliedCount : '') + '|' +
               String(st.statusMessage || '');
      } catch (_) { return String(st && st.statusMessage || ''); }
    }

    function evaluate(st) {
      var now = Date.now();
      /* Only act while an auto-apply session is genuinely running. A stale
         autoApplyState left in storage would otherwise keep firing Skip,
         and every Skip makes OptimHire open the next job in a NEW TAB. */
      if (!st || st.isActive !== true) { _blockedSince = 0; _blockedKey = ''; return; }
      if (!isBlocked(st)) { _blockedSince = 0; _blockedKey = ''; return; }
      if (isSubmitSuppressed()) { _blockedSince = 0; return; }
      var key = jobKeyOf(st);
      if (key !== _blockedKey) { _blockedKey = key; _blockedSince = now; return; }
      if (now - _blockedSince < BLOCKED_STABLE_MS) return;     // wait for stability
      if (now - _lastBlockedSkipTs < SKIP_COOLDOWN_MS) return; // cooldown
      _lastBlockedSkipTs = now;
      _blockedSince = 0;
      _blockedKey = '';
      /* NOTE: deliberately NOT routed through the stuck-loop breaker —
         many DIFFERENT jobs are each legitimately blocked, and feeding
         the breaker would falsely trip its consecutive-skip pause. Our
         own 6s-stability + 8s-cooldown + per-job-key gating already
         prevents spamming a single job. */
      forceAdvanceSkip('Required fields missing (OptimHire blocked submission)');
    }

    try {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'local') return;
        if (changes.autoApplyState && changes.autoApplyState.newValue) {
          evaluate(changes.autoApplyState.newValue);
        }
      });
    } catch (_) {}
    /* Poll too, in case a storage-change event is missed or the state
       lingers without re-writing. */
    setInterval(function () {
      try {
        chrome.storage.local.get(['autoApplyState'], function (d) {
          if (d && d.autoApplyState) evaluate(d.autoApplyState);
        });
      } catch (_) {}
    }, 2_000);
  })();

  /* ── "Could not load page properly": retry once, then skip ────────────
   * When OptimHire cannot open a job page (the navigation throws, or its
   * content script never answers) it shows "Could not load page properly"
   * and simply stops — no countdown, no next job. The run then sat until a
   * watchdog noticed, 4–6 minutes later, 7 times in one run. Now: retry the
   * job once (OptimHire's own Retry), and skip it if that fails too. */
  (function installPageLoadFailRecovery() {
    var FAIL_RE = /could not (load page properly|establish connection)/i;
    var STABLE_MS = 2500;
    var _key = '', _since = 0, _acted = {};

    function evaluate(st) {
      if (!st || st.isActive === false || st.applicationState !== 'error' || !FAIL_RE.test(String(st.statusMessage || ''))) {
        _key = ''; return;
      }
      var ad = st.applicationDetails || {};
      var job = String(ad.copilot_job_id || (ad.source && ad.source.apply_now_url) || '');
      var key = job + '|' + st.statusMessage;
      var now = Date.now();
      if (key !== _key) { _key = key; _since = now; return; }
      if (now - _since < STABLE_MS) return;
      _key = '';
      var tries = _acted[job] || 0;
      _acted[job] = tries + 1;
      if (tries === 0 && !/after retry/i.test(st.statusMessage)) {
        addLog('Job page did not load — retrying it', '');
        Promise.resolve(chrome.runtime.sendMessage({ type: 'AUTO_APPLY_RETRY' })).catch(function () {});
      } else if (tries <= 1) {
        forceAdvanceSkip('Job page would not load');
      }
    }
    try {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area === 'local' && changes.autoApplyState) evaluate(changes.autoApplyState.newValue);
      });
    } catch (_) {}
    setInterval(function () {
      try { chrome.storage.local.get(['autoApplyState'], function (d) { evaluate(d && d.autoApplyState); }); } catch (_) {}
    }, 1_000);
  })();

  /* ── "All applications completed" auto-resume ─────────────────────────
   * After a single applied job, OptimHire's server sometimes returns
   * applicationState === "no-jobs" and the sidepanel shows
   * "All applications completed! No more matching jobs available at
   * this time." with a "Back to Main" button. The job pool refreshes
   * throughout the day, so we auto-click "Back to Main" to resume the
   * search instead of stalling. Debounced so it can't loop.
   * ─────────────────────────────────────────────────────────────────── */
  (function autoResumeOnNoJobs() {
    var _lastClickTs = 0;
    var COOLDOWN_MS = 30_000;
    var _queueActive = false;
    try {
      chrome.storage.local.get(['ohJobQueueActive'], function (d) { _queueActive = !!(d && d.ohJobQueueActive); });
      chrome.storage.onChanged.addListener(function (c, a) {
        if (a === 'local' && c.ohJobQueueActive) _queueActive = !!c.ohJobQueueActive.newValue;
      });
    } catch (_) {}
    function tick() {
      try {
        if (_queueActive) return; // CSV queue owns automation — don't resume native search
        var bodyText = (document.body && document.body.innerText || '').toLowerCase();
        if (bodyText.indexOf('all applications completed') === -1 &&
            bodyText.indexOf('no more matching jobs') === -1) return;
        if (Date.now() - _lastClickTs < COOLDOWN_MS) return;
        var btns = document.querySelectorAll('button,[role="button"]');
        for (var i = 0; i < btns.length; i++) {
          var b = btns[i];
          if (!b || b.disabled) continue;
          var r = b.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          var t = ((b.innerText || b.textContent || '') + '').replace(/\s+/g, ' ').trim();
          if (/^back\s+to\s+main$/i.test(t)) {
            _lastClickTs = Date.now();
            try { b.click(); } catch (_) {}
            addLog('All-applications-completed: clicked Back to Main to resume', '');
            return;
          }
        }
      } catch (_) {}
    }
    setInterval(tick, 3000);
  })();

  /* ── Engagement freshness + master switch (sidepanel side) ───────────
   * Mirrors the content script. ohAutoApplyEngaged used to be permanent,
   * so simply opening the side panel resurrected an old run and started
   * firing at jobs unprompted. It now only counts while its heartbeat is
   * fresh, a genuinely running session always counts, and
   * ohAutomationDisabled vetoes everything.
   * ────────────────────────────────────────────────────────────────── */
  var OH_ENGAGE_TTL_MS = 10 * 60 * 1000;
  var OH_AUTOMATION_KEYS = ['autoApplyState', 'isAutoProcessStartJob', 'isManuallyStartJob', 'ohJobQueueActive',
                            'ohAutoApplyEngaged', 'ohAutoApplyEngagedTs', 'ohAutomationDisabled'];
  /* isManuallyStartJob = OptimHire's one-job-at-a-time mode ("Start
     Manually Applying"). It is a real run too: it loads job after job and
     only stops at "Review and submit the form" waiting for a click — which
     we now make for it. */
  function ohLiveSession(d) {
    if (!d) return false;
    var st = d.autoApplyState;
    return !!(st && st.isActive === true) || !!d.isAutoProcessStartJob ||
           !!d.isManuallyStartJob || !!d.ohJobQueueActive;
  }
  function mayAutomateSP(d) {
    if (!d) return false;
    if (d.ohAutomationDisabled === true) return false;
    if (ohLiveSession(d)) return true;
    if (d.ohAutoApplyEngaged) {
      var ts = d.ohAutoApplyEngagedTs || 0;
      if (ts && Date.now() - ts < OH_ENGAGE_TTL_MS) return true;
    }
    return false;
  }
  /* Fresh panel open with nothing actually running must NOT resume a
     previous run — this was the "click the extension and it starts
     applying to old jobs" complaint. */
  try {
    chrome.storage.local.get(OH_AUTOMATION_KEYS, function (d) {
      try {
        if (!ohLiveSession(d) && d && d.ohAutoApplyEngaged) {
          chrome.storage.local.set({ ohAutoApplyEngaged: false, ohAutoApplyEngagedTs: 0 });
          addLog('Idle on open — previous auto-apply session cleared (press Start to run)', '');
        }
      } catch (_) {}
    });
  } catch (_) {}
  /* Heartbeat: keep sticky engagement alive only while really running. */
  setInterval(function () {
    try {
      chrome.storage.local.get(OH_AUTOMATION_KEYS, function (d) {
        if (ohLiveSession(d) && d.ohAutomationDisabled !== true) {
          chrome.storage.local.set({ ohAutoApplyEngaged: true, ohAutoApplyEngagedTs: Date.now() });
        }
      });
    } catch (_) {}
  }, 20000);

  /* ── Auto-press the sidebar's "Apply" (thumbs-up) ────────────────────
   * OptimHire shows a per-job Skip / Apply choice and waits for a human
   * click, which stalls a hands-off run. The user asked for zero manual
   * effort, so press Apply automatically.
   *
   * Deliberately conservative:
   *   - only while an auto-apply session is genuinely running,
   *   - only the button whose own label is exactly "Apply" (never
   *     "Apply Now" in the cover-letter modal — the content script's T40
   *     owns that — and never "Skip"),
   *   - never within the submit-suppression window,
   *   - one click per job (tracked by the rendered job title) plus a
   *     cooldown, so a re-render can't produce a burst of clicks.
   * ─────────────────────────────────────────────────────────────────── */
  (function installAutoApplyClicker() {
    var COOLDOWN_MS = 2000;         // was 4s — one press per job is still enforced below
    var NOKEY_COOLDOWN_MS = 20000;  // much slower when we can't identify the job
    var MAX_PER_MIN = 6;            // hard ceiling on presses per minute
    var NO_KEY = ' nokey';
    var _lastClickTs = 0;
    var _lastJobKey = '';
    var _recent = [];
    var _clickedBtns = (typeof WeakSet !== 'undefined') ? new WeakSet() : { has: function(){return false;}, add: function(){} };

    function currentJobKey() {
      try {
        var h = document.querySelector('h1,h2');
        var t = h ? (h.innerText || h.textContent || '').trim() : '';
        return t.slice(0, 120);
      } catch (_) { return ''; }
    }

    function findApplyButton() {
      var els = document.querySelectorAll('button,[role="button"]');
      for (var i = 0; i < els.length; i++) {
        var b = els[i];
        if (!b || b.disabled) continue;
        if (b.id === 'aapBtnSkip') continue;          // our own panel
        var r = b.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        var t = ((b.innerText || b.textContent || '') + '')
                  .replace(/\s+/g, ' ').trim();
        /* The button is icon-first markup:
             <button><span><img alt=""></span><span>Apply</span></button>
           so fall back to aria-label/title when the text is empty (e.g.
           the label has not painted yet). */
        if (!t && b.getAttribute) {
          t = ((b.getAttribute('aria-label') || b.getAttribute('title')) || '').trim();
        }
        if (/skip/i.test((b.className || '') + ' ' + t)) continue;  // never the Skip twin
        if (/^apply$/i.test(t)) return b;             // exact label only
      }
      return null;
    }

    function tick() {
      try {
        if (isSubmitSuppressed()) return;
        if (Date.now() - _lastClickTs < COOLDOWN_MS) return;
        chrome.storage.local.get(
          OH_AUTOMATION_KEYS,
          function (d) {
            try {
              if (!mayAutomateSP(d)) return;          // idle / disabled → never click
              var btn = findApplyButton();
              if (!btn) return;
              var key = currentJobKey();
              /* Dedupe. The old guard was `if (key && key === _lastJobKey)`,
                 which SKIPPED the check entirely whenever the key was
                 empty (no h1/h2 rendered yet) — so Apply was re-pressed
                 every cooldown, producing the repeated "Auto-pressed
                 Apply" bursts. Dedupe on the button ELEMENT as well, so
                 the same node is never clicked twice regardless of the
                 key, and rate-cap the whole thing. */
              if (_clickedBtns.has(btn)) return;
              if (key && key === _lastJobKey) return;   // same job again
              if (!key && _lastJobKey === NO_KEY && Date.now() - _lastClickTs < NOKEY_COOLDOWN_MS) return;
              /* Hard rate cap: never more than MAX_PER_MIN presses a
                 minute, whatever the DOM does. */
              var now = Date.now();
              _recent = _recent.filter(function (t) { return now - t < 60_000; });
              if (_recent.length >= MAX_PER_MIN) return;
              _recent.push(now);
              _clickedBtns.add(btn);
              _lastJobKey = key || NO_KEY;
              _lastClickTs = now;
              /* Started by the automation → "ATS first, Reed last" applies. */
              try { chrome.storage.local.set({ ohAutoPressTs: now }); } catch (_) {}
              try {
                btn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                btn.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true }));
                btn.click();
              } catch (_) { try { btn.click(); } catch (__) {} }
              addLog('Auto-pressed Apply' + (key ? ' — ' + key : ''), 'success');
            } catch (_) {}
          }
        );
      } catch (_) {}
    }
    setInterval(tick, 1200);
  })();

  /* Relay the on-demand fill's progress into the status log. */
  try {
    chrome.runtime.onMessage.addListener(function (msg) {
      if (!msg || msg.type !== 'OH_MANUAL_FILL_STATUS') return;
      if (msg.state === 'start') addLog('Autofill this page: started', '');
      else if (msg.state === 'done') addLog('Autofill this page: finished', 'success');
      else if (msg.state === 'error') addLog('Autofill this page: failed', 'error');
    });
  } catch (_) {}

  /* ── Unlock 2.8.2's own "Autofill Application" button ────────────────
   * 2.8.2 added an on-demand autofill but put it behind a lock icon and
   * an unlock/upgrade modal. Strip the disabled state and hide the lock
   * so it behaves like the rest of the unrestricted build. Our own
   * "Autofill this page" button stays as the reliable path since it runs
   * our fill engine. */
  (function unlockAutofillApplication() {
    function tick() {
      try {
        var btns = document.querySelectorAll('button,[role="button"]');
        for (var i = 0; i < btns.length; i++) {
          var b = btns[i];
          var t = ((b.innerText || b.textContent || '') + '').replace(/\s+/g, ' ').trim();
          if (!/^autofill application$/i.test(t)) continue;
          if (b.disabled) { try { b.disabled = false; } catch (_) {} }
          b.removeAttribute && b.removeAttribute('aria-disabled');
          if (b.className && /disabled:opacity|cursor-not-allowed/.test(b.className)) {
            b.style.setProperty('opacity', '1', 'important');
            b.style.setProperty('cursor', 'pointer', 'important');
          }
          var lock = b.querySelector('img[alt="lock" i],img[src*="lock" i]');
          if (lock) lock.style.setProperty('display', 'none', 'important');
        }
      } catch (_) {}
    }
    /* Native timer: this button is for MANUAL use, i.e. exactly when no
       automation is running — through the idle governor it stayed locked
       in the only situation where anyone would click it. */
    _spNativeSetInterval(tick, 3000);
  })();

  /* ── "Loading your Job" stall watchdog ───────────────────────────────
   * OptimHire sometimes never resolves this spinner (its fetch for the
   * next job fails silently), leaving the run stuck forever. Nothing else
   * recovers it: the generic stuck-watchdog keys off job/URL changes,
   * and this screen has neither.
   *
   * If the spinner is continuously present for STALL_MS while a session
   * is engaged, escalate: first a real Skip (which advances OptimHire to
   * the next job), then, if it is STILL stuck, a "Back to Main" to force
   * a fresh batch. Rate-limited so it can never loop.
   * ─────────────────────────────────────────────────────────────────── */
  (function installLoadingStallWatchdog() {
    var STALL_MS = 50_000;        // last resort: the service worker releases a stuck page load within 25 s (oh-bg.js 14)
    var COOLDOWN_MS = 60_000;     // min gap between recovery attempts
    var LOADING_RE = /loading your job|loading job|fetching your job/i;
    var _since = 0, _lastRecoveryTs = 0, _escalated = false;

    function spinnerVisible() {
      try {
        var t = (document.body && document.body.innerText || '').slice(0, 3000);
        return LOADING_RE.test(t);
      } catch (_) { return false; }
    }
    function clickBackToMain() {
      var btns = document.querySelectorAll('button,[role="button"],a');
      for (var i = 0; i < btns.length; i++) {
        var b = btns[i];
        if (!b) continue;
        var r = b.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        var t = ((b.innerText || b.textContent || '') + '').replace(/\s+/g, ' ').trim();
        if (/^back to main$/i.test(t)) { try { b.click(); return true; } catch (_) {} }
      }
      return false;
    }

    function tick() {
      try {
        if (!spinnerVisible()) { _since = 0; _escalated = false; return; }
        var now = Date.now();
        if (!_since) { _since = now; return; }
        if (now - _since < STALL_MS) return;
        if (now - _lastRecoveryTs < COOLDOWN_MS) return;
        chrome.storage.local.get(
          OH_AUTOMATION_KEYS,
          function (d) {
            try {
              if (!mayAutomateSP(d)) return;   // idle / disabled — leave the UI alone
              _lastRecoveryTs = Date.now();
              if (!_escalated) {
                _escalated = true;
                addLog('Stuck on "Loading your Job" for ' + Math.round(STALL_MS / 1000) +
                       's — skipping to the next job', '');
                forceAdvanceSkip('Loading-your-Job stall');
              } else {
                addLog('Still stuck on "Loading your Job" — returning to main for a fresh batch', '');
                if (!clickBackToMain()) forceAdvanceSkip('Loading-your-Job stall (retry)');
                _escalated = false;
              }
              _since = 0;
            } catch (_) {}
          }
        );
      } catch (_) {}
    }
    setInterval(tick, 5000);
  })();

  /* ── Keep Auto-Apply running until genuinely complete ────────────────
   * OptimHire's session ends on its own after a few applies (a 404'd
   * job, a transient backend error, etc.) and reverts to the start
   * screen "We found N matching jobs. Let's start applying." The user
   * wants it to KEEP GOING until everything is actually applied — not
   * end early. So we hold a persistent "engaged" flag and re-click
   * Start Auto-Applying whenever the session has stopped but isn't truly
   * complete.
   *
   * Engaged is set TRUE when the user starts (or whenever OH reports it
   * running) and only cleared when the user clicks Stop. While engaged:
   *   - if OH is running → do nothing (let it work),
   *   - if OH stopped but the start screen is showing (jobs remain) →
   *     click Start Auto-Applying to resume,
   *   - genuine completion ("All applications completed", no jobs) shows
   *     a different screen with no Start button, so we naturally idle
   *     there while the Back-to-Main watcher re-searches for new jobs.
   * No time window — it persists until the user explicitly Stops.
   * ─────────────────────────────────────────────────────────────────── */
  (function installAutoApplyResume() {
    var KEY_ENGAGED = 'ohAutoApplyEngaged';
    var COOLDOWN_MS = 20_000;       // was 60s — resume a stopped run faster
    var _lastResumeTs = 0;
    var _engaged = false;

    chrome.storage.local.get([KEY_ENGAGED], function (d) {
      _engaged = !!(d && d[KEY_ENGAGED]);
    });
    /* Stay in sync with storage. Previously this cached the value once at
       load, so when the master switch, a fresh-open reset or the content
       script cleared engagement, this loop kept its stale "engaged" and could
       press "Start Auto-Applying" on its own (e.g. right after automation was
       switched back on). */
    try {
      chrome.storage.onChanged.addListener(function (c, a) {
        if (a === 'local' && c[KEY_ENGAGED]) _engaged = !!c[KEY_ENGAGED].newValue;
      });
    } catch (_) {}
    function setEngaged(v) {
      if (_engaged === v) return;
      _engaged = v;
      /* Stamp the heartbeat so sticky engagement can expire on its own. */
      try { chrome.storage.local.set({ [KEY_ENGAGED]: v, ohAutoApplyEngagedTs: v ? Date.now() : 0 }); } catch (_) {}
    }

    function btnText(b) {
      return ((b && (b.innerText || b.textContent) || '') + '').replace(/\s+/g, ' ').trim();
    }
    function isStartButton(b) { return /^start\s+auto[-\s]?applying$/i.test(btnText(b)); }
    function isStopButton(b)  { return /^stop$/i.test(btnText(b)); }

    /* Capture-phase so we record intent before React acts. */
    document.addEventListener('click', function (e) {
      try {
        var b = e.target && (e.target.closest && e.target.closest('button,[role="button"]'));
        if (!b) return;
        if (isStartButton(b)) setEngaged(true);   // user started → stay engaged
        else if (isStopButton(b)) {                  // user stopped → disengage
          setEngaged(false);
          releaseJobTab('stopped');
        }
      } catch (_) {}
    }, true);

    function findStartButton() {
      var btns = document.querySelectorAll('button,[role="button"]');
      for (var i = 0; i < btns.length; i++) {
        var b = btns[i];
        if (!b || b.disabled) continue;
        var r = b.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (isStartButton(b)) return b;
      }
      return null;
    }

    function tick() {
      try {
        chrome.storage.local.get(
          ['isAutoProcessStartJob', 'isManuallyStartJob', 'autoApplyStateUpdate', 'ohJobQueueActive', 'ohAutomationDisabled'],
          function (d) {
            try {
              if (d.ohAutomationDisabled === true) return;   // master switch OFF
              /* MUTUAL EXCLUSION: while the CSV Job Queue is running, do
                 NOT re-engage OptimHire's native auto-apply. Running both
                 at once made the native flow navigate/reload the queue's
                 job tab in a loop and stopped the queue's autofill from
                 ever firing. The queue owns the tabs while it's active. */
              if (d.ohJobQueueActive) return;
              var running = !!d.isAutoProcessStartJob || !!d.isManuallyStartJob ||
                            (d.autoApplyStateUpdate && d.autoApplyStateUpdate.isRunning);
              if (running) { setEngaged(true); return; } // running → engaged, let it work
              if (!_engaged) return;                     // never started / user stopped
              if (Date.now() - _lastResumeTs < COOLDOWN_MS) return;
              var btn = findStartButton();
              if (!btn) return;                          // not on the start screen → idle
              _lastResumeTs = Date.now();
              try { btn.click(); } catch (_) {}
              if (typeof addLog === 'function') {
                addLog('Auto-resume: session stopped early — clicked Start Auto-Applying', '');
              }
            } catch (_) {}
          }
        );
      } catch (_) {}
    }
    setInterval(tick, 5000);
  })();

  /* ── "Review and submit the form" → the job tab submits it ───────────
   * OptimHire fills the form, then parks on "Review and submit the form"
   * waiting for a human to press the site's submit button (in its
   * one-job-at-a-time mode this happens on EVERY job, and on job boards
   * like Reed the application is still behind an "Apply now" button).
   * That state exists only here in the panel — the job page cannot see
   * it — so the moment it appears we tell the job tab, and only the job
   * tab, to finish the application (optimhire-patch.js
   * installReviewAndSubmit). Event-driven: no waiting on a poll. */
  (function installReviewSubmitRelay() {
    var RE = /review and submit the form/i;
    var _lastSend = 0;
    var _lastText = '', _lastBeat = 0;
    function check() {
      try {
        var root = document.getElementById('__plasmo') || document.body;
        var text = root ? (root.innerText || '') : '';
        /* Heartbeat: OptimHire's panel changing ("Fetching your answers",
           "Filling your answers"…) means it is working — the job tab's
           watchdogs must not call that "stuck". */
        if (text !== _lastText) {
          _lastText = text;
          if (Date.now() - _lastBeat > 5000) {
            _lastBeat = Date.now();
            try { chrome.storage.local.set({ ohPanelActivityTs: _lastBeat }); } catch (_) {}
          }
        }
        if (Date.now() - _lastSend < 1500) return;
        if (!root || !RE.test(text)) return;
        chrome.storage.local.get(OH_AUTOMATION_KEYS.concat(['copilotTabId']), function (d) {
          try {
            if (!mayAutomateSP(d)) return;
            var tab = _jobTabPin != null ? _jobTabPin : d.copilotTabId;
            if (tab == null) return;
            _lastSend = Date.now();
            Promise.resolve(chrome.tabs.sendMessage(tab, { type: 'OH_REVIEW_AND_SUBMIT' })).catch(function () {});
          } catch (_) {}
        });
      } catch (_) {}
    }
    var mo = new MutationObserver(check);
    function start() { mo.observe(document.body, { childList: true, subtree: true, characterData: true }); }
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
    setInterval(check, 3000);
  })();

  /* ── OptimHire's own "Autofill this application" stops at missing fields ──
   * Used on a page you are applying to yourself, it fills what its answers
   * cover and then stops with "Please fill the missing fields and submit
   * the form" / "5 out of 6 required fields filled". The moment that shows,
   * our filler is run on the page you are looking at to finish the rest —
   * on Workday the Workday engine, for that step only — once per page.
   * Never during a run (the job tab has its own handling) and never with
   * automation switched off. */
  (function installFinishOptimHireFill() {
    var RE = /please fill (in )?the missing|\b\d+\s+out of\s+\d+\s+required fields? filled/i;
    var _doneFor = {};
    function check() {
      try {
        var root = document.getElementById('__plasmo') || document.body;
        var text = root ? (root.innerText || '') : '';
        if (!RE.test(text)) return;
        chrome.storage.local.get(OH_AUTOMATION_KEYS.concat(['ohAutomationDisabled']), function (d) {
          try {
            if (d && d.ohAutomationDisabled === true) return;
            if (d && (d.isAutoProcessStartJob || d.ohJobQueueActive)) return;
            realActiveTabs({ active: true, currentWindow: true }, function (tabs) {
              var t = tabs && tabs[0];
              if (!t || t.id == null || /^chrome(-extension)?:\/\//i.test(t.url || '')) return;
              var key = t.id + '|' + (t.url || '');
              if (_doneFor[key] && Date.now() - _doneFor[key] < 60000) return;
              _doneFor[key] = Date.now();
              addLog('OptimHire left required fields empty — finishing them', '');
              Promise.resolve(chrome.tabs.sendMessage(t.id, { type: 'OH_AUTOFILL_THIS_PAGE', submit: false, pageOnly: true })).catch(function () {});
            });
          } catch (_) {}
        });
      } catch (_) {}
    }
    /* The native observer on purpose: the shadowed one is off while no run is
       going — which is exactly when you use OptimHire's autofill yourself. */
    var mo = new _SpNativeMO(function () { clearTimeout(check._t); check._t = setTimeout(check, 400); });
    function start() { mo.observe(document.body, { childList: true, subtree: true, characterData: true }); }
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  })();

  /* (A second, cooldown-less missing-details handler and its helpers used
   * to live here. It shadowed the countdown handler above via function
   * hoisting and caused back-to-back skips; it and its now-unused helpers
   * have been removed. The countdown handler above is the only one.) */

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
      cardForm(false);
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
      cardForm(false);
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

  /* ════════════════════════════════════════════════════════════
     THROUGHPUT + ETA + STALL AUTO-RECOVERY
     ════════════════════════════════════════════════════════════
     For unattended 2000-job runs: show live apply rate (jobs/hr)
     and ETA for the remaining queue, and if progress silently
     stalls (applied count flat for STALL_MS while running) nudge
     the queue with a skipCurrent so an overnight run can't get
     stuck on one bad job and waste hours.
     ────────────────────────────────────────────────────────── */
  (function installThroughputMonitor() {
    var STALL_MS       = 120000; // 2 min of no progress while running = stalled
    var NUDGE_COOLDOWN = 30000;  // wait 30s between recovery nudges
    var RATE_WINDOW_MS = 600000; // compute rate over the last 10 min
    var TICK_MS        = 5000;

    var _samples = [];        // [{t, done}]
    var _lastDone = -1;
    var _lastProgressTs = Date.now();
    var _lastNudgeTs = 0;
    var _statsEl = null;

    /* Build / locate the stats line just under the counter. Created
       once; lives inside our own #oh-aap panel so it never touches
       the React tree. */
    function ensureStatsEl() {
      if (_statsEl && document.body.contains(_statsEl)) return _statsEl;
      var counterEl = document.getElementById('aapCounter');
      var host = counterEl && counterEl.parentElement;
      if (!host) return null;
      _statsEl = document.createElement('div');
      _statsEl.id = 'oh-throughput';
      _statsEl.style.cssText =
        'font-size:11px;color:#94a3b8;margin-top:2px;width:100%;' +
        'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;';
      /* insert after the header-left group so it sits below the counter */
      var headerLeft = counterEl.closest('.aap-header-left') || host;
      if (headerLeft.parentElement) {
        headerLeft.parentElement.insertBefore(_statsEl, headerLeft.nextSibling);
      } else {
        host.appendChild(_statsEl);
      }
      return _statsEl;
    }

    function fmtDuration(ms) {
      if (!isFinite(ms) || ms <= 0) return '—';
      var mins = Math.round(ms / 60000);
      if (mins < 60) return mins + 'm';
      var h = Math.floor(mins / 60), m = mins % 60;
      if (h < 24) return h + 'h ' + m + 'm';
      var d = Math.floor(h / 24); h = h % 24;
      return d + 'd ' + h + 'h';
    }

    function computeRatePerHour() {
      var now = Date.now();
      /* drop samples outside the window */
      while (_samples.length > 2 && now - _samples[0].t > RATE_WINDOW_MS) {
        _samples.shift();
      }
      if (_samples.length < 2) return 0;
      var first = _samples[0], last = _samples[_samples.length - 1];
      var dDone = last.done - first.done;
      var dMs = last.t - first.t;
      if (dDone <= 0 || dMs <= 0) return 0;
      return (dDone / dMs) * 3600000; // per hour
    }

    function tick() {
      try {
        if (!_isRunning) return;            // only while a run is active
        var done = _totalApplied;
        var total = _totalJobs;
        var now = Date.now();

        /* Record a sample when progress changes */
        if (done !== _lastDone) {
          _samples.push({ t: now, done: done });
          if (_samples.length > 40) _samples.shift();
          if (done > _lastDone) _lastProgressTs = now;
          _lastDone = done;
        }

        /* Render stats line */
        var el = ensureStatsEl();
        if (el) {
          var rate = computeRatePerHour();
          var remaining = Math.max(0, total - done);
          var etaMs = rate > 0 ? (remaining / rate) * 3600000 : Infinity;
          var stalledFor = now - _lastProgressTs;
          if (stalledFor >= STALL_MS && remaining > 0) {
            el.innerHTML = '<span style="color:#f59e0b">⚠ Stalled ' +
              fmtDuration(stalledFor) + ' — recovering…</span>';
          } else if (rate > 0) {
            el.textContent = Math.round(rate) + '/hr · ' +
              remaining + ' left · ETA ' + fmtDuration(etaMs);
          } else {
            el.textContent = remaining + ' left';
          }
        }

        /* Stall auto-recovery: applied count flat for STALL_MS while
           a run is active and there are jobs left → nudge the queue.
           Honour the submit-suppression window so we never interrupt
           a real submit, and cool down between nudges. */
        var remaining2 = Math.max(0, total - done);
        if (remaining2 > 0 &&
            (now - _lastProgressTs) >= STALL_MS &&
            (now - _lastNudgeTs) >= NUDGE_COOLDOWN &&
            !isSubmitSuppressed()) {
          _lastNudgeTs = now;
          addLog('Throughput monitor: no progress for ' +
                 fmtDuration(now - _lastProgressTs) + ' — nudging queue', '');
          sendOhSkip('no progress');
        }
      } catch (_) {}
    }

    setInterval(tick, TICK_MS);
  })();

  /* ════════════════════════════════════════════════════════════
     NATIVE AUTO-APPLY JOB-URL HARVESTER + EXPORT
     ════════════════════════════════════════════════════════════
     OptimHire's own auto-apply ("3 of 1984 applied") streams jobs one
     at a time from the server — there is no bulk "list all matching
     jobs" endpoint. So as each job loads, we record its URL from
     autoApplyState.applicationDetails into ohHarvestedJobs (keyed by
     copilot_job_id, deduped). The user can then export every job URL
     the queue has gone through — as a CSV that re-imports into the CSV
     Queue Manager, or a plain URL list.

     Each record: { id, applyUrl, ohUrl, title, company, location, ats,
                    firstSeen, lastSeen }
       applyUrl = source.apply_now_url — the REAL ATS application URL
                  OptimHire opens ("Opening job page: …").
       ohUrl    = https://optimhire.com/d/jv/{id}/?q=copilot-jobs — the
                  OptimHire job-view page.
     ────────────────────────────────────────────────────────── */
  var _runStartTs = 0;       // start of the current OptimHire run (set by the queue card)
  (function installNativeQueueHarvester() {
    var HK = 'ohHarvestedJobs';
    var OH_JOB_BASE = 'https://optimhire.com/d/jv/';
    var MAX = 6000;
    var _lastSig = '';   // skip redundant whole-map rewrites for the same job
    var _currentJobId = '';   // last job whose details we saw
    var _currentKey = '';

    /* Classify a job's TERMINAL outcome from OptimHire's own state.
       This is the honest answer to "was it actually submitted?":
         submitted → OptimHire reported a real confirmation
                     (applicationState 'completed' / 'Application submitted
                     successfully' / a confirmation phrase).
         skipped   → NOT submitted: required fields missing / submission
                     blocked / skipped.
         closed    → job posting closed / already applied / no form.
         error     → errored out.
       Returns {outcome, reason} or null when the job is still processing. */
    function classifyOutcome(st) {
      if (!st || typeof st !== 'object') return null;
      var state = String(st.applicationState || '').toLowerCase();
      var msg   = String(st.statusMessage || '');
      var err   = String(st.errorType || '');
      var lmsg  = msg.toLowerCase();
      if (state === 'completed' ||
          /application submitted successfully|your application (has been|was) (received|submitted)|thank you for applying|we('| ?ha)ve received your application|application (has been )?received|application successful/i.test(msg)) {
        return { outcome: 'submitted', reason: msg || 'confirmed' };
      }
      /* Jobs that can't be applied to at all. */
      if (/^(already-applied|redirect-to-company-site|page-error|form-not-found)$/.test(state)) {
        return { outcome: 'closed', reason: msg || state };
      }
      /* Unattended, nobody can sign in or solve a captcha. */
      if (state === 'login-required' || /login required/i.test(lmsg)) return { outcome: 'skipped', reason: 'site needs a login / account' };
      if (state === 'captcha-required' || /captcha/i.test(lmsg)) return { outcome: 'skipped', reason: 'captcha' };
      if (state === 'skipped' || err === 'missing-questions' || state === 'missing-questions' ||
          state === 'submission-error' || state === 'button-not-found' ||
          /required fields are missing|submission blocked|missing or invalid/i.test(lmsg)) {
        return { outcome: 'skipped', reason: msg || err || state || 'skipped' };
      }
      if (/no longer (open|available)|posting is closed|already applied|page not found|404|job closed/i.test(lmsg) ||
          state === 'job-closed') {
        return { outcome: 'closed', reason: msg || 'closed' };
      }
      if (state === 'error') return { outcome: 'error', reason: msg || err || 'error' };
      return null; // still in-progress / loading / fetching
    }

    function recordOutcome(st) {
      try {
        var cls = classifyOutcome(st);
        if (!cls || !_currentKey) return;
        chrome.storage.local.get([HK], function (store) {
          try {
            var map = (store && store[HK]) || {};
            var rec = map[_currentKey];
            if (!rec) return;
            /* Once a job is 'submitted' or 'closed', don't downgrade it to
               'skipped' from a later stray state for the same current job. */
            if (rec.outcome === 'submitted') return;
            if (rec.outcome === cls.outcome && rec.reason === cls.reason) return;
            var firstTime = rec.outcome !== cls.outcome;
            rec.outcome = cls.outcome;
            rec.reason = String(cls.reason).slice(0, 160);
            rec.outcomeTs = Date.now();
            map[_currentKey] = rec;
            var obj = {}; obj[HK] = map;
            chrome.storage.local.set(obj);
            if (firstTime && typeof addLog === 'function') {
              var label = (rec.title || rec.id || _currentKey);
              if (cls.outcome === 'submitted') addLog('✅ SUBMITTED (confirmed): ' + label, 'success');
              else if (cls.outcome === 'skipped') addLog('⏭️ SKIPPED — NOT submitted: ' + label + ' (' + rec.reason + ')', '');
              else if (cls.outcome === 'closed') addLog('🚫 CLOSED/already-applied — not submitted: ' + label, '');
              else if (cls.outcome === 'error') addLog('⚠️ ERROR — not submitted: ' + label, 'error');
            }
          } catch (_) {}
        });
      } catch (_) {}
    }

    function upsert(ad) {
      try {
        if (!ad || typeof ad !== 'object') return;
        var src = ad.source || {};
        var jid = ad.copilot_job_id || src.copilot_job_id;
        var applyUrl = src.apply_now_url || '';
        if (!jid && !applyUrl) return;            // nothing identifiable yet
        var key = String(jid || applyUrl);
        var prevKey = _currentKey;
        _currentJobId = String(jid || '');
        _currentKey = key;
        /* Only write when the identifying job actually changes, so we
           don't rewrite the full map every poll for the current job. */
        var sig = key + '|' + applyUrl + '|' + (src.job_title || '');
        if (sig === _lastSig) return;
        _lastSig = sig;
        chrome.storage.local.get([HK], function (store) {
          try {
            var map = (store && store[HK]) || {};
            /* The run moved on from the previous job without any outcome
               (a skip, a timeout) — it was NOT submitted; count it so. */
            var prev = prevKey && prevKey !== key ? map[prevKey] : null;
            if (prev && prev.outcome === 'pending') {
              prev.outcome = 'skipped';
              prev.reason = 'moved on without a confirmation' + (_lastStatus ? ' (last: ' + _lastStatus + ')' : '');
              prev.outcomeTs = Date.now();
            }
            if (prevKey !== key) _lastStatus = '';
            var rec = map[key] || { id: String(jid || ''), firstSeen: Date.now(), outcome: 'pending' };
            /* Seen again in a new run: its old outcome belongs to that run. */
            if (map[key] && (rec.lastSeen || 0) < (_runStartTs || 0)) {
              rec.outcome = 'pending'; rec.reason = ''; rec.outcomeTs = 0;
            }
            if (applyUrl) rec.applyUrl = applyUrl;
            if (jid) rec.ohUrl = OH_JOB_BASE + jid + '/?q=copilot-jobs';
            if (src.job_title) rec.title = src.job_title;
            if (src.company_name) rec.company = src.company_name;
            var loc = [src.job_location, src.country].filter(Boolean).join(', ');
            if (loc) rec.location = loc;
            if (ad.ats_name) rec.ats = ad.ats_name;
            rec.lastSeen = Date.now();
            map[key] = rec;
            /* Cap: drop oldest by firstSeen if we somehow exceed MAX. */
            var keys = Object.keys(map);
            if (keys.length > MAX) {
              keys.sort(function (a, b) { return (map[a].firstSeen || 0) - (map[b].firstSeen || 0); });
              delete map[keys[0]];
            }
            var obj = {}; obj[HK] = map;
            chrome.storage.local.set(obj);
          } catch (_) {}
        });
      } catch (_) {}
    }

    var _lastStatus = '';   // what OptimHire was last doing on the current job
    function onState(st) {
      if (!st) return;
      upsert(st.applicationDetails);
      if (st.statusMessage) _lastStatus = String(st.statusMessage).slice(0, 80);
      recordOutcome(st);
    }

    try {
      chrome.storage.onChanged.addListener(function (c, a) {
        if (a !== 'local') return;
        if (c.autoApplyState && c.autoApplyState.newValue) onState(c.autoApplyState.newValue);
        /* One-job-at-a-time mode keeps its current job here instead. */
        if (c.manualApplicationDetail && c.manualApplicationDetail.newValue) upsert(c.manualApplicationDetail.newValue);
      });
    } catch (_) {}
    /* One-job-at-a-time mode reports progress only as messages to this panel. */
    try {
      chrome.runtime.onMessage.addListener(function (msg) {
        if (!msg || msg.type !== 'MANUALLY_APPLY_STATE_UPDATE') return;
        if (msg.applicationDetails && msg.applicationDetails.source) upsert(msg.applicationDetails);
        if (msg.manuallyApplyState) {
          if (msg.manuallyApplyState.statusMessage) _lastStatus = String(msg.manuallyApplyState.statusMessage).slice(0, 80);
          recordOutcome(msg.manuallyApplyState);
        }
        if (msg.checkStatusMessage) _lastStatus = String(msg.checkStatusMessage).slice(0, 80);
        if (msg.isManualSubmited) recordOutcome({ applicationState: 'completed', statusMessage: 'Application submitted successfully' });
      });
    } catch (_) {}
    /* Poll too — covers a missed change event or a lingering state. */
    setInterval(function () {
      try {
        chrome.storage.local.get(['autoApplyState', 'isManuallyStartJob', 'manualApplicationDetail'], function (d) {
          if (d && d.autoApplyState) onState(d.autoApplyState);
          else if (d && d.isManuallyStartJob && d.manualApplicationDetail) upsert(d.manualApplicationDetail);
        });
      } catch (_) {}
    }, 3000);
  })();

  /* CSV-escape a single field. */
  function _csvCell(s) {
    var v = String(s == null ? '' : s);
    /* Neutralise spreadsheet formulas: a harvested job title such as
       =HYPERLINK(...) would otherwise execute when the CSV is opened in
       Excel / Sheets. */
    if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
    if (/[",\r\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
    return v;
  }
  function _download(name, text, mime) {
    try {
      var blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { try { URL.revokeObjectURL(a.href); } catch (_) {} }, 1500);
    } catch (_) {}
  }

  /* Export every harvested native-queue job. Downloads BOTH a CSV
     (url,title,company,notes — re-importable into the Queue Manager)
     and a plain .txt URL list. Prefers the real ATS apply URL, falling
     back to the OptimHire job-view URL. */
  /* Every job OptimHire's queue has handed out so far, as ONE formatted CSV:
     numbered, readable headers, the full application link of each job, its
     OptimHire page and id, what happened (submitted / skipped / closed…) and
     when. UTF-8 with a BOM and CRLF rows, so Excel and Google Sheets open it
     cleanly; re-importable into the Queue Manager (the "Job URL" column).
     OptimHire's server gives the extension its queue one job at a time, so
     the jobs still ahead in the queue are not known yet — the file grows as
     the run goes on. */
  function exportHarvestedJobs() {
    try {
      chrome.storage.local.get(['ohHarvestedJobs', 'matchingJobCount', 'ohRunStats'], function (d) {
        var map = (d && d.ohHarvestedJobs) || {};
        var rows = [];
        for (var k in map) if (Object.prototype.hasOwnProperty.call(map, k) && map[k] && (map[k].applyUrl || map[k].ohUrl)) rows.push(map[k]);
        if (!rows.length) {
          try { addLog('No queue jobs recorded yet — start Auto-Apply first, then export', ''); } catch (_) {}
          try { alert('No queue jobs recorded yet.\n\nStart Auto-Applying (or run the CSV queue); each job that loads is recorded, then Export.'); } catch (_) {}
          return;
        }
        rows.sort(function (a, b) { return (a.firstSeen || 0) - (b.firstSeen || 0); });
        var pad = function (n) { return (n < 10 ? '0' : '') + n; };
        var when = function (ts) {
          if (!ts) return '';
          var t = new Date(ts);
          return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate()) + ' ' + pad(t.getHours()) + ':' + pad(t.getMinutes());
        };
        var STATUS = { submitted: 'Submitted (confirmed)', skipped: 'Skipped (not submitted)', closed: 'Job closed', error: 'Error', pending: 'In progress / not finished' };
        var cols = ['#', 'Job Title', 'Company', 'Location', 'ATS', 'Job URL', 'OptimHire Job Page', 'OptimHire Job ID', 'Status', 'Reason', 'First Seen', 'Last Updated'];
        var lines = [cols.map(_csvCell).join(',')];
        var tally = { submitted: 0, skipped: 0, closed: 0, error: 0, pending: 0 };
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i];
          var oc = r.outcome || 'pending';
          tally[oc] = (tally[oc] || 0) + 1;
          lines.push([
            String(i + 1), r.title, r.company, r.location, r.ats, r.applyUrl || r.ohUrl, r.applyUrl ? (r.ohUrl || '') : '', r.id,
            STATUS[oc] || oc, r.reason, when(r.firstSeen), when(r.outcomeTs || r.lastSeen)
          ].map(_csvCell).join(','));
        }
        var stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
        _download('optimhire-queue-jobs-' + stamp + '.csv', '﻿' + lines.join('\r\n') + '\r\n', 'text/csv');
        var run = d && d.ohRunStats && d.ohRunStats.summary;
        var total = (run && run.total) || parseInt(d && d.matchingJobCount, 10) || 0;
        var summary = 'Exported ' + rows.length + ' job' + (rows.length === 1 ? '' : 's') + (total > rows.length ? ' of the ' + total + ' in the queue' : '') +
          ' — ' + tally.submitted + ' submitted, ' + tally.skipped + ' skipped, ' + tally.closed + ' closed, ' + tally.error + ' errors, ' + tally.pending + ' in progress';
        try { addLog(summary, tally.submitted ? 'success' : ''); } catch (_) {}
        try {
          alert(summary + '\n\nOne CSV file downloaded (opens in Excel / Google Sheets; re-importable into the Queue Manager).' +
                (total > rows.length ? '\n\nOptimHire\'s server hands its queue to the extension one job at a time, so the ' + (total - rows.length) +
                 ' jobs still ahead are not known to the extension yet. Each job is added as OptimHire gives it out — export again later for more.' : ''));
        } catch (_) {}
      });
    } catch (_) {}
  }

  /* ════════════════════════════════════════════════════════════
     CSV JOB QUEUE — sidepanel card
     ════════════════════════════════════════════════════════════
     Lives in the otherwise-empty sidepanel space and surfaces the
     queue's live status. Opens the full Queue Manager in a new tab.
     ────────────────────────────────────────────────────────── */
  /* The Job Queue card's look: one dark surface, one accent, a clear
     primary action, real switches, quiet secondary text. */
  var QC_CSS = [
    '#oh-queue-card{--qc-bg:#12141c;--qc-raise:#1a1d27;--qc-line:#262a36;--qc-text:#e6e8ef;--qc-muted:#8b91a3;',
    '--qc-accent:#6d5efc;--qc-accent-2:#5a4bea;--qc-ok:#3ecf8e;--qc-warn:#f5b44a;--qc-bad:#f26d6d;',
    'position:fixed;bottom:10px;left:10px;right:10px;z-index:2147483646;box-sizing:border-box;padding:14px;',
    'max-height:calc(100vh - 20px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;',
    'background:var(--qc-bg);border:1px solid var(--qc-line);border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.45);',
    'font:12px/1.4 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--qc-text);-webkit-font-smoothing:antialiased}',
    '#oh-queue-card *{box-sizing:border-box}',
    '#oh-queue-card button{font:inherit;color:inherit;margin:0}',
    '#oh-queue-card svg{width:14px;height:14px;flex:none}',
    '#oh-queue-card .qc-head{display:flex;align-items:center;gap:8px;margin-bottom:12px}',
    '#oh-queue-card .qc-title{font-size:13.5px;font-weight:650;letter-spacing:.1px;flex:1}',
    '#oh-queue-card .qc-chip{display:inline-flex;align-items:center;gap:6px;padding:2px 9px;border-radius:999px;font-size:10.5px;font-weight:600;color:var(--qc-ok);background:rgba(62,207,142,.12)}',
    '#oh-queue-card .qc-chip i{width:6px;height:6px;border-radius:50%;background:currentColor;animation:qcPulse 1.6s ease-in-out infinite}',
    '@keyframes qcPulse{50%{opacity:.35}}',
    '#oh-queue-card .qc-icon{display:grid;place-items:center;width:24px;height:24px;border:0;border-radius:7px;background:transparent;color:var(--qc-muted);cursor:pointer}',
    '#oh-queue-card .qc-icon:hover{background:var(--qc-raise);color:var(--qc-text)}',
    '#oh-queue-card .qc-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}',
    '#oh-queue-card .qc-stat{padding:9px 10px;border:1px solid var(--qc-line);border-radius:10px;background:var(--qc-raise)}',
    '#oh-queue-card .qc-stat b{display:block;font-size:17px;font-weight:650;font-variant-numeric:tabular-nums;line-height:1.15}',
    '#oh-queue-card .qc-stat span{font-size:10.5px;color:var(--qc-muted)}',
    '#oh-queue-card .qc-ok b{color:var(--qc-ok)} #oh-queue-card .qc-bad b{color:var(--qc-bad)}',
    '#oh-queue-card .qc-live{margin-bottom:12px;padding:10px;border:1px solid var(--qc-line);border-radius:10px;background:var(--qc-raise)}',
    '#oh-queue-card .qc-live-top{display:flex;align-items:flex-start;gap:8px}',
    '#oh-queue-card .qc-now{flex:1;min-width:0;font-size:11.5px;line-height:1.45;color:var(--qc-text);overflow-wrap:anywhere}',
    '#oh-queue-card .qc-mini{flex:none;padding:4px 10px;border:1px solid rgba(245,180,74,.45);border-radius:8px;background:rgba(245,180,74,.1);color:var(--qc-warn);font-size:11px;font-weight:600;cursor:pointer}',
    '#oh-queue-card .qc-mini:hover{background:rgba(245,180,74,.18)}',
    '#oh-queue-card .qc-form{margin-top:8px}',
    '#oh-queue-card .qc-run{margin-bottom:12px;padding:10px;border:1px solid var(--qc-line);border-radius:10px;background:var(--qc-raise)}',
    '#oh-queue-card .qc-run-top{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:11.5px;color:var(--qc-muted)}',
    '#oh-queue-card .qc-run-top b{color:var(--qc-text);font-size:12px;font-variant-numeric:tabular-nums}',
    '#oh-queue-card .qc-bar{height:4px;border-radius:2px;background:var(--qc-line);overflow:hidden;margin:8px 0 6px}',
    '#oh-queue-card .qc-bar div{height:100%;width:0;background:var(--qc-accent);transition:width .4s}',
    '#oh-queue-card .qc-run-tally,#oh-queue-card .qc-run-tier{font-size:10.5px;color:var(--qc-muted);line-height:1.5}',
    '#oh-queue-card .qc-run-tier{margin-top:2px}',
    '#oh-queue-card .qc-row{display:flex;gap:8px;margin-bottom:8px}',
    '#oh-queue-card .qc-btn{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:34px;padding:0 12px;',
    'border:1px solid var(--qc-line);border-radius:9px;background:var(--qc-raise);font-size:12px;font-weight:550;cursor:pointer;transition:background .15s,border-color .15s}',
    '#oh-queue-card .qc-btn:hover{border-color:#353a4a;background:#20242f}',
    '#oh-queue-card .qc-btn svg{color:var(--qc-muted)}',
    '#oh-queue-card .qc-primary{background:var(--qc-accent);border-color:var(--qc-accent);color:#fff;font-weight:600}',
    '#oh-queue-card .qc-primary:hover{background:var(--qc-accent-2);border-color:var(--qc-accent-2)}',
    '#oh-queue-card .qc-square{flex:0 0 34px;padding:0} #oh-queue-card .qc-narrow{flex:0 0 auto}',
    '#oh-queue-card .qc-sep{height:1px;background:var(--qc-line);margin:4px 0 6px}',
    '#oh-queue-card .qc-ko{display:flex;width:100%;align-items:center;gap:10px;margin:0 0 6px;padding:8px 10px;border:1px solid var(--qc-line);border-radius:10px;background:transparent;color:var(--qc-text);text-align:left;cursor:pointer;font:inherit}',
    '#oh-queue-card .qc-ko:hover{background:var(--qc-raise)}',
    '#oh-queue-card .qc-ko.qc-audit-on{border-color:rgba(62,207,142,.5);background:rgba(62,207,142,.07)}',
    '#oh-queue-card .qc-ko.qc-ko-warn{border-color:rgba(245,180,74,.5);background:rgba(245,180,74,.08)}',
    '#oh-queue-card .qc-ko span{flex:1;display:flex;flex-direction:column;gap:1px;min-width:0}',
    '#oh-queue-card .qc-ko b{font-size:12px;font-weight:600}',
    '#oh-queue-card .qc-ko small{font-size:10.5px;color:var(--qc-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#oh-queue-card .qc-ko svg{width:12px;height:12px;color:var(--qc-muted);flex:none}',
    '#oh-queue-card .qc-switch{display:flex;width:100%;align-items:center;gap:10px;padding:7px 2px;border:0;background:transparent;text-align:left;cursor:pointer}',
    '#oh-queue-card .qc-switch-text{flex:1;display:flex;flex-direction:column}',
    '#oh-queue-card .qc-switch-text b{font-weight:550;font-size:12px}',
    '#oh-queue-card .qc-switch-text small{font-size:10.5px;color:var(--qc-muted)}',
    '#oh-queue-card .qc-toggle{position:relative;flex:none;width:32px;height:18px;border-radius:999px;background:#353a4a;transition:background .2s}',
    '#oh-queue-card .qc-toggle::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:transform .2s}',
    '#oh-queue-card .qc-switch[aria-checked="true"] .qc-toggle{background:var(--qc-accent)}',
    '#oh-queue-card .qc-switch[aria-checked="true"] .qc-toggle::after{transform:translateX(14px)}',
    '#oh-queue-card .qc-foot{font-size:10.5px;color:var(--qc-muted);margin:2px 0 6px}',
    '#oh-queue-card .qc-foot b{font-weight:600}',
    '#oh-queue-card .qc-links{display:flex;justify-content:space-between;gap:8px}',
    '#oh-queue-card .qc-link{display:inline-flex;align-items:center;gap:4px;padding:0;border:0;background:transparent;color:var(--qc-muted);font-size:11px;cursor:pointer}',
    '#oh-queue-card .qc-link:hover{color:var(--qc-text)}',
    '#oh-queue-card .qc-link svg{width:12px;height:12px}',
    '#oh-queue-card button:focus-visible{outline:2px solid var(--qc-accent);outline-offset:2px}',
    '#oh-queue-card .qc-acct{margin:2px 0 6px}',
    '#oh-queue-card .qc-acct-title{font-size:12px;font-weight:600;color:var(--qc-text);margin:0 0 2px}',
    '#oh-queue-card .qc-acct-sub{font-size:10.5px;color:var(--qc-muted);margin:0 0 6px;line-height:1.35}',
    '#oh-queue-card .qc-acct-box{border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px 10px;background:rgba(255,255,255,.03)}',
    '#oh-queue-card .qc-acct-row{display:flex;align-items:center;gap:8px}',
    '#oh-queue-card .qc-acct-row+.qc-acct-row{margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.08)}',
    '#oh-queue-card .qc-acct-row>label{flex:0 0 62px;font-size:11.5px;font-weight:600;color:var(--qc-text)}',
    '#oh-queue-card .qc-acct-field{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}',
    '#oh-queue-card .qc-acct-in{position:relative;display:flex}',
    '#oh-queue-card .qc-acct input[type=email],#oh-queue-card .qc-acct input[type=password],#oh-queue-card .qc-acct input[type=text]{width:100%;box-sizing:border-box;padding:6px 28px 6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.25);color:var(--qc-text);font-size:11.5px}',
    '#oh-queue-card .qc-acct input:disabled{opacity:.6}',
    '#oh-queue-card .qc-acct-eye{position:absolute;right:4px;top:50%;transform:translateY(-50%);border:0;background:transparent;color:var(--qc-muted);cursor:pointer;padding:2px}',
    '#oh-queue-card .qc-acct-eye svg{width:14px;height:14px;display:block}',
    '#oh-queue-card .qc-acct-check{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--qc-text);cursor:pointer}',
    '#oh-queue-card .qc-acct-check input{accent-color:var(--qc-accent);margin:0}',
    '#oh-queue-card .qc-acct-saved{font-size:10px;color:var(--qc-muted);margin-top:4px;min-height:12px}',
    '.qc-pill{position:fixed;bottom:10px;right:10px;z-index:2147483646;cursor:pointer;padding:7px 14px;border-radius:999px;',
    'background:#6d5efc;color:#fff;font:600 11.5px/1 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.4)}'
  ].join('');

  /* ── Applications Account (Job Queue card) ──────────────────────────
     appAccountEmail / appAccountPassword (kept by oh-persist.js) plus the
     Workday login the engine signs in with (ohWorkdayLogin: e-mail,
     password). "Use profile email" = your OptimHire profile's e-mail.
     A replaced password moves to the login's otherPasswords, so the
     accounts already made with it still sign in. */
  function profileEmailFrom(d) {
    var RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    var found = '';
    function walk(o, depth) {
      if (found || !o || typeof o !== 'object' || depth > 3) return;
      var keys = Object.keys(o);
      keys.sort(function (a, b) { return (/email/i.test(b) ? 1 : 0) - (/email/i.test(a) ? 1 : 0); });
      for (var i = 0; i < keys.length && !found; i++) {
        var v = o[keys[i]];
        if (typeof v === 'string' && /email/i.test(keys[i]) && RX.test(v.trim())) found = v.trim();
        else if (v && typeof v === 'object') walk(v, depth + 1);
      }
    }
    ['candidateDetails', 'userDetails', 'seekerDetails', 'cachedSeekerInfo', 'ohWdSeeker'].forEach(function (k) {
      var v = d && d[k];
      if (typeof v === 'string') { try { v = JSON.parse(v); } catch (_) { v = null; } }
      walk(v, 0);
    });
    return found;
  }
  function wireAppAccount() {
    var em = document.getElementById('oh-qc-acct-email');
    var use = document.getElementById('oh-qc-acct-useprofile');
    var pw = document.getElementById('oh-qc-acct-pw');
    var eye = document.getElementById('oh-qc-acct-eye');
    var mail = document.getElementById('oh-qc-acct-mail');
    var note = document.getElementById('oh-qc-acct-saved');
    if (!em || !use || !pw || em.dataset.wired) return;
    em.dataset.wired = '1';
    var KEYS = ['appAccountEmail', 'appAccountPassword', 'ohAppAccountUseProfile', 'ohWorkdayLogin', 'ohGmailCodes',
                'candidateDetails', 'userDetails', 'seekerDetails', 'cachedSeekerInfo', 'ohWdSeeker', 'ohMyPhone', 'ohCvProfile'];
    var ph = document.getElementById('oh-qc-acct-phone'), phNote = document.getElementById('oh-qc-acct-phone-note');
    var profileEmail = '';
    function say(t) { if (note) note.textContent = t; }
    function load() {
      chrome.storage.local.get(KEYS, function (d) {
        d = d || {};
        profileEmail = profileEmailFrom(d);
        var login = d.ohWorkdayLogin || {};
        var useProfile = d.ohAppAccountUseProfile !== false;
        use.checked = useProfile;
        em.disabled = useProfile;
        if (mail) mail.checked = d.ohGmailCodes === true;
        em.value = useProfile ? (profileEmail || login.email || d.appAccountEmail || '') : (d.appAccountEmail || login.email || '');
        if (document.activeElement !== pw) pw.value = d.appAccountPassword || login.password || '';
        if (useProfile && !profileEmail && !em.value) say('No e-mail on your OptimHire profile yet: untick and type one.');
        if (ph) {
          var found = detectedPhone(d);
          if (document.activeElement !== ph) ph.value = d.ohMyPhone || '';
          ph.placeholder = found ? found.phone : '+353 87 123 4567';
          if (phNote) phNote.textContent = d.ohMyPhone ? 'Used on every application form.'
            : found ? 'Using ' + found.phone + ' from ' + found.from + '. Type another to use that instead.'
            : 'No phone found in your OptimHire details or CV yet — type it here (forms like Greenhouse require one).';
        }
      });
    }
    /* The phone forms get when none is typed here: your details from OptimHire's jobs, else your CV. */
    function detectedPhone(d) {
      var sk = (d && d.ohWdSeeker) || {};
      var code = String(sk.mobile_code || '').replace(/\D/g, ''), num = String(sk.mobile_num || '').replace(/\D/g, '');
      if (num) return { phone: (code ? '+' + code + ' ' : '') + num, from: 'your OptimHire details' };
      if (sk.phone) return { phone: String(sk.phone), from: 'your OptimHire details' };
      var c = d && d.ohCvProfile && d.ohCvProfile.profile && d.ohCvProfile.profile.contact;
      if (c && c.phone) return { phone: String(c.phone), from: 'your CV' };
      return null;
    }
    function save(why) {
      var email = (use.checked ? (profileEmail || em.value) : em.value).trim();
      var password = pw.value;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { say('That e-mail doesn’t look right.'); return; }
      /* A password Workday would refuse is not saved — but the e-mail still is (a refused
         password used to stop the e-mail being saved too, and every account page then said
         "Add your email"). */
      var weak = password && (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password));
      if (weak) password = '';
      chrome.storage.local.get(['ohWorkdayLogin'], function (d) {
        var login = Object.assign({ sites: {} }, (d && d.ohWorkdayLogin) || {});
        if (password && login.password && login.password !== password) {
          var others = Array.isArray(login.otherPasswords) ? login.otherPasswords.slice() : [];
          if (others.indexOf(login.password) < 0) others.unshift(login.password);
          login.otherPasswords = others.slice(0, 5);
        }
        if (email) login.email = email;
        if (password) login.password = password;
        var patch = { ohWorkdayLogin: login, ohAppAccountUseProfile: use.checked };
        if (email) patch.appAccountEmail = email;
        if (password) patch.appAccountPassword = password;
        chrome.storage.local.set(patch, function () {
          say(weak ? 'E-mail saved. Password NOT saved: Workday needs 8+ characters with upper, lower, a number and a symbol.'
                   : (why || 'Saved') + (email ? ' — ' + email : ''));
        });
      });
    }
    use.addEventListener('change', function () {
      em.disabled = use.checked;
      if (use.checked && profileEmail) em.value = profileEmail;
      save(use.checked ? 'Using your profile e-mail' : 'Type the e-mail to use');
      if (!use.checked) em.focus();
    });
    em.addEventListener('change', function () { save('Saved'); });
    if (ph) ph.addEventListener('change', function () {
      var v = ph.value.trim();
      if (v && v.replace(/\D/g, '').length < 7) { say('That phone number looks too short.'); return; }
      chrome.storage.local.set({ ohMyPhone: v }, function () { say(v ? 'Phone saved — ' + v : 'Phone cleared: your OptimHire details / CV are used'); load(); });
    });
    pw.addEventListener('change', function () { save('Saved'); });
    /* The opt-in the Gmail code / link reader (oh-bg.js 10, 10b) already checks; it was only
       reachable in Queue Manager → Workday & sign-in. */
    if (mail) mail.addEventListener('change', function () {
      chrome.storage.local.set({ ohGmailCodes: mail.checked }, function () {
        say(mail.checked ? 'Verification emails: on (Gmail in this Chrome must be signed in)' : 'Verification emails: off');
      });
    });
    eye.addEventListener('click', function () {
      var show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
    load();
    /* The first save also fills in a login that has none yet. */
    chrome.storage.local.get(['ohWorkdayLogin', 'appAccountEmail'], function (d) {
      var login = (d && d.ohWorkdayLogin) || {};
      setTimeout(function () { if (!login.email && !(d && d.appAccountEmail) && em.value) save('Saved'); }, 300);
    });
    try {
      chrome.storage.onChanged.addListener(function (c, area) {
        if (area === 'local' && (c.candidateDetails || c.ohWorkdayLogin || c.appAccountEmail || c.ohGmailCodes || c.ohWdSeeker || c.ohMyPhone || c.ohCvProfile)) load();
      });
    } catch (_) {}
  }

  (function installJobQueueCard() {
    var KEY_QUEUE = 'ohJobQueue';
    var KEY_ACTIVE = 'ohJobQueueActive';

    function ensureCard() {
      var card = document.getElementById('oh-queue-card');
      if (card && document.body.contains(card)) return card;
      card = document.createElement('div');
      card.id = 'oh-queue-card';
      /* Docked to the BOTTOM of the sidepanel (above the Help footer),
         in the large empty space — never over the OptimHire main card.
         Appended to <body>, entirely OUTSIDE the React tree (#__plasmo)
         so it can't interfere with React's mount. Styled by one scoped
         stylesheet (QC_CSS) rather than inline styles. */
      if (!document.getElementById('oh-qc-style')) {
        var st = document.createElement('style');
        st.id = 'oh-qc-style';
        st.textContent = QC_CSS;
        (document.head || document.documentElement).appendChild(st);
      }
      var ICON = {
        log: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4h10M3 8h10M3 12h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>',
        x: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>',
        bolt: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9 1.5L3.5 9H8l-1 5.5L12.5 7H8z" fill="currentColor"/></svg>',
        send: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8l11-5-4 11-2-4.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" fill="none"/></svg>',
        arrow: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>',
        down: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v8M4.5 7.5L8 11l3.5-3.5M3 13.5h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/></svg>'
      };
      card.innerHTML =
        '<div class="qc-head">' +
          '<div class="qc-title">Job Queue</div>' +
          '<span id="oh-qc-indicator" class="qc-chip" style="display:none"><i></i>Running</span>' +
          '<button id="oh-qc-collapse" class="qc-icon" title="Hide" aria-label="Hide">' + ICON.x + '</button>' +
        '</div>' +
        '<div id="oh-qc-stats" class="qc-stats">' +
          '<div class="qc-stat"><b id="oh-qc-pending">0</b><span>Pending</span></div>' +
          '<div class="qc-stat qc-ok"><b id="oh-qc-applied">0</b><span>Applied</span></div>' +
          '<div class="qc-stat qc-bad"><b id="oh-qc-failed">0</b><span>Failed</span></div>' +
        '</div>' +
        /* Live OptimHire run: where it is in its queue, as it applies. */
        '<div id="oh-qc-run" class="qc-run" style="display:none">' +
          '<div class="qc-run-top"><span id="oh-qc-run-label">OptimHire queue</span><b id="oh-qc-run-pos">—</b></div>' +
          '<div class="qc-bar"><div id="oh-qc-run-bar"></div></div>' +
          '<div id="oh-qc-run-tally" class="qc-run-tally">—</div>' +
          '<div id="oh-qc-run-tier" class="qc-run-tier" style="display:none"></div>' +
        '</div>' +
        /* What the automation is doing right now: the latest step, the form being
           filled, and Skip (formerly a second panel under this one). */
        '<div id="oh-qc-live" class="qc-live" style="display:none">' +
          '<div class="qc-live-top"><span id="oh-qc-now" class="qc-now">Starting…</span>' +
            '<button id="oh-qc-skip" class="qc-mini" title="Skip the job being applied to now and go to the next one">Skip job</button></div>' +
          '<div id="oh-qc-form" class="qc-form" style="display:none">' +
            '<div class="qc-run-top"><span>Filling the form</span><b id="oh-qc-form-pct">0%</b></div>' +
            '<div class="qc-bar"><div id="oh-qc-form-bar"></div></div>' +
            '<div id="oh-qc-form-stats" class="qc-run-tally"></div>' +
          '</div>' +
        '</div>' +
        '<div class="qc-row">' +
          '<button id="oh-qc-open" class="qc-btn qc-primary">Open Queue Manager</button>' +
          '<button id="oh-qc-debug" class="qc-btn qc-square" title="Debug log" aria-label="Debug log">' + ICON.log + '</button>' +
        '</div>' +
        '<div class="qc-row">' +
          '<button id="oh-qc-fill" class="qc-btn" title="Fill the application on the tab you are viewing (works on any site)">' + ICON.bolt + 'Autofill this page</button>' +
          '<button id="oh-qc-fillsubmit" class="qc-btn qc-narrow" title="Autofill this page and press its submit button">' + ICON.send + 'Fill &amp; submit</button>' +
        '</div>' +
        '<div class="qc-sep"></div>' +
        '<button id="oh-qc-ko" class="qc-ko" title="Work rights, sponsorship, relocation, years of experience… are always answered with your true answers, per job country. Wrong answers get applications rejected or ranked last.">' +
          '<span><b id="oh-qc-ko-title">Knockout answers</b><small id="oh-qc-ko-sub">—</small></span>' + ICON.arrow + '</button>' +
        /* One click: record everything (every tab, this panel, the service worker) and see it live. */
        '<button id="oh-qc-audit" class="qc-ko" title="Records everything the automation does — every page, this panel and the background — for 8 hours, and opens the live log. Export it all as one file with ‘Export audit file’ below (passwords and login tokens are never included).">' +
          '<span><b id="oh-qc-audit-title">Audit</b><small id="oh-qc-audit-sub">Record everything, see every log, export one file</small></span>' + ICON.arrow + '</button>' +
        '<button id="oh-qc-master" class="qc-switch" role="switch" aria-checked="true" ' +
          'title="Hard stop: makes the extension completely inert — no auto-clicking, no auto-submitting, no background loops — until you turn it back on">' +
          '<span class="qc-switch-text"><b>Automation</b><small id="oh-qc-master-sub">Applies and submits for you</small></span><span class="qc-toggle"></span></button>' +
        '<button id="oh-qc-prio" class="qc-switch" role="switch" aria-checked="true" ' +
          'title="Order that saves the most time and reaches employers directly: one-page company ATS (Greenhouse, Lever, Ashby, Workable, SmartRecruiters…) first, then ATS that need an account (Workday, iCIMS, SuccessFactors…), company career sites, job boards (LinkedIn, Indeed…), and Reed last — for OptimHire\'s queue and the CSV Job Queue.">' +
          '<span class="qc-switch-text"><b>Quickest ATS first</b><small>Greenhouse, Lever… → Workday… → boards → Reed last</small></span><span class="qc-toggle"></span></button>' +
        '<button id="oh-qc-tailor" class="qc-switch" role="switch" aria-checked="false" ' +
          'title="Off: your own CV, unchanged, on every job (OptimHire\'s Optimize My Resume step is skipped). On: OptimHire\'s runs use Optimize My Resume and CSV jobs a copy of your CV ordered to the job. Workday always keeps your own CV.">' +
          '<span class="qc-switch-text"><b>Tailor CV to each job</b><small id="oh-qc-tailor-sub">Off — your own CV</small></span><span class="qc-toggle"></span></button>' +
        '<button id="oh-qc-autofill" class="qc-switch" role="switch" aria-checked="true" ' +
          'title="Fill application forms on ATS pages as you open them. Never on a page another autofill extension is applying on.">' +
          '<span class="qc-switch-text"><b>Auto-fill on ATS pages</b><small id="oh-qc-autofill-sub">Fills forms on job sites you open</small></span><span class="qc-toggle"></span></button>' +
        '<div class="qc-sep"></div>' +
        /* Applications Account: the e-mail + password new accounts on application
           sites are made with (Workday: one per employer) and signed in with. */
        '<div class="qc-acct">' +
          '<div class="qc-acct-title">Applications Account</div>' +
          '<div class="qc-acct-sub">Used to create and sign in to accounts on application sites (each Workday employer needs one).</div>' +
          '<div class="qc-acct-box">' +
            '<div class="qc-acct-row"><label for="oh-qc-acct-email">Email</label>' +
              '<div class="qc-acct-field">' +
                '<div class="qc-acct-in"><input type="email" id="oh-qc-acct-email" autocomplete="off" spellcheck="false" placeholder="you@example.com"></div>' +
                '<label class="qc-acct-check"><input type="checkbox" id="oh-qc-acct-useprofile">Use profile email</label>' +
              '</div></div>' +
            /* The phone every application form gets (Greenhouse requires one): yours if typed here. */
            '<div class="qc-acct-row"><label for="oh-qc-acct-phone">Phone</label>' +
              '<div class="qc-acct-field">' +
                '<div class="qc-acct-in"><input type="tel" id="oh-qc-acct-phone" autocomplete="off" spellcheck="false" placeholder="+353 87 123 4567"></div>' +
                '<div id="oh-qc-acct-phone-note" class="qc-acct-sub" style="margin:0"></div>' +
              '</div></div>' +
            '<div class="qc-acct-row"><label for="oh-qc-acct-pw">Password</label>' +
              '<div class="qc-acct-field"><div class="qc-acct-in">' +
                '<input type="password" id="oh-qc-acct-pw" autocomplete="new-password" spellcheck="false" placeholder="8+ chars, upper, lower, number, symbol">' +
                '<button id="oh-qc-acct-eye" class="qc-acct-eye" type="button" title="Show / hide" aria-label="Show password">' +
                  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" stroke="currentColor" stroke-width="1.3" fill="none"/><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.3" fill="none"/></svg>' +
                '</button></div></div></div>' +
            '<div class="qc-acct-row"><label for="oh-qc-acct-mail">Emails</label>' +
              '<div class="qc-acct-field">' +
                '<label class="qc-acct-check"><input type="checkbox" id="oh-qc-acct-mail">Read verification emails</label>' +
                '<div class="qc-acct-sub" style="margin:0">Only emails from the site you are applying to, from the last few minutes: its one-time code, or its verify / password-reset link. Uses the Gmail signed in to this Chrome; nothing is sent anywhere or kept.</div>' +
              '</div></div>' +
          '</div>' +
          '<div id="oh-qc-acct-saved" class="qc-acct-saved"></div>' +
        '</div>' +
        '<div class="qc-sep"></div>' +
        '<div id="oh-qc-truth" class="qc-foot" title="OptimHire’s ‘X applied’ counter also counts skips. This counts real submission confirmations.">Results: — submitted · — skipped</div>' +
        '<div class="qc-links">' +
          '<button id="oh-qc-qamem" class="qc-link" title="Answers learned from applications confirmed as submitted. Review or forget them.">Remembered answers ' + ICON.arrow + '</button>' +
          '<button id="oh-qc-auditx" class="qc-link" title="Download ONE file with everything: every log, each job and what happened, your settings, the details forms get, open tabs — for a full audit (passwords and login tokens removed)">' + ICON.down + 'Export audit file</button>' +
          '<button id="oh-qc-export" class="qc-link" title="Download every job OptimHire\'s queue has handed out so far as one CSV — title, company, full job link, status, dates (opens in Excel / Sheets; re-importable into the Queue Manager)">' + ICON.down + 'Export CSV</button>' +
        '</div>';
      /* Always append to <body> as a fixed overlay — never insert as a
         sibling of #__plasmo (that risked disturbing React). */
      document.body.appendChild(card);
      wireAppAccount();
      document.getElementById('oh-qc-open').addEventListener('click', function () {
        try { chrome.tabs.create({ url: chrome.runtime.getURL('tabs/jobQueue.html'), active: true }); }
        catch (_) {}
      });
      var dbgBtn = document.getElementById('oh-qc-debug');
      if (dbgBtn) dbgBtn.addEventListener('click', function () {
        try { chrome.tabs.create({ url: chrome.runtime.getURL('tabs/debug.html'), active: true }); }
        catch (_) {}
      });
      var exportBtn = document.getElementById('oh-qc-export');
      if (exportBtn) exportBtn.addEventListener('click', function () {
        exportHarvestedJobs();
      });
      var prioLine = document.getElementById('oh-qc-prio');
      if (prioLine) prioLine.addEventListener('click', function () {
        chrome.storage.local.get(['ohPreferAts'], function (d) {
          var on = !(d && d.ohPreferAts !== false);   // toggle
          chrome.storage.local.set({ ohPreferAts: on }, function () {
            addLog(on ? 'Queue order: ATS jobs first, Reed last' : 'Queue order: as OptimHire sends them', '');
            refresh();
          });
        });
      });
      var tailorLine = document.getElementById('oh-qc-tailor');
      var auditLine = document.getElementById('oh-qc-audit');
      if (auditLine) auditLine.addEventListener('click', function () {
        if (!window.OH_AUDIT) return;
        window.OH_AUDIT.status(function (st) {
          var open = function () { try { chrome.tabs.create({ url: chrome.runtime.getURL('tabs/debug.html'), active: true }); } catch (_) {} };
          if (st.on) { open(); return; }
          window.OH_AUDIT.record(8, function () { addLog('Audit: recording everything for 8 hours', 'success'); paintAudit(); open(); });
        });
      });
      var auditX = document.getElementById('oh-qc-auditx');
      if (auditX) auditX.addEventListener('click', function () {
        if (!window.OH_AUDIT) return;
        window.OH_AUDIT.exportFile(function (a, name) {
          addLog('Audit file saved: ' + name + ' (' + a.summary.logEntries + ' log entries, ' + a.summary.errors + ' errors)', 'success');
        });
      });
      var autofillLine = document.getElementById('oh-qc-autofill');
      if (autofillLine) autofillLine.addEventListener('click', function () {
        chrome.storage.local.get(['ohAutoTrigger'], function (d) {
          var on = !(d && d.ohAutoTrigger !== false);   // toggle
          chrome.storage.local.set({ ohAutoTrigger: on }, function () {
            addLog(on ? 'Auto-fill on ATS pages: on' : 'Auto-fill on ATS pages: off', '');
            refresh();
          });
        });
      });
      var skipBtn = document.getElementById('oh-qc-skip');
      if (skipBtn) skipBtn.addEventListener('click', function () {
        sendOhSkip('Skip pressed');
        addLog('Skipping this job…', '');
      });
      if (tailorLine) tailorLine.addEventListener('click', function () {
        chrome.storage.local.get(['ohTailorCv'], function (d) {
          var on = !(d && d.ohTailorCv === true);   // toggle
          chrome.storage.local.set({ ohTailorCv: on }, function () {
            addLog(on ? 'CV tailored to each job (Workday keeps your own CV)' : 'Your own CV on every job', '');
            refresh();
          });
        });
      });
      var qaLine = document.getElementById('oh-qc-qamem');
      if (qaLine) qaLine.addEventListener('click', function () {
        try { chrome.tabs.create({ url: chrome.runtime.getURL('tabs/jobQueue.html#answers'), active: true }); }
        catch (_) {}
      });

      /* "Autofill this page" — run our fill engine on whatever tab the
         user is currently viewing. This is our unrestricted equivalent of
         2.8.2's "Autofill Application", which sits behind an unlock modal. */
      function autofillActiveTab(withSubmit) {
        try {
          /* The tab the user is LOOKING at — not the pinned job tab. */
          realActiveTabs({ active: true, currentWindow: true }, function (tabs) {
            var t = tabs && tabs[0];
            if (!t || t.id == null) { addLog('Autofill this page: no active tab', 'error'); return; }
            if (/^chrome(-extension)?:\/\//i.test(t.url || '')) {
              addLog('Autofill this page: cannot run on a browser page', 'error');
              return;
            }
            addLog('Autofill this page: ' + (withSubmit ? 'filling + submitting…' : 'filling…'), '');
            try {
              chrome.tabs.sendMessage(t.id, {
                type: 'OH_AUTOFILL_THIS_PAGE', submit: !!withSubmit
              }).catch(function (err) {
                /* Only "no receiver" means our script is not on the page.
                   Another extension/OptimHire listener on the page can claim
                   an async reply and never send it ("message channel closed
                   before a response was received") — the fill still ran, so
                   that must not be reported as a failure. */
                var m = String((err && err.message) || err || '');
                if (/receiving end does not exist|could not establish connection/i.test(m)) {
                  addLog('Autofill this page: page not ready — reload it and retry', 'error');
                }
              });
            } catch (_) {}
          });
        } catch (_) {}
      }
      var masterBtn = document.getElementById('oh-qc-master');
      if (masterBtn) masterBtn.addEventListener('click', function () {
        chrome.storage.local.get(['ohAutomationDisabled'], function (d) {
          var off = !(d && d.ohAutomationDisabled === true);   // toggle
          var patch = { ohAutomationDisabled: off };
          if (off) {                                           // turning OFF: stop everything
            patch.ohAutoApplyEngaged = false;
            patch.ohAutoApplyEngagedTs = 0;
            patch.ohJobQueueActive = false;
          }
          chrome.storage.local.set(patch, function () {
            addLog(off ? 'Automation DISABLED — extension is now inert'
                       : 'Automation ENABLED — press Start to run', off ? '' : 'success');
          });
        });
      });

      var fillBtn = document.getElementById('oh-qc-fill');
      if (fillBtn) fillBtn.addEventListener('click', function () { autofillActiveTab(false); });
      var fillSubmitBtn = document.getElementById('oh-qc-fillsubmit');
      if (fillSubmitBtn) fillSubmitBtn.addEventListener('click', function () { autofillActiveTab(true); });
      /* × collapses the card to a small re-open pill in the corner. */
      var collapse = document.getElementById('oh-qc-collapse');
      if (collapse) collapse.addEventListener('click', function (e) {
        e.stopPropagation();
        card.style.display = 'none';
        var pill = document.getElementById('oh-qc-pill');
        if (!pill) {
          pill = document.createElement('div');
          pill.id = 'oh-qc-pill';
          pill.title = 'Show Job Queue';
          pill.textContent = 'Job Queue';
          pill.className = 'qc-pill';
          pill.addEventListener('click', function () {
            card.style.display = '';
            pill.remove();
          });
          document.body.appendChild(pill);
        } else {
          pill.style.display = '';
        }
      });
      return card;
    }

    /* ── Live OptimHire run counter ─────────────────────────────────────
       OptimHire only says how many it applied to at the very END of a run
       ("N jobs applied successfully"), and this card's numbers were our
       CSV queue's — so a native run showed "0 of 0 applied" throughout.
       A run = from Start until it stops; an auto-resume within 30 min
       continues the same run. Its total is OptimHire's own
       matchingJobCount ("We found N matching jobs"), extended when a
       finished batch is followed by a fresh search. Outcomes come from
       the harvester (ohHarvestedJobs). A compact summary is kept in
       ohRunStats so the toolbar badge (static/background/oh-bg.js) can
       show it even when this panel is closed. */
    var RUN_KEY = 'ohRunStats';
    var _queueTier = null;   // which part of OptimHire's queue is being served (oh-bg.js)
    var RUN_RESUME_MS = 30 * 60 * 1000;
    var _userStartTs = 0;
    var _lastRunJson = '';
    document.addEventListener('click', function (e) {
      try {
        if (!e.isTrusted) return;
        var b = e.target && e.target.closest && e.target.closest('button,[role="button"]');
        var t = b ? ((b.innerText || b.textContent || '') + '').replace(/\s+/g, ' ').trim() : '';
        if (/^start\s+(auto[-\s]?applying|manually\s+applying)$/i.test(t)) _userStartTs = Date.now();
      } catch (_) {}
    }, true);

    function nativeLive(d) {
      var st = d.autoApplyState;
      return d.ohAutomationDisabled !== true &&
             !!(d.isAutoProcessStartJob || d.isManuallyStartJob || (st && st.isActive === true));
    }
    function runCounts(map, start) {
      var c = { seen: 0, submitted: 0, skipped: 0, closed: 0, error: 0, pending: 0, lastDoneTs: 0 };
      for (var k in map) {
        if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
        var r = map[k];
        if (!r || (r.lastSeen || 0) < start) continue;
        c.seen++;
        var oc = r.outcome || 'pending';
        if (c[oc] == null) oc = 'pending';
        c[oc]++;
        if (oc !== 'pending' && (r.outcomeTs || 0) > c.lastDoneTs) c.lastDoneTs = r.outcomeTs;
      }
      c.done = c.submitted + c.skipped + c.closed + c.error;
      return c;
    }
    function fmtDur(ms) {
      if (!isFinite(ms) || ms <= 0) return '';
      var m = Math.round(ms / 60000);
      if (m < 60) return m + 'm';
      var h = Math.floor(m / 60);
      return h < 24 ? h + 'h ' + (m % 60) + 'm' : Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
    }
    function updateRun(d, map) {
      var now = Date.now();
      var live = nativeLive(d);
      var mjc = parseInt(d.matchingJobCount, 10) || 0;
      var run = (d[RUN_KEY] && typeof d[RUN_KEY] === 'object') ? Object.assign({}, d[RUN_KEY]) : null;
      if (live) {
        var userStarted = now - _userStartTs < 15000 && run && run.start < _userStartTs;
        if (!run || userStarted || (run.endedAt && now - run.endedAt > RUN_RESUME_MS)) {
          /* From the Start click if we saw it, else a few seconds back so a
             first job that loaded just before this check still counts. */
          var startAt = now - _userStartTs < 15000 ? Math.min(now, _userStartTs) : now - 5000;
          run = { start: startAt, total: mjc, mjc: mjc };
        } else if (run.endedAt) {
          delete run.endedAt;                      // auto-resume: same run continues
        }
      } else if (run && !run.endedAt) {
        run.endedAt = now;
      }
      if (!run) { _runStartTs = 0; paintRun(null); return; }
      _runStartTs = run.start;
      var c = runCounts(map, run.start);
      /* Total: OptimHire's count at the start; if that batch is used up and
         a new search brings more jobs, the queue grows by them. */
      if (mjc && mjc !== run.mjc) {
        if (!run.total || c.done >= run.total) run.total = c.done + mjc;
        run.mjc = mjc;
      }
      var total = Math.max(run.total || 0, c.seen);
      var position = live && c.pending > 0 ? c.done + 1 : c.done;
      var left = total ? Math.max(0, total - c.done) : null;
      var elapsed = (c.lastDoneTs || now) - run.start;
      var ratePerHr = c.done >= 2 && elapsed > 0 ? c.done / elapsed * 3600000 : 0;
      run.summary = { live: live, position: position, total: total, left: left,
                      submitted: c.submitted, skipped: c.skipped, closed: c.closed, error: c.error,
                      ratePerHr: Math.round(ratePerHr) };
      var json = JSON.stringify(run);
      if (json !== _lastRunJson) {
        _lastRunJson = json;
        var o = {}; o[RUN_KEY] = run;
        try { chrome.storage.local.set(o); } catch (_) {}
      }
      paintRun(run);
    }
    function paintRun(run) {
      var box = document.getElementById('oh-qc-run');
      if (!box) return;
      if (!run || !run.summary) { box.style.display = 'none'; return; }
      var s = run.summary;
      box.style.display = '';
      var label = document.getElementById('oh-qc-run-label');
      var pos = document.getElementById('oh-qc-run-pos');
      var bar = document.getElementById('oh-qc-run-bar');
      var tally = document.getElementById('oh-qc-run-tally');
      if (label) label.textContent = s.live ? 'OptimHire queue' : 'Last OptimHire run';
      if (pos) {
        pos.textContent = s.live
          ? (s.position ? 'Job ' + s.position + (s.total ? ' of ' + s.total : '') + (s.left != null ? ' · ' + s.left + ' left' : '')
                        : 'Starting' + (s.total ? ' · ' + s.total + ' in queue' : ''))
          : ((s.submitted + s.skipped + s.closed + s.error) + (s.total ? ' of ' + s.total : '') + ' done');
      }
      if (bar) bar.style.width = (s.total ? Math.min(100, Math.round(100 * (s.submitted + s.skipped + s.closed + s.error) / s.total)) : 0) + '%';
      if (tally) {
        var eta = s.live && s.ratePerHr > 0 && s.left ? ' · ~' + s.ratePerHr + '/hr, done in ' + fmtDur(s.left / s.ratePerHr * 3600000) : '';
        tally.innerHTML =
          '<b style="color:var(--qc-ok)">' + s.submitted + ' submitted</b> · ' +
          '<span style="color:var(--qc-warn)">' + s.skipped + ' skipped</span> · ' +
          '<span>' + s.closed + ' closed</span>' +
          (s.error ? ' · <span style="color:var(--qc-bad)">' + s.error + ' errors</span>' : '') + eta;
      }
      var tierEl = document.getElementById('oh-qc-run-tier');
      if (tierEl) {
        var tr = s.live && _queueTier && _queueTier.tier;
        tierEl.style.display = tr ? '' : 'none';
        if (tr) tierEl.textContent = 'Now applying: ' + _queueTier.tier +
          (_queueTier.site ? ' (' + _queueTier.site.charAt(0).toUpperCase() + _queueTier.site.slice(1) + ')' : '') +
          (_queueTier.heldBack === 'reed' ? ' — Reed jobs held back until ATS jobs are done' : '');
      }
      /* The Auto-Apply panel header showed our CSV queue's "0 of 0 applied". */
      var hdr = document.getElementById('aapCounter');
      if (hdr && s.live) hdr.textContent = s.submitted + ' submitted · job ' + (s.position || 0) + (s.total ? '/' + s.total : '');
    }

    /* Q&A-memory size. Kept in a variable (updated on change) so the 5s
       refresh never has to read the whole memory object. */
    var _qaCount = null;
    function paintQaCount() {
      var el = document.getElementById('oh-qc-qamem');
      if (el && _qaCount != null) el.innerHTML = 'Remembered answers <b style="color:var(--qc-text);font-weight:600">' + _qaCount + '</b>';
    }
    function setQaCount(mem) {
      _qaCount = (mem && typeof mem === 'object') ? Object.keys(mem).length : 0;
      paintQaCount();
    }

    /* Audit: recording or not, and for how long. */
    function paintAudit() {
      var row = document.getElementById('oh-qc-audit'), sub = document.getElementById('oh-qc-audit-sub');
      if (!row || !sub || !window.OH_AUDIT) return;
      window.OH_AUDIT.status(function (st) {
        row.classList.toggle('qc-audit-on', st.on);
        if (!st.on) { sub.textContent = 'Record everything, see every log, export one file'; return; }
        var mins = Math.ceil(Math.max(0, st.until - Date.now()) / 60e3), h = Math.floor(mins / 60), m = mins % 60;
        sub.textContent = 'Recording — ' + (h ? h + 'h ' : '') + m + 'm left · ' + (st.entries + st.bgEntries) + ' entries · tap to see them';
      });
    }

    /* Knockout answers: a prompt until you have checked them, then where you can work. */
    function paintKo() {
      var row = document.getElementById('oh-qc-ko'), t = document.getElementById('oh-qc-ko-title'), sub = document.getElementById('oh-qc-ko-sub');
      if (!row || !t || !sub) return;
      chrome.storage.local.get(['ohKnockout', 'ohKnockoutFixes'], function (d) {
        var ko = (d && d.ohKnockout) || null, fixes = Number(d && d.ohKnockoutFixes) || 0;
        var ok = !!(ko && ko.confirmed);
        row.classList.toggle('qc-ko-warn', !ok);
        t.textContent = ok ? 'Knockout answers' : 'Check your knockout answers';
        var where = ko && ko.workCountries && ko.workCountries.length ? 'Work rights: ' + [].concat(ko.workCountries).join(', ') + (ko.euWide ? ' + EU' : '') : '';
        sub.textContent = ok ? (where || 'Set') + (fixes ? ' · ' + fixes + ' wrong answer' + (fixes === 1 ? '' : 's') + ' fixed' : '')
                             : 'Work rights, relocation, years — wrong ones get you rejected';
      });
    }

    function refresh() {
      try {
        ensureCard();
        paintQaCount();
        chrome.storage.local.get([KEY_QUEUE, KEY_ACTIVE], function (d) {
          var q = Array.isArray(d[KEY_QUEUE]) ? d[KEY_QUEUE] : [];
          var c = { pending: 0, applied: 0, failed: 0 };
          for (var i = 0; i < q.length; i++) {
            var s = q[i].status; if (c[s] != null) c[s]++;
          }
          var p = document.getElementById('oh-qc-pending');
          var a = document.getElementById('oh-qc-applied');
          var f = document.getElementById('oh-qc-failed');
          if (p) p.textContent = String(c.pending);
          if (a) a.textContent = String(c.applied);
          if (f) f.textContent = String(c.failed);
          var ind = document.getElementById('oh-qc-indicator');
          if (ind) ind.style.display = d[KEY_ACTIVE] ? '' : 'none';
        });
        chrome.storage.local.get(['ohHarvestedJobs', RUN_KEY, 'matchingJobCount', 'isAutoProcessStartJob',
                                  'isManuallyStartJob', 'autoApplyState', 'ohAutomationDisabled',
                                  'ohPreferAts', 'ohQueueTier', 'ohTailorCv', 'ohAutoTrigger', KEY_ACTIVE], function (d) {
          try {
            var al = document.getElementById('oh-qc-autofill');
            if (al) al.setAttribute('aria-checked', d && d.ohAutoTrigger === false ? 'false' : 'true');
            var lv = document.getElementById('oh-qc-live');
            var running = !!(d && d.ohAutomationDisabled !== true && ((d.autoApplyState && d.autoApplyState.isActive) ||
                             d.isAutoProcessStartJob || d.isManuallyStartJob || d[KEY_ACTIVE]));
            if (lv) lv.style.display = running ? '' : 'none';
            var pl = document.getElementById('oh-qc-prio');
            if (pl) pl.setAttribute('aria-checked', d && d.ohPreferAts === false ? 'false' : 'true');
            paintKo();
            paintAudit();
            var tl = document.getElementById('oh-qc-tailor'), ts = document.getElementById('oh-qc-tailor-sub');
            if (tl) tl.setAttribute('aria-checked', d && d.ohTailorCv === true ? 'true' : 'false');
            if (ts) ts.textContent = d && d.ohTailorCv === true ? 'On — Workday keeps your own CV' : 'Off — your own CV';
          } catch (_) {}
          _queueTier = (d && d.ohPreferAts !== false && d.ohQueueTier) || null;
          var map = (d && d.ohHarvestedJobs) || {};
          try { updateRun(d || {}, map); } catch (_) {}
          var n = 0, sub = 0, skip = 0, other = 0;
          for (var k in map) {
            if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
            n++;
            var oc = map[k].outcome;
            if (oc === 'submitted') sub++;
            else if (oc === 'skipped') skip++;
            else if (oc === 'closed' || oc === 'error') other++;
          }
          var btn = document.getElementById('oh-qc-export');
          if (btn) btn.lastChild.textContent = 'Export CSV (' + n + ')';
          var mb = document.getElementById('oh-qc-master');
          if (mb) {
            chrome.storage.local.get(['ohAutomationDisabled'], function (dd) {
              var off = !!(dd && dd.ohAutomationDisabled === true);
              mb.setAttribute('aria-checked', off ? 'false' : 'true');
              var sub = document.getElementById('oh-qc-master-sub');
              if (sub) sub.textContent = off ? 'Off — the extension does nothing until you turn it on' : 'Applies and submits for you';
            });
          }
          var truth = document.getElementById('oh-qc-truth');
          if (truth) {
            /* Hover: why jobs were skipped, most common first. */
            var why = {};
            for (var wk in map) {
              if (!Object.prototype.hasOwnProperty.call(map, wk)) continue;
              var wr = map[wk];
              if (!wr || wr.outcome === 'submitted' || wr.outcome === 'pending') continue;
              var rs = String(wr.reason || wr.outcome).replace(/\s*\(last:.*\)$/, '').slice(0, 70);
              why[rs] = (why[rs] || 0) + 1;
            }
            var whyList = Object.keys(why).sort(function (a, b) { return why[b] - why[a]; }).slice(0, 8)
              .map(function (k) { return why[k] + ' × ' + k; });
            truth.title = whyList.length ? 'Not submitted — why:\n' + whyList.join('\n') :
              'OptimHire’s ‘X applied’ counter also counts SKIPS. This shows how many actually got a real submission confirmation.';
            truth.innerHTML = 'Results: ' +
              '<b style="color:var(--qc-ok)">' + sub + ' submitted</b> · ' +
              '<b style="color:var(--qc-warn)">' + skip + ' skipped</b>' +
              (other ? ' · <span style="color:var(--qc-bad)">' + other + ' closed or errors</span>' : '');
          }
        });
      } catch (_) {}
    }

    function startup() {
      refresh();
      /* Native interval on purpose: refresh() creates the card and drives
         the master ON/OFF switch, so it must keep working while idle. */
      _spNativeSetInterval(refresh, 5000);
      try { chrome.storage.local.get(['ohQaMemory'], function (d) { setQaCount(d && d.ohQaMemory); }); } catch (_) {}
      try {
        chrome.storage.onChanged.addListener(function (changes, area) {
          if (area !== 'local') return;
          if (changes.ohQaMemory) setQaCount(changes.ohQaMemory.newValue);
          if (changes.ohKnockout || changes.ohKnockoutFixes) paintKo();
          if (changes.ohDebugEnabled || changes.ohDebugUntil) paintAudit();
          if (changes[KEY_QUEUE] || changes[KEY_ACTIVE] || changes.ohHarvestedJobs ||
              changes.isAutoProcessStartJob || changes.isManuallyStartJob || changes.matchingJobCount ||
              changes.ohPreferAts || changes.ohQueueTier || changes.ohTailorCv || changes.ohAutoTrigger) refresh();
          var qt = changes.ohQueueTier && changes.ohQueueTier.newValue;
          if (qt && qt.heldBack) {
            addLog('⇅ Held back a ' + (qt.heldBack === 'reed' ? 'reed.co.uk' : 'job-board') + ' job — applying an ' +
                   qt.tier + ' job' + (qt.site ? ' (' + qt.site + ')' : '') + ' first', '');
          }
        });
      } catch (_) {}
    }
    if (document.body) startup();
    else document.addEventListener('DOMContentLoaded', startup);
  })();

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
