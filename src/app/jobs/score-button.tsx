"use client";

import { useActionState } from "react";
import { scoreJobAction, type ScoreState } from "./score-actions";

export function ScoreButton({ jobId, scored }: { jobId: number; scored: boolean }) {
  const [state, action, pending] = useActionState<ScoreState, FormData>(scoreJobAction, { status: "idle" });
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="jobId" value={jobId} />
      <button
        type="submit"
        disabled={pending}
        className={
          scored
            ? "rounded-lg border border-black/15 px-3 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
            : "rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        }
      >
        {pending ? "Scoring…" : scored ? "Re-score" : "Score match"}
      </button>
      <span role="status" className="text-xs">
        {pending ? (
          <span className="text-black/60 dark:text-white/60">Asking Gemini, this can take up to 20 seconds.</span>
        ) : state.status === "error" ? (
          <span className="text-red-600 dark:text-red-400">{state.error}</span>
        ) : null}
      </span>
    </form>
  );
}
