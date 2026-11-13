/**
 * "Simple check" for task 86: flags anything in a generated document that
 * isn't on the master resume. It is a review aid, not a proof: it can miss
 * reworded claims and can flag harmless words. The full guardrail is story 42.
 */

export type FlagKind = "skill" | "number" | "name";
export interface Flag {
  kind: FlagKind;
  term: string;
}

/** Common skills/tools. Flagged when the document mentions one the resume doesn't. */
const KNOWN_SKILLS = [
  // languages
  "JavaScript", "TypeScript", "Python", "Java", "Kotlin", "Swift", "Go", "Golang", "Rust", "Ruby", "PHP", "C#", "C++", "Scala", "Elixir", "Dart", "R", "SQL", "Bash",
  // frontend
  "React", "React Native", "Next.js", "Vue", "Vue.js", "Nuxt", "Angular", "Svelte", "Redux", "Tailwind", "Tailwind CSS", "Sass", "jQuery", "Webpack", "Vite", "Storybook", "HTML", "CSS",
  // backend
  "Node.js", "Express", "NestJS", "Django", "Flask", "FastAPI", "Spring", "Spring Boot", "Rails", "Ruby on Rails", "Laravel", ".NET", "ASP.NET", "GraphQL", "REST", "gRPC", "Kafka", "RabbitMQ",
  // data
  "PostgreSQL", "Postgres", "MySQL", "MongoDB", "Redis", "DynamoDB", "Elasticsearch", "Snowflake", "BigQuery", "Spark", "Airflow", "dbt", "Pandas", "TensorFlow", "PyTorch",
  // cloud / devops
  "AWS", "Azure", "GCP", "Google Cloud", "Lambda", "S3", "EC2", "Docker", "Kubernetes", "Terraform", "Ansible", "Jenkins", "GitHub Actions", "CircleCI", "CI/CD", "Linux", "Datadog", "Grafana", "Prometheus",
  // testing
  "Jest", "Vitest", "Cypress", "Playwright", "Selenium", "Mocha",
  // other
  "Figma", "Salesforce", "SAP", "Tableau", "Power BI", "Excel", "Jira", "Scrum", "Agile", "Kanban", "PMP", "SOC 2", "HIPAA", "PCI", "Machine Learning", "LLM",
];

/** Capitalised words that are normal in resumes and letters, not facts. */
const COMMON_WORDS = new Set(
  `I I'm I've I'd A An The And Or But For With In On At To From Of By As My Me We Our You Your It Its This That These Those
  Dear Hiring Manager Team Sincerely Regards Best Kind Warm Thank Thanks Respectfully Yours
  Summary Profile Professional Experience Work Employment Skills Technical Core Competencies Education Projects Certifications Certification
  Achievements Highlights Languages Interests Awards Publications Volunteer References Contact Objective Qualifications Tools Technologies
  Present Current Currently Today Remote Hybrid Onsite On-site Full-time Part-time Contract Senior Junior Lead Principal Staff Head
  January February March April May June July August September October November December Jan Feb Mar Apr Jun Jul Aug Sep Sept Oct Nov Dec
  Monday Tuesday Wednesday Thursday Friday Bachelor Bachelor's Master Master's BS BA MS MBA PhD B.S. M.S. Inc Ltd LLC Corp Co
  Engineer Engineering Developer Development Software Frontend Backend Full Stack Fullstack Designer Design Product Manager Management
  Analyst Data Scientist Architect Consultant Specialist Coordinator Director Officer Intern Associate Assistant
  UI UX API APIs Web App Apps SPA SaaS B2B B2C SEO KPI KPIs MVP QA CTO CEO HR IT`
    .split(/\s+/)
    .map((w) => w.toLowerCase()),
);

/** Skill names that are also everyday words: only count them when written as the name ("Express", not "express"). */
const EVERYDAY_WORD_SKILLS = new Set(
  ["Express", "Spring", "Rails", "Go", "R", "Swift", "Rust", "Dart", "Ruby", "Excel", "Spark", "Lambda", "Flask", "Agile", "Scrum", "REST", "SAP", "PCI"].map((s) => s.toLowerCase()),
);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Matches a term as a whole word; handles terms like "C#", "C++", ".NET", "Node.js". */
function mentions(text: string, term: string): boolean {
  const flags = EVERYDAY_WORD_SKILLS.has(term.toLowerCase()) ? "" : "i";
  return new RegExp(`(?<![\\w.+#])${escapeRe(term)}(?![\\w+#]|\\.\\w)`, flags).test(text);
}

/** Tech-looking words from the job posting: GraphQL, AWS, Node.js, C#, S3, OAuth2… */
function techTermsFrom(text: string): string[] {
  const words = text.match(/[A-Za-z][A-Za-z0-9]*(?:[.#+/][A-Za-z0-9+#]+)*[+#]*/g) ?? [];
  return words.filter(
    (w) =>
      w.length >= 2 &&
      !COMMON_WORDS.has(w.toLowerCase()) &&
      (/[a-z][A-Z]/.test(w) || // camelCase: GraphQL, JavaScript
        (/[A-Z].*[A-Z]/.test(w) && /[a-z]/.test(w)) || // OAuth, DevOps
        /[A-Za-z]\d|\d[A-Za-z]/.test(w) || // OAuth2, S3, EC2
        /^[A-Z0-9]{2,6}$/.test(w) || // acronyms: AWS, SQL
        /[.#+]/.test(w)), // Node.js, C#, C++
  );
}

/** Numeric value of a figure, so "400k", "400K" and "400,000" compare equal. */
function numberValue(n: string): number {
  const m = /^([\d,]+(?:\.\d+)?)\s?(k|m)?/i.exec(n);
  if (!m) return NaN;
  const base = Number(m[1].replace(/,/g, ""));
  const mult = m[2]?.toLowerCase() === "k" ? 1e3 : m[2]?.toLowerCase() === "m" ? 1e6 : 1;
  return Math.round(base * mult * 1000) / 1000;
}

/** Numbers and metrics such as 40%, $2M, 10x, 5+ years, 2,000. */
function numbersIn(text: string): string[] {
  return text.match(/\d[\d,]*(?:\.\d+)?\s?(?:%|k|m|x|\+)?/gi)?.map((n) => n.trim()) ?? [];
}

/** Capitalised names not at the start of a sentence or bullet: likely companies, schools, products. */
function namesIn(text: string): string[] {
  const out: string[] = [];
  // Dotted parts are kept so "Next.js" stays one word instead of "Next".
  const word = "[A-Z][a-zA-Z&'’-]+(?:\\.[a-zA-Z]+)*";
  const re = new RegExp(`(?<!^|[.!?:;•\\-–—]\\s*|\\n\\s*)\\b(${word}(?:\\s+${word})*)`, "gm");
  for (const m of text.matchAll(re)) {
    const words = m[1].split(/\s+/).filter((w) => !COMMON_WORDS.has(w.toLowerCase().replace(/[’']s$/, "")));
    if (words.length) out.push(words.join(" "));
  }
  return out;
}

export interface FactCheckInput {
  /** The generated document (tailored resume or cover letter). */
  document: string;
  /** The master resume: the only source of facts. */
  resume: string;
  /** Job posting text, including company and title. Its names may appear in a cover letter. */
  posting: string;
  /** Gaps from the match score: must never appear as claims. */
  gaps?: string[];
}

export function factCheck({ document, resume, posting, gaps = [] }: FactCheckInput): Flag[] {
  const flags: Flag[] = [];
  const seen = new Set<string>();
  const add = (kind: FlagKind, term: string) => {
    const key = `${kind}:${term.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      flags.push({ kind, term });
    }
  };

  // Skills: known list + tech words from the posting and the match gaps.
  const gapTerms = gaps.flatMap((g) => techTermsFrom(g));
  const skillCandidates = [...KNOWN_SKILLS, ...techTermsFrom(posting), ...gapTerms];
  for (const skill of skillCandidates) {
    if (mentions(document, skill) && !mentions(resume, skill)) add("skill", skill);
  }

  // Numbers: every figure must come from the resume.
  const resumeNumbers = new Set(numbersIn(resume).map(numberValue));
  for (const n of numbersIn(document)) {
    if (!resumeNumbers.has(numberValue(n))) add("number", n);
  }

  // Names: allowed if on the resume or in the posting (the employer, its products).
  for (const name of namesIn(document)) {
    // "React-based", "Python-driven": judge the name part only.
    const parts = name.split(/\s+/).map((w) => w.replace(/-[a-z].*$/, ""));
    const known = (word: string) => mentions(resume, word) || mentions(posting, word);
    if (!parts.every(known) && !seen.has(`skill:${name.toLowerCase()}`)) add("name", name);
  }

  return flags;
}
