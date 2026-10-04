"use client";

import { useEffect, useState } from "react";

import { FONT_STACKS } from "@/lib/wizard/wizard-themes";

const FONT_LOADER_ID = "wizard-font-preview-stylesheet";

/** Loads every wizard font catalog family as a real web font (Google Fonts
 * CSS2 API) so the "Pick your type" cards and live preview render the
 * actual typeface instead of silently falling back to the browser's
 * generic sans-serif/serif default (which made every sans option and every
 * serif option look identical). Mount once near the wizard root. */
export function FontPreviewLoader() {
  useEffect(() => {
    if (document.getElementById(FONT_LOADER_ID)) return;
    const families = Object.keys(FONT_STACKS)
      .map((f) => `family=${encodeURIComponent(f)}:wght@400;600;700`)
      .join("&");
    const link = document.createElement("link");
    link.id = FONT_LOADER_ID;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
    document.head.appendChild(link);
  }, []);
  return null;
}

/** Browser-window chrome around a page rendering, so a layout screenshot
 * reads as "this is your website" rather than a loose image. */
export function BrowserFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-foreground/10 bg-white">
      <div
        className="flex items-center gap-1 border-b border-foreground/10 bg-foreground/[0.03] px-2.5 py-1.5"
        aria-hidden
      >
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 rounded-full bg-foreground/20" />
        ))}
      </div>
      {children}
    </div>
  );
}

/** Real screenshot inside browser chrome. `srcs` is an ordered candidate
 * list (per-niche file, then the yoga fallback set — see
 * @shared/wizard/mockups); swaps to `fallback` when every candidate fails
 * to load — a catalog option must never show a broken image. Failures are
 * keyed by URL so switching niche mid-wizard retries the new niche's file. */
export function ScreenshotThumbnail({
  srcs,
  fallback,
}: {
  srcs: string[];
  fallback: React.ReactNode;
}) {
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const src = srcs.find((s) => !failed[s]);
  if (!src) return <>{fallback}</>;
  return (
    <BrowserFrame>
      {/* eslint-disable-next-line @next/next/no-img-element -- static asset, no next/image loader needed */}
      <img
        src={src}
        alt=""
        className="block w-full"
        onError={() => setFailed((f) => ({ ...f, [src]: true }))}
      />
    </BrowserFrame>
  );
}
