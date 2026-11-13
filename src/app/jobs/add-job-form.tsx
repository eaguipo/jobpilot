"use client";

import { useActionState } from "react";
import { LIMITS, type JobField } from "@/lib/jobs";
import { addJobAction, type AddJobState } from "./actions";

const input =
  "w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 aria-[invalid=true]:border-red-600 dark:border-white/20";

export function AddJobForm() {
  const [state, action, pending] = useActionState<AddJobState, FormData>(addJobAction, { status: "idle" });
  const errors = state.status === "error" ? state.errors : {};
  const values = state.status === "error" ? state.values : undefined;

  // React resets the form after every submit; remount with the submitted values when there are errors.
  const formKey = state.status === "error" ? JSON.stringify(state.values) : state.status === "added" ? `added-${state.jobId}` : "new";

  const field = (name: JobField) => ({
    id: name,
    name,
    defaultValue: values?.[name] ?? "",
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  });
  const error = (name: JobField) =>
    errors[name] ? (
      <p id={`${name}-error`} className="text-xs text-red-600 dark:text-red-400">
        {errors[name]}
      </p>
    ) : null;

  return (
    <form key={formKey} action={action} noValidate aria-label="Add a job" className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="company" className="text-sm font-medium">Company</label>
          <input {...field("company")} maxLength={LIMITS.company} autoComplete="organization" className={input} />
          {error("company")}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="title" className="text-sm font-medium">Job title</label>
          <input {...field("title")} maxLength={LIMITS.title} autoComplete="organization-title" className={input} />
          {error("title")}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="applyUrl" className="text-sm font-medium">Apply link</label>
        <input {...field("applyUrl")} type="url" inputMode="url" placeholder="https://" className={input} />
        {error("applyUrl")}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="text-sm font-medium">Job description</label>
        <textarea
          {...field("description")}
          rows={8}
          placeholder="Paste the full job description: responsibilities, requirements, nice-to-haves."
          className={`${input} leading-6`}
        />
        {error("description")}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add job"}
        </button>
        <p role="status" className="text-sm">
          {pending ? null : state.status === "added" ? (
            <span className="text-green-700 dark:text-green-400">Added {state.label}.</span>
          ) : state.status === "error" ? (
            <span className="text-red-600 dark:text-red-400">Fix the highlighted fields.</span>
          ) : null}
        </p>
      </div>
    </form>
  );
}
