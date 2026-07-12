# Logo Studio Curated-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the deterministic idea "wall" from the Logo Studio, make the Ideas step a curated-first "complete logo" (mark + name + tagline, filtered to the brief), vectorize curated art into lightweight editable marks, and make AI refine reuse the coach's existing icon instead of overwriting it.

**Architecture:** The studio is a Brief → Ideas → Editor flow in `frontend-customer`. Ideas becomes curated-only (the `CuratedGallery`), ranked by brief tags. Curated PNGs are vectorized server-side via the existing `trace_mark` tracer and stored on `CuratedLogo.mark_paths`; the studio builds an editable custom-mark recipe from them (PNG fallback when a logo doesn't trace). Refine gains a "keep the mark" path plus a "Redraw the icon" toggle.

**Tech Stack:** Next.js 14 + React + TypeScript (vitest), Django 5.1 + DRF (pytest), Playwright e2e, `vtracer` + Pillow (Python raster→vector).

## Global Constraints

- **Commits:** This repo forbids committing unless the user explicitly asks (CLAUDE.md). Treat every `git commit` step as "stage the change and pause for the user's go-ahead." Never push.
- **Pre-commit / quality:** `npm run lint` and `npm run build` (in `frontend-customer/`) and `make lint` must pass with zero errors/warnings before a task is done.
- **Migrations:** After Task 5 adds a migration, run `make test-fresh` (rebuilds the test DB) — a plain `make test` reuses a stale DB and will error. (repo memory: contentor-fast-backend-tests)
- **Curated trace caps:** Traced curated marks MUST stay within the recipe's custom-mark caps (`trace_mark` already enforces ≤12 paths / ≤12k chars = `validate_logo_recipe` limits). Do NOT loosen `validate_logo_recipe`.
- **Multi-tenancy:** `CuratedLogo` is a SHARED_APPS (public schema) model — all ORM access goes through `schema_context("public")` (already the case in the code you touch).
- **e2e timing:** The e2e spec `15-logo-studio.spec.ts` is rewritten only in the final task (Task 7). It references the wall until then — do NOT run `make e2e` between Tasks 1–6.
- **Shared working tree:** `main` can move under concurrent agents — verify branch/base before any commit. (repo memory: contentor-shared-working-tree-concurrent-agents)
- **Test dirs:** frontend commands run from `frontend-customer/`; backend commands from the repo root (they exec into the `django` container).

---

### Task 1: Remove the wall from the UI layer

Removes the wall from the two studio components and deletes `studio-wall.tsx`. The composer wall/pack functions still *exist* after this task (pruned in Task 2) — they are simply no longer imported, so the build stays green.

**Files:**
- Modify: `frontend-customer/src/components/logo/studio-entrance.tsx`
- Modify: `frontend-customer/src/components/logo/logo-studio.tsx`
- Delete: `frontend-customer/src/components/logo/studio-wall.tsx`
- Modify: `frontend-customer/src/lib/logo/studio-session.ts`
- Modify: `frontend-customer/src/lib/logo/__tests__/studio-session.test.ts`

**Interfaces:**
- Produces: `StudioEntrance` with props `{ logos, loadingLibrary, logoAiStatus, onUseCurated, onCreateFromCurated, onOpenChat, onUpgrade }` (all wall props removed).
- Produces: `ideasReady: boolean` state in `LogoStudio`, gating the "2 · Ideas" nav button.
- Produces: `StudioSession` without `pack`/`packSeed`/`wallSeed`; `SCHEMA_VERSION = 3`.

> The session prune is folded in here (not Task 2) because `LogoStudio` stops passing `wallSeed`/`pack`/`packSeed` to `saveStudioSession` in this task — the type and its caller must change together or the build breaks.

- [ ] **Step 1: Reduce `studio-entrance.tsx` to doors + gallery**

Replace the entire file with:

```tsx
"use client";

import { Sparkles, Wand2 } from "lucide-react";
import type { CuratedLogo } from "@/lib/logo/library-catalog";
import type { LogoAiStatus } from "@/lib/logo/converse-api";
import { CuratedGallery } from "./curated-gallery";

interface StudioEntranceProps {
  logos: CuratedLogo[];
  loadingLibrary: boolean;
  logoAiStatus: LogoAiStatus | null;
  onUseCurated: (logo: CuratedLogo) => void;
  onCreateFromCurated: (logo: CuratedLogo) => void;
  onOpenChat: () => void;
  onUpgrade: () => void;
}

export function StudioEntrance({
  logos,
  loadingLibrary,
  logoAiStatus,
  onUseCurated,
  onCreateFromCurated,
  onOpenChat,
  onUpgrade,
}: StudioEntranceProps) {
  const aiEligible = logoAiStatus?.eligible ?? false;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="grid grid-cols-1 gap-4 p-6 pb-0 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" /> Ready-made logos
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Hand-picked for your niche. Free to use, add your name and colors.
          </p>
        </div>
        <button
          type="button"
          onClick={() => (aiEligible ? onOpenChat() : onUpgrade())}
          className="flex flex-col items-start rounded-xl border bg-card p-5 text-left transition-colors hover:border-primary"
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Wand2 className="h-4 w-4 text-primary" /> Design with AI
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {aiEligible
              ? "Describe your vibe and let AI craft a bespoke logo."
              : "Upgrade to design a bespoke logo with AI."}
          </p>
        </button>
      </div>

      <CuratedGallery
        logos={logos}
        loading={loadingLibrary}
        aiEligible={aiEligible}
        onUse={onUseCurated}
        onCreateSimilar={onCreateFromCurated}
        onUpgrade={onUpgrade}
      />
    </div>
  );
}
```

- [ ] **Step 2: Delete `studio-wall.tsx`**

Run: `git rm frontend-customer/src/components/logo/studio-wall.tsx`

- [ ] **Step 3: Strip wall state + functions from `logo-studio.tsx`**

In `frontend-customer/src/components/logo/logo-studio.tsx`:

1. Remove the composer wall imports. Change the import block (lines ~11-19) from `applyRefinedDesign, composePackWall, composeWall, moreLikeThis, type Brief, type BrandPack, type BrandPackElement` to keep only what remains used:

```tsx
import {
  applyRefinedDesign,
  type Brief,
  type BrandPackElement,
} from "@/lib/logo/composer";
```

2. Delete the wall/pack state declarations (lines ~100-103 and ~115-116):

```tsx
// DELETE these:
const [wall, setWall] = useState<LogoRecipe[] | null>(null);
const [wallSeed, setWallSeed] = useState(1);
const [wallDark, setWallDark] = useState(false);
const [showingVariants, setShowingVariants] = useState(false);
const [pack, setPack] = useState<BrandPack | null>(null);
const [packSeed, setPackSeed] = useState<number | null>(null);
```

3. Add `ideasReady` state where the wall state used to be:

```tsx
const [ideasReady, setIdeasReady] = useState(false);
```

4. In the session-restore effect (the `if (saved) { ... }` branch, ~lines 167-193), remove the wall/pack reconstruction. Replace that branch body with:

```tsx
if (saved) {
  setBrief(saved.brief);
  const restoredRecipe = saved.recipe ?? seedRecipe(config, theme.primaryHex);
  setRecipe(restoredRecipe);
  setEditHistory(reset(restoredRecipe));
  setActiveElements(saved.elements);
  chatDispatch({ type: "hydrate", snapshot: saved.chat });
  setChatOpen(false);
  setStep(saved.step);
  setIdeasReady(true);
  return;
}
```

5. In the fresh-coach branch (~lines 194-201), add `setIdeasReady(false);` before `setStep(...)`.

6. Replace `regenerateWall`, `startIdeas`, `handleStartOver`, and `handleMoreLikeThis` (~lines 283-313) with:

```tsx
function startIdeas() {
  setIdeasReady(true);
  chatDispatch({ type: "hydrate", snapshot: null });
  setChatOpen(false);
  setStep("ideas");
}

function handleStartOver() {
  clearStudioSession();
  setBrief({ brandName: config.brand_name || "", niche: "", styleChips: [] });
  setIdeasReady(false);
  chatDispatch({ type: "hydrate", snapshot: null });
  setChatOpen(false);
}
```

7. In `saveStudioSession` (~lines 211-229), drop the `wallSeed`, `pack`, `packSeed` fields from the object passed in. The remaining object is:

```tsx
saveStudioSession({
  step,
  brief,
  recipe,
  elements: activeElements,
  chat:
    chatOpen || chat.messages.length
      ? {
          stage: chat.stage,
          messages: chat.messages,
          pinnedIcon: chat.pinnedIcon,
          pinnedLockup: chat.pinnedLockup,
        }
      : null,
});
```

8. In that effect's dependency array (~lines 234-245), remove `wallSeed`, `pack`, `packSeed`.

9. In the step-nav `.map` (~line 591), change the disabled prop:

```tsx
disabled={s.id === "ideas" && !ideasReady}
```

10. In the Ideas render block (~lines 638-683), remove the `wall &&` guard and the wall props. It becomes:

```tsx
{step === "ideas" &&
  (chatOpen ? (
    <StudioChat
      open={chatOpen}
      state={chat}
      dispatch={chatDispatch}
      brief={brief}
      brandName={brief.brandName || config.brand_name}
      status={logoAiStatus}
      seedPrompt={chatSeed ?? undefined}
      onUseDesign={(chosen, elements) => {
        handleCustomize(chosen, elements);
        setChatOpen(false);
      }}
      onStatusChange={(turns) =>
        setLogoAiStatus((s) => (s ? { ...s, turns_remaining: turns } : s))
      }
      onClose={() => {
        setChatOpen(false);
        setChatSeed(null);
      }}
    />
  ) : (
    <StudioEntrance
      logos={library}
      loadingLibrary={loadingLibrary}
      logoAiStatus={logoAiStatus}
      onUseCurated={handleUseCurated}
      onCreateFromCurated={handleCreateFromCurated}
      onOpenChat={() => setChatOpen(true)}
      onUpgrade={handleUpgrade}
    />
  ))}
```

- [ ] **Step 4: Prune `studio-session.ts`**

In `frontend-customer/src/lib/logo/studio-session.ts`:

1. Imports: remove `BrandPack` (keep `BrandPackElement`, `ConverseDesign`, `Brief`).
2. Bump `const SCHEMA_VERSION = 3;`.
3. In the `StudioSession` interface, delete the `wallSeed`, `pack`, and `packSeed` fields.
4. In `loadStudioSession`, accept v1/v2/v3 and drop the `wallSeed` requirement:

```ts
if (parsed.v !== 1 && parsed.v !== 2 && parsed.v !== 3) return null;
if (
  typeof parsed.savedAt !== "number" ||
  Date.now() - parsed.savedAt > MAX_AGE_MS
) {
  return null;
}
if (!isStudioStep(parsed.step)) return null;
if (!parsed.brief) return null;
return {
  v: parsed.v,
  savedAt: parsed.savedAt,
  step: parsed.step,
  brief: parsed.brief,
  recipe: parsed.recipe ?? null,
  elements: parsed.elements ?? null,
  chat: parsed.v >= 2 ? (parsed.chat ?? null) : null,
};
```

- [ ] **Step 5: Update `studio-session.test.ts`**

Remove `wallSeed`, `pack`, `packSeed` from `baseSession()` and every inline `saveStudioSession({...})` / `localStorage.setItem` payload; delete the `expect(loaded?.wallSeed).toBe(42)` assertion in "round-trips a saved session". `baseSession()` becomes:

```ts
function baseSession() {
  return {
    step: "editor" as const,
    brief: BRIEF,
    recipe: RECIPE,
    elements: null,
    chat: null,
  };
}
```

- [ ] **Step 6: Verify build + lint + unit tests**

Run: `cd frontend-customer && npm run lint && npm run build && npx vitest run src/lib/logo`
Expected: all PASS. (`composeWall`/`moreLikeThis`/`composePackWall` still exist in `composer.ts` and are still covered by `composer.test.ts`, so no "unused export" failures.)

- [ ] **Step 7: Commit** (stage + await go-ahead per Global Constraints)

```bash
git add frontend-customer/src/components/logo/studio-entrance.tsx frontend-customer/src/components/logo/logo-studio.tsx frontend-customer/src/lib/logo/studio-session.ts frontend-customer/src/lib/logo/__tests__/studio-session.test.ts
git rm frontend-customer/src/components/logo/studio-wall.tsx
git commit -m "refactor(logo-studio): remove the deterministic idea wall from the UI + session"
```

---

### Task 2: Prune the composer lib

Deletes the now-unreferenced wall/pack machinery from `composer.ts` (all its callers were removed in Task 1).

**Files:**
- Modify: `frontend-customer/src/lib/logo/composer.ts`
- Modify: `frontend-customer/src/lib/logo/__tests__/composer.test.ts`

**Interfaces:**
- Produces: `composer.ts` exports reduced to `StyleChip`, `STYLE_CHIPS`, `Brief`, the `BrandPack*` shared types still used by refine/converse, `composeIconPreview`, `composeConverseDesign`, `applyRefinedDesign`, and their `ConverseDesign`/`RefinedDesign` types.

- [ ] **Step 1: Update `composer.test.ts` first (red → green guardrail)**

Rewrite the imports (top of file) to:

```ts
import { describe, expect, it } from "vitest";
import { defaultRecipe } from "@/lib/logo/catalog";
import { LOGO_FONTS } from "@/lib/logo/catalog";
import {
  applyRefinedDesign,
  composeConverseDesign,
  composeIconPreview,
  type BrandPackColorRoles,
  type BrandPackPalette,
  type ConverseDesign,
  type RefinedDesign,
} from "@/lib/logo/composer";
import type { LogoRecipe } from "@/types/logo";
```

Delete these `describe` blocks entirely: `composeWall`, `moreLikeThis`, `composeFromPack`, `packElementsByIndex`, `composeDesigns`, `composePackWall`, `packElementsByIndex v3`. Delete the now-unused consts `BRIEF`, `PACK`, `DESIGN`, `PACK_V3`, `PALETTE_IDS`, `FONT_FAMILIES`, `LAYOUTS`, `markKey`, `assertStructurallyValid`.

The two kept `applyRefinedDesign` blocks reference `PACK_V3.palettes[0]` and `DESIGN.color_roles`. Add these local consts above them and swap the references:

```ts
const PALETTE: BrandPackPalette = {
  name: "Calm",
  primary: "#336699",
  secondary: "#88aacc",
  accent: "#ee7755",
  ink: "#112233",
};
const ROLES: BrandPackColorRoles = {
  badge: "ink",
  mark: "white",
  mark2: "secondary",
  mark_accent: "accent",
  text: "ink",
  tagline: "primary",
};
```

In the "applies badge, font, typography and color roles" and "snaps the tagline weight" tests, replace `palette: PACK_V3.palettes[0]!` with `palette: PALETTE` and `color_roles: DESIGN.color_roles` with `color_roles: ROLES`. Keep the `composeConverseDesign` and `composeIconPreview` blocks (their `iconDesign`/`lockupDesign` consts are self-contained — keep them).

- [ ] **Step 2: Run the test — it fails to import deleted symbols? No — it must pass against current composer**

Run: `cd frontend-customer && npx vitest run src/lib/logo/__tests__/composer.test.ts`
Expected: PASS (the kept blocks still work against the current composer, which still exports everything).

- [ ] **Step 3: Delete the wall/pack symbols from `composer.ts`**

Delete these top-level declarations (functions, consts, types) from `composer.ts`:
`NICHE_ICONS`, `DEFAULT_ICONS`, `NICHE_FAMILIES`, `BadgeChoice`, `TypoPreset`, `ChipProfile`, `b`, `CHIP_PROFILES`, `DEFAULT_PROFILE`, `dedupe`, `mergeProfiles`, `nicheLookup`, `pickFrom`, `pickLayout`, `pickMark`, `markKey`, `buildRecipe`, `composeWall`, `moreLikeThis`, `BrandPackDesign`, `BrandPack`, `PACK_LAYOUTS`, `PACK_BADGES`, `composeFromPack`, `composeDesigns`, `composePackWall`, `packElementsByIndex`.

Keep: `StyleChip`, `STYLE_CHIPS`, `Brief`, `BrandPackPath`, `BrandPackElement`, `BrandPackMark`, `BrandPackPalette`, `PaletteRole`, `BrandPackColorRoles`, `BrandPackTypography`, `resolveRole`, `clampTracking`, `taglineWeight`, `ConverseMarkRoles`, `MarkGradient`, `ConverseDesign`, `clampScale`, `markFillFor`, `toCustomPaths`, `composeIconPreview`, `composeConverseDesign`, `RefinedDesign`, `applyRefinedDesign`.

Then fix the import block at the top — TypeScript/eslint will flag the now-unused imports. Remove them; the expected survivors are:

```ts
import {
  LOGO_FONTS,
  LOGO_FONT_FAMILIES,
  defaultRecipe,
  fontEntry,
  type FontEntry,
  type FontVibe,
} from "@/lib/logo/catalog";
import type {
  BadgeShape,
  CustomMarkPath,
  FontWeight,
  LogoRecipe,
  MarkFill,
  RecipeLayout,
  TextCase,
} from "@/types/logo";
```

(The `@/lib/logo/abstract` import — `ABSTRACT_FAMILIES`, `mulberry32` — is fully removed.)

- [ ] **Step 4: Run the full logo suite + lint + build**

Run: `cd frontend-customer && npx vitest run src/lib/logo && npm run lint && npm run build`
Expected: PASS / no unused symbols / clean build.

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/lib/logo/composer.ts frontend-customer/src/lib/logo/__tests__/composer.test.ts
git commit -m "refactor(logo-studio): delete dead wall/pack composer code"
```

---

### Task 3: Rank curated Ideas by the brief

Upgrades curated ranking from niche-only to brief-aware (niche tokens + style chips).

**Files:**
- Modify: `frontend-customer/src/lib/logo/library-catalog.ts`
- Modify: `frontend-customer/src/lib/logo/__tests__/library-catalog.test.ts`
- Modify: `frontend-customer/src/components/logo/logo-studio.tsx`

**Interfaces:**
- Produces: `rankForBrief(logos: CuratedLogo[], opts: { niche?: string; styleChips?: string[] }): CuratedLogo[]` (replaces `rankByNiche`).

- [ ] **Step 1: Write the failing test**

In `library-catalog.test.ts`, replace the `import` line and the "ranks tag-matching logos first for the niche" test:

```ts
import { fetchCuratedCatalog, rankForBrief } from "../library-catalog";
```

```ts
it("ranks by combined niche + style-chip tag overlap, stable within ties", () => {
  const logos = [
    { title: "Yoga", filename: "y.png", prompt: "", tags: ["yoga", "minimal"], imageUrl: "y" },
    { title: "Chef", filename: "c.png", prompt: "", tags: ["cooking"], imageUrl: "c" },
    { title: "Zen", filename: "z.png", prompt: "", tags: ["yoga"], imageUrl: "z" },
  ];
  const ranked = rankForBrief(logos, { niche: "yoga studio", styleChips: ["Minimal"] });
  // Yoga matches yoga + minimal (2); Zen matches yoga (1); Chef (0). Ties keep input order.
  expect(ranked.map((l) => l.title)).toEqual(["Yoga", "Zen", "Chef"]);
});

it("returns the list unchanged when the brief has no keywords", () => {
  const logos = [
    { title: "A", filename: "a.png", prompt: "", tags: ["x"], imageUrl: "a" },
    { title: "B", filename: "b.png", prompt: "", tags: ["y"], imageUrl: "b" },
  ];
  expect(rankForBrief(logos, {}).map((l) => l.title)).toEqual(["A", "B"]);
});
```

- [ ] **Step 2: Run it — fails (rankForBrief not defined)**

Run: `cd frontend-customer && npx vitest run src/lib/logo/__tests__/library-catalog.test.ts`
Expected: FAIL ("rankForBrief" is not exported).

- [ ] **Step 3: Implement `rankForBrief`, remove `rankByNiche`**

In `library-catalog.ts`, replace `rankByNiche` with:

```ts
export function rankForBrief(
  logos: CuratedLogo[],
  opts: { niche?: string; styleChips?: string[] },
): CuratedLogo[] {
  const keywords = new Set<string>();
  for (const token of (opts.niche ?? "").toLowerCase().split(/[^a-z0-9]+/)) {
    if (token) keywords.add(token);
  }
  for (const chip of opts.styleChips ?? []) keywords.add(chip.toLowerCase());
  if (keywords.size === 0) return logos;
  const score = (l: CuratedLogo) =>
    l.tags.reduce((n, t) => n + (keywords.has(t) ? 1 : 0), 0);
  return logos
    .map((l, i) => ({ l, i, s: score(l) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.l);
}
```

- [ ] **Step 4: Run it — passes**

Run: `cd frontend-customer && npx vitest run src/lib/logo/__tests__/library-catalog.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire it into `logo-studio.tsx`**

1. Change the import (~line 45) from `rankByNiche` to `rankForBrief`.
2. In the catalog-load effect (~lines 136-141), rank by the config niche on open:

```tsx
fetchCuratedCatalog()
  .then((all) => setLibrary(rankForBrief(all, { niche: config.niche ?? "" })))
  .catch(() => setLibrary([]))
  .finally(() => setLoadingLibrary(false));
```

3. In `startIdeas`, re-rank by the submitted brief:

```tsx
function startIdeas() {
  setIdeasReady(true);
  setLibrary((prev) =>
    rankForBrief(prev, { niche: brief.niche, styleChips: brief.styleChips }),
  );
  chatDispatch({ type: "hydrate", snapshot: null });
  setChatOpen(false);
  setStep("ideas");
}
```

- [ ] **Step 6: Build + lint**

Run: `cd frontend-customer && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend-customer/src/lib/logo/library-catalog.ts frontend-customer/src/lib/logo/__tests__/library-catalog.test.ts frontend-customer/src/components/logo/logo-studio.tsx
git commit -m "feat(logo-studio): rank curated ideas by brief niche + style chips"
```

---

### Task 4: Refine reuses the coach's icon

Adds a `keepMark` option to `applyRefinedDesign`, a "Redraw the icon" toggle in the refine box (default off = keep), and threads it through both refine passes.

**Files:**
- Modify: `frontend-customer/src/lib/logo/composer.ts`
- Modify: `frontend-customer/src/lib/logo/__tests__/composer.test.ts`
- Modify: `frontend-customer/src/components/logo/studio-panel.tsx`
- Modify: `frontend-customer/src/components/logo/studio-editor.tsx`
- Modify: `frontend-customer/src/components/logo/logo-studio.tsx`

**Interfaces:**
- Consumes: `applyRefinedDesign` (Task 2).
- Produces: `applyRefinedDesign(recipe, design, opts?: { keepMark?: boolean }): LogoRecipe`.
- Produces: `onRefine(instruction: string, redrawMark: boolean)` — the new refine callback signature through `StudioPanel` → `StudioEditor` → `LogoStudio`.

- [ ] **Step 1: Write the failing test**

Add to `composer.test.ts`:

```ts
describe("applyRefinedDesign keepMark", () => {
  it("preserves the current mark, its colors, and scale while restyling the lockup", () => {
    const base = defaultRecipe("Zeynep Yoga", "#1a56db");
    const withIcon: LogoRecipe = {
      ...base,
      mark: { type: "icon", icon: "flower-2", style: "outline" },
      colors: { ...base.colors, mark: "#0ea5e9" },
      elements: { ...base.elements, mark: { offset: [0, 0], scale: 1.3 } },
    };
    const design: RefinedDesign = {
      mark: { rationale: "unused", paths: [{ d: "M0 0 Z", fill: "mark" }] },
      palette: PALETTE,
      font_vibe: "Bold",
      layout: "stacked",
      badge_shape: "circle",
      badge_outline: false,
      font: "Poppins",
      typography: { case: "none", tracking: 0, weight: 700 },
      color_roles: {
        badge: "primary",
        mark: "ink",
        mark2: "secondary",
        mark_accent: "accent",
        text: "ink",
        tagline: "secondary",
      },
      rationale: "Restyle around the coach's icon.",
    };
    const next = applyRefinedDesign(withIcon, design, { keepMark: true });
    expect(next.mark).toEqual(withIcon.mark); // icon untouched
    expect(next.colors.mark).toBe("#0ea5e9"); // mark color untouched
    expect(next.elements.mark.scale).toBe(1.3); // mark scale untouched
    expect(next.layout).toBe("stacked"); // lockup restyled
    expect(next.typography.name.font).toBe("Poppins");
    expect(next.colors.text).toBe(PALETTE.ink);
  });
});
```

- [ ] **Step 2: Run it — fails (keepMark ignored, mark replaced)**

Run: `cd frontend-customer && npx vitest run src/lib/logo/__tests__/composer.test.ts -t keepMark`
Expected: FAIL (`next.mark` is a custom mark, not the icon).

- [ ] **Step 3: Add the `keepMark` option to `applyRefinedDesign`**

Change the signature and the mark/colors/elements assembly in `applyRefinedDesign`:

```ts
export function applyRefinedDesign(
  recipe: LogoRecipe,
  design: RefinedDesign,
  opts: { keepMark?: boolean } = {},
): LogoRecipe {
  const keepMark = opts.keepMark ?? false;
  // ... existing family / weight / paths / roles / noBadge / markRole / markHex ...
  return {
    ...recipe,
    layout: design.layout,
    mark: keepMark
      ? recipe.mark
      : { type: "custom", rationale: design.mark.rationale, paths },
    badge: { shape: design.badge_shape, outline: design.badge_outline },
    typography: {
      name: {
        font: entry.family,
        weight,
        tracking: clampTracking(design.typography.tracking),
        case: design.typography.case,
      },
      tagline: {
        ...recipe.typography.tagline,
        font: entry.family,
        weight: taglineWeight(entry),
      },
    },
    colors: {
      ...recipe.colors,
      palette_id: null,
      badge: { type: "solid", color: resolveRole(roles.badge, design.palette) },
      mark: keepMark
        ? recipe.colors.mark
        : markFillFor(design.mark_gradient, design.palette, markHex),
      mark2: keepMark
        ? recipe.colors.mark2
        : resolveRole(roles.mark2, design.palette),
      mark_accent: keepMark
        ? recipe.colors.mark_accent
        : resolveRole(roles.mark_accent, design.palette),
      text: resolveRole(roles.text, design.palette),
      tagline: resolveRole(roles.tagline, design.palette),
    },
    elements: {
      ...recipe.elements,
      mark: keepMark
        ? recipe.elements.mark
        : { ...recipe.elements.mark, scale: clampScale(design.mark_scale) },
    },
  };
}
```

- [ ] **Step 4: Run composer tests — all pass**

Run: `cd frontend-customer && npx vitest run src/lib/logo/__tests__/composer.test.ts`
Expected: PASS (existing default-behavior tests unchanged; new keepMark test green).

- [ ] **Step 5: Add the toggle to `studio-panel.tsx`**

1. Change the `onRefine` type in **both** `StudioPanelProps` **and** the inner `RefinePromptBox`'s own prop type (it declares its own `onRefine: (instruction: string) => void;`):

```tsx
onRefine: (instruction: string, redrawMark: boolean) => void;
```

2. In `RefinePromptBox`, add local state and the checkbox, and pass `redrawMark` out. Add near the top of the component: `const [redrawMark, setRedrawMark] = useState(false);` Then, inside the non-blocked branch, above the Refine button row, add:

```tsx
<label className="flex items-center gap-1.5 text-xs text-muted-foreground">
  <input
    type="checkbox"
    checked={redrawMark}
    onChange={(e) => setRedrawMark(e.target.checked)}
    disabled={refining}
  />
  Redraw the icon (start the mark from scratch)
</label>
```

3. Change the Refine button's onClick to forward the flag and reset it:

```tsx
onClick={() => {
  onRefine(instruction.trim(), redrawMark);
  setInstruction("");
  setRedrawMark(false);
}}
```

- [ ] **Step 6: Thread the signature through `studio-editor.tsx`**

In `StudioEditorProps`, change:

```tsx
onRefine: (instruction: string, redrawMark: boolean) => void;
```

(No body change — `StudioEditor` already passes `onRefine` straight to `StudioPanel`.)

- [ ] **Step 7: Update `handleRefine` in `logo-studio.tsx`**

Change the signature to `async function handleRefine(instruction: string, redrawMark: boolean)` and pass `{ keepMark: !redrawMark }` to BOTH `applyRefinedDesign` calls:

```tsx
// draft render pass (~line 348):
const draftRecipe = applyRefinedDesign(baseRecipe, design, {
  keepMark: !redrawMark,
});
// final apply (~line 357):
const applied = applyRefinedDesign(baseRecipe, design, {
  keepMark: !redrawMark,
});
```

- [ ] **Step 8: Build + lint + full logo suite**

Run: `cd frontend-customer && npm run lint && npm run build && npx vitest run src/lib/logo`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend-customer/src/lib/logo/composer.ts frontend-customer/src/lib/logo/__tests__/composer.test.ts frontend-customer/src/components/logo/studio-panel.tsx frontend-customer/src/components/logo/studio-editor.tsx frontend-customer/src/components/logo/logo-studio.tsx
git commit -m "feat(logo-studio): refine keeps the existing icon unless Redraw is toggled"
```

---

### Task 5: Vectorize curated logos (backend)

Adds `CuratedLogo.mark_paths`, traces the PNG on save via the existing `trace_mark`, and serves the paths from the public catalog endpoint.

**Files:**
- Modify: `backend/apps/core/models.py:554-576` (CuratedLogo)
- Create: `backend/apps/core/migrations/0027_curatedlogo_mark_paths.py` (via makemigrations)
- Create: `backend/apps/core/curated_logos/trace.py`
- Modify: `backend/apps/core/signals.py`
- Modify: `backend/apps/core/curated_logos/views.py`
- Modify: `backend/apps/core/tests/test_curated_logos.py`

**Interfaces:**
- Produces: `CuratedLogo.mark_paths` (nullable JSON list of `{d, fill}` dicts).
- Produces: `trace_curated_mark(png_bytes) -> list | None` in `apps.core.curated_logos.trace`.
- Produces: catalog API rows include `"mark_paths"` (list or null).

- [ ] **Step 1: Add the model field**

In `backend/apps/core/models.py`, add to `CuratedLogo` (after `image_key`):

```python
    mark_paths = models.JSONField(
        null=True,
        blank=True,
        help_text="Traced vector mark ({d, fill} dicts), or null when the PNG did not vectorize cleanly.",
    )
```

- [ ] **Step 2: Generate + apply the migration**

Run: `docker compose exec -T django python manage.py makemigrations core --name curatedlogo_mark_paths`
Expected: creates `backend/apps/core/migrations/0027_curatedlogo_mark_paths.py` adding one field.
Run: `make migrate`
Expected: applies cleanly.

- [ ] **Step 3: Create the trace helper**

Create `backend/apps/core/curated_logos/trace.py`:

```python
"""Best-effort vectorization of a curated logo PNG into Logo Studio mark path
dicts, reusing the same tracer the AI image-mark flow uses. Kept within the
recipe's custom-mark caps (trace_mark enforces them), so a saved coach recipe
still passes validate_logo_recipe. Never raises: returns None when the art
can't become a clean mark, and the studio falls back to the raster PNG."""

import logging

logger = logging.getLogger(__name__)


def trace_curated_mark(png_bytes):
    try:
        from apps.tenant_config.logo_trace import trace_mark

        return trace_mark(png_bytes)
    except Exception:
        logger.warning("curated logo trace failed", exc_info=True)
        return None
```

- [ ] **Step 4: Write the failing backend tests**

Add to `backend/apps/core/tests/test_curated_logos.py`. First add a module-level autouse fixture (curated save now fetches S3 to trace — keep every test off real S3 by default):

```python
@pytest.fixture(autouse=True)
def _no_curated_s3(monkeypatch):
    def _fail():
        raise RuntimeError("no s3 in tests")

    monkeypatch.setattr("apps.core.signals.get_s3_client", _fail)
```

Then add the trace-on-save test class:

```python
class TestCuratedTraceOnSave:
    def _real_png(self):
        from PIL import Image

        img = Image.new("RGB", (80, 80), "white")
        for x in range(24, 56):
            for y in range(24, 56):
                img.putpixel((x, y), (0, 0, 0))
        buf = io.BytesIO()
        img.save(buf, "PNG")
        return buf.getvalue()

    def _fake_s3(self, monkeypatch, body):
        class FakeS3:
            def get_object(self, Bucket, Key):  # noqa: N803
                return {"Body": io.BytesIO(body)}

        monkeypatch.setattr("apps.core.signals.get_s3_client", lambda: FakeS3())

    def test_populates_mark_paths_from_traceable_png(self, restore_public, monkeypatch, settings):
        settings.CURATED_LOGO_SYNC_DIR = ""
        self._fake_s3(monkeypatch, self._real_png())
        row = CuratedLogo.objects.create(title="Sq", image_key="platform/curated-logos/sq.png")
        row.refresh_from_db()
        assert row.mark_paths and isinstance(row.mark_paths, list)
        assert all("d" in p for p in row.mark_paths)

    def test_null_mark_paths_for_unreadable_png(self, restore_public, monkeypatch, settings):
        settings.CURATED_LOGO_SYNC_DIR = ""
        self._fake_s3(monkeypatch, b"not a png")
        row = CuratedLogo.objects.create(title="Bad", image_key="platform/curated-logos/bad.png")
        row.refresh_from_db()
        assert row.mark_paths is None

    def test_save_survives_s3_failure(self, restore_public, settings):
        settings.CURATED_LOGO_SYNC_DIR = ""
        # get_s3_client is the _no_curated_s3 fast-fail stub here.
        row = CuratedLogo.objects.create(title="Y", image_key="platform/curated-logos/y.png")
        assert row.pk
        row.refresh_from_db()
        assert row.mark_paths is None
```

Add a `mark_paths` assertion to `TestCuratedCatalogEndpoint.test_unauthenticated_ordered_enabled_only`:

```python
        assert "mark_paths" in first  # present (null for these untraced rows)
```

- [ ] **Step 5: Run the tests — they fail**

Run: `docker compose exec -T django pytest apps/core/tests/test_curated_logos.py -v`
Expected: FAIL — `TestCuratedTraceOnSave` (no trace signal yet) and the endpoint assertion (no `mark_paths` key yet).

- [ ] **Step 6: Add the trace signals**

Append to `backend/apps/core/signals.py` (uses the module's existing `settings`, `get_s3_client`, `logger`, `receiver`, `pre_save`, `post_save`, `CuratedLogo`):

```python
@receiver(pre_save, sender=CuratedLogo)
def curated_logo_detect_image_change(sender, instance, **kwargs):
    """Flag whether the PNG changed, so post_save only re-traces when needed."""
    if not instance.pk:
        instance._image_changed = True
        return
    try:
        old = CuratedLogo.objects.only("image_key").get(pk=instance.pk)
    except CuratedLogo.DoesNotExist:
        instance._image_changed = True
        return
    instance._image_changed = old.image_key != instance.image_key


@receiver(post_save, sender=CuratedLogo)
def curated_logo_trace_on_save(sender, instance, **kwargs):
    """When the image is new/changed, vectorize it into mark_paths. Best effort;
    uses a targeted .update() so it never recurses through save signals."""
    if not getattr(instance, "_image_changed", False):
        return
    key = instance.image_key or ""
    if not key.startswith("platform/"):
        return
    from apps.core.curated_logos.trace import trace_curated_mark

    try:
        body = get_s3_client().get_object(Bucket=settings.AWS_BUCKET_NAME, Key=key)["Body"].read()
    except Exception:
        logger.warning("curated logo: could not fetch PNG to trace: %s", key, exc_info=True)
        return
    CuratedLogo.objects.filter(pk=instance.pk).update(mark_paths=trace_curated_mark(body))
```

- [ ] **Step 7: Serve `mark_paths` from the catalog endpoint**

In `backend/apps/core/curated_logos/views.py`, add to the appended row dict:

```python
                "mark_paths": row.mark_paths,
```

- [ ] **Step 8: Run the backend tests — pass**

Run: `docker compose exec -T django pytest apps/core/tests/test_curated_logos.py -v`
Expected: PASS.

- [ ] **Step 9: Full backend suite on a fresh DB (new migration)**

Run: `make test-fresh`
Expected: PASS (green — no migration drift).

- [ ] **Step 10: Commit**

```bash
git add backend/apps/core/models.py backend/apps/core/migrations/0027_curatedlogo_mark_paths.py backend/apps/core/curated_logos/trace.py backend/apps/core/signals.py backend/apps/core/curated_logos/views.py backend/apps/core/tests/test_curated_logos.py
git commit -m "feat(logo-library): vectorize curated PNGs into mark_paths on save"
```

---

### Task 6: Vectorized curated pick + Brief tagline (frontend)

Parses `mark_paths` into the catalog type, adds an optional Brief tagline, and makes "Use this" build a complete recipe (vector mark when available, else PNG) with name + tagline.

**Files:**
- Modify: `frontend-customer/src/lib/logo/library-catalog.ts`
- Modify: `frontend-customer/src/lib/logo/__tests__/library-catalog.test.ts`
- Modify: `frontend-customer/src/lib/logo/composer.ts` (Brief.tagline)
- Modify: `frontend-customer/src/components/logo/studio-brief.tsx`
- Modify: `frontend-customer/src/components/logo/logo-studio.tsx`

**Interfaces:**
- Consumes: `CuratedLogo` (Task 3), `handleCustomize` / `seedRecipe` (existing).
- Produces: `CuratedLogo.markPaths?: CustomMarkPath[]`.
- Produces: `curatedRecipe(logo: CuratedLogo, mark: LogoMark, opts: { brandName: string; tagline: string; base: LogoRecipe }): LogoRecipe`.
- Produces: `Brief.tagline?: string`.

- [ ] **Step 1: Write the failing tests**

In `library-catalog.test.ts` add:

```ts
it("parses mark_paths into markPaths when present, undefined otherwise", async () => {
  const raw = [
    { title: "V", filename: "v.png", prompt: "", tags: "yoga", image_url: "v", mark_paths: [{ d: "M0 0 Z", fill: "mark" }] },
    { title: "R", filename: "r.png", prompt: "", tags: "yoga", image_url: "r", mark_paths: null },
  ];
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => raw }));
  const logos = await fetchCuratedCatalog();
  expect(logos[0].markPaths).toEqual([{ d: "M0 0 Z", fill: "mark" }]);
  expect(logos[1].markPaths).toBeUndefined();
});

it("builds a complete recipe from a curated logo, mark + name + tagline", () => {
  const base = defaultRecipe("Placeholder", "#1a56db");
  const logo = { title: "Lotus", filename: "l.png", prompt: "", tags: ["yoga"], imageUrl: "l", markPaths: [{ d: "M0 0 Z", fill: "mark" as const }] };
  const recipe = curatedRecipe(
    logo,
    { type: "custom", rationale: logo.title, paths: logo.markPaths! },
    { brandName: "Zeynep Yoga", tagline: "Breathe daily", base },
  );
  expect(recipe.name).toBe("Zeynep Yoga");
  expect(recipe.tagline).toBe("Breathe daily");
  expect(recipe.mark).toEqual({ type: "custom", rationale: "Lotus", paths: [{ d: "M0 0 Z", fill: "mark" }] });
});
```

Add the imports the test needs at the top of the file: `import { defaultRecipe } from "@/lib/logo/catalog";` and extend the catalog import to `import { curatedRecipe, fetchCuratedCatalog, rankForBrief } from "../library-catalog";`.

- [ ] **Step 2: Run — fails**

Run: `cd frontend-customer && npx vitest run src/lib/logo/__tests__/library-catalog.test.ts`
Expected: FAIL (`markPaths` missing, `curatedRecipe` undefined).

- [ ] **Step 3: Implement in `library-catalog.ts`**

Add `markPaths` to the type, parse it, and add `curatedRecipe`:

```ts
import type { CustomMarkPath, LogoMark, LogoRecipe } from "@/types/logo";

export interface CuratedLogo {
  title: string;
  filename: string;
  prompt: string;
  tags: string[];
  imageUrl: string;
  markPaths?: CustomMarkPath[];
}

interface RawEntry {
  title: string;
  filename: string;
  prompt: string;
  tags: string;
  image_url: string;
  mark_paths?: CustomMarkPath[] | null;
}
```

In `fetchCuratedCatalog`'s `.map`, add:

```ts
      markPaths: e.mark_paths ?? undefined,
```

Add the pure recipe builder:

```ts
/** A picked curated logo → a complete Logo Studio recipe: the given mark
 * (traced vector or uploaded image) plus the brief's name and tagline. */
export function curatedRecipe(
  logo: CuratedLogo,
  mark: LogoMark,
  opts: { brandName: string; tagline: string; base: LogoRecipe },
): LogoRecipe {
  return {
    ...opts.base,
    name: opts.brandName || opts.base.name,
    tagline: opts.tagline,
    mark,
  };
}
```

- [ ] **Step 4: Run — passes**

Run: `cd frontend-customer && npx vitest run src/lib/logo/__tests__/library-catalog.test.ts`
Expected: PASS.

- [ ] **Step 5: Add `tagline` to `Brief`**

In `composer.ts`, add to the `Brief` interface:

```ts
  /** Optional tagline the coach types in the Brief; seeded into picked ideas. */
  tagline?: string;
```

- [ ] **Step 6: Add the tagline input to `studio-brief.tsx`**

After the "What do you teach?" label block, add:

```tsx
<label className="block space-y-1.5">
  <span className="text-sm font-medium">
    Tagline{" "}
    <span className="font-normal text-muted-foreground">(optional)</span>
  </span>
  <input
    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
    value={brief.tagline ?? ""}
    maxLength={120}
    placeholder="e.g. Yoga for busy mothers"
    onChange={(e) => onChange({ ...brief, tagline: e.target.value })}
  />
</label>
```

- [ ] **Step 7: Rework `handleUseCurated` to use vector mark + tagline**

In `logo-studio.tsx`, import `curatedRecipe` from `library-catalog`, then replace `handleUseCurated` (~lines 456-485):

```tsx
async function handleUseCurated(logo: CuratedLogo) {
  setError(null);
  const base = seedRecipe(config, theme.primaryHex);
  const seed = {
    brandName: brief.brandName || config.brand_name || base.name,
    tagline: brief.tagline ?? "",
    base,
  };
  // Traced vector mark: instant, editable, recolorable — no PNG round-trip.
  if (logo.markPaths?.length) {
    handleCustomize(
      curatedRecipe(
        logo,
        { type: "custom", rationale: logo.title, paths: logo.markPaths },
        seed,
      ),
    );
    return;
  }
  // Fallback: fetch the PNG and use it as an image mark.
  try {
    const res = await fetch(logo.imageUrl);
    const blob = await res.blob();
    const file = new File([blob], logo.filename, {
      type: blob.type || "image/png",
    });
    const objectUrl = URL.createObjectURL(file);
    try {
      const dataUrl = await imageToDataUrl(objectUrl);
      const uploaded = await uploadPng(file, logo.filename, file.type);
      handleCustomize(
        curatedRecipe(
          logo,
          { type: "image", photo_id: uploaded.photo_id, url: dataUrl },
          seed,
        ),
      );
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch (err) {
    setError(
      err instanceof Error ? err.message : "Couldn't use that logo — try again.",
    );
  }
}
```

- [ ] **Step 8: Build + lint + full logo suite**

Run: `cd frontend-customer && npm run lint && npm run build && npx vitest run src/lib/logo`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend-customer/src/lib/logo/library-catalog.ts frontend-customer/src/lib/logo/__tests__/library-catalog.test.ts frontend-customer/src/lib/logo/composer.ts frontend-customer/src/components/logo/studio-brief.tsx frontend-customer/src/components/logo/logo-studio.tsx
git commit -m "feat(logo-studio): curated pick builds a complete vector recipe with name + tagline"
```

---

### Task 7: Rewrite the e2e spec + full verification

Rewrites `15-logo-studio.spec.ts` for the curated-first flow and runs the whole suite.

**Files:**
- Modify: `e2e/specs/15-logo-studio.spec.ts`

**Interfaces:**
- Consumes: the finished studio (Tasks 1–6).

- [ ] **Step 1: Reseed curated logos so the dev DB has traced marks**

Run: `docker compose exec -T django python manage.py seed_curated_logos`
Expected: rows created/updated; the save signal traces each PNG (silhouette/line-art art populates `mark_paths`; complex art stays null → PNG fallback).

- [ ] **Step 2: Rewrite `e2e/specs/15-logo-studio.spec.ts`**

Replace the whole file with the curated-first walk (Brief incl. tagline → curated "Use this" → Editor fine-tune → save). This drops every wall assertion (Shuffle, `wall-card`, "More auto-generated ideas", customize-from-wall):

```ts
// e2e/specs/15-logo-studio.spec.ts
//
// Coach opens the Logo Studio via the setup-assistant deep link and walks the
// curated-first flow: Brief (name + niche + tagline + a style chip) -> Ideas
// (the curated gallery; the deterministic wall is gone) -> Use a ready-made
// logo -> fine-tune in the Editor -> save. The PATCH must persist a schema-v3
// recipe carrying the brand name + tagline. The Ideas step also surfaces the
// staged "Design with AI" chat as a paid-tier upsell — this spec only confirms
// the panel opens (no real AI turn; see 90-logo-eval.spec.ts for that).

import { test, expect } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";

test("coach creates a logo through brief, curated ideas, and editor", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const coach = await coachContext(browser);
  const page = await coach.newPage();

  await page.goto(`${TENANT}/admin/design?studio=1`);
  await expect(
    page.getByRole("heading", { name: "Logo Studio" }),
  ).toBeVisible();

  const dialog = page.getByRole("dialog");

  // Normalize onto the Brief step (a saved-design tenant lands in the Editor).
  const briefHeading = dialog.getByText("Tell us about your brand");
  if (!(await briefHeading.isVisible())) {
    await dialog.getByRole("button", { name: "Get new ideas" }).click();
  }
  await expect(briefHeading).toBeVisible();

  const nameInput = dialog.getByLabel("Brand name");
  if (!(await nameInput.inputValue())) await nameInput.fill("Demo Yoga");
  await dialog.getByLabel("What do you teach?").fill("yoga");
  await dialog.getByLabel("Tagline (optional)").fill("Move every day");
  await dialog.getByRole("button", { name: "Elegant" }).click();
  await dialog.getByRole("button", { name: "Show my logo ideas" }).click();

  // Ideas: the curated gallery is the only Browse surface now.
  await expect(dialog.getByText("Ready-made logos")).toBeVisible();

  // Design with AI: confirm the staged chat panel opens (eligible tenants) or
  // the upsell shows — never drive a real AI turn. Scope to the door card.
  const aiDoor = dialog.getByRole("button", { name: "Design with AI" });
  if (await aiDoor.isVisible().catch(() => false)) {
    await aiDoor.click();
    const chat = dialog.getByTestId("studio-chat");
    if (await chat.isVisible().catch(() => false)) {
      await expect(chat.getByRole("textbox")).toBeVisible();
      await chat.getByLabel("Close chat").click();
    }
  }

  // Use the first ready-made logo -> Editor.
  await dialog
    .getByRole("button", { name: "Use this" })
    .first()
    .click();
  await expect(
    dialog.getByRole("button", { name: "Use this logo" }),
  ).toBeVisible();

  // Fine-tune: force a known layout + confirm the tagline seeded from the Brief.
  await dialog.getByRole("button", { name: "Mark + name" }).click();

  // Save -> assert the persisted v3 recipe carries name + tagline.
  const patchPromise = page.waitForResponse(
    (resp) =>
      resp.url().includes("admin/config") &&
      resp.request().method() === "PATCH" &&
      resp.status() === 200,
    { timeout: 30_000 },
  );
  await dialog.getByRole("button", { name: "Use this logo" }).click();
  const patch = await patchPromise;
  const body = patch.request().postDataJSON();
  expect(body.logo_id).toBeTruthy();
  expect(body.icon_id).toBeTruthy();
  expect(body.logo_recipe.version).toBe(3);
  expect(body.logo_recipe.layout).toBe("horizontal");
  expect(body.logo_recipe.tagline).toBe("Move every day");
  expect(body.logo_recipe.name).toBeTruthy();

  await expect(
    page.getByRole("heading", { name: "Logo Studio" }),
  ).toBeHidden({ timeout: 15_000 });

  await coach.close();
});
```

- [ ] **Step 3: Run e2e specs 15 + 17**

Run: `make e2e` (or target the two specs if the harness supports it).
Expected: `15-logo-studio` and `17-logo-curated-library` PASS; no wall references remain.

- [ ] **Step 4: Full frontend + backend verification**

Run: `cd frontend-customer && npm test && npm run build && npm run lint`
Run: `cd .. && make test-fresh && make lint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add e2e/specs/15-logo-studio.spec.ts
git commit -m "test(logo-studio): rewrite e2e for the curated-first flow (wall removed)"
```

---

## Notes for the implementer

- **File responsibilities** — `composer.ts` after Task 2 is "AI design materialization + refine" (the wall is gone); keep the filename. `library-catalog.ts` owns both fetching curated logos and turning a picked one into a recipe (`curatedRecipe`). `curated_logos/trace.py` isolates the tracer import so `vtracer`/Pillow never load on the catalog's public read path.
- **Why the trace runs on save, not at pick-time** — the curated PNG bytes only live in object storage; the row's `mark_paths` is computed once server-side so the browser never traces, and the studio recolors the traced mark to the coach's palette.
- **keepMark scope** — default-OFF "Redraw the icon" means refine reuses *any* current mark (icon, image, abstract, custom) by default; toggling Redraw restores the from-scratch AI mark. This is the no-schema-change form of the spec's "reuse the icon" requirement.
