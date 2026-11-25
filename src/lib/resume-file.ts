import { RESUME_MAX_CHARS } from "./profile";

/**
 * Reads the text out of an uploaded resume file (story 11). Server-only: it loads the
 * PDF and DOCX libraries. The caller passes bytes it read back from Storage, so nothing
 * here trusts the browser's claimed file type: the bytes must look like the type.
 */

export type ResumeFileType = "pdf" | "docx";
export type ExtractResult = { ok: true; text: string } | { ok: false; error: string };

export const RESUME_FILE_MAX_BYTES = 5 * 1024 * 1024;
export const RESUME_FILE_MIME: Record<ResumeFileType, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
/** Resumes are short; a long PDF is more likely a portfolio or a mistake, and costs time to read. */
const MAX_PDF_PAGES = 20;
/** A DOCX is a zip. Refuse files that would unpack to more than this (zip bombs). */
const MAX_DOCX_UNPACKED_BYTES = 50 * 1024 * 1024;

const SCANNED =
  "No text found in that file. It may be a scanned image; paste your resume as text instead.";
const UNREADABLE = "Couldn't read that file. Save it again as PDF or DOCX, or paste your resume as text.";

/** Which type the bytes really are, from their first bytes. */
export function sniffResumeType(bytes: Uint8Array): ResumeFileType | null {
  const head = String.fromCharCode(...bytes.subarray(0, 5));
  if (head === "%PDF-") return "pdf";
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return "docx";
  return null;
}

export async function extractResumeText(bytes: Uint8Array, expected: ResumeFileType): Promise<ExtractResult> {
  if (bytes.byteLength === 0) return { ok: false, error: "That file is empty." };
  if (bytes.byteLength > RESUME_FILE_MAX_BYTES) return { ok: false, error: "That file is over 5 MB." };
  if (sniffResumeType(bytes) !== expected) {
    return { ok: false, error: `That file isn't a real ${expected.toUpperCase()}. Save it again as PDF or DOCX.` };
  }

  let raw: string;
  try {
    raw = expected === "pdf" ? await pdfText(bytes) : await docxText(bytes);
  } catch (e) {
    if (e instanceof FileProblem) return { ok: false, error: e.message };
    return { ok: false, error: UNREADABLE };
  }

  const text = cleanText(raw);
  if (!/[\p{L}\p{N}]/u.test(text)) return { ok: false, error: SCANNED };
  if (text.length > RESUME_MAX_CHARS) {
    return { ok: false, error: `That file has more than ${RESUME_MAX_CHARS.toLocaleString("en-US")} characters of text. Upload just your resume.` };
  }
  return { ok: true, text };
}

/** A problem worth telling the user about, as opposed to a library error. */
class FileProblem extends Error {}

async function pdfText(bytes: Uint8Array): Promise<string> {
  const { getDocumentProxy, extractText } = await import("unpdf");
  let pdf;
  try {
    // A copy: pdf.js takes ownership of (detaches) the buffer it's given.
    pdf = await getDocumentProxy(new Uint8Array(bytes));
  } catch (e) {
    if (e instanceof Error && e.name === "PasswordException") {
      throw new FileProblem("That PDF is password-protected. Save a copy without a password, or paste your resume as text.");
    }
    throw e;
  }
  try {
    if (pdf.numPages > MAX_PDF_PAGES) throw new FileProblem(`That PDF has ${pdf.numPages} pages. Upload just your resume (up to ${MAX_PDF_PAGES} pages).`);
    const { text } = await extractText(pdf, { mergePages: false });
    return text.join("\n\n");
  } finally {
    await pdf.cleanup().catch(() => {});
  }
}

async function docxText(bytes: Uint8Array): Promise<string> {
  const unpacked = zipUnpackedSize(bytes);
  if (unpacked === null) throw new FileProblem(UNREADABLE);
  if (unpacked > MAX_DOCX_UNPACKED_BYTES) throw new FileProblem("That DOCX is too large to read. Save it again without images, or paste your resume as text.");
  const mammoth = (await import("mammoth")).default;
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return result.value;
}

/**
 * Total unpacked size of a zip, from its central directory, without unpacking it.
 * Null if the directory can't be read or uses ZIP64 (no resume needs that).
 */
export function zipUnpackedSize(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // End of central directory: 22 bytes plus a comment of up to 65,535 bytes, at the very end.
  let eocd = -1;
  for (let i = bytes.byteLength - 22; i >= Math.max(0, bytes.byteLength - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const entries = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  if (entries === 0xffff || p === 0xffffffff) return null;
  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (p + 46 > bytes.byteLength || view.getUint32(p, true) !== 0x02014b50) return null;
    const size = view.getUint32(p + 24, true);
    if (size === 0xffffffff) return null;
    total += size;
    p += 46 + view.getUint16(p + 28, true) + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
  }
  return total;
}

/** Same clean-up the resume textarea gets on save, plus no runs of blank lines. */
function cleanText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t ]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
