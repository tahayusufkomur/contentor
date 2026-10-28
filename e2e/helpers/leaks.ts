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

/** The English leaf values (4+ characters, no `{` placeholder) that `other` writes differently. */
export function leakCandidates(en: object, other: object): string[] {
  const theirs = leaves(other as Tree);
  const found = new Set<string>();
  for (const [key, value] of leaves(en as Tree)) {
    if (value.length >= 4 && !value.includes("{") && theirs.get(key) !== value) found.add(value);
  }
  return [...found];
}

const isLetter = (ch: string | undefined) => !!ch && /[\p{L}\p{N}]/u.test(ch);

/** The phrases found in `text` as whole phrases, ignoring case. */
export function phrasesIn(text: string, phrases: string[]): string[] {
  const hay = text.toLowerCase();
  return phrases.filter((phrase) => {
    const needle = phrase.toLowerCase();
    for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, at + 1)) {
      if (!isLetter(hay[at - 1]) && !isLetter(hay[at + needle.length])) return true;
    }
    return false;
  });
}

/** The candidates found as whole phrases in what the visitor can read on the page. */
export async function englishLeaks(page: Page, candidates: string[]): Promise<string[]> {
  const text = await page.evaluate(() => document.body.innerText);
  return phrasesIn(text, candidates);
}
