# AI Custom Components — P0 + P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A coach types "describe a section" in the site editor and, within seconds, an AI-built section appears on the canvas. It renders natively in any of the 20 site styles, is saved for the coach, and can be changed with AI.

**Architecture:** The AI outputs a *spec* (data, never code). The spec composes primitives from a shared catalog (`packages/shared/src/cx/primitives.json`). A catalog-driven Python validator is the trust boundary on every write. The spec is snapshotted into a `type: "cx"` block in `TenantConfig.pages`. A plain-function `SpecRenderer` walks it with the active style's **StyleKit**, so the same tree server-renders for visitors and client-renders on the coach's canvas. Generated components are also recorded in a public-schema registry (`CxComponent`/`CxVersion`), private to the author in P1.

**Tech Stack:** Django 5.1 + DRF + django-tenants + pydantic (backend). Next.js 14 + React 18 + Tailwind (frontend-customer). vitest, pytest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-08-ai-custom-components-design.md` (read it first; this plan implements its phases P0 and P1).

### P1 scope decisions (deliberate deviations from the spec, flag in review if you disagree)

1. **Metering:** compose and refine use the existing **Site AI** meter (`apps/core/onboarding/site_ai.py`: `availability`, `record_attempt_cost`, `record_update`, plan field `max_site_ai_updates`). There is no new `CxAiUsage` yet: the owner hasn't set component quota numbers. Split it out when they do.
2. **No registry-first AI step in P1.** The coach re-adds their own earlier sections from a "Your sections" list in one click. AI reuse of library components comes with the shared library in P2.
3. **The AI answer is flat** (nodes carry a `parent` id; sub-fields carry a `parent` items field). Recursive JSON schemas aren't portable across providers' structured output (Gemini, Anthropic). `assemble()` rebuilds the nested spec server-side. pydantic validates the envelope; the catalog-driven validator owns the tree.
4. **Props sit flat on nodes.** There's no `knobs` sub-object: numeric knobs (`cols`, `aspect`) are ordinary props with catalog ranges.
5. **Deferred to P2:** `styleAffinity` and named ornaments, the variant target ("new look for an existing family"), the sharing fields on `CxComponent` (tags, niches, adopters, structural hash, example content, checks, `keep_private`), and capability-gap storage. P1 returns `missing` to the coach and logs it on the version.
6. **No per-block style overrides for `cx` blocks,** same as styled `section.*` blocks.
7. **No "Designing…" placeholder block.** The Create button shows its loading state instead.
8. **The spec's Kicker and Price atoms are folded in:** `Opener` covers the kicker, and `Label`/`Text` cover prices.

## Global Constraints

- Specs never carry code: no HTML, CSS, class names or raw colours. Renderers emit only **literal** class strings, and spec values reach the DOM only as text, `src`/`href` from cleaned fields, or clamped numbers in inline `style` (`aspectRatio`, `--cx-cols`).
- Budgets: **≤ 150 nodes, depth ≤ 8, ≤ 16 KB serialized, ≤ 24 top-level fields** (catalog `limits`).
- Field types: top level `text | richtext | link | image | items`; inside items `text | link | image`. Image aspects: `1:1, 4:5, 3:4, 2:3, 3:2, 4:3, 16:9`. Field names match `^[a-z][a-zA-Z0-9]{0,23}$` and are never `id, type, variant, enabled, style, cx`.
- `dynamic` is `null | "courses" | "plans" | "events"`.
- The spec is validated on **every** write (trust boundary). Rendering never reads the public schema: blocks carry the spec snapshot.
- AI content never invents credentials, testimonials, reviews, prices, numbers, dates, names or quotes.
- Coach-facing UI uses plain language: no JSON, slugs or ids (memory: coaches are non-technical). Loading conventions: `<Button loading loadingText>`, `useAsyncAction`, sonner toasts, `<NavLink>` (checked by `make lint`).
- **Repo rules:** never commit unless the user has authorized commits for this run; if not, skip every "Commit" step and leave the changes in the working tree. Pre-commit must be clean. Don't create other `.md` files.
- **Shared working tree:** other sessions edit this checkout concurrently (e.g. `serializers.py`, `sections.py` and `base.py` have foreign uncommitted hunks today). Before any commit, run `git status` and `git diff --stat` on every file you touched. If a file holds hunks that aren't yours, don't commit it: stop and ask the user. Always `git add <explicit paths>`, never `-A`.
- **Machine:** one heavy job at a time (full suite, e2e, build). Run focused tests per task; the full backend suite runs once, in Task 13.
- Commands run in the containers: backend `docker compose exec django pytest <path> -q`; frontend `docker compose exec nextjs-customer npx vitest run <path>`; typecheck `docker compose exec nextjs-customer npm run typecheck`. Check `make health-check` first; start with `make dev-d` if it's down.
- GitNexus `impact` is required before editing `_clean_block` (Task 4) and `BlockRenderer` (Task 10). Report the risk level; stop on HIGH/CRITICAL.

## Review Focus

The five failure modes most likely to bite a real coach that the spec implies but doesn't spell out, each pinned by a test in its owning task:

1. **Autosave round-trip:** the editor PATCHes the whole block (with `cx.spec`) every 800 ms. Validation must be a fixed point, or every save mutates the section. Tests: Task 3 `test_canonical_spec_is_a_fixed_point`, Task 4 `test_saved_block_survives_a_second_save`.
2. **Hostile or garbage PATCH:** a hand-written `pages` payload with class strings, `javascript:` links, unknown primitives, 5000 nodes, `cx: null` or missing `cx` must be cleaned or dropped, never 500. Test: Task 4 `test_pages_patch_with_hostile_cx_blocks_never_breaks`.
3. **The AI fails or answers badly twice:** the coach gets one friendly error, no quota credit is consumed, and the cost is still recorded. Tests: Task 7 `test_nothing_usable_is_a_friendly_error_that_costs_no_credit`, `test_a_still_flawed_answer_is_used_in_its_cleaned_form`.
4. **Style switched, unknown, or legacy (`""`):** a `cx` block still renders, with that style's kit or `DEFAULT_KIT`, never blank. Test: Task 9 `falls back to the neutral kit for an unknown or empty style`.
5. **Empty item list or missing photo on the public site:** no editor hint leaks to visitors and nothing crashes; in edit mode a hint appears. Tests: Task 9 `an empty item list leaves no editor hint…` / `…shows a hint while editing`.

## File map

| File | Responsibility |
|---|---|
| `frontend-customer/src/components/sections/kit-contract.tsx` | **new**: `StyleKit` type, `defineKit()`, `DEFAULT_KIT` |
| `frontend-customer/src/components/sections/<style>/index.ts` ×20 | add `export const kit = defineKit({...})` |
| `frontend-customer/src/components/sections/{kinetic,pop}/ui.tsx` | add a tone-based `Section` (adapters) |
| `frontend-customer/src/components/sections/all-styles.ts` | also export `STYLE_KITS` |
| `packages/shared/src/cx/primitives.json`, `types.ts` | **new**: catalog (source of truth) + TS types |
| `scripts/sync_sections.py` | also syncs `cx/primitives.json` into the backend |
| `backend/apps/tenant_config/cx/` | **new package**: `catalog.py`, `validate.py`, `blocks.py`, `draft.py`, `prompt.py`, `compose.py`, `views.py` |
| `backend/apps/tenant_config/{defaults,serializers,urls}.py` | `cx` block type, write-path branch, routes |
| `backend/apps/core/models.py` + migration | `CxComponent`, `CxVersion` |
| `frontend-customer/src/components/cx/` | **new**: `context.ts`, `atoms.tsx`, `patterns.tsx`, `layout-embed.tsx`, `primitives.ts`, `spec-renderer.tsx`, `cx-block.tsx` |
| `frontend-customer/src/lib/blocks/{types.ts,registry.tsx,section-defs.ts,cx-defs.ts}` | block-system wiring |
| `frontend-customer/src/components/blocks/{block-renderer,page-renderer,page-view}.tsx`, `owner/canvas/{edit-mode-canvas,sortable-block-shell}.tsx` | pass the style id down |
| `frontend-customer/src/lib/cx/api.ts`, `components/owner/{cx-composer,cx-refine,blocks-tab,block-form}.tsx` | editor UI |
| `e2e/specs/30-custom-components.spec.ts`, `e2e/impact-map.json` | end-to-end check |

---

## P0 — StyleKit contract

### Task 1: StyleKit contract and a kit for every style

**Files:**
- Create: `frontend-customer/src/components/sections/kit-contract.tsx`
- Modify: `frontend-customer/src/components/sections/kinetic/ui.tsx`, `frontend-customer/src/components/sections/pop/ui.tsx` (add a `Section`)
- Modify: the `index.ts` of all 20 styles under `frontend-customer/src/components/sections/`
- Modify: `frontend-customer/src/components/sections/all-styles.ts`
- Test: `frontend-customer/src/components/sections/__tests__/kit-contract.test.ts`

**Interfaces:**
- Produces: `type KitTone = "base" | "surface" | "inverse"`, `interface StyleKit { id; wrap; display; h2; h3; label; num; button: {primary; ghost; onInverse}; card; media: Record<"frame"|"arch"|"circle"|"polaroid", string>; Section: ComponentType<{tone: KitTone; label?: string; children: ReactNode}>; Kicker; Opener: ComponentType<{block: Block; editable?: EditableContext; className?: string}>; ornaments: Partial<Record<"divider"|"glyph", ComponentType<{className?: string}>>> }`, `defineKit<T>(def): StyleKit`, `DEFAULT_KIT`, and `STYLE_KITS: Record<string, StyleKit>` from `all-styles.ts`.

- [ ] **Step 1: Write the failing test**

`frontend-customer/src/components/sections/__tests__/kit-contract.test.ts`:

```ts
import type { ReactNode } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// NavLink needs the Next app router; a plain anchor is enough here.
vi.mock("@/components/ui/nav-link", async () => {
  const { createElement: h } = await vi.importActual<typeof import("react")>("react");
  return {
    NavLink: ({ href, className, children }: { href: string; className?: string; children?: ReactNode }) =>
      h("a", { href, className }, children),
  };
});

import { SITE_STYLES } from "@shared/sections/styles";
import type { Block } from "@/types/tenant";
import { STYLE_KITS } from "../all-styles";
import { DEFAULT_KIT, type KitTone } from "../kit-contract";

const TONES: KitTone[] = ["base", "surface", "inverse"];
const BLOCK: Block = { id: "blk_kit00001", type: "cx", kicker: "Kicker words", heading: "Heading words", intro: "Intro words" };
const ALL = () => [...Object.values(STYLE_KITS), DEFAULT_KIT];

describe("StyleKit contract", () => {
  it("every site style ships a kit under its own id", () => {
    expect(Object.keys(STYLE_KITS).sort()).toEqual(Object.keys(SITE_STYLES).sort());
    for (const [id, kit] of Object.entries(STYLE_KITS)) expect(kit.id).toBe(id);
  });

  it("each kit's Section renders every tone", () => {
    for (const kit of ALL()) {
      for (const tone of TONES) {
        const html = renderToStaticMarkup(createElement(kit.Section, { tone, label: "x", children: "band body" }));
        expect(html, `${kit.id}/${tone}`).toContain("band body");
      }
    }
  });

  it("each kit's Opener renders the heading", () => {
    for (const kit of ALL()) {
      expect(renderToStaticMarkup(createElement(kit.Opener, { block: BLOCK })), kit.id).toContain("Heading words");
    }
  });

  it("every class slot is filled", () => {
    for (const kit of ALL()) {
      for (const slot of [kit.h2, kit.h3, kit.display, kit.label, kit.button.primary, kit.button.ghost, kit.button.onInverse, kit.card]) {
        expect(slot, kit.id).toBeTruthy();
      }
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `docker compose exec nextjs-customer npx vitest run src/components/sections/__tests__/kit-contract.test.ts`
Expected: FAIL. `../kit-contract` cannot be resolved / `STYLE_KITS` is not exported.

- [ ] **Step 3: Create the contract**

`frontend-customer/src/components/sections/kit-contract.tsx`:

```tsx
/**
 * The StyleKit contract: the slots every site style fills so AI-built
 * sections (components/cx) render natively in any style. Styles keep their
 * own constants for their hand-built sections; a kit only names them.
 * Unset slots get neutral, token-only defaults.
 */
import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { EditableContext } from "@/lib/blocks/types";
import type { Block } from "@/types/tenant";
import { Txt, has } from "./kit";

export type KitTone = "base" | "surface" | "inverse";
export type OrnamentSlot = "divider" | "glyph";
export type MediaTreatment = "frame" | "arch" | "circle" | "polaroid";

type BlockPart = ComponentType<{ block: Block; editable?: EditableContext; className?: string }>;
type Ornament = ComponentType<{ className?: string }>;

export interface StyleKit {
  id: string;
  /** Inner measure (max width + side padding) content aligns to. */
  wrap: string;
  display: string;
  h2: string;
  h3: string;
  /** The style's caption voice (kickers, labels). */
  label: string;
  /** Tabular figures. */
  num: string;
  button: { primary: string; ghost: string; onInverse: string };
  card: string;
  media: Record<MediaTreatment, string>;
  Section: ComponentType<{ tone: KitTone; label?: string; children: ReactNode }>;
  Kicker: BlockPart;
  Opener: BlockPart;
  ornaments: Partial<Record<OrnamentSlot, Ornament>>;
}

export interface KitDefinition<T extends string> {
  id: string;
  wrap: string;
  h2: string;
  h3: string;
  display?: string;
  label?: string;
  num?: string;
  button: { primary: string; ghost?: string; onInverse?: string };
  card?: string;
  media?: Partial<Record<MediaTreatment, string>>;
  /** Kit tone → the style's own Section tone. */
  tones: Record<KitTone, T>;
  Section: ComponentType<{ tone?: T; label?: string; className?: string; children: ReactNode }>;
  Kicker?: BlockPart;
  Opener?: BlockPart;
  ornaments?: Partial<Record<OrnamentSlot, Ornament>>;
}

const DEFAULT_LABEL = "text-[0.72rem] font-medium uppercase tracking-[0.16em]";
const DEFAULT_GHOST =
  "inline-flex min-h-11 items-center gap-2 underline decoration-1 underline-offset-[6px] transition-colors hover:text-primary";
const DEFAULT_CARD = "rounded-[var(--radius)] border border-border bg-card p-6 text-card-foreground md:p-8";
const DEFAULT_MEDIA: Record<MediaTreatment, string> = {
  frame: "border border-border p-2 sm:p-3",
  arch: "rounded-t-[999px]",
  circle: "rounded-full",
  polaroid: "-rotate-1 bg-card p-3 pb-12 shadow-lg",
};

function makeKicker(label: string): BlockPart {
  return function KitKicker({ block, editable, className }) {
    if (!has(block, "kicker", editable)) return null;
    return (
      <Txt
        block={block}
        field="kicker"
        editable={editable}
        as="p"
        placeholder="Kicker"
        className={cn(label, "text-muted-foreground", className)}
      />
    );
  };
}

function makeOpener(Kicker: BlockPart, h2: string): BlockPart {
  return function KitOpener({ block, editable, className }) {
    return (
      <div className={cn("flex flex-col", className)}>
        <Kicker block={block} editable={editable} />
        <Txt
          block={block}
          field="heading"
          editable={editable}
          as="h2"
          placeholder="Heading"
          className={cn(h2, "mt-4 block max-w-[22ch]")}
        />
        {has(block, "intro", editable) && (
          <Txt
            block={block}
            field="intro"
            editable={editable}
            as="p"
            placeholder="Intro"
            className="mt-6 block max-w-[52ch] text-pretty text-lg/relaxed text-muted-foreground"
          />
        )}
      </div>
    );
  };
}

/** Build a style's kit from its own constants. */
export function defineKit<T extends string>(def: KitDefinition<T>): StyleKit {
  const { Section: StyleSection, tones } = def;
  const label = def.label ?? DEFAULT_LABEL;
  const Kicker = def.Kicker ?? makeKicker(label);
  function KitSection({ tone, label: aria, children }: { tone: KitTone; label?: string; children: ReactNode }) {
    return (
      <StyleSection tone={tones[tone]} label={aria}>
        {children}
      </StyleSection>
    );
  }
  return {
    id: def.id,
    wrap: def.wrap,
    display: def.display ?? def.h2,
    h2: def.h2,
    h3: def.h3,
    label,
    num: def.num ?? "tabular-nums",
    button: {
      primary: def.button.primary,
      ghost: def.button.ghost ?? DEFAULT_GHOST,
      onInverse: def.button.onInverse ?? def.button.primary,
    },
    card: def.card ?? DEFAULT_CARD,
    media: { ...DEFAULT_MEDIA, ...def.media },
    Section: KitSection,
    Kicker,
    Opener: def.Opener ?? makeOpener(Kicker, def.h2),
    ornaments: def.ornaments ?? {},
  };
}

const DEFAULT_TONES: Record<KitTone, string> = {
  base: "bg-background text-foreground",
  surface: "bg-muted text-foreground",
  inverse: "bg-[var(--inverse,var(--foreground))] text-[color:var(--inverse-foreground,var(--background))]",
};

function DefaultSection({
  tone = "base",
  label,
  className,
  children,
}: {
  tone?: KitTone;
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={label || undefined}
      className={cn("relative w-full py-20 md:py-28", DEFAULT_TONES[tone], className)}
    >
      {children}
    </section>
  );
}

/** Neutral kit for tenants without a site style, or with an unknown one. */
export const DEFAULT_KIT = defineKit({
  id: "default",
  wrap: "mx-auto w-full max-w-6xl px-5 md:px-8",
  display: "font-display text-balance text-[clamp(2.5rem,1.5rem+4vw,4.75rem)]/[1.02] tracking-tight",
  h2: "font-display text-balance text-[clamp(2rem,1.4rem+2.4vw,3.5rem)]/[1.05] tracking-tight",
  h3: "font-display text-balance text-xl/snug",
  button: {
    primary:
      "inline-flex min-h-11 items-center justify-center rounded-[var(--radius)] bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
  },
  tones: { base: "base", surface: "surface", inverse: "inverse" },
  Section: DefaultSection,
});
```

- [ ] **Step 4: Add tone-based Sections to the two styles that lack one**

In `frontend-customer/src/components/sections/kinetic/ui.tsx`, add after the `BTN` constant (`ReactNode` and `cn` are already imported):

```tsx
type Tone = "paper" | "iron" | "ink";

const TONES: Record<Tone, string> = {
  paper: "kinetic-paper",
  iron: "kinetic-iron",
  ink: "kinetic-ink",
};

/** A plain band on one of the style's three grounds (kinetic.css). Used by
 *  AI-built sections; the hand-built layouts set their own grounds. */
export function Section({
  tone = "paper",
  className,
  children,
  label,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
  label?: string;
}) {
  return (
    <section aria-label={label || undefined} className={cn(TONES[tone], "relative py-20 md:py-32", className)}>
      {children}
    </section>
  );
}
```

In `frontend-customer/src/components/sections/pop/ui.tsx`, add after `PopSection` (`ReactNode` and `cn` are already imported):

```tsx
type Tone = "paper" | "lilac" | "plum";

const TONES: Record<Tone, { bg: string; fg?: string; dark?: boolean }> = {
  paper: { bg: "var(--background)" },
  lilac: { bg: "var(--card)" },
  plum: { bg: "var(--inverse)", fg: "var(--inverse-foreground)", dark: true },
};

/** A PopSection on one of three grounds. Used by AI-built sections. */
export function Section({
  tone = "paper",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
  label?: string;
}) {
  const t = TONES[tone];
  return (
    <PopSection bg={t.bg} fg={t.fg} dark={t.dark} className={cn("py-20 md:py-28", className)}>
      {children}
    </PopSection>
  );
}
```

- [ ] **Step 5: Add a kit to each style's `index.ts`**

Append to each file after its existing imports and `sections` export. Each block is complete; all names exist in that style's `ui.tsx` (verified 2026-10-08).

`atelier/index.ts`:
```ts
import { defineKit } from "../kit-contract";
import { ARCH, BTN, BTN_GHOST, BTN_ON_INVERSE, Diamond, Divider, H1, H2, H3, Kicker, LABEL, NUM, Opener, Section, WRAP } from "./ui";

/** Atelier's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "atelier", wrap: WRAP, display: H1, h2: H2, h3: H3, label: LABEL, num: NUM,
  button: { primary: BTN, ghost: BTN_GHOST, onInverse: BTN_ON_INVERSE },
  media: { arch: ARCH },
  tones: { base: "blush", surface: "surface", inverse: "inverse" },
  Section, Kicker, Opener,
  ornaments: { divider: Divider, glyph: Diamond },
});
```

`darkroom/index.ts`:
```ts
import { defineKit } from "../kit-contract";
import { BTN, BTN_ON_BLACK, Dot, H1, H2, H3, Kicker, LABEL, LINK, Opener, Section, WRAP } from "./ui";

/** Darkroom's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "darkroom", wrap: WRAP, display: H1, h2: H2, h3: H3, label: LABEL,
  button: { primary: BTN, ghost: LINK, onInverse: BTN_ON_BLACK },
  tones: { base: "wall", surface: "surface", inverse: "black" },
  Section, Kicker, Opener,
  ornaments: { glyph: Dot },
});
```

`dojo/index.ts`:
```ts
import { defineKit } from "../kit-contract";
import { BTN, BTN_GHOST, BTN_ON_INK, Enso, H1, H2, H3, Kicker, LABEL, NUM, Opener, Section, WRAP } from "./ui";

/** Dojo's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "dojo", wrap: WRAP, display: H1, h2: H2, h3: H3, label: LABEL, num: NUM,
  button: { primary: BTN, ghost: BTN_GHOST, onInverse: BTN_ON_INK },
  tones: { base: "rice", surface: "surface", inverse: "ink" },
  Section, Kicker, Opener,
  ornaments: { glyph: Enso },
});
```

`encore/index.ts`:
```ts
import { defineKit } from "../kit-contract";
import { BTN, BTN_ON_INK, DISPLAY, H2, H3, Kicker, LABEL, NUM, Opener, Section, Stars, WRAP } from "./ui";

/** Encore's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "encore", wrap: WRAP, display: DISPLAY, h2: H2, h3: H3, label: LABEL, num: NUM,
  button: { primary: BTN, onInverse: BTN_ON_INK },
  tones: { base: "stock", surface: "surface", inverse: "ink" },
  Section, Kicker, Opener,
  ornaments: { glyph: Stars },
});
```

`ledger/index.ts` (no `Kicker` export, so the default kicker uses `LABEL`):
```ts
import { defineKit } from "../kit-contract";
import { BTN, BTN_GHOST, BTN_ON_NAVY, H1, H2, H3, LABEL, NUM, Opener, Section, WRAP } from "./ui";

/** Ledger's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "ledger", wrap: WRAP, display: H1, h2: H2, h3: H3, label: LABEL, num: NUM,
  button: { primary: BTN, ghost: BTN_GHOST, onInverse: BTN_ON_NAVY },
  tones: { base: "bone", surface: "surface", inverse: "navy" },
  Section, Opener,
});
```

`maison/index.ts`:
```ts
import { defineKit } from "../kit-contract";
import { BTN, BTN_ON_BLACK, FRAME, H1, H2, H3, Kicker, LABEL, NUM, Opener, Section, WRAP } from "./ui";

/** Maison's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "maison", wrap: WRAP, display: H1, h2: H2, h3: H3, label: LABEL, num: NUM,
  button: { primary: BTN, onInverse: BTN_ON_BLACK },
  media: { frame: FRAME },
  tones: { base: "ivory", surface: "surface", inverse: "black" },
  Section, Kicker, Opener,
});
```

`manuscript/index.ts`:
```ts
import { defineKit } from "../kit-contract";
import { BTN, BTN_GHOST, BTN_ON_INVERSE, DoubleRule, Fleuron, H1, H2, H3, Kicker, LABEL, NUM, Opener, Section, WRAP } from "./ui";

/** Manuscript's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "manuscript", wrap: WRAP, display: H1, h2: H2, h3: H3, label: LABEL, num: NUM,
  button: { primary: BTN, ghost: BTN_GHOST, onInverse: BTN_ON_INVERSE },
  tones: { base: "paper", surface: "surface", inverse: "inverse" },
  Section, Kicker, Opener,
  ornaments: { divider: DoubleRule, glyph: Fleuron },
});
```

`nocturne/index.ts`:
```ts
import { defineKit } from "../kit-contract";
import { ARCH, BTN, BTN_GHOST, BTN_ON_CREAM, H1, H2, H3, Kicker, LABEL, NUM, Opener, Section, WRAP } from "./ui";

/** Nocturne's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "nocturne", wrap: WRAP, display: H1, h2: H2, h3: H3, label: LABEL, num: NUM,
  button: { primary: BTN, ghost: BTN_GHOST, onInverse: BTN_ON_CREAM },
  media: { arch: ARCH },
  tones: { base: "night", surface: "surface", inverse: "cream" },
  Section, Kicker, Opener,
});
```

`primer/index.ts`:
```ts
import { defineKit } from "../kit-contract";
import { BTN, BTN_GHOST, BTN_ON_INK, H1, H2, H3, Kicker, LABEL, NUM, Opener, Section, WRAP } from "./ui";

/** Primer's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "primer", wrap: WRAP, display: H1, h2: H2, h3: H3, label: LABEL, num: NUM,
  button: { primary: BTN, ghost: BTN_GHOST, onInverse: BTN_ON_INK },
  tones: { base: "paper", surface: "ruled", inverse: "ink" },
  Section, Kicker, Opener,
});
```

`sanctum/index.ts`:
```ts
import { defineKit } from "../kit-contract";
import { BTN, BTN_GHOST, BTN_ON_LUMINOUS, H1, H2, H3, Kicker, LABEL, MoonPhases, NUM, Opener, Section, StarGlyph, WRAP } from "./ui";

/** Sanctum's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "sanctum", wrap: WRAP, display: H1, h2: H2, h3: H3, label: LABEL, num: NUM,
  button: { primary: BTN, ghost: BTN_GHOST, onInverse: BTN_ON_LUMINOUS },
  tones: { base: "temple", surface: "surface", inverse: "luminous" },
  Section, Kicker, Opener,
  ornaments: { divider: MoonPhases, glyph: StarGlyph },
});
```

`sprout/index.ts` (no `LABEL`, so the default label is used):
```ts
import { defineKit } from "../kit-contract";
import { BTN, BTN_GHOST, BTN_ON_INVERSE, CARD, H1, H2, H3, Kicker, NUM, Opener, Section, SunDoodle, WRAP } from "./ui";

/** Sprout's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "sprout", wrap: WRAP, display: H1, h2: H2, h3: H3, num: NUM,
  button: { primary: BTN, ghost: BTN_GHOST, onInverse: BTN_ON_INVERSE },
  card: CARD,
  tones: { base: "paper", surface: "surface", inverse: "inverse" },
  Section, Kicker, Opener,
  ornaments: { glyph: SunDoodle },
});
```

`studiofloor/index.ts`:
```ts
import { defineKit } from "../kit-contract";
import { BTN, BTN_GHOST, BTN_ON_INVERSE, H1, H2, H3, Kicker, LABEL, NUM, Opener, Section, WRAP } from "./ui";

/** Studio Floor's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "studiofloor", wrap: WRAP, display: H1, h2: H2, h3: H3, label: LABEL, num: NUM,
  button: { primary: BTN, ghost: BTN_GHOST, onInverse: BTN_ON_INVERSE },
  tones: { base: "stage", surface: "surface", inverse: "spotlight" },
  Section, Kicker, Opener,
});
```

`tavola/index.ts`:
```ts
import { defineKit } from "../kit-contract";
import { BTN, BTN_GHOST, BTN_ON_BOARD, CARD, H1, H2, H3, Kicker, LABEL, NUM, Opener, Section, WRAP } from "./ui";

/** Tavola's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "tavola", wrap: WRAP, display: H1, h2: H2, h3: H3, label: LABEL, num: NUM,
  button: { primary: BTN, ghost: BTN_GHOST, onInverse: BTN_ON_BOARD },
  card: CARD,
  tones: { base: "awning", surface: "cream", inverse: "board" },
  Section, Kicker, Opener,
});
```

`terminal/index.ts`:
```ts
import { defineKit } from "../kit-contract";
import { BTN, BTN_GHOST, BTN_ON_INVERSE, Cursor, H1, H2, H3, Kicker, LABEL, NUM, Opener, Section, WRAP } from "./ui";

/** Terminal's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "terminal", wrap: WRAP, display: H1, h2: H2, h3: H3, label: LABEL, num: NUM,
  button: { primary: BTN, ghost: BTN_GHOST, onInverse: BTN_ON_INVERSE },
  tones: { base: "console", surface: "surface", inverse: "inverse" },
  Section, Kicker, Opener,
  ornaments: { glyph: Cursor },
});
```

`trail/index.ts`:
```ts
import { defineKit } from "../kit-contract";
import { BTN, BTN_GHOST, BTN_ON_PINE, CARD, H1, H2, H3, Kicker, LABEL, NUM, Opener, Section, WRAP } from "./ui";

/** Trail's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "trail", wrap: WRAP, display: H1, h2: H2, h3: H3, label: LABEL, num: NUM,
  button: { primary: BTN, ghost: BTN_GHOST, onInverse: BTN_ON_PINE },
  card: CARD,
  tones: { base: "stone", surface: "surface", inverse: "pine" },
  Section, Kicker, Opener,
});
```

`workshop/index.ts` (its caption voice is `HAND`):
```ts
import { defineKit } from "../kit-contract";
import { BTN, BTN_GHOST, BTN_ON_INK, CARD, H1, H2, H3, HAND, HandArrow, Kicker, NUM, Opener, Section, WRAP } from "./ui";

/** Workshop's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "workshop", wrap: WRAP, display: H1, h2: H2, h3: H3, label: HAND, num: NUM,
  button: { primary: BTN, ghost: BTN_GHOST, onInverse: BTN_ON_INK },
  card: CARD,
  tones: { base: "kraft", surface: "lined", inverse: "inverse" },
  Section, Kicker, Opener,
  ornaments: { glyph: HandArrow },
});
```

`journal/index.ts` (no `Opener`, so the default is built from its `Kicker` and `H2`):
```ts
import { defineKit } from "../kit-contract";
import { H1, H2, H3, Kicker, LABEL, PILL, PILL_ON_MOSS, Section, WRAP } from "./ui";

/** Journal's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "journal", wrap: WRAP, display: H1, h2: H2, h3: H3, label: LABEL,
  button: { primary: PILL, onInverse: PILL_ON_MOSS },
  tones: { base: "paper", surface: "surface", inverse: "moss" },
  Section, Kicker,
});
```

`kinetic/index.ts`:
```ts
import { cn } from "@/lib/utils";
import { defineKit } from "../kit-contract";
import { BTN, DISPLAY, H2, Kicker, LABEL, Section, WRAP } from "./ui";

/** Kinetic's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "kinetic", wrap: WRAP,
  display: cn(DISPLAY, "text-[clamp(3.25rem,1rem+7vw,8rem)]"),
  h2: cn(DISPLAY, H2),
  h3: cn(DISPLAY, "text-[clamp(1.6rem,1.1rem+1.6vw,2.4rem)]"),
  label: LABEL,
  button: { primary: cn(BTN, LABEL, "items-center px-6 text-[0.8rem]") },
  tones: { base: "paper", surface: "iron", inverse: "ink" },
  Section, Kicker,
});
```

`grid/index.ts` (`Sheet` already caps the width, so `wrap` is empty; `Head` is the opener):
```ts
import { defineKit } from "../kit-contract";
import { Head, Sheet, btn } from "./ui";

/** Swiss Grid's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "grid", wrap: "", display: "swiss-h1", h2: "swiss-h2", h3: "swiss-h3", label: "swiss-mono",
  button: { primary: btn.primary, ghost: btn.outline, onInverse: btn.onCobalt },
  tones: { base: "paper", surface: "fog", inverse: "cobalt" },
  Section: Sheet,
  Opener: Head,
});
```

`pop/index.ts`:
```ts
import { defineKit } from "../kit-contract";
import { Kicker, Section, WRAP } from "./ui";

/** Pop's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "pop", wrap: WRAP, display: "pop-display pop-h1", h2: "pop-display pop-h2", h3: "pop-h3", label: "pop-mono",
  button: { primary: "pop-btn pop-btn-primary", ghost: "pop-btn pop-btn-paper", onInverse: "pop-btn pop-btn-paper" },
  card: "pop-card p-6 md:p-8",
  tones: { base: "paper", surface: "lilac", inverse: "plum" },
  Section, Kicker,
});
```

- [ ] **Step 6: Export `STYLE_KITS`**

Replace the body of `frontend-customer/src/components/sections/all-styles.ts`:

```ts
import type { StyleKit } from "./kit-contract";
import type { StyleSections } from "./types";
import * as atelier from "./atelier";
import * as darkroom from "./darkroom";
import * as dojo from "./dojo";
import * as encore from "./encore";
import * as grid from "./grid";
import * as journal from "./journal";
import * as kinetic from "./kinetic";
import * as ledger from "./ledger";
import * as maison from "./maison";
import * as manuscript from "./manuscript";
import * as nocturne from "./nocturne";
import * as pop from "./pop";
import * as primer from "./primer";
import * as sanctum from "./sanctum";
import * as sprout from "./sprout";
import * as studiofloor from "./studiofloor";
import * as tavola from "./tavola";
import * as terminal from "./terminal";
import * as trail from "./trail";
import * as workshop from "./workshop";

/** Every style module, in build order. */
const MODULES = {
  journal, kinetic, grid, pop, ledger, darkroom, nocturne, primer, tavola, encore,
  trail, maison, studiofloor, atelier, dojo, workshop, terminal, sprout, manuscript, sanctum,
};

export const STYLE_SECTION_MODULES: Record<string, Partial<StyleSections>> = Object.fromEntries(
  Object.entries(MODULES).map(([id, mod]) => [id, mod.sections]),
);

/** style id → its StyleKit (what AI-built sections render with). */
export const STYLE_KITS: Record<string, StyleKit> = Object.fromEntries(
  Object.entries(MODULES).map(([id, mod]) => [id, mod.kit]),
);
```

- [ ] **Step 7: Run the test and the typecheck**

Run: `docker compose exec nextjs-customer npx vitest run src/components/sections/__tests__/kit-contract.test.ts`
Expected: PASS (4 tests).
If a style module fails to import in the vitest environment, mock that module the way `nav-link` is mocked. Don't change product code to satisfy the test.

Run: `docker compose exec nextjs-customer npm run typecheck`
Expected: exit 0. A tone typo (e.g. `"wal"`) fails here, because `tones` values are checked against each style's own `Section` tone union.

- [ ] **Step 8: Commit**

```bash
git add frontend-customer/src/components/sections/kit-contract.tsx frontend-customer/src/components/sections/all-styles.ts \
  frontend-customer/src/components/sections/*/index.ts frontend-customer/src/components/sections/kinetic/ui.tsx \
  frontend-customer/src/components/sections/pop/ui.tsx frontend-customer/src/components/sections/__tests__/kit-contract.test.ts
git commit -m "feat(styles): StyleKit contract — every site style exposes a kit for AI-built sections

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## P1 — Core

### Task 2: The catalog, its sync, and loaders

**Files:**
- Create: `packages/shared/src/cx/primitives.json`, `packages/shared/src/cx/types.ts`
- Modify: `scripts/sync_sections.py`
- Create: `backend/apps/tenant_config/cx/__init__.py`, `backend/apps/tenant_config/cx/catalog.py`
- Generated: `backend/apps/tenant_config/sections_manifest/cx/primitives.json` (by the sync script)
- Test: `backend/apps/tenant_config/tests/test_cx_catalog.py`

**Interfaces:**
- Produces (Python): `catalog() -> dict`, `primitives() -> dict`, `limits() -> dict`, `icons() -> list[str]`, `DYNAMIC_SOURCES = ("courses", "plans", "events")`.
- Produces (TS): `CX_CATALOG`, `CX_BLOCK_TYPE = "cx"`, `CxFieldSpec` (= `FamilyField`), `CxNode`, `CxDynamic`, `CxSpec`, `CxRef`.
- Catalog prop kinds (exactly one per prop): `enum`, `int` [lo, hi], `num` [lo, hi], `bool`, `text` (max length), `icon`, `family`, `each`, `bind` (allowed field types; optional `top: true` = top-level fields only), `map`. Optional `required`, `default`. Primitive keys: `role` (`root|band|block`), `children` (`none|bands|blocks|two|item`), `props`, `doc`.

- [ ] **Step 1: Write the failing test**

`backend/apps/tenant_config/tests/test_cx_catalog.py`:

```python
"""The AI component catalog is well-formed: every rule the validator and
the prompt read from it is a known kind with consistent defaults."""

from apps.tenant_config.cx import catalog

ROLES = {"root", "band", "block"}
CHILDREN = {"none", "bands", "blocks", "two", "item"}
PROP_KINDS = {"enum", "int", "num", "bool", "text", "icon", "family", "each", "bind", "map"}


def test_every_primitive_is_well_formed():
    assert catalog.primitives(), "catalog has no primitives"
    for name, prim in catalog.primitives().items():
        assert prim["role"] in ROLES, name
        assert prim.get("children", "none") in CHILDREN, name
        for prop, pdef in (prim.get("props") or {}).items():
            kinds = PROP_KINDS & set(pdef)
            assert len(kinds) == 1, (name, prop, kinds)
            if "enum" in pdef and "default" in pdef:
                assert pdef["default"] in pdef["enum"], (name, prop)
            for ranged in ("int", "num"):
                if ranged in pdef and "default" in pdef:
                    lo, hi = pdef[ranged]
                    assert lo <= pdef["default"] <= hi, (name, prop)
        if prim.get("children") == "item":
            assert prim["props"]["each"]["required"], name


def test_only_sequence_is_a_root_and_bands_are_section_and_layout():
    roles = {name: prim["role"] for name, prim in catalog.primitives().items()}
    assert [n for n, r in roles.items() if r == "root"] == ["Sequence"]
    assert sorted(n for n, r in roles.items() if r == "band") == ["Layout", "Section"]


def test_limits_match_the_spec():
    assert catalog.limits() == {"nodes": 150, "depth": 8, "bytes": 16384, "fields": 24}
    assert len(catalog.icons()) == len(set(catalog.icons()))
```

- [ ] **Step 2: Run it to verify it fails**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_cx_catalog.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'apps.tenant_config.cx'`.

- [ ] **Step 3: Write the catalog**

`packages/shared/src/cx/primitives.json`:

```json
{
  "version": 1,
  "limits": { "nodes": 150, "depth": 8, "bytes": 16384, "fields": 24 },
  "icons": [
    "sparkles", "heart", "star", "sun", "moon", "leaf", "flower", "mountain", "waves", "flame", "music",
    "palette", "camera", "book", "graduation", "dumbbell", "footprints", "clock", "calendar", "pin", "users",
    "chat", "mail", "check", "gift", "coffee", "globe", "award", "target", "smile", "compass", "feather"
  ],
  "primitives": {
    "Sequence": {
      "role": "root", "children": "bands",
      "doc": "Full-width bands (Section or Layout) one after another. Only as the root, when one band is not enough."
    },
    "Section": {
      "role": "band", "children": "blocks",
      "props": {
        "tone": { "enum": ["base", "surface", "inverse"], "default": "base" },
        "width": { "enum": ["wrap", "narrow", "full"], "default": "wrap" }
      },
      "doc": "A full-width band drawn by the site style. tone: base is the page colour, surface is tinted, inverse is dark or colour-blocked. Children stack with generous spacing."
    },
    "Layout": {
      "role": "band", "children": "none",
      "props": {
        "family": { "family": true, "required": true },
        "variant": { "text": 40, "default": "auto" },
        "map": { "map": true }
      },
      "doc": "One of the style's hand-built layouts for an existing family, filled from this section's fields. map: familyField=yourField pairs. A dynamic family needs dynamic set to its source."
    },
    "Opener": {
      "role": "block", "children": "none",
      "doc": "The style's own section opener: kicker, heading and intro from your fields named kicker, heading (required, text) and intro."
    },
    "Heading": {
      "role": "block", "children": "none",
      "props": {
        "bind": { "bind": ["text"], "required": true },
        "level": { "int": [2, 4], "default": 3 },
        "size": { "enum": ["sm", "md", "lg"], "default": "md" }
      },
      "doc": "A heading. Level 2 only for a band's main heading when there is no Opener; 3 for item titles."
    },
    "Text": {
      "role": "block", "children": "none",
      "props": {
        "bind": { "bind": ["text"], "required": true },
        "size": { "enum": ["sm", "md", "lg"], "default": "md" },
        "muted": { "bool": true, "default": false },
        "measure": { "enum": ["narrow", "normal", "wide"], "default": "normal" }
      },
      "doc": "A paragraph of plain text."
    },
    "Rich": {
      "role": "block", "children": "none",
      "props": { "bind": { "bind": ["richtext"], "required": true, "top": true } },
      "doc": "Formatted text (paragraphs, lists) from a richtext field. Not inside item templates."
    },
    "Label": {
      "role": "block", "children": "none",
      "props": { "bind": { "bind": ["text"], "required": true } },
      "doc": "A small label in the style's caption voice (dates, durations, categories)."
    },
    "Num": {
      "role": "block", "children": "none",
      "props": {
        "bind": { "bind": ["text"] },
        "format": { "enum": ["plain", "pad2", "roman"], "default": "pad2" }
      },
      "doc": "A large ordinal. Without bind it shows the item's position (inside an item template only)."
    },
    "Img": {
      "role": "block", "children": "none",
      "props": {
        "bind": { "bind": ["image"], "required": true },
        "treatment": { "enum": ["plain", "frame", "arch", "circle", "polaroid"], "default": "plain" },
        "aspect": { "num": [0.5, 2.5], "default": 1.333 }
      },
      "doc": "A photo. aspect is width divided by height (1.5 landscape, 0.8 portrait)."
    },
    "Button": {
      "role": "block", "children": "none",
      "props": {
        "label": { "bind": ["text"], "required": true },
        "href": { "bind": ["link"] },
        "variant": { "enum": ["primary", "ghost", "onInverse"], "default": "primary" }
      },
      "doc": "A call-to-action button. Use onInverse inside an inverse Section or Band."
    },
    "Link": {
      "role": "block", "children": "none",
      "props": {
        "label": { "bind": ["text"], "required": true },
        "href": { "bind": ["link"] }
      },
      "doc": "An underlined text link."
    },
    "Badge": {
      "role": "block", "children": "none",
      "props": { "bind": { "bind": ["text"], "required": true } },
      "doc": "A small pill (level, format, 'New')."
    },
    "Icon": {
      "role": "block", "children": "none",
      "props": {
        "name": { "icon": true, "required": true },
        "size": { "enum": ["sm", "md", "lg"], "default": "md" }
      },
      "doc": "A line icon from the icon list."
    },
    "Card": {
      "role": "block", "children": "blocks",
      "props": { "emphasis": { "enum": ["soft", "strong"], "default": "soft" } },
      "doc": "A panel in the style's card look holding other blocks."
    },
    "Stack": {
      "role": "block", "children": "blocks",
      "props": {
        "gap": { "enum": ["sm", "md", "lg"], "default": "md" },
        "align": { "enum": ["start", "center"], "default": "start" }
      },
      "doc": "Blocks one under another."
    },
    "Ornament": {
      "role": "block", "children": "none",
      "props": { "slot": { "enum": ["divider", "glyph"], "default": "divider" } },
      "doc": "The style's own decoration: a divider line or a small glyph."
    },
    "Split": {
      "role": "block", "children": "two",
      "props": {
        "ratio": { "enum": ["1/2", "5/7", "4/8", "7/5", "8/4"], "default": "1/2" },
        "reverse": { "bool": true, "default": false },
        "sticky": { "bool": true, "default": false },
        "valign": { "enum": ["start", "center"], "default": "start" }
      },
      "doc": "Two columns on wide screens, stacked on phones. Exactly two children (wrap several blocks in a Stack). sticky keeps the first column in view while the second scrolls."
    },
    "Grid": {
      "role": "block", "children": "item",
      "props": {
        "each": { "each": true, "required": true },
        "cols": { "int": [1, 6], "default": 3 },
        "gap": { "enum": ["sm", "md", "lg"], "default": "md" },
        "card": { "enum": ["none", "soft", "strong"], "default": "none" },
        "numbering": { "enum": ["none", "plain", "pad2", "roman"], "default": "none" }
      },
      "doc": "One cell per item of an items field; the item template renders in each cell."
    },
    "Rows": {
      "role": "block", "children": "item",
      "props": {
        "each": { "each": true, "required": true },
        "divider": { "enum": ["none", "hairline", "leader"], "default": "hairline" },
        "numbering": { "enum": ["none", "plain", "pad2", "roman"], "default": "none" }
      },
      "doc": "One row per item. The template's first block sits left, the rest right; leader draws dots between them (menus, prices, timetables)."
    },
    "Timeline": {
      "role": "block", "children": "item",
      "props": {
        "each": { "each": true, "required": true },
        "orient": { "enum": ["vertical", "horizontal"], "default": "vertical" },
        "marker": { "enum": ["num", "dot", "glyph"], "default": "num" }
      },
      "doc": "Items along a line with a marker each (itineraries, journeys, histories)."
    },
    "Steps": {
      "role": "block", "children": "item",
      "props": {
        "each": { "each": true, "required": true },
        "cols": { "int": [2, 5], "default": 3 },
        "connector": { "enum": ["line", "none"], "default": "line" },
        "numbering": { "enum": ["plain", "pad2", "roman"], "default": "pad2" }
      },
      "doc": "Numbered steps side by side, joined by a line."
    },
    "Band": {
      "role": "block", "children": "blocks",
      "props": { "tone": { "enum": ["surface", "inverse"], "default": "inverse" } },
      "doc": "A coloured panel inside a Section that makes one part stand out."
    }
  }
}
```

`packages/shared/src/cx/types.ts`:

```ts
import catalogJson from "./primitives.json";
import type { FamilyField } from "../sections/types";

/** The AI component catalog (primitives.json): the one contract shared by the
 *  renderer (frontend-customer components/cx) and, via the synced backend
 *  copy, the validator and the AI prompt. */
export const CX_CATALOG = catalogJson;

/** Block type of an AI-built section. */
export const CX_BLOCK_TYPE = "cx";

/** cx fields use the families.json field format (a subset of its types). */
export type CxFieldSpec = FamilyField;

export interface CxNode {
  t: string;
  children?: CxNode[];
  item?: CxNode[];
  [prop: string]: unknown;
}

export type CxDynamic = "courses" | "plans" | "events";

/** A validated, canonical spec (CSL v1). */
export interface CxSpec {
  csl: 1;
  name: string;
  summary: string;
  fields: Record<string, CxFieldSpec>;
  dynamic: CxDynamic | null;
  tree: CxNode;
}

/** `block.cx` on a stored block: lineage to the registry + the spec snapshot. */
export interface CxRef {
  ref: string | null;
  spec: CxSpec;
}
```

- [ ] **Step 4: Sync the catalog into the backend**

In `scripts/sync_sections.py`:

1. Below `DST = ...` add:

```python
CX_SRC = ROOT / "packages/shared/src/cx/primitives.json"
CX_NAME = "cx/primitives.json"
```

2. In `_expected()`, after the `files = {...}` line add:

```python
    files[CX_NAME] = CX_SRC.read_bytes()
```

3. In `_actual()`, after the `families.json` check add:

```python
    if (DST / CX_NAME).exists():
        files[CX_NAME] = (DST / CX_NAME).read_bytes()
```

4. In `main()`, after `(DST / "styles").mkdir(parents=True, exist_ok=True)` add:

```python
    (DST / "cx").mkdir(parents=True, exist_ok=True)
```

5. Update the module docstring's first line to: `Copy the section manifest (packages/shared/src/sections) and the AI component catalog (packages/shared/src/cx) into the backend.`

Run: `python3 scripts/sync_sections.py && python3 scripts/sync_sections.py --check; echo exit=$?`
Expected: `sections: synced N file(s) …`, then `exit=0`.

- [ ] **Step 5: Write the loader**

`backend/apps/tenant_config/cx/__init__.py`:

```python
"""AI-built custom sections ("cx"): catalog, validator, block cleaner,
model I/O and the compose/refine service. See
docs/superpowers/specs/2026-10-08-ai-custom-components-design.md."""
```

`backend/apps/tenant_config/cx/catalog.py`:

```python
"""Loader for the AI component catalog (packages/shared/src/cx/primitives.json,
synced into sections_manifest/cx/ by `make sections-sync`). Pure Python, no
Django, like apps.tenant_config.sections."""

from __future__ import annotations

import json
from functools import cache
from pathlib import Path

CATALOG_PATH = Path(__file__).resolve().parent.parent / "sections_manifest" / "cx" / "primitives.json"
DYNAMIC_SOURCES = ("courses", "plans", "events")


@cache
def catalog() -> dict:
    return json.loads(CATALOG_PATH.read_text())


def primitives() -> dict:
    return catalog()["primitives"]


def limits() -> dict:
    return catalog()["limits"]


def icons() -> list[str]:
    return catalog()["icons"]
```

- [ ] **Step 6: Run the test**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_cx_catalog.py -q`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/cx scripts/sync_sections.py backend/apps/tenant_config/cx/__init__.py \
  backend/apps/tenant_config/cx/catalog.py backend/apps/tenant_config/sections_manifest/cx \
  backend/apps/tenant_config/tests/test_cx_catalog.py
git commit -m "feat(cx): AI component catalog, synced to the backend

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The spec validator

**Files:**
- Create: `backend/apps/tenant_config/cx/validate.py`
- Create: `backend/apps/tenant_config/tests/cx_fixtures.py` (shared test data)
- Test: `backend/apps/tenant_config/tests/test_cx_validate.py`

**Interfaces:**
- Consumes: `catalog.primitives()`, `limits()`, `icons()`, `DYNAMIC_SOURCES`; `sections.clamp_text`, `sections.families()`.
- Produces: `validate_spec(raw) -> tuple[dict | None, list[str]]`. The spec is canonical: defaults filled, props in catalog order, invalid props and nodes dropped. `None` means nothing renderable is left. Also `clean_field_specs(raw, errors, *, in_items=False) -> dict`.
- Canonical field shapes: text `{type, label, [required], max}`; richtext `{type, label, [required], max}`; link `{type, label, [required]}`; image `{type, label, [required], aspect, role}`; items `{type, label, [required], fields, max, min, itemLabel}`.

- [ ] **Step 1: Add the shared fixture**

`backend/apps/tenant_config/tests/cx_fixtures.py`:

```python
"""A canonical AI component spec (the prompt's retreat-itinerary example,
after validation) and a block carrying it. Shared by the cx tests."""

import copy

ITINERARY_SPEC = {
    "csl": 1,
    "name": "Retreat itinerary",
    "summary": "Day-by-day plan of a multi-day retreat",
    "fields": {
        "kicker": {"type": "text", "label": "Kicker", "max": 40},
        "heading": {"type": "text", "label": "Heading", "required": True, "max": 80},
        "intro": {"type": "text", "label": "Intro", "max": 220},
        "days": {
            "type": "items",
            "label": "Days",
            "fields": {
                "when": {"type": "text", "label": "Day", "max": 24},
                "title": {"type": "text", "label": "Title", "required": True, "max": 60},
                "text": {"type": "text", "label": "Plan", "max": 220},
                "image": {"type": "image", "label": "Photo", "aspect": "3:2", "role": "a calm retreat scene for this day"},
            },
            "max": 10,
            "min": 2,
            "itemLabel": "Day",
        },
    },
    "dynamic": None,
    "tree": {
        "t": "Section",
        "tone": "surface",
        "width": "wrap",
        "children": [
            {"t": "Opener"},
            {
                "t": "Timeline",
                "each": "days",
                "orient": "vertical",
                "marker": "num",
                "item": [
                    {"t": "Label", "bind": "$.when"},
                    {"t": "Heading", "bind": "$.title", "level": 3, "size": "md"},
                    {"t": "Text", "bind": "$.text", "size": "md", "muted": True, "measure": "normal"},
                    {"t": "Img", "bind": "$.image", "treatment": "frame", "aspect": 1.5},
                ],
            },
        ],
    },
}


def itinerary_block(**changes):
    block = {
        "id": "blk_cxtest01",
        "type": "cx",
        "enabled": True,
        "cx": {"ref": "cx_1a2b3c4d@1", "spec": copy.deepcopy(ITINERARY_SPEC)},
        "kicker": "Seven days in Bali",
        "heading": "How the week unfolds",
        "intro": "Slow mornings, long practices and time to rest.",
        "days": [
            {
                "when": "Day 1",
                "title": "Arrive and settle",
                "text": "Check in and an easy evening class.",
                "image": {"url": None, "photo_id": "p1", "alt": "A quiet beach at dawn"},
            },
            {"when": "Day 2", "title": "Find your rhythm", "text": "Morning flow and an afternoon walk."},
        ],
    }
    block.update(changes)
    return block
```

- [ ] **Step 2: Write the failing tests**

`backend/apps/tenant_config/tests/test_cx_validate.py`:

```python
"""CSL v1 validator: the trust boundary every AI-built section crosses."""

import copy

from apps.tenant_config.cx.validate import validate_spec
from apps.tenant_config.tests.cx_fixtures import ITINERARY_SPEC


def _spec(**changes):
    spec = copy.deepcopy(ITINERARY_SPEC)
    spec.update(changes)
    return spec


def _kids(spec):
    return [c["t"] for c in spec["tree"]["children"]]


def test_canonical_spec_is_a_fixed_point():
    spec, errors = validate_spec(ITINERARY_SPEC)
    assert errors == []
    assert spec == ITINERARY_SPEC
    assert validate_spec(spec) == (spec, [])


def test_missing_props_get_catalog_defaults():
    spec, errors = validate_spec(_spec(tree={"t": "Section", "children": [{"t": "Opener"}]}))
    assert errors == []
    assert spec["tree"] == {"t": "Section", "tone": "base", "width": "wrap", "children": [{"t": "Opener"}]}


def test_unknown_primitives_and_props_are_dropped():
    raw = _spec(
        tree={
            "t": "Section",
            "className": "bg-red-500",
            "style": {"color": "red"},
            "children": [{"t": "Opener", "html": "<script>"}, {"t": "Script", "src": "x.js"}],
        }
    )
    spec, errors = validate_spec(raw)
    assert spec["tree"] == {"t": "Section", "tone": "base", "width": "wrap", "children": [{"t": "Opener"}]}
    assert any("Script" in e for e in errors)


def test_bind_to_an_undeclared_field_drops_the_node():
    spec, errors = validate_spec(_spec(tree={"t": "Section", "children": [{"t": "Opener"}, {"t": "Text", "bind": "nope"}]}))
    assert _kids(spec) == ["Opener"]
    assert any("nope" in e for e in errors)


def test_item_binds_only_work_inside_an_item_template():
    spec, _ = validate_spec(_spec(tree={"t": "Section", "children": [{"t": "Opener"}, {"t": "Heading", "bind": "$.title"}]}))
    assert _kids(spec) == ["Opener"]


def test_opener_needs_a_heading_field():
    fields = {k: v for k, v in ITINERARY_SPEC["fields"].items() if k != "heading"}
    spec, errors = validate_spec(_spec(fields=fields, tree={"t": "Section", "children": [{"t": "Opener"}]}))
    assert spec is None
    assert any("heading" in e for e in errors)


def test_root_must_be_a_band_or_sequence():
    assert validate_spec(_spec(tree={"t": "Opener"}))[0] is None


def test_bands_cannot_nest_inside_a_section():
    raw = _spec(tree={"t": "Section", "children": [{"t": "Opener"}, {"t": "Section", "children": [{"t": "Opener"}]}]})
    spec, errors = validate_spec(raw)
    assert _kids(spec) == ["Opener"]
    assert any("not allowed" in e for e in errors)


def test_split_needs_two_children():
    raw = _spec(tree={"t": "Section", "children": [{"t": "Split", "children": [{"t": "Opener"}]}, {"t": "Opener"}]})
    spec, _ = validate_spec(raw)
    assert _kids(spec) == ["Opener"]


def test_numbers_are_clamped_and_bad_enums_fall_back():
    raw = _spec(
        tree={
            "t": "Section",
            "tone": "neon",
            "children": [
                {"t": "Opener"},
                {"t": "Grid", "each": "days", "cols": 99, "item": [{"t": "Heading", "bind": "$.title", "level": "7"}]},
            ],
        }
    )
    spec, errors = validate_spec(raw)
    grid = spec["tree"]["children"][1]
    assert spec["tree"]["tone"] == "base"
    assert grid["cols"] == 6
    assert grid["item"][0]["level"] == 4
    assert any("neon" in e for e in errors)


def test_too_many_nodes_are_cut_off_once():
    kids = [{"t": "Opener"}] + [{"t": "Label", "bind": "kicker"} for _ in range(500)]
    spec, errors = validate_spec(_spec(tree={"t": "Section", "children": kids}))
    assert len(spec["tree"]["children"]) == 149  # 150 nodes including the Section
    assert errors.count("the tree has too many nodes") == 1


def test_deep_trees_are_cut_off():
    node = {"t": "Opener"}
    for _ in range(12):
        node = {"t": "Stack", "children": [node]}
    spec, _ = validate_spec(_spec(tree={"t": "Section", "children": [{"t": "Opener"}, node]}))
    assert _kids(spec) == ["Opener"]


def test_field_rules():
    raw = _spec(
        fields={
            "heading": {"type": "text", "label": "Heading", "max": 99999},
            "id": {"type": "text"},
            "Bad Name": {"type": "text"},
            "script": {"type": "html"},
            "list": {"type": "items", "fields": {"body": {"type": "richtext"}}},
        },
        tree={"t": "Section", "children": [{"t": "Opener"}]},
    )
    spec, errors = validate_spec(raw)
    assert spec["fields"] == {"heading": {"type": "text", "label": "Heading", "max": 600}}
    assert len(errors) == 5  # reserved name, bad name, unknown type, richtext in items, empty items


def test_layout_maps_only_compatible_fields():
    fields = {
        "heading": {"type": "text", "label": "Heading", "max": 80},
        "photo": {"type": "image", "label": "Photo"},
        "perks": {"type": "items", "label": "Perks", "fields": {"title": {"type": "text", "label": "Title"}}},
    }
    raw = _spec(
        fields=fields,
        tree={"t": "Layout", "family": "benefits", "map": {"heading": "heading", "intro": "photo", "items": "perks", "nope": "heading"}},
    )
    spec, errors = validate_spec(raw)
    assert spec["tree"] == {"t": "Layout", "family": "benefits", "variant": "auto", "map": {"heading": "heading", "items": "perks"}}
    assert len(errors) == 2


def test_layout_of_a_dynamic_family_needs_its_source():
    tree = {"t": "Layout", "family": "pricing", "map": {"heading": "heading"}}
    assert validate_spec(_spec(tree=tree))[0] is None
    spec, _ = validate_spec(_spec(dynamic="plans", tree=tree))
    assert spec["tree"]["family"] == "pricing" and spec["dynamic"] == "plans"


def test_oversized_specs_are_refused():
    subs = {f"f{i}": {"type": "image", "label": "L" * 40, "role": "r" * 120} for i in range(24)}
    fields = {"heading": ITINERARY_SPEC["fields"]["heading"], **{f"list{i}": {"type": "items", "label": "List", "fields": subs} for i in range(20)}}
    spec, errors = validate_spec(_spec(fields=fields, tree={"t": "Section", "children": [{"t": "Opener"}]}))
    assert spec is None
    assert errors[-1] == "the section is too large"


def test_garbage_never_raises():
    garbage = [
        None,
        [],
        "x",
        5,
        {"tree": [1, 2]},
        {"tree": {"t": ["Section"]}},
        {"fields": [1], "tree": {"t": "Section", "children": "nope"}},
        {"fields": {}, "tree": {"t": "Section", "children": [{"t": "Grid", "each": {"a": 1}, "item": []}]}},
        {"fields": {}, "tree": {"t": "Section", "children": [{"t": "Icon", "name": ["x"]}]}},
        {"fields": {}, "tree": {"t": "Layout", "family": {"x": 1}}},
    ]
    for raw in garbage:
        assert validate_spec(raw)[0] is None, raw
```

- [ ] **Step 3: Run them to verify they fail**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_cx_validate.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'apps.tenant_config.cx.validate'`.

- [ ] **Step 4: Write the validator**

`backend/apps/tenant_config/cx/validate.py`:

```python
"""Validator for AI component specs (CSL v1): the trust boundary every spec
crosses, whether the AI wrote it or a PATCH carried it.

Catalog-driven: primitives, their props and children come from
primitives.json; only the field-schema rules and the Opener/Num/Layout
special cases live here. validate_spec(raw) -> (spec | None, errors). The
spec is canonical (defaults filled, invalid props and nodes dropped), so
validating it again returns it unchanged and autosave round-trips are
stable. None means nothing renderable is left."""

from __future__ import annotations

import json
import re

from apps.tenant_config import sections

from .catalog import DYNAMIC_SOURCES, icons, limits, primitives

FIELD_NAME = re.compile(r"^[a-z][a-zA-Z0-9]{0,23}$")
RESERVED_FIELDS = frozenset({"id", "type", "variant", "enabled", "style", "cx"})
TOP_FIELD_TYPES = ("text", "richtext", "link", "image", "items")
ITEM_FIELD_TYPES = ("text", "link", "image")
ASPECTS = ("1:1", "4:5", "3:4", "2:3", "3:2", "4:3", "16:9")
# Family field type -> the spec field types that may fill it (Layout.map).
_FILLS = {"text": {"text"}, "richtext": {"richtext", "text"}, "link": {"link"}, "image": {"image"}}
_MISSING = object()


def _int(value, lo, hi, default):
    if isinstance(value, bool):
        return default
    try:
        number = int(float(value))
    except (TypeError, ValueError, OverflowError):
        return default
    return max(lo, min(hi, number))


def _num(value, lo, hi, default):
    if isinstance(value, bool):
        return default
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if number != number:  # NaN
        return default
    return round(max(lo, min(hi, number)), 3)


def clean_field_specs(raw, errors, *, in_items=False) -> dict:
    """A field schema in families.json format, limited to what cx renders."""
    if not isinstance(raw, dict):
        return {}
    allowed = ITEM_FIELD_TYPES if in_items else TOP_FIELD_TYPES
    out = {}
    for name, spec in raw.items():
        if len(out) >= limits()["fields"]:
            errors.append("too many fields")
            break
        if not isinstance(name, str) or not FIELD_NAME.match(name) or name in RESERVED_FIELDS:
            errors.append(f"field {name!r}: names are camelCase, at most 24 characters, and not a reserved word")
            continue
        kind = spec.get("type") if isinstance(spec, dict) else None
        if kind not in allowed:
            errors.append(f"field {name}: type must be one of {', '.join(allowed)}")
            continue
        clean = {"type": kind, "label": sections.clamp_text(spec.get("label"), 40) or name}
        if spec.get("required") is True:
            clean["required"] = True
        if kind == "text":
            clean["max"] = _int(spec.get("max"), 1, 600, 160)
        elif kind == "richtext":
            clean["max"] = _int(spec.get("max"), 1, 2000, 900)
        elif kind == "image":
            clean["aspect"] = spec["aspect"] if spec.get("aspect") in ASPECTS else "4:3"
            clean["role"] = sections.clamp_text(spec.get("role"), 120)
        elif kind == "items":
            sub = clean_field_specs(spec.get("fields"), errors, in_items=True)
            if not sub:
                errors.append(f"field {name}: an items field needs sub-fields")
                continue
            clean["fields"] = sub
            clean["max"] = _int(spec.get("max"), 1, 12, 6)
            clean["min"] = min(_int(spec.get("min"), 0, 12, 0), clean["max"])
            clean["itemLabel"] = sections.clamp_text(spec.get("itemLabel"), 30) or "Item"
        out[name] = clean
    return out


class _Walker:
    def __init__(self, fields, dynamic, errors):
        self.fields = fields
        self.dynamic = dynamic
        self.errors = errors
        self.count = 0
        self.full = False

    def _drop(self, message):
        self.errors.append(message)
        return None

    def node(self, raw, depth, item_scope, roles):
        if not isinstance(raw, dict):
            return self._drop("every node must be an object")
        t = raw.get("t")
        prim = primitives().get(t) if isinstance(t, str) else None
        if prim is None:
            return self._drop(f"unknown primitive {t!r}")
        if prim["role"] not in roles:
            return self._drop(f"{t} is not allowed there")
        if depth > limits()["depth"]:
            return self._drop("the tree is too deep")
        if self.count >= limits()["nodes"]:
            if not self.full:
                self.full = True
                self.errors.append("the tree has too many nodes")
            return None
        self.count += 1
        out = {"t": t}
        for name, pdef in (prim.get("props") or {}).items():
            value = self._prop(t, name, pdef, raw.get(name), item_scope)
            if value is _MISSING:
                if pdef.get("required"):
                    return self._drop(f"{t} needs {name}")
                continue
            out[name] = value
        if t == "Opener" and (self.fields.get("heading") or {}).get("type") != "text":
            return self._drop("Opener needs a text field named heading")
        if t == "Num" and "bind" not in out and item_scope is None:
            return self._drop("Num without bind only works inside an item template")
        if t == "Layout" and not self._layout(out):
            return None
        kind = prim.get("children", "none")
        if kind == "item":
            scope = self.fields[out["each"]]["fields"]
            out["item"] = self.nodes(raw.get("item"), depth + 1, scope, ("block",))
            if not out["item"]:
                return self._drop(f"{t} needs an item template")
        elif kind != "none":
            roles = ("band",) if kind == "bands" else ("block",)
            kids = self.nodes(raw.get("children"), depth + 1, item_scope, roles)
            if kind == "two":
                if len(kids) < 2:
                    return self._drop(f"{t} needs exactly two children")
                kids = kids[:2]
            if not kids:
                return self._drop(f"{t} has no children")
            out["children"] = kids
        return out

    def nodes(self, raw, depth, item_scope, roles):
        if not isinstance(raw, list):
            return []
        return [n for n in (self.node(r, depth, item_scope, roles) for r in raw) if n is not None]

    def _prop(self, t, name, pdef, value, item_scope):
        if value is None:
            return pdef.get("default", _MISSING)
        if "enum" in pdef:
            if value in pdef["enum"]:
                return value
            self.errors.append(f"{t}.{name}: {value!r} is not one of {', '.join(map(str, pdef['enum']))}")
            return pdef.get("default", _MISSING)
        if "int" in pdef:
            lo, hi = pdef["int"]
            return _int(value, lo, hi, pdef.get("default", lo))
        if "num" in pdef:
            lo, hi = pdef["num"]
            return _num(value, lo, hi, pdef.get("default", lo))
        if "bool" in pdef:
            return value if isinstance(value, bool) else str(value).strip().lower() == "true"
        if "text" in pdef:
            return sections.clamp_text(value, pdef["text"]) or pdef.get("default", _MISSING)
        if "map" in pdef:
            return value if isinstance(value, dict) else _MISSING
        if "icon" in pdef:
            ok = isinstance(value, str) and value in icons()
        elif "family" in pdef:
            ok = isinstance(value, str) and value in sections.families()
        elif "each" in pdef:
            ok = isinstance(value, str) and (self.fields.get(value) or {}).get("type") == "items"
        elif "bind" in pdef:
            ok = self._binds(pdef, value, item_scope)
        else:
            ok = False
        if ok:
            return value
        self.errors.append(f"{t}.{name}: {value!r} is not valid here")
        return _MISSING

    def _binds(self, pdef, value, item_scope):
        if not isinstance(value, str):
            return False
        if value.startswith("$."):
            spec = (item_scope or {}).get(value[2:])
            return not pdef.get("top") and spec is not None and spec["type"] in pdef["bind"]
        spec = self.fields.get(value)
        return spec is not None and spec["type"] in pdef["bind"]

    def _layout(self, out):
        family = sections.families()[out["family"]]
        if family.get("kind") == "dynamic" and self.dynamic != family.get("source"):
            self._drop(f"Layout {out['family']} needs dynamic set to {family.get('source')!r}")
            return False
        clean = {}
        for to, frm in (out.get("map") or {}).items():
            target = family["fields"].get(to) if isinstance(to, str) else None
            source = self.fields.get(frm) if isinstance(frm, str) else None
            if target is None or source is None:
                self.errors.append(f"Layout {out['family']}: cannot map {to!r} to {frm!r}")
                continue
            if target["type"] == "items":
                ok = source["type"] == "items" and bool(set(source["fields"]) & set(target.get("fields") or {}))
            else:
                ok = source["type"] in _FILLS.get(target["type"], set())
            if not ok:
                self.errors.append(f"Layout {out['family']}: {frm} ({source['type']}) cannot fill {to} ({target['type']})")
                continue
            clean[to] = frm
        if not clean and family.get("kind") != "dynamic":
            self._drop(f"Layout {out['family']} maps none of your fields")
            return False
        out["map"] = clean
        return True


def validate_spec(raw):
    """(canonical spec | None, errors)."""
    if not isinstance(raw, dict):
        return None, ["the spec must be an object"]
    errors: list[str] = []
    fields = clean_field_specs(raw.get("fields"), errors)
    dynamic = raw.get("dynamic") if raw.get("dynamic") in DYNAMIC_SOURCES else None
    tree = _Walker(fields, dynamic, errors).node(raw.get("tree"), 1, None, ("root", "band"))
    if tree is None:
        return None, [*errors, "nothing renderable is left"]
    spec = {
        "csl": 1,
        "name": sections.clamp_text(raw.get("name"), 60) or "Custom section",
        "summary": sections.clamp_text(raw.get("summary"), 200),
        "fields": fields,
        "dynamic": dynamic,
        "tree": tree,
    }
    if len(json.dumps(spec)) > limits()["bytes"]:
        return None, [*errors, "the section is too large"]
    return spec, errors
```

Note: any tree that survives contains at least one leaf, because every container needs non-empty children. So `tree is not None` already means the section is renderable.

- [ ] **Step 5: Run the tests**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_cx_validate.py -q`
Expected: PASS (17 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/apps/tenant_config/cx/validate.py backend/apps/tenant_config/tests/cx_fixtures.py \
  backend/apps/tenant_config/tests/test_cx_validate.py
git commit -m "feat(cx): catalog-driven spec validator (the trust boundary)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The `cx` block on the write path

**Files:**
- Modify: `backend/apps/tenant_config/defaults.py` (add `CX_BLOCK_TYPE`, extend `KNOWN_BLOCK_TYPES`)
- Create: `backend/apps/tenant_config/cx/blocks.py`
- Modify: `backend/apps/tenant_config/serializers.py` (`_clean_block` branch + imports)
- Test: `backend/apps/tenant_config/tests/test_cx_blocks.py`

**Interfaces:**
- Consumes: `validate_spec`, `sections._clean_fields`.
- Produces: `defaults.CX_BLOCK_TYPE = "cx"`; `blocks.REF_RE`; `blocks.clean_cx_block(block) -> dict | None` returning `{id, type: "cx", enabled, cx: {ref: str | None, spec}, …content}`; `blocks.content_of(block) -> dict` (the content fields only).

- [ ] **Step 1: Run GitNexus impact on `_clean_block`**

Call `impact({target: "_clean_block", direction: "upstream"})` and note the callers (expected: `validate_pages`, `validate_page_templates`). Stop if the risk is HIGH or CRITICAL.

- [ ] **Step 2: Write the failing tests**

`backend/apps/tenant_config/tests/test_cx_blocks.py`:

```python
"""The cx block on the write path: every save re-validates the spec and
shapes the content by it."""

from apps.tenant_config import sections
from apps.tenant_config.cx.blocks import clean_cx_block
from apps.tenant_config.serializers import TenantConfigSerializer
from apps.tenant_config.tests.cx_fixtures import ITINERARY_SPEC, itinerary_block


def test_a_valid_block_keeps_its_content_and_snapshot():
    out = clean_cx_block(itinerary_block())
    assert out["cx"] == {"ref": "cx_1a2b3c4d@1", "spec": ITINERARY_SPEC}
    assert out["heading"] == "How the week unfolds"
    assert out["days"][0]["image"]["photo_id"] == "p1"


def test_content_is_shaped_by_the_spec():
    block = itinerary_block(
        heading="word " * 100,
        junk="dropped",
        days=[{"title": "T", "when": "W", "evil": 1, "image": {"url": "javascript:alert(1)", "photo_id": None}}],
    )
    out = clean_cx_block(block)
    assert len(out["heading"]) <= 80
    assert "junk" not in out
    assert out["days"] == [{"when": "W", "title": "T", "image": {"url": None, "photo_id": None, "alt": None}}]


def test_a_forged_ref_is_cleared():
    out = clean_cx_block(itinerary_block(cx={"ref": "../../etc", "spec": ITINERARY_SPEC}))
    assert out["cx"]["ref"] is None


def test_a_block_without_a_usable_spec_is_dropped():
    assert clean_cx_block(itinerary_block(cx={"ref": None, "spec": {"tree": {"t": "Script"}}})) is None
    assert clean_cx_block(itinerary_block(cx="nope")) is None


def test_saved_block_survives_a_second_save():
    once = clean_cx_block(itinerary_block())
    assert clean_cx_block(once) == once


def test_pages_patch_with_hostile_cx_blocks_never_breaks():
    heading = {"heading": {"type": "text"}}
    hostile = [
        itinerary_block(id="blk_ok000001"),
        {
            "type": "cx",
            "cx": {"spec": {"fields": heading, "tree": {"t": "Section", "className": "x", "children": [{"t": "Opener"}]}}},
            "heading": "<img onerror=alert(1)>",
        },
        {
            "type": "cx",
            "cx": {"spec": {"fields": heading, "tree": {"t": "Section", "children": [{"t": "Text", "bind": "heading"}] * 5000}}},
        },
        {"type": "cx", "cx": None},
        {"type": "cx"},
    ]
    blocks = TenantConfigSerializer().validate_pages({"home": {"blocks": hostile}})["home"]["blocks"]
    assert len(blocks) == 3
    assert blocks[0]["id"] == "blk_ok000001"
    assert blocks[1]["cx"]["spec"]["tree"] == {"t": "Section", "tone": "base", "width": "wrap", "children": [{"t": "Opener"}]}
    assert blocks[1]["heading"] == "<img onerror=alert(1)>"  # plain text: React escapes it on render
    assert len(blocks[2]["cx"]["spec"]["tree"]["children"]) == 149


def test_restyling_a_site_leaves_cx_blocks_alone():
    block = clean_cx_block(itinerary_block())
    pages = {"home": {"blocks": [block, {"id": "blk_h", "type": "section.hero", "variant": "maison.intro"}]}}
    out = sections.restyle_pages(pages, "journal")
    assert out["home"]["blocks"][0] == block
    assert out["home"]["blocks"][1]["variant"] == "journal.intro"
```

- [ ] **Step 3: Run them to verify they fail**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_cx_blocks.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'apps.tenant_config.cx.blocks'`.

- [ ] **Step 4: Register the block type**

In `backend/apps/tenant_config/defaults.py`, replace the `KNOWN_BLOCK_TYPES` line and the comment above it with:

```python
# Styled sections (``section.<family>``) come from the synced manifest; see
# apps.tenant_config.sections for their schemas and cleaner. AI-built custom
# sections (``cx``) carry a validated spec snapshot; see apps.tenant_config.cx.
CX_BLOCK_TYPE = "cx"
KNOWN_BLOCK_TYPES = frozenset(CONTENT_BLOCK_TYPES + DYNAMIC_BLOCK_TYPES) | SECTION_TYPES | {CX_BLOCK_TYPE}
```

`cx` has no entry in `BLOCK_STYLE_ALLOWLIST`, so `sanitize_block_style` drops any style override, the same as for styled sections.

- [ ] **Step 5: Write the cleaner**

`backend/apps/tenant_config/cx/blocks.py`:

```python
"""The ``cx`` block: an AI-built section stored as a validated spec snapshot
plus content fields at the top level::

    {"id": "blk_…", "type": "cx", "enabled": true,
     "cx": {"ref": "cx_1a2b3c4d@2" | null, "spec": {…canonical CSL v1…}},
     …content fields declared by spec.fields…}

The snapshot makes the tenant's pages self-contained: rendering never reads
the registry. ``ref`` is lineage only and never trusted for rendering."""

from __future__ import annotations

import re

from apps.tenant_config import sections
from apps.tenant_config.defaults import CX_BLOCK_TYPE

from .validate import validate_spec

REF_RE = re.compile(r"^cx_[0-9a-f]{8}@[0-9]{1,4}$")
_BASE_KEYS = frozenset({"id", "type", "enabled", "style", "cx"})


def clean_cx_block(block):
    """The block re-validated and its content shaped by the spec, or None
    when no usable spec remains (the block is dropped)."""
    if not isinstance(block, dict) or block.get("type") != CX_BLOCK_TYPE:
        return None
    cx = block.get("cx") if isinstance(block.get("cx"), dict) else {}
    spec, _errors = validate_spec(cx.get("spec"))
    if spec is None:
        return None
    ref = cx.get("ref")
    out = {
        "id": block.get("id"),
        "type": CX_BLOCK_TYPE,
        "enabled": bool(block.get("enabled", True)),
        "cx": {"ref": ref if isinstance(ref, str) and REF_RE.match(ref) else None, "spec": spec},
    }
    out.update(sections._clean_fields(spec["fields"], block))
    return out


def content_of(block) -> dict:
    """A cx block's content fields (everything but the block's own keys)."""
    return {key: value for key, value in block.items() if key not in _BASE_KEYS}
```

- [ ] **Step 6: Wire it into `_clean_block`**

In `backend/apps/tenant_config/serializers.py`:

1. Add `CX_BLOCK_TYPE,` to the `from .defaults import (...)` list (alphabetical, first).
2. Below `from . import sections`, add `from .cx.blocks import clean_cx_block`.
3. In `_clean_block`, directly before `if block["type"] in sections.SECTION_TYPES:`, add:

```python
    if block["type"] == CX_BLOCK_TYPE:
        return clean_cx_block(block)
```

- [ ] **Step 7: Run the tests**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_cx_blocks.py apps/tenant_config/tests/test_pages_serializer.py apps/tenant_config/tests/test_sections.py -q`
Expected: PASS. The two existing files guard the unchanged legacy and section paths.

- [ ] **Step 8: Commit** (follow the shared-tree rule: `serializers.py` may hold another session's hunks)

```bash
git diff --stat backend/apps/tenant_config/serializers.py   # only your 3 edits? else stop and ask
git add backend/apps/tenant_config/defaults.py backend/apps/tenant_config/cx/blocks.py \
  backend/apps/tenant_config/serializers.py backend/apps/tenant_config/tests/test_cx_blocks.py
git commit -m "feat(cx): cx block type re-validated on every save

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Registry models

**Files:**
- Modify: `backend/apps/core/models.py` (append two models after `CuratedLogo`)
- Create: `backend/apps/core/migrations/00NN_cx_registry.py` (generated)
- Test: `backend/apps/core/tests/test_cx_models.py`

**Interfaces:**
- Produces: `CxComponent(id: str pk "cx_xxxxxxxx", name, summary, author_tenant_schema, visibility="private", latest_version: int, created_at, updated_at)` and `CxVersion(component FK related_name="versions", n, spec JSON, content JSON, prompt, missing_capabilities JSON, created_at)` with unique `(component, n)`.

- [ ] **Step 1: Write the failing test**

`backend/apps/core/tests/test_cx_models.py`:

```python
"""Registry of AI-built sections: one component, numbered immutable versions."""

import pytest
from django.db import IntegrityError, transaction

from apps.core.models import CxComponent, CxVersion

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(autouse=True)
def _clean():
    CxComponent.objects.all().delete()
    yield
    CxComponent.objects.all().delete()


def test_versions_are_numbered_once_per_component():
    component = CxComponent.objects.create(pk="cx_0000abcd", name="Itinerary", author_tenant_schema="yoga_school")
    CxVersion.objects.create(component=component, n=1, spec={"csl": 1})
    with pytest.raises(IntegrityError), transaction.atomic():
        CxVersion.objects.create(component=component, n=1, spec={"csl": 1})
    assert component.visibility == "private" and str(component.versions.get()) == "cx_0000abcd@1"


def test_deleting_a_component_deletes_its_versions():
    component = CxComponent.objects.create(pk="cx_0000abce", name="X", author_tenant_schema="s")
    CxVersion.objects.create(component=component, n=1, spec={})
    component.delete()
    assert not CxVersion.objects.exists()
```

- [ ] **Step 2: Run it to verify it fails**

Run: `docker compose exec django pytest apps/core/tests/test_cx_models.py -q`
Expected: FAIL with `ImportError: cannot import name 'CxComponent'`.

- [ ] **Step 3: Add the models**

Append to `backend/apps/core/models.py`, after `class CuratedLogo`:

```python
class CxComponent(models.Model):
    """An AI-built custom section ("cx", apps.tenant_config.cx). Public schema
    so a later phase can share proven components across tenants; for now every
    row is private to its author tenant. Tenant sites never read this table to
    render — their blocks carry a snapshot of the spec."""

    VISIBILITY_CHOICES = [
        ("private", "Private"),
        ("shared", "Shared"),
        ("featured", "Featured"),
        ("hidden", "Hidden"),
    ]

    id = models.CharField(primary_key=True, max_length=12)  # "cx_" + 8 hex
    name = models.CharField(max_length=60)
    summary = models.CharField(max_length=200, blank=True, default="")
    author_tenant_schema = models.CharField(max_length=63, db_index=True)
    visibility = models.CharField(max_length=10, choices=VISIBILITY_CHOICES, default="private")
    latest_version = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "core"
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.pk} {self.name}"


class CxVersion(models.Model):
    """One immutable revision of a CxComponent: the validated spec and the
    content it was made with (the author's own words and photo ids)."""

    component = models.ForeignKey(CxComponent, on_delete=models.CASCADE, related_name="versions")
    n = models.PositiveIntegerField()
    spec = models.JSONField()
    content = models.JSONField(default=dict, blank=True)
    prompt = models.TextField(blank=True, default="")
    missing_capabilities = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "core"
        constraints = [models.UniqueConstraint(fields=["component", "n"], name="uniq_cx_version_n")]

    def __str__(self):
        return f"{self.component_id}@{self.n}"
```

- [ ] **Step 4: Generate and apply the migration**

Run: `docker compose exec django python manage.py makemigrations core -n cx_registry`
Expected: `Migrations for 'core': apps/core/migrations/00NN_cx_registry.py` (two `CreateModel`s and the constraint). Read the file; it must contain nothing else.

Run: `docker compose exec django python manage.py migrate_schemas --shared`
Expected: `Applying core.00NN_cx_registry... OK`.

- [ ] **Step 5: Run the test (fresh test DB for the new migration)**

Run: `docker compose exec django pytest apps/core/tests/test_cx_models.py --create-db -q`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/apps/core/models.py backend/apps/core/migrations/00*_cx_registry.py backend/apps/core/tests/test_cx_models.py
git commit -m "feat(cx): registry of AI-built sections (private per tenant for now)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Model answer, assembly, and prompts

**Files:**
- Create: `backend/apps/tenant_config/cx/draft.py`, `backend/apps/tenant_config/cx/prompt.py`
- Test: `backend/apps/tenant_config/tests/test_cx_draft.py`, `backend/apps/tenant_config/tests/test_cx_prompt.py`

**Interfaces:**
- Produces: pydantic `CxDraft` (fields `name, summary, dynamic, fields: list[DraftField], nodes: list[DraftNode], texts: list[DraftText], lists: list[DraftList], missing_capabilities`); `assemble(draft) -> tuple[dict, dict]` (raw spec, raw content); `prompt.EXEMPLAR` (dict, a valid `CxDraft`); `prompt.system_prompt() -> str`; `prompt.compose_turn(request, page_key, coach, style_id) -> str`; `prompt.refine_turn(instruction, spec, content, coach, style_id) -> str`; `prompt.repair_turn(turn, errors) -> str`.
- `coach` is the dict `site_composer._coach_data(tenant, brand)` returns: `{brand, niche, topic, description, followups: [{q, a}], goals}`.

- [ ] **Step 1: Write the failing tests**

`backend/apps/tenant_config/tests/test_cx_draft.py`:

```python
"""The model answers flat (parent ids); assemble() rebuilds the tree."""

from apps.tenant_config.cx.draft import CxDraft, assemble
from apps.tenant_config.cx.prompt import EXEMPLAR
from apps.tenant_config.cx.validate import validate_spec
from apps.tenant_config.tests.cx_fixtures import ITINERARY_SPEC

BASE = {
    "name": "Test",
    "summary": "",
    "fields": [
        {"name": "heading", "type": "text", "label": "Heading", "max": 80, "required": True},
        {"name": "days", "type": "items", "label": "Days"},
        {"name": "title", "parent": "days", "type": "text", "label": "Title"},
    ],
}


def test_the_prompt_example_assembles_to_the_canonical_itinerary():
    raw, content = assemble(CxDraft.model_validate(EXEMPLAR))
    spec, errors = validate_spec(raw)
    assert errors == []
    assert spec == ITINERARY_SPEC
    assert content["heading"] == "How the week unfolds"
    assert [d["title"] for d in content["days"]] == ["Arrive and settle", "Find your rhythm", "Go home lighter"]


def test_children_keep_their_listed_order_and_item_slots():
    draft = CxDraft.model_validate(
        {
            **BASE,
            "nodes": [
                {"id": "s", "t": "Section"},
                {"id": "g", "parent": "s", "t": "Grid", "props": [{"name": "each", "value": "days"}]},
                {"id": "o", "parent": "s", "t": "Opener"},
                {"id": "h", "parent": "g", "slot": "item", "t": "Heading", "props": [{"name": "bind", "value": "$.title"}]},
            ],
        }
    )
    raw, _ = assemble(draft)
    assert raw["tree"] == {
        "t": "Section",
        "children": [{"t": "Grid", "each": "days", "item": [{"t": "Heading", "bind": "$.title"}]}, {"t": "Opener"}],
    }
    assert raw["fields"]["days"]["fields"] == {"title": {"type": "text", "label": "Title"}}


def test_cycles_orphans_and_reserved_prop_names_are_ignored():
    draft = CxDraft.model_validate(
        {
            **BASE,
            "nodes": [
                {"id": "s", "t": "Section", "props": [{"name": "t", "value": "Script"}, {"name": "children", "value": "x"}]},
                {"id": "a", "parent": "b", "t": "Stack"},
                {"id": "b", "parent": "a", "t": "Stack"},
                {"id": "o", "parent": "s", "t": "Opener"},
                {"id": "x", "parent": "missing", "t": "Text"},
            ],
        }
    )
    raw, _ = assemble(draft)
    assert raw["tree"] == {"t": "Section", "children": [{"t": "Opener"}]}


def test_props_are_coerced_by_the_catalog():
    draft = CxDraft.model_validate(
        {
            **BASE,
            "nodes": [
                {"id": "g", "t": "Grid", "props": [{"name": "cols", "value": "4"}]},
                {"id": "i", "parent": "g", "slot": "item", "t": "Img", "props": [{"name": "aspect", "value": "1.25"}]},
                {"id": "t", "parent": "g", "slot": "item", "t": "Text", "props": [{"name": "muted", "value": "TRUE"}]},
                {"id": "l", "parent": "g", "slot": "item", "t": "Layout", "props": [{"name": "map", "value": "heading=heading, items=days"}]},
            ],
        }
    )
    raw, _ = assemble(draft)
    grid = raw["tree"]
    assert grid["cols"] == 4
    assert grid["item"][0]["aspect"] == 1.25
    assert grid["item"][1]["muted"] is True
    assert grid["item"][2]["map"] == {"heading": "heading", "items": "days"}


def test_no_root_means_no_tree():
    draft = CxDraft.model_validate({**BASE, "nodes": [{"id": "o", "parent": "s", "t": "Opener"}]})
    raw, _ = assemble(draft)
    assert raw["tree"] is None
    assert validate_spec(raw)[0] is None
```

`backend/apps/tenant_config/tests/test_cx_prompt.py`:

```python
"""Prompts are generated from the catalog, so new primitives reach the model."""

from apps.tenant_config import sections
from apps.tenant_config.cx import prompt as cx_prompt
from apps.tenant_config.cx.catalog import icons, primitives

COACH = {
    "brand": "Maya Laurent",
    "niche": "yoga",
    "topic": "yoga",
    "description": "I teach slow flow.",
    "followups": [{"q": "Where do you teach?", "a": "Lisbon"}],
    "goals": ["course", "live"],
}


def test_system_prompt_lists_every_primitive_family_and_icon():
    text = cx_prompt.system_prompt()
    for name in primitives():
        assert f"- {name} [" in text
    for family in sections.families():
        assert f"- {family} (" in text
    assert ", ".join(icons()) in text
    assert '"name": "Retreat itinerary"' in text


def test_compose_turn_carries_request_coach_and_the_styles_layouts():
    turn = cx_prompt.compose_turn("A retreat itinerary", "about", COACH, "maison")
    assert "BUILD THIS SECTION: A retreat itinerary" in turn
    assert "PAGE: about" in turn
    assert "FACT: Where do you teach? — Lisbon" in turn
    assert "- benefits: edit" in turn


def test_compose_turn_without_a_style():
    assert "STYLE: neutral" in cx_prompt.compose_turn("A retreat itinerary", "home", COACH, "")


def test_refine_turn_carries_the_current_section():
    turn = cx_prompt.refine_turn("Warmer heading", {"csl": 1}, {"heading": "Hi"}, COACH, "maison")
    assert "CHANGE THIS SECTION: Warmer heading" in turn
    assert 'CURRENT CONTENT: {"heading": "Hi"}' in turn


def test_repair_turn_lists_at_most_twelve_problems():
    turn = cx_prompt.repair_turn("BUILD", [f"problem {i}" for i in range(20)])
    assert "- problem 11" in turn and "problem 12" not in turn
```

- [ ] **Step 2: Run them to verify they fail**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_cx_draft.py apps/tenant_config/tests/test_cx_prompt.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'apps.tenant_config.cx.draft'`.

- [ ] **Step 3: Write `draft.py`**

`backend/apps/tenant_config/cx/draft.py`:

```python
"""The model's answer for an AI component, and its assembly into a spec.

The answer is FLAT (nodes point at their parent by id, sub-fields at their
items field) because recursive JSON schemas are not supported by every
provider's structured output. assemble() rebuilds the nested spec; nothing
here is trusted — the validator and the content cleaner run next."""

from __future__ import annotations

from collections import defaultdict

from pydantic import BaseModel, Field

from .catalog import primitives

_MAX_BUILD_DEPTH = 12  # the validator allows 8; this only guards recursion
_NODE_KEYS = frozenset({"t", "children", "item"})


class DraftField(BaseModel):
    name: str
    parent: str | None = None
    type: str
    label: str = ""
    max: int | None = None
    min: int | None = None
    required: bool = False
    item_label: str | None = None
    aspect: str | None = None
    role: str | None = None


class DraftProp(BaseModel):
    name: str
    value: str


class DraftNode(BaseModel):
    id: str
    parent: str | None = None
    slot: str = "children"
    t: str
    props: list[DraftProp] = Field(default_factory=list)


class DraftText(BaseModel):
    field: str
    value: str


class DraftCell(BaseModel):
    key: str
    value: str


class DraftRow(BaseModel):
    cells: list[DraftCell] = Field(default_factory=list)


class DraftList(BaseModel):
    field: str
    rows: list[DraftRow] = Field(default_factory=list)


class CxDraft(BaseModel):
    name: str
    summary: str = ""
    dynamic: str | None = None
    fields: list[DraftField] = Field(default_factory=list)
    nodes: list[DraftNode] = Field(default_factory=list)
    texts: list[DraftText] = Field(default_factory=list)
    lists: list[DraftList] = Field(default_factory=list)
    missing_capabilities: list[str] = Field(default_factory=list)


def _field(f: DraftField) -> dict:
    out = {"type": f.type, "label": f.label or f.name}
    for key in ("max", "min", "aspect", "role"):
        value = getattr(f, key)
        if value is not None:
            out[key] = value
    if f.required:
        out["required"] = True
    if f.item_label:
        out["itemLabel"] = f.item_label
    return out


def _map(value: str) -> dict:
    """ "heading=heading, items=perks" -> {"heading": "heading", "items": "perks"}"""
    out = {}
    for pair in value.split(","):
        to, sep, frm = pair.partition("=")
        if sep and to.strip() and frm.strip():
            out[to.strip()] = frm.strip()
    return out


def _coerce(t: str, name: str, value: str):
    """A prop's string value as the type the catalog declares for it."""
    pdef = (primitives().get(t, {}).get("props") or {}).get(name) or {}
    try:
        if "int" in pdef:
            return int(float(value))
        if "num" in pdef:
            return float(value)
    except (ValueError, OverflowError):
        return value
    if "bool" in pdef:
        return value.strip().lower() == "true"
    if "map" in pdef:
        return _map(value)
    return value


def assemble(draft: CxDraft) -> tuple[dict, dict]:
    """(raw spec, raw content)."""
    fields = {f.name: _field(f) for f in draft.fields if not f.parent}
    for f in draft.fields:
        parent = fields.get(f.parent) if f.parent else None
        if parent is not None and parent["type"] == "items":
            parent.setdefault("fields", {})[f.name] = _field(f)

    children = defaultdict(list)
    for node in draft.nodes:
        if node.parent:
            children[node.parent].append(node)
    seen: set[str] = set()

    def build(node: DraftNode, depth: int) -> dict:
        seen.add(node.id)
        out = {"t": node.t}
        out.update({p.name: _coerce(node.t, p.name, p.value) for p in node.props if p.name not in _NODE_KEYS})
        if depth < _MAX_BUILD_DEPTH:
            for child in children[node.id]:
                if child.id not in seen:
                    slot = "item" if child.slot == "item" else "children"
                    out.setdefault(slot, []).append(build(child, depth + 1))
        return out

    roots = [n for n in draft.nodes if not n.parent]
    raw = {
        "csl": 1,
        "name": draft.name,
        "summary": draft.summary,
        "fields": fields,
        "dynamic": draft.dynamic,
        "tree": build(roots[0], 1) if roots else None,
    }
    content: dict = {t.field: t.value for t in draft.texts}
    for lst in draft.lists:
        content[lst.field] = [{c.key: c.value for c in row.cells} for row in lst.rows]
    return raw, content
```

- [ ] **Step 4: Write `prompt.py`**

`backend/apps/tenant_config/cx/prompt.py`:

```python
"""Prompts for AI components. The catalog part is generated from
primitives.json and families.json, so a new primitive reaches the model
with no prompt edit."""

from __future__ import annotations

import json
from functools import cache

from apps.tenant_config import sections

from .catalog import icons, limits, primitives

_RULES = """You design ONE custom section for a solo coach's website. You never write code: you compose the \
section from a fixed catalog of primitives, and the site draws them in the coach's chosen visual style. Never \
output HTML, CSS, class names, colours or fonts.

WHAT YOU RETURN
- name, summary: what the section is, in a few plain words.
- fields: the section's content contract. Each field has a name (camelCase, at most 24 characters, never id, \
type, variant, enabled, style or cx), a type, a label (plain words the coach sees in the editor), max (longest \
text) and required. Types: text, richtext, link, image, items. An items field is a repeatable list: give it min, \
max and item_label, and declare its sub-fields as separate entries with parent set to the items field's name \
(sub-field types: text, link, image). An image field needs role (what the photo should show) and aspect (1:1, \
4:5, 3:4, 2:3, 3:2, 4:3 or 16:9).
- nodes: the section as a flat list in reading order. Each node has an id (any short string), parent (the \
parent node's id, null for the one root), slot ("children", or "item" for the item template of Grid, Rows, \
Timeline and Steps), t (the primitive) and props as name/value strings.
- texts and lists: the words for your fields. texts holds text, richtext and link fields; lists holds items \
fields, one row per item with cells keyed by sub-field name. Leave image fields out: photos are chosen for you.
- missing_capabilities: short phrases for anything asked for that the catalog cannot express (for example \
"image carousel" or "countdown timer"). Build the closest thing you can anyway.

TREE RULES
- The root is a Section (usual), a Layout, or a Sequence of Sections and Layouts.
- Section and Layout are full-width bands. Everything else goes inside a Section; never put a band inside a \
Section.
- A bind prop names one of your fields. Inside an item template, "$.title" names the current item's title \
sub-field.
- Opener draws the style's own kicker, heading and intro, so declare fields kicker, heading (text, required) and \
intro, and open most sections with it.
- Use the style's hand-built layouts: when part of the request is a standard section (benefits, steps, FAQ, \
pricing, courses, events), add a Layout for it and build new structure only for what no family covers.
- In an inverse Section or Band, use Button variant onInverse.
- Keep it focused: one clear purpose, usually 3 to 7 items, at most {nodes} nodes and {depth} levels deep.

CONTENT RULES
- Write in the coach's voice from the facts you are given.
- Never invent credentials, testimonials, reviews, prices, numbers, dates, names or quotes. When a fact is \
unknown, write neutral words the coach can edit.
- Links are site paths (/courses, /about, /contact, /calendar, /events, /plans, /faq, /blog) or empty.
- No emoji, no hashtags."""

# The worked example in the prompt. Must assemble to a spec with no
# validation errors (test_cx_draft pins it to cx_fixtures.ITINERARY_SPEC).
EXEMPLAR = {
    "name": "Retreat itinerary",
    "summary": "Day-by-day plan of a multi-day retreat",
    "dynamic": None,
    "fields": [
        {"name": "kicker", "type": "text", "label": "Kicker", "max": 40},
        {"name": "heading", "type": "text", "label": "Heading", "max": 80, "required": True},
        {"name": "intro", "type": "text", "label": "Intro", "max": 220},
        {"name": "days", "type": "items", "label": "Days", "item_label": "Day", "min": 2, "max": 10},
        {"name": "when", "parent": "days", "type": "text", "label": "Day", "max": 24},
        {"name": "title", "parent": "days", "type": "text", "label": "Title", "max": 60, "required": True},
        {"name": "text", "parent": "days", "type": "text", "label": "Plan", "max": 220},
        {
            "name": "image",
            "parent": "days",
            "type": "image",
            "label": "Photo",
            "aspect": "3:2",
            "role": "a calm retreat scene for this day",
        },
    ],
    "nodes": [
        {"id": "band", "t": "Section", "props": [{"name": "tone", "value": "surface"}]},
        {"id": "open", "parent": "band", "t": "Opener"},
        {
            "id": "line",
            "parent": "band",
            "t": "Timeline",
            "props": [{"name": "each", "value": "days"}, {"name": "marker", "value": "num"}],
        },
        {"id": "when", "parent": "line", "slot": "item", "t": "Label", "props": [{"name": "bind", "value": "$.when"}]},
        {
            "id": "title",
            "parent": "line",
            "slot": "item",
            "t": "Heading",
            "props": [{"name": "bind", "value": "$.title"}, {"name": "level", "value": "3"}],
        },
        {
            "id": "plan",
            "parent": "line",
            "slot": "item",
            "t": "Text",
            "props": [{"name": "bind", "value": "$.text"}, {"name": "muted", "value": "true"}],
        },
        {
            "id": "photo",
            "parent": "line",
            "slot": "item",
            "t": "Img",
            "props": [
                {"name": "bind", "value": "$.image"},
                {"name": "treatment", "value": "frame"},
                {"name": "aspect", "value": "1.5"},
            ],
        },
    ],
    "texts": [
        {"field": "kicker", "value": "Seven days in Bali"},
        {"field": "heading", "value": "How the week unfolds"},
        {"field": "intro", "value": "Slow mornings, long practices and time to rest."},
    ],
    "lists": [
        {
            "field": "days",
            "rows": [
                {
                    "cells": [
                        {"key": "when", "value": "Day 1"},
                        {"key": "title", "value": "Arrive and settle"},
                        {"key": "text", "value": "Check in and an easy evening class."},
                    ]
                },
                {
                    "cells": [
                        {"key": "when", "value": "Day 2"},
                        {"key": "title", "value": "Find your rhythm"},
                        {"key": "text", "value": "Morning flow and an afternoon walk."},
                    ]
                },
                {
                    "cells": [
                        {"key": "when", "value": "Day 7"},
                        {"key": "title", "value": "Go home lighter"},
                        {"key": "text", "value": "A closing circle before goodbyes."},
                    ]
                },
            ],
        }
    ],
    "missing_capabilities": [],
}


def _prop_text(name, pdef) -> str:
    if "enum" in pdef:
        kind = "|".join(map(str, pdef["enum"]))
    elif "int" in pdef:
        kind = f"whole number {pdef['int'][0]}-{pdef['int'][1]}"
    elif "num" in pdef:
        kind = f"number {pdef['num'][0]}-{pdef['num'][1]}"
    elif "bool" in pdef:
        kind = "true|false"
    elif "bind" in pdef:
        kind = "your " + "/".join(pdef["bind"]) + " field" + (" (top level only)" if pdef.get("top") else "")
    elif "each" in pdef:
        kind = "your items field"
    elif "family" in pdef:
        kind = "family id"
    elif "icon" in pdef:
        kind = "icon name"
    elif "map" in pdef:
        kind = "familyField=yourField pairs, comma-separated"
    else:
        kind = "text"
    required = ", required" if pdef.get("required") else ""
    default = f", default {pdef['default']}" if "default" in pdef else ""
    return f"{name} ({kind}{required}{default})"


def catalog_text() -> str:
    lines = []
    for name, prim in primitives().items():
        props = "; ".join(_prop_text(k, v) for k, v in (prim.get("props") or {}).items()) or "no props"
        lines.append(f"- {name} [{prim['role']}, children: {prim.get('children', 'none')}] {props}. {prim.get('doc', '')}")
    return "\n".join(lines)


def families_text() -> str:
    lines = []
    for family_id, family in sections.families().items():
        parts = []
        for name, spec in family["fields"].items():
            if spec["type"] == "items":
                subs = ", ".join(f"{k}:{v['type']}" for k, v in (spec.get("fields") or {}).items())
                parts.append(f"{name}:items[{subs}]")
            else:
                parts.append(f"{name}:{spec['type']}")
        source = f", dynamic={family['source']}" if family.get("source") else ""
        lines.append(f"- {family_id} ({family.get('label', family_id)}{source}): {', '.join(parts)}")
    return "\n".join(lines)


@cache
def system_prompt() -> str:
    rules = _RULES.replace("{nodes}", str(limits()["nodes"])).replace("{depth}", str(limits()["depth"]))
    return (
        rules
        + "\n\nPRIMITIVES\n"
        + catalog_text()
        + "\n\nICONS: "
        + ", ".join(icons())
        + "\n\nFAMILIES (for Layout: map your fields onto these field names)\n"
        + families_text()
        + "\n\nEXAMPLE (a retreat itinerary)\n"
        + json.dumps(EXEMPLAR, indent=1)
    )


def _coach_lines(coach) -> list[str]:
    lines = [f"COACH: {coach.get('brand', '')}, teaches {coach.get('topic', '')} (niche: {coach.get('niche', '')})."]
    if coach.get("description"):
        lines.append(f"ABOUT: {coach['description']}")
    for fact in coach.get("followups") or []:
        lines.append(f"FACT: {fact.get('q', '')} — {fact.get('a', '')}")
    if coach.get("goals"):
        lines.append("OFFERS: " + ", ".join(coach["goals"]))
    return lines


def _style_lines(style_id) -> list[str]:
    style = sections.style(style_id)
    if not style:
        return ["STYLE: neutral (no site style). Layout uses variant auto."]
    lines = [f"STYLE: {style.get('label', style_id)} — {style.get('mood', '')}", "LAYOUT VARIANTS IN THIS STYLE:"]
    for family, names in (style.get("variants") or {}).items():
        lines.append(f"- {family}: {', '.join(names)}")
    return lines


def compose_turn(request, page_key, coach, style_id) -> str:
    return "\n".join([f"BUILD THIS SECTION: {request}", f"PAGE: {page_key}", *_coach_lines(coach), *_style_lines(style_id)])


def refine_turn(instruction, spec, content, coach, style_id) -> str:
    return "\n".join(
        [
            f"CHANGE THIS SECTION: {instruction}",
            "Keep everything the coach did not ask to change, including field names, so their edits survive. "
            "Answer with the whole section.",
            "CURRENT SECTION: " + json.dumps(spec),
            "CURRENT CONTENT: " + json.dumps(content),
            *_coach_lines(coach),
            *_style_lines(style_id),
        ]
    )


def repair_turn(turn, errors) -> str:
    problems = "\n- ".join(errors[:12])
    return f"{turn}\n\nYOUR PREVIOUS ANSWER HAD THESE PROBLEMS. Fix them and answer again in full:\n- {problems}"
```

- [ ] **Step 5: Run the tests**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_cx_draft.py apps/tenant_config/tests/test_cx_prompt.py -q`
Expected: PASS (10 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/apps/tenant_config/cx/draft.py backend/apps/tenant_config/cx/prompt.py \
  backend/apps/tenant_config/tests/test_cx_draft.py backend/apps/tenant_config/tests/test_cx_prompt.py
git commit -m "feat(cx): flat model answer, tree assembly, catalog-generated prompts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Compose, refine, and "your sections" (service)

**Files:**
- Create: `backend/apps/tenant_config/cx/compose.py`
- Test: `backend/apps/tenant_config/tests/test_cx_compose.py`

**Interfaces:**
- Consumes: `core_ai.structured`, `core_ai.available`, `core_ai.AiError`; `site_ai.availability/record_attempt_cost/record_update`; `site_composer._coach_data/_ctx/_queries/_find_photo`; `CxDraft`, `assemble`, `validate_spec`, `clean_cx_block`, `content_of`, `REF_RE`; `CxComponent`, `CxVersion`; `TenantConfigSerializer()._sign_tree`.
- Produces: `compose(tenant, prompt_text, page_key="home") -> dict`, `refine(tenant, raw_block, instruction) -> dict` (both return `{"block": dict | None, "source": "ai" | "disabled" | "upgrade_required" | "quota_exhausted" | "error", "remaining": int, "missing": list[str]}`); `my_components(tenant) -> {"components": [{"id", "name", "summary", "ref", "spec", "content"}]}`. Runs inside the request's tenant context (`connection.tenant`).

- [ ] **Step 1: Write the failing tests**

`backend/apps/tenant_config/tests/test_cx_compose.py`:

```python
"""AI components service: gating, metering, one repair round, photos, and
the registry. The model (core_ai.structured) and photo search are mocked."""

import copy
import re
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from django_tenants.utils import schema_context

from apps.accounts.models import User
from apps.core import ai as core_ai
from apps.core.models import CxComponent, CxVersion, PlatformPlan, PlatformSubscription, SiteAiUpdateUsage
from apps.core.onboarding import site_ai, site_composer
from apps.tenant_config.cx import compose
from apps.tenant_config.cx import prompt as cx_prompt
from apps.tenant_config.cx.draft import CxDraft

pytestmark = pytest.mark.django_db(transaction=True)

REF = re.compile(r"^cx_[0-9a-f]{8}@\d+$")
PLAN = "CX Test Plan"
ASK = "A day-by-day plan of my retreat"


@pytest.fixture()
def tenant(tenant_ctx):
    with schema_context("public"):
        plan = PlatformPlan.objects.create(name=PLAN, price_monthly=19, transaction_fee_pct=5, max_site_ai_updates=5)
        owner = User.objects.create_user(email="cx-owner@x.com", name="Owner", password="x", role="owner")  # noqa: S106
        PlatformSubscription.objects.create(
            tenant=tenant_ctx, user=owner, plan=plan, status=PlatformSubscription.STATUS_ACTIVE, provider="manual"
        )
    tenant_ctx.refresh_from_db()
    return tenant_ctx


@pytest.fixture(autouse=True)
def _clean_public():
    def scrub():
        with schema_context("public"):
            CxComponent.objects.all().delete()
            SiteAiUpdateUsage.objects.all().delete()
            PlatformSubscription.objects.filter(plan__name=PLAN).delete()
            PlatformPlan.objects.filter(name=PLAN).delete()
            User.objects.filter(email="cx-owner@x.com").delete()

    scrub()
    yield
    scrub()


@pytest.fixture()
def ai(monkeypatch):
    state = SimpleNamespace(replies=[], calls=[])

    def fake(**kwargs):
        state.calls.append(kwargs)
        reply = state.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply, Decimal("0.01"), "test-model"

    monkeypatch.setattr(core_ai, "structured", fake)
    monkeypatch.setattr(core_ai, "available", lambda: (True, "ok"))
    return state


@pytest.fixture(autouse=True)
def photos(monkeypatch):
    found = []

    def fake(queries, aspect, used, ctx):
        found.append(aspect)
        return SimpleNamespace(asset_id=f"asset-{len(found)}", description="A quiet beach at dawn"), SimpleNamespace(pk=uuid4())

    monkeypatch.setattr(site_composer, "_find_photo", fake)
    return found


def draft(**changes):
    data = copy.deepcopy(cx_prompt.EXEMPLAR)
    data.update(changes)
    return CxDraft.model_validate(data)


def flawed():
    """The timeline names an undeclared list: still renderable once it is dropped, but with errors."""
    nodes = copy.deepcopy(cx_prompt.EXEMPLAR["nodes"])
    nodes[2]["props"][0]["value"] = "nope"  # Timeline.each
    return draft(nodes=nodes)


def usage(tenant):
    return site_ai.tenant_usage(tenant.schema_name)


def test_compose_builds_a_block_saves_it_and_meters_it(tenant, ai, photos):
    ai.replies.append(draft())
    res = compose.compose(tenant, ASK, "about")
    assert res["source"] == "ai" and res["remaining"] == 4 and res["missing"] == []
    block = res["block"]
    assert block["type"] == "cx" and REF.match(block["cx"]["ref"])
    assert block["heading"] == "How the week unfolds"
    assert all(day["image"]["photo_id"] for day in block["days"])
    assert photos == ["3:2", "3:2", "3:2"]
    component = CxComponent.objects.get(author_tenant_schema=tenant.schema_name)
    assert component.latest_version == 1 and component.name == "Retreat itinerary"
    assert CxVersion.objects.get(component=component).content["heading"] == "How the week unfolds"
    assert usage(tenant).updates_used == 1 and usage(tenant).usd_spent == Decimal("0.01")
    assert f"BUILD THIS SECTION: {ASK}" in ai.calls[0]["user"]
    assert "PAGE: about" in ai.calls[0]["user"]


def test_a_flawed_answer_gets_one_repair_round(tenant, ai):
    ai.replies.extend([flawed(), draft()])
    res = compose.compose(tenant, ASK)
    assert res["source"] == "ai" and len(ai.calls) == 2
    assert "PROBLEMS" in ai.calls[1]["user"] and "nope" in ai.calls[1]["user"]
    assert usage(tenant).usd_spent == Decimal("0.02")


def test_a_still_flawed_answer_is_used_in_its_cleaned_form(tenant, ai):
    ai.replies.extend([flawed(), flawed()])
    res = compose.compose(tenant, ASK)
    assert res["source"] == "ai"
    assert [n["t"] for n in res["block"]["cx"]["spec"]["tree"]["children"]] == ["Opener"]


def test_nothing_usable_is_a_friendly_error_that_costs_no_credit(tenant, ai):
    ai.replies.extend([draft(nodes=[]), core_ai.AiError("timeout", cost_usd=Decimal("0.03"))])
    res = compose.compose(tenant, ASK)
    assert res == {"block": None, "source": "error", "remaining": 5, "missing": []}
    assert usage(tenant).updates_used == 0 and usage(tenant).usd_spent == Decimal("0.04")
    assert not CxComponent.objects.exists()


def test_an_exhausted_quota_refuses_before_any_ai_call(tenant, ai):
    SiteAiUpdateUsage.objects.update_or_create(
        tenant_schema=tenant.schema_name, month=site_ai.current_month(), defaults={"updates_used": 5}
    )
    assert compose.compose(tenant, ASK)["source"] == "quota_exhausted"
    assert ai.calls == []


def test_a_too_short_request_is_refused_without_ai(tenant, ai):
    assert compose.compose(tenant, "hi")["source"] == "error"
    assert ai.calls == []


def test_ai_unavailable_reads_disabled(tenant, monkeypatch):
    monkeypatch.setattr(core_ai, "available", lambda: (False, "no_api_key"))
    assert compose.compose(tenant, ASK)["source"] == "disabled"


def test_refine_keeps_photos_and_adds_a_version(tenant, ai, photos):
    ai.replies.append(draft())
    first = compose.compose(tenant, ASK)["block"]
    texts = [{"field": "heading", "value": "Your week, day by day"}] + [
        t for t in cx_prompt.EXEMPLAR["texts"] if t["field"] != "heading"
    ]
    ai.replies.append(draft(texts=texts))
    res = compose.refine(tenant, first, "Make the heading warmer")
    block = res["block"]
    assert res["source"] == "ai" and block["id"] == first["id"]
    assert block["heading"] == "Your week, day by day"
    assert [d["image"]["photo_id"] for d in block["days"]] == [d["image"]["photo_id"] for d in first["days"]]
    assert len(photos) == 3  # no new searches
    assert block["cx"]["ref"].split("@") == [first["cx"]["ref"].split("@")[0], "2"]
    assert "CHANGE THIS SECTION: Make the heading warmer" in ai.calls[1]["user"]


def test_refining_someone_elses_component_starts_a_new_one(tenant, ai):
    CxComponent.objects.create(pk="cx_00000000", name="Theirs", author_tenant_schema="other_school", latest_version=1)
    ai.replies.append(draft())
    block = compose.compose(tenant, ASK)["block"]
    block["cx"]["ref"] = "cx_00000000@1"
    ai.replies.append(draft())
    res = compose.refine(tenant, block, "Shorter please")
    assert not res["block"]["cx"]["ref"].startswith("cx_00000000")
    assert CxComponent.objects.get(pk="cx_00000000").latest_version == 1


def test_refine_rejects_a_broken_block_without_ai(tenant, ai):
    assert compose.refine(tenant, {"type": "cx", "cx": None}, "Shorter please")["source"] == "error"
    assert ai.calls == []


def test_my_components_lists_only_this_tenants(tenant, ai):
    CxComponent.objects.create(pk="cx_00000000", name="Theirs", author_tenant_schema="other_school", latest_version=0)
    ai.replies.append(draft())
    compose.compose(tenant, ASK)
    rows = compose.my_components(tenant)["components"]
    assert [r["name"] for r in rows] == ["Retreat itinerary"]
    assert REF.match(rows[0]["ref"])
    assert rows[0]["spec"]["tree"]["t"] == "Section"
    assert rows[0]["content"]["heading"] == "How the week unfolds"
```

- [ ] **Step 2: Run them to verify they fail**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_cx_compose.py -q`
Expected: FAIL with `ImportError: cannot import name 'compose'`.

- [ ] **Step 3: Write the service**

`backend/apps/tenant_config/cx/compose.py`:

```python
"""AI components: compose a new section from a coach's description, refine
one with an instruction, list the coach's own. Metered by the Site AI quota
(apps.core.onboarding.site_ai) until components get their own numbers.

Runs inside the request's tenant context. Every function returns a
JSON-ready dict and never raises for AI trouble:
{"block": dict | None, "source": "ai" | "disabled" | "upgrade_required" |
 "quota_exhausted" | "error", "remaining": int, "missing": [str]}."""

from __future__ import annotations

import copy
import logging
import secrets
from decimal import Decimal

from django.conf import settings

from apps.core import ai as core_ai
from apps.core.models import CxComponent, CxVersion
from apps.core.onboarding import site_ai, site_composer
from apps.tenant_config import sections
from apps.tenant_config.defaults import CX_BLOCK_TYPE, KNOWN_PAGE_KEYS
from apps.tenant_config.serializers import TenantConfigSerializer

from . import prompt as cx_prompt
from .blocks import REF_RE, clean_cx_block, content_of
from .draft import CxDraft, assemble
from .validate import validate_spec

logger = logging.getLogger(__name__)

PROMPT_MIN = 8
INSTRUCTION_MIN = 3
PROMPT_MAX = 600
MAX_TOKENS = 12000
TIMEOUT_SECONDS = 90  # under Cloudflare's ~100 s edge cap
MAX_IMAGES = 8
MY_LIMIT = 50
_EMPTY_IMAGE = {"url": None, "photo_id": None, "alt": None}


class CxError(Exception):
    def __init__(self, message, cost_usd):
        super().__init__(message)
        self.cost_usd = cost_usd


def _result(source, remaining, block=None, missing=()):
    return {"block": block, "source": source, "remaining": remaining, "missing": list(missing)}


def _gate(tenant):
    """(refusal source or None, remaining compositions this month)."""
    if not core_ai.available()[0]:
        return "disabled", 0
    quota = site_ai.availability(tenant)
    return (None if quota["enabled"] else quota["reason"]), quota["remaining"]


def _context(tenant):
    from apps.tenant_config.models import TenantConfig

    config = TenantConfig.objects.first()
    style_id = (config.style if config else "") or ""
    brand = (config.brand_name if config else "") or tenant.name or ""
    return style_id, brand, site_composer._coach_data(tenant, brand)


def _generate(turn):
    """(spec, content, missing, cost) from the model with one repair round.
    A spec that still has errors after the repair is used in its cleaned
    form. Raises CxError when nothing renderable came back."""
    cost = Decimal("0")
    errors: list[str] = []
    best = None
    for attempt in range(2):
        user = turn if attempt == 0 else cx_prompt.repair_turn(turn, errors)
        try:
            draft, spent, _model = core_ai.structured(
                system=cx_prompt.system_prompt(),
                user=user,
                output_model=CxDraft,
                model=settings.ONBOARDING_AI_MODEL,
                max_tokens=MAX_TOKENS,
                label="contentor:cx-compose",
                timeout_seconds=TIMEOUT_SECONDS,
                effort="medium",
            )
        except core_ai.AiError as exc:
            cost += exc.cost_usd
            errors = [f"your answer could not be used: {str(exc)[:200]}"]
            continue
        cost += Decimal(str(spent or 0))
        raw, content = assemble(draft)
        spec, errors = validate_spec(raw)
        if spec is None:
            continue
        missing = [str(m)[:80] for m in draft.missing_capabilities[:5]]
        result = (spec, sections._clean_fields(spec["fields"], content), missing)
        if not errors:
            return (*result, cost)
        best = result
    if best is not None:
        return (*best, cost)
    raise CxError("; ".join(errors)[:500], cost)


def _photo_slots(spec, content):
    """(field spec, target dict, key) for every image slot in the content."""
    for name, field in spec["fields"].items():
        if field["type"] == "image":
            yield field, content, name
        elif field["type"] == "items":
            for sub, sub_field in field["fields"].items():
                if sub_field["type"] == "image":
                    for item in content.get(name) or []:
                        yield sub_field, item, sub


def _has_photo(value):
    return isinstance(value, dict) and bool(value.get("photo_id"))


def _find(field, ctx, words, used):
    brief = {"subject": field.get("role") or ctx["topic"]}
    try:
        image, photo = site_composer._find_photo(
            site_composer._queries(brief, ctx, words), field.get("aspect", "4:3"), used, ctx
        )
    except Exception:  # a photo must never sink the section
        logger.exception("cx photo search failed")
        image = photo = None
    if photo is None:
        return dict(_EMPTY_IMAGE)
    used.add(image.asset_id)
    return {"url": None, "photo_id": str(photo.pk), "alt": (image.description or field.get("role") or "")[:200]}


def _fill_images(content, spec, coach, brand, style_id):
    """Fill every image slot that has no photo yet (in place). At most
    MAX_IMAGES searches; the rest stay empty for the coach to pick."""
    ctx = site_composer._ctx(coach["niche"], brand, coach.get("description", ""), coach.get("topic", ""))
    words = (sections.style(style_id) or {}).get("photoWords", "")
    used: set[str] = set()
    searched = 0
    for field, target, key in _photo_slots(spec, content):
        if _has_photo(target.get(key)):
            continue
        target[key] = _find(field, ctx, words, used) if searched < MAX_IMAGES else dict(_EMPTY_IMAGE)
        searched += 1


def _words_only(content):
    """Content without photos, for the prompt."""
    out = {}
    for key, value in content.items():
        if isinstance(value, list):
            out[key] = [{k: v for k, v in item.items() if not isinstance(v, dict)} for item in value if isinstance(item, dict)]
        elif not isinstance(value, dict):
            out[key] = value
    return out


def _merge(old, new, spec):
    """New words win; photos the coach already has survive (by field, and
    by position inside lists)."""
    out = {**old, **new}
    for name, field in spec["fields"].items():
        if field["type"] == "image" and _has_photo(old.get(name)):
            out[name] = old[name]
        elif field["type"] == "items":
            subs = [k for k, s in field["fields"].items() if s["type"] == "image"]
            before = old.get(name) if isinstance(old.get(name), list) else []
            for i, item in enumerate(out.get(name) or []):
                previous = before[i] if i < len(before) and isinstance(before[i], dict) else {}
                for sub in subs:
                    if isinstance(item, dict) and not _has_photo(item.get(sub)) and _has_photo(previous.get(sub)):
                        item[sub] = previous[sub]
    return sections._clean_fields(spec["fields"], out)


def _save(tenant, ref, spec, content, prompt_text, missing):
    """Append a version to the coach's own component named by ``ref``, or
    start a new component. Returns the new ref ("cx_xxxxxxxx@n")."""
    component_id = ref.split("@")[0] if isinstance(ref, str) and REF_RE.match(ref) else None
    component = (
        CxComponent.objects.filter(pk=component_id, author_tenant_schema=tenant.schema_name).first()
        if component_id
        else None
    )
    if component is None:
        component = CxComponent.objects.create(
            pk=f"cx_{secrets.token_hex(4)}", name=spec["name"], author_tenant_schema=tenant.schema_name
        )
    n = component.latest_version + 1
    CxVersion.objects.create(
        component=component, n=n, spec=spec, content=content, prompt=prompt_text, missing_capabilities=missing
    )
    component.latest_version = n
    component.name = spec["name"]
    component.summary = spec["summary"]
    component.save(update_fields=["latest_version", "name", "summary", "updated_at"])
    return f"{component.pk}@{n}"


def _block(spec, content, ref, block_id=None):
    block = {
        "id": block_id or f"blk_{secrets.token_hex(4)}",
        "type": CX_BLOCK_TYPE,
        "enabled": True,
        "cx": {"ref": ref, "spec": spec},
        **copy.deepcopy(content),
    }
    TenantConfigSerializer()._sign_tree(block)
    return block


def compose(tenant, prompt_text, page_key="home"):
    source, remaining = _gate(tenant)
    if source:
        return _result(source, remaining)
    request = str(prompt_text or "").strip()[:PROMPT_MAX]
    if len(request) < PROMPT_MIN:
        return _result("error", remaining)
    page = page_key if page_key in KNOWN_PAGE_KEYS else "home"
    style_id, brand, coach = _context(tenant)
    try:
        spec, content, missing, cost = _generate(cx_prompt.compose_turn(request, page, coach, style_id))
    except CxError as exc:
        site_ai.record_attempt_cost(tenant.schema_name, exc.cost_usd)
        logger.warning("cx compose failed for %s: %s", tenant.schema_name, exc)
        return _result("error", remaining)
    site_ai.record_attempt_cost(tenant.schema_name, cost)
    _fill_images(content, spec, coach, brand, style_id)
    ref = _save(tenant, None, spec, content, request, missing)
    site_ai.record_update(tenant.schema_name)
    return _result("ai", max(0, remaining - 1), _block(spec, content, ref), missing)


def refine(tenant, raw_block, instruction):
    source, remaining = _gate(tenant)
    if source:
        return _result(source, remaining)
    current = clean_cx_block(raw_block)
    change = str(instruction or "").strip()[:PROMPT_MAX]
    if current is None or len(change) < INSTRUCTION_MIN:
        return _result("error", remaining)
    old_content = content_of(current)
    style_id, brand, coach = _context(tenant)
    turn = cx_prompt.refine_turn(change, current["cx"]["spec"], _words_only(old_content), coach, style_id)
    try:
        spec, content, missing, cost = _generate(turn)
    except CxError as exc:
        site_ai.record_attempt_cost(tenant.schema_name, exc.cost_usd)
        logger.warning("cx refine failed for %s: %s", tenant.schema_name, exc)
        return _result("error", remaining)
    site_ai.record_attempt_cost(tenant.schema_name, cost)
    merged = _merge(old_content, content, spec)
    _fill_images(merged, spec, coach, brand, style_id)
    ref = _save(tenant, current["cx"]["ref"], spec, merged, change, missing)
    site_ai.record_update(tenant.schema_name)
    return _result("ai", max(0, remaining - 1), _block(spec, merged, ref, current["id"]), missing)


def my_components(tenant):
    rows = []
    # ponytail: one version query per component (≤ MY_LIMIT); prefetch when the list grows.
    for component in CxComponent.objects.filter(author_tenant_schema=tenant.schema_name)[:MY_LIMIT]:
        version = component.versions.filter(n=component.latest_version).first()
        if version is None:
            continue
        content = copy.deepcopy(version.content)
        TenantConfigSerializer()._sign_tree(content)
        rows.append(
            {
                "id": component.pk,
                "name": component.name,
                "summary": component.summary,
                "ref": f"{component.pk}@{version.n}",
                "spec": version.spec,
                "content": content,
            }
        )
    return {"components": rows}
```

- [ ] **Step 4: Run the tests**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_cx_compose.py -q`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/tenant_config/cx/compose.py backend/apps/tenant_config/tests/test_cx_compose.py
git commit -m "feat(cx): compose and refine AI sections, metered by the Site AI quota

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Endpoints

**Files:**
- Create: `backend/apps/tenant_config/cx/views.py`
- Modify: `backend/apps/tenant_config/urls.py`
- Modify (generated): `frontend-customer/src/types/api-generated.ts`
- Test: `backend/apps/tenant_config/tests/test_cx_views.py`

**Interfaces:**
- Consumes: `compose.compose/refine/my_components`.
- Produces: `POST /api/v1/admin/cx/compose/ {prompt, page}`, `POST /api/v1/admin/cx/refine/ {block, instruction}`, `GET /api/v1/admin/cx/components/`. Coach/owner only, always 200 with the service's body.

- [ ] **Step 1: Write the failing tests**

`backend/apps/tenant_config/tests/test_cx_views.py`:

```python
"""Coach endpoints for AI sections: thin wiring to the service."""

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.tenant_config.cx import compose

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"
COMPOSE = "/api/v1/admin/cx/compose/"
REFINE = "/api/v1/admin/cx/refine/"
COMPONENTS = "/api/v1/admin/cx/components/"
EMPTY = {"block": None, "source": "error", "remaining": 0, "missing": []}


def _client(role, email):
    user = User.objects.create_user(email=email, name=role, password="x", role=role, is_staff=role == "owner")  # noqa: S106
    client = APIClient(HTTP_HOST=HOST)
    client.force_authenticate(user=user)
    return client


@pytest.fixture()
def coach_client(tenant_ctx):
    return _client("owner", "coach@cxviews.com")


@pytest.fixture()
def student_client(tenant_ctx):
    return _client("student", "student@cxviews.com")


def test_compose_hands_the_request_to_the_service(coach_client, monkeypatch):
    seen = {}

    def fake(tenant, prompt, page):
        seen.update(schema=tenant.schema_name, prompt=prompt, page=page)
        return EMPTY

    monkeypatch.setattr(compose, "compose", fake)
    res = coach_client.post(COMPOSE, {"prompt": "A retreat timeline", "page": "about"}, format="json")
    assert res.status_code == 200 and res.json() == EMPTY
    assert seen == {"schema": "shared_test", "prompt": "A retreat timeline", "page": "about"}


def test_refine_hands_block_and_instruction(coach_client, monkeypatch):
    seen = {}

    def fake(tenant, block, instruction):
        seen.update(block=block, instruction=instruction)
        return EMPTY

    monkeypatch.setattr(compose, "refine", fake)
    res = coach_client.post(REFINE, {"block": {"type": "cx"}, "instruction": "Warmer"}, format="json")
    assert res.status_code == 200
    assert seen == {"block": {"type": "cx"}, "instruction": "Warmer"}


def test_components_lists_the_coachs_sections(coach_client, monkeypatch):
    monkeypatch.setattr(compose, "my_components", lambda tenant: {"components": []})
    res = coach_client.get(COMPONENTS)
    assert res.status_code == 200 and res.json() == {"components": []}


def test_students_are_refused(student_client):
    assert student_client.post(COMPOSE, {}, format="json").status_code == 403
    assert student_client.post(REFINE, {}, format="json").status_code == 403
    assert student_client.get(COMPONENTS).status_code == 403
```

- [ ] **Step 2: Run them to verify they fail**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_cx_views.py -q`
Expected: FAIL with 404s.

- [ ] **Step 3: Write the views and routes**

`backend/apps/tenant_config/cx/views.py`:

```python
"""Coach endpoints for AI-built sections (/api/v1/admin/cx/…). Thin: the
service in compose.py owns gating, metering and every failure mode."""

from django.db import connection
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.permissions import IsCoachOrOwner

from . import compose


def _body(request):
    return request.data if isinstance(request.data, dict) else {}


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def cx_compose(request):
    data = _body(request)
    return Response(compose.compose(connection.tenant, data.get("prompt"), str(data.get("page") or "home")))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def cx_refine(request):
    data = _body(request)
    return Response(compose.refine(connection.tenant, data.get("block"), data.get("instruction")))


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def cx_components(request):
    return Response(compose.my_components(connection.tenant))
```

In `backend/apps/tenant_config/urls.py`, add the import `from .cx import views as cx_views` beside the other view imports, and add to `urlpatterns` after the `config/logo-refine/` route:

```python
    path("cx/compose/", cx_views.cx_compose, name="cx-compose"),
    path("cx/refine/", cx_views.cx_refine, name="cx-refine"),
    path("cx/components/", cx_views.cx_components, name="cx-components"),
```

- [ ] **Step 4: Run the tests**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_cx_views.py -q`
Expected: PASS (4 tests).

- [ ] **Step 5: Refresh the generated API types**

Run: `cd frontend-customer && npm run gen:api && git diff --stat src/types/api-generated.ts`
Expected: only the three new `/api/v1/admin/cx/...` paths are added. Any other diff means the contract moved for another reason: stop and investigate.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/tenant_config/cx/views.py backend/apps/tenant_config/urls.py \
  backend/apps/tenant_config/tests/test_cx_views.py frontend-customer/src/types/api-generated.ts
git commit -m "feat(cx): coach endpoints for composing and refining AI sections

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The native renderer

**Files:**
- Create: `frontend-customer/src/components/cx/context.ts`, `atoms.tsx`, `patterns.tsx`, `layout-embed.tsx`, `primitives.ts`, `spec-renderer.tsx`, `cx-block.tsx`
- Test: `frontend-customer/src/components/cx/__tests__/fixtures.ts`, `catalog-parity.test.ts`, `spec-renderer.test.ts`

**Interfaces:**
- Consumes: `STYLE_KITS`, `DEFAULT_KIT`, `StyleKit`, `KitTone` (Task 1); `CX_CATALOG`, `CxNode`, `CxSpec` (Task 2); `Txt`, `Rich`, `Img`, `SmartLink` from `components/sections/kit.tsx`; `STYLE_SECTIONS`, `resolveSection` from `components/sections/registry.ts`.
- Produces: `CxCtx`, `CxRender`; `CX_PRIMITIVES: Record<string, CxRender>`; `ICON_NAMES`; `renderNodes(nodes, ctx)`; `SpecRenderer({spec, block, data, editable, kit})`; `CxBlock({data, dynamicData, editable, styleId})`, which takes `BlockComponentProps` plus `styleId` (Task 10 adds `styleId` to that type; until then `cx-block.tsx` declares it locally, see Step 4).

- [ ] **Step 1: Add the fixtures and failing tests**

`frontend-customer/src/components/cx/__tests__/fixtures.ts`:

```ts
import type { CxSpec } from "@shared/cx/types";
import type { Block } from "@/types/tenant";

/** Mirrors backend/apps/tenant_config/tests/cx_fixtures.py. */
export const ITINERARY_SPEC: CxSpec = {
  csl: 1,
  name: "Retreat itinerary",
  summary: "Day-by-day plan of a multi-day retreat",
  fields: {
    kicker: { type: "text", label: "Kicker", max: 40 },
    heading: { type: "text", label: "Heading", required: true, max: 80 },
    intro: { type: "text", label: "Intro", max: 220 },
    days: {
      type: "items",
      label: "Days",
      fields: {
        when: { type: "text", label: "Day", max: 24 },
        title: { type: "text", label: "Title", required: true, max: 60 },
        text: { type: "text", label: "Plan", max: 220 },
        image: { type: "image", label: "Photo", aspect: "3:2", role: "a calm retreat scene for this day" },
      },
      max: 10,
      min: 2,
      itemLabel: "Day",
    },
  },
  dynamic: null,
  tree: {
    t: "Section",
    tone: "surface",
    width: "wrap",
    children: [
      { t: "Opener" },
      {
        t: "Timeline",
        each: "days",
        orient: "vertical",
        marker: "num",
        item: [
          { t: "Label", bind: "$.when" },
          { t: "Heading", bind: "$.title", level: 3, size: "md" },
          { t: "Text", bind: "$.text", size: "md", muted: true, measure: "normal" },
          { t: "Img", bind: "$.image", treatment: "frame", aspect: 1.5 },
        ],
      },
    ],
  },
};

export const itineraryBlock = (over: Partial<Block> = {}): Block => ({
  id: "blk_cxtest01",
  type: "cx",
  enabled: true,
  cx: { ref: null, spec: ITINERARY_SPEC },
  kicker: "Seven days in Bali",
  heading: "How the week unfolds",
  intro: "Slow mornings, long practices and time to rest.",
  days: [
    {
      when: "Day 1",
      title: "Arrive and settle",
      text: "Check in and an easy evening class.",
      image: { url: "https://img.test/day1.jpg", photo_id: "p1", alt: "A quiet beach at dawn" },
    },
    { when: "Day 2", title: "Find your rhythm", text: "Morning flow and an afternoon walk." },
  ],
  ...over,
});
```

`frontend-customer/src/components/cx/__tests__/catalog-parity.test.ts`:

```ts
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/nav-link", async () => {
  const { createElement: h } = await vi.importActual<typeof import("react")>("react");
  return {
    NavLink: ({ href, className, children }: { href: string; className?: string; children?: ReactNode }) =>
      h("a", { href, className }, children),
  };
});

import { CX_CATALOG } from "@shared/cx/types";
import { ICON_NAMES } from "../atoms";
import { CX_PRIMITIVES } from "../primitives";

describe("catalog parity", () => {
  it("every catalog primitive has a renderer, and nothing else does", () => {
    expect(Object.keys(CX_PRIMITIVES).sort()).toEqual(Object.keys(CX_CATALOG.primitives).sort());
  });

  it("every catalog icon has a glyph", () => {
    expect([...ICON_NAMES].sort()).toEqual([...CX_CATALOG.icons].sort());
  });
});
```

`frontend-customer/src/components/cx/__tests__/spec-renderer.test.ts`:

```ts
import type { ReactNode } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/nav-link", async () => {
  const { createElement: h } = await vi.importActual<typeof import("react")>("react");
  return {
    NavLink: ({ href, className, children }: { href: string; className?: string; children?: ReactNode }) =>
      h("a", { href, className }, children),
  };
});

import type { CxSpec } from "@shared/cx/types";
import { STYLE_KITS } from "@/components/sections/all-styles";
import type { EditableContext } from "@/lib/blocks/types";
import type { Block } from "@/types/tenant";
import { CxBlock } from "../cx-block";
import { ITINERARY_SPEC, itineraryBlock } from "./fixtures";

const EDITABLE: EditableContext = { onTextChange: () => {} };
const html = (block: Block, styleId: string, editable?: EditableContext) =>
  renderToStaticMarkup(createElement(CxBlock, { data: block, styleId, editable }));

describe("SpecRenderer", () => {
  it("renders the section in every site style", () => {
    for (const id of Object.keys(STYLE_KITS)) {
      const out = html(itineraryBlock(), id);
      expect(out, id).toContain("How the week unfolds");
      expect(out, id).toContain("Find your rhythm");
      expect(out, id).toContain("https://img.test/day1.jpg");
    }
  });

  it("falls back to the neutral kit for an unknown or empty style", () => {
    for (const id of ["", "no-such-style"]) {
      expect(html(itineraryBlock(), id), id).toContain("Arrive and settle");
    }
  });

  it("renders nothing for a block without a spec", () => {
    expect(html({ id: "blk_x", type: "cx" }, "maison")).toBe("");
  });

  it("an empty item list leaves no editor hint on the public site", () => {
    const out = html(itineraryBlock({ days: [] }), "maison");
    expect(out).toContain("How the week unfolds");
    expect(out).not.toContain("Add items");
  });

  it("an empty item list shows a hint while editing", () => {
    expect(html(itineraryBlock({ days: [] }), "maison", EDITABLE)).toContain("Add items in the editor panel");
  });

  it("skips primitives this build does not know", () => {
    const spec = structuredClone(ITINERARY_SPEC);
    spec.tree.children!.push({ t: "Hologram" }, { t: "constructor" });
    expect(html(itineraryBlock({ cx: { ref: null, spec } }), "maison")).toContain("Find your rhythm");
  });

  it("embeds an existing family layout with its fields remapped", () => {
    const spec: CxSpec = {
      csl: 1,
      name: "Perks",
      summary: "",
      dynamic: null,
      fields: {
        heading: { type: "text", label: "Heading", max: 80 },
        perks: {
          type: "items",
          label: "Perks",
          max: 6,
          min: 0,
          itemLabel: "Perk",
          fields: { title: { type: "text", label: "Title", max: 40 }, text: { type: "text", label: "Text", max: 160 } },
        },
      },
      tree: { t: "Layout", family: "benefits", variant: "auto", map: { heading: "heading", items: "perks" } },
    };
    const out = html(
      { id: "blk_perks001", type: "cx", cx: { ref: null, spec }, heading: "Why train here", perks: [{ title: "Small groups", text: "Six people at most." }] },
      "maison",
    );
    expect(out).toContain("Why train here");
    expect(out).toContain("Small groups");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `docker compose exec nextjs-customer npx vitest run src/components/cx`
Expected: FAIL. `../primitives` / `../cx-block` cannot be resolved.

- [ ] **Step 3: Write the renderer modules**

`frontend-customer/src/components/cx/context.ts`:

```ts
import type { ReactNode } from "react";
import type { CxNode, CxSpec } from "@shared/cx/types";
import type { StyleKit } from "@/components/sections/kit-contract";
import type { EditableContext } from "@/lib/blocks/types";
import type { Block } from "@/types/tenant";

/** Everything a primitive renderer needs. `item`/`index` are set inside an
 *  item template (Grid, Rows, Timeline, Steps). */
export interface CxCtx {
  kit: StyleKit;
  block: Block;
  spec: CxSpec;
  data?: unknown;
  editable?: EditableContext;
  item?: Record<string, unknown>;
  index?: number;
  /** Renders child nodes (passed in, so renderer modules import no cycle). */
  render: (nodes: CxNode[] | undefined, ctx: CxCtx) => ReactNode;
}

export type CxRender = (node: CxNode, ctx: CxCtx) => ReactNode;

export const isItemBind = (bind: unknown) => typeof bind === "string" && bind.startsWith("$.");

/** "$.title" → the current item's value; "heading" → the block's. */
export function valueOf(ctx: CxCtx, bind: unknown): unknown {
  if (typeof bind !== "string") return undefined;
  return isItemBind(bind) ? ctx.item?.[bind.slice(2)] : ctx.block[bind];
}

export const text = (value: unknown) => (typeof value === "string" ? value : "");

/** table[value] for a known key (own keys only), else table[fallback]. */
export function pick<T>(value: unknown, table: Record<string, T>, fallback: string): T {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(table, value) ? table[value] : table[fallback];
}

export function clampNum(value: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

const ROMAN: [number, string][] = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];

/** 0 → "01" (pad2), "1" (plain) or "I" (roman). */
export function ordinal(index: number, format: unknown): string {
  const n = index + 1;
  if (format === "plain") return String(n);
  if (format === "roman") {
    let rest = n;
    let out = "";
    for (const [value, numeral] of ROMAN) {
      while (rest >= value) {
        out += numeral;
        rest -= value;
      }
    }
    return out;
  }
  return String(n).padStart(2, "0");
}
```

`frontend-customer/src/components/cx/atoms.tsx`:

```tsx
/** Leaf and container atoms of AI-built sections. Each renderer is a plain
 *  function (no hooks), so one tree renders on the server for visitors and in
 *  the client canvas for the coach. Class names are literals only: nothing
 *  from a spec ever reaches className. */
import {
  Award, BookOpen, CalendarDays, Camera, Check, Clock, Coffee, Compass, Dumbbell, Feather, Flame, Flower2,
  Footprints, Gift, Globe, GraduationCap, Heart, Leaf, Mail, MapPin, MessageCircle, Moon, Mountain, Music,
  Palette, Smile, Sparkles, Star, Sun, Target, Users, Waves, type LucideIcon,
} from "lucide-react";
import type { CxNode } from "@shared/cx/types";
import { Img, Rich as RichField, SmartLink, Txt } from "@/components/sections/kit";
import { cn } from "@/lib/utils";
import { type CxCtx, type CxRender, clampNum, isItemBind, ordinal, pick, text, valueOf } from "./context";

type Tag = "h2" | "h3" | "h4" | "p" | "span";

/** A bound text value: inline-editable when bound to a block field, plain
 *  when bound to an item field. Nothing when empty on the public site. */
function TextOf({
  ctx,
  bind,
  as,
  className,
  placeholder,
}: {
  ctx: CxCtx;
  bind: unknown;
  as: Tag;
  className?: string;
  placeholder?: string;
}) {
  if (!isItemBind(bind)) {
    return (
      <Txt block={ctx.block} field={String(bind)} editable={ctx.editable} as={as} className={className} placeholder={placeholder} />
    );
  }
  const value = text(valueOf(ctx, bind));
  if (!value) return null;
  const Tag = as;
  return <Tag className={className}>{value}</Tag>;
}

const TONE = { base: "base", surface: "surface", inverse: "inverse" } as const;

export const Section: CxRender = (node, ctx) => (
  <ctx.kit.Section tone={pick(node.tone, TONE, "base")} label={text(ctx.block.heading) || undefined}>
    <div
      className={cn(
        ctx.kit.wrap,
        "flex flex-col gap-12 md:gap-16",
        node.width === "narrow" && "max-w-3xl",
        node.width === "full" && "max-w-none",
      )}
    >
      {ctx.render(node.children, ctx)}
    </div>
  </ctx.kit.Section>
);

export const Sequence: CxRender = (node, ctx) => <>{ctx.render(node.children, ctx)}</>;

export const Opener: CxRender = (_node, ctx) => <ctx.kit.Opener block={ctx.block} editable={ctx.editable} />;

export const Heading: CxRender = (node, ctx) => {
  const level: 2 | 3 | 4 = node.level === 2 ? 2 : node.level === 4 ? 4 : 3;
  const large = node.size === "lg";
  const base = level === 2 ? (large ? ctx.kit.display : ctx.kit.h2) : large ? ctx.kit.h2 : ctx.kit.h3;
  return (
    <TextOf
      ctx={ctx}
      bind={node.bind}
      as={`h${level}`}
      placeholder="Heading"
      className={cn("block", base, level === 4 && !large && "text-lg/snug", node.size === "sm" && "text-[1.35rem]/[1.2]")}
    />
  );
};

const TEXT_SIZE = {
  sm: "text-sm/relaxed",
  md: "text-base/relaxed md:text-[1.0625rem]/[1.7]",
  lg: "text-lg/relaxed md:text-xl/relaxed",
};
const MEASURE = { narrow: "max-w-[44ch]", normal: "max-w-[65ch]", wide: "" };

export const Text: CxRender = (node, ctx) => (
  <TextOf
    ctx={ctx}
    bind={node.bind}
    as="p"
    placeholder="Text"
    className={cn(
      "block text-pretty",
      pick(node.size, TEXT_SIZE, "md"),
      pick(node.measure, MEASURE, "normal"),
      node.muted === true && "text-muted-foreground",
    )}
  />
);

export const Rich: CxRender = (node, ctx) => (
  <RichField block={ctx.block} field={String(node.bind)} editable={ctx.editable} className="max-w-[65ch] text-base/relaxed" />
);

export const Label: CxRender = (node, ctx) => (
  <TextOf ctx={ctx} bind={node.bind} as="p" placeholder="Label" className={cn(ctx.kit.label, "block text-muted-foreground")} />
);

export const Badge: CxRender = (node, ctx) => (
  <TextOf
    ctx={ctx}
    bind={node.bind}
    as="span"
    placeholder="Badge"
    className={cn(ctx.kit.label, "inline-flex w-fit items-center rounded-full border border-current px-3 py-1")}
  />
);

const NUM = "block font-display text-[2rem]/none text-accent";

export const Num: CxRender = (node, ctx) =>
  node.bind ? (
    <TextOf ctx={ctx} bind={node.bind} as="span" className={cn(ctx.kit.num, NUM)} />
  ) : (
    <span aria-hidden="true" className={cn(ctx.kit.num, NUM)}>
      {ordinal(ctx.index ?? 0, node.format)}
    </span>
  );

export const ImgNode: CxRender = (node, ctx) => {
  const value = valueOf(ctx, node.bind);
  const treatment = typeof node.treatment === "string" ? node.treatment : "plain";
  const ratio = treatment === "circle" ? 1 : clampNum(node.aspect, 0.5, 2.5, 1.333);
  const { media } = ctx.kit;
  const alt =
    text((value as { alt?: unknown } | null | undefined)?.alt) || text(ctx.item?.title) || text(ctx.block.heading);
  return (
    <div className={cn("w-full", treatment === "frame" && media.frame, treatment === "polaroid" && media.polaroid)}>
      <div
        className={cn("relative w-full overflow-hidden", treatment === "arch" && media.arch, treatment === "circle" && media.circle)}
        style={{ aspectRatio: String(ratio) }}
      >
        <Img value={value} alt={alt} className="absolute inset-0 h-full w-full" />
      </div>
    </div>
  );
};

function Action({ node, ctx, className }: { node: CxNode; ctx: CxCtx; className: string }) {
  const label = text(valueOf(ctx, node.label));
  const editingLabel = Boolean(ctx.editable) && !isItemBind(node.label);
  if (!label && !editingLabel) return null;
  const href = text(valueOf(ctx, node.href)) || null;
  return (
    <SmartLink href={ctx.editable ? null : href} className={cn("w-fit", className)}>
      <TextOf ctx={ctx} bind={node.label} as="span" placeholder="Button text" />
    </SmartLink>
  );
}

export const Button: CxRender = (node, ctx) => (
  <Action
    node={node}
    ctx={ctx}
    className={
      node.variant === "ghost"
        ? ctx.kit.button.ghost
        : node.variant === "onInverse"
          ? ctx.kit.button.onInverse
          : ctx.kit.button.primary
    }
  />
);

export const LinkNode: CxRender = (node, ctx) => (
  <Action node={node} ctx={ctx} className="underline decoration-1 underline-offset-[6px] transition-colors hover:text-primary" />
);

const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles, heart: Heart, star: Star, sun: Sun, moon: Moon, leaf: Leaf, flower: Flower2,
  mountain: Mountain, waves: Waves, flame: Flame, music: Music, palette: Palette, camera: Camera, book: BookOpen,
  graduation: GraduationCap, dumbbell: Dumbbell, footprints: Footprints, clock: Clock, calendar: CalendarDays,
  pin: MapPin, users: Users, chat: MessageCircle, mail: Mail, check: Check, gift: Gift, coffee: Coffee,
  globe: Globe, award: Award, target: Target, smile: Smile, compass: Compass, feather: Feather,
};
export const ICON_NAMES = Object.keys(ICONS);
const ICON_SIZE = { sm: "size-5", md: "size-7", lg: "size-10" };

export const Icon: CxRender = (node) => {
  const Glyph =
    typeof node.name === "string" && Object.prototype.hasOwnProperty.call(ICONS, node.name) ? ICONS[node.name] : null;
  return Glyph ? <Glyph aria-hidden="true" strokeWidth={1.5} className={cn("text-primary", pick(node.size, ICON_SIZE, "md"))} /> : null;
};

export const Card: CxRender = (node, ctx) => (
  <div className={cn("flex flex-col gap-4", ctx.kit.card, node.emphasis === "strong" && "bg-muted")}>
    {ctx.render(node.children, ctx)}
  </div>
);

const GAP = { sm: "gap-3", md: "gap-6", lg: "gap-10" };

export const Stack: CxRender = (node, ctx) => (
  <div className={cn("flex min-w-0 flex-col", pick(node.gap, GAP, "md"), node.align === "center" && "items-center text-center")}>
    {ctx.render(node.children, ctx)}
  </div>
);

export const Ornament: CxRender = (node, ctx) => {
  const slot = node.slot === "glyph" ? "glyph" : "divider";
  const Own = ctx.kit.ornaments[slot];
  if (Own) return <Own />;
  return slot === "divider" ? (
    <span aria-hidden="true" className="block h-px w-16 bg-current opacity-30" />
  ) : (
    <span aria-hidden="true" className="text-xl text-accent">
      ✦
    </span>
  );
};
```

`frontend-customer/src/components/cx/patterns.tsx`:

```tsx
/** Layout patterns of AI-built sections: one cell, row or step per item of
 *  an items field. Responsive collapse is fixed here; the spec only picks
 *  enums and clamped numbers (passed as --cx-* custom properties). */
import type { CSSProperties } from "react";
import type { CxNode } from "@shared/cx/types";
import { cn } from "@/lib/utils";
import { type CxCtx, type CxRender, clampNum, ordinal, pick } from "./context";

function itemsOf(node: CxNode, ctx: CxCtx): Record<string, unknown>[] {
  const list = ctx.block[String(node.each ?? "")];
  return Array.isArray(list) ? list.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object") : [];
}

const at = (ctx: CxCtx, item: Record<string, unknown>, index: number): CxCtx => ({ ...ctx, item, index });

/** Nothing on the public site; a hint on the coach's canvas. */
function EmptyItems({ ctx }: { ctx: CxCtx }) {
  if (!ctx.editable) return null;
  return (
    <p className="rounded-[var(--radius)] border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      Add items in the editor panel.
    </p>
  );
}

const RATIO: Record<string, [string, string]> = {
  "1/2": ["lg:col-span-6", "lg:col-span-6"],
  "5/7": ["lg:col-span-5", "lg:col-span-7"],
  "4/8": ["lg:col-span-4", "lg:col-span-8"],
  "7/5": ["lg:col-span-7", "lg:col-span-5"],
  "8/4": ["lg:col-span-8", "lg:col-span-4"],
};

export const Split: CxRender = (node, ctx) => {
  const [a, b] = pick(node.ratio, RATIO, "1/2");
  const [first, second] = node.children ?? [];
  return (
    <div className={cn("grid gap-10 lg:grid-cols-12 lg:gap-14", node.valign === "center" && "lg:items-center")}>
      <div className={cn("min-w-0", a, node.reverse === true && "lg:order-2", node.sticky === true && "lg:sticky lg:top-24 lg:self-start")}>
        {ctx.render(first ? [first] : [], ctx)}
      </div>
      <div className={cn("min-w-0", b, node.reverse === true && "lg:order-1")}>{ctx.render(second ? [second] : [], ctx)}</div>
    </div>
  );
};

const GAP_Y = { sm: "gap-y-6", md: "gap-y-10", lg: "gap-y-16" };

export const Grid: CxRender = (node, ctx) => {
  const items = itemsOf(node, ctx);
  if (!items.length) return <EmptyItems ctx={ctx} />;
  const cols = Math.round(clampNum(node.cols, 1, 6, 3));
  const card = node.card === "soft" || node.card === "strong" ? node.card : null;
  const numbered = typeof node.numbering === "string" && node.numbering !== "none";
  return (
    <ol
      className={cn(
        "grid gap-x-8 lg:grid-cols-[repeat(var(--cx-cols),minmax(0,1fr))]",
        pick(node.gap, GAP_Y, "md"),
        cols > 1 && "sm:grid-cols-2",
      )}
      style={{ "--cx-cols": cols } as CSSProperties}
    >
      {items.map((item, i) => (
        <li key={i} className={cn("flex min-w-0 flex-col gap-3", card && ctx.kit.card, card === "strong" && "bg-muted")}>
          {numbered && (
            <span aria-hidden="true" className={cn(ctx.kit.num, "font-display text-[1.75rem]/none text-accent")}>
              {ordinal(i, node.numbering)}
            </span>
          )}
          {ctx.render(node.item, at(ctx, item, i))}
        </li>
      ))}
    </ol>
  );
};

export const Rows: CxRender = (node, ctx) => {
  const items = itemsOf(node, ctx);
  if (!items.length) return <EmptyItems ctx={ctx} />;
  const divider = node.divider === "none" || node.divider === "leader" ? node.divider : "hairline";
  const numbered = typeof node.numbering === "string" && node.numbering !== "none";
  const [head, ...rest] = node.item ?? [];
  return (
    <ol className="flex flex-col">
      {items.map((item, i) => {
        const c = at(ctx, item, i);
        return (
          <li
            key={i}
            className={cn(
              "flex flex-col gap-2 py-6 md:flex-row md:items-baseline md:gap-6",
              divider === "hairline" && "border-t border-border first:border-t-0",
            )}
          >
            {numbered && (
              <span aria-hidden="true" className={cn(ctx.kit.num, "w-10 shrink-0 text-accent")}>
                {ordinal(i, node.numbering)}
              </span>
            )}
            <div className={cn("min-w-0", divider === "leader" ? "shrink-0" : "md:w-1/3 md:shrink-0")}>
              {ctx.render(head ? [head] : [], c)}
            </div>
            {divider === "leader" && (
              <span aria-hidden="true" className="hidden min-w-8 flex-1 border-b border-dotted border-current opacity-40 md:block" />
            )}
            <div className={cn("flex min-w-0 flex-col gap-2", divider === "leader" ? "md:shrink-0 md:text-right" : "flex-1")}>
              {ctx.render(rest, c)}
            </div>
          </li>
        );
      })}
    </ol>
  );
};

function Marker({ node, ctx, index }: { node: CxNode; ctx: CxCtx; index: number }) {
  if (node.marker === "dot") return <span className="block size-3 rounded-full bg-primary" />;
  if (node.marker === "glyph") {
    const Glyph = ctx.kit.ornaments.glyph;
    return Glyph ? <Glyph /> : <span className="text-accent">✦</span>;
  }
  return (
    <span className={cn(ctx.kit.num, "grid size-9 place-items-center rounded-full bg-primary text-sm text-primary-foreground")}>
      {index + 1}
    </span>
  );
}

export const Timeline: CxRender = (node, ctx) => {
  const items = itemsOf(node, ctx);
  if (!items.length) return <EmptyItems ctx={ctx} />;
  if (node.orient === "horizontal") {
    return (
      <ol className="grid gap-10 md:auto-cols-fr md:grid-flow-col md:gap-8">
        {items.map((item, i) => (
          <li key={i} className="flex min-w-0 flex-col gap-3 md:border-t md:border-border md:pt-6">
            <span aria-hidden="true" className="flex h-9 items-center">
              <Marker node={node} ctx={ctx} index={i} />
            </span>
            {ctx.render(node.item, at(ctx, item, i))}
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ol className="flex flex-col">
      {items.map((item, i) => (
        <li key={i} className="group relative grid grid-cols-[2.25rem_1fr] gap-x-6 pb-12 last:pb-0">
          <span aria-hidden="true" className="relative flex justify-center">
            <span className="absolute bottom-0 top-9 w-px bg-border group-last:hidden" />
            <span className="relative flex h-9 items-center">
              <Marker node={node} ctx={ctx} index={i} />
            </span>
          </span>
          <div className="flex min-w-0 flex-col gap-3 pt-1.5">{ctx.render(node.item, at(ctx, item, i))}</div>
        </li>
      ))}
    </ol>
  );
};

export const Steps: CxRender = (node, ctx) => {
  const items = itemsOf(node, ctx);
  if (!items.length) return <EmptyItems ctx={ctx} />;
  const cols = Math.round(clampNum(node.cols, 2, 5, 3));
  return (
    <ol
      className="grid gap-10 md:grid-cols-[repeat(var(--cx-cols),minmax(0,1fr))] md:gap-8"
      style={{ "--cx-cols": cols } as CSSProperties}
    >
      {items.map((item, i) => (
        <li key={i} className="flex min-w-0 flex-col gap-3">
          <div aria-hidden="true" className="flex items-center gap-4">
            <span className={cn(ctx.kit.num, "font-display text-[2.25rem]/none text-accent")}>{ordinal(i, node.numbering ?? "pad2")}</span>
            {node.connector !== "none" && i < items.length - 1 && <span className="hidden h-px flex-1 bg-border md:block" />}
          </div>
          {ctx.render(node.item, at(ctx, item, i))}
        </li>
      ))}
    </ol>
  );
};

export const Band: CxRender = (node, ctx) => (
  <div
    className={cn(
      "flex flex-col gap-6 rounded-[var(--radius)] p-8 md:p-12",
      node.tone === "surface" ? "bg-muted text-foreground" : "bg-[var(--inverse)] text-[color:var(--inverse-foreground)]",
    )}
  >
    {ctx.render(node.children, ctx)}
  </div>
);
```

`frontend-customer/src/components/cx/layout-embed.tsx`:

```tsx
/** Layout: one of the style's hand-built section layouts (the 300 variants),
 *  filled from the AI section's own fields via `map`. Inline edits on the
 *  embedded layout are routed back to the mapped field. */
import { STYLE_SECTIONS, resolveSection } from "@/components/sections/registry";
import type { EditableContext } from "@/lib/blocks/types";
import type { Block } from "@/types/tenant";
import type { CxRender } from "./context";

function remap(editable: EditableContext, map: Record<string, string>): EditableContext {
  const field = (name: string) => map[name] ?? name;
  const rich = editable.onEditRichText;
  return {
    onTextChange: (name, value) => editable.onTextChange(field(name), value),
    onEditRichText: rich && ((name, value) => rich(field(name), value)),
  };
}

export const Layout: CxRender = (node, ctx) => {
  const family = String(node.family ?? "");
  const map = (node.map && typeof node.map === "object" ? node.map : {}) as Record<string, string>;
  const name = node.variant === "auto" ? "" : String(node.variant ?? "");
  const block: Block = { id: `${ctx.block.id}-${family}`, type: `section.${family}`, variant: `${ctx.kit.id}.${name}` };
  for (const [to, from] of Object.entries(map)) block[to] = ctx.block[from];
  const Comp = resolveSection(STYLE_SECTIONS, family, block.variant);
  if (!Comp) return null;
  return <Comp block={block} data={ctx.data} editable={ctx.editable && remap(ctx.editable, map)} />;
};
```

`frontend-customer/src/components/cx/primitives.ts`:

```ts
import * as atoms from "./atoms";
import type { CxRender } from "./context";
import { Layout } from "./layout-embed";
import * as patterns from "./patterns";

/** Catalog primitive name → renderer (parity-tested against primitives.json). */
export const CX_PRIMITIVES: Record<string, CxRender> = {
  Sequence: atoms.Sequence,
  Section: atoms.Section,
  Layout,
  Opener: atoms.Opener,
  Heading: atoms.Heading,
  Text: atoms.Text,
  Rich: atoms.Rich,
  Label: atoms.Label,
  Num: atoms.Num,
  Img: atoms.ImgNode,
  Button: atoms.Button,
  Link: atoms.LinkNode,
  Badge: atoms.Badge,
  Icon: atoms.Icon,
  Card: atoms.Card,
  Stack: atoms.Stack,
  Ornament: atoms.Ornament,
  Split: patterns.Split,
  Grid: patterns.Grid,
  Rows: patterns.Rows,
  Timeline: patterns.Timeline,
  Steps: patterns.Steps,
  Band: patterns.Band,
};
```

`frontend-customer/src/components/cx/spec-renderer.tsx`:

```tsx
import { Fragment, type ReactNode } from "react";
import type { CxNode, CxSpec } from "@shared/cx/types";
import type { StyleKit } from "@/components/sections/kit-contract";
import type { EditableContext } from "@/lib/blocks/types";
import type { Block } from "@/types/tenant";
import type { CxCtx } from "./context";
import { CX_PRIMITIVES } from "./primitives";

/** Child nodes → elements. Unknown primitives (a spec newer than this
 *  build) render nothing. */
export function renderNodes(nodes: CxNode[] | undefined, ctx: CxCtx): ReactNode {
  return (nodes ?? []).map((node, i) => {
    const render = Object.prototype.hasOwnProperty.call(CX_PRIMITIVES, node.t) ? CX_PRIMITIVES[node.t] : null;
    return render ? <Fragment key={i}>{render(node, ctx)}</Fragment> : null;
  });
}

/** An AI-built section: walks the validated spec with the site style's kit.
 *  Plain functions only, so it server-renders for visitors and
 *  client-renders on the coach's canvas with the same markup. */
export function SpecRenderer({
  spec,
  block,
  data,
  editable,
  kit,
}: {
  spec: CxSpec;
  block: Block;
  data?: unknown;
  editable?: EditableContext;
  kit: StyleKit;
}) {
  const ctx: CxCtx = { kit, block, spec, data, editable, render: renderNodes };
  return <>{renderNodes([spec.tree], ctx)}</>;
}
```

- [ ] **Step 4: Write the block component**

`frontend-customer/src/components/cx/cx-block.tsx`:

```tsx
import type { CxSpec } from "@shared/cx/types";
import { STYLE_KITS } from "@/components/sections/all-styles";
import { DEFAULT_KIT } from "@/components/sections/kit-contract";
import type { BlockComponentProps } from "@/lib/blocks/types";
import { SpecRenderer } from "./spec-renderer";

/** Renders a `cx` block with the site style's kit (neutral kit when the
 *  style is unknown or unset). */
export function CxBlock({ data, dynamicData, editable, styleId }: BlockComponentProps & { styleId?: string }) {
  const spec = (data.cx as { spec?: CxSpec } | undefined)?.spec;
  if (!spec?.tree) return null;
  const kit = styleId && Object.prototype.hasOwnProperty.call(STYLE_KITS, styleId) ? STYLE_KITS[styleId] : DEFAULT_KIT;
  return <SpecRenderer spec={spec} block={data} data={dynamicData} editable={editable} kit={kit} />;
}
```

(Task 10 adds `styleId` to `BlockComponentProps`; then simplify the props type to `BlockComponentProps`.)

- [ ] **Step 5: Run the tests and the typecheck**

Run: `docker compose exec nextjs-customer npx vitest run src/components/cx`
Expected: PASS (9 tests).

Run: `docker compose exec nextjs-customer npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add frontend-customer/src/components/cx
git commit -m "feat(cx): native spec renderer — atoms, patterns and embedded style layouts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Wire `cx` into the block system

**Files:**
- Modify: `frontend-customer/src/lib/blocks/types.ts`, `section-defs.ts`, `registry.tsx`
- Create: `frontend-customer/src/lib/blocks/cx-defs.ts`
- Modify: `frontend-customer/src/components/blocks/block-renderer.tsx`, `page-renderer.tsx`, `page-view.tsx`
- Modify: `frontend-customer/src/components/owner/canvas/edit-mode-canvas.tsx`, `sortable-block-shell.tsx`
- Modify: `frontend-customer/src/components/owner/block-form.tsx`
- Modify: `frontend-customer/src/components/cx/cx-block.tsx` (drop the local `styleId` type)
- Test: `frontend-customer/src/lib/__tests__/cx-defs.test.ts`

**Interfaces:**
- Produces: `BlockGroup` gains `"custom"`; `BlockComponentProps.styleId?: string`; `export function toField` (section-defs); `CX_BLOCK_DEF`, `cxSpecOf(block)`, `cxFields(block): FieldSchema[]`, `cxDynamicKey(block)` (cx-defs); `dynamicKeyOf(block): DynamicDataKey | undefined` (registry); `BlockRenderer`, `PageRenderer` and `EditModeCanvas` accept `styleId?: string`.

- [ ] **Step 1: Run GitNexus impact on `BlockRenderer`**

Call `impact({target: "BlockRenderer", direction: "upstream"})`. Expected callers: `PageRenderer`, `EditModeCanvas`, `SortableBlockShell`. Stop if the risk is HIGH or CRITICAL.

- [ ] **Step 2: Write the failing test**

`frontend-customer/src/lib/__tests__/cx-defs.test.ts`:

```ts
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/nav-link", async () => {
  const { createElement: h } = await vi.importActual<typeof import("react")>("react");
  return {
    NavLink: ({ href, className, children }: { href: string; className?: string; children?: ReactNode }) =>
      h("a", { href, className }, children),
  };
});

import { ITINERARY_SPEC, itineraryBlock } from "@/components/cx/__tests__/fixtures";
import { cxFields } from "@/lib/blocks/cx-defs";
import { dynamicKeyOf, getBlockDef } from "@/lib/blocks/registry";
import { pageWrapperClass } from "@/lib/blocks/section-defs";

describe("cx block wiring", () => {
  it("is a registered block type that the palette never offers", () => {
    expect(getBlockDef("cx")?.label).toBe("Custom section");
    expect(getBlockDef("cx")?.group).toBe("custom");
  });

  it("asks for the dataset its spec names", () => {
    const spec = { ...ITINERARY_SPEC, dynamic: "plans" as const };
    expect(dynamicKeyOf({ id: "b", type: "cx", cx: { ref: null, spec } })).toBe("plans");
    expect(dynamicKeyOf(itineraryBlock())).toBeUndefined();
    expect(dynamicKeyOf({ id: "b", type: "section.pricing" })).toBe("plans");
  });

  it("builds its form from the block's own spec", () => {
    const fields = cxFields(itineraryBlock());
    expect(fields.map((f) => f.key)).toEqual(["kicker", "heading", "intro", "days"]);
    expect(fields[3].type).toBe("repeater");
    expect(fields[3].itemFields?.map((f) => f.key)).toEqual(["when", "title", "text", "image"]);
    expect(cxFields({ id: "b", type: "cx" })).toEqual([]);
  });

  it("makes a page full-bleed like styled sections", () => {
    expect(pageWrapperClass([{ type: "cx" }])).toBe("page-fullbleed");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `docker compose exec nextjs-customer npx vitest run src/lib/__tests__/cx-defs.test.ts`
Expected: FAIL. `@/lib/blocks/cx-defs` cannot be resolved.

- [ ] **Step 4: Types and section-defs**

In `frontend-customer/src/lib/blocks/types.ts`:
- Change `export type BlockGroup = "content" | "dynamic" | "section";` to `export type BlockGroup = "content" | "dynamic" | "section" | "custom";`
- In `BlockComponentProps`, after `editable?: EditableContext;` add:

```ts
  /** The site style id (TenantConfig.style). AI-built sections (cx) render
   *  with that style's kit; other blocks ignore it. */
  styleId?: string;
```

In `frontend-customer/src/lib/blocks/section-defs.ts`:
- Change `function toField(` to `export function toField(`.
- Add `import { CX_BLOCK_TYPE } from "@shared/cx/types";` to the imports.
- In `pageWrapperClass`, change the condition to `blocks.some((b) => isSectionType(b.type) || b.type === CX_BLOCK_TYPE)` and update its doc comment's first line to: `/** Wrapper class for a rendered page: styled-section and AI-section pages are designed`.

- [ ] **Step 5: Create `cx-defs.ts`**

`frontend-customer/src/lib/blocks/cx-defs.ts`:

```ts
import { Wand2 } from "lucide-react";
import { CX_BLOCK_TYPE, type CxSpec } from "@shared/cx/types";
import { CxBlock } from "@/components/cx/cx-block";
import type { Block } from "@/types/tenant";
import type { FieldSchema } from "./field-schema";
import { toField } from "./section-defs";
import type { BlockDefinition, DynamicDataKey } from "./types";

/** AI-built sections. Their form fields and dataset come from each block's
 *  own spec, so the static definition carries none. Never offered in the
 *  palette (a cx block needs a spec): added via "Describe a section". */
export const CX_BLOCK_DEF: BlockDefinition = {
  type: CX_BLOCK_TYPE,
  label: "Custom section",
  icon: Wand2,
  group: "custom",
  component: CxBlock,
  defaultData: {},
  fields: [],
};

export function cxSpecOf(block: Block): CxSpec | undefined {
  const spec = (block.cx as { spec?: CxSpec } | undefined)?.spec;
  return spec && typeof spec === "object" && spec.tree ? spec : undefined;
}

export function cxFields(block: Block): FieldSchema[] {
  const spec = cxSpecOf(block);
  return spec ? Object.entries(spec.fields).map(([key, field]) => toField(key, field)) : [];
}

export function cxDynamicKey(block: Block): DynamicDataKey | undefined {
  if (block.type !== CX_BLOCK_TYPE) return undefined;
  const source = cxSpecOf(block)?.dynamic;
  return source === "courses" || source === "plans" || source === "events" ? source : undefined;
}
```

- [ ] **Step 6: Register it and resolve datasets per block**

In `frontend-customer/src/lib/blocks/registry.tsx`:
- Add the imports `import { CX_BLOCK_TYPE } from "@shared/cx/types";` and `import { CX_BLOCK_DEF, cxDynamicKey } from "./cx-defs";`.
- In `BLOCK_REGISTRY`, after `...SECTION_BLOCK_DEFS,` add `[CX_BLOCK_TYPE]: CX_BLOCK_DEF,`.
- In `BLOCKS_BY_GROUP`, add `custom: Object.values(BLOCK_REGISTRY).filter((b) => b.group === "custom"),`.
- Replace `dynamicKeysForBlocks` with:

```ts
/** The dataset a block renders: its type's, or for an AI-built section the
 *  one its spec names. */
export function dynamicKeyOf(block: Block): DynamicDataKey | undefined {
  return getBlockDef(block.type)?.dynamicDataKey ?? cxDynamicKey(block);
}

/** Dynamic datasets referenced by the enabled blocks on a page. */
export function dynamicKeysForBlocks(blocks: Block[]): Set<DynamicDataKey> {
  const keys = new Set<DynamicDataKey>();
  for (const block of blocks) {
    if (block.enabled === false) continue;
    const key = dynamicKeyOf(block);
    if (key) keys.add(key);
  }
  return keys;
}
```

- Make `getBlockDef` safe for inherited keys (a block type of `"constructor"` must not resolve):

```ts
export function getBlockDef(type: string): BlockDefinition | undefined {
  return Object.prototype.hasOwnProperty.call(BLOCK_REGISTRY, type) ? BLOCK_REGISTRY[type] : undefined;
}
```

- [ ] **Step 7: Pass the style id down**

`frontend-customer/src/components/blocks/block-renderer.tsx`: change the import to `import { dynamicKeyOf, getBlockDef } from "@/lib/blocks/registry";`, add `styleId` to the props (`styleId?: string;` in the type, `styleId,` in the destructuring), and replace the slice and element lines with:

```tsx
  const key = dynamicKeyOf(block);
  const slice = key ? dynamicData?.[key] : undefined;
  const el = <Comp data={block} dynamicData={slice} editable={editable} styleId={styleId} />;
```

`frontend-customer/src/components/blocks/page-renderer.tsx`: add `styleId?: string;` (doc: `/** Site style id, for AI-built sections. */`) to `PageRendererProps`, destructure it, and pass `styleId={styleId}` to `<BlockRenderer>`.

`frontend-customer/src/components/blocks/page-view.tsx`:
- Add `import { fetchTenantConfig, getTenantSlug } from "@/lib/tenant";`.
- Replace `const user = await getAuthUser();` with:

```tsx
  const [user, config] = await Promise.all([getAuthUser(), getTenantSlug().then(fetchTenantConfig)]);
  // AI-built sections (cx) render with the site style's kit.
  const styleId = config?.style ?? "";
```

- Pass `styleId={styleId}` to both `<EditModeCanvas>` and `<PageRenderer>`.

`frontend-customer/src/components/owner/canvas/edit-mode-canvas.tsx`: add `styleId?: string;` to `EditModeCanvasProps`, destructure it, and pass `styleId={styleId}` to the read-only `<BlockRenderer>`.

`frontend-customer/src/components/owner/canvas/sortable-block-shell.tsx`: pass `styleId={store.siteStyle}` to its `<BlockRenderer>`. `store` is already `useEditorStore()` there.

`frontend-customer/src/components/cx/cx-block.tsx`: change the props type to `BlockComponentProps` (it now includes `styleId`).

- [ ] **Step 8: The form comes from the spec**

In `frontend-customer/src/components/owner/block-form.tsx`:
- Add the imports `import { CX_BLOCK_TYPE } from "@shared/cx/types";` and `import { cxFields } from "@/lib/blocks/cx-defs";`.
- After the `if (!def) {...}` early return, add `const fields = block.type === CX_BLOCK_TYPE ? cxFields(block) : def.fields;`, and iterate `fields.map(...)` instead of `def.fields.map(...)`.

- [ ] **Step 9: Run the tests and the typecheck**

Run: `docker compose exec nextjs-customer npx vitest run src/lib/__tests__/cx-defs.test.ts src/components/cx src/components/sections`
Expected: PASS.

Run: `docker compose exec nextjs-customer npm run typecheck`
Expected: exit 0.

- [ ] **Step 10: Commit**

```bash
git add frontend-customer/src/lib/blocks frontend-customer/src/lib/__tests__/cx-defs.test.ts \
  frontend-customer/src/components/blocks/block-renderer.tsx frontend-customer/src/components/blocks/page-renderer.tsx \
  frontend-customer/src/components/blocks/page-view.tsx frontend-customer/src/components/owner/canvas/edit-mode-canvas.tsx \
  frontend-customer/src/components/owner/canvas/sortable-block-shell.tsx frontend-customer/src/components/owner/block-form.tsx \
  frontend-customer/src/components/cx/cx-block.tsx
git commit -m "feat(cx): cx blocks render on public pages and the editor canvas

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Editor UI — describe, re-add, change with AI

**Files:**
- Create: `frontend-customer/src/lib/cx/api.ts`
- Create: `frontend-customer/src/components/owner/cx-composer.tsx`, `frontend-customer/src/components/owner/cx-refine.tsx`
- Modify: `frontend-customer/src/components/owner/blocks-tab.tsx`, `frontend-customer/src/components/owner/block-form.tsx`

**Interfaces:**
- Consumes: the three endpoints (Task 8); `useEditorStore` (`insertBlock`, `selectBlock`, `siteStyle`); `mintBlockId`; `cxSpecOf`.
- Produces: `composeSection(prompt, page)`, `refineSection(block, instruction)`, `listMySections()`, `failureMessage(source)`, `blockFromSaved(saved, id)`, `withoutId(block)`; `<CxComposer pageKey onInserted>`, `<CxRefine block onChange>`.

- [ ] **Step 1: API client**

`frontend-customer/src/lib/cx/api.ts`:

```ts
// Thin client for AI-built sections (backend/apps/tenant_config/cx/views.py).
import { clientFetch } from "@/lib/api-client";
import type { CxSpec } from "@shared/cx/types";
import type { Block } from "@/types/tenant";

export type CxSource = "ai" | "disabled" | "upgrade_required" | "quota_exhausted" | "error";

export interface CxResult {
  block: Block | null;
  source: CxSource;
  remaining: number;
  missing: string[];
}

export interface CxSaved {
  id: string;
  name: string;
  summary: string;
  ref: string;
  spec: CxSpec;
  content: Record<string, unknown>;
}

const MESSAGES: Record<Exclude<CxSource, "ai">, string> = {
  disabled: "AI design isn't available right now. Please try again later.",
  upgrade_required: "Custom sections come with the paid plans.",
  quota_exhausted: "You've used this month's AI changes. They renew next month.",
  error: "I couldn't build that. Try describing it a little differently.",
};

export const failureMessage = (source: CxSource) => (source === "ai" ? MESSAGES.error : MESSAGES[source]);

export const composeSection = (prompt: string, page: string) =>
  clientFetch<CxResult>("/api/v1/admin/cx/compose/", { method: "POST", body: JSON.stringify({ prompt, page }) });

export const refineSection = (block: Block, instruction: string) =>
  clientFetch<CxResult>("/api/v1/admin/cx/refine/", { method: "POST", body: JSON.stringify({ block, instruction }) });

export const listMySections = () => clientFetch<{ components: CxSaved[] }>("/api/v1/admin/cx/components/");

/** A fresh block from one of the coach's saved sections. */
export function blockFromSaved(saved: CxSaved, id: string): Block {
  return { ...structuredClone(saved.content), id, type: "cx", enabled: true, cx: { ref: saved.ref, spec: saved.spec } };
}

/** A block as an update patch (the editor keeps the existing id). */
export function withoutId(block: Block): Partial<Block> {
  return Object.fromEntries(Object.entries(block).filter(([key]) => key !== "id"));
}
```

- [ ] **Step 2: The composer**

`frontend-customer/src/components/owner/cx-composer.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { mintBlockId } from "@/lib/blocks/registry";
import { type CxSaved, blockFromSaved, composeSection, failureMessage, listMySections } from "@/lib/cx/api";
import type { Block, PageKey } from "@/types/tenant";
import { useEditorStore } from "./canvas/editor-store";

/** "Describe a section": the AI builds a custom section in the site's style.
 *  The coach's earlier sections can be added again in one click. */
export function CxComposer({ pageKey, onInserted }: { pageKey: PageKey; onInserted: () => void }) {
  const store = useEditorStore();
  const [prompt, setPrompt] = useState("");
  const [saved, setSaved] = useState<CxSaved[]>([]);

  useEffect(() => {
    let alive = true;
    listMySections().then(
      (res) => {
        if (alive) setSaved(res.components);
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, []);

  const insert = (block: Block) => {
    store.insertBlock(pageKey, block);
    store.selectBlock(block.id, { reveal: true });
    onInserted();
  };

  const { run: create, loading } = useAsyncAction(async () => {
    const res = await composeSection(prompt.trim(), pageKey);
    if (!res.block) {
      toast.error(failureMessage(res.source));
      return;
    }
    insert({ ...res.block, id: mintBlockId() });
    setPrompt("");
    if (res.missing.length) {
      toast.info(`Not possible yet: ${res.missing.join(", ")}. I built the closest thing.`);
    }
  });

  return (
    <div className="space-y-2 rounded-md border border-dashed p-2.5">
      <label htmlFor="cx-prompt" className="text-xs font-medium">
        Describe a section
      </label>
      <Textarea
        id="cx-prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        maxLength={600}
        placeholder="A day-by-day plan of my 5-day retreat, with a photo for each day"
        className="text-xs"
      />
      <Button
        type="button"
        size="sm"
        className="w-full"
        loading={loading}
        loadingText="Designing…"
        disabled={prompt.trim().length < 8}
        onClick={() => create()}
      >
        Create with AI
      </Button>
      {saved.length > 0 && (
        <div className="space-y-1 pt-1">
          <p className="text-xs font-medium text-muted-foreground">Your sections</p>
          {saved.map((section) => (
            <button
              key={section.ref}
              type="button"
              title={section.summary}
              onClick={() => insert(blockFromSaved(section, mintBlockId()))}
              className="block w-full truncate rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors hover:border-primary hover:bg-primary/5"
            >
              {section.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Change with AI**

`frontend-customer/src/components/owner/cx-refine.tsx`:

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { failureMessage, refineSection, withoutId } from "@/lib/cx/api";
import type { Block } from "@/types/tenant";

/** "Change with AI" for an AI-built section: the coach says what to change in
 *  plain words; their photos and untouched words survive. */
export function CxRefine({ block, onChange }: { block: Block; onChange: (patch: Partial<Block>) => void }) {
  const [instruction, setInstruction] = useState("");
  const { run: apply, loading } = useAsyncAction(async () => {
    const res = await refineSection(block, instruction.trim());
    if (!res.block) {
      toast.error(failureMessage(res.source));
      return;
    }
    onChange(withoutId(res.block));
    setInstruction("");
  });
  const id = `cx-refine-${block.id}`;
  return (
    <div className="space-y-2 rounded-md border border-dashed p-2.5">
      <label htmlFor={id} className="text-xs font-medium">
        Change with AI
      </label>
      <Textarea
        id={id}
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        rows={2}
        maxLength={600}
        placeholder="Make it two columns and add a short intro"
        className="text-xs"
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-full"
        loading={loading}
        loadingText="Changing…"
        disabled={instruction.trim().length < 3}
        onClick={() => apply()}
      >
        Apply change
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Mount them**

`frontend-customer/src/components/owner/blocks-tab.tsx`:
- Add the imports `import { CX_BLOCK_TYPE } from "@shared/cx/types";`, `import { cxSpecOf } from "@/lib/blocks/cx-defs";` and `import { CxComposer } from "./cx-composer";`.
- In the "Add a block" panel, between the header row (`Add a block` / `Cancel`) and the group list, add:

```tsx
          {store.siteStyle && <CxComposer pageKey={pageKey} onInserted={() => setAdding(false)} />}
```

- In the block row label, replace `{def?.label ?? block.type}` with:

```tsx
                  {(block.type === CX_BLOCK_TYPE && cxSpecOf(block)?.name) || def?.label || block.type}
```

`frontend-customer/src/components/owner/block-form.tsx`: add `import { CxRefine } from "./cx-refine";` and render it first inside the returned `<div className="space-y-3">`:

```tsx
      {block.type === CX_BLOCK_TYPE && <CxRefine block={block} onChange={onChange} />}
```

- [ ] **Step 5: Typecheck, lint and loading-pattern check**

Run: `docker compose exec nextjs-customer npm run typecheck && node scripts/check-loading-patterns.mjs && pre-commit run --files frontend-customer/src/lib/cx/api.ts frontend-customer/src/components/owner/cx-composer.tsx frontend-customer/src/components/owner/cx-refine.tsx frontend-customer/src/components/owner/blocks-tab.tsx frontend-customer/src/components/owner/block-form.tsx`
Expected: all exit 0. (Behaviour is verified end to end in Task 12.)

- [ ] **Step 6: Commit**

```bash
git add frontend-customer/src/lib/cx frontend-customer/src/components/owner/cx-composer.tsx \
  frontend-customer/src/components/owner/cx-refine.tsx frontend-customer/src/components/owner/blocks-tab.tsx \
  frontend-customer/src/components/owner/block-form.tsx
git commit -m "feat(cx): describe a section, re-add your sections, change with AI

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: End-to-end

**Files:**
- Create: `e2e/specs/30-custom-components.spec.ts`
- Modify: `e2e/impact-map.json`

**Interfaces:**
- Consumes: `coachContext`, `TENANT` from `e2e/helpers/auth.ts`; the compose response shape; the backend validator (it runs for real on the autosave PATCH).

- [ ] **Step 1: Write the spec**

`e2e/specs/30-custom-components.spec.ts`:

```ts
// e2e/specs/30-custom-components.spec.ts
//
// A coach describes a section; the (stubbed) AI returns a cx block; it lands
// on the canvas, survives the real autosave validation, and a visitor sees it
// on the public page. The compose call is intercepted in the browser so the
// run never calls a model. demo-yoga is unstyled, so the spec sets a style
// first (config PATCH only — pages are not restyled) and restores it.

import { test, expect } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";

const HEADING = `E2E custom section ${Date.now()}`;

const SPEC = {
  csl: 1,
  name: "E2E points",
  summary: "Two points",
  fields: {
    heading: { type: "text", label: "Heading", required: true, max: 80 },
    points: {
      type: "items",
      label: "Points",
      fields: {
        title: { type: "text", label: "Title", required: true, max: 60 },
        text: { type: "text", label: "Text", max: 160 },
      },
      max: 6,
      min: 0,
      itemLabel: "Point",
    },
  },
  dynamic: null,
  tree: {
    t: "Section",
    tone: "base",
    width: "wrap",
    children: [
      { t: "Opener" },
      {
        t: "Grid",
        each: "points",
        cols: 3,
        gap: "md",
        card: "soft",
        numbering: "pad2",
        item: [
          { t: "Heading", bind: "$.title", level: 3, size: "md" },
          { t: "Text", bind: "$.text", size: "md", muted: true, measure: "normal" },
        ],
      },
    ],
  },
};

const BLOCK = {
  id: "blk_e2ecx001",
  type: "cx",
  enabled: true,
  cx: { ref: null, spec: SPEC },
  heading: HEADING,
  points: [
    { title: "First point", text: "One." },
    { title: "Second point", text: "Two." },
  ],
};

test("coach creates a custom section with AI; the public page renders it", async ({ browser }) => {
  const coach = await coachContext(browser);
  const edit = await coach.newPage();
  const api = edit.request;
  const before = await (await api.get(`${TENANT}/api/admin/config`)).json();
  expect((await api.patch(`${TENANT}/api/admin/config`, { data: { style: "maison" } })).ok()).toBeTruthy();

  try {
    await edit.route("**/api/v1/admin/cx/components/", (route) => route.fulfill({ json: { components: [] } }));
    await edit.route("**/api/v1/admin/cx/compose/", (route) =>
      route.fulfill({ json: { block: BLOCK, source: "ai", remaining: 4, missing: [] } }),
    );

    await edit.goto(`${TENANT}/`);
    await edit.getByTitle("Edit your site").click();
    await edit.getByRole("button", { name: /^Pages$/ }).first().click();
    await edit.getByRole("button", { name: "Add block" }).click();
    await edit.getByLabel("Describe a section").fill("Two points about my method");

    const autosave = edit.waitForResponse(
      (r) => r.url().includes("/api/admin/config") && r.request().method() === "PATCH" && r.status() === 200,
      { timeout: 20_000 },
    );
    await edit.getByRole("button", { name: "Create with AI" }).click();
    await expect(edit.getByText(HEADING).first()).toBeVisible();
    await autosave;

    const after = await (await api.get(`${TENANT}/api/admin/config`)).json();
    const stored = after.pages.home.blocks.find((b: { type: string }) => b.type === "cx");
    expect(stored?.heading).toBe(HEADING);
    expect(stored?.cx?.spec?.tree?.t).toBe("Section");

    const visitor = await browser.newPage();
    await visitor.goto(`${TENANT}/`);
    await expect(visitor.getByText(HEADING)).toBeVisible();
    await expect(visitor.getByText("Second point")).toBeVisible();
    await visitor.close();
  } finally {
    await api.patch(`${TENANT}/api/admin/config`, { data: { style: before.style ?? "", pages: before.pages } });
    await coach.close();
  }
});
```

- [ ] **Step 2: Map it**

Edit `e2e/impact-map.json` by hand, keeping its formatting:
- `backend.tenant_config`: append `"30-custom-components"`.
- `frontend-customer`: append `"30-custom-components"` to `"src/components/blocks"`, `"src/lib/blocks"` and `"src/components/sections"`; add the keys `"src/components/cx": ["30-custom-components"]`, `"src/lib/cx": ["30-custom-components"]`, `"src/components/owner/cx-composer.tsx": ["30-custom-components"]` and `"src/components/owner/cx-refine.tsx": ["30-custom-components"]`.

Run: `python3 scripts/select_tests.py --self-test`
Expected: exit 0.

- [ ] **Step 3: Run it** (no other heavy job running)

Run: `make e2e-spec SPEC=30-custom-components`
Expected: 1 passed. If the autosave PATCH returns 400 or the stored block is missing, the canned spec failed real validation. Compare it against `validate_spec` in a shell before touching the spec.

Run: `make e2e-spec SPEC=09-builder`
Expected: passed (builder regression).

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/30-custom-components.spec.ts e2e/impact-map.json
git commit -m "test(cx): e2e — describe a section, autosave, public render

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Whole-branch verification and a live smoke

**Files:** none (verification only)

- [ ] **Step 1: Make sure nothing heavy is running**

Run: `ps aux | grep -E "pytest|vitest|playwright|next build" | grep -v grep; docker compose ps`
Expected: none of those processes. The stack is healthy.

- [ ] **Step 2: Lint, sync check, typecheck**

Run: `make lint`
Expected: exit 0. That includes pre-commit on all files, `sync_sections.py --check`, loading patterns, the selector self-test, and both typechecks.

- [ ] **Step 3: Full backend suite (once per branch)**

Run: `make test-fresh`
Expected: all green (fresh test DB because of the new core migration).

- [ ] **Step 4: Frontend unit tests**

Run: `make test-frontend`
Expected: all green. If the host run can't resolve a `packages/shared` import, rerun inside the container (`docker compose exec nextjs-customer npx vitest run`) and record that.

- [ ] **Step 5: Live smoke with the real AI provider (dev)**

This calls the configured model (`AI_PROVIDER`, normally the free `agentc`). It writes `CxComponent` rows for `site_eval`; quota is bypassed in this shell only.

```bash
docker compose exec -T django python manage.py shell -c "
from django_tenants.utils import tenant_context
from apps.core.models import Tenant
from apps.core.onboarding import site_ai
from apps.tenant_config.cx import compose
from apps.tenant_config.cx.validate import validate_spec
site_ai.availability = lambda tenant, month=None: {'enabled': True, 'remaining': 99, 'limit': 99, 'reason': None}
t = Tenant.objects.get(schema_name='site_eval')
for ask in ['A day-by-day plan of my 5-day yoga retreat with a photo for each day',
            'My weekly class timetable: day, time, class name and level',
            'Three things you will feel after your first month, as numbered steps']:
    with tenant_context(t):
        res = compose.compose(t, ask, 'about')
    spec = (res['block'] or {}).get('cx', {}).get('spec')
    print(res['source'], res['missing'], spec and spec['tree']['t'], spec and validate_spec(spec)[1])
"
```

Expected: each line reads `ai [...] Section []` (or `Sequence`/`Layout`), meaning the spec re-validates with no errors. Paste the output into the hand-off message. If any line is `error`, read `docker compose logs django | grep "cx compose failed"` before claiming done.

- [ ] **Step 6: Visual check**

On a styled tenant where you're the coach (e.g. `site-eval`), open the editor, go to Pages, then Add block, then "Describe a section". Create one section and screenshot it in two contrasting styles (switch the look in the Site tab, e.g. `maison` and `terminal`). Confirm each looks like the style, the autosave succeeds, and "Change with AI" updates it. Report the screenshots.

Then open the same page logged out. In DevTools → Network (JS filter), confirm the cx section adds no JS chunk the page didn't already load for styled sections: `components/cx` has no `"use client"`, so for visitors it's server HTML only (spec §10 performance check).

---

## Before coaches see it (owner, not code)

- **Eval wall:** the owner reviews about 20 real coach prompts × 4 contrasting styles to tune the prompt and exemplars (spec §9).
- Decide the component quota (P1 rides on `max_site_ai_updates`), and whether the free tier gets a taster.

## Deferred to P2 (with the shared library)

Sharing gates and sweep, the `cx-check` render route, moderation in adminkit, `CxGap` storage, registry-first compose, the variant target (`section.<family>` with `variant: "cx"`), `styleAffinity` and named ornaments, and sharing fields on `CxComponent`. Also purging private `CxComponent` rows when a tenant is deleted; there is no tenant-deletion hook for public rows today.
