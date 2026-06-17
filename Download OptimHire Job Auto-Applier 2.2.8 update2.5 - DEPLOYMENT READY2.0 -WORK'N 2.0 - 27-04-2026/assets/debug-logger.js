/**
 * debug-logger.js — Universal debug recorder for the OptimHire extension.
 *
 * Runs in every page (as a content script) AND in the sidepanel/queue-manager
 * extension pages. Auto-captures:
 *   • Uncaught errors + unhandled promise rejections
 *   • Storage changes (chrome.storage.local) — everything except its own keys
 *   • Runtime messages
 *   • Console output prefixed with our extension's tags
 * Plus the manual API window.OH_DEBUG.log(category, message, data, level)
 * which the patches call from their LOG()/addLog() functions.
 *
 * Entries are batched (debounced 500ms) and ring-buffered to chrome.storage
 * .local.ohDebugLog (capped at MAX entries). The viewer in tabs/debug.html
 * subscribes to storage changes for live tail and exports.
 *
 * Storage keys:
 *   ohDebugLog       Array<Entry>    — ring buffer
 *   ohDebugEnabled   boolean         — default true; flip via viewer
 *   ohDebugPaused    boolean         — default false; suspends new writes
 *
 * Entry: { ts, seq, src, url, top, cat, lvl, msg, data? }
 */
(function () {
  'use strict';
  if (window.__OH_DEBUG_INSTALLED__) return;
  window.__OH_DEBUG_INSTALLED__ = true;

  var ST = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) ? chrome.storage.local : null;
  if (!ST) return;

  var KEY         = 'ohDebugLog';
  var KEY_ENABLED = 'ohDebugEnabled';
  var KEY_PAUSED  = 'ohDebugPaused';
  var MAX         = 5000;          // ring-buffer cap
  var FLUSH_MS    = 500;           // debounce writes
  var MAX_STR     = 4000;          // truncate long strings
  var MAX_BUF     = 200;           // emergency flush threshold

  var _enabled   = true;
  var _paused    = false;
  var _buf       = [];
  var _flushTimer = null;
  var _seq       = 0;

  /* Load initial enable/pause state from storage. */
  try {
    ST.get([KEY_ENABLED, KEY_PAUSED], function (d) {
      if (d && d[KEY_ENABLED] === false) _enabled = false;
      if (d && d[KEY_PAUSED]  === true)  _paused  = true;
    });
  } catch (_) {}

  /* Live-update _enabled/_paused so flipping the toggle in the viewer
     takes effect immediately across all tabs. */
  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local') return;
      if (changes[KEY_ENABLED]) _enabled = changes[KEY_ENABLED].newValue !== false;
      if (changes[KEY_PAUSED])  _paused  = !!changes[KEY_PAUSED].newValue;
    });
  } catch (_) {}

  /* Safe-stringify arbitrary values: handles circular refs, DOM nodes,
     functions, and truncates long strings. Always returns something
     JSON.stringify-able. */
  function safe(x, depth) {
    depth = depth || 0;
    if (depth > 8) return '[deep]';
    try {
      if (x === undefined) return 'undefined';
      if (x === null) return null;
      var t = typeof x;
      if (t === 'function') return '[function]';
      if (t === 'string') return x.length > MAX_STR ? x.slice(0, MAX_STR) + '…(' + x.length + 'B)' : x;
      if (t === 'number' || t === 'boolean') return x;
      if (t === 'bigint' || t === 'symbol') return String(x);
      /* Element → shorthand */
      if (typeof Element !== 'undefined' && x instanceof Element) {
        return '<' + (x.tagName || '?').toLowerCase() +
          (x.id ? '#' + x.id : '') +
          (x.className && typeof x.className === 'string' ? '.' + x.className.replace(/\s+/g, '.') : '') + '>';
      }
      if (x instanceof Error) {
        return { __err: true, name: x.name, message: x.message, stack: (x.stack || '').slice(0, 1500) };
      }
      if (Array.isArray(x)) {
        var out = [];
        for (var i = 0; i < Math.min(x.length, 50); i++) out.push(safe(x[i], depth + 1));
        if (x.length > 50) out.push('…+' + (x.length - 50) + ' more');
        return out;
      }
      var o = {};
      var keys = Object.keys(x).slice(0, 30);
      for (var k = 0; k < keys.length; k++) o[keys[k]] = safe(x[keys[k]], depth + 1);
      if (Object.keys(x).length > 30) o.__truncated = '…+' + (Object.keys(x).length - 30) + ' keys';
      return o;
    } catch (_) {
      try { return String(x).slice(0, 200); } catch (__) { return '[unserializable]'; }
    }
  }

  /* Source tag — quick way to tell "where did this log originate".
     Returns: 'extension:debug.html' / 'extension:sidepanel.html' /
     'optimhire.com' / actual hostname for ATS pages. */
  function srcTag() {
    try {
      if (location.protocol === 'chrome-extension:') {
        return 'extension:' + (location.pathname.split('/').pop() || 'page');
      }
      var h = (location.hostname || '').toLowerCase();
      if (/^([a-z0-9-]+\.)?optimhire\.com$/i.test(h)) return 'optimhire.com';
      return h || 'unknown';
    } catch (_) { return 'unknown'; }
  }

  /* Core log function — the API surface. */
  function log(category, message, data, level) {
    if (!_enabled || _paused) return;
    var entry = {
      ts:  Date.now(),
      seq: ++_seq,
      src: srcTag(),
      url: (location.href || '').slice(0, 300),
      top: window === window.top,
      cat: String(category || 'misc').slice(0, 32),
      lvl: level === 'warn' || level === 'error' ? level : 'info',
      msg: typeof message === 'string' ? (message.length > MAX_STR ? message.slice(0, MAX_STR) : message) : safe(message)
    };
    if (data !== undefined) entry.data = safe(data);
    _buf.push(entry);
    /* Emergency flush if buffer fills up between debounced flushes
       (e.g. burst of storage changes). */
    if (_buf.length >= MAX_BUF) flush();
    else schedFlush();
  }

  function schedFlush() {
    if (_flushTimer) return;
    _flushTimer = setTimeout(flush, FLUSH_MS);
  }

  function flush() {
    if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
    if (!_buf.length) return;
    var pending = _buf;
    _buf = [];
    try {
      ST.get([KEY], function (d) {
        var arr = Array.isArray(d && d[KEY]) ? d[KEY] : [];
        arr = arr.concat(pending);
        if (arr.length > MAX) arr = arr.slice(arr.length - MAX);
        var obj = {}; obj[KEY] = arr;
        try { ST.set(obj); } catch (_) {}
      });
    } catch (_) {}
  }

  /* ── Auto-capture: uncaught errors & promise rejections ─────────── */
  try {
    window.addEventListener('error', function (e) {
      log('uncaught', e.message || 'window error', {
        filename: e.filename, line: e.lineno, col: e.colno,
        stack: e.error && e.error.stack ? String(e.error.stack).slice(0, 1500) : ''
      }, 'error');
    });
    window.addEventListener('unhandledrejection', function (e) {
      log('uncaught', 'unhandled promise rejection', {
        reason: safe(e.reason)
      }, 'error');
    });
  } catch (_) {}

  /* ── Auto-capture: console output, filtered to our extension's tags
     so we don't store every web page's console.log noise. Patches'
     LOG() already prefixes with [OH-Patch], [OH-Sidepanel], etc. ─── */
  var TAG_RE = /^\[(OH[\w-]*|Queue\s?Runner|Queue|MD|Sidepanel|Autofill|Skip|Stuck|CSV|T18|T39|T40|Auto-Apply)/i;
  ['log', 'warn', 'error'].forEach(function (lvl) {
    try {
      var orig = console[lvl];
      if (!orig) return;
      console[lvl] = function () {
        try {
          var first = arguments[0];
          if (typeof first === 'string' && TAG_RE.test(first)) {
            var args = [];
            for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
            log('console', args.length === 1 ? String(args[0]) : args.map(function (a) {
              return typeof a === 'string' ? a : JSON.stringify(safe(a));
            }).join(' '), undefined, lvl);
          }
        } catch (_) {}
        return orig.apply(console, arguments);
      };
    } catch (_) {}
  });

  /* ── Auto-capture: storage changes (skip our own keys to avoid loop) */
  var SELF_KEYS = { ohDebugLog: 1, ohDebugEnabled: 1, ohDebugPaused: 1 };
  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local') return;
      if (!_enabled || _paused) return;
      var keys = Object.keys(changes);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (SELF_KEYS[k]) continue;
        var c = changes[k];
        log('storage', k, { from: safe(c.oldValue), to: safe(c.newValue) });
      }
    });
  } catch (_) {}

  /* ── Auto-capture: runtime messages ────────────────────────────── */
  try {
    chrome.runtime.onMessage.addListener(function (msg, sender) {
      try {
        var label = (msg && (msg.type || msg.action)) || '(message)';
        log('message', String(label), {
          payload: safe(msg),
          fromTab: sender && sender.tab && sender.tab.id,
          fromUrl: sender && sender.url && sender.url.slice(0, 200)
        });
      } catch (_) {}
      /* Don't intercept — return undefined so other listeners still run. */
    });
  } catch (_) {}

  /* ── Public API ────────────────────────────────────────────────── */
  window.OH_DEBUG = {
    log: log,
    flush: flush,
    enable:  function () { _enabled = true;  try { ST.set({ ohDebugEnabled: true  }); } catch (_) {} },
    disable: function () { flush(); _enabled = false; try { ST.set({ ohDebugEnabled: false }); } catch (_) {} },
    pause:   function () { _paused = true;   try { ST.set({ ohDebugPaused: true  }); } catch (_) {} },
    resume:  function () { _paused = false;  try { ST.set({ ohDebugPaused: false }); } catch (_) {} },
    clear:   function () { try { ST.set({ ohDebugLog: [] }); } catch (_) {} },
    /* Convenience helpers for the patches: */
    info:  function (cat, msg, data) { log(cat, msg, data, 'info'); },
    warn:  function (cat, msg, data) { log(cat, msg, data, 'warn'); },
    error: function (cat, msg, data) { log(cat, msg, data, 'error'); }
  };

  log('lifecycle', 'debug-logger installed', {
    top: window === window.top,
    ua: (navigator.userAgent || '').slice(0, 100)
  });

  /* Flush remaining buffer on page unload so we don't lose the last
     few entries. */
  try { window.addEventListener('beforeunload', flush); } catch (_) {}
})();
