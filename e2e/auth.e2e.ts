import { expect, test, type Page } from "@playwright/test";
import { E2E_USER } from "./test-user";
import { evidence } from "./evidence";

/**
 * Task 72: Authentication (email + password with Supabase Auth).
 * Done-when: people can create an account, sign in and sign out; signed-out visitors
 * can't open Jobs or Profile.
 *
 * Each test starts signed out (no saved session).
 */
test.use({ storageState: { cookies: [], origins: [] } });

const unique = () => `user-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
const PASSWORD = "a-good-password-1";

async function fill(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
}
const formStatus = (page: Page, name: "Sign in" | "Create account") =>
  page.getByRole("form", { name }).getByRole("status");

test("signed-out visitors are sent to sign in, then back to the page they wanted (done-when)", async ({ page }) => {
  for (const path of ["/jobs", "/profile"]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path).replace("/", "\\/")}$`));
  }
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("link", { name: "Sign in" })).toBeVisible();
  await evidence(page, "72-signed-out-redirected-to-sign-in");

  await fill(page, E2E_USER.email, E2E_USER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByTestId("signed-in-as")).toHaveText(E2E_USER.email);
});

test("creates an account and lands signed in on Jobs (done-when)", async ({ page }) => {
  const email = unique();
  await page.goto("/");
  await page.getByRole("navigation").getByRole("link", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/signup/);
  await expect(page.getByText("At least 8 characters.")).toBeVisible();

  await fill(page, email, PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/jobs$/);
  await expect(page.getByTestId("signed-in-as")).toHaveText(email);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await evidence(page.getByRole("navigation"), "72-signed-in-header");
});

test("signs out, and protected pages are closed again (done-when)", async ({ page }) => {
  await page.goto("/signup");
  await fill(page, unique(), PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/jobs$/);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login\?signed_out=1$/);
  await expect(page.getByRole("note")).toHaveText("You're signed out.");
  await page.goto("/jobs");
  await expect(page).toHaveURL(/\/login\?next=%2Fjobs$/);
});

test("shows clear errors for a wrong password, bad input and an existing account", async ({ page }) => {
  await page.goto("/login");
  await fill(page, E2E_USER.email, "not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(formStatus(page, "Sign in")).toHaveText("Wrong email or password.");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Email")).toHaveValue(E2E_USER.email); // kept for retrying
  await evidence(page.getByRole("form", { name: "Sign in" }), "72-wrong-password-error");

  await page.getByLabel("Email").fill("");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Enter your email address.")).toBeVisible();
  await expect(page.getByText("Enter your password.")).toBeVisible();

  await page.goto("/signup");
  await fill(page, unique(), "short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Use at least 8 characters.")).toBeVisible();

  await fill(page, E2E_USER.email, PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(formStatus(page, "Create account")).toHaveText("An account with this email already exists. Sign in instead.");
});

test("never redirects to another site after sign-in (open redirect)", async ({ page }) => {
  for (const evil of ["//evil.example", "https://evil.example", "/\\evil.example"]) {
    await page.context().clearCookies();
    await page.goto(`/login?next=${encodeURIComponent(evil)}`);
    await fill(page, E2E_USER.email, E2E_USER.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/^http:\/\/localhost:3200\/jobs$/);
  }
});

test("signed-in users skip the sign-in and sign-up pages", async ({ page }) => {
  await page.goto("/login");
  await fill(page, E2E_USER.email, E2E_USER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/jobs$/);
  for (const path of ["/login", "/signup"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/jobs$/);
  }
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("signing in still works", async ({ page }) => {
    await page.goto("/login?next=%2Fprofile");
    await fill(page, E2E_USER.email, E2E_USER.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByTestId("signed-in-as")).toHaveText(E2E_USER.email);
  });
});
