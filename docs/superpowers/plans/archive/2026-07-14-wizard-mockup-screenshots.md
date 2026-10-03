# Wizard Page-Layout Mockup Screenshots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the abstract wireframe thumbnails in the wizard's "Your pages" step with real screenshots of the actual rendered page, captured once from a dedicated scratch tenant.

**Architecture:** A hidden scratch tenant (`wizard-mockups`) gets niche-seeded like a real coach signup. A management command rewrites one page's blocks on that tenant to a specific wizard layout choice (reusing the exact compiler real provisioning uses), and a self-contained Playwright script drives the browser to that tenant's real page, screenshots it, and saves a downscaled PNG into `frontend-main/public/wizard-mockups/`. The wizard's `PageLayoutStep` renders that PNG when present, falling back to the existing wireframe (`MiniPageSketch`) otherwise — so a layout that hasn't been captured yet never shows a broken image.

**Tech Stack:** Django management commands (backend), a self-contained Playwright Node script (`tools/wizard-mockups/`, mirroring the existing `tools/flowmap/` tool), Next.js/React (`frontend-main`).

## Global Constraints

- All commands from repo root `~/ws/projects-active/home-server/contentor`; backend tests run **inside** the container: `docker compose exec django pytest <path> -v`.
- `make lint` must pass with zero errors/warnings on files this plan touches. (Note: this repo currently has no working `frontend-main` ESLint config — `npm run lint` prompts interactively — so frontend verification in this plan uses `npm run build` inside the `nextjs-main` container instead, which does run type-checking. Do not attempt to fix the missing ESLint config as part of this plan; it's a pre-existing, unrelated gap.)
- **Deviation from the approved spec's testing section:** the spec (§5) called for an automated frontend test of `PageLayoutStep`'s image/fallback rendering. `frontend-main` has no test runner configured at all — no Jest, Vitest, or Testing Library in `package.json`, and no config file for any of them. Every existing component in this app (including every other wizard step) is verified exclusively through the `e2e/` Playwright suite, never a unit/component test. Adding a whole new test framework for one component's fallback behavior would contradict "follow existing patterns" — so Task 3 substitutes an explicit manual/visual verification step instead. This is a deliberate, scoped exception, not a general license to skip tests elsewhere in this plan.
- Commit after each task (this SDD flow is the explicitly-approved exception to the repo's "never commit unless asked" rule). Commit messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Never commit unless explicitly asked — EXCEPT within this plan's own task-by-task commits, per the point above.
- This is a dev-only tool. None of it runs in the request path of the production app; nothing here needs `@authentication_classes([])` or throttle configuration.

---

### Task 1: `seed_wizard_mockup_tenant` management command

Creates (idempotently) the hidden scratch tenant used only for mockup capture: a Tenant row, its Postgres schema, a default `TenantConfig`, an owner user, and "general"-niche demo content (courses, photos) via the same seeder real coach signups use.

**Files:**
- Create: `backend/apps/core/management/commands/seed_wizard_mockup_tenant.py`
- Modify: `backend/config/settings/base.py` (add `WIZARD_MOCKUP_TENANT_SCHEMA` setting)

**Interfaces:**
- Consumes: `apps.core.models.Tenant`/`Domain`, `apps.core.tasks._create_default_config(tenant, preferred_locale)`, `apps.core.demo.seed_template.seed_template_into_tenant(tenant, niche, *, writer=None)`, `apps.accounts.models.User`.
- Produces: `settings.WIZARD_MOCKUP_TENANT_SCHEMA` (str, default `"wizard_mockups"`) — Task 2 and the capture script (Task 4) look up the tenant by this schema name. Running `python manage.py seed_wizard_mockup_tenant` leaves a `Tenant` with that `schema_name`, `is_demo=True`, a `TenantConfig`, an owner `User`, and niche-seeded courses/photos in its schema.

This is a manually-run dev tool in the same category as the existing `seed_demo_tenant` command, which has no automated test in this codebase (heavy real-schema-creation + content-seeding commands are verified by running them and inspecting the result, not unit tests). Follow that precedent — no pytest for this task; verify by running the command and checking its output.

- [ ] **Step 1: Add the setting**

In `backend/config/settings/base.py`, find the line `WIZARD_TOKEN_EXPIRY_DAYS = 7` and add directly after it:

```python
# Schema name of the hidden scratch tenant used to capture wizard
# page-layout mockup screenshots (tools/wizard-mockups/). Never linked
# from any public page — reachable only by exact host.
WIZARD_MOCKUP_TENANT_SCHEMA = "wizard_mockups"
```

- [ ] **Step 2: Write the management command**

Create `backend/apps/core/management/commands/seed_wizard_mockup_tenant.py`:

```python
"""Create/reset the hidden scratch tenant used by tools/wizard-mockups/
to capture real-page screenshots for the signup wizard's page-layout
step. Never linked from any public page. Re-run whenever the demo
content or page templates change meaningfully; safe to re-run anytime
(tears down and recreates)."""

from django.conf import settings
from django.core.management.base import BaseCommand
from django_tenants.utils import tenant_context

from apps.accounts.models import User
from apps.core.demo.seed_template import seed_template_into_tenant
from apps.core.models import Domain, Tenant
from apps.core.tasks import _create_default_config

NICHE = "general"


class Command(BaseCommand):
    help = "Create/reset the wizard-mockups scratch tenant (screenshot capture only)."

    def handle(self, *args, **options):
        schema_name = settings.WIZARD_MOCKUP_TENANT_SCHEMA
        slug = schema_name.replace("_", "-")

        existing = Tenant.objects.filter(schema_name=schema_name).first()
        if existing is not None:
            self.stdout.write(f"Found existing '{schema_name}' tenant, tearing down...")
            Domain.objects.filter(tenant=existing).delete()
            existing.delete(force_drop=True)

        tenant = Tenant.objects.create(
            name="Wizard Mockups",
            slug=slug,
            subdomain=slug,
            schema_name=schema_name,
            owner_email="wizard-mockups@example.com",
            provisioning_status="ready",
            is_demo=True,
        )
        self.stdout.write(f"Created tenant: {tenant.name} (is_demo=True)")

        domain = f"{slug}.{settings.CONTENTOR_DOMAIN}"
        Domain.objects.create(domain=domain, tenant=tenant, is_primary=True)
        self.stdout.write(f"Created domain: {domain}")

        tenant.create_schema(check_if_exists=True, verbosity=0)
        self.stdout.write(f"Created schema: {tenant.schema_name}")

        with tenant_context(tenant):
            _create_default_config(tenant, "en")
            User.objects.create_user(
                email=tenant.owner_email,
                name="Wizard Mockups",
                role="owner",
                is_staff=True,
            )
            seed_template_into_tenant(tenant, NICHE, writer=self.stdout.write)

        self.stdout.write(self.style.SUCCESS(f"\nwizard-mockups tenant ready at: {domain}"))
```

- [ ] **Step 3: Run it and verify manually**

Run: `docker compose exec django python manage.py seed_wizard_mockup_tenant`

Expected output ends with `wizard-mockups tenant ready at: wizard-mockups.localhost` and no traceback. Then verify the tenant actually serves real content:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://wizard-mockups.localhost/
```

Expected: `200`. Re-run the same command a second time — expected: identical success output (idempotent teardown+recreate), no errors about duplicate rows.

- [ ] **Step 4: Commit**

```bash
git add backend/apps/core/management/commands/seed_wizard_mockup_tenant.py backend/config/settings/base.py
git commit -m "feat(wizard-mockups): scratch tenant for page-layout screenshot capture

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `set_wizard_mockup_layout` management command

Rewrites one page's `blocks` on the wizard-mockups tenant to a specific wizard layout choice, reusing the exact same compiler (`compose.build_config_overrides`) real coach provisioning uses — so the captured screenshot is byte-for-byte what a real coach's site would render for that choice.

**Files:**
- Create: `backend/apps/core/management/commands/set_wizard_mockup_layout.py`
- Test: `backend/apps/core/tests/test_set_wizard_mockup_layout.py`

**Interfaces:**
- Consumes: `settings.WIZARD_MOCKUP_TENANT_SCHEMA` (Task 1), `apps.core.onboarding.wizard_catalog.PAGE_LAYOUTS`, `apps.core.onboarding.compose.build_config_overrides(answers, *, brand_name, landing_sections, locale="en") -> dict` (existing function — returns `{"theme":..., "font_family":..., "navbar_config":..., "enabled_modules":..., "pages": {"home": {"blocks": [...]}, "about": {...}, ...}}`).
- Produces: `python manage.py set_wizard_mockup_layout <page> <layout_id>` — updates `TenantConfig.pages[<page>]` on the wizard-mockups tenant. Task 4's capture script shells out to this before each screenshot.

- [ ] **Step 1: Write the failing test**

Create `backend/apps/core/tests/test_set_wizard_mockup_layout.py`:

```python
"""set_wizard_mockup_layout: rewrites one page's blocks on the wizard-mockups
scratch tenant to a specific wizard layout, via the real compose pipeline."""

import pytest
from django.core.management import call_command, CommandError
from django.db import connection

from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def mockup_tenant(tenant_ctx, settings):
    """Points WIZARD_MOCKUP_TENANT_SCHEMA at the already-migrated shared test
    schema instead of creating a new one — schema creation is the most
    expensive operation in the suite (see conftest.py), and this command
    only needs a Tenant + TenantConfig to exist under that schema name, not
    a from-scratch seeded tenant."""
    settings.WIZARD_MOCKUP_TENANT_SCHEMA = connection.schema_name
    TenantConfig.objects.get_or_create(
        defaults={"brand_name": "Mockup Test", "landing_sections": {}, "pages": {}},
    )
    return connection.schema_name


def test_sets_home_story_blocks(mockup_tenant):
    call_command("set_wizard_mockup_layout", "home", "home-story")
    config = TenantConfig.objects.first()
    types = [b["type"] for b in config.pages["home"]["blocks"]]
    assert types == ["hero", "imageText", "courseGrid", "faq", "cta"]


def test_sets_home_spotlight_blocks(mockup_tenant):
    call_command("set_wizard_mockup_layout", "home", "home-spotlight")
    config = TenantConfig.objects.first()
    types = [b["type"] for b in config.pages["home"]["blocks"]]
    assert types == ["hero", "courseGrid", "testimonials", "cta"]


def test_does_not_touch_other_pages(mockup_tenant):
    call_command("set_wizard_mockup_layout", "home", "home-story")
    config = TenantConfig.objects.first()
    config.pages["about"] = {"blocks": [{"id": "sentinel", "type": "richText", "enabled": True}]}
    config.save(update_fields=["pages"])

    call_command("set_wizard_mockup_layout", "home", "home-spotlight")
    config.refresh_from_db()
    assert config.pages["about"]["blocks"][0]["id"] == "sentinel"


def test_unknown_page_errors(mockup_tenant):
    with pytest.raises(CommandError, match="Unknown page"):
        call_command("set_wizard_mockup_layout", "not-a-page", "whatever")


def test_unknown_layout_errors(mockup_tenant):
    with pytest.raises(CommandError, match="Unknown layout"):
        call_command("set_wizard_mockup_layout", "home", "not-a-layout")


def test_missing_tenant_errors(settings):
    settings.WIZARD_MOCKUP_TENANT_SCHEMA = "does_not_exist_schema"
    with pytest.raises(CommandError, match="not found"):
        call_command("set_wizard_mockup_layout", "home", "home-story")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/core/tests/test_set_wizard_mockup_layout.py -v`
Expected: FAIL — `CommandError: Unknown command: 'set_wizard_mockup_layout'`.

- [ ] **Step 3: Implement the command**

Create `backend/apps/core/management/commands/set_wizard_mockup_layout.py`:

```python
"""Rewrite one page's blocks on the wizard-mockups scratch tenant to a
specific wizard layout choice, via the real compose pipeline — used by
tools/wizard-mockups/capture.mjs before screenshotting each layout."""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django_tenants.utils import tenant_context

from apps.core.models import Tenant
from apps.core.onboarding import wizard_catalog
from apps.core.onboarding.compose import build_config_overrides


class Command(BaseCommand):
    help = "Set one page's blocks on the wizard-mockups tenant to a specific wizard layout."

    def add_arguments(self, parser):
        parser.add_argument("page", help="Page key, e.g. home")
        parser.add_argument("layout_id", help="Layout id, e.g. home-story")

    def handle(self, *args, **options):
        page = options["page"]
        layout_id = options["layout_id"]

        valid_pages = set(wizard_catalog.PAGE_LAYOUTS.keys())
        if page not in valid_pages:
            raise CommandError(f"Unknown page '{page}'. Choices: {sorted(valid_pages)}")
        valid_layouts = {o["id"] for o in wizard_catalog.PAGE_LAYOUTS[page]}
        if layout_id not in valid_layouts:
            raise CommandError(f"Unknown layout '{layout_id}' for page '{page}'. Choices: {sorted(valid_layouts)}")

        schema_name = settings.WIZARD_MOCKUP_TENANT_SCHEMA
        try:
            tenant = Tenant.objects.get(schema_name=schema_name)
        except Tenant.DoesNotExist:
            raise CommandError(
                f"wizard-mockups tenant (schema '{schema_name}') not found — run seed_wizard_mockup_tenant first."
            ) from None

        with tenant_context(tenant):
            from apps.tenant_config.models import TenantConfig

            config = TenantConfig.objects.first()
            if config is None:
                raise CommandError("wizard-mockups tenant has no TenantConfig — run seed_wizard_mockup_tenant first.")

            overrides = build_config_overrides(
                {"page_layouts": {page: layout_id}},
                brand_name=config.brand_name,
                landing_sections=config.landing_sections or {},
                locale="en",
            )
            pages = dict(config.pages or {})
            pages[page] = overrides["pages"][page]
            config.pages = pages
            config.save(update_fields=["pages"])

        self.stdout.write(self.style.SUCCESS(f"{page} -> {layout_id}"))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/core/tests/test_set_wizard_mockup_layout.py -v`
Expected: 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/management/commands/set_wizard_mockup_layout.py backend/apps/core/tests/test_set_wizard_mockup_layout.py
git commit -m "feat(wizard-mockups): set_wizard_mockup_layout command + tests

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `PageLayoutStep` renders the captured screenshot with a wireframe fallback

**Files:**
- Modify: `frontend-main/src/app/signup/verify/wizard/pages-steps.tsx`

**Interfaces:**
- Consumes: nothing new — `option.id` (e.g. `"home-story"`) is already available in `PageLayoutStep`.
- Produces: `PageLayoutStep` renders `<img src="/wizard-mockups/{option.id}.png">`; if that image 404s (not yet captured), it swaps to the existing `<MiniPageSketch>` wireframe. No new exports.

- [ ] **Step 1: Implement the image-with-fallback rendering**

Read the current `PageLayoutStep` in `frontend-main/src/app/signup/verify/wizard/pages-steps.tsx` (shown in full below for reference — this is the whole file before this change):

```tsx
"use client";

import { useTranslations } from "next-intl";

import type { WizardCatalog } from "@/lib/wizard/types";

import { MiniPageSketch } from "./previews";
import { OptionCard, SlideHeader } from "./steps";

/** Block-type sequence for a layout thumbnail, with home-page goal blocks
 * spliced in after courseGrid — mirrors backend compose ordering. */
export function thumbnailBlocks(catalog: WizardCatalog, page: string, layoutBlocks: string[], goals: string[]): string[] {
  if (page !== "home") return layoutBlocks;
  const extra: string[] = [];
  for (const gb of catalog.home_goal_blocks) {
    if (goals.includes(gb.goal) && !extra.includes(gb.type)) extra.push(gb.type);
  }
  const idx = layoutBlocks.indexOf("courseGrid");
  if (idx === -1) return [...layoutBlocks, ...extra];
  return [...layoutBlocks.slice(0, idx + 1), ...extra, ...layoutBlocks.slice(idx + 1)];
}

export function PageLayoutStep({
  catalog, page, value, onChange, theme, goals,
}: {
  catalog: WizardCatalog;
  page: string;
  value?: string;
  onChange: (layoutId: string) => void;
  theme?: string;
  goals: string[];
}) {
  const t = useTranslations("wizard");
  const options = catalog.page_layouts[page] ?? [];
  return (
    <div>
      <SlideHeader heading={t(`pages.titles.${page}`)} subhead={t("pages.subhead")} />
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        {options.map((option, i) => (
          <OptionCard
            key={option.id}
            selected={value === option.id}
            onSelect={() => onChange(option.id)}
            title={t(`layouts.${option.id}`)}
            badge={i === 0 ? t("common.recommended") : undefined}
          >
            <MiniPageSketch blocks={thumbnailBlocks(catalog, page, option.blocks, goals)} theme={theme} />
          </OptionCard>
        ))}
      </div>
    </div>
  );
}
```

Replace the whole file with:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import type { WizardCatalog } from "@/lib/wizard/types";

import { MiniPageSketch } from "./previews";
import { OptionCard, SlideHeader } from "./steps";

/** Block-type sequence for a layout thumbnail, with home-page goal blocks
 * spliced in after courseGrid — mirrors backend compose ordering. */
export function thumbnailBlocks(catalog: WizardCatalog, page: string, layoutBlocks: string[], goals: string[]): string[] {
  if (page !== "home") return layoutBlocks;
  const extra: string[] = [];
  for (const gb of catalog.home_goal_blocks) {
    if (goals.includes(gb.goal) && !extra.includes(gb.type)) extra.push(gb.type);
  }
  const idx = layoutBlocks.indexOf("courseGrid");
  if (idx === -1) return [...layoutBlocks, ...extra];
  return [...layoutBlocks.slice(0, idx + 1), ...extra, ...layoutBlocks.slice(idx + 1)];
}

/** Real screenshot (tools/wizard-mockups/capture.mjs) when one has been
 * captured for this layout id, falling back to the abstract wireframe
 * otherwise — so a layout added to the catalog before its screenshot
 * exists never shows a broken image. */
function LayoutThumbnail({
  layoutId, blocks, theme, title,
}: {
  layoutId: string;
  blocks: string[];
  theme?: string;
  title: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  if (imageFailed) return <MiniPageSketch blocks={blocks} theme={theme} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static asset, no next/image loader needed
    <img
      src={`/wizard-mockups/${layoutId}.png`}
      alt={title}
      className="w-full rounded-lg object-cover"
      onError={() => setImageFailed(true)}
    />
  );
}

export function PageLayoutStep({
  catalog, page, value, onChange, theme, goals,
}: {
  catalog: WizardCatalog;
  page: string;
  value?: string;
  onChange: (layoutId: string) => void;
  theme?: string;
  goals: string[];
}) {
  const t = useTranslations("wizard");
  const options = catalog.page_layouts[page] ?? [];
  return (
    <div>
      <SlideHeader heading={t(`pages.titles.${page}`)} subhead={t("pages.subhead")} />
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        {options.map((option, i) => (
          <OptionCard
            key={option.id}
            selected={value === option.id}
            onSelect={() => onChange(option.id)}
            title={t(`layouts.${option.id}`)}
            badge={i === 0 ? t("common.recommended") : undefined}
          >
            <LayoutThumbnail
              layoutId={option.id}
              blocks={thumbnailBlocks(catalog, page, option.blocks, goals)}
              theme={theme}
              title={t(`layouts.${option.id}`)}
            />
          </OptionCard>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the fallback path (no screenshots captured yet)**

No PNGs exist in `frontend-main/public/wizard-mockups/` yet (Task 4 creates them), so every `<img>` will 404 and every card must show the wireframe — i.e., this step must look and behave identically to before this task. Confirm:

```bash
docker compose restart nextjs-main
```

Then walk the wizard in a browser to the "Your pages" step (`http://localhost/signup` → sign up → verify link from `curl -s "http://localhost/api/v1/dev/emails/latest/?to=<the email you used>"` → click through niche/describe/goals/colors/font/navbar/hero to the "Home page" step). Expected: the Spotlight/Storyteller cards render the same abstract wireframe bars as before — no broken-image icons, no layout shift/flicker.

- [ ] **Step 3: Build check**

Run: `docker compose exec nextjs-main npm run build`
Expected: `✓ Compiled successfully`, zero type errors.

- [ ] **Step 4: Commit**

```bash
git add frontend-main/src/app/signup/verify/wizard/pages-steps.tsx
git commit -m "feat(wizard): PageLayoutStep renders captured screenshots with wireframe fallback

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Capture script + Makefile target + run it for real

**Files:**
- Create: `tools/wizard-mockups/package.json`
- Create: `tools/wizard-mockups/capture.mjs`
- Modify: `Makefile` (add `capture-wizard-mockups` target)
- Create (generated, not hand-written): `frontend-main/public/wizard-mockups/*.png` (12 files)

**Interfaces:**
- Consumes: `set_wizard_mockup_layout` (Task 2, invoked via `docker compose exec`), `wizard-mockups.localhost` (Task 1's tenant, reachable via the dev Caddy catch-all the same way any other tenant subdomain is in dev).
- Produces: 12 PNGs at `frontend-main/public/wizard-mockups/<layout_id>.png`, one per entry in the list below. Task 3 consumes these by filename.

- [ ] **Step 1: Create the tool's package.json**

Create `tools/wizard-mockups/package.json`:

```json
{
  "name": "wizard-mockups",
  "private": true,
  "type": "module",
  "scripts": {
    "capture": "node capture.mjs"
  },
  "dependencies": {
    "playwright": "^1.48.0"
  }
}
```

- [ ] **Step 2: Write the capture script**

Create `tools/wizard-mockups/capture.mjs`:

```js
// Captures one real screenshot per wizard page-layout option, from the
// hidden wizard-mockups scratch tenant (seed_wizard_mockup_tenant), and
// saves downscaled PNGs into frontend-main/public/wizard-mockups/. Manual
// dev tool — re-run whenever demo content or page templates change.
//
// Prereqs: dev stack up (`make dev`), scratch tenant seeded
// (`docker compose exec django python manage.py seed_wizard_mockup_tenant`).
//
// Usage: npm run capture   (from tools/wizard-mockups/)

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "..", "frontend-main", "public", "wizard-mockups");
const HOST = "wizard-mockups.localhost";
const VIEWPORT = { width: 1280, height: 960 };
const OUTPUT_WIDTH = 800; // downscaled width; height follows viewport aspect ratio

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
];

function setLayout(page, layoutId) {
  execFileSync(
    "docker",
    ["compose", "exec", "-T", "django", "python", "manage.py", "set_wizard_mockup_layout", page, layoutId],
    { cwd: join(__dirname, "..", ".."), stdio: "inherit" },
  );
}

/** Downscale via an in-page canvas (no native image dependency — same
 * approach as tools/flowmap/crawler/thumbnail.js). */
async function downscale(page, pngBuffer, targetWidth) {
  const b64 = pngBuffer.toString("base64");
  const dataUrl = await page.evaluate(
    async ({ src, targetWidth }) => {
      const img = new Image();
      img.src = "data:image/png;base64," + src;
      await img.decode();
      const scale = Math.min(1, targetWidth / img.naturalWidth);
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL("image/png");
    },
    { src: b64, targetWidth },
  );
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  for (const { page: pageKey, id, path } of LAYOUTS) {
    console.log(`${id} ...`);
    setLayout(pageKey, id);
    await page.goto(`http://${HOST}${path}`, { waitUntil: "networkidle", timeout: 30000 });
    // Hide Next.js's dev-only overlay, same as tools/flowmap/crawler/capture.js.
    await page.addStyleTag({ content: "nextjs-portal{display:none !important}" }).catch(() => {});
    const png = await page.screenshot({ fullPage: false });
    const downscaled = await downscale(page, png, OUTPUT_WIDTH);
    writeFileSync(join(OUT_DIR, `${id}.png`), downscaled);
    console.log(`  -> ${id}.png`);
  }

  await browser.close();
  console.log(`\nDone. ${LAYOUTS.length} screenshots written to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Add the Makefile target**

In `Makefile`, find the `seed-demo-assets:` target and add directly after its recipe block (before the next `##`-commented target):

```makefile
capture-wizard-mockups: ## Capture real-page screenshots for the wizard's page-layout step (needs make dev running)
	docker compose exec django python manage.py seed_wizard_mockup_tenant
	cd tools/wizard-mockups && npm install --silent && npx playwright install chromium && npm run capture
```

- [ ] **Step 4: Run it for real**

Run: `make capture-wizard-mockups`

Expected: 12 lines of `<layout-id> ...` / `  -> <layout-id>.png`, ending with `Done. 12 screenshots written to .../frontend-main/public/wizard-mockups`. Verify the files exist and are non-trivial in size:

```bash
ls -la frontend-main/public/wizard-mockups/
```

Expected: 12 `.png` files, each at least a few KB (a blank/broken capture would be near-zero bytes).

- [ ] **Step 5: Visual verification — real screenshots now render in the wizard**

```bash
docker compose restart nextjs-main
```

Walk the wizard again to the "Home page" step (same path as Task 3 Step 2). Expected: the Spotlight and Storyteller cards now show real screenshots of the wizard-mockups tenant's home page — visibly different from each other (real photos, real text, different block arrangement), not the abstract wireframe bars. Check one more page (e.g. "Your pages" → courses) to confirm the pattern holds across pages, not just home.

- [ ] **Step 6: Commit**

```bash
git add tools/wizard-mockups/package.json tools/wizard-mockups/capture.mjs Makefile frontend-main/public/wizard-mockups/
git commit -m "feat(wizard-mockups): capture script + Makefile target + captured screenshots

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Post-plan follow-up (not part of this plan)

- `tools/wizard-mockups/node_modules` and `package-lock.json` will be created by `npm install` in Task 4 Step 4 — add `tools/wizard-mockups/node_modules/` to `.gitignore` if it isn't already covered by a repo-wide `node_modules/` ignore rule (check before committing Task 4; do not commit `node_modules`).
- If a 13th page-layout option is ever added to `wizard_catalog.PAGE_LAYOUTS`, add its entry to `capture.mjs`'s `LAYOUTS` array and re-run `make capture-wizard-mockups` — until then, `PageLayoutStep`'s fallback (Task 3) means it degrades to the wireframe automatically, never a broken image.

## Execution notes (discovered while running Task 4, not anticipated in the design)

The first capture run produced 12 files with every layout pair byte-identical — the layout change was never visible in the screenshot. Root cause was two independent caching layers, neither related to the browser:

1. `apps/tenant_config/views.py`'s `TenantConfigView.get_object()` caches the `TenantConfig` instance for 5 minutes, keyed `tenant:<schema>:config`, invalidated only in `perform_update()` (the DRF PATCH path). `set_wizard_mockup_layout` writes via the ORM directly, so it never hit that invalidation — every capture after the first silently got the previous layout's cached response for up to 5 minutes. Fixed by having the command call `cache.delete(f"tenant:{schema_name}:config")` after saving.
2. `frontend-customer/src/lib/tenant.ts`'s `fetchTenantConfig()` keeps its own separate 60-second in-memory cache keyed by request domain, independent of both Next.js's and Django's caching. Capturing two layouts back-to-back on the same domain hit this too. Fixed by giving the scratch tenant one extra `Domain` row per layout id (`wm-<layout-id>.<CONTENTOR_DOMAIN>`) in `seed_wizard_mockup_tenant`, so each capture has its own cache key.

Both fixes are implemented in the actual `seed_wizard_mockup_tenant.py` / `set_wizard_mockup_layout.py` committed for Tasks 1–2 (this file's Task 1/2 code blocks above reflect the original pre-discovery design, not the final committed code — see those files directly for the current implementation). Also added: `seed_wizard_mockup_tenant` publishes all seeded courses (they default to draft, correct for a real coach's fresh signup, but this tenant only exists to look finished in screenshots).

If this tool is ever extended (e.g., a 13th layout, a different niche), watch for both caches again — neither is visible from the browser or from `curl` run in isolation with pauses between requests (which is why the first diagnostic curl test misleadingly looked fine).
