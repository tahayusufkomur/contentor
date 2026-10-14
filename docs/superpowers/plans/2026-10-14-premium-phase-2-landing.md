# Premium look — Phase 2: Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `contentor.app/` as eight chapters on real product footage and photography — hero, build, looks, studio, assistant, students, money, start — with new copy, the old section components and their dead CSS gone, and a Cloudflare cache rule for `/media/*`.

**Architecture:** `page.tsx` becomes a server component that mounts `PlatformHeader`, `LocalNav`, eight chapter components and `PlatformFooter`. Each chapter is a server component (`getTranslations` + the Phase 1 `media(key)` accessor) that hands plain props and React nodes to the Phase 0 client kit (`Chapter`, `ScrollScrub`, `Reveal`, `SnapGallery`, `MediaVideo`), so `media.json` never ships to the browser and a missing key fails at server render. Pure data (`src/lib/landing.ts`, `src/lib/plans.ts`) carries every key, tile and look the page uses so vitest can hold the page against `media.json`, the look catalog and `marketing.json`. Copy is rewritten through `messages/en/marketing.json` with the copywriting and page-CRO skills.

**Tech Stack:** Next.js 14.2 App Router (React 18.3), Tailwind 3.4 with the Phase 0 preset, framer-motion 12 (through the Phase 0 kit only), next-intl 4, vitest (pure-logic tests, `src/**/__tests__/**/*.test.ts`), Chrome DevTools MCP + Playwright MCP for the browser checks, the `awesome-connectors` Cloudflare connector for the cache rule.

**Spec:** `docs/superpowers/specs/2026-10-14-premium-marketing-and-studio-design.md` — sections 5.4 (chapters; header, local nav and footer are Phase 0), 5.7 (budgets), the "2 Landing" row of section 6, the Cloudflare media cache rule of 5.3, D3, D5, D11.

**Prerequisites:** Phase 0 (`docs/superpowers/plans/2026-10-14-premium-phase-0-foundations.md`) and Phase 1 (media) are merged on the branch you work on: `frontend-main/public/media/media.json` exists, `frontend-main/src/lib/media.ts` exports `media(key)`, and the Phase 0 kit, preset utilities and `LocalNav` exist. The dev stack is up (`make health-check`).

## Global Constraints

- Marketing renders light always; the only dark is the two cinematic chapters, written as `<Chapter dark>` (spec D4; Phase 0 contract: `<section className="dark bg-background text-foreground">`).
- Token-only colour: `bg-background`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `text-marketing-accent`, `border`. No hex, no `bg-white`/`text-gray-*`, and no token/opacity classes (`text-foreground/60`, `bg-muted/50`) on text or tiles — Chrome drops the hue of faint colours mixed in oklch and the alpha fix may not be on this checkout (memory `reference-token-opacity-classes-are-no-ops`). Brass (`text-marketing-accent`) is for links and small highlights only, never a background (spec D5).
- Marketing tiles are flat on second paper (`rounded-tile bg-muted`), no shadow, no border; buttons are pills (`rounded-full` at the call site) (spec 5.1).
- No new runtime dependency (spec D9). No Apple asset, font or copy (spec 8).
- Loading and feedback conventions: `<NavLink>` for every internal link (never raw `next/link`), `useNavigate()` never `router.push`, `<Spinner>` never raw `animate-spin`/`animate-pulse`, motion CSS-only and `motion-safe:`-gated (`CLAUDE.md`; enforced by `scripts/check-loading-patterns.mjs` in `make lint`). Same-page anchors (`#build`) stay plain `<a>` in `LocalNav`; they are not navigation.
- Every chapter reads top to bottom without motion; `ScrollScrub` and `MediaVideo` degrade to the poster under `prefers-reduced-motion` and `saveData`; captions are real text, never baked into video (spec 5.7).
- Budgets on `http://localhost/` (a production build of `frontend-main`, see Task 14): LCP ≤ 2.5 s, CLS ≤ 0.05, INP ≤ 200 ms, landing JavaScript ≤ 250 KB gzipped, media ≤ 8 MB on a full desktop scroll and ≤ 4 MB on a phone (spec 5.7). Text contrast ≥ 4.5:1 in light and in dark chapters.
- Copy: service first, money second; no invented numbers, no fake testimonials; numbers appear only in the founding-creators tile and the FAQ, and only where today's `marketing.json` / `pricing.json` already state them (spec 5.4 ch. 7, D11). The `marketing.helpBot` namespace stays byte-identical (`components/shared/help-bubble.tsx` reads it).
- `media.json` is read only through `media(key)`; chapters never hard-code a `/media/...` path.
- Never commit a file you did not change; peers share the checkout. Commit only the paths each task lists.
- One heavy job on the Docker VM at a time: never run `make e2e-*` while `make test`, a build or a recording runs. The host-side `next build` of Task 14 is a heavy job too.

## Contracts consumed (from Phases 0 and 1)

Phase 0, used exactly as named there:

- Utilities: `text-display`, `text-display-2`, `text-title`, `text-title-2`, `text-body-lg`, `text-body`, `text-caption`, `max-w-text` (980 px), `max-w-media` (1440 px), `ease-expo`, `rounded-tile` (18 px); `.text-eyebrow` in `globals.css`.
- `<Chapter id eyebrow? title lead? dark? className?>children</Chapter>` (`@/components/motion/chapter`), renders `<section id scroll-mt-24 …>` with an `<h2>` title.
- `<ScrollScrub src poster width height bands={ScrubBand[]} vh?=3 className?/>`, `ScrubBand = { from: number; to: number; node: ReactNode }` (`@/components/motion/scroll-scrub`); loads the clip one screen early; reduced motion renders the poster plus the last band.
- `<Reveal …ScrollRevealProps stagger?/>` (`@/components/motion/reveal`), renders one `<div>`; `stagger` fades its direct children 80 ms apart.
- `<SnapGallery label items={{ key: string; node: ReactNode }[]} itemClassName?/>` (`@/components/motion/snap-gallery`).
- `<MediaVideo src poster width height phoneSrc? webm? loop?=true showToggle?=true label? className?/>` (`@/components/ui/media-video` → `@shared/ui/media-video`). **This plan adds `playOn?: "view" | "hover"` (Task 7).**
- `<LocalNav title items={{ id, label }[]} cta={{ href, label }}/>` (`@/components/shared/local-nav`), `sticky top-12`, 44 px; the header is 48 px, so a chapter needs `scroll-margin-top ≥ 92px` (`scroll-mt-24` = 96 px; `globals.css` also has `section[id] { scroll-margin-top: 6rem }`).
- `buttonVariants` from `@/components/ui/button` (re-exports `@shared/ui/button`) — used on `<NavLink>` for pill CTAs, since `NavLink` is not `forwardRef`'d and `Button asChild` would hand it a ref.

Phase 1, `frontend-main/src/lib/media.ts`:

```ts
export type MediaKind = "clip" | "scrub" | "loop" | "still";
export interface MediaItem {
  kind: MediaKind;
  src: string; // "/media/clips/hero-looks.mp4" | "/media/stills/still-yoga.avif"
  width: number;
  height: number;
  bytes: number;
  poster?: string; // every clip | scrub | loop
  webm?: string; // clips and loops
  phoneSrc?: string; // 720 px encode; hero and the student clip
  durationS?: number;
  srcSmall?: string; // every still: the 800 px AVIF
  alt?: string; // every still
  license?: string;
}
export function media(key: string): MediaItem; // throws `Error("media: unknown key …")` on a missing key
```

If Phase 1 typed `key` as a union of manifest keys, the literal keys below (declared `as const`) satisfy it. If `media()` returns `undefined` on a missing key instead of throwing, add the throw there — this page relies on failing loudly (Review Focus 1).

**Media keys this page consumes (44) — check Phase 1's recording list against this:**

| Kind                                                 | Keys                                                                                                                                                                                                                                                                     | Phase 1 target                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| clip                                                 | `hero-looks` (1600×1000, the four-looks cut, ≤ 12 s, `phoneSrc`, `webm`, poster)                                                                                                                                                                                         | ≤ 2.5 MB; phone ≤ 1 MB                              |
| clip                                                 | `clip-student-phone` (750×1624 phone footage: a student opens a lesson and a live class, ≤ 8 s, `phoneSrc`, poster)                                                                                                                                                      | ≤ 0.6 MB; phone ≤ 0.4 MB                            |
| scrub                                                | `scrub-setup` (interview answering → look gallery → pages composing, all-keyframe, poster), `scrub-assistant` ("Describe it" → outline → review card → Undo, all-keyframe, poster)                                                                                       | ≤ 1.5 MB each (shorten, never raise)                |
| loop                                                 | `loop-courses`, `loop-live`, `loop-messages`, `loop-community`, `loop-media`, `loop-blog`, `loop-logo` (≤ 4 s studio loops, `webm`; same aspect as the matching still)                                                                                                   | ≤ 0.8 MB each; hover-only, not in the scroll budget |
| still (studio, 2x)                                   | `tile-courses`, `tile-live`, `tile-messages`, `tile-community`, `tile-media`, `tile-blog`, `tile-logo`, `tile-student-dashboard`, `tile-live-class` (`alt`, `srcSmall`)                                                                                                  | ≤ 120 KB each                                       |
| still (coach, 4:5, person in frame)                  | `still-yoga`, `still-fitness`, `still-music`, `still-dance`, `still-cooking`, `still-language`, `still-martial-arts`, `still-crafts`, `still-beauty`, `still-family`, `still-outdoors`, `still-wellness` (1280×1600, `srcSmall` 640×800, `alt` from Pix4Less, `license`) | ≤ 160 KB / ≤ 60 KB small                            |
| still (look phone renders, 375×812 at 2x = 750×1624) | `look-journal`, `look-kinetic`, `look-encore`, `look-studiofloor`, `look-tavola`, `look-primer`, `look-dojo`, `look-workshop`, `look-atelier`, `look-sprout`, `look-trail`, `look-nocturne` (`srcSmall`, `alt`)                                                          | ≤ 120 KB / ≤ 50 KB small                            |
| posters                                              | one AVIF per clip/scrub/loop                                                                                                                                                                                                                                             | ≤ 120 KB                                            |

Sum on a desktop full scroll (hero + two scrubs + student clip + posters + studio stills + the first four look cards) must stay ≤ 8 MB; on a phone (phone encodes, scrubs static, two look cards) ≤ 4 MB. Task 2's test computes both from the files on disk.

## Review Focus

1. A key missing from `media.json` (a recording Phase 1 skipped or renamed) must fail loudly in dev and in `make test-frontend`, never render a blank tile. Pinned by `landing-media.test.ts` (Task 2: every key present with the right kind and an existing file) and by `media()` throwing at server render.
2. The hero on a phone over cellular: the poster must paint first and the phone encode (not the desktop file) must be the only video requested; under `saveData` no video at all. Pinned by `landing-media.test.ts` (`hero-looks` carries `phoneSrc`, phone budget ≤ 4 MB) and the throttled phone trace in Task 14.
3. A chapter anchor opened from `LocalNav` must land with its title below the sticky header + local nav (92 px), not hidden under them. Pinned by the anchor check in Task 14 (every chapter's top ≥ 92 px after clicking its nav link) — `Chapter` sets `scroll-mt-24`, the hero section sets it too (Task 4).
4. The FAQ `<details>` must all start closed and open one at a time; a reload must not leave one open. Pinned by `landing-copy.test.ts` (seven FAQ keys, each with `q` and `a`) and the browser check in Task 11 (`details[open]` count is 0 on load, 1 after a click, still 1 after a second click elsewhere — native `name="landing-faq"` accordion).
5. The plans endpoint failing (Django down, 5xx, a renamed plan) must leave the pricing teaser rendering names without prices, never crash the page. Pinned by `plans.test.ts` (`teaserRows(null)` and partial data) in Task 1.

---

### Task 1: Plans module shared by pricing and the landing teaser

**Files:**

- Create: `frontend-main/src/lib/plans.ts`
- Create: `frontend-main/src/lib/plans-server.ts`
- Modify: `frontend-main/src/app/pricing/page.tsx:1-22,59-91,118-139`
- Test: `frontend-main/src/lib/__tests__/plans.test.ts`

**Interfaces:**

- Produces: `PLAN_KEYS: readonly ["free","starter","pro"]`, `type PlanKey`, `interface PlanSummary`, `interface PlansResponse`, `planKeyFromName(name: string): PlanKey | null`, `teaserRows(data: PlansResponse | null): { key: PlanKey; price: string | null }[]` (all from `@/lib/plans`); `fetchPlans(): Promise<PlansResponse | null>` from `@/lib/plans-server` (needs a request scope: reads `cf-ipcountry`).

- [ ] **Step 1: Write the failing test**

```ts
// frontend-main/src/lib/__tests__/plans.test.ts
import { describe, expect, it } from "vitest";
import { planKeyFromName, teaserRows, type PlansResponse } from "@/lib/plans";

const plan = (name: string, amount_cents: number | null, currency = "USD") => ({
  id: 1,
  name,
  is_free: amount_cents === null || amount_cents === 0,
  currency,
  amount_cents,
  max_students: 10,
  max_storage_gb: 1,
  max_streaming_hours: 0,
  max_campaign_emails: 0,
  transaction_fee_pct: "8",
  is_live_enabled: false,
});

describe("teaserRows", () => {
  it("renders names only when the API did not answer (Review Focus 5)", () => {
    expect(teaserRows(null)).toEqual([
      { key: "free", price: null },
      { key: "starter", price: null },
      { key: "pro", price: null },
    ]);
  });
  it("formats live prices in plan order, whatever the API's casing", () => {
    const data: PlansResponse = {
      region: "us",
      currency: "USD",
      plans: [plan("pro", 4990), plan("Free", null), plan("starter", 1990)],
    };
    expect(teaserRows(data)).toEqual([
      { key: "free", price: "$0" },
      { key: "starter", price: "$19.90" },
      { key: "pro", price: "$49.90" },
    ]);
  });
  it("leaves a plan the API renamed without a price instead of throwing", () => {
    const data: PlansResponse = {
      region: "eu",
      currency: "EUR",
      plans: [plan("starter", 1990, "EUR"), plan("business", 9900, "EUR")],
    };
    expect(teaserRows(data)).toEqual([
      { key: "free", price: null },
      { key: "starter", price: "€19.90" },
      { key: "pro", price: null },
    ]);
  });
});

describe("planKeyFromName", () => {
  it("tolerates the seed's casings and rejects strangers", () => {
    expect(planKeyFromName("Free")).toBe("free");
    expect(planKeyFromName("PRO")).toBe("pro");
    expect(planKeyFromName("enterprise")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend-main && npx vitest run src/lib/__tests__/plans.test.ts`
Expected: FAIL, cannot resolve `@/lib/plans`.

- [ ] **Step 3: Write the pure module**

```ts
// frontend-main/src/lib/plans.ts
// Plan keys, the API's row shape and the landing teaser's rows. Pure: the
// fetch lives in plans-server.ts so this file is testable without a request.
import { formatPlanPrice } from "@shared/lib/format-plan-price";

export const PLAN_KEYS = ["free", "starter", "pro"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export interface PlanSummary {
  id: number;
  name: string;
  is_free: boolean;
  currency: string;
  amount_cents: number | null;
  max_students: number;
  max_storage_gb: number;
  max_streaming_hours: number;
  max_campaign_emails: number;
  transaction_fee_pct: string;
  is_live_enabled: boolean;
}

export interface PlansResponse {
  region: string;
  currency: string;
  plans: PlanSummary[];
}

// Maps server-side PlatformPlan.name (lowercased) to a PLAN_KEY. The seed
// command writes "Free", "starter", "pro" — keep both casings tolerated.
export function planKeyFromName(name: string): PlanKey | null {
  const lower = name.toLowerCase();
  if (lower === "free") return "free";
  if (lower === "starter") return "starter";
  if (lower === "pro") return "pro";
  return null;
}

/** The landing's pricing teaser: one row per plan key, in plan order. `price`
 * is null when the API did not answer or did not return that plan, and the
 * teaser then shows the name alone (spec 5.4 ch. 8; never a crash). */
export function teaserRows(
  data: PlansResponse | null,
): { key: PlanKey; price: string | null }[] {
  const byKey = new Map<PlanKey, PlanSummary>();
  for (const p of data?.plans ?? []) {
    const key = planKeyFromName(p.name);
    if (key) byKey.set(key, p);
  }
  return PLAN_KEYS.map((key) => {
    const p = byKey.get(key);
    return {
      key,
      price: p ? formatPlanPrice(p.currency, p.amount_cents) : null,
    };
  });
}
```

```ts
// frontend-main/src/lib/plans-server.ts
import { headers } from "next/headers";
import { BASE_DOMAIN, DJANGO_API_URL } from "@/lib/constants";
import type { PlansResponse } from "@/lib/plans";

/** Live plans from Django, or null when it did not answer. Pricing and the
 * landing teaser share this one fetch. */
export async function fetchPlans(): Promise<PlansResponse | null> {
  const country = headers().get("cf-ipcountry");
  try {
    const res = await fetch(
      `${DJANGO_API_URL}/api/v1/billing/platform/plans/`,
      {
        headers: {
          "X-Tenant-Domain": BASE_DOMAIN,
          // Server-side fetch loses the visitor: forward Cloudflare's country
          // so the API picks EUR vs USD for them.
          ...(country ? { "CF-IPCountry": country } : {}),
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Point the pricing page at the module**

In `frontend-main/src/app/pricing/page.tsx`:

1. Delete the imports `import { headers } from "next/headers";` (line 1) and `import { BASE_DOMAIN, DJANGO_API_URL } from "@/lib/constants";` (line 16). Keep `formatPlanPrice` (still used for `priceDisplay`).
2. Add after the `@/lib/auth` import:

```ts
import {
  PLAN_KEYS,
  planKeyFromName,
  type PlanKey,
  type PlanSummary,
} from "@/lib/plans";
import { fetchPlans } from "@/lib/plans-server";
```

3. Delete the local `const PLAN_KEYS = ...` and `type PlanKey = ...` (lines 20–21; keep `FAQ_KEYS`), the `planKeyFromName` function with its comment (lines 57–66), the `PlanSummary` and `PlansResponse` interfaces (lines 68–87) and the `fetchPlans` function (lines 118–139). Everything else in the file stays.

- [ ] **Step 5: Run the test and typecheck**

Run: `cd frontend-main && npx vitest run src/lib/__tests__/plans.test.ts && cd .. && make typecheck`
Expected: PASS (4 tests); typecheck clean. Open `http://localhost/pricing`: the three prices still render.

- [ ] **Step 6: Commit**

```bash
git add frontend-main/src/lib/plans.ts frontend-main/src/lib/plans-server.ts frontend-main/src/lib/__tests__/plans.test.ts frontend-main/src/app/pricing/page.tsx
git commit -m "refactor(main): plans fetch and teaser rows in one module shared by pricing and the landing"
```

---

### Task 2: Landing data module and the media-key test

**Files:**

- Create: `frontend-main/src/lib/landing.ts`
- Test: `frontend-main/src/lib/__tests__/landing-media.test.ts`

**Interfaces:**

- Consumes: `frontend-main/public/media/media.json` (Phase 1), `SITE_STYLES` from `@shared/sections/styles`.
- Produces (from `@/lib/landing`): `CHAPTER_IDS`, `type ChapterId`, `HERO_CLIP`, `BUILD_SCRUB`, `ASSISTANT_SCRUB`, `STUDENT_CLIP`, `LOOK_CARDS`, `STUDIO_TILES`, `STUDENT_TILES`, `MONEY_TILES`, `FAQ_KEYS`, `LANDING_MEDIA` — exact shapes in Step 3.

- [ ] **Step 1: Write the failing test**

```ts
// frontend-main/src/lib/__tests__/landing-media.test.ts
// Holds the landing against Phase 1's manifest: every key the chapters read
// exists with the right kind and a real file (Review Focus 1), clips carry
// phone encodes (Review Focus 2), and a full scroll stays inside spec 5.7.
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SITE_STYLES } from "@shared/sections/styles";
import {
  ASSISTANT_SCRUB,
  BUILD_SCRUB,
  HERO_CLIP,
  LANDING_MEDIA,
  LOOK_CARDS,
  STUDENT_CLIP,
  STUDENT_TILES,
  STUDIO_TILES,
} from "@/lib/landing";

interface Item {
  kind: string;
  src: string;
  poster?: string;
  phoneSrc?: string;
  srcSmall?: string;
  alt?: string;
}
const PUBLIC = path.resolve(__dirname, "../../../public");
const manifest = JSON.parse(
  readFileSync(path.join(PUBLIC, "media/media.json"), "utf8"),
) as { items: Record<string, Item> };
const item = (key: string): Item => manifest.items[key];
const size = (p: string) =>
  statSync(path.join(PUBLIC, p.replace(/^\//, ""))).size;
const MB = 1024 * 1024;
const CLIPS = [HERO_CLIP, STUDENT_CLIP, BUILD_SCRUB, ASSISTANT_SCRUB];
const STILLS = Object.entries(LANDING_MEDIA)
  .filter(([, kind]) => kind === "still")
  .map(([key]) => key);

describe("landing media keys", () => {
  it.each(Object.entries(LANDING_MEDIA))(
    "%s is a %s with a file",
    (key, kind) => {
      expect(
        item(key),
        `${key} is missing from public/media/media.json — Phase 1's recording list`,
      ).toBeDefined();
      expect(item(key).kind).toBe(kind);
      expect(() => size(item(key).src), item(key).src).not.toThrow();
    },
  );
  it("clips and scrubs carry a poster; the hero and the student clip a phone encode", () => {
    for (const key of CLIPS) expect(item(key).poster, key).toBeTruthy();
    for (const key of [HERO_CLIP, STUDENT_CLIP])
      expect(item(key).phoneSrc, key).toBeTruthy();
  });
  it("every still has alt text and an 800 px twin", () => {
    for (const key of STILLS) {
      expect(item(key).alt, key).toBeTruthy();
      expect(item(key).srcSmall, key).toBeTruthy();
    }
  });
  it("the twelve look cards name enabled looks, once each", () => {
    expect(LOOK_CARDS).toHaveLength(12);
    expect(new Set(LOOK_CARDS.map((c) => c.look)).size).toBe(12);
    for (const c of LOOK_CARDS)
      expect(SITE_STYLES[c.look]?.enabled, c.look).toBe(true);
  });
  it("studio tiles fill three rows of six columns", () => {
    expect(STUDIO_TILES.reduce((a, t) => a + t.span, 0)).toBe(18);
  });
});

describe("landing media budget (spec 5.7)", () => {
  // What a full scroll loads. Loops play on hover only (not counted); look
  // cards are lazy, so count the cards a viewport shows plus one.
  const sum = (paths: string[]) => paths.reduce((a, p) => a + size(p), 0);
  const posters = CLIPS.map((k) => item(k).poster as string);
  const tileStills = [
    ...STUDIO_TILES.map((t) => t.still),
    ...STUDENT_TILES.map((t) => t.still),
  ].map((k) => item(k).src);
  it("desktop: hero + two scrubs + student clip + stills ≤ 8 MB", () => {
    const looks = LOOK_CARDS.slice(0, 4).flatMap((c) => [
      item(c.still).src,
      item(c.render).src,
    ]);
    const total = sum([
      item(HERO_CLIP).src,
      item(BUILD_SCRUB).src,
      item(ASSISTANT_SCRUB).src,
      item(STUDENT_CLIP).src,
      ...posters,
      ...tileStills,
      ...looks,
    ]);
    expect(total / MB, `${(total / MB).toFixed(2)} MB`).toBeLessThanOrEqual(8);
  });
  it("phone: phone encodes, static scrubs, two look cards ≤ 4 MB", () => {
    const small = (k: string) => item(k).srcSmall ?? item(k).src;
    const looks = LOOK_CARDS.slice(0, 2).flatMap((c) => [
      small(c.still),
      small(c.render),
    ]);
    const total = sum([
      item(HERO_CLIP).phoneSrc as string,
      item(STUDENT_CLIP).phoneSrc as string,
      ...posters,
      ...tileStills,
      ...looks,
    ]);
    expect(total / MB, `${(total / MB).toFixed(2)} MB`).toBeLessThanOrEqual(4);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend-main && npx vitest run src/lib/__tests__/landing-media.test.ts`
Expected: FAIL, cannot resolve `@/lib/landing`.

- [ ] **Step 3: Write the data module**

```ts
// frontend-main/src/lib/landing.ts
// What the landing is made of: chapter ids, the twelve look cards, the seven
// studio tiles, the FAQ keys and every media key the chapters read. Pure data
// so landing-media.test.ts and landing-copy.test.ts can hold the page against
// media.json, the look catalog and marketing.json.

export const CHAPTER_IDS = [
  "hero",
  "build",
  "looks",
  "studio",
  "assistant",
  "students",
  "money",
  "start",
] as const;
export type ChapterId = (typeof CHAPTER_IDS)[number];

export const HERO_CLIP = "hero-looks";
export const BUILD_SCRUB = "scrub-setup";
export const ASSISTANT_SCRUB = "scrub-assistant";
export const STUDENT_CLIP = "clip-student-phone";

/** Twelve of the twenty looks, one niche each (spec 5.4 ch. 3). `still` is
 * the 4:5 coach photograph, `render` the look's phone screenshot. */
export const LOOK_CARDS = [
  { look: "journal", still: "still-yoga", render: "look-journal" },
  { look: "kinetic", still: "still-fitness", render: "look-kinetic" },
  { look: "encore", still: "still-music", render: "look-encore" },
  { look: "studiofloor", still: "still-dance", render: "look-studiofloor" },
  { look: "tavola", still: "still-cooking", render: "look-tavola" },
  { look: "primer", still: "still-language", render: "look-primer" },
  { look: "dojo", still: "still-martial-arts", render: "look-dojo" },
  { look: "workshop", still: "still-crafts", render: "look-workshop" },
  { look: "atelier", still: "still-beauty", render: "look-atelier" },
  { look: "sprout", still: "still-family", render: "look-sprout" },
  { look: "trail", still: "still-outdoors", render: "look-trail" },
  { look: "nocturne", still: "still-wellness", render: "look-nocturne" },
] as const;

/** Bento tiles (ch. 4): a 2x still and a short loop that plays on hover or
 * tap. `span` is the tile's width in a six-column grid: 4+2 / 2+2+2 / 3+3. */
export const STUDIO_TILES = [
  { key: "courses", still: "tile-courses", loop: "loop-courses", span: 4 },
  { key: "live", still: "tile-live", loop: "loop-live", span: 2 },
  { key: "messages", still: "tile-messages", loop: "loop-messages", span: 2 },
  {
    key: "community",
    still: "tile-community",
    loop: "loop-community",
    span: 2,
  },
  { key: "media", still: "tile-media", loop: "loop-media", span: 2 },
  { key: "blog", still: "tile-blog", loop: "loop-blog", span: 3 },
  { key: "logo", still: "tile-logo", loop: "loop-logo", span: 3 },
] as const;

/** Chapter 6's two tiles beside the phone footage. */
export const STUDENT_TILES = [
  { key: "dashboard", still: "tile-student-dashboard" },
  { key: "live", still: "tile-live-class" },
] as const;

/** Chapter 7's three flat tiles: text only, no numbers (spec 5.4 ch. 7). */
export const MONEY_TILES = ["stripe", "payouts", "brand"] as const;

export const FAQ_KEYS = [
  "freePlan",
  "technical",
  "customDomain",
  "payments",
  "liveClasses",
  "migration",
  "contract",
] as const;

export type LandingMediaKind = "clip" | "scrub" | "loop" | "still";

/** Every key the page reads, with the kind each must have in media.json. */
export const LANDING_MEDIA: Record<string, LandingMediaKind> = {
  [HERO_CLIP]: "clip",
  [STUDENT_CLIP]: "clip",
  [BUILD_SCRUB]: "scrub",
  [ASSISTANT_SCRUB]: "scrub",
  ...Object.fromEntries(
    STUDIO_TILES.flatMap((t) => [
      [t.still, "still"],
      [t.loop, "loop"],
    ]),
  ),
  ...Object.fromEntries(STUDENT_TILES.map((t) => [t.still, "still"])),
  ...Object.fromEntries(
    LOOK_CARDS.flatMap((c) => [
      [c.still, "still"],
      [c.render, "still"],
    ]),
  ),
};
```

- [ ] **Step 4: Run the test**

Run: `cd frontend-main && npx vitest run src/lib/__tests__/landing-media.test.ts`
Expected: PASS (44 key cases + 4 + 2 budget tests). A failing key case names the recording Phase 1 must add — stop and get it recorded (or renamed in Phase 1's `encode.sh`), do not change the key here to match a file that is not what the chapter shows. A failing budget test is also Phase 1's: shorten the clip or raise the AVIF compression, never the threshold.

- [ ] **Step 5: Commit**

```bash
git add frontend-main/src/lib/landing.ts frontend-main/src/lib/__tests__/landing-media.test.ts
git commit -m "feat(landing): the page's chapters, look cards, tiles and media keys as data, held against media.json"
```

---

### Task 3: Copy — `marketing.json` rewritten with the copywriting and page-CRO skills

**Files:**

- Modify: `frontend-main/messages/en/marketing.json` (whole file except `helpBot`)
- Test: `frontend-main/src/lib/__tests__/landing-copy.test.ts`

**Interfaces:**

- Consumes: `CHAPTER_IDS`, `STUDIO_TILES`, `STUDENT_TILES`, `MONEY_TILES`, `FAQ_KEYS` from `@/lib/landing` (Task 2); `pricing.json` plan names/periods are read by the teaser, not duplicated here.
- Produces: the key structure below; every chapter component (Tasks 4–11) reads exactly these keys.

- [ ] **Step 1: Write the failing copy test**

```ts
// frontend-main/src/lib/__tests__/landing-copy.test.ts
// The copy brief as a test: every key the chapters read exists, fits its
// length cap, carries no invented number, and helpBot is untouched.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHAPTER_IDS,
  FAQ_KEYS,
  MONEY_TILES,
  STUDENT_TILES,
  STUDIO_TILES,
} from "@/lib/landing";

const messages = JSON.parse(
  readFileSync(
    path.resolve(__dirname, "../../../messages/en/marketing.json"),
    "utf8",
  ),
) as Record<string, unknown>;
const get = (p: string) =>
  p
    .split(".")
    .reduce<unknown>(
      (o, k) => (o as Record<string, unknown> | undefined)?.[k],
      messages,
    );

const heads = (ns: string) => ({
  [`${ns}.eyebrow`]: 24,
  [`${ns}.title`]: 44,
  [`${ns}.lead`]: 140,
});
const tile = (p: string, text = 110) => ({
  [`${p}.title`]: 32,
  [`${p}.text`]: text,
});

/** key path → max characters. */
const CAPS: Record<string, number> = {
  "landingNav.cta": 12,
  ...Object.fromEntries(CHAPTER_IDS.map((id) => [`landingNav.${id}`, 10])),
  "hero.title": 40,
  "hero.lead": 120,
  "hero.cta": 20,
  "hero.videoLabel": 90,
  ...heads("build"),
  "build.bands.one": 90,
  "build.bands.two": 90,
  "build.bands.three": 90,
  ...heads("looks"),
  "looks.galleryLabel": 40,
  "looks.renderAlt": 60,
  ...heads("studio"),
  ...Object.assign(
    {},
    ...STUDIO_TILES.map((t) => tile(`studio.tiles.${t.key}`)),
  ),
  ...heads("assistant"),
  "assistant.bands.one": 90,
  "assistant.bands.two": 90,
  "assistant.bands.three": 90,
  ...heads("students"),
  "students.phoneLabel": 90,
  ...Object.assign(
    {},
    ...STUDENT_TILES.map((t) => tile(`students.tiles.${t.key}`)),
  ),
  ...heads("money"),
  ...Object.assign(
    {},
    ...MONEY_TILES.map((k) => tile(`money.tiles.${k}`, 120)),
  ),
  ...heads("start"),
  "start.founding.eyebrow": 24,
  "start.founding.title": 44,
  "start.founding.text": 160,
  ...Object.assign(
    {},
    ...["concierge", "discount", "featured"].map((k) => ({
      [`start.founding.perks.${k}.title`]: 36,
      [`start.founding.perks.${k}.text`]: 140,
    })),
  ),
  "start.founding.cta": 24,
  "start.founding.note": 80,
  "start.pricing.title": 44,
  "start.pricing.text": 140,
  "start.pricing.cta": 24,
  "start.faq.title": 44,
  ...Object.assign(
    {},
    ...FAQ_KEYS.map((k) => ({
      [`start.faq.items.${k}.q`]: 70,
      [`start.faq.items.${k}.a`]: 320,
    })),
  ),
  "start.cta.title": 44,
  "start.cta.text": 140,
  "start.cta.button": 24,
  "start.cta.note": 60,
};

const HELP_BOT_KEYS = [
  "title",
  "bubbleLabel",
  "close",
  "intro",
  "placeholder",
  "send",
  "thinking",
  "error",
  "suggestPrice",
  "suggestPayouts",
  "suggestDomain",
  "rateUp",
  "rateDown",
  "talkToHuman",
  "humanRequestedLine",
  "agentJoined",
  "assistantResumed",
  "humanModeNotice",
];

describe("landing copy", () => {
  it.each(Object.entries(CAPS))("%s is set and ≤ %i chars", (key, cap) => {
    const v = get(key);
    expect(typeof v, key).toBe("string");
    expect((v as string).trim().length, key).toBeGreaterThan(0);
    expect((v as string).length, `${key}: "${v}"`).toBeLessThanOrEqual(cap);
  });
  it("carries no numbers outside the founding tile and the FAQ (spec: no invented numbers)", () => {
    for (const key of Object.keys(CAPS)) {
      if (key.startsWith("start.founding") || key.startsWith("start.faq"))
        continue;
      expect(get(key) as string, key).not.toMatch(/\d/);
    }
  });
  it("renderAlt names the look", () => {
    expect(get("looks.renderAlt")).toContain("{look}");
  });
  it("the replaced section namespaces are gone", () => {
    for (const ns of [
      "socialProof",
      "stats",
      "features",
      "howItWorks",
      "finalCta",
      "foundingCreators",
      "faq",
    ])
      expect(messages[ns], ns).toBeUndefined();
  });
  it("helpBot keeps every key the help bubble reads", () => {
    for (const k of HELP_BOT_KEYS)
      expect(typeof get(`helpBot.${k}`), k).toBe("string");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend-main && npx vitest run src/lib/__tests__/landing-copy.test.ts`
Expected: FAIL on `landingNav.cta` and the other new keys (undefined), and on "replaced namespaces are gone".

- [ ] **Step 3: Load the skills and write the words**

Invoke the Skill tool twice: `marketing-skills:copywriting`, then `marketing-skills:page-cro`. Read the spec's chapter briefs (5.4) and the current `marketing.json` once (the facts you may reuse live there and in `pricing.json`). Then replace everything in `frontend-main/messages/en/marketing.json` **except the `helpBot` object, which you copy byte for byte**, with this structure. Each line's brief and cap:

| Key                                                                                             | Brief                                                                                                                    | Cap                |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| `landingNav.hero` … `landingNav.start` (8)                                                      | one-word chapter labels for the local nav; e.g. Overview, Build, Looks, Studio, Assistant, Students, Money, Start        | 10                 |
| `landingNav.cta`                                                                                | the pill in the local nav; "Start free" or shorter                                                                       | 12                 |
| `hero.title`                                                                                    | one display line; the stage is hers; no product noun (no "platform", "site", "course"); no number                        | 40                 |
| `hero.lead`                                                                                     | one body-lg line: what she gets to do, in her words, service before money                                                | 120                |
| `hero.cta`                                                                                      | the pill; action verb, no "free" fluff if `landingNav.cta` already says it                                               | 20                 |
| `hero.videoLabel`                                                                               | screen-reader description of the footage: a finished coach site in four looks on desktop and phone                       | 90                 |
| `build.eyebrow` / `title` / `lead`                                                              | spec: "Say what you teach. We build the rest." — speed without effort; the title may be that line                        | 24 / 44 / 140      |
| `build.bands.one/two/three`                                                                     | captions over the scrub: she answers a few questions → the looks slide in → the pages compose; present tense, no numbers | 90 each            |
| `looks.eyebrow` / `title` / `lead`                                                              | spec: "A site that looks like you." — identity, not templates                                                            | 24 / 44 / 140      |
| `looks.galleryLabel`                                                                            | accessible name of the carousel, e.g. "Twelve looks"                                                                     | 40                 |
| `looks.renderAlt`                                                                               | alt text for the phone render, must contain `{look}`                                                                     | 60                 |
| `studio.eyebrow` / `title` / `lead`                                                             | spec: "Every tool, one calm place." — the day's work                                                                     | 24 / 44 / 140      |
| `studio.tiles.{courses,live,messages,community,media,blog,logo}.title/text`                     | tile title (noun phrase) and one sentence of what she does there; concrete, present tense                                | 32 / 110           |
| `assistant.eyebrow` / `title` / `lead`                                                          | spec: "An assistant that drafts. You approve." — control stays with her                                                  | 24 / 44 / 140      |
| `assistant.bands.one/two/three`                                                                 | she describes a course → a draft outline appears → she reviews, keeps or undoes                                          | 90 each            |
| `students.eyebrow` / `title` / `lead`                                                           | spec: "Your students, on every screen." — their experience is the product                                                | 24 / 44 / 140      |
| `students.phoneLabel`                                                                           | screen-reader description of the phone footage                                                                           | 90                 |
| `students.tiles.dashboard.title/text`, `students.tiles.live.title/text`                         | the student dashboard; a live class                                                                                      | 32 / 110           |
| `money.eyebrow` / `title` / `lead`                                                              | spec: "Then the money follows." — consequence, not promise                                                               | 24 / 44 / 140      |
| `money.tiles.stripe/payouts/brand.title/text`                                                   | Stripe and memberships; payouts straight to her account; her brand alone on the receipt. No numbers, no percentages      | 32 / 120           |
| `start.eyebrow` / `title` / `lead`                                                              | the close: an invitation, calm                                                                                           | 24 / 44 / 140      |
| `start.founding.eyebrow/title/text`                                                             | the founding-creators offer; keep today's facts (first 20 coaches, set up one on one by the founder)                     | 24 / 44 / 160      |
| `start.founding.perks.{concierge,discount,featured}.title/text`                                 | today's three perks (1-on-1 setup; 50% off for 12 months on Starter or Pro; featured on this page)                       | 36 / 140           |
| `start.founding.cta` / `note`                                                                   | the pill; the scarcity line (limited to 20)                                                                              | 24 / 80            |
| `start.pricing.title/text/cta`                                                                  | teaser head; "the plans endpoint says the price, this says why three"; the link text to `/pricing`                       | 44 / 140 / 24      |
| `start.faq.title`                                                                               | plain                                                                                                                    | 44                 |
| `start.faq.items.{freePlan,technical,customDomain,payments,liveClasses,migration,contract}.q/a` | today's seven questions, tightened; every number must already appear in today's answers or in `pricing.json`             | 70 / 320           |
| `start.cta.title/text/button/note`                                                              | final call; `note` is the no-card / cancel-anytime line                                                                  | 44 / 140 / 24 / 60 |

Rules while writing: service first, money second; no testimonials, quotes or named customers; no digits outside `start.founding.*` and `start.faq.*`; British/American spelling as the current file (American). Prettier will reformat the JSON; write it with two-space indentation and keys in the order above, `helpBot` last.

- [ ] **Step 4: Run the test**

Run: `cd frontend-main && npx vitest run src/lib/__tests__/landing-copy.test.ts`
Expected: PASS (≈ 95 cap cases + 4). A cap failure means the line is too long: cut it, do not raise the cap.

- [ ] **Step 5: Prove `helpBot` is untouched**

Run: `git diff -U0 -- frontend-main/messages/en/marketing.json | grep -c '"helpBot"\|"bubbleLabel"\|"talkToHuman"\|"humanModeNotice"'`
Expected: `0` (no helpBot line changed).

- [ ] **Step 6: Commit**

```bash
git add frontend-main/messages/en/marketing.json frontend-main/src/lib/__tests__/landing-copy.test.ts
git commit -m "feat(landing): chapter copy for the premium landing, with a cap-and-facts test"
```

The old components still read the deleted namespaces, so `http://localhost/` logs missing-message errors until Task 4 replaces them. That is expected for the next task only.

---

### Task 4: Page skeleton and the hero

**Files:**

- Create: `frontend-main/src/components/landing/hero.tsx`
- Modify: `frontend-main/src/app/page.tsx` (whole file)

**Interfaces:**

- Consumes: `PlatformHeader`, `PlatformFooter`, `LocalNav`, `MediaVideo`, `NavLink`, `buttonVariants`, `media()`, `CHAPTER_IDS`, `HERO_CLIP`.
- Produces: `<Hero />` (async server component); `page.tsx` with a `<main>` the later tasks append chapters to, in `CHAPTER_IDS` order.

- [ ] **Step 1: Write the hero**

```tsx
// frontend-main/src/components/landing/hero.tsx
import { getTranslations } from "next-intl/server";
import { MediaVideo } from "@/components/ui/media-video";
import { NavLink } from "@/components/ui/nav-link";
import { buttonVariants } from "@/components/ui/button";
import { HERO_CLIP } from "@/lib/landing";
import { media } from "@/lib/media";
import { cn } from "@/lib/utils";

/** Chapter 1 (spec 5.4): one display line, one body-lg line, the CTA pill,
 * then the four-looks cut full-bleed. Text sits above the footage on paper so
 * it needs no scrim. The text block keeps the native scroll-timeline fade
 * (`.hero-scroll-out`). The poster is an eager <img> inside MediaVideo and is
 * the page's LCP element. */
export async function Hero() {
  const t = await getTranslations("marketing.hero");
  const clip = media(HERO_CLIP);
  return (
    <section id="hero" className="scroll-mt-24 pt-16 md:pt-24">
      <div className="hero-scroll-out mx-auto max-w-text px-6 text-center">
        <h1 className="text-display text-foreground text-balance">
          {t("title")}
        </h1>
        <p className="mx-auto mt-5 max-w-[680px] text-body-lg text-muted-foreground text-balance">
          {t("lead")}
        </p>
        <NavLink
          href="/signup"
          className={cn(
            buttonVariants({ size: "lg" }),
            "mt-8 rounded-full px-7",
          )}
        >
          {t("cta")}
        </NavLink>
      </div>
      <div className="mt-12 md:mt-16 md:px-6">
        <MediaVideo
          src={clip.src}
          webm={clip.webm}
          phoneSrc={clip.phoneSrc}
          // landing-media.test.ts guarantees every clip has a poster.
          poster={clip.poster!}
          width={clip.width}
          height={clip.height}
          label={t("videoLabel")}
          className="mx-auto max-w-media md:rounded-tile"
        />
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Rewrite the page**

Replace `frontend-main/src/app/page.tsx` with:

```tsx
import { getTranslations } from "next-intl/server";
import { Hero } from "@/components/landing/hero";
import { LocalNav } from "@/components/shared/local-nav";
import { PlatformFooter } from "@/components/shared/platform-footer";
import { PlatformHeader } from "@/components/shared/platform-header";
import { getAuthUser } from "@/lib/auth";
import { CHAPTER_IDS } from "@/lib/landing";

/** The landing: eight chapters on real footage (spec 5.4). Chapters are
 * server components; the motion kit beneath them is the client. */
export default async function HomePage() {
  const [user, t] = await Promise.all([
    getAuthUser(),
    getTranslations("marketing.landingNav"),
  ]);
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PlatformHeader user={user} />
      <LocalNav
        title="Contentor"
        items={CHAPTER_IDS.map((id) => ({ id, label: t(id) }))}
        cta={{ href: "/signup", label: t("cta") }}
      />
      <main>
        <Hero />
      </main>
      <PlatformFooter />
    </div>
  );
}
```

Tasks 5–11 each add one import and one element inside `<main>`, in this order: `<BuildChapter />`, `<LooksChapter />`, `<StudioChapter />`, `<AssistantChapter />`, `<StudentsChapter />`, `<MoneyChapter />`, `<StartChapter />`.

- [ ] **Step 3: Typecheck and look**

Run: `make typecheck`
Expected: clean.

Open `http://localhost/` in the browser pane at 1440 wide: header, local nav with eight labels and the pill, the display line, the lead, the pill, then the poster at once and the clip after load (pause button bottom-right). The old sections are gone. At 375 wide the clip runs edge to edge and the local nav shows only "Contentor" and the pill. Network panel on the phone width: the request is the `-phone.mp4` encode.

- [ ] **Step 4: Commit**

```bash
git add frontend-main/src/app/page.tsx frontend-main/src/components/landing/hero.tsx
git commit -m "feat(landing): page skeleton with the local nav and the hero on the four-looks cut"
```

---

### Task 5: Chapter 2 "build" — the setup scrub

**Files:**

- Create: `frontend-main/src/components/landing/static-scrub.tsx`
- Create: `frontend-main/src/components/landing/build-chapter.tsx`
- Modify: `frontend-main/src/app/page.tsx` (one import, one element)

**Interfaces:**

- Consumes: `Chapter`, `ScrollScrub`, `ScrubBand`, `media()`, `BUILD_SCRUB`.
- Produces: `<StaticScrub poster width height bands={ReactNode[]} className?/>` (the phone and no-JS rendering of a scrub: poster then the captions stacked; reused by Task 8); `<BuildChapter />`; `scrubBands(nodes: [ReactNode, ReactNode, ReactNode]): ScrubBand[]` exported from `static-scrub.tsx` so both scrub chapters share the same windows.

- [ ] **Step 1: Write the static variant and the band windows**

```tsx
// frontend-main/src/components/landing/static-scrub.tsx
import type { ReactNode } from "react";
import type { ScrubBand } from "@/components/motion/scroll-scrub";
import { cn } from "@/lib/utils";

/** Three caption windows across a scrub: the first is visible at rest, the
 * last stays to the end (Phase 0's bandOpacity treats from=0 / to=1 so). */
export function scrubBands(
  nodes: [ReactNode, ReactNode, ReactNode],
): ScrubBand[] {
  return [
    { from: 0, to: 0.36, node: nodes[0] },
    { from: 0.3, to: 0.7, node: nodes[1] },
    { from: 0.64, to: 1, node: nodes[2] },
  ];
}

/** A caption as the scrub chapters show it: a paper pill with ink text, so it
 * reads over light UI footage in a light or a dark chapter alike. */
export function ScrubCaption({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-full border bg-background px-5 py-2.5 text-body-lg font-medium text-foreground text-balance">
      {children}
    </span>
  );
}

/** What a phone shows instead of the sticky scrub (spec 5.7: ≤ 4 MB on a
 * phone, so the all-keyframe clip never loads there): the poster, then the
 * captions in reading order. Switched by CSS (`md:hidden` here, `hidden
 * md:block` on ScrollScrub) so there is no hydration mismatch and no shift. */
export function StaticScrub({
  poster,
  width,
  height,
  bands,
  className,
}: {
  poster: string;
  width: number;
  height: number;
  bands: ReactNode[];
  className?: string;
}) {
  return (
    <figure className={cn("mx-auto max-w-media px-6", className)}>
      <img
        src={poster}
        alt=""
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        className="w-full rounded-tile bg-muted"
      />
      <ol className="mx-auto mt-8 max-w-text space-y-4 text-center">
        {bands.map((node, i) => (
          <li key={i}>{node}</li>
        ))}
      </ol>
    </figure>
  );
}
```

- [ ] **Step 2: Write the chapter**

```tsx
// frontend-main/src/components/landing/build-chapter.tsx
import { getTranslations } from "next-intl/server";
import { Chapter } from "@/components/motion/chapter";
import { ScrollScrub } from "@/components/motion/scroll-scrub";
import {
  ScrubCaption,
  StaticScrub,
  scrubBands,
} from "@/components/landing/static-scrub";
import { BUILD_SCRUB } from "@/lib/landing";
import { media } from "@/lib/media";

/** Chapter 2 (spec 5.4): "Say what you teach. We build the rest." The setup
 * interview, the look gallery and the composer, scrubbed by scroll on desktop,
 * static on phones. */
export async function BuildChapter() {
  const t = await getTranslations("marketing.build");
  const clip = media(BUILD_SCRUB);
  const captions = [
    <ScrubCaption key="one">{t("bands.one")}</ScrubCaption>,
    <ScrubCaption key="two">{t("bands.two")}</ScrubCaption>,
    <ScrubCaption key="three">{t("bands.three")}</ScrubCaption>,
  ] as const;
  return (
    <Chapter
      id="build"
      eyebrow={t("eyebrow")}
      title={t("title")}
      lead={t("lead")}
    >
      <ScrollScrub
        src={clip.src}
        poster={clip.poster!}
        width={clip.width}
        height={clip.height}
        bands={scrubBands([captions[0], captions[1], captions[2]])}
        className="hidden md:block"
      />
      <StaticScrub
        poster={clip.poster!}
        width={clip.width}
        height={clip.height}
        bands={[...captions]}
        className="md:hidden"
      />
    </Chapter>
  );
}
```

- [ ] **Step 3: Mount it**

In `frontend-main/src/app/page.tsx` add `import { BuildChapter } from "@/components/landing/build-chapter";` after the `Hero` import and `<BuildChapter />` after `<Hero />`.

- [ ] **Step 4: Typecheck and look**

Run: `make typecheck`
Expected: clean.

Browser pane at 1440: scrolling through the chapter holds the stage sticky while the clip's playhead follows the scroll and the three pills fade through; the first pill is visible before the stage pins, the last stays as it unpins. Network panel: the scrub clip is requested only when the chapter is one screen away, not on page load. At 375: no sticky track, the poster and three pills stacked, no scrub request at all.

- [ ] **Step 5: Commit**

```bash
git add frontend-main/src/components/landing/static-scrub.tsx frontend-main/src/components/landing/build-chapter.tsx frontend-main/src/app/page.tsx
git commit -m "feat(landing): build chapter — the setup interview scrubbed by scroll, static on phones"
```

---

### Task 6: Chapter 3 "looks" — twelve look cards in a snap gallery

**Files:**

- Create: `frontend-main/src/components/landing/look-card.tsx`
- Create: `frontend-main/src/components/landing/looks-chapter.tsx`
- Modify: `frontend-main/src/app/page.tsx` (one import, one element)

**Interfaces:**

- Consumes: `Chapter`, `SnapGallery`, `media()`, `LOOK_CARDS`, `SITE_STYLES` (`@shared/sections/styles`, `SITE_STYLES[id].label`).
- Produces: `<LookCard name still={MediaItem} render={MediaItem} renderAlt />`, `<LooksChapter />`.

- [ ] **Step 1: Write the card**

```tsx
// frontend-main/src/components/landing/look-card.tsx
import type { MediaItem } from "@/lib/media";

export interface LookCardProps {
  /** The look's display name from the catalog, e.g. "Quiet Journal". */
  name: string;
  /** 4:5 coach photograph. */
  still: MediaItem;
  /** The look's phone screenshot (375×812 at 2x). */
  render: MediaItem;
  renderAlt: string;
}

/** One gallery slide (spec 5.4 ch. 3): the coach beside her site on a phone,
 * both cropped to one row height, the look's name as the caption. Images are
 * lazy with an 800 px source for phones; the gallery is well below the fold. */
export function LookCard({ name, still, render, renderAlt }: LookCardProps) {
  const srcSet = (m: MediaItem) =>
    m.srcSmall
      ? `${m.srcSmall} ${m.width / 2}w, ${m.src} ${m.width}w`
      : undefined;
  return (
    <figure className="flex flex-col">
      <div className="flex h-[260px] gap-3 md:h-[440px]">
        <img
          src={still.src}
          srcSet={srcSet(still)}
          sizes="(max-width: 767px) 208px, 352px"
          alt={still.alt ?? ""}
          width={still.width}
          height={still.height}
          loading="lazy"
          decoding="async"
          className="h-full w-auto aspect-[4/5] rounded-tile bg-muted object-cover"
        />
        <img
          src={render.src}
          srcSet={srcSet(render)}
          sizes="(max-width: 767px) 120px, 203px"
          alt={renderAlt}
          width={render.width}
          height={render.height}
          loading="lazy"
          decoding="async"
          className="h-full w-auto aspect-[375/812] rounded-[22px] bg-muted object-cover"
        />
      </div>
      <figcaption className="mt-3 text-caption text-muted-foreground">
        {name}
      </figcaption>
    </figure>
  );
}
```

- [ ] **Step 2: Write the chapter**

```tsx
// frontend-main/src/components/landing/looks-chapter.tsx
import { getTranslations } from "next-intl/server";
import { SITE_STYLES } from "@shared/sections/styles";
import { LookCard } from "@/components/landing/look-card";
import { Chapter } from "@/components/motion/chapter";
import { SnapGallery } from "@/components/motion/snap-gallery";
import { LOOK_CARDS } from "@/lib/landing";
import { media } from "@/lib/media";

/** Chapter 3 (spec 5.4): "A site that looks like you." Twelve of the twenty
 * looks, one niche each, as a native scroll-snap gallery. */
export async function LooksChapter() {
  const t = await getTranslations("marketing.looks");
  return (
    <Chapter
      id="looks"
      eyebrow={t("eyebrow")}
      title={t("title")}
      lead={t("lead")}
    >
      <SnapGallery
        label={t("galleryLabel")}
        items={LOOK_CARDS.map((card) => {
          const name = SITE_STYLES[card.look].label;
          return {
            key: card.look,
            node: (
              <LookCard
                name={name}
                still={media(card.still)}
                render={media(card.render)}
                renderAlt={t("renderAlt", { look: name })}
              />
            ),
          };
        })}
      />
    </Chapter>
  );
}
```

- [ ] **Step 3: Mount it**

In `page.tsx` add `import { LooksChapter } from "@/components/landing/looks-chapter";` and `<LooksChapter />` after `<BuildChapter />`.

- [ ] **Step 4: Typecheck and look**

Run: `make typecheck`
Expected: clean. (`SITE_STYLES[card.look]` is typed `SiteStyle`; if the index type is `Record<string, SiteStyle>` and strict indexing complains, it does not — `noUncheckedIndexedAccess` is off in this tsconfig.)

Browser pane at 1440: two and a half cards visible, arrows and dots below, the names under each pair; ArrowRight/Tab moves through the slides; the Network panel shows only the first four or five cards' images loaded until you scroll the gallery. At 375: one card and a sliver, swipe snaps.

- [ ] **Step 5: Commit**

```bash
git add frontend-main/src/components/landing/look-card.tsx frontend-main/src/components/landing/looks-chapter.tsx frontend-main/src/app/page.tsx
git commit -m "feat(landing): looks chapter — twelve look cards, coach photo beside the phone render"
```

---

### Task 7: Chapter 4 "studio" — bento grid with hover loops (`MediaVideo.playOn`)

**Files:**

- Modify: `packages/shared/src/ui/media-video.tsx` (whole file)
- Create: `frontend-main/src/components/landing/studio-chapter.tsx`
- Modify: `frontend-main/src/app/page.tsx` (one import, one element)

**Interfaces:**

- Consumes: `Chapter`, `Reveal`, `MediaVideo`, `media()`, `STUDIO_TILES`.
- Produces: `MediaVideo` gains `playOn?: "view" | "hover"` (default `"view"`, Phase 0 behaviour unchanged). In `"hover"` mode nothing loads until the pointer enters or the tile receives focus; a touch tap or Enter/Space toggles; the figure is a focusable `role="button"` named by `label` with `aria-pressed`. `<StudioChapter />`.

- [ ] **Step 1: Extend `MediaVideo`**

Replace `packages/shared/src/ui/media-video.tsx` with:

```tsx
// packages/shared/src/ui/media-video.tsx
"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
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
  /** Set when the clip carries meaning; omit for decoration. In "hover" mode it
   * names the focusable tile, so set it. */
  label?: string;
  /** "view" (default): the file loads after idle and plays while in view.
   * "hover": nothing loads until the pointer enters or the tile is focused; a
   * tap or Enter/Space toggles. A reader without a pointer pays for the poster
   * only (landing bento tiles, spec 5.4 ch. 4). */
  playOn?: "view" | "hover";
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
  playOn = "view",
  className,
}: MediaVideoProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [wanted, setWanted] = useState(false); // user, idle or hover asked for the file
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false); // reduced motion / save-data
  const [hovering, setHovering] = useState(false);
  const hover = playOn === "hover";

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
    if (hover) return; // loads on the first hover instead of after idle
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
  }, [hover]);

  useEffect(() => {
    const v = video.current;
    if (!v || !wanted || hover) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.25 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [wanted, hover]);

  // Hover mode: the <source> elements appear once `wanted` flips, so play from
  // an effect (after that commit) rather than from the pointer handler.
  useEffect(() => {
    const v = video.current;
    if (!v || !hover || !wanted) return;
    if (hovering) v.play().catch(() => {});
    else v.pause();
  }, [hover, hovering, wanted]);

  const toggle = () => {
    if (hover) {
      setWanted(true);
      setHovering((h) => !h);
      return;
    }
    const v = video.current;
    if (!v) return;
    if (!wanted) setWanted(true);
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  const enter = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType === "touch") return; // touch toggles on pointerup
    setWanted(true);
    setHovering(true);
  };
  const leave = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType === "touch") return;
    setHovering(false);
  };
  const tap = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType === "touch") toggle();
  };
  const key = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };
  const interactive = hover && !blocked;

  return (
    <figure
      className={cn(
        "relative overflow-hidden bg-muted",
        interactive &&
          "cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
        className,
      )}
      style={{ aspectRatio: `${width} / ${height}` }}
      {...(interactive
        ? {
            tabIndex: 0,
            role: "button",
            "aria-label": label,
            "aria-pressed": playing,
            onPointerEnter: enter,
            onPointerLeave: leave,
            onPointerUp: tap,
            onFocus: () => {
              setWanted(true);
              setHovering(true);
            },
            onBlur: () => setHovering(false),
            onKeyDown: key,
          }
        : {})}
    >
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
          aria-label={hover ? undefined : label}
          aria-hidden={hover || !label ? true : undefined}
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

Everything outside the `playOn` additions is Phase 0's code unchanged (the `bg-background/80` on the toggle is Phase 0's; leave it).

- [ ] **Step 2: Write the chapter**

```tsx
// frontend-main/src/components/landing/studio-chapter.tsx
import { getTranslations } from "next-intl/server";
import { Chapter } from "@/components/motion/chapter";
import { Reveal } from "@/components/motion/reveal";
import { MediaVideo } from "@/components/ui/media-video";
import { STUDIO_TILES } from "@/lib/landing";
import { media } from "@/lib/media";
import { cn } from "@/lib/utils";

// Literal classes so Tailwind emits them.
const SPAN: Record<2 | 3 | 4, string> = {
  2: "md:col-span-2",
  3: "md:col-span-3",
  4: "md:col-span-4",
};

/** Chapter 4 (spec 5.4): "Every tool, one calm place." Seven studio tiles in a
 * six-column bento; each shows its 2x still and plays a short loop on hover,
 * focus or tap. Loops never load otherwise, which keeps them out of the
 * scroll budget. */
export async function StudioChapter() {
  const t = await getTranslations("marketing.studio");
  return (
    <Chapter
      id="studio"
      eyebrow={t("eyebrow")}
      title={t("title")}
      lead={t("lead")}
    >
      <Reveal
        stagger
        className="mx-auto grid max-w-media gap-5 px-6 md:grid-cols-6"
      >
        {STUDIO_TILES.map((tile) => {
          const still = media(tile.still);
          const loop = media(tile.loop);
          return (
            <div
              key={tile.key}
              className={cn("flex flex-col gap-4", SPAN[tile.span])}
            >
              <MediaVideo
                src={loop.src}
                webm={loop.webm}
                poster={still.src}
                width={loop.width}
                height={loop.height}
                playOn="hover"
                showToggle={false}
                label={t(`tiles.${tile.key}.title`)}
                className="rounded-tile"
              />
              <div>
                <h3 className="text-title-2 text-foreground">
                  {t(`tiles.${tile.key}.title`)}
                </h3>
                <p className="mt-1.5 text-body text-muted-foreground">
                  {t(`tiles.${tile.key}.text`)}
                </p>
              </div>
            </div>
          );
        })}
      </Reveal>
    </Chapter>
  );
}
```

- [ ] **Step 3: Mount it**

In `page.tsx` add `import { StudioChapter } from "@/components/landing/studio-chapter";` and `<StudioChapter />` after `<LooksChapter />`.

- [ ] **Step 4: Typecheck, lint pattern, look**

Run: `make typecheck && node scripts/check-loading-patterns.mjs`
Expected: clean.

Browser pane at 1440: three rows (4+2, 2+2+2, 3+3), tiles fade in staggered. Network panel: no `/media/clips/loop-*` request on load or after a full scroll. Hover a tile: its loop loads and plays, the still fades; leave: it pauses. Tab to a tile: a 3 px ring and the loop plays; Enter pauses it. At 375 (touch emulation): a tap plays, a second tap pauses. DevTools → Rendering → `prefers-reduced-motion: reduce`, reload: tiles are plain stills, no hover behaviour, no video element.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/ui/media-video.tsx frontend-main/src/components/landing/studio-chapter.tsx frontend-main/src/app/page.tsx
git commit -m "feat(landing): studio bento with hover loops; MediaVideo gains playOn=\"hover\""
```

---

### Task 8: Chapter 5 "assistant" — dark scrub

**Files:**

- Create: `frontend-main/src/components/landing/assistant-chapter.tsx`
- Modify: `frontend-main/src/app/page.tsx` (one import, one element)

**Interfaces:**

- Consumes: `Chapter dark`, `ScrollScrub`, `StaticScrub`, `ScrubCaption`, `scrubBands` (Task 5), `media()`, `ASSISTANT_SCRUB`.
- Produces: `<AssistantChapter />`.

- [ ] **Step 1: Write the chapter**

```tsx
// frontend-main/src/components/landing/assistant-chapter.tsx
import { getTranslations } from "next-intl/server";
import { Chapter } from "@/components/motion/chapter";
import { ScrollScrub } from "@/components/motion/scroll-scrub";
import {
  ScrubCaption,
  StaticScrub,
  scrubBands,
} from "@/components/landing/static-scrub";
import { ASSISTANT_SCRUB } from "@/lib/landing";
import { media } from "@/lib/media";

/** Chapter 5 (spec 5.4), the first cinematic chapter: "An assistant that
 * drafts. You approve." "Describe it" producing a course outline, the review
 * card, then Undo. Dark tokens apply beneath `Chapter dark`; the caption pill
 * flips with them (ink pill, paper text) and still reads over the footage. */
export async function AssistantChapter() {
  const t = await getTranslations("marketing.assistant");
  const clip = media(ASSISTANT_SCRUB);
  const captions = [
    <ScrubCaption key="one">{t("bands.one")}</ScrubCaption>,
    <ScrubCaption key="two">{t("bands.two")}</ScrubCaption>,
    <ScrubCaption key="three">{t("bands.three")}</ScrubCaption>,
  ] as const;
  return (
    <Chapter
      id="assistant"
      dark
      eyebrow={t("eyebrow")}
      title={t("title")}
      lead={t("lead")}
    >
      <ScrollScrub
        src={clip.src}
        poster={clip.poster!}
        width={clip.width}
        height={clip.height}
        bands={scrubBands([captions[0], captions[1], captions[2]])}
        className="hidden md:block"
      />
      <StaticScrub
        poster={clip.poster!}
        width={clip.width}
        height={clip.height}
        bands={[...captions]}
        className="md:hidden"
      />
    </Chapter>
  );
}
```

- [ ] **Step 2: Mount it**

In `page.tsx` add `import { AssistantChapter } from "@/components/landing/assistant-chapter";` and `<AssistantChapter />` after `<StudioChapter />`.

- [ ] **Step 3: Typecheck and look**

Run: `make typecheck`
Expected: clean.

Browser pane at 1440: the chapter is ink (`oklch(0.13 0.005 80)`), eyebrow and lead in the dark muted-foreground, the title in paper; the scrub behaves as in Task 5; captions are ink pills with paper text over the footage. Check contrast with DevTools → Elements → the title's colour swatch: ≥ 4.5:1 against the section background. At 375: static poster and pills on ink.

- [ ] **Step 4: Commit**

```bash
git add frontend-main/src/components/landing/assistant-chapter.tsx frontend-main/src/app/page.tsx
git commit -m "feat(landing): assistant chapter — dark scrub of Describe it, review and Undo"
```

---

### Task 9: Chapter 6 "students" — phone footage in a device frame beside two tiles

**Files:**

- Create: `frontend-main/src/components/landing/students-chapter.tsx`
- Modify: `frontend-main/src/app/page.tsx` (one import, one element)

**Interfaces:**

- Consumes: `Chapter`, `Reveal`, `MediaVideo`, `media()`, `STUDENT_CLIP`, `STUDENT_TILES`.
- Produces: `<StudentsChapter />`.

- [ ] **Step 1: Write the chapter**

```tsx
// frontend-main/src/components/landing/students-chapter.tsx
import { getTranslations } from "next-intl/server";
import { Chapter } from "@/components/motion/chapter";
import { Reveal } from "@/components/motion/reveal";
import { MediaVideo } from "@/components/ui/media-video";
import { STUDENT_CLIP, STUDENT_TILES } from "@/lib/landing";
import { media } from "@/lib/media";

/** Chapter 6 (spec 5.4): "Your students, on every screen." Real phone
 * footage inside a CSS device frame (an ink slab with rounded corners, no
 * image asset) beside the student dashboard and a live class as stills. */
export async function StudentsChapter() {
  const t = await getTranslations("marketing.students");
  const clip = media(STUDENT_CLIP);
  return (
    <Chapter
      id="students"
      eyebrow={t("eyebrow")}
      title={t("title")}
      lead={t("lead")}
    >
      <div className="mx-auto grid max-w-media items-center gap-10 px-6 md:grid-cols-[320px_1fr] md:gap-16">
        <Reveal direction="up" duration={0.7}>
          <div className="mx-auto w-[270px] rounded-[44px] bg-foreground p-[10px]">
            <MediaVideo
              src={clip.src}
              webm={clip.webm}
              phoneSrc={clip.phoneSrc}
              poster={clip.poster!}
              width={clip.width}
              height={clip.height}
              label={t("phoneLabel")}
              className="rounded-[34px]"
            />
          </div>
        </Reveal>
        <Reveal stagger className="grid gap-5">
          {STUDENT_TILES.map((tile) => {
            const still = media(tile.still);
            return (
              <figure
                key={tile.key}
                className="rounded-tile bg-muted p-5 md:p-6"
              >
                <img
                  src={still.src}
                  alt={still.alt ?? ""}
                  width={still.width}
                  height={still.height}
                  loading="lazy"
                  decoding="async"
                  className="w-full rounded-[12px] bg-background"
                />
                <figcaption className="mt-5">
                  <h3 className="text-title-2 text-foreground">
                    {t(`tiles.${tile.key}.title`)}
                  </h3>
                  <p className="mt-1.5 text-body text-muted-foreground">
                    {t(`tiles.${tile.key}.text`)}
                  </p>
                </figcaption>
              </figure>
            );
          })}
        </Reveal>
      </div>
    </Chapter>
  );
}
```

- [ ] **Step 2: Mount it**

In `page.tsx` add `import { StudentsChapter } from "@/components/landing/students-chapter";` and `<StudentsChapter />` after `<AssistantChapter />`.

- [ ] **Step 3: Typecheck and look**

Run: `make typecheck`
Expected: clean.

Browser pane at 1440: the phone on the left (ink frame, footage playing after load, pause button), two tiles on the right fading in one after the other. At 375: the phone centered above the tiles; the Network panel shows the clip's `-phone.mp4`.

- [ ] **Step 4: Commit**

```bash
git add frontend-main/src/components/landing/students-chapter.tsx frontend-main/src/app/page.tsx
git commit -m "feat(landing): students chapter — phone footage in a device frame beside two tiles"
```

---

### Task 10: Chapter 7 "money" — dark, three flat tiles, no numbers

**Files:**

- Create: `frontend-main/src/components/landing/money-chapter.tsx`
- Modify: `frontend-main/src/app/page.tsx` (one import, one element)

**Interfaces:**

- Consumes: `Chapter dark`, `Reveal`, `MONEY_TILES`.
- Produces: `<MoneyChapter />`.

- [ ] **Step 1: Write the chapter**

```tsx
// frontend-main/src/components/landing/money-chapter.tsx
import { getTranslations } from "next-intl/server";
import { Chapter } from "@/components/motion/chapter";
import { Reveal } from "@/components/motion/reveal";
import { MONEY_TILES } from "@/lib/landing";

/** Chapter 7 (spec 5.4), the second cinematic chapter: "Then the money
 * follows." Three flat tiles on the dark second paper: Stripe and
 * memberships, payouts, her brand alone on the receipt. Text only, short, no
 * invented numbers (landing-copy.test.ts forbids digits here). */
export async function MoneyChapter() {
  const t = await getTranslations("marketing.money");
  return (
    <Chapter
      id="money"
      dark
      eyebrow={t("eyebrow")}
      title={t("title")}
      lead={t("lead")}
    >
      <Reveal
        stagger
        className="mx-auto grid max-w-media gap-5 px-6 md:grid-cols-3"
      >
        {MONEY_TILES.map((key) => (
          <div key={key} className="rounded-tile bg-muted p-8">
            <h3 className="text-title-2 text-foreground">
              {t(`tiles.${key}.title`)}
            </h3>
            <p className="mt-3 text-body text-muted-foreground">
              {t(`tiles.${key}.text`)}
            </p>
          </div>
        ))}
      </Reveal>
    </Chapter>
  );
}
```

- [ ] **Step 2: Mount it**

In `page.tsx` add `import { MoneyChapter } from "@/components/landing/money-chapter";` and `<MoneyChapter />` after `<StudentsChapter />`.

- [ ] **Step 3: Typecheck and look**

Run: `make typecheck`
Expected: clean. Browser pane: an ink chapter, three slightly lighter tiles (`--muted` dark = `oklch(0.22 0.005 80)`), paper titles, muted body text; the chapter is short.

- [ ] **Step 4: Commit**

```bash
git add frontend-main/src/components/landing/money-chapter.tsx frontend-main/src/app/page.tsx
git commit -m "feat(landing): money chapter — dark, three flat tiles, consequence not promise"
```

---

### Task 11: Chapter 8 "start" — founding creators, pricing teaser, FAQ, final CTA

**Files:**

- Modify: `frontend-main/src/components/landing/founding-creators-section.tsx` (whole file)
- Modify: `frontend-main/src/components/landing/faq-section.tsx` (whole file)
- Modify: `frontend-main/src/components/landing/final-cta-section.tsx` (whole file)
- Create: `frontend-main/src/components/landing/start-chapter.tsx`
- Modify: `frontend-main/src/app/page.tsx` (one import, one element; final form shown)

**Interfaces:**

- Consumes: `Chapter`, `NavLink`, `buttonVariants`, `teaserRows` + `fetchPlans` (Task 1), `FAQ_KEYS`, `pricing.plans.{key}.name|period|description` from `pricing.json`.
- Produces: `<FoundingCreatorsSection />`, `<FaqSection />`, `<FinalCtaSection />`, `<StartChapter />` (all async server components).

- [ ] **Step 1: Restyle founding creators as one paper tile**

Replace `frontend-main/src/components/landing/founding-creators-section.tsx` with:

```tsx
import { getTranslations } from "next-intl/server";
import { NavLink } from "@/components/ui/nav-link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PERKS = ["concierge", "discount", "featured"] as const;

/** The founding-creators offer as one tile on second paper (spec 5.4 ch. 8):
 * the three perks as text, no icons; the facts (first 20 coaches, 50% off for
 * 12 months) are today's and live in marketing.json. */
export async function FoundingCreatorsSection() {
  const t = await getTranslations("marketing.start.founding");
  return (
    <section
      aria-labelledby="founding-title"
      className="mx-auto max-w-media px-6"
    >
      <div className="rounded-tile bg-muted p-8 md:p-14">
        <p className="text-eyebrow text-muted-foreground">{t("eyebrow")}</p>
        <h3
          id="founding-title"
          className="mt-3 text-title text-foreground text-balance"
        >
          {t("title")}
        </h3>
        <p className="mt-4 max-w-[640px] text-body-lg text-muted-foreground">
          {t("text")}
        </p>
        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {PERKS.map((key) => (
            <div key={key}>
              <h4 className="text-body font-semibold text-foreground">
                {t(`perks.${key}.title`)}
              </h4>
              <p className="mt-1.5 text-body text-muted-foreground">
                {t(`perks.${key}.text`)}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <NavLink
            href="/signup"
            className={cn(buttonVariants({ size: "lg" }), "rounded-full px-6")}
          >
            {t("cta")}
          </NavLink>
          <p className="text-caption text-muted-foreground">{t("note")}</p>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Restyle the FAQ as a native exclusive accordion**

Replace `frontend-main/src/components/landing/faq-section.tsx` with:

```tsx
import { ChevronDown } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { FAQ_KEYS } from "@/lib/landing";

/** FAQ (spec 5.4 ch. 8): <details> with a shared `name`, so the browser keeps
 * one open at a time and all start closed (Review Focus 4); the chevron turns
 * with `group-open:`; the `.faq-content` grid-rows transition in globals.css
 * stays. */
export async function FaqSection() {
  const t = await getTranslations("marketing.start.faq");
  return (
    <section
      aria-labelledby="faq-title"
      className="mx-auto mt-24 max-w-text px-6"
    >
      <h3 id="faq-title" className="text-title text-foreground">
        {t("title")}
      </h3>
      <div className="mt-8 border-t">
        {FAQ_KEYS.map((key) => (
          <details key={key} name="landing-faq" className="group border-b">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-body font-medium text-foreground [&::-webkit-details-marker]:hidden">
              <span>{t(`items.${key}.q`)}</span>
              <ChevronDown
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:duration-300 group-open:rotate-180"
              />
            </summary>
            <div className="faq-content">
              <div className="pb-6 text-body text-muted-foreground">
                {t(`items.${key}.a`)}
              </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Restyle the final CTA on second paper**

Replace `frontend-main/src/components/landing/final-cta-section.tsx` with:

```tsx
import { getTranslations } from "next-intl/server";
import { NavLink } from "@/components/ui/nav-link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The close (spec 5.4 ch. 8): one tile of second paper, display-2 line, the
 * pill, the no-card note. */
export async function FinalCtaSection() {
  const t = await getTranslations("marketing.start.cta");
  return (
    <section className="mx-auto mt-24 max-w-media px-6">
      <div className="rounded-tile bg-muted px-8 py-16 text-center md:py-24">
        <h3 className="text-display-2 text-foreground text-balance">
          {t("title")}
        </h3>
        <p className="mx-auto mt-4 max-w-[560px] text-body-lg text-muted-foreground">
          {t("text")}
        </p>
        <NavLink
          href="/signup"
          className={cn(
            buttonVariants({ size: "lg" }),
            "mt-8 rounded-full px-7",
          )}
        >
          {t("button")}
        </NavLink>
        <p className="mt-4 text-caption text-muted-foreground">{t("note")}</p>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Write the chapter with the pricing teaser**

```tsx
// frontend-main/src/components/landing/start-chapter.tsx
import { getTranslations } from "next-intl/server";
import { FaqSection } from "@/components/landing/faq-section";
import { FinalCtaSection } from "@/components/landing/final-cta-section";
import { FoundingCreatorsSection } from "@/components/landing/founding-creators-section";
import { Chapter } from "@/components/motion/chapter";
import { NavLink } from "@/components/ui/nav-link";
import { teaserRows } from "@/lib/plans";
import { fetchPlans } from "@/lib/plans-server";

/** Three plan names with live prices from the same fetch pricing uses. When
 * Django does not answer, the names render without a price (Review Focus 5). */
async function PricingTeaser() {
  const [t, tp, plans] = await Promise.all([
    getTranslations("marketing.start.pricing"),
    getTranslations("pricing.plans"),
    fetchPlans(),
  ]);
  const rows = teaserRows(plans);
  return (
    <section
      aria-labelledby="teaser-title"
      className="mx-auto mt-24 max-w-media px-6"
    >
      <h3 id="teaser-title" className="text-title text-foreground">
        {t("title")}
      </h3>
      <p className="mt-3 max-w-[640px] text-body-lg text-muted-foreground">
        {t("text")}
      </p>
      <div className="mt-8 grid gap-5 md:grid-cols-3">
        {rows.map(({ key, price }) => (
          <div key={key} className="rounded-tile bg-muted p-7">
            <p className="text-caption font-semibold text-foreground">
              {tp(`${key}.name`)}
            </p>
            {price && (
              <p className="mt-3 text-title text-foreground">
                {price}
                <span className="ml-1.5 text-caption font-normal text-muted-foreground">
                  {tp(`${key}.period`)}
                </span>
              </p>
            )}
            <p className="mt-3 text-body text-muted-foreground">
              {tp(`${key}.description`)}
            </p>
          </div>
        ))}
      </div>
      <NavLink
        href="/pricing"
        className="mt-6 inline-block text-body text-marketing-accent hover:underline"
      >
        {t("cta")}
      </NavLink>
    </section>
  );
}

/** Chapter 8 (spec 5.4): the close — founding creators, the pricing teaser,
 * the FAQ and the final call, each on second paper. */
export async function StartChapter() {
  const t = await getTranslations("marketing.start");
  return (
    <Chapter
      id="start"
      eyebrow={t("eyebrow")}
      title={t("title")}
      lead={t("lead")}
    >
      <FoundingCreatorsSection />
      <PricingTeaser />
      <FaqSection />
      <FinalCtaSection />
    </Chapter>
  );
}
```

- [ ] **Step 5: Mount it — the final `page.tsx`**

`frontend-main/src/app/page.tsx` now reads, in full:

```tsx
import { getTranslations } from "next-intl/server";
import { AssistantChapter } from "@/components/landing/assistant-chapter";
import { BuildChapter } from "@/components/landing/build-chapter";
import { Hero } from "@/components/landing/hero";
import { LooksChapter } from "@/components/landing/looks-chapter";
import { MoneyChapter } from "@/components/landing/money-chapter";
import { StartChapter } from "@/components/landing/start-chapter";
import { StudentsChapter } from "@/components/landing/students-chapter";
import { StudioChapter } from "@/components/landing/studio-chapter";
import { LocalNav } from "@/components/shared/local-nav";
import { PlatformFooter } from "@/components/shared/platform-footer";
import { PlatformHeader } from "@/components/shared/platform-header";
import { getAuthUser } from "@/lib/auth";
import { CHAPTER_IDS } from "@/lib/landing";

/** The landing: eight chapters on real footage (spec 5.4). Chapters are
 * server components; the motion kit beneath them is the client. */
export default async function HomePage() {
  const [user, t] = await Promise.all([
    getAuthUser(),
    getTranslations("marketing.landingNav"),
  ]);
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PlatformHeader user={user} />
      <LocalNav
        title="Contentor"
        items={CHAPTER_IDS.map((id) => ({ id, label: t(id) }))}
        cta={{ href: "/signup", label: t("cta") }}
      />
      <main>
        <Hero />
        <BuildChapter />
        <LooksChapter />
        <StudioChapter />
        <AssistantChapter />
        <StudentsChapter />
        <MoneyChapter />
        <StartChapter />
      </main>
      <PlatformFooter />
    </div>
  );
}
```

- [ ] **Step 6: Typecheck, lint pattern and the FAQ check (Review Focus 4 and 5)**

Run: `make typecheck && node scripts/check-loading-patterns.mjs`
Expected: clean.

Browser pane `http://localhost/#start`: the founding tile, three plan tiles with live prices ("$0 forever", "$19.90 /month", "$49.90 /month" from the dev seed), the FAQ, the final tile. In the console:

```js
document.querySelectorAll("details[open]").length; // 0 on load
document.querySelectorAll("details")[0].querySelector("summary").click();
document.querySelectorAll("details[open]").length; // 1
document.querySelectorAll("details")[3].querySelector("summary").click();
document.querySelectorAll("details[open]").length; // still 1 (exclusive accordion); the chevron of the open one points up
```

Then stop Django (`docker compose stop django`), reload `/`: the page renders, the three teaser tiles show names and descriptions and no price line, nothing crashes; `docker compose start django` and `make health-check` before moving on.

- [ ] **Step 7: Commit**

```bash
git add frontend-main/src/components/landing/founding-creators-section.tsx frontend-main/src/components/landing/faq-section.tsx frontend-main/src/components/landing/final-cta-section.tsx frontend-main/src/components/landing/start-chapter.tsx frontend-main/src/app/page.tsx
git commit -m "feat(landing): start chapter — founding tile, pricing teaser from the plans endpoint, native FAQ accordion, final CTA"
```

---

### Task 12: Delete the replaced components, dead CSS and dead anchors

**Files:**

- Delete: `frontend-main/src/components/landing/hero-section.tsx`, `product-mockup.tsx`, `social-proof-bar.tsx`, `stats-section.tsx`, `how-it-works-section.tsx`, `features-section.tsx`, `counter.tsx`
- Modify: `scripts/check-loading-patterns.mjs:9-14,53-61` (allowlist entry and the `animate-pulse-soft` comment)
- Modify: `frontend-main/src/styles/globals.css` (named rules below)
- Modify: `frontend-main/src/components/shared/platform-header.tsx:63,137`, `frontend-main/src/components/shared/platform-footer.tsx:15` (`/#features` → `/#studio`)

(`scroll-reveal.tsx` stays: the kit's `Reveal` re-exports it. `parallax.tsx` stays until Phase 3 removes it with pricing.)

- [ ] **Step 1: Prove nothing imports the replaced components, then remove them**

Run:

```bash
grep -rn "landing/hero-section\|landing/product-mockup\|landing/social-proof-bar\|landing/stats-section\|landing/how-it-works-section\|landing/features-section\|landing/counter" frontend-main/src packages/shared/src e2e/specs; echo "exit $?"
```

Expected: no lines, `exit 1`. Then:

```bash
git rm frontend-main/src/components/landing/hero-section.tsx frontend-main/src/components/landing/product-mockup.tsx frontend-main/src/components/landing/social-proof-bar.tsx frontend-main/src/components/landing/stats-section.tsx frontend-main/src/components/landing/how-it-works-section.tsx frontend-main/src/components/landing/features-section.tsx frontend-main/src/components/landing/counter.tsx
```

In `scripts/check-loading-patterns.mjs` delete the allowlist entry for `frontend-main/src/components/landing/features-section.tsx` together with its three comment lines ("Decorative "LIVE" dot inside a static marketing-page illustration …"), and replace the four comment lines above `const PATTERN` (the ones about `animate-pulse-soft`) with:

```js
// The `(?!-)` guard keeps suffixed custom utilities (e.g. a hypothetical
// `animate-pulse-soft`) from matching Tailwind's built-in `animate-pulse`.
```

- [ ] **Step 2: Delete the CSS rules that just lost their last user**

For each rule, run the grep first; delete only on an empty result (the grep excludes `globals.css` itself):

```bash
for c in bg-dot-pattern warm-gradient animate-float animate-pulse-soft animate-marquee text-gradient editorial-highlight ring-hairline btn-press data-reveal-h; do
  printf '%s: ' "$c"; grep -rn --include='*.tsx' --include='*.ts' --include='*.css' -- "$c" frontend-main/src packages/shared/src | grep -v 'frontend-main/src/styles/globals.css' | wc -l
done
grep -rn --include='*.tsx' --include='*.ts' -- '["[:space:]]glow["[:space:]]' frontend-main/src packages/shared/src | wc -l
```

Expected: every count `0` (the `.glow` class has no user; `shadow-glow-blue` is a Tailwind utility, not this class). Then in `frontend-main/src/styles/globals.css` delete these rules whole:

- `.text-gradient { … }`
- `.ring-hairline { … }`
- `.glow { … }`
- `.bg-dot-pattern { … }`
- `.warm-gradient { … }`
- `.editorial-highlight { … }`
- `@keyframes float { … }`, `@keyframes pulse-soft { … }`, `@keyframes scale-in { … }`, `@keyframes marquee { … }`
- `.animate-float { … }`, `.animate-pulse-soft { … }`, `.animate-marquee { … }`
- `.btn-press:active { … }`
- `[data-reveal-h] { … }` and `[data-reveal-h].visible { … }`

Keep (still used): `.aurora`, `.aurora-soft`, `.grid-fade`, `.animate-aurora`, `.glass*`, `.brand-gradient`/`.text-luminous`, `.text-headline`, `.text-eyebrow`, `.reveal-fade-up`, `.hero-scroll-out` + `@keyframes hero-fade`, `.faq-content` rules, `.animate-on-scroll*`, `.stagger-children*`, `.nav-link`, `@keyframes reveal*`, the smooth-scroll and `section[id]` rules. Phase 3 deletes the ambient ones with pricing, signup, login and the dashboard.

Then replace the `prefers-reduced-motion: reduce` block's selector list at the bottom of the file with:

```css
@media (prefers-reduced-motion: reduce) {
  .animate-on-scroll,
  .hero-scroll-out,
  .stagger-children > *,
  .faq-content {
    animation: none !important;
    transition: none !important;
    opacity: 1 !important;
    transform: none !important;
    filter: none !important;
  }
}
```

(`.animate-float`, `.animate-pulse-soft` and `[data-reveal-h]` leave the list with their rules; `.faq-content` joins it so the accordion opens without its grid-rows transition under reduced motion; `.stagger-children > *` is Phase 0's addition — keep it.)

- [ ] **Step 3: Point the dead `#features` anchors at the studio chapter**

In `frontend-main/src/components/shared/platform-header.tsx` lines 63 and 137, and in `frontend-main/src/components/shared/platform-footer.tsx` line 15, change `href="/#features"` / `href: "/#features"` to `/#studio`. (The label stays `nav.features` = "Features"; the chapter it reaches is the tool grid.)

- [ ] **Step 4: Prove no importer or class user remains, then typecheck and lint**

```bash
grep -rn "#features" frontend-main/src | wc -l                      # 0
grep -rn "animate-pulse-soft\|bg-dot-pattern\|warm-gradient\|animate-float\|animate-marquee" frontend-main/src packages/shared/src | wc -l   # 0
make typecheck && node scripts/check-loading-patterns.mjs
```

Expected: `0`, `0`, clean, clean. Open `http://localhost/` and `http://localhost/pricing`, `/signup`, `/login`, `/dashboard` (signed in): no page lost a style (the kept rules still apply); the header "Features" link lands on the studio chapter with its title visible under the local nav.

- [ ] **Step 5: Commit**

```bash
git add frontend-main/src/styles/globals.css scripts/check-loading-patterns.mjs frontend-main/src/components/shared/platform-header.tsx frontend-main/src/components/shared/platform-footer.tsx
git commit -m "chore(landing): remove the replaced sections, their dead CSS and the #features anchors"
```

(`git rm` already staged the deletions.)

---

### Task 13: Cloudflare cache rule for `contentor.app/media/*`

**Files:** none in the repo. One Cloudflare Cache Rule on the `contentor.app` zone, created through the `awesome-connectors` Cloudflare connector (writes go straight to Cloudflare, so read first). Mirrors Pix4Less's "videos" rule (`../pix4less/docs/cloudflare-cache-rules.md`): Next serves `public/` with `Cache-Control: public, max-age=0`, so the edge TTL is overridden.

- [ ] **Step 1: Find the zone and the current cache rules**

With `mcp__awesome-connectors__call`, connector `cloudflare`:

1. `GET /zones?name=contentor.app` → note `result[0].id` as `ZONE`.
2. `GET /raw?path=/zones/ZONE/rulesets/phases/http_request_cache_settings/entrypoint` → the phase's current rules. Expected today: a 404 ("ruleset not found", the phase is empty) or a ruleset with zero rules. If rules exist, keep them: the PUT below replaces the whole phase, so carry every existing rule object (minus its `id`, `last_updated`, `version`, `ref` fields) into the `rules` array in front of the new one.

- [ ] **Step 2: Write the rule**

`PUT /raw?path=/zones/ZONE/rulesets/phases/http_request_cache_settings/entrypoint` with body:

```json
{
  "rules": [
    {
      "description": "contentor media: edge-cache landing footage and stills 7 d, browser 1 d",
      "expression": "(http.host eq \"contentor.app\" and starts_with(http.request.uri.path, \"/media/\"))",
      "action": "set_cache_settings",
      "action_parameters": {
        "cache": true,
        "edge_ttl": {
          "mode": "override_origin",
          "default": 604800,
          "status_code_ttl": [
            { "status_code_range": { "from": 400, "to": 599 }, "value": -1 }
          ]
        },
        "browser_ttl": { "mode": "override_origin", "default": 86400 }
      }
    }
  ]
}
```

`value: -1` is the API's "no-store" for errors, so a 404 before the files are deployed (or a 5xx from the tunnel) is never kept at the edge. Tenant subdomains (`*.contentor.app`) are outside the expression on purpose. If the connector is unavailable, the same PUT works with `curl -4` and the `CLOUDFLARE_API_TOKEN` from `~/.zshrc` (IPv4-only token; the squeezevid plan in `~/ws/home-server/docs/superpowers/plans/2026-08-17-squeezevid-migration.md` Task 8 shows the shape).

- [ ] **Step 3: Read it back**

`GET /raw?path=/zones/ZONE/rulesets/phases/http_request_cache_settings/entrypoint` → `result.rules` contains the rule with `"enabled": true`, plus whatever was there before.

- [ ] **Step 4: Verify on the live zone (after Phase 5 deploys the files)**

Nothing in dev goes through Cloudflare, so this runs once the landing is deployed:

```bash
curl -4 -sI https://contentor.app/media/posters/hero-looks.avif | grep -i -E 'cf-cache-status|cache-control|content-type'
curl -4 -sI https://contentor.app/media/posters/hero-looks.avif | grep -i cf-cache-status
curl -4 -sI https://contentor.app/media/clips/hero-looks.mp4 | grep -i -E 'cf-cache-status|accept-ranges'
curl -4 -s -o /dev/null -w '%{http_code}\n' https://contentor.app/media/does-not-exist.mp4
curl -4 -sI https://contentor.app/media/does-not-exist.mp4 | grep -i cf-cache-status
```

Expected: `MISS` then `HIT` on the poster with `cache-control: max-age=86400`; the clip `HIT` on the second call with `accept-ranges: bytes`; the missing file `404` and never `HIT`. Record the result in Phase 5's prod verification. Media files are not content-hashed: whenever Phase 1 re-encodes a file under the same name, purge it by URL (`POST /raw?path=/zones/ZONE/purge_cache` with `{"files":["https://contentor.app/media/clips/hero-looks.mp4"]}`).

- [ ] **Step 5: Note it in the spec's status line**

Append to line 3 of `docs/superpowers/specs/2026-10-14-premium-marketing-and-studio-design.md`: `· media cache rule created <date>, live check pending Phase 5`. Commit it with Task 15's commit, not alone.

---

### Task 14: Verification pass — reduced motion, phone, budgets, a11y

**Files:** none new. Run on a production build: `next dev` serves unminified, uncompressed bundles and slow server renders, so neither the JS budget nor LCP means anything there. The Mac host has `frontend-main/node_modules` (vitest already runs there) and `.next/` is not bind-mounted into the container, so a host build touches nothing in the stack.

- [ ] **Step 1: Build and serve the production landing on the host**

Check nothing heavy runs (`docker stats --no-stream` quiet; no e2e), then:

```bash
cd frontend-main && NEXT_PUBLIC_API_URL=http://localhost NEXT_PUBLIC_BASE_DOMAIN=localhost npm run build && NEXT_PUBLIC_API_URL=http://localhost NEXT_PUBLIC_BASE_DOMAIN=localhost npx next start -p 3005
```

Expected: the build's route table lists `/` as a dynamic (`ƒ`) route; `http://localhost:3005/` renders the landing with live prices (the plans fetch goes through Caddy to Django). Keep this server running for Steps 2–6; stop it (Ctrl-C) before Task 15.

- [ ] **Step 2: Core Web Vitals, desktop**

Chrome DevTools MCP: `new_page` → `navigate_page` to `http://localhost:3005/`; `emulate` with `viewport: "1440x900x1"`, no throttling; `performance_start_trace` with `reload: true, autoStop: true`. Read LCP and CLS from the trace summary (`performance_analyze_insight` on "LCPBreakdown" if LCP is high).

Expected: LCP ≤ 2.5 s with the hero poster as the LCP element; CLS ≤ 0.05. If LCP is over: the poster is the lever — ask Phase 1 to re-encode `hero-looks`'s poster at ≤ 80 KB; do not add a JS preload.

Then INP: `performance_start_trace` with `reload: false, autoStop: false`; `click` the "Next" button of the looks gallery, `click` a FAQ summary, scroll to the bottom; `performance_stop_trace`. Read the INP insight.
Expected: INP ≤ 200 ms.

- [ ] **Step 3: JavaScript and media bytes, desktop**

After a full scroll to the footer (so every clip has started and every lazy image is in), `evaluate_script`:

```js
() => {
  const r = performance.getEntriesByType("resource");
  const kb = (f) =>
    Math.round(r.filter(f).reduce((a, e) => a + e.encodedBodySize, 0) / 1024);
  return {
    scriptKB: kb((e) => /\.js(\?|$)/.test(e.name)),
    mediaKB: kb((e) => /\/media\//.test(e.name)),
    loops: r.filter((e) => /\/media\/clips\/loop-/.test(e.name)).length,
  };
};
```

Expected: `scriptKB` ≤ 250 (gzipped; `next start` compresses), `mediaKB` ≤ 8192, `loops` 0 (nothing hovered). Cross-check `mediaKB` with `list_network_requests` filtered to `resourceTypes: ["media", "image"]`. If `scriptKB` is over, `npx next build` printed the First Load JS per route — the landing's own chunks are the only ones this phase added; look for an accidental client import of `@shared/sections/styles` (the look catalog must stay server-side).

- [ ] **Step 4: Phone pass with throttling (Review Focus 2)**

`emulate` with `viewport: "375x812x3,mobile,touch"`, `networkConditions: "Slow 4G"`, `cpuThrottlingRate: 4`; `navigate_page` to `http://localhost:3005/`; `performance_start_trace` with `reload: true, autoStop: true`.

Expected: LCP ≤ 2.5 s (the poster), CLS ≤ 0.05. Then scroll to the footer and run the Step 3 snippet: `mediaKB` ≤ 4096; `list_network_requests` with `resourceTypes: ["media"]` shows `hero-looks-phone.mp4` and `clip-student-phone-phone.mp4` (the phone encodes) and **no** `scrub-*` request (the scrubs are static on phones). `take_screenshot` of each chapter at this width: text never clips, tiles stack, the local nav shows the title and the pill only.

- [ ] **Step 5: Reduced motion**

Playwright MCP (the DevTools `emulate` tool has no reduced-motion switch): `browser_navigate` to `http://localhost:3005/`, `browser_emulate_media` with `reducedMotion: "reduce"`, reload, scroll to the footer, then `browser_network_requests`.

Expected: no request under `/media/clips/` at all (`MediaVideo` and `ScrollScrub` never ask for a file); `browser_snapshot` shows every chapter's text present at once; the scrub chapters show the poster and the last caption (desktop) or all three (phone width); the FAQ opens without a transition. `browser_take_screenshot`: nothing is faded or offset.

- [ ] **Step 6: Anchors under the sticky bars (Review Focus 3)**

Back in DevTools MCP at 1440: `evaluate_script`:

```js
async () => {
  const ids = [
    "hero",
    "build",
    "looks",
    "studio",
    "assistant",
    "students",
    "money",
    "start",
  ];
  const out = {};
  for (const id of ids) {
    document.querySelector(`nav a[href="#${id}"]`).click();
    await new Promise((r) => setTimeout(r, 900)); // smooth scroll settles
    out[id] = Math.round(
      document.getElementById(id).getBoundingClientRect().top,
    );
  }
  return out;
};
```

Expected: every value ≥ 92 (header 48 + local nav 44) — nothing hidden under the bars; `aria-current="location"` sits on the clicked link.

- [ ] **Step 7: Accessibility (axe through Lighthouse) and SEO**

Invoke the Skill tool with `chrome-devtools-mcp:a11y-debugging`, then on `http://localhost:3005/`: `lighthouse_audit` with `device: "desktop"`, `mode: "navigation"`, `outputDirPath: <scratchpad>/lh-desktop`, and again with `device: "mobile"`. Filter failures as the skill shows:

```bash
node -e "const r=require('<scratchpad>/lh-desktop/<report>.json'); Object.values(r.audits).filter(a=>a.score!==null && a.score<1).forEach(a=>console.log(a.id, '|', a.title, '|', (a.details?.items||[]).map(i=>i.node?.selector).join(', ')))"
```

Expected: accessibility 1.0 and SEO ≥ 0.95 on both; zero failing a11y audits. Also `list_console_messages` with `types: ["issue"]`: no "Low contrast" issue in the light or the dark chapters. `take_snapshot`: one `h1` (the hero), each chapter an `h2`, tiles `h3`, the carousel announced as "carousel" with "slide N of 12", every image with alt or `alt=""`, the hover tiles as buttons named by their title.

- [ ] **Step 8: Visual pass**

Browser pane screenshots at 375, 1024 and 1440 of every chapter: light paper, ink type, brass only on links and the wordmark; the two dark chapters flush edge to edge; no shadow or border on any marketing tile; Geist throughout. Then stop the `next start` server.

---

### Task 15: Phase gate

**Files:**

- Modify: `docs/superpowers/specs/2026-10-14-premium-marketing-and-studio-design.md:3` (status line)

- [ ] **Step 1: Full frontend checks, one after the other**

```bash
make typecheck
make lint
make test-frontend
```

Expected: all clean. `make lint` runs pre-commit (prettier reformats `marketing.json` and any TSX — if it changes a file, `git add` it and re-run), `check-loading-patterns.mjs` and the selector self-test. `make test-frontend` runs `plans.test.ts`, `landing-media.test.ts`, `landing-copy.test.ts` with Phase 0's and Phase 1's tests.

- [ ] **Step 2: e2e**

Confirm the host `next start` from Task 14 is stopped and nothing else heavy runs, then:

```bash
make e2e-spec SPEC=00-smoke
make e2e-spec SPEC=01-signup-onboarding
```

Expected: both PASS. `01` takes long and one of its two provisioning tests trips a 120 s timeout as baseline flake (memory `reference-e2e-502-flakiness`): a provisioning timeout is not this phase's regression — the spec never loads `/`; re-run once. A blank page or hang is usually a `nextjs-customer` 502 (`docker compose logs caddy --since 20m | grep 'status":502'`), not a code bug.

- [ ] **Step 3: Impact map**

`e2e/impact-map.json` already maps `frontend-main` to specs 01, 10, 11, 18, 22, 24; nothing in this phase adds a path that needs a new entry. Run `make e2e-changed PLAN=1` and read the plan: it lists those specs (fail-closed is not triggered). Do not run the full set; the gate above is the agreed one.

- [ ] **Step 4: Record the phase**

Append to line 3 of the spec: `· Phase 2 done <date>` (Task 13's note is on the same line). Commit:

```bash
git add docs/superpowers/specs/2026-10-14-premium-marketing-and-studio-design.md
git commit -m "docs(spec): premium look — Phase 2 landing done, media cache rule created"
```

Phase 5 deploys; its prod verification repeats Task 13 Step 4 (cold load `MISS` then `HIT`) and screenshots the landing.

---

## Self-review notes

- **Spec coverage (5.4, 5.7, section 6 row 2, 5.3 cache rule):** hero → Task 4; ch. 2 scrub with three bands → Task 5; ch. 3 twelve look cards (niche spread listed in Task 2) → Task 6; ch. 4 bento with hover/tap loops → Task 7; ch. 5 dark scrub → Task 8; ch. 6 phone in a frame beside two tiles → Task 9; ch. 7 dark, three flat tiles, no numbers → Task 10 (digits forbidden by the copy test); ch. 8 founding tile, teaser from the plans endpoint, FAQ accordion with a turning chevron, final CTA on second paper → Task 11; copy through `marketing.json` with the two skills → Task 3; Cloudflare rule → Task 13; budgets, reduced motion, phone, axe → Task 14; gate → Task 15. Header, local nav and footer are Phase 0 and only mounted here.
- **Deviations, stated:** hero text sits above the footage rather than over it (no scrim, token-only contrast); scrubs are static on phones (the 4 MB budget cannot carry two all-keyframe clips) via CSS switching, not a Phase 0 change; chapter 7 carries no media (the spec says "short", and a receipt screenshot would be a fabricated record); the Core Web Vitals and JS budget are measured on a host production build at `:3005` because `next dev` cannot meet them by construction; the DevTools `lighthouse_audit` tool excludes performance, so LCP/CLS/INP come from `performance_start_trace`.
- **Placeholder scan:** every code step is complete code; the only "fill in" is the copy itself, which the copy test pins by key, cap and no-digit rule; no "similar to Task N".
- **Type consistency:** `media(key)` returns `MediaItem` with optional `poster`/`phoneSrc`/`webm`/`srcSmall`/`alt` everywhere; `ScrubBand`'s `node` is a `ReactNode` in Task 5 and Task 8; `teaserRows` returns `{ key: PlanKey; price: string | null }[]` in Task 1 and is consumed so in Task 11; `playOn` is `"view" | "hover"` in Task 7 only; `LANDING_MEDIA` kinds match the manifest `kind` values of Phase 0's contract; `SPAN` keys match `STUDIO_TILES.span` (2 | 3 | 4).
- **Review Focus pins:** 1 → `landing-media.test.ts` (Task 2); 2 → `landing-media.test.ts` phone budget + Task 14 Step 4; 3 → Task 14 Step 6; 4 → `landing-copy.test.ts` + Task 11 Step 6; 5 → `plans.test.ts` (Task 1) + Task 11 Step 6.
