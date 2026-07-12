# Coach "Publish the App" Control — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `PublishCard` to the coach dashboard that lets the owner publish/unpublish their app and manage the preview password, wiring up the publish gate that already exists end-to-end.

**Architecture:** Frontend-only (`frontend-customer` coach admin). A new self-fetching client component reads the owner's current tenant from `GET /api/v1/me/tenants/` and writes via `PATCH /api/v1/me/tenants/<slug>/` (`is_published`, `preview_password`) — both endpoints, and the student app's `PreviewGate` that consumes `is_published`, already exist. No backend changes.

**Tech Stack:** Next.js 14 (`frontend-customer`, App Router), `clientFetch`, `sonner`, Tailwind + existing `@/components/ui` primitives.

**Spec:** `docs/superpowers/specs/2026-06-20-coach-publish-app-design.md`.

## Global Constraints

- **No backend changes.** `GET /api/v1/me/tenants/` and `PATCH /api/v1/me/tenants/<slug>/` already exist (`backend/apps/core/me/views.py`); the PATCH accepts `is_published` (bool) and `preview_password` (string; `""` clears) and returns the updated `{is_published, has_preview_password, ...}`.
- **`clientFetch<T>(path, options?)`** (`@/lib/api-client`) already sets `Content-Type: application/json` + `credentials: "same-origin"`, throws `ApiError` on non-2xx, and returns parsed JSON. Use it for both the GET and the PATCH.
- **Tenant selection:** pick the tenant whose `new URL(studio_url).host === window.location.host`; if none matches and there is exactly one tenant, use it; otherwise render nothing. A non-owner "coach" gets an empty list → render nothing (publishing is an owner action).
- **Hardcoded English** UI strings (the coach dashboard is not internationalized — matches the existing dashboard + the Phase-B App-adoption card).
- **Unpublish confirmation** uses `window.confirm(...)` — the admin's established confirm pattern (`src/app/admin/email/templates/page.tsx` uses it for delete); there is no dialog component, and none should be added.
- **No new dependency.** Reuse `Card`, `Button`, `Input`, `Skeleton`, `sonner`, `lucide-react`.
- **No frontend test runner** — verification is `cd frontend-customer && npm run build` (do NOT add Jest/Vitest).
- **Commit per task** (confirm commit go-ahead at execution).

---

### Task 1: `PublishCard` on the coach dashboard

**Files:**
- Create: `frontend-customer/src/components/admin/publish-card.tsx`
- Modify: `frontend-customer/src/app/admin/page.tsx` (import + render at the top)

**Interfaces:**
- Consumes: `GET /api/v1/me/tenants/` → `MeTenant[]` where `MeTenant = { slug, name, is_published, has_preview_password, studio_url }`; `PATCH /api/v1/me/tenants/<slug>/` body `{ is_published?: boolean; preview_password?: string }` → returns (at least) `{ is_published, has_preview_password }`.
- Produces: `<PublishCard />` — a self-fetching dashboard card.

- [ ] **Step 1: Create the component**

Create `frontend-customer/src/components/admin/publish-card.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import { Copy, ExternalLink, Globe, KeyRound, Rocket } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { clientFetch } from "@/lib/api-client"

interface MeTenant {
  slug: string
  name: string
  is_published: boolean
  has_preview_password: boolean
  studio_url: string
}

function pickCurrentTenant(tenants: MeTenant[]): MeTenant | null {
  if (tenants.length === 0) return null
  if (typeof window !== "undefined") {
    const match = tenants.find((t) => {
      try {
        return new URL(t.studio_url).host === window.location.host
      } catch {
        return false
      }
    })
    if (match) return match
  }
  return tenants.length === 1 ? tenants[0] : null
}

export function PublishCard() {
  const [tenant, setTenant] = useState<MeTenant | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [pw, setPw] = useState("")

  useEffect(() => {
    clientFetch<MeTenant[]>("/api/v1/me/tenants/")
      .then((list) => setTenant(pickCurrentTenant(list)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    if (!tenant) return false
    setBusy(true)
    try {
      const updated = await clientFetch<Partial<MeTenant>>(
        `/api/v1/me/tenants/${tenant.slug}/`,
        { method: "PATCH", body: JSON.stringify(body) },
      )
      setTenant({ ...tenant, ...updated })
      return true
    } catch {
      toast.error("Something went wrong. Please try again.")
      return false
    } finally {
      setBusy(false)
    }
  }

  async function publish() {
    if (await patch({ is_published: true })) toast.success("Your app is live 🎉")
  }

  async function unpublish() {
    if (!window.confirm("Your site will be hidden from students until you publish again.")) return
    await patch({ is_published: false })
  }

  async function savePassword() {
    const value = pw.trim()
    if (!value) return
    if (await patch({ preview_password: value })) {
      setPw("")
      toast.success("Preview password saved")
    }
  }

  async function clearPassword() {
    if (await patch({ preview_password: "" })) toast.success("Preview password cleared")
  }

  function copyLink() {
    if (!tenant) return
    void navigator.clipboard?.writeText(tenant.studio_url)
    toast.success("Link copied")
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-28" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-9 w-40" />
        </CardContent>
      </Card>
    )
  }

  if (!tenant) return null

  return (
    <Card className={tenant.is_published ? "" : "border-amber-300 bg-amber-50/40"}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {tenant.is_published ? (
            <>
              <Globe className="h-4 w-4 text-emerald-600" /> Your app is live
            </>
          ) : (
            <>
              <Rocket className="h-4 w-4 text-amber-600" /> Publish your app
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {tenant.is_published ? (
          <>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-emerald-600">● Live</span> — students can
              find and install your app.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="sm" className="gap-1">
                <a href={tenant.studio_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" /> View site
                </a>
              </Button>
              <Button variant="ghost" size="sm" className="gap-1" onClick={copyLink}>
                <Copy className="h-3.5 w-3.5" /> Copy link
              </Button>
              <Button variant="outline" size="sm" onClick={unpublish} disabled={busy}>
                Unpublish
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Your app is hidden behind a preview gate. Publish it to let students find and
              install it.
            </p>
            <Button onClick={publish} disabled={busy} className="gap-2">
              <Rocket className="h-4 w-4" /> Publish app — go live
            </Button>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>Preview link:</span>
              <code className="rounded bg-muted px-1.5 py-0.5">{tenant.studio_url}</code>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2"
                onClick={copyLink}
              >
                <Copy className="h-3 w-3" /> Copy
              </Button>
            </div>
          </>
        )}

        {/* Preview password */}
        <div className="space-y-2 border-t pt-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <KeyRound className="h-3.5 w-3.5" /> Preview password
            {tenant.has_preview_password ? " — set" : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="text"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder={tenant.has_preview_password ? "Change password" : "Set a password"}
              className="h-9 w-48"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={savePassword}
              disabled={busy || !pw.trim()}
            >
              Save
            </Button>
            {tenant.has_preview_password && (
              <Button variant="ghost" size="sm" onClick={clearPassword} disabled={busy}>
                Clear
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Share the preview link + password to let others see the site before you publish.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Render it at the top of the dashboard**

In `frontend-customer/src/app/admin/page.tsx`, add the import near the other imports (match the file's single-quote style):

```tsx
import { PublishCard } from '@/components/admin/publish-card'
```

Then render `<PublishCard />` between the dashboard title block and the `{/* Stat cards */}` block — i.e. immediately after the closing `</div>` of:

```tsx
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back. Here is an overview of your platform.</p>
      </div>
```

so it reads:

```tsx
      </div>

      <PublishCard />

      {/* Stat cards */}
```

- [ ] **Step 3: Verify the build**

Run: `cd frontend-customer && npm run build`
Expected: build succeeds (no TypeScript errors, no new dependency). If it fails on lint/formatting, run `cd frontend-customer && npx prettier --write src/components/admin/publish-card.tsx src/app/admin/page.tsx`, then rebuild.

Behavior (stack up, signed in as the **owner** on the tenant subdomain `http://<slug>.localhost/admin`):
- An **unpublished** tenant shows the amber "Publish your app" card with a **Publish app — go live** button + the preview link + a preview-password field. Clicking Publish flips the public site out of the `PreviewGate` (verify by loading `http://<slug>.localhost/` in an incognito window).
- A **published** tenant shows "Your app is live" with **View site** / **Copy link** / **Unpublish** (the last confirms via `window.confirm`).
- Setting a preview password (while unpublished) lets an incognito visitor unlock the preview with it; **Clear** removes it.
- A non-owner coach (no owned tenant) sees no card.

- [ ] **Step 4: Commit**

```bash
git add frontend-customer/src/components/admin/publish-card.tsx frontend-customer/src/app/admin/page.tsx
git commit -m "feat(publish): coach dashboard publish/unpublish + preview-password control"
```

---

## Self-Review

**Spec coverage:**
- Publish/unpublish toggle with unpublish confirm → Step 1 (`publish`/`unpublish` + `window.confirm`).
- Preview-password set/change/clear → Step 1 (`savePassword`/`clearPassword`, `has_preview_password` driving the Clear button + label).
- Live/preview URL with View site + copy → Step 1 (published + unpublished branches).
- Reads `GET /me/tenants/`, host-matches the current tenant, single-tenant fallback, owner-only (empty → null) → `pickCurrentTenant` + the `!tenant` guard.
- Writes `PATCH /me/tenants/<slug>/`, merges the response, toasts on error → `patch`.
- Top-of-dashboard placement → Step 2.
- Hardcoded English, no new dep, build-only verification → Global Constraints + Step 3.
- No backend change → confirmed (only two frontend files touched).

**Placeholder scan:** none — the component is complete; Step 2 names the exact insertion anchor and the exact import/JSX.

**Type consistency:** `MeTenant` fields (`slug`, `name`, `is_published`, `has_preview_password`, `studio_url`) match the `GET /me/tenants/` payload and the PATCH return (merged as `Partial<MeTenant>`); the PATCH body keys `is_published`/`preview_password` match the backend's accepted fields.
