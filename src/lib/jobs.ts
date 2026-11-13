/** Validation for the Add job form (task 84). Pure, so it is easy to test. */

import type { NewJob } from "./db";

export const LIMITS = {
  company: 200,
  title: 200,
  applyUrl: 2_000,
  descriptionMin: 50,
  descriptionMax: 50_000,
} as const;

export type JobField = keyof NewJob;
export type JobCheck =
  | { ok: true; job: NewJob }
  | { ok: false; errors: Partial<Record<JobField, string>> };

const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * Only http(s) links are allowed: the link is rendered as <a href>, so a
 * javascript: or data: URL would run code when clicked.
 * Strips the #fragment and trims, so the same posting is recognised as a duplicate.
 */
export function normaliseApplyUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname.includes(".") && url.hostname !== "localhost") return null;
  url.hash = "";
  return url.toString();
}

export function checkNewJob(input: Record<JobField, unknown>): JobCheck {
  const errors: Partial<Record<JobField, string>> = {};
  const company = str(input.company).trim();
  const title = str(input.title).trim();
  const rawUrl = str(input.applyUrl).trim();
  const description = str(input.description)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .trim();

  if (!company) errors.company = "Enter the company name.";
  else if (company.length > LIMITS.company) errors.company = `Keep it under ${LIMITS.company} characters.`;

  if (!title) errors.title = "Enter the job title.";
  else if (title.length > LIMITS.title) errors.title = `Keep it under ${LIMITS.title} characters.`;

  const applyUrl = rawUrl ? normaliseApplyUrl(rawUrl) : null;
  if (!rawUrl) errors.applyUrl = "Paste the link to the job posting or application.";
  else if (rawUrl.length > LIMITS.applyUrl) errors.applyUrl = "That link is too long.";
  else if (!applyUrl) errors.applyUrl = "Use a full web link starting with https://";

  if (!description) errors.description = "Paste the job description.";
  else if (description.length < LIMITS.descriptionMin)
    errors.description = `That looks too short for a job description (at least ${LIMITS.descriptionMin} characters).`;
  else if (description.length > LIMITS.descriptionMax)
    errors.description = `Keep it under ${LIMITS.descriptionMax.toLocaleString("en-US")} characters.`;

  if (Object.keys(errors).length > 0 || !applyUrl) return { ok: false, errors };
  return { ok: true, job: { company, title, applyUrl, description } };
}
