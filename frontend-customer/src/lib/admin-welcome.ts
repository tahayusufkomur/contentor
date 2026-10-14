import type { SiteStylePalette } from "@shared/sections/types";
import { paletteOf, siteLook } from "@/lib/site-styles";

export type GreetingKey = "morning" | "afternoon" | "evening" | "hello";

/** Which greeting the Overview opens with (spec 5.6). `null` is the moment
 *  before the client clock has been read (the server's zone is not hers), so
 *  the page says a neutral hello rather than the server's evening. */
export function greetingKey(hour: number | null): GreetingKey {
  if (hour === null || !Number.isInteger(hour) || hour < 0 || hour > 23) {
    return "hello";
  }
  if (hour < 5) return "evening";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

/** The word to greet her by: the first word of her name, or nothing. A seed
 *  or a token login can leave `name` empty or an e-mail; neither belongs in
 *  "Good morning, …". */
export function firstName(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return first.includes("@") ? "" : first;
}

export interface LookSummary {
  /** The style's name, e.g. "Quiet Journal". */
  label: string;
  /** The colourway's name: the style's own or an alternative's. */
  palette: string;
  /** Paper, ink, brand, accent — the four swatches beside the name. */
  colors: [string, string, string, string];
}

const swatches = (p: SiteStylePalette): LookSummary["colors"] => [
  p.background,
  p.foreground,
  p.primary,
  p.accent,
];

/** What the coach's site wears, for the Overview's welcome frame. Follows
 *  siteLook/paletteOf: an unknown style is the default look, an unknown
 *  palette id the style's own. */
export function lookSummary(
  styleId?: string | null,
  paletteId?: string | null,
): LookSummary {
  const style = siteLook(styleId);
  const variant = style.palettes?.find((p) => paletteId && p.id === paletteId);
  return {
    label: style.label,
    palette: variant?.label ?? style.paletteLabel,
    colors: swatches(paletteOf(style, paletteId)),
  };
}
