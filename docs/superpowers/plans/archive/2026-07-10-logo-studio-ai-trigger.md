# Logo Studio: Explicit AI Trigger + Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Logo Studio's silent auto-fire AI generation with an explicit "Generate AI logos" button (paid tenants only) and real progress feedback for the ~2-minute wait, while also fixing the case where a paid tenant sees nothing at all when the AI provider is temporarily unavailable.

**Architecture:** A new pure module (`lib/logo/ai-banner.ts`) derives one of six banner states (`upsell` / `idle` / `generating` / `quota_exhausted` / `disabled` / `hidden`) from existing status/loading/result props, plus a time-based progress-checkpoint lookup. `studio-wall.tsx` gets one new presentational subcomponent (`AiGenerateBanner`) driven by that state, replacing three ad-hoc conditionals. `logo-studio.tsx` stops auto-calling the AI fetch on brief submit and instead exposes it as a click handler; it also starts tracking the post-response `reason` (not just `remaining`) so the derived state stays in sync with a live quota hit.

**Tech Stack:** Next.js 14 / React / TypeScript, existing `LogoRecipe`/`BrandPackStatus` types, vitest (no React Testing Library in this repo — see Global Constraints).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-10-logo-studio-ai-trigger-design.md`. Read it if any task here is ambiguous.
- No backend/API changes. `BrandPackStatus.reason` (`"upgrade_required" | "quota_exhausted" | "disabled" | null`) is the single source of truth for non-loading, non-result banner states — don't re-derive it from `enabled`/`remaining` separately, that duplicates backend logic (`apps/tenant_config/views.py::_brand_pack_status`) and can drift.
- **This frontend has no React component-testing library** (`@testing-library/react` is not a dependency; `find` confirms zero `*.test.tsx` files anywhere in `frontend-customer/`). The existing test convention is unit-testing pure logic under `src/lib/logo/__tests__/*.test.ts` (see `composer.test.ts`) plus manual/Playwright verification for actual rendering. Do **not** install a new testing library or invent component-render tests as part of this plan — that's a separate, bigger decision outside this plan's scope. Pure logic (Task 1) gets real TDD; component wiring (Tasks 2–3) is verified via `npx tsc --noEmit` + the manual browser pass in Task 4.
- Progress checkpoint table (elapsed seconds → bar % / status text), based on measured real generation times of 106–134s on the CLI/haiku provider — copy verbatim, do not invent different values:

  | elapsed | percent | label |
  |---|---|---|
  | 0s | 8 | Sketching your marks… |
  | 10s | 25 | Sketching your marks… |
  | 25s | 45 | Choosing brand colors… |
  | 50s | 65 | Choosing brand colors… |
  | 80s | 80 | Polishing the details… |
  | 110s | 90 | Almost there… |

  The bar holds at 90%/"Almost there…" indefinitely past 110s — it never fake-completes to 100%.
- Run all commands from `frontend-customer/` (confirmed `npx vitest run <path>` and `npx tsc --noEmit` both work directly from the host, no Docker needed for these).

---

### Task 1: Pure banner-state + progress logic

**Files:**
- Create: `frontend-customer/src/lib/logo/ai-banner.ts`
- Create: `frontend-customer/src/lib/logo/__tests__/ai-banner.test.ts`

**Interfaces:**
- Produces: `progressForElapsed(elapsedSeconds: number): { percent: number; label: string }`; `deriveAiBannerState(params: { brandPackStatus: BrandPackStatus | null | undefined; aiLoading: boolean; aiWall: LogoRecipe[] | null | undefined; aiNotice: string | null | undefined; elapsedSeconds: number }): AiBannerState`; `type AiBannerState = { kind: "hidden" } | { kind: "upsell" } | { kind: "idle"; description: string } | { kind: "generating"; percent: number; label: string } | { kind: "quota_exhausted" } | { kind: "disabled" }`; `AI_DEFAULT_IDLE_DESCRIPTION: string`. All consumed by Task 2's `AiGenerateBanner`.

- [x] **Step 1: Write the failing tests**

Create `frontend-customer/src/lib/logo/__tests__/ai-banner.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  AI_DEFAULT_IDLE_DESCRIPTION,
  deriveAiBannerState,
  progressForElapsed,
} from "@/lib/logo/ai-banner";
import type { BrandPackStatus } from "@/lib/logo/brand-pack-api";
import type { LogoRecipe } from "@/types/logo";

function baseStatus(overrides: Partial<BrandPackStatus> = {}): BrandPackStatus {
  return { enabled: true, eligible: true, remaining: 5, reason: null, ...overrides };
}

const SOME_RECIPE = {} as LogoRecipe; // opaque to deriveAiBannerState — only array length/truthiness matters

describe("progressForElapsed", () => {
  it("starts at 8% / Sketching your marks…", () => {
    expect(progressForElapsed(0)).toEqual({ percent: 8, label: "Sketching your marks…" });
  });

  it("holds the checkpoint value until the next threshold", () => {
    expect(progressForElapsed(9)).toEqual({ percent: 8, label: "Sketching your marks…" });
    expect(progressForElapsed(24)).toEqual({ percent: 25, label: "Sketching your marks…" });
    expect(progressForElapsed(49)).toEqual({ percent: 45, label: "Choosing brand colors…" });
    expect(progressForElapsed(79)).toEqual({ percent: 65, label: "Choosing brand colors…" });
    expect(progressForElapsed(109)).toEqual({ percent: 80, label: "Polishing the details…" });
  });

  it("reaches the final checkpoint at 110s and holds past it", () => {
    expect(progressForElapsed(110)).toEqual({ percent: 90, label: "Almost there…" });
    expect(progressForElapsed(500)).toEqual({ percent: 90, label: "Almost there…" });
  });
});

describe("deriveAiBannerState", () => {
  const commonArgs = { aiLoading: false, aiWall: null, aiNotice: null, elapsedSeconds: 0 };

  it("is hidden when status hasn't loaded yet", () => {
    expect(
      deriveAiBannerState({ ...commonArgs, brandPackStatus: null }),
    ).toEqual({ kind: "hidden" });
  });

  it("is generating (with checkpoint values) whenever aiLoading is true, regardless of reason", () => {
    expect(
      deriveAiBannerState({
        ...commonArgs,
        brandPackStatus: baseStatus(),
        aiLoading: true,
        elapsedSeconds: 30,
      }),
    ).toEqual({ kind: "generating", percent: 45, label: "Choosing brand colors…" });
  });

  it("is hidden once aiWall has results, even if aiLoading is false", () => {
    expect(
      deriveAiBannerState({
        ...commonArgs,
        brandPackStatus: baseStatus(),
        aiWall: [SOME_RECIPE],
      }),
    ).toEqual({ kind: "hidden" });
  });

  it("is NOT hidden for an empty aiWall array — falls through to idle", () => {
    expect(
      deriveAiBannerState({ ...commonArgs, brandPackStatus: baseStatus(), aiWall: [] }),
    ).toEqual({ kind: "idle", description: AI_DEFAULT_IDLE_DESCRIPTION });
  });

  it("maps reason upgrade_required to upsell", () => {
    expect(
      deriveAiBannerState({
        ...commonArgs,
        brandPackStatus: baseStatus({ eligible: false, reason: "upgrade_required" }),
      }),
    ).toEqual({ kind: "upsell" });
  });

  it("maps reason disabled to disabled", () => {
    expect(
      deriveAiBannerState({
        ...commonArgs,
        brandPackStatus: baseStatus({ enabled: false, reason: "disabled" }),
      }),
    ).toEqual({ kind: "disabled" });
  });

  it("maps reason quota_exhausted to quota_exhausted", () => {
    expect(
      deriveAiBannerState({
        ...commonArgs,
        brandPackStatus: baseStatus({ remaining: 0, reason: "quota_exhausted" }),
      }),
    ).toEqual({ kind: "quota_exhausted" });
  });

  it("is idle with the default description when reason is null and no notice is set", () => {
    expect(
      deriveAiBannerState({ ...commonArgs, brandPackStatus: baseStatus() }),
    ).toEqual({ kind: "idle", description: AI_DEFAULT_IDLE_DESCRIPTION });
  });

  it("is idle with the notice text (e.g. after an error) when aiNotice is set", () => {
    expect(
      deriveAiBannerState({
        ...commonArgs,
        brandPackStatus: baseStatus(),
        aiNotice: "Couldn't reach the design studio — try again.",
      }),
    ).toEqual({ kind: "idle", description: "Couldn't reach the design studio — try again." });
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/logo/__tests__/ai-banner.test.ts`
Expected: FAIL — `Cannot find module '@/lib/logo/ai-banner'` (the module doesn't exist yet).

- [x] **Step 3: Write the implementation**

Create `frontend-customer/src/lib/logo/ai-banner.ts`:

```ts
import type { BrandPackStatus } from "./brand-pack-api";
import type { LogoRecipe } from "@/types/logo";

export const AI_DEFAULT_IDLE_DESCRIPTION =
  "Bespoke marks + palettes, made for your brand — takes about 2 minutes.";

/** Elapsed-seconds -> {percent, label} checkpoints for the AI Brand Pack
 * progress banner. Based on measured real-world generation times
 * (106-134s, CLI/haiku provider, dev container, 2026-07-10). Never
 * reaches 100% — holds at the last checkpoint until the real response
 * lands, since the underlying call is a single blocking request with no
 * true progress signal (see docs/superpowers/specs/2026-07-10-logo-studio-ai-trigger-design.md). */
const PROGRESS_CHECKPOINTS: { atSeconds: number; percent: number; label: string }[] = [
  { atSeconds: 0, percent: 8, label: "Sketching your marks…" },
  { atSeconds: 10, percent: 25, label: "Sketching your marks…" },
  { atSeconds: 25, percent: 45, label: "Choosing brand colors…" },
  { atSeconds: 50, percent: 65, label: "Choosing brand colors…" },
  { atSeconds: 80, percent: 80, label: "Polishing the details…" },
  { atSeconds: 110, percent: 90, label: "Almost there…" },
];

export function progressForElapsed(elapsedSeconds: number): { percent: number; label: string } {
  let current = PROGRESS_CHECKPOINTS[0];
  for (const checkpoint of PROGRESS_CHECKPOINTS) {
    if (elapsedSeconds >= checkpoint.atSeconds) current = checkpoint;
  }
  return { percent: current.percent, label: current.label };
}

export type AiBannerState =
  | { kind: "hidden" }
  | { kind: "upsell" }
  | { kind: "idle"; description: string }
  | { kind: "generating"; percent: number; label: string }
  | { kind: "quota_exhausted" }
  | { kind: "disabled" };

/** Single source of truth for what the Logo Studio's AI banner shows.
 * `brandPackStatus.reason` (computed server-side in
 * `_brand_pack_status`) is authoritative for the non-loading,
 * no-results states — this never re-derives eligibility/quota from
 * `enabled`/`remaining` itself, to avoid drifting from the backend. */
export function deriveAiBannerState(params: {
  brandPackStatus: BrandPackStatus | null | undefined;
  aiLoading: boolean;
  aiWall: LogoRecipe[] | null | undefined;
  aiNotice: string | null | undefined;
  elapsedSeconds: number;
}): AiBannerState {
  const { brandPackStatus, aiLoading, aiWall, aiNotice, elapsedSeconds } = params;

  if (!brandPackStatus) return { kind: "hidden" };
  if (aiLoading) {
    const { percent, label } = progressForElapsed(elapsedSeconds);
    return { kind: "generating", percent, label };
  }
  if (aiWall && aiWall.length > 0) return { kind: "hidden" };

  switch (brandPackStatus.reason) {
    case "upgrade_required":
      return { kind: "upsell" };
    case "disabled":
      return { kind: "disabled" };
    case "quota_exhausted":
      return { kind: "quota_exhausted" };
    default:
      return { kind: "idle", description: aiNotice ?? AI_DEFAULT_IDLE_DESCRIPTION };
  }
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/logo/__tests__/ai-banner.test.ts`
Expected: PASS, 10 tests.

- [x] **Step 5: Commit**

```bash
git add frontend-customer/src/lib/logo/ai-banner.ts frontend-customer/src/lib/logo/__tests__/ai-banner.test.ts
git commit -m "feat(logo): pure AI banner state derivation + progress checkpoints"
```

---

### Task 2: `AiGenerateBanner` component in `studio-wall.tsx`

**Files:**
- Modify: `frontend-customer/src/components/logo/studio-wall.tsx`

**Interfaces:**
- Consumes: Task 1's `deriveAiBannerState`, `AiBannerState`, `progressForElapsed` (via `deriveAiBannerState` internally — not called directly here).
- Produces: `StudioWallProps.onGenerateAi?: () => void` (new optional prop, consumed by Task 3's `<StudioWall onGenerateAi={fetchAiIdeas} />` wiring).

- [x] **Step 1: Add the `onGenerateAi` prop and imports**

In `frontend-customer/src/components/logo/studio-wall.tsx`, update the top imports (currently `import { memo } from "react";`):

```ts
import { memo, useEffect, useState } from "react";
import { Moon, Shuffle, Sparkles, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deriveAiBannerState } from "@/lib/logo/ai-banner";
import type { BrandPackStatus } from "@/lib/logo/brand-pack-api";
import type { LogoRecipe } from "@/types/logo";
import { LogoRenderer } from "./logo-renderer";
```

Add `onGenerateAi` to `StudioWallProps` (after the existing `brandPackStatus` line):

```ts
  brandPackStatus?: BrandPackStatus | null;
  /** Click handler for the explicit "Generate AI logos" button (idle
   * state). Optional so the wall still renders standalone without AI
   * wired up, matching the rest of this prop group. */
  onGenerateAi?: () => void;
}
```

- [x] **Step 2: Add the `useElapsedSeconds` hook and `AiGenerateBanner` component**

Insert after the `AiWallCard` component (after its closing `});` — i.e. right before `export function StudioWall({`):

```tsx
/** Seconds since `active` last became true; resets to 0 whenever it goes
 * false. Owned here (not lifted into logo-studio.tsx) so the once-a-second
 * tick only re-renders the wall, not the whole studio dialog. */
function useElapsedSeconds(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [active]);
  return elapsed;
}

/** The single state machine for the AI Brand Pack banner above the wall —
 * see deriveAiBannerState for the states and docs/superpowers/specs/2026-07-10-logo-studio-ai-trigger-design.md
 * for the design. */
function AiGenerateBanner({
  brandPackStatus,
  aiLoading,
  aiWall,
  aiNotice,
  brandName,
  onGenerateAi,
  dark,
}: {
  brandPackStatus?: BrandPackStatus | null;
  aiLoading?: boolean;
  aiWall?: LogoRecipe[] | null;
  aiNotice?: string | null;
  brandName?: string;
  onGenerateAi?: () => void;
  dark: boolean;
}) {
  const elapsedSeconds = useElapsedSeconds(!!aiLoading);
  const state = deriveAiBannerState({
    brandPackStatus,
    aiLoading: !!aiLoading,
    aiWall,
    aiNotice,
    elapsedSeconds,
  });

  if (state.kind === "hidden") return null;

  if (state.kind === "upsell") {
    return (
      <div
        className={`flex items-center justify-between gap-3 rounded-lg border border-dashed p-4 ${dark ? "border-zinc-700" : ""}`}
      >
        <p className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-primary" />
          AI logo designer — bespoke marks made for your brand, included
          with paid plans.
        </p>
        <Button asChild size="sm" variant="outline">
          <a href="/admin/billing/subscription">Upgrade</a>
        </Button>
      </div>
    );
  }

  if (state.kind === "generating") {
    return (
      <div className={`space-y-2 rounded-lg border p-4 ${dark ? "border-zinc-700" : ""}`}>
        <p className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 animate-pulse text-primary" />
          Generating AI logos for {brandName || "your brand"}…
        </p>
        <div
          role="progressbar"
          aria-valuenow={state.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className={`h-1.5 w-full overflow-hidden rounded-full ${dark ? "bg-zinc-800" : "bg-muted"}`}
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
            style={{ width: `${state.percent}%` }}
          />
        </div>
        <p className={`text-xs ${dark ? "text-zinc-400" : "text-muted-foreground"}`}>
          {state.label} Usually takes about 2 minutes.
        </p>
      </div>
    );
  }

  if (state.kind === "quota_exhausted") {
    return (
      <p className={`text-xs ${dark ? "text-zinc-400" : "text-muted-foreground"}`}>
        You&apos;ve used this month&apos;s AI logo generations. More next
        month.
      </p>
    );
  }

  if (state.kind === "disabled") {
    return (
      <p className={`text-xs ${dark ? "text-zinc-400" : "text-muted-foreground"}`}>
        AI logo generation is temporarily unavailable — your ideas below
        are ready to use.
      </p>
    );
  }

  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between ${dark ? "border-zinc-700" : ""}`}
    >
      <p className={`text-xs ${dark ? "text-zinc-400" : "text-muted-foreground"}`}>
        {state.description}
      </p>
      <Button
        type="button"
        size="sm"
        className="shrink-0 gap-1.5"
        onClick={() => onGenerateAi?.()}
      >
        <Sparkles className="h-3.5 w-3.5" />
        Generate AI logos for {brandName || "your brand"}
      </Button>
    </div>
  );
}
```

- [x] **Step 3: Replace the old conditionals with `AiGenerateBanner`**

Replace this block (the current `showUpsell` / `aiLoading` / `aiNotice` conditionals, and drop the now-unused `showUpsell` const above it):

```tsx
        {!showingVariants && showUpsell && (
          <div
            className={`flex items-center justify-between gap-3 rounded-lg border border-dashed p-4 ${dark ? "border-zinc-700" : ""}`}
          >
            <p className="flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-primary" />
              AI logo designer — bespoke marks made for your brand, included
              with paid plans.
            </p>
            <Button asChild size="sm" variant="outline">
              <a href="/admin/billing/subscription">Upgrade</a>
            </Button>
          </div>
        )}

        {!showingVariants && !showUpsell && aiLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4 animate-pulse text-primary" />
            Sketching custom marks for {brandName || "your brand"}…
          </p>
        )}

        {!showingVariants && !showUpsell && !aiLoading && aiNotice && (
          <p
            className={`text-xs ${dark ? "text-zinc-400" : "text-muted-foreground"}`}
          >
            {aiNotice}
          </p>
        )}
```

with:

```tsx
        {!showingVariants && (
          <AiGenerateBanner
            brandPackStatus={brandPackStatus}
            aiLoading={aiLoading}
            aiWall={aiWall}
            aiNotice={aiNotice}
            brandName={brandName}
            onGenerateAi={onGenerateAi}
            dark={dark}
          />
        )}
```

Also delete the now-unused line near the top of the component:

```ts
  const showUpsell = brandPackStatus?.reason === "upgrade_required";
```

And update the `StudioWall({ ... })` destructuring to include the new prop:

```tsx
export function StudioWall({
  wall,
  dark,
  onToggleDark,
  onShuffle,
  onCustomize,
  onMoreLikeThis,
  showingVariants,
  onShowAll,
  brandName,
  aiWall,
  aiLoading,
  aiNotice,
  brandPackStatus,
  onGenerateAi,
}: StudioWallProps) {
```

The "Made for {brandName}" results block (the `{!showingVariants && aiWall && aiWall.length > 0 && (...)}` section right below) is unchanged — `AiGenerateBanner` returns `null` once `aiWall` has entries, so there's no overlap.

- [x] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (baseline was already clean before this task).

- [x] **Step 5: Commit**

```bash
git add frontend-customer/src/components/logo/studio-wall.tsx
git commit -m "feat(logo): AiGenerateBanner replaces auto-loading text with an explicit trigger + progress bar"
```

---

### Task 3: Stop auto-firing AI generation in `logo-studio.tsx`

**Files:**
- Modify: `frontend-customer/src/components/logo/logo-studio.tsx`

**Interfaces:**
- Consumes: Task 2's `StudioWallProps.onGenerateAi`.
- Produces: nothing further downstream — this is the last wiring task.

- [x] **Step 1: Stop `startIdeas()` from auto-calling `fetchAiIdeas`**

In `frontend-customer/src/components/logo/logo-studio.tsx`, change:

```ts
  function startIdeas() {
    regenerateWall();
    setAiWall(null);
    setAiNotice(null);
    setStep("ideas");
    void fetchAiIdeas();
  }
```

to:

```ts
  function startIdeas() {
    regenerateWall();
    setAiWall(null);
    setAiNotice(null);
    setStep("ideas");
  }
```

- [x] **Step 2: Keep `brandPackStatus.reason` in sync after a response**

`fetchAiIdeas` currently only patches `remaining` after a response, leaving `reason` stale (still whatever it was before the call — normally `null`, since the button is only clickable when `reason` is `null`). Since Task 2's `AiGenerateBanner` switches on `reason` (not `remaining`) to decide the `quota_exhausted` state, a response that exhausts the quota needs to flip `reason` too, or the banner will silently render nothing (`aiWall` is null, `aiLoading` is false, `reason` still `null` → `deriveAiBannerState` would return `idle` again instead of `quota_exhausted`).

Change:

```ts
      const resp = await fetchBrandPack(brief);
      if (requestId !== aiRequestIdRef.current) return; // stale — brief changed since
      setBrandPackStatus((s) => (s ? { ...s, remaining: resp.remaining } : s));
      if (resp.source === "ai" || resp.source === "cache") {
        const seed = 1 + Math.floor(Math.random() * 1_000_000);
        setAiWall(resp.pack ? composeFromPack(resp.pack, brief, seed) : null);
      } else if (resp.source === "quota_exhausted") {
        setAiNotice(
          "You've used this month's AI generations — tweak any idea below or try again next month.",
        );
      } else if (resp.source === "error") {
        setAiNotice(
          "Couldn't reach the design studio just now — your ideas below are ready to use.",
        );
      }
```

to:

```ts
      const resp = await fetchBrandPack(brief);
      if (requestId !== aiRequestIdRef.current) return; // stale — brief changed since
      setBrandPackStatus((s) =>
        s
          ? {
              ...s,
              remaining: resp.remaining,
              reason: resp.remaining <= 0 ? "quota_exhausted" : s.reason,
            }
          : s,
      );
      if (resp.source === "ai" || resp.source === "cache") {
        const seed = 1 + Math.floor(Math.random() * 1_000_000);
        setAiWall(resp.pack ? composeFromPack(resp.pack, brief, seed) : null);
      } else if (resp.source === "error") {
        setAiNotice("Couldn't reach the design studio — try again.");
      }
```

(The `quota_exhausted` branch's `setAiNotice` call is deleted — that state is now expressed structurally via `reason`, not via notice text, so `AiGenerateBanner` renders its own fixed copy for it instead of a duplicate/conflicting message. The `error` copy is also updated to match the approved spec's exact wording.)

- [x] **Step 3: Wire the new `onGenerateAi` prop**

In the `<StudioWall ... />` JSX (the `step === "ideas"` block), add `onGenerateAi={fetchAiIdeas}`:

```tsx
              {step === "ideas" && wall && (
                <div className="min-h-0 flex-1">
                  <StudioWall
                    wall={wall}
                    dark={wallDark}
                    onToggleDark={() => setWallDark((v) => !v)}
                    onShuffle={regenerateWall}
                    onCustomize={handleCustomize}
                    onMoreLikeThis={handleMoreLikeThis}
                    showingVariants={showingVariants}
                    onShowAll={regenerateWall}
                    brandName={brief.brandName || config.brand_name}
                    aiWall={aiWall}
                    aiLoading={aiLoading}
                    aiNotice={aiNotice}
                    brandPackStatus={brandPackStatus}
                    onGenerateAi={fetchAiIdeas}
                  />
                </div>
              )}
```

- [x] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [x] **Step 5: Commit**

```bash
git add frontend-customer/src/components/logo/logo-studio.tsx
git commit -m "feat(logo): AI Brand Pack generation is now an explicit click, not an auto-fire on brief submit"
```

---

### Task 4: Build check + manual browser verification

**Files:** none (verification only).

**Interfaces:** none — terminal task.

- [x] **Step 1: Full unit suite + build**

```bash
cd frontend-customer
npx vitest run
npx tsc --noEmit
npm run build
```

Expected: vitest all green (includes the 10 new `ai-banner.test.ts` cases plus every pre-existing `lib/logo/__tests__` file, unaffected by this change), `tsc --noEmit` clean, `next build` succeeds.

- [x] **Step 2: Confirm the dev stack is up and mint a coach JWT for a real paid tenant**

```bash
docker compose ps django --format '{{.Status}}'
docker exec contentor-django-1 python manage.py shell -c "
from django_tenants.utils import tenant_context
from apps.accounts.models import User
from apps.accounts.tokens import create_jwt
from apps.core.models import Tenant
t = Tenant.objects.get(slug='y')
with tenant_context(t):
    u = User.objects.filter(role__in=['owner','coach']).order_by('id').first()
    print('JWT=' + create_jwt(u, t))
"
```

(Tenant `y` is a real paid tenant already confirmed `has_paid_platform_plan=True` with quota remaining — reuse it rather than seeding a new fixture, which is out of scope per the spec's non-goals.)

- [x] **Step 3: Browser walkthrough — paid tenant, idle → generating → done**

Using the Playwright MCP (or any browser), set the `contentor_access_token` cookie from Step 2 on `y.localhost`, navigate to `http://y.localhost/admin/design`, open the Logo Studio, go through the Brief (name/niche/a style chip), click "Show my logo ideas".

Assert:
- The wall of 24 deterministic ideas renders immediately.
- A banner reading "Generate AI logos for {brand}" is visible above the wall, **and no network request to `/api/v1/admin/config/logo-brand-pack/` has fired yet** (check via the Network tab / `list_network_requests`) — confirms the auto-fire is gone.
- Click the button. The banner switches to the progress bar; over the next ~2 minutes, confirm the percentage advances through at least 2-3 of the checkpoints in the Global Constraints table and the status text changes accordingly.
- On completion, the banner disappears and the "Made for {brand}" AI tile row renders above the deterministic wall (same as the existing, unchanged results section).

- [x] **Step 4: Browser walkthrough — free tenant, unchanged upsell**

Repeat the login-and-open-studio steps for a free-tier tenant (e.g. `demo-yoga`, minted the same way with `--tenant demo-yoga`). Confirm the wall renders and the "AI logo designer — … included with paid plans" upsell card with the Upgrade link still renders exactly as before — this path's code didn't change, but confirms the refactor didn't regress it.

- [x] **Step 5: Report results**

No commit for this task (verification only). If any assertion in Steps 3–4 fails, return to the relevant task above — do not patch ad hoc.
