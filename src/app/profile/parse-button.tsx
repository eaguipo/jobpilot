"use client";

import { useActionState } from "react";
import { parseResumeAction, type ParseState } from "./actions";

/** Story 12: builds (or rebuilds) the structured profile from the saved resume. One AI run. */
export function ParseButton({ hasResume, hasStructure, stale }: { hasResume: boolean; hasStructure: boolean; stale: boolean }) {
  const [state, action, pending] = useActionState<ParseState, FormData>(parseResumeAction, { status: "idle" });

  // An out-of-date notice wins over an older "Done", e.g. after the user saves an edited resume.
  const showStale = stale && !pending && state.status !== "error";
  const message = pending
    ? "Reading your resume…"
    : state.status === "error"
      ? state.error
      : showStale
        ? "Your resume changed after this was built. Rebuild to update it."
        : state.status === "parsed"
          ? state.leftOut === 0
            ? "Done. Check each section below."
            : `Done. ${state.leftOut} item${state.leftOut === 1 ? "" : "s"} the AI returned ${state.leftOut === 1 ? "isn't" : "aren't"} in your resume, so ${state.leftOut === 1 ? "it was" : "they were"} left out.`
          : !hasResume
            ? "Save your resume first."
            : "";

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pending || !hasResume}
        className="rounded-lg border border-blue-600 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-300 dark:hover:bg-blue-950"
      >
        {pending ? "Reading…" : hasStructure ? "Rebuild from saved resume" : "Build structured profile"}
      </button>
      <p
        data-testid="parse-status"
        aria-live="polite"
        className={`text-sm ${state.status === "error" && !pending ? "text-red-600 dark:text-red-400" : showStale ? "text-amber-700 dark:text-amber-400" : "text-black/60 dark:text-white/60"}`}
      >
        {message}
      </p>
    </form>
  );
}
