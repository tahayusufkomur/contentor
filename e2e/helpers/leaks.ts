import type { Page } from "@playwright/test";

// Proof that a page carries no English chrome: the English interface texts that
// have a different text in the site's language must not show up on the page.

type Tree = string | number | boolean | null | Tree[] | { [key: string]: Tree };

function leaves(tree: Tree, path = "", out = new Map<string, string>()): Map<string, string> {
  if (typeof tree === "string") out.set(path, tree);
  else if (tree && typeof tree === "object") {
    for (const [k, v] of Object.entries(tree)) leaves(v, path ? `${path}.${k}` : k, out);
  }
  return out;
}

/** Every string leaf of a messages file, in order. */
export function leafValues(tree: object): string[] {
  return [...leaves(tree as Tree).values()];
}

const isLetter = (ch: string | undefined) => !!ch && /[\p{L}\p{N}]/u.test(ch);

/**
 * Lower-case for comparing, with the dotted capital İ read as an i. A page in Turkish uppercases
 * through CSS to "LİVE" and "PUBLİSHED", and "İ".toLowerCase() is "i" plus a combining dot, which
 * would never match the English "live". The fold keeps the length, so offsets stay valid.
 * e.g. fold("PUBLİSHED") === "published"
 */
const fold = (text: string) => text.replace(/İ/g, "i").toLowerCase();

/** The phrases found in `text` as whole phrases, ignoring case (and İ/i). */
export function phrasesIn(text: string, phrases: string[]): string[] {
  const hay = fold(text);
  return phrases.filter((phrase) => {
    const needle = fold(phrase);
    for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, at + 1)) {
      if (!isLetter(hay[at - 1]) && !isLetter(hay[at + needle.length])) return true;
    }
    return false;
  });
}


/**
 * The English leaf values (4+ characters, no `{` placeholder) that `other` writes differently.
 * `theirText` is everything the site's language writes (all its files, joined): an English value
 * that also reads as a whole phrase in it is not a leak signal ("Name" inside a Turkish sentence).
 */
export function leakCandidates(en: object, other: object, theirText = ""): string[] {
  const theirs = leaves(other as Tree);
  const found = new Set<string>();
  for (const [key, value] of leaves(en as Tree)) {
    if (value.length >= 4 && !value.includes("{") && theirs.get(key) !== value) found.add(value);
  }
  const all = [...found];
  const alsoTheirs = new Set(phrasesIn(theirText, all));
  return all.filter((value) => !alsoTheirs.has(value));
}

// Fields that hold a creator's own words (titles, descriptions, block copy, navbar labels). Enum
// fields (pricing_type, status, type, kind, ...) are interface words once rendered ("Free", "Live")
// and are deliberately NOT here.
const AUTHORED_KEYS = new Set([
  "title", "name", "description", "label", "text", "heading", "subheading", "subheadline", "headline",
  "body", "intro", "tagline", "brand_name", "meta_description", "q", "a", "cta_text", "button_text",
  "ctaText", "buttonText", "submitLabel", "successMessage", "location", "instructor_name", "group_name",
]);

/** The creator-authored string leaves of stored API data, as visible text (HTML split into its text runs). */
export function authoredLeaves(data: unknown, out = new Set<string>()): string[] {
  const walk = (value: unknown, key = "") => {
    if (typeof value === "string") {
      if (!AUTHORED_KEYS.has(key)) return;
      for (const run of value.split(/<[^>]*>/)) {
        const text = run.replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
        if (text.length >= 2) out.add(text);
      }
    } else if (Array.isArray(value)) value.forEach((v) => walk(v, key));
    else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(v, k);
    }
  };
  walk(data);
  return [...out];
}

/**
 * `text` without the creator's own words. A leaf of several words is cut out wherever it occurs;
 * a single word ("Courses", a navbar label) only where it is a whole line, so the interface word
 * "Courses" elsewhere on the page is still checked.
 */
export function withoutAuthored(text: string, authored: string[]): string {
  const multi = authored.filter((leaf) => /\s/.test(leaf)).sort((a, b) => b.length - a.length);
  const single = new Set(authored.filter((leaf) => !/\s/.test(leaf)).map(fold));
  let out = fold(text);
  const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const leaf of multi) out = out.split(new RegExp(fold(leaf).split(/\s+/).map(escape).join("\\s+"), "g")).join("\n");
  return out
    .split("\n")
    .filter((line) => !single.has(fold(line.trim())))
    .join("\n");
}

/** The candidates found as whole phrases in what the visitor can read on the page, creator content aside. */
export async function englishLeaks(page: Page, candidates: string[], authored: string[] = []): Promise<string[]> {
  const text = await page.evaluate(() => document.body.innerText);
  return phrasesIn(withoutAuthored(text, authored), candidates);
}
