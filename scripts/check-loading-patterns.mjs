// scripts/check-loading-patterns.mjs
// Guardrail for the loading-state system (see
// docs/superpowers/specs/2026-07-23-loading-states-design.md): app code must
// use Spinner/Skeleton primitives, not raw animate-spin / animate-pulse.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = [
  "frontend-main/src",
  "frontend-customer/src",
  "packages/shared/src",
];
// The primitives themselves, plus justified decorative exceptions
// (add a path here ONLY with a trailing comment saying why).
const ALLOW = new Set([
  "packages/shared/src/ui/button.tsx",
  "packages/shared/src/ui/spinner.tsx",
  "packages/shared/src/ui/skeleton.tsx",

  // Decorative "live now" pulsing Radio-icon badges — not skeletons, not
  // async-action loading state. Noted in the Task 8/9 retrofit reports.
  "frontend-customer/src/app/(student)/live-classes/page.tsx",
  "frontend-customer/src/components/public/calendar/event-card.tsx",
  "frontend-customer/src/components/public/calendar/event-detail-client.tsx",
  "frontend-customer/src/app/admin/live-streams/page.tsx",
  "frontend-customer/src/components/admin/live/shared.tsx",

  // Decorative "AI is generating / thinking" Sparkles pulse — an ambient
  // busy indicator, not a Spinner/Skeleton replacement. Task 9 keep-list.
  "frontend-customer/src/components/admin/blog/generate-dialog.tsx",
  "frontend-customer/src/components/logo/studio-chat.tsx",

  // KitSkeletonRows: admin-kit's own skeleton primitive. admin-kit is a
  // deliberately self-contained module (imports no per-app UI), so it
  // mirrors Skeleton/SkeletonList's shape with its own animate-pulse bars
  // instead of importing the shared primitive. Task 10 keep-list.
  "packages/shared/src/admin-kit/primitives.tsx",

  // Decorative "LIVE"/"REC" pulsing-dot badges over Stream.io video chrome —
  // same ambient-status-indicator category as the Radio-icon badges above.
  "frontend-customer/src/components/live/control-bar.tsx",
  "frontend-customer/src/components/live-stream/stream-host-view.tsx",
  "frontend-customer/src/components/live-stream/stream-viewer-view.tsx",

  // Hand-rolled ring spinners (border-4 border-t-transparent) for Stream.io
  // connect/join states. Task 10 reviewed and deliberately left these as
  // "bespoke full-bleed dark video-room chrome": Spinner hardcodes
  // text-muted-foreground with no per-instance color override, which would
  // be invisible against these dark full-bleed video-room backgrounds, and
  // each file already has real, distinguishing error states with retry.
  "frontend-customer/src/app/live/[id]/live-room-client.tsx",
  "frontend-customer/src/app/live-stream/[id]/live-stream-client.tsx",
  "frontend-customer/src/components/live/live-class-room.tsx",
  "frontend-customer/src/components/live-stream/live-stream-room.tsx",

  // Decorative indeterminate progress-bar flourish under the already-present
  // <Spinner/> on the magic-link "verifying" state — not itself a spinner or
  // skeleton, just an ambient gradient animation alongside the real one.
  "frontend-main/src/app/signup/verify/page.tsx",

  // Decorative "LIVE" dot inside a static marketing-page illustration
  // mockup (not a real loading state) — same category as the live-class
  // Radio-icon badges above.
  "frontend-main/src/components/landing/features-section.tsx",
]);
// Excludes the `-soft` suffix so the custom `animate-pulse-soft` utility
// (frontend-main/src/styles/globals.css, its own @keyframes, a purely
// decorative marketing-hero flourish unrelated to loading state) isn't
// flagged as a false positive of Tailwind's built-in `animate-pulse`.
const PATTERN = /animate-(?:spin|pulse)(?!-)/;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(tsx|ts|jsx|js)$/.test(name)) yield p;
  }
}

const violations = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const rel = relative(".", file).replaceAll("\\", "/");
    if (ALLOW.has(rel)) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (PATTERN.test(line))
        violations.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
  }
}

if (violations.length) {
  console.error(
    "Raw loading-animation classes found (use Spinner / Skeleton / Button loading):",
  );
  for (const v of violations) console.error("  " + v);
  process.exit(1);
}
console.log(`check-loading-patterns: OK (${ROOTS.join(", ")})`);
