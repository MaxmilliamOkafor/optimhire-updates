/**
 * Dependency-free PDF writer for ATS-safe documents: one column, real text
 * (Helvetica, WinAnsi), no images/tables — exactly what Workday's resume
 * parser reads best.
 */

// Helvetica advance widths (1/1000 em) for ASCII 32..126, from the standard AFM.
const HELV = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833,
  722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556,
  556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334,
  260, 334, 584,
];

/** Unicode → WinAnsi byte. Unknown characters become "?". */
const WIN_ANSI: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "•": 0x95, "–": 0x96, "—": 0x97,
  "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "™": 0x99, "·": 0xb7,
  "Š": 0x8a, "š": 0x9a, "Ž": 0x8e, "ž": 0x9e, "Œ": 0x8c, "œ": 0x9c, "Ÿ": 0x9f, "‹": 0x8b, "›": 0x9b,
};

const TRANSLIT: Record<string, string> = { "ł": "l", "Ł": "L", "đ": "d", "Đ": "D", "ı": "i" };

function encodeChar(ch: string): number {
  const c = ch.charCodeAt(0);
  if (c >= 32 && c <= 126) return c;
  if (WIN_ANSI[ch] !== undefined) return WIN_ANSI[ch];
  if (c >= 0xa0 && c <= 0xff) return c;
  // Outside WinAnsi (e.g. Polish ą ę ś): fall back to the base letter rather than "?".
  const base = TRANSLIT[ch] ?? ch.normalize("NFD")[0];
  if (base && base !== ch) return encodeChar(base);
  return 63;
}

function charWidth(code: number, bold: boolean): number {
  let w: number;
  if (code >= 32 && code <= 126) w = HELV[code - 32];
  else if (code === 0x95) w = 350;
  else if (code === 0x96) w = 556;
  else if (code === 0x97) w = 1000;
  else w = 556;
  return bold ? w * 1.06 : w;
}

/** True if the text needs glyphs the built-in PDF fonts can't draw (CJK, Cyrillic, Greek…). */
export function needsUnicodeFont(s: string): boolean {
  return /[\u0370-\u03ff\u0400-\u04ff\u0590-\u06ff\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(s);
}

export function textWidth(s: string, size: number, bold = false): number {
  let w = 0;
  for (const ch of s) w += charWidth(encodeChar(ch), bold);
  return (w * size) / 1000;
}

export function wrap(s: string, size: number, maxWidth: number, bold = false): string[] {
  const out: string[] = [];
  for (const para of s.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push("");
      continue;
    }
    let line = "";
    for (const w of words) {
      const cand = line ? `${line} ${w}` : w;
      if (textWidth(cand, size, bold) <= maxWidth || !line) line = cand;
      else {
        out.push(line);
        line = w;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

function pdfString(s: string): string {
  let out = "(";
  for (const ch of s) {
    const b = encodeChar(ch);
    if (b === 0x28 || b === 0x29 || b === 0x5c) out += "\\" + String.fromCharCode(b);
    else if (b > 126) out += "\\" + b.toString(8).padStart(3, "0");
    else out += String.fromCharCode(b);
  }
  return out + ")";
}

export interface PdfDoc {
  pageWidth: number;
  pageHeight: number;
  margin: number;
  pages: string[][]; // content-stream ops per page
  y: number;
}

export function newPdf(): PdfDoc {
  const doc: PdfDoc = { pageWidth: 595.28, pageHeight: 841.89, margin: 50, pages: [[]], y: 0 };
  doc.y = doc.pageHeight - doc.margin;
  return doc;
}

function ensure(doc: PdfDoc, h: number) {
  if (doc.y - h < doc.margin) {
    doc.pages.push([]);
    doc.y = doc.pageHeight - doc.margin;
  }
}

export function drawText(doc: PdfDoc, s: string, x: number, size: number, bold = false) {
  doc.pages[doc.pages.length - 1].push(
    `BT /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(2)} ${doc.y.toFixed(2)} Td ${pdfString(s)} Tj ET`
  );
}

export function rule(doc: PdfDoc) {
  const y = doc.y.toFixed(2);
  doc.pages[doc.pages.length - 1].push(
    `0.6 w 0.3 g ${doc.margin} ${y} m ${(doc.pageWidth - doc.margin).toFixed(2)} ${y} l S 0 g`
  );
}

/** Write wrapped text; `indent` shifts continuation lines (hanging bullets). */
export function paragraph(
  doc: PdfDoc,
  s: string,
  opts: { size?: number; bold?: boolean; indent?: number; bullet?: boolean; after?: number; center?: boolean } = {}
) {
  const size = opts.size ?? 10;
  const lead = size * 1.32;
  const left = doc.margin + (opts.indent ?? 0);
  const bulletGap = opts.bullet ? 11 : 0;
  const width = doc.pageWidth - doc.margin - left - bulletGap;
  const lines = wrap(s, size, width, opts.bold);
  lines.forEach((line, i) => {
    ensure(doc, lead);
    doc.y -= lead;
    if (opts.bullet && i === 0) drawText(doc, "•", left, size);
    const x = opts.center ? (doc.pageWidth - textWidth(line, size, opts.bold)) / 2 : left + bulletGap;
    drawText(doc, line, x, size, opts.bold);
  });
  doc.y -= opts.after ?? 0;
}

export function space(doc: PdfDoc, h: number) {
  doc.y -= h;
}

export function heading(doc: PdfDoc, s: string) {
  ensure(doc, 34);
  doc.y -= 8;
  paragraph(doc, s.toUpperCase(), { size: 11, bold: true });
  doc.y -= 3;
  rule(doc);
  doc.y -= 2;
}

/** Serialize to PDF bytes. */
export function renderPdf(doc: PdfDoc, meta: { title: string; author: string }): Uint8Array {
  const objs: string[] = [];
  const add = (s: string) => {
    objs.push(s);
    return objs.length;
  };
  const catalog = add(""); // placeholder 1
  const pagesId = add(""); // placeholder 2
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids: number[] = [];
  for (const ops of doc.pages) {
    const stream = ops.join("\n");
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    kids.push(
      add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${doc.pageWidth} ${doc.pageHeight}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${content} 0 R >>`
      )
    );
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  const info = add(`<< /Title ${pdfString(meta.title)} /Author ${pdfString(meta.author)} /Producer (Claude Workday Autopilot) >>`);

  let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Every char is a single byte (WinAnsi/octal-escaped), so latin1 = byte offsets.
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}
