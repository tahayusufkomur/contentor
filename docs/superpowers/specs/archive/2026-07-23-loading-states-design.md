# Loading States & Micro-Interactions — Design

**Date:** 2026-07-23
**Status:** Approved (brainstorming session)
**Scope:** frontend-main + frontend-customer + packages/shared

## Goal

Every user-facing action in both frontends gives immediate, consistent in-flight
feedback: buttons show loading and block double-submits, initial page loads show
shimmer skeletons, resolved content fades in, and action outcomes surface as
toasts. Full sweep — all ~90 async call sites are retrofitted, and lint
enforcement keeps future code compliant.

## Current state (survey summary)

- Both apps consume a source-only shared UI package (`packages/shared/src/`,
  `@shared/*` alias); each app's `src/components/ui/*` are re-export shims.
- Shared `Button` has a `loading` prop, but it only *prepends* a spinner
  (double-indicator when callers swap text) and ignores `asChild` — so only
  8 files per app use it; the rest hand-roll `disabled={loading}` + inline
  `<Loader2 className="animate-spin" />` (42 files import `Loader2` directly).
- The `setLoading(true)` / `try/finally` dance is re-implemented in ~16 files
  (main) and ~73 files (customer). No react-query/SWR — hand-rolled fetch.
- frontend-main: 8 route-level `loading.tsx` skeletons (hand-built), **no
  toasts** (inline error text), framer-motion only in the signup wizard.
- frontend-customer: **no** `loading.tsx` (pages are client components),
  per-page hand-built `if (loading) return <Skeleton…>` guards, sonner toasts
  everywhere (204 calls), zero animation infrastructure.

## Decisions made

1. **Scope:** full sweep — primitives + retrofit of every async call site.
2. **Ambition:** loading feedback + micro-interactions (shimmer, fade-in,
   press feedback). CSS/Tailwind only; no framer-motion in customer; no
   page/route transitions.
3. **Toasts:** frontend-main adopts sonner (already in its package.json);
   action outcomes become toasts, field-level validation stays inline.
4. **Enforcement:** ESLint restricted imports + a lint-wired check script.
5. **Approach:** primitive-led (Approach A). No data-layer changes; TanStack
   Query explicitly out of scope (the hook API leaves the door open).

## Section 1 — Shared primitives (`packages/shared/src/`)

### 1.1 `Button` rework (`ui/button.tsx`)

- `loading` keeps button width: children rendered `invisible`, spinner
  absolutely centered on top; sets `aria-busy`; stays disabled (current
  behavior).
- New `loadingText?: string` — when set, renders spinner + text (e.g.
  "Sending…") instead of the overlay swap.
- `asChild` + `loading`: sets `aria-busy`, `pointer-events-none`, dimmed
  opacity; no spinner injection (documented limitation).
- Press feedback added to base variants: `active:scale-[0.98]` with a fast
  transition — every button in both apps gets it with no call-site change.

### 1.2 `Spinner` primitive (new `ui/spinner.tsx`)

- Wraps lucide `Loader2`; size variants `sm` / `default` / `lg`; sr-only
  `label`; optional `center` prop for page/section-center use.
- Replaces all direct `Loader2` imports in app code and frontend-main's
  one-off `PageLoader` (which is deleted).

### 1.3 Skeleton upgrade + presets

- Base `Skeleton` (`ui/skeleton.tsx`): shimmer gradient sweep (~1.8s loop)
  replaces `animate-pulse`.
- New `ui/skeletons.tsx` presets, prop-configurable (counts, columns):
  `SkeletonPageHeader`, `SkeletonCardGrid`, `SkeletonTable`, `SkeletonList`,
  `SkeletonForm`. These replace hand-built per-page skeleton layouts.

### 1.4 `useAsyncAction` hook (new `hooks/use-async-action.ts`)

```tsx
const { run, loading } = useAsyncAction(doEnroll, {
  errorToast: true,          // default: toast the ApiError/Error message
  successToast: "Enrolled!", // optional
  onError,                   // escape hatch
});
<Button loading={loading} onClick={run}>Enroll</Button>
```

- Owns loading state + `try/finally`; ignores re-invocation while in-flight
  (double-submit guard); routes errors to sonner by default.
- Components with several independent actions call it once per action.

### 1.5 `PageState` wrapper (new `ui/page-state.tsx`)

```tsx
<PageState loading={loading} error={error} skeleton={<SkeletonCardGrid />}>
  {content}
</PageState>
```

- Skeleton while loading, standard error state on failure (with a retry
  button when an `onRetry?: () => void` prop is provided), `fade-in-up` on
  content arrival. This is customer's equivalent of `loading.tsx`.

### 1.6 Shared Tailwind preset (new `packages/shared/tailwind-preset.ts`)

- Defines `shimmer`, `fade-in`, `fade-in-up` keyframes/animations once; both
  app tailwind configs add `presets: [sharedPreset]`. Main's existing
  landing-page keyframes stay in its own config.

## Section 2 — Per-app retrofit

### frontend-main (25 pages, ~16 async files)

- Mount `<Toaster position="top-center" richColors />` in the root layout.
  Action outcomes → toasts; field validation stays inline.
- Audit all pages; add `loading.tsx` (built from presets) for server-rendered
  routes lacking one (8 exist today).
- Retrofit ~16 async files to `useAsyncAction` + `Button loading` / `Spinner`.
- BFF route handlers under `src/app/api/` untouched — component layer only.

### frontend-customer (60 pages, ~73 async files) — three reviewable chunks

1. **Student + public pages** — dashboard, courses, downloads, live, calendar,
   blog, community, checkout: initial-load guards → `PageState` + presets;
   enroll/subscribe/checkout/reaction buttons → `useAsyncAction` +
   `Button loading`.
2. **Admin pages** — content editing, email campaigns, design/logo studio,
   students, settings (bulk of the async files).
3. **Shared components** — mailbox, notifications, assistant cards, billing.

- Existing `toast.*` calls stay; the hook's `errorToast` default removes
  boilerplate around them. The 4 `Suspense` (`useSearchParams`) wrappers stay.
  No `loading.tsx` in customer (client pages) — `PageState` is its equivalent.

### Both apps

- Every `disabled={loading}` + inline `Loader2` button becomes
  `loading={loading}` (or the handler collapses into `useAsyncAction`).
- Each chunk verified with `make lint`, `make typecheck`,
  `make test-frontend`, `make e2e-changed`.

## Section 3 — Motion spec, enforcement, testing

### Motion (all CSS/Tailwind, defined in the shared preset)

- Skeleton shimmer: soft gradient sweep, ~1.8s loop.
- Content arrival: fade + 4px rise over ~200ms (`fade-in-up`) when
  `PageState` / `loading.tsx` resolves.
- Buttons: press-down scale; width-preserving spinner swap (no layout jump).
- Toasts: sonner built-ins.
- **Reduced motion:** all animation gated on `prefers-reduced-motion` —
  static skeletons, instant swaps, no press scale. Loading *states* always
  remain; only decoration is dropped.

### Enforcement

- ESLint `no-restricted-imports` (both apps): `Loader2` from `lucide-react`
  is an error outside `packages/shared/src/ui/` → use `Spinner` /
  `Button loading`.
- Check script (pattern: existing e2e-selector self-test) flags
  `animate-spin` / `animate-pulse` literals in app code outside the shared
  package; wired into `make lint` / pre-commit.
- Conventions documented in both apps' CLAUDE.md.

### Testing & verification

- Vitest (`make test-frontend`): `useAsyncAction` (lifecycle, double-submit
  guard, error→toast) and `Button` (spinner swap, `aria-busy`, `asChild`).
- Existing Playwright suite is the regression net: `make e2e-changed` per
  chunk, full `make e2e` at the end. No new e2e specs (loading states are
  transient; every major flow is already exercised). Specs clicking buttons
  mid-action may need updates for the new disabled-while-loading behavior —
  fixed within the chunk that surfaces them.
- Per repo rules: `make dev` up and key flows spot-checked in the browser
  after each chunk before claiming done.

## Out of scope

- TanStack Query / SWR adoption (possible future; hook API is compatible).
- Page/route transitions and animated list reordering.
- framer-motion in frontend-customer.
- Backend/API changes of any kind.

## Rollout order

1. Primitives + shared Tailwind preset + lint enforcement (+ unit tests).
2. frontend-main retrofit (toaster, loading.tsx gaps, ~16 files).
3. frontend-customer chunk 1 (student + public).
4. frontend-customer chunk 2 (admin).
5. frontend-customer chunk 3 (shared components) + full `make e2e`.
