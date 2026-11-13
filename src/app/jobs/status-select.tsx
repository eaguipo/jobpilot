"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { JOB_STATUSES, type JobStatus } from "@/lib/statuses";
import { setStatusAction, type StatusState } from "./status-actions";

/** Status dropdown that saves as soon as it changes. Without JavaScript, a Save button appears instead. */
export function StatusSelect({ jobId, status }: { jobId: number; status: JobStatus }) {
  const [state, run, pending] = useActionState<StatusState, FormData>(setStatusAction, { status: "idle" });
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const form = useRef<HTMLFormElement>(null);
  const id = `status-${jobId}`;

  return (
    <form ref={form} action={run} aria-label="Change status" className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="jobId" value={jobId} />
      <label htmlFor={id} className="text-xs text-black/60 dark:text-white/60">
        Status
      </label>
      <select
        // Remount when the saved status changes so React's form reset can't show a stale value.
        key={status}
        id={id}
        name="status"
        defaultValue={status}
        onChange={() => form.current?.requestSubmit()}
        className="rounded-md border border-black/15 bg-transparent px-2 py-1 text-sm font-medium dark:border-white/20 dark:bg-black"
      >
        {JOB_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {!hydrated && (
        <button type="submit" className="rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/20">
          Save
        </button>
      )}
      <span role="status" className="text-xs">
        {pending ? (
          <span className="text-black/60 dark:text-white/60">Saving…</span>
        ) : state.status === "error" ? (
          <span className="text-red-600 dark:text-red-400">{state.error}</span>
        ) : state.status === "saved" ? (
          <span className="text-green-700 dark:text-green-400">Saved</span>
        ) : null}
      </span>
    </form>
  );
}
