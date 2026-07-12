# Logo Curated Library — Phase 2 Design (Superadmin management)

**Date:** 2026-07-12
**Status:** Design approved, pending plan
**Feature area:** Logo Studio (`frontend-customer`) + Superadmin (`frontend-main`) + `apps.core`

## 1. Overview

Phase 1 (shipped 2026-07-12) built the coach-facing curated-logo gallery reading a
committed static catalog: `frontend-customer/public/logos/logo_meta.json` + PNGs. Adding
or editing a curated logo today requires a dev to commit files and ship a deploy.

Phase 2 gives **superadmin** a full self-serve management UI: add/edit/enable-disable/
reorder curated logos, **including uploading new PNGs from the browser** — no deploy
needed to add a new curated logo. This moves the curated library's live source of truth
from the git-committed static files to a database table + object storage, superadmin-
managed through the existing `apps.adminkit` framework.

### Why not just have the backend write to `public/logos/`?
`frontend-customer/public/` is baked into the Next.js Docker image at build time
(`Dockerfile:41`, `COPY --from=builder /app/public ./public`) with **no volume mount** in
`docker-compose.prod.yml`. Any runtime write there would vanish on the next deploy/restart.
A superadmin-managed library must live in the database + object storage, not the frontend
static folder.

### Goals
- Superadmin can add a new curated logo — title, prompt, tags, an uploaded PNG — entirely
  from the browser, live immediately, no deploy.
- Superadmin can edit/enable/disable/reorder/delete existing curated logos.
- The coach-facing gallery (Phase 1, unchanged in behavior) reads from this new live
  source instead of the static JSON file.
- The git-committed `public/logos/` files are **kept, not deleted** — they become a
  dev-environment mirror of the DB state (see §6), not the live source.
- Ship a **reusable image-upload field type** in adminkit, since none exists today — any
  future model needing image upload benefits without new framework work.

### Non-goals
- No change to the coach-facing "Use this" / "Create your own with AI" flows (Phase 1)
  beyond swapping their data source.
- No drag-and-drop reordering — a plain `position` integer field, matching the existing
  `PlatformKbEntry` admin precedent.
- No tenant-level curated-logo customization — this is one global platform-wide list.
- No automatic prod↔git sync — see §6 for the accepted tradeoff.

## 2. Data model

New model `CuratedLogo`, public schema (`apps.core`, alongside the existing
`PlatformKbEntry` — same "platform-wide reference data" precedent):

| Field       | Type          | Notes                                                    |
|-------------|---------------|-----------------------------------------------------------|
| `title`     | string        | required                                                   |
| `prompt`    | text          | seeds "Design with AI"                                     |
| `tags`      | string        | comma-separated, same format as today's `logo_meta.json`   |
| `position`  | integer       | sort key, default via max+1 on create                      |
| `enabled`   | boolean       | default True; soft-hide without deleting                   |
| `image_key` | string        | object-storage key (see §3) — **not** a `Photo` FK          |

`image_key` is a plain string, not a `Photo` foreign key: `Photo` (`apps.media`) is a
tenant-schema model, and `CuratedLogo` lives in the public schema with no tenant context.
Keeping the image reference as a bare key avoids a cross-schema dependency and keeps the
new adminkit image field generic (see §4) — any future model can have an `image_key`-style
field without needing a `Photo` row at all.

## 3. Storage & upload pipeline

Today's upload pipeline (`apps/core/uploads/views.py`, `build_s3_path`) always prefixes
`tenants/{slug}/...` and rejects any other key (`is_tenant_scoped_key`). Curated logos need
a parallel **platform-owned, non-tenant prefix**: `platform/curated-logos/{uuid}.png`,
reachable only through the new superadmin-only upload endpoint described in §4
(`POST /api/v1/admin/platform-upload/`) — not the existing tenant-scoped presign/complete
pair.

- **Serving:** since these are non-sensitive, publicly-visible catalog assets (not
  per-tenant private content), serve via a **public-read URL** rather than the tenant
  pattern's expiring presigned URLs — avoids every coach's browser re-signing on every
  gallery load. **Open question for planning:** confirm the MinIO (dev) / S3-or-Hetzner
  (prod) bucket can expose a public-read prefix; if not, fall back to presigned GET with
  the frontend catalog fetch re-signing per session (still fine — just an extra hop).

## 4. Superadmin UI (adminkit)

`CuratedLogo` registers with `apps.adminkit` exactly like `PlatformKbEntry` —
`list_display`, `search_fields=("title",)`, `list_filters=("enabled",)`,
`ordering=("position", "id")`, `fields=(...)` — full list/add/edit/delete for free, no
bespoke frontend page.

The new piece: a **generic `image` field type**, since adminkit has none today
(`introspection.py`'s `_field_type()` maps only `m2m/fk/boolean/choice/integer/decimal/
datetime/date/email/url/json/text/string`).

- Backend: a `ModelAdmin` subclass declares which fields are image-typed (explicit
  `image_fields = ("image_key",)` on the admin class, not a naming convention — keeps it
  unambiguous). `_field_type()` gains an `"image"` branch for declared fields.
- A schema-agnostic upload endpoint (new): `POST /api/v1/admin/platform-upload/` —
  presign → browser PUTs to the `platform/...` prefix → complete → returns `{key, url}`.
  Not tied to `Photo`, so any future adminkit model with an image field reuses it as-is.
- Frontend: a new `ImageField` widget in `frontend-main/src/components/admin-kit/
  widgets.tsx` — file picker, calls the upload endpoint, shows a thumbnail preview, stores
  the returned `key` as the form value. Goes through the same generic form-rendering
  pipeline (`model-form.tsx`) every other field type already uses.

## 5. Coach-facing read path

`fetchCuratedCatalog()` (`frontend-customer/src/lib/logo/library-catalog.ts`) currently
does a static `fetch("/logos/logo_meta.json")`. It changes to a real API call:

- New public, unauthenticated endpoint (SHARED_APPS, `@authentication_classes([])` per
  this repo's convention for public endpoints): `GET /api/v1/logos/curated/` — returns
  `enabled=True` rows ordered by `position`, in the same shape Phase 1 already consumes
  (`{title, prompt, tags, imageUrl}` — `image_key` resolved to a servable URL server-side).
- Everything downstream of the fetch (`rankByNiche`, `CuratedGallery`, `StudioEntrance`)
  is **unchanged** — this is a data-source swap, not a behavior change.
- Fail-open unchanged: network/API failure still yields `[]`, same as today.

## 6. Migrating & syncing with the git-committed files

**One-time migration (git → DB):** a Django management command reads the current
`public/logos/logo_meta.json`, uploads each committed PNG into the new `platform/...`
prefix, and creates a `CuratedLogo` row per entry (current catalog order → `position`).
Idempotent — safe to re-run (upsert by filename/title).

**Ongoing dev-only mirror (DB → git), automatic:**
- `docker-compose.yml` (dev only — `docker-compose.prod.yml` untouched): add
  `./frontend-customer/public/logos:/app/logo_sync` to the `django` service's volumes.
  Today Django only mounts `./backend:/app/backend` — confirmed no existing access.
- A new setting `CURATED_LOGO_SYNC_DIR` (set via dev `.env`, unset in prod).
- A `post_save`/`post_delete` signal on `CuratedLogo`, active only when
  `CURATED_LOGO_SYNC_DIR` is set: pulls the image bytes back from MinIO and rewrites
  `public/logos/logo_meta.json` + the changed PNG on disk. Synchronous — edits are
  infrequent (superadmin only) and images are small, no queue needed.
- **Accepted tradeoff:** this is a no-op in prod (setting unset, no mount), so a prod-only
  change won't reach git automatically. That's the explicitly chosen scope.

**Manual on-demand resync (DB → git), for pulling a prod-drifted state down by hand:** a
second management command (`resync_curated_logos_to_repo` or similar) that does the same
export as the signal, runnable any time — e.g. a dev points their local Django at prod's
database (via tunnel) and runs it locally (where the bind mount exists) to pull a fresh
snapshot down into their git checkout to review and commit.

**The existing PNGs and `logo_meta.json` are never deleted** — they remain the migration
seed and the ongoing dev mirror target.

## 7. Error handling

- **Upload failures** (S3 unreachable, oversized, non-PNG): the adminkit image widget
  shows an inline error, leaves the field unset — no `CuratedLogo` row saves with a
  dangling key.
- **Public read endpoint** must never leak `enabled=False` rows — filtered at the
  queryset level; a test asserts a disabled logo never appears in the response.
- **Missing/deleted storage object:** if `image_key` 404s at render time, the coach-facing
  gallery card fails soft (skip the card), not the whole gallery.
- **Platform upload endpoint** requires superadmin auth — a non-superadmin request 403s.

## 8. Testing

- Backend: `CuratedLogo` model/validation, the public curated-logos endpoint (enabled-
  filtering, ordering, unauthenticated access), the platform presign/complete endpoints
  (superadmin-only, 403 for non-superadmin), the migration command (against a fixture copy
  of `logo_meta.json`), the dev-sync signal (mocked `CURATED_LOGO_SYNC_DIR`).
- Frontend: `library-catalog.ts`'s test updates to mock the new endpoint instead of
  `fetch("/logos/logo_meta.json")`. New `ImageField` widget tested consistent with
  whatever pattern adminkit's existing widgets already use (verify before writing, don't
  assume).
- e2e: superadmin adds a curated logo with an uploaded image → toggles enabled → confirms
  it appears in the coach-facing gallery (`e2e/specs/15-logo-studio.spec.ts`-style pattern,
  new numbered spec).

## Open questions for planning (not yet verified — confirm during plan-writing)

- Exact file location of `PlatformKbEntry`'s model definition, to place `CuratedLogo`
  alongside it precisely.
- Whether the storage backend (MinIO dev / S3-or-Hetzner prod) actually supports a
  public-read prefix without extra bucket-policy work; if not, fall back to presigned GET
  per §3.
- Exact shape of the existing adminkit widget test pattern (§8), to match rather than
  invent a new one.
