import { describe, expect, it } from "vitest";
import { companyFromSlug, parseJobLink } from "./job-link";

const UUID = "5ac21346-8e0c-4494-8e7a-3eb92ff77902";

describe("parseJobLink: Greenhouse", () => {
  it.each([
    ["https://boards.greenhouse.io/acme/jobs/4012345", "us"],
    ["https://job-boards.greenhouse.io/acme/jobs/4012345?gh_src=abc#app", "us"],
    ["https://job-boards.eu.greenhouse.io/acme/jobs/4012345", "eu"],
    ["https://boards.greenhouse.io/embed/job_app?for=acme&token=4012345", "us"],
    ["  https://BOARDS.greenhouse.io/acme/jobs/4012345/  ", "us"],
  ])("reads %s", (url, region) => {
    expect(parseJobLink(url)).toEqual({ board: "greenhouse", slug: "acme", postingId: "4012345", region });
  });

  it.each([
    "https://boards.greenhouse.io/acme", // the board, not a posting
    "https://boards.greenhouse.io/acme/jobs/not-a-number",
    "https://boards.greenhouse.io/embed/job_app?for=acme",
    "https://evil.greenhouse.io.example.com/acme/jobs/1",
  ])("rejects %s", (url) => {
    expect(parseJobLink(url)).toBeNull();
  });
});

describe("parseJobLink: Lever", () => {
  it("reads posting and apply links, US and EU", () => {
    expect(parseJobLink(`https://jobs.lever.co/acme-corp/${UUID}`)).toEqual({ board: "lever", slug: "acme-corp", postingId: UUID, region: "us" });
    expect(parseJobLink(`https://jobs.lever.co/acme-corp/${UUID}/apply`)?.postingId).toBe(UUID);
    expect(parseJobLink(`https://jobs.eu.lever.co/acme/${UUID.toUpperCase()}`)).toEqual({ board: "lever", slug: "acme", postingId: UUID, region: "eu" });
  });
  it("rejects board pages and odd paths", () => {
    expect(parseJobLink("https://jobs.lever.co/acme")).toBeNull();
    expect(parseJobLink(`https://jobs.lever.co/acme/${UUID}/other`)).toBeNull();
    expect(parseJobLink("https://jobs.lever.co/acme/12345")).toBeNull();
  });
});

describe("parseJobLink: Ashby", () => {
  it("reads posting and application links", () => {
    expect(parseJobLink(`https://jobs.ashbyhq.com/acme/${UUID}`)).toEqual({ board: "ashby", slug: "acme", postingId: UUID, region: "us" });
    expect(parseJobLink(`https://jobs.ashbyhq.com/acme/${UUID}/application`)?.board).toBe("ashby");
  });
  it("rejects board pages", () => {
    expect(parseJobLink("https://jobs.ashbyhq.com/acme")).toBeNull();
  });
});

describe("parseJobLink: everything else", () => {
  it.each([
    "not a url",
    "",
    "javascript:alert(1)",
    "ftp://boards.greenhouse.io/acme/jobs/1",
    "https://www.linkedin.com/jobs/view/123",
    "https://acme.com/careers?gh_jid=4012345", // company site: the board name isn't in the link
    "https://user:pw@boards.greenhouse.io/acme/jobs/1",
    "https://boards.greenhouse.io:8443/acme/jobs/1",
    "https://boards.greenhouse.io/..%2Fadmin/jobs/1",
    "https://boards.greenhouse.io/%E0%A4%A/jobs/1", // broken percent-encoding
  ])("rejects %s", (url) => {
    expect(parseJobLink(url)).toBeNull();
  });
});

describe("companyFromSlug", () => {
  it("turns a board slug into a readable name", () => {
    expect(companyFromSlug("acme-corp")).toBe("Acme Corp");
    expect(companyFromSlug("open_ai")).toBe("Open Ai");
    expect(companyFromSlug("stripe")).toBe("Stripe");
  });
});
