import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { evidence } from "./evidence";

/**
 * AI usage limits (task 74). Uses its own new account, so the per-minute limit it
 * runs into doesn't slow down the other tests' user.
 */
const email = `limits-${Date.now()}@example.com`;
const password = "a-good-password-1";

test("the jobs page shows runs left, and a burst of AI runs is stopped with a clear message", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/jobs$/);
  await expect(page.getByTestId("ai-quota")).toContainText("AI runs left today: 50 of 50");

  await page.goto("/profile");
  await page.getByLabel("Master resume").fill("Jane Doe, Frontend Engineer. " + "Built React and TypeScript apps at Acme. ".repeat(6));
  await page.getByRole("button", { name: /save resume/i }).click();
  await expect(page.getByRole("status").filter({ hasText: /saved/i })).toBeVisible();

  await page.goto("/jobs");
  await page.getByLabel("Company").fill("Limits Co");
  await page.getByLabel("Job title").fill("Frontend Engineer");
  await page.getByLabel("Apply link").fill("https://jobs.example.com/limits-1");
  await page.getByLabel("Job description", { exact: true }).fill("Frontend role building React and TypeScript apps for customers.");
  await page.getByRole("button", { name: "Add job" }).click();
  const card = page.getByTestId("job-card").filter({ hasText: "Limits Co" });
  await expect(card).toBeVisible();

  // Use up this minute's allowance (10) the way rapid clicking would, as the same signed-in user.
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await sb.auth.signInWithPassword({ email, password });
  for (let i = 0; i < 10; i++) expect((await sb.rpc("use_ai_quota", { p_kind: "score" })).data.allowed).toBe(true);

  await page.reload();
  await expect(page.getByTestId("ai-quota")).toContainText("AI runs left today: 40 of 50");
  await card.getByRole("button", { name: "Score match" }).click();
  await expect(card.getByRole("form", { name: "Score match" }).getByRole("status")).toHaveText(
    /^Too many AI runs in a row\. Try again in \d+ seconds?\.$/,
  );
  await expect(card.getByTestId("match-panel")).toHaveCount(0); // nothing was scored
  await evidence(card, "limits-burst-stopped");
  await context.close();
});
