/**
 * workdayLogin.js — "Workday sign-in" in the Queue Manager.
 *
 * Shows and edits the e-mail + password the automation uses to sign in to,
 * or create, the account on each company's Workday site
 * (chrome.storage.local.ohWorkdayLogin = { email, password, sites }), and
 * which sites have an account / want their e-mail link clicked first. The
 * sign-in itself is done by the Workday engine (assets/wd-engine.js), or by
 * assets/optimhire-patch.js when the engine is off.
 *
 * Per site: an account made before with another password, or locked, is not
 * signed in to again (lockout-safe) until you give that site's password here
 * or press Retry; your other passwords (otherPasswords) are tried once each;
 * with emailed codes on, the password is reset from the emailed link
 * (resetByEmail, on unless switched off).
 *
 * Also: reading emailed verification codes from the signed-in Gmail
 * (ohGmailCodes, opt-in — oh-bg.js 10), the Workday engine's on/off switch (ohWdEngineOff) and the optional
 * full profile it uses (ohWorkdayProfile — work history, education, skills),
 * imported from the Workday extension's profile JSON.
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
    'account': 'Account ready',
    'verify': 'Wants its e-mail link clicked — skipped (turn on emailed codes to do it for you)',
    'other-password': 'Account made before with another password — not tried again until you give it here',
    'locked': 'Account locked — reset its password, then Retry',
  };

  function renderSites() {
    var box = $('wdSites');
    if (!box) return;
    var sites = (login && login.sites) || {};
    var hosts = Object.keys(sites).sort(function (a, b) { return (sites[b].ts || 0) - (sites[a].ts || 0); });
    if (!hosts.length) { box.innerHTML = '<div class="qa-empty">No Workday site visited yet.</div>'; return; }
    box.innerHTML = '<table><thead><tr><th>Workday site</th><th>State</th><th></th></tr></thead><tbody>' +
      hosts.map(function (h) {
        var st = sites[h].state, stuck = st === 'other-password' || st === 'locked';
        var own = sites[h].password && sites[h].password !== login.password ? ' <small>(its own password saved)</small>' : '';
        return '<tr><td>' + esc(h) + '</td><td>' + esc(STATE_TEXT[st] || st) + own +
          (stuck ? '<div class="qa-tools" style="margin:6px 0 0"><input type="text" autocomplete="off" spellcheck="false" placeholder="This site\'s password" data-wd-pw="' + esc(h) + '">' +
                   '<button class="btn-small" data-wd-pwsave="' + esc(h) + '">Save</button></div>' : '') +
          '</td><td><button class="btn-small" data-wd-forget="' + esc(h) + '" title="Try this site again from scratch">Retry</button></td></tr>';
      }).join('') + '</tbody></table>';
  }
  /* A site's own password: tried first on its next job. */
  function saveSitePassword(host) {
    var input = document.querySelector('[data-wd-pw="' + (window.CSS && CSS.escape ? CSS.escape(host) : host) + '"]');
    var pw = input ? input.value.trim() : '';
    if (pw.length < 6) { toast('Enter that site\'s password', 'error'); return; }
    var site = Object.assign({}, login.sites[host] || {});
    site.password = pw; site.state = 'other-password'; site.tried = []; site.triedAt = 0;
    login.sites[host] = site;
    var o = {}; o[KEY] = login;
    ST.set(o, function () { toast('Saved — its next job signs in with it', 'success'); renderSites(); });
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
  /* A Profile, or a storage export holding one ({"wd:profile": …} / {profile: …}). */
  function profileFrom(j) {
    var p = j && (j['wd:profile'] || j.profile || j);
    return p && typeof p === 'object' && (p.personal || Array.isArray(p.work)) ? p : null;
  }
  function renderEngine() {
    ST.get(['ohWdEngineOff', 'ohWorkdayProfile', 'ohGmailCodes', 'ohCvProfile'], function (d) {
      $('wdEngineOn').checked = !(d && d.ohWdEngineOff === true);
      $('gmailCodesOn').checked = !!(d && d.ohGmailCodes === true);
      var p = d && d.ohWorkdayProfile;
      var name = p && p.personal ? [p.personal.firstName, p.personal.lastName].filter(Boolean).join(' ') : '';
      $('wdProfileState').textContent = p
        ? 'Imported' + (name ? ': ' + name : '') + ' — ' + ((p.work || []).length) + ' role(s), ' +
          ((p.education || []).length) + ' education, ' + ((p.skills || []).length) + ' skill(s)'
        : (d && d.ohCvProfile && d.ohCvProfile.profile && d.ohCvProfile.profile.work && d.ohCvProfile.profile.work.length
          ? 'Not imported — read from your CV: ' + d.ohCvProfile.profile.work.length + ' role(s), ' +
            (d.ohCvProfile.profile.education || []).length + ' education, ' + (d.ohCvProfile.profile.skills || []).length + ' skill(s)'
          : 'Not imported — read from your CV the first time a Workday form needs it.');
      $('wdProfileRemove').disabled = !p;
    });
  }
  function importProfile(file) {
    var r = new FileReader();
    r.onload = function () {
      var p = null;
      try { p = profileFrom(JSON.parse(String(r.result || ''))); } catch (_) {}
      if (!p) { toast('That file has no Workday profile in it', 'error'); return; }
      ST.set({ ohWorkdayProfile: p }, function () { toast('Workday profile imported', 'success'); renderEngine(); });
    };
    r.readAsText(file);
  }
  function open() {
    load(function () {
      $('wdEmail').value = login.email || '';
      $('wdPassword').value = login.password || '';
      $('wdOtherPw').value = (login.otherPasswords || []).join('\n');
      $('wdResetOn').checked = login.resetByEmail !== false;
      renderSites();
      renderEngine();
      $('wdModal').classList.remove('hidden');
    });
  }
  function close() { $('wdModal').classList.add('hidden'); }
  function save() {
    var pw = $('wdPassword').value.trim();
    if (!strong(pw)) { toast('Password needs 8+ characters with upper, lower, a number and a symbol', 'error'); return; }
    login.email = $('wdEmail').value.trim();
    login.password = pw;
    login.otherPasswords = $('wdOtherPw').value.split(/\n/).map(function (x) { return x.trim(); }).filter(function (x) { return x.length >= 6; }).slice(0, 5);
    login.resetByEmail = $('wdResetOn').checked;
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
    $('wdEngineOn').addEventListener('change', function () {
      ST.set({ ohWdEngineOff: !$('wdEngineOn').checked }, function () {
        toast($('wdEngineOn').checked ? 'Workday engine on' : 'Workday engine off — OptimHire fills Workday', 'success');
      });
    });
    $('gmailCodesOn').addEventListener('change', function () {
      ST.set({ ohGmailCodes: $('gmailCodesOn').checked }, function () {
        toast($('gmailCodesOn').checked ? 'Verification codes will be read from your signed-in Gmail' : 'Verification codes: off', 'success');
      });
    });
    $('wdResetOn').addEventListener('change', function () {
      var on = $('wdResetOn').checked;
      load(function () {
        login.resetByEmail = on;
        var o = {}; o[KEY] = login;
        ST.set(o, function () { toast(on ? 'Passwords will be reset by email when they don\'t work' : 'Passwords are never reset for you', 'success'); });
      });
    });
    $('wdProfileImport').addEventListener('click', function () { $('wdProfileFile').value = ''; $('wdProfileFile').click(); });
    $('wdProfileFile').addEventListener('change', function () { var f = this.files && this.files[0]; if (f) importProfile(f); });
    $('wdProfileRemove').addEventListener('click', function () {
      ST.set({ ohWorkdayProfile: null }, function () { toast('Workday profile removed', 'success'); renderEngine(); });
    });
    var modal = $('wdModal');
    modal.addEventListener('click', function (e) {
      if (e.target === modal) { close(); return; }
      var f = e.target && e.target.closest && e.target.closest('[data-wd-forget]');
      if (f) forget(f.getAttribute('data-wd-forget'));
      var sv = e.target && e.target.closest && e.target.closest('[data-wd-pwsave]');
      if (sv) saveSitePassword(sv.getAttribute('data-wd-pwsave'));
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.classList.contains('hidden')) close(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
