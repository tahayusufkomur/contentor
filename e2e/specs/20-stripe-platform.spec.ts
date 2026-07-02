/**
 * @stripe — platform subscription checkout in real Stripe test mode.
 *
 * Prerequisites:
 *   - `.env` must have `BILLING_BYPASS_ENABLED=false` and `sk_test` / `pk_test` keys.
 *   - `stripe listen --api-key <sk_test_...> --forward-to http://localhost/api/webhooks/stripe/`
 *     running in a separate shell (or via `make stripe-listen`).
 *     IMPORTANT: must use --api-key matching STRIPE_SECRET_KEY in .env (not the default
 *     CLI account). The webhook signing secret must match STRIPE_WEBHOOK_SECRET in .env.
 *   - `make seed` / `seed_plans` re-run once so `PlatformPlan` rows have
 *     `stripe_price_id` populated for USD.
 *
 * Run with:
 *   STRIPE_E2E=1 npx playwright test specs/20
 *
 * Idempotency:
 *   The test cleans up the Stripe subscription at the end (via the Stripe API)
 *   so that demo-yoga is left on the Free plan. This allows `make e2e` to re-seed
 *   demo-yoga correctly on subsequent runs (a live PlatformSubscription causes
 *   the seed_demo_tenant teardown to fail due to a cross-schema SET_NULL signal).
 *
 * The checkout body is `{ plan_id: <int> }` — reconciled against
 * `backend/apps/billing/views/platform.py::start_checkout`.
 * The starter plan (non-free) id is resolved dynamically at runtime via
 * `GET /api/v1/billing/platform/plans/` to avoid hardcoded PKs.
 */

import { execFileSync } from "node:child_process";
import { test, expect } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";
import { manage, REPO_ROOT } from "../helpers/compose";
import { payStripeCheckout } from "../helpers/stripe";

test.skip(!process.env.STRIPE_E2E, "stripe-mode only (STRIPE_E2E=1 npx playwright test specs/20)");

/**
 * Cancel and delete the PlatformSubscription for demo-yoga via Django shell.
 * This cleanup is needed because a live PlatformSubscription triggers a
 * cross-schema SET_NULL signal (Payment.platform_subscription) when
 * seed_demo_tenant tears down the tenant, breaking subsequent `make e2e` runs.
 *
 * Uses raw SQL DELETE to bypass Django ORM's SET_NULL signal on
 * Payment.platform_subscription (which looks for billing_payment in the public
 * schema and fails with "relation does not exist").
 */
function cleanupSubscription() {
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
import stripe
from django.conf import settings

try:
    t = Tenant.objects.get(schema_name='demo_yoga')
    sub = t.platform_subscription
    # Cancel the Stripe subscription first (best-effort).
    try:
        stripe.api_key = settings.STRIPE_SECRET_KEY
        if sub.provider_subscription_id:
            stripe.Subscription.cancel(sub.provider_subscription_id)
    except Exception as e:
        pass  # Not fatal — DB cleanup is the critical step.
    # Hard-delete via raw SQL to bypass Django ORM's SET_NULL signal which
    # tries to update billing_payment in the public schema (it doesn't exist
    # there; the table lives in per-tenant schemas only).
    with connection.cursor() as c:
        c.execute('DELETE FROM core_platformsubscription WHERE id = %s', [sub.pk])
    print('Cleanup: subscription deleted')
except PlatformSubscription.DoesNotExist:
    print('Cleanup: no subscription to delete')
except Tenant.DoesNotExist:
    print('Cleanup: demo_yoga tenant not found')
except Exception as e:
    print(f'Cleanup error: {e}')
`,
      ],
      { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
  } catch (e) {
    // Non-fatal: cleanup failure should not fail the test.
    console.warn("[stripe-cleanup] cleanup failed (non-fatal):", e);
  }
}

test("coach subscribes to a paid platform plan via real test Checkout", async ({ browser }) => {
  const coach = await coachContext(browser);

  // ── 0. Ensure demo-yoga has no active subscription (idempotency) ───────────
  // seed_plans recreates demo-yoga fresh on each global setup. Guard defensively
  // for re-runs without a fresh seed (e.g. running this spec twice in a row).
  const subCheck = await coach.request.get(`${TENANT}/api/v1/billing/platform/subscription/`);
  expect(subCheck.ok(), await subCheck.text()).toBeTruthy();
  const subBody = await subCheck.json();
  if (subBody.status && subBody.status !== "free" && subBody.status !== "canceled") {
    // Pre-existing active subscription — clean it up so checkout runs fresh.
    cleanupSubscription();
  }

  // ── 0b. Resolve the starter plan id dynamically ───────────────────────────
  // GET /api/v1/billing/platform/plans/ returns { plans: [{ id, name, is_free, ... }] }.
  // The starter plan is the first non-free active plan ordered by price_monthly.
  const plansRes = await coach.request.get(`${TENANT}/api/v1/billing/platform/plans/`);
  expect(plansRes.ok(), `list_plans failed: ${await plansRes.text()}`).toBeTruthy();
  const plansBody = await plansRes.json();
  const starterPlan = (plansBody.plans as Array<{ id: number; name: string; is_free: boolean }>).find(
    (p) => !p.is_free
  );
  expect(starterPlan, "No non-free plan found in /api/v1/billing/platform/plans/ — run seed_plans first").toBeDefined();
  const STARTER_PLAN_ID = starterPlan!.id;

  // ── 1. Start a Stripe Checkout session ────────────────────────────────────
  const start = await coach.request.post(`${TENANT}/api/v1/billing/platform/checkout/`, {
    data: { plan_id: STARTER_PLAN_ID },
  });
  expect(start.ok(), `start_checkout failed: ${await start.text()}`).toBeTruthy();
  const { checkout_url } = await start.json();
  expect(checkout_url).toMatch(/checkout\.stripe\.com/);

  // ── 2. Navigate to Stripe-hosted Checkout and pay ─────────────────────────
  const page = await coach.newPage();
  await page.goto(checkout_url);

  // Fill card details (4242 test card). Helper handles conditional fields
  // (name on card, postal) with explicit isVisible() guards.
  await payStripeCheckout(page);

  // ── 3. Wait for Stripe success redirect back to our app ───────────────────
  // success_url = <tenant-origin>/admin/billing?checkout=success
  await expect(page).toHaveURL(/localhost.*\/admin\/billing/, { timeout: 60_000 });

  // ── 4. Poll subscription endpoint until webhook has flipped it to active ──
  // The webhook arrives via `stripe listen` → Django → DB. Usually < 5 s.
  await expect(async () => {
    const sub = await coach.request.get(`${TENANT}/api/v1/billing/platform/subscription/`);
    expect(sub.ok(), await sub.text()).toBeTruthy();
    const body = await sub.json();
    // `get_subscription` always returns top-level `status` (verified against
    // apps/billing/views/platform.py). No fallback needed.
    expect(body.status, `subscription body: ${JSON.stringify(body)}`).toMatch(/active|trialing/);
  }).toPass({ timeout: 30_000, intervals: [2_000] });

  // ── 5. Cleanup — cancel the subscription so demo-yoga can be re-seeded ───
  // Removes the PlatformSubscription row from the public schema so that
  // subsequent `make e2e` → seed_demo_tenant teardown doesn't fail with a
  // cross-schema SET_NULL signal on billing_payment.
  cleanupSubscription();

  await coach.close();
});
