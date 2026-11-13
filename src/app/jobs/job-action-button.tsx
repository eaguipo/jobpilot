"use client";

import { useActionState } from "react";

export type ActionState = { status: "idle" } | { status: "done" } | { status: "error"; error: string };
type JobAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** A per-job button that runs a slow server action (Gemini) with pending and error states. Works without JS. */
export function JobActionButton({
  jobId,
  action,
  label,
  redoLabel,
  done,
  pendingLabel,
  pendingNote,
}: {
  jobId: number;
  action: JobAction;
  label: string;
  redoLabel: string;
  /** Already has a result: show the secondary "redo" style. */
  done: boolean;
  pendingLabel: string;
  pendingNote: string;
}) {
  const [state, run, pending] = useActionState<ActionState, FormData>(action, { status: "idle" });
  return (
    <form action={run} aria-label={label} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="jobId" value={jobId} />
      <button
        type="submit"
        disabled={pending}
        className={
          done
            ? "rounded-lg border border-black/15 px-3 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
            : "rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        }
      >
        {pending ? pendingLabel : done ? redoLabel : label}
      </button>
      <span role="status" className="text-xs">
        {pending ? (
          <span className="text-black/60 dark:text-white/60">{pendingNote}</span>
        ) : state.status === "error" ? (
          <span className="text-red-600 dark:text-red-400">{state.error}</span>
        ) : null}
      </span>
    </form>
  );
}
