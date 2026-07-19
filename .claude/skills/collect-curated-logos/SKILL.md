---
name: collect-curated-logos
description: Use when adding new curated logos to Contentor's Logo Studio / wizard gallery — generating new logo marks (Gemini), mining Pinterest for style references, or seeding logo_meta.json / seed_curated_logos. Also when curated-logo coverage is missing a niche or style.
---

# Collect Curated Logos

## Overview

One catalog source: `frontend-customer/public/logos/` — PNGs + **gitignored** `logo_meta.json` (array of `{title, filename, prompt, tags}`; array order = gallery position, so **append only**). `seed_curated_logos` is idempotent (`update_or_create` on `image_key`), strips the white canvas, uploads to object storage, creates public-schema `CuratedLogo` rows. **Snapshot `logo_meta.json` before editing** — it is single-copy and was destructively wiped once. Prod DB is authoritative: never run the seeder against prod with dev's meta unmerged.

## Prompt recipe (proven)

```
Generate a logo image: <style adjective> logo of <subject, pose/composition>,
flat vector style, <1-2 colors> on a plain white background, no text, no watermark. Square image.
```

Tags: niche keywords first, then style words from: `minimal, bold, elegant, calm, organic, modern, playful, colorful`. Aim marks at wizard niches + theme palette (forest/ocean/slate/violet/sunset/ember).

## Generation — two paths

**A. Backend API (preferred, ~$0.07/image):** `apps.tenant_config.logo_image.generate_mark_images(prompts)` inside the django container → PNG bytes, 3-parallel, auto-appends a strict no-text/white-background suffix. Write results to `/app/logo_sync/<filename>` (bind mount of the catalog dir). Needs a valid `GEMINI_API_KEY` — real keys are 39 chars starting `AIza`. A 401 `ACCESS_TOKEN_TYPE_UNSUPPORTED` means the configured key is not an API key (dev's was, 2026-07-18).

**B. Browser (free, daily cap ≈20 images):** user's logged-in gemini.google.com via claude-in-chrome. Per logo:
1. Click **New chat** button (not URL navigation — the first `type` after a page navigate silently vanishes; always screenshot-verify text landed, retype if empty).
2. Send via DOM, never coordinates: `js: document.querySelector('button[aria-label="Send message"]').click()`. Coordinate clicks near the input's right edge hit the **mic** → dictation fills the input with dots; recover by stopping listening + page reload.
3. Before sending, store `window.__n0 = count of button[aria-label="Download full-sized image"]`; after ~40s, JS-click the **last** download button only if count > n0 (guards against grabbing a previous image).
4. File lands in `~/Downloads/Gemini_Generated_Image_*.png` (1024²) → `mv` + rename to the meta filename immediately.
5. Quota hit = chat titled "Image Generation Limit Reached" + model badge drops to Flash-Lite.

**Pinterest references:** pin images don't paint in background-tab screenshots but are in the DOM — extract `{pinId: {img, alt}}` from `a[href*="/pin/"] img`, `curl` the `i.pinimg.com/736x/...` URLs, view locally. References only — regenerate, never republish pins.

## Ingest (per batch)

```bash
cp <new>.png frontend-customer/public/logos/
# append entries to logo_meta.json (python, append-only)
docker compose exec -T django python manage.py seed_curated_logos
```

Verify: `CuratedLogo.objects.count()` in public schema matches meta length; gallery at `localhost/admin/m/curated-logos` (card images may look blank in background-tab screenshots — check `img.naturalWidth` via JS instead).

## Gotchas

| Symptom | Reality |
|---|---|
| "logo trace: no tier produced a mark" during seed | Non-fatal — PNG is stored and live; only traced mark_paths missing |
| Seeder prints `skip <file>: file missing` | Meta entry without matching PNG — silently seeds fewer rows |
| Admin "Add PNG" upload via extension | Fails — file_upload can't reach scratchpad paths; use the catalog+seeder path |
| Gemini send button shows square (stop) | Previous response still streaming — JS-click stop, then send |
