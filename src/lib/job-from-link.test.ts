import { describe, expect, it } from "vitest";
import { FAKE_ASHBY_ID, fakeBoardFetch } from "./fake-boards";
import { jobFromLink } from "./job-from-link";
import { checkNewJob } from "./jobs";

describe("jobFromLink", () => {
  it("fills every form field, with one canonical link", async () => {
    const r = await jobFromLink("https://boards.greenhouse.io/embed/job_app?for=initech&token=123", fakeBoardFetch);
    expect(r).toEqual({
      ok: true,
      values: {
        company: "Initech",
        title: "Frontend Engineer",
        applyUrl: "https://job-boards.greenhouse.io/initech/jobs/123",
        description: "Location: Remote\n\nBuild the React and TypeScript front end of our hiring tools with Next.js.\n\n- 3+ years of React\n- GraphQL & AWS",
      },
    });
  });

  it("gives values the Add job form accepts, for every board", async () => {
    for (const url of [
      "https://job-boards.greenhouse.io/initech/jobs/123",
      "https://jobs.lever.co/initech/5ac21346-8e0c-4494-8e7a-3eb92ff77902",
      `https://jobs.ashbyhq.com/initech/${FAKE_ASHBY_ID}`,
    ]) {
      const r = await jobFromLink(url, fakeBoardFetch);
      if (!r.ok) throw new Error(`${url}: ${r.error}`);
      expect(checkNewJob(r.values).ok).toBe(true);
    }
  });

  it("never fetches a link it can't read", async () => {
    let called = false;
    const spy = (async () => {
      called = true;
      return new Response("{}");
    }) as unknown as typeof fetch;
    for (const url of ["", "   ", "https://www.linkedin.com/jobs/view/1", "http://169.254.169.254/latest/meta-data", "x".repeat(2_001)]) {
      expect((await jobFromLink(url, spy)).ok).toBe(false);
    }
    expect(called).toBe(false);
  });

  it("explains each kind of failure", async () => {
    expect(await jobFromLink("", fakeBoardFetch)).toEqual({ ok: false, error: "Paste a job posting link first." });
    expect(await jobFromLink("https://example.com/job/1", fakeBoardFetch)).toEqual({
      ok: false,
      error: "Only Greenhouse, Lever or Ashby posting links can be read for now. Paste the details instead.",
    });
    const missing = await jobFromLink("https://job-boards.greenhouse.io/missing/jobs/1", fakeBoardFetch);
    expect(!missing.ok && missing.error).toMatch(/^Couldn't find that posting/);
    const down = await jobFromLink("https://job-boards.greenhouse.io/down/jobs/1", fakeBoardFetch);
    expect(!down.ok && down.error).toMatch(/^The job board didn't answer/);
    const notOnBoard = await jobFromLink("https://jobs.ashbyhq.com/initech/11111111-1111-4111-8111-111111111111", fakeBoardFetch);
    expect(!notOnBoard.ok && notOnBoard.error).toMatch(/^Couldn't find that posting/);
  });
});
