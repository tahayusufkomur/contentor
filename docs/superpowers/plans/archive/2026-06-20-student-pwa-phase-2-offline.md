# Student PWA — Phase 2: Offline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Serwist service worker so the installed PWA loads instantly, re-opens already-viewed pages offline, and shows a branded offline fallback — without ever caching authenticated, checkout, or cross-tenant-sensitive responses.

**Architecture:** Wire `@serwist/next` into the customer app with a custom `src/app/sw.ts` (precache + `defaultCache` runtime caching + navigation caching). The offline fallback is a self-contained static `public/offline.html` (NOT an app route — the root layout is `force-dynamic` and tenant-fetching, so it can't render offline). A denylist forces `NetworkOnly` for sensitive paths. A small client toast surfaces SW updates.

**Tech Stack:** `@serwist/next` + `serwist`, Next.js 14 App Router, `next-intl`, sonner.

**Spec:** `docs/superpowers/specs/2026-06-20-student-pwa-design.md` (Phase 2 section). **Depends on:** Phase 1 (installable manifest/icons).

## Global Constraints

- **Target app:** `frontend-customer` only.
- **Per-origin isolation:** each tenant subdomain registers its own SW + Cache Storage — cross-tenant leakage is structurally impossible. Still apply the sensitive-path denylist below.
- **Never cache** (NetworkOnly): `/admin*`, `/checkout*`, `/api/v1/billing*`, `/api/v1/auth*`, any Stripe (`*.stripe.com`) or Stream.io (`*.stream-io-api.com`, `getstream.io`) host, and any response carrying `cache-control: private` or `set-cookie`.
- **SW is disabled in dev by default.** A `SERWIST_DEV=1` env enables it for verification. All offline verification runs with the SW enabled (see prerequisites).
- **i18n:** new strings in BOTH `messages/en.json` and `messages/tr.json`.
- **`public/sw.js` + `public/sw.js.map` are build artifacts** → gitignored, never committed.
- **Pre-commit** must pass clean (`make lint`).
- **Commits:** commit per task (user-approved).

### Verification prerequisites

- [ ] Enable the SW in dev for this phase: add `SERWIST_DEV=1` to the `nextjs-customer` service `environment:` in `docker-compose.yml` (revert before finishing), then `make dev`. Alternatively `cd frontend-customer && SERWIST_DEV=1 npm run build && SERWIST_DEV=1 npm run start` with `DJANGO_API_URL` pointed at the running Django.
- [ ] Use a real tenant subdomain `http://<tenant>.localhost` (see Phase 1 prerequisites for listing tenants).

---

### Task 1: Install Serwist and register a base service worker

**Files:**
- Modify: `frontend-customer/package.json` (deps)
- Modify: `frontend-customer/next.config.mjs`
- Modify: `frontend-customer/tsconfig.json`
- Create: `frontend-customer/src/app/sw.ts`
- Modify: `frontend-customer/.gitignore` (create if absent)

**Interfaces:**
- Produces: a registered SW at `/sw.js` with `__SW_MANIFEST` precache + `defaultCache` runtime caching. Consumed by Tasks 2–4.

- [ ] **Step 1: Install deps**

Run: `cd frontend-customer && npm install @serwist/next && npm install -D serwist`
Expected: both added to `package.json`.

- [ ] **Step 2: Ignore the generated SW**

Add to `frontend-customer/.gitignore` (create the file if it doesn't exist):

```
# Serwist-generated service worker
public/sw.js
public/sw.js.map
```

- [ ] **Step 3: Compose Serwist into next.config.mjs**

In `frontend-customer/next.config.mjs`, add the import and a `revision`, then wrap the existing `withNextIntl(nextConfig)` export. Replace the final export line:

```js
import withSerwistInit from "@serwist/next";
```

```js
const revision = crypto.randomUUID();

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  cacheOnNavigation: true,
  disable: process.env.NODE_ENV === "development" && process.env.SERWIST_DEV !== "1",
  additionalPrecacheEntries: [{ url: "/offline.html", revision }],
});
```

Change the export from `export default withNextIntl(nextConfig);` to:

```js
export default withSerwist(withNextIntl(nextConfig));
```

- [ ] **Step 4: Add webworker types to tsconfig**

In `frontend-customer/tsconfig.json`, add `"webworker"` to `compilerOptions.lib` and add `"@serwist/next/typings"` to `compilerOptions.types` (create the `types` array if absent). Example `lib`: `["dom", "dom.iterable", "esnext", "webworker"]`.

- [ ] **Step 5: Create the service worker**

Create `frontend-customer/src/app/sw.ts`:

```ts
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
```

- [ ] **Step 6: Build and verify the SW is emitted + registers**

Run: `cd frontend-customer && npm run build`
Expected: build succeeds and `public/sw.js` is generated (`ls -la public/sw.js`).

With the SW enabled (prerequisites), load `http://<tenant>.localhost/` and check DevTools → Application → Service Workers: a worker for the origin is "activated and running". Network panel shows `sw.js` served.

- [ ] **Step 7: Commit**

```bash
git add frontend-customer/package.json frontend-customer/package-lock.json frontend-customer/next.config.mjs frontend-customer/tsconfig.json frontend-customer/src/app/sw.ts frontend-customer/.gitignore
git commit -m "feat(pwa): register Serwist service worker with default runtime caching"
```

---

### Task 2: Branded offline fallback page

**Files:**
- Create: `frontend-customer/public/offline.html`
- Modify: `frontend-customer/src/app/sw.ts` (add `fallbacks`)

**Interfaces:**
- Consumes: `additionalPrecacheEntries` for `/offline.html` (Task 1, Step 3).
- Produces: failed document navigations serve `/offline.html`.

- [ ] **Step 1: Verify the gap**

With the SW active, in DevTools → Network, toggle "Offline", then navigate to a never-visited path `http://<tenant>.localhost/never-visited`.
Expected (before this task): the browser's default offline error page.

- [ ] **Step 2: Create the static offline page**

Create `frontend-customer/public/offline.html` — self-contained (inline CSS, no JS, no server/tenant dependency), neutral branding:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>You're offline</title>
    <style>
      :root { color-scheme: light dark; }
      html, body { height: 100%; margin: 0; }
      body {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 0.75rem; padding: 2rem; text-align: center;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        background: #ffffff; color: #111827;
      }
      h1 { font-size: 1.25rem; margin: 0; }
      p { margin: 0; color: #6b7280; max-width: 28rem; }
      button {
        margin-top: 0.5rem; padding: 0.6rem 1.1rem; border: 0; border-radius: 0.6rem;
        background: #111827; color: #fff; font-size: 0.95rem; font-weight: 600;
      }
      @media (prefers-color-scheme: dark) {
        body { background: #0b0f17; color: #e5e7eb; }
        p { color: #9ca3af; }
        button { background: #e5e7eb; color: #0b0f17; }
      }
    </style>
  </head>
  <body>
    <h1>You're offline</h1>
    <p>This page needs a connection. Pages you've already opened are still available — reconnect to load new content.</p>
    <button onclick="location.reload()">Try again</button>
  </body>
</html>
```

- [ ] **Step 3: Wire the fallback in sw.ts**

In `frontend-customer/src/app/sw.ts`, add the `fallbacks` option to the `Serwist` constructor (after `runtimeCaching: defaultCache,`):

```ts
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: "/offline.html",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
```

- [ ] **Step 4: Verify offline fallback**

Run: `cd frontend-customer && npm run build` → success.
With the SW active: visit `http://<tenant>.localhost/` (online, to install the SW), then DevTools → Network → Offline, navigate to `http://<tenant>.localhost/never-visited`.
Expected: the branded "You're offline" page renders instead of the browser error.

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/public/offline.html frontend-customer/src/app/sw.ts
git commit -m "feat(pwa): branded offline fallback page served on failed navigations"
```

---

### Task 3: Auth- and tenant-safe runtime caching

Ensure sensitive responses are never cached, and already-viewed content pages are available offline.

**Files:**
- Modify: `frontend-customer/src/app/sw.ts`

**Interfaces:**
- Consumes: `defaultCache` (Task 1).
- Produces: a `runtimeCaching` array that prepends NetworkOnly rules for sensitive paths before `defaultCache`.

- [ ] **Step 1: Add a denylist of NetworkOnly rules**

In `frontend-customer/src/app/sw.ts`, add the import and a guarded cache list. Replace `import { defaultCache } from "@serwist/next/worker";` with:

```ts
import { defaultCache } from "@serwist/next/worker";
import { NetworkOnly, type RuntimeCaching } from "serwist";
```

Add above the `new Serwist(...)` call:

```ts
// Never cache auth, billing/checkout, or third-party payment/chat traffic.
// These match first, so defaultCache never sees them.
const NEVER_CACHE: RegExp[] = [
  /^\/admin(\/|$)/,
  /^\/checkout(\/|$)/,
  /^\/api\/v1\/(auth|billing)(\/|$)/,
];
const NEVER_CACHE_HOSTS = ["stripe.com", "stream-io-api.com", "getstream.io"];

const guardedCache: RuntimeCaching[] = [
  {
    matcher({ url, sameOrigin }) {
      if (!sameOrigin) return NEVER_CACHE_HOSTS.some((h) => url.hostname.endsWith(h));
      return NEVER_CACHE.some((re) => re.test(url.pathname));
    },
    handler: new NetworkOnly(),
  },
  ...defaultCache,
];
```

Then change `runtimeCaching: defaultCache,` to `runtimeCaching: guardedCache,`.

- [ ] **Step 2: Build**

Run: `cd frontend-customer && npm run build`
Expected: success.

- [ ] **Step 3: Verify sensitive paths are never cached**

With the SW active and online, visit `/admin` and a billing/checkout page, then DevTools → Application → Cache Storage. Expand the caches.
Expected: no entries for `/admin*`, `/checkout*`, `/api/v1/billing*`, `/api/v1/auth*`, or Stripe/Stream hosts.

- [ ] **Step 4: Verify viewed pages re-open offline**

Online: visit `/courses` and one `/learn/<slug>`. Then Network → Offline and re-navigate to those same URLs.
Expected: they render from cache (navigation caching). An un-visited page still shows the offline fallback.

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/app/sw.ts
git commit -m "feat(pwa): NetworkOnly guard for auth/billing/checkout/3p before runtime cache"
```

---

### Task 4: "Update available" toast

When a new SW version installs, prompt the user to refresh rather than swapping silently.

**Files:**
- Create: `frontend-customer/src/components/shared/sw-update-toast.tsx`
- Modify: `frontend-customer/src/app/layout.tsx` (mount it)
- Modify: `frontend-customer/messages/en.json`, `frontend-customer/messages/tr.json`

**Interfaces:**
- Consumes: `navigator.serviceWorker`, sonner `toast`, `useTranslations("pwa")`.
- Produces: `<SwUpdateToast />`.

- [ ] **Step 1: Add i18n strings**

In `frontend-customer/messages/en.json`, under the existing `"pwa"` key (added in Phase 1), add:

```json
"updateAvailable": "A new version is available",
"refresh": "Refresh"
```

In `frontend-customer/messages/tr.json`, under `"pwa"`:

```json
"updateAvailable": "Yeni bir sürüm mevcut",
"refresh": "Yenile"
```

(Keep valid JSON — add a comma after the preceding entry.)

- [ ] **Step 2: Create the component**

Create `frontend-customer/src/components/shared/sw-update-toast.tsx`:

```tsx
"use client";

import { useEffect } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

export function SwUpdateToast() {
  const t = useTranslations("pwa");

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let reg: ServiceWorkerRegistration | undefined;

    const notify = () => {
      toast(t("updateAvailable"), {
        action: { label: t("refresh"), onClick: () => window.location.reload() },
        duration: Infinity,
      });
    };

    navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration) return;
      reg = registration;
      reg.addEventListener("updatefound", () => {
        const installing = reg?.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          // A new worker reached "installed" while a controller already exists
          // → this is an update, not a first install.
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            notify();
          }
        });
      });
    });
  }, [t]);

  return null;
}
```

- [ ] **Step 3: Mount it in the layout**

In `frontend-customer/src/app/layout.tsx`, import and render `<SwUpdateToast />` next to the Phase 1 `<InstallPrompt />` (inside the non-gated branch, after `{children}`):

```ts
import { SwUpdateToast } from "@/components/shared/sw-update-toast";
```
```tsx
                  {children}
                  <InstallPrompt />
                  <SwUpdateToast />
```

- [ ] **Step 4: Verify**

Run: `cd frontend-customer && npm run build && npm run lint` → both succeed.
Behavior: with the SW active, make a trivial change (so a new `sw.js`/asset hash is produced), rebuild, reload the app twice → the "A new version is available" toast appears with a working **Refresh** action.

- [ ] **Step 5: Revert the dev SW toggle**

Remove `SERWIST_DEV=1` from `docker-compose.yml` if it was added. Confirm `git diff docker-compose.yml` is empty.

- [ ] **Step 6: Commit**

```bash
git add frontend-customer/src/components/shared/sw-update-toast.tsx frontend-customer/src/app/layout.tsx frontend-customer/messages/en.json frontend-customer/messages/tr.json
git commit -m "feat(pwa): toast prompting refresh when a new service worker is available"
```

---

## Self-Review

**Spec coverage (Phase 2 section):**
- Serwist wired (compose with `withNextIntl`, custom `sw.ts`, disabled in dev) → Task 1.
- App-shell precache + `defaultCache` runtime caching → Task 1.
- Branded offline fallback → Task 2 (static `public/offline.html`, chosen because the `force-dynamic` root layout can't render offline).
- Tenant/auth-safe caching: per-origin isolation + NetworkOnly denylist for auth/billing/checkout/Stripe/Stream → Task 3.
- Navigations cached for offline re-open (`cacheOnNavigation`) → Tasks 1 & 3 verification.
- Update UX toast → Task 4.

**Placeholder scan:** No placeholders; the `NEVER_CACHE`/`NEVER_CACHE_HOSTS` lists and the offline HTML are concrete and complete.

**Type consistency:** `sw.ts` evolves additively across Tasks 1→2→3 (`runtimeCaching: defaultCache` → `guardedCache`; `fallbacks` added once); the `pwa` i18n namespace is shared with Phase 1 and only extended.

**Known limitation (documented, not a gap):** cross-origin signed-S3 media (PDF/video) is not explicitly precached — offline coverage is app shell + already-viewed pages + static assets, matching the "cache browsed content" depth. Deep media offline is a future refinement.

**Out of scope (Phase 3):** the `push` / `notificationclick` listeners are added to this same `sw.ts` in Phase 3.
