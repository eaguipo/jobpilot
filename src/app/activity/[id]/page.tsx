import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServer, requireUser } from "@/lib/supabase/server";
import { getAuditEntry } from "@/lib/data";
import { ACTIVITY_LABEL, parseId } from "@/lib/activity";
import { CopyButton } from "@/app/jobs/copy-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Activity · JobPilot" };

export default async function ActivityEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  await requireUser(`/activity/${encodeURIComponent(raw)}`);
  const id = parseId(raw);
  if (!id) notFound();
  const db = await createSupabaseServer();
  // null for an unknown id and for someone else's entry (RLS): both are a plain 404.
  const entry = await getAuditEntry(db, id);
  if (!entry) notFound();

  const when = new Date(entry.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link href="/activity" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
        ← Activity
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">{ACTIVITY_LABEL[entry.kind]}</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        {entry.jobTitle} at {entry.jobCompany} · <time dateTime={entry.createdAt}>{when}</time>
        {entry.jobId === null && " · job deleted"}
      </p>

      {entry.document ? (
        <section aria-label="Generated text" data-testid="activity-document" className="mt-6">
          <div className="flex justify-end">
            <CopyButton text={entry.document} label="Copy text" />
          </div>
          <pre className="mt-2 overflow-auto rounded-md border border-black/10 bg-white p-3 font-sans text-sm leading-6 whitespace-pre-wrap break-words dark:border-white/15 dark:bg-black/30">
            {entry.document}
          </pre>
        </section>
      ) : (
        <p className="mt-6 text-sm text-black/60 dark:text-white/60">This entry has no document text.</p>
      )}
    </main>
  );
}
