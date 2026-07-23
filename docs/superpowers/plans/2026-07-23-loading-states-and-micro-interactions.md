# Loading States & Micro-Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every user-facing action in frontend-main and frontend-customer gets consistent in-flight feedback (loading buttons, shimmer skeletons, content fade-in, toasts), built on shared primitives and enforced by lint.

**Architecture:** New/reworked primitives live in the source-only shared package (`packages/shared/src/`, consumed via the `@shared/*` alias; app-local shims re-export from `src/components/ui/`). Apps are then mechanically retrofitted (main first, customer in three chunks). Enforcement (ESLint + check script) lands LAST so `make lint` passes at every commit.

**Tech Stack:** Next.js 14 App Router, Tailwind 3.4 (+ shared preset), sonner 2, lucide-react, cva, vitest 4 (pure-logic tests only, per repo convention).

**Spec:** `docs/superpowers/specs/2026-07-23-loading-states-design.md`

## Global Constraints

- CSS/Tailwind motion only — NO framer-motion in frontend-customer, no route transitions.
- All decorative motion gated behind `motion-safe:` (reduced-motion users get static skeletons, no press scale; loading *states* always remain).
- Shared-package rules (`packages/shared/CLAUDE.md`): internal imports are relative, never `@/...`; apps consume via 1-line re-export shims; changes affect BOTH apps — verify with `make typecheck` and `make test-frontend`.
- Repo convention (frontend-customer/vitest.config.ts): vitest is for pure-logic tests only; React components are covered by `npm run build` + Playwright e2e. So the hook's core is a pure function with unit tests; components are verified by typecheck/build/e2e.
- frontend-main is i18n'd (next-intl, EN+TR). Any new user-facing string in a component that already uses `useTranslations` must be added to BOTH catalogs (`make check-i18n` gates parity). Components without i18n keep their existing literal-string style.
- Pre-commit must pass (prettier formats all new files; run `make format` before committing if unsure).
- Never run `git push`. Commit per task.
- After the retrofit tasks, `make e2e-changed` needs the dev stack up (`make dev`).

---

### Task 1: Shared Tailwind preset (shimmer / fade-in / fade-in-up)

**Files:**
- Create: `packages/shared/tailwind-preset.ts`
- Modify: `frontend-main/tailwind.config.ts` (add `presets`)
- Modify: `frontend-customer/tailwind.config.ts` (add `presets`)

**Interfaces:**
- Consumes: nothing.
- Produces: Tailwind utilities `animate-shimmer`, `animate-fade-in`, `animate-fade-in-up` available in both apps and in `packages/shared/src/**` markup. Later tasks (Skeleton, PageState) rely on these exact names.

- [ ] **Step 1: Create the preset**

```ts
// packages/shared/tailwind-preset.ts
import type { Config } from "tailwindcss";

// Loading/feedback motion shared by both apps. Decorative only — callers gate
// usage behind `motion-safe:` so reduced-motion users get static equivalents.
const preset: Partial<Config> = {
  theme: {
    extend: {
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.8s linear infinite",
        "fade-in": "fade-in 0.2s ease-out both",
        "fade-in-up": "fade-in-up 0.2s ease-out both",
      },
    },
  },
};

export default preset;
```

- [ ] **Step 2: Wire into both app configs**

In `frontend-main/tailwind.config.ts` and `frontend-customer/tailwind.config.ts`, add the import and a `presets` key (top of the config object, before `darkMode`):

```ts
import sharedPreset from "../packages/shared/tailwind-preset";

const config: Config = {
  presets: [sharedPreset],
  // ...existing darkMode/content/theme untouched
```

frontend-main keeps its own landing-page keyframes (`reveal`, `marquee`, etc.) — they merge with the preset; do not move them.

- [ ] **Step 3: Verify both apps compile**

Run: `make typecheck`
Expected: exit 0 for both apps.

Run: `cd frontend-customer && npx tailwindcss --help >/dev/null && cd ..` is NOT needed — instead prove utility generation:

```bash
cd frontend-customer && echo '<div class="motion-safe:animate-shimmer animate-fade-in-up"></div>' > /tmp/tw-probe.html && npx tailwindcss --content /tmp/tw-probe.html --config tailwind.config.ts -o /tmp/tw-probe.css && grep -c "fade-in-up\|shimmer" /tmp/tw-probe.css && cd ..
```

Expected: count ≥ 2 (both animations generated).

- [ ] **Step 4: Commit**

```bash
git add packages/shared/tailwind-preset.ts frontend-main/tailwind.config.ts frontend-customer/tailwind.config.ts
git commit -m "feat(shared): add loading-motion tailwind preset (shimmer, fade-in, fade-in-up)"
```

---

### Task 2: Button rework — width-preserving loading, loadingText, asChild, press feedback

**Files:**
- Modify: `packages/shared/src/ui/button.tsx` (full replacement below)

**Interfaces:**
- Consumes: `animate-spin` (Tailwind built-in), existing `cn`, `Slot`, `cva`.
- Produces: `ButtonProps` gains `loadingText?: string`. Behavior contract for ALL later tasks:
  - `loading` (no `loadingText`): children stay mounted but invisible, spinner absolutely centered → button width never jumps; button `disabled` + `aria-busy`.
  - `loading` + `loadingText`: spinner + `loadingText` replace children (explicit width change).
  - `asChild` + `loading`: `aria-busy`, `pointer-events-none opacity-50`, NO spinner (documented limitation).
  - Base variants gain `relative` and `motion-safe:active:scale-[0.98]` — every button gets press feedback with no call-site change.

- [ ] **Step 1: Replace the component**

Full new content of `packages/shared/src/ui/button.tsx`:

```tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "../lib/utils";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-50 motion-safe:active:scale-[0.98] [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:border-destructive aria-invalid:ring-destructive/20",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 shadow-xs focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        outline:
          "border bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-xs",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        // Legacy "brand" — now the standard primary action in the house palette.
        brand:
          "bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs",
        glass:
          "bg-card text-card-foreground border shadow-xs hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 gap-1.5 px-3 text-xs",
        lg: "h-10 px-6",
        xl: "h-12 px-8 text-base",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  /** When loading, show spinner + this text instead of overlaying children. */
  loadingText?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      loadingText,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    if (asChild) {
      // Slot can't inject a spinner into an arbitrary child; loading only
      // blocks interaction and signals busy.
      return (
        <Slot
          data-slot="button"
          aria-busy={loading || undefined}
          className={cn(
            buttonVariants({ variant, size, className }),
            loading && "pointer-events-none opacity-50",
          )}
          ref={ref}
          {...props}
        >
          {children}
        </Slot>
      );
    }
    return (
      <button
        data-slot="button"
        aria-busy={loading || undefined}
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          loadingText ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              {loadingText}
            </>
          ) : (
            <>
              <span className="absolute inset-0 inline-flex items-center justify-center">
                <Loader2 className="animate-spin" aria-hidden="true" />
              </span>
              <span
                aria-hidden="true"
                className="invisible inline-flex items-center gap-2"
              >
                {children}
              </span>
            </>
          )
        ) : (
          children
        )}
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
```

Note: the spinner `Loader2` gets its size from the base `[&_svg:not([class*='size-'])]:size-4` selector — no explicit `h-4 w-4`.

- [ ] **Step 2: Verify existing callers still compile**

Run: `make typecheck`
Expected: exit 0. (The 8 files per app already passing `loading` keep working — they now get the overlay swap instead of a prepended spinner.)

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/ui/button.tsx
git commit -m "feat(shared): rework Button loading (width-preserving overlay, loadingText, asChild busy, press feedback)"
```

---

### Task 3: Spinner primitive; delete PageLoader

**Files:**
- Create: `packages/shared/src/ui/spinner.tsx`
- Create: `frontend-main/src/components/ui/spinner.tsx` (shim)
- Create: `frontend-customer/src/components/ui/spinner.tsx` (shim)
- Modify: `frontend-main/src/app/signup/loading.tsx` (PageLoader → Spinner)
- Modify: `frontend-main/src/app/(auth)/loading.tsx` (PageLoader → Spinner)
- Delete: `frontend-main/src/components/ui/page-loader.tsx`

**Interfaces:**
- Consumes: `cn`, `cva`, lucide `Loader2`.
- Produces: `Spinner` with props `{ size?: "sm" | "default" | "lg"; label?: string; center?: boolean; className?: string }`. `center` renders a `min-h-[50vh]` centered block (PageLoader replacement). All later tasks replace inline `Loader2` outside buttons with `<Spinner />`.

- [ ] **Step 1: Create the primitive**

```tsx
// packages/shared/src/ui/spinner.tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "../lib/utils";

const spinnerVariants = cva("animate-spin text-muted-foreground", {
  variants: {
    size: {
      sm: "h-4 w-4",
      default: "h-5 w-5",
      lg: "h-8 w-8",
    },
  },
  defaultVariants: { size: "default" },
});

export interface SpinnerProps
  extends
    React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof spinnerVariants> {
  /** Screen-reader text. */
  label?: string;
  /** Center in a min-h-[50vh] block (standalone page/section loads). */
  center?: boolean;
}

export function Spinner({
  className,
  size,
  label = "Loading",
  center = false,
  ...props
}: SpinnerProps) {
  return (
    <span
      role="status"
      className={cn(
        center
          ? "flex min-h-[50vh] items-center justify-center"
          : "inline-flex",
        className,
      )}
      {...props}
    >
      <Loader2 aria-hidden="true" className={spinnerVariants({ size })} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
```

- [ ] **Step 2: Create both shims** (exact content, one line each)

`frontend-main/src/components/ui/spinner.tsx` and `frontend-customer/src/components/ui/spinner.tsx`:

```tsx
export * from "@shared/ui/spinner";
```

- [ ] **Step 3: Replace PageLoader usages and delete it**

Both `frontend-main/src/app/signup/loading.tsx` and `frontend-main/src/app/(auth)/loading.tsx` currently render `<PageLoader />`. Replace each file's content with:

```tsx
import { Spinner } from "@/components/ui/spinner";

export default function Loading() {
  return <Spinner size="lg" center />;
}
```

(Keep each file's existing default-export name if it differs.) Then:

```bash
rm frontend-main/src/components/ui/page-loader.tsx
grep -rn "PageLoader" frontend-main/src frontend-customer/src
```

Expected grep: no matches.

- [ ] **Step 4: Verify**

Run: `make typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/ui/spinner.tsx frontend-main/src/components/ui/spinner.tsx frontend-customer/src/components/ui/spinner.tsx frontend-main/src/app/signup/loading.tsx "frontend-main/src/app/(auth)/loading.tsx"
git rm frontend-main/src/components/ui/page-loader.tsx
git commit -m "feat(shared): add Spinner primitive; replace PageLoader"
```

---

### Task 4: Skeleton shimmer + skeleton presets

**Files:**
- Modify: `packages/shared/src/ui/skeleton.tsx`
- Create: `packages/shared/src/ui/skeletons.tsx`
- Create: `frontend-main/src/components/ui/skeletons.tsx` (shim)
- Create: `frontend-customer/src/components/ui/skeletons.tsx` (shim)

**Interfaces:**
- Consumes: `animate-shimmer` from Task 1; `Skeleton` base.
- Produces (exact signatures — retrofit tasks build every loading UI from these):
  - `SkeletonPageHeader({ className? })`
  - `SkeletonCardGrid({ count = 3, withImage = true, className? })`
  - `SkeletonList({ count = 5, className? })`
  - `SkeletonTable({ rows = 5, cols = 4, className? })`
  - `SkeletonForm({ fields = 4, className? })`

- [ ] **Step 1: Shimmer on the base Skeleton**

Full new content of `packages/shared/src/ui/skeleton.tsx`:

```tsx
import { cn } from "../lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        // Static bg-muted is the reduced-motion fallback; the gradient sweep
        // only paints under motion-safe.
        "rounded-md bg-muted",
        "motion-safe:animate-shimmer motion-safe:bg-gradient-to-r motion-safe:from-muted motion-safe:via-muted-foreground/10 motion-safe:to-muted motion-safe:bg-[length:200%_100%]",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
```

- [ ] **Step 2: Create the presets**

```tsx
// packages/shared/src/ui/skeletons.tsx
import { cn } from "../lib/utils";
import { Skeleton } from "./skeleton";

export function SkeletonPageHeader({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
    </div>
  );
}

export function SkeletonCardGrid({
  count = 3,
  withImage = true,
  className,
}: {
  count?: number;
  withImage?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-lg border bg-card">
          {withImage && <Skeleton className="h-44 w-full rounded-none" />}
          <div className="space-y-3 p-4">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-2 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonList({
  count = 5,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border bg-card p-4"
        >
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({
  rows = 5,
  cols = 4,
  className,
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  const gridStyle = { gridTemplateColumns: `repeat(${cols}, 1fr)` };
  return (
    <div className={cn("overflow-hidden rounded-lg border", className)}>
      <div className="grid gap-3 border-b bg-muted/30 p-3" style={gridStyle}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-2/3" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="grid gap-3 border-b p-3 last:border-b-0"
          style={gridStyle}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-4 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonForm({
  fields = 4,
  className,
}: {
  fields?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-4", className)}>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
      <Skeleton className="h-9 w-32" />
    </div>
  );
}
```

- [ ] **Step 3: Create both shims**

`frontend-main/src/components/ui/skeletons.tsx` and `frontend-customer/src/components/ui/skeletons.tsx`:

```tsx
export * from "@shared/ui/skeletons";
```

- [ ] **Step 4: Verify**

Run: `make typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/ui/skeleton.tsx packages/shared/src/ui/skeletons.tsx frontend-main/src/components/ui/skeletons.tsx frontend-customer/src/components/ui/skeletons.tsx
git commit -m "feat(shared): skeleton shimmer + reusable skeleton presets"
```

---

### Task 5: useAsyncAction hook (TDD on the pure runner)

**Files:**
- Create: `packages/shared/src/hooks/async-runner.ts` (pure logic — unit-tested)
- Create: `packages/shared/src/hooks/use-async-action.ts` (thin React wrapper)
- Test: `frontend-customer/src/lib/__tests__/async-runner.test.ts` (matches the vitest include glob `src/**/__tests__/**/*.test.ts`; `@shared` alias is already configured in `frontend-customer/vitest.config.ts`)

**Interfaces:**
- Consumes: `sonner`'s `toast` (both apps have sonner ^2.0.7 in package.json; main's Toaster mounts in Task 6b/7).
- Produces (exact signatures used by every retrofit task):

```ts
// async-runner.ts
export interface AsyncRunnerCallbacks {
  setLoading: (v: boolean) => void;
  onSuccess?: () => void;
  onError?: (err: unknown) => void;
}
export function createAsyncRunner<Args extends unknown[]>(
  fn: (...args: Args) => Promise<void> | void,
  cb: AsyncRunnerCallbacks,
): (...args: Args) => Promise<void>;
export function errorMessage(err: unknown, fallback?: string): string;

// use-async-action.ts
export interface UseAsyncActionOptions {
  errorToast?: boolean | string; // default true: toast.error(errorMessage(err))
  successToast?: string;
  onSuccess?: () => void;
  onError?: (err: unknown) => void; // replaces default error toast entirely
}
export function useAsyncAction<Args extends unknown[]>(
  fn: (...args: Args) => Promise<void> | void,
  options?: UseAsyncActionOptions,
): { run: (...args: Args) => Promise<void>; loading: boolean };
```

- [ ] **Step 1: Write the failing test**

```ts
// frontend-customer/src/lib/__tests__/async-runner.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  createAsyncRunner,
  errorMessage,
} from "@shared/hooks/async-runner";

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createAsyncRunner", () => {
  it("toggles loading around a successful action and calls onSuccess", async () => {
    const setLoading = vi.fn();
    const onSuccess = vi.fn();
    const d = deferred();
    const run = createAsyncRunner(() => d.promise, { setLoading, onSuccess });

    const p = run();
    expect(setLoading).toHaveBeenLastCalledWith(true);
    d.resolve();
    await p;
    expect(setLoading).toHaveBeenLastCalledWith(false);
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it("ignores re-invocation while in flight (double-submit guard)", async () => {
    const d = deferred();
    const fn = vi.fn(() => d.promise);
    const run = createAsyncRunner(fn, { setLoading: vi.fn() });

    const p1 = run();
    const p2 = run(); // must be swallowed
    d.resolve();
    await Promise.all([p1, p2]);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("routes errors to onError, resets loading, and does not rethrow", async () => {
    const setLoading = vi.fn();
    const onError = vi.fn();
    const boom = new Error("boom");
    const run = createAsyncRunner(
      () => Promise.reject(boom),
      { setLoading, onError },
    );

    await expect(run()).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(boom);
    expect(setLoading).toHaveBeenLastCalledWith(false);
  });

  it("allows a new invocation after the previous one settles", async () => {
    const fn = vi.fn(() => Promise.resolve());
    const run = createAsyncRunner(fn, { setLoading: vi.fn() });
    await run();
    await run();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("passes arguments through to fn", async () => {
    const fn = vi.fn((_a: number, _b: string) => Promise.resolve());
    const run = createAsyncRunner(fn, { setLoading: vi.fn() });
    await run(7, "x");
    expect(fn).toHaveBeenCalledWith(7, "x");
  });
});

describe("errorMessage", () => {
  it("uses Error.message when present", () => {
    expect(errorMessage(new Error("nope"))).toBe("nope");
  });
  it("falls back for non-Error values and empty messages", () => {
    expect(errorMessage("weird")).toBe("Something went wrong");
    expect(errorMessage(new Error(""), "fallback")).toBe("fallback");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/async-runner.test.ts`
Expected: FAIL — cannot resolve `@shared/hooks/async-runner`.

- [ ] **Step 3: Implement the runner**

```ts
// packages/shared/src/hooks/async-runner.ts
// Pure core of useAsyncAction, kept React-free so it's unit-testable
// (repo convention: vitest covers pure logic only).

export interface AsyncRunnerCallbacks {
  setLoading: (v: boolean) => void;
  onSuccess?: () => void;
  onError?: (err: unknown) => void;
}

export function createAsyncRunner<Args extends unknown[]>(
  fn: (...args: Args) => Promise<void> | void,
  cb: AsyncRunnerCallbacks,
): (...args: Args) => Promise<void> {
  let inFlight = false;
  return async (...args: Args) => {
    if (inFlight) return;
    inFlight = true;
    cb.setLoading(true);
    try {
      await fn(...args);
      cb.onSuccess?.();
    } catch (err) {
      cb.onError?.(err);
    } finally {
      inFlight = false;
      cb.setLoading(false);
    }
  };
}

export function errorMessage(
  err: unknown,
  fallback = "Something went wrong",
): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
```

(`ApiError` in frontend-customer extends `Error` with `message = data.detail` — so `errorMessage` surfaces API details without shared depending on app types.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/async-runner.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Add the React wrapper**

```tsx
// packages/shared/src/hooks/use-async-action.ts
"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createAsyncRunner, errorMessage } from "./async-runner";

export interface UseAsyncActionOptions {
  /** false: silent. string: fixed message. default true: errorMessage(err). */
  errorToast?: boolean | string;
  successToast?: string;
  onSuccess?: () => void;
  /** When set, replaces the default error toast entirely. */
  onError?: (err: unknown) => void;
}

export function useAsyncAction<Args extends unknown[]>(
  fn: (...args: Args) => Promise<void> | void,
  options: UseAsyncActionOptions = {},
) {
  const [loading, setLoading] = useState(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const run = useMemo(
    () =>
      createAsyncRunner<Args>((...args) => fnRef.current(...args), {
        setLoading,
        onSuccess: () => {
          const o = optionsRef.current;
          if (o.successToast) toast.success(o.successToast);
          o.onSuccess?.();
        },
        onError: (err) => {
          const o = optionsRef.current;
          if (o.onError) {
            o.onError(err);
            return;
          }
          if (o.errorToast === false) return;
          toast.error(
            typeof o.errorToast === "string"
              ? o.errorToast
              : errorMessage(err),
          );
        },
      }),
    [],
  );

  return { run, loading };
}
```

- [ ] **Step 6: Full frontend test suite + typecheck**

Run: `make test-frontend && make typecheck`
Expected: all vitest suites pass; typecheck exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/hooks/async-runner.ts packages/shared/src/hooks/use-async-action.ts frontend-customer/src/lib/__tests__/async-runner.test.ts
git commit -m "feat(shared): useAsyncAction hook with tested pure runner (loading, double-submit guard, toast routing)"
```

---

### Task 6: PageState wrapper

**Files:**
- Create: `packages/shared/src/ui/page-state.tsx`
- Create: `frontend-main/src/components/ui/page-state.tsx` (shim)
- Create: `frontend-customer/src/components/ui/page-state.tsx` (shim)

**Interfaces:**
- Consumes: `Button` (Task 2), `errorMessage` (Task 5), `animate-fade-in-up` (Task 1).
- Produces: `PageState({ loading, error?, skeleton, onRetry?, className?, children })` — skeleton while loading; error card (+ retry when `onRetry` given) on failure; children in a `motion-safe:animate-fade-in-up` wrapper otherwise. This is frontend-customer's `loading.tsx` equivalent.

- [ ] **Step 1: Create the component**

```tsx
// packages/shared/src/ui/page-state.tsx
"use client";

import { cn } from "../lib/utils";
import { errorMessage } from "../hooks/async-runner";
import { Button } from "./button";

interface PageStateProps {
  loading: boolean;
  /** Any truthy value renders the error state (an Error yields its message). */
  error?: unknown;
  skeleton: React.ReactNode;
  onRetry?: () => void;
  className?: string;
  children: React.ReactNode;
}

export function PageState({
  loading,
  error,
  skeleton,
  onRetry,
  className,
  children,
}: PageStateProps) {
  if (loading) return <>{skeleton}</>;
  if (error) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center py-16 text-center"
      >
        <h3 className="text-lg font-semibold">Something went wrong</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {errorMessage(error, "Failed to load this page. Please try again.")}
        </p>
        {onRetry && (
          <Button className="mt-4" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className={cn("motion-safe:animate-fade-in-up", className)}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Create both shims**

`frontend-main/src/components/ui/page-state.tsx` and `frontend-customer/src/components/ui/page-state.tsx`:

```tsx
export * from "@shared/ui/page-state";
```

- [ ] **Step 3: Verify**

Run: `make typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/ui/page-state.tsx frontend-main/src/components/ui/page-state.tsx frontend-customer/src/components/ui/page-state.tsx
git commit -m "feat(shared): PageState loading/error/content wrapper with fade-in"
```

---

## Retrofit Recipes (used verbatim by Tasks 7–10)

Self-contained transformation patterns — every retrofit task applies these; the tasks also carry one real-file canonical example each.

**Recipe A — async handler → `useAsyncAction` + `Button loading`.**

Before (the dominant hand-rolled pattern):

```tsx
const [saving, setSaving] = useState(false);
async function handleSave() {
  setSaving(true);
  try {
    await clientFetch("/api/v1/thing/", { method: "POST", body: ... });
    toast.success("Saved");
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Failed");
  } finally {
    setSaving(false);
  }
}
// ...
<Button disabled={saving} onClick={handleSave}>
  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
  Save
</Button>
```

After:

```tsx
import { useAsyncAction } from "@shared/hooks/use-async-action";

const { run: handleSave, loading: saving } = useAsyncAction(async () => {
  await clientFetch("/api/v1/thing/", { method: "POST", body: ... });
  toast.success("Saved");
}); // default errorToast surfaces err.message — drop the catch entirely
// ...
<Button loading={saving} loadingText="Saving…" onClick={handleSave}>
  <Save className="mr-2 h-4 w-4" />
  Save
</Button>
```

Rules: delete the manual state + `try/finally`; branching error UX (redirects, field errors, status-code cases) moves into `onError: (err) => {...}` (which replaces the default toast); `loadingText` when the label is a verb ("Saving…"), bare `loading` otherwise; one `useAsyncAction` per independent action — never share a flag across unrelated buttons.

**Recipe B — initial page load → `PageState` + skeleton presets.**

Before:

```tsx
const [loading, setLoading] = useState(true);
useEffect(() => {
  clientFetch<Thing[]>("/api/v1/things/").then(setThings)
    .catch(console.error).finally(() => setLoading(false));
}, []);
if (loading) return <div>{/* hand-built skeleton */}</div>;
return <div className="space-y-6">{/* content */}</div>;
```

After:

```tsx
import { PageState } from "@/components/ui/page-state";
import { SkeletonCardGrid } from "@/components/ui/skeletons"; // pick the matching preset

const [loading, setLoading] = useState(true);
const [error, setError] = useState<unknown>(null);
const [reloadKey, setReloadKey] = useState(0);
useEffect(() => {
  let cancelled = false;
  setLoading(true);
  setError(null);
  clientFetch<Thing[]>("/api/v1/things/")
    .then((data) => { if (!cancelled) setThings(data); })
    .catch((err) => { if (!cancelled) setError(err); })
    .finally(() => { if (!cancelled) setLoading(false); });
  return () => { cancelled = true; };
}, [reloadKey]);

return (
  <PageState
    loading={loading}
    error={error}
    onRetry={() => setReloadKey((k) => k + 1)}
    skeleton={<SkeletonCardGrid count={3} />}
    className="space-y-6"
  >
    {/* content, outer wrapper div removed — PageState.className carries it */}
  </PageState>
);
```

Rules: pages that previously swallowed errors (`.catch(console.error)`) now surface the error card; hand-built skeletons matching a preset shape → the preset, genuinely bespoke ones stay hand-built inside the `skeleton` prop.

**Recipe C — stray `Loader2` outside buttons → `Spinner`.**

```tsx
// Before                                            // After
<Loader2 className="h-4 w-4 animate-spin" />         <Spinner size="sm" />
<Loader2 className="h-8 w-8 animate-spin" /> (page)  <Spinner size="lg" center />
```

`import { Spinner } from "@/components/ui/spinner";` — inside a `Button`, never place a spinner manually: use the `loading` prop.

**Shared rules for all recipes:** existing explicit `toast.*` calls stay (only boilerplate collapses); decorative non-skeleton `animate-pulse` (live indicators etc.) stays but is noted for Task 11's allowlist; in `packages/shared/src/**` imports are RELATIVE (`../ui/spinner`, `../hooks/use-async-action`); in frontend-main, new user-facing strings in `useTranslations` components need BOTH catalog entries (`make check-i18n`).

---

### Task 7: frontend-main retrofit — Toaster, async files, loading.tsx gaps

**Files:**
- Modify: `frontend-main/src/app/layout.tsx` (mount Toaster)
- Modify (the async sweep — enumerated below): `frontend-main/src/app/admin/ai/page.tsx`, `frontend-main/src/app/admin/email/campaigns/[id]/page.tsx`, `frontend-main/src/app/admin/email/compose/page.tsx`, `frontend-main/src/app/admin/email/page.tsx`, `frontend-main/src/app/admin/email/templates/page.tsx`, `frontend-main/src/app/admin/health/page.tsx`, `frontend-main/src/app/admin/logs/page.tsx`, `frontend-main/src/app/pricing/PricingCta.tsx`, `frontend-main/src/app/signup/signup-form.tsx`, `frontend-main/src/components/admin/email/recipient-selector.tsx`, `frontend-main/src/components/auth/magic-link-form.tsx`, `frontend-main/src/components/dashboard/publish-controls.tsx`, `frontend-main/src/components/domain/domain-search.tsx` — plus any file surfaced by the Step 3 enumeration.
- Create: `loading.tsx` for server-rendered data routes lacking one (audit in Step 5; expected: `frontend-main/src/app/blog/loading.tsx`, `frontend-main/src/app/blog/[slug]/loading.tsx`, `frontend-main/src/app/dashboard/domain/[slug]/loading.tsx` — confirm during audit).

**Interfaces:**
- Consumes: everything from Tasks 1–6 (`useAsyncAction`, `Spinner`, `Button loading/loadingText`, skeleton presets, `PageState`).
- Produces: no new exports — app-level conformance that Task 11's lint enforcement will lock in.

- [ ] **Step 1: Mount the Toaster**

In `frontend-main/src/app/layout.tsx`, add `import { Toaster } from "sonner";` and render it inside `ThemeProvider`, next to `<HelpBubble />`:

```tsx
            {children}
            <HelpBubble />
            <Toaster position="top-center" richColors />
            <TrackPageView />
```

- [ ] **Step 2: Retrofit the canonical example — magic-link-form**

`frontend-main/src/components/auth/magic-link-form.tsx` — replace the handler and button (imports: drop `useState` only if unused, add `useAsyncAction`):

```tsx
import { useAsyncAction } from "@shared/hooks/use-async-action";
// ... keep email/sent/error state; DELETE the `loading` state.

const { run: handleSubmit, loading } = useAsyncAction(
  async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/v1/auth/magic-link/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      credentials: "same-origin",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.detail || "Something went wrong");
      return;
    }
    setSent(true);
  },
  {
    // Inline field-adjacent error, not a toast, for this auth form.
    onError: () => setError("Network error. Please try again."),
  },
);
```

Button becomes:

```tsx
<Button
  type="submit"
  variant="brand"
  size="lg"
  className="w-full"
  loading={loading}
  loadingText="Sending…"
>
  Send Magic Link
</Button>
```

This is **Recipe A** (async handler → `useAsyncAction`, button → `loading`/`loadingText`). Note the split: transport failures may stay inline where the design is field-adjacent (auth forms); action *outcomes* elsewhere (saved/sent/deleted/published) use `toast.success`/`toast.error`.

- [ ] **Step 3: Sweep the remaining async files**

Enumerate (union of both greps is the work list; the Modify list above is the expected result):

```bash
grep -rln "setLoading\|setSubmitting\|setSaving\|setBusy\|setPending" frontend-main/src --include="*.tsx"
grep -rln "Loader2" frontend-main/src --include="*.tsx"
```

For each file apply:
- **Recipe A** per async handler: wrap in `useAsyncAction`; delete the manual loading state + `try/finally`; move error handling into `onError` (or rely on the default error toast); success feedback → `toast.success(...)` where the file previously set a transient success message.
- **Recipe C**: inline `<Loader2 className="... animate-spin" />` inside a Button → the Button's `loading` prop; standalone (non-button) → `<Spinner />` (`size="sm"` inline, `size="lg" center` for section loads).
- i18n: if the file already calls `useTranslations`, new strings (e.g. "Saving…") must be catalog keys added to BOTH EN and TR catalogs; literal-string files stay literal.
- Exception: `frontend-main/src/app/signup/verify/wizard/**` (framer-motion wizard) — only apply Recipe C swaps if any; do not restructure.

- [ ] **Step 4: Verify the sweep is clean**

```bash
grep -rn "Loader2" frontend-main/src --include="*.tsx"
```

Expected: no matches. Run: `make typecheck && make check-i18n`
Expected: exit 0.

- [ ] **Step 5: loading.tsx gap audit**

For each `frontend-main/src/app/**/page.tsx` WITHOUT a sibling or ancestor `loading.tsx`: if the page is a server component that `await`s data (no `"use client"`), add a sibling `loading.tsx` built from presets. Client pages are skipped (they got Recipe A/C; heavy ones may adopt `PageState`). Static pages (landing `page.tsx`, `pricing` already covered) are skipped. Example for `frontend-main/src/app/blog/loading.tsx`:

```tsx
import { SkeletonList, SkeletonPageHeader } from "@/components/ui/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-12">
      <SkeletonPageHeader />
      <SkeletonList count={4} />
    </div>
  );
}
```

Mirror each page's real container widths/paddings (open the page, copy its outer wrapper classes).

- [ ] **Step 6: Verify in the running app**

Run: `make dev` (if not already up), then load `http://localhost/` signup + login + an admin page in the browser pane; submit the magic-link form with an invalid email and confirm the button shows "Sending…" + spinner and errors surface properly; confirm a toast appears for an admin action (e.g. save in `admin/settings`).

- [ ] **Step 7: Build + e2e for the affected area**

Run: `cd frontend-main && npm run build` — expected: build succeeds, lint stage clean.
Run: `make e2e-changed` — expected: mapped specs pass (fix any spec that clicked a button mid-action and now must wait for it to re-enable).

- [ ] **Step 8: Commit**

```bash
git add frontend-main packages/shared docs 2>/dev/null; git add -u
git commit -m "feat(main): sonner toasts + loading-state retrofit (useAsyncAction, Spinner, loading.tsx gaps)"
```

---

### Task 8: frontend-customer retrofit chunk 1 — student + public surfaces

**Files (scope = every async file under):**
- Modify: `frontend-customer/src/app/(student)/**`, `frontend-customer/src/app/(public)/**`, `frontend-customer/src/components/public/**`, `frontend-customer/src/components/billing/**`, `frontend-customer/src/components/community/**`, `frontend-customer/src/components/student/**` (directories that don't exist are simply skipped)

**Interfaces:**
- Consumes: Tasks 1–6 primitives. No new exports.

- [ ] **Step 1: Enumerate the chunk**

```bash
grep -rln "setLoading\|setSubmitting\|setSaving\|Loader2\|animate-pulse" \
  "frontend-customer/src/app/(student)" "frontend-customer/src/app/(public)" \
  frontend-customer/src/components/public frontend-customer/src/components/billing \
  frontend-customer/src/components/community frontend-customer/src/components/student \
  --include="*.tsx" 2>/dev/null
```

- [ ] **Step 2: Retrofit the canonical action example — subscribe-button**

`frontend-customer/src/components/billing/subscribe-button.tsx` (current: manual `loading` state + inline `Loader2`/`Zap` swap). After — delete `useState`, the `Loader2` import, and `handleSubscribe`; replace with:

```tsx
import { useAsyncAction } from "@shared/hooks/use-async-action";

const { run: handleSubscribe, loading } = useAsyncAction(
  async () => {
    const res = await clientFetch<{ checkout_url?: string }>(
      "/api/v1/billing/subscribe/",
      { method: "POST", body: JSON.stringify({ plan_id: planId }) },
    );
    // Real Stripe checkout (mode=subscription): redirect to the hosted page.
    if (res?.checkout_url) {
      window.location.href = res.checkout_url;
      return;
    }
    // Bypass: subscription is active immediately.
    toast.success(`Subscribed to ${planName}!`);
    router.refresh();
  },
  {
    onError: (err) => {
      if (err instanceof ApiError && err.status === 403) {
        router.push(
          "/login?toast=You+need+to+log+in+to+subscribe&toast_type=info",
        );
        return;
      }
      if (err instanceof ApiError && err.status === 400) {
        toast.info("You're already subscribed to this plan");
        return;
      }
      toast.error(
        err instanceof Error ? err.message : "Subscription failed.",
      );
    },
  },
);
```

```tsx
<Button
  className={className}
  variant={variant}
  size={size}
  loading={loading}
  onClick={handleSubscribe}
>
  <Zap className="mr-2 h-4 w-4" />
  Subscribe — {price} {currency}
  {billingIntervalSuffix(intervalMonths)}
</Button>
```

- [ ] **Step 3: Retrofit the canonical page-load example — student dashboard (Recipe B)**

`frontend-customer/src/app/(student)/dashboard/page.tsx` — replace the effect and the `if (loading)` skeleton block:

```tsx
import { PageState } from "@/components/ui/page-state";
import { SkeletonCardGrid } from "@/components/ui/skeletons";
// keep the Skeleton import only if still used elsewhere in the file

const [error, setError] = useState<unknown>(null);
const [reloadKey, setReloadKey] = useState(0);

useEffect(() => {
  let cancelled = false;
  setLoading(true);
  setError(null);
  clientFetch<Course[]>("/api/v1/courses/enrolled/")
    .then((data) => {
      if (!cancelled) setCourses(data);
    })
    .catch((err) => {
      if (!cancelled) setError(err);
    })
    .finally(() => {
      if (!cancelled) setLoading(false);
    });
  return () => {
    cancelled = true;
  };
}, [reloadKey]);

return (
  <PageState
    loading={loading}
    error={error}
    onRetry={() => setReloadKey((k) => k + 1)}
    skeleton={
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <SkeletonCardGrid count={3} />
      </div>
    }
    className="space-y-6"
  >
    {/* existing content of the loaded branch, with its outer
        `<div className="space-y-6">` wrapper REMOVED (PageState's
        className carries it now) */}
  </PageState>
);
```

This is **Recipe B**: initial-load guard → `PageState` (with real error handling — pages that previously `.catch(console.error)` now surface an error card with retry).

- [ ] **Step 4: Sweep the rest of the chunk**

Apply Recipe A (buttons/handlers), Recipe B (page-load guards), Recipe C (stray `Loader2` → `Spinner`) to every enumerated file. Rules of thumb:
- Existing explicit `toast.success/info/error` calls stay; only the boilerplate around them collapses into `useAsyncAction`.
- Handlers with branching error UX (redirects, field errors) use `onError`; simple ones drop their `catch` entirely and rely on the default error toast.
- Hand-built page skeletons that match a preset shape → the preset; genuinely bespoke ones stay hand-built but move into the `skeleton` prop of `PageState`.
- `animate-pulse` decorative uses that are NOT skeletons (e.g. live indicators) stay — note them; Task 11's checker gets an allowlist entry.

- [ ] **Step 5: Verify**

```bash
grep -rn "Loader2" "frontend-customer/src/app/(student)" "frontend-customer/src/app/(public)" frontend-customer/src/components/public frontend-customer/src/components/billing frontend-customer/src/components/community --include="*.tsx" 2>/dev/null
```

Expected: no matches.
Run: `make typecheck && make test-frontend` — expected: exit 0.
Run: `make e2e-changed` — expected: mapped specs pass.
Browser spot-check: student dashboard (skeleton→fade-in), a subscribe/enroll button (spinner, no layout jump), community reactions.

- [ ] **Step 6: Commit**

```bash
git add -u frontend-customer
git commit -m "feat(customer): loading-state retrofit chunk 1 — student + public surfaces"
```

---

### Task 9: frontend-customer retrofit chunk 2 — admin surfaces

**Files (scope):**
- Modify: `frontend-customer/src/app/admin/**`, `frontend-customer/src/components/admin/**`, `frontend-customer/src/components/owner/**`, `frontend-customer/src/components/logo/**`

**Interfaces:** Consumes Tasks 1–6 primitives; no new exports.

- [ ] **Step 1: Enumerate**

```bash
grep -rln "setLoading\|setSubmitting\|setSaving\|Loader2\|animate-pulse" \
  frontend-customer/src/app/admin frontend-customer/src/components/admin \
  frontend-customer/src/components/owner frontend-customer/src/components/logo \
  --include="*.tsx" 2>/dev/null
```

This is the largest chunk (~40 files). Split the sweep across parallel subagents by subdirectory if executing with subagent-driven development.

- [ ] **Step 2: Sweep**

Apply Recipes A, B, C exactly as defined in the "Retrofit Recipes" section above — follow them verbatim; do not invent variants. Admin-specific notes:
- Save/publish/delete buttons: prefer `loadingText` ("Saving…", "Publishing…") over the bare overlay when the button label is a verb — matches the existing 8 adopter files.
- Multi-action toolbars (e.g. blog composer, email campaigns): one `useAsyncAction` per action; never share a single loading flag across unrelated buttons.
- Tables/lists loading: `SkeletonTable` / `SkeletonList` in `PageState`.
- Logo studio & assistant cards already use `Button loading` in places — converge them on the same hook, keep their UX.

- [ ] **Step 3: Verify**

```bash
grep -rn "Loader2" frontend-customer/src/app/admin frontend-customer/src/components/admin frontend-customer/src/components/owner frontend-customer/src/components/logo --include="*.tsx" 2>/dev/null
```

Expected: no matches.
Run: `make typecheck && make test-frontend` — exit 0.
Run: `make e2e-changed` — mapped specs pass.
Browser spot-check: admin blog list (table skeleton), campaign compose (send button), design page.

- [ ] **Step 4: Commit**

```bash
git add -u frontend-customer
git commit -m "feat(customer): loading-state retrofit chunk 2 — admin surfaces"
```

---

### Task 10: retrofit chunk 3 — shared components & shared-package UI

**Files (scope):**
- Modify: remaining async files in `frontend-customer/src/components/**` (shared, layout, notifications, assistant, checkout, mailbox glue) and `frontend-customer/src/app/**` not covered by chunks 1–2
- Modify: `packages/shared/src/mailbox/**`, `packages/shared/src/email/**`, `packages/shared/src/admin-kit/**`, `packages/shared/src/logo/**`, `packages/shared/src/wizard/**` (any `Loader2`/manual-loading usage — these render in BOTH apps)

**Interfaces:** Consumes Tasks 1–6 primitives; no new exports. Shared-package internal imports are RELATIVE (`../ui/spinner`, `../hooks/use-async-action`) — never `@shared/...` or `@/...`.

- [ ] **Step 1: Enumerate the remainder across the whole repo**

```bash
grep -rln "Loader2" frontend-customer/src frontend-main/src packages/shared/src --include="*.tsx" | grep -v "packages/shared/src/ui/"
grep -rln "setLoading\|setSubmitting\|setSaving" frontend-customer/src packages/shared/src --include="*.tsx"
```

The first grep is the definitive leftover list (spinner.tsx/button.tsx are the only allowed `Loader2` importers).

- [ ] **Step 2: Sweep**

Recipes A, B, C as defined in the "Retrofit Recipes" section above. In `packages/shared/src/**` use relative imports and verify BOTH apps still typecheck after each file.

- [ ] **Step 3: Verify — repo-wide zero**

```bash
grep -rn "Loader2" frontend-main/src frontend-customer/src packages/shared/src --include="*.tsx" | grep -v "packages/shared/src/ui/"
```

Expected: no matches.
Run: `make typecheck && make test-frontend` — exit 0.
Run: `cd frontend-main && npm run build && cd ../frontend-customer && npm run build` — both succeed.
Run: `make e2e-changed` — mapped specs pass.

- [ ] **Step 4: Commit**

```bash
git add -u frontend-customer frontend-main packages/shared
git commit -m "feat(frontends): loading-state retrofit chunk 3 — shared components and shared-package UI"
```

---

### Task 11: Enforcement — ESLint rule, check script, Makefile wiring, conventions doc

**Files:**
- Modify: `frontend-main/.eslintrc.json`, `frontend-customer/.eslintrc.json`
- Create: `scripts/check-loading-patterns.mjs`
- Modify: `Makefile` (lint target)
- Modify: `CLAUDE.md` (conventions section — the repo forbids NEW .md files; append to the existing one)

**Interfaces:**
- Consumes: the completed sweep (Tasks 7–10) — enforcement lands last so lint passes at every commit.
- Produces: `make lint` fails on any future raw `Loader2` import or `animate-spin`/`animate-pulse` literal in app code.

- [ ] **Step 1: ESLint restricted import (both apps)**

Both `.eslintrc.json` files become:

```json
{
  "extends": ["next/core-web-vitals", "prettier"],
  "plugins": ["@typescript-eslint"],
  "rules": {
    "no-restricted-imports": [
      "error",
      {
        "paths": [
          {
            "name": "lucide-react",
            "importNames": ["Loader2"],
            "message": "Use <Spinner> from @/components/ui/spinner or Button's loading prop instead of a raw Loader2."
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Check script**

```js
// scripts/check-loading-patterns.mjs
// Guardrail for the loading-state system (see
// docs/superpowers/specs/2026-07-23-loading-states-design.md): app code must
// use Spinner/Skeleton primitives, not raw animate-spin / animate-pulse.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["frontend-main/src", "frontend-customer/src", "packages/shared/src"];
// The primitives themselves, plus justified decorative exceptions
// (add a path here ONLY with a trailing comment saying why).
const ALLOW = new Set([
  "packages/shared/src/ui/button.tsx",
  "packages/shared/src/ui/spinner.tsx",
  "packages/shared/src/ui/skeleton.tsx",
]);
const PATTERN = /animate-(?:spin|pulse)\b/;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(tsx|ts|jsx|js)$/.test(name)) yield p;
  }
}

const violations = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const rel = relative(".", file).replaceAll("\\", "/");
    if (ALLOW.has(rel)) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (PATTERN.test(line)) violations.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
  }
}

if (violations.length) {
  console.error("Raw loading-animation classes found (use Spinner / Skeleton / Button loading):");
  for (const v of violations) console.error("  " + v);
  process.exit(1);
}
console.log(`check-loading-patterns: OK (${ROOTS.join(", ")})`);
```

During Tasks 8–10 some decorative `animate-pulse` uses (live indicators etc.) were noted — add each to `ALLOW` with a why-comment now.

- [ ] **Step 3: Run the script — drive remaining violations to zero**

Run: `node scripts/check-loading-patterns.mjs`
Expected: failures list any stragglers → fix them (Recipes A/C) or allowlist with justification, then re-run until `OK`.

- [ ] **Step 4: Wire into make lint**

In `Makefile`, the `lint` target gains one line after `@$(MAKE) check-i18n`:

```make
	node scripts/check-loading-patterns.mjs
```

(Update the target's `##` help text to mention it.)

- [ ] **Step 5: Conventions in CLAUDE.md**

Append to the repo root `CLAUDE.md`, after the "## Rules" section:

```markdown
## Loading & feedback conventions (both frontends)

- Async buttons: `<Button loading={loading}>` or `loadingText="Saving…"` — never a raw `<Loader2>`/`animate-spin` in app code; standalone spinners use `<Spinner>` (`@/components/ui/spinner`).
- Wrap async handlers in `useAsyncAction` (`@shared/hooks/use-async-action`): loading state, double-submit guard, default error toast (`onError` to customize).
- Client-page initial loads: `<PageState loading={...} error={...} skeleton={...}>` with presets from `@/components/ui/skeletons`; server routes get `loading.tsx` built from the same presets.
- Action outcomes are sonner toasts in BOTH apps; field-level validation stays inline.
- Motion is CSS-only and `motion-safe:`-gated. `scripts/check-loading-patterns.mjs` (in `make lint`) enforces the spinner/skeleton rules.
```

- [ ] **Step 6: Verify lint end-to-end**

Run: `cd frontend-main && npx next lint && cd ../frontend-customer && npx next lint`
Expected: no `no-restricted-imports` errors (sweep already removed all raw Loader2).
Run: `make lint`
Expected: passes, including the new check line.

- [ ] **Step 7: Commit**

```bash
git add frontend-main/.eslintrc.json frontend-customer/.eslintrc.json scripts/check-loading-patterns.mjs Makefile CLAUDE.md
git commit -m "chore(lint): enforce loading-state conventions (restricted Loader2 import + pattern checker)"
```

---

### Task 12: Final verification

**Files:** none new — verification only (fix regressions where found).

- [ ] **Step 1: Full local gates**

Run: `make lint && make typecheck && make test-frontend`
Expected: all pass with zero warnings (repo rule).

- [ ] **Step 2: Full e2e**

With the dev stack up (`make dev`): run `make e2e`
Expected: all 24 non-Stripe specs pass. Any failure from the new disabled-while-loading behavior is fixed in the spec (wait for the button to re-enable / for the toast) — not by weakening the component.

- [ ] **Step 3: Reduced-motion + visual spot-check**

In the browser pane (dev stack): emulate `prefers-reduced-motion` (DevTools rendering emulation) on the student dashboard — skeletons must be static, content swap instant, buttons must not scale on press. Then without emulation: shimmer visible, content fades in, button spinners don't shift layout.

- [ ] **Step 4: Commit any spec/regression fixes**

```bash
git add -u
git commit -m "test: adjust e2e specs for disabled-while-loading buttons"
```

(Skip if nothing changed.)
