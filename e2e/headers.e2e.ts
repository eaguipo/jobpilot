import { expect, test } from "@playwright/test";

/** Security headers (next.config.ts) on pages, redirects and server-action posts. */
const EXPECTED: Record<string, RegExp> = {
  "content-security-policy": /frame-ancestors 'none'/,
  "x-frame-options": /^DENY$/,
  "x-content-type-options": /^nosniff$/,
  "referrer-policy": /^strict-origin-when-cross-origin$/,
  "permissions-policy": /camera=\(\)/,
};

function expectSecure(headers: Record<string, string>) {
  for (const [name, value] of Object.entries(EXPECTED)) expect(headers[name], name).toMatch(value);
  expect(headers["x-powered-by"], "x-powered-by").toBeUndefined();
}

test("signed-in pages send the security headers", async ({ request }) => {
  for (const path of ["/", "/jobs", "/profile"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(200);
    expectSecure(res.headers());
  }
});

test("public pages and the sign-in redirect send them too", async ({ playwright, baseURL }) => {
  const anon = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  for (const path of ["/login", "/signup"]) {
    const res = await anon.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(200);
    expectSecure(res.headers());
  }
  const redirect = await anon.get("/jobs", { maxRedirects: 0 });
  expect(redirect.status()).toBe(307);
  expectSecure(redirect.headers());
  await anon.dispose();
});

test("the app can't be shown inside a frame on another site", async ({ page }) => {
  // A page from another origin (about:blank) tries to frame the app; the browser must refuse.
  let framed = "";
  page.on("framenavigated", (f) => f !== page.mainFrame() && (framed = f.url()));
  await page.setContent(`<iframe id="f" src="${test.info().project.use.baseURL}/login"></iframe>`);
  await page.waitForTimeout(1500);
  const frame = page.frames().find((f) => f !== page.mainFrame());
  const loaded = frame ? await frame.locator("form").count().catch(() => 0) : 0;
  expect(loaded, `frame should be blocked (navigated to ${framed || "nothing"})`).toBe(0);
});
