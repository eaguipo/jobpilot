/**
 * Deterministic stand-in for Gemini, used by the e2e tests (JOBPILOT_FAKE_LLM=1)
 * so they run free and offline. Picks its behaviour from the requested schema.
 *
 * Magic words in a job description:
 * - FAKE_LLM_UNAVAILABLE: act busy (HTTP 503).
 * - FAKE_LLM_INVENT: tailoring adds facts that are not on the resume.
 *
 * Resume parsing (story 12) reads the test resumes' layout:
 *   "Name - Headline", an email line, "Company (2021-present) - Title" roles with "- " bullets,
 *   "Degree, School, 2014-2018" under EDUCATION, and "SKILLS: a, b, c".
 * Magic words in the resume: FAKE_LLM_UNAVAILABLE (busy), FAKE_LLM_INVENT (adds a job that isn't on it).
 */

import { LlmError, type GenerateJson } from "./llm";

const FAKE_SKILLS = ["React", "TypeScript", "Next.js", "Node.js", "GraphQL", "Python", "AWS", "Docker", "Kubernetes", "SQL", "Tailwind"];

const between = (text: string, tag: string) => new RegExp(`<${tag}>\\n?([\\s\\S]*?)\\n?</${tag}>`).exec(text)?.[1] ?? "";
const has = (text: string, skill: string) => new RegExp(`\\b${skill.replace(/[.+]/g, "\\$&")}\\b`, "i").test(text);
const field = (posting: string, name: string) => new RegExp(`^${name}: (.*)$`, "m").exec(posting)?.[1] ?? "";

export const fakeGenerate: GenerateJson = async ({ prompt, schema }) => {
  const resume = between(prompt, "resume");
  const posting = between(prompt, "job_posting");
  const properties = (schema as { properties?: Record<string, unknown> }).properties ?? {};
  if ("experience" in properties) {
    if (resume.includes("FAKE_LLM_UNAVAILABLE")) throw new LlmError("unavailable", "Fake Gemini is busy.");
    return fakeParse(resume);
  }
  if (posting.includes("FAKE_LLM_UNAVAILABLE")) throw new LlmError("unavailable", "Fake Gemini is busy.");

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

function fakeParse(resume: string) {
  const lines = resume.split("\n").map((l) => l.trim()).filter(Boolean);
  const experience: { title: string; company: string; location: string; start: string; end: string; bullets: string[] }[] = [];
  const education: { school: string; degree: string; start: string; end: string }[] = [];
  let skills: string[] = [];
  let section = "";
  for (const line of lines.slice(1)) {
    if (/^[A-Z ]{4,}$/.test(line)) {
      section = line;
      continue;
    }
    const skillLine = /^SKILLS:\s*(.+)$/i.exec(line);
    if (skillLine) {
      skills = skillLine[1].split(",").map((s) => s.trim());
      continue;
    }
    const role = /^(.+?) \((\d{4})-(\w+)\) - (.+)$/.exec(line);
    if (role) {
      experience.push({ company: role[1], start: role[2], end: role[3], title: role[4], location: "", bullets: [] });
      continue;
    }
    if (line.startsWith("- ") && experience.length) {
      experience[experience.length - 1].bullets.push(line.slice(2));
      continue;
    }
    const school = /^(.+?), (.+?), (\d{4})-(\d{4})$/.exec(line);
    if (section === "EDUCATION" && school) education.push({ degree: school[1], school: school[2], start: school[3], end: school[4] });
  }
  if (resume.includes("FAKE_LLM_INVENT"))
    experience.push({ title: "Staff Engineer", company: "Hooli", location: "", start: "2015", end: "2018", bullets: ["Grew revenue by 300%."] });
  return {
    contact: {
      name: lines[0]?.split(/ [-—–] /)[0] ?? "",
      email: /[^\s@]+@[^\s@]+\.[a-z]+/i.exec(resume)?.[0] ?? "",
      phone: "",
      location: "",
      links: [],
    },
    summary: "",
    experience,
    education,
    skills,
  };
}
