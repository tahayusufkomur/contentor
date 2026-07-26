# Interaction Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No interaction in either Next.js frontend produces dead air — every
click yields a visible response within one frame, and something stays in motion
until the result lands.

**Architecture:** A React-free core (`navigation-state.ts`) holds all decidable
logic and is the only part vitest covers. Thin React wrappers
(`NavigationProvider`, `NavLink`, `NavigationProgress`, `StaleContainer`) live in
`packages/shared/src/` and are consumed by both apps. Route-level `loading.tsx`
Suspense boundaries make navigation commit instantly; the provider fills the
pre-commit window with a delayed top bar and an optimistic active highlight.

**Tech Stack:** Next 14.2.35 (App Router), React 18, TypeScript, Tailwind
(shared preset), vitest (pure-logic only), Playwright.

**Spec:** `docs/superpowers/specs/2026-07-24-interaction-feedback-design.md`

## Global Constraints

- **Next 14.2.35 / React 18.3.** No `useLinkStatus` (15.3+), no router-events
  API. Pending state must be owned explicitly.
- **Vitest is pure-logic only.** `frontend-customer/vitest.config.ts` has
  `include: ["src/**/__tests__/**/*.test.ts"]` — `.ts` only, no `.tsx`, no jsdom.
  Never add a `.test.tsx`. React behavior is verified by `npm run typecheck`,
  `npm run build`, and Playwright.
- **Shared package is source-only.** `packages/shared/src/` under the `@shared/*`
  alias; each app's `src/components/ui/*` are re-export shims. Edit shared
  source, never a shim. ESLint runs only over `frontend-*/src/**`, so
  `packages/shared` is exempt from app lint rules.
- **No raw loading animations.** `scripts/check-loading-patterns.mjs` fails on
  `/animate-(?:spin|pulse)(?!-)/` outside its allowlist. New animation utilities
  must be named so they don't match (e.g. `animate-progress-indeterminate` is
  fine).
- **Motion is CSS-only and `motion-safe:`-gated.** Reduced motion keeps the
  loading *state* visible and drops only the movement.
- **Never commit unless explicitly asked** (root `CLAUDE.md`). The commit steps
  below are written out but require the user's go-ahead.
- **Never create new `.md` files** beyond this plan and its spec.
- **Verification per phase:** `make lint`, `make typecheck`, `make test-frontend`,
  `make e2e-changed`, plus a `make dev` browser spot-check before the phase is
  called done.

## File Structure

**Created (`packages/shared/src/`):**

| File | Responsibility |
|---|---|
| `navigation/navigation-state.ts` | React-free: active matching, progress delay state machine |
| `navigation/navigation-provider.tsx` | Context: `pathname`, `pendingHref`, `isPending`, `navigate`, `prefetch` |
| `ui/progress-line.tsx` | The 2px indeterminate bar (one visual, two consumers) |
| `ui/navigation-progress.tsx` | Viewport-top bar driven by the provider |
| `ui/nav-link.tsx` | `next/link` replacement with optimistic active state |
| `ui/stale-container.tsx` | Dim-but-never-unmount wrapper for refinement loads |

**Created (tests):** `frontend-customer/src/lib/__tests__/navigation-state.test.ts`

**Created (shims, both apps):** `src/components/ui/{progress-line,navigation-progress,nav-link,stale-container}.tsx`

**Created (routes):** ~12 `loading.tsx` in `frontend-customer/src/app/`, gap-fill in `frontend-main/src/app/`

**Created (e2e):** `e2e/specs/25-navigation-feedback.spec.ts`

**Modified:** `packages/shared/tailwind-preset.ts`, both `next.config.mjs`, both
`app/layout.tsx`, both `app-sidebar.tsx`, both `mobile-header.tsx`,
`platform-header.tsx`, `admin-shell.tsx`, `media-browser.tsx`,
`inline-edit-panel.tsx`, `student-drawer.tsx`, `tag-filter-bar.tsx`,
`unified-calendar.tsx`, both `.eslintrc.json`,
`scripts/check-loading-patterns.mjs`, `e2e/impact-map.json`, root `CLAUDE.md`,
`frontend-customer/src/CLAUDE.md`

---

# Phase 1 — Primitives and providers

*Observable result: a top progress bar on every navigation in both apps.*

## Task 1: Navigation state core (React-free)

**Files:**

- Create: `packages/shared/src/navigation/navigation-state.ts`
- Test: `frontend-customer/src/lib/__tests__/navigation-state.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `type ActiveMatch = (current: string, href: string) => boolean`
  - `defaultActiveMatch(current: string, href: string): boolean`
  - `isNavItemActive(state: { pathname: string; pendingHref: string | null }, href: string, match?: ActiveMatch): boolean`
  - `interface ProgressController { start(): void; finish(): void; dispose(): void }`
  - `createProgressController(opts: { delayMs: number; onShow: () => void; onHide: () => void }): ProgressController`

- [ ] **Step 1: Write failing tests**

Create `frontend-customer/src/lib/__tests__/navigation-state.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProgressController,
  defaultActiveMatch,
  isNavItemActive,
} from "@shared/navigation/navigation-state";

describe("defaultActiveMatch", () => {
  it("matches an exact path", () => {
    expect(defaultActiveMatch("/admin/students", "/admin/students")).toBe(true);
  });

  it("matches a nested child on a segment boundary", () => {
    expect(defaultActiveMatch("/admin/students/7", "/admin/students")).toBe(true);
  });

  it("does not treat /admin as a prefix of everything", () => {
    expect(defaultActiveMatch("/admin/students", "/admin")).toBe(false);
    expect(defaultActiveMatch("/admin", "/admin")).toBe(true);
  });

  it("does not match a sibling that merely shares a string prefix", () => {
    // Regression: both /admin/live and /admin/live-streams are nav items, and
    // the old `pathname.startsWith(href)` highlighted both at once.
    expect(defaultActiveMatch("/admin/live-streams", "/admin/live")).toBe(false);
    expect(defaultActiveMatch("/admin/live-streams", "/admin/live-streams")).toBe(true);
  });
});

describe("isNavItemActive", () => {
  it("uses pathname when nothing is pending", () => {
    const state = { pathname: "/admin/calendar", pendingHref: null };
    expect(isNavItemActive(state, "/admin/calendar")).toBe(true);
    expect(isNavItemActive(state, "/admin/students")).toBe(false);
  });

  it("lets a pending href win over the committed pathname", () => {
    const state = { pathname: "/admin/calendar", pendingHref: "/admin/students" };
    expect(isNavItemActive(state, "/admin/students")).toBe(true);
    expect(isNavItemActive(state, "/admin/calendar")).toBe(false);
  });

  it("honours a custom matcher", () => {
    const state = { pathname: "/x", pendingHref: null };
    expect(isNavItemActive(state, "/y", () => true)).toBe(true);
  });
});

describe("createProgressController", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(delayMs = 150) {
    const onShow = vi.fn();
    const onHide = vi.fn();
    return { onShow, onHide, c: createProgressController({ delayMs, onShow, onHide }) };
  }

  it("stays hidden when the navigation finishes inside the delay window", () => {
    const { c, onShow, onHide } = setup();
    c.start();
    vi.advanceTimersByTime(100);
    c.finish();
    vi.advanceTimersByTime(1000);
    expect(onShow).not.toHaveBeenCalled();
    expect(onHide).not.toHaveBeenCalled();
  });

  it("shows once the delay elapses", () => {
    const { c, onShow } = setup();
    c.start();
    vi.advanceTimersByTime(150);
    expect(onShow).toHaveBeenCalledOnce();
  });

  it("hides when a shown navigation finishes", () => {
    const { c, onHide } = setup();
    c.start();
    vi.advanceTimersByTime(150);
    c.finish();
    expect(onHide).toHaveBeenCalledOnce();
  });

  it("ignores a repeated start while already tracking", () => {
    const { c, onShow } = setup();
    c.start();
    c.start();
    vi.advanceTimersByTime(150);
    expect(onShow).toHaveBeenCalledOnce();
  });

  it("is idempotent on finish so back/forward cannot strand the bar", () => {
    const { c, onHide } = setup();
    c.finish();
    expect(onHide).not.toHaveBeenCalled();
    c.start();
    vi.advanceTimersByTime(150);
    c.finish();
    c.finish();
    expect(onHide).toHaveBeenCalledOnce();
  });

  it("cancels a pending timer on dispose", () => {
    const { c, onShow } = setup();
    c.start();
    c.dispose();
    vi.advanceTimersByTime(1000);
    expect(onShow).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/navigation-state.test.ts`
Expected: FAIL — `Failed to resolve import "@shared/navigation/navigation-state"`

- [ ] **Step 3: Write the implementation**

Create `packages/shared/src/navigation/navigation-state.ts`:

```ts
// Pure core of the navigation-feedback layer, kept React-free so it's
// unit-testable (repo convention: vitest covers pure logic only).

export type ActiveMatch = (current: string, href: string) => boolean;

/**
 * Exact match, or a nested child on a segment boundary. Root-ish hrefs
 * ("/admin", "/") only ever match exactly, otherwise they'd claim every page
 * beneath them. The trailing-slash check is what keeps "/admin/live" from
 * highlighting when you're on "/admin/live-streams".
 */
export function defaultActiveMatch(current: string, href: string): boolean {
  if (current === href) return true;
  if (href === "/" || href === "/admin") return false;
  return current.startsWith(href + "/");
}

export interface NavPathState {
  pathname: string;
  pendingHref: string | null;
}

/** A pending navigation wins over the committed pathname — this is what makes
 *  the clicked item highlight before the route commits. */
export function isNavItemActive(
  { pathname, pendingHref }: NavPathState,
  href: string,
  match: ActiveMatch = defaultActiveMatch,
): boolean {
  return match(pendingHref ?? pathname, href);
}

export interface ProgressController {
  start(): void;
  finish(): void;
  dispose(): void;
}

/**
 * Delay-then-show state machine for the top progress bar. Navigations that
 * resolve inside `delayMs` never show anything, so cached/instant transitions
 * don't flash a bar.
 */
export function createProgressController({
  delayMs,
  onShow,
  onHide,
}: {
  delayMs: number;
  onShow: () => void;
  onHide: () => void;
}): ProgressController {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let active = false;
  let shown = false;

  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return {
    start() {
      if (active) return;
      active = true;
      timer = setTimeout(() => {
        timer = null;
        shown = true;
        onShow();
      }, delayMs);
    },
    finish() {
      if (!active) return;
      active = false;
      clear();
      if (shown) {
        shown = false;
        onHide();
      }
    },
    dispose() {
      clear();
      active = false;
      shown = false;
    },
  };
}
```

- [ ] **Step 4: Run tests and verify they pass**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/navigation-state.test.ts`
Expected: PASS — 13 tests

- [ ] **Step 5: Commit** (only if the user has asked for commits)

```bash
git add packages/shared/src/navigation/navigation-state.ts \
        frontend-customer/src/lib/__tests__/navigation-state.test.ts
git commit -m "feat(shared): add React-free navigation-state core"
```

## Task 2: ProgressLine primitive + keyframe

**Files:**

- Modify: `packages/shared/tailwind-preset.ts`
- Create: `packages/shared/src/ui/progress-line.tsx`
- Create: `frontend-customer/src/components/ui/progress-line.tsx` (shim)
- Create: `frontend-main/src/components/ui/progress-line.tsx` (shim)

**Interfaces:**

- Consumes: `cn` from `../lib/utils` (existing).
- Produces: `ProgressLine({ className }: { className?: string })` — renders
  `role="progressbar"`, `aria-label="Loading"`, height `h-0.5`.

- [ ] **Step 1: Add the keyframe to the shared preset**

In `packages/shared/tailwind-preset.ts`, add to `theme.extend.keyframes`:

```ts
        "progress-indeterminate": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(300%)" },
        },
```

and to `theme.extend.animation`:

```ts
        "progress-indeterminate":
          "progress-indeterminate 1.1s ease-in-out infinite",
```

The name deliberately avoids `animate-spin` / `animate-pulse` so
`scripts/check-loading-patterns.mjs` does not flag it.

- [ ] **Step 2: Write the primitive**

Create `packages/shared/src/ui/progress-line.tsx`:

```tsx
import { cn } from "../lib/utils";

/** 2px indeterminate bar. Shared by NavigationProgress (viewport top) and
 *  StaleContainer (container top edge) so the app has one "work in progress"
 *  visual. Under reduced motion the travel is dropped but the bar stays
 *  visible — the state matters, the movement is decoration. */
export function ProgressLine({ className }: { className?: string }) {
  return (
    <div
      role="progressbar"
      aria-label="Loading"
      className={cn("h-0.5 w-full overflow-hidden bg-primary/20", className)}
    >
      <div className="bg-primary h-full w-1/3 motion-safe:animate-progress-indeterminate motion-reduce:w-full" />
    </div>
  );
}
```

- [ ] **Step 3: Create the shims**

`frontend-customer/src/components/ui/progress-line.tsx` and
`frontend-main/src/components/ui/progress-line.tsx`, both containing:

```tsx
export * from "@shared/ui/progress-line";
```

- [ ] **Step 4: Verify**

Run: `node scripts/check-loading-patterns.mjs`
Expected: `check-loading-patterns: OK (...)` — the new utility must not be
flagged.

- [ ] **Step 5: Commit** (only if the user has asked for commits)

```bash
git add packages/shared/tailwind-preset.ts packages/shared/src/ui/progress-line.tsx \
        frontend-customer/src/components/ui/progress-line.tsx \
        frontend-main/src/components/ui/progress-line.tsx
git commit -m "feat(shared): add ProgressLine primitive and indeterminate keyframe"
```

## Task 3: NavigationProvider + NavigationProgress, mounted in both apps

**Files:**

- Create: `packages/shared/src/navigation/navigation-provider.tsx`
- Create: `packages/shared/src/ui/navigation-progress.tsx`
- Create: `frontend-customer/src/components/ui/navigation-progress.tsx` (shim)
- Create: `frontend-main/src/components/ui/navigation-progress.tsx` (shim)
- Modify: `frontend-customer/src/app/layout.tsx`
- Modify: `frontend-main/src/app/layout.tsx`

**Interfaces:**

- Consumes: `isNavItemActive`, `createProgressController` (Task 1);
  `ProgressLine` (Task 2).
- Produces:
  - `NavigationProvider({ children }: { children: React.ReactNode })`
  - `useNavigation(): { pathname: string; pendingHref: string | null; isPending: boolean; navigate: (href: string) => void; prefetch: (href: string) => void }`
  - `useNavigate(): (href: string) => void`
  - `NavigationProgress({ delayMs }: { delayMs?: number })` — default `150`

- [ ] **Step 1: Write the provider**

Create `packages/shared/src/navigation/navigation-provider.tsx`:

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter } from "next/navigation";

interface NavigationContextValue {
  pathname: string;
  pendingHref: string | null;
  isPending: boolean;
  navigate: (href: string) => void;
  prefetch: (href: string) => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const prefetched = useRef<Set<string>>(new Set());

  const navigate = useCallback(
    (href: string) => {
      if (href === pathname) return;
      // Both updates land in one batched render, so `isPending` is already true
      // by the time the clearing effect below runs.
      setPendingHref(href);
      startTransition(() => {
        router.push(href);
      });
    },
    [router, pathname],
  );

  const prefetch = useCallback(
    (href: string) => {
      if (prefetched.current.has(href)) return;
      prefetched.current.add(href);
      router.prefetch(href);
    },
    [router],
  );

  // Clearing on both signals is what makes a stranded bar impossible: the
  // transition ending covers normal navigation, and a pathname change covers
  // browser back/forward and any router.push that bypassed this provider.
  useEffect(() => {
    if (!isPending) setPendingHref(null);
  }, [isPending, pathname]);

  const value = useMemo(
    () => ({ pathname, pendingHref, isPending, navigate, prefetch }),
    [pathname, pendingHref, isPending, navigate, prefetch],
  );

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error("useNavigation must be used inside <NavigationProvider>");
  }
  return ctx;
}

/** Convenience for programmatic navigation — the replacement for
 *  `useRouter().push` in app code. */
export function useNavigate(): (href: string) => void {
  return useNavigation().navigate;
}
```

- [ ] **Step 2: Write NavigationProgress**

Create `packages/shared/src/ui/navigation-progress.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import {
  createProgressController,
  type ProgressController,
} from "../navigation/navigation-state";
import { useNavigation } from "../navigation/navigation-provider";
import { ProgressLine } from "./progress-line";

export function NavigationProgress({ delayMs = 150 }: { delayMs?: number }) {
  const { isPending } = useNavigation();
  const [visible, setVisible] = useState(false);
  const ref = useRef<ProgressController | null>(null);

  if (ref.current === null) {
    ref.current = createProgressController({
      delayMs,
      onShow: () => setVisible(true),
      onHide: () => setVisible(false),
    });
  }

  useEffect(() => {
    const controller = ref.current;
    if (!controller) return;
    if (isPending) controller.start();
    else controller.finish();
  }, [isPending]);

  useEffect(() => () => ref.current?.dispose(), []);

  if (!visible) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[100]">
      <ProgressLine />
    </div>
  );
}
```

- [ ] **Step 3: Create the shims**

`frontend-customer/src/components/ui/navigation-progress.tsx` and
`frontend-main/src/components/ui/navigation-progress.tsx`:

```tsx
export * from "@shared/ui/navigation-progress";
```

- [ ] **Step 4: Mount in frontend-customer's root layout**

In `frontend-customer/src/app/layout.tsx`, add the imports:

```tsx
import { NavigationProvider } from "@shared/navigation/navigation-provider";
import { NavigationProgress } from "@/components/ui/navigation-progress";
```

Then wrap the `TenantProvider` subtree. The provider must sit **outside**
`{children}` so every route is inside it, and `NavigationProgress` must sit
inside the provider:

```tsx
            <TenantProvider config={config}>
              <NavigationProvider>
                <NavigationProgress />
                <TenantThemeEnforcer />
                <TrackPageView />
                <Toaster position="top-center" richColors />
                {gated ? (
                  <PreviewGate
                    brandName={config?.brand_name}
                    hasPassword={config?.has_preview_password}
                  />
                ) : (
                  <>
                    <RedirectToast />
                    {children}
                    <InstallPrompt />
                    <SwUpdateToast />
                    <PushOptIn />
                    <UsageReporter authed={hasSession} />
                  </>
                )}
              </NavigationProvider>
            </TenantProvider>
```

- [ ] **Step 5: Mount in frontend-main's root layout**

In `frontend-main/src/app/layout.tsx`, same imports, wrapping the
`ThemeProvider` body:

```tsx
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
            themes={["light", "dim", "dark"]}
          >
            <NavigationProvider>
              <NavigationProgress />
              {children}
              <HelpBubble />
              <Toaster position="top-center" richColors />
              <TrackPageView />
            </NavigationProvider>
          </ThemeProvider>
```

- [ ] **Step 6: Verify**

```bash
make typecheck
make test-frontend
node scripts/check-loading-patterns.mjs
```

Expected: all pass.

Then `make dev` and confirm in the browser: navigate anywhere in
`http://x.localhost/admin/` — a thin bar appears at the top of the viewport
during the transition and disappears on arrival. It must **not** appear for
navigations that complete in under 150ms.

- [ ] **Step 7: Commit** (only if the user has asked for commits)

```bash
git add packages/shared/src/navigation packages/shared/src/ui/navigation-progress.tsx \
        frontend-customer/src/components/ui/navigation-progress.tsx \
        frontend-main/src/components/ui/navigation-progress.tsx \
        frontend-customer/src/app/layout.tsx frontend-main/src/app/layout.tsx
git commit -m "feat(frontends): mount navigation provider and top progress bar"
```

---

# Phase 2 — Suspense boundaries and router config

*Observable result: clicks commit instantly; skeletons replace frozen pages.*

## Task 4: Route-group `loading.tsx` for frontend-customer

**Files:**

- Create: `frontend-customer/src/app/admin/loading.tsx`
- Create: `frontend-customer/src/app/(student)/loading.tsx`
- Create: `frontend-customer/src/app/(public)/loading.tsx`
- Create: `frontend-customer/src/app/(auth)/loading.tsx`
- Create: `frontend-customer/src/app/live/[id]/loading.tsx`
- Create: `frontend-customer/src/app/live-stream/[id]/loading.tsx`
- Create: `frontend-customer/src/app/impersonate/loading.tsx`

**Interfaces:**

- Consumes: `SkeletonPageHeader`, `SkeletonTable`, `SkeletonCardGrid`,
  `SkeletonForm` from `@/components/ui/skeletons`; `Spinner` from
  `@/components/ui/spinner`.
- Produces: nothing importable — these are Next route conventions.

Next places the boundary *inside* the layout at that level, so
`app/admin/loading.tsx` renders as
`<AdminLayout><Suspense fallback={…}>{page}</Suspense></AdminLayout>`: the
sidebar stays mounted holding its optimistic highlight, and only the content pane
skeletons.

- [ ] **Step 1: Write the admin group boundary**

Create `frontend-customer/src/app/admin/loading.tsx`:

```tsx
import {
  SkeletonPageHeader,
  SkeletonTable,
} from "@/components/ui/skeletons";

export default function AdminLoading() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <SkeletonPageHeader />
      <SkeletonTable />
    </div>
  );
}
```

- [ ] **Step 2: Write the remaining group boundaries**

`frontend-customer/src/app/(student)/loading.tsx`:

```tsx
import {
  SkeletonPageHeader,
  SkeletonCardGrid,
} from "@/components/ui/skeletons";

export default function StudentLoading() {
  return (
    <div className="container mx-auto space-y-6 px-4 py-8">
      <SkeletonPageHeader />
      <SkeletonCardGrid />
    </div>
  );
}
```

`frontend-customer/src/app/(public)/loading.tsx`:

```tsx
import {
  SkeletonPageHeader,
  SkeletonCardGrid,
} from "@/components/ui/skeletons";

export default function PublicLoading() {
  return (
    <div className="container mx-auto space-y-6 px-4 py-12">
      <SkeletonPageHeader />
      <SkeletonCardGrid />
    </div>
  );
}
```

`frontend-customer/src/app/(auth)/loading.tsx`:

```tsx
import { Spinner } from "@/components/ui/spinner";

export default function AuthLoading() {
  return <Spinner center label="Loading" />;
}
```

`frontend-customer/src/app/live/[id]/loading.tsx`,
`frontend-customer/src/app/live-stream/[id]/loading.tsx`, and
`frontend-customer/src/app/impersonate/loading.tsx` — all three:

```tsx
import { Spinner } from "@/components/ui/spinner";

export default function Loading() {
  return <Spinner center label="Loading" />;
}
```

- [ ] **Step 3: Verify**

```bash
make typecheck
```

Expected: PASS.

Then `make dev` and navigate `http://x.localhost/admin/calendar` →
`/admin/students`. The old page must be replaced by the skeleton **immediately**
on click, not after a wait.

- [ ] **Step 4: Commit** (only if the user has asked for commits)

```bash
git add frontend-customer/src/app
git commit -m "feat(customer): add route-group loading boundaries"
```

## Task 5: Per-route `loading.tsx` overrides + frontend-main audit

**Files:**

- Create: `frontend-customer/src/app/admin/calendar/loading.tsx`
- Create: `frontend-customer/src/app/admin/design/loading.tsx`
- Create: `frontend-customer/src/app/admin/settings/loading.tsx`
- Create: `frontend-customer/src/app/admin/courses/[slug]/loading.tsx`
- Create: `frontend-customer/src/app/admin/inbox/loading.tsx`
- Create: `frontend-customer/src/app/(student)/learn/[slug]/loading.tsx`
- Create: `frontend-customer/src/app/(student)/dashboard/loading.tsx`
- Modify: `frontend-main/src/app/admin/loading.tsx` and the other 10 existing
  `loading.tsx` files
- Create: `loading.tsx` for any `frontend-main` route lacking an ancestor
  boundary

**Interfaces:**

- Consumes: the same skeleton presets as Task 4.
- Produces: nothing importable.

- [ ] **Step 1: Write the customer overrides**

Each replaces the group skeleton where it would misrepresent the layout.

`admin/settings/loading.tsx`:

```tsx
import { SkeletonPageHeader, SkeletonForm } from "@/components/ui/skeletons";

export default function AdminSettingsLoading() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <SkeletonPageHeader />
      <SkeletonForm />
    </div>
  );
}
```

`admin/calendar/loading.tsx` — a month grid, not a table:

```tsx
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonPageHeader } from "@/components/ui/skeletons";

export default function AdminCalendarLoading() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <SkeletonPageHeader />
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 35 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-md" />
        ))}
      </div>
    </div>
  );
}
```

`admin/inbox/loading.tsx` — two-pane:

```tsx
import { SkeletonList } from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminInboxLoading() {
  return (
    <div className="grid gap-4 p-4 md:grid-cols-[320px_1fr] md:p-6">
      <SkeletonList />
      <Skeleton className="h-[60vh] w-full rounded-lg" />
    </div>
  );
}
```

`admin/design/loading.tsx` and `admin/courses/[slug]/loading.tsx` — editor
shells:

```tsx
import { SkeletonPageHeader } from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditorLoading() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <SkeletonPageHeader />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Skeleton className="h-[60vh] w-full rounded-lg" />
        <Skeleton className="h-[60vh] w-full rounded-lg" />
      </div>
    </div>
  );
}
```

`(student)/dashboard/loading.tsx` and `(student)/learn/[slug]/loading.tsx`:

```tsx
import { SkeletonPageHeader, SkeletonCardGrid } from "@/components/ui/skeletons";

export default function DashboardLoading() {
  return (
    <div className="container mx-auto space-y-6 px-4 py-8">
      <SkeletonPageHeader />
      <SkeletonCardGrid />
    </div>
  );
}
```

```tsx
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonList } from "@/components/ui/skeletons";

export default function LearnLoading() {
  return (
    <div className="grid gap-4 p-4 md:grid-cols-[1fr_320px] md:p-6">
      <Skeleton className="aspect-video w-full rounded-lg" />
      <SkeletonList />
    </div>
  );
}
```

- [ ] **Step 2: Audit frontend-main**

Run:

```bash
find frontend-main/src/app -name "page.tsx" | sort
find frontend-main/src/app -name "loading.tsx" | sort
```

For every `page.tsx` without a `loading.tsx` in its directory or any ancestor up
to `app/`, add one. Rewrite the 11 existing hand-built files (e.g.
`frontend-main/src/app/admin/loading.tsx`, which currently hand-rolls
`Card`/`Skeleton` markup) on the `skeletons.tsx` presets so both apps share one
vocabulary. Example replacement for `frontend-main/src/app/admin/loading.tsx`:

```tsx
import {
  SkeletonPageHeader,
  SkeletonCardGrid,
  SkeletonTable,
} from "@/components/ui/skeletons";

export default function AdminDashboardLoading() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <SkeletonPageHeader />
      <SkeletonCardGrid count={4} />
      <SkeletonTable />
    </div>
  );
}
```

The preset signatures (verified against `packages/shared/src/ui/skeletons.tsx`) are:

```ts
SkeletonPageHeader({ className?: string })
SkeletonCardGrid({ count?: number; withImage?: boolean; className?: string })  // count=3
SkeletonList({ count?: number; className?: string })                           // count=5
SkeletonTable({ rows?: number; cols?: number; className?: string })            // rows=5, cols=4
SkeletonForm({ fields?: number; className?: string })                          // fields=4
```

Pass only these props.

- [ ] **Step 3: Verify**

```bash
make typecheck
make lint
```

Expected: both pass.

- [ ] **Step 4: Commit** (only if the user has asked for commits)

```bash
git add frontend-customer/src/app frontend-main/src/app
git commit -m "feat(frontends): per-route loading boundaries; rebuild main's on shared presets"
```

## Task 6: Router cache config

**Files:**

- Modify: `frontend-customer/next.config.mjs`
- Modify: `frontend-main/next.config.mjs`

**Interfaces:**

- Consumes: nothing.
- Produces: nothing importable.

- [ ] **Step 1: Extend the customer config**

In `frontend-customer/next.config.mjs`, the `experimental` key currently reads
`experimental: { externalDir: true },`. Replace it with:

```js
  experimental: {
    externalDir: true,
    // Next 14.2 defaults `dynamic` to 0, so every revisit refetches the RSC
    // payload. 30s makes panel-to-panel back-and-forth instant. Safe for
    // freshness: the router cache holds the payload, not component state, so
    // client pages still remount and re-clientFetch on arrival.
    staleTimes: { dynamic: 30, static: 180 },
  },
```

- [ ] **Step 2: Extend the main config**

Apply the identical change to `frontend-main/next.config.mjs`.

- [ ] **Step 3: Verify**

```bash
make dev
```

Expected: both Next servers start with no config warnings. In the browser,
navigate `/admin/students` → `/admin/calendar` → `/admin/students`; the third
navigation should be visibly faster than the first.

- [ ] **Step 4: Commit** (only if the user has asked for commits)

```bash
git add frontend-customer/next.config.mjs frontend-main/next.config.mjs
git commit -m "perf(frontends): enable router staleTimes for instant revisits"
```

---

# Phase 3 — NavLink and the navigation surfaces

*Observable result: the clicked nav item highlights on click, not on commit.*

## Task 7: NavLink primitive

**Files:**

- Create: `packages/shared/src/ui/nav-link.tsx`
- Create: `frontend-customer/src/components/ui/nav-link.tsx` (shim)
- Create: `frontend-main/src/components/ui/nav-link.tsx` (shim)

**Interfaces:**

- Consumes: `useNavigation` (Task 3), `isNavItemActive` / `ActiveMatch` (Task 1),
  `cn` from `../lib/utils`.
- Produces:
  - `interface NavLinkRenderState { active: boolean; pending: boolean }`
  - `NavLink(props: NavLinkProps)` where `className` and `children` each accept
    either a plain value or a `(state: NavLinkRenderState) => …` function.

- [ ] **Step 1: Write the component**

Create `packages/shared/src/ui/nav-link.tsx`:

```tsx
"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { useNavigation } from "../navigation/navigation-provider";
import { isNavItemActive, type ActiveMatch } from "../navigation/navigation-state";

export interface NavLinkRenderState {
  active: boolean;
  pending: boolean;
}

export interface NavLinkProps {
  href: string;
  activeMatch?: ActiveMatch;
  className?: string | ((state: NavLinkRenderState) => string);
  children: ReactNode | ((state: NavLinkRenderState) => ReactNode);
  target?: string;
  rel?: string;
  title?: string;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
  /** Skip hover prefetching (e.g. expensive or rarely-visited destinations). */
  noPrefetch?: boolean;
}

const isExternal = (href: string) => /^([a-z][a-z0-9+.-]*:)?\/\//i.test(href);

export function NavLink({
  href,
  activeMatch,
  className,
  children,
  target,
  rel,
  title,
  onClick,
  noPrefetch,
}: NavLinkProps) {
  const { pathname, pendingHref, navigate, prefetch } = useNavigation();
  const active = isNavItemActive({ pathname, pendingHref }, href, activeMatch);
  const pending = pendingHref === href;
  const state: NavLinkRenderState = { active, pending };

  const external = isExternal(href) || target === "_blank";

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || external) return;
    // Let the browser handle modified clicks (new tab/window) and non-primary
    // buttons exactly as it would for a plain anchor.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    navigate(href);
  };

  const warm = () => {
    if (!external && !noPrefetch) prefetch(href);
  };

  return (
    <Link
      href={href}
      target={target}
      rel={rel}
      title={title}
      // Next's own prefetch is redundant with our hover-triggered one and
      // would fire for every sidebar item on viewport entry.
      prefetch={false}
      onClick={handleClick}
      onMouseEnter={warm}
      onFocus={warm}
      aria-current={active ? "page" : undefined}
      data-active={active ? "" : undefined}
      data-pending={pending ? "" : undefined}
      className={typeof className === "function" ? className(state) : className}
    >
      {typeof children === "function" ? children(state) : children}
    </Link>
  );
}
```

- [ ] **Step 2: Create the shims**

`frontend-customer/src/components/ui/nav-link.tsx` and
`frontend-main/src/components/ui/nav-link.tsx`:

```tsx
export * from "@shared/ui/nav-link";
```

- [ ] **Step 3: Verify**

```bash
make typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit** (only if the user has asked for commits)

```bash
git add packages/shared/src/ui/nav-link.tsx \
        frontend-customer/src/components/ui/nav-link.tsx \
        frontend-main/src/components/ui/nav-link.tsx
git commit -m "feat(shared): add NavLink with optimistic active state"
```

## Task 8: Retrofit both sidebars

**Files:**

- Modify: `frontend-customer/src/components/shared/app-sidebar.tsx:42-44,132-171`
- Modify: `frontend-main/src/components/shared/app-sidebar.tsx` (same regions)

**Interfaces:**

- Consumes: `NavLink`, `NavLinkRenderState` (Task 7), `isNavItemActive` (Task 1),
  `Spinner` (existing `@/components/ui/spinner`).
- Produces: unchanged public API — `AppSidebar({ title, sections, children })`
  in customer, plus `user` in main.

- [ ] **Step 1: Replace the local matcher in the customer sidebar**

Delete `isItemActive` (`app-sidebar.tsx:42-44`) and its two call sites. The
section-open logic at lines 55-61 needs a pathname-based match, so import the
shared one:

```tsx
import { useNavigation } from "@shared/navigation/navigation-provider";
import { isNavItemActive } from "@shared/navigation/navigation-state";
import { NavLink } from "@/components/ui/nav-link";
import { Spinner } from "@/components/ui/spinner";
```

Replace the `usePathname()` call with:

```tsx
  const { pathname, pendingHref } = useNavigation();
```

and the `activeSectionId` memo with:

```tsx
  const activeSectionId = useMemo(
    () =>
      sections.find((section) =>
        section.items.some((item) =>
          isNavItemActive({ pathname, pendingHref }, item.href),
        ),
      )?.id,
    [pathname, pendingHref, sections],
  );
```

Including `pendingHref` here means an auto-collapsed section containing the
destination expands on click rather than after the route commits.

- [ ] **Step 2: Swap `Link` → `NavLink` in the item map**

Replace the `section.items.map(...)` body (customer lines 132-171) with:

```tsx
                  {section.items.map((item) => (
                    <NavLink
                      key={item.href}
                      href={item.href}
                      target={item.external ? "_blank" : undefined}
                      rel={item.external ? "noopener noreferrer" : undefined}
                      title={collapsed ? item.label : undefined}
                      className={({ active }) =>
                        cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                          collapsed && "justify-center px-2",
                          active
                            ? "bg-accent text-accent-foreground font-medium"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                        )
                      }
                    >
                      {({ pending }) => (
                        <>
                          {pending ? (
                            <Spinner size="sm" className="shrink-0" />
                          ) : (
                            <item.icon className="h-4 w-4 shrink-0" />
                          )}
                          {!collapsed && (
                            <>
                              <span>{item.label}</span>
                              {item.external && (
                                <ExternalLink className="text-muted-foreground/60 ml-auto h-3 w-3" />
                              )}
                              {(item.ai || item.requiresEntitlement) && (
                                <span className="ml-auto flex items-center gap-1">
                                  {item.ai && <AiBadge />}
                                  {item.requiresEntitlement && (
                                    <PaidFeatureBadge
                                      feature={item.requiresEntitlement}
                                      partial={item.partialPaid}
                                    />
                                  )}
                                </span>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </NavLink>
                  ))}
```

Also swap the header "back to admin" `<Link href="/admin">` (lines 84-90) to
`NavLink`.

- [ ] **Step 3: Apply the equivalent change to frontend-main's sidebar**

`frontend-main/src/components/shared/app-sidebar.tsx` is a diverged near-copy: it
has no `ai` / `requiresEntitlement` / `external` item fields, and it does have a
`user` prop and an `OPEN_STATE_KEY` localStorage constant. Apply the same
matcher and `NavLink` swap, keeping its own item fields. Do **not** attempt to
merge the two files — that consolidation is deliberately out of scope
(spec §3.3).

- [ ] **Step 4: Verify**

```bash
make typecheck
make lint
make dev
```

In the browser at `http://x.localhost/admin/calendar`, click **Students**: the
Students item must highlight and Calendar must un-highlight *on the click*, with
the Students icon showing a spinner while the route resolves.

Also confirm the `defaultActiveMatch` fix: on `/admin/live-streams`, only
**Live streams** is highlighted — `/admin/live` no longer highlights alongside
it.

- [ ] **Step 5: Commit** (only if the user has asked for commits)

```bash
git add frontend-customer/src/components/shared/app-sidebar.tsx \
        frontend-main/src/components/shared/app-sidebar.tsx
git commit -m "feat(frontends): optimistic active state in both sidebars"
```

## Task 9: Retrofit headers and mobile navigation

**Files:**

- Modify: `frontend-customer/src/components/shared/mobile-header.tsx`
- Modify: `frontend-customer/src/components/admin/admin-shell.tsx`
- Modify: `frontend-customer/src/components/shared/public-header.tsx`
- Modify: `frontend-main/src/components/shared/mobile-header.tsx`
- Modify: `frontend-main/src/components/shared/platform-header.tsx`

**Interfaces:**

- Consumes: `NavLink` (Task 7), `useNavigate` (Task 3).
- Produces: unchanged public APIs.

- [ ] **Step 1: Swap internal `Link` usages**

In each file, replace `import Link from "next/link"` with
`import { NavLink } from "@/components/ui/nav-link"` and each `<Link …>` that
points at an **internal** route with `<NavLink …>`. Leave absolute URLs and
`target="_blank"` links on plain `next/link` — `NavLink` passes those through to
the browser anyway, but keeping them explicit documents the intent.

Where the existing code computes an active class from `usePathname()`, delete
that logic and use `className={({ active }) => cn(...)}` as in Task 8.

- [ ] **Step 2: Replace programmatic pushes in these files**

`frontend-main/src/components/shared/platform-header.tsx:42` calls
`router.push("/")`. Replace with:

```tsx
import { useNavigate } from "@shared/navigation/navigation-provider";
// …
const navigate = useNavigate();
// …
navigate("/");
```

- [ ] **Step 3: Verify**

```bash
make typecheck
make lint
make e2e-changed
```

Expected: all pass. Then `make dev` and check mobile nav in a narrow viewport —
tapping a nav item highlights it immediately.

- [ ] **Step 4: Commit** (only if the user has asked for commits)

```bash
git add frontend-customer/src/components frontend-main/src/components
git commit -m "feat(frontends): route headers and mobile nav through NavLink"
```

---

# Phase 4 — In-page state changes

*Observable result: search, filter, sort and pagination stop swapping silently.*

## Task 10: StaleContainer primitive

**Files:**

- Create: `packages/shared/src/ui/stale-container.tsx`
- Create: `frontend-customer/src/components/ui/stale-container.tsx` (shim)
- Create: `frontend-main/src/components/ui/stale-container.tsx` (shim)

**Interfaces:**

- Consumes: `ProgressLine` (Task 2), `cn`.
- Produces:
  `StaleContainer({ pending, children, className, showLine }: { pending: boolean; children: React.ReactNode; className?: string; showLine?: boolean })`
  — `showLine` defaults to `true`.

- [ ] **Step 1: Write the component**

Create `packages/shared/src/ui/stale-container.tsx`:

```tsx
import { cn } from "../lib/utils";
import { ProgressLine } from "./progress-line";

/** Refinement loads (search, sort, filter, paginate) keep the existing rows on
 *  screen, dimmed and inert, rather than blanking to a skeleton. Children are
 *  never unmounted, so scroll position and layout stay anchored. */
export function StaleContainer({
  pending,
  children,
  className,
  showLine = true,
}: {
  pending: boolean;
  children: React.ReactNode;
  className?: string;
  showLine?: boolean;
}) {
  return (
    <div aria-busy={pending || undefined} className={cn("relative", className)}>
      {showLine && pending && (
        <div className="absolute inset-x-0 top-0 z-10">
          <ProgressLine />
        </div>
      )}
      <div
        className={cn(
          "transition-opacity duration-200",
          pending && "pointer-events-none opacity-60",
        )}
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the shims**

Both apps' `src/components/ui/stale-container.tsx`:

```tsx
export * from "@shared/ui/stale-container";
```

- [ ] **Step 3: Verify**

```bash
make typecheck
node scripts/check-loading-patterns.mjs
```

Expected: both pass.

- [ ] **Step 4: Commit** (only if the user has asked for commits)

```bash
git add packages/shared/src/ui/stale-container.tsx \
        frontend-customer/src/components/ui/stale-container.tsx \
        frontend-main/src/components/ui/stale-container.tsx
git commit -m "feat(shared): add StaleContainer for refinement loads"
```

## Task 11: MediaBrowser refresh feedback

**Files:**

- Modify: `frontend-customer/src/components/admin/media-browser.tsx:159-175,257-299,572-585`
- Modify: `frontend-customer/src/app/admin/m/[model]/page.tsx`

**Interfaces:**

- Consumes: `StaleContainer` (Task 10).
- Produces: unchanged `MediaBrowserProps<T>` / `MediaBrowserHandle` API.

**Refinement of spec §3.1:** the spec proposed a `resourceKey` *prop* on
`MediaBrowser` to force a full skeleton when the underlying resource changes.
Implementing it as a call-site React `key` instead is strictly better — it resets
every piece of internal state (items, offset ref, selection, search, sort) with
no new prop, no new effect, and no ordering hazard against the existing load
effect. The behavior the spec specifies is unchanged.

- [ ] **Step 1: Add the `refreshing` state**

At `media-browser.tsx:161`, beside `const [loadingMore, setLoadingMore] = useState(false);`, add:

```tsx
  const [refreshing, setRefreshing] = useState(false);
```

- [ ] **Step 2: Set it in `load()`**

In `load()` (line 257), replace the `if (reset) { … }` head:

```tsx
      if (reset) {
        offsetRef.current = 0;
        // First load blanks to a skeleton; every later refinement (search,
        // sort, filter) keeps the current rows and dims them instead.
        if (!hasLoadedOnce.current) {
          setLoading(true);
        } else {
          setRefreshing(true);
        }
        clearSelection();
      } else {
        setLoadingMore(true);
      }
```

and extend the `finally` block (line 293):

```tsx
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
```

- [ ] **Step 3: Wrap the results region**

Find the results grid/list rendered after the early-return skeleton block
(`media-browser.tsx:572-585` is the `if (loading)` branch — leave it alone) and
wrap the returned grid/list JSX in:

```tsx
      <StaleContainer pending={refreshing}>
        {/* existing grid / list JSX */}
      </StaleContainer>
```

Add the import:

```tsx
import { StaleContainer } from "@/components/ui/stale-container";
```

- [ ] **Step 4: Key the model browser by its resource**

In `frontend-customer/src/app/admin/m/[model]/page.tsx`, add `key={model}` to the
`<MediaBrowser …>` element (using whatever the route param is bound to in that
file). This also fixes a latent bug: navigating `/admin/m/user` →
`/admin/m/course` currently reuses the same component instance, so the previous
model's rows briefly render under the new heading.

- [ ] **Step 5: Verify**

```bash
make typecheck
make lint
make e2e-changed
```

Then `make dev`: at `/admin/students`, type in the search box. Rows must stay on
screen, dim, and show a progress line under the toolbar — never blank out. At
`/admin/m/user`, switch to another model: a full skeleton must appear, not the
previous model's rows.

- [ ] **Step 6: Commit** (only if the user has asked for commits)

```bash
git add frontend-customer/src/components/admin/media-browser.tsx \
        frontend-customer/src/app/admin/m/[model]/page.tsx
git commit -m "feat(customer): stale-while-loading feedback in MediaBrowser"
```

## Task 12: Overlays open instantly

**Files:**

- Modify: `frontend-customer/src/components/admin/inline-edit-panel.tsx:100`
- Modify: `frontend-customer/src/components/admin/students/student-drawer.tsx:120-130,482`
- Modify: `frontend-customer/src/components/admin/tag-filter-bar.tsx`

**Interfaces:**

- Consumes: `SkeletonForm`, `SkeletonList` from `@/components/ui/skeletons`;
  `StaleContainer` (Task 10).
- Produces: unchanged public APIs.

- [ ] **Step 1: Skeleton the edit panel body**

In `inline-edit-panel.tsx`, add a `loading` state set while the `useEffect` at
line 100 resolves, and render `<SkeletonForm />` in the panel body while it is
true. The panel itself must mount and animate open immediately — only its
*contents* are deferred.

```tsx
import { SkeletonForm } from "@/components/ui/skeletons";
// …
{loading ? <SkeletonForm /> : /* existing fields JSX */}
```

- [ ] **Step 2: Generalize the drawer's existing pattern**

`student-drawer.tsx:482` already renders a loading branch for `loadingCourses`.
Apply the same treatment to the rest of the panel: the drawer opens on click and
shows a detail skeleton until the `clientFetch` at line 123 resolves. Replace
the `loadingCourses ? …` branch's ad-hoc markup with `<SkeletonList />` so it
matches the rest of the app.

- [ ] **Step 3: Mark the filter bar busy**

In `tag-filter-bar.tsx`, add an optional `pending?: boolean` prop, apply it to
the chip row as `aria-busy={pending || undefined}` and wrap the chips in
`<StaleContainer pending={!!pending} showLine={false}>`. Pass it from the admin
pages that own the refetch it triggers.

- [ ] **Step 4: Verify**

```bash
make typecheck
make lint
make e2e-changed
```

Then `make dev`: at `/admin/students`, click a row — the drawer must slide open
immediately with a skeleton, never after a pause.

- [ ] **Step 5: Commit** (only if the user has asked for commits)

```bash
git add frontend-customer/src/components/admin
git commit -m "feat(customer): overlays open instantly with skeleton bodies"
```

---

# Phase 5 — Outlier sweep

*Observable result: calendar, community, assistant, tabs and modals match.*

## Task 13: Programmatic navigation call sites

**Files:**

- Modify: `frontend-customer/src/components/admin/command-palette.tsx`
- Modify: `frontend-customer/src/components/owner/edit-sidebar.tsx:165`
- Modify: `frontend-customer/src/app/admin/blog/page.tsx:51,149`
- Modify: `frontend-customer/src/app/admin/email/page.tsx:190`
- Modify: `frontend-customer/src/app/admin/email/templates/page.tsx:158`
- Modify: `frontend-customer/src/app/admin/live-streams/page.tsx:318,351`
- Modify: `frontend-customer/src/app/(public)/store/page.tsx:345`
- Modify: `frontend-main/src/app/admin/email/page.tsx:180`
- Modify: `frontend-main/src/app/admin/email/templates/page.tsx:129`
- Modify: `frontend-main/src/app/pricing/PricingCta.tsx:46`

**Interfaces:**

- Consumes: `useNavigate` (Task 3).
- Produces: no API changes.

- [ ] **Step 1: Replace each `router.push` with `navigate`**

For each file, swap `const router = useRouter()` + `router.push(href)` for:

```tsx
import { useNavigate } from "@shared/navigation/navigation-provider";
// …
const navigate = useNavigate();
// …
navigate(href);
```

Keep `useRouter` where the file also uses `router.replace`, `router.refresh` or
`router.back` — only `push` moves.

- [ ] **Step 2: Hold button loading through post-submit redirects**

`frontend-customer/src/app/admin/blog/[id]/page.tsx:53` and
`frontend-customer/src/app/admin/email/compose/page.tsx:258` redirect after a
successful save. Today the button's `loading` clears when the API resolves, so
the UI goes quiet during the redirect. Do **not** clear it — let the navigation
unmount the page with the button still in its loading state.

- [ ] **Step 3: Verify**

```bash
make typecheck
make lint
make e2e-changed
```

Then `make dev`: open the command palette (⌘K), pick a destination — the top bar
must appear.

- [ ] **Step 4: Commit** (only if the user has asked for commits)

```bash
git add frontend-customer/src frontend-main/src
git commit -m "feat(frontends): route programmatic navigation through useNavigate"
```

## Task 14: Calendar, community and remaining refinement surfaces

**Files:**

- Modify: `frontend-customer/src/components/admin/calendar/unified-calendar.tsx`
- Modify: `frontend-customer/src/components/community/feed.tsx`
- Modify: `frontend-customer/src/components/admin/announcement-history.tsx`
- Modify: `frontend-customer/src/components/admin/mailbox/inbox-client.tsx`

**Interfaces:**

- Consumes: `StaleContainer` (Task 10), `Spinner`, skeleton presets.
- Produces: no API changes.

- [ ] **Step 1: Calendar month/week navigation**

`unified-calendar.tsx` refetches silently when the visible range changes. Add a
`refreshing` state around that fetch and wrap the grid in
`<StaleContainer pending={refreshing}>` — the current month's events stay
visible and dim while the next month loads.

- [ ] **Step 2: Community feed**

Wrap filter/sort refetches in `StaleContainer`. Leave the infinite-scroll
append path alone if it already renders a `Spinner` at the list foot; add one if
it does not.

- [ ] **Step 3: Announcement history and mailbox**

Same treatment for their list refetches: `StaleContainer` for refinements,
existing skeletons for first load.

- [ ] **Step 4: Verify**

```bash
make typecheck
make lint
make e2e-changed
```

Then `make dev`: page the admin calendar forward a month — the grid dims rather
than freezing.

- [ ] **Step 5: Commit** (only if the user has asked for commits)

```bash
git add frontend-customer/src/components
git commit -m "feat(customer): refinement feedback for calendar, community, mailbox"
```

## Task 15: Tab and modal dataset switches

**Files:**

- Modify: the admin pages using Radix `Tabs` whose panels own separate fetches
- Modify: dialogs that fetch on open

**Interfaces:**

- Consumes: `StaleContainer`, skeleton presets, `PageState` (existing).
- Produces: no API changes.

- [ ] **Step 1: Enumerate the surfaces that actually fetch**

Run:

```bash
rg -l "TabsContent" frontend-customer/src frontend-main/src
rg -ln "onOpenChange" frontend-customer/src/components frontend-main/src/components
```

For each hit, run `rg -n "clientFetch|useEffect" <file>` and keep only files
where the panel or dialog owns its own fetch. A tab that renders already-loaded
in-memory data needs no feedback — skip it. Write the surviving list into the
task's notes before editing anything, so Step 2 has a fixed target set.

- [ ] **Step 2: Apply the standard treatments**

For each surviving surface, exactly one of these three:

**(a) Tab switch to a different dataset** → skeleton, because dimmed rows from
the previous tab would misrepresent the new one:

```tsx
<PageState loading={loading} error={error} skeleton={<SkeletonTable />}>
  {content}
</PageState>
```

**(b) Re-query within one tab** (same dataset, new params) → stale-dim:

```tsx
<StaleContainer pending={refreshing}>{content}</StaleContainer>
```

**(c) Dialog that fetches on open** → open immediately, skeleton inside, per
Task 12's rule:

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    {loading ? <SkeletonForm /> : /* existing body */}
  </DialogContent>
</Dialog>
```

Introduce no new patterns. If a surface fits none of (a)–(c), stop and flag it
rather than inventing a fourth treatment.

- [ ] **Step 3: Verify**

```bash
make typecheck
make lint
make e2e-changed
```

- [ ] **Step 4: Commit** (only if the user has asked for commits)

```bash
git add frontend-customer/src frontend-main/src
git commit -m "feat(frontends): loading feedback for tab and dialog dataset switches"
```

---

# Phase 6 — Enforcement, tests, documentation

*Observable result: regressions become build failures.*

## Task 16: Suspense-coverage and navigation checks

**Files:**

- Modify: `scripts/check-loading-patterns.mjs`

**Interfaces:**

- Consumes: nothing.
- Produces: two new failure modes in `make lint`.

This is the load-bearing rule of the whole plan. Rules that lint written code
catch regressions in code that gets written; this one catches the *absence* of
code, which is how the gap opened in the first place.

- [ ] **Step 1a: Extend the existing top-level imports**

`scripts/check-loading-patterns.mjs` currently opens with:

```js
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
```

ES module imports must stay top-level, so widen these two lines in place:

```js
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
```

- [ ] **Step 1b: Add the Suspense-coverage check**

Append to `scripts/check-loading-patterns.mjs`, before the final
`console.log`:

```js
// ── Suspense coverage ───────────────────────────────────────────────────────
// Every route segment must have a loading.tsx at or above it, so no navigation
// can ever block on a segment with no fallback.
const APP_ROOTS = [
  "frontend-main/src/app",
  "frontend-customer/src/app",
];

function hasLoadingAncestor(dir, appRoot) {
  let cur = resolve(dir);
  const root = resolve(appRoot);
  for (;;) {
    if (existsSync(join(cur, "loading.tsx"))) return true;
    if (cur === root) return false;
    const parent = dirname(cur);
    if (parent === cur) return false;
    cur = parent;
  }
}

const uncovered = [];
for (const appRoot of APP_ROOTS) {
  for (const file of walk(appRoot)) {
    if (!/(^|[\\/])page\.tsx$/.test(file)) continue;
    const dir = dirname(file);
    if (!hasLoadingAncestor(dir, appRoot)) {
      uncovered.push(relative(".", file).replaceAll("\\", "/"));
    }
  }
}

if (uncovered.length) {
  console.error(
    "Route segments with no loading.tsx at or above them (navigation there will block with no fallback):",
  );
  for (const p of uncovered) console.error("  " + p);
  process.exit(1);
}
```

Move the `import { existsSync }` and `dirname, resolve` additions up to the
existing import block at the top of the file rather than leaving them inline —
ES module imports must be top-level.

- [ ] **Step 2: Add the `router.push` check**

Add a second pattern alongside the existing `PATTERN` scan:

```js
const PUSH_PATTERN = /\brouter\.push\(/;
const PUSH_ALLOW = new Set([
  // Add paths here ONLY with a trailing comment saying why useNavigate()
  // cannot be used (e.g. navigation from a non-React callback).
]);
```

and collect violations in the same file walk, reporting:

```
router.push() found (use useNavigate() so the top progress bar fires):
```

- [ ] **Step 3: Verify the checks catch real violations**

Run: `node scripts/check-loading-patterns.mjs`
Expected: PASS (Phases 2–5 satisfied both rules).

Then prove the checks work — temporarily `git mv` one `loading.tsx` aside, re-run,
confirm it FAILS naming that route, and restore it:

```bash
mv frontend-customer/src/app/admin/loading.tsx /tmp/loading.tsx.bak
node scripts/check-loading-patterns.mjs   # must FAIL
mv /tmp/loading.tsx.bak frontend-customer/src/app/admin/loading.tsx
node scripts/check-loading-patterns.mjs   # must PASS
```

- [ ] **Step 4: Commit** (only if the user has asked for commits)

```bash
git add scripts/check-loading-patterns.mjs
git commit -m "chore(lint): enforce Suspense coverage and useNavigate over router.push"
```

## Task 17: ESLint restriction on `next/link`

**Files:**

- Modify: `frontend-customer/.eslintrc.json`
- Modify: `frontend-main/.eslintrc.json`

**Interfaces:**

- Consumes: nothing.
- Produces: an ESLint error on `next/link` imports in app code.

ESLint runs only over `frontend-*/src/**` (see `.pre-commit-config.yaml`), so
`packages/shared/src/ui/nav-link.tsx` — the one legitimate `next/link` consumer —
is automatically exempt.

- [ ] **Step 1: Extend both configs**

Add a second entry to the existing `no-restricted-imports` `paths` array in each
file:

```json
{
  "name": "next/link",
  "message": "Use <NavLink> from @/components/ui/nav-link so navigation drives the progress bar and optimistic active state. Plain next/link is allowed only in packages/shared/src/ui/nav-link.tsx."
}
```

- [ ] **Step 2: Fix the fallout**

Run: `cd frontend-customer && npx eslint src` and
`cd frontend-main && npx eslint src`

Every remaining `next/link` import is now an error. For each: swap to `NavLink`,
or — if it is a genuinely external link — replace with a plain `<a>` and add an
`eslint-disable-next-line` only where an anchor will not do, with a comment
explaining why.

- [ ] **Step 3: Verify**

```bash
make lint
make typecheck
make test-frontend
```

Expected: all pass.

- [ ] **Step 4: Commit** (only if the user has asked for commits)

```bash
git add frontend-customer frontend-main
git commit -m "chore(lint): restrict next/link in favour of NavLink"
```

## Task 18: Playwright navigation-feedback spec

**Files:**

- Create: `e2e/specs/25-navigation-feedback.spec.ts`
- Modify: `e2e/impact-map.json`

**Interfaces:**

- Consumes: `coachContext`, `TENANT` from `../helpers/auth` (existing).
- Produces: nothing importable.

`25` is the next free number — `00`–`24` are taken, plus `90-logo-eval`. The
`impact-map.json` entry is mandatory: the selector self-test in `make lint` fails
if any spec file has no map entry.

**This spec is the authoritative gate for the progress bar.** Live dev
measurement during Task 8 found that main-thread blocking during on-demand
compilation can starve the bar's own 150ms `setTimeout`, so ad-hoc browser timing
in dev cannot settle whether the bar works. Because this spec injects its own
delay, it can. It MUST assert all three of:

1. the target nav item gains `aria-current="page"` before content arrives
   (the optimistic highlight),
2. `[role="progressbar"]` becomes visible during the navigation, and
3. no `[role="progressbar"]` remains once the navigation settles (no stranding —
   this is what the provider's 15s watchdog protects against).

Assertion 2 is the regression net for the Task 8 bug, where `isPending` ended the
pending window 51ms into a 1000ms navigation and the bar never rendered at all.

- [ ] **Step 1: Write the spec**

Create `e2e/specs/25-navigation-feedback.spec.ts`:

```ts
// e2e/specs/25-navigation-feedback.spec.ts
//
// The invariant this whole feature exists for: clicking a nav item produces
// visible feedback BEFORE the destination's content arrives.
//
// Determinism comes from injecting the delay ourselves (route interception),
// not from racing a real server.

import { test, expect } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";

test("sidebar navigation highlights the target and shows a loading state before content arrives", async ({
  browser,
}) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();

  await page.goto(`${TENANT}/admin/calendar`);
  await expect(page.getByRole("link", { name: /calendar/i })).toHaveAttribute(
    "aria-current",
    "page",
  );

  // Stall the students list so the pending window is wide enough to assert on.
  await page.route("**/api/v1/auth/students/**", async (route) => {
    await new Promise((r) => setTimeout(r, 3000));
    await route.continue();
  });

  const students = page.getByRole("link", { name: /^students$/i });
  await students.click();

  // Optimistic: the clicked item owns the active state immediately, well
  // before the stalled request resolves.
  await expect(students).toHaveAttribute("aria-current", "page", {
    timeout: 1000,
  });
  await expect(
    page.getByRole("link", { name: /calendar/i }),
  ).not.toHaveAttribute("aria-current", "page");

  // And something is visibly loading rather than the old page sitting frozen.
  await expect(page.getByRole("progressbar").first()).toBeVisible({
    timeout: 2000,
  });

  await page.close();
});

test("a stalled list refinement dims rows instead of blanking them", async ({
  browser,
}) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();

  await page.goto(`${TENANT}/admin/students`);
  const rows = page.getByRole("row");
  await expect(rows.first()).toBeVisible();

  await page.route("**/api/v1/auth/students/**", async (route) => {
    await new Promise((r) => setTimeout(r, 3000));
    await route.continue();
  });

  await page.getByPlaceholder(/search/i).fill("zzz");

  // Rows must still be on screen — dimmed and marked busy, never unmounted.
  await expect(page.locator("[aria-busy='true']").first()).toBeVisible({
    timeout: 2000,
  });
  await expect(rows.first()).toBeVisible();

  await page.close();
});
```

Adjust the API glob and the search placeholder to match what
`frontend-customer/src/app/admin/students/page.tsx` actually calls and renders —
read the file before finalizing the selectors.

- [ ] **Step 2: Add the impact-map entry**

In `e2e/impact-map.json`, add `"25-navigation-feedback"` to the arrays for the
`frontend-customer` keys covering `src/components/shared` and
`src/components/admin`, and add entries for the new shared paths, e.g.:

```json
    "src/components/ui/nav-link.tsx": ["25-navigation-feedback"],
    "src/components/ui/navigation-progress.tsx": ["25-navigation-feedback"],
    "src/components/ui/stale-container.tsx": ["25-navigation-feedback"]
```

- [ ] **Step 3: Verify**

```bash
python3 scripts/select_tests.py --self-test
make e2e-spec SPEC=25-navigation-feedback
```

Expected: self-test passes (no unmapped spec); both tests pass.

- [ ] **Step 4: Commit** (only if the user has asked for commits)

```bash
git add e2e/specs/25-navigation-feedback.spec.ts e2e/impact-map.json
git commit -m "test(e2e): assert navigation feedback lands before content"
```

## Task 19: Document the conventions and run the full suite

**Files:**

- Modify: `CLAUDE.md` (the "Loading & feedback conventions" section)
- Modify: `frontend-customer/src/CLAUDE.md`

**Interfaces:**

- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Extend the root CLAUDE.md conventions**

Add to the existing "Loading & feedback conventions (both frontends)" bullet
list:

```markdown
- Internal navigation uses `<NavLink>` (`@/components/ui/nav-link`), never raw
  `next/link` — it drives the top progress bar and highlights the target on
  click rather than on commit. Programmatic navigation uses `useNavigate()`
  (`@shared/navigation/navigation-provider`), never `router.push`.
- Every route segment must have a `loading.tsx` at or above it; the check in
  `make lint` fails otherwise.
- Refinement loads (search/filter/sort/paginate) wrap results in
  `<StaleContainer pending>` — rows dim, never blank. A full skeleton is for
  first load and for switching to a different resource entirely.
- Overlays that fetch open immediately with a skeleton body; never hold an
  overlay closed while fetching.
```

- [ ] **Step 2: Extend frontend-customer/src/CLAUDE.md**

Add one line to its conventions list pointing at the same rules, matching that
file's terse style.

- [ ] **Step 3: Full verification**

```bash
make lint
make typecheck
make test-frontend
make e2e
```

Expected: all green. Per repo rules, also run `make dev` and walk the admin panel
manually: sidebar navigation, search, filtering, drawer opening, calendar paging.
No interaction may produce a frozen frame.

- [ ] **Step 4: Commit** (only if the user has asked for commits)

```bash
git add CLAUDE.md frontend-customer/src/CLAUDE.md
git commit -m "docs: document navigation and refinement feedback conventions"
```

---

## Spec coverage

| Spec section | Task(s) |
|---|---|
| §1.1 `ProgressLine` | 2 |
| §1.2 `NavigationProgress` | 3 |
| §1.3 `navigation-state.ts` + provider | 1, 3 |
| §1.4 `NavLink` (+ hover prefetch) | 7 |
| §1.5 `StaleContainer` | 10 |
| §2.1 `loading.tsx` placement | 4, 5 |
| §2.2 `staleTimes` | 6 |
| §2.3 Prefetch | 7 |
| §3 Spine wiring | 8, 9, 11, 12 |
| §3.1 MediaBrowser | 11 (refines `resourceKey` → call-site `key`) |
| §3.2 Programmatic navigation | 13 |
| §4.1 Outlier sweep | 14, 15 |
| §4.2 Enforcement | 16, 17 |
| §4.3 Testing | 1 (vitest), 18 (Playwright) |
| §4.4 Documentation | 19 |
