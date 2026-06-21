# Install Guide Page — Design Spec

**Date:** 2026-06-21
**Status:** Draft for review
**Builds on:** the Student PWA + the existing `InstallPrompt` banner (`frontend-customer/src/components/shared/install-prompt.tsx`) and the publish-app control.

## Goal

Installing the PWA isn't obvious — especially on iOS, where it requires Safari's Share → "Add to Home Screen". Give students a dedicated, illustrated, step-by-step guide page they can reach easily, so more of them install the app.

## Scope

**In scope**
- A public page at `/install` (`frontend-customer`, the student app) that auto-detects the visitor's platform and shows illustrated install steps for **iPhone (Safari)** and **Android (Chrome)**, with a tab to switch, plus a one-line desktop note.
- Theme-aware **SVG illustration** mockups (one per step), generated in-repo (no image files).
- A primary one-tap **Install** button wherever the browser supports it (Android + Chromium desktop, via `beforeinstallprompt`); the illustrated manual steps are the fallback and the **only** path on iOS (Apple exposes no programmatic install API).
- "Already installed" short-circuit via `isStandalone()`.
- Entry points: a "How to install" link on the existing `InstallPrompt` banner; an "Install app" item in the student user menu; a "Share install guide" copy affordance on the coach `PublishCard`.
- All copy in the existing `pwa` i18n namespace (**en + tr**).

**Out of scope**
- Real photographic screenshots (illustrated SVG mockups instead — they don't go stale per OS version).
- Desktop step-by-step (a one-liner only; desktop students are rare).
- Other browsers' edge cases (Firefox/Samsung Internet) — the guide names Safari/Chrome; the steps are close enough, and Android's `beforeinstallprompt` covers Chromium browsers.
- Any backend change.

## Architecture & components

**Route:** `frontend-customer/src/app/(public)/install/page.tsx` — a thin server component (sets `generateMetadata` title/description) that renders the `<InstallGuide />` client component inside the existing public shell. Living under `(public)` means it inherits the publish/preview gate (fine — students install the app once it's published; the owner can preview it anytime).

**`InstallGuide`** (`frontend-customer/src/components/install/install-guide.tsx`, client):
- On mount, computes `platform = detectPlatform()` — currently a **local** (non-exported) helper in `@/lib/usage`, so the implementation adds `export` to it and reuses it here (DRY, one detection source). Selects the default tab: `ios` → iPhone, `android` → Android, anything else → iPhone (with both tabs always switchable).
- If `isStandalone()` (`@/lib/push`) → render the "already installed" state (success message, no steps).
- **Direct install (when supported):** captures `beforeinstallprompt` (same pattern as `InstallPrompt`); while a deferred event exists (Android / Chromium desktop), it shows a **primary "Install app" button at the top** that calls `prompt()` for a one-tap native install. This is the lead CTA; the manual steps move below under a muted "Prefer to do it manually?" heading. The event never fires on iOS and may not fire on Android (Chrome's installability criteria / already installed), so the manual steps are always rendered as the guaranteed path.
- Renders a two-tab switcher (iPhone / Android), the selected platform's ordered steps (each: number + localized text + the step's SVG mockup), and the desktop one-liner below.
- Pure presentational logic otherwise; no data fetching, no backend calls.

**`install-illustrations.tsx`** (`frontend-customer/src/components/install/`): small, focused SVG components — `IosShareStep`, `IosAddToHomeStep`, `IosConfirmStep`, `AndroidMenuStep`, `AndroidInstallStep`, `AndroidConfirmStep`. Each draws a stylized phone frame (neutral theme tokens) with the relevant UI affordance highlighted in the coach's **primary color** (`text-primary`/`fill-[hsl(var(--primary))]` per the theme tokens). Text-free or minimal-label so they need little/no translation. Reused by `InstallGuide`.

## Step content (localized, `pwa` namespace)

- **iPhone (Safari)** — ① Tap the **Share** button (the ⬆️ icon in the toolbar). ② Scroll and tap **Add to Home Screen**. ③ Tap **Add** — the app appears on your home screen. Note: "Open this page in **Safari** — other browsers can't add to the home screen on iPhone."
- **Android (Chrome)** — when the **Install app** button is offered, that's one tap and done. Otherwise: ① Tap the **⋮** menu (top-right). ② Tap **Install app** (or **Add to Home screen**). ③ Tap **Install**.
- **Desktop** — one line: "On a computer, click the **install** icon in your browser's address bar."

## Entry points

1. **`InstallPrompt` banner** (`install-prompt.tsx`): add a localized "How to install" link to `/install` next to the existing message. Highest value on iOS, where the banner is only a text hint today. (The banner still hides in standalone / after dismissal / in `/admin`.)
2. **Student user menu** (`frontend-customer/src/components/shared/user-menu.tsx`): an "Install app" link to `/install`, for persistent access. (Hidden when `isStandalone()`.)
3. **Coach `PublishCard`** (`publish-card.tsx`, published state): a "Share install guide" button that copies `<studio_url>/install` to the clipboard, so coaches can send the guide to students. *(Flagged for review — the only piece that re-touches the just-merged PublishCard; drop it if undesired.)*

## Cross-cutting

- **i18n:** all new strings live in `messages/{en,tr}/pwa.json` (the namespace `InstallPrompt` already uses). Tab labels, step text, headings, the "already installed" copy, and the entry-point link labels are translated. SVG mockups avoid baked-in text where possible.
- **Theming:** mockups use the active theme's primary color so the guide feels branded per tenant.
- **Accessibility:** steps are an ordered list; SVGs are decorative (`aria-hidden`) with the textual step carrying the meaning; the "Install now"/links are real buttons/anchors.
- **No new dependency.** Reuse existing `@/components/ui` primitives, `lucide-react`, `next-intl`.

## Testing

- No backend change → no backend tests. Frontend has no test runner → verification is `cd frontend-customer && npm run build` + manual:
  - On **iPhone Safari**: `/install` opens on the iPhone tab with the 3 illustrated steps; the Safari note shows; no "Install now" button.
  - On **Android Chrome**: opens on the Android tab; if the browser fires `beforeinstallprompt`, the "Install now" button installs in one tap; manual steps also present.
  - **Desktop**: the one-liner shows; auto-tab falls back to iPhone.
  - **Already installed** (open from the home-screen app): the success state shows instead of steps.
  - Entry points: the banner link, the user-menu item, and the PublishCard "Share install guide" copy all reach/produce `…/install`.

## Risks / open questions

- **`beforeinstallprompt` is best-effort:** it can fire before `InstallGuide` mounts, and Chrome may not fire it at all (installability criteria, engagement heuristic, or already installed). The manual steps are always rendered, so they are the guaranteed path; the **Install app** button is a one-tap shortcut when the browser offers it. On iOS it never fires (no API), so iOS is steps-only by necessity.
- **In-app browsers** (Instagram/Facebook webviews) can't install. The Safari/Chrome notes steer users to the right browser; fully detecting webviews is out of scope.
- **Illustration fidelity:** SVG mockups approximate the real OS UI (they won't match every OS version pixel-for-pixel), which is the intended trade-off for maintainability and theming.
