import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";

/** Email confirmation link lands here with ?code=…; exchanges it for a session. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  if (code) {
    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }
  return NextResponse.redirect(new URL("/login?error=link", request.url));
}
