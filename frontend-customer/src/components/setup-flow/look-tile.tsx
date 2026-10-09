"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { styleRecipe, type FamilyId } from "@shared/sections/types";
import { fixtureBlock, fixtureData } from "@/components/sections/fixtures";
import { STYLE_SECTIONS } from "@/components/sections/registry";
import { getSiteStyle, styleScope } from "@/lib/site-styles";

// The site's desktop layout width; the tile scales it down, the same way the
// preview frame scales the live page.
const PAGE_W = 1180;
const FAMILIES: FamilyId[] = ["hero", "benefits", "courseShowcase"];
const SAMPLE_PHOTO = /^https:\/\/pix4less\.com\/media\/previews\//;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** ``text`` with each of ``words`` swapped as a whole word, keeping a
 * capital where the sample had one. */
function swap(text: string, words: Record<string, string>): string {
  let out = text;
  for (const [from, to] of Object.entries(words))
    out = out.replace(new RegExp(`\\b${escape(from)}\\b`, "gi"), (m) =>
      m[0] === m[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to,
    );
  return out;
}

/** ``value`` with every sample photo swapped for the coach's own photos, in
 * turn, and the sample copy's words swapped per ``words`` — so a boxing
 * coach previews boxing, not the yoga samples. */
function fill<T>(
  value: T,
  photos: string[],
  words: Record<string, string>,
  next = { i: 0 },
): T {
  if (typeof value === "string")
    return (
      SAMPLE_PHOTO.test(value)
        ? photos.length
          ? photos[next.i++ % photos.length]
          : value
        : swap(value, words)
    ) as T;
  if (Array.isArray(value))
    return value.map((v) => fill(v, photos, words, next)) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, fill(v, photos, words, next)]),
    ) as T;
  return value;
}

/** One look as the top of a real home page in that style and colourway: the
 * style's own section layouts with sample content, the coach's brand as the
 * kicker, their pitch as the headline and photos of what they teach, scaled
 * into the tile. A picture, not a page: inert. With ``page`` it is the whole
 * home page instead, at full length, for scrolling through. */
export function LookTile({
  styleId,
  paletteId,
  brandName,
  headline,
  photos = [],
  words = {},
  body,
  page = false,
}: {
  styleId: string;
  paletteId?: string;
  brandName: string;
  headline?: string;
  photos?: string[];
  /** The hero's line under the headline, in the coach's words. */
  body?: string;
  /** Sample words to swap in the copy ({ yoga: "boxing" }). */
  words?: Record<string, string>;
  page?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Truly inert: no focus, no activation of any link inside the picture.
    el.setAttribute("inert", "");
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const style = getSiteStyle(styleId);
  if (!style) return null;
  const layouts = STYLE_SECTIONS[styleId] ?? {};
  const items = page
    ? styleRecipe(style, "home").map((entry) => {
        const [family, name] = entry.split(":") as [FamilyId, string?];
        return { family, variant: name ?? style.variants[family]?.[0] };
      })
    : FAMILIES.map((family) => ({
        family,
        variant: style.variants[family]?.[0],
      }));
  const size = page ? "long" : "short";
  const scope = styleScope(style, paletteId) as CSSProperties;
  // The page keeps its layout box (zoom), so the parent can scroll it; the
  // tile is a fixed picture (transform) inside its frame.
  const pageStyle: CSSProperties = page
    ? { ...scope, width: PAGE_W, zoom: w / PAGE_W }
    : {
        ...scope,
        width: PAGE_W,
        transform: `scale(${w / PAGE_W})`,
        transformOrigin: "top left",
      };
  return (
    <div
      ref={ref}
      aria-hidden
      className={
        page
          ? "pointer-events-none w-full select-none"
          : "pointer-events-none aspect-[4/3] w-full select-none overflow-hidden"
      }
    >
      {w > 0 && (
        <div style={pageStyle}>
          {items.map(({ family, variant }, n) => {
            const Comp = variant ? layouts[family]?.[variant] : undefined;
            if (!Comp || !variant) return null;
            // Each section starts at a different photo, so they don't repeat.
            const from = { i: n * 2 };
            const block = fill(
              fixtureBlock(family, `${styleId}.${variant}`, size),
              photos,
              words,
              from,
            );
            if (family === "hero") {
              if (brandName) block.kicker = brandName;
              if (headline) block.headline = headline;
              if (body) block.subhead = body;
              block.ctaHref = "";
              block.secondaryHref = "";
            }
            return (
              <Comp
                key={`${family}-${variant}-${n}`}
                block={block}
                data={fill(fixtureData(family, size), photos, words, from)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
