import { describe, expect, it } from "vitest";
import { isResumeFileType, resumePath, resumeTypeFromName } from "./resume-storage";

describe("resume storage names", () => {
  it("builds the one allowed path per type", () => {
    expect(resumePath("u1", "pdf")).toBe("u1/resume.pdf");
    expect(resumePath("u1", "docx")).toBe("u1/resume.docx");
  });
  it("gets the type from a file name, case-insensitively", () => {
    expect(resumeTypeFromName("Jordan Reyes CV.PDF")).toBe("pdf");
    expect(resumeTypeFromName("cv.final.docx")).toBe("docx");
    expect(resumeTypeFromName("cv.doc")).toBeNull();
    expect(resumeTypeFromName("cv.pdf.exe")).toBeNull();
    expect(resumeTypeFromName("pdf")).toBeNull();
  });
  it("accepts only pdf and docx as a type", () => {
    expect(isResumeFileType("pdf")).toBe(true);
    expect(isResumeFileType("docx")).toBe(true);
    expect(isResumeFileType("../x")).toBe(false);
    expect(isResumeFileType(undefined)).toBe(false);
  });
});
