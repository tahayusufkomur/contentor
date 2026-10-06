"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { FamilyId } from "@shared/sections/types";
import { fixtureBlock, fixtureData } from "@/components/sections/fixtures";
import { STYLE_SECTIONS } from "@/components/sections/registry";
import { getSiteStyle, styleScope } from "@/lib/site-styles";

// The site's desktop layout width; the tile scales it down, the same way the
// preview frame scales the live page.
const PAGE_W = 1180;
const FAMILIES: FamilyId[] = ["hero", "benefits", "courseShowcase"];
const SAMPLE_PHOTO = /^https:\/\/pix4less\.com\/media\/previews\//;

/** ``value`` with every sample photo swapped for the coach's own photos, in
 * turn — so a boxing coach previews boxing, not the yoga samples. */
function withPhotos<T>(value: T, photos: string[], next = { i: 0 }): T {
  if (!photos.length) return value;
  if (typeof value === "string")
    return (
      SAMPLE_PHOTO.test(value) ? photos[next.i++ % photos.length] : value
    ) as T;
  if (Array.isArray(value))
    return value.map((v) => withPhotos(v, photos, next)) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, withPhotos(v, photos, next)]),
    ) as T;
  return value;
}

/** One look as the top of a real home page in that style and colourway: the
 * style's own section layouts with sample content, the coach's brand as the
 * kicker, their pitch as the headline and photos of what they teach, scaled
 * into the tile. A picture, not a page: inert. */
export function LookTile({
  styleId,
  paletteId,
  brandName,
  headline,
  photos = [],
}: {
  styleId: string;
  paletteId?: string;
  brandName: string;
  headline?: string;
  photos?: string[];
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
  const page: CSSProperties = {
    ...(styleScope(style, paletteId) as CSSProperties),
    width: PAGE_W,
    transform: `scale(${w / PAGE_W})`,
    transformOrigin: "top left",
  };
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none aspect-[4/3] w-full select-none overflow-hidden"
    >
      {w > 0 && (
        <div style={page}>
          {FAMILIES.map((family, n) => {
            const variant = style.variants[family]?.[0];
            const Comp = variant ? layouts[family]?.[variant] : undefined;
            if (!Comp || !variant) return null;
            // Each section starts at a different photo, so they don't repeat.
            const from = { i: n * 2 };
            const block = withPhotos(
              fixtureBlock(family, `${styleId}.${variant}`, "short"),
              photos,
              from,
            );
            if (family === "hero") {
              if (brandName) block.kicker = brandName;
              if (headline) block.headline = headline;
              block.ctaHref = "";
              block.secondaryHref = "";
            }
            return (
              <Comp
                key={family}
                block={block}
                data={withPhotos(fixtureData(family, "short"), photos, from)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
