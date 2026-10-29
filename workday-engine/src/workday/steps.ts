/**
 * Page handlers for every Workday application step, plus the generic filler
 * that answers whatever the tenant added on top.
 */
import {
  DECLINE_RX,
  NeedsHuman,
  buttonByText,
  byAid,
  field,
  humanClick,
  isRequired,
  isVisible,
  labelOf,
  q,
  qa,
  similarity,
  sleep,
  text,
  waitFor,
  waitStable,
} from "./dom.js";
import {
  checkInGroup,
  kindOf,
  multiselectPick,
  multiselectSelected,
  optionLabel,
  optionsOf,
  readValue,
  searchVariants,
  selectDropdown,
  selectRadio,
  setCheckbox,
  setDate,
  setText,
  uploadFile,
  uploadedFileNames,
  writeValue,
} from "./controls.js";
import { eeoWanted, resolveAnswer } from "./answers.js";
import { addFlag, pace, pickCoverLetter, pickCv, type Ctx } from "./context.js";
import { sel, type AidKey } from "./selectors.js";
import type { EducationEntry, WorkEntry } from "./types.js";
import { ADD_TEXT_RX, DELETE_TEXT_RX } from "./i18n.js";
import { hooks, type OpenQuestion } from "./ohHooks.js";

/* ---------------- helpers ---------------- */

/** Containers this pass already handled, so the generic filler skips them. */
let handled = new WeakSet<HTMLElement>();

function containerOf(el: HTMLElement): HTMLElement {
  return el.closest<HTMLElement>('[data-automation-id^="formField-"]') ?? el;
}

/**
 * When a profile value has no fuzzy match among a localised form's options
 * ("Computer Science" vs "Informatik"), ask the LLM which listed option means
 * the same. Only an option that exists in the list is accepted.
 */
async function translateChoice(ctx: Ctx, c: HTMLElement, value: string): Promise<boolean> {
  // Search-box multiselects can't be enumerated up front, so only enumerable controls qualify.
  if (!ctx.settings.llmAnswers || kindOf(c) === "multiselect") return false;
  const options = (await optionsOf(c)).filter((o) => o && !/^select one$/i.test(o));
  if (!options.length) return false;
  try {
    const reply = await ctx.llm(
      `Pick the option that means the same as the given value (the form may be in another language). Return ONLY JSON {"option": string|null} with the option copied verbatim, or null if none fits.`,
      `VALUE: ${value}\nFIELD: ${labelOf(c)}\nOPTIONS: ${JSON.stringify(options.slice(0, 150))}`
    );
    const pick = (JSON.parse(reply.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { option?: string | null }).option;
    const exact = pick ? options.find((o) => o === pick || similarity(o, pick) >= 0.95) : undefined;
    if (!exact) return false;
    ctx.log(`"${value}" → "${exact}" (translated option)`);
    return writeValue(c, exact);
  } catch {
    return false;
  }
}

async function fill(ctx: Ctx, key: AidKey, value: string | undefined, root: ParentNode = document): Promise<boolean> {
  const el = field(key, root);
  if (!el) return false;
  const c = containerOf(el);
  handled.add(c);
  if (!value) return false;
  if (hooks.keepExisting?.() && readValue(kindOf(c) === "none" ? el : c)) return true; // [oh] yours stays
  await pace(ctx);
  let ok = await writeValue(kindOf(c) === "none" ? el : c, value).catch((e) => {
    if (e instanceof NeedsHuman) return false;
    throw e;
  });
  if (!ok && ["dropdown", "radio", "checkboxGroup"].includes(kindOf(c))) ok = await translateChoice(ctx, c, value);
  if (!ok) {
    const label = labelOf(c) || key;
    if (isRequired(c)) ctx.flag(label, `Couldn't set "${value}"`);
    else ctx.log(`Skipped optional "${label}" (couldn't set "${value}")`, "warn");
  }
  return ok;
}

function bulletsText(bullets: string[]): string {
  return bullets.map((b) => `• ${b.replace(/^[•\-*]\s*/, "")}`).join("\n");
}

/** Find a section (Work Experience, Education…) by automation id or heading text. */
function section(key: AidKey, heading: RegExp): HTMLElement | null {
  const byId = byAid(key);
  if (byId) return byId;
  const h = qa("h2, h3, h4, legend, [role='heading']").find((e) => isVisible(e) && heading.test(text(e)));
  return h ? h.closest<HTMLElement>("section, fieldset, [role='group'], div[data-automation-id]") ?? h.parentElement : null;
}

/** Repeated blocks in a section: the smallest ancestors that each hold one `anchor` field. */
function blocks(sectionEl: HTMLElement, anchor: AidKey): HTMLElement[] {
  // A field matches both as its formField container and as its input; keep the outermost only.
  const all = qa(sel(anchor), sectionEl).filter(isVisible);
  const anchors = all.filter((a) => !all.some((o) => o !== a && o.contains(a)));
  const count = (el: HTMLElement) => anchors.filter((a) => el.contains(a)).length;
  const out: HTMLElement[] = [];
  for (const a of anchors) {
    let b: HTMLElement = a;
    while (b.parentElement && b.parentElement !== sectionEl && count(b.parentElement) === 1) b = b.parentElement;
    if (!out.includes(b)) out.push(b);
  }
  return out;
}

function addButton(sectionEl: HTMLElement): HTMLElement | null {
  return (
    qa(sel("addButton"), sectionEl).filter(isVisible).pop() ??
    buttonByText(ADD_TEXT_RX, sectionEl)
  );
}

async function ensureBlockCount(ctx: Ctx, sectionEl: HTMLElement, anchor: AidKey, n: number): Promise<HTMLElement[]> {
  let bs = blocks(sectionEl, anchor);
  // Remove extra blocks (e.g. ones the resume parser invented), last first.
  while (bs.length > n) {
    const last = bs[bs.length - 1];
    const del = qa(sel("deleteBlock"), last).find(isVisible) ?? buttonByText(DELETE_TEXT_RX, last);
    if (!del) break;
    await humanClick(del);
    await sleep(300);
    await waitStable(300, 5000);
    bs = blocks(sectionEl, anchor);
  }
  for (let guard = 0; bs.length < n && guard < n + 2; guard++) {
    const add = addButton(sectionEl);
    if (!add) {
      ctx.flag(text(sectionEl.querySelector("h2,h3,h4,legend")) || anchor, "No Add button found");
      break;
    }
    const before = bs.length;
    await humanClick(add);
    const grew = () => blocks(sectionEl, anchor).length > before;
    // Workday can swallow the synthetic click (focus change re-renders the form):
    // re-find "Add Another" and click it natively until the new entry appears.
    let ok = await waitFor(grew, 2500).then(() => true, () => false);
    for (let attempt = 0; !ok && attempt < 3; attempt++) {
      await waitStable(200, 4000);
      const fresh = addButton(sectionEl);
      if (!fresh) break;
      fresh.scrollIntoView({ block: "center" });
      await sleep(120);
      fresh.click();
      ok = await waitFor(grew, 3500).then(() => true, () => false);
    }
    await waitStable(200, 3000);
    bs = blocks(sectionEl, anchor);
  }
  return bs;
}

/**
 * [oh] Unattended, with no history of this kind in the profile: remove the entries the CV parser
 * left that Workday would reject (a required field empty), rather than stop on them.
 */
async function pruneIncomplete(ctx: Ctx, sectionEl: HTMLElement, anchor: AidKey): Promise<void> {
  for (let guard = 0; guard < 12; guard++) {
    const bad = blocks(sectionEl, anchor)
      .filter((b) => qa('[data-automation-id^="formField-"]', b).some((c) => isVisible(c) && isRequired(c) && kindOf(c) !== "none" && !readValue(c)))
      .pop();
    if (!bad) return;
    const del = qa(sel("deleteBlock"), bad).find(isVisible) ?? buttonByText(DELETE_TEXT_RX, bad);
    if (!del) return;
    const what = qa('[data-automation-id^="formField-"]', bad).map(readValue).find(Boolean) || "untitled";
    ctx.log(`Removed an incomplete entry the CV parser left: ${what.slice(0, 40)}`);
    await humanClick(del);
    await sleep(300);
    await waitStable(300, 5000);
  }
}

/**
 * [oh] The most recent role with a start date and no end date is the one you are in now: tick
 * "I currently work here" (Workday then drops the end date it was asking for). Whoever filled
 * the role — this engine, Workday's CV parse or another filler.
 */
async function markCurrentRole(ctx: Ctx, sectionEl: HTMLElement): Promise<void> {
  const first = blocks(sectionEl, "jobTitleF")[0];
  if (!first) return;
  const box = field("currentlyF", first);
  if (!box) return;
  const c = containerOf(box);
  if (readValue(c) === "true") return;
  const start = dateContainer(first, "start");
  const end = dateContainer(first, "end");
  if (!start || !readValue(start) || (end && readValue(end))) return;
  handled.add(c);
  if (await setCheckbox(c, true)) {
    ctx.log('Ticked "I currently work here" on your most recent role (it has no end date)');
    if (end) handled.add(end);
    await waitStable(300, 4000);
  }
}

function dateContainer(block: HTMLElement, which: "start" | "end"): HTMLElement | null {
  const byId = which === "start" ? field("startDateF", block) : field("endDateF", block);
  if (byId) return containerOf(byId);
  const rx =
    which === "start"
      ? /^(from|start|first year|von|beginn|de$|du|début|desde|inicio|início|da$|dal|inizio|van|begin|od|開始|开始)/iu
      : /^(to|end|last year|graduation|bis|ende|à$|au|fin|hasta|até|término|a$|al|fine|tot|eind|do|終了|结束)/iu;
  return qa('[data-automation-id^="formField-"]', block).find((c) => isVisible(c) && rx.test(labelOf(c)) && kindOf(c) === "date") ?? null;
}

/* ---------------- My Information ---------------- */

export async function myInformation(ctx: Ctx): Promise<void> {
  const me = ctx.profile.personal;
  const sourceEl = field("source");
  if (sourceEl) {
    const c = containerOf(sourceEl);
    handled.add(c);
    const want = ctx.profile.answers.source;
    if (!readValue(c) && want) {
      await pace(ctx);
      let ok = (await multiselectPick(c, want)) || (await selectDropdown(c, want));
      // Folder-style lists (Mastercard, Workday): the site sits under a category — open it, then
      // pick the site; else the category itself ("LinkedIn, else Job Board").
      for (const folder of ["Social Media", "Social Network", "Job Board", "Online Job Board", "Internet", "Website"]) {
        if (ok) break;
        if (kindOf(c) === "multiselect" && (await multiselectPick(c, folder, { min: 0.7 }))) {
          ok = true;
          break;
        }
        ok = await selectDropdown(c, folder, 0.7);
      }
      if (ok) ctx.log(`How did you hear → ${readValue(c) || want}`);
      else if (isRequired(c)) ctx.flag(labelOf(c) || "How did you hear about us", `No option like "${want}"`);
    }
  }
  const prev = field("previousWorker");
  if (prev) {
    const c = containerOf(prev);
    handled.add(c);
    if (!readValue(c)) await selectRadio(c, ctx.profile.answers.previouslyWorkedHere ? "Yes" : "No");
  }

  // Country first: it re-renders the address and phone fields. Some tenants pre-select
  // "United States of America": a different country is corrected even when existing values are kept.
  const countryEl = field("country");
  const shown = countryEl ? readValue(containerOf(countryEl)) : "";
  if (countryEl && shown && me.address.country && similarity(shown, me.address.country) < 0.85) {
    const c = containerOf(countryEl);
    handled.add(c);
    await pace(ctx);
    if (await writeValue(c, me.address.country).catch(() => false)) {
      ctx.log(`Country was "${shown}" — set to ${me.address.country}`);
      await waitStable(500, 8000);
    } else if (isRequired(c)) ctx.flag(labelOf(c) || "Country", `Shows "${shown}", couldn't set "${me.address.country}"`);
  } else if (await fill(ctx, "country", me.address.country)) await waitStable(500, 8000);

  await fill(ctx, "firstName", me.firstName);
  await fill(ctx, "lastName", me.lastName);
  if (me.preferredName && me.preferredName !== me.firstName) {
    const box = field("preferredCheck");
    if (box && (await setCheckbox(box, true))) {
      await waitStable(300, 4000);
      await fill(ctx, "preferredFirst", me.preferredName);
    }
  }
  await fill(ctx, "address1", me.address.line1);
  await fill(ctx, "address2", me.address.line2);
  await fill(ctx, "city", me.address.city);
  await fill(ctx, "region", me.address.region);
  await fill(ctx, "postal", me.address.postalCode);

  await fill(ctx, "phoneType", me.phone.deviceType || "Mobile");
  const code = field("phoneCode");
  if (code) {
    const c = containerOf(code);
    handled.add(c);
    const want = me.phone.countryName || me.address.country;
    if (want && !multiselectSelected(c).some((s) => similarity(want, s) >= 0.6)) {
      await pace(ctx);
      const ok = (await multiselectPick(c, want)) || (me.phone.countryCode ? await multiselectPick(c, me.phone.countryCode) : false);
      if (!ok) ctx.flag("Country Phone Code", `No option like "${want}"`);
    }
  }
  // Workday wants the national number: no country code, no spaces, no leading 0 (874261508 with +353).
  const dial = me.phone.countryCode.replace(/\D/g, "");
  let national = me.phone.number.replace(/\D/g, "");
  if (dial && me.phone.number.trim().startsWith("+") && national.startsWith(dial)) national = national.slice(dial.length);
  await fill(ctx, "phoneNumber", national.replace(/^0+/, ""));
  const email = field("email");
  if (email && !readValue(containerOf(email))) await fill(ctx, "email", me.email);
}

/* ---------------- My Experience ---------------- */

async function fillWork(ctx: Ctx, block: HTMLElement, w: WorkEntry) {
  await fill(ctx, "jobTitleF", w.title, block);
  await fill(ctx, "companyF", w.company, block);
  await fill(ctx, "locationF", w.location, block);
  const cur = field("currentlyF", block);
  if (cur) {
    handled.add(containerOf(cur));
    await setCheckbox(containerOf(cur), w.current);
    await waitStable(250, 3000);
  }
  const start = dateContainer(block, "start");
  if (start && w.start) {
    handled.add(start);
    if (!(await setDate(start, w.start))) ctx.flag(`${w.company} start date`, "Date didn't stick");
  }
  if (!w.current && w.end) {
    const end = dateContainer(block, "end");
    if (end) {
      handled.add(end);
      if (!(await setDate(end, w.end))) ctx.flag(`${w.company} end date`, "Date didn't stick");
    }
  }
  const bullets = ctx.docs?.tailored?.roles[w.id] ?? w.bullets;
  await fill(ctx, "descriptionF", bulletsText(bullets), block);
}

async function fillEducation(ctx: Ctx, block: HTMLElement, e: EducationEntry) {
  const school = field("schoolF", block);
  if (school) {
    const c = containerOf(school);
    handled.add(c);
    await pace(ctx);
    let ok = await writeValue(c, e.school);
    if (!ok && kindOf(c) === "multiselect") {
      for (const other of ["Other", "Andere", "Sonstige", "Autre", "Otro", "Outro", "Altro", "Overig", "Inne"]) if ((ok = await multiselectPick(c, other, { min: 0.8 }))) break;
    }
    if (!ok) ctx.flag(`School: ${e.school}`, "Not in the tenant's school list");
  }
  await fill(ctx, "degreeF", e.degree, block);
  const fos = field("fieldF", block);
  if (fos && e.field) {
    const c = containerOf(fos);
    handled.add(c);
    await pace(ctx);
    const ok = await writeValue(c, e.field);
    if (!ok) ctx.log(`Field of study "${e.field}" not in this form's list — left for you`, "warn");
  }
  await fill(ctx, "gpaF", e.gpa, block);
  const start = dateContainer(block, "start");
  if (start && e.start) {
    handled.add(start);
    await setDate(start, e.start);
  }
  const end = dateContainer(block, "end");
  if (end && e.end) {
    handled.add(end);
    await setDate(end, e.end);
  }
}

async function uploadDocuments(ctx: Ctx) {
  const inputs = qa<HTMLInputElement>(sel("fileInput") + ', input[type="file"]');
  if (!inputs.length) return;
  const cv = pickCv(ctx);
  const cl = pickCoverLetter(ctx);
  const labelFor = (i: HTMLInputElement) => labelOf(containerOf(i)) || text(i.closest("section, fieldset")?.querySelector("h2,h3,h4,legend"));
  const clInput = inputs.find((i) => /cover/i.test(labelFor(i)));
  const cvInput = inputs.find((i) => i !== clInput && /resume|cv|attach/i.test(labelFor(i) + " resume")) ?? inputs[0];

  if (cv && cvInput) {
    const root = cvInput.closest("section, fieldset, [data-automation-id^='formField-']") ?? document;
    const names = uploadedFileNames(root);
    if ((hooks.keepExisting?.() || (hooks.advance && !hooks.advance())) && names.length) {
      handled.add(containerOf(cvInput)); // [oh] assist: a CV already attached (yours) is left as it is
    } else if (!names.some((n) => n.includes(cv.name.slice(0, 12)))) {
      // Remove whatever the resume step / last application left behind.
      for (const del of qa(sel("fileDelete"), root).filter(isVisible)) {
        await humanClick(del);
        await sleep(300);
      }
      ctx.log(`Uploading CV: ${cv.name}`);
      if (!(await uploadFile(cvInput, cv))) ctx.flag("Resume/CV", "Upload didn't confirm");
      await waitStable(400, 10000);
    }
    handled.add(containerOf(cvInput));
  } else if (!cv && cvInput && !uploadedFileNames().length) {
    ctx.flag("Resume/CV", "No CV available — attach one in the side panel or set a master CV");
  }

  if (cl) {
    const target = clInput ?? (cvInput?.multiple ? cvInput : null);
    if (target && !uploadedFileNames().some((n) => n.includes(cl.name.slice(0, 12)))) {
      ctx.log(`Uploading cover letter: ${cl.name}`);
      await uploadFile(target, cl);
      await waitStable(400, 10000);
    }
  }
}

/** Entries Workday emptied again (a re-render after "Add Another"): filled once more, twice at most. */
async function verifyBlocks<T>(ctx: Ctx, sectionEl: HTMLElement, anchor: AidKey, items: T[], fillFn: (ctx: Ctx, block: HTMLElement, item: T) => Promise<void>) {
  for (let pass = 0; pass < 2; pass++) {
    await waitStable(150, 2000);
    const bs = await ensureBlockCount(ctx, sectionEl, anchor, items.length);
    let fixed = 0;
    for (let i = 0; i < Math.min(bs.length, items.length); i++) {
      const a = field(anchor, bs[i]);
      if (a && readValue(containerOf(a))) continue;
      await fillFn(ctx, bs[i], items[i]);
      fixed++;
    }
    if (!fixed) return;
    ctx.log(`Re-filled ${fixed} ${anchor === "jobTitleF" ? "work" : "education"} entr(ies) that came back empty`, "warn");
  }
}

export async function myExperience(ctx: Ctx): Promise<void> {
  await hooks.beforeExperience?.(); // [oh]
  const p = ctx.profile;

  const work = section("workSection", /work experience|employment history|berufserfahrung|expérience professionnelle|experiencia (laboral|profesional)|experiência profissional|esperienza (lavorativa|professionale)|werkervaring|doświadczenie zawodowe|職歴|工作经历/iu);
  if (work && p.work.length) {
    const bs = await ensureBlockCount(ctx, work, "jobTitleF", p.work.length);
    for (let i = 0; i < Math.min(bs.length, p.work.length); i++) await fillWork(ctx, bs[i], p.work[i]);
    await verifyBlocks(ctx, work, "jobTitleF", p.work, fillWork);
    ctx.log(`Work experience: ${p.work.length} role(s) filled`);
    await markCurrentRole(ctx, work); // [oh]
  } else if (work) {
    await markCurrentRole(ctx, work); // [oh] before anything is judged incomplete
    if (hooks.autoSubmit?.()) await pruneIncomplete(ctx, work, "jobTitleF"); // [oh]
  }

  const edu = section("eduSection", /^(education|ausbildung|bildung|formation|educación|formación|educação|formação|istruzione|formazione|opleiding|wykształcenie|学歴|教育)/iu);
  if (edu && p.education.length) {
    const anchor: AidKey = q(sel("schoolF"), edu) ? "schoolF" : "degreeF";
    const bs = await ensureBlockCount(ctx, edu, anchor, p.education.length);
    for (let i = 0; i < Math.min(bs.length, p.education.length); i++) await fillEducation(ctx, bs[i], p.education[i]);
    await verifyBlocks(ctx, edu, anchor, p.education, fillEducation);
    ctx.log(`Education: ${p.education.length} entr(ies) filled`);
  } else if (edu && hooks.autoSubmit?.()) {
    await pruneIncomplete(ctx, edu, q(sel("schoolF"), edu) ? "schoolF" : "degreeF"); // [oh]
  }

  const certs = section("certSection", /certification|licen[cs]e|zertifizierung|zertifikat|certificaci|certificaç|certificazion|certificering|certyfikat|資格|证书/iu);
  if (certs && p.certifications.length && q(sel("certNameF"), certs)) {
    const bs = await ensureBlockCount(ctx, certs, "certNameF", p.certifications.length);
    for (let i = 0; i < Math.min(bs.length, p.certifications.length); i++) {
      const c = p.certifications[i];
      await fill(ctx, "certNameF", c.name, bs[i]);
      const dates = qa('[data-automation-id^="formField-"]', bs[i]).filter((x) => kindOf(x) === "date");
      if (dates[0] && c.issued) await setDate(dates[0], c.issued);
      if (dates[1] && c.expires) await setDate(dates[1], c.expires);
    }
  }

  const langs = section("langSection", /^(languages?|sprachen?|langues?|idiomas?|lingue|talen|języki|語学|语言)/iu);
  if (langs && p.languages.length && q(sel("langF"), langs)) {
    const bs = await ensureBlockCount(ctx, langs, "langF", p.languages.length);
    for (let i = 0; i < Math.min(bs.length, p.languages.length); i++) {
      const l = p.languages[i];
      await fill(ctx, "langF", l.language, bs[i]);
      const native = field("nativeF", bs[i]);
      if (native) await setCheckbox(containerOf(native), l.native);
      // Reading / writing / speaking proficiency dropdowns.
      for (const c of qa('[data-automation-id^="formField-"]', bs[i])) {
        if (handled.has(c) || kindOf(c) !== "dropdown" || !/proficien|reading|writing|speaking|comprehension|overall|kenntnis|niveau|nivel|nível|livello|lesen|schreiben|sprechen|lecture|écriture|oral|lectura|escritura|conversación|leitura|escrita|lettura|scrittura|lezen|schrijven|spreken|poziom/iu.test(labelOf(c))) continue;
        handled.add(c);
        await selectDropdown(c, l.native ? "Native" : l.proficiency, 0.5).then((ok) => ok || selectDropdown(c, "Fluent", 0.5)).then((ok) => ok || selectDropdown(c, "Advanced", 0.5));
      }
    }
  }

  const skillsEl = field("skills");
  if (skillsEl) {
    const c = containerOf(skillsEl);
    handled.add(c);
    const list = (ctx.docs?.tailored?.skills ?? p.skills).slice(0, ctx.settings.maxSkills);
    let added = 0;
    for (const s of list) {
      if (multiselectSelected(c).some((x) => similarity(x, s) >= 0.85)) continue;
      await pace(ctx);
      // A slow or empty result list: try the shorter forms (AWS for "Amazon Web Services (AWS)").
      for (const v of searchVariants(s)) {
        if (await multiselectPick(c, v, { min: 0.75 })) {
          added++;
          break;
        }
      }
    }
    ctx.log(`Skills: ${added} added`);
  }

  await uploadDocuments(ctx);

  const sites = [p.personal.website, p.personal.github].filter(Boolean);
  const web = section("webSection", /^(websites?|webseiten?|sites? web|sitios web|sites|siti web|websites?|strony)/iu);
  if (web && sites.length) {
    const bs = await ensureBlockCount(ctx, web, "urlF", sites.length);
    for (let i = 0; i < Math.min(bs.length, sites.length); i++) await fill(ctx, "urlF", sites[i], bs[i]);
  }
  await fill(ctx, "linkedin", p.personal.linkedin);
}

/* ---------------- Resume upload (Autofill with Resume) ---------------- */

export async function resumeUpload(ctx: Ctx): Promise<void> {
  const input = byAid("fileInput") ?? q<HTMLInputElement>('input[type="file"]');
  const cv = pickCv(ctx);
  if (!input) return;
  if (!cv) throw new NeedsHuman("No CV to upload. Attach one for this job in the side panel (or set a master CV), then click Resume.");
  if (!uploadedFileNames().some((n) => n.includes(cv.name.slice(0, 12)))) {
    ctx.log(`Uploading CV for autofill: ${cv.name}`);
    if (!(await uploadFile(input, cv))) throw new NeedsHuman("CV upload didn't confirm. Upload it yourself, then click Resume.");
  }
  // Workday parses the file; give it time before Continue.
  await waitStable(1200, 30000);
}

/* ---------------- Voluntary Disclosures ---------------- */

async function eeo(ctx: Ctx, key: AidKey, pref: string, label: string) {
  const el = field(key);
  if (!el) return;
  const c = containerOf(el);
  handled.add(c);
  if (readValue(c)) return;
  const wanted = eeoWanted(pref);
  await pace(ctx);
  let ok: boolean;
  if (kindOf(c) === "multiselect") {
    ok = false;
    for (const qy of wanted === "decline" ? ["decline", "not wish", "prefer not", "do not want"] : [wanted]) {
      if ((ok = await multiselectPick(c, qy, { min: 0.5 }))) break;
    }
  } else {
    ok = await writeValue(c, wanted);
  }
  if (!ok && isRequired(c)) ctx.flag(label, `Couldn't pick "${wanted === "decline" ? "decline to answer" : wanted}"`);
}

export async function voluntaryDisclosures(ctx: Ctx): Promise<void> {
  const e = ctx.profile.eeo;
  await eeo(ctx, "gender", e.gender, "Gender");
  await eeo(ctx, "hispanic", e.hispanicOrLatino, "Hispanic or Latino");
  await eeo(ctx, "ethnicity", e.ethnicity, "Ethnicity");
  await eeo(ctx, "veteran", e.veteran, "Veteran status");
  const terms = field("agreement");
  if (terms) {
    const c = containerOf(terms);
    handled.add(c);
    if (ctx.settings.consentDisclosureTerms) await setCheckbox(c, true);
    else if (readValue(c) !== "true") ctx.flag("Terms and conditions", "Your consent is required — tick it yourself or allow it once in settings");
  }
  // Other REQUIRED consent ticks on this page ("Yes, I have read and acknowledge … Candidate Privacy
  // Statement", "I have read and consent to the above terms"). Optional opt-ins stay unticked.
  for (const c of qa('[data-automation-id^="formField-"]').filter(isVisible)) {
    if (handled.has(c) || kindOf(c) !== "checkbox" || !isRequired(c) || readValue(c) === "true") continue;
    const label = labelOf(c) || text(c);
    if (!CONSENT_RX.test(label) || /marketing|newsletter|talent community|job alerts?|future (vacancies|opportunities)|text message|sms/i.test(label)) continue;
    handled.add(c);
    if (!ctx.settings.consentDisclosureTerms) {
      ctx.flag(label.slice(0, 80), "Your consent is required — tick it yourself or allow it once in settings");
      continue;
    }
    if (await setCheckbox(c, true)) ctx.log(`Ticked required consent: ${label.slice(0, 80)}`);
    else ctx.flag(label.slice(0, 80), "Couldn't tick the required consent box");
  }
}

const CONSENT_RX = /i have read|acknowledge|consent|i agree|i accept|privacy (statement|notice|policy)|terms and conditions|ich (habe|stimme|akzeptiere)|j'ai lu|j'accepte|he leído|acepto|li e (aceito|concordo)|ho letto|accetto|ik heb gelezen|ik ga akkoord|przeczytałem|akceptuję/iu;

/* ---------------- Self Identify (disability, CC-305) ---------------- */

export async function selfIdentify(ctx: Ctx): Promise<void> {
  const name = `${ctx.profile.personal.firstName} ${ctx.profile.personal.lastName}`.trim();
  await fill(ctx, "selfIdName", name);
  const dateEl = field("selfIdDate") ?? q('[id$="dateSignedOn-dateSectionMonth-input"], [id$="dateSignedOn-dateSectionYear-input"]');
  if (dateEl) {
    const c = containerOf(dateEl);
    handled.add(c);
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0"), yyyy = String(d.getFullYear());
    const iso = `${yyyy}-${mm}-${dd}`;
    // Today's date, checked segment by segment (a value Workday reverted counts as not set).
    const seg = (s: AidKey) => (q<HTMLInputElement>(sel(s), c)?.value || "").replace(/^0+/, "");
    const isToday = () => seg("dateMonth") === String(+mm) && (!q(sel("dateDay"), c) || seg("dateDay") === String(+dd)) && seg("dateYear") === yyyy;
    for (let i = 0; i < 2 && !isToday(); i++) await setDate(c, iso);
    if (!isToday()) ctx.flag("Self-identification date", `Couldn't set today's date (${mm}/${dd}/${yyyy})`);
  }
  const dis = field("disability");
  if (dis) {
    const c = containerOf(dis);
    handled.add(c);
    const pref = ctx.profile.eeo.disability;
    const wanted = pref === "yes" ? "Yes, I have a disability, or have had one in the past" : pref === "no" ? "No, I do not have a disability and have not had one in the past" : "decline";
    // Untick anything already ticked that isn't the saved choice (only one box may be checked).
    for (const b of qa('input[type="checkbox"], [role="checkbox"]', c)) {
      const on = (b as HTMLInputElement).checked || b.getAttribute("aria-checked") === "true";
      const l = optionLabel(b);
      const right = wanted === "decline" ? DECLINE_RX.test(l) : similarity(wanted, l) >= 0.85;
      if (on && !right) await setCheckbox(b, false);
    }
    const ok = (await checkInGroup(c, wanted)) || (await selectRadio(c, wanted));
    if (!ok) ctx.flag("Disability status", "Couldn't select your saved choice");
  }
}

/* ---------------- Generic filler (any page) ---------------- */

export async function genericFill(ctx: Ctx): Promise<void> {
  const containers = qa('[data-automation-id^="formField-"]').filter(isVisible);
  const optionsCache = new Map<HTMLElement, string[]>();
  // [oh] Let the host fetch answers for the whole page in one request first.
  if (hooks.prefetch) {
    const open: OpenQuestion[] = [];
    for (const c of containers) {
      if (handled.has(c) || containers.some((o) => o !== c && o.contains(c) && handled.has(o))) continue;
      const kind = kindOf(c);
      const label = labelOf(c);
      if (kind === "none" || kind === "file" || !label || readValue(c)) continue;
      const options = await optionsOf(c);
      optionsCache.set(c, options);
      open.push({ label, kind, options, required: isRequired(c) });
    }
    if (open.length) await hooks.prefetch(open).catch(() => {});
  }
  for (const c of containers) {
    if (handled.has(c)) continue;
    // Skip containers nested inside one we already handled.
    if (containers.some((o) => o !== c && o.contains(c) && handled.has(o))) continue;
    handled.add(c);
    const kind = kindOf(c);
    if (kind === "none" || kind === "file") continue;
    if (readValue(c)) continue;
    const label = labelOf(c);
    if (!label) continue;
    const required = isRequired(c);
    const options = optionsCache.get(c) ?? (await optionsOf(c));
    const ans = await resolveAnswer(label, kind, options, ctx, ctx.llm);
    if (!ans) {
      if (required) ctx.flag(label, "Needs your answer");
      continue;
    }
    await pace(ctx);
    const ok = await writeValue(c, ans.answer).catch(() => false);
    if (ok) {
      if (ans.source === "llm") ctx.run.llmFilled.push({ label, answer: ans.answer });
      ctx.log(`${label} → ${ans.answer.slice(0, 60)} (${ans.source})`);
    } else if (required) {
      ctx.flag(label, `Couldn't set "${ans.answer.slice(0, 40)}"`);
    }
  }
}

/* ---------------- Review ---------------- */

export function reviewDiff(ctx: Ctx): string[] {
  const body = text(document.body).toLowerCase();
  const p = ctx.profile;
  const expect = [
    p.personal.firstName,
    p.personal.lastName,
    p.personal.email,
    ...p.work.map((w) => w.company),
    ...p.work.map((w) => w.title),
    ...p.education.map((e) => e.school),
  ].filter(Boolean);
  return expect.filter((v) => !body.includes(v.toLowerCase()));
}

export function highlightSubmit(btn: HTMLElement) {
  btn.style.outline = "3px solid #c79a6a";
  btn.style.outlineOffset = "3px";
  btn.scrollIntoView({ block: "center" });
}

/** Re-try an errored field from the error banner link. */
export async function fixFieldFromError(ctx: Ctx, link: HTMLElement): Promise<boolean> {
  await humanClick(link);
  await sleep(300);
  const active = document.activeElement as HTMLElement | null;
  const c = active?.closest<HTMLElement>('[data-automation-id^="formField-"]');
  if (!c) return false;
  handled.delete(c);
  const label = labelOf(c);
  const ans = await resolveAnswer(label, kindOf(c), await optionsOf(c), ctx, ctx.llm);
  if (!ans) {
    addFlag(ctx.run, { label, reason: "Workday reported an error here", page: ctx.page });
    return false;
  }
  return writeValue(c, ans.answer).catch(() => false);
}

/** Forget handled containers (new page, or resuming after the user edited fields). */
export function resetHandled() {
  handled = new WeakSet<HTMLElement>();
}
