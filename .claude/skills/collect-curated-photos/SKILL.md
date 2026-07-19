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
see that skill for the send/download/quota gotchas, they apply unchanged). Proven ultra-realistic
photo recipe: `Ultra-realistic photograph, 16:9 editorial stock photo: <scene>, shot on a
full-frame DSLR with a 50mm lens, natural light, shallow depth of field, lifelike skin and
textures, high detail, premium magazine quality, no text, no watermark, no logos.`

Extra photo-batch gotchas (learned on the 168-cover run, 2026-07-19):
- **One automatic download per tab**: after a tab's first "Download full-sized image", later
  download clicks in that tab silently do nothing (no request, no file). Fresh tab per image —
  or recover a missed one by opening the chat URL in a NEW tab and clicking download there.
- **Parallel subagents work** (one tab each, pure-DOM injection via `document.execCommand('insertText')`
  + JS send — never coordinate clicks in background tabs), but downloads MUST be serialized via a
  lockdir since ~/Downloads is shared; claim by before/after file-set diff + `mv`, never `ls -t | head -1`.
- Quota "limit resets" banners can be stale/per-chat — always empirically test one generation
  before declaring an account dry.
- Görkem (/u/1, Plus) renders 2752×1536; TAHA (/u/0) renders 1376×768.

## Ingest (per batch)

Photographic kinds (hero/stock): convert PNG downloads to **JPEG, max 1600px wide, quality 85**
before ingest (`sips -s format jpeg -s formatOptions 85 --resampleWidth 1600 in.png --out out.jpg`)
— raw 2752px PNGs are ~8.6MB each and bloat the git catalog ~10×. Keep `spot` as PNG (the
white-strip pipeline outputs transparency). The seeder + materializer set image/jpeg vs image/png
by file extension.

```bash
cp <new>.jpg frontend-customer/public/curated-photos/
# append entries to photo_meta.json (python, append-only)
# macOS bind-mount gotcha: after bulk-copying, the container may see a stale dir —
docker compose restart django
docker compose exec -T django python manage.py seed_curated_photos
```

Verify: `CuratedPhoto.objects.count()` in public schema matches meta length; superadmin gallery
at `localhost/admin/m/curated-photos`; coach search at `/api/v1/curated-photos/?kind=hero`.
Commit images + photo_meta.json together.
