/** What a creator is asked to write about her work, and why. One source for the
 * signup "about" step (frontend-main) and the /setup hand-over (frontend-customer),
 * so both places say the same thing. The points mirror what the backend reads out
 * of a bio (apps/core/onboarding/about_check.py): what she teaches, who to, her
 * story and training, how she works, and what sets her apart. */
export const BIO_GUIDE = {
  label: "Or write about your work",
  why: "The more you tell us, the more your site sounds like you. Try to cover:",
  includes: [
    "What you teach, and who you teach",
    "Your background and certifications",
    "Your teaching style",
    "How many years you have been at it",
    "What makes you different",
  ],
  placeholder:
    "I teach … to … I trained as … and have been teaching for … years. My classes feel … and what makes them different is …",
  exampleLink: "See an example",
  example:
    "I teach vinyasa yoga and breathwork to beginners and busy desk workers, online and in person in Brooklyn. I trained in a 500-hour program and have taught for 10 years, ever since burnout in a corporate job led me to yoga. My classes are slow, warm and practical: small groups, no showing off, and always an easier way into every pose. Students say what sets me apart is that I teach them to practise on their own.",
  nudge:
    "That is a good start. A few more lines about your background and what makes you different give you a better site.",
} as const;

/** Under this many words a bio is thin; she gets a gentle nudge, never a block. */
export const BIO_SHORT_WORDS = 40;

/** True for a bio that has started but is still short (empty text gets no nudge). */
export function bioIsShort(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return words > 0 && words < BIO_SHORT_WORDS;
}
