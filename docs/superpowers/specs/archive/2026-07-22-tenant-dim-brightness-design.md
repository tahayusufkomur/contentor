# Design: "Dim" middle brightness for tenant themes

**Date:** 2026-07-22
**Surface:** `frontend-customer` (the coach's tenant site that students visit)
**Status:** Approved — ready for implementation plan

## Problem

Each of the 6 curated tenant themes (Ocean, Ember, Forest, Sunset, Violet, Slate) in
`frontend-customer/src/lib/themes.ts` ships two brightness modes: `light` and `dark`.
Some visitors find `light` too bright and `dark` too dark. `frontend-main` already
solved this for the marketing site with a soft-dark "Dim" third mode
(commit `101885b`, background ≈ oklch 0.225). We want the same comfortable middle for
every tenant theme.

The plumbing already exists: the shared `ThemeToggle`
(`packages/shared/src/ui/theme-toggle.tsx`) supports a 3-way `modes=["light","dim","dark"]`
cycle (Light → Dim → Dark, Sunset icon). `frontend-customer` simply has no Dim palettes
and doesn't wire the 3-way toggle yet.

## Approach — derive, don't duplicate

Rather than store a third palette per theme, compute Dim on the fly from each theme's
existing `dark` set via a pure `deriveDim()` helper. One function covers all 6 themes and
any future theme, with zero new palette data to maintain. `ThemePalette` interface is
unchanged.

### The derivation

Dim is a *soft-dark*: the dark palette with its surface tones lifted toward a comfortable
~0.22 background.

`deriveDim(dark: Record<string, string>) => Record<string, string>`:

- **Lift lightness +0.06** on the surface keys only:
  `background, card, popover, secondary, muted, border, input, brand-surface`.
  Parse `oklch(L C H)`, add 0.06 to `L` (clamp to ≤ 1), keep chroma + hue unchanged.
  - Example (Ocean dark → dim): `background 0.16 → 0.22`, `card 0.20 → 0.26`,
    `popover 0.20 → 0.26`, `secondary/muted 0.25 → 0.31`, `border/input 0.28 → 0.34`,
    `brand-surface 0.22 → 0.28`.
- **Copy verbatim from `dark`** every other key: `foreground` (stays 0.93), all
  `*-foreground` pairings, `primary`, `accent`, `ring`, `destructive`, `brand-primary`,
  `brand-accent`, `brand-warm`, `chart-1..5`. Text and accents already read well on a
  lifted-dark surface, and the `*-foreground` tokens must stay paired with their base.
- **Cinematic gradient:** reuse the theme's `cinematic.dark` for Dim. A Dim-specific
  gradient is deliberately out of scope; the overlay is subtle enough on a lifted background.

Parsing detail: surface vars are all 3-component `oklch(L C H)` (no alpha) — a regex like
`/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.-]+)\s*\)$/` matches. If a value ever fails to
parse, fall back to copying it verbatim (defensive — never throw).

## Files touched (all in `frontend-customer`)

1. **`src/lib/themes.ts`** — add the `deriveDim()` helper; `generateThemeCSS()` emits a
   `.dim { … }` block after the `.dark` block, using `theme.cinematic.dark` for
   `--cinematic-bg` and the same `font` line. `ThemePalette` interface unchanged.

   ```
   .dim {
   ${dimVars}
     --cinematic-bg: ${theme.cinematic.dark};
   ${font}
   }
   ```

2. **`tailwind.config.ts`** — currently `darkMode: "class"` (fires only under `.dark`).
   Change so `dark:` utilities also apply under `class="dim"`, mirroring `frontend-main`.
   Use a variant selector that matches `.dark` **or** `.dim`, e.g.
   `darkMode: ["variant", ["&:where(.dark, .dark *)", "&:where(.dim, .dim *)"]]`
   (final form verified against the installed Tailwind version during implementation).

3. **`src/app/layout.tsx`** — `ThemeProvider` gains `themes={["light","dim","dark"]}`.
   `defaultTheme="light"` and the `dark_mode_enabled === false → forcedTheme "light"` gate
   stay as-is.

4. **`src/components/shared/tenant-theme-enforcer.tsx`** — when a coach has dark disabled,
   force back to light from **`dark` or `dim`** (currently the check only catches `dark`).

5. **ThemeToggle call sites** — pass `modes={["light","dim","dark"]}`:
   - `src/components/shared/app-sidebar.tsx` (line ~180)
   - `src/components/shared/public-header.tsx` (two renders, lines ~113 and ~351)
   - `src/components/owner/edit-sidebar.tsx` — only if it renders a `ThemeToggle`
     (confirm during implementation; wire it the same way if so).

   All are already gated behind `allowDarkMode = config?.dark_mode_enabled !== false`, so
   no gating change is needed at the call sites — the 3-way cycle simply replaces the
   binary toggle wherever the toggle already shows.

## Gating model

Dim rides on the existing `dark_mode_enabled` switch — **no new coach setting**.

- Coach allows dark mode → visitors get the 3-way Light → Dim → Dark cycle.
- Coach disables dark mode → toggle stays hidden, site is light-only, and the enforcer
  pins any persisted `dim`/`dark` preference back to `light`.

## Testing

- **Unit** (`src/lib/__tests__/themes.test.ts`, new): assert `deriveDim` lifts
  `background` lightness by 0.06 and preserves its chroma + hue, and that
  `generateThemeCSS()` output contains a `.dim {` block whose `--background` is the lifted
  value and whose `--cinematic-bg` equals the dark cinematic.
- **Typecheck:** `make typecheck`.
- **Frontend suite:** `make test-frontend`.
- **Manual/browser:** for each of the 6 themes, cycle Light → Dim → Dark and confirm Dim
  reads as a gentle middle (no muddy or low-contrast surfaces), and that a coach with dark
  mode disabled sees no toggle and a light-only site.

## Out of scope (YAGNI)

- Hand-tuned per-theme Dim palettes.
- Dim-specific cinematic gradients.
- A separate coach control to offer Dim independently of dark mode.
- Showing Dim in the admin design-page preview.
