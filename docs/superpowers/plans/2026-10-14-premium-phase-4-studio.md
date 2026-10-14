# Premium look — Phase 4: Coach studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The coach studio (`/admin` in `frontend-customer`) wears the premium look through its shell and the shared primitives, and the Overview greets the coach by name over her site's look, with every one of the 44 pages left untouched.

**Architecture:** Phase 0 already put the studio on the shared token sheet and Geist. This phase changes class strings only, in three layers: the nine shared primitives in `packages/shared/src/ui` (both apps consume them, so each change must be neutral for `frontend-main`), the studio shell (`admin-shell.tsx`, `app-sidebar.tsx`, `mobile-header.tsx`, `section-tabs.tsx`, the palette's surface), and the Overview page, which gains a welcome frame driven by two pure helpers (`greetingKey`, `lookSummary`) and a tiny `AdminUserContext`. The one raw-colour hit in the sweep is the admin browser-bar hex, which becomes a constant pinned to the token sheet by a test.

**Tech Stack:** Next.js 14 App Router, Tailwind 3.4, next-intl 4, next-themes 0.4, vitest (pure-logic tests only, `frontend-customer/src/lib/__tests__`), Playwright e2e (`make e2e-spec`).

**Spec:** `docs/superpowers/specs/2026-10-14-premium-marketing-and-studio-design.md` — section 5.6 (Coach studio) and the "4 Studio" row of section 6; decisions D1, D2, D4, D7, D9, D10, D12. Companion: `docs/superpowers/specs/2026-10-13-coach-admin-refactor-design.md` (its Phase 4, the Today feed, is NOT built and must not be pre-empted: the Overview gets only the welcome frame).

**Depends on:** Phase 0 (`docs/superpowers/plans/2026-10-14-premium-phase-0-foundations.md`) Tasks 1, 2 and 4 landed: `packages/shared/src/styles/tokens.css`, `packages/shared/src/lib/contrast.ts` (`readTokens`), the preset utilities, and `frontend-customer` importing the sheet and Geist. `MediaVideo` (Phase 0 Task 6) is available via `@/components/ui/media-video` but spec 5.6 puts no video in the studio, so this phase does not use it.

## Global Constraints

- Token names unchanged (spec D7): `--background --foreground --card --muted --muted-foreground --primary --primary-foreground --accent --accent-foreground --border --input --ring --marketing-accent --marketing-accent-foreground --radius`; `--accent` is the hover tint, `--marketing-accent` is brass.
- Token-only colour in the studio chrome: no `bg-white`, `text-gray-*`, `bg-slate-*`, hex (spec 5.6). The one literal that cannot be a token is `<meta name="theme-color">`, which takes no `oklch()`; it is pinned to the token sheet by a test (Task 2).
- **Alpha on a token is a no-op on this checkout.** `packages/shared/tailwind-preset.ts` has no `alphaTokens`, so `bg-primary/90`, `ring-ring/50`, `bg-marketing-accent/15` emit no rule (memory: `reference-token-opacity-classes-are-no-ops`). Write solid tokens only: `bg-accent`, `bg-muted`, `bg-foreground`, `text-muted-foreground`. `bg-black/50` scrims are fine (`black` is a Tailwind colour, not a `var()`).
- No new runtime dependency (spec D9).
- The studio's 44 pages are not rewritten (spec D10). Only the shell, the primitives and the Overview welcome are touched.
- Sizes from spec 5.6: sidebar 240 px on second paper with a hairline right edge, items `caption` weight 500 with 16 px icons, active item an ink-on-paper pill; top bar 52 px, search pill and assistant button as paper pills with hairlines; section tabs a segmented control on second paper with an ink pill for the active tab; Card flat with a hairline and 16 px radius; Button heights unchanged, ink primary, paper outline; Input 40 px with a hairline and the 3 px ink ring; Table rows 48 px with hairlines only. Nothing changes in any primitive's API.
- The studio keeps the coach's one light/dark choice (spec D4; memory `feedback-one-dark-toggle-site-and-admin`): every change must read right under `.dark` too. Text contrast ≥ 4.5:1 on both papers in both schemes (spec 5.7).
- Loading and feedback conventions hold (spec D12, root `CLAUDE.md`): `<NavLink>` for internal links, `useNavigate()` for programmatic navigation, `<Spinner>` for spinners, `<PageState>` for initial loads; `scripts/check-loading-patterns.mjs` runs in `make lint`. "View site" opens the public site in a new tab and is a plain `next/link` `<Link target="_blank">`, as the shell already does.
- The superadmin console (`frontend-main/src/app/admin`), the student portal and tenant site styles are untouched by hand (spec D1, section 9); the primitives they share must stay neutral there.
- One name per page (admin refactor spec 5.1): `lib/__tests__/admin-page-titles.test.ts` requires each page's `<h1>` to read `nav.items.<key>`; the Overview is added to its `NO_TITLE` set because its `<h1>` becomes the greeting (Task 6).
- `make e2e-changed` fails closed to the whole suite for `app/admin/**` and `packages/shared/**` (unmapped in `e2e/impact-map.json`); run the five gate specs one at a time instead: `make e2e-spec SPEC=00-smoke`, `02-courses`, `05-media`, `25-navigation-feedback`, `27-nav-stage-gating`.
- Never commit a file you did not change; peers share the checkout. Commit only the paths each task lists.
- One heavy job on the Docker VM at a time: never run `make e2e-spec` while `make test`, `make test-frontend` or a build runs.

## Review Focus

1. **A primitive class change shifts `frontend-main`.** The superadmin console (`/admin`, `/admin/tenants/<slug>` tables), signup (`variant="brand"`, `variant="glass"` buttons) and pricing all render the shared Card/Button/Input/Table/Badge/Tabs. Expected: same layout, ink primary, paper outline, no shadow, legacy variants still render. Pinned by `ui-primitives.test.ts` (Task 1: `brand` ≡ `default`, `glass` ≡ `outline`, no `shadow-`, no alpha on tokens) and the browser check in Task 7 step 3.1.
2. **The greeting before the user is known, or for a nameless user.** `User.name` is a free string: a coach who skipped it at signup has `""`, an imported one may carry her e-mail, and `useAdminUser()` is `null` outside the shell. Expected: "Good morning" alone, never "Good morning, undefined" or "Good morning, coach@demo-yoga.test". Pinned by `admin-welcome.test.ts` (Task 5: `firstName` returns `""` for `undefined`, `null`, blank and e-mail-shaped names) and the render path in Task 6 that drops the comma when the name is empty; checked in Task 6 step 5 by blanking the seeded coach's name for a moment.
3. **Dark-mode contrast of the segmented control.** Expected: the active tab reads as dark text on a near-white pill, inactive tabs as readable muted text on the second-paper track. Pinned by Phase 0's `tokens-contrast.test.ts` pairs (`--foreground`/`--background` both ways — the pill is `bg-foreground text-background` — and `--muted-foreground`/`--muted` in dark) and the browser check in Task 7 step 3.3.
4. **The collapsed sidebar.** Expected: a 64 px rail, seven centred icon pills with `title` tooltips, the app title hidden, the toggle still reachable, and e2e `27` still counting seven links. Pinned by Task 7 step 3.4 and `make e2e-spec SPEC=27-nav-stage-gating`.
5. **The phone header.** Expected at 375 px: a 52 px bar with the title, "View site" and the menu button; the drawer shows seven rows, the theme toggle and sign out; the section tabs scroll horizontally; no horizontal page scroll. Pinned by Task 7 step 3.5.

## Scope notes (spec lines that need no code)

- Spec 5.6 "section labels as eyebrows": since the admin refactor's Phase 1 the sidebar is seven section rows with no sub-labels (`lib/admin-nav.ts`), so there is no label to set as an eyebrow. No change.
- `user-menu.tsx` is already token-only; its popover keeps `shadow-md` (overlays need separation; the spec's "no shadow" is about cards and controls). Same for the command palette's `shadow-2xl`, the publish card's modal `shadow-xl`, and the `bg-black/50` scrims.
- `assistant-dock.tsx` surfaces are already paper (`bg-background`) with hairlines (`border-b`, `lg:border-l`). No change.
- `separator.tsx` (`bg-border` hairline) and `skeleton.tsx` (`bg-muted`, motion-safe shimmer) already match. No change.
- 142 occurrences of `amber|emerald|red|green|…-NNN` remain in admin pages (`unified-calendar.tsx` 48, `live/shared.tsx` 20, `messages/email/[id]/page.tsx` 20, `student-drawer.tsx` 15, `publish-card.tsx` 12, `impersonation-banner.tsx` 6, …). They are semantic status colours on pages, outside the sweep spec 5.6 defines (`bg-white`, `text-gray-*`, `bg-slate-*`, hex) and outside D10. The token set has no success/warning tokens (spec 5.1); they stay.

## Selectors the e2e gate depends on

| Spec                   | Selector                                                                                                                                                                                                                                                                                                                                                                                                                | What must hold                                                                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 00-smoke               | `page.goto(TENANT/admin)` not redirected to `/login`; `document.getElementById("tenant-theme").media === "not all"` under `/admin`                                                                                                                                                                                                                                                                                      | Shell renders for the coach; `ThemeProvider` logic untouched                                                                                                                                           |
| 00-smoke               | `getByRole("link", { name: "Admin", exact: true })` on the public site                                                                                                                                                                                                                                                                                                                                                  | Public site header, not this phase                                                                                                                                                                     |
| 02-courses             | `getByLabel("Title")`, `getByLabel("Description")`, `getByRole("button", { name: "Choose thumbnail" })`, `getByPlaceholder("New module title")`, `getByRole("button", { name: "Add Module" })`, `getByRole("button", { name: "Add Lesson" })`, `getByPlaceholder("Lesson title")`, `getByRole("cell", { name: "Welcome" })`, `getByRole("button", { name: "Create Course" })`, `getByText("Module 1: Getting Started")` | `Input`, `Button`, `TableCell` keep their elements and labels; only classes change                                                                                                                     |
| 05-media               | API only (`/api/v1/upload/presign/`, `/complete/`, `/photos/<id>/`)                                                                                                                                                                                                                                                                                                                                                     | No UI selector; runs because the gate lists it                                                                                                                                                         |
| 25-navigation-feedback | `page.locator("aside:not([aria-label]) nav").getByRole("link", { name: "Students" })`; `toHaveAttribute("aria-current", "page")`; `getByRole("navigation", { name: "Students" })`; `getByRole("navigation", { name: "Teach" })` count 0; `getByRole("progressbar")`; `getByRole("row")`; `getByPlaceholder("Search...")`; `[aria-busy='true']`                                                                          | The sidebar stays an `<aside>` WITHOUT `aria-label` holding ONE `<nav>` whose links are the seven sections; the section strip stays `<nav aria-label={section.label}>`; `NavLink` keeps `aria-current` |
| 27-nav-stage-gating    | `sidebar(page).getByRole("link")` count 7; `getByRole("link", { name: "Reach out" })`, `{ name: "Teach" }` with `aria-current="page"`; `getByRole("navigation", { name: "Teach" }).getByRole("link")` count 3; `getByRole("button", { name: /\+ \d+ more/i })`; `getByRole("link", { name: "Courses" })`, `{ name: /classes & events/i }`, `{ name: /^blog/i }`                                                         | Exactly seven `NavLink`s inside the sidebar `<nav>` (title link, theme toggle and user menu stay OUTSIDE it); the "+ N more" control stays a `<button>` inside the section `<nav>`                     |

No spec selects "View Site", the Overview `<h1>`, or "Home" (grep of `e2e/specs` on 2026-10-14), so the label change to "View site" and the greeting `<h1>` are safe.

## Raw-colour sweep

Run on 2026-10-14 at 595b08dd:

```
grep -rnE 'bg-white|text-gray-|bg-gray-|bg-slate-|text-slate-|bg-zinc-|#[0-9a-fA-F]{6}\b' frontend-customer/src/app/admin frontend-customer/src/components/admin frontend-customer/src/components/shared
```

| Hit                                                                                                                  | Replacement                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `frontend-customer/src/components/shared/theme-provider.tsx:32` — `resolvedTheme === "dark" ? "#0a0a0a" : "#ffffff"` | `resolvedTheme === "dark" ? ADMIN_THEME_COLOR.dark : ADMIN_THEME_COLOR.light` from `lib/admin-theme-color.ts`, whose two literals are the token sheet's `--background` values and are pinned by `admin-theme-color.test.ts` (Task 2) |

One hit. The `app/admin/**` tree and `components/admin/**` carry no `bg-white`/`text-gray-*`/`bg-slate-*`/`bg-zinc-*` class and no hex (the house-system port of 2026-10 already removed them). Alpha-on-token classes in the shell (`bg-muted/50`, `text-foreground/80`, `text-muted-foreground/60`, `hover:bg-muted/50`) are no-ops today and are replaced by solid tokens in Tasks 1, 3 and 4.

The `generateViewport` `themeColor` for admin paths (`frontend-customer/src/app/layout.tsx`, `generateViewport`, lines 83–94 at 595b08dd; about nine lines higher once Phase 0 Task 4 deletes the font block) stays the light paper at render time: the coach's light/dark choice lives in `localStorage` (next-themes, key `theme`, `enableSystem={false}`), so the server cannot know it and a `prefers-color-scheme` media entry would follow the OS, not her choice. `AdminBrowserBar` already patches the meta after hydration; Task 2 makes both read the same constant.

---

### Task 1: Shared primitives wear the premium look (class strings only)

**Files:**

- Modify: `packages/shared/src/ui/card.tsx:11`
- Modify: `packages/shared/src/ui/button.tsx:7-41`
- Modify: `packages/shared/src/ui/input.tsx:12`
- Modify: `packages/shared/src/ui/table.tsx:45,60,75,89`
- Modify: `packages/shared/src/ui/badge.tsx:5-31`
- Modify: `packages/shared/src/ui/tabs.tsx:68-69`
- Modify: `packages/shared/src/ui/switch.tsx:24,32`
- Test: `frontend-customer/src/lib/__tests__/ui-primitives.test.ts`

**Interfaces:**

- Consumes: Phase 0 tokens (`--radius: 0.75rem` so `rounded-lg` = 12 px; `--ring` = ink).
- Produces: unchanged exports `Card, CardHeader, CardTitle, CardDescription, CardContent`, `Button, buttonVariants`, `Input`, `Table…`, `Badge, badgeVariants`, `Tabs…`, `Switch`. Both apps' `components/ui/*.tsx` shims (`export * from "@shared/ui/…"`) keep working.

- [ ] **Step 1: Write the failing test**

```ts
// frontend-customer/src/lib/__tests__/ui-primitives.test.ts
import { describe, expect, it } from "vitest";
import { badgeVariants } from "@shared/ui/badge";
import { buttonVariants } from "@shared/ui/button";

// Spec 5.6 / D7: the primitives change class strings only, and both apps
// consume them. The legacy variants stay and resolve to the premium pair.
const VARIANTS = [
  "default",
  "destructive",
  "outline",
  "secondary",
  "ghost",
  "link",
  "brand",
  "glass",
] as const;

describe("Button variants", () => {
  it("maps brand to the primary and glass to the outline classes", () => {
    expect(buttonVariants({ variant: "brand" })).toBe(
      buttonVariants({ variant: "default" }),
    );
    expect(buttonVariants({ variant: "glass" })).toBe(
      buttonVariants({ variant: "outline" }),
    );
  });

  it("casts no shadow", () => {
    for (const variant of VARIANTS) {
      expect(buttonVariants({ variant }), variant).not.toMatch(/\bshadow-/);
    }
  });

  it("never puts an alpha on a token colour", () => {
    // bg-primary/90, ring-ring/50 … emit nothing on this checkout: the
    // Tailwind colours are plain var() strings without <alpha-value>.
    for (const variant of VARIANTS) {
      expect(buttonVariants({ variant }), variant).not.toMatch(
        /\b(bg|text|border|ring)-[a-z-]+\/\d/,
      );
    }
  });

  it("keeps the heights", () => {
    expect(buttonVariants({ size: "default" })).toMatch(/\bh-9\b/);
    expect(buttonVariants({ size: "sm" })).toMatch(/\bh-8\b/);
    expect(buttonVariants({ size: "lg" })).toMatch(/\bh-10\b/);
    expect(buttonVariants({ size: "xl" })).toMatch(/\bh-12\b/);
    expect(buttonVariants({ size: "icon" })).toMatch(/\bsize-9\b/);
  });
});

describe("Badge variants", () => {
  it("renders pro with tokens only", () => {
    const cls = badgeVariants({ variant: "pro" });
    expect(cls).not.toMatch(/amber|yellow|orange/);
    expect(cls).toMatch(/marketing-accent/);
  });

  it("never puts an alpha on a token colour", () => {
    for (const variant of [
      "default",
      "secondary",
      "destructive",
      "outline",
      "success",
      "warning",
      "brand",
      "pro",
      "accent",
      "glass",
    ] as const) {
      expect(badgeVariants({ variant }), variant).not.toMatch(
        /\b(bg|text|border|ring)-[a-z-]+\/\d/,
      );
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/ui-primitives.test.ts`
Expected: FAIL — `glass` ≠ `outline` (different strings today), `shadow-xs` present, `ring-ring/50` matches the alpha regex, `pro` contains `amber`.

- [ ] **Step 3: Card — flat, hairline, 16 px**

In `packages/shared/src/ui/card.tsx` line 11 replace

```tsx
      "relative rounded-xl border bg-card text-card-foreground shadow-sm",
```

with

```tsx
      "relative rounded-2xl border bg-card text-card-foreground",
```

- [ ] **Step 4: Button — ink primary, paper outline, 3 px ink ring, no shadow**

In `packages/shared/src/ui/button.tsx` replace lines 7–41 (the whole `const buttonVariants = cva(…)` call) with:

```tsx
const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-50 motion-safe:active:scale-[0.98] [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:border-destructive aria-invalid:ring-destructive",
  {
    variants: {
      variant: {
        // Ink on paper; the press scale is the only hover/press motion.
        default: "bg-primary text-primary-foreground",
        destructive:
          "bg-destructive text-destructive-foreground focus-visible:ring-destructive",
        outline:
          "border bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        // Legacy names, kept for their callers (signup, dashboard, pricing,
        // the admin's AI badge): the same classes as the primary pair.
        brand: "bg-primary text-primary-foreground",
        glass:
          "border bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
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
```

(The old `hover:bg-primary/90`, `hover:bg-destructive/90`, `hover:bg-secondary/80`, `ring-ring/50` and `ring-destructive/20` never emitted a rule here, so nothing visible is lost; the ring-offset is what makes a 3 px ink ring visible around an ink button.)

- [ ] **Step 5: Input — 40 px, hairline, 3 px ink ring**

In `packages/shared/src/ui/input.tsx` line 12 replace the class string with:

```tsx
          "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground transition-[color,box-shadow] outline-none placeholder:text-muted-foreground file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive",
```

- [ ] **Step 6: Table — 48 px rows, hairlines only**

In `packages/shared/src/ui/table.tsx`:

line 45 (`TableFooter`):

```tsx
      "border-t bg-muted font-medium [&>tr]:last:border-b-0",
```

line 60 (`TableRow`):

```tsx
      "h-12 border-b transition-colors hover:bg-muted data-[state=selected]:bg-muted",
```

line 75 (`TableHead`):

```tsx
      "h-12 px-3 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
```

line 89 (`TableCell`):

```tsx
    className={cn("px-3 py-2 align-middle [&:has([role=checkbox])]:pr-0", className)}
```

- [ ] **Step 7: Badge — tokens only**

In `packages/shared/src/ui/badge.tsx` replace lines 5–31 (the `const badgeVariants = cva(…)` call) with:

```tsx
const badgeVariants = cva(
  "inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground",
        outline: "border-border text-foreground",
        // No success/warning tokens in the set (spec 5.1): a positive state is
        // brass text on second paper, a neutral one muted text on it.
        success: "border-transparent bg-muted text-marketing-accent",
        warning: "border-transparent bg-muted text-muted-foreground",
        brand: "border-transparent bg-muted text-foreground",
        // "Paid" — premium reads as a brass hairline, not an alarm.
        pro: "border-marketing-accent bg-transparent text-marketing-accent",
        accent: "border-transparent bg-accent text-accent-foreground",
        glass: "border-border bg-card text-card-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);
```

- [ ] **Step 8: Tabs and Switch — no shadow**

In `packages/shared/src/ui/tabs.tsx` line 69 replace

```tsx
        ctx.value === value && "bg-background text-foreground shadow",
```

with

```tsx
        ctx.value === value && "bg-background text-foreground",
```

In `packages/shared/src/ui/switch.tsx` line 24 replace the track class string with:

```tsx
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
```

and line 32 (the thumb) with:

```tsx
          "pointer-events-none block h-4 w-4 rounded-full border border-border bg-background transition-transform",
```

(The hairline on the thumb replaces the shadow that separated it from the unchecked `bg-input` track.)

- [ ] **Step 9: Run the test to verify it passes**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/ui-primitives.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 10: Typecheck both apps and look at the shared surfaces**

Run: `make typecheck`
Expected: clean for both apps (class strings only; no type changed).

Browser pane, as the coach (memory `reference-browser-pane-coach-login`): `http://demo-yoga.localhost/admin/courses/new` — the Title input is 40 px with a hairline, and on focus a solid ink ring (not the blue Tailwind default it showed before); "Create Course" is an ink button with 12 px corners and no shadow; cards have 16 px corners and no shadow. `http://demo-yoga.localhost/admin/students` — rows are 48 px and highlight on hover.

- [ ] **Step 11: Commit**

```bash
git add packages/shared/src/ui/card.tsx packages/shared/src/ui/button.tsx packages/shared/src/ui/input.tsx packages/shared/src/ui/table.tsx packages/shared/src/ui/badge.tsx packages/shared/src/ui/tabs.tsx packages/shared/src/ui/switch.tsx frontend-customer/src/lib/__tests__/ui-primitives.test.ts
git commit -m "feat(shared): primitives wear the premium look — flat cards, ink primary, 3px ink ring, 48px rows, no shadows"
```

---

### Task 2: The admin browser bar is the paper token (the sweep's one hit)

**Files:**

- Create: `frontend-customer/src/lib/admin-theme-color.ts`
- Modify: `frontend-customer/src/components/shared/theme-provider.tsx:8,26-34`
- Modify: `frontend-customer/src/app/layout.tsx` (`generateViewport`, lines 83–94 at 595b08dd; search for the function — Phase 0 Task 4 shifts it up)
- Test: `frontend-customer/src/lib/__tests__/admin-theme-color.test.ts`

**Interfaces:**

- Consumes: `readTokens(block: string): Record<string, string>` from `@shared/lib/contrast` (Phase 0 Task 1); `oklchToHex(color: string): string | undefined` from `@/lib/site-styles`.
- Produces: `ADMIN_THEME_COLOR: { readonly light: string; readonly dark: string }`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend-customer/src/lib/__tests__/admin-theme-color.test.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readTokens } from "@shared/lib/contrast";
import { ADMIN_THEME_COLOR } from "@/lib/admin-theme-color";
import { oklchToHex } from "@/lib/site-styles";

// <meta name="theme-color"> takes no oklch(): the two hex literals must be the
// token sheet's papers, so the browser bar never drifts from the studio.
const sheet = readFileSync(
  path.resolve(__dirname, "../../../../packages/shared/src/styles/tokens.css"),
  "utf8",
);
const [lightBlock, darkBlock] = sheet.split(".dark");

describe("ADMIN_THEME_COLOR", () => {
  it("is the light paper", () => {
    expect(ADMIN_THEME_COLOR.light).toBe(
      oklchToHex(readTokens(lightBlock)["--background"]),
    );
  });
  it("is the dark paper", () => {
    expect(ADMIN_THEME_COLOR.dark).toBe(
      oklchToHex(readTokens(".dark" + darkBlock)["--background"]),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/admin-theme-color.test.ts`
Expected: FAIL, cannot resolve `@/lib/admin-theme-color`.

- [ ] **Step 3: Write the constant**

```ts
// frontend-customer/src/lib/admin-theme-color.ts
/** The studio's browser-bar colour per scheme: the token sheet's `--background`
 *  (packages/shared/src/styles/tokens.css) as sRGB hex, because
 *  <meta name="theme-color"> takes no oklch(). Pinned to the sheet by
 *  lib/__tests__/admin-theme-color.test.ts — change the sheet, the test says
 *  which hex to paste here. */
export const ADMIN_THEME_COLOR = {
  light: "#ffffff", // oklch(1 0 0)
  dark: "#080706", // oklch(0.13 0.005 80)
} as const;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/admin-theme-color.test.ts`
Expected: PASS (2 tests). If the dark one fails, paste the hex from the assertion message (the sheet's value wins).

- [ ] **Step 5: Use it in the browser bar and the viewport**

In `frontend-customer/src/components/shared/theme-provider.tsx` add after line 8 (`import { isAdminPath, TENANT_THEME_SHEET_ID } from "@/lib/site-styles";`):

```ts
import { ADMIN_THEME_COLOR } from "@/lib/admin-theme-color";
```

and replace lines 26–34 (the `useEffect` body of `AdminBrowserBar`) with:

```tsx
useEffect(() => {
  if (!admin) return;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute(
      "content",
      resolvedTheme === "dark"
        ? ADMIN_THEME_COLOR.dark
        : ADMIN_THEME_COLOR.light,
    );
}, [admin, resolvedTheme]);
```

In `frontend-customer/src/app/layout.tsx` add to the imports:

```ts
import { ADMIN_THEME_COLOR } from "@/lib/admin-theme-color";
```

and in `generateViewport` replace

```ts
return { themeColor: "#ffffff", viewportFit: "cover" };
```

with

```ts
// Light at render time: the coach's light/dark choice lives in
// localStorage, so the server cannot know it; AdminBrowserBar patches the
// meta after hydration.
return { themeColor: ADMIN_THEME_COLOR.light, viewportFit: "cover" };
```

- [ ] **Step 6: Re-run the sweep and typecheck**

Run:

```bash
grep -rnE 'bg-white|text-gray-|bg-gray-|bg-slate-|text-slate-|bg-zinc-|#[0-9a-fA-F]{6}\b' frontend-customer/src/app/admin frontend-customer/src/components/admin frontend-customer/src/components/shared
make typecheck
```

Expected: the grep prints nothing; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add frontend-customer/src/lib/admin-theme-color.ts frontend-customer/src/lib/__tests__/admin-theme-color.test.ts frontend-customer/src/components/shared/theme-provider.tsx frontend-customer/src/app/layout.tsx
git commit -m "feat(customer): the admin browser bar is the paper token, pinned to the token sheet"
```

---

### Task 3: Shell, part 1 — sidebar and phone header

**Files:**

- Modify: `frontend-customer/src/components/shared/app-sidebar.tsx:1-13,44-130`
- Modify: `frontend-customer/src/components/shared/mobile-header.tsx:1-16,24-133`
- Modify: `frontend-customer/messages/en/admin.json` (add top-level `viewSite`)

**Interfaces:**

- Consumes: Phase 0 preset utilities `text-caption`, `ease-expo`; `NavLink` (`@shared/ui/nav-link`: `className: string | ((state: { active; pending }) => string)`, children may be a function of the same state); `sectionHref(section)` from `@/lib/admin-nav`.
- Produces: unchanged exports `AppSidebar({ title, sections, children })`, `NavItem`, `NavSection`, `MobileHeader({ title, sections, user })`. New message key `admin.viewSite` ("View site"), reused by Task 4 and Task 6.

- [ ] **Step 1: Add the message key**

In `frontend-customer/messages/en/admin.json`, directly after the line `"title": "Admin",` insert:

```json
  "viewSite": "View site",
```

- [ ] **Step 2: Rewrite the sidebar body**

In `frontend-customer/src/components/shared/app-sidebar.tsx` delete line 7 (`import { Separator } from "@/components/ui/separator";` — the footer's hairline is its `border-t`) and replace lines 44–130 (the whole `AppSidebar` function) with:

```tsx
export function AppSidebar({ title, sections, children }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    // No aria-label on purpose: e2e selects the sidebar as the one <aside>
    // without a label (the assistant panel is <aside aria-label="Assistant">).
    <aside
      className={cn(
        "hidden flex-col border-r bg-muted transition-[width] duration-200 ease-expo md:flex",
        collapsed ? "w-16" : "w-60",
      )}
    >
      {/* Header: 52 px, so its hairline meets the top bar's */}
      <div className="flex h-[52px] items-center justify-between gap-2 border-b px-3">
        {!collapsed && (
          <NavLink
            href="/admin"
            className="truncate text-caption font-semibold tracking-tight text-foreground transition-colors hover:text-muted-foreground"
            title="Back to Admin Overview"
          >
            {title}
          </NavLink>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-8 w-8 shrink-0 rounded-full"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronLeft
            className={cn(
              "h-4 w-4 transition-transform",
              collapsed && "rotate-180",
            )}
          />
        </Button>
      </div>

      {/* Navigation: the seven places, caption weight 500, 16 px icons; the
          active one is a paper pill on the second paper (spec 5.6). This <nav>
          holds exactly the section links — e2e counts them. */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {sections.map((section) => (
          <NavLink
            key={section.id}
            href={sectionHref(section)}
            title={collapsed ? section.label : undefined}
            // Lit anywhere inside the section, not only on its first page.
            activeMatch={(current) =>
              section.items.some(
                (i) => !i.external && defaultActiveMatch(current, i.href),
              )
            }
            className={({ active }) =>
              cn(
                "flex h-9 items-center gap-3 rounded-full px-3 text-caption font-medium transition-colors",
                collapsed && "mx-auto w-9 justify-center px-0",
                active
                  ? "bg-background text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )
            }
          >
            {({ pending }) => (
              <>
                {pending ? (
                  <Spinner size="sm" className="shrink-0" />
                ) : (
                  <section.icon className="h-4 w-4 shrink-0" />
                )}
                {!collapsed && (
                  <span className="truncate">{section.label}</span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer: theme toggle and the user menu, outside the <nav> */}
      <div className="space-y-1 border-t p-2">
        <ThemeToggle collapsed={collapsed} />
        {React.Children.map(children, (child) =>
          React.isValidElement(child)
            ? React.cloneElement(child as React.ReactElement<any>, {
                collapsed,
              })
            : child,
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Rewrite the phone header**

In `frontend-customer/src/components/shared/mobile-header.tsx` add after line 5 (`import { useRouter } from "next/navigation";`):

```ts
import { useTranslations } from "next-intl";
```

and replace lines 24–133 (the whole `MobileHeader` function) with:

```tsx
export function MobileHeader({ title, sections, user }: MobileHeaderProps) {
  const t = useTranslations("admin");
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { navigate } = useNavigation();
  const router = useRouter();
  return (
    <div className="md:hidden">
      {/* 52 px bar on paper, hairline below (spec 5.6) */}
      <div className="flex h-[52px] items-center justify-between gap-2 border-b bg-background px-4">
        <NavLink
          href="/admin"
          className="truncate text-caption font-semibold tracking-tight text-foreground transition-colors hover:text-muted-foreground"
          title="Back to Admin Overview"
        >
          {title}
        </NavLink>

        <div className="flex items-center gap-1">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-8 gap-1 rounded-full px-2 text-muted-foreground hover:text-foreground"
          >
            <Link href="/" target="_blank" rel="noopener noreferrer">
              <Globe className="h-3.5 w-3.5" />
              <span>{t("viewSite")}</span>
            </Link>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => setOpen(!open)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>
      {open && (
        <nav className="space-y-1 border-b bg-muted p-2">
          {sections.map((section) => (
            <NavLink
              key={section.id}
              href={sectionHref(section)}
              onClick={() => setOpen(false)}
              activeMatch={(current) =>
                section.items.some(
                  (i) => !i.external && defaultActiveMatch(current, i.href),
                )
              }
              className={({ active }) =>
                cn(
                  "flex h-10 items-center gap-3 rounded-full px-3 text-caption font-medium transition-colors",
                  active
                    ? "bg-background text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )
              }
            >
              <section.icon className="h-4 w-4" />
              <span>{section.label}</span>
            </NavLink>
          ))}

          {user && (
            <div className="mt-2 border-t pt-2">
              <div className="flex items-center gap-2.5 px-3 py-2">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={user.avatar_url} />
                  <AvatarFallback className="text-[10px]">
                    {(user.name || user.email)
                      .split(" ")
                      .map((w) => w[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-caption font-medium">
                    {user.name || user.email}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {user.role === "owner" ? "Owner" : "Coach"}
                  </p>
                </div>
              </div>
              <ThemeToggle className="px-3 text-muted-foreground" />
              <button
                onClick={async () => {
                  setSigningOut(true);
                  await fetch("/api/auth/logout", { method: "POST" });
                  navigate(
                    "/login?toast=You've+been+logged+out&toast_type=info",
                  );
                  router.refresh();
                }}
                disabled={signingOut}
                className="flex w-full items-center gap-2 rounded-full px-3 py-2 text-caption text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <LogOut className="h-3.5 w-3.5" />
                {signingOut ? "Signing out..." : "Sign out"}
              </button>
            </div>
          )}
        </nav>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck and look, light and dark, wide and narrow**

Run: `make typecheck && node scripts/check-loading-patterns.mjs`
Expected: clean.

Browser pane as the coach, `http://demo-yoga.localhost/admin/courses`:

- 1440 wide: a 240 px second-paper sidebar with a hairline right edge, "Teach" as a white pill with ink text, the other rows muted; the header hairline sits at 52 px. Click the chevron: a 64 px rail, seven centred icon circles, "Teach" still the pill, hovering a circle shows its `title`. Click the chevron again.
- Click the sidebar's "Switch to dark mode": the sidebar is the lighter dark paper (`--muted` 0.22), the active pill the darker page paper (0.13), text near-white. Switch back.
- 375 wide (`resize_window` preset mobile): the sidebar is gone; a 52 px bar shows "Admin", "View site" and the menu button; the menu opens a second-paper drawer with seven rows, the theme toggle and "Sign out"; no horizontal scroll.

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/components/shared/app-sidebar.tsx frontend-customer/src/components/shared/mobile-header.tsx frontend-customer/messages/en/admin.json
git commit -m "feat(studio): 240px second-paper sidebar with paper pills; 52px phone header"
```

---

### Task 4: Shell, part 2 — top bar, segmented section tabs, palette surface, lock mark

**Files:**

- Modify: `frontend-customer/src/components/admin/admin-shell.tsx:99-148`
- Modify: `frontend-customer/src/components/admin/section-tabs.tsx:25-63`
- Modify: `frontend-customer/src/components/admin/command-palette.tsx:114`
- Modify: `frontend-customer/src/components/admin/feature-badges.tsx:82`

**Interfaces:**

- Consumes: `admin.viewSite` (Task 3); `text-caption` (Phase 0).
- Produces: unchanged exports `AdminShell`, `SectionTabs`, `CommandPalette`, `LockedMark`. The section strip stays `<nav aria-label={section.label}>` with `NavLink`s and the `"+ N more"` `<button>` as its interactive descendants.

- [ ] **Step 1: The top bar**

In `frontend-customer/src/components/admin/admin-shell.tsx` replace lines 99–148 (from the `{/* Top Header Bar …` comment through the closing `</div>` of the bar) with:

```tsx
{
  /* Top bar, 52 px: the search pill, the assistant and "View site" as
            paper pills with hairlines (spec 5.6). The ref sits below
            MobileHeader in flow, so the published clearance covers both bars
            and the copilot drawer starts beneath them. */
}
<div
  ref={topbarRef}
  className="flex h-[52px] items-center justify-between gap-3 border-b bg-background px-4"
>
  <button
    type="button"
    onClick={() => setCmdOpen(true)}
    className="flex h-9 w-full min-w-0 max-w-sm items-center gap-2.5 rounded-full border bg-background px-3 text-caption text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
  >
    <Search className="h-4 w-4 shrink-0" />
    <span className="truncate">{t("palette.placeholder")}</span>
    <kbd className="ml-auto hidden items-center gap-0.5 rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
      ⌘K
    </kbd>
  </button>

  <Button
    variant="outline"
    className="ml-auto shrink-0 gap-1.5 rounded-full px-3"
    onClick={dock.toggle}
    aria-pressed={dock.isOpen}
  >
    <Sparkles className="h-4 w-4" />
    <span>{t("dock.title")}</span>
    {setup &&
      !setup.dismissed &&
      setup.progress.done < setup.progress.total && (
        <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">
          {setup.progress.done}/{setup.progress.total}
        </span>
      )}
  </Button>

  <Button
    asChild
    variant="outline"
    className="hidden shrink-0 gap-1.5 rounded-full px-3 md:inline-flex"
  >
    <Link href="/" target="_blank" rel="noopener noreferrer">
      <Globe className="h-4 w-4 text-muted-foreground" />
      <span>{t("viewSite")}</span>
      <ExternalLink className="h-3 w-3 text-muted-foreground" />
    </Link>
  </Button>
</div>;
```

(Default button size is `h-9`, which fits the 52 px bar with 8 px above and below; `size="sm"` would set `text-xs` and fight `text-caption` in tailwind-merge, so it is not used here.)

- [ ] **Step 2: The segmented control**

In `frontend-customer/src/components/admin/section-tabs.tsx` replace lines 25–63 (the `return (…)`) with:

```tsx
return (
  // The <nav> keeps the section's name: e2e finds the strip as
  // getByRole("navigation", { name: section.label }).
  <nav
    aria-label={section.label}
    className="flex items-center overflow-x-auto border-b bg-background px-4 py-2"
  >
    {/* Segmented control on second paper; the active page is an ink pill */}
    <div className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-muted p-1">
      {section.items.map((item) => (
        <NavLink
          key={item.href}
          href={item.href}
          target={item.external ? "_blank" : undefined}
          rel={item.external ? "noopener noreferrer" : undefined}
          className={({ active }) =>
            cn(
              "flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-caption font-medium transition-colors",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )
          }
        >
          <span>{item.label}</span>
          {item.external && (
            <ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />
          )}
          {item.requiresEntitlement && (
            <LockedMark feature={item.requiresEntitlement} />
          )}
        </NavLink>
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => onExpand(section.id)}
          className="h-7 shrink-0 rounded-full px-3 text-caption text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("nav.more", { count: hidden })}
        </button>
      )}
    </div>
  </nav>
);
```

- [ ] **Step 3: The lock inherits the pill's colour**

In `frontend-customer/src/components/admin/feature-badges.tsx` line 82 replace

```tsx
<Lock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
```

with

```tsx
<Lock className="h-3 w-3 opacity-60" aria-hidden="true" />
```

(On the ink pill a `text-muted-foreground` lock was grey on ink; inheriting `currentColor` at 60 % reads on both the pill and the track.)

- [ ] **Step 4: The palette's surface**

In `frontend-customer/src/components/admin/command-palette.tsx` line 114 replace

```tsx
className =
  "w-full max-w-2xl rounded-xl border bg-background shadow-2xl overflow-hidden flex flex-col max-h-[80vh]";
```

with

```tsx
className =
  "w-full max-w-2xl rounded-2xl border bg-background shadow-2xl overflow-hidden flex flex-col max-h-[80vh]";
```

(16 px like the cards; the shadow stays — it is a floating overlay.)

- [ ] **Step 5: Typecheck, lint patterns, look**

Run: `make typecheck && node scripts/check-loading-patterns.mjs`
Expected: clean.

Browser pane as the coach, `http://demo-yoga.localhost/admin/courses` at 1440: the top bar is 52 px with a hairline; the search pill, "Assistant" and "View site" are 36 px paper pills with hairlines; under it a second-paper segmented control with "Courses" as an ink pill, "Classes & events" and "Downloads" muted. Press ⌘K: the palette has 16 px corners. Switch to dark: the active tab is a near-white pill with dark text, the track darker, the inactive tabs readable. Switch back. At 375: the segmented control scrolls horizontally inside its strip; the page does not.

- [ ] **Step 6: Commit**

```bash
git add frontend-customer/src/components/admin/admin-shell.tsx frontend-customer/src/components/admin/section-tabs.tsx frontend-customer/src/components/admin/command-palette.tsx frontend-customer/src/components/admin/feature-badges.tsx
git commit -m "feat(studio): 52px top bar with paper pills; section tabs as a segmented control with an ink pill"
```

---

### Task 5: Welcome helpers and the admin user context

**Files:**

- Create: `frontend-customer/src/lib/admin-welcome.ts`
- Create: `frontend-customer/src/hooks/use-admin-user.ts`
- Modify: `frontend-customer/src/components/admin/admin-shell.tsx:28-43`
- Test: `frontend-customer/src/lib/__tests__/admin-welcome.test.ts`

**Interfaces:**

- Consumes: `siteLook(styleId?: string | null): SiteStyle`, `paletteOf(style: SiteStyle, paletteId?: string | null): SiteStylePalette` from `@/lib/site-styles`; `SiteStyle` (`label`, `paletteLabel`, `palette`, `palettes: { id; label; palette }[]`) and `SiteStylePalette` (`background`, `foreground`, `primary`, `accent`, …) from `@shared/sections/types`; `User` (`name: string`, `email`, `role`, `avatar_url`) from `@/types/auth`.
- Produces:
  - `type GreetingKey = "morning" | "afternoon" | "evening" | "hello"`
  - `greetingKey(hour: number | null): GreetingKey`
  - `firstName(name: string | null | undefined): string` (empty when there is nothing to greet by)
  - `lookSummary(styleId?: string | null, paletteId?: string | null): { label: string; palette: string; colors: [string, string, string, string] }`
  - `AdminUserContext: React.Context<User | null>`, `useAdminUser(): User | null`

- [ ] **Step 1: Write the failing test**

```ts
// frontend-customer/src/lib/__tests__/admin-welcome.test.ts
import { describe, expect, it } from "vitest";
import { SITE_STYLES } from "@shared/sections/styles";
import { firstName, greetingKey, lookSummary } from "@/lib/admin-welcome";
import { siteLook } from "@/lib/site-styles";

describe("greetingKey", () => {
  it("follows the hour: 5–11 morning, 12–17 afternoon, otherwise evening", () => {
    expect(greetingKey(5)).toBe("morning");
    expect(greetingKey(11)).toBe("morning");
    expect(greetingKey(12)).toBe("afternoon");
    expect(greetingKey(17)).toBe("afternoon");
    expect(greetingKey(18)).toBe("evening");
    expect(greetingKey(23)).toBe("evening");
    expect(greetingKey(0)).toBe("evening");
    expect(greetingKey(4)).toBe("evening");
  });
  it("is a plain hello until the client clock is read, or for a bad hour", () => {
    expect(greetingKey(null)).toBe("hello");
    expect(greetingKey(24)).toBe("hello");
    expect(greetingKey(-1)).toBe("hello");
    expect(greetingKey(Number.NaN)).toBe("hello");
    expect(greetingKey(9.5)).toBe("hello");
  });
});

describe("firstName", () => {
  it("takes the first word", () => {
    expect(firstName("Maya Lindqvist")).toBe("Maya");
    expect(firstName("  Maya   Lindqvist ")).toBe("Maya");
    expect(firstName("Maya")).toBe("Maya");
  });
  it("is empty when there is nothing to greet by — never 'undefined' or an e-mail", () => {
    expect(firstName(undefined)).toBe("");
    expect(firstName(null)).toBe("");
    expect(firstName("")).toBe("");
    expect(firstName("   ")).toBe("");
    expect(firstName("coach@demo-yoga.test")).toBe("");
  });
});

describe("lookSummary", () => {
  const journal = SITE_STYLES.journal;

  it("names the style and its own palette, with four swatches", () => {
    const s = lookSummary("journal", "");
    expect(s.label).toBe(journal.label);
    expect(s.palette).toBe(journal.paletteLabel);
    expect(s.colors).toEqual([
      journal.palette.background,
      journal.palette.foreground,
      journal.palette.primary,
      journal.palette.accent,
    ]);
  });

  it("names an alternative colourway and takes its colours", () => {
    const sage = journal.palettes.find((p) => p.id === "sage")!;
    const s = lookSummary("journal", "sage");
    expect(s.palette).toBe(sage.label);
    expect(s.colors[2]).toBe(sage.palette.primary);
  });

  it("falls back to the style's own palette for an unknown id, and to the default look for no style", () => {
    expect(lookSummary("journal", "mint").palette).toBe(journal.paletteLabel);
    expect(lookSummary(undefined, undefined).label).toBe(
      siteLook(undefined).label,
    );
    expect(lookSummary(null, null).colors).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/admin-welcome.test.ts`
Expected: FAIL, cannot resolve `@/lib/admin-welcome`.

- [ ] **Step 3: Write the helpers**

```ts
// frontend-customer/src/lib/admin-welcome.ts
import type { SiteStylePalette } from "@shared/sections/types";
import { paletteOf, siteLook } from "@/lib/site-styles";

export type GreetingKey = "morning" | "afternoon" | "evening" | "hello";

/** Which greeting the Overview opens with (spec 5.6). `null` is the moment
 *  before the client clock has been read (the server's zone is not hers), so
 *  the page says a neutral hello rather than the server's evening. */
export function greetingKey(hour: number | null): GreetingKey {
  if (hour === null || !Number.isInteger(hour) || hour < 0 || hour > 23) {
    return "hello";
  }
  if (hour < 5) return "evening";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

/** The word to greet her by: the first word of her name, or nothing. A seed
 *  or a token login can leave `name` empty or an e-mail; neither belongs in
 *  "Good morning, …". */
export function firstName(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return first.includes("@") ? "" : first;
}

export interface LookSummary {
  /** The style's name, e.g. "Quiet Journal". */
  label: string;
  /** The colourway's name: the style's own or an alternative's. */
  palette: string;
  /** Paper, ink, brand, accent — the four swatches beside the name. */
  colors: [string, string, string, string];
}

const swatches = (p: SiteStylePalette): LookSummary["colors"] => [
  p.background,
  p.foreground,
  p.primary,
  p.accent,
];

/** What the coach's site wears, for the Overview's welcome frame. Follows
 *  siteLook/paletteOf: an unknown style is the default look, an unknown
 *  palette id the style's own. */
export function lookSummary(
  styleId?: string | null,
  paletteId?: string | null,
): LookSummary {
  const style = siteLook(styleId);
  const variant = style.palettes?.find((p) => paletteId && p.id === paletteId);
  return {
    label: style.label,
    palette: variant?.label ?? style.paletteLabel,
    colors: swatches(paletteOf(style, paletteId)),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/admin-welcome.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: The admin user context**

Create `frontend-customer/src/hooks/use-admin-user.ts` (the same shape as `hooks/use-tenant.ts`):

```ts
"use client";

import { createContext, useContext } from "react";
import type { User } from "@/types/auth";

/** The signed-in coach, as app/admin/layout.tsx resolved her on the server.
 *  Provided by AdminShell, so admin pages can greet her without a fetch. */
export const AdminUserContext = createContext<User | null>(null);

export function useAdminUser() {
  return useContext(AdminUserContext);
}
```

In `frontend-customer/src/components/admin/admin-shell.tsx` add after line 28 (`import type { User } from "@/types/auth";`):

```ts
import { AdminUserContext } from "@/hooks/use-admin-user";
```

and replace lines 35–43 (the `AdminShell` function) with:

```tsx
export function AdminShell({ children, user }: AdminShellProps) {
  return (
    <AdminUserContext.Provider value={user ?? null}>
      <EntitlementsProvider>
        <AssistantDockProvider>
          <AdminShellContent user={user}>{children}</AdminShellContent>
        </AssistantDockProvider>
      </EntitlementsProvider>
    </AdminUserContext.Provider>
  );
}
```

- [ ] **Step 6: Typecheck**

Run: `make typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add frontend-customer/src/lib/admin-welcome.ts frontend-customer/src/lib/__tests__/admin-welcome.test.ts frontend-customer/src/hooks/use-admin-user.ts frontend-customer/src/components/admin/admin-shell.tsx
git commit -m "feat(studio): greeting, first-name and look-summary helpers; the signed-in coach in a context"
```

---

### Task 6: The Overview welcome frame

**Files:**

- Modify: `frontend-customer/src/app/admin/page.tsx` (whole file, 190 lines)
- Modify: `frontend-customer/messages/en/admin.json` (top-level `welcome`)
- Modify: `frontend-customer/src/lib/__tests__/admin-page-titles.test.ts:10-11`

**Interfaces:**

- Consumes: `greetingKey`, `firstName`, `lookSummary` (Task 5); `useAdminUser()` (Task 5); `useTenant()` (`TenantConfig | null` with `style?: string`, `palette?: string`); `admin.viewSite` (Task 3); `text-title`, `text-caption` (Phase 0).
- Produces: the Overview `<h1>` is the greeting; the Today feed (admin refactor Phase 4) will mount below this header later and must not be started here.

- [ ] **Step 1: Replace the unused `welcome` string with the block**

`admin.json`'s top-level `"welcome": "Welcome, {name}"` has no caller (`grep -rn 't("welcome' frontend-customer/src` finds nothing). In `frontend-customer/messages/en/admin.json` replace the line

```json
  "welcome": "Welcome, {name}",
```

with

```json
  "welcome": {
    "morning": "Good morning",
    "afternoon": "Good afternoon",
    "evening": "Good evening",
    "hello": "Hello",
    "withName": "{greeting}, {name}",
    "overview": "Here is an overview of your site.",
    "whatsLeft": "Here’s what’s left to get your site live.",
    "look": "{look} · {palette}"
  },
```

(Typographic apostrophes on purpose: in ICU messages a straight `'` can start a quoted run.)

- [ ] **Step 2: Rewrite the Overview**

Replace the whole of `frontend-customer/src/app/admin/page.tsx` with:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageState } from "@/components/ui/page-state";
import { clientFetch } from "@/lib/api-client";
import {
  BookOpen,
  DollarSign,
  ExternalLink,
  HardDrive,
  Mail,
  Newspaper,
  Plus,
  Users,
  Video,
} from "lucide-react";
import { UsageAdoptionCard } from "@/components/admin/usage-adoption-card";
import { formatMoney } from "@/lib/format";
import { useSetupStatus, useTenantCurrency } from "@/lib/setup-assistant";
import { PublishCard } from "@/components/admin/publish-card";
import { SetupGuideCard } from "@/components/admin/setup-guide-card";
import { useAdminUser } from "@/hooks/use-admin-user";
import { useTenant } from "@/hooks/use-tenant";
import { firstName, greetingKey, lookSummary } from "@/lib/admin-welcome";

export const dynamic = "force-dynamic";

interface DashboardStats {
  students: number;
  courses: number;
  revenue: number;
  storage_used: string;
}

export default function AdminDashboard() {
  const t = useTranslations("admin");
  const user = useAdminUser();
  const config = useTenant();
  const currency = useTenantCurrency();
  const setup = useSetupStatus();
  // Until the status loads, show the overview line rather than flash "what's left".
  const published =
    !setup || Boolean(setup.items.find((i) => i.key === "publish")?.done);

  // The clock is read on the client after mount: the server's zone is not
  // hers, and a server-rendered "Good evening" patched to "Good morning"
  // would flash. Until then the heading is a neutral hello.
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => setHour(new Date().getHours()), []);
  const greeting = t(`welcome.${greetingKey(hour)}`);
  const name = firstName(user?.name);
  const heading = name ? t("welcome.withName", { greeting, name }) : greeting;
  const look = lookSummary(config?.style, config?.palette);

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    students: 0,
    courses: 0,
    revenue: 0,
    storage_used: "0 MB",
  });

  useEffect(() => {
    // Attempt to fetch stats; if endpoint doesn't exist yet, use defaults
    clientFetch<DashboardStats>("/api/v1/admin/stats/")
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const statCards = [
    {
      title: "Students",
      value: stats.students.toLocaleString(),
      icon: Users,
      description: "Total enrolled",
    },
    {
      title: "Courses",
      value: stats.courses.toLocaleString(),
      icon: BookOpen,
      description: "Published & draft",
    },
    {
      title: "Revenue",
      value: formatMoney(stats.revenue, currency),
      icon: DollarSign,
      description: "All time",
    },
    {
      title: "Storage",
      value: stats.storage_used,
      icon: HardDrive,
      description: "Used",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome frame (spec 5.6): the greeting in `title`, the site's look
          and palette with "View site", the quick actions. The Today feed of
          the admin refactor's Phase 4 lands under this header later. */}
      <header className="flex flex-col gap-5 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-title text-foreground">{heading}</h1>
          <p className="mt-2 text-caption text-muted-foreground">
            {published ? t("welcome.overview") : t("welcome.whatsLeft")}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-caption">
            <span className="flex items-center gap-1" aria-hidden="true">
              {look.colors.map((color, i) => (
                <span
                  key={i}
                  // The site's own palette, not studio chrome: the one place
                  // a colour is data rather than a token.
                  className="size-3.5 rounded-full border border-border"
                  style={{ background: color }}
                />
              ))}
            </span>
            <span className="font-medium text-foreground">
              {t("welcome.look", { look: look.label, palette: look.palette })}
            </span>
            <Link
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-marketing-accent hover:underline"
            >
              {t("viewSite")}
              <ExternalLink className="size-3" aria-hidden="true" />
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" className="gap-1.5">
            <Link href="/admin/courses/new">
              <Plus className="h-4 w-4" />
              New Course
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link href="/admin/live">
              <Video className="h-4 w-4" />
              Live Event
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link href="/admin/messages/new">
              <Mail className="h-4 w-4" />
              Message
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link href="/admin/blog">
              <Newspaper className="h-4 w-4" />
              Blog
            </Link>
          </Button>
        </div>
      </header>

      <SetupGuideCard />
      <PublishCard />

      {/* Stat cards */}
      <PageState
        loading={loading}
        skeleton={
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-5 w-5 rounded" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16 mb-1" />
                  <Skeleton className="h-3 w-24" />
                </CardContent>
              </Card>
            ))}
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-caption font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-title-2 tabular-nums">{stat.value}</p>
                <p className="text-caption text-muted-foreground">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </PageState>

      <UsageAdoptionCard />
    </div>
  );
}
```

(Quick actions keep `size="sm"`, which they had; only the four `shadow-sm` classes are gone. The stat value moves from `text-2xl font-bold` to `text-title-2` — the one place the Overview's existing cards take the type scale.)

- [ ] **Step 3: The Overview's one name is the greeting**

In `frontend-customer/src/lib/__tests__/admin-page-titles.test.ts` replace lines 10–11

```ts
/** The inbox is a mail client: its folder rail is its heading. */
const NO_TITLE = new Set(["/admin/inbox"]);
```

with

```ts
/** The inbox is a mail client: its folder rail is its heading. Home greets the
 *  coach by name (premium spec 5.6); its sidebar row still reads "Home". */
const NO_TITLE = new Set(["/admin/inbox", "/admin"]);
```

- [ ] **Step 4: Run the frontend unit tests and typecheck**

Run: `cd frontend-customer && npx vitest run && cd .. && make typecheck && node scripts/check-loading-patterns.mjs`
Expected: all green (`admin-page-titles` no longer looks for `nav.items.home` in `app/admin/page.tsx`; `admin-links` still resolves every `/admin/...` href; `ui-primitives`, `admin-theme-color`, `admin-welcome` pass); typecheck and the pattern check clean.

- [ ] **Step 5: Look at it as two coaches**

Browser pane, `http://demo-yoga.localhost/admin` as the coach (memory `reference-browser-pane-coach-login`):

- The heading reads "Good <morning|afternoon|evening>, <first word of the name shown in the sidebar's user menu>" in `title` (32–40 px). For a split second after a hard reload it may read "Hello, …" — that is the pre-clock render, one word, no layout shift.
- Beneath it: four swatch dots in the site's palette, "Quiet Journal · <palette>" (or whatever demo-yoga wears), and a brass "View site" that opens the public site in a new tab.
- Change the look in the site editor (`/?edit=1`, Look picker), then open `/admin` with a full reload (memory `reference-tenant-theme-stale-on-client-nav`: an in-app move keeps the old config): the swatches and name follow.
- Nameless user: the admin layout reads her from the tenant schema, so blank the seeded coach there for a moment (the shell prints the name to put back):

  ```bash
  docker compose exec -T django python manage.py shell -c "$(cat <<'PY'
  from django_tenants.utils import schema_context
  from apps.accounts.models import User
  with schema_context('demo_yoga'):
      print(list(User.objects.filter(role='owner').values_list('email', 'name')))
      User.objects.filter(role='owner').update(name='')
  PY
  )"
  ```

  Reload `/admin`: the heading is "Good <period>" — no comma, no "undefined". Then restore it with the same command, replacing the `update(name='')` line by `update(name='<the printed name>')`, and reload once more to see the name back.

- Dark: switch with the sidebar toggle — greeting near-white, the brass link lighter brass (`--marketing-accent` dark value), cards on dark card paper with hairlines.

- [ ] **Step 6: Commit**

```bash
git add frontend-customer/src/app/admin/page.tsx frontend-customer/messages/en/admin.json frontend-customer/src/lib/__tests__/admin-page-titles.test.ts
git commit -m "feat(studio): the Overview greets the coach by name over her site's look and palette"
```

---

### Task 7: Phase gate

**Files:** none new.

- [ ] **Step 1: Full frontend checks, one after another**

```bash
make typecheck
make lint
make test-frontend
```

Expected: all clean. `make lint` runs pre-commit (prettier reformats `admin.json` if needed — re-stage and amend the Task 6 commit if it changes), the loading-pattern check and the e2e selector self-test.

- [ ] **Step 2: The five gate specs, one at a time**

`make e2e-changed PLAN=1` will list the whole suite (`app/admin/page.tsx` and `packages/shared/**` are unmapped, so it fails closed; the full suite also drives the AI interview on the hub). Run the gate instead, never two at once:

```bash
make e2e-spec SPEC=00-smoke
make e2e-spec SPEC=02-courses
make e2e-spec SPEC=05-media
make e2e-spec SPEC=25-navigation-feedback
make e2e-spec SPEC=27-nav-stage-gating
```

Expected: PASS each. If a run fails with a blank page or a hung `waitForResponse`, check `docker compose logs caddy --since 20m | grep 'status":502'` before blaming the code (memory `reference-e2e-502-flakiness`); wait for `make health-check` and re-run once.

- [ ] **Step 3: Review-focus browser checks**

In the browser pane, with `resize_window` for the widths and the sidebar toggle for dark:

1. **Primitives are neutral in `frontend-main`.** Mint a superadmin token (`docker compose exec -T django python manage.py issue_login_token --role superadmin`, cookie `contentor_access_token` on `localhost`) and open `http://localhost/admin` at 1440 in light and in dark (its sidebar toggle): stat cards flat with hairlines and 16 px corners, the tenants table with 48 px rows, no shadows, nothing overlapping. Open `http://localhost/signup` and `http://localhost/pricing` at 1440 and 375 signed out: the `brand` buttons are ink pills, the `glass` ones paper with a hairline, inputs 40 px with an ink focus ring.
2. **No "undefined" greeting.** With the coach cookie (`issue_login_token --role coach --tenant demo-yoga` logs in the seeded owner, named "<Tenant> Coach") open `http://demo-yoga.localhost/admin`: "Good <period>, <first word of that name>". Then repeat Task 6 step 5's blank-and-restore once more: "Good <period>" with no trailing comma, "undefined" or e-mail address.
3. **Dark segmented control.** `http://demo-yoga.localhost/admin/courses` at 1440 in dark: the active tab is a near-white pill with dark text; inactive tabs are readable muted text on the darker track; the lock beside a locked tab (narrow `enabled_modules` as e2e 27 does, or just hover) is visible on both. Zoom the browser pane on the strip to confirm.
4. **Collapsed sidebar.** At 1440 light, click the chevron: a 64 px rail, seven centred icon circles, the active one a paper disc, `title` tooltips on hover, the theme toggle and the avatar still in the footer; click again to expand. Dark: repeat once.
5. **Phone header.** At 375×812 open `http://demo-yoga.localhost/admin` and `/admin/courses`: a 52 px bar with "Admin", "View site" and the menu; the drawer opens with seven rows, the theme toggle and "Sign out", and closes on a row tap; the section tabs scroll inside their strip; `document.documentElement.scrollWidth === window.innerWidth`.

Then screenshots of `/admin`, `/admin/courses`, `/admin/students`, `/admin/media` at 375, 1024 and 1440 in light and dark for the Phase 5 visual pass.

- [ ] **Step 4: Record the phase**

Append to the spec's status line (`docs/superpowers/specs/2026-10-14-premium-marketing-and-studio-design.md`, line 3): `· Phase 4 done <date>`. Commit it with Phase 5's first commit, not alone.

---

## Self-review

**Spec coverage (5.6 and the Studio row of 6):**

- Tokens and Geist in `frontend-customer` → Phase 0 Task 4 (not repeated here; stated in "Depends on").
- Sidebar 240 px, second paper, hairline, caption weight 500, 16 px icons, active pill → Task 3. "Section labels as eyebrows" → no label exists (Scope notes).
- Top bar 52 px, search pill and assistant button as paper pills with hairlines → Task 4.
- Section tabs as a segmented control with an ink pill → Task 4.
- Primitives: Card flat hairline 16 px, Button heights unchanged ink/paper, Input 40 px hairline + 3 px ink ring, Table rows 48 px hairlines; APIs unchanged → Task 1 (`ui-primitives.test.ts` pins heights and the legacy variants).
- Overview: greeting in `title` over look name + palette swatches + "View site", existing cards restyled, Today feed not pre-empted → Tasks 5 and 6.
- Raw-colour grep, each hit switched to a token → "Raw-colour sweep" table + Task 2.
- Gate e2e 00, 02, 05, 25, 27 → Task 7.
- D4 dark variant → every look step runs in both schemes; Review Focus 3 and 4.

**Placeholder scan:** every code step carries its full code; commands name their expected results; no "similar to", no "TBD". The Task 6 Step 5 nameless-user check names the exact shell command.

**Type consistency:** `greetingKey(hour: number | null): GreetingKey`, `firstName(name)`, `lookSummary(styleId?, paletteId?)` → `{ label; palette; colors }` are defined in Task 5 and used with those names in Task 6. `ADMIN_THEME_COLOR.light/dark` defined in Task 2 and used in both call sites there. `AdminUserContext`/`useAdminUser` defined in Task 5, consumed in Tasks 5 and 6. The message key `admin.viewSite` is added in Task 3 and read in Tasks 4 and 6; `admin.welcome.*` is added in Task 6 and read only there.

**Review Focus:** items 1 and 2 are pinned by tests (Tasks 1 and 5) plus a check; item 3 by Phase 0's contrast test plus a check; items 4 and 5 by e2e 27 and the browser checks in Task 7 (this repo writes no component tests).
