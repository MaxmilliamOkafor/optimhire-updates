/**
 * debug.js — Viewer logic for tabs/debug.html
 *
 * Reads the ring buffer from chrome.storage.local.ohDebugLog and renders
 * a live, filterable, searchable, exportable table. Subscribes to
 * storage changes so new entries from any tab stream in immediately.
 */
(function () {
  'use strict';
  /* Refuse to run inside a frame (tabs/* is web-accessible to every site;
     this page must never be embeddable to trick clicks on "Clear all"). */
  if (window.top !== window.self) { document.documentElement.innerHTML = ''; return; }
  var ST = chrome.storage.local;
  var KEY         = 'ohDebugLog';
  var KEY_ENABLED = 'ohDebugEnabled';
  var KEY_PAUSED  = 'ohDebugPaused';

  var view = { search: '', cat: 'all', lvl: 'all', src: 'all', tail: true };
  var entries = [];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function pad3(n) { return (n < 10 ? '00' : n < 100 ? '0' : '') + n; }
  function fmtTs(ts) {
    var d = new Date(ts);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()) +
           '.' + pad3(d.getMilliseconds());
  }

  function matches(e) {
    if (view.cat !== 'all' && e.cat !== view.cat) return false;
    if (view.lvl !== 'all' && e.lvl !== view.lvl) return false;
    if (view.src !== 'all' && e.src !== view.src) return false;
    if (view.search) {
      var hay = ((e.msg || '') + ' ' + (e.url || '') + ' ' + (e.cat || '') +
                 ' ' + (e.src || '') + ' ' + (e.data !== undefined ? JSON.stringify(e.data) : '')).toLowerCase();
      if (hay.indexOf(view.search) === -1) return false;
    }
    return true;
  }

  function rebuildDropdowns() {
    var cats = {}, srcs = {};
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      cats[e.cat] = (cats[e.cat] || 0) + 1;
      srcs[e.src] = (srcs[e.src] || 0) + 1;
    }
    function fill(sel, all, label) {
      var cur = sel.value;
      var html = '<option value="all">All ' + label + '</option>';
      Object.keys(all).sort().forEach(function (k) {
        html += '<option value="' + esc(k) + '">' + esc(k) + ' (' + all[k] + ')</option>';
      });
      sel.innerHTML = html;
      sel.value = (cur === 'all' || all[cur]) ? cur : 'all';
    }
    fill(document.getElementById('catFilter'), cats, 'categories');
    fill(document.getElementById('srcFilter'), srcs, 'sources');
  }

  function renderStats() {
    var c = { info: 0, warn: 0, error: 0 };
    for (var i = 0; i < entries.length; i++) {
      var l = entries[i].lvl;
      c[l] = (c[l] || 0) + 1;
    }
    document.getElementById('stats').innerHTML =
      '<span class="stat">Total <b>' + entries.length + '</b></span>' +
      '<span class="stat s-info">Info <b>' + (c.info || 0) + '</b></span>' +
      '<span class="stat s-warn">Warn <b>' + (c.warn || 0) + '</b></span>' +
      '<span class="stat s-error">Error <b>' + (c.error || 0) + '</b></span>';
  }

  function rowHtml(e) {
    var data = e.data !== undefined ?
      '<pre class="data-cell">' + esc(JSON.stringify(e.data, null, 1)) + '</pre>' : '';
    var iframe = e.top === false ? ' [iframe]' : '';
    var urlPill = e.url ? '<span class="url-pill" title="' + esc(e.url) + '">' +
      esc(e.url.replace(/^https?:\/\//, '').slice(0, 50)) + '</span>' : '';
    return '<tr class="lvl-' + esc(e.lvl) + '">' +
      '<td class="ts">' + esc(fmtTs(e.ts)) + '</td>' +
      '<td class="src">' + esc(e.src) + iframe + '</td>' +
      '<td class="cat">' + esc(e.cat) + '</td>' +
      '<td class="lvl">' + esc(e.lvl) + '</td>' +
      '<td class="msg">' + esc(e.msg) + urlPill + data + '</td>' +
      '</tr>';
  }

  function renderRows() {
    var tbody = document.getElementById('logBody');
    var visible = [];
    for (var i = 0; i < entries.length; i++) if (matches(entries[i])) visible.push(entries[i]);
    document.getElementById('visCount').textContent = visible.length + ' shown of ' + entries.length;
    var empty = document.getElementById('emptyState');
    var table = document.getElementById('logTable');
    if (!entries.length) {
      empty.classList.remove('hidden');
      table.style.display = 'none';
      tbody.innerHTML = '';
      return;
    }
    empty.classList.add('hidden');
    table.style.display = '';
    /* For large buffers we only render the most recent N visible rows to
       keep the DOM fast. The full buffer is still searchable/exportable. */
    var SLICE = 1500;
    var rendered = visible.length > SLICE ? visible.slice(visible.length - SLICE) : visible;
    var rows = new Array(rendered.length);
    for (var j = 0; j < rendered.length; j++) rows[j] = rowHtml(rendered[j]);
    tbody.innerHTML = rows.join('');
    if (view.tail) window.scrollTo(0, document.body.scrollHeight);
  }

  function renderAll() {
    rebuildDropdowns();
    renderStats();
    renderRows();
  }

  function toast(msg) {
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 1800);
    setTimeout(function () { el.remove(); }, 2200);
  }

  /* The pages' log and the service worker's (oh-bg.js 16), in time order. */
  var _pageLog = [], _bgLog = [];
  function mergeLogs() {
    entries = _pageLog.concat(_bgLog.map(function (e) {
      return { ts: e.ts, seq: 0, src: 'service-worker', url: '', top: true, cat: 'background', lvl: e.lvl || 'info', msg: e.msg };
    })).sort(function (a, b) { return (a.ts || 0) - (b.ts || 0) || (a.seq || 0) - (b.seq || 0); });
  }
  function load() {
    ST.get([KEY, KEY_ENABLED, KEY_PAUSED, 'ohBgLog'], function (d) {
      _pageLog = Array.isArray(d[KEY]) ? d[KEY] : [];
      _bgLog = Array.isArray(d.ohBgLog) ? d.ohBgLog : [];
      mergeLogs();
      document.getElementById("toggleEnabled").checked = d[KEY_ENABLED] === true;
      document.getElementById('togglePaused').checked  = !!d[KEY_PAUSED];
      renderAll();
    });
  }

  /* Live tail — subscribe to storage changes. */
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') return;
    if (changes[KEY] || changes.ohBgLog) {
      if (changes[KEY]) _pageLog = changes[KEY].newValue || [];
      if (changes.ohBgLog) _bgLog = changes.ohBgLog.newValue || [];
      mergeLogs();
      renderAll();
    }
    if (changes[KEY_ENABLED] || changes.ohDebugUntil) paintAuditBar();
    if (changes[KEY_ENABLED]) document.getElementById('toggleEnabled').checked = changes[KEY_ENABLED].newValue === true;
    if (changes[KEY_PAUSED])  document.getElementById('togglePaused').checked  = !!changes[KEY_PAUSED].newValue;
  });

  /* ── Filters ──────────────────────────────────────────────────── */
  document.getElementById('search').addEventListener('input', function (e) {
    view.search = (e.target.value || '').toLowerCase(); renderRows();
  });
  document.getElementById('catFilter').addEventListener('change', function (e) { view.cat = e.target.value; renderRows(); });
  document.getElementById('lvlFilter').addEventListener('change', function (e) { view.lvl = e.target.value; renderRows(); });
  document.getElementById('srcFilter').addEventListener('change', function (e) { view.src = e.target.value; renderRows(); });
  document.getElementById('tail').addEventListener('change', function (e) { view.tail = e.target.checked; if (view.tail) window.scrollTo(0, document.body.scrollHeight); });

  /* ── Capture / Pause toggles ─────────────────────────────────── */
  document.getElementById('toggleEnabled').addEventListener('change', function (e) {
    var on = e.target.checked;
    /* Capture costs CPU in every tab, so it switches itself off again. */
    ST.set({ ohDebugEnabled: on, ohDebugUntil: on ? Date.now() + 30 * 60 * 1000 : 0 });
    toast(on ? 'Capture ON for 30 minutes — every event will be logged' : 'Capture OFF — new events ignored');
  });
  document.getElementById('togglePaused').addEventListener('change', function (e) {
    ST.set({ ohDebugPaused: e.target.checked });
    toast(e.target.checked ? 'Paused — new entries won’t flush' : 'Resumed — capturing again');
  });

  /* ── Clear ────────────────────────────────────────────────────── */
  document.getElementById('btnClear').addEventListener('click', function () {
    if (!confirm('Clear ALL ' + entries.length + ' debug entries? This cannot be undone.')) return;
    ST.set({ ohDebugLog: [], ohBgLog: [] });
    toast('Buffer cleared');
  });

  function visibleEntries() {
    var v = [];
    for (var i = 0; i < entries.length; i++) if (matches(entries[i])) v.push(entries[i]);
    return v;
  }

  /* ── Export JSON ──────────────────────────────────────────────── */
  document.getElementById('btnExport').addEventListener('click', function () {
    var v = visibleEntries();
    var payload = {
      exportedAt: new Date().toISOString(),
      totalInBuffer: entries.length,
      exportedCount: v.length,
      filters: view,
      entries: v
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'optimhire-debug-' + tsForFile() + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('Exported ' + v.length + ' entries to JSON');
  });

  /* ── Export plain text (easy to paste into an issue / chat) ──── */
  document.getElementById('btnExportText').addEventListener('click', function () {
    var v = visibleEntries();
    var lines = v.map(function (e) {
      var line = fmtTs(e.ts) + '  [' + e.src + (e.top === false ? ' iframe' : '') + ']  ' +
                 '[' + e.cat + ']' + (e.lvl !== 'info' ? '  [' + e.lvl.toUpperCase() + ']' : '') +
                 '  ' + e.msg;
      if (e.data !== undefined) line += '\n    ' + JSON.stringify(e.data).slice(0, 2000);
      return line;
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'optimhire-debug-' + tsForFile() + '.txt';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('Exported ' + v.length + ' entries to text');
  });

  /* ── Copy visible (clipboard) ────────────────────────────────── */
  document.getElementById('btnCopy').addEventListener('click', function () {
    var v = visibleEntries();
    var lines = v.map(function (e) {
      return fmtTs(e.ts) + ' [' + e.src + '] [' + e.cat + ']' +
             (e.lvl !== 'info' ? ' [' + e.lvl + ']' : '') + ' ' + e.msg +
             (e.data !== undefined ? ' ' + JSON.stringify(e.data).slice(0, 500) : '');
    });
    var txt = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function () { toast('Copied ' + v.length + ' rows'); });
    } else {
      var ta = document.createElement('textarea');
      ta.value = txt; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('Copied ' + v.length + ' rows'); }
      catch (_) { toast('Copy failed — use Export instead'); }
      ta.remove();
    }
  });

  /* ── Full audit (and the old "Diagnostic snapshot", which included your login
        token): one redacted file from oh-audit.js. ─ */
  function exportAudit() {
    if (!window.OH_AUDIT) { toast('Audit module missing'); return; }
    window.OH_AUDIT.exportFile(function (a, name) {
      toast('Saved ' + name + ' — ' + a.summary.logEntries + ' page + ' + a.summary.backgroundEntries + ' background entries, ' + a.summary.errors + ' errors');
    });
  }
  document.getElementById('btnAudit').addEventListener('click', exportAudit);
  document.getElementById('btnSnapshot').addEventListener('click', exportAudit);

  /* ── Recording: on for 8 h from the card's Audit, or here ── */
  function paintAuditBar() {
    var bar = document.getElementById('auditBar');
    if (!bar || !window.OH_AUDIT) return;
    window.OH_AUDIT.status(function (st) {
      bar.className = 'audit-bar ' + (st.on ? 'on' : 'off');
      bar.innerHTML = '';
      var t = document.createElement('span');
      var btn = document.createElement('button');
      if (st.on) {
        var mins = Math.ceil(Math.max(0, st.until - Date.now()) / 60e3), h = Math.floor(mins / 60), m = mins % 60;
        t.textContent = 'Recording everything — every tab, the side panel and the background — ' + (h ? h + 'h ' : '') + m + 'm left' +
                        (st.since ? ' (since ' + new Date(st.since).toLocaleTimeString() + ')' : '') + '. Export full audit when done.';
        btn.textContent = 'Stop recording';
        btn.addEventListener('click', function () { window.OH_AUDIT.stop(paintAuditBar); });
      } else {
        t.textContent = 'Not recording. Record everything for 8 hours, reproduce the problem, then Export full audit.';
        btn.textContent = 'Record everything (8 h)';
        btn.className = 'btn-primary';
        btn.addEventListener('click', function () { window.OH_AUDIT.record(8, paintAuditBar); });
      }
      bar.appendChild(t); bar.appendChild(btn);
    });
  }
  setInterval(paintAuditBar, 30000);
  paintAuditBar();

  function tsForFile() {
    var d = new Date();
    return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' +
           pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
  }

  load();
})();
