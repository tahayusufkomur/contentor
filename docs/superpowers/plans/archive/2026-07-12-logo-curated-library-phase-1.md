# Logo Curated Library — Phase 1 (Coach-facing, files-first) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give coaches a niche-matched gallery of hand-picked logo illustrations they can use for free, or riff off with AI (paid), as the new star of the Logo Studio's free experience — reading the existing `public/logos/` catalog directly, no backend.

**Architecture:** Frontend-only. The curated library is the committed static catalog at `frontend-customer/public/logos/` (`logo_meta.json` + PNGs). A loader fetches and ranks it by the tenant's niche (`config.niche`). The studio gains a Browse entrance with two doors (Ready-made logos / Design with AI); the curated gallery shows PNG cards with tag-derived filter chips. **Use this** (free) fetches the PNG, uploads it via the existing image-mark path, and lands the coach in the Editor with an editable wordmark around the pristine illustration. **Create your own with AI** (paid) opens the existing chat seeded with the curated logo's generation prompt. The old wall-of-24 is demoted to a collapsible section.

**Tech Stack:** Next.js 14 (App Router) + Tailwind, vitest + @testing-library/react, Playwright e2e.

## Global Constraints

- **Files-first, no DB, no backend changes.** The read side is the committed static catalog
  `frontend-customer/public/logos/logo_meta.json` (+ PNGs at `/logos/<filename>`). Verbatim from spec §1/§7.
- Curated library is **fully free** (browse/pick/edit/save any tier). Only "Create your own
  with AI" and Door 2 (Design with AI) are paid, gated on `LogoAiStatus.eligible` with the
  existing upsell (link `/admin/billing/subscription`).
- These are **finished illustrations** → **image-mark** logos, never traced. No recipe-schema,
  export, or brand-kit changes.
- Reuse existing machinery: `uploadPng` / `imageToDataUrl` (image-mark upload), `LogoRenderer`
  (editor preview), `StudioChat` (AI), `StudioWall` (demoted wall).
- TDD: failing test first every task. Frequent commits. Pre-commit must pass with zero
  errors/warnings/security issues before each commit.
- Frontend commands run in `frontend-customer/`: `npx vitest run <path>`, `npx tsc --noEmit`,
  `npx next build`. If the container desyncs after edits: `docker compose restart nextjs-customer`.

---

### Task 1: Catalog loader + niche ranking

**Files:**
- Create: `frontend-customer/src/lib/logo/library-catalog.ts`
- Test: `frontend-customer/src/lib/logo/__tests__/library-catalog.test.ts`

**Interfaces:**
- Produces:
  - `interface CuratedLogo { title: string; filename: string; prompt: string; tags: string[]; imageUrl: string }`
  - `fetchCuratedCatalog(): Promise<CuratedLogo[]>` — fetches `/logos/logo_meta.json`, splits `tags`, computes `imageUrl`.
  - `rankByNiche(logos: CuratedLogo[], niche: string): CuratedLogo[]` — tag-word niche match first, stable otherwise.

- [ ] **Step 1: Write the failing test**

```ts
// frontend-customer/src/lib/logo/__tests__/library-catalog.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCuratedCatalog, rankByNiche } from "../library-catalog";

afterEach(() => vi.restoreAllMocks());

const RAW = [
  { title: "Yoga", filename: "yoga.png", prompt: "a yoga logo", tags: "yoga, wellness, zen" },
  { title: "Chef", filename: "chef.png", prompt: "a chef logo", tags: "cooking, food" },
];

describe("library-catalog", () => {
  it("fetches, splits tags, and builds imageUrl", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => RAW }));
    const logos = await fetchCuratedCatalog();
    expect(fetch).toHaveBeenCalledWith("/logos/logo_meta.json");
    expect(logos[0]).toMatchObject({
      title: "Yoga",
      imageUrl: "/logos/yoga.png",
      tags: ["yoga", "wellness", "zen"],
    });
  });

  it("returns [] when the catalog is missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await fetchCuratedCatalog()).toEqual([]);
  });

  it("ranks tag-matching logos first for the niche", () => {
    const logos = RAW.map((r) => ({ ...r, tags: r.tags.split(",").map((t) => t.trim()), imageUrl: `/logos/${r.filename}` }));
    const ranked = rankByNiche(logos, "wellness");
    expect(ranked.map((l) => l.title)).toEqual(["Yoga", "Chef"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (in `frontend-customer/`): `npx vitest run src/lib/logo/__tests__/library-catalog.test.ts`
Expected: FAIL (cannot resolve `../library-catalog`)

- [ ] **Step 3: Write the loader**

```ts
// frontend-customer/src/lib/logo/library-catalog.ts
export interface CuratedLogo {
  title: string;
  filename: string;
  prompt: string;
  tags: string[];
  imageUrl: string;
}

interface RawEntry {
  title: string;
  filename: string;
  prompt: string;
  tags: string;
}

export async function fetchCuratedCatalog(): Promise<CuratedLogo[]> {
  try {
    const res = await fetch("/logos/logo_meta.json");
    if (!res.ok) return [];
    const raw = (await res.json()) as RawEntry[];
    return raw.map((e) => ({
      title: e.title,
      filename: e.filename,
      prompt: e.prompt ?? "",
      tags: (e.tags ?? "")
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
      imageUrl: `/logos/${e.filename}`,
    }));
  } catch {
    return [];
  }
}

export function rankByNiche(logos: CuratedLogo[], niche: string): CuratedLogo[] {
  const key = (niche || "").trim().toLowerCase();
  if (!key) return logos;
  // Stable partition: tag-matchers first, catalog order preserved within each group.
  const match = logos.filter((l) => l.tags.includes(key));
  const rest = logos.filter((l) => !l.tags.includes(key));
  return [...match, ...rest];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/logo/__tests__/library-catalog.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/lib/logo/library-catalog.ts frontend-customer/src/lib/logo/__tests__/library-catalog.test.ts
git commit -m "feat(logo-library): catalog loader + niche ranking"
```

---

### Task 2: `CuratedGallery` component

**Files:**
- Create: `frontend-customer/src/components/logo/curated-gallery.tsx`
- Test: `frontend-customer/src/components/logo/__tests__/curated-gallery.test.tsx`

**Interfaces:**
- Consumes: `CuratedLogo` (Task 1).
- Produces: `CuratedGallery` with props:

```ts
interface CuratedGalleryProps {
  logos: CuratedLogo[];
  loading: boolean;
  aiEligible: boolean; // logoAiStatus?.eligible ?? false
  onUse: (logo: CuratedLogo) => void;         // free
  onCreateSimilar: (logo: CuratedLogo) => void; // paid
  onUpgrade: () => void;                        // shown when !aiEligible
}
```

Behavior: responsive grid; each card shows `<img src={logo.imageUrl} alt={logo.title}>` with
the title. Tag filter chips (union of all tags; click filters, OR). **Use this** always calls
`onUse`; **Create your own with AI** calls `onCreateSimilar` when `aiEligible`, else `onUpgrade`.
Empty state when no logos and not loading.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend-customer/src/components/logo/__tests__/curated-gallery.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CuratedGallery } from "../curated-gallery";
import type { CuratedLogo } from "@/lib/logo/library-catalog";

const logos: CuratedLogo[] = [
  { title: "Yoga", filename: "yoga.png", prompt: "p1", tags: ["yoga", "zen"], imageUrl: "/logos/yoga.png" },
  { title: "Chef", filename: "chef.png", prompt: "p2", tags: ["cooking"], imageUrl: "/logos/chef.png" },
];

function setup(over = {}) {
  const props = {
    logos, loading: false, aiEligible: true,
    onUse: vi.fn(), onCreateSimilar: vi.fn(), onUpgrade: vi.fn(),
    ...over,
  };
  render(<CuratedGallery {...props} />);
  return props;
}

describe("CuratedGallery", () => {
  it("renders PNG cards and uses the picked logo", () => {
    const p = setup();
    expect(screen.getByAltText("Yoga")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /use this/i })[0]);
    expect(p.onUse).toHaveBeenCalledWith(logos[0]);
  });

  it("routes the paid action to onUpgrade when not eligible", () => {
    const p = setup({ aiEligible: false });
    fireEvent.click(screen.getAllByRole("button", { name: /create your own/i })[0]);
    expect(p.onCreateSimilar).not.toHaveBeenCalled();
    expect(p.onUpgrade).toHaveBeenCalled();
  });

  it("filters by tag chip", () => {
    setup();
    expect(screen.getByAltText("Chef")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^zen$/i }));
    expect(screen.queryByAltText("Chef")).not.toBeInTheDocument();
    expect(screen.getByAltText("Yoga")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/logo/__tests__/curated-gallery.test.tsx`
Expected: FAIL (cannot resolve `../curated-gallery`)

- [ ] **Step 3: Write the component**

```tsx
// frontend-customer/src/components/logo/curated-gallery.tsx
"use client";

import { useMemo, useState } from "react";
import { Lock, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CuratedLogo } from "@/lib/logo/library-catalog";

interface CuratedGalleryProps {
  logos: CuratedLogo[];
  loading: boolean;
  aiEligible: boolean;
  onUse: (logo: CuratedLogo) => void;
  onCreateSimilar: (logo: CuratedLogo) => void;
  onUpgrade: () => void;
}

export function CuratedGallery({
  logos,
  loading,
  aiEligible,
  onUse,
  onCreateSimilar,
  onUpgrade,
}: CuratedGalleryProps) {
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const tags = useMemo(
    () => Array.from(new Set(logos.flatMap((l) => l.tags))).sort(),
    [logos],
  );
  const shown = activeTag ? logos.filter((l) => l.tags.includes(activeTag)) : logos;

  if (loading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading ready-made logos…</p>;
  }
  if (!logos.length) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        No ready-made logos yet — try Design with AI or the auto-generated ideas below.
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
        {shown.map((logo) => (
          <div key={logo.filename} className="flex flex-col overflow-hidden rounded-xl border">
            <div className="flex items-center justify-center bg-white p-3">
              {/* Plain <img>: these are static public PNGs, not next/image-optimized. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logo.imageUrl}
                alt={logo.title}
                className="h-40 w-full object-contain"
                loading="lazy"
              />
            </div>
            <div className="flex flex-col gap-2 border-t p-3">
              <p className="truncate text-xs font-medium" title={logo.title}>
                {logo.title}
              </p>
              <Button size="sm" onClick={() => onUse(logo)} className="gap-2">
                <Sparkles className="h-4 w-4" /> Use this
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => (aiEligible ? onCreateSimilar(logo) : onUpgrade())}
                className="gap-1"
              >
                {aiEligible ? <Wand2 className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/logo/__tests__/curated-gallery.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/components/logo/curated-gallery.tsx frontend-customer/src/components/logo/__tests__/curated-gallery.test.tsx
git commit -m "feat(logo-library): CuratedGallery (PNG cards, tag filters, gated action)"
```

---

### Task 3: `StudioEntrance` (two doors + gallery + demoted wall)

**Files:**
- Create: `frontend-customer/src/components/logo/studio-entrance.tsx`
- Test: `frontend-customer/src/components/logo/__tests__/studio-entrance.test.tsx`

**Interfaces:**
- Consumes: `CuratedGallery` (Task 2), `StudioWall` (existing), `CuratedLogo` (Task 1), `LogoAiStatus` (`@/lib/logo/converse-api`), `LogoRecipe` (`@/types/logo`).
- Produces: `StudioEntrance` with props:

```ts
interface StudioEntranceProps {
  logos: CuratedLogo[];
  loadingLibrary: boolean;
  wall: LogoRecipe[] | null;
  wallDark: boolean;
  showingVariants: boolean;
  logoAiStatus: LogoAiStatus | null;
  onToggleWallDark: () => void;
  onShuffle: () => void;
  onShowAll: () => void;
  onUseCurated: (logo: CuratedLogo) => void;
  onCreateFromCurated: (logo: CuratedLogo) => void;
  onUseWall: (recipe: LogoRecipe) => void;
  onMoreLikeThisWall: (recipe: LogoRecipe) => void;
  onOpenChat: () => void;
  onUpgrade: () => void;
}
```

- [ ] **Step 1: Write the failing test**

```tsx
// frontend-customer/src/components/logo/__tests__/studio-entrance.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StudioEntrance } from "../studio-entrance";
import type { CuratedLogo } from "@/lib/logo/library-catalog";

const logos: CuratedLogo[] = [
  { title: "Yoga", filename: "yoga.png", prompt: "p", tags: ["yoga"], imageUrl: "/logos/yoga.png" },
];

function setup(over = {}) {
  const props = {
    logos, loadingLibrary: false, wall: null, wallDark: false, showingVariants: false,
    logoAiStatus: { enabled: true, eligible: false, turns_remaining: 0, refine_remaining: 0, reason: "upgrade_required" as const },
    onToggleWallDark: vi.fn(), onShuffle: vi.fn(), onShowAll: vi.fn(),
    onUseCurated: vi.fn(), onCreateFromCurated: vi.fn(),
    onUseWall: vi.fn(), onMoreLikeThisWall: vi.fn(), onOpenChat: vi.fn(), onUpgrade: vi.fn(),
    ...over,
  };
  render(<StudioEntrance {...props} />);
  return props;
}

describe("StudioEntrance", () => {
  it("uses a curated logo", () => {
    const p = setup();
    fireEvent.click(screen.getByRole("button", { name: /use this/i }));
    expect(p.onUseCurated).toHaveBeenCalled();
  });

  it("Design-with-AI door upsells when not eligible", () => {
    const p = setup();
    fireEvent.click(screen.getByRole("button", { name: /design with ai/i }));
    expect(p.onOpenChat).not.toHaveBeenCalled();
    expect(p.onUpgrade).toHaveBeenCalled();
  });

  it("Design-with-AI door opens chat when eligible", () => {
    const p = setup({
      logoAiStatus: { enabled: true, eligible: true, turns_remaining: 5, refine_remaining: 5, reason: null },
    });
    fireEvent.click(screen.getByRole("button", { name: /design with ai/i }));
    expect(p.onOpenChat).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/logo/__tests__/studio-entrance.test.tsx`
Expected: FAIL (cannot resolve `../studio-entrance`)

- [ ] **Step 3: Write `StudioEntrance`**

```tsx
// frontend-customer/src/components/logo/studio-entrance.tsx
"use client";

import { Sparkles, Wand2 } from "lucide-react";
import type { LogoRecipe } from "@/types/logo";
import type { CuratedLogo } from "@/lib/logo/library-catalog";
import type { LogoAiStatus } from "@/lib/logo/converse-api";
import { CuratedGallery } from "./curated-gallery";
import { StudioWall } from "./studio-wall";

interface StudioEntranceProps {
  logos: CuratedLogo[];
  loadingLibrary: boolean;
  wall: LogoRecipe[] | null;
  wallDark: boolean;
  showingVariants: boolean;
  logoAiStatus: LogoAiStatus | null;
  onToggleWallDark: () => void;
  onShuffle: () => void;
  onShowAll: () => void;
  onUseCurated: (logo: CuratedLogo) => void;
  onCreateFromCurated: (logo: CuratedLogo) => void;
  onUseWall: (recipe: LogoRecipe) => void;
  onMoreLikeThisWall: (recipe: LogoRecipe) => void;
  onOpenChat: () => void;
  onUpgrade: () => void;
}

export function StudioEntrance({
  logos,
  loadingLibrary,
  wall,
  wallDark,
  showingVariants,
  logoAiStatus,
  onToggleWallDark,
  onShuffle,
  onShowAll,
  onUseCurated,
  onCreateFromCurated,
  onUseWall,
  onMoreLikeThisWall,
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

      {wall && (
        <details className="border-t px-6 py-4">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
            More auto-generated ideas
          </summary>
          <div className="mt-3">
            <StudioWall
              wall={wall}
              dark={wallDark}
              onToggleDark={onToggleWallDark}
              onShuffle={onShuffle}
              onCustomize={onUseWall}
              onMoreLikeThis={onMoreLikeThisWall}
              showingVariants={showingVariants}
              onShowAll={onShowAll}
              logoAiStatus={logoAiStatus}
              onOpenChat={onOpenChat}
            />
          </div>
        </details>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/logo/__tests__/studio-entrance.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/components/logo/studio-entrance.tsx frontend-customer/src/components/logo/__tests__/studio-entrance.test.tsx
git commit -m "feat(logo-library): studio entrance (two doors + curated gallery + demoted wall)"
```

---

### Task 4: Wire the entrance + "Use this" into `logo-studio.tsx`

**Files:**
- Modify: `frontend-customer/src/components/logo/logo-studio.tsx`

**Interfaces:**
- Consumes: `StudioEntrance` (Task 3), `fetchCuratedCatalog` / `rankByNiche` / `CuratedLogo` (Task 1), existing `uploadPng` / `imageToDataUrl`, existing `handleCustomize`, `seedRecipe`, `theme`, `chatDispatch`, `setChatOpen`.
- Produces: handlers `handleUseCurated`, `handleCreateFromCurated` (stub until Task 5), `handleUpgrade`; catalog state.

- [ ] **Step 1: Add imports + state**

At the top imports of `logo-studio.tsx` add:

```tsx
import { StudioEntrance } from "./studio-entrance";
import {
  fetchCuratedCatalog,
  rankByNiche,
  type CuratedLogo,
} from "@/lib/logo/library-catalog";
```

Inside the component, add state near the other studio state:

```tsx
const [library, setLibrary] = useState<CuratedLogo[]>([]);
const [loadingLibrary, setLoadingLibrary] = useState(false);
```

- [ ] **Step 2: Fetch + rank the catalog on open**

Add next to the existing `fetchLogoAiStatus` effect:

```tsx
useEffect(() => {
  if (!open) return;
  setLoadingLibrary(true);
  fetchCuratedCatalog()
    .then((all) => setLibrary(rankByNiche(all, config.niche ?? "")))
    .catch(() => setLibrary([]))
    .finally(() => setLoadingLibrary(false));
}, [open, config.niche]);
```

- [ ] **Step 3: Add the handlers**

```tsx
async function handleUseCurated(logo: CuratedLogo) {
  setError(null);
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
      const base = seedRecipe(config, theme.primaryHex);
      const chosen: LogoRecipe = {
        ...base,
        name: brief.brandName || config.brand_name || base.name,
        mark: { type: "image", photo_id: uploaded.photo_id, url: dataUrl },
      };
      handleCustomize(chosen);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : "Couldn't use that logo — try again.");
  }
}

function handleCreateFromCurated(logo: CuratedLogo) {
  // Completed in Task 5 (seed the chat with logo.prompt). Stub for now:
  chatDispatch({ type: "hydrate", snapshot: null });
  setChatOpen(true);
}

function handleUpgrade() {
  window.location.href = "/admin/billing/subscription";
}
```

- [ ] **Step 4: Replace the `ideas` non-chat branch with `StudioEntrance`**

In the `step === "ideas"` block, replace the `<StudioWall .../>` element (the non-`chatOpen`
branch) with:

```tsx
<StudioEntrance
  logos={library}
  loadingLibrary={loadingLibrary}
  wall={wall}
  wallDark={wallDark}
  showingVariants={showingVariants}
  logoAiStatus={logoAiStatus}
  onToggleWallDark={() => setWallDark((v) => !v)}
  onShuffle={regenerateWall}
  onShowAll={regenerateWall}
  onUseCurated={handleUseCurated}
  onCreateFromCurated={handleCreateFromCurated}
  onUseWall={handleCustomize}
  onMoreLikeThisWall={handleMoreLikeThis}
  onOpenChat={() => setChatOpen(true)}
  onUpgrade={handleUpgrade}
/>
```

- [ ] **Step 5: Typecheck + build + existing tests**

Run:
```bash
npx tsc --noEmit
npx vitest run src/components/logo src/lib/logo
```
Expected: tsc clean; all logo tests pass. If the container desyncs, `docker compose restart nextjs-customer`.

- [ ] **Step 6: Manual smoke (dev stack up)**

Open the studio as a coach without a saved logo → the Browse entrance shows the two doors +
the curated PNG gallery (niche-first) → click **Use this** → lands in the Editor with the
illustration as the mark and the brand name editable → **Use this logo** saves.

- [ ] **Step 7: Commit**

```bash
git add frontend-customer/src/components/logo/logo-studio.tsx
git commit -m "feat(logo-library): wire entrance + 'Use this' image-mark flow"
```

---

### Task 5: Seed the AI chat from a curated logo's prompt ("Create your own with AI")

**Files:**
- Modify: `frontend-customer/src/components/logo/studio-chat.tsx` (accept `seedPrompt`)
- Modify: `frontend-customer/src/components/logo/logo-studio.tsx` (hold `chatSeed`, complete `handleCreateFromCurated`)
- Test: `frontend-customer/src/components/logo/__tests__/studio-chat-seed.test.tsx`

**Interfaces:**
- Consumes: `StudioChat` (existing), `handleCreateFromCurated` stub (Task 4).
- Produces: `StudioChat` gains `seedPrompt?: string` (prefills the Describe input). `logo-studio.tsx` gains `const [chatSeed, setChatSeed] = useState<string | null>(null);`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend-customer/src/components/logo/__tests__/studio-chat-seed.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StudioChat } from "../studio-chat";
import { initialChatState } from "@/lib/logo/chat-state";

describe("StudioChat seed", () => {
  it("prefills the describe input from seedPrompt", () => {
    render(
      <StudioChat
        open
        state={initialChatState}
        dispatch={vi.fn()}
        brief={{ brandName: "Acme", niche: "fitness", styleChips: [] }}
        brandName="Acme"
        status={{ enabled: true, eligible: true, turns_remaining: 5, refine_remaining: 5, reason: null }}
        seedPrompt="a bold geometric monogram"
        onUseDesign={vi.fn()}
        onStatusChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue("a bold geometric monogram")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/logo/__tests__/studio-chat-seed.test.tsx`
Expected: FAIL (no matching display value — `seedPrompt` not wired)

- [ ] **Step 3: Wire `seedPrompt` into `StudioChat`**

In `studio-chat.tsx`:
1. Add `seedPrompt?: string;` to `StudioChatProps`.
2. Destructure it in the component signature.
3. Initialize the describe input from it: change `const [describeInput, setDescribeInput] = useState("");` to
   `const [describeInput, setDescribeInput] = useState(seedPrompt ?? "");`.

- [ ] **Step 4: Complete the wiring in `logo-studio.tsx`**

1. Add `const [chatSeed, setChatSeed] = useState<string | null>(null);`.
2. Replace the Task 4 stub body of `handleCreateFromCurated`:
```tsx
function handleCreateFromCurated(logo: CuratedLogo) {
  chatDispatch({ type: "hydrate", snapshot: null });
  setChatSeed(logo.prompt);
  setChatOpen(true);
}
```
3. Pass the seed to `<StudioChat ... seedPrompt={chatSeed ?? undefined} />` in the `chatOpen` branch.
4. Clear it when the chat closes — in the chat's `onClose`, also `setChatSeed(null)`:
```tsx
onClose={() => {
  setChatOpen(false);
  setChatSeed(null);
}}
```

- [ ] **Step 5: Run test + typecheck**

Run:
```bash
npx vitest run src/components/logo/__tests__/studio-chat-seed.test.tsx
npx tsc --noEmit
```
Expected: PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add frontend-customer/src/components/logo/studio-chat.tsx frontend-customer/src/components/logo/logo-studio.tsx frontend-customer/src/components/logo/__tests__/studio-chat-seed.test.tsx
git commit -m "feat(logo-library): seed Design-with-AI chat from a curated logo's prompt"
```

---

### Task 6: e2e — browse curated → use → editor → save

**Files:**
- Create: `e2e/tests/16-logo-curated-library.spec.ts` (use the next free number; bump if 16 is taken)

**Interfaces:**
- Consumes: the running dev stack + a seeded coach/tenant (existing e2e login helpers) and the committed `public/logos/` catalog (already present).

- [ ] **Step 1: Write the e2e spec**

Mirror `e2e/tests/15-logo-studio.spec.ts` for login + opening the studio (match its helper
names, login role, and how it reaches the entrance). The new flow:

```ts
import { test, expect } from "@playwright/test";
import { loginAsCoach, openLogoStudio } from "./helpers"; // match 15-logo-studio.spec.ts

test("coach uses a curated logo and saves it", async ({ page }) => {
  await loginAsCoach(page);
  await openLogoStudio(page); // fresh coach → Browse entrance

  // Curated gallery visible; use the first curated logo.
  const useButton = page.getByRole("button", { name: /use this/i }).first();
  await expect(useButton).toBeVisible();
  await useButton.click();

  // In the Editor now — save.
  const save = page.getByRole("button", { name: /use this logo/i });
  await expect(save).toBeVisible();
  await save.click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 15000 });
});
```

> Adjust selectors to match `15-logo-studio.spec.ts`. The save button label is "Use this
> logo" (`logo-studio.tsx:556`). If a coach with a saved recipe lands in the Editor, first
> click the "2 · Ideas" step nav to reach the Browse entrance.

- [ ] **Step 2: Run the spec (dev stack up)**

Run: `npx playwright test e2e/tests/16-logo-curated-library.spec.ts` (from repo root) or
`make e2e ARGS=16-logo-curated-library`.
Expected: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/16-logo-curated-library.spec.ts
git commit -m "test(logo-library): e2e browse curated → use → save"
```

---

## Final verification (after all tasks)

- [ ] Frontend unit: `npx vitest run src/lib/logo src/components/logo` → all green.
- [ ] Typecheck + build: `npx tsc --noEmit && npx next build` → clean.
- [ ] Lint: `make lint` → zero errors/warnings/security issues.
- [ ] Manual browser pass:
  - Fresh coach → Browse entrance shows two doors + curated PNG gallery (niche-first).
  - **Use this** → Editor with the illustration as mark + editable brand name → save works.
  - **Free** tenant → "Create your own" and "Design with AI" show the upgrade path.
  - **Paid** tenant → "Create your own" opens the chat pre-seeded with the curated `prompt`.

## Self-review notes (spec coverage)

- Spec §1/§7 files-first, frontend-only → whole plan (no backend tasks). §2 catalog format
  → Task 1 loader. §3 niche matching → Task 1 `rankByNiche`. §4 entrance (two doors, PNG
  gallery, tag chips, demoted wall) → Tasks 2–4. §5 actions: **Use this** image-mark →
  Task 4; **Create your own with AI** prompt-seed → Task 5. §6 free/paid → `aiEligible`
  gating in Tasks 2–4. §8 testing → tests each task + Task 6 e2e.
- **Deferred to Phase 2 (separate plan), per spec §7:** superadmin management UI (add/edit/
  reorder curated logos writing back to `public/logos/`), optional DB projection, gallery
  thumbnails for scale, and any full-image "create similar" generation.
- **Honest scope note:** no "Improve with AI" per-card action (spec §1 non-goal) — the mark
  is a fixed illustration; the text refine can't improve raster art.
