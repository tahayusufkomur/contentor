// e2e/specs/02-courses.spec.ts
//
// Test 1 — coach creates a free published course via the /api/v1/courses/ endpoint
//           (API approach), then asserts the admin UI lists it and the student can
//           open the course-detail page.
//
//           Why API rather than UI for creation:
//           The "Publish immediately" Radix-style switch on the new-course form
//           does not respond to any Playwright click strategy (locator.click(),
//           getByText.click(), evaluate btn.click(), dispatchEvent) reliably in
//           headless mode. Without the switch ON the course stays unpublished and
//           the student-facing SSR detail page returns 404. Creating via the API
//           (POST /api/v1/courses/ with is_published:true) is the explicit
//           fallback permitted in the task brief.
//
// Test 2 — student opens the seeded yoga-for-beginners learn page.
//
// Design notes:
//   • The /courses (catalog) page uses block-based SSR; the demo-yoga tenant
//     TenantConfig ships no pages.courses.blocks → no course cards render there.
//     We assert the student can reach /courses/<slug> (the SSR detail page) which
//     always renders the course title in an <h1> for any published course.
//   • The admin/courses list page is a "use client" MediaBrowser component that
//     fetches data via clientFetch (relative fetch, same-origin credentials). In
//     headless Playwright the Next.js JS chunks (main-app.js, app-pages-internals.js)
//     return 404 from the dev server because the container holds a stale production
//     build alongside the running dev server — React never hydrates, so clientFetch
//     is never called and course rows never appear. The assertion below will surface
//     this bug if it is still present: do NOT paper over a failure here.
//   • The learn page (/learn/[slug]) is also "use client"; the same hydration
//     constraint applies. The lesson <h1> and sidebar only render after
//     clientFetch completes. A failure on those assertions surfaces the same
//     underlying dev-env bug.

import { test, expect } from "@playwright/test";
import { coachContext, studentContext, TENANT } from "../helpers/auth";

const TITLE = `E2E Course ${Date.now()}`;

test("coach creates a free published course; admin list shows it; student opens its detail page", async ({
  browser,
}) => {
  // ── Coach: create the course via API (is_published:true) ──────────────────
  const coach = await coachContext(browser);

  // Use the coach BrowserContext's request object — it carries the auth cookie.
  const res = await coach.request.post(`${TENANT}/api/v1/courses/`, {
    data: {
      title: TITLE,
      description: "",
      pricing_type: "free",
      price: 0,
      is_published: true,
    },
    headers: { "Content-Type": "application/json" },
  });
  expect(res.status(), `Course creation failed: ${await res.text()}`).toBe(201);
  const created = await res.json();
  const courseSlug: string = created.slug;
  expect(courseSlug, "API response missing slug").toBeTruthy();

  // ── Coach: verify via GET that the course exists in the API ──────────────
  // (The admin edit page uses useEffect + clientFetch which hangs in headless
  // mode on this tenant — likely a CSP or fetch-to-relative-path issue. The
  // API response already proves creation; a second GET confirms the slug.)
  const verifyRes = await coach.request.get(`${TENANT}/api/v1/courses/${courseSlug}/`);
  expect(verifyRes.status(), "Course GET after creation failed").toBe(200);
  const verifyBody = await verifyRes.json();
  expect(verifyBody.title).toBe(TITLE);
  expect(verifyBody.is_published).toBe(true);

  // ── Coach: assert the admin courses list UI shows the new course ──────────
  // Navigate to the coach admin list page and wait for the course title to
  // appear. If this times out, the Next.js JS hydration bundles are not loading
  // (ERR_ABORTED on main-app.js / app-pages-internals.js) — a real dev-env bug
  // that must be surfaced, NOT papered over.
  const cpage = await coach.newPage();
  await cpage.goto(`${TENANT}/admin/courses`);
  await expect(cpage.getByText(TITLE)).toBeVisible({ timeout: 15_000 });

  await coach.close();

  // ── Student: open the course detail page directly ─────────────────────────
  // The SSR detail page renders the title in an <h1> for published courses.
  const student = await studentContext(browser);
  const spage = await student.newPage();
  await spage.goto(`${TENANT}/courses/${courseSlug}`);
  await expect(spage.getByRole("heading", { name: TITLE, level: 1 })).toBeVisible({
    timeout: 15_000,
  });

  await student.close();
});

test("student can open the seeded course learn page with real lesson content", async ({ browser }) => {
  const student = await studentContext(browser);
  const page = await student.newPage();

  // yoga-for-beginners is a free seeded course with modules + lessons.
  // Free courses return access_info.has_access=true for all authenticated users
  // so the learn page does NOT redirect to /courses/<slug>.
  await page.goto(`${TENANT}/learn/yoga-for-beginners`);

  // Assert we stayed on the learn page (not redirected)
  await expect(page).toHaveURL(/\/learn\/yoga-for-beginners/, { timeout: 10_000 });

  // Assert the lesson title renders in an <h1>. The learn page auto-selects the
  // first lesson ("Welcome to Yoga") from the first module ("Getting Started").
  // This heading is rendered by the "use client" LearnPage component after
  // clientFetch resolves — it proves real course content loaded, not just the shell.
  // NOTE: if this times out, the JS hydration bundles are failing to load (same
  // dev-env bug as noted above). Surface the failure; do NOT paper over it.
  await expect(page.getByRole("heading", { name: "Welcome to Yoga", level: 1 })).toBeVisible({
    timeout: 15_000,
  });

  // The lesson sidebar renders the course title and module structure. "Getting
  // Started" is the first module title in yoga-for-beginners — its presence
  // proves the sidebar (which also depends on clientFetch) rendered.
  await expect(page.getByText("Getting Started")).toBeVisible({ timeout: 15_000 });

  await student.close();
});

test("nested course create API builds the full curriculum in one atomic POST", async ({
  browser,
}) => {
  const coach = await coachContext(browser);
  const title = `E2E Nested ${Date.now()}`;

  const res = await coach.request.post(`${TENANT}/api/v1/courses/`, {
    data: {
      title,
      pricing_type: "free",
      price: 0,
      modules: [
        {
          title: "Module A",
          lessons: [{ title: "Lesson 1", is_free_preview: true }, { title: "Lesson 2" }],
        },
        { title: "Module B", lessons: [] },
      ],
    },
    headers: { "Content-Type": "application/json" },
  });
  expect(res.status(), `Nested create failed: ${await res.text()}`).toBe(201);
  const body = await res.json();
  expect(body.modules.map((m: { title: string }) => m.title)).toEqual(["Module A", "Module B"]);
  expect(body.modules[0].lessons.map((l: { order: number }) => l.order)).toEqual([1, 2]);

  await coach.close();
});

test("coach composes thumbnail + module + lesson and creates the course in ONE submit", async ({
  browser,
}) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  await page.goto(`${TENANT}/admin/courses/new`);

  const title = `E2E OneStep ${Date.now()}`;
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Description").fill("Created in a single step");

  // ── Thumbnail: upload in-place through the PhotoPicker modal ─────────────
  await page.getByRole("button", { name: "Choose thumbnail" }).click();
  await page.locator('input[type="file"]').setInputFiles("fixtures/pixel.png");
  // The preview must be a real URL (signed), never a raw s3 key resolved
  // relative to the page (the old 404 bug).
  const preview = page.locator('img[alt="Selected"]');
  await expect(preview).toBeVisible({ timeout: 20_000 });
  expect(await preview.getAttribute("src")).toMatch(/^https?:\/\//);

  // ── Curriculum: one module, one lesson, all local until submit ───────────
  await page.getByPlaceholder("New module title").fill("Getting Started");
  await page.getByRole("button", { name: "Add Module" }).click();
  await expect(page.getByText("Module 1: Getting Started")).toBeVisible();

  await page.getByRole("button", { name: "Add Lesson" }).click();
  await page.getByPlaceholder("Lesson title").fill("Welcome");
  // The open panel's save button is also named "Add Lesson"; the trigger
  // button was replaced by the panel, so the last match is the panel's.
  await page.getByRole("button", { name: "Add Lesson", exact: true }).last().click();
  await expect(page.getByRole("cell", { name: "Welcome" })).toBeVisible({ timeout: 10_000 });

  // ── ONE submit creates everything atomically ─────────────────────────────
  await page.getByRole("button", { name: "Create Course" }).click();
  await page.waitForURL(/\/admin\/courses\/(?!new$)[^/]+$/, { timeout: 20_000 });

  // The edit page proves the curriculum landed with the course.
  await expect(page.getByText("Module 1: Getting Started")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("cell", { name: "Welcome" })).toBeVisible({ timeout: 10_000 });

  await coach.close();
});
