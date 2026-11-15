"use server";

import { requireUser } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getDb, getJob, isJobStatus, updateJob } from "@/lib/db";

export type StatusState = { status: "idle" } | { status: "saved" } | { status: "error"; error: string };

export async function setStatusAction(_prev: StatusState, formData: FormData): Promise<StatusState> {
  await requireUser(); // pages are guarded by middleware; actions check again
  const jobId = Number(formData.get("jobId"));
  const status = formData.get("status");
  if (!isJobStatus(status)) return { status: "error", error: "Pick a status from the list." };
  const db = getDb();
  const job = Number.isInteger(jobId) ? getJob(db, jobId) : null;
  if (!job) return { status: "error", error: "That job no longer exists." };

  updateJob(db, job.id, { status }); // records the change in the status history
  revalidatePath("/jobs");
  return { status: "saved" };
}
