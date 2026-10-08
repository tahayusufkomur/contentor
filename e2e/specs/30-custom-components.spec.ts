// e2e/specs/30-custom-components.spec.ts
//
// A coach describes a section; the (stubbed) AI returns a cx block; it lands
// on the canvas, survives the real autosave validation, and a visitor sees it
// on the public page. The compose call is intercepted in the browser so the
// run never calls a model. demo-yoga is unstyled, so the spec sets a style
// first (config PATCH only — pages are not restyled) and restores it.

import { test, expect } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";

const HEADING = `E2E custom section ${Date.now()}`;

const SPEC = {
  csl: 1,
  name: "E2E points",
  summary: "Two points",
  fields: {
    heading: { type: "text", label: "Heading", required: true, max: 80 },
    points: {
      type: "items",
      label: "Points",
      fields: {
        title: { type: "text", label: "Title", required: true, max: 60 },
        text: { type: "text", label: "Text", max: 160 },
      },
      max: 6,
      min: 0,
      itemLabel: "Point",
    },
  },
  dynamic: null,
  tree: {
    t: "Section",
    tone: "base",
    width: "wrap",
    children: [
      { t: "Opener" },
      {
        t: "Grid",
        each: "points",
        cols: 3,
        gap: "md",
        card: "soft",
        numbering: "pad2",
        item: [
          { t: "Heading", bind: "$.title", level: 3, size: "md" },
          { t: "Text", bind: "$.text", size: "md", muted: true, measure: "normal" },
        ],
      },
    ],
  },
};

const BLOCK = {
  id: "blk_e2ecx001",
  type: "cx",
  enabled: true,
  cx: { ref: null, spec: SPEC },
  heading: HEADING,
  points: [
    { title: "First point", text: "One." },
    { title: "Second point", text: "Two." },
  ],
};

test("coach creates a custom section with AI; the public page renders it", async ({ browser }) => {
  const coach = await coachContext(browser);
  const edit = await coach.newPage();
  const api = edit.request;
  const before = await (await api.get(`${TENANT}/api/admin/config`)).json();
  expect((await api.patch(`${TENANT}/api/admin/config`, { data: { style: "maison" } })).ok()).toBeTruthy();

  try {
    await edit.route("**/api/v1/admin/cx/components/", (route) => route.fulfill({ json: { components: [] } }));
    await edit.route("**/api/v1/admin/cx/compose/", (route) =>
      route.fulfill({ json: { block: BLOCK, source: "ai", remaining: 4, missing: [] } }),
    );

    await edit.goto(`${TENANT}/`);
    await edit.getByTitle("Edit your site").click();
    await edit.getByRole("button", { name: /^Pages$/ }).first().click();
    await edit.getByRole("button", { name: "Add block" }).click();
    await edit.getByLabel("Describe a section").fill("Two points about my method");

    const autosave = edit.waitForResponse(
      (r) => r.url().includes("/api/admin/config") && r.request().method() === "PATCH" && r.status() === 200,
      { timeout: 20_000 },
    );
    await edit.getByRole("button", { name: "Create with AI" }).click();
    await expect(edit.getByText(HEADING).first()).toBeVisible();
    await autosave;

    const after = await (await api.get(`${TENANT}/api/admin/config`)).json();
    const stored = after.pages.home.blocks.find((b: { type: string }) => b.type === "cx");
    expect(stored?.heading).toBe(HEADING);
    expect(stored?.cx?.spec?.tree?.t).toBe("Section");

    const visitor = await browser.newPage();
    await visitor.goto(`${TENANT}/`);
    await expect(visitor.getByText(HEADING)).toBeVisible();
    await expect(visitor.getByText("Second point")).toBeVisible();
    await visitor.close();
  } finally {
    await api.patch(`${TENANT}/api/admin/config`, { data: { style: before.style ?? "", pages: before.pages } });
    await coach.close();
  }
});
