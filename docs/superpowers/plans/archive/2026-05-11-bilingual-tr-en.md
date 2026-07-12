# Bilingual Landing + Region Isolation Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Turkish localization across the whole Contentor product with **strict Global/TR isolation**. Region is a first-class concept (set at signup, immutable). Locale is a downstream preference within a region.

**Architecture:** Region resolved from host in a new `RegionResolverMiddleware` before tenant resolution. Tenants live at `<slug>.contentor.app` (Global) or `<slug>.tr.contentor.app` (TR). JWT carries a `region` claim; cross-region requests are rejected and redirected. Billing currency is set per-tenant at first checkout and immutable. Same Plan rows with multi-currency `prices` JSONB.

**Tech Stack:** Next.js 14 App Router, next-intl, TypeScript, Django REST Framework, django-tenants, Traefik v3.2, Stripe, PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-05-11-bilingual-tr-en-design.md`

---

## File Structure

### Backend — new files

| File | Responsibility |
|---|---|
| `backend/apps/core/constants.py` | `RESERVED_SLUGS` set, `REGIONS = ("global","tr")`, region-currency map |
| `backend/apps/core/validators.py` | `validate_tenant_slug`, raised on reserved slugs |
| `backend/apps/core/middleware/region.py` | `RegionResolverMiddleware` — derives region from host, sets `request.region` |
| `backend/apps/core/signals.py` | `pre_save` signal forbidding `Tenant.region` mutation post-creation; calling `validate_tenant_slug` |
| `backend/apps/core/region_utils.py` | `region_apex(region: str, env: str) -> str` for redirect URLs, `region_default_locale`, `region_default_currency` |
| `backend/locale/{en,tr}/LC_MESSAGES/django.po` | Source + TR catalogs |
| `backend/apps/core/templates/emails/{en,tr}/*.html` | Email templates moved into per-locale subdirectory |
| `backend/scripts/check-i18n-parity.py` | CI guard: same keys in both locales |

### Backend — modified files

| File | Change |
|---|---|
| `backend/config/settings/base.py` | Add `LANGUAGES`, `USE_I18N=True`, `LANGUAGE_CODE="en"`, `LOCALE_PATHS`; insert `LocaleMiddleware` **between `SessionMiddleware` and `CommonMiddleware`**; insert `RegionResolverMiddleware` **before `HeaderAwareTenantMiddleware`** |
| `backend/apps/core/models.py` | `Tenant.region`, `Tenant.billing_currency` fields; `clean()` calls `validate_tenant_slug` |
| `backend/apps/core/admin.py` | Filter `Tenant.objects` by superadmin's `accessible_regions`; same for User |
| `backend/apps/core/middleware/tenant.py` | `HeaderAwareTenantMiddleware` reads `request.region` to disambiguate slugs across regions |
| `backend/apps/core/views.py` (tenant-resolution endpoint) | Return `default_locale` alongside existing tenant fields |
| `backend/apps/accounts/models.py` | `User.region`, `User.preferred_locale`; superadmin `accessible_regions` ArrayField |
| `backend/apps/accounts/serializers.py` | Signup serializer reads `request.region`, sets `User.region` + `Tenant.region`; validates slug |
| `backend/apps/accounts/authentication.py` | `TenantJWTAuthentication` rejects token if `claims["region"] != request.region`, returns `403 CROSS_REGION` with `redirect_to` payload |
| `backend/apps/accounts/views.py` | `LoginView` and `SignupView` set `user-locale` cookie on response; new `MeLocaleView` to update preference |
| `backend/apps/accounts/views_oauth.py` | Google OAuth `state` JWT includes `region` |
| `backend/apps/accounts/views_magic_link.py` | Magic-link email targets the user's region apex; token carries `region` |
| `backend/apps/accounts/backends.py` | `AdminJWTBackend` enforces `accessible_regions` |
| `backend/apps/tenant_config/models.py` | `default_locale` field |
| `backend/apps/tenant_config/serializers.py` | Expose `default_locale` |
| `backend/apps/tenant_config/views.py` | Coach can PATCH `default_locale` |
| `backend/apps/billing/models/core.py` | `Plan.prices` JSONB + `Plan.get_price(currency)`; existing single-currency cols nullable |
| `backend/apps/billing/serializers.py` | Use `Plan.get_price()` and `Tenant.billing_currency` |
| `backend/apps/billing/views.py` (checkout endpoint) | Pick `stripe_price_id` from `tenant.billing_currency` (set it from `region` if NULL) |
| `backend/apps/billing/management/commands/seed_plans.py` | Write both USD + TRY prices from env vars |
| `backend/apps/core/email.py` | `send_email(..., locale=None)` — locale falls back to recipient preference; templates resolved per locale |
| `backend/apps/core/migrations/00XX_region.py` | Add `Tenant.region` (default `"global"`), `billing_currency` |
| `backend/apps/accounts/migrations/00XX_user_region_locale.py` | Add `User.region` (default `"global"`), `preferred_locale`, admin `accessible_regions` |
| `backend/apps/tenant_config/migrations/00XX_default_locale.py` | Add `default_locale` |
| `backend/apps/billing/migrations/00XX_plan_prices.py` | Add `prices` JSONB + data migration backfilling from legacy cols |

### Frontend-main — new/modified files

| File | Change |
|---|---|
| `frontend-main/package.json` | Add `next-intl` |
| `frontend-main/middleware.ts` | New — derive region+locale from host; expose via `x-region` / `x-locale` headers |
| `frontend-main/src/i18n/config.ts` | `regions`, `locales`, `hostMap(host) -> {region, locale, apex, otherApex}` |
| `frontend-main/src/i18n/request.ts` | `getRequestConfig` for next-intl reading `x-locale` |
| `frontend-main/messages/{en,tr}/{marketing,pricing,auth}.json` | Catalogs |
| `frontend-main/src/app/layout.tsx` | `NextIntlClientProvider`; `<html lang>`; hreflang `<link>` tags |
| `frontend-main/src/app/page.tsx` | Translations |
| `frontend-main/src/app/pricing/page.tsx` | Translations; TRY/USD formatting from region; **placeholder "Pricing coming soon" if `Plan.prices[currency]` missing** |
| `frontend-main/src/app/signup/page.tsx` | Translations; POST `region` (derived) + `locale` to backend |
| `frontend-main/src/app/(auth)/**/*.tsx` | Translations |
| `frontend-main/src/app/admin/**` | **AUDIT in Phase 1** — confirm what this is (likely superadmin) and decide whether it's in scope |
| `frontend-main/src/components/footer.tsx` | Language switcher = cross-region anchor, preserves path |
| `frontend-main/src/components/region-banner.tsx` | New: optional banner if user lands on the wrong region apex (e.g., TR user lands on Global) — recommends switching |
| `frontend-main/src/app/sitemap.ts` | Per-host sitemap with xhtml:link alternates |
| `frontend-main/src/app/manifest.ts` | Localized name/short_name |
| `frontend-main/src/lib/format.ts` | `formatCurrency(cents, currency, locale)` |

### Frontend-customer — new/modified files

| File | Change |
|---|---|
| `frontend-customer/package.json` | Add `next-intl` |
| `frontend-customer/middleware.ts` | Extend: derive region+slug from host; read `user-locale` cookie; fetch `default_locale` from existing tenant-resolution endpoint (no Redis, zero extra round trips); catch `CROSS_REGION` API response → 302 to correct region apex |
| `frontend-customer/src/i18n/{config,request}.ts` | Locale resolver: `user.preferred_locale || cookie.user-locale || tenant.default_locale || region default` |
| `frontend-customer/messages/{en,tr}/{admin,student,public,auth}.json` | Catalogs |
| `frontend-customer/src/app/layout.tsx` | `NextIntlClientProvider`; `<html lang>` |
| `frontend-customer/src/app/admin/**/*.tsx` | Translations |
| `frontend-customer/src/app/(student)/**/*.tsx` | Translations |
| `frontend-customer/src/app/(public)/**/*.tsx` | Translations |
| `frontend-customer/src/app/(auth)/**/*.tsx` | Translations |
| `frontend-customer/src/app/admin/settings/page.tsx` | UI to set `tenant_config.default_locale` |
| `frontend-customer/src/components/language-switcher.tsx` | POST `/api/v1/me/locale`, set `user-locale` cookie via server response, reload |
| `frontend-customer/src/lib/format.ts` | Shared formatters |
| `frontend-customer/src/lib/api/me.ts` | `updateLocale(locale)` |

### Infrastructure — modified files

| File | Change |
|---|---|
| `contentor/docker-compose.yml` | `nextjs-main` claims `localhost`, `contentor.localhost`, `tr.localhost`, `tr.contentor.localhost` (priority 2). `nextjs-customer` keeps `HostRegexp(.+)` priority 1. |
| `contentor/traefik/dynamic/*.yml` (prod) | Add `tr.contentor.app` + wildcard for `*.tr.contentor.app` |
| `contentor/Makefile` | Document the new hosts; add `make seed-plans-prices` helper |
| `contentor/.env.example` | `STRIPE_PRICE_{PLAN}_{CURRENCY}` env vars |
| `frontend-main/next.config.mjs`, `frontend-customer/next.config.mjs` | Add `tr.contentor.app` and `*.tr.contentor.app` to allowed hosts / image domains |

---

## Phases

7 phases. Each is independently mergeable and produces a working state. **Stop after each, run `make dev`, verify, continue.**

### Phase 0 — Region foundation (no UI change, no DNS change)

Goal: introduce `region` everywhere in the data model and middleware, with all existing data backfilled to `"global"`. Cross-region rejection is wired but trivially holds (only one region exists in DB).

- [ ] Create `apps/core/constants.py` with `RESERVED_SLUGS`, `REGIONS`, region→currency, region→default-locale maps
- [ ] Create `apps/core/validators.py` with `validate_tenant_slug`
- [ ] Create `apps/core/middleware/region.py` — `RegionResolverMiddleware` parsing `request.get_host()` per the regex in the spec; sets `request.region` and `request.tenant_slug`
- [ ] Insert `RegionResolverMiddleware` **before** `HeaderAwareTenantMiddleware` in `MIDDLEWARE`
- [ ] Update `HeaderAwareTenantMiddleware` to use `request.tenant_slug` (set by region middleware) rather than re-parsing the host
- [ ] Add `Tenant.region`, `Tenant.billing_currency` fields; `Tenant.clean()` calls `validate_tenant_slug`
- [ ] Add `pre_save` signal in `apps/core/signals.py` that (a) re-validates slug, (b) blocks `region` mutation if the row already exists
- [ ] Data migration: `Tenant.objects.update(region="global")` for all existing rows
- [ ] Add `User.region`, `User.preferred_locale` fields; data migration sets `region="global"` for all existing users
- [ ] Add `accessible_regions` ArrayField to the superadmin model; data migration sets `["global"]` for all existing superadmins
- [ ] Update `TenantJWTAuthentication` to embed `region` in newly issued JWTs (validation comes in Phase 1)
- [ ] Update Django admin: filter `Tenant.objects` and `User.objects` by `request.user.accessible_regions`
- [ ] Add unit tests:
  - `Tenant.clean()` rejects `slug="tr"`
  - `pre_save` blocks `region` change
  - Superadmin with `accessible_regions=["global"]` cannot see TR tenants in admin
- [ ] `make migrate && make test && make dev`
- [ ] Verify `curl -H "Host: localhost" http://localhost/api/v1/health/` still works and `request.region == "global"` in logs

### Phase 1 — Routing + cross-region enforcement (no translation yet)

Goal: `tr.localhost`, `tr.contentor.localhost`, and `<slug>.tr.contentor.localhost` all resolve and route correctly. Cross-region JWTs are rejected. Pages still display in English.

- [ ] Update `nextjs-main` Traefik label in `docker-compose.yml`:
      `Host(\`contentor.localhost\`) || Host(\`localhost\`) || Host(\`tr.localhost\`) || Host(\`tr.contentor.localhost\`)`
- [ ] Verify priority 2 actually wins over `HostRegexp(.+)` priority 1 by curl (don't trust documentation alone)
- [ ] Add equivalent prod rules in `traefik/dynamic/` for `tr.contentor.app` + `*.tr.contentor.app`
- [ ] Update `LANGUAGES`, `USE_I18N=True`, `LANGUAGE_CODE="en"`, `LOCALE_PATHS` in `config/settings/base.py`
- [ ] Insert `django.middleware.locale.LocaleMiddleware` **between `SessionMiddleware` and `CommonMiddleware`** (exact slot per Django docs)
- [ ] Update `TenantJWTAuthentication`:
  - Reject token if `claims["region"] != request.region`
  - Return `403` with body `{"error": "CROSS_REGION", "redirect_to": "<correct region apex>"}`
- [ ] Implement `region_apex(region, env)` helper for redirect URLs
- [ ] Add Django integration test: log in as Global user, request `tr.localhost/api/v1/me/`, expect 403 with redirect_to
- [ ] Add integration test for slug disambiguation: a `yoga` Tenant in `region=global` and a `yoga` Tenant in `region=tr` resolve to different schemas
- [ ] Both Next.js apps: add `tr.contentor.app`, `*.tr.contentor.app`, `tr.localhost`, etc. to `images.domains` / `headers` allow-list in `next.config.mjs`
- [ ] `make dev` and verify:
  - `curl -H "Host: tr.localhost" http://localhost/` returns the landing page (still in English)
  - `curl -H "Host: yoga.tr.contentor.localhost" http://localhost/` routes to `nextjs-customer`
  - Cross-region JWT returns 403 with redirect payload
  - Existing `<slug>.contentor.localhost` still works unchanged

### Phase 2 — Marketing translation + cross-region UX

Goal: Marketing pages render in Turkish on `tr.*` hosts. Footer language switcher does a cross-region jump. Pricing page handles missing-currency gracefully.

- [ ] **Audit** `frontend-main/src/app/admin/` — establish what this is (superadmin? legacy?); decide whether to translate or leave English-only. Document in PR.
- [ ] **Spike**: in a throwaway branch, prove `next-intl` middleware works with `localePrefix: "never"` and host-derived locale. Don't merge until the pattern compiles + types pass.
- [ ] `cd frontend-main && npm install next-intl`
- [ ] Create `src/i18n/config.ts` (`hostMap` returns `{region, locale, apex, otherApex}`)
- [ ] Create `middleware.ts` reading host → setting `x-region` and `x-locale` response headers
- [ ] Create `src/i18n/request.ts` for `getRequestConfig`
- [ ] Create catalogs `messages/en/{marketing,pricing,auth}.json` from existing hardcoded strings
- [ ] Create TR translations `messages/tr/{marketing,pricing,auth}.json`
- [ ] Wrap root layout in `NextIntlClientProvider`; `<html lang={locale}>`; hreflang `<link>`s including `x-default`
- [ ] Replace hardcoded strings in `page.tsx`, `pricing/page.tsx`, `signup/page.tsx`, `(auth)/**/*.tsx`
- [ ] Build `Footer` language switcher: anchor to `otherApex + currentPath`
- [ ] Build `RegionBanner` (optional): shown on Global if browser hints TR (using `Accept-Language` header server-side only), offering a switch link. No automatic redirect.
- [ ] **Pricing safety**: on TR, if `Plan.get_price("TRY")` returns null for a tier, render "Türkiye için fiyatlandırma yakında" placeholder. Do NOT show USD on TR domain.
- [ ] Update `sitemap.ts`, `manifest.ts` to be locale/region-aware
- [ ] Add `lib/format.ts` with `formatCurrency`
- [ ] `make dev`; visit `http://localhost/`, `http://tr.localhost/`, `http://contentor.localhost/pricing`, `http://tr.contentor.localhost/pricing`; confirm copy + pricing-placeholder behaviour
- [ ] `npm run build` in `frontend-main` — zero missing-translation warnings

### Phase 3 — Backend locale wiring + emails

Goal: Django responds in the right language. Emails sent during signup/magic-link are localized.

- [ ] Move existing email templates to `apps/core/templates/emails/en/`
- [ ] Author TR templates in `apps/core/templates/emails/tr/`
- [ ] Update `apps.core.email.send_email()` to accept `locale: str | None = None`; fall back to recipient's `preferred_locale` then their tenant's `default_locale` then region default
- [ ] Wrap user-facing DRF error strings with `gettext_lazy` (signup, billing, magic-link, OAuth)
- [ ] Generate catalogs: `django-admin makemessages -l tr`
- [ ] Translate TR strings in `backend/locale/tr/LC_MESSAGES/django.po`
- [ ] Compile: `django-admin compilemessages`
- [ ] Both Next.js apps: add `Accept-Language` header to the existing server-side fetch helper (alongside `X-Tenant-Domain`)
- [ ] Add test: 400 from `/api/v1/signup/` with `Accept-Language: tr` returns Turkish error
- [ ] Add test: magic-link to a `region=tr` user sends Turkish email with `tr.contentor.app` callback URL

### Phase 4 — Coach dashboard + student portal translation

Goal: `frontend-customer` resolves locale per request and renders translated UI in `/admin/*`, `(student)/*`, `(public)/*`, `(auth)/*`. Language switcher writes both DB preference and cookie.

- [ ] Add `TenantConfig.default_locale` field + migration (default from `Tenant.region`)
- [ ] Extend tenant-resolution endpoint (existing) to include `default_locale` in its response — **avoids a separate cache layer**
- [ ] Add `POST /api/v1/me/locale` endpoint that updates `User.preferred_locale` and sets a readable `user-locale` cookie on the response (`Path=/`, no `Domain`, `SameSite=Lax`, 1y)
- [ ] Add the same cookie set on `LoginView` and `SignupView` response — solves the "read JWT in edge middleware" problem
- [ ] `cd frontend-customer && npm install next-intl`
- [ ] Create `src/i18n/{config,request}.ts` with resolver `user.preferred_locale || cookie || tenant.default_locale || region default`
- [ ] Extend `middleware.ts`:
  - Derive region+slug from host
  - Read `user-locale` cookie directly (no JWT decode)
  - Tenant config (incl. `default_locale`) comes from the existing tenant-resolution call
  - Catch `CROSS_REGION` API response → 302 to `redirect_to` apex
- [ ] Create catalogs `messages/{en,tr}/{admin,student,public,auth}.json`
- [ ] Wrap root layout in `NextIntlClientProvider`; `<html lang>`
- [ ] Replace hardcoded strings across `admin/`, `(student)/`, `(public)/`, `(auth)/`
- [ ] Coach setting at `admin/settings/` for `default_locale` (under "Language & region")
- [ ] `LanguageSwitcher` component: calls `POST /api/v1/me/locale`, then `router.refresh()`
- [ ] Place switcher in user menu and (separately) on the public student/login pages for unauthenticated users — unauthenticated path writes cookie only
- [ ] `make dev`; create a TR-region tenant, log in as student, confirm Turkish UI; toggle EN via switcher → cookie wins; sign out → cookie persists; log in as different user → preference loads from `User.preferred_locale`
- [ ] `npm run build` in `frontend-customer` — clean

### Phase 5 — Multi-currency Stripe, immutable per tenant

Goal: Currency is locked to the tenant at first checkout and never changes for that tenant. Same `Plan` rows, region-correct `stripe_price_id`.

- [ ] Add `Plan.prices` JSONB via migration; data migration backfills `{"USD": {"amount_cents": ..., "stripe_price_id": legacy}}`
- [ ] Make legacy `price_cents` / `stripe_price_id` nullable (drop in follow-up release)
- [ ] Add `Plan.get_price(currency)` accessor; require all callers to use it
- [ ] Update checkout endpoint:
  - If `tenant.billing_currency` is set, use it
  - Else derive from `tenant.region` and **persist** it on `Tenant` (cannot change after this point)
  - Reject with `400 PRICE_NOT_AVAILABLE` if `Plan.get_price(currency)` returns None
- [ ] Stripe Customer is created with `metadata={"region": ..., "tenant_id": ...}`
- [ ] Update `seed_plans` to write both currencies from env (`STRIPE_PRICE_STARTER_USD`, `STRIPE_PRICE_STARTER_TRY`, etc.)
- [ ] Provision TRY test-mode Price IDs in Stripe dashboard; document in `.env.example`
- [ ] Frontend pricing pages consume new shape via the existing API
- [ ] Backend test: checkout for a `region=tr` tenant produces a session with the TRY Price ID; for `region=global`, USD
- [ ] Backend test: existing `region=global` tenant cannot get a TRY checkout even if `Accept-Language: tr` (currency locked once set)
- [ ] `make migrate && make seed && make dev`; smoke-test both checkout flows

### Phase 6 — Auth flow region+locale preservation + polish + CI guards

Goal: A user signing up on `tr.contentor.app` lands in a TR tenant with TR-localized UI, TR email, TR pricing. All cross-region edges handled. CI catches translation drift.

- [ ] `frontend-main/signup` POSTs `{region, locale}` to backend (region derived from host server-side, locale = region default unless user changed via switcher)
- [ ] `SignupView` sets `User.region`, `Tenant.region`, `User.preferred_locale`, `TenantConfig.default_locale`
- [ ] Magic-link request endpoint accepts `region` from request, embeds in signed token, sends email rendered in token's locale, with link to token's region apex
- [ ] Magic-link callback verifies token region matches request region; mismatch → redirect to correct apex
- [ ] Google OAuth `state` JWT carries `region`, `tenant_slug`, `next_path`, `locale`; callback uses `state.region` (not Host) for tenant resolution since Google forces `localhost`/`contentor.app` callback
- [ ] Post-login redirect lands on the user's region apex (`<slug>.tr.contentor.app` for TR, `<slug>.contentor.app` for Global)
- [ ] OG meta in `frontend-main`: localized `og:title`, `og:description`, `og:locale = en_US | tr_TR`
- [ ] Add `backend/scripts/check-i18n-parity.py` and `frontend-{main,customer}/scripts/check-i18n-parity.ts`; wire into `make lint` and pre-commit
- [ ] Playwright e2e: sign up on `tr.localhost` → land on `<slug>.tr.contentor.localhost` with TR UI; toggle EN; check email language; check pricing currency
- [ ] Run `make test && make lint`
- [ ] Update root `contentor/CLAUDE.md` with region resolution rules and the new domain pattern
- [ ] Update memory file `reference_multitenancy_patterns.md` with the region-isolation rules (after PR merges)

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Existing tenant has slug `tr` | Pre-Phase-0 query: `Tenant.objects.filter(schema_name__in=RESERVED_SLUGS).exists()`. Rename if found. |
| `HostRegexp(.+)` priority 1 captures `tr.localhost` before explicit Host rule | Priority 2 wins, but verify with `curl` after each Traefik change, not by trust |
| Django superadmin can still see TR tenants | Three layers of enforcement: admin queryset override, `accessible_regions` check on view, signal blocking creation of wrong-region rows by mismatched superadmin |
| JWT region claim could be forged | JWT is signed with `SECRET_KEY`; tampering invalidates the signature. Validated server-side on every request via `TenantJWTAuthentication`. |
| Cookie scoped to `.contentor.app` leaks TR session to Global host | Authorization is by JWT `region` claim, not cookie scope. The transport leak is intentional (so we can render a "go back to TR" redirect) but rejected at the auth layer. |
| Tenant config Redis cache (if added later) stale after locale change | We don't add a cache layer in this plan — the field is on the tenant-resolution response. If a cache is added later, bust on `TenantConfig.save()` signal. |
| Server/client locale mismatch causing React hydration error | Locale rendered server-side from middleware-set header; client provider receives it via props, never reads `navigator.language`. |
| Translation drift between EN and TR | CI parity check (Phase 6). |
| `Accept-Language` dropped by Traefik | Traefik passes all headers by default; Phase 3 test confirms. |
| Phase 2 ships pricing before Phase 5 | Phase 2 explicitly handles missing currency with a placeholder; never shows USD on `tr.*`. |
| Existing Global tenant attempts TR checkout | Backend rejects 400 PRICE_NOT_AVAILABLE because `tenant.billing_currency=USD` is set; UI hides upgrade button |
| `next-intl` with `localePrefix: "never"` is unusual | Phase 2 starts with a spike to confirm. Fallback if it fails: a thin custom i18n adapter — `next-intl` is replaceable. |
| Stripe currency is locked at Customer level | Plan handles this: tenant gets one currency forever. If we ever need to support cross-region migration, that's a Stripe Connect / new-customer migration project. |

## Rollback Plan

Each phase is individually reversible:
- Phase 0: drop `region` columns (data migration → no-op since all default `"global"`). Region middleware can be removed; existing tenant resolution still works.
- Phase 1: revert Traefik label; remove `LocaleMiddleware`; remove region claim check in JWT auth.
- Phase 2: delete `messages/tr/*` and revert page files. EN still works.
- Phase 3: remove `Accept-Language` propagation; Django responds in English.
- Phase 4: feature-flag locale resolution so it always returns `"en"` until ready.
- Phase 5: keep legacy `price_cents` populated. Serializer can fall back. Drop `prices` JSONB only after one stable release.
- Phase 6: remove `region` plumbing from auth views; defaults to `"global"`.

## Validation Checklist (after Phase 6)

- [ ] `make dev`; visit each of `http://localhost/`, `http://tr.localhost/`, `http://contentor.localhost/`, `http://tr.contentor.localhost/`, `http://<slug>.contentor.localhost/`, `http://<slug>.tr.contentor.localhost/` — each renders correctly
- [ ] Signup on `tr.localhost` creates `Tenant(region="tr", default_locale="tr")` and `User(region="tr", preferred_locale="tr")`
- [ ] Cross-region login: Global user trying `tr.contentor.app/login` → 403 + redirect to `contentor.app/login`
- [ ] Coach can flip `default_locale` in admin settings; student portal reflects change
- [ ] Student override via language switcher persists across reloads
- [ ] Pricing: TRY on `tr.*`, USD on default; missing-currency tier shows placeholder
- [ ] Stripe Checkout uses region-correct Price ID; `Tenant.billing_currency` is set after first checkout and immutable thereafter
- [ ] Existing Global tenant cannot accidentally start a TRY subscription
- [ ] Magic-link email is in Turkish for TR signups with `tr.contentor.app` link
- [ ] Google OAuth from TR landing returns to `tr.contentor.app`
- [ ] Superadmin with `accessible_regions=["global"]` does NOT see TR tenants in Django admin
- [ ] CI parity check fails on a missing key in either locale
- [ ] Lighthouse: `<html lang>` correct, hreflang tags present, no missing-translation warnings
- [ ] `make test` passes; `make lint` clean
