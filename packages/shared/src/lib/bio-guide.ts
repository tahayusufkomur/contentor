// What the setup bio box says (what to write and why, the example, the nudge)
// is in the creator's language: `admin.setupFlow.bio.*`. Only the rule is here.

/** Under this many words a bio is thin; she gets a gentle nudge, never a block. */
export const BIO_SHORT_WORDS = 40;

/** True for a bio that has started but is still short (empty text gets no nudge). */
export function bioIsShort(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return words > 0 && words < BIO_SHORT_WORDS;
}
