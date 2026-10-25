import { parseOklch } from "@shared/lib/contrast";
import type { SiteStyle } from "@shared/sections/types";
import { paletteOf, siteLook } from "@/lib/site-styles";
import { PAINT_ROLES } from "@/types/design";
import type { Paint, PaintRole } from "@/types/design";

/** Every colour a cover can use, by the role it plays. */
export type CoverPalette = Record<PaintRole, string>;

/** A cover payload's `look` ("<style id>" or "<style id>:<palette id>") as the style and palette
 *  it names. An unknown style id is the default look. */
export function parseLook(look: string): {
  style: SiteStyle;
  paletteId: string | null;
} {
  const colon = look.indexOf(":");
  return {
    style: siteLook(colon < 0 ? look : look.slice(0, colon)),
    paletteId: colon < 0 ? null : look.slice(colon + 1) || null,
  };
}

/** The same colour, lighter or darker by `delta` of oklch lightness (kept inside 0.08-0.96). */
function tone(color: string, delta: number): string {
  const oklch = parseOklch(color);
  if (!oklch) return color;
  const l = Math.min(0.96, Math.max(0.08, oklch.l + delta));
  return `oklch(${+l.toFixed(4)} ${oklch.c} ${oklch.h})`;
}

/** The look's own palette as cover roles. A cover always wears the look's own colours, never
 *  the other scheme `modePalette` derives, so it looks the same in light and dark. */
export function coverPalette(
  style: SiteStyle,
  paletteId?: string | null,
): CoverPalette {
  const p = paletteOf(style, paletteId);
  return {
    primary: p.primary,
    accent: p.accent,
    ink: p.foreground,
    paper: p.background,
    surface: p.surface,
    inverse: p.inverse,
    "inverse-ink": p.inverseForeground,
    "primary-light": tone(p.primary, 0.16),
    "primary-dark": tone(p.primary, -0.16),
    "accent-light": tone(p.accent, 0.16),
    "accent-dark": tone(p.accent, -0.16),
    white: "#fff",
    black: "#000",
  };
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Whether a paint is a custom `#rrggbb` colour, not a role of the look. */
export const isHex = (paint: string): paint is `#${string}` => HEX.test(paint);

/** What a colour field shows and does after a keystroke: the text as typed (six digits pasted without their #
 *  get one), and the colour to apply once it is a whole `#rrggbb` other than the one the layer has (`current`;
 *  none while the layer is deleted, which any colour then brings back). */
export function typeColour(
  typed: string,
  current: Paint | undefined,
): { text: string; pick: `#${string}` | null } {
  const text = /^[0-9a-f]{6}$/i.test(typed) ? `#${typed}` : typed;
  const pick =
    isHex(text) && text.toLowerCase() !== current?.toLowerCase() ? text : null;
  return { text, pick };
}

/** A paint as a CSS colour: a hex as it is, a role from the palette, primary for anything else. */
export function paintColor(paint: Paint, palette: CoverPalette): string {
  if (isHex(paint)) return paint;
  return (PAINT_ROLES as readonly string[]).includes(paint)
    ? palette[paint as PaintRole]
    : palette.primary;
}

/** Oklab lightness of an sRGB hex (#rgb or #rrggbb). */
function hexLightness(hex: string): number {
  const digits = hex.slice(1);
  const full = digits.length === 3 ? digits.replace(/./g, "$&$&") : digits;
  const [r, g, b] = [0, 2, 4].map((at) => {
    const v = parseInt(full.slice(at, at + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

/** Lightness (0-1) of a palette colour: oklch() or hex. Anything else counts as dark. */
export function lightness(color: string): number {
  if (color.startsWith("#")) return hexLightness(color);
  return parseOklch(color)?.l ?? 0;
}

/** The text colour for words on a paint: the look's dark colour on a light paint, white on a dark
 *  one. The dark colour is the ink on a look with a light ground and the paper on a look with a
 *  dark one, where the ink is itself light and would vanish on a light paint. */
export function readableOn(paint: Paint, palette: CoverPalette): string {
  // ponytail: a lightness threshold, not a contrast measurement: paints near L 0.6 get 3.5-4.3:1.
  // Compare the contrast of both candidates if titles on those need 4.5.
  if (lightness(paintColor(paint, palette)) <= 0.62) return "#fff";
  return lightness(palette.ink) <= lightness(palette.paper)
    ? palette.ink
    : palette.paper;
}
