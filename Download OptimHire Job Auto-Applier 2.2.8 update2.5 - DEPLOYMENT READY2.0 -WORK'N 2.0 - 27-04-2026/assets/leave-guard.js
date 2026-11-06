/**
 * leave-guard.js — never "Leave site? Changes you made may not be saved."
 *
 * Pages ask the browser to warn before leaving (optimhire.com's own pages,
 * many ATS forms once filled, and others). The dialog popped up whenever a
 * tab moved on or closed — interrupting whatever you were doing, and mid-run
 * stopping the run until clicked. It is not raised on any site, in any tab
 * or frame, run or no run (you asked never to see it again).
 *
 * Runs in the page's own world (manifest "world": "MAIN") at document_start
 * in every frame, before the page's scripts. It takes away the page's ways
 * of ASKING for the dialog — preventDefault() and returnValue on the
 * beforeunload event, and a string returned from window.onbeforeunload —
 * and nothing else: every beforeunload listener still runs, the page's and
 * other extensions' alike. (It used to stop the event outright, which also
 * silenced other extensions' own beforeunload handlers — e.g. one saving
 * what it learned from the form before moving to the next job.)
 */
(function () {
  'use strict';
  if (window.__ohLeaveGuard) return;
  window.__ohLeaveGuard = true;
  try {
    var pd = Event.prototype.preventDefault;
    Event.prototype.preventDefault = function () {
      if (this && this.type === 'beforeunload') return;          // no dialog; the listener carries on
      return pd.apply(this, arguments);
    };
  } catch (_) {}
  try {
    var proto = window.BeforeUnloadEvent && window.BeforeUnloadEvent.prototype;
    var rv = proto && Object.getOwnPropertyDescriptor(proto, 'returnValue');
    if (rv && rv.configurable) {
      Object.defineProperty(proto, 'returnValue', {
        configurable: true, enumerable: rv.enumerable,
        get: rv.get ? function () { return rv.get.call(this); } : function () { return ''; },
        set: function () {},                                       // "e.returnValue = '…'" asks for nothing
      });
    }
  } catch (_) {}
  try {
    /* window.onbeforeunload = fn: fn still runs; its return value (the dialog's text) is dropped. */
    var owner = window, desc = null;
    while (owner && !(desc = Object.getOwnPropertyDescriptor(owner, 'onbeforeunload'))) owner = Object.getPrototypeOf(owner);
    if (desc && desc.set && desc.configurable) {
      var mine = new WeakMap();
      Object.defineProperty(window, 'onbeforeunload', {
        configurable: true, enumerable: desc.enumerable,
        get: function () { var h = desc.get.call(this); return (h && mine.get(h)) || h; },
        set: function (fn) {
          if (typeof fn !== 'function') { desc.set.call(this, fn); return; }
          var wrapped = function (e) { try { fn.call(this, e); } catch (_) {} };
          mine.set(wrapped, fn);
          desc.set.call(this, wrapped);
        },
      });
    }
  } catch (_) {}
})();
