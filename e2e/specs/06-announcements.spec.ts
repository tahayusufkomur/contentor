// e2e/specs/06-announcements.spec.ts
//
// Coach creates an announcement via the /admin/notifications compose box (no
// scheduled_at → sends immediately). Celery fan-out runs in the background;
// the student's announcement feed is polled via the REST API
// (GET /api/v1/notifications/feed/) until the title appears (up to 20 s).
// The bell in the student header is then clicked to confirm the UI renders it.

import { test, expect } from "@playwright/test";
import { coachContext, studentContext, TENANT } from "../helpers/auth";

const TITLE = `E2E announce ${Date.now()}`;

test("coach sends announcement; student sees it in feed and bell UI", async ({
  browser,
}) => {
  // ── 1. Coach composes and sends the announcement ───────────────────────────
  const coach = await coachContext(browser);
  const coachPage = await coach.newPage();
  await coachPage.goto(`${TENANT}/admin/notifications`);

  // The compose card renders a plain <input placeholder="Title"> — fill it.
  await coachPage
    .getByPlaceholder("Title")
    .fill(TITLE);

  // "Send now" button (disabled until title is non-empty)
  const sendBtn = coachPage.getByRole("button", { name: /send now/i });
  await expect(sendBtn).toBeEnabled();
  await sendBtn.click();

  // After send the button text reverts (state resets) and the history entry
  // should eventually appear in the History tab list.
  await expect(
    coachPage.getByText(TITLE),
    "announcement title must appear in history list after send",
  ).toBeVisible({ timeout: 10_000 });

  await coach.close();

  // ── 2. Poll the student feed API until the announcement fan-out lands ──────
  //    Celery processes the task asynchronously; allow up to 20 s.
  const student = await studentContext(browser);

  let found = false;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const res = await student.request.get(`${TENANT}/api/v1/notifications/feed/`);
    expect(
      res.status(),
      `feed API returned unexpected status ${res.status()}`,
    ).toBe(200);
    const body = (await res.json()) as { items: { title: string }[] };
    if (body.items.some((item) => item.title === TITLE)) {
      found = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  expect(
    found,
    `Announcement "${TITLE}" did not appear in student feed within 20 s — ` +
      "check that celery-worker is running and consuming from Redis",
  ).toBe(true);

  // ── 3. Student UI: visit /dashboard (has PublicHeader + AnnouncementBell) ──
  const sPage = await student.newPage();
  await sPage.goto(`${TENANT}/dashboard`);

  // Bell button is rendered by AnnouncementBell component (aria-label="Announcements")
  const bell = sPage.getByRole("button", { name: /announcements/i });
  await expect(bell, "announcement bell button must be visible in header").toBeVisible();
  await bell.click();

  // The dropdown renders each announcement as a button with the title text.
  await expect(
    sPage.getByText(TITLE),
    "announcement title must appear in the bell dropdown",
  ).toBeVisible({ timeout: 5_000 });

  await student.close();
});
