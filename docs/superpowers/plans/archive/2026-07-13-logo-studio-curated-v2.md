# Logo Studio Curated Full-Logo Flow v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ideas cards become complete varied logos (curated mark + coach's name/tagline), paid "Create similar" one-shots Gemini-icon + Claude-lockup into the Editor, step navigation never silently loses a draft, and the superadmin curated-logos panel becomes a drop-a-PNG → JSON-modal gallery.

**Architecture:** All coach-side work is in `frontend-customer` (a new pure preview composer + a headless chain over the existing converse endpoints — zero new backend surface). The superadmin work adds an opt-in `list_mode = "gallery"` to the shared adminkit (2 new meta keys backend-side; a gallery view + JSON-record modal in `packages/shared/src/admin-kit/`), reusing the existing `/api/v1/platform/upload/` endpoint and the existing trace-on-save signal.

**Tech Stack:** Next.js 14 + React + TypeScript (vitest), Django 5.1 + DRF (pytest), Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-07-13-logo-studio-curated-v2-design.md`

## Global Constraints

- **Commits:** This repo forbids committing unless the user explicitly asks (CLAUDE.md). Treat every `git commit` step as "stage the change and pause for the user's go-ahead." Never push.
- **Quality gates:** `npm run lint` and `npm run build` (in `frontend-customer/`) and `make lint` must pass with zero errors/warnings before a task is done.
- **No migrations:** No model fields change in this plan. Plain `make test` suffices (`make test-fresh` only if a migration unexpectedly appears).
- **Trace pipeline untouched:** Do NOT modify `trace_mark`, `validate_logo_recipe` caps, or the `CuratedLogo` post-save trace signal.
- **Shared working tree:** `main` can move under concurrent agents — verify branch/base before any commit. (repo memory: contentor-shared-working-tree-concurrent-agents)
- **packages/shared has no unit-test harness.** Admin-kit gallery logic is verified by the backend meta tests (Task 5) and the rewritten e2e spec 18 (Task 7). Do not invent a new test runner for `packages/shared`.
- **Test dirs:** frontend commands run from `frontend-customer/`; backend commands from the repo root (they exec into the `django` container); e2e needs the dev stack up (`make dev`) and seeded (`make seed`).
- **e2e timing:** specs 15/17/18 are updated only in Task 7 — do NOT run `make e2e` between Tasks 1–6 (Task 6 changes the superadmin UI that spec 18 walks).

---

### Task 1: `curated-preview.ts` — varied full-logo preview composer

A pure function that turns one curated logo + the coach's brief into a complete `LogoRecipe`: traced vector mark (or PNG image mark), brand name + tagline, and a deterministically varied lockup biased by the logo's tags.

**Files:**
- Create: `frontend-customer/src/lib/logo/curated-preview.ts`
- Create: `frontend-customer/src/lib/logo/__tests__/curated-preview.test.ts`

**Interfaces:**
- Consumes: `CuratedLogo` (`@/lib/logo/library-catalog`), `LOGO_FONTS`/`PALETTES`/`applyPalette` (`@/lib/logo/catalog`), `LogoRecipe` types.
- Produces: `composeCuratedPreview(logo: CuratedLogo, opts: { brandName: string; tagline: string; base: LogoRecipe; primaryHex: string; index: number }): LogoRecipe` — Task 2 (gallery cards + "Use this") and Task 4 rely on this exact signature.

- [ ] **Step 1: Write the failing test**

Create `frontend-customer/src/lib/logo/__tests__/curated-preview.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LOGO_FONTS, defaultRecipe } from "@/lib/logo/catalog";
import { composeCuratedPreview } from "@/lib/logo/curated-preview";
import type { CuratedLogo } from "@/lib/logo/library-catalog";

const BASE = defaultRecipe("Base Brand", "#1a56db");

const TRACED: CuratedLogo = {
  title: "Lotus",
  filename: "lotus.png",
  prompt: "a lotus logo",
  tags: ["yoga", "elegant"],
  imageUrl: "http://storage.local/lotus.png",
  markPaths: [{ d: "M0 0 L10 10 Z", fill: "mark" }],
};

const UNTRACED: CuratedLogo = {
  title: "Splash",
  filename: "splash.png",
  prompt: "a colorful splash",
  tags: ["colorful", "playful"],
  imageUrl: "http://storage.local/splash.png",
};

const OPTS = {
  brandName: "Zeynep Yoga",
  tagline: "Breathe daily",
  base: BASE,
  primaryHex: "#1a56db",
  index: 0,
};

describe("composeCuratedPreview", () => {
  it("is deterministic for the same inputs", () => {
    const a = composeCuratedPreview(TRACED, OPTS);
    const b = composeCuratedPreview(TRACED, OPTS);
    expect(a).toEqual(b);
  });

  it("varies adjacent cards (same logo, different index)", () => {
    const a = composeCuratedPreview(TRACED, OPTS);
    const b = composeCuratedPreview(TRACED, { ...OPTS, index: 1 });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it("biases the font toward the logo's tags (elegant -> Elegant/Script vibes)", () => {
    const recipe = composeCuratedPreview(TRACED, OPTS);
    const entry = LOGO_FONTS.find(
      (f) => f.family === recipe.typography.name.font,
    );
    expect(["Elegant", "Script"]).toContain(entry?.vibe);
  });

  it("builds a complete logo from a traced mark: custom paths + name + tagline", () => {
    const recipe = composeCuratedPreview(TRACED, OPTS);
    expect(recipe.mark).toEqual({
      type: "custom",
      rationale: "Lotus",
      paths: TRACED.markPaths,
    });
    expect(recipe.name).toBe("Zeynep Yoga");
    expect(recipe.tagline).toBe("Breathe daily");
    expect(recipe.version).toBe(3);
  });

  it("falls back to a badge-less image mark for untraced logos", () => {
    const recipe = composeCuratedPreview(UNTRACED, OPTS);
    expect(recipe.mark).toEqual({
      type: "image",
      photo_id: "",
      url: UNTRACED.imageUrl,
    });
    expect(recipe.badge.shape).toBe("none");
  });

  it("never paints a badge-less mark white (visibility on the white card)", () => {
    // Sweep indexes so every profile/palette rotation is exercised.
    for (let index = 0; index < 12; index++) {
      const recipe = composeCuratedPreview(TRACED, { ...OPTS, index });
      if (recipe.badge.shape === "none") {
        expect(recipe.colors.mark).not.toBe("#ffffff");
      }
    }
  });

  it("falls back to the base recipe's name when brandName is empty", () => {
    const recipe = composeCuratedPreview(TRACED, { ...OPTS, brandName: "" });
    expect(recipe.name).toBe("Base Brand");
  });
});
```

- [ ] **Step 2: Run it — fails (module missing)**

Run: `cd frontend-customer && npx vitest run src/lib/logo/__tests__/curated-preview.test.ts`
Expected: FAIL — cannot resolve `@/lib/logo/curated-preview`.

- [ ] **Step 3: Implement `curated-preview.ts`**

Create `frontend-customer/src/lib/logo/curated-preview.ts`:

```ts
// Composes one curated library logo + the coach's brief into a COMPLETE
// LogoRecipe for the Ideas gallery: the curated mark (traced vector, or the
// raw PNG as an image mark), the coach's brand name + tagline, and a
// deterministically varied lockup (layout/font/palette) biased by the logo's
// tags — so the gallery reads as finished logo concepts, and "Use this"
// hands over exactly what was previewed.
// See docs/superpowers/specs/2026-07-13-logo-studio-curated-v2-design.md.
import {
  LOGO_FONTS,
  PALETTES,
  applyPalette,
  type FontVibe,
} from "@/lib/logo/catalog";
import type { CuratedLogo } from "@/lib/logo/library-catalog";
import type {
  BadgeShape,
  FontWeight,
  LogoRecipe,
  RecipeLayout,
  TextCase,
} from "@/types/logo";

interface StyleProfile {
  /** Any overlap with the logo's tags selects this profile. */
  keywords: string[];
  vibes: FontVibe[];
  layouts: RecipeLayout[];
  badges: BadgeShape[];
  /** Ids from catalog PALETTES — the per-card color variation pool. */
  paletteIds: string[];
  tracking: number;
  nameCase: TextCase;
}

const PROFILES: StyleProfile[] = [
  {
    keywords: ["elegant", "luxury", "premium", "boutique", "classy"],
    vibes: ["Elegant", "Script"],
    layouts: ["stacked", "horizontal"],
    badges: ["none", "circle"],
    paletteIds: ["ink", "sand", "plum", "gold-fade", "cocoa"],
    tracking: 0.05,
    nameCase: "title",
  },
  {
    keywords: ["bold", "strong", "fitness", "sport", "gym", "power"],
    vibes: ["Bold"],
    layouts: ["horizontal", "emblem", "stacked"],
    badges: ["circle", "shield", "hexagon"],
    paletteIds: ["ink", "midnight-fade", "sunset-fade", "coral"],
    tracking: 0.06,
    nameCase: "upper",
  },
  {
    keywords: ["playful", "fun", "kids", "colorful", "cute"],
    vibes: ["Playful"],
    layouts: ["horizontal", "stacked"],
    badges: ["circle", "rounded"],
    paletteIds: ["coral", "amber", "berry-fade", "sky"],
    tracking: 0,
    nameCase: "none",
  },
  {
    keywords: ["minimal", "clean", "simple", "modern"],
    vibes: ["Minimal", "Modern"],
    layouts: ["horizontal", "horizontal_reversed"],
    badges: ["none"],
    paletteIds: ["mono", "slate", "sand", "ink"],
    tracking: 0.02,
    nameCase: "none",
  },
  {
    keywords: ["organic", "nature", "wellness", "yoga", "zen", "calm"],
    vibes: ["Elegant", "Minimal"],
    layouts: ["stacked", "horizontal"],
    badges: ["none", "circle"],
    paletteIds: ["sage", "forest", "clay", "mint-fade", "pine"],
    tracking: 0.02,
    nameCase: "none",
  },
  {
    keywords: ["tech", "digital", "code", "data", "ai"],
    vibes: ["Modern", "Minimal"],
    layouts: ["horizontal", "horizontal_reversed"],
    badges: ["none", "squircle"],
    paletteIds: ["midnight-fade", "ocean-fade", "slate", "violet"],
    tracking: 0.01,
    nameCase: "none",
  },
];

const DEFAULT_PROFILE: StyleProfile = {
  keywords: [],
  vibes: ["Modern", "Bold", "Playful", "Elegant"],
  layouts: ["horizontal", "stacked", "horizontal_reversed"],
  badges: ["none", "circle"],
  paletteIds: ["theme", "ink", "forest", "violet", "ocean-fade", "terracotta"],
  tracking: 0,
  nameCase: "none",
};

function profileFor(tags: string[]): StyleProfile {
  return (
    PROFILES.find((p) => p.keywords.some((k) => tags.includes(k))) ??
    DEFAULT_PROFILE
  );
}

/** djb2 — stable, cheap, good spread for short filenames. */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  return h;
}

function pick<T>(arr: T[], n: number): T {
  return arr[((n % arr.length) + arr.length) % arr.length]!;
}

export function composeCuratedPreview(
  logo: CuratedLogo,
  opts: {
    brandName: string;
    tagline: string;
    base: LogoRecipe;
    primaryHex: string;
    index: number;
  },
): LogoRecipe {
  const profile = profileFor(logo.tags);
  const seed = hashString(logo.filename);
  const vibe = pick(profile.vibes, seed + opts.index);
  const families = LOGO_FONTS.filter((f) => f.vibe === vibe);
  const font = pick(families, (seed >> 3) + opts.index);
  const layout = pick(profile.layouts, (seed >> 5) + opts.index);
  const traced = Boolean(logo.markPaths?.length);
  // PNG art carries its own colors and shape — no badge behind it.
  const badgeShape: BadgeShape = traced
    ? pick(profile.badges, (seed >> 7) + opts.index)
    : "none";
  const palettes = PALETTES(opts.primaryHex);
  const paletteId = pick(profile.paletteIds, (seed >> 9) + opts.index);
  const palette = palettes.find((p) => p.id === paletteId) ?? palettes[0]!;
  const nameWeight: FontWeight = font.weights.includes(700)
    ? 700
    : font.weights[font.weights.length - 1]!;
  const taglineWeight: FontWeight = font.weights.includes(500)
    ? 500
    : font.weights[font.weights.length - 1]!;

  const recipe = applyPalette(
    {
      ...opts.base,
      layout,
      name: opts.brandName || opts.base.name,
      tagline: opts.tagline,
      mark: traced
        ? { type: "custom", rationale: logo.title, paths: logo.markPaths! }
        : // photo_id "" is display-only — handleUseCurated uploads the PNG
          // and swaps in a real photo_id before this recipe reaches the editor.
          { type: "image", photo_id: "", url: logo.imageUrl },
      badge: { shape: badgeShape, outline: false },
      typography: {
        name: {
          font: font.family,
          weight: nameWeight,
          tracking: profile.tracking,
          case: profile.nameCase,
        },
        tagline: {
          font: font.family,
          weight: taglineWeight,
          tracking: 0.08,
          case: "upper",
        },
      },
      elements: {
        mark: { offset: [0, 0], scale: 1 },
        name: { offset: [0, 0], scale: 1 },
        tagline: { offset: [0, 0], scale: 1 },
      },
    },
    palette,
  );
  // Palette mark colors are designed to sit ON a badge (often white). With no
  // badge behind it, paint the mark in the palette's text color; give the
  // secondary custom-mark roles readable companions either way.
  const colors = {
    ...recipe.colors,
    mark2: palette.text,
    mark_accent: palette.tagline,
  };
  if (badgeShape === "none") colors.mark = palette.text;
  return { ...recipe, colors };
}
```

- [ ] **Step 4: Run it — passes**

Run: `cd frontend-customer && npx vitest run src/lib/logo/__tests__/curated-preview.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Lint + build**

Run: `cd frontend-customer && npm run lint && npm run build`
Expected: PASS, no warnings.

- [ ] **Step 6: Commit** (stage + await go-ahead per Global Constraints)

```bash
git add frontend-customer/src/lib/logo/curated-preview.ts frontend-customer/src/lib/logo/__tests__/curated-preview.test.ts
git commit -m "feat(logo-studio): tag-biased full-logo preview composer for curated cards"
```

---

### Task 2: Gallery cards render the composed full logos

The Ideas gallery swaps raw `<img>` PNGs for `LogoRenderer` previews of the Task 1 recipes, and "Use this" hands the exact previewed recipe to the editor. `curatedRecipe` (subsumed by `composeCuratedPreview`) is deleted.

**Files:**
- Modify: `frontend-customer/src/components/logo/curated-gallery.tsx` (full rewrite below)
- Modify: `frontend-customer/src/components/logo/studio-entrance.tsx`
- Modify: `frontend-customer/src/components/logo/logo-studio.tsx`
- Modify: `frontend-customer/src/lib/logo/library-catalog.ts` (delete `curatedRecipe`)
- Modify: `frontend-customer/src/lib/logo/__tests__/library-catalog.test.ts`

**Interfaces:**
- Consumes: `composeCuratedPreview` (Task 1).
- Produces: `CuratedGallery` props `{ logos, loading, aiEligible, brandName, tagline, baseRecipe, primaryHex, onUse(logo, preview), onCreateSimilar(logo), onUpgrade }` — Task 4 adds `generatingFilename` to this set.
- Produces: `StudioEntrance` props gain `brandName: string; tagline: string; baseRecipe: LogoRecipe; primaryHex: string`; `onUseCurated: (logo: CuratedLogo, preview: LogoRecipe) => void`.

- [ ] **Step 1: Update `library-catalog.test.ts` first — delete the `curatedRecipe` block**

In `frontend-customer/src/lib/logo/__tests__/library-catalog.test.ts`:
1. Change the import line to drop `curatedRecipe`:

```ts
import { fetchCuratedCatalog, rankForBrief } from "../library-catalog";
```

2. Delete the entire `it("builds a complete recipe from a curated logo, mark + name + tagline", ...)` test.
3. If `defaultRecipe` is now unused in the file, remove its import.

Run: `cd frontend-customer && npx vitest run src/lib/logo/__tests__/library-catalog.test.ts`
Expected: PASS (remaining tests still green against the current module).

- [ ] **Step 2: Delete `curatedRecipe` from `library-catalog.ts`**

Remove the whole `curatedRecipe` function (lines 42–55) and prune the now-unused imports: the `import type` line becomes:

```ts
import type { CustomMarkPath } from "@/types/logo";
```

(`LogoMark` and `LogoRecipe` were only used by `curatedRecipe`.)

- [ ] **Step 3: Rewrite `curated-gallery.tsx`**

Replace the entire file with:

```tsx
"use client";

import { useMemo, useState } from "react";
import { Lock, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { composeCuratedPreview } from "@/lib/logo/curated-preview";
import type { CuratedLogo } from "@/lib/logo/library-catalog";
import type { LogoRecipe } from "@/types/logo";
import { LogoRenderer } from "./logo-renderer";

interface CuratedGalleryProps {
  logos: CuratedLogo[];
  loading: boolean;
  aiEligible: boolean;
  brandName: string;
  tagline: string;
  baseRecipe: LogoRecipe;
  primaryHex: string;
  onUse: (logo: CuratedLogo, preview: LogoRecipe) => void;
  onCreateSimilar: (logo: CuratedLogo) => void;
  onUpgrade: () => void;
}

export function CuratedGallery({
  logos,
  loading,
  aiEligible,
  brandName,
  tagline,
  baseRecipe,
  primaryHex,
  onUse,
  onCreateSimilar,
  onUpgrade,
}: CuratedGalleryProps) {
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const tags = useMemo(
    () => Array.from(new Set(logos.flatMap((l) => l.tags))).sort(),
    [logos],
  );
  const shown = activeTag
    ? logos.filter((l) => l.tags.includes(activeTag))
    : logos;

  // Each card is a COMPLETE logo concept for this coach: the curated mark
  // composed with their brand name + tagline in a varied, tag-biased lockup.
  // "Use this" hands over exactly this recipe.
  const previews = useMemo(
    () =>
      shown.map((logo, index) =>
        composeCuratedPreview(logo, {
          brandName,
          tagline,
          base: baseRecipe,
          primaryHex,
          index,
        }),
      ),
    [shown, brandName, tagline, baseRecipe, primaryHex],
  );

  if (loading) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Loading ready-made logos…
      </p>
    );
  }
  if (!logos.length) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        No ready-made logos yet — try Design with AI instead.
      </p>
    );
  }

  return (
    <div className="space-y-4 p-6">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTag(null)}
            className={`rounded-full border px-3 py-1 text-xs ${activeTag === null ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
          >
            All
          </button>
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setActiveTag(tag)}
              className={`rounded-full border px-3 py-1 text-xs capitalize ${activeTag === tag ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((logo, index) => (
          <div
            key={logo.filename}
            className="flex flex-col overflow-hidden rounded-xl border"
          >
            <div className="flex h-44 items-center justify-center overflow-hidden bg-white p-4">
              <LogoRenderer recipe={previews[index]!} width={220} />
            </div>
            <div className="flex flex-col gap-2 border-t p-3">
              <p className="truncate text-xs font-medium" title={logo.title}>
                {logo.title}
              </p>
              <Button
                size="sm"
                onClick={() => onUse(logo, previews[index]!)}
                className="gap-2"
              >
                <Sparkles className="h-4 w-4" /> Use this
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  aiEligible ? onCreateSimilar(logo) : onUpgrade()
                }
                className="gap-1"
              >
                {aiEligible ? (
                  <Wand2 className="h-3.5 w-3.5" />
                ) : (
                  <Lock className="h-3.5 w-3.5" />
                )}
                Create your own
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Thread the new props through `studio-entrance.tsx`**

Replace the entire file with:

```tsx
"use client";

import { Sparkles, Wand2 } from "lucide-react";
import type { CuratedLogo } from "@/lib/logo/library-catalog";
import type { LogoAiStatus } from "@/lib/logo/converse-api";
import type { LogoRecipe } from "@/types/logo";
import { CuratedGallery } from "./curated-gallery";

interface StudioEntranceProps {
  logos: CuratedLogo[];
  loadingLibrary: boolean;
  logoAiStatus: LogoAiStatus | null;
  brandName: string;
  tagline: string;
  baseRecipe: LogoRecipe;
  primaryHex: string;
  onUseCurated: (logo: CuratedLogo, preview: LogoRecipe) => void;
  onCreateFromCurated: (logo: CuratedLogo) => void;
  onOpenChat: () => void;
  onUpgrade: () => void;
}

export function StudioEntrance({
  logos,
  loadingLibrary,
  logoAiStatus,
  brandName,
  tagline,
  baseRecipe,
  primaryHex,
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
            Complete logo ideas for your brand — free to use and fine-tune.
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
        brandName={brandName}
        tagline={tagline}
        baseRecipe={baseRecipe}
        primaryHex={primaryHex}
        onUse={onUseCurated}
        onCreateSimilar={onCreateFromCurated}
        onUpgrade={onUpgrade}
      />
    </div>
  );
}
```

- [ ] **Step 5: Rework `logo-studio.tsx` — pass props, hand over the preview**

1. Change the `library-catalog` import (~line 40) to drop `curatedRecipe`:

```tsx
import {
  fetchCuratedCatalog,
  rankForBrief,
  type CuratedLogo,
} from "@/lib/logo/library-catalog";
```

2. Add a memoized preview base near the top of the component (after `const theme = ...`). Import `useMemo` from react in the existing import:

```tsx
// Stable seed recipe for gallery previews — recomputed only when the coach's
// saved config/theme changes, so the preview memo in CuratedGallery holds.
const previewBase = useMemo(
  () => seedRecipe(config, theme.primaryHex),
  [config, theme.primaryHex],
);
```

3. Replace `handleUseCurated` (~lines 405–450) with:

```tsx
async function handleUseCurated(logo: CuratedLogo, preview: LogoRecipe) {
  setError(null);
  // Traced vector mark: the previewed recipe is already complete.
  if (logo.markPaths?.length) {
    handleCustomize(preview);
    return;
  }
  // Untraced: persist the PNG first, then swap the display-only image mark
  // for one carrying a real photo_id (the preview used imageUrl directly).
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
      handleCustomize({
        ...preview,
        mark: { type: "image", photo_id: uploaded.photo_id, url: dataUrl },
      });
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

4. In the `StudioEntrance` render block (~lines 630–639), pass the new props:

```tsx
<StudioEntrance
  logos={library}
  loadingLibrary={loadingLibrary}
  logoAiStatus={logoAiStatus}
  brandName={brief.brandName || config.brand_name}
  tagline={brief.tagline ?? ""}
  baseRecipe={previewBase}
  primaryHex={theme.primaryHex}
  onUseCurated={handleUseCurated}
  onCreateFromCurated={handleCreateFromCurated}
  onOpenChat={() => setChatOpen(true)}
  onUpgrade={handleUpgrade}
/>
```

- [ ] **Step 6: Full logo suite + lint + build**

Run: `cd frontend-customer && npx vitest run src/lib/logo && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 7: Visual sanity check**

With the dev stack up (`make dev`), open a coach's `/admin/design?studio=1`, walk Brief → Ideas, and confirm: cards render full logos (name + tagline visible, varied fonts/layouts), tag filters still work, "Use this" lands the same design in the Editor.

- [ ] **Step 8: Commit**

```bash
git add frontend-customer/src/components/logo/curated-gallery.tsx frontend-customer/src/components/logo/studio-entrance.tsx frontend-customer/src/components/logo/logo-studio.tsx frontend-customer/src/lib/logo/library-catalog.ts frontend-customer/src/lib/logo/__tests__/library-catalog.test.ts
git commit -m "feat(logo-studio): ideas gallery renders complete varied logos per brief"
```

---

### Task 3: Stateful step navigation — never silently lose a draft

Adds `draftReady` (Editor nav always reachable once a draft exists), an overwrite confirm on "Use this", and a confirm on "Start over". Frontend-only, all in `logo-studio.tsx`.

**Files:**
- Modify: `frontend-customer/src/components/logo/logo-studio.tsx`

**Interfaces:**
- Consumes: `canUndo` (`@/lib/logo/history`, already imported).
- Produces: `confirmReplaceDraft(): boolean` — Task 4's `handleCreateFromCurated` calls this exact function.

- [ ] **Step 1: Add `draftReady` state**

Below the `ideasReady` declaration (~line 97):

```tsx
const [draftReady, setDraftReady] = useState(false);
```

- [ ] **Step 2: Set it in the session-restore effect**

In the `if (saved) { ... }` branch (~lines 156–168), after `setIdeasReady(true);` add:

```tsx
setDraftReady(saved.step === "editor" || saved.recipe !== null);
```

In the fresh-coach branch, after `setIdeasReady(false);` (~line 176) add:

```tsx
setDraftReady(isRecipe(config.logo_recipe));
```

- [ ] **Step 3: Mark the draft ready on customize**

In `handleCustomize` (~line 260), add as the first line:

```tsx
setDraftReady(true);
```

- [ ] **Step 4: Enable the Editor nav button only with a draft**

In the step-nav `.map` (~line 556), change the `disabled` prop:

```tsx
disabled={
  (s.id === "ideas" && !ideasReady) ||
  (s.id === "editor" && !draftReady)
}
```

- [ ] **Step 5: Add the overwrite guard**

Add above `handleUseCurated`:

```tsx
/** True when it's safe to replace the editor draft: either it has no real
 * edits (undo history empty), or the coach confirmed the overwrite. */
function confirmReplaceDraft(): boolean {
  if (!canUndo(editHistory)) return true;
  return window.confirm(
    "Replace your current draft? Your edits in the editor will be lost.",
  );
}
```

Then add as the FIRST line of `handleUseCurated` (before `setError(null)`):

```tsx
if (!confirmReplaceDraft()) return;
```

- [ ] **Step 6: Confirm on Start over**

In `handleStartOver` (~line 252), add as the first line:

```tsx
if (
  !window.confirm("Start over? This clears your brief and saved progress.")
)
  return;
```

- [ ] **Step 7: Lint + build + logo suite**

Run: `cd frontend-customer && npm run lint && npm run build && npx vitest run src/lib/logo`
Expected: PASS.

> Test coverage note: the guard's decision logic is `canUndo(editHistory)`, which is already unit-tested in `src/lib/logo/__tests__/history.test.ts`; the `window.confirm` wrapper is exercised manually here and by the e2e flows in Task 7 (fresh sessions have an empty undo history, so specs 15/17/18 pass through the guard without a dialog).

- [ ] **Step 8: Manual check**

In the studio: edit something in the Editor (e.g. drag the mark), nav back to Ideas, nav forward to Editor (button enabled, edits intact); click "Use this" on a card → confirm dialog appears; cancel keeps the draft.

- [ ] **Step 9: Commit**

```bash
git add frontend-customer/src/components/logo/logo-studio.tsx
git commit -m "feat(logo-studio): draft-safe step nav — editor always reachable, overwrites confirm"
```

---

### Task 4: One-shot "Create similar" (paid)

`handleCreateFromCurated` stops seeding the chat and instead runs a headless icon-turn (Gemini) → name-turn (Claude) chain, landing a complete draft in the Editor. Includes the two-pass draft→finish loop and a degraded icon-only path.

**Files:**
- Create: `frontend-customer/src/components/logo/create-similar.ts`
- Create: `frontend-customer/src/components/logo/__tests__/create-similar.test.ts`
- Modify: `frontend-customer/src/components/logo/logo-studio.tsx`
- Modify: `frontend-customer/src/components/logo/curated-gallery.tsx`
- Modify: `frontend-customer/src/components/logo/studio-entrance.tsx`

**Interfaces:**
- Consumes: `fetchConverseTurn` / `fetchConverseFinish` (`@/lib/logo/converse-api`), `renderDraftPngs` (`./render-draft`), `composeConverseDesign` / `composeIconPreview` (`@/lib/logo/composer`), `confirmReplaceDraft` (Task 3), `CuratedGallery` props (Task 2).
- Produces: `generateSimilar(logo: CuratedLogo, brief: Brief, brandName: string): Promise<SimilarResult>` where `SimilarResult = { kind: "lockup" | "icon"; design: ConverseDesign; recipe: LogoRecipe; turnsRemaining: number }`; `class SimilarError extends Error`.
- Produces: `CuratedGallery`/`StudioEntrance` prop `generatingFilename: string | null`.

- [ ] **Step 1: Write the failing tests**

Create `frontend-customer/src/components/logo/__tests__/create-similar.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConverseDesign } from "@/lib/logo/composer";

vi.mock("@/lib/logo/converse-api", () => ({
  fetchConverseTurn: vi.fn(),
  fetchConverseFinish: vi.fn(),
}));
vi.mock("../render-draft", () => ({
  renderDraftPngs: vi.fn().mockResolvedValue(["data:image/png;base64,x"]),
}));

import {
  fetchConverseFinish,
  fetchConverseTurn,
} from "@/lib/logo/converse-api";
import { renderDraftPngs } from "../render-draft";
import { SimilarError, generateSimilar } from "../create-similar";

const turnMock = vi.mocked(fetchConverseTurn);
const finishMock = vi.mocked(fetchConverseFinish);

const DESIGN: ConverseDesign = {
  concept: "Lotus",
  rationale: "calm and centered",
  paths: [{ d: "M0 0 L10 10 Z", fill: "mark" }],
  elements: [{ kind: "path" }],
  palette: {
    name: "Calm",
    primary: "#336699",
    secondary: "#88aacc",
    accent: "#ee7755",
    ink: "#112233",
  },
  color_roles: {
    badge: "primary",
    mark: "ink",
    mark2: "secondary",
    mark_accent: "accent",
    text: "ink",
    tagline: "secondary",
  },
  layout: "stacked",
  font: "Poppins",
  typography: { case: "none", tracking: 0, weight: 700 },
};

const LOGO = {
  title: "Lotus",
  filename: "lotus.png",
  prompt: "a lotus mark",
  tags: ["yoga"],
  imageUrl: "http://x/lotus.png",
};
const BRIEF = {
  brandName: "Zeynep Yoga",
  niche: "yoga",
  styleChips: ["Elegant" as const],
  tagline: "Breathe daily",
};

function turnResponse(overrides: Record<string, unknown>) {
  return {
    phase: "final" as const,
    message: "here you go",
    designs: [DESIGN],
    turns_remaining: 7,
    source: "ai" as const,
    ...overrides,
  };
}

beforeEach(() => {
  turnMock.mockReset();
  finishMock.mockReset();
  vi.mocked(renderDraftPngs).mockClear();
});

describe("generateSimilar", () => {
  it("chains icon then name turns into a complete lockup recipe", async () => {
    turnMock
      .mockResolvedValueOnce(turnResponse({}))
      .mockResolvedValueOnce(turnResponse({ turns_remaining: 6 }));
    const result = await generateSimilar(LOGO, BRIEF, "Zeynep Yoga");
    expect(result.kind).toBe("lockup");
    expect(result.recipe.name).toBe("Zeynep Yoga");
    expect(result.recipe.tagline).toBe("Breathe daily");
    expect(result.recipe.layout).toBe("stacked");
    expect(result.turnsRemaining).toBe(6);
    // Icon turn: empty transcript + the curated prompt in the message.
    expect(turnMock.mock.calls[0]![0]).toMatchObject({
      stage: "icon",
      transcript: [],
    });
    expect(turnMock.mock.calls[0]![0].message).toContain("a lotus mark");
    // Name turn: pins the picked icon's geometry.
    expect(turnMock.mock.calls[1]![0]).toMatchObject({
      stage: "name",
      pinned: { mark_paths: DESIGN.paths, mark_elements: DESIGN.elements },
    });
  });

  it("runs the two-pass draft->finish loop and prefers the finished designs", async () => {
    const finalDesign = { ...DESIGN, concept: "Refined" };
    turnMock
      .mockResolvedValueOnce(turnResponse({ phase: "draft", token: "t1" }))
      .mockResolvedValueOnce(turnResponse({ turns_remaining: 6 }));
    finishMock.mockResolvedValueOnce(
      turnResponse({ designs: [finalDesign] }),
    );
    const result = await generateSimilar(LOGO, BRIEF, "Zeynep Yoga");
    expect(renderDraftPngs).toHaveBeenCalledTimes(1);
    expect(finishMock).toHaveBeenCalledWith("t1", ["data:image/png;base64,x"]);
    expect(result.kind).toBe("lockup");
  });

  it("keeps the drafts when the finish pass fails", async () => {
    turnMock
      .mockResolvedValueOnce(turnResponse({ phase: "draft", token: "t1" }))
      .mockResolvedValueOnce(turnResponse({}));
    finishMock.mockRejectedValueOnce(new Error("boom"));
    const result = await generateSimilar(LOGO, BRIEF, "Zeynep Yoga");
    expect(result.kind).toBe("lockup");
  });

  it("degrades to an icon-only recipe when the name turn fails", async () => {
    turnMock
      .mockResolvedValueOnce(turnResponse({}))
      .mockResolvedValueOnce(turnResponse({ source: "quota_exhausted" }));
    const result = await generateSimilar(LOGO, BRIEF, "Zeynep Yoga");
    expect(result.kind).toBe("icon");
    expect(result.recipe.mark.type).toBe("custom");
    expect(result.recipe.tagline).toBe("Breathe daily");
    expect(result.turnsRemaining).toBe(7); // from the icon turn
  });

  it("throws SimilarError when the icon turn is gated", async () => {
    turnMock.mockResolvedValueOnce(turnResponse({ source: "quota_exhausted" }));
    await expect(
      generateSimilar(LOGO, BRIEF, "Zeynep Yoga"),
    ).rejects.toBeInstanceOf(SimilarError);
  });

  it("throws SimilarError when the icon turn returns no designs", async () => {
    turnMock.mockResolvedValueOnce(turnResponse({ designs: [] }));
    await expect(
      generateSimilar(LOGO, BRIEF, "Zeynep Yoga"),
    ).rejects.toBeInstanceOf(SimilarError);
  });
});
```

- [ ] **Step 2: Run it — fails (module missing)**

Run: `cd frontend-customer && npx vitest run src/components/logo/__tests__/create-similar.test.ts`
Expected: FAIL — cannot resolve `../create-similar`.

- [ ] **Step 3: Implement `create-similar.ts`**

Create `frontend-customer/src/components/logo/create-similar.ts` (lives next to `render-draft.tsx` because the two-pass loop rasterizes drafts in the DOM):

```ts
// One-shot "Create similar" for paid coaches: Gemini recreates the curated
// logo's icon (icon stage), Claude designs the name lockup around it (name
// stage), and the caller lands the coach in the Editor with a complete
// draft. Chains the SAME staged converse endpoints + two-pass draft->finish
// loop as studio-chat — no new backend surface. A similar run costs 2 chat
// turns. See docs/superpowers/specs/2026-07-13-logo-studio-curated-v2-design.md.
import {
  composeConverseDesign,
  composeIconPreview,
  type Brief,
  type ConverseDesign,
} from "@/lib/logo/composer";
import {
  fetchConverseFinish,
  fetchConverseTurn,
  type ChatStage,
} from "@/lib/logo/converse-api";
import type { CuratedLogo } from "@/lib/logo/library-catalog";
import type { LogoRecipe } from "@/types/logo";
import { renderDraftPngs } from "./render-draft";

export class SimilarError extends Error {}

export interface SimilarResult {
  /** "lockup" = full AI design; "icon" = the name turn failed after a good
   * icon — the recipe wraps the icon in a clean default lockup instead. */
  kind: "lockup" | "icon";
  design: ConverseDesign;
  recipe: LogoRecipe;
  turnsRemaining: number;
}

const GATE_NOTICES: Record<string, string> = {
  disabled: "AI design isn't available right now.",
  upgrade_required: "Upgrade to design with AI.",
  quota_exhausted: "You've used this month's AI design turns.",
};

type TurnBody = Parameters<typeof fetchConverseTurn>[0];

/** One converse turn with the chat's exact two-pass behavior: draft ->
 * client-side PNG render -> finish, falling back to the drafts on any
 * failure. Throws SimilarError when the turn is gated or comes back empty. */
async function runStage(
  stage: ChatStage,
  body: TurnBody,
  brandName: string,
): Promise<{
  designs: ConverseDesign[];
  turnsRemaining: number;
  assistantText: string;
}> {
  const resp = await fetchConverseTurn(body);
  if (resp.source !== "ai") {
    throw new SimilarError(
      GATE_NOTICES[resp.source] ?? "Couldn't reach the design studio just now.",
    );
  }
  let designs = resp.designs;
  if (resp.phase === "draft" && resp.token) {
    try {
      const images = await renderDraftPngs(resp.designs, stage, brandName);
      const final = await fetchConverseFinish(resp.token, images);
      if (final.source === "ai" && final.designs.length) {
        designs = final.designs;
      }
    } catch {
      // Keep the drafts the client already holds.
    }
  }
  if (!designs.length) {
    throw new SimilarError("The AI couldn't draw this one — try another logo.");
  }
  return {
    designs,
    turnsRemaining: resp.turns_remaining,
    assistantText: resp.message,
  };
}

export async function generateSimilar(
  logo: CuratedLogo,
  brief: Brief,
  brandName: string,
): Promise<SimilarResult> {
  const briefBody = {
    niche: brief.niche,
    style_chips: brief.styleChips,
    vibe: brief.vibe ?? "",
  };
  const iconMessage = `Recreate this icon concept in the same spirit for my brand: ${
    logo.prompt || logo.title
  }`;
  const icon = await runStage(
    "icon",
    {
      stage: "icon",
      brief: briefBody,
      transcript: [],
      pinned: {},
      message: iconMessage,
    },
    brandName,
  );
  const picked = icon.designs[0]!;
  const tagline = brief.tagline ?? "";

  try {
    const name = await runStage(
      "name",
      {
        stage: "name",
        brief: briefBody,
        transcript: [
          { role: "user", text: iconMessage },
          { role: "assistant", text: icon.assistantText },
        ],
        // Same pin shape the chat sends: traced paths verbatim, elements
        // for recompilable geometry.
        pinned: { mark_elements: picked.elements, mark_paths: picked.paths },
        message: `Design the full lockup for "${brandName}" around this mark.`,
      },
      brandName,
    );
    const design = name.designs[0]!;
    return {
      kind: "lockup",
      design,
      recipe: { ...composeConverseDesign(design, brandName), tagline },
      turnsRemaining: name.turnsRemaining,
    };
  } catch {
    // Degraded path: the icon succeeded — still yield a usable draft (icon
    // in a clean default lockup) so the spent turn isn't wasted.
    return {
      kind: "icon",
      design: picked,
      recipe: { ...composeIconPreview(picked, brandName), tagline },
      turnsRemaining: icon.turnsRemaining,
    };
  }
}
```

- [ ] **Step 4: Run the tests — pass**

Run: `cd frontend-customer && npx vitest run src/components/logo/__tests__/create-similar.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Wire it into `logo-studio.tsx`**

1. Add the import:

```tsx
import { generateSimilar, SimilarError } from "./create-similar";
```

2. Remove the `chatSeed` state (~line 105) and its two usages: delete `const [chatSeed, setChatSeed] = useState<string | null>(null);`, delete the `seedPrompt={chatSeed ?? undefined}` prop on `<StudioChat>`, and simplify its `onClose` to `() => setChatOpen(false)`. (The one-shot flow replaces prompt-seeded chats; `StudioChat`'s optional `seedPrompt` prop itself stays.)

3. Add the busy state below `draftReady`:

```tsx
const [similarBusy, setSimilarBusy] = useState<string | null>(null);
```

4. Replace `handleCreateFromCurated` (~lines 452–456) with:

```tsx
async function handleCreateFromCurated(logo: CuratedLogo) {
  if (similarBusy) return;
  if (!confirmReplaceDraft()) return;
  setError(null);
  setSimilarBusy(logo.filename);
  try {
    const result = await generateSimilar(
      logo,
      brief,
      brief.brandName || config.brand_name,
    );
    setLogoAiStatus((s) =>
      s ? { ...s, turns_remaining: result.turnsRemaining } : s,
    );
    if (result.kind === "icon") {
      setError(
        "Your icon is ready, but the AI lockup didn't finish — style the text in the editor.",
      );
    }
    handleCustomize(result.recipe, result.design.elements);
  } catch (err) {
    setError(
      err instanceof SimilarError
        ? err.message
        : "Couldn't design a similar logo — try again.",
    );
  } finally {
    setSimilarBusy(null);
  }
}
```

5. Pass the busy state into `StudioEntrance` (add to the props from Task 2 Step 5):

```tsx
generatingFilename={similarBusy}
```

- [ ] **Step 6: Surface the generating state in `studio-entrance.tsx` and `curated-gallery.tsx`**

`studio-entrance.tsx`: add `generatingFilename: string | null;` to `StudioEntranceProps`, destructure it, and pass `generatingFilename={generatingFilename}` to `<CuratedGallery>`.

`curated-gallery.tsx`:
1. Add to `CuratedGalleryProps` and destructure:

```tsx
generatingFilename: string | null;
```

2. Add `Loader2` to the lucide import.
3. In the card map, derive the states and swap the preview/button block:

```tsx
{shown.map((logo, index) => {
  const generating = generatingFilename === logo.filename;
  const anyGenerating = generatingFilename !== null;
  return (
    <div
      key={logo.filename}
      className="flex flex-col overflow-hidden rounded-xl border"
    >
      <div className="relative flex h-44 items-center justify-center overflow-hidden bg-white p-4">
        <LogoRenderer recipe={previews[index]!} width={220} />
        {generating && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/80">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-xs font-medium text-primary">
              Designing your version…
            </p>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 border-t p-3">
        <p className="truncate text-xs font-medium" title={logo.title}>
          {logo.title}
        </p>
        <Button
          size="sm"
          onClick={() => onUse(logo, previews[index]!)}
          disabled={anyGenerating}
          className="gap-2"
        >
          <Sparkles className="h-4 w-4" /> Use this
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => (aiEligible ? onCreateSimilar(logo) : onUpgrade())}
          disabled={anyGenerating}
          className="gap-1"
        >
          {aiEligible ? (
            <Wand2 className="h-3.5 w-3.5" />
          ) : (
            <Lock className="h-3.5 w-3.5" />
          )}
          Create your own
        </Button>
      </div>
    </div>
  );
})}
```

- [ ] **Step 7: Full frontend verification**

Run: `cd frontend-customer && npx vitest run && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 8: Manual check (needs `GEMINI_API_KEY` + AI-eligible tenant)**

As a paid coach: Ideas → "Create your own" on a card → card shows "Designing your version…" → Editor opens with a new icon + styled name/tagline. Without eligibility the button still routes to upgrade.

- [ ] **Step 9: Commit**

```bash
git add frontend-customer/src/components/logo/create-similar.ts frontend-customer/src/components/logo/__tests__/create-similar.test.ts frontend-customer/src/components/logo/logo-studio.tsx frontend-customer/src/components/logo/curated-gallery.tsx frontend-customer/src/components/logo/studio-entrance.tsx
git commit -m "feat(logo-studio): one-shot Create-similar chains Gemini icon + Claude lockup into the editor"
```

---

### Task 5: Adminkit backend — gallery list mode metadata

Two new `ModelAdmin` attributes serialized into the model meta payload; `CuratedLogoAdmin` opts in. TDD against the platform-admin meta endpoint.

**Files:**
- Modify: `backend/apps/adminkit/options.py`
- Modify: `backend/apps/adminkit/introspection.py`
- Modify: `backend/apps/core/admin_panels.py:358-369` (CuratedLogoAdmin)
- Modify: `backend/apps/adminkit/tests/test_adminkit.py`

**Interfaces:**
- Produces: meta payload keys `list_mode: "table" | "gallery"` and `gallery_image_field: str` — Task 6's frontend types mirror these exact names.

- [ ] **Step 1: Write the failing test**

Add to `backend/apps/adminkit/tests/test_adminkit.py`, next to `test_image_field_schema` (uses the existing `superuser` fixture and `make_client` helper):

```python
def test_gallery_list_mode_meta(superuser):
    client = make_client(superuser)
    meta = client.get("/api/v1/platform-admin/curated-logos/meta/").json()
    assert meta["list_mode"] == "gallery"
    assert meta["gallery_image_field"] == "image_key"
    # Every other admin stays a table.
    meta = client.get("/api/v1/platform-admin/platform-plans/meta/").json()
    assert meta["list_mode"] == "table"
    assert meta["gallery_image_field"] == ""
```

- [ ] **Step 2: Run it — fails**

Run: `docker compose exec -T django pytest apps/adminkit/tests/test_adminkit.py::test_gallery_list_mode_meta -v`
Expected: FAIL — `KeyError: 'list_mode'`.

- [ ] **Step 3: Add the attributes to `ModelAdmin`**

In `backend/apps/adminkit/options.py`, after the `page_size: int = 20` line in the `# ---- list ----` block, add:

```python
    # ---- list rendering ----
    # "table" (default) or "gallery". Gallery renders image cards plus a
    # drop-a-PNG -> JSON-record create flow instead of the table + form.
    list_mode: str = "table"
    # Gallery mode: the image field shown on cards (name one of image_fields;
    # it must also be in list_display so rows carry its {key, url} value).
    gallery_image_field: str = ""
```

- [ ] **Step 4: Serialize them in `model_meta`**

In `backend/apps/adminkit/introspection.py`, in the `model_meta` return dict (after `"page_size": admin.page_size,`), add:

```python
        "list_mode": admin.list_mode,
        "gallery_image_field": admin.gallery_image_field,
```

- [ ] **Step 5: Opt `CuratedLogoAdmin` in**

In `backend/apps/core/admin_panels.py`, add to `CuratedLogoAdmin` (after `image_upload_prefix = "curated-logos"`):

```python
    list_mode = "gallery"
    gallery_image_field = "image_key"
```

- [ ] **Step 6: Run the adminkit suite — passes**

Run: `docker compose exec -T django pytest apps/adminkit/tests/test_adminkit.py -v`
Expected: PASS (all tests, including the new one).

- [ ] **Step 7: Full backend suite + lint**

Run: `make test && make lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/adminkit/options.py backend/apps/adminkit/introspection.py backend/apps/core/admin_panels.py backend/apps/adminkit/tests/test_adminkit.py
git commit -m "feat(adminkit): opt-in gallery list mode metadata (curated-logos)"
```

---

### Task 6: Admin-kit frontend — gallery view + drop → JSON modal

`model-page.tsx` branches on `meta.list_mode === "gallery"`: a card grid with a whole-surface PNG drop zone (plus an Add button wrapping a hidden file input) replaces the table, and a JSON-record modal replaces the slide-over form for create/edit/delete.

**Files:**
- Modify: `packages/shared/src/admin-kit/types.ts`
- Create: `packages/shared/src/admin-kit/gallery-view.tsx`
- Create: `packages/shared/src/admin-kit/json-record-modal.tsx`
- Modify: `packages/shared/src/admin-kit/model-page.tsx`

**Interfaces:**
- Consumes: meta keys `list_mode` / `gallery_image_field` (Task 5), `createAdminClient` CRUD methods, `/api/v1/platform/upload/` via the image field schema's `upload_url`/`upload_prefix`.
- Produces: `GalleryView({ meta, rows, uploading, uploadError, onCardClick, onFile })`; `JsonRecordModal({ meta, target, rows, busy, serverError, onSave, onDelete, onClose })` with `type GalleryTarget = { mode: "create"; image: ImageValue } | { mode: "edit"; row: Row }`.

- [ ] **Step 1: Extend the frontend meta types**

In `packages/shared/src/admin-kit/types.ts`, add to the `ModelMeta` interface (after `page_size: number;`):

```ts
  /** "table" (default) or "gallery" — gallery renders image cards plus the
   * drop-a-PNG → JSON-record flow instead of the table + slide-over form. */
  list_mode?: "table" | "gallery";
  /** Gallery mode: which image field the cards render. */
  gallery_image_field?: string;
```

- [ ] **Step 2: Create `gallery-view.tsx`**

Create `packages/shared/src/admin-kit/gallery-view.tsx`:

```tsx
"use client";

// Shared admin-kit (schema-driven admin renderer).
// Gallery list mode: image cards + a whole-surface drop-a-PNG-to-add zone.
// Presentational — upload wiring, CRUD and the JSON modal live in ModelPage.

import { useRef, useState } from "react";
import { ImageIcon, ImagePlus, Inbox, Loader2 } from "lucide-react";

import type { ImageValue, ModelMeta, Row, RowValue } from "./types";

import { KitButton } from "./primitives";

function imageOf(value: RowValue | undefined): ImageValue | null {
  return value &&
    typeof value === "object" &&
    "key" in value &&
    "url" in value
    ? (value as ImageValue)
    : null;
}

export function GalleryView({
  meta,
  rows,
  uploading,
  uploadError,
  onCardClick,
  onFile,
}: {
  meta: ModelMeta;
  rows: Row[];
  uploading: boolean;
  uploadError: string;
  onCardClick: (row: Row) => void;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const imageField = meta.gallery_image_field ?? "";

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      className={`space-y-4 rounded-lg p-4 ${dragOver ? "ring-2 ring-[hsl(var(--primary))]" : ""}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <KitButton
          variant="primary"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ImagePlus className="h-4 w-4" />
          )}
          Add PNG
        </KitButton>
        <p className="text-xs text-muted-foreground">
          …or drag &amp; drop a PNG anywhere here.
        </p>
        {uploadError && (
          <p className="text-xs text-destructive">{uploadError}</p>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <Inbox className="h-8 w-8" />
          <p className="text-sm">
            No {meta.label_plural.toLowerCase()} yet — drop a PNG to add the
            first one.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {rows.map((row) => {
            const pk = String(row[meta.pk_field]);
            const image = imageOf(row[imageField]);
            const title = String(row.title ?? pk);
            const enabled = "enabled" in row ? Boolean(row.enabled) : null;
            return (
              <button
                key={pk}
                type="button"
                onClick={() => onCardClick(row)}
                className="flex flex-col overflow-hidden rounded-xl border text-left transition-colors hover:border-[hsl(var(--primary))]"
              >
                <div className="flex h-32 items-center justify-center bg-white p-3">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={image.url}
                      alt={title}
                      className="max-h-full max-w-full object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 border-t p-2.5">
                  <span className="truncate text-xs font-medium" title={title}>
                    {title}
                  </span>
                  {enabled !== null && (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        enabled
                          ? "bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {enabled ? "Live" : "Off"}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `json-record-modal.tsx`**

Create `packages/shared/src/admin-kit/json-record-modal.tsx`:

```tsx
"use client";

// Shared admin-kit (schema-driven admin renderer).
// Gallery mode's create/edit surface: an image preview + ONE JSON textarea
// for all editable fields — a bulk-curation workflow, not a field form.

import { useState } from "react";
import { Loader2 } from "lucide-react";

import type { FieldSchema, ImageValue, ModelMeta, Row, RowValue } from "./types";

import { KitButton, KitTextarea } from "./primitives";

export type GalleryTarget =
  | { mode: "create"; image: ImageValue }
  | { mode: "edit"; row: Row };

function editableFields(meta: ModelMeta): FieldSchema[] {
  return meta.form_fields.filter(
    (f) =>
      !f.read_only &&
      f.type !== "image" &&
      f.name !== (meta.gallery_image_field ?? ""),
  );
}

function defaultFor(field: FieldSchema): unknown {
  if (field.default !== undefined) return field.default;
  switch (field.type) {
    case "boolean":
      return false;
    case "integer":
    case "decimal":
      return 0;
    default:
      return "";
  }
}

function titleFromFilename(key: string): string {
  const base = key.split("/").pop() ?? "";
  const stem = base.replace(/\.[a-z0-9]+$/i, "");
  return stem.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** The prefilled JSON the superadmin edits. Create mode seeds title from the
 * uploaded filename, position past the largest on this page, enabled=true. */
export function initialJson(
  meta: ModelMeta,
  target: GalleryTarget,
  rows: Row[],
): string {
  const record: Record<string, unknown> = {};
  for (const field of editableFields(meta)) {
    record[field.name] =
      target.mode === "edit"
        ? (target.row[field.name] ?? defaultFor(field))
        : defaultFor(field);
  }
  if (target.mode === "create") {
    if ("title" in record) record.title = titleFromFilename(target.image.key);
    if ("position" in record) {
      const max = Math.max(0, ...rows.map((r) => Number(r.position ?? 0)));
      record.position = max + 1;
    }
    if ("enabled" in record) record.enabled = true;
  }
  return JSON.stringify(record, null, 2);
}

/** Parse + validate the textarea: must be a JSON object whose keys are all
 * editable fields. Returns {data} or {error} — never throws. */
export function parseRecord(
  meta: ModelMeta,
  text: string,
): { data?: Record<string, unknown>; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return {
      error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { error: "Expected a JSON object." };
  }
  const allowed = new Set(editableFields(meta).map((f) => f.name));
  const unknown = Object.keys(parsed).filter((k) => !allowed.has(k));
  if (unknown.length) {
    return { error: `Unknown field(s): ${unknown.join(", ")}` };
  }
  return { data: parsed as Record<string, unknown> };
}

function imageOf(value: RowValue | undefined): ImageValue | null {
  return value &&
    typeof value === "object" &&
    "key" in value &&
    "url" in value
    ? (value as ImageValue)
    : null;
}

export function JsonRecordModal({
  meta,
  target,
  rows,
  busy,
  serverError,
  onSave,
  onDelete,
  onClose,
}: {
  meta: ModelMeta;
  target: GalleryTarget;
  rows: Row[];
  busy: boolean;
  serverError: string;
  onSave: (data: Record<string, unknown>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(() => initialJson(meta, target, rows));
  const [parseError, setParseError] = useState("");
  const image =
    target.mode === "create"
      ? target.image
      : imageOf(target.row[meta.gallery_image_field ?? ""]);

  const save = () => {
    const { data, error } = parseRecord(meta, text);
    if (error) {
      setParseError(error);
      return;
    }
    setParseError("");
    onSave(data!);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-full w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-lg border bg-card p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-foreground">
          {target.mode === "create" ? `New ${meta.label}` : `Edit ${meta.label}`}
        </h2>
        {image && (
          <div className="flex items-center justify-center rounded-md border bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.url}
              alt={image.key.split("/").pop() || image.key}
              className="max-h-32 object-contain"
            />
          </div>
        )}
        <KitTextarea
          aria-label="Record JSON"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          rows={10}
          className="font-mono text-xs"
        />
        {(parseError || serverError) && (
          <p className="text-xs text-destructive">
            {parseError || serverError}
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          {target.mode === "edit" ? (
            <KitButton
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Delete this ${meta.label.toLowerCase()}?`))
                  onDelete();
              }}
            >
              Delete
            </KitButton>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <KitButton onClick={onClose} disabled={busy}>
              Cancel
            </KitButton>
            <KitButton variant="primary" onClick={save} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </KitButton>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Branch `model-page.tsx` on gallery mode**

In `packages/shared/src/admin-kit/model-page.tsx`:

1. Add imports:

```tsx
import { GalleryView } from "./gallery-view";
import { JsonRecordModal, type GalleryTarget } from "./json-record-modal";
```

2. Add gallery state below the `form` state (~line 84):

```tsx
const [galleryTarget, setGalleryTarget] = useState<GalleryTarget | null>(null);
const [galleryUploading, setGalleryUploading] = useState(false);
const [galleryUploadError, setGalleryUploadError] = useState("");
const [galleryBusy, setGalleryBusy] = useState(false);
const [galleryServerError, setGalleryServerError] = useState("");
```

3. Add the handlers after `runRowAction` (~line 218):

```tsx
// Gallery mode: upload the dropped/picked PNG through the image field's own
// endpoint, then open the JSON modal prefilled for a create.
const galleryUpload = async (file: File) => {
  if (!meta) return;
  const imageFieldSchema = meta.form_fields.find(
    (f) => f.name === meta.gallery_image_field,
  );
  if (!imageFieldSchema?.upload_url) return;
  setGalleryUploading(true);
  setGalleryUploadError("");
  try {
    const body = new FormData();
    body.append("file", file);
    if (imageFieldSchema.upload_prefix)
      body.append("prefix", imageFieldSchema.upload_prefix);
    const res = await fetch(imageFieldSchema.upload_url, {
      method: "POST",
      body,
      credentials: "same-origin",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        detail?: string;
      } | null;
      throw new Error(data?.detail ?? `Upload failed (${res.status}).`);
    }
    const image = (await res.json()) as { key: string; url: string };
    setGalleryServerError("");
    setGalleryTarget({ mode: "create", image });
  } catch (err) {
    setGalleryUploadError(
      err instanceof Error ? err.message : "Upload failed.",
    );
  } finally {
    setGalleryUploading(false);
  }
};

const gallerySave = async (data: Record<string, unknown>) => {
  if (!meta || !galleryTarget) return;
  setGalleryBusy(true);
  setGalleryServerError("");
  try {
    if (galleryTarget.mode === "create") {
      await client.create(modelKey, {
        ...data,
        [meta.gallery_image_field ?? ""]: galleryTarget.image.key,
      });
      showBanner("success", `${meta.label} created.`);
    } else {
      await client.update(
        modelKey,
        String(galleryTarget.row[meta.pk_field]),
        data,
      );
      showBanner("success", `${meta.label} updated.`);
    }
    setGalleryTarget(null);
    refresh();
  } catch (err) {
    setGalleryServerError(
      err instanceof AdminKitError
        ? err.detail ||
            Object.entries(err.fieldErrors)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ")
        : "Save failed.",
    );
  } finally {
    setGalleryBusy(false);
  }
};

const galleryDelete = async () => {
  if (!meta || galleryTarget?.mode !== "edit") return;
  setGalleryBusy(true);
  setGalleryServerError("");
  try {
    await client.destroy(modelKey, String(galleryTarget.row[meta.pk_field]));
    showBanner("success", `${meta.label} deleted.`);
    setGalleryTarget(null);
    refresh();
  } catch (err) {
    setGalleryServerError(
      err instanceof AdminKitError ? err.detail : "Delete failed.",
    );
  } finally {
    setGalleryBusy(false);
  }
};
```

4. Add the mode flag next to `bulkActions` (~line 236):

```tsx
const galleryMode = meta.list_mode === "gallery";
```

5. Hide the header "New" button in gallery mode (the Add-PNG flow replaces it) — change the condition (~line 256):

```tsx
{meta.can_create && !galleryMode && (
```

6. In the list card (~lines 359–397), render the gallery instead of the table:

```tsx
<div className="rounded-lg border bg-card">
  {page === null ? (
    <KitSkeletonRows />
  ) : galleryMode ? (
    <GalleryView
      meta={meta}
      rows={page.results}
      uploading={galleryUploading}
      uploadError={galleryUploadError}
      onCardClick={(row) => {
        setGalleryServerError("");
        setGalleryTarget({ mode: "edit", row });
      }}
      onFile={galleryUpload}
    />
  ) : (
    <ModelList
      meta={meta}
      page={page}
      ordering={ordering}
      onOrdering={(next) => {
        setOrdering(next);
        setPageNum(1);
      }}
      selected={selected}
      onToggleRow={(pk) =>
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(pk)) next.delete(pk);
          else next.add(pk);
          return next;
        })
      }
      onToggleAll={() =>
        setSelected((prev) => {
          const pks = page.results.map((row) =>
            String(row[meta.pk_field]),
          );
          return pks.every((pk) => prev.has(pk))
            ? new Set()
            : new Set(pks);
        })
      }
      onRowClick={(row) => setForm({ mode: "edit", row })}
      onRowAction={runRowAction}
      rowActions={rowActions}
      selectable={selectable}
      busyRowAction={busyRowAction}
    />
  )}
</div>
```

(The `ModelList` props are byte-identical to the current file — only the `galleryMode ?` branch is new.)

7. Render the modal next to the existing `{form && ...}` block:

```tsx
{galleryTarget && meta && page && (
  <JsonRecordModal
    meta={meta}
    target={galleryTarget}
    rows={page.results}
    busy={galleryBusy}
    serverError={galleryServerError}
    onSave={gallerySave}
    onDelete={galleryDelete}
    onClose={() => setGalleryTarget(null)}
  />
)}
```

- [ ] **Step 5: Build both frontends (shared module compiles in both)**

Run: `cd frontend-customer && npm run lint && npm run build`
Run: `cd ../frontend-main && npm run lint && npm run build`
Expected: PASS in both (frontend-main is what serves `/admin/m/curated-logos`).

- [ ] **Step 6: Manual check**

As superadmin, open `http://localhost/admin/m/curated-logos`: gallery grid of image cards renders (search/filters intact); drop a PNG → JSON modal with prefilled `{"title": ..., "prompt": "", "tags": "", "position": N, "enabled": true}` → Save → new card appears (and `mark_paths` auto-traces server-side); click a card → edit modal with current values; Delete removes it. Verify another model (e.g. `/admin/m/tenants`) still renders the classic table.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/admin-kit/types.ts packages/shared/src/admin-kit/gallery-view.tsx packages/shared/src/admin-kit/json-record-modal.tsx packages/shared/src/admin-kit/model-page.tsx
git commit -m "feat(adminkit): gallery list mode with drop-a-PNG -> JSON-record create/edit"
```

---

### Task 7: e2e updates + full verification

Updates the three affected specs for the new UI and runs everything.

**Files:**
- Modify: `e2e/specs/15-logo-studio.spec.ts`
- Modify: `e2e/specs/17-logo-curated-library.spec.ts`
- Modify: `e2e/specs/18-curated-library-admin.spec.ts`

**Interfaces:**
- Consumes: the finished coach flow (Tasks 1–4) and admin gallery (Tasks 5–6).

- [ ] **Step 1: `15-logo-studio.spec.ts` — assert full-logo cards**

After the existing `await expect(dialog.getByText("Ready-made logos")).toBeVisible();` line, add:

```ts
// Full-logo cards: the coach's brand name is painted INSIDE the previews
// (SVG text), proving the gallery composes complete logos, not bare icons.
const brand = (await nameInput.inputValue()) || "Demo Yoga";
await expect(
  dialog.locator("svg").getByText(new RegExp(brand, "i")).first(),
).toBeVisible({ timeout: 15_000 });
```

(Case-insensitive regex because tag-biased profiles may render the name upper-cased.)

- [ ] **Step 2: `17-logo-curated-library.spec.ts` — tolerate traced picks + fix the stale header comment**

1. Replace the stale header comment block (lines 1–7) with:

```ts
// e2e/specs/17-logo-curated-library.spec.ts
//
// Coach reaches the Ideas step of the Logo Studio, picks a curated
// ready-made logo (rendered as a complete logo preview), and saves it.
// The catalog is served by /api/v1/logos/curated/; traced rows land as
// vector (custom) marks, untraced ones as uploaded image marks. See
// 15-logo-studio.spec.ts for the full brief->ideas->editor walk.
```

2. Replace the mark-type assertion:

```ts
// Traced curated art lands as a recolorable vector mark; untraced PNGs as
// an uploaded image mark — both are valid picks.
expect(["custom", "image"]).toContain(body.logo_recipe.mark.type);
```

- [ ] **Step 3: Rewrite `18-curated-library-admin.spec.ts` for the gallery**

Replace the superadmin sections (keep the coach middle section as-is). The full new spec:

```ts
// e2e/specs/18-curated-library-admin.spec.ts
//
// Superadmin curates the logo library through the adminkit GALLERY mode:
// drop/pick a PNG -> prefilled JSON modal -> save (trace-on-save runs
// server-side); a coach then sees the new logo in the Logo Studio's Ideas
// gallery; the superadmin deletes it again via the card's JSON modal
// (idempotent re-runs). Assumes the dev stack is seeded (make seed).

import path from "node:path";
import { test, expect } from "@playwright/test";
import { coachContext, superadminContext, MAIN, TENANT } from "../helpers/auth";

const FIXTURE_PNG = path.resolve(
  __dirname,
  "../../frontend-customer/public/logos/colorful_lotus_meditation_logo.png",
);
const TITLE = "E2E Curated Logo";

test("superadmin adds a curated logo via the gallery; coach sees it", async ({
  browser,
}) => {
  // --- superadmin: create via drop -> JSON modal -------------------------
  const admin = await superadminContext(browser);
  const adminPage = await admin.newPage();
  await adminPage.goto(`${MAIN}/admin/m/curated-logos`);

  // Gallery mode: the hidden file input behind the "Add PNG" button is the
  // accessible/e2e path for the drop zone.
  await expect(
    adminPage.getByRole("button", { name: "Add PNG" }),
  ).toBeVisible();
  await adminPage.locator('input[type="file"]').setInputFiles(FIXTURE_PNG);

  // Upload finished -> JSON modal opens with the image preview and the
  // prefilled record template.
  const modal = adminPage.locator("div.fixed.inset-0.z-50");
  const textarea = modal.getByLabel("Record JSON");
  await expect(textarea).toBeVisible({ timeout: 15_000 });

  const record = JSON.parse(await textarea.inputValue());
  record.title = TITLE;
  record.prompt = "an e2e test logo prompt";
  record.tags = "e2e, yoga";
  await textarea.fill(JSON.stringify(record, null, 2));
  await modal.getByRole("button", { name: "Save", exact: true }).click();
  await expect(modal).toBeHidden({ timeout: 10_000 });

  // The new card is findable via search (seeded catalog spans pages).
  const searchBox = adminPage.getByPlaceholder(/search curated logos/i);
  await searchBox.fill(TITLE);
  await expect(adminPage.getByText(TITLE)).toBeVisible({ timeout: 10_000 });

  // --- coach: the new logo appears in the Ideas gallery ------------------
  const coach = await coachContext(browser);
  const coachPage = await coach.newPage();
  await coachPage.goto(`${TENANT}/admin/design?studio=1`);
  const dialog = coachPage.getByRole("dialog");
  const briefHeading = dialog.getByText("Tell us about your brand");
  if (!(await briefHeading.isVisible())) {
    await dialog.getByRole("button", { name: "Get new ideas" }).click();
  }
  const nameInput = dialog.getByLabel("Brand name");
  if (!(await nameInput.inputValue())) await nameInput.fill("Demo Yoga");
  await dialog.getByLabel("What do you teach?").fill("yoga");
  await dialog.getByRole("button", { name: "Elegant" }).click();
  await dialog.getByRole("button", { name: "Show my logo ideas" }).click();

  await expect(dialog.getByText(TITLE)).toBeVisible({ timeout: 15_000 });
  await coach.close();

  // --- superadmin: delete via the card's JSON modal (idempotent re-runs) --
  await adminPage.getByText(TITLE).first().click();
  await expect(textarea).toBeVisible();
  adminPage.once("dialog", (d) => d.accept()); // window.confirm on delete
  await modal.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(modal).toBeHidden({ timeout: 10_000 });
  await expect(adminPage.getByText(TITLE, { exact: true })).toBeHidden({
    timeout: 10_000,
  });
  await admin.close();
});
```

- [ ] **Step 4: Run the three specs**

With the dev stack up and seeded, run: `make e2e` (or target specs 15/17/18 if the harness supports filtering).
Expected: `15-logo-studio`, `17-logo-curated-library`, `18-curated-library-admin` PASS.

- [ ] **Step 5: Full verification sweep**

Run: `cd frontend-customer && npx vitest run && npm run build && npm run lint`
Run: `cd ../frontend-main && npm run build && npm run lint`
Run: `make test && make lint`
Expected: everything PASS.

- [ ] **Step 6: Commit**

```bash
git add e2e/specs/15-logo-studio.spec.ts e2e/specs/17-logo-curated-library.spec.ts e2e/specs/18-curated-library-admin.spec.ts
git commit -m "test(e2e): full-logo ideas cards + gallery-mode curated admin"
```

---

## Notes for the implementer

- **Why `create-similar.ts` lives in `components/logo/`** — its two-pass loop calls `renderDraftPngs`, which rasterizes React trees in the DOM; keeping it beside `render-draft.tsx` avoids a lib→components dependency. Its tests mock both the API client and the rasterizer, so they run in plain jsdom.
- **Quota semantics** — a similar run spends 2 chat turns (icon + name). `turns_remaining` from the last successful turn response updates `logoAiStatus`; the backend enforces the real quota either way.
- **Preview `photo_id: ""`** — gallery previews of untraced logos use the raw `imageUrl`; the editor only ever receives an image mark with a real `photo_id` (swapped in by `handleUseCurated` after upload), so saved recipes stay valid.
- **`position` prefill uses the current page's rows** — good enough for a curation UI (superadmin can edit the number in the JSON); don't add a max-position endpoint for this.
- **Gallery mode is generic but conservative** — cards read `row.title` / `row.enabled` with graceful fallbacks (pk / no badge), so a future model can opt in without new schema; only `CuratedLogoAdmin` opts in now.
