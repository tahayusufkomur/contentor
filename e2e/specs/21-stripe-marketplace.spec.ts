/**
 * @stripe — marketplace (student→coach) one-time purchase via Stripe Connect.
 *
 * Prerequisites:
 *   - `.env` must have `BILLING_BYPASS_ENABLED=false` and `sk_test` / `pk_test` keys.
 *   - stripe listen running with BOTH --forward-to AND --forward-connect-to pointing at
 *     /api/webhooks/stripe/ (connect events share the same endpoint — routed internally
 *     by presence of the `account` field in the event payload):
 *
 *       stripe listen \
 *         --api-key <STRIPE_SECRET_KEY> \
 *         --forward-to http://localhost/api/webhooks/stripe/ \
 *         --forward-connect-to http://localhost/api/webhooks/stripe/
 *
 * Paid-active setup (done in test body):
 *   1. seed_connect_test: idempotently provisions a test Connect account with
 *      charges_enabled=True and sets stripe_account_id on demo-yoga.
 *   2. Shell: upserts a PlatformSubscription (status=active) so is_paid_active()
 *      returns True (required: paid plan + active platform subscription).
 *
 * Idempotency:
 *   Each run creates a FRESH paid course via the coach API (unique title via
 *   Date.now()). This avoids the "already owned" 400 that would occur if the
 *   student buys the same course twice.  No teardown needed: the fresh Payment
 *   row in the tenant schema is harmless across runs (the course is new each time).
 *
 * The PlatformSubscription row carries no provider_subscription_id (it's a
 * synthesised row, not a real Stripe subscription), so cleanupSubscription from
 * spec 20 is NOT called — there is nothing for the ORM/signal to chase.  The
 * row is deleted via raw SQL in cleanup to avoid the cross-schema SET_NULL bug.
 *
 * Run with:
 *   STRIPE_E2E=1 npx playwright test specs/21
 *
 * Reconciled against:
 *   - backend/apps/billing/views/payments.py     → response keys: client_secret, stripe_account
 *   - backend/apps/billing/serializers/payments.py → content_type: "course"
 *   - backend/apps/billing/views/webhooks.py     → connect events dispatched at same endpoint
 *   - backend/apps/core/monetization.py          → is_paid_active needs PlatformSubscription
 */

import { execFileSync } from "node:child_process";
import { test, expect } from "@playwright/test";
import { coachContext, studentContext, TENANT } from "../helpers/auth";
import { manage, REPO_ROOT } from "../helpers/compose";
import { payStripeCheckout } from "../helpers/stripe";

test.skip(!process.env.STRIPE_E2E, "stripe-mode only (STRIPE_E2E=1 npx playwright test specs/21)");

/**
 * Upsert a PlatformSubscription for demo-yoga with status=active.
 * This is the precondition for is_paid_active() and can_monetize() to pass.
 * Uses update_or_create so it is safe to run multiple times.
 * The row carries no real Stripe subscription id so no Stripe cleanup is needed.
 */
function ensurePaidActive() {
  manage([
    "shell",
    "-c",
    `
from django.utils import timezone
from datetime import timedelta
from apps.core.models import Tenant, PlatformSubscription, PlatformPlan
from apps.accounts.models import User

tenant = Tenant.objects.get(schema_name='demo_yoga')
plan = PlatformPlan.objects.filter(price_monthly__gt=0, is_active=True).order_by('price_monthly').first()
if plan is None:
    raise RuntimeError('No paid PlatformPlan found — run seed_plans first')
coach = User.objects.filter(email=tenant.owner_email).first()
if coach is None:
    raise RuntimeError('Coach user not found for demo-yoga')
now = timezone.now()
PlatformSubscription.objects.update_or_create(
    tenant=tenant,
    defaults={
        'user': coach,
        'plan': plan,
        'status': 'active',
        'provider': 'stripe',
        'provider_subscription_id': '',
        'provider_customer_id': '',
        'current_period_start': now,
        'current_period_end': now + timedelta(days=365),
    },
)
print('PlatformSubscription upserted: active')
`,
  ]);
}

/**
 * Delete the synthetic PlatformSubscription row via raw SQL to avoid the
 * cross-schema SET_NULL signal bug (see spec 20 comments). Non-fatal.
 */
function cleanupPlatformSub() {
  try {
    execFileSync(
      "docker",
      [
        "compose",
        "exec",
        "-T",
        "django",
        "python",
        "manage.py",
        "shell",
        "-c",
        `
from django.db import connection
from apps.core.models import Tenant, PlatformSubscription

try:
    tenant = Tenant.objects.get(schema_name='demo_yoga')
    sub = PlatformSubscription.objects.filter(tenant=tenant, provider_subscription_id='').first()
    if sub:
        with connection.cursor() as c:
            c.execute('DELETE FROM core_platformsubscription WHERE id = %s', [sub.pk])
        print('Cleanup: synthetic PlatformSubscription deleted')
    else:
        print('Cleanup: no synthetic subscription to delete')
except Exception as e:
    print(f'Cleanup error (non-fatal): {e}')
`,
      ],
      { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
  } catch (e) {
    console.warn("[marketplace-cleanup] cleanup failed (non-fatal):", e);
  }
}

test("student buys a fresh paid course through Connect test checkout", async ({ browser }) => {
  // seed_connect_test may take up to 60 s (30 × 2 s polling) on the first run;
  // the overall flow (Stripe checkout + webhook) adds another 60–90 s.
  test.setTimeout(240_000);

  // ── 0. Preconditions ──────────────────────────────────────────────────────
  // (a) Provision Connect account (idempotent — exits early if already set up).
  manage(["seed_connect_test", "--tenant", "demo-yoga"]);

  // (b) Ensure demo-yoga has an active PlatformSubscription so is_paid_active()
  //     returns True — required for payment_initialize to proceed past the
  //     COACH_CANNOT_ACCEPT_PAYMENTS gate.
  //
  // CRITICAL: cleanupPlatformSub() MUST be called in a finally block after
  // ensurePaidActive() so that even a mid-test failure doesn't leave a synthetic
  // PlatformSubscription in the DB. If it remains, the next global setup's
  // seed_dev_tenants teardown fails with a cross-schema SET_NULL error on
  // billing_payment, leaving demo-yoga with no domain record (see memory
  // contentor-deploy-tenant-migrations-gotcha.md for the bug context).
  ensurePaidActive();

  try {
    // ── 1. Coach creates a FRESH paid course (unique title → no "already owned") ──
    const COURSE_TITLE = `E2E Paid Course ${Date.now()}`;
    const coach = await coachContext(browser);

    const courseRes = await coach.request.post(`${TENANT}/api/v1/courses/`, {
      data: {
        title: COURSE_TITLE,
        description: "Marketplace e2e test course — safe to delete",
        pricing_type: "paid",
        price: "9.99",
        is_published: true,
        // A course goes live only once every lesson has a video or text.
        modules: [{ title: "Start", lessons: [{ title: "Welcome", content_html: "<p>Welcome.</p>" }] }],
      },
      headers: { "Content-Type": "application/json" },
    });
    expect(courseRes.status(), `Course creation failed: ${await courseRes.text()}`).toBe(201);
    const course = await courseRes.json();
    const courseId: number = course.id;
    expect(courseId, "API response missing id").toBeTruthy();

    await coach.close();

    // ── 2. Student: Buy on the course page, Pay in the cart ──────────────────
    const student = await studentContext(browser);
    const page = await student.newPage();
    await page.goto(`${TENANT}/courses/${course.slug}`);
    await page.getByRole("button", { name: /^Buy for / }).click();
    await page.waitForURL(/\/checkout$/);
    await page.getByRole("button", { name: /^Pay / }).click();

    // ── 3. Our panel beside Stripe's form, on the coach's account; pay ────────
    await expect(page.getByRole("dialog", { name: "Checkout" })).toBeVisible({ timeout: 20_000 });
    await payStripeCheckout(page);

    // ── 4. Wait for Stripe's redirect back to the tenant app ──────────────────
    await expect(page).toHaveURL(/demo-yoga\.localhost/, { timeout: 60_000 });

    // ── 5. Poll /api/v1/billing/orders/ until the payment shows completed ─────
    // The webhook arrives via `stripe listen --forward-connect-to` → Django →
    // _handle_marketplace_checkout_completed → payment.status = "completed".
    await expect(async () => {
      const ordersRes = await student.request.get(`${TENANT}/api/v1/billing/orders/`);
      expect(ordersRes.ok(), `orders fetch failed: ${await ordersRes.text()}`).toBeTruthy();
      const orders = await ordersRes.json();
      const completed = (orders as Array<{ status: string; id: number }>).some(
        (o) => o.status === "completed"
      );
      expect(
        completed,
        `No completed order yet — orders: ${JSON.stringify(orders)}`
      ).toBeTruthy();
    }).toPass({ timeout: 45_000, intervals: [2_000] });

    await student.close();
  } finally {
    // ── 6. Cleanup — remove synthetic PlatformSubscription (avoids SET_NULL bug) ──
    // Runs even if the test fails (try/finally guarantees this).
    cleanupPlatformSub();
  }
});
