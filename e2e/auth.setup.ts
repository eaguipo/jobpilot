import { createClient } from "@supabase/supabase-js";
import { expect, test as setup } from "@playwright/test";
import { AUTH_FILE, E2E_USER } from "./test-user";

/**
 * Runs before the other browser tests: creates a fresh test user in the LOCAL Supabase,
 * signs in through the real form, and saves the session for the other tests to reuse.
 */

setup("sign in as the e2e test user", async ({ page }) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const admin = createClient(url, process.env.E2E_SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

  // Start from a clean user each run.
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users.find((u) => u.email === E2E_USER.email);
  if (existing) await admin.auth.admin.deleteUser(existing.id);
  const { error } = await admin.auth.admin.createUser({ ...E2E_USER, email_confirm: true });
  if (error) throw error;

  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_USER.email);
  await page.getByLabel("Password").fill(E2E_USER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/jobs$/);
  await expect(page.getByTestId("signed-in-as")).toHaveText(E2E_USER.email);
  await page.context().storageState({ path: AUTH_FILE });
});
