"use server";

import { createSupabaseServer, requireUser } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getProfile, saveProfile, saveStructuredResume } from "@/lib/data";
import { getGenerator, llmErrorMessage } from "@/lib/ai";
import { LlmError } from "@/lib/llm";
import { quotaMessage, takeAiQuota } from "@/lib/quota";
import { parseResume } from "@/lib/resume-parse";
import { checkResume } from "@/lib/profile";
import { extractResumeText, RESUME_FILE_MAX_BYTES } from "@/lib/resume-file";
import { isResumeFileType, RESUME_BUCKET, RESUME_FILE_TYPES, resumePath } from "@/lib/resume-storage";

export type SaveState =
  | { status: "idle" }
  | { status: "saved"; updatedAt: string; text: string }
  | { status: "error"; error: string };

export async function saveResume(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const user = await requireUser(); // pages are guarded by middleware; actions check again
  const check = checkResume(formData.get("resume"));
  if (!check.ok) return { status: "error", error: check.error };
  const { updatedAt } = await saveProfile(await createSupabaseServer(), user.id, check.text);
  revalidatePath("/profile");
  return { status: "saved", updatedAt, text: check.text };
}

export type ReadFileState = { status: "read"; text: string } | { status: "error"; error: string };

/**
 * Story 11: after the browser uploads the resume file to Storage, read it back with the
 * user's own session (Storage policies apply) and return its text for the user to check.
 * Nothing is saved to the profile here: the user reviews the text and clicks Save resume.
 */
export async function readUploadedResume(type: unknown): Promise<ReadFileState> {
  const user = await requireUser("/profile");
  if (!isResumeFileType(type)) return { status: "error", error: "Upload a PDF or DOCX file." };
  const sb = await createSupabaseServer();
  const { data, error } = await sb.storage.from(RESUME_BUCKET).download(resumePath(user.id, type));
  if (error || !data) return { status: "error", error: "Couldn't find the uploaded file. Try uploading it again." };
  if (data.size > RESUME_FILE_MAX_BYTES) {
    await sb.storage.from(RESUME_BUCKET).remove([resumePath(user.id, type)]);
    return { status: "error", error: "That file is over 5 MB." };
  }

  const result = await extractResumeText(new Uint8Array(await data.arrayBuffer()), type);
  if (!result.ok) {
    // Don't keep a file we can't use: it would show as the stored resume instead of the last good one.
    await sb.storage.from(RESUME_BUCKET).remove([resumePath(user.id, type)]);
    revalidatePath("/profile");
    return { status: "error", error: result.error };
  }

  // Keep one file: uploading a PDF replaces an older DOCX, and the other way round.
  const other = RESUME_FILE_TYPES.find((t) => t !== type)!;
  await sb.storage.from(RESUME_BUCKET).remove([resumePath(user.id, other)]);
  revalidatePath("/profile");
  return { status: "read", text: result.text };
}

export type ParseState = { status: "idle" } | { status: "parsed"; leftOut: number } | { status: "error"; error: string };

/**
 * Story 12: split the saved master resume into sections with the model and store them.
 * Uses one AI run. The structure is saved only if the resume is still the text that was
 * parsed, so an edit made while the model was working isn't paired with old sections.
 */
export async function parseResumeAction(): Promise<ParseState> {
  await requireUser("/profile");
  const sb = await createSupabaseServer();
  const profile = await getProfile(sb);
  if (!profile) return { status: "error", error: "Save your resume first." };
  const quota = await takeAiQuota(sb, "parse");
  if (!quota.allowed) return { status: "error", error: quotaMessage(quota) };

  try {
    const { structured, leftOut } = await parseResume(profile.resumeText, getGenerator());
    if (!(await saveStructuredResume(sb, profile.resumeMd5, structured)))
      return { status: "error", error: "Your resume changed while it was being read. Try again." };
    revalidatePath("/profile");
    return { status: "parsed", leftOut };
  } catch (e) {
    if (e instanceof LlmError) {
      // Log the kind and our own message only: never the key or resume text.
      console.error(`[parse] ${e.kind}: ${e.message}`);
      return { status: "error", error: llmErrorMessage(e.kind, "read this resume") };
    }
    throw e;
  }
}
