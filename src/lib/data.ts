/**
 * Data layer on Supabase (replaces the SQLite prototype in db.ts).
 * Every function takes a Supabase client acting AS THE SIGNED-IN USER, so row-level
 * security (supabase/migrations) decides what each person can see and change:
 * users only ever get their own profile, jobs and history. Owner columns (user_id)
 * default to auth.uid() and are never trusted from the client.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { JOB_STATUSES, type JobStatus } from "./statuses";

export { isJobStatus, JOB_STATUSES, type JobStatus } from "./statuses";

export interface Profile {
  resumeText: string;
  updatedAt: string;
  /** md5 of resumeText, kept by Postgres (story 12). */
  resumeMd5: string;
  /** The resume parsed into sections, unchecked: read it with readStructuredResume(). */
  structured: unknown;
  /** md5 of the resume text the structure was parsed from; differs from resumeMd5 once the resume changes. */
  structuredFrom: string | null;
  structuredAt: string | null;
}

export interface Job {
  id: number;
  company: string;
  title: string;
  applyUrl: string;
  description: string;
  status: JobStatus;
  /** 0-100, null until scored. */
  score: number | null;
  met: string[];
  gaps: string[];
  tailoredResume: string | null;
  coverLetter: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NewJob = Pick<Job, "company" | "title" | "applyUrl" | "description">;
export type JobUpdate = Partial<Omit<Job, "id" | "createdAt" | "updatedAt">>;

export interface StatusEvent {
  id: number;
  jobId: number;
  /** null for the event created when the job was added. */
  fromStatus: JobStatus | null;
  toStatus: JobStatus;
  changedAt: string;
}

/** A Supabase/Postgres error, with its code kept (e.g. 23505 = duplicate). */
export class DataError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "DataError";
  }
}
const fail = (what: string, error: { message: string; code?: string }): never => {
  throw new DataError(`${what}: ${error.message}`, error.code);
};

// ---- profile ----

const PROFILE_COLUMNS = "resume_text, updated_at, resume_md5, structured, structured_from, structured_at";
interface ProfileRow {
  resume_text: string;
  updated_at: string;
  resume_md5: string;
  structured: unknown;
  structured_from: string | null;
  structured_at: string | null;
}
const toProfile = (r: ProfileRow): Profile => ({
  resumeText: r.resume_text,
  updatedAt: r.updated_at,
  resumeMd5: r.resume_md5,
  structured: r.structured,
  structuredFrom: r.structured_from,
  structuredAt: r.structured_at,
});

export async function getProfile(sb: SupabaseClient): Promise<Profile | null> {
  const { data, error } = await sb.from("profiles").select(PROFILE_COLUMNS).maybeSingle<ProfileRow>();
  if (error) fail("Loading your resume failed", error);
  return data ? toProfile(data) : null;
}

/** One resume per user; saving again replaces it. */
export async function saveProfile(sb: SupabaseClient, userId: string, resumeText: string): Promise<Profile> {
  const { data, error } = await sb
    .from("profiles")
    .upsert({ user_id: userId, resume_text: resumeText }, { onConflict: "user_id" })
    .select(PROFILE_COLUMNS)
    .single<ProfileRow>();
  if (error) fail("Saving your resume failed", error);
  return toProfile(data!);
}

/**
 * Saves the parsed structure (story 12), but only if the resume is still the text it was
 * parsed from (`fromMd5`). Returns false when the resume changed meanwhile; nothing is saved then.
 */
export async function saveStructuredResume(sb: SupabaseClient, fromMd5: string, structured: object): Promise<boolean> {
  const { data, error } = await sb
    .from("profiles")
    .update({ structured, structured_from: fromMd5, structured_at: new Date().toISOString() })
    .eq("resume_md5", fromMd5)
    .select("user_id");
  if (error) fail("Saving your structured profile failed", error);
  return (data?.length ?? 0) > 0;
}

// ---- jobs ----

const JOB_COLUMNS =
  "id, company, title, apply_url, description, status, score, met, gaps, tailored_resume, cover_letter, created_at, updated_at";

interface JobRow {
  id: number;
  company: string;
  title: string;
  apply_url: string;
  description: string;
  status: JobStatus;
  score: number | null;
  met: string[];
  gaps: string[];
  tailored_resume: string | null;
  cover_letter: string | null;
  created_at: string;
  updated_at: string;
}

const toJob = (r: JobRow): Job => ({
  id: r.id,
  company: r.company,
  title: r.title,
  applyUrl: r.apply_url,
  description: r.description,
  status: r.status,
  score: r.score,
  met: r.met ?? [],
  gaps: r.gaps ?? [],
  tailoredResume: r.tailored_resume,
  coverLetter: r.cover_letter,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** Throws DataError with code "23505" if the user already added this link. */
export async function addJob(sb: SupabaseClient, job: NewJob): Promise<Job> {
  const { data, error } = await sb
    .from("jobs")
    .insert({ company: job.company, title: job.title, apply_url: job.applyUrl, description: job.description })
    .select(JOB_COLUMNS)
    .single<JobRow>();
  if (error) fail("Adding the job failed", error);
  return toJob(data!);
}

export async function getJob(sb: SupabaseClient, id: number): Promise<Job | null> {
  const { data, error } = await sb.from("jobs").select(JOB_COLUMNS).eq("id", id).maybeSingle<JobRow>();
  if (error) fail("Loading the job failed", error);
  return data ? toJob(data) : null;
}

export async function findJobByApplyUrl(sb: SupabaseClient, applyUrl: string): Promise<Job | null> {
  const { data, error } = await sb.from("jobs").select(JOB_COLUMNS).eq("apply_url", applyUrl).maybeSingle<JobRow>();
  if (error) fail("Checking for duplicates failed", error);
  return data ? toJob(data) : null;
}

/** Newest first. */
export async function listJobs(sb: SupabaseClient, opts: { status?: JobStatus } = {}): Promise<Job[]> {
  let query = sb.from("jobs").select(JOB_COLUMNS).order("created_at", { ascending: false }).order("id", { ascending: false });
  if (opts.status) query = query.eq("status", opts.status);
  const { data, error } = await query.returns<JobRow[]>();
  if (error) fail("Loading your jobs failed", error);
  return (data ?? []).map(toJob);
}

const UPDATABLE: Record<keyof JobUpdate, string> = {
  company: "company",
  title: "title",
  applyUrl: "apply_url",
  description: "description",
  status: "status",
  score: "score",
  met: "met",
  gaps: "gaps",
  tailoredResume: "tailored_resume",
  coverLetter: "cover_letter",
};

/** Status changes are recorded in the history by a database trigger. Returns null if not found. */
export async function updateJob(sb: SupabaseClient, id: number, changes: JobUpdate): Promise<Job | null> {
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changes)) {
    const column = UPDATABLE[key as keyof JobUpdate];
    if (column && value !== undefined) row[column] = value;
  }
  if (Object.keys(row).length === 0) return getJob(sb, id);
  const { data, error } = await sb.from("jobs").update(row).eq("id", id).select(JOB_COLUMNS).maybeSingle<JobRow>();
  if (error) fail("Saving the job failed", error);
  return data ? toJob(data) : null;
}

export async function deleteJob(sb: SupabaseClient, id: number): Promise<boolean> {
  const { data, error } = await sb.from("jobs").delete().eq("id", id).select("id");
  if (error) fail("Deleting the job failed", error);
  return (data ?? []).length > 0;
}

/** Number of the user's jobs per status, every status present (0 if none). */
export async function countJobsByStatus(sb: SupabaseClient): Promise<Record<JobStatus, number>> {
  const counts = Object.fromEntries(JOB_STATUSES.map((s) => [s, 0])) as Record<JobStatus, number>;
  const { data, error } = await sb.from("jobs").select("status").returns<{ status: JobStatus }[]>();
  if (error) fail("Counting your jobs failed", error);
  for (const r of data ?? []) counts[r.status] += 1;
  return counts;
}

// ---- status history (written by a trigger, read-only here) ----

interface EventRow {
  id: number;
  job_id: number;
  from_status: JobStatus | null;
  to_status: JobStatus;
  changed_at: string;
}
const toEvent = (r: EventRow): StatusEvent => ({
  id: r.id,
  jobId: r.job_id,
  fromStatus: r.from_status,
  toStatus: r.to_status,
  changedAt: r.changed_at,
});

/** Newest first. */
export async function listStatusEvents(sb: SupabaseClient, jobId: number): Promise<StatusEvent[]> {
  const { data, error } = await sb
    .from("status_events")
    .select("id, job_id, from_status, to_status, changed_at")
    .eq("job_id", jobId)
    .order("id", { ascending: false })
    .returns<EventRow[]>();
  if (error) fail("Loading the status history failed", error);
  return (data ?? []).map(toEvent);
}

/** All of the user's history in one query, keyed by job id (newest first). */
export async function listStatusEventsByJob(sb: SupabaseClient): Promise<Map<number, StatusEvent[]>> {
  const { data, error } = await sb
    .from("status_events")
    .select("id, job_id, from_status, to_status, changed_at")
    .order("id", { ascending: false })
    .returns<EventRow[]>();
  if (error) fail("Loading the status history failed", error);
  const byJob = new Map<number, StatusEvent[]>();
  for (const r of data ?? []) {
    const list = byJob.get(r.job_id) ?? [];
    list.push(toEvent(r));
    byJob.set(r.job_id, list);
  }
  return byJob;
}

// ---- audit log (task 75) ----
// Written only by a database trigger when a score or document is generated;
// users can read their own entries and change nothing (see the migration).

export const AUDIT_KINDS = ["match_scored", "resume_tailored", "cover_letter_written", "application_submitted"] as const;
export type AuditKind = (typeof AUDIT_KINDS)[number];

export interface AuditEntry {
  id: number;
  /** null once the job has been deleted; jobCompany/jobTitle still say what it was. */
  jobId: number | null;
  kind: AuditKind;
  jobCompany: string;
  jobTitle: string;
  /** e.g. { score, met, gaps } for match_scored. */
  detail: Record<string, unknown>;
  /** Storage path of the submission screenshot (story 95). */
  screenshotPath: string | null;
  createdAt: string;
}

/** An entry with the full generated document text (only fetched one at a time). */
export interface AuditEntryWithDocument extends AuditEntry {
  document: string | null;
}

// The list leaves out `document` (several KB each); getAuditEntry loads it on demand.
const AUDIT_COLUMNS = "id, job_id, kind, job_company, job_title, detail, screenshot_path, created_at";

interface AuditRow {
  id: number;
  job_id: number | null;
  kind: AuditKind;
  job_company: string;
  job_title: string;
  detail: Record<string, unknown> | null;
  screenshot_path: string | null;
  created_at: string;
  document?: string | null;
}

const toAuditEntry = (r: AuditRow): AuditEntry => ({
  id: r.id,
  jobId: r.job_id,
  kind: r.kind,
  jobCompany: r.job_company,
  jobTitle: r.job_title,
  detail: r.detail ?? {},
  screenshotPath: r.screenshot_path,
  createdAt: r.created_at,
});

export const AUDIT_PAGE_SIZE = 50;

/**
 * Newest first, `limit` entries at a time (1-200). Pass the last id you got as
 * `beforeId` for the next page. Entries are only ever added, so id order is stable.
 */
export async function listAuditLog(
  sb: SupabaseClient,
  opts: { limit?: number; beforeId?: number } = {},
): Promise<AuditEntry[]> {
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? AUDIT_PAGE_SIZE), 1), 200);
  let query = sb.from("audit_log").select(AUDIT_COLUMNS).order("id", { ascending: false }).limit(limit);
  if (opts.beforeId !== undefined) query = query.lt("id", opts.beforeId);
  const { data, error } = await query.returns<AuditRow[]>();
  if (error) fail("Loading your activity failed", error);
  return (data ?? []).map(toAuditEntry);
}

/** One entry with its document text, or null if it isn't yours or doesn't exist. */
export async function getAuditEntry(sb: SupabaseClient, id: number): Promise<AuditEntryWithDocument | null> {
  const { data, error } = await sb
    .from("audit_log")
    .select(`${AUDIT_COLUMNS}, document`)
    .eq("id", id)
    .maybeSingle<AuditRow>();
  if (error) fail("Loading the activity entry failed", error);
  return data ? { ...toAuditEntry(data), document: data.document ?? null } : null;
}
