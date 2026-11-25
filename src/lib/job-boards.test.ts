import { describe, expect, it } from "vitest";
import { apiUrl, fetchJobFromBoard } from "./job-boards";
import type { JobLink } from "./job-link";
import { LIMITS } from "./jobs";

const UUID = "5ac21346-8e0c-4494-8e7a-3eb92ff77902";
const gh: JobLink = { board: "greenhouse", slug: "acme", postingId: "4012345", region: "us" };
const lever: JobLink = { board: "lever", slug: "acme-corp", postingId: UUID, region: "us" };
const ashby: JobLink = { board: "ashby", slug: "acme", postingId: UUID, region: "us" };
const LONG = "You will build and run our payments platform with TypeScript and Postgres.";

/** A fetch that answers every call with `body` and records the calls. */
function fakeFetch(body: unknown, init: ResponseInit = { status: 200 }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, reqInit: RequestInit) => {
    calls.push({ url, init: reqInit });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), init);
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe("apiUrl", () => {
  it("calls only each board's fixed API host", () => {
    expect(apiUrl(gh)).toBe("https://boards-api.greenhouse.io/v1/boards/acme/jobs/4012345");
    expect(apiUrl({ ...gh, region: "eu" })).toBe("https://boards-api.greenhouse.io/v1/boards/acme/jobs/4012345");
    expect(apiUrl(lever)).toBe(`https://api.lever.co/v0/postings/acme-corp/${UUID}?mode=json`);
    expect(apiUrl({ ...lever, region: "eu" })).toBe(`https://api.eu.lever.co/v0/postings/acme-corp/${UUID}?mode=json`);
    expect(apiUrl(ashby)).toBe("https://api.ashbyhq.com/posting-api/job-board/acme");
  });
});

describe("fetchJobFromBoard: Greenhouse", () => {
  it("uses the company name and decodes the escaped HTML content", async () => {
    const { f, calls } = fakeFetch({
      company_name: "Acme Inc",
      title: "  Backend Engineer ",
      location: { name: "Remote, US" },
      content: `&lt;h2&gt;About&lt;/h2&gt;&lt;p&gt;${LONG} R&amp;amp;D&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Go&lt;/li&gt;&lt;/ul&gt;`,
    });
    expect(await fetchJobFromBoard(gh, f)).toEqual({
      ok: true,
      job: { company: "Acme Inc", title: "Backend Engineer", description: `Location: Remote, US\n\nAbout\n\n${LONG} R&D\n\n- Go` },
    });
    expect(calls[0].init.redirect).toBe("error");
  });
  it("falls back to the slug when there's no company name", async () => {
    const { f } = fakeFetch({ title: "Engineer", content: `&lt;p&gt;${LONG}&lt;/p&gt;` });
    const r = await fetchJobFromBoard(gh, f);
    expect(r.ok && r.job.company).toBe("Acme");
    expect(r.ok && r.job.description).toBe(LONG);
  });
});

describe("fetchJobFromBoard: Lever", () => {
  it("joins the opening, description, lists and closing text", async () => {
    const { f } = fakeFetch({
      text: "Platform Engineer",
      categories: { location: "London" },
      openingPlain: "",
      descriptionPlain: LONG,
      lists: [{ text: "What you'll do", content: "<li>Ship</li><li>Review</li>" }],
      additionalPlain: "We sponsor visas.",
    });
    expect(await fetchJobFromBoard(lever, f)).toEqual({
      ok: true,
      job: {
        company: "Acme Corp",
        title: "Platform Engineer",
        description: `Location: London\n\n${LONG}\n\nWhat you'll do\n- Ship\n- Review\n\nWe sponsor visas.`,
      },
    });
  });
});

describe("fetchJobFromBoard: Ashby", () => {
  const board = {
    jobs: [
      { id: "11111111-1111-4111-8111-111111111111", title: "Other", descriptionPlain: LONG },
      { id: UUID.toUpperCase(), title: "Data Engineer", location: "NYC", descriptionPlain: LONG },
    ],
  };
  it("picks the posting out of the whole board", async () => {
    expect(await fetchJobFromBoard(ashby, fakeFetch(board).f)).toEqual({
      ok: true,
      job: { company: "Acme", title: "Data Engineer", description: `Location: NYC\n\n${LONG}` },
    });
  });
  it("uses the HTML description when there's no plain one", async () => {
    const { f } = fakeFetch({ jobs: [{ id: UUID, title: "Data Engineer", descriptionHtml: `<p>${LONG}</p>` }] });
    const r = await fetchJobFromBoard(ashby, f);
    expect(r.ok && r.job.description).toBe(LONG);
  });
  it("reports a posting that isn't on the board as not found", async () => {
    expect(await fetchJobFromBoard(ashby, fakeFetch({ jobs: [board.jobs[0]] }).f)).toEqual({ ok: false, error: "not_found" });
  });
});

describe("fetchJobFromBoard: limits and failures", () => {
  it("cuts long fields to what the Add job form accepts", async () => {
    const { f } = fakeFetch({ company_name: "C".repeat(300), title: "T".repeat(300), content: "x".repeat(LIMITS.descriptionMax + 10) });
    const r = await fetchJobFromBoard(gh, f);
    expect(r.ok && [r.job.company.length, r.job.title.length, r.job.description.length]).toEqual([LIMITS.company, LIMITS.title, LIMITS.descriptionMax]);
  });

  it.each([
    [404, "not_found"],
    [429, "unavailable"],
    [503, "unavailable"],
    [403, "bad_response"],
  ] as const)("maps HTTP %i to %s", async (status, error) => {
    expect(await fetchJobFromBoard(gh, fakeFetch({}, { status }).f)).toEqual({ ok: false, error });
  });

  it("treats a network error or timeout as unavailable", async () => {
    const f = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await fetchJobFromBoard(gh, f)).toEqual({ ok: false, error: "unavailable" });
  });

  it("rejects bodies that aren't JSON, lack a title or description, or are too big", async () => {
    expect(await fetchJobFromBoard(gh, fakeFetch("<html>").f)).toEqual({ ok: false, error: "bad_response" });
    expect(await fetchJobFromBoard(gh, fakeFetch({ title: "", content: LONG }).f)).toEqual({ ok: false, error: "bad_response" });
    expect(await fetchJobFromBoard(lever, fakeFetch({ text: "Engineer" }).f)).toEqual({ ok: false, error: "bad_response" });
    expect(await fetchJobFromBoard(gh, fakeFetch(["not", "an", "object"]).f)).toEqual({ ok: false, error: "bad_response" });
    const big = fakeFetch({ title: "x", content: "y" }, { status: 200, headers: { "content-length": String(11 * 1024 * 1024) } });
    expect(await fetchJobFromBoard(gh, big.f)).toEqual({ ok: false, error: "bad_response" });
  });

  it("stops reading a body that grows past the size cap without saying its length", async () => {
    const chunk = new Uint8Array(1024 * 1024).fill(32); // 1 MB of spaces
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (sent++ < 12) c.enqueue(chunk);
        else c.close();
      },
    });
    const f = (async () => new Response(stream, { status: 200 })) as unknown as typeof fetch;
    expect(await fetchJobFromBoard(gh, f)).toEqual({ ok: false, error: "bad_response" });
    expect(sent).toBeLessThan(13);
  });
});
