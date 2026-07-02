// e2e/specs/04-live-class.spec.ts
//
// Tests the live class lifecycle end-to-end using the offline fake stream.
//
// PRECONDITION: LIVE_FAKE_ENABLED=true must be set in .env and django must be
// restarted.  If the fake is off the spec probe-detects it (token endpoint
// returns api_key != "fake-local") and skips with a clear message so the suite
// stays green in both modes.
//
// What is tested (fake-on path):
//   1. Coach POSTs /api/v1/live/ → 201  (create)
//   2. Coach POSTs /api/v1/live/<pk>/start/ → 200  (transitions to "live")
//   3. Student GETs /api/v1/live/<pk>/token/ → 200
//      · body.api_key === "fake-local"          (sentinel from stream_service)
//      · body.token   matches /^fake-token-u\d+/ (from fake_stream_service)
//   4. Student navigates to /live/<pk>  → page renders without 500
//      (video canvas cannot connect — by design; we assert UI, not canvas)

import { test, expect } from "@playwright/test";
import { coachContext, studentContext, TENANT } from "../helpers/auth";

test(
  "coach schedules + starts a class offline; student gets a fake token and join UI",
  async ({ browser }) => {
    // ── Step 1: create the live class ──────────────────────────────────────
    const coach = await coachContext(browser);
    const capi = coach.request;

    const create = await capi.post(`${TENANT}/api/v1/live/`, {
      data: {
        title: `E2E Live ${Date.now()}`,
        scheduled_at: new Date(Date.now() + 3_600_000).toISOString(),
      },
    });
    expect(create.status(), `Create failed: ${await create.text()}`).toBe(201);
    const cls = await create.json();

    // ── Step 2: probe — if fake is off, skip gracefully ───────────────────
    // We do a quick token probe BEFORE starting (returns 400 "not live") but
    // we can still detect the fake by starting the class first, then checking.
    // Simpler: start → token → check api_key.

    // ── Step 3: start the class ───────────────────────────────────────────
    const start = await capi.post(`${TENANT}/api/v1/live/${cls.id}/start/`);
    expect(start.ok(), `Start failed: ${await start.text()}`).toBeTruthy();

    // ── Step 4: student requests a stream token ───────────────────────────
    const student = await studentContext(browser);
    const token = await student.request.post(
      `${TENANT}/api/v1/live/${cls.id}/token/`,
    );

    const body = await token.json();

    // Probe: if LIVE_FAKE_ENABLED is off the real GetStream api_key is returned.
    if (body.api_key !== "fake-local") {
      test.skip(
        true,
        "LIVE_FAKE_ENABLED is off — set it in .env and restart django for offline live-class testing",
      );
      await coach.close();
      await student.close();
      return;
    }

    expect(token.ok(), `Token failed: ${JSON.stringify(body)}`).toBeTruthy();
    expect(body.api_key, `Expected fake-local, got: ${JSON.stringify(body)}`).toBe("fake-local");
    expect(
      body.token,
      `Expected fake-token-u<id>, got: ${JSON.stringify(body)}`,
    ).toMatch(/^fake-token-u\d+$/);

    // ── Step 5: student join page renders without 500 ─────────────────────
    // The /live/[id] page is a client component; it goes through a loading
    // spinner then tries to connect to the Stream video service (which will
    // fail with a fake api_key — by design). We assert the page rendered
    // (no HTTP 500) by checking that a visible element is present: either the
    // loading spinner text or the "Failed to connect" error message from the
    // client component. Both prove the page painted and no server 500 occurred.
    const page = await student.newPage();
    const response = await page.goto(`${TENANT}/live/${cls.id}`);
    expect(
      response?.status(),
      `Expected 200 on /live/${cls.id}, got ${response?.status()}`,
    ).toBe(200);

    // Wait for the client-side component to mount and render.
    // Either the initial "Connecting to live class..." loading state or the
    // subsequent "Joining call..." spinner will be visible, depending on timing.
    await expect(
      page.locator("body"),
      "Body should be visible — page should not be blank",
    ).toBeVisible();

    // At minimum expect either a spinner text or the join-attempt text.
    // The LiveRoomClient fetches the class detail → renders LiveClassRoom →
    // LiveClassRoom fetches the token via POST → renders StreamVideoProvider
    // → CallJoiner tries to join (will fail offline). We only need to confirm
    // the page rendered without a blank screen or 500 error page.
    const spinner = page.locator("text=Connecting to live class");
    const joiningCall = page.locator("text=Joining call");
    const failedConnect = page.locator("text=Failed to connect");
    const classEnded = page.locator("text=Class Ended");

    await expect(
      spinner.or(joiningCall).or(failedConnect).or(classEnded),
      "Expected one of: 'Connecting to live class', 'Joining call', 'Failed to connect', or 'Class Ended' — page did not render the live room UI",
    ).toBeVisible({ timeout: 15_000 });

    await coach.close();
    await student.close();
  },
);
