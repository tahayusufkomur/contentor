---
name: collect-curated-photos
description: Use when adding new curated photos (hero covers, stock images, spot illustrations, textures, dividers, icons) to Contentor's blog design-element library — generating with Gemini and seeding photo_meta.json / seed_curated_photos. Also when curated-photo coverage is missing a niche or kind.
---

# Collect Curated Photos

## Overview

Catalog source: `frontend-customer/public/curated-photos/` — image files + **committed** `photo_meta.json`
(array of `{title, filename, prompt, tags, kind, alt_text}`; array order = gallery position, so **append only**).
Unlike logo_meta.json this file IS in git — commit it with every batch. `seed_curated_photos` is idempotent
(`update_or_create` on `image_key`), derives width/height, white-strips ONLY kind=spot, uploads to object
storage, creates public-schema `CuratedPhoto` rows.

Kinds: `hero` (16:9 covers), `stock` (photographic inline), `spot` (transparent flat illustration),
`texture` (seamless tiles), `divider` (thin separators), `icon` (small glyphs).
Only hero/stock/spot are offered to the blog AI writer — tag those three especially well.

## Prompt recipes (per kind)

- hero: `Generate a photorealistic 16:9 editorial stock photo: <niche scene>, natural light,
  premium magazine look, no text, no watermark, no logos.`
- stock: same as hero, but vary aspect and composition per subject.
- spot: reuse the logo recipe — `flat vector style, 1-2 colors on a plain white background,
  no text, no watermark. Square image.` (the seeder strips the white canvas)
- texture: `seamless tileable background pattern, <style>, subtle, no text`.

Tags: niche keywords first (fitness, cooking, business, mindset, yoga, music, art, language,
photography…), then mood/style words. Write alt_text for every entry — it is the accessibility
text on tenant blogs AND what the AI writer reads when choosing.

## Generation

Same two paths and browser mechanics as collect-curated-logos (backend API preferred when
GEMINI_API_KEY is valid; otherwise browser Gemini with the two-account daily-quota rotation —
see that skill for the send/download/quota gotchas, they apply unchanged).

## Ingest (per batch)

```bash
cp <new>.png frontend-customer/public/curated-photos/
# append entries to photo_meta.json (python, append-only)
docker compose exec -T django python manage.py seed_curated_photos
```

Verify: `CuratedPhoto.objects.count()` in public schema matches meta length; superadmin gallery
at `localhost/admin/m/curated-photos`; coach search at `/api/v1/curated-photos/?kind=hero`.
Commit images + photo_meta.json together.
