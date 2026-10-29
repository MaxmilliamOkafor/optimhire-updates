/**
 * A cover letter that arrives as plain text — OptimHire writes one per job and uploads
 * it as "cover-letter.txt" (the file is named after its link) — as a PDF: your name and
 * contact line on top (unless the letter already starts with them), then the letter as
 * written. Same one-column, real-text renderer as the CVs.
 */
import { newPdf, paragraph, renderPdf } from "../workday/pdf.js";
import { bytesToBase64 } from "../workday/store.js";
import type { StoredDoc } from "../workday/types.js";
import type { Person } from "./tailorcv.js";

function safeName(s: string): string {
  return s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

export function coverLetterPdf(text: string, me: Person, title = ""): StoredDoc | null {
  const letter = String(text || "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (letter.length < 40) return null;
  const name = [me.first_name, me.last_name].map((v) => String(v || "").trim()).filter(Boolean).join(" ");
  const doc = newPdf();
  if (name && !letter.slice(0, 200).toLowerCase().includes(name.toLowerCase())) {
    const code = String(me.mobile_code || "").replace(/\D/g, "");
    const num = String(me.mobile_num || "").trim();
    const phone = num ? `${code ? "+" + code + " " : ""}${num}` : String(me.phone || "").trim();
    const place = [me.city, me.country].map((v) => String(v || "").trim()).filter(Boolean).join(", ");
    paragraph(doc, name, { size: 16, bold: true });
    paragraph(doc, [me.email, phone, place, me.linkedin_profile_url].filter(Boolean).join(" | "), { size: 9.5, after: 14 });
  }
  for (const para of letter.split(/\n{2,}/)) paragraph(doc, para.trim(), { size: 10.5, after: 8 });
  const role = safeName(String(title || ""));
  const bytes = renderPdf(doc, { title: `${name || "Cover Letter"} – Cover Letter${title ? " – " + title : ""}`, author: name });
  return { fileName: `${safeName(name) || "Candidate"}-${role ? role + "-" : ""}Cover-Letter.pdf`, mime: "application/pdf", base64: bytesToBase64(bytes) };
}
