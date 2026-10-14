# Premium look — Phase 0: Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One shared visual system (tokens, type scale, motion kit, video player, header and footer) that both Next.js apps wear, with the old themes and the teal accent gone, and every existing page still rendering.

**Architecture:** Token values move into one CSS sheet in `packages/shared` that both apps' `globals.css` import; the shadcn token _names_ stay, so every primitive keeps working. The Tailwind preset grows the Apple-style type scale, column widths, the expo easing and the tile radius. Four motion primitives (Chapter, ScrollScrub, Reveal, SnapGallery) live in `frontend-main/src/components/motion/` on framer-motion; the video player `MediaVideo` lives in `packages/shared/src/ui/` because Phase 4 reuses it in the studio. Marketing renders light always through a forced theme; the superadmin console keeps its toggle.

**Tech Stack:** Next.js 14 App Router, Tailwind 3.4 (both apps), framer-motion 12.42 (already in `frontend-main`), next-themes 0.4, geist 1.7 (already in `frontend-main`, added to `frontend-customer`), vitest (pure-logic tests only, per repo convention).

**Spec:** `docs/superpowers/specs/2026-10-14-premium-marketing-and-studio-design.md` (sections 5.1, 5.2, 5.4 header/footer, 5.6 tokens and font, D4–D9).

## Global Constraints

- No new runtime dependency except `geist` in `frontend-customer` (spec D9, D6).
- Token names unchanged: `--background --foreground --card --card-foreground --popover --popover-foreground --primary --primary-foreground --secondary --secondary-foreground --muted --muted-foreground --accent --accent-foreground --destructive --destructive-foreground --border --input --ring --marketing-accent --marketing-accent-foreground --radius --chart-1..5 --sidebar --sidebar-foreground --sidebar-primary --sidebar-primary-foreground --sidebar-accent --sidebar-accent-foreground --sidebar-border --sidebar-ring` (spec D7).
- Text contrast ≥ 4.5:1 for `foreground`, `muted-foreground` and `marketing-accent` on `background` and on `muted`, in light and dark (spec 5.7).
- Marketing pages render light always; `/admin` in `frontend-main` keeps light/dark; the studio keeps the coach's one light/dark choice (spec D4).
- Geist is the only UI typeface in both apps; tenant public pages keep their per-look fonts (spec D6).
- Loading and feedback conventions hold: `<NavLink>` for internal links, `useNavigate()` for programmatic navigation, `<Spinner>` for spinners, no raw `animate-spin`/`animate-pulse`, `motion-safe:` gating (root `CLAUDE.md`; enforced by `scripts/check-loading-patterns.mjs` in `make lint`).
- Every animation honours `prefers-reduced-motion` and renders the page static (spec 5.7).
- Never commit a file you did not change; peers share the checkout. Commit only the paths each task lists.
- One heavy job on the Docker VM at a time: never run `make e2e-*` while `make test` or a build runs.

## Contracts for later phases

Later plans use these names exactly.

- Tailwind utilities from the preset: `text-display`, `text-display-2`, `text-title`, `text-title-2`, `text-body-lg`, `text-body`, `text-caption` (fluid sizes, tracking and weight included), `max-w-text` (980 px), `max-w-media` (1440 px), `ease-expo`, `rounded-tile` (18 px). The CSS class `.text-eyebrow` stays in `frontend-main/src/styles/globals.css`.
- A dark cinematic chapter is `<section className="dark bg-background text-foreground">`; `dark:` utilities fire inside it.
- Motion kit (`frontend-main/src/components/motion/`): `Chapter`, `ScrollScrub` (+ `ScrubBand`), `Reveal`, `SnapGallery` with the props defined in Task 5. Band math: `bandOpacity(p, band, fade?)` and `scrubTime(p, duration, fps?)` in `frontend-main/src/lib/scrub-bands.ts`.
- `MediaVideo` (`@shared/ui/media-video`, shims `@/components/ui/media-video` in both apps) with the props in Task 6.
- `LocalNav` (`frontend-main/src/components/shared/local-nav.tsx`) with `items: { id: string; label: string }[]` and `cta: { href: string; label: string }`.
- Media manifest (produced by Phase 1, read by Phases 2–4): `frontend-main/public/media/media.json`

  ```json
  {
    "items": {
      "hero-looks": {
        "kind": "clip",
        "src": "/media/clips/hero-looks.mp4",
        "webm": "/media/clips/hero-looks.webm",
        "phoneSrc": "/media/clips/hero-looks-phone.mp4",
        "poster": "/media/posters/hero-looks.avif",
        "width": 1600,
        "height": 1000,
        "bytes": 2870000,
        "durationS": 12
      },
      "still-yoga": {
        "kind": "still",
        "src": "/media/stills/still-yoga.avif",
        "srcSmall": "/media/stills/yoga-800.avif",
        "width": 1280,
        "height": 1600,
        "bytes": 210000,
        "alt": "A yoga teacher adjusting a student's posture in a sunlit studio",
        "license": "pix4less-catalog"
      }
    }
  }
  ```

  `kind` is one of `clip | scrub | loop | still`. `scrub` clips are all-keyframe. Typed accessor `media(key)` in `frontend-main/src/lib/media.ts` (Phase 1).

## Review Focus

1. A superadmin who chose dark earlier opens `/` or `/pricing`: the page must render light; only `/admin/*` honours the stored choice. Pinned by the browser check in Task 8 (no component unit tests in this repo).
2. The first scrub caption must be visible before any scrolling (`from: 0` at progress 0) and the last must stay visible at the end (`to: 1` at progress 1). Pinned by `scrub-bands.test.ts` in Task 5.
3. framer-motion can report progress a hair outside 0–1 at the track edges; `scrubTime` must clamp so `currentTime` is never negative or past the duration. Pinned by `scrub-bands.test.ts` in Task 5.
4. With `prefers-reduced-motion: reduce`, `ScrollScrub` renders no sticky track and `MediaVideo` never requests the video file. Pinned by the DevTools emulation check in Task 8.
5. A tenant's public site must look exactly as before the shared token sheet lands in `frontend-customer` (its theme sheet still overrides `:root`). Pinned by `site-styles.test.ts` (existing) plus the before/after screenshot in Task 8.

---

### Task 1: Shared token sheet with a contrast test

**Files:**

- Create: `packages/shared/src/styles/tokens.css`
- Create: `packages/shared/src/lib/contrast.ts`
- Test: `frontend-main/src/lib/__tests__/tokens-contrast.test.ts`

**Interfaces:**

- Produces: `parseOklch(css: string): { l: number; c: number; h: number } | null`, `contrastRatio(a: string, b: string): number` (both arguments CSS `oklch(...)` strings), `readTokens(css: string): Record<string, string>` returning `{ "--background": "oklch(1 0 0)", ... }` for one selector block.

- [ ] **Step 1: Write the failing test**

```ts
// frontend-main/src/lib/__tests__/tokens-contrast.test.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, readTokens } from "@shared/lib/contrast";

const sheet = readFileSync(
  path.resolve(__dirname, "../../../../packages/shared/src/styles/tokens.css"),
  "utf8",
);
// One selector block's body. (The sheet's header comment mentions `.dark`,
// so a plain string split would land inside the comment.)
const block = (selector: string) =>
  sheet.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
const light = readTokens(block(":root"));
const dark = readTokens(block("\\.dark"));

// Spec 5.7: text pairs read at 4.5:1 on both papers, in both schemes.
const PAIRS: [string, string][] = [
  ["--foreground", "--background"],
  ["--foreground", "--muted"],
  ["--muted-foreground", "--background"],
  ["--muted-foreground", "--muted"],
  ["--marketing-accent", "--background"],
  ["--marketing-accent", "--muted"],
  ["--primary-foreground", "--primary"],
  ["--marketing-accent-foreground", "--marketing-accent"],
];

describe.each([
  ["light", light],
  ["dark", dark],
])("%s tokens", (_name, tokens) => {
  it.each(PAIRS)("%s on %s ≥ 4.5:1", (fg, bg) => {
    expect(tokens[fg]).toBeDefined();
    expect(tokens[bg]).toBeDefined();
    expect(contrastRatio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(4.5);
  });
  it("keeps every shadcn token name", () => {
    for (const name of [
      "--background",
      "--foreground",
      "--card",
      "--card-foreground",
      "--popover",
      "--popover-foreground",
      "--primary",
      "--primary-foreground",
      "--secondary",
      "--secondary-foreground",
      "--muted",
      "--muted-foreground",
      "--accent",
      "--accent-foreground",
      "--destructive",
      "--destructive-foreground",
      "--border",
      "--input",
      "--ring",
      "--marketing-accent",
      "--marketing-accent-foreground",
      "--sidebar",
      "--sidebar-foreground",
      "--sidebar-primary",
      "--sidebar-primary-foreground",
      "--sidebar-accent",
      "--sidebar-accent-foreground",
      "--sidebar-border",
      "--sidebar-ring",
      "--chart-1",
      "--chart-5",
    ])
      expect(tokens[name], name).toBeDefined();
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white and symmetric", () => {
    expect(contrastRatio("oklch(0 0 0)", "oklch(1 0 0)")).toBeCloseTo(21, 0);
    expect(contrastRatio("oklch(1 0 0)", "oklch(0 0 0)")).toBeCloseTo(21, 0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend-main && npx vitest run src/lib/__tests__/tokens-contrast.test.ts`
Expected: FAIL, cannot resolve `@shared/lib/contrast` / ENOENT `tokens.css`.

- [ ] **Step 3: Write the contrast helper**

```ts
// packages/shared/src/lib/contrast.ts
// OKLCH → linear sRGB → WCAG relative luminance. Enough for token checks;
// not a colour library. (ponytail: no gamut mapping, out-of-gamut channels
// are clamped — our tokens are all in gamut.)

export interface Oklch {
  l: number;
  c: number;
  h: number;
}

export function parseOklch(css: string): Oklch | null {
  const m = css.trim().match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
  if (!m) return null;
  return { l: Number(m[1]), c: Number(m[2]), h: Number(m[3]) };
}

function linearSrgb({ l, c, h }: Oklch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return [
    clamp(4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S),
    clamp(-1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S),
    clamp(-0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S),
  ];
}

function luminance(color: string): number {
  const parsed = parseOklch(color);
  if (!parsed) throw new Error(`not an oklch() colour: ${color}`);
  const [r, g, b] = linearSrgb(parsed);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio between two oklch() colours, order-independent. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** `--name: value;` declarations of one selector block, as a map. */
export function readTokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}
```

- [ ] **Step 4: Write the token sheet**

```css
/* packages/shared/src/styles/tokens.css
 * The one visual system both apps wear (spec 5.1). Plain rules on purpose:
 * this file is @import-ed by each app's globals.css before @tailwind base and
 * must not use @layer. A tenant's public site still overrides :root with its
 * own theme sheet in frontend-customer; the coach studio turns that sheet off.
 * Marketing (frontend-main) renders light always; .dark is the studio's dark
 * choice and the landing's cinematic chapters (<section class="dark">).
 */
:root {
  --radius: 0.75rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.2 0.005 80);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.2 0.005 80);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.2 0.005 80);
  --primary: oklch(0.2 0.005 80);
  --primary-foreground: oklch(1 0 0);
  --secondary: oklch(0.97 0.004 80);
  --secondary-foreground: oklch(0.2 0.005 80);
  --muted: oklch(0.97 0.004 80);
  --muted-foreground: oklch(0.5 0.01 80);
  --accent: oklch(0.95 0.005 80);
  --accent-foreground: oklch(0.2 0.005 80);
  --destructive: oklch(0.55 0.22 27);
  --destructive-foreground: oklch(1 0 0);
  --border: oklch(0.9 0.004 80);
  --input: oklch(0.9 0.004 80);
  --ring: oklch(0.2 0.005 80);
  --marketing-accent: oklch(0.52 0.12 65);
  --marketing-accent-foreground: oklch(1 0 0);
  --chart-1: oklch(0.52 0.12 65);
  --chart-2: oklch(0.55 0.1 180);
  --chart-3: oklch(0.45 0.08 250);
  --chart-4: oklch(0.7 0.14 85);
  --chart-5: oklch(0.6 0.16 25);
  --sidebar: oklch(0.97 0.004 80);
  --sidebar-foreground: oklch(0.2 0.005 80);
  --sidebar-primary: oklch(0.2 0.005 80);
  --sidebar-primary-foreground: oklch(1 0 0);
  --sidebar-accent: oklch(0.92 0.005 80);
  --sidebar-accent-foreground: oklch(0.2 0.005 80);
  --sidebar-border: oklch(0.9 0.004 80);
  --sidebar-ring: oklch(0.2 0.005 80);
}

.dark {
  --background: oklch(0.13 0.005 80);
  --foreground: oklch(0.96 0.004 80);
  --card: oklch(0.18 0.005 80);
  --card-foreground: oklch(0.96 0.004 80);
  --popover: oklch(0.18 0.005 80);
  --popover-foreground: oklch(0.96 0.004 80);
  --primary: oklch(0.96 0.004 80);
  --primary-foreground: oklch(0.13 0.005 80);
  --secondary: oklch(0.22 0.005 80);
  --secondary-foreground: oklch(0.96 0.004 80);
  --muted: oklch(0.22 0.005 80);
  --muted-foreground: oklch(0.72 0.006 80);
  --accent: oklch(0.25 0.006 80);
  --accent-foreground: oklch(0.96 0.004 80);
  --destructive: oklch(0.7 0.19 22);
  --destructive-foreground: oklch(0.13 0.005 80);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.96 0.004 80);
  --marketing-accent: oklch(0.78 0.11 75);
  --marketing-accent-foreground: oklch(0.13 0.005 80);
  --chart-1: oklch(0.78 0.11 75);
  --chart-2: oklch(0.7 0.12 180);
  --chart-3: oklch(0.65 0.1 250);
  --chart-4: oklch(0.8 0.14 85);
  --chart-5: oklch(0.7 0.16 25);
  --sidebar: oklch(0.11 0.005 80);
  --sidebar-foreground: oklch(0.96 0.004 80);
  --sidebar-primary: oklch(0.96 0.004 80);
  --sidebar-primary-foreground: oklch(0.13 0.005 80);
  --sidebar-accent: oklch(0.22 0.005 80);
  --sidebar-accent-foreground: oklch(0.96 0.004 80);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.96 0.004 80);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend-main && npx vitest run src/lib/__tests__/tokens-contrast.test.ts`
Expected: PASS, 2 × (8 pairs + 1 names) + 1 = 19 tests. If a pair fails, lower that foreground's `L` by 0.02 and re-run; never raise the threshold.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/styles/tokens.css packages/shared/src/lib/contrast.ts frontend-main/src/lib/__tests__/tokens-contrast.test.ts
git commit -m "feat(design): shared token sheet for the premium look, with a contrast test"
```

---

### Task 2: Type scale, column widths, easing and tile radius in the shared preset

**Files:**

- Modify: `packages/shared/tailwind-preset.ts`
- Test: `frontend-main/src/lib/__tests__/preset.test.ts`

**Interfaces:**

- Produces: utilities `text-display`, `text-display-2`, `text-title`, `text-title-2`, `text-body-lg`, `text-body`, `text-caption`, `max-w-text`, `max-w-media`, `ease-expo`, `rounded-tile`.
- Consumes (precondition, Step 0): `alphaTokens` in the shared preset, so token colours take an opacity modifier. This plan's header and local nav (`bg-background/80`, `border-border/60`), the `MediaVideo` toggle (`bg-background/80`) and the gallery dots (`bg-foreground/25`) rely on it. Without it those classes emit **no CSS at all** (verified 2026-10-14 with the Tailwind CLI against `frontend-main/tailwind.config.ts`: `bg-background/80` → nothing, `bg-black/50` → a rule). The header would then be bare blur with no paper and no hairline, and the dots would be invisible.

- [ ] **Step 0: Precondition — `alphaTokens` has landed**

Run: `grep -n "export function alphaTokens" packages/shared/tailwind-preset.ts && grep -c "alphaTokens(" frontend-main/tailwind.config.ts frontend-customer/tailwind.config.ts`
Expected: the function line, and `1` for each config.

It landed on `main` on 2026-10-14 as `532e6eb3` ("fix(design): token colours take an opacity modifier; text on tints holds 4.5:1"): the helper, both configs' `colors: alphaTokens({…})`, and the text-on-tint contrast companions. If the check fails, your branch does not contain `532e6eb3`: branch from `main` or rebase onto it. Do **not** port the helper alone; it turns on every token tint in both apps, and the companions keep text at 4.5:1 (memory `reference-token-opacity-classes-are-no-ops`). It mixes in oklab, not oklch, on purpose: Chrome paints faint colours mixed in oklch with a pink cast. `tailwind.config.ts` is baked into the dev images, so a dev stack built before the branch has it needs `docker compose build nextjs-main nextjs-customer` (one at a time; VM budget).

- [ ] **Step 1: Write the failing test**

```ts
// frontend-main/src/lib/__tests__/preset.test.ts
import { describe, expect, it } from "vitest";
import preset from "../../../../packages/shared/tailwind-preset";

// Phase 2–4 markup relies on these utility names (plan "Contracts").
describe("shared tailwind preset", () => {
  const ext = preset.theme?.extend as Record<string, Record<string, unknown>>;
  it("defines the type scale", () => {
    for (const k of [
      "display",
      "display-2",
      "title",
      "title-2",
      "body-lg",
      "body",
      "caption",
    ])
      expect(ext.fontSize[k], k).toBeDefined();
  });
  it("defines columns, easing and the tile radius", () => {
    expect(ext.maxWidth.text).toBe("980px");
    expect(ext.maxWidth.media).toBe("1440px");
    expect(ext.transitionTimingFunction.expo).toBe(
      "cubic-bezier(0.22, 1, 0.36, 1)",
    );
    expect(ext.borderRadius.tile).toBe("18px");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend-main && npx vitest run src/lib/__tests__/preset.test.ts`
Expected: FAIL, `ext.fontSize` is undefined.

- [ ] **Step 3: Extend the preset**

Replace the whole `theme.extend` object in `packages/shared/tailwind-preset.ts` with:

```ts
    extend: {
      // Apple-scale type (spec 5.1). Fluid between phone and desktop so one
      // utility serves both; weight and tracking ride along.
      fontSize: {
        display: ["clamp(56px, 4.2vw + 24px, 80px)", { lineHeight: "1.05", letterSpacing: "-0.03em", fontWeight: "600" }],
        "display-2": ["clamp(40px, 3.1vw + 12px, 56px)", { lineHeight: "1.07", letterSpacing: "-0.028em", fontWeight: "600" }],
        title: ["clamp(32px, 1.4vw + 20px, 40px)", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "600" }],
        "title-2": ["clamp(24px, 0.7vw + 18px, 28px)", { lineHeight: "1.14", letterSpacing: "-0.015em", fontWeight: "600" }],
        "body-lg": ["clamp(19px, 0.5vw + 14px, 21px)", { lineHeight: "1.4", letterSpacing: "-0.01em" }],
        body: ["17px", { lineHeight: "1.47", letterSpacing: "-0.01em" }],
        caption: ["14px", { lineHeight: "1.43" }],
      },
      maxWidth: { text: "980px", media: "1440px" },
      transitionTimingFunction: { expo: "cubic-bezier(0.22, 1, 0.36, 1)" },
      borderRadius: { tile: "18px" },
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
        "progress-indeterminate": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(300%)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.8s linear infinite",
        "fade-in": "fade-in 0.2s ease-out both",
        "fade-in-up": "fade-in-up 0.2s ease-out both",
        "progress-indeterminate":
          "progress-indeterminate 1.1s ease-in-out infinite",
      },
    },
```

Both apps' `tailwind.config.ts` already set `presets: [sharedPreset]` and their own `extend.borderRadius`; Tailwind merges extends, so `rounded-tile` and the apps' `rounded-lg` both exist.

Replace only the `theme.extend` object; the exported `alphaTokens` function above `const preset` (Step 0) stays as it is.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend-main && npx vitest run src/lib/__tests__/preset.test.ts`
Expected: PASS (2 tests).

Then prove that the opacity classes this plan's markup uses compile:

```bash
printf '@tailwind utilities;' > "$TMPDIR/tw.css"
echo '<p class="bg-background/80 border-border/60 bg-foreground/25 bg-background">' > "$TMPDIR/tw.html"
cd frontend-main && npx tailwindcss -c tailwind.config.ts -i "$TMPDIR/tw.css" --content "$TMPDIR/tw.html" 2>/dev/null | grep -c "color-mix(in oklab"
```

Expected: `3` (the three modified classes; the bare `bg-background` still emits plain `var(--background)`).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/tailwind-preset.ts frontend-main/src/lib/__tests__/preset.test.ts
git commit -m "feat(design): type scale, columns, expo easing and tile radius in the shared preset"
```

---

### Task 3: `frontend-main` wears the tokens; marketing is light always

**Files:**

- Modify: `frontend-main/src/styles/globals.css` (lines 1–296: the two `@layer base` blocks holding the seven themes; lines 301–305: `.text-display`)
- Modify: `frontend-main/tailwind.config.ts:8-19` (darkMode)
- Modify: `frontend-main/src/app/layout.tsx:49-56` (ThemeProvider props)
- Modify: `frontend-main/src/components/shared/theme-provider.tsx`
- Delete: `frontend-main/src/components/shared/theme-toggle.tsx`
- Modify: `frontend-main/src/components/shared/app-sidebar.tsx:8` (import)
- Modify: `frontend-main/src/components/shared/platform-header.tsx:10,91,158` (remove the toggle)

**Interfaces:**

- Consumes: `packages/shared/src/styles/tokens.css` (Task 1), preset utilities (Task 2).
- Produces: `frontend-main` renders every page light; `.dark` on any element switches tokens beneath it.

- [ ] **Step 1: Replace the token blocks in `globals.css`**

Replace everything from the top of the file through the end of the second `@layer base { ... }` block (the one with `* { @apply border-border; }` and `::selection`), i.e. lines 1–296, with:

```css
@import "../../../packages/shared/src/styles/tokens.css";

@tailwind base;
@tailwind components;
@tailwind utilities;

/* Tokens come from packages/shared/src/styles/tokens.css (spec 5.1): light
 * always on marketing and the coach dashboard; .dark is used by the superadmin
 * console's toggle and by cinematic chapters (<section class="dark">). */
@layer base {
  * {
    @apply border-border;
  }
  html {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }
  body {
    @apply bg-background text-foreground;
  }
  ::selection {
    background: var(--marketing-accent);
    color: var(--marketing-accent-foreground);
  }
}
```

Then delete the `.text-display { ... }` rule (lines 301–305 of the original file; the preset utility of the same name replaces it; `.text-headline` and `.text-eyebrow` stay until Phase 3 sweeps their users). Leave every other rule in the file alone; Phases 2 and 3 delete the ambient classes with their last users.

- [ ] **Step 2: Collapse the dark variant**

In `frontend-main/tailwind.config.ts` replace the `darkMode: [ "variant", [ ... ] ]` block (and its comment) with:

```ts
  darkMode: "class",
```

- [ ] **Step 3: Force light outside the superadmin console**

Replace `frontend-main/src/components/shared/theme-provider.tsx` with:

```tsx
"use client";

import { usePathname } from "next/navigation";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/** Marketing and the coach dashboard render light always (spec D4); only the
 * superadmin console keeps a light/dark choice, so a stored "dark" never leaks
 * onto the landing. */
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  const pathname = usePathname() ?? "";
  const admin = pathname === "/admin" || pathname.startsWith("/admin/");
  return (
    <NextThemesProvider {...props} forcedTheme={admin ? undefined : "light"}>
      {children}
    </NextThemesProvider>
  );
}
```

In `frontend-main/src/app/layout.tsx` change the provider props to:

```tsx
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem={false}
            disableTransitionOnChange
            themes={["light", "dark"]}
          >
```

- [ ] **Step 4: Drop the three-mode toggle wrapper**

Delete `frontend-main/src/components/shared/theme-toggle.tsx`. In `frontend-main/src/components/shared/app-sidebar.tsx` line 8 change the import to:

```ts
import { ThemeToggle } from "@shared/ui/theme-toggle";
```

In `frontend-main/src/components/shared/platform-header.tsx`: delete the import on line 10 (`import { ThemeToggle } from "@/components/shared/theme-toggle";`), delete `<ThemeToggle compact />` (line 91) and `<ThemeToggle className="justify-start" />` (line 158).

- [ ] **Step 5: Typecheck and look**

Run: `make typecheck`
Expected: clean for both apps.

Open `http://localhost/` in the browser pane: white page, ink headline, the "or" of the wordmark brass, no teal anywhere. Open `http://localhost/admin` as the superadmin: the sidebar still has the two-mode toggle and dark works there.

- [ ] **Step 6: Commit**

```bash
git add frontend-main/src/styles/globals.css frontend-main/tailwind.config.ts frontend-main/src/app/layout.tsx frontend-main/src/components/shared/theme-provider.tsx frontend-main/src/components/shared/app-sidebar.tsx frontend-main/src/components/shared/platform-header.tsx
git rm frontend-main/src/components/shared/theme-toggle.tsx
git commit -m "feat(main): wear the shared tokens, render marketing light always, drop the dim/midnight/graphite themes"
```

---

### Task 4: `frontend-customer` wears the tokens and Geist

**Files:**

- Modify: `frontend-customer/package.json` (dependencies)
- Modify: `frontend-customer/src/app/layout.tsx:2,71-80,147,174` (font)
- Modify: `frontend-customer/src/styles/globals.css:1-78` (token blocks)

**Interfaces:**

- Consumes: `packages/shared/src/styles/tokens.css`.
- Produces: the studio and every fallback-font surface use Geist; token values match `frontend-main`. Tenant public pages are unchanged (their theme sheet overrides `:root`).

- [ ] **Step 1: Add geist and rebuild the dev container**

In `frontend-customer/package.json` add to `dependencies`, keeping alphabetical order:

```json
    "geist": "^1.7.2",
```

Run from the repo root (container `node_modules` are baked at image build, so a host install is not enough):

```bash
cd frontend-customer && npm install && cd .. && docker compose build nextjs-customer && docker compose up -d --force-recreate nextjs-customer
```

Expected: `package-lock.json` gains `geist`; the container restarts and `make health-check` prints OK.

- [ ] **Step 2: Load Geist instead of Instrument Sans**

In `frontend-customer/src/app/layout.tsx` replace line 2 (`import { Instrument_Sans } from "next/font/google";`) with:

```ts
import { GeistSans } from "geist/font/sans";
```

Delete the `const instrumentSans = Instrument_Sans({ ... });` block (lines 71–80, including its comment). Replace `instrumentSans.variable` with `GeistSans.variable` on line 147 (`<html lang={locale} className={instrumentSans.variable}>`) and on line 174 (the second `className={instrumentSans.variable}`, in the gated-site branch of the same return).

- [ ] **Step 3: Import the token sheet**

In `frontend-customer/src/styles/globals.css` replace lines 1–78 (the first `@layer base { :root {...} .dark {...} }` block, through its closing `}` on line 78) with:

```css
@import "../../../packages/shared/src/styles/tokens.css";

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  /* The app's own look is the shared token sheet (the one frontend-main
     wears). A tenant's site replaces every token at :root through
     TenantThemeStyle; the coach admin switches that sheet off (ThemeProvider),
     so the shared values are the admin's look for every coach, whatever her
     site wears. Only the app-specific tokens live here. */
  :root {
    --font-sans: var(--font-geist-sans), system-ui, sans-serif;
    --brand-primary: var(--primary);
    --brand-accent: var(--primary);
    --brand-warm: var(--muted-foreground);
    --brand-surface: var(--muted);
    --cinematic-bg: none;
  }
}
```

Leave the rest of the file (the second `@layer base`, utilities, PWA safe areas, motion rules) untouched.

- [ ] **Step 4: Verify the tenant site is untouched and the studio changed**

Run: `make typecheck && cd frontend-customer && npx vitest run src/lib/__tests__/site-styles.test.ts`
Expected: both clean.

Browser pane: open `http://demo-yoga.localhost/` and compare with a screenshot taken before Step 3 (take it first): same fonts, same colours. Then run `make e2e-spec SPEC=00-smoke` (it logs in and opens `/admin`): PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/package.json frontend-customer/package-lock.json frontend-customer/src/app/layout.tsx frontend-customer/src/styles/globals.css
git commit -m "feat(customer): the studio wears the shared tokens and Geist"
```

---

### Task 5: Motion kit (Chapter, ScrollScrub, Reveal, SnapGallery)

**Files:**

- Create: `frontend-main/src/lib/scrub-bands.ts`
- Test: `frontend-main/src/lib/__tests__/scrub-bands.test.ts`
- Create: `frontend-main/src/components/motion/chapter.tsx`
- Create: `frontend-main/src/components/motion/scroll-scrub.tsx`
- Create: `frontend-main/src/components/motion/reveal.tsx`
- Modify: `frontend-main/src/components/landing/scroll-reveal.tsx:16-33,38-50,76-86` (stagger prop)
- Modify: `frontend-main/src/styles/globals.css` (`.stagger-children` rules)
- Create: `frontend-main/src/components/motion/snap-gallery.tsx`

**Interfaces:**

- Produces:
  - `bandOpacity(p: number, band: { from: number; to: number }, fade = 0.08): number`
  - `scrubTime(p: number, durationS: number, fps = 30): number`
  - `<Chapter id eyebrow? title lead? dark? className?>children</Chapter>`
  - `<ScrollScrub src poster width height bands={ScrubBand[]} vh?=3 className?/>` where `ScrubBand = { from: number; to: number; node: ReactNode }`
  - `<Reveal ...ScrollRevealProps stagger?/>` (same props as `ScrollReveal`)
  - `<SnapGallery label items={{ key: string; node: ReactNode }[]} itemClassName?/>`

- [ ] **Step 1: Write the failing band-math test**

```ts
// frontend-main/src/lib/__tests__/scrub-bands.test.ts
import { describe, expect, it } from "vitest";
import { bandOpacity, scrubTime } from "@/lib/scrub-bands";

describe("bandOpacity", () => {
  const band = { from: 0.3, to: 0.6 };
  it("is 0 outside the band", () => {
    expect(bandOpacity(0.1, band)).toBe(0);
    expect(bandOpacity(0.9, band)).toBe(0);
  });
  it("ramps in over `fade`, holds at 1, ramps out", () => {
    expect(bandOpacity(0.34, band)).toBeCloseTo(0.5);
    expect(bandOpacity(0.45, band)).toBe(1);
    expect(bandOpacity(0.56, band)).toBeCloseTo(0.5);
  });
  it("shows the first band before any scroll and the last band at the end", () => {
    expect(bandOpacity(0, { from: 0, to: 0.3 })).toBe(1);
    expect(bandOpacity(1, { from: 0.7, to: 1 })).toBe(1);
  });
});

describe("scrubTime", () => {
  it("maps progress to seconds on a frame grid", () => {
    expect(scrubTime(0.5, 10)).toBe(5);
    expect(scrubTime(0.333, 10, 30)).toBeCloseTo(3.3333, 3);
  });
  it("clamps progress reported outside 0–1", () => {
    expect(scrubTime(-0.02, 10)).toBe(0);
    expect(scrubTime(1.03, 10)).toBe(10);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend-main && npx vitest run src/lib/__tests__/scrub-bands.test.ts`
Expected: FAIL, cannot resolve `@/lib/scrub-bands`.

- [ ] **Step 3: Write the band math**

```ts
// frontend-main/src/lib/scrub-bands.ts
export interface Band {
  /** Scroll progress (0–1) where the caption starts to appear. */
  from: number;
  /** Scroll progress where it has fully gone. */
  to: number;
}

/** Opacity of a caption at progress `p`: ramps in over `fade` after `from`,
 * holds at 1, ramps out over `fade` before `to`. A band that starts at 0 is
 * already visible at rest; one that ends at 1 stays to the end. */
export function bandOpacity(p: number, band: Band, fade = 0.08): number {
  const { from, to } = band;
  if (p < from || p > to) return 0;
  const rampIn = from <= 0 ? 1 : Math.min(1, (p - from) / fade);
  const rampOut = to >= 1 ? 1 : Math.min(1, (to - p) / fade);
  return Math.max(0, Math.min(rampIn, rampOut));
}

/** Playhead for progress `p`, snapped to the frame grid so repeated seeks to
 * the same frame are no-ops. Progress is clamped: framer-motion can report a
 * hair outside 0–1 at the track edges. */
export function scrubTime(p: number, durationS: number, fps = 30): number {
  const clamped = Math.min(1, Math.max(0, p));
  return Math.round(clamped * durationS * fps) / fps;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend-main && npx vitest run src/lib/__tests__/scrub-bands.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Write `Chapter`**

```tsx
// frontend-main/src/components/motion/chapter.tsx
"use client";

import { useRef, type ReactNode } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import { cn } from "@/lib/utils";

export interface ChapterProps {
  /** Anchor id; LocalNav links to it. */
  id: string;
  eyebrow?: string;
  title: string;
  lead?: string;
  /** Cinematic chapter: the dark token set applies beneath this section. */
  dark?: boolean;
  className?: string;
  children: ReactNode;
}

/** One landing chapter (spec 5.2): eyebrow, title and lead hold at the top,
 * then scale to 0.96 and fade as the chapter leaves the viewport. */
export function Chapter({
  id,
  eyebrow,
  title,
  lead,
  dark,
  className,
  children,
}: ChapterProps) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["end end", "end start"],
  });
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.96]);
  const opacity = useTransform(scrollYProgress, [0, 1], [1, 0]);

  return (
    <section
      id={id}
      ref={ref}
      className={cn(
        "scroll-mt-24 py-[72px] md:py-[120px]",
        dark && "dark bg-background text-foreground",
        className,
      )}
    >
      <motion.header
        style={reduced ? undefined : { scale, opacity }}
        className="mx-auto max-w-text px-6 text-center"
      >
        {eyebrow && (
          <p className="text-eyebrow text-muted-foreground">{eyebrow}</p>
        )}
        <h2 className="mt-3 text-display-2 text-foreground text-balance">
          {title}
        </h2>
        {lead && (
          <p className="mx-auto mt-5 max-w-[640px] text-body-lg text-muted-foreground text-balance">
            {lead}
          </p>
        )}
      </motion.header>
      <div className="mt-14 md:mt-20">{children}</div>
    </section>
  );
}
```

- [ ] **Step 6: Write `ScrollScrub`**

```tsx
// frontend-main/src/components/motion/scroll-scrub.tsx
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { bandOpacity, scrubTime, type Band } from "@/lib/scrub-bands";
import { cn } from "@/lib/utils";

export interface ScrubBand extends Band {
  node: ReactNode;
}

export interface ScrollScrubProps {
  /** All-keyframe mp4 (Phase 1 encodes scrub clips with -g 1). */
  src: string;
  poster: string;
  width: number;
  height: number;
  bands: ScrubBand[];
  /** Track height in viewport heights; the stage is sticky inside it. */
  vh?: number;
  className?: string;
}

function Caption({
  band,
  progress,
}: {
  band: ScrubBand;
  progress: MotionValue<number>;
}) {
  const opacity = useTransform(progress, (p) => bandOpacity(p, band));
  return (
    <motion.div
      style={{ opacity }}
      className="pointer-events-none absolute inset-x-0 bottom-[12%] mx-auto max-w-text px-6 text-center"
    >
      {band.node}
    </motion.div>
  );
}

/** A sticky stage inside a tall track: scroll progress drives the video's
 * playhead and the caption bands (spec 5.2). Reduced motion: the poster and
 * the last band, static, no track. */
export function ScrollScrub({
  src,
  poster,
  width,
  height,
  bands,
  vh = 3,
  className,
}: ScrollScrubProps) {
  const track = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const reduced = useReducedMotion();
  const [near, setNear] = useState(false);
  const { scrollYProgress } = useScroll({
    target: track,
    offset: ["start start", "end end"],
  });

  // Load the clip one screen before the track arrives, not on page load.
  useEffect(() => {
    const el = track.current;
    if (!el || reduced) return;
    const io = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && (setNear(true), io.disconnect()),
      { rootMargin: "100% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const v = video.current;
    if (!v || !Number.isFinite(v.duration)) return;
    const t = scrubTime(p, v.duration);
    if (Math.abs(v.currentTime - t) >= 1 / 30) v.currentTime = t;
  });

  if (reduced) {
    const last = bands[bands.length - 1];
    return (
      <figure className={cn("relative mx-auto max-w-media", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- sized AVIF poster, no optimisation wanted */}
        <img
          src={poster}
          alt=""
          width={width}
          height={height}
          className="w-full rounded-tile"
        />
        {last && (
          <div className="mx-auto mt-6 max-w-text px-6 text-center">
            {last.node}
          </div>
        )}
      </figure>
    );
  }

  return (
    <div
      ref={track}
      style={{ height: `${vh * 100}vh` }}
      className={cn("relative", className)}
    >
      <div className="sticky top-0 flex h-screen items-center">
        <div className="relative mx-auto w-full max-w-media px-6">
          <video
            ref={video}
            muted
            playsInline
            preload={near ? "auto" : "none"}
            poster={poster}
            width={width}
            height={height}
            src={near ? src : undefined}
            className="w-full rounded-tile bg-muted"
          />
          {bands.map((band, i) => (
            <Caption key={i} band={band} progress={scrollYProgress} />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Write `Reveal` and the stagger option**

Create `frontend-main/src/components/motion/reveal.tsx`:

```tsx
// The one reveal motion of the site (spec 5.2): the existing ScrollReveal
// under the kit's name, plus `stagger` for grids.
export {
  ScrollReveal as Reveal,
  type ScrollRevealProps,
} from "@/components/landing/scroll-reveal";
```

In `frontend-main/src/components/landing/scroll-reveal.tsx`:

- export the props interface: change `interface ScrollRevealProps {` to `export interface ScrollRevealProps {` and add inside it:

```ts
  /** Children fade up one after another (80 ms apart) once the wrapper is in view. */
  stagger?: boolean;
```

- add `stagger = false,` to the destructured props, and change the wrapper's className to:

```tsx
      className={`animate-on-scroll ${stagger ? "stagger-children" : ""} ${className ?? ""}`}
```

In `frontend-main/src/styles/globals.css` replace the `.stagger-children > * { ... }` rule (line 513 of the original file) and its six `:nth-child` delay rules that follow it with:

```css
/* Staggered children: hidden until the wrapper reveals, then 80 ms apart */
.stagger-children > * {
  opacity: 0;
}
.stagger-children.visible > * {
  animation: reveal 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: calc(var(--stagger-index, 0) * 80ms);
}
.stagger-children.visible > *:nth-child(2) {
  --stagger-index: 1;
}
.stagger-children.visible > *:nth-child(3) {
  --stagger-index: 2;
}
.stagger-children.visible > *:nth-child(4) {
  --stagger-index: 3;
}
.stagger-children.visible > *:nth-child(5) {
  --stagger-index: 4;
}
.stagger-children.visible > *:nth-child(6) {
  --stagger-index: 5;
}
.stagger-children.visible > *:nth-child(n + 7) {
  --stagger-index: 6;
}
```

and add `.stagger-children > *` to the `prefers-reduced-motion: reduce` list at the bottom of the file (the selector list that already contains `.animate-on-scroll`).

- [ ] **Step 8: Write `SnapGallery`**

```tsx
// frontend-main/src/components/motion/snap-gallery.tsx
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SnapGalleryProps {
  /** Accessible name of the carousel. */
  label: string;
  items: { key: string; node: ReactNode }[];
  /** Width of one slide, e.g. "w-[320px] md:w-[420px]". */
  itemClassName?: string;
}

/** Horizontal scroll-snap gallery (spec 5.2): native scrolling, arrow
 * buttons, dots, keyboard through the focusable slides. No JS motion. */
export function SnapGallery({ label, items, itemClassName }: SnapGalleryProps) {
  const scroller = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => {
      const first = el.firstElementChild as HTMLElement | null;
      const step = first
        ? first.offsetWidth + parseFloat(getComputedStyle(el).columnGap || "0")
        : 1;
      setIndex(Math.round(el.scrollLeft / step));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const goTo = (i: number) => {
    const el = scroller.current;
    const child = el?.children[i] as HTMLElement | undefined;
    if (!el || !child) return;
    el.scrollTo({ left: child.offsetLeft - el.offsetLeft, behavior: "smooth" });
  };

  const last = items.length - 1;
  return (
    <section
      aria-roledescription="carousel"
      aria-label={label}
      className="relative"
    >
      <ul
        ref={scroller}
        className="flex snap-x snap-mandatory gap-5 overflow-x-auto px-6 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:px-[max(24px,calc((100vw-1440px)/2))]"
      >
        {items.map((item, i) => (
          <li
            key={item.key}
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${items.length}`}
            className={cn("shrink-0 snap-start", itemClassName)}
          >
            {item.node}
          </li>
        ))}
      </ul>
      <div className="mt-5 flex items-center justify-center gap-4">
        <button
          type="button"
          aria-label="Previous"
          disabled={index <= 0}
          onClick={() => goTo(index - 1)}
          className="inline-flex size-9 items-center justify-center rounded-full border bg-card text-foreground transition-colors hover:bg-accent disabled:opacity-40"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="flex items-center gap-2">
          {items.map((item, i) => (
            <button
              key={item.key}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === index ? "true" : undefined}
              onClick={() => goTo(i)}
              className={cn(
                "size-1.5 rounded-full transition-colors",
                i === index
                  ? "bg-foreground"
                  : "bg-foreground/25 hover:bg-foreground/50",
              )}
            />
          ))}
        </div>
        <button
          type="button"
          aria-label="Next"
          disabled={index >= last}
          onClick={() => goTo(index + 1)}
          className="inline-flex size-9 items-center justify-center rounded-full border bg-card text-foreground transition-colors hover:bg-accent disabled:opacity-40"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 9: Typecheck and lint**

Run: `make typecheck && node scripts/check-loading-patterns.mjs`
Expected: clean. (`SnapGallery` buttons are not async, so no `loading` prop is needed; the `<img>` in `ScrollScrub` is a poster, not a Next image, by design: posters are already sized AVIF.)

- [ ] **Step 10: Commit**

```bash
git add frontend-main/src/lib/scrub-bands.ts frontend-main/src/lib/__tests__/scrub-bands.test.ts frontend-main/src/components/motion frontend-main/src/components/landing/scroll-reveal.tsx frontend-main/src/styles/globals.css
git commit -m "feat(main): motion kit — Chapter, ScrollScrub, Reveal with stagger, SnapGallery"
```

---

### Task 6: `MediaVideo`, the one video player

**Files:**

- Create: `packages/shared/src/ui/media-video.tsx`
- Create: `frontend-main/src/components/ui/media-video.tsx` (shim)
- Create: `frontend-customer/src/components/ui/media-video.tsx` (shim)

**Interfaces:**

- Produces: `<MediaVideo src poster width height phoneSrc? webm? loop?=true showToggle?=true label? className? />`. The poster paints first; the file loads after idle, only in view, never under reduced motion or save-data; a pause button satisfies WCAG 2.2.2 for loops.

- [ ] **Step 1: Write the component**

```tsx
// packages/shared/src/ui/media-video.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "../lib/utils";

export interface MediaVideoProps {
  src: string;
  poster: string;
  width: number;
  height: number;
  /** Smaller encode for phones; the browser picks it via <source media>. */
  phoneSrc?: string;
  /** VP9 twin; listed first so browsers that can take it do. */
  webm?: string;
  loop?: boolean;
  /** Pause/play control for content that moves longer than 5 s (WCAG 2.2.2). */
  showToggle?: boolean;
  /** Set when the clip carries meaning; omit for decoration. */
  label?: string;
  className?: string;
}

type NavWithSaveData = Navigator & { connection?: { saveData?: boolean } };

/** Poster first, file after idle, play only in view (ported from Pix4Less's
 * hero: spec 5.2). The poster is a plain <img> with explicit size so the
 * layout never shifts; posters are already sized AVIF. */
export function MediaVideo({
  src,
  poster,
  width,
  height,
  phoneSrc,
  webm,
  loop = true,
  showToggle = true,
  label,
  className,
}: MediaVideoProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [wanted, setWanted] = useState(false); // user or idle asked for the file
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false); // reduced motion / save-data

  useEffect(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const saveData = Boolean(
      (navigator as NavWithSaveData).connection?.saveData,
    );
    if (reduced || saveData) {
      setBlocked(true);
      return;
    }
    const start = () => setWanted(true);
    if (document.readyState === "complete") {
      if ("requestIdleCallback" in window) {
        const id = window.requestIdleCallback(start, { timeout: 1500 });
        return () => window.cancelIdleCallback(id);
      }
      const t = setTimeout(start, 300);
      return () => clearTimeout(t);
    }
    window.addEventListener("load", start, { once: true });
    return () => window.removeEventListener("load", start);
  }, []);

  useEffect(() => {
    const v = video.current;
    if (!v || !wanted) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.25 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [wanted]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (!wanted) setWanted(true);
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  return (
    <figure
      className={cn("relative overflow-hidden bg-muted", className)}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- sized AVIF poster, no optimisation wanted */}
      <img
        src={poster}
        alt=""
        width={width}
        height={height}
        decoding="async"
        className={cn(
          "absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-expo",
          playing && "opacity-0",
        )}
      />
      {!blocked && (
        <video
          ref={video}
          muted
          playsInline
          loop={loop}
          preload="none"
          width={width}
          height={height}
          aria-label={label}
          aria-hidden={label ? undefined : true}
          onPlaying={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          className="absolute inset-0 h-full w-full object-cover"
        >
          {wanted && phoneSrc && (
            <source
              src={phoneSrc}
              media="(max-width: 767px)"
              type="video/mp4"
            />
          )}
          {wanted && webm && <source src={webm} type="video/webm" />}
          {wanted && <source src={src} type="video/mp4" />}
        </video>
      )}
      {!blocked && showToggle && (
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause video" : "Play video"}
          className="absolute bottom-3 right-3 inline-flex size-8 items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur-sm transition-colors hover:bg-background"
        >
          {playing ? (
            <Pause className="size-3.5" />
          ) : (
            <Play className="size-3.5" />
          )}
        </button>
      )}
    </figure>
  );
}
```

- [ ] **Step 2: Add the shims**

Both files contain exactly:

```ts
export * from "@shared/ui/media-video";
```

- [ ] **Step 3: Typecheck**

Run: `make typecheck`
Expected: clean. If `requestIdleCallback` typings are missing in `frontend-customer`'s `tsconfig` lib set, add `"lib": ["dom", "dom.iterable", "esnext"]` there (that is what `frontend-main` has).

- [ ] **Step 4: Smoke it once in the browser**

Temporarily render `<MediaVideo src="/media/clips/smoke.mp4" poster="/logo.svg" width={16} height={9} />` on `frontend-main/src/app/page.tsx` with any small mp4 copied to `frontend-main/public/media/clips/smoke.mp4` (for example `../pix4less/public/videos/a3f649d1-71e1-41e0-8e0b-06a8249c99c7.mp4`). Open `http://localhost/`: the poster shows at once, the clip starts after load, the pause button pauses it. Then remove the temporary element and the file; `git status` must show neither.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/ui/media-video.tsx frontend-main/src/components/ui/media-video.tsx frontend-customer/src/components/ui/media-video.tsx
git commit -m "feat(shared): MediaVideo — poster first, idle load, in-view play, reduced-motion aware"
```

---

### Task 7: Header, local nav and footer

**Files:**

- Modify: `frontend-main/src/components/shared/platform-header.tsx:50-57,64-83,109-116` (bar, link size, CTA; line numbers are from the file before Task 3 removed the two toggle lines, so re-find them)
- Create: `frontend-main/src/components/shared/local-nav.tsx`
- Modify: `frontend-main/src/components/shared/platform-footer.tsx:37-74`
- Modify: `frontend-main/src/styles/globals.css` (`.nav-link` rules)

**Interfaces:**

- Produces: `<LocalNav title items={{ id, label }[]} cta={{ href, label }} />`; header height 48 px (`h-12`), so `LocalNav` is `sticky top-12`.

- [ ] **Step 1: Restyle the header bar**

In `platform-header.tsx` replace the `<header ...>` opening (line 50) and the inner `<div className={cn(...)}>` that follows it (through its closing `>`) with:

```tsx
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div
        className={cn(
          "mx-auto flex h-12 max-w-media items-center justify-between px-6 transition-colors duration-300",
          scrolled && "border-border",
        )}
      >
```

Replace the signed-out buttons (the `<>` ... `</>` after `) : (` in the desktop block, around lines 109–116, holding `<Link href="/login">` and `<Link href="/signup">`) with:

```tsx
<>
  <Button asChild variant="ghost" size="sm" className="h-8 rounded-full px-3">
    <Link href="/login">{t("signIn")}</Link>
  </Button>
  <Button asChild size="sm" className="h-8 rounded-full px-4">
    <Link href="/signup">{t("getStarted")}</Link>
  </Button>
</>
```

Change the four desktop `NavLink` classes from `text-[13.5px]` to `text-[13px]` (keep the rest). In `globals.css` delete the `.nav-link::after`, `.nav-link:hover::after` and `.nav-link[data-active="true"]::after` rules (the dot is gone; colour change is the hover).

- [ ] **Step 2: Write `LocalNav`**

```tsx
// frontend-main/src/components/shared/local-nav.tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/ui/nav-link";
import { cn } from "@/lib/utils";

export interface LocalNavProps {
  title: string;
  items: { id: string; label: string }[];
  cta: { href: string; label: string };
}

/** Apple-style product nav under the header (spec 5.4): the page's name on
 * the left, chapter anchors and the CTA on the right. The active anchor
 * follows the chapter in view. On phones only the title and the CTA show. */
export function LocalNav({ title, items, cta }: LocalNavProps) {
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    const sections = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (sections.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting);
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [items]);

  return (
    <nav
      aria-label={title}
      className="sticky top-12 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md"
    >
      <div className="mx-auto flex h-11 max-w-media items-center justify-between px-6">
        <span className="text-caption font-semibold text-foreground">
          {title}
        </span>
        <div className="flex items-center gap-6">
          <ul className="hidden items-center gap-6 md:flex">
            {items.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  aria-current={active === item.id ? "location" : undefined}
                  className={cn(
                    "text-[12px] transition-colors",
                    active === item.id
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <Button
            asChild
            size="sm"
            className="h-7 rounded-full px-3 text-[12px]"
          >
            <NavLink href={cta.href}>{cta.label}</NavLink>
          </Button>
        </div>
      </div>
    </nav>
  );
}
```

(The CTA is a `NavLink` per the loading conventions; the anchor links are plain `<a href="#...">` on purpose: same-page anchors are not navigation, so the progress bar must not fire.)

- [ ] **Step 3: Restyle the footer**

In `platform-footer.tsx` replace the `<footer ...>` element (lines 37–74) with:

```tsx
<footer className="mt-32 bg-muted">
  <div className="mx-auto max-w-media px-6 py-14">
    <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
      <div className="max-w-sm">
        <Link href="/" className="inline-flex items-center">
          <Wordmark className="text-base" />
        </Link>
        <p className="mt-3 text-caption text-muted-foreground">
          {t("tagline")}
        </p>
      </div>

      {sections.map((section) => (
        <div key={section.heading}>
          <p className="text-caption font-semibold text-foreground">
            {section.heading}
          </p>
          <ul className="mt-3 space-y-2">
            {section.links.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className="text-caption text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>

    <div className="mt-10 border-t border-border/60 pt-6 text-[12px] text-muted-foreground">
      <p>{t("copyright", { year: new Date().getFullYear() })}</p>
    </div>
  </div>
</footer>
```

- [ ] **Step 4: Typecheck, lint and look**

Run: `make typecheck && node scripts/check-loading-patterns.mjs`
Expected: clean.

Browser pane at 1440 and 375 wide: the header is a 48 px translucent bar that blurs the page beneath it when scrolled; the footer sits on second paper. `LocalNav` has no caller yet (Phase 2 mounts it on the landing), so render it once temporarily on `page.tsx` with `items={[{ id: "features", label: "Features" }]}` to see it sit under the header, then remove it.

- [ ] **Step 5: Commit**

```bash
git add frontend-main/src/components/shared/platform-header.tsx frontend-main/src/components/shared/local-nav.tsx frontend-main/src/components/shared/platform-footer.tsx frontend-main/src/styles/globals.css
git commit -m "feat(main): 48px translucent header, Apple-style local nav, second-paper footer"
```

---

### Task 8: Phase gate

**Files:** none new.

- [ ] **Step 1: Full frontend checks**

Run, one after the other (not in parallel):

```bash
make typecheck
make lint
make test-frontend
```

Expected: all clean. `make lint` includes `scripts/check-loading-patterns.mjs` and the selector self-test.

- [ ] **Step 2: Smoke e2e**

Run: `make e2e-spec SPEC=00-smoke`
Expected: PASS. (If `nextjs-customer` answers 502 during the run, it is the dev server restarting after Task 4's rebuild; wait for `make health-check` and re-run once.)

- [ ] **Step 3: Review-focus browser checks**

In the browser pane:

1. As the superadmin, open `/admin`, switch the sidebar toggle to dark, then open `/` and `/pricing`: both are white. Open `/admin` again: still dark.
2. DevTools → Rendering → emulate `prefers-reduced-motion: reduce`, reload `/`: every section is visible at once, nothing animates, no video request appears in the Network panel (there is no video on the page yet; the check matters once Phase 2 lands and is repeated there).
3. Open `http://demo-yoga.localhost/` and compare with the screenshot from Task 4 Step 4: identical.
4. Screenshots of `/`, `/pricing`, `/login`, `/signup` at 375, 1024 and 1440: light, Geist, brass wordmark, old sections still laid out (Phases 2–3 replace them).

- [ ] **Step 4: Record the phase**

Append one line to the spec's status line (`docs/superpowers/specs/2026-10-14-premium-marketing-and-studio-design.md`, line 3): `· Phase 0 done <date>`. Commit it with the next phase's first commit, not alone.
