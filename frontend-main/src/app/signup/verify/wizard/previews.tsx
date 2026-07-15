"use client";

import { useEffect, useState } from "react";

import { FONT_STACKS, THEME_SWATCHES } from "@/lib/wizard/wizard-themes";

const FALLBACK = THEME_SWATCHES.ocean;

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

function swatch(theme?: string) {
  return THEME_SWATCHES[theme ?? ""] ?? FALLBACK;
}

function fontStack(font?: string) {
  return FONT_STACKS[font ?? "Inter"] ?? FONT_STACKS.Inter;
}

export function MiniNavbar({ layout, theme, font, brand }: { layout: string; theme?: string; font?: string; brand: string }) {
  const s = swatch(theme);
  const links = (
    <span className="flex gap-1.5" aria-hidden>
      {[10, 8, 9].map((w, i) => (
        <span key={i} className="h-1 rounded-full bg-current opacity-40" style={{ width: w * 2 }} />
      ))}
    </span>
  );
  const brandEl = (
    <span className="font-semibold" style={{ fontFamily: fontStack(font) }}>
      {brand}
    </span>
  );
  if (layout === "pill") {
    return (
      <div className="flex h-10 w-full items-center justify-center text-[10px]" style={{ color: s.ink }}>
        <div
          className="flex w-[94%] items-center justify-between rounded-full border bg-white px-3 py-1.5 shadow-sm"
          style={{ borderColor: `${s.primary}33` }}
        >
          {brandEl}
          {links}
          <span className="rounded-full px-2 py-0.5 text-[8px] font-semibold text-white" style={{ background: s.primary }}>
            CTA
          </span>
        </div>
      </div>
    );
  }
  return (
    <div
      className="flex h-10 w-full items-center rounded-lg border px-3 text-[10px]"
      style={{ borderColor: `${s.primary}33`, color: s.ink, background: "white" }}
    >
      {layout === "centered" ? (
        <div className="flex w-full flex-col items-center gap-1 py-1">
          <span className="font-semibold leading-none" style={{ fontFamily: fontStack(font) }}>{brand}</span>
          {links}
        </div>
      ) : layout === "minimal" ? (
        <div className="flex w-full items-center justify-between">
          {brandEl}
          <span className="h-2.5 w-4 rounded-sm" style={{ background: `${s.ink}22` }} />
        </div>
      ) : layout === "split" ? (
        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center">
          <span className="justify-self-start">{links}</span>
          {brandEl}
          <span className="justify-self-end">{links}</span>
        </div>
      ) : (
        <div className="flex w-full items-center justify-between">
          {brandEl}
          {links}
          <span className="rounded-full px-2 py-0.5 text-[8px] font-semibold text-white" style={{ background: s.primary }}>
            CTA
          </span>
        </div>
      )}
    </div>
  );
}

export function MiniHero({ style, theme, font, brand, headline }: { style: string; theme?: string; font?: string; brand: string; headline?: string }) {
  const s = swatch(theme);
  const title = headline || brand;
  if (style === "split") {
    return (
      <div className="flex h-28 w-full gap-2 rounded-lg border p-2" style={{ borderColor: `${s.primary}33`, background: "white" }}>
        <div className="flex flex-1 flex-col justify-center gap-1.5">
          <span className="line-clamp-2 text-[10px] font-bold leading-tight" style={{ color: s.ink, fontFamily: fontStack(font) }}>{title}</span>
          <span className="h-3 w-12 rounded-full text-center text-[7px] font-semibold leading-3 text-white" style={{ background: s.primary }}>CTA</span>
        </div>
        <div className="w-2/5 rounded-md" style={{ background: `linear-gradient(135deg, ${s.soft}, ${s.primary}66)` }} />
      </div>
    );
  }
  if (style === "minimal") {
    return (
      <div className="flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-lg border" style={{ borderColor: `${s.primary}33`, background: "white" }}>
        <span className="px-3 text-center text-[10px] font-bold leading-tight" style={{ color: s.ink, fontFamily: fontStack(font) }}>{title}</span>
        <span className="h-3 w-12 rounded-full text-center text-[7px] font-semibold leading-3 text-white" style={{ background: s.primary }}>CTA</span>
      </div>
    );
  }
  return (
    <div
      className="flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-lg"
      style={{ background: `linear-gradient(160deg, ${s.ink}dd, ${s.primary}bb), linear-gradient(0deg, ${s.soft}, ${s.soft})` }}
    >
      <span className="px-3 text-center text-[10px] font-bold leading-tight text-white" style={{ fontFamily: fontStack(font) }}>{title}</span>
      <span className="h-3 w-12 rounded-full bg-white/90 text-center text-[7px] font-semibold leading-3" style={{ color: s.ink }}>CTA</span>
    </div>
  );
}

/** Abstract block-type sketch rows used by layout thumbnails. */
export function MiniPageSketch({ blocks, theme }: { blocks: string[]; theme?: string }) {
  const s = swatch(theme);
  return (
    <div className="flex w-full flex-col gap-1">
      {blocks.map((type, i) => {
        const h = type === "hero" ? 24 : type === "courseGrid" || type === "storeProducts" ? 16 : 10;
        const bg =
          type === "hero"
            ? `linear-gradient(135deg, ${s.primary}aa, ${s.ink}aa)`
            : type === "cta"
              ? `${s.primary}44`
              : type === "courseGrid" || type === "pricingPlans" || type === "upcomingEvents" || type === "storeProducts"
                ? `${s.soft}`
                : `${s.ink}11`;
        return (
          <div key={`${type}-${i}`} className="w-full rounded" style={{ height: h, background: bg }}>
            {(type === "courseGrid" || type === "pricingPlans" || type === "storeProducts") && (
              <div className="flex h-full items-center justify-center gap-1 px-2">
                {[0, 1, 2].map((k) => (
                  <span key={k} className="h-3/5 flex-1 rounded-sm bg-white/80" />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Browser-window chrome around a page rendering, so a layout screenshot
 * reads as "this is your website" rather than a loose image. */
export function BrowserFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-foreground/10 bg-white">
      <div className="flex items-center gap-1 border-b border-foreground/10 bg-foreground/[0.03] px-2.5 py-1.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 rounded-full bg-foreground/20" />
        ))}
      </div>
      {children}
    </div>
  );
}

/** Real screenshot inside browser chrome, swapping to `fallback` when the
 * PNG hasn't been captured yet (tools/wizard-mockups/) — a catalog option
 * must never show a broken image. */
export function ScreenshotThumbnail({ src, fallback }: { src: string; fallback: React.ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    <BrowserFrame>
      {/* eslint-disable-next-line @next/next/no-img-element -- static asset, no next/image loader needed */}
      <img src={src} alt="" className="block w-full" onError={() => setFailed(true)} />
    </BrowserFrame>
  );
}
