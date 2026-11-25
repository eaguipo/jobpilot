"use server";

import { createSupabaseServer, requireUser } from "@/lib/supabase/server";
import { findJobByApplyUrl } from "@/lib/data";
import { fakeBoardFetch } from "@/lib/fake-boards";
import { jobFromLink, type LinkValues } from "@/lib/job-from-link";

export type FillState =
  | { status: "idle" }
  | { status: "filled"; values: LinkValues; nonce: number }
  | { status: "error"; error: string; link: string };

/** "Fill from link" on the Add job form (task 22). Fills the form; the user still clicks Add job. */
export async function fillFromLinkAction(_prev: FillState, formData: FormData): Promise<FillState> {
  await requireUser(); // pages are guarded by middleware; actions check again
  const link = String(formData.get("link") ?? "").slice(0, 2_001);
  const result = await jobFromLink(link, process.env.JOBPILOT_FAKE_BOARDS === "1" ? fakeBoardFetch : undefined);
  if (!result.ok) return { status: "error", error: result.error, link };

  const existing = await findJobByApplyUrl(await createSupabaseServer(), result.values.applyUrl);
  if (existing) return { status: "error", error: `Already added: ${existing.title} at ${existing.company}.`, link };
  // nonce: lets the form refill even when the same link is fetched twice.
  return { status: "filled", values: result.values, nonce: Date.now() };
}
