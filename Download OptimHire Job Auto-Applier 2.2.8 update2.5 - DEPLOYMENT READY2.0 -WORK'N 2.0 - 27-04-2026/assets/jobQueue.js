/**
 * jobQueue.js — Manager UI for the CSV-based Job Queue.
 *
 * Storage shape (chrome.storage.local):
 *   ohJobQueue            : Job[]    — array of jobs
 *   ohJobQueueActive      : boolean  — runner is currently applying
 *   ohJobQueueCurrentId   : string   — id of job being applied
 *   ohJobQueueStartTs     : number   — when runner started current job
 *
 * Job:
 *   { id, url, title, company, ats, notes, status, addedAt,
 *     appliedAt, attempts, lastError, lastActionTs }
 *
 * Status: 'pending' | 'running' | 'applied' | 'failed' | 'skipped'
 */
(function () {
  'use strict';
  /* Refuse to run inside a frame. tabs/* is web-accessible to every site
     (inherited from OptimHire's manifest), so a hostile page could embed this
     Queue Manager invisibly and trick clicks on "Clear all" / "Start Queue".
     It is only ever opened as a normal tab. */
  if (window.top !== window.self) { document.documentElement.innerHTML = ''; return; }
  const ST = chrome.storage.local;
  const KEY_QUEUE   = 'ohJobQueue';
  const KEY_ACTIVE  = 'ohJobQueueActive';
  const KEY_CURRENT = 'ohJobQueueCurrentId';
  const KEY_STARTTS = 'ohJobQueueStartTs';

  /* Tiny shim so we can log queue lifecycle events into the debug
     ring buffer regardless of whether debug-logger.js has finished
     installing OH_DEBUG yet. */
  function dbg(msg, data, lvl) {
    try { if (window.OH_DEBUG) window.OH_DEBUG.log('queue-mgr', msg, data, lvl); } catch (_) {}
  }

  let queue = [];
  let view  = { filter: 'all', ats: 'all', search: '' };
  let selectedIds = new Set();
  let editingId = null; // id when modal is in edit-mode

  /* ───── ATS detection ───── */
  const ATS_PATTERNS = [
    [/greenhouse\.io|boards\.greenhouse|grnh\.se/i, 'Greenhouse'],
    [/lever\.co|jobs\.lever/i, 'Lever'],
    [/myworkdayjobs|workday\.com/i, 'Workday'],
    [/ashbyhq/i, 'Ashby'],
    [/icims/i, 'iCIMS'],
    [/smartrecruiters/i, 'SmartRecruiters'],
    [/workable/i, 'Workable'],
    [/breezy\.hr/i, 'BreezyHR'],
    [/jobvite/i, 'Jobvite'],
    [/bamboohr/i, 'BambooHR'],
    [/paylocity/i, 'Paylocity'],
    [/jazzhr|resumatorapi/i, 'JazzHR'],
    [/teamtailor/i, 'Teamtailor'],
    [/recruitee/i, 'Recruitee'],
    [/pinpoint/i, 'Pinpoint'],
    [/oraclecloud|fa\.oraclecloud/i, 'OracleCloud'],
    [/taleo/i, 'Taleo'],
    [/successfactors|sapsf/i, 'SuccessFactors'],
    [/ukg\.com|ultipro/i, 'UKG'],
    [/avature/i, 'Avature'],
    [/bullhorn/i, 'Bullhorn'],
    [/dice\.com/i, 'Dice'],
    [/ziprecruiter/i, 'ZipRecruiter'],
    [/manatal/i, 'Manatal'],
    [/hiring\.cafe/i, 'HiringCafe'],
    [/gohire/i, 'GoHire'],
    [/forhyre/i, 'Forhyre'],
    [/linkedin\.com\/jobs/i, 'LinkedIn'],
    [/indeed\.com/i, 'Indeed'],
    [/careers-page\.com/i, 'CareersPage'],
    [/rippling/i, 'Rippling'],
  ];
  function detectAts(url) {
    if (!url) return 'Other';
    try {
      for (const [re, name] of ATS_PATTERNS) if (re.test(url)) return name;
      return 'Other';
    } catch (_) { return 'Other'; }
  }

  /* ───── Order: ATS jobs first, Reed last ─────
     Direct ATS applications (Greenhouse, Lever, Workday…) go first, then
     company career sites we don't recognise, then job boards, and Reed
     last. Within a tier the queue keeps its own order. On by default;
     "ATS first, Reed last" in the header turns it off (ohPreferAts). */
  const BOARD_ATS = new Set(['LinkedIn', 'Indeed', 'Dice', 'ZipRecruiter', 'HiringCafe']);
  const BOARD_HOST_RE = /(^|\.)(indeed|linkedin|ziprecruiter|adzuna|dice|glassdoor|monster|totaljobs|cv-library|jobsite|irishjobs|jobs\.ie|simplyhired|careerbuilder|jooble|talent|hiring\.cafe)\./i;
  const REED_HOST_RE = /(^|\.)reed\.co\.uk$/i;
  let _preferAts = true;
  function jobTier(url) {
    let host = '';
    try { host = new URL(url).hostname.toLowerCase(); } catch (_) { return 1; }
    if (REED_HOST_RE.test(host)) return 3;
    const ats = detectAts(url);
    if (ats !== 'Other' && !BOARD_ATS.has(ats)) return 0;
    if (BOARD_ATS.has(ats) || BOARD_HOST_RE.test(host)) return 2;
    return 1;
  }
  /* First eligible job of the best tier (queue order within a tier). */
  function pickNext(eligible) {
    if (!_preferAts) return queue.find(eligible) || null;
    let best = null, bestTier = 9;
    for (const j of queue) {
      if (!eligible(j)) continue;
      const t = jobTier(j.url);
      if (t < bestTier) { best = j; bestTier = t; if (t === 0) break; }
    }
    return best;
  }

  /* ───── CSV parsing / writing ───── */
  /* Real exports are comma, semicolon (European Excel), tab (pasted
     spreadsheets) or pipe delimited; the first line decides. */
  function sniffDelimiter(text) {
    const line = text.split(/\r?\n/).find(l => l.trim()) || '';
    let best = ',', bestN = 0;
    for (const d of [',', ';', '\t', '|']) {
      const n = line.split(d).length - 1;
      if (n > bestN) { bestN = n; best = d; }
    }
    return bestN ? best : ',';
  }
  /** RFC-4180 CSV parser. Handles quoted fields with delimiters, embedded
      newlines, and "" escapes. Returns array of row arrays. */
  function parseCsv(text, delim) {
    delim = delim || ',';
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i], nx = text[i + 1];
      if (inQuotes) {
        if (ch === '"' && nx === '"') { field += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { field += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === delim) { row.push(field); field = ''; }
        else if (ch === '\r') { /* skip */ }
        else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else { field += ch; }
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.length && r.some(c => c.trim()));
  }
  function toCsv(jobs) {
    /* confirmed / confirmedBy / lastError are exported too so the CSV
       shows which "applied" rows were actually confirmed. */
    const cols = ['url', 'title', 'company', 'ats', 'status', 'confirmed', 'confirmedBy',
                  'lastError', 'notes', 'attempts', 'addedAt', 'appliedAt'];
    const esc = (s) => {
      let v = String(s == null ? '' : s);
      /* Neutralise spreadsheet formulas (a job title like =HYPERLINK(...)
         would execute when the export is opened in Excel / Sheets). */
      if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
      if (/[",\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
      return v;
    };
    const lines = [cols.join(',')];
    for (const j of jobs) lines.push(cols.map(c => esc(j[c])).join(','));
    return lines.join('\n');
  }

  /* ───── Storage ───── */
  function load() {
    return new Promise(res => {
      /* KEY_CONCURRENCY was missing here, so the saved "Parallel tabs"
         choice was never restored and silently reset to 1. */
      ST.get([KEY_QUEUE, KEY_ACTIVE, KEY_CURRENT, KEY_STARTTS, KEY_CONCURRENCY, 'ohPreferAts'], (d) => {
        queue = Array.isArray(d[KEY_QUEUE]) ? d[KEY_QUEUE] : [];
        /* Entries an earlier import made from cells that were not links
           (https://font-semibold/, a job title as a host name…) can never be
           opened; they are removed once, with a note. */
        const junk = queue.filter(j => !plausibleJobUrl(j.url));
        if (junk.length) {
          forget(junk);
          queue = queue.filter(j => plausibleJobUrl(j.url));
          _junkRemoved = junk.length;
        }
        res(d);
      });
    });
  }
  /* Merge-on-write. ohJobQueue has three independent read-modify-write
     writers (here, plus the content script's advance() and its
     self-navigate fallback). Blindly writing our cached array clobbered
     whatever the content script had just recorded — a job it had marked
     applied/failed could be reset to 'pending' and then reopened, which
     is how one job ended up in dozens of tabs. Re-read immediately before
     writing and never regress a job that has already reached a terminal
     state, nor lower its attempts counter. */
  const TERMINAL = new Set(['applied', 'failed', 'skipped']);
  function saveQueue() {
    return new Promise(res => {
      ST.get([KEY_QUEUE], (d) => {
        const stored = Array.isArray(d[KEY_QUEUE]) ? d[KEY_QUEUE] : [];
        const byId = new Map(stored.map(j => [j.id, j]));
        const merged = queue.map(mine => {
          const theirs = byId.get(mine.id);
          if (!theirs) return mine;
          const out = Object.assign({}, mine);
          /* The run (service worker, job tabs) owns a job's status and
             progress; this page only overrides them for jobs you changed
             here (re-queue, mark pending). */
          if (!_statusTouched.has(mine.id)) {
            for (const k of ['status', 'attempts', 'lastError', 'lastActionTs', 'appliedAt', 'confirmed', 'confirmedBy']) {
              if (k in theirs) out[k] = theirs[k];
            }
            return out;
          }
          /* Terminal status recorded elsewhere always wins over our
             possibly-stale in-memory copy. */
          if (TERMINAL.has(theirs.status) && !TERMINAL.has(mine.status)) {
            out.status = theirs.status;
            out.lastError = theirs.lastError || out.lastError;
            out.appliedAt = theirs.appliedAt || out.appliedAt;
            if (theirs.confirmed !== undefined) out.confirmed = theirs.confirmed;
            if (theirs.confirmedBy !== undefined) out.confirmedBy = theirs.confirmedBy;
          }
          /* attempts only ever moves forward */
          out.attempts = Math.max(mine.attempts || 0, theirs.attempts || 0);
          return out;
        });
        /* Keep any job that exists in storage but not in our cache — unless
           it was deleted here. */
        const mineIds = new Set(queue.map(j => j.id));
        for (const j of stored) if (!mineIds.has(j.id) && !_removedIds.has(j.id)) merged.push(j);
        queue = merged;
        _statusTouched.clear();
        ST.set({ [KEY_QUEUE]: merged }, res);
      });
    });
  }
  function getRunnerState() {
    return new Promise(res => {
      ST.get([KEY_ACTIVE, KEY_CURRENT], d => res({
        active: !!d[KEY_ACTIVE],
        currentId: d[KEY_CURRENT] || null,
      }));
    });
  }

  let _junkRemoved = 0;

  /* ───── CRUD ───── */
  function uid() { return 'j_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); }
  function normaliseUrl(u) {
    try { return new URL(u.trim()).href; } catch (_) { return u.trim(); }
  }
  function urlExists(url) {
    const norm = normaliseUrl(url);
    return queue.some(j => normaliseUrl(j.url) === norm);
  }
  /* Only http(s) job URLs are allowed anywhere in the queue. The Edit box
     used to store whatever was typed, so a javascript: URL would be rendered
     as a link inside this extension page, where clicking it runs with the
     extension's privileges. Bare "example.com/jobs/1" still gets https://. */
  function safeJobUrl(u) {
    u = String(u == null ? '' : u).trim();
    if (!u) return '';
    if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
    try {
      const x = new URL(u);
      return /^https?:$/.test(x.protocol) ? x.href : '';
    } catch (_) { return ''; }
  }

  /* A link a job can actually be applied at: http(s), a real host name
     (with a dot), and not an image or other asset. A scraped page export
     carries logo images and CSS class names; those used to become "jobs"
     like https://font-semibold/ that could never be opened. */
  const ASSET_RE = /\.(png|jpe?g|gif|svg|webp|ico|bmp|css|js|woff2?|ttf|mp4|pdf)(\?|#|$)/i;
  function plausibleJobUrl(u) {
    try {
      const x = new URL(String(u || '').trim());
      if (!/^https?:$/.test(x.protocol)) return false;
      if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(x.hostname)) return false;
      return !ASSET_RE.test(x.pathname) && !/(^|\.)(media|cdn|static|img|images)\./i.test(x.hostname + '.');
    } catch (_) { return false; }
  }
  /* The same posting with tracking noise is still the same posting. */
  function cleanJobUrl(u) {
    try {
      const x = new URL(String(u).trim());
      x.hash = '';
      for (const k of [...x.searchParams.keys()]) {
        if (/^(utm_[\w-]*|fbclid|gclid|msclkid|mc_cid|mc_eid|igshid|_ga|trk|trackingId|ref|source)$/i.test(k)) x.searchParams.delete(k);
      }
      return x.href;
    } catch (_) { return ''; }
  }
  /* A job link in a cell however it was written: a bare URL, a URL inside
     text / markdown / HTML, or a host name without a scheme. */
  function jobUrlIn(cell) {
    const c = String(cell == null ? '' : cell).trim();
    if (!c) return '';
    for (const m of c.match(/https?:\/\/[^\s,"'<>)\]]+/gi) || []) if (plausibleJobUrl(m)) return cleanJobUrl(m);
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+\/\S*$/i.test(c) && plausibleJobUrl('https://' + c)) return cleanJobUrl('https://' + c);
    return '';
  }

  function addJob(url, title, company, notes) {
    url = safeJobUrl(url);
    if (!url) return null;
    if (urlExists(url)) return 'duplicate';
    const job = {
      id: uid(),
      url,
      title: (title || '').trim(),
      company: (company || '').trim(),
      ats: detectAts(url),
      notes: (notes || '').trim(),
      status: 'pending',
      addedAt: Date.now(),
      appliedAt: 0,
      attempts: 0,
      lastError: '',
      lastActionTs: 0,
    };
    queue.push(job);
    return job;
  }
  function editJob(id, updates) {
    const j = queue.find(x => x.id === id);
    if (!j) return false;
    if (updates.url !== undefined) {
      const u = safeJobUrl(updates.url);
      if (!u) return false;               // reject non-http(s) / malformed
      updates = Object.assign({}, updates, { url: u });
    }
    Object.assign(j, updates);
    if (updates.url) j.ats = detectAts(updates.url);
    return true;
  }
  /* Jobs deleted on this page. saveQueue() keeps jobs another writer added
     to storage meanwhile — which also put back every job just deleted, so
     Delete, Clear and Clear all never removed anything. */
  const _removedIds = new Set();
  /* Jobs whose status you changed on this page (saved as you set them). */
  const _statusTouched = new Set();
  function forget(jobs) { for (const j of jobs) _removedIds.add(j.id); }
  function deleteJob(id) { forget(queue.filter(j => j.id === id)); queue = queue.filter(j => j.id !== id); }
  function deleteIds(ids) { forget(queue.filter(j => ids.has(j.id))); queue = queue.filter(j => !ids.has(j.id)); }
  function setStatusForIds(ids, status) {
    for (const j of queue) if (ids.has(j.id)) { j.status = status; _statusTouched.add(j.id); }
  }
  function clearByStatus(status) { forget(queue.filter(j => j.status === status)); queue = queue.filter(j => j.status !== status); }

  /* ───── Render ───── */
  function visibleJobs() {
    const q = view.search.toLowerCase();
    return queue.filter(j => {
      if (view.filter !== 'all' && j.status !== view.filter) return false;
      if (view.ats !== 'all' && j.ats !== view.ats) return false;
      if (q) {
        const hay = (j.url + ' ' + j.title + ' ' + j.company + ' ' + j.notes).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }
  function fmtTs(ts) {
    if (!ts) return '—';
    const diff = Date.now() - ts;
    if (diff < 60_000) return Math.round(diff / 1000) + 's ago';
    if (diff < 3600_000) return Math.round(diff / 60_000) + 'm ago';
    if (diff < 86400_000) return Math.round(diff / 3600_000) + 'h ago';
    return Math.round(diff / 86400_000) + 'd ago';
  }
  function renderStats() {
    const c = { all: queue.length, pending: 0, running: 0, applied: 0, failed: 0, skipped: 0 };
    /* Split "applied" into CONFIRMED (we saw a real confirmation page)
       vs UNCONFIRMED (we clicked submit but nothing confirmed it). Only
       the confirmed number should be trusted as a real application. */
    let confirmed = 0, unconfirmed = 0;
    for (const j of queue) {
      c[j.status] = (c[j.status] || 0) + 1;
      if (j.status === 'applied') { if (j.confirmed) confirmed++; else unconfirmed++; }
    }
    const el = document.getElementById('stats');
    /* Each tile filters the table to its status (click again for all). */
    const tile = (f, cls, n, label, title) =>
      `<button type="button" class="stat ${cls}${view.filter === f && f !== 'all' ? ' on' : ''}" data-f="${f}"${title ? ` title="${title}"` : ''}><b>${n}</b>${label}</button>`;
    el.innerHTML = '' +
      tile('all', '', c.all, 'Total') +
      tile('pending', 's-pending', c.pending, 'Pending') +
      tile('running', 's-running', c.running, 'Running') +
      tile('applied', 's-applied', confirmed, 'Confirmed', 'Applications with a real on-page confirmation — these are the ones that genuinely went through') +
      tile('applied', 's-unconfirmed', unconfirmed, 'Unconfirmed', 'Submit was clicked but no confirmation appeared — not proof it was received. Check these yourself.') +
      tile('failed', 's-failed', c.failed, 'Failed') +
      tile('skipped', 's-skipped', c.skipped, 'Skipped');
  }
  function renderAtsFilter() {
    const el = document.getElementById('atsFilter');
    const cur = el.value;
    const seen = new Set();
    for (const j of queue) if (j.ats) seen.add(j.ats);
    const opts = ['<option value="all">All ATS</option>'];
    [...seen].sort().forEach(a => opts.push(`<option value="${esc(a)}">${esc(a)}</option>`));
    el.innerHTML = opts.join('');
    if ([...seen].includes(cur)) el.value = cur;
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /* Keep the bulk-action bar in sync with the selection in EVERY render
     path (selecting, filtering to an empty view, deleting, etc.). */
  function updateBulkBar() {
    const bulk = document.getElementById('bulkActions');
    if (!bulk) return;
    /* Drop selections for jobs that no longer exist (deleted/cleared). */
    if (selectedIds.size) {
      const live = new Set(queue.map(j => j.id));
      for (const id of [...selectedIds]) if (!live.has(id)) selectedIds.delete(id);
    }
    if (selectedIds.size) {
      bulk.classList.add('visible');
      const cnt = document.getElementById('bulkCount');
      if (cnt) cnt.textContent = selectedIds.size + ' selected';
    } else {
      bulk.classList.remove('visible');
    }
  }
  /* Reflect selection on the header "select all" checkbox: checked when
     every visible job is selected, indeterminate on a partial selection. */
  function syncSelectAll(visible) {
    const all = document.getElementById('selectAll');
    if (!all) return;
    const sel = visible.filter(j => selectedIds.has(j.id)).length;
    all.checked = visible.length > 0 && sel === visible.length;
    all.indeterminate = sel > 0 && sel < visible.length;
  }
  function render() {
    renderStats();
    renderAtsFilter();
    updateBulkBar();
    const tbody = document.getElementById('jobsTbody');
    const empty = document.getElementById('emptyState');
    const visible = visibleJobs();
    if (queue.length === 0) {
      tbody.innerHTML = '';
      empty.classList.remove('hidden');
      document.getElementById('jobsTable').style.display = 'none';
      syncSelectAll(visible);
      return;
    }
    empty.classList.add('hidden');
    document.getElementById('jobsTable').style.display = '';
    if (!visible.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty" style="padding:30px">No jobs match the current filter.</td></tr>`;
      syncSelectAll(visible);
      return;
    }
    const rows = visible.map((j, idx) => {
      const checked = selectedIds.has(j.id) ? 'checked' : '';
      const rowCls = j.status === 'running' ? 'running-row' :
                     j.status === 'applied' ? 'applied-row' :
                     j.status === 'failed' ? 'failed-row' : '';
      const url = safeJobUrl(j.url);
      let host = '';
      try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (_) {}
      const unconfirmed = j.status === 'applied' && !j.confirmed;
      const badgeCls = unconfirmed ? 'unconfirmed' : j.status;
      const badgeTxt = unconfirmed ? 'Unconfirmed' : j.status === 'applied' ? 'Applied' : j.status.charAt(0).toUpperCase() + j.status.slice(1);
      const badgeTip = j.status === 'applied' ? (j.confirmed ? esc(j.confirmedBy || 'confirmation page detected') : 'No confirmation was detected — check it yourself') : '';
      const title = j.title || host || 'Untitled job';
      const meta = [j.company ? esc(j.company) : '', url ? `<a href="${esc(url)}" target="_blank" rel="noopener" title="${esc(j.url)}">${esc(truncate(host + new URL(url).pathname, 70))}</a>` : `<span title="Invalid URL">${esc(truncate(String(j.url || ''), 60))}</span>`]
        .filter(Boolean).join(' · ');
      return `<tr class="${rowCls}" data-id="${j.id}">
        <td class="checkbox-cell"><input type="checkbox" class="row-check" data-id="${j.id}" ${checked}></td>
        <td class="num">${idx + 1}</td>
        <td><div class="job"><span class="job-title" title="${esc(title)}">${esc(title)}</span><span class="job-meta">${meta}</span>${j.status === 'failed' && j.lastError ? `<span class="job-err" title="${esc(j.lastError)}">${esc(j.lastError)}</span>` : ''}</div></td>
        <td><span class="badge b-${badgeCls}" title="${badgeTip}">${badgeTxt}</span></td>
        <td><span class="ats-tag">${esc(j.ats || 'Other')}</span></td>
        <td class="num">${j.attempts || 0}</td>
        <td class="when" title="${j.lastError ? esc(j.lastError) : ''}">${fmtTs(j.lastActionTs || j.appliedAt || j.addedAt)}</td>
        <td class="row-actions"><div>
          <button data-action="open" data-id="${j.id}" title="Open" aria-label="Open">${ICONS.open}</button>
          <button data-action="edit" data-id="${j.id}" title="Edit" aria-label="Edit">${ICONS.edit}</button>
          <button class="btn-danger" data-action="delete" data-id="${j.id}" title="Delete" aria-label="Delete">${ICONS.trash}</button>
        </div></td>
      </tr>`;
    });
    tbody.innerHTML = rows.join('');
    updateBulkBar();
    syncSelectAll(visible);
  }
  function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  const ICONS = {
    open: '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path d="M9 3h4v4M13 3L7.5 8.5M12 9.5V13H3V4h3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
    edit: '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 3.5l2 2L6 12H4v-2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" fill="none"/></svg>',
    trash: '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  };

  /* ───── Toast ───── */
  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast t-' + (kind || 'info');
    el.textContent = msg;
    document.getElementById('toastContainer').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; }, 2700);
    setTimeout(() => el.remove(), 3000);
  }

  /* ───── Modal ───── */
  function openModal(job) {
    editingId = job ? job.id : null;
    document.getElementById('modalTitle').textContent = job ? 'Edit Job' : 'Add Job';
    document.getElementById('fldUrl').value     = job ? job.url     : '';
    document.getElementById('fldTitle').value   = job ? job.title   : '';
    document.getElementById('fldCompany').value = job ? job.company : '';
    document.getElementById('fldNotes').value   = job ? job.notes   : '';
    document.getElementById('editModal').classList.remove('hidden');
    document.getElementById('fldUrl').focus();
  }
  function closeModal() {
    editingId = null;
    document.getElementById('editModal').classList.add('hidden');
  }

  /* ───── CSV import ───── */
  /* Like the Jobright build's importer: any delimiter, BOM stripped, header
     row detected, and the job link taken from the column that actually
     holds job links (by header — url / link / href / apply — and by what is
     in it), else from whichever cell in the row has one. Rows without a
     usable link are counted and dropped, never turned into a fake URL. */
  function importCsv(text, sourceName) {
    text = String(text || '').replace(/^\uFEFF/, '');
    const rows = parseCsv(text, sniffDelimiter(text));
    if (!rows.length) { toast('CSV is empty', 'error'); return; }
    const first = rows[0].map(c => String(c).trim().toLowerCase());
    const firstHasUrl = rows[0].some(c => jobUrlIn(c));
    const hasHeader = !firstHasUrl && rows.length > 1;
    const data = hasHeader ? rows.slice(1) : rows;
    const width = Math.max(...rows.slice(0, 200).map(r => r.length));
    const sample = data.slice(0, 200);
    const share = (i, test) => sample.length ? sample.filter(r => test(r[i])).length / sample.length : 0;
    const col = {};
    /* Link column: the header's word helps, the contents decide. */
    let bestUrl = -1, bestScore = 0;
    for (let i = 0; i < width; i++) {
      const h = hasHeader ? (first[i] || '') : '';
      let score = share(i, c => !!jobUrlIn(c));
      if (/\b(url|link|href|apply|application|posting|job.?url)\b/.test(h)) score += 0.25;
      if (/\b(src|logo|image|img|avatar|icon)\b/.test(h)) score -= 1;
      if (score > bestScore) { bestScore = score; bestUrl = i; }
    }
    if (bestUrl >= 0 && bestScore >= 0.3) col.url = bestUrl;
    if (hasHeader) {
      first.forEach((h, i) => {
        if (i === col.url) return;
        if (col.title == null && /\b(title|position|role|job.?title|job.?name|vacancy|opening)\b/.test(h)) col.title = i;
        else if (col.company == null && /\b(company|employer|organi[sz]ation|business|hiring)\b/.test(h)) col.company = i;
        else if (col.notes == null && /\b(notes?|comments?)\b/.test(h)) col.notes = i;
      });
    }
    /* No title column named: the first column of plain text (a scraped
       listing puts the job title first). */
    if (col.title == null) {
      for (let i = 0; i < width; i++) {
        if (i === col.url || i === col.company) continue;
        if (share(i, c => { const v = String(c || '').trim(); return v.length >= 3 && v.length <= 150 && !/https?:\/\//i.test(v); }) >= 0.6) { col.title = i; break; }
      }
    }
    let added = 0, dupes = 0, invalid = 0;
    for (const r of data) {
      const url = (col.url != null && jobUrlIn(r[col.url])) || r.map(jobUrlIn).find(Boolean) || '';
      if (!url) { invalid++; continue; }
      const result = addJob(url,
        col.title != null ? r[col.title] : '',
        col.company != null ? r[col.company] : '',
        col.notes != null ? r[col.notes] : '');
      if (result === 'duplicate') dupes++;
      else if (result) added++;
      else invalid++;
    }
    saveQueue().then(() => {
      render();
      const parts = [];
      if (added) parts.push(`${added} added`);
      if (dupes) parts.push(`${dupes} duplicates skipped`);
      if (invalid) parts.push(`${invalid} without a job link`);
      const msg = (sourceName ? sourceName + ': ' : 'Import: ') + (parts.join(', ') || 'no changes');
      if (!added && invalid && invalid === data.length) {
        toast(`${msg} — this file has no application links (only titles / companies), so nothing can be applied to`, 'error');
      } else toast(msg, added ? 'success' : 'info');
      dbg('CSV import', { source: sourceName || '', rows: data.length, header: hasHeader, columns: col, added, dupes, invalid });
    });
  }
  function exportCsv() {
    const csv = toCsv(queue);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `optimhire-queue-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(`Exported ${queue.length} jobs`, 'success');
  }
  function downloadTemplate() {
    const tpl = 'url,title,company,notes\nhttps://example.com/jobs/123,Senior Engineer,Acme,Apply ASAP\n';
    const blob = new Blob([tpl], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'optimhire-queue-template.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ═══════════════════════ RUNNER ═══════════════════════ */
  /* The run itself lives in the service worker (static/background/
     queue-runner.js): it opens each job in its own background tab, closes it
     when the job's tab reports done, opens the next, and keeps going whether
     or not this page is open. This page starts and stops it, and shows it. */
  const KEY_CONCURRENCY = 'ohJobQueueConcurrency';
  function getConcurrency() {
    const sel = document.getElementById('concurrencySelect');
    let n = sel ? parseInt(sel.value, 10) : 1;
    if (!Number.isFinite(n) || n < 1) n = 1;
    if (n > 5) n = 5;
    return n;
  }
  function tellRunner(msg) {
    return new Promise(res => {
      try { chrome.runtime.sendMessage(msg, r => { void chrome.runtime.lastError; res(r); }); } catch (_) { res(null); }
    });
  }

  async function startQueue() {
    if (!queue.some(j => j.status === 'pending' || j.status === 'running')) {
      toast('No pending jobs in queue', 'error');
      dbg('startQueue rejected — no pending/running jobs', { queueLen: queue.length }, 'warn');
      return;
    }
    await saveQueue();
    const conc = getConcurrency();
    setRunnerIndicator(true);
    await tellRunner({ type: 'OH_QUEUE_START', concurrency: conc });
    toast(`Queue started — up to ${conc} job${conc > 1 ? 's' : ''} at a time, in background tabs. It keeps going if you close this page.`, 'success');
    dbg('startQueue', { concurrency: conc, total: queue.length, pending: queue.filter(j => j.status === 'pending').length });
  }

  async function stopQueue() {
    await tellRunner({ type: 'OH_QUEUE_STOP' });
    setRunnerIndicator(false);
    toast('Queue stopped — job tabs closed', 'info');
    dbg('stopQueue', {});
  }

  function setRunnerIndicator(on) {
    const el = document.getElementById('runnerIndicator');
    const start = document.getElementById('btnStart');
    const stop  = document.getElementById('btnStop');
    if (on) { el.classList.remove('hidden'); start.disabled = true; stop.disabled = false; }
    else    { el.classList.add('hidden');    start.disabled = false; stop.disabled = true; }
  }

  /* ───── Event wiring ───── */
  function on(id, ev, fn) { const e = document.getElementById(id); if (e) e.addEventListener(ev, fn); }

  function init() {
    on('btnAdd', 'click', () => openModal(null));
    on('btnEmptyAdd', 'click', () => openModal(null));
    on('btnImport', 'click', () => document.getElementById('csvInput').click());
    on('btnEmptyImport', 'click', () => document.getElementById('csvInput').click());
    on('btnExport', 'click', exportCsv);
    on('btnEmptyTemplate', 'click', downloadTemplate);
    on('csvInput', 'change', (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => importCsv(r.result, f.name);
      r.readAsText(f);
      e.target.value = ''; // allow re-import same file
    });
    /* Drop a CSV file — or text with links — anywhere on the page. */
    document.addEventListener('dragover', (e) => { e.preventDefault(); });
    document.addEventListener('drop', (e) => {
      e.preventDefault();
      const files = [...((e.dataTransfer && e.dataTransfer.files) || [])];
      if (files.length) {
        for (const f of files) { const r = new FileReader(); r.onload = () => importCsv(r.result, f.name); r.readAsText(f); }
        return;
      }
      const t = e.dataTransfer && e.dataTransfer.getData('text/plain');
      if (t) importCsv(t, 'Dropped text');
    });
    on('btnStart', 'click', startQueue);
    on('btnStop',  'click', stopQueue);
    on('btnDebug', 'click', () => {
      try { chrome.tabs.create({ url: chrome.runtime.getURL('tabs/debug.html'), active: true }); }
      catch (_) {}
    });
    on('btnRetryFailed', 'click', async () => {
      let n = 0;
      for (const j of queue) if (j.status === 'failed') { j.status = 'pending'; j.lastError = ''; j.attempts = 0; _statusTouched.add(j.id); n++; }
      if (!n) { toast('No failed jobs to re-queue', 'info'); return; }
      await saveQueue(); render();
      toast(`${n} failed jobs back to pending`, 'success');
    });
    on('btnClearCompleted', 'click', async () => {
      const n = queue.filter(j => j.status === 'applied').length;
      if (!n) { toast('No applied jobs to clear', 'info'); return; }
      if (!confirm(`Remove ${n} applied jobs from the queue?`)) return;
      clearByStatus('applied');
      await saveQueue(); render();
      toast(`Cleared ${n} applied jobs`, 'success');
    });
    on('btnClearAll', 'click', async () => {
      if (!queue.length) return;
      if (!confirm(`Delete ALL ${queue.length} jobs? This cannot be undone.`)) return;
      const stored = await new Promise(r => ST.get([KEY_QUEUE], d => r(Array.isArray(d[KEY_QUEUE]) ? d[KEY_QUEUE] : [])));
      forget(stored); forget(queue);
      queue = []; selectedIds.clear();
      await saveQueue(); render();
      toast('Queue cleared', 'info');
    });

    on('searchInput',  'input',  (e) => { view.search = e.target.value; render(); });
    on('stats', 'click', (e) => {
      const t = e.target.closest && e.target.closest('.stat[data-f]');
      if (!t) return;
      const f = t.getAttribute('data-f');
      view.filter = (view.filter === f || f === 'all') ? 'all' : f;
      const sf = document.getElementById('statusFilter');
      if (sf) sf.value = view.filter;
      render();
    });
    on('statusFilter', 'change', (e) => { view.filter = e.target.value; render(); });
    on('atsFilter',    'change', (e) => { view.ats    = e.target.value; render(); });

    on('selectAll', 'change', (e) => {
      const visible = visibleJobs();
      if (e.target.checked) for (const j of visible) selectedIds.add(j.id);
      else for (const j of visible) selectedIds.delete(j.id);
      render();
    });
    on('btnBulkClear', 'click', () => { selectedIds.clear(); render(); });
    on('btnBulkDelete', 'click', async () => {
      if (!selectedIds.size) return;
      if (!confirm(`Delete ${selectedIds.size} selected jobs?`)) return;
      deleteIds(selectedIds);
      const n = selectedIds.size; selectedIds.clear();
      await saveQueue(); render();
      toast(`Deleted ${n} jobs`, 'info');
    });
    on('btnBulkRequeue', 'click', async () => {
      if (!selectedIds.size) return;
      setStatusForIds(selectedIds, 'pending');
      await saveQueue(); render();
      toast(`Marked ${selectedIds.size} jobs pending`, 'success');
    });

    /* Modal */
    on('modalCancel', 'click', closeModal);
    document.getElementById('editModal').addEventListener('click', (e) => {
      if (e.target.id === 'editModal') closeModal();
    });
    on('modalSave', 'click', async () => {
      const url = document.getElementById('fldUrl').value.trim();
      if (!url) { toast('URL is required', 'error'); return; }
      const updates = {
        url,
        title:   document.getElementById('fldTitle').value.trim(),
        company: document.getElementById('fldCompany').value.trim(),
        notes:   document.getElementById('fldNotes').value.trim(),
      };
      if (editingId) {
        if (!editJob(editingId, updates)) { toast('Invalid URL — only http(s) links are allowed', 'error'); return; }
        toast('Job updated', 'success');
      } else {
        const r = addJob(updates.url, updates.title, updates.company, updates.notes);
        if (r === 'duplicate') { toast('URL already in queue', 'error'); return; }
        if (!r) { toast('Invalid URL', 'error'); return; }
        toast('Job added', 'success');
      }
      closeModal();
      await saveQueue(); render();
    });

    /* Row delegated clicks */
    document.getElementById('jobsTbody').addEventListener('click', async (e) => {
      /* The click lands on the icon inside the button. */
      const btn = e.target.closest && e.target.closest('button[data-action]');
      const a = btn && btn.dataset.action; const id = btn && btn.dataset.id;
      if (!a || !id) return;
      if (a === 'open') {
        const j = queue.find(x => x.id === id);
        const openUrl = j && safeJobUrl(j.url);
        if (openUrl) chrome.tabs.create({ url: openUrl, active: true });
        else toast('Invalid URL — edit this job first', 'error');
      } else if (a === 'edit') {
        const j = queue.find(x => x.id === id);
        if (j) openModal(j);
      } else if (a === 'delete') {
        if (!confirm('Delete this job?')) return;
        deleteJob(id);
        selectedIds.delete(id);
        await saveQueue(); render();
      }
    });
    document.getElementById('jobsTbody').addEventListener('change', (e) => {
      if (!e.target.classList.contains('row-check')) return;
      const id = e.target.dataset.id;
      if (e.target.checked) selectedIds.add(id); else selectedIds.delete(id);
      render();
    });

    /* Auto-detect ATS as user types URL */
    on('fldUrl', 'input', (e) => {
      const v = e.target.value;
      const ats = v ? detectAts(v) : '';
      const help = document.querySelector('#editModal .help-text');
      if (help) help.textContent =
        v ? `Detected ATS: ${ats}` : 'The direct apply page (not the job listing). Detected ATS will appear after you paste.';
    });

    /* Persist concurrency choice */
    on('concurrencySelect', 'change', (e) => {
      ST.set({ [KEY_CONCURRENCY]: parseInt(e.target.value, 10) || 1 });
    });
    on('preferAts', 'change', (e) => {
      _preferAts = !!e.target.checked;
      ST.set({ ohPreferAts: _preferAts });
      toast(_preferAts ? 'ATS jobs first, Reed last' : 'Queue order as listed', 'info');
    });

    /* Watch storage so the running indicator + statuses stay live AND
       the orchestrator advances when a content script reports done. */
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes[KEY_QUEUE]) { queue = changes[KEY_QUEUE].newValue || []; render(); }
      if (changes.ohPreferAts) {
        _preferAts = changes.ohPreferAts.newValue !== false;
        const pa = document.getElementById('preferAts');
        if (pa) pa.checked = _preferAts;
      }
      if (changes[KEY_ACTIVE]) {
        const on = !!changes[KEY_ACTIVE].newValue;
        setRunnerIndicator(on);
        if (!on && changes[KEY_ACTIVE].oldValue && !queue.some(j => j.status === 'pending' || j.status === 'running')) toast('Queue complete', 'success');
      }
    });
  }

  load()
    .then(d => {
      /* Restore concurrency choice */
      const sel = document.getElementById('concurrencySelect');
      if (sel && d[KEY_CONCURRENCY]) sel.value = String(d[KEY_CONCURRENCY]);
      _preferAts = d.ohPreferAts !== false;
      const pa = document.getElementById('preferAts');
      if (pa) pa.checked = _preferAts;
      setRunnerIndicator(!!d[KEY_ACTIVE]);
      init();
      render();
      if (_junkRemoved) {
        saveQueue().then(render);
        toast(`Removed ${_junkRemoved} entries that were not job links (left by an earlier CSV import)`, 'info');
      }
    })
    .catch(err => {
      console.error('[jobQueue] load failed:', err);
      init(); render();
    });
})();
