import { expect, test, type Page } from "@playwright/test";

/**
 * Task 85: LLM match score.
 * Done-when: one model call returns a 0-100 score, requirements met and gaps;
 * they are saved on the job and shown.
 *
 * Uses the offline fake model (JOBPILOT_FAKE_LLM=1 in playwright.config.ts):
 * score = share of the posting's known skills that appear on the resume.
 * Runs after profile.e2e.ts (alphabetical) and saves its own resume first.
 */
test.describe.configure({ mode: "serial" });

const RESUME =
  "Sam Lee\nFrontend Engineer\n\nEXPERIENCE\nWonka Industries — Frontend Engineer (2020–present)\n" +
  "- Built React and TypeScript apps with Next.js for 2M users.\n- Led the design system migration.\n\n" +
  "SKILLS\nReact, TypeScript, Next.js, CSS, accessibility, testing";

async function saveResume(page: Page) {
  await page.goto("/profile");
  await page.getByLabel("Master resume").fill(RESUME);
  await page.getByRole("button", { name: "Save resume" }).click();
  await expect(page.getByRole("status")).toContainText("Saved");
}

async function addJob(page: Page, company: string, url: string, description: string) {
  await page.goto("/jobs");
  await page.getByLabel("Company").fill(company);
  await page.getByLabel("Job title").fill("Senior Frontend Engineer");
  await page.getByLabel("Apply link").fill(url);
  await page.getByLabel("Job description", { exact: true }).fill(description);
  await page.getByRole("button", { name: "Add job" }).click();
  await expect(page.getByRole("status").first()).toContainText(`Added Senior Frontend Engineer at ${company}.`);
}

const card = (page: Page, company: string) => page.getByTestId("job-card").filter({ hasText: company });

test("scores a job and shows the score, requirements met and gaps (done-when)", async ({ page }) => {
  await saveResume(page);
  await addJob(
    page,
    "Umbrella",
    "https://boards.greenhouse.io/umbrella/jobs/4004",
    "We need a senior frontend engineer: React, TypeScript, GraphQL and AWS experience required.",
  );

  const umbrella = card(page, "Umbrella");
  await expect(umbrella.getByTestId("match-panel")).toHaveCount(0);
  await umbrella.getByRole("button", { name: "Score match" }).click();

  const panel = umbrella.getByTestId("match-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("50%");
  await expect(panel).toContainText("Partial match");
  await expect(panel.getByRole("meter", { name: "Match score" })).toHaveAttribute("aria-valuenow", "50");
  await expect(panel.getByRole("list", { name: "Requirements met" }).getByRole("listitem")).toHaveText([
    "React — on your resume",
    "TypeScript — on your resume",
  ]);
  await expect(panel.getByRole("list", { name: "Gaps" }).getByRole("listitem")).toHaveText(["GraphQL", "AWS"]);
  await expect(panel).toContainText("Gaps are never added to your tailored resume.");
  await expect(umbrella.getByRole("button", { name: "Re-score" })).toBeVisible();
});

test("keeps the score after a reload", async ({ page }) => {
  await page.goto("/jobs");
  const panel = card(page, "Umbrella").getByTestId("match-panel");
  await expect(panel).toContainText("50%");
  await expect(panel.getByRole("list", { name: "Gaps" }).getByRole("listitem")).toHaveCount(2);
});

test("shows a friendly error when the model is busy and saves no score", async ({ page }) => {
  await addJob(
    page,
    "Cyberdyne",
    "https://jobs.lever.co/cyberdyne/5005",
    "Frontend role using React. FAKE_LLM_UNAVAILABLE makes the fake model act busy.",
  );
  const cyberdyne = card(page, "Cyberdyne");
  await cyberdyne.getByRole("button", { name: "Score match" }).click();
  await expect(cyberdyne.getByRole("status")).toHaveText("Gemini is busy right now. Try again in a minute.");
  await expect(cyberdyne.getByTestId("match-panel")).toHaveCount(0);
  await page.reload();
  await expect(card(page, "Cyberdyne").getByTestId("match-panel")).toHaveCount(0);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("Score match still works", async ({ page }) => {
    await page.goto("/jobs");
    // Initech (from jobs.e2e.ts) asks for React only -> 100% with this resume.
    await card(page, "Initech").getByRole("button", { name: "Score match" }).click();
    await page.waitForLoadState();
    await page.goto("/jobs");
    await expect(card(page, "Initech").getByTestId("match-panel")).toContainText("100%");
  });
});
