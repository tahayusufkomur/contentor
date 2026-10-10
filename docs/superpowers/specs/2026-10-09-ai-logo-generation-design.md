# AI logo generation — design

Date: 2026-10-09 · Status: approved in conversation, not yet planned

## Goal

Every coach gets three complete, professional logo candidates designed for their brand, in their site's own palette and typographic direction, ready by the time the setup interview reaches the logo question. Zero marginal cost on the free path. The coach picks one, asks for three more, or falls back to the curated marks and the wordmark exactly as today.

Non-goals for this version: editing a generated logo in the Studio canvas, edit-by-instruction, reference-image "more like this", a paid premium-model button, an offline eval harness. All are listed under *Later*.

## What the spikes established (2026-10-09)

- A full brief (brand, business, style mood, type direction, exact palette hexes, composition archetype, "no other words") makes the image model compose a finished logo. 16 of 16 API logos and 4 of 4 hub logos spelled the name correctly and respected the palette.
- The Agent Container hub generates logos through the agent's image subagent on the studio accounts: free, 86–258 s per logo, quality at the level of the API Flash model. Five of five runs succeeded with the plain prompt shape; the three failures came from prompt variants (wrapped brief, subagent `Model=pro`).
- The hub's Gemini 3.1 Pro opens a PNG from the run directory and returns a judge JSON in ~19 s. Absolute scores cluster (all 4–5/10) and do not rank; one comparative call over all candidates ranks sensibly and names concrete defects.
- A colour trace (vtracer, colour mode) of a generated logo is 30–170 paths, 20–95 KB. Snapping every fill to the nearest palette role and dropping the background role yields a transparent, recolourable vector; a dark variant is a role swap. Snapping to four roles loses tints, so the role set must include the style's surface and muted colours.
- Small text (the tagline) traces badly. Big text and marks trace cleanly.
- The existing mark tracer (`logo_trace`, 12 paths / 12 000 chars) rejects the best line-art; those caps are for the old icon path and do not apply here.

## Flow

```
interview settles the home-page facts
  └─ fire(): due += "logo:generate"  (alongside style:auto, page:home, rank:logos)
       └─ Celery generate_logo_candidates(tenant_id)
            1. brief   — LogoBrief from answers + style JSON (palette → hex)
            2. concepts — one hub text run (Gemini 3.1 Pro): 3 distinct concepts, 3 archetypes
            3. generate — 3 hub image runs in parallel, one per studio account
            4. fetch   — PNG bytes from the hub run directory
            5. vector  — colour trace → role-snapped paths, background dropped
            6. gates   — caps, margin, read-back (hub vision): name present, nothing else
            7. judge   — one hub run views the survivors and ranks them
            8. store   — LogoCandidate rows + wizard_state["logo_batch"] = ready
logo card (field site_logo)
  ├─ batch ready  → "Designed for you" row: ranked candidates, pick / three more
  ├─ batch building → waiting state, polled; curated + wordmark available beneath
  └─ batch failed/none → card exactly as today
pick → answers["logo"] = {"mode": "generated", "candidate_id"} → apply_wizard_logo
  └─ TenantConfig.logo (PNG), .icon (cropped mark), .logo_recipe (mark.type "generated")
```

## Components

### 1. Trigger (`interview_milestones`)

- `_due()` appends `"logo:generate"` to the first batch (`style:auto`, `page:home`, `rank:logos`). `_start()` dispatches `tasks.generate_logo_candidates.delay(tenant_id)` on commit, like `rank:logos`.
- `apply_style()` re-dispatches when a batch already exists for the tenant and the style or palette changed: the palette is in the image. The previous batch stays until the new one is ready, then is superseded.
- "Three more" from the card dispatches the same task with `more=True`; the brief gets the previous judge's defect list appended and the previous candidates' concepts listed as "not these".
- At most one batch in flight per tenant: `wizard_state["logo_batch"] = {"id", "state": "building"|"ready"|"failed", "started_at"}`; a dispatch while `building` is a no-op. A `building` batch older than 15 minutes is treated as failed.
- Feature switch: `LOGO_GEN_ENABLED` (default true when `AI_PROVIDER == "agentc"`, false otherwise). Off → nothing fires and the card is unchanged. Dev e2e runs `AI_PROVIDER=cli`, so e2e sees today's card.

### 2. Brief (`apps/tenant_config/logo_gen/brief.py`)

`LogoBrief` is built from `CoachBrief.from_tenant` plus the style JSON (`sections.style(style_id)`, and `sections.palettes()` for the palette variant):

| Field | Source |
|---|---|
| brand | `tenant.name` |
| business | `subject_of(answers)` + description, one line |
| mood | style `mood` |
| typography | derived from style `fonts.display` family name ("a Cormorant-like light serif", "a JetBrains Mono-like monospace"); a small lookup by family, default "a clean geometric sans" |
| palette | `background, surface, primary, accent, foreground, mutedForeground` converted oklch → hex (`logo_gen/color.py`, pure math, unit-tested against known values); in the vector roles `foreground` is `ink` and `mutedForeground` is `muted` |
| archetype | one of `mark_name`, `wordmark`, `emblem`, assigned per concept |

The image prompt is the plain shape that worked (brand spelled exactly, business, mood, typography direction, "use only these colours", composition sentence, flat/crisp/no gradient/no mockup/no frame, "no words or characters other than the brand name", generous margin, plain background, aspect 4:3, "must survive 32 px"). **No tagline in the image.** The brand name is the only text.

Concepts: one structured text call (`core_ai.structured`, `effort="max"`, see §9) returns `[{concept, archetype}] × 3`: three different metaphors for this brand, one per archetype. Each concept becomes one image prompt by prepending "Mark concept: …". Static system prompt, tenant data in the user block (prompt-cache rule).

### 3. Hub image run (`apps/core/ai.py`)

New function `agentc_image_run(prompt, out_path, *, label, timeout_seconds) -> run_id`:
- same body as `_agentc_run` plus the instruction block "Use your image generation tool with the highest-quality image model available to you. … Save the generated image as `<out_path>` relative to the current working directory. Then reply with ONLY `{"file": …, "image_model": …}`";
- tools **allowed** (this is the one flavour that may use tools; `_agentc_used_tool` is not applied);
- `timeout_seconds` default `AGENTC_IMAGE_TIMEOUT_SECONDS = 420`; priority `interactive`;
- returns the run id; the caller fetches the file.

`agentc_run_file(run_id, path) -> bytes` fetches a file from the run's working directory through the hub: `GET {AGENTC_HUB}/runs/{id}/file?path=<relative>` (hub-side addition, see §10). Dev fallback while the route is missing: `AGENTC_RUNS_DIR` (empty by default) names a local mount of the synced studio directory; when set, the file is read from disk after waiting for sync (poll every 2 s, up to 120 s).

Out paths are per tenant and batch: `logo-candidates/<schema>/<batch>/cand_<n>.png`.

`agentc_vision_run(prompt, *, label)` is `_agentc_run` with tools allowed and `model=AGENTC_PRO_MODEL`; the prompt names the files to open. Used for the read-back gate and the judge; the files are the ones the image runs just wrote, so they are already in the hub's directory.

### 4. Vectorize and snap (`apps/tenant_config/logo_vector.py`)

`vectorize(png_bytes, palette: dict[role, hex]) -> GeneratedMark | None`
- Flatten onto the background colour, cap at 1024 px, vtracer colour mode, `hierarchical="stacked"`, spline, `filter_speckle=6, color_precision=7, layer_difference=24, corner_threshold=60, length_threshold=4, splice_threshold=45, path_precision=2` (the spike settings).
- Each path's fill snaps to the nearest palette role by RGB distance. Roles: `background, surface, primary, accent, ink, muted`. Paths snapped to `background` are dropped.
- vtracer's `transform="translate(x,y)"` is folded into the coordinates; coordinates are rescaled so the ink bounding box fits a `0 0 100 H` box (width-normalised, `H = 100·h/w`), 2 units of margin. Commands restricted to `M L C Q Z`, numbers ≤ 2 decimals, so `logo_recipe._PATH_D_RE` holds.
- Output: `{"view_box": [100, H], "paths": [{"d", "role", "fill_rule"?}]}`.
- Caps: ≤ 400 paths, ≤ 300 000 chars total, else `None`.

`icon_crop(png_bytes, palette) -> png_bytes`: the mark is the ink cluster left of the largest horizontal gap between ink columns (ignoring background colour); crop that cluster, pad to a square with 12 % margin, 512 px, keep the background colour. If no gap splits the ink (wordmark-only candidates), return `None` and the icon falls back to initials as today.

### 5. Gates (`apps/tenant_config/logo_gen/gates.py`)

Deterministic, no model opinion, in this order; the first failure rejects the candidate with a reason:
1. `vector`: `vectorize()` returned a mark.
2. `margin`: ink bounding box has ≥ 6 % margin on every side of the raster.
3. `read_back`: one hub vision run per batch opens every surviving file and returns `{"<file>": {"text_seen", "extra_glyphs"}}`; per candidate, the normalised `text_seen` (case-folded, whitespace collapsed, punctuation stripped) must equal the normalised brand name, and `extra_glyphs` must be false. A candidate missing from the reply is rejected.

The palette check from the spike is dropped: snapping absorbs anti-alias fringe, and "use only these colours" is already in the prompt.

### 6. Judge

One hub vision run on `AGENTC_PRO_MODEL` for the whole batch: "open files a, b, c; rank them best to worst as a senior brand designer; return `{"ranking": [...], "reasons": {n: one sentence}, "reject": [...], "defects": {n: [...]}}`". Rank and reason are stored per candidate. A `reject` from the judge only reorders; it never removes a gated candidate (the coach may disagree). With one survivor the judge is skipped. If the judge call fails, candidates keep generation order.

### 7. Storage

New tenant-schema model `apps.tenant_config.models.LogoCandidate`:

| Field | Notes |
|---|---|
| batch | char(16), the batch id in `wizard_state["logo_batch"]` |
| position | 1..3 within the batch |
| state | `ready` or `rejected` |
| reject_reason | gate name or "" |
| source | `hub` or `api` |
| concept, archetype, prompt | text |
| png | FK `media.Photo` (bytes uploaded to tenant storage at `logo-candidates/<batch>/cand_<n>.png`) |
| icon | FK `media.Photo`, nullable |
| vector | JSON, the `GeneratedMark` |
| rank, judge_reason | int (1 = best), text |
| created_at | |

Old batches are kept until the tenant is erased; the card only reads the current batch.

### 8. The logo card

`logo_cards()` gains a `generated` block:
```
"generated": {"state": "building" | "ready" | "none",
              "options": [{"value": "gen:<id>", "label": <concept>, "image_url": <presigned png>, "rank": n}]}
```
`look-cards.tsx`, logo branch:
- `ready` → a "Designed for you" row above the curated grid: candidates in rank order, each rendered from `image_url` (it is already in the palette), picked like any option, plus a "Three more" button (same `useAsyncAction` pattern as the current "More").
- `building` → the row shows three skeleton tiles with the line "Designing your logo, about two minutes" (`<Spinner>`/skeleton presets per the loading conventions). `setup-flow.tsx` already refreshes state every 3 s while anything is building; its predicate adds `logo_batch.state === "building"`. `interview_state` serves fresh cards on every refresh, so the row flips to `ready` without user action.
- `none` → nothing changes.
- The curated grid and the wordmark option stay beneath in every state. Nobody waits unless they choose to.

`choose()` accepts `gen:<id>` (candidate must belong to the current tenant and be `ready`) → `answers["logo"] = {"mode": "generated", "candidate_id": id}`, `answers["site_logo"] = value`, then `apply_logo`.

### 9. Apply and recipe

`apply_wizard_logo`, new `generated` branch: `config.logo = candidate.png`, `config.icon = candidate.icon` (or left unset → initials), `navbar.show_brand_name = False` (the name is in the mark), `navbar.logo_size = "lg"`, and
```
config.logo_recipe = {version 3, layout "horizontal", name <brand>, tagline "",
                      mark {type "generated", view_box, paths, name_in_mark true},
                      badge none, typography defaults, colors {palette roles → hex}, elements defaults}
```
Recipe contract changes (both repos in one commit, per the KEEP IN SYNC rule):
- `logo_recipe.MARK_TYPES` adds `generated`; `_generated_mark()` validates `view_box` (two positives, width 100), each path through `_PATH_D_RE`, role in `{background, surface, primary, accent, ink, muted}`, caps as §4. Invalid → initials, like `_custom_mark`.
- `packages/shared/src/logo/types.ts`: `LogoMark` adds `{ type: "generated"; view_box: [number, number]; paths: GeneratedPath[]; name_in_mark: boolean }`; `migrate.ts`/`logo_recipe.upgrade_recipe` pass it through (parity fixtures on both sides).
- `logo-renderer.tsx`: `MarkContent` draws a generated mark with `role → colors` lookup; `colors` gains optional `roles: Record<role, hex>`; when `name_in_mark`, `LogoRenderer` skips the name and tagline slots and lets the mark take the full canvas. Dark variant: the export's existing dark pass swaps `roles` using the style's inverse palette (`inverse`, `inverseForeground`) — ink ↔ background, primary → inverseForeground.
- Studio: a recipe whose mark is `generated` opens in the editor with the mark controls hidden and a note "Designed in setup. Pick another in Setup → Logo." Export and brand-kit zip work unchanged (they rasterize the renderer).

### 10. Failure handling and quota

- Hub unreachable or every studio account refusing → if `GEMINI_API_KEY` is set, the batch runs on the API Flash model through the existing `logo_image._generate_one` (same prompts; read-back via a direct Gemini vision call in `logo_image`; judge skipped); otherwise the batch is `failed`.
- One run timing out drops that candidate; the other two proceed. Zero survivors after gates → one automatic retry batch (new concepts), then `failed`.
- The task records nothing in `LogoAiUsage`: hub runs cost nothing; API fallback attempts record cost through the existing `record_attempt_cost` so the kill-switch still counts them.
- Every failure path is logged with the batch id; the card never shows an error, only the curated options.

Hub dependency: `GET /runs/{id}/file?path=<relative>` returning the file bytes (404 when missing, 400 for paths escaping the run cwd). Requested from the hub maintainer; until it lands dev uses `AGENTC_RUNS_DIR` with the studio directory mounted read-only into `celery-worker` (compose, dev only).

### 11. Settings

| Setting | Default | Meaning |
|---|---|---|
| `LOGO_GEN_ENABLED` | `AI_PROVIDER == "agentc"` | master switch |
| `LOGO_GEN_CANDIDATES` | 3 | per batch |
| `AGENTC_PRO_MODEL` | `gemini-3.1-pro-high` | concepts, read-back, judge; `core_ai.structured(effort="max")` selects it on agentc |
| `AGENTC_IMAGE_TIMEOUT_SECONDS` | 420 | per image run |
| `AGENTC_RUNS_DIR` | "" | dev-only local mount of the studio directory |

`.env.prod.example` documents the new keys; prod values go through `secrets.sh`.

## Testing

- Unit (`apps/tenant_config/tests/test_logo_vector.py`): oklch→hex against known values; snap picks the nearest role and drops background; translate folding and rescale produce whitelist-clean `d`; caps reject; icon crop on a fixture lockup returns the left cluster, and `None` on a wordmark. Fixtures: three PNGs from tonight's spike checked in under `tests/fixtures/logo_gen/` (≤ 300 KB each).
- Unit (`test_logo_gen.py`): brief builder from a seeded tenant + style; gates (margin, read-back normalisation incl. diacritics and punctuation); the task end-to-end with a fake hub (`responses`): create → poll → file → judge, including one timeout and one read-back failure; batch lock; style change re-dispatch; API fallback when the hub refuses.
- Unit (`test_logo_recipe.py`, `migrate.test.ts`): `generated` mark validation and parity fixtures; `logo-renderer` test that `name_in_mark` suppresses the name slot.
- Vitest `look-cards.test.tsx`: building, ready and none states; "Three more" calls the action.
- E2e: `01-signup-onboarding` unchanged (feature off under `AI_PROVIDER=cli`); impact map: `apps/tenant_config/logo_gen` and `logo_vector.py` fall under the existing `tenant_config` entry.
- Manual: one real batch on the dev tenant through the hub, screenshots of the card in `building` and `ready`.

## Later

API Pro as a paid "premium candidates" button (`gemini-3-pro-image`, ~$0.04 each); edit-by-instruction with the chosen logo as reference; reference-image "more like this" (the hub agent claims its subagent takes a reference image; untested); an offline eval of ~20 briefs across styles run on prompt or model changes, in the style of `make eval-sites`; a tagline line typeset under the mark in the header.

## Risks

- The hub agent chooses the image model itself (Imagen 3 three times, Flash Image once tonight); quality can drift with the agent's choices. Mitigation: the judge and gates, and the API fallback switch.
- Studio-account quota: one run is ~200 k input tokens. Three per coach, plus two vision runs. Watch the hub's `/accounts` quota view after launch.
- Non-Latin or diacritic brand names may not render; the read-back gate catches it and the card degrades to curated.
- Hub latency puts the batch at 1.5–4.5 minutes; a coach who answers the next questions quickly sees the waiting state. Accepted.
