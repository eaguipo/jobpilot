import { describe, expect, it } from "vitest";
import { factCheck, type Flag } from "./fact-check";

const RESUME = `Jane Doe — Frontend Engineer
EXPERIENCE
Acme Corp — Senior Frontend Engineer (2021–present)
- Built React and TypeScript dashboards used by 5,000 customers.
- Cut page load time by 40% with code splitting in Next.js.
Brightwave — Frontend Developer (2018–2021)
- Maintained a Vue.js storefront; wrote Jest tests.
EDUCATION
B.S. Computer Science, University of Oregon, 2018
SKILLS: React, TypeScript, Next.js, Vue.js, CSS, Jest, Node.js, C#`;

const POSTING = `Company: Globex
Title: Senior Frontend Engineer
Globex builds Hammerhead, our analytics product. Requirements: React, TypeScript, GraphQL, AWS (S3, Lambda), Kubernetes.`;

const check = (document: string, gaps: string[] = []) => factCheck({ document, resume: RESUME, posting: POSTING, gaps });
const terms = (flags: Flag[], kind: Flag["kind"]) => flags.filter((f) => f.kind === kind).map((f) => f.term);

describe("factCheck", () => {
  it("passes a faithful rewrite with no flags", () => {
    const doc = `Jane Doe — Frontend Engineer
SUMMARY
Senior Frontend Engineer with React, TypeScript and Next.js experience.
EXPERIENCE
Acme Corp — Senior Frontend Engineer (2021–present)
- Cut page load time by 40% using code splitting in Next.js.
- Built React and TypeScript dashboards for 5,000 customers.
Brightwave — Frontend Developer (2018–2021)
- Maintained a Vue.js storefront with Jest tests.
EDUCATION
B.S. Computer Science, University of Oregon, 2018`;
    expect(check(doc)).toEqual([]);
  });

  it("passes a cover letter that names the employer and its product", () => {
    const letter = `Dear Hiring Manager,

I am excited to apply for the Senior Frontend Engineer role at Globex. At Acme Corp I built React dashboards used by 5,000 customers, and I would love to bring that to Hammerhead.

Sincerely,
Jane Doe`;
    expect(check(letter)).toEqual([]);
  });

  it("flags skills from the posting that are not on the resume", () => {
    const flags = check("Built GraphQL APIs on AWS Lambda and deployed with Kubernetes. Strong React skills.");
    expect(terms(flags, "skill").sort()).toEqual(["AWS", "GraphQL", "Kubernetes", "Lambda"]);
  });

  it("flags well-known skills even when the posting doesn't mention them", () => {
    expect(terms(check("Also experienced with Docker and Python."), "skill").sort()).toEqual(["Docker", "Python"]);
  });

  it("matches tricky skill names as whole words", () => {
    // C# is on the resume; C++ and Go are not. "Node.js" must not be mistaken for "Node" or "JS".
    expect(terms(check("Wrote C# services and C++ tools in Node.js and Go."), "skill").sort()).toEqual(["C++", "Go"]);
    // "go" inside other words or as a verb in lowercase prose still counts only as a whole word.
    expect(terms(check("Good at Google-scale ago."), "skill")).toEqual([]);
  });

  it("flags invented numbers and metrics but allows the resume's own", () => {
    const flags = check("Cut load time by 40% and grew revenue by 300% for 2M users across 12 teams since 2021.");
    expect(terms(flags, "number")).toEqual(["300%", "2M", "12"]);
  });

  it("flags names that appear on neither the resume nor the posting", () => {
    const flags = check("Previously led the platform team at Hooli and studied at Stanford University.");
    expect(terms(flags, "name")).toEqual(["Hooli", "Stanford University"]);
  });

  it("does not flag capitalised words at the start of sentences or bullets", () => {
    expect(check("Delivered features quickly.\n- Shipped dashboards.\n• Mentored peers. Improved tests.")).toEqual([]);
  });

  it("uses the match gaps as extra skills to watch for", () => {
    const flags = check("Experienced with Terraform-managed OAuth2 flows.", ["OAuth2 authentication"]);
    expect(terms(flags, "skill")).toContain("OAuth2");
  });

  it("does not mistake everyday words for skills (express, spring, go)", () => {
    expect(terms(check("I would love to express my interest; in spring we go live."), "skill")).toEqual([]);
    expect(terms(check("Built APIs with Express and Spring Boot."), "skill").sort()).toEqual(["Express", "Spring", "Spring Boot"]);
  });

  it("treats 5k, 5K and 5,000 as the same number", () => {
    expect(terms(check("Dashboards for 5k customers, then 5K, then 5,000."), "number")).toEqual([]);
    expect(terms(check("Dashboards for 6k customers."), "number")).toEqual(["6k"]);
  });

  it("judges hyphenated words by their name part", () => {
    expect(terms(check("Shipped React-based and Brightwave-style dashboards in Hooli-like teams."), "name")).toEqual(["Hooli-like"]);
  });

  it("ignores generic acronyms such as UI, UX and API", () => {
    expect(check("Improved UI and UX quality and documented the API for SaaS customers.")).toEqual([]);
  });

  it("reports each term once", () => {
    const flags = check("GraphQL here. GraphQL there. graphql everywhere.");
    expect(flags.filter((f) => f.term.toLowerCase() === "graphql")).toHaveLength(1);
  });
});
