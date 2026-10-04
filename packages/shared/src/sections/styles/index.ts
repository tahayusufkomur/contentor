import type { SiteStyle } from "../types";
import journal from "./journal.json";
import kinetic from "./kinetic.json";
import grid from "./grid.json";
import pop from "./pop.json";

/** Every site style, by id, in build/display order. */
export const SITE_STYLES: Record<string, SiteStyle> = Object.fromEntries(
  ([journal, kinetic, grid, pop] as unknown as SiteStyle[])
    .sort((a, b) => a.order - b.order)
    .map((s) => [s.id, s]),
);

export const ENABLED_STYLES = (): SiteStyle[] =>
  Object.values(SITE_STYLES).filter((s) => s.enabled);

/** Enabled styles for a niche: styles listing the niche first (in order),
 *  then the rest. The first is the recommendation. */
export function rankStylesForNiche(niche?: string): SiteStyle[] {
  const enabled = ENABLED_STYLES();
  const fits = enabled.filter((s) => niche && s.niches.includes(niche));
  return [...fits, ...enabled.filter((s) => !fits.includes(s))];
}
