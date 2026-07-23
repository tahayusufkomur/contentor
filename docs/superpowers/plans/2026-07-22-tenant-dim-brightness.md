# Tenant "Dim" Brightness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a soft-dark "Dim" middle brightness to all 6 curated tenant themes in `frontend-customer`, giving visitors a Light → Dim → Dark cycle.

**Architecture:** Dim is *derived* from each theme's existing `dark` palette (surface tones lifted ~+0.06 lightness, everything else copied) by a pure helper, so no new palette data is stored. `generateThemeCSS` emits a `.dim` CSS block; next-themes, Tailwind, the theme enforcer, and the toggle call sites are wired for the third mode.

**Tech Stack:** TypeScript, Next.js 14 (App Router), next-themes, Tailwind CSS 3.4, OKLCH color, Vitest.

## Global Constraints

- All changes are confined to `frontend-customer/` (and its `@shared` usage). Do not touch `frontend-main`.
- Dim rides on the existing `config.dark_mode_enabled` gate — do **not** add a new coach setting, backend field, or migration.
- `ThemePalette` interface in `lib/themes.ts` stays unchanged (no stored `dim` field).
- OKLCH lightness lift for Dim surfaces is exactly **+0.06**, rounded to 3 decimals; only surface tokens change, hue/chroma preserved.
- The shared 3-way toggle order is exactly `["light", "dim", "dark"]` (Light → Dim → Dark).
- **Commits:** this repo's `CLAUDE.md` forbids committing unless the user explicitly asks. Treat every `git commit` step below as gated — perform it only on the user's explicit go-ahead; otherwise leave the work staged/unstaged for review.

---

### Task 1: Derive the Dim palette and emit a `.dim` CSS block

**Files:**
- Modify: `frontend-customer/src/lib/themes.ts` (add `deriveDim`; extend `generateThemeCSS`)
- Test: `frontend-customer/src/lib/__tests__/themes.test.ts` (create)

**Interfaces:**
- Consumes: existing `ThemePalette`, `THEME_MAP`, `getThemePalette`, `generateThemeCSS` from `lib/themes.ts`.
- Produces:
  - `export function deriveDim(dark: Record<string, string>): Record<string, string>` — returns a palette with surface tokens lifted +0.06 L, all other tokens identical to `dark`.
  - `generateThemeCSS(themeId?, fontFamily?, extraCss?)` unchanged signature, now emits a `.dim { … }` block after `.dark` (using `theme.cinematic.dark` for `--cinematic-bg`).

- [ ] **Step 1: Write the failing test**

Create `frontend-customer/src/lib/__tests__/themes.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { deriveDim, generateThemeCSS, THEME_MAP } from "@/lib/themes";

describe("deriveDim", () => {
  it("lifts surface lightness by 0.06, preserving chroma and hue", () => {
    // ocean dark: background oklch(0.16 0.015 240), card oklch(0.2 0.015 240)
    const dim = deriveDim(THEME_MAP.ocean.dark);
    expect(dim.background).toBe("oklch(0.22 0.015 240)");
    expect(dim.card).toBe("oklch(0.26 0.015 240)");
    expect(dim.border).toBe("oklch(0.34 0.015 240)");
    expect(dim["brand-surface"]).toBe("oklch(0.28 0.015 240)");
  });

  it("keeps non-surface tokens identical to dark", () => {
    const dark = THEME_MAP.ocean.dark;
    const dim = deriveDim(dark);
    expect(dim.foreground).toBe(dark.foreground);
    expect(dim.primary).toBe(dark.primary);
    expect(dim["primary-foreground"]).toBe(dark["primary-foreground"]);
    expect(dim["chart-1"]).toBe(dark["chart-1"]);
  });
});

describe("generateThemeCSS", () => {
  it("emits a .dim block with lifted surfaces and the dark cinematic", () => {
    const css = generateThemeCSS("ocean");
    expect(css).toContain(".dim {");
    const dimBlock = css.slice(css.indexOf(".dim {"));
    expect(dimBlock).toContain("--background: oklch(0.22 0.015 240)");
    expect(dimBlock).toContain(
      `--cinematic-bg: ${THEME_MAP.ocean.cinematic.dark}`,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/themes.test.ts`
Expected: FAIL — `deriveDim` is not exported / not a function.

- [ ] **Step 3: Add `deriveDim` and the surface-key constants**

In `frontend-customer/src/lib/themes.ts`, immediately **above** the `// ─── Exports ───` section (before `export const THEMES`), add:

```ts
// ─── Dim derivation ───────────────────────────────────────────────────────────
// "Dim" is a soft-dark middle brightness derived from each theme's dark palette:
// surface tokens are lifted toward a ~0.22 background while text, accents, and
// charts stay identical to dark. Only the L channel of surface tokens changes.

const DIM_SURFACE_KEYS = new Set<string>([
  "background",
  "card",
  "popover",
  "secondary",
  "muted",
  "border",
  "input",
  "brand-surface",
]);

const DIM_LIGHTNESS_LIFT = 0.06;

export function deriveDim(
  dark: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(dark)) {
    if (!DIM_SURFACE_KEYS.has(key)) {
      out[key] = value;
      continue;
    }
    const match = value.match(
      /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.-]+)\s*\)$/,
    );
    if (!match) {
      out[key] = value; // defensive: leave unparseable values untouched
      continue;
    }
    const lifted = parseFloat(match[1]) + DIM_LIGHTNESS_LIFT;
    const l = Math.min(1, Math.round(lifted * 1000) / 1000);
    out[key] = `oklch(${l} ${match[2]} ${match[3]})`;
  }
  return out;
}
```

- [ ] **Step 4: Emit the `.dim` block in `generateThemeCSS`**

Still in `frontend-customer/src/lib/themes.ts`, inside `generateThemeCSS`, after the `darkVars` block is built and before `const font = …`, add:

```ts
  const dimVars = Object.entries(deriveDim(theme.dark))
    .map(([key, value]) => `  --${key}: ${value};`)
    .join("\n");
```

Then change the returned template literal so a `.dim` block sits between `.dark` and `${safeExtra}`:

```ts
  return `:root {
${lightVars}
  --cinematic-bg: ${theme.cinematic.light};
${font}
}
.dark {
${darkVars}
  --cinematic-bg: ${theme.cinematic.dark};
${font}
}
.dim {
${dimVars}
  --cinematic-bg: ${theme.cinematic.dark};
${font}
}
${safeExtra}`;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/themes.test.ts`
Expected: PASS (5 assertions across 3 tests).

- [ ] **Step 6: Run the full frontend suite + typecheck (no regressions)**

Run: `make test-frontend`
Expected: PASS (all existing vitest tests + the new file).

Run: `make typecheck`
Expected: PASS (no TS errors).

- [ ] **Step 7: Commit** *(gated — only on explicit user go-ahead; see Global Constraints)*

```bash
git add frontend-customer/src/lib/themes.ts frontend-customer/src/lib/__tests__/themes.test.ts
git commit -m "feat(themes): derive Dim palette and emit .dim CSS block for tenant themes"
```

---

### Task 2: Wire Dim into the running app (Tailwind, next-themes, enforcer, toggles)

**Files:**
- Modify: `frontend-customer/tailwind.config.ts:5`
- Modify: `frontend-customer/src/app/layout.tsx` (ThemeProvider, ~line 158)
- Modify: `frontend-customer/src/components/shared/tenant-theme-enforcer.tsx`
- Modify: `frontend-customer/src/components/shared/app-sidebar.tsx:180`
- Modify: `frontend-customer/src/components/shared/public-header.tsx:113` and `:351`

**Interfaces:**
- Consumes: `.dim` CSS from Task 1; the shared `ThemeToggle` `modes?: string[]` prop (already supports the 3-way cycle in `packages/shared/src/ui/theme-toggle.tsx`).
- Produces: no new exported symbols — this task makes `class="dim"` actually render Dim and lets visitors reach it.

- [ ] **Step 1: Register `.dim` in Tailwind's `dark:` variant**

In `frontend-customer/tailwind.config.ts`, replace:

```ts
  darkMode: "class",
```

with:

```ts
  // The `dark:` variant must fire under the soft-dark `dim` theme too, not just
  // `.dark` — otherwise dark-family utilities render light under Dim.
  darkMode: ["variant", ["&:is(.dark, .dark *)", "&:is(.dim, .dim *)"]],
```

- [ ] **Step 2: Add `dim` to the next-themes theme list**

In `frontend-customer/src/app/layout.tsx`, in the `<ThemeProvider>` props, add a `themes` line right after `defaultTheme="light"`:

```tsx
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            themes={["light", "dim", "dark"]}
            enableSystem={false}
            forcedTheme={
              config?.dark_mode_enabled === false ? "light" : undefined
            }
            disableTransitionOnChange
          >
```

- [ ] **Step 3: Make the enforcer pin `dim` (not just `dark`) back to light**

In `frontend-customer/src/components/shared/tenant-theme-enforcer.tsx`, replace the effect body condition:

```tsx
  useEffect(() => {
    if (
      config?.dark_mode_enabled === false &&
      (resolvedTheme === "dark" || resolvedTheme === "dim")
    ) {
      setTheme("light");
    }
  }, [config?.dark_mode_enabled, resolvedTheme, setTheme]);
```

- [ ] **Step 4: Switch the three toggle call sites to the 3-way cycle**

In `frontend-customer/src/components/shared/app-sidebar.tsx:180`:

```tsx
        {allowDarkMode && (
          <ThemeToggle collapsed={collapsed} modes={["light", "dim", "dark"]} />
        )}
```

In `frontend-customer/src/components/shared/public-header.tsx:113`:

```tsx
      {allowDarkMode && (
        <ThemeToggle
          compact
          className="shrink-0"
          modes={["light", "dim", "dark"]}
        />
      )}
```

In `frontend-customer/src/components/shared/public-header.tsx:351`:

```tsx
        {allowDarkMode && (
          <ThemeToggle
            className="justify-start"
            modes={["light", "dim", "dark"]}
          />
        )}
```

- [ ] **Step 5: Typecheck + existing tests (no regressions)**

Run: `make typecheck`
Expected: PASS.

Run: `make test-frontend`
Expected: PASS.

- [ ] **Step 6: Manual browser verification**

Run: `make dev` (wait for `nextjs-customer` to be ready), then open a seeded tenant site.

Verify:
1. The theme toggle now cycles **Light → Dim → Dark → Light** (Sunset icon shows on the Dim step).
2. In Dim, surfaces read as a gentle soft-dark middle (not muddy, text legible) — spot-check at least Ocean and one warm theme (Ember or Sunset) by changing `config.theme` in admin → Design.
3. A tenant with dark mode **disabled** (`dark_mode_enabled = false`) shows **no** toggle and stays light-only; if you manually set `localStorage.theme = "dim"` and reload, the enforcer pins it back to light.

Expected: all three behaviors hold.

- [ ] **Step 7: Commit** *(gated — only on explicit user go-ahead; see Global Constraints)*

```bash
git add frontend-customer/tailwind.config.ts frontend-customer/src/app/layout.tsx frontend-customer/src/components/shared/tenant-theme-enforcer.tsx frontend-customer/src/components/shared/app-sidebar.tsx frontend-customer/src/components/shared/public-header.tsx
git commit -m "feat(themes): wire Light/Dim/Dark 3-way toggle into tenant site"
```

---

## Self-Review

**Spec coverage:**
- Derive Dim from dark, +0.06 surface lift, preserve others → Task 1, Steps 3–5. ✓
- `.dim` CSS block with dark cinematic → Task 1, Step 4. ✓
- Tailwind `.dim` in `dark:` variant → Task 2, Step 1. ✓
- next-themes `themes` list → Task 2, Step 2. ✓
- Enforcer catches `dim` → Task 2, Step 3. ✓
- 3-way toggle at all render sites (app-sidebar, public-header ×2; edit-sidebar renders none) → Task 2, Step 4. ✓
- Gating rides on `dark_mode_enabled`, no new setting → Global Constraints + Task 2 (call sites already gated). ✓
- Testing (unit + typecheck + browser) → Task 1 Steps 5–6, Task 2 Steps 5–6. ✓
- Out-of-scope items (hand-tuned palettes, dim cinematic, separate coach control, design-page preview) → not implemented, consistent with spec. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows complete code. ✓

**Type consistency:** `deriveDim(dark: Record<string,string>): Record<string,string>` used identically in Task 1 test, implementation, and `generateThemeCSS`. `modes={["light","dim","dark"]}` identical across all three call sites and matches the shared `ThemeToggle` `modes?: string[]` prop. ✓
