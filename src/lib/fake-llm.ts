/**
 * Deterministic stand-in for Gemini, used by the e2e tests (JOBPILOT_FAKE_LLM=1)
 * so they run free and offline. Picks its behaviour from the requested schema.
 *
 * Magic words in a job description:
 * - FAKE_LLM_UNAVAILABLE: act busy (HTTP 503).
 * - FAKE_LLM_INVENT: tailoring adds facts that are not on the resume.
 */

import { LlmError, type GenerateJson } from "./llm";

const FAKE_SKILLS = ["React", "TypeScript", "Next.js", "Node.js", "GraphQL", "Python", "AWS", "Docker", "Kubernetes", "SQL", "Tailwind"];

const between = (text: string, tag: string) => new RegExp(`<${tag}>\\n?([\\s\\S]*?)\\n?</${tag}>`).exec(text)?.[1] ?? "";
const has = (text: string, skill: string) => new RegExp(`\\b${skill.replace(/[.+]/g, "\\$&")}\\b`, "i").test(text);
const field = (posting: string, name: string) => new RegExp(`^${name}: (.*)$`, "m").exec(posting)?.[1] ?? "";

export const fakeGenerate: GenerateJson = async ({ prompt, schema }) => {
  const resume = between(prompt, "resume");
  const posting = between(prompt, "job_posting");
  if (posting.includes("FAKE_LLM_UNAVAILABLE")) throw new LlmError("unavailable", "Fake Gemini is busy.");

  const properties = (schema as { properties?: Record<string, unknown> }).properties ?? {};
  if ("coverLetter" in properties) return fakeTailor(resume, posting);

  // Match score: share of the posting's known skills that are on the resume.
  const wanted = FAKE_SKILLS.filter((s) => has(posting, s));
  const met = wanted.filter((s) => has(resume, s)).map((s) => `${s} — on your resume`);
  const gaps = wanted.filter((s) => !has(resume, s));
  const score = wanted.length ? Math.round((100 * met.length) / wanted.length) : 50;
  return { score, met, gaps };
};

function fakeTailor(resume: string, posting: string) {
  const company = field(posting, "Company");
  const title = field(posting, "Title");
  const name = resume.split("\n")[0].split(/[—–-]/)[0].trim() || "Candidate";
  const invent = posting.includes("FAKE_LLM_INVENT");

  const tailored = [
    `SUMMARY`,
    `Tailored for ${title} at ${company}.`,
    ``,
    resume.trim(),
    ...(invent ? [``, `- Deployed services with Kubernetes at Hooli, growing revenue by 300%.`] : []),
  ].join("\n");

  const coverLetter = [
    `Dear Hiring Manager,`,
    ``,
    `I am excited to apply for the ${title} role at ${company}. My resume shows the experience I would bring to the team.`,
    ...(invent ? [``, `I also have deep Kubernetes experience.`] : []),
    ``,
    `Sincerely,`,
    name,
  ].join("\n");

  return { resume: tailored, coverLetter };
}
