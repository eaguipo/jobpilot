import { describe, expect, it } from "vitest";
import { addJob, findJobByApplyUrl, openDb } from "./db";
import { checkNewJob, LIMITS, normaliseApplyUrl } from "./jobs";

const valid = {
  company: "  Acme  ",
  title: " Frontend Engineer ",
  applyUrl: " https://boards.greenhouse.io/acme/jobs/123#app ",
  description: "We are hiring a frontend engineer with React and TypeScript.  \r\nRemote.",
};

describe("normaliseApplyUrl", () => {
  it("keeps http(s) links and drops the #fragment", () => {
    expect(normaliseApplyUrl("https://jobs.lever.co/acme/1?src=x#apply")).toBe("https://jobs.lever.co/acme/1?src=x");
    expect(normaliseApplyUrl("http://example.com")).toBe("http://example.com/");
  });

  it("rejects links that could run code or aren't web pages", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "mailto:jobs@acme.com",
      "ftp://acme.com/job",
      "acme.com/jobs/1",
      "https://intranet",
      "not a url",
    ]) {
      expect(normaliseApplyUrl(bad), bad).toBeNull();
    }
  });
});

describe("checkNewJob", () => {
  it("accepts a valid job and tidies every field", () => {
    expect(checkNewJob(valid)).toEqual({
      ok: true,
      job: {
        company: "Acme",
        title: "Frontend Engineer",
        applyUrl: "https://boards.greenhouse.io/acme/jobs/123",
        description: "We are hiring a frontend engineer with React and TypeScript.\nRemote.",
      },
    });
  });

  it("reports every missing field at once", () => {
    const result = checkNewJob({ company: "", title: " ", applyUrl: undefined, description: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["applyUrl", "company", "description", "title"]);
  });

  it("rejects an unsafe link, too-short description and over-long fields", () => {
    const result = checkNewJob({
      ...valid,
      company: "x".repeat(LIMITS.company + 1),
      applyUrl: "javascript:alert(1)",
      description: "too short",
    });
    expect(result).toMatchObject({
      ok: false,
      errors: {
        company: expect.stringMatching(/under 200/),
        applyUrl: expect.stringMatching(/https:\/\//),
        description: expect.stringMatching(/too short/),
      },
    });
  });
});

describe("findJobByApplyUrl", () => {
  it("finds an existing job by its link, for duplicate checks", () => {
    const db = openDb(":memory:");
    const check = checkNewJob(valid);
    if (!check.ok) throw new Error("expected valid");
    const job = addJob(db, check.job);
    expect(findJobByApplyUrl(db, "https://boards.greenhouse.io/acme/jobs/123")?.id).toBe(job.id);
    expect(findJobByApplyUrl(db, "https://boards.greenhouse.io/acme/jobs/999")).toBeNull();
    db.close();
  });
});
