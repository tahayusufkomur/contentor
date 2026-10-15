// What the landing is made of: chapter ids, the twelve look cards, the seven
// studio tiles, the FAQ keys and every media key the chapters read. Pure data
// so landing-media.test.ts and landing-copy.test.ts can hold the page against
// media.json, the look catalog and marketing.json.

export const CHAPTER_IDS = [
  "hero",
  "looks",
  "build",
  "studio",
  "assistant",
  "students",
  "money",
  "start",
] as const;
export type ChapterId = (typeof CHAPTER_IDS)[number];

export const HERO_CLIP = "hero-looks";
export const BUILD_CLIP = "clip-setup";
export const ASSISTANT_CLIP = "clip-assistant";
export const STUDENT_CLIP = "clip-student-phone";

/** Twelve of the twenty looks, one niche each (spec 5.4 ch. 3). `still` is
 * the 4:5 coach photograph, `render` the look's phone screenshot. */
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

/** Bento tiles (ch. 4): a 2x still and a short loop that plays on hover or
 * tap. `span` is the tile's width in a six-column grid: 4+2 / 2+2+2 / 3+3. */
export const STUDIO_TILES = [
  { key: "courses", still: "tile-courses", loop: "loop-courses", span: 4 },
  { key: "live", still: "tile-live", loop: "loop-live", span: 2 },
  { key: "messages", still: "tile-messages", loop: "loop-messages", span: 2 },
  {
    key: "community",
    still: "tile-community",
    loop: "loop-community",
    span: 2,
  },
  { key: "media", still: "tile-media", loop: "loop-media", span: 2 },
  { key: "blog", still: "tile-blog", loop: "loop-blog", span: 3 },
  { key: "logo", still: "tile-logo", loop: "loop-logo", span: 3 },
] as const;

/** Chapter 6's two tiles beside the phone footage. */
export const STUDENT_TILES = [
  { key: "dashboard", still: "tile-student-dashboard" },
  { key: "live", still: "tile-live-class" },
] as const;

/** Chapter 7's three flat tiles: text only, no numbers (spec 5.4 ch. 7). */
export const MONEY_TILES = ["stripe", "payouts", "brand"] as const;

export const FAQ_KEYS = [
  "freePlan",
  "technical",
  "customDomain",
  "payments",
  "liveClasses",
  "migration",
  "contract",
] as const;

export type LandingMediaKind = "clip" | "loop" | "still";

/** Every key the page reads, with the kind each must have in media.json. */
export const LANDING_MEDIA: Record<string, LandingMediaKind> = {
  [HERO_CLIP]: "clip",
  [STUDENT_CLIP]: "clip",
  [BUILD_CLIP]: "clip",
  [ASSISTANT_CLIP]: "clip",
  ...Object.fromEntries(
    STUDIO_TILES.flatMap((t) => [
      [t.still, "still"],
      [t.loop, "loop"],
    ]),
  ),
  ...Object.fromEntries(STUDENT_TILES.map((t) => [t.still, "still"])),
  ...Object.fromEntries(
    LOOK_CARDS.flatMap((c) => [
      [c.still, "still"],
      [c.render, "still"],
    ]),
  ),
};
