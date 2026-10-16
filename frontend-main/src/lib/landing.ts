// What the landing is made of: its section ids, the media each section reads,
// the twelve niche cards, the path's four steps and the FAQ keys. Pure data so
// landing-media.test.ts and landing-copy.test.ts can hold the page against
// media.json and marketing.json. Every clip and screen is one demo coach, Mara
// Lindqvist (record.ts mara-*, seeded by seed_footage_coach).

/** Section anchors in page order; the header links to "path" and "for". */
export const SECTION_IDS = [
  "hero",
  "for",
  "path",
  "support",
  "earnings",
  "start",
] as const;

/** The hero photograph and the real screens laid over it. */
export const HERO_PHOTO = "hero-coach";
export const HERO_CHIPS = ["chip-post", "chip-live", "chip-sale"] as const;

/** The path to paying students: one clip per step. `phone`: filmed on a phone. */
export const PATH_STEPS = [
  { key: "launch", clip: "path-launch", phone: false },
  { key: "found", clip: "path-found", phone: false },
  { key: "keep", clip: "path-keep", phone: true },
  { key: "paid", clip: "path-paid", phone: false },
] as const;

/** "You're not alone": the assistant's clip and the cards beside it. */
export const SUPPORT_CLIP = "support-assistant";
export const SUPPORT_TILES = ["assistant", "founder", "migrate"] as const;

/** Twelve of the twenty looks, one niche each. `still` is the 4:5 coach
 * photograph, `render` the look's phone screenshot; the caption names the
 * niche (marketing.for.niches.<look>). */
export const LOOK_CARDS = [
  { look: "journal", still: "still-yoga", render: "look-journal" },
  { look: "kinetic", still: "still-fitness", render: "look-kinetic" },
  { look: "encore", still: "still-music", render: "look-encore" },
  { look: "studiofloor", still: "still-dance", render: "look-studiofloor" },
  { look: "tavola", still: "still-cooking", render: "look-tavola" },
  { look: "primer", still: "still-language", render: "look-primer" },
  { look: "dojo", still: "still-martial-arts", render: "look-dojo" },
  { look: "workshop", still: "still-crafts", render: "look-workshop" },
  { look: "atelier", still: "still-beauty", render: "look-atelier" },
  { look: "sprout", still: "still-family", render: "look-sprout" },
  { look: "trail", still: "still-outdoors", render: "look-trail" },
  { look: "nocturne", still: "still-wellness", render: "look-nocturne" },
] as const;

export const FAQ_KEYS = [
  "freePlan",
  "technical",
  "customDomain",
  "payments",
  "liveClasses",
  "migration",
  "contract",
] as const;

export type LandingMediaKind = "clip" | "still";

/** Every key the page reads, with the kind each must have in media.json. */
export const LANDING_MEDIA: Record<string, LandingMediaKind> = {
  [HERO_PHOTO]: "still",
  ...Object.fromEntries(HERO_CHIPS.map((k) => [k, "still"])),
  ...Object.fromEntries(PATH_STEPS.map((s) => [s.clip, "clip"])),
  [SUPPORT_CLIP]: "clip",
  ...Object.fromEntries(
    LOOK_CARDS.flatMap((c) => [
      [c.still, "still"],
      [c.render, "still"],
    ]),
  ),
};
