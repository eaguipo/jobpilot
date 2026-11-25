/**
 * Offline stand-in for the job board APIs, used by the e2e tests (JOBPILOT_FAKE_BOARDS=1),
 * so they never depend on Greenhouse, Lever or Ashby being up.
 * Board slugs "missing" and "down" answer 404 and 503; anything else gets a sample posting.
 * Ashby boards list one posting, FAKE_ASHBY_ID.
 */

export const FAKE_ASHBY_ID = "0b6f1a52-3c1e-4d7a-9b8e-2f4c6d8a1e01";

const DESCRIPTION =
  "&lt;p&gt;Build the React and TypeScript front end of our hiring tools with Next.js.&lt;/p&gt;" +
  "&lt;ul&gt;&lt;li&gt;3+ years of React&lt;/li&gt;&lt;li&gt;GraphQL &amp;amp; AWS&lt;/li&gt;&lt;/ul&gt;";

export const fakeBoardFetch = (async (input: string | URL | Request) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  // /v1/boards/<slug>/…, /v0/postings/<slug>/…, /posting-api/job-board/<slug>
  const slug = url.pathname.split("/")[3] ?? "";
  if (slug === "missing") return new Response("{}", { status: 404 });
  if (slug === "down") return new Response("{}", { status: 503 });

  if (url.hostname === "boards-api.greenhouse.io") {
    return Response.json({ company_name: "Initech", title: "Frontend Engineer", location: { name: "Remote" }, content: DESCRIPTION });
  }
  if (url.hostname === "api.lever.co" || url.hostname === "api.eu.lever.co") {
    return Response.json({
      text: "Frontend Engineer",
      categories: { location: "Remote" },
      descriptionPlain: "Build the React and TypeScript front end of our hiring tools with Next.js.",
      lists: [{ text: "You have", content: "<li>3+ years of React</li>" }],
    });
  }
  if (url.hostname === "api.ashbyhq.com") {
    return Response.json({
      jobs: [{ id: FAKE_ASHBY_ID, title: "Frontend Engineer", location: "Remote", descriptionPlain: "Build the React and TypeScript front end of our hiring tools with Next.js." }],
    });
  }
  return new Response("{}", { status: 404 });
}) as typeof fetch;
