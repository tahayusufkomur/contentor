# Coach Onboarding Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new coach can sign up, get a site that contains only true statements, and go live without hitting a dead end — in USD or EUR, with nothing Turkish left in the product.

**Architecture:** Six phases, each shippable on its own branch. Phase 1 fixes the confirmed dead-end bugs. Phase 2 removes Turkish (currency, region behaviour, locale) and adds EUR, and goes second on purpose: every later copy change then touches one language file instead of two. Phases 3–6 fix content honesty, free-plan messaging, the wizard, and first-run polish. Fixes go at the root (serializer, gate, compose fallback), not in each caller.

**Tech Stack:** Django 5.1 + DRF + django-tenants, Celery, 2× Next.js 14 (`frontend-main` = marketing + wizard, `frontend-customer` = tenant portal), next-intl, Stripe (platform billing + Connect Express), Playwright e2e, vitest, pytest.

**Spec:** No separate spec file. The source is the onboarding walk-through of 2026-10-04 (test tenant `luna-pilates-studio`, wizard bucket `control`); every finding from it is mapped to a task in the appendix at the bottom.

## Decisions this plan is built on

Chosen by Taha on 2026-10-04:

1. **Free plan = free content only.** Selling needs Starter. Make every surface say so.
2. **Cut the wizard's layout steps** (menu style, hero layout, six per-page layouts). Recommended defaults are applied; coaches change them in the editor.
3. **Launch currencies: USD and EUR.**
4. **Remove everything Turkish:** TRY, the `tr.` site, Turkish translations, TR region behaviour, the iyzico placeholder.

Defaults I chose where the plan needed one — veto any of them:

- **Which currency a coach gets:** decided once at tenant creation from Cloudflare's `CF-IPCountry` header — eurozone country → EUR, anything else (or no header, e.g. dev) → USD. No picker. It stays immutable afterwards, as `billing_currency` is today.
- **EUR prices:** same numerals as USD (€19.90 / €49.90) until told otherwise.
- **`region` column and JWT claim stay** as a constant `"global"`. Only the Turkish *behaviour* is deleted. Dropping the column would mean migrating user uniqueness `(email, region)` and auth tokens for no user-visible gain.
- **Recent Activity card is deleted**, not built. There is no tenant activity endpoint.
- **The A/B test stays.** Shared steps are fixed for both variants; the content-first (`treatment`) variant was not walked and gets no variant-specific changes here.
- **Plan names stay lowercase in the DB** (`starter`, `pro`; code and e2e match on them). They are capitalised at display.

## Global Constraints

- Line numbers come from a code map made on 2026-10-04. Re-grep before editing; do not trust a line number blindly.
- Verify at the cheapest level: `make test-changed` (plus `make e2e-changed` if user-facing) or `make test-app APP=<app>`. One heavy job at a time (Docker VM has 4.4 GB). Never rebuild the stack for a code-only change.
- After changing any serializer: `npm run gen:api` in `frontend-customer` and review the `src/types/api-generated.ts` diff.
- Wizard step order lives in **two** places: `frontend-main/src/lib/wizard/machine.ts` and backend `apps/core/onboarding/wizard_catalog.py`. Change both or resume breaks silently.
- e2e specs select by the strings in `frontend-main/messages/en/*.json`. A copy change means checking `e2e/specs/01-signup-onboarding.spec.ts` and friends.
- Frontend loading rules (`scripts/check-loading-patterns.mjs`): `<Button loading>`, `useAsyncAction`, `<NavLink>` / `useNavigate()`, sonner toasts, `<PageState>`.
- Tenant-schema data fixes use `.update()`, never `.save()`: `apps/core/signals.py` blocks saves that change `region` / `billing_currency`.
- Pre-commit must pass clean. No new `.md` files. Commit per task; deploy and verify on prod per phase (`make deploy`).
- Coach-facing word for the thing they build is **"site"**. Not "app", "platform" or "studio".

## Review Focus

Failure modes no single task's happy-path test would catch. Each has its test in the owning task.

1. **A coach mid-wizard when Phase 5 ships** has `wizard_state.current_step` set to a removed step (`look.navbar`, `pages.home`…). They must resume at the next valid step, not be thrown back to "What do you teach?". → Task 5.1.
2. **Existing courses with `pricing_type != "paid"` and a leftover price** must stop counting as paid content after the fix, without the coach re-saving them. → Task 1.2 (data migration + test).
3. **AI copy unavailable** (no provider, budget exhausted, timeout) must still yield a site with no invented credentials or testimonials. → Task 3.1.
4. **Users and tenants stored with locale `tr`** must render in English after the Turkish files are gone, not crash on a missing message bundle. → Task 2.5.
5. **A eurozone coach whose plan has no EUR Stripe price yet** must see a clear "not available" state, not a broken checkout. → Task 2.1.

---

## Phase 1 — Publish dead-ends (confirmed bugs)

### Task 1.1: The publish card names every blocker

The backend can return `first_event` and `first_blog_post`; the card has no label for them and silently renders nothing, leaving an empty list and a disabled button.

**Files:**
- Create: `frontend-customer/src/lib/publish-blockers.ts`
- Test: `frontend-customer/src/lib/__tests__/publish-blockers.test.ts`
- Modify: `frontend-customer/src/components/admin/publish-card.tsx:26-40` (delete the local map), `:263-265` (use `blockerMeta`)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { blockerMeta, PUBLISH_BLOCKER_META } from "../publish-blockers";

describe("publish blockers", () => {
  it("labels every key the backend can return", () => {
    for (const key of ["look", "first_course", "first_event", "first_blog_post", "payouts"]) {
      expect(PUBLISH_BLOCKER_META[key]?.label).toBeTruthy();
    }
  });

  it("never hides an unknown blocker", () => {
    expect(blockerMeta("some_new_rule").label).toBe("some new rule");
  });
});
```

- [ ] **Step 2: Run it** — `cd frontend-customer && npx vitest run src/lib/__tests__/publish-blockers.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// Copy + deep link for each publish requirement. Keys mirror `publish_blockers`
// in backend/apps/tenant_config/setup_items.py — add a key there, add it here.
export const PUBLISH_BLOCKER_META: Record<string, { label: string; href: string }> = {
  look: { label: "Add your logo", href: "/?edit=1&studio=1" },
  first_course: { label: "Publish your first course or download", href: "/admin/courses" },
  first_event: { label: "Schedule your first live class or event", href: "/admin/live" },
  first_blog_post: { label: "Publish your first blog post", href: "/admin/blog" },
  payouts: { label: "Connect payments to sell paid content", href: "/admin/payouts" },
};

export function blockerMeta(key: string): { label: string; href: string } {
  // An unknown key means the backend gained a requirement this build predates.
  // Show it: an empty list with a disabled button is a dead end.
  return PUBLISH_BLOCKER_META[key] ?? { label: key.replaceAll("_", " "), href: "/admin" };
}
```

In `publish-card.tsx`, replace `const meta = PUBLISH_BLOCKER_META[key]; if (!meta) return null;` with `const meta = blockerMeta(key);`. The stale `demo_cleanup` entry goes away with the old map.

- [ ] **Step 4: Run the test** — expected PASS. Then `make typecheck`.
- [ ] **Step 5: Commit** — `fix(publish): label every publish blocker, never render an empty list`

### Task 1.2: A free course cannot carry a price

Switching Paid → Free leaves `price=49.00`. The publish gate filters on `price__gt=0`, so a free-plan coach is told to "connect payments" with no visible cause. Fix once in the serializer and once in the gate; both forms (course form and the course-list quick edit) are then correct without touching them.

**Files:**
- Modify: `backend/apps/courses/serializers.py` (`CourseCreateUpdateSerializer`, ~`:278`)
- Modify: the `DownloadFile` create/update serializer in `backend/apps/downloads/serializers.py` (same rule; the model has `pricing_type` + `price` at `models.py:9-14`)
- Modify: `backend/apps/tenant_config/setup_items.py:80-92` (`_has_paid_content`)
- Create: one data migration each in `backend/apps/courses/migrations/` and `backend/apps/downloads/migrations/`
- Test: `backend/apps/courses/tests/test_views.py`, `backend/apps/tenant_config/tests/test_setup_status.py`

- [ ] **Step 1: Write the failing tests**

In `test_setup_status.py`, next to `test_publish_blockers_payouts_only_when_paid_content`:

```python
def test_free_course_with_stale_price_is_not_paid_content(coach, config):
    """Paid -> Free used to leave the old price behind and demand payouts."""
    from django.db import connection

    config.logo_url = "https://s3.example.com/logo.png"
    config.save(update_fields=["logo_url"])
    Course.objects.create(
        title="Was paid", slug="was-paid", instructor=coach, price=49, pricing_type="free", is_published=True
    )
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=False):
        assert _blockers(config, connection.tenant) == set()
```

The existing test creates its paid course as `price=10` with the default `pricing_type="free"`. Change that line to `price=10, pricing_type="paid"` — it encoded the bug.

In `courses/tests/test_views.py`, class `TestCourseListCreate` (match the file's `make_client(owner)` style):

```python
def test_switching_to_free_clears_price(self, owner):
    client = make_client(owner)
    resp = client.post(
        "/api/v1/courses/", {"title": "Paid", "pricing_type": "paid", "price": "49.00"}, format="json"
    )
    assert resp.status_code == 201, resp.content
    course = Course.objects.get(title="Paid")
    resp = client.patch(f"/api/v1/courses/{course.slug}/", {"pricing_type": "free"}, format="json")
    assert resp.status_code == 200, resp.content
    course.refresh_from_db()
    assert course.price == 0
```

- [ ] **Step 2: Run** — `make test-app APP=tenant_config` then `make test-app APP=courses`. Expected: both new tests FAIL.

- [ ] **Step 3: Implement**

Serializer (same method on the downloads serializer):

```python
def validate(self, attrs):
    pricing_type = attrs.get("pricing_type", getattr(self.instance, "pricing_type", "free"))
    if pricing_type != "paid":
        attrs["price"] = 0
    return attrs
```

Gate:

```python
return (
    Course.objects.filter(pricing_type="paid", price__gt=0).exclude(pk__in=course_demo).exists()
    or DownloadFile.objects.filter(pricing_type="paid", price__gt=0).exclude(pk__in=dl_demo).exists()
)
```

Data migration (courses; mirror for downloads with `DownloadFile`):

```python
def clear_stale_prices(apps, schema_editor):
    apps.get_model("courses", "Course").objects.exclude(pricing_type="paid").update(price=0)


class Migration(migrations.Migration):
    dependencies = [("courses", "<latest>")]
    operations = [migrations.RunPython(clear_stale_prices, migrations.RunPython.noop)]
```

- [ ] **Step 4: Run** — `make test-fresh` once (new migrations), then the two app suites. Expected PASS.
- [ ] **Step 5: Commit** — `fix(courses): free content never keeps a price; gate checks pricing type`

### Task 1.3: The checklist agrees with the gate, and refreshes

Checklist `first_course` counts drafts while the gate needs a published course; `first_blog_post` counts any post while the gate needs an own published one. Separately, setup status is cached in the browser and not refreshed after publishing, saving a course, or editing a page, so counts and the Marketing nav lock stay stale until a full reload.

**Files:**
- Modify: `backend/apps/tenant_config/setup_items.py:194` and `:227` (`compute_setup_state`) — reuse the exact querysets `publish_blockers` uses at `:133-135` and `:155-158`
- Modify: `frontend-customer/src/components/admin/publish-card.tsx:116-126` (publish and unpublish), `frontend-customer/src/components/admin/course-form.tsx:132-172` (after create and update), `frontend-customer/src/components/owner/edit-sidebar.tsx:149-154` (after autosave), the blog editor's publish handler
- Test: `backend/apps/tenant_config/tests/test_setup_status.py`

- [ ] **Step 1: Failing test** — a draft course leaves `first_course` not done; an own *draft* blog post leaves `first_blog_post` not done. Follow the fixture style at `test_setup_status.py:73`.
- [ ] **Step 2: Run** — `make test-app APP=tenant_config`. Expected FAIL.
- [ ] **Step 3: Implement** the two queryset changes. In each frontend handler add `void refreshSetupStatus();` (from `@/lib/setup-assistant`) after the successful write, e.g. `await patchTenant({ is_published: true }); void refreshSetupStatus();`.
- [ ] **Step 4: Verify** — suite passes; in the dev stack, publish and confirm the checklist count and the Marketing sidebar section update without a reload (`make e2e-spec SPEC=27-nav-stage-gating`).
- [ ] **Step 5: Commit** — `fix(setup): checklist uses the gate's rules and refreshes after writes`

### Task 1.4: Wizard token — prefer the 7-day token, clear it from the URL

`frontend-main/src/app/signup/verify/page.tsx:112` is `const resumeToken = token ?? wizardToken;`. The URL token is the 15-minute signup token; after 15 minutes the one-click login on the ready screen and the refine box fail silently. The token also stays in the address bar for the whole wizard.

- [ ] **Step 1:** Change to `const resumeToken = wizardToken ?? token;`.
- [ ] **Step 2:** Right after the wizard token is stored (`:195-199`), add `window.history.replaceState(null, "", "/signup/verify");`.
- [ ] **Step 3: Verify** — `make e2e-spec SPEC=01-signup-onboarding` and `SPEC=19-wizard-recovery`; manually confirm the URL has no `?token=` after verification and a reload resumes the wizard.
- [ ] **Step 4: Commit** — `fix(wizard): use the wizard token for handoff; strip the signup token from the URL`

### Task 1.5: Escape the brand name in emails

`backend/apps/core/onboarding/views.py:64,73` and `recovery.py:37-90,180-200` interpolate `brand_name` into HTML unescaped.

- [ ] **Step 1: Failing test** in `backend/apps/core/tests/test_signup_throttle.py`'s neighbourhood (or the nearest signup test): sign up with brand `<b>x</b>`, read the sink email, assert `&lt;b&gt;x&lt;/b&gt;` is in the HTML and `<b>x</b>` is not.
- [ ] **Step 2:** `from django.utils.html import escape` and wrap every `brand_name` / `name` interpolation in the HTML bodies.
- [ ] **Step 3:** `make test-app APP=core`. Commit — `fix(onboarding): escape coach-supplied text in emails`

### Task 1.6: Site editor "Maximum update depth exceeded"

Thrown from `frontend-customer/src/components/owner/canvas/editor-store.tsx:317` (`updateBlock`) via `blocks-tab.tsx:306` → `block-form.tsx:34` → `field-renderer.tsx:125` while typing in hero fields. Seen under automated typing; not yet reproduced by hand.

- [ ] **Step 1: Reproduce** in `/?edit=1`: paste a long string into the Hero "Subheadline" field, then type quickly. Use superpowers:systematic-debugging; do not patch before the loop is identified.
- [ ] **Step 2:** The likely loop is form `onChange` → store → canvas inline editor effect → store. The fix is whichever side lacks an equality guard: do not dispatch when the incoming value equals the stored one.
- [ ] **Step 3: Verify** — `make e2e-spec SPEC=09-builder`. Commit.

---

## Phase 2 — Remove Turkish; USD + EUR

Do Task 2.0 first and stop if it finds live Turkish data.

### Task 2.0: Prod pre-flight (read-only)

- [ ] Run on prod (Django shell): count `Tenant` with `region="tr"` or `billing_currency="TRY"`; `User` with `region="tr"` or `preferred_locale="tr"`; platform subscriptions in TRY; Connect accounts created with `country="TR"`. Prod was reset to one tenant on 2026-10-04, so all are expected to be 0. **If any is non-zero, stop and report.**
- [ ] In the live Stripe dashboard, note the prices with lookup keys `contentor_starter_try_monthly` and `contentor_pro_try_monthly` and any subscriptions on them.

### Task 2.1: EUR replaces TRY for platform plans

**Files:** `backend/apps/core/constants.py:21-36`; `backend/apps/core/management/commands/seed_plans.py:8-19,65-145`; `backend/config/settings/base.py:446-452,553`; `.env.example:77-96`, `.env.prod.example:100-103`; `backend/apps/billing/views/platform.py:267-285,310-337`; `backend/apps/core/platform/serializers.py:126-131`; `backend/apps/core/models.py:204-207` (comment); new migration for `Tenant.billing_currency` choices; `frontend-customer/src/app/admin/billing/subscription/ChangePlanCard.tsx:29-58`; `frontend-customer/src/lib/api/billing-platform.ts:26`, `frontend-main/src/lib/api/billing-platform.ts:24`; `e2e/specs/27-wizard-domain-purchase.spec.ts:45`; `e2e/helpers/stripe.ts:14-62`.

- [ ] `CURRENCY_EUR = "EUR"`; `CURRENCY_CHOICES = [(USD, "US Dollar"), (EUR, "Euro")]`; delete `CURRENCY_TRY`.
- [ ] `PLAN_AMOUNTS`: starter `{"USD": 1990, "EUR": 1990}`, pro `{"USD": 4990, "EUR": 4990}`. Settings/env: `STRIPE_PRICE_{STARTER,PRO}_EUR` replace the `_TRY` ones. `_SUPPORTED_CURRENCIES = ("USD", "EUR")`. Drop `"TRY"` from `DOMAINS_FX_RATES`.
- [ ] `ChangePlanCard`: `type CurrencyCode = "USD" | "EUR"`; `formatPrice` uses `en-US` for both and shows cents when the amount has them (this also fixes "$19.90" rendering as "$20").
- [ ] Stop `e2e/specs/27…:45` creating a second `Starter` plan row — it is the source of the "$0/mo Starter" card. Reuse the seeded `starter` row. Delete the stray row in dev.
- [ ] **Review Focus 5 test** in `backend/apps/billing/tests/test_platform_checkout.py`: an EUR tenant checking out a plan with no EUR price gets `PRICE_NOT_AVAILABLE`; replace the existing "TR tenant gets TRY price" cases with EUR ones.
- [ ] Update `test_seed_plans.py`, `test_platform_plans_endpoint.py`, `test_stripe_pricing.py`, `test_platform_plan_admin.py`, `domains/tests/test_pricing.py`. `npm run gen:api`.
- [ ] `make seed` in dev (creates the EUR test-mode prices). `make test-app APP=billing`, `APP=core`. Commit — `feat(billing): EUR replaces TRY for platform plans`

### Task 2.2: Currency from country, not region

**Files:** `backend/apps/core/currency.py`; `backend/apps/core/signals.py:28-41`; `backend/apps/core/onboarding/views.py:219,229`; `backend/apps/core/onboarding/wizard.py:265-272`; `backend/apps/billing/views/platform.py:109-126,310-311`; test `backend/apps/core/tests/test_currency.py` (new).

- [ ] **Failing test:**

```python
from apps.core.currency import currency_for_country


def test_currency_for_country():
    assert currency_for_country("DE") == "EUR"
    assert currency_for_country("fr") == "EUR"
    assert currency_for_country("US") == "USD"
    assert currency_for_country("TR") == "USD"
    assert currency_for_country(None) == "USD"
    assert currency_for_country("") == "USD"
```

- [ ] **Implement:**

```python
EUROZONE = frozenset("AT BE BG CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK".split())


def currency_for_country(country_code: str | None) -> str:
    return CURRENCY_EUR if (country_code or "").upper() in EUROZONE else CURRENCY_USD
```

- [ ] At tenant creation (`onboarding/views.py:219,229`) set `billing_currency=currency_for_country(request.META.get("HTTP_CF_IPCOUNTRY"))`. Replace every `REGION_DEFAULT_CURRENCY[...]` use with the stored `billing_currency` (fallback USD); delete the constant and the region half of the pre-save signal, keeping the immutability check.
- [ ] `list_plans` returns the requesting tenant's currency, or `currency_for_country(header)` when anonymous (marketing `/pricing`, wizard before a tenant exists). Fix `frontend-main/src/app/pricing/page.tsx:137-150`, which fetches server-side and therefore loses the visitor's country: forward `CF-IPCountry` from the incoming request headers.
- [ ] `make test-app APP=core`, `APP=billing`. Commit — `feat(billing): tenant currency comes from the coach's country`

### Task 2.3: Students never see TRY

A USD coach's students can see "TRY" today: tenant billing models default to it, the niche seed JSON hard-codes it, and one view falls back to it.

**Files:** `backend/apps/billing/models/core.py:12,60,171` (drop `default="TRY"`); `backend/apps/billing/serializers/bundles.py:99-118` (`currency` read-only, set from `tenant_charge_currency()` on create); `backend/apps/billing/serializers/store.py:10`; `backend/apps/live/views.py:529` (use `tenant_charge_currency()`); `backend/apps/demo_seed/data/{yoga,makeup,belly_dance,pole_dance,fitness,face_yoga,pilates}.json:333,345,358` (delete the `"currency"` keys); `backend/apps/core/demo/seed_template.py:108-110`; `backend/apps/demo_seed/seeding_helpers.py:340,378,664,689`; `backend/apps/billing/views/payments.py:573,588` and `views/webhooks_connect.py:266` (subscription currency = tenant currency, not `plan.currency`); new tenant-schema migration.

- [ ] **Failing tests:** creating a bundle via `POST /api/v1/billing/bundles/` with no currency stores the tenant's currency; a paid live event's public payload reports the tenant's currency.
- [ ] Implement the changes above. Migration: alter the three field defaults, then `RunPython` rewriting `currency="TRY"` to the tenant's `billing_currency` on `SubscriptionPlan`, `Bundle`, `Subscription`, and on `Payment` rows **only where `provider="bypass"`** — real Stripe payments recorded the true charge currency.
- [ ] Update the TRY-hard-coding tests listed in the inventory (`billing/tests/test_bundles.py`, `test_plan_access.py`, `test_payments.py`, `test_store.py`, `test_providers.py`, `core/tests/test_access_service.py`, `tenant_config/tests/test_views.py`, `test_student_bot.py`, `downloads/tests/test_views.py`).
- [ ] `make test-fresh`, then `make test-app APP=billing`. `npm run gen:api`. Commit — `fix(billing): student-facing prices use the tenant currency everywhere`

### Task 2.4: Collapse the Turkish region; ask the coach's country for payouts

**Files:** `backend/apps/core/region_utils.py:21-69`; `backend/apps/core/constants.py:7-12,28-31`; the `tr_` schema / `.tr.` FQDN branches in `backend/apps/core/onboarding/views.py:39-40,127-128,155-161,193-256`, `recovery.py`, `wizard.py:62-65,287-300`, `apps/domains/wizard_views.py:37-50`, `apps/core/tasks.py`, `apps/core/me/views.py`, `apps/billing/providers/bypass_provider.py:71-87`, `apps/billing/views/platform.py:50-78`; `backend/apps/billing/providers/connect.py:69`; `frontend-customer/src/app/admin/payouts/page.tsx`; `seed_plans.py:49-53,169-180`; iyzico: `apps/billing/models/core.py:110-114`, `apps/core/models.py:43`, `apps/core/platform/serializers.py:50`, `frontend-main/src/app/admin/tenants/[slug]/page.tsx:34,154-155`.

- [ ] `resolve_host` returns `REGION_GLOBAL` for every host; delete `REGION_TR`, the `_TR_*` patterns and every `if region == "tr"` branch. `REGION_CHOICES` keeps one entry. The `region` fields, the JWT claim and the `email:global` bucket seed stay untouched (keeps A/B buckets stable).
- [ ] **Connect country.** Today every non-TR coach gets a Stripe Express account with `country="US"`, which is wrong for an EUR coach and cannot be changed after creation. Add a country `<select>` (Stripe's Express-supported countries, default from `CF-IPCountry`) to the Payouts page before "Connect Stripe"; pass it to `create_express_account(tenant=…, country=…)`. Test: the provider call receives the chosen country.
- [ ] Remove the iyzico placeholder: provider choice, `Tenant.iyzico_submerchant_id` (migration), serializer field, superadmin UI field; tests using `provider="iyzico"` switch to `"stripe"`.
- [ ] Update `test_wizard_recovery.py:142`, `accounts/tests/test_wizard_token.py`, `test_admin_backend.py:77`. `make test` (touches `apps/core` runtime code). Commit — `refactor(core): single region; payouts ask for the coach's country`

### Task 2.5: Delete the Turkish locale

**Files:** `frontend-main/messages/tr/` and `frontend-customer/messages/tr/` (delete, ~1,000 keys); `frontend-main/src/i18n/config.ts`, `request.ts`, `middleware.ts`; `frontend-main/src/app/layout.tsx:21-61` (TR metadata, hreflang); `frontend-customer/src/i18n/config.ts`, `request.ts`; `frontend-customer/src/components/shared/language-switcher.tsx` (delete, plus its mounts); `scripts/check-i18n-parity.mjs` and `frontend-main/scripts/check-i18n-parity.mjs` + `Makefile:150`; `Caddyfile:3,45,59`; backend `config/settings/base.py:80,197-205`, `apps/core/constants.py` (`LOCALE_TR`), `apps/core/i18n_helpers.py:18-80`, `apps/core/email.py:153`, `apps/core/onboarding/compose.py:45,86`, `recovery.py:47,75`, `views.py:59-80`, `course_outlines.py:37,74`, `ai_curate.py:58`, `ai_compose.py:159`, `starter_post.py:46`, `wizard_followups.py:61`; `apps/accounts/views.py:~335-360` (locale endpoint); `apps/tenant_config/help_kb.md:15-21,202`; `frontend-main/messages/en/pricing.json:8` (the "your region" copy).

- [ ] Delete the files and branches above. Keep `preferred_locale` / `default_locale` columns with the single choice `en`.
- [ ] **Review Focus 4:** migration setting `preferred_locale` and `default_locale` to `"en"` where they are `"tr"`; test that a user row with `preferred_locale="tr"` (inserted with `.update()`) gets an English response from the magic-link email path, and that a `user-locale=tr` cookie renders English in `frontend-customer` (vitest on the `request.ts` resolver).
- [ ] `make lint` (the parity check is gone), `make test`, `make test-frontend`, `make e2e`.
- [ ] Docs: remove TR/TRY/iyzico from `docs/REFERENCE.md`, `docs/GLOSSARY.md`, `docs/PRODUCT.md`, `CLAUDE.md` (the `tr.` locale lines in Architecture and Deploy). Fix `docs/REFERENCE.md:509` (niche templates live in `backend/apps/demo_seed/data/<niche>.json`). `make wiki`.
- [ ] Commit — `refactor: remove the Turkish locale`

### Task 2.6: Stripe and edge (Taha runs these; they change live configuration)

- [ ] `~/ws/home-server/scripts/secrets.sh set contentor STRIPE_PRICE_STARTER_EUR <id>` and `…PRO_EUR <id>` (or let `seed_plans` auto-provision by lookup key on first deploy); remove the two `_TRY` secrets.
- [ ] Archive the two TRY prices in the live Stripe dashboard.
- [ ] Remove the `tr.` DNS record / tunnel ingress, then `./deploy.sh edge`.
- [ ] `make deploy`; verify `/pricing` from an EU and a non-EU IP, and that `tr.contentor.app` no longer resolves to the app.

---

## Phase 3 — Only true statements on a coach's site

### Task 3.1: The no-AI fallback tells no lies

When AI copy is skipped, fails or the shared monthly budget is spent, the site gets the static niche copy: "Certified … instructor with over 12 years of experience" and three invented testimonials, served to anonymous visitors of a published site. "Remove demo content" never touches page copy.

**Files:** `backend/apps/core/onboarding/compose.py:150` (`_about_image_text`), `:167` (`_testimonials`), `:18-71` (`COPY`); `backend/apps/demo_seed/data/*.json` (`CONFIG.landing_sections`: about body ~`:64`, testimonials ~`:71-91`); `frontend-customer/src/lib/blocks/examples.ts:141+` (`NICHE_EXAMPLES`); test `backend/apps/core/tests/test_wizard_compose.py`.

- [ ] **Failing test (Review Focus 3):** build page overrides for each niche with `description="I teach mat Pilates for desk workers."` and AI unavailable. Assert the About body equals the description; assert no page contains a `testimonials` block; assert the serialised pages contain none of `"years of experience"`, `"Certified"`, `"Clara D."`. Second case with an empty description: About body is the neutral sentence below.
- [ ] `_about_image_text`: body = the coach's description if given, else `f"{brand_name} offers {niche_label} classes you can follow from anywhere."`. This also makes the wizard's "we'll use your words across your site" true without AI.
- [ ] `_testimonials` returns nothing; layouts that include a testimonials slot ("Social proof", "Trust builder", "Full tour", "Portrait") simply omit it. Delete the testimonials sections and the credential claims from all eight niche JSON files.
- [ ] `examples.ts`: the testimonial example a coach inserts in the builder becomes an obvious placeholder (quote "Paste a real student quote here.", name "Student name").
- [ ] Reword FAQ sample answers that promise policy the coach has not chosen (e.g. access duration) to neutral wording.
- [ ] `make test-app APP=core`, `APP=demo_seed`, `APP=tenant_config`. Re-run provisioning for `demo-yoga` in dev and prod so the existing tenant loses the fabricated copy. Commit — `fix(onboarding): no invented credentials or testimonials on coach sites`

### Task 3.2: Delete the fake Recent Activity card

- [ ] Delete `frontend-customer/src/components/admin/recent-activity-card.tsx` and its mount at `frontend-customer/src/app/admin/page.tsx:175-179`; let the adoption card take the row. `make typecheck`. Commit — `fix(admin): remove hardcoded sample activity from the dashboard`

### Task 3.3: Dev worker can run AI copy (dev-only)

AI copy was skipped in the walk-through because the Celery worker has no AI provider (`core_ai.available()` → `cli_no_binary`); the Django container does.

- [ ] Add a `logger.warning` when `_compose_pages_with_ai` returns `"skipped"` (`backend/apps/core/tasks.py:~196`) so the reason shows up in the logbook.
- [ ] Give the `celery-worker` service the same AI provider access the `django` service has in `docker-compose.yml`. `make ai-check` from the worker container.

---

## Phase 4 — The free plan says what it is

### Task 4.1: Marketing and pricing copy

**Files:** `frontend-main/messages/en/marketing.json` (hero subtitle and fine print, the "$19" stat, FAQ "Is there really a free plan?" and "How do payments work?"), `frontend-main/messages/en/pricing.json:18,35,60` (fallback prices), `frontend-main/src/app/pricing/page.tsx:62-104`.

- [ ] Hero and FAQ state plainly: free to build your site and teach free classes; selling courses, live classes and payouts to your Stripe start at Starter. One price everywhere: `$19.90` / `€19.90` (replace the "$19" stat and fallbacks). Show the transaction fee (8% Starter, 6% Pro) on the pricing page.
- [ ] `make e2e-spec SPEC=00-smoke`. Commit.

### Task 4.2: The wizard marks what needs Starter

**Files:** `backend/apps/core/onboarding/wizard_catalog.py:19-28` (`GOALS`), `frontend-main/src/app/signup/verify/wizard/steps.tsx:286-354`, `frontend-main/messages/en/wizard.json:71-86`.

- [ ] Add `requires_paid: true` to the goals a free plan cannot do (`sell_courses`, `sell_downloads`, `run_live_classes`) in the catalog payload; `GoalsStep` renders a small "Starter plan" tag on those rows. Selecting them stays allowed. Update `test_wizard_catalog.py`. Commit.

### Task 4.3: Course form and publish gate speak plan, not plumbing

**Files:** `frontend-customer/src/components/admin/course-form.tsx:452-480` (`MonetizeNudge`), `frontend-customer/src/lib/publish-blockers.ts`, `frontend-customer/src/components/admin/publish-card.tsx`.

- [ ] When the tenant is on the free plan (entitlements provider), the nudge under Price reads "Selling needs the Starter plan — you can save this as a draft" and links to `/admin/billing`; on a paid plan without payouts it keeps "set up payouts".
- [ ] The `payouts` blocker on a free plan reads "Paid content needs the Starter plan — upgrade, or make it free" → `/admin/billing`. Add the case to `publish-blockers.test.ts`.
- [ ] Price input shows the tenant currency symbol as a prefix; course list (`admin/courses/page.tsx:~199,~227`) and dashboard revenue (`admin/page.tsx:67`) stop hard-coding `$`. Commit.

### Task 4.4: Billing page and plan lists

**Files:** `frontend-customer/src/app/admin/billing/subscription/ChangePlanCard.tsx:43-58,205,222-258`, `SubscriptionTile.tsx:141,165`, `frontend-customer/messages/en/admin.json:391,408`; `frontend-main/src/app/signup/verify/wizard/ai-logo.tsx:63-74,428-429`, `domain-step.tsx:132-137,360`, `frontend-main/src/lib/domains.ts:116-125`.

- [ ] One `formatPlanPrice(currency, amountCents)` in `packages/shared` used by the billing page, `/pricing`, the wizard's AI-logo door and the domain step; delete the two local copies. Plan names are capitalised at display in all four places; buttons read "Upgrade to Starter".
- [ ] Plan cards list what the plan unlocks, from the plan's own fields: sell paid content, live classes (`is_live_enabled`), AI quotas, custom domain, transaction fee. Lists hide plans that have no price in the viewer's currency (no more "Coming soon in USD" card).
- [ ] Free notice states the limits: "Free plan: 10 students, 1 GB, free content only."
- [ ] `backend/apps/blog/ai.py:382-414`: when `free_grant` applies, report `limit=1` so the blog page says "1 of 1", not "1 of 0". Test in the blog app.
- [ ] `make test-frontend`, `make e2e-spec SPEC=23-wizard-ai-logo`, `SPEC=27-wizard-domain-purchase`. Commit.

### Task 4.5: The public site hides what the coach cannot offer

**Files:** `frontend-customer/src/components/shared/public-header.tsx:152-162,229-243`, `frontend-customer/src/app/(public)/layout.tsx:22-33`.

- [ ] Hide the "Pricing" nav link when the tenant has no active subscription plans (the layout already fetches `/api/v1/billing/plans/`), using the same pattern as the Blog link. Hide the icon-only "Subscribe" link for staff/owner and when there are no plans; give it a visible label in non-compact layouts and a `title` in compact ones.
- [ ] Update `frontend-customer/src/lib/__tests__/navbar.test.ts`; `make e2e-spec SPEC=14-navbar-layouts`. Commit.

---

## Phase 5 — A shorter, cleaner wizard

### Task 5.1: Remove the menu, hero and per-page layout steps

**Files:** `frontend-main/src/lib/wizard/machine.ts:6-12,42-72`; `backend/apps/core/onboarding/wizard_catalog.py` (step order, `:91-122` layouts, finalize defaults `:151`); `frontend-main/src/app/signup/verify/wizard/WizardFlow.tsx:152,348-356,359-544`; `steps.tsx:467-562` (`NavbarStep`, `HeroStep`); `pages-steps.tsx` (delete); `previews.tsx:39-220` (`MiniNavbar`, `MiniHero` — the literal "CTA" lives here; delete); `logo-review-steps.tsx:384-492` (`ReviewStep`); `frontend-main/messages/en/wizard.json` (step copy incl. `:183`); `frontend-main/public/wizard-mockups/<niche>/` (delete `hero-*` and page-layout WebPs, keep `theme-*`); `tools/wizard-mockups/capture.mjs:37-60,183-216`; tests `frontend-main/src/lib/wizard/__tests__/`, `backend/apps/core/tests/test_wizard_catalog.py`, `test_wizard_finalize.py`, `e2e/specs/01-signup-onboarding.spec.ts`.

- [ ] **Failing tests.** Vitest: classic `buildSteps` yields exactly `business.niche, business.describe, [business.followups], business.goals, look.theme, look.font, logo, domain, review`. Backend: finalize with answers lacking `navbar_layout`, `hero_style` and `page_layouts` applies each catalog's first (recommended) option.
- [ ] **Review Focus 1 test** (vitest): given `current_step = "pages.home"` (or `look.navbar`), the flow resumes at the first step not yet answered, not at `steps[0]`. Replace `steps.find(...) ?? steps[0]` at `WizardFlow.tsx:152` accordingly.
- [ ] Implement in both step lists; chapters become business, look, logo, launch.
- [ ] `ReviewStep`: drop the menu, welcome and pages rows; add "Your address — `<slug>.contentor.app`" and the brand name; render only rows whose step exists in the current flow (fixes the content-first variant's edit buttons jumping to the niche step).
- [ ] `make test-frontend`, `make test-app APP=core`, `make e2e-spec SPEC=01-signup-onboarding`, `SPEC=26-content-first-wizard`, `SPEC=19-wizard-recovery`. Commit — `feat(wizard): drop layout steps; recommended defaults applied`

### Task 5.2: Theme previews without the "Wizard Mockups" brand

- [ ] `backend/apps/core/management/commands/seed_wizard_mockup_tenant.py:56-64`: name the scratch tenant "Your Studio". Recapture only `theme-*` per niche with `tools/wizard-mockups/capture.mjs`, **one niche at a time with a `nextjs-customer` restart between** (the full matrix OOM-kills the container). Style the "Recommended" badge as a readable chip (`steps.tsx:390`). Commit the WebPs.

### Task 5.3: Before verification

**Files:** `frontend-main/src/app/signup/signup-form.tsx:110-318`, `frontend-main/src/components/auth/auth-shell.tsx:73-85`, `frontend-main/messages/en/auth.json:9-10,19-20`.

- [ ] Brand step: wrap in `<form onSubmit>` so Enter continues (the contact step at `:278` already does this). Add `autoComplete="off"` and `data-1p-ignore` / `data-lpignore="true"` to the brand input so password managers do not cover the Continue button.
- [ ] Persist `{brand, name, email, step}` in `sessionStorage`; restore on mount.
- [ ] Contact heading "Almost there" → "Where should we send your link?".
- [ ] Check-your-email screen: remove the duplicate eyebrow; add "Resend email" (re-POST `/onboarding/signup/`, throttled 5/min — disable the button for 30 s after use), "Use a different email" (back to the contact step), and a spam-folder hint.
- [ ] Update `e2e/specs/01-signup-onboarding.spec.ts` selectors. Commit.

### Task 5.4: A branded verification email

- [ ] One HTML builder in `backend/apps/core/email.py` (wordmark, heading, button, expiry line, footer; no raw token under "Or copy") used by `onboarding/views.py:84-98` and both emails in `recovery.py`. Text alternative included. Test asserts the button link and escaped brand. Commit.

### Task 5.5: Small step fixes

- [ ] Niche order: "Something else" (`general`) last — sort in `wizard_catalog.catalog_payload` rather than in the alphabetical registry. Update `test_wizard_catalog.py`.
- [ ] Describe step copy: "Optional — leave it blank to skip." (`wizard.json:62-66`).
- [ ] Footer button label while follow-up questions load: "Thinking of a couple of questions…" instead of "Saving…" (`WizardFlow.tsx:573-576`).
- [ ] Anonymous signup rejects a brand whose slug is empty (non-ASCII names) with a clear message, as the authenticated path already does (`onboarding/views.py:38` vs `:156`). Test.
- [ ] Commit.

### Task 5.6: Logo step

**Files:** `packages/shared/src/logo/curated-rank.ts:20-28,54-133`, `frontend-main/src/app/signup/verify/wizard/logo-review-steps.tsx:178-195,306`, `backend/apps/core/curated_logos/views.py:14-40`.

- [ ] Add keyword sets for `pilates` and `general`; when nothing scores for the niche, fall back to the catalog's own niche tag instead of raw catalog order. Unit test: for `pilates`, no mark whose title contains "pregnant", "yoga" or "bodybuilder" ranks in the first 12.
- [ ] Cards show the mark larger and drop the visible catalog title (keep it as `aria-label`). Move the selected-state check badge off the artwork.
- [ ] Opaque-background marks are a catalog data problem: list them and fix via the collect-curated-logos pipeline, separately.
- [ ] `make e2e-spec SPEC=23-wizard-ai-logo`. Commit.

### Task 5.7: Domain step, ready screen, marketing hero

- [ ] `domain-step.tsx:264-283`: one exit, "Skip for now" (records `"later"`).
- [ ] Ready screen (`verify/page.tsx:280-298`, `auth.json:36`): subtitle "You're signed in. Open your site to start adding content." `RevealChat` reads remaining refinements from the server's `reveal_applies_used` instead of always starting at 1 (`reveal-chat.tsx:19,28`); its input uses the standard dark input style.
- [ ] Hero (`frontend-main/src/components/landing/hero-section.tsx:13,35-67`): reduce top padding and the `lg` headline size until the CTA is inside a 1440×723 viewport. Verify with a screenshot at that size.
- [ ] Commit.

---

## Phase 6 — First run in the tenant portal

### Task 6.1: Land in the admin, greeted correctly

- [ ] `backend/apps/accounts/views.py:108-121`: include `created` in the magic-link verify response. `frontend-customer/src/app/(auth)/callback/page.tsx:33,62-66`: toast "Welcome to {brand}" when created, "Welcome back" otherwise.
- [ ] Onboarding handoff (`backend/apps/core/onboarding/views.py:358-378`) sends `next=/admin`, so a new coach lands on the checklist instead of the public home page.
- [ ] Dashboard subtitle (`frontend-customer/src/app/admin/page.tsx:86`): "Here's what's left to get your site live." until published, then the current overview line without "Welcome back".
- [ ] Test for the `created` flag; `make e2e-spec SPEC=01-signup-onboarding`. Commit.

### Task 6.2: Less clutter on screen

- [ ] `install-prompt.tsx:92`: also hide the install banner for staff/owner.
- [ ] `setup-assistant-bubble.tsx:47-90`: sit above the AI assistant pill (which occupies the bottom-right corner on every admin page) instead of underneath it; give the setup panel bottom padding so "Hide the guide" is not covered.
- [ ] Admin uses a neutral UI font: scope `--font-sans` back to the default inside `admin-shell.tsx` so the coach's display font applies to the public site only.
- [ ] `make e2e-spec SPEC=08-pwa`. Commit.

### Task 6.3: Setup guide leads somewhere

**Files:** `frontend-customer/src/components/setup/catalog.ts:40-60`, `frontend-customer/messages/en/admin.json:238-330`, `publish-card.tsx`.

- [ ] Page items open that page **in edit mode** (`/?edit=1`, `/about?edit=1`, …) as `look` already does.
- [ ] One word: "site". "Get your site live"; "Publish your site"; "Your site is live"; "Courses page" (not "Programs page").
- [ ] Commit.

### Task 6.4: Course form polish

- [ ] Remove the duplicate heading (`courses/new/page.tsx:18-21` vs `course-form.tsx:323-328`); add one line of helper text under "Filters"; after creating a course show a toast with the next step ("Course saved as a draft — add lessons, then publish").
- [ ] Image library opens on the tenant's niche (`image-library-dialog.tsx:95-125`, default `query` from `config.niche`).
- [ ] `make e2e-spec SPEC=02-courses`. Commit.

### Task 6.5: The public site looks finished

- [ ] Footer component in `frontend-customer/src/app/(public)/layout.tsx:35-46`: brand, © year, the nav links, `social_links` from tenant config.
- [ ] Per-page titles "`<Page>` · `<Brand>`" and a meta description that falls back to the home hero subheadline when `meta_description` is empty (`frontend-customer/src/app/layout.tsx:79-100`).
- [ ] Hero and image-text blocks render through `next/image` with `sizes` (`components/blocks/hero-block.tsx:96`); add the dev MinIO host to `images.remotePatterns`. `// ponytail:` note — no stored renditions; add an upload-time resize if image cost shows up.
- [ ] Check the one hydration warning seen on the tenant home page in a clean browser profile; fix only if it reproduces without extensions.
- [ ] Commit.

### Task 6.6: Going live is a moment

- [ ] `publish-card.tsx:116-123`: after publishing, open a dialog instead of only a toast: the live link with Copy, "Share install guide", and "Invite your first students". Hide the "Preview password" block once published (`:312-356`). Commit.

---

## Appendix — every finding and where it is fixed

| Finding from the walk-through | Task |
|---|---|
| Publish card empty list / disabled button | 1.1 |
| Free course keeps price, demands payouts | 1.2 |
| Checklist and gate disagree; stale counts and Marketing lock after publish | 1.3 |
| Token stays in URL; one-click login dies after 15 min | 1.4 |
| Unescaped brand name in emails | 1.5 |
| "Maximum update depth exceeded" in the editor | 1.6 |
| TRY, `tr.` site, Turkish translations, iyzico | 2.1–2.6 |
| Raw / duplicate plan names; "$0/mo Starter"; "Coming soon in USD" | 2.1, 4.4 |
| Students see "TRY" on a USD coach's prices | 2.3 |
| All coaches get a US Stripe payout account | 2.4 |
| Invented bio and testimonials on the live site; "your words" unused | 3.1 |
| Fake Recent Activity | 3.2 |
| Free plan cannot sell, undisclosed | 4.1–4.3 |
| Prices disagree ($19 / $19.90 / $20); fee not shown; price "0,00" with no currency | 4.1, 4.3, 4.4 |
| "1 of 0 AI posts" | 4.4 |
| Pricing nav leads to "No plans available"; unlabelled Subscribe icon | 4.5 |
| Nine design screens; previews ignore choices; "Two looks" above three options; "CTA" text | 5.1 |
| "Wizard Mockups" branding; faint Recommended badge | 5.2 |
| Enter does nothing; reload loses input; password manager covers Continue; "Almost there"; check-email screen | 5.3 |
| Unbranded verification email | 5.4 |
| "Something else" mid-list; "you can skip this" with no skip; "Saving…" | 5.5 |
| Off-niche logos, catalog titles, tiny marks | 5.6 |
| Two identical exits on the domain step; ready-screen copy; refine counter; CTA below the fold | 5.7 |
| Subdomain never shown; review is a settings table | 5.1 (address + brand rows) |
| "Welcome back!" on first visit; lands on public home with no guidance | 6.1 |
| Install banner, overlapping floating buttons, serif admin | 6.2 |
| Setup "Home page" step does nothing; app/studio/platform/site; "Programs" | 6.3 |
| Duplicate course heading; "Filters"; off-niche image library; no next step after create | 6.4 |
| No footer, no meta description; 7008px hero images; hydration warning | 6.5 |
| Go-live is a toast; preview password lingers | 6.6 |

**Not in this plan:** the content-first wizard variant beyond shared steps; the paid upgrade and Stripe checkout flow; video upload; live events; mobile widths. None of these were walked. Letting a coach choose their own subdomain is also out: every wizard endpoint resolves the tenant from `slugify(brand_name)`, so it needs its own change.
