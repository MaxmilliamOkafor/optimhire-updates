/**
 * Built-in JD tailoring — [oh] the keyword mode only: no model, nothing
 * rewritten or added; your bullets and skills are reordered by how much of the
 * job description's wording they share. (The standalone extension's model
 * mode needs its own API and stays there.)
 */
import type { JobPosting, Profile, TailoredContent } from "./types.js";
import { STOPWORDS as STOP } from "./i18n.js";

function tokens(s: string): string[] {
  return s
    .replace(/[^\p{L}\p{N}_+#./ -]+/gu, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^[./-]+|[./-]+$/g, ""))
    .filter((t) => t.length > 1);
}

/** Top JD keywords: technical-looking terms and repeated 1–3 word phrases. */
export function extractKeywords(jd: string, limit = 40): string[] {
  const toks = tokens(jd);
  const counts = new Map<string, number>();
  const bump = (k: string, w: number) => counts.set(k, (counts.get(k) ?? 0) + w);
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const lower = t.toLowerCase();
    if (STOP.has(lower)) continue;
    // Acronyms / CamelCase / C++ / Node.js look technical; German capitalises every noun, so don't count a lone capital.
    const technical = /\p{Lu}.*\p{Lu}|[+#.]|\d/u.test(t) || /^\p{Lu}\p{Ll}+\p{Lu}/u.test(t);
    bump(lower, technical ? 2 : 1);
    const t2 = toks[i + 1];
    if (t2 && !STOP.has(t2.toLowerCase())) bump(`${lower} ${t2.toLowerCase()}`, 1.5);
  }
  return [...counts.entries()]
    .filter(([k, v]) => v >= 2 && k.length > 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k);
}

/** Language-independent terms (acronyms, CamelCase, C++, Node.js, versions) — safe to check across translation. */
export function technicalTerms(jd: string): string[] {
  const out = new Set<string>();
  for (const t of tokens(jd)) {
    if (/\p{Lu}.*\p{Lu}|[+#]|\.\p{L}|\d/u.test(t) || /^\p{Lu}\p{Ll}+\p{Lu}/u.test(t)) out.add(t.toLowerCase());
  }
  return [...out];
}

function score(text: string, kws: string[]): number {
  const t = text.toLowerCase();
  return kws.reduce((s, k, i) => (t.includes(k) ? s + (kws.length - i) : s), 0);
}

export function keywordTailor(p: Profile, job: JobPosting, baseLetter = "", _lang = "en"): TailoredContent {
  const kws = extractKeywords(`${job.title}\n${job.description}`);
  const roles: Record<string, string[]> = {};
  for (const w of p.work) roles[w.id] = [...w.bullets].sort((a, b) => score(b, kws) - score(a, kws));
  const skills = [...p.skills].sort((a, b) => score(b, kws) - score(a, kws));
  const name = `${p.personal.firstName} ${p.personal.lastName}`.trim();
  const coverLetter =
    baseLetter.trim() ||
    `Dear Hiring Team,\n\nI am applying for the ${job.title} role (${job.reqId}). ${p.summary}\n\nIn my recent work as ${p.work[0]?.title ?? "a professional"} at ${p.work[0]?.company ?? "my current company"}, ${(roles[p.work[0]?.id ?? ""] ?? [])[0] ?? ""}\n\nI would welcome the chance to discuss how I can contribute.\n\nSincerely,\n${name}`;
  return { summary: p.summary, skills, roles, coverLetter, keywords: kws, warnings: [], method: "keyword" };
}
