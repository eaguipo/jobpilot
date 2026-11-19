import type { AuditEntry, AuditKind } from "./data";

/** How each kind of audit entry reads on the Activity page. */
export const ACTIVITY_LABEL: Record<AuditKind, string> = {
  match_scored: "Match scored",
  resume_tailored: "Resume tailored",
  cover_letter_written: "Cover letter written",
  application_submitted: "Application submitted",
};

/** Kinds that store a document text, viewable on /activity/[id]. */
export const hasDocument = (kind: AuditKind) => kind === "resume_tailored" || kind === "cover_letter_written";

const count = (v: unknown) => (Array.isArray(v) ? v.length : 0);

/**
 * One short line of detail, e.g. "82/100 · 5 met, 2 gaps".
 * `detail` comes from the database trigger; read it defensively anyway.
 */
export function activitySummary(entry: Pick<AuditEntry, "kind" | "detail">): string | null {
  if (entry.kind !== "match_scored") return null;
  const score = entry.detail.score;
  if (typeof score !== "number") return null;
  const met = count(entry.detail.met);
  const gaps = count(entry.detail.gaps);
  return `${score}/100 · ${met} met, ${gaps} ${gaps === 1 ? "gap" : "gaps"}`;
}

/** Positive integer from a URL segment or query value, else undefined. */
export function parseId(raw: string | string[] | undefined): number | undefined {
  if (typeof raw !== "string" || !/^[1-9]\d{0,15}$/.test(raw)) return undefined;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : undefined;
}
