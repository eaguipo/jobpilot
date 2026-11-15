import type { Metadata } from "next";
import { createSupabaseServer, requireUser } from "@/lib/supabase/server";
import { getProfile } from "@/lib/data";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Profile · JobPilot" };

export default async function ProfilePage() {
  await requireUser("/profile");
  const profile = await getProfile(await createSupabaseServer());
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Profile</h1>
      <p className="mt-1 mb-6 text-sm text-black/60 dark:text-white/60">
        Paste your master resume once. Every match score, tailored resume and cover letter is built from it.
      </p>
      <ProfileForm initialText={profile?.resumeText ?? ""} initialUpdatedAt={profile?.updatedAt ?? null} />
    </main>
  );
}
