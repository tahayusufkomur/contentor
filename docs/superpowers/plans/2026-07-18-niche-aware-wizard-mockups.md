# Niche-Aware Wizard Mockup Screenshots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every screenshot in the signup wizard (theme, hero, page-layout steps) shows imagery from the niche the coach picked on step 1, instead of the current always-yoga set.

**Architecture:** Parametrize the existing single-scratch-tenant capture pipeline by niche: `seed_wizard_mockup_tenant` gains `--niche`, `tools/wizard-mockups/capture.mjs` loops over the 7 content-complete niches (reseed → capture 27 shots each) writing WebP into `frontend-main/public/wizard-mockups/<niche>/`. The wizard frontend resolves image URLs through a shared pure helper with a fallback chain: niche file → yoga file → existing CSS sketch.

**Tech Stack:** Django management commands (pytest), Playwright capture script (Node, no new deps), Next.js 14 wizard components, shared TS helper in `packages/shared` tested via frontend-customer vitest.

**Spec:** `docs/superpowers/specs/2026-07-18-niche-aware-wizard-mockups-design.md`

## Global Constraints

- Niche set with captured screenshots: `belly_dance, face_yoga, fitness, makeup, pilates, pole_dance, yoga` — everything in `backend/apps/demo_seed/data/` **except `general`** (too sparse; maps to yoga).
- Fallback niche is `yoga`. `general`, unset, and unknown niches all resolve to the yoga set.
- Image format: WebP, quality 0.85, 800px wide (same downscale pipeline as today).
- Asset layout: `frontend-main/public/wizard-mockups/<niche>/<name>.webp`; the old flat `*.png` files are deleted in Task 5.
- Pre-commit must pass (`make lint`); `make typecheck` must stay clean for both frontends.
- Backend tests run inside the django container: `docker compose exec -T django pytest <path> -v`.

---

### Task 1: `--niche` argument on `seed_wizard_mockup_tenant`

**Files:**
- Modify: `backend/apps/core/management/commands/seed_wizard_mockup_tenant.py`
- Test: `backend/apps/core/tests/test_seed_wizard_mockup_tenant.py` (new)

**Interfaces:**
- Consumes: `available_niches()` from `apps.core.demo.seed_template` (already returns sorted niche keys from `demo_seed/data/*.json`, including `general`).
- Produces: CLI `python manage.py seed_wizard_mockup_tenant [--niche <name>]` (default `yoga`); module-level `resolve_niche(value: str) -> str` raising `CommandError` on unknown niches; `DEFAULT_NICHE = "yoga"`. Task 4's capture script shells out to this command with `--niche`.

- [ ] **Step 1: Write the failing test**

Create `backend/apps/core/tests/test_seed_wizard_mockup_tenant.py`:

```python
"""seed_wizard_mockup_tenant --niche: the scratch tenant can be reseeded
from any demo_seed niche so tools/wizard-mockups can capture per-niche
screenshot sets. Validation only — the full handle() path (schema create +
template seed) is exercised by the capture tool itself, not the suite."""

import pytest
from django.core.management.base import CommandError

from apps.core.management.commands.seed_wizard_mockup_tenant import (
    DEFAULT_NICHE,
    resolve_niche,
)


def test_accepts_known_niche():
    assert resolve_niche("belly_dance") == "belly_dance"


def test_default_niche_is_valid():
    assert resolve_niche(DEFAULT_NICHE) == DEFAULT_NICHE


def test_rejects_unknown_niche_with_available_list():
    with pytest.raises(CommandError, match="belly_dance"):
        resolve_niche("underwater_basket_weaving")
```

(The `match="belly_dance"` asserts the error message lists the available niches.)

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec -T django pytest apps/core/tests/test_seed_wizard_mockup_tenant.py -v`
Expected: FAIL at import — `ImportError: cannot import name 'DEFAULT_NICHE'`

- [ ] **Step 3: Implement**

In `backend/apps/core/management/commands/seed_wizard_mockup_tenant.py`:

Replace the current constant block (lines 17–22):

```python
# "general" is the sparsest niche module (no subscription plans, FAQ
# disabled with zero items) — meant as a blank-slate fallback for real
# coaches, not for producing convincing screenshots. "yoga" has real
# content for every block type this tool captures (FAQ, pricing plans,
# testimonials), so mockups don't show empty states.
NICHE = "yoga"
```

with:

```python
# Default stays "yoga": every other real niche is content-complete too
# (courses, plans, FAQ, testimonials), but "general" is a deliberately
# sparse blank-slate module (no subscription plans, FAQ disabled) — it
# would produce empty-state screenshots, so the wizard maps it to the
# yoga screenshot set instead of capturing one for it.
DEFAULT_NICHE = "yoga"


def resolve_niche(value):
    """Validate a --niche value against the demo_seed registry."""
    from apps.core.demo.seed_template import available_niches

    niches = available_niches()
    if value not in niches:
        raise CommandError(f"Unknown niche {value!r}. Available: {', '.join(niches)}")
    return value
```

Update the import at the top of the file:

```python
from django.core.management.base import BaseCommand, CommandError
```

Add `add_arguments` to the command class and use the option in `handle`:

```python
    def add_arguments(self, parser):
        parser.add_argument(
            "--niche",
            default=DEFAULT_NICHE,
            help="demo_seed niche to seed the scratch tenant from (default: %(default)s)",
        )

    def handle(self, *args, **options):
        niche = resolve_niche(options["niche"])
        ...
```

and change the seeding call inside `tenant_context` from
`seed_template_into_tenant(tenant, NICHE, writer=self.stdout.write)` to
`seed_template_into_tenant(tenant, niche, writer=self.stdout.write)`.
Everything else in `handle()` is unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec -T django pytest apps/core/tests/test_seed_wizard_mockup_tenant.py -v`
Expected: 3 PASSED

- [ ] **Step 5: Run the neighboring command tests (regression)**

Run: `docker compose exec -T django pytest apps/core/tests/test_set_wizard_mockup_layout.py apps/core/tests/test_set_wizard_mockup_look.py -v`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add backend/apps/core/management/commands/seed_wizard_mockup_tenant.py backend/apps/core/tests/test_seed_wizard_mockup_tenant.py
git commit -m "feat(onboarding): niche-parametrized wizard-mockups scratch tenant"
```

---

### Task 2: Shared `mockupSrcs` helper

**Files:**
- Create: `packages/shared/src/wizard/mockups.ts`
- Test: `frontend-customer/src/lib/__tests__/wizard-mockups.test.ts` (new)

Rationale for the location: `frontend-main` has no test runner; the established repo pattern for pure cross-app logic is `packages/shared` (aliased as `@shared/*` in both frontends' tsconfig) with tests in frontend-customer's vitest — see `packages/shared/src/logo/curated-rank.ts` + `frontend-customer/src/lib/__tests__/curated-rank.test.ts`.

**Interfaces:**
- Consumes: nothing.
- Produces: `mockupSrcs(niche: string | undefined, name: string): string[]` — ordered candidate URLs (niche file first, then yoga fallback; a single entry when they'd be identical). Also exports `MOCKUP_NICHES` (readonly tuple of the 7 captured niches) and `FALLBACK_NICHE = "yoga"`. Task 3 imports `mockupSrcs` from `@shared/wizard/mockups`.

- [ ] **Step 1: Write the failing test**

Create `frontend-customer/src/lib/__tests__/wizard-mockups.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { mockupSrcs } from "@shared/wizard/mockups";

describe("mockupSrcs", () => {
  it("tries the niche directory first, then the yoga fallback", () => {
    expect(mockupSrcs("belly_dance", "theme-ocean")).toEqual([
      "/wizard-mockups/belly_dance/theme-ocean.webp",
      "/wizard-mockups/yoga/theme-ocean.webp",
    ]);
  });

  it("returns a single candidate for yoga itself (no duplicate)", () => {
    expect(mockupSrcs("yoga", "hero-split")).toEqual([
      "/wizard-mockups/yoga/hero-split.webp",
    ]);
  });

  it("maps general to the yoga set", () => {
    expect(mockupSrcs("general", "home-story")).toEqual([
      "/wizard-mockups/yoga/home-story.webp",
    ]);
  });

  it("maps undefined and unknown niches to the yoga set", () => {
    expect(mockupSrcs(undefined, "home-story")).toEqual([
      "/wizard-mockups/yoga/home-story.webp",
    ]);
    expect(mockupSrcs("scuba_diving", "home-story")).toEqual([
      "/wizard-mockups/yoga/home-story.webp",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/wizard-mockups.test.ts`
Expected: FAIL — cannot resolve `@shared/wizard/mockups`

- [ ] **Step 3: Implement**

Create `packages/shared/src/wizard/mockups.ts`:

```ts
/** Niches with a captured screenshot set under
 * frontend-main/public/wizard-mockups/<niche>/ — mirrors
 * backend/apps/demo_seed/data/ minus "general", whose deliberately sparse
 * content module (no plans, FAQ disabled) would produce empty-state
 * screenshots. Captured by tools/wizard-mockups/capture.mjs. */
export const MOCKUP_NICHES = [
  "belly_dance",
  "face_yoga",
  "fitness",
  "makeup",
  "pilates",
  "pole_dance",
  "yoga",
] as const;

export const FALLBACK_NICHE = "yoga";

/** Ordered candidate URLs for one wizard mockup image: the coach's niche
 * first, then the yoga fallback set. Consumers try each in order and drop
 * to a CSS sketch when every candidate 404s — so a niche added to the
 * catalog before its screenshots are captured never shows a broken image. */
export function mockupSrcs(niche: string | undefined, name: string): string[] {
  const dir =
    niche && (MOCKUP_NICHES as readonly string[]).includes(niche)
      ? niche
      : FALLBACK_NICHE;
  const srcs = [`/wizard-mockups/${dir}/${name}.webp`];
  if (dir !== FALLBACK_NICHE)
    srcs.push(`/wizard-mockups/${FALLBACK_NICHE}/${name}.webp`);
  return srcs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/wizard-mockups.test.ts`
Expected: 4 PASSED

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/wizard/mockups.ts frontend-customer/src/lib/__tests__/wizard-mockups.test.ts
git commit -m "feat(wizard): shared per-niche mockup URL helper with yoga fallback"
```

---

### Task 3: Wizard components use per-niche screenshot URLs

**Files:**
- Modify: `frontend-main/src/app/signup/verify/wizard/previews.tsx` (ScreenshotThumbnail, ~line 301)
- Modify: `frontend-main/src/app/signup/verify/wizard/steps.tsx` (ThemeStep ~line 393, HeroStep ~line 512)
- Modify: `frontend-main/src/app/signup/verify/wizard/pages-steps.tsx` (LayoutThumbnail ~line 41, PageLayoutStep ~line 69)
- Modify: `frontend-main/src/app/signup/verify/wizard/WizardFlow.tsx` (HeroStep call ~line 371, PageLayoutStep call ~line 413)

**Interfaces:**
- Consumes: `mockupSrcs` from `@shared/wizard/mockups` (Task 2).
- Produces: `ScreenshotThumbnail` prop change `src: string` → `srcs: string[]`; `HeroStep` and `PageLayoutStep` gain an optional `niche?: string` prop. No API/backend changes.

- [ ] **Step 1: Multi-candidate ScreenshotThumbnail**

In `previews.tsx`, replace the `ScreenshotThumbnail` component (and its doc comment) with:

```tsx
/** Real screenshot inside browser chrome. `srcs` is an ordered candidate
 * list (per-niche file, then the yoga fallback set — see
 * @shared/wizard/mockups); swaps to `fallback` when every candidate fails
 * to load — a catalog option must never show a broken image. Failures are
 * keyed by URL so switching niche mid-wizard retries the new niche's file. */
export function ScreenshotThumbnail({
  srcs,
  fallback,
}: {
  srcs: string[];
  fallback: React.ReactNode;
}) {
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const src = srcs.find((s) => !failed[s]);
  if (!src) return <>{fallback}</>;
  return (
    <BrowserFrame>
      {/* eslint-disable-next-line @next/next/no-img-element -- static asset, no next/image loader needed */}
      <img
        src={src}
        alt=""
        className="block w-full"
        onError={() => setFailed((f) => ({ ...f, [src]: true }))}
      />
    </BrowserFrame>
  );
}
```

- [ ] **Step 2: ThemeStep and HeroStep**

In `steps.tsx`:

Add the import (next to the existing `./previews` import):

```tsx
import { mockupSrcs } from "@shared/wizard/mockups";
```

In `ThemeStep` (already receives `niche`), change the thumbnail call from:

```tsx
                <ScreenshotThumbnail
                  src={`/wizard-mockups/theme-${theme}.png`}
                  fallback={null}
                />
```

to:

```tsx
                <ScreenshotThumbnail
                  srcs={mockupSrcs(niche, `theme-${theme}`)}
                  fallback={null}
                />
```

In `HeroStep`, add `niche` to the destructured props and the type:

```tsx
export function HeroStep({
  catalog,
  brand,
  niche,
  theme,
  font,
  value,
  onChange,
  disabled,
}: {
  catalog: WizardCatalog;
  brand: string;
  niche?: string;
  theme?: string;
  font?: string;
  value?: string;
  onChange: (style: string) => void;
  disabled?: boolean;
}) {
```

and change its thumbnail from:

```tsx
            <ScreenshotThumbnail
              src={`/wizard-mockups/hero-${style}.png`}
```

to:

```tsx
            <ScreenshotThumbnail
              srcs={mockupSrcs(niche, `hero-${style}`)}
```

(the `fallback={<MiniHero .../>}` stays as is).

- [ ] **Step 3: LayoutThumbnail and PageLayoutStep**

In `pages-steps.tsx`:

Add the import:

```tsx
import { mockupSrcs } from "@shared/wizard/mockups";
```

Replace `LayoutThumbnail` with (doc comment updated to match):

```tsx
/** Real screenshot (tools/wizard-mockups/capture.mjs) for this layout id —
 * the coach's niche set first, then the yoga fallback set — falling back to
 * the abstract wireframe when neither exists, so a layout added to the
 * catalog before its screenshots exist never shows a broken image. Shown
 * uncropped inside browser chrome: the coach is choosing a whole page, so
 * cropping it would hide the very blocks that distinguish the two options.
 * alt is empty because the card's visible title already names the layout. */
function LayoutThumbnail({
  layoutId,
  blocks,
  theme,
  niche,
}: {
  layoutId: string;
  blocks: string[];
  theme?: string;
  niche?: string;
}) {
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const src = mockupSrcs(niche, layoutId).find((s) => !failed[s]);
  return (
    <BrowserFrame>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- static asset, no next/image loader needed
        <img
          src={src}
          alt=""
          className="block w-full"
          onError={() => setFailed((f) => ({ ...f, [src]: true }))}
        />
      ) : (
        <div className="p-2">
          <MiniPageSketch blocks={blocks} theme={theme} />
        </div>
      )}
    </BrowserFrame>
  );
}
```

In `PageLayoutStep`, add `niche` to the destructured props and type:

```tsx
export function PageLayoutStep({
  catalog,
  page,
  value,
  onChange,
  theme,
  niche,
  goals,
  disabled,
}: {
  catalog: WizardCatalog;
  page: string;
  value?: string;
  onChange: (layoutId: string) => void;
  theme?: string;
  niche?: string;
  goals: string[];
  disabled?: boolean;
}) {
```

and pass it to the thumbnail:

```tsx
            <LayoutThumbnail
              layoutId={option.id}
              blocks={thumbnailBlocks(catalog, page, option.blocks, goals)}
              theme={theme}
              niche={niche}
            />
```

- [ ] **Step 4: WizardFlow wiring**

In `WizardFlow.tsx`, add `niche={answers.niche}` to two call sites:

The `case "look.hero":` block:

```tsx
        <HeroStep
          catalog={catalog}
          brand={brand}
          niche={answers.niche}
          theme={answers.theme}
          font={answers.font_family}
          value={answers.hero_style}
          onChange={(hero_style) => selectAndAdvance({ hero_style })}
          disabled={busy}
        />
```

The `default:` (pages) block:

```tsx
        <PageLayoutStep
          catalog={catalog}
          page={page}
          value={answers.page_layouts?.[page]}
          onChange={(layoutId) =>
            selectAndAdvance({
              page_layouts: {
                ...(answers.page_layouts ?? {}),
                [page]: layoutId,
              },
            })
          }
          theme={answers.theme}
          niche={answers.niche}
          goals={goals}
          disabled={busy}
        />
```

- [ ] **Step 5: Verify no stale references and typecheck**

Run: `grep -rn "wizard-mockups.*png" frontend-main/src/`
Expected: no output — every image URL now flows through `mockupSrcs` (comment-only mentions of `tools/wizard-mockups` are fine).

Run: `make typecheck`
Expected: clean for both apps.

- [ ] **Step 6: Commit**

```bash
git add frontend-main/src/app/signup/verify/wizard/previews.tsx frontend-main/src/app/signup/verify/wizard/steps.tsx frontend-main/src/app/signup/verify/wizard/pages-steps.tsx frontend-main/src/app/signup/verify/wizard/WizardFlow.tsx
git commit -m "feat(wizard): niche-aware screenshot thumbnails with yoga->sketch fallback chain"
```

---

### Task 4: Per-niche capture loop + WebP output in `capture.mjs`

**Files:**
- Modify: `tools/wizard-mockups/capture.mjs` (full rewrite below — structure changes: niche loop, per-niche out dirs, WebP, `--niche` CLI filter)
- Modify: `Makefile` (`capture-wizard-mockups` target, line 88)

**Interfaces:**
- Consumes: `python manage.py seed_wizard_mockup_tenant --niche <n>` (Task 1).
- Produces: `frontend-main/public/wizard-mockups/<niche>/<name>.webp` for each of the 7 niches × 27 names — the exact URLs `mockupSrcs` (Task 2) builds. CLI: `npm run capture [-- --niche <name> [--niche <name2>...]]`.

- [ ] **Step 1: Rewrite capture.mjs**

Replace the entire contents of `tools/wizard-mockups/capture.mjs` with:

```js
// Captures one real screenshot per wizard catalog option (page layouts,
// hero styles, themes), per niche, from the hidden wizard-mockups scratch
// tenant (seed_wizard_mockup_tenant --niche <n>), and saves downscaled
// WebPs into frontend-main/public/wizard-mockups/<niche>/. Manual dev
// tool — re-run whenever demo content or page templates change.
//
// Prereqs: dev stack up (`make dev`) and demo media mirrored into dev
// MinIO (`make seed-demo-assets`). The scratch tenant is (re)seeded per
// niche by this script — no manual seeding step.
//
// Usage (from tools/wizard-mockups/):
//   npm run capture                       # all niches (~30-45 min)
//   npm run capture -- --niche belly_dance   # one niche while iterating

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_ROOT = join(__dirname, "..", "..", "frontend-main", "public", "wizard-mockups");
const VIEWPORT = { width: 1280, height: 960 };
const OUTPUT_WIDTH = 800; // downscaled width; height follows viewport aspect ratio
// Capture at 2x and let downscale() supersample — thumbnail text and photos
// come out visibly crisper than a 1x capture at the same output size.
const DEVICE_SCALE = 2;
const WEBP_QUALITY = 0.85;

// Mirrors backend/apps/demo_seed/data/ minus "general" (deliberately
// sparse — no plans, FAQ disabled — it would produce empty-state
// screenshots; the wizard maps it to the yoga set). Must stay in sync
// with MOCKUP_NICHES in packages/shared/src/wizard/mockups.ts.
const NICHES = ["belly_dance", "face_yoga", "fitness", "makeup", "pilates", "pole_dance", "yoga"];

// Mirrors backend/apps/core/onboarding/wizard_catalog.py PAGE_LAYOUTS.
const LAYOUTS = [
  { page: "home", id: "home-spotlight", path: "/" },
  { page: "home", id: "home-story", path: "/" },
  { page: "about", id: "about-story", path: "/about" },
  { page: "about", id: "about-portrait", path: "/about" },
  { page: "courses", id: "courses-grid", path: "/courses" },
  { page: "courses", id: "courses-guided", path: "/courses" },
  { page: "pricing", id: "pricing-simple", path: "/plans" },
  { page: "pricing", id: "pricing-reassure", path: "/plans" },
  { page: "faq", id: "faq-list", path: "/faq" },
  { page: "faq", id: "faq-welcoming", path: "/faq" },
  { page: "contact", id: "contact-form", path: "/contact" },
  { page: "contact", id: "contact-warm", path: "/contact" },
  { page: "home", id: "home-complete", path: "/" },
  { page: "about", id: "about-warm", path: "/about" },
  { page: "courses", id: "courses-social", path: "/courses" },
  { page: "pricing", id: "pricing-trust", path: "/plans" },
  { page: "faq", id: "faq-support", path: "/faq" },
  { page: "contact", id: "contact-reassure", path: "/contact" },
];

// Mirrors wizard_catalog.THEMES / HERO_STYLES.
const THEMES = ["ocean", "ember", "forest", "sunset", "violet", "slate"];
const HEROES = ["centered", "split", "minimal"];
// Hero cards only sell the top of the page — clip before downscaling.
const HERO_CLIP = { x: 0, y: 0, width: 1280, height: 640 };

function manage(args) {
  execFileSync(
    "docker",
    ["compose", "exec", "-T", "django", "python", "manage.py", ...args],
    { cwd: join(__dirname, "..", ".."), stdio: "inherit" },
  );
}

const setLayout = (page, layoutId) => manage(["set_wizard_mockup_layout", page, layoutId]);
const setLook = (args) => manage(["set_wizard_mockup_look", ...args]);
const seedNiche = (niche) => manage(["seed_wizard_mockup_tenant", "--niche", niche]);

function nichesFromArgv() {
  const picked = [];
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--niche") {
      const value = argv[++i];
      if (!NICHES.includes(value)) {
        throw new Error(`Unknown niche '${value}'. Available: ${NICHES.join(", ")}`);
      }
      picked.push(value);
    } else {
      throw new Error(`Unknown argument '${argv[i]}'. Usage: npm run capture [-- --niche <name>]`);
    }
  }
  return picked.length ? picked : NICHES;
}

/** Downscale + encode via an in-page canvas (no native image dependency —
 * same approach as tools/flowmap/crawler/thumbnail.js). */
async function downscale(page, pngBuffer, targetWidth) {
  const b64 = pngBuffer.toString("base64");
  const dataUrl = await page.evaluate(
    async ({ src, targetWidth, quality }) => {
      const img = new Image();
      img.src = "data:image/png;base64," + src;
      await img.decode();
      const scale = Math.min(1, targetWidth / img.naturalWidth);
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = c.getContext("2d");
      ctx.imageSmoothingQuality = "high"; // 2x-capture -> big ratio; default bilinear aliases
      ctx.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL("image/webp", quality);
    },
    { src: b64, targetWidth, quality: WEBP_QUALITY },
  );
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

async function main() {
  const niches = nichesFromArgv();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE });
  const page = await context.newPage();
  // Broken media means a broken catalog card — refuse to write the file.
  // (The Jul 15 captures shipped broken-image icons because dev MinIO had
  // been wiped and every presigned demo photo 404'd.) Track failures at the
  // network layer so CSS background-image fetches count too, not just <img>.
  const failedMedia = new Set();
  page.on("response", (res) => {
    const type = res.request().resourceType();
    if ((type === "image" || type === "media") && res.status() >= 400) {
      failedMedia.add(`${res.status()} ${res.url()}`);
    }
  });
  page.on("requestfailed", (req) => {
    const type = req.resourceType();
    if (type === "image" || type === "media") failedMedia.add(`FAILED ${req.url()}`);
  });
  // Belt-and-suspenders: disable Chromium's own HTTP cache too. The real fix
  // for stale layouts is per-layout domains (see seed_wizard_mockup_tenant) —
  // frontend-customer's fetchTenantConfig() keeps its own 60s in-memory
  // cache keyed by domain, independent of the browser and of Next's caching,
  // so two layouts sharing one domain would silently serve the first
  // layout's cached config for the second capture.
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });

  async function capture(outDir, host, path, outName, { clip, fullPage = false } = {}) {
    failedMedia.clear();
    await page.goto(`http://${host}${path}`, { waitUntil: "networkidle", timeout: 30000 });
    // Hide Next.js's dev-only overlay, same as tools/flowmap/crawler/capture.js.
    await page.addStyleTag({ content: "nextjs-portal{display:none !important}" }).catch(() => {});
    // Second net: <img> elements that attempted a load and got nothing
    // (complete && naturalWidth 0) — catches failures the response listener
    // can't attribute, without tripping on below-fold lazy images.
    const brokenImgs = await page.evaluate(() =>
      [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src || i.currentSrc),
    );
    if (failedMedia.size || brokenImgs.length) {
      const details = [...failedMedia, ...brokenImgs].join("\n  ");
      throw new Error(
        `${outName}: page has broken media — refusing to capture.\n  ${details}\n` +
          "Run `make seed-demo-assets` (mirrors demo photos/videos into dev MinIO), then retry.",
      );
    }
    const png = await page.screenshot(fullPage ? { fullPage: true } : { fullPage: false, ...(clip ? { clip } : {}) });
    const downscaled = await downscale(page, png, OUTPUT_WIDTH);
    writeFileSync(join(outDir, `${outName}.webp`), downscaled);
    console.log(`  -> ${outName}.webp`);
  }

  let written = 0;
  for (const niche of niches) {
    console.log(`\n=== ${niche} ===`);
    seedNiche(niche);
    const outDir = join(OUT_ROOT, niche);
    mkdirSync(outDir, { recursive: true });

    // fullPage: true — a viewport-only crop made two layouts that share their
    // first blocks (home-story/home-complete both open hero, imageText,
    // courseGrid) render byte-identical thumbnails, since the block that
    // actually distinguishes them sat below the fold. Capturing the whole
    // scrollable page makes every layout option provably distinct, no matter
    // which blocks a future option shares with an existing one.
    for (const { page: pageKey, id, path } of LAYOUTS) {
      console.log(`${id} ...`);
      setLayout(pageKey, id);
      await capture(outDir, `wm-${id}.localhost`, path, id, { fullPage: true });
    }

    for (const style of HEROES) {
      console.log(`hero-${style} ...`);
      setLook(["--hero", style]);
      await capture(outDir, `wm-hero-${style}.localhost`, "/", `hero-${style}`, { clip: HERO_CLIP });
    }
    // Reset home (hero back to centered, spotlight layout) before theme shots.
    setLayout("home", "home-spotlight");

    for (const theme of THEMES) {
      console.log(`theme-${theme} ...`);
      setLook(["--theme", theme]);
      await capture(outDir, `wm-theme-${theme}.localhost`, "/", `theme-${theme}`);
    }
    // No trailing look-reset: the next niche (or next run) reseeds the
    // scratch tenant from its template anyway.
    written += LAYOUTS.length + HEROES.length + THEMES.length;
  }

  await browser.close();
  console.log(`\nDone. ${written} screenshots written under ${OUT_ROOT}/<niche>/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Update the Makefile target**

Replace the `capture-wizard-mockups` recipe (Makefile line 88-90):

```make
capture-wizard-mockups: seed-demo-assets ## Capture per-niche wizard screenshots (needs make dev running; ARGS="--niche belly_dance" for one niche)
	cd tools/wizard-mockups && npm install --silent && npx playwright install chromium && npm run capture -- $(ARGS)
```

(The standalone `seed_wizard_mockup_tenant` line is dropped — the capture script now reseeds per niche itself.)

- [ ] **Step 3: Smoke-test one niche**

Prereqs: `make dev` running, `.env.prod` present for asset mirroring.

Run: `make seed-demo-assets && cd tools/wizard-mockups && npm install --silent && npx playwright install chromium && npm run capture -- --niche belly_dance`
Expected: reseed log, then 27 `-> <name>.webp` lines; `ls ../../frontend-main/public/wizard-mockups/belly_dance | wc -l` → `27`.

Then open one file (e.g. `frontend-main/public/wizard-mockups/belly_dance/home-spotlight.webp`) and confirm it renders belly-dance content, not yoga.

Also verify the invalid-arg path: `npm run capture -- --niche nope`
Expected: exits non-zero with `Unknown niche 'nope'`.

- [ ] **Step 4: Commit**

```bash
git add tools/wizard-mockups/capture.mjs Makefile frontend-main/public/wizard-mockups/belly_dance
git commit -m "feat(tools): per-niche WebP capture loop for wizard mockups"
```

---

### Task 5: Full capture, old-asset removal, end-to-end verification

**Files:**
- Create: `frontend-main/public/wizard-mockups/<niche>/*.webp` (remaining 6 niches, 27 files each)
- Delete: `frontend-main/public/wizard-mockups/*.png` (27 flat files)

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces: the shipped asset set. After this task the feature is live in dev.

- [ ] **Step 1: Run the full capture**

Run (dev stack up): `make capture-wizard-mockups`
Expected: 7 niche sections, 27 captures each (~30–45 min). The belly_dance set from Task 4 is simply re-written.

- [ ] **Step 2: Verify the asset matrix**

Run: `for d in frontend-main/public/wizard-mockups/*/; do echo "$d $(ls $d | wc -l)"; done`
Expected: exactly 7 directories (`belly_dance face_yoga fitness makeup pilates pole_dance yoga`), each showing 27.

Then eyeball one representative file per niche (per the spec's visual-verification requirement) — open each niche's `home-spotlight.webp` and confirm niche-appropriate imagery and no empty-state sections:

```bash
open frontend-main/public/wizard-mockups/{belly_dance,face_yoga,fitness,makeup,pilates,pole_dance,yoga}/home-spotlight.webp
```

- [ ] **Step 3: Delete the old flat PNGs**

```bash
git rm frontend-main/public/wizard-mockups/*.png
```

Run: `grep -rn "wizard-mockups" --include="*.ts" --include="*.tsx" frontend-main/src frontend-customer/src packages/shared/src | grep ".png"`
Expected: no output (nothing references the flat PNG paths).

- [ ] **Step 4: Verify in the running wizard**

With `make dev` up, walk the signup wizard in a browser as a new coach:
1. Pick **Belly Dance** on the niche step.
2. Theme step: cards must show belly-dance screenshots (`/wizard-mockups/belly_dance/theme-*.webp` in the network tab).
3. Hero step and one page-layout step (e.g. Home): same check.
4. Go back, switch niche to **General**: cards must show the yoga set (no broken images, no CSS-sketch fallbacks).

Expected: niche-matched imagery everywhere; zero broken-image icons; network tab shows `.webp` requests only.

- [ ] **Step 5: Full gates**

Run: `make typecheck && make lint`
Expected: clean.

Run: `make test-changed`
Expected: PASS (covers the core app tests touched by the diff).

Run: `make e2e-changed`
Expected: mapped wizard/signup specs PASS (fail-closed: if unmapped areas trigger the full suite, all non-Stripe specs must pass).

- [ ] **Step 6: Commit**

```bash
git add frontend-main/public/wizard-mockups
git commit -m "feat(wizard): per-niche mockup screenshot sets (7 niches, WebP); drop flat yoga PNGs"
```
