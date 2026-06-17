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
    const cols = ['url', 'title', 'company', 'ats', 'status', 'notes', 'attempts', 'addedAt', 'appliedAt'];
    const esc = (s) => {
      const v = String(s == null ? '' : s);
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
  function saveQueue() {
    return new Promise(res => { ST.set({ [KEY_QUEUE]: queue }, res); });
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
  function addJob(url, title, company, notes) {
    url = (url || '').trim();
    if (!url) return null;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
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
    for (const j of queue) c[j.status] = (c[j.status] || 0) + 1;
    const el = document.getElementById('stats');
    el.innerHTML = '' +
      `<div class="stat"><b>${c.all}</b>Total</div>` +
      `<div class="stat s-pending"><b>${c.pending}</b>Pending</div>` +
      `<div class="stat s-running"><b>${c.running}</b>Running</div>` +
      `<div class="stat s-applied"><b>${c.applied}</b>Applied</div>` +
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
        <td><span class="badge b-${j.status}">${j.status}</span></td>
        <td class="url-col"><a href="${esc(j.url)}" target="_blank" rel="noopener" title="${esc(j.url)}">${esc(truncate(j.url, 60))}</a></td>
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

  /* Open up to `concurrency` pending jobs, each in its own tab. */
  async function fillSlots() {
    if (_orchestrating) return; _orchestrating = true;
    try {
      const conc = getConcurrency();
      let opened = false;
      while (runningWithTab() < conc) {
        const next = queue.find(j => j.status === 'pending');
        if (!next) break;
        next.status = 'running';
        next.attempts = (next.attempts || 0) + 1;
        next.lastActionTs = Date.now();
        await saveQueue();
        /* Open in a NEW tab. active:false keeps focus on the manager
           so a big run doesn't hijack the user's screen; the content
           script still fills background tabs fine. */
        const tab = await new Promise(res => {
          try { chrome.tabs.create({ url: next.url, active: false }, res); }
          catch (_) { res(null); }
        });
        if (tab && tab.id != null) _tabMap.set(next.id, tab.id);
        opened = true;
      }
      if (opened) render();
    } catch (_) {} finally { _orchestrating = false; }
  }

  /* Close the tab we opened for a finished job. */
  function closeJobTab(jobId) {
    const tabId = _tabMap.get(jobId);
    if (tabId == null) return;
    _tabMap.delete(jobId);
    try { chrome.tabs.remove(tabId, () => void chrome.runtime.lastError); } catch (_) {}
  }

  /* Consume an advance request from a content script: the job already
     wrote its terminal status; we close its tab and open the next. */
  async function handleAdvanceReq(req) {
    if (!req || !req.ts || req.ts === _lastAdvanceTs) return;
    _lastAdvanceTs = req.ts;
    dbg('advance request', { jobId: req.jobId, status: req.status });
    closeJobTab(req.jobId);
    /* Clear the request so the content-script self-navigate fallback
       knows the manager handled it. */
    await new Promise(res => ST.set({ [KEY_ADVANCE_REQ]: null }, res));
    /* Any pending left? open more; else finish. */
    if (queue.some(j => j.status === 'pending')) {
      await fillSlots();
    } else if (runningWithTab() === 0) {
      await finishQueue();
    }
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
    await saveQueue();
    await new Promise(res => ST.set({
      [KEY_ACTIVE]: true, [KEY_CURRENT]: null, [KEY_ADVANCE_REQ]: null,
      [KEY_STARTTS]: Date.now(),
    }, res));
    setRunnerIndicator(true);
    const conc = getConcurrency();
    toast(`Queue started — opening up to ${conc} job${conc > 1 ? 's' : ''} in separate tabs`, 'success');
    dbg('startQueue', { concurrency: conc, total: queue.length, pending: queue.filter(j => j.status === 'pending').length });
    await fillSlots();
  }

  async function stopQueue() {
    const openTabs = _tabMap.size;
    await new Promise(res => ST.set({
      [KEY_ACTIVE]: false, [KEY_CURRENT]: null, [KEY_ADVANCE_REQ]: null,
    }, res));
    /* Close every tab we opened and demote running jobs. */
    for (const [, tabId] of _tabMap) {
      try { chrome.tabs.remove(tabId, () => void chrome.runtime.lastError); } catch (_) {}
    }
    _tabMap.clear();
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
        const d = await new Promise(r => ST.get([KEY_ACTIVE], r));
        if (!d[KEY_ACTIVE]) return; // queue stopped; ignore
        const j = queue.find(x => x.id === jobId);
        /* Only re-queue if it didn't already finish (applied/failed/skipped) */
        if (j && j.status === 'running') { j.status = 'pending'; await saveQueue(); }
        await fillSlots();
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
        editJob(editingId, updates);
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
        if (j) chrome.tabs.create({ url: j.url, active: true });
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
      if (changes[KEY_ACTIVE]) setRunnerIndicator(!!changes[KEY_ACTIVE].newValue);
      if (changes[KEY_ADVANCE_REQ] && changes[KEY_ADVANCE_REQ].newValue) {
        handleAdvanceReq(changes[KEY_ADVANCE_REQ].newValue);
      }
    });

    wireTabClose();
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
