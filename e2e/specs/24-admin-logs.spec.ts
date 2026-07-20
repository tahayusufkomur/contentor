// e2e/specs/24-admin-logs.spec.ts
// Superadmin log viewer: ingest → panel rows, dynamic facet narrowing, and
// the pageview pipeline end-to-end (browser → beacon → Vector-less direct
// ingest is NOT used here — the beacon line rides the real Vector pipeline,
// so assertions poll with generous timeouts).
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { MAIN, superadminContext, TENANT } from "../helpers/auth";
import { REPO_ROOT } from "../helpers/compose";

function ingestToken(): string {
  try {
    const env = fs.readFileSync(path.join(REPO_ROOT, ".env"), "utf8");
    const m = env.match(/^LOGS_INGEST_TOKEN=(.*)$/m);
    if (m && m[1].trim()) return m[1].trim();
  } catch {
    /* fall through */
  }
  return "dev-logs-token";
}

const STAMP = `e2e-logbook-${Date.now()}`;

test("ingest → panel rows with dynamic facets", async ({ browser, request }) => {
  const now = new Date().toISOString();
  const events = [
    {
      timestamp: now,
      container_name: "contentor-django-1",
      stream: "stdout",
      message: `2026-01-01T00:00:00+0000 ERROR   apps.e2e [tenant=demo-yoga] [user=e2e@test.io] ${STAMP} exploded`,
    },
    {
      timestamp: now,
      container_name: "contentor-caddy-dev",
      stream: "stdout",
      message: JSON.stringify({ level: "warn", msg: `${STAMP} upstream slow` }),
    },
  ];
  // The stored ts comes from the envelope `timestamp` (= now), so the rows
  // land inside the panel's default 24h range; the in-line timestamps above
  // are cosmetic.

  const resp = await request.post("http://localhost/api/v1/platform/logs/ingest/", {
    headers: { "X-Logs-Token": ingestToken(), "Content-Type": "application/json" },
    data: events,
  });
  expect(resp.ok()).toBeTruthy();

  const admin = await superadminContext(browser);
  const page = await admin.newPage();
  await page.goto(`${MAIN}/admin/logs`);

  // Search for our stamp — both rows visible.
  await page.getByPlaceholder("Search messages…").fill(STAMP);
  await expect(page.getByText(`${STAMP} exploded`)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(`${STAMP} upstream slow`)).toBeVisible();

  // Dynamic facets: picking ERROR removes caddy (whose only stamped row is a
  // WARNING) from the container chips.
  await page.getByRole("button", { name: /^ERROR \d+$/ }).click();
  await expect(page.getByText(`${STAMP} exploded`)).toBeVisible();
  await expect(page.getByText(`${STAMP} upstream slow`)).not.toBeVisible();
  await expect(page.getByRole("button", { name: /^caddy \d+$/ })).toHaveCount(0, { timeout: 10_000 });

  await admin.close();
});

test("browsing a tenant page produces a pageview with a session", async ({ browser }) => {
  const admin = await superadminContext(browser);
  const adminPage = await admin.newPage();
  // NOTE (brief-vs-reality fix): the activity `tenant` column stores
  // `connection.tenant.schema_name` (apps/logbook/views/track.py), not the
  // subdomain slug — for the demo-yoga.localhost domain that schema is
  // `demo_yoga` (underscore; verified via apps.core.models.Domain in the dev
  // DB). Querying `tenant=demo-yoga` (hyphen) permanently returns zero rows.
  const ACTIVITY_URL = `${MAIN}/api/v1/platform/activity/?kind=pageview&tenant=demo_yoga`;
  const stitched = (body: { results: { session_id: string }[] }) =>
    body.results.filter((r) => r.session_id).length;

  // Baseline BEFORE the visit: the dev DB is never reset, so a bare `> 0`
  // would be satisfied by stale rows from earlier runs even with a dead
  // beacon/Vector/ingest pipeline. Only a STRICT increase over the baseline
  // proves this run's beacon made it through.
  const baselineRes = await adminPage.request.get(ACTIVITY_URL);
  expect(baselineRes.ok()).toBeTruthy();
  const baseline = stitched(await baselineRes.json());

  const visitor = await browser.newContext();
  const page = await visitor.newPage();
  await page.goto(`${TENANT}/`);
  await page.waitForTimeout(1500); // beacon fires post-hydration
  await visitor.close();

  // The beacon line travels stdout → Vector (2s flush) → ingest; poll the API.
  await expect
    .poll(
      async () => {
        const res = await adminPage.request.get(ACTIVITY_URL);
        if (!res.ok()) return baseline; // transient failure — keep polling
        return stitched(await res.json());
      },
      { timeout: 30_000, intervals: [2_000] },
    )
    .toBeGreaterThan(baseline);
  await admin.close();
});
