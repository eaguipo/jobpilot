import { expect, test, type Browser, type Page } from "@playwright/test";
import { evidence } from "./evidence";

/**
 * Task 75: Audit log.
 * Done-when: every document generated (match score, tailored resume, cover letter)
 * is recorded with a timestamp, and the user can see the record on /activity.
 *
 * Uses its own fresh account so it doesn't depend on the order of other files
 * (the shared test user only gets its resume in scoring.e2e.ts). Offline fake model.
 */
test.describe.configure({ mode: "serial" });

const PASSWORD = "a-good-password-1";
const email = `activity-${Date.now()}@example.com`;
const RESUME = [
  "Robin Park — Frontend Engineer",
  "Five years building React and TypeScript apps for online stores.",
  "Led the checkout rewrite at Northwind, cutting page load time by half.",
  "Mentored two junior engineers and ran the team's accessibility reviews.",
].join("\n");

let page: Page;
let entryUrl: string;

async function signUp(browser: Browser) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const p = await context.newPage();
  await p.goto("/signup");
  await p.getByLabel("Email").fill(email);
  await p.getByLabel("Password").fill(PASSWORD);
  await p.getByRole("button", { name: "Create account" }).click();
  await expect(p).toHaveURL(/\/jobs$/);
  return p;
}

const entries = (p: Page) => p.getByRole("list", { name: "Activity" }).getByTestId("activity-entry");

test.beforeAll(async ({ browser }) => {
  page = await signUp(browser);
});
test.afterAll(async () => {
  await page?.context().close();
});

test("a new account has no activity yet", async () => {
  await page.getByRole("link", { name: "Activity" }).click();
  await expect(page).toHaveURL(/\/activity$/);
  await expect(page.getByTestId("activity-empty")).toHaveText("Nothing yet. Score or tailor a job and it will show up here.");
});

test("scoring and tailoring are recorded, newest first (done-when)", async () => {
  await page.goto("/profile");
  await page.getByLabel("Master resume").fill(RESUME);
  await page.getByRole("button", { name: "Save resume" }).click();
  await expect(page.getByRole("status")).toContainText(/saved/i);

  await page.goto("/jobs");
  await page.getByLabel("Company").fill("Wayne Labs");
  await page.getByLabel("Job title").fill("Frontend Engineer");
  await page.getByLabel("Apply link").fill("https://boards.greenhouse.io/waynelabs/jobs/7501");
  await page
    .getByLabel("Job description", { exact: true })
    .fill("Build our customer dashboard with React and TypeScript, backed by a GraphQL API.");
  await page.getByRole("button", { name: "Add job" }).click();
  const card = page.getByTestId("job-card").filter({ hasText: "Wayne Labs" });

  await card.getByRole("button", { name: "Score match" }).click();
  await expect(card.getByText(/67/).first()).toBeVisible();
  await card.getByRole("button", { name: "Tailor resume & cover letter" }).click();
  await expect(card.getByRole("region", { name: "Cover letter" })).toContainText("Dear Hiring Manager,");

  await page.goto("/activity");
  await expect(entries(page)).toHaveCount(3);
  await expect(entries(page).nth(0)).toHaveAttribute("data-kind", "cover_letter_written");
  await expect(entries(page).nth(1)).toHaveAttribute("data-kind", "resume_tailored");
  await expect(entries(page).nth(2)).toHaveAttribute("data-kind", "match_scored");

  await expect(entries(page).nth(0)).toContainText("Cover letter written");
  await expect(entries(page).nth(0)).toContainText("Frontend Engineer at Wayne Labs");
  await expect(entries(page).nth(2)).toContainText("Match scored");
  await expect(entries(page).nth(2)).toContainText("67/100 · 2 met, 1 gap");
  await expect(entries(page).nth(2).getByRole("link", { name: "View text" })).toHaveCount(0);
  for (const i of [0, 1, 2]) await expect(entries(page).nth(i).locator("time")).toHaveAttribute("datetime", /^\d{4}-\d\d-\d\dT/);
  await evidence(page, "75-activity-records-generated-items");
});

test("opens the exact text that was generated", async () => {
  await page.goto("/activity");
  await entries(page).nth(0).getByRole("link", { name: "View text" }).click();
  await expect(page).toHaveURL(/\/activity\/\d+$/);
  entryUrl = new URL(page.url()).pathname;

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cover letter written");
  await expect(page.getByText("Frontend Engineer at Wayne Labs")).toBeVisible();
  const doc = page.getByTestId("activity-document");
  await expect(doc).toContainText("Dear Hiring Manager,");
  await expect(doc.locator("pre")).toHaveText(/Sincerely,\nRobin Park$/);
  await evidence(page, "75-activity-entry-document");
});

test("another user can't open your entry", async ({ page: otherUser }) => {
  // The default page is the shared e2e test user, a different account.
  const response = await otherUser.goto(entryUrl);
  expect(response?.status()).toBe(404);
  await expect(otherUser.getByText("Dear Hiring Manager,")).toHaveCount(0);
});

test("bad ids and page cursors are handled", async () => {
  expect((await page.goto("/activity/abc"))?.status()).toBe(404);
  expect((await page.goto("/activity/999999999"))?.status()).toBe(404);
  await page.goto("/activity?before=nonsense");
  await expect(entries(page)).toHaveCount(3);
  await page.goto("/activity?before=1");
  await expect(page.getByTestId("activity-empty")).toHaveText("No older activity.");
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the list and the document text still render", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, storageState: await page.context().storageState() });
    const p = await context.newPage();
    await p.goto("/activity");
    await expect(entries(p)).toHaveCount(3);
    await p.goto(entryUrl);
    await expect(p.getByTestId("activity-document")).toContainText("Dear Hiring Manager,");
    await context.close();
  });
});
