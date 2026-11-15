import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_AFTER_LOGIN, isAuthPage, isProtected } from "@/lib/auth";
import { supabaseEnv } from "@/lib/supabase/env";

/**
 * Runs before every page: refreshes the Supabase session cookie and guards pages.
 * - Signed out on a protected page → /login?next=<page>
 * - Signed in on /login or /signup → /jobs
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = supabaseEnv();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  // Verifies the session; also refreshes an expiring token (setAll above).
  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims?.sub;
  const { pathname, search } = request.nextUrl;

  const redirectTo = (path: string) => {
    const target = NextResponse.redirect(new URL(path, request.url));
    // Keep any refreshed session cookies on the redirect.
    for (const cookie of response.cookies.getAll()) target.cookies.set(cookie);
    return target;
  };

  if (!signedIn && isProtected(pathname)) {
    return redirectTo(`/login?next=${encodeURIComponent(pathname + search)}`);
  }
  if (signedIn && isAuthPage(pathname)) {
    return redirectTo(DEFAULT_AFTER_LOGIN);
  }
  return response;
}

export const config = {
  // Everything except static files and images.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
