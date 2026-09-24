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

  /* ───── CSV parsing / writing ───── */
  /** RFC-4180-ish CSV parser. Handles quoted fields with commas, embedded
      newlines, and "" escapes. Returns array of row arrays. */
  function parseCsv(text) {
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
        else if (ch === ',') { row.push(field); field = ''; }
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
      ST.get([KEY_QUEUE, KEY_ACTIVE, KEY_CURRENT, KEY_STARTTS], (d) => {
        queue = Array.isArray(d[KEY_QUEUE]) ? d[KEY_QUEUE] : [];
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
        /* Keep any job that exists in storage but not in our cache. */
        const mineIds = new Set(queue.map(j => j.id));
        for (const j of stored) if (!mineIds.has(j.id)) merged.push(j);
        queue = merged;
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
  function deleteJob(id) { queue = queue.filter(j => j.id !== id); }
  function deleteIds(ids) { queue = queue.filter(j => !ids.has(j.id)); }
  function setStatusForIds(ids, status) {
    for (const j of queue) if (ids.has(j.id)) j.status = status;
  }
  function clearByStatus(status) { queue = queue.filter(j => j.status !== status); }

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
    el.innerHTML = '' +
      `<div class="stat"><b>${c.all}</b>Total</div>` +
      `<div class="stat s-pending"><b>${c.pending}</b>Pending</div>` +
      `<div class="stat s-running"><b>${c.running}</b>Running</div>` +
      `<div class="stat s-applied" title="Applications with a real on-page confirmation — these are the ones that genuinely went through"><b>${confirmed}</b>✅ Confirmed</div>` +
      `<div class="stat s-skipped" title="Submit was clicked but no confirmation appeared — NOT proof it was received. Verify these manually."><b>${unconfirmed}</b>⚠ Unconfirmed</div>` +
      `<div class="stat s-failed"><b>${c.failed}</b>Failed</div>` +
      `<div class="stat s-skipped"><b>${c.skipped}</b>Skipped</div>`;
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
      tbody.innerHTML = `<tr><td colspan="10" class="empty" style="padding:30px">No jobs match the current filter.</td></tr>`;
      syncSelectAll(visible);
      return;
    }
    const rows = visible.map((j, idx) => {
      const checked = selectedIds.has(j.id) ? 'checked' : '';
      const rowCls = j.status === 'running' ? 'running-row' :
                     j.status === 'applied' ? 'applied-row' :
                     j.status === 'failed' ? 'failed-row' : '';
      return `<tr class="${rowCls}" data-id="${j.id}">
        <td class="checkbox-cell"><input type="checkbox" class="row-check" data-id="${j.id}" ${checked}></td>
        <td>${idx + 1}</td>
        <td><span class="badge b-${j.status}" title="${j.status === 'applied' ? (j.confirmed ? esc(j.confirmedBy || 'confirmation page detected') : 'No confirmation was detected — verify manually') : ''}">${j.status}${j.status === 'applied' ? (j.confirmed ? ' ✅' : ' ⚠') : ''}</span></td>
        <td class="url-col">${safeJobUrl(j.url)
          ? `<a href="${esc(safeJobUrl(j.url))}" target="_blank" rel="noopener" title="${esc(j.url)}">${esc(truncate(j.url, 60))}</a>`
          : `<span title="Invalid URL">${esc(truncate(String(j.url || ''), 60))}</span>`}</td>
        <td>${esc(j.title || '—')}</td>
        <td>${esc(j.company || '—')}</td>
        <td><span class="ats-tag">${esc(j.ats || 'Other')}</span></td>
        <td>${j.attempts || 0}</td>
        <td title="${j.lastError ? esc(j.lastError) : ''}">${fmtTs(j.lastActionTs || j.appliedAt || j.addedAt)}</td>
        <td class="row-actions">
          <button class="btn-small" data-action="open" data-id="${j.id}">Open</button>
          <button class="btn-small" data-action="edit" data-id="${j.id}">Edit</button>
          <button class="btn-small btn-danger" data-action="delete" data-id="${j.id}">Delete</button>
        </td>
      </tr>`;
    });
    tbody.innerHTML = rows.join('');
    updateBulkBar();
    syncSelectAll(visible);
  }
  function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

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
  function importCsv(text) {
    const rows = parseCsv(text);
    if (!rows.length) { toast('CSV is empty', 'error'); return; }
    /* First row could be header. Detect by looking for common header words. */
    const first = rows[0].map(c => c.trim().toLowerCase());
    const hasHeader = first.some(c => /\b(url|link|job_url|application_url)\b/.test(c));
    const headerMap = {};
    if (hasHeader) {
      first.forEach((c, i) => {
        if (/\b(url|link|job_url|application_url)\b/.test(c)) headerMap.url = i;
        else if (/\btitle|job_title|position\b/.test(c)) headerMap.title = i;
        else if (/\bcompany|employer\b/.test(c)) headerMap.company = i;
        else if (/\bnotes?|comment|note\b/.test(c)) headerMap.notes = i;
      });
    } else {
      headerMap.url = 0; headerMap.title = 1; headerMap.company = 2; headerMap.notes = 3;
    }
    if (headerMap.url == null) headerMap.url = 0;
    let added = 0, dupes = 0, invalid = 0;
    const dataRows = hasHeader ? rows.slice(1) : rows;
    for (const r of dataRows) {
      const url = (r[headerMap.url] || '').trim();
      if (!url) { invalid++; continue; }
      const result = addJob(
        url,
        headerMap.title   != null ? r[headerMap.title]   : '',
        headerMap.company != null ? r[headerMap.company] : '',
        headerMap.notes   != null ? r[headerMap.notes]   : '',
      );
      if (result === 'duplicate') dupes++;
      else if (result) added++;
      else invalid++;
    }
    saveQueue().then(() => {
      render();
      const parts = [];
      if (added) parts.push(`${added} added`);
      if (dupes) parts.push(`${dupes} duplicates skipped`);
      if (invalid) parts.push(`${invalid} invalid`);
      toast('Import: ' + (parts.join(', ') || 'no changes'), added ? 'success' : 'info');
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

  /* ════════════════════════════════════════════════════════════
     RUNNER / ORCHESTRATOR
     ════════════════════════════════════════════════════════════
     This page (an extension page) owns tab lifecycle — content
     scripts cannot create/close tabs. Each pending job opens in its
     OWN tab; the content script fills + submits + reports terminal
     status; this orchestrator then closes that tab and opens the
     next pending job. Up to `concurrency` jobs run in parallel tabs
     to save time. The OptimHire my-jobs tab is NEVER touched —
     we only ever create/close tabs we opened ourselves (tracked in
     _tabMap) and only navigate via fresh chrome.tabs.create.
     ────────────────────────────────────────────────────────── */
  /* A job may be opened at most this many times, ever. Hard backstop
     against any race that returns an already-opened job to 'pending'. */
  const MAX_OPEN_ATTEMPTS = 3;
  const KEY_CONCURRENCY = 'ohJobQueueConcurrency';
  const KEY_ADVANCE_REQ = 'ohJobQueueAdvanceReq';
  let _tabMap = new Map();       // jobId → tabId (tabs WE opened)
  let _lastAdvanceTs = 0;        // de-dupe advance requests
  let _orchestrating = false;

  function getConcurrency() {
    const sel = document.getElementById('concurrencySelect');
    let n = sel ? parseInt(sel.value, 10) : 1;
    if (!Number.isFinite(n) || n < 1) n = 1;
    if (n > 5) n = 5;
    return n;
  }

  function runningWithTab() {
    /* jobs marked running that we have an open tab for */
    let n = 0;
    for (const j of queue) if (j.status === 'running' && _tabMap.has(j.id)) n++;
    return n;
  }

  /* Drop entries from _tabMap whose tab no longer exists, and return the
     number of job tabs we ACTUALLY still have open. Trusting _tabMap (or
     a job's stored status) alone was unsafe: if chrome.tabs.create ever
     failed to yield a tab id, the "running with tab" count stayed 0 and
     the fill loop kept opening tabs forever. */
  async function liveJobTabCount() {
    const entries = [..._tabMap.entries()];
    let live = 0;
    for (const [jobId, tabId] of entries) {
      /* -1 is an in-flight reservation (tab being created right now).
         It occupies a slot but has no real tab to query yet. */
      if (tabId === -1) { live++; continue; }
      const ok = await new Promise(res => {
        try {
          chrome.tabs.get(tabId, (t) => {
            const err = chrome.runtime.lastError;
            res(!err && !!t);
          });
        } catch (_) { res(false); }
      });
      if (ok) live++; else _tabMap.delete(jobId);
    }
    return live;
  }

  /* ── Single-orchestrator election ──────────────────────────────────
     Every open copy of this page runs its own orchestrator with its own
     _tabMap and _orchestrating guard, so two Queue Manager tabs meant
     two independent fillers each opening `concurrency` tabs — a second
     way to end up with a wall of tabs. Exactly one instance (identified
     by its own chrome tab id) owns orchestration; the others render the
     UI read-only. Ownership is reclaimed if the owner tab is gone. */
  const KEY_OWNER = 'ohJobQueueOwnerTab';
  let _myTabId = null;

  function getMyTabId() {
    return new Promise(res => {
      try { chrome.tabs.getCurrent(t => res(t && t.id != null ? t.id : null)); }
      catch (_) { res(null); }
    });
  }
  function tabExists(tabId) {
    return new Promise(res => {
      if (tabId == null) return res(false);
      try {
        chrome.tabs.get(tabId, (t) => res(!chrome.runtime.lastError && !!t));
      } catch (_) { res(false); }
    });
  }
  /* True when this page is (or just became) the orchestration owner. */
  async function claimOwnership() {
    if (_myTabId == null) _myTabId = await getMyTabId();
    if (_myTabId == null) return true;   // not in a tab context — act alone
    const d = await new Promise(r => ST.get([KEY_OWNER], r));
    const owner = d && d[KEY_OWNER];
    if (owner === _myTabId) return true;
    if (owner != null && await tabExists(owner)) return false;  // someone else owns it
    await new Promise(r => ST.set({ [KEY_OWNER]: _myTabId }, r));
    return true;
  }

  /* Open up to `concurrency` pending jobs, each in its own tab.
     Hardened against the runaway-tab bug: the loop is bounded, every job
     is re-looked-up from the LIVE queue after each await (the storage
     listener REPLACES the `queue` array, so any reference held across an
     await is stale and mutating it silently did nothing — leaving the job
     'pending' so it was picked again and again), and the slot count comes
     from tabs that verifiably exist. */
  async function fillSlots() {
    if (_orchestrating) return; _orchestrating = true;
    try {
      /* Only the elected owner opens tabs, so extra Queue Manager tabs
         can't each spawn their own set. */
      if (!(await claimOwnership())) return;
      const conc = getConcurrency();
      let opened = false;
      /* Hard bound: never open more than `conc` tabs per invocation, no
         matter what the counters say. */
      for (let guard = 0; guard < conc; guard++) {
        const live = await liveJobTabCount();
        if (live >= conc) break;
        /* Pick the next pending job from the LIVE queue, and capture only
           its id — never an object reference that an await could stale.
           Two extra guards make repeat-opening structurally impossible:
             • attempts cap — ohJobQueue has THREE independent
               read-modify-write writers (this saveQueue(), and the content
               script's advance() and self-navigate fallback). A stale
               write can clobber a job back to 'pending' after we already
               opened it, so without a cap the same job is reopened
               forever (this is what produced dozens of tabs for one job).
             • URL dedupe — never open a URL we already have a tab for,
               even if it appears under a different job id. */
        const openUrls = new Set();
        for (const [jid] of _tabMap) {
          const t = queue.find(j => j.id === jid);
          if (t && t.url) openUrls.add(normaliseUrl(t.url));
        }
        const candidate = queue.find(j =>
          j.status === 'pending' &&
          !_tabMap.has(j.id) &&
          (j.attempts || 0) < MAX_OPEN_ATTEMPTS &&
          !(j.url && openUrls.has(normaliseUrl(j.url)))
        );
        /* Retire anything that blew the attempts cap so it can't be
           re-selected on the next pass either. */
        let retired = false;
        for (const j of queue) {
          if (j.status === 'pending' && (j.attempts || 0) >= MAX_OPEN_ATTEMPTS) {
            j.status = 'failed';
            j.lastError = `gave up after ${MAX_OPEN_ATTEMPTS} open attempts`;
            j.lastActionTs = Date.now();
            retired = true;
          }
        }
        if (retired) await saveQueue();
        if (!candidate) break;
        const jobId = candidate.id;
        const jobUrl = safeJobUrl(candidate.url);
        if (!jobUrl) { /* nothing (valid) to open — mark failed so we can't spin */
          const bad = queue.find(j => j.id === jobId);
          if (bad) { bad.status = 'failed'; bad.lastError = 'missing URL'; }
          await saveQueue();
          continue;
        }
        /* Reserve the slot BEFORE the async tab creation so a re-entrant
           or concurrent pass can't select the same job again. */
        _tabMap.set(jobId, -1);   // placeholder: reserved, tab not yet known
        const jobRef = queue.find(j => j.id === jobId);
        if (jobRef) {
          jobRef.status = 'running';
          jobRef.attempts = (jobRef.attempts || 0) + 1;
          jobRef.lastActionTs = Date.now();
        }
        await saveQueue();
        /* Open in a NEW tab. Kept in the background so a run can never
           steal focus or pile visible tabs over the user's work; the
           content script's queue runner drives the fill regardless. */
        const tab = await new Promise(res => {
          try {
            chrome.tabs.create({ url: jobUrl, active: false }, (t) => {
              const err = chrome.runtime.lastError;
              res(err ? null : t);
            });
          } catch (_) { res(null); }
        });
        if (tab && tab.id != null) {
          _tabMap.set(jobId, tab.id);
          opened = true;
          /* Paylocity stalls while hidden (2.9.0) — bring it to the front. */
          if (isPaylocityUrl(jobUrl)) await focusJobTab(tab.id, 'paylocity-url');
        } else {
          /* Tab creation failed — release the reservation and mark the job
             failed so the loop cannot retry it indefinitely. */
          _tabMap.delete(jobId);
          const failed = queue.find(j => j.id === jobId);
          if (failed) {
            failed.status = 'failed';
            failed.lastError = 'could not open tab';
            failed.lastActionTs = Date.now();
          }
          await saveQueue();
        }
      }
      if (opened) render();
    } catch (_) {} finally { _orchestrating = false; }
  }

  /* ── Paylocity auto-focus ────────────────────────────────────────────
   * OptimHire 2.9.0's autofill does `while (document.hidden) sleep(1s)` for
   * Paylocity — an unbounded wait. Queue tabs open in the background, so a
   * Paylocity job sat paused until the user clicked its tab, then hit the
   * job timeout. Such tabs are now brought to the front:
   *   - a Paylocity URL is activated as soon as its tab is created;
   *   - a job that only REDIRECTS to Paylocity asks from the content script
   *     (OH_QUEUE_REQUEST_FOCUS), honoured only for tabs this queue opened.
   * Only the tab is activated inside its Chrome window — the window is never
   * raised, un-minimised or given OS focus. One Paylocity tab holds the front
   * at a time, and when it finishes the user is put back on the tab they
   * were on, unless they had already moved away themselves.
   * ────────────────────────────────────────────────────────────────── */
  const PAYLOCITY_RE = /(^|\.)paylocity\.com$/i;
  const FOCUS_COOLDOWN_MS = 15000;   // never re-take the front more often than this
  const FOCUS_MAX_PER_JOB = 4;       // then stop fighting the user for that job
  let _focusedJobTab = null;         // job tab currently holding the front
  let _focusReturn = null;           // { tabId, windowId } the user was on before
  let _pendingRestore = false;
  const _focusLog = new Map();       // tabId -> { last, count }

  function isPaylocityUrl(u) {
    try { return PAYLOCITY_RE.test(new URL(u).hostname); } catch (_) { return false; }
  }
  function isOurJobTab(tabId) {
    for (const [, tid] of _tabMap) if (tid === tabId) return true;
    return false;
  }
  function tabGet(tabId) {
    return new Promise(res => {
      try { chrome.tabs.get(tabId, t => res(chrome.runtime.lastError ? null : t)); }
      catch (_) { res(null); }
    });
  }
  function activeTabIn(windowId) {
    return new Promise(res => {
      try { chrome.tabs.query({ active: true, windowId }, ts => res((ts && ts[0]) || null)); }
      catch (_) { res(null); }
    });
  }

  async function focusJobTab(tabId, reason) {
    if (tabId == null || tabId === -1 || !isOurJobTab(tabId)) return false;
    /* One at a time: while another open job tab holds the front, this one
       waits its turn (Paylocity is paused anyway until it is visible). */
    if (_focusedJobTab != null && _focusedJobTab !== tabId && isOurJobTab(_focusedJobTab)) return false;
    const now = Date.now();
    const rec = _focusLog.get(tabId) || { last: 0, count: 0 };
    if (now - rec.last < FOCUS_COOLDOWN_MS || rec.count >= FOCUS_MAX_PER_JOB) return false;
    const t = await tabGet(tabId);
    if (!t) return false;
    if (t.active) { _focusedJobTab = tabId; return true; }   // already in front
    /* Remember where the user was — unless that is one of our job tabs, or
       an earlier Paylocity job already recorded the real starting point. */
    if (!_focusReturn) {
      const cur = await activeTabIn(t.windowId);
      if (cur && cur.id !== tabId && !isOurJobTab(cur.id)) {
        _focusReturn = { tabId: cur.id, windowId: cur.windowId };
      }
    }
    rec.last = now; rec.count++;
    _focusLog.set(tabId, rec);
    _focusedJobTab = tabId;
    try { chrome.tabs.update(tabId, { active: true }, () => void chrome.runtime.lastError); } catch (_) {}
    dbg('focused job tab', { tabId, reason, attempt: rec.count });
    return true;
  }

  /* Hand the front back once no Paylocity job needs it. */
  async function maybeRestoreFocus() {
    if (!_pendingRestore) return;
    if (_focusedJobTab != null && isOurJobTab(_focusedJobTab)) return;   // the next job took over
    _pendingRestore = false;
    const back = _focusReturn;
    _focusReturn = null;
    if (!back || !(await tabGet(back.tabId))) return;
    try { chrome.tabs.update(back.tabId, { active: true }, () => void chrome.runtime.lastError); } catch (_) {}
  }

  /* Close the tab we opened for a finished job. */
  async function closeJobTab(jobId) {
    const tabId = _tabMap.get(jobId);
    if (tabId == null) return;
    _tabMap.delete(jobId);
    _focusLog.delete(tabId);
    if (tabId === -1) return;   // reservation only — no real tab yet
    if (tabId === _focusedJobTab) {
      /* Only return the user to their tab if they were still looking at the
         job; if they had moved away on their own, leave them there. */
      const t = await tabGet(tabId);
      _pendingRestore = !!(t && t.active);
      if (!_pendingRestore) _focusReturn = null;
      _focusedJobTab = null;
    }
    try { chrome.tabs.remove(tabId, () => void chrome.runtime.lastError); } catch (_) {}
  }

  /* Consume an advance request from a content script: the job already
     wrote its terminal status; we close its tab and open the next. */
  async function handleAdvanceReq(req) {
    if (!req || !req.ts || req.ts === _lastAdvanceTs) return;
    _lastAdvanceTs = req.ts;
    dbg('advance request', { jobId: req.jobId, status: req.status });
    await closeJobTab(req.jobId);
    /* Clear the request so the content-script self-navigate fallback
       knows the manager handled it. */
    await new Promise(res => ST.set({ [KEY_ADVANCE_REQ]: null }, res));
    /* Any pending left? open more; else finish. */
    if (queue.some(j => j.status === 'pending')) await fillSlots();
    /* fillSlots() can retire the last pending jobs (attempts cap / invalid
       URL) without opening anything. Finish in that case too — otherwise the
       run never ends and stays "active" with nothing left to do. */
    if (!queue.some(j => j.status === 'pending') && runningWithTab() === 0) await finishQueue();
    /* If the finished job held the front and the next one does not need
       it, put the user back where they were. */
    await maybeRestoreFocus();
  }

  async function finishQueue() {
    await new Promise(res => ST.set({
      [KEY_ACTIVE]: false, [KEY_CURRENT]: null, [KEY_ADVANCE_REQ]: null,
    }, res));
    setRunnerIndicator(false);
    render();
    toast('Queue complete', 'success');
  }

  async function startQueue() {
    if (!queue.some(j => j.status === 'pending' || j.status === 'running')) {
      toast('No pending jobs in queue', 'error');
      dbg('startQueue rejected — no pending/running jobs', { queueLen: queue.length }, 'warn');
      return;
    }
    /* Reset leftover 'running' from a prior interrupted run — we lost
       those tabs, so re-queue them cleanly. */
    for (const j of queue) if (j.status === 'running') j.status = 'pending';
    _tabMap.clear();
    /* The tab the user pressed Start in becomes the orchestration owner,
       taking over from any stale owner. */
    if (_myTabId == null) _myTabId = await getMyTabId();
    if (_myTabId != null) await new Promise(r => ST.set({ [KEY_OWNER]: _myTabId }, r));
    await saveQueue();
    await new Promise(res => ST.set({
      [KEY_ACTIVE]: true, [KEY_CURRENT]: null, [KEY_ADVANCE_REQ]: null,
      [KEY_STARTTS]: Date.now(),
      /* MUTUAL EXCLUSION: stand down OptimHire's native auto-apply while
         the CSV queue runs. Running both made the native flow reload the
         queue's job tab in a loop and blocked the queue's autofill. */
      ohAutoApplyEngaged: false,
    }, res));
    setRunnerIndicator(true);
    const conc = getConcurrency();
    toast(`Queue started — opening up to ${conc} job${conc > 1 ? 's' : ''} in separate tabs`, 'success');
    dbg('startQueue', { concurrency: conc, total: queue.length, pending: queue.filter(j => j.status === 'pending').length });
    await fillSlots();
  }

  async function stopQueue() {
    const openTabs = _tabMap.size;
    let wasFront = false;
    if (_focusedJobTab != null) {
      const ft = await tabGet(_focusedJobTab);
      wasFront = !!(ft && ft.active);
    }
    await new Promise(res => ST.set({
      [KEY_ACTIVE]: false, [KEY_CURRENT]: null, [KEY_ADVANCE_REQ]: null,
    }, res));
    /* Close every tab we opened and demote running jobs. */
    for (const [, tabId] of _tabMap) {
      if (tabId === -1) continue;   // reservation only — no real tab
      try { chrome.tabs.remove(tabId, () => void chrome.runtime.lastError); } catch (_) {}
    }
    _tabMap.clear();
    _focusLog.clear();
    _focusedJobTab = null;
    _pendingRestore = wasFront;
    if (!wasFront) _focusReturn = null;
    await maybeRestoreFocus();
    for (const j of queue) if (j.status === 'running') j.status = 'pending';
    await saveQueue();
    render();
    setRunnerIndicator(false);
    toast('Queue stopped — job tabs closed', 'info');
    dbg('stopQueue', { closedTabs: openTabs });
  }

  /* If the user manually closes a job tab, re-queue that job and
     keep the slots full. */
  function wireTabClose() {
    try {
      chrome.tabs.onRemoved.addListener(async (tabId) => {
        let jobId = null;
        for (const [jid, tid] of _tabMap) if (tid === tabId) { jobId = jid; break; }
        if (jobId == null) return;
        _tabMap.delete(jobId);
        _focusLog.delete(tabId);
        if (tabId === _focusedJobTab) {   // user closed it — they chose; don't restore
          _focusedJobTab = null;
          _focusReturn = null;
          _pendingRestore = false;
        }
        const d = await new Promise(r => ST.get([KEY_ACTIVE], r));
        if (!d[KEY_ACTIVE]) return; // queue stopped; ignore
        const j = queue.find(x => x.id === jobId);
        /* Only re-queue if it didn't already finish (applied/failed/skipped) */
        if (j && j.status === 'running') { j.status = 'pending'; await saveQueue(); }
        await fillSlots();
        if (!queue.some(x => x.status === 'pending') && runningWithTab() === 0) await finishQueue();
      });
    } catch (_) {}
  }
  /* A queue job that REDIRECTED to Paylocity asks to be brought forward.
     Honoured only for tabs this queue opened, and only by the orchestrating
     manager instance, so no other page can use it to steal focus. */
  function wireFocusRequests() {
    try {
      chrome.runtime.onMessage.addListener((msg, sender) => {
        if (!msg || msg.type !== 'OH_QUEUE_REQUEST_FOCUS') return;
        const tabId = sender && sender.tab && sender.tab.id;
        if (tabId == null || !isOurJobTab(tabId)) return;
        (async () => {
          if (!(await claimOwnership())) return;
          await focusJobTab(tabId, msg.reason || 'content-request');
        })();
      });
    } catch (_) {}
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
      r.onload = () => importCsv(r.result);
      r.readAsText(f);
      e.target.value = ''; // allow re-import same file
    });
    on('btnStart', 'click', startQueue);
    on('btnStop',  'click', stopQueue);
    on('btnDebug', 'click', () => {
      try { chrome.tabs.create({ url: chrome.runtime.getURL('tabs/debug.html'), active: true }); }
      catch (_) {}
    });
    on('btnRetryFailed', 'click', async () => {
      let n = 0;
      for (const j of queue) if (j.status === 'failed') { j.status = 'pending'; j.lastError = ''; n++; }
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
      queue = []; selectedIds.clear();
      await saveQueue(); render();
      toast('Queue cleared', 'info');
    });

    on('searchInput',  'input',  (e) => { view.search = e.target.value; render(); });
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
      const a = e.target.dataset.action; const id = e.target.dataset.id;
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

    /* Watch storage so the running indicator + statuses stay live AND
       the orchestrator advances when a content script reports done. */
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes[KEY_QUEUE]) { queue = changes[KEY_QUEUE].newValue || []; render(); }
      if (changes[KEY_ACTIVE]) {
        const on = !!changes[KEY_ACTIVE].newValue;
        setRunnerIndicator(on);
        /* Stopped from elsewhere (e.g. the sidepanel's Automation OFF switch):
           close the job tabs this manager opened and return their jobs to
           pending, exactly like pressing Stop here. stopQueue() also clears
           this key, so only act while tabs are still open (no loop). */
        if (!on && _tabMap.size) stopQueue().catch(() => {});
      }
      if (changes[KEY_ADVANCE_REQ] && changes[KEY_ADVANCE_REQ].newValue) {
        handleAdvanceReq(changes[KEY_ADVANCE_REQ].newValue);
      }
    });

    wireTabClose();
    wireFocusRequests();
  }

  load()
    .then(d => {
      /* Restore concurrency choice */
      const sel = document.getElementById('concurrencySelect');
      if (sel && d[KEY_CONCURRENCY]) sel.value = String(d[KEY_CONCURRENCY]);
      setRunnerIndicator(!!d[KEY_ACTIVE]);
      init();
      render();
      /* If a run was active when this manager page (re)loaded, we lost
         our in-memory tab map. Re-queue any 'running' jobs and refill
         slots so the run continues cleanly. */
      if (d[KEY_ACTIVE]) {
        let changed = false;
        for (const j of queue) if (j.status === 'running') { j.status = 'pending'; changed = true; }
        (changed ? saveQueue() : Promise.resolve()).then(() => fillSlots());
      }
    })
    .catch(err => {
      console.error('[jobQueue] load failed:', err);
      init(); render();
    });
})();
