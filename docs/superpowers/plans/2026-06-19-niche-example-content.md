# Niche-aware Example Content on Add-Block (sub-project D) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (chosen: inline). Steps use checkbox (`- [ ]`) syntax.

**Goal:** When a coach adds a static content block, seed it with curated example content matching their niche (generic fallback when unknown).

**Architecture:** Expose a unified `niche` on the tenant_config serializer; a new frontend `examples.ts` holds per-niche curated overrides per block type (real copy transcribed from `demo_data/{niche}.py` for hero/imageText/testimonials/faq/cta; curated for richText/stats/banner; a generic fallback for all). `newBlock(type, niche?)` merges the example over `defaultData`. The niche is threaded through the editor store to both add-block call sites.

**Tech Stack:** Django/DRF (one serializer line), Next.js 14, React, TypeScript.

## Global Constraints

- Only one backend change: a read-only serializer field (no migration).
- Frontend additive; the one intended behavior shift is in-scope blocks add with
  example content instead of empty.
- Token-only color; example markup introduces no raw colors. `body` fields are
  richtext HTML strings.
- In-scope blocks: `hero, richText, imageText, testimonials, faq, cta, stats,
  banner`. Out: media blocks, contact, dynamic blocks (keep defaults).
- Commit per task (user's punch-list mode). Work dir: `~/ws/projects-in-progress/contentor`.

---

### Task 1: Expose `niche` on the tenant_config serializer

**Files:** Modify `backend/apps/tenant_config/serializers.py` (`to_representation`,
near the existing `demo_niche` line).

- [ ] **Step 1:** After the block that sets `data["demo_niche"]`, add:
  ```python
  data["niche"] = getattr(tenant, "template_niche", "") or data.get("demo_niche", "")
  ```
- [ ] **Step 2:** `make test` (or targeted `pytest apps/tenant_config`) — existing
  tests stay green; the field is additive.
- [ ] **Step 3:** Commit: `feat(tenant-config): expose unified niche (template/demo) in config API`.

---

### Task 2: Add `niche` to the frontend `TenantConfig` type

**Files:** Modify `frontend-customer/src/types/tenant.ts`.

- [ ] **Step 1:** Add `niche?: string;` to the `TenantConfig` interface (near
  `demo_niche?`).
- [ ] **Step 2:** Commit with Task 4 (type-only; or fold into Task 5 commit).

---

### Task 3: Create the example-content library `examples.ts`

**Files:** Create `frontend-customer/src/lib/blocks/examples.ts`.

- [ ] **Step 1:** Export `NicheKey` (the 7 niches), `GENERIC_EXAMPLES`,
  `NICHE_EXAMPLES`, and `exampleFor(type, niche?)` returning
  `NICHE_EXAMPLES[niche]?.[type] ?? GENERIC_EXAMPLES[type] ?? {}`.
- [ ] **Step 2:** For each niche, author overrides keyed by block type using the
  exact registry field keys:
  - `hero`: `{ heading, subheading, ctaText, ctaHref:"/courses" }` ← module `hero`
    (`headline`/`subheadline`/`cta_text`).
  - `imageText`: `{ heading, body:"<p>…</p>" }` ← module `about` (`heading`/`body`).
  - `richText`: `{ heading, body:"<p>…</p>" }` — a short niche intro (curated).
  - `testimonials`: `{ heading:"What Students Say", items:[{name,text}×3] }` ←
    module `testimonials` (drop `avatar_url`).
  - `faq`: `{ heading:"Frequently Asked Questions", items:[{q,a}×3-4] }` ← module `faq`.
  - `cta`: `{ heading, buttonText:"Join Now", buttonHref:"/courses" }` ← module `cta`.
  - `stats`: `{ heading, items:[{value,label}×3] }` — illustrative numbers
    (e.g. `"500+"/"Students"`, `"30+"/"Hours of video"`, `"4.9★"/"Average rating"`).
  - `banner`: `{ text, linkText:"Browse programs", linkHref:"/courses" }` — short
    niche announcement.
  - `GENERIC_EXAMPLES`: niche-neutral versions of all eight (reuse the existing
    `defaultData`-style copy, fleshed out with 2-3 example items for repeaters).
- [ ] **Step 3:** `tsc --noEmit` clean.
- [ ] **Step 4:** Commit: `feat(site-builder): add niche-aware example-content library`.

---

### Task 4: Merge the example in `newBlock(type, niche?)`

**Files:** Modify `frontend-customer/src/lib/blocks/registry.tsx`.

- [ ] **Step 1:** Import `exampleFor` from `./examples`.
- [ ] **Step 2:** Change `newBlock` to:
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
- [ ] **Step 3:** `tsc --noEmit` clean. Commit:
  `feat(site-builder): newBlock seeds niche-aware example content`.

---

### Task 5: Thread `niche` through the editor store + callers

**Files:** Modify `editor-store.tsx`, `edit-sidebar.tsx`, `blocks-tab.tsx`,
`canvas/canvas-dnd-provider.tsx`, and (Task 2) `types/tenant.ts`.

- [ ] **Step 1:** `editor-store.tsx`: add `niche?: string` to
  `EditorStoreProviderProps`; expose `niche: string` on the `EditorStore` object
  (held as a constant from the prop, default `""` — not part of the reducer).
- [ ] **Step 2:** `edit-sidebar.tsx`: pass `niche={initialConfig.niche}` (or
  `?? ""`) to `<EditorStoreProvider>`.
- [ ] **Step 3:** `blocks-tab.tsx`: `store.insertBlock(pageKey, newBlock(type, store.niche))`.
- [ ] **Step 4:** `canvas-dnd-provider.tsx`: `newBlock(paletteTypeFromId(activeIdStr), store.niche)`.
- [ ] **Step 5:** `tsc --noEmit` clean. Commit:
  `feat(site-builder): thread tenant niche to add-block so new blocks get niche examples`.

---

### Task 6: Verification

- [ ] `tsc --noEmit` clean; `pytest apps/tenant_config` green.
- [ ] Dev stack, editor on a **yoga** tenant (e.g. `demo-yoga.localhost` or a
  template-seeded tenant): add Testimonials/FAQ/Hero/Image+Text/CTA/Stats/Banner →
  each pre-fills with yoga copy; repeaters have example items.
- [ ] Editor on a tenant with **no niche** → in-scope blocks get GENERIC examples;
  nothing throws; dynamic blocks unchanged.
- [ ] Tear down `docker compose down` (NOT -v).

## Self-Review

- Spec coverage: niche exposure (T1), library (T3), newBlock merge (T4),
  threading (T5), type (T2), verify (T6). ✓
- Field-key consistency: hero/imageText/testimonials(`name,text`)/faq(`q,a`)/cta/
  stats(`value,label`)/banner(`text,linkText,linkHref`) match the registry. ✓
- Fallback: `exampleFor` never throws; unknown niche/type → generic or `{}`. ✓
