# Design-Page Navbar Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add navbar management to `/admin/design` (reusing the live editor's `NavbarTab`), delete the redundant `/admin/pages` page, and replace its nav entry with an "Edit site" link that deep-links into the live editor via `/?edit=1`.

**Architecture:** Pure frontend-customer composition work — no backend, serializer, or migration changes (`navbar_config` is already validated on `PATCH /api/v1/admin/config/`). The existing `NavbarTab` component (`components/owner/navbar-tab.tsx`) is embedded in a new card on the design page and staged/saved via that page's existing Save button. The admin sidebar and command palette gain minimal "open in new tab" support for the new "Edit site" entry, and `EditSidebar` honors a `?edit=1` query param using the same `window.location` pattern as `/admin/design?studio=1`.

**Tech Stack:** Next.js 14 App Router, React 18 client components, Tailwind + Radix UI, lucide-react icons, next-intl (en/tr), vitest.

**Spec:** `docs/superpowers/specs/2026-07-23-design-page-navbar-consolidation-design.md`

## Global Constraints

- Repo rule: **never commit unless the user explicitly asked**. The commit steps below are pre-written for when the user authorizes committing; if they haven't, skip every commit step and tell the user at the end what is uncommitted.
- Repo rule: pre-commit (`make lint`) must pass with zero errors/warnings before claiming done; `make dev` stack verification required before claiming done.
- No new `.md` files beyond this plan and the already-written spec.
- No backend changes of any kind.
- There is no React component-test harness in frontend-customer (vitest is configured for pure-function tests only, e.g. `src/lib/__tests__/navbar.test.ts`) — verification for these UI tasks is `make typecheck`, `make test-frontend` (regression), `make lint`, and live checks against the dev stack (demo-yoga tenant, coach login).
- e2e impact map (`e2e/impact-map.json`): intentionally **unchanged**. The touched paths (`src/app/admin/*`, `src/components/admin/*`, `src/components/owner/*`, `messages/*`) have no map entry, and the selector is fail-closed — unmapped changes run the full suite. Do not add narrow mappings (a wrong mapping would *reduce* coverage). The `make lint` selector self-test only requires every spec file to have an entry; no spec files are added or removed, so it stays green.

---

### Task 1: Navbar card on `/admin/design`

**Files:**
- Modify: `frontend-customer/src/app/admin/design/page.tsx`

**Interfaces:**
- Consumes: `NavbarTab` from `@/components/owner/navbar-tab` — props `{ config: TenantConfig; onChange: (patch: Partial<TenantConfig>) => void }`. It emits `{ navbar_config: {...} }` patches; the page's existing `handleSave` PATCHes the whole staged config to `/api/v1/admin/config/`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add imports**

In `frontend-customer/src/app/admin/design/page.tsx`, extend the lucide import (line 5) and add the `NavbarTab` import after the `LogoStudio` import (line 19):

```tsx
import { Image, MoonStar, Navigation, Palette, Save, Type, Wand2 } from "lucide-react";
```

```tsx
import { NavbarTab } from "@/components/owner/navbar-tab";
```

- [ ] **Step 2: Add the Navbar card**

Insert a fifth card inside the `<div className="grid gap-6 lg:grid-cols-2">`, immediately **after the closing `</Card>` of the Preview card** (currently line 319) and before the grid's closing `</div>`:

```tsx
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Navigation className="h-5 w-5" />
              Navbar
            </CardTitle>
            <CardDescription>
              Layout, links, and buttons for your site&apos;s navigation. The
              same controls are available while editing your live site.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NavbarTab
              config={config}
              onChange={(patch) => setConfig({ ...config, ...patch })}
            />
          </CardContent>
        </Card>
```

Nothing else on the page changes: navbar edits are staged in the same local `config` state and persisted by the existing **Save Changes** button. (`NavbarTab`'s link picker and Store/Live-Classes suggestion chips fetch via `clientFetch`, which works on admin pages as-is.)

- [ ] **Step 3: Typecheck**

Run: `make typecheck`
Expected: exit 0 for both apps (advisory tool, but this change must not add errors).

- [ ] **Step 4: Verify in the dev stack**

With `make dev` running, open `http://demo-yoga.localhost/admin/design` logged in as the demo coach:
- The Navbar card renders with layout thumbnails, links list, CTA, and toggles.
- Add a link via "Add link" → picker shows Pages/Courses/Events/Custom tabs.
- Click **Save Changes**, then open `http://demo-yoga.localhost/` — the public navbar reflects the change.
- Reload `/admin/design` — the saved link is still there (round-trips through the API).

- [ ] **Step 5: Commit** *(only if the user authorized commits — see Global Constraints)*

```bash
git add frontend-customer/src/app/admin/design/page.tsx
git commit -m "feat(design): add navbar settings card to /admin/design"
```

---

### Task 2: `?edit=1` deep link into the live editor

**Files:**
- Modify: `frontend-customer/src/components/owner/edit-sidebar.tsx`

**Interfaces:**
- Consumes: existing state setters `setEditMode`, `setOpen`, and the `EDIT_MODE_KEY` localStorage constant, all already defined in `EditSidebar`.
- Produces: the URL contract `/?edit=1` (any public tenant page + `?edit=1` opens the editor for an authenticated owner). Tasks 3 and 4 link to it.

- [ ] **Step 1: Add the mount effect**

In `frontend-customer/src/components/owner/edit-sidebar.tsx`, insert directly **after** the localStorage-restore effect (the `useEffect` ending at line 165, before the `toggleEditMode` definition):

```tsx
  // Deep link from the admin sidebar: /?edit=1 lands the coach straight in
  // the editor with the panel open, persisting the choice exactly like
  // toggleEditMode(true). Declared after the localStorage restore above so
  // it wins on mount. (window.location, NOT useSearchParams — avoids the
  // Next 14 client-side Suspense bailout, same as /admin/design?studio=1.)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("edit") !== "1") return;
    setEditMode(true);
    setOpen(true);
    try {
      localStorage.setItem(EDIT_MODE_KEY, "1");
    } catch {}
  }, []);
```

Note: `EditSidebar` is only mounted for owner/coach viewers (`app/(public)/layout.tsx:46`), so `?edit=1` is inert for students and anonymous visitors — no gating needed here.

- [ ] **Step 2: Typecheck**

Run: `make typecheck`
Expected: exit 0.

- [ ] **Step 3: Verify in the dev stack**

- Open `http://demo-yoga.localhost/?edit=1` as the coach → editor sidebar is open immediately (no pencil click needed).
- Open `http://demo-yoga.localhost/` (no param) in a fresh state → behavior unchanged (edit mode follows localStorage/onboarding as before).
- Open `http://demo-yoga.localhost/?edit=1` in a private window as a logged-out visitor → plain public site, no editor.

- [ ] **Step 4: Commit** *(only if authorized)*

```bash
git add frontend-customer/src/components/owner/edit-sidebar.tsx
git commit -m "feat(editor): support /?edit=1 deep link into the live editor"
```

---

### Task 3: "Edit site" sidebar nav item (replaces "Pages")

**Files:**
- Modify: `frontend-customer/src/components/shared/app-sidebar.tsx`
- Modify: `frontend-customer/src/components/admin/admin-shell.tsx`
- Modify: `frontend-customer/messages/en/admin.json`
- Modify: `frontend-customer/messages/tr/admin.json`

**Interfaces:**
- Consumes: the `/?edit=1` contract from Task 2.
- Produces: `NavItem.external?: boolean` on the `NavItem` interface in `app-sidebar.tsx` (renders `target="_blank" rel="noopener noreferrer"` + an `ExternalLink` icon); i18n key `admin.nav.items.editSite` replacing `admin.nav.items.pages`.

- [ ] **Step 1: Add `external` support to the sidebar renderer**

In `frontend-customer/src/components/shared/app-sidebar.tsx`, add to the `NavItem` interface (after `partialPaid`):

```tsx
  /** Open in a new tab with an external-link indicator (e.g. "Edit site"). */
  external?: boolean;
```

Then in the item `<Link>` (currently lines 134-163), add the `target`/`rel` props and the icon. The full updated element:

```tsx
                      <Link
                        key={item.href}
                        href={item.href}
                        target={item.external ? "_blank" : undefined}
                        rel={item.external ? "noopener noreferrer" : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                          collapsed && "justify-center px-2",
                          isActive
                            ? "bg-accent text-accent-foreground font-medium"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                        )}
                        title={collapsed ? item.label : undefined}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && (
                          <>
                            <span>{item.label}</span>
                            {item.external && (
                              <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground/60" />
                            )}
                            {(item.ai || item.requiresEntitlement) && (
                              <span className="ml-auto flex items-center gap-1">
                                {item.ai && <AiBadge />}
                                {item.requiresEntitlement && (
                                  <PaidFeatureBadge
                                    feature={item.requiresEntitlement}
                                    partial={item.partialPaid}
                                  />
                                )}
                              </span>
                            )}
                          </>
                        )}
                      </Link>
```

`ExternalLink` is already imported in this file (line 6). No active-state change is needed: `isItemActive` compares against the pathname, which never matches `/?edit=1`.

- [ ] **Step 2: Replace the nav item in admin-shell**

In `frontend-customer/src/components/admin/admin-shell.tsx`:

Replace line 144:

```tsx
        { label: t("nav.items.pages"), href: "/admin/pages", icon: FileText },
```

with:

```tsx
        {
          label: t("nav.items.editSite"),
          href: "/?edit=1",
          icon: Pencil,
          external: true,
        },
```

In the lucide import block (lines 6-30): remove `FileText` (now unused in this file) and add `Pencil` (alphabetical position, after `Palette`).

- [ ] **Step 3: Update i18n labels (en + tr)**

In `frontend-customer/messages/en/admin.json`, replace the `nav.items` line:

```json
      "pages": "Pages",
```

with:

```json
      "editSite": "Edit site",
```

In `frontend-customer/messages/tr/admin.json`, replace:

```json
      "pages": "Sayfalar",
```

with:

```json
      "editSite": "Siteyi düzenle",
```

- [ ] **Step 4: Confirm no stale key usage**

Run: `grep -rn "nav.items.pages" frontend-customer/src`
Expected: no matches.

- [ ] **Step 5: Typecheck + verify in the dev stack**

Run: `make typecheck` → exit 0.

In the browser (`http://demo-yoga.localhost/admin`): the Website section shows **Edit site** with a pencil icon and small external-link marker; clicking it opens the tenant homepage in a new tab with the editor panel open; the item never shows as active.

- [ ] **Step 6: Commit** *(only if authorized)*

```bash
git add frontend-customer/src/components/shared/app-sidebar.tsx frontend-customer/src/components/admin/admin-shell.tsx frontend-customer/messages/en/admin.json frontend-customer/messages/tr/admin.json
git commit -m "feat(admin): replace Pages nav item with Edit site deep link"
```

---

### Task 4: Command palette "Edit site" entry

**Files:**
- Modify: `frontend-customer/src/components/admin/command-palette.tsx`

**Interfaces:**
- Consumes: the `/?edit=1` contract from Task 2.
- Produces: `CommandItem.newTab?: boolean` (palette-internal).

- [ ] **Step 1: Extend `CommandItem` and swap the entry**

Add to the `CommandItem` interface (after `keywords`):

```tsx
  /** Open in a new tab instead of router navigation (e.g. "Edit site"). */
  newTab?: boolean;
```

Replace the `nav-pages` entry (lines 195-202):

```tsx
      {
        id: "nav-pages",
        label: "Storefront Pages",
        category: "Website & Media",
        href: "/admin/pages",
        icon: FileText,
        keywords: ["site", "landing", "home"],
      },
```

with:

```tsx
      {
        id: "nav-edit-site",
        label: "Edit site",
        category: "Website & Media",
        href: "/?edit=1",
        icon: Pencil,
        description: "Open the live editor to edit your pages",
        keywords: ["pages", "site", "landing", "home", "editor", "builder"],
        newTab: true,
      },
```

In the lucide import block: remove `FileText` (unused after this swap) and add `Pencil`.

- [ ] **Step 2: Branch both navigation handlers on `newTab`**

Keyboard handler (currently lines 323-328) — replace:

```tsx
      } else if (e.key === "Enter" && filteredItems[selectedIndex]) {
        e.preventDefault();
        const selected = filteredItems[selectedIndex];
        onOpenChange(false);
        router.push(selected.href);
      }
```

with:

```tsx
      } else if (e.key === "Enter" && filteredItems[selectedIndex]) {
        e.preventDefault();
        const selected = filteredItems[selectedIndex];
        onOpenChange(false);
        if (selected.newTab) {
          window.open(selected.href, "_blank", "noopener,noreferrer");
        } else {
          router.push(selected.href);
        }
      }
```

Click handler (currently lines 379-382) — replace:

```tsx
                  onClick={() => {
                    onOpenChange(false);
                    router.push(item.href);
                  }}
```

with:

```tsx
                  onClick={() => {
                    onOpenChange(false);
                    if (item.newTab) {
                      window.open(item.href, "_blank", "noopener,noreferrer");
                    } else {
                      router.push(item.href);
                    }
                  }}
```

- [ ] **Step 3: Typecheck + verify in the dev stack**

Run: `make typecheck` → exit 0.

In the browser: `⌘K` on any admin page, type "edit" → "Edit site" appears under Website & Media; Enter (and separately, click) opens the live editor in a new tab. A regular entry (e.g. "Courses") still navigates in-tab.

- [ ] **Step 4: Commit** *(only if authorized)*

```bash
git add frontend-customer/src/components/admin/command-palette.tsx
git commit -m "feat(admin): point command palette at the live editor instead of /admin/pages"
```

---

### Task 5: Delete `/admin/pages`

**Files:**
- Delete: `frontend-customer/src/app/admin/pages/page.tsx` (the whole `pages/` route directory)

**Interfaces:**
- Consumes: Tasks 3 and 4 must land first (they remove the only in-app links to the route).
- Produces: nothing.

- [ ] **Step 1: Delete the route**

```bash
rm -r frontend-customer/src/app/admin/pages
```

- [ ] **Step 2: Confirm no dangling references**

Run: `grep -rn "admin/pages" frontend-customer/src e2e backend --include="*.ts" --include="*.tsx" --include="*.py"`
Expected: no matches. (`PAGE_KEYS`/`PAGE_ROUTES`/`PAGE_LABELS` in `src/lib/blocks/pages.ts` stay — the live editor still uses them.)

- [ ] **Step 3: Typecheck + verify in the dev stack**

Run: `make typecheck` → exit 0.

In the browser: `http://demo-yoga.localhost/admin/pages` → Next.js 404.

- [ ] **Step 4: Commit** *(only if authorized)*

```bash
git add -A frontend-customer/src/app/admin
git commit -m "feat(admin): remove redundant /admin/pages launcher page"
```

---

### Task 6: Full verification pass

**Files:** none (verification only).

**Interfaces:** consumes everything above.

- [ ] **Step 1: Frontend unit tests**

Run: `make test-frontend`
Expected: all vitest suites pass (`src/lib/__tests__/navbar.test.ts` is the navbar-adjacent regression net).

- [ ] **Step 2: Lint / pre-commit (includes the e2e selector self-test)**

Run: `make lint`
Expected: pass with zero errors/warnings. The impact-map selector self-test stays green because no spec files were added/removed and the map was deliberately left unchanged (see Global Constraints).

- [ ] **Step 3: Targeted e2e regression**

With the dev stack up and seeded:

Run: `make e2e-spec SPEC=14-navbar-layouts`
Expected: pass — public navbar rendering across layouts is unaffected by where the settings UI lives.

- [ ] **Step 4: End-to-end manual walkthrough (demo-yoga)**

1. `/admin/design` → edit navbar (change layout, add/remove/reorder a link, toggle CTA) → **Save Changes** → public site reflects it.
2. Sidebar **Edit site** → new tab, editor open → the Navbar section there shows the same saved state.
3. `⌘K` → "Edit site" → same behavior.
4. `/admin/pages` → 404.

- [ ] **Step 5: Report**

Summarize to the user: what changed, verification evidence (command outputs, what was checked in the browser), and — if commits were skipped per the repo rule — the exact uncommitted file list.
