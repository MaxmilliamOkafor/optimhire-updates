/**
 * oh-persist.js — keeps the user's own data alive across OptimHire's
 * chrome.storage.local.clear().
 *
 * OptimHire's background service worker WIPES all of chrome.storage.local
 * (keeping only its own `preferredJobsite`) on:
 *   - every browser startup          (runtime.onStartup)
 *   - every install/update/reload    (runtime.onInstalled — this includes
 *                                     each time an unpacked patch is loaded)
 *   - auth errors and logout
 * That silently erased the imported CSV job queue, the harvested job URLs,
 * the Automation ON/OFF master switch and every setting of ours.
 *
 * We do not patch OptimHire's minified bundle (it would break on every
 * update). Instead this guard, loaded by our extension pages (side panel,
 * Queue Manager, Debug Log), mirrors our keys into the extension's own
 * IndexedDB — which storage.local.clear() does not touch — and restores any
 * that go missing: immediately if a page is open when the wipe happens, or
 * the next time one of those pages opens.
 *
 * Only USER DATA / SETTINGS are kept. Runtime state (a run being active,
 * engagement heartbeats, tab ownership, advance requests, the debug ring
 * buffer) is deliberately NOT restored — a restart must never resume a run.
 */
(function () {
  'use strict';
  if (window.top !== window.self) return;   // never inside a third-party frame
  if (window.__OH_PERSIST__) return;
  window.__OH_PERSIST__ = true;
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local ||
      typeof indexedDB === 'undefined') return;

  var KEYS = [
    'ohJobQueue',             // imported CSV job queue
    'ohJobQueueConcurrency',  // parallel-tabs setting
    'ohHarvestedJobs',        // harvested native-queue job URLs + outcomes
    'ohAutomationDisabled',   // master ON/OFF switch
    'ohAutoTrigger',          // "Auto-fill on supported ATS pages" toggle
    'ohFreshBadges',          // freshness badges opt-in
    'ohAutoFilledUrls',       // already-filled URL de-dupe list
    'ohQaMemory'              // remembered answers
  ];
  var KEYSET = {};
  KEYS.forEach(function (k) { KEYSET[k] = 1; });

  var DB_NAME = 'ohPersist', STORE = 'kv';

  function openDb() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function idbPut(obj) {
    return openDb().then(function (db) {
      return new Promise(function (res) {
        var tx = db.transaction(STORE, 'readwrite');
        var st = tx.objectStore(STORE);
        Object.keys(obj).forEach(function (k) { st.put(obj[k], k); });
        tx.oncomplete = function () { db.close(); res(); };
        tx.onerror = tx.onabort = function () { db.close(); res(); };
      });
    }).catch(function () {});
  }
  function idbGetAll() {
    return openDb().then(function (db) {
      return new Promise(function (res) {
        var out = {};
        var tx = db.transaction(STORE, 'readonly');
        var st = tx.objectStore(STORE);
        KEYS.forEach(function (k) {
          var q = st.get(k);
          q.onsuccess = function () { if (q.result !== undefined) out[k] = q.result; };
        });
        tx.oncomplete = function () { db.close(); res(out); };
        tx.onerror = tx.onabort = function () { db.close(); res(out); };
      });
    }).catch(function () { return {}; });
  }

  function note(msg) {
    try { if (window.OH_DEBUG) window.OH_DEBUG.log('persist', msg); } catch (_) {}
  }

  /* Back up whatever is present; restore whatever is missing. */
  var _syncing = false;
  function sync(reason) {
    if (_syncing) return;
    _syncing = true;
    chrome.storage.local.get(KEYS, function (cur) {
      cur = cur || {};
      var backup = {};
      KEYS.forEach(function (k) { if (cur[k] !== undefined) backup[k] = cur[k]; });
      idbGetAll().then(function (saved) {
        var restore = {};
        KEYS.forEach(function (k) {
          if (cur[k] === undefined && saved[k] !== undefined) restore[k] = saved[k];
        });
        /* A run cannot survive a restart: jobs caught mid-run go back to
           pending so the next Start picks them up cleanly. */
        if (Array.isArray(restore.ohJobQueue)) {
          restore.ohJobQueue = restore.ohJobQueue.map(function (j) {
            return (j && j.status === 'running') ? Object.assign({}, j, { status: 'pending' }) : j;
          });
        }
        var tasks = [];
        if (Object.keys(backup).length) tasks.push(idbPut(backup));
        if (Object.keys(restore).length) {
          tasks.push(new Promise(function (res) {
            chrome.storage.local.set(restore, function () {
              note('restored after storage wipe (' + reason + '): ' + Object.keys(restore).join(', '));
              res();
            });
          }));
        }
        return Promise.all(tasks);
      }).then(function () { _syncing = false; }, function () { _syncing = false; });
    });
  }

  /* Mirror changes (debounced) and react to removals (a clear() arrives as
     one burst of removals — batch it into a single restore). */
  var _pending = {}, _flushT = null, _restoreT = null;
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') return;
    var removed = false;
    Object.keys(changes).forEach(function (k) {
      if (!KEYSET[k]) return;
      if (changes[k].newValue === undefined) removed = true;
      else _pending[k] = changes[k].newValue;
    });
    if (Object.keys(_pending).length && !_flushT) {
      _flushT = setTimeout(function () {
        var batch = _pending; _pending = {}; _flushT = null;
        idbPut(batch);
      }, 1000);
    }
    if (removed && !_restoreT) {
      _restoreT = setTimeout(function () { _restoreT = null; sync('removal'); }, 600);
    }
  });

  sync('page open');

  /* Housekeeping: the Q&A-memory learner keeps a pending answer snapshot
     per tab (ohQaPend_*) until the application is confirmed. A tab closed
     before that leaves its snapshot behind; drop any older than 30 min.
     Needs storage.getKeys() (Chrome 130+) so we never load everything. */
  try {
    if (typeof chrome.storage.local.getKeys === 'function') {
      chrome.storage.local.getKeys().then(function (keys) {
        var pend = (keys || []).filter(function (k) { return k.indexOf('ohQaPend_') === 0; });
        if (!pend.length) return;
        chrome.storage.local.get(pend, function (d) {
          var stale = pend.filter(function (k) {
            var v = d && d[k];
            return !v || !v.ts || Date.now() - v.ts > 30 * 60000;
          });
          if (stale.length) chrome.storage.local.remove(stale);
        });
      }).catch(function () {});
    }
  } catch (_) {}
})();
