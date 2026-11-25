import { expect, test, type Browser, type Page } from "@playwright/test";
import { evidence } from "./evidence";

/**
 * Task 22: Add job by pasting a link.
 * Done-when: the user pastes a posting URL; the posting is fetched and parsed into the
 * Add job form; the added job goes on to scoring like any other.
 *
 * Own fresh account, so it doesn't depend on the order of other files.
 * Offline fake boards (JOBPILOT_FAKE_BOARDS=1): slugs "missing" and "down" answer 404 and 503.
 */
test.describe.configure({ mode: "serial" });

const PASSWORD = "a-good-password-1";
const email = `link-${Date.now()}@example.com`;
const GH_LINK = "https://boards.greenhouse.io/initech/jobs/4012345?gh_src=newsletter";
const GH_CANONICAL = "https://job-boards.greenhouse.io/initech/jobs/4012345";

let page: Page;

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

const linkForm = (p: Page) => p.getByRole("form", { name: "Fill from a job link" });
const addForm = (p: Page) => p.getByRole("form", { name: "Add a job" });
async function fillFrom(p: Page, link: string) {
  await p.getByLabel("Job link", { exact: true }).fill(link);
  await p.getByRole("button", { name: /fill from link|reading/i }).click();
}

test.beforeAll(async ({ browser }) => {
  page = await signUp(browser);
});
test.afterAll(async () => {
  await page.context().close();
});

test("refuses links from sites it can't read, without touching the form", async () => {
  await page.getByLabel("Company").fill("Typed by hand");
  await fillFrom(page, "https://www.linkedin.com/jobs/view/123");
  await expect(linkForm(page).getByRole("status")).toHaveText(/Only Greenhouse, Lever or Ashby posting links/);
  await expect(page.getByLabel("Job link", { exact: true })).toHaveValue("https://www.linkedin.com/jobs/view/123");
  await expect(page.getByLabel("Job link", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Company")).toHaveValue("Typed by hand");
});

test("explains a closed posting and a board that's down", async () => {
  await fillFrom(page, "https://jobs.lever.co/missing/5ac21346-8e0c-4494-8e7a-3eb92ff77902");
  await expect(linkForm(page).getByRole("status")).toHaveText(/Couldn't find that posting/);
  await fillFrom(page, "https://job-boards.greenhouse.io/down/jobs/1");
  await expect(linkForm(page).getByRole("status")).toHaveText(/The job board didn't answer in time/);
});

test("fills the Add job form from a Greenhouse link, for the user to check", async () => {
  await fillFrom(page, GH_LINK);
  await expect(linkForm(page).getByRole("status")).toHaveText("Filled in below. Check the details, then add the job.");
  await expect(page.getByLabel("Company")).toHaveValue("Initech");
  await expect(page.getByLabel("Job title")).toHaveValue("Frontend Engineer");
  await expect(page.getByLabel("Apply link")).toHaveValue(GH_CANONICAL);
  const description = page.getByLabel("Job description", { exact: true });
  await expect(description).toHaveValue(/^Location: Remote\n\nBuild the React and TypeScript front end/);
  await expect(description).toHaveValue(/- GraphQL & AWS$/);
  await expect(page.getByTestId("job-card")).toHaveCount(0); // nothing saved yet
  await evidence(page.getByRole("region", { name: "Add a job" }), "22-filled-from-link");
});

test("lets the user edit the filled values before adding", async () => {
  await page.getByLabel("Company").fill("Initech Labs");
  await addForm(page).getByRole("button", { name: /add job|adding/i }).click();
  await expect(addForm(page).getByRole("status")).toHaveText("Added Frontend Engineer at Initech Labs.");
  const card = page.getByTestId("job-card").filter({ hasText: "Initech Labs" });
  await expect(card).toHaveCount(1);
  await expect(card.locator(`a[href="${GH_CANONICAL}"]`)).toHaveCount(1);
  await expect(page.getByLabel("Company")).toHaveValue(""); // the form is cleared after adding
});

test("goes on to scoring like a job typed in by hand", async () => {
  await page.goto("/profile");
  await page.getByLabel("Master resume").fill(
      [
        "Robin Park — Frontend Engineer",
        "Five years building React and TypeScript apps with Next.js for online stores.",
        "Led the checkout rewrite at Northwind, cutting page load time by half.",
        "Built GraphQL APIs on AWS and ran the team's accessibility reviews.",
      ].join("\n"),
    );
  await page.getByRole("button", { name: "Save resume" }).click();
  await expect(page.getByRole("status")).toContainText("Saved");

  await page.goto("/jobs");
  const card = page.getByTestId("job-card").filter({ hasText: "Initech Labs" });
  await card.getByRole("button", { name: "Score match" }).click();
  await expect(card.getByTestId("match-panel")).toBeVisible();
  await expect(card.getByRole("meter", { name: "Match score" })).toHaveAttribute("aria-valuenow", /\d+/);
  await evidence(card, "22-link-job-scored");
});

test("says so when the same posting is pasted again, in another form of the link", async () => {
  await fillFrom(page, "https://boards.greenhouse.io/embed/job_app?for=initech&token=4012345");
  await expect(linkForm(page).getByRole("status")).toHaveText("Already added: Frontend Engineer at Initech Labs.");
  await expect(page.getByLabel("Company")).toHaveValue("");
});

test("reads Lever and Ashby links too", async () => {
  await fillFrom(page, "https://jobs.lever.co/hooli-xyz/5ac21346-8e0c-4494-8e7a-3eb92ff77902/apply");
  await expect(page.getByLabel("Company")).toHaveValue("Hooli Xyz"); // Lever's API has no company name
  await expect(page.getByLabel("Apply link")).toHaveValue("https://jobs.lever.co/hooli-xyz/5ac21346-8e0c-4494-8e7a-3eb92ff77902");
  await expect(page.getByLabel("Job description", { exact: true })).toHaveValue(/You have\n- 3\+ years of React/);

  await fillFrom(page, "https://jobs.ashbyhq.com/globex/0b6f1a52-3c1e-4d7a-9b8e-2f4c6d8a1e01/application");
  await expect(page.getByLabel("Company")).toHaveValue("Globex");
  await expect(page.getByLabel("Job title")).toHaveValue("Frontend Engineer");
});

test("works without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, storageState: { cookies: [], origins: [] } });
  const p = await context.newPage();
  await p.goto("/login");
  await p.getByLabel("Email").fill(email);
  await p.getByLabel("Password").fill(PASSWORD);
  await p.getByRole("button", { name: "Sign in" }).click();
  await p.waitForURL((u) => u.pathname !== "/login");
  await p.goto("/jobs");
  await p.getByLabel("Job link", { exact: true }).fill(`https://jobs.ashbyhq.com/globex/0b6f1a52-3c1e-4d7a-9b8e-2f4c6d8a1e01`);
  await p.getByRole("button", { name: "Fill from link" }).click();
  await expect(p.getByLabel("Company")).toHaveValue("Globex");
  await context.close();
});
