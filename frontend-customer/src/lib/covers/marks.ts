// Words she marked on a cover. A word set `*like this*` in her words is drawn in her emphasis colour
// (CoverArt); the stars are how the recipe keeps the mark, so the backend needs to know nothing of it.

export interface WordPart {
  text: string;
  marked: boolean;
}

/** Her words in parts, the marked ones flagged. A lone star is a star. */
export function markedWords(text: string): WordPart[] {
  const parts: WordPart[] = [];
  let at = 0;
  for (const match of text.matchAll(/\*([^*]+)\*/g)) {
    const index = match.index ?? 0;
    if (index > at) parts.push({ text: text.slice(at, index), marked: false });
    parts.push({ text: match[1], marked: true });
    at = index + match[0].length;
  }
  if (at < text.length) parts.push({ text: text.slice(at), marked: false });
  return parts;
}

/** The words as they read, without the stars that mark some of them. */
export const plainWords = (text: string): string =>
  markedWords(text)
    .map((part) => part.text)
    .join("");

/** The words she can mark, in order, each once: what a word picker lists. */
export function wordsOf(text: string): string[] {
  const seen = new Set<string>();
  for (const word of plainWords(text).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ??
    []) {
    seen.add(word);
  }
  return [...seen];
}

/** The word marked now (the first, if she marked several), or "" for none. */
export const markedWord = (text: string): string =>
  markedWords(text).find((part) => part.marked)?.text ?? "";

/** `text` with `word` marked, and nothing else: the first time it stands as a word of its own. "" or a word
 *  that is not there leaves the text unmarked. Null when the stars would take it past `limit` characters,
 *  which the server would cut, losing the closing star. */
export function markWord(
  text: string,
  word: string,
  limit: number,
): string | null {
  const plain = plainWords(text);
  if (!word) return plain;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const at = new RegExp(
    `(^|[^\\p{L}\\p{N}])(${escaped})(?=$|[^\\p{L}\\p{N}])`,
    "u",
  ).exec(plain);
  if (!at) return plain;
  const start = at.index + at[1].length;
  const marked = `${plain.slice(0, start)}*${word}*${plain.slice(start + word.length)}`;
  return marked.length > limit ? null : marked;
}
