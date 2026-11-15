import { describe, expect, it } from "vitest";
import { authErrorMessage, checkCredentials, isAuthPage, isProtected, safeNext } from "./auth";

describe("safeNext (open-redirect protection)", () => {
  it("keeps same-site paths, including query strings", () => {
    expect(safeNext("/profile")).toBe("/profile");
    expect(safeNext("/jobs?status=Applied")).toBe("/jobs?status=Applied");
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["absolute URL", "https://evil.example/phish"],
    ["protocol-relative", "//evil.example"],
    ["backslash trick", "/\\evil.example"],
    ["javascript:", "javascript:alert(1)"],
    ["no leading slash", "jobs"],
    ["control character", "/jobs\n//evil.example"],
    ["back to login", "/login"],
    ["back to signup", "/signup?next=/jobs"],
    ["too long", "/" + "a".repeat(600)],
    ["not a string", 42],
  ])("falls back to /jobs for %s", (_name, value) => {
    expect(safeNext(value)).toBe("/jobs");
  });
});

describe("page guards", () => {
  it("protects Jobs and Profile and their sub-pages, not the home page", () => {
    expect(isProtected("/jobs")).toBe(true);
    expect(isProtected("/jobs/12")).toBe(true);
    expect(isProtected("/profile")).toBe(true);
    expect(isProtected("/")).toBe(false);
    expect(isProtected("/jobsearch")).toBe(false);
    expect(isAuthPage("/login")).toBe(true);
    expect(isAuthPage("/signup")).toBe(true);
    expect(isAuthPage("/")).toBe(false);
  });
});

describe("checkCredentials", () => {
  it("accepts a valid sign-up", () => {
    expect(checkCredentials(" jane@example.com ", "long-enough-pw", "signup")).toEqual({});
  });

  it("reports missing and invalid fields", () => {
    expect(checkCredentials("", "", "signin")).toEqual({ email: "Enter your email address.", password: "Enter your password." });
    expect(checkCredentials("not-an-email", "x", "signin").email).toBe("Enter a valid email address.");
  });

  it("requires 8+ characters only when creating an account", () => {
    expect(checkCredentials("a@b.co", "short", "signup").password).toBe("Use at least 8 characters.");
    expect(checkCredentials("a@b.co", "short", "signin")).toEqual({});
    expect(checkCredentials("a@b.co", "x".repeat(73), "signup").password).toBe("Use at most 72 characters.");
  });
});

describe("authErrorMessage", () => {
  it("maps Supabase error codes to plain words", () => {
    expect(authErrorMessage({ code: "invalid_credentials" })).toBe("Wrong email or password.");
    expect(authErrorMessage({ code: "email_not_confirmed" })).toMatch(/Confirm your email/);
    expect(authErrorMessage({ code: "user_already_exists" })).toMatch(/already exists/);
    expect(authErrorMessage({ code: "weak_password" })).toMatch(/stronger password/);
    expect(authErrorMessage({ status: 429 })).toMatch(/Too many attempts/);
  });

  it("never echoes raw server messages", () => {
    expect(authErrorMessage({ code: "unexpected_failure", message: "db timeout at 10.0.0.3" })).toBe("Something went wrong. Please try again.");
  });
});
