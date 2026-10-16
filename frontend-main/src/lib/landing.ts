// What the landing is made of: its section ids, the media each section reads,
// the twelve niche cards, the team's six roles and the FAQ keys. Pure data so
// landing-media.test.ts and landing-copy.test.ts can hold the page against
// media.json and marketing.json. Every clip and screen is one demo coach, Mara
// Lindqvist (record.ts mara-*, seeded by seed_footage_coach).

/** Section anchors in page order; the header links to "team" and "for". */
export const SECTION_IDS = [
  "hero",
  "for",
  "team",
  "earnings",
  "founding",
  "start",
] as const;

/** The creator at the centre of the hero's team: Mara recording a class. */
export const HERO_PHOTO = "screens-creator";

/** "Your whole team": the six roles the hero lists and the team chapter
 * plays, in the order of the coach's path. `ms` is how long the chapter
 * stays on a role before moving on: long enough for its scene to land. */
export const TEAM_ROLES = [
  { key: "designer", ms: 8000 },
  { key: "marketer", ms: 13000 },
  { key: "producer", ms: 7000 },
  { key: "community", ms: 6500 },
  { key: "assistant", ms: 9500 },
  { key: "cashier", ms: 8500 },
] as const;

export type TeamRole = (typeof TEAM_ROLES)[number]["key"];

/** The designer's footage: the setup interview, a look picked, the site built. */
export const TEAM_CLIP = "path-launch";

/** The producer's scene: students following Mara's live class on each kind of
 * screen (scripts/footage/screens.py lays the recording onto each photo). */
export const LIVE_CLIPS = [
  { key: "laptop", media: "screens-laptop" },
  { key: "tablet", media: "screens-tablet" },
  { key: "phone", media: "screens-phone" },
] as const;

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

/** The founding offer, in the order the founder section lists it. */
export const FOUNDING_PERKS = [
  "concierge",
  "discount",
  "migration",
  "featured",
] as const;

export const FAQ_KEYS = [
  "trial",
  "technical",
  "payments",
  "customDomain",
  "migration",
  "contract",
] as const;

export type LandingMediaKind = "clip" | "still";

/** Every key the page reads, with the kind each must have in media.json. */
export const LANDING_MEDIA: Record<string, LandingMediaKind> = {
  [HERO_PHOTO]: "still",
  [TEAM_CLIP]: "clip",
  ...Object.fromEntries(LIVE_CLIPS.map((c) => [c.media, "clip"])),
  ...Object.fromEntries(
    LOOK_CARDS.flatMap((c) => [
      [c.still, "still"],
      [c.render, "still"],
    ]),
  ),
};
