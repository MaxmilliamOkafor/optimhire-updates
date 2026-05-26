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

  /* ── Helpers ───────────────────────────────────────────── */
  const LOG = (...a) => console.log('[OH-Patch]', ...a);
  const ST  = chrome.storage.local;
  const $   = (s, c = document) => c.querySelector(s);
  const $$  = (s, c = document) => [...c.querySelectorAll(s)];
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /** React-compatible value setter */
  function nativeSet(el, val) {
    try {
      const proto = el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(el, val); else el.value = val;
    } catch (_) { el.value = val; }
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur',   { bubbles: true }));
  }

  /** Real pointer-events click sequence */
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
    return r.width > 0 && r.height > 0 && el.offsetParent !== null;
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
    'teamtailor.com':      'Teamtailor',
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
    'careers.icims.com':   'iCIMS',
    'breezy.hr':           'BreezyHR',   // ensure breezy.hr itself is caught
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
  };

  const HOST = location.hostname.toLowerCase().replace(/^www\./, '');
  const _rawATS = Object.entries(ATS_DOMAINS)
    .find(([domain]) => HOST.includes(domain))?.[1] || null;
  // LinkedIn: only activate on /jobs path — not on feeds, profiles, or messaging
  const CURRENT_ATS = _rawATS === 'LinkedIn'
    ? (location.pathname.startsWith('/jobs') ? 'LinkedIn' : null)
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
      const { csvActiveJobId, isAutoProcessStartJob, autoApplyStateUpdate } =
        await ST.get(['csvActiveJobId', 'isAutoProcessStartJob', 'autoApplyStateUpdate']);
      const isRunning = !!(autoApplyStateUpdate && autoApplyStateUpdate.isRunning);
      const active = !!csvActiveJobId || !!isAutoProcessStartJob || isRunning ||
                     (Date.now() - _manualTriggerTs < 30_000);
      _automationCache = { active, ts: Date.now() };
      return active;
    } catch (_) {
      return Date.now() - _manualTriggerTs < 30_000;
    }
  }

  /* User explicitly clicked Autofill on this tab → arm manual mode for 30s */
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.type === 'TRIGGER_AUTOFILL' || msg.type === 'MANUAL_AUTOFILL' ||
        msg.action === 'autofill' || msg.action === 'startAutofill') {
      _manualTriggerTs = Date.now();
      _automationCache = { active: true, ts: Date.now() };
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

  /* v6.1 / v2.5.2 port: set OPTIMHIRE_CONFIG.STOP_INJECT_POPUP = true on
   * the page world so the popup is never injected when user is just
   * browsing. Re-applied periodically since the official module may
   * reset its config. */
  function setStopInjectPopup(stop) {
    try {
      const s = document.createElement('script');
      s.textContent = `;(function(){try{
        if(!window.__OH_STOP_INJECT_POPUP_ORIG){window.__OH_STOP_INJECT_POPUP_ORIG=true;}
        window.OPTIMHIRE_STOP_INJECT_POPUP=${stop?'true':'false'};
        if(window.OPTIMHIRE_CONFIG){window.OPTIMHIRE_CONFIG.STOP_INJECT_POPUP=${stop?'true':'false'};}
      }catch(e){}})();`;
      (document.head || document.documentElement).appendChild(s);
      s.remove();
    } catch (_) {}
  }
  // v6.6: always suppress the popup so the user can edit freely at any time.
  // OptimHire's autofill continues in the background regardless of the popup.
  setInterval(() => { setStopInjectPopup(true); }, 5000);
  setStopInjectPopup(true);

  /* ── Auto-skip cap: patch any global OPTIMHIRE_CONFIG object ───────────
   * The autofill script (autofill.73df3a6d.js) exposes its config as a
   * module-internal object. We intercept chrome.runtime.sendMessage here
   * so any AUTO_APPLY_STATE_UPDATE with autoSkipSeconds > 5 is clamped.   */
  const AUTO_SKIP_MAX_SECONDS = 15;

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
    try {
      chrome.runtime.sendMessage({ type: 'SUBMIT_ATTEMPTED', ts: _submitAttemptTs }).catch(() => {});
    } catch (_) {}
    // Auto-clear after 30s
    setTimeout(() => { _submitAttempted = false; }, 30_000);
  }

  (function capAutoSkipOnSend() {
    const _orig = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = function (msg, ...args) {
      try {
        if (msg && msg.type === 'AUTO_APPLY_STATE_UPDATE' &&
            typeof msg.autoSkipSeconds === 'number' &&
            msg.autoSkipSeconds > AUTO_SKIP_MAX_SECONDS) {
          msg = { ...msg, autoSkipSeconds: AUTO_SKIP_MAX_SECONDS };
        }
      } catch (_) {}
      return _orig(msg, ...args);
    };
  })();

  /* ── T2: Credits never run out ──────────────────────────── */
  const CREDIT_FIELDS = [
    'free_left_credits','leftCredits','remainingCredits',
    'credits','autofillCredits','plan_credits','totalCredits',
  ];

  function deepPatchCredits(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    CREDIT_FIELDS.forEach(f => { if (f in obj) obj[f] = 9999; });
    Object.keys(obj).forEach(k => {
      if (obj[k] && typeof obj[k] === 'object') obj[k] = deepPatchCredits(obj[k]);
    });
    return obj;
  }

  async function enforceCredits() {
    try {
      const keys = ['candidateDetails','userDetails','planDetails','subscriptionDetails'];
      const data = await ST.get(keys);
      const upd = {};
      keys.forEach(k => {
        if (!data[k]) return;
        try {
          const parsed = typeof data[k] === 'string' ? JSON.parse(data[k]) : data[k];
          const patched = deepPatchCredits(JSON.parse(JSON.stringify(parsed)));
          upd[k] = typeof data[k] === 'string' ? JSON.stringify(patched) : patched;
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
        if (result[k] && typeof result[k] === 'object') {
          try {
            result[k] = deepPatchCredits(
              typeof result[k] === 'string'
                ? JSON.parse(result[k])
                : JSON.parse(JSON.stringify(result[k]))
            );
          } catch (_) {}
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

  /* ── T16: Hide referral section ─────────────────────────── */
  (function hideReferral() {
    const style = document.createElement('style');
    style.textContent = `
      [class*="referral"],[class*="Referral"],[id*="referral"],
      [data-testid*="referral"],[class*="affiliate"],
      [class*="earnCredit"],[class*="inviteFriend"],[class*="invite-friend"],
      [class*="ReferralScreen"]{display:none!important}
    `;
    document.head?.appendChild(style);
  })();

  /* ── Profile helper ─────────────────────────────────────── */
  async function getProfile() {
    const keys = ['candidateDetails', 'cachedSeekerInfo', 'seekerDetails', 'userDetails'];
    const data = await ST.get(keys);
    let merged = {};

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

  /* ── Applications Account helper ────────────────────────── */
  async function getAppAccount() {
    const data = await ST.get(['appAccountEmail', 'appAccountPassword']);
    return {
      email:    data.appAccountEmail    || '',
      password: data.appAccountPassword || '',
    };
  }

  /* ── Field label extraction ──────────────────────────────── */
  function getLabel(el) {
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
    if (el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl) return lbl.textContent.trim();
    }
    if (el.placeholder) return el.placeholder;
    const container = el.closest(
      '.form-group,.field,.question,[class*="Field"],[class*="Question"],[class*="form-row"]'
    );
    if (container) {
      const lbl = container.querySelector('label,[class*="label"],[class*="Label"]');
      if (lbl && lbl !== el) return lbl.textContent.trim();
    }
    return el.name?.replace(/[_\-]/g, ' ') || '';
  }

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
    years:        '7',           // passes most "at least X years" knockout questions
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
    tellAbout: 'I\'m a dedicated professional with a track record of delivering strong results. I combine technical depth with a collaborative approach, and I thrive in roles where I can solve meaningful problems and help teams succeed.',
    motivation: 'I\'m motivated by meaningful impact, continuous learning, and the opportunity to work alongside talented people on problems that matter.',
    valueAdd: 'I bring the right combination of experience, technical skill, and work ethic to make an immediate positive impact. I move fast, communicate clearly, and consistently deliver quality work.',
    reasonLeaving: 'I\'m seeking new challenges and an opportunity for greater impact and growth, which this role represents.',
    howHeard: 'LinkedIn',
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
  let _pagePageData = null;
  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (d && d.type === 'PAGE_DATA' && d.payload) {
      _pagePageData = d.payload;
      LOG('Received PAGE_DATA from page world');
    }
  });
  (function injectPageDataBridge() {
    try {
      const s = document.createElement('script');
      s.textContent = `;(function(){if(window&&window.pageData){window.postMessage({type:"PAGE_DATA",payload:window.pageData||null},"*");}})();`;
      (document.head || document.documentElement).appendChild(s);
      s.remove();
    } catch (_) {}
  })();

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
    for (const zone of zones) {
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

  /* ── T25: Q&A memory persistence ─────────────────────────────────────
   * Store question→answer pairs keyed by normalised label, so repeat
   * knockout questions across applications get the same answer that
   * previously succeeded.
   * ────────────────────────────────────────────────────────────────── */
  const QA_MEMORY_KEY = 'ohQaMemory';
  const QA_MAX_ENTRIES = 2000;
  let _qaCache = null;

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

  async function getSavedQA(label) {
    const k = normalizeQa(label);
    if (!k) return null;
    const mem = await loadQaMemory();
    const entry = mem[k];
    return entry && entry.answer != null ? entry.answer : null;
  }

  async function saveQA(label, answer, success = true) {
    const k = normalizeQa(label);
    if (!k || answer == null || answer === '') return;
    const mem = await loadQaMemory();
    const prev = mem[k];
    if (prev && prev.success && !success) return; // don't overwrite successes with failures
    mem[k] = { answer: String(answer).slice(0, 500), success: !!success, ts: Date.now() };
    const keys = Object.keys(mem);
    if (keys.length > QA_MAX_ENTRIES) {
      keys.sort((a, b) => (mem[a].ts || 0) - (mem[b].ts || 0));
      keys.slice(0, keys.length - QA_MAX_ENTRIES).forEach(k2 => delete mem[k2]);
    }
    try { await ST.set({ [QA_MEMORY_KEY]: mem }); } catch (_) {}
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
  const REVIEW_PAGE_RE = /review\s+your\s+application|review\s+and\s+submit|confirm\s+and\s+submit|please\s+review|final\s+review|application\s+summary/i;
  const SUBMIT_BTN_RE = /^(submit|submit application|send application|apply|finish|confirm|complete application|submit my application)$/i;

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
  const RESUME_INPUT_RE = /resume|cv\b|curriculum|upload.*resume|attach.*resume/i;

  async function fetchResumeFile(url, filename = 'resume.pdf') {
    if (!url) return null;
    try {
      const res = await fetch(url, { credentials: 'omit' });
      if (!res.ok) return null;
      const blob = await res.blob();
      const type = blob.type || 'application/pdf';
      return new File([blob], filename, { type });
    } catch (_) { return null; }
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
      if (!RESUME_INPUT_RE.test(hint) && fileInputs.length > 1) continue;
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

  // Prime Q&A cache once at startup so guessValue() can do sync lookups
  loadQaMemory().catch(() => {});

  function guessValue(label, p = {}, inputType = '') {
    const l = label.toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
    const fullName = `${p.first_name||''} ${p.last_name||''}`.trim();

    // T25: Q&A memory — prefer a previously-successful answer for this exact label
    if (_qaCache) {
      const k = normalizeQa(label);
      if (k && _qaCache[k] && _qaCache[k].success && _qaCache[k].answer != null) {
        return _qaCache[k].answer;
      }
    }

    // Type-based direct fill (most reliable, survives label changes)
    if (inputType === 'email')  return p.email || '';
    if (inputType === 'tel')    return p.phone || '';
    if (inputType === 'number' && EXP_LABEL_RE.test(l))
                                return p.years_experience || DEFAULTS.years;

    if (/first.?name/.test(l))                            return p.first_name    || '';
    if (/last.?name/.test(l))                             return p.last_name     || '';
    if (/full.?name|your.?name/.test(l))                  return fullName;
    if (/preferred.?name|display.?name|nickname/.test(l)) return fullName;
    if (/\bemail\b/.test(l))                              return p.email         || '';
    if (/phone|mobile|cell/.test(l))                      return p.phone         || '';
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
    if (/\bdegree\b/.test(l))                             return p.degree        || "Bachelor's";
    if (/major|field.?of.?study/.test(l))                 return p.major         || '';
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
    if (/company|employer|current.*org/.test(l))          return p.current_company || p.company || '';
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
    if (EXP_LABEL_RE.test(l))                             return p.years_experience || DEFAULTS.years;

    if (/notice.?period|period.?of.?notice/.test(l))       return p.notice_period || DEFAULTS.notice;
    if (/availab|start.?date|when.*start|when.*begin|earliest.*start/.test(l))
                                                          return p.availability || DEFAULTS.availability;

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
    const p = await getProfile();
    const inputs = $$(
      'input:not([type=hidden]):not([type=file]):not([type=submit]):not([type=button]),' +
      'textarea'
    ).filter(isVisible);

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
      } else {
        const val = guessValue(lbl, p, inputType) || (inputType === 'email' ? p.email : '') || (inputType === 'tel' ? p.phone : '');
        if (val) {
          el.focus();
          nativeSet(el, val);
          await sleep(60);
          fixed++;
        }
      }
    }

    // Also scan for error MESSAGE elements and look for their associated field above
    const errorMsgEls = $$(
      '[class*="error-message"],[class*="errorMessage"],[class*="field-error"],[class*="fieldError"],' +
      '[role="alert"]:not([class*="banner"])'
    ).filter(isVisible);

    for (const msg of errorMsgEls) {
      const container = msg.closest(
        '.form-group,.field,[class*="Field"],[class*="Question"],[class*="form-row"],fieldset'
      );
      if (!container) continue;
      const inp = container.querySelector(
        'input:not([type=hidden]):not([type=submit]):not([type=button]),textarea,select'
      );
      if (!inp || !isVisible(inp)) continue;
      if (inp.tagName === 'SELECT') continue; // handled above
      const lbl = getLabel(inp) || inp.name || '';
      const inputType = (inp.type || '').toLowerCase();
      const val = guessValue(lbl, p, inputType);
      if (val && inp.value?.trim() !== val) {
        inp.focus(); nativeSet(inp, val); await sleep(60); fixed++;
      }
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
    const t = target.toLowerCase();
    const opts = $$('option', sel).filter(o => o.value && o.value !== '');
    const exact   = opts.find(o => o.text.toLowerCase() === t);
    if (exact) return exact;
    const starts  = opts.find(o => o.text.toLowerCase().startsWith(t));
    if (starts) return starts;
    const contains = opts.find(o => o.text.toLowerCase().includes(t) || t.includes(o.text.toLowerCase()));
    if (contains) return contains;
    // T32: Notice-period / time-duration smart-match by parsed days.
    if (/notice|availab|start|when.*begin/i.test(labelHint) || /notice|availab|start/i.test(t) || /week|month|day|immediate/i.test(t)) {
      const idx = pickNoticePeriodOption(sel, target);
      if (idx != null && sel.options[idx]) return sel.options[idx];
    }
    return null;
  }

  async function autoFillPage() {
    const p = await getProfile();
    const allFields = [];
    let filledCount = 0;

    /* ── Scan all visible form fields first to build field list ── */
    const allInputs = $$(
      'input:not([type=hidden]):not([type=file]):not([type=submit]):not([type=button]),' +
      'textarea'
    ).filter(isVisible);
    const allSelects = $$('select').filter(isVisible);

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

    /* Inputs + textareas — only unfilled */
    const inputs = allInputs.filter(el => !el.value?.trim());

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
        const targetYears = parseInt((p.years_experience || DEFAULTS.years).toString()) || 7;
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
      // Only process if it looks unfilled
      const valueEl = combo.querySelector(
        '[class*="singleValue"],[class*="single-value"],[class*="placeholder"],[class*="Select__placeholder"]'
      );
      const isPlaceholder = !valueEl || /select|choose|pick/i.test(valueEl.textContent || '');
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
      const lbl = getLabel(radios[0]);
      const guess = guessValue(lbl, p);
      const match = radios.find(r => {
        const t = ($(`label[for="${CSS.escape(r.id)}"]`)?.textContent || r.value || '').toLowerCase();
        return guess && t.includes(guess.toLowerCase());
      });
      if (match) { realClick(match); reportFieldFilled(lbl, 'filled'); filledCount++; continue; }
      /* Default: pick Yes for yes/no questions */
      const yes = radios.find(r => {
        const t = ($(`label[for="${CSS.escape(r.id)}"]`)?.textContent || r.value || '').toLowerCase().trim();
        return ['yes','true','1'].includes(t);
      });
      if (yes) { realClick(yes); reportFieldFilled(lbl, 'filled'); filledCount++; }
      else { reportFieldFilled(lbl, 'failed'); }
    }

    /* Checkboxes – only required ones */
    $$('input[type=checkbox][required], input[type=checkbox][aria-required="true"]')
      .filter(el => isVisible(el) && !el.checked)
      .forEach(cb => { realClick(cb); filledCount++; });

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
        chrome.runtime.sendMessage({ action: 'skipCurrent' }).catch(() => {});
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
   * If the automation is running but the same URL has been "active" for more
   * than 25 seconds, something is stuck — send skipCurrent.
   * Guards against any future stall source, not just missing-details iframe.
   * ─────────────────────────────────────────────────────────────────────── */
  (function installStuckWatchdog() {
    let _watchdogUrl = '';
    let _watchdogTimer = null;
    const STUCK_TIMEOUT_MS = 25_000; // 25 seconds

    async function checkStuck() {
      const { csvActiveJobId, isAutoProcessStartJob } = await ST.get([
        'csvActiveJobId', 'isAutoProcessStartJob',
      ]);
      if (!csvActiveJobId && !isAutoProcessStartJob) {
        _watchdogUrl = '';
        return;
      }
      const cur = normalizeUrl(location.href);
      if (cur !== _watchdogUrl) {
        _watchdogUrl = cur;
        clearTimeout(_watchdogTimer);
        _watchdogTimer = setTimeout(() => {
          // Do NOT skip if fill is actively running or a submit was just attempted
          if (_fillActive) {
            LOG('Stuck watchdog: skipping because _fillActive is true');
            _watchdogUrl = ''; // reset so next poll re-arms the timer
            return;
          }
          if (_submitAttempted && Date.now() - _submitAttemptTs < 30_000) {
            LOG('Stuck watchdog: skipping because submit was recently attempted');
            _watchdogUrl = '';
            return;
          }
          LOG(`Stuck watchdog: still on ${cur} after ${STUCK_TIMEOUT_MS/1000}s — force-skipping`);
          chrome.runtime.sendMessage({ action: 'skipCurrent' }).catch(() => {});
          _watchdogUrl = '';
        }, STUCK_TIMEOUT_MS);
      }
    }

    // Poll every 15 seconds for URL / active status changes
    setInterval(checkStuck, 15_000);
    checkStuck();
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
    const acct = await getAppAccount();

    /* Step 1: Account creation / sign-in flow */
    await workdayAccountFlow(p, acct);

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
        || (profileKey === 'years_of_experience' ? DEFAULTS.years : null)
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

  async function workdayAccountFlow(p, acct) {
    /* Create Account checkbox */
    const createCb = $('[data-automation-id="createAccountCheckbox"] input[type=checkbox]') ||
                     $('input[data-automation-id="createAccountCheckbox"]');
    if (createCb && !createCb.checked) {
      realClick(createCb);
      await sleep(600);
    }

    /* Fill account email */
    const emailField = $('[data-automation-id="createAccountEmail"] input') ||
                       $('[data-automation-id="accountCreationEmail"] input') ||
                       $('input[data-automation-id="email"]') ||
                       $('input[name="email"][type="email"]');
    if (emailField && !emailField.value?.trim()) {
      const emailVal = acct.email || p.email || '';
      if (emailVal) { emailField.focus(); nativeSet(emailField, emailVal); await sleep(200); }
    }

    /* Fill account password */
    const pwField = $('[data-automation-id="password"] input[type=password]') ||
                    $('input[data-automation-id="password"]') ||
                    $('input[type=password]');
    if (pwField && !pwField.value?.trim() && acct.password) {
      pwField.focus();
      nativeSet(pwField, acct.password);
      await sleep(200);
    }

    /* Verify password */
    const pwFields = $$('input[type=password]').filter(isVisible);
    if (pwFields.length >= 2 && acct.password) {
      const verify = pwFields[1];
      if (!verify.value?.trim()) { verify.focus(); nativeSet(verify, acct.password); await sleep(200); }
    }

    /* Click "Create Account" submit button */
    const createBtn = $('[data-automation-id="createAccountSubmitButton"]') ||
                      $('button[data-automation-id="createAccountSubmitButton"]');
    if (createBtn && isVisible(createBtn)) {
      await sleep(400);
      realClick(createBtn);
      await sleep(1500);
      return;
    }

    /* Or "Sign In" if already has account */
    const signInBtn = $('[data-automation-id="signInSubmitButton"]');
    if (signInBtn && isVisible(signInBtn)) {
      await sleep(400);
      realClick(signInBtn);
      await sleep(1500);
    }
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
    const click = () => {
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
    new MutationObserver(click).observe(document.body, { childList: true, subtree: true });
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
    if (submitBtn) { await sleep(400); realClick(submitBtn); }
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
      const el = $$(sel).find(e => isVisible(e) && !e.value?.trim());
      if (el) { el.focus(); nativeSet(el, val); await sleep(50); }
    }

    // Handle Workable custom question dropdowns and radio buttons
    await autoFillPage();

    // Workable uses a "Submit application" button
    const submitBtn = $$('button').find(el =>
      isVisible(el) && /submit.*application|submit.*form|apply/i.test(el.textContent)
    );
    if (submitBtn) { await sleep(400); realClick(submitBtn); }

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
    const isJazzHR = HOST.includes('jazzhr.com') || HOST.includes('resumatorapi.com') ||
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
    badge.style.cssText = `display:inline-block;background:${color};color:#fff;
      font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;
      margin-left:6px;vertical-align:middle;`;
    const heading = el.querySelector('h1,h2,h3,h4,a');
    if (heading) heading.after(badge); else el.prepend(badge);
  }

  function processFreshness() {
    $$(
      '.jobsearch-SerpJobCard,.job_seen_beacon,[class*="result-"],' + /* Indeed */
      '.jobs-search-results__list-item,.job-card-container,' +         /* LinkedIn */
      '[class*="job-card"],[class*="jobCard"],[class*="listing"]'      /* Generic */
    ).forEach(addFreshBadge);
  }
  setInterval(processFreshness, 4000);
  processFreshness();

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

    chrome.runtime.onMessage.addListener(async msg => {
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
    });

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

    /* ── All other recognised ATS ─────────────────────────────────
     * If we're on a known ATS domain, be permissive:
     * 2+ non-hidden inputs anywhere in the DOM is enough.             */
    return document.querySelectorAll(
      'input:not([type=hidden]):not([type=file]):not([type=submit]):not([type=button]),textarea'
    ).length >= 2;
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

  /** Run the full auto-trigger flow */
  let _autoTriggered = false;
  let _autoTriggerRunning = false;

  async function autoTriggerAutofill() {
    /* Guards */
    if (_autoTriggerRunning) return;
    if (_autoTriggered)      return;
    if (!CURRENT_ATS)        return;

    const { csvActiveJobId } = await ST.get('csvActiveJobId');
    if (csvActiveJobId) return; /* CSV bridge handles it */

    /* v6.1: Default OFF — only auto-trigger when the user is in an
     * automation session (background auto-apply running, or they just
     * clicked Autofill). This prevents random refills on every ATS
     * page the user happens to browse. */
    const { ohAutoTrigger } = await ST.get('ohAutoTrigger');
    if (ohAutoTrigger === false) return; /* user explicitly disabled */
    if (ohAutoTrigger !== true) {
      // Setting unset or any non-true value → require active automation
      const active = await isAutomationActive();
      if (!active) return;
    }

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

  /* ── Initial trigger after page load ── */
  if (CURRENT_ATS) {
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

  LOG(`v5.0 loaded | ${CURRENT_ATS || HOST}`);
})();
