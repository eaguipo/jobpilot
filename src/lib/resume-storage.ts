import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResumeFileType } from "./resume-file";

/**
 * Where a user's resume file lives in Storage (story 11). The bucket's policies allow
 * exactly these two paths per user, so these helpers are the only valid names.
 */
export const RESUME_BUCKET = "resumes";
export const RESUME_FILE_TYPES: readonly ResumeFileType[] = ["pdf", "docx"];

export const resumePath = (userId: string, type: ResumeFileType) => `${userId}/resume.${type}`;

export function isResumeFileType(v: unknown): v is ResumeFileType {
  return v === "pdf" || v === "docx";
}

/** File type from a chosen file's name, or null. */
export function resumeTypeFromName(name: string): ResumeFileType | null {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  return isResumeFileType(ext) ? ext : null;
}

export interface StoredResumeFile {
  type: ResumeFileType;
  size: number;
  uploadedAt: string;
}

/** The user's current resume file, if any (newest if both types exist). */
export async function getStoredResumeFile(sb: SupabaseClient, userId: string): Promise<StoredResumeFile | null> {
  const { data, error } = await sb.storage.from(RESUME_BUCKET).list(userId, { limit: 10 });
  if (error || !data) return null;
  const files = data
    .map((f) => ({
      type: resumeTypeFromName(f.name),
      name: f.name,
      size: Number((f.metadata as { size?: number } | null)?.size ?? 0),
      uploadedAt: f.updated_at ?? f.created_at ?? "",
    }))
    .filter((f): f is { type: ResumeFileType; name: string; size: number; uploadedAt: string } => f.type !== null && f.name === `resume.${f.type}`)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const f = files[0];
  return f ? { type: f.type, size: f.size, uploadedAt: f.uploadedAt } : null;
}
