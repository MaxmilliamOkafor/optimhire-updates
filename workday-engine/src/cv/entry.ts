/**
 * assets/wd-cvtext.js — injected into a job tab on demand (oh-bg.js,
 * OH_CV_LOAD) when your CV has to be read; shares the content-script world,
 * so the Workday engine calls window.__ohCv.
 */
import { cvText } from "./cvtext.js";
import { parseCv, type CvProfile } from "./cvparse.js";
import { profileFromCv, tailoredCv, type JobText, type Person } from "./tailorcv.js";
import { coverLetterPdf } from "./coverletter.js";
import type { Profile } from "../workday/types.js";

(window as unknown as { __ohCv: unknown }).__ohCv = {
  text: cvText,
  parse: parseCv,
  async read(base64: string, mime: string) {
    const text = await cvText(base64, mime);
    return { text, profile: parseCv(text) };
  },
  /** This job's copy of your CV (a full imported profile, or your parsed CV + your details), or null. */
  tailor(input: { profile?: Profile; cv?: CvProfile; person?: Person; job: JobText }) {
    const p = input.profile ?? (input.cv ? profileFromCv(input.cv, input.person || {}) : null);
    return p ? tailoredCv(p, input.job) : null;
  },
  /** A plain-text cover letter (OptimHire's cover-letter.txt) as a PDF, or null. */
  coverLetter(input: { text: string; person?: Person; title?: string }) {
    return coverLetterPdf(input.text, input.person || {}, input.title || "");
  },
};
