// e2e/specs/07-mailbox.spec.ts
//
// Coach mailbox smoke tests:
//
//   A) Inbox page loads — the two-pane layout renders (empty state or
//      conversation list), and the "New message" compose button is visible.
//
//   B) Settings page — MailboxSettingsSection renders within /admin/settings
//      (either the upsell card when no custom domain, or the address picker).
//
//   C) Compose → email sink — coach sends a new outbound message to
//      priya@demo.test via POST /api/v1/mailbox/compose/; the conversation
//      appears in the inbox list; and the email sink captures the sent mail.
//
//   D) Inbound webhook — SKIPPED: requires MAILBOX_INBOUND_SECRET env var and
//      a live CustomDomain record; demo-yoga has no custom domain so
//      verify_inbound_signature() is fail-closed (returns False when secret is
//      empty). The inbound path is covered by backend unit tests.

import { test, expect } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";
import { latestEmail } from "../helpers/email";

// A real seeded student in demo-yoga (from seed_all_demos).
const STUDENT_EMAIL = "priya@demo.test";
const SUBJECT = `E2E mailbox ${Date.now()}`;
const MESSAGE_TEXT = "Hello from the e2e mailbox test.";

// ── A. Inbox page loads ────────────────────────────────────────────────────
test("coach inbox page renders with compose button", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();

  await page.goto(`${TENANT}/admin/inbox`);

  // Page header — "Inbox" heading
  await expect(
    page.getByRole("heading", { name: /inbox/i }),
    "Inbox heading must be visible",
  ).toBeVisible();

  // Compose button is always rendered regardless of domain/mailbox state
  await expect(
    page.getByRole("button", { name: /new message/i }),
    '"New message" button must be visible in inbox header',
  ).toBeVisible();

  // Either the empty state ("No conversations yet.") or the conversation list
  // pane (div.w-72) is rendered — either satisfies the smoke test.
  const leftPane = page.locator(".w-72").first();
  await expect(
    leftPane,
    "conversation list left-pane must be present",
  ).toBeVisible();

  await coach.close();
});

// ── B. Settings page — mailbox section renders ─────────────────────────────
test("coach settings page shows mailbox section", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();

  await page.goto(`${TENANT}/admin/settings`);

  // MailboxSettingsSection renders a Card with title "Mailbox"
  await expect(
    page.getByText("Mailbox", { exact: false }),
    "Mailbox settings section heading must appear on settings page",
  ).toBeVisible({ timeout: 10_000 });

  // demo-yoga has no custom domain → upsell path renders the from_email in a
  // <p class="font-mono text-muted-foreground"> — just verify the section is
  // there and stable (no JS error).
  const mailboxCard = page.locator("text=Mailbox").first();
  await expect(mailboxCard).toBeVisible();

  await coach.close();
});

// ── C. Compose → email sink ────────────────────────────────────────────────
test("coach composes message → conversation appears in inbox → email sink captures it", async ({
  browser,
}) => {
  const coach = await coachContext(browser);
  const api = coach.request;

  // POST to the mailbox compose API directly (same as the UI dialog does).
  const composeRes = await api.post(`${TENANT}/api/v1/mailbox/compose/`, {
    data: { to: STUDENT_EMAIL, subject: SUBJECT, text: MESSAGE_TEXT },
    headers: { "Content-Type": "application/json" },
  });
  expect(
    composeRes.status(),
    `mailbox compose returned ${composeRes.status()}: ${await composeRes.text()}`,
  ).toBe(201);

  const composeBody = (await composeRes.json()) as {
    conversation_id: number;
    message_id: number;
  };
  expect(
    composeBody.conversation_id,
    "compose response must include conversation_id",
  ).toBeTruthy();
  expect(
    composeBody.message_id,
    "compose response must include message_id",
  ).toBeTruthy();

  const conversationId = composeBody.conversation_id;

  // Conversation appears in the list
  const listRes = await api.get(`${TENANT}/api/v1/mailbox/conversations/`);
  expect(listRes.status(), "conversation list must return 200").toBe(200);
  const list = (await listRes.json()) as {
    id: number;
    subject: string;
    counterparty_email: string;
  }[];
  const found = list.find((c) => c.id === conversationId);
  expect(
    found,
    `conversation ${conversationId} with subject "${SUBJECT}" must appear in list`,
  ).toBeTruthy();
  expect(found!.counterparty_email).toBe(STUDENT_EMAIL);

  // Conversation detail is fetchable
  const detailRes = await api.get(
    `${TENANT}/api/v1/mailbox/conversations/${conversationId}/`,
  );
  expect(detailRes.status(), "conversation detail must return 200").toBe(200);
  const detail = (await detailRes.json()) as {
    subject: string;
    messages: { direction: string; text: string }[];
  };
  expect(detail.subject).toBe(SUBJECT);
  expect(
    detail.messages.some(
      (m) => m.direction === "outbound" && m.text.includes(MESSAGE_TEXT),
    ),
    "outbound message with correct text must appear in conversation detail",
  ).toBe(true);

  // Email sink should have received the sent mail
  const email = await latestEmail(STUDENT_EMAIL);
  expect(
    email.subject,
    "email sink must capture the sent subject",
  ).toContain(SUBJECT);

  await coach.close();
});

// ── D. Inbound webhook — intentionally skipped ────────────────────────────
test.skip(
  "inbound webhook → conversation created in coach inbox",
  // Reason: MAILBOX_INBOUND_SECRET is not set in the dev .env, so
  // verify_inbound_signature() is fail-closed (returns False when secret == "").
  // Additionally, demo-yoga has no provisioned CustomDomain, so the inbound
  // view would silently drop the payload (no matching mailbox_enabled domain).
  // Inbound path is covered by backend unit tests (apps/mailbox/tests/).
  // To enable: set MAILBOX_INBOUND_SECRET and provision a live CustomDomain.
  async () => {
    // placeholder — test.skip exits before here
  },
);
