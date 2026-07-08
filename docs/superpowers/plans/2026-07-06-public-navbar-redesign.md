# Public Navbar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the coach's public site navbar represent the app's real capabilities (events, store) with truthful template seeds, a new /events listing page, 5 layout presets + a transparent-over-hero modifier, and a more convenient navbar builder tab.

**Architecture:** Config-driven single header — `navbar_config` (existing JSONField on TenantConfig) gains `layout`, `transparent_over_hero`, `show_install`; one `PublicHeader` component renders all presets. New `/events` page reuses the existing `/api/v1/calendar/` API (no new backend endpoint). Seeds change only at provision/demo-seed time; existing tenants untouched.

**Tech Stack:** Django 5.1 + DRF (serializer validation), Next.js 14 App Router + Tailwind + lucide-react (frontend-customer), Playwright (e2e/ suite), pytest (backend).

**Spec:** `docs/superpowers/specs/2026-07-06-public-navbar-redesign-design.md` (approved 2026-07-06).

## Global Constraints

- Layout enum, exact: `classic | centered | split | minimal | pill`. Missing/unknown renders as `classic`.
- Template layout assignments, fixed: yoga → centered, pilates → split, makeup → pill, face_yoga → minimal, pole_dance → pill, fitness → classic, belly_dance → centered, general → classic.
- All 8 demo templates seed downloads → all get a `Store → /store` link. No template may keep the label "Programs".
- `transparent_over_hero` activates ONLY on the home page (`/`) and never with layout `pill`.
- New UI strings are hardcoded English (matches the public-surface + edit-sidebar convention; see spec §6 correction). Coach link labels are tenant data.
- Theme colors in any new inline styling: use `var(--token)` directly, NEVER `hsl(var(--token))` (oklch tokens).
- Dev commands run against the running dev stack (`make dev`). Backend tests: `docker compose exec -T django pytest <path> -v`. Frontend typecheck: `cd frontend-customer && npx tsc --noEmit`. E2e: `make e2e` (or a single spec via `cd e2e && npx playwright test specs/<file> --reporter=line`).
- SHARED WORKING TREE: other agents may move HEAD. Before EVERY commit: `git status -sb` and confirm you are on `feat/public-navbar` and staging only your files. Never push.
- Never commit unless the step says commit; pre-commit must pass.

---

### Task 0: Branch

- [ ] **Step 1: Verify clean base and create branch**

```bash
cd ~/ws/projects-active/home-server/contentor
git status -sb        # confirm current branch is main and tree is clean (docs/ changes from planning may exist — leave them unstaged, they are NOT part of this branch)
git rev-parse --short HEAD   # record base commit in progress ledger
git checkout -b feat/public-navbar
```

Expected: on `feat/public-navbar`, base = current main HEAD (`37b70ae` or later).

---

### Task 1: Backend — `validate_navbar_config` (validation + sanitation) and setup-status regression

**Files:**
- Modify: `backend/apps/tenant_config/serializers.py` (add module constant + helper near `_UNSAFE_URL_PREFIXES` at ~line 20; add `validate_navbar_config` method inside `TenantConfigSerializer` next to `validate_theme`)
- Test: `backend/apps/tenant_config/tests/test_navbar_config.py` (new)

**Interfaces:**
- Consumes: existing `_UNSAFE_URL_PREFIXES` tuple in `serializers.py`; existing PATCH endpoint `/api/v1/admin/config/` (`TenantConfigView`); test fixtures pattern from `backend/apps/tenant_config/tests/test_setup_status.py` (`tenant_ctx` conftest fixture, `coach`/`client`/`config` local fixtures, `HOST = "shared-test.localhost"`).
- Produces: persisted `navbar_config` shape that Tasks 2/5 rely on: `{links: [{label, href}], cta: {text, href}|null, show_login: bool, show_install: bool, transparent_over_hero: bool, layout: str}`.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/tenant_config/tests/test_navbar_config.py`:

```python
"""navbar_config serializer validation: layout enum, flag coercion, unsafe-href
stripping, and the guarantee that navbar-only edits never flip pages_edited."""

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="coach@x.com",
        name="Coach",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )


@pytest.fixture()
def client(coach):
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=coach)
    return c


@pytest.fixture()
def config(tenant_ctx):
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
    cfg.setup_progress = {}
    cfg.navbar_config = {"links": [], "cta": None, "show_login": True}
    cfg.save()
    return cfg


def _patch_navbar(client, payload):
    return client.patch("/api/v1/admin/config/", {"navbar_config": payload}, format="json")


def _nav(config):
    config.refresh_from_db()
    return config.navbar_config


def test_valid_layout_persists(client, config):
    resp = _patch_navbar(client, {"links": [], "cta": None, "show_login": True, "layout": "pill"})
    assert resp.status_code == 200, resp.content
    assert _nav(config)["layout"] == "pill"


def test_missing_layout_defaults_to_classic(client, config):
    resp = _patch_navbar(client, {"links": [], "cta": None, "show_login": True})
    assert resp.status_code == 200, resp.content
    assert _nav(config)["layout"] == "classic"


def test_invalid_layout_rejected(client, config):
    resp = _patch_navbar(client, {"links": [], "cta": None, "show_login": True, "layout": "mega"})
    assert resp.status_code == 400
    assert "layout" in str(resp.content)


def test_non_dict_rejected(client, config):
    resp = _patch_navbar(client, ["not", "a", "dict"])
    assert resp.status_code == 400


def test_unsafe_hrefs_stripped(client, config):
    resp = _patch_navbar(
        client,
        {
            "links": [{"label": "Evil", "href": "javascript:alert(1)"}],
            "cta": {"text": "Go", "href": " VBSCRIPT:bad"},
            "show_login": True,
        },
    )
    assert resp.status_code == 200, resp.content
    nav = _nav(config)
    assert nav["links"][0]["href"] == ""
    assert nav["cta"]["href"] == ""


def test_flags_coerced_and_defaulted(client, config):
    resp = _patch_navbar(
        client,
        {"links": [], "cta": None, "show_login": 1, "transparent_over_hero": 1},
    )
    assert resp.status_code == 200, resp.content
    nav = _nav(config)
    assert nav["show_login"] is True
    assert nav["transparent_over_hero"] is True
    assert nav["show_install"] is True  # defaulted


def test_link_label_capped_and_junk_links_dropped(client, config):
    resp = _patch_navbar(
        client,
        {"links": [{"label": "x" * 200, "href": "/courses"}, "junk", 42], "cta": None, "show_login": True},
    )
    assert resp.status_code == 200, resp.content
    nav = _nav(config)
    assert len(nav["links"]) == 1
    assert len(nav["links"][0]["label"]) == 80


def test_navbar_edit_does_not_flip_pages_edited(client, config):
    resp = _patch_navbar(
        client,
        {"links": [{"label": "Events", "href": "/events"}], "cta": None, "show_login": True, "layout": "centered"},
    )
    assert resp.status_code == 200, resp.content
    config.refresh_from_db()
    assert config.setup_progress.get("pages_edited", []) == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_navbar_config.py -v`
Expected: `test_valid_layout_persists` may pass (JSONField accepts anything), but `test_invalid_layout_rejected`, `test_non_dict_rejected`, `test_unsafe_hrefs_stripped`, `test_flags_coerced_and_defaulted`, `test_link_label_capped_and_junk_links_dropped`, `test_missing_layout_defaults_to_classic` FAIL (no validation exists).

- [ ] **Step 3: Implement `validate_navbar_config`**

In `backend/apps/tenant_config/serializers.py`, directly below the `_UNSAFE_URL_PREFIXES` definition, add:

```python
# Navbar layout presets the public header can render.
_NAVBAR_LAYOUTS = {"classic", "centered", "split", "minimal", "pill"}


def _clean_nav_href(href):
    href = str(href or "")
    if href.strip().lower().startswith(_UNSAFE_URL_PREFIXES):
        return ""
    return href[:300]
```

Inside `TenantConfigSerializer`, after `validate_theme`, add:

```python
    def validate_navbar_config(self, value):
        """Shape the navbar payload: layout enum, capped link/cta strings,
        unsafe URL schemes stripped, booleans coerced. Same defence-in-depth
        the serializer applies to ``pages``.
        """
        if not isinstance(value, dict):
            raise serializers.ValidationError("navbar_config must be an object.")
        cleaned = dict(value)
        layout = cleaned.get("layout") or "classic"
        if layout not in _NAVBAR_LAYOUTS:
            raise serializers.ValidationError(
                "layout must be one of: " + ", ".join(sorted(_NAVBAR_LAYOUTS)) + "."
            )
        cleaned["layout"] = layout
        links = []
        for raw in (cleaned.get("links") or [])[:20]:
            if not isinstance(raw, dict):
                continue
            links.append(
                {"label": str(raw.get("label") or "")[:80], "href": _clean_nav_href(raw.get("href"))}
            )
        cleaned["links"] = links
        cta = cleaned.get("cta")
        if isinstance(cta, dict):
            cleaned["cta"] = {"text": str(cta.get("text") or "")[:80], "href": _clean_nav_href(cta.get("href"))}
        else:
            cleaned["cta"] = None
        cleaned["show_login"] = bool(cleaned.get("show_login", True))
        cleaned["show_install"] = bool(cleaned.get("show_install", True))
        cleaned["transparent_over_hero"] = bool(cleaned.get("transparent_over_hero", False))
        return cleaned
```

- [ ] **Step 4: Run the new tests — all pass**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_navbar_config.py -v`
Expected: 8 passed.

- [ ] **Step 5: Run the whole tenant_config + core suites (no regressions)**

Run: `docker compose exec -T django pytest apps/tenant_config apps/core -q`
Expected: all pass (baseline before this task: all green).

- [ ] **Step 6: Commit**

```bash
git status -sb   # confirm feat/public-navbar
git add backend/apps/tenant_config/serializers.py backend/apps/tenant_config/tests/test_navbar_config.py
git commit -m "feat(navbar): validate + sanitize navbar_config (layout enum, unsafe hrefs, flag coercion)"
```

---

### Task 2: Frontend — NavbarConfig types + PublicHeader with 5 presets and transparent-over-hero

**Files:**
- Modify: `frontend-customer/src/types/tenant.ts:6-10` (NavbarConfig)
- Rewrite: `frontend-customer/src/components/shared/public-header.tsx`

**Interfaces:**
- Consumes: `useTenant()` (`config.navbar_config`, `config.logo_url`, `config.brand_name`, `config.dark_mode_enabled`), `User` type, existing `ThemeToggle`/`AnnouncementBell` components.
- Produces: `<header data-nav-layout={layout}>` attribute (Task 5's e2e asserts on it); `NavbarLayout` type export from `@/types/tenant` (Tasks 4/5 import it); fallback links constant `Courses/-Events/-About` (Task 4 aligns seeds with it).

- [ ] **Step 1: Extend the types**

In `frontend-customer/src/types/tenant.ts`, replace the `NavbarConfig` interface (lines 6–10) with:

```ts
export type NavbarLayout = "classic" | "centered" | "split" | "minimal" | "pill";

export interface NavbarConfig {
  links: NavLink[];
  cta: { text: string; href: string } | null;
  show_login: boolean;
  /** Desktop arrangement preset. Missing/unknown renders as "classic". */
  layout?: NavbarLayout;
  /** Transparent over the home-page hero, solid on scroll. Ignored for "pill". */
  transparent_over_hero?: boolean;
  /** Show the "Install app" link (default true). */
  show_install?: boolean;
}
```

- [ ] **Step 2: Rewrite `public-header.tsx`**

Replace the file's entire contents with:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { useTenant } from "@/hooks/use-tenant";
import { BookOpen, LogOut, Menu, User as UserIcon, X, Zap } from "lucide-react";
import type { User } from "@/types/auth";
import type { NavLink as NavLinkType, NavbarLayout, TenantConfig } from "@/types/tenant";
import AnnouncementBell from "@/components/shared/announcement-bell";

const VALID_LAYOUTS: ReadonlySet<string> = new Set([
  "classic",
  "centered",
  "split",
  "minimal",
  "pill",
]);

const FALLBACK_LINKS: NavLinkType[] = [
  { label: "Courses", href: "/courses" },
  { label: "Events", href: "/events" },
  { label: "About", href: "/about" },
];

const SIGNED_IN_HIDDEN = new Set(["/about", "/faq"]);

function Brand({ config }: { config: TenantConfig | null }) {
  return (
    <Link href="/" className="flex items-center gap-2 text-lg font-bold">
      {config?.logo_url ? (
        <img src={config.logo_url} alt={config.brand_name} className="h-8 w-auto" />
      ) : (
        <BookOpen className="h-5 w-5 text-primary" />
      )}
      <span className="font-display">{config?.brand_name || "Welcome"}</span>
    </Link>
  );
}

function DesktopLinks({
  links,
  showInstall,
  className = "",
}: {
  links: NavLinkType[];
  showInstall: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-6 ${className}`}>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {link.label}
        </Link>
      ))}
      {showInstall && (
        <Link
          href="/install"
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Install app
        </Link>
      )}
    </div>
  );
}

function AuthCluster({
  user,
  hasSubscription,
  showLogin,
  cta,
  compact,
  allowDarkMode,
  signingOut,
  onSignOut,
  dashboardHref,
}: {
  user?: User | null;
  hasSubscription?: boolean;
  showLogin: boolean;
  cta: { text: string; href: string } | null;
  compact?: boolean;
  allowDarkMode: boolean;
  signingOut: boolean;
  onSignOut: () => void;
  dashboardHref: string;
}) {
  return (
    <div className="flex items-center gap-3">
      {allowDarkMode && <ThemeToggle compact className="shrink-0" />}
      {user ? (
        <>
          <Link
            href={dashboardHref}
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {user.role === "owner" || user.role === "coach" ? "Admin" : "Dashboard"}
          </Link>
          <AnnouncementBell />
          {!compact && (
            <span className="text-sm text-muted-foreground">{user.name || user.email}</span>
          )}
          <Button
            asChild
            size="sm"
            variant={hasSubscription ? "outline" : "default"}
            className="gap-1.5"
          >
            <Link href="/plans" title={hasSubscription ? "Plans" : "Subscribe"}>
              <Zap className="h-4 w-4" />
              {!compact && (hasSubscription ? "Plans" : "Subscribe")}
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onSignOut}
            disabled={signingOut}
            className="gap-1.5"
            title="Sign Out"
          >
            <LogOut className="h-4 w-4" />
            {!compact && "Sign Out"}
          </Button>
        </>
      ) : (
        <div className="flex items-center gap-2">
          {showLogin && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Sign In</Link>
            </Button>
          )}
          {cta && (
            <Button asChild size="sm">
              <Link href={cta.href}>{cta.text}</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function PublicHeader({
  user,
  hasSubscription,
}: {
  user?: User | null;
  hasSubscription?: boolean;
}) {
  const config = useTenant();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const navbar = config?.navbar_config;
  const layout: NavbarLayout =
    navbar?.layout && VALID_LAYOUTS.has(navbar.layout) ? navbar.layout : "classic";
  const showInstall = navbar?.show_install !== false;
  const transparent =
    navbar?.transparent_over_hero === true && layout !== "pill" && pathname === "/";

  const allNavLinks = navbar?.links?.length ? navbar.links : FALLBACK_LINKS;
  const navLinks = user
    ? allNavLinks.filter((link) => !SIGNED_IN_HIDDEN.has(link.href))
    : allNavLinks;
  const showLogin = navbar?.show_login !== false;
  const cta = navbar?.cta ?? null;
  const allowDarkMode = config?.dark_mode_enabled !== false;

  useEffect(() => {
    if (!transparent) return;
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [transparent]);

  const handleSignOut = async () => {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login?toast=You've+been+logged+out&toast_type=info");
    router.refresh();
  };

  const dashboardHref =
    user?.role === "owner" || user?.role === "coach" ? "/admin" : "/dashboard";

  const authProps = {
    user,
    hasSubscription,
    showLogin,
    cta,
    allowDarkMode,
    signingOut,
    onSignOut: handleSignOut,
    dashboardHref,
  };

  // Hamburger is mobile-only for every preset except minimal (always visible).
  const burgerCls =
    layout === "minimal"
      ? "inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      : "inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden";
  const menuPanelCls =
    layout === "minimal"
      ? "border-t bg-background px-4 py-4"
      : "border-t bg-background px-4 py-4 md:hidden";

  const burger = (
    <button
      className={burgerCls}
      onClick={() => setMobileOpen(!mobileOpen)}
      aria-label="Toggle navigation"
    >
      {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
    </button>
  );

  const menuPanel = mobileOpen && (
    <div className={menuPanelCls}>
      <nav className="flex flex-col gap-3">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setMobileOpen(false)}
          >
            {link.label}
          </Link>
        ))}
        {showInstall && (
          <Link
            href="/install"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setMobileOpen(false)}
          >
            Install app
          </Link>
        )}
        {user ? (
          <>
            <Link
              href={dashboardHref}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setMobileOpen(false)}
            >
              {user.role === "owner" || user.role === "coach" ? "Admin" : "Dashboard"}
            </Link>
            <Button
              asChild
              size="sm"
              variant={hasSubscription ? "outline" : "default"}
              className="w-full gap-1.5"
            >
              <Link href="/plans" onClick={() => setMobileOpen(false)}>
                <Zap className="h-4 w-4" />
                {hasSubscription ? "Plans" : "Subscribe"}
              </Link>
            </Button>
            <div className="flex items-center gap-2 border-t pt-3">
              <UserIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{user.name || user.email}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              disabled={signingOut}
              className="w-full justify-start gap-1.5"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            {showLogin && (
              <Button asChild variant="ghost" size="sm" className="w-full">
                <Link href="/login" onClick={() => setMobileOpen(false)}>
                  Sign In
                </Link>
              </Button>
            )}
            {cta && (
              <Button asChild size="sm" className="w-full">
                <Link href={cta.href} onClick={() => setMobileOpen(false)}>
                  {cta.text}
                </Link>
              </Button>
            )}
          </div>
        )}
        {allowDarkMode && <ThemeToggle className="justify-start" />}
      </nav>
    </div>
  );

  // ── Pill: fixed floating capsule + spacer ─────────────────────────────────
  if (layout === "pill") {
    return (
      <>
        <header
          data-nav-layout="pill"
          className="fixed inset-x-0 top-3 z-50 px-4 pt-safe pointer-events-none"
        >
          <div className="pointer-events-auto mx-auto flex h-14 max-w-4xl items-center justify-between gap-4 rounded-full border border-primary/10 bg-background/75 px-5 shadow-lg backdrop-blur-md">
            <Brand config={config} />
            <nav className="hidden items-center gap-5 md:flex">
              <DesktopLinks links={navLinks} showInstall={showInstall} className="gap-5" />
              <AuthCluster {...authProps} compact />
            </nav>
            {burger}
          </div>
          <div className="pointer-events-auto mx-auto mt-1 max-w-4xl overflow-hidden rounded-2xl border bg-background shadow-lg empty:hidden">
            {menuPanel}
          </div>
        </header>
        {/* Spacer so page content clears the floating pill */}
        <div className="h-20" aria-hidden="true" />
      </>
    );
  }

  // ── All other presets share the header shell ──────────────────────────────
  const shellCls = transparent && !scrolled
    ? "absolute inset-x-0 top-0 z-50 border-b border-transparent bg-transparent pt-safe"
    : "sticky top-0 z-50 border-b border-primary/10 bg-background/80 backdrop-blur-md pt-safe";

  return (
    <header data-nav-layout={layout} className={`${shellCls} transition-colors duration-200`}>
      {layout === "centered" ? (
        <div className="mx-auto max-w-7xl px-4">
          <div className="grid h-14 grid-cols-[1fr_auto_1fr] items-center">
            <div />
            <Brand config={config} />
            <div className="hidden justify-end md:flex">
              <AuthCluster {...authProps} compact />
            </div>
            <div className="col-start-3 flex justify-end md:hidden">{burger}</div>
          </div>
          <nav className="hidden h-10 items-center justify-center md:flex">
            <DesktopLinks links={navLinks} showInstall={showInstall} />
          </nav>
        </div>
      ) : layout === "split" ? (
        <div className="mx-auto grid h-16 max-w-7xl grid-cols-[1fr_auto_1fr] items-center px-4">
          <nav className="hidden md:block">
            <DesktopLinks
              links={navLinks.slice(0, Math.ceil(navLinks.length / 2))}
              showInstall={false}
            />
          </nav>
          <div className="md:justify-self-center">
            <Brand config={config} />
          </div>
          <nav className="hidden items-center justify-end gap-6 md:flex">
            <DesktopLinks
              links={navLinks.slice(Math.ceil(navLinks.length / 2))}
              showInstall={showInstall}
            />
            <AuthCluster {...authProps} compact />
          </nav>
          <div className="flex justify-end md:hidden">{burger}</div>
        </div>
      ) : layout === "minimal" ? (
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <Brand config={config} />
          <div className="flex items-center gap-2">
            {!user && cta && (
              <Button asChild size="sm">
                <Link href={cta.href}>{cta.text}</Link>
              </Button>
            )}
            {burger}
          </div>
        </div>
      ) : (
        /* classic — today's layout */
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <Brand config={config} />
          <nav className="hidden items-center gap-6 md:flex">
            <DesktopLinks links={navLinks} showInstall={showInstall} />
            <AuthCluster {...authProps} />
          </nav>
          {burger}
        </div>
      )}
      {menuPanel}
    </header>
  );
}
```

Behavior notes locked in by this code (do not "improve" them away):
- `classic` reproduces the current header (flat links, full auth cluster, mobile hamburger).
- `minimal` funnels ALL navigation through the burger menu at every breakpoint; only CTA stays visible for signed-out visitors.
- `split` puts Install-app + compact auth on the right half; left half is links-only.
- Signed-in visitors still hide `/about` + `/faq` links (unchanged `SIGNED_IN_HIDDEN`).
- The transparent shell only ever applies on `/` (pathname check), never for pill.

- [ ] **Step 3: Typecheck + build**

Run: `cd frontend-customer && npx tsc --noEmit`
Expected: clean. If `TenantConfig` import is flagged unused, keep it — `Brand` uses it.

- [ ] **Step 4: Manual smoke on the dev stack**

Run: `curl -s http://demo-yoga.localhost/ | grep -o 'data-nav-layout="[a-z]*"'`
Expected: `data-nav-layout="classic"` (demo tenants have no `layout` key yet — fallback works).

- [ ] **Step 5: Commit**

```bash
git status -sb
git add frontend-customer/src/types/tenant.ts frontend-customer/src/components/shared/public-header.tsx
git commit -m "feat(navbar): 5 layout presets + transparent-over-hero + show_install in PublicHeader"
```

---

### Task 3: Public /events page + calendar cross-links + e2e

**Files:**
- Create: `frontend-customer/src/app/(public)/events/page.tsx`
- Create: `frontend-customer/src/components/public/events/events-list.tsx`
- Modify: `frontend-customer/src/app/(public)/calendar/page.tsx` (header row: add "List view" link)
- Test: `e2e/specs/13-events-page.spec.ts` (new)

**Interfaces:**
- Consumes: `GET /api/v1/calendar/?from=YYYY-MM-DD&to=YYYY-MM-DD` returning `CalendarEvent[]` (`type`, `title`, `pricing_type`, `price`, `scheduled_at`, `location`, `thumbnail_signed_url`); `formatTime(dateStr, tz)` + `formatDateHeader(dateStr)` from `@/lib/calendar-utils`; `getAuthUser()` from `@/lib/auth`; detail routes `/calendar/[type]/[id]` (existing).
- Produces: route `/events` that Task 4's seeds and Task 5's link picker + suggestion chips point at.

- [ ] **Step 1: Create the events list component**

`frontend-customer/src/components/public/events/events-list.tsx`:

```tsx
"use client";

import Link from "next/link";
import { CalendarDays, MapPin, Radio, Video } from "lucide-react";
import { useTenant } from "@/hooks/use-tenant";
import { formatDateHeader, formatTime } from "@/lib/calendar-utils";
import type { CalendarEvent, CalendarEventType } from "@/types/live";

const TYPE_META: Record<
  CalendarEventType,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  live_class: { label: "Live class", icon: Video },
  live_stream: { label: "Livestream", icon: Radio },
  zoom_class: { label: "Zoom", icon: Video },
  onsite_event: { label: "In person", icon: MapPin },
};

export function EventsList({
  events,
  isCoach,
}: {
  events: CalendarEvent[];
  isCoach: boolean;
}) {
  const config = useTenant();
  const tz = config?.timezone || "UTC";

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
        <CalendarDays className="h-8 w-8 text-muted-foreground" />
        <p className="text-muted-foreground">No upcoming events scheduled.</p>
        {isCoach && (
          <Link href="/admin/live" className="text-sm font-medium text-primary hover:underline">
            Schedule your first live class →
          </Link>
        )}
      </div>
    );
  }

  // Group by calendar date (UTC date key of scheduled_at — matches the
  // shape formatDateHeader expects).
  const groups = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = event.scheduled_at.slice(0, 10);
    const list = groups.get(key) ?? [];
    list.push(event);
    groups.set(key, list);
  }

  return (
    <div className="space-y-8">
      {[...groups.entries()].map(([dateKey, dayEvents]) => (
        <section key={dateKey}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {formatDateHeader(dateKey)}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {dayEvents.map((event) => {
              const meta = TYPE_META[event.type];
              return (
                <Link
                  key={`${event.type}-${event.id}`}
                  href={`/calendar/${event.type}/${event.id}`}
                  className="group overflow-hidden rounded-xl border transition-shadow hover:shadow-md"
                >
                  {event.thumbnail_signed_url ? (
                    <img
                      src={event.thumbnail_signed_url}
                      alt=""
                      className="h-36 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-36 w-full items-center justify-center bg-muted">
                      <meta.icon className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="space-y-2 p-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 font-medium text-accent-foreground">
                        <meta.icon className="h-3 w-3" />
                        {meta.label}
                      </span>
                      <span>{formatTime(event.scheduled_at, tz)}</span>
                      <span className="ml-auto font-medium text-foreground">
                        {event.pricing_type === "paid" ? `$${event.price}` : "Free"}
                      </span>
                    </div>
                    <h3 className="font-medium leading-snug group-hover:text-primary">
                      {event.title}
                    </h3>
                    {event.type === "onsite_event" && event.location && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {event.location}
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create the events page**

`frontend-customer/src/app/(public)/events/page.tsx`:

```tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import { serverFetch } from "@/lib/api-server";
import { getAuthUser } from "@/lib/auth";
import { EventsList } from "@/components/public/events/events-list";
import type { CalendarEvent } from "@/types/live";

const isoDate = (d: Date) => d.toISOString().split("T")[0];

export default async function EventsPage() {
  const from = new Date();
  const to = new Date();
  to.setDate(to.getDate() + 90);

  let events: CalendarEvent[] = [];
  try {
    events = await serverFetch<CalendarEvent[]>(
      `/api/v1/calendar/?from=${isoDate(from)}&to=${isoDate(to)}`,
    );
  } catch {
    events = [];
  }
  events.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

  const user = await getAuthUser();
  const isCoach = user?.role === "owner" || user?.role === "coach";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Upcoming events</h1>
          <p className="mt-1 text-muted-foreground">
            Live classes, streams, and in-person events over the next 90 days.
          </p>
        </div>
        <Link href="/calendar" className="text-sm font-medium text-primary hover:underline">
          View as calendar →
        </Link>
      </div>
      <EventsList events={events} isCoach={isCoach} />
    </div>
  );
}
```

- [ ] **Step 3: Cross-link from the calendar page**

In `frontend-customer/src/app/(public)/calendar/page.tsx`, replace the header `<div>` (the one wrapping the `<h1>Calendar</h1>` and its `<p>`) with:

```tsx
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Calendar
          </h1>
          <p className="mt-1 text-muted-foreground">
            Browse upcoming live classes, streams, and events.
          </p>
        </div>
        <Link
          href="/events"
          className="text-sm font-medium text-primary hover:underline"
        >
          List view →
        </Link>
      </div>
```

and add `import Link from "next/link";` to the imports.

- [ ] **Step 4: Typecheck**

Run: `cd frontend-customer && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Write the e2e spec**

`e2e/specs/13-events-page.spec.ts`:

```ts
// e2e/specs/13-events-page.spec.ts
//
// Covers the public /events listing page:
//   1. Upcoming-events API window (today → +90d) drives the page, so the spec
//      first reads the API to learn what SHOULD render.
//   2. If upcoming events exist: each API title appears as a card linking to
//      /calendar/[type]/[id].
//   3. If none exist: the empty state renders.
//   4. Cross-links: /events → "View as calendar" → /calendar, and back via
//      "List view".

import { test, expect } from "@playwright/test";
import { TENANT } from "../helpers/auth";

const isoDate = (d: Date) => d.toISOString().split("T")[0];

test("public /events lists upcoming events and cross-links with /calendar", async ({
  page,
  request,
}) => {
  const from = new Date();
  const to = new Date();
  to.setDate(to.getDate() + 90);
  const api = await request.get(
    `${TENANT}/api/v1/calendar/?from=${isoDate(from)}&to=${isoDate(to)}`,
  );
  expect(api.ok(), `Calendar API status ${api.status()}`).toBeTruthy();
  const upcoming: Array<{ id: number; type: string; title: string }> = await api.json();

  await page.goto(`${TENANT}/events`);
  await expect(
    page.getByRole("heading", { name: "Upcoming events" }),
  ).toBeVisible({ timeout: 10_000 });

  if (upcoming.length > 0) {
    const first = upcoming[0];
    const card = page.locator(`a[href="/calendar/${first.type}/${first.id}"]`);
    await expect(card, `card for "${first.title}" must render`).toBeVisible();
    await expect(card).toContainText(first.title);
  } else {
    await expect(page.getByText("No upcoming events scheduled.")).toBeVisible();
  }

  // Cross-link: /events → /calendar
  await page.getByRole("link", { name: /View as calendar/ }).click();
  await expect(page).toHaveURL(/\/calendar/);

  // Cross-link back: /calendar → /events
  await page.getByRole("link", { name: /List view/ }).click();
  await expect(page).toHaveURL(/\/events/);
});
```

- [ ] **Step 6: Run the spec against the dev stack**

Run: `cd e2e && npx playwright test specs/13-events-page.spec.ts --reporter=line`
Expected: 1 passed. (Requires `make dev` stack with seeded demo-yoga, same as every other spec.)

- [ ] **Step 7: Commit**

```bash
git status -sb
git add "frontend-customer/src/app/(public)/events" frontend-customer/src/components/public/events "frontend-customer/src/app/(public)/calendar/page.tsx" e2e/specs/13-events-page.spec.ts
git commit -m "feat(events): public /events listing page + calendar cross-links + e2e"
```

---

### Task 4: Truthful seeds — provisioning default, 8 demo templates, fallback alignment

**Files:**
- Modify: `backend/apps/core/tasks.py` (~line 67, the `navbar_config=` kwarg)
- Modify: `backend/apps/core/management/commands/demo_data/{yoga,pilates,makeup,face_yoga,pole_dance,fitness,belly_dance,general}.py` (each file's `CONFIG["navbar_config"]`)
- Test: `backend/apps/core/tests/test_demo_templates_navbar.py` (new)

**Interfaces:**
- Consumes: `CONFIG` module-level dict in each demo_data module; layout enum from Task 1.
- Produces: seeded navbar shapes that render through Task 2's presets; `/events` + `/store` links that Task 3's page and the existing store page back.

- [ ] **Step 1: Write the failing invariants test**

`backend/apps/core/tests/test_demo_templates_navbar.py`:

```python
"""Demo-template navbar invariants: every template must truthfully represent
the tenant's capabilities (events + store links), never say "Programs", and
carry its assigned layout preset."""

import importlib

import pytest

EXPECTED_LAYOUTS = {
    "yoga": "centered",
    "pilates": "split",
    "makeup": "pill",
    "face_yoga": "minimal",
    "pole_dance": "pill",
    "fitness": "classic",
    "belly_dance": "centered",
    "general": "classic",
}
VALID_LAYOUTS = {"classic", "centered", "split", "minimal", "pill"}


@pytest.mark.parametrize("name", sorted(EXPECTED_LAYOUTS))
def test_template_navbar_truthful(name):
    mod = importlib.import_module(f"apps.core.management.commands.demo_data.{name}")
    nav = mod.CONFIG["navbar_config"]
    hrefs = [link["href"] for link in nav["links"]]
    labels = [link["label"] for link in nav["links"]]
    assert "/events" in hrefs, f"{name}: no events link"
    assert "/store" in hrefs, f"{name}: no store link (all templates seed downloads)"
    assert "/courses" in hrefs, f"{name}: no courses link"
    assert "Programs" not in labels, f"{name}: 'Programs' mislabel still present"
    assert nav["layout"] == EXPECTED_LAYOUTS[name]
    assert nav["layout"] in VALID_LAYOUTS
```

- [ ] **Step 2: Run to verify it fails**

Run: `docker compose exec -T django pytest apps/core/tests/test_demo_templates_navbar.py -v`
Expected: 8 FAIL (no `/events` link, "Programs" present, no `layout` key).

- [ ] **Step 3: Update the 8 templates**

In EACH demo_data module, replace the `"navbar_config"` value inside `CONFIG`. Keep each template's existing `cta` dict and `show_login` EXACTLY as they are (e.g. yoga keeps `{"text": "Start Your Practice", "href": "/courses"}`); replace only `links` and add `layout`. Example for `yoga.py` (layout differs per file, per the table in Step 1's test):

```python
    "navbar_config": {
        "links": [
            {"label": "Courses", "href": "/courses"},
            {"label": "Live Classes", "href": "/events"},
            {"label": "Store", "href": "/store"},
            {"label": "About", "href": "/about"},
            {"label": "FAQ", "href": "/faq"},
        ],
        "cta": {"text": "Start Your Practice", "href": "/courses"},
        "show_login": True,
        "layout": "centered",
    },
```

Apply the same `links` list to all 8 files; `layout` per the EXPECTED_LAYOUTS table; each file keeps its own `cta`.

- [ ] **Step 4: Update the provisioning default**

In `backend/apps/core/tasks.py`, replace the `navbar_config=` kwarg:

```python
                navbar_config={
                    "links": [
                        {"label": "Courses", "href": "/courses"},
                        {"label": "Events", "href": "/events"},
                        {"label": "About", "href": "/about"},
                    ],
                    "cta": {"text": "Get Started", "href": "/courses"},
                    "show_login": True,
                    "layout": "classic",
                },
```

(Task 2 already aligned the frontend fallback to Courses/Events/About — no further frontend change here.)

- [ ] **Step 5: Run tests — pass, plus surrounding suites**

Run: `docker compose exec -T django pytest apps/core/tests/test_demo_templates_navbar.py apps/core/tests/test_general_template.py -v`
Expected: all pass (test_general_template asserts on the general template's shape — if it pins the old navbar links, update its expectation to the new list as part of this step).

- [ ] **Step 6: Confirm existing tenants are unaffected**

```bash
curl -s http://demo-yoga.localhost/ | grep -o 'data-nav-layout="[a-z]*"'
```

Expected: `data-nav-layout="classic"` — existing demo tenants keep their already-seeded navbar (no `layout` key → classic fallback). That is by design: seeds apply only at provision/demo-seed time. Visual verification of the new per-template layouts happens in Task 5/6 by switching layouts via the builder (or on a freshly provisioned tenant if one is created during e2e signup specs).

- [ ] **Step 7: Commit**

```bash
git status -sb
git add backend/apps/core/tasks.py backend/apps/core/management/commands/demo_data backend/apps/core/tests/test_demo_templates_navbar.py
git commit -m "feat(seeds): truthful navbar seeds (events/store links, no Programs) + per-template layouts"
```

---

### Task 5: Navbar builder tab — layout picker, toggles, reorder, suggestion chips + link-picker Events entry + e2e

**Files:**
- Rewrite: `frontend-customer/src/components/owner/navbar-tab.tsx`
- Modify: `frontend-customer/src/components/owner/link-picker.tsx` (STATIC_PAGES list, ~line 29-36)
- Test: `e2e/specs/14-navbar-layouts.spec.ts` (new)

**Interfaces:**
- Consumes: `NavbarLayout` type (Task 2), `clientFetch` from `@/lib/api-client`, `GET /api/v1/calendar/?from&to` + `GET /api/v1/billing/store/` (suggestion signals), existing `LinkPickerModal`, `onChange({ navbar_config })` autosave pipeline, `data-nav-layout` attribute (Task 2).
- Produces: coach-facing UI that writes `layout` / `transparent_over_hero` / `show_install` — values validated by Task 1's serializer.

- [ ] **Step 1: Add Events to the link picker**

In `frontend-customer/src/components/owner/link-picker.tsx`, add to the static pages array (after the Calendar entry):

```ts
  { label: "Events", href: "/events" },
```

- [ ] **Step 2: Rewrite navbar-tab.tsx**

Replace the file's entire contents with (existing behavior preserved; new: layout picker, two toggles, reorder arrows, suggestion chips):

```tsx
"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowDown, ArrowUp, Link2, Plus, Trash2 } from "lucide-react";
import { LinkPickerModal } from "@/components/owner/link-picker";
import { clientFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { NavbarConfig, NavbarLayout, TenantConfig } from "@/types/tenant";

interface NavbarTabProps {
  config: TenantConfig;
  onChange: (patch: Partial<TenantConfig>) => void;
}

type PickerTarget = number | "cta" | "new" | null;

const LAYOUTS: { id: NavbarLayout; label: string }[] = [
  { id: "classic", label: "Classic" },
  { id: "centered", label: "Centered" },
  { id: "split", label: "Split" },
  { id: "minimal", label: "Minimal" },
  { id: "pill", label: "Pill" },
];

/** Tiny CSS wireframe of each layout for the picker buttons. */
function LayoutThumb({ id }: { id: NavbarLayout }) {
  const bar = "h-1 w-4 rounded bg-muted-foreground/50";
  const dot = "h-2 w-2 shrink-0 rounded-full bg-muted-foreground";
  switch (id) {
    case "classic":
      return (
        <div className="flex w-full items-center justify-between px-1.5">
          <span className={dot} />
          <span className="flex gap-1">
            <span className={bar} />
            <span className={bar} />
            <span className="h-1 w-3 rounded bg-primary" />
          </span>
        </div>
      );
    case "centered":
      return (
        <div className="flex w-full flex-col items-center gap-1">
          <span className={dot} />
          <span className="flex gap-1">
            <span className={bar} />
            <span className={bar} />
            <span className={bar} />
          </span>
        </div>
      );
    case "split":
      return (
        <div className="flex w-full items-center justify-between px-1.5">
          <span className={bar} />
          <span className={dot} />
          <span className={bar} />
        </div>
      );
    case "minimal":
      return (
        <div className="flex w-full items-center justify-between px-1.5">
          <span className={dot} />
          <span className="flex flex-col gap-0.5">
            <span className="h-0.5 w-3 bg-muted-foreground" />
            <span className="h-0.5 w-3 bg-muted-foreground" />
            <span className="h-0.5 w-3 bg-muted-foreground" />
          </span>
        </div>
      );
    case "pill":
      return (
        <div className="flex w-full justify-center">
          <span className="flex items-center gap-1 rounded-full border border-muted-foreground/40 px-2 py-0.5">
            <span className={dot} />
            <span className={bar} />
          </span>
        </div>
      );
  }
}

function DestinationButton({ href, onClick }: { href: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Choose a page or content"
      className="flex flex-1 items-center gap-1.5 overflow-hidden rounded-md border px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-foreground"
    >
      <Link2 className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{href || "Choose destination…"}</span>
    </button>
  );
}

const isoDate = (d: Date) => d.toISOString().split("T")[0];

export function NavbarTab({ config, onChange }: NavbarTabProps) {
  const navbar = config.navbar_config ?? {
    links: [],
    cta: null,
    show_login: true,
  };
  const links = navbar.links ?? [];
  const layout: NavbarLayout = navbar.layout ?? "classic";
  const ctaEnabled = !!navbar.cta;
  const ctaText = navbar.cta?.text ?? "Get Started";
  const ctaHref = navbar.cta?.href ?? "/courses";
  const showLogin = navbar.show_login !== false;
  const showInstall = navbar.show_install !== false;
  const transparent = navbar.transparent_over_hero === true;

  const [picker, setPicker] = useState<PickerTarget>(null);
  // Which capability suggestions apply (fetched once): hrefs the tenant has
  // content for. Filtered against current links at render time.
  const [available, setAvailable] = useState<{ label: string; href: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const found: { label: string; href: string }[] = [];
      try {
        const from = new Date();
        const to = new Date();
        to.setDate(to.getDate() + 90);
        const events = await clientFetch<unknown[]>(
          `/api/v1/calendar/?from=${isoDate(from)}&to=${isoDate(to)}`,
        );
        if (Array.isArray(events) && events.length > 0) {
          found.push({ label: "Live Classes", href: "/events" });
        }
      } catch {}
      try {
        const store = await clientFetch<unknown[] | { results?: unknown[] }>(
          "/api/v1/billing/store/",
        );
        const items = Array.isArray(store) ? store : (store?.results ?? []);
        if (items.length > 0) found.push({ label: "Store", href: "/store" });
      } catch {}
      if (!cancelled) setAvailable(found);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const suggestions = available.filter((s) => !links.some((l) => l.href === s.href));

  const emit = (patch: Partial<NavbarConfig>) => {
    onChange({ navbar_config: { ...navbar, ...patch } });
  };

  const updateLink = (i: number, field: "label" | "href", value: string) => {
    emit({ links: links.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)) });
  };
  const removeLink = (i: number) => emit({ links: links.filter((_, idx) => idx !== i) });
  const moveLink = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= links.length) return;
    const next = [...links];
    [next[i], next[j]] = [next[j], next[i]];
    emit({ links: next });
  };

  const handlePick = (href: string, label?: string) => {
    if (picker === "new") {
      emit({ links: [...links, { label: label || href, href }] });
    } else if (picker === "cta") {
      emit({ cta: { text: ctaText, href } });
    } else if (typeof picker === "number") {
      const i = picker;
      emit({
        links: links.map((l, idx) =>
          idx === i ? { label: l.label || label || href, href } : l,
        ),
      });
    }
    setPicker(null);
  };

  const initialValue =
    picker === "cta" ? ctaHref : typeof picker === "number" ? (links[picker]?.href ?? "") : "";

  return (
    <div className="space-y-5">
      {/* Layout preset */}
      <div className="space-y-2">
        <Label>Layout</Label>
        <div className="grid grid-cols-5 gap-1.5">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              type="button"
              title={l.label}
              aria-label={`Layout: ${l.label}`}
              onClick={() => emit({ layout: l.id })}
              className={cn(
                "flex h-14 flex-col items-center justify-center gap-1 rounded-md border text-[10px] transition-colors",
                layout === l.id
                  ? "border-primary bg-primary/5 text-foreground"
                  : "text-muted-foreground hover:border-foreground hover:text-foreground",
              )}
            >
              <LayoutThumb id={l.id} />
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Transparent over hero (not applicable to the floating pill) */}
      {layout !== "pill" && (
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <Label>Transparent over hero</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              See-through on the homepage hero, solid after scrolling
            </p>
          </div>
          <Switch
            checked={transparent}
            onCheckedChange={(v) => emit({ transparent_over_hero: v })}
          />
        </div>
      )}

      {/* Nav links */}
      <div className="space-y-2">
        <Label>Navigation links</Label>
        {links.length === 0 && (
          <p className="text-xs text-muted-foreground">No links yet. Add one below.</p>
        )}
        <div className="space-y-2">
          {links.map((link, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="flex flex-col">
                <button
                  onClick={() => moveLink(i, -1)}
                  disabled={i === 0}
                  className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                  title="Move up"
                  aria-label={`Move ${link.label || "link"} up`}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => moveLink(i, 1)}
                  disabled={i === links.length - 1}
                  className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                  title="Move down"
                  aria-label={`Move ${link.label || "link"} down`}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>
              <Input
                placeholder="Label"
                value={link.label}
                onChange={(e) => updateLink(i, "label", e.target.value)}
                className="flex-1"
              />
              <DestinationButton href={link.href} onClick={() => setPicker(i)} />
              <button
                onClick={() => removeLink(i)}
                className="text-muted-foreground transition-colors hover:text-destructive"
                title="Remove link"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Capability suggestions: content exists but no link points at it. */}
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s.href}
                type="button"
                onClick={() => emit({ links: [...links, s] })}
                className="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
              >
                <Plus className="h-3 w-3" /> Add {s.label}
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => setPicker("new")}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed py-2 text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Add link
        </button>
      </div>

      {/* CTA button */}
      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <Label>CTA button</Label>
          <Switch
            checked={ctaEnabled}
            onCheckedChange={(v) => emit({ cta: v ? { text: ctaText, href: ctaHref } : null })}
          />
        </div>
        {ctaEnabled && (
          <div className="space-y-2">
            <Input
              placeholder="Button text"
              value={ctaText}
              onChange={(e) => emit({ cta: { text: e.target.value, href: ctaHref } })}
            />
            <DestinationButton href={ctaHref} onClick={() => setPicker("cta")} />
          </div>
        )}
      </div>

      {/* Show login */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <Label>Show login button</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Display &quot;Sign In&quot; link in nav
          </p>
        </div>
        <Switch checked={showLogin} onCheckedChange={(v) => emit({ show_login: v })} />
      </div>

      {/* Show Install app */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <Label>Show &quot;Install app&quot;</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Link visitors to installing your site as an app
          </p>
        </div>
        <Switch checked={showInstall} onCheckedChange={(v) => emit({ show_install: v })} />
      </div>

      {picker !== null && (
        <LinkPickerModal
          initialValue={initialValue}
          onPick={handlePick}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend-customer && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Write the layout-switch e2e spec**

`e2e/specs/14-navbar-layouts.spec.ts`:

```ts
// e2e/specs/14-navbar-layouts.spec.ts
//
// Coach switches the navbar layout preset via the builder (Site tab → Navbar
// section → layout thumbnail), waits for the autosave PATCH to
// /api/admin/config, then confirms the public homepage header carries the
// data-nav-layout attribute. Restores "classic" in finally.
//
// Selector contract:
//   - Edit-sidebar entry: button title "Edit your site" (09-builder.spec.ts).
//   - Site tab: role=button name "Site" (edit-sidebar.tsx SITE tab).
//   - Navbar accordion: section label "Navbar" (edit-sidebar.tsx:49).
//   - Layout buttons: aria-label "Layout: Centered" etc. (navbar-tab.tsx).
//   - Public marker: header[data-nav-layout] (public-header.tsx).

import { test, expect } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";

test("coach switches navbar layout; public homepage reflects it", async ({
  browser,
  page,
}) => {
  const coach = await coachContext(browser);
  const edit = await coach.newPage();

  const armAutosave = () =>
    edit.waitForResponse(
      (resp) =>
        resp.url().includes("/api/admin/config") &&
        resp.request().method() === "PATCH" &&
        resp.ok(),
      { timeout: 15_000 },
    );

  await edit.goto(`${TENANT}/`);
  const editBtn = edit.getByTitle("Edit your site");
  await expect(editBtn).toBeVisible({ timeout: 10_000 });
  await editBtn.click();

  const siteTab = edit.getByRole("button", { name: /^Site$/i }).first();
  await expect(siteTab).toBeVisible({ timeout: 5_000 });
  await siteTab.click();

  // Open the Navbar accordion (may already be open).
  const navbarSection = edit.getByRole("button", { name: /Navbar/ }).first();
  await expect(navbarSection).toBeVisible({ timeout: 5_000 });
  const centeredBtn = edit.getByLabel("Layout: Centered");
  if (!(await centeredBtn.isVisible().catch(() => false))) {
    await navbarSection.click();
  }
  await expect(centeredBtn).toBeVisible({ timeout: 5_000 });

  try {
    // ── Switch to Centered ──
    let autosave = armAutosave();
    await centeredBtn.click();
    await autosave;

    await page.goto(`${TENANT}/`);
    await expect(page.locator('header[data-nav-layout="centered"]')).toBeVisible({
      timeout: 10_000,
    });

    // ── Switch to Pill (structurally most different) ──
    autosave = armAutosave();
    await edit.getByLabel("Layout: Pill").click();
    await autosave;

    await page.goto(`${TENANT}/`);
    await expect(page.locator('header[data-nav-layout="pill"]')).toBeVisible({
      timeout: 10_000,
    });
  } finally {
    // Restore classic so subsequent runs start clean.
    const autosave = armAutosave();
    await edit.getByLabel("Layout: Classic").click();
    await autosave.catch(() => {});
    await edit.close();
    await coach.close();
  }
});
```

- [ ] **Step 5: Run both new specs**

Run: `cd e2e && npx playwright test specs/13-events-page.spec.ts specs/14-navbar-layouts.spec.ts --reporter=line`
Expected: 2 passed.

**Deviation during execution (2026-07-06):** the two-switch (centered + pill)
version drafted above was too slow and flaky — the accordion body's CSS
grid-rows expand animation confused Playwright's positional hit-testing
(intercepted by the scroll container itself), and two full switch+goto+verify
round trips risked exceeding the suite's 60s default. The spec actually
committed does ONE switch (centered only, matching 09-builder.spec.ts's
budget: ~50-56s), restores via a direct API PATCH of the captured original
`navbar_config` (not a second UI click, avoiding the fragile finally-block
click entirely — same pattern 09-builder.spec.ts uses for its brand-name
restore), and dispatches the layout-button click via
`centeredBtn.evaluate((el) => el.click())` after `scrollIntoViewIfNeeded()`
to bypass the hit-testing false-positive while still firing the real React
onClick handler. See `e2e/specs/14-navbar-layouts.spec.ts` for the final
version.

- [ ] **Step 6: Commit**

```bash
git status -sb
git add frontend-customer/src/components/owner/navbar-tab.tsx frontend-customer/src/components/owner/link-picker.tsx e2e/specs/14-navbar-layouts.spec.ts
git commit -m "feat(builder): navbar layout picker, transparency/install toggles, link reorder + capability suggestion chips"
```

---

### Task 6: Final verification

**Files:** none new — full-suite runs + browser walkthrough + spec status update.

- [ ] **Step 1: Full backend suite**

Run: `make test`
Expected: all pass (>600 tests).

- [ ] **Step 2: Frontend builds**

Run: `cd frontend-customer && npx tsc --noEmit && npm run build`
Expected: clean compile, all static pages generated. (frontend-main is untouched by this branch — skip unless `git status` says otherwise.)

- [ ] **Step 3: Full e2e suite**

Run: `make e2e`
Expected: 19 passed + 3 skipped (17 existing + 2 new; Stripe specs skip as usual). The builder spec (09) and the two new specs must all pass — they share the edit-sidebar surface.

- [ ] **Step 4: Browser walkthrough (Playwright MCP or manual)**

As coach on demo-yoga: cycle all 5 layouts via the builder and eyeball each (desktop + mobile viewport); toggle transparent-over-hero on the homepage and verify transparent→solid on scroll; toggle "Show Install app" off/on; reorder links with the arrows; verify suggestion chips appear on a tenant lacking an /events link and clicking one adds it; visit /events as a visitor, open an event card; verify empty state on a tenant with no events (or by using a to-date filter). Screenshot each layout for the record.

- [ ] **Step 5: Update spec status + progress ledger**

In `docs/superpowers/specs/2026-07-06-public-navbar-redesign-design.md` change `Status: approved` → `Status: implemented (feat/public-navbar)`. Append outcome to `.superpowers/sdd/progress.md`.

- [ ] **Step 6: Commit docs**

```bash
git status -sb
git add docs/superpowers/specs/2026-07-06-public-navbar-redesign-design.md .superpowers/sdd/progress.md
git commit -m "docs: mark navbar redesign spec implemented"
```

Then hand off via superpowers:finishing-a-development-branch (merge decision belongs to the owner; do NOT push).

---

## Self-review notes (already applied)

- Spec §2/§5/§6 were corrected on 2026-07-06 during planning: navbar href sanitation added (parity with `pages`), EN-hardcoded strings (repo convention), e2e instead of component tests (no unit runner in frontend-customer).
- Transparent-over-hero visual caveat: the home hero is not full-bleed to the viewport top today, so "transparent over the hero" reads as "transparent over the page top". The toggle still ships; making the home hero bleed under the header is follow-up polish, out of scope (noted in spec §7 spirit).
- `test_general_template.py` may pin the old navbar shape — Task 4 Step 5 explicitly owns updating it.
- Type consistency checked: `NavbarLayout` exported from `@/types/tenant` (Task 2) and imported in Task 5; `data-nav-layout` attribute name identical in Task 2 renderer and Task 5 e2e; `EXPECTED_LAYOUTS` table identical to Global Constraints.
