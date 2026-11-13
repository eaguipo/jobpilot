import { expect, test, type Page } from "@playwright/test";
import { evidence } from "./evidence";

/**
 * Task 86: Tailored resume and cover letter.
 * Done-when: generate both with an only-use-resume-facts prompt, run a simple
 * check that flags skills/companies not in the resume, and offer copy buttons.
 *
 * Runs after scoring.e2e.ts (alphabetical), which saved Sam Lee's resume and
 * scored the Umbrella job (gaps: GraphQL, AWS). Uses the offline fake model.
 */
test.describe.configure({ mode: "serial" });

const card = (page: Page, company: string) => page.getByTestId("job-card").filter({ hasText: company });
const resumeDoc = (page: Page, company: string) => card(page, company).getByRole("region", { name: "Tailored resume" });
const letterDoc = (page: Page, company: string) => card(page, company).getByRole("region", { name: "Cover letter" });

test("writes a tailored resume and cover letter that pass the check (done-when)", async ({ page }) => {
  await page.goto("/jobs");
  const umbrella = card(page, "Umbrella");
  await expect(umbrella.getByRole("region", { name: "Tailored resume" })).toHaveCount(0);

  await umbrella.getByRole("button", { name: "Tailor resume & cover letter" }).click();

  const resume = resumeDoc(page, "Umbrella");
  const letter = letterDoc(page, "Umbrella");
  await expect(resume).toContainText("Tailored for Senior Frontend Engineer at Umbrella.");
  await expect(resume).toContainText("Sam Lee");
  await expect(letter).toContainText("Dear Hiring Manager,");
  await expect(letter).toContainText("Senior Frontend Engineer role at Umbrella");
  await expect(letter.locator("pre")).toHaveText(/Sincerely,\nSam Lee$/);

  await expect(resume.getByTestId("fact-check")).toContainText("No skills, numbers or names found");
  await expect(letter.getByTestId("fact-check")).toContainText("No skills, numbers or names found");
  await expect(umbrella.getByRole("button", { name: "Regenerate documents" })).toBeVisible();
  await evidence(umbrella.locator("details", { hasText: "Tailored resume & cover letter" }), "86-tailored-docs-check-passed");
});

test("copy buttons put the exact text on the clipboard", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/jobs");
  const letter = letterDoc(page, "Umbrella");
  const expected = await letter.locator("pre").innerText();

  await letter.getByRole("button", { name: "Copy cover letter" }).click();
  await expect(letter.getByRole("button", { name: "Copy cover letter" })).toHaveText("Copied ✓");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected);

  const resume = resumeDoc(page, "Umbrella");
  await resume.getByRole("button", { name: "Copy tailored resume" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Tailored for Senior Frontend Engineer at Umbrella.");
});

test("keeps the documents after a reload", async ({ page }) => {
  await page.goto("/jobs");
  await expect(resumeDoc(page, "Umbrella")).toContainText("Tailored for Senior Frontend Engineer at Umbrella.");
  await expect(letterDoc(page, "Umbrella")).toContainText("Dear Hiring Manager,");
});

test("flags invented skills, numbers and companies", async ({ page }) => {
  await page.goto("/jobs");
  await page.getByLabel("Company").fill("Soylent");
  await page.getByLabel("Job title").fill("Platform Engineer");
  await page.getByLabel("Apply link").fill("https://jobs.ashbyhq.com/soylent/6006");
  await page
    .getByLabel("Job description", { exact: true })
    .fill("Platform role with React and Kubernetes. FAKE_LLM_INVENT makes the fake model add facts.");
  await page.getByRole("button", { name: "Add job" }).click();
  await expect(card(page, "Soylent")).toBeVisible();

  await card(page, "Soylent").getByRole("button", { name: "Tailor resume & cover letter" }).click();

  const resumeFlags = resumeDoc(page, "Soylent").getByRole("list", { name: "Not on your resume" }).getByRole("listitem");
  await expect(resumeFlags).toHaveText(["Skill: Kubernetes", "Number: 300%", "Name: Hooli"]);
  await expect(resumeDoc(page, "Soylent").getByTestId("fact-check")).toContainText("Check before using: 3 items aren't on your resume.");

  const letterFlags = letterDoc(page, "Soylent").getByRole("list", { name: "Not on your resume" }).getByRole("listitem");
  await expect(letterFlags).toHaveText(["Skill: Kubernetes"]);
  await expect(letterDoc(page, "Soylent").getByTestId("fact-check")).toContainText("1 item isn't on your resume.");
  // Scroll the resume box to the invented line so the flagged text and the flags are both visible.
  await resumeDoc(page, "Soylent").locator("pre").evaluate((el) => (el.scrollTop = el.scrollHeight));
  await evidence(card(page, "Soylent").locator("details", { hasText: "Tailored resume & cover letter" }), "86-fact-check-flags-invented-items");
});

test("shows a friendly error when the model is busy and saves nothing", async ({ page }) => {
  await page.goto("/jobs");
  const cyberdyne = card(page, "Cyberdyne");
  await cyberdyne.getByRole("button", { name: "Tailor resume & cover letter" }).click();
  await expect(cyberdyne.getByRole("form", { name: "Tailor resume & cover letter" }).getByRole("status")).toHaveText("Gemini is busy right now. Try again in a minute.");
  await page.reload();
  await expect(resumeDoc(page, "Cyberdyne")).toHaveCount(0);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("tailoring still works", async ({ page }) => {
    await page.goto("/jobs");
    await card(page, "Initech").getByRole("button", { name: "Tailor resume & cover letter" }).click();
    await page.waitForLoadState();
    await page.goto("/jobs");
    await expect(resumeDoc(page, "Initech")).toContainText("Tailored for UI Engineer at Initech.");
  });
});
