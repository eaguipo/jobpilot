"use server";

import { requireUser } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { addJob, findJobByApplyUrl, getDb } from "@/lib/db";
import { checkNewJob, type JobField } from "@/lib/jobs";

type Values = Record<JobField, string>;

export type AddJobState =
  | { status: "idle" }
  | { status: "added"; jobId: number; label: string }
  | { status: "error"; errors: Partial<Record<JobField, string>>; values: Values };

export async function addJobAction(_prev: AddJobState, formData: FormData): Promise<AddJobState> {
  await requireUser(); // pages are guarded by middleware; actions check again
  const values: Values = {
    company: String(formData.get("company") ?? ""),
    title: String(formData.get("title") ?? ""),
    applyUrl: String(formData.get("applyUrl") ?? ""),
    description: String(formData.get("description") ?? ""),
  };
  const check = checkNewJob(values);
  if (!check.ok) return { status: "error", errors: check.errors, values };

  const db = getDb();
  const existing = findJobByApplyUrl(db, check.job.applyUrl);
  if (existing) {
    return {
      status: "error",
      errors: { applyUrl: `Already added: ${existing.title} at ${existing.company}.` },
      values,
    };
  }

  let job;
  try {
    job = addJob(db, check.job);
  } catch (e) {
    // Same link added at the same moment (e.g. double submit): the unique index wins.
    if ((e as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
      return { status: "error", errors: { applyUrl: "This job was already added." }, values };
    }
    throw e;
  }
  revalidatePath("/jobs");
  return { status: "added", jobId: job.id, label: `${job.title} at ${job.company}` };
}
