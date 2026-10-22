/// <reference types="chrome" />
/**
 * OptimHire adapter for the Workday engine — content script on Workday hosts
 * (built to assets/wd-engine.js).
 *
 * During an OptimHire run oh-bg.js hands each Workday job here (oh:wd:start)
 * instead of to OptimHire's own filler. This then runs OptimHire's job-closed
 * check and lets the engine apply: sign in / create the account, upload your
 * own CV (Workday never gets a tailored copy),
 * fill every step, answer questions (Q&A memory first, then OptimHire's
 * answer service, then the profile rules) and press Submit. The result goes
 * back to OptimHire as COMPLEX_FORM_SUCCESS / COMPLEX_FORM_ERROR, so its
 * counts, auto-skip and next job work as before.
 *
 * "Autofill this page" on a Workday page runs the engine too, stopping on
 * Review for you to submit (or submitting, with "+ submit").
 *
 * Assist (SpeedyApply-style), while you browse Workday outside a run with
 * "Auto-fill on supported ATS pages" on: each step is filled the moment it
 * appears — My Information, My Experience, questions, disclosures — and
 * nothing is pressed for you. Each step is filled once: going Back to one
 * never refills it over your edits. You check, edit and press Save and
 * Continue; the next step fills itself. On Review it submits for you after
 * a 5-second countdown you can cancel.
 *
 * The engine's own messages (wd:cred:*, wd:progress …) are answered here, in
 * the page, from chrome.storage.local — the service worker never sees them.
 */
import { autoResume, isActive, startRun, stopRun } from "../workday/engine.js";
import { activeStepName, detectPage, hasWorkdayApp, isWorkdayHost, tenantHost } from "../workday/detect.js";
import { similarity } from "../workday/dom.js";
import { normalizeLabel, normalizeProfile } from "../workday/store.js";
import { setHooks, type OpenQuestion, type Outcome } from "../workday/ohHooks.js";
import type { ControlKind } from "../workday/controls.js";
import { DEFAULT_WD_SETTINGS, type PageKind, type Profile, type RunState, type StoredDoc, type WorkdaySettings } from "../workday/types.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = Record<string, any>;

const TOP = window.top === window.self;
const ST = chrome.storage.local;
const MODE_KEY = "ohWdRun";               // sessionStorage: this tab's engine run
const MODE_TTL = 20 * 60_000;
const LOG_KEY = "ohWdEngineLog";          // chrome.storage.local: last runs, for diagnostics
const LOGIN_KEY = "ohWorkdayLogin";       // shared with the Queue Manager's "Workday sign-in"
const SEEKER_KEY = "ohWdSeeker";          // your details from the last OptimHire job, for "Autofill this page"
const CV_KEY = "ohCvProfile";             // roles / education / skills read from your CV (by its URL)

interface Mode {
  auto: boolean;        // an OptimHire run: report the result to OptimHire
  submit: boolean;      // press Submit on Review
  assist?: boolean;     // fill the step on screen only; you press Next
  queue?: boolean;      // a CSV queue job: the result goes back to the queue runner
  startedAt: number;
  jobId: string;
}

/* ---------------- this tab's run ---------------- */

function readMode(): Mode | null {
  try {
    const m = JSON.parse(sessionStorage.getItem(MODE_KEY) || "null") as Mode | null;
    return m && Date.now() - m.startedAt < MODE_TTL ? m : null;
  } catch {
    return null;
  }
}
function writeMode(m: Mode) {
  try { sessionStorage.setItem(MODE_KEY, JSON.stringify(m)); } catch { /* storage blocked */ }
}
function clearMode() {
  try { sessionStorage.removeItem(MODE_KEY); } catch { /* storage blocked */ }
}

/* Assist is on unless auto-fill, the engine or automation is switched off —
   and never while a run (OptimHire's or the CSV queue) is going. */
const ASSIST_KEYS = ["ohAutoTrigger", "ohWdEngineOff", "ohAutomationDisabled", "isAutoProcessStartJob", "isManuallyStartJob", "ohJobQueueActive"];
let assistOn = false;
function readAssist() {
  ST.get(ASSIST_KEYS).then((d) => {
    const running = !!(d.isAutoProcessStartJob || d.isManuallyStartJob || d.ohJobQueueActive);
    assistOn = d.ohAutoTrigger !== false && d.ohWdEngineOff !== true && d.ohAutomationDisabled !== true && !running;
  }, () => {});
}
readAssist();
chrome.storage.onChanged.addListener((c, area) => {
  if (area === "local" && ASSIST_KEYS.some((k) => k in c)) readAssist();
});

/* A CSV queue job's result, kept for the queue runner (survives a reload). */
const QUEUE_RESULT_KEY = "ohWdQueueResult";
function queueResult(jobId: string): Any | null {
  try {
    const r = JSON.parse(sessionStorage.getItem(QUEUE_RESULT_KEY) || "null");
    return r && r.jobId === jobId ? r : null;
  } catch {
    return null;
  }
}

/* optimhire-patch.js stands down on a page the engine is working on — and,
   with assist on, on Workday altogether (the engine fills it). Its CSV
   queue runner hands Workday jobs here (startQueueJob) and reads the
   result (queueResult). */
(window as Any).__ohWdEngine = {
  // …and the pages of Workday's emailed links, which the background fills in its own tab.
  owns: () => TOP && (!!readMode() || isActive() || (assistOn && hasWorkdayApp()) || /passwordreset|resetpassword|\/activate\b|verifyemail|verifyaccount/i.test(location.pathname)),
  takesManual: () => TOP && hasWorkdayApp(),
  isWorkday: () => TOP && isWorkdayHost(),
  startQueueJob: (job: Any) => void startQueueJob(job),
  queueResult,
};

/* ---------------- OptimHire messaging ---------------- */

const say = (msg: string) => console.info(`[WD-Engine] ${msg}`);

const send = (msg: Any) => chrome.runtime.sendMessage(msg).catch(() => undefined);

function within<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

const PROGRESS: Partial<Record<PageKind, number>> = {
  jobPosting: 72, applyMethod: 74, signIn: 76, createAccount: 76, resumeUpload: 78, myInformation: 80,
  myExperience: 84, questions: 88, voluntaryDisclosures: 92, selfIdentify: 94, review: 97,
};
const PAGE_NAME: Partial<Record<PageKind, string>> = {
  jobPosting: "opening the job", applyMethod: "choosing how to apply", signIn: "signing in", createAccount: "creating the account",
  resumeUpload: "uploading the CV", myInformation: "My Information", myExperience: "My Experience", questions: "Application Questions",
  voluntaryDisclosures: "Voluntary Disclosures", selfIdentify: "Self Identify", review: "Review & Submit",
};

/* ---------------- the engine's own messages, answered here ---------------- */

function makePassword(): string {
  // Same recipe as the Queue Manager / optimhire-patch: ≥ 8 chars, upper, lower, digit, symbol.
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const r = crypto.getRandomValues(new Uint32Array(12));
  return "Oh" + Array.from(r, (n) => abc[n % abc.length]).join("") + "!7q";
}

/** One e-mail + password for every Workday site (ohWorkdayLogin), made once and kept. */
async function workdayLogin(): Promise<{ email: string; password: string; login: Any; d: Any }> {
  const d = await ST.get([LOGIN_KEY, "appAccountEmail", "appAccountPassword", "ohGmailCodes"]);
  const login: Any = Object.assign({ sites: {} }, d[LOGIN_KEY] || {});
  if (!login.password) {
    login.password = d.appAccountPassword || makePassword();
    await ST.set({ [LOGIN_KEY]: login });
  }
  const email = login.email || d.appAccountEmail || (await profileSources()).email || "";
  return { email, password: login.password, login, d };
}

/** One employer's Workday sign-in record (ohWorkdayLogin.sites[host]), merged — never replaced. */
async function noteSite(state: string, extra: Any = {}, host = tenantHost()) {
  try {
    const d = await ST.get(LOGIN_KEY);
    const login: Any = Object.assign({ sites: {} }, d[LOGIN_KEY] || {});
    const prev = (login.sites || {})[host] || {};
    login.sites = Object.assign({}, login.sites, { [host]: Object.assign({}, prev, { state, ts: Date.now() }, extra) });
    await ST.set({ [LOGIN_KEY]: login });
  } catch { /* storage unavailable */ }
}

/* Signing in to an employer whose account was made before (by you, another tool, or with another
   password): each of your passwords is tried once — at most MAX_TRIES failed sign-ins per employer a
   day, across all its jobs, well under Workday's lockout — then the password is reset from the
   emailed link (your Gmail, opt-in), and an employer that still can't be signed in to is not tried
   again by its next jobs until you add its password or press Retry in the Queue Manager. */
const DAY = 24 * 3600_000;
const MAX_TRIES = 3;
const RESET_EVERY = 30 * 60_000;
const OTHER_PW =
  "Your Workday account at this employer has a different password. Add it in Queue Manager → Workday & sign-in (or turn on emailed codes there so it can be reset), and its jobs will go through.";
const LOCKED =
  "Your Workday account at this employer is locked. Reset its password from the sign-in page (or turn on emailed codes in Queue Manager → Workday & sign-in so it is reset for you), then press Retry there.";
const offered = new Map<string, string>(); // host → the password last offered (saved once it works)

/** A short tag for a password already tried (the password itself is not stored again). */
function pwTag(p: string): string {
  let h = 2166136261;
  for (let i = 0; i < p.length; i++) h = Math.imul(h ^ p.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
function candidates(login: Any, d: Any, site: Any): string[] {
  const all = [site.password, login.password, d.appAccountPassword, ...(Array.isArray(login.otherPasswords) ? login.otherPasswords : [])];
  return [...new Set(all.filter((p) => typeof p === "string" && p.length >= 6))] as string[];
}
function triedToday(site: Any): string[] {
  return site.triedAt && Date.now() - site.triedAt < DAY && Array.isArray(site.tried) ? site.tried : [];
}
/** Reset by email: your Gmail is read (opt-in), at most twice per employer a day, 30 min apart. */
function resetsToday(site: Any): number[] {
  return (Array.isArray(site.resets) ? site.resets : []).filter((t: number) => Date.now() - t < DAY);
}
function mayReset(login: Any, d: Any, site: Any, email: string): boolean {
  const r = resetsToday(site);
  return d.ohGmailCodes === true && login.resetByEmail !== false && !!email && r.length < 2 && !(r.length && Date.now() - Math.max(...r) < RESET_EVERY);
}
function mailLink(kind: "reset" | "verify", host: string, email: string, since: number, password?: string): Promise<Any> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: "OH_WD_MAIL_LINK", kind, host, email, since, password }, (r: Any) => {
        void chrome.runtime.lastError;
        resolve(r || { ok: false, reason: "no answer" });
      });
    } catch {
      resolve({ ok: false, reason: "extension reloaded" });
    }
  });
}

/** Sites where account creation was tried this tab session (it may have found an existing account). */
function createTried(host: string, add = false): boolean {
  try {
    const set = new Set<string>(JSON.parse(sessionStorage.getItem("ohWdCreateTried") || "[]"));
    if (add && !set.has(host)) sessionStorage.setItem("ohWdCreateTried", JSON.stringify([...set, host]));
    return set.has(host);
  } catch {
    return add;
  }
}

async function answerWd(msg: Any): Promise<unknown> {
  switch (msg.type) {
    case "wd:cred:get": {
      const { email, password, login, d } = await workdayLogin();
      const host = String(msg.tenantHost || tenantHost());
      const site = (login.sites || {})[host] || {};
      const master = email && password ? { email, password } : null;
      const page = detectPage();
      const tried = triedToday(site);
      const next = candidates(login, d, site).find((p) => !tried.includes(pwTag(p)));
      const offer = (p: string) => {
        offered.set(host, p);
        return { cred: { email, password: p }, master };
      };
      if (site.state === "locked") return mayReset(login, d, site, email) ? { cred: null, master, reset: true } : { cred: null, master, blocked: LOCKED };
      if (site.state === "other-password") {
        if (next && tried.length < MAX_TRIES) return offer(next);
        return mayReset(login, d, site, email) ? { cred: null, master, reset: true } : { cred: null, master, blocked: OTHER_PW };
      }
      // A site we already have an account on signs in with its password (the shared one unless another worked).
      if (site.state === "account" || site.state === "verify") return offer(site.password || password);
      if (page === "createAccount") createTried(host, true);
      // A new site: no password to offer on the sign-in form, so the engine goes to Create Account
      // first; once that found an account already there, your passwords are tried one by one.
      if (page === "signIn" && !createTried(host)) return { cred: null, master: null };
      if (page === "signIn" && next) return offer(next);
      return { cred: null, master };
    }
    case "wd:auth:rejected": {
      const { email, login, d } = await workdayLogin();
      const host = String(msg.tenantHost || tenantHost());
      const site = (login.sites || {})[host] || {};
      const tried = [...new Set([...triedToday(site), pwTag(String(msg.password || ""))])];
      const locked = !!msg.locked;
      await noteSite(locked ? "locked" : "other-password", { tried, triedAt: site.triedAt && Date.now() - site.triedAt < DAY ? site.triedAt : Date.now() }, host);
      const fresh = { ...site, tried };
      const more = candidates(login, d, fresh).some((p) => !tried.includes(pwTag(p)));
      if (!locked && more && tried.length < MAX_TRIES) return { retry: true };
      if (mayReset(login, d, fresh, email)) return { reset: true };
      return { reason: locked ? LOCKED : OTHER_PW };
    }
    case "wd:auth:mailReset": {
      const { email, password } = await workdayLogin();
      const host = String(msg.tenantHost || tenantHost());
      const site = ((await workdayLogin()).login.sites || {})[host] || {};
      await noteSite(site.state === "locked" ? "locked" : "other-password", { resets: [...resetsToday(site), Date.now()] }, host);
      const r = await mailLink("reset", host, String(msg.email || email), Number(msg.since) || Date.now(), password);
      // Reset (or submitted without a clear "done"): sign in with your Workday password next.
      if (r.ok || r.submitted) await noteSite("account", { password, tried: [], triedAt: 0 }, host);
      return r.ok || r.submitted ? { ok: true } : { ok: false, reason: r.reason || "no reset email" };
    }
    case "wd:auth:mailVerify": {
      const { email } = await workdayLogin();
      const host = String(msg.tenantHost || tenantHost());
      const r = await mailLink("verify", host, String(msg.email || email), Number(msg.since) || Date.now() - 600_000);
      if (r.ok) await noteSite("account", {}, host);
      return { ok: !!r.ok, reason: r.reason };
    }
    case "wd:cred:set":
      await noteSite("account", { password: String(msg.password || "") || undefined });
      return { ok: true };
    case "wd:cred:generate":
      return { password: (await workdayLogin()).password };
    case "wd:trustedType":
      return { ok: false };
    case "wd:llm":
      return { ok: false, error: "not available" };
    default:                 // wd:progress, wd:notify, wd:jobCaptured
      return undefined;
  }
}

(function routeEngineMessages() {
  const rt = chrome.runtime as Any;
  const orig = rt.sendMessage.bind(rt);
  rt.sendMessage = function (msg: Any, ...rest: unknown[]) {
    if (msg && typeof msg.type === "string" && msg.type.startsWith("wd:")) return answerWd(msg);
    return orig(msg, ...rest);
  };
})();

/* ---------------- profile from OptimHire's data ---------------- */

const DIAL: Record<string, string> = {
  "1": "United States of America", "44": "United Kingdom", "353": "Ireland", "234": "Nigeria", "91": "India", "49": "Germany",
  "33": "France", "61": "Australia", "27": "South Africa", "254": "Kenya", "233": "Ghana", "31": "Netherlands", "34": "Spain",
  "39": "Italy", "351": "Portugal", "48": "Poland", "46": "Sweden", "47": "Norway", "45": "Denmark", "41": "Switzerland",
  "43": "Austria", "32": "Belgium", "971": "United Arab Emirates", "966": "Saudi Arabia", "65": "Singapore", "64": "New Zealand",
  "86": "China", "81": "Japan", "82": "Korea, Republic of", "55": "Brazil", "52": "Mexico", "20": "Egypt", "63": "Philippines",
  "92": "Pakistan", "880": "Bangladesh", "60": "Malaysia", "62": "Indonesia", "90": "Turkey", "380": "Ukraine", "40": "Romania",
  "420": "Czech Republic", "36": "Hungary", "30": "Greece", "358": "Finland", "972": "Israel", "256": "Uganda", "255": "Tanzania",
  "237": "Cameroon", "212": "Morocco", "57": "Colombia", "54": "Argentina", "56": "Chile", "51": "Peru",
};
const ISO2: Record<string, string> = {
  US: "United States of America", USA: "United States of America", GB: "United Kingdom", UK: "United Kingdom", IE: "Ireland",
  NG: "Nigeria", IN: "India", DE: "Germany", FR: "France", AU: "Australia", CA: "Canada", ZA: "South Africa", KE: "Kenya",
  GH: "Ghana", NL: "Netherlands", ES: "Spain", IT: "Italy", PT: "Portugal", PL: "Poland", AE: "United Arab Emirates",
  SG: "Singapore", NZ: "New Zealand",
};

function parse(v: unknown): Any {
  if (typeof v === "string") {
    try { return JSON.parse(v) as Any; } catch { return {}; }
  }
  return v && typeof v === "object" ? (v as Any) : {};
}

/** OptimHire's details for you, flattened: the job's seeker record first, then the stored profile. */
async function profileSources(ad?: Any): Promise<Any> {
  const d = await ST.get(["candidateDetails", "cachedSeekerInfo", "seekerDetails", "userDetails", "complexFormData", "autoApplyState", "manualApplicationDetail", SEEKER_KEY]);
  // Outside a run OptimHire keeps little more than your name; the last job's details fill the gap.
  const merged: Any = Object.assign({}, parse(d[SEEKER_KEY]));
  // OptimHire keeps the full details (phone, address, CV…) on the job it is working on.
  for (const k of ["manualApplicationDetail", "autoApplyState", "complexFormData"]) {
    const v = parse(d[k]);
    const s = (v.applicationDetails || v).seeker;
    if (s && typeof s === "object") Object.assign(merged, s);
  }
  for (const k of ["userDetails", "seekerDetails", "cachedSeekerInfo", "candidateDetails"]) {
    const v = parse(d[k]);
    for (const [kk, vv] of Object.entries({ ...v, ...(v.seeker && typeof v.seeker === "object" ? v.seeker : {}) }))
      if (vv !== "" && vv != null) merged[kk] = vv;
  }
  for (const [k, v] of Object.entries((ad && ad.seeker) || {})) if (v !== "" && v != null) merged[k] = v;
  return merged;
}

/** "2021-03-15", "03/2021", "March 2021", "2021" → "2021-03" ("" when there is no date). */
function ym(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s || /present|current|now/i.test(s)) return "";
  let m = s.match(/^(\d{4})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  const t = Date.parse(s);
  if (!Number.isNaN(t) && /[a-z]/i.test(s)) {
    const dt = new Date(t);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
  }
  m = s.match(/\b(19|20)\d{2}\b/);
  return m ? `${m[0]}-01` : "";
}

function listOf(s: Any, keys: string[]): Any[] {
  for (const k of keys) {
    const v = typeof s[k] === "string" ? parse(s[k]) : s[k];
    if (Array.isArray(v) && v.length && typeof v[0] === "object") return v;
  }
  return [];
}

/** Work history / education, if OptimHire's record has them (it parses your CV). */
function historyFrom(s: Any): Pick<Profile, "work" | "education"> {
  const work = listOf(s, ["work_experience", "work_experiences", "experiences", "experience", "employment_history", "work_history", "employments"])
    .map((w, i) => {
      const endRaw = w.end_date ?? w.endDate ?? w.to ?? w.end ?? "";
      const end = ym(endRaw);
      return {
        id: `w${i + 1}`,
        title: pick(w, "title", "job_title", "designation", "position", "role"),
        company: pick(w, "company", "company_name", "employer", "organization", "organisation"),
        location: pick(w, "location", "city"),
        start: ym(w.start_date ?? w.startDate ?? w.from ?? w.start),
        end: end || undefined,
        current: !!(w.is_current ?? w.current ?? w.currently_working ?? w.currently_work_here) || (!end && /present|current|now/i.test(String(endRaw))),
        bullets: String(w.description ?? w.summary ?? w.responsibilities ?? "")
          .split(/\n+|•/)
          .map((x) => x.replace(/^[\s\-*]+/, "").trim())
          .filter(Boolean)
          .slice(0, 6),
      };
    })
    .filter((w) => w.title && w.company && w.start);
  const education = listOf(s, ["education", "educations", "education_history", "academics", "qualifications"])
    .map((e, i) => ({
      id: `e${i + 1}`,
      school: pick(e, "school", "school_name", "institution", "institute", "university", "college"),
      degree: pick(e, "degree", "degree_name", "qualification", "level"),
      field: pick(e, "field_of_study", "field", "major", "specialization", "course"),
      start: ym(e.start_date ?? e.startDate ?? e.from ?? e.start),
      end: ym(e.end_date ?? e.endDate ?? e.to ?? e.end ?? e.graduation_date) || undefined,
    }))
    .filter((e) => e.school);
  return { work, education };
}

function pick(o: Any, ...keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (v != null && String(v).trim() && typeof v !== "object") return String(v).trim();
  }
  return "";
}

/**
 * Your work history, education, skills and languages read from your own CV —
 * every role, the current one, full descriptions — read once per CV and kept.
 * The reader (assets/wd-cvtext.js, with pdf.js) is loaded into this tab only
 * when a CV has to be read.
 */
interface CvProfile { work: Profile["work"]; education: Profile["education"]; skills: string[]; languages: Profile["languages"]; summary: string }
const cvReading = new Map<string, Promise<CvProfile | null>>();
function cvProfileFor(url: string, p: Profile): Promise<CvProfile | null> {
  if (!url) return Promise.resolve(null);
  if (!cvReading.has(url)) cvReading.set(url, readCvProfile(url, p).finally(() => setTimeout(() => cvReading.delete(url), 5000)));
  return cvReading.get(url)!;
}
async function readCvProfile(url: string, p: Profile): Promise<CvProfile | null> {
  const { [CV_KEY]: cached } = await ST.get(CV_KEY);
  if (cached && cached.url === url && cached.profile) return cached.profile as CvProfile;
  const doc = await fetchCv(url, p).catch(() => undefined);
  if (!doc) return null;
  const w = window as Any;
  if (!w.__ohCv) {
    await within(chrome.runtime.sendMessage({ type: "OH_CV_LOAD" }), 15_000).catch(() => null);
    for (let i = 0; i < 40 && !w.__ohCv; i++) await new Promise((r) => setTimeout(r, 100));
  }
  if (!w.__ohCv) return null;
  const r = (await within(w.__ohCv.read(doc.base64, doc.mime), 30_000).catch(() => null)) as Any;
  if (!r || !r.profile) return null;
  const prof = r.profile as CvProfile;
  await ST.set({ [CV_KEY]: { url, at: Date.now(), roles: prof.work.length, profile: prof } });
  say(`read your CV: ${prof.work.length} role(s), ${prof.education.length} education, ${prof.skills.length} skill(s)`);
  return prof;
}

let cvReady: Promise<void> = Promise.resolve();

async function buildProfile(ad?: Any, cvUrl = ""): Promise<Profile> {
  const s = await profileSources(ad);
  const { ohWorkdayProfile: imported } = await ST.get("ohWorkdayProfile");
  const code = pick(s, "mobile_code", "phone_country_code", "dial_code").replace(/\D/g, "");
  let num = pick(s, "mobile_num", "phone", "phone_number", "mobile").replace(/[^\d]/g, "");
  if (code && num.startsWith(code) && num.length > code.length + 6) num = num.slice(code.length);
  num = num.replace(/^0+/, "");
  const rawCountry = pick(s, "country", "location_country", "country_name");
  const country = ISO2[rawCountry.toUpperCase()] || rawCountry;
  const base: Profile = normalizeProfile({
    personal: {
      firstName: pick(s, "first_name", "firstName", "given_name"),
      lastName: pick(s, "last_name", "lastName", "family_name", "surname"),
      preferredName: "",
      email: pick(s, "email", "email_address", "emailAddress"),
      phone: { countryName: DIAL[code] || country, countryCode: code ? `+${code}` : "", number: num, deviceType: "Mobile" },
      address: {
        line1: pick(s, "street", "address_line1", "address1", "street_address") || pick(s, "address").split(",")[0] || "",
        line2: "",
        city: pick(s, "city", "location_city"),
        region: pick(s, "state", "location_state", "region", "province"),
        postalCode: pick(s, "zip", "postal_code", "postalCode", "zip_code"),
        country,
      },
      linkedin: pick(s, "linkedin_profile_url", "linkedin_url", "linkedin"),
      website: pick(s, "website_url", "website", "portfolio_url", "portfolio"),
      github: pick(s, "github_url", "github"),
    },
    summary: pick(s, "summary", "bio", "about", "professional_summary"),
    skills: (Array.isArray(s.skills) ? s.skills : String(s.skills || "").split(","))
      .map((x: any) => String(typeof x === "object" ? x?.name ?? "" : x).trim())
      .filter(Boolean)
      .slice(0, 30),
    ...historyFrom(s),
    answers: {
      authorizedCountries: country ? [country] : [],
      needsSponsorship: false,
      salaryExpectation: pick(s, "expected_salary", "expectedSalary", "desired_salary"),
      noticePeriod: pick(s, "notice_period", "noticePeriod"),
      earliestStartDate: pick(s, "available_date", "availability_date", "start_date"),
      willingToRelocate: false,
      openToHybrid: true,
      openToOnsite: true,
      source: "LinkedIn",
      previouslyWorkedHere: false,
    },
  } as any);
  /* Returned at once; your CV is read alongside and its history put into this
     same profile object when ready (My Experience waits for it: cvReady). */
  const withCv = async (prof: Profile): Promise<Profile> => {
    if (prof.work.length || !cvUrl) { cvReady = Promise.resolve(); return prof; }
    cvReady = cvProfileFor(cvUrl, prof).then((cv) => {
      if (!cv || !cv.work.length || prof.work.length) return;
      prof.work = cv.work;
      if (!prof.education.length) prof.education = cv.education;
      if (!prof.skills.length) prof.skills = cv.skills;
      if (!prof.languages.length) prof.languages = cv.languages;
      if (!prof.summary) prof.summary = cv.summary;
    }, () => undefined);
    return prof;
  };
  if (!imported || typeof imported !== "object") return withCv(base);
  // A full profile imported from the standalone extension (work history, education…) wins
  // where it says something; OptimHire's details fill the rest.
  const p = normalizeProfile(imported as Profile);
  const fillIn = (a: Any, b: Any) => {
    for (const k of Object.keys(b)) {
      if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k])) fillIn((a[k] ??= {}), b[k]);
      else if (a[k] === "" || a[k] == null || (Array.isArray(a[k]) && !a[k].length)) a[k] = b[k];
    }
  };
  fillIn(p, base);
  return withCv(p);
}

/* Assist: as fast as Workday takes it. */
const ASSIST_SETTINGS = (): WorkdaySettings => ({ ...SETTINGS, fieldDelayMs: 10 });

const SETTINGS: WorkdaySettings = {
  ...DEFAULT_WD_SETTINGS,
  consentCreateAccountTerms: true,  // nobody at the PC to tick them
  consentDisclosureTerms: true,
  useMasterPassword: true,          // one password for every Workday site (ohWorkdayLogin)
  requireDocApproval: false,
  llmAnswers: false,                // answers come from OptimHire (hooks.answer) instead
  trustedInputFallback: false,
  fieldDelayMs: 40,
  fallbackToMasterCv: true,
  externalAutoRequest: false,
};

/* ---------------- CV ---------------- */

/** The CV marked primary among those on your OptimHire profile. */
async function primaryCvUrl(): Promise<string> {
  const { candidateDetails } = await ST.get("candidateDetails");
  const list = parse(candidateDetails).developer_resume_object;
  const all: Any[] = Array.isArray(list) ? list : typeof list === "string" ? (parse(list) as Any[]) : [];
  if (!Array.isArray(all) || !all.length) return "";
  const main = all.find((r) => String(r.is_primary) === "1") || all[0];
  return String(main?.resume_url || "");
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function fetchCv(url: string, p: Profile): Promise<StoredDoc | undefined> {
  if (!url) return undefined;
  let base64 = "";
  let mime = "";
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(String(r.status));
    mime = r.headers.get("content-type") || "";
    base64 = toBase64(await r.arrayBuffer());
  } catch {
    // Blocked from the page (CORS): the service worker can fetch any URL.
    const r = (await within(chrome.runtime.sendMessage({ type: "OH_WD_FETCH_FILE", url }), 30000).catch(() => null)) as Any;
    if (!r?.base64) return undefined;
    base64 = r.base64;
    mime = r.mime || "";
  }
  const path = decodeURIComponent(url.split("?")[0].split("/").pop() || "");
  const ext = (path.match(/\.(pdf|docx?|rtf|txt)$/i)?.[1] || (/word/.test(mime) ? "docx" : "pdf")).toLowerCase();
  const who = [p.personal.firstName, p.personal.lastName].filter(Boolean).join("-").replace(/[^\w-]+/g, "") || "Resume";
  const MIME: Record<string, string> = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", rtf: "application/rtf", txt: "text/plain" };
  return { fileName: `${who}-Resume.${ext}`, mime: MIME[ext] || mime || "application/pdf", base64 };
}

/* ---------------- answers: Q&A memory, then OptimHire ---------------- */

const answerCache = new Map<string, string>();

function qType(kind: ControlKind): string {
  return kind === "dropdown" || kind === "multiselect" ? "select" : kind === "checkboxGroup" ? "checkbox" : kind;
}

async function askOptimHire(questions: OpenQuestion[]): Promise<void> {
  const ask = questions.filter((q) => !answerCache.has(normalizeLabel(q.label)));
  if (!ask.length) return;
  const r = (await within(
    chrome.runtime.sendMessage({
      action: "FETCH_CUSTOM_AUTOFILL_QUESTION",
      queastions: ask.map((q) => ({ name: q.label, type: qType(q.kind), options: q.options, is_required: q.required })),
    }),
    60_000
  ).catch(() => null)) as Any;
  const list: Any[] = r?.data?.seeker?.seeker_response || [];
  for (const q of ask) {
    const n = normalizeLabel(q.label);
    const hit = list.find((x) => normalizeLabel(String(x.q ?? x.question ?? "")) === n) ??
      list.find((x) => similarity(String(x.q ?? x.question ?? ""), q.label) >= 0.85);
    const a = hit ? (Array.isArray(hit.a) ? hit.a.join(", ") : String(hit.a ?? hit.answer ?? "")).trim() : "";
    answerCache.set(n, a);
  }
}

async function hostAnswer(label: string, kind: ControlKind, options: string[]): Promise<string | null> {
  try {
    const mem = (window as Any).__ohQaLookup;
    const remembered = typeof mem === "function" ? await mem(label) : null;
    if (remembered) return String(remembered);
  } catch { /* no memory */ }
  const n = normalizeLabel(label);
  if (!answerCache.has(n)) await askOptimHire([{ label, kind, options, required: false }]);
  return answerCache.get(n) || null;
}

/* ---------------- run lifecycle ---------------- */

async function installHooks(mode: Mode): Promise<void> {
  const { complexFormData, updatedResume } = await ST.get(["complexFormData", "updatedResume"]);
  const ad = mode.auto ? parse(complexFormData).applicationDetails : undefined;
  const src = await profileSources(ad);
  // The CV on your OptimHire profile.
  const own = pick(ad?.seeker || {}, "resume") || pick(src, "resume", "resume_url", "resumeUrl", "cv_url", "cv") || (await primaryCvUrl());
  // Workday keeps your own CV (OptimHire's tailored one only when your profile has none).
  const cvUrl = own || updatedResume;
  // Your history is read from your own CV (the same every job), not a per-job tailored copy.
  const profile = await buildProfile(ad, own || cvUrl);
  let cv: Promise<StoredDoc | undefined> | null = null;
  accountNoted = false;
  setHooks({
    profile: async () => profile,
    settings: async () => (mode.assist ? ASSIST_SETTINGS() : SETTINGS),
    masterCv: () => (cv ??= fetchCv(cvUrl, profile).catch(() => undefined)),
    autoSubmit: () => mode.submit,
    ...(mode.assist ? { advance: () => false } : {}),
    prefetch: (qs) => askOptimHire(qs),
    knockout: (label, options) => {
      // Your true answers to knockout questions (assets/optimhire-patch.js, same isolated world).
      const ko = (window as unknown as { __ohKnockout?: (l: string, o: string[]) => string | null }).__ohKnockout;
      return typeof ko === "function" ? ko(label, options) : null;
    },
    answer: hostAnswer,
    onPage: (run) => onPage(mode, run),
    beforeExperience: () => within(cvReady, 30_000).then(() => undefined),
    onFinish: (run, outcome) => void finish(mode, run, outcome),
  });
}

const AUTH_PAGES: PageKind[] = ["signIn", "createAccount", "verifyEmail"];
let accountNoted = false;

function onPage(mode: Mode, run: RunState) {
  // Past the sign-in: this site has an account with the shared password.
  if (!accountNoted && !AUTH_PAGES.includes(run.page) && run.done.some((p) => p === "signIn" || p === "createAccount")) {
    accountNoted = true;
    const host = tenantHost();
    const pw = offered.get(host);
    void noteSite("account", { ...(pw ? { password: pw } : {}), tried: [], triedAt: 0 }, host);   // the password that worked is this site's
  }
  if (mode.auto && PROGRESS[run.page]) send({ type: "COMPLEX_FORM_PROGRESS", progress: PROGRESS[run.page], message: `Workday: ${PAGE_NAME[run.page]}` });
}

async function remember(run: RunState, outcome: Outcome, mode: Mode) {
  try {
    const d = await ST.get(LOG_KEY);
    const list: Any[] = Array.isArray(d[LOG_KEY]) ? d[LOG_KEY] : [];
    list.unshift({
      at: Date.now(), host: run.tenantHost, url: location.href, auto: mode.auto, outcome, page: run.page,
      reason: run.pauseReason || "", flags: run.flags.map((f) => `${f.label}: ${f.reason}`),
      log: run.log.slice(-40).map((l) => `${l.level === "info" ? "" : l.level + ": "}${l.msg}`),
    });
    await ST.set({ [LOG_KEY]: list.slice(0, 30) });
  } catch { /* storage unavailable */ }
}

/** Why a run stopped, worded for a queue or a run log rather than for someone at the page. */
function plainReason(run: RunState, outcome: Outcome): string {
  if (run.flags.length) {
    const labels = run.flags.map((f) => f.label).join("; ");
    return `${run.flags.length} question${run.flags.length === 1 ? "" : "s"} only you can answer: ${labels}`.slice(0, 240);
  }
  if (outcome === "review") return "filled, but no Submit button on Review";
  return (run.pauseReason || "").replace(/,?\s*then click Resume\.?/gi, "").replace(/\s+:/, ":").trim();
}

async function finish(mode: Mode, run: RunState, outcome: Outcome) {
  if (mode.assist) return;                 // the overlay says what it needs; nothing to report
  clearMode();
  if (mode.queue) {
    try {
      sessionStorage.setItem(QUEUE_RESULT_KEY, JSON.stringify({ jobId: mode.jobId, outcome, at: Date.now(), reason: plainReason(run, outcome) }));
    } catch { /* storage blocked */ }
  }
  say(`${outcome}${run.pauseReason ? ": " + run.pauseReason : ""}`);
  await remember(run, outcome, mode);
  const reason = run.pauseReason || "";
  if (run.page === "verifyEmail") await noteSite("verify");
  else if (outcome !== "submitted" && /sign-in was rejected|already have an account|failed twice/i.test(reason)) await noteSite("other-password", { tried: [], triedAt: Date.now() });
  if (mode.queue) return;
  if (!mode.auto) {
    send({ type: "OH_MANUAL_FILL_STATUS", state: outcome === "error" ? "error" : "done" });
    return;
  }
  if (outcome === "stopped") return;
  if (outcome === "submitted") {
    send({ type: "COMPLEX_FORM_SUCCESS", message: "Application submitted successfully", url: location.href, success_next_job: true, fromWdEngine: true });
    return;
  }
  let errorType = "failure";
  let missingQuestions: Any[] = [];
  if (/captcha/i.test(reason)) errorType = "captcha";
  else if (/no apply button|may be closed/i.test(reason)) errorType = "jobClosed";
  else if (run.flags.length) {
    errorType = "missing-questions";
    missingQuestions = run.flags.map((f) => ({ question: f.label, name: f.label, reason: f.reason }));
  } else if (outcome === "review") errorType = "submit-failed";
  send({
    type: "COMPLEX_FORM_ERROR", errorType, url: location.href, fromWdEngine: true, missingQuestions,
    message: `Workday: ${plainReason(run, outcome) || "couldn't finish"}`.slice(0, 300),
  });
}

async function startFromOptimHire(msg: Any): Promise<void> {
  if (isActive()) {                        // a new job while the last one is still going: that one ends here
    await stopRun();
    for (let i = 0; i < 50 && isActive(); i++) await new Promise((r) => setTimeout(r, 100));
  }
  const ad: Any = msg.applicationDetails || {};
  let ci: Any = msg.complexInstructions;
  if (typeof ci === "string") ci = parse(ci);
  const mode: Mode = { auto: true, submit: true, startedAt: Date.now(), jobId: String(ad.copilot_job_id || ad.application_id || "") };
  writeMode(mode);
  answerCache.clear();
  for (let i = 0; i < 40 && !hasWorkdayApp(); i++) await new Promise((r) => setTimeout(r, 500));   // the app may still be rendering
  // What OptimHire's own filler stores at this point (its error handling reads it).
  const keep: Any = ad.seeker && typeof ad.seeker === "object" ? { ...ad.seeker } : null;
  if (keep) delete keep.seeker_response;
  await ST.set({ complexFormData: { applicationDetails: ad, complexInstructions: ci, autoApplyEnabled: msg.autoApplyEnabled }, ...(keep ? { [SEEKER_KEY]: keep } : {}) });
  await ST.remove(["updatedResume", "opneResumeModel"]);
  send({ type: "COMPLEX_FORM_PROGRESS", progress: 70, message: "Workday: checking the job" });
  // OptimHire's job-closed check (it moves on by itself when closed). Sign-in is the engine's job.
  const checkCi = ci && typeof ci === "object" ? { ...ci, requiresLogin: false } : ci;
  const st = (await within(chrome.runtime.sendMessage({ type: "CHECK_APPLICATION_STATUS", complexInstructions: checkCi, applicationDetails: ad }), 30_000).catch(() => null)) as Any;
  if (st?.isJobClose) { clearMode(); say("OptimHire says the job is closed"); return; }
  if (!readMode()) { say("stopped before the form was started"); return; }
  if (toApplyManually()) return;
  await installHooks(mode);
  await startRun(null);
}

/** A link straight into "Autofill with Resume" / "Use My Last Application" (a job board's or OptimHire's
 *  apply link): open "Apply Manually" instead — once per tab; the run carries on after the reload. */
function toApplyManually(): boolean {
  const rx = /\/apply\/(autofillWithResume|useMyLastApplication)\b/i;
  if (!rx.test(location.pathname)) return false;
  try {
    if (sessionStorage.getItem("ohWdManualRedirect") === location.pathname) return false;
    sessionStorage.setItem("ohWdManualRedirect", location.pathname);
    sessionStorage.setItem("ohWdStartAfterLoad", "1"); // nothing ran yet: the run starts fresh on the new page
  } catch {
    return false;
  }
  say("this link opens Autofill with Resume / Use My Last Application — opening Apply Manually instead");
  location.replace(location.href.replace(rx, "/apply/applyManually"));
  return true;
}

/** A CSV queue job on this Workday tab: applied unattended, the result kept for the queue runner. */
async function startQueueJob(job: Any): Promise<void> {
  const id = String(job?.id || "");
  if (!id || isActive() || readMode()?.jobId === id || queueResult(id)) return;
  const mode: Mode = { auto: false, queue: true, submit: true, startedAt: Date.now(), jobId: id };
  writeMode(mode);
  answerCache.clear();
  say(`applying (CSV queue: ${String(job.title || job.url || id).slice(0, 60)})`);
  if (toApplyManually()) return;
  try {
    await installHooks(mode);
    await startRun(null);
  } catch (e) {
    clearMode();
    try { sessionStorage.setItem(QUEUE_RESULT_KEY, JSON.stringify({ jobId: id, outcome: "error", reason: (e as Error)?.message || String(e), at: Date.now() })); } catch { /* */ }
  }
}

/** "Autofill this page": the whole application, stopping on Review — or, with pageOnly, just the step on screen. */
async function startManual(submit: boolean, pageOnly = false): Promise<void> {
  if (isActive()) return;
  const mode: Mode = { auto: false, submit, assist: pageOnly, startedAt: Date.now(), jobId: "" };
  if (!pageOnly) writeMode(mode);
  send({ type: "OH_MANUAL_FILL_STATUS", state: "start" });
  await installHooks(mode);
  await startRun(null);
}

/* ---------------- wiring ---------------- */

if (TOP && isWorkdayHost()) {
  chrome.runtime.onMessage.addListener((msg: Any, _sender, reply) => {
    if (!msg) return false;
    if (msg.type === "oh:wd:start") {
      reply({ acknowledged: true });
      say(`applying (job ${msg.applicationDetails?.copilot_job_id ?? "?"})`);
      startFromOptimHire(msg).catch((e) => {
        clearMode();
        send({ type: "COMPLEX_FORM_ERROR", errorType: "failure", message: `Workday: ${(e as Error)?.message || e}`, url: location.href, fromWdEngine: true });
      });
      return false;
    }
    if (msg.type === "OH_AUTOFILL_THIS_PAGE" && hasWorkdayApp()) {
      void startManual(!!msg.submit, !!msg.pageOnly);
      return false;
    }
    // OptimHire's run stopped: its job stops too (a manual "Autofill this page" carries on).
    if (msg.type === "STOP_ALL_PROCESSES" && readMode()?.auto) {
      say("OptimHire stopped the run");
      clearMode();
      void stopRun();
    }
    return false;
  });

  /* Assist, on Review: "Submitting your application in 5…" with Cancel, then Submit. */
  const submitCountdown = (seconds = 5) => {
    if (!document.body) return;
    const host = document.createElement("div");
    host.id = "oh-wd-submit-countdown";
    host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>
      .b{font:13px/1.4 Inter,system-ui,sans-serif;display:flex;align-items:center;gap:12px;padding:12px 14px;background:#12141c;color:#e6e8ef;
         border:1px solid #262a36;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.45)}
      b{font-weight:600} button{font:600 12.5px/1 inherit;font-family:inherit;height:30px;padding:0 12px;border-radius:8px;cursor:pointer;
         background:#1a1d27;color:#e6e8ef;border:1px solid #333849} button:hover{background:#20242f}
      .now{background:#6d5efc;border-color:#6d5efc;color:#fff}</style>
      <div class="b" role="status"><span>Submitting your application in <b id="n">${seconds}</b>…</span>
      <button class="now" id="go">Submit now</button><button id="x">Cancel</button></div>`;
    document.body.appendChild(host);
    let left = seconds;
    let done = false;
    const finish = (submit: boolean) => {
      if (done) return;
      done = true;
      clearInterval(t);
      host.remove();
      if (submit) { say("assist: submitting from Review"); void startManual(true); }
      else say("assist: submit cancelled — Review is yours");
    };
    const t = window.setInterval(() => {
      left--;
      const n = root.getElementById("n");
      if (n) n.textContent = String(left);
      if (left <= 0) finish(true);
    }, 1000);
    root.getElementById("go")?.addEventListener("click", () => finish(true));
    root.getElementById("x")?.addEventListener("click", () => finish(false));
  };

  /* Assist: a new step on screen (not in a run, nothing running) is filled once. */
  const ASSIST_PAGES: PageKind[] = ["resumeUpload", "myInformation", "myExperience", "questions", "voluntaryDisclosures", "selfIdentify"];
  const assisted = new Set<string>();
  setInterval(() => {
    if (!assistOn || readMode() || isActive() || !hasWorkdayApp()) return;
    const page = detectPage();
    if (page === "review") {
      const rk = `review|${location.pathname}`;
      if (!assisted.has(rk) && !document.getElementById("oh-wd-submit-countdown")) { assisted.add(rk); submitCountdown(); }
      return;
    }
    if (!ASSIST_PAGES.includes(page)) return;
    const key = `${page}|${activeStepName()}|${location.pathname}`;
    if (assisted.has(key)) return;
    assisted.add(key);
    const mode: Mode = { auto: false, submit: false, assist: true, startedAt: Date.now(), jobId: "" };
    void installHooks(mode).then(() => startRun(null));
  }, 900);

  /* Read your CV as soon as a Workday page with the app opens (assist on), so
     your roles are ready by My Experience. Once per CV; kept after that. */
  const warmCv = (tries = 0) => {
    if (!hasWorkdayApp()) { if (tries < 40) setTimeout(() => warmCv(tries + 1), 500); return; }
    if (!assistOn && !readMode()) return;
    void (async () => {
      const src = await profileSources();
      const url = pick(src, "resume", "resume_url", "resumeUrl", "cv_url", "cv") || (await primaryCvUrl());
      const { ohWorkdayProfile } = await ST.get("ohWorkdayProfile");
      if (url && !(ohWorkdayProfile && Array.isArray(ohWorkdayProfile.work) && ohWorkdayProfile.work.length)) await cvProfileFor(url, normalizeProfile({} as Profile));
    })().catch(() => undefined);
  };
  setTimeout(() => warmCv(), 1500);

  // A run interrupted by a reload (sign-in, session refresh) carries on; nothing else starts by itself.
  const boot = (tries = 0) => {
    const mode = readMode();
    if (!mode) return;
    if (!hasWorkdayApp()) {
      if (tries < 60) setTimeout(() => boot(tries + 1), 500);
      return;
    }
    let fresh = false;
    try {
      fresh = sessionStorage.getItem("ohWdStartAfterLoad") === "1";
      sessionStorage.removeItem("ohWdStartAfterLoad");
    } catch { /* storage blocked */ }
    void installHooks(mode).then(async () => { if (fresh) await startRun(null); else await autoResume(); });
  };
  boot();
}
