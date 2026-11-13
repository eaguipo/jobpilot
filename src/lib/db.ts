import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/** Prototype data layer (task 82): one local SQLite file, single user. */

export type Db = Database.Database;

import { JOB_STATUSES, type JobStatus } from "./statuses";

export { isJobStatus, JOB_STATUSES, type JobStatus } from "./statuses";

export interface Profile {
  resumeText: string;
  updatedAt: string;
}

export interface Job {
  id: number;
  company: string;
  title: string;
  applyUrl: string;
  description: string;
  status: JobStatus;
  /** 0-100, null until scored (task 85). */
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

const MIGRATIONS: string[] = [
  // v1
  `
  CREATE TABLE profile (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    resume_text TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE TABLE jobs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    company         TEXT NOT NULL,
    title           TEXT NOT NULL,
    apply_url       TEXT NOT NULL,
    description     TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'Matched'
                    CHECK (status IN (${JOB_STATUSES.map((s) => `'${s}'`).join(", ")})),
    score           INTEGER CHECK (score IS NULL OR score BETWEEN 0 AND 100),
    met             TEXT NOT NULL DEFAULT '[]',
    gaps            TEXT NOT NULL DEFAULT '[]',
    tailored_resume TEXT,
    cover_letter    TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );
  CREATE INDEX jobs_status_idx ON jobs (status);
  `,
  // v2 (task 84): one job per posting link.
  `CREATE UNIQUE INDEX jobs_apply_url_uq ON jobs (apply_url);`,
  // v3 (task 87): status history. Existing jobs get one "added" event at their creation time.
  `
  CREATE TABLE status_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id      INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
    from_status TEXT,
    to_status   TEXT NOT NULL,
    changed_at  TEXT NOT NULL
  );
  CREATE INDEX status_events_job_idx ON status_events (job_id, id);
  INSERT INTO status_events (job_id, from_status, to_status, changed_at)
    SELECT id, NULL, status, created_at FROM jobs;
  `,
];

/** Opens (and migrates) a database. Pass ":memory:" in tests. */
export function openDb(file: string): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: Db) {
  const current = db.pragma("user_version", { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

let shared: Db | undefined;

/** App-wide connection. Location can be overridden with JOBPILOT_DB. */
export function getDb(): Db {
  shared ??= openDb(
    process.env.JOBPILOT_DB ?? path.join(process.cwd(), "data", "jobpilot.db"),
  );
  return shared;
}

const now = () => new Date().toISOString();

// ---- profile ----

export function saveProfile(db: Db, resumeText: string): Profile {
  const updatedAt = now();
  db.prepare(
    `INSERT INTO profile (id, resume_text, updated_at) VALUES (1, ?, ?)
     ON CONFLICT (id) DO UPDATE SET resume_text = excluded.resume_text,
                                    updated_at  = excluded.updated_at`,
  ).run(resumeText, updatedAt);
  return { resumeText, updatedAt };
}

export function getProfile(db: Db): Profile | null {
  const row = db
    .prepare(`SELECT resume_text, updated_at FROM profile WHERE id = 1`)
    .get() as { resume_text: string; updated_at: string } | undefined;
  return row ? { resumeText: row.resume_text, updatedAt: row.updated_at } : null;
}

// ---- jobs ----

interface JobRow {
  id: number;
  company: string;
  title: string;
  apply_url: string;
  description: string;
  status: JobStatus;
  score: number | null;
  met: string;
  gaps: string;
  tailored_resume: string | null;
  cover_letter: string | null;
  created_at: string;
  updated_at: string;
}

function toJob(r: JobRow): Job {
  return {
    id: r.id,
    company: r.company,
    title: r.title,
    applyUrl: r.apply_url,
    description: r.description,
    status: r.status,
    score: r.score,
    met: JSON.parse(r.met),
    gaps: JSON.parse(r.gaps),
    tailoredResume: r.tailored_resume,
    coverLetter: r.cover_letter,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function addJob(db: Db, job: NewJob): Job {
  const ts = now();
  const id = db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO jobs (company, title, apply_url, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(job.company, job.title, job.applyUrl, job.description, ts, ts);
    const jobId = Number(lastInsertRowid);
    const { status } = db.prepare(`SELECT status FROM jobs WHERE id = ?`).get(jobId) as { status: JobStatus };
    recordStatus(db, jobId, null, status, ts);
    return jobId;
  })();
  return getJob(db, id)!;
}

export function getJob(db: Db, id: number): Job | null {
  const row = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id) as JobRow | undefined;
  return row ? toJob(row) : null;
}

export function findJobByApplyUrl(db: Db, applyUrl: string): Job | null {
  const row = db.prepare(`SELECT * FROM jobs WHERE apply_url = ?`).get(applyUrl) as JobRow | undefined;
  return row ? toJob(row) : null;
}

export function listJobs(db: Db, opts: { status?: JobStatus } = {}): Job[] {
  const rows = (
    opts.status
      ? db.prepare(`SELECT * FROM jobs WHERE status = ? ORDER BY id DESC`).all(opts.status)
      : db.prepare(`SELECT * FROM jobs ORDER BY id DESC`).all()
  ) as JobRow[];
  return rows.map(toJob);
}

/** Column for each updatable field; only these keys can reach the SQL. */
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

export function updateJob(db: Db, id: number, changes: JobUpdate): Job | null {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(changes)) {
    const column = UPDATABLE[key as keyof JobUpdate];
    if (!column || value === undefined) continue;
    sets.push(`${column} = ?`);
    values.push(key === "met" || key === "gaps" ? JSON.stringify(value) : value);
  }
  if (sets.length === 0) return getJob(db, id);
  const ts = now();
  sets.push("updated_at = ?");
  values.push(ts, id);
  db.transaction(() => {
    const before = db.prepare(`SELECT status FROM jobs WHERE id = ?`).get(id) as { status: JobStatus } | undefined;
    db.prepare(`UPDATE jobs SET ${sets.join(", ")} WHERE id = ?`).run(...values);
    // Every real status change goes into the history (story 62).
    if (before && changes.status !== undefined && changes.status !== before.status) {
      recordStatus(db, id, before.status, changes.status, ts);
    }
  })();
  return getJob(db, id);
}

// ---- status history (task 87) ----

export interface StatusEvent {
  id: number;
  jobId: number;
  /** null for the event created when the job was added. */
  fromStatus: JobStatus | null;
  toStatus: JobStatus;
  changedAt: string;
}

function recordStatus(db: Db, jobId: number, from: JobStatus | null, to: JobStatus, at: string) {
  db.prepare(`INSERT INTO status_events (job_id, from_status, to_status, changed_at) VALUES (?, ?, ?, ?)`).run(jobId, from, to, at);
}

/** Newest first. */
export function listStatusEvents(db: Db, jobId: number): StatusEvent[] {
  const rows = db
    .prepare(`SELECT id, job_id, from_status, to_status, changed_at FROM status_events WHERE job_id = ? ORDER BY id DESC`)
    .all(jobId) as { id: number; job_id: number; from_status: JobStatus | null; to_status: JobStatus; changed_at: string }[];
  return rows.map((r) => ({ id: r.id, jobId: r.job_id, fromStatus: r.from_status, toStatus: r.to_status, changedAt: r.changed_at }));
}

/** History for many jobs in one query, keyed by job id (newest first). */
export function listStatusEventsByJob(db: Db): Map<number, StatusEvent[]> {
  const rows = db
    .prepare(`SELECT id, job_id, from_status, to_status, changed_at FROM status_events ORDER BY id DESC`)
    .all() as { id: number; job_id: number; from_status: JobStatus | null; to_status: JobStatus; changed_at: string }[];
  const byJob = new Map<number, StatusEvent[]>();
  for (const r of rows) {
    const list = byJob.get(r.job_id) ?? [];
    list.push({ id: r.id, jobId: r.job_id, fromStatus: r.from_status, toStatus: r.to_status, changedAt: r.changed_at });
    byJob.set(r.job_id, list);
  }
  return byJob;
}

/** Number of jobs per status, with every status present (0 if none). */
export function countJobsByStatus(db: Db): Record<JobStatus, number> {
  const counts = Object.fromEntries(JOB_STATUSES.map((s) => [s, 0])) as Record<JobStatus, number>;
  const rows = db.prepare(`SELECT status, COUNT(*) AS n FROM jobs GROUP BY status`).all() as { status: JobStatus; n: number }[];
  for (const r of rows) counts[r.status] = r.n;
  return counts;
}


export function deleteJob(db: Db, id: number): boolean {
  return db.prepare(`DELETE FROM jobs WHERE id = ?`).run(id).changes > 0;
}
