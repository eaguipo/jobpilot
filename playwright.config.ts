import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests: a real browser against a production build of the app.
 * - Uses its own database (.e2e/jobpilot.db), wiped on every run, so your real
 *   data/jobpilot.db is never touched.
 * - Builds into .next-e2e so it doesn't clash with a running `npm run dev`.
 */
const PORT = 3200;

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `rm -rf .e2e && next build && next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    env: { JOBPILOT_DB: ".e2e/jobpilot.db", NEXT_DIST_DIR: ".next-e2e" },
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
