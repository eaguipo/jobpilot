"use client";

import Link from "next/link";
import { useActionState } from "react";
import { PASSWORD_MIN } from "@/lib/auth";
import type { AuthState } from "./actions";

const input =
  "w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 aria-[invalid=true]:border-red-600 dark:border-white/20";

export function AuthForm({
  mode,
  action,
  next,
  notice,
}: {
  mode: "signin" | "signup";
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
  next: string;
  notice?: string;
}) {
  const [state, run, pending] = useActionState<AuthState, FormData>(action, { status: "idle" });
  const signup = mode === "signup";
  const fieldErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const email = state.status === "idle" ? "" : state.email;

  if (state.status === "check-email") {
    return (
      <div role="status" className="rounded-lg border border-green-600/30 bg-green-600/10 p-4 text-sm">
        <p className="font-medium">Check your email</p>
        <p className="mt-1">
          We sent a confirmation link to <strong>{state.email}</strong>. Open it to finish creating your account.
        </p>
      </div>
    );
  }

  return (
    <form action={run} noValidate aria-label={signup ? "Create account" : "Sign in"} className="flex flex-col gap-4" key={email}>
      <input type="hidden" name="next" value={next} />
      {notice && (
        <p role="note" className="rounded-lg bg-black/5 p-3 text-sm dark:bg-white/10">
          {notice}
        </p>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={email}
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
          className={input}
        />
        {fieldErrors.email && <p id="email-error" className="text-xs text-red-600 dark:text-red-400">{fieldErrors.email}</p>}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={signup ? "new-password" : "current-password"}
          aria-invalid={fieldErrors.password ? true : undefined}
          aria-describedby={[fieldErrors.password && "password-error", signup && "password-help"].filter(Boolean).join(" ") || undefined}
          className={input}
        />
        {signup && <p id="password-help" className="text-xs text-black/60 dark:text-white/60">At least {PASSWORD_MIN} characters.</p>}
        {fieldErrors.password && <p id="password-error" className="text-xs text-red-600 dark:text-red-400">{fieldErrors.password}</p>}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? (signup ? "Creating account…" : "Signing in…") : signup ? "Create account" : "Sign in"}
      </button>
      <p role="status" className="text-sm text-red-600 dark:text-red-400">
        {state.status === "error" && !pending ? state.error : null}
      </p>
      <p className="text-sm text-black/60 dark:text-white/60">
        {signup ? (
          <>Already have an account? <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-blue-700 underline dark:text-blue-300">Sign in</Link></>
        ) : (
          <>New to JobPilot? <Link href={`/signup?next=${encodeURIComponent(next)}`} className="text-blue-700 underline dark:text-blue-300">Create an account</Link></>
        )}
      </p>
    </form>
  );
}
