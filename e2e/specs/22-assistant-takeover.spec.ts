// e2e/specs/22-assistant-takeover.spec.ts
//
// AI Assistants v2 capstone: the student-widget↔coach-console human
// takeover loop (Tasks 5/6/15/16), the "talk to a human" email notification
// (Task 8), and the superadmin cross-tenant conversation console (Task 18) —
// exercised end to end against the real running dev stack.
//
// Provider note (same caveat as 16-site-assistant.spec.ts): AI_PROVIDER=cli
// in dev shells the developer's real Claude subscription — there is no
// stub/fake CLI in the dev image. Only ONE scenario here needs a real model
// answer (asking a question and getting a streamed response with follow-up
// suggestions); it is split into its OWN test below and test.skip()s itself
// when the live provider status isn't "ok". Calling test.skip() mid-test
// aborts the REST of that test's body in Playwright, so the takeover,
// human-request/email, and superadmin scenarios are deliberately separate
// test() blocks — they seed their own conversation fixtures directly via
// Django shell (no live model call involved) and must PASS regardless of
// provider availability, per the task brief.
//
// Tenant strategy: mirrors 16-site-assistant.spec.ts — demo-yoga starts on
// the Free plan; a shared beforeAll promotes it to paid and turns the
// assistant + human handoff on directly (no need to exercise the coach's
// own toggle UI here — that's 16-site-assistant's job), wiping any AI state
// left over from prior runs. A shared afterAll restores Free plan + wipes
// whatever this file seeded. Each test additionally seeds/cleans its own
// AiConversation fixture so a single test's retry can't leak into another.

import { test, expect } from "@playwright/test";
import { coachContext, superadminContext, MAIN, TENANT } from "../helpers/auth";
import { manage } from "../helpers/compose";
import { latestEmail } from "../helpers/email";

const STUDENT_QUESTION = "What courses do you have?";
const TAKEOVER_SESSION_ID = "e2e-takeover-19";
const TAKEOVER_LABEL = "E2E Visitor";
const TAKEOVER_SEED_QUESTION = "E2E fixture: what's your refund policy?";
const HELP_SESSION_ID = "e2e-help-19";
const HELP_LABEL = "E2E Coach";
const HELP_SEED_QUESTION = "E2E fixture: how do I reset my password?";
const SESSION_STORAGE_KEY = "contentor.ai.session.assistant";

// ── Tenant plan + assistant-config setup/teardown (shared across the file) ──

function setupPaidTenant(): void {
  manage([
    "shell",
    "-c",
    `
from django_tenants.utils import tenant_context
from apps.core.models import Tenant, PlatformPlan, PlatformSubscription, AiConversation, AiTranscript, StudentBotUsage
from apps.accounts.models import User

t = Tenant.objects.get(slug="demo-yoga")
plan = PlatformPlan.objects.get(name="pro")
owner = User.objects.filter(is_superuser=True).order_by("id").first()
PlatformSubscription.objects.update_or_create(
    tenant=t,
    defaults={
        "user": owner,
        "plan": plan,
        "status": PlatformSubscription.STATUS_ACTIVE,
        "provider": PlatformSubscription.PROVIDER_MANUAL,
    },
)
# Clean slate: previous runs (or a crashed prior run that skipped cleanup)
# must not leak state into this run's assertions.
AiConversation.objects.filter(tenant_schema=t.schema_name, feature="student_bot").delete()
AiConversation.objects.filter(tenant_schema=t.schema_name, feature="help_bot", session_id="${HELP_SESSION_ID}").delete()
AiTranscript.objects.filter(tenant_schema=t.schema_name, feature__in=("student_bot", "help_bot")).delete()
StudentBotUsage.objects.filter(tenant_schema=t.schema_name).delete()
with tenant_context(t):
    from apps.tenant_config.models import AssistantConfig, AssistantKnowledgeEntry
    cfg = AssistantConfig.load()
    cfg.enabled = True
    cfg.human_handoff_enabled = True
    cfg.greeting = ""
    cfg.suggested_questions = []
    cfg.save()
    AssistantKnowledgeEntry.objects.all().delete()
print("assistant-e2e-19: setup ok")
`,
  ]);
}

function cleanupPaidTenant(): void {
  // Raw SQL DELETE bypasses Django ORM's SET_NULL signal on
  // Payment.platform_subscription (same trick 16-site-assistant.spec.ts and
  // 20-stripe-platform.spec.ts use).
  manage([
    "shell",
    "-c",
    `
from django.db import connection
from django_tenants.utils import tenant_context
from apps.core.models import Tenant, PlatformSubscription, AiConversation, AiTranscript, StudentBotUsage

t = Tenant.objects.get(slug="demo-yoga")
try:
    sub = t.platform_subscription
    with connection.cursor() as c:
        c.execute("DELETE FROM core_platformsubscription WHERE id = %s", [sub.pk])
except PlatformSubscription.DoesNotExist:
    pass
AiConversation.objects.filter(tenant_schema=t.schema_name, feature="student_bot").delete()
AiConversation.objects.filter(tenant_schema=t.schema_name, feature="help_bot", session_id="${HELP_SESSION_ID}").delete()
AiTranscript.objects.filter(tenant_schema=t.schema_name, feature__in=("student_bot", "help_bot")).delete()
StudentBotUsage.objects.filter(tenant_schema=t.schema_name).delete()
with tenant_context(t):
    from apps.tenant_config.models import AssistantConfig, AssistantKnowledgeEntry
    cfg = AssistantConfig.load()
    cfg.enabled = False
    cfg.human_handoff_enabled = True
    cfg.greeting = ""
    cfg.suggested_questions = []
    cfg.save()
    AssistantKnowledgeEntry.objects.all().delete()
print("assistant-e2e-19: cleanup ok")
`,
  ]);
}

function tenantOwnerEmail(): string {
  return manage([
    "shell",
    "-c",
    `
from apps.core.models import Tenant
print(Tenant.objects.get(slug="demo-yoga").owner_email, end="")
`,
  ]);
}

// Directly seeds (or resets) a student_bot AiConversation with one user
// message — no live model call, so the coach-takeover scenario never
// depends on the AI provider being available.
function seedTakeoverConversation(): void {
  manage([
    "shell",
    "-c",
    `
from apps.core.models import Tenant, AiConversation, AiMessage

t = Tenant.objects.get(slug="demo-yoga")
convo, _ = AiConversation.objects.get_or_create(
    session_id="${TAKEOVER_SESSION_ID}",
    feature="student_bot",
    tenant_schema=t.schema_name,
    defaults={"audience": "student"},
)
convo.user_label = "${TAKEOVER_LABEL}"
convo.status = "ai"
convo.human_requested = False
convo.human_requested_at = None
convo.agent_user_id = None
convo.agent_label = ""
convo.taken_over_at = None
convo.save()
convo.messages.all().delete()
AiMessage.objects.create(conversation=convo, role="user", content="${TAKEOVER_SEED_QUESTION}")
print("assistant-e2e-19: takeover fixture seeded")
`,
  ]);
}

// Directly seeds a help_bot/coach-audience AiConversation for the
// superadmin console — same rationale: pure DB + console, no provider.
function seedHelpBotConversation(): void {
  manage([
    "shell",
    "-c",
    `
from apps.core.models import Tenant, AiConversation, AiMessage

t = Tenant.objects.get(slug="demo-yoga")
convo, _ = AiConversation.objects.get_or_create(
    session_id="${HELP_SESSION_ID}",
    feature="help_bot",
    tenant_schema=t.schema_name,
    defaults={"audience": "coach"},
)
convo.user_label = "${HELP_LABEL}"
convo.status = "ai"
convo.human_requested = False
convo.human_requested_at = None
convo.agent_user_id = None
convo.agent_label = ""
convo.taken_over_at = None
convo.save()
convo.messages.all().delete()
AiMessage.objects.create(conversation=convo, role="user", content="${HELP_SEED_QUESTION}")
print("assistant-e2e-19: help-bot fixture seeded")
`,
  ]);
}

test.describe("Assistant takeover capstone", () => {
  test.beforeAll(setupPaidTenant);
  test.afterAll(cleanupPaidTenant);

  // ── 2. Student asks a question (provider-gated) ─────────────────────────
  test("student asks a question: real streamed answer, follow-up chips, and reload persistence", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const anon = await browser.newContext();
    const page = await anon.newPage();
    try {
      const statusFetch = page.waitForResponse((r) =>
        r.url().includes("/api/v1/assistant/status/"),
      );
      await page.goto(`${TENANT}/`);
      const statusRes = await statusFetch;
      const status = await statusRes.json();
      expect(status.enabled, JSON.stringify(status)).toBe(true);
      test.skip(
        status.reason !== "ok",
        `AI provider unavailable in this environment (status reason="${status.reason}") — ` +
          "no stub/fake CLI ships in the dev image; the streamed-answer, follow-up-chip and " +
          "reload-persistence assertions need a real completed answer and are skipped here.",
      );

      const bubbleButton = page.getByRole("button", { name: "Open site assistant" });
      await expect(bubbleButton).toBeVisible({ timeout: 10_000 });
      await bubbleButton.click();

      await page.getByPlaceholder(/Ask a question/).fill(STUDENT_QUESTION);
      await page.getByRole("button", { name: "Send", exact: true }).click();

      // Follow-up chips only render once the SSE "done" event lands with
      // suggestions — the clearest signal a real answer completed.
      const suggestionChip = page.locator('[data-testid="assistant-suggestion"]').first();
      await expect(suggestionChip).toBeVisible({ timeout: 90_000 });

      const answerBubble = page.locator("div.rounded-2xl.rounded-bl-sm").last();
      const answerText = (await answerBubble.textContent())?.trim() ?? "";
      expect(
        answerText.length,
        `expected a non-empty streamed answer, got: ${JSON.stringify(answerText)}`,
      ).toBeGreaterThan(0);

      // ── Reload → the persisted thread (question + answer) is still there ──
      await page.reload();
      const reopenedBubble = page.getByRole("button", { name: "Open site assistant" });
      await expect(reopenedBubble).toBeVisible({ timeout: 10_000 });
      await reopenedBubble.click();
      await expect(page.getByText(STUDENT_QUESTION)).toBeVisible({ timeout: 10_000 });
    } finally {
      await anon.close().catch(() => {});
    }
  });

  // ── 3 & 4. Coach takeover round-trip + human request/email — no provider ──
  test("coach takes over a live conversation, hands back, and a human request notifies the coach", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    seedTakeoverConversation();

    const anon = await browser.newContext();
    const page = await anon.newPage();
    await page.addInitScript(
      ({ key, id }) => {
        window.localStorage.setItem(key, JSON.stringify({ id, ts: Date.now() }));
      },
      { key: SESSION_STORAGE_KEY, id: TAKEOVER_SESSION_ID },
    );

    let coach: Awaited<ReturnType<typeof coachContext>> | undefined;
    try {
      // ── Student opens the bubble; the seeded fixture question hydrates ────
      await page.goto(`${TENANT}/`);
      const bubbleButton = page.getByRole("button", { name: "Open site assistant" });
      await expect(bubbleButton).toBeVisible({ timeout: 10_000 });
      await bubbleButton.click();
      await expect(page.getByText(TAKEOVER_SEED_QUESTION)).toBeVisible({ timeout: 10_000 });

      // ── Coach: Conversations card shows the row → Take over ───────────────
      coach = await coachContext(browser);
      const coachPage = await coach.newPage();
      await coachPage.goto(`${TENANT}/admin/assistant`);
      const coachRow = coachPage.locator("button").filter({ hasText: TAKEOVER_LABEL });
      await expect(coachRow).toBeVisible({ timeout: 10_000 });
      await coachRow.click();
      // .last(): right after opening the thread, the seed question is both
      // the row's own (frozen) last-message preview AND the sole message
      // rendered in the newly-expanded thread pane below it — the pane
      // renders later in DOM order, so .last() disambiguates.
      await expect(coachPage.getByText(TAKEOVER_SEED_QUESTION).last()).toBeVisible({
        timeout: 10_000,
      });

      const takeOverBtn = coachPage.getByRole("button", { name: "Take over" });
      await expect(takeOverBtn).toBeVisible();
      await takeOverBtn.click();
      await expect(coachPage.getByText(/joined the chat/)).toBeVisible({ timeout: 10_000 });

      // ── Student sees the "joined the chat" system line within 10s ─────────
      await expect
        .poll(async () => page.getByText(/joined the chat/).count(), { timeout: 10_000 })
        .toBeGreaterThan(0);

      // ── Coach sends a message ──────────────────────────────────────────────
      // Scoped to the reply <form> — /admin/assistant also renders the
      // "Try it yourself" preview chat, whose icon-only Send button shares
      // the same accessible name ("Send") and would otherwise make this
      // locator ambiguous.
      const AGENT_MESSAGE = "Merhaba! I'm here.";
      const replyForm = coachPage
        .locator("form")
        .filter({ has: coachPage.getByPlaceholder("Write your reply…") });
      await replyForm.getByPlaceholder("Write your reply…").fill(AGENT_MESSAGE);
      await replyForm.getByRole("button", { name: "Send", exact: true }).click();
      await expect(coachPage.getByText(AGENT_MESSAGE)).toBeVisible({ timeout: 10_000 });

      // ── Student sees the agent's message within 10s ────────────────────────
      await expect
        .poll(async () => page.getByText(AGENT_MESSAGE).count(), { timeout: 10_000 })
        .toBeGreaterThan(0);

      // ── Student replies — human mode, no SSE (sendHumanMessage) ────────────
      const STUDENT_REPLY = "Thanks, I have a question about the retreat.";
      await page.getByPlaceholder(/Ask a question/).fill(STUDENT_REPLY);
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(page.getByText(STUDENT_REPLY)).toBeVisible();

      // ── Coach thread shows the student's reply ──────────────────────────────
      await expect(coachPage.getByText(STUDENT_REPLY)).toBeVisible({ timeout: 10_000 });

      // ── Hand back to assistant ────────────────────────────────────────────
      await coachPage.getByRole("button", { name: "Hand back to assistant" }).click();
      await expect(coachPage.getByText("The assistant is back")).toBeVisible({ timeout: 10_000 });

      // ── Student sees "The assistant is back" within 10s ────────────────────
      await expect
        .poll(async () => page.getByText("The assistant is back").count(), { timeout: 10_000 })
        .toBeGreaterThan(0);

      // ── 4. Human request → email sink → coach badge ────────────────────────
      const ownerEmail = tenantOwnerEmail();
      await page.getByRole("button", { name: "Talk to a human" }).click();
      const email = await latestEmail(ownerEmail);
      expect(email.subject).toContain("asked to talk to a human");

      await coachPage.goto(`${TENANT}/admin/assistant`);
      const coachRowAfterRequest = coachPage.locator("button").filter({ hasText: TAKEOVER_LABEL });
      await expect(coachRowAfterRequest.getByText("Wants a human")).toBeVisible({
        timeout: 10_000,
      });
    } finally {
      if (coach) await coach.close().catch(() => {});
      await anon.close().catch(() => {});
    }
  });

  // ── 5. Superadmin console — pure DB + console, no provider ────────────────
  test("superadmin console: take over a help-bot conversation and reply", async ({ browser }) => {
    test.setTimeout(180_000);
    seedHelpBotConversation();

    const admin = await superadminContext(browser);
    const page = await admin.newPage();
    try {
      await page.goto(`${MAIN}/admin/ai`);
      const row = page.locator("button").filter({ hasText: HELP_LABEL });
      await expect(row).toBeVisible({ timeout: 15_000 });
      await row.click();
      // Scoped to the thread drawer — the fixture question is also the list
      // row's last-message preview, so an unscoped getByText is ambiguous
      // once the drawer (rendering the same text again) is open.
      const drawer = page.locator("div.fixed.inset-y-0.right-0");
      await expect(drawer.getByText(HELP_SEED_QUESTION)).toBeVisible({ timeout: 10_000 });

      await drawer.getByRole("button", { name: "Take over" }).click();
      await expect(drawer.getByText(/joined/)).toBeVisible({ timeout: 10_000 });

      const REPLY = "Thanks for reaching out — here's the answer.";
      await drawer.getByPlaceholder("Reply…").fill(REPLY);
      await drawer.getByRole("button", { name: "Send", exact: true }).click();
      await expect(drawer.getByText(REPLY)).toBeVisible({ timeout: 10_000 });

      // Row reflects human status (the "Live" badge) after takeover + reply.
      await expect(row.getByText("Live")).toBeVisible({ timeout: 10_000 });
    } finally {
      await admin.close().catch(() => {});
    }
  });
});
