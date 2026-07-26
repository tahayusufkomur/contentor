# P2-1: Admin Nav Stage-Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin menu grow with the coach: **Marketing** stays locked (greyed, clickable, explained) until the site is published and unlocks with a one-time celebration, and **Content** shows only the modules the coach actually uses, with a "+ More" disclosure for the rest.

**Architecture:** Phase 1 extracted the nav into a pure `buildAdminNav(t)` module. This plan adds a second pure function, `gateAdminNav(sections, state)`, that annotates/filters those sections from real tenant state — `published` (from the setup-status `publish` item) and `enabledModules` (from the tenant config). Two additive optional fields on `NavSection` (`locked`, `hiddenCount`) carry the result, and `AppSidebar`/`MobileHeader` render them. All gating logic is pure and unit-tested; no network in the logic layer.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, next-intl, sonner, Vitest, Playwright.

## Why this plan exists

The Phase 1 spec's "Admin focus" section shipped only the 18 → 7 consolidation; the stage-gating half was explicitly deferred to Phase 2 (`docs/superpowers/specs/2026-07-26-onboarding-phase2-design.md`, subsystem A). Gating is what turns the menu itself into part of the achievement loop — a new coach sees a focused menu that visibly opens up as they publish, rather than 7 destinations they can't all use yet.

**Verified facts** (file:line):
- `buildAdminNav(t: (key: string) => string): NavSection[]` returns the 7 sections in order `home, content, mySite, audience, marketing, money, settings` — `frontend-customer/src/lib/admin-nav.ts:29`.
- `NavSection = { id, label, items, flat? }`, `NavItem = { label, href, icon, ai?, requiresEntitlement?, partialPaid?, external? }` — `frontend-customer/src/components/shared/app-sidebar.tsx:17-41`.
- `useSetupStatus(): SetupStatus | null` where `SetupStatus = { items: SetupItem[], progress, demo_present, dismissed, has_paid_content, publish_blockers }` and `SetupItem = { key, group, done, source, optional }` — `frontend-customer/src/lib/setup-assistant.ts:7-52`. The published signal is the item with `key === "publish"` having `done === true` (set from `tenant.is_published` in `compute_setup_state`).
- `useTenant(): TenantConfig | null` (React context) — `frontend-customer/src/hooks/use-tenant.ts`; `TenantConfig.enabled_modules: string[]` — `frontend-customer/src/types/tenant.ts:174`, served by the config serializer.
- Module vocabulary (`backend/apps/core/onboarding/compose.py:75-82`): always-on `("analytics", "billing", "courses", "pages")`; goal-driven `run_live_classes|in_person_events → "live"`, `sell_downloads → "downloads"`, `email_marketing → "campaigns"`, `build_community → "community"`.
- `AppSidebar` renders a flat branch (single bare link) and a group branch (collapsible header `<button>` + items) — `app-sidebar.tsx`; `MobileHeader` mirrors it.
- The existing nav unit tests live at `frontend-customer/src/lib/__tests__/admin-nav.test.ts` and use an identity translator `t = (key) => key`.

## Global Constraints

- **`buildAdminNav` is not modified.** Gating is a separate pure function applied on top. This keeps the IA and the gating independently testable, and keeps Phase 1's tests green untouched.
- **Locks are never dead ends.** A locked section stays clickable and explains what unlocks it, linking to the relevant milestone. ⌘K still reaches every route regardless of lock state (the command palette is untouched).
- **Never gate on manual ticks.** The published signal comes from the `publish` setup item, which `compute_setup_state` derives from real `tenant.is_published` — not from a coach's manual checklist override.
- **No regression for existing tenants.** A published tenant computes as unlocked; a tenant whose `enabled_modules` include live/downloads sees those Content items. This is computed state, not a migration.
- **Audience is never gated** (Phase 1 decision — the tools to get your first student live there, so gating on having a student was circular).
- **Fail open.** While `useSetupStatus()`/`useTenant()` are still `null` (first paint), render the nav **ungated**. A coach must never see a flash of locked items they've already earned.
- Verify: `cd frontend-customer && npx vitest run` (that is what `make test-frontend` runs), `make typecheck`, `make lint`, `make e2e-spec SPEC=<nn>`.

## Deliberate deviation from the spec

**The unlock-celebration "seen" flag lives in `localStorage`, not in `setup_progress`.** The spec proposed a `marketing_unlock_seen` flag in the setup-progress JSON, but the setup-status PATCH endpoint (`backend/apps/tenant_config/views.py:167-193`) accepts only `dismissed` and a whitelisted `item` key — persisting a new flag would require a backend field, a new accepted key, and validation, for a one-time cosmetic toast. `localStorage` is the proportionate weight. Trade-off, accepted: a coach who publishes and then opens the admin on a second device may see the celebration twice.

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `frontend-customer/src/components/shared/app-sidebar.tsx` | modify | Add `locked?` + `hiddenCount?` to `NavSection`; render the locked treatment and the "+ More" row. |
| `frontend-customer/src/lib/admin-nav-gate.ts` | create | Pure `gateAdminNav(sections, state)` + `NavGateState`. |
| `frontend-customer/src/lib/__tests__/admin-nav-gate.test.ts` | create | Unit tests for every gating rule. |
| `frontend-customer/src/components/shared/mobile-header.tsx` | modify | Mirror locked + "+ More" rendering. |
| `frontend-customer/src/components/admin/admin-shell.tsx` | modify | Read real state, apply `gateAdminNav`, own the "+ More" toggle and the unlock celebration. |
| `frontend-customer/messages/en/admin.json`, `messages/tr/admin.json` | modify | Lock explainer, "+ More", celebration copy. |
| `e2e/specs/27-nav-stage-gating.spec.ts` | create | Locked-before-publish → unlocked-after. |
| `e2e/impact-map.json` | modify | Map the new spec. |

---

### Task 1: The `gateAdminNav` pure layer

**Files:**
- Modify: `frontend-customer/src/components/shared/app-sidebar.tsx` (types only)
- Create: `frontend-customer/src/lib/admin-nav-gate.ts`
- Create: `frontend-customer/src/lib/__tests__/admin-nav-gate.test.ts`

**Interfaces:**
- Consumes: `buildAdminNav(t)` and the `NavSection`/`NavItem` types.
- Produces: `NavGateState = { published: boolean; enabledModules: string[]; contentExpanded: boolean }` and `gateAdminNav(sections: NavSection[], state: NavGateState): NavSection[]`. Sections gain `locked?: { reasonKey: string; href: string }` and `hiddenCount?: number`. Later tasks render exactly these two fields.

- [ ] **Step 1: Add the two optional fields to `NavSection`**

In `frontend-customer/src/components/shared/app-sidebar.tsx`, extend the interface (additive — nothing else changes in this file for Task 1):

```typescript
export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
  /** Render as a single bare top-level link (no collapsible group header).
   *  Used for single-page destinations like Home and Settings. A flat section
   *  must contain exactly one item; that item is rendered directly. */
  flat?: boolean;
  /** Stage-gated: greyed but still clickable. `reasonKey` is an i18n key
   *  explaining what unlocks it; `href` points at the milestone that does. */
  locked?: { reasonKey: string; href: string };
  /** Progressive disclosure: this many items are hidden behind a "+ More"
   *  row. Zero/undefined means everything is shown. */
  hiddenCount?: number;
}
```

- [ ] **Step 2: Write the failing tests**

Create `frontend-customer/src/lib/__tests__/admin-nav-gate.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { buildAdminNav } from "@/lib/admin-nav";
import { gateAdminNav, type NavGateState } from "@/lib/admin-nav-gate";

const t = (key: string) => key; // identity translator: assert structure, not copy

const base = (over: Partial<NavGateState> = {}): NavGateState => ({
  published: false,
  enabledModules: ["analytics", "billing", "courses", "pages"],
  contentExpanded: false,
  ...over,
});

const gate = (state: NavGateState) => gateAdminNav(buildAdminNav(t), state);
const section = (state: NavGateState, id: string) =>
  gate(state).find((s) => s.id === id);
const hrefs = (state: NavGateState, id: string) =>
  section(state, id)?.items.map((i) => i.href) ?? [];

describe("gateAdminNav — Marketing lock", () => {
  it("locks Marketing before publish, with a reason and a milestone link", () => {
    const marketing = section(base(), "marketing");
    expect(marketing?.locked).toEqual({
      reasonKey: "nav.locked.marketing",
      href: "/admin#publish-card",
    });
  });

  it("unlocks Marketing once published", () => {
    expect(section(base({ published: true }), "marketing")?.locked).toBeUndefined();
  });

  it("never locks Audience, Money, My Site, Home or Settings", () => {
    for (const id of ["audience", "money", "mySite", "home", "settings"]) {
      expect(section(base(), id)?.locked).toBeUndefined();
    }
  });

  it("keeps every Marketing item present while locked (explained, not removed)", () => {
    expect(hrefs(base(), "marketing")).toEqual([
      "/admin/blog",
      "/admin/email",
      "/admin/notifications",
    ]);
  });
});

describe("gateAdminNav — Content progressive disclosure", () => {
  it("shows only Courses for a coach with no goal modules", () => {
    expect(hrefs(base(), "content")).toEqual(["/admin/courses"]);
  });

  it("reports how many Content items are hidden", () => {
    // courses shown; live, calendar, downloads, library hidden
    expect(section(base(), "content")?.hiddenCount).toBe(4);
  });

  it("shows Live Events and Calendar when the live module is enabled", () => {
    const state = base({ enabledModules: ["courses", "live"] });
    expect(hrefs(state, "content")).toEqual([
      "/admin/courses",
      "/admin/live",
      "/admin/calendar",
    ]);
  });

  it("shows Downloads when the downloads module is enabled", () => {
    const state = base({ enabledModules: ["courses", "downloads"] });
    expect(hrefs(state, "content")).toContain("/admin/downloads");
    expect(hrefs(state, "content")).not.toContain("/admin/live");
  });

  it("reveals everything when expanded, and reports nothing hidden", () => {
    const state = base({ contentExpanded: true });
    expect(hrefs(state, "content")).toEqual([
      "/admin/courses",
      "/admin/live",
      "/admin/calendar",
      "/admin/downloads",
      "/admin/photos",
    ]);
    expect(section(state, "content")?.hiddenCount).toBe(0);
  });

  it("leaves other sections' items untouched", () => {
    expect(hrefs(base(), "audience")).toEqual([
      "/admin/students",
      "/admin/community",
      "/admin/inbox",
    ]);
  });
});

describe("gateAdminNav — no regression for established tenants", () => {
  it("a published tenant with every module sees an ungated nav", () => {
    const state = base({
      published: true,
      enabledModules: ["courses", "live", "downloads", "campaigns", "community"],
      contentExpanded: false,
    });
    expect(state.published).toBe(true);
    expect(section(state, "marketing")?.locked).toBeUndefined();
    expect(section(state, "content")?.hiddenCount).toBe(1); // only Library
  });

  it("returns the same seven sections in the same order", () => {
    expect(gate(base()).map((s) => s.id)).toEqual([
      "home",
      "content",
      "mySite",
      "audience",
      "marketing",
      "money",
      "settings",
    ]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/admin-nav-gate.test.ts`

Expected: FAIL — module `@/lib/admin-nav-gate` not found.

- [ ] **Step 4: Implement the gate**

Create `frontend-customer/src/lib/admin-nav-gate.ts`:

```typescript
import type { NavSection } from "@/components/shared/app-sidebar";

/** Real tenant state the nav gates on. Derived in admin-shell from
 *  useSetupStatus() and useTenant() — never from manual checklist ticks. */
export interface NavGateState {
  /** The site is live (the setup checklist's `publish` item is done). */
  published: boolean;
  /** TenantConfig.enabled_modules — composed from the coach's wizard goals. */
  enabledModules: string[];
  /** The coach opened Content's "+ More" disclosure. */
  contentExpanded: boolean;
}

/** Content items that only appear once their module is enabled. Everything
 *  not listed here (Courses) is always visible; Library is disclosure-only. */
const MODULE_FOR_HREF: Record<string, string> = {
  "/admin/live": "live",
  "/admin/calendar": "live",
  "/admin/downloads": "downloads",
};

/** Shown only behind "+ More": supporting resources, not daily destinations. */
const DISCLOSURE_ONLY_HREFS = new Set(["/admin/photos"]);

/** Annotate + filter the IA from real tenant state. Pure: same input, same
 *  output, no network. The IA itself lives in buildAdminNav and is untouched. */
export function gateAdminNav(
  sections: NavSection[],
  state: NavGateState,
): NavSection[] {
  return sections.map((section) => {
    if (section.id === "marketing" && !state.published) {
      return {
        ...section,
        locked: { reasonKey: "nav.locked.marketing", href: "/admin#publish-card" },
      };
    }
    if (section.id === "content") {
      if (state.contentExpanded) {
        return { ...section, hiddenCount: 0 };
      }
      const visible = section.items.filter((item) => {
        if (DISCLOSURE_ONLY_HREFS.has(item.href)) return false;
        const module = MODULE_FOR_HREF[item.href];
        return module ? state.enabledModules.includes(module) : true;
      });
      return {
        ...section,
        items: visible,
        hiddenCount: section.items.length - visible.length,
      };
    }
    return section;
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/admin-nav-gate.test.ts`

Expected: PASS, 11 tests.

- [ ] **Step 6: Confirm the Phase 1 nav tests still pass**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/admin-nav.test.ts`

Expected: PASS — `buildAdminNav` was not modified.

- [ ] **Step 7: Commit**

```bash
git add frontend-customer/src/lib/admin-nav-gate.ts frontend-customer/src/lib/__tests__/admin-nav-gate.test.ts frontend-customer/src/components/shared/app-sidebar.tsx
git commit -m "feat(admin-nav): pure stage-gating layer over the nav IA"
```

---

### Task 2: Render locked sections and the "+ More" row

**Files:**
- Modify: `frontend-customer/src/components/shared/app-sidebar.tsx`
- Modify: `frontend-customer/src/components/shared/mobile-header.tsx`
- Modify: `frontend-customer/messages/en/admin.json`, `frontend-customer/messages/tr/admin.json`

**Interfaces:**
- Consumes: `NavSection.locked` and `NavSection.hiddenCount` (Task 1).
- Produces: `AppSidebar`/`MobileHeader` gain an optional `onExpandSection?: (sectionId: string) => void` prop, called when the coach clicks "+ More". Locked sections render greyed with a lock icon and route clicks to `locked.href`.

- [ ] **Step 1: Add the copy in both locales**

In `frontend-customer/messages/en/admin.json`, inside the existing `nav` object (alongside `sections` and `items`), add:

```json
    "locked": {
      "marketing": "Publish your site to open Marketing"
    },
    "more": "+ {count} more",
    "unlocked": {
      "marketing": "🎉 Your site is live — Marketing is now open"
    }
```

In `frontend-customer/messages/tr/admin.json`, the same keys:

```json
    "locked": {
      "marketing": "Pazarlama'yı açmak için sitenizi yayınlayın"
    },
    "more": "+{count} tane daha",
    "unlocked": {
      "marketing": "🎉 Siteniz yayında — Pazarlama artık açık"
    }
```

- [ ] **Step 2: Render the locked treatment in `AppSidebar`**

In `frontend-customer/src/components/shared/app-sidebar.tsx`:

1. Add `Lock` to the existing `lucide-react` import.
2. Add the optional prop to `AppSidebarProps`:

```typescript
interface AppSidebarProps {
  title: string;
  sections: NavSection[];
  children?: React.ReactNode;
  /** Called when the coach opens a section's "+ More" disclosure. */
  onExpandSection?: (sectionId: string) => void;
}
```

and accept it in the signature: `export function AppSidebar({ title, sections, children, onExpandSection }: AppSidebarProps) {`.

3. Inside the group branch of `sections.map(...)` — the branch that renders the collapsible header `<button>` and then the items — handle a locked section by rendering the header greyed with a lock icon and, in place of the item list, a single explainer link. Insert this immediately after the `if (section.flat) { ... }` branch, before the normal group rendering:

```tsx
          if (section.locked) {
            return (
              <div key={section.id} className="space-y-1">
                {!collapsed && (
                  <div className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                    <span>{section.label}</span>
                    <Lock className="h-3 w-3" />
                  </div>
                )}
                <NavLink
                  href={section.locked.href}
                  title={t(section.locked.reasonKey)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground/60 transition-colors hover:bg-accent/40 hover:text-muted-foreground"
                >
                  {collapsed ? (
                    <Lock className="h-4 w-4 shrink-0" />
                  ) : (
                    <span className="text-xs">{t(section.locked.reasonKey)}</span>
                  )}
                </NavLink>
              </div>
            );
          }
```

`AppSidebar` does not currently take a translator. Add one: import `useTranslations` from `next-intl` and, at the top of the component, `const t = useTranslations("admin");` — the customer app already uses this namespace for nav labels, and `admin-shell.tsx` passes already-translated labels, so only these new `reasonKey`s need translating here.

4. In the normal group branch, after the items list, render the "+ More" row when items are hidden:

```tsx
                  {!collapsed && (section.hiddenCount ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => onExpandSection?.(section.id)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      {t("nav.more", { count: section.hiddenCount ?? 0 })}
                    </button>
                  )}
```

Place it inside the same `{(collapsed || sectionOpen) && (<div className="space-y-1"> ... </div>)}` wrapper, directly after `{section.items.map(...)}`.

- [ ] **Step 3: Mirror both in `MobileHeader`**

In `frontend-customer/src/components/shared/mobile-header.tsx`, apply the same two additions, adapted to that file's existing classes and its drawer-closing `onClick={() => setOpen(false)}` handler:
- a `section.locked` branch rendering the greyed header + explainer link (closing the drawer on click),
- a "+ More" button after the items when `hiddenCount > 0`, calling the same `onExpandSection` prop (add it to that component's props too, matching `AppSidebarProps`).

Read the existing item-link JSX in that file and copy its `className` verbatim rather than inventing new classes. Add `Lock` to its lucide import and `useTranslations` if not already present.

- [ ] **Step 4: Typecheck**

Run: `make typecheck`

Expected: PASS. `admin-shell.tsx` does not yet pass `onExpandSection` — that is fine, the prop is optional and Task 3 wires it.

- [ ] **Step 5: Verify locale parity**

Run: `make lint`

Expected: exit 0 (its i18n-parity check confirms the new `nav.locked` / `nav.more` / `nav.unlocked` keys exist in both `en` and `tr`).

- [ ] **Step 6: Commit**

```bash
git add frontend-customer/src/components/shared/app-sidebar.tsx frontend-customer/src/components/shared/mobile-header.tsx frontend-customer/messages/en/admin.json frontend-customer/messages/tr/admin.json
git commit -m "feat(admin-nav): render locked sections and the + More disclosure"
```

---

### Task 3: Wire real state, the disclosure toggle, and the unlock celebration

**Files:**
- Modify: `frontend-customer/src/components/admin/admin-shell.tsx`

**Interfaces:**
- Consumes: `gateAdminNav`/`NavGateState` (Task 1), `onExpandSection` (Task 2), `useSetupStatus()`, `useTenant()`.
- Produces: the admin shell renders a gated nav. No new exports.

- [ ] **Step 1: Derive the gate state and apply it**

In `frontend-customer/src/components/admin/admin-shell.tsx`:

1. Add imports:

```typescript
import { useEffect, useMemo, useRef, useState } from "react"; // extend the existing react import
import { toast } from "sonner";

import { gateAdminNav } from "@/lib/admin-nav-gate";
import { useSetupStatus } from "@/lib/setup-assistant";
import { useTenant } from "@/hooks/use-tenant";
```

2. Inside the component, after the existing `const navSections = buildAdminNav(t);` line, replace that single line with the gated derivation:

```typescript
  const status = useSetupStatus();
  const config = useTenant();
  const [contentExpanded, setContentExpanded] = useState(false);

  // The site is live when the checklist's `publish` item is done — that item is
  // computed from tenant.is_published, never from a manual tick.
  const published = Boolean(
    status?.items.find((item) => item.key === "publish")?.done,
  );
  // Fail open: until BOTH signals have loaded, render the nav ungated so an
  // established coach never sees a flash of locks they already cleared.
  const stateReady = status !== null && config !== null;

  const navSections = useMemo(() => {
    const sections = buildAdminNav(t);
    if (!stateReady) return sections;
    return gateAdminNav(sections, {
      published,
      enabledModules: config?.enabled_modules ?? [],
      contentExpanded,
    });
  }, [t, stateReady, published, config?.enabled_modules, contentExpanded]);
```

3. Pass the disclosure handler to both nav renderers:

```tsx
        <AppSidebar
          title={t("title")}
          sections={navSections}
          onExpandSection={() => setContentExpanded(true)}
        >
```

```tsx
          <MobileHeader
            title={t("title")}
            sections={navSections}
            user={user}
            onExpandSection={() => setContentExpanded(true)}
          />
```

(Only Content is expandable today, so a single boolean is enough; the handler ignores its `sectionId` argument.)

- [ ] **Step 2: Add the one-time unlock celebration**

Still in `admin-shell.tsx`, below the derivation:

```typescript
  // One-time flourish when Marketing opens. Stored in localStorage rather than
  // setup_progress: the setup PATCH endpoint whitelists only `dismissed` and
  // `item`, and a cosmetic toast does not justify a backend field. Trade-off:
  // a coach may see it once per device.
  const celebrated = useRef(false);
  useEffect(() => {
    if (!stateReady || !published || celebrated.current) return;
    celebrated.current = true;
    const key = "contentor_marketing_unlock_seen";
    try {
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, "1");
    } catch {
      return; // private mode / storage disabled → skip the flourish entirely
    }
    toast.success(t("nav.unlocked.marketing"));
  }, [stateReady, published, t]);
```

- [ ] **Step 3: Typecheck**

Run: `make typecheck`

Expected: PASS both apps.

- [ ] **Step 4: Verify the unit tests and lint still pass**

Run: `cd frontend-customer && npx vitest run`

Expected: PASS (the gate + IA tests; this task adds no new unit tests — it is wiring, covered by the e2e in Task 4).

Run: `make lint`

Expected: exit 0.

- [ ] **Step 5: Manual smoke on a dev tenant**

With `make dev` up, open a dev tenant's `/admin` as the coach. Confirm: an **unpublished** tenant shows Marketing greyed with a lock and the explainer; Content shows Courses (plus Live/Calendar or Downloads only if those modules are enabled) and a "+ N more" row that reveals the rest when clicked. A **published** tenant shows Marketing normally.

- [ ] **Step 6: Commit**

```bash
git add frontend-customer/src/components/admin/admin-shell.tsx
git commit -m "feat(admin-nav): gate the admin nav on real tenant state with an unlock celebration"
```

---

### Task 4: End-to-end lock → unlock

**Files:**
- Create: `e2e/specs/27-nav-stage-gating.spec.ts`
- Modify: `e2e/impact-map.json`

**Interfaces:** none; proves the gating against the running stack.

- [ ] **Step 1: Write the spec**

Create `e2e/specs/27-nav-stage-gating.spec.ts`. Model its login/tenant setup on an existing coach-admin spec (`e2e/specs/25-navigation-feedback.spec.ts` is the closest — it drives the admin sidebar as a coach). The spec must:

1. Sign in as the coach of a tenant that is **not** published, open `/admin`, and assert the Marketing lock explainer is visible — `page.getByText(/publish your site to open marketing/i)`.
2. Assert Content hides at least one module: `page.getByRole("button", { name: /\+ \d+ more/i })` is visible.
3. Click that "+ N more" row and assert a previously hidden item appears — e.g. `page.getByRole("link", { name: /^library$/i })`.
4. Publish the tenant (use the same mechanism the existing specs use to reach a published state — either the publish card on `/admin` or a direct API call with the coach's token, whichever the harness already does; check `e2e/helpers/` for an existing publish helper before writing one), reload `/admin`, and assert the lock explainer is **gone** and the Blog link is a normal nav link: `await expect(page.getByRole("link", { name: /^blog$/i })).toBeVisible()`.

Prefer an existing seeded dev tenant whose published state you control over creating a new signup — the seeded tenants are faster and the spec stays independent of the wizard.

- [ ] **Step 2: Map the spec**

Add an entry for `27-nav-stage-gating.spec.ts` to `e2e/impact-map.json`, mapping it to the admin nav areas (mirror the entry style of the neighbouring specs — `frontend-customer/src/lib/admin-nav*`, `frontend-customer/src/components/shared/app-sidebar.tsx`, `admin-shell.tsx`). `make lint`'s selector self-test fails if a spec has no entry.

- [ ] **Step 3: Run it**

Run: `make e2e-spec SPEC=27-nav-stage-gating`

Expected: PASS.

- [ ] **Step 4: Confirm the existing nav e2e still passes**

Run: `make e2e-spec SPEC=25-navigation-feedback`

Expected: PASS — that spec clicks `Calendar` and `Students`. **Note:** `Calendar` is now hidden for a tenant without the `live` module. If it fails, the fix is in the spec's fixture (use a tenant whose `enabled_modules` include `live`, or expand Content first) — **not** in the gating rules, which are the intended behavior. Document whichever you choose in a comment.

- [ ] **Step 5: Commit**

```bash
git add e2e/specs/27-nav-stage-gating.spec.ts e2e/impact-map.json
git commit -m "test(admin-nav): e2e Marketing lock, disclosure, and unlock"
```

---

## Verification before calling this plan done

- [ ] `cd frontend-customer && npx vitest run` passes, including `admin-nav-gate.test.ts` (11 tests) and the untouched `admin-nav.test.ts`.
- [ ] `make typecheck` passes for both apps.
- [ ] `make lint` passes (i18n parity + e2e impact-map self-test).
- [ ] `make e2e-spec SPEC=27-nav-stage-gating` and `SPEC=25-navigation-feedback` both pass.
- [ ] Manual: an unpublished tenant sees Marketing locked + a "+ N more" row; publishing unlocks Marketing and fires the celebration toast exactly once (a reload does not repeat it).

## Where this sits in Phase 2

| Plan | Scope | Depends on |
|------|-------|------------|
| P2-0 — Reveal free-applies 3→1 | constant + copy + test | Phase 1 |
| **P2-1 — Nav stage-gating** (this one) | Marketing lock, unlock celebration, Content "+ More" | Phase 1 Plan 2 |
| P2-2 — Admin Site AI panel | `/admin/site-ai`, monthly quota enforcement | Phase 1 Plan 5 |
| P2-3 — Conditional editor de-emphasis | My Site "Advanced editing" for paid coaches | **P2-1** (shares nav rendering) |
