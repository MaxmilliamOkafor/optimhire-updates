/**
 * resume-auto.js — runs inside OptimHire's tailored-resume screen
 * (tabs/resumeScoreRecord.html, shown in a frame over the job page).
 *
 * That screen waited for a person on every job that got a tailored CV:
 *   "Let's boost your application"  → "Optimize My Resume" (auto after 60 s)
 *   "Optimizing your resume"         → ~20 s, no button
 *   "Your resume is ready!"          → "Continue"      (never auto — the run
 *                                       sat there until our 5-minute cap)
 *   the resume editor                → "Save & Next →" (auto after 180 s)
 * About 40 of 141 jobs in one run lost ~5 minutes each here. While
 * automation is on, each step is pressed as soon as it is ready. The
 * tailored CV is still made and used; nothing is skipped.
 *
 * Also loaded by the cover-letter screen (tabs/coverLetter.html), whose
 * "Apply Now" counted down 180 s: pressed once the AI letter is written.
 */
(function () {
  'use strict';
  var ST = chrome.storage && chrome.storage.local;
  if (!ST) return;

  var on = false;
  function refresh() {
    ST.get(['isAutoProcessStartJob', 'isManuallyStartJob', 'csvActiveJobId', 'ohAutomationDisabled'], function (d) {
      d = d || {};
      on = !!(d.isAutoProcessStartJob || d.isManuallyStartJob || d.csvActiveJobId) && d.ohAutomationDisabled !== true;
    });
  }
  refresh();
  chrome.storage.onChanged.addListener(function (c, area) {
    if (area === 'local' && (c.isAutoProcessStartJob || c.isManuallyStartJob || c.csvActiveJobId || c.ohAutomationDisabled)) refresh();
  });

  function log(m) { try { console.info('[OH-Resume] ' + m); } catch (_) {} }
  function visible(el) { var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
  function text(el) { return (el.textContent || '').replace(/\s+/g, ' ').trim(); }
  function findButton(re) {
    var bs = document.querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i];
      if (!b.disabled && visible(b) && re.test(text(b))) return b;
    }
    return null;
  }

  /* The cover letter written so far (its editor), for "Apply Now". */
  function letterLength() {
    var best = 0, eds = document.querySelectorAll('textarea,[contenteditable="true"],[contenteditable=""]');
    for (var i = 0; i < eds.length; i++) best = Math.max(best, ((eds[i].value || eds[i].innerText || '') + '').trim().length);
    return best;
  }
  function generating() { return /generating|writing your|please wait/i.test(text(document.body).slice(0, 2000)); }

  /* [button text, name, ms it must have been on screen first, ready?] — a
     short settle so what the button saves has finished rendering. */
  var STEPS = [
    [/^Optimi[sz]e My Resume$/i, 'Optimize My Resume', 500],
    [/^Continue$/i,              'Continue',           700],
    [/^Save\s*&\s*Next/i,        'Save & Next',        700],
    [/^Apply Now$/i,             'Apply Now',          700,
      function (shownFor) { return (letterLength() >= 150 && !generating()) || shownFor > 45000; }],
  ];
  var FALLBACK_MS = 60000;          // no step reached in this long → use the original CV
  var seen = new WeakMap(), pressed = new WeakSet();
  var openedAt = Date.now(), lastPress = 0;

  function tick() {
    if (!on || !document.body) return;
    var now = Date.now();
    for (var i = 0; i < STEPS.length; i++) {
      var b = findButton(STEPS[i][0]);
      if (!b || pressed.has(b)) continue;
      if (!seen.has(b)) seen.set(b, now);
      var shownFor = now - seen.get(b);
      if (shownFor < STEPS[i][2] || (STEPS[i][3] && !STEPS[i][3](shownFor))) return;
      pressed.add(b); lastPress = now;
      log('auto: ' + STEPS[i][1]);
      b.click();
      return;
    }
    /* Generation failed or hangs: go on with the uploaded CV rather than
       sit here until the job is given up. */
    var since = Math.max(openedAt, lastPress);
    if (now - since > FALLBACK_MS || /couldn[’']?t\s+fetch|something went wrong|failed to (load|generate)/i.test(text(document.body).slice(0, 3000))) {
      var orig = findButton(/^Use My Original Resume$/i);
      if (orig && !pressed.has(orig)) { pressed.add(orig); lastPress = now; log('auto: Use My Original Resume'); orig.click(); }
    }
  }
  setInterval(tick, 300);
})();
