// Niche-aware example content for newly-added blocks. When a creator adds a
// block in the builder, `newBlock(type, niche)` merges the matching example
// overrides (below) onto the block's `defaultData`, so the block lands
// pre-filled with illustrative, on-topic content instead of an empty shell.
// Every block type has auto content; media/dynamic blocks fill heading/intro
// text only (their images and live items come from the creator's own assets).
//
// The words are `blocks.example.<niche>.<type>` (`generic` when the niche is
// unknown or has no copy for that type), written in the SITE's language: this
// is what a visitor reads if she leaves the sample alone. Written once; after
// that it is her text and never retranslated. Only the links stay here.
//
// Copy for hero / imageText / testimonials / faq / cta is transcribed from the
// niche seed modules (backend `apps/core/management/commands/demo_data/<niche>.py`
// `landing_sections`); richText / stats / banner are curated per niche. Stats
// numbers are intentionally illustrative placeholders for the creator to edit.
//
// Keys match each block's registry data fields exactly:
//   hero         { heading, subheading, ctaText, ctaHref }
//   richText     { heading, body }          (body = rich-text HTML)
//   imageText    { heading, body }
//   testimonials { heading, items: [{ name, text }] }
//   faq          { heading, items: [{ q, a }] }
//   cta          { heading, buttonText, buttonHref }
//   stats        { heading, items: [{ value, label }] }
//   banner       { text, linkText, linkHref }
//   contact      { heading, intro }
//   pricingPlans { heading, subheading }
//   gallery / logos / video / courseGrid / upcomingEvents / storeProducts { heading }

import { camel, escapeHtml, type Say } from "./say";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BlockExample = Record<string, any>;

/** The block types a niche writes its own copy for; the rest fall to `generic`. */
const NICHE_TYPES = [
  "hero",
  "richText",
  "imageText",
  "testimonials",
  "faq",
  "cta",
  "stats",
  "banner",
];

/** Every block type the generic examples cover. */
const GENERIC_TYPES = [
  ...NICHE_TYPES,
  "contact",
  "gallery",
  "logos",
  "video",
  "courseGrid",
  "pricingPlans",
  "upcomingEvents",
  "storeProducts",
];

/** The niches that have copy of their own (`blocks.example.<niche>`). */
const NICHES = new Set([
  "yoga",
  "pilates",
  "fitness",
  "face_yoga",
  "belly_dance",
  "pole_dance",
  "makeup",
]);

/** The links a block's example carries (not words, so not translated). */
const LINKS: Record<string, BlockExample> = {
  hero: { ctaHref: "/courses" },
  cta: { buttonHref: "/courses" },
  banner: { linkHref: "/courses" },
};

/** Types whose `body` is rich-text HTML: the message is plain text, wrapped here. */
const HTML_BODY = ["richText", "imageText"];

/** Example overrides for a block type, given an optional niche, in the language
 *  of `site`. Returns the niche-specific example, else the generic one, else
 *  `{}` (out-of-scope block types). Never throws. */
export function exampleFor(
  type: string,
  niche: string | undefined,
  site: Say,
): BlockExample {
  const group =
    niche && NICHES.has(niche) && NICHE_TYPES.includes(type)
      ? camel(niche)
      : GENERIC_TYPES.includes(type)
        ? "generic"
        : null;
  const key = group && `example.${group}.${type}`;
  if (!key || !site.has(key)) return {};
  const words = structuredClone(site.raw(key)) as BlockExample;
  if (HTML_BODY.includes(type) && typeof words.body === "string")
    words.body = `<p>${escapeHtml(words.body)}</p>`;
  return { ...words, ...structuredClone(LINKS[type] ?? {}) };
}
