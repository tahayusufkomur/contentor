// Brand kit builder: turns the studio's live SVGs into a downloadable zip —
// transparent PNGs (light + dark variants, favicon sizes) and a true vector
// SVG with every <text> converted to paths, so the file renders identically
// in any tool without webfonts.
//
// TTFs come from fontsource's jsDelivr mirror, NOT fonts.googleapis.com:
// Google's css2 endpoint serves woff2 to browser user agents (fetch cannot
// spoof UA) and opentype.js cannot parse woff2. Fontsource publishes every
// family as static per-weight TTFs with permissive CORS. If a font fetch
// fails the kit degrades to PNGs-only (spec rule) — never a broken SVG.
import JSZip from "jszip";
import { parse as parseFont, type Font } from "opentype.js";
import { imageToDataUrl, svgToPngBlob, type FontSpec } from "@/lib/logo/export";
import type { Fill, LogoRecipe } from "@/types/logo";

/** WCAG-ish relative luminance of a #rrggbb hex, 0..1. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((n >> 16) & 0xff) +
    0.7152 * channel((n >> 8) & 0xff) +
    0.0722 * channel(n & 0xff)
  );
}

// 0.4: dark inks/grays lighten; genuinely bright hues (amber ~0.44,
// sky ~0.43) stay — they already read on dark backgrounds.
const lighten = (hex: string, fallback: string) =>
  luminance(hex) < 0.4 ? fallback : hex;

/** A recipe re-colored to stay readable on dark backgrounds. */
export function darkVariant(recipe: LogoRecipe): LogoRecipe {
  const { colors, badge } = recipe;
  // When the badge is none/outline-only, its (solid) fill is what paints the
  // mark itself — a dark fill would vanish on a dark background.
  const fillPaintsMark = badge.shape === "none" || badge.outline;
  const badgeFill: Fill =
    fillPaintsMark && colors.badge.type === "solid"
      ? { type: "solid", color: lighten(colors.badge.color, "#e5e7eb") }
      : colors.badge;
  return {
    ...recipe,
    colors: {
      ...colors,
      badge: badgeFill,
      text: lighten(colors.text, "#ffffff"),
      tagline: lighten(colors.tagline, "#cbd5e1"),
      // Secondary fill roles on "custom" (AI Brand Pack) marks — only
      // present when the mark uses them, so most recipes are unaffected.
      ...(colors.mark2 !== undefined && {
        mark2: lighten(colors.mark2, "#e5e7eb"),
      }),
      ...(colors.mark_accent !== undefined && {
        mark_accent: lighten(colors.mark_accent, "#e5e7eb"),
      }),
    },
  };
}

export function fontsourceUrl(family: string, weight: number): string {
  const slug = family.toLowerCase().replace(/\s+/g, "-");
  return `https://cdn.jsdelivr.net/fontsource/fonts/${slug}@latest/latin-${weight}-normal.ttf`;
}

const fontCache = new Map<string, Promise<Font>>();

function loadFont(family: string, weight: number): Promise<Font> {
  const key = `${family}:${weight}`;
  let cached = fontCache.get(key);
  if (!cached) {
    cached = fetch(fontsourceUrl(family, weight))
      .then((resp) => {
        if (!resp.ok) throw new Error(`Font fetch failed (${resp.status})`);
        return resp.arrayBuffer();
      })
      .then((buffer) => parseFont(buffer));
    cached.catch(() => fontCache.delete(key)); // don't cache failures
    fontCache.set(key, cached);
  }
  return cached;
}

/** Resolve an attribute on a text node, walking up ancestor <g>s — the
 * split/overlap initials marks set font/fill attributes on the group. */
function resolveAttr(el: Element, name: string): string | null {
  let node: Element | null = el;
  while (node && node.tagName.toLowerCase() !== "svg") {
    const value = node.getAttribute(name);
    if (value) return value;
    node = node.parentElement;
  }
  return null;
}

/** Clone the svg with every <text> replaced by real glyph paths and every
 * <image> inlined as a data URI. Throws if any needed font can't load. */
export async function svgWithTextPaths(svg: SVGSVGElement): Promise<string> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.removeAttribute("class");

  for (const img of Array.from(clone.querySelectorAll("image"))) {
    const href =
      img.getAttribute("href") || img.getAttribute("xlink:href") || "";
    if (href && !href.startsWith("data:")) {
      img.setAttribute("href", await imageToDataUrl(href));
    }
  }

  for (const textEl of Array.from(clone.querySelectorAll("text"))) {
    const familyAttr = resolveAttr(textEl, "font-family") || "Inter";
    const family =
      familyAttr.match(/'([^']+)'/)?.[1] ?? familyAttr.split(",")[0]!.trim();
    const weight = Number(resolveAttr(textEl, "font-weight") || 700);
    const fontSize = Number(textEl.getAttribute("font-size") || 16);
    const x = Number(textEl.getAttribute("x") || 0);
    const y = Number(textEl.getAttribute("y") || 0);
    const anchor = resolveAttr(textEl, "text-anchor") || "start";
    const spacingAttr = textEl.getAttribute("letter-spacing");
    const tracking =
      spacingAttr && spacingAttr.endsWith("em") ? parseFloat(spacingAttr) : 0;
    const fill = resolveAttr(textEl, "fill") || "#000000";
    const opacity = textEl.getAttribute("opacity");
    const content = textEl.textContent ?? "";

    const font = await loadFont(family, weight);
    const scale = fontSize / font.unitsPerEm;
    const trackingPx = tracking * fontSize;
    const chars = [...content];
    const advances = chars.map((ch) => font.getAdvanceWidth(ch, fontSize));
    const total =
      advances.reduce((a, b) => a + b, 0) +
      trackingPx * Math.max(0, chars.length - 1);
    let cursor = anchor === "middle" ? x - total / 2 : x;
    // dominant-baseline: central — center of the em box sits on `y`.
    const baseline = y + ((font.ascender + font.descender) / 2) * scale;
    let d = "";
    chars.forEach((ch, i) => {
      d += font.getPath(ch, cursor, baseline, fontSize).toPathData(2);
      cursor += advances[i]! + trackingPx;
    });

    const path = clone.ownerDocument.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    path.setAttribute("d", d);
    path.setAttribute("fill", fill);
    if (opacity) path.setAttribute("opacity", opacity);
    textEl.replaceWith(path);
  }

  return new XMLSerializer().serializeToString(clone);
}

interface BrandKitInput {
  lightSvg: SVGSVGElement;
  darkSvg: SVGSVGElement;
  markSvg: SVGSVGElement;
  recipe: LogoRecipe;
  darkRecipe: LogoRecipe;
  /** logo viewBox, for aspect-correct raster sizes */
  viewBox: { w: number; h: number };
}

export interface BrandKitResult {
  blob: Blob;
  /** false when font fetching failed and the vector SVGs were skipped */
  svgIncluded: boolean;
}

function kitFonts(recipe: LogoRecipe): FontSpec[] {
  return [
    {
      family: recipe.typography.name.font,
      weight: recipe.typography.name.weight,
    },
    ...(recipe.tagline.trim()
      ? [
          {
            family: recipe.typography.tagline.font,
            weight: recipe.typography.tagline.weight,
          },
        ]
      : []),
  ];
}

export async function buildBrandKit({
  lightSvg,
  darkSvg,
  markSvg,
  recipe,
  darkRecipe,
  viewBox,
}: BrandKitInput): Promise<BrandKitResult> {
  const zip = new JSZip();
  const ratio = viewBox.h / viewBox.w;
  const fonts = kitFonts(recipe);
  const darkFonts = kitFonts(darkRecipe);

  const pngs: [string, SVGSVGElement, number, number, FontSpec[]][] = [
    ["logo.png", lightSvg, 1024, Math.round(1024 * ratio), fonts],
    ["logo@2x.png", lightSvg, 2048, Math.round(2048 * ratio), fonts],
    ["logo-dark.png", darkSvg, 1024, Math.round(1024 * ratio), darkFonts],
    ["logo-dark@2x.png", darkSvg, 2048, Math.round(2048 * ratio), darkFonts],
    ["mark.png", markSvg, 1024, 1024, fonts],
    ["favicon-512.png", markSvg, 512, 512, fonts],
    ["favicon-192.png", markSvg, 192, 192, fonts],
    ["favicon-48.png", markSvg, 48, 48, fonts],
  ];
  for (const [name, svg, w, h, f] of pngs) {
    zip.file(name, await svgToPngBlob(svg, w, h, f));
  }

  let svgIncluded = true;
  try {
    zip.file("logo.svg", await svgWithTextPaths(lightSvg));
    zip.file("logo-dark.svg", await svgWithTextPaths(darkSvg));
  } catch {
    // Fonts unreachable — deliver the raster kit rather than a broken vector.
    svgIncluded = false;
  }

  return { blob: await zip.generateAsync({ type: "blob" }), svgIncluded };
}
