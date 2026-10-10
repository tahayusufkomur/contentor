"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { styleRecipe, type FamilyId } from "@shared/sections/types";
import { fixtureBlock, fixtureData } from "@/components/sections/fixtures";
import { STYLE_SECTIONS } from "@/components/sections/registry";
import type { LookCopy } from "@/lib/setup-flow";
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

const nonEmpty = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== ""));

/** A section's sample block with the coach's words in place of the sample's:
 * each text field the copy has, and each list item's title and text by
 * position (the item keeps its photo). Empty copy leaves the sample alone. */
function withCopy<T extends object>(
  block: T,
  copy?: Record<string, unknown>,
): T {
  if (!copy) return block;
  const out: Record<string, unknown> = {
    ...(block as Record<string, unknown>),
  };
  for (const [key, value] of Object.entries(copy)) {
    if (typeof value === "string" && value) out[key] = value;
    else if (Array.isArray(value) && Array.isArray(out[key]))
      out[key] = (out[key] as Record<string, unknown>[])
        .slice(0, value.length)
        .map((item, i) => ({
          ...item,
          ...nonEmpty(value[i] as Record<string, unknown>),
        }));
  }
  return out as T;
}

/** The sample courses, retitled in the coach's words by position. */
function withCourses<T>(data: T, courses?: LookCopy["courses"]): T {
  if (!Array.isArray(data) || !courses?.length) return data;
  return data.slice(0, courses.length).map((course, i) => ({
    ...course,
    ...nonEmpty(courses[i] ?? {}),
  })) as T;
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
  copy,
  page = false,
}: {
  styleId: string;
  paletteId?: string;
  brandName: string;
  headline?: string;
  photos?: string[];
  /** The hero's line under the headline, in the coach's words. */
  body?: string;
  /** The sample words written for this coach, in place of the sample copy. */
  copy?: LookCopy | null;
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
              withCopy(
                fixtureBlock(family, `${styleId}.${variant}`, size),
                copy?.[family],
              ),
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
                data={fill(
                  withCourses(fixtureData(family, size), copy?.courses),
                  photos,
                  words,
                  from,
                )}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
