/** Niches with a captured screenshot set under
 * frontend-main/public/wizard-mockups/<niche>/ — mirrors
 * backend/apps/demo_seed/data/ minus "general", whose deliberately sparse
 * content module (no plans, FAQ disabled) would produce empty-state
 * screenshots. Captured by tools/wizard-mockups/capture.mjs. */
export const MOCKUP_NICHES = [
  "belly_dance",
  "face_yoga",
  "fitness",
  "makeup",
  "pilates",
  "pole_dance",
  "yoga",
] as const;

export const FALLBACK_NICHE = "yoga";

/** Ordered candidate URLs for one wizard mockup image: the coach's niche
 * first, then the yoga fallback set. Consumers try each in order and drop
 * to a CSS sketch when every candidate 404s — so a niche added to the
 * catalog before its screenshots are captured never shows a broken image. */
export function mockupSrcs(niche: string | undefined, name: string): string[] {
  const dir =
    niche && (MOCKUP_NICHES as readonly string[]).includes(niche)
      ? niche
      : FALLBACK_NICHE;
  const srcs = [`/wizard-mockups/${dir}/${name}.webp`];
  if (dir !== FALLBACK_NICHE)
    srcs.push(`/wizard-mockups/${FALLBACK_NICHE}/${name}.webp`);
  return srcs;
}
