# P2-3: Conditional Editor De-Emphasis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For coaches who actually have AI editing (paid plans), lead **My Site** with Site AI and tuck the manual "Edit site" / "Design" entries behind an **"Advanced editing"** disclosure — while leaving them fully prominent for free coaches, who have no AI alternative.

**Architecture:** Reuses P2-1's disclosure mechanism rather than inventing a second one: `gateAdminNav` already hides items behind a `hiddenCount` row. This plan generalizes that row with an optional label key (so My Site can say "Advanced editing" instead of "+ 2 more"), adds `hasSiteAi` to the gate state, and partitions My Site accordingly. No editor code changes, no instrumentation.

**Tech Stack:** Next.js 14, React, TypeScript, next-intl, Vitest.

## Why this plan exists

The Phase 1 spec left the manual editor's fate open; Phase 2 settled it (`docs/superpowers/specs/2026-07-26-onboarding-phase2-design.md`, decision 2): **hidden-for-paid, never removed, never hidden from those who need it.** A paid coach's primary way to change their site becomes Site AI, so the raw editor becomes an advanced tool. A free coach's *only* way to change their site is the manual editor, so for them it stays front and centre. That conditional is the entire feature.

The spec also **drops the editor-operation instrumentation** that Phase 1 had sketched: its only purpose was to gate a future editor retirement, and since manual editing is now permanent, the data would have no consumer (YAGNI).

**Verified facts** (file:line):
- `gateAdminNav(sections, state)` and `NavGateState { published, enabledModules, contentExpanded }` — `frontend-customer/src/lib/admin-nav-gate.ts` (P2-1).
- `NavSection` carries `locked?` and `hiddenCount?` — `frontend-customer/src/components/shared/app-sidebar.tsx` (P2-1).
- My Site items, in order, after P2-2 adds Site AI first: `/admin/site-ai`, `/?edit=1` (external), `/?edit=1&section=brand` (external), `/admin/assistant` — `frontend-customer/src/lib/admin-nav.ts`.
- Client entitlements: `useEntitlements(): { entitlements: Entitlements | null; loading: boolean }` and `useIsLocked(feature)` — `frontend-customer/src/components/admin/entitlements-provider.tsx:66,74`. `isFeatureLocked` returns **false while `entitlements` is null** (`frontend-customer/src/lib/entitlements.ts:31-36`) — it fails open so a Paid badge never flashes.
- P2-2 adds the `"site_ai"` key to `EntitlementKey` and to the backend entitlements payload.

## Global Constraints

- **Fail toward showing the editor.** The entitlement signal must be read as "confirmed true", not "not locked". `useIsLocked("site_ai")` returns `false` while entitlements are still loading, so `hasSiteAi = !useIsLocked(...)` would be **true** during load and briefly hide the manual editor from a free coach — the exact failure this feature must never produce. Read `useEntitlements().entitlements?.site_ai === true` instead.
- **Nothing is removed.** "Edit site" and "Design" remain in the nav for every coach; for paid coaches they sit one click away behind a disclosure. `⌘K` reaches them regardless.
- **No editor changes, no instrumentation.** This plan touches nav data and nav rendering only.
- **Depends on both P2-1 and P2-2.** P2-1 supplies the gate + disclosure rendering; P2-2 supplies the `site_ai` entitlement and the Site AI nav item. Do not start until both are merged.
- Verify: `cd frontend-customer && npx vitest run`, `make typecheck`, `make lint`.

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `frontend-customer/src/components/shared/app-sidebar.tsx` | modify | `moreLabelKey?` on `NavSection`; render it in the disclosure row. |
| `frontend-customer/src/components/shared/mobile-header.tsx` | modify | Mirror the label. |
| `frontend-customer/src/lib/admin-nav-gate.ts` | modify | `hasSiteAi` + `expandedSections`; partition My Site. |
| `frontend-customer/src/lib/__tests__/admin-nav-gate.test.ts` | modify | Tests for the My Site partition. |
| `frontend-customer/src/components/admin/admin-shell.tsx` | modify | Read the entitlement; generalize the expanded-section state. |
| `frontend-customer/messages/{en,tr}/admin.json` | modify | "Advanced editing" copy. |

---

### Task 1: Generalize the disclosure and partition My Site

**Files:**
- Modify: `frontend-customer/src/components/shared/app-sidebar.tsx` (type + render)
- Modify: `frontend-customer/src/components/shared/mobile-header.tsx` (render)
- Modify: `frontend-customer/src/lib/admin-nav-gate.ts`
- Modify: `frontend-customer/src/lib/__tests__/admin-nav-gate.test.ts`
- Modify: `frontend-customer/messages/en/admin.json`, `frontend-customer/messages/tr/admin.json`

**Interfaces:**
- Consumes: P2-1's `gateAdminNav`/`NavGateState`; P2-2's `site_ai` entitlement.
- Produces: `NavGateState` gains `hasSiteAi: boolean` and replaces `contentExpanded: boolean` with `expandedSections: string[]` (a section id list — Content and My Site are both expandable now). `NavSection` gains `moreLabelKey?: string`, defaulting to `"nav.more"` when absent.

- [ ] **Step 1: Write the failing tests**

In `frontend-customer/src/lib/__tests__/admin-nav-gate.test.ts`, first update the existing `base()` helper to the new state shape (replace `contentExpanded: false` with `expandedSections: []` and add `hasSiteAi: false`), and update the two existing tests that pass `contentExpanded: true` to pass `expandedSections: ["content"]` instead. Then append:

```typescript
describe("gateAdminNav — My Site editor de-emphasis", () => {
  it("keeps the manual editor prominent for a coach without AI", () => {
    const mySite = section(base({ hasSiteAi: false }), "mySite");
    expect(mySite?.items.map((i) => i.href)).toEqual([
      "/admin/site-ai",
      "/?edit=1",
      "/?edit=1&section=brand",
      "/admin/assistant",
    ]);
    expect(mySite?.hiddenCount ?? 0).toBe(0);
  });

  it("tucks Edit site and Design behind Advanced editing when the coach has AI", () => {
    const mySite = section(base({ hasSiteAi: true }), "mySite");
    expect(mySite?.items.map((i) => i.href)).toEqual([
      "/admin/site-ai",
      "/admin/assistant",
    ]);
    expect(mySite?.hiddenCount).toBe(2);
    expect(mySite?.moreLabelKey).toBe("nav.advancedEditing");
  });

  it("reveals the manual editor when Advanced editing is expanded", () => {
    const mySite = section(
      base({ hasSiteAi: true, expandedSections: ["mySite"] }),
      "mySite",
    );
    expect(mySite?.items.map((i) => i.href)).toContain("/?edit=1");
    expect(mySite?.hiddenCount).toBe(0);
  });

  it("uses the default + More label for Content", () => {
    expect(section(base(), "content")?.moreLabelKey).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/admin-nav-gate.test.ts`

Expected: FAIL — `hasSiteAi`/`expandedSections`/`moreLabelKey` do not exist; My Site is returned untouched.

- [ ] **Step 3: Add the label field to the type**

In `frontend-customer/src/components/shared/app-sidebar.tsx`, on `NavSection`:

```typescript
  /** i18n key for the disclosure row's label. Defaults to "nav.more"
   *  ("+ N more"); My Site uses "nav.advancedEditing" instead. */
  moreLabelKey?: string;
```

- [ ] **Step 4: Update the gate**

Rewrite `frontend-customer/src/lib/admin-nav-gate.ts`:

```typescript
import type { NavSection } from "@/components/shared/app-sidebar";

/** Real tenant state the nav gates on. Derived in admin-shell from
 *  useSetupStatus(), useTenant() and useEntitlements() — never from manual
 *  checklist ticks. */
export interface NavGateState {
  /** The site is live (the setup checklist's `publish` item is done). */
  published: boolean;
  /** TenantConfig.enabled_modules — composed from the coach's wizard goals. */
  enabledModules: string[];
  /** The coach's plan includes AI site editing. MUST be a confirmed true, not
   *  "not locked": while entitlements load we treat it as false so the manual
   *  editor is never hidden from someone who has no AI alternative. */
  hasSiteAi: boolean;
  /** Section ids whose "+ More" / "Advanced editing" disclosure is open. */
  expandedSections: string[];
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

/** The raw site editor. Demoted behind "Advanced editing" ONLY for coaches who
 *  have AI editing — for everyone else this is their only way to change the
 *  site, so it stays a primary destination. */
const ADVANCED_EDITING_HREFS = new Set(["/?edit=1", "/?edit=1&section=brand"]);

/** Annotate + filter the IA from real tenant state. Pure: same input, same
 *  output, no network. The IA itself lives in buildAdminNav and is untouched. */
export function gateAdminNav(
  sections: NavSection[],
  state: NavGateState,
): NavSection[] {
  const expanded = new Set(state.expandedSections);
  return sections.map((section) => {
    if (section.id === "marketing" && !state.published) {
      return {
        ...section,
        locked: { reasonKey: "nav.locked.marketing", href: "/admin#publish-card" },
      };
    }
    if (section.id === "content") {
      if (expanded.has("content")) return { ...section, hiddenCount: 0 };
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
    if (section.id === "mySite") {
      if (!state.hasSiteAi) return { ...section, hiddenCount: 0 };
      if (expanded.has("mySite")) {
        return { ...section, hiddenCount: 0, moreLabelKey: "nav.advancedEditing" };
      }
      const visible = section.items.filter(
        (item) => !ADVANCED_EDITING_HREFS.has(item.href),
      );
      return {
        ...section,
        items: visible,
        hiddenCount: section.items.length - visible.length,
        moreLabelKey: "nav.advancedEditing",
      };
    }
    return section;
  });
}
```

- [ ] **Step 5: Render the custom label**

In `frontend-customer/src/components/shared/app-sidebar.tsx`, change the disclosure row added in P2-1 to honour the key:

```tsx
                  {!collapsed && (section.hiddenCount ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => onExpandSection?.(section.id)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      {t(section.moreLabelKey ?? "nav.more", {
                        count: section.hiddenCount ?? 0,
                      })}
                    </button>
                  )}
```

(next-intl tolerates an unused `count` argument for a message without the placeholder, so the same call serves both labels.)

Apply the identical change to the disclosure row in `frontend-customer/src/components/shared/mobile-header.tsx`.

- [ ] **Step 6: Add the copy**

In `frontend-customer/messages/en/admin.json`, inside `nav`:

```json
    "advancedEditing": "Advanced editing",
```

In `frontend-customer/messages/tr/admin.json`, inside `nav`:

```json
    "advancedEditing": "Gelişmiş düzenleme",
```

- [ ] **Step 7: Run to verify pass**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/admin-nav-gate.test.ts`

Expected: PASS — the P2-1 tests (updated to the new state shape) plus the four new My Site tests.

- [ ] **Step 8: Commit**

```bash
git add frontend-customer/src/lib/admin-nav-gate.ts frontend-customer/src/lib/__tests__/admin-nav-gate.test.ts frontend-customer/src/components/shared/app-sidebar.tsx frontend-customer/src/components/shared/mobile-header.tsx frontend-customer/messages/en/admin.json frontend-customer/messages/tr/admin.json
git commit -m "feat(admin-nav): Advanced editing disclosure for coaches with Site AI"
```

---

### Task 2: Wire the entitlement and the per-section disclosure state

**Files:**
- Modify: `frontend-customer/src/components/admin/admin-shell.tsx`

**Interfaces:**
- Consumes: `gateAdminNav`/`NavGateState` (Task 1), `useEntitlements()`.
- Produces: the shell passes a confirmed `hasSiteAi` and tracks which sections the coach expanded.

- [ ] **Step 1: Replace the single boolean with a section set**

In `frontend-customer/src/components/admin/admin-shell.tsx`:

1. Add the import:

```typescript
import { useEntitlements } from "@/components/admin/entitlements-provider";
```

2. Replace the P2-1 `contentExpanded` state and the gate call with:

```typescript
  const { entitlements } = useEntitlements();
  const [expandedSections, setExpandedSections] = useState<string[]>([]);

  // Confirmed-true only. useIsLocked() fails OPEN (false while entitlements
  // load), which would briefly hide the manual editor from a free coach — the
  // one thing this must never do. So read the value explicitly.
  const hasSiteAi = entitlements?.site_ai === true;

  const navSections = useMemo(() => {
    const sections = buildAdminNav(t);
    if (!stateReady) return sections;
    return gateAdminNav(sections, {
      published,
      enabledModules: config?.enabled_modules ?? [],
      hasSiteAi,
      expandedSections,
    });
  }, [
    t,
    stateReady,
    published,
    config?.enabled_modules,
    hasSiteAi,
    expandedSections,
  ]);
```

3. Make the expand handler section-aware (P2-1 passed a handler that ignored its argument):

```tsx
        <AppSidebar
          title={t("title")}
          sections={navSections}
          onExpandSection={(sectionId) =>
            setExpandedSections((prev) =>
              prev.includes(sectionId) ? prev : [...prev, sectionId],
            )
          }
        >
```

Apply the same `onExpandSection` to `<MobileHeader ... />`.

- [ ] **Step 2: Typecheck**

Run: `make typecheck`

Expected: PASS. If `stateReady` (from P2-1) does not also wait on entitlements, that is intentional — entitlements resolving late only means the editor stays prominent a moment longer, which is the safe direction.

- [ ] **Step 3: Verify units and lint**

Run: `cd frontend-customer && npx vitest run` → PASS.
Run: `make lint` → exit 0 (i18n parity covers the new `nav.advancedEditing` key in both locales).

- [ ] **Step 4: Manual smoke**

With `make dev` up, open a dev tenant's `/admin`:
- On a **paid** tenant: My Site lists Site AI and Site assistant, with an "Advanced editing" row that reveals Edit site + Design when clicked.
- On a **free** tenant: Edit site and Design are listed directly, with no "Advanced editing" row.
- Confirm that on first paint (before entitlements resolve) the manual editor is visible in both cases — it must never flash hidden.

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/components/admin/admin-shell.tsx
git commit -m "feat(admin-nav): de-emphasize the manual editor only for coaches with AI"
```

---

## Verification before calling this plan done

- [ ] `cd frontend-customer && npx vitest run` passes, including the My Site partition tests.
- [ ] `make typecheck` and `make lint` pass.
- [ ] `make e2e-spec SPEC=27-nav-stage-gating` still passes (P2-1's spec — the gate state shape changed under it).
- [ ] Manual: paid tenant → editor behind "Advanced editing"; free tenant → editor prominent; no hidden-then-shown flash on load.

## Where this sits in Phase 2

| Plan | Scope | Depends on |
|------|-------|------------|
| P2-0 — Reveal free-applies 3→1 | constant + copy + test | Phase 1 |
| P2-1 — Nav stage-gating | Marketing lock, Content "+ More" | Phase 1 Plan 2 |
| P2-2 — Admin Site AI panel | endpoints + panel + `site_ai` entitlement | Phase 1 Plan 5 |
| **P2-3 — Conditional editor de-emphasis** (this one) | My Site "Advanced editing" for paid coaches | **P2-1 and P2-2** |
