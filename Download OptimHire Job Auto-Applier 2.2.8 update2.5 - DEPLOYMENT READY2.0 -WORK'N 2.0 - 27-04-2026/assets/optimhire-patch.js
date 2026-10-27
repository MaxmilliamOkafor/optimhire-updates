/**
 * OptimHire Comprehensive Patch v6.7
 * Covers ALL 38 tasks — runs as a content script on every page
 *
 * v6.7 (2026-04-28) — HiringCafe crash fix:
 *   - FIX: hiring.cafe "Page Unresponsive" / browser crash. The T10
 *     handler installed a MutationObserver on document.body with
 *     childList+subtree and ran $$('a,button').find(...) on every
 *     mutation. On the search/listings page (thousands of job cards
 *     lazy-loaded on scroll) this triggered a full DOM scan per
 *     mutation and froze the tab.
 *   - Now: bail out entirely on the listings/home page (only run on a
 *     job-detail path), bail out unless automation is active
 *     (_fillActive), throttle the observer callback to one fire per
 *     1.5s, disconnect on first successful click, and apply a 30s
 *     hard-stop disconnect regardless of outcome.
 *
 * v6.6 (2026-04-28) — Work Auth autofill + popup fix:
 *   - ADD: Work Authorization Status autofill — label condition:
 *     (work+authorization) OR sponsorship OR visa OR permit → picks
 *     option matching "authorized" first, then "yes" as fallback,
 *     covering both "Authorized to work" and plain "Yes/No" dropdowns.
 *   - FIX: "Just give me a minute more" popup ALWAYS removed (not just
 *     on idle browsing). STOP_INJECT_POPUP=true at all times so the
 *     popup is never injected and the user can manually edit freely.
 *
 * v6.5 (2026-04-28) — GoHire/Forhyre UNBLOCKED (OptimHire v2.5.3):
 *   - OptimHire v2.5.3 added native GoHire support via gh-widget-*
 *     CSS classes (gh-widget-checkbox-wrapper, gh-widget-checkbox,
 *     gh-custom-question) in their Universal FieldConfig system.
 *   - Removed all GoHire skip logic; GoHire now falls through to
 *     autoFillPage() as a catch-up pass after the native API fill.
 *   - isApplicationPage() returns true for GoHire (permissive).
 *
 * v6.4 (2026-04-27) — GoHire/Forhyre skip (superseded by v6.5)
 *
 * v6.1 (2026-04-26) — STABILITY FIXES:
 *   - FIX: "Just give me a minute more to finish filling out the form"
 *     popup auto-dismissed (DOM observer + STOP_INJECT_POPUP config)
 *   - FIX: Random refreshes on LinkedIn/ATS/etc. while just browsing —
 *     auto-trigger now requires active automation (csvActiveJobId,
 *     isAutoProcessStartJob, autoApplyStateUpdate.isRunning) OR explicit
 *     manual click OR ohAutoTrigger === true (default OFF)
 *   - FIX: MutationObservers now require new form/input nodes AND active
 *     automation OR an apply-page URL pattern before reacting; throttled
 *     to one fire per 4s
 *   - FIX: Captcha solver no longer scans every DOM mutation; runs only
 *     when active automation OR _fillActive is true
 *   - FIX: Cookie banner only auto-dismissed during automation
 *   - FIX: Blocking iframes only force-skipped during automation; idle
 *     browsing just removes them silently
 *   - T36: Cloudflare bot-challenge detection — bail out instead of
 *     looping
 *   - T37: Dropzone resume upload — drag-drop file zones supported
 *   - T38: querySelectorWithShadow utility (v2.5.2 port)
 *
 * v6.2–v6.3 (2026-04-26) — GoHire/Forhyre autofill attempts (superseded by v6.4 skip)
 *
 * T1  – ATS auto-detection + auto-trigger on supported domains
 * T2  – Credits locked at 9999 forever
 * T4  – Skip fires only AFTER confirmed submission
 * T5  – Indeed "Apply on company site" auto-navigation
 * T6  – LinkedIn Easy Apply + non-Easy Apply (multi-step)
 * T7  – Freshness badges (🔥 <30m · ✨ <24h · 📅 <3d)
 * T8  – Workday / OracleCloud / SmartRecruiters autofill (comprehensive)
 * T9  – Deduplication: never apply to same URL twice
 * T10 – HiringCafe "Apply Directly" + company-size filter
 * T11 – OracleCloud + SmartRecruiters + iCIMS + Paylocity + JazzHR + Teamtailor
 * T12 – Auto-solve reCAPTCHA checkbox + math captchas
 * T13 – Auto-fill ALL missing required fields from profile
 * T14 – Wake Lock (prevent PC sleep during automation) — NO AudioContext
 * T15 – Freshness sorting signal injected into job cards
 * T16 – Referral section permanently hidden
 * T17 – "Please fill missing details" stall prevention
 * T18 – "Add Missing Details" dialog auto-fill + auto-submit
 * T19 – CSV Auto-Apply bridge: signals completion to queue
 * T20 – CSV Auto-Apply Floating Overlay
 * T21 – Validation error detection + auto-fix before submit
 * T22 – Skip suppression: no skip fired while form is actively filling
 * T23 – React-Select / Select2 / custom combobox support
 * T24 – KNOCKOUT QUESTIONS MEGA-PATTERNS (200+ question types)
 * T25 – Q&A memory: learns from past successful answers
 * T26 – Cookie banner + modal auto-dismisser
 * T27 – Review page detection + auto-submit
 * T28 – Dynamic cover letter generator (job title + company aware)
 * T29 – Resume URL → File blob upload automation
 * T30 – Recruitee / Pinpoint / SuccessFactors / UKG / Avature ATS coverage
 * T31 – v2.5.0: PAGE_DATA bridge (inject.js) for Paylocity state/country
 * T32 – v2.5.0: Notice-period smart-match (exact days → closest option)
 * T33 – v2.5.0: Apply-on-company-site auto-skip (don't get stuck)
 * T34 – v2.5.0: cleanQuestionText normaliser for Q&A memory keys
 * T35 – v2.5.0: Shadow-DOM aware querySelector (queryAllWithShadow)
 *
 * v4.5 fixes (2026-04-01):
 *   - ROOT CAUSE FIX: background autoSkipDuration changed to 180s in v2.4.2.
 *     Our sidepanel cap only changed the displayed countdown, not the real one.
 *     sidepanel-patch.js now calls skipCurrent() after AUTO_SKIP_MAX+1 seconds
 *     so the background is ACTUALLY forced to skip, not just shown "5s" in UI.
 *   - New: watchOptimHireMissingDetailsIframe() — detects all 4 OptimHire
 *     blocking iframes (missing-details, cover-letter, resume-score, confinity),
 *     force-skips after 5s if not dismissed
 *   - New: installStuckWatchdog() — content-script side watchdog; force-skips
 *     if same URL is active for >100s in automation mode
 *   - New: Workable ATS detection (jobs.workable.com + workable.com added)
 *     + workableAutofill() function covering all standard fields
 *   - Added BreezyHR subdomains (app.breezy.hr, jobs.breezy.hr)
 *   - Added job.ziprecruiter.com to ATS_DOMAINS
 *   - autoSkipSeconds capped at 5s via sendMessage intercept (update-proof)
 *   - getProfile() reads ALL storage keys: candidateDetails, cachedSeekerInfo,
 *     seekerDetails, userDetails — merges nested .seeker sub-objects and
 *     normalises email/phone/linkedin field name variants
 *   - guessValue() now accepts inputType arg; fills email/tel by type directly
 *   - "Preferred Name" now fills with full name (not LinkedIn URL)
 *   - Country default changed to Ireland
 *   - AudioContext fallback REMOVED (caused "not allowed to start" errors)
 *   - Workday: full SpeedyApply data-automation-id coverage
 *   - CSP-safe: no inline event handlers
 */
(function () {
  'use strict';

  /* ── Iframe gate ──────────────────────────────────────────
   * Manifest now sets all_frames:true so we run inside ATS-form
   * iframes (Greenhouse / Lever / Workable / Recruitee / etc.
   * commonly embed their application forms via iframe in company
   * career sites). But running in EVERY iframe (analytics, ads,
   * social embeds, chat widgets) is wasteful. So: in any subframe
   * whose hostname isn't a known ATS or doesn't look like a job
   * application page, bail out immediately. The top frame always
   * runs (it might navigate to an ATS later).
   * ──────────────────────────────────────────────────────── */
  try {
    const inIframe = window.top !== window.self;
    if (inIframe) {
      const h = (location.hostname || '').toLowerCase();
      /* Named ATS hosts ONLY. The old gate also admitted any iframe on a
         jobs./careers./apply./ats. subdomain or with /job|/career in its
         path — which describes half the ad/analytics iframes on a job
         board — so dozens of frames per page ran the full machinery.
         An unknown ATS's iframe loses nothing important: the top frame
         still handles the page. */
      const ATS_HOST_RE = /(greenhouse|lever\.co|breezy|workday|icims|taleo|oraclecloud|smartrecruiters|ashbyhq|bamboohr|jobvite|workable|paylocity|jazzhr|resumatorapi|teamtailor|ziprecruiter|manatal|bullhorn|hiring\.cafe|gohire|forhyre|careers-page|gh-widget|successfactors|sapsf|ultipro|avature|recruitee|pinpoint|rippling|applytojob|brassring|\.adp\.com|zohorecruit|personio|homerun|catsone|dover\.com|gusto\.com|careerpuck|jobs\.gem\.com|trakstar|join\.com|dayforcehcm|factorialhr)/i;
      if (!ATS_HOST_RE.test(h)) {
        /* Quietly no-op in non-ATS iframes (analytics, ads, etc.) */
        return;
      }
    }
  } catch (_) {}

  /* ── Helpers ───────────────────────────────────────────── */
  const LOG = (...a) => {
    /* Console first (preserves the existing dev-tools workflow). */
    console.log('[OH-Patch]', ...a);
    /* Mirror to the debug ring buffer so the viewer in tabs/debug.html
       sees every patch event without us scattering OH_DEBUG calls
       throughout this file. */
    try {
      if (window.OH_DEBUG) {
        const first = a[0];
        const rest  = a.slice(1);
        window.OH_DEBUG.log('patch', typeof first === 'string' ? first : String(first), rest.length ? rest : undefined);
      }
    } catch (_) {}
  };
  const ST  = chrome.storage.local;

  /* ── Engagement freshness + master kill switch ───────────────────────
   * ohAutoApplyEngaged was a PERMANENT flag: set the first time the user
   * pressed "Start Auto-Applying" and never cleared unless they pressed
   * Stop. It authorised auto-pressing Apply and auto-submitting, and it
   * survived browser restarts — so merely opening the side panel days
   * later resurrected the old run and started firing at jobs on its own.
   *
   * Engagement is now a LIVE-SESSION concept:
   *   - a genuinely running OptimHire/CSV session always counts;
   *   - the sticky flag only counts while its heartbeat
   *     (ohAutoApplyEngagedTs) is fresh, so it lapses on its own;
   *   - ohAutomationDisabled is a hard master switch that vetoes
   *     everything, for when the user wants the extension inert.
   * ────────────────────────────────────────────────────────────────── */
  const ENGAGE_TTL_MS = 10 * 60_000;   // sticky engagement lapses after 10 idle minutes

  /* ── One job tab ─────────────────────────────────────────────────────
   * The side panel pins the tab a native run works in (ohJobTab {id, ts},
   * heartbeat every 20s) and pings that tab every 3s. Content scripts
   * cannot read their own tab id, so "am I the job tab?" = "was I pinged
   * recently?". While a fresh pin exists, every OTHER tab stands down
   * completely — no autofill, no clicks, no submits, idle governor — so
   * the run can never spill into the tab the user is working in.
   * Without a fresh pin (panel closed) the old URL-based checks apply. */
  let _jobTabPingTs = 0;
  const JOB_TAB_PING_FRESH_MS = 12_000;
  const JOB_TAB_PIN_FRESH_MS = 45_000;
  function isPingedJobTab() { return Date.now() - _jobTabPingTs < JOB_TAB_PING_FRESH_MS; }
  function jobTabPinned(d) {
    const j = d && d.ohJobTab;
    return !!(j && j.id != null && Date.now() - (j.ts || 0) < JOB_TAB_PIN_FRESH_MS);
  }
  function notTheJobTab(d) {
    if (!jobTabPinned(d) || d.ohJobQueueActive) return false;   // CSV queue tabs follow their own rules
    if (Date.now() - _manualTriggerTs < 30_000) return false;  // the user asked for a fill here
    return !isPingedJobTab();
  }
  function markJobTab() {
    const wasJobTab = isPingedJobTab();
    _jobTabPingTs = Date.now();
    if (!wasJobTab) setTimeout(_refreshEngaged, 0);   // wake the governor now, not in 5s
  }
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'OH_JOB_TAB_PING') markJobTab();
    });
    /* A freshly loaded job page asks straight away instead of waiting for
       the next ping. */
    ST.get('ohJobTab').then((d) => {
      if (!jobTabPinned(d)) return;
      chrome.runtime.sendMessage({ type: 'OH_JOB_TAB_WHO' })
        .then((r) => { if (r && r.job) markJobTab(); })
        .catch(() => {});
    }).catch(() => {});
  } catch (_) {}

  /* OptimHire activity. Its state (autoApplyState / the one-job mode's
     job) changes as it works, and the side panel stamps ohPanelActivityTs
     whenever OptimHire's panel text changes ("Fetching your answers",
     "Filling your answers"…). Watchdogs treat recent activity as progress,
     so a job OptimHire is still working on is never skipped as "stuck". */
  let _ohActivityTs = Date.now();
  try {
    chrome.storage.onChanged.addListener((c, area) => {
      if (area !== 'local') return;
      if (c.autoApplyState || c.manualApplicationDetail || c.isManualSubmit || c.ohPanelActivityTs ||
          c.complexFormInProgress || c.complexFormData) _ohActivityTs = Date.now();
    });
  } catch (_) {}

  /* May we take ACTION (click Apply, submit a form, skip a job)?
     `d` is a storage snapshot containing the keys below. */
  function mayAutomate(d) {
    if (!d) return false;
    if (d.ohAutomationDisabled === true) return false;          // master OFF
    if (notTheJobTab(d)) return false;                          // another tab is the job tab
    const st = d.autoApplyState;
    if (st && st.isActive === true) return true;                // live session
    if (d.isAutoProcessStartJob) return true;                   // live session
    if (d.isManuallyStartJob) return true;                      // live one-job-at-a-time session
    if (d.ohJobQueueActive) return true;                        // our CSV queue
    if (Date.now() - _manualTriggerTs < 30_000) return true;    // user just acted here
    if (d.ohAutoApplyEngaged) {                                 // sticky — only while fresh
      const ts = d.ohAutoApplyEngagedTs || 0;
      if (ts && Date.now() - ts < ENGAGE_TTL_MS) return true;
    }
    return false;
  }
  const AUTOMATION_KEYS = ['autoApplyState', 'isAutoProcessStartJob', 'isManuallyStartJob', 'ohJobQueueActive',
                           'ohAutoApplyEngaged', 'ohAutoApplyEngagedTs', 'ohAutomationDisabled', 'ohJobTab'];

  /* ── Idle governor (CRITICAL for CPU) ────────────────────────────────
   * This file installs ~22 polling loops and ~14 subtree
   * MutationObservers, and they ran in EVERY tab all the time — engaged
   * or not. Multiplied across open tabs (and ATS iframes) that pinned
   * the CPU and was crashing the user's machine.
   *
   * The governor keeps ONE cheap 5s storage poll. Everything below uses
   * the local `setInterval` / `MutationObserver` shadows, so when no
   * automation is engaged and this is not an optimhire.com page:
   *   - bodies of all sub-15s interval loops are skipped outright,
   *   - every MutationObserver is disconnected (reconnected on engage).
   * Net idle cost: one storage read every 5 seconds.
   * ────────────────────────────────────────────────────────────────── */
  const _nativeSetInterval = window.setInterval.bind(window);
  const _NativeMO = window.MutationObserver;
  const _IS_OH_PAGE = /(^|\.)optimhire\.com$/i.test(location.hostname);
  /* Starts awake on optimhire.com so its first pass runs, then follows
     mayAutomate() like every other page. (optimhire.com's own UI hiding
     uses native timers so it is not affected.) */
  let _engagedNow = _IS_OH_PAGE;
  const _governedObservers = new Set();

  function _refreshEngaged() {
    try {
      ST.get(AUTOMATION_KEYS, (d) => {
          try {
            const on = mayAutomate(d);
            /* optimhire.com stays awake only while automation may run, so
               idly viewing the site costs nothing either. */
            _engagedNow = on;
            for (const g of _governedObservers) {
              if (_engagedNow && !g.connected && g.args) {
                try { g.obs.observe(...g.args); g.connected = true; } catch (_) {}
              } else if (!_engagedNow && g.connected) {
                try { g.obs.disconnect(); g.connected = false; } catch (_) {}
              }
            }
          } catch (_) {}
        });
    } catch (_) {}
  }
  _nativeSetInterval(_refreshEngaged, 5000);
  setTimeout(_refreshEngaged, 800);   // async: runs after module init, so no TDZ issues

  /* Local shadows — every setInterval/MutationObserver below goes
     through these. Long-period loops (>=15s) are cheap enough to leave
     untouched. */
  function setInterval(fn, ms, ...rest) {
    return _nativeSetInterval(function () {
      if (!_engagedNow && ms < 15_000) return;
      return fn.apply(this, arguments);
    }, ms, ...rest);
  }
  class MutationObserver {
    constructor(cb) {
      this._g = {
        obs: new _NativeMO(function () { if (_engagedNow) return cb.apply(this, arguments); }),
        args: null, connected: false
      };
      _governedObservers.add(this._g);
    }
    observe(...args) {
      this._g.args = args;
      if (_engagedNow) { this._g.obs.observe(...args); this._g.connected = true; }
    }
    disconnect() { try { this._g.obs.disconnect(); } catch (_) {} this._g.connected = false; }
    takeRecords() { return this._g.obs.takeRecords(); }
  }
  const $   = (s, c = document) => c.querySelector(s);
  const $$  = (s, c = document) => [...c.querySelectorAll(s)];
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /** React/Angular/Vue-compatible value setter.
   *
   * Technique adapted from Simplify Copilot's autofill: the most reliable
   * way to set a value that a framework actually registers is
   * document.execCommand("insertText") — it produces a REAL text-insertion
   * the framework's own input listeners receive (React's value tracker sees
   * a genuine input event, so controlled inputs keep the value instead of
   * reverting it). Plain `.value = x` is silently reverted by React on many
   * forms — which is exactly why phone/email/typeahead fields were failing.
   *
   * Order: focus → select existing → execCommand insertText → if that
   * didn't take, fall back to the native prototype value setter → then
   * dispatch the full keyboard/input/change event sequence either way. */
  function _protoValueSet(el, val) {
    try {
      const proto = el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(el, val); else el.value = val;
    } catch (_) { try { el.value = val; } catch (__) {} }
  }
  /* ── Phone boxes with their own country-code picker ─────────────────
   * Workable, intl-tel-input, react-phone-number-input… draw the dial
   * code (🇮🇪 +353) in a picker beside the number box. Typing the full
   * "+353 87 426 1508" into that box is rejected — the site cleared it,
   * showed "This field is required.", our fillers typed it again, and the
   * field flickered forever. Such a box gets the local number instead. */
  let _profileDialCode = '';   // "353" — set by getProfile() from mobile_code
  function isPhoneInput(el) {
    if (!el || el.tagName !== 'INPUT') return false;
    if ((el.type || '').toLowerCase() === 'tel') return true;
    return /phone|mobile|\btel\b/i.test(`${el.name || ''} ${el.id || ''} ${el.getAttribute('autocomplete') || ''}`);
  }
  /* The dial code shown beside a phone box: "353", 'picker' when there is a
     picker whose code can't be read, '' when there is none. */
  function dialCodeBeside(el) {
    const cls = x => String((x.getAttribute && x.getAttribute('class')) || '');
    let box = el.parentElement;
    for (let i = 0; i < 4 && box && box !== document.body; i++, box = box.parentElement) {
      /* Stop once the box holds another field: we have left the phone widget. */
      const others = [...box.querySelectorAll('input:not([type=hidden]),textarea')]
        .filter(f => f !== el && !/country|dial|code|flag|search/i.test(`${f.name || ''} ${f.id || ''} ${f.placeholder || ''} ${f.getAttribute('aria-label') || ''}`));
      if (others.length) return '';
      for (const x of box.querySelectorAll('select,button,[role="combobox"],[aria-haspopup],[class*="country" i],[class*="dial" i],[class*="flag" i],[class*="iti" i],[class*="prefix" i]')) {
        if (x === el || x.contains(el)) continue;
        let t = x.tagName === 'SELECT'
          ? ((x.selectedOptions && x.selectedOptions[0] && (x.selectedOptions[0].text + ' ' + x.selectedOptions[0].value)) || '')
          : `${x.textContent || ''} ${x.getAttribute('aria-label') || ''} ${x.getAttribute('title') || ''}`;
        const m = t.match(/\+\s?(\d{1,4})\b/);
        if (m) return m[1];
        if (x.tagName === 'SELECT' ? [...x.options].some(o => /\+\d{1,4}\b/.test(o.text)) :
            /country|dial|flag|iti__|calling.?code|phone.?code/i.test(cls(x) + ' ' + (x.getAttribute('aria-label') || ''))) return 'picker';
      }
    }
    return '';
  }
  /* Part of a phone widget (its country picker / search box), not a field. */
  function inPhoneWidget(el) {
    if (!el || isPhoneInput(el)) return false;
    if (!/country|dial|code|flag|search|iti/i.test(`${el.name || ''} ${el.id || ''} ${el.placeholder || ''} ` +
        `${el.getAttribute('aria-label') || ''} ${el.getAttribute('class') || ''}`)) return false;
    let box = el.parentElement;
    for (let i = 0; i < 3 && box && box !== document.body; i++, box = box.parentElement) {
      const fields = [...box.querySelectorAll('input:not([type=hidden]),textarea')].filter(f => f !== el);
      if (!fields.length) continue;
      return fields.length === 1 && isPhoneInput(fields[0]);
    }
    return false;
  }
  /* "+353 87 426 1508" → "874261508" for a box that has its own picker. */
  function phoneValueFor(el, val) {
    if (!/^\s*(\+|00)\s?\d/.test(val) || !isPhoneInput(el)) return val;
    const shown = dialCodeBeside(el);
    if (!shown) return val;
    const digits = val.replace(/\D/g, '').replace(/^00/, '');
    const code = /^\d+$/.test(shown) ? shown : _profileDialCode;
    if (code && digits.startsWith(code) && digits.length - code.length >= 6) return digits.slice(code.length);
    return val;
  }

  /* ── No fill fights ─────────────────────────────────────────────────
   * Several fillers (ours per ATS, sanitize passes, the validation fixer,
   * the rescue) each re-typed a field whenever it looked wrong. When the
   * SITE changes the value — reformats it, picks a suggestion, or clears
   * what it rejects — that became an endless write/clear loop: the
   * flickering Phone and "Dublin, Ireland, Dublin, Ireland" Address on
   * Workable. Per field and value, we now type a value that the site
   * rejected (cleared) at most FIGHT_MAX times, never retype a value we
   * already wrote that is still there, and never overwrite the site's own
   * edit of our value with the same value again. */
  const FIGHT_MAX = 3;
  const _ourWrites = new WeakMap();   // el → Map(value → times typed)
  function wroteBefore(el, val) {
    const m = _ourWrites.get(el);
    return !!(m && m.has(val));
  }
  function mayWrite(el, val) {
    if (!val || isComboInput(el)) return true;              // clearing, or a dropdown's search text
    const m = _ourWrites.get(el);
    const n = (m && m.get(val)) || 0;
    if (!n) return true;
    const cur = (el.value || '').trim();
    if (cur === val.trim()) return false;                    // ours, still there
    if (cur) {                                               // the site changed it
      /* …except a value that was doubled up ("Dublin, Ireland, Dublin,
         Ireland"): put it right, once. */
      const doubled = /,/.test(val) &&
                      (cur.split(val.trim()).length > 2 || cur.endsWith(', ' + val.trim()));
      if (doubled && !(m.get('\u0000repaired'))) { m.set('\u0000repaired', 1); return true; }
      return false;
    }
    if (n >= FIGHT_MAX) {                                    // the site keeps clearing it
      if (!m.get('\u0000gaveUp')) {
        m.set('\u0000gaveUp', 1);
        LOG(`Fill: "${(getLabel(el) || el.name || el.id || 'field').slice(0, 40)}" keeps rejecting "${val.slice(0, 30)}" — leaving it`);
      }
      return false;
    }
    return true;
  }
  function noteWrite(el, val) {
    if (!val) return;
    let m = _ourWrites.get(el);
    if (!m) { m = new Map(); _ourWrites.set(el, m); }
    m.set(val, (m.get(val) || 0) + 1);
  }

  function nativeSet(el, val) {
    if (!el) return false;
    val = (val == null) ? '' : String(val);
    val = phoneValueFor(el, val);
    if (val && isTrapField(el)) {
      if (!_trapLogged.has(el)) { _trapLogged.add(el); LOG(`Fill: skipped a hidden bot-trap field (${(el.name || el.id || 'unnamed').slice(0, 40)})`); }
      return false;
    }
    if (!mayWrite(el, val)) return false;
    noteWrite(el, val);
    let ok = false;
    try {
      el.focus();
      /* execCommand insertText works on <input>/<textarea>/contenteditable
         and fires the framework's listeners naturally. Select existing
         content first so the insert REPLACES rather than appends. */
      if (typeof el.select === 'function') { try { el.select(); } catch (_) {} }
      if (document.activeElement === el && typeof document.execCommand === 'function') {
        ok = document.execCommand('insertText', false, val);
        /* execCommand reports true but some inputs still need an explicit
           value (e.g. when selection was empty) — verify and fix. */
        if (ok && el.value !== val && 'value' in el) ok = (el.value === val);
      }
    } catch (_) { ok = false; }

    if (!ok) {
      _protoValueSet(el, val);
      try { el.setAttribute && el.setAttribute('value', val); } catch (_) {}
    }

    /* Full event sequence so every framework + native validation reacts. */
    try {
      const opts = { bubbles: true, cancelable: true };
      el.dispatchEvent(new KeyboardEvent('keydown', opts));
      el.dispatchEvent(new KeyboardEvent('keypress', opts));
      el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: val }));
      el.dispatchEvent(new KeyboardEvent('keyup', opts));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (_) {
      /* Older event-constructor fallback */
      try { el.dispatchEvent(new Event('input',  { bubbles: true })); } catch (__) {}
      try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (__) {}
    }
    return true;
  }

  /** Real pointer-events click sequence (unchanged proven behaviour). */
  function realClick(el) {
    if (!el) return;
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true }));
    el.click();
  }

  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    if (el.offsetParent !== null) return true;
    /* offsetParent is ALWAYS null for position:fixed (and for sticky in
       some stacking contexts) even when the element is plainly on screen.
       Lots of ATSes pin "Submit application" in a fixed/sticky footer
       bar, so the old check reported those buttons invisible and the
       auto-submit could never find them. Fall back to computed style. */
    try {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
      return cs.position === 'fixed' || cs.position === 'sticky';
    } catch (_) { return false; }
  }

  /* Site chrome — header / nav / footer, and search or newsletter forms
     (Reed's "What / Where" bar, say) — is never part of an application. */
  function isPageChromeField(el) {
    try {
      if (!el || !el.closest) return false;
      if ((el.getAttribute('type') || '').toLowerCase() === 'search') return true;
      if (el.closest('header,nav,footer,[role="search"],[role="navigation"],[role="banner"],[role="contentinfo"]')) return true;
      const f = el.form || el.closest('form');
      if (f) {
        if (f.getAttribute('role') === 'search' || f.querySelector('input[type=search]')) return true;
        if (/search/i.test((f.id || '') + ' ' + (typeof f.className === 'string' ? f.className : '') +
                           ' ' + (f.getAttribute('action') || ''))) return true;
        for (const b of f.querySelectorAll('button,input[type=submit]')) {
          if (/\b(search|find jobs|subscribe|sign up)\b/i.test((b.innerText || b.value || '') + '')) return true;
        }
      }
    } catch (_) {}
    return false;
  }

  /* ── Job boards: browsing them is never an application ───────────────
   * Indeed, LinkedIn, Glassdoor, Reed… are search + listing sites. Only
   * their own apply step is a form (Indeed Apply, LinkedIn's Easy Apply
   * window, a board's apply dialog). Autofill and auto-clicks fired on
   * Indeed while the user was just browsing it. */
  const JOB_BOARD_HOST_RE = /(^|\.)(indeed\.[a-z.]+|linkedin\.com|glassdoor\.[a-z.]+|ziprecruiter\.[a-z.]+|reed\.co\.uk|dice\.com|monster\.[a-z.]+|totaljobs\.com|cv-library\.co\.uk|simplyhired\.[a-z.]+|careerbuilder\.[a-z.]+|adzuna\.[a-z.]+|jooble\.org|hiring\.cafe|seek\.com\.au|seek\.co\.nz|foundit\.[a-z.]+|irishjobs\.ie|jobs\.ie)$/i;
  function onJobBoard() { return JOB_BOARD_HOST_RE.test(location.hostname); }

  /* ── Bot traps ("honeypots") ─────────────────────────────────────────
   * Hidden fields a person never sees; anything typed into one marks the
   * application as a bot and it is quietly thrown away. Oracle and others
   * draw them with a real size, so the size-based visibility check let
   * them through. Never fill them. (Patterns after NextRaise's adapter.) */
  const TRAP_RE = /\bhoney[\s_-]*pot\b|\bhoneypot\b|\bbot[\s_-]*(field|trap)\b|\bspam[\s_-]*trap\b|\brobots?\s+only\b|\bdo\s+not\s+(enter|fill|complete)[^.!?]{0,80}\b(human|person)\b|\bleave\s+(this\s+)?(field|input)?\s*blank\b/i;
  const _trapLogged = new WeakSet();
  function isTrapField(el) {
    try {
      if (!el || el.nodeType !== 1 || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return false;
      if ((el.type || '').toLowerCase() === 'file') return false;            // upload boxes are often visually hidden on purpose
      /* Hidden from assistive tech on the field or its own wrapper (a trap's
         container). Not further up: dialog libraries hide the whole page
         behind an open cookie / modal dialog the same way. */
      for (let n = el, i = 0; n && i < 4; n = n.parentElement, i++) {
        if (n.getAttribute && (n.getAttribute('aria-hidden') === 'true' || n.hasAttribute('inert'))) return true;
      }
      const corpus = [el.getAttribute('name'), el.id, el.getAttribute('aria-label'), el.getAttribute('data-testid'),
                      el.getAttribute('data-qa'), el.getAttribute('placeholder'),
                      el.labels && [...el.labels].map(l => l.textContent).join(' ')].filter(Boolean).join(' ');
      if (TRAP_RE.test(corpus)) return true;
      /* Pushed off-screen / see-through and kept out of the tab order. */
      if (el.tabIndex === -1) {
        const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        if (r.right < 0 || r.bottom < 0 || r.left > (innerWidth + 2000) || parseFloat(cs.opacity) === 0 || r.width < 2 || r.height < 2) return true;
      }
    } catch (_) {}
    return false;
  }
  function boardApplyFlowOpen() {
    try {
      const h = location.hostname.toLowerCase();
      if (/(^|\.)(smartapply|apply|m5\.apply)\.indeed\.com$/.test(h)) return true;          // Indeed Apply
      if (/(^|\.)indeed\./.test(h) && /\/(indeedapply|apply)(\/|$)/i.test(location.pathname)) return true;
      if (document.querySelector('.jobs-easy-apply-modal,[data-test-modal-id="easy-apply-modal"]')) return true;   // LinkedIn Easy Apply
      /* A board's own apply window (Reed's "Apply now" dialog…). */
      return [...document.querySelectorAll('[role="dialog"],[aria-modal="true"]')].some(d => isVisible(d) &&
        !!d.querySelector('input[type=file],input[type=email],input[type=tel],textarea') &&
        /\b(apply|application|submit)\b/i.test((d.textContent || '').slice(0, 3000)));
    } catch (_) { return false; }
  }

  /* ── Which field does an error message belong to? ───────────────────
   * The old lookup took the FIRST input in a broad "[class*=field]" box,
   * so Workable's Phone "This field is required." re-typed the Address
   * above it on every pass. Now: the nearest box holding exactly one field
   * (a phone widget's code picker doesn't count), or nothing. */
  const FIELD_SEL = 'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=file]),textarea,select';
  function fieldsIn(box) {
    const all = [...box.querySelectorAll(FIELD_SEL)].filter(f => isVisible(f) || f.type === 'radio' || f.type === 'checkbox');
    if (all.length < 2) return all;
    /* A phone widget = number box + its code picker/search: one field. */
    const tel = all.filter(f => (f.type || '').toLowerCase() === 'tel');
    if (tel.length === 1 && all.every(f => f === tel[0] || f.tagName === 'SELECT' ||
        /country|dial|code|flag|search/i.test(`${f.name || ''} ${f.id || ''} ${f.placeholder || ''} ${f.getAttribute('aria-label') || ''}`))) return tel;
    /* One radio/checkbox group is one field too. */
    const names = new Set(all.map(f => (f.type === 'radio' || f.type === 'checkbox') && f.name ? 'g:' + f.name : f));
    return names.size === 1 ? [all[0]] : all;
  }
  function fieldOfMessage(msg) {
    let box = msg.parentElement;
    for (let i = 0; i < 6 && box && box !== document.body; i++, box = box.parentElement) {
      const f = fieldsIn(box);
      if (f.length === 1) return f[0];
      if (f.length > 1) return null;
    }
    return null;
  }
  const ERROR_TEXT_SEL = '[class*="error" i],[class*="invalid" i],[role="alert"],[aria-live="assertive"],' +
                         '[data-automation-id="inputAlert"],[data-automation-id="errorMessage"]';   // Workday
  /* Is the site flagging THIS field (aria-invalid, or an error message in
     the field's own box)? */
  function fieldFlagged(el) {
    if (el.getAttribute('aria-invalid') === 'true') return true;
    let box = el.parentElement;
    for (let i = 0; i < 6 && box && box !== document.body; i++, box = box.parentElement) {
      if (fieldsIn(box).some(f => f !== el && !(f.type === 'radio' && f.name && f.name === el.name))) return false;
      const hit = [...box.querySelectorAll(ERROR_TEXT_SEL)].some(e => !e.contains(el) &&
        !e.querySelector(FIELD_SEL) && isVisible(e) && /\S/.test(e.textContent || '') && (e.textContent || '').trim().length < 200);
      if (hit) return true;
    }
    return false;
  }

  /* ── Dropdown widgets (react-select & co.) ──────────────────────────
   * Greenhouse, Ashby, Lever and many others render dropdowns as a text
   * <input role="combobox"> that only FILTERS a menu — typing into it
   * selects nothing. The generic fillers used to type answers (even the
   * "N/A" filler) straight into that search box: the field showed "N/A /
   * No options", stayed invalid, and the form could never be submitted —
   * the run sat on "Review and submit the form". These inputs are now left
   * to chooseComboOption(), which opens the menu and clicks a real option. */
  const COMBO_WRAP_SEL = '[class*="select__control" i],[class*="react-select" i],[class*="Select__control"],' +
                         '[class*="select2-selection" i],[class*="-control" i][class*="select" i]';
  function isComboInput(el) {
    if (!el || el.tagName !== 'INPUT') return false;
    if (el.getAttribute('role') === 'combobox') return true;
    const ac = (el.getAttribute('aria-autocomplete') || '').toLowerCase();
    if (ac && ac !== 'none') return true;
    return !!(el.closest && el.closest(COMBO_WRAP_SEL));
  }
  function comboControl(input) {
    return (input.closest && (input.closest('[class*="control" i]') || input.closest(COMBO_WRAP_SEL))) || input.parentElement;
  }
  /* The option currently chosen in the widget ('' when nothing is). A plain
     typeahead (no react-select value container, e.g. a location field)
     keeps its answer in the input itself. */
  function comboSelectedText(input) {
    const ctl = comboControl(input);
    if (!ctl || !ctl.querySelector('[class*="placeholder" i],[class*="single-value" i],[class*="singleValue"],[class*="value-container" i],[class*="multi-value" i],.select2-selection__rendered')) {
      return input.getAttribute('aria-invalid') === 'true' ? '' : (input.value || '').trim();
    }
    const v = ctl && ctl.querySelector('[class*="single-value" i],[class*="singleValue"],[class*="multi-value" i],[class*="multiValue"],.select2-selection__rendered');
    if (!v || /placeholder/i.test(v.className || '') || v.querySelector('[class*="placeholder" i]')) return '';
    return (v.textContent || '').trim();
  }
  function comboOptions() {
    return $$('[role="option"],[id*="-option-"],[class*="__option" i],.select2-results__option')
      .filter(o => isVisible(o) && !/disabled|no-?options|notice|group-heading|placeholder/i.test(o.className || '') &&
                   !o.querySelector('[role="option"],[class*="__option" i]'));
  }
  /* Open the widget and click the option that best matches `answer`.
     `fallbackFirst` picks the first real option when nothing matches (for
     required questions no rule could answer). Returns the chosen text. */
  async function chooseComboOption(input, answer, fallbackFirst) {
    const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const want = norm(answer);
    const ctl = comboControl(input);
    const keyDown = key => { try { input.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true })); } catch (_) {} };
    try { realClick(ctl || input); } catch (_) {}
    try { input.focus(); } catch (_) {}
    let opts = [];
    if (want) { nativeSet(input, answer); await sleep(450); opts = comboOptions(); }
    if (!opts.length) { nativeSet(input, ''); keyDown('ArrowDown'); await sleep(450); opts = comboOptions(); }
    const txt = o => norm(o.textContent);
    let best = null;
    if (want && opts.length) {
      best = opts.find(o => txt(o) === want) ||
             opts.find(o => txt(o).startsWith(want + ' ') || txt(o).startsWith(want + ',')) ||
             opts.find(o => txt(o).startsWith(want)) ||
             opts.find(o => txt(o).includes(want));
      if (!best && /^(yes|no)\b/.test(want)) best = opts.find(o => new RegExp('^' + want.split(' ')[0] + '\\b').test(txt(o)));
    }
    if (!best && fallbackFirst) best = opts[0] || null;
    if (!best) { keyDown('Escape'); try { input.blur(); } catch (_) {} return ''; }
    const chosen = (best.textContent || '').trim();
    try { realClick(best); } catch (_) { try { best.click(); } catch (__) {} }
    await sleep(250);
    return chosen;
  }
  /* Answer every dropdown in `scope` that is required-but-empty, or has
     junk typed into its search box with nothing chosen. */
  async function answerComboDropdowns(scope, p) {
    const LOC_LBL = /location|city|residence|where.*(based|live|located)/i;
    let n = 0;
    for (const input of $$('input', scope || document)) {
      if (!isComboInput(input)) continue;
      const ctl = comboControl(input);
      if (!isVisible(ctl || input) || isPageChromeField(input)) continue;
      if (comboSelectedText(input)) continue;                     // already answered
      const lbl = (getLabel(input) || getLabel(ctl) || '').trim();
      if (!lbl || LOC_LBL.test(lbl)) continue;                    // location typeaheads have their own rescue
      const required = /\*\s*$/.test(lbl) || input.required || input.getAttribute('aria-required') === 'true' ||
                       !!(ctl && ctl.closest('[class*="required" i]'));
      const junk = !!(input.value && input.value.trim());
      if (!required && !junk) continue;
      let ans = String(guessValue(lbl, p || {}) || '');
      if (/^(n\/?a|none)$/i.test(ans)) ans = '';
      const picked = await chooseComboOption(input, ans, required);
      if (picked) { n++; LOG(`Dropdown: "${lbl.slice(0, 60)}" → "${picked.slice(0, 40)}"`); }
      else if (junk) nativeSet(input, '');                        // at least clear the junk text
    }
    return n;
  }

  /* ── optimHireBusy: is OptimHire's own autofill actively working? ──
   * Shared by the stuck watchdog and the missing-fields skip so neither
   * skips a job while OptimHire is mid-flow (loading details, analysing,
   * generating cover letter, uploading CV, submitting). Detects the
   * overlay text OptimHire injects + any visible spinner/loader. */
  const OH_BUSY_RE = /hang tight|loading your details|we['’]re loading|analy[sz]ing|checking page|submitting|generating|uploading|please wait|filling (out )?(the )?form/i;
  function optimHireBusy() {
    try {
      const t = (document.body && document.body.innerText || '').slice(0, 4000);
      if (OH_BUSY_RE.test(t)) return true;
      if (document.querySelector(
        '[class*="spinner" i],[class*="loader" i],[class*="loading" i],[role="progressbar"]'
      )) return true;
    } catch (_) {}
    return false;
  }

  /* ── T1: Supported ATS domains ─────────────────────────── */
  const ATS_DOMAINS = {
    'greenhouse.io':       'Greenhouse',
    'lever.co':            'Lever',
    'breezy.hr':           'BreezyHR',
    'myworkdayjobs.com':   'Workday',
    'workday.com':         'Workday',
    'icims.com':           'iCIMS',
    'careers.icims.com':   'iCIMS',
    'taleo.net':           'Taleo',
    'oraclecloud.com':     'OracleCloud',
    'fa.oraclecloud.com':  'OracleCloud',
    'smartrecruiters.com': 'SmartRecruiters',
    'ashbyhq.com':         'Ashby',
    'bamboohr.com':        'BambooHR',
    'jobvite.com':         'Jobvite',
    'apply.workable.com':  'Workable',
    'jobs.workable.com':   'Workable',   // v2.4.2: Workable also uses jobs.workable.com
    'workable.com':        'Workable',
    'paylocity.com':       'Paylocity',
    'recruiting.paylocity.com': 'Paylocity',
    'jazzhr.com':          'JazzHR',
    'resumatorapi.com':    'JazzHR',
    'teamtailor.com':      'Teamtailor',
    'ziprecruiter.com':    'ZipRecruiter',
    'job.ziprecruiter.com':'ZipRecruiter',
    'manatal.com':         'Manatal',
    'bullhorn.com':        'Bullhorn',
    'dice.com':            'Dice',
    'hiring.cafe':         'HiringCafe',
    'indeed.com':          'Indeed',
    'linkedin.com':        'LinkedIn',
    'jobs.lever.co':       'Lever',
    'boards.greenhouse.io':'Greenhouse',
    'apply.lever.co':      'Lever',
    'recruiting.ultipro.com': 'UKG',
    'jobs.smartrecruiters.com': 'SmartRecruiters',
    'app.breezy.hr':       'BreezyHR',
    'jobs.breezy.hr':      'BreezyHR',
    // v6.0 (T30): five new ATS
    'recruitee.com':       'Recruitee',
    'jobs.recruitee.com':  'Recruitee',
    'pinpointhq.com':      'Pinpoint',
    'careers.pinpointhq.com': 'Pinpoint',
    'successfactors.com':  'SuccessFactors',
    'successfactors.eu':   'SuccessFactors',
    'ultipro.com':         'UKG',
    'recruiting2.ultipro.com': 'UKG',
    'avature.net':          'Avature',
    // v6.2: GoHire / Forhyre (same platform, different domains)
    'forhyre.com':          'GoHire',
    'jobs.forhyre.com':     'GoHire',
    'gohire.io':            'GoHire',
    'app.gohire.io':        'GoHire',
    'hire.li':              'GoHire',   // GoHire short-link domain
    // 27-10 ATS test: platforms applied to that were not recognised as an ATS at all
    'applytojob.com':       'JazzHR',      // JazzHR's apply pages (company.applytojob.com)
    'brassring.com':        'BrassRing',   // Kenexa (sjobs.brassring.com)
    'workforcenow.adp.com': 'ADP',
    'myjobs.adp.com':       'ADP',
    'recruiting.adp.com':   'ADP',
    'homerun.co':           'Homerun',
    'catsone.com':          'CATS',
    'zohorecruit.com':      'ZohoRecruit',
    'zohorecruit.eu':       'ZohoRecruit',
    'zohorecruit.in':       'ZohoRecruit',
    'jobs.personio.com':    'Personio',
    'jobs.personio.de':     'Personio',
    'ats.rippling.com':     'Rippling',
    'app.dover.com':        'Dover',
    'jobs.gusto.com':       'Gusto',
    'careerpuck.com':       'CareerPuck',
    'jobs.gem.com':         'Gem',
    'hire.trakstar.com':    'Trakstar',
    'join.com':             'JOIN',
    'dayforcehcm.com':      'Dayforce',
    'factorialhr.com':      'Factorial',
  };

  const HOST = location.hostname.toLowerCase().replace(/^www\./, '');
  /* A Workday page the Workday engine (assets/wd-engine.js) is applying on:
     everything here that fills fields or presses buttons leaves it alone —
     two fillers on one form undo each other. */
  const wdEngineOwns = () => { try { return !!(window.__ohWdEngine && window.__ohWdEngine.owns()); } catch (_) { return false; } };
  const _rawATS = Object.entries(ATS_DOMAINS)
    .find(([domain]) => HOST.includes(domain))?.[1] || null;
  // LinkedIn: only activate on /jobs path — not on feeds, profiles, or messaging
  const CURRENT_ATS = _rawATS === 'LinkedIn'
    ? (location.pathname.startsWith('/jobs') ? 'LinkedIn' : null)
    : _rawATS === 'ADP' && HOST.includes('workforcenow.adp.com')
      ? (/recruit|career|job/i.test(location.pathname + location.hash) ? 'ADP' : null)   // else: payroll / HR, never an application
      : _rawATS;

  LOG(`Page: ${HOST} | ATS: ${CURRENT_ATS || 'unknown'}`);

  /* ── v6.1: Automation-active guard ──────────────────────────────────
   * The patch was running on every ATS page and triggering autofills
   * even when the user was just browsing. This caused random refreshes,
   * stuck "Just give me a minute" popups on irrelevant tabs, and pages
   * mutating under the user.
   *
   * Now: most active behaviours (auto-trigger, mutation observer fills,
   * captcha solver, blocking-iframe handling) are gated on the user
   * being in an *actual* automation session:
   *   - csvActiveJobId is set (CSV auto-apply running), OR
   *   - isAutoProcessStartJob is true (background auto-apply running), OR
   *   - ohManualTrigger was set in the last 30s (user clicked the
   *     extension's Autofill button on this page)
   * Otherwise the patch stays mostly dormant — only credit-locking,
   * popup-dismissal and freshness-badges keep running.
   * ────────────────────────────────────────────────────────────────── */
  let _manualTriggerTs = 0;
  let _automationCache = { active: false, ts: 0 };
  const AUTOMATION_CACHE_MS = 1500; // re-check storage at most every 1.5s

  async function isAutomationActive() {
    if (Date.now() - _automationCache.ts < AUTOMATION_CACHE_MS) {
      return _automationCache.active;
    }
    try {
      const d = await ST.get(AUTOMATION_KEYS.concat(['csvActiveJobId', 'autoApplyStateUpdate']));
      const csvActiveJobId = d.csvActiveJobId;
      const isRunning = !!(d.autoApplyStateUpdate && d.autoApplyStateUpdate.isRunning);
      /* ohJobQueueActive is OUR CSV queue runner — treat it just like
         OptimHire's own automation flags so all existing autofill
         triggers (autoFillPage, T39/T40, watchdog, etc.) fire on
         queue-driven job pages.

         ohAutoApplyEngaged (our persistent "user pressed Start
         Auto-Applying" flag) and autoApplyState.isActive are included
         because newer OptimHire builds do not always set the legacy
         isAutoProcessStartJob / autoApplyStateUpdate.isRunning flags.
         Without them this returned false, and since the generic
         terminal-submit (T43) bails on its very first line when
         automation is inactive, the run sat on "Review and submit the
         form" waiting for a human click. */
      const active = (!!csvActiveJobId || isRunning || mayAutomate(d)) && !notTheJobTab(d);
      _automationCache = { active, ts: Date.now() };
      return active;
    } catch (_) {
      return Date.now() - _manualTriggerTs < 30_000;
    }
  }

  /* ── Active-job-tab gate (CRITICAL: prevents runaway tab spawning) ───
   * This content script runs in EVERY tab. Several independent watchdogs
   * send { action:'skipCurrent' }, and OptimHire answers a skipCurrent by
   * OPENING THE NEXT JOB IN A NEW TAB. Because those watchdogs were not
   * scoped to the tab actually being automated, any unrelated tab the
   * user had open (Indeed, Ashby, a job board…) would eventually report
   * "no progress" and fire a skip — spawning a job tab, whose content
   * script then ran the same watchdogs and skipped again. That feedback
   * loop is what buried the browser in tabs.
   *
   * A queue-advancing message may now only be sent from the tab that is
   * genuinely the current job: the URL matches OptimHire's active job
   * (autoApplyState.applicationDetails.source.apply_now_url), or a
   * 'running' CSV-queue job, or the user just triggered autofill here.
   * ────────────────────────────────────────────────────────────────── */
  function _urlsMatchLoose(a, b) {
    try {
      const ua = new URL(a), ub = new URL(b);
      if (ua.hostname.toLowerCase() !== ub.hostname.toLowerCase()) return false;
      const pa = ua.pathname.split('/').filter(Boolean);
      const pb = ub.pathname.split('/').filter(Boolean);
      if (!pa.length || !pb.length) return true;
      return pa[0] === pb[0];
    } catch (_) { return false; }
  }

  /* Stricter match for the CURRENT job's URL `jobUrl`: same host, and
     this page's path equals or extends the job's path (…/jobs/123 →
     …/jobs/123/apply), or lacks only a trailing apply step. The loose
     host + first-segment match made any linkedin.com/jobs/… page the user
     was browsing count as "the job". */
  function _urlsMatchJob(here, jobUrl) {
    try {
      const ua = new URL(here), ub = new URL(jobUrl);
      if (ua.hostname.toLowerCase().replace(/^www\./, '') !== ub.hostname.toLowerCase().replace(/^www\./, '')) return false;
      const pa = ua.pathname.split('/').filter(Boolean), pb = ub.pathname.split('/').filter(Boolean);
      for (let i = 0; i < Math.min(pa.length, pb.length); i++) if (pa[i] !== pb[i]) return false;
      if (pa.length >= pb.length) return true;
      return pb.length - pa.length === 1 && pa.length > 0 &&
             /^(apply|application|apply-now|start|submit)$/i.test(pb[pb.length - 1]);
    } catch (_) { return false; }
  }

  async function isActiveJobTab() {
    try {
      if (window.top !== window.self) return false;   // never from sub-frames
      if (Date.now() - _manualTriggerTs < 30_000) return true;  // user acted here
      if (isPingedJobTab()) return true;               // the side panel's pinned job tab
      const d = await ST.get(AUTOMATION_KEYS.concat(['ohJobQueue', 'manualApplicationDetail']));
      if (notTheJobTab(d)) return false;               // another tab is pinned
      const here = location.href;
      /* optimhire.com's own copilot page is the automation's CONTROL
         SURFACE, not a job page, so its URL never matches apply_now_url.
         Excluding it meant every recovery skip sent from there was
         suppressed — which left the run stuck forever on "Loading your
         Job" with no way out. It was never the source of the runaway
         tab-spam either (that came from unrelated job-board tabs such as
         Indeed), so allow it whenever automation is engaged. */
      if (/(^|\.)optimhire\.com$/i.test(location.hostname) && mayAutomate(d)) return true;
      const ad = d.autoApplyState && d.autoApplyState.applicationDetails;
      const applyUrl = ad && ad.source && ad.source.apply_now_url;
      if (applyUrl && _urlsMatchJob(here, applyUrl)) return true;
      /* One-job-at-a-time mode keeps its job here instead. */
      const md = d.manualApplicationDetail;
      const manualUrl = md && md.source && md.source.apply_now_url;
      if (d.isManuallyStartJob && manualUrl && _urlsMatchJob(here, manualUrl)) return true;
      if (d.ohJobQueueActive && Array.isArray(d.ohJobQueue)) {
        if (d.ohJobQueue.some(j => j && j.status === 'running' &&
                                   j.url && _urlsMatchLoose(here, j.url))) return true;
      }
      return false;
    } catch (_) { return false; }
  }

  /* Skip the current job the way OptimHire 2.9.0 understands. Its
     background no longer handles {action:'skipCurrent'} — every skip this
     file sent was silently ignored. AUTO_APPLY_SKIP records the skip and
     loads the next job (or ends a job started from the optimhire.com page
     and goes back to it); the one-job-at-a-time mode takes a skip flag. */
  async function sendOptimHireSkip(reason) {
    try {
      const d = await ST.get(['autoApplyState', 'isAutoProcessStartJob', 'isManuallyStartJob', 'isSingleManualApplication']);
      const st = d.autoApplyState;
      const msg = (d.isManuallyStartJob && !d.isSingleManualApplication && !(st && st.isActive))
        ? { action: 'OPEN_MANUAL_APPLICATION', isSkipped: true, error: { reason: 'auto_' + (reason || 'skip') } }
        : { action: 'AUTO_APPLY_SKIP', skipReason: 'auto_skip', status: '4',
            status_message: 'Skipped automatically: ' + String(reason || 'stuck').slice(0, 120),
            applicationDetails: (st && st.applicationDetails) || undefined };
      chrome.runtime.sendMessage(msg).catch(() => {});
    } catch (_) {}
  }

  /* The ONLY way this file may ask the queue to advance. Silently drops
     the request unless this tab is the active job. */
  /* ── Why a job was given up: the fields still empty or flagged ────────
   * Written to chrome.storage (ohFieldFailures, last 40 jobs) so it comes
   * along in the diagnostic file: the question's label, the kind of widget
   * and whether it was required / empty / flagged with the site's message.
   * Never the values typed. (Idea from NextRaise's autofill diagnostics.) */
  let _lastFailureNote = '';
  function failureWidget(el) {
    if (el.tagName === 'SELECT') return el.classList.contains('select2-hidden-accessible') ? 'select2' : 'select';
    if (el.closest('[data-automation-id]') && /myworkday/i.test(location.hostname)) return 'workday-' + ((el.type || el.tagName).toLowerCase());
    if (isComboInput(el)) return el.closest(COMBO_WRAP_SEL) ? 'react-select' : 'combobox';
    return (el.type || el.tagName).toLowerCase();
  }
  function failureEmpty(el) {
    const t = (el.type || '').toLowerCase();
    if (t === 'radio') return !el.name || ![...document.getElementsByName(el.name)].some(r => r.checked);
    if (t === 'checkbox') return !el.checked;
    if (t === 'file') return !(el.files && el.files.length);
    if (el.tagName === 'SELECT') return !el.value;
    if (isComboInput(el)) return !comboSelectedText(el);
    return !(el.value || '').trim();
  }
  function failureMessage(el) {
    let box = el.parentElement;
    for (let i = 0; i < 6 && box && box !== document.body; i++, box = box.parentElement) {
      if (fieldsIn(box).some(f => f !== el && !(f.type === 'radio' && f.name && f.name === el.name))) break;
      const e = [...box.querySelectorAll(ERROR_TEXT_SEL)].find(x => !x.contains(el) && !x.querySelector(FIELD_SEL) && isVisible(x) && /\S/.test(x.textContent || ''));
      if (e) return (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90);
    }
    return '';
  }
  async function noteFieldFailures(reason) {
    try {
      if (window.top !== window.self || _IS_OH_PAGE) return;
      const key = location.href + '|' + reason;
      if (key === _lastFailureNote) return;
      _lastFailureNote = key;
      const seenGroups = new Set(), fields = [];
      for (const el of $$(FIELD_SEL + ',input[type="file"]')) {      // upload boxes count here
        if (fields.length >= 15) break;
        const t = (el.type || '').toLowerCase();
        if (t === 'radio' || t === 'checkbox') { if (el.name && seenGroups.has(el.name)) continue; if (el.name) seenGroups.add(el.name); }
        if (t !== 'file' && t !== 'radio' && t !== 'checkbox' && !isVisible(el)) continue;
        if (isPageChromeField(el) || isTrapField(el) || inPhoneWidget(el)) continue;
        const lbl = ((t === 'radio' && typeof radioGroupLabel === 'function' ? radioGroupLabel(el) : '') || getLabel(el) || el.name || '').replace(/\s+/g, ' ').trim();
        const required = el.required || el.getAttribute('aria-required') === 'true' || /\*\s*$/.test(lbl);
        const flagged = fieldFlagged(el);
        const empty = failureEmpty(el);
        if (!((required && empty) || flagged)) continue;
        fields.push({ label: lbl.slice(0, 90), widget: failureWidget(el), required, empty, flagged, error: flagged ? failureMessage(el) : '' });
      }
      const entry = { ts: Date.now(), host: location.hostname, path: location.pathname.slice(0, 120), ats: CURRENT_ATS || '', reason: String(reason || '').slice(0, 120), fields };
      const d = await ST.get(['ohFieldFailures']);
      const list = Array.isArray(d.ohFieldFailures) ? d.ohFieldFailures : [];
      list.push(entry);
      await ST.set({ ohFieldFailures: list.slice(-40) });
      LOG(`Diagnostics: ${fields.length} unfinished field(s) noted for "${entry.reason}"`);
    } catch (_) {}
  }

  async function requestSkipCurrent(reason) {
    if (window.top !== window.self || !(await isActiveJobTab())) {
      LOG(`skipCurrent suppressed (not the active job tab): ${reason || ''}`);
      return false;
    }
    await noteFieldFailures(reason);
    await sendOptimHireSkip(reason);
    LOG(`skip sent: ${reason || ''}`);
    return true;
  }

  /* ── "Autofill this page" — on-demand fill of whatever page you are on ──
   * 2.8.2 shipped an "Autofill Application" button for this, but it is
   * gated behind a lock/upgrade modal. This is our own equivalent, using
   * OUR fill engine (location typeahead, phone country code, device type,
   * field-of-study, sanitize passes), so it works on any site with no
   * restriction.
   *
   * Previously this listener only ARMED manual mode and never actually
   * filled anything — the trigger did nothing visible.
   * ────────────────────────────────────────────────────────────────── */
  /* Set by installReviewAndSubmit() so the on-demand fill can reuse the
     same ranked submit-button finder. Null on optimhire.com, where that
     module returns early. */
  let findAnySubmitButton = null;
  let _manualFillRunning = false;
  /* URL on which the user asked for a fill WITHOUT submitting. The generic
     terminal-submit (T43) and the review-and-submit handler leave that page
     alone, so "Autofill this page" never sends an application the user only
     wanted filled in. Cleared by "+ submit" or by navigating away. */
  let _noAutoSubmitUrl = '';
  function autoSubmitBlockedHere() {
    return !!_noAutoSubmitUrl && _noAutoSubmitUrl === location.href;
  }

  async function runManualAutofill(opts) {
    if (_manualFillRunning) { LOG('Autofill this page: already running'); return; }
    _manualFillRunning = true;
    const submitAfter = !!(opts && opts.submit);
    _noAutoSubmitUrl = submitAfter ? '' : location.href;
    try {
      LOG('Autofill this page: starting');
      try { chrome.runtime.sendMessage({ type: 'OH_MANUAL_FILL_STATUS', state: 'start' }).catch(() => {}); } catch (_) {}
      _fillActive = true;
      await runAtsAutofill();
      try { await solveCaptcha(); } catch (_) {}
      await sleep(400);
      try { await detectAndFixValidationErrors(); } catch (_) {}
      await sleep(600);  try { await sanitizeBadFills(); } catch (_) {}
      await sleep(800);  try { await sanitizeBadFills(); } catch (_) {}
      _fillActive = false;
      /* Give the location-typeahead rescue a moment, then optionally
         submit. Submitting is opt-in so a plain fill never sends an
         application the user only wanted filled in. */
      if (submitAfter) {
        await sleep(1200);
        const hit = (typeof findAnySubmitButton === 'function') ? findAnySubmitButton() : null;
        if (hit) {
          LOG(`Autofill this page: submitting via "${hit.why}"`);
          markSubmitAttempted();
          try { realClick(hit.btn); } catch (_) { try { hit.btn.click(); } catch (__) {} }
        } else {
          LOG('Autofill this page: no submit button found');
        }
      }
      LOG('Autofill this page: done');
      try { chrome.runtime.sendMessage({ type: 'OH_MANUAL_FILL_STATUS', state: 'done' }).catch(() => {}); } catch (_) {}
    } catch (e) {
      LOG('Autofill this page: error', e);
      try { chrome.runtime.sendMessage({ type: 'OH_MANUAL_FILL_STATUS', state: 'error' }).catch(() => {}); } catch (_) {}
    } finally {
      _fillActive = false;
      _manualFillRunning = false;
    }
  }

  /* User explicitly clicked Autofill on this tab → arm manual mode for 30s */
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.type === 'TRIGGER_AUTOFILL' || msg.type === 'MANUAL_AUTOFILL' ||
        msg.action === 'autofill' || msg.action === 'startAutofill' ||
        msg.type === 'OH_AUTOFILL_THIS_PAGE') {
      if (msg.type === 'OH_AUTOFILL_THIS_PAGE' && window.__ohWdEngine && window.__ohWdEngine.takesManual()) return;   // Workday: the engine fills it
      _manualTriggerTs = Date.now();
      _automationCache = { active: true, ts: Date.now() };
      /* Only the top frame drives the fill so we don't run once per iframe. */
      if (window.top === window.self) {
        runManualAutofill({ submit: !!(msg && msg.submit) });
      }
    }
  });

  /* ── v6.1: Auto-dismiss OptimHire "give me a minute" popup ──────────
   * The official extension injects #optimhire-html-click-notification
   * on every ATS page asking the user to wait. On idle browsing this
   * is just visual noise — auto-click OK to close.
   * ────────────────────────────────────────────────────────────────── */
  const OH_POPUP_IDS = [
    'optimhire-html-click-notification',
    'optimhire-html-click-notification-backdrop',
  ];

  async function dismissOhPopup() {
    const popup    = document.getElementById('optimhire-html-click-notification');
    const backdrop = document.getElementById('optimhire-html-click-notification-backdrop');
    if (!popup && !backdrop) return false;
    // v6.6: always remove the popup so the user can manually edit at any time.
    // OptimHire's autofill continues in the background regardless.
    try { popup?.remove(); } catch (_) {}
    try { backdrop?.remove(); } catch (_) {}
    document.body.style.overflow = '';
    LOG('OH popup: removed (manual editing allowed)');
    return true;
  }

  /* Watch for the popup being injected and dismiss immediately */
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (OH_POPUP_IDS.includes(node.id)) {
          dismissOhPopup();
          return;
        }
        // Also catch wrappers that might add the popup as a descendant
        if (node.querySelector && node.querySelector('#optimhire-html-click-notification')) {
          dismissOhPopup();
          return;
        }
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  /* Periodic sweep — covers cases where the popup re-appears */
  setInterval(() => { dismissOhPopup().catch(() => {}); }, 3000);

  /* (Removed: setStopInjectPopup.) It injected an inline <script> to set
   * OPTIMHIRE_CONFIG.STOP_INJECT_POPUP in the page world every 5s. Under
   * Manifest V3 the content-script CSP refuses inline scripts, so it never
   * ran and only logged "Refused to execute inline script" — and even if it
   * had run, OptimHire's own code lives in the isolated world and could not
   * see a page-world variable. The popup is handled by the DOM-level
   * dismissOhPopup() sweep above, which does work. */

  /* ── Auto-skip cap: patch any global OPTIMHIRE_CONFIG object ───────────
   * The autofill script (autofill.73df3a6d.js) exposes its config as a
   * module-internal object. We intercept chrome.runtime.sendMessage here
   * so any AUTO_APPLY_STATE_UPDATE with autoSkipSeconds > 5 is clamped.   */
  const AUTO_SKIP_MAX_SECONDS = 3;    // was 15, then 10

  /* ── T22: Global fill-active + submit-attempted guards ─────────────────
   * _fillActive  = true while any autofill pass is running.
   *               Watchdogs check this before firing skipCurrent.
   * _submitAttempted = true for 30s after we click a submit button.
   *               Sidepanel watchdog honours this to avoid double-skip.
   * ─────────────────────────────────────────────────────────────────── */
  let _fillActive       = false;
  let _submitAttempted  = false;
  let _submitAttemptTs  = 0;

  function markSubmitAttempted() {
    _submitAttempted = true;
    _submitAttemptTs = Date.now();
    qaSnapshot('auto-submit');   // Q&A memory: capture the answers being sent
    try {
      chrome.runtime.sendMessage({ type: 'SUBMIT_ATTEMPTED', ts: _submitAttemptTs }).catch(() => {});
    } catch (_) {}
    // Auto-clear after 30s
    setTimeout(() => { _submitAttempted = false; }, 30_000);
  }

  /* Per-job countdown rescale on the SEND side (content script).
     Same reasoning as the sidepanel-patch.js intercept: a flat
     clamp freezes the displayed countdown at AUTO_SKIP_MAX_SECONDS
     for most of its life. Serve a real local countdown based on
     elapsed time since the first capped value for this job. */
  /* Per-job countdown rescale (content side). Background ticks
     autoSkipSeconds from a large initial value (~180) down to 0;
     flat-clamping every tick to AUTO_SKIP_MAX_SECONDS would show the
     same cap value frozen across many ticks before counting down.
     Instead we serve a real local countdown from AUTO_SKIP_MAX_SECONDS
     → 0 based on elapsed wall time since the first capped value for
     this job. */
  const _countdownByJobSend = Object.create(null);
  function rescaleAutoSkipSeconds(msg) {
    const jobKey = String(msg.url || msg.jobUrl || msg.jobId || msg.id || 'cur');
    const now = Date.now();
    if (!_countdownByJobSend[jobKey]) _countdownByJobSend[jobKey] = now;
    const elapsed = (now - _countdownByJobSend[jobKey]) / 1000;
    return Math.max(0, Math.round(AUTO_SKIP_MAX_SECONDS - elapsed));
  }

  /* ── Rescue: finish the form before OptimHire gives up on it ──────────
   * When OptimHire's own page script can't complete a form (a required
   * question it had no answer for, a submit that bounced) it reports an
   * error — and that error is what ends the job: a 10s skip countdown in
   * auto mode, or waiting for a human in one-job-at-a-time mode. That is
   * where most "skipped, never submitted" jobs came from.
   *
   * OptimHire's page script runs in this same content-script world, so
   * its messages pass through chrome.runtime.sendMessage below. A fixable
   * error is held back while OUR engine fills what is missing (dropdowns,
   * location, required fields) and presses submit. Confirmed → OptimHire
   * is told the application went through. Not confirmed within the time
   * limit → the original error is passed on and OptimHire skips as before.
   * A submit that navigates to a new page is finished by that page (the
   * pending rescue is kept in storage for a minute). */
  const RESCUABLE_ERR_RE = /^(missing-questions|submit-failed|incomplete|failure|submissionError)$/;
  const RESCUE_MS = 30_000;
  let _rescueBusy = false, _rescuedUrl = '', _rescuedTs = 0;
  function isRescuableError(msg) {
    if (!msg || window.top !== window.self) return false;
    if (msg.fromWdEngine) return false;      // the Workday engine already did all it could on that form
    const manualErr = msg.type === 'MANUAL_FORM_ERROR_SUCCESS_MESSAGE' && !msg.isSuccess;
    if (msg.type !== 'COMPLEX_FORM_ERROR' && !manualErr) return false;
    return RESCUABLE_ERR_RE.test(String(msg.errorType || ''));
  }
  function successFor(msg) {
    return msg.type === 'COMPLEX_FORM_ERROR'
      ? { type: 'COMPLEX_FORM_SUCCESS', message: 'successMessage', url: location.href, success_next_job: true }
      : { type: 'MANUAL_FORM_ERROR_SUCCESS_MESSAGE', message: 'Application submitted successfully', url: location.href,
          applicationDetails: msg.applicationDetails, isSuccess: true };
  }
  async function rescueThenReport(msg, send) {
    _rescueBusy = true;
    const deadline = Date.now() + RESCUE_MS;
    let confirmed = false;
    try {
      const d = await ST.get(['ohAutomationDisabled']);
      if (d.ohAutomationDisabled === true) { send(msg); return; }
      LOG(`Rescue: OptimHire reported "${msg.errorType}" — completing the form ourselves before giving up`);
      if (pageConfirmsApplication()) confirmed = true;
      for (let round = 0; !confirmed && round < 2 && Date.now() < deadline; round++) {
        try {
          _fillActive = true;
          await runAtsAutofill();
          try { await detectAndFixValidationErrors(); } catch (_) {}
          try { await sanitizeBadFills(); } catch (_) {}
          try { await answerComboDropdowns(document, await getProfile()); } catch (_) {}
        } catch (_) {} finally { _fillActive = false; }
        if (typeof rescueLocationNow === 'function') { try { await rescueLocationNow(); } catch (_) {} }
        const hit = typeof findAnySubmitButton === 'function' ? findAnySubmitButton() : null;
        if (!hit) { LOG('Rescue: no submit button to press'); break; }
        /* The submit may load a new page — leave a note for it. */
        await ST.set({ ohRescuePending: { ts: Date.now(), origin: location.origin, msg } });
        markSubmitAttempted();
        LOG(`Rescue: pressing ${hit.why}`);
        try { realClick(hit.btn); } catch (_) { try { hit.btn.click(); } catch (__) {} }
        for (let i = 0; i < 20 && Date.now() < deadline; i++) {
          await sleep(500);
          if (pageConfirmsApplication()) { confirmed = true; break; }
        }
      }
      if (confirmed) {
        LOG('Rescue: application confirmed — telling OptimHire it went through');
        _rescuedUrl = location.href; _rescuedTs = Date.now();
        send(successFor(msg));
      } else {
        LOG(`Rescue: could not complete the form — passing on "${msg.errorType}"`);
        await noteFieldFailures(`OptimHire: ${msg.errorType}${msg.message ? ' — ' + String(msg.message).slice(0, 80) : ''}`);
        send(msg);
      }
      await ST.remove('ohRescuePending');
    } catch (_) {
      send(msg);
    } finally {
      _rescueBusy = false;
    }
  }
  /* A rescue whose submit loaded this page: finish it here. */
  (async function finishRescueOnNewPage() {
    try {
      if (window.top !== window.self) return;
      const { ohRescuePending: r } = await ST.get('ohRescuePending');
      if (!r || !r.msg || Date.now() - (r.ts || 0) > 60_000 || r.origin !== location.origin) return;
      await sleep(2500);                                   // let the confirmation render
      const ok = pageConfirmsApplication();
      await ST.remove('ohRescuePending');
      LOG(ok ? 'Rescue: confirmation page after our submit — telling OptimHire it went through'
             : `Rescue: no confirmation after our submit — passing on "${r.msg.errorType}"`);
      chrome.runtime.sendMessage(ok ? successFor(r.msg) : r.msg).catch(() => {});
    } catch (_) {}
  })();

  (function capAutoSkipOnSend() {
    const _orig = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = function (msg, ...args) {
      try {
        if (isRescuableError(msg)) {
          /* Already rescued this page → the job is done; ignore late echoes. */
          if (_rescuedUrl === location.href && Date.now() - _rescuedTs < 60_000) return Promise.resolve();
          if (_rescueBusy) return Promise.resolve();    // the rescue in progress decides
          rescueThenReport(msg, (m) => { try { _orig(m).catch(() => {}); } catch (_) {} });
          return Promise.resolve();
        }
      } catch (_) {}
      try {
        if (msg && msg.type === 'AUTO_APPLY_STATE_UPDATE' &&
            typeof msg.autoSkipSeconds === 'number') {
          if (msg.autoSkipSeconds > AUTO_SKIP_MAX_SECONDS) {
            msg = { ...msg, autoSkipSeconds: rescaleAutoSkipSeconds(msg) };
          } else {
            const jk = String(msg.url || msg.jobUrl || msg.jobId || msg.id || 'cur');
            delete _countdownByJobSend[jk];
          }
        }
      } catch (_) {}
      return _orig(msg, ...args);
    };
  })();

  /* ── T2: Credits never run out ──────────────────────────── */
  const CREDIT_FIELDS = [
    'free_left_credits','leftCredits','remainingCredits',
    'credits','autofillCredits','plan_credits','totalCredits',
    'daily_credits','remaining_credits','autoFillCredits',
    'autofill_credits','free_credits','credit_balance',
    'creditsLeft','creditLeft','availableCredits','available_credits',
  ];
  /* 2.6.0 sidepanel gates the upgrade modal / "Start Applying Manually"
     CTA on copilot_status === "FREE". Force PREMIUM and matching flags. */
  const CREDIT_BOOL_FIELDS = [
    'isCreditLeft','is_credit_left','hasCredits','has_credits',
    'isPremium','is_premium','is_pro','isPro','isPaid','is_paid',
    'isSubscribed','is_subscribed','isUnlimited','is_unlimited',
    'is_copilot_active','is_first_attempt_completed','isUpgraded',
  ];
  /* 2.6.0: copilot_status === "FREE" triggers the upgrade modal /
     "Start Applying Manually" CTA / daily-credit-cap screen. Force
     it to PREMIUM and the FREE-tier code paths never fire. */
  const PLAN_STRING_PATCHES = {
    copilot_status: 'PREMIUM',
    plan: 'premium',
    planName: 'Premium',
    plan_name: 'premium',
    subscriptionPlan: 'premium',
    subscription_plan: 'premium',
    tier: 'premium',
    accountType: 'PREMIUM',
    account_type: 'PREMIUM',
  };
  /* NOTE: We intentionally do NOT zero any "applied count" fields.
     OptimHire uses appliedCount / applied_count for the live
     "X of N applied" progress display (and likely for queue
     advancement). Zeroing them broke that counter (stuck / shuffling
     1↔2). The daily LIMIT is bypassed purely via free_left_credits
     = 9999 + copilot_status = PREMIUM above — the applied COUNT must
     be left untouched. Kept as an empty list so the existing
     references stay valid without doing anything. */
  const COUNTER_ZERO_FIELDS = [];

  function deepPatchCredits(obj, seen) {
    if (!obj || typeof obj !== 'object') return obj;
    seen = seen || new WeakSet();
    if (seen.has(obj)) return obj; // cycle guard
    seen.add(obj);
    CREDIT_FIELDS.forEach(f => { if (f in obj) obj[f] = 9999; });
    CREDIT_BOOL_FIELDS.forEach(f => {
      if (f in obj) {
        const cur = obj[f];
        if (cur === '0' || cur === 0 || cur === false) {
          obj[f] = (typeof cur === 'string') ? '1' : true;
        }
      }
    });
    Object.keys(PLAN_STRING_PATCHES).forEach(f => {
      if (f in obj && typeof obj[f] === 'string') {
        obj[f] = PLAN_STRING_PATCHES[f];
      }
    });
    COUNTER_ZERO_FIELDS.forEach(f => {
      if (f in obj && typeof obj[f] === 'number' && obj[f] > 0) obj[f] = 0;
    });
    Object.keys(obj).forEach(k => {
      if (obj[k] && typeof obj[k] === 'object') obj[k] = deepPatchCredits(obj[k], seen);
    });
    return obj;
  }

  async function enforceCredits() {
    try {
      const keys = ['candidateDetails','userDetails','planDetails',
                    'subscriptionDetails','cachedSeekerInfo','seekerDetails',
                    'appliedCount','isManualAppliedCount'];
      const data = await ST.get(keys);
      const upd = {};
      keys.forEach(k => {
        if (data[k] == null) return;
        try {
          if (typeof data[k] === 'number' && COUNTER_ZERO_FIELDS.includes(k)) {
            if (data[k] > 0) upd[k] = 0;
            return;
          }
          const wasStr = typeof data[k] === 'string';
          if (wasStr && !/^[\[{]/.test(data[k].trim())) return; // not JSON
          const parsed = wasStr ? JSON.parse(data[k]) : data[k];
          if (!parsed || typeof parsed !== 'object') return;
          const before = JSON.stringify(parsed);
          const patched = deepPatchCredits(JSON.parse(before));
          /* Only write keys the patch actually changed. This used to rewrite
             every profile/plan key every 20s in EVERY tab — constant
             storage-change churn across all tabs, and a read-then-write that
             could overwrite a fresh profile OptimHire saved in between. */
          if (JSON.stringify(patched) === before) return;
          upd[k] = wasStr ? JSON.stringify(patched) : patched;
        } catch (_) {}
      });
      if (Object.keys(upd).length) await ST.set(upd);
    } catch (_) {
      // Extension context may have been invalidated (e.g. after reload) — ignore
    }
  }

  enforceCredits().catch(() => {});
  setInterval(() => enforceCredits().catch(() => {}), 20_000);

  /* Intercept storage reads to always return 9999 credits */
  const _origGet = chrome.storage.local.get.bind(chrome.storage.local);
  chrome.storage.local.get = function (keys, cb) {
    const patchResult = result => {
      Object.keys(result).forEach(k => {
        const v = result[k];
        if (v && typeof v === 'object') {
          try {
            result[k] = deepPatchCredits(
              typeof v === 'string' ? JSON.parse(v) : JSON.parse(JSON.stringify(v))
            );
          } catch (_) {}
        } else if (typeof v === 'string' && /^[\[{]/.test(v.trim())) {
          try {
            const parsed = JSON.parse(v);
            if (parsed && typeof parsed === 'object') {
              result[k] = JSON.stringify(deepPatchCredits(parsed));
            }
          } catch (_) {}
        } else if (typeof v === 'number' && COUNTER_ZERO_FIELDS.includes(k) && v > 0) {
          result[k] = 0;
        }
      });
      return result;
    };
    if (typeof cb === 'function') {
      try {
        return _origGet(keys, result => cb(patchResult(result)));
      } catch (_) {
        // Extension context invalidated — return empty result
        try { cb({}); } catch (__) {}
        return;
      }
    }
    return _origGet(keys).then(patchResult).catch(() => ({}));
  };

  /* Intercept storage WRITES so anything saved back also has patched
     values — even if background writes new candidateDetails from a
     server response, the persisted copy stays premium. */
  const _origSet = chrome.storage.local.set.bind(chrome.storage.local);
  chrome.storage.local.set = function (items, cb) {
    try {
      if (items && typeof items === 'object') {
        Object.keys(items).forEach(k => {
          const v = items[k];
          if (v && typeof v === 'object') {
            try { items[k] = deepPatchCredits(JSON.parse(JSON.stringify(v))); } catch (_) {}
          } else if (typeof v === 'string' && /^[\[{]/.test(v.trim())) {
            try {
              const parsed = JSON.parse(v);
              if (parsed && typeof parsed === 'object') {
                items[k] = JSON.stringify(deepPatchCredits(parsed));
              }
            } catch (_) {}
          } else if (typeof v === 'number' && COUNTER_ZERO_FIELDS.includes(k) && v > 0) {
            items[k] = 0;
          }
        });
      }
    } catch (_) {}
    if (typeof cb === 'function') {
      try { return _origSet(items, cb); }
      catch (_) { try { cb(); } catch (__) {} return; }
    }
    return _origSet(items).catch(() => {});
  };

  /* ── T14: Wake Lock — NO AudioContext (fixes "not allowed to start") ── */
  let _wakeLock = null;
  let _wakeLockInterval = null;

  async function acquireWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        _wakeLock = await navigator.wakeLock.request('screen');
        _wakeLock.addEventListener('release', () => setTimeout(acquireWakeLock, 1000));
        LOG('Wake lock acquired');
        return;
      } catch (_) {
        /* Fall through to mousemove fallback */
      }
    }
    /* Fallback: simulated mouse activity only — NO AudioContext */
    if (!_wakeLockInterval) {
      _wakeLockInterval = setInterval(() => {
        document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
      }, 45_000);
      LOG('Wake lock fallback: mousemove interval started');
    }
  }

  chrome.runtime.onMessage.addListener(msg => {
    if (['start_pilot_web','START_AUTOMATION','pilot_started','CSV_JOB_START']
        .includes(msg?.type)) acquireWakeLock();
  });
  ST.get('isAutoProcessStartJob').then(d => {
    if (d?.isAutoProcessStartJob) acquireWakeLock();
  });

  /* ── Single-tab ownership for page-side automation ───────────────────
   * This content script runs in EVERY tab. With two OptimHire tabs open
   * both were pressing Apply and driving applications at once — the user
   * saw applying jump between tab 1 and tab 2, and the browser bogged
   * down under the duplicated work.
   *
   * Content scripts cannot read their own tab id, so ownership is
   * elected through storage with a heartbeat: one instance holds
   * ohTabOwner {id, ts}; others stand down. If the owner stops
   * heartbeating (tab closed/navigated) another claims it within
   * OWNER_STALE_MS.
   * ────────────────────────────────────────────────────────────────── */
  const _OWNER_ID = 'oh_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const OWNER_STALE_MS = 12_000;
  let _ownerCache = { own: false, ts: 0 };

  async function isAutomationOwnerTab() {
    /* Cache so a 2s loop doesn't hit storage constantly. */
    if (Date.now() - _ownerCache.ts < 2000) return _ownerCache.own;
    try {
      const d = await ST.get(['ohTabOwner']);
      const cur = d && d.ohTabOwner;
      const now = Date.now();
      let own;
      if (cur && cur.id === _OWNER_ID) {
        await ST.set({ ohTabOwner: { id: _OWNER_ID, ts: now } });   // heartbeat
        own = true;
      } else if (!cur || !cur.ts || now - cur.ts > OWNER_STALE_MS) {
        await ST.set({ ohTabOwner: { id: _OWNER_ID, ts: now } });   // claim
        own = true;
      } else {
        own = false;                                                // someone else owns it
      }
      _ownerCache = { own, ts: now };
      return own;
    } catch (_) { return true; }   // storage unavailable → act alone
  }
  /* Release ownership when this tab goes away so the next one can act
     immediately rather than waiting for the heartbeat to go stale. */
  try {
    window.addEventListener('pagehide', () => {
      try {
        ST.get(['ohTabOwner'], (d) => {
          if (d && d.ohTabOwner && d.ohTabOwner.id === _OWNER_ID) ST.set({ ohTabOwner: null });
        });
      } catch (_) {}
    });
  } catch (_) {}

  /* ── Auto-press "Apply" on optimhire.com's job-apply page ────────────
   * OptimHire's WEB APP (optimhire.com/d/job-apply) renders its own
   * Skip / Apply pair at the bottom of each job, separate from the one
   * inside the extension sidepanel. The sidepanel clicker lives in
   * sidepanel-patch.js and only runs in the sidepanel document, so the
   * page's Apply button was never pressed and the run stalled waiting
   * for a human click.
   *
   * The button is icon-first markup:
   *   <button><span><img alt=""></span><span>Apply</span></button>
   * so we match on the button's own text, plus aria-label/title as a
   * fallback, and explicitly reject the Skip (thumbs-down) twin.
   * ────────────────────────────────────────────────────────────────── */
  (function installPageApplyClicker() {
    if (!/(^|\.)optimhire\.com$/i.test(location.hostname)) return;
    if (window.top !== window.self) return;

    const COOLDOWN_MS = 2500;        // was 4s — still once per job (see jobKey)
    let _lastClickTs = 0;
    let _lastKey = '';

    function labelOf(b) {
      const txt = ((b.innerText || b.textContent || '') + '').replace(/\s+/g, ' ').trim();
      if (txt) return txt;
      return ((b.getAttribute && (b.getAttribute('aria-label') || b.getAttribute('title'))) || '').trim();
    }

    function findApplyButton() {
      const els = document.querySelectorAll('button,[role="button"]');
      for (const b of els) {
        if (!b || b.disabled) continue;
        if (!isVisible(b)) continue;
        const t = labelOf(b);
        if (!/^apply$/i.test(t)) continue;
        /* Never the Skip twin, and never a link that just opens a page. */
        if (/skip/i.test((b.className || '') + ' ' + t)) continue;
        return b;
      }
      return null;
    }

    /* Identify the current job so we press Apply at most once per job.
       Not "the first h1/h2": on this page that is the fixed "Explore Our
       Success Stories" heading, the same for every job — so after the
       first job Apply was never pressed again, and each later job sat
       until a timeout skipped it. The job's own title (h1.jva-job-title),
       its company line and the "Job N of …" counter change per job. */
    function jobKey() {
      try {
        const own = el => ((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();
        const title = document.querySelector('.jva-job-title') ||
                      [...document.querySelectorAll('h1')].find(isVisible) || null;
        const head = title && title.closest('[class*="job-head"]');
        const counter = [...document.querySelectorAll('div,span,p')].find(e => e.children.length === 0 && /^job \d+ of\b/i.test(own(e)));
        return [own(title), own(head && head.parentElement), own(counter)].filter(Boolean).join(' | ').slice(0, 240);
      } catch (_) { return ''; }
    }

    async function tick() {
      try {
        if (Date.now() - _lastClickTs < COOLDOWN_MS) return;
        /* Only while the user has actually engaged auto-apply (or a
           session/queue is running) — never while they are just browsing
           jobs by hand. */
        const d = await ST.get(AUTOMATION_KEYS.concat(['copilotTabId']));
        if (!mayAutomate(d)) return;
        /* Only one tab may drive applications: the pinned job tab, or —
           when no side panel is pinning — the elected owner. */
        if (!isPingedJobTab() && !(await isAutomationOwnerTab())) return;
        /* OptimHire drops copilotTabId whenever a run stops or completes;
           pressing Apply then makes it adopt whatever tab is in FRONT as
           the job tab (the user's LinkedIn, say). Put the pin back first. */
        if (jobTabPinned(d) && d.copilotTabId == null) {
          await ST.set({ copilotTabId: d.ohJobTab.id });
        }
        if (_submitAttempted && Date.now() - _submitAttemptTs < 30_000) return;
        const btn = findApplyButton();
        if (!btn) return;
        const key = jobKey();
        if (key && key === _lastKey) return;   // already applied to this job
        _lastKey = key;
        _lastClickTs = Date.now();
        LOG(`Auto-pressing Apply on job-apply page${key ? ' — ' + key : ''}`);
        /* Tells the background this job was started by the automation, so
           "ATS first, Reed last" may hold a Reed job back (oh-bg.js). */
        await ST.set({ ohAutoPressTs: Date.now() });
        try { realClick(btn); } catch (_) { try { btn.click(); } catch (__) {} }
      } catch (_) {}
    }
    setInterval(tick, 1000);
  })();

  /* ── Location typeahead rescue ───────────────────────────────────────
   * A required "Location" combobox left empty is the single most common
   * reason a fully-filled application still cannot be submitted (the
   * sidebar sits on "Review and submit the form" while the ATS keeps the
   * field flagged). These widgets ignore a plain value assignment: they
   * need real keystrokes to open their menu and a click on an option to
   * commit a selection.
   *
   * Runs on a timer so it also rescues fields the main fill pass missed,
   * and retries a bounded number of times per URL.
   * ────────────────────────────────────────────────────────────────── */
  let rescueLocationNow = null;   // set below; lets a fill pass pick the location suggestion straight away
  (function installLocationTypeaheadRescue() {
    if (window.top !== window.self) return;
    if (/(^|\.)optimhire\.com$/i.test(location.hostname)) return;

    const LOC_RE = /location|residence|where.*(based|live|located)|city|country|town/i;
    const MAX_TRIES = 3;
    let _tries = 0, _forUrl = '', _busy = false;

    function isEmptyInput(el) {
      return !el.value || !el.value.trim();
    }
    /* Text typed but no suggestion chosen: the site flags the field
       (aria-invalid or an error message next to it). Greenhouse's
       "Location (City)" sat like this — filled-looking, never accepted. */
    /* Only THIS field's own error counts: the old check looked in any
       "[class*=field]" box, saw the Phone field's "This field is required."
       under Workable's Address, and re-typed the address over and over. */
    const looksInvalid = fieldFlagged;
    /* Lever's city box has no combobox markup: a suggestion only counts once
       its hidden selectedLocation holds the same name (from NextRaise's
       Lever adapter). Typed text alone left Lever's form unsubmittable. */
    const isLeverLocation = el => el.matches('input.location-input[name="location"]') && !!el.closest('.application-field');
    function leverPicked(el) {
      const sel = el.closest('.application-field').querySelector('input[type="hidden"][name="selectedLocation"]');
      let name = '';
      try { name = (JSON.parse((sel && sel.value) || '{}') || {}).name || ''; } catch (_) {}
      return !!name && name.trim() === (el.value || '').trim();
    }
    const _retriedInvalid = new WeakSet();
    /* Candidate typeahead inputs: required, visible, empty, location-ish. */
    function findLocationInputs() {
      const out = [];
      const inputs = $$('input[type=text],input:not([type]),input[type=search],[role="combobox"] input')
        .filter(isVisible);
      for (const el of inputs) {
        if (isPageChromeField(el)) continue;           // the site's own job-search "Where" box
        const lbl = (getLabel(el) || '') + ' ' + (el.placeholder || '') + ' ' +
                    (el.getAttribute('aria-label') || '');
        const lever = isLeverLocation(el);
        if (!lever && !LOC_RE.test(lbl)) continue;
        if (lever ? leverPicked(el) : (!isEmptyInput(el) && !looksInvalid(el))) continue;
        if (lever) { out.push({ el, lbl: lbl.trim() || 'Location' }); continue; }
        const req = el.required || el.getAttribute('aria-required') === 'true' ||
                    !!el.closest('[class*="required"]');
        /* Only bother with fields that are actually required, or that are
           clearly combobox widgets waiting on a selection. */
        const isCombo = el.getAttribute('role') === 'combobox' ||
                        el.getAttribute('aria-autocomplete') ||
                        !!el.closest('[role="combobox"]');
        if (!req && !isCombo) continue;
        out.push({ el, lbl });
      }
      return out;
    }

    function pressKey(el, key) {
      for (const type of ['keydown', 'keyup']) {
        try {
          el.dispatchEvent(new KeyboardEvent(type, {
            key, code: key, bubbles: true, cancelable: true
          }));
        } catch (_) {}
      }
    }

    /* The suggestion list that belongs to `el` when it names one, else any
       open option list. (A loose "[class*=menu] li" once matched the site's
       own menus, and the first entry of whatever list was open got clicked
       — how "Waterford, Ireland" ended up in the address.) */
    function ownList(el) {
      const id = el && (el.getAttribute('aria-controls') || el.getAttribute('aria-owns'));
      const lb = id && document.getElementById(id);
      return lb && isVisible(lb) ? lb : null;
    }
    function visibleOptions(el) {
      if (el && isLeverLocation(el)) return $$('.dropdown-container .dropdown-results > .dropdown-location', el.closest('.application-field')).filter(isVisible);
      const lb = ownList(el);
      return $$(
        '[role="option"],[class*="react-select__option"],[class*="Select__option"],' +
        '[class*="select2-results__option"],[role="listbox"] li,.pac-item', lb || document
      ).filter(isVisible);
    }

    async function fillOne(entry, value) {
      const el = entry.el;
      try { el.focus(); } catch (_) {}
      /* Type the value so the widget's own listeners run. */
      nativeSet(el, value);
      pressKey(el, 'ArrowDown');            // many widgets open on ArrowDown
      await sleep(900);                      // let async option lookup finish

      const want = String(value).split(',')[0].trim().toLowerCase();
      /* Best first: the city AND your country ("Dublin, … Ireland" before
         "Dublin, Ohio, United States"), then the city alone. */
      const parts = String(value).split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
      const country = parts.length > 1 ? parts[parts.length - 1] : '';
      const ALIAS = { ie: 'ireland', irl: 'ireland', uk: 'united kingdom', gb: 'united kingdom', 'great britain': 'united kingdom',
                      us: 'united states', usa: 'united states', 'united states of america': 'united states', uae: 'united arab emirates' };
      const norm = c => ALIAS[c] || c;
      const score = o => {
        const ps = (o.textContent || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
        return (ps[0] === want ? 2 : 1) + (country && ps.length > 1 && norm(ps[ps.length - 1]) === norm(country) ? 4 : 0);
      };
      const matching = () => visibleOptions(el).filter(o => (o.textContent || '').toLowerCase().includes(want))
        .map((o, i) => ({ o, i, s: score(o) })).sort((a, b) => b.s - a.s || a.i - b.i).map(x => x.o);
      let opts = matching();
      if (!opts.length) {                    // retry with a shorter query
        const short = String(value).split(',')[0].trim();
        if (short && short !== value) {
          nativeSet(el, short);
          pressKey(el, 'ArrowDown');
          await sleep(900);
          opts = matching();
        }
      }
      if (!opts.length && ownList(el)) opts = visibleOptions(el);   // the field's own list: its best guess
      if (opts.length) {
        const best = opts[0];
        try { realClick(best); } catch (_) { try { best.click(); } catch (__) {} }
        await sleep(300);
        LOG(`Location typeahead: selected "${(best.textContent || '').trim().slice(0, 60)}" for "${entry.lbl.trim().slice(0, 40)}"`);
        return true;
      }
      /* No menu appeared — commit the typed text with Enter as a last
         resort (some widgets accept free text). */
      pressKey(el, 'Enter');
      await sleep(200);
      LOG(`Location typeahead: no options for "${entry.lbl.trim().slice(0, 40)}" — committed typed value`);
      return !isEmptyInput(el);
    }

    async function tick() {
      if (_busy) return;
      try {
        if (location.href !== _forUrl) { _forUrl = location.href; _tries = 0; }
        if (_fillActive || wdEngineOwns()) return;
        if (!(await isAutomationActive())) return;
        /* Only rescue fields on the tab that is actually the current job. */
        if (!(await isActiveJobTab())) return;
        let targets = findLocationInputs();
        if (!targets.length) return;
        if (_tries >= MAX_TRIES) {
          /* Out of tries — but a field the site has since flagged invalid
             gets one more go (once per field). */
          targets = targets.filter(t => !isEmptyInput(t.el) && !_retriedInvalid.has(t.el));
          if (!targets.length) return;
          targets.forEach(t => _retriedInvalid.add(t.el));
        }
        _busy = true;
        _tries++;
        const p = await getProfile();
        for (const t of targets) {
          let val = guessValue(t.lbl, p);
          if (!val) val = `${(p && p.city) || 'Dublin'}, ${(p && p.country) || 'Ireland'}`;
          await fillOne(t, val);
        }
      } catch (e) {
        LOG('Location typeahead error', e);
      } finally { _busy = false; }
    }
    setInterval(tick, 4000);
    rescueLocationNow = tick;
  })();

  /* ── Answers that went in wrong (seen on Greenhouse) ─────────────────
   * Three things OptimHire's own answers put into forms, fixed once the
   * page has settled (so OptimHire's fill is finished):
   *   • a required essay answered "N/A" → a real answer from your profile
   *     (or a sound general one);
   *   • an essay holding a CV / cover-letter contact header ("MAXMILLIAM
   *     OKAFOR, MSC (+353) 87… | email | linkedin…") → the header taken
   *     off, keeping the letter under it, or a real answer if nothing is
   *     left;
   *   • "Where are you located?" asked as a list of regions, answered
   *     "United States/Canada" (or left empty and flagged) → the region
   *     your country is in (Europe / EMEA / UK & Ireland … for Ireland). */
  (function installAnswerRepair() {
    if (window.top !== window.self && !/greenhouse|lever|ashby|workable|smartrecruiters/i.test(location.hostname)) return;
    const SETTLE_MS = 3000;
    const seen = new Map(), done = new WeakSet();
    const settled = (el) => { const t = seen.get(el); if (!t) { seen.set(el, Date.now()); return false; } return Date.now() - t >= SETTLE_MS; };
    const JUNK_RE = /^\s*(n\/?a|na|none|nil|null|-+|\.+|not applicable|no answer)\s*\.?\s*$/i;
    const ESSAY_LABEL_RE = /\bwhy\b|describe|tell us|explain|about yourself|motivat|interest(ed)? in|what (excites|interests|attracts)|problem|challenge|project|accomplish|achievement|proud|experience with|how (have|would|do) you|cover letter|additional information/i;
    const isRequired = (el, lbl) => el.required || el.getAttribute('aria-required') === 'true' || /\*\s*$/.test(lbl || '');
    function contactHeader(v) {
      const head = v.slice(0, 320);
      return /[\w.+-]+@[\w-]+\.[\w.]+/.test(head) && (/(\+?\d[\d\s().-]{8,}\d)/.test(head) || /linkedin\.com|github\.com/i.test(head));
    }
    function withoutHeader(v) {
      const lines = v.split(/\r?\n/);
      let i = 0;
      while (i < lines.length && i < 8) {
        const l = lines[i].trim();
        if (!l || /@|linkedin|github|https?:\/\/|www\.|\+?\d[\d\s().-]{7,}\d|^[A-Z][A-Z .,'’-]{3,}$|\|/.test(l) || l.split(/\s+/).length < 5) { i++; continue; }
        break;
      }
      return lines.slice(i).join('\n').trim();
    }
    async function repairEssays(p) {
      for (const el of $$('textarea, input[type="text"]:not([role="combobox"])').filter(isVisible)) {
        if (done.has(el) || isPageChromeField(el)) continue;
        const v = (el.value || '').trim();
        if (!v) continue;
        const lbl = (getLabel(el) || '').trim();
        if (!lbl || !ESSAY_LABEL_RE.test(lbl)) continue;
        const junk = JUNK_RE.test(v) && isRequired(el, lbl);
        const header = el.tagName === 'TEXTAREA' && contactHeader(v);
        if (!junk && !header) continue;
        if (!settled(el)) continue;
        done.add(el);
        let next = '';
        if (header) {
          const body = withoutHeader(v);
          if (body.length >= 80) next = body;
        }
        if (!next) {
          const g = String(guessValue(lbl.replace(/\*/g, ''), p, el.tagName === 'TEXTAREA' ? 'textarea' : 'text') || '').trim();
          if (g.length > 20 && !JUNK_RE.test(g)) next = g;
        }
        if (!next || next === v) continue;
        el.focus();
        nativeSet(el, next);
        el.blur();
        LOG(`Answer repair: "${lbl.slice(0, 60)}" — ${header ? 'CV contact header removed' : '"' + v + '" replaced'}`);
      }
    }

    const REGION_Q_RE = /where (are you|do you) (currently )?(located|based|live|reside)|which (region|country|location|time ?zone)[^?]{0,40}(located|based|live|in)\b|(current|your) (region|country) of residence|(country|region) of residence|location \(region\)|what region/i;
    const EUROPE_RE = /ireland|united kingdom|\buk\b|england|scotland|wales|britain|germany|france|spain|portugal|italy|netherlands|belgium|poland|sweden|norway|denmark|finland|austria|switzerland|czech|romania|greece|hungary|ukraine|luxembourg|estonia|latvia|lithuania|croatia|slovakia|slovenia|bulgaria/i;
    const AMERICAS_RE = /united states|\busa?\b|america|canada/i;
    function regionWants(country) {
      const c = String(country || '').toLowerCase();
      const out = [];
      if (c) out.push(c);
      if (/ireland/.test(c)) out.push('republic of ireland', 'uk & ireland', 'uk and ireland', 'uk/ireland', 'ireland');
      if (/united kingdom|\buk\b|england|scotland|wales|britain/.test(c)) out.push('united kingdom', 'uk', 'uk & ireland', 'great britain');
      if (EUROPE_RE.test(c)) out.push('europe', 'emea', 'eu');
      if (/united states|\busa?\b/.test(c)) out.push('united states', 'usa', 'us', 'north america', 'americas');
      if (/canada/.test(c)) out.push('canada', 'north america', 'americas');
      if (/nigeria|ghana|kenya|south africa|egypt|morocco|uganda|tanzania|cameroon/.test(c)) out.push('africa', 'emea');
      if (/india|pakistan|bangladesh|singapore|philippines|japan|china|korea|malaysia|indonesia|australia|new zealand/.test(c)) out.push('apac', 'asia');
      if (!AMERICAS_RE.test(c)) out.push('outside the us', 'outside of the us', 'outside the united states', 'international', 'rest of world', 'rest of the world', 'other');
      return out;
    }
    const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    function pickRegion(texts, wants) {
      for (const w of wants) {
        const re = new RegExp('(^|[^a-z])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z]|$)');
        const hit = texts.find(t => norm(t) === w) || texts.find(t => re.test(norm(t)));
        if (hit) return hit;
      }
      return null;
    }
    function acceptable(current, wants, country) {
      if (!current) return false;
      if (AMERICAS_RE.test(current) && !AMERICAS_RE.test(country || '')) return false;
      return !!pickRegion([current], wants);
    }
    async function repairRegions(p) {
      const country = p.country || '';
      if (!country) return;
      const wants = regionWants(country);
      for (const sel of $$('select').filter(isVisible)) {
        const lbl = (getLabel(sel) || '').trim();
        if (!REGION_Q_RE.test(lbl) || done.has(sel)) continue;
        const cur = sel.selectedIndex >= 0 && sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].value ? sel.options[sel.selectedIndex].text : '';
        if (acceptable(cur, wants, country) || !settled(sel)) continue;
        const opts = [...sel.options].filter(o => o.value);
        const hit = pickRegion(opts.map(o => o.text), wants);
        done.add(sel);
        if (!hit) continue;
        const opt = opts.find(o => o.text === hit);
        sel.value = opt.value;
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        LOG(`Answer repair: "${lbl.slice(0, 50)}" ${cur ? `"${cur}" → ` : '→ '}"${hit}" (you are in ${country})`);
      }
      for (const input of $$('input').filter(i => isComboInput(i))) {
        const ctl = comboControl(input);
        if (!isVisible(ctl || input) || done.has(input)) continue;
        const lbl = (getLabel(input) || getLabel(ctl) || '').trim();
        if (!REGION_Q_RE.test(lbl)) continue;
        const cur = comboSelectedText(input);
        const flagged = fieldFlagged(input) || fieldFlagged(ctl || input);
        if ((acceptable(cur, wants, country) && !flagged) || !settled(input)) continue;
        done.add(input);
        try { realClick(ctl || input); } catch (_) {}
        try { input.focus(); } catch (_) {}
        nativeSet(input, '');
        try { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true, cancelable: true })); } catch (_) {}
        await sleep(450);
        const opts = comboOptions();
        const hitText = pickRegion(opts.map(o => (o.textContent || '').trim()), wants);
        const hit = hitText && opts.find(o => (o.textContent || '').trim() === hitText);
        if (!hit) { try { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); input.blur(); } catch (_) {} continue; }
        try { realClick(hit); } catch (_) { try { hit.click(); } catch (__) {} }
        await sleep(250);
        LOG(`Answer repair: "${lbl.slice(0, 50)}" ${cur ? `"${cur}" → ` : '→ '}"${hitText}" (you are in ${country})`);
      }
    }

    let busy = false;
    async function tick() {
      if (busy || _IS_OH_PAGE || wdEngineOwns()) return;
      if (!(Date.now() - _manualTriggerTs < 90_000 || ((await isAutomationActive()) && (window.top !== window.self || await isActiveJobTab())))) return;
      busy = true;
      try {
        const p = await getProfile();
        await repairEssays(p);
        await repairRegions(p);
      } catch (e) { LOG('Answer repair error', e); }
      finally { busy = false; }
    }
    setInterval(tick, 2000);
  })();

  /* ── Oracle Recruiting Cloud (…/hcmUI/CandidateExperience) ───────────
   * Oracle's application (JPMorgan, Goldman Sachs, Dell, EY…) has pieces
   * the generic filler doesn't handle — ideas from the Jobright build:
   *   • "Confirm Your Identity": a code is emailed, then typed one digit
   *     per box. With "Read verification codes from my signed-in Gmail" on
   *     (Queue Manager → Workday sign-in) the code is read from your Gmail
   *     (oh-bg.js 10), typed and VERIFY pressed; "Keep me signed in" is
   *     ticked. Off, a run skips the job at once instead of waiting.
   *   • Pill buttons ("Female | Male | Prefer not to say", "I consent"):
   *     a required group left unanswered is answered — equality questions
   *     with "prefer not to say", consent with "I consent", the rest from
   *     your profile's answers.
   *   • Typeaheads that show "No results were found." (a value typed but
   *     never picked): searched again by its first word and the closest
   *     suggestion picked. The postal code is SW1W 0RH, as asked.
   *   • Address Line 1 holding a country name while Line 2 holds the
   *     street: put right. */
  (function installOracleCx() {
    if (window.top !== window.self) return;
    const isOracle = () => /(^|\.)oraclecloud\.com$/i.test(location.hostname) || /\/hcmUI\/CandidateExperience/i.test(location.pathname);
    if (!isOracle()) return;
    const ORACLE_POSTCODE = 'SW1W 0RH';
    const SETTLE_MS = 3500;                 // leave OptimHire's own fill time to finish first
    const txt = el => ((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();
    const firstSeen = new Map();
    const settled = key => { const t = firstSeen.get(key); if (!t) { firstSeen.set(key, Date.now()); return false; } return Date.now() - t >= SETTLE_MS; };
    let busy = false, pin = { since: 0, typed: '', resent: false, gaveUp: false };

    async function active() {
      if (Date.now() - _manualTriggerTs < 90_000) return true;
      return (await isAutomationActive()) && (await isActiveJobTab());
    }

    /* ── identity code ── */
    const PIN_RE = /confirm your identity|verification code (was|has been) sent|we (sent|emailed) (you )?a (verification |security |one-time )?code|enter the (verification |security )?code/i;
    function codeBoxes() {
      const ins = $$('input').filter(i => isVisible(i) && !/^(hidden|checkbox|radio|submit|button|email|password|file)$/i.test(i.type || ''));
      const singles = ins.filter(i => i.getAttribute('maxlength') === '1');
      if (singles.length >= 4) return singles;
      const one = ins.find(i => /one-time-code/i.test(i.getAttribute('autocomplete') || '') ||
        /\b(code|pin|otp|passcode)\b/i.test([i.name, i.id, i.getAttribute('aria-label'), i.placeholder].join(' ')));
      return one ? [one] : [];
    }
    const onPinScreen = () => PIN_RE.test(txt(document.body).slice(0, 4000)) && codeBoxes().length > 0;
    async function typeCode(code) {
      const keep = $$('input[type="checkbox"]').find(c => !c.checked && /keep me signed in/i.test(txt(c.closest('label,div,span')) || ''));
      if (keep) realClick(keep);
      const boxes = codeBoxes();
      if (boxes.length === 1) { boxes[0].focus(); nativeSet(boxes[0], code); }
      else {
        for (let i = 0; i < boxes.length && i < code.length; i++) {
          boxes[i].focus();
          nativeSet(boxes[i], code[i]);
          boxes[i].dispatchEvent(new KeyboardEvent('keyup', { key: code[i], bubbles: true }));
          await sleep(90);
        }
      }
      await sleep(400);
      const verify = $$('button,[role="button"],input[type="submit"]').find(b => isVisible(b) && !b.disabled &&
        /^(verify|confirm|submit|continue|next)$/i.test(txt(b) || b.value || ''));
      if (verify) realClick(verify);
    }
    async function skipForCode(why) {
      if (pin.gaveUp) return;
      pin.gaveUp = true;
      LOG(`Oracle: ${why}`);
      if (Date.now() - _manualTriggerTs < 90_000) return;        // you are here: it's yours to type
      requestSkipCurrent(`Oracle: ${why}`);
    }
    async function handlePin() {
      if (!pin.since) { pin = { since: Date.now(), typed: '', resent: false, gaveUp: false }; LOG('Oracle: "Confirm Your Identity" — a code was emailed'); }
      if (pin.gaveUp) return;
      const { ohGmailCodes } = await ST.get('ohGmailCodes');
      if (ohGmailCodes !== true) return skipForCode('it wants the code it emailed — turn on "Read verification codes from my signed-in Gmail" in the Queue Manager to have it typed for you');
      let r = null;
      try {
        r = await chrome.runtime.sendMessage({ type: 'OH_MAIL_FIND_CODE', hosts: [location.hostname],
          companies: [txt($('h1,[class*="job-title" i]')).slice(0, 60)], since: pin.since });
      } catch (_) {}
      if (r && r.ok && r.code && r.code !== pin.typed) {
        pin.typed = r.code;
        LOG('Oracle: code found in your Gmail — typing it');
        await typeCode(r.code);
        return;
      }
      if (r && r.reason === 'gmail-not-signed-in') return skipForCode('Gmail is not signed in in this browser, so the emailed code can\'t be read');
      if (!pin.resent && Date.now() - pin.since > 50_000) {
        pin.resent = true;
        const again = $$('a,button,[role="button"]').find(b => isVisible(b) && /send (a )?new code|resend( code)?/i.test(txt(b)));
        if (again) { realClick(again); LOG('Oracle: no code yet — pressed "Send New Code"'); }
      }
      if (Date.now() - pin.since > 120_000) return skipForCode('no verification code arrived within 2 minutes');
    }

    /* ── pill buttons ── */
    const PILL_SKIP_RE = /^(next|back|submit|continue|apply|cancel|close|save|verify|sign in|send new code|edit|add|remove|delete|upload|browse|attach|review|done|ok)\b/i;
    const isPicked = b => b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-checked') === 'true' ||
      b.getAttribute('aria-selected') === 'true' || /(^|[\s_-])(selected|active|checked|is-selected)([\s_-]|$)/i.test(b.className || '');
    function pillGroups() {
      const byBox = new Map();
      for (const b of $$('button,[role="radio"]')) {
        if (!isVisible(b) || b.closest('header,nav,footer,[role="dialog"]')) continue;
        const t = txt(b);
        if (!t || t.length > 60 || PILL_SKIP_RE.test(t) || b.type === 'submit') continue;
        let box = b.parentElement;
        if (box && box.querySelectorAll('button,[role="radio"]').length < 2) box = box.parentElement;
        if (!box) continue;
        if (!byBox.has(box)) byBox.set(box, []);
        byBox.get(box).push(b);
      }
      return [...byBox.entries()].filter(([, bs]) => bs.length >= 2 && bs.length <= 12);
    }
    function questionOf(box) {
      const by = box.getAttribute('aria-labelledby');
      const named = by && document.getElementById(by.split(/\s+/)[0]);
      if (named && txt(named)) return txt(named);
      for (let n = box, i = 0; n && i < 4; n = n.parentElement, i++) {
        for (let sib = n.previousElementSibling; sib; sib = sib.previousElementSibling) {
          const t = txt(sib);
          if (t && t.length >= 3 && t.length <= 600 && !sib.querySelector('button,input,select,textarea')) return t;
        }
      }
      return '';
    }
    const PREFER_NOT_RE = /prefer not|decline|do not wish|don[’']?t wish|not to (say|answer|disclose)|rather not|choose not|i do not want/i;
    const EQUALITY_RE = /gender|transgender|sexual orientation|pronoun|disabilit|veteran|ethnic|\brace\b|religio|marital|\bsex\b|lgbt/i;
    function choosePill(q, pills, p) {
      const names = pills.map(b => txt(b).toLowerCase());
      if (EQUALITY_RE.test(q)) { const i = names.findIndex(n => PREFER_NOT_RE.test(n)); if (i >= 0) return pills[i]; }
      if (/consent|agree|acknowledge|accept/i.test(q)) {
        const i = names.findIndex(n => /^(i\s+)?(consent|agree|accept|acknowledge|yes)\b/.test(n) && !/\b(not|don[’']?t)\b/.test(n));
        if (i >= 0) return pills[i];
      }
      const a = String(guessValue(q, p, 'radio') || '').trim().toLowerCase();
      if (!a) return null;
      let i = names.findIndex(n => n === a);
      if (i < 0) i = names.findIndex(n => n.startsWith(a) || a.startsWith(n));
      if (i < 0 && /^(yes|no)\b/.test(a)) i = names.findIndex(n => n.split(/\W/)[0] === a.split(/\W/)[0]);
      return i >= 0 ? pills[i] : null;
    }
    async function answerPills(p) {
      let n = 0;
      for (const [box, pills] of pillGroups()) {
        if (pills.some(isPicked)) continue;
        const q = questionOf(box);
        if (!q || !(/\*/.test(q) || EQUALITY_RE.test(q))) continue;
        if (!settled('pill|' + q)) continue;
        const pick = choosePill(q.replace(/\*/g, ''), pills, p);
        if (!pick) continue;
        realClick(pick);
        n++;
        LOG(`Oracle: "${q.slice(0, 70)}" → ${txt(pick)}`);
        await sleep(250);
      }
      return n;
    }

    /* ── typeaheads ── */
    const NO_RESULTS_RE = /no results (were )?found|no matches/i;
    function listFor(inp) {
      const id = inp.getAttribute('aria-controls') || inp.getAttribute('aria-owns') || inp.getAttribute('list');
      return id ? document.getElementById(id) : null;
    }
    function optionsFor(inp) {
      const list = listFor(inp);
      const scope = list || inp.closest('[class*="select" i],[class*="combobox" i],[class*="typeahead" i],.input-row,.apply-flow-input') || document;
      return $$('[role="option"],li[class*="list-item" i],li[class*="option" i]', scope)
        .filter(o => isVisible(o) && !NO_RESULTS_RE.test(txt(o)));
    }
    function showsNoResults(inp) {
      const list = listFor(inp);
      if (list && isVisible(list) && NO_RESULTS_RE.test(txt(list))) return true;
      const box = inp.closest('[class*="select" i],[class*="combobox" i],[class*="typeahead" i],.input-row,.apply-flow-input');
      return !!(box && $$('*', box).some(e => e.children.length === 0 && isVisible(e) && NO_RESULTS_RE.test(txt(e))));
    }
    const words = s => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 1);
    function closest(opts, wanted) {
      const w = new Set(words(wanted));
      let best = null, score = -1;
      for (const o of opts) {
        const ow = words(txt(o));
        const sc = ow.filter(x => w.has(x)).length / Math.max(1, Math.max(ow.length, w.size));
        if (sc > score) { score = sc; best = o; }
      }
      return best;
    }
    async function search(inp, queries, wanted) {
      for (const qy of queries) {
        if (!qy) continue;
        inp.focus();
        nativeSet(inp, '');
        await sleep(80);
        nativeSet(inp, qy);
        inp.dispatchEvent(new KeyboardEvent('keydown', { key: qy.slice(-1), bubbles: true }));
        inp.dispatchEvent(new KeyboardEvent('keyup', { key: qy.slice(-1), bubbles: true }));
        let opts = [];
        for (let i = 0; i < 15 && !opts.length; i++) { await sleep(200); opts = optionsFor(inp); }
        if (!opts.length) continue;
        const pick = closest(opts, wanted) || opts[0];
        realClick(pick);
        await sleep(350);
        return txt(pick);
      }
      return '';
    }
    const isPostal = inp => /postal|zip|post ?code|eircode/i.test(getLabel(inp) || inp.name || inp.id || '');
    async function fixTypeaheads() {
      let n = 0;
      for (const inp of $$('input[role="combobox"],input[aria-autocomplete="list"],input[aria-autocomplete="both"]').filter(isVisible)) {
        const label = getLabel(inp) || '';
        if (isPostal(inp)) {
          if ((inp.value || '').trim().toUpperCase() === ORACLE_POSTCODE && !showsNoResults(inp)) continue;
          if (!settled('postal')) continue;
          const got = await search(inp, [ORACLE_POSTCODE, ORACLE_POSTCODE.split(' ')[0]], ORACLE_POSTCODE);
          if (!got) { nativeSet(inp, ORACLE_POSTCODE); inp.blur(); }
          LOG(`Oracle: postal code → ${got || ORACLE_POSTCODE}`);
          n++;
          continue;
        }
        const v = (inp.value || '').trim();
        if (!v) continue;
        /* Suggestions left open under a box nobody is typing in: the value
           was typed but never picked. Pick the closest. */
        const open = optionsFor(inp);
        if (!showsNoResults(inp) && open.length && document.activeElement !== inp && settled('open|' + label)) {
          const pick = closest(open, v);
          if (pick) { realClick(pick); LOG(`Oracle: "${label.slice(0, 40)}" — picked the suggestion "${txt(pick)}" for "${v}"`); n++; await sleep(300); }
          continue;
        }
        if (!showsNoResults(inp) || !settled('ta|' + label)) continue;
        const ws = words(v);
        const queries = [ws[0], v.slice(0, 4)];
        if (EQUALITY_RE.test(label)) queries.push('decline', 'prefer not', 'not to');
        const got = await search(inp, queries, v);
        LOG(`Oracle: "${label.slice(0, 40)}" had no match for "${v}" → ${got || 'still no suggestion'}`);
        if (got) n++;
      }
      return n;
    }

    /* ── address lines ── */
    const COUNTRY_ONLY_RE = /^(united kingdom|great britain|england|ireland|republic of ireland|united states( of america)?|usa|us|uk|canada|germany|france|india|nigeria|australia|netherlands|spain|italy|portugal|poland)$/i;
    function fixAddress(p) {
      const fields = $$('input').filter(isVisible);
      const line1 = fields.find(i => /address (line )?1|street address|^address$/i.test(getLabel(i) || ''));
      const line2 = fields.find(i => /address (line )?2/i.test(getLabel(i) || ''));
      if (!line1 || !COUNTRY_ONLY_RE.test((line1.value || '').trim())) return;
      const street = (p.street || '').trim() || (line2 && /\d/.test(line2.value || '') ? line2.value.trim() : '');
      if (!street) return;
      nativeSet(line1, street);
      if (line2 && line2.value.trim() === street) nativeSet(line2, '');
      LOG(`Oracle: Address Line 1 had the country ("${line1.value}") — street put there instead`);
    }

    async function tick() {
      if (busy || wdEngineOwns()) return;
      if (!(await active())) return;
      busy = true;
      try {
        if (onPinScreen()) { await handlePin(); return; }
        pin.since = 0;
        const p = await getProfile();
        fixAddress(p);
        await answerPills(p);
        await fixTypeaheads();
      } catch (e) {
        LOG('Oracle helper error', e);
      } finally { busy = false; }
    }
    setInterval(tick, 1500);
  })();

  /* ── Auto-submit when OptimHire says "Review and submit the form" ────
   * OptimHire fills the form with its own engine and then stops, showing
   * "Review and submit the form" / "Form filled", waiting for a human to
   * press the ATS's submit button. In its one-job-at-a-time mode that is
   * EVERY job, and the state lives only in the side panel — which now
   * relays it to the job tab (OH_REVIEW_AND_SUBMIT) the moment it shows.
   *
   * On a job board (Reed, LinkedIn…) the application is often not even
   * open yet: the page still shows "Apply now". So, in order:
   *   1. no form open → press the page's Apply button (same tab), then
   *      fill what opens with our engine;
   *   2. required fields still empty → fill them (bounded);
   *   3. press the submit button — inside the application dialog if one
   *      is open — by ranked match;
   *   4. confirmation seen but OptimHire missed it → tell OptimHire, so
   *      the run moves on instead of stalling.
   *
   * This runs INDEPENDENTLY of the T41/T43 flow controller on purpose.
   * T43 is gated behind fillStable() (which historically only tracked OUR
   * fill passes) and it blacklists a page fingerprint after a single
   * attempt, so one missed click meant the run stalled forever. This
   * handler watches for the ready condition directly and retries.
   * ────────────────────────────────────────────────────────────────── */
  (function installReviewAndSubmit() {
    /* Top frame — or an ATS form iframe (Greenhouse, Lever… embedded in a
       company site) inside the pinned job tab. */
    const IN_FRAME = window.top !== window.self;
    /* optimhire.com drives submit through its own overlay (T39/T40). */
    if (/(^|\.)optimhire\.com$/i.test(location.hostname)) return;

    const READY_RE = /review and submit|form ready for submission|form filled|ready to submit|click on submit/i;
    const SUBMIT_RE = /^(submit\s+application|submit\s+your\s+application|send\s+application|send\s+my\s+application|submit\s+my\s+application|complete\s+application|finish\s+application|submit\s+&\s+apply|submit\s+and\s+apply|submit\s+profile|send\s+profile|submit)$/i;
    /* Buttons that OPEN an application on a job page / job board (Reed's
       "Apply now", LinkedIn's "Easy Apply", …). */
    const LAUNCH_RE = /^(apply|apply now|easy apply|quick apply|apply for (this )?(job|role|position|vacancy)|apply to (this )?(job|role|position)|start (your |my )?application|begin (your )?application|continue to apply|continue to application|i'?m interested)$/i;
    const TICK_MS = 1500;
    const RETRY_MS = 2500;
    const MAX_TRIES = 4;
    const MAX_LAUNCH = 2;
    const MAX_FILLS = 2;
    /* How long to let the fillers (incl. the location typeahead rescue)
       finish before submitting despite our own "unfilled" reading. */
    const FILL_GRACE_MS = 3_000;
    const SUBMIT_SETTLE_MS = 8_000;   // let a submit land before trying again
    const GIVE_UP_MS = 25_000;        // form still invalid this long after "ready" → skip the job
    const SIGNAL_FRESH_MS = 10_000;
    const REPORT_AFTER_MS = 8_000;
    let _tries = 0, _launches = 0, _fills = 0, _forUrl = '', _lastTry = 0, _readySince = 0;
    let _signalTs = 0, _busy = false, _confirmedTs = 0, _reportedFor = '', _noLaunchLoggedFor = '', _gaveUpFor = '';

    function ohSaysReady(st) {
      if (!st || st.isActive !== true) return false;
      if (READY_RE.test(String(st.statusMessage || ''))) return true;
      return typeof st.progress === 'number' && st.progress >= 90 &&
             String(st.applicationState || '') !== 'missing-questions';
    }
    function requiredInputs(root) {
      return $$(
        'input[required]:not([type=hidden]):not([type=submit]):not([type=button]),' +
        'input[aria-required="true"]:not([type=hidden]):not([type=submit]):not([type=button]),' +
        'textarea[required],textarea[aria-required="true"],' +
        'select[required],select[aria-required="true"]', root
      ).filter(el => isVisible(el) && !isPageChromeField(el));
    }
    function isFilled(el) {
      if (isComboInput(el)) return !!comboSelectedText(el);   // the search box is empty even when answered
      if (el.type === 'radio' && el.name) return [...document.getElementsByName(el.name)].some(r => r.checked);
      if (el.type === 'checkbox') return el.checked;
      if (el.tagName === 'SELECT') return !!el.value;
      return !!(el.value && String(el.value).trim());
    }
    /* Submit-button discovery across ATSes. Wording differs everywhere
       ("Submit Application", "Submit", "Send application", "Apply now"
       on the final step…), so match in RANKED order rather than relying
       on one exact label:
         1. an exact terminal label (most certain)
         2. a label that merely CONTAINS submit/send-application wording
         3. the form's own submit control (button[type=submit] /
            input[type=submit]) — the ATS-agnostic fallback
       Anything that looks like a non-terminal step (save, next, back,
       cancel, upload…) is always rejected, and so is the site's own
       header / search / newsletter chrome. */
    const NEGATIVE_RE = /\b(save|next|back|previous|cancel|close|clear|reset|upload|attach|add|remove|delete|sign in|log ?in|register|search|filter|skip|subscribe)\b/i;
    const CONTAINS_RE = /(submit|send)\b.*(application|profile|form)?|^apply now$/i;

    function usable(b) {
      if (!b || b.disabled) return false;
      if (b.getAttribute && b.getAttribute('aria-disabled') === 'true') return false;
      return isVisible(b) && !isPageChromeField(b);
    }
    function labelOfBtn(b) {
      let t = ((b.innerText || b.value || b.textContent || '') + '').replace(/\s+/g, ' ').trim();
      if (!t && b.getAttribute) {
        t = ((b.getAttribute('aria-label') || b.getAttribute('title')) || '').trim();
      }
      return t;
    }
    function findSubmitRanked(root) {
      const all = $$('button,[role="button"],input[type=submit],input[type=button]', root || document)
        .filter(usable);
      /* 1 — exact terminal label */
      for (const b of all) {
        const t = labelOfBtn(b);
        if (SUBMIT_RE.test(t)) return { btn: b, why: `exact "${t}"` };
      }
      /* 2 — contains submit/send wording, and is not a step control */
      for (const b of all) {
        const t = labelOfBtn(b);
        if (!t || t.length > 40) continue;
        if (NEGATIVE_RE.test(t)) continue;
        if (CONTAINS_RE.test(t)) return { btn: b, why: `contains "${t}"` };
      }
      /* 3 — the form's own submit control */
      for (const b of all) {
        const isSubmitCtl = (b.tagName === 'INPUT' && /submit/i.test(b.type || '')) ||
                            (b.tagName === 'BUTTON' && /submit/i.test(b.getAttribute('type') || ''));
        if (!isSubmitCtl) continue;
        const t = labelOfBtn(b);
        if (t && NEGATIVE_RE.test(t)) continue;
        return { btn: b, why: `form submit control "${t || b.type}"` };
      }
      return null;
    }

    /* Publish for the on-demand "Autofill this page" action. */
    findAnySubmitButton = () => findSubmitRanked(document);

    /* An open application dialog (job boards apply in a modal). Cookie /
       consent dialogs and OptimHire's own overlays are not it. */
    function applicationDialog() {
      const cands = $$('[role="dialog"],[aria-modal="true"],dialog[open]').filter(isVisible);
      for (let i = cands.length - 1; i >= 0; i--) {
        const c = cands[i];
        const tag = ((c.id || '') + ' ' + (c.className || '') + ' ' + (c.getAttribute('aria-label') || '')).toLowerCase();
        if (/cookie|consent|gdpr|onetrust|privacy|optimhire/.test(tag)) continue;
        const hasField = $$('input:not([type=hidden]),textarea,select', c).some(isVisible);
        if (hasField || findSubmitRanked(c)) return c;
      }
      return null;
    }
    function applicationFields(root) {
      return $$('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=image]):not([type=reset]),textarea,select', root)
        .filter(el => isVisible(el) && !isPageChromeField(el));
    }
    function findLauncher() {
      for (const b of $$('button,a,[role="button"],input[type=button],input[type=submit]')) {
        if (!usable(b)) continue;
        const t = labelOfBtn(b);
        if (!t || t.length > 40 || !LAUNCH_RE.test(t)) continue;
        return b;
      }
      return null;
    }

    /* A form WE opened (or a page OptimHire never filled) — run our engine,
       then answer required dropdowns with real options. */
    async function fillOpenApplication(scope) {
      if (_fillActive) return;
      try {
        await runAtsAutofill();
        try { await detectAndFixValidationErrors(); } catch (_) {}
        try { await sanitizeBadFills(); } catch (_) {}
        try { await answerComboDropdowns(scope || document, await getProfile()); } catch (_) {}
      } catch (_) {} finally { _fillActive = false; }
      /* Location typeaheads need a suggestion PICKED — do it now rather than
         submitting first and having the site reject it. */
      if (typeof rescueLocationNow === 'function') { try { await rescueLocationNow(); } catch (_) {} }
    }
    function visibleErrors(scope) {
      return $$('[aria-invalid="true"],.error,.is-invalid,[class*="field-error"],[class*="fieldError"]', scope)
        .filter(el => isVisible(el) && !isPageChromeField(el));
    }

    /* We saw the confirmation, but OptimHire's own success check missed it
       and the panel still says "Review and submit". Tell it, so the run
       moves on instead of stalling on an application that already went. */
    async function reportSuccess() {
      if (_reportedFor === location.href) return;
      _reportedFor = location.href;
      try {
        const d = await ST.get(['isManuallyStartJob', 'manualApplicationDetail', 'autoApplyState']);
        if (d.isManuallyStartJob) {
          chrome.runtime.sendMessage({
            type: 'MANUAL_FORM_ERROR_SUCCESS_MESSAGE', isSuccess: true,
            message: 'Application submitted successfully', url: location.href,
            applicationDetails: d.manualApplicationDetail || null,
          }).catch(() => {});
        } else if (d.autoApplyState && d.autoApplyState.isActive) {
          chrome.runtime.sendMessage({
            type: 'COMPLEX_FORM_SUCCESS', message: 'successMessage',
            url: location.href, success_next_job: true,
          }).catch(() => {});
        } else return;
        LOG('Review-and-submit: application confirmed on the page — told OptimHire so the run moves on');
      } catch (_) {}
    }

    async function step() {
      if (location.href !== _forUrl) {
        _forUrl = location.href;
        _tries = 0; _launches = 0; _fills = 0; _confirmedTs = 0; _readySince = 0;
      }
      if (autoSubmitBlockedHere()) return;   // user asked for fill-only here
      if (_fillActive) return;
      const now = Date.now();
      const signalled = now - _signalTs < SIGNAL_FRESH_MS;

      /* After our submit: a confirmation means done. */
      if (_tries > 0 && pageConfirmsApplication()) {
        if (!_confirmedTs) { _confirmedTs = now; LOG('Review-and-submit: application confirmed on the page'); }
        if (signalled && now - _confirmedTs > REPORT_AFTER_MS) await reportSuccess();
        return;
      }
      /* Don't fight an in-flight submit. */
      if (_submitAttempted && now - _submitAttemptTs < SUBMIT_SETTLE_MS) return;
      if (wdEngineOwns()) return;

      const d = await ST.get(AUTOMATION_KEYS);
      if (!mayAutomate(d)) return;
      /* Confine the DOM work to the tab that IS the current job. */
      if (IN_FRAME ? !isPingedJobTab() : !(await isActiveJobTab())) return;

      const pageReady = !IN_FRAME && READY_RE.test((document.body && document.body.innerText || '').slice(0, 4000));
      const ready = signalled || ohSaysReady(d && d.autoApplyState) || pageReady;
      if (!ready) { _readySince = 0; return; }
      if (!_readySince) _readySince = now;

      const dlg = applicationDialog();
      const scope = dlg || document;
      const fields = applicationFields(scope);

      /* No application open yet (Reed, LinkedIn, most job boards show a
         job page first): press its Apply button, then fill what opens. */
      if (!fields.length && !dlg) {
        if (IN_FRAME || _launches >= MAX_LAUNCH || now - _lastTry < RETRY_MS) return;
        const l = findLauncher();
        if (!l) {
          if (_noLaunchLoggedFor !== location.href) {
            _noLaunchLoggedFor = location.href;
            LOG('Review-and-submit: ready, but no form and no Apply button on this page');
          }
          return;
        }
        _launches++; _lastTry = now;
        /* Stay in THIS tab — never spawn another one. */
        if (l.tagName === 'A' && l.target && l.target !== '_self') { try { l.target = '_self'; } catch (_) {} }
        LOG(`Review-and-submit: opening the application ("${labelOfBtn(l)}")`);
        try { realClick(l); } catch (_) { try { l.click(); } catch (__) {} }
        await sleep(1200);
        _fills++;
        await fillOpenApplication();
        return;
      }

      /* Required fields still empty or flagged invalid — typically a form we
         just opened that OptimHire never saw, or a dropdown left unanswered.
         Fill it (bounded), then submit next tick. */
      const reqs = requiredInputs(scope);
      const missing = reqs.filter(el => !isFilled(el));
      const errs = visibleErrors(scope);
      if (missing.length || errs.length) {
        if (_fills < MAX_FILLS) { _fills++; await fillOpenApplication(scope); return; }
        /* Our reading cannot see every custom widget, so it must never be a
           permanent veto — after a short grace, submit anyway. */
        if (now - _readySince < FILL_GRACE_MS) return;
        /* Nothing left we can fill and the site still rejects the form:
           skip the job instead of sitting on "Review and submit" forever. */
        if (errs.length && now - _readySince > GIVE_UP_MS) {
          if (_gaveUpFor !== location.href && !IN_FRAME) {
            _gaveUpFor = location.href;
            const what = missing.concat(errs).map(el => (getLabel(el) || el.name || '').trim()).filter(Boolean).slice(0, 3).join(', ');
            LOG(`Review-and-submit: form still invalid after ${Math.round(GIVE_UP_MS / 1000)}s (${what || 'unknown field'}) — skipping this job`);
            await sendOptimHireSkip('form could not be completed' + (what ? ': ' + what : ''));
          }
          return;
        }
        if (errs.length && _tries >= 1) return;     // one submit attempt against a flagged form
      }

      if (_tries >= MAX_TRIES || now - _lastTry < RETRY_MS) return;
      const hit = findSubmitRanked(scope) || (dlg ? findSubmitRanked(document) : null);
      if (!hit) { LOG('Review-and-submit: ready but no submit button found yet'); return; }
      _tries++;
      _lastTry = now;
      LOG(`Review-and-submit: clicking ${hit.why} (try ${_tries}/${MAX_TRIES})`);
      markSubmitAttempted();
      try { realClick(hit.btn); } catch (_) { try { hit.btn.click(); } catch (__) {} }
    }

    async function tick() {
      if (_busy) return;
      _busy = true;
      try { await step(); } catch (_) {} finally { _busy = false; }
    }

    /* The side panel says "Review and submit the form" — sent to the job
       tab only, so this also proves this tab is the job tab. Act now. */
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg || msg.type !== 'OH_REVIEW_AND_SUBMIT') return;
      _signalTs = Date.now();
      markJobTab();
      tick();
    });
    setInterval(tick, TICK_MS);
  })();

  /* ── Paylocity: ask the Queue Manager to bring this tab forward ───────
   * OptimHire 2.9.0's autofill waits `while (document.hidden)` on
   * Paylocity, so a Paylocity queue job stalls in a background tab. The
   * Queue Manager already activates tabs whose URL is Paylocity; this
   * covers jobs that only REDIRECT to Paylocity after opening. The manager
   * checks that the sender is a tab it opened, so a Paylocity page the user
   * is simply browsing can never take the front.
   * ────────────────────────────────────────────────────────────────── */
  (function installPaylocityFocusRequest() {
    if (window.top !== window.self) return;
    if (!/(^|\.)paylocity\.com$/i.test(location.hostname)) return;   // zero cost on other sites
    let _lastAsk = 0;
    async function ask(reason) {
      try {
        if (!document.hidden) return;
        if (Date.now() - _lastAsk < 5000) return;
        const d = await ST.get(['ohJobQueueActive', 'ohAutomationDisabled']);
        if (!d || !d.ohJobQueueActive || d.ohAutomationDisabled === true) return;   // CSV queue runs only
        _lastAsk = Date.now();
        chrome.runtime.sendMessage({ type: 'OH_QUEUE_REQUEST_FOCUS', reason }).catch(() => {});
        LOG(`Paylocity: tab hidden during queue run — asked Queue Manager to focus it (${reason})`);
      } catch (_) {}
    }
    document.addEventListener('visibilitychange', () => ask('visibilitychange'));
    setInterval(() => ask('poll'), 3000);
    setTimeout(() => ask('load'), 1500);
  })();

  /* ── T16: Hide referral / upgrade / credit-count UI ───────── */
  (function hideReferral() {
    /* SCOPE GUARD: this only ever needs to hide OptimHire's own referral
       and upgrade UI, but the stylesheet below was previously injected
       into EVERY site. Substring selectors like [class*="referral"] and
       [class*="affiliate"] are common class fragments on job boards, so
       on third-party sites this silently hid legitimate content. Bail out
       entirely unless we are on optimhire.com. */
    if (!/(^|\.)optimhire\.com$/i.test(location.hostname)) return;
    /* CSS-only rules first: safe selectors that cannot match the
       page root. */
    const style = document.createElement('style');
    style.textContent = `
      [class*="referral"]:not(html):not(body),
      [class*="Referral"]:not(html):not(body),
      [id*="referral"]:not(html):not(body),
      [data-testid*="referral"],
      [class*="affiliate"]:not(html):not(body),
      [class*="earnCredit"],[class*="inviteFriend"],
      [class*="invite-friend"],[class*="ReferralScreen"],
      [class*="UpgradeBanner"],[class*="upgrade-banner"],
      a[href*="openUpgradePlan"],a[href*="/d/membership?openUpgradePlan"]
      {display:none!important}
    `;
    (document.head || document.documentElement).appendChild(style);

    /* Only run text-based hiding on optimhire.com itself to avoid
       impacting third-party job sites where Auto-Apply runs. */
    if (!/optimhire\.com$/i.test(location.hostname) &&
        !/\.optimhire\.com$/i.test(location.hostname)) return;

    const HIDE_PATTERNS = [
      'Refer your friend to get',
      'Auto-fill Credits + $',
      'commission on hire',
      'Earn While You Search',
      'Help your friends avoid applying',
      'Auto-fill Credits for every signup',
      'referral who upgrades to premium',
      'referral who upgrades',
      'One Referral 3 Benefits',
      'Start Earning Now',
      /* 2.6.0 upgrade-modal / limit-reached strings */
      'Upgrade to get Unlimited Credits',
      'Upgrade to get unlimited credits',
      'Upgrade and save countless hours',
      'free Credits daily',
      'Auto-fill Credits left today',
      'matching jobs by manually filling',
      'Start Applying Manually',
      'Days Unlimited Subscription',
      'Month Unlimited Subscription',
      'Months Unlimited Subscription',
      'Apply to Unlimited Jobs',
      'No Premium Benefits',
      'Get unlimited Credits',
      'AI cover letter & more',
      'AI Powered Automated Job Apply',
      /* Resume-fetch error message */
      'couldn’t fetch details for this resume',
      "couldn't fetch details for this resume",
      'fetch details for this resume right now',
    ];

    /* Auto-click "Continue with Free" to dismiss the upgrade pricing
       modal — it pops up when daily credits run out. */
    function tryClickContinueWithFree() {
      const btns = document.querySelectorAll('button, [role="button"], a');
      for (const b of btns) {
        if (!b || b.disabled) continue;
        const r = b.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const t = ((b.innerText || b.textContent || '') + '').replace(/\s+/g,' ').trim();
        if (/^continue\s+with\s+free$/i.test(t)) {
          try { b.click(); LOG('Auto-dismissed upgrade modal via Continue with Free'); return true; }
          catch (_) {}
        }
      }
      return false;
    }

    function ownText(el) {
      if (!el) return '';
      let s = '';
      for (let i = 0; i < el.childNodes.length; i++) {
        const n = el.childNodes[i];
        if (n.nodeType === 3) s += n.nodeValue;
      }
      return s;
    }

    function pickAncestor(el) {
      let node = el;
      for (let i = 0; i < 4; i++) {
        if (!node || node === document.body || node === document.documentElement) {
          return null;
        }
        const parent = node.parentElement;
        if (!parent || parent === document.body) return node;
        const nLen = (node.textContent || '').length;
        const pLen = (parent.textContent || '').length;
        if (pLen > 400) return node;
        if (pLen <= nLen + 100) { node = parent; continue; }
        return node;
      }
      return node;
    }

    function tick() {
      try {
        const nodes = document.querySelectorAll('h1,h2,h3,h4,p,li,span,div,a,button');
        for (let i = 0; i < nodes.length; i++) {
          const el = nodes[i];
          if (!el || (el.dataset && el.dataset.ohHidden === '1')) continue;
          let matched = false;
          /* Pass 1: ownText (direct text nodes) — fast, precise for plain labels */
          /* Pass 1: ownText — fastest, catches plain labels */
          const t = ownText(el).trim();
          if (t && t.length <= 250) {
            for (let j = 0; j < HIDE_PATTERNS.length; j++) {
              if (t.indexOf(HIDE_PATTERNS[j]) !== -1) {
                const target = pickAncestor(el);
                if (target) {
                  target.style.setProperty('display', 'none', 'important');
                  if (target.dataset) target.dataset.ohHidden = '1';
                }
                matched = true;
                break;
              }
            }
          }
          if (matched) continue;
          /* Pass 2: textContent — catches "Get [20] Auto-fill Credits"
             style strings where the variable parts are in child spans.
             Constrained to leaf-ish containers so we never match the
             whole page. */
          /* Pass 2: textContent for elements that wrap variable
             text (numbers, plan name) in child spans. Constrained
             to small leaf-ish containers so we never match a huge
             ancestor that happens to contain a pattern. */
          const tc = (el.textContent || '').replace(/\s+/g, ' ').trim();
          if (!tc || tc.length > 350) continue;
          const childElems = el.children ? el.children.length : 0;
          if (childElems > 3 && el.tagName !== 'LI' && el.tagName !== 'P') continue;
          for (let k = 0; k < HIDE_PATTERNS.length; k++) {
            if (tc.indexOf(HIDE_PATTERNS[k]) !== -1) {
              const target = pickAncestor(el);
              if (target) {
                target.style.setProperty('display', 'none', 'important');
                if (target.dataset) target.dataset.ohHidden = '1';
              }
              break;
            }
          }
        }
        /* Replace credit counter "N Credits available" with "∞" */
        const cnodes = document.querySelectorAll('span,div,p');
        for (let k = 0; k < cnodes.length; k++) {
          const c = cnodes[k];
          if (!c || (c.dataset && c.dataset.ohCredit === '1')) continue;
          const ct = ownText(c).trim();
          if (/^\d+\s+Credits?\s+available$/i.test(ct) ||
              /^\d+\s+Auto-fill\s+Credits?(\s+left.*)?$/i.test(ct) ||
              /^\d+\s+Credits?\s+left$/i.test(ct)) {
            for (let n = 0; n < c.childNodes.length; n++) {
              const tn = c.childNodes[n];
              if (tn.nodeType === 3 && /\d/.test(tn.nodeValue)) {
                tn.nodeValue = tn.nodeValue.replace(/\d+/, '∞');
              }
            }
            if (c.dataset) c.dataset.ohCredit = '1';
          }
        }
      } catch (_) {}
    }

    function start() {
      tick();
      tryClickContinueWithFree();
      /* NATIVE timer + observer on purpose. This is optimhire.com-only UI
         hiding (upgrade / referral / credit-limit prompts) and must keep
         working while no automation runs; through the idle governor it
         stopped about a second after the page loaded, so those prompts came
         back whenever the user simply browsed optimhire.com. Observer
         bursts are coalesced so a React re-render costs one pass. */
      _nativeSetInterval(() => { tick(); tryClickContinueWithFree(); }, 3000);
      try {
        let pending = false;
        new _NativeMO(() => {
          if (pending) return;
          pending = true;
          setTimeout(() => { pending = false; tick(); tryClickContinueWithFree(); }, 300);
        }).observe(document.body, { childList: true, subtree: true });
      } catch (_) {}
    }
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start);
  })();

  /* ── Membership-upgrade auto-bounce ───────────────────────────────────
   * OptimHire sometimes redirects mid-automation to
   * /d/membership?openUpgradePlan=1, which halts the apply flow. Our
   * limit bypass should prevent it, but if it still happens we (a) click
   * "Continue with Free" to dismiss the pricing modal, and (b) if that's
   * not available, navigate back to the copilot jobs page so the queue
   * resumes. Only acts on optimhire.com to avoid touching anything else.
   * ─────────────────────────────────────────────────────────────────── */
  (function bounceMembershipUpgrade() {
    if (!/optimhire\.com$/i.test(location.hostname) &&
        !/\.optimhire\.com$/i.test(location.hostname)) return;
    let _bouncedAt = 0;
    function onUpgradePage() {
      return /\/d\/membership/i.test(location.pathname) &&
             /openupgradeplan/i.test(location.search.toLowerCase());
    }
    function clickContinueFree() {
      const btns = document.querySelectorAll('button,[role="button"],a');
      for (const b of btns) {
        if (!b) continue;
        const r = b.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const t = ((b.innerText || b.textContent || '') + '').replace(/\s+/g, ' ').trim();
        if (/^continue\s+with\s+free$/i.test(t)) { try { b.click(); return true; } catch (_) {} }
      }
      return false;
    }
    async function check() {
      try {
        if (!onUpgradePage()) return;
        const active = await isAutomationActive();
        if (!active) return; // user is intentionally viewing membership — leave it
        if (clickContinueFree()) { LOG('Membership: dismissed via Continue with Free'); return; }
        /* Debounce navigation so we don't loop faster than the page loads */
        if (Date.now() - _bouncedAt < 6000) return;
        _bouncedAt = Date.now();
        LOG('Membership upgrade page during automation — bouncing back to copilot jobs');
        try { location.href = 'https://optimhire.com/d/my-jobs?q=copilot_jobs'; } catch (_) {}
      } catch (_) {}
    }
    setInterval(check, 1200);
    check();
  })();

  /* Boxes that take a fact about you, never filler text. */
  const CONTACT_LABEL_RE = /\b(first|last|middle|full|given|family|preferred|legal|sur)?\s?name\b|e-?mail|phone|mobile|telephone|address|street|city|town|post ?code|postal|zip|county|state|province|country|linkedin|github|website|portfolio|url\b/i;

  /* ── Profile helper ─────────────────────────────────────── */
  async function getProfile() {
    const keys = ['candidateDetails', 'cachedSeekerInfo', 'seekerDetails', 'userDetails'];
    const data = await ST.get(keys.concat(['autoApplyState', 'complexFormData', 'manualApplicationDetail', 'ohWdSeeker']));
    /* Outside a run OptimHire keeps little more than your name: your details
       from the last OptimHire job (kept by the Workday engine) are the base. */
    let merged = {};

    /* OptimHire 2.9.0 keeps the applicant's real details (e-mail, phone
       as mobile_code + mobile_num, address, city…) only on the job it is
       working on — applicationDetails.seeker — and candidateDetails holds
       little more than the name. Without this base the profile had no
       phone at all, so a phone box the site cleared was never filled
       again. Lowest priority: the sources below still override it. */
    for (const k of ['manualApplicationDetail', 'complexFormData', 'autoApplyState']) {
      try {
        let v = data[k];
        if (typeof v === 'string') v = JSON.parse(v);
        const ad = v && (v.applicationDetails || v);
        if (ad && ad.seeker && typeof ad.seeker === 'object') { merged = Object.assign({}, ad.seeker, merged); }
      } catch (_) {}
    }
    if (data.ohWdSeeker && typeof data.ohWdSeeker === 'object') merged = Object.assign({}, data.ohWdSeeker, merged);   // lowest of all

    // Parse and merge all available profile sources
    for (const key of keys) {
      if (!data[key]) continue;
      try {
        const parsed = typeof data[key] === 'string' ? JSON.parse(data[key]) : data[key];
        if (parsed && typeof parsed === 'object') {
          Object.assign(merged, parsed);
          // Also flatten a nested .seeker sub-object
          if (parsed.seeker && typeof parsed.seeker === 'object') {
            Object.assign(merged, parsed.seeker);
          }
        }
      } catch (_) {}
    }

    // Normalise common field name variants so guessValue() always finds them
    const pick = (...keys) => { for (const k of keys) if (merged[k]) return merged[k]; return ''; };
    merged.email    = pick('email', 'email_address', 'emailAddress', 'Email');
    merged.phone    = pick('phone', 'phone_number', 'phoneNumber', 'mobile', 'cell', 'Phone');
    {
      const code = String(merged.mobile_code || '').replace(/\D/g, '');
      const num  = String(merged.mobile_num || '').replace(/\D/g, '');
      if (!merged.phone && num) merged.phone = code ? `+${code} ${num}` : num;
      if (code && !merged.phone_country_code) merged.phone_country_code = '+' + code;
      if (code) _profileDialCode = code;
    }
    merged.first_name = pick('first_name', 'firstName', 'given_name', 'givenName');
    merged.last_name  = pick('last_name',  'lastName',  'family_name','familyName', 'surname');
    merged.linkedin_profile_url = pick('linkedin_profile_url','linkedin_url','linkedinUrl','linkedin','LinkedIn');
    merged.github_url    = pick('github_url', 'github', 'githubUrl', 'GitHub');
    merged.website_url   = pick('website_url', 'website', 'websiteUrl', 'portfolio', 'portfolioUrl', 'personal_website');
    merged.twitter_url   = pick('twitter_url', 'twitter', 'twitterUrl', 'x_url', 'x_handle');
    merged.stackoverflow_url = pick('stackoverflow_url', 'stackoverflow', 'stack_overflow', 'stackOverflow');
    merged.city        = pick('city', 'location_city', 'locationCity');
    merged.state       = pick('state', 'location_state', 'locationState');
    merged.country     = pick('country', 'location_country', 'locationCountry');
    merged.postal_code = pick('postal_code', 'zip', 'postalCode', 'zipCode');
    merged.street      = pick('street', 'street_address', 'address_line1', 'address1');
    merged.current_title   = pick('current_title', 'currentTitle', 'job_title', 'jobTitle', 'title', 'position');
    merged.current_company = pick('current_company', 'currentCompany', 'company', 'employer', 'organization');
    merged.expected_salary = pick('expected_salary', 'expectedSalary', 'desired_salary', 'salary');
    merged.years_experience = pick('years_experience', 'yearsExperience', 'years_of_experience', 'experience_years');
    merged.cover_letter    = pick('cover_letter', 'coverLetter', 'cover_letter_body');
    merged.summary         = pick('summary', 'bio', 'about', 'profile_summary', 'professional_summary');
    return merged;
  }

  /* ── Field label extraction ──────────────────────────────── */
  function getLabel(el) {
    if (!el) return '';
    /* 1) aria-label — explicit author-provided label */
    const aria = el.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();

    /* 2) aria-labelledby — id-reference label, common on accessible forms */
    const lbId = el.getAttribute('aria-labelledby');
    if (lbId) {
      const parts = lbId.split(/\s+/).map(id => {
        const node = document.getElementById(id);
        return node ? node.textContent.trim() : '';
      }).filter(Boolean);
      if (parts.length) return parts.join(' ');
    }

    /* 3) Wrapping <label> element */
    const wrappingLabel = el.closest && el.closest('label');
    if (wrappingLabel) {
      const txt = wrappingLabel.cloneNode(true);
      /* Strip the input's own text from the clone before extracting */
      txt.querySelectorAll('input,textarea,select').forEach(n => n.remove());
      const s = txt.textContent.trim();
      if (s) return s;
    }

    /* 4) <label for="id"> */
    if (el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl && lbl.textContent.trim()) return lbl.textContent.trim();
    }

    /* 5) Surrounding fieldset legend (radio/checkbox groups) */
    const fieldset = el.closest && el.closest('fieldset');
    if (fieldset) {
      const legend = fieldset.querySelector(':scope > legend');
      if (legend && legend.textContent.trim()) return legend.textContent.trim();
    }

    /* 6) Container with explicit label child */
    const container = el.closest(
      '.form-group,.field,.question,[class*="Field"],[class*="Question"],' +
      '[class*="form-row"],[class*="FormRow"],[class*="form-item"],' +
      '[class*="FormItem"],[class*="form-field"],[class*="FormField"],' +
      '[role="group"]'
    );
    if (container) {
      const lbl = container.querySelector('label,[class*="label"],[class*="Label"]');
      if (lbl && lbl !== el && lbl.textContent.trim()) return lbl.textContent.trim();
    }

    /* 7) Preceding-sibling label-ish element (legend-style custom forms).
       Two passes: prefer a real LABEL/LEGEND first, then fall back to
       headings / paragraphs / spans — so a "Hint:" span before the
       input never wins over the real label. */
    const sibs = [];
    let sib = el.previousElementSibling;
    for (let i = 0; i < 4 && sib; i++) { sibs.push(sib); sib = sib.previousElementSibling; }
    const sibLabel = sibs.find(s => /^(LABEL|LEGEND)$/i.test(s.tagName) &&
                                    (s.textContent || '').trim() &&
                                    (s.textContent || '').trim().length < 200);
    if (sibLabel) return sibLabel.textContent.trim();
    const sibOther = sibs.find(s => /^(H1|H2|H3|H4|H5|H6|P|SPAN|DIV)$/i.test(s.tagName) &&
                                    (s.textContent || '').trim() &&
                                    (s.textContent || '').trim().length < 200);
    if (sibOther) return sibOther.textContent.trim();

    /* 8) Within the parent, prefer a real <label> child that precedes the
       input; otherwise fall back to the first meaningful text node or
       label-ish element. Avoids returning a "Hint:" span when a real
       <label> is also present. */
    const parent = el.parentElement;
    if (parent) {
      /* Pass A: a <label> element appearing before the input */
      for (const child of parent.childNodes) {
        if (child === el) break;
        if (child.nodeType === 1 && /^(LABEL|LEGEND)$/i.test(child.tagName)) {
          const t = child.textContent.trim();
          if (t && t.length < 200) return t;
        }
      }
      /* Pass B: first text node or other label-ish element */
      for (const child of parent.childNodes) {
        if (child === el) break;
        if (child.nodeType === 3) {
          const t = child.nodeValue.trim();
          if (t && t.length < 200) return t;
        } else if (child.nodeType === 1 &&
                   /^(SPAN|STRONG|B|H1|H2|H3|H4|H5|H6|P)$/i.test(child.tagName)) {
          const t = child.textContent.trim();
          if (t && t.length < 200) return t;
        }
      }
    }

    /* 9) Placeholder (worse than a real label — last resort) */
    if (el.placeholder) return el.placeholder;

    /* 10) name attribute, de-snake-cased */
    return (el.name || '').replace(/[_\-]+/g, ' ').trim();
  }

  /* ── Knockout questions: always YOUR true answers ────────────────────
   * Work authorisation, sponsorship, relocation, on-site, years of
   * experience, degree, salary band, background / drug checks, age,
   * conviction, relatives, non-compete… A wrong answer to one of these
   * gets an application rejected or ranked last, whoever typed it. They
   * are answered from your facts (Queue Manager → Knockout answers,
   * ohKnockout; defaults from your profile and CV), per question and per
   * the JOB's country — "authorised to work in the United States?" is not
   * "Yes" because you can work in Ireland. guessValue() asks here first,
   * the Workday engine asks here first (window.__ohKnockout), and the guard
   * below corrects whatever any filler put in these questions and holds a
   * Submit / Next click until they are right. An answer you changed
   * yourself is never touched. */
  const KO_KEY = 'ohKnockout';
  /* Country names first; [2] only where case is reliable (a label, a location line). */
  const KO_COUNTRIES = [
    ['united states', /\bunited states( of america)?\b|\bu\.s\.a?\.(?=\W|$)|\busa\b|(?<!(latin|south|central|north) )\bamerica\b/i, /\bUS\b/],
    ['united kingdom', /\bunited kingdom\b|\bu\.k\.(?=\W|$)|\bgreat britain\b|\bbritain\b|\bengland\b|\bscotland\b|\bwales\b|\bnorthern ireland\b/i, /\bUK\b/],
    ['ireland', /\b(republic of )?ireland\b|\béire\b/i],
    ['canada', /\bcanada\b/i], ['germany', /\bgermany\b|\bdeutschland\b/i], ['france', /\bfrance\b/i], ['netherlands', /\bnetherlands\b|\bholland\b/i],
    ['spain', /\bspain\b/i], ['portugal', /\bportugal\b/i], ['italy', /\bitaly\b/i], ['poland', /\bpoland\b/i], ['sweden', /\bsweden\b/i],
    ['switzerland', /\bswitzerland\b/i], ['australia', /\baustralia\b/i], ['new zealand', /\bnew zealand\b/i], ['india', /\bindia\b/i],
    ['singapore', /\bsingapore\b/i], ['nigeria', /\bnigeria\b/i], ['south africa', /\bsouth africa\b/i], ['united arab emirates', /\bu\.a\.e\.?|\bUAE\b|\bunited arab emirates\b|\bdubai\b|\babu dhabi\b/i],
    ['mexico', /(?<!new )\bmexico\b/i], ['brazil', /\bbrazil\b/i], ['japan', /\bjapan\b/i], ['belgium', /\bbelgium\b/i], ['austria', /\baustria\b/i], ['denmark', /\bdenmark\b/i],
    ['norway', /\bnorway\b/i], ['finland', /\bfinland\b/i], ['luxembourg', /\bluxembourg\b/i], ['israel', /\bisrael\b/i], ['philippines', /\bphilippines\b/i],
  ];
  const KO_US_STATE_RE = /,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b(?!-)/;
  const KO_CA_PROV_RE = /,\s*(ON|BC|QC|AB|MB|NS|SK)\b(?!-)/;
  /* The city a job location usually names instead of the country. */
  const KO_CITIES = [
    ['united kingdom', /\b(london|manchester|birmingham|edinburgh|glasgow|leeds|bristol|cambridge|oxford|belfast|cardiff|liverpool|newcastle|sheffield|nottingham|milton keynes)\b/i],
    ['ireland', /\b(dublin|cork|galway|limerick|waterford)\b/i],
    ['united states', /\b(new york|nyc|san francisco|seattle|austin|boston|chicago|los angeles|denver|atlanta|dallas|houston|miami|washington,? d\.?c|san jose|san diego|philadelphia|phoenix|minneapolis|raleigh|pittsburgh|detroit|nashville|salt lake city|charlotte)\b/i],
    ['canada', /\b(toronto|vancouver|montr[eé]al|ottawa|calgary)\b/i],
    ['germany', /\b(berlin|munich|m[uü]nchen|hamburg|frankfurt|cologne|k[oö]ln|stuttgart|d[uü]sseldorf)\b/i],
    ['france', /\b(paris|lyon)\b/i], ['netherlands', /\b(amsterdam|rotterdam|utrecht|eindhoven)\b/i], ['spain', /\b(madrid|barcelona)\b/i],
    ['portugal', /\b(lisbon|porto)\b/i], ['poland', /\b(warsaw|krak[oó]w|wroc[lł]aw)\b/i], ['sweden', /\bstockholm\b/i], ['switzerland', /\b(z[uü]rich|geneva)\b/i],
    ['australia', /\b(sydney|melbourne|brisbane)\b/i], ['india', /\b(bangalore|bengaluru|hyderabad|mumbai|pune|chennai|gurgaon|noida)\b/i], ['nigeria', /\b(lagos|abuja)\b/i],
  ];
  const EU_EEA = ['ireland', 'germany', 'france', 'netherlands', 'spain', 'portugal', 'italy', 'poland', 'sweden', 'belgium', 'austria', 'denmark', 'finland', 'luxembourg', 'norway'];
  /* `loose` = free page text (CSS may upper-case "Join us"): no bare US / UK. */
  function koCountry(text, loose) {
    const t = String(text || '');
    if (!t) return '';
    for (const [c, re, cased] of KO_COUNTRIES) if (re.test(t) || (!loose && cased && cased.test(t))) return c;
    if (KO_US_STATE_RE.test(t)) return 'united states';
    if (KO_CA_PROV_RE.test(t)) return 'canada';
    for (const [c, re] of KO_CITIES) if (re.test(t)) return c;
    return '';
  }
  function koCanon(c) { return koCountry(c) || String(c || '').toLowerCase().trim(); }

  let _ko = null, _koCv = null, _koProfile = {};
  function koFacts() {
    const p = _koProfile || {};
    const home = koCanon(p.country || '');
    const base = {
      workCountries: home ? [home] : [],
      euWide: false,
      relocate: true, remote: true, hybrid: true, onsite: true,
      over18: true, backgroundCheck: true, drugTest: true, essentialFunctions: true,
      driversLicence: null, clearance: false,
      previouslyEmployed: false, relatives: false, nonCompete: false, convicted: false,
      englishFluent: true,
      yearsExperience: '7', highestDegree: koDegreeFromCv(_koCv),
      certifications: ['AWS'],
      salary: String(p.expected_salary || '').trim(),          // as your profile writes it ("£85,000")
      confirmed: false,
    };
    const saved = Object.assign({}, _ko || {});
    for (const k of ['yearsExperience', 'highestDegree', 'salary']) if (saved[k] === '' || saved[k] == null) delete saved[k];   // empty = the default
    const f = Object.assign(base, saved);
    f.workCountries = (Array.isArray(f.workCountries) ? f.workCountries : String(f.workCountries || '').split(/[,;]/)).map(koCanon).filter(Boolean);
    if (f.euWide) for (const c of EU_EEA) if (!f.workCountries.includes(c)) f.workCountries.push(c);
    f.certifications = (Array.isArray(f.certifications) ? f.certifications : String(f.certifications || '').split(/[,;]/)).map(c => String(c).trim().toLowerCase()).filter(Boolean);
    return f;
  }
  const KO_DEGREE_RANK = [[/\bph\.?\s?d\b|\bdoctor(ate|al)?\b/i, 4], [/\bmaster'?s?\b|\bm\.?\s?sc\b|\bm\.?\s?eng\b|\bmba\b|\bm\.a\.|\bll\.?m\b|\bm\.?tech\b|postgraduate|post-graduate/i, 3],
                          [/\bbachelor'?s?\b|\bb\.?\s?sc\b|\bb\.?\s?eng\b|\bb\.a\.|\bb\.?tech\b|\bll\.?b\b|undergraduate degree|\bhons\b|honours degree/i, 2], [/\bassociate'?s? degree\b|\bdiploma\b|\bhnd\b|\bhnc\b/i, 1]];
  function koDegreeRank(t) { for (const [re, r] of KO_DEGREE_RANK) if (re.test(String(t || ''))) return r; return 0; }
  function koDegreeFromCv(cv) {
    let best = '';
    for (const e of ((cv && cv.education) || [])) if (koDegreeRank(e.degree) > koDegreeRank(best)) best = e.degree;
    return best;
  }
  async function loadKo() {
    try {
      const d = await ST.get([KO_KEY, 'ohCvProfile']);
      _ko = d[KO_KEY] && typeof d[KO_KEY] === 'object' ? d[KO_KEY] : null;
      _koCv = d.ohCvProfile && d.ohCvProfile.profile ? d.ohCvProfile.profile : null;
      _koProfile = await getProfile();
    } catch (_) {}
  }
  loadKo();
  try {
    chrome.storage.onChanged.addListener((c, area) => {
      if (area === 'local' && (c[KO_KEY] || c.ohCvProfile || c.ohWdSeeker || c.candidateDetails || c.autoApplyState)) loadKo();
    });
  } catch (_) {}

  /* The country of THIS job: the page's location, the title, a "Location:"
     line, the URL (/job/London/…) — and kept for the apply pages that follow
     the posting in the same tab. */
  let _jobCountryFor = '', _jobCountry = '';
  function jobCountry() {
    if (_jobCountryFor === location.href) return _jobCountry;
    let c = '';
    const sels = '[data-automation-id="locations"],[data-automation-id="jobPostingLocation"],[data-qa*="location" i],.posting-categories .location,.job__location,[class*="job-location" i],[class*="jobLocation" i],.location,[class*="location" i]';
    for (const el of $$(sels).slice(0, 40)) {
      if (el.querySelector('input,select,textarea') || el.closest('label') || /^(INPUT|SELECT|TEXTAREA|LABEL)$/.test(el.tagName)) continue;
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t || t.length > 200) continue;
      c = koCountry(t); if (c) break;
    }
    if (!c) c = koCountry(document.title || '', true);
    if (!c) { const m = ((document.body && document.body.innerText) || '').slice(0, 6000).match(/\b(?:job )?locations?\s*[:\-–]\s*([^\n]{2,80})/i); if (m) c = koCountry(m[1]); }
    if (!c) { try { c = koCountry(decodeURIComponent(location.pathname).replace(/\b[a-z]{2}[-_][A-Za-z]{2}\b/g, ' ').replace(/[-_/+]+/g, ' '), true); } catch (_) {} }
    try {
      const base = location.hostname + location.pathname.replace(/\/(apply|application|applyManually|autofillWithResume)\b.*$/i, '');
      if (c) sessionStorage.setItem('ohKoJob', JSON.stringify({ base, c }));
      else {
        const s = JSON.parse(sessionStorage.getItem('ohKoJob') || 'null');
        if (s && (location.hostname + location.pathname).startsWith(s.base)) c = s.c;
      }
    } catch (_) {}
    _jobCountryFor = location.href; _jobCountry = c;
    return c;
  }
  function koCanWork(country) {
    const f = koFacts();
    if (!country) return f.workCountries.length ? true : null;     // not said: the job is where you live
    return f.workCountries.includes(country);
  }
  function koSlug(s) { return String(s || '').toLowerCase().replace(/\b(inc|ltd|llc|plc|gmbh|limited|group|corp(oration)?|company|co)\b\.?/g, '').replace(/[^a-z0-9]+/g, ''); }

  /* What a knockout question asks, and your answer to it. */
  function koAnswer(label) {
    const raw = String(label || '').replace(/\s+/g, ' ').replace(/\*+\s*$/, '').trim();
    if (raw.length < 8 || raw.length > 500) return null;
    const l = raw.toLowerCase();
    const f = koFacts();
    const yn = (b, kind, why, extra) => (b == null ? null : Object.assign({ kind, answer: b ? 'Yes' : 'No', why }, extra || {}));
    const asks = /\?|^(are|do|does|will|would|can|could|is|have|has|did|were)\b/.test(l);
    const country = koCountry(raw) || jobCountry();
    const where = country ? `job in ${country}` : 'where you live';
    const authQ = /(authori[sz]ed|eligible|permitted|entitled|allowed) to (work|be employed|accept employment)|(legally|lawfully) able to work|right to work|work authori[sz]ation|work eligibility|employment eligibility|eligible for employment|lawfully (work|employed)|work permit\b|(have|hold) an? (valid |current )?(work |employment )?visa\b/.test(l);
    const sponsorQ = (/sponsor/.test(l) || (/\bvisa\b|h-?1b|immigration/.test(l) && /(require|need|will you|support|assist|transfer)/.test(l))) &&
                     !/without (the need for |requiring |needing )?(any |a )?(visa |employer |company )?sponsorship/.test(l);
    if (sponsorQ && !(authQ && /without/.test(l))) {
      const can = koCanWork(country);
      return yn(can == null ? null : !can, 'sponsorship', where, { canWork: can });
    }
    if (authQ) { const can = koCanWork(country); return yn(can, 'authorisation', where, { canWork: can }); }
    if (/relocat/.test(l) && !/assist|package|support|expense|allowance|bonus|cost|reimburs/.test(l)) return yn(f.relocate, 'relocation', 'your answer');
    if (/convicted|felony|pleaded guilty|criminal (offen[cs]e|conviction)|unspent conviction/.test(l)) return yn(f.convicted, 'conviction', 'your answer');
    if (/background (check|screen|investigation)|reference check|criminal (background|record) check|credit check|dbs check|pre-employment screening/.test(l)) return yn(f.backgroundCheck, 'background check', 'your answer');
    if (/drug (test|screen)/.test(l)) return yn(f.drugTest, 'drug screen', 'your answer');
    if (/essential functions|with or without (a )?reasonable accommodation/.test(l)) return yn(f.essentialFunctions, 'essential functions', 'your answer');
    if (/\b(18|eighteen) years|\b18 or older|at least 18|legal (working )?age|over the age of 18|minimum age/.test(l)) return yn(f.over18, 'age', 'your answer');
    if (/driv(er'?s|ing) licen[cs]e/.test(l)) return yn(f.driversLicence, 'driving licence', 'your answer');
    if (/security clearance|clearance level|active clearance|\bsc clearance|\bdv clearance/.test(l)) return yn(f.clearance, 'security clearance', 'your answer');
    if (/non-?compete|non-?solicit|restrictive covenant/.test(l)) return yn(f.nonCompete, 'non-compete', 'your answer');
    if (/(relatives?|family members?)\b.{0,60}\b(employ|work)|\b(employ|work)\w*\b.{0,60}\b(relatives?|family members?)\b|related to (anyone|an employee|someone|any employee)/.test(l)) return yn(f.relatives, 'relatives employed', 'your answer');
    if (/\b(previously|ever|formerly|before)\b.{0,40}\b(employed|worked|work|been an? (employee|contractor))\b.{0,12}\b(by|for|at|with)\b|former employee|\bcurrent or former\b.{0,20}employee/.test(l)) {
      const companies = ((_koCv && _koCv.work) || []).map(w => koSlug(w.company)).filter(s => s.length >= 3);
      const hit = companies.some(s => koSlug(l).includes(s) || location.hostname.replace(/[^a-z0-9]/g, '').includes(s));
      return yn(hit || !!f.previouslyEmployed, 'previously employed there', hit ? 'on your CV' : 'your answer');
    }
    if (/(fluent|proficien\w*|business[- ]level|professional working)( in)? english|speak english|english (fluency|proficiency|language skills)/.test(l)) return yn(f.englishFluent, 'English', 'your answer');
    if (asks && /\bremote(ly)?\b/.test(l) && !/on-?site|office|hybrid/.test(l)) return yn(f.remote, 'remote', 'your answer');
    if (asks && /on-?site|in[- ]office|in the office|hybrid|commut|report to (the|our) office|days (a|per) week (in|at)/.test(l)) {
      const away = !!(country && koCanWork(country) === false);
      return yn(away ? f.relocate : /hybrid/.test(l) ? f.hybrid : f.onsite, /hybrid/.test(l) ? 'hybrid' : 'on-site', away ? where : 'your answer');
    }
    /* Certifications you hold ("Do you hold an AWS Certified … certification?"). */
    if (/certif|accredit/.test(l) && !/^(which|what|list|please list|name|describe|tell us)\b/.test(l) && /(do you (hold|have|possess)|are you .{0,20}certified|have you (earned|obtained|achieved|passed)|hold an?|possess an?)/.test(l)) {
      const held = f.certifications.find(c => new RegExp(`(^|[^a-z0-9])${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i').test(l) ||
                                              (c === 'aws' && /amazon web services/.test(l)));
      if (held) return yn(true, 'certification', `you hold ${held.toUpperCase()}`);
    }
    /* Years of experience — any kind — are your number (7 unless you set another):
       a number, a band, or yes / no against "N+ years". */
    const need = l.match(/(\d+)\s*\+?\s*(?:or more |plus )?years?/);
    if (/how many years.{0,60}\b(experience|worked|working|work|professional|industry|using|with)\b|years of .{0,60}experience|total (years of )?experience|experience \(years\)|years' experience|years experience|experience in years/.test(l) || (need && /experience/.test(l))) {
      const yrs = Number(f.yearsExperience);
      if (isNaN(yrs)) return null;
      const why = `${yrs} years`;
      if (need && /(do you have|have you|minimum|at least|required|require|\?)/.test(l)) return yn(yrs >= Number(need[1]), 'years', why);
      return { kind: 'years', answer: String(yrs), why };
    }
    /* Degree. */
    const askRank = koDegreeRank(l);
    if (askRank && /(do you have|have you (completed|earned|obtained|attained)|do you hold|hold an?|possess|minimum|completed an?)/.test(l) && f.highestDegree) {
      return yn(koDegreeRank(f.highestDegree) >= askRank, 'degree', `you have ${f.highestDegree}`);
    }
    if (/highest (level of )?(education|degree|qualification)|education level|level of education/.test(l) && f.highestDegree) return { kind: 'degree level', answer: f.highestDegree, why: 'from your CV' };
    /* Salary. */
    if (/salary|compensation expectation|pay (expectation|range)|desired (pay|rate)|expected (pay|ctc)/.test(l) && f.salary) return { kind: 'salary', answer: f.salary, why: 'your expectation' };
    return null;
  }

  /* Does this option text say yes or no? */
  function optionMeans(t) {
    const s = String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!s || /prefer not|decline|do not wish|n\/a\b|not applicable/.test(s)) return null;
    if (/^(yes|y|true)\b/.test(s)) return 'yes';
    if (/^(no|n|false)\b/.test(s)) return 'no';
    if (/\b(not|don'?t|do not|won'?t|will not|never|no longer|cannot|can'?t|unable)\b/.test(s)) return 'no';
    if (/\b(i am|i'm|i do|i will|i would|i have|i can|willing|happy to)\b/.test(s)) return 'yes';
    return null;
  }
  /* Work-authorisation options: A = can work without sponsorship, S = needs
     sponsorship, N = not authorised. "Yes" means A to "authorised?" and S to
     "need sponsorship?". */
  function koAuthState(t, kind) {
    const s = String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!s || /prefer not|decline/.test(s)) return null;
    if (/sponsor/.test(s) || (/visa/.test(s) && /require|need/.test(s))) return /\b(not|no|never|without|don'?t|do not|won'?t|will not|doesn'?t|does not)\b.{0,40}\b(sponsor|visa)/.test(s) ? 'A' : 'S';
    if (/^(yes|y)\b/.test(s)) return kind === 'sponsorship' ? 'S' : 'A';
    if (/^(no|n)\b/.test(s)) return kind === 'sponsorship' ? 'A' : 'N';
    if (/\b(not|unable|cannot|can'?t|don'?t|do not)\b.{0,25}\b(authori[sz]ed|eligible|permitted|entitled|right)/.test(s)) return 'N';
    if (/authori[sz]ed|eligible|right to work|citizen|permanent resident|green card|settled status|indefinite leave|stamp 4|work permit/.test(s)) return 'A';
    return null;
  }
  function koNum(t) { const m = String(t).replace(/,/g, '').match(/\d+(\.\d+)?/g); return m ? m.map(Number) : []; }
  /* The option that gives this answer, or null. */
  function koPick(texts, ko) {
    const opts = texts.map(t => String(t || '').replace(/\s+/g, ' ').trim()).filter(t => t && !/^(select|choose|please select|select one|--)/i.test(t));
    if (!opts.length) return null;
    if ((ko.kind === 'authorisation' || ko.kind === 'sponsorship') && ko.canWork != null) {
      const wants = ko.canWork ? ['A'] : ko.kind === 'sponsorship' ? ['S', 'N'] : ['N', 'S'];
      for (const w of wants) { const o = opts.find(x => koAuthState(x, ko.kind) === w); if (o) return o; }
      return null;
    }
    if (ko.answer === 'Yes' || ko.answer === 'No') {
      const want = ko.answer.toLowerCase();
      return opts.find(o => o.toLowerCase() === want) || opts.find(o => optionMeans(o) === want) || null;
    }
    if (ko.kind === 'years' || ko.kind === 'salary') {
      const a0 = koNum(ko.answer)[0];
      const n = ko.kind === 'salary' && /\dk\b/i.test(ko.answer) && a0 < 1000 ? a0 * 1000 : a0;
      if (n == null || isNaN(n)) return null;
      let best = null;
      for (const o of opts) {
        const nums = koNum(o).map(x => (/\d\s*k\b/i.test(o) && x < 1000 ? x * 1000 : x));
        if (!nums.length) continue;
        const lo = nums[0], hi = nums.length > 1 ? nums[1] : null;
        if (hi != null && n >= lo && n <= hi) return o;
        if (/\+|or more|and above|above|over|more than|and up/i.test(o) && n >= lo) best = o;
        else if (/less than|under|below|fewer|up to/i.test(o) && n < lo) best = best || o;
        else if (hi == null && n === lo) return o;
      }
      return best;
    }
    if (ko.kind === 'degree level') {
      const r = koDegreeRank(ko.answer);
      return opts.find(o => koDegreeRank(o) === r) || null;
    }
    const a = ko.answer.toLowerCase();
    return opts.find(o => o.toLowerCase() === a) || opts.find(o => o.toLowerCase().startsWith(a)) || null;
  }
  /* For the Workday engine: the option (or text) to give, or null. */
  window.__ohKnockout = (label, options) => {
    try {
      const ko = koAnswer(label);
      if (!ko) return null;
      if (options && options.length) return koPick(options, ko);
      return ko.answer;
    } catch (_) { return null; }
  };

  /* ── The guard ── */
  const _koUserSet = new WeakSet();
  try {
    const mark = (el) => {
      if (!el || el === document.body) return;
      _koUserSet.add(el);
      const ff = el.closest && el.closest('[data-automation-id^="formField-"]');    // one Workday question
      if (ff) _koUserSet.add(ff);
      if (el.name && el.type === 'radio') $$(`input[type="radio"][name="${CSS.escape(el.name)}"]`).forEach(r => _koUserSet.add(r));
    };
    /* What counts as you: a real click (radios, tick boxes, pills, dropdown options), a real
       key press or paste in a box, a real change of a <select>. Not trusted "input" events —
       execCommand typing (ours, and other fillers') fires those too. */
    ['click', 'change', 'keydown', 'paste', 'drop'].forEach(type => document.addEventListener(type, (e) => {
      if (!e.isTrusted) return;
      const t = e.target && e.target.closest ? e.target : null;
      if (!t) return;
      if (type === 'keydown' && /^(Tab|Shift|Control|Alt|Meta|Escape|CapsLock)$/.test(e.key)) return;
      if (type === 'click' && t.closest('[role="option"],[data-automation-id="promptOption"]')) { mark(document.activeElement); return; }
      const el = t.closest('input,select,textarea,[role="radio"],[aria-pressed],button[aria-haspopup]');
      if (!el || (/^(submit|button)$/i.test(el.type || '') && !el.hasAttribute('aria-pressed') && !el.hasAttribute('aria-haspopup'))) return;
      const box = /^(radio|checkbox)$/i.test(el.type || '') || el.matches('[role="radio"],[aria-pressed],button[aria-haspopup]');
      if (type === 'click' ? !box : type === 'change' ? el.tagName !== 'SELECT' : box) return;
      mark(el);
    }, true));
  } catch (_) {}
  const koUserTouched = (el) => {
    if (!el) return false;
    if (_koUserSet.has(el)) return true;
    const ff = el.closest && el.closest('[data-automation-id^="formField-"]');
    return !!(ff && _koUserSet.has(ff));
  };
  function koGroupQuestion(el) {
    for (let n = el, i = 0; n && i < 6; n = n.parentElement, i++) {
      if (n.tagName === 'FIELDSET') { const lg = n.querySelector('legend'); if (lg && lg.textContent.trim()) return lg.textContent.trim(); }
      const by = n !== el && n.getAttribute && n.getAttribute('aria-labelledby');
      if (by) { const t = by.split(/\s+/).map(id => (document.getElementById(id) || {}).textContent || '').join(' ').trim(); if (t) return t; }
      if (n.getAttribute && /radiogroup|group/.test(n.getAttribute('role') || '') && n.getAttribute('aria-label')) return n.getAttribute('aria-label');
      if (n !== el) {
        for (let sib = n.previousElementSibling, k = 0; sib && k < 3; sib = sib.previousElementSibling, k++) {
          const t = (sib.textContent || '').replace(/\s+/g, ' ').trim();
          if (t && t.length <= 500 && !sib.querySelector('input,select,textarea,button')) return t;
        }
      }
    }
    return '';
  }
  const koOptText = (r) => {
    const lab = (r.id && document.querySelector(`label[for="${CSS.escape(r.id)}"]`)) || r.closest('label');
    return ((lab && lab.textContent) || r.getAttribute('aria-label') || r.value || '').replace(/\s+/g, ' ').trim();
  };
  const _koTries = new Map();
  const koGaveUp = (q) => (_koTries.get(q) || 0) >= 2;
  /* Every knockout question on the page answered wrong (or required and
     empty), with what it should be. Synchronous — no menus opened. */
  function koScan() {
    const out = [];
    const add = (it) => { if (!koGaveUp(it.type + '|' + it.q)) out.push(it); };
    const groups = new Map();
    for (const r of $$('input[type="radio"]')) {
      if (!r.name || (!isVisible(r) && !isVisible(r.closest('label') || r.parentElement))) continue;
      if (!groups.has(r.name)) groups.set(r.name, []);
      groups.get(r.name).push(r);
    }
    for (const radios of groups.values()) {
      if (radios.some(koUserTouched)) continue;
      const q = koGroupQuestion(radios[0]);
      const ko = koAnswer(q);
      if (!ko) continue;
      const want = koPick(radios.map(koOptText), ko);
      if (!want) continue;
      const cur = radios.find(r => r.checked);
      if (cur && koOptText(cur) === want) continue;
      add({ type: 'radio', q, ko, want, cur: cur ? koOptText(cur) : '', el: radios.find(r => koOptText(r) === want) });
    }
    for (const sel of $$('select').filter(isVisible)) {
      if (koUserTouched(sel)) continue;
      const q = getLabel(sel) || koGroupQuestion(sel);
      const ko = koAnswer(q);
      if (!ko) continue;
      const want = koPick([...sel.options].map(o => o.text), ko);
      if (!want) continue;
      const cur = sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].text.replace(/\s+/g, ' ').trim() : '';
      if (cur === want) continue;
      add({ type: 'select', q, ko, want, cur, el: sel });
    }
    for (const input of $$('input').filter(i => isComboInput(i))) {
      const ctl = comboControl(input);
      if (!isVisible(ctl || input) || koUserTouched(input) || koUserTouched(ctl)) continue;
      const q = getLabel(input) || getLabel(ctl) || koGroupQuestion(ctl || input);
      const ko = koAnswer(q);
      if (!ko) continue;
      const cur = comboSelectedText(input);
      if (cur && koPick([cur], ko) === cur) continue;
      if (!cur && !/\*\s*$/.test(q) && input.getAttribute('aria-required') !== 'true' && !input.required) continue;
      add({ type: 'combo', q, ko, want: null, cur, el: input });
    }
    /* Statements you tick: "I am authorised to work in the US without sponsorship". */
    for (const cb of $$('input[type="checkbox"]')) {
      if (!isVisible(cb) && !isVisible(cb.closest('label') || cb.parentElement)) continue;
      if (koUserTouched(cb) || (cb.name && $$(`input[type="checkbox"][name="${CSS.escape(cb.name)}"]`).length > 1)) continue;
      const q = koOptText(cb) || getLabel(cb);
      if (!/^(i\b|i'm|yes\b)|\b(confirm|certify|attest|declare)\b/i.test(q)) continue;
      const ko = koAnswer(q);
      if (!ko || (ko.answer !== 'Yes' && ko.answer !== 'No')) continue;
      let want = ko.answer === 'Yes';
      if (/\b(not|unable|cannot|can't|do not|don't|won't|will not)\b/i.test(q) && !/without/i.test(q)) want = !want;
      if (cb.checked === want) continue;
      add({ type: 'check', q, ko, want: want ? 'ticked' : 'unticked', cur: cb.checked ? 'ticked' : 'unticked', el: cb });
    }
    /* Typed answers: a number of years, or a yes / no. */
    for (const t of $$('input[type="text"],input[type="number"],input:not([type]),textarea').filter(isVisible)) {
      if (isComboInput(t) || koUserTouched(t)) continue;
      const q = getLabel(t);
      const ko = koAnswer(q);
      if (!ko) continue;
      const cur = (t.value || '').trim();
      let want = null;
      if (ko.kind === 'years' && /^\d+(\.\d+)?$/.test(ko.answer)) {
        if (cur && !/^\d{1,2}(\.\d+)?\s*\+?\s*(years?)?$/i.test(cur)) continue;     // a sentence: yours
        if (cur && Number(cur.replace(/[^\d.]/g, '')) === Number(ko.answer)) continue;
        if (!cur && !t.required && t.getAttribute('aria-required') !== 'true' && !/\*\s*$/.test(q)) continue;
        want = ko.answer;
      } else if (ko.answer === 'Yes' || ko.answer === 'No') {
        if (!/^(yes|no|y|n)$/i.test(cur) || optionMeans(cur) === ko.answer.toLowerCase()) continue;
        want = ko.answer;
      }
      if (want != null) add({ type: 'text', q, ko, want, cur, el: t });
    }
    /* Pill / segmented buttons (Oracle and others). */
    const pillBoxes = new Map();
    for (const b of $$('button[aria-pressed],[role="radio"]:not(input)').filter(isVisible)) {
      const box = b.parentElement;
      if (!box) continue;
      if (!pillBoxes.has(box)) pillBoxes.set(box, []);
      pillBoxes.get(box).push(b);
    }
    for (const [box, bs] of pillBoxes) {
      if (bs.length < 2 || bs.some(koUserTouched)) continue;
      const q = koGroupQuestion(box);
      const ko = koAnswer(q);
      if (!ko) continue;
      const names = bs.map(b => (b.textContent || '').replace(/\s+/g, ' ').trim());
      const want = koPick(names, ko);
      if (!want) continue;
      const on = bs.find(b => b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-checked') === 'true');
      if (on && (on.textContent || '').replace(/\s+/g, ' ').trim() === want) continue;
      add({ type: 'pill', q, ko, want, cur: on ? (on.textContent || '').trim() : '', el: bs[names.indexOf(want)] });
    }
    /* Workday's own dropdown buttons (when the Workday engine is not the one filling). */
    for (const btn of $$('[data-automation-id^="formField-"] button[aria-haspopup="listbox"]').filter(isVisible)) {
      const box = btn.closest('[data-automation-id^="formField-"]');
      if (koUserTouched(btn)) continue;
      const q = ((box.querySelector('label,legend') || {}).textContent || '').trim();
      const ko = koAnswer(q);
      if (!ko) continue;
      const cur = (btn.textContent || '').replace(/\s+/g, ' ').trim();
      if (cur && !/^select one$/i.test(cur) && koPick([cur], ko) === cur) continue;
      add({ type: 'wdlist', q, ko, want: null, cur: /^select one$/i.test(cur) ? '' : cur, el: btn });
    }
    return out;
  }
  let _koSelf = false;   // our own clicks while fixing — never held
  const koClick = (el) => { _koSelf = true; try { realClick(el); } finally { _koSelf = false; } };
  async function koFix(item) {
    const esc = () => { try { (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); } catch (_) {} };
    try {
      if (item.type === 'radio') {
        if (!item.el) return false;
        koClick(item.el);
        if (!item.el.checked) { item.el.checked = true; item.el.dispatchEvent(new Event('change', { bubbles: true })); }
      } else if (item.type === 'select') {
        const o = [...item.el.options].find(x => x.text.replace(/\s+/g, ' ').trim() === item.want);
        if (!o) return false;
        item.el.value = o.value;
        item.el.dispatchEvent(new Event('input', { bubbles: true }));
        item.el.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (item.type === 'check') {
        koClick(item.el);
        if (item.el.checked !== (item.want === 'ticked')) { item.el.checked = item.want === 'ticked'; item.el.dispatchEvent(new Event('change', { bubbles: true })); }
      } else if (item.type === 'text') {
        /* Not nativeSet: its fight guard won't retype a value another filler replaced — here it must. */
        _protoValueSet(item.el, item.want);
        for (const ev of ['input', 'change', 'blur']) item.el.dispatchEvent(new Event(ev, { bubbles: true }));
        if (item.el.value !== item.want) return false;
      } else if (item.type === 'pill') {
        if (!item.el) return false;
        koClick(item.el);
      } else {
        const input = item.el;
        if (item.type === 'combo') {
          const ctl = comboControl(input);
          try { koClick(ctl || input); input.focus(); } catch (_) {}
          nativeSet(input, '');
          try { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true, cancelable: true })); } catch (_) {}
        } else koClick(input);
        await sleep(450);
        const opts = item.type === 'combo' ? comboOptions() : $$('[role="listbox"] [role="option"],[data-automation-id="promptOption"]').filter(isVisible);
        const texts = opts.map(o => (o.textContent || '').replace(/\s+/g, ' ').trim());
        const want = koPick(texts, item.ko);
        const hit = want && opts[texts.indexOf(want)];
        if (!hit) { esc(); return false; }
        koClick(hit);
        item.want = want;
        await sleep(250);
      }
      LOG(`Knockout: "${item.q.replace(/\s+/g, ' ').slice(0, 90)}" ${item.cur ? `"${item.cur}" → ` : '→ '}"${item.want}" (${item.ko.kind}: ${item.ko.why})`);
      return true;
    } catch (_) { return false; }
  }
  let _koFixP = null;   // the fix pass running now
  function koFixAll(items) {
    if (_koFixP) return _koFixP.then(() => 0);
    _koFixP = (async () => {
      let n = 0;
      for (const item of (items || koScan())) {
        const key = item.type + '|' + item.q;
        if (await koFix(item)) n++;
        else _koTries.set(key, (_koTries.get(key) || 0) + 1);
        await sleep(120);
      }
      /* What still reads wrong after a fix (the site undid it) counts as a try. */
      for (const it of koScan()) { const key = it.type + '|' + it.q; _koTries.set(key, (_koTries.get(key) || 0) + 1); }
      if (n) { try { const d = await ST.get(['ohKnockoutFixes']); await ST.set({ ohKnockoutFixes: (Number(d.ohKnockoutFixes) || 0) + n }); } catch (_) {} }
      return n;
    })().catch(() => 0).finally(() => { _koFixP = null; });
    return _koFixP;
  }
  let _koMasterOff = false;     // Automation OFF on the card: inert here too
  try {
    ST.get(['ohAutomationDisabled']).then(d => { _koMasterOff = !!(d && d.ohAutomationDisabled === true); }).catch(() => {});
    chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.ohAutomationDisabled) _koMasterOff = c.ohAutomationDisabled.newValue === true; });
  } catch (_) {}
  function koPageOk() {
    if (_IS_OH_PAGE || _koMasterOff || wdEngineOwns()) return false;
    if (CURRENT_ATS) return true;
    return !!document.querySelector('input[type="file"],[data-automation-id^="formField-"]') || /apply|application|career|job|recruit|candidate|vacanc/i.test(location.href);
  }
  (function installKnockoutGuard() {
    if (_IS_OH_PAGE) return;
    const seenAt = new Map();
    /* Governed interval: only while a run is engaged (the Submit hold below works any time). */
    setInterval(async () => {
      if (_koFixP || !koPageOk()) return;
      if (!document.querySelector('form,input[type="radio"],select,[role="radiogroup"],[data-automation-id^="formField-"],button[aria-pressed]')) return;
      const items = koScan();
      if (!items.length) return;
      /* Give any filler 2.5 s to finish a question before correcting it. */
      const now = Date.now();
      const ready = items.filter(it => { const k = it.type + '|' + it.q; if (!seenAt.has(k)) seenAt.set(k, now); return now - seenAt.get(k) >= 2500; });
      if (ready.length) await koFixAll(ready);
    }, 1500);
    /* Hold a Submit / Next click while a knockout answer is wrong (or a fix pass is running):
       fix, then let it through. Window capture: before the page's own handlers. */
    let replay = false;
    const STEP_RE = /^(submit|apply|send|next|continue|save (&|and) continue|save and next|review|finish|complete)\b/i;
    const isStep = (b, t) => {
      if (b.hasAttribute('aria-pressed') || b.hasAttribute('aria-haspopup') || /radio|option|tab|menuitem|switch/.test(b.getAttribute('role') || '')) return false;
      if (/^(yes|no|n\/a|back|previous|cancel|save( as)? draft|add|remove|delete|upload)\b/i.test(t)) return false;
      return STEP_RE.test(t) || (b.type === 'submit' && !!b.form && b.tagName !== 'A');
    };
    const hold = (e, label, go) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      LOG(`Knockout: holding "${label.slice(0, 30)}" until the knockout answers are right`);
      (async () => { if (_koFixP) await _koFixP; await koFixAll(); })()
        .finally(() => { replay = true; try { go(); } finally { replay = false; } });
    };
    window.addEventListener('click', (e) => {
      if (replay || _koSelf || !e.target || !e.target.closest) return;
      const b = e.target.closest('button,input[type="submit"],[role="button"],a');
      if (!b) return;
      const t = (b.innerText || b.value || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
      if (!isStep(b, t) || !koPageOk()) return;
      if (!_koFixP && !koScan().length) return;
      hold(e, t, () => b.click());
    }, true);
    window.addEventListener('submit', (e) => {
      if (replay || !koPageOk()) return;
      if (!_koFixP && !koScan().length) return;
      const form = e.target;
      hold(e, 'submit', () => (form.requestSubmit ? form.requestSubmit() : form.submit()));
    }, true);
  })();

  /* ── Smart value guesser ─────────────────────────────────── */
  const DEFAULTS = {
    authorized:   'Yes',
    sponsorship:  'No',
    relocation:   'Yes',
    remote:       'Yes',
    veteran:      'I am not a protected veteran',
    disability:   'I do not have a disability',
    gender:       'Prefer not to say',
    ethnicity:    'Prefer not to say',
    race:         'Prefer not to say',
    years:        '7',           // every years-of-experience question, unless Knockout answers set another number (koFacts)
    salary:       '80000',
    salaryRange:  '80000-110000',
    hourly:       '45',
    notice:       '2 weeks',
    availability: 'Immediately',
    startDate:    '2 weeks from offer',
    // Professional canned answers — used ONLY if profile has none
    cover: `I am excited to apply for this role. My background and skills make me a strong fit for the position, and I am eager to contribute to your team's continued success. I bring the technical expertise, drive, and collaborative mindset needed to make an immediate impact.`,
    why: 'I admire the company culture and the opportunity to make a meaningful impact through work that aligns with my skills and long-term career goals.',
    whyCompany: 'Your company\'s reputation for innovation, strong values, and commitment to growth make it a place where I can contribute meaningfully while continuing to develop professionally.',
    whyRole: 'This role aligns perfectly with my skills and career direction. The opportunity to apply my experience to meaningful challenges while contributing to a talented team is exactly what I\'m looking for.',
    strengths: 'My key strengths are technical proficiency, strong problem-solving ability, effective communication, and a collaborative team-first mindset.',
    weakness: 'I have been working on delegating more effectively. I naturally want to ensure quality by handling things myself, and I\'ve been consciously building trust with colleagues to share responsibility.',
    goals: 'Over the next 3-5 years, I want to deepen my expertise, take on greater leadership responsibility, and contribute to impactful projects that drive real business outcomes.',
    hardProblem: 'I enjoy hard technical problems, especially ones where reliability, scale and clear trade-offs matter. I approach them by measuring first, breaking the problem into parts I can test quickly, validating each step with data, and leaving the system simpler and better documented than I found it.',
    tellAbout: 'I\'m a dedicated professional with a track record of delivering strong results. I combine technical depth with a collaborative approach, and I thrive in roles where I can solve meaningful problems and help teams succeed.',
    motivation: 'I\'m motivated by meaningful impact, continuous learning, and the opportunity to work alongside talented people on problems that matter.',
    valueAdd: 'I bring the right combination of experience, technical skill, and work ethic to make an immediate positive impact. I move fast, communicate clearly, and consistently deliver quality work.',
    reasonLeaving: 'I\'m seeking new challenges and an opportunity for greater impact and growth, which this role represents.',
    howHeard: 'LinkedIn',
    /* Fields OptimHire explicitly reports as blocking submission when
       empty/invalid ("Country Phone Code is required", "Phone Device
       Type is required", "Discipline is required"). */
    phoneCountryCode: '+353',      // Ireland — matches the profile's locale
    phoneDeviceType:  'Mobile',
    fieldOfStudy:     'Computer Science',
    pronouns: 'they/them',
    hoursPerWeek: '40',
    weekendsAvail: 'Yes',
    eveningsAvail: 'Yes',
    overtime: 'Yes',
    travelPct: '25',
    driversLicense: 'Yes',
    clearance: 'No',
    criminalRecord: 'No',
    drugTest: 'Yes',
    backgroundCheck: 'Yes',
    languageProficiency: 'Fluent',
    willingToDrugTest: 'Yes',
    willingBackgroundCheck: 'Yes',
    references: 'Available upon request',
    age: '28',
    over18: 'Yes',
    nativeLanguage: 'English',
    preferredShift: 'Day',
    canCommute: 'Yes',
    hasTransportation: 'Yes',
    hasEquipment: 'Yes',
    hasInternet: 'Yes',
    hasQuietWorkspace: 'Yes',
  };

  // Experience-related label patterns — used in both guessValue and select handling
  const EXP_LABEL_RE = /how.?many.?years|number.?of.?years|years.?of.?(professional\s+)?exp|years?.?(exp|experience|work(?:ing)?)|exp(?:erience)?.?in.?years|total.?years|years.?in.?(the\s+)?(?:field|industry|role|profession)|years.?with|years.?as|exp(?:erience)?.?(long|total|professional)|how.?long.?(have.?you|working)|professional.?exp|work.?exp|prior.?exp/i;

  /* ── T31: PAGE_DATA bridge (ported from v2.5.0 inject.js) ───────────
   * Paylocity ATS pre-loads country/state data as window.pageData. The
   * official extension reads this via a page-world script + postMessage.
   * We reproduce the same bridge so Paylocity country/state selects fill.
   * ────────────────────────────────────────────────────────────────── */
  /* (Removed: page-data bridge.) It injected an inline <script> on every
   * page load to post window.pageData back to us. The MV3 content-script
   * CSP blocks inline scripts, so it never delivered anything, and nothing
   * ever read the value it would have stored. */

  /* ── T34: cleanQuestionText (ported from v2.5.0) ────────────────────
   * Strip leading/trailing punctuation, asterisks (required markers),
   * collapse whitespace, lowercase. Used as the Q&A memory key so
   * "First Name *", " First  name:", "first name" all hash the same.
   * ────────────────────────────────────────────────────────────────── */
  function cleanQuestionText(str) {
    if (!str) return '';
    return String(str)
      .replace(/\*+/g, ' ')
      .replace(/[\u200B-\u200F\uFEFF]/g, '')
      .replace(/[^\w\s?]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .slice(0, 240);
  }

  /* ── T35: Shadow-DOM aware query (ported from v2.5.0) ───────────────
   * Many modern ATS (Workday, SuccessFactors) wrap inputs in shadow
   * roots. Plain document.querySelectorAll misses these. We descend
   * into every open shadow root and aggregate matches.
   * ────────────────────────────────────────────────────────────────── */
  function queryAllWithShadow(selector, root = document) {
    const out = [];
    try {
      out.push(...root.querySelectorAll(selector));
      const all = root.querySelectorAll('*');
      for (const el of all) {
        if (el.shadowRoot) {
          out.push(...queryAllWithShadow(selector, el.shadowRoot));
        }
      }
    } catch (_) {}
    return out;
  }
  function querySelectorWithShadow(selector, root = document) {
    return queryAllWithShadow(selector, root)[0] || null;
  }

  /* ── v6.1 / v2.5.2 port: Cloudflare bot-challenge detection ─────────
   * If a Cloudflare "verify you are human" challenge is on the page,
   * any autofill we do will fail and may trip the page into a refresh
   * loop. Detect and bail out cleanly so the user can solve manually.
   * ────────────────────────────────────────────────────────────────── */
  function isCloudflareChallenge() {
    try {
      // Iframe-based challenge
      if (document.querySelector('iframe[src*="challenges.cloudflare.com"]')) return true;
      // Turnstile widget
      if (document.querySelector('div.cf-turnstile, [class*="cf-challenge"], #cf-challenge-stage')) return true;
      // Title-based heuristic
      if (/just a moment|attention required|cloudflare/i.test(document.title)) {
        if (document.querySelector('input[type="hidden"][name="cf_chl"]') ||
            document.querySelector('[id*="cf-"]')) return true;
      }
    } catch (_) {}
    return false;
  }

  /* ── v6.1 / v2.5.2 port: Dropzone resume upload ─────────────────────
   * Many ATS use drag-drop dropzones (no plain file input). When the
   * dropzone wraps a hidden file input, we can target it via shadow-aware
   * search. When the input is created on click, we simulate a click on
   * the dropzone first so the input materialises, then attach the file.
   * ────────────────────────────────────────────────────────────────── */
  const DROPZONE_SEL =
    '[class*="dropzone" i], [class*="drop-zone" i], [class*="drop_zone" i],' +
    '[class*="upload-area" i], [class*="upload_area" i], [data-testid*="dropzone" i]';

  async function tryDropzoneResume(p) {
    const url = p?.resume_url || p?.resumeUrl || p?.resume;
    if (!url) return 0;
    const zones = queryAllWithShadow(DROPZONE_SEL);
    if (!zones.length) return 0;
    let attached = 0;
    const fname = (p.first_name || 'resume') + '_' + (p.last_name || 'file') + '.pdf';
    /* Only a CV/résumé box gets the CV. This used to fill EVERY dropzone —
       so the CV also landed in "Cover Letter" (and any other upload box). */
    const zoneText = z => [z.getAttribute && z.getAttribute('aria-label'), z.id, z.getAttribute && z.getAttribute('data-testid'),
                           (z.closest && (z.closest('.field,[class*="field" i],fieldset,[class*="upload" i]') || z).innerText || '').slice(0, 200)]
                          .filter(Boolean).join(' ');
    for (const zone of zones) {
      const zt = zoneText(zone);
      if (NOT_RESUME_RE.test(zt)) continue;
      if (zones.length > 1 && !RESUME_INPUT_RE.test(zt)) continue;
      let inp = zone.querySelector('input[type="file"]');
      if (!inp) {
        // Try clicking once to materialise the input
        try { realClick(zone); } catch (_) {}
        await sleep(120);
        inp = zone.querySelector('input[type="file"]') ||
              querySelectorWithShadow('input[type="file"]', zone);
      }
      if (!inp || (inp.files && inp.files.length > 0)) continue;
      const file = await fetchResumeFile(url, fname);
      if (!file) break;
      try {
        const dt = new DataTransfer();
        dt.items.add(file);
        inp.files = dt.files;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        attached++;
      } catch (_) {}
    }
    if (attached) LOG(`Resume attached via dropzone to ${attached} input(s)`);
    return attached;
  }

  /* ── T33: Apply-on-company-site auto-skip (ported from v2.5.0) ──────
   * On Indeed/LinkedIn job pages the only action is "Apply on company
   * site" which opens an external URL. If we land on such a page and
   * there's no form to fill, skip it so the queue advances.
   * ────────────────────────────────────────────────────────────────── */
  const APPLY_EXTERNAL_RE = /apply\s+on\s+company\s+site|apply\s+externally|view\s+on\s+company\s+site/i;
  function isApplyOnCompanySitePage() {
    try {
      const btns = document.querySelectorAll('a, button, [role="button"]');
      for (const b of btns) {
        const t = (b.innerText || b.textContent || '').trim();
        if (APPLY_EXTERNAL_RE.test(t)) return b;
      }
    } catch (_) {}
    return null;
  }

  /* ── T32: Notice-period smart-match (ported from v2.5.0) ────────────
   * Some ATS present notice period as a dropdown with text options
   * like "2 weeks", "1 month", "30 days". Convert user's "2 weeks"
   * (or 14 days numeric) to closest matching option by day count.
   * ────────────────────────────────────────────────────────────────── */
  function parseDaysFromText(txt) {
    if (!txt) return null;
    const s = String(txt).toLowerCase();
    if (/immediate|asap|now|right away/.test(s)) return 0;
    const m = s.match(/(\d+)\s*(day|week|month|year)/);
    if (!m) {
      const n = s.match(/(\d+)/);
      return n ? parseInt(n[1], 10) : null;
    }
    const n = parseInt(m[1], 10);
    const unit = m[2];
    if (unit === 'day')   return n;
    if (unit === 'week')  return n * 7;
    if (unit === 'month') return n * 30;
    if (unit === 'year')  return n * 365;
    return n;
  }

  function pickNoticePeriodOption(select, target) {
    if (!select || !select.options || !select.options.length) return null;
    const targetDays = parseDaysFromText(target);
    if (targetDays == null) return null;
    let bestIdx = -1, bestDiff = Infinity, exactIdx = -1;
    for (let i = 0; i < select.options.length; i++) {
      const opt = select.options[i];
      const d = parseDaysFromText(opt.text);
      if (d == null) continue;
      if (d === targetDays) { exactIdx = i; break; }
      const diff = Math.abs(d - targetDays);
      if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
    }
    return exactIdx !== -1 ? exactIdx : (bestIdx !== -1 ? bestIdx : null);
  }

  /* ── T25: Q&A memory — remember answers that worked ──────────────────
   * Question → answer pairs keyed by the normalised question label, so a
   * question the rules below can't answer (or answer wrongly) gets the
   * answer that went through last time.
   *
   * How an answer gets in (installQaMemoryLearner, end of file):
   *   1. When a Submit / Next / Continue button is clicked (by the user or
   *      by our automation) the answers currently on the form are
   *      snapshotted into a PENDING record for this tab.
   *   2. Only when the application is CONFIRMED (a thank-you /
   *      confirmation page, or OptimHire's own success message) is the
   *      pending snapshot committed into memory. An application that
   *      failed or was abandoned teaches nothing.
   *   3. Only informative answers are kept: identity / contact fields,
   *      links, dates, salary, sponsorship / work-authorisation (these
   *      depend on the job's country — sponsorship stays "No" by rule),
   *      essays, filler like "N/A", and answers that repeat the company or
   *      job title are never stored. Nor are answers the built-in rules
   *      would give anyway — memory only records what the rules got wrong
   *      or could not produce.
   * The remembered answers can be viewed, deleted and cleared from the
   * Queue Manager page.
   * ────────────────────────────────────────────────────────────────── */
  const QA_MEMORY_KEY = 'ohQaMemory';
  const QA_MAX_ENTRIES = 500;
  const QA_PENDING_PREFIX = 'ohQaPend_';
  const QA_PENDING_TTL_MS = 30 * 60_000;
  let _qaCache = null;
  let _qaBypass = false;     // true while computing the rule-only answer

  /* Questions whose answers must come from the profile / rules, never from
     memory. Matched against the NORMALISED label (lowercase, punctuation
     turned into spaces). */
  const QA_NEVER_RE = new RegExp([
    '\\b(first|last|middle|full|given|family|preferred|legal|sur)\\s?name\\b', '^name$', '^your name', '\\bname of\\b',
    '\\be\\s?mail\\b', 'phone', '\\bmobile( number| no\\b|$)', '\\bcell\\b', 'telephone', '\\bfax\\b',
    'address', 'street', '\\bcity\\b', '\\btown\\b', '\\bzip\\b', 'postal', 'post ?code', '^(state|county|province|region)( |$)', 'state province', 'country', '\\blocation',
    'linkedin', 'github', 'twitter', 'website', 'portfolio', '\\burl\\b', '\\blink\\b',
    'password', 'passcode', 'user ?name', '\\bssn\\b', 'social security', 'national (insurance|id)', '\\bpps\\b', 'passport', '\\btax\\b',
    'birth', '\\bdob\\b', 'signature', 'sign here', '\\binitials?\\b', '\\btoday\\b', '\\bdate\\b', 'captcha', 'verification', '\\botp\\b', '\\bcode\\b',
    'salary', 'compensation', '\\bpay\\b', '(hourly|daily|day) ?rate', '\\bctc\\b', 'remuneration',
    '\\bsearch\\b', 'keyword', '\\bfilter', '\\bsort\\b',
    'cover letter', '\\bresume', '\\bcv\\b', '\\breferr', 'recruiter',
    'sponsor', '\\bvisas?\\b', 'authori[sz]', 'right to work', 'work permit', 'eligib', 'legally', 'citizen', 'immigration'
  ].join('|'), 'i');
  const QA_ESSAY_RE = /\bwhy\b|describe|tell us|explain|about yourself|motivat|interested in|what (excites|interests|attracts)|cover|additional information|anything else/i;
  const QA_FILLER_RE = /^(n\/?a|na|none|nil|null|undefined|-+|\.+|x+|test|asdf|select|choose|please select|select\.\.\.)$/i;
  const QA_GENERIC_KEYS = new Set(['yes', 'no', 'answer', 'response', 'select', 'choose', 'please select', 'other',
    'option', 'value', 'text', 'input', 'field', 'question', 'required', 'optional', 'none', 'search', 'type here',
    'your answer', 'enter your answer', 'true', 'false']);

  function normalizeQa(label) {
    // Use the v2.5.0-compatible cleanQuestionText so keys match the official
    // extension's question normalisation (improves cross-session memory hits).
    return cleanQuestionText(label);
  }

  async function loadQaMemory() {
    if (_qaCache) return _qaCache;
    try {
      const { [QA_MEMORY_KEY]: raw = {} } = await ST.get(QA_MEMORY_KEY);
      _qaCache = raw && typeof raw === 'object' ? raw : {};
    } catch (_) { _qaCache = {}; }
    return _qaCache;
  }

  /* The Workday engine (assets/wd-engine.js) asks the same memory first. */
  window.__ohQaLookup = async (label) => { await loadQaMemory(); return rememberedAnswer(label, ''); };

  /* Memory lookup used at the top of guessValue(). */
  const _qaUsedLogged = new Set();
  function rememberedAnswer(label, inputType) {
    if (_qaBypass || !_qaCache) return null;
    if (/^(email|tel|password|url|date|datetime-local|month|week|time|file|hidden)$/.test(inputType || '')) return null;
    const k = normalizeQa(label);
    if (!k || QA_NEVER_RE.test(k)) return null;
    const e = _qaCache[k];
    if (!e || !e.success || e.answer == null || e.answer === '') return null;
    if (!_qaUsedLogged.has(k)) { _qaUsedLogged.add(k); LOG(`Q&A memory: using remembered answer for "${e.q || k}"`); }
    return String(e.answer);
  }

  /* Is this snapshotted answer worth remembering? `a` = {label, answer,
     kind, type}; `p` = profile; `ctx` = {title, company} of the job. */
  function qaWorthRemembering(k, a, p, ctx) {
    if (!k || k.length < 3 || k.length > 200 || QA_GENERIC_KEYS.has(k)) return false;
    if (QA_NEVER_RE.test(k)) return false;
    const ans = String(a.answer || '').trim();
    if (!ans || ans.length > 200 || QA_FILLER_RE.test(ans)) return false;
    if (normalizeQa(ans) === k) return false;                       // "answer" is just the label
    if (a.kind === 'textarea' && (QA_ESSAY_RE.test(k) || ans.length > 120)) return false;
    if (QA_ESSAY_RE.test(k) && ans.split(/\s+/).length > 12) return false;
    if (a.type === 'number' && ans === '1') return false;          // our required-field filler
    if (/https?:\/\/|www\.|@/.test(ans)) return false;            // links / e-mail addresses
    const low = ans.toLowerCase();
    const has = (s) => { s = String(s || '').trim().toLowerCase(); return s.length >= 3 && low.includes(s); };
    if (ctx && (has(ctx.company) || has(ctx.title))) return false;  // job-specific
    if (p) {
      if (has(p.email) || (has(p.first_name) && has(p.last_name))) return false;
      const digits = String(p.phone || '').replace(/\D/g, '');
      if (digits.length >= 6 && ans.replace(/\D/g, '').includes(digits.slice(-6))) return false;
    }
    /* What would the rules answer without memory? Same → nothing to learn. */
    let rule = '';
    _qaBypass = true;
    try { rule = String(guessValue(a.label || '', p || {}, a.type || '') || ''); } catch (_) { rule = ''; }
    finally { _qaBypass = false; }
    if (rule) {
      const r = normalizeQa(rule), v = normalizeQa(ans);
      if (r && (r === v || v.startsWith(r + ' '))) return false;
    }
    return true;
  }

  /* Merge a confirmed application's answers into memory. */
  function mergeIntoQaMemory(mem, answers, p, ctx, host) {
    let n = 0;
    const now = Date.now();
    for (const [k, a] of Object.entries(answers || {})) {
      if (!a || !qaWorthRemembering(k, a, p, ctx)) continue;
      const prev = mem[k];
      mem[k] = {
        q: String(a.label || k).replace(/\s+/g, ' ').trim().slice(0, 160),
        answer: String(a.answer).trim().slice(0, 200),
        success: true,
        ts: now,
        n: ((prev && prev.answer === a.answer && prev.n) || 0) + 1,
        host: String(host || '').slice(0, 80),
      };
      n++;
    }
    const keys = Object.keys(mem);
    if (keys.length > QA_MAX_ENTRIES) {
      keys.sort((x, y) => (mem[x].ts || 0) - (mem[y].ts || 0));
      keys.slice(0, keys.length - QA_MAX_ENTRIES).forEach(k2 => delete mem[k2]);
    }
    return n;
  }

  /* Question text of a radio group. getLabel() on the first radio often
     returns that radio's OWN option text ("Yes") when each radio is
     wrapped in its label — useless as a question and dangerous as a memory
     key. Fall back to the group's legend / aria label / nearest preceding
     question text. */
  function radioOptionText(r) {
    try {
      const byFor = r.id ? document.querySelector(`label[for="${CSS.escape(r.id)}"]`) : null;
      const wrap = r.closest && r.closest('label');
      return ((byFor && byFor.textContent) || (wrap && wrap.textContent) || r.value || '').replace(/\s+/g, ' ').trim();
    } catch (_) { return (r && r.value) || ''; }
  }
  function radioGroupLabel(radios) {
    const first = radios && radios[0];
    if (!first) return '';
    const opts = new Set(radios.map(r => normalizeQa(radioOptionText(r))).filter(Boolean));
    const ok = (t) => {
      t = (t || '').replace(/\s+/g, ' ').trim();
      const k = normalizeQa(t);
      return t && t.length < 300 && k.length >= 3 && !opts.has(k) && !QA_GENERIC_KEYS.has(k) ? t : '';
    };
    const own = getLabel(first) || '';
    if (ok(own)) return own;
    const grp = first.closest && first.closest('fieldset,[role="radiogroup"],[role="group"]');
    if (grp) {
      const legend = grp.querySelector(':scope > legend');
      if (legend && ok(legend.textContent)) return ok(legend.textContent);
      if (ok(grp.getAttribute('aria-label'))) return ok(grp.getAttribute('aria-label'));
      const lb = grp.getAttribute('aria-labelledby');
      if (lb) {
        const t = lb.split(/\s+/).map(id => (document.getElementById(id) || {}).textContent || '').join(' ');
        if (ok(t)) return ok(t);
      }
    }
    /* Closest text that PRECEDES the group, preferring label-like elements
       over generic p/span/div, walking a few ancestors up. */
    let node = first.parentElement;
    for (let i = 0; i < 5 && node && node !== document.body; i++, node = node.parentElement) {
      let strong = '', weak = '';
      for (const c of node.querySelectorAll('legend,label,[class*="label" i],[class*="question" i],h2,h3,h4,h5,p,span,div')) {
        if (c.querySelector('input,select,textarea')) continue;
        if (!(c.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
        const t = ok(c.textContent);
        if (!t) continue;
        if (/^(LEGEND|LABEL|H2|H3|H4|H5)$/.test(c.tagName) || /label|question/i.test(c.className || '')) strong = t;
        else weak = t;
      }
      if (strong || weak) return strong || weak;
    }
    return own;
  }

  /* ── T25b: Q&A memory learner — snapshot on submit, commit on success ──
   * The pending snapshot lives in storage under a per-tab flow id (kept in
   * the site's sessionStorage), so a multi-step form accumulates answers
   * across page loads, and the confirmation page that loads AFTER the
   * submit can still commit them. Parallel tabs never mix their answers. */
  let _qaFlowId = '';
  let _qaPending = null;        // { ts, url, host, ctx, answers }
  let _qaLastSnapTs = 0;
  let _qaWatchTimer = null;
  let _qaWatchUntil = 0;
  let _qaCommitP = null;

  const QA_STEP_BTN_RE = /\b(submit|send|apply|finish|complete|next|continue|review|proceed|save\s*(&|and)\s*(continue|next))\b/i;
  const QA_NOT_STEP_RE = /\b(sign\s*(in|up)|log\s*in|register|search|filters?|upload|attach|cancel|back|previous|close|delete|remove|add\s+(another|more)|apply\s+(filters?|with|using)|autofill|subscribe|save\s+(job|for\s+later|draft)|alerts?|share)\b/i;
  const QA_SUCCESS_TEXT_RE = /application\s+(was\s+|has\s+been\s+)?(submitted|received|completed|sent)\b|thank\s+you\s+for\s+(applying|your\s+application|submitting)|thanks\s+for\s+applying|we['’]ve\s+received\s+your\s+application|we\s+have\s+received\s+your\s+application|application\s+successful|successfully\s+(applied|submitted)/i;
  const QA_SUCCESS_SEL = '#application_confirmation,.application-confirmation,.confirmation-text,.posting-confirmation,' +
    '[data-automation-id="congratulationsMessage"],[data-automation-id="confirmationMessage"]';

  function qaFlowKey(create) {
    if (!_qaFlowId) {
      try { _qaFlowId = sessionStorage.getItem('__ohQaFlow') || ''; } catch (_) {}
      if (!_qaFlowId && create) {
        _qaFlowId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        try { sessionStorage.setItem('__ohQaFlow', _qaFlowId); } catch (_) {}
      }
    }
    return _qaFlowId ? QA_PENDING_PREFIX + _qaFlowId : '';
  }

  function qaLooksLikeApplication() {
    if (_IS_OH_PAGE) return false;
    /* A visible password box means a sign-in / account form. */
    if ([...document.querySelectorAll('input[type=password]')].some(isVisible)) return false;
    /* LinkedIn messages, Indeed searches… are not applications. */
    if (onJobBoard()) return boardApplyFlowOpen();
    if (CURRENT_ATS || _engagedNow) return true;
    if (document.querySelector('input[type=file]')) return true;
    if (/apply|application|career|\bjobs?\b|recruit|hiring|talent|vacanc|position/i.test(location.href + ' ' + document.title)) return true;
    /* Unknown site with neutral URL/title: look at the page's own wording
       (e.g. a "Submit Application" button, "Upload your CV"). */
    const t = (document.body && document.body.innerText || '').slice(0, 5000);
    return /\b(apply|application|applicant|candidate|r[eé]sum[eé]|curriculum vitae|cover letter)\b/i.test(t);
  }

  /* Read the answers currently on the form. Keys are derived exactly the
     way the fill code derives them, so a remembered answer is found again. */
  function qaCollectAnswers(scope) {
    const root = scope && scope.querySelectorAll ? scope : document;
    const out = {};
    const put = (label, answer, kind, type) => {
      const k = normalizeQa(label);
      if (!k || k.length < 3) return;
      const ans = String(answer == null ? '' : answer).replace(/\s+/g, ' ').trim();
      if (!ans) return;
      out[k] = { label: String(label).replace(/\s+/g, ' ').trim().slice(0, 160), answer: ans.slice(0, 300), kind, type: type || '' };
    };
    const inWidget = el => !!(el.closest && el.closest(
      '[class*="react-select" i],[class*="Select__control"],[class*="select2" i],[role="combobox"],[role="search"],header,nav'));

    for (const el of root.querySelectorAll('input,textarea')) {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (el.tagName === 'INPUT' && !/^(text|number)$/.test(type)) continue;
      if (el.disabled || !isVisible(el)) continue;
      if (el.getAttribute('role') === 'combobox' || el.getAttribute('aria-autocomplete') || inWidget(el)) continue;
      if (/captcha|token|csrf/i.test((el.name || '') + ' ' + (el.id || ''))) continue;
      put(getLabel(el), el.value, el.tagName === 'TEXTAREA' ? 'textarea' : 'text', el.tagName === 'TEXTAREA' ? '' : type);
    }
    for (const sel of root.querySelectorAll('select')) {
      if (sel.disabled || sel.multiple || !isVisible(sel)) continue;
      const o = sel.options[sel.selectedIndex];
      if (!o || !o.value) continue;
      put(getLabel(sel), (o.text || '').trim(), 'select', '');
    }
    const groups = new Map();
    for (const r of root.querySelectorAll('input[type=radio]')) {
      const g = r.name || r.id;
      if (!g) continue;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(r);
    }
    for (const radios of groups.values()) {
      const on = radios.find(r => r.checked);
      if (!on || !radios.some(r => isVisible(r) || isVisible(r.parentElement))) continue;
      put(radioGroupLabel(radios.filter(r => isVisible(r) || isVisible(r.parentElement))), radioOptionText(on), 'radio', '');
    }
    for (const combo of root.querySelectorAll('[class*="react-select__control"],[class*="Select__control"],[class*="select2-selection"]')) {
      if (!isVisible(combo)) continue;
      const v = combo.querySelector('[class*="singleValue"],[class*="single-value"],[class*="select2-selection__rendered"]');
      if (!v || /placeholder/i.test(v.className || '') || v.querySelector('[class*="placeholder"]')) continue;
      const lbl = getLabel(combo) || getLabel(combo.closest('[class*="field"],[class*="Field"],[class*="form-group"]') || combo) || '';
      put(lbl, (v.textContent || '').trim(), 'combo', '');
    }
    return out;
  }

  /* Called on every Submit / Next / Continue (user click, form submit
     event, or our own auto-submit). Must write synchronously: the page is
     usually about to navigate away. */
  function qaSnapshot(why, scope) {
    try {
      const now = Date.now();
      if (now - _qaLastSnapTs < 400) return;
      if (!qaLooksLikeApplication()) return;
      const answers = qaCollectAnswers(scope);
      if (!Object.keys(answers).length) return;
      _qaLastSnapTs = now;
      const key = qaFlowKey(true);
      const prev = (_qaPending && now - (_qaPending.ts || 0) < QA_PENDING_TTL_MS) ? _qaPending : null;
      const ctx = extractJobContext();
      _qaPending = {
        ts: now,
        url: location.href.slice(0, 300),
        host: location.hostname,
        ctx: (ctx.title || ctx.company) ? ctx : ((prev && prev.ctx) || ctx),
        answers: Object.assign({}, prev ? prev.answers : {}, answers),
      };
      Promise.resolve(ST.set({ [key]: _qaPending })).catch(() => {});
      LOG(`Q&A memory: captured ${Object.keys(answers).length} answer(s) on ${why} — kept until the application is confirmed`);
      qaWatchForSuccess(60_000);
    } catch (_) {}
  }

  function pageConfirmsApplication() {
    try {
      if (document.querySelector(QA_SUCCESS_SEL)) return true;
      const t = (document.body && document.body.innerText || '').slice(0, 6000);
      if (!QA_SUCCESS_TEXT_RE.test(t)) return false;
      /* Success wording next to a still-open form is usually help text
         ("once your application has been submitted…"), not a confirmation.
         The site's own search / newsletter boxes don't count as a form. */
      let fields = 0;
      for (const el of document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]),textarea,select')) {
        if (isVisible(el) && !isPageChromeField(el) && ++fields >= 3) return false;
      }
      return true;
    } catch (_) { return false; }
  }

  function qaWatchForSuccess(ms) {
    _qaWatchUntil = Math.max(_qaWatchUntil, Date.now() + ms);
    if (_qaWatchTimer) return;
    const step = () => {
      _qaWatchTimer = null;
      if (!_qaPending) return;
      if (pageConfirmsApplication()) { qaCommit('confirmation page'); return; }
      if (Date.now() < _qaWatchUntil) _qaWatchTimer = setTimeout(step, 2000);
    };
    _qaWatchTimer = setTimeout(step, 1500);
  }

  /* The application went through: move the pending answers into memory.
     Returns the in-flight commit so callers can wait for it. */
  function qaCommit(reason) {
    if (_qaCommitP) return _qaCommitP;
    const key = qaFlowKey(false);
    const pend = _qaPending;
    if (!pend || !key) return Promise.resolve();
    _qaPending = null;
    if (Date.now() - (pend.ts || 0) > QA_PENDING_TTL_MS) {
      return Promise.resolve(ST.remove(key)).catch(() => {});
    }
    _qaCommitP = (async () => {
      try {
        const p = await getProfile();
        const { [QA_MEMORY_KEY]: raw } = await ST.get(QA_MEMORY_KEY);
        const mem = raw && typeof raw === 'object' ? raw : {};
        const n = mergeIntoQaMemory(mem, pend.answers, p, pend.ctx, pend.host);
        if (n) await ST.set({ [QA_MEMORY_KEY]: mem });
        await ST.remove(key);
        _qaCache = mem;
        LOG(`Q&A memory: application confirmed (${reason}) — learned ${n} answer(s)`);
      } catch (e) {
        LOG('Q&A memory: commit failed', e);
      }
    })().finally(() => { _qaCommitP = null; });
    return _qaCommitP;
  }

  /* ── T26: Cookie banner + modal dismisser ───────────────────────────
   * Many ATS / company career sites pop GDPR cookie banners or modals
   * that steal focus and block our clicks. Auto-click accept/close.
   * ────────────────────────────────────────────────────────────────── */
  const COOKIE_ACCEPT_RE = /^(accept|accept all|allow all|agree|i agree|got it|ok|okay|continue|close|dismiss|no thanks|decline|reject all)$/i;
  const COOKIE_CONTAINER_SEL = [
    '[id*="cookie" i]', '[class*="cookie" i]',
    '[id*="consent" i]', '[class*="consent" i]',
    '[id*="gdpr" i]', '[class*="gdpr" i]',
    '[id*="onetrust" i]', '[class*="onetrust" i]', '#onetrust-banner-sdk',
    '[id*="cookiebot" i]', '[class*="cookiebot" i]', '#CybotCookiebotDialog',
    '[class*="privacy-banner" i]', '[class*="privacy-notice" i]',
    '[aria-label*="cookie" i]', '[aria-label*="consent" i]',
    '[role="dialog"]', '[role="alertdialog"]',
  ].join(',');

  function dismissCookieBanner() {
    try {
      const banners = document.querySelectorAll(COOKIE_CONTAINER_SEL);
      for (const banner of banners) {
        if (!banner.offsetParent && banner.getClientRects().length === 0) continue;
        const btns = banner.querySelectorAll('button, [role="button"], a[href]');
        for (const btn of btns) {
          const txt = (btn.innerText || btn.textContent || btn.getAttribute('aria-label') || '').trim();
          if (COOKIE_ACCEPT_RE.test(txt)) {
            btn.click();
            return true;
          }
        }
      }
      // Global fallback: any visible button with accept-y text, lexical match
      const allBtns = document.querySelectorAll('button, [role="button"]');
      for (const btn of allBtns) {
        const txt = (btn.innerText || btn.textContent || '').trim();
        if (txt.length > 30) continue;
        if (/^(accept all cookies|accept cookies|allow all cookies)$/i.test(txt)) {
          btn.click();
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  // Run at load and periodically — banners often appear after DOM ready.
  // v6.1: only auto-dismiss when in active automation; users browsing
  // normally may want to make their own consent choice.
  setTimeout(async () => { if (await isAutomationActive()) dismissCookieBanner(); }, 600);
  setTimeout(async () => { if (await isAutomationActive()) dismissCookieBanner(); }, 2000);
  setInterval(async () => { if (await isAutomationActive()) dismissCookieBanner(); }, 12000);

  /* ── T27: Review-page detector + auto-submit ─────────────────────────
   * Many multi-step ATS flows end with a "Review your application" step
   * where the only action is a Submit button. Detect this state and
   * click Submit without re-filling anything.
   * ────────────────────────────────────────────────────────────────── */
  const REVIEW_PAGE_RE = /review\s+your\s+application|review\s+and\s+submit|confirm\s+and\s+submit|please\s+review|final\s+review|application\s+summary|review\s+your\s+answers|please\s+confirm/i;
  /* Submit-button text patterns. Anchored with ^…$ so we match the
     button's own text exactly, not a substring (avoids matching
     "Submit a question" or "Apply filter"). Expanded to cover
     "Submit Now", "Send Your Application", "Apply", "I'm done",
     "Done", "Save and Submit", "Continue & Submit", etc. */
  const SUBMIT_BTN_RE = /^(submit|submit(\s+(application|now|my\s+application|form|résumé|resume))?|send(\s+(application|your\s+application))?|apply(\s+now)?|finish(\s+application)?|confirm(\s+(and\s+)?submit)?|complete(\s+application)?|done|i['’]m\s+done|save\s+(and|&)\s+submit|continue\s+(and|&)\s+submit)$/i;

  function isReviewPage() {
    const bodyText = (document.body?.innerText || '').slice(0, 8000);
    if (REVIEW_PAGE_RE.test(bodyText)) return true;
    const hdr = document.querySelector('h1,h2,h3,[role="heading"]');
    if (hdr && REVIEW_PAGE_RE.test(hdr.innerText || '')) return true;
    return false;
  }

  function findSubmitButton() {
    const btns = document.querySelectorAll(
      'button[type="submit"], input[type="submit"], button, [role="button"]'
    );
    for (const b of btns) {
      if (b.disabled) continue;
      if (!b.offsetParent && b.getClientRects().length === 0) continue;
      const txt = (b.innerText || b.value || b.getAttribute('aria-label') || '').trim();
      if (SUBMIT_BTN_RE.test(txt)) return b;
    }
    return null;
  }

  async function tryReviewAutoSubmit() {
    if (!isReviewPage()) return false;
    const btn = findSubmitButton();
    if (!btn) return false;
    LOG('Review page detected — clicking Submit');
    markSubmitAttempted();
    btn.click();
    return true;
  }

  /* ── T28: Cover letter generator — personalised per job/company ─────
   * Pull job title + company from the page (common ATS selectors), then
   * personalise DEFAULTS.cover by injecting ${title} and ${company}.
   * ────────────────────────────────────────────────────────────────── */
  function extractJobContext() {
    const h1 = document.querySelector('h1')?.innerText?.trim() || '';
    let title = '';
    let company = '';
    const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
    const docTitle = document.title || '';
    // Common patterns: "Job Title at Company" / "Job Title | Company" / "Job Title - Company"
    const combo = (ogTitle || docTitle).trim();
    const m = combo.match(/^(.+?)\s+(?:at|[-|•–])\s+(.+?)(?:\s*[-|•]\s*.+)?$/i);
    if (m) { title = m[1].trim(); company = m[2].trim(); }
    if (!title) title = h1 || combo;
    // Look for company via meta or structured data
    if (!company) {
      company = document.querySelector('meta[property="og:site_name"]')?.content
             || document.querySelector('[itemprop="hiringOrganization"]')?.innerText?.trim()
             || document.querySelector('[class*="company" i]')?.innerText?.trim()
             || '';
    }
    // Sanity — strip overly long strings
    if (title.length > 120) title = title.slice(0, 120);
    if (company.length > 80) company = company.slice(0, 80);
    return { title, company };
  }

  function generateCoverLetter(p = {}) {
    const { title, company } = extractJobContext();
    const base = p.cover_letter || DEFAULTS.cover;
    // Lightweight personalisation — only prepend if we have useful context
    if (title && company) {
      return `Dear ${company} Hiring Team,\n\nI am excited to apply for the ${title} role at ${company}. ${base}\n\nBest regards,\n${(p.first_name||'') + ' ' + (p.last_name||'')}`.trim();
    }
    if (title) {
      return `I am excited to apply for the ${title} role. ${base}`;
    }
    return base;
  }

  /* ── T29: Resume upload automation ───────────────────────────────────
   * If the profile has a resume URL, fetch it as a Blob, create a File,
   * and attach to any empty file input that looks like a resume/CV.
   * ────────────────────────────────────────────────────────────────── */
  const RESUME_INPUT_RE = /resume|r[ée]sum[ée]|cv\b|curriculum|upload.*resume|attach.*resume/i;
  /* Upload boxes that must never receive the CV. */
  const NOT_RESUME_RE = /cover[\s_-]*letter|motivation|portfolio|transcript|certificat|photo|headshot|writing[\s_-]*sample|other[\s_-]*(documents?|attachments?)|additional[\s_-]*(documents?|files?)/i;

  /* ── No CV in a cover-letter box ─────────────────────────────────────
   * OptimHire's own filler collects upload boxes as questions; its answer
   * service hands back the CV link for "Cover Letter", and the CV went
   * into both boxes (Greenhouse showed Maxmilliam_Okafor.pdf twice). Every
   * filler in this world attaches files by assigning input.files, so the
   * guard sits there: a file that isn't a cover letter is not attached to
   * a cover-letter box. A REQUIRED cover-letter box still gets it rather
   * than blocking the application. */
  (function guardCoverLetterBoxes() {
    const COVER_BOX_RE = /cover[\s_-]*letter|motivation(al)?[\s_-]*letter|lettre[\s_-]*de[\s_-]*motivation|anschreiben|carta[\s_-]*de[\s_-]*presentaci/i;
    const COVER_FILE_RE = /cover|letter|motivation|anschreiben/i;
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files');
    if (!desc || !desc.set) return;
    /* The box's own heading: the nearest ancestor (a few levels up) that
       holds a label-like element, or the group naming it. */
    function head(inp) {
      for (let n = inp.parentElement, i = 0; n && i < 5; n = n.parentElement, i++) {
        const by = n.getAttribute && n.getAttribute('aria-labelledby');
        const named = by && document.getElementById(by.split(/\s+/)[0]);
        if (named) return named.textContent || '';
        const h = n.querySelector('label, legend, .label, [class*="label" i], h3, h4');
        if (h && !h.contains(inp)) return h.textContent || '';
      }
      return '';
    }
    function boxText(inp) {
      const ids = (inp.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean)
        .map(id => { const n = document.getElementById(id); return n ? n.textContent : ''; });
      const lab = inp.id && document.querySelector(`label[for="${CSS.escape(inp.id)}"]`);
      return [inp.id, inp.name, inp.getAttribute('aria-label'), inp.getAttribute('aria-describedby'), ...ids,
              lab && lab.textContent, head(inp)].filter(Boolean).join(' ').slice(0, 400);
    }
    function required(inp) {
      if (inp.required || inp.getAttribute('aria-required') === 'true') return true;
      return /\*/.test(head(inp));
    }
    Object.defineProperty(HTMLInputElement.prototype, 'files', {
      configurable: true,
      enumerable: desc.enumerable,
      get() { return desc.get.call(this); },
      set(list) {
        try {
          if (this.type === 'file' && list && list.length && COVER_BOX_RE.test(boxText(this)) &&
              !Array.prototype.some.call(list, f => COVER_FILE_RE.test(f.name || '')) && !required(this)) {
            LOG(`Cover letter box: not attaching "${list[0].name}" — that's the CV, not a cover letter`);
            return;
          }
        } catch (_) {}
        desc.set.call(this, list);
      },
    });
  })();

  /* Which job to apply to first (the CSV queue): quickest company ATS first, then ATS sites
     that need an account, company career sites, job boards, Reed last — lower = sooner.
     Same order as self.ohJobRank in oh-bg.js. */
  function jobRank(u) {
    let h = ''; try { h = new URL(u).hostname.toLowerCase(); } catch (_) { return 30; }
    if (/(^|\.)reed\.co\.uk$/.test(h)) return 99;
    const boards = [[/(^|\.)linkedin\./, 40], [/(^|\.)indeed\./, 41], [/(^|\.)dice\./, 42], [/(^|\.)ziprecruiter\./, 43], [/(^|\.)adzuna\./, 44],
      [/(^|\.)(glassdoor|totaljobs|cv-library|monster|jobsite|irishjobs|jobs\.ie|simplyhired|careerbuilder|jooble|hiring\.cafe)\./, 45]];
    for (const [re, r] of boards) if (re.test(h + '.')) return r;
    const ats = [[/greenhouse\.io|grnh\.se/, 0], [/lever\.co/, 1], [/ashbyhq/, 2], [/workable/, 3], [/smartrecruiters/, 4], [/recruitee/, 5],
      [/teamtailor/, 6], [/bamboohr/, 7], [/breezy\.hr/, 8], [/jazzhr|resumatorapi|applytojob/, 9], [/pinpointhq/, 10], [/rippling/, 11],
      [/comeet/, 12], [/personio/, 13], [/jobvite/, 14], [/freshteam|manatal|recooty|gohire|forhyre|homerun|dover|wellfound/, 15],
      [/myworkdayjobs|myworkdaysite|workdayjobs|\.workday\.com/, 20], [/icims/, 21], [/successfactors|sapsf/, 22], [/oraclecloud/, 23],
      [/taleo/, 24], [/paylocity|ultipro|ukg\.com|adp\.com|avature|bullhorn/, 25]];
    const lu = String(u).toLowerCase();
    for (const [re, r] of ats) if (re.test(lu)) return r;
    return 30;
  }

  async function rawResumeFile(url, filename = 'resume.pdf') {
    if (!url) return null;
    try {
      const res = await fetch(url, { credentials: 'omit' });
      if (!res.ok) return null;
      const blob = await res.blob();
      const type = blob.type || 'application/pdf';
      return new File([blob], filename, { type });
    } catch (_) { return null; }
  }

  /* "Tailor CV to each job" (ohTailorCv — off unless you turn it on; Queue
     Manager / the panel's card; OptimHire's own runs then use its "Optimize My
     Resume" step, oh-bg.js 13; Workday keeps your own CV either way): on a CSV
     job the CV uploaded is your CV with its skills and each
     role's bullets ordered by this page's job description — nothing reworded
     or added (the Workday engine's keyword tailoring + PDF, assets/wd-cvtext.js,
     loaded only then). Your own CV whenever that can't be done: no job
     description on the page, or no roles read from your CV. Made once per page. */
  const _tailoredFiles = new Map();
  function tabUrl() {
    if (window.top === window.self) return Promise.resolve(location.href);
    return new Promise(res => {
      try { chrome.runtime.sendMessage({ type: 'OH_TAB_URL' }, r => { void chrome.runtime.lastError; res((r && r.url) || ''); }); }
      catch (_) { res(''); }
    });
  }
  function pageJobText() {
    const pick = $$('[class*="job-description" i],[class*="jobDescription" i],[class*="job__description" i],[data-qa*="job-description" i],' +
                    '.posting-page .section-wrapper,[class*="posting-description" i],#content .content,[class*="description" i]')
      .filter(el => !el.closest('form') && (el.innerText || '').length > 400)
      .sort((x, y) => (y.innerText || '').length - (x.innerText || '').length)[0];
    let text = pick ? pick.innerText : '';
    if (!text) {
      const c = document.body.cloneNode(true);
      c.querySelectorAll('form,script,style,noscript,nav,header,footer,input,select,textarea,button,[role="dialog"],[id^="oh-"]').forEach(n => n.remove());
      text = c.textContent || '';
    }
    return text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim().slice(0, 20000);
  }
  async function cvLib() {
    if (window.__ohCv && window.__ohCv.tailor) return window.__ohCv;
    await new Promise(res => {
      try { chrome.runtime.sendMessage({ type: 'OH_CV_LOAD' }, () => { void chrome.runtime.lastError; res(); }); }
      catch (_) { res(); }
    });
    return window.__ohCv && window.__ohCv.tailor ? window.__ohCv : null;
  }
  function fileBase64(file) {
    return new Promise(res => {
      const r = new FileReader();
      r.onload = () => res(String(r.result || '').replace(/^data:[^,]*,/, ''));
      r.onerror = () => res('');
      r.readAsDataURL(file);
    });
  }
  function tailoredResumeFile(url, filename) {
    const key = location.href.split('#')[0];
    if (!_tailoredFiles.has(key)) _tailoredFiles.set(key, (async () => {
      if (CURRENT_ATS === 'Workday' || /myworkday(jobs|site)?\.com$|workdayjobs\.com$/i.test(HOST)) return null;   // Workday keeps your own CV
      const d = await ST.get(['ohTailorCv', 'ohJobQueueActive', 'ohJobQueue', 'ohCvProfile', 'ohWorkdayProfile']);
      if (d.ohTailorCv !== true || !d.ohJobQueueActive) return null;
      const here = await tabUrl();
      const job = (d.ohJobQueue || []).find(j => j && j.status === 'running' && j.url && here && _urlsMatchLoose(here, j.url));
      if (!job) return null;
      const description = pageJobText();
      if (description.length < 200) { LOG('Tailored CV: no job description on this page — uploading your own CV'); return null; }
      const lib = await cvLib();
      if (!lib) return null;
      const wp = d.ohWorkdayProfile;
      const imported = wp && Array.isArray(wp.work) && wp.work.length && wp.personal ? wp : null;
      let cv = d.ohCvProfile && d.ohCvProfile.profile;
      if (!imported && !(cv && Array.isArray(cv.work) && cv.work.length)) {
        const own = await rawResumeFile(url, filename);           // read your CV once; kept for next time
        if (!own) return null;
        const r = await lib.read(await fileBase64(own), own.type).catch(() => null);
        cv = r && r.profile;
        if (cv && Array.isArray(cv.work) && cv.work.length) await ST.set({ ohCvProfile: { url, at: Date.now(), roles: cv.work.length, profile: cv } });
      }
      const title = String(job.title || ($('h1') || {}).textContent || document.title || '').trim();
      const doc = lib.tailor({ profile: imported || undefined, cv, person: await getProfile(), job: { title, description, url: here } });
      if (!doc) { LOG('Tailored CV: no roles read from your CV — uploading your own CV'); return null; }
      LOG(`Tailored CV for this job (${doc.keywords.slice(0, 6).join(', ')})`);
      const bin = atob(doc.base64), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new File([bytes], doc.fileName, { type: doc.mime });
    })().catch(() => null));
    return _tailoredFiles.get(key);
  }

  async function fetchResumeFile(url, filename = 'resume.pdf') {
    if (!url) return null;
    return (await tailoredResumeFile(url, filename)) || rawResumeFile(url, filename);
  }

  async function tryResumeUpload(p = {}) {
    const url = p.resume_url || p.resumeUrl || p.resume;
    if (!url) return 0;
    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
    if (!fileInputs.length) return 0;
    let attached = 0;
    const fname = (p.first_name || 'resume') + '_' + (p.last_name || 'file') + '.pdf';
    for (const inp of fileInputs) {
      if (inp.files && inp.files.length > 0) continue;
      const hint = [
        inp.name, inp.id, inp.getAttribute('aria-label') || '',
        inp.closest('label')?.innerText || '',
        inp.parentElement?.innerText?.slice(0, 200) || '',
      ].join(' ');
      /* The input's OWN identity (not the surrounding text, which may
         mention "Resume/CV" for a neighbouring box). */
      const own = [inp.name, inp.id, inp.getAttribute('aria-label') || '', getLabel(inp) || ''].join(' ');
      if (NOT_RESUME_RE.test(own) || (!RESUME_INPUT_RE.test(hint) && fileInputs.length > 1)) continue;
      const file = await fetchResumeFile(url, fname);
      if (!file) break;
      try {
        const dt = new DataTransfer();
        dt.items.add(file);
        inp.files = dt.files;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        attached++;
      } catch (_) {}
    }
    if (attached) LOG(`Resume attached to ${attached} input(s)`);
    return attached;
  }

  // Prime Q&A cache once at startup so guessValue() can do sync lookups,
  // and keep it current when another tab learns something (or it is cleared).
  loadQaMemory().catch(() => {});
  try {
    chrome.storage.onChanged.addListener((c, area) => {
      if (area !== 'local' || !c[QA_MEMORY_KEY]) return;
      const nv = c[QA_MEMORY_KEY].newValue;
      _qaCache = nv && typeof nv === 'object' ? nv : {};
    });
  } catch (_) {}

  function guessValue(label, p = {}, inputType = '') {
    label = label == null ? '' : String(label);
    const l = label.toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
    const fullName = `${p.first_name||''} ${p.last_name||''}`.trim();

    /* Knockout questions: your true answer, per job (see koAnswer). */
    const ko = koAnswer(label);
    if (ko) return ko.answer;

    // T25: Q&A memory — an answer that went through on a confirmed
    // application wins over the generic rules below.
    const remembered = rememberedAnswer(label, inputType);
    if (remembered != null) return remembered;

    /* Opt-ins are never yours to accept on someone's behalf: "May we text
       you?" (Paylocity), SMS / WhatsApp updates, marketing, newsletters,
       talent communities, job alerts → No. The yes-leaning rules below
       (consent, "would you", catch-all) used to say Yes to these. */
    if (/\b(may|can) we (text|sms|message)\b|\btext (message|messaging)s?\b|\b(by|via|receive|send( me)?) (sms|whatsapp)\b|\b(sms|whatsapp) (updates?|messages?|alerts?|notifications?|consent)\b|marketing (communications?|e ?mails?|messages|materials|purposes|updates)|newsletter|talent (community|network|pool)|job alerts?|receive (job )?(updates|alerts|offers|news)/.test(l))
                                                          return 'No';

    /* "Are you currently an employee of <company/agency>?", "Have you
       worked for us before?", relatives employed there… → No. (A yes-bias
       answered "Yes" and then filled a fake "current agency".) */
    if (/\b(are|were) you (currently |presently |now |a )?(an? )?(current |former |existing )?(employee|employed|staff|contractor|working)\b.{0,40}\b(of|by|at|for|with|within)\b|\bdo you (currently )?work (for|at|within)\b|\bhave you (ever |previously |already )?(worked|been employed|interned) (for|at|with|by)\b|\b(relatives?|family member)s?\b.{0,40}\b(employ|work)/.test(l))
      return 'No';

    /* Sponsorship FIRST: long wordings such as "…require sponsorship for
       employment visa status to work legally for our company?" also match
       the company/employer rule further down, which answered them with the
       applicant's current employer (or nothing → "N/A" typed into the
       dropdown). Sponsorship stays "No" (DEFAULTS.sponsorship). */
    if (/require.*sponsor|need.*sponsor|sponsorship.*(required|needed)|require.*visa|need.*visa|visa.*sponsor|future.*visa|need.*permit|require.*permit|will.*sponsor|currently.*sponsor|now.*or.*(in.*)?future|h.?1b.?sponsor|immigration.*support/i.test(l))
                                                          return DEFAULTS.sponsorship;

    // Type-based direct fill (most reliable, survives label changes)
    if (inputType === 'email')  return p.email || '';
    if (inputType === 'tel')    return p.phone || '';
    if (inputType === 'number' && EXP_LABEL_RE.test(l))
                                return koFacts().yearsExperience || p.years_experience || DEFAULTS.years;

    if (/first.?name/.test(l))                            return p.first_name    || '';
    if (/last.?name/.test(l))                             return p.last_name     || '';
    if (/full.?name|your.?name/.test(l))                  return fullName;
    /* "Preferred Name" is what you are called — your first name, not both. */
    if (/preferred.?name|nickname/.test(l))               return p.first_name || fullName;
    if (/display.?name/.test(l))                          return fullName;
    /* Email: handle "Email", "Email Address", "E-mail", "E mail", "EMail".
       Note: label is pre-processed so non-alphanumerics become spaces, so
       "E-mail" becomes "e mail" — \se?mail covers both forms. */
    if (/\be\s?mail\b/.test(l))                           return p.email         || '';
    /* ── Phone sub-fields MUST be matched before the generic phone and
       country rules below, otherwise "Country Phone Code" fell through to
       /^country/ and got filled with "Ireland", and "Phone Device Type"
       fell through to /phone/ and got filled with the phone NUMBER.
       Both produced invalid values, so the ATS kept the field marked
       required and OptimHire blocked submission ("Error: The field
       Country Phone Code is required…" / "Phone Device Type is
       required…") — the job was then skipped, never applied. */
    if (/(phone|dial|country).*(code)|country.?code/.test(l)) {
      return p.phone_country_code || p.country_code || DEFAULTS.phoneCountryCode;
    }
    if (/(phone|device).*(device|type)\b/.test(l) && !/number/.test(l)) {
      return DEFAULTS.phoneDeviceType;
    }
    /* Phone: handle "Phone", "Mobile", "Cell", "Tel", "Telephone",
       "Cell Phone", "Mobile Number", "Contact Number", "Contact No", etc. */
    if (/phone|mobile|cell|\btel\b|telephone|contact.*(?:number|\bno\b|num\b)/.test(l))
                                                          return p.phone         || '';
    /* Location typeaheads ("Location", "Please add your current country
       and city of residence", "Where are you based?") are REQUIRED on
       many ATSes and are combobox widgets that need a full
       "City, Country" string to match a dropdown option. OptimHire even
       has a dedicated error for it: "Please enter your location and
       select it from the dropdown." A bare "Location" label previously
       matched nothing here and returned '', so the field was skipped and
       the form could never be submitted. */
    if (/^location$|\blocation\b|residence|where.*(based|live|located)|current.*(country|city)|country.*and.*city|city.*and.*country/.test(l)) {
      if (p.location) return p.location;
      const _city = p.city || 'Dublin';
      const _ctry = p.country || 'Ireland';
      return `${_city}, ${_ctry}`;
    }
    if (/^city$|city\b|current.?location|location.*city/.test(l))
                                                          return p.city          || 'Dublin';
    if (/state|province/.test(l))                         return p.state         || '';
    if (/zip|postal/.test(l))                             return p.postal_code   || p.zip || '';
    if (/^country/.test(l))                               return p.country       || 'Ireland';
    if (/address/.test(l))                                return p.address       || p.street || '';
    if (/linkedin/.test(l))                               return p.linkedin_profile_url || '';
    if (/github/.test(l))                                 return p.github_url    || '';
    if (/stack.*exchange|stackexchange|stack.*overflow|stackoverflow/.test(l))
                                                          return p.stackoverflow_url || '';
    if (/twitter|x\.com|x.?handle/.test(l))              return p.twitter_url   || '';
    if (/website|portfolio|personal.?site/.test(l))       return p.website_url   || '';
    if (/university|school|college|education/.test(l))    return p.school        || p.university || '';
    if (/\bdegree\b|qualification.*level|level.*qualification/.test(l))
                                                          return p.degree        || "Bachelor's";
    /* "Field of Study" / "Major" / "Discipline" are REQUIRED on many ATSes
       (OptimHire reports "Discipline is required." / "Degree is
       required."). Returning '' left them blank and blocked submission,
       so fall back to a sane default instead of an empty string. */
    if (/major|field.?of.?study|discipline|course.*study|study.*area|area.*study|specialisation|specialization|subject/.test(l))
                                                          return p.major || p.field_of_study || p.discipline || DEFAULTS.fieldOfStudy;
    if (/\bgpa\b/.test(l))                                return p.gpa           || '';
    if (/summary|bio|about yourself|profile.*summary|introduce/.test(l))
                                                          return p.summary       || DEFAULTS.cover;
    if (/current.?title|current.?position|current.?role|job.?title/.test(l))
                                                          return p.current_title || p.title || '';
    if (/title|position|role/.test(l))                    return p.current_title || p.title || '';
    if (/current.*company|most.*recent.*company|current.*employer|last.*company/.test(l))
                                                          return p.current_company || p.company || '';
    if (/previously.?work|worked.?before|work.?for.?before|prior.?employ/.test(l))
                                                          return 'No';
    /* Asking for the NAME of the current employer — never a yes/no
       question that merely mentions "our company". */
    if (/company|employer|current.*org/.test(l) && !/^\s*(do|does|are|is|will|would|have|has|can|could|did|were|was|should)\b/.test(l))
                                                          return p.current_company || p.company || '';
    if (/email.*future|job.*alert|receive.*update|notify.*me/.test(l)) return 'Yes';
    if (/salary|compensation|pay\b|remun|ctc|lpa/.test(l))
                                                          return p.expected_salary || DEFAULTS.salary;
    if (/cover.?letter|motivation|additional.*info|tell.?us.?more|anything.?else/.test(l))
                                                          return p.cover_letter  || DEFAULTS.cover;
    if (/why.*compan|why.*role|why.*interest|what.*excite|why.*apply/.test(l))
                                                          return DEFAULTS.why;
    if (/how.*hear|where.*find|how.*you.*find|how.*discover|referr.*source|source.*applic/.test(l))
                                                          return DEFAULTS.howHeard;

    // ── Experience ─────────────────────────────────────────────────────────
    // Any question asking for a number of years → return 7 (our default)
    // This covers text inputs, number inputs, and range dropdowns.
    // The select handler will convert this to the closest range option.
    if (EXP_LABEL_RE.test(l))                             return koFacts().yearsExperience || p.years_experience || DEFAULTS.years;

    if (/notice.?period|period.?of.?notice/.test(l))       return p.notice_period || DEFAULTS.notice;
    if (/availab|start.?date|when.*start|when.*begin|earliest.*start/.test(l))
                                                          return p.availability || DEFAULTS.availability;

    // ── Sponsorship NEED — must run BEFORE the generic authorization rule ──
    // The generic rule below matches any label containing "sponsorship",
    // "visa" or "permit" and returns 'authorized', which the dropdown mapper
    // turns into "Yes". That made "Will you require visa sponsorship?" come
    // out as "Yes, I require sponsorship" — the dedicated rules further
    // down were unreachable for exactly these questions. Answer "do you
    // NEED sponsorship/a visa/a permit" first, with DEFAULTS.sponsorship.
    // (Phrasings like "authorized to work WITHOUT sponsorship" contain none
    // of these need-patterns and still fall through to 'authorized'.)
/* (sponsorship rule moved to the top of guessValue) */

    // ── Work Authorization Status ─────────────────────────────────────────
    // Label: (work AND authorization) OR sponsorship OR visa OR permit
    // Returns 'authorized' so bestSelectOption finds "Authorized to work",
    // "Yes - authorized", "Yes, I am authorized", etc.
    if ((/work/i.test(l) && /authoriz/i.test(l)) ||
        /\bwork.?auth\b/i.test(l) ||
        /\bsponsorship\b/i.test(l) ||
        /\bvisa\b/i.test(l) ||
        /\bpermit\b/i.test(l))                            return 'authorized';

    if (/authoriz|eligible|work.*right|right.*work|legally.*work|permit.*work|legally.*authoriz|entitled.*work/.test(l))
                                                          return DEFAULTS.authorized;
    if (/us.*citizen|citizen.*us|citizen.*united.?states/.test(l))  return p.is_us_citizen || 'Yes';
    if (/citizen|residency|permanent.?resident|green.?card|irish.?citizen|eu.?citizen/.test(l))
                                                          return 'Yes';
    if (/require.*sponsor|need.*visa|visa.*sponsor|future.*visa|work.*visa|need.*permit|sponsorship.*required|require.*visa/i.test(l))
                                                          return DEFAULTS.sponsorship;
    if (/will.*sponsor|currently.*sponsor|immigration.*support|h.?1b.?sponsor|now.*or.*future/.test(l))
                                                          return DEFAULTS.sponsorship;

    // ── Location / relocation / remote ───────────────────────────────────
    if (/relocat/.test(l))                                return DEFAULTS.relocation;
    if (/willing.*commut|able.*commut|can.*commut|within.*commut/.test(l))
                                                          return DEFAULTS.canCommute;
    if (/remote|work.*home|wfh|telecommut|hybrid|onsite|in.?person|on.?site/.test(l))
                                                          return DEFAULTS.remote;
    if (/travel.*percent|percent.*travel|travel.*require|willing.*travel/.test(l))
                                                          return DEFAULTS.travelPct;
    if (/shift|schedul/.test(l))                          return DEFAULTS.preferredShift;
    if (/overtime|over.?time/.test(l))                    return DEFAULTS.overtime;
    if (/weekend/.test(l))                                return DEFAULTS.weekendsAvail;
    if (/evening|night.?shift/.test(l))                   return DEFAULTS.eveningsAvail;
    if (/hours.*per.*week|weekly.*hours|hours.*week/.test(l)) return DEFAULTS.hoursPerWeek;

    // ── EEO / demographic ─────────────────────────────────────────────────
    if (/veteran|military|protected|armed.?forces/.test(l))
                                                          return DEFAULTS.veteran;
    if (/disabilit|impair|accommodat/.test(l))            return DEFAULTS.disability;
    if (/\bgender\b|\bsex\b/.test(l))                     return DEFAULTS.gender;
    if (/\bpronoun/.test(l))                              return DEFAULTS.pronouns;
    if (/ethnic|race|racial|hispanic|latino|latinx/.test(l)) return DEFAULTS.ethnicity;
    if (/\bage\b|date.?of.?birth|\bdob\b|birth.?date/.test(l)) {
      if (/^age$|\byour.?age\b/.test(l)) return DEFAULTS.age;
      return ''; // DOB fields — leave blank (legal/privacy)
    }
    if (/over.?18|at.?least.?18|18.?or.?over|legal.?age/.test(l)) return DEFAULTS.over18;

    // ── Background / legal / compliance ──────────────────────────────────
    if (/criminal|felon|conviction|ever.*arrest/.test(l))  return DEFAULTS.criminalRecord;
    if (/background.?check|willing.*background/.test(l))   return DEFAULTS.willingBackgroundCheck;
    if (/drug.?test|willing.*drug|substance.?test/.test(l)) return DEFAULTS.willingDrugTest || DEFAULTS.drugTest;
    if (/security.?clearance|clearance.?level|clearance\b|polygraph/.test(l))
                                                          return DEFAULTS.clearance;
    if (/drivers?.?licen|driving.?licen/.test(l))         return DEFAULTS.driversLicense;
    if (/reliable.?transport|own.?transport|transport.?to.?work/.test(l))
                                                          return DEFAULTS.hasTransportation;
    if (/have.*laptop|own.*laptop|have.*computer|own.*computer|have.*equipment/.test(l))
                                                          return DEFAULTS.hasEquipment;
    if (/reliable.?internet|high.?speed.?internet|stable.?internet/.test(l))
                                                          return DEFAULTS.hasInternet;
    if (/quiet.?workspace|dedicated.?workspace|home.?office/.test(l))
                                                          return DEFAULTS.hasQuietWorkspace;

    // ── Certifications / education / skills / language ──────────────────
    if (/certif|accredit|credential|licens(e|ing).?to|professional.*licens/.test(l))
                                                          return 'Yes';
    if (/english.?proficien|speak.?english|english.?level|level.?of.?english|fluent.?english|english.?fluen/.test(l))
                                                          return DEFAULTS.languageProficiency;
    if (/native.?language|primary.?language|first.?language/.test(l))
                                                          return DEFAULTS.nativeLanguage;
    if (/language.?proficien|language.?level|languages.?speak|speak.*fluent/.test(l))
                                                          return DEFAULTS.languageProficiency;
    if (/highest.?(level.?of.?)?education|education.?level|degree.?level|highest.?degree/.test(l))
                                                          return p.highest_degree || p.degree || "Bachelor's Degree";

    // ── References ──────────────────────────────────────────────────────
    if (/\breferenc|professional.?ref/.test(l))           return DEFAULTS.references;

    // ── Behavioural / motivation / company fit (open-ended) ─────────────
    if (/tell.?(us|me).?about.?yourself|introduce.?yourself|briefly.?describe/.test(l))
                                                          return p.summary || DEFAULTS.tellAbout;
    if (/greatest.?strength|key.?strength|your.?strength/.test(l)) return DEFAULTS.strengths;
    if (/greatest.?weakness|weak.?ness|areas.?(for|of).?improvement/.test(l))
                                                          return DEFAULTS.weakness;
    if (/career.?goal|long.?term.?goal|five.?year|5.?year.?plan|where.*see.*yourself/.test(l))
                                                          return DEFAULTS.goals;
    if (/motivat|what.?drive|what.?inspir/.test(l))       return DEFAULTS.motivation;
    if (/value.?add|what.*bring|unique.?value|what.?make.?you|differentiat/.test(l))
                                                          return DEFAULTS.valueAdd;
    if (/reason.?for.?leav|leaving.?current|why.?leav|why.?looking/.test(l))
                                                          return DEFAULTS.reasonLeaving;
    if (/why.*hire|hire.*you|we.?should.?hire/.test(l))   return DEFAULTS.valueAdd;
    if (/why.*compan|interest.*compan|appeal.*compan/.test(l))
                                                          return DEFAULTS.whyCompany;
    if (/why.*role|why.*position|interest.*role|interest.*position|excite.*role|why.*apply/.test(l))
                                                          return DEFAULTS.whyRole;
    if (/hard(est)?.?(technical.?)?problem|technical.?challenge|toughest|most.?challenging|complex.?problem/.test(l))
                                                          return p.summary || DEFAULTS.hardProblem;
    if (/describe.?(a\s+)?challeng|tell.?(me|us).?about.?a.?time|example.?of|situation.?where/.test(l))
                                                          return p.summary || DEFAULTS.tellAbout;

    // ── Agreements / consent / willingness ───────────────────────────────
    if (/agree|accept|confirm|consent|acknowledge|certif(y|ied)|attest|declare/.test(l))
                                                          return 'Yes';
    if (/willing|happy|open\s+to|comfortable|able\s+to|prepared\s+to|interest(ed)?\s+in/.test(l))
                                                          return 'Yes';
    if (/would.?you|can.?you/.test(l) && /(willing|able|comfortable|available)/.test(l))
                                                          return 'Yes';

    // ── Negative-framed questions → NO ──────────────────────────────────
    if (/\bever.?been.?fired|terminated|dismissed.?for.?cause/.test(l))
                                                          return 'No';
    if (/ever.?been.?convict|ever.?plead.?guilty/.test(l)) return 'No';
    if (/do.?you.?have.?any.?(issue|concern|problem|objection)/.test(l)) return 'No';
    if (/non.?compet|conflict.?of.?interest|currently.?employ.?by.?compet/.test(l))
                                                          return 'No';

    // Generic yes/no catch-all — only fires for truly unclassified questions.
    // Intentionally comes AFTER all specific negative-answer patterns above.
    if (/\bdo you\b|\bhave you\b|\bare you\b|\bcan you\b|\bwill you\b|\bare.?you.?able/.test(l))
                                                          return 'Yes';
    return '';
  }

  /* ── T13/T17: Auto-fill missing required fields ─────────── */

  /** Send field status updates to the sidebar via background relay */
  function reportFieldStatus(fields) {
    try {
      chrome.runtime.sendMessage({
        type: 'SIDEBAR_FIELD_LIST',
        fields: fields, // [{name, status:'filled'|'pending'|'failed', required:bool}]
      }).catch(() => {});
    } catch (_) {}
  }

  function reportFieldFilled(fieldName, status) {
    try {
      chrome.runtime.sendMessage({
        type: 'SIDEBAR_FIELD_UPDATE',
        fieldName: fieldName,
        status: status, // 'filled', 'pending', 'failed'
      }).catch(() => {});
    } catch (_) {}
  }

  /* ── URL_FIELDS: labels where a URL value is EXPECTED ───────── */
  const URL_FIELD_PATTERNS = /linkedin|github|website|portfolio|gitlab|bitbucket|stack.*overflow|stackoverflow|stackexchange|twitter|x\.com|behance|dribbble|codepen|devto|medium|personal.?site|blog|url|link/i;

  /**
   * isWrongUrlForField — returns true when a URL value was placed into a
   * field that should either have a different URL or no URL at all.
   *
   * Specific URL fields (linkedin, github, website, etc.) are allowed to have
   * URLs only when the URL MATCHES what the profile says for that field.
   * Any other URL → wrong fill.
   */
  function isWrongUrlForField(val, lbl, p) {
    if (!/^https?:\/\//i.test(val)) return false; // not a URL → not our problem
    const l = lbl.toLowerCase();

    // Non-URL fields that got a URL → definitely wrong
    if (!URL_FIELD_PATTERNS.test(l)) return true;

    // URL fields: verify the URL matches what we expect for that label
    if (/linkedin/i.test(l) && p.linkedin_profile_url && val !== p.linkedin_profile_url) return true;
    if (/github/i.test(l) && p.github_url && val !== p.github_url) return true;
    if (/website|portfolio/i.test(l) && p.website_url && val !== p.website_url) return true;
    if (/twitter|x\.com/i.test(l) && p.twitter_url && val !== p.twitter_url) return true;
    if (/stackoverflow|stackexchange/i.test(l) && p.stackoverflow_url && val !== p.stackoverflow_url) return true;

    return false;
  }

  /**
   * sanitizeBadFills — corrects OptimHire's tendency to spam the LinkedIn URL
   * into every empty field.  Designed to run multiple times (it's idempotent).
   */
  async function sanitizeBadFills() {
    if (wdEngineOwns()) return;
    const p = await getProfile();
    const inputs = $$(
      'input:not([type=hidden]):not([type=file]):not([type=submit]):not([type=button]),' +
      'textarea'
    ).filter(isVisible);

    /* ── Email + confirm-email correction + empty-required force-fill ──
       Forces every email field — and any confirm/verify/re-enter email
       field — to the real email. Also fills empty visible email fields
       (Workable's email field often had no value after the adapter ran).
       Detection uses type=email, autocomplete=email, name/id/placeholder,
       and label match — broadest possible. */
    if (p.email) {
      const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
      const emailCandidates = $$(
        'input[type="email"],input[autocomplete*="email" i],' +
        'input[name*="email" i],input[id*="email" i],' +
        'input[placeholder*="email" i],input[aria-label*="email" i]'
      ).filter(isVisible);
      /* Also include any labelled "email" input that didn't match attrs */
      for (const inp of inputs) {
        if (emailCandidates.includes(inp)) continue;
        const lbl = (getLabel(inp) || '').toLowerCase();
        if (/\be?\s?mail\b/.test(lbl)) emailCandidates.push(inp);
      }
      for (const inp of emailCandidates) {
        const lbl = (getLabel(inp) || inp.name || inp.id || inp.placeholder || '').toLowerCase();
        const v = (inp.value || '').trim();
        const isConfirm = /confirm|verify|re.?enter|repeat|again/.test(lbl);
        const shouldFill = !v || isConfirm || !EMAIL_RE.test(v);
        if (shouldFill && v !== p.email) {
          LOG(`sanitize: email field "${lbl}" → ${p.email}`);
          inp.focus(); nativeSet(inp, p.email); await sleep(40);
        }
      }
    }

    /* ── Phone force-fill (empty visible phone inputs) ──
       Workable + similar split phone into [country-code] + [number].
       The number input is often empty after the adapter because the
       adapter's .find() filled only the first match (the country code).
       Force-fill any visible phone input that's empty, EXCLUDING fields
       that are clearly country-code/prefix-only (their label or value
       starts with + and is short). */
    if (p.phone) {
      const phoneCandidates = $$(
        'input[type="tel"],input[autocomplete*="tel" i],' +
        'input[name*="phone" i],input[id*="phone" i],' +
        'input[name*="mobile" i],input[id*="mobile" i],' +
        'input[placeholder*="phone" i],input[aria-label*="phone" i]'
      ).filter(isVisible);
      for (const inp of inputs) {
        if (phoneCandidates.includes(inp)) continue;
        const lbl = (getLabel(inp) || '').toLowerCase();
        if (/\bphone\b|\bmobile\b|\bcell\b|\btel\b|telephone|contact.*(?:number|\bno\b)/.test(lbl)) {
          phoneCandidates.push(inp);
        }
      }
      for (const inp of phoneCandidates) {
        const v = (inp.value || '').trim();
        /* Already has something (the user's input, or ours) — but a lone
           "+353" the widget pre-typed is still an empty number. */
        if (v && !/^\+\s?\d{1,4}$/.test(v)) continue;
        const lbl = (getLabel(inp) || inp.name || inp.id || inp.placeholder || '').toLowerCase();
        /* Skip clearly-country-code-only inputs */
        if (/country.*code|dial.*code|\bprefix\b|code$/.test(lbl)) continue;
        if (inp.maxLength > 0 && inp.maxLength <= 5) continue; // short field = code, not number
        if (v && inp.getBoundingClientRect().width < 80) continue;  // a narrow "+353" box is the code itself
        inp.focus();
        if (nativeSet(inp, p.phone)) { LOG(`sanitize: phone field "${lbl}" filled`); await sleep(40); }
      }
    }

    for (const inp of inputs) {
      const val = inp.value?.trim() || '';
      if (!val) continue;
      const lbl = getLabel(inp) || inp.name || inp.id || '';
      const inputType = (inp.type || '').toLowerCase();
      if (inputType === 'url') continue;

      if (isWrongUrlForField(val, lbl, p)) {
        const correct = guessValue(lbl, p, inputType);
        if (correct && !/^https?:\/\//i.test(correct)) {
          LOG(`sanitize: bad URL in "${lbl}" → "${correct}"`);
          inp.focus(); nativeSet(inp, correct); await sleep(40);
        } else if (!correct || /^https?:\/\//i.test(correct)) {
          // No text value available — clear the field so form validates cleanly
          LOG(`sanitize: clearing bad URL from "${lbl}"`);
          inp.focus(); nativeSet(inp, ''); await sleep(40);
        }
        continue;
      }

      // Fix raw numbers (e.g. "80000") in non-salary / non-experience fields
      if (/^\d+$/.test(val)) {
        // Leave numbers alone if the field expects a number (salary, years, quantity, age, etc.)
        if (/salary|compensation|pay\b|remun|expectation|ctc|lpa/i.test(lbl)) continue;
        if (EXP_LABEL_RE.test(lbl)) continue; // experience year fields
        if (inputType === 'number') continue;  // any <input type=number>
        const correct = guessValue(lbl, p, inputType);
        if (correct && correct !== val && !/^\d+$/.test(correct)) {
          inp.focus(); nativeSet(inp, correct); await sleep(40);
        } else if (!correct) {
          inp.focus(); nativeSet(inp, ''); await sleep(40);
        }
      }
    }

    // Fix select elements filled with wrong values (e.g. a URL in a yes/no dropdown)
    for (const sel of $$('select').filter(isVisible)) {
      const val = sel.value?.trim() || '';
      if (!val || !/^https?:\/\//i.test(val)) continue;
      const lbl = getLabel(sel) || sel.name || '';
      if (URL_FIELD_PATTERNS.test(lbl)) continue;
      LOG(`sanitize: clearing URL from select "${lbl}"`);
      sel.value = '';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  /* ── T21: Validation error detection + auto-fix ───────────────────────
   * After every fill pass, scan for fields that have an error state
   * (red border, aria-invalid, [class*="error"]) and re-fill them.
   * Returns the number of errors fixed.
   * ─────────────────────────────────────────────────────────────────── */
  async function detectAndFixValidationErrors() {
    if (wdEngineOwns()) return 0;
    const p = await getProfile();
    let fixed = 0;

    // Selectors that indicate a field has a validation error
    const ERROR_SELECTORS = [
      'input[aria-invalid="true"]',
      'textarea[aria-invalid="true"]',
      'select[aria-invalid="true"]',
      'input.error,input.is-invalid,input[class*="error"],input[class*="invalid"]',
      'textarea.error,textarea.is-invalid',
      'select.error,select.is-invalid',
      '.field--error input,.field--error textarea,.field--error select',
      '.form-group.has-error input,.form-group.has-error select',
      '[data-error] input,[data-error] textarea,[data-error] select',
      '[class*="fieldError"] input,[class*="fieldError"] textarea',
      '[class*="field-error"] input,[class*="field-error"] select',
    ];

    const errorFields = $$(ERROR_SELECTORS.join(','))
      .filter(el => isVisible(el) && el.tagName !== 'BUTTON');

    for (const el of errorFields) {
      const lbl = getLabel(el) || el.name || el.id || '';
      const inputType = (el.type || '').toLowerCase();

      if (el.tagName === 'SELECT') {
        const opts = $$('option', el).filter(o => o.value && o.value !== '' && !/^select/i.test(o.text));
        if (!opts.length) continue;
        const val = guessValue(lbl, p);
        const best = val ? bestSelectOption(el, val) : null;
        const chosen = best || opts[0];
        if (chosen) {
          el.value = chosen.value;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          fixed++;
        }
      } else if (isComboInput(el)) {
        /* A dropdown: pick a real option instead of typing into its search. */
        if (comboSelectedText(el)) continue;
        if (await chooseComboOption(el, String(guessValue(lbl, p) || '').replace(/^n\/?a$/i, ''), true)) fixed++;
      } else {
        const val = guessValue(lbl, p, inputType) || (inputType === 'email' ? p.email : '') || (inputType === 'tel' ? p.phone : '');
        if (val && nativeSet(el, val)) {
          await sleep(60);
          fixed++;
        }
      }
    }

    // Also scan for error MESSAGE elements and look for their associated field above
    const errorMsgEls = $$(ERROR_TEXT_SEL + ',[class*="error-message"],[class*="errorMessage"]')
      .filter(m => !/banner/i.test(String(m.getAttribute('class') || '')) && !m.querySelector(FIELD_SEL) &&
                   /\S/.test(m.textContent || '') && (m.textContent || '').trim().length < 200 && isVisible(m));

    const seen = new Set();
    for (const msg of errorMsgEls) {
      const inp = fieldOfMessage(msg);     // the ONE field this message sits with, or none
      if (!inp || seen.has(inp) || !isVisible(inp) || isPageChromeField(inp)) continue;
      seen.add(inp);
      if (inp.tagName === 'SELECT') continue; // handled above
      if (inp.type === 'radio' || inp.type === 'checkbox') continue;
      if (isComboInput(inp)) continue;        // dropdowns: handled above / answerComboDropdowns
      const lbl = getLabel(inp) || inp.name || '';
      const inputType = (inp.type || '').toLowerCase();
      const val = guessValue(lbl, p, inputType);
      if (!val) continue;
      /* Still flagged although it shows our value? Another writer (OptimHire
         sets values without typing) may not have registered with the site:
         type it once for real. nativeSet() refuses anything more. */
      const want = phoneValueFor(inp, String(val));
      if ((inp.value?.trim() !== want || !wroteBefore(inp, want)) && nativeSet(inp, val)) { await sleep(60); fixed++; }
    }

    if (fixed > 0) LOG(`detectAndFixValidationErrors: fixed ${fixed} error fields`);
    return fixed;
  }

  /* ── Wait for a submit button to become enabled ────────────────────────
   * Some ATS frameworks disable the submit button until all fields pass
   * validation.  Poll for up to `ms` milliseconds.                       */
  async function waitForSubmitReady(btn, ms = 6000) {
    if (!btn) return false;
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (!btn.disabled && !btn.getAttribute('aria-disabled') &&
          btn.getAttribute('aria-disabled') !== 'true' &&
          !btn.classList.contains('disabled') &&
          isVisible(btn)) {
        return true;
      }
      await sleep(300);
    }
    return false;
  }

  /* ── Continuous sanitizer: re-runs after OptimHire fills post ours ──────
   * OptimHire's FILL_COMPLEX_FORM pipeline fills fields AFTER our pass.
   * We watch for input-value mutations and debounce a re-sanitize.        */
  let _sanitizeDebounce = null;
  function scheduleSanitize() {
    clearTimeout(_sanitizeDebounce);
    _sanitizeDebounce = setTimeout(() => sanitizeBadFills().catch(() => {}), 600);
  }

  // Watch for any programmatic value changes on the page
  (function installSanitizeWatcher() {
    try {
      const inputDesc   = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,   'value');
      const textaDesc   = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
      if (inputDesc?.set) {
        Object.defineProperty(HTMLInputElement.prototype, 'value', {
          set(v) {
            inputDesc.set.call(this, v);
            if (typeof v === 'string' && /^https?:\/\//i.test(v)) scheduleSanitize();
          },
          get() { return inputDesc.get.call(this); },
          configurable: true,
        });
      }
      if (textaDesc?.set) {
        Object.defineProperty(HTMLTextAreaElement.prototype, 'value', {
          set(v) {
            textaDesc.set.call(this, v);
            if (typeof v === 'string' && /^https?:\/\//i.test(v)) scheduleSanitize();
          },
          get() { return textaDesc.get.call(this); },
          configurable: true,
        });
      }
    } catch (_) { /* CSP/sandbox may block — fall back to MutationObserver */ }
  })();

  /**
   * bestSelectOption — finds the best <option> in a <select> for a given value.
   * Uses: exact match → starts-with → contains → first non-empty.
   */
  function bestSelectOption(sel, target, labelHint = '') {
    if (!target) return null;
    const t = String(target).toLowerCase();
    const opts = $$('option', sel).filter(o => o.value && o.value !== '');
    const exact   = opts.find(o => o.text.toLowerCase() === t);
    if (exact) return exact;
    const starts  = opts.find(o => o.text.toLowerCase().startsWith(t));
    if (starts) return starts;
    const contains = opts.find(o => o.text.toLowerCase().includes(t) || t.includes(o.text.toLowerCase()));
    if (contains) return contains;

    /* Normalise money/number shorthand so salary dropdowns match:
       strips "$" and thousands-commas, and expands k/m suffixes
       ("50k" → "50000", "1.5m" → "1500000"). Applied to both the
       target and each option's text before numeric range matching. */
    const normNum = (s) => String(s)
      .replace(/\$/g, '')
      .replace(/,/g, '')
      .replace(/(\d+(?:\.\d+)?)\s*([km])\b/gi, (_, n, suf) =>
        String(Math.round(parseFloat(n) * (/[kK]/.test(suf) ? 1e3 : 1e6))));

    /* Numeric-range smart-match: when the target is purely numeric (e.g.
       "7" for years of experience or "80000" for salary), find the option
       whose range CONTAINS the number — covers "5-10 years", "5 to 10",
       "5+ years", "Over 5 years", "Less than 10 years", "$50,000-$80,000",
       "50k-80k", etc. */
    const num = parseFloat(normNum(t));
    if (!isNaN(num)) {
      let bestOpt = null;
      let bestSpan = Infinity;
      for (const o of opts) {
        const txt = normNum(o.text.toLowerCase());
        /* "X - Y" / "X to Y" / "X – Y" */
        const range = txt.match(/(\d+(?:\.\d+)?)\s*(?:-|to|–|—)\s*(\d+(?:\.\d+)?)/);
        if (range) {
          const lo = parseFloat(range[1]); const hi = parseFloat(range[2]);
          if (num >= lo && num <= hi) {
            const span = hi - lo;
            if (span < bestSpan) { bestOpt = o; bestSpan = span; }
          }
          continue;
        }
        /* "X+" / "Over X" / "More than X" / "At least X" */
        const overM = txt.match(/(?:over|more\s*than|at\s*least|>=?|>\s*=?\s*)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*\+/);
        if (overM) {
          const lo = parseFloat(overM[1] || overM[2]);
          if (num >= lo) {
            /* prefer the tightest "over X" — biggest X that still ≤ num */
            const span = num - lo + 1;
            if (span < bestSpan) { bestOpt = o; bestSpan = span; }
          }
          continue;
        }
        /* "Less than X" / "Under X" / "Up to X" / "<= X" */
        const underM = txt.match(/(?:less\s*than|under|up\s*to|<=?|<\s*=?\s*)\s*(\d+(?:\.\d+)?)/);
        if (underM) {
          const hi = parseFloat(underM[1]);
          if (num <= hi) {
            const span = hi - num + 1;
            if (span < bestSpan) { bestOpt = o; bestSpan = span; }
          }
          continue;
        }
        /* "Exactly X" / bare "X" (single-number option) */
        const exactM = txt.match(/^\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)?\s*$/);
        if (exactM) {
          const v = parseFloat(exactM[1]);
          const span = Math.abs(v - num);
          if (span < bestSpan) { bestOpt = o; bestSpan = span; }
        }
      }
      if (bestOpt) return bestOpt;
    }

    /* T32: Notice-period / time-duration smart-match by parsed days. */
    if (/notice|availab|start|when.*begin/i.test(labelHint) || /notice|availab|start/i.test(t) || /week|month|day|immediate/i.test(t)) {
      const idx = pickNoticePeriodOption(sel, target);
      if (idx != null && sel.options[idx]) return sel.options[idx];
    }
    return null;
  }

  async function autoFillPage() {
    if (wdEngineOwns()) return;
    const p = await getProfile();
    const allFields = [];
    let filledCount = 0;

    /* ── Scan all visible form fields first to build field list ── */
    /* The site's own search / header boxes (Indeed's "What / Where") are
       never part of the application. */
    const allInputs = $$(
      'input:not([type=hidden]):not([type=file]):not([type=submit]):not([type=button]),' +
      'textarea'
    ).filter(el => isVisible(el) && !isPageChromeField(el) && !isTrapField(el));
    const allSelects = $$('select').filter(el => isVisible(el) && !isPageChromeField(el) && !isTrapField(el));

    for (const el of allInputs) {
      const lbl = getLabel(el) || el.name || el.id || '';
      if (!lbl) continue;
      const isRequired = el.required || el.getAttribute('aria-required') === 'true';
      allFields.push({ name: lbl, status: el.value?.trim() ? 'filled' : 'pending', required: isRequired });
      if (el.value?.trim()) filledCount++;
    }
    for (const el of allSelects) {
      const lbl = getLabel(el) || el.name || el.id || '';
      if (!lbl) continue;
      const isRequired = el.required || el.getAttribute('aria-required') === 'true';
      allFields.push({ name: lbl, status: el.value ? 'filled' : 'pending', required: isRequired });
      if (el.value) filledCount++;
    }

    // Send initial field list to sidebar
    reportFieldStatus(allFields);
    // Send overall status
    try {
      chrome.runtime.sendMessage({
        type: 'SIDEBAR_STATUS',
        event: 'filling_progress',
        total: allFields.length,
        filled: filledCount,
        responses: Object.keys(p).length,
      }).catch(() => {});
    } catch (_) {}

    /* Inputs + textareas — only unfilled. Dropdown search boxes are not
       text fields: answerComboDropdowns() handles those below. */
    const inputs = allInputs.filter(el => !el.value?.trim() && !isComboInput(el) && !inPhoneWidget(el));

    for (const inp of inputs) {
      const lbl = getLabel(inp);
      const inputType = (inp.type || '').toLowerCase();
      if (!lbl && !inputType) continue;
      const val = guessValue(lbl || '', p, inputType);
      if (!val) {
        if (lbl) reportFieldFilled(lbl, 'failed');
        continue;
      }
      inp.focus();
      nativeSet(inp, val);
      filledCount++;
      if (lbl) reportFieldFilled(lbl, 'filled');
      await sleep(60);
    }

    /* Selects */
    const selects = allSelects.filter(el => !el.value);
    for (const sel of selects) {
      const lbl = getLabel(sel);
      const l   = lbl.toLowerCase();
      const opts = $$('option', sel).filter(o => o.value && o.value !== '' && !/^select/i.test(o.text));
      if (!opts.length) continue;

      let chosen = null;
      const val = guessValue(lbl, p);

      // 1) Direct label → value match via bestSelectOption
      if (val) chosen = bestSelectOption(sel, val);

      // 1b) Work Authorization Status: if val is 'authorized', also try 'yes'
      //     so simple Yes/No dropdowns still get the right answer.
      if (!chosen && val === 'authorized') {
        chosen = bestSelectOption(sel, 'yes') ||
                 bestSelectOption(sel, 'eligible') ||
                 bestSelectOption(sel, 'citizen');
      }

      // 2) Yes/No fallback: if it's a small option set with yes/no options,
      //    pick the appropriate answer based on question polarity
      if (!chosen && opts.length <= 6) {
        const hasYes = opts.some(o => /^yes$/i.test(o.text.trim()));
        const hasNo  = opts.some(o => /^no$/i.test(o.text.trim()));
        if (hasYes || hasNo) {
          // Questions with negative framing → pick No
          const negative = /\bnot\b|\bno longer\b|don.t|cannot|unable|lack|without|decline/i.test(l);
          chosen = opts.find(o => negative
            ? /^no$/i.test(o.text.trim())
            : /^yes$/i.test(o.text.trim()));
          // If no exact "Yes", pick first option that contains "yes"
          if (!chosen) {
            chosen = opts.find(o => negative
              ? /\bno\b/i.test(o.text)
              : /\byes\b/i.test(o.text));
          }
        }
      }

      // 3a) Experience range: pick the bracket closest to our years value
      if (!chosen && EXP_LABEL_RE.test(l)) {
        const targetYears = parseInt((koFacts().yearsExperience || p.years_experience || DEFAULTS.years).toString()) || 7;
        let bestDist = Infinity;
        for (const o of opts) {
          const nums = (o.text.match(/\d+/g) || []).map(Number).filter(Boolean);
          if (!nums.length) {
            // Text option like "Less than 1 year", "10+ years", "More than 10" etc.
            if (/less.?than.?1|under.?1|none|no.?exp/i.test(o.text)) {
              const dist = Math.abs(0 - targetYears);
              if (dist < bestDist) { bestDist = dist; chosen = o; }
            } else if (/10\+|more.?than.?10|over.?10|10\s*or\s*more|10\s*\+/i.test(o.text)) {
              const dist = Math.abs(10 - targetYears);
              if (dist < bestDist) { bestDist = dist; chosen = o; }
            }
            continue;
          }
          const mid  = nums.reduce((a, b) => a + b, 0) / nums.length;
          const dist = Math.abs(mid - targetYears);
          if (dist < bestDist) { bestDist = dist; chosen = o; }
        }
      }

      // 3b) Salary range: pick the band closest to expected salary
      if (!chosen && /salary|compensation|pay\b|remun|expectation|ctc|lpa/i.test(l)) {
        const target = parseInt((p.expected_salary || DEFAULTS.salary).toString().replace(/\D/g,'')) || 80000;
        let bestDist = Infinity;
        for (const o of opts) {
          const nums = (o.text.match(/\d[\d,]*/g) || []).map(n => parseInt(n.replace(/,/g,''))).filter(Boolean);
          if (!nums.length) continue;
          const mid   = nums.reduce((a, b) => a + b, 0) / nums.length;
          const dist  = Math.abs(mid - target);
          if (dist < bestDist) { bestDist = dist; chosen = o; }
        }
      }

      // 4) Last resort: if still nothing and exactly 2 options, pick the first
      if (!chosen && opts.length === 2) {
        chosen = opts[0];
      }

      if (chosen) {
        sel.value = chosen.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        filledCount++;
        if (lbl) reportFieldFilled(lbl, 'filled');
      } else {
        if (lbl) reportFieldFilled(lbl, 'failed');
      }
    }

    /* Fix selects that were wrongly filled (e.g. "80000" in a yes/no dropdown) */
    for (const sel of allSelects.filter(el => el.value)) {
      const lbl = getLabel(sel);
      const l   = lbl.toLowerCase();
      const curText = sel.options[sel.selectedIndex]?.text?.trim() || sel.value;
      // If value looks like a raw number in a non-salary / non-experience field, it's wrong
      if (/^\d+$/.test(sel.value) &&
          !/salary|compensation|pay\b|remun|expectation|ctc|lpa/i.test(l) &&
          !EXP_LABEL_RE.test(l)) {
        sel.value = '';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        // Re-trigger to fill correctly
        const opts2 = $$('option', sel).filter(o => o.value && o.value !== '' && !/^select/i.test(o.text));
        const hasYes = opts2.some(o => /^yes$/i.test(o.text.trim()));
        if (hasYes) {
          const yesOpt = opts2.find(o => /^yes$/i.test(o.text.trim())) ||
                         opts2.find(o => /\byes\b/i.test(o.text));
          if (yesOpt) {
            sel.value = yesOpt.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            if (lbl) reportFieldFilled(lbl, 'filled');
          }
        }
      }
    }

    /* ── T23: React-Select / Select2 / custom combobox ─────────────
     * Many modern ATS use custom dropdown widgets that don't use <select>.
     * Detect them by role=combobox or common class names, then type the
     * target value and pick the first matching option from the listbox.   */
    const customCombos = $$(
      '[role="combobox"]:not([data-automation-id]),' +
      '[class*="react-select__control"],[class*="select2-selection"],' +
      '[class*="Select__control"],[class*="dropdown-trigger"]'
    ).filter(isVisible);

    for (const combo of customCombos) {
      /* A bare <input role=combobox> is handled by answerComboDropdowns(),
         which can tell a chosen value from typed text. */
      if (combo.tagName === 'INPUT') continue;
      // Only process if it looks unfilled
      const valueEl = combo.querySelector(
        '[class*="singleValue"],[class*="single-value"],[class*="placeholder"],[class*="Select__placeholder"]'
      );
      /* "Unfilled" detection. The old test only recognised
         select/choose/pick, so Ashby's "Start typing..." placeholder read
         as a REAL value and the field was skipped — leaving a required
         Location empty and blocking submission forever. Treat any
         placeholder-ish wording, or an empty/placeholder-only widget with
         an empty inner input, as unfilled. */
      const comboInput = combo.querySelector('input') || (combo.tagName === 'INPUT' ? combo : null);
      const valTxt = ((valueEl && valueEl.textContent) || '').trim();
      const PLACEHOLDER_RE = /select|choose|pick|start typing|type here|search|begin typing|e\.g\.|^\s*$/i;
      const looksPlaceholderClass = !!(valueEl && /placeholder/i.test(valueEl.className || ''));
      const inputEmpty = !comboInput || !comboInput.value || !comboInput.value.trim();
      const isPlaceholder = !valueEl || looksPlaceholderClass ||
                            PLACEHOLDER_RE.test(valTxt) ||
                            (inputEmpty && !valTxt);
      if (!isPlaceholder) continue;

      const lbl = getLabel(combo) || getLabel(combo.closest('[class*="field"],[class*="Field"],[class*="form-group"]') || combo) || '';
      const val = guessValue(lbl, p);
      if (!val) continue;

      // Open the dropdown
      realClick(combo);
      await sleep(400);

      // Try typing in the search input
      const searchInput = combo.querySelector('input') || (combo.tagName === 'INPUT' ? combo : null);
      if (searchInput) { nativeSet(searchInput, val); await sleep(600); }

      // Pick matching option from listbox
      const listbox = document.querySelector(
        '[role="listbox"],[class*="react-select__menu"],[class*="Select__menu"],[class*="select2-results"]'
      );
      if (listbox) {
        const opts = $$('[role="option"],[class*="react-select__option"],[class*="Select__option"],[class*="select2-results__option"]', listbox)
          .filter(isVisible);
        const vl = val.toLowerCase();
        const best = opts.find(o => o.textContent.toLowerCase().includes(vl))
          || opts.find(o => vl.includes(o.textContent.toLowerCase().trim()))
          || opts[0];
        if (best) { realClick(best); await sleep(300); filledCount++; if (lbl) reportFieldFilled(lbl, 'filled'); }
        else {
          // Close dropdown if no match
          document.body.click();
          await sleep(200);
        }
      }
    }

    /* Radio buttons */
    const groups = {};
    $$('input[type=radio]').filter(isVisible).forEach(r => {
      (groups[r.name || r.id] ||= []).push(r);
    });
    for (const [, radios] of Object.entries(groups)) {
      if (radios.some(r => r.checked)) continue;
      /* The group's QUESTION, not the first radio's own "Yes" label. */
      const lbl = radioGroupLabel(radios);
      const guess = String(guessValue(lbl, p) || '').toLowerCase().trim();
      const optText = r => radioOptionText(r).toLowerCase();
      const match = guess ? (radios.find(r => optText(r) === guess) ||
                             radios.find(r => optText(r).includes(guess))) : null;
      if (match) { realClick(match); reportFieldFilled(lbl, 'filled'); filledCount++; continue; }
      /* Default: pick Yes for yes/no questions */
      const yes = radios.find(r => {
        const t = ($(`label[for="${CSS.escape(r.id)}"]`)?.textContent || r.value || '').toLowerCase().trim();
        return ['yes','true','1'].includes(t);
      });
      if (yes) { realClick(yes); reportFieldFilled(lbl, 'filled'); filledCount++; }
      else { reportFieldFilled(lbl, 'failed'); }
    }

    /* Checkboxes — required-attribute OR consent-style labels.
       Many forms have "I agree to the privacy policy" etc as checkboxes
       that block submit but don't carry [required]. Tick them by label. */
    const CONSENT_RE = /\b(agree|accept|consent|acknowledge|confirm|certify|attest|declare|i\s+have\s+read|i\s+understand|terms|privacy|policy|gdpr|opt.?in|subscribe|notify\s+me|keep\s+me\s+updated|receive\s+(updates|emails|notifications))\b/i;
    const CONSENT_NEGATIVE_RE = /\b(decline|opt.?out|do\s+not|don'?t|unsubscribe|reject)\b/i;
    $$('input[type=checkbox]').filter(isVisible).forEach(cb => {
      if (cb.checked) return;
      const isReq = cb.required || cb.getAttribute('aria-required') === 'true';
      const lbl   = getLabel(cb) || '';
      const txt   = (cb.value || '') + ' ' + lbl;
      if (CONSENT_NEGATIVE_RE.test(lbl)) return;
      if (isReq || CONSENT_RE.test(txt)) {
        realClick(cb); filledCount++;
      }
    });

    /* ── Final-pass sweep: re-fill any still-empty required fields ──
       Some React forms toggle required state only after first focus, or
       reveal new inputs after a parent dropdown changes. A second pass
       catches those. */
    await sleep(800);
    /* Required dropdowns first (never typed into — see chooseComboOption). */
    try { await answerComboDropdowns(document, p); } catch (_) {}
    const stillEmpty = $$(
      'input[required]:not([type=hidden]):not([type=file]):not([type=submit]):not([type=button]),' +
      'input[aria-required="true"]:not([type=hidden]):not([type=file]),' +
      'textarea[required],textarea[aria-required="true"],' +
      'select[required],select[aria-required="true"]'
    ).filter(el => isVisible(el) && !(el.value && el.value.trim()) && !isComboInput(el) && !inPhoneWidget(el));

    for (const el of stillEmpty) {
      const lbl = getLabel(el);
      if (!lbl) continue;
      if (el.tagName === 'SELECT') {
        const val = guessValue(lbl, p);
        const chosen = val ? bestSelectOption(el, val, lbl) : null;
        const fallback = chosen || bestSelectOption(el, 'yes') ||
                         $$('option', el).find(o => o.value && o.value !== '' && !/^select/i.test(o.text));
        if (fallback) {
          el.value = fallback.value;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          filledCount++;
          reportFieldFilled(lbl, 'filled');
        }
      } else {
        const inputType = (el.type || '').toLowerCase();
        let val = guessValue(lbl, p, inputType);
        /* Last-resort defaults for required fields we couldn't classify */
        if (!val) {
          if (inputType === 'email') val = p.email || '';
          else if (inputType === 'tel') val = p.phone || '';
          else if (inputType === 'number') val = '1';
          else if (inputType === 'date') val = new Date().toISOString().slice(0,10);
          /* A URL field cannot take free text — leave it for OptimHire / the
             user rather than inject an invalid value. */
          else if (inputType === 'url') val = '';
          /* Never "N/A" in a name / contact / address / link box — that is
             a wrong answer, not a neutral one; such a box is left for you. */
          else if (CONTACT_LABEL_RE.test(lbl)) val = '';
          /* Neutral filler. This used to be p.first_name, which answered an
             arbitrary required question ("Describe a project you're proud
             of") with the applicant's first name. */
          else val = 'N/A';
        }
        if (val) {
          el.focus(); nativeSet(el, val); await sleep(40);
          filledCount++;
          reportFieldFilled(lbl, 'filled');
        }
      }
    }

    // Final progress update
    try {
      chrome.runtime.sendMessage({
        type: 'SIDEBAR_STATUS',
        event: 'filling_progress',
        total: allFields.length,
        filled: filledCount,
        responses: Object.keys(p).length,
      }).catch(() => {});
    } catch (_) {}

    // Sanitize: fix any fields that got filled with wrong values (e.g. LinkedIn URL in non-URL fields)
    await sanitizeBadFills();

    LOG(`autoFillPage: ${filledCount} of ${allFields.length} fields filled`);
  }

  /* ── Greenhouse: robust required-field handling ───────────── */
  async function greenhouseAutofill() {
    const isGH = HOST.includes('greenhouse.io') || HOST.includes('boards.greenhouse.io') ||
      !!$('form#application_form,#application_form,[data-provided-by="greenhouse"]');
    if (!isGH) return;

    const p = await getProfile();

    /* Map common Greenhouse field IDs/names */
    const GH_MAP = [
      ['#first_name,input[id*="first_name"],input[name*="first_name"]',   p.first_name],
      ['#last_name,input[id*="last_name"],input[name*="last_name"]',       p.last_name],
      ['#email,input[type="email"],input[id*="email"]',                    p.email],
      ['#phone,input[type="tel"],input[id*="phone"]',                      p.phone],
      ['input[id*="location"],input[name*="location"]',                    p.city || p.location || ''],
      ['input[id*="linkedin"],input[name*="linkedin"]',                    p.linkedin_profile_url || ''],
      ['input[id*="website"],input[name*="website"],input[id*="portfolio"]', p.website_url || ''],
      ['input[id*="github"],input[name*="github"]',                        p.github_url || ''],
      ['textarea[id*="cover"],textarea[name*="cover"]',                    p.cover_letter || DEFAULTS.cover],
    ];

    for (const [sel, val] of GH_MAP) {
      if (!val) continue;
      const el = $(sel);
      if (el && isVisible(el)) { el.focus(); nativeSet(el, val); await sleep(50); }
    }

    /* Handle custom questions (dropdowns) */
    $$('select').filter(isVisible).forEach(sel => {
      if (sel.value) return;
      const lbl = getLabel(sel);
      const val = guessValue(lbl, p);
      if (!val) return;
      const opt = $$('option', sel).find(o => o.text.toLowerCase().includes(val.toLowerCase()));
      if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    });

    /* EEO/demographic selects */
    $$('select[id*="gender"],select[id*="disability"],select[id*="veteran"],select[id*="race"],select[id*="ethnicity"]')
      .filter(isVisible)
      .forEach(sel => {
        if (sel.value) return;
        const id = sel.id.toLowerCase();
        let target = '';
        if (/gender/.test(id))    target = DEFAULTS.gender;
        if (/disability/.test(id))target = DEFAULTS.disability;
        if (/veteran/.test(id))   target = DEFAULTS.veteran;
        if (/race|ethnicity/.test(id)) target = DEFAULTS.ethnicity;
        if (!target) return;
        const opt = $$('option', sel).find(o =>
          o.text.toLowerCase().includes('decline') ||
          o.text.toLowerCase().includes('prefer not') ||
          o.text.toLowerCase().includes('not to say') ||
          o.text.toLowerCase().includes('not a protected') ||
          o.text.toLowerCase().includes('do not have')
        );
        if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      });

    LOG('Greenhouse autofill done');
  }

  /* ── T18: Auto-handle "Add Missing Details" dialog ───────── */
  function watchMissingDetailsDialog() {
    let lastFill = 0;
    new MutationObserver(async () => {
      if (Date.now() - lastFill < 3000) return;

      /* Look for the OptimHire missing-details iframe */
      const iframe = document.getElementById('optimhire-missing-details');
      if (iframe) {
        try {
          const doc = iframe.contentDocument || iframe.contentWindow?.document;
          if (doc && doc.body && doc.body.innerHTML.length > 50) {
            lastFill = Date.now();
            const p = await getProfile();
            const inputs = $$('input:not([type=hidden]):not([type=file]):not([type=button]):not([type=submit]),textarea', doc)
              .filter(el => isVisible(el) && !el.value?.trim());
            for (const inp of inputs) {
              const lbl = getLabel(inp);
              const val = guessValue(lbl, p);
              if (val) { inp.focus(); nativeSet(inp, val); await sleep(50); }
            }
            await sleep(600);
            const saveBtn = $$('button', doc).find(
              el => isVisible(el) && /save|continue|done|submit|update/i.test(el.textContent)
            );
            if (saveBtn) realClick(saveBtn);
          }
        } catch (_) {}
      }

      /* Generic "missing details" dialogs on the page */
      const dialog = $$('[class*="missing"],[id*="missing"],[role="dialog"],[class*="modal"]')
        .find(el => isVisible(el) &&
          /missing details|fill.*details|add.*details|fill.*form/i.test(el.textContent)
        );
      if (dialog) {
        lastFill = Date.now();
        await sleep(300);
        await autoFillPage();
        await sleep(700);
        const btn = $$('button', dialog).find(
          el => isVisible(el) && /save|submit|continue|done|next|confirm/i.test(el.textContent)
        );
        if (btn) realClick(btn);
      }
    }).observe(document.body, { childList: true, subtree: true, attributes: false });
  }
  watchMissingDetailsDialog();

  /* ── T18-B: Robust "Add Missing Details" modal answerer ───────────────────
   * OptimHire pops an "Add Missing Details" modal ("AI needs your details
   * for a few questions") with dropdowns / radios it has no saved answer
   * for (e.g. "Are you authorised to work in the country…"). If unanswered
   * it stalls the apply flow. This handler:
   *   1. Detects the modal by its heading text.
   *   2. Answers every question control inside it — native <select>,
   *      custom/React-Select comboboxes, radio groups, and text inputs —
   *      using guessValue() with a strong Yes/authorized bias for
   *      work-auth / agreement questions, falling back to the first real
   *      (non-placeholder) option.
   *   3. Clicks Submit.
   *   4. Stall-breaker: if the modal is still up after several attempts,
   *      clicks "I'll do it later" so the application never hangs.
   * ─────────────────────────────────────────────────────────────────────── */
  (function installAddMissingDetailsHandler() {
    const _attempts = new WeakMap(); // modal element → attempt count
    const MAX_ATTEMPTS = 4;          // ~ MAX_ATTEMPTS * 2s before "I'll do it later"
    const HEADING_RE = /add\s+missing\s+details|ai\s+needs\s+your\s+details|needs\s+your\s+details\s+for\s+a\s+few\s+questions/i;

    function findModal() {
      const cands = $$('[role="dialog"],[class*="modal" i],[class*="Modal" i],[class*="dialog" i],[class*="drawer" i]')
        .filter(isVisible);
      for (const c of cands) {
        const t = (c.textContent || '').slice(0, 600);
        if (HEADING_RE.test(t)) return c;
      }
      /* Fallback: any visible container whose own heading matches */
      const heads = $$('h1,h2,h3,h4,[role="heading"]').filter(isVisible);
      for (const h of heads) {
        if (HEADING_RE.test(h.textContent || '')) {
          return h.closest('[role="dialog"],[class*="modal" i],[class*="Modal" i],section,div') || h.parentElement;
        }
      }
      return null;
    }

    function realOptionsOf(sel) {
      return [...sel.options].filter(o =>
        o.value && o.value !== '' &&
        !/^(please\s*select|select(\s*\.\.\.)?|choose|--|n\/?a)$/i.test((o.text || '').trim())
      );
    }
    function selectIsAnswered(sel) {
      if (!sel.value) return false;
      const cur = (sel.options[sel.selectedIndex]?.text || '').trim();
      return !/^(please\s*select|select|choose|--)/i.test(cur);
    }

    async function answerNativeSelects(modal, p) {
      let answered = 0;
      for (const sel of $$('select', modal).filter(isVisible)) {
        if (selectIsAnswered(sel)) continue;
        const lbl = getLabel(sel) || '';
        let v = guessValue(lbl, p);
        let opt = v ? bestSelectOption(sel, v, lbl) : null;
        if (!opt && (/authoriz|authoris|eligible|work|visa|sponsor/i.test(lbl) || v === 'authorized'))
          opt = bestSelectOption(sel, 'yes') || bestSelectOption(sel, 'authoriz') || bestSelectOption(sel, 'eligible');
        if (!opt && /agree|consent|accept|confirm|acknowledge/i.test(lbl))
          opt = bestSelectOption(sel, 'yes') || bestSelectOption(sel, 'agree');
        if (!opt) {
          /* Last resort: prefer a "Yes"-ish option, else first real option. */
          const opts = realOptionsOf(sel);
          opt = opts.find(o => /^yes\b/i.test((o.text || '').trim())) || opts[0];
        }
        if (opt) {
          sel.value = opt.value;
          sel.dispatchEvent(new Event('input', { bubbles: true }));
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          answered++; await sleep(80);
        }
      }
      return answered;
    }

    async function answerRadios(modal, p) {
      const groups = {};
      $$('input[type=radio]', modal).filter(isVisible).forEach(r => {
        (groups[r.name || r.id || Math.random()] ||= []).push(r);
      });
      let answered = 0;
      for (const key in groups) {
        const radios = groups[key];
        if (radios.some(r => r.checked)) continue;
        const lbl = radioGroupLabel(radios) || '';
        const v = String(guessValue(lbl, p) || 'yes').toLowerCase().trim();
        /* Pick the radio whose own label matches our value, else "Yes". */
        const optText = r => (radioOptionText(r) || getLabel(r) || '').toLowerCase();
        let pick = radios.find(r => optText(r) === v) ||
                   radios.find(r => optText(r).includes(v)) ||
                   radios.find(r => /^yes\b/i.test((getLabel(r) || '').trim())) ||
                   radios[0];
        if (pick) { realClick(pick); answered++; await sleep(80); }
      }
      return answered;
    }

    async function answerCustomCombos(modal, p) {
      const combos = $$(
        '[role="combobox"],[class*="react-select__control"],[class*="select2-selection"],' +
        '[class*="Select__control"],[class*="dropdown-trigger"]', modal
      ).filter(isVisible);
      let answered = 0;
      for (const combo of combos) {
        const valEl = combo.querySelector('[class*="singleValue"],[class*="single-value"],[class*="Select__single-value"]');
        const phEl  = combo.querySelector('[class*="placeholder"],[class*="Select__placeholder"]');
        const looksUnset = !valEl || (phEl && /select|choose|pick/i.test(phEl.textContent || ''));
        if (!looksUnset) continue;
        const lbl = getLabel(combo) || getLabel(combo.closest('[class*="field"],[class*="Field"],[class*="form-group"]') || combo) || '';
        let v = guessValue(lbl, p) || 'Yes';
        realClick(combo); await sleep(350);
        const search = combo.querySelector('input') || (combo.tagName === 'INPUT' ? combo : null);
        if (search) { nativeSet(search, v); await sleep(450); }
        const listbox = document.querySelector(
          '[role="listbox"],[class*="react-select__menu"],[class*="Select__menu"],[class*="select2-results"]'
        );
        if (listbox) {
          const opts = $$('[role="option"],[class*="react-select__option"],[class*="Select__option"],[class*="select2-results__option"]', listbox).filter(isVisible);
          const vl = v.toLowerCase();
          const best = opts.find(o => o.textContent.toLowerCase().includes(vl)) ||
                       opts.find(o => /^yes\b/i.test(o.textContent.trim())) ||
                       opts[0];
          if (best) { realClick(best); answered++; await sleep(250); }
          else { document.body.click(); await sleep(150); }
        }
      }
      return answered;
    }

    async function answerTextInputs(modal, p) {
      let answered = 0;
      for (const inp of $$('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]),textarea', modal).filter(isVisible)) {
        if (inp.value && inp.value.trim()) continue;
        if (isComboInput(inp)) continue;      // dropdown search box, not a text field
        const lbl = getLabel(inp) || '';
        const v = guessValue(lbl, (p), (inp.type || '').toLowerCase());
        if (v) { inp.focus(); nativeSet(inp, v); answered++; await sleep(60); }
      }
      return answered;
    }

    function findBtn(modal, re) {
      return $$('button,[role="button"],input[type=submit]', modal)
        .find(b => isVisible(b) && !b.disabled &&
          re.test(((b.innerText || b.value || b.textContent || '') + '').trim()));
    }

    async function tick() {
      try {
        if (!(await isAutomationActive())) return;
        const modal = findModal();
        if (!modal) return;

        const n = (_attempts.get(modal) || 0) + 1;
        _attempts.set(modal, n);

        const p = await getProfile();
        await answerNativeSelects(modal, p);
        await answerCustomCombos(modal, p);
        await answerRadios(modal, p);
        await answerTextInputs(modal, p);
        await sleep(300);

        /* Try Submit */
        const submit = findBtn(modal, /^(submit|save|continue|done|confirm|next)$/i);
        if (submit) {
          LOG('Add Missing Details: answered + clicking Submit');
          realClick(submit);
          await sleep(400);
        }

        /* Stall-breaker: still here after MAX_ATTEMPTS → defer it so the
           application proceeds instead of hanging. */
        if (n >= MAX_ATTEMPTS && findModal()) {
          const later = findBtn(modal, /^(i'?ll do it later|do it later|later|skip( question)?)$/i);
          if (later) {
            LOG(`Add Missing Details: still stuck after ${n} tries — clicking "I'll do it later"`);
            realClick(later);
          }
        }
      } catch (_) {}
    }

    setInterval(tick, 2000);
  })();

  /* ── T17-B: OptimHire "optimhire-missing-details" iframe stall prevention ──
   *
   * When OptimHire encounters custom job questions it doesn't have saved
   * answers for, it injects a FULLSCREEN IFRAME (id="optimhire-missing-details")
   * over the page and starts a 180-second (3 min) background timer.
   * Our sidepanel cap only changes the *displayed* countdown — the background
   * timer still runs for 3 minutes before actually calling skipCurrent.
   *
   * This function watches for that iframe and:
   *  1. Immediately sends the answers to the iframe via postMessage
   *  2. If the iframe is still present after 5 seconds, force-skips
   *
   * Result: no stall ever exceeds ~5 seconds.
   * ─────────────────────────────────────────────────────────────────────── */
  (function watchOptimHireMissingDetailsIframe() {
    // All OptimHire blocking iframes (confirmed from v2.4.2 source)
    const BLOCKING_IFRAME_IDS = [
      'optimhire-missing-details',         // missing preferences dialog
      'optimhire-queastion-cover-letter',  // cover letter question modal (new v2.4.2)
      'optimhire-resume-score-record',     // resume score modal (new v2.4.2)
      'confinity-welcome-screen',          // Confinity onboarding (new v2.4.2)
    ];
    const IFRAME_ID = 'optimhire-missing-details'; // primary stall iframe
    let _skipScheduled = false;

    async function handleMissingDetailsIframe(iframe) {
      if (_skipScheduled) return;
      // v6.1: only intervene when actually in an automation session.
      // Otherwise just remove the iframe so the user can browse.
      const active = await isAutomationActive();
      if (!active) {
        try { iframe.remove(); document.body.style.overflow = ''; } catch (_) {}
        LOG('Missing-details iframe removed (idle browsing)');
        return;
      }
      _skipScheduled = true;
      LOG('Missing-details iframe detected — scheduling force-skip in 5s');

      try {
        // Attempt to answer questions via postMessage to the iframe.
        // OptimHire's missingDetails page receives MISSING_QUESTION_DETAILS_API
        // and then renders YES/NO radio questions.  After the user (or us) submits,
        // the iframe removes itself.
        // We can't access contentDocument (cross-origin extension page), but we
        // CAN postMessage to contentWindow.
        const p = await getProfile();
        iframe.contentWindow?.postMessage({ type: 'OH_PATCH_AUTO_SUBMIT' }, '*');
        await sleep(800);

        // Also look for the submit button in the iframe's accessible shadow DOM
        // (may be accessible in some configurations)
        try {
          const doc = iframe.contentDocument;
          if (doc) {
            const submitBtn = $$('button[type="submit"],button', doc)
              .find(el => isVisible(el) && /submit|save|done|continue/i.test(el.textContent));
            if (submitBtn) { realClick(submitBtn); LOG('Missing-details: clicked submit inside iframe'); }
          }
        } catch (_) { /* cross-origin — expected */ }
      } catch (_) {}

      // After 8 seconds, if iframe is still present and we're not actively filling, force-skip
      await sleep(8000);
      const still = document.getElementById(IFRAME_ID);
      if (still) {
        if (_fillActive || (_submitAttempted && Date.now() - _submitAttemptTs < 30_000)) {
          LOG('Missing-details iframe: skip suppressed (fill active or submit attempted)');
          _skipScheduled = false;
          return;
        }
        LOG('Missing-details iframe still present after 8s — force-skipping');
        await requestSkipCurrent('missing-details iframe stuck');
        // Also remove the iframe so the page is unblocked
        try {
          still.remove();
          document.body.style.overflow = '';
        } catch (_) {}
      }
      // Reset so next occurrence can be handled
      _skipScheduled = false;
    }

    // Observe for any blocking iframe being added to the DOM
    new MutationObserver(mutations => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          // Primary stall iframe
          if (node.id === IFRAME_ID) {
            handleMissingDetailsIframe(node);
            return;
          }
          // Non-primary blocking iframes — just remove them after a short delay
          // so they don't prevent the page from being used
          if (node.id && BLOCKING_IFRAME_IDS.includes(node.id) && node.id !== IFRAME_ID) {
            const iid = node.id;
            setTimeout(() => {
              const el = document.getElementById(iid);
              if (el) {
                LOG(`Removing blocking iframe: ${iid}`);
                el.remove();
                document.body.style.overflow = '';
              }
            }, 4000);
            return;
          }
          // Check children
          if (node.querySelector) {
            const inner = node.querySelector(`#${IFRAME_ID}`);
            if (inner) { handleMissingDetailsIframe(inner); return; }
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });

    // Check if the iframe is already present on load
    const existing = document.getElementById(IFRAME_ID);
    if (existing) handleMissingDetailsIframe(existing);
  })();

  /* ── General stuck-job watchdog (content script) ────────────────────────────
   * Progress-tracking safety net. It tracks a "last progress" timestamp
   * that resets whenever ANY sign of activity is seen, and only fires
   * skipCurrent when nothing has progressed for STUCK_TIMEOUT_MS.
   *
   * Critically, on third-party ATSes OptimHire's OWN autofill does the
   * work (our _fillActive flag stays false), and its "Hang tight!
   * We're loading your details…" / "Submitting…" phase can take 30-60s.
   * The old 7s timer skipped mid-load, which both abandoned good jobs
   * AND thrashed the applied counter (skip → re-add → skip). We now
   * treat OptimHire's working indicators and any form-field changes as
   * progress, so we never skip while it's actively applying.
   * ─────────────────────────────────────────────────────────────────────── */
  (function installStuckWatchdog() {
    /* 60s of genuine inactivity = stuck. This is a safety net, NOT the
       throughput driver — OptimHire's full per-job flow (load details →
       fill → generate cover letter → upload CV → submit) legitimately
       takes 30-60s on slower ATSes. Skipping earlier abandons real
       applications. */
    /* Was 60s of "no page change" — but OptimHire's own "Fetching your
       answers" step (its AI writing answers) often keeps the page still
       for that long, and skips are real now: jobs were being skipped
       mid-fill. OptimHire's activity counts as progress (below), and a job
       has to be silent for 3 minutes before it is judged stuck. */
    const STUCK_TIMEOUT_MS = 180_000;
    const POLL_MS = 2_000;

    let _lastUrl = '';
    let _lastProgressTs = Date.now();
    let _lastFormSignature = '';

    /* Cheap signature of current form field values — if it changes
       between polls, something is being filled (progress). */
    function formSignature() {
      try {
        let sig = '';
        const els = $$(
          'input:not([type=hidden]):not([type=submit]):not([type=button]),textarea,select'
        );
        for (let i = 0; i < els.length && i < 60; i++) {
          const v = els[i].value || '';
          sig += v.length + ':' + (els[i].checked ? '1' : '0') + '|';
        }
        return sig;
      } catch (_) { return ''; }
    }

    /* Hard cap: one job may not hold the page for more than JOB_CAP_MS,
       busy or not. A form that the site keeps rejecting (Workable's phone)
       sent OptimHire round and round — re-filling every field, which the
       checks below count as progress — and one job sat flickering for 22
       minutes. Real applications take well under a minute (the 4-minute
       ones were OptimHire's resume screen counting down — now pressed at
       once); Workday's many pages plus signing in get longer. */
    const JOB_CAP_MS = /myworkday(jobs|site)\.com$|workday\.com$/i.test(location.hostname) ? 480_000 : 180_000;
    let _capKey = '', _capStartTs = 0;

    async function checkStuck() {
      let active = false, jobKey = '';
      try {
        const d = await ST.get([
          'csvActiveJobId', 'isAutoProcessStartJob', 'isManuallyStartJob', 'ohJobTab', 'ohJobQueueActive',
          'active_copilot_job_id',
        ]);
        active = (!!d.csvActiveJobId || !!d.isAutoProcessStartJob || !!d.isManuallyStartJob) &&
                 !notTheJobTab(d);
        jobKey = String(d.csvActiveJobId || d.active_copilot_job_id || '');
      } catch (_) { return; }

      if (!active) { _lastProgressTs = Date.now(); _capKey = ''; return; }

      const cur = normalizeUrl(location.href);
      const now = Date.now();

      if (window.top === window.self) {
        const key = jobKey + '|' + cur;
        if (key !== _capKey) { _capKey = key; _capStartTs = now; }
        else if (now - _capStartTs >= JOB_CAP_MS) {
          const min = Math.round((now - _capStartTs) / 60000);
          LOG(`Stuck watchdog: ${min} min on one job without finishing (${cur}) — skipping`);
          requestSkipCurrent(`stuck: ${min} min on one job — the form kept being re-filled`);
          _capStartTs = now; _lastProgressTs = now;
          return;
        }
      }

      /* Any of these counts as progress → reset the inactivity clock */
      let progressed = false;
      if (cur !== _lastUrl) { _lastUrl = cur; progressed = true; }       // navigation
      if (_fillActive) progressed = true;                                 // our autofill
      if (_submitAttempted && now - _submitAttemptTs < 30_000) progressed = true;
      if (optimHireBusy()) progressed = true;                             // OH overlay/spinner
      if (Date.now() - _ohActivityTs < 45_000) progressed = true;         // OptimHire's state/panel moved
      if (_rescueBusy) progressed = true;                                 // we are finishing the form
      if (wdEngineOwns()) progressed = true;                              // the Workday engine is applying
      const sig = formSignature();
      if (sig !== _lastFormSignature) { _lastFormSignature = sig; progressed = true; }

      if (progressed) { _lastProgressTs = now; return; }

      /* No progress signal at all — has it been long enough? */
      if (now - _lastProgressTs >= STUCK_TIMEOUT_MS) {
        LOG(`Stuck watchdog: no progress for ${STUCK_TIMEOUT_MS/1000}s on ${cur} — force-skipping`);
        requestSkipCurrent('stuck watchdog');
        _lastProgressTs = now; // cooldown so we don't spam skips
      }
    }

    setInterval(checkStuck, POLL_MS);
    checkStuck();
  })();


  /* ── T39 / T40: Zero-manual-effort auto-clickers ─────────────────────────
   * The 2.6.0 release added two interstitial screens that block the queue
   * unless the user clicks through:
   *   T39 — Custom Resume editor (optimhire.com): "Save & Next →" button
   *   T40 — Custom Cover Letter modal: "Apply Now" button
   * Both only fire while active automation is running (csvActiveJobId,
   * isAutoProcessStartJob, or autoApplyStateUpdate.isRunning) AND only
   * after the "Generating..." state has settled. We wait up to STABLE_MS
   * for the button to stay visible (so we don't click before the
   * generation finishes), then click via realClick().
   * ─────────────────────────────────────────────────────────────────────── */
  (function installAutoActionClickers() {
    /* High-throughput tuning for 2000+ queues. The button paints
       only AFTER the server-side resume / cover-letter generation
       completes, and the visible+enabled check below guarantees
       React has the button ready. So we click on the FIRST sight
       — saves ~50–100ms per button compared to a stability window.

       Caveat: when navigation between jobs is too fast, the
       resume-fetch API for the new page can race with the
       previous page's submit and return "couldn't fetch details
       for this resume right now". A per-URL minimum wait of
       PAGE_SETTLE_MS gives the fetch a chance to complete (or
       definitively fail, which we then handle with "Use My
       Original Resume") before we click anything. */
    const POLL_MS        =    100;
    const PAGE_SETTLE_MS = 1_500;   // minimum wait per URL
    const MAX_WAIT_MS    = 40_000;  // hard cap — click anyway after this
    const FETCH_FAIL_STABLE_MS = 3_000; // error must persist this long
    const CONTENT_STABLE_MS = 2_500; // tailored text must stop changing for this long
    const _clicked       = new WeakSet();
    const _pageEnteredAt = new Map(); // url → ts(ms) of first sight
    const _fetchFailedSince = new Map(); // url → ts(ms) of first fetchFailed sighting

    /* Content-stability tracker: AI generation streams text in over
       several seconds. We treat content as "done" only once its
       signature has been UNCHANGED for CONTENT_STABLE_MS — that's the
       reliable signal that the tailored CV / cover letter finished
       generating, as opposed to "there's some text on screen" (which
       is true even while the default CV shows during generation). */
    const _contentSig = new Map(); // key → { sig, ts }
    function contentStable(key, sig) {
      const now = Date.now();
      const prev = _contentSig.get(key);
      if (!prev || prev.sig !== sig) {
        _contentSig.set(key, { sig, ts: now });
        return false;
      }
      return now - prev.ts >= CONTENT_STABLE_MS;
    }

    function looksGenerating(root) {
      const t = (root && root.textContent) || '';
      return /Generating\s+(Custom\s+)?(Resume|Cover\s*Letter)/i.test(t);
    }

    /* Log resume/cover-letter tailoring phase transitions ONCE each per
       page so the debug viewer clearly shows whether OptimHire actually
       generated and we waited for the tailored doc (answers "is the
       tailored CV/cover letter working?"). */
    const _genPhase = new Map(); // url+kind → last phase logged
    function logTailorPhase(kind, phase, extra) {
      try {
        const key = location.href + '|' + kind;
        if (_genPhase.get(key) === phase) return;
        _genPhase.set(key, phase);
        if (_genPhase.size > 60) _genPhase.delete(_genPhase.keys().next().value);
        LOG(`Tailoring [${kind}]: ${phase}${extra ? ' — ' + extra : ''}`);
      } catch (_) {}
    }

    /* Resume editor: the tailored CV is ready when
         (a) substantial content is present (>1500 chars + 2 sections),
         (b) OptimHire is not still busy/generating, AND
         (c) the content signature has been STABLE for CONTENT_STABLE_MS
             (generation has stopped streaming text in).
       (c) is the key fix — without it we'd click while the default
       CV is still showing during generation. */
    function resumeContentReady() {
      const main = document.querySelector('main') || document.body;
      const t = (main.innerText || '').trim();
      if (t.length < 1500) return false;
      let marks = 0;
      ['summary','experience','education','skills','employment','work history']
        .forEach(function (m) { if (new RegExp('\\b' + m + '\\b','i').test(t)) marks++; });
      if (marks < 2) return false;
      if (looksGenerating(main)) { logTailorPhase('resume', 'generating tailored CV — waiting'); return false; }
      if (optimHireBusy()) return false;
      /* Signature = length + a sample of the text, so streaming edits
         change it until generation settles. */
      const sig = t.length + '|' + t.slice(0, 400) + '|' + t.slice(-400);
      const ready = contentStable('resume', sig);
      if (ready) logTailorPhase('resume', 'tailored CV ready', t.length + ' chars');
      return ready;
    }

    /* Cover letter: ready when the editor body has substantial text,
       OptimHire isn't generating, AND the text is stable. */
    function coverLetterContentReady() {
      const eds = document.querySelectorAll(
        'textarea, [contenteditable="true"], [contenteditable=""]'
      );
      let best = '';
      for (const ed of eds) {
        const t = (ed.value || ed.innerText || ed.textContent || '').trim();
        if (t.length > best.length) best = t;
      }
      if (best.length < 150) return false;
      if (looksGenerating(document.body)) { logTailorPhase('cover', 'generating cover letter — waiting'); return false; }
      if (optimHireBusy()) return false;
      const sig = best.length + '|' + best.slice(0, 400) + '|' + best.slice(-200);
      const ready = contentStable('cover', sig);
      if (ready) logTailorPhase('cover', 'cover letter ready', best.length + ' chars');
      return ready;
    }

    /* Find a visible+enabled button whose own text matches `re` */
    function findBtn(re) {
      const cands = document.querySelectorAll('button, [role="button"], a');
      for (const el of cands) {
        if (!el || _clicked.has(el)) continue;
        const txt = ((el.innerText || el.textContent || '') + '').trim();
        if (!txt || txt.length > 40) continue;
        if (!re.test(txt)) continue;
        if (!isVisible(el)) continue;
        if (el.disabled) continue;
        const ariaDis = el.getAttribute && el.getAttribute('aria-disabled');
        if (ariaDis === 'true') continue;
        return el;
      }
      return null;
    }

    /* Use the shared cached helper (1.5s TTL) instead of doing our
       own storage read on every tick. */
    /* Use the shared cached helper (declared at top of file) instead
       of doing our own storage read on every tick. */
    const automationActive = async () => !wdEngineOwns() && isAutomationActive();

    async function maybeClick(re, label) {
      if (!(await automationActive())) return;
      const btn = findBtn(re);
      if (!btn) return;
      /* Bail out while "Generating..." is still on screen — clicking the
         button before generation finishes either no-ops or saves an empty
         doc. Look for the indicator within the modal/page subtree. */
      const root = btn.closest('section, [role="dialog"], [class*="modal" i], ' +
                                '[class*="Modal" i], [class*="drawer" i], ' +
                                '[class*="Drawer" i], main, body') || document.body;
      if (looksGenerating(root)) return;

      /* First-sight click — visible+enabled check above is enough to
         know the button is ready. */
      _clicked.add(btn);
      LOG(`Auto-click: ${label}`);
      try { realClick(btn); } catch (_) { try { btn.click(); } catch (__) {} }
    }

    /* Detect "We couldn't fetch details for this resume right now"
       error state — both smart-quote (U+2019) and ASCII variants. */
    const FETCH_FAILED_RE = /couldn[’']?t\s+fetch\s+details\s+for\s+this\s+(resume|cover\s*letter)|fetch\s+details\s+for\s+this\s+(resume|cover\s*letter)\s+right\s+now/i;
    function fetchFailed() {
      const t = (document.body && document.body.innerText) || '';
      return FETCH_FAILED_RE.test(t.slice(0, 8000));
    }

    /* fetchFailed is only actionable if it's STABLE for at least
       FETCH_FAIL_STABLE_MS — otherwise transient loading states
       could trigger the "Use My Original Resume" fallback when the
       AI version would have arrived a moment later. */
    function fetchFailedStable() {
      const url = location.href;
      const now = Date.now();
      if (fetchFailed()) {
        if (!_fetchFailedSince.has(url)) {
          _fetchFailedSince.set(url, now);
          return false;
        }
        return now - _fetchFailedSince.get(url) >= FETCH_FAIL_STABLE_MS;
      }
      /* Error gone — reset tracking for this URL */
      _fetchFailedSince.delete(url);
      return false;
    }

    function elapsedOnPage() {
      const url = location.href;
      const now = Date.now();
      if (!_pageEnteredAt.has(url)) {
        _pageEnteredAt.set(url, now);
        if (_pageEnteredAt.size > 50) {
          _pageEnteredAt.delete(_pageEnteredAt.keys().next().value);
        }
        return 0;
      }
      return now - _pageEnteredAt.get(url);
    }

    /* T39 — Save & Next →  (only on optimhire.com resume editor)
       Order of operations:
         1. Wait minimum PAGE_SETTLE_MS so the fetch can start.
         2. If fetchFailed has been STABLE for 2s, fall back to
            "Use My Original Resume" — uses the uploaded CV.
         3. Otherwise wait until the AI-tailored CV is actually
            populated in the preview area (resumeContentReady).
         4. If MAX_WAIT_MS elapses with no content, click Save &
            Next anyway so the queue advances (better than stalling). */
    async function tickSaveNext() {
      if (!/optimhire\.com$/i.test(location.hostname) &&
          !/\.optimhire\.com$/i.test(location.hostname)) return;
      if (!(await automationActive())) return;

      const elapsed = elapsedOnPage();
      if (elapsed < PAGE_SETTLE_MS) return;

      /* Fetch-error fallback (only if stable, not transient) */
      if (fetchFailedStable()) {
        const orig = findBtn(/^Use\s+My\s+Original\s+Resume$/i);
        if (orig) {
          _clicked.add(orig);
          LOG('Resume fetch failed (stable) — clicking Use My Original Resume');
          try { realClick(orig); } catch (_) { try { orig.click(); } catch (__) {} }
          return;
        }
      }

      /* Wait for AI content to populate, OR force-click after MAX_WAIT */
      const ready = resumeContentReady();
      if (!ready && elapsed < MAX_WAIT_MS) return;
      if (!ready) LOG(`Save & Next: content not ready after ${MAX_WAIT_MS}ms — clicking anyway`);

      await maybeClick(/^Save\s*&\s*Next(\s*[→>›])?$/i, 'Save & Next →');
    }

    /* T40 — Apply Now  (any URL with the cover-letter modal)
       Same content-wait approach: only click once the cover letter
       editor has substantial text content, or after MAX_WAIT. */
    async function tickApplyNow() {
      if (!(await automationActive())) return;

      const btn = findBtn(/^Apply\s*Now$/i);
      if (!btn) return; // no modal open

      const elapsed = elapsedOnPage();
      if (elapsed < PAGE_SETTLE_MS) return;

      /* On optimhire.com domains, also honour stable fetchFailed */
      if (/optimhire\.com$/i.test(location.hostname) && fetchFailedStable()) {
        LOG('Cover-letter fetch failed (stable) — clicking Apply Now anyway');
        /* Cover letter is optional — proceed to apply */
      } else {
        const ready = coverLetterContentReady();
        if (!ready && elapsed < MAX_WAIT_MS) return;
        if (!ready) LOG(`Apply Now: cover-letter not ready after ${MAX_WAIT_MS}ms — clicking anyway`);
      }

      await maybeClick(/^Apply\s*Now$/i, 'Apply Now');
    }

    setInterval(tickSaveNext, POLL_MS);
    setInterval(tickApplyNow, POLL_MS);

    /* Also drive on DOM mutation so we react fast when the modal opens */
    function startObserver() {
      try {
        const obs = new MutationObserver(() => {
          tickSaveNext().catch(() => {});
          tickApplyNow().catch(() => {});
        });
        obs.observe(document.body, { childList: true, subtree: true });
      } catch (_) {}
    }
    if (document.body) startObserver();
    else document.addEventListener('DOMContentLoaded', startObserver);
  })();

  /* ── T41 / T42 / T43: End-to-end flow controller ─────────────────────────
   * T41 — Multi-step Next/Continue/Review advance. After the autofill has
   *       just finished on the current page (i.e. _fillActive flipped to
   *       false and stayed false for the settle window), click the
   *       intermediate-step advance button. Tracked per URL fingerprint
   *       so we don't double-advance the same step.
   * T42 — Already-applied / unsupported overlay quick-dismiss. If the
   *       OptimHire overlay (or the ATS page) reports the job is already
   *       applied / has no application / is unavailable, click the
   *       close/dismiss/got-it button to free the queue immediately.
   * T43 — Generic terminal-submit fallback. ATS-specific handlers do this
   *       on their domains; on unsupported ATSes, click the page's only
   *       sensible "Submit Application" button after fill is stable.
   *
   * All three gate on:
   *   - Active automation (csvActiveJobId / isAutoProcessStartJob /
   *     autoApplyStateUpdate.isRunning) — won't fire during idle browsing.
   *   - _fillActive false — never click while a fill pass is running.
   *   - Not within the 30s submit-suppression window — avoid double-submit.
   * ─────────────────────────────────────────────────────────────────────── */
  (function installFlowController() {
    const SETTLE_MS = 1_000;   // wait this long after fill stops before clicking
    const POLL_MS   =   400;
    const _clicked  = new WeakSet();
    const _dismissedFingerprints = new Set();

    /* Track when _fillActive transitions true → false without touching
       the existing transition points. _everFilledOnThisUrl flips true
       only AFTER a real fill pass completes — gates T41/T43 so they
       never click Next/Submit on a page autofill never analysed. */
    let _wasFilling = false;
    let _lastFillCompletedTs = 0;
    let _everFilledOnThisUrl = false;
    setInterval(() => {
      if (_wasFilling && !_fillActive) {
        _lastFillCompletedTs = Date.now();
        _everFilledOnThisUrl = true;
      }
      _wasFilling = _fillActive;
    }, 200);

    /* Use the shared cached helper (declared at top of file) — its
       1.5s cache covers our 400ms tick cadence without any storage
       reads on most ticks. */
    const automationActive = async () => !wdEngineOwns() && isAutomationActive();

    /* OptimHire filled the form itself (its own engine, not ours) and is
       now waiting for a human to press submit — the sidebar shows "Form
       filled" / "Review and submit the form" / "Form ready for
       submission". _everFilledOnThisUrl only flips for OUR fill passes,
       so on those jobs fillStable() stayed false and the generic
       terminal-submit (T43) never fired, which is why the user had to
       click Submit by hand on some ATSes. Treat OptimHire's own
       completed fill as an equally valid trigger. */
    let _ohReadyState = null;
    try {
      ST.get(['autoApplyState'], d => { _ohReadyState = d && d.autoApplyState; });
      chrome.storage.onChanged.addListener((c, a) => {
        if (a === 'local' && c.autoApplyState) _ohReadyState = c.autoApplyState.newValue;
      });
    } catch (_) {}

    const OH_READY_RE = /review and submit|form ready for submission|form filled|ready to submit/i;
    function optimHireFilledReady() {
      try {
        const st = _ohReadyState;
        if (!st || st.isActive !== true) return false;
        const msg = String(st.statusMessage || '');
        if (OH_READY_RE.test(msg)) return true;
        /* progress >= 90 with no outstanding missing-questions error also
           means its fill finished and it is holding at the submit step. */
        if (typeof st.progress === 'number' && st.progress >= 90 &&
            String(st.applicationState || '') !== 'missing-questions') return true;
        return false;
      } catch (_) { return false; }
    }
    /* Also catch the prompt rendered on the page/sidebar DOM itself. */
    function pageSaysReviewAndSubmit() {
      try {
        const t = (document.body && document.body.innerText || '').slice(0, 4000);
        return OH_READY_RE.test(t);
      } catch (_) { return false; }
    }

    function fillStable() {
      if (_fillActive) return false;
      if (!_everFilledOnThisUrl) {
        /* Not our fill — but if OptimHire finished filling and every
           visible required field is satisfied, the form is genuinely
           ready to submit, so allow the terminal-submit to proceed.
           requiredFieldsSatisfied() is vacuously true on a page with no
           required fields, so demand that a real, populated form is
           actually present before trusting this path. */
        if (!(optimHireFilledReady() || pageSaysReviewAndSubmit())) return false;
        if (!requiredFieldsSatisfied()) return false;
        const reqCount = $$(
          'input[required]:not([type=hidden]):not([type=submit]):not([type=button]),' +
          'input[aria-required="true"]:not([type=hidden]):not([type=submit]):not([type=button]),' +
          'textarea[required],textarea[aria-required="true"],' +
          'select[required],select[aria-required="true"]'
        ).filter(isVisible).length;
        return reqCount > 0;
      }
      if (Date.now() - _lastFillCompletedTs < SETTLE_MS) return false;
      return true;
    }

    /* Are all visible REQUIRED fields filled? Used to gate T41/T43 so
       we never advance/submit past a half-filled form even if fill
       reported completion. */
    function requiredFieldsSatisfied() {
      const reqs = $$(
        'input[required]:not([type=hidden]):not([type=submit]):not([type=button]),' +
        'input[aria-required="true"]:not([type=hidden]):not([type=submit]):not([type=button]),' +
        'textarea[required],textarea[aria-required="true"],' +
        'select[required],select[aria-required="true"]'
      ).filter(el => isVisible(el) && !isTrapField(el));
      for (const el of reqs) {
        if (el.type === 'checkbox' || el.type === 'radio') {
          /* For groups, check that at least one member of the same name
             is checked; that's good enough for required radio groups. */
          if (el.type === 'radio' && el.name) {
            const group = document.getElementsByName(el.name);
            if (![...group].some(r => r.checked)) return false;
          } else if (el.type === 'checkbox' && !el.checked) {
            return false;
          }
        } else if (el.tagName === 'SELECT') {
          if (!el.value) return false;
        } else if (isComboInput(el)) {
          /* A dropdown's search box is empty even when an option is chosen. */
          if (!comboSelectedText(el)) return false;
        } else if (!el.value || !el.value.trim()) {
          return false;
        }
      }
      return true;
    }

    function submitSuppressed() {
      return _submitAttempted && (Date.now() - _submitAttemptTs) < 30_000;
    }

    function pageFingerprint(extra) {
      /* URL + count of visible form controls — changes between steps */
      const ctrlCount = document.querySelectorAll(
        'input:not([type=hidden]),textarea,select'
      ).length;
      return location.href + '|' + ctrlCount + '|' + (extra || '');
    }

    function findBtnByText(re, scopeEl) {
      const root = scopeEl || document;
      const cands = root.querySelectorAll(
        'button, [role="button"], input[type="submit"], input[type="button"], a'
      );
      for (const el of cands) {
        if (!el || _clicked.has(el)) continue;
        if (el.disabled) continue;
        if (el.getAttribute && el.getAttribute('aria-disabled') === 'true') continue;
        if (!isVisible(el)) continue;
        const txt = ((el.innerText || el.value || el.textContent || '') + '')
                      .replace(/\s+/g, ' ').trim();
        if (!txt || txt.length > 60) continue;
        if (re.test(txt)) return el;
      }
      return null;
    }

    /* ── T41: Multi-step intermediate advance ── */
    const ADVANCE_RE = /^(next|continue|next\s+step|proceed|review|go\s+to\s+review|save\s+and\s+continue|save\s+&\s+continue|save\s+and\s+next|save\s+&\s+next|to\s+the\s+next\s+step)$/i;
    /* These are TERMINAL — don't click them in the intermediate pass
       (T43 / T27 handle them). Listed so ADVANCE_RE doesn't pick them up
       via partial overlap. */
    const TERMINAL_RE = /^(submit(\s+application)?|send\s+application|complete\s+application|finish(\s+application)?|apply\s+now|confirm\s+and\s+submit|submit\s+my\s+application)$/i;

    async function tickAdvance() {
      if (!await automationActive()) return;
      if (!fillStable() || submitSuppressed()) return;
      /* Don't advance unless every visible required field on this step
         is filled — preserves the analyse-and-fill behaviour that was
         working before. The advance click here is a navigation aid for
         AFTER autofill succeeded, never a way to skip past empty
         required fields. */
      if (!requiredFieldsSatisfied()) return;

      /* Don't advance if the page is still showing validation errors */
      const hasErrors = !!document.querySelector(
        '[aria-invalid="true"],.error,.is-invalid,[class*="field-error"],[class*="fieldError"],[role="alert"][class*="error" i]'
      );
      if (hasErrors) return;

      const btn = findBtnByText(ADVANCE_RE);
      if (!btn) return;
      const txt = ((btn.innerText || btn.textContent || '') + '').trim();
      if (TERMINAL_RE.test(txt)) return; // safety: never advance via a submit-looking word

      /* Per-fingerprint guard so we don't ping-pong on the same step */
      const fp = pageFingerprint('advance');
      if (_dismissedFingerprints.has(fp)) return;
      _dismissedFingerprints.add(fp);
      _clicked.add(btn);
      LOG(`Flow: clicking advance "${txt}"`);
      try { realClick(btn); } catch (_) { try { btn.click(); } catch (__) {} }
    }

    /* ── T42: Already-applied / unsupported quick-dismiss ── */
    const ALREADY_TEXT_RE = /(already\s+applied|application\s+already\s+submitted|you\s+have\s+already\s+applied|no\s+application\s+(form|available)|job\s+is\s+no\s+longer\s+available|this\s+position\s+is\s+closed|posting\s+is\s+closed|application\s+window\s+has\s+closed)/i;
    const DISMISS_RE = /^(ok|okay|got\s*it|close|dismiss|cancel|skip|next\s+job|continue)$/i;

    async function tickAlreadyApplied() {
      if (!await automationActive()) return;
      const bodyText = (document.body && document.body.innerText || '').slice(0, 4000);
      if (!ALREADY_TEXT_RE.test(bodyText)) return;

      /* Look for a close/dismiss button anywhere on the page first; if
         none, send a skipCurrent so the queue moves on. */
      const fp = pageFingerprint('alreadyApplied');
      if (_dismissedFingerprints.has(fp)) return;

      const btn = findBtnByText(DISMISS_RE);
      if (btn) {
        _dismissedFingerprints.add(fp);
        _clicked.add(btn);
        LOG('Flow: dismissing already-applied / unavailable card');
        try { realClick(btn); } catch (_) { try { btn.click(); } catch (__) {} }
        /* Also tell the queue to advance — even if the dismiss closes the
           modal, the underlying page might not navigate. */
        setTimeout(() => { requestSkipCurrent('already-applied dismissed'); }, 600);
        return;
      }
      /* No dismiss button found — just skip */
      _dismissedFingerprints.add(fp);
      LOG('Flow: already-applied detected, no dismiss button — skipping');
      requestSkipCurrent('already-applied, no dismiss button');
    }

    /* ── T43: Generic terminal-submit fallback ──
       Only runs when:
         - Fill has been stable for SETTLE_MS
         - No submit has been attempted in the last 30s
         - No validation errors are visible on the page
         - The page contains a button whose text matches a terminal pattern
       Marks _submitAttempted so the stuck watchdog doesn't fire. */
    /* Terminal-submit wording varies by ATS. Kept anchored (^…$) so it
       only matches a button whose ENTIRE label is a submit action, never
       something like "Submit a referral". Ashby/Workable/Greenhouse/
       Lever/iCIMS wording added so the user never has to press submit. */
    const T43_TERMINAL_RE = /^(submit\s+application|submit\s+your\s+application|send\s+application|send\s+my\s+application|submit\s+my\s+application|complete\s+application|finish\s+application|submit\s+&\s+apply|submit\s+and\s+apply|submit\s+profile|send\s+profile|submit)$/i;

    async function tickGenericSubmit() {
      if (autoSubmitBlockedHere()) return;   // user asked for fill-only here
      if (!await automationActive()) return;
      if (!fillStable() || submitSuppressed()) return;

      /* Don't run on the optimhire.com domain — the overlay/cover-letter
         flow already drives submit there via T39/T40. */
      if (/optimhire\.com$/i.test(location.hostname) ||
          /\.optimhire\.com$/i.test(location.hostname)) return;

      const hasErrors = !!document.querySelector(
        '[aria-invalid="true"],.error,.is-invalid,[class*="field-error"],[class*="fieldError"]'
      );
      if (hasErrors) return;

      const btn = findBtnByText(T43_TERMINAL_RE);
      if (!btn) return;
      /* Don't double-submit on the same step */
      const fp = pageFingerprint('submit');
      if (_dismissedFingerprints.has(fp)) return;
      _dismissedFingerprints.add(fp);
      _clicked.add(btn);
      LOG(`Flow: clicking terminal submit "${((btn.innerText||'')+'').trim()}"`);
      markSubmitAttempted();
      try { realClick(btn); } catch (_) { try { btn.click(); } catch (__) {} }
    }

    /* ── T44: Missing-required-fields skip ──
       If autofill ran but required fields are STILL not satisfied,
       OptimHire's overlay shows "Please fill the missing details and
       submit the form" with a 15-second countdown. The countdown does
       fire skipCurrent on its own timer in sidepanel-patch.js, but on
       sites where autofill genuinely cannot fill a field (uncommon
       knockout question with no profile data, etc.) we don't need to
       wait the full window — fire the skip MISSING_SKIP_MS after fill
       completes if required-fields-satisfied is still false. */
    const MISSING_SKIP_MS = 20_000;
    let _missingSkipFiredForUrl = '';
    async function tickMissingSkip() {
      if (!await automationActive()) return;
      if (_fillActive) return;
      if (!_everFilledOnThisUrl) return;
      if (submitSuppressed()) return;
      /* Never skip while OptimHire is mid-flow (generating cover
         letter, uploading CV, submitting) — a required field may be
         populated a moment later. */
      if (optimHireBusy()) return;
      if (_missingSkipFiredForUrl === location.href) return;
      /* Only if fill has been stable for long enough AND required
         fields are still not satisfied AND there ARE required fields
         (so we don't fire on empty pages or pages with no form). */
      if (Date.now() - _lastFillCompletedTs < MISSING_SKIP_MS) return;
      if (Date.now() - _ohActivityTs < 30_000 || _rescueBusy) return;   // OptimHire (or our rescue) still working
      const reqCount = $$(
        'input[required]:not([type=hidden]),input[aria-required="true"]:not([type=hidden]),' +
        'textarea[required],textarea[aria-required="true"],' +
        'select[required],select[aria-required="true"]'
      ).filter(isVisible).length;
      if (reqCount === 0) return;
      if (requiredFieldsSatisfied()) return;
      /* Skips are real now (OptimHire 2.9.0 ignored the old skipCurrent),
         so only skip when the SITE itself flags the form — our own reading
         can miss custom widgets, and a good job must never be skipped. */
      const siteFlagsForm = $$('[aria-invalid="true"],.error,.is-invalid,[class*="field-error"],[class*="fieldError"]')
        .some(el => isVisible(el) && !isPageChromeField(el));
      if (!siteFlagsForm) return;
      _missingSkipFiredForUrl = location.href;
      LOG(`Flow: missing required fields ${MISSING_SKIP_MS/1000}s after fill — skipCurrent`);
      requestSkipCurrent('required fields unsatisfied after fill');
    }

    /* URL-change resets the fingerprint cache, the per-URL fill flag,
       and the missing-skip flag so the next step is eligible again. */
    let _lastUrl = location.href;
    setInterval(() => {
      if (location.href !== _lastUrl) {
        _lastUrl = location.href;
        _dismissedFingerprints.clear();
        _everFilledOnThisUrl = false;
        _missingSkipFiredForUrl = '';
      }
    }, 500);

    setInterval(() => {
      tickAdvance().catch(() => {});
      tickAlreadyApplied().catch(() => {});
      tickGenericSubmit().catch(() => {});
      tickMissingSkip().catch(() => {});
    }, POLL_MS);

    function startObs() {
      try {
        const obs = new MutationObserver(() => {
          tickAlreadyApplied().catch(() => {});
        });
        obs.observe(document.body, { childList: true, subtree: true });
      } catch (_) {}
    }
    if (document.body) startObs();
    else document.addEventListener('DOMContentLoaded', startObs);
  })();

  /* ── T12: Auto-solve captchas ────────────────────────────── */
  async function solveCaptcha() {
    /* reCAPTCHA checkbox inside iframe */
    $$('iframe[src*="recaptcha"],iframe[src*="hcaptcha"]').forEach(f => {
      try {
        const cb = f.contentDocument?.querySelector('.recaptcha-checkbox,#recaptcha-anchor');
        if (cb && !cb.classList.contains('recaptcha-checkbox-checked')) realClick(cb);
      } catch (_) {}
    });

    /* Math captchas */
    $$('[class*="captcha"] input,[id*="captcha"] input,input[name*="captcha"]').forEach(inp => {
      const lbl = getLabel(inp);
      const m = lbl.match(/(\d+)\s*([\+\-\*x×÷\/])\s*(\d+)/);
      if (!m) return;
      const [, a, op, b] = m;
      const n1 = +a, n2 = +b;
      const ops = {
        '+': n1 + n2, '-': n1 - n2, '*': n1 * n2, 'x': n1 * n2,
        '×': n1 * n2, '/': n2 ? Math.round(n1 / n2) : null, '÷': n2 ? Math.round(n1 / n2) : null,
      };
      const result = ops[op];
      if (result !== null && result !== undefined) nativeSet(inp, String(result));
    });

    /* Simple "I'm not a robot" checkboxes */
    $$('input[type=checkbox][id*="captcha"],input[type=checkbox][name*="captcha"]')
      .filter(el => !el.checked).forEach(cb => realClick(cb));
  }

  /* v6.1: only run captcha solver when automation is active. Constantly
   * re-scanning every DOM change on every page caused CPU spikes and
   * slowed down regular browsing. Now: scan once on page load, plus
   * a debounced 6-second re-check while automation is active. */
  let _captchaTick = null;
  function scheduleCaptchaScan() {
    if (_captchaTick) return;
    _captchaTick = setTimeout(async () => {
      _captchaTick = null;
      const active = await isAutomationActive();
      if (!active && !_fillActive) return;
      try { solveCaptcha(); } catch (_) {}
    }, 6000);
  }
  new MutationObserver(scheduleCaptchaScan)
    .observe(document.body, { childList: true, subtree: true });
  // One-shot scan at load for pages that have a captcha already rendered
  isAutomationActive().then((active) => { if (active) solveCaptcha(); });

  /* ── T8: Workday comprehensive autofill (v4.0) ───────────── */
  /*
   * All data-automation-id values sourced from SpeedyApply reference.
   * Account creation uses appAccountEmail / appAccountPassword from storage.
   */
  const WD_FIELDS = {
    /* Personal info */
    legalNameSection_firstName:       'first_name',
    legalNameSection_lastName:        'last_name',
    legalNameSection_middleName:      'middle_name',
    infoFirstName:                    'first_name',
    infoLastName:                     'last_name',
    infoEmail:                        'email',
    infoCellPhone:                    'phone',
    infoLinkedIn:                     'linkedin_profile_url',
    email:                            'email',
    phone:                            'phone',
    /* Address */
    addressSection_addressLine1:      'address',
    addressSection_addressLine2:      'address2',
    addressSection_city:              'city',
    addressSection_postalCode:        'postal_code',
    addressSection_countryRegion:     'country',    // country combobox
    addressSection_stateProvince:     'state',      // state combobox
    /* Work history */
    workHistoryCompanyName:           'current_company',
    workHistoryPosition:              'current_title',
    workHistoryTitle:                 'current_title',
    workHistoryLocation:              'city',
    /* Education */
    educationHistoryName:             'school',
    educationHistorySchoolName:       'school',
    degree:                           'degree',
    educationHistoryDegree:           'degree',
    educationHistoryFieldOfStudy:     'major',
    /* Other */
    linkedIn:                         'linkedin_profile_url',
    website:                          'website_url',
    github:                           'github_url',
    jobTitle:                         'current_title',
    company:                          'current_company',
    school:                           'school',
    major:                            'major',
    postalCode:                       'postal_code',
    city:                             'city',
    state:                            'state',
    country:                          'country',
    yearsOfExperience:                'years_of_experience',
    salary:                           'expected_salary',
    coverLetter:                      'cover_letter',
    howDidYouHear:                    'how_did_you_hear',
    sourceQuestion:                   'how_did_you_hear',
    referralSource:                   'how_did_you_hear',
  };

  /* Workday textarea/description fields */
  const WD_TEXTAREA_AIDS = new Set([
    'formField-roleDescription',
    'formField-summary',
    'formField-coverLetter',
    'formField-additionalInfo',
    'formField-coverLetterText',
    'coverLetterText',
    'additionalInformation',
  ]);

  /* Workday navigation button automation IDs (in priority order) */
  const WD_NEXT_AIDS = [
    'pageFooterNextButton',
    'bottom-navigation-next-button',
    'btnNext',
    'nextButton',
  ];
  const WD_SUBMIT_AIDS = [
    'btnSubmit',
    'submitButton',
    'bottom-navigation-submit-button',
    'pageFooterSubmitButton',
  ];

  /** Fill one Workday combobox by typing the value and picking the best match */
  async function fillWorkdayCombo(combo, val) {
    if (!val) return;
    realClick(combo);
    await sleep(400);
    const si = $('input', combo) || (combo.tagName === 'INPUT' ? combo : null);
    if (si) {
      nativeSet(si, val);
      await sleep(800); // wait for dropdown to render
    }
    // Pick the best matching option
    const opts = $$('[role=option],[data-automation-id*="option"]').filter(isVisible);
    if (!opts.length) return;
    const vl = val.toLowerCase();
    const best = opts.find(o => o.textContent.toLowerCase().includes(vl))
      || opts.find(o => vl.includes(o.textContent.toLowerCase().trim()))
      || opts[0];
    if (best) { realClick(best); await sleep(300); }
  }

  async function workdayAutofill() {
    const isWD = HOST.includes('myworkdayjobs.com') || HOST.includes('workday.com') ||
      !!$('[data-automation-id]') || !!$('div[data-uxi-widget-type]');
    if (!isWD) return;

    const p = await getProfile();

    /* Step 1: Account creation / sign-in flow */
    await workdayAccountFlow();

    /* Steps 2–N: Workday is a multi-step wizard — fill each page then advance */
    let maxPages = 10;
    while (maxPages-- > 0) {
      await waitForFormStable(1500);
      await workdayFillCurrentPage(p);
      await workdayEeoFields(p);
      await workdayResumeUpload(p);

      /* Tick agreement checkboxes on this page */
      $$('[data-automation-id="agreementCheckbox"] input[type=checkbox],' +
         'input[type=checkbox][data-automation-id*="agree"],' +
         'input[type=checkbox][data-automation-id*="consent"]')
        .filter(cb => !cb.checked && isVisible(cb)).forEach(cb => realClick(cb));

      await sleep(400);

      /* In an OptimHire run its own engine walks the Workday steps (Next /
         Submit) after filling each one; pressing them here as well skipped
         pages it had not filled yet. */
      const drv = await ST.get(['isAutoProcessStartJob', 'isManuallyStartJob']);
      if (drv.isAutoProcessStartJob || drv.isManuallyStartJob) break;

      /* Try Submit first (final page) */
      let advanced = false;
      for (const aid of WD_SUBMIT_AIDS) {
        const btn = $(`[data-automation-id="${aid}"]`);
        if (btn && isVisible(btn)) {
          LOG(`Workday: clicking submit (${aid})`);
          realClick(btn);
          advanced = true;
          break;
        }
      }
      if (advanced) break;

      /* Try Next (intermediate page) */
      for (const aid of WD_NEXT_AIDS) {
        const btn = $(`[data-automation-id="${aid}"]`);
        if (btn && isVisible(btn)) {
          LOG(`Workday: clicking next (${aid})`);
          realClick(btn);
          advanced = true;
          await sleep(1500);
          break;
        }
      }
      if (!advanced) break; // no navigation button found — stop
    }

    LOG('Workday autofill done');
  }

  /** Fill all visible data-automation-id fields on the current Workday page */
  async function workdayFillCurrentPage(p) {
    const containers = $$('[data-automation-id]:not([data-automation-id=""])').filter(isVisible);
    for (const el of containers) {
      const aid = el.getAttribute('data-automation-id');

      /* Cover letter / description textareas */
      if (WD_TEXTAREA_AIDS.has(aid)) {
        const ta = $('textarea', el) || (el.tagName === 'TEXTAREA' ? el : null);
        if (ta && !ta.value?.trim()) {
          const val = p.cover_letter || DEFAULTS.cover;
          ta.focus(); nativeSet(ta, val);
        }
        continue;
      }

      const profileKey = WD_FIELDS[aid];
      if (!profileKey) continue;

      const val = p[profileKey]
        || (profileKey === 'years_of_experience' ? (koFacts().yearsExperience || DEFAULTS.years) : null)
        || (profileKey === 'expected_salary'      ? DEFAULTS.salary : null)
        || (profileKey === 'how_did_you_hear'     ? DEFAULTS.howHeard : null)
        || (profileKey === 'country'              ? (p.country || 'Ireland') : null);
      if (!val) continue;

      /* Plain text / number input */
      const input = $('input:not([type=hidden]):not([type=file]),textarea', el);
      if (input && !input.value?.trim()) {
        input.focus(); nativeSet(input, val); await sleep(80);
        continue;
      }

      /* Combobox (country, state, degree, etc.) */
      const combo = $('[role=combobox]', el) ||
                    $('[data-automation-id*="combobox"]', el) ||
                    (el.getAttribute('role') === 'combobox' ? el : null);
      if (combo && isVisible(combo)) {
        await fillWorkdayCombo(combo, val);
        continue;
      }

      /* Radio buttons */
      $$('input[type=radio]', el).forEach(r => {
        const t = ($(`label[for="${CSS.escape(r.id)}"]`)?.textContent || r.value || '').toLowerCase();
        if (t.includes(val.toLowerCase())) realClick(r);
      });
    }

    /* Generic questions section (free-text questionnaire fields Workday adds) */
    $$('[data-automation-id="questionAnswer"] input,' +
       '[data-automation-id*="questionnaire"] input,' +
       '[data-automation-id*="multipleChoice"] input,' +
       'fieldset[data-automation-id*="Question"] input').filter(isVisible).forEach(inp => {
      if (inp.value?.trim()) return;
      const lbl = getLabel(inp);
      const val = guessValue(lbl, p, inp.type || '');
      if (val) { inp.focus(); nativeSet(inp, val); }
    });

    /* Generic select dropdowns not covered by automation-id */
    $$('select').filter(isVisible).forEach(sel => {
      if (sel.value) return;
      const lbl = getLabel(sel);
      const val = guessValue(lbl, p);
      if (!val) return;
      const opt = bestSelectOption(sel, val);
      if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    });
  }

  /* ── Workday sign-in / account creation ─────────────────────────────
   * Every company's Workday site needs its own account. OptimHire only
   * checks whether you are already signed in there; if not it shows "Login
   * required" and skips the job — so Workday jobs were all skipped. Before
   * that check (oh-bg.js sends OH_WORKDAY_SIGN_IN first) this signs in, or
   * creates the account, with one e-mail and password used for every
   * Workday site: the Applications account if one is set, else your
   * OptimHire e-mail and a strong password made once and kept (shown in the
   * Queue Manager). A site that wants its e-mail link clicked first is
   * noted and skipped at once next time. */
  const WD_LOGIN_KEY = 'ohWorkdayLogin';
  const WD = s => $(`[data-automation-id="${s}"]`);
  const wdVisible = s => { const e = WD(s); return e && isVisible(e) ? e : null; };
  async function workdayCreds() {
    const [d, p] = await Promise.all([ST.get([WD_LOGIN_KEY, 'appAccountEmail', 'appAccountPassword']), getProfile()]);
    const login = Object.assign({ sites: {} }, d[WD_LOGIN_KEY] || {});
    if (!login.password) {
      /* ≥ 8 chars with upper, lower, digit and symbol — what Workday asks.
         (Same recipe as the Queue Manager's "Workday sign-in".) */
      const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
      const r = crypto.getRandomValues(new Uint32Array(12));
      login.password = d.appAccountPassword || ('Oh' + [...r].map(n => abc[n % abc.length]).join('') + '!7q');
      await ST.set({ [WD_LOGIN_KEY]: login });
    }
    return { email: login.email || d.appAccountEmail || p.email || '', password: login.password, login };
  }
  async function noteWorkdaySite(state) {
    try {
      const d = await ST.get([WD_LOGIN_KEY]);
      const login = Object.assign({ sites: {} }, d[WD_LOGIN_KEY] || {});
      const prev = (login.sites || {})[HOST] || {};     // merged: the site's own password / tries are kept
      login.sites = Object.assign({}, login.sites, { [HOST]: Object.assign({}, prev, { state, ts: Date.now() }) });
      await ST.set({ [WD_LOGIN_KEY]: login });
    } catch (_) {}
  }
  /* Workday's buttons sit under a transparent "click_filter" layer that
     takes the click. */
  function wdPress(btn) {
    if (!btn) return false;
    const filt = btn.querySelector('[data-automation-id="click_filter"]') ||
                 (btn.parentElement && btn.parentElement.querySelector('[data-automation-id="click_filter"]'));
    try { realClick(filt && isVisible(filt) ? filt : btn); } catch (_) { try { btn.click(); } catch (__) {} }
    return true;
  }
  const wdText = () => ((document.body && document.body.innerText) || '').slice(0, 6000);
  /* "Create Account" / "Sign In" switch links, by id or by their words. */
  function wdLink(to) {
    const byId = wdVisible(to === 'create' ? 'createAccountLink' : 'signInLink');
    if (byId) return byId;
    const re = to === 'create' ? /^create (an )?account$/i : /^sign in$/i;
    const all = $$('a,button,[role="button"]').filter(e => isVisible(e) && re.test((e.textContent || '').trim()) &&
      e.getAttribute('data-automation-id') !== 'click_filter' &&
      !e.closest('[data-automation-id="signInSubmitButton"],[data-automation-id="createAccountSubmitButton"],form[data-automation-id="signInFormo"]'));
    /* Not the page header's "Sign In" (it opens a different sign-in). */
    return all.find(e => !e.closest('header,nav,[role="banner"],[data-automation-id="header"]')) || null;
  }
  /* Newer Workday sites label their buttons only by text ("Create Account",
     "Sign In") and name the page in a heading; fields may carry no id but
     a label ("Email Address", "Verify New Password"). Both kinds are read. */
  function wdButtonByText(label) {
    const want = label.toLowerCase();
    const all = $$('button,[role="button"]').filter(b => isVisible(b) && (b.textContent || '').trim().toLowerCase() === want &&
      b.getAttribute('data-automation-id') !== 'click_filter');
    /* Not the header's own "Sign In" — unless it sits in the sign-in form. */
    return all.find(b => !b.closest('header,nav,[role="banner"],[data-automation-id="header"]') ||
                         b.closest('form,[data-automation-id*="signIn"],[data-automation-id*="auth"]')) || null;
  }
  function wdInputByLabel(re) {
    for (const l of $$('label').filter(isVisible)) {
      if (!re.test((l.textContent || '').trim())) continue;
      const byFor = l.getAttribute('for') && document.getElementById(l.getAttribute('for'));
      if (byFor && byFor.tagName === 'INPUT') return byFor;
      for (let n = l.nextElementSibling, i = 0; n && i < 3; n = n.nextElementSibling, i++) {
        const inp = n.tagName === 'INPUT' ? n : n.querySelector('input');
        if (inp) return inp;
      }
      const inner = l.parentElement && l.parentElement.querySelector('input');
      if (inner) return inner;
    }
    return null;
  }
  const wdField = (aid, labelRe, type) => {
    const byId = $(`input[data-automation-id="${aid}"]`);
    if (byId && isVisible(byId)) return byId;
    const byLabel = wdInputByLabel(labelRe);
    if (byLabel && isVisible(byLabel)) return byLabel;
    return type ? ($$(`input[type="${type}"]`).find(isVisible) || null) : null;
  };
  const wdEmailInput = () => wdField('email', /^e-?mail( address)?\*?$/i, 'email') ||
    $$('input[data-automation-id="emailAddress"],input[autocomplete="username"]').find(isVisible) || null;
  const wdPasswordInput = () => wdField('password', /^password\*?$/i, 'password');
  const wdVerifyInput = () => wdField('verifyPassword', /^verify (new )?password\*?$/i);
  function wdHeading() {
    const h = $('h2[id*="authViewTitle"],h1[id*="authViewTitle"]') || $$('h1,h2').find(isVisible);
    return ((h && h.textContent) || '').trim().toLowerCase();
  }
  /* 'create' / 'signin' when on that form, else ''. */
  function wdAuthPage() {
    if (wdVisible('createAccountSubmitButton') || wdVerifyInput()) return 'create';
    const form = $('form[data-automation-id="signInFormo"]');
    if (wdVisible('signInSubmitButton') || (form && isVisible(form))) return 'signin';
    if (!wdPasswordInput()) return '';
    /* Two password boxes next to one e-mail box = create; one = sign in. */
    const pwCount = $$('input[type="password"]').filter(isVisible).length;
    if (wdEmailInput() && pwCount === 2) return 'create';
    const h = wdHeading();
    if (/create account/.test(h)) return 'create';
    if (/sign in/.test(h) || wdButtonByText('Sign In')) return 'signin';
    if (wdEmailInput() && pwCount === 1) return 'signin';
    return '';
  }
  function wdSubmit(page) {
    if (page === 'create') return wdVisible('createAccountSubmitButton') || wdButtonByText('Create Account');
    const form = $('form[data-automation-id="signInFormo"]');
    return wdVisible('signInSubmitButton') ||
           (form && $('[data-automation-id="click_filter"]', form)) || wdButtonByText('Sign In');
  }
  function wdSignedIn() {
    if (wdAuthPage() || (wdEmailInput() && wdPasswordInput())) return false;
    if (/\/login\b|login\?redirect/i.test(location.href)) return false;
    if (wdVisible('applyManually') || wdVisible('autofillWithResume')) return false;
    /* The step bar's first step is "Create Account/Sign In" — the bar alone
       does not mean signed in; the step it is on does. */
    const step = $('[data-automation-id="progressBarActiveStep"]');
    if (step && isVisible(step)) {
      const t = (step.textContent || '').trim().toLowerCase();
      return !!t && !/create account|sign in/.test(t);
    }
    /* The step bar names several application steps at once, or the page
       already carries real Workday form fields. */
    const bar = $('[data-automation-id="progressBar"]');
    if (bar && isVisible(bar)) {
      const t = (bar.textContent || '').toLowerCase();
      if (['my information', 'my experience', 'application questions', 'voluntary disclosures', 'self identify', 'review']
            .filter(x => t.includes(x)).length >= 2 && !/create account|sign in/.test(((step && step.textContent) || '').toLowerCase())) return true;
    }
    if ($$('[data-automation-id^="formField-"]').filter(isVisible).length >= 3) return true;
    return !!(wdVisible('utilityMenuButton') || wdVisible('accountSettingsButton') ||
              wdVisible('pageFooterNextButton') || wdVisible('bottom-navigation-next-button') ||
              wdVisible('legalNameSection_firstName') || $('[data-automation-id^="applyFlow"]'));
  }
  const WD_VERIFY_RE = /verify your (e-?mail|account)|verification (e-?mail|link)|check your (e-?mail|inbox)|confirm your e-?mail|activate your account/i;
  const WD_EXISTS_RE = /already (exists|in use|registered|been used)|account with this e-?mail/i;
  const WD_BADPW_RE = /wrong e-?mail|incorrect|invalid (e-?mail|user|password|credentials)|doesn[’']?t (exist|match)|not (valid|recogni[sz]ed)|locked/i;

  let _wdSignIn = null;
  function workdaySignIn() {
    if (!_wdSignIn) _wdSignIn = runWorkdaySignIn().finally(() => { setTimeout(() => { _wdSignIn = null; }, 3000); });
    return _wdSignIn;
  }
  async function runWorkdaySignIn() {
    if (CURRENT_ATS !== 'Workday' && !/myworkday(jobs|site)\.com$/i.test(HOST)) return { ok: false, reason: 'not workday' };
    const creds = await workdayCreds();
    if (!creds.email || !creds.password) return { ok: false, reason: 'no e-mail for the Workday account' };
    const known = (creds.login.sites || {})[HOST] || {};
    if (known.state === 'verify' && Date.now() - known.ts < 7 * 864e5) return { ok: false, reason: 'this site wants its e-mail link clicked first' };
    let mode = known.state === 'account' ? 'signin' : 'create';   // a new site: create first, sign in if it exists
    let lastSubmit = 0, submits = 0, triedSignIn = false, triedCreate = false;
    const deadline = Date.now() + 60_000;
    LOG(`Workday: signing in on ${HOST} as ${creds.email}`);
    while (Date.now() < deadline) {
      await sleep(400);
      const t = wdText();
      if (wdSignedIn()) {
        await noteWorkdaySite('account');
        LOG('Workday: signed in');
        return { ok: true };
      }
      /* A CAPTCHA on the sign-in step: nothing we can do — skip now, don't wait. */
      if (wdAuthPage() && $$('iframe').some(fr => isVisible(fr) && /captcha|recaptcha|hcaptcha|turnstile/i.test(fr.src || ''))) {
        LOG('Workday: a CAPTCHA guards this sign-in — skipping');
        return { ok: false, reason: 'captcha' };
      }
      if (submits && WD_VERIFY_RE.test(t) && !wdVisible('createAccountSubmitButton') && !wdVisible('signInSubmitButton')) {
        await noteWorkdaySite('verify');
        LOG('Workday: this site wants the e-mail verified before applying — skipping it');
        return { ok: false, reason: 'e-mail verification needed' };
      }
      /* "Start Your Application": the form is filled by OptimHire, so apply manually. */
      const manual = wdVisible('applyManually');
      if (manual) { wdPress(manual); await sleep(1200); continue; }
      /* The job page's own Apply (then the chooser above opens). */
      const adv = wdVisible('adventureButton') || $('a[data-uxi-element-id="Apply_adventureButton"]') || wdVisible('continueButton');
      if (adv && isVisible(adv) && !wdPasswordInput()) { wdPress(adv); await sleep(1200); continue; }
      /* Some sites first ask how to sign in (Google / LinkedIn / e-mail). */
      const byEmail = wdButtonByText('Sign in with email');
      if (byEmail && !wdPasswordInput()) { wdPress(byEmail); await sleep(900); continue; }

      const page = wdAuthPage();
      const onCreate = page === 'create';
      const onSignIn = page === 'signin';
      if (!onCreate && !onSignIn) {
        /* A sign-in page that shows the other form's link only. */
        const link = wdLink(mode);
        if (link) { wdPress(link); await sleep(900); }
        continue;
      }
      const err = [...$$('[data-automation-id="errorMessage"],[role="alert"],[data-automation-id="inputAlert"]')]
        .filter(isVisible).map(e => e.textContent || '').join(' ');
      if (onCreate) {
        if (mode !== 'create' || (WD_EXISTS_RE.test(err) && submits)) {
          /* An account is there already: sign in instead (once). */
          if (triedSignIn) { await noteWorkdaySite('other-password'); return { ok: false, reason: 'an account exists with another password' }; }
          const link = wdLink('signin');
          mode = 'signin';
          if (link) { wdPress(link); await sleep(900); continue; }
        }
      } else if (mode !== 'signin' || (WD_BADPW_RE.test(err) && submits)) {
        /* No account yet (or a wrong password): create one (once). */
        if (triedCreate) { await noteWorkdaySite('other-password'); return { ok: false, reason: 'sign-in refused' }; }
        const link = wdLink('create');
        mode = 'create';
        if (link) { wdPress(link); await sleep(900); continue; }
      }
      if (Date.now() - lastSubmit < 5000) continue;          // give the last press time to land

      const email = wdEmailInput();
      const pws = $$('input[type="password"]').filter(isVisible);
      const pw = wdPasswordInput() || pws[0];
      const verify = wdVerifyInput() || (onCreate ? pws[1] : null);
      if (email && isVisible(email) && email.value.trim().toLowerCase() !== creds.email.toLowerCase()) { email.focus(); nativeSet(email, creds.email); await sleep(150); }
      if (pw && isVisible(pw) && pw.value !== creds.password) { pw.focus(); nativeSet(pw, creds.password); await sleep(150); }
      if (onCreate && verify && isVisible(verify) && verify !== pw && verify.value !== creds.password) { verify.focus(); nativeSet(verify, creds.password); await sleep(150); }
      if (onCreate) {
        const cb = $('input[type="checkbox"][data-automation-id="createAccountCheckbox"]') ||
                   $('[data-automation-id="createAccountCheckbox"] input[type="checkbox"]') ||
                   $$('input[type="checkbox"]').find(c => isVisible(c) && !c.checked &&
                     /agree|terms|privacy|consent|acknowledge/i.test(((c.closest('label,div') || {}).textContent || '')));
        if (cb && !cb.checked) { realClick(cb); await sleep(150); }
      }
      await sleep(300);
      wdPress(wdSubmit(onCreate ? 'create' : 'signin'));
      if (onCreate) triedCreate = true; else triedSignIn = true;
      lastSubmit = Date.now(); submits++;
      LOG(`Workday: ${onCreate ? 'creating the account' : 'signing in'}`);
    }
    return { ok: false, reason: 'timed out' };
  }
  try {
    chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
      if (!msg || msg.type !== 'OH_WORKDAY_SIGN_IN' || window.top !== window.self) return;
      workdaySignIn().then(r => reply(r), e => reply({ ok: false, reason: String(e && e.message || e) }));
      return true;
    });
  } catch (_) {}

  async function workdayAccountFlow() {
    /* Signed out on a Workday sign-in / create-account / "Start Your
       Application" page: the shared sign-in above does it (the same run as
       oh-bg.js's call, never two at once). */
    if (wdAuthPage() || wdVisible('applyManually')) await workdaySignIn();
  }

  async function workdayEeoFields(p) {
    /* Gender */
    const genderEl = $('[data-automation-id="gender"] select') ||
                     $('select[data-automation-id="gender"]');
    if (genderEl && !genderEl.value) {
      const opt = $$('option', genderEl).find(o =>
        /decline|prefer not|not to say/i.test(o.text)
      );
      if (opt) { genderEl.value = opt.value; genderEl.dispatchEvent(new Event('change', { bubbles: true })); }
    }

    /* Veteran status */
    const vetEl = $('[data-automation-id="veteranStatus"] select') ||
                  $('select[data-automation-id="veteranStatus"]');
    if (vetEl && !vetEl.value) {
      const opt = $$('option', vetEl).find(o =>
        /not a protected|i am not|decline|prefer not/i.test(o.text)
      );
      if (opt) { vetEl.value = opt.value; vetEl.dispatchEvent(new Event('change', { bubbles: true })); }
    }

    /* Disability */
    const disEl = $('[data-automation-id="disability"] select') ||
                  $('select[data-automation-id="disability"]');
    if (disEl && !disEl.value) {
      const opt = $$('option', disEl).find(o =>
        /do not have|decline|prefer not/i.test(o.text)
      );
      if (opt) { disEl.value = opt.value; disEl.dispatchEvent(new Event('change', { bubbles: true })); }
    }

    /* Ethnicity */
    const ethEl = $('[data-automation-id="ethnicityDropdown"] select') ||
                  $('select[data-automation-id="ethnicityDropdown"]');
    if (ethEl && !ethEl.value) {
      const opt = $$('option', ethEl).find(o =>
        /decline|prefer not|not to say/i.test(o.text)
      );
      if (opt) { ethEl.value = opt.value; ethEl.dispatchEvent(new Event('change', { bubbles: true })); }
    }
  }

  async function workdayResumeUpload(p) {
    if (!p.resume_url && !p.resumeUrl) return;
    const resumeUrl = p.resume_url || p.resumeUrl;

    /* Look for resume upload triggers */
    const uploadTriggers = [
      $('[data-automation-id="resumeUpload"]'),
      $('[data-automation-id="select-files"]'),
      $('[data-automation-id="file-upload-input-ref"]'),
      $('input[type=file][accept*="pdf"],input[type=file][accept*="doc"]'),
    ].filter(Boolean);

    if (uploadTriggers.length === 0) return;
    LOG('Workday: resume upload field found (URL-based upload not supported by browser extension)');
    /* Note: Actual file upload requires fetching the resume blob and creating a File object.
       This is handled separately via the background service worker if configured. */
  }

  /* ── T11: OracleCloud autofill ───────────────────────────── */
  async function oracleAutofill() {
    const isOracle = HOST.includes('oraclecloud.com') || HOST.includes('taleo.net') ||
      !!$('#OracleFusionApp,oracle-apply-flow');
    if (!isOracle) return;

    const p = await getProfile();
    const fields = [
      ['#firstName,input[id*="firstName"],input[name*="firstName"]', p.first_name],
      ['#lastName,input[id*="lastName"],input[name*="lastName"]',    p.last_name],
      ['input[type="email"],input[id*="email"]',                     p.email],
      ['input[type="tel"],input[id*="phone"],input[name*="phone"]',  p.phone],
      ['input[id*="city"],input[name*="city"]',                      p.city],
      ['input[id*="zip"],input[name*="postal"]',                     p.postal_code],
    ];
    for (const [sel, val] of fields) {
      if (!val) continue;
      const el = $(sel);
      if (el && isVisible(el)) { el.focus(); nativeSet(el, val); await sleep(60); }
    }
    LOG('Oracle autofill done');
  }

  /* ── T11: SmartRecruiters autofill ───────────────────────── */
  async function srAutofill() {
    const isSR = HOST.includes('smartrecruiters.com') ||
      !!$('[data-qa*="smartrecruiter"],.smartrecruiters-form,#smartrecruiters-widget');
    if (!isSR) return;

    const p = await getProfile();
    const fields = [
      ['input[name="first_name"],#firstName',      p.first_name],
      ['input[name="last_name"],#lastName',         p.last_name],
      ['input[name="email"],input[type="email"]',   p.email],
      ['input[name="phone"],input[type="tel"]',     p.phone],
      ['input[name="city"]',                        p.city],
      ['input[name="web"],input[name="website"]',   p.website_url],
      ['textarea[name="message"],textarea[name="cover_letter"]', p.cover_letter || DEFAULTS.cover],
    ];
    for (const [sel, val] of fields) {
      if (!val) continue;
      const el = $(sel);
      if (el && isVisible(el)) { el.focus(); nativeSet(el, val); await sleep(60); }
    }
    LOG('SmartRecruiters autofill done');
  }

  /* ── T5: Indeed "Apply on company site" ─────────────────── */
  function handleIndeed() {
    if (!HOST.includes('indeed.com')) return;
    /* Only for OUR CSV queue's job, in that job's tab. It ran on every
       Indeed page, on every change of the page, and pressed "Apply now" /
       dialog buttons while the user was just browsing. OptimHire's own runs
       apply on Indeed themselves. */
    let _busy = false;
    const click = async () => {
      if (_busy) return;
      _busy = true;
      try {
        const q = await ST.get(['csvActiveJobId', 'ohJobQueueActive']);
        if (!(q.csvActiveJobId || q.ohJobQueueActive) || !(await isAutomationActive()) || !(await isActiveJobTab())) return;
        clickNow();
      } finally { _busy = false; }
    };
    const clickNow = () => {
      const btn = $$('button,a').find(el =>
        /apply on company site|apply externally|apply now/i.test(el.textContent) ||
        el.getAttribute('data-testid') === 'company-site-apply-button'
      );
      if (btn) { LOG('Indeed: clicking Apply on company site'); realClick(btn); }

      const confirm = $$('button').find(el =>
        /continue|proceed|yes|ok/i.test(el.textContent) &&
        el.closest('[class*="modal"],[class*="dialog"],[role="dialog"]')
      );
      if (confirm) realClick(confirm);
    };
    setTimeout(click, 1500);
    setInterval(click, 2000);
  }
  handleIndeed();

  /* ── T6: LinkedIn Easy Apply + direct apply ──────────────── */
  function handleLinkedIn() {
    if (!HOST.includes('linkedin.com')) return;
    // Only activate on the jobs domain — not on feeds, profiles, or messaging
    if (!location.pathname.startsWith('/jobs')) return;

    let _linkedInActing = false;
    const act = async () => {
      if (_linkedInActing) return;
      _linkedInActing = true;
      try {
        /* Our CSV queue's job only, in that job's tab — it pressed Apply /
           Easy Apply on any LinkedIn jobs page the user was looking at. */
        const q = await ST.get(['csvActiveJobId', 'ohJobQueueActive']);
        if (!(q.csvActiveJobId || q.ohJobQueueActive) || !(await isAutomationActive()) || !(await isActiveJobTab())) return;
        const direct = $$('.jobs-apply-button,.apply-button,[data-control-name*="apply"]')
          .find(el => {
            const t = el.textContent.trim().toLowerCase();
            return t.includes('apply') && !t.includes('easy');
          });
        if (direct) { LOG('LinkedIn: direct apply'); realClick(direct); return; }

        const easy = $$('.jobs-apply-button,[aria-label*="Easy Apply"]')
          .find(el => /easy apply/i.test(el.textContent));
        if (easy) {
          LOG('LinkedIn: Easy Apply');
          realClick(easy);
          await sleep(1500);
          await fillLinkedInModalFull();
        }
      } finally {
        setTimeout(() => { _linkedInActing = false; }, 3000);
      }
    };

    setTimeout(act, 2000);
    new MutationObserver(act).observe(document.body, { childList: true, subtree: false });
  }

  async function fillLinkedInModal() {
    const modal = $('[data-test-modal],.jobs-easy-apply-modal,[aria-modal="true"]');
    if (!modal) return;
    await autoFillPage();
    await sleep(500);
    const nextBtn = $$('button', modal).find(el =>
      isVisible(el) && /next|continue|submit|review/i.test(el.textContent)
    );
    if (nextBtn) realClick(nextBtn);
  }
  handleLinkedIn();

  /* ── T10: HiringCafe navigation ──────────────────────────── */
  const GOOD_SIZES = [
    '51-200','201-500','501-1000','501-1,000','1001-2000','1,001-2,000',
    '2001-5000','2,001-5,000','5001-10000','5,001-10,000','10001+','10,001+',
    '51 to 200','201 to 500','501 to 1000',
  ];

  function handleHiringCafe() {
    if (!HOST.includes('hiring.cafe')) return;

    // FIX (hiring.cafe crashes): the listings/search page renders thousands
    // of job cards via lazy scroll, so an unthrottled MutationObserver that
    // scans every <a>/<button> on each mutation makes the page unresponsive.
    // Only run on a single job's detail view, and only when automation is
    // active. Bail out on the search/home page entirely.
    const path = location.pathname || '/';
    const isJobDetail = /\/job\//i.test(path) || /\/jobs?\//i.test(path);
    if (!isJobDetail) return;
    // idle browsing — do nothing (avoid scanning/observing during plain browsing)
    if (!_fillActive) return;

    const sizeEl = $$('[class*="size"],[class*="employees"],[data-field*="size"]')
      .find(el => /\d/.test(el.textContent));
    if (sizeEl) {
      const txt = sizeEl.textContent.replace(/\s/g, '');
      const ok = GOOD_SIZES.some(s => txt.includes(s.replace(/\s/g, '')));
      if (!ok) {
        LOG('HiringCafe: company size not preferred — skipping');
        chrome.runtime.sendMessage({ type: 'JOB_SKIPPED', reason: 'company_size' }).catch(() => {});
        return;
      }
    }

    let clicked = false;
    let observer = null;
    let throttleTimer = null;
    const tryClick = () => {
      if (clicked) return;
      const btn = $$('a,button').find(el =>
        /apply directly|apply now|apply for this/i.test(el.textContent)
      );
      if (btn) {
        clicked = true;
        LOG('HiringCafe: Apply Directly');
        realClick(btn);
        if (observer) { observer.disconnect(); observer = null; }
      }
    };
    const scheduled = () => {
      if (clicked || throttleTimer) return;
      throttleTimer = setTimeout(() => { throttleTimer = null; tryClick(); }, 1500);
    };
    setTimeout(tryClick, 2000);
    observer = new MutationObserver(scheduled);
    observer.observe(document.body, { childList: true, subtree: true });
    // hard stop: never run longer than 30s, regardless of outcome
    setTimeout(() => { if (observer) { observer.disconnect(); observer = null; } }, 30000);
  }
  handleHiringCafe();

  /* ── Ashby autofill ──────────────────────────────────────── */
  async function ashbyAutofill() {
    if (CURRENT_ATS !== 'Ashby') return;
    const p = await getProfile();
    LOG('Ashby: filling');

    // Ashby uses semantic input names and data attributes
    const ASHBY_MAP = {
      '_systemfield_name':      () => `${p.first_name||''} ${p.last_name||''}`.trim(),
      '_systemfield_email':     () => p.email,
      '_systemfield_phone':     () => p.phone,
      '_systemfield_linkedin':  () => p.linkedin_profile_url,
      '_systemfield_github':    () => p.github_url,
      '_systemfield_website':   () => p.website_url,
      '_systemfield_location':  () => `${p.city||''}, ${p.country||''}`.replace(/^, |, $/,''),
    };
    for (const [name, valFn] of Object.entries(ASHBY_MAP)) {
      const el = $(`input[name="${name}"],textarea[name="${name}"]`);
      if (el && isVisible(el) && !el.value?.trim()) {
        const v = valFn();
        if (v) { el.focus(); nativeSet(el, v); await sleep(50); }
      }
    }

    // Generic fallback for Ashby custom fields
    await autoFillPage();
    await sleep(500);

    // Try to click continue/next on single-page Ashby forms
    const submitBtn = $$('button[type="submit"],button').find(el =>
      isVisible(el) && /submit|apply|send.*application/i.test(el.textContent)
    );
    if (submitBtn && !autoSubmitBlockedHere()) { await sleep(400); realClick(submitBtn); }
  }

  /* ── BambooHR autofill ───────────────────────────────────── */
  async function bambooAutofill() {
    if (CURRENT_ATS !== 'BambooHR') return;
    const p = await getProfile();
    LOG('BambooHR: filling');

    const BAMBOO_MAP = {
      'firstName':     p.first_name,
      'lastName':      p.last_name,
      'email':         p.email,
      'phone':         p.phone,
      'address':       p.street,
      'city':          p.city,
      'state':         p.state,
      'zip':           p.postal_code,
      'country':       p.country,
      'linkedInUrl':   p.linkedin_profile_url,
      'websiteUrl':    p.website_url,
      'coverLetter':   p.cover_letter || DEFAULTS.cover,
    };
    for (const [name, val] of Object.entries(BAMBOO_MAP)) {
      if (!val) continue;
      const el = $(`input[name="${name}"],textarea[name="${name}"],input[id*="${name}"],textarea[id*="${name}"]`);
      if (el && isVisible(el) && !el.value?.trim()) {
        el.focus(); nativeSet(el, val); await sleep(50);
      }
    }
    await autoFillPage();
  }

  /* ── Jobvite autofill ────────────────────────────────────── */
  async function jobviteAutofill() {
    if (CURRENT_ATS !== 'Jobvite') return;
    const p = await getProfile();
    LOG('Jobvite: filling');

    const JOBVITE_MAP = [
      ['input[id*="first"],input[name*="first"],input[placeholder*="First"]',  p.first_name],
      ['input[id*="last"],input[name*="last"],input[placeholder*="Last"]',     p.last_name],
      ['input[type="email"],input[id*="email"],input[name*="email"]',          p.email],
      ['input[type="tel"],input[id*="phone"],input[name*="phone"]',            p.phone],
      ['input[id*="city"],input[name*="city"]',                                p.city],
      ['input[id*="linkedin"],input[name*="linkedin"]',                        p.linkedin_profile_url],
      ['input[id*="website"],input[name*="website"]',                          p.website_url],
      ['textarea[id*="cover"],textarea[name*="cover"]',                        p.cover_letter || DEFAULTS.cover],
    ];
    for (const [sel, val] of JOBVITE_MAP) {
      if (!val) continue;
      const el = $$(sel).find(e => isVisible(e) && !e.value?.trim());
      if (el) { el.focus(); nativeSet(el, val); await sleep(50); }
    }
    await autoFillPage();
  }

  /* ── Improved LinkedIn Easy Apply (multi-step) ───────────── */
  async function fillLinkedInModalFull() {
    const modal = $('[data-test-modal],.jobs-easy-apply-modal,[aria-modal="true"]');
    if (!modal) return;

    let maxPages = 8; // guard against infinite loops
    while (maxPages-- > 0) {
      await sleep(800);
      await autoFillPage();
      await sleep(500);

      // Look for next/continue button FIRST, submit last
      const next = $$('button', modal).find(el =>
        isVisible(el) && /next|continue/i.test(el.textContent)
      );
      if (next) { realClick(next); await sleep(1200); continue; }

      const review = $$('button', modal).find(el =>
        isVisible(el) && /review/i.test(el.textContent)
      );
      if (review) { realClick(review); await sleep(1200); continue; }

      const submit = $$('button', modal).find(el =>
        isVisible(el) && /submit|send application/i.test(el.textContent)
      );
      if (submit) { realClick(submit); break; }

      break; // no recognisable button — stop
    }
  }

  /* ── Workable autofill ───────────────────────────────────── */
  async function workableAutofill() {
    if (CURRENT_ATS !== 'Workable') return;
    const p = await getProfile();
    LOG('Workable: filling');

    // Workable uses name/id attributes and aria-labels
    const WBL_MAP = [
      // Personal info fields
      ['input[name="firstname"],input[id*="firstname"],input[name*="first_name"],input[placeholder*="First name"]',
        p.first_name],
      ['input[name="lastname"],input[id*="lastname"],input[name*="last_name"],input[placeholder*="Last name"]',
        p.last_name],
      ['input[type="email"],input[name="email"],input[id*="email"]',
        p.email],
      ['input[type="tel"],input[name="phone"],input[id*="phone"]',
        p.phone],
      // Location
      ['input[name="city"],input[id*="city"],input[placeholder*="City"]',
        p.city],
      ['input[name="country"],input[id*="country"]',
        p.country || 'Ireland'],
      // Professional
      ['input[name="headline"],input[id*="headline"],input[placeholder*="Headline"],input[placeholder*="headline"]',
        p.current_title || ''],
      ['input[name="summary"],textarea[name="summary"],input[id*="summary"]',
        p.summary || ''],
      // Social URLs
      ['input[name="linkedin"],input[id*="linkedin"],input[placeholder*="LinkedIn"]',
        p.linkedin_profile_url || ''],
      ['input[name="github"],input[id*="github"],input[placeholder*="GitHub"]',
        p.github_url || ''],
      ['input[name="website"],input[id*="website"],input[placeholder*="Website"],input[placeholder*="portfolio"]',
        p.website_url || ''],
      // Cover letter / summary textarea
      ['textarea[name="cover_letter"],textarea[id*="cover"],textarea[placeholder*="cover"]',
        p.cover_letter || DEFAULTS.cover],
      ['textarea[name="summary"],textarea[id*="summary"],textarea[placeholder*="summary"],textarea[placeholder*="Summary"]',
        p.summary || DEFAULTS.cover],
    ];

    for (const [sel, val] of WBL_MAP) {
      if (!val) continue;
      /* The phone's country picker has its own search box ("country…",
         "phone-country"): typing "Ireland" or the number into it reset the
         phone field. Only real fields, never the picker's parts. */
      const el = $$(sel).find(e => isVisible(e) && !e.value?.trim() && !isComboInput(e) &&
        (val === p.phone ? isPhoneInput(e) && !/country|dial|code|search/i.test(`${e.name || ''} ${e.id || ''}`)
                         : !inPhoneWidget(e)));
      if (el) { el.focus(); nativeSet(el, val); await sleep(50); }
    }

    // Handle Workable custom question dropdowns and radio buttons
    await autoFillPage();

    /* Workable's button reads "Submit application". (/apply/ also hit
       "Apply with LinkedIn / Indeed", which leaves the form.) */
    const submitBtn = $$('button').find(el =>
      isVisible(el) && /^\s*submit(\s+(your|my))?(\s+application)?\s*$/i.test(el.textContent || '')
    );
    if (submitBtn && !autoSubmitBlockedHere()) { await sleep(400); realClick(submitBtn); }

    LOG('Workable autofill done');
  }

  /* ── Lever autofill (targeted field IDs) ────────────────── */
  async function leverAutofill() {
    if (CURRENT_ATS !== 'Lever') return;
    const p = await getProfile();
    LOG('Lever: filling');

    const LEVER_MAP = {
      'name':        `${p.first_name||''} ${p.last_name||''}`.trim(),
      'email':       p.email,
      'phone':       p.phone,
      'org':         p.current_company,
      'urls[LinkedIn]': p.linkedin_profile_url,
      'urls[GitHub]':   p.github_url,
      'urls[Portfolio]':p.website_url,
      'urls[Twitter]':  p.twitter_url,
    };
    for (const [name, val] of Object.entries(LEVER_MAP)) {
      if (!val) continue;
      const el = $(`input[name="${name}"],textarea[name="${name}"]`);
      if (el && isVisible(el) && !el.value?.trim()) {
        el.focus(); nativeSet(el, val); await sleep(60);
      }
    }

    // Cover letter textarea
    const cl = $$('textarea').find(el => isVisible(el) &&
      /cover|motivation|additional/i.test(getLabel(el)));
    if (cl && !cl.value?.trim()) {
      nativeSet(cl, p.cover_letter || DEFAULTS.cover);
    }

    await autoFillPage();
  }

  /* ── iCIMS autofill ─────────────────────────────────────────── */
  async function icimsAutofill() {
    const isICIMS = HOST.includes('icims.com') || !!$('[class*="icims"],[id*="icims"],form[action*="icims"]');
    if (!isICIMS) return;
    const p = await getProfile();
    LOG('iCIMS: filling');

    const ICIMS_MAP = [
      ['input[id*="firstname"],input[name*="firstname"],input[id*="first_name"],input[name*="first_name"]', p.first_name],
      ['input[id*="lastname"],input[name*="lastname"],input[id*="last_name"],input[name*="last_name"]',     p.last_name],
      ['input[type="email"],input[id*="email"],input[name*="email"]',                                      p.email],
      ['input[type="tel"],input[id*="phone"],input[name*="phone"],input[id*="cellphone"]',                 p.phone],
      ['input[id*="address1"],input[name*="address1"],input[id*="street"]',                               p.street || ''],
      ['input[id*="city"],input[name*="city"]',                                                            p.city],
      ['input[id*="zip"],input[id*="postal"],input[name*="zip"]',                                         p.postal_code || ''],
      ['input[id*="linkedin"],input[name*="linkedin"]',                                                    p.linkedin_profile_url || ''],
      ['textarea[id*="cover"],textarea[name*="cover"],textarea[id*="summary"]',                            p.cover_letter || DEFAULTS.cover],
    ];
    for (const [sel, val] of ICIMS_MAP) {
      if (!val) continue;
      const el = $$(sel).find(e => isVisible(e) && !e.value?.trim());
      if (el) { el.focus(); nativeSet(el, val); await sleep(50); }
    }

    // iCIMS dropdowns
    $$('select').filter(isVisible).forEach(sel => {
      if (sel.value) return;
      const lbl = getLabel(sel);
      const val = guessValue(lbl, p);
      const opt = val ? bestSelectOption(sel, val) : null;
      if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    });

    await autoFillPage();
    LOG('iCIMS autofill done');
  }

  /* ── Paylocity autofill ──────────────────────────────────────── */
  async function paylocityAutofill() {
    const isPaylocity = HOST.includes('paylocity.com') || !!$('[class*="paylocity"],form[action*="paylocity"]');
    if (!isPaylocity) return;
    const p = await getProfile();
    LOG('Paylocity: filling');

    const PAY_MAP = [
      ['input[id*="FirstName"],input[name*="FirstName"],input[placeholder*="First Name"]', p.first_name],
      ['input[id*="LastName"],input[name*="LastName"],input[placeholder*="Last Name"]',     p.last_name],
      ['input[type="email"],input[id*="Email"],input[name*="Email"]',                       p.email],
      ['input[type="tel"],input[id*="Phone"],input[name*="Phone"]',                         p.phone],
      ['input[id*="City"],input[name*="City"]',                                             p.city],
      ['input[id*="Zip"],input[id*="PostalCode"],input[name*="Zip"]',                      p.postal_code || ''],
      ['input[id*="LinkedIn"],input[name*="LinkedIn"]',                                    p.linkedin_profile_url || ''],
      ['textarea[id*="CoverLetter"],textarea[id*="Summary"]',                               p.cover_letter || DEFAULTS.cover],
    ];
    for (const [sel, val] of PAY_MAP) {
      if (!val) continue;
      const el = $$(sel).find(e => isVisible(e) && !e.value?.trim());
      if (el) { el.focus(); nativeSet(el, val); await sleep(50); }
    }
    await autoFillPage();
    LOG('Paylocity autofill done');
  }

  /* ── JazzHR autofill ─────────────────────────────────────────── */
  async function jazzhrAutofill() {
    const isJazzHR = HOST.includes('jazzhr.com') || HOST.includes('resumatorapi.com') || HOST.includes('applytojob.com') ||
      !!$('[class*="jazzhr"],form[class*="jazz"],#apply-form');
    if (!isJazzHR) return;
    const p = await getProfile();
    LOG('JazzHR: filling');

    const JAZZ_MAP = [
      ['input[id="first_name"],input[name="first_name"]',    p.first_name],
      ['input[id="last_name"],input[name="last_name"]',       p.last_name],
      ['input[id="email"],input[name="email"],input[type="email"]', p.email],
      ['input[id="phone"],input[name="phone"],input[type="tel"]',   p.phone],
      ['input[id="location"],input[name="location"]',         `${p.city||''}, ${p.country||''}`.replace(/^, |, $/,'')],
      ['input[id="linkedin"],input[name="linkedin"]',         p.linkedin_profile_url || ''],
      ['input[id="website"],input[name="website"]',           p.website_url || ''],
      ['textarea[id="cover_letter"],textarea[name="cover_letter"]', p.cover_letter || DEFAULTS.cover],
    ];
    for (const [sel, val] of JAZZ_MAP) {
      if (!val) continue;
      const el = $(sel);
      if (el && isVisible(el) && !el.value?.trim()) { el.focus(); nativeSet(el, val); await sleep(50); }
    }
    await autoFillPage();
    LOG('JazzHR autofill done');
  }

  /* ── Teamtailor autofill ─────────────────────────────────────── */
  async function teamtailorAutofill() {
    const isTT = HOST.includes('teamtailor.com') || !!$('[class*="teamtailor"],[data-teamtailor]');
    if (!isTT) return;
    const p = await getProfile();
    LOG('Teamtailor: filling');

    const TT_MAP = [
      ['input[name="candidate[first_name]"],input[id*="first_name"]', p.first_name],
      ['input[name="candidate[last_name]"],input[id*="last_name"]',   p.last_name],
      ['input[name="candidate[email]"],input[type="email"]',          p.email],
      ['input[name="candidate[phone]"],input[type="tel"]',            p.phone],
      ['input[name="candidate[linkedin_url]"],input[id*="linkedin"]', p.linkedin_profile_url || ''],
      ['input[name="candidate[website]"],input[id*="website"]',       p.website_url || ''],
      ['textarea[name="candidate[pitch]"],textarea[id*="pitch"],textarea[id*="cover"]', p.cover_letter || DEFAULTS.cover],
    ];
    for (const [sel, val] of TT_MAP) {
      if (!val) continue;
      const el = $(sel);
      if (el && isVisible(el) && !el.value?.trim()) { el.focus(); nativeSet(el, val); await sleep(50); }
    }
    await autoFillPage();
    LOG('Teamtailor autofill done');
  }

  /* ── waitForFormStable — wait until DOM stops changing ──────
   * Waits up to `timeout` ms for the form to stop mutating, then
   * resolves.  Prevents filling fields that are still being added
   * by React / SPA routing.                                       */
  function waitForFormStable(timeout = 3000) {
    return new Promise(resolve => {
      let timer = null;
      const mo = new MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(() => { mo.disconnect(); resolve(); }, 300);
      });
      mo.observe(document.body, { childList: true, subtree: true, attributes: false });
      // Also resolve after max timeout regardless
      setTimeout(() => { mo.disconnect(); resolve(); }, timeout);
      // Kick off initial timer in case DOM is already stable
      timer = setTimeout(() => { mo.disconnect(); resolve(); }, 300);
    });
  }

  /* ── T9: Deduplication ───────────────────────────────────── */
  function normalizeUrl(url) {
    try {
      const u = new URL(url);
      ['utm_source','utm_medium','utm_campaign','ref','referer','source','fbclid']
        .forEach(p => u.searchParams.delete(p));
      return u.origin + u.pathname;
    } catch (_) { return url; }
  }

  async function markApplied() {
    const norm = normalizeUrl(location.href);
    const { appliedJobs = [] } = await ST.get('appliedJobs');
    if (!appliedJobs.includes(norm)) {
      appliedJobs.push(norm);
      if (appliedJobs.length > 15_000) appliedJobs.shift();
      await ST.set({ appliedJobs });
    }
  }

  /* ── T7/T15: Freshness badges on job cards ───────────────── */
  function parseRelTime(txt) {
    txt = (txt || '').toLowerCase().trim();
    const now = Date.now();
    if (/just now|moments? ago/.test(txt)) return new Date(now - 60_000);
    if (/today/.test(txt))                 return new Date(now - 3_600_000);
    const m = txt.match(/(\d+)\s+(minute|hour|day|week|month)/);
    if (!m) return null;
    const mults = {
      minute: 60_000, hour: 3_600_000, day: 86_400_000,
      week: 604_800_000, month: 2_592_000_000,
    };
    return new Date(now - +m[1] * (mults[m[2]] || 86_400_000));
  }

  function addFreshBadge(el) {
    if (!el || el.querySelector('.oh-fresh')) return;
    const timeEl = el.querySelector('time,[datetime],[data-posted],[class*="posted"],[class*="date"]');
    let date = null;
    if (timeEl) {
      const dt = timeEl.getAttribute('datetime') || timeEl.getAttribute('data-posted');
      date = dt ? new Date(dt) : parseRelTime(timeEl.textContent);
    }
    if (!date) {
      const m = el.textContent.match(/(\d+)\s+(minute|hour|day|week|month)s?\s+ago|just\s+now|today/i);
      if (m) date = parseRelTime(m[0]);
    }
    if (!date || isNaN(date)) return;
    const age = Date.now() - date.getTime();
    let text = '', color = '';
    if      (age < 30 * 60_000)    { text = '🔥 Just Posted';   color = '#ef4444'; }
    else if (age < 86_400_000)     { text = '✨ Fresh (< 24h)'; color = '#22c55e'; }
    else if (age < 3 * 86_400_000) { text = '📅 Recent (< 3d)'; color = '#3b82f6'; }
    else return;
    const badge = document.createElement('span');
    badge.className = 'oh-fresh';
    badge.textContent = text;
    /* Layout-safe styling. A plain inline-block span becomes a FLEX ITEM
       when the host card is a flex/grid container and stretches to the
       full row width — that is what smeared giant green/red bars across
       third-party job boards. Pinning flex/grid sizing and max-width
       keeps the badge inert inside any layout. */
    badge.style.cssText = `display:inline-block!important;background:${color};color:#fff;
      font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;
      margin-left:6px;vertical-align:middle;
      flex:0 0 auto!important;align-self:center!important;grid-area:auto!important;
      width:auto!important;max-width:max-content!important;height:auto!important;
      position:static!important;float:none!important;box-sizing:border-box!important;
      line-height:1.4!important;white-space:nowrap!important;pointer-events:none;`;
    const heading = el.querySelector('h1,h2,h3,h4,a');
    if (heading) heading.after(badge); else el.prepend(badge);
  }

  /* Freshness badges are cosmetic and inject into OTHER sites' markup, so
     they are OFF unless explicitly enabled (ohFreshBadges === true).
     They previously ran on every page every 4s with very broad selectors
     ([class*="result-"], [class*="listing"]) that matched large layout
     containers rather than job cards, visibly breaking sites such as
     jobright.ai. Nothing in the auto-apply flow depends on them. */
  let _freshBadgesEnabled = false;
  function processFreshness() {
    if (!_freshBadgesEnabled) return;
    $$(
      '.jobsearch-SerpJobCard,.job_seen_beacon,' +                     /* Indeed */
      '.jobs-search-results__list-item,.job-card-container,' +         /* LinkedIn */
      '[class*="job-card"],[class*="jobCard"]'                         /* Generic */
    ).forEach(addFreshBadge);
  }
  /* Remove any badges we already injected when the feature is disabled. */
  function clearFreshBadges() {
    try { $$('.oh-fresh').forEach(b => b.remove()); } catch (_) {}
  }
  try {
    ST.get(['ohFreshBadges'], (d) => {
      _freshBadgesEnabled = !!(d && d.ohFreshBadges === true);
      if (_freshBadgesEnabled) processFreshness(); else clearFreshBadges();
    });
    chrome.storage.onChanged.addListener((c, a) => {
      if (a !== 'local' || !c.ohFreshBadges) return;
      _freshBadgesEnabled = c.ohFreshBadges.newValue === true;
      if (_freshBadgesEnabled) processFreshness(); else clearFreshBadges();
    });
  } catch (_) {}
  setInterval(processFreshness, 4000);

  /* ── T30a: Recruitee autofill ───────────────────────────── */
  async function recruiteeAutofill() {
    if (CURRENT_ATS !== 'Recruitee') return;
    const p = await getProfile();
    LOG('Recruitee: filling');
    const MAP = [
      ['input[name*="first_name" i],input[placeholder*="First name" i]', p.first_name],
      ['input[name*="last_name" i],input[placeholder*="Last name" i]',   p.last_name],
      ['input[type="email"],input[name*="email" i]',                     p.email],
      ['input[type="tel"],input[name*="phone" i]',                       p.phone],
      ['input[name*="city" i],input[placeholder*="City" i]',             p.city],
      ['input[name*="linkedin" i]',                                      p.linkedin_profile_url || ''],
      ['input[name*="github" i]',                                        p.github_url || ''],
      ['textarea[name*="cover" i],textarea[id*="cover" i]',              generateCoverLetter(p)],
    ];
    for (const [sel, val] of MAP) {
      if (!val) continue;
      const el = $$(sel).find(e => isVisible(e) && !e.value?.trim());
      if (el) { el.focus(); nativeSet(el, val); await sleep(50); }
    }
    await tryResumeUpload(p);
    await autoFillPage();
  }

  /* ── T30b: Pinpoint autofill ────────────────────────────── */
  async function pinpointAutofill() {
    if (CURRENT_ATS !== 'Pinpoint') return;
    const p = await getProfile();
    LOG('Pinpoint: filling');
    const MAP = [
      ['input[id*="first_name" i],input[name*="first_name" i]', p.first_name],
      ['input[id*="last_name" i],input[name*="last_name" i]',   p.last_name],
      ['input[type="email"]',                                    p.email],
      ['input[type="tel"]',                                      p.phone],
      ['input[id*="city" i],input[name*="city" i]',              p.city],
      ['textarea[id*="cover" i],textarea[name*="cover" i]',      generateCoverLetter(p)],
    ];
    for (const [sel, val] of MAP) {
      if (!val) continue;
      const el = $$(sel).find(e => isVisible(e) && !e.value?.trim());
      if (el) { el.focus(); nativeSet(el, val); await sleep(50); }
    }
    await tryResumeUpload(p);
    await autoFillPage();
  }

  /* ── T30c: SAP SuccessFactors autofill ──────────────────── */
  async function successFactorsAutofill() {
    if (CURRENT_ATS !== 'SuccessFactors') return;
    const p = await getProfile();
    LOG('SuccessFactors: filling');
    // SuccessFactors uses iframes + dynamic ids; rely mostly on generic fill
    const MAP = [
      ['input[id*="firstName" i],input[name*="firstName" i]',  p.first_name],
      ['input[id*="lastName" i],input[name*="lastName" i]',    p.last_name],
      ['input[type="email"]',                                   p.email],
      ['input[type="tel"],input[id*="phone" i]',               p.phone],
      ['input[id*="city" i]',                                   p.city],
      ['input[id*="country" i]',                                p.country || 'Ireland'],
    ];
    for (const [sel, val] of MAP) {
      if (!val) continue;
      const el = $$(sel).find(e => isVisible(e) && !e.value?.trim());
      if (el) { el.focus(); nativeSet(el, val); await sleep(50); }
    }
    await tryResumeUpload(p);
    await autoFillPage();
    await successFactorsSelects(p);
    await successFactorsResume(p);
    await successFactorsTerms();
  }

  /* SuccessFactors' career site labels its boxes "City:*", "Citizenship 1:*"
     and asks in plain <select>s starting at "No Selection" — which the
     id-based map above and the generic pass mostly missed (an Ericsson form
     came back with Citizenship 1, "How did you hear", Gender and the Terms
     of Use all undone, while the optional Citizenship 2 got filled). Each
     select is answered by what its label asks. */
  /* SAP SuccessFactors refuses to submit with more than 100 skills ("You
     can only add up to 100 skills. Retain skills that add value") — an old
     profile held 260. The extras go, from the end of the list. */
  const SF_SKILL_CAP = 100;
  async function sfTrimSkills() {
    const warn = $$('div,span,p,li').find(e => isVisible(e) && e.children.length < 3 && /only add up to \d+ skills/i.test(e.textContent || ''));
    if (!warn) return 0;
    const cap = +((warn.textContent.match(/up to (\d+) skills/i) || [])[1]) || SF_SKILL_CAP;
    const isRemover = b => isVisible(b) && /remove|delete/i.test(`${b.getAttribute('aria-label') || ''} ${b.title || ''}`);
    /* The smallest ancestor of the warning that holds more remove buttons than the cap: the skills list. */
    let box = warn;
    for (let i = 0; i < 8 && box.parentElement; i++) {
      box = box.parentElement;
      if ($$('button,[role="button"],a', box).filter(isRemover).length > cap) break;
    }
    let removed = 0;
    for (let guard = 0; guard < 400; guard++) {
      const r = $$('button,[role="button"],a', box).filter(isRemover);
      if (r.length <= cap) break;
      r[r.length - 1].click();
      removed++;
      await sleep(60);
    }
    if (removed) LOG(`SuccessFactors: removed ${removed} skill(s) over the ${cap}-skill limit`);
    return removed;
  }

  /* ── Stale or mangled prefills (27-10 ATS test) ──────────────────────
     Resume parsers and saved profiles put the wrong thing in filled boxes,
     which every filler then leaves alone because the box "has a value":
     Paylocity's parser wrote the name in capitals and the phone as
     "+353: 0874261508"; SAP SuccessFactors and BrassRing loaded an old
     name, phone and London address. On the sites that prefill like this,
     a filled identity box is compared with your profile and corrected —
     once per box, so a site that reformats the value is not fought. */
  const PREFILL_REPAIR_ATS = ['SuccessFactors', 'BrassRing', 'Paylocity', 'ADP', 'iCIMS', 'OracleCloud', 'Taleo', 'ZohoRecruit', 'JOIN', 'Dayforce'];
  const _prefillRepaired = new WeakSet();
  function nationalDigits(v, dial) {
    let d = String(v || '').replace(/\D/g, '');
    if (dial && d.startsWith(dial) && d.length > dial.length + 6) d = d.slice(dial.length);
    return d.replace(/^0+/, '');
  }
  async function repairPrefills() {
    if (!PREFILL_REPAIR_ATS.includes(CURRENT_ATS)) return 0;
    const p = await getProfile();
    const dial = String(p.phone_country_code || _profileDialCode || '').replace(/\D/g, '');
    const squash = v => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const RULES = [
      { rx: /^(legal )?(first|given) ?names?$|^vorname$|^pr[eé]nom$/i, want: p.first_name, same: (a, b) => a === b },
      { rx: /^(legal )?(last|family) ?names?$|^surname$|^nachname$|^nom de famille$/i, want: p.last_name, same: (a, b) => a === b },
      { rx: /^(mobile|cell|primary|home)? ?(phone|telephone|mobile)( number| no)?$/i, want: p.phone, same: (a, b) => nationalDigits(a, dial) === nationalDigits(b, dial) && !/:|^\+\d{1,3}\D*0/.test(a) },   // "+353: 0874…" is mangled
      { rx: /^(city|town|city or town|locality)$/i, want: p.city, same: (a, b) => squash(a) === squash(b) },
      { rx: /^(zip|postal|post) ?code$|^zip$|^eircode$|^(zip|postal) ?\/ ?(zip|postal) ?code$/i, want: p.postal_code, same: (a, b) => squash(a) === squash(b) },
      { rx: /^(street )?address( line)? ?1?$|^street$/i, want: p.street, same: (a, b) => squash(a) === squash(b) },
    ];
    let fixed = 0;
    for (const el of $$('input[type="text"],input[type="tel"],input:not([type])')) {
      if (_prefillRepaired.has(el) || !isVisible(el) || el.disabled || el.readOnly || isTrapField(el)) continue;
      const cur = (el.value || '').trim();
      if (!cur) continue;
      const label = String(getLabel(el) || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').replace(/[*:]/g, ' ').replace(/\s+/g, ' ').trim();
      const rule = label && RULES.find(r => r.rx.test(label));
      if (!rule || !rule.want || rule.same(cur, String(rule.want).trim())) continue;
      _prefillRepaired.add(el);
      if (nativeSet(el, String(rule.want).trim())) {
        fixed++;
        LOG(`Prefill repaired: "${label.slice(0, 40)}" was "${cur.slice(0, 40)}"`);
        await sleep(40);
      }
    }
    return fixed;
  }

  const SF_EMPTY_RE = /^(no selection|select( one)?|please select|choose|--+|\s*)$/i;
  function sfLabel(el) { return String(getLabel(el) || '').replace(/[*:]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function sfSelectEmpty(sel) {
    const o = sel.options[sel.selectedIndex];
    return !o || !o.value || SF_EMPTY_RE.test((o.text || '').trim());
  }
  function sfSet(sel, opt) {
    sel.value = opt.value;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function sfAnswer(label, p, sel) {
    const l = label.toLowerCase();
    const opts = $$('option', sel).filter(o => o.value);
    const find = re => opts.find(o => re.test(o.text));
    if (/citizenship\s*2|second citizenship|additional (citizenship|nationality)|other nationality/.test(l)) return null;
    if (/citizenship|nationality/.test(l)) return bestSelectOption(sel, p.citizenship || p.nationality || p.country, label);
    if (/gender|\bsex\b|ethnic|race|disabilit|veteran|sexual orientation/.test(l)) return find(/prefer not|decline|not to (say|disclose|answer)|do not wish|don[’']?t wish|rather not/i) || null;
    if (/conflict of interest|related to (an )?employee|relative|family member/.test(l)) return find(/^no\b/i) || null;
    if (/how did you (hear|find|learn)|where did you (hear|see|find)|\bsource\b|referral source/.test(l)) {
      return find(/linkedin/i) || find(/job ?board|internet|online|website|career(s)? site/i) || find(/^other/i) || null;
    }
    if (/state|province|county|region/.test(l) && !/country/.test(l)) return p.state ? bestSelectOption(sel, p.state, label) : null;
    if (/country/.test(l)) return p.country ? bestSelectOption(sel, p.country, label) : null;
    const g = guessValue(label, p, 'select');
    return g ? bestSelectOption(sel, g, label) : null;
  }
  async function successFactorsSelects(p) {
    const sels = $$('select').filter(isVisible);
    let cit1 = '';
    for (const sel of sels) {
      const label = sfLabel(sel);
      if (!label) continue;
      if (/citizenship\s*1|^citizenship$|^nationality$/i.test(label) && !sfSelectEmpty(sel)) cit1 = sel.value;
      if (!sfSelectEmpty(sel)) continue;
      const opt = sfAnswer(label, p, sel);
      if (!opt) continue;
      sfSet(sel, opt);
      if (/citizenship\s*1|^citizenship$|^nationality$/i.test(label)) cit1 = opt.value;
      LOG(`SuccessFactors: "${label.slice(0, 60)}" → ${opt.text}`);
      await sleep(120);
    }
    /* The optional second citizenship repeating the first: cleared. */
    for (const sel of sels) {
      if (!/citizenship\s*2|second citizenship/i.test(sfLabel(sel)) || !cit1 || sel.value !== cit1) continue;
      const none = $$('option', sel).find(o => !o.value);
      if (none) { sfSet(sel, none); LOG('SuccessFactors: Citizenship 2 only repeated Citizenship 1 — cleared'); }
    }
  }
  /* "Upload a Resume" is a tile that opens an attach dialog; the file box
     only exists once it is open. */
  async function successFactorsResume(p) {
    const done = $$('[id*="resume" i],[class*="attachment" i]').some(e => /\.(pdf|docx?|rtf|txt)\b/i.test(e.textContent || ''));
    if (done) return;
    const tile = $$('a,button,[role="button"],div,span').find(e => isVisible(e) && e.children.length <= 2 &&
      /^upload (a |your )?(resume|cv)$/i.test((e.textContent || '').trim()));
    if (!tile) return;
    realClick(tile);
    await sleep(700);
    if (await tryResumeUpload(p)) LOG('SuccessFactors: CV attached through "Upload a Resume"');
  }
  /* "Terms of Use: Read the data privacy statement." — the statement opens in
     a dialog whose Accept is the consent. Accepted once per page. */
  let _sfTermsDone = '';
  async function successFactorsTerms() {
    if (_sfTermsDone === location.href) return;
    const link = $$('a,button,[role="button"]').find(e => isVisible(e) &&
      /data privacy statement|privacy (statement|policy|notice)|terms of use/i.test((e.textContent || '').trim()) &&
      /terms of use|privacy|consent/i.test(((e.closest('div,tr,p,li') || e).textContent || '')));
    if (!link) return;
    realClick(link);
    for (let i = 0; i < 15; i++) {
      await sleep(200);
      const accept = $$('button,[role="button"],input[type="button"],input[type="submit"],a').find(b => isVisible(b) &&
        /^(i\s+)?(accept|agree)(\s+(and|&)\s+continue)?$/i.test((b.textContent || b.value || '').trim()));
      if (accept) {
        realClick(accept);
        _sfTermsDone = location.href;
        LOG('SuccessFactors: data privacy statement accepted');
        return;
      }
    }
  }

  /* ── T30d: UKG / UltiPro autofill ───────────────────────── */
  async function ukgAutofill() {
    if (CURRENT_ATS !== 'UKG') return;
    const p = await getProfile();
    LOG('UKG: filling');
    const MAP = [
      ['input[name*="FirstName" i],input[id*="FirstName" i]', p.first_name],
      ['input[name*="LastName" i],input[id*="LastName" i]',   p.last_name],
      ['input[type="email"],input[name*="Email" i]',           p.email],
      ['input[type="tel"],input[name*="Phone" i]',             p.phone],
      ['input[name*="City" i]',                                p.city],
      ['input[name*="PostalCode" i],input[name*="Zip" i]',     p.postal_code || p.zip || ''],
    ];
    for (const [sel, val] of MAP) {
      if (!val) continue;
      const el = $$(sel).find(e => isVisible(e) && !e.value?.trim());
      if (el) { el.focus(); nativeSet(el, val); await sleep(50); }
    }
    await tryResumeUpload(p);
    await autoFillPage();
  }

  /* ── T30e: Avature autofill ─────────────────────────────── */
  async function avatureAutofill() {
    if (CURRENT_ATS !== 'Avature') return;
    const p = await getProfile();
    LOG('Avature: filling');
    const MAP = [
      ['input[name*="firstName" i],input[id*="firstName" i]', p.first_name],
      ['input[name*="lastName" i],input[id*="lastName" i]',   p.last_name],
      ['input[type="email"]',                                  p.email],
      ['input[type="tel"]',                                    p.phone],
      ['input[name*="city" i]',                                p.city],
      ['input[name*="country" i]',                             p.country || 'Ireland'],
      ['textarea[name*="cover" i]',                            generateCoverLetter(p)],
    ];
    for (const [sel, val] of MAP) {
      if (!val) continue;
      const el = $$(sel).find(e => isVisible(e) && !e.value?.trim());
      if (el) { el.focus(); nativeSet(el, val); await sleep(50); }
    }
    await tryResumeUpload(p);
    await autoFillPage();
  }

  /* ── v6.5: GoHire / Forhyre ────────────────────────────────────
   * OptimHire v2.5.3 added native gh-widget support (gh-widget-
   * checkbox-wrapper, gh-custom-question, etc). Their API-driven
   * fill now handles GoHire forms. We rely on their native fill +
   * a generic autoFillPage() catch-up pass (no custom adapter).   */

  /* ── Shared ATS dispatch helper ─────────────────────────── */
  async function runAtsAutofill() {
    if (wdEngineOwns()) return;
    // v6.1: bail out cleanly if a Cloudflare bot-challenge is showing,
    // so we don't trip a refresh loop while it's in progress.
    if (isCloudflareChallenge()) {
      LOG('Cloudflare challenge detected — skipping autofill');
      try {
        chrome.runtime.sendMessage({
          type: 'APPLICATION_FAILED',
          reason: 'cloudflare_challenge',
          url: location.href,
        }).catch(() => {});
      } catch (_) {}
      return;
    }
    _fillActive = true;
    try {
      // T26: Dismiss cookie banners before filling so buttons aren't obscured
      dismissCookieBanner();
      await waitForFormStable(2000);

      // T33: If this is an "Apply on company site" page with no form inputs,
      // broadcast failure so the queue advances instead of watching for 100s.
      if (isApplyOnCompanySitePage() && !document.querySelector('form input:not([type="hidden"]), form textarea')) {
        LOG('Apply-on-company-site detected — requesting skip');
        try {
          chrome.runtime.sendMessage({
            type: 'APPLICATION_FAILED',
            reason: 'external_apply_link',
            url: location.href,
          }).catch(() => {});
        } catch (_) {}
        _fillActive = false;
        return;
      }

      // T27: If this is a pure review page, just submit — don't re-fill
      if (await tryReviewAutoSubmit()) {
        _fillActive = false;
        return;
      }

      switch (CURRENT_ATS) {
        case 'Workday':          await workdayAutofill();      break;
        case 'OracleCloud':      await oracleAutofill();       break;
        case 'SmartRecruiters':  await srAutofill();           break;
        case 'Greenhouse':       await greenhouseAutofill();   break;
        case 'Ashby':            await ashbyAutofill();        break;
        case 'BambooHR':         await bambooAutofill();       break;
        case 'Jobvite':          await jobviteAutofill();      break;
        case 'Lever':            await leverAutofill();        break;
        case 'Workable':         await workableAutofill();     break;
        case 'iCIMS':            await icimsAutofill();        break;
        case 'Paylocity':        await paylocityAutofill();    break;
        case 'JazzHR':           await jazzhrAutofill();       break;
        case 'Teamtailor':       await teamtailorAutofill();   break;
        case 'Recruitee':        await recruiteeAutofill();    break;
        case 'Pinpoint':         await pinpointAutofill();     break;
        case 'SuccessFactors':   await successFactorsAutofill(); break;
        case 'UKG':              await ukgAutofill();          break;
        case 'Avature':          await avatureAutofill();      break;
        default:                 await autoFillPage();         break;
      }
      // Generic pass after platform-specific (catches missed fields)
      // v6.5: GoHire removed from exclusion list — autoFillPage runs as a
      // catch-up pass after OptimHire's native v2.5.3 gh-widget fill.
      if (!['Ashby','BambooHR','Jobvite','Lever','Workable','iCIMS','Paylocity','JazzHR','Teamtailor','Recruitee','Pinpoint','SuccessFactors','UKG','Avature'].includes(CURRENT_ATS)) {
        await autoFillPage();
      }

      // Stale or mangled prefills (old saved profile, resume parser) — see repairPrefills.
      try { await repairPrefills(); } catch (_) {}
      if (CURRENT_ATS === 'SuccessFactors') { try { await sfTrimSkills(); } catch (_) {} }

      // T29: Resume upload — try once after main fill (non-adapter ATS already covered)
      try {
        const p = await getProfile();
        await tryResumeUpload(p);
        // v6.1: also try drag-drop zones (Greenhouse/Workday style)
        await tryDropzoneResume(p);
      } catch (_) {}

      // T27: After fill, check if we've landed on a review step
      await tryReviewAutoSubmit();
    } finally {
      _fillActive = false;
    }
  }

  /* ── T19: CSV Auto-Apply bridge ─────────────────────────── */
  async function initCsvBridge(overrideJobId = null) {
    let { csvActiveJobId, csvActiveTabId } = await ST.get([
      'csvActiveJobId', 'csvActiveTabId',
    ]);

    // Allow TRIGGER_AUTOFILL to pass the correct jobId (multi-tab support)
    if (overrideJobId) csvActiveJobId = overrideJobId;

    const isCsvTab = csvActiveJobId && (csvActiveTabId || overrideJobId);
    if (!isCsvTab) return;

    LOG('CSV bridge active — monitoring for submission');

    let reported = false;
    let _reportedStatus = '';
    const report = async (status, reason = '') => {
      // Allow upgrading from 'failed' to 'done' if the application eventually succeeds
      if (reported && !(_reportedStatus === 'failed' && status === 'done')) return;
      reported = true;
      _reportedStatus = status;
      if (status === 'done') markApplied();
      await ST.set({
        [`csvJobResult_${csvActiveJobId}`]: { status, reason, ts: Date.now() },
      });
      chrome.runtime.sendMessage({
        type: 'CSV_JOB_COMPLETE',
        jobId: csvActiveJobId,
        status,
        reason,
        url: location.href,
      }).catch(() => {});
      LOG(`CSV bridge: reported ${status} for job ${csvActiveJobId}`);
    };

    /* Deliberately NOT an async listener. An async function returns a
       Promise for EVERY message, and Chrome treats a returned Promise as
       "a response is coming later" — so every sender messaging this tab
       (including our own "Autofill this page" button) got "the message
       channel closed before a response was received", and the sidepanel
       then wrongly reported "page not ready". Do the work in a detached
       async task and return nothing. */
    chrome.runtime.onMessage.addListener(msg => { (async () => {
      if (msg?.type === 'COMPLEX_FORM_SUCCESS') { report('done'); return; }
      if (msg?.type === 'APPLICATION_SUCCESS' || msg?.type === 'JOB_APPLIED') { report('done'); return; }
      if (msg?.type === 'ALREADY_APPLIED_SKIP') { report('duplicate'); return; }
      if (msg?.type === 'APPLICATION_FAILED') { report('failed', msg.reason || ''); return; }

      if (msg?.type === 'COMPLEX_FORM_ERROR') {
        // Don't immediately fail — attempt one recovery autofill + submit pass
        const errType = msg.errorType || msg.message || '';
        LOG(`COMPLEX_FORM_ERROR (${errType}) — attempting recovery autofill`);
        try {
          _fillActive = true;
          await waitForFormStable(1500);
          await runAtsAutofill();
          await detectAndFixValidationErrors();
          await sleep(500);
          _fillActive = false;
          const recovered = await handleMultiStepCsvForm();
          if (!recovered) {
            // Give the page 5 more seconds to confirm submission
            await sleep(5000);
            const href = location.href.toLowerCase();
            const body = document.body?.textContent?.toLowerCase() || '';
            const isSuccess = /\/thanks|\/thank-you|\/success|\/confirmation|\/complete|\/submitted|\/applied|\/done/.test(href) ||
              /application submitted|thank you for applying|we.ve received|successfully submitted/.test(body);
            if (isSuccess) { report('done'); } else { report('failed', errType); }
          }
        } catch (_) {
          _fillActive = false;
          report('failed', errType);
        }
      }
    })().catch(() => {}); });

    const successPatterns = [
      '/thanks', '/thank-you', '/success', '/confirmation',
      '/complete', '/submitted', '/application-submitted',
      '/applied', '/done', '/thank_you',
    ];
    const checkSuccess = () => {
      const href = location.href.toLowerCase();
      if (successPatterns.some(p => href.includes(p))) { report('done'); return; }
      const body = document.body?.textContent?.toLowerCase() || '';
      if (/application submitted|thank you for applying|application received|we.ve received your|your application has been|successfully submitted|application complete|thanks for applying|we have received|application was submitted/i.test(body)) {
        report('done');
      }
      // Greenhouse-specific success
      if (document.querySelector('#application_confirmation,.application-confirmation,.confirmation-text')) {
        report('done');
      }
      // Lever-specific success
      if (document.querySelector('.posting-confirmation,.application-confirmation')) {
        report('done');
      }
      // Workday: success screen detection
      if (document.querySelector('[data-automation-id="congratulationsMessage"],[data-automation-id="confirmationMessage"]')) {
        report('done');
      }
    };
    new MutationObserver(checkSuccess).observe(document.body, { childList: true, subtree: true });
    setInterval(checkSuccess, 5000);
    checkSuccess();

    /* Auto-fill on page load for CSV mode */
    await sleep(2000);
    // Notify sidebar: ATS detected, analyzing
    try {
      chrome.runtime.sendMessage({
        type: 'SIDEBAR_STATUS', event: 'analyzing_form',
        atsName: CURRENT_ATS || 'Unknown', url: location.href,
      }).catch(() => {});
    } catch (_) {}

    // Multi-step form handler: fills each step, navigates Next, then submits
    await handleMultiStepCsvForm();

    // Extra sanitize pass after OptimHire's own fill pipeline may have run
    await sleep(1000); await sanitizeBadFills();
  }

  /** Find the Next/Continue step-navigation button (NOT a submit button) */
  function getNextStepButton() {
    return $$('button,a[role="button"]').filter(isVisible).find(btn => {
      const t = (btn.textContent || '').trim();
      return /^(next|continue)(\s+step)?(\s|$)/i.test(t) &&
             !/cancel|back|prev|close|submit|apply/i.test(t.toLowerCase());
    }) || null;
  }

  /**
   * Find and click the FINAL submit/apply button.
   * Never clicks Next / Continue navigation buttons — those belong to
   * the multi-step loop in initCsvBridge / handleMultiStepCsvForm.
   * Returns true if a submit button was found and clicked.
   */
  async function tryClickSubmit() {
    // Check if autoSubmit is enabled in settings
    const { csvQueueSettings } = await ST.get('csvQueueSettings');
    const autoSubmit = csvQueueSettings?.autoSubmit !== false; // default true for CSV mode

    if (!autoSubmit) {
      LOG('Auto-submit disabled — waiting for manual submit or timeout');
      return false;
    }

    // Priority 1: Selector-based (most reliable, ATS-specific)
    const submitSelectors = [
      '#submit_app',                                                    // Greenhouse
      '.postings-btn-submit',                                           // Lever
      'button.application-submit',                                      // Lever
      'button[data-qa="btn-submit"]',                                   // SmartRecruiters
      'button[data-automation-id="pageFooterSubmitButton"]',            // Workday
      'button[data-automation-id="bottom-navigation-submit-button"]',   // Workday
      'button[data-automation-id="btnSubmit"]',                         // Workday
      'button[aria-label*="Submit application"]',
      'button[aria-label*="submit application"]',
      'input[type="submit"]',
    ];

    for (const sel of submitSelectors) {
      const btn = $(sel);
      if (btn && isVisible(btn)) {
        LOG('Found submit button via selector:', sel);
        await waitForSubmitReady(btn, 5000);
        if (btn.disabled) { LOG('Submit button still disabled after 5s — skipping selector'); continue; }
        try { chrome.runtime.sendMessage({ type: 'SIDEBAR_STATUS', event: 'submitting' }).catch(() => {}); } catch (_) {}
        await sleep(300);
        markSubmitAttempted();
        realClick(btn);
        return true;
      }
    }

    // Priority 2: type="submit" buttons (catches most generic forms)
    const typedSubmit = $$('button[type="submit"]').filter(isVisible).find(btn => {
      const t = (btn.textContent || '').trim().toLowerCase();
      return !/next|continue|back|prev|cancel|save.*draft/i.test(t);
    });
    if (typedSubmit) {
      LOG('Found type=submit button:', typedSubmit.textContent?.trim());
      await waitForSubmitReady(typedSubmit, 5000);
      try { chrome.runtime.sendMessage({ type: 'SIDEBAR_STATUS', event: 'submitting' }).catch(() => {}); } catch (_) {}
      await sleep(300);
      markSubmitAttempted();
      realClick(typedSubmit);
      return true;
    }

    // Priority 3: Text-based fallback — NEVER matches next/continue (those are nav)
    const buttons = $$('button,a[role="button"]').filter(isVisible);
    const submitBtn = buttons.find(btn => {
      const t = (btn.textContent || btn.value || '').trim().toLowerCase();
      return /^(submit application|submit|apply now|apply|send application|send|complete application|complete|finish)(\s+application)?(\s|$)/i.test(t) &&
        !/cancel|back|prev|close|next|continue|save.*draft/i.test(t);
    });

    if (submitBtn) {
      LOG('Found submit button by text:', submitBtn.textContent?.trim());
      await waitForSubmitReady(submitBtn, 5000);
      try { chrome.runtime.sendMessage({ type: 'SIDEBAR_STATUS', event: 'submitting' }).catch(() => {}); } catch (_) {}
      await sleep(300);
      markSubmitAttempted();
      realClick(submitBtn);
      return true;
    }

    // Priority 4: input[type=submit]
    const inputSubmit = $$('input[type="submit"]').filter(isVisible).find(el =>
      !/next|continue|back|prev|cancel/i.test(el.value || '')
    );
    if (inputSubmit) {
      await waitForSubmitReady(inputSubmit, 3000);
      try { chrome.runtime.sendMessage({ type: 'SIDEBAR_STATUS', event: 'submitting' }).catch(() => {}); } catch (_) {}
      await sleep(300);
      markSubmitAttempted();
      realClick(inputSubmit);
      return true;
    }

    LOG('No submit button found — relying on OptimHire pipeline submit');
    return false;
  }

  /**
   * Multi-step form handler for CSV mode.
   * Fills each page, clicks Next if available, repeats until Submit.
   * Returns true if the form was submitted.
   */
  async function handleMultiStepCsvForm() {
    let maxSteps = 15; // guard: max form steps
    while (maxSteps-- > 0) {
      await waitForFormStable(2000);

      // Run ATS-specific fill
      _fillActive = true;
      try { await runAtsAutofill(); } finally { _fillActive = false; }
      await solveCaptcha();
      await sleep(500); await sanitizeBadFills();

      // Fix any validation errors that appeared after our fill
      const errFixed = await detectAndFixValidationErrors();
      if (errFixed > 0) { await sleep(400); await sanitizeBadFills(); }

      // Check for required fields still empty — retry up to 2 more times
      for (let retry = 0; retry < 2; retry++) {
        const emptyRequired = $$(
          'input[required]:not([type=hidden]):not([type=file]),input[aria-required="true"],' +
          'select[required],select[aria-required="true"],textarea[required],' +
          '[aria-required="true"]:not([type=hidden])'
        ).filter(el => isVisible(el) && !el.value?.trim());
        if (emptyRequired.length === 0) break;
        LOG(`Multi-step: ${emptyRequired.length} required fields still empty — retry ${retry + 1}`);
        _fillActive = true;
        try { await autoFillPage(); } finally { _fillActive = false; }
        await sleep(400);
        await detectAndFixValidationErrors();
        await sleep(200);
      }

      // Try Next/Continue step button first
      const nextBtn = getNextStepButton();
      if (nextBtn) {
        LOG('Multi-step: clicking Next →', nextBtn.textContent?.trim());
        realClick(nextBtn);
        await sleep(2000); // wait for new step to render
        continue;
      }

      // No Next button — attempt final submit
      const submitted = await tryClickSubmit();
      LOG('Multi-step: submit attempt result:', submitted);

      // If submitted, wait up to 8s to see if the page navigates to a success URL
      if (submitted) {
        await sleep(3000);
        const href = location.href.toLowerCase();
        const body = document.body?.textContent?.toLowerCase() || '';
        const isSuccess =
          /\/thanks|\/thank-you|\/success|\/confirmation|\/complete|\/submitted|\/applied|\/done|\/thank_you/.test(href) ||
          /application submitted|thank you for applying|application received|we.ve received your|your application has been|successfully submitted|application complete|thanks for applying|we have received/.test(body) ||
          !!document.querySelector('#application_confirmation,.application-confirmation,.confirmation-text,[data-automation-id="congratulationsMessage"],[data-automation-id="confirmationMessage"],.posting-confirmation');

        if (!isSuccess) {
          // Maybe there were validation errors — do one more fix+submit pass
          const errFixed2 = await detectAndFixValidationErrors();
          if (errFixed2 > 0) {
            LOG('Multi-step: validation errors found after submit click — re-trying submit');
            await sleep(400);
            await tryClickSubmit();
          }
        }
      }

      return submitted;
    }
    LOG('Multi-step: step limit reached');
    return false;
  }

  /* Run ATS-specific autofill on DOM changes (CSV mode).
   * Also attempts submit/navigate after filling so multi-step forms
   * don't stall on intermediate pages.                              */
  let _fillDebounce = null;
  let _csvFillRunning = false;
  new MutationObserver(async () => {
    const { csvActiveJobId } = await ST.get('csvActiveJobId');
    if (!csvActiveJobId) return;
    if (_csvFillRunning) return;
    clearTimeout(_fillDebounce);
    _fillDebounce = setTimeout(async () => {
      if (_csvFillRunning) return;
      _csvFillRunning = true;
      _fillActive = true;
      try {
        await autoFillPage();
        await solveCaptcha();
        await sanitizeBadFills();
        await detectAndFixValidationErrors();
        // After filling, click Next or Submit if form is ready
        const nextBtn = getNextStepButton();
        if (nextBtn) {
          realClick(nextBtn);
        } else {
          await tryClickSubmit();
        }
      } finally {
        _csvFillRunning = false;
        _fillActive = false;
      }
    }, 1200);
  }).observe(document.body, { childList: true, subtree: false });

  /* Listen for messages from background/csvImport */
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'TRIGGER_AUTOFILL') {
      (async () => {
        // initCsvBridge already calls runAtsAutofill + handleMultiStepCsvForm internally
        await initCsvBridge(msg.jobId || null);
        sendResponse({ ok: true });
      })();
      return true;
    }
    if (msg?.type === 'SOLVE_CAPTCHA') {
      solveCaptcha().then(() => sendResponse({ ok: true }));
      return true;
    }
  });

  /* Track applications on success */
  chrome.runtime.onMessage.addListener(msg => {
    if (
      msg?.type === 'COMPLEX_FORM_SUCCESS' ||
      msg?.type === 'APPLICATION_SUCCESS'  ||
      msg?.type === 'JOB_APPLIED'
    ) markApplied();
  });

  /* Init CSV bridge (async, non-blocking) */
  initCsvBridge().catch(() => {});

  /* ── Race-condition fallback ─────────────────────────────────────────────
   * If the background set csvActiveJobId AFTER our content script already ran
   * (fast page loads), initCsvBridge() above would have found nothing.
   * Listen for storage changes and re-run when csvActiveJobId appears.
   * The background also sends TRIGGER_AUTOFILL for the same purpose, but
   * this storage listener acts as an additional fallback.
   * ──────────────────────────────────────────────────────────────────────── */
  let _csvBridgeStarted = false;
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local' || _csvBridgeStarted) return;
    const newJobId = changes.csvActiveJobId?.newValue;
    const newTabId = changes.csvActiveTabId?.newValue;
    if (newJobId && newTabId) {
      _csvBridgeStarted = true;
      await initCsvBridge(newJobId).catch(() => {});
    }
  });

  /* Removed duplicate runAtsAutofill trigger — initCsvBridge handles CSV mode */

  /* ── AUTO-TRIGGER: Detect supported ATS pages and auto-fill ──────
   * Like SmartApply's "Autofill in progress" — when the user lands
   * on a supported ATS application page, the extension detects it
   * and automatically starts filling the form.
   * ─────────────────────────────────────────────────────────────── */

  /**
   * Decide if the current page IS (or will soon be) an application form.
   * Uses URL-first detection — far more reliable than fragile DOM selectors.
   * Falls back to permissive DOM scan for unknown ATS flavours.
   */
  function isApplicationPage() {
    const url      = location.href.toLowerCase();
    const path     = location.pathname.toLowerCase();
    const hostname = location.hostname.toLowerCase();

    /* ── LinkedIn ─────────────────────────────────────────────────
     * Job DETAIL page = /jobs/view/  or  /jobs/search/ with a panel open.
     * The Easy Apply modal opens AFTER a click — detect either state.   */
    if (CURRENT_ATS === 'LinkedIn') {
      if (path.includes('/jobs/view/') || path.includes('/jobs/collections/')) return true;
      /* Easy Apply modal already open */
      if (document.querySelector('.jobs-easy-apply-modal,[data-test-modal],[aria-modal="true"]')) return true;
      /* Apply button present on the page */
      if (document.querySelector('.jobs-apply-button,[aria-label*="Apply"],[data-control-name*="apply"]')) return true;
      return false;
    }

    /* ── Workday ──────────────────────────────────────────────────
     * Application pages: URL has /apply  OR  page has automation IDs */
    if (CURRENT_ATS === 'Workday') {
      if (url.includes('/apply') || url.includes('apply=')) return true;
      return document.querySelectorAll('[data-automation-id]').length > 2;
    }

    /* ── Greenhouse ───────────────────────────────────────────────
     * boards.greenhouse.io/company/jobs/ID  is ALWAYS an application.
     * Same for /jobs/ URLs on greenhouse.io subdomains.               */
    if (CURRENT_ATS === 'Greenhouse') {
      if (hostname.includes('boards.greenhouse.io')) return true;
      if (hostname.includes('greenhouse.io') && path.includes('/jobs/')) return true;
      if (document.querySelector('#application_form,[data-provided-by="greenhouse"],form[action*="greenhouse"]')) return true;
      /* Fallback: any form with name/email inputs */
      return document.querySelectorAll(
        'input[id*="first"],input[id*="last"],input[id*="email"],input[name*="first"],input[name*="email"]'
      ).length > 0;
    }

    /* ── Lever ────────────────────────────────────────────────────
     * jobs.lever.co/company/id   is always a job post (apply on page) */
    if (CURRENT_ATS === 'Lever') {
      if (hostname.includes('jobs.lever.co') || hostname.includes('apply.lever.co')) return true;
      return !!document.querySelector('.posting-apply,form.postings-form,.application-form');
    }

    /* ── Ashby ────────────────────────────────────────────────────
     * jobs.ashbyhq.com/company/UUID/application  */
    if (CURRENT_ATS === 'Ashby') {
      if (path.includes('/application')) return true;
      return !!document.querySelector('[data-ashby-form],._ashby_apply_form,[class*="ApplicationForm"]');
    }

    /* ── SmartRecruiters ──────────────────────────────────────────*/
    if (CURRENT_ATS === 'SmartRecruiters') {
      if (url.includes('/apply') || path.includes('/jobs/')) return true;
      return document.querySelectorAll(
        'input[name="first_name"],input[name="last_name"],input[name="email"]'
      ).length > 0;
    }

    /* ── OracleCloud / Taleo ──────────────────────────────────────*/
    if (CURRENT_ATS === 'OracleCloud') {
      return url.includes('/apply') || url.includes('/requisition') ||
             !!document.querySelector('#OracleFusionApp,oracle-apply-flow') ||
             document.querySelectorAll('input:not([type=hidden])').length > 2;
    }

    /* ── GoHire / Forhyre ─────────────────────────────────────────
     * v6.5: OptimHire v2.5.3 added native gh-widget support — be
     * permissive so the auto-trigger runs on the application modal. */
    if (CURRENT_ATS === 'GoHire') {
      return true;
    }

    /* ── Job boards (Indeed, Reed, Glassdoor…) ───────────────────────
     * Only their own apply step — never search / listing pages. */
    if (onJobBoard()) return boardApplyFlowOpen();

    /* ── All other recognised ATS ─────────────────────────────────
     * If we're on a known ATS domain, be permissive:
     * 2+ fields (not the site's search / header boxes) is enough.     */
    return [...document.querySelectorAll(
      'input:not([type=hidden]):not([type=file]):not([type=submit]):not([type=button]),textarea'
    )].filter(el => !isPageChromeField(el)).length >= 2;
  }

  /** Inject/update the "Autofill in progress" banner */
  function showAutofillBanner(status, atsName) {
    let banner = document.getElementById('oh-autofill-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'oh-autofill-banner';
      banner.style.cssText = `
        position:fixed;top:0;left:0;right:0;z-index:2147483647;
        padding:10px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        font-size:13px;font-weight:600;text-align:center;
        transition:background .3s ease,color .3s ease;pointer-events:none;
        box-shadow:0 2px 12px rgba(0,0,0,.2);
      `;
      document.body.appendChild(banner);
    }
    const name = atsName || CURRENT_ATS || 'ATS';
    if (status === 'detecting') {
      banner.textContent = `🔍 ${name} detected — starting autofill…`;
      banner.style.background = 'linear-gradient(135deg,#1e40af,#7c3aed)';
      banner.style.color = '#fff';
    } else if (status === 'filling') {
      banner.textContent = `⚡ Autofill in progress — filling ${name} form…`;
      banner.style.background = 'linear-gradient(135deg,#2563eb,#7c3aed)';
      banner.style.color = '#fff';
    } else if (status === 'done') {
      banner.textContent = '✅ Autofill complete — please review and submit';
      banner.style.background = 'linear-gradient(135deg,#059669,#10b981)';
      banner.style.color = '#fff';
      setTimeout(() => { if (banner.parentNode) banner.remove(); }, 5000);
    }
  }

  /** Strong "this is a job application form" detector for pages on an
      UNRECOGNISED ATS (CURRENT_ATS is null). Requires 3+ visible inputs
      AND (a resume file-upload OR an apply/submit button) so we only
      auto-fill genuine application forms, never random login/search forms. */
  function genericApplicationFormPresent() {
    try {
      const inputs = document.querySelectorAll(
        'input:not([type=hidden]):not([type=submit]):not([type=button]),textarea,select'
      );
      let vis = 0;
      for (const el of inputs) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && !isPageChromeField(el)) { vis++; if (vis >= 3) break; }
      }
      if (vis < 3) return false;
      if (document.querySelector('input[type=file]')) return true;
      const btns = document.querySelectorAll('button,[role="button"],input[type=submit]');
      for (const b of btns) {
        const t = ((b.innerText || b.value || b.textContent || '') + '').trim();
        if (/\b(apply|submit)\b/i.test(t)) return true;
      }
      return false;
    } catch (_) { return false; }
  }

  /** Run the full auto-trigger flow */
  let _autoTriggered = false;
  let _autoTriggerRunning = false;

  async function autoTriggerAutofill() {
    /* Guards */
    if (wdEngineOwns()) return;
    if (_autoTriggerRunning) return;
    if (_autoTriggered)      return;
    /* On a RECOGNISED ATS we always proceed. On an UNRECOGNISED ATS
       (CURRENT_ATS null) OptimHire often gives up and shows "fill out
       manually" — but we still want zero manual work, so we proceed if
       a genuine application form is present and let the generic
       autoFillPage() handle it (then T43 auto-submits). */
    if (!CURRENT_ATS && !genericApplicationFormPresent()) return;

    const { csvActiveJobId } = await ST.get('csvActiveJobId');
    if (csvActiveJobId) return; /* CSV bridge handles it */

    /* v6.1: Default OFF — only auto-trigger when the user is in an
     * automation session (background auto-apply running, or they just
     * clicked Autofill). This prevents random refills on every ATS
     * page the user happens to browse. */
    const { ohAutoTrigger } = await ST.get('ohAutoTrigger');
    if (ohAutoTrigger === false) return; /* user explicitly disabled */
    const active = await isAutomationActive();
    if (ohAutoTrigger !== true && !active) return;   // unset → only during a run
    /* "Auto-fill on supported ATS pages" while browsing: a job board's
       search / listing pages are not application forms (Indeed fired here
       while the user was browsing); its own apply step is. During a run,
       only the job's own tab. */
    if (onJobBoard() && !(active && await isActiveJobTab()) && !boardApplyFlowOpen()) return;

    /* URL-dedup: don't fill same page twice */
    const norm = normalizeUrl(location.href);
    const { ohAutoFilledUrls = [] } = await ST.get('ohAutoFilledUrls');
    if (ohAutoFilledUrls.includes(norm)) return;

    /* ── Is this actually an application page? ── */
    if (!isApplicationPage()) {
      /* Silent: don't show any banner — just wait for DOM changes */
      LOG(`Auto-trigger: ${CURRENT_ATS} page, but no application form yet`);
      return;
    }

    /* Prevent re-entry */
    _autoTriggerRunning = true;
    _autoTriggered = true;

    /* Open OptimHire side panel + show banner */
    chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' }).catch(() => {});
    chrome.runtime.sendMessage({ type: 'SIDEBAR_STATUS', event: 'ats_detected', atsName: CURRENT_ATS, url: location.href }).catch(() => {});
    showAutofillBanner('detecting', CURRENT_ATS);
    acquireWakeLock();
    LOG(`Auto-trigger: ${CURRENT_ATS} application form detected — autofilling`);

    /* Short pause so the side panel renders */
    await sleep(800);
    showAutofillBanner('filling', CURRENT_ATS);
    chrome.runtime.sendMessage({ type: 'SIDEBAR_STATUS', event: 'analyzing_form', atsName: CURRENT_ATS, url: location.href }).catch(() => {});

    try {
      /* ATS-specific autofill (all platforms via shared helper) */
      _fillActive = true;
      await runAtsAutofill();
      await solveCaptcha();
      await sleep(500);
      await detectAndFixValidationErrors();
      // Extra sanitize passes — OptimHire may fill after us
      await sleep(700);  await sanitizeBadFills();
      await sleep(1000); await sanitizeBadFills();
      _fillActive = false;

      /* Remember */
      ohAutoFilledUrls.push(norm);
      while (ohAutoFilledUrls.length > 500) ohAutoFilledUrls.shift();
      await ST.set({ ohAutoFilledUrls });

      showAutofillBanner('done');
      LOG('Auto-trigger: complete');
    } catch (err) {
      LOG('Auto-trigger: error', err);
      showAutofillBanner('done');
    } finally {
      _autoTriggerRunning = false;
    }
  }

  /* ── Initial trigger after page load ──
     Run the trigger machinery on recognised ATSes AND on any page whose
     URL looks like a job application (so unrecognised ATSes like relay /
     careers-page that OptimHire can't handle still get auto-filled +
     auto-submitted — zero manual work). autoTriggerAutofill() itself
     still requires a genuine application form + active automation, so
     this never fills random pages. */
  const _APPLY_PATH_RE = /\/(apply|application|jobs?|careers?|join|positions?|openings?|vacanc)/i;
  /* NEVER run the generic trigger on optimhire.com itself — its own
     pages (/d/my-jobs, /d/membership, resume/cover-letter editors)
     contain "jobs" in the path and would otherwise be auto-filled,
     disturbing OptimHire's own flow. optimhire.com is handled by
     OptimHire + our T39/T40 clickers, never by the generic autofill. */
  const _isOptimhire = /optimhire\.com$/i.test(location.hostname) ||
                       /\.optimhire\.com$/i.test(location.hostname);
  const _looksApplyPage = !_isOptimhire &&
    (_APPLY_PATH_RE.test(location.pathname) || _APPLY_PATH_RE.test(location.href));
  if (CURRENT_ATS || _looksApplyPage) {
    /* First attempt after 2.5 s (most SPAs have rendered by then) */
    sleep(2500).then(() => autoTriggerAutofill());

    /* ── SPA navigation watcher (URL changes without full reload) ── */
    let _lastHref = location.href;
    setInterval(() => {
      if (location.href !== _lastHref) {
        _lastHref     = location.href;
        _autoTriggered = false;
        _autoTriggerRunning = false;
        sleep(2000).then(() => autoTriggerAutofill());
      }
    }, 2000); // v6.1: 1s → 2s, less CPU overhead on idle pages

    /* ── DOM mutation watcher: fires when modal/form appears ──────
     * v6.1: heavily gated to avoid the patch reacting to every layout
     * change on LinkedIn / company sites the user is just browsing.
     * Requires (a) significant new node count AND (b) a form-like
     * element actually being added AND (c) automation to be active
     * OR the page to be a known application URL (jobs/apply/career).
     *
     * Throttled to one evaluation every 4s; requires new form/input
     * nodes AND active automation OR an apply-page URL.            */
    const APPLY_URL_RE = /\/(apply|application|jobs?|careers?|join)([\/?#]|$)/i;
    let _mutationDebounce = null;
    let _mutationFired = 0;
    new MutationObserver(mutations => {
      if (_autoTriggerRunning) return;
      if (_autoTriggered) return;
      if (Date.now() - _mutationFired < 4000) return;
      const added = mutations.reduce((n, m) => n + m.addedNodes.length, 0);
      if (added < 4) return;
      // Only proceed if a form/input was actually added in this batch
      let hasForm = false;
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches?.('form, input, textarea, select, dialog, [role="dialog"]') ||
              node.querySelector?.('form, input:not([type=hidden]), textarea, select')) {
            hasForm = true; break;
          }
        }
        if (hasForm) break;
      }
      if (!hasForm) return;
      _mutationFired = Date.now();
      clearTimeout(_mutationDebounce);
      _mutationDebounce = setTimeout(async () => {
        // Final gate: require automation OR the URL itself looks like an apply page
        const looksApply = APPLY_URL_RE.test(location.pathname) || APPLY_URL_RE.test(location.href);
        const active = await isAutomationActive();
        if (!active && !looksApply) return;
        autoTriggerAutofill();
      }, 1500);
    }).observe(document.body, { childList: true, subtree: true });
  }

  /* ══════════════════════════════════════════════════════════════
   * T20: CSV Auto-Apply Floating Overlay
   * LazyApply-style "Automation In Progress" panel injected via
   * Shadow DOM on the active automation tab.  Shows job progress,
   * Pause / Skip / Quit controls, and auto-removes when done.
   * ═════════════════════════════════════════════════════════════ */
  (function initCsvOverlay() {
    const OVERLAY_ID = 'oh-csv-overlay-host';
    let overlayHost = null;
    let shadow      = null;
    let _isPaused   = false;
    let _isMinimized = false;
    let _totalJobs  = 0;
    let _completedJobs = 0;
    let _currentIndex  = 0;
    let _activeJobUrl  = '';
    let _syncInterval  = null;

    /* ── Verify this is the active automation tab ── */
    async function isAutomationTab() {
      try {
        const data = await ST.get(['csvActiveJobId', 'csvQueueRunning', 'csvActiveTabId']);
        if (!data.csvActiveJobId || !data.csvQueueRunning) return false;
        // Ask background if this tab matches copilotTabId
        return new Promise(resolve => {
          try {
            chrome.runtime.sendMessage({ action: 'COPILOT_TABID' }, resp => {
              if (chrome.runtime.lastError) { resolve(false); return; }
              resolve(!!resp?.sameTab);
            });
          } catch (_) { resolve(false); }
        });
      } catch (_) { return false; }
    }

    /* ── Read queue stats from storage ── */
    async function readQueueStats() {
      try {
        const { csvJobQueue: q = [] } = await ST.get('csvJobQueue');
        const total   = q.length;
        const pending = q.filter(j => j.status === 'pending').length;
        const running = q.filter(j => j.status === 'running').length;
        const done    = q.filter(j => j.status === 'done').length;
        const failed  = q.filter(j => j.status === 'failed').length;
        const skipped = q.filter(j => j.status === 'skipped').length;
        const dupes   = q.filter(j => j.status === 'duplicate').length;
        const completed = done + failed + skipped + dupes;
        const runIdx = q.findIndex(j => j.status === 'running');
        return { total, pending, running, done, failed, skipped, dupes, completed, runIdx, queue: q };
      } catch (_) { return { total: 0, pending: 0, running: 0, done: 0, failed: 0, skipped: 0, dupes: 0, completed: 0, runIdx: -1, queue: [] }; }
    }

    /* ── Create overlay DOM inside Shadow DOM ── */
    function createOverlay() {
      if (document.getElementById(OVERLAY_ID)) return;

      overlayHost = document.createElement('div');
      overlayHost.id = OVERLAY_ID;
      overlayHost.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
      document.body.appendChild(overlayHost);

      shadow = overlayHost.attachShadow({ mode: 'closed' });

      const style = document.createElement('style');
      style.textContent = `
        *{box-sizing:border-box;margin:0;padding:0}
        :host{all:initial;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
        .overlay{
          width:340px;background:linear-gradient(135deg,#1a1e2e,#141826);
          border:1px solid rgba(99,102,241,.3);border-radius:14px;
          box-shadow:0 8px 32px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.05);
          color:#e2e8f0;font-size:13px;overflow:hidden;
          transition:width .3s ease,height .3s ease;
          user-select:none;
        }
        .overlay.minimized .ov-body{display:none}
        .overlay.minimized{width:auto;border-radius:12px}

        /* Header / drag handle */
        .ov-header{
          display:flex;align-items:center;justify-content:space-between;
          padding:12px 14px;cursor:move;
          background:linear-gradient(135deg,rgba(99,102,241,.15),rgba(139,92,246,.15));
          border-bottom:1px solid rgba(99,102,241,.2);
        }
        .ov-header-left{display:flex;align-items:center;gap:8px}
        .ov-pulse{
          width:8px;height:8px;border-radius:50%;background:#4ade80;flex-shrink:0;
          animation:ovPulse 1.5s ease-in-out infinite;
        }
        .ov-pulse.paused{background:#fbbf24;animation:none}
        .ov-pulse.done{background:#22c55e;animation:none}
        @keyframes ovPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.7)}}
        .ov-title{font-size:12px;font-weight:700;letter-spacing:.03em;color:#c7d2fe}
        .ov-header-btns{display:flex;gap:4px}
        .ov-header-btns button{
          background:none;border:none;color:#94a3b8;cursor:pointer;
          width:24px;height:24px;display:flex;align-items:center;justify-content:center;
          border-radius:6px;font-size:14px;transition:all .15s;
        }
        .ov-header-btns button:hover{background:rgba(255,255,255,.1);color:#e2e8f0}

        /* Mini badge when minimized */
        .ov-mini-badge{
          display:none;padding:2px 10px;font-size:12px;font-weight:700;
          color:#c7d2fe;white-space:nowrap;
        }
        .overlay.minimized .ov-mini-badge{display:inline}

        /* Body */
        .ov-body{padding:14px}

        /* Job counter */
        .ov-counter{
          font-size:20px;font-weight:800;text-align:center;margin-bottom:6px;
          background:linear-gradient(135deg,#818cf8,#a78bfa);
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;
          background-clip:text;
        }
        .ov-subtitle{font-size:11px;color:#64748b;text-align:center;margin-bottom:12px}

        /* Progress bar */
        .ov-progress-track{
          height:6px;background:rgba(255,255,255,.08);border-radius:3px;
          margin-bottom:10px;overflow:hidden;
        }
        .ov-progress-fill{
          height:100%;border-radius:3px;transition:width .5s ease;
          background:linear-gradient(90deg,#6366f1,#8b5cf6);
        }

        /* Current job */
        .ov-job{
          background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);
          border-radius:8px;padding:8px 10px;margin-bottom:10px;
        }
        .ov-job-label{font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px}
        .ov-job-url{
          font-size:12px;color:#93c5fd;word-break:break-all;
          display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
        }

        /* Status line */
        .ov-status{font-size:12px;margin-bottom:12px;display:flex;align-items:center;gap:6px}
        .ov-status-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
        .ov-status-dot.running{background:#4ade80}
        .ov-status-dot.success{background:#22c55e}
        .ov-status-dot.failed{background:#f87171}
        .ov-status-dot.paused{background:#fbbf24}

        /* Stats row */
        .ov-stats{display:flex;gap:6px;margin-bottom:12px}
        .ov-stat{
          flex:1;text-align:center;padding:6px 4px;
          background:rgba(255,255,255,.03);border-radius:6px;
          border:1px solid rgba(255,255,255,.05);
        }
        .ov-stat-val{font-size:14px;font-weight:700}
        .ov-stat-val.s-done{color:#4ade80}
        .ov-stat-val.s-fail{color:#f87171}
        .ov-stat-val.s-skip{color:#fbbf24}
        .ov-stat-lbl{font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-top:1px}

        /* Buttons */
        .ov-controls{display:flex;gap:6px}
        .ov-btn{
          flex:1;padding:8px 0;border:none;border-radius:8px;
          font-size:12px;font-weight:600;cursor:pointer;
          transition:all .15s;display:flex;align-items:center;justify-content:center;gap:4px;
        }
        .ov-btn:active{transform:scale(.96)}
        .ov-btn-pause{background:rgba(99,102,241,.2);color:#a5b4fc;border:1px solid rgba(99,102,241,.3)}
        .ov-btn-pause:hover{background:rgba(99,102,241,.35)}
        .ov-btn-skip{background:rgba(251,191,36,.15);color:#fde68a;border:1px solid rgba(251,191,36,.25)}
        .ov-btn-skip:hover{background:rgba(251,191,36,.3)}
        .ov-btn-quit{background:rgba(239,68,68,.15);color:#fca5a5;border:1px solid rgba(239,68,68,.25)}
        .ov-btn-quit:hover{background:rgba(239,68,68,.3)}

        /* Done state */
        .ov-done-msg{
          text-align:center;padding:8px 0;font-size:14px;font-weight:700;
          color:#4ade80;display:none;
        }
        .overlay.all-done .ov-done-msg{display:block}
        .overlay.all-done .ov-controls{display:none}
        .overlay.all-done .ov-status{display:none}
      `;

      const container = document.createElement('div');
      container.className = 'overlay';
      container.innerHTML = `
        <div class="ov-header">
          <div class="ov-header-left">
            <div class="ov-pulse"></div>
            <span class="ov-title">Automation In Progress</span>
            <span class="ov-mini-badge"></span>
          </div>
          <div class="ov-header-btns">
            <button class="ov-minimize" title="Minimize">─</button>
            <button class="ov-close" title="Stop & Close">✕</button>
          </div>
        </div>
        <div class="ov-body">
          <div class="ov-counter">Job 0 of 0</div>
          <div class="ov-subtitle">Auto-applying to job applications</div>
          <div class="ov-progress-track"><div class="ov-progress-fill" style="width:0%"></div></div>
          <div class="ov-job">
            <div class="ov-job-label">Current Job</div>
            <div class="ov-job-url">Waiting...</div>
          </div>
          <div class="ov-status">
            <div class="ov-status-dot running"></div>
            <span class="ov-status-text">Starting automation...</span>
          </div>
          <div class="ov-stats">
            <div class="ov-stat"><div class="ov-stat-val s-done" data-stat="done">0</div><div class="ov-stat-lbl">Applied</div></div>
            <div class="ov-stat"><div class="ov-stat-val s-fail" data-stat="failed">0</div><div class="ov-stat-lbl">Failed</div></div>
            <div class="ov-stat"><div class="ov-stat-val s-skip" data-stat="skipped">0</div><div class="ov-stat-lbl">Skipped</div></div>
          </div>
          <div class="ov-controls">
            <button class="ov-btn ov-btn-pause">⏸ Pause</button>
            <button class="ov-btn ov-btn-skip">⏭ Skip</button>
            <button class="ov-btn ov-btn-quit">⏹ Quit</button>
          </div>
          <div class="ov-done-msg">All Done!</div>
        </div>
      `;

      shadow.appendChild(style);
      shadow.appendChild(container);

      /* ── Drag logic ── */
      const header = shadow.querySelector('.ov-header');
      let isDragging = false, dragX = 0, dragY = 0;
      header.addEventListener('mousedown', e => {
        if (e.target.closest('button')) return;
        isDragging = true;
        dragX = e.clientX - overlayHost.getBoundingClientRect().left;
        dragY = e.clientY - overlayHost.getBoundingClientRect().top;
        e.preventDefault();
      });
      document.addEventListener('mousemove', e => {
        if (!isDragging) return;
        let nx = e.clientX - dragX;
        let ny = e.clientY - dragY;
        nx = Math.max(0, Math.min(window.innerWidth - 60, nx));
        ny = Math.max(0, Math.min(window.innerHeight - 40, ny));
        overlayHost.style.left   = nx + 'px';
        overlayHost.style.top    = ny + 'px';
        overlayHost.style.right  = 'auto';
        overlayHost.style.bottom = 'auto';
      });
      document.addEventListener('mouseup', () => { isDragging = false; });

      /* ── Minimize toggle ── */
      shadow.querySelector('.ov-minimize').addEventListener('click', () => {
        _isMinimized = !_isMinimized;
        container.classList.toggle('minimized', _isMinimized);
        shadow.querySelector('.ov-minimize').textContent = _isMinimized ? '□' : '─';
        updateMiniBadge();
      });

      /* ── Close / Quit ── */
      const removeOverlay = () => {
        try { chrome.runtime.sendMessage({ type: 'STOP_CSV_QUEUE' }).catch(() => {}); } catch (_) {}
        destroyOverlay();
      };
      shadow.querySelector('.ov-close').addEventListener('click', removeOverlay);
      shadow.querySelector('.ov-btn-quit').addEventListener('click', removeOverlay);

      /* ── Pause / Resume ── */
      shadow.querySelector('.ov-btn-pause').addEventListener('click', () => {
        _isPaused = !_isPaused;
        const btn = shadow.querySelector('.ov-btn-pause');
        const pulse = shadow.querySelector('.ov-pulse');
        const statusDot = shadow.querySelector('.ov-status-dot');
        if (_isPaused) {
          try { chrome.runtime.sendMessage({ type: 'PAUSE_CSV_QUEUE' }).catch(() => {}); } catch (_) {}
          btn.textContent = '▶ Resume';
          pulse.classList.add('paused');
          statusDot.className = 'ov-status-dot paused';
          shadow.querySelector('.ov-status-text').textContent = 'Paused';
          shadow.querySelector('.ov-title').textContent = 'Automation Paused';
        } else {
          try { chrome.runtime.sendMessage({ type: 'RESUME_CSV_QUEUE' }).catch(() => {}); } catch (_) {}
          btn.textContent = '⏸ Pause';
          pulse.classList.remove('paused');
          statusDot.className = 'ov-status-dot running';
          shadow.querySelector('.ov-status-text').textContent = 'Filling application form...';
          shadow.querySelector('.ov-title').textContent = 'Automation In Progress';
        }
      });

      /* ── Skip ── */
      shadow.querySelector('.ov-btn-skip').addEventListener('click', () => {
        try { chrome.runtime.sendMessage({ type: 'SKIP_CSV_JOB' }).catch(() => {}); } catch (_) {}
        shadow.querySelector('.ov-status-text').textContent = 'Skipping current job...';
      });

      LOG('CSV overlay created');
    }

    function destroyOverlay() {
      if (overlayHost && overlayHost.parentNode) {
        overlayHost.parentNode.removeChild(overlayHost);
      }
      overlayHost = null;
      shadow = null;
      if (_syncInterval) { clearInterval(_syncInterval); _syncInterval = null; }
    }

    function updateMiniBadge() {
      if (!shadow) return;
      const badge = shadow.querySelector('.ov-mini-badge');
      if (badge) badge.textContent = `${_completedJobs} / ${_totalJobs}`;
    }

    /* ── Update the overlay UI ── */
    function updateOverlayUI(stats) {
      if (!shadow) return;
      const { total, done, failed, dupes, completed, runIdx, queue } = stats;
      _totalJobs = total;
      _completedJobs = completed;

      // Find running job
      const runningJob = queue.find(j => j.status === 'running');
      const currentIdx = runningJob ? queue.indexOf(runningJob) + 1 : completed;

      shadow.querySelector('.ov-counter').textContent = `Job ${currentIdx} of ${total}`;
      const pct = total > 0 ? Math.round(completed / total * 100) : 0;
      shadow.querySelector('.ov-progress-fill').style.width = pct + '%';
      shadow.querySelector('.ov-subtitle').textContent = `${pct}% complete · ${total - completed} remaining`;

      if (runningJob) {
        shadow.querySelector('.ov-job-url').textContent = runningJob.url;
      }

      shadow.querySelector('[data-stat="done"]').textContent = done;
      shadow.querySelector('[data-stat="failed"]').textContent = failed;
      shadow.querySelector('[data-stat="skipped"]').textContent = (stats.skipped || 0) + dupes;

      updateMiniBadge();
    }

    /* ── Show "all done" state ── */
    function showDoneState() {
      if (!shadow) return;
      const container = shadow.querySelector('.overlay');
      container.classList.add('all-done');
      shadow.querySelector('.ov-pulse').classList.add('done');
      shadow.querySelector('.ov-title').textContent = 'Automation Complete';
      shadow.querySelector('.ov-done-msg').style.display = 'block';
      // Auto-remove after 8s
      setTimeout(destroyOverlay, 8000);
    }

    /* ── Listen for messages from background ── */
    chrome.runtime.onMessage.addListener(msg => {
      if (!msg || !msg.type) return;

      if (msg.type === 'CSV_JOB_STARTED') {
        if (!shadow) {
          // Create overlay if this is the automation tab
          isAutomationTab().then(isActive => {
            if (!isActive) return;
            createOverlay();
            readQueueStats().then(updateOverlayUI);
          });
        } else {
          shadow.querySelector('.ov-job-url').textContent = msg.url || '';
          if (!_isPaused) {
            shadow.querySelector('.ov-status-text').textContent = 'Filling application form...';
            shadow.querySelector('.ov-status-dot').className = 'ov-status-dot running';
          }
          readQueueStats().then(updateOverlayUI);
        }
      }

      if (msg.type === 'CSV_JOB_COMPLETE') {
        if (!shadow) return;
        const statusMap = {
          done:      'Applied successfully',
          failed:    'Failed' + (msg.reason ? ': ' + msg.reason.slice(0, 40) : ''),
          skipped:   'Skipped' + (msg.reason ? ': ' + msg.reason.slice(0, 40) : ''),
          duplicate: 'Already applied — skipped',
        };
        const dotClass = msg.status === 'done' ? 'success' : msg.status === 'failed' ? 'failed' : 'running';
        shadow.querySelector('.ov-status-text').textContent = statusMap[msg.status] || msg.status;
        shadow.querySelector('.ov-status-dot').className = 'ov-status-dot ' + dotClass;
        readQueueStats().then(updateOverlayUI);
      }

      if (msg.type === 'CSV_QUEUE_DONE') {
        readQueueStats().then(stats => {
          updateOverlayUI(stats);
          showDoneState();
        });
      }

      if (msg.type === 'CSV_QUEUE_PAUSED') {
        _isPaused = true;
        if (shadow) {
          shadow.querySelector('.ov-btn-pause').textContent = '▶ Resume';
          shadow.querySelector('.ov-pulse').classList.add('paused');
          shadow.querySelector('.ov-status-dot').className = 'ov-status-dot paused';
          shadow.querySelector('.ov-status-text').textContent = 'Paused';
          shadow.querySelector('.ov-title').textContent = 'Automation Paused';
        }
      }
    });

    /* ── Initial check: if automation is already running, show overlay ── */
    async function showOverlay() {
      const active = await isAutomationTab();
      if (!active) return;
      createOverlay();
      const stats = await readQueueStats();
      updateOverlayUI(stats);
    }

    // Check on page load
    sleep(1500).then(showOverlay);

    // Periodic sync (handles tab reloads, external stops, etc.)
    _syncInterval = setInterval(async () => {
      try {
        const data = await ST.get(['csvQueueRunning']);
        if (!data.csvQueueRunning) {
          if (shadow) destroyOverlay();
          return;
        }
        if (shadow) {
          const stats = await readQueueStats();
          updateOverlayUI(stats);
        }
      } catch (_) {
        // Extension context invalidated — stop syncing
        clearInterval(_syncInterval);
        _syncInterval = null;
      }
    }, 4000);

  })();

  /* ════════════════════════════════════════════════════════════
     CSV JOB QUEUE RUNNER — content-script side
     ════════════════════════════════════════════════════════════
     When the user starts the CSV queue (via Queue Manager), each
     pending job is opened in a tab. This runner notices that the
     current page IS the active queue job, lets the existing autofill
     pipeline do its thing (it already fires because we made
     isAutomationActive include ohJobQueueActive), then watches for
     completion and advances to the next pending job.

     Completion signals (any of):
       - URL navigated to a thank-you / confirmation / success URL
       - Body text contains a success phrase
       - markSubmitAttempted was called AND no validation error
         appeared within 8s after
       - The whole job's hard time budget (JOB_TIMEOUT_MS) elapses
         → mark failed and move on so the queue can't hang
     ────────────────────────────────────────────────────────── */
  (function installQueueRunner() {
    const POLL_MS         = 2_000;
    const JOB_TIMEOUT_MS  = 180_000;  // 3 min hard cap per job
    const WD_JOB_TIMEOUT_MS = 480_000; // Workday: many steps plus the account
    const NO_FORM_GRACE_MS = 18_000;  // if no fillable form by now → unsupported, skip
    const SUBMIT_GRACE_MS = 8_000;    // wait this long after submit before declaring success
    const CONFIRM_WAIT_MS = 30_000;   // keep looking for a REAL confirmation this long after submit
    const VALIDATION_STUCK_MS = 50_000; // validation errors persisting this long → fail fast
    const SUCCESS_TEXT_RE = /application\s+(was\s+|has\s+been\s+)?(submitted|received|complete|sent)\b|thank\s+you\s+for\s+(applying|your\s+application|your\s+interest)|we['’]ve\s+received\s+your\s+application|we\s+have\s+received\s+your\s+application|your\s+application\s+has\s+been\s+(received|submitted)|application\s+successful/i;
    const SUCCESS_URL_RE  = /(thank|success|confirm|complete|received|submitted|done)/i;
    const FAILURE_TEXT_RE = /(already\s+applied|application\s+already\s+submitted|you\s+have\s+already\s+applied|no\s+application\s+(form|available)|job\s+is\s+no\s+longer\s+available|this\s+position\s+is\s+closed|posting\s+is\s+closed|application\s+window\s+has\s+closed|page\s+not\s+found|404)/i;

    let _currentJob = null;
    let _advancing = false;
    let _jobStartTs = 0;
    let _submitSeenAt = 0;
    let _validErrSince = 0;

    function urlsRoughlyMatch(a, b) {
      try {
        const ua = new URL(a), ub = new URL(b);
        if (ua.hostname.toLowerCase() !== ub.hostname.toLowerCase()) return false;
        /* Compare the full path segment-by-segment so two DIFFERENT jobs
           on the same board (…/acme/jobs/111 vs …/acme/jobs/222) are NOT
           treated as the same job — that previously let a parallel tab
           attach to the wrong job and write its status. We still tolerate
           a post-submit redirect where only the LAST step changes
           (…/jobs/123/apply → …/jobs/123/thanks) by allowing the final
           compared segment to differ when it's an action/step word. */
        const pa = ua.pathname.split('/').filter(Boolean);
        const pb = ub.pathname.split('/').filter(Boolean);
        if (!pa.length || !pb.length) return true;
        const ACTION = /^(apply|application|apply-now|start|step\d*|thanks|thank-you|thankyou|success|confirm|confirmation|complete|completed|received|submitted|submit|done|review|finish)$/i;
        const n = Math.min(pa.length, pb.length);
        for (let i = 0; i < n; i++) {
          if (pa[i] === pb[i]) continue;
          /* Only the final compared segment may differ, and only if it
             looks like an apply/confirmation step — never a job id. */
          if (i === n - 1 && (ACTION.test(pa[i]) || ACTION.test(pb[i]))) continue;
          return false;
        }
        return true;
      } catch (_) { return false; }
    }

    function pageHasSuccess() {
      try {
        if (SUCCESS_URL_RE.test(location.pathname.toLowerCase())) return true;
        const t = (document.body && document.body.innerText || '').slice(0, 4000);
        return SUCCESS_TEXT_RE.test(t);
      } catch (_) { return false; }
    }
    function pageHasFailure() {
      try {
        const t = (document.body && document.body.innerText || '').slice(0, 4000);
        return FAILURE_TEXT_RE.test(t);
      } catch (_) { return false; }
    }
    function pageHasValidationError() {
      try {
        return !!document.querySelector(
          '[aria-invalid="true"],.error,.is-invalid,[class*="field-error"],' +
          '[class*="fieldError"],[role="alert"]'
        );
      } catch (_) { return false; }
    }
    /* Is there an application form we could actually fill? Used to
       skip unsupported pages (no inputs + no submit button) instead
       of waiting the full timeout. Errs toward "yes" (returns true on
       any sign of a form) so we never skip a fillable page. */
    function hasApplicationForm() {
      try {
        const inputs = document.querySelectorAll(
          'input:not([type=hidden]):not([type=submit]):not([type=button]),' +
          'textarea, select, [contenteditable="true"]'
        );
        let visibleInputs = 0;
        for (const el of inputs) { if (isVisible(el)) { visibleInputs++; if (visibleInputs >= 2) break; } }
        if (visibleInputs >= 2) return true;
        /* A file-upload (resume dropzone) also counts as a form */
        for (const f of document.querySelectorAll('input[type=file]')) {
          if (isVisible(f) || f.offsetParent !== null) return true;
        }
        /* A submit/apply button present means an applyable page */
        const btns = document.querySelectorAll('button,[role="button"],input[type=submit],a');
        for (const b of btns) {
          if (!isVisible(b)) continue;
          const t = ((b.innerText || b.value || b.textContent || '') + '').trim();
          if (/\b(apply|submit|continue|next|save\s*&\s*next)\b/i.test(t)) return true;
        }
        return false;
      } catch (_) { return true; } /* on error, assume form exists (don't skip) */
    }

    async function loadCurrentJob() {
      try {
        const d = await ST.get(['ohJobQueueActive', 'ohJobQueueCurrentId', 'ohJobQueue']);
        if (!d.ohJobQueueActive) return null;
        const q = Array.isArray(d.ohJobQueue) ? d.ohJobQueue : [];
        /* Match THIS tab to a running job by URL. This supports running
           several job tabs in parallel (each tab finds its own job),
           and means we never act on the OptimHire my-jobs tab or any
           other tab whose URL isn't one of our running queue jobs. */
        const byUrl = q.find(j => j.status === 'running' && urlsRoughlyMatch(location.href, j.url));
        if (byUrl) return byUrl;
        /* Fallback to the single-current-id model (used by the
           self-navigate degraded path when the manager tab is closed). */
        if (d.ohJobQueueCurrentId) {
          return q.find(j => j.id === d.ohJobQueueCurrentId) || null;
        }
        return null;
      } catch (_) { return null; }
    }

    const ADVANCE_FALLBACK_MS = 8_000; // if manager doesn't open the next tab in time, self-navigate

    async function advance(job, status, error, extra) {
      if (_advancing) return; _advancing = true;
      try {
        const d = await ST.get(['ohJobQueue']);
        let q = Array.isArray(d.ohJobQueue) ? d.ohJobQueue : [];
        const i = q.findIndex(x => x.id === job.id);
        if (i >= 0) {
          q[i].status = status;
          q[i].appliedAt = status === 'applied' ? Date.now() : (q[i].appliedAt || 0);
          q[i].lastError = error || '';
          q[i].lastActionTs = Date.now();
          /* Honesty flag: 'applied' only means CONFIRMED when we actually
             saw a success page/confirmation. A submit-click with no error
             is NOT proof the application went through — that assumption is
             exactly why OptimHire's own counter overstates results. */
          if (extra && typeof extra === 'object') {
            if (extra.confirmed !== undefined) q[i].confirmed = !!extra.confirmed;
            if (extra.confirmedBy) q[i].confirmedBy = String(extra.confirmedBy).slice(0, 120);
          }
        }
        /* Mark this job done + emit an advance request. The Queue
           Manager (tabs/jobQueue.html — it has chrome.tabs access)
           consumes the request: it opens the NEXT job in a fresh tab
           and closes THIS one. We do NOT navigate this tab ourselves,
           so each job runs in its own isolated tab and the OptimHire
           my-jobs tab is never touched. */
        const reqTs = Date.now();
        await new Promise(res => ST.set({
          ohJobQueue: q,
          ohJobQueueAdvanceReq: { jobId: job.id, status, ts: reqTs },
        }, res));
        LOG(`[Queue Runner] ${job.title || job.url}: ${status} — requesting manager to advance`);

        /* Resilience fallback: if the manager tab is closed, nobody
           consumes the request. After ADVANCE_FALLBACK_MS, if the
           request is still pending (current job hasn't changed), we
           self-navigate THIS tab to the next pending job so the queue
           never stalls. */
        setTimeout(async () => {
          try {
            const dd = await ST.get(['ohJobQueueAdvanceReq', 'ohJobQueue', 'ohJobQueueActive', 'ohPreferAts']);
            const req = dd.ohJobQueueAdvanceReq;
            if (!req || req.ts !== reqTs) return;        // manager handled it
            if (!dd.ohJobQueueActive) return;            // queue stopped
            let qq = Array.isArray(dd.ohJobQueue) ? dd.ohJobQueue : [];
            /* Same order as the Queue Manager: ATS jobs first, Reed last. */
            const tier = jobRank;
            const pending = qq.filter(j => j.status === 'pending');
            const nx = dd.ohPreferAts === false ? pending[0]
              : pending.reduce((best, j) => (!best || tier(j.url) < tier(best.url) ? j : best), null);
            if (nx) {
              nx.status = 'running';
              nx.attempts = (nx.attempts || 0) + 1;
              nx.lastActionTs = Date.now();
              await new Promise(res => ST.set({
                ohJobQueue: qq,
                ohJobQueueCurrentId: nx.id,
                ohJobQueueStartTs: Date.now(),
                ohJobQueueAdvanceReq: null,
              }, res));
              LOG('[Queue Runner] manager idle — self-navigating to next job');
              try { location.href = nx.url; } catch (_) {}
            } else {
              await new Promise(res => ST.set({
                ohJobQueueActive: false,
                ohJobQueueCurrentId: null,
                ohJobQueueAdvanceReq: null,
              }, res));
              LOG('[Queue Runner] queue complete (fallback path)');
            }
          } catch (_) {}
        }, ADVANCE_FALLBACK_MS);
      } catch (e) {
        LOG('[Queue Runner] advance failed:', e);
      } finally {
        _advancing = false;
      }
    }

    /* Fill the current queue job's form ONCE, reusing the same pipeline
       as the normal auto-trigger. Guarded by _autoTriggered so we never
       double-fill if the normal trigger also fired on a recognised ATS. */
    let _queueFilledFor = '';
    async function ensureQueueAutofill(job) {
      if (_queueFilledFor === job.id) return;
      /* If the normal auto-trigger already handled / is handling this
         page, defer to it. */
      if (_autoTriggered || _autoTriggerRunning) { _queueFilledFor = job.id; return; }
      /* Wait until there's actually a fillable form on the page. */
      if (!hasApplicationForm()) return;
      _queueFilledFor = job.id;
      _autoTriggered = true;          // block the normal trigger from doubling up
      _autoTriggerRunning = true;
      LOG(`[Queue Runner] autofilling: ${job.title || job.url}`);
      try {
        _fillActive = true;
        await runAtsAutofill();
        try { await solveCaptcha(); } catch (_) {}
        await sleep(500);
        try { await detectAndFixValidationErrors(); } catch (_) {}
        await sleep(700);  try { await sanitizeBadFills(); } catch (_) {}
        await sleep(1000); try { await sanitizeBadFills(); } catch (_) {}
        LOG('[Queue Runner] autofill pass complete');
      } catch (e) {
        LOG('[Queue Runner] autofill error', e);
      } finally {
        _fillActive = false;
        _autoTriggerRunning = false;
      }
    }

    async function tick() {
      try {
        /* Iframe gate already bailed for non-ATS frames; only run this
           loop in the top frame. */
        if (window.top !== window.self) return;
        const job = await loadCurrentJob();
        if (!job) { _currentJob = null; _jobStartTs = 0; _submitSeenAt = 0; return; }
        if (!urlsRoughlyMatch(location.href, job.url)) return; // wrong tab/page

        if (_currentJob !== job.id) {
          _currentJob = job.id;
          _jobStartTs = Date.now();
          _submitSeenAt = 0;
          _validErrSince = 0;
          LOG(`[Queue Runner] on job: ${job.title || job.url}`);
        }

        /* Workday: the Workday engine applies (sign-in, CV, every step,
           Submit) and says how it went; this only reads its result. */
        const wde = window.__ohWdEngine;
        if (wde && wde.isWorkday && wde.isWorkday()) {
          const r = wde.queueResult(job.id);
          if (r) {
            if (r.outcome === 'submitted') {
              await qaCommit('queue job confirmed');
              return advance(job, 'applied', '', { confirmed: true, confirmedBy: 'Workday confirmation' });
            }
            return advance(job, 'failed', `Workday: ${r.reason || r.outcome || 'could not finish'}`.slice(0, 200));
          }
          wde.startQueueJob(job);
          if (job.lastActionTs && Date.now() - job.lastActionTs > WD_JOB_TIMEOUT_MS) {
            return advance(job, 'failed', 'Workday: timed out');
          }
          return;
        }

        /* Proactively drive the autofill on this queue tab. The normal
           auto-trigger skips unrecognised ATS pages (no CURRENT_ATS +
           no generic form match), so queued jobs on unknown sites were
           opened but never filled. Since the queue KNOWS this tab is a
           job to apply to, kick the fill ourselves once a form appears. */
        ensureQueueAutofill(job);

        const now = Date.now();

        /* Reload-proof timeout. _jobStartTs resets on every page (re)load,
           so a page stuck in a reload loop never hit the per-instance
           timeout below. job.lastActionTs is the manager's open time and
           PERSISTS in storage across reloads, so this fails a runaway /
           reload-looping job instead of letting it spin forever. */
        if (job.lastActionTs && (now - job.lastActionTs) > JOB_TIMEOUT_MS) {
          return advance(job, 'failed', 'timeout / reload loop (no progress)');
        }

        /* Failure signals first */
        if (pageHasFailure()) {
          return advance(job, 'skipped', 'already-applied / posting closed');
        }

        /* Validation-error fast-fail: if the form shows persistent
           validation errors (a required field our autofill couldn't
           satisfy) and OptimHire isn't busy retrying, don't burn the
           full 3-min timeout. Track when errors first appeared; if they
           persist for VALIDATION_STUCK_MS, mark failed and move on. */
        if (!optimHireBusy() && pageHasValidationError()) {
          if (!_validErrSince) _validErrSince = now;
          else if (now - _validErrSince >= VALIDATION_STUCK_MS) {
            return advance(job, 'failed', 'validation errors could not be resolved');
          }
        } else {
          _validErrSince = 0; // errors cleared (or OH is working) → reset
        }

        /* Submit fired by our flow → start grace timer */
        if (_submitAttempted && !_submitSeenAt) _submitSeenAt = _submitAttemptTs || now;

        /* ── Success, honestly classified ──────────────────────────────
           CONFIRMED: the page itself shows a real confirmation (success
           text or a thank-you/confirmation URL). This is the only case
           we can truthfully call "applied".
           UNCONFIRMED: we clicked submit and no validation error appeared.
           That is NOT proof of submission — it is the same unverified
           assumption that makes OptimHire's counter overstate results
           (and why confirmation emails don't arrive). We now keep
           watching for a real confirmation for CONFIRM_WAIT_MS before
           settling, and when it never comes we still advance but record
           confirmed:false so the Queue Manager can show the truth. */
        if (pageHasSuccess()) {
          await qaCommit('queue job confirmed');   // before the manager closes this tab
          return advance(job, 'applied', '', { confirmed: true, confirmedBy: 'confirmation page detected' });
        }
        if (_submitSeenAt && !pageHasValidationError()) {
          const waited = now - _submitSeenAt;
          if (waited > CONFIRM_WAIT_MS) {
            return advance(job, 'applied',
              'submitted but NO confirmation detected — verify manually',
              { confirmed: false, confirmedBy: '' });
          }
          /* else: keep polling — a confirmation may still render. */
        }

        /* Unsupported / no application form → skip early instead of
           waiting the full 3-min timeout. After NO_FORM_GRACE_MS, if
           OptimHire isn't busy, our autofill never ran (no _fillActive
           history), no submit was attempted, AND the page has no
           fillable inputs + no submit-like button, treat it as
           unsupported and skip. This is the "if you don't recognise/
           support the ATS, skip" behaviour. */
        if (now - _jobStartTs > NO_FORM_GRACE_MS &&
            !optimHireBusy() && !_fillActive && !_submitSeenAt &&
            !hasApplicationForm()) {
          return advance(job, 'skipped', 'unsupported ATS / no application form');
        }

        /* Hard timeout */
        if (now - _jobStartTs > JOB_TIMEOUT_MS) {
          return advance(job, 'failed', 'timeout');
        }
      } catch (_) {}
    }

    setInterval(tick, POLL_MS);
    setTimeout(tick, 1500); // first kick after page settles
  })();

  /* ── T25b: Q&A memory learner — wiring ──────────────────────────────
   * Passive: two capture-phase listeners that only look at the clicked
   * button's text, and a storage read ONLY on pages of a tab that has a
   * pending snapshot. Works whether the user or the automation applies. */
  (function installQaMemoryLearner() {
    if (_IS_OH_PAGE) return;
    document.addEventListener('click', (ev) => {
      try {
        const t = ev.target && ev.target.closest &&
                  ev.target.closest('button,[role="button"],input[type=submit],input[type=button],a');
        if (!t) return;
        const txt = ((t.innerText || t.value || t.getAttribute('aria-label') || t.textContent || '') + '')
          .replace(/\s+/g, ' ').trim();
        if (!txt || txt.length > 60 || !QA_STEP_BTN_RE.test(txt) || QA_NOT_STEP_RE.test(txt)) return;
        qaSnapshot(`"${txt}"`, t.closest('form,[role="dialog"]'));
      } catch (_) {}
    }, true);
    document.addEventListener('submit', (ev) => qaSnapshot('form submit', ev.target), true);

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && (msg.type === 'COMPLEX_FORM_SUCCESS' || msg.type === 'APPLICATION_SUCCESS' ||
                  msg.type === 'JOB_APPLIED') && _qaPending) {
        qaCommit('OptimHire reported success');
      }
    });

    /* A multi-step form or the confirmation page after a submit: pick up
       this tab's pending snapshot and look for the confirmation. */
    const key = qaFlowKey(false);
    if (!key) return;
    Promise.resolve(ST.get(key)).then((d) => {
      const pend = d && d[key];
      if (!pend || typeof pend !== 'object') return;
      if (Date.now() - (pend.ts || 0) > QA_PENDING_TTL_MS) { Promise.resolve(ST.remove(key)).catch(() => {}); return; }
      _qaPending = _qaPending
        ? Object.assign({}, pend, _qaPending, { answers: Object.assign({}, pend.answers, _qaPending.answers) })
        : pend;
      qaWatchForSuccess(20_000);
    }).catch(() => {});
  })();

  LOG(`v5.0 loaded | ${CURRENT_ATS || HOST}`);
})();
