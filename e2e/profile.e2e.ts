import { expect, test, type Page } from "@playwright/test";
import { evidence } from "./evidence";

/**
 * Task 83: Profile page – paste master resume.
 * Done-when: the resume is saved and still there after a reload.
 *
 * Serial: every test shares one fresh database, and the first test relies on
 * no resume having been saved yet.
 */
test.describe.configure({ mode: "serial" });

const RESUME = [
  "Jane Doe",
  "Frontend Engineer · jane@example.com",
  "",
  "EXPERIENCE",
  "Acme Corp — Senior Frontend Engineer (2021–present)",
  "- Built React & TypeScript dashboards used by <5,000> customers.",
  "- Cut page load time by 40% with code splitting.",
  "",
  "SKILLS",
  "React, TypeScript, Next.js, Tailwind CSS, Playwright",
].join("\n");

const resumeBox = (page: Page) => page.getByLabel("Master resume");
const saveButton = (page: Page) => page.getByRole("button", { name: /save resume|saving/i });
const status = (page: Page) => page.getByRole("status");

test("home page links to the Profile page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("JobPilot");
  await page.getByRole("link", { name: "Go to Profile" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
});

test("starts empty: no resume, Save disabled, no status message", async ({ page }) => {
  await page.goto("/profile");
  await expect(resumeBox(page)).toHaveValue("");
  await expect(saveButton(page)).toBeDisabled();
  await expect(status(page)).toHaveText("");
  await expect(page.getByText(/^0 \/ 50,000 characters/)).toBeVisible();
});

test("rejects a too-short resume and saves nothing", async ({ page }) => {
  await page.goto("/profile");
  await resumeBox(page).fill("Jane Doe, engineer");
  await expect(status(page)).toHaveText("Unsaved changes");
  await saveButton(page).click();
  await expect(status(page)).toContainText("too short");

  await page.reload();
  await expect(resumeBox(page)).toHaveValue("");
});

test("saves the resume and keeps it after a reload (done-when)", async ({ page }) => {
  await page.goto("/profile");
  await resumeBox(page).fill(RESUME);
  await expect(page.getByText(`${RESUME.length} / 50,000 characters`)).toBeVisible();
  await expect(saveButton(page)).toBeEnabled();

  await saveButton(page).click();
  await expect(status(page)).toContainText(/^Saved /);
  await expect(saveButton(page)).toBeDisabled();

  await page.reload();
  await expect(resumeBox(page)).toHaveValue(RESUME);
  await expect(status(page)).toContainText(/^Saved /);
  await evidence(page, "83-profile-resume-saved-after-reload");
});

test("shows Unsaved changes while editing and clears it when the edit is undone", async ({ page }) => {
  await page.goto("/profile");
  await expect(resumeBox(page)).toHaveValue(RESUME);

  await resumeBox(page).fill(`${RESUME}\nGraphQL`);
  await expect(status(page)).toHaveText("Unsaved changes");
  await expect(saveButton(page)).toBeEnabled();

  await resumeBox(page).fill(RESUME);
  await expect(status(page)).toContainText(/^Saved /);
  await expect(saveButton(page)).toBeDisabled();
});

test("saves an updated resume, replacing the previous one", async ({ page }) => {
  const updated = `${RESUME}\nGraphQL`;
  await page.goto("/profile");
  await resumeBox(page).fill(updated);
  await saveButton(page).click();
  await expect(status(page)).toContainText(/^Saved /);

  await page.reload();
  await expect(resumeBox(page)).toHaveValue(updated);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the form still saves and the resume survives a reload", async ({ page }) => {
    const noJs = `${RESUME}\nSaved without JavaScript`;
    await page.goto("/profile");
    await resumeBox(page).fill(noJs);
    await saveButton(page).click();
    await page.waitForLoadState();

    await page.goto("/profile");
    await expect(resumeBox(page)).toHaveValue(noJs);
  });
});
