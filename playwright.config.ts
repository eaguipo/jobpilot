import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests: a real browser against a production build of the app.
 * Run with `npm run test:e2e` (scripts/test-e2e.sh), which points the build at the
 * LOCAL Supabase from `supabase start`.
 * - Data lives in the local Supabase; the setup step recreates the test user (and so
 *   wipes its data) on every run.
 * - Builds into .next-e2e so it doesn't clash with a running `npm run dev`.
 * - A "setup" step signs in a test user first; the other tests reuse that session.
 */
const PORT = 3200;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(supabaseUrl)) {
  throw new Error(
    `Browser tests must use the local Supabase, got "${supabaseUrl || "nothing"}". Run them with: npm run test:e2e`,
  );
}

export default defineConfig({
  testDir: "e2e",
  // Tests share one database (a single profile row), so run them one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      testMatch: "**/*.e2e.ts",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: ".e2e/auth.json" },
    },
  ],
  webServer: {
    command: `rm -rf .e2e && next build && next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      // Offline fake model: tests never call Gemini or spend your quota.
      JOBPILOT_FAKE_LLM: "1",
      // Offline fake job boards (task 22): tests never call Greenhouse, Lever or Ashby.
      JOBPILOT_FAKE_BOARDS: "1",
      GEMINI_API_KEY: "",
    },
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
