import { expect, test, type Page } from "@playwright/test";

/**
 * Task 84: Add job form.
 * Done-when: company, title, apply link and pasted description can be entered,
 * and the job appears in the list.
 *
 * Serial: the tests share one fresh database and build on each other.
 */
test.describe.configure({ mode: "serial" });

const DESCRIPTION = [
  "We're hiring a Frontend Engineer to build our customer dashboard.",
  "",
  "Requirements:",
  "- 3+ years with React and TypeScript",
  "- Experience with Next.js & <Tailwind CSS>",
].join("\n");

const JOB = {
  company: "Acme Corp",
  title: "Frontend Engineer",
  applyUrl: "https://boards.greenhouse.io/acme/jobs/1001",
  description: DESCRIPTION,
};

async function fillJob(page: Page, job: Partial<typeof JOB>) {
  if (job.company !== undefined) await page.getByLabel("Company").fill(job.company);
  if (job.title !== undefined) await page.getByLabel("Job title").fill(job.title);
  if (job.applyUrl !== undefined) await page.getByLabel("Apply link").fill(job.applyUrl);
  if (job.description !== undefined) await page.getByLabel("Job description", { exact: true }).fill(job.description);
}
const addButton = (page: Page) => page.getByRole("button", { name: /add job|adding/i });
const cards = (page: Page) => page.getByTestId("job-card");
const status = (page: Page) => page.getByRole("form", { name: "Add a job" }).getByRole("status");

test("header links to the Jobs page, which starts empty", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation").getByRole("link", { name: "Jobs" }).click();
  await expect(page).toHaveURL(/\/jobs$/);
  await expect(page.getByRole("heading", { name: "Jobs", level: 1 })).toBeVisible();
  await expect(page.getByText("No jobs yet.")).toBeVisible();
  await expect(cards(page)).toHaveCount(0);
});

test("shows an error on every empty field and adds nothing", async ({ page }) => {
  await page.goto("/jobs");
  await addButton(page).click();
  await expect(status(page)).toHaveText("Fix the highlighted fields.");
  await expect(page.getByText("Enter the company name.")).toBeVisible();
  await expect(page.getByText("Enter the job title.")).toBeVisible();
  await expect(page.getByText("Paste the link to the job posting or application.")).toBeVisible();
  await expect(page.getByText("Paste the job description.")).toBeVisible();
  await expect(page.getByLabel("Company")).toHaveAttribute("aria-invalid", "true");
  await expect(cards(page)).toHaveCount(0);
});

test("rejects an unsafe link but keeps what was typed", async ({ page }) => {
  await page.goto("/jobs");
  await fillJob(page, { ...JOB, applyUrl: "javascript:alert(1)" });
  await addButton(page).click();
  await expect(page.getByText("Use a full web link starting with https://")).toBeVisible();
  await expect(page.getByLabel("Company")).toHaveValue(JOB.company);
  await expect(page.getByLabel("Job description", { exact: true })).toHaveValue(JOB.description);
  await expect(cards(page)).toHaveCount(0);
});

test("adds a job and shows it in the list (done-when)", async ({ page }) => {
  await page.goto("/jobs");
  await fillJob(page, JOB);
  await addButton(page).click();

  await expect(status(page)).toHaveText(`Added ${JOB.title} at ${JOB.company}.`);
  await expect(page.getByLabel("Company")).toHaveValue(""); // form clears for the next job
  await expect(cards(page)).toHaveCount(1);

  const card = cards(page).first();
  await expect(card.getByRole("heading", { name: JOB.title })).toBeVisible();
  await expect(card.getByText(JOB.company)).toBeVisible();
  await expect(card.getByLabel("Status", { exact: true })).toHaveValue("Matched");

  const link = card.getByRole("link", { name: /open apply link/i });
  await expect(link).toHaveAttribute("href", JOB.applyUrl);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);

  // No resume saved yet in this run, so scoring points to the Profile page.
  await expect(card.getByRole("link", { name: "Add your resume" })).toHaveAttribute("href", "/profile");
  await expect(card.getByRole("button", { name: "Score match" })).toHaveCount(0);

  await card.getByText("Job description").click();
  await expect(card.getByText("Experience with Next.js & <Tailwind CSS>")).toBeVisible();
});

test("keeps jobs after a reload and lists the newest first", async ({ page }) => {
  await page.goto("/jobs");
  await fillJob(page, {
    company: "Globex",
    title: "Full Stack Developer",
    applyUrl: "https://jobs.lever.co/globex/2002",
    description: "Globex is looking for a full stack developer with Node.js and React experience.",
  });
  await addButton(page).click();
  await expect(status(page)).toContainText("Added Full Stack Developer at Globex.");

  await page.reload();
  await expect(cards(page)).toHaveCount(2);
  await expect(cards(page).nth(0)).toContainText("Globex");
  await expect(cards(page).nth(1)).toContainText("Acme Corp");
  await expect(page.getByRole("heading", { name: /your jobs/i })).toContainText("(2)");
});

test("refuses the same posting twice, even with a different #fragment", async ({ page }) => {
  await page.goto("/jobs");
  await fillJob(page, { ...JOB, company: "Acme again", applyUrl: `${JOB.applyUrl}#app` });
  await addButton(page).click();
  await expect(page.getByText(`Already added: ${JOB.title} at ${JOB.company}.`)).toBeVisible();
  await expect(cards(page)).toHaveCount(2);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the form still adds a job", async ({ page }) => {
    await page.goto("/jobs");
    await fillJob(page, {
      company: "Initech",
      title: "UI Engineer",
      applyUrl: "https://jobs.ashbyhq.com/initech/3003",
      description: "Initech needs a UI engineer comfortable with accessible React components.",
    });
    await addButton(page).click();
    await page.waitForLoadState();

    await page.goto("/jobs");
    await expect(cards(page)).toHaveCount(3);
    await expect(cards(page).first()).toContainText("Initech");
  });
});
