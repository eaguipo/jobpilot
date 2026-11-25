"use server";

import { createSupabaseServer, requireUser } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { saveProfile } from "@/lib/data";
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
