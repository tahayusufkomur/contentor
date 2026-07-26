# Interaction Feedback — Navigation, In-Page State & Overlays — Design

**Date:** 2026-07-24
**Status:** Approved (brainstorming session)
**Scope:** frontend-main + frontend-customer + packages/shared
**Supersedes the "out of scope" clause of:** `2026-07-23-loading-states-design.md`

## Goal

No interaction in either frontend ever produces dead air. Every click — a nav
link, a filter toggle, a row, a drawer trigger — produces a visible response
within one frame, and something on screen stays in motion until the result
lands.

The reported symptom: in the coach admin panel, clicking a sidebar item (e.g.
`/admin/calendar` → `/admin/students`) leaves the old page on screen with the
*old* item still highlighted for ~2s, then swaps. Nothing indicates the click
registered.

## Current state (survey)

- `frontend-customer` has **zero `loading.tsx`** across its 60 routes.
  `frontend-main` has 11 across 25 routes, all hand-built.
- Without a `loading.tsx` Suspense boundary, a Next 14 `<Link>` navigation is a
  **blocking transition**: React keeps the old page mounted until the new
  segment's RSC payload arrives, so `usePathname()` does not update and
  `app-sidebar.tsx:133` (`isItemActive(pathname, item.href)`) keeps highlighting
  the page you are leaving.
- Only after commit does the client page mount, `useEffect`-fetch, and render its
  `PageState` skeleton — i.e. the existing skeleton work sits on the far side of
  the gap.
- `media-browser.tsx:262` sets `loading` only when `!hasLoadedOnce.current`, so
  every search keystroke, sort change and filter toggle after first render swaps
  the list with **no feedback at all**.
- Next 14.2 / React 18: no `useLinkStatus` (15.3+), no router-events API.
  Pending state must be owned explicitly.
- The two `app-sidebar.tsx` files (main, customer) are diverged near-duplicates.

## Decisions made

1. **Scope:** everything interactive — navigation, actions, and in-page state
   changes (tabs, filters, search, pagination, modals, infinite scroll).
2. **Pre-commit feedback:** both a global top progress bar *and* a per-element
   pending affordance. The bar appears only after **150ms** so instant
   navigations do not flash.
3. **Perceived + cheap real wins:** feedback layer, plus
   `experimental.staleTimes` and hover prefetch. No migration of client pages to
   server components (explicitly deferred).
4. **In-page data changes:** stale-while-loading (content dims, never blanks)
   for refinements of an existing result set; full skeleton when the underlying
   resource changes entirely.
5. **Overlays:** open immediately with a skeleton inside; never hold the overlay
   closed while fetching.
6. **Bar completion:** the top bar completes when the route **commits**; the
   route's skeleton takes over from there. Bar = "moving between pages",
   skeleton = "this page is filling in".
7. **Approach:** spine-first. Concentrate work in the shared components
   everything already flows through, then sweep outliers. TanStack Query
   considered and deferred.

## Section 1 — New shared primitives (`packages/shared/src/`)

### 1.1 `ui/progress-line.tsx`

2px indeterminate bar. CSS keyframe added to `packages/shared/tailwind-preset.ts`,
`motion-safe:`-gated. Under `prefers-reduced-motion` it renders as a static
primary-colored strip — the *state* remains visible, only the travel is dropped
(consistent with the reduced-motion rule in the 2026-07-23 design). Single
visual shared by both consumers below.

### 1.2 `ui/navigation-progress.tsx`

Mounted once per app in the root layout, beside the existing `<Toaster>`. Fixed
to viewport top at `z-[100]`; renders `ProgressLine` while a route transition is
in flight, after a 150ms delay.

### 1.3 `navigation/navigation-state.ts` (React-free core) + `navigation/navigation-provider.tsx`

`navigation-state.ts` holds the decidable logic — `resolveActiveHref`,
`defaultActiveMatch`, `createProgressController` — so vitest can cover it under
the repo's pure-logic-only test convention (see §4.3).

`navigation-provider.tsx` is the thin React wrapper. It owns pending state, since
Next 14 exposes none: wraps `router.push` in `useTransition` and provides
`{ pathname, pendingHref, isPending, isNavigating, navigate, prefetch }`.

**CORRECTED 2026-07-25 after live measurement — the original design here was
wrong.** This section previously specified that `isPending` from `useTransition`
is "true from click until the destination segment commits", and mandated a
clearing effect keyed on `[isPending, pathname]`. That is false in Next 14's App
Router: `router.push()` called inside `startTransition` does **not** keep the
React transition suspended for the navigation's duration. Measured on the dev
stack (`/admin/calendar` → `/admin/students`): the transition resolved ~91ms into
a ~1000ms navigation, so the clearing effect ended the pending window after 51ms
and `NavigationProgress` — which waits 150ms before showing — **never appeared at
all**. Next's router continues the navigation asynchronously outside the
transition.

The corrected contract:

- **`pendingHref` is cleared on commit only**, via an effect keyed on `[pathname]`
  alone. A route commit is the only reliable end-of-navigation signal available.
- **`isNavigating` = `pendingHref !== null`** is the in-flight signal, and is what
  `NavigationProgress` consumes. `isPending` remains on the context but is not a
  usable navigation-duration signal and must not be treated as one.
- **A 15s watchdog** clears `pendingHref` if a navigation never commits (aborted,
  blocked by a route guard, network error), so the bar cannot strand.

After the fix the pending window measured 291ms on the same navigation.

Clearing on `pathname` also covers browser back/forward and any `router.push`
that bypasses the provider, since those change the pathname too.

**Verification note:** in dev, main-thread blocking during on-demand compilation
can starve the bar's own 150ms `setTimeout`, so the bar may not paint on a cold
route even when the pending window is long enough. This makes ad-hoc dev browser
timing an unreliable gate — the authoritative check is the Playwright spec in
§4.3, which injects deterministic delays instead of racing the dev compiler.

### 1.4 `ui/nav-link.tsx`

Drop-in for `next/link` that routes through the provider. Optimistic active
state:

```tsx
const isActive = pendingHref ? match(pendingHref, href) : match(pathname, href);
```

The clicked item highlights and the previous one releases on click, not on
commit. Sets `data-pending` for per-item treatment. Calls `router.prefetch(href)`
on `mouseenter`/`focus`, deduped per href.

Accepts an `activeMatch?: (pathname: string, href: string) => boolean` prop; the
default reproduces today's `isItemActive` semantics (exact match, or prefix match
for any href other than `/admin`).

### 1.5 `ui/stale-container.tsx`

`<StaleContainer pending>` for refinement loads: sets `aria-busy`, fades children
to ~60% opacity, blocks pointer events, floats a `ProgressLine` at the
container's top edge. **Children are never unmounted.**

## Section 2 — Route-level: Suspense boundaries + router config

### 2.1 `loading.tsx` placement

Next places the boundary *inside* the layout at that level, so
`app/admin/loading.tsx` renders as
`<AdminLayout><Suspense fallback={…}>{page}</Suspense></AdminLayout>` — the
sidebar stays mounted holding its optimistic highlight, and only the content pane
skeletons.

**frontend-customer — 5 group-level files:** `admin/`, `(student)/`, `(public)/`,
`(auth)/`, and one shared by `live/[id]` + `live-stream/[id]`. The `admin/` file
alone covers all 32 admin routes.

**frontend-customer — ~7 per-route overrides** where the group skeleton would
misrepresent the layout: `admin/calendar` (month grid), `admin/design`,
`admin/settings` (form), `admin/courses/[slug]` (editor), `admin/inbox`
(two-pane), `(student)/learn/[slug]` (player), `(student)/dashboard`.

**frontend-main:** audit the 11 existing files, fill gaps, and rebuild the
hand-rolled ones on the `skeletons.tsx` presets so both apps share one
vocabulary.

All built from `SkeletonPageHeader` / `SkeletonTable` / `SkeletonCardGrid` /
`SkeletonForm`. No new hand-built skeleton markup.

### 2.2 Router config

Both `next.config.mjs` (Next 14.2.35 is installed; `staleTimes` landed in 14.2
and defaults to `dynamic: 0`, so this is a real change):

```js
experimental: { staleTimes: { dynamic: 30, static: 180 } }
```

Revisiting a route within 30s serves the cached RSC payload. Safe for data
freshness: the router cache holds the payload, not component state, so client
pages still remount and re-`clientFetch` on arrival.

### 2.3 Prefetch

Hover/focus prefetch via `NavLink` (§1.4). Deliberately **not** `prefetch={true}`
on sidebar links — that fires ~25 RSC requests on viewport entry.

### 2.4 Known limits (accepted, not oversights)

1. **Dev improves less than prod.** Next disables prefetch in dev and compiles
   routes on demand; the `onDemandEntries` tuning already in
   `frontend-customer/next.config.mjs` is what holds that down today. The
   feedback layer behaves identically in both — dev just has a larger gap to
   fill.
2. **`loading.tsx` cannot cover the layout's own `await`.**
   `app/admin/layout.tsx` is `force-dynamic` and awaits `requireAuth()` /
   `requireRole()` above the boundary. Client-side nav between admin pages does
   not re-run it, so the reported case is unaffected; it does gate the first hard
   load of an admin URL. Out of scope.

## Section 3 — Spine wiring

| Spine | Change |
|---|---|
| Root layouts (×2) | Mount `NavigationProvider` + `<NavigationProgress />` |
| `shared/app-sidebar.tsx` (×2) | `Link` → `NavLink`; drop local `isItemActive`; icon → `<Spinner size="sm">` while `data-pending` |
| `admin-shell.tsx`, `mobile-header.tsx` (customer) | `Link` → `NavLink` |
| `platform-header.tsx`, `mobile-header.tsx` (main) | `Link` → `NavLink` |
| `admin/media-browser.tsx` | `refreshing` state + `StaleContainer` + `resourceKey` prop |
| `admin/inline-edit-panel.tsx` | Open instantly, `SkeletonForm` until loaded |
| `admin/students/student-drawer.tsx` | Generalize its existing `loadingCourses` pattern to the whole panel |
| `admin/tag-filter-bar.tsx` | Optimistic chip toggle, `aria-busy` until parent refetch resolves |

### 3.1 `media-browser.tsx` detail

- New `refreshing` state, set during any `load(reset: true)` after the first
  load; the results grid/list wraps in `<StaleContainer pending={refreshing}>`.
- New `resourceKey` prop: when it changes, `hasLoadedOnce` resets and a full
  skeleton renders instead (decision 4's exception). This also fixes a latent
  bug — `/admin/m/user` → `/admin/m/course` reuses the same component instance,
  so today the previous model's rows briefly render under the new heading.
- Existing `loadingMore` infinite-scroll indicator is unchanged.

### 3.2 Programmatic navigation

The ~20 `router.push` call sites across both apps (`command-palette`,
`owner/edit-sidebar.tsx:165`, blog/email/billing row clicks, `live-streams`)
switch to `useNavigate()` so they feed the same progress bar.

Post-form-submit redirects (`admin/blog/[id]/page.tsx:53`,
`admin/email/compose/page.tsx:258`) hold their button `loading` state *through*
the navigation rather than releasing it on API success and going quiet.

### 3.3 Explicitly not done here

The two `app-sidebar.tsx` files are near-duplicates and should be consolidated
into one shared component. That is a separate change; folding it in would make
this diff substantially harder to review. Tracked as a follow-up.

## Section 4 — Outliers, enforcement, testing

### 4.1 Outlier sweep

Surfaces that bypass every spine: `admin/calendar/unified-calendar.tsx`
(month/week navigation refetches silently), community feed infinite scroll, the
assistant and logo-studio panels, blog editor autosave, Radix `Tabs` that swap
datasets, checkout steps. Each receives an already-defined treatment —
`StaleContainer` for refinements, skeleton for resource changes, `useAsyncAction`
for actions. No new vocabulary is introduced.

### 4.2 Enforcement (extends `scripts/check-loading-patterns.mjs`)

1. **`next/link` restricted** in both apps' `src/` (ESLint
   `no-restricted-imports`) → use `NavLink`. External and `target="_blank"` links
   are the documented exception.
2. **`useRouter().push` flagged** in app code → use `useNavigate()`.
3. **Suspense-coverage check** — walk each app's `app/` tree and assert every
   route segment has a `loading.tsx` at or above it. This is what makes "always"
   structural: a new page cannot ship without a loading boundary.

Rule 3 is the load-bearing one. Rules 1–2 catch regressions in code that gets
written; rule 3 catches the *absence* of code, which is how this gap opened.

### 4.3 Testing

**Vitest (`make test-frontend`)** — `frontend-customer/vitest.config.ts` is
deliberately pure-logic only (`include: ["src/**/__tests__/**/*.test.ts"]`, no
`.tsx`, no jsdom): *"React components are covered by `npm run build` + the
Playwright e2e suite, per repo convention."* The 2026-07-23 work honoured this by
extracting `createAsyncRunner` (`packages/shared/src/hooks/async-runner.ts`) as a
React-free core and unit-testing that, leaving the `useAsyncAction` wrapper to
build + e2e.

This design follows the same split. A React-free core,
`packages/shared/src/navigation/navigation-state.ts`, holds all the decidable
logic and is what vitest covers:

- `resolveActiveHref(pendingHref, pathname)` — optimistic active resolution;
  pending wins over committed.
- `defaultActiveMatch(current, href)` — exact match, or prefix match for any
  href other than `/admin` (reproduces today's `isItemActive`).
- `createProgressController({ delayMs, onShow, onHide })` — the 150ms-delay
  state machine: start/finish/reset, no-show when finishing inside the delay
  window, idempotent finish so back/forward cannot strand the bar.

The React wrappers (`NavigationProvider`, `NavLink`, `NavigationProgress`,
`StaleContainer`) stay thin enough to be covered by `npm run typecheck` plus the
Playwright spec below.

**Playwright:** one new spec, `e2e/specs/25-navigation-feedback.spec.ts` (25 is
the next free number — `00`–`24` are taken, plus `90-logo-eval`), plus an
entry in `e2e/impact-map.json` (required — the selector self-test in `make lint`
fails on unmapped specs). It stubs a deliberately slow response, clicks a sidebar
item, and asserts that *before* content arrives the target nav item carries
`aria-current` and the content region is `aria-busy`. Deterministic because the
delay is injected rather than raced.

Existing specs that assert on nav highlighting or click-then-immediately-assert
may need updating for the new optimistic behavior; fixed within the phase that
surfaces them.

### 4.4 Documentation

The "Loading & feedback conventions" section of the root `CLAUDE.md` and
`frontend-customer/src/CLAUDE.md` gain the navigation rules (`NavLink`,
`useNavigate`, `loading.tsx` required, `StaleContainer` for refinements). No new
`.md` files.

## Rollout

Six phases, each independently shippable. **Phases 1–3 fully resolve the reported
symptom**; 4–6 extend it to the app-wide guarantee.

| # | Contents | Observable result |
|---|---|---|
| 1 | Primitives, keyframes, providers in root layouts, unit tests | Top bar on every navigation, both apps |
| 2 | `loading.tsx` coverage + `staleTimes` | Click commits instantly; skeletons instead of frozen pages |
| 3 | Sidebars/headers → `NavLink` + hover prefetch | Highlight moves on click; repeat visits near-instant |
| 4 | `MediaBrowser`, panels, `tag-filter-bar` | Search/filter/sort stop swapping silently |
| 5 | Outlier sweep + programmatic nav | Calendar, community, assistant, tabs, modals |
| 6 | Enforcement rules + CLAUDE.md conventions + full `make e2e` | Regressions become build failures |

Each phase verified with `make lint`, `make typecheck`, `make test-frontend`,
`make e2e-changed`, plus a `make dev` browser spot-check before it is called
done, per the repo rules.

## Out of scope

- Converting `frontend-customer` admin pages from `"use client"` +
  `useEffect`-fetch to server components with streaming Suspense. This is the
  only change that would actually eliminate the ~2s rather than fill it; it
  contradicts the convention documented in `frontend-customer/src/CLAUDE.md` and
  would touch most of the 32 admin pages. Available later as its own project.
- TanStack Query / SWR adoption.
- Consolidating the two `app-sidebar.tsx` copies (§3.3).
- Covering the `app/admin/layout.tsx` `requireAuth()` await (§2.4).
- Backend/API changes of any kind.
