/** Pure helpers for sign-in and sign-up (task 72), kept apart so they're easy to test. */

/** Pages that need a signed-in user. */
export const PROTECTED_PREFIXES = ["/jobs", "/profile", "/activity"];
/** Pages only for signed-out visitors. */
export const AUTH_PAGES = ["/login", "/signup"];

export const PASSWORD_MIN = 8;
export const DEFAULT_AFTER_LOGIN = "/jobs";

export const isProtected = (pathname: string) => PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
export const isAuthPage = (pathname: string) => AUTH_PAGES.includes(pathname);

/**
 * Where to go after signing in. Only same-site paths are allowed, so a link like
 * /login?next=https://evil.example can't send people to another site (open redirect).
 */
export function safeNext(next: unknown, fallback = DEFAULT_AFTER_LOGIN): string {
  if (typeof next !== "string" || next.length > 500) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\\]/.test(next)) return fallback;
  if (isAuthPage(next.split(/[?#]/)[0])) return fallback;
  return next;
}

export type CredentialErrors = Partial<Record<"email" | "password", string>>;

export function checkCredentials(email: unknown, password: unknown, mode: "signin" | "signup"): CredentialErrors {
  const errors: CredentialErrors = {};
  const e = typeof email === "string" ? email.trim() : "";
  const p = typeof password === "string" ? password : "";
  if (!e) errors.email = "Enter your email address.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 254) errors.email = "Enter a valid email address.";
  if (!p) errors.password = "Enter your password.";
  else if (mode === "signup" && p.length < PASSWORD_MIN) errors.password = `Use at least ${PASSWORD_MIN} characters.`;
  else if (p.length > 72) errors.password = "Use at most 72 characters.";
  return errors;
}

/** Supabase Auth errors in plain words. Never reveals whether an email is registered on sign-in. */
export function authErrorMessage(error: { code?: string; message?: string; status?: number }): string {
  switch (error.code) {
    case "invalid_credentials":
      return "Wrong email or password.";
    case "email_not_confirmed":
      return "Confirm your email first: open the link we sent you, then sign in.";
    case "user_already_exists":
    case "email_exists":
      return "An account with this email already exists. Sign in instead.";
    case "weak_password":
      return `Choose a stronger password (at least ${PASSWORD_MIN} characters).`;
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many attempts. Wait a minute and try again.";
    case "signup_disabled":
      return "New sign-ups are turned off.";
  }
  if (error.status === 429) return "Too many attempts. Wait a minute and try again.";
  return "Something went wrong. Please try again.";
}
