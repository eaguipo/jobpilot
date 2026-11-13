"use client";

import { useActionState, useState } from "react";
import { RESUME_MAX_CHARS, RESUME_MIN_CHARS } from "@/lib/profile";
import { saveResume, type SaveState } from "./actions";

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function ProfileForm({ initialText, initialUpdatedAt }: { initialText: string; initialUpdatedAt: string | null }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveResume, { status: "idle" });
  const [text, setText] = useState(initialText);

  // Only what the server confirmed counts as saved (it tidies whitespace, so compare trimmed).
  const savedText = state.status === "saved" ? state.text : initialText;
  const lastSaved = state.status === "saved" ? state.updatedAt : initialUpdatedAt;
  const dirty = text.trim() !== savedText.trim();
  const length = text.trim().length;

  return (
    <form action={action} className="flex flex-col gap-3">
      <label htmlFor="resume" className="text-sm font-medium">
        Master resume
      </label>
      <textarea
        id="resume"
        name="resume"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={24}
        spellCheck={false}
        placeholder={"Paste your full resume here: contact details, summary, experience, education and skills."}
        aria-describedby="resume-help resume-status"
        className="w-full rounded-lg border border-black/15 bg-transparent p-3 font-mono text-sm leading-6 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-white/20"
      />
      <p id="resume-help" className="text-xs text-black/60 dark:text-white/60">
        {length.toLocaleString("en-US")} / {RESUME_MAX_CHARS.toLocaleString("en-US")} characters · at least {RESUME_MIN_CHARS}. Tailoring only ever uses facts from this text.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || !dirty}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save resume"}
        </button>
        <p id="resume-status" role="status" className="text-sm">
          {state.status === "error" && !pending ? (
            <span className="text-red-600 dark:text-red-400">{state.error}</span>
          ) : dirty ? (
            <span className="text-amber-700 dark:text-amber-400">Unsaved changes</span>
          ) : lastSaved ? (
            <span className="text-black/60 dark:text-white/60">Saved {formatTime(lastSaved)}</span>
          ) : null}
        </p>
      </div>
    </form>
  );
}
