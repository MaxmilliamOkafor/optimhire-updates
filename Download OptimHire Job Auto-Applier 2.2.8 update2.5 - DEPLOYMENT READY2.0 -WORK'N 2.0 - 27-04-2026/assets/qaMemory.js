/**
 * qaMemory.js — "Remembered answers" viewer in the Queue Manager.
 *
 * Shows what the Q&A memory (chrome.storage.local.ohQaMemory) has learned
 * from confirmed applications, and lets the user forget one answer or all
 * of them. The memory itself is written by assets/optimhire-patch.js.
 *
 * Entry shape: { q, answer, success, ts, n, host } keyed by the normalised
 * question text.
 *
 * "Forget all" writes {} rather than removing the key: oh-persist.js treats
 * a REMOVED key as a storage wipe and would restore the old answers.
 */
(function () {
  'use strict';
  if (window.top !== window.self) return;
  var KEY = 'ohQaMemory';
  var ST = chrome.storage.local;
  var mem = {};

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function toast(msg, kind) {
    var box = $('toastContainer');
    if (!box) return;
    var el = document.createElement('div');
    el.className = 'toast t-' + (kind || 'info');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; }, 2700);
    setTimeout(function () { el.remove(); }, 3000);
  }
  function when(ts) {
    if (!ts) return '';
    try { return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch (_) { return ''; }
  }
  function count() { return Object.keys(mem).length; }

  function paintCount() {
    var el = $('qaMemCount');
    if (el) el.textContent = '(' + count() + ')';
  }

  function isOpen() { var m = $('qaModal'); return !!(m && !m.classList.contains('hidden')); }

  function render() {
    var list = $('qaList');
    if (!list) return;
    var q = (($('qaSearch') || {}).value || '').trim().toLowerCase();
    var rows = Object.keys(mem).map(function (k) { return { k: k, e: mem[k] || {} }; })
      .filter(function (r) {
        return !q || (r.k + ' ' + (r.e.q || '') + ' ' + (r.e.answer || '')).toLowerCase().indexOf(q) !== -1;
      })
      .sort(function (a, b) { return (b.e.ts || 0) - (a.e.ts || 0); });
    var clearBtn = $('qaClearAll');
    if (clearBtn) clearBtn.disabled = !count();
    if (!rows.length) {
      list.innerHTML = '<div class="qa-empty">' + (count()
        ? 'No remembered answer matches your search.'
        : 'Nothing remembered yet.<br>Answers are learned automatically the next time an application is confirmed as submitted.') +
        '</div>';
      return;
    }
    list.innerHTML =
      '<table><thead><tr><th>Question</th><th>Answer</th><th>Learned</th><th></th></tr></thead><tbody>' +
      rows.map(function (r) {
        var meta = esc(when(r.e.ts)) +
          (r.e.n > 1 ? ' · confirmed ×' + esc(r.e.n) : '') +
          (r.e.host ? '<br>' + esc(r.e.host) : '');
        return '<tr>' +
          '<td>' + esc(r.e.q || r.k) + '</td>' +
          '<td class="qa-ans">' + esc(r.e.answer) + '</td>' +
          '<td class="qa-meta">' + meta + '</td>' +
          '<td><button class="btn-small btn-danger" data-qa-forget="' + esc(r.k) + '">Forget</button></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>';
  }

  function open() {
    var m = $('qaModal');
    if (!m) return;
    m.classList.remove('hidden');
    render();
    var s = $('qaSearch');
    if (s) s.focus();
  }
  function close() {
    var m = $('qaModal');
    if (m) m.classList.add('hidden');
    if (location.hash === '#answers') {
      try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {}
    }
  }

  function forget(k) {
    ST.get([KEY], function (d) {
      var m = (d && d[KEY] && typeof d[KEY] === 'object') ? d[KEY] : {};
      if (!Object.prototype.hasOwnProperty.call(m, k)) return;
      delete m[k];
      var o = {}; o[KEY] = m;
      ST.set(o, function () { toast('Forgotten', 'success'); });
    });
  }
  function forgetAll() {
    if (!count()) return;
    if (!confirm('Forget all ' + count() + ' remembered answers?')) return;
    var o = {}; o[KEY] = {};
    ST.set(o, function () { toast('All remembered answers forgotten', 'success'); });
  }

  function load() {
    ST.get([KEY], function (d) {
      var v = d && d[KEY];
      mem = (v && typeof v === 'object') ? v : {};
      paintCount();
      if (isOpen()) render();
    });
  }

  function wire() {
    var btn = $('btnQaMemory');
    if (btn) btn.addEventListener('click', open);
    var closeBtn = $('qaClose');
    if (closeBtn) closeBtn.addEventListener('click', close);
    var modal = $('qaModal');
    if (modal) modal.addEventListener('click', function (e) {
      if (e.target === modal) { close(); return; }
      var f = e.target && e.target.closest && e.target.closest('[data-qa-forget]');
      if (f) forget(f.getAttribute('data-qa-forget'));
    });
    var search = $('qaSearch');
    if (search) search.addEventListener('input', render);
    var clearAll = $('qaClearAll');
    if (clearAll) clearAll.addEventListener('click', forgetAll);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen()) close(); });

    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local' || !changes[KEY]) return;
      var v = changes[KEY].newValue;
      mem = (v && typeof v === 'object') ? v : {};
      paintCount();
      if (isOpen()) render();
    });

    load();
    /* Opened from the side panel's "Remembered answers" line. */
    if (location.hash === '#answers') open();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
