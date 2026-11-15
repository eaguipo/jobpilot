import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseEnv } from "./env";

/** Supabase client for server components, server actions and route handlers (session from cookies). */
export async function createSupabaseServer() {
  const { url, key } = supabaseEnv();
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) store.set(name, value, options);
        } catch {
          // Called from a server component, where cookies are read-only. The middleware refreshes them.
        }
      },
    },
  });
}

export interface SessionUser {
  id: string;
  email: string | null;
}

/** The signed-in user, verified (signature-checked claims), or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return { id: data.claims.sub, email: (data.claims.email as string | undefined) ?? null };
}

/** For pages and server actions that need a user: sends signed-out visitors to sign in. */
export async function requireUser(next = "/jobs"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}
