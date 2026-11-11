/**
 * oh-off.js — Autofill OFF on every page: nothing of the extension's shows.
 *
 * While autofill is switched off (ohAutomationDisabled — the bar at the top of the side
 * panel, the toolbar icon's right-click menu, Alt+Shift+O), the page is marked
 * html[data-oh-autofill-off] and these are hidden:
 *   - OptimHire's on-page card and its "Autofill Application" button (a Plasmo
 *     <plasmo-csui> panel; only OptimHire's — other extensions' panels are left alone),
 *   - OptimHire's pop-ups, dialogs, toasts and question frames (#optimhire-…),
 *   - our own banner, CSV-queue card and Workday autopilot card.
 * Turned back on, they show again. (Filling, clicking and opening the side panel are
 * stopped in the service worker, oh-bg.js 18, and in optimhire-patch.js.)
 *
 * Runs at document_start in every frame, in the extension's content-script world — the
 * same world as OptimHire's page scripts, and before them — so the <plasmo-csui> panels
 * OptimHire creates can be told from other extensions' (their scripts run in their own
 * worlds and never pass through here). Not on optimhire.com, the site itself.
 */
(function () {
  'use strict';
  if (window.__ohOffSwitch) return;
  window.__ohOffSwitch = true;
  if (/(^|\.)optimhire\.com$/i.test(location.hostname)) return;

  try {
    var realCreate = Document.prototype.createElement;
    Document.prototype.createElement = function (tag) {
      var el = realCreate.apply(this, arguments);
      try { if (typeof tag === 'string' && tag.toLowerCase() === 'plasmo-csui') el.setAttribute('data-oh-ui', ''); } catch (_) {}
      return el;
    };
  } catch (_) {}

  var CSS = [
    'html[data-oh-autofill-off] plasmo-csui[data-oh-ui]',
    'html[data-oh-autofill-off] [id^="optimhire-"]',
    'html[data-oh-autofill-off] #confinity-welcome-screen',
    'html[data-oh-autofill-off] #oh-autofill-banner',
    'html[data-oh-autofill-off] #oh-csv-overlay-host',
    'html[data-oh-autofill-off] #wd-autopilot-overlay',
  ].join(',\n') + ' { display: none !important; }';

  function addStyle() {
    if (document.getElementById('oh-autofill-off-style')) return;
    var root = document.head || document.documentElement;
    if (!root) return;
    var s = document.createElement('style');
    s.id = 'oh-autofill-off-style';
    s.textContent = CSS;
    root.appendChild(s);
  }
  function paint(isOff) {
    var html = document.documentElement;
    if (!html) return;
    if (isOff) { html.setAttribute('data-oh-autofill-off', ''); addStyle(); }
    else html.removeAttribute('data-oh-autofill-off');
  }
  try {
    chrome.storage.local.get(['ohAutomationDisabled'], function (d) { paint(!!(d && d.ohAutomationDisabled === true)); });
    chrome.storage.onChanged.addListener(function (c, area) {
      if (area === 'local' && c.ohAutomationDisabled) paint(c.ohAutomationDisabled.newValue === true);
    });
  } catch (_) {}
  /* <head> may not exist yet at document_start. */
  document.addEventListener('DOMContentLoaded', function () {
    if (document.documentElement.hasAttribute('data-oh-autofill-off')) addStyle();
  });
})();
