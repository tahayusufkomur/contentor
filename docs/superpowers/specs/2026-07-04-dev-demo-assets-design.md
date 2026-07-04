# Dev demo-asset mirror (prod → MinIO) — design

**Date:** 2026-07-04
**Status:** approved (brainstorming)
**Scope:** dev-only tooling, host-run. No production code path changes; production
bucket is READ-ONLY source.

## Problem

Seeding a tenant (demo tenants via `seed_all_demos`, and real coach signups via
`provision_tenant` → `seed_template_into_tenant`) creates `Photo` / `Video` /
download rows whose keys point at fixed demo objects under `demo/photos/*` and
`demo/videos/*` (enumerated in `apps/core/management/commands/demo_data/*` and
config templates). The seeder only writes DB rows — it assumes those objects
already exist in the bucket (`_seed_photos`, `seed_template.py:253`).

In **production** the real demo objects live in the Hetzner bucket
(`contentor-prod-private`), so prod signups render correctly. In **dev** (and any
fresh MinIO volume) the bucket has none of them, so every locally-seeded tenant's
media presigns fine but fetches **HTTP 404** → broken media. `make dev-reset`
wipes the MinIO volume and re-triggers the breakage.

This is a **dev-tooling gap**, not a production bug. Fix = populate dev MinIO.

## Decision: mirror the real prod objects (not generate placeholders)

Dev should show **exactly what prod shows** — the real niche imagery and videos.
So instead of generating placeholder tiles, copy the real `demo/*` objects from
the prod Hetzner bucket into dev MinIO. (Supersedes the earlier
Pillow-placeholder idea; Pillow is no longer needed.)

### Verified facts (2026-07-04, read-only)

- Prod bucket `contentor-prod-private` @ `https://fsn1.your-objectstorage.com`
  contains `demo/photos/` (58 objects, ~112 MB) and `demo/videos/`
  (36 objects, ~121 MB) — ~233 MB total. Read access confirmed via `.env.prod`
  creds from the host.
- Host has `boto3` 1.40, `mc`, and MinIO is reachable at `localhost:9000`.
- The django container does NOT have `.env.prod` mounted — it cannot reach the
  prod bucket. Prod creds live only in `.env.prod` on the host.

## Approach

A **host-run** script (invoked by a make target) that:

1. Reads the SOURCE (prod) bucket creds from `.env.prod` on the host —
   `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT`,
   `AWS_BUCKET_NAME`. Prod creds never enter the container, app settings, or CI.
2. Reads the DEST (dev MinIO) config from the dev `.env` —
   `AWS_ENDPOINT_EXTERNAL` (host-reachable `http://localhost:9000`),
   `AWS_BUCKET_NAME` (dev bucket), and the MinIO dev creds.
3. Lists `demo/photos/` + `demo/videos/` in SOURCE, and for each object copies it
   to DEST at the same key **if missing** (HEAD check), preserving `ContentType`.
   Idempotent; `--force` re-copies. Skips zero-key prefix markers (`demo/photos/`).
4. Prints a summary (copied / skipped / bytes) and exits non-zero on any failure.

### Components

1. **`scripts/mirror_demo_assets.py`** (host script, boto3 source→dest stream).
   - SOURCE client: prod creds from `.env.prod`, path-style + s3v4.
   - DEST client: MinIO via `AWS_ENDPOINT_EXTERNAL` from `.env`, path-style + s3v4.
   - **Safety guards (hard):** DEST endpoint MUST look like MinIO
     (`localhost`/`minio`); refuse to write to any non-MinIO endpoint. SOURCE is
     only ever listed/read (`get_object`/`head_object`), never written. Abort with
     a clear message if `.env.prod` or required vars are absent.
   - Streams object bodies (no full-file buffering where avoidable); ~233 MB total.
   - Flags: `--force`, `--prefix` (default both demo prefixes), `--dry-run`.

2. **`Makefile`**
   - `seed-demo-assets` target → runs the host script (NOT via
     `docker compose exec`, since it needs host creds + host→MinIO reach).
   - Called from `seed-demos` and `dev-reset` so a fresh dev volume is populated.
     `dev-reset` runs it after MinIO is healthy.

### Data flow

```
.env.prod (host)            .env (dev)
  SOURCE creds                DEST config
      │                           │
      ▼                           ▼
 prod Hetzner bucket  ──list/get──►  mirror_demo_assets.py  ──put(if missing)──►  dev MinIO
   (READ ONLY)                          (host)                                    (contentor-dev-private)
      demo/photos/*                                                                 demo/photos/*
      demo/videos/*                                                                 demo/videos/*
                                                                                         │
                                     seeder's DB rows now resolve → presigned GET 200 ◄──┘
```

### Error handling

- Missing `.env.prod` / SOURCE vars → hard abort, clear message.
- DEST endpoint not MinIO → hard abort (write guard).
- MinIO unreachable → hard abort telling the user to `make dev` first.
- Per-object copy failure → log the key, continue, non-zero exit at end.

### Testing

- Backend/host test (skipped unless MinIO reachable): run the mirror for a small
  fixed subset, then assert those keys return 200 via a presigned download URL —
  reusing the presign→fetch path from the debugging session.
- Idempotency: a second run reports all-skipped, copies nothing.
- Manual acceptance: after `seed-demo-assets` + `seed-demos-force`, load a demo
  tenant and a locally-provisioned signup; images and videos render (200), no
  broken media.

## Security notes

- Prod bucket is **read-only source**; the script has no code path that writes to
  a non-MinIO endpoint (guarded).
- Prod creds stay in `.env.prod` on the host, read at runtime by the host script
  only. Never mounted into the container, never committed, never in CI.
- `.env.prod` values were flagged for rotation in a prior session; this change
  reads them but does not expose them further.

## Out of scope

- Committing real media to the repo (we mirror, not vendor).
- Any change to `seed_template.py` / `provision_tenant` / the presign layer.
- Production asset management (already correct on Hetzner).
- Pillow / placeholder generation (dropped — we use real objects).

## Follow-up (not this change)

- Tenant `y`'s 5 keys were hand-patched during debugging with 1×1 PNGs; running
  `seed-demo-assets --force` replaces them with the real prod objects.
