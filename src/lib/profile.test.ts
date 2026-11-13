import { describe, expect, it } from "vitest";
import { checkResume, RESUME_MAX_CHARS, RESUME_MIN_CHARS } from "./profile";

const resume = "Jane Doe\nFrontend Engineer\n" + "Built React apps. ".repeat(20);

describe("checkResume", () => {
  it("accepts a normal resume and tidies line endings and trailing spaces", () => {
    const result = checkResume(`  ${resume.replace(/\n/g, "  \r\n")}  \n\n`);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text.startsWith("Jane Doe\nFrontend Engineer\n")).toBe(true);
      expect(result.text).not.toMatch(/[ \r]\n|\s$/);
    }
  });

  it("rejects empty, non-text, too short and too long input", () => {
    expect(checkResume("   \n ")).toMatchObject({ ok: false, error: expect.stringMatching(/before saving/) });
    expect(checkResume(null)).toMatchObject({ ok: false });
    expect(checkResume("x".repeat(RESUME_MIN_CHARS - 1))).toMatchObject({ ok: false, error: expect.stringMatching(/too short/) });
    expect(checkResume("x".repeat(RESUME_MAX_CHARS + 1))).toMatchObject({ ok: false, error: expect.stringMatching(/longer than/) });
  });

  it("accepts the exact limits", () => {
    expect(checkResume("x".repeat(RESUME_MIN_CHARS)).ok).toBe(true);
    expect(checkResume("x".repeat(RESUME_MAX_CHARS)).ok).toBe(true);
  });
});
