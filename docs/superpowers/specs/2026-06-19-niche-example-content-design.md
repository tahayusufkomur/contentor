# Niche-aware example content on add-block (sub-project D) — design

**Date:** 2026-06-19
**Status:** Approved, pending implementation plan
**Context:** Fourth and final coach site-builder punch-list sub-project (A
block-editor fixes, B Courses display options, C video upload/URL/library all on
local `main`). Punch-list item: "for any element, can we add a new one always
with an example content? Of course depending on the selected theme." User chose
**niche-aware examples**, and the **rich, curated-per-niche** variant.

## Problem

Adding a block (`newBlock(type)`) clones a bare generic `defaultData` — e.g.
heading "Welcome", "What students say", and empty repeater `items: []`. A coach
drops in a Testimonials or FAQ block and gets an empty shell, with no model of
what good content looks like for their field. The "selected theme" already
applies automatically (the 7 visual themes are token-driven), so the meaningful
gap is **content that matches the coach's niche**.

## What exists

- **7 niche content modules** (`apps/core/management/commands/demo_data/{yoga,
  pilates,fitness,face_yoga,belly_dance,pole_dance,makeup}.py`), each with a
  `landing_sections` dict of **real written copy** under identical keys:
  `hero, about, courses, testimonials, faq, cta`. (Verified uniform across all 7.)
- A tenant's niche is stored on `Tenant.template_niche`; demo tenants also expose
  `demo_niche` via the tenant_config serializer. `template_niche` is **not** yet
  exposed to the frontend.
- `frontend-customer/src/lib/blocks/page-templates.ts` already demonstrates the
  override pattern: `tb(type, overrides)` = `{...defaultData, ...overrides}` with
  re-minted ids. The block registry's `newBlock(type)` does the same minus
  overrides.
- The editor: `EditSidebar` (`edit-sidebar.tsx`) owns the loaded `TenantConfig`
  and mounts `EditorStoreProvider`. Both add-block call sites —
  `blocks-tab.tsx` (`store.insertBlock(pageKey, newBlock(type))`) and
  `canvas/canvas-dnd-provider.tsx` (drag-from-palette) — use `useEditorStore()`.

## Goals

When a coach adds a static **content** block, seed it with curated example
content matching their niche (falling back to a generic set when the niche is
unknown), so the block is immediately illustrative and editable.

## Scope

**In scope (static, text-bearing content blocks):** `hero`, `richText`,
`imageText`, `testimonials`, `faq`, `cta`, `stats`, `banner`. Exact field keys
(from the registry): hero `{heading, subheading, ctaText, ctaHref}`; richText
`{heading, headingLevel, body}` (body = richtext HTML); imageText
`{heading, headingLevel, body, imagePosition}`; testimonials `{heading,
items:[{name, text}]}`; faq `{heading, items:[{q, a}]}`; cta `{heading,
buttonText, buttonHref}`; stats `{heading, items:[{value, label}]}`; banner
`{text, linkText, linkHref}`.

**Out of scope:** there is **no `features` block**. Media blocks (`gallery`,
`logos`, `video`) need images/media not text, and `contact` already ships
sensible niche-neutral defaults — all keep today's `defaultData`. Dynamic blocks
(`courseGrid`, `downloads`, events, shop) render real tenant data — unchanged. No
change to how whole-page `PAGE_TEMPLATES` work.

## Design

### 1. Expose the niche to the frontend (backend, one read-only add)

In `apps/tenant_config/serializers.py` `to_representation`, alongside the
existing `demo_niche`, set a unified:

```python
data["niche"] = getattr(tenant, "template_niche", "") or data.get("demo_niche", "")
```

(prefer the real-tenant `template_niche`, fall back to the demo niche). No
migration — `template_niche` already exists. Read-only; nothing consumes it
server-side.

### 2. Example-content library (`frontend-customer/src/lib/blocks/examples.ts`)

A new module exporting curated example **overrides** (the same shape
`page-templates.ts` `tb()` merges):

```ts
export type NicheKey =
  | "yoga" | "pilates" | "fitness" | "face_yoga"
  | "belly_dance" | "pole_dance" | "makeup";

// Overrides merged onto a block's defaultData. Keys match each block's data
// fields (incl. repeater `items`), taken from the registry.
type BlockExample = Record<string, unknown>;

// Niche-neutral, rich fallback for every in-scope block type.
export const GENERIC_EXAMPLES: Record<string, BlockExample>;

// Per-niche curated overrides. A niche need not cover every type; missing
// types fall back to GENERIC_EXAMPLES.
export const NICHE_EXAMPLES: Record<NicheKey, Record<string, BlockExample>>;

/** Example overrides for a block type given an optional niche; {} if none. */
export function exampleFor(type: string, niche?: string): BlockExample;
```

- `exampleFor` returns `NICHE_EXAMPLES[niche]?.[type] ?? GENERIC_EXAMPLES[type]
  ?? {}` (so an unknown/empty niche, or an out-of-scope block type, yields the
  generic example or nothing — never throws).
- **Content sourcing:** `hero`, `imageText` (from `about`), `testimonials`,
  `faq`, `cta` are transcribed from each niche module's `landing_sections`
  (real copy). `richText`, `features`, `stats`, `banner` have no module
  counterpart and are **curated** per niche (short, on-topic, token-only — no
  invented stats presented as facts; numbers are clearly illustrative like
  "500+ students"). Repeater examples (`testimonials`, `faq`, `features`)
  include 2–3 `items` so the block isn't empty.
- Field keys for each block's overrides come from the registry's `defaultData` /
  `itemFields` (authored against the real schema, e.g. `hero` →
  `{heading, subheading, ctaText, ctaHref}`; `testimonials` →
  `{heading, items:[{...itemFields}]}`).

### 3. `newBlock(type, niche?)` merges the example

`registry.tsx`:

```ts
export function newBlock(type: string, niche?: string): Block {
  const def = BLOCK_REGISTRY[type];
  return {
    id: mintBlockId(),
    type,
    enabled: true,
    ...structuredClone(def?.defaultData ?? {}),
    ...structuredClone(exampleFor(type, niche)),
  };
}
```

The example overrides win over `defaultData` (incl. replacing empty `items`).
`structuredClone` keeps each new block's arrays/objects independent. Calling
`newBlock(type)` with no niche preserves today's behavior **except** that
in-scope types now get `GENERIC_EXAMPLES` — a deliberate improvement (richer
default), still generic.

### 4. Thread the niche through the editor store

- `EditorStoreProvider` gains a `niche?: string` prop; the store object exposes
  `niche: string` (immutable for the session — held outside the reducer, like a
  constant, set from the prop).
- `EditSidebar` passes `niche={initialConfig.niche}` when mounting the provider.
- `blocks-tab.tsx` and `canvas-dnd-provider.tsx` read `store.niche` and call
  `newBlock(type, store.niche)`.
- Frontend `TenantConfig` type gains `niche?: string`.

## Files

- Modify: `backend/apps/tenant_config/serializers.py` (expose `niche`).
- Create: `frontend-customer/src/lib/blocks/examples.ts` (the curated library).
- Modify: `frontend-customer/src/lib/blocks/registry.tsx` (`newBlock` signature).
- Modify: `frontend-customer/src/components/owner/canvas/editor-store.tsx`
  (`niche` prop + store field).
- Modify: `frontend-customer/src/components/owner/edit-sidebar.tsx` (pass niche).
- Modify: `frontend-customer/src/components/owner/blocks-tab.tsx` &
  `.../canvas/canvas-dnd-provider.tsx` (`newBlock(type, store.niche)`).
- Modify: `frontend-customer/src/types/tenant.ts` (`niche?: string`).

## Verification

1. `tsc --noEmit` clean for `frontend-customer`; `pytest` for the touched
   serializer (existing tenant_config tests stay green).
2. Dev stack, editor on a **yoga** tenant: add Testimonials / FAQ / Hero /
   Image+Text / CTA → each appears pre-filled with yoga copy (testimonials/FAQ
   have example items). Add Features / Stats / Banner → curated yoga examples.
3. Editor on a tenant with **no/unknown niche** → in-scope blocks get the
   GENERIC examples; nothing throws.
4. Dynamic blocks (Courses etc.) unchanged. Existing saved pages unchanged
   (examples apply only to newly-added blocks).
5. Token-only: example markup introduces no raw colors.

## Risks

Low. The only backend change is a read-only serializer field. Frontend changes
are additive; the one behavioral shift is that newly-added in-scope blocks are
no longer empty (intended). Content volume is the main effort — mitigated by
transcribing real module copy for 5 of 9 block types and a generic fallback so
partial niche coverage degrades gracefully.
