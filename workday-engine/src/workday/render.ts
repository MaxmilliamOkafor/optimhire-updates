/**
 * Render a profile + tailored content into ATS-safe CV and cover-letter PDFs
 * laid out the way Workday's parser expects (standard headings, one role per
 * block, MM/YYYY dates, contact details in the body — not a header).
 */
import { heading, newPdf, paragraph, renderPdf, space } from "./pdf.js";
import { bytesToBase64 } from "./store.js";
import type { JobPosting, Profile, StoredDoc, TailoredContent, YearMonth } from "./types.js";

const HEADINGS: Record<string, { summary: string; skills: string; experience: string; education: string; certifications: string; languages: string; present: string; native: string }> = {
  en: { summary: "Summary", skills: "Skills", experience: "Experience", education: "Education", certifications: "Certifications", languages: "Languages", present: "Present", native: "Native" },
  de: { summary: "Profil", skills: "Kenntnisse", experience: "Berufserfahrung", education: "Ausbildung", certifications: "Zertifizierungen", languages: "Sprachen", present: "heute", native: "Muttersprache" },
  fr: { summary: "Profil", skills: "Compétences", experience: "Expérience professionnelle", education: "Formation", certifications: "Certifications", languages: "Langues", present: "aujourd'hui", native: "Langue maternelle" },
  es: { summary: "Perfil", skills: "Habilidades", experience: "Experiencia profesional", education: "Formación", certifications: "Certificaciones", languages: "Idiomas", present: "actualidad", native: "Nativo" },
  pt: { summary: "Perfil", skills: "Competências", experience: "Experiência profissional", education: "Formação", certifications: "Certificações", languages: "Idiomas", present: "atual", native: "Nativo" },
  it: { summary: "Profilo", skills: "Competenze", experience: "Esperienza professionale", education: "Istruzione", certifications: "Certificazioni", languages: "Lingue", present: "oggi", native: "Madrelingua" },
  nl: { summary: "Profiel", skills: "Vaardigheden", experience: "Werkervaring", education: "Opleiding", certifications: "Certificeringen", languages: "Talen", present: "heden", native: "Moedertaal" },
  pl: { summary: "Podsumowanie", skills: "Umiejętności", experience: "Doświadczenie zawodowe", education: "Wykształcenie", certifications: "Certyfikaty", languages: "Języki", present: "obecnie", native: "Ojczysty" },
};

export function headingsFor(lang: string) {
  return HEADINGS[lang] ?? HEADINGS.en;
}

export function fmtYm(ym?: YearMonth, current = false, lang = "en"): string {
  if (current) return headingsFor(lang).present;
  if (!ym) return "";
  const [y, m] = ym.split("-");
  return m ? `${m}/${y}` : y;
}

function safeName(s: string): string {
  return s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

export function docFileNames(p: Profile, job: JobPosting) {
  const who = safeName(`${p.personal.firstName}-${p.personal.lastName}`) || "Candidate";
  const role = safeName(job.title) || "Role";
  return { cv: `${who}-${role}-CV.pdf`, cl: `${who}-${role}-Cover-Letter.pdf` };
}

function contactLine(p: Profile): string {
  const { personal: me } = p;
  const phone = [me.phone.countryCode, me.phone.number].filter(Boolean).join(" ");
  const place = [me.address.city, me.address.country].filter(Boolean).join(", ");
  return [me.email, phone, place, me.linkedin, me.github, me.website].filter(Boolean).join(" | ");
}

export function renderCv(p: Profile, t: TailoredContent, job: JobPosting, lang = "en"): StoredDoc {
  const H = headingsFor(lang);
  const doc = newPdf();
  const name = `${p.personal.firstName} ${p.personal.lastName}`.trim();
  paragraph(doc, name, { size: 18, bold: true });
  paragraph(doc, contactLine(p), { size: 9.5, after: 2 });

  if (t.summary) {
    heading(doc, H.summary);
    paragraph(doc, t.summary, { size: 10 });
  }
  if (t.skills.length) {
    heading(doc, H.skills);
    paragraph(doc, t.skills.join(", "), { size: 10 });
  }
  if (p.work.length) {
    heading(doc, H.experience);
    for (const w of p.work) {
      space(doc, 4);
      paragraph(doc, `${w.title}, ${w.company}`, { size: 10.5, bold: true });
      const meta = [w.location, `${fmtYm(w.start)} – ${fmtYm(w.end, w.current, lang)}`].filter(Boolean).join(" | ");
      paragraph(doc, meta, { size: 9.5 });
      for (const b of t.roles[w.id] ?? w.bullets) paragraph(doc, b, { size: 10, bullet: true, indent: 4 });
    }
  }
  if (p.education.length) {
    heading(doc, H.education);
    for (const e of p.education) {
      space(doc, 3);
      paragraph(doc, `${e.degree}${e.field ? `, ${e.field}` : ""}`, { size: 10.5, bold: true });
      const meta = [e.school, `${fmtYm(e.start)} – ${fmtYm(e.end)}`, e.gpa ? `GPA: ${e.gpa}` : ""].filter(Boolean).join(" | ");
      paragraph(doc, meta, { size: 9.5 });
    }
  }
  if (p.certifications.length) {
    heading(doc, H.certifications);
    for (const c of p.certifications)
      paragraph(doc, [c.name, c.issuer, fmtYm(c.issued)].filter(Boolean).join(" | "), { size: 10, bullet: true });
  }
  if (p.languages.length) {
    heading(doc, H.languages);
    paragraph(doc, p.languages.map((l) => `${l.language} (${l.native ? H.native : l.proficiency})`).join(", "), { size: 10 });
  }
  const bytes = renderPdf(doc, { title: `${name} – CV – ${job.title}`, author: name });
  return { fileName: docFileNames(p, job).cv, mime: "application/pdf", base64: bytesToBase64(bytes) };
}

export function renderCoverLetter(p: Profile, letter: string, job: JobPosting, lang = "en"): StoredDoc {
  const doc = newPdf();
  const name = `${p.personal.firstName} ${p.personal.lastName}`.trim();
  paragraph(doc, name, { size: 16, bold: true });
  paragraph(doc, contactLine(p), { size: 9.5, after: 14 });
  paragraph(doc, new Date().toLocaleDateString(lang === "en" ? "en-GB" : lang, { day: "numeric", month: "long", year: "numeric" }), { size: 10.5, after: 10 });
  for (const para of letter.split(/\n{2,}/)) paragraph(doc, para.trim(), { size: 10.5, after: 8 });
  const bytes = renderPdf(doc, { title: `${name} – Cover Letter – ${job.title}`, author: name });
  return { fileName: docFileNames(p, job).cl, mime: "application/pdf", base64: bytesToBase64(bytes) };
}
