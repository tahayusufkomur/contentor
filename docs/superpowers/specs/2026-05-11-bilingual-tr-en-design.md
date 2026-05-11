# Bilingual Landing + Full-Product i18n with Global/TR Region Isolation — Design

**Date**: 2026-05-11
**Status**: Draft

## Summary

Add Turkish localization across the entire Contentor product, with **strict isolation between the Global and TR regions** at every layer: routing, data, auth, billing, and admin.

A tenant is created in exactly one region at signup and stays there forever. The region determines the domain apex, the URL shape, the billing currency, the locale, and which superadmins can see the tenant.

| | English / Global | Turkish / TR |
|---|---|---|
| Apex (dev) | `localhost`, `contentor.localhost` | `tr.localhost`, `tr.contentor.localhost` |
| Apex (prod) | `contentor.app` | `tr.contentor.app` |
| Tenant subdomain (dev) | `<slug>.contentor.localhost` | `<slug>.tr.contentor.localhost` |
| Tenant subdomain (prod) | `<slug>.contentor.app` | `<slug>.tr.contentor.app` |
| Default locale | `en` | `tr` |
| Currency | USD | TRY |
| Stripe customer metadata | `region=global` | `region=tr` |

Scope (full product):
1. Marketing site (`frontend-main`) — region from host, locale derived
2. Coach dashboard + student portal (`frontend-customer`) — region from host, locale from user/cookie/tenant
3. Django backend — region-aware querysets, locale-aware error messages and emails
4. Pricing & billing — currency immutable per region
5. Superadmin — region-scoped access

## Region Isolation

Region is the **primary axis of isolation**. Locale is a secondary, user-tweakable preference *within* a region.

### What region affects

| Concern | Behaviour |
|---|---|
| Routing | TR tenants live under `*.tr.contentor.app`; Global tenants under `*.contentor.app`. The host alone tells you the region. |
| `Tenant` row | `region` column, set at creation, immutable. Indexed. All public-schema querysets filter by region of the current request. |
| `User` row (public) | `region` column. A user belongs to one region. Cross-region login is rejected (auth-time redirect to correct apex). |
| JWT | Carries `region` claim. Backend rejects token if claim ≠ request region. |
| Cookies | JWT cookie scoped to `.contentor.app` (must reach all subdomains) but **region claim is the source of truth** — the parent-domain scope is a transport choice, not an authorization grant. |
| Billing | `Tenant.billing_currency` set at first Stripe Checkout, equals region currency, immutable. One Stripe account total; customers tagged `metadata.region`. |
| Plans | Same `Plan` rows globally. Region picks which `prices[currency]` entry is shown and which `stripe_price_id` is used. |
| Email | Sender domain and reply-to can differ per region. From-name localized. Resend "from" address can use a region-specific subdomain (`hello@contentor.app` vs `merhaba@tr.contentor.app`) if desired — out of scope for v1, single sender used. |
| Superadmin / Django admin | Superadmin has `accessible_regions: list[str]`. Admin list views filter `Tenant.objects` and `User.objects` accordingly. |
| Slug uniqueness | Per-region. `yoga` can exist as a Global tenant and a TR tenant — they live at different apexes. |

### What region does **not** affect

- The codebase: same Django apps, same Next.js apps. One deployment.
- The PostgreSQL instance: one database, one public schema, schema-per-tenant for tenant data (unchanged).
- Internal Celery/Redis: shared. Tasks carry `region` in their payload when relevant.
- Application logic for tenant-schema apps (`courses`, `downloads`, `live`, etc.): unchanged — those are already isolated by schema.

### Region resolution rules

For every request, region is derived **before** anything else:

```
host = request.host
if host.matches("[^.]+\.tr\.contentor\.app") or host.matches("[^.]+\.tr\.contentor\.localhost"):
    region, tenant_slug = "tr", <slug>     # tenant in TR
elif host.matches("[^.]+\.contentor\.app") or host.matches("[^.]+\.contentor\.localhost"):
    region, tenant_slug = "global", <slug>  # tenant in Global
elif host in ("tr.contentor.app", "tr.contentor.localhost", "tr.localhost"):
    region, tenant_slug = "tr", None        # TR marketing apex
elif host in ("contentor.app", "contentor.localhost", "localhost"):
    region, tenant_slug = "global", None    # Global marketing apex
else:
    raise InvalidHostError
```

This is implemented once in `apps.core.middleware.region.RegionResolverMiddleware` (new) and the resolved region is attached to `request.region`. The existing `HeaderAwareTenantMiddleware` runs **after** region resolution and uses `tenant_slug` to set the schema.

### Cross-region behaviour

- Visiting `contentor.app/login` while logged into a TR tenant → JWT region claim ≠ `global` → 401 → redirect to `tr.contentor.app/login`.
- A Global superadmin opening `/admin` only sees Global tenants. Switching to a TR view requires either (a) being in `accessible_regions=["global","tr"]` or (b) logging into `tr.contentor.app/admin`.
- Signing up on `tr.contentor.app/signup` creates `Tenant(region="tr")`, redirects to `<slug>.tr.contentor.app`. No path through which a TR signup lands a tenant on the Global apex.

## Architecture

```
                              Traefik (host-based routing)
                              ─────────────────────────────
                                          │
                ┌───────────────────────────┴───────────────────────────┐
                │                                                       │
   region=global hosts                                       region=tr hosts
   ─────────────────────                                     ─────────────────────
   localhost                                                  tr.localhost
   contentor.localhost                                        tr.contentor.localhost
   contentor.app                                              tr.contentor.app
   <slug>.contentor.localhost                                 <slug>.tr.contentor.localhost
   <slug>.contentor.app                                       <slug>.tr.contentor.app
                │                                                       │
        marketing host? ─────► nextjs-main             marketing host? ─────► nextjs-main
        tenant host?    ─────► nextjs-customer         tenant host?    ─────► nextjs-customer
                                          │
                                          ▼
                              Django (one instance)
                              ─────────────────────
                              RegionResolverMiddleware  ← reads host, sets request.region
                              HeaderAwareTenantMiddleware ← reads tenant_slug, sets schema
                              SessionMiddleware
                              LocaleMiddleware           ← reads Accept-Language
                              ...
```

### Why subdomain-by-region for tenants (not `tr.<slug>`)

Considered three placements for TR tenants:

| Pattern | Pros | Cons |
|---|---|---|
| `tr.<slug>.contentor.app` | Single apex | Doubles DNS; routing regex must extract slug from middle; coexisting EN/TR variants of the same tenant complicate auth |
| `<slug>.contentor.app` with `region` column | Single apex | Region is invisible from URL; collision if both a Global and TR coach pick the same slug; cookie isolation impossible |
| **`<slug>.tr.contentor.app`** ✓ | Region visible in URL; clean wildcard DNS (`*.contentor.app`, `*.tr.contentor.app`); slug can collide harmlessly across regions; cookie scope choices map to region structure | One more DNS zone to configure |

Chosen: third option. The DNS overhead is one wildcard record.

## Data Model

### `apps.core.Tenant` — new fields

| Field | Type | Default | Description |
|---|---|---|---|
| `region` | `CharField(choices=["global","tr"], max_length=8, db_index=True)` | `"global"` (for data migration) | Set at creation, **immutable**. Enforced in `Tenant.clean()` and a `pre_save` signal. |
| `billing_currency` | `CharField(choices=["USD","TRY"], max_length=3, null=True)` | `NULL` | Set at first successful Stripe Checkout. Mirrors `region` (USD for global, TRY for tr) but stored explicitly so audits don't depend on derived values. |
| `default_locale` | `CharField(choices=["en","tr"], max_length=2)` | `"en"` for global, `"tr"` for tr | Coach-changeable. Defaults from `region`. Lives on `tenant_config` (existing app), not `core.Tenant`. |

### `apps.accounts.User` (public schema) — new fields

| Field | Type | Default | Description |
|---|---|---|---|
| `region` | `CharField(choices=["global","tr"], max_length=8, db_index=True)` | from request region at create time | Immutable. A user belongs to one region. |
| `preferred_locale` | `CharField(choices=["en","tr"], max_length=2, blank=True)` | `""` | Empty → fall back to tenant default. |

### `apps.accounts.AdminUser` (or equivalent superadmin model) — new field

| Field | Type | Default | Description |
|---|---|---|---|
| `accessible_regions` | `ArrayField(CharField, choices=["global","tr"])` | `["global"]` | List of regions the superadmin can view. Most superadmins start as `["global"]`; explicit grants to add TR. |

### `apps.billing.Plan` — multi-currency

| Field | Type | Description |
|---|---|---|
| `prices` | `JSONField` | `{"USD":{"amount_cents":1900,"stripe_price_id":"price_..."},"TRY":{"amount_cents":59900,"stripe_price_id":"price_..."}}` |

Helper on the model: `Plan.get_price(currency: str) -> dict | None`. All callers (serializer, checkout endpoint, pricing page) go through this — switching to a `PlanPrice` join table later becomes a one-place change.

Legacy single-currency columns (`price_cents`, `stripe_price_id`) become nullable, retained for one release.

### `apps.core` — reserved slugs

`RESERVED_SLUGS = {"tr", "www", "app", "mail", "api", "admin", "static", "assets", "cdn", "help", "docs", "blog", "status"}`. `tr` is critical: without it, a Global coach could claim `tr.contentor.app`, hijacking the TR apex.

Enforcement happens at **three** layers (the original plan only had one):
1. Signup serializer (`apps.accounts.serializers`)
2. `Tenant.clean()` method
3. `pre_save` signal on `Tenant` (final defence — fires from Django admin and direct ORM creation alike)

## Locale Resolution

Locale is **secondary** to region. Region is settled first; locale is then resolved within the region.

### Marketing site (`frontend-main`)
- Host determines region.
- Locale = `region` directly (`global → en`, `tr → tr`). No cookie. No `Accept-Language` sniffing.
- Language switcher in footer = a plain `<a>` linking to the alternate region's apex with path preserved. It also performs an explicit `region` change, which forces the user to acknowledge they're crossing a boundary.

### Product surfaces (`frontend-customer`)
- Host determines region and tenant.
- Locale resolution order: `User.preferred_locale` → `user-locale` cookie → `tenant_config.default_locale` → `region default` (`"en"` or `"tr"`).
- The `user-locale` cookie is **set by the Django login response** in a dedicated, readable cookie (`Path=/`, `SameSite=Lax`, scoped per tenant apex, no `Domain` attribute). Edge middleware reads it without decoding the JWT — solves the original "JWT in edge runtime" problem.
- Language switcher writes the cookie via a `POST /api/v1/me/locale` endpoint that also updates `User.preferred_locale`, then reloads.

### Django backend
- `LocaleMiddleware` placed **between `SessionMiddleware` and `CommonMiddleware`** — the exact slot Django requires.
- Activates locale from `Accept-Language` (Next.js sends it on every server-side fetch alongside `X-Tenant-Domain`).
- Applies to: DRF error messages (`gettext_lazy`), transactional email subjects/bodies, the Django admin stays in English regardless (`USE_I18N=True` but admin views opt out via per-view `lang` override if needed).

### `tenant_config.default_locale` lookup performance
- The existing tenant-resolution endpoint that `frontend-customer` middleware already calls is extended to return `default_locale` alongside `tenant_id`, `schema`, etc.
- Zero extra round trips. No Redis or in-memory Map needed in edge middleware.

## Auth & Cross-Region Rejection

### JWT claims
JWT payload gains a `region` claim. Issued by Django at login/signup/refresh. Cannot be modified by the client.

### Middleware check
`apps.accounts.authentication.TenantJWTAuthentication` (existing) gains a region check:
```
if jwt_claims["region"] != request.region:
    raise AuthenticationFailed("CROSS_REGION", redirect_to=region_apex(jwt_claims["region"]))
```
Next.js middleware catches the `CROSS_REGION` response code and 302s the user to the correct apex (preserving path).

### Cookie scope
- JWT cookie: `Domain=.contentor.app`, `Path=/`, `SameSite=Lax`, `Secure`. Reaches Global *and* TR. Authorization is enforced by the `region` claim, not by cookie scope. Setting `Domain=.tr.contentor.app` for TR cookies seems attractive but breaks the marketing→tenant redirect flow on signup (the cookie would not be readable on the TR apex until after the user is already on a tenant subdomain).
- `user-locale` cookie: per-tenant-apex, no `Domain`, `Path=/`. Each tenant gets its own preference; doesn't leak.

### Magic link & OAuth
- Magic-link request carries the request region. The link target is the region's apex. On click, region is re-derived from the URL host and must match the token's `region` claim.
- Google OAuth `state` parameter is a signed JWT carrying `region`, `tenant_slug`, `next_path`, `locale`. Callback resolves region from `state`, not from Host header (Google forces `localhost`/`contentor.app` callback, so we already do this for tenant resolution — `region` joins the existing pattern).

## Billing & Stripe

- Currency is set at **first** Stripe Checkout from the tenant's region. Stored on `Tenant.billing_currency` (so we never have to derive it again, useful for audits).
- All subsequent checkouts and subscription updates for that tenant use the matching `stripe_price_id` from `Plan.prices`. The `Accept-Language` header is **never** used to pick currency for an existing tenant.
- Stripe Customer is created with `metadata = {"region": "global"|"tr", "tenant_id": "..."}`. Helps with reporting and any future split.
- If a TR `Plan.prices` entry is missing for a given plan, the pricing page on TR hides that plan (degrades gracefully) and logs a warning. Backend rejects checkout with `400 PRICE_NOT_AVAILABLE`.

### One Stripe account vs two
v1 uses one Stripe account with region-tagged customers. Splitting later is feasible (Stripe Connect, separate accounts) but currently unnecessary. Documented as a future option.

## SEO

```html
<!-- on contentor.app/pricing -->
<link rel="canonical" href="https://contentor.app/pricing" />
<link rel="alternate" hreflang="en" href="https://contentor.app/pricing" />
<link rel="alternate" hreflang="tr" href="https://tr.contentor.app/pricing" />
<link rel="alternate" hreflang="x-default" href="https://contentor.app/pricing" />
```

Each region serves its own sitemap (`contentor.app/sitemap.xml`, `tr.contentor.app/sitemap.xml`) with `xhtml:link` alternate annotations inside each `<url>` entry. OG tags localized per region (`og:locale = en_US` / `tr_TR`).

## Translation Workflow

JSON catalogs per app, split by namespace:
- `frontend-main/messages/{en,tr}/{marketing,pricing,auth}.json`
- `frontend-customer/messages/{en,tr}/{admin,student,public,auth}.json`
- Django: `backend/locale/{en,tr}/LC_MESSAGES/django.po`
- Emails: `apps/core/templates/emails/{en,tr}/`

CI check (`scripts/check-i18n-parity.ts`) asserts both locales have identical keys per namespace. Fails the build on drift.

## Resolved Decisions

1. **Auth pages on `tr.contentor.app` are fully Turkish.** No cross-domain redirect to EN.
2. **`default_locale` lives in `/admin/settings/`** under "Language & region", alongside tenant branding. Initial value is the region default; coach can change.
3. **Plan price storage: JSONB on `Plan`** with `Plan.get_price()` accessor. Migration to a `PlanPrice` join table later is cheap because access is centralized.
4. **Time-zone formatting: out of scope.** Track as a follow-up.
5. **Tenant URL pattern is `<slug>.<region-apex>`.** Confirmed in "Why subdomain-by-region" above.
6. **JWT carries `region` claim** and the auth class enforces it. Cookie scope is `.contentor.app`; authorization is by claim, not by scope.
7. **`user-locale` cookie set by login response.** Edge middleware reads it without touching the JWT.
8. **`tenant_config.default_locale` returned by the existing tenant-resolution endpoint** — no separate cache layer.

## Out of Scope

- iyzico integration (memory notes scaffolding only — kept as-is).
- A third locale or a third region.
- Region migration (a tenant cannot move from Global to TR).
- RTL languages.
- Localized course content authoring.
- Separate Stripe accounts per region.
- Localized Django admin (admin stays in English).
- Time-zone localization.
