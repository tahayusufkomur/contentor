---
name: gemini-watermark-remover
description: Remove the visible Gemini sparkle watermark from local images — new curated photo/logo batches before ingest, or a bulk clean of the existing catalog. Use when Gemini-generated images carry the bottom-right sparkle.
---

# Gemini Watermark Remover

Wraps the `gwr` CLI (`@pilio/gemini-watermark-remover`, vendored via `skills-lock.json`). It
reverses the alpha blend algebraically rather than inpainting, so the underlying pixels are
recovered exactly instead of smeared.

**Only the Gemini web app adds this watermark.** Backend-API images (`generate_mark_images`) are
clean — don't run this over them.

## Use the wrapper, not the raw CLI

`scripts/clean-images.mjs` adds a confidence gate the bare CLI lacks. `gwr` decides on its own
whether to apply removal, and its threshold is loose enough to false-positive on flat vector art:
a clean logo scoring `0.288` got a visible light blotch punched into a solid arc. The wrapper
accepts an edit only above `--threshold` (default `0.5`) and leaves every other file
byte-identical.

**The default gate badly under-cleans photographs — pick the threshold by kind.** An earlier note
here claimed real watermarks score 0.93–0.97 and false positives 0.19–0.29. That bimodal split is
wrong: measured over the whole 495-image photo catalog (2026-08-07) the scores are a **flat
continuum from -0.22 to 1.0**, and a contact sheet of the 112 files the 0.5 gate rejected showed
**~70 of them visibly carrying the sparkle**. `originalSpatialScore` measures how much the mark
*contrasts with its backdrop*, not whether it exists — a dark or busy background hides it from the
detector, not from the viewer. Since every web-app image has the mark, absence of score is not
absence of watermark.

So split the run by kind — the gate exists to protect flat art, which is the only place false
positives were ever observed:

| kind | threshold | why |
|---|---|---|
| `hero`, `stock` (photographs) | `0` | the mark is always there; judge the *output*, not the score. Recovered 62 files the 0.5 gate would have shipped watermarked |
| `spot`, `icon`, `texture`, `divider` (flat art) | `0.5` (default) | solid fills and near-white-on-white are exactly where forcing removal punches a blotch |

Verify a bulk run by eye, not by verdict counts: build a contact sheet of bottom-right corner crops
of the *outputs* and scan it. Judge at roughly real viewing size — a 6× magnified crop makes
harmless faint residue look like damage (two files were reverted on that mistake before re-checking
at scale).

```bash
S=.claude/skills/gemini-watermark-remover/scripts/clean-images.mjs

node $S <file-or-dir>... --dry-run                  # report only, writes nothing
node $S <dir> --backup /tmp/wm-backup               # clean in place, keep originals
node $S <dir> --out-dir <clean-dir>                 # write elsewhere instead
node $S <dir> --threshold 0.7 --json                # stricter gate, machine-readable verdicts
```

Idempotent — a cleaned file scores far below the gate, so reruns are no-ops. One `gwr` process
per directory (~4s for 6 images), not per file.

## New batches

Run it on the **raw PNGs before** any JPEG downscale — full-res removal is cleanest and it's the
last moment the pixels are lossless. See `collect-curated-photos` (always) and
`collect-curated-logos` (browser path only, and check the diff — flat art is where false
positives happen).

## Bulk-cleaning the existing catalog

Most of the committed catalog predates the watermark discovery (2026-08-06) and has the sparkle
baked in at downscaled size. The CLI auto-detects the mark's position *and scale* per image
(2752×1536 raw → 192px margin/96px mark; 1600×893 downscaled → 112/56), so downscaled JPEGs clean
correctly — texture fully preserved. Re-encoding costs ~2-3% file size, no visible loss.

**Clean a snapshot, never the live directory.** The wrapper hands `gwr` one directory and one
process, and a single unreadable file aborts the whole batch (`gwr exited 4: Input buffer contains
unsupported image format`) — nothing is written, since writes happen only after the pass completes.
A curated-photo generation batch running in another session copies JPEGs in as you scan, and one
caught mid-copy kills all of it. Snapshot first, then copy accepted outputs back:

```bash
SNAP=/tmp/wm-snapshot; OUT=/tmp/wm-clean; mkdir -p $SNAP $OUT
cp frontend-customer/public/curated-photos/*.{jpg,png} $SNAP/   # images only, not photo_meta.json
node $S $SNAP --threshold 0 --out-dir $OUT --json > /tmp/verdicts.json
# eyeball a contact sheet of $OUT, then copy the accepted files back over the catalog
```

The snapshot doubles as the backup of the originals, and anything that lands after it is simply
excluded — check for late arrivals afterwards (`comm -13`) and run a second pass over those.
Budget ~6 min per 500 images, and expect the staging dir to hold a full copy of the catalog.

Then re-seed so object storage and the `CuratedPhoto` rows pick up the new bytes (the seeder is
idempotent on `image_key`, so it re-uploads in place):

```bash
docker compose exec -T django python manage.py seed_curated_photos
```

Git is the real safety net for tracked files (`git checkout -- <path>`); `--backup` covers the
untracked ones. Commit the cleaned images with their meta JSON. **Prod is seeded separately** —
it keeps serving the watermarked uploads until the seeder runs there too.

## Gotchas

| Symptom | Reality |
|---|---|
| `Image codec is unavailable. Failed to load "sharp"` | `sharp` is an optional peer dep `pnpm dlx` won't install. Both scripts here co-install it (`--package=@pilio/... --package=sharp gwr`); a hand-rolled `pnpm dlx @pilio/...` will fail |
| Wrapper reports `below-threshold` on a file you can see a sparkle in | The score is contrast, not presence — see the per-kind table above. For a photograph, rerun it with `--threshold 0`; for flat art leave it (the logo seeder's white-strip removes near-white marks anyway) |
| `residual still visible after removal` | Genuine — trust it. 62 photos hit this; the raw CLI's output for them keeps a visible ghost star, and two kept an almost-full sparkle. Sampling 4 of them looked fine and was misleading. These need **regeneration**, not another removal pass |
| `no-watermark-detected` on everything | Probably API-generated, or already cleaned |
| A whole batch fails with `gwr exited 4` | One unreadable file aborts the shared process — usually a file being copied in by a concurrent batch. Clean a snapshot (above); validate it first if you want certainty |
| Want the raw CLI | `node scripts/run.mjs remove <in> --output <out>` — no gate, applies whatever `gwr` decides |

`scripts/run.mjs` is upstream's thin passthrough (patched only to co-install `sharp`). Its
Windows PATH-fallback builds a `cmd.exe` string without escaping shell metacharacters
(`&`, `|`, `^`, `%`) — a BatBadBut-class injection via crafted paths. Dead code on macOS; don't
adopt that branch elsewhere without fixing it.
