# Superadmin Platform Console — apps

# Superadmin Platform Console — Backend

The superadmin console is the platform owner's control surface: every coach workspace, every plan, every subscription, every AI dollar spent, all read and written from the **public schema**. Its backend is deliberately split into two halves that answer to different needs:

| Half | Files | Shape |
|---|---|---|
| **Declarative model admin** | `apps/core/admin_panels.py` | ~20 `ModelAdmin` declarations on `platform_site`; the admin-kit generates CRUD/list/action endpoints under `/api/v1/platform-admin/<key>/` |
| **Bespoke aggregate API** | `apps/core/platform/{views,serializers,uploads,urls}.py` | Hand-written `@api_view` endpoints under `/api/v1/platform/…` for dashboards, rollups, plan pricing, and the AI-conversation console |
| (legacy) **Django admin** | `apps/core/admin.py` | The classic `/django-admin/` fallback, region-scoped; not the SPA |

Everything in this module is gated by `IsSuperUser` (`apps/core/permissions.py`) — `request.user.is_authenticated and request.user.is_superuser`. There is no per-object permission layer here; if you are a superuser you see the whole fleet.

## Why two halves?

The admin-kit is excellent at "here is a table, let me filter/edit/act on rows." It is useless at "MRR by currency across tenant schemas." So anything that is *a model with columns* lives in `admin_panels.py`, and anything that is *a computed number or a cross-schema sweep* lives in `platform/views.py`. The two halves overlap deliberately in exactly one place — plan pricing — and share `apps.core.stripe_pricing.apply_amounts` so the grandfathering rules cannot drift between them.

```mermaid
graph LR
    SPA[Superadmin SPA<br/>frontend-main /admin]
    SPA -->|"/api/v1/platform-admin/*"| AK[AdminKitViewSet<br/>generated per registration]
    SPA -->|"/api/v1/platform/*"| BV[platform/views.py<br/>@api_view aggregates]
    AK --> AP[admin_panels.py<br/>ModelAdmin declarations]
    AP --> SP[stripe_pricing.apply_amounts]
    BV --> SP
    BV -->|tenant_context per tenant| TS[(tenant schemas<br/>Payment, UsageEvent)]
    AP --> IMP[accounts.impersonation]
```

## Half 1 — `admin_panels.py`: the registered models

Registration is a decorator on `platform_site` (`apps/adminkit/sites.py`), keyed by `ModelAdmin.key` (defaults to the slugified plural label). `AdminSite.get_urls()` then mints five routes per key: list/create, `meta/`, `actions/<name>/`, `autocomplete/<field>/`, and detail. The frontend renders tables and forms purely from the `meta/` payload, so the declaration *is* the UI contract.

### The capability flags are the real security model

`can_create` / `can_edit` / `can_delete` are not cosmetic. `AdminKitViewSet.create/update/destroy` return **405** when the corresponding flag is false, regardless of what a client POSTs, and `fields = ()` means the generated serializer has no writable fields at all. The audit surfaces in this module lean on both:

```python
class _ReadOnlyAdmin(ModelAdmin):
    fields = ()
    can_create = False
    can_edit = False
    can_delete = False
```

`AiTranscriptAdmin`, `WizardFunnelAdmin`, and the five usage meters subclass it. `PlatformSubscriptionAdmin`, `WebhookEventAdmin`, and `PlatformUserAdmin` set the same flags inline. `PlatformKbEntryAdmin` is the deliberate contrast — a fully writable surface, because its whole point is fixing bot answers without a deploy.

### Two panels are the interesting ones

**`PlatformPlanAdmin`** overrides `perform_create` and `perform_update` to call `_sync_pricing`, which reads the `prices` JSON field (`{"USD": {"amount_cents": 1900}, …}`), falls back to `price_monthly × 100` when there is no USD entry, and hands the map to `apply_amounts`. Free plans return early — a Free coach can never charge. Because `Tenant.plan` is a `PROTECT` FK, `can_delete = False` and the removal path is the `archive` bulk action (`is_active=False`), paired with `restore`.

**`TenantAdmin`** is where the module's sharpest edge lives. `Tenant.plan` is only a **denormalized mirror** of `PlatformSubscription` (a signal writes it back). Editing the mirror alone would leave a tenant on a paid plan with no subscription, so `perform_update` detects a plan change and calls `_sync_platform_subscription` inside `transaction.atomic()` — DRF requests are not atomic, so without the wrapper a rejected grant would leave the plan write committed. That helper:

1. Enters `schema_context("public")` explicitly — `PlatformSubscription` and its `user` FK live there, and `accounts_user` PKs differ per schema, so resolving the owner in whatever schema the request happened to land in would bind the wrong row.
2. Raises `ValidationError` if the tenant has a live Stripe subscription (`provider == PROVIDER_STRIPE` and status active/past-due). Manual edits must never desync billing.
3. For free/no plan, cancels any non-canceled subscription. For a paid plan, `update_or_create`s an `ACTIVE` / `PROVIDER_MANUAL` subscription — the same end-state a Stripe checkout or the bypass provider produces. The `user` FK is `PROTECT` and non-null, so a missing owner account is a `ValidationError`, not an `IntegrityError`.

`TenantAdmin` also sets `can_create = False` / `can_delete = False` (signup provisioning creates, offboarding drops the schema) and excludes `schema_name="public"` from its queryset — a rule repeated in `PlatformSubscriptionAdmin.get_queryset`, `WizardFunnelAdmin.get_queryset`, and every tenant sweep in `views.py`. The public tenant row is infrastructure, not a customer.

### Impersonation hand-offs

Two row actions (`row=True` in `admin_action`) return `{"redirect": url}`, which the frontend follows:

- `TenantAdmin.login_as_admin` → `impersonate_tenant_admin(request, tenant, scope="platform")`
- `PlatformUserAdmin.open_workspace` → resolves the user's owned tenants by `owner_email` first, refusing on 0 or >1 matches with a plain `{"detail": …}` message

Both land in `apps.accounts.impersonation`, which mints a short-lived token, logs the hand-off, and points at `https://<tenant-domain>/impersonate?token=…`. `TenantAdmin.details` uses the same redirect mechanism to jump to the bespoke drill-down page `/admin/tenants/<slug>`.

### The one non-obvious registration trick

`Tenant` is registered **twice** — as `TenantAdmin` and as `WizardFunnelAdmin`. The registry keys on `ModelAdmin.key`, not the model class, so `key = "wizard-funnel"` coexists with the default `tenants` key. The funnel view is a read-only projection over the `wizard_state` JSON written by the onboarding wizard endpoints, with computed columns:

- `current_step` — `wizard_state["current_step"]`
- `answered` — length of `wizard_state["answers"]`
- `last_activity` — `max()` over `wizard_state["step_timestamps"]`; these are `timezone.now().isoformat()` strings, so lexicographic max *is* chronological max

Computed columns are methods on the admin (resolved by `ModelAdmin.get_computed_columns` / `compute_column`) with an optional `short_description` for the header. `WebhookEventAdmin.state` uses the same mechanism to collapse `processed_at` + `processing_error` into `pending`/`processed`/`failed`.

### The usage-meter factory

Five AI spend meters share an identical shape, so they are generated:

```python
_usage_admin("help-bot-usage", HelpBotUsage, "questions", "…")
_usage_admin("student-bot-usage", StudentBotUsage, "questions", "…")
_usage_admin("blog-ai-usage", BlogAiUsage, "generations_used", "…")
_usage_admin("logo-ai-usage", LogoAiUsage, "packs_used", "…")
_usage_admin("onboarding-ai-usage", OnboardingAiUsage, "composes_used", "…")
```

`_usage_admin` defines a `_ReadOnlyAdmin` subclass inside the function and applies `@platform_site.register(model)` to it. Adding a sixth meter is one line — but note that `_ai_feature_rollups` in `views.py` has its own hard-coded four-feature `specs` list (onboarding AI is intentionally absent from the dashboard rollup), so a new meter needs a decision about both places.

### Gallery panels

`CuratedLogoAdmin` and `CuratedPhotoAdmin` set `list_mode = "gallery"` + `gallery_image_field`, plus `image_fields` and `image_upload_prefix`. The kit turns `image_fields` values into `{key, url}` pairs on list rows (`sign_if_s3_key`) and points the frontend widget at `ModelAdmin.image_upload_url`, which defaults to `/api/v1/platform/upload/` — the bridge into the second half of this module. Both use `TagChoiceFilter()` in `list_filters` so the comma-separated `tags` field becomes a counted choice list instead of an exact-match text box.

## Half 2 — `platform/`: the bespoke API

Routed from `config/urls.py` at `api/v1/platform/`. **Ordering matters** there: `platform_email`, `blog.urls_platform`, `logbook.urls_platform`, `mailbox`, and `community` declare narrower `/platform/<sub>/` prefixes *before* `apps.core.platform.urls` is included, so those routes win.

### Cross-schema aggregation

Three functions iterate every active tenant and enter `tenant_context(tenant)` to query tenant-local tables:

- `_marketplace_totals(tenants=None)` — sums `billing.Payment` gross and `platform_fee` per currency, filtering to `status in ("completed", "partially_refunded")` and `platform_subscription__isnull=True` so coaches' own subscription payments don't get counted as marketplace volume. Called both fleet-wide (dashboard) and single-tenant (`_tenant_detail_payload`).
- `platform_usage` — PWA adoption: `usage.UsageEvent` counts by `mode` over the last `days` (clamped 1–365) plus students with a `first_pwa_at`.
- `_platform_mrr` — the exception: `PlatformSubscription` lives in public, so no context switching; it resolves each tenant's charge currency via `tenant_charge_currency` and reads the plan's per-currency price with a USD fallback, reporting `mrr_by_currency` as strings.

The two schema-sweeping helpers wrap each tenant in `try/except Exception` with a `logger.warning` and `continue`. This is intentional and load-bearing (note the `# noqa: BLE001, S112`): **one broken tenant schema must never 500 the superadmin dashboard.** Both carry the same caveat in their docstrings — fine at current fleet size, revisit with a rollup table when tenant count grows. If you add a third sweep, follow the pattern.

Money is serialized as `str(Decimal)`, never a float, throughout.

### Plan pricing endpoints

`platform_plans` (GET/POST) and `platform_plan_detail` (GET/PATCH/DELETE) are the bespoke plan editor, validated by `PlatformPlanCreateSerializer` / `PlatformPlanUpdateSerializer` (both plain `Serializer`s, not ModelSerializers). Three rules are encoded in the serializers:

- **`name` is create-only.** It is the stable key `seed_plans` upserts by and the Stripe `lookup_key` derives from (`contentor_<name.lower()>_<currency>_monthly`). `PlatformPlanCreateSerializer.validate_name` enforces case-insensitive uniqueness; the update serializer simply omits the field.
- **`amounts` is a currency→minor-units map** (`{"USD": 1990, "TRY": 99900}`), validated against `CURRENCY_CHOICES` by the shared `_validate_currency_map`. Each changed entry provisions a *new* immutable Stripe Price and transfers the lookup key onto it — existing subscribers are grandfathered onto the old Price. `apply_amounts` mutates the plan in place, records touched columns on `update_fields`, and leaves `plan.save()` to the caller; it also keeps the legacy whole-unit `price_monthly` in sync with USD.
- **DELETE is soft.** `_archive_plan` sets `is_active=False`, and returns **409** if `plan.tenants.exists()` (the `PROTECT` FK). `PATCH is_active=False` is routed to the same helper so both paths are guarded identically. Note the asymmetry from the admin-kit half: `apply_amounts` runs on PATCH only when `amounts` is truthy **and** the plan is not free.

### `platform_tenant_detail`

The drill-down `TenantAdmin.details` links to. `GET` composes `TenantDetailSerializer` + the current `PlatformSubscription` + the latest `TenantUsage` row + single-tenant `_marketplace_totals`. `PATCH` accepts exactly one field — `is_active` — and no more; anything else must go through the admin-kit panel.

### Webhook debugging

`platform_webhook_events` supports `?status=failed|pending`, a substring `?event_type=`, and a `limit` capped at 500 (default 100, non-numeric input silently falls back). `platform_webhook_event_detail` is the only place the raw `payload` is exposed. The dashboard's `webhook_failures` count uses the same `~Q(processing_error="")` predicate.

### AI spend rollup

`platform_ai_usage` takes `?month=YYYY-MM` (default: current) and returns four things: `_ai_feature_rollups` per feature, top-10 tenants by combined spend, a rating breakdown, and a 7-day question sparkline via `TruncDate`. Two details to preserve:

- `_ai_feature_rollups` compares cumulative monthly spend against each feature's env-configured cap (`HELP_BOT_GLOBAL_MONTHLY_USD`, `STUDENT_BOT_GLOBAL_MONTHLY_USD`, `BLOG_AI_MONTHLY_BUDGET_USD`, `LOGO_AI_MONTHLY_BUDGET_USD`) and reports `kill_switch_tripped`. This **mirrors** the runtime check each feature's own view makes before calling a provider — it does not enforce anything itself. If you change the enforcement rule, change it here too or the dashboard starts lying.
- `is_preview=True` transcripts (coach testing, not real usage) are excluded from the ratings and daily-question aggregates. The `usd_spent` figures come from the usage meters, which count preview spend, so the two sides are not directly comparable.

### The AI-conversation console

Four endpoints implement human takeover of `help_bot` conversations. Scope is enforced by `_help_conversation(pk)`, which filters `feature="help_bot"` — **student-tenant chats are explicitly out of scope for superadmins** (spec D6), and a non-help conversation 404s rather than 403s.

The state machine, with the actual status codes:

| Endpoint | Guard | Effect |
|---|---|---|
| `…/thread/` | — | `maybe_auto_release`, then `assistant.thread_payload(after_id=?after)` for polling |
| `…/takeover/` | already `STATUS_HUMAN` → **409** | sets `STATUS_HUMAN`, `agent_user_id`, `agent_label = "Contentor support"`, clears `human_requested`, appends a `agent_joined:` system message |
| `…/message/` | not `STATUS_HUMAN` → **403**; empty body → **400** | appends an `agent` message (truncated to 2000 chars) |
| `…/release/` | — | back to `STATUS_AI` + `assistant_resumed` system message; idempotent |

Every mutating endpoint calls `assistant.maybe_auto_release(convo)` *before* checking status, so a stale takeover is reaped rather than blocking. Message and thread transport lives in `apps.core.assistant` (`append_message`, `thread_payload`) — shared with the coach-facing side, so don't reimplement it here. Pagination in `platform_ai_conversations` is a fetch-N+1 `has_more` probe (`_CONVO_PAGE = 20`), not DRF pagination.

### `uploads.py` — the platform asset upload

One multipart `POST /api/v1/platform/upload/` → `{key, url}`. It is small and every line is a guard:

- `prefix` must match `^[a-z0-9][a-z0-9-]{0,39}$` (defaults to `images`) — this becomes a path segment, so the regex is the path-traversal defense
- ≤ 5 MB (`MAX_UPLOAD_BYTES`)
- PNG magic bytes checked by reading the first 8 bytes and seeking back — content-type headers are not trusted
- key is `platform/<prefix>/<uuid4hex>.png`; original filenames never reach storage
- `prefix == "curated-logos"` routes the bytes through `clean_curated_png` (strip the white canvas, crop to the mark) so curated art blends into tenant UIs; other prefixes are stored as-is

`_store_object` is also imported directly by the `seed_curated_logos` and `seed_curated_photos` management commands — it is the shared write path, so changing its signature touches those commands too.

## `admin.py` — the legacy Django admin

Separate from the SPA and reachable only at apex `/django-admin/`. Its one non-trivial piece is `RegionScopedAdminMixin`, which filters list views by `request.user.accessible_regions`: superusers see everything, and a user with an empty list sees **nothing** — fail closed. `TenantAdmin` there marks `plan` readonly for the same mirror-vs-subscription reason as the SPA panel, but without the `_sync_platform_subscription` machinery, so it simply refuses the edit rather than half-applying it. Note there is no region scoping in the SPA half — `platform_site` panels show the whole fleet.

## Contributing

**Adding a read-only audit surface:** subclass `_ReadOnlyAdmin`, set `key`/`icon`/`description`/`list_display`/`readonly_fields`, register on `platform_site`. Ensure `key` is unique across the registry — `AdminSite.register` raises `AlreadyRegisteredError` at import time, which surfaces as a startup failure, not a runtime 500.

**Adding an editable panel:** remember that `fields` is the writable set and `readonly_fields` is excluded from it by `get_form_fields`. If a write has side effects, put them in `perform_create` / `perform_update` and wrap multi-write side effects in `transaction.atomic()` — the `TenantAdmin` comment explains why this is not optional.

**Adding an aggregate endpoint:** add to `platform/urls.py`, decorate with `@api_view` + `@permission_classes([IsSuperUser])`, exclude `schema_name="public"` from any tenant queryset, and if you sweep tenant schemas, copy the per-tenant `try/except` + `logger.warning` guard.

**After touching any serializer here,** run `npm run gen:api` in `frontend-customer` and review the `src/types/api-generated.ts` diff — a surprising diff means the SPA contract moved. Tests: `make test-app APP=core`.