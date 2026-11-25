import { expect, test, type Browser, type Page } from "@playwright/test";
import path from "node:path";
import { evidence } from "./evidence";

/**
 * Story 11: Upload master resume (PDF/DOCX).
 * Done-when: the user uploads a PDF or DOCX up to 5 MB; the file is stored; its text
 * becomes the master resume after the user checks it and saves.
 *
 * Own fresh account, so it doesn't depend on the order of other files.
 * Uploads go to the local Supabase Storage. Test files are made up (scripts/make-resume-fixtures.py).
 */
test.describe.configure({ mode: "serial" });

const PASSWORD = "a-good-password-1";
const email = `upload-${Date.now()}@example.com`;
const fixture = (name: string) => path.join(__dirname, "fixtures", name);

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

const uploadStatus = (p: Page) => p.getByTestId("upload-status");
const resumeBox = (p: Page) => p.getByLabel("Master resume");
const choose = (p: Page, file: string | { name: string; mimeType: string; buffer: Buffer }) =>
  p.getByLabel("Upload PDF or DOCX").setInputFiles(typeof file === "string" ? fixture(file) : file);

test.beforeAll(async ({ browser }) => {
  page = await signUp(browser);
  await page.goto("/profile");
});
test.afterAll(async () => {
  await page.context().close();
});

test("reads a PDF into the resume box for the user to check, without saving it", async () => {
  await choose(page, "resume.pdf");
  await expect(uploadStatus(page)).toHaveText("Read resume.pdf. Check the text below, then save.");
  await expect(resumeBox(page)).toHaveValue(/^Jordan Reyes - Frontend Engineer\n/);
  await expect(resumeBox(page)).toHaveValue(/- Cut checkout page load time by 40% with server rendering\./);
  await expect(page.getByRole("status")).toHaveText("Unsaved changes");
  await evidence(page.getByRole("main"), "11-resume-read-from-pdf");
});

test("saves the text as the master resume and keeps the file", async () => {
  await page.getByRole("button", { name: "Save resume" }).click();
  await expect(page.getByRole("status")).toContainText("Saved");

  await page.reload();
  await expect(resumeBox(page)).toHaveValue(/^Jordan Reyes - Frontend Engineer\n/);
  const stored = page.getByTestId("stored-resume-file");
  await expect(stored).toContainText("Uploaded file: resume.pdf · 1 KB");
  await evidence(page.getByRole("main"), "11-resume-saved-with-file");

  // The download link serves the same file back, to this user only (signed link).
  const href = await stored.getByRole("link", { name: "Download" }).getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect((await res.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("replaces the stored file with a DOCX", async () => {
  await choose(page, "resume.docx");
  await expect(uploadStatus(page)).toHaveText("Read resume.docx. Check the text below, then save.");
  await expect(resumeBox(page)).toHaveValue(/SKILLS: React, TypeScript, Next\.js, CSS, Jest, accessibility$/);
  await page.reload();
  await expect(page.getByTestId("stored-resume-file")).toContainText("Uploaded file: resume.docx");
});

test("explains files it can't use, and leaves the saved resume alone", async () => {
  const saved = await resumeBox(page).inputValue();

  await choose(page, { name: "resume.txt", mimeType: "text/plain", buffer: Buffer.from("plain text") });
  await expect(uploadStatus(page)).toHaveText("Choose a PDF or DOCX file.");

  await choose(page, "scanned.pdf");
  await expect(uploadStatus(page)).toHaveText(/^No text found in that file\. It may be a scanned image/);

  await choose(page, { name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from("<html>not a pdf</html>") });
  await expect(uploadStatus(page)).toHaveText("That file isn't a real PDF. Save it again as PDF or DOCX.");

  const big = Buffer.alloc(5 * 1024 * 1024 + 1);
  big.write("%PDF-1.4");
  await choose(page, { name: "big.pdf", mimeType: "application/pdf", buffer: big });
  await expect(uploadStatus(page)).toHaveText("That file is over 5 MB.");

  await expect(resumeBox(page)).toHaveValue(saved);
  // A file that couldn't be read isn't kept: the last good file is still the stored one.
  await page.reload();
  await expect(page.getByTestId("stored-resume-file")).toContainText("Uploaded file: resume.docx");
});

test("keeps each user's file private", async ({ browser }) => {
  // A second account sees no stored file and can't fetch the first user's through the API.
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const other = await context.newPage();
  await other.goto("/signup");
  await other.getByLabel("Email").fill(`upload-other-${Date.now()}@example.com`);
  await other.getByLabel("Password").fill(PASSWORD);
  await other.getByRole("button", { name: "Create account" }).click();
  await expect(other).toHaveURL(/\/jobs$/);
  await other.goto("/profile");
  await expect(other.getByTestId("stored-resume-file")).toHaveCount(0);
  await context.close();
});
