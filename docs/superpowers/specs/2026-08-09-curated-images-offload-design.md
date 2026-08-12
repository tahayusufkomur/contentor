# Curated photo offload to curated-image-api

Status: implemented (2026-08-10). This document was updated to match what was
built; the "as built" notes call out where the shipped shape differs from the
approved design.
Supersedes the catalog-ownership half of `2026-07-19-curated-photos-design.md`
(that spec's copy-on-use and never-break-a-reference rules still hold).

Spans two repositories:

- `contentor` (this repo) — consumer.
- `../curated-image-api` — the catalog service, deployed at `https://image-generation.contentor.app`.

## Why

Contentor currently *is* the curated photo library: 691 PNGs committed to
`frontend-customer/public/curated-photos/`, a `photo_meta.json` beside them, a
`seed_curated_photos` command that pushes them into `platform/curated-photos/`
in the shared bucket, a `CuratedPhoto` table, and four independent consumers
that each re-implement candidate selection over that table.

`curated-image-api` already exists to be exactly this: a quality-controlled
catalog with lexical search over generated metadata and private prompts, an
authenticated ingestion path fed by the generation pipeline, curation/review
UI, and signed short-lived rendition URLs. Contentor should consume it, not
duplicate it.

## The split

**curated-image-api owns the photographic catalog** — metadata, curation,
review state, growth through the generation pipeline, and search relevance.

**Contentor owns no catalog.** It keeps exactly two things:

1. Per-tenant **cached copies** of the images its users actually picked, in
   that tenant's own storage namespace.
2. The 107 **decorative** assets (`spot`, `texture`, `divider`, `icon`) that
   were never stock photography and have no counterpart in a photo API.

Curated *logos* (`CuratedLogo`, Logo Studio, `curated_logos/`) are entirely out
of scope and must not be touched.

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| What moves | 584 `hero` + `stock` rows | Real photography. The 107 decorative PNGs stay local. |
| Retrieval | Live remote search, Redis-cached | Contentor keeps no catalog table; the API's relevance replaces local token scoring. |
| Bucket | Keep sharing `contentor-prod-private` | No new infra. Known coupling, accepted: contentor's S3 credentials can still read catalog objects. |
| Cached rendition | `web` only | It is what renders; one small object per use. |
| `kind` mapping | Collections `coach-heroes` / `coach-stock` | Collections are the API's first-class grouping; keeps contentor taxonomy out of public tags and lexical relevance. |
| Legacy assets | Delete the 584 PNGs and rows; keep the S3 objects | Already-materialized tenant Photos reference `platform/curated-photos/…` keys directly. |
| Dev/e2e | `CURATED_IMAGE_API_FAKE` fixture mode | Keeps e2e offline and deterministic, like `LIVE_FAKE_ENABLED`. |
| Library UI | Prompt-style search + pagination | The catalog will grow well past the current 60-row cap. |
| Cache timing | Synchronous on use | A ~300KB webp round-trip fits inside a click; keeps the `use/` contract. |

## Migration of the existing 584

A one-off, idempotent import script lives in the **API** repo
(`scripts/import-contentor-photos.ts`) and reads contentor's
`frontend-customer/public/curated-photos/` directory:

1. For each `photo_meta.json` entry with `kind` in `{hero, stock}`, generate
   `web.webp` and `thumbnail.webp` with `sharp` (already a dependency),
   preserving aspect ratio. The source PNG is uploaded untouched as
   `original.png` — no lossy re-encode of the master.
2. Upload the three objects to
   `curated-images/contentor-legacy-2026-08/<filename-stem>/{original.png,web.webp,thumbnail.webp}`.
3. `POST /internal/v1/images` with `INGESTION_API_KEY`.

Field mapping:

| `photo_meta.json` | ingestion field |
| --- | --- |
| `title` | `title` |
| `alt_text` | `description` |
| `tags` (comma-separated) | `tags[]` |
| `prompt` | `generation.prompt` (private; participates in search) |
| `kind` | `collection`: `coach-heroes` / `coach-stock` |
| — | `category` = collection slug |
| — | `style` = `editorial photorealistic` |
| — | `generation.model` = `contentor-legacy-import`, `generation.provenance.source` = `contentor-photo-meta` |
| — | `license.code` = `contentor-internal`, `license.rights_status` = `cleared` |
| `filename` | `source_id` — makes re-runs idempotent (`200 idempotent_replay`) |

The script is re-runnable: a retry with the same `source_id` and the same three
object keys replays instead of duplicating. It reports created / replayed /
skipped counts and exits non-zero if any entry fails.

Verification: `/v1/images/search` returns 396 published images in
`coach-heroes` and 188 in `coach-stock`.

## API-side changes (curated-image-api)

Small and additive:

1. **`GET /v1/images/{id}`** — same `X-API-Key` auth, rate limiting, and
   response shape as search (fresh signed rendition URLs). `404` for unknown,
   unpublished, or rejected images alike. Required because caching-on-use
   resolves a single asset long after the search that surfaced it: the blog
   writer picks `curated:<id>` in one Celery task and materializes it in
   another. The `Image` schema splits into `CatalogImage` + `Image` (the latter
   adds `match_score`), because a by-id lookup has nothing to rank.
2. **`query` becomes optional on `POST /v1/images/search`** — a picker UI opens
   before its user has typed anything, and demanding a placeholder query there
   would rank the catalog against a word nobody chose. Omitted or blank means no
   lexical constraint: filters still apply, results come back newest-first. The
   homepage demo route keeps requiring a prompt, so a blank search cannot spend a
   visitor's quota.
3. **Collections** `coach-heroes` and `coach-stock`, published, added to
   `scripts/seed.ts` so deploys reconcile them.
4. Contentor's API key gets a per-minute limit generous enough for onboarding
   and blog-autopilot bursts (a wizard run issues one search per slot group).

No change to ingestion, storage layout, quotas, or the homepage demo contract.

## Contentor: `apps/core/curated_images/`

A new module replacing `curated_photos/` for photography. Files stay small and
single-purpose.

### `client.py`

```python
search(query, *, collection=None, page=1, per_page=24) -> SearchPage
get(asset_id) -> RemoteImage        # GET /v1/images/{id}
```

- Base URL `CURATED_IMAGE_API_URL`, credential `CURATED_IMAGE_API_KEY`.
- Timeouts: 2s connect, 5s read; one retry on connect/5xx.
- Redis cache on `(query, collection, page, per_page)`, ~10 min TTL, so a coach
  typing in the library dialog does not fan out to the API.
- Normalizes the API's `Image` into a small internal dataclass
  (`asset_id`, `title`, `description`, `tags`, `width`, `height`,
  `preview_url`, `web_url`) so consumers never see raw API JSON.
- Raises `CuratedImageError` (user-safe message) on any failure; never leaks
  HTTP status or upstream text to a coach.

### `fake.py`

`CURATED_IMAGE_API_FAKE=true` (default in dev and e2e) serves ~8 fixture
images committed under `backend/apps/core/curated_images/fixtures/` through the
identical normalized shape, including a fake `web_url` pointing at a
locally-stored object. Setting a real `CURATED_IMAGE_API_URL` + key in dev
`.env` hits the live catalog instead. Prod refuses the fake flag, matching
`EMAIL_SINK_ENABLED`'s guard.

### `cache.py`

```python
cache_remote_image(asset) -> media.Photo
```

Copy-on-use into the current tenant's namespace. Must run inside a tenant
context.

- Deterministic key `tenants/<slug>/curated/<asset-id>.webp` — dedup is a
  `Photo.objects.filter(s3_key=…)` hit, so a second use returns the first copy
  and no bytes move.
- On a miss: stream the **web** rendition from the signed URL, `_store_object`
  it, then create `Photo(s3_key, title, alt_text=description, width, height,
  content_type="image/webp", file_size)`.
- Security, because the URL comes from another service:
  - the URL's host must be in `CURATED_IMAGE_MEDIA_HOSTS` (SSRF guard);
  - the response `Content-Type` must be `image/webp`;
  - the download is capped (`CURATED_IMAGE_MAX_BYTES`, default 15 MB);
  - a remote-supplied *object key* is never used for anything — contentor
    derives its own key from the asset id.
- A failure raises `CuratedImageError` and creates no `Photo` row.

### `views.py` + `urls.py`

Coach-auth (`IsCoachOrOwner`), mounted at `/api/v1/curated-images/`:

- `GET /api/v1/curated-images/?q=&collection=&page=` → `{results: [...],
  page, has_next}`. An unknown collection is a `400`; a catalog outage is a
  `503` carrying the user-safe message.
- `POST /api/v1/curated-images/<asset-id>/use/` → `PhotoSerializer`, `201`.
  Resolves via `client.get()`, then `cache_remote_image`.
- `GET /api/v1/curated-images/<asset-id>/preview/` — **as built**: fixture bytes
  for dev and e2e only, `404` whenever fake mode is off. Deliberately
  unauthenticated, because an `<img>` tag cannot carry the JWT and real previews
  are signed URLs straight from the service. Production refuses the fake flag, so
  this route is dead there.

The `use/` response contract is unchanged, so `image-library-dialog.tsx` keeps
its "materialize before `onSelect` fires" behavior.

### Frontend

**As built:** `curated-photos-api.ts` stays (its `CuratedKind` narrows to the four
decorative kinds) and a new `curated-images-api.ts` covers the remote catalog —
rather than one replacing the other, since both catalogs remain.
`image-library-dialog.tsx` keeps its six category chips but now routes the two
photographic ones to the remote endpoint and the four decorative ones to the
local one, normalizing both into one grid item type. It gains a search box and a
paged load-more grid in place of the 60-row cap, following the repo's loading
conventions (`StaleContainer` for refinement loads, skeleton body on open,
`useAsyncAction` for the use action).

## Consumer rewrites

Remote relevance replaces local token-overlap scoring, so these get simpler.

**`apps/core/onboarding/ai_photos.py`** — instead of loading the whole
`CuratedPhoto` table, issue one search per slot group using the slot
description plus the coach brief, take the top ~12 as candidates, and keep the
single structured call that assigns candidates to slots. Deterministic
fallback: first result. `apply_photo_picks` calls `cache_remote_image`.

**`apps/core/copilot/photos.py`** — **as built**, the three apply steps in
`copilot/views.py` (block image, course cover, event cover) resolved their photo
with the same fifteen lines each; that collapses into one `photo_for_action`
helper here, which returns either the coach's attached photo or the catalog asset
cached into tenant storage. Stashed action cards now carry `curated_asset_id`
where they carried `curated_photo_id`, so a card created just before a deploy is
refused with "that photo is no longer available" rather than placing the wrong
image; cards are per-turn, so the window is the length of one conversation.

`pick_photo` searches with
`brief_with_turn_style(tenant, description)` as the query and the collection
from `FIELD_KINDS` (`bgImage` → `coach-heroes`; `image`, `courseCover`,
`eventCover` → no collection filter, i.e. both). "Try another" excludes by
asset id, recovered from the previous pick's deterministic `s3_key` — no schema
change. `preview_url` returns the remote preview for not-yet-cached picks;
`tenant_photo_url` is unchanged. `copilot/engine.py` and `copilot/views.py`
carry an `asset_id` where they carried `curated_photo_id`.

**`apps/blog/curated.py`** — `curated_candidates(topic)` searches on the topic
title; candidate ids stay namespaced `curated:<uuid>` (they can never collide
with tenant `Photo` UUIDs, same as today); `resolve_curated_photo_ids` uses
`client.get()` + `cache_remote_image`.

**`apps/core/onboarding/ai_curate.py`** is untouched — `shortlist` and
`rank_logos` still serve the logo catalog.

## Failure behavior

Fail soft; never fail the surrounding action.

| Surface | Behavior when the API is unreachable |
| --- | --- |
| Library dialog | Error state with retry; decorative assets still browsable. |
| Copilot | User-safe refusal: "the photo library is unavailable right now". |
| Onboarding wizard (Celery) | Log and continue without photos. Never fail the wizard. |
| Blog autopilot (Celery) | Log and continue; draft ships without a curated cover. |
| Cache step | Raise; no partial `Photo` row. |

## Cleanup

- Data migration `core/0038_curatedphoto_decorative_only` deletes the 584
  `hero`/`stock` `CuratedPhoto` rows and narrows the field choices. Reverse
  re-widens the choices but cannot bring rows back.
- The 584 PNGs leave `frontend-customer/public/curated-photos/`;
  `photo_meta.json` shrinks to the 107 decorative entries.
- `CuratedPhoto.KINDS` narrows to `["spot", "texture", "divider", "icon"]`;
  `AI_KINDS` is removed along with its last consumer.
- **The `platform/curated-photos/` S3 objects are retained forever.** Tenant
  `Photo` rows already materialized from them point at those keys and must keep
  rendering. `curated_photos/materialize.py` is retained for the decorative
  path.
- The superadmin curated-photos panel stays, now managing decorative assets
  only. Photo curation moves to the API's own `/admin`.

## Settings and secrets

New in `backend/config/settings/base.py`, with `.env.example` and
`.env.prod.example` entries:

```
CURATED_IMAGE_API_URL          # https://image-generation.contentor.app
CURATED_IMAGE_API_KEY          # developer API key from the API's dashboard
CURATED_IMAGE_API_FAKE         # true in dev/e2e; prod refuses it
CURATED_IMAGE_MEDIA_HOSTS      # signed-URL host allowlist
CURATED_IMAGE_MAX_BYTES        # default 15728640
CURATED_IMAGE_CACHE_TTL        # search cache seconds, default 600
```

## Testing

**As built:** an autouse `curated_image_uploads` fixture in `backend/conftest.py`
forces fake mode for every test — no suite can reach the service even when the
dev container exports a real URL and key — and captures the S3 PUT so copy-on-use
runs its full path (download, key derivation, `Photo` row) while tests stay
offline. It yields `{key: bytes}` for assertions. The fixture catalog also
*filters* on a query, not just ranks, mirroring the service's lexical search, so
callers exercise their no-results path offline.

Backend unit (`make test-app APP=core`, `APP=blog`):

- client: fake mode shape, mocked HTTP for search/get, timeout and 5xx paths
  raising `CuratedImageError`, Redis cache hit avoiding a second call;
- cache: fresh copy writes the tenant key and `Photo` fields; second use
  dedups without a download; disallowed host, wrong content type, and
  over-cap body each refuse and leave no row;
- collection mapping per `FIELD_KINDS`;
- each consumer (wizard slots, copilot pick + "try another", blog candidate
  resolution) against a stubbed client, including the API-down path.

E2e (fake mode, offline): library dialog search → use → the photo appears in
the editor; blog AI draft gets a curated cover.

API repo (`npm test`): `GET /v1/images/{id}` auth, 404 on unpublished, signed
URL shape; import script against a fixture manifest, including replay.

## Order of work

1. **API**: `GET /v1/images/{id}`, optional search query, the two collections,
   openapi + tests. *(done)*
2. **API**: import script *(done, dry-run verified: 691 entries → 584
   photographic, 0 failures)*. **Running it against prod is still pending** and
   needs the API deployed first, so the `coach-heroes` / `coach-stock`
   collections exist. The 584 source PNGs have already left the working tree, so
   point `--dir` at an export of the pre-cleanup commit:
   `git archive <ref> frontend-customer/public/curated-photos | tar -x -C <tmp>`.
3. **Contentor**: `curated_images/` module (client, fake, cache, views) + tests.
4. **Contentor**: swap the four consumers and the frontend dialog.
5. **Contentor**: cleanup migration, PNG removal, `KINDS` narrowing.
6. **Deploy**: API first, then contentor with the new `.env.prod` values.

Steps 1–2 are independently deployable and leave contentor untouched, so the
catalog can be verified in the API's own admin before contentor depends on it.
