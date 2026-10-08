import type { SiteStyle } from "../types";
import journal from "./journal.json";
import kinetic from "./kinetic.json";
import grid from "./grid.json";
import pop from "./pop.json";
import ledger from "./ledger.json";
import darkroom from "./darkroom.json";
import nocturne from "./nocturne.json";
import primer from "./primer.json";
import tavola from "./tavola.json";
import encore from "./encore.json";
import trail from "./trail.json";
import maison from "./maison.json";
import studiofloor from "./studiofloor.json";
import atelier from "./atelier.json";
import dojo from "./dojo.json";
import workshop from "./workshop.json";
import terminal from "./terminal.json";
import sprout from "./sprout.json";
import manuscript from "./manuscript.json";
import sanctum from "./sanctum.json";

/** Every site style, by id, in build/display order. */
export const SITE_STYLES: Record<string, SiteStyle> = Object.fromEntries(
  (
    [
      journal,
      kinetic,
      grid,
      pop,
      ledger,
      darkroom,
      nocturne,
      primer,
      tavola,
      encore,
      trail,
      maison,
      studiofloor,
      atelier,
      dojo,
      workshop,
      terminal,
      sprout,
      manuscript,
      sanctum,
    ] as unknown as SiteStyle[]
  )
    .sort((a, b) => a.order - b.order)
    .map((s) => [s.id, s]),
);

export const ENABLED_STYLES = (): SiteStyle[] =>
  Object.values(SITE_STYLES).filter((s) => s.enabled);

/** Ranking weights: mirrored by rank_styles in backend/apps/tenant_config/sections.py. */
const NICHE_WEIGHTS = [12, 8, 5, 3];
const TONE_WEIGHT = 3;

/** Enabled styles best first for a niche and the tones the coach asked for
 *  ("Warm, Calm" or a list): niche fit (its position in `niches`), then tone
 *  match; ties keep display order. The first is the recommendation. */
export function rankStylesForNiche(
  niche?: string,
  tone?: string | string[],
): SiteStyle[] {
  const tones = (Array.isArray(tone) ? tone : (tone ?? "").split(","))
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const score = (s: SiteStyle) => {
    const at = niche ? s.niches.indexOf(niche) : -1;
    return (
      (at < 0 ? 0 : NICHE_WEIGHTS[Math.min(at, NICHE_WEIGHTS.length - 1)]) +
      TONE_WEIGHT * tones.filter((t) => s.tones?.includes(t)).length
    );
  };
  return ENABLED_STYLES()
    .map((s, i) => ({ s, i }))
    .sort((a, b) => score(b.s) - score(a.s) || a.i - b.i)
    .map(({ s }) => s);
}
