"use server";

import { revalidatePath } from "next/cache";
import { getDb, getJob, getProfile, updateJob } from "@/lib/db";
import { getGenerator, llmErrorMessage } from "@/lib/ai";
import { LlmError } from "@/lib/llm";
import { scoreMatch } from "@/lib/match";
import type { ActionState } from "./job-action-button";

export async function scoreJobAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const jobId = Number(formData.get("jobId"));
  const db = getDb();
  const job = Number.isInteger(jobId) ? getJob(db, jobId) : null;
  if (!job) return { status: "error", error: "That job no longer exists." };
  const profile = getProfile(db);
  if (!profile) return { status: "error", error: "Add your resume on the Profile page first." };

  try {
    const generate = getGenerator();
    const result = await scoreMatch({ resume: profile.resumeText, job }, generate);
    updateJob(db, job.id, result);
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
