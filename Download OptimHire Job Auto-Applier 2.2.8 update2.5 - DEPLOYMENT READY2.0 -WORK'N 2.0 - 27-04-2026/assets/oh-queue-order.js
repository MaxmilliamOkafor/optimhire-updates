/**
 * oh-queue-order.js — optimhire.com's own job lists: ATS jobs first, job boards after,
 * Reed last.
 *
 * The site lists the jobs it found for you in its own order, so reed.co.uk,
 * eFinancialCareers and other boards' jobs came before jobs on the employer's own ATS
 * (the quickest to apply to and the ones that reach the hiring team). Every list of jobs
 * in optimhire.com's replies (/api/…) is put in this order before the page sees it:
 *   quick ATS (Greenhouse, Lever, Ashby, Workable…) → ATS with an account (Workday,
 *   iCIMS, SuccessFactors…) → company career sites → job boards / recruiters → Reed.
 * Order within each group is kept; nothing is added or removed. The service worker
 * (oh-bg.js, "ATS jobs first, Reed last") does the same for the next job it asks for.
 *
 * Runs in the page's own world (manifest "world": "MAIN") at document_start, before the
 * site's scripts. Off when "Quickest ATS first" is off (optimhire-patch.js marks the page
 * with data-oh-ats-first="0").
 */
(function () {
  'use strict';
  if (window.__ohQueueOrder) return;
  window.__ohQueueOrder = true;

  var QUICK_ATS = [/greenhouse\.io|grnh\.se/, /lever\.co/, /ashbyhq/, /workable/, /smartrecruiters/, /recruitee/, /teamtailor/, /bamboohr/,
    /breezy\.hr/, /jazzhr|resumatorapi|applytojob/, /pinpointhq/, /rippling/, /comeet/, /personio/, /jobvite/,
    /freshteam|manatal|recooty|gohire|forhyre|homerun|dover\.com|jobs\.gem\.com|join\.com|factorialhr|careerpuck|trakstar/];
  var ACCOUNT_ATS = [/myworkdayjobs|myworkdaysite|workdayjobs|\.workday\.com/, /icims/, /successfactors|sapsf/, /oraclecloud/, /taleo/,
    /paylocity|ultipro|ukg\.com|adp\.com|avature|bullhorn|dayforcehcm|brassring|csod\.com|paycom|paycor|zohorecruit/];
  var BOARD_HOST_RE = new RegExp('(^|\\.)(' + [
    'linkedin', 'indeed', 'glassdoor', 'ziprecruiter', 'adzuna', 'dice', 'monster', 'totaljobs', 'cwjobs', 'jobsite', 'cv-library',
    'caterer', 'milkround', 'efinancialcareers', 'efinancial', 'irishjobs', 'jobs\\.ie', 'nijobs', 'recruitireland', 'jobs\\.ac\\.uk',
    'simplyhired', 'careerbuilder', 'jooble', 'careerjet', 'jora', 'talent\\.com', 'neuvoo', 'lensa', 'snagajob', 'theladders', 'ladders',
    'hired', 'wellfound', 'angel\\.co', 'otta', 'welcometothejungle', 'builtin[a-z]*', 'stepstone', 'xing', 'seek', 'jobstreet', 'naukri',
    'foundit', 'bayt', 'gulftalent', 'workinstartups', 'jobserve', 'technojobs', 'jobs\\.theguardian', 'guardianjobs', 'charityjob',
    'escapethecity', 'idealist', 'remoteok', 'weworkremotely', 'remotive', 'flexjobs', 'himalayas', 'jobgether', 'jobleads', 'jobright',
    'hiring\\.cafe', 'getwork', 'joblist', 'clearancejobs', 'usajobs', 'civilservicejobs', 'findajob', 'jobs\\.nhs', 'hays', 'michaelpage',
    'pagepersonnel', 'roberthalf', 'randstad', 'adecco', 'jobteaser', 'gradcracker', 'targetjobs', 'prospects', 'jobindex',
    'infojobs', 'computrabajo', 'catho', 'bumeran', 'apec', 'jobat', 'jobs\\.ch', 'karriere\\.at', 'pracuj',
    'jobrapido', 'trovit', 'mitula', 'dailyremote', 'workingnomads', 'nodesk', 'jobbank', 'workopolis', 'eluta',
  ].join('|') + ')\\.', 'i');
  var BOARD_NAME_RE = /\b(linkedin|indeed|ziprecruiter|adzuna|dice|glassdoor|monster|totaljobs|cwjobs|jobsite|cv-?library|e-?financial ?careers|efc|irishjobs|jobs\.ie|stepstone|careerjet|jooble|simplyhired|careerbuilder|talent\.com|seek|naukri|wellfound|otta|welcome to the jungle|built ?in|hays|michael page|robert half|randstad|adecco|guardian jobs|jobserve|hired)\b/i;
  var ATS_NAME_RE = /greenhouse|lever|ashby|workable|smartrecruiters|recruitee|teamtailor|bamboo|breezy|jazz|pinpoint|rippling|comeet|personio|jobvite|workday|icims|successfactors|oracle|taleo|paylocity|ultipro|adp|avature/i;

  function on() { return document.documentElement.getAttribute('data-oh-ats-first') !== '0'; }
  function str(v) { return typeof v === 'string' ? v : ''; }
  function applyUrl(o) {
    var src = o.source && typeof o.source === 'object' ? o.source : {};
    return str(src.apply_now_url) || str(o.apply_now_url) || str(o.apply_url) || str(o.applyUrl) || str(o.application_url) ||
           str(src.job_url) || str(o.job_url) || str(o.jobUrl) || (/^https?:/i.test(str(o.url)) ? o.url : '');
  }
  function names(o) {
    var src = o.source && typeof o.source === 'object' ? o.source : {};
    var ai = o.additional_info && typeof o.additional_info === 'object' && !Array.isArray(o.additional_info) ? o.additional_info : {};
    return [o.ats_name, o.atsName, o.job_board, o.jobBoard, o.source_name, o.platform, o.jobsite, src.source_name, src.job_board, ai.source_name]
      .map(str).filter(Boolean).join(' ');
  }
  function looksLikeJob(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    var titled = !!(o.title || o.job_title || o.jobTitle || o.position || (o.source && (o.source.job_title || o.source.title)));
    return titled && !!(applyUrl(o) || names(o));
  }
  /* Lower = sooner. Where you apply decides first; where the job was found only when that is unknown. */
  function rank(o) {
    var url = applyUrl(o), host = '';
    try { host = new URL(url).hostname.toLowerCase(); } catch (_) {}
    var lu = url.toLowerCase(), i;
    if (host) {
      if (/(^|\.)reed\.co\.uk$/.test(host)) return 99;
      if (BOARD_HOST_RE.test(host + '.')) return /(^|\.)linkedin\./.test(host) ? 40 : /(^|\.)indeed\./.test(host) ? 41 : 45;
      for (i = 0; i < QUICK_ATS.length; i++) if (QUICK_ATS[i].test(lu)) return i;
      for (i = 0; i < ACCOUNT_ATS.length; i++) if (ACCOUNT_ATS[i].test(lu)) return 20 + i;
    }
    var n = names(o);
    if (/\breed\b/i.test(n)) return 99;
    if (BOARD_NAME_RE.test(n)) return 45;
    if (ATS_NAME_RE.test(n)) return 10;
    return 30;                                     // a company's own career site
  }
  /* A copy of `v` with every list of jobs in order, or null when nothing moved. */
  function reorder(v, depth) {
    if (depth > 8 || !v || typeof v !== 'object') return null;
    var changed = false, out;
    if (Array.isArray(v)) {
      var jobs = v.filter(looksLikeJob).length;
      out = v.map(function (x) { var r = reorder(x, depth + 1); if (r) { changed = true; return r; } return x; });
      if (out.length >= 2 && jobs >= Math.max(2, Math.ceil(out.length * 0.8))) {
        var keyed = out.map(function (x, i) { return { x: x, i: i, r: looksLikeJob(x) ? rank(x) : 50 }; });
        keyed.sort(function (a, b) { return a.r - b.r || a.i - b.i; });
        if (keyed.some(function (k, i) { return k.i !== i; })) { changed = true; out = keyed.map(function (k) { return k.x; }); }
      }
      return changed ? out : null;
    }
    out = {};
    for (var k in v) {
      if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
      var r = reorder(v[k], depth + 1);
      if (r) { changed = true; out[k] = r; } else out[k] = v[k];
    }
    return changed ? out : null;
  }
  function reorderText(text) {
    if (!on() || typeof text !== 'string' || text.length < 20 || text.length > 5e6) return null;
    var c = text.charAt(0);
    if (c !== '{' && c !== '[') return null;
    try { var r = reorder(JSON.parse(text), 0); return r ? JSON.stringify(r) : null; } catch (_) { return null; }
  }
  function wants(url) {
    try {
      var u = new URL(String(url || ''), location.href);
      return /(^|\.)optimhire\.com$/i.test(u.hostname) && /\/api\//i.test(u.pathname);
    } catch (_) { return false; }
  }

  /* fetch */
  var realFetch = window.fetch;
  if (typeof realFetch === 'function') {
    window.fetch = function (input, init) {
      var p = realFetch.apply(this, arguments);
      var url = '';
      try { url = typeof input === 'string' ? input : (input && input.url) || String(input || ''); } catch (_) {}
      if (!wants(url)) return p;
      return p.then(function (res) {
        try {
          if (!res || !res.ok || !/json/i.test(res.headers.get('content-type') || '')) return res;
          return res.clone().text().then(function (text) {
            var out = reorderText(text);
            if (out == null) return res;
            var h = new Headers(res.headers);
            h.delete('content-length'); h.delete('content-encoding');
            var r = new Response(out, { status: res.status, statusText: res.statusText, headers: h });
            try { Object.defineProperty(r, 'url', { value: res.url }); } catch (_) {}
            return r;
          }, function () { return res; });
        } catch (_) { return res; }
      });
    };
  }

  /* XMLHttpRequest (axios and most site code) */
  var proto = window.XMLHttpRequest && XMLHttpRequest.prototype;
  var rtDesc = proto && Object.getOwnPropertyDescriptor(proto, 'responseText');
  var rDesc = proto && Object.getOwnPropertyDescriptor(proto, 'response');
  if (proto && rtDesc && rtDesc.get && rDesc && rDesc.get && rtDesc.configurable && rDesc.configurable) {
    var realOpen = proto.open;
    var urls = new WeakMap(), cooked = new WeakMap();
    proto.open = function (method, url) {
      try { urls.set(this, String(url || '')); cooked.delete(this); } catch (_) {}
      return realOpen.apply(this, arguments);
    };
    var cook = function (xhr) {
      if (xhr.readyState !== 4 || !wants(urls.get(xhr))) return null;
      if (cooked.has(xhr)) return cooked.get(xhr);
      var out = null;
      try {
        var t = xhr.responseType;
        if (t === '' || t === 'text') out = reorderText(rtDesc.get.call(xhr));
        else if (t === 'json' && on()) out = reorder(rDesc.get.call(xhr), 0);
      } catch (_) { out = null; }
      cooked.set(xhr, out);
      return out;
    };
    Object.defineProperty(proto, 'responseText', {
      configurable: true, enumerable: rtDesc.enumerable,
      get: function () { var c = cook(this); return typeof c === 'string' ? c : rtDesc.get.call(this); },
    });
    Object.defineProperty(proto, 'response', {
      configurable: true, enumerable: rDesc.enumerable,
      get: function () {
        var c = cook(this);
        if (c == null) return rDesc.get.call(this);
        var t = this.responseType;
        if (t === 'json') return typeof c === 'object' ? c : rDesc.get.call(this);
        if (t === '' || t === 'text') return typeof c === 'string' ? c : rDesc.get.call(this);
        return rDesc.get.call(this);
      },
    });
  }
})();
