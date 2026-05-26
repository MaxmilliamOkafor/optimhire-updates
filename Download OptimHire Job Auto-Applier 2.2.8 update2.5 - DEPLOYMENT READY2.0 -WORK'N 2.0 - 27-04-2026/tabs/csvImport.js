/* ─────────────────────────────────────────────────────────
 * OptimHire Auto-Apply Mode v2.2.8
 * CSP-safe external script for tabs/csvImport.html
 * Background service worker handles tab opening + copilotTabId.
 * ───────────────────────────────────────────────────────── */
'use strict';

const KEY_QUEUE   = 'csvJobQueue';
const KEY_APPLIED = 'appliedJobs';
const PAGE_SIZE   = 100; // show 100 per page — no arbitrary import limit

let queue    = [];
let filtered = [];
let page     = 1;
let isRunning = false;
let isPaused  = false;
let sessionApplied = 0;
let currentJobId   = null;

const $el = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── Toast ── */
function toast(msg, dur = 3000) {
  const el = $el('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), dur);
}

/* ── Platform registry ── */
const PLATFORM_REGISTRY = [
  ['myworkdayjobs',   'Workday',         true,  false],
  ['workday.com',     'Workday',         true,  false],
  ['greenhouse.io',   'Greenhouse',      true,  false],
  ['lever.co',        'Lever',           true,  false],
  ['smartrecruiters', 'SmartRecruiters', true,  false],
  ['workable.com',    'Workable',        true,  false],
  ['oraclecloud.com', 'OracleCloud',     true,  false],
  ['taleo.net',       'Taleo',           true,  false],
  ['icims.com',       'iCIMS',           true,  false],
  ['bamboohr.com',    'BambooHR',        true,  false],
  ['ashbyhq.com',     'Ashby',           true,  false],
  ['breezy.hr',       'BreezyHR',        true,  false],
  ['jobvite.com',     'Jobvite',         true,  false],
  ['hiring.cafe',     'HiringCafe',      true,  false],
  ['teamtailor.com',  'Teamtailor',      true,  false],
  ['paylocity.com',   'Paylocity',       false, false],
  ['jazzhr.com',      'JazzHR',          false, false],
  ['ziprecruiter.com','ZipRecruiter',    false, false],
  ['manatal.com',     'Manatal',         false, false],
  ['bullhorn.com',    'Bullhorn',        false, false],
  ['dice.com',        'Dice',            false, false],
  ['ultipro.com',     'UKG/UltiPro',     false, false],
  ['kronos.net',      'UKG Kronos',      false, false],
  ['indeed.com',      'Indeed',          true,  false],
  ['linkedin.com',    'LinkedIn',        true,  false],
];

const TRACKING_PARAMS = [
  'utm_source','utm_medium','utm_campaign','utm_term','utm_content',
  'ref','referer','source','fbclid','gclid','gh_src','rl_source',
  'trk','trkInfo','mc_cid','mc_eid','_hsenc','_hsmi',
];

function platform(url) {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    const match = PLATFORM_REGISTRY.find(([sub]) => h.includes(sub));
    return match ? match[1] : 'Company Site';
  } catch { return 'Unknown'; }
}

function normalize(url) {
  try {
    const u = new URL(url.trim());
    TRACKING_PARAMS.forEach(p => u.searchParams.delete(p));
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return (u.origin + path).toLowerCase();
  } catch { return url.trim().toLowerCase(); }
}

/* ── URL validator ── */
function validateUrl(raw) {
  const s = (raw || '').replace(/^["'\s]+|["'\s]+$/g, '');
  if (!s) return { valid: false, reason: 'Empty row' };
  if (!/^https?:\/\//i.test(s)) return { valid: false, reason: 'Not http/https: ' + s.slice(0, 60) };
  try { new URL(s); } catch { return { valid: false, reason: 'Malformed URL: ' + s.slice(0, 60) }; }
  return { valid: true, url: s };
}

/* ── Storage helpers ── */
function loadQueue() {
  return new Promise(res => chrome.storage.local.get(KEY_QUEUE, d => { queue = d[KEY_QUEUE] || []; res(); }));
}
function saveQueue() { chrome.storage.local.set({ [KEY_QUEUE]: queue }); }
function loadApplied() { return new Promise(res => chrome.storage.local.get(KEY_APPLIED, d => res(d[KEY_APPLIED] || []))); }

/* ── Parse raw text into candidate rows ── */
function parseRawRows(text) {
  const rows = [];
  text.split(/\r?\n/).forEach(line => {
    /* Handle quoted CSV properly */
    const parts = line.split(',');
    let inQuote = false, cell = '';
    for (const part of parts) {
      if (!inQuote && part.startsWith('"')) {
        inQuote = true;
        cell = part.slice(1);
      } else if (inQuote && part.endsWith('"')) {
        cell += ',' + part.slice(0, -1);
        rows.push(cell.trim());
        inQuote = false;
        cell = '';
      } else if (inQuote) {
        cell += ',' + part;
      } else {
        const s = part.replace(/^["'\s]+|["'\s]+$/g, '').trim();
        if (s) rows.push(s);
      }
    }
    if (inQuote && cell) rows.push(cell.trim());
  });
  return rows.filter(r => r.length > 0);
}

/* ── Parse text/CSV: returns { valid:[], invalid:[], totalRows } ── */
function parseUrls(text) {
  const rows = parseRawRows(text);
  const valid = [], invalid = [];
  const seen = new Set();
  for (const row of rows) {
    if (!row) continue;
    /* Skip header rows */
    if (/^url\b|^link\b|^job.?url\b|^application.?url\b/i.test(row.trim())) continue;
    const v = validateUrl(row);
    if (!v.valid) { invalid.push({ raw: row, reason: v.reason }); continue; }
    const norm = normalize(v.url);
    if (seen.has(norm)) continue;
    seen.add(norm);
    valid.push(v.url);
  }
  return { valid, invalid, totalRows: rows.filter(r => r).length };
}

/* ── Add URLs to queue — NO hard limit ── */
async function addUrls(parsed, source = 'paste') {
  const { valid, invalid, totalRows } = parsed;
  const applied = await loadApplied();
  const appliedSet = new Set(applied.map(normalize));
  const existing = new Set(queue.map(j => normalize(j.url)));
  let added = 0, dupes = 0, alreadyApplied = 0;

  for (const url of valid) {
    const norm = normalize(url);
    if (existing.has(norm)) { dupes++; continue; }
    existing.add(norm);
    const wasApplied = appliedSet.has(norm);
    if (wasApplied) alreadyApplied++;
    queue.push({
      id:         crypto.randomUUID(),
      url,
      platform:   platform(url),
      source,
      addedAt:    Date.now(),
      status:     wasApplied ? 'duplicate' : 'pending',
      attempts:   0,
      lastError:  '',
      startedAt:  null,
      finishedAt: null,
      note:       '',
    });
    added++;
  }
  saveQueue();
  render();
  showParseSummary(totalRows, added, dupes + alreadyApplied, invalid);
}

/* ── Render table ── */
const STATUS_CLASS = {
  pending: 'st-pending', running: 'st-running', done: 'st-done',
  failed: 'st-failed', skipped: 'st-skipped', duplicate: 'st-duplicate',
};
const STATUS_LABEL = {
  pending: 'Pending', running: 'Running', done: 'Applied',
  failed: 'Failed', skipped: 'Skipped', duplicate: 'Duplicate',
};

function escHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function render() {
  const q = ($el('searchInput').value || '').toLowerCase();
  const st = $el('filterStatus').value;
  filtered = queue.filter(j => {
    if (st && j.status !== st) return false;
    if (q && !j.url.toLowerCase().includes(q)) return false;
    return true;
  });

  /* Stats */
  const counts = { pending: 0, running: 0, done: 0, failed: 0, skipped: 0, duplicate: 0 };
  queue.forEach(j => { if (counts[j.status] !== undefined) counts[j.status]++; });
  $el('badgeTotal').textContent   = `${queue.length} total`;
  $el('badgePending').textContent = `${counts.pending} pending`;
  $el('badgeDone').textContent    = `${counts.done} applied`;
  $el('badgeFailed').textContent  = `${counts.failed} failed`;
  $el('badgeFailed').style.display = counts.failed ? 'inline-flex' : 'none';

  $el('statTotal').textContent   = queue.length;
  $el('statPending').textContent = counts.pending;
  $el('statDone').textContent    = counts.done;
  $el('statFailed').textContent  = counts.failed;
  $el('statDupe').textContent    = counts.duplicate;

  const done = counts.done + counts.failed + counts.skipped + counts.duplicate;
  const pct  = queue.length ? Math.round(done / queue.length * 100) : 0;
  $el('progressFill').style.width = pct + '%';

  $el('selectPendingLabel').textContent = `Select Pending (${counts.pending})`;
  $el('btnStartLabel').textContent = isRunning ? 'Running...' : `Start Auto-Apply (${counts.pending})`;

  /* Paginate */
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (page > totalPages) page = totalPages;
  const start = (page - 1) * PAGE_SIZE;
  const slice = filtered.slice(start, start + PAGE_SIZE);

  const tbody = $el('tableBody');
  if (!slice.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty">
      <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <p>${queue.length ? 'No jobs match your filter.' : 'No jobs yet — paste URLs above or drag in a CSV file.'}</p>
    </div></td></tr>`;
  } else {
    tbody.innerHTML = slice.map((j, i) => {
      const short    = j.url.length > 65 ? j.url.slice(0, 62) + '…' : j.url;
      const isActive = j.id === currentJobId;
      return `<tr data-id="${j.id}" style="${isActive ? 'background:rgba(59,130,246,.08)' : ''}">
        <td><input type="checkbox" class="row-check" data-id="${j.id}"/></td>
        <td style="color:var(--muted)">${start + i + 1}</td>
        <td class="url-cell"><a href="${escHtml(j.url)}" target="_blank" title="${escHtml(j.url)}">${escHtml(short)}</a></td>
        <td><span class="badge badge-gray">${escHtml(j.platform)}</span></td>
        <td style="color:var(--muted);font-size:12px">${j.addedAt ? new Date(j.addedAt).toLocaleDateString() : ''}</td>
        <td${j.lastError ? ` class="st-has-err" data-err="${escHtml(j.lastError)}"` : ''}>
          <span class="st ${STATUS_CLASS[j.status] || 'st-pending'}">${STATUS_LABEL[j.status] || j.status}</span>
          ${j.attempts > 0 ? `<span class="attempts-badge">↻${j.attempts}</span>` : ''}
        </td>
        <td><div class="row-actions">
          <button class="btn-ghost" style="padding:4px 8px;font-size:11px" data-action="retry" data-id="${j.id}" title="Reset to pending">↻</button>
          <button class="btn-danger" style="padding:4px 8px;font-size:11px" data-action="open" data-id="${j.id}" title="Open URL">↗</button>
          <button class="btn-danger" style="padding:4px 8px;font-size:11px" data-action="delete" data-id="${j.id}" title="Remove">✕</button>
        </div></td>
      </tr>`;
    }).join('');
  }

  renderPages(totalPages);
}

function renderPages(total) {
  const el = $el('pagination');
  if (total <= 1) { el.innerHTML = ''; return; }
  let h = '';
  const s = Math.max(1, page - 3), e = Math.min(total, page + 3);
  if (s > 1) h += `<button class="btn-ghost" data-page="1">1</button>${s > 2 ? '<span style="color:var(--muted)">…</span>' : ''}`;
  for (let i = s; i <= e; i++) h += `<button class="${i === page ? 'btn-primary' : 'btn-ghost'}" data-page="${i}">${i}</button>`;
  if (e < total) h += `${e < total - 1 ? '<span style="color:var(--muted)">…</span>' : ''}<button class="btn-ghost" data-page="${total}">${total}</button>`;
  el.innerHTML = h;
}

/* ── Pagination event delegation ── */
$el('pagination').addEventListener('click', e => {
  const btn = e.target.closest('button[data-page]');
  if (btn) { page = +btn.dataset.page; render(); }
});

/* ── Row actions (event delegation — CSP-safe) ── */
$el('tableBody').addEventListener('click', e => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.action === 'retry') {
    const j = queue.find(q => q.id === id);
    if (j) { j.status = 'pending'; j.lastError = ''; j.attempts = 0; j.finishedAt = null; saveQueue(); render(); toast('↻ Reset to pending'); }
  } else if (btn.dataset.action === 'open') {
    const j = queue.find(q => q.id === id);
    if (j) chrome.tabs.create({ url: j.url });
  } else if (btn.dataset.action === 'delete') {
    queue = queue.filter(q => q.id !== id); saveQueue(); render(); toast('Job removed');
  }
});

/* ── Bulk select ── */
function getSelected() { return [...document.querySelectorAll('.row-check:checked')].map(el => el.dataset.id); }

$el('btnSelectPending').addEventListener('click', () => {
  document.querySelectorAll('.row-check').forEach(c => {
    const j = queue.find(q => q.id === c.dataset.id);
    c.checked = j && j.status === 'pending';
  });
});
$el('btnDeselectAll').addEventListener('click', () => {
  document.querySelectorAll('.row-check').forEach(c => c.checked = false);
  $el('masterCheck').checked = false;
});
$el('masterCheck').addEventListener('change', function () {
  document.querySelectorAll('.row-check').forEach(c => c.checked = this.checked);
});
$el('btnDeleteSelected').addEventListener('click', () => {
  const ids = new Set(getSelected());
  if (!ids.size) { toast('No jobs selected'); return; }
  if (!confirm(`Delete ${ids.size} selected job(s)?`)) return;
  queue = queue.filter(j => !ids.has(j.id)); saveQueue(); render();
  toast(`${ids.size} job(s) deleted`);
});
$el('btnClearAll').addEventListener('click', () => {
  if (!confirm('Clear the entire queue?')) return;
  queue = []; saveQueue(); render(); toast('Queue cleared');
});
$el('btnSortNewest').addEventListener('click', () => {
  queue.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)); saveQueue(); render(); toast('Sorted newest first');
});
$el('btnResetFailed').addEventListener('click', () => {
  let count = 0;
  queue.forEach(j => {
    if (j.status === 'failed' || j.status === 'skipped') {
      j.status = 'pending'; j.lastError = ''; j.finishedAt = null; count++;
    }
  });
  saveQueue(); render(); toast(`Reset ${count} failed/skipped job(s) to pending`);
});

/* ═══════════════════════════════════════════════════
 * AUTOMATION — Background-Driven Queue
 * ═══════════════════════════════════════════════════ */

function setRunningUI(running, paused = false) {
  isRunning = running;
  isPaused  = paused;
  $el('autoApplyPanel').classList.toggle('active', running);
  $el('btnStart').style.display = running ? 'none' : 'flex';
  $el('btnPause').style.display = running ? 'flex' : 'none';
  $el('btnPause').textContent   = paused ? 'Resume' : 'Pause';
  $el('btnStartLabel').textContent = `Start Auto-Apply (${queue.filter(j => j.status === 'pending').length})`;
}

function updateAutoApplyPanel(jobId, statusText, statusClass) {
  const job = queue.find(j => j.id === jobId);
  currentJobId = jobId;
  if (job) {
    $el('aapJobUrl').textContent = job.url;
    $el('aapJobUrl').title       = job.url;
    $el('aapJobPlatform').textContent = 'Platform: ' + job.platform;
  }
  const st = $el('aapStatus');
  st.textContent = statusText;
  st.className   = 'aap-status ' + (statusClass || 'running');

  const counts = { done: 0, failed: 0, skipped: 0, duplicate: 0 };
  queue.forEach(j => { if (j.status in counts) counts[j.status]++; });
  const done = counts.done + counts.failed + counts.skipped + counts.duplicate;
  const pct  = queue.length ? Math.round(done / queue.length * 100) : 0;
  $el('aapProgressFill').style.width = pct + '%';
  $el('aapCounter').textContent = `${sessionApplied} applied this session · ${done} of ${queue.length} processed`;
}

/* ── Start button ── */
$el('btnStart').addEventListener('click', async () => {
  if (isRunning) { toast('Already running'); return; }
  const pending = queue.filter(j => j.status === 'pending');
  if (!pending.length) { toast('No pending jobs in queue'); return; }
  sessionApplied = 0;
  setRunningUI(true, false);
  toast(`Starting Auto-Apply for ${pending.length} job(s)...`);
  try {
    chrome.runtime.sendMessage({ type: 'START_CSV_QUEUE', settings: _settings }, resp => {
      if (chrome.runtime.lastError) console.warn('SW inactive:', chrome.runtime.lastError.message);
    });
  } catch (e) { console.warn('sendMessage failed:', e); }
});

/* ── Pause button ── */
$el('btnPause').addEventListener('click', () => {
  if (!isRunning) return;
  if (isPaused) {
    isPaused = false;
    $el('btnPause').textContent = 'Pause';
    chrome.runtime.sendMessage({ type: 'RESUME_CSV_QUEUE' }).catch(() => {});
    toast('Resumed');
  } else {
    isPaused = true;
    $el('btnPause').textContent = 'Resume';
    chrome.runtime.sendMessage({ type: 'PAUSE_CSV_QUEUE' }).catch(() => {});
    toast('Paused — will stop after current job');
  }
});

/* ── Skip button ── */
$el('btnSkip').addEventListener('click', () => {
  if (!isRunning) { toast('Not running'); return; }
  chrome.runtime.sendMessage({ type: 'SKIP_CSV_JOB' }).catch(() => {});
  toast('Skipping current job...');
});

/* ── Stop button ── */
$el('btnStop').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'STOP_CSV_QUEUE' }).catch(() => {});
  setRunningUI(false);
  currentJobId = null;
  $el('aapJobUrl').textContent      = '—';
  $el('aapJobPlatform').textContent = '';
  $el('aapStatus').textContent      = 'Stopped.';
  toast('Automation stopped');
  render();
});

/* ── Message listener — receive updates from background ── */
chrome.runtime.onMessage.addListener(msg => {
  if (!msg || !msg.type) return;

  if (msg.type === 'CSV_JOB_STARTED') {
    const job = queue.find(j => j.id === msg.jobId);
    if (job) { job.status = 'running'; job.startedAt = Date.now(); saveQueue(); }
    updateAutoApplyPanel(msg.jobId, 'Filling application form…', 'running');
    render();
  }

  if (msg.type === 'CSV_JOB_COMPLETE') {
    const job = queue.find(j => j.id === msg.jobId);
    if (job) {
      job.status     = msg.status === 'done' ? 'done' : msg.status === 'duplicate' ? 'duplicate' : msg.status === 'skipped' ? 'skipped' : 'failed';
      if (msg.status === 'done') { sessionApplied++; job.finishedAt = Date.now(); }
      if (msg.status === 'failed') { job.attempts = (job.attempts || 0) + 1; job.lastError = msg.reason || 'Unknown error'; job.finishedAt = Date.now(); }
      if (msg.status === 'skipped') job.lastError = msg.reason || '';
      const stText  = msg.status === 'done' ? 'Applied ✓' : msg.status === 'duplicate' ? 'Duplicate — skipped' : 'Failed ✗';
      const stClass = msg.status === 'done' ? 'success' : msg.status === 'duplicate' ? 'waiting' : 'failed';
      updateAutoApplyPanel(msg.jobId, stText, stClass);
      saveQueue();
    }
    render();
  }

  if (msg.type === 'CSV_QUEUE_DONE') {
    setRunningUI(false);
    currentJobId = null;
    $el('aapStatus').textContent  = 'All done!';
    $el('aapStatus').className    = 'aap-status success';
    toast(`Auto-Apply complete! ${sessionApplied} applied this session.`);
    loadQueue().then(render);
  }

  if (msg.type === 'CSV_QUEUE_PAUSED') {
    isPaused = true;
    $el('btnPause').textContent = 'Resume';
  }
});

/* ── Import — paste URLs ── */
$el('btnAdd').addEventListener('click', () => {
  const t = $el('urlInput').value.trim();
  if (!t) { toast('Paste at least one URL'); return; }
  addUrls(parseUrls(t), 'paste');
  $el('urlInput').value = '';
});
$el('urlInput').addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 'Enter') $el('btnAdd').click();
});

/* ── Import — file input change ── */
$el('csvFile').addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = ev => addUrls(parseUrls(ev.target.result), 'csv');
  r.readAsText(f);
  e.target.value = ''; // allow re-selecting same file
});

/* ── Import — drag & drop ── */
const dz = $el('dropZone');

dz.addEventListener('dragenter', e => { e.preventDefault(); dz.classList.add('dragover'); });
dz.addEventListener('dragover',  e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; dz.classList.add('dragover'); });
dz.addEventListener('dragleave', e => { if (!dz.contains(e.relatedTarget)) dz.classList.remove('dragover'); });
dz.addEventListener('drop', e => {
  e.preventDefault();
  dz.classList.remove('dragover');
  const f = e.dataTransfer.files[0];
  if (!f) return;
  if (!/\.(csv|txt)$/i.test(f.name) && f.type !== 'text/csv' && f.type !== 'text/plain') {
    toast('Please drop a .csv or .txt file'); return;
  }
  const r = new FileReader();
  r.onload = ev => addUrls(parseUrls(ev.target.result), 'csv');
  r.readAsText(f);
});

/* ── Browse button ── */
$el('browseBtn').addEventListener('click', () => {
  $el('csvFile').click();
});

/* Also allow clicking anywhere on the drop zone to browse */
dz.addEventListener('click', e => {
  if (e.target.id !== 'browseBtn') $el('csvFile').click();
});

/* ── Export ── */
function csvDownload(rows, name) {
  const text = rows.map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = name;
  a.click();
  toast('Downloaded: ' + name);
}

$el('btnExportQueue').addEventListener('click', () => {
  csvDownload([
    ['url', 'platform', 'source', 'status', 'attempts', 'lastError', 'addedAt', 'startedAt', 'finishedAt', 'note'],
    ...queue.map(j => [
      j.url, j.platform, j.source || 'paste', j.status,
      j.attempts || 0, j.lastError || '',
      j.addedAt   ? new Date(j.addedAt).toISOString()   : '',
      j.startedAt ? new Date(j.startedAt).toISOString() : '',
      j.finishedAt? new Date(j.finishedAt).toISOString(): '',
      j.note || '',
    ]),
  ], 'optimhire-queue.csv');
});

$el('btnExportApplied').addEventListener('click', () => {
  loadApplied().then(a => csvDownload([['url'], ...a.map(u => [u])], 'optimhire-applied.csv'));
});

/* ── Filter / search ── */
$el('searchInput').addEventListener('input', () => { page = 1; render(); });
$el('filterStatus').addEventListener('change', () => { page = 1; render(); });

/* ── Parse Summary Banner ── */
let _invalidRows = [];

function showParseSummary(totalRows, valid, dupes, invalid) {
  _invalidRows = invalid || [];
  $el('psRows').textContent    = totalRows;
  $el('psValid').textContent   = valid;
  $el('psDupes').textContent   = dupes;
  $el('psInvalid').textContent = _invalidRows.length;
  $el('parseSummary').classList.add('show');

  const inv = $el('invalidSection');
  if (_invalidRows.length) {
    $el('invCount').textContent = `${_invalidRows.length} row(s)`;
    inv.style.display = 'block';
    const body = $el('invBody');
    body.style.display = 'none';
    body.innerHTML = _invalidRows.map(r =>
      `<div class="inv-row">
         <span class="inv-url" title="${escHtml(r.raw)}">${escHtml(r.raw.slice(0, 70))}</span>
         <span class="inv-reason">${escHtml(r.reason)}</span>
       </div>`
    ).join('');
  } else {
    inv.style.display = 'none';
  }

  if (valid > 0) {
    toast(`✅ Added ${valid} job(s)${dupes ? ` · ${dupes} duplicate(s) skipped` : ''}${_invalidRows.length ? ` · ${_invalidRows.length} invalid` : ''}`);
  } else {
    toast(`No new jobs added${_invalidRows.length ? ` · ${_invalidRows.length} invalid rows` : ''}`);
  }
}

$el('psDismiss').addEventListener('click', () => $el('parseSummary').classList.remove('show'));
$el('invHeader').addEventListener('click', () => {
  const body = $el('invBody');
  body.style.display = body.style.display === 'none' ? 'block' : 'none';
});

/* ── Automation Settings ── */
const SETTINGS_KEY = 'csvQueueSettings';
let _settings = { delayMin: 2, delayMax: 7, concurrency: 1, autoSubmit: true, reuseTab: true, skipCaptcha: true };

function loadSettings() {
  return new Promise(res => chrome.storage.local.get(SETTINGS_KEY, d => {
    if (d[SETTINGS_KEY]) Object.assign(_settings, d[SETTINGS_KEY]);
    _settings.reuseTab = true; // Always force single-tab mode
    $el('settingDelayMin').value       = _settings.delayMin;
    $el('settingDelayMax').value       = _settings.delayMax;
    $el('settingConcurrency').value    = _settings.concurrency;
    $el('settingAutoSubmit').checked   = _settings.autoSubmit;
    $el('settingReuseTab').checked     = _settings.reuseTab;
    $el('settingSkipCaptcha').checked  = _settings.skipCaptcha;
    res();
  }));
}

function saveSettings() {
  _settings = {
    delayMin:    Math.max(1, +$el('settingDelayMin').value   || 2),
    delayMax:    Math.max(1, +$el('settingDelayMax').value   || 7),
    concurrency: Math.max(1, +$el('settingConcurrency').value || 1),
    autoSubmit:  $el('settingAutoSubmit').checked,
    reuseTab:    true,  // Always use single tab
    skipCaptcha: $el('settingSkipCaptcha').checked,
  };
  chrome.storage.local.set({ [SETTINGS_KEY]: _settings });
}

$el('settingsCardToggle').addEventListener('click', () => {
  const body = $el('settingsCardBody');
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  $el('settingsToggleArrow').textContent = open ? '\u25BC' : '\u25B2';
});

$el('btnSaveSettings').addEventListener('click', () => {
  saveSettings();
  const st = $el('settingsSaveStatus');
  st.style.display = 'inline';
  setTimeout(() => { st.style.display = 'none'; }, 2000);
  toast('✓ Automation settings saved');
  chrome.runtime.sendMessage({ type: 'UPDATE_QUEUE_SETTINGS', settings: _settings }).catch(() => {});
});

/* ── Applications Account Settings ── */
(function () {
  const toggle   = $el('accountCardToggle');
  const body     = $el('accountCardBody');
  const arrow    = $el('accountToggleArrow');
  const emailEl  = $el('appEmail');
  const pwEl     = $el('appPassword');
  const togglePw = $el('btnTogglePw');
  const saveBtn  = $el('btnSaveAccount');
  const clearBtn = $el('btnClearAccount');
  const status   = $el('accountSaveStatus');

  toggle.addEventListener('click', () => {
    const open = body.style.display !== 'none';
    body.style.display = open ? 'none' : 'block';
    arrow.textContent  = open ? '\u25BC' : '\u25B2';
  });

  togglePw.addEventListener('click', () => {
    pwEl.type = pwEl.type === 'password' ? 'text' : 'password';
    togglePw.textContent = pwEl.type === 'password' ? '👁' : '🙈';
  });

  chrome.storage.local.get(['appAccountEmail', 'appAccountPassword'], data => {
    if (data.appAccountEmail)    emailEl.value = data.appAccountEmail;
    if (data.appAccountPassword) pwEl.value    = data.appAccountPassword;
    if (data.appAccountEmail || data.appAccountPassword) {
      body.style.display = 'block';
      arrow.textContent  = '\u25B2';
    }
  });

  saveBtn.addEventListener('click', () => {
    const email = emailEl.value.trim();
    const pw    = pwEl.value;
    if (!email) { toast('Enter an account email'); return; }
    chrome.storage.local.set({ appAccountEmail: email, appAccountPassword: pw }, () => {
      status.style.display = 'inline';
      setTimeout(() => { status.style.display = 'none'; }, 2500);
      toast('✓ Applications account saved');
    });
  });

  clearBtn.addEventListener('click', () => {
    emailEl.value = '';
    pwEl.value    = '';
    chrome.storage.local.remove(['appAccountEmail', 'appAccountPassword'], () => {
      toast('Applications account cleared');
    });
  });
})();

/* ── Real-time storage listener ── */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[KEY_QUEUE]) {
    queue = changes[KEY_QUEUE].newValue || [];
    render();
  }
});

/* ── Init ── */
async function init() {
  await Promise.all([loadQueue(), loadSettings()]);
  chrome.storage.local.get(['csvQueueRunning', 'csvActiveJobId'], data => {
    if (data.csvQueueRunning) {
      setRunningUI(true, false);
      if (data.csvActiveJobId) {
        updateAutoApplyPanel(data.csvActiveJobId, 'Filling application form…', 'running');
      }
    }
  });
  render();
}
init();
