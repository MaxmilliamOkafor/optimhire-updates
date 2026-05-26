/**
 * sidepanel-patch.js — CSP-safe JS for sidepanel.html
 * Auto-Apply Mode status panel: live status log, field tracking,
 * progress bar, Skip/Stop controls.
 */
(function () {
  'use strict';

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

  /* ── Show/hide panel ── */
  function showPanel() {
    if (panel) { panel.classList.remove('hidden'); panel.classList.remove('collapsed'); }
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
      if (panel) panel.classList.toggle('collapsed');
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

  (function patchOnMessage() {
    const _origAddListener = chrome.runtime.onMessage.addListener.bind(chrome.runtime.onMessage);
    chrome.runtime.onMessage.addListener = function (listener) {
      return _origAddListener(function (msg, sender, sendResponse) {
        if (msg && msg.type === 'AUTO_APPLY_STATE_UPDATE' &&
            typeof msg.autoSkipSeconds === 'number' &&
            msg.autoSkipSeconds > AUTO_SKIP_MAX) {
          if (!isSubmitSuppressed()) {
            var jobKey = (msg.url || msg.jobUrl || '') + '_' + msg.autoSkipSeconds;
            scheduleForceSkip(jobKey);
          }
          msg = Object.assign({}, msg, { autoSkipSeconds: AUTO_SKIP_MAX });
        }
        return listener(msg, sender, sendResponse);
      });
    };
  })();

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
