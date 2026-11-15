/**
 * Background worker (task 71): claims tasks from the Postgres queue and runs them.
 * Runs with the Supabase secret key (bypasses RLS), so every query is scoped to the
 * task's own user explicitly.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { LlmError, type GenerateJson, type LlmErrorKind } from "../lib/llm";
import { scoreMatch } from "../lib/match";
import { tailor } from "../lib/tailor";

export interface Task {
  id: number;
  user_id: string;
  kind: "score_job" | "tailor_job";
  job_id: number | null;
  attempts: number;
  max_attempts: number;
}

/** A failure that retrying won't fix (missing resume, deleted job, bad API key). */
export class PermanentError extends Error {}

/** LLM failures that may succeed later. */
const RETRYABLE: LlmErrorKind[] = ["rate_limit", "unavailable", "network", "bad_response"];

interface JobRow {
  id: number;
  company: string;
  title: string;
  description: string;
  gaps: string[];
}

async function loadInputs(db: SupabaseClient, task: Task) {
  if (task.job_id === null) throw new PermanentError("Task has no job.");
  const job = await db
    .from("jobs")
    .select("id, company, title, description, gaps")
    .eq("id", task.job_id)
    .eq("user_id", task.user_id) // never trust job_id alone with the secret key
    .maybeSingle<JobRow>();
  if (job.error) throw new Error(`Loading job failed: ${job.error.message}`);
  if (!job.data) throw new PermanentError("The job no longer exists.");

  const profile = await db.from("profiles").select("resume_text").eq("user_id", task.user_id).maybeSingle<{ resume_text: string }>();
  if (profile.error) throw new Error(`Loading resume failed: ${profile.error.message}`);
  if (!profile.data) throw new PermanentError("Add your resume on the Profile page first.");
  return { job: job.data, resume: profile.data.resume_text };
}

async function saveJob(db: SupabaseClient, task: Task, changes: Record<string, unknown>) {
  const { error } = await db.from("jobs").update(changes).eq("id", task.job_id!).eq("user_id", task.user_id);
  if (error) throw new Error(`Saving job failed: ${error.message}`);
}

type Handler = (db: SupabaseClient, task: Task, generate: GenerateJson) => Promise<Record<string, unknown>>;

export const handlers: Record<Task["kind"], Handler> = {
  async score_job(db, task, generate) {
    const { job, resume } = await loadInputs(db, task);
    const result = await scoreMatch({ resume, job }, generate);
    await saveJob(db, task, { score: result.score, met: result.met, gaps: result.gaps });
    return { score: result.score, met: result.met.length, gaps: result.gaps.length };
  },
  async tailor_job(db, task, generate) {
    const { job, resume } = await loadInputs(db, task);
    const result = await tailor({ resume, job, gaps: job.gaps }, generate);
    await saveJob(db, task, { tailored_resume: result.resume, cover_letter: result.coverLetter });
    return { resumeChars: result.resume.length, coverLetterChars: result.coverLetter.length };
  },
};

export interface RunOptions {
  db: SupabaseClient;
  generate: GenerateJson;
  workerId: string;
  /** Tasks claimed per round. */
  batchSize?: number;
  /** Stop claiming new tasks after this long (the current task still finishes). */
  maxMillis?: number;
  /** Stop after this many tasks. */
  maxTasks?: number;
  log?: (line: string) => void;
}

export interface RunSummary {
  claimed: number;
  done: number;
  retrying: number;
  failed: number;
}

export async function runWorker(opts: RunOptions): Promise<RunSummary> {
  const { db, generate, workerId, batchSize = 3, maxMillis = 4 * 60_000, maxTasks = 50, log = console.log } = opts;
  const started = Date.now();
  const summary: RunSummary = { claimed: 0, done: 0, retrying: 0, failed: 0 };

  while (Date.now() - started < maxMillis && summary.claimed < maxTasks) {
    const limit = Math.min(batchSize, maxTasks - summary.claimed);
    const { data, error } = await db.rpc("claim_tasks", { p_worker: workerId, p_limit: limit });
    if (error) throw new Error(`claim_tasks failed: ${error.message}`);
    const tasks = (data ?? []) as Task[];
    if (tasks.length === 0) break;
    summary.claimed += tasks.length;

    for (const task of tasks) {
      const label = `task ${task.id} (${task.kind}, job ${task.job_id}, attempt ${task.attempts}/${task.max_attempts})`;
      try {
        const handler = handlers[task.kind];
        if (!handler) throw new PermanentError(`Unknown task kind: ${task.kind}`);
        const result = await handler(db, task, generate);
        const { data: ok } = await db.rpc("complete_task", { p_id: task.id, p_worker: workerId, p_result: result });
        summary.done++;
        log(`✓ ${label}${ok ? "" : " (lock lost: another worker took over)"}`);
      } catch (e) {
        const permanent = e instanceof PermanentError || (e instanceof LlmError && !RETRYABLE.includes(e.kind));
        // Our own messages only: never the resume, job text or keys.
        const message = e instanceof LlmError ? `${e.kind}: ${e.message}` : e instanceof Error ? e.message : "Unknown error";
        await db.rpc("fail_task", { p_id: task.id, p_worker: workerId, p_error: message, p_retry: !permanent });
        const willRetry = !permanent && task.attempts < task.max_attempts;
        if (willRetry) summary.retrying++;
        else summary.failed++;
        log(`✗ ${label}: ${message}${willRetry ? " (will retry)" : ""}`);
      }
    }
  }
  log(`Worker ${workerId} finished: ${JSON.stringify(summary)}`);
  return summary;
}
