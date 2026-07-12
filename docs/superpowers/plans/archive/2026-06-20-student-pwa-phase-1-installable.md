# Student PWA — Phase 1: Installable Branded App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each coach's tenant subdomain installable to a phone home screen as its own branded PWA (correct icons, iOS support, install affordance), launching standalone — no offline behavior yet (that's Phase 2).

**Architecture:** The customer Next.js 14 app already serves a per-tenant `manifest.ts`. We add a dynamic `/pwa-icon` route that renders each tenant's logo into PNG icons via `next/og` `ImageResponse`, wire the manifest + iOS `<head>` metadata to it, add safe-area handling for standalone mode, and surface an in-app install prompt (Android `beforeinstallprompt` + iOS "Add to Home Screen" hint).

**Tech Stack:** Next.js 14 (App Router), `next/og` `ImageResponse`, `next-intl`, Tailwind, Tenant config API (`/api/v1/admin/config/`).

**Spec:** `docs/superpowers/specs/2026-06-20-student-pwa-design.md` (Phase 1 section).

## Global Constraints

- **Target app:** `frontend-customer` only. Do NOT touch `frontend-main`.
- **Scope:** student-facing PWA. The install prompt MUST NOT appear inside the coach panel (`/admin/*`).
- **Multi-tenant:** resolve the tenant from the request via the existing `getTenantSlug()` / `fetchTenantConfig()` helpers (`src/lib/tenant.ts`). Never hardcode a tenant.
- **Icon route path:** MUST be `/pwa-icon` (a route NOT excluded by `src/middleware.ts` matcher). Do NOT place it under `/icons` (excluded → no tenant header).
- **No frontend test runner exists.** Verification is `npm run build`, per-tenant `curl`, and Chrome DevTools → Application → Manifest (Lighthouse "Installable"). Do not add Jest/Vitest.
- **i18n:** every user-facing string added to BOTH `messages/en.json` and `messages/tr.json`.
- **Pre-commit** must pass clean (`make lint`): ruff + prettier + secret scan, zero warnings.
- **Branding source:** `TenantConfig` fields `brand_name`, `theme`, `logo_url`, `logo_id`, `meta_description`. Palette via `getThemePalette(config?.theme).primaryHex` (`src/lib/themes.ts`), exactly as `manifest.ts` already does.
- **Commits:** the repo rule is "never commit unless explicitly asked." Each task below ends with a commit step; the executing session must have the user's go-ahead for commits before running them (confirmed at execution handoff).

### Verification prerequisites (do once before Task 1)

- [ ] Start the stack: `make dev` (from repo root). Wait for `make health-check` to pass.
- [ ] Pick a real tenant subdomain to test against. List them:
  `make shell` then `from apps.core.models import Domain; print([d.domain for d in Domain.objects.all()])`
  (or open `/django-admin/` → Domains). Examples below use `<tenant>.localhost` — substitute a real slug (e.g. a seeded demo tenant). All `curl` examples assume Caddy on `:80`.

---

### Task 1: Per-tenant PWA icon route

Renders the tenant logo into a PNG at 180/192/512 px, with a maskable safe-zone variant and a brand-initial fallback when no logo is set.

**Files:**
- Create: `frontend-customer/src/app/pwa-icon/route.tsx`

**Interfaces:**
- Consumes: `getTenantSlug()`, `fetchTenantConfig()` from `@/lib/tenant`; `getThemePalette()` from `@/lib/themes`; `ImageResponse` from `next/og`.
- Produces: `GET /pwa-icon?size=180|192|512&purpose=any|maskable&v=<logo_id>` → `image/png`. Consumed by Task 2 (manifest) and Task 3 (apple-touch-icon).

- [ ] **Step 1: Verify the gap**

Run: `curl -sI "http://<tenant>.localhost/pwa-icon?size=192"`
Expected: `HTTP/1.1 404 Not Found` (route does not exist yet).

- [ ] **Step 2: Create the route**

Create `frontend-customer/src/app/pwa-icon/route.tsx`:

```tsx
import { ImageResponse } from "next/og";

import { getThemePalette } from "@/lib/themes";
import { fetchTenantConfig, getTenantSlug } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const SIZES: Record<string, number> = { "180": 180, "192": 192, "512": 512 };

export async function GET(request: Request): Promise<ImageResponse> {
  const { searchParams } = new URL(request.url);
  const size = SIZES[searchParams.get("size") ?? "512"] ?? 512;
  const maskable = searchParams.get("purpose") === "maskable";

  const slug = await getTenantSlug();
  const config = slug !== "__platform__" ? await fetchTenantConfig(slug) : null;
  const theme = getThemePalette(config?.theme);
  const brand = config?.brand_name || "Contentor";
  const logoUrl = config?.logo_url || null;

  // Maskable icons must keep content inside an ~80% safe zone; plain icons get
  // a smaller margin so the logo doesn't touch the edges.
  const pad = Math.round(size * (maskable ? 0.12 : 0.06));
  const inner = size - pad * 2;

  const fallback = (
    <div
      style={{
        display: "flex",
        width: inner,
        height: inner,
        alignItems: "center",
        justifyContent: "center",
        color: "#ffffff",
        fontSize: inner * 0.55,
        fontWeight: 700,
      }}
    >
      {brand.charAt(0).toUpperCase()}
    </div>
  );

  // eslint-disable-next-line @next/next/no-img-element
  const logo = logoUrl ? (
    <img src={logoUrl} width={inner} height={inner} alt="" style={{ objectFit: "contain" }} />
  ) : (
    fallback
  );

  const render = (child: React.ReactElement) =>
    new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            width: size,
            height: size,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.primaryHex,
          }}
        >
          {child}
        </div>
      ),
      {
        width: size,
        height: size,
        headers: {
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        },
      },
    );

  try {
    return render(logo);
  } catch {
    // Logo fetch/format failure (e.g. unsupported SVG/WebP) → brand initial.
    return render(fallback);
  }
}
```

- [ ] **Step 3: Verify it returns a PNG (with logo)**

Run (use a tenant that has a logo uploaded):
```bash
curl -s "http://<tenant>.localhost/pwa-icon?size=192" --output /tmp/icon-192.png
file /tmp/icon-192.png
```
Expected: `/tmp/icon-192.png: PNG image data, 192 x 192, ...`

- [ ] **Step 4: Verify the no-logo fallback + maskable**

Run:
```bash
curl -sI "http://<tenant>.localhost/pwa-icon?size=512&purpose=maskable" | grep -i "content-type\|cache-control"
```
Expected: `content-type: image/png` and `cache-control: public, max-age=86400, ...`. Open a tenant with no logo in the browser at `/pwa-icon?size=512` and confirm a centered brand-initial mark on the theme color.

- [ ] **Step 5: Build**

Run: `cd frontend-customer && npm run build`
Expected: build succeeds (route `/pwa-icon` listed as a dynamic ƒ route).

- [ ] **Step 6: Commit**

```bash
git add frontend-customer/src/app/pwa-icon/route.tsx
git commit -m "feat(pwa): per-tenant icon route rendering tenant logo to PNG"
```

---

### Task 2: Wire the manifest to the icon route + add maskable/metadata

**Files:**
- Modify: `frontend-customer/src/app/manifest.ts`

**Interfaces:**
- Consumes: Task 1's `/pwa-icon` route.
- Produces: a manifest whose `icons` point at `/pwa-icon` (192, 512, 512-maskable), cache-busted by `logo_id`, plus `id`/`scope`/`orientation`/`categories`/`lang`.

- [ ] **Step 1: Verify the gap**

Run: `curl -s "http://<tenant>.localhost/manifest.webmanifest" | grep -o "/icons/icon-[0-9]*x[0-9]*.png"`
Expected: matches the OLD static paths `/icons/icon-192x192.png`, `/icons/icon-512x512.png` (which 404). After this task they must be gone.

- [ ] **Step 2: Replace the manifest body**

Replace the contents of `frontend-customer/src/app/manifest.ts` with:

```ts
import type { MetadataRoute } from "next";

import { getThemePalette } from "@/lib/themes";
import { fetchTenantConfig, getTenantSlug } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const slug = await getTenantSlug();
  const config = slug !== "__platform__" ? await fetchTenantConfig(slug) : null;
  const theme = getThemePalette(config?.theme);
  const name = config?.brand_name ?? "Contentor";
  const v = config?.logo_id ?? "default";

  return {
    id: "/",
    name,
    short_name: name,
    description: config?.meta_description ?? "Content creator platform",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "en",
    categories: ["education"],
    background_color: "#ffffff",
    theme_color: theme.primaryHex,
    icons: [
      { src: `/pwa-icon?size=192&v=${v}`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `/pwa-icon?size=512&v=${v}`, sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: `/pwa-icon?size=512&purpose=maskable&v=${v}`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
```

- [ ] **Step 3: Verify the manifest serves tenant branding + new icons**

Run:
```bash
curl -s "http://<tenant>.localhost/manifest.webmanifest" | jq '{name, theme_color, icons: [.icons[].src]}'
```
Expected: `name` = the tenant brand, `theme_color` = a hex, and `icons` srcs are all `/pwa-icon?...` (including one `purpose=maskable`). No `/icons/icon-*.png`.

- [ ] **Step 4: Build**

Run: `cd frontend-customer && npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/app/manifest.ts
git commit -m "feat(pwa): point manifest at dynamic icons, add maskable + scope/id"
```

---

### Task 3: iOS + theme-color metadata in the root layout

iOS Safari ignores the manifest, so it needs `apple-touch-icon`, `apple-mobile-web-app-*`, and a `theme-color` meta. `viewport-fit=cover` enables safe-area insets (Task 4).

**Files:**
- Modify: `frontend-customer/src/app/layout.tsx`

**Interfaces:**
- Consumes: Task 1's `/pwa-icon` route; `getThemePalette`.
- Produces: per-tenant `generateViewport()` (themeColor + `viewportFit: "cover"`) and an extended `generateMetadata()` with `appleWebApp` + `icons.apple`.

- [ ] **Step 1: Verify the gap**

Run: `curl -s "http://<tenant>.localhost/" | grep -o 'apple-mobile-web-app-capable\|apple-touch-icon\|name="theme-color"'`
Expected: no matches (none present yet).

- [ ] **Step 2: Add the theme-color import**

In `frontend-customer/src/app/layout.tsx`, add `getThemePalette` to the imports and `Viewport` to the type import from `next`:

```ts
import type { Metadata, Viewport } from "next";
```
```ts
import { getThemePalette } from "@/lib/themes";
```
(Place the `getThemePalette` import alongside the existing `@/lib/...` imports.)

- [ ] **Step 3: Add `generateViewport` and extend `generateMetadata`**

Replace the existing `generateMetadata` function in `layout.tsx` with:

```ts
export async function generateViewport(): Promise<Viewport> {
  const slug = await getTenantSlug();
  const config = await fetchTenantConfig(slug);
  const theme = getThemePalette(config?.theme);

  return {
    themeColor: theme.primaryHex,
    viewportFit: "cover",
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const slug = await getTenantSlug();
  const config = await fetchTenantConfig(slug);
  const name = config?.brand_name || "Welcome";
  const v = config?.logo_id ?? "default";

  return {
    title: name,
    description: config?.meta_description || "",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: name,
    },
    icons: {
      apple: [{ url: `/pwa-icon?size=180&v=${v}`, sizes: "180x180" }],
    },
  };
}
```

- [ ] **Step 4: Verify the meta is present**

Run:
```bash
curl -s "http://<tenant>.localhost/" | grep -o 'apple-mobile-web-app-capable\|apple-touch-icon\|name="theme-color"\|viewport-fit=cover'
```
Expected: all four substrings appear. Confirm the `apple-touch-icon` href contains `/pwa-icon?size=180`.

- [ ] **Step 5: Build**

Run: `cd frontend-customer && npm run build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add frontend-customer/src/app/layout.tsx
git commit -m "feat(pwa): iOS apple-web-app meta, per-tenant theme-color, viewport-fit cover"
```

---

### Task 4: Install affordance component (Android prompt + iOS hint)

**Files:**
- Create: `frontend-customer/src/components/shared/install-prompt.tsx`
- Modify: `frontend-customer/src/app/layout.tsx` (mount it)
- Modify: `frontend-customer/messages/en.json`, `frontend-customer/messages/tr.json`

**Interfaces:**
- Consumes: `useTranslations("pwa")`, `usePathname`.
- Produces: `<InstallPrompt />` — a dismissible bottom banner; hidden in standalone mode, on `/admin/*`, and after dismissal (persisted in `localStorage`).

- [ ] **Step 1: Add i18n strings**

In `frontend-customer/messages/en.json`, add a top-level `"pwa"` key:

```json
"pwa": {
  "installPrompt": "Install this app on your home screen",
  "install": "Install",
  "iosHint": "Tap the Share icon, then \"Add to Home Screen\"",
  "dismiss": "Dismiss"
}
```

In `frontend-customer/messages/tr.json`, add:

```json
"pwa": {
  "installPrompt": "Bu uygulamayı ana ekranınıza ekleyin",
  "install": "Yükle",
  "iosHint": "Paylaş simgesine dokunun, ardından \"Ana Ekrana Ekle\"",
  "dismiss": "Kapat"
}
```

(Place the key consistently with the file's existing structure; keep valid JSON — no trailing commas.)

- [ ] **Step 2: Create the component**

Create `frontend-customer/src/components/shared/install-prompt.tsx`:

```tsx
"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useTranslations } from "next-intl";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pwa-install-dismissed";

export function InstallPrompt() {
  const t = useTranslations("pwa");
  const pathname = usePathname();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    setHidden(false);

    const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    if (isIos) setShowIosHint(true);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setHidden(true);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    dismiss();
  };

  // Never show inside the coach admin, in standalone, after dismissal, or with
  // nothing to offer.
  if (pathname?.startsWith("/admin")) return null;
  if (hidden || (!deferred && !showIosHint)) return null;

  return (
    <div
      className="fixed inset-x-3 bottom-3 z-50 flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm text-foreground shadow-lg"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      role="dialog"
      aria-live="polite"
    >
      <span className="flex-1">{deferred ? t("installPrompt") : t("iosHint")}</span>
      {deferred && (
        <button
          onClick={install}
          className="rounded-lg bg-primary px-3 py-1.5 font-medium text-primary-foreground"
        >
          {t("install")}
        </button>
      )}
      <button
        onClick={dismiss}
        aria-label={t("dismiss")}
        className="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground"
      >
        ✕
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Mount it in the layout**

In `frontend-customer/src/app/layout.tsx`, import the component:

```ts
import { InstallPrompt } from "@/components/shared/install-prompt";
```

Then render `<InstallPrompt />` inside the non-gated branch, immediately after `{children}`:

```tsx
                <>
                  <RedirectToast />
                  <DemoBanner />
                  {children}
                  <InstallPrompt />
                </>
```

- [ ] **Step 4: Verify (build + lint)**

Run: `cd frontend-customer && npm run build && npm run lint`
Expected: both succeed (no TS/ESLint errors; the `pwa` namespace resolves).

- [ ] **Step 5: Verify behavior in the browser**

- Android/desktop Chrome at `http://<tenant>.localhost/` → after the page is eligible, the bottom "Install" banner appears; clicking **Install** triggers Chrome's install dialog; **✕** dismisses and it stays gone on reload (localStorage).
- DevTools → toggle iOS user-agent → reload → the iOS hint banner appears instead (no Install button).
- Navigate to `/admin` → banner is absent.
- DevTools → Application → "Manifest" → click "Install"/standalone → banner is absent in standalone.

- [ ] **Step 6: Commit**

```bash
git add frontend-customer/src/components/shared/install-prompt.tsx frontend-customer/src/app/layout.tsx frontend-customer/messages/en.json frontend-customer/messages/tr.json
git commit -m "feat(pwa): in-app install prompt (Android) + iOS add-to-home-screen hint"
```

---

### Task 5: Standalone polish + mobile audit + installability sign-off

Apply safe-area insets to the real sticky/fixed chrome on student pages, fix obvious mobile breakage on the key student routes, and confirm installability end-to-end.

**Files:**
- Modify: `frontend-customer/src/styles/globals.css` (safe-area helpers)
- Modify: whichever student-facing sticky/fixed header or bottom-bar components the audit surfaces (e.g. the public/student header). Identify them by reading the layouts under `src/app/(public)` and `src/app/(student)`.

**Interfaces:**
- Consumes: `viewport-fit=cover` from Task 3.
- Produces: a UI that doesn't collide with the notch/home-indicator in standalone and is usable at 390px width.

- [ ] **Step 1: Add safe-area helpers to globals.css**

Append to `frontend-customer/src/styles/globals.css`:

```css
/* PWA standalone: keep fixed/sticky chrome clear of the notch & home indicator. */
.pt-safe {
  padding-top: env(safe-area-inset-top);
}
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom);
}
```

- [ ] **Step 2: Audit the key student routes at mobile width**

In Chrome DevTools device mode (e.g. iPhone 12, 390px), walk each route on `http://<tenant>.localhost` and note any horizontal overflow, clipped headers, or sub-44px tap targets:
`/`, `/dashboard`, `/courses`, `/learn/<a-real-slug>`, `/live-classes`, `/store`, `/orders`, `/plans`.

- [ ] **Step 3: Apply safe-area insets + fix obvious breakage**

For each sticky/fixed top header found in the `(public)`/`(student)` layouts, add `pt-safe`; for any fixed bottom bar, add `pb-safe`. Fix any horizontal-overflow / clipped-content issues found in Step 2 with minimal, in-pattern Tailwind changes (do not redesign). If Step 2 found no breakage beyond safe-area, only the inset classes are needed.

- [ ] **Step 4: Verify**

- Run: `cd frontend-customer && npm run build && npm run lint` → both succeed.
- DevTools device mode → the audited routes show no horizontal scroll; headers clear the status-bar area.

- [ ] **Step 5: Installability sign-off (Lighthouse)**

In Chrome DevTools on `http://<tenant>.localhost/`:
- Application → Manifest: name, theme color, and all icons load (no 404s); "Installability" reports no errors.
- Run Lighthouse with only the PWA/installability checks (or `npx lighthouse http://<tenant>.localhost --only-categories=pwa --view`).
- Expected: "Web app manifest meets the installability requirements" and "Configured for a custom splash screen" pass. (Offline/SW checks are EXPECTED TO FAIL here — they're Phase 2.)

- [ ] **Step 6: Commit**

```bash
git add frontend-customer/src/styles/globals.css frontend-customer/src/app
git commit -m "feat(pwa): safe-area insets for standalone + mobile fixes for student routes"
```

---

## Self-Review

**Spec coverage (Phase 1 section):**
- Dynamic per-tenant icon route (192/512/maskable/180, logo + fallback, cache-bust) → Task 1.
- Manifest points at the route, adds maskable + `id`/`scope` → Task 2.
- iOS `appleWebApp` + `apple-touch-icon`, per-tenant `theme-color`, `viewport-fit=cover` → Task 3.
- Safe-area CSS for the standalone shell → Task 5.
- Install affordance (Android `beforeinstallprompt` button + iOS hint, standalone/`/admin` gating, persisted dismissal) → Task 4.
- Mobile audit of student routes → Task 5.
- i18n in en + tr → Task 4 (strings folded into the deliverable that needs them).
- Verification = Lighthouse + per-tenant curl + build (no frontend runner) → every task's verify steps; installability sign-off in Task 5.

**Placeholder scan:** No "TBD"/"add error handling" placeholders; the icon route has an explicit try/catch fallback; the `<tenant>.localhost` token is runtime data with a listed lookup command, not a code placeholder.

**Type consistency:** `/pwa-icon` query contract (`size`/`purpose`/`v`) is identical across Tasks 1–3; `getThemePalette(config?.theme).primaryHex`, `config.logo_id`, `config.logo_url`, `config.brand_name` match `src/types/tenant.ts` and existing `manifest.ts` usage; the `pwa` i18n namespace keys used in Task 4's component all exist in the Task 4 JSON.

**Out of scope (Phase 2/3):** service worker, offline caching, push — not in this plan.
