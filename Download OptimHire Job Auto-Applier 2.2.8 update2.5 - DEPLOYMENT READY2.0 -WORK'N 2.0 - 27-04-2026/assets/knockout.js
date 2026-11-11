/**
 * knockout.js — "Knockout answers" in the Queue Manager.
 *
 * Your true answers to the screening questions that reject an application
 * outright (chrome.storage.local.ohKnockout): the countries you can work in
 * without sponsorship, relocation / on-site, background checks, age, licence,
 * convictions… plus the certifications you hold (AWS by default), years of
 * experience (9 unless you set another number — every years question uses
 * it), highest degree (from your CV) and salary (from your profile). assets/optimhire-patch.js answers
 * every knockout question with these (per the job's country), corrects wrong
 * answers any filler left, and holds Submit until they are right; the
 * Workday engine asks it too. Saving marks them confirmed, which clears the
 * "Check your knockout answers" prompt on the side-panel card.
 */
(function () {
  'use strict';
  if (window.top !== window.self) return;
  var KEY = 'ohKnockout';
  var ST = chrome.storage.local;

  /* key, question, hint, options (value → text) */
  var ITEMS = [
    ['relocate', 'Willing to relocate', 'Also used for on-site jobs in a country you would move to'],
    ['onsite', 'Work on-site / in the office', ''],
    ['hybrid', 'Work hybrid', ''],
    ['remote', 'Work remotely', ''],
    ['over18', '18 or older', ''],
    ['backgroundCheck', 'Agree to a background / reference check', ''],
    ['drugTest', 'Agree to a drug screen', ''],
    ['essentialFunctions', 'Can perform the job’s essential functions', 'With or without reasonable accommodation'],
    ['driversLicence', 'Hold a driving licence', 'Not answered when left on Skip', true],
    ['clearance', 'Hold a security clearance', ''],
    ['englishFluent', 'Fluent in English', ''],
    ['convicted', 'Have a criminal conviction', ''],
    ['nonCompete', 'Bound by a non-compete', ''],
    ['relatives', 'Relatives work at the company', ''],
    ['previouslyEmployed', 'Worked for the company before', 'Companies on your CV are recognised either way'],
  ];
  var DEFAULTS = {
    relocate: true, onsite: true, hybrid: true, remote: true, over18: true, backgroundCheck: true, drugTest: true,
    essentialFunctions: true, driversLicence: null, clearance: false, englishFluent: true, convicted: false,
    nonCompete: false, relatives: false, previouslyEmployed: false,
  };

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
  function parse(v) { if (typeof v === 'string') { try { return JSON.parse(v); } catch (_) { return null; } } return v; }

  /* Your country, from wherever OptimHire keeps your details. */
  function profileCountry(d) {
    var srcs = [d.ohWdSeeker, parse(d.candidateDetails), parse(d.cachedSeekerInfo)];
    ['manualApplicationDetail', 'complexFormData', 'autoApplyState'].forEach(function (k) {
      var v = parse(d[k]); var ad = v && (v.applicationDetails || v);
      if (ad && ad.seeker) srcs.push(ad.seeker);
    });
    for (var i = 0; i < srcs.length; i++) {
      var s = srcs[i];
      if (!s || typeof s !== 'object') continue;
      var c = s.country || s.location_country || (s.seeker && s.seeker.country);
      if (c && String(c).trim()) return String(c).trim();
    }
    return '';
  }
  function profileSalary(d) {
    var srcs = [d.ohWdSeeker, parse(d.candidateDetails)];
    for (var i = 0; i < srcs.length; i++) {
      var s = srcs[i];
      var v = s && (s.expected_salary || s.expectedSalary || s.desired_salary);
      if (v) return String(v).replace(/[^\d.]/g, '');
    }
    return '';
  }
  /* Your highest degree on your CV. */
  function cvFacts(cv) {
    var out = { degree: '' };
    if (!cv) return out;
    var rank = function (t) {
      t = String(t || '');
      if (/\bph\.?\s?d\b|\bdoctor/i.test(t)) return 4;
      if (/\bmaster|\bm\.?\s?sc\b|\bm\.?\s?eng\b|\bmba\b|\bm\.a\.|postgraduate/i.test(t)) return 3;
      if (/\bbachelor|\bb\.?\s?sc\b|\bb\.?\s?eng\b|\bb\.a\.|\bb\.?tech\b|\bhons\b/i.test(t)) return 2;
      if (/\bassociate|\bdiploma\b|\bhnd\b/i.test(t)) return 1;
      return 0;
    };
    (cv.education || []).forEach(function (e) { if (rank(e.degree) > rank(out.degree)) out.degree = e.degree; });
    return out;
  }

  function seg(key, val, tri) {
    var opts = tri ? [['yes', 'Yes'], ['no', 'No'], ['skip', 'Skip']] : [['yes', 'Yes'], ['no', 'No']];
    var cur = val === true ? 'yes' : val === false ? 'no' : 'skip';
    return '<div class="seg" role="radiogroup">' + opts.map(function (o) {
      var id = 'ko_' + key + '_' + o[0];
      return '<input type="radio" name="ko_' + key + '" id="' + id + '" value="' + o[0] + '"' + (cur === o[0] ? ' checked' : '') + '>' +
             '<label for="' + id + '">' + o[1] + '</label>';
    }).join('') + '</div>';
  }

  function render(d) {
    var ko = (d[KEY] && typeof d[KEY] === 'object') ? d[KEY] : {};
    var cv = cvFacts(d.ohCvProfile && d.ohCvProfile.profile);
    var home = profileCountry(d);
    var countries = Array.isArray(ko.workCountries) ? ko.workCountries : (home ? [home] : []);
    $('koCountries').value = countries.map(function (c) { return String(c).replace(/\b\w/g, function (m) { return m.toUpperCase(); }); }).join(', ');
    $('koEu').checked = !!ko.euWide;
    $('koGrid').innerHTML = ITEMS.map(function (it) {
      var v = Object.prototype.hasOwnProperty.call(ko, it[0]) ? ko[it[0]] : DEFAULTS[it[0]];
      return '<div class="ko-q">' + esc(it[1]) + (it[2] ? '<small>' + esc(it[2]) + '</small>' : '') + '</div>' + seg(it[0], v, it[3]);
    }).join('');
    $('koYears').value = ko.yearsExperience != null && ko.yearsExperience !== '' ? ko.yearsExperience : '';
    $('koYears').placeholder = '9 (default)';
    $('koCerts').value = Array.isArray(ko.certifications) ? ko.certifications.join(', ') : 'AWS';
    $('koDegree').value = ko.highestDegree || '';
    $('koDegree').placeholder = cv.degree ? cv.degree + ' (CV)' : 'e.g. BSc Computer Science';
    $('koSalary').value = ko.salary || '';
    var ps = profileSalary(d);
    $('koSalary').placeholder = ps ? ps + ' (profile)' : 'e.g. 60000';
    $('koCvNote').textContent = 'Every years-of-experience question uses this number — "How many years…?", a range such as "5-7 years", or ' +
      '"Do you have 5+ years…?" (Yes when it is at least 5). Left empty: 9. Degree comes from your CV and salary from your profile when left empty.';
    var badge = $('koBadge');
    if (badge) badge.textContent = ko.confirmed ? '' : '!';
  }

  function load(cb) {
    ST.get([KEY, 'ohCvProfile', 'ohWdSeeker', 'candidateDetails', 'cachedSeekerInfo', 'manualApplicationDetail', 'complexFormData', 'autoApplyState'], function (d) { cb(d || {}); });
  }
  function open() { load(function (d) { render(d); $('koModal').classList.remove('hidden'); }); }
  function close() { $('koModal').classList.add('hidden'); }
  function save() {
    var out = { confirmed: true, savedAt: Date.now() };
    out.workCountries = $('koCountries').value.split(/[,;]/).map(function (s) { return s.trim(); }).filter(Boolean);
    out.euWide = $('koEu').checked;
    ITEMS.forEach(function (it) {
      var r = document.querySelector('input[name="ko_' + it[0] + '"]:checked');
      var v = r ? r.value : 'skip';
      out[it[0]] = v === 'yes' ? true : v === 'no' ? false : null;
    });
    out.yearsExperience = $('koYears').value.trim();
    out.certifications = $('koCerts').value.split(/[,;]/).map(function (s) { return s.trim(); }).filter(Boolean);
    out.highestDegree = $('koDegree').value.trim();
    out.salary = $('koSalary').value.replace(/[^\d.]/g, '');
    if (!out.workCountries.length && !out.euWide) { toast('Add at least one country where you can work', 'error'); $('koCountries').focus(); return; }
    var o = {}; o[KEY] = out;
    ST.set(o, function () {
      toast('Knockout answers saved — every application uses them from now on', 'success');
      var badge = $('koBadge'); if (badge) badge.textContent = '';
      close();
    });
  }

  function wire() {
    var btn = $('btnKnockout');
    if (!btn) return;
    btn.addEventListener('click', open);
    $('koClose').addEventListener('click', close);
    $('koSave').addEventListener('click', save);
    var modal = $('koModal');
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.classList.contains('hidden')) close(); });
    ST.get([KEY], function (d) { var b = $('koBadge'); if (b) b.textContent = d && d[KEY] && d[KEY].confirmed ? '' : '!'; });
    if (location.hash === '#knockout') open();
    window.addEventListener('hashchange', function () { if (location.hash === '#knockout') open(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
