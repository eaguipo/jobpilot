"use server";

import { createSupabaseServer, requireUser } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getJob, getProfile, updateJob } from "@/lib/data";
import { getGenerator, llmErrorMessage } from "@/lib/ai";
import { LlmError } from "@/lib/llm";
import { scoreMatch } from "@/lib/match";
import type { ActionState } from "./job-action-button";

export async function scoreJobAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser(); // pages are guarded by middleware; actions check again
  const jobId = Number(formData.get("jobId"));
  const db = await createSupabaseServer();
  const job = Number.isInteger(jobId) ? await getJob(db, jobId) : null;
  if (!job) return { status: "error", error: "That job no longer exists." };
  const profile = await getProfile(db);
  if (!profile) return { status: "error", error: "Add your resume on the Profile page first." };

  try {
    const generate = getGenerator();
    const result = await scoreMatch({ resume: profile.resumeText, job }, generate);
    await updateJob(db, job.id, result);
    revalidatePath("/jobs");
    return { status: "done" };
  } catch (e) {
    if (e instanceof LlmError) {
      // Log the kind and our own message only: never the key, resume or job text.
      console.error(`[score] job ${job.id}: ${e.kind}: ${e.message}`);
      return { status: "error", error: llmErrorMessage(e.kind, "score this job") };
    }
    throw e;
  }
}
