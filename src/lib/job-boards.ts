import { LIMITS } from "./jobs";
import { companyFromSlug, type JobLink } from "./job-link";
import { htmlToText, tidy } from "./html-text";

/**
 * Reads one posting from a board's public JSON API (task 22) and turns it into
 * Add job form values. Only these fixed API hosts are ever called; the pasted
 * URL is parsed (job-link.ts), never fetched.
 */

export interface FetchedJob {
  company: string;
  title: string;
  description: string;
}
export type BoardErrorKind = "not_found" | "unavailable" | "bad_response";
export type BoardResult = { ok: true; job: FetchedJob } | { ok: false; error: BoardErrorKind };

type Fetch = typeof fetch;
const TIMEOUT_MS = 10_000;
/** Ashby only offers the whole board in one response; big companies' boards run to a few MB. */
const MAX_BYTES = 10 * 1024 * 1024;

/** The API URL for a parsed link. Slug and id were validated by parseJobLink, and are encoded anyway. */
export function apiUrl(link: JobLink): string {
  const slug = encodeURIComponent(link.slug);
  const id = encodeURIComponent(link.postingId);
  switch (link.board) {
    case "greenhouse":
      // EU boards (job-boards.eu.greenhouse.io) are served by the same public API.
      return `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${id}`;
    case "lever":
      return `https://api${link.region === "eu" ? ".eu" : ""}.lever.co/v0/postings/${slug}/${id}?mode=json`;
    case "ashby":
      return `https://api.ashbyhq.com/posting-api/job-board/${slug}`;
  }
}

export async function fetchJobFromBoard(link: JobLink, fetchImpl: Fetch = fetch): Promise<BoardResult> {
  const got = await getJson(apiUrl(link), fetchImpl);
  if (!got.ok) return got;
  try {
    const job = toJob(link, got.json);
    return job ? { ok: true, job } : { ok: false, error: link.board === "ashby" ? "not_found" : "bad_response" };
  } catch {
    return { ok: false, error: "bad_response" };
  }
}

function toJob(link: JobLink, json: unknown): FetchedJob | null {
  const o = obj(json);
  switch (link.board) {
    case "greenhouse": {
      // `content` is HTML with its tags entity-escaped (&lt;p&gt;), so it's decoded twice.
      const body = htmlToText(htmlToText(str(o.content)));
      return finish(str(o.company_name) || companyFromSlug(link.slug), str(o.title), str(obj(o.location).name), body);
    }
    case "lever": {
      const lists = Array.isArray(o.lists) ? o.lists.map(obj) : [];
      const body = [
        str(o.openingPlain),
        str(o.descriptionBodyPlain) || str(o.descriptionPlain),
        ...lists.map((l) => `${str(l.text)}\n${htmlToText(str(l.content))}`),
        str(o.additionalPlain),
      ];
      return finish(companyFromSlug(link.slug), str(o.text), str(obj(o.categories).location), body.map(tidy).filter(Boolean).join("\n\n"));
    }
    case "ashby": {
      const jobs = Array.isArray(o.jobs) ? o.jobs.map(obj) : [];
      const j = jobs.find((x) => str(x.id).toLowerCase() === link.postingId);
      if (!j) return null;
      const body = str(j.descriptionPlain) ? tidy(str(j.descriptionPlain)) : htmlToText(str(j.descriptionHtml));
      return finish(companyFromSlug(link.slug), str(j.title), str(j.location), body);
    }
  }
}

function finish(company: string, title: string, location: string, body: string): FetchedJob | null {
  const t = tidy(title);
  if (!t || !body) return null;
  const description = (location ? `Location: ${tidy(location)}\n\n${body}` : body).slice(0, LIMITS.descriptionMax);
  return { company: tidy(company).slice(0, LIMITS.company), title: t.slice(0, LIMITS.title), description };
}

async function getJson(url: string, fetchImpl: Fetch): Promise<{ ok: true; json: unknown } | { ok: false; error: BoardErrorKind }> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      redirect: "error", // a redirect could lead anywhere; these APIs don't need one
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "unavailable" };
  }
  if (res.status === 404) return { ok: false, error: "not_found" };
  if (!res.ok) return { ok: false, error: res.status === 429 || res.status >= 500 ? "unavailable" : "bad_response" };
  if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) return { ok: false, error: "bad_response" };
  try {
    const text = await readCapped(res, MAX_BYTES);
    return text === null ? { ok: false, error: "bad_response" } : { ok: true, json: JSON.parse(text) };
  } catch {
    return { ok: false, error: "bad_response" };
  }
}

async function readCapped(res: Response, max: number): Promise<string | null> {
  if (!res.body) return res.text();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : "");
