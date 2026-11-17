import type { Metadata } from "next";
import { createSupabaseServer, requireUser } from "@/lib/supabase/server";
import Link from "next/link";
import { countJobsByStatus, getProfile, isJobStatus, JOB_STATUSES, listJobs, listStatusEventsByJob, type StatusEvent } from "@/lib/data";
import { getAiQuota } from "@/lib/quota";
import { AddJobForm } from "./add-job-form";
import { MatchPanel } from "./match-panel";
import { JobActionButton } from "./job-action-button";
import { scoreJobAction } from "./score-actions";
import { tailorJobAction } from "./tailor-actions";
import { StatusSelect } from "./status-select";
import { TailoredDocs } from "./tailored-docs";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Jobs · JobPilot" };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function StatusHistory({ events }: { events: StatusEvent[] }) {
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-black/60 dark:text-white/60">Status history ({events.length})</summary>
      <ol aria-label="Status history" className="mt-2 space-y-1 border-l border-black/10 pl-3 dark:border-white/15">
        {events.map((e) => (
          <li key={e.id}>
            <span className="text-black/50 dark:text-white/50">{formatDateTime(e.changedAt)}</span>{" "}
            {e.fromStatus ? `${e.fromStatus} → ${e.toStatus}` : `Added as ${e.toStatus}`}
          </li>
        ))}
      </ol>
    </details>
  );
}

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireUser("/jobs");
  const { status: statusParam } = await searchParams;
  const filter = isJobStatus(statusParam) ? statusParam : undefined;
  const db = await createSupabaseServer();
  // Independent reads, in parallel; RLS returns only this user's rows.
  const [jobs, counts, history, profile, quota] = await Promise.all([
    listJobs(db, { status: filter }),
    countJobsByStatus(db),
    listStatusEventsByJob(db),
    getProfile(db),
    getAiQuota(db),
  ]);
  const runsLeft = Math.max(0, quota.perDay - quota.usedToday);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium ${
      active
        ? "border-blue-600 bg-blue-600 text-white"
        : "border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
    }`;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Jobs</h1>
      <p className="mt-1 mb-6 text-sm text-black/60 dark:text-white/60">
        Add a job, score how well your resume matches it, get a tailored resume and cover letter, then track where each application stands.
      </p>
      <p data-testid="ai-quota" className="-mt-4 mb-6 text-xs text-black/50 dark:text-white/50">
        AI runs left today: {runsLeft} of {quota.perDay} (scoring and tailoring each use one; resets at midnight UTC).
      </p>

      <section aria-labelledby="add-job" className="rounded-xl border border-black/10 p-4 dark:border-white/15">
        <h2 id="add-job" className="mb-4 text-lg font-medium">Add a job</h2>
        <AddJobForm />
      </section>

      <section aria-labelledby="job-list" className="mt-8">
        <h2 id="job-list" className="mb-3 text-lg font-medium">
          Your jobs <span className="text-sm font-normal text-black/50 dark:text-white/50">({total})</span>
        </h2>
        {total > 0 && (
          <nav aria-label="Filter by status" className="mb-4 flex flex-wrap gap-2">
            <Link href="/jobs" aria-current={!filter ? "page" : undefined} className={chip(!filter)}>
              All ({total})
            </Link>
            {JOB_STATUSES.map((s) => (
              <Link
                key={s}
                href={`/jobs?status=${s}`}
                aria-current={filter === s ? "page" : undefined}
                className={chip(filter === s)}
              >
                {s} ({counts[s]})
              </Link>
            ))}
          </nav>
        )}
        {total === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">No jobs yet. Add your first one above.</p>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            No jobs with status {filter}. <Link href="/jobs" className="text-blue-700 underline dark:text-blue-300">Show all</Link>
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {jobs.map((job) => {
              const events = history.get(job.id) ?? [];
              const applied = events.find((e) => e.toStatus === "Applied");
              return (
              <li key={job.id} data-testid="job-card" className="rounded-xl border border-black/10 p-4 dark:border-white/15">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-medium break-words">{job.title}</h3>
                    <p className="text-sm text-black/70 dark:text-white/70 break-words">{job.company}</p>
                  </div>
                  <StatusSelect jobId={job.id} status={job.status} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline-offset-2 hover:underline dark:text-blue-300">
                    Open apply link ↗
                  </a>
                  <span className="text-black/50 dark:text-white/50">Added {formatDate(job.createdAt)}</span>
                  {applied && <span className="text-black/50 dark:text-white/50">Applied {formatDate(applied.changedAt)}</span>}
                </div>
                {job.score !== null && <MatchPanel job={{ ...job, score: job.score }} />}
                {profile && job.tailoredResume !== null && job.coverLetter !== null && (
                  <TailoredDocs job={{ ...job, tailoredResume: job.tailoredResume, coverLetter: job.coverLetter }} resume={profile.resumeText} />
                )}
                <div className="mt-3">
                  {profile ? (
                    <div className="flex flex-col gap-2">
                      <JobActionButton
                        jobId={job.id}
                        action={scoreJobAction}
                        done={job.score !== null}
                        label="Score match"
                        redoLabel="Re-score"
                        pendingLabel="Scoring…"
                        pendingNote="Asking Gemini, this can take up to 20 seconds."
                      />
                      <JobActionButton
                        jobId={job.id}
                        action={tailorJobAction}
                        done={job.tailoredResume !== null}
                        label="Tailor resume & cover letter"
                        redoLabel="Regenerate documents"
                        pendingLabel="Writing…"
                        pendingNote="Gemini is writing your documents, this can take up to 40 seconds."
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-black/60 dark:text-white/60">
                      <Link href="/profile" className="text-blue-700 underline dark:text-blue-300">Add your resume</Link> to score this job and tailor your documents.
                    </p>
                  )}
                </div>
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-black/60 dark:text-white/60">Job description</summary>
                  <p className="mt-2 whitespace-pre-wrap break-words text-black/80 dark:text-white/80">{job.description}</p>
                </details>
                <StatusHistory events={events} />
              </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
