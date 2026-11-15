import type { Metadata } from "next";
import { safeNext } from "@/lib/auth";
import { signInAction } from "../auth/actions";
import { AuthForm } from "../auth/auth-form";

export const metadata: Metadata = { title: "Sign in · JobPilot" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; signed_out?: string }>;
}) {
  const params = await searchParams;
  const notice =
    params.error === "link"
      ? "That link has expired or was already used. Sign in, or create your account again."
      : params.signed_out
        ? "You're signed out."
        : undefined;
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-12">
      <h1 className="mb-6 text-2xl font-semibold">Sign in</h1>
      <AuthForm mode="signin" action={signInAction} next={safeNext(params.next)} notice={notice} />
    </main>
  );
}
