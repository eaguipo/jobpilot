import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServer, requireUser } from "@/lib/supabase/server";
import { AUDIT_PAGE_SIZE, listAuditLog } from "@/lib/data";
import { ACTIVITY_LABEL, activitySummary, hasDocument, parseId } from "@/lib/activity";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Activity · JobPilot" };

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  await requireUser("/activity");
  const beforeId = parseId((await searchParams).before);
  const db = await createSupabaseServer();
  // RLS returns only this user's entries.
  const entries = await listAuditLog(db, { beforeId });
  const olderId = entries.length === AUDIT_PAGE_SIZE ? entries[entries.length - 1].id : undefined;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Activity</h1>
      <p className="mt-1 mb-6 text-sm text-black/60 dark:text-white/60">
        Everything JobPilot has generated for you, newest first. This history is kept even if you delete a job, and it
        can&apos;t be edited.
      </p>

      {entries.length === 0 ? (
        <p data-testid="activity-empty" className="rounded-xl border border-dashed border-black/15 p-6 text-center text-sm text-black/60 dark:border-white/20 dark:text-white/60">
          {beforeId ? "No older activity." : "Nothing yet. Score or tailor a job and it will show up here."}
        </p>
      ) : (
        <ol aria-label="Activity" className="divide-y divide-black/10 rounded-xl border border-black/10 dark:divide-white/15 dark:border-white/15">
          {entries.map((e) => {
            const summary = activitySummary(e);
            return (
              <li key={e.id} data-testid="activity-entry" data-kind={e.kind} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 text-sm">
                <time dateTime={e.createdAt} className="w-40 shrink-0 text-black/50 dark:text-white/50">
                  {formatDateTime(e.createdAt)}
                </time>
                <span className="font-medium">{ACTIVITY_LABEL[e.kind]}</span>
                <span className="min-w-0 truncate text-black/70 dark:text-white/70">
                  {e.jobTitle} at {e.jobCompany}
                  {e.jobId === null && <span className="ml-1 text-xs text-black/40 dark:text-white/40">(job deleted)</span>}
                </span>
                {summary && <span className="text-black/60 dark:text-white/60">{summary}</span>}
                {hasDocument(e.kind) && (
                  <Link href={`/activity/${e.id}`} className="ml-auto text-blue-600 hover:underline dark:text-blue-400">
                    View text
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <nav aria-label="Activity pages" className="mt-4 flex justify-between text-sm">
        {beforeId ? <Link href="/activity" className="text-blue-600 hover:underline dark:text-blue-400">← Newest</Link> : <span />}
        {olderId && (
          <Link href={`/activity?before=${olderId}`} className="text-blue-600 hover:underline dark:text-blue-400">
            Older →
          </Link>
        )}
      </nav>
    </main>
  );
}
