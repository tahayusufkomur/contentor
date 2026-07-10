// e2e/specs/16-site-assistant.spec.ts
//
// Site assistant golden path: a free tenant is gated off with no bubble at
// all; a coach on a paid platform plan turns the assistant on and teaches it
// a greeting; an anonymous visitor chats with it and rates the answer; the
// coach's transcript log picks up the exchange with a working "Add to
// knowledge" prefill (the improvement loop this whole feature exists for);
// and /admin never renders the bubble regardless of plan/enabled state.
//
// Provider note: AI_PROVIDER=cli in dev shells the developer's real Claude
// subscription (backend/apps/core/ai.py) via the `claude` CLI baked into the
// django image (INSTALL_CLAUDE_CLI=1, docker-compose.yml) — there is no
// stub/fake CLI binary anywhere (grepped `stub`/`fake` across e2e/ + backend/:
// only pytest's own "stub" package and unrelated GetStream/Stripe/storage
// fakes turned up — nothing AI-provider shaped). So this spec checks the LIVE
// /api/v1/assistant/status/ reason right before asking a question: if the
// coach-enabled+paid gate is satisfied but the provider itself still reports
// not-"ok" (e.g. no CLAUDE_CODE_OAUTH_TOKEN / no claude binary in some other
// environment), the chat-answer-content, rating and teach-loop assertions are
// skipped via test.skip() — every gating/UI/navigation assertion above that
// point still runs unconditionally.
//
// Tenant strategy: demo-yoga starts on the Free plan (no PlatformSubscription
// row — verified against the running dev stack), which is exactly the "free
// tenant" fixture checklist point 1 needs. This spec promotes it to paid via
// a Django-shell PlatformSubscription (mirrors the paid_tenant fixture in
// backend/apps/tenant_config/tests/test_assistant_*_api.py) and always
// restores it to Free in a `finally` block using the same raw-SQL delete
// 20-stripe-platform.spec.ts uses, so seed_demo_tenant's teardown and
// subsequent `make e2e` runs are unaffected.

import { test, expect } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";
import { manage } from "../helpers/compose";

const QUESTION = "What courses do you have?";
const GREETING = "Hi from e2e";

// ── Tenant plan setup/teardown ───────────────────────────────────────────

function setupPaidTenant(): void {
  manage([
    "shell",
    "-c",
    `
from django_tenants.utils import tenant_context
from apps.core.models import Tenant, PlatformPlan, PlatformSubscription, AiTranscript, StudentBotUsage
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
AiTranscript.objects.filter(tenant_schema=t.schema_name, feature__in=("student_bot", "help_bot")).delete()
StudentBotUsage.objects.filter(tenant_schema=t.schema_name).delete()
with tenant_context(t):
    from apps.tenant_config.models import AssistantConfig, AssistantKnowledgeEntry
    cfg = AssistantConfig.load()
    cfg.enabled = False
    cfg.greeting = ""
    cfg.suggested_questions = []
    cfg.save()
    AssistantKnowledgeEntry.objects.all().delete()
print("assistant-e2e: setup ok")
`,
  ]);
}

function cleanupPaidTenant(): void {
  // Raw SQL DELETE bypasses Django ORM's SET_NULL signal on
  // Payment.platform_subscription, which looks for billing_payment in the
  // public schema and fails — same trick 20-stripe-platform.spec.ts uses.
  manage([
    "shell",
    "-c",
    `
from django.db import connection
from django_tenants.utils import tenant_context
from apps.core.models import Tenant, PlatformSubscription, AiTranscript, StudentBotUsage

t = Tenant.objects.get(slug="demo-yoga")
try:
    sub = t.platform_subscription
    with connection.cursor() as c:
        c.execute("DELETE FROM core_platformsubscription WHERE id = %s", [sub.pk])
except PlatformSubscription.DoesNotExist:
    pass
AiTranscript.objects.filter(tenant_schema=t.schema_name, feature__in=("student_bot", "help_bot")).delete()
StudentBotUsage.objects.filter(tenant_schema=t.schema_name).delete()
with tenant_context(t):
    from apps.tenant_config.models import AssistantConfig, AssistantKnowledgeEntry
    cfg = AssistantConfig.load()
    cfg.enabled = False
    cfg.greeting = ""
    cfg.suggested_questions = []
    cfg.save()
    AssistantKnowledgeEntry.objects.all().delete()
print("assistant-e2e: cleanup ok")
`,
  ]);
}

test("free tenant: no bubble; paid+enabled: student chats and rates", async ({
  browser,
}) => {
  // Django-shell round trips (~5-10s) + a real Claude CLI answer can take a
  // while — give this room beyond the default 60s budget.
  test.setTimeout(150_000);

  const anon = await browser.newContext();
  const page = await anon.newPage();
  let coach: Awaited<ReturnType<typeof coachContext>> | undefined;

  try {
    // ── 1. Free tenant: status upgrade_required, no bubble on the site ────
    const statusFree = await page.request.get(
      `${TENANT}/api/v1/assistant/status/`,
    );
    expect(statusFree.ok(), await statusFree.text()).toBeTruthy();
    const freeBody = await statusFree.json();
    expect(freeBody.enabled).toBe(false);
    expect(freeBody.reason).toBe("upgrade_required");

    const freeStatusFetch = page.waitForResponse((r) =>
      r.url().includes("/api/v1/assistant/status/"),
    );
    await page.goto(`${TENANT}/`);
    await freeStatusFetch;
    await expect(
      page.getByRole("button", { name: "Open site assistant" }),
    ).toHaveCount(0);

    // ── 2. Promote demo-yoga to a paid plan + reset the feature ───────────
    setupPaidTenant();

    // ── 3. Coach: /admin/assistant → toggle enable, save greeting ─────────
    coach = await coachContext(browser);
    const coachPage = await coach.newPage();
    await coachPage.goto(`${TENANT}/admin/assistant`);

    // Paid gate lifted — the free-tier upsell card is gone.
    await expect(
      coachPage.getByText("Get a site assistant for your students"),
    ).toHaveCount(0);

    const toggle = coachPage.getByRole("switch").first();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    const enableResponse = coachPage.waitForResponse(
      (r) =>
        r.url().includes("/api/v1/admin/assistant/config/") &&
        r.request().method() === "PUT",
    );
    await toggle.click();
    await enableResponse;
    await expect(toggle).toHaveAttribute("aria-checked", "true");

    await coachPage.getByLabel("Greeting", { exact: true }).fill(GREETING);
    const saveResponse = coachPage.waitForResponse(
      (r) =>
        r.url().includes("/api/v1/admin/assistant/config/") &&
        r.request().method() === "PUT",
    );
    await coachPage.getByRole("button", { name: "Save", exact: true }).click();
    const saved = await saveResponse;
    expect(saved.status()).toBe(200);
    const savedBody = await saved.json();
    expect(savedBody.greeting).toBe(GREETING);

    // ── 7. /admin routes never render the bubble (checked now that the
    //      assistant is actually enabled+paid, not just structurally absent
    //      because the config hasn't loaded yet). ─────────────────────────
    await expect(
      coachPage.getByRole("button", { name: "Open site assistant" }),
    ).toHaveCount(0);

    // ── 4. Anonymous visitor: bubble visible, greeting shown ──────────────
    const paidStatusFetch = page.waitForResponse((r) =>
      r.url().includes("/api/v1/assistant/status/"),
    );
    await page.goto(`${TENANT}/`);
    await paidStatusFetch;
    const bubbleButton = page.getByRole("button", {
      name: "Open site assistant",
    });
    await expect(bubbleButton).toBeVisible({ timeout: 10_000 });
    await bubbleButton.click();
    await expect(page.getByText(GREETING)).toBeVisible();

    // ── 5. Provider-availability gate: skip only the AI-content assertions
    //      below this line if the live provider itself isn't available in
    //      this environment. Everything above (gating, bubble, greeting,
    //      /admin absence) has already been asserted unconditionally. ─────
    const statusPaid = await page.request.get(
      `${TENANT}/api/v1/assistant/status/`,
    );
    const paidBody = await statusPaid.json();
    expect(paidBody.enabled, JSON.stringify(paidBody)).toBe(true);
    test.skip(
      paidBody.reason !== "ok",
      `AI provider unavailable in this environment (status reason="${paidBody.reason}") — ` +
        "no stub/fake CLI ships in the dev image (see header comment); the chat-answer, " +
        "rating and teach-loop assertions need a real completed answer and are skipped here. " +
        "Every gating/UI/navigation assertion above already ran unconditionally.",
    );

    // ── 4b. Ask a question → real streamed, non-empty answer ──────────────
    await page.getByPlaceholder(/Ask a question/).fill(QUESTION);
    await page.getByRole("button", { name: "Send", exact: true }).click();

    // Thumbs buttons only render once the SSE "done" event lands with
    // transcript metadata — the clearest signal a real answer completed.
    const rateUpButton = page.getByRole("button", {
      name: "Helpful",
      exact: true,
    });
    await expect(rateUpButton).toBeVisible({ timeout: 90_000 });
    const answerBubble = page.locator("div.rounded-2xl.rounded-bl-sm").last();
    const answerText = (await answerBubble.textContent())?.trim() ?? "";
    expect(
      answerText.length,
      `expected a non-empty streamed answer, got: ${JSON.stringify(answerText)}`,
    ).toBeGreaterThan(0);

    // ── 5b. Thumbs-up → POST /api/v1/ai/rate/ → 204 ───────────────────────
    const rateResponse = page.waitForResponse(
      (r) =>
        r.url().includes("/api/v1/ai/rate/") &&
        r.request().method() === "POST",
    );
    await rateUpButton.click();
    const rated = await rateResponse;
    expect(rated.status()).toBe(204);

    // ── 6. Coach sees the transcript; "Add to knowledge" prefills the form ─
    await coachPage.goto(`${TENANT}/admin/assistant`);
    await expect(coachPage.getByText(QUESTION)).toBeVisible({
      timeout: 10_000,
    });
    await coachPage
      .getByRole("button", { name: "Add to knowledge" })
      .click();
    await expect(coachPage.locator("#entry-title")).toHaveValue(QUESTION);
  } finally {
    // Always restore demo-yoga to Free so subsequent `make e2e` runs (and
    // 20-stripe-platform.spec.ts's own idempotency check) see the tenant in
    // its normal seeded state.
    cleanupPaidTenant();
    if (coach) await coach.close().catch(() => {});
    await anon.close().catch(() => {});
  }
});
