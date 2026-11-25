/**
 * Recognises job posting links from the boards JobPilot can read (task 22).
 * Pure: it only reads the URL. The fetchers (job-boards.ts) then call each board's
 * public JSON API, never the pasted URL itself, so a pasted link can't make the
 * server request anything else.
 */

export type JobBoard = "greenhouse" | "lever" | "ashby";

export interface JobLink {
  board: JobBoard;
  /** Company's board name on that site, e.g. "acme" in jobs.lever.co/acme/… */
  slug: string;
  /** Posting id: digits for Greenhouse, a UUID for Lever and Ashby. */
  postingId: string;
  /** Lever and Greenhouse run separate EU hosts with their own APIs. */
  region: "us" | "eu";
}

const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const DIGITS = /^\d{1,20}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The posting a link points at, or null if it isn't a link we can read. */
export function parseJobLink(input: string): JobLink | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  // Greenhouse: boards.greenhouse.io/<slug>/jobs/<id>, job-boards[.eu].greenhouse.io/<slug>/jobs/<id>,
  // and the embed form boards.greenhouse.io/embed/job_app?for=<slug>&token=<id>.
  const gh = /^(?:boards|job-boards)(\.eu)?\.greenhouse\.io$/.exec(host);
  if (gh) {
    const region = gh[1] ? "eu" : "us";
    if (parts[0] === "embed" && parts[1] === "job_app") {
      return make("greenhouse", url.searchParams.get("for"), url.searchParams.get("token"), DIGITS, region);
    }
    if (parts[1] === "jobs") return make("greenhouse", parts[0], parts[2], DIGITS, region);
    return null;
  }

  // Lever: jobs[.eu].lever.co/<slug>/<uuid>[/apply]
  const lv = /^jobs(\.eu)?\.lever\.co$/.exec(host);
  if (lv) {
    if (parts.length > 3 || (parts[2] !== undefined && parts[2] !== "apply")) return null;
    return make("lever", parts[0], parts[1], UUID, lv[1] ? "eu" : "us");
  }

  // Ashby: jobs.ashbyhq.com/<slug>/<uuid>[/application]
  if (host === "jobs.ashbyhq.com") {
    if (parts.length > 3 || (parts[2] !== undefined && parts[2] !== "application")) return null;
    return make("ashby", parts[0], parts[1], UUID, "us");
  }

  return null;
}

function make(board: JobBoard, slug: string | null | undefined, id: string | null | undefined, idPattern: RegExp, region: "us" | "eu"): JobLink | null {
  if (!slug || !id) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    return null;
  }
  if (!SLUG.test(decoded) || !idPattern.test(id)) return null;
  return { board, slug: decoded, postingId: id.toLowerCase(), region };
}

/**
 * One link per posting, whatever form was pasted (embed, /apply, tracking query),
 * so the same job is caught as a duplicate.
 */
export function canonicalJobUrl(link: JobLink): string {
  const slug = encodeURIComponent(link.slug);
  switch (link.board) {
    case "greenhouse":
      return `https://job-boards${link.region === "eu" ? ".eu" : ""}.greenhouse.io/${slug}/jobs/${link.postingId}`;
    case "lever":
      return `https://jobs${link.region === "eu" ? ".eu" : ""}.lever.co/${slug}/${link.postingId}`;
    case "ashby":
      return `https://jobs.ashbyhq.com/${slug}/${link.postingId}`;
  }
}

/** Company name guessed from the board slug, for boards whose API doesn't say: "acme-corp" → "Acme Corp". */
export function companyFromSlug(slug: string): string {
  return slug
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export const SUPPORTED_BOARDS_HINT = "Greenhouse, Lever or Ashby";
