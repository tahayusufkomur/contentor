// Orders the curated logo library for one coach: logos whose tags/title
// match the coach's niche and their own description of what they do come
// first, catalog position breaks ties. Used by the signup wizard's logo step
// (frontend-main) and the Logo Studio's Browse entrance (frontend-customer).

export interface RankableCuratedLogo {
  title: string;
  /** Lowercase tag list, multi-word tags allowed ("pole dance"). */
  tags: string[];
}

export interface BriefKeywords {
  /** The coach's own words: niche + description + style chips. */
  primary: Set<string>;
  /** Vocabulary we associate with the niche — a weaker signal. */
  secondary: Set<string>;
}

/** Wizard niche ids (or free-text niches) → related catalog vocabulary. */
const NICHE_KEYWORDS: Record<string, string[]> = {
  yoga: ["meditation", "lotus", "zen", "wellness", "calm"],
  pilates: ["wellness", "calm"],
  fitness: ["gym", "dumbbell", "barbell", "strength", "bodybuilder", "sport"],
  "pole dance": ["dance", "dancer", "pole"],
  "belly dance": ["dance", "dancer"],
  "face yoga": ["face", "beauty", "skincare", "massage"],
  makeup: ["beauty", "lipstick", "mascara", "face"],
};

const STOPWORDS = new Set(
  "the and for with all our your out are was has have this that from into give will can when who how what its than then them they she her his".split(
    " ",
  ),
);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/** Same word family: exact, or a long (5+) shared prefix — cheap stemming so
 * "pregnant" reaches the "pregnancy" tag and "dancer" reaches "dance". */
function matches(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i >= 5;
}

/** Keyword tiers for a coach brief; both empty = nothing to rank by. */
export function briefKeywords(brief: {
  niche?: string;
  description?: string;
  styleChips?: string[];
}): BriefKeywords {
  const primary = new Set<string>();
  const secondary = new Set<string>();
  const niche = (brief.niche ?? "").toLowerCase().replace(/_/g, " ").trim();
  if (niche) {
    primary.add(niche);
    for (const w of words(niche)) primary.add(w);
    for (const w of NICHE_KEYWORDS[niche] ?? []) secondary.add(w);
  }
  for (const w of words(brief.description ?? "")) primary.add(w);
  for (const chip of brief.styleChips ?? []) primary.add(chip.toLowerCase());
  return { primary, secondary };
}

/**
 * Stable sort by match score. Whole-tag hits on the coach's own words weigh
 * most ("pole dance" tag for a pole-dance coach), then word-family hits,
 * then niche-vocabulary and title hits.
 */
export function rankCuratedLogos<T extends RankableCuratedLogo>(
  logos: T[],
  keywords: BriefKeywords,
): T[] {
  const { primary, secondary } = keywords;
  if (primary.size === 0 && secondary.size === 0) return [...logos];
  const primaryHit = (w: string) => [...primary].some((k) => matches(w, k));

  const score = (logo: T): number => {
    let s = 0;
    const viaTags = new Set<string>();
    for (const tag of logo.tags) {
      const tagWords = words(tag);
      if (primary.has(tag)) {
        s += 4;
      } else if (tagWords.some(primaryHit)) {
        s += 2;
      } else if (secondary.has(tag) || tagWords.some((w) => secondary.has(w))) {
        s += 1;
        continue;
      } else {
        continue;
      }
      for (const w of tagWords) viaTags.add(w);
    }
    for (const w of new Set(words(logo.title))) {
      if (!viaTags.has(w) && primaryHit(w)) s += 1;
    }
    return s;
  };

  return logos
    .map((logo, index) => ({ logo, index, s: score(logo) }))
    .sort((a, b) => b.s - a.s || a.index - b.index)
    .map((x) => x.logo);
}

/**
 * Overlay a server-computed AI rank (ordered logo ids, best first) on an
 * already keyword-ranked list: AI picks first, everything else keeps its
 * order. Absent/empty rank = unchanged list.
 */
export function applyAiRank<T extends { id: number }>(
  items: T[],
  aiRank?: number[] | null,
): T[] {
  if (!aiRank || aiRank.length === 0) return items;
  const byId = new Map(items.map((item) => [item.id, item]));
  const picked = aiRank
    .map((id) => byId.get(id))
    .filter((item): item is T => item !== undefined);
  const pickedIds = new Set(picked.map((item) => item.id));
  return [...picked, ...items.filter((item) => !pickedIds.has(item.id))];
}
