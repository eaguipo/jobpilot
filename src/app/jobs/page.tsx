import type { Metadata } from "next";
import { getDb, listJobs } from "@/lib/db";
import { AddJobForm } from "./add-job-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Jobs · JobPilot" };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
}

export default function JobsPage() {
  const jobs = listJobs(getDb());
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Jobs</h1>
      <p className="mt-1 mb-6 text-sm text-black/60 dark:text-white/60">
        Add a job you found. Match scores and tailored documents come in the next steps.
      </p>

      <section aria-labelledby="add-job" className="rounded-xl border border-black/10 p-4 dark:border-white/15">
        <h2 id="add-job" className="mb-4 text-lg font-medium">Add a job</h2>
        <AddJobForm />
      </section>

      <section aria-labelledby="job-list" className="mt-8">
        <h2 id="job-list" className="mb-3 text-lg font-medium">
          Your jobs <span className="text-sm font-normal text-black/50 dark:text-white/50">({jobs.length})</span>
        </h2>
        {jobs.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">No jobs yet. Add your first one above.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {jobs.map((job) => (
              <li key={job.id} data-testid="job-card" className="rounded-xl border border-black/10 p-4 dark:border-white/15">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-medium break-words">{job.title}</h3>
                    <p className="text-sm text-black/70 dark:text-white/70 break-words">{job.company}</p>
                  </div>
                  <span className="rounded-full bg-blue-600/10 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                    {job.status}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline-offset-2 hover:underline dark:text-blue-300">
                    Open posting ↗
                  </a>
                  <span className="text-black/50 dark:text-white/50">Added {formatDate(job.createdAt)}</span>
                </div>
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-black/60 dark:text-white/60">Job description</summary>
                  <p className="mt-2 whitespace-pre-wrap break-words text-black/80 dark:text-white/80">{job.description}</p>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
