# Coach Admin Phase 1 (Shell) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the coach admin seven sidebar rows, one name per page, a search derived from the same nav data, and one docked assistant panel in place of the two floating bubbles, the Help sheet and the Site AI page.

**Architecture:** `lib/admin-nav.ts` stays the single source of the IA and gains section icons, item keys and two pure helpers; the sidebar renders one row per section and a new tab strip under the top bar lists the active section's pages. The assistant panel is a new flex sibling of the page column that hosts the existing copilot chat, setup checklist, help chat and audit list unchanged. No backend code changes; one backend text file (the help KB) follows the new names.

**Tech Stack:** Next.js 14 App Router, React 18, next-intl (`messages/en/admin.json`), Tailwind, vitest (pure logic only), Playwright (`e2e/`).

**Spec:** `docs/superpowers/specs/2026-10-13-coach-admin-refactor-design.md` (§5.1, §5.2, §6 Phase 1, §7).

## Global Constraints

- At most 7 sidebar rows for any coach (spec §1).
- The first row stays "Home" in this phase; it becomes "Today" in Phase 4, when the page earns the name.
- The palette's fallback row only opens the assistant; carrying the typed text into the chat arrives with page context in Phase 2.
- One name per page: sidebar/tab label = page `<h1>` = search entry, all read from `nav.items.*` / `nav.sections.*` in `frontend-customer/messages/en/admin.json` (spec §5.1, D6).
- A feature the plan lacks shows one quiet lock on the item only; no section is locked (spec §5.1). The Marketing lock goes.
- Items for modules the coach did not choose stay hidden (`live`: `/admin/live`, `/admin/calendar`; `downloads`: `/admin/downloads`), behind "+ N more" (spec §5.1).
- The assistant is available to every coach: no plan check anywhere in this phase (D1).
- Every page keeps working without the assistant (D3).
- Old URLs keep working through redirect pages (D7).
- On the public site and in the site editor the copilot bubble and the setup bubble stay exactly as they are (spec §5.2).
- Frontend conventions from root `CLAUDE.md`: `<NavLink>` not `next/link` for internal navigation, `useNavigate()` not `router.push`, `<Button loading>`, `PageState` for initial loads, every route segment has a `loading.tsx` at or above it (`app/admin/loading.tsx` covers new admin routes).
- Shared checkout: commit only the files this plan names; never `git add -A`. Run `pre-commit run --files <files>` then `git commit --no-verify`.
- One heavy job at a time (typecheck, e2e). Never restart the dev stack; containers hot-reload.

## Review Focus

1. **A page under no nav item** (`/admin/courses/new`, `/admin/students/3`, `/admin/store/bundles/new`, `/admin/email/compose`): the coach expects her section's row and tabs to stay lit. Pinned in Task 1 (`activeSection` tests).
2. **A coach with no optional modules**: Teach has one visible page; she expects no empty tab strip but still a way to reach Classes & events. Pinned in Task 1 (gate tests) and Task 2 (strip renders when `hiddenCount > 0`).
3. **An old bookmark** (`/admin/site-ai`, `/admin/billing?tab=bundles`, `/admin/billing/bundles/4`): she expects to land on the page's new home, not a 404. Pinned in Task 3 and Task 5 by `admin-links.test.ts` plus redirect pages.
4. **A phone**: the panel must cover the screen rather than squeeze the page, and there must be one "View site" button, not two. Checked in Task 5's browser step at 375 px.
5. **Help chat switched off** (`useHelpBotStatus().reason === "disabled"`) or **setup finished**: the Help and Setup tabs must not appear, and a link asking for them must fall back to the Assistant tab. Pinned in Task 5 (`dockTabs` tests).

## File Structure

| File | Responsibility |
|---|---|
| `frontend-customer/src/lib/admin-nav.ts` (modify) | The IA: 7 sections, their pages, `sectionHref`, `activeSection` |
| `frontend-customer/src/lib/admin-nav-gate.ts` (modify) | Hide un-chosen module pages; nothing else |
| `frontend-customer/src/lib/admin-palette.ts` (create) | Search entries derived from the nav |
| `frontend-customer/src/lib/assistant-dock.ts` (create) | Pure dock logic: which tabs exist, which opens from a URL |
| `frontend-customer/src/components/shared/app-sidebar.tsx` (modify) | One row per section; `NavItem`/`NavSection` types |
| `frontend-customer/src/components/shared/mobile-header.tsx` (modify) | Same rows in the phone drawer |
| `frontend-customer/src/components/admin/section-tabs.tsx` (create) | The active section's pages as a tab strip |
| `frontend-customer/src/components/admin/feature-badges.tsx` (modify) | `LockedMark`: the quiet lock |
| `frontend-customer/src/components/admin/assistant-dock.tsx` (create) | Dock context, provider and panel |
| `frontend-customer/src/components/copilot/audit-list.tsx` (create) | "What the assistant changed" list (moved from the Site AI page) |
| `frontend-customer/src/components/copilot/copilot-bubble.tsx` (modify) | `docked` variant |
| `frontend-customer/src/components/setup/setup-assistant-panel.tsx` (modify) | `variant="inline"` |
| `frontend-customer/src/components/admin/admin-shell.tsx` (modify) | Wires nav, tabs, palette, dock |
| `frontend-customer/src/components/admin/command-palette.tsx` (modify) | Renders `paletteEntries` |
| `frontend-customer/src/app/admin/store/**` (create/move) | What the coach sells (was three tabs of Billing) |
| `frontend-customer/src/app/admin/billing/page.tsx` (modify) | Her own Contentor plan only |
| `frontend-customer/messages/en/admin.json` (modify) | Names |
| `backend/apps/tenant_config/help_kb.md` (modify) | Route table the assistant and help bot link from |

---

### Task 1: The IA as data

**Files:**
- Modify: `frontend-customer/src/components/shared/app-sidebar.tsx:27-61` (types only in this task)
- Modify: `frontend-customer/src/lib/admin-nav.ts`, `frontend-customer/src/lib/admin-nav-gate.ts`
- Modify: `frontend-customer/messages/en/admin.json` (`nav` block)
- Test: `frontend-customer/src/lib/__tests__/admin-nav.test.ts`, `frontend-customer/src/lib/__tests__/admin-nav-gate.test.ts` (both replaced)

**Interfaces:**
- Produces: `NavItem { key: string; label: string; href: string; icon; requiresEntitlement?: EntitlementKey; external?: boolean }`, `NavSection { id: string; label: string; icon; items: NavItem[]; hiddenCount?: number }`, `buildAdminNav(t): NavSection[]`, `sectionHref(section): string`, `activeSection(sections, { pathname, pendingHref }): NavSection | undefined`, `gateAdminNav(sections, { enabledModules: string[]; expandedSections: string[] }): NavSection[]`.

- [ ] **Step 1: Replace the nav test**

Replace `frontend-customer/src/lib/__tests__/admin-nav.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { activeSection, buildAdminNav, sectionHref } from "@/lib/admin-nav";
import messages from "../../../messages/en/admin.json";

const t = (key: string) => key;
const nav = buildAdminNav(t);
/** The real English, for checks that are about what the coach reads. */
const english = (key: string) =>
  key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown>)?.[part],
      messages,
    ) as string;
const section = (id: string) => nav.find((s) => s.id === id)!;
const hrefs = (id: string) => section(id).items.map((i) => i.href);
const at = (pathname: string) =>
  activeSection(nav, { pathname, pendingHref: null })?.id;

describe("buildAdminNav", () => {
  it("has exactly seven sections, in the coach's order", () => {
    expect(nav.map((s) => s.id)).toEqual([
      "home",
      "teach",
      "students",
      "reachOut",
      "money",
      "site",
      "settings",
    ]);
  });

  it("puts each page under the job it serves", () => {
    expect(hrefs("home")).toEqual(["/admin"]);
    expect(hrefs("teach")).toEqual([
      "/admin/courses",
      "/admin/live",
      "/admin/calendar",
      "/admin/downloads",
    ]);
    expect(hrefs("students")).toEqual([
      "/admin/students",
      "/admin/community",
      "/admin/inbox",
    ]);
    expect(hrefs("reachOut")).toEqual([
      "/admin/notifications",
      "/admin/email",
      "/admin/blog",
    ]);
    expect(hrefs("money")).toEqual(["/admin/payouts", "/admin/store"]);
    expect(hrefs("site")).toEqual([
      "/?edit=1",
      "/?edit=1&section=brand",
      "/admin/photos",
      "/admin/videos",
      "/admin/assistant",
    ]);
    expect(hrefs("settings")).toEqual(["/admin/settings", "/admin/billing"]);
  });

  it("no section and page share a visible name, so links stay unambiguous", () => {
    for (const s of buildAdminNav(english)) {
      expect(s.label, `${s.id} has an English name`).toBeTruthy();
      if (s.items.length === 1) continue; // single-page sections show no tabs
      expect(s.items.map((i) => i.label)).not.toContain(s.label);
    }
  });

  it("gives every item a distinct message key", () => {
    const keys = nav.flatMap((s) => s.items.map((i) => i.key));
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of nav)
      for (const i of s.items) expect(i.label).toBe(`nav.items.${i.key}`);
  });

  it("locks only by entitlement, on the item", () => {
    const locked = Object.fromEntries(
      nav.flatMap((s) =>
        s.items
          .filter((i) => i.requiresEntitlement)
          .map((i) => [i.href, i.requiresEntitlement]),
      ),
    );
    expect(locked).toEqual({
      "/admin/live": "live",
      "/admin/inbox": "platform_mailbox",
      "/admin/blog": "ai_blog",
      "/admin/payouts": "payouts",
      "/admin/store": "selling",
      "/?edit=1&section=brand": "logo_studio",
      "/admin/assistant": "student_bot",
    });
  });
});

describe("sectionHref", () => {
  it("leads to the section's first page inside the admin", () => {
    expect(sectionHref(section("teach"))).toBe("/admin/courses");
    // Site starts with two links that open the editor in a new tab.
    expect(sectionHref(section("site"))).toBe("/admin/photos");
  });
});

describe("activeSection", () => {
  it("finds the section from a page under no nav item", () => {
    expect(at("/admin")).toBe("home");
    expect(at("/admin/courses/new")).toBe("teach");
    expect(at("/admin/students/3")).toBe("students");
    expect(at("/admin/email/compose")).toBe("reachOut");
    expect(at("/admin/store/bundles/new")).toBe("money");
    expect(at("/admin/billing")).toBe("settings");
  });

  it("follows a pending navigation before the route commits", () => {
    expect(
      activeSection(nav, { pathname: "/admin", pendingHref: "/admin/blog" })
        ?.id,
    ).toBe("reachOut");
  });

  it("is undefined off the map (raw data)", () => {
    expect(at("/admin/m/users")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Replace the gate test**

Replace `frontend-customer/src/lib/__tests__/admin-nav-gate.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { buildAdminNav } from "@/lib/admin-nav";
import { gateAdminNav } from "@/lib/admin-nav-gate";

const nav = buildAdminNav((key) => key);
const gate = (enabledModules: string[], expandedSections: string[] = []) =>
  gateAdminNav(nav, { enabledModules, expandedSections });
const teach = (sections: ReturnType<typeof gate>) =>
  sections.find((s) => s.id === "teach")!;

describe("gateAdminNav", () => {
  it("shows only Courses under Teach for a coach with no optional modules", () => {
    const section = teach(gate([]));
    expect(section.items.map((i) => i.href)).toEqual(["/admin/courses"]);
    expect(section.hiddenCount).toBe(3);
  });

  it("shows classes and the calendar with the live module", () => {
    const section = teach(gate(["live"]));
    expect(section.items.map((i) => i.href)).toEqual([
      "/admin/courses",
      "/admin/live",
      "/admin/calendar",
    ]);
    expect(section.hiddenCount).toBe(1);
  });

  it("hides nothing once every module is on", () => {
    const section = teach(gate(["live", "downloads"]));
    expect(section.items).toHaveLength(4);
    expect(section.hiddenCount).toBeUndefined();
  });

  it("reveals everything when the coach opens + more", () => {
    const section = teach(gate([], ["teach"]));
    expect(section.items).toHaveLength(4);
    expect(section.hiddenCount).toBeUndefined();
  });

  it("never touches the other six sections", () => {
    const gated = gate([]);
    for (const original of nav) {
      if (original.id === "teach") continue;
      expect(gated.find((s) => s.id === original.id)).toBe(original);
    }
  });
});
```

- [ ] **Step 3: Run both; they fail**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/admin-nav.test.ts src/lib/__tests__/admin-nav-gate.test.ts`
Expected: FAIL (`activeSection` / `sectionHref` are not exported; section ids differ).

- [ ] **Step 4: Narrow the nav types**

In `frontend-customer/src/components/shared/app-sidebar.tsx` replace the `NavItem` and `NavSection` interfaces with:

```ts
export interface NavItem {
  /** Message key under `nav.items` — the page's one name. Its <h1> reads the
   *  same key, so the sidebar, the tab and the page cannot drift apart. */
  key: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** A quiet lock shows while the coach's plan lacks this entitlement. */
  requiresEntitlement?: EntitlementKey;
  /** Opens the site editor in a new tab. */
  external?: boolean;
}

export interface NavSection {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
  /** Pages hidden because the coach did not choose their module; the tab
   *  strip offers them behind "+ N more". */
  hiddenCount?: number;
}
```

(The component body below still refers to the removed fields; Task 2 rewrites it. Typecheck is run at the end of Task 2, not here.)

- [ ] **Step 5: Write the nav**

Replace `frontend-customer/src/lib/admin-nav.ts` with:

```ts
import {
  Bell,
  BookOpen,
  Calendar,
  CreditCard,
  Download,
  Film,
  Globe,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  Mail,
  MessageCircleQuestion,
  MessagesSquare,
  Newspaper,
  Palette,
  Pencil,
  Settings,
  SlidersHorizontal,
  Store,
  Users,
  Video,
  Wallet,
} from "lucide-react";

import type { NavSection } from "@/components/shared/app-sidebar";
import {
  isNavItemActive,
  type NavPathState,
} from "@shared/navigation/navigation-state";

/** The coach admin's information architecture: seven places, each holding the
 *  pages of one job. Single source for the sidebar, the section tabs, the
 *  phone drawer and the search. Pure — see lib/__tests__/admin-nav.test.ts. */
export function buildAdminNav(t: (key: string) => string): NavSection[] {
  const item = (
    key: string,
    href: string,
    icon: NavSection["icon"],
    extra: Partial<NavSection["items"][number]> = {},
  ) => ({ key, label: t(`nav.items.${key}`), href, icon, ...extra });

  return [
    {
      id: "home",
      label: t("nav.items.home"),
      icon: LayoutDashboard,
      items: [item("home", "/admin", LayoutDashboard)],
    },
    {
      id: "teach",
      label: t("nav.sections.teach"),
      icon: BookOpen,
      items: [
        item("courses", "/admin/courses", BookOpen),
        item("liveEvents", "/admin/live", Video, {
          requiresEntitlement: "live",
        }),
        item("calendar", "/admin/calendar", Calendar),
        item("downloads", "/admin/downloads", Download),
      ],
    },
    {
      id: "students",
      label: t("nav.sections.students"),
      icon: Users,
      items: [
        item("students", "/admin/students", Users),
        item("communityFeed", "/admin/community", MessagesSquare),
        item("inbox", "/admin/inbox", Inbox, {
          requiresEntitlement: "platform_mailbox",
        }),
      ],
    },
    {
      id: "reachOut",
      label: t("nav.sections.reachOut"),
      icon: Bell,
      items: [
        item("notifications", "/admin/notifications", Bell),
        item("email", "/admin/email", Mail),
        item("blog", "/admin/blog", Newspaper, {
          requiresEntitlement: "ai_blog",
        }),
      ],
    },
    {
      id: "money",
      label: t("nav.sections.money"),
      icon: Wallet,
      items: [
        item("payouts", "/admin/payouts", Wallet, {
          requiresEntitlement: "payouts",
        }),
        item("store", "/admin/store", Store, {
          requiresEntitlement: "selling",
        }),
      ],
    },
    {
      id: "site",
      label: t("nav.sections.site"),
      icon: Globe,
      items: [
        item("editSite", "/?edit=1", Pencil, { external: true }),
        item("design", "/?edit=1&section=brand", Palette, {
          external: true,
          requiresEntitlement: "logo_studio",
        }),
        item("photos", "/admin/photos", ImageIcon),
        item("videos", "/admin/videos", Film),
        item("assistant", "/admin/assistant", MessageCircleQuestion, {
          requiresEntitlement: "student_bot",
        }),
      ],
    },
    {
      id: "settings",
      label: t("nav.sections.settings"),
      icon: Settings,
      items: [
        item("settings", "/admin/settings", SlidersHorizontal),
        item("plan", "/admin/billing", CreditCard),
      ],
    },
  ];
}

/** Where a section's sidebar row leads: its first page inside the admin. */
export function sectionHref(section: NavSection): string {
  return (section.items.find((i) => !i.external) ?? section.items[0]).href;
}

/** The section the coach is in, from her current (or pending) path. Detail
 *  pages count through the prefix match: /admin/courses/new is Teach. */
export function activeSection(
  sections: NavSection[],
  state: NavPathState,
): NavSection | undefined {
  return sections.find((section) =>
    section.items.some(
      (i) => !i.external && isNavItemActive(state, i.href),
    ),
  );
}
```

- [ ] **Step 6: Write the gate**

Replace `frontend-customer/src/lib/admin-nav-gate.ts` with:

```ts
import type { NavSection } from "@/components/shared/app-sidebar";

/** Real tenant state the nav gates on. */
export interface NavGateState {
  /** TenantConfig.enabled_modules — composed from the coach's setup answers. */
  enabledModules: string[];
  /** Section ids whose "+ N more" the coach has opened. */
  expandedSections: string[];
}

/** Pages that only appear once their module is on. */
const MODULE_FOR_HREF: Record<string, string> = {
  "/admin/live": "live",
  "/admin/calendar": "live",
  "/admin/downloads": "downloads",
};

/** Hide the pages of modules the coach did not choose, and count them so the
 *  tab strip can offer "+ N more". Pure; sections it does not change are
 *  returned as the same objects. */
export function gateAdminNav(
  sections: NavSection[],
  state: NavGateState,
): NavSection[] {
  const expanded = new Set(state.expandedSections);
  return sections.map((section) => {
    if (expanded.has(section.id)) return section;
    const visible = section.items.filter((item) => {
      // NOT `module`: @next/next/no-assign-module-variable forbids the name.
      const moduleId = MODULE_FOR_HREF[item.href];
      return moduleId ? state.enabledModules.includes(moduleId) : true;
    });
    if (visible.length === section.items.length) return section;
    return {
      ...section,
      items: visible,
      hiddenCount: section.items.length - visible.length,
    };
  });
}
```

- [ ] **Step 7: Names**

In `frontend-customer/messages/en/admin.json` replace the whole `"nav"` object with:

```json
"nav": {
  "sections": {
    "teach": "Teach",
    "students": "Students",
    "reachOut": "Reach out",
    "money": "Money",
    "site": "Site",
    "settings": "Settings"
  },
  "items": {
    "home": "Home",
    "courses": "Courses",
    "liveEvents": "Classes & events",
    "calendar": "Calendar",
    "downloads": "Downloads",
    "students": "People",
    "communityFeed": "Community",
    "inbox": "Inbox",
    "notifications": "Announcements",
    "email": "Email",
    "blog": "Blog",
    "payouts": "Payouts",
    "store": "Store",
    "editSite": "Edit site",
    "design": "Design",
    "photos": "Photos",
    "videos": "Videos",
    "assistant": "Student assistant",
    "settings": "General",
    "plan": "Your plan"
  },
  "more": "+ {count} more",
  "locked": "Not in your plan yet"
},
```

Then find leftovers of the removed keys and delete each use (all are in files Task 2 and Task 5 rewrite; this grep must be empty at the end of Task 5):

Run: `grep -rn "nav.locked.marketing\|nav.unlocked\|nav.advancedEditing\|nav.items.siteAi\|nav.items.library\|nav.items.billing\|nav.sections.content\|nav.sections.mySite\|nav.sections.audience\|nav.sections.marketing" frontend-customer/src`

- [ ] **Step 8: Run both tests; they pass**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/admin-nav.test.ts src/lib/__tests__/admin-nav-gate.test.ts`
Expected: PASS (both files). `/admin/store` does not exist yet, so `src/lib/__tests__/admin-links.test.ts` fails until Task 3 — expected.

- [ ] **Step 9: Commit**

```bash
git add frontend-customer/src/lib/admin-nav.ts frontend-customer/src/lib/admin-nav-gate.ts frontend-customer/src/lib/__tests__/admin-nav.test.ts frontend-customer/src/lib/__tests__/admin-nav-gate.test.ts frontend-customer/src/components/shared/app-sidebar.tsx frontend-customer/messages/en/admin.json
git commit --no-verify -m "refactor(admin): the nav as seven places, each holding one job's pages"
```

---

### Task 2: Seven rows and a tab strip

**Files:**
- Modify: `frontend-customer/src/components/shared/app-sidebar.tsx` (nav body), `frontend-customer/src/components/shared/mobile-header.tsx` (nav body), `frontend-customer/src/components/admin/feature-badges.tsx`, `frontend-customer/src/components/admin/admin-shell.tsx`
- Create: `frontend-customer/src/components/admin/section-tabs.tsx`

**Interfaces:**
- Consumes: `NavSection`, `sectionHref`, `activeSection`, `gateAdminNav` (Task 1).
- Produces: `<SectionTabs section onExpand />`, `<LockedMark feature />`, `AppSidebar` / `MobileHeader` without the `onExpandSection` prop.

- [ ] **Step 1: The quiet lock**

Append to `frontend-customer/src/components/admin/feature-badges.tsx`:

```tsx
/** A small lock beside a page the coach's plan does not include. Renders
 *  nothing while entitlements load, so it never flashes for a paying coach. */
export function LockedMark({ feature }: { feature: EntitlementKey }) {
  const t = useTranslations("admin");
  const locked = useIsLocked(feature);
  if (!locked) return null;
  return (
    <span title={t("nav.locked")} className="inline-flex">
      <Lock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">{t("nav.locked")}</span>
    </span>
  );
}
```

- [ ] **Step 2: The tab strip**

Create `frontend-customer/src/components/admin/section-tabs.tsx`:

```tsx
"use client";

import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";

import { LockedMark } from "@/components/admin/feature-badges";
import type { NavSection } from "@/components/shared/app-sidebar";
import { NavLink } from "@/components/ui/nav-link";
import { cn } from "@/lib/utils";

/** The pages of the section the coach is in, as tabs under the top bar.
 *  Renders nothing for a single-page section with nothing hidden. */
export function SectionTabs({
  section,
  onExpand,
}: {
  section: NavSection | undefined;
  onExpand: (sectionId: string) => void;
}) {
  const t = useTranslations("admin");
  if (!section) return null;
  const hidden = section.hiddenCount ?? 0;
  if (section.items.length < 2 && hidden === 0) return null;

  return (
    <nav
      aria-label={section.label}
      className="flex items-center gap-1 overflow-x-auto border-b bg-card px-4"
    >
      {section.items.map((item) => (
        <NavLink
          key={item.href}
          href={item.href}
          target={item.external ? "_blank" : undefined}
          rel={item.external ? "noopener noreferrer" : undefined}
          className={({ active }) =>
            cn(
              "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors",
              active
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )
          }
        >
          <span>{item.label}</span>
          {item.external && (
            <ExternalLink className="h-3 w-3 text-muted-foreground/60" />
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
          className="shrink-0 px-3 py-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("nav.more", { count: hidden })}
        </button>
      )}
    </nav>
  );
}
```

- [ ] **Step 3: Sidebar rows**

In `frontend-customer/src/components/shared/app-sidebar.tsx`:

1. Remove from the imports: `ChevronDown`, `ExternalLink`, `Lock`, `Separator`'s use inside the nav (keep the footer one), `AiBadge`, `PaidFeatureBadge`, `isNavItemActive`, `useNavigation`, `useEffect`, `useMemo`. Add `import { defaultActiveMatch } from "@shared/navigation/navigation-state";` and `import { sectionHref } from "@/lib/admin-nav";`.
2. Remove the `onExpandSection` prop, and the `openSections`, `activeSectionId`, `toggleSection` state and effects.
3. Replace everything inside `<nav className="flex-1 overflow-y-auto p-2 space-y-1">…</nav>` with:

```tsx
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
          <section.icon className="h-4 w-4 shrink-0" />
        )}
        {!collapsed && <span>{section.label}</span>}
      </>
    )}
  </NavLink>
))}
```

- [ ] **Step 4: Phone drawer rows**

In `frontend-customer/src/components/shared/mobile-header.tsx`: remove the `onExpandSection` prop, the `openSections` state and `toggleSection`, and the now-unused imports (`ChevronDown`, `AiBadge`, `PaidFeatureBadge`, `isNavItemActive`). Add the same two imports as Step 3. Replace everything inside `{open && (<nav className="border-b bg-card p-2 space-y-1">` up to the theme toggle's wrapper with:

```tsx
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
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
        active
          ? "bg-accent text-accent-foreground font-medium"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )
    }
  >
    <section.icon className="h-4 w-4" />
    <span>{section.label}</span>
  </NavLink>
))}
```

Keep the theme toggle, user block and sign-out that follow it unchanged.

- [ ] **Step 5: Wire the shell**

In `frontend-customer/src/components/admin/admin-shell.tsx`:

1. Remove: the `toast` import, `useSetupStatus`, `useEntitlements` (keep `EntitlementsProvider`), `hasSiteAi`, `published`, the `celebrated`/`prevPublished` refs and their effect, and the long comment above `AdminShellContent` about `useEntitlements`.
2. Add imports: `import { SectionTabs } from "@/components/admin/section-tabs";`, `import { activeSection, buildAdminNav } from "@/lib/admin-nav";`, `import { useNavigation } from "@shared/navigation/navigation-provider";`.
3. Replace the `navSections` memo and the lines above it that computed gating inputs with:

```tsx
const config = useTenant();
const { pathname, pendingHref } = useNavigation();
const [expandedSections, setExpandedSections] = useState<string[]>([]);

const navSections = useMemo(() => {
  const sections = buildAdminNav(t);
  // Fail open: until the tenant config loads, show every page so an
  // established coach never sees her tabs pop in.
  if (config === null) return sections;
  return gateAdminNav(sections, {
    enabledModules: config.enabled_modules ?? [],
    expandedSections,
  });
}, [t, config, expandedSections]);

const section = activeSection(navSections, { pathname, pendingHref });
const expandSection = (sectionId: string) =>
  setExpandedSections((prev) =>
    prev.includes(sectionId) ? prev : [...prev, sectionId],
  );
```

4. Drop the `onExpandSection` props from `<AppSidebar>` and `<MobileHeader>`.
5. Directly above `<main …>` add: `<SectionTabs section={section} onExpand={expandSection} />`.
6. On the top bar's "View Site" `<Button>` change the class `shrink-0` to `hidden shrink-0 md:inline-flex` (the phone header already has its own View Site).

- [ ] **Step 6: Typecheck and unit tests**

Run: `docker compose exec -T nextjs-customer npm run typecheck`
Expected: exits 0. (`command-palette.tsx` is untouched and still compiles.)
Run: `cd frontend-customer && npx vitest run src/lib/__tests__/admin-nav.test.ts src/lib/__tests__/admin-nav-gate.test.ts src/lib/__tests__/navigation-state.test.ts`
Expected: PASS.

- [ ] **Step 7: Look at it**

In the dev stack open `http://demo-yoga.localhost/admin/courses` as the coach. Expected: 7 sidebar rows; "Teach" lit; a strip "Courses · Classes & events 🔒 · Calendar · Downloads" with Courses underlined; `/admin` shows no strip. At 375 px width: the drawer lists the same 7 rows and the strip scrolls sideways.

- [ ] **Step 8: Commit**

```bash
git add frontend-customer/src/components/shared/app-sidebar.tsx frontend-customer/src/components/shared/mobile-header.tsx frontend-customer/src/components/admin/section-tabs.tsx frontend-customer/src/components/admin/feature-badges.tsx frontend-customer/src/components/admin/admin-shell.tsx
git commit --no-verify -m "feat(admin): seven sidebar rows, and the section's pages as tabs"
```

---

### Task 3: Store and Your plan are two pages

Pulls "Money split from Your plan" forward from Phase 3: without it "Store" and "Your plan" are one page with one name, and `activeSection` cannot tell them apart.

**Files:**
- Create: `frontend-customer/src/app/admin/store/page.tsx`
- Move: `frontend-customer/src/app/admin/billing/bundles/` → `frontend-customer/src/app/admin/store/bundles/`; `frontend-customer/src/app/admin/billing/plans/` → `frontend-customer/src/app/admin/store/plans/`
- Create (redirects): `frontend-customer/src/app/admin/billing/bundles/new/page.tsx`, `frontend-customer/src/app/admin/billing/bundles/[id]/page.tsx`, `frontend-customer/src/app/admin/billing/plans/[id]/page.tsx`
- Modify: `frontend-customer/src/app/admin/billing/page.tsx`, `frontend-customer/src/app/admin/billing/subscription/page.tsx`
- Test: `frontend-customer/src/lib/__tests__/admin-links.test.ts` (existing; must pass again)

**Interfaces:**
- Produces: routes `/admin/store` (`?tab=products|bundles|plans`), `/admin/store/bundles/new`, `/admin/store/bundles/[id]`, `/admin/store/plans/[id]`; `/admin/billing` shows the coach's plan only.

- [ ] **Step 1: Move the bundle and plan-access pages**

```bash
cd frontend-customer/src/app/admin
mkdir -p store
git mv billing/bundles store/bundles
git mv billing/plans store/plans
grep -rln '/admin/billing?tab=bundles\|/admin/billing?tab=plans\|/admin/billing/bundles\|/admin/billing/plans' ../.. | sort
```

In every file the grep lists (the three moved pages and `billing/page.tsx`) replace `/admin/billing?tab=bundles` → `/admin/store?tab=bundles`, `/admin/billing?tab=plans` → `/admin/store?tab=plans`, `/admin/billing/bundles` → `/admin/store/bundles`, `/admin/billing/plans/` → `/admin/store/plans/`.

- [ ] **Step 2: The Store page**

Create `frontend-customer/src/app/admin/store/page.tsx` by moving, from `billing/page.tsx`, the `ProductsTab`, `BundlesTab` and `PlansTab` functions with every type, constant and import only they use, then add:

```tsx
"use client";

// (moved imports, types, ProductsTab, BundlesTab, PlansTab above)

const STORE_TABS = ["products", "bundles", "plans"];

export default function StorePage() {
  const t = useTranslations("admin");
  const tabParam = useSearchParams().get("tab");
  const tab = tabParam && STORE_TABS.includes(tabParam) ? tabParam : "products";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("nav.items.store")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("store.subtitle")}</p>
      </div>
      {/* key remounts the tabs when ?tab= changes under the same page. */}
      <Tabs defaultValue={tab} key={tab}>
        <TabsList>
          <TabsTrigger value="products">{t("store.tabs.products")}</TabsTrigger>
          <TabsTrigger value="bundles">{t("store.tabs.bundles")}</TabsTrigger>
          <TabsTrigger value="plans">{t("store.tabs.plans")}</TabsTrigger>
        </TabsList>
        <TabsContent value="products">
          <ProductsTab />
        </TabsContent>
        <TabsContent value="bundles">
          <BundlesTab />
        </TabsContent>
        <TabsContent value="plans">
          <PlansTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

Add to `messages/en/admin.json` (top level): `"store": { "subtitle": "What your students can buy from you.", "tabs": { "products": "Products", "bundles": "Bundles", "plans": "Memberships" } }`. The per-tab `PaidFeatureBadge`s are dropped: the Store tab in the strip already carries the lock.

- [ ] **Step 3: Billing shows her plan only**

Reduce `frontend-customer/src/app/admin/billing/page.tsx` to:

```tsx
"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useNavigate } from "@shared/navigation/navigation-provider";
import { ChangePlanCard } from "./subscription/ChangePlanCard";
import { SubscriptionTile } from "./subscription/SubscriptionTile";

export const dynamic = "force-dynamic";

const STORE_TABS = ["products", "bundles", "plans"];

/** The coach's own Contentor plan. What she sells lives in /admin/store. */
export default function PlanPage() {
  const t = useTranslations("admin");
  const navigate = useNavigate();
  const searchParams = useSearchParams();
  const checkout = searchParams.get("checkout");
  const tab = searchParams.get("tab");

  // Old links: /admin/billing?tab=products|bundles|plans.
  useEffect(() => {
    if (tab && STORE_TABS.includes(tab)) navigate(`/admin/store?tab=${tab}`);
  }, [tab, navigate]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("nav.items.plan")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("plan.subtitle")}</p>
      </div>
      <SubscriptionTile
        pollUntilActive={checkout === "success"}
        showCanceledNotice={checkout === "cancel"}
      />
      <ChangePlanCard />
    </div>
  );
}
```

(Keep `export const dynamic` only if the file has it today.) Add `"plan": { "subtitle": "What you pay Contentor, and what it includes." }` to `messages/en/admin.json`. Change `billing/subscription/page.tsx`'s target to `redirect("/admin/billing")`.

- [ ] **Step 4: Redirects for the moved pages**

Create `frontend-customer/src/app/admin/billing/bundles/new/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function BundleNewRedirect() {
  redirect("/admin/store/bundles/new");
}
```

Create `frontend-customer/src/app/admin/billing/bundles/[id]/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function BundleRedirect({ params }: { params: { id: string } }) {
  redirect(`/admin/store/bundles/${params.id}`);
}
```

Create `frontend-customer/src/app/admin/billing/plans/[id]/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function PlanAccessRedirect({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/admin/store/plans/${params.id}`);
}
```

- [ ] **Step 5: Every remaining link to the old tabs**

Run: `grep -rn 'admin/billing?tab=\|tab=subscription' frontend-customer/src --include='*.ts' --include='*.tsx'`
Replace `?tab=products|bundles|plans` targets with `/admin/store?tab=…` and `/admin/billing?tab=subscription` with `/admin/billing` (e.g. `app/admin/payouts/page.tsx`).

- [ ] **Step 6: Tests**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/admin-links.test.ts src/lib/__tests__/admin-nav.test.ts`
Expected: PASS — no `/admin` link without a page, and `/admin/store/bundles/new` resolves to Money.
Run: `docker compose exec -T nextjs-customer npm run typecheck` — exits 0.

- [ ] **Step 7: Look at it**

`/admin/store`: title "Store", three tabs, Money lit. `/admin/billing`: title "Your plan", Settings lit, strip "General · Your plan". `/admin/billing?tab=bundles` lands on `/admin/store?tab=bundles`. `/admin/billing?checkout=success` still shows the plan tile.

- [ ] **Step 8: Commit**

```bash
git add frontend-customer/src/app/admin/store frontend-customer/src/app/admin/billing frontend-customer/messages/en/admin.json frontend-customer/src/app/admin/payouts/page.tsx
git commit --no-verify -m "refactor(admin): Store (what she sells) and Your plan (what she pays) are two pages"
```

(Add any other file Step 5 changed to the `git add`.)

---

### Task 4: One name per page

**Files:**
- Modify: the `<h1>` of each page below, and `backend/apps/tenant_config/help_kb.md` (route table)
- Test: `frontend-customer/src/lib/__tests__/admin-page-titles.test.ts` (create)

**Interfaces:**
- Consumes: `buildAdminNav` item keys (Task 1).

- [ ] **Step 1: The failing test**

Create `frontend-customer/src/lib/__tests__/admin-page-titles.test.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildAdminNav } from "@/lib/admin-nav";

const SRC = path.resolve(__dirname, "../..");

/** Pages whose <h1> lives in a component rather than in page.tsx. */
const TITLE_FILE: Record<string, string> = {
  "/admin/calendar": "components/admin/calendar/unified-calendar.tsx",
};
/** The inbox is a mail client: its folder rail is its heading. */
const NO_TITLE = new Set(["/admin/inbox"]);

describe("one name per page", () => {
  const items = buildAdminNav((key) => key)
    .flatMap((section) => section.items)
    .filter((item) => !item.external && !NO_TITLE.has(item.href));

  it.each(items.map((item) => [item.href, item.key] as const))(
    "%s titles itself nav.items.%s",
    (href, key) => {
      const rel =
        TITLE_FILE[href] ??
        path.join("app", href === "/admin" ? "admin" : href, "page.tsx");
      const file = path.join(SRC, rel);
      expect(existsSync(file), `${rel} exists`).toBe(true);
      const source = readFileSync(file, "utf8");
      expect(source).toMatch(
        new RegExp(`<h1[^>]*>[\\s\\S]{0,80}t\\("nav\\.items\\.${key}"\\)`),
      );
    },
  );
});
```

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/admin-page-titles.test.ts`
Expected: FAIL for every page except `/admin/store` and `/admin/billing` (done in Task 3).

- [ ] **Step 2: Title each page from its nav key**

In each file make the `<h1>`'s content `{t("nav.items.<key>")}`, adding `import { useTranslations } from "next-intl";` and `const t = useTranslations("admin");` where the component does not have them (all are client components). Keep each `<h1>`'s existing classes; drop icons inside the `<h1>`. Replace the subtitle where one is listed.

| File | key | Was | Subtitle becomes |
|---|---|---|---|
| `app/admin/page.tsx` | `home` | Dashboard | unchanged |
| `app/admin/courses/page.tsx` | `courses` | Courses | unchanged |
| `app/admin/live/page.tsx` | `liveEvents` | Live Events | unchanged |
| `components/admin/calendar/unified-calendar.tsx` | `calendar` | Unified Content Calendar | "Your classes, emails and blog posts, by date." |
| `app/admin/downloads/page.tsx` | `downloads` | Downloads | unchanged |
| `app/admin/students/page.tsx` | `students` | Student CRM & Engagement | "Everyone who has joined, what they are enrolled in and how far they are." |
| `app/admin/community/page.tsx` | `communityFeed` | Community | (none) |
| `app/admin/notifications/page.tsx` | `notifications` | Announcements | (none) |
| `app/admin/email/page.tsx` | `email` | Email Campaigns | unchanged |
| `app/admin/blog/page.tsx` | `blog` | `t("blog.title")` | unchanged |
| `app/admin/payouts/page.tsx` | `payouts` | Payouts | unchanged |
| `app/admin/photos/page.tsx` | `photos` | Photo Asset Library | "Images you can use on your site, courses and posts." |
| `app/admin/videos/page.tsx` | `videos` | Video Asset Library | "Videos you can use in your lessons." |
| `app/admin/assistant/page.tsx` | `assistant` | `t("assistant.title")` | unchanged |
| `app/admin/settings/page.tsx` | `settings` | Settings | unchanged |

New subtitles are literals in the file, like their neighbours (D6 covers new *names*; the sweep of existing copy is out of scope).

- [ ] **Step 3: The test passes**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/admin-page-titles.test.ts`
Expected: PASS (17 cases).

- [ ] **Step 4: The help KB follows**

In `backend/apps/tenant_config/help_kb.md` replace the rows of the route table (the table under "The ONLY links you may include in answers") with:

```markdown
| /admin | Home | Overview stats; the publish card lives here |
| /admin/courses | Courses | Managing or editing courses |
| /admin/courses/new | New course | Creating the first/next course |
| /admin/live | Classes & events | Scheduling live classes, streams, Zoom, in-person events; starting/stopping a broadcast |
| /admin/calendar | Calendar | Seeing classes, emails and blog posts by date |
| /admin/downloads | Downloads | Adding or selling downloadable files |
| /admin/students | People | Student list, finding a student, refunds (via student detail) |
| /admin/community | Community | Enabling community, moderation, members |
| /admin/inbox | Inbox | Reading/answering student email, new message |
| /admin/notifications | Announcements | Sending announcements, templates, recurring |
| /admin/email | Email | Campaign list and delivery results |
| /admin/email/templates | Email templates | Designing email templates |
| /admin/email/compose | New email | Sending a campaign |
| /admin/payouts | Payouts | Connecting Stripe, payout status, earnings |
| /admin/store | Store | Products, bundles, memberships students can buy |
| /admin/store/bundles/new | New bundle | Creating a bundle |
| /admin/photos | Photos | Uploading images/thumbnails |
| /admin/videos | Videos | Uploading/managing the video library, recordings |
| /admin/assistant | Student assistant | The chat helper students see on the site |
| /?edit=1 | Edit site | Editing the six site pages in the builder |
| /?edit=1&section=brand | Design | Theme, font, dark mode, logo, Logo Studio, AI Brand Pack |
| /admin/settings | General | Timezone, mailbox address, remove demo content |
| /admin/billing | Your plan | The coach's own Contentor plan and upgrade |
```

Then fix prose in the same file that names an old page: run `grep -n "Billing → Subscription\|Live Events\|Dashboard's\|Videos library" backend/apps/tenant_config/help_kb.md` and rewrite each hit to the new name ("Settings → Your plan", "Classes & events", "Home's", "Videos (under Site)").

Run: `docker compose exec -T django pytest apps/core/tests/test_platform_kb.py apps/tenant_config/tests/test_help_bot.py apps/core/tests/test_help_public.py apps/tenant_config/tests/test_help_bot_views.py -q -p no:cacheprovider`
Expected: 42 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/lib/__tests__/admin-page-titles.test.ts frontend-customer/src/app/admin frontend-customer/src/components/admin/calendar/unified-calendar.tsx backend/apps/tenant_config/help_kb.md
git commit --no-verify -m "refactor(admin): every page titles itself with its nav name"
```

(`git add frontend-customer/src/app/admin` is safe only if `git status --short frontend-customer/src/app/admin` lists nothing but this task's files; otherwise add them one by one.)

---

### Task 5: One docked assistant

**Files:**
- Create: `frontend-customer/src/lib/assistant-dock.ts`, `frontend-customer/src/lib/__tests__/assistant-dock.test.ts`, `frontend-customer/src/components/admin/assistant-dock.tsx`, `frontend-customer/src/components/copilot/audit-list.tsx`
- Modify: `frontend-customer/src/components/copilot/copilot-bubble.tsx`, `frontend-customer/src/components/setup/setup-assistant-panel.tsx`, `frontend-customer/src/components/admin/admin-shell.tsx`, `frontend-customer/src/components/admin/setup-guide-card.tsx`, `frontend-customer/src/app/admin/layout.tsx`, `frontend-customer/src/app/admin/site-ai/page.tsx`, `frontend-customer/messages/en/admin.json`

**Interfaces:**
- Produces: `DockTab = "assistant" | "setup" | "help" | "history"`, `dockTabs({ setupOpen, helpOn }): DockTab[]`, `dockFromUrl(search: string, wasOpen: boolean): { open: boolean; tab: DockTab }`, `useAssistantDock(): { isOpen; tab; open(tab?); close(); toggle() }`, `<AssistantDockProvider>`, `<AssistantDock />`, `<CopilotAuditList />`, `<CopilotBubble docked />`, `<SetupAssistantPanel variant="inline" />`.

- [ ] **Step 1: The dock's logic, test first**

Create `frontend-customer/src/lib/__tests__/assistant-dock.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dockFromUrl, dockTabs } from "@/lib/assistant-dock";

describe("dockTabs", () => {
  it("offers Setup only while setup is unfinished, Help only when it is on", () => {
    expect(dockTabs({ setupOpen: true, helpOn: true })).toEqual([
      "assistant",
      "setup",
      "help",
      "history",
    ]);
    expect(dockTabs({ setupOpen: false, helpOn: false })).toEqual([
      "assistant",
      "history",
    ]);
  });
});

describe("dockFromUrl", () => {
  it("opens on the tab a link asks for", () => {
    expect(dockFromUrl("?assistant=history", false)).toEqual({
      open: true,
      tab: "history",
    });
  });

  it("keeps the old copilot link working", () => {
    expect(dockFromUrl("?copilot=1", false)).toEqual({
      open: true,
      tab: "assistant",
    });
  });

  it("reopens where the coach left it", () => {
    expect(dockFromUrl("", true)).toEqual({ open: true, tab: "assistant" });
    expect(dockFromUrl("", false)).toEqual({ open: false, tab: "assistant" });
  });

  it("ignores a tab it does not know", () => {
    expect(dockFromUrl("?assistant=billing", false)).toEqual({
      open: false,
      tab: "assistant",
    });
  });
});
```

Run it: FAIL (module missing). Then create `frontend-customer/src/lib/assistant-dock.ts`:

```ts
export const DOCK_TABS = ["assistant", "setup", "help", "history"] as const;
export type DockTab = (typeof DOCK_TABS)[number];

/** The tabs the panel shows right now. */
export function dockTabs({
  setupOpen,
  helpOn,
}: {
  setupOpen: boolean;
  helpOn: boolean;
}): DockTab[] {
  return DOCK_TABS.filter((tab) =>
    tab === "setup" ? setupOpen : tab === "help" ? helpOn : true,
  );
}

/** Whether the panel starts open, and on which tab: `?assistant=<tab>` wins,
 *  then the old `?copilot=1`, then where the coach left it. */
export function dockFromUrl(
  search: string,
  wasOpen: boolean,
): { open: boolean; tab: DockTab } {
  const params = new URLSearchParams(search);
  const asked = params.get("assistant");
  if (asked && (DOCK_TABS as readonly string[]).includes(asked)) {
    return { open: true, tab: asked as DockTab };
  }
  return {
    open: params.get("copilot") === "1" || wasOpen,
    tab: "assistant",
  };
}
```

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/assistant-dock.test.ts` — PASS (6 tests).

- [ ] **Step 2: The audit list, moved out of the Site AI page**

Create `frontend-customer/src/components/copilot/audit-list.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { PageState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchCopilotAudit } from "@/lib/copilot/api";
import type { CopilotAuditEntry } from "@/lib/copilot/types";

/** Everything the assistant has applied, newest first. */
export function CopilotAuditList() {
  const t = useTranslations("admin");
  const [entries, setEntries] = useState<CopilotAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchCopilotAudit()
      .then((res) => {
        if (!cancelled) setEntries(res.entries);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <PageState
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        skeleton={
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        }
      >
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("dock.noChangesYet")}
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {entries.map((e) => (
              <li key={e.id} className="flex items-baseline gap-3 p-3">
                <span className="flex-1 text-sm">{e.summary || e.kind}</span>
                <time
                  dateTime={e.created_at}
                  className="shrink-0 text-xs text-muted-foreground"
                >
                  {new Date(e.created_at).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </PageState>
    </div>
  );
}
```

Replace `frontend-customer/src/app/admin/site-ai/page.tsx` with:

```tsx
import { redirect } from "next/navigation";

/** The assistant's change log moved into the assistant panel. */
export default function SiteAiRedirect() {
  redirect("/admin?assistant=history");
}
```

In `messages/en/admin.json` delete the `"siteAi"` object and add:

```json
"dock": {
  "title": "Assistant",
  "close": "Close the assistant",
  "tabs": {
    "assistant": "Assistant",
    "setup": "Setup",
    "help": "Help",
    "history": "History"
  },
  "noChangesYet": "No changes yet — everything your assistant applies will show up here."
},
```

- [ ] **Step 3: The copilot can sit in a panel**

In `frontend-customer/src/components/copilot/copilot-bubble.tsx`:

1. Signature: `export function CopilotBubble({ docked = false }: { docked?: boolean }) {` and `const [open, setOpen] = useState(docked);`.
2. The launcher branch: change `if (!open) {` to `if (!open && !docked) {` and add `if (!open) return null;` directly after that block.
3. The drawer's wrapper `<div data-copilot-ui className="fixed right-0 z-[60] …" style={{…}}>` becomes:

```tsx
<div
  data-copilot-ui
  className={
    docked
      ? "flex min-h-0 flex-1 flex-col"
      : "fixed right-0 z-[60] flex w-[min(26rem,100vw)] flex-col border-l bg-background shadow-xl motion-safe:animate-in motion-safe:slide-in-from-right motion-safe:duration-200"
  }
  // Floating: the drawer fits between the site chrome (navbar and PWA
  // install banner publish their heights). Docked: the panel sizes it.
  style={
    docked
      ? undefined
      : {
          top: "var(--topnav-clearance, 0px)",
          bottom: "var(--install-banner-clearance, 0px)",
        }
  }
>
```

4. Wrap the header's close `<Button … aria-label={t("close")}>` in `{!docked && ( … )}` — the panel has its own.

- [ ] **Step 4: The setup panel can sit in a panel**

In `frontend-customer/src/components/setup/setup-assistant-panel.tsx`:

1. Props: add `variant = "sheet"` with type `variant?: "sheet" | "inline"`.
2. Inside the header, wrap the close `<button aria-label={t("setup.dismiss")} onClick={onClose}>` and the `{helpAvailable && (<div … role="tablist">…</div>)}` block each in `{variant === "sheet" && ( … )}`.
3. In the footer `<div className="border-t p-3 pb-16 text-center">` use `className={variant === "inline" ? "border-t p-3 text-center" : "border-t p-3 pb-16 text-center"}` (the extra padding cleared the floating bubbles).
4. Hoist the children of `<aside …>` into `const content = (<> … </>);` and end the component with:

```tsx
if (variant === "inline") {
  return <div className="flex min-h-0 flex-1 flex-col">{content}</div>;
}

return (
  <ModalPortal>
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label={t("setup.dismiss")}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col bg-background shadow-xl">
        {content}
      </aside>
    </div>
  </ModalPortal>
);
```

The site editor keeps calling it without `variant`, so it is unchanged there.

- [ ] **Step 5: The dock**

Create `frontend-customer/src/components/admin/assistant-dock.tsx`:

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { CopilotAuditList } from "@/components/copilot/audit-list";
import { CopilotBubble } from "@/components/copilot/copilot-bubble";
import { SetupAssistantPanel } from "@/components/setup/setup-assistant-panel";
import { Button } from "@/components/ui/button";
import {
  dockFromUrl,
  dockTabs,
  type DockTab,
} from "@/lib/assistant-dock";
import { loadUiState, saveUiState } from "@/lib/copilot/storage";
import { useHelpBotStatus } from "@/lib/help-bot";
import { useSetupStatus } from "@/lib/setup-assistant";
import { cn } from "@/lib/utils";

interface DockApi {
  isOpen: boolean;
  tab: DockTab;
  open: (tab?: DockTab) => void;
  close: () => void;
  toggle: () => void;
}

const DockContext = createContext<DockApi>({
  isOpen: false,
  tab: "assistant",
  open() {},
  close() {},
  toggle() {},
});

/** Open, close or switch the admin's assistant panel from any admin page. */
export const useAssistantDock = () => useContext(DockContext);

export function AssistantDockProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<DockTab>("assistant");

  useEffect(() => {
    // window.location, not useSearchParams: avoids the Next 14 client-side
    // Suspense bailout (same reason as copilot-bubble.tsx).
    const start = dockFromUrl(window.location.search, loadUiState().open);
    setTab(start.tab);
    setIsOpen(start.open);
  }, []);

  const open = useCallback((next?: DockTab) => {
    if (next) setTab(next);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => {
    setIsOpen(false);
    // The docked chat only ever writes open: true; closing is ours to record,
    // so the panel stays shut on the next page and on the public site.
    saveUiState({ open: false, chatId: loadUiState().chatId });
  }, []);
  const api = useMemo(
    () => ({
      isOpen,
      tab,
      open,
      close,
      toggle: () => (isOpen ? close() : open()),
    }),
    [isOpen, tab, open, close],
  );

  return <DockContext.Provider value={api}>{children}</DockContext.Provider>;
}

/** The admin's one assistant: chat, setup checklist, help and change log in
 *  a panel beside the page (a full-screen sheet on a phone). */
export function AssistantDock() {
  const t = useTranslations("admin");
  const dock = useAssistantDock();
  const setup = useSetupStatus();
  const help = useHelpBotStatus();
  // The chat stays mounted once opened, so a turn in flight survives a look
  // at another tab.
  const [chatSeen, setChatSeen] = useState(false);

  const tabs = dockTabs({
    setupOpen:
      !!setup && !setup.dismissed && setup.progress.done < setup.progress.total,
    helpOn: !help || help.enabled || help.reason !== "disabled",
  });
  const tab = tabs.includes(dock.tab) ? dock.tab : "assistant";

  useEffect(() => {
    if (dock.isOpen && tab === "assistant") setChatSeen(true);
  }, [dock.isOpen, tab]);

  if (!dock.isOpen) return null;

  return (
    <aside
      aria-label={t("dock.title")}
      className="fixed inset-0 z-[60] flex flex-col bg-background lg:static lg:z-auto lg:w-[26rem] lg:shrink-0 lg:border-l"
    >
      <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5">
        <div className="flex gap-1" role="tablist">
          {tabs.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => dock.open(key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                tab === key
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`dock.tabs.${key}`)}
              {key === "setup" && setup
                ? ` ${setup.progress.done}/${setup.progress.total}`
                : ""}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={dock.close}
          aria-label={t("dock.close")}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>
      {chatSeen && (
        <div
          className={cn(
            "min-h-0 flex-1 flex-col",
            tab === "assistant" ? "flex" : "hidden",
          )}
        >
          <CopilotBubble docked />
        </div>
      )}
      {(tab === "setup" || tab === "help") && (
        <SetupAssistantPanel
          variant="inline"
          open
          onClose={dock.close}
          initialTab={tab === "help" ? "help" : "checklist"}
        />
      )}
      {tab === "history" && <CopilotAuditList />}
    </aside>
  );
}
```

- [ ] **Step 6: Mount it; unmount the bubbles**

1. `frontend-customer/src/app/admin/layout.tsx`: delete the `CopilotBubble` import and `<CopilotBubble />`; return `<AdminShell user={user}>{children}</AdminShell>` alone.
2. `frontend-customer/src/components/admin/admin-shell.tsx`:
   - Delete the `SetupAssistantBubble` import and `<SetupAssistantBubble />`.
   - Import `AssistantDock`, `AssistantDockProvider`, `useAssistantDock` from `@/components/admin/assistant-dock`, `Sparkles` from `lucide-react`, and `useSetupStatus` from `@/lib/setup-assistant`.
   - In `AdminShell` wrap: `<EntitlementsProvider><AssistantDockProvider><AdminShellContent user={user}>{children}</AdminShellContent></AssistantDockProvider></EntitlementsProvider>`.
   - In `AdminShellContent` add `const dock = useAssistantDock();` and `const setup = useSetupStatus();`.
   - In the top bar, before the View Site button, add:

```tsx
<Button
  variant="outline"
  size="sm"
  className="ml-auto h-8 shrink-0 gap-1.5 text-xs font-medium shadow-sm"
  onClick={dock.toggle}
  aria-pressed={dock.isOpen}
>
  <Sparkles className="h-3.5 w-3.5" />
  <span>{t("dock.title")}</span>
  {setup && !setup.dismissed && setup.progress.done < setup.progress.total && (
    <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">
      {setup.progress.done}/{setup.progress.total}
    </span>
  )}
</Button>
```

   - As the last child of the root `<div className="flex h-screen">`, before `<CommandPalette …>`, add `<AssistantDock />`.
3. `frontend-customer/src/components/admin/setup-guide-card.tsx`: delete the `SetupAssistantPanel` import, the `open` state and the `<SetupAssistantPanel … />` element (and the fragment that wrapped it); add `const dock = useAssistantDock();` and make the button `onClick={() => dock.open("setup")}`.

- [ ] **Step 7: Check**

Run: `grep -rn "nav.locked.marketing\|nav.unlocked\|nav.advancedEditing\|nav.items.siteAi\|nav.items.library\|nav.items.billing\|siteAi\.\|nav.sections.content\|nav.sections.mySite\|nav.sections.audience\|nav.sections.marketing" frontend-customer/src` — expected: no output.
Run: `docker compose exec -T nextjs-customer npm run typecheck` — exits 0.
Run: `cd frontend-customer && npx vitest run` — all pass.

- [ ] **Step 8: Look at it**

As the coach on `http://demo-yoga.localhost/admin/courses` at 1440 px: no floating buttons; the top bar has "Assistant 4/10"; clicking it opens a panel on the right and the course grid narrows instead of being covered; tabs Assistant · Setup 4/10 · Help · History each show their content; closing and reloading keeps it closed. `/admin/site-ai` lands on `/admin?assistant=history` with the panel open on History. The dashboard's "Open the setup guide" opens the panel on Setup. At 375 px: the panel covers the screen, has a close button, and the header shows one "View Site". On `http://demo-yoga.localhost/?copilot=1` the floating copilot is unchanged.

- [ ] **Step 9: Commit**

```bash
git add frontend-customer/src/lib/assistant-dock.ts frontend-customer/src/lib/__tests__/assistant-dock.test.ts frontend-customer/src/components/admin/assistant-dock.tsx frontend-customer/src/components/copilot/audit-list.tsx frontend-customer/src/components/copilot/copilot-bubble.tsx frontend-customer/src/components/setup/setup-assistant-panel.tsx frontend-customer/src/components/admin/admin-shell.tsx frontend-customer/src/components/admin/setup-guide-card.tsx frontend-customer/src/app/admin/layout.tsx frontend-customer/src/app/admin/site-ai/page.tsx frontend-customer/messages/en/admin.json
git commit --no-verify -m "feat(admin): one assistant panel beside the page, in place of two bubbles and a page"
```

---

### Task 6: Search from the nav

**Files:**
- Create: `frontend-customer/src/lib/admin-palette.ts`, `frontend-customer/src/lib/__tests__/admin-palette.test.ts`
- Modify: `frontend-customer/src/components/admin/command-palette.tsx`, `frontend-customer/src/components/admin/admin-shell.tsx`, `frontend-customer/messages/en/admin.json`

**Interfaces:**
- Consumes: `buildAdminNav` (Task 1), `useAssistantDock` (Task 5).
- Produces: `PaletteEntry { id: string; label: string; group: string; href: string; icon; newTab?: boolean }`, `paletteEntries(sections, t): PaletteEntry[]`, `filterPalette(entries, query): PaletteEntry[]`.

- [ ] **Step 1: Test first**

Create `frontend-customer/src/lib/__tests__/admin-palette.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildAdminNav } from "@/lib/admin-nav";
import { filterPalette, paletteEntries } from "@/lib/admin-palette";

const t = (key: string) => key;
const nav = buildAdminNav(t);
const entries = paletteEntries(nav, t);

describe("paletteEntries", () => {
  it("lists every nav page under its section's name, with the nav's label", () => {
    const pages = entries.filter((e) => e.group !== "palette.create");
    expect(pages.map((e) => [e.group, e.label, e.href])).toEqual(
      nav.flatMap((s) => s.items.map((i) => [s.label, i.label, i.href])),
    );
  });

  it("opens the site editor in a new tab", () => {
    expect(entries.find((e) => e.href === "/?edit=1")?.newTab).toBe(true);
    expect(entries.find((e) => e.href === "/admin/courses")?.newTab).toBe(
      undefined,
    );
  });

  it("offers only creates that open a create form", () => {
    expect(
      entries.filter((e) => e.group === "palette.create").map((e) => e.href),
    ).toEqual(["/admin/courses/new", "/admin/email/compose"]);
  });
});

describe("filterPalette", () => {
  it("returns everything for an empty query", () => {
    expect(filterPalette(entries, "  ")).toEqual(entries);
  });

  it("matches a label or a section name, ignoring case", () => {
    const labelled = [
      { ...entries[0], label: "Courses", group: "Teach" },
      { ...entries[1], label: "Inbox", group: "Students" },
    ];
    expect(filterPalette(labelled, "cour").map((e) => e.label)).toEqual([
      "Courses",
    ]);
    expect(filterPalette(labelled, "STUD").map((e) => e.label)).toEqual([
      "Inbox",
    ]);
    expect(filterPalette(labelled, "zzz")).toEqual([]);
  });
});
```

Run it: FAIL (module missing).

- [ ] **Step 2: The entries**

Create `frontend-customer/src/lib/admin-palette.ts`:

```ts
import { Mail, PlusCircle } from "lucide-react";

import type { NavSection } from "@/components/shared/app-sidebar";

export interface PaletteEntry {
  id: string;
  label: string;
  /** The section the page lives in, or the "create" group. */
  group: string;
  href: string;
  icon: NavSection["icon"];
  newTab?: boolean;
}

/** Search entries: two real creates, then every page of the nav under the
 *  nav's own names. Built from the UNGATED nav on purpose — search still
 *  finds the pages of a module the coach has not turned on. */
export function paletteEntries(
  sections: NavSection[],
  t: (key: string) => string,
): PaletteEntry[] {
  const create = t("palette.create");
  return [
    {
      id: "create-course",
      label: t("palette.newCourse"),
      group: create,
      href: "/admin/courses/new",
      icon: PlusCircle,
    },
    {
      id: "create-email",
      label: t("palette.newEmail"),
      group: create,
      href: "/admin/email/compose",
      icon: Mail,
    },
    ...sections.flatMap((section) =>
      section.items.map((item) => ({
        id: item.key,
        label: item.label,
        group: section.label,
        href: item.href,
        icon: item.icon,
        ...(item.external ? { newTab: true } : {}),
      })),
    ),
  ];
}

export function filterPalette(
  entries: PaletteEntry[],
  query: string,
): PaletteEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(
    (e) =>
      e.label.toLowerCase().includes(q) || e.group.toLowerCase().includes(q),
  );
}
```

Add to `messages/en/admin.json`: `"palette": { "placeholder": "Search pages…", "create": "Create", "newCourse": "New course", "newEmail": "New email", "empty": "No page by that name.", "askAssistant": "Open the assistant" }`.

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/admin-palette.test.ts` — PASS (5 tests).

- [ ] **Step 3: The palette renders them**

In `frontend-customer/src/components/admin/command-palette.tsx`:

1. Delete the `CommandItem` interface, the hard-coded items array and every lucide import only it used.
2. Props become `{ open, onOpenChange, entries, onAskAssistant }: { open: boolean; onOpenChange: (open: boolean) => void; entries: PaletteEntry[]; onAskAssistant: () => void }`.
3. Replace the `filteredItems` memo with `const filteredItems = useMemo(() => filterPalette(entries, query), [entries, query]);`.
4. In the row renderer use `item.group` where it used `item.category`, drop `item.description`, and keep the existing keyboard handling and `newTab` branch as they are.
5. Replace the empty state with a button: `<button type="button" onClick={() => { onOpenChange(false); onAskAssistant(); }} className="w-full px-4 py-6 text-center text-sm text-muted-foreground hover:text-foreground">{t("palette.empty")} {t("palette.askAssistant")}</button>` (add `const t = useTranslations("admin");`).
6. Replace the input's placeholder and the footer's "Coach Admin Command Palette" literal with `t("palette.placeholder")` and nothing.

In `admin-shell.tsx`: `const paletteItems = useMemo(() => paletteEntries(buildAdminNav(t), t), [t]);`, render `<CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} entries={paletteItems} onAskAssistant={() => dock.open("assistant")} />`, and change the top bar's "Search commands or pages..." literal to `{t("palette.placeholder")}`.

- [ ] **Step 4: Check and look**

Run: `docker compose exec -T nextjs-customer npm run typecheck` — exits 0.
In the browser press ⌘K on `/admin`: the list starts with "New course", "New email", then pages grouped Teach / Students / …; typing "peo" leaves "People"; typing "zzz" offers the assistant, and choosing it opens the panel.

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/lib/admin-palette.ts frontend-customer/src/lib/__tests__/admin-palette.test.ts frontend-customer/src/components/admin/command-palette.tsx frontend-customer/src/components/admin/admin-shell.tsx frontend-customer/messages/en/admin.json
git commit --no-verify -m "refactor(admin): search lists the nav's own pages under their own names"
```

---

### Task 7: Settings says where every setting is

**Files:**
- Modify: `frontend-customer/src/app/admin/settings/page.tsx`, `frontend-customer/src/app/admin/community/page.tsx`, `frontend-customer/messages/en/admin.json`

- [ ] **Step 1: Community opens on a tab from the URL**

In `frontend-customer/src/app/admin/community/page.tsx` replace `<Tabs defaultValue="feed">` with a URL-seeded default, read once on mount the same way `app/admin/live/page.tsx` does:

```tsx
const [tab, setTab] = useState("feed");
useEffect(() => {
  const asked = new URLSearchParams(window.location.search).get("tab");
  if (asked && ["feed", "reports", "members", "settings"].includes(asked)) {
    setTab(asked);
  }
}, []);
// …
<Tabs value={tab} onValueChange={setTab}>
```

(Add `useEffect`, `useState` imports. Check the four `TabsTrigger` values in the file match that list and correct the list if they differ.)

- [ ] **Step 2: The list of other settings**

In `frontend-customer/src/app/admin/settings/page.tsx`, after `<MailboxSettingsSection />`, add:

```tsx
<Card>
  <CardHeader>
    <CardTitle className="text-base">{t("settingsHub.title")}</CardTitle>
  </CardHeader>
  <CardContent>
    <ul className="divide-y text-sm">
      {(
        [
          ["brand", "/?edit=1&section=brand", true],
          ["menu", "/?edit=1&section=navbar", true],
          ["community", "/admin/community?tab=settings", false],
          ["assistant", "/admin/assistant", false],
          ["autopilot", "/admin/blog", false],
          ["payouts", "/admin/payouts", false],
          ["plan", "/admin/billing", false],
        ] as const
      ).map(([key, href, newTab]) => (
        <li key={key}>
          <NavLink
            href={href}
            target={newTab ? "_blank" : undefined}
            rel={newTab ? "noopener noreferrer" : undefined}
            className="flex items-center justify-between gap-3 py-2.5 hover:text-primary"
          >
            <span>{t(`settingsHub.${key}`)}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </NavLink>
        </li>
      ))}
    </ul>
  </CardContent>
</Card>
```

Imports: `Card, CardContent, CardHeader, CardTitle` from `@/components/ui/card` (skip those already imported), `ChevronRight` from `lucide-react`, `NavLink` from `@/components/ui/nav-link`.

Add to `messages/en/admin.json`:

```json
"settingsHub": {
  "title": "More settings",
  "brand": "Site name, logo, colours and fonts",
  "menu": "Site menu and header button",
  "community": "Community on or off, and its welcome message",
  "assistant": "The assistant your students see",
  "autopilot": "Blog autopilot",
  "payouts": "How you get paid",
  "plan": "Your Contentor plan"
},
```

- [ ] **Step 3: Check**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/admin-links.test.ts` — PASS (`/admin/community?tab=settings` resolves).
In the browser `/admin/settings` lists seven links; "Community on or off…" opens the community page on its Settings tab; the first two open the site editor in a new tab.

- [ ] **Step 4: Commit**

```bash
git add frontend-customer/src/app/admin/settings/page.tsx frontend-customer/src/app/admin/community/page.tsx frontend-customer/messages/en/admin.json
git commit --no-verify -m "feat(admin): Settings lists where every other setting lives"
```

---

### Task 8: End-to-end specs follow the shell

**Files:**
- Modify: `e2e/specs/27-nav-stage-gating.spec.ts`, `e2e/specs/25-navigation-feedback.spec.ts`, any other spec the grep below finds
- Modify: `docs/REFERENCE.md` (the paragraph describing the admin nav, if one exists)

- [ ] **Step 1: Find what the old shell is asserted on**

Run: `grep -rn "more/i\|open marketing\|/^library\|/^blog/i\|Setup guide\|Open help chat\|Your AI assistant\|admin/billing?tab\|admin/site-ai\|Search commands" e2e/specs e2e/helpers`

Expected hits: `27-nav-stage-gating.spec.ts` (Marketing lock, "+ N more", Library) and `29-copilot.spec.ts` ("Your AI assistant" — on the public site at `/?copilot=1`, unchanged, leave it).

- [ ] **Step 2: Rewrite the gating spec's two tests**

In `e2e/specs/27-nav-stage-gating.spec.ts` keep the file's imports, tenant setup and login helpers; replace the header comment and the bodies of both tests so they assert the new rules (rename the tests accordingly):

```ts
test("a coach with no optional modules sees Courses and + more under Teach, and nothing locked", async ({
  page,
}) => {
  // (existing login + goto `${TENANT}/admin/courses`)
  const sidebar = page.getByRole("complementary").getByRole("navigation");
  await expect(sidebar.getByRole("link")).toHaveCount(7);
  await expect(sidebar.getByRole("link", { name: "Reach out" })).toBeVisible();

  const teach = page.getByRole("navigation", { name: "Teach" });
  await expect(teach.getByRole("link", { name: "Courses" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(teach.getByRole("link", { name: /classes & events/i })).toHaveCount(0);
  await teach.getByRole("button", { name: /\+ \d+ more/i }).click();
  await expect(teach.getByRole("link", { name: /classes & events/i })).toBeVisible();
});

test("Reach out is open before the site is published", async ({ page }) => {
  // (existing login for the unpublished tenant)
  await page.goto(`${TENANT}/admin/blog`);
  const reach = page.getByRole("navigation", { name: "Reach out" });
  await expect(reach.getByRole("link", { name: /^blog/i })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByText(/publish your site to open marketing/i)).toHaveCount(0);
});
```

The sidebar is the `<aside>` (role `complementary`); if the spec's tenant has optional modules enabled in its fixture, use the tenant the old "Content collapsed behind + N more" test used.

- [ ] **Step 3: The navigation-feedback spec**

In `e2e/specs/25-navigation-feedback.spec.ts` (first test): "Calendar" is now a tab and "Students" a sidebar row. Keep the flow; after the click assert on the row and the new strip instead of on the Calendar link, which is gone once the section changes:

```ts
const students = page
  .getByRole("complementary")
  .getByRole("link", { name: "Students" });
await students.click();
await expect(students).toHaveAttribute("aria-current", "page", { timeout: 15_000 });
await expect(page.getByRole("navigation", { name: "Students" })).toBeVisible();
await expect(page.getByRole("navigation", { name: "Teach" })).toHaveCount(0);
```

- [ ] **Step 4: Run the specs that touch the shell**

Run (dev stack up, nothing else heavy running): `make e2e-spec SPEC="00-smoke 02-courses 07-mailbox 15-community 16-site-assistant 25-navigation-feedback 27-nav-stage-gating 29-copilot"`
Expected: all pass. Do not run the full suite for this phase: `make e2e-changed` fail-closes to every spec for `app/admin/**`, and `01-signup-onboarding` drives the AI interview on the shared hub; neither touches the admin shell. A failure that is a selector for the old shell is fixed in the spec; a failure showing real behaviour changed is fixed in the code.

- [ ] **Step 5: Reference doc and commit**

Run: `grep -n "seven job-stage\|Marketing lock\|Site AI\|command palette" docs/REFERENCE.md` and update any paragraph describing the admin nav to: seven places (Home, Teach, Students, Reach out, Money, Site, Settings), each page of a place shown as a tab; one assistant panel; search derived from the nav.

```bash
git add e2e/specs/27-nav-stage-gating.spec.ts e2e/specs/25-navigation-feedback.spec.ts docs/REFERENCE.md
git commit --no-verify -m "test(e2e): the admin shell's seven rows, section tabs and open Reach out"
```

- [ ] **Step 6: Final gate**

Run: `pre-commit run --from-ref <sha before Task 1> --to-ref HEAD` in a clean worktree (skip the four frontend hooks there; run `pre-commit run --files <changed frontend files>` from the main checkout), `node scripts/check-loading-patterns.mjs`, `cd frontend-customer && npx vitest run`, `docker compose exec -T nextjs-customer npm run typecheck`.
Expected: all clean. Then set the spec's status line to "Phase 1 done <date>".
