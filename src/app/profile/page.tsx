import type { Metadata } from "next";
import { createSupabaseServer, requireUser } from "@/lib/supabase/server";
import { getProfile } from "@/lib/data";
import { getStoredResumeFile, RESUME_BUCKET, resumePath } from "@/lib/resume-storage";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Profile · JobPilot" };

export default async function ProfilePage() {
  const user = await requireUser("/profile");
  const sb = await createSupabaseServer();
  const [profile, file] = await Promise.all([getProfile(sb), getStoredResumeFile(sb, user.id)]);
  // A short-lived link to download the stored original; it only works for this user's file.
  const download = file
    ? (await sb.storage.from(RESUME_BUCKET).createSignedUrl(resumePath(user.id, file.type), 60 * 60, { download: `resume.${file.type}` })).data
        ?.signedUrl ?? null
    : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Profile</h1>
      <p className="mt-1 mb-6 text-sm text-black/60 dark:text-white/60">
        Upload or paste your master resume once. Every match score, tailored resume and cover letter is built from it.
      </p>
      <ProfileForm
        userId={user.id}
        initialText={profile?.resumeText ?? ""}
        initialUpdatedAt={profile?.updatedAt ?? null}
        storedFile={file ? { ...file, downloadUrl: download } : null}
      />
    </main>
  );
}
