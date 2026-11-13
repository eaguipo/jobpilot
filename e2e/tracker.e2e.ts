import { expect, test, type Page } from "@playwright/test";
import { evidence } from "./evidence";

/**
 * Task 87: Tracker list.
 * Done-when: list of jobs with a status dropdown (Matched, Applied, Interviewing,
 * Offer, Rejected) and an Open apply link button; status persists.
 *
 * Runs last (alphabetical). Jobs already added by earlier files, all "Matched":
 * Acme Corp, Globex, Initech (jobs) · Umbrella, Cyberdyne (scoring) · Soylent (tailoring).
 */
test.describe.configure({ mode: "serial" });

const card = (page: Page, company: string) => page.getByTestId("job-card").filter({ hasText: company });
const statusOf = (page: Page, company: string) => card(page, company).getByLabel("Status", { exact: true });
const chips = (page: Page) => page.getByRole("navigation", { name: "Filter by status" });
const historyItems = (page: Page, company: string) =>
  card(page, company).getByRole("list", { name: "Status history" }).getByRole("listitem");

test("every job has a status dropdown with all five statuses and an Open apply link", async ({ page }) => {
  await page.goto("/jobs");
  await expect(page.getByTestId("job-card")).toHaveCount(6);
  const select = statusOf(page, "Acme Corp");
  await expect(select).toHaveValue("Matched");
  await expect(select.locator("option")).toHaveText(["Matched", "Applied", "Interviewing", "Offer", "Rejected"]);

  const link = card(page, "Acme Corp").getByRole("link", { name: "Open apply link ↗" });
  await expect(link).toHaveAttribute("href", "https://boards.greenhouse.io/acme/jobs/1001");
  await expect(link).toHaveAttribute("target", "_blank");
});

test("changing the status saves it and it survives a reload (done-when)", async ({ page }) => {
  await page.goto("/jobs");
  await statusOf(page, "Acme Corp").selectOption("Applied");
  await expect(card(page, "Acme Corp").getByRole("form", { name: "Change status" }).getByRole("status")).toHaveText("Saved");
  await expect(card(page, "Acme Corp")).toContainText(/Applied [A-Z][a-z]{2} \d{1,2}, \d{4}/);

  await page.reload();
  await expect(statusOf(page, "Acme Corp")).toHaveValue("Applied");
  await expect(statusOf(page, "Globex")).toHaveValue("Matched"); // others untouched
});

test("keeps a status history, newest first", async ({ page }) => {
  await page.goto("/jobs");
  await statusOf(page, "Acme Corp").selectOption("Interviewing");
  await expect(card(page, "Acme Corp").getByRole("form", { name: "Change status" }).getByRole("status")).toHaveText("Saved");

  await page.reload();
  await card(page, "Acme Corp").getByText("Status history (3)").click();
  await expect(historyItems(page, "Acme Corp")).toHaveText([/Applied → Interviewing$/, /Matched → Applied$/, /Added as Matched$/]);
  // "Applied <date>" stays even after moving on to Interviewing.
  await expect(card(page, "Acme Corp")).toContainText(/Applied [A-Z][a-z]{2} \d{1,2}, \d{4}/);
  await evidence(card(page, "Acme Corp"), "87-status-saved-with-history");
});

test("filter chips show counts and filter the list", async ({ page }) => {
  await page.goto("/jobs");
  await statusOf(page, "Globex").selectOption("Rejected");
  await expect(card(page, "Globex").getByRole("form", { name: "Change status" }).getByRole("status")).toHaveText("Saved");
  await page.reload();

  await expect(chips(page).getByRole("link")).toHaveText([
    "All (6)",
    "Matched (4)",
    "Applied (0)",
    "Interviewing (1)",
    "Offer (0)",
    "Rejected (1)",
  ]);
  await expect(chips(page).getByRole("link", { name: "All (6)" })).toHaveAttribute("aria-current", "page");

  await chips(page).getByRole("link", { name: "Interviewing (1)" }).click();
  await expect(page).toHaveURL(/\/jobs\?status=Interviewing$/);
  await expect(page.getByTestId("job-card")).toHaveCount(1);
  await expect(page.getByTestId("job-card")).toContainText("Acme Corp");
  await expect(chips(page).getByRole("link", { name: "Interviewing (1)" })).toHaveAttribute("aria-current", "page");
  await evidence(page, "87-filter-by-status");

  await chips(page).getByRole("link", { name: "Offer (0)" }).click();
  await expect(page.getByText("No jobs with status Offer.")).toBeVisible();
  await page.getByRole("link", { name: "Show all" }).click();
  await expect(page.getByTestId("job-card")).toHaveCount(6);
});

test("an unknown status in the URL just shows all jobs", async ({ page }) => {
  await page.goto("/jobs?status=Ghosted");
  await expect(page.getByTestId("job-card")).toHaveCount(6);
  await expect(chips(page).getByRole("link", { name: "All (6)" })).toHaveAttribute("aria-current", "page");
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("a Save button appears and the status still saves", async ({ page }) => {
    await page.goto("/jobs");
    const form = card(page, "Initech").getByRole("form", { name: "Change status" });
    await form.getByLabel("Status", { exact: true }).selectOption("Offer");
    await form.getByRole("button", { name: "Save" }).click();
    await page.waitForLoadState();

    await page.goto("/jobs");
    await expect(statusOf(page, "Initech")).toHaveValue("Offer");
  });
});

test("with JavaScript there is no Save button: changes save on their own", async ({ page }) => {
  await page.goto("/jobs");
  await expect(card(page, "Initech").getByRole("form", { name: "Change status" }).getByRole("button", { name: "Save" })).toHaveCount(0);
});
