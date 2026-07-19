# Curated Photos — platform design-element library for blogs

**Date:** 2026-07-19
**Status:** Approved design, pre-implementation

## Summary

A platform-curated catalog of AI-generated visual assets ("curated photos") that
coaches and the blog AI writer can search and place into blog posts — the
curated-logo model applied to blog imagery. Assets are generated offline by the
superadmin (browser-Gemini pipeline, same as curated logos), stored once in
platform object storage, and materialized into a tenant's `media.Photo` table
on use, so the entire existing photo pipeline (cover FK, image placements,
rendering, serializers) works unchanged.

Decisions made during brainstorming:

- **Platform-curated only** — no per-tenant AI image generation. Quality and
  cost live in the offline collection pipeline.
- **Both consumers** — the coach (editor "Library" picker) and the AI writer
  (curated candidates in `<available_photos>`) use one search surface.
- **Copy-on-use materialization** — picking a curated photo creates a tenant
  `media.Photo` row pointing at the shared platform `s3_key`. No object
  duplication, no downstream schema changes.
- **Broad kind taxonomy, narrow v1 rendering** — six kinds collected and
  searchable from day one; only `hero`/`stock`/`spot` are wired into post
  rendering in v1.

## Data model

New public-schema model `core.CuratedPhoto` (SHARED_APPS), sibling of
`CuratedLogo`:

| Field | Type | Notes |
|---|---|---|
| `title` | CharField(120) | |
| `prompt` | TextField, blank | generation prompt, provenance |
| `tags` | CharField(500), blank | comma-separated, same convention as `CuratedLogo.tags` |
| `alt_text` | CharField(300), blank | copied onto materialized `Photo` rows for accessibility |
| `kind` | CharField, choices | `hero \| stock \| spot \| texture \| divider \| icon` |
| `image_key` | CharField(300) | object storage key under `platform/curated-photos/` |
| `width`, `height` | IntegerField, null | so pickers and AI candidates know aspect |
| `enabled` | BooleanField, default True | soft-disable; storage objects are never deleted |
| `position` | IntegerField | auto-append on create, same `save()` pattern as `CuratedLogo` |
| `created_at`, `updated_at` | auto | |

No `mark_paths`/vector-trace field — photographic kinds don't trace; marks that
need vectors belong in the logo catalog.

Kind semantics:

- `hero` — wide ~16:9 editorial cover images (fills the "AI post with no cover"
  gap on photo-less tenants)
- `stock` — general photographic inline images, mixed aspects
- `spot` — transparent-background flat topical illustrations (logo-mark style,
  themed for content niches)
- `texture` — seamless background patterns (future: blog headers, email, site
  sections)
- `divider` — thin decorative section separators (future render slot)
- `icon` — small symbolic glyphs (future render slot; existing logo marks may
  be backfilled)

Adding a kind later is a choices change + new content — no migration of shape.

## Collection & seeding pipeline

Mirrors curated logos:

- **`photo_meta.json`** catalog file (repo-side source of truth for seeding;
  carries the same fragility as `logo_meta.json` — the seed command MUST keep
  the wipe-guard pattern from `seed_curated_logos`).
- **`seed_curated_photos`** management command: idempotent upsert by
  `image_key`, uploads local files to `platform/curated-photos/`, same shape as
  `seed_curated_logos`.
- **New skill `collect-curated-photos`**, cloned from `collect-curated-logos`,
  with per-kind generation briefs:
  - `hero`: 16:9 premium editorial/stock-photo look per niche
  - `stock`: mixed-aspect photographic
  - `spot`: transparent flat illustration — keeps the white-strip/crop
    normalization step
  - `texture`: seamless tiles; `divider`/`icon`: as applicable
  - Photographic kinds skip transparency normalization and vector tracing
    entirely.
  - Same two-account browser-Gemini rotation and daily-quota alternation.

## APIs

1. **Superadmin platform CRUD** — same pattern as curated logos: list, create,
   update, disable; image upload via the existing `core/platform/uploads.py`
   flow. Exposed in the superadmin panel.
2. **Tenant-facing search** (coach-auth, read-only):
   `GET /api/v1/curated-photos/?kind=<kind>&q=<query>` — matches `title` +
   `tags`, `enabled=True` only; returns id, title, kind, image URL,
   width/height.
3. **Materialize**: `POST /api/v1/curated-photos/{id}/use/` — creates a tenant
   `media.Photo` row with the shared `s3_key`, copying title/alt_text/tags.
   Idempotent per tenant: if a `Photo` with that `s3_key` already exists in the
   tenant schema, return it instead of creating a duplicate. Response is a
   standard Photo payload.

Invariant: curated storage objects are never deleted (rows are disabled
instead), so materialized tenant references can never break.

**Implementation must verify:** the media presign/serving path works for a
`Photo` whose `s3_key` is under the `platform/` prefix (curated-logo serving
already reads that prefix, so the pattern exists).

## Editor UX (frontend-customer)

In the blog editor's image flows, add a **"Library" tab** beside "Upload":

- Search box + kind filter chips + thumbnail grid.
- Cover picker defaults the filter to `hero`; inline insert defaults to
  `stock`/`spot`.
- Selecting a thumbnail calls the materialize endpoint, then proceeds exactly
  as if the returned Photo had been uploaded by the coach.
- All six kinds are searchable, but v1 has no render slot for
  `texture`/`divider`/`icon` — collect broad, render narrow.

## AI writer + autopilot integration

Extend `apps.blog.ai.generate_post`:

- After gathering tenant photos, top up the `<available_photos>` block with
  curated candidates — kinds `hero`/`stock`/`spot` only — selected by cheap
  tag-overlap against the topic (no extra LLM call). Tenant photos take
  priority; the combined list honors the existing `MAX_AVAILABLE_PHOTOS` cap.
- Curated candidate ids are namespaced as `curated:<id>` so they cannot collide
  with tenant Photo UUIDs.
- After the model responds, chosen curated ids are validated against the
  offered set (never-invent-an-id contract unchanged), materialized into tenant
  Photos, and then saved into `cover_photo` / `image_placements` as normal.
- Autopilot inherits this for free: scheduled posts on photo-less tenants now
  ship with covers.

## Out of scope (v1)

- Per-tenant / on-demand AI image generation.
- Render slots for `texture`, `divider`, `icon`.
- Semantic/embedding search (tag + title match first).
- Promoting tenant-generated content into the shared catalog.
- Consuming the catalog outside blog (email campaigns, site sections) — the
  catalog shape deliberately supports this later.

## Testing

- **Backend:** model + seed-command tests mirroring `test_curated_logos`
  (including wipe-guard); search filtering by kind/query/enabled; materialize
  idempotency (same tenant twice → one Photo); AI candidate namespacing and
  invalid-id rejection mirroring `test_ai.py`.
- **Frontend:** vitest coverage for the Library picker (search, kind chips,
  select → materialize call).
- **E2e:** extend the blog spec to pick a library cover in the editor; update
  `e2e/impact-map.json` for the new backend/frontend areas.
