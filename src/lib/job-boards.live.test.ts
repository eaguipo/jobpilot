import { describe, expect, it } from "vitest";
import { jobFromLink } from "./job-from-link";
import { checkNewJob } from "./jobs";

/**
 * Real Greenhouse, Lever and Ashby calls (task 22), to notice when a board changes its API.
 * Skipped unless BOARDS_LIVE=1, so `npm test` and CI stay offline. Run with `npm run test:live:boards`.
 * Each test finds a posting that's open today on a large public board, then reads it
 * the way "Fill from link" does. No keys needed.
 */
const BOARDS = {
  greenhouse: { list: "https://boards-api.greenhouse.io/v1/boards/stripe/jobs", link: (j: { id: number }) => `https://job-boards.greenhouse.io/stripe/jobs/${j.id}` },
  lever: { list: "https://api.lever.co/v0/postings/palantir?mode=json&limit=1", link: (j: { id: string }) => `https://jobs.lever.co/palantir/${j.id}` },
  ashby: { list: "https://api.ashbyhq.com/posting-api/job-board/ramp", link: (j: { id: string }) => `https://jobs.ashbyhq.com/ramp/${j.id}` },
} as const;

async function firstPosting(board: keyof typeof BOARDS): Promise<string> {
  const res = await fetch(BOARDS[board].list, { signal: AbortSignal.timeout(30_000) });
  expect(res.ok).toBe(true);
  const json = await res.json();
  const jobs = Array.isArray(json) ? json : json.jobs;
  expect(jobs.length).toBeGreaterThan(0);
  return BOARDS[board].link(jobs[0]);
}

describe.skipIf(!process.env.BOARDS_LIVE)("live job boards", () => {
  for (const board of Object.keys(BOARDS) as (keyof typeof BOARDS)[]) {
    it(
      `fills the Add job form from a real ${board} posting`,
      async () => {
        const url = await firstPosting(board);
        const result = await jobFromLink(url);
        if (!result.ok) throw new Error(`${url}: ${result.error}`);
        expect(result.values.applyUrl).toBe(url);
        expect(result.values.title.length).toBeGreaterThan(0);
        expect(result.values.description).not.toMatch(/<\/?(p|div|li|ul|strong)\b|&lt;|&amp;/); // really plain text
        expect(checkNewJob(result.values).ok).toBe(true);
      },
      60_000,
    );
  }
});
