/** Job statuses. Kept apart from db.ts so browser code can import them without SQLite. */

export const JOB_STATUSES = ["Matched", "Applied", "Interviewing", "Offer", "Rejected"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export function isJobStatus(value: unknown): value is JobStatus {
  return typeof value === "string" && (JOB_STATUSES as readonly string[]).includes(value);
}
