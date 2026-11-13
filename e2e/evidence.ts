import { test, type Locator, type Page } from "@playwright/test";
import path from "node:path";

/**
 * Screenshot evidence for a task's done-when check. Used only at key checkpoints, not in every test.
 * - Attached to the Playwright report (open with `npx playwright show-report`).
 * - Saved to $EVIDENCE_DIR (default test-results/evidence, git-ignored).
 *   `npm run test:e2e:evidence` saves to docs/evidence/ so the images can be committed.
 */
export async function evidence(target: Page | Locator, name: string) {
  const dir = process.env.EVIDENCE_DIR ?? "test-results/evidence";
  const file = path.join(dir, `${name}.png`);
  const isPage = "goto" in target;
  const body = await target.screenshot({ path: file, animations: "disabled", ...(isPage ? { fullPage: true } : {}) });
  await test.info().attach(name, { body, contentType: "image/png" });
}
