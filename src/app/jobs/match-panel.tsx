import type { Job } from "@/lib/db";

function tone(score: number) {
  if (score >= 75) return { bar: "bg-green-600", text: "text-green-700 dark:text-green-400", label: "Strong match" };
  if (score >= 50) return { bar: "bg-amber-500", text: "text-amber-700 dark:text-amber-400", label: "Partial match" };
  return { bar: "bg-red-600", text: "text-red-700 dark:text-red-400", label: "Weak match" };
}

/** Score bar, requirements met and gaps (story 32, prototype version). */
export function MatchPanel({ job }: { job: Job & { score: number } }) {
  const t = tone(job.score);
  return (
    <div data-testid="match-panel" className="mt-3 rounded-lg bg-black/[0.03] p-3 dark:bg-white/[0.05]">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm">
          <span className={`text-lg font-semibold ${t.text}`}>{job.score}%</span>{" "}
          <span className="text-black/60 dark:text-white/60">{t.label}</span>
        </p>
      </div>
      <div
        role="meter"
        aria-label="Match score"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={job.score}
        className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/15"
      >
        <div className={`h-full ${t.bar}`} style={{ width: `${job.score}%` }} />
      </div>
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <h4 className="text-xs font-semibold tracking-wide text-black/60 uppercase dark:text-white/60">Meets ({job.met.length})</h4>
          {job.met.length ? (
            <ul aria-label="Requirements met" className="mt-1 list-disc space-y-0.5 pl-4">
              {job.met.map((m) => (
                <li key={m} className="break-words">{m}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-black/50 dark:text-white/50">None found.</p>
          )}
        </div>
        <div>
          <h4 className="text-xs font-semibold tracking-wide text-black/60 uppercase dark:text-white/60">Gaps ({job.gaps.length})</h4>
          {job.gaps.length ? (
            <>
              <ul aria-label="Gaps" className="mt-1 list-disc space-y-0.5 pl-4">
                {job.gaps.map((g) => (
                  <li key={g} className="break-words">{g}</li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-black/50 dark:text-white/50">Gaps are never added to your tailored resume.</p>
            </>
          ) : (
            <p className="mt-1 text-black/50 dark:text-white/50">No gaps found.</p>
          )}
        </div>
      </div>
    </div>
  );
}
