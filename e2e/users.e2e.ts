import { expect, test, type Browser } from "@playwright/test";
import { evidence } from "./evidence";
import { AUTH_FILE } from "./test-user";

/**
 * Per-user data on Supabase: each account sees only its own resume and jobs.
 * Runs last (alphabetical): the main test user already has 6 jobs and a resume
 * from the earlier files.
 */
test.describe.configure({ mode: "serial" });

const PASSWORD = "a-good-password-1";
const newcomer = `newcomer-${Date.now()}@example.com`;

async function signedUpPage(browser: Browser) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/signup");
  await page.getByLabel("Email").fill(newcomer);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/jobs$/);
  return { context, page };
}

test("a new account starts empty and adds its own job", async ({ browser }) => {
  const { context, page } = await signedUpPage(browser);
  await expect(page.getByText("No jobs yet. Add your first one above.")).toBeVisible();
  await expect(page.getByTestId("job-card")).toHaveCount(0);

  await page.goto("/profile");
  await expect(page.getByLabel("Master resume")).toHaveValue("");

  await page.goto("/jobs");
  await page.getByLabel("Company").fill("Newcomer Inc");
  await page.getByLabel("Job title").fill("Designer");
  // Same link the main user already added: allowed, because it's a different account.
  await page.getByLabel("Apply link").fill("https://boards.greenhouse.io/acme/jobs/1001");
  await page.getByLabel("Job description", { exact: true }).fill("Design role for our customer dashboard; Figma and accessibility.");
  await page.getByRole("button", { name: "Add job" }).click();
  await expect(page.getByTestId("job-card")).toHaveCount(1);
  await expect(page.getByTestId("job-card")).toContainText("Newcomer Inc");
  await evidence(page.getByRole("region", { name: /your jobs/i }), "data-new-account-sees-only-own-job");
  await context.close();
});

test("the first user never sees the other account's job", async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH_FILE });
  const page = await context.newPage();
  await page.goto("/jobs");
  await expect(page.getByTestId("job-card")).toHaveCount(6);
  await expect(page.getByText("Newcomer Inc")).toHaveCount(0);
  await page.goto("/profile");
  await expect(page.getByLabel("Master resume")).not.toHaveValue("");
  await context.close();
});
