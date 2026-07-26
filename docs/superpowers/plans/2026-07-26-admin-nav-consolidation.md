# Admin Nav Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the coach admin sidebar from 18 items in 6 module-shaped sections into 7 job-stage destinations, demote Photos/Videos out of the top level, and group Payouts/Billing/Store under one "Money" heading — without moving a single route.

**Architecture:** The sidebar and mobile drawer already render a shared `NavSection[] → NavItem[]` model from a single inline array in `admin-shell.tsx`. This plan extracts that array into a pure, unit-tested module (`lib/admin-nav.ts`), re-groups it into the new information architecture, and teaches `AppSidebar`/`MobileHeader` to render a "flat" section (a single top-level link with no collapsible header) so single-page destinations like Home and Settings don't render an ugly one-item group — and don't collide with the `role=button` section headers that e2e depends on.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, next-intl, Tailwind, Vitest (unit), Playwright (e2e).

## Why this plan exists (context for a fresh engineer)

The spec ([docs/superpowers/specs/2026-07-26-ai-first-onboarding-design.md](../specs/2026-07-26-ai-first-onboarding-design.md), "Admin focus — navigation redesign") makes the menu mirror the coach's *job stages* (make content → make my site → grow audience → market → get paid) instead of our Django app modules. A brand-new coach today faces 18 doors; this reduces that to 7. **This plan is the Phase-1 consolidation only.** The Phase-2 behaviors — locking Marketing until publish, hiding Content sub-items by wizard goal, unlock celebrations — are explicitly **out of scope** here (see "Scope boundaries").

This plan is fully independent of the publish-gate/blog-grant plan; they share no files and can land in either order.

## Global Constraints

- **No route moves.** Every `href` that exists today still resolves to the same page. This is a re-grouping and re-labeling of nav data plus a small rendering addition. If a task tempts you to create or move a route, stop — that is a different plan.
- **Preserve these item labels verbatim** — e2e selectors match them exactly (`getByRole("link", { name: /^calendar$/i })` and `/^students$/i` in `e2e/specs/25-navigation-feedback.spec.ts`): the Calendar item's label must render exactly `Calendar`, the Students item's exactly `Students`.
- **Single-item destinations render as flat links, never as `role=button` section headers.** `e2e/specs/15-community.spec.ts` selects the community "Settings" tab with `getByRole("button", { name: "Settings", exact: true })` and relies on there being exactly one such button. A sidebar section header named "Settings" would be a second one and break strict-mode matching.
- **Follow the loading/nav conventions** in the root `CLAUDE.md`: internal links are `<NavLink>` (already used by `AppSidebar`); do not introduce raw `next/link` or `router.push`.
- **Both locales stay in sync.** Every `nav.*` key added or removed in `messages/en/admin.json` gets the same treatment in `messages/tr/admin.json`. A key present in one locale but not the other is a bug.
- Verify frontend work with: `make test-frontend` (Vitest), `make typecheck`, and the named `make e2e-spec SPEC=<nn>` specs. The dev stack must be up for e2e (`make dev`).

## Scope boundaries (do NOT build these here)

1. **No stage-gating / locking.** Marketing and Audience render as normal, fully-clickable groups. The spec locks Marketing until publish — that is Phase 2, a separate plan, and it needs the publish-state signal wired into the client first.
2. **No dynamic module visibility.** The spec's "only wizard-goal modules visible initially, + more to enable others" under Content is deferred to Phase 2 with the gating framework (both are state-driven visibility and share machinery). Here, all Content sub-items render for everyone, exactly as today.
3. **No new Money/Content hub *pages*.** "Money" and "Content" are nav *groups* of existing routes. The spec's word "tabbed hub" for Money is already partly satisfied by `/admin/billing`'s existing tabs; a unified Money landing page is a future nicety, not this plan.
4. **Command palette is left as-is.** `command-palette.tsx` hardcodes its own full item list (already independent of the sidebar and already lists Photos, Videos, and every route). It remains the ⌘K escape hatch untouched. Optional label-category polish is noted in Task 4 but not required.
5. **No "All features" page in Settings.** The spec mentions Settings hosting a "browse all features" view. ⌘K already is that escape hatch (it lists every route), so a dedicated page is deferred — building it now would be a new surface for no additional reachability.
6. **`setup/catalog.ts` needs no change.** Its ~20 deep links target `/admin/*` routes, none of which move, so the Setup Assistant's links keep working. Verified, not edited (Task 4 restates this).

## Target information architecture

Seven destinations. Groups are collapsible (as today); flat entries are bare top-level links.

| # | Destination | Kind | Items (label → href) | Badges carried over |
|---|-------------|------|----------------------|---------------------|
| 1 | **Home** | flat | Home → `/admin` | — |
| 2 | **Content** | group | Courses → `/admin/courses`; Live Events → `/admin/live`; Calendar → `/admin/calendar`; Downloads → `/admin/downloads`; Library → `/admin/photos` | Live Events: `live` (partialPaid) |
| 3 | **My Site** | group | Edit site → `/?edit=1` (external); Design → `/?edit=1&section=brand` (external); Site assistant → `/admin/assistant` | Design: `logo_studio` (partialPaid, ai); Assistant: `student_bot` (ai) |
| 4 | **Audience** | group | Students → `/admin/students`; Community → `/admin/community`; Inbox → `/admin/inbox` | Inbox: `platform_mailbox` (partialPaid) |
| 5 | **Marketing** | group | Blog → `/admin/blog`; Email → `/admin/email`; Send announcement → `/admin/notifications` | Blog: `ai_blog` (partialPaid, ai) |
| 6 | **Money** | group | Payouts → `/admin/payouts`; Billing → `/admin/billing`; Store → `/admin/billing?tab=products` | Payouts: `payouts`; Store: `selling` |
| 7 | **Settings** | flat | Settings → `/admin/settings` | — |

**Media demotion:** the standalone "Media" section is gone. Photos moves under Content as **Library** (`/admin/photos`). `/admin/videos` keeps its route and stays reachable via ⌘K (the command palette already lists "Video Library") and via in-editor media pickers, per the spec — it simply no longer occupies a sidebar row. If, in review, the team wants Videos back in the sidebar, add it as a second Content item; that is a one-line change to the nav module.

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `frontend-customer/src/lib/admin-nav.ts` | create | Pure `buildAdminNav(t)` returning the 7-destination `NavSection[]`. Owns the IA and all icon/badge wiring. The single source of nav truth. |
| `frontend-customer/src/lib/__tests__/admin-nav.test.ts` | create | Vitest structural tests (destination count, media demotion, Money grouping, label/route invariants, flat flags). |
| `frontend-customer/src/components/shared/app-sidebar.tsx` | modify | Add `flat?: boolean` to `NavSection`; render flat sections as bare `NavLink`s. |
| `frontend-customer/src/components/shared/mobile-header.tsx` | modify | Mirror flat-section rendering in the mobile drawer. |
| `frontend-customer/src/components/admin/admin-shell.tsx` | modify | Replace the inline `navSections` array with `buildAdminNav(t)`; drop now-unused icon imports. |
| `frontend-customer/messages/en/admin.json` | modify | New `nav.sections` + `nav.items` keys; drop obsolete section keys. |
| `frontend-customer/messages/tr/admin.json` | modify | Same keys, Turkish values. |
| `e2e/specs/15-community.spec.ts` | modify | Update the now-stale comment about the "Settings & Finance" section header. |
| `backend/apps/tenant_config/help_kb.md` | modify (conditional) | Fix any sidebar-location phrasing that names an old section. |

---

### Task 1: Extract a pure, tested nav module

**Files:**
- Create: `frontend-customer/src/lib/admin-nav.ts`
- Create: `frontend-customer/src/lib/__tests__/admin-nav.test.ts`
- Modify: `frontend-customer/src/components/shared/app-sidebar.tsx` (type only — add `flat?`)

**Interfaces:**
- Consumes: `NavSection`, `NavItem` from `@/components/shared/app-sidebar`.
- Produces: `buildAdminNav(t: (key: string) => string): NavSection[]` — the canonical admin IA. Each `NavSection` has a stable `id`; groups carry `items`; flat sections set `flat: true` and carry exactly one item. Later tasks (and Phase 2) import this instead of hand-building nav.

- [x] **Step 1: Add the `flat` flag to the `NavSection` type**

In `frontend-customer/src/components/shared/app-sidebar.tsx`, extend the interface (this is the only change to this file in Task 1):

```typescript
export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
  /** Render as a single bare top-level link (no collapsible group header).
   *  Used for single-page destinations like Home and Settings. A flat section
   *  must contain exactly one item; that item is rendered directly. */
  flat?: boolean;
}
```

- [x] **Step 2: Write the failing structural tests**

Create `frontend-customer/src/lib/__tests__/admin-nav.test.ts`. Assertions key on stable `href`/`id`/`flat` values, never on translated label strings, so an identity translator is enough:

```typescript
import { describe, expect, it } from "vitest";

import { buildAdminNav } from "@/lib/admin-nav";

const t = (key: string) => key; // identity translator: assert structure, not copy
const nav = buildAdminNav(t);

const sectionById = (id: string) => nav.find((s) => s.id === id);
const allItems = nav.flatMap((s) => s.items);
const hrefs = allItems.map((i) => i.href);

describe("buildAdminNav — information architecture", () => {
  it("exposes exactly seven destinations", () => {
    expect(nav).toHaveLength(7);
    expect(nav.map((s) => s.id)).toEqual([
      "home",
      "content",
      "mySite",
      "audience",
      "marketing",
      "money",
      "settings",
    ]);
  });

  it("renders Home and Settings as flat single-item links", () => {
    for (const id of ["home", "settings"]) {
      const section = sectionById(id);
      expect(section?.flat).toBe(true);
      expect(section?.items).toHaveLength(1);
    }
  });

  it("renders the five job-stage groups as normal collapsible sections", () => {
    for (const id of ["content", "mySite", "audience", "marketing", "money"]) {
      expect(sectionById(id)?.flat).toBeFalsy();
      expect(sectionById(id)?.items.length).toBeGreaterThan(1);
    }
  });

  it("demotes media: no top-level Photos/Videos, Library lives under Content", () => {
    // Neither photos nor videos is a top-level destination any more.
    expect(nav.map((s) => s.id)).not.toContain("media");
    // The photo library is reachable as a Content sub-item.
    const content = sectionById("content");
    expect(content?.items.some((i) => i.href === "/admin/photos")).toBe(true);
    // /admin/videos intentionally leaves the sidebar (⌘K + pickers only).
    expect(hrefs).not.toContain("/admin/videos");
  });

  it("groups all three money surfaces under Money", () => {
    const money = sectionById("money");
    const moneyHrefs = money?.items.map((i) => i.href) ?? [];
    expect(moneyHrefs).toEqual([
      "/admin/payouts",
      "/admin/billing",
      "/admin/billing?tab=products",
    ]);
  });

  it("keeps every existing route reachable from the sidebar", () => {
    for (const href of [
      "/admin",
      "/admin/courses",
      "/admin/live",
      "/admin/calendar",
      "/admin/downloads",
      "/admin/photos",
      "/admin/assistant",
      "/admin/students",
      "/admin/community",
      "/admin/inbox",
      "/admin/blog",
      "/admin/email",
      "/admin/notifications",
      "/admin/payouts",
      "/admin/billing",
      "/admin/settings",
    ]) {
      expect(hrefs).toContain(href);
    }
  });

  it("preserves the exact label keys e2e depends on", () => {
    const content = sectionById("content");
    const audience = sectionById("audience");
    const calendar = content?.items.find((i) => i.href === "/admin/calendar");
    const students = audience?.items.find((i) => i.href === "/admin/students");
    // With the identity translator, the rendered label IS the i18n key; the
    // real English/Turkish values ("Calendar"/"Students") are asserted by the
    // label-preservation constraint and the e2e specs.
    expect(calendar?.label).toBe("nav.items.calendar");
    expect(students?.label).toBe("nav.items.students");
  });

  it("carries the paid/AI badges onto the right items", () => {
    const badgeFor = (href: string) =>
      allItems.find((i) => i.href === href);
    expect(badgeFor("/admin/live")?.requiresEntitlement).toBe("live");
    expect(badgeFor("/admin/payouts")?.requiresEntitlement).toBe("payouts");
    expect(badgeFor("/admin/billing?tab=products")?.requiresEntitlement).toBe(
      "selling",
    );
    expect(badgeFor("/admin/blog")?.requiresEntitlement).toBe("ai_blog");
    expect(badgeFor("/admin/inbox")?.requiresEntitlement).toBe(
      "platform_mailbox",
    );
  });

  it("marks the external site-editor links", () => {
    const mySite = sectionById("mySite");
    const editSite = mySite?.items.find((i) => i.href === "/?edit=1");
    expect(editSite?.external).toBe(true);
  });
});
```

- [x] **Step 3: Run the tests to verify they fail**

Vitest runs on the host (this is what `make test-frontend` does — `cd frontend-customer && npx vitest run`):

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/admin-nav.test.ts`

Expected: FAIL — `buildAdminNav` does not exist (module not found).

- [x] **Step 4: Implement the nav module**

Create `frontend-customer/src/lib/admin-nav.ts`:

```typescript
import {
  Bell,
  BookOpen,
  Calendar,
  CreditCard,
  Download,
  ImageIcon,
  Inbox,
  LayoutDashboard,
  Mail,
  MessageCircleQuestion,
  MessagesSquare,
  Newspaper,
  Palette,
  Pencil,
  Settings,
  Store,
  Users,
  Video,
  Wallet,
} from "lucide-react";

import type { NavSection } from "@/components/shared/app-sidebar";

/** The coach admin's information architecture: seven job-stage destinations.
 *  Single source of truth for both the desktop sidebar and the mobile drawer.
 *  Pure — takes a next-intl translator and returns data, so it is unit-tested
 *  without React. See lib/__tests__/admin-nav.test.ts. */
export function buildAdminNav(t: (key: string) => string): NavSection[] {
  return [
    {
      id: "home",
      label: t("nav.items.home"),
      flat: true,
      items: [
        { label: t("nav.items.home"), href: "/admin", icon: LayoutDashboard },
      ],
    },
    {
      id: "content",
      label: t("nav.sections.content"),
      items: [
        { label: t("nav.items.courses"), href: "/admin/courses", icon: BookOpen },
        {
          label: t("nav.items.liveEvents"),
          href: "/admin/live",
          icon: Video,
          requiresEntitlement: "live",
          partialPaid: true,
        },
        { label: t("nav.items.calendar"), href: "/admin/calendar", icon: Calendar },
        { label: t("nav.items.downloads"), href: "/admin/downloads", icon: Download },
        { label: t("nav.items.library"), href: "/admin/photos", icon: ImageIcon },
      ],
    },
    {
      id: "mySite",
      label: t("nav.sections.mySite"),
      items: [
        { label: t("nav.items.editSite"), href: "/?edit=1", icon: Pencil, external: true },
        {
          label: t("nav.items.design"),
          href: "/?edit=1&section=brand",
          icon: Palette,
          external: true,
          ai: true,
          requiresEntitlement: "logo_studio",
          partialPaid: true,
        },
        {
          label: t("nav.items.assistant"),
          href: "/admin/assistant",
          icon: MessageCircleQuestion,
          ai: true,
          requiresEntitlement: "student_bot",
        },
      ],
    },
    {
      id: "audience",
      label: t("nav.sections.audience"),
      items: [
        { label: t("nav.items.students"), href: "/admin/students", icon: Users },
        { label: t("nav.items.communityFeed"), href: "/admin/community", icon: MessagesSquare },
        {
          label: t("nav.items.inbox"),
          href: "/admin/inbox",
          icon: Inbox,
          requiresEntitlement: "platform_mailbox",
          partialPaid: true,
        },
      ],
    },
    {
      id: "marketing",
      label: t("nav.sections.marketing"),
      items: [
        {
          label: t("nav.items.blog"),
          href: "/admin/blog",
          icon: Newspaper,
          ai: true,
          requiresEntitlement: "ai_blog",
          partialPaid: true,
        },
        { label: t("nav.items.email"), href: "/admin/email", icon: Mail },
        { label: t("nav.items.notifications"), href: "/admin/notifications", icon: Bell },
      ],
    },
    {
      id: "money",
      label: t("nav.sections.money"),
      items: [
        {
          label: t("nav.items.payouts"),
          href: "/admin/payouts",
          icon: Wallet,
          requiresEntitlement: "payouts",
        },
        { label: t("nav.items.billing"), href: "/admin/billing", icon: CreditCard },
        {
          label: t("nav.items.store"),
          href: "/admin/billing?tab=products",
          icon: Store,
          requiresEntitlement: "selling",
        },
      ],
    },
    {
      id: "settings",
      label: t("nav.items.settings"),
      flat: true,
      items: [
        { label: t("nav.items.settings"), href: "/admin/settings", icon: Settings },
      ],
    },
  ];
}
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/admin-nav.test.ts`

Expected: PASS — all structural tests green.

- [x] **Step 6: Commit**

```bash
git add frontend-customer/src/lib/admin-nav.ts frontend-customer/src/lib/__tests__/admin-nav.test.ts frontend-customer/src/components/shared/app-sidebar.tsx
git commit -m "feat(admin-nav): extract pure 7-destination nav module with tests"
```

---

### Task 2: Render flat sections and wire the shell to the new module

**Files:**
- Modify: `frontend-customer/src/components/shared/app-sidebar.tsx`
- Modify: `frontend-customer/src/components/shared/mobile-header.tsx`
- Modify: `frontend-customer/src/components/admin/admin-shell.tsx`

**Interfaces:**
- Consumes: `buildAdminNav(t)` from Task 1; the `flat` flag on `NavSection`.
- Produces: a sidebar and mobile drawer that render `flat` sections as a single bare `NavLink`. No new exports.

- [x] **Step 1: Render flat sections in `AppSidebar`**

In `frontend-customer/src/components/shared/app-sidebar.tsx`, inside `sections.map((section, index) => { ... })`, add a flat branch at the very top of the callback body, before `const sectionOpen = ...`:

```tsx
          if (section.flat) {
            const item = section.items[0];
            return (
              <NavLink
                key={section.id}
                href={item.href}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noopener noreferrer" : undefined}
                title={collapsed ? item.label : undefined}
                className={({ active }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    collapsed && "justify-center px-2",
                    active
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )
                }
              >
                {({ pending }) => (
                  <>
                    {pending ? (
                      <Spinner size="sm" className="shrink-0" />
                    ) : (
                      <item.icon className="h-4 w-4 shrink-0" />
                    )}
                    {!collapsed && <span>{item.label}</span>}
                  </>
                )}
              </NavLink>
            );
          }
```

This reuses the exact link styling of a normal item, so a flat destination is visually a nav row, not a group. The existing group-rendering code below stays unchanged and handles the five collapsible sections.

- [x] **Step 2: Render flat sections in `MobileHeader`**

Open `frontend-customer/src/components/shared/mobile-header.tsx`. Inside its `sections.map((section) => { ... })` (around line 104), add the same guard at the top of the callback, adapted to the drawer's link styling. First read the file's existing item-link JSX (the block under `section.items.map`) and mirror its `className`/close-on-click handler exactly:

```tsx
          if (section.flat) {
            const item = section.items[0];
            return (
              <NavLink
                key={section.id}
                href={item.href}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noopener noreferrer" : undefined}
                onClick={() => setOpen(false)}
                className={({ active }) =>
                  cn(
                    // Match the exact classes the existing item links in THIS
                    // file use (copy from the section.items.map block below).
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )
                }
              >
                {({ pending }) => (
                  <>
                    {pending ? (
                      <Spinner size="sm" className="shrink-0" />
                    ) : (
                      <item.icon className="h-4 w-4 shrink-0" />
                    )}
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          }
```

Note: `mobile-header.tsx` closes its drawer on navigation with `onClick={() => setOpen(false)}` (confirmed on its existing item links) — reuse that exact handler. `NavLink` and `cn` are already imported in this file; **`Spinner` is not — add `import { Spinner } from "@/components/ui/spinner";`**. Copy the existing item link's `className` verbatim from the `section.items.map` block just below, rather than retyping it.

- [x] **Step 3: Wire `admin-shell.tsx` to the module**

In `frontend-customer/src/components/admin/admin-shell.tsx`:

1. Add the import: `import { buildAdminNav } from "@/lib/admin-nav";`
2. Replace the entire inline `const navSections: NavSection[] = [ ... ];` block (all seven-ish sections, ~150 lines) with:

```typescript
  const navSections = buildAdminNav(t);
```

3. Remove the now-unused lucide icon imports and the `NavSection` type import from this file — the module owns them now. Keep any icons still used elsewhere in `admin-shell.tsx` (e.g. `Search`, `Globe`, `ExternalLink` in the header bar). Let `make typecheck` tell you which imports are now unused.

- [x] **Step 4: Typecheck**

Run: `make typecheck`

Expected: PASS for both apps. Fix any "declared but never used" import errors in `admin-shell.tsx` by deleting those icon imports.

- [x] **Step 5: Verify the nav renders and navigation feedback still works**

The dev stack must be up (`make dev`). Run the navigation-feedback e2e, which clicks the `Calendar` and `Students` sidebar links and asserts active-state/loading behavior:

Run: `make e2e-spec SPEC=25-navigation-feedback`

Expected: PASS. If the links aren't found, confirm (a) their labels still render exactly `Calendar`/`Students` (Task 3 owns the i18n values — if it hasn't run yet the keys render as raw keys and this fails; run Task 3 first or verify against raw keys), and (b) the Content and Audience groups default to open (they do — `openSections` initializes every section to `true` in `app-sidebar.tsx`).

- [x] **Step 6: Commit**

```bash
git add frontend-customer/src/components/shared/app-sidebar.tsx frontend-customer/src/components/shared/mobile-header.tsx frontend-customer/src/components/admin/admin-shell.tsx
git commit -m "feat(admin-nav): render flat sections and source the shell from buildAdminNav"
```

---

### Task 3: Localize the new labels (en + tr)

**Files:**
- Modify: `frontend-customer/messages/en/admin.json`
- Modify: `frontend-customer/messages/tr/admin.json`

**Interfaces:**
- Consumes: the `t("nav.*")` keys referenced by `buildAdminNav`.
- Produces: resolved section and item labels in both locales.

- [x] **Step 1: Update the English `nav` block**

In `frontend-customer/messages/en/admin.json`, replace the `nav.sections` object and add the new item keys so `nav` reads:

```json
  "nav": {
    "sections": {
      "content": "Content",
      "mySite": "My Site",
      "audience": "Audience",
      "marketing": "Marketing",
      "money": "Money"
    },
    "items": {
      "home": "Home",
      "communityFeed": "Community",
      "courses": "Courses",
      "calendar": "Calendar",
      "library": "Library",
      "videos": "Videos",
      "downloads": "Downloads",
      "liveEvents": "Live Events",
      "email": "Email",
      "blog": "Blog",
      "students": "Students",
      "notifications": "Send announcement",
      "inbox": "Inbox",
      "editSite": "Edit site",
      "design": "Design",
      "assistant": "Site assistant",
      "settings": "Settings",
      "billing": "Billing",
      "store": "Store",
      "payouts": "Payouts"
    }
  }
```

Notes: the old section keys (`overview`, `products`, `website`, `media`, `operations`) are removed — only `buildAdminNav` read them, and it no longer does. `home` and `library` are the new keys. `videos` is retained (the command palette and any other consumer may reference it) even though the sidebar no longer shows it. `calendar` stays exactly `"Calendar"` and `students` exactly `"Students"` — the e2e invariant.

- [x] **Step 2: Update the Turkish `nav` block**

In `frontend-customer/messages/tr/admin.json`, apply the identical key set with Turkish values:

```json
  "nav": {
    "sections": {
      "content": "İçerik",
      "mySite": "Sitem",
      "audience": "Kitle",
      "marketing": "Pazarlama",
      "money": "Gelir"
    },
    "items": {
      "home": "Ana Sayfa",
      "communityFeed": "Topluluk",
      "courses": "Kurslar",
      "calendar": "Takvim",
      "library": "Kitaplık",
      "videos": "Videolar",
      "downloads": "İndirilenler",
      "liveEvents": "Canlı Etkinlikler",
      "email": "E-posta",
      "blog": "Blog",
      "students": "Öğrenciler",
      "notifications": "Duyuru gönder",
      "inbox": "Gelen Kutusu",
      "editSite": "Siteyi düzenle",
      "design": "Tasarım",
      "assistant": "Site asistanı",
      "settings": "Ayarlar",
      "billing": "Faturalama",
      "store": "Mağaza",
      "payouts": "Ödemeler"
    }
  }
```

Keep whatever existing Turkish values the retained keys already had if they differ from the above — do not regress an established translation. The values shown are fallbacks for keys that are new (`home`, `library`, and the five section labels).

- [x] **Step 3: Verify no stale key references remain**

Run: `grep -rn "nav.sections.overview\|nav.sections.products\|nav.sections.website\|nav.sections.media\|nav.sections.operations" frontend-customer/src`

Expected: no output. If anything prints, it is a consumer of a removed key — update it to the new IA before continuing.

- [x] **Step 4: Confirm the two locales have identical nav key sets**

Run:

```bash
cd frontend-customer && node -e "
const en=require('./messages/en/admin.json').nav, tr=require('./messages/tr/admin.json').nav;
const keys=o=>[...Object.keys(o.sections),...Object.keys(o.items)].sort();
const a=keys(en), b=keys(tr);
const diff=[...a.filter(k=>!b.includes(k)).map(k=>'only-en:'+k), ...b.filter(k=>!a.includes(k)).map(k=>'only-tr:'+k)];
console.log(diff.length?diff.join('\n'):'OK: locales in sync');
"
```

Expected: `OK: locales in sync`.

- [x] **Step 5: Verify labels render (re-run the nav e2e)**

Run: `make e2e-spec SPEC=25-navigation-feedback`

Expected: PASS — `Calendar` and `Students` links resolve with their real labels now.

- [x] **Step 6: Commit**

```bash
git add frontend-customer/messages/en/admin.json frontend-customer/messages/tr/admin.json
git commit -m "i18n(admin-nav): label the seven job-stage destinations (en, tr)"
```

---

### Task 4: Clean up the blast radius and verify end-to-end

**Files:**
- Modify: `e2e/specs/15-community.spec.ts` (comment only)
- Modify (conditional): `backend/apps/tenant_config/help_kb.md`
- Optional: `frontend-customer/src/components/admin/command-palette.tsx` (category labels)

**Interfaces:** none produced; this task reconciles everything downstream of the nav and proves the suite is green.

- [x] **Step 1: Fix the stale comment in the community spec**

The selector in `e2e/specs/15-community.spec.ts` (`getByRole("button", { name: "Settings", exact: true })`) still works — Settings is now a **flat link**, not a `role=button` section header, so the community "Settings" tab is again the only button by that name. But the comment above it references a "Settings & Finance" section header that no longer exists. Replace that comment block with:

```typescript
  // The community tab named exactly "Settings" is now the only role=button by
  // that name: the admin sidebar renders Settings as a flat <Link> (a bare
  // top-level destination), and the five collapsible section headers are named
  // Content / My Site / Audience / Marketing / Money — none of them "Settings".
```

Do not change the selector itself.

- [x] **Step 2: Run the community spec to confirm the selector still resolves**

Run: `make e2e-spec SPEC=15-community`

Expected: PASS. If it strict-mode-fails on the Settings button, a section header is still rendering as a button named "Settings" — re-check that the Settings section has `flat: true` in `admin-nav.ts` (Task 1) and that `AppSidebar` renders flat sections without the header `<button>` (Task 2).

- [x] **Step 3: Reconcile the help knowledge base**

The help bot's route table in `help_kb.md` is keyed by `/admin/*` routes, which have not moved, so it stays valid. Only *sidebar-location phrasing* can go stale. Scan for it:

```bash
grep -rniE "sidebar|left menu|left-hand|under (the )?(products|audience|website|media|operations|settings & finance)|Settings & Finance|Products & Teaching|Audience & Marketing" backend/apps/tenant_config/help_kb.md
```

For each hit that tells a coach to find something "under the <old-section> section", rewrite it to the new destination (e.g. "under **Money**" for payouts/billing/store, "under **Content**" for courses/live/calendar/downloads/library, "under **Marketing**" for blog/email/announcements, "under **Audience**" for students/community/inbox, "under **My Site**" for edit-site/design/assistant). If the grep returns nothing, the KB needs no change — note that and move on.

- [x] **Step 4: (Optional) align command-palette categories with the new IA**

Not required — the palette is a flat searchable list and already covers every route. If you want it to *read* consistently, you may relabel its `category` union (`"Products" | "Audience" | "Website & Media" | "Settings"`) toward `"Content" | "My Site" | "Audience" | "Marketing" | "Money" | "Settings"` and re-bucket items. Purely cosmetic; skip if time-boxed. If skipped, leave a one-line code comment noting the palette categories predate the nav IA.

- [x] **Step 4b: Confirm the Setup Assistant catalog needs no change**

`frontend-customer/src/components/setup/catalog.ts` maps setup items to `/admin/*` deep links. None of those routes moved, so it is unaffected. Confirm with:

```bash
grep -c "href" frontend-customer/src/components/setup/catalog.ts
```

Sanity-check that every `href` there still resolves (they are the same routes the sidebar links to). No edit expected.

- [x] **Step 5: Note the flowmap screen keys**

Flowmap screen keys are `customer|/admin/*` and are route-based, so they survive unchanged (no routes moved). No DB edit is needed; `flowmap.db` is gitignored and rebuilt. If flowmap has been run locally, `make flowmap-register ARGS=--screens-only` will refresh screenshots to show the new sidebar, but this is not required for the plan.

- [x] **Step 6: Full frontend verification**

Run each and confirm PASS:

```bash
make test-frontend
make typecheck
make e2e-spec SPEC=25-navigation-feedback
make e2e-spec SPEC=15-community
make e2e-spec SPEC=01-signup-onboarding
```

`01-signup-onboarding` exercises the coach's first landing in the admin after the wizard; it must still find its way around the consolidated nav. If it references an old section label, update the spec to the new destination and re-run.

- [x] **Step 7: Lint**

Run: `make lint`

Expected: PASS with zero warnings (this includes `scripts/check-loading-patterns.mjs` and the e2e selector self-test). Fix anything it flags.

- [x] **Step 8: Commit**

```bash
git add e2e/specs/15-community.spec.ts backend/apps/tenant_config/help_kb.md
git commit -m "chore(admin-nav): reconcile e2e comment and help KB with the 7-destination nav"
```

---

## Verification before calling this plan done

- [x] `make test-frontend` passes, including `src/lib/__tests__/admin-nav.test.ts`.
- [x] `make typecheck` passes for both apps with no unused-import errors.
- [x] `make e2e-spec SPEC=25-navigation-feedback`, `SPEC=15-community`, and `SPEC=01-signup-onboarding` all pass.
- [x] `make lint` passes with zero warnings.
- [x] Manual smoke on a dev tenant admin: the sidebar shows exactly seven destinations — **Home**, **Content**, **My Site**, **Audience**, **Marketing**, **Money**, **Settings**. Home and Settings are single rows; the other five expand/collapse. Photos/Videos are absent from the top level; Library appears under Content and opens `/admin/photos`. Payouts, Billing, and Store all sit under Money.
- [x] ⌘K still finds Videos, Photos, and every other page (command palette untouched).
- [x] Mobile drawer (narrow viewport) shows the same seven destinations with Home/Settings as flat links.

## What comes next (the rest of Phase 1)

This is plan 2 of 5 for Phase 1 of the spec. It is independent of plan 1 (publish gate + blog grant) and of the wizard work. The Phase-2 nav behaviors — locking Marketing until publish, hiding Content sub-items by wizard goal, unlock celebrations — build directly on the `buildAdminNav` module created here: they add per-section `locked`/`visibleWhen` predicates driven by real tenant state, without re-touching the IA.

| Plan | Scope | Depends on |
|------|-------|------------|
| 1. Publish gate + blog grant ✅ | Conditional blockers, free grant | — |
| **2. Admin nav consolidation** (this one) | 18 → 7 destinations, media demotion, Money group | — |
| 3. Content-first wizard + lazy provisioning | New step machine, AI outlines, compose fallback, holdout | 1 |
| 4. AI seeding | Starter posts, curated photos, draft products, noindex, `demo_cleanup` removal | 3 |
| 5. Reveal chat + `site_ai_updates` quota | Chat surface, preview/apply, metering | 3 |
