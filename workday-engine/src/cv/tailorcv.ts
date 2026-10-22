/**
 * Your CV for one job (optional — Queue Manager → "Tailor CV to each job",
 * ohTailorCv): the same CV, with your skills and each role's bullets ordered
 * by how much of the job description's wording they share. Nothing is
 * reworded or added. Rendered as a one-column, real-text PDF that ATS
 * parsers read reliably (the Workday engine's renderer).
 */
import type { CvProfile } from "./cvparse.js";
import { keywordTailor } from "../workday/tailor.js";
import { renderCv } from "../workday/render.js";
import type { JobPosting, Profile, StoredDoc } from "../workday/types.js";

/** Your contact details as OptimHire keeps them (seeker / candidateDetails). */
export interface Person {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  mobile_code?: string;
  mobile_num?: string;
  city?: string;
  country?: string;
  linkedin_profile_url?: string;
  github_url?: string;
  website_url?: string;
}

export interface JobText {
  title: string;
  description: string;
  location?: string;
  url?: string;
}

/** Your CV as the renderer's profile: roles, education, skills from the CV; contact details from OptimHire. */
export function profileFromCv(cv: CvProfile, me: Person): Profile {
  const code = String(me.mobile_code || "").replace(/\D/g, "");
  const number = String(me.mobile_num || me.phone || "").trim();
  return {
    personal: {
      firstName: String(me.first_name || ""), lastName: String(me.last_name || ""), preferredName: "",
      email: String(me.email || ""),
      phone: { countryName: "", countryCode: code && !/^\+/.test(number) ? `+${code}` : "", number, deviceType: "Mobile" },
      address: { line1: "", line2: "", city: String(me.city || ""), region: "", postalCode: "", country: String(me.country || "") },
      linkedin: String(me.linkedin_profile_url || ""), website: String(me.website_url || ""), github: String(me.github_url || ""),
    },
    summary: cv.summary || "",
    skills: cv.skills || [],
    work: cv.work || [],
    education: cv.education || [],
    certifications: [],
    languages: cv.languages || [],
    answers: {},
    eeo: {},
  } as unknown as Profile;
}

/** This job's copy of your CV, or null when there is nothing to tailor (no roles, or no job description). */
export function tailoredCv(p: Profile, job: JobText): (StoredDoc & { keywords: string[] }) | null {
  const description = String(job.description || "").trim();
  if (!p.work?.length || description.length < 200) return null;
  const posting: JobPosting = {
    key: "", tenantHost: "", site: "", reqId: "", title: String(job.title || "").trim() || "Role",
    location: job.location || "", description: description.slice(0, 20000), language: "en", url: job.url || "", capturedAt: Date.now(),
  };
  const full: Profile = { ...p, certifications: p.certifications || [], languages: p.languages || [], skills: p.skills || [], education: p.education || [] };
  const t = keywordTailor(full, posting);
  const doc = renderCv(full, t, posting, "en");
  return { ...doc, keywords: t.keywords.slice(0, 10) };
}
