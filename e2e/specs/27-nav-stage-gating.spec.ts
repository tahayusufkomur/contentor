// e2e/specs/27-nav-stage-gating.spec.ts
//
// Proves the admin shell's seven places end to end (see admin-nav.ts and
// admin-nav-gate.ts):
//   - The sidebar has seven rows; a section's pages are tabs under the top
//     bar, and the section stays lit on pages that sit under no nav item.
//   - Pages of modules the coach did not choose hide behind "+ N more" in the
//     tab strip, which reveals them on click.
//   - Nothing in Reach out is locked behind publishing (the old Marketing
//     lock is gone).
//
// All tests drive `demo-yoga` (published, every module on). The module-off
// test narrows demo-yoga's enabled_modules for its own duration and restores
// them in `finally` — specs run serially (workers: 1). The config endpoint
// caches per tenant for 5 minutes, so the helper clears that key too.
//
// Selector note: the sidebar is the only <aside> without an aria-label (the
// team panel is an <aside aria-label="Your team">), and a section's tab
// strip is the <nav> named after the section.

import { test, expect } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";
import { manage } from "../helpers/compose";

const sidebar = (page: import("@playwright/test").Page) =>
  page.locator("aside:not([aria-label]) nav");

const MODULES = (): string =>
  manage([
    "shell",
    "-c",
    "from django_tenants.utils import schema_context\n" +
      "from apps.tenant_config.models import TenantConfig\n" +
      "with schema_context('demo_yoga'):\n" +
      "    print(','.join(TenantConfig.objects.first().enabled_modules))",
  ])
    .split("\n")
    .pop()!;

function setModules(modules: string[]) {
  manage([
    "shell",
    "-c",
    "from django_tenants.utils import schema_context\n" +
      "from apps.tenant_config.models import TenantConfig\n" +
      "from django.core.cache import cache\n" +
      "with schema_context('demo_yoga'):\n" +
      `    TenantConfig.objects.update(enabled_modules=${JSON.stringify(modules)})\n` +
      // The config endpoint caches per tenant for 5 minutes; .update() skips
      // the save signal that would clear it.
      "cache.delete('tenant:demo_yoga:config')",
  ]);
}

test("seven sidebar rows; Teach is lit on a course page and its pages are tabs", async ({
  browser,
}) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  // The plain form: focus mode, when switched on, tucks the side menu away.
  await page.goto(`${TENANT}/admin/courses/new?form=1`);

  await expect(sidebar(page).getByRole("link")).toHaveCount(7);
  await expect(
    sidebar(page).getByRole("link", { name: "Reach out" }),
  ).toBeVisible();
  await expect(
    sidebar(page).getByRole("link", { name: "Create" }),
  ).toHaveAttribute("aria-current", "page");

  // demo-yoga has every module on: all three Teach pages, nothing hidden
  // (the calendar is a view of Classes & events, not a page of its own).
  const teach = page.getByRole("navigation", { name: "Create" });
  await expect(teach.getByRole("link")).toHaveCount(3);
  await expect(teach.getByRole("button", { name: /\+ \d+ more/i })).toHaveCount(
    0,
  );

  await page.close();
});

test("a coach with no optional modules sees Courses and + more under Teach", async ({
  browser,
}) => {
  const original = MODULES().split(",").filter(Boolean);
  setModules(["courses"]);
  try {
    const coach = await coachContext(browser);
    const page = await coach.newPage();
    await page.goto(`${TENANT}/admin/courses`);

    const teach = page.getByRole("navigation", { name: "Create" });
    await expect(teach.getByRole("link", { name: "Courses" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      teach.getByRole("link", { name: /classes & events/i }),
    ).toHaveCount(0);

    await teach.getByRole("button", { name: /\+ \d+ more/i }).click();
    await expect(
      teach.getByRole("link", { name: /classes & events/i }),
    ).toBeVisible();

    // Search and Help can still send her to a page of a module that is off:
    // that page keeps its row and its tab lit rather than vanishing.
    await page.goto(`${TENANT}/admin/live`);
    const there = page.getByRole("navigation", { name: "Create" });
    await expect(
      there.getByRole("link", { name: /classes & events/i }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      sidebar(page).getByRole("link", { name: "Create" }),
    ).toHaveAttribute("aria-current", "page");

    await page.close();
  } finally {
    setModules(original);
  }
});

test("Reach out is open before the site is published", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();

  // Present demo-yoga as unpublished: the publish item is neither done nor ticked.
  await page.route("**/api/v1/admin/setup-status/", async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    for (const item of body.items ?? []) {
      if (item.key === "publish") {
        item.done = false;
        item.source = null;
      }
    }
    await route.fulfill({ response: res, json: body });
  });

  await page.goto(`${TENANT}/admin/blog`);

  const reach = page.getByRole("navigation", { name: "Reach out" });
  await expect(reach.getByRole("link", { name: /^blog/i })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    page.getByText(/publish your site to open marketing/i),
  ).toHaveCount(0);

  // A setup-status fetch still in flight must not outlive the page.
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.close();
});
