/**
 * workdayLogin.js — "Workday sign-in" in the Queue Manager.
 *
 * Shows and edits the e-mail + password the automation uses to sign in to,
 * or create, the account on each company's Workday site
 * (chrome.storage.local.ohWorkdayLogin = { email, password, sites }), and
 * which sites have an account / want their e-mail link clicked first. The
 * sign-in itself is done by assets/optimhire-patch.js.
 */
(function () {
  'use strict';
  if (window.top !== window.self) return;
  var KEY = 'ohWorkdayLogin';
  var ST = chrome.storage.local;
  var login = null;

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
    setTimeout(function () { el.remove(); }, 3000);
  }
  /* Same recipe as the content script: ≥ 8 chars, upper, lower, digit, symbol. */
  function makePassword() {
    var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    var r = crypto.getRandomValues(new Uint32Array(12));
    return 'Oh' + Array.prototype.map.call(r, function (n) { return abc[n % abc.length]; }).join('') + '!7q';
  }
  function strong(pw) {
    return pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw);
  }
  var STATE_TEXT = {
    'account': 'account ready',
    'verify': 'wants its e-mail link clicked first — skipped',
    'other-password': 'has an account with another password — skipped',
  };

  function renderSites() {
    var box = $('wdSites');
    if (!box) return;
    var sites = (login && login.sites) || {};
    var hosts = Object.keys(sites).sort(function (a, b) { return (sites[b].ts || 0) - (sites[a].ts || 0); });
    if (!hosts.length) { box.innerHTML = '<div class="qa-empty">No Workday site visited yet.</div>'; return; }
    box.innerHTML = '<table><thead><tr><th>Workday site</th><th>State</th><th></th></tr></thead><tbody>' +
      hosts.map(function (h) {
        return '<tr><td>' + esc(h) + '</td><td>' + esc(STATE_TEXT[sites[h].state] || sites[h].state) + '</td>' +
          '<td><button class="btn-small" data-wd-forget="' + esc(h) + '" title="Try this site again from scratch">Retry</button></td></tr>';
      }).join('') + '</tbody></table>';
  }

  function load(cb) {
    ST.get([KEY, 'appAccountEmail', 'appAccountPassword'], function (d) {
      login = Object.assign({ sites: {} }, (d && d[KEY]) || {});
      if (!login.password) {
        login.password = (d && d.appAccountPassword) || makePassword();
        var o = {}; o[KEY] = login; ST.set(o);
      }
      if (!login.email && d && d.appAccountEmail) login.email = d.appAccountEmail;
      if (cb) cb();
    });
  }
  function open() {
    load(function () {
      $('wdEmail').value = login.email || '';
      $('wdPassword').value = login.password || '';
      renderSites();
      $('wdModal').classList.remove('hidden');
    });
  }
  function close() { $('wdModal').classList.add('hidden'); }
  function save() {
    var pw = $('wdPassword').value.trim();
    if (!strong(pw)) { toast('Password needs 8+ characters with upper, lower, a number and a symbol', 'error'); return; }
    login.email = $('wdEmail').value.trim();
    login.password = pw;
    var o = {}; o[KEY] = login;
    ST.set(o, function () { toast('Workday sign-in saved', 'success'); close(); });
  }
  function forget(host) {
    if (!login || !login.sites) return;
    delete login.sites[host];
    var o = {}; o[KEY] = login;
    ST.set(o, renderSites);
  }

  function wire() {
    var btn = $('btnWdLogin');
    if (!btn) return;
    btn.addEventListener('click', open);
    $('wdClose').addEventListener('click', close);
    $('wdSave').addEventListener('click', save);
    $('wdCopy').addEventListener('click', function () {
      var v = $('wdPassword').value;
      try { navigator.clipboard.writeText(v).then(function () { toast('Password copied', 'success'); }); } catch (_) {}
    });
    var modal = $('wdModal');
    modal.addEventListener('click', function (e) {
      if (e.target === modal) { close(); return; }
      var f = e.target && e.target.closest && e.target.closest('[data-wd-forget]');
      if (f) forget(f.getAttribute('data-wd-forget'));
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.classList.contains('hidden')) close(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
