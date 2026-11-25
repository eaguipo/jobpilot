"use client";

import { useActionState } from "react";
import { AddJobForm } from "./add-job-form";
import { fillFromLinkAction, type FillState } from "./link-actions";

const input =
  "w-full min-w-0 flex-1 rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 aria-[invalid=true]:border-red-600 dark:border-white/20";

/**
 * "Fill from link" (task 22) above the Add job form. It's a separate <form>
 * (forms can't nest), and passes what it read down as the Add job form's values.
 * Works without JavaScript too: the server renders the filled form.
 */
export function AddJob() {
  const [fill, fillAction, filling] = useActionState<FillState, FormData>(fillFromLinkAction, { status: "idle" });
  const linkValue = fill.status === "error" ? fill.link : fill.status === "filled" ? fill.values.applyUrl : "";

  return (
    <div className="flex flex-col gap-6">
      <form
        key={fill.status === "filled" ? `f-${fill.nonce}` : `e-${linkValue}`}
        action={fillAction}
        noValidate
        aria-label="Fill from a job link"
        className="flex flex-col gap-1"
      >
        <label htmlFor="link" className="text-sm font-medium">Job link</label>
        <div className="flex flex-wrap gap-2">
          <input
            id="link"
            name="link"
            type="url"
            inputMode="url"
            placeholder="Paste a Greenhouse, Lever or Ashby job link"
            defaultValue={linkValue}
            aria-invalid={fill.status === "error" ? true : undefined}
            aria-describedby="link-help"
            className={input}
          />
          <button
            type="submit"
            disabled={filling}
            className="rounded-lg border border-blue-600 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-300 dark:hover:bg-blue-950"
          >
            {filling ? "Reading…" : "Fill from link"}
          </button>
        </div>
        <p id="link-help" role="status" className="text-xs">
          {filling ? (
            <span className="text-black/60 dark:text-white/60">Reading the posting…</span>
          ) : fill.status === "error" ? (
            <span className="text-red-600 dark:text-red-400">{fill.error}</span>
          ) : fill.status === "filled" ? (
            <span className="text-green-700 dark:text-green-400">Filled in below. Check the details, then add the job.</span>
          ) : (
            <span className="text-black/60 dark:text-white/60">Optional. Or fill in the details yourself.</span>
          )}
        </p>
      </form>
      <AddJobForm key={fill.status === "filled" ? `f-${fill.nonce}` : "blank"} prefill={fill.status === "filled" ? fill.values : undefined} />
    </div>
  );
}
