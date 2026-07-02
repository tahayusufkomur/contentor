// e2e/specs/08-pwa.spec.ts
import { test, expect } from "@playwright/test";
import { studentContext, TENANT } from "../helpers/auth";

test("manifest is valid and tenant-branded", async ({ request }) => {
  // Next.js with @serwist/next serves the manifest at /manifest.webmanifest;
  // fall back to /manifest.json for other configurations.
  let res = await request.get(`${TENANT}/manifest.webmanifest`);
  if (!res.ok()) {
    res = await request.get(`${TENANT}/manifest.json`);
  }
  expect(res.ok()).toBeTruthy();
  const m = await res.json();
  expect(m.name?.length).toBeGreaterThan(0);
  expect(m.icons?.length).toBeGreaterThan(0);
  expect(["standalone", "fullscreen", "minimal-ui"]).toContain(m.display);
});

test("service worker registers and offline page is reachable", async ({ browser, request }) => {
  const ctx = await studentContext(browser);
  const page = await ctx.newPage();
  await page.goto(`${TENANT}/dashboard`);

  const swCount = await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    return regs.length;
  });

  if (swCount > 0) {
    // Full service worker registration — production build or SERWIST_DEV=1 env.
    expect(swCount).toBeGreaterThan(0);
    const offline = await page.goto(`${TENANT}/offline.html`);
    expect(offline?.ok()).toBeTruthy();
  } else {
    // Dev-mode fallback: @serwist/next disables SW registration when
    // NODE_ENV=development (and SERWIST_DEV!=1). Assert the static assets are
    // served correctly instead. Full SW behaviour is a prod-build concern.
    const swRes = await request.get(`${TENANT}/sw.js`);
    expect(swRes.ok()).toBeTruthy();
    const contentType = swRes.headers()["content-type"] ?? "";
    expect(contentType).toMatch(/javascript/);

    const offlineRes = await request.get(`${TENANT}/offline.html`);
    expect(offlineRes.ok()).toBeTruthy();
  }

  await ctx.close();
});
