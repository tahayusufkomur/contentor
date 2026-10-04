// e2e/specs/04-live-class.spec.ts
//
// Contentor's side of live classes: lifecycle + access, and embedding the
// LiveCraft room. Video itself (moderation, screen share, chat) is LiveCraft's
// and tested in ../livecraft/e2e. Works against the dev fake (LIVECRAFT_URL
// unset → inert about:blank join links) and against a real LiveCraft.

import { test, expect } from "@playwright/test";
import { coachContext, studentContext, TENANT } from "../helpers/auth";

test("coach starts a class, student gets an embedded LiveCraft room, coach ends it", async ({
  browser,
}) => {
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

  const start = await capi.post(`${TENANT}/api/v1/live/${cls.id}/start/`);
  expect(start.ok(), `Start failed: ${await start.text()}`).toBeTruthy();

  const student = await studentContext(browser);
  const tokenRes = await student.request.post(
    `${TENANT}/api/v1/live/${cls.id}/token/`,
  );
  expect(tokenRes.ok(), await tokenRes.text()).toBeTruthy();
  const body = await tokenRes.json();
  expect(body.role).toBe("viewer");
  expect(body.join_url).toContain(cls.room_name);

  // The room page embeds that join link.
  const page = await student.newPage();
  const response = await page.goto(`${TENANT}/live/${cls.id}`);
  expect(response?.status()).toBe(200);
  await expect(page.locator(`iframe[src*="${cls.room_name}"]`)).toBeAttached({
    timeout: 15_000,
  });

  const stop = await capi.post(`${TENANT}/api/v1/live/${cls.id}/stop/`);
  expect(stop.ok(), `Stop failed: ${await stop.text()}`).toBeTruthy();
  // Ended classes stop issuing join links.
  const late = await student.request.post(
    `${TENANT}/api/v1/live/${cls.id}/token/`,
  );
  expect(late.status()).toBe(400);

  await coach.close();
  await student.close();
});
