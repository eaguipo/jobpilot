import type { Metadata } from "next";
import { safeNext } from "@/lib/auth";
import { signUpAction } from "../auth/actions";
import { AuthForm } from "../auth/auth-form";

export const metadata: Metadata = { title: "Create account · JobPilot" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-12">
      <h1 className="mb-6 text-2xl font-semibold">Create your account</h1>
      <AuthForm mode="signup" action={signUpAction} next={safeNext(next)} />
    </main>
  );
}
