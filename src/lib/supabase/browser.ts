"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "./env";

/**
 * Supabase client for the browser, signed in with the same session cookies as the server.
 * Used only where the browser must talk to Supabase directly: resume uploads (story 11),
 * which are too big to pass through a Vercel function. RLS and Storage policies apply.
 */
export function createSupabaseBrowser() {
  const { url, key } = supabaseEnv();
  return createBrowserClient(url, key);
}
