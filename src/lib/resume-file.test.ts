import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkResume } from "./profile";
import { extractResumeText, sniffResumeType, zipUnpackedSize } from "./resume-file";

const fixture = (name: string) => new Uint8Array(readFileSync(path.join(__dirname, "../../e2e/fixtures", name)));
const pdf = fixture("resume.pdf");
const docx = fixture("resume.docx");

/** A zip whose central directory says its one entry unpacks to `size` bytes. */
function zipClaiming(size: number): Uint8Array {
  const name = new TextEncoder().encode("word/document.xml");
  const local = new Uint8Array(30 + name.length);
  new DataView(local.buffer).setUint32(0, 0x04034b50, true);
  local.set(name, 30);
  const central = new Uint8Array(46 + name.length);
  const c = new DataView(central.buffer);
  c.setUint32(0, 0x02014b50, true);
  c.setUint32(24, size, true);
  c.setUint16(28, name.length, true);
  central.set(name, 46);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, 1, true);
  e.setUint16(10, 1, true);
  e.setUint32(12, central.length, true);
  e.setUint32(16, local.length, true);
  const out = new Uint8Array(local.length + central.length + end.length);
  out.set(local);
  out.set(central, local.length);
  out.set(end, local.length + central.length);
  return out;
}

describe("sniffResumeType", () => {
  it("knows PDF and DOCX by their first bytes", () => {
    expect(sniffResumeType(pdf)).toBe("pdf");
    expect(sniffResumeType(docx)).toBe("docx");
    expect(sniffResumeType(new TextEncoder().encode("<html>"))).toBeNull();
    expect(sniffResumeType(new Uint8Array())).toBeNull();
  });
});

describe("extractResumeText", () => {
  it.each([
    ["PDF", pdf, "pdf"],
    ["DOCX", docx, "docx"],
  ] as const)("reads the text of a %s, ready to save as the resume", async (_, bytes, type) => {
    const r = await extractResumeText(bytes, type);
    if (!r.ok) throw new Error(r.error);
    expect(r.text).toMatch(/^Jordan Reyes - Frontend Engineer\n/);
    expect(r.text).toContain("- Cut checkout page load time by 40% with server rendering.");
    expect(r.text).toMatch(/SKILLS: React, TypeScript, Next\.js, CSS, Jest, accessibility$/);
    expect(checkResume(r.text).ok).toBe(true);
  });

  it("doesn't trust the file name: the bytes must match the type", async () => {
    expect(await extractResumeText(docx, "pdf")).toEqual({ ok: false, error: "That file isn't a real PDF. Save it again as PDF or DOCX." });
    expect(await extractResumeText(new TextEncoder().encode("<script>"), "docx")).toMatchObject({ ok: false });
  });

  it("says when a PDF has no text, like a scanned image", async () => {
    const r = await extractResumeText(fixture("scanned.pdf"), "pdf");
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/^No text found in that file\. It may be a scanned image/) });
  });

  it("refuses empty and oversized files before reading them", async () => {
    expect(await extractResumeText(new Uint8Array(), "pdf")).toEqual({ ok: false, error: "That file is empty." });
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(new TextEncoder().encode("%PDF-"));
    expect(await extractResumeText(big, "pdf")).toEqual({ ok: false, error: "That file is over 5 MB." });
  });

  it("gives a plain message for a broken file", async () => {
    const broken = new TextEncoder().encode("%PDF-1.4\nthis is not really a pdf");
    expect(await extractResumeText(broken, "pdf")).toMatchObject({ ok: false, error: expect.stringMatching(/^(Couldn't read that file|No text found)/) });
    expect(await extractResumeText(docx.subarray(0, 200), "docx")).toMatchObject({ ok: false, error: expect.stringMatching(/^Couldn't read that file/) });
  });

  it("refuses a DOCX that would unpack to more than 50 MB (zip bomb)", async () => {
    expect(await extractResumeText(zipClaiming(60 * 1024 * 1024), "docx")).toEqual({
      ok: false,
      error: "That DOCX is too large to read. Save it again without images, or paste your resume as text.",
    });
  });
});

describe("zipUnpackedSize", () => {
  it("adds up the sizes in the central directory", () => {
    expect(zipUnpackedSize(zipClaiming(1234))).toBe(1234);
    expect(zipUnpackedSize(docx)).toBeGreaterThan(0);
    expect(zipUnpackedSize(new Uint8Array(10))).toBeNull();
  });
});
