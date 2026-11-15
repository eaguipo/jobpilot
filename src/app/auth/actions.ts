"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authErrorMessage, checkCredentials, safeNext, type CredentialErrors } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";

export type AuthState =
  | { status: "idle" }
  | { status: "error"; error?: string; fieldErrors?: CredentialErrors; email: string }
  | { status: "check-email"; email: string };

function read(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    next: safeNext(formData.get("next")),
  };
}

export async function signInAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const { email, password, next } = read(formData);
  const fieldErrors = checkCredentials(email, password, "signin");
  if (Object.keys(fieldErrors).length) return { status: "error", fieldErrors, email };

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { status: "error", error: authErrorMessage(error), email };
  redirect(next);
}

export async function signUpAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const { email, password, next } = read(formData);
  const fieldErrors = checkCredentials(email, password, "signup");
  if (Object.keys(fieldErrors).length) return { status: "error", fieldErrors, email };

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) return { status: "error", error: authErrorMessage(error), email };
  // With email confirmation on, there's no session until the link is opened.
  if (!data.session) return { status: "check-email", email };
  redirect(next);
}

export async function signOutAction() {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/login?signed_out=1");
}
