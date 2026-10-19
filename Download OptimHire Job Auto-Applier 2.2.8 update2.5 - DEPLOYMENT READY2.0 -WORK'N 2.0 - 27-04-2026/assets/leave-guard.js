/**
 * leave-guard.js — never "Leave site? Changes you made may not be saved."
 *
 * Pages ask the browser to warn before leaving (optimhire.com's own pages,
 * many ATS forms once filled, and others). The dialog popped up whenever a
 * tab moved on or closed — interrupting whatever you were doing, and mid-run
 * stopping the run until clicked. It is not raised on any site, in any tab
 * or frame, run or no run (you asked never to see it again).
 *
 * Runs at document_start in every frame, before the page's scripts, so its
 * listener comes first and stops theirs (listeners are shared across worlds).
 */
(function () {
  'use strict';
  window.addEventListener('beforeunload', function (e) {
    e.stopImmediatePropagation();      // the page's own "unsaved changes" handlers never run
  }, true);
})();
