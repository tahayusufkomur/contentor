# Install Guide Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public `/install` page that shows students illustrated, platform-aware step-by-step instructions to install the PWA, with a one-tap Install button where the browser supports it.

**Architecture:** Frontend-only (`frontend-customer`). A thin server route renders a client `InstallGuide` that auto-detects iPhone/Android (reusing `detectPlatform`), shows a primary one-tap **Install** button when `beforeinstallprompt` is available, otherwise the illustrated manual steps (the only path on iOS). Visuals are three small theme-aware, label-parameterized SVG primitives. Entry points (install banner, student header, coach PublishCard) link to it.

**Tech Stack:** Next.js 14 (App Router), next-intl, Tailwind + shadcn tokens, inline SVG. No backend changes, no new dependency.

**Spec:** `docs/superpowers/specs/2026-06-21-install-guide-design.md`.

## Global Constraints

- **i18n:** all guide + banner copy goes through the existing **`pwa`** namespace (`frontend-customer/messages/en/pwa.json` + `messages/tr/pwa.json`), matching `InstallPrompt`. The `PublicHeader` and `PublishCard` are hardcoded English (their host files are), so their link labels are hardcoded English — match each host file.
- **Visuals:** theme-aware inline SVG using shadcn CSS tokens — `hsl(var(--card))`, `hsl(var(--border))`, `hsl(var(--muted))`, `hsl(var(--muted-foreground))`, `hsl(var(--primary))`. No image files, no chart/icon-image deps.
- **Platform handling:** `detectPlatform()` (export it from `@/lib/usage` — currently a local helper) → default tab; `isStandalone()` (`@/lib/push`, already exported) → "already installed" state; `beforeinstallprompt` captured the same way as `InstallPrompt` for the one-tap Install button (Android/Chromium only; never iOS).
- **No backend change. No new dependency.** Reuse existing primitives.
- **No frontend test runner** — verification is `cd frontend-customer && npm run build` + manual.
- **Commit per task** (confirm commit go-ahead at execution).

---

### Task 1: SVG illustration primitives

**Files:**
- Create: `frontend-customer/src/components/install/install-illustrations.tsx`

**Interfaces:**
- Produces (consumed by Task 2):
  - `ToolbarIcon({ variant: "share" | "menu"; className?: string })` — a phone with the iOS share icon (bottom toolbar) or Android ⋮ menu (top toolbar) highlighted.
  - `MenuSheet({ side: "bottom" | "top"; label: string; className?: string })` — a phone with a sheet/menu and one row (showing `label`) highlighted.
  - `ConfirmDialog({ label: string; className?: string })` — a phone with a centered dialog whose confirm button shows `label`, highlighted.
  - `InstalledCheck({ className?: string })` — a checkmark badge.

- [ ] **Step 1: Create the file**

Create `frontend-customer/src/components/install/install-illustrations.tsx`:

```tsx
import type { ReactNode } from "react";

const FRAME = "hsl(var(--border))";
const CARD = "hsl(var(--card))";
const MUTED = "hsl(var(--muted))";
const FAINT = "hsl(var(--muted-foreground))";
const ACCENT = "hsl(var(--primary))";

function PhoneFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 120 200" className={className} role="img" aria-hidden="true">
      <rect x="8" y="4" width="104" height="192" rx="16" fill={CARD} stroke={FRAME} strokeWidth="2" />
      <rect x="48" y="10" width="24" height="5" rx="2.5" fill={FAINT} opacity="0.35" />
      {children}
    </svg>
  );
}

function ContentLines() {
  return (
    <g fill={MUTED}>
      <rect x="20" y="72" width="80" height="9" rx="4.5" />
      <rect x="20" y="88" width="58" height="7" rx="3.5" />
      <rect x="20" y="102" width="68" height="7" rx="3.5" />
    </g>
  );
}

export function ToolbarIcon({ variant, className }: { variant: "share" | "menu"; className?: string }) {
  const bottom = variant === "share";
  const barY = bottom ? 170 : 18;
  return (
    <PhoneFrame className={className}>
      <ContentLines />
      <rect x="8" y={barY} width="104" height="24" fill={MUTED} opacity="0.5" />
      {variant === "share" ? (
        <g stroke={ACCENT} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <rect x="52" y={barY + 8} width="16" height="12" rx="2" />
          <path d={`M60 ${barY + 12} V${barY - 2}`} />
          <path d={`M56 ${barY + 2} L60 ${barY - 2} L64 ${barY + 2}`} />
        </g>
      ) : (
        <g fill={ACCENT}>
          <circle cx="96" cy={barY + 6} r="2.2" />
          <circle cx="96" cy={barY + 12} r="2.2" />
          <circle cx="96" cy={barY + 18} r="2.2" />
        </g>
      )}
      <circle cx={variant === "share" ? 60 : 96} cy={barY + 12} r="15" fill="none" stroke={ACCENT} strokeWidth="1.5" opacity="0.5" />
    </PhoneFrame>
  );
}

export function MenuSheet({ side, label, className }: { side: "bottom" | "top"; label: string; className?: string }) {
  const sheetY = side === "bottom" ? 120 : 22;
  return (
    <PhoneFrame className={className}>
      <ContentLines />
      <rect x="14" y={sheetY} width="92" height="68" rx="10" fill={CARD} stroke={FRAME} strokeWidth="1.5" />
      <rect x="22" y={sheetY + 10} width="76" height="14" rx="4" fill={ACCENT} opacity="0.15" stroke={ACCENT} strokeWidth="1.5" />
      <text x="28" y={sheetY + 20} fontSize="7" fill={ACCENT} fontWeight="600">{label}</text>
      <rect x="22" y={sheetY + 32} width="64" height="7" rx="3.5" fill={MUTED} />
      <rect x="22" y={sheetY + 46} width="70" height="7" rx="3.5" fill={MUTED} />
    </PhoneFrame>
  );
}

export function ConfirmDialog({ label, className }: { label: string; className?: string }) {
  return (
    <PhoneFrame className={className}>
      <ContentLines />
      <rect x="8" y="4" width="104" height="192" rx="16" fill={FAINT} opacity="0.15" />
      <rect x="22" y="76" width="76" height="48" rx="10" fill={CARD} stroke={FRAME} strokeWidth="1.5" />
      <rect x="34" y="86" width="52" height="6" rx="3" fill={MUTED} />
      <rect x="40" y="102" width="40" height="14" rx="7" fill={ACCENT} />
      <text x="60" y="111.5" fontSize="7" fill="hsl(var(--primary-foreground))" fontWeight="600" textAnchor="middle">{label}</text>
    </PhoneFrame>
  );
}

export function InstalledCheck({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-hidden="true">
      <circle cx="32" cy="32" r="28" fill={ACCENT} opacity="0.12" />
      <circle cx="32" cy="32" r="20" fill="none" stroke={ACCENT} strokeWidth="3" />
      <path d="M23 32 L29 38 L41 26" fill="none" stroke={ACCENT} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `cd frontend-customer && npm run build`
Expected: build succeeds (no TS errors). If lint/format fails, run `npx prettier --write src/components/install/install-illustrations.tsx` and rebuild.

- [ ] **Step 3: Commit**

```bash
git add frontend-customer/src/components/install/install-illustrations.tsx
git commit -m "feat(install): theme-aware SVG illustration primitives for the install guide"
```

---

### Task 2: InstallGuide component + `/install` route + i18n

**Files:**
- Modify: `frontend-customer/src/lib/usage.ts` (export `detectPlatform`)
- Create: `frontend-customer/src/components/install/install-guide.tsx`
- Create: `frontend-customer/src/app/(public)/install/page.tsx`
- Modify: `frontend-customer/messages/en/pwa.json`, `frontend-customer/messages/tr/pwa.json`

**Interfaces:**
- Consumes: Task 1's `ToolbarIcon`, `MenuSheet`, `ConfirmDialog`, `InstalledCheck`; `detectPlatform()` (`@/lib/usage`), `isStandalone()` (`@/lib/push`); `useTranslations("pwa")`.
- Produces: `<InstallGuide />` and the `/install` route.

- [ ] **Step 1: Export `detectPlatform`**

In `frontend-customer/src/lib/usage.ts`, change the helper declaration from:

```ts
function detectPlatform(): "ios" | "android" | "desktop" | "other" {
```
to:
```ts
export function detectPlatform(): "ios" | "android" | "desktop" | "other" {
```
(Leave the rest of the file unchanged — `reportUsageOncePerSession` still calls it.)

- [ ] **Step 2: Add the i18n keys**

In `frontend-customer/messages/en/pwa.json`, add this `guide` key inside the top-level object (alongside the existing keys):

```json
  "guide": {
    "title": "Install the app",
    "subtitle": "Add this app to your home screen for the fastest access — it opens full-screen, like a native app.",
    "installNow": "Install app",
    "orManual": "Or follow the steps below.",
    "tabIos": "iPhone",
    "tabAndroid": "Android",
    "iosStep1": "Tap the Share button in the toolbar.",
    "iosStep2": "Scroll down and tap “Add to Home Screen”.",
    "iosStep3": "Tap “Add” — the app appears on your home screen.",
    "iosAddLabel": "Add to Home Screen",
    "iosAddButton": "Add",
    "iosNote": "Open this page in Safari — other iPhone browsers can’t add to the home screen.",
    "androidStep1": "Tap the ⋮ menu in the top-right.",
    "androidStep2": "Tap “Install app” (or “Add to Home screen”).",
    "androidStep3": "Tap “Install” to confirm.",
    "androidInstallLabel": "Install app",
    "androidInstallButton": "Install",
    "desktopNote": "On a computer, click the install icon in your browser’s address bar.",
    "installedTitle": "You’re all set!",
    "installedBody": "The app is installed on your device."
  }
```

In `frontend-customer/messages/tr/pwa.json`, add the Turkish equivalent:

```json
  "guide": {
    "title": "Uygulamayı yükleyin",
    "subtitle": "En hızlı erişim için uygulamayı ana ekranınıza ekleyin — tam ekran açılır, yerel uygulama gibi.",
    "installNow": "Uygulamayı yükle",
    "orManual": "Veya aşağıdaki adımları izleyin.",
    "tabIos": "iPhone",
    "tabAndroid": "Android",
    "iosStep1": "Araç çubuğundaki Paylaş düğmesine dokunun.",
    "iosStep2": "Aşağı kaydırın ve “Ana Ekrana Ekle”’ye dokunun.",
    "iosStep3": "“Ekle”’ye dokunun — uygulama ana ekranınızda belirir.",
    "iosAddLabel": "Ana Ekrana Ekle",
    "iosAddButton": "Ekle",
    "iosNote": "Bu sayfayı Safari’de açın — diğer iPhone tarayıcıları ana ekrana ekleyemez.",
    "androidStep1": "Sağ üstteki ⋮ menüsüne dokunun.",
    "androidStep2": "“Uygulamayı yükle” (veya “Ana ekrana ekle”)’ye dokunun.",
    "androidStep3": "Onaylamak için “Yükle”’ye dokunun.",
    "androidInstallLabel": "Uygulamayı yükle",
    "androidInstallButton": "Yükle",
    "desktopNote": "Bilgisayarda, tarayıcınızın adres çubuğundaki yükle simgesine tıklayın.",
    "installedTitle": "Her şey hazır!",
    "installedBody": "Uygulama cihazınıza yüklendi."
  }
```

(Add a comma after the previous last key — `"pushFailed": "..."` — in each file so the JSON stays valid.)

- [ ] **Step 3: Create the InstallGuide component**

Create `frontend-customer/src/components/install/install-guide.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { detectPlatform } from "@/lib/usage";
import { isStandalone } from "@/lib/push";
import {
  ConfirmDialog,
  InstalledCheck,
  MenuSheet,
  ToolbarIcon,
} from "@/components/install/install-illustrations";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Tab = "ios" | "android";

export function InstallGuide() {
  const t = useTranslations("pwa");
  const [tab, setTab] = useState<Tab>("ios");
  const [installed, setInstalled] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    setTab(detectPlatform() === "android" ? "android" : "ios");
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  if (installed) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <InstalledCheck className="mx-auto h-20 w-20" />
        <h1 className="mt-4 text-xl font-semibold">{t("guide.installedTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("guide.installedBody")}</p>
      </div>
    );
  }

  const steps =
    tab === "ios"
      ? [
          { art: <ToolbarIcon variant="share" className="h-28 w-auto" />, text: t("guide.iosStep1") },
          { art: <MenuSheet side="bottom" label={t("guide.iosAddLabel")} className="h-28 w-auto" />, text: t("guide.iosStep2") },
          { art: <ConfirmDialog label={t("guide.iosAddButton")} className="h-28 w-auto" />, text: t("guide.iosStep3") },
        ]
      : [
          { art: <ToolbarIcon variant="menu" className="h-28 w-auto" />, text: t("guide.androidStep1") },
          { art: <MenuSheet side="top" label={t("guide.androidInstallLabel")} className="h-28 w-auto" />, text: t("guide.androidStep2") },
          { art: <ConfirmDialog label={t("guide.androidInstallButton")} className="h-28 w-auto" />, text: t("guide.androidStep3") },
        ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">{t("guide.title")}</h1>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t("guide.subtitle")}</p>
      </div>

      {deferred && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-center">
          <button
            onClick={install}
            className="rounded-lg bg-primary px-6 py-2.5 font-medium text-primary-foreground"
          >
            {t("guide.installNow")}
          </button>
          <p className="mt-2 text-xs text-muted-foreground">{t("guide.orManual")}</p>
        </div>
      )}

      <div className="flex justify-center gap-2">
        <button
          onClick={() => setTab("ios")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${tab === "ios" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
        >
          {t("guide.tabIos")}
        </button>
        <button
          onClick={() => setTab("android")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${tab === "android" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
        >
          {t("guide.tabAndroid")}
        </button>
      </div>

      <ol className="space-y-4">
        {steps.map((step, i) => (
          <li key={i} className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {i + 1}
            </span>
            <p className="flex-1 text-sm">{step.text}</p>
            <span className="shrink-0">{step.art}</span>
          </li>
        ))}
      </ol>

      {tab === "ios" && (
        <p className="rounded-lg bg-muted/50 p-3 text-center text-xs text-muted-foreground">
          {t("guide.iosNote")}
        </p>
      )}

      <p className="text-center text-xs text-muted-foreground">{t("guide.desktopNote")}</p>
    </div>
  );
}
```

- [ ] **Step 4: Create the route**

Create `frontend-customer/src/app/(public)/install/page.tsx`:

```tsx
import type { Metadata } from "next";

import { InstallGuide } from "@/components/install/install-guide";

export const metadata: Metadata = {
  title: "Install the app",
  description: "Step-by-step guide to install this app on your phone.",
};

export default function InstallPage() {
  return <InstallGuide />;
}
```

(The `(public)` layout already wraps children in the `PublicHeader` + a centered `<main>`.)

- [ ] **Step 5: Verify the build**

Run: `cd frontend-customer && npm run build`
Expected: build succeeds; `/install` appears in the route list. If lint/format fails, run `npx prettier --write` on the three created/modified `.tsx`/`.json` files and rebuild.
Behavior: visiting `/install` shows the title, the iPhone/Android tabs (auto-selected by device), three numbered illustrated steps, the Safari note on the iPhone tab, and the desktop one-liner; in standalone mode it shows the "You're all set!" check.

- [ ] **Step 6: Commit**

```bash
git add frontend-customer/src/lib/usage.ts frontend-customer/src/components/install/install-guide.tsx "frontend-customer/src/app/(public)/install/page.tsx" frontend-customer/messages/en/pwa.json frontend-customer/messages/tr/pwa.json
git commit -m "feat(install): /install guide page (auto-detect, one-tap install, illustrated steps)"
```

---

### Task 3: Entry points

**Files:**
- Modify: `frontend-customer/src/components/shared/install-prompt.tsx` (banner "How to install" link)
- Modify: `frontend-customer/src/components/shared/public-header.tsx` ("Install app" link)
- Modify: `frontend-customer/src/components/admin/publish-card.tsx` ("Share install guide" copy)
- Modify: `frontend-customer/messages/en/pwa.json`, `frontend-customer/messages/tr/pwa.json` (banner link label)

**Interfaces:**
- Consumes: the `/install` route (Task 2).

- [ ] **Step 1: Add the banner link label to i18n**

In `frontend-customer/messages/en/pwa.json`, add `"howToInstall": "How to install"` to the top-level object. In `messages/tr/pwa.json`, add `"howToInstall": "Nasıl yüklenir"`.

- [ ] **Step 2: Banner link**

In `frontend-customer/src/components/shared/install-prompt.tsx`, add `import Link from "next/link";` at the top. Then, inside the returned banner `<div>`, replace the message span:

```tsx
      <span className="flex-1">{deferred ? t("installPrompt") : t("iosHint")}</span>
```
with the message span followed by a guide link:
```tsx
      <span className="flex-1">
        {deferred ? t("installPrompt") : t("iosHint")}{" "}
        <Link href="/install" className="font-medium text-primary underline underline-offset-2">
          {t("howToInstall")}
        </Link>
      </span>
```

- [ ] **Step 3: Student header link**

In `frontend-customer/src/components/shared/public-header.tsx`, add an "Install app" link. In the **desktop nav** (inside `<nav className="hidden items-center gap-6 md:flex">`), right after the `{navLinks.map(...)}` block (before `{allowDarkMode && <ThemeToggle ... />}`), add:

```tsx
          <Link
            href="/install"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Install app
          </Link>
```

In the **mobile menu** (inside `<nav className="flex flex-col gap-3">`), right after the `{navLinks.map(...)}` block there, add:

```tsx
            <Link
              href="/install"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setMobileOpen(false)}
            >
              Install app
            </Link>
```

(`Link` is already imported in this file. Hardcoded English matches the file's other labels.)

- [ ] **Step 4: Coach "Share install guide"**

In `frontend-customer/src/components/admin/publish-card.tsx`, add a share affordance in the **published** branch. Add a handler next to the existing `copyLink`:

```tsx
  function copyInstallGuide() {
    if (!tenant) return
    void navigator.clipboard?.writeText(`${tenant.studio_url}/install`)
    toast.success("Install-guide link copied")
  }
```

Then in the published-state button row (the one containing **View site** / **Copy link** / **Unpublish**), add a button before **Unpublish**:

```tsx
              <Button variant="ghost" size="sm" className="gap-1" onClick={copyInstallGuide}>
                <Copy className="h-3.5 w-3.5" /> Share install guide
              </Button>
```

(`Copy`, `Button`, `toast`, `tenant` are already in scope in this file.)

- [ ] **Step 5: Verify the build**

Run: `cd frontend-customer && npm run build`
Expected: build succeeds. If lint/format fails, run `npx prettier --write` on the modified files and rebuild.
Behavior: the install banner now shows a "How to install" link → `/install`; the student header shows an "Install app" link (desktop + mobile); the coach PublishCard (published) shows "Share install guide" which copies `<studio_url>/install`.

- [ ] **Step 6: Commit**

```bash
git add frontend-customer/src/components/shared/install-prompt.tsx frontend-customer/src/components/shared/public-header.tsx frontend-customer/src/components/admin/publish-card.tsx frontend-customer/messages/en/pwa.json frontend-customer/messages/tr/pwa.json
git commit -m "feat(install): entry points to the install guide (banner, header, coach share)"
```

---

## Self-Review

**Spec coverage:**
- `/install` public page under `(public)` → Task 2 Step 4.
- Auto-detect iPhone/Android, tab switcher, desktop one-liner → Task 2 Step 3 (`detectPlatform`, tabs, `desktopNote`).
- Illustrated theme-aware SVG step mockups → Task 1 + consumed in Task 2.
- One-tap Install button (button-first) where supported; iOS manual-only; always-present steps → Task 2 Step 3 (`deferred` button + steps always rendered).
- "Already installed" state → Task 2 Step 3 (`isStandalone` → `InstalledCheck`).
- Entry points (banner, header, coach share) → Task 3.
- `pwa` i18n en+tr → Task 2 Step 2 + Task 3 Step 1.
- No backend change, no new dep, build-only verification → Global Constraints; only `frontend-customer` files touched.

**Placeholder scan:** none — all SVG, component, route, and JSON code is complete; insertion points name exact anchors.

**Type consistency:** illustration prop names (`variant`/`side`/`label`/`className`) match between Task 1's definitions and Task 2's usage; the `pwa.guide.*` keys used in `InstallGuide` exactly match the keys added in Task 2 Step 2 (`tabIos`/`tabAndroid`, `iosStep1..3`, `iosAddLabel`, `iosAddButton`, `iosNote`, `androidStep1..3`, `androidInstallLabel`, `androidInstallButton`, `desktopNote`, `installedTitle`, `installedBody`, `installNow`, `orManual`, `title`, `subtitle`); the banner uses `howToInstall` added in Task 3 Step 1.

**Note for review:** the SVG mockups are schematic (not pixel-perfect OS replicas); visual polish is expected to iterate when the page is viewed live — flag visual issues at the manual-verify step, not as spec gaps.
