# Logo Studio — Curated Full-Logo Flow v2 (Design)

**Date:** 2026-07-13
**Status:** Approved design, pending implementation plan
**Builds on:** `docs/superpowers/plans/2026-07-12-logo-studio-curated-first.md` (implemented: wall removed, `CuratedLogo.mark_paths` traced on save, `rankForBrief`, `curatedRecipe`, Brief tagline)

## Goal

Four improvements to the coach logo-creation flow:

1. The Ideas step shows curated icons as **complete logos** (mark + coach's brand name + tagline), each with a varied designed lockup, ranked to the brief.
2. Paid "Create similar" becomes a **one-shot generation**: Gemini recreates the icon in the curated logo's style, Claude designs the name/tagline lockup, and the coach lands in the Editor with a finished draft.
3. Step navigation is **stateful**: going back to Ideas/Brief and returning never loses the editor draft; destructive picks confirm first.
4. The superadmin curated-logos panel becomes a **gallery** with drag-drop PNG add → prefilled JSON modal → auto-vectorized record.

## Current state (verified)

- `CuratedGallery` cards render the raw icon PNG (`<img src={logo.imageUrl}>`), not a composed logo.
- `rankForBrief` already ranks by niche tokens + style chips vs `tags` (exact token overlap).
- `handleCreateFromCurated` just opens the AI chat seeded with `logo.prompt`.
- A localStorage session (schema v3, 14-day TTL, debounced writes) already restores brief/recipe/chat on reopen; in-memory state survives step nav. Loss happens when a pick **overwrites** the draft, and "Start over" wipes silently.
- Converse turns are two-pass: `fetchConverseTurn` → (phase `draft` + token) → `renderDraftPngs` → `fetchConverseFinish(token, images)`, falling back to the drafts on any failure (`studio-chat.tsx`).
- Adminkit: `image_fields` upload via `POST /api/v1/platform/upload/` (multipart, `prefix`); list responses resolve image keys; `CuratedLogoAdmin` is a plain table. The `post_save` trace signal already vectorizes `image_key` changes — no new work for auto-vectorize.

---

## 1. Full-logo curated previews

**New module** `frontend-customer/src/lib/logo/curated-preview.ts`:

```ts
composeCuratedPreview(
  logo: CuratedLogo,
  opts: { brandName: string; tagline: string; base: LogoRecipe; index: number },
): LogoRecipe
```

- **Mark:** `logo.markPaths` → `{ type: "custom", rationale: logo.title, paths }`; untraced → `{ type: "image", url: logo.imageUrl }` (display-only; no photo_id until picked).
- **Varied lockup:** a small profile table (~6 entries) maps tag keywords to style directions — e.g. `elegant`/`luxury` → serif font vibe + roomy tracking; `bold`/`modern` → geometric sans; `playful`/`kids` → rounded; `minimal` → lowercase, no badge. Profile choice: first profile whose keywords intersect `logo.tags`, else rotation. Within a profile, layout/font/palette-accent are picked deterministically from `hash(logo.filename) + index` — stable across renders, varied across cards.
- **Colors:** seeded from the coach's theme primary (`base`), with per-card accent variation from the profile. Traced marks recolor; image marks keep their raster colors.
- **Text:** `brandName` / `tagline` from the Brief (fallbacks as in current `handleUseCurated`).

**`CuratedGallery` changes:** cards render `<LogoRenderer recipe={preview}/>` on a white tile instead of `<img>`. The gallery gains `brandName`, `tagline`, and `baseRecipe` props and composes the previews itself in a `useMemo` over `logos`. Tag filter chips and the two action buttons stay.

**"Use this" = what you saw:** `handleUseCurated` hands the exact previewed recipe to `handleCustomize`. For untraced logos it first uploads the PNG (existing `uploadPng` path) and swaps the mark to `{ type: "image", photo_id, url: dataUrl }`; on upload failure it shows the existing error strip.

Ranking is unchanged. Better niche/style matching comes from richer `tags` on curated rows, which the section-4 JSON flow makes cheap to maintain.

## 2. One-shot "Create similar" (paid)

**New module** `frontend-customer/src/lib/logo/create-similar.ts`:

```ts
generateSimilar(
  logo: CuratedLogo,
  brief: Brief,
  brandName: string,
): Promise<{ design: ConverseDesign; turnsRemaining: number }>
```

Chains the existing converse endpoints headlessly (no new backend):

1. **Icon turn** — stage `icon`, empty transcript, message framed from `logo.prompt` ("A logo icon similar to: …"), brief mapped as the chat does. Runs the same two-pass draft→`renderDraftPngs`→finish loop, with the same fall-back-to-drafts behavior.
2. **Auto-pick** `designs[0]` (server already ranks); no candidates → throw.
3. **Name turn** — stage `name`, pinning whichever payload the picked design carries (`mark_paths` for traced image marks, `mark_elements` otherwise — the chat's existing pin behavior), transcript carrying the stage-1 exchange, message asking Claude to design the lockup for `brandName`. Two-pass again.
4. **Tagline:** stamped from `brief.tagline ?? ""` onto the returned design (the tagline stage is skipped; Refine/editor evolves it later).

**Degraded path:** if the name turn fails (error or `quota_exhausted`) but the icon succeeded, compose the icon into a default lockup via the section-1 profile machinery and land in the Editor anyway — the spent turn still yields a usable draft, with the error strip explaining what happened.

**Studio wiring:** `handleCreateFromCurated` keeps the `logoAiStatus.eligible` gate (free → upgrade redirect) and gains:
- the section-3 overwrite confirm,
- a per-card generating state (`CuratedGallery` gets `generatingFilename?: string`; that card shows "Designing your version…", all pick buttons disable while a generation is in flight),
- on success: `composeConverseDesign` → `handleCustomize` → Editor; `logoAiStatus.turns_remaining` updated from the last response (a similar run costs 2 chat turns),
- on failure: existing error strip, card returns to normal, coach stays on Ideas.

## 3. Stateful step navigation

Frontend-only, in `logo-studio.tsx`:

- **Overwrite guard:** "Use this" and "Create similar" check whether the editor draft has real edits (`editHistory.past.length > 0`). If so, a confirm dialog ("Replace your current draft? Your edits will be lost.") must be accepted before proceeding. Un-edited seeded drafts replace silently.
- **Editor stays reachable:** add `draftReady` state (set true the first time the coach enters the Editor with a recipe; restored true when a session with `recipe` loads). The "3 · Editor" nav button is enabled when `draftReady`, so Ideas/Brief → Editor returns to the untouched draft.
- **"Start over" confirms** with the same dialog pattern before `clearStudioSession()` + reset.
- Dialog: reuse the app's existing confirm/alert-dialog primitive (same one destructive admin actions use).

No session-schema change: recipe, elements, chat already persist (v3).

## 4. Superadmin gallery + drop → JSON modal

**Adminkit backend** (`backend/apps/adminkit/`):

- `ModelAdmin` gains `list_mode: str = "table"` and `gallery_image_field: str = ""`; `introspection.py` serializes both into the meta payload.
- `CuratedLogoAdmin` sets `list_mode = "gallery"`, `gallery_image_field = "image_key"`.
- No new endpoints: upload reuses `POST /api/v1/platform/upload/` (existing `curated-logos` prefix, PNG-only, size-capped, superadmin-gated); create/update/delete reuse the adminkit ViewSet; the trace signal fires on create/update as today.

**Adminkit frontend** (`packages/shared/src/admin-kit/`):

- `model-list.tsx` branches on `meta.list_mode === "gallery"` → new `gallery-view.tsx`: responsive card grid — image on a white tile, title, enabled/disabled badge, position. Search input and filters render above the grid as in table mode.
- **Add:** the whole grid is a drop zone for a single PNG (plus a visible "Add logo" button wrapping a hidden `<input type="file" accept="image/png">` — the a11y and e2e path). Drop/select → upload → new `json-record-modal.tsx` opens: image preview + JSON textarea prefilled from the model's editable non-image fields, e.g. `{"title": "<from filename>", "prompt": "", "tags": "", "position": <max+1>, "enabled": true}`.
- **Save:** `JSON.parse` client-side (parse errors shown inline, unknown keys rejected), then POST create with the uploaded `image_key` merged in. The new card appears in the grid; `mark_paths` tracing happens server-side automatically.
- **Edit/delete:** clicking an existing card opens the same modal prefilled with the row's current fields as JSON — Save PATCHes, Delete (confirm) destroys. Gallery mode fully replaces the table + per-row form for this model.
- Table mode and all other registered models are untouched.

## Error handling summary

| Failure | Behavior |
| --- | --- |
| Curated catalog fetch fails | Existing empty-state text in the gallery |
| PNG upload on "Use this" fails | Studio error strip, stay on Ideas |
| Icon turn fails / no candidates | Error strip, card resets, stay on Ideas |
| Name turn fails after icon success | Degraded path: icon + default lockup → Editor, error strip notes it |
| Draft-render/finish pass fails | Fall back to draft designs (existing chat behavior) |
| Admin JSON invalid | Inline error under the textarea, modal stays open |
| Admin upload fails | Inline error in the drop zone, no record created |

## Testing

- **Vitest:** `curated-preview` (deterministic for same inputs, tag-bias picks the right profile, adjacent-card variation, untraced PNG fallback); `create-similar` with mocked `clientFetch` (happy chain, draft→finish pass, degraded name-turn path, no-candidates error); overwrite-guard predicate.
- **Backend pytest:** meta payload carries `list_mode` / `gallery_image_field`; existing curated tests keep covering upload + trace.
- **E2e:** `15-logo-studio.spec.ts` asserts the first Ideas card renders the brand name text (full-logo proof); `17-logo-curated-library.spec.ts` extends to: gallery grid renders, add via file input → JSON modal → save → new card visible.
- Full gates: `npm run lint && npm run build && npx vitest` (frontend-customer), `make test` (+ `make test-fresh` only if a migration appears — none is expected), `make lint`.

## Out of scope

- Semantic/synonym tag ranking (revisit if exact-overlap ranking proves too weak in practice).
- Multi-file bulk drop in the admin gallery (one PNG at a time per the chosen flow).
- Server-side cross-device studio drafts (localStorage session stays).
- Any change to `validate_logo_recipe` caps or the trace pipeline.
