# Logo Studio: Image-Model Icon Marks (Generate → Vectorize) — Design

**Date:** 2026-07-11
**Status:** Approved direction from product owner. Vector-authored mark quality has
plateaued after prompt v6 + the vision critique loop ("still poor despite many
improvements — use an image model for the icon at least"). Decision: generate the icon
as a raster with an image model, then vectorize it back into the studio's path format.
**Builds on:** `2026-07-11-logo-vision-critique-conversation-design.md` (staged
conversation + two-pass critique — both **unchanged** by this design) and the
`_validate_pack_mark` → `validate_recipe` trust boundary from
`2026-07-08-logo-ai-brand-pack-design.md`.

## Problem

Claude authoring vector elements directly produces marks that read as primitives stuck
together, even after three prompt iterations, an element compiler, and a render-critique
second pass. Image models draw dramatically better logo marks. The earlier rejection of
raster generation was about breaking the editor contract (recolorable, theme-aware,
SVG-exportable recipes) — not about raster quality. Vectorizing the raster removes that
objection: the image model draws the mark, tracing converts it into the same
`{d, fill: role}` path dicts every other mark uses, and everything downstream (editor,
recolor, dark variant, exports, critique loop) works untouched.

Scope is the **icon stage only**. Name and tagline turns stay LLM-only — they design
type and layout around already-fixed mark paths.

## Design overview

Three pieces, all backend:

1. **Image provider** — `logo_image.py`: Gemini image generation, key-gated, parallel,
   cost-accounted.
2. **Tracer** — `trace_mark(png) -> paths`: vtracer + quantization, mapped onto the
   existing `mark / mark2 / mark_accent` palette roles.
3. **Flow wiring** — the icon-stage Pass A gains one field (`image_prompt`) and a
   generate→trace step; per-candidate fail-open to Claude's authored paths.

The wizard UI and the two-pass critique flow do not change: the client still renders
whatever `paths` arrive in the draft, and Pass B still critiques those renders.

---

## 1. Image provider (`backend/apps/tenant_config/logo_image.py`)

A small module calling Gemini image generation over REST
(`generativelanguage.googleapis.com` — no Google SDK dependency; `requests` suffices).

- **Settings** (`base.py`, env-driven like the other AI settings):
  - `GEMINI_API_KEY` — default `""`. The owner adds real values to `.env` / `.env.prod`.
  - `LOGO_IMAGE_MODEL` — default `"gemini-3.5-flash-image"`.
- **API:** `enabled() -> bool` (key set) and
  `generate_mark_images(prompts: list[str]) -> list[bytes | None]` — one PNG per
  prompt, generated **in parallel** (ThreadPoolExecutor, one REST call per candidate,
  per-call timeout ~60s), position-aligned with the input; a failed call yields `None`
  in its slot, never an exception.
- **Resolution:** request the 1K tier — 512px traces too dirty for clean paths.
- **Cost:** each response's `usageMetadata` token counts are converted to USD via a
  price table in the module (≈ $0.067/image at 1K); a missing/garbled `usageMetadata`
  falls back to the flat per-image estimate. `generate_mark_images` returns the summed
  cost alongside the images so the caller records it (see §3).
- **Key unset ⇒ feature entirely off.** The icon stage behaves exactly as today
  (Claude-authored paths ship). This mirrors the `ANTHROPIC_API_KEY`-unset pattern in
  `core_ai`: tests, CI, and e2e need no fake Gemini service. Consequence accepted by
  the owner: a dev `.env` with a real key spends real money — the same trade as Stripe
  test-mode.

Gemini calls are **not** routed through `core_ai` / `AI_PROVIDER` — that switch selects
who runs Claude-shaped structured/text calls; image generation is a different modality
with its own key and its own off-switch.

## 2. Tracer (`trace_mark(png_bytes) -> list[path] | None`)

New pip deps in `requirements/base.txt`: **`vtracer`** (Rust-backed wheel — installs
cleanly on the `python:3.12` image, no system packages) and **`Pillow`** (quantization
and color analysis).

Pipeline:

1. **Quantize (Pillow):** adaptive-quantize the PNG to 4 colors; classify near-white
   as background and drop it. If more than 3 non-background colors survive with
   meaningful area, merge the closest pair (the mark must land in ≤3 roles).
2. **Trace (vtracer):** color mode, spline fitting, aggressive speckle filter, corner
   and segment-length thresholds tuned for flat marks — we want few, smooth paths,
   not photographic fidelity.
3. **Rescale:** vtracer emits pixel-space coordinates; numerically rescale all path
   data into the mark's `0 0 100 100` viewBox with a small margin, matching what
   `compile_elements` produces.
4. **Map to roles:** rank the surviving quantized colors by filled area and assign
   `mark` (largest) → `mark2` → `mark_accent`. All subpaths of one color merge into a
   single path dict `{d, fill: <role>, fill_rule: "evenodd"}` — so a traced mark is at
   most 3 path entries. **This mapping is what keeps traced marks recolorable like
   every other mark in the studio** — palette recolor, brand-kit apply, and the dark
   variant all operate on roles, never on literal colors.
5. **Cap or reject:** the result must fit the existing recipe limits —
   ≤ `MARK_CUSTOM_MAX_PATHS` (8) entries, each `d` ≤ `MARK_CUSTOM_MAX_D_LEN` (2000
   chars). One retry with coarser vtracer settings if a `d` overflows; still
   pathological (overflow, zero paths, >3 colors) → return `None` and the caller falls
   back. We do **not** raise the recipe caps for traced marks.

Traced paths then flow through the **same `validate_recipe` custom-mark validator**
(whitelist + clamps) as authored paths — the injection trust boundary is unchanged;
tracing produces candidate input to it, not trusted output.

## 3. Flow wiring (icon stage only)

### Pass A additions

- `_IconDesign` gains `image_prompt: str` — Claude describes the mark for the image
  model ("flat vector logo mark, single continuous line dancer, 2 solid colors, plain
  white background, no text, no gradients, centered, generous margin…"). The icon-stage
  prompt bumps a version and gains a short block on writing good image prompts
  (flat/solid/white-background/no-text constraints stated every time).
- After `_validate_turn`, when `logo_image.enabled()`: fan out
  `generate_mark_images([d.image_prompt …])`, trace each returned PNG, and for each
  success **replace that design's `paths`** with the validated traced paths (the
  design keeps its `elements` — see below). The draft cached for Pass B contains the
  traced paths, so the client renders and the model critiques exactly what the coach
  would see.
- **Per-candidate fail-open:** any Gemini failure, trace rejection, or validation
  failure leaves that candidate on Claude's authored paths. A turn never comes back
  blank because of the image path.

### Critique pass (Pass B) — unchanged flow, one keep-rule

Pass B's output schema redraws via `elements`, not paths. Rule in the finish path: a
critiqued design whose `elements` are identical to the draft's keeps the draft's
(traced) `paths`; a genuine redraw recompiles from the new elements — i.e. a traced
mark that fails the checklist degrades to an authored redraw rather than shipping
broken. Good traced marks pass through byte-identical, which is the common case.

### Downstream stages

Pinning a traced icon forwards its `paths` (with the authored `elements` alongside, as
today). The name/tagline stages design the lockup **around** the pinned paths and do
not regenerate images — so their turns stay image-cost-free, and a traced mark's
geometry is effectively immutable after the icon stage (fine-tuning requests at later
stages fall back to element-level edits, same as any pinned mark today).

### Cost & gating

- ~$0.067/image × up to 3 candidates ≈ **$0.20 per icon turn**; name/tagline turns add
  nothing.
- The provider's real per-image cost (from `usageMetadata`) is recorded via the
  existing `record_attempt_cost` into `LogoAiUsage` — **the monthly
  `LOGO_AI_MONTHLY_BUDGET_USD` kill-switch therefore covers Gemini spend too**, with
  no new accounting surface. Turn quotas unchanged.
- Latency: generation+trace adds roughly 5–15s to the icon turn; the gunicorn/CLI
  timeout bumps from the brand-pack fixes already accommodate longer AI turns.

## Non-goals

- Image generation for name/tagline stages, editor refine, or any batch flow.
- Persisting the raster originals (traced paths are the artifact; PNGs are discarded).
- A fake Gemini service for tests/e2e (key-unset = off is the test story).
- Raising `validate_recipe` path caps or widening the mark-path schema.
- Photorealistic/gradient marks — the tracer's ≤3-flat-colors contract is the ceiling,
  and the image prompt enforces flat output from the start.

## Testing

- **`trace_mark` unit tests** against small fixture PNGs (checked into
  `tests/fixtures/`): white background dropped; ≤3 roles assigned by area order;
  output within path-count/`d`-length caps and inside the 0–100 viewBox; pathological
  inputs (photo-like, too many colors, giant path data) return `None`.
- **`logo_image` unit tests** with the REST call mocked: parallel fan-out preserves
  order; per-slot `None` on HTTP error/timeout; cost math from `usageMetadata` and the
  flat fallback.
- **Converse view tests** (Gemini + trace mocked): key set → icon designs carry traced
  paths and the image cost lands in `LogoAiUsage`; per-candidate fail-open (one
  candidate's image fails → that candidate ships authored paths, others traced); key
  unset → byte-identical behavior to today; finish path keeps traced paths when
  critique returns unchanged elements and recompiles on redraw.
- **Frontend:** nothing — the wizard renders whatever `paths` arrive.
