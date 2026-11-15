"use server";

import { requireUser } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getGenerator, llmErrorMessage } from "@/lib/ai";
import { getDb, getJob, getProfile, updateJob } from "@/lib/db";
import { LlmError } from "@/lib/llm";
import { tailor } from "@/lib/tailor";
import type { ActionState } from "./job-action-button";

export async function tailorJobAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser(); // pages are guarded by middleware; actions check again
  const jobId = Number(formData.get("jobId"));
  const db = getDb();
  const job = Number.isInteger(jobId) ? getJob(db, jobId) : null;
  if (!job) return { status: "error", error: "That job no longer exists." };
  const profile = getProfile(db);
  if (!profile) return { status: "error", error: "Add your resume on the Profile page first." };

  try {
    const result = await tailor({ resume: profile.resumeText, job, gaps: job.gaps }, getGenerator());
    updateJob(db, job.id, { tailoredResume: result.resume, coverLetter: result.coverLetter });
    revalidatePath("/jobs");
    return { status: "done" };
  } catch (e) {
    if (e instanceof LlmError) {
      // Log the kind and our own message only: never the key, resume or job text.
      console.error(`[tailor] job ${job.id}: ${e.kind}: ${e.message}`);
      return { status: "error", error: llmErrorMessage(e.kind, "write documents for this job") };
    }
    throw e;
  }
}
