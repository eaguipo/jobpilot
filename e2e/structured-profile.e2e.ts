import { expect, test, type Page } from "@playwright/test";
import { evidence } from "./evidence";

/**
 * Story 12: Parse resume into a structured profile.
 * Done-when: contact, summary, experience (title/company/dates/bullets), education and
 * skills are extracted into JSON and shown on the Profile page.
 *
 * Own fresh account; the model is the offline fake (JOBPILOT_FAKE_LLM=1), and the real
 * resume check in src/lib/resume-parse.ts runs on its answer.
 */
test.describe.configure({ mode: "serial" });

const PASSWORD = "a-good-password-1";
const email = `structured-${Date.now()}@example.com`;
const RESUME = [
  "Jordan Reyes - Frontend Engineer",
  "jordan.reyes@example.com",
  "EXPERIENCE",
  "Tailspin Toys (2021-present) - Senior Frontend Engineer",
  "- Built React and TypeScript storefronts with Next.js for 300k shoppers.",
  "- Cut checkout page load time by 40% with server rendering.",
  "Fabrikam (2018-2021) - Frontend Engineer",
  "- Ran accessibility reviews and the shared component library.",
  "EDUCATION",
  "B.S. Computer Science, University of Texas at Austin, 2014-2018",
  "SKILLS: React, TypeScript, Next.js, CSS",
].join("\n");

let page: Page;
const parseStatus = () => page.getByTestId("parse-status");
const section = (name: string) => page.getByRole("region", { name });
const buildButton = () => page.getByRole("button", { name: /build structured profile|rebuild from saved resume/i });

async function saveResume(text: string) {
  await page.getByLabel("Master resume").fill(text);
  await page.getByRole("button", { name: "Save resume" }).click();
  await expect(page.getByRole("status")).toContainText("Saved");
}

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  page = await context.newPage();
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/jobs$/);
  await page.goto("/profile");
});
test.afterAll(async () => {
  await page.context().close();
});

test("needs a saved resume first", async () => {
  await expect(page.getByRole("heading", { name: "Structured profile" })).toBeVisible();
  await expect(buildButton()).toBeDisabled();
  await expect(parseStatus()).toHaveText("Save your resume first.");
});

test("splits the saved resume into sections (done-when)", async () => {
  await saveResume(RESUME);
  await buildButton().click();
  await expect(parseStatus()).toHaveText("Done. Check each section below.");

  await expect(section("Contact")).toContainText("Jordan Reyes");
  await expect(section("Contact")).toContainText("jordan.reyes@example.com");
  await expect(section("Summary")).toContainText("Not found on your resume.");
  const roles = section("Experience").getByRole("listitem").filter({ has: page.locator("p.font-medium") });
  await expect(roles).toHaveCount(2);
  await expect(roles.first()).toContainText("Senior Frontend Engineer · Tailspin Toys");
  await expect(roles.first()).toContainText("2021 – present");
  await expect(roles.first().getByRole("listitem")).toHaveText([
    "Built React and TypeScript storefronts with Next.js for 300k shoppers.",
    "Cut checkout page load time by 40% with server rendering.",
  ]);
  await expect(section("Education")).toContainText("University of Texas at Austin · B.S. Computer Science · 2014 – 2018");
  await expect(section("Skills").getByRole("listitem")).toHaveText(["React", "TypeScript", "Next.js", "CSS"]);
  await evidence(page.getByRole("region", { name: "Structured profile" }), "12-structured-profile");

  // Stored, not just shown: it's still there after a reload.
  await page.reload();
  await expect(section("Skills").getByRole("listitem")).toHaveCount(4);
  await expect(buildButton()).toHaveText("Rebuild from saved resume");
});

test("says when the resume changed since, and rebuilding updates it", async () => {
  await saveResume(RESUME.replace("SKILLS: React, TypeScript, Next.js, CSS", "SKILLS: React, TypeScript, Next.js, CSS, GraphQL"));
  await page.reload();
  await expect(parseStatus()).toHaveText("Your resume changed after this was built. Rebuild to update it.");
  await expect(section("Skills").getByRole("listitem")).toHaveCount(4);

  await buildButton().click();
  await expect(parseStatus()).toHaveText("Done. Check each section below.");
  await expect(section("Skills").getByRole("listitem")).toHaveText(["React", "TypeScript", "Next.js", "CSS", "GraphQL"]);
});

test("leaves out anything the AI returns that isn't on the resume", async () => {
  await saveResume(`${RESUME}\nFAKE_LLM_INVENT`);
  await buildButton().click();
  await expect(parseStatus()).toHaveText("Done. 1 item the AI returned isn't in your resume, so it was left out.");
  await expect(section("Experience")).not.toContainText("Hooli");
  await evidence(page.getByRole("region", { name: "Structured profile" }), "12-invented-job-left-out");
});

test("explains a failed run and keeps the last structure", async () => {
  await saveResume(`${RESUME}\nFAKE_LLM_UNAVAILABLE`);
  await buildButton().click();
  await expect(parseStatus()).toHaveText("Gemini is busy right now. Try again in a minute.");
  await expect(section("Experience")).toContainText("Tailspin Toys");
});
