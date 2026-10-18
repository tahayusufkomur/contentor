// Where a clamped word's clip falls. A word shows its first `lines` lines and hides the rest with a clip
// along the bottom of the last one it shows. Two bits of ink meet there: the descenders of the last shown
// line (p g y ş ç) hang below its box, and the tallest ink of the first hidden line (an ascender, a digit)
// rises above its own box into the one over it, further the tighter the line height. The clip has to fall
// between them. Where they sit depends on the font (its ascent and descent, which the line height splits)
// and on the line height, so the numbers below were measured once, in Chrome on macOS (ink by canvas at
// 16, 28, 48 and 200 px, weights 400 to 800, the most of them: a variable font's optical size follows its
// size; the baseline by line boxes at 100 px), all in em:
//   s  how far the baseline sits below the middle of a line box;
//   d  the deepest ink below it of a letter, digit or sign; c the same of Ç Ş ç ş and of $ € £ ¥ ₺ § | [ ] { };
//   h  the highest ink above it of a letter, digit or sign; t the same of a capital with a mark above it
//      (İ Ğ Ö Ü É) and of those signs, which is the tallest ink there is.
// The clip falls half way between them. Where they overlap (a tight line height) that takes a hair off the
// descenders and lets a hair of the hidden line show, under a pixel at a title's size. The marks of tall
// capitals rise so far (at a line height of 1.1 above all of the descender zone) that hiding the dot of a
// hidden İ would cut the cedilla off a ş and the tail off a y, so the clip hides those marks only where
// there is room for them under the descenders.

/** How far past the clamp's text its box reaches, top and bottom, in em: the room its clip works in. The
 *  box takes the same off its margins, so it is laid out as the lines alone. */
export const CLAMP_PAD = 0.3;
type Ink = readonly [s: number, d: number, c: number, h: number, t: number];

const INK: Record<string, Ink> = {
  "Albert Sans": [0.35, 0.21, 0.28, 0.81, 0.97],
  Alegreya: [0.33, 0.25, 0.27, 0.76, 0.9],
  "Alegreya Sans": [0.3, 0.21, 0.27, 0.75, 0.91],
  Anybody: [0.27, 0.26, 0.26, 0.8, 0.89],
  Archivo: [0.33, 0.2, 0.21, 0.74, 0.94],
  "Atkinson Hyperlegible": [0.33, 0.21, 0.21, 0.77, 0.92],
  "Bodoni Moda": [0.36, 0.27, 0.27, 0.81, 1.06],
  "Bricolage Grotesque": [0.33, 0.21, 0.25, 0.79, 0.92],
  Cinzel: [0.3, 0.28, 0.28, 0.84, 0.95],
  Cormorant: [0.31, 0.29, 0.29, 0.74, 0.83],
  "DM Sans": [0.34, 0.24, 0.27, 0.82, 0.98],
  Figtree: [0.35, 0.22, 0.22, 0.81, 0.94],
  Fraunces: [0.36, 0.26, 0.26, 0.82, 0.93],
  Fredoka: [0.36, 0.23, 0.23, 0.78, 1.01],
  "Hanken Grotesk": [0.35, 0.22, 0.26, 0.72, 0.92],
  "Host Grotesk": [0.34, 0.24, 0.27, 0.82, 0.98],
  "IBM Plex Sans": [0.37, 0.22, 0.22, 0.81, 1],
  "Instrument Sans": [0.36, 0.22, 0.22, 0.77, 0.99],
  "Instrument Serif": [0.34, 0.24, 0.24, 0.81, 1.01],
  "JetBrains Mono": [0.36, 0.18, 0.22, 0.85, 1.01],
  Jost: [0.34, 0.26, 0.27, 0.82, 1.02],
  Karla: [0.33, 0.26, 0.26, 0.8, 0.96],
  "Libre Franklin": [0.36, 0.18, 0.22, 0.76, 1.02],
  Literata: [0.43, 0.23, 0.24, 0.83, 0.97],
  Manrope: [0.38, 0.26, 0.26, 0.86, 1.04],
  Mulish: [0.38, 0.23, 0.23, 0.77, 1.01],
  Newsreader: [0.24, 0.29, 0.29, 0.77, 0.97],
  Nunito: [0.33, 0.21, 0.21, 0.78, 1.01],
  "Playfair Display": [0.41, 0.21, 0.22, 0.85, 0.98],
  "Schibsted Grotesk": [0.36, 0.21, 0.21, 0.81, 0.98],
  "Shippori Mincho": [0.43, 0.26, 0.26, 0.88, 1],
  "Source Sans 3": [0.31, 0.23, 0.25, 0.75, 0.89],
  "Source Serif 4": [0.35, 0.26, 0.26, 0.79, 0.92],
  Spectral: [0.3, 0.24, 0.25, 0.76, 0.89],
  Syne: [0.33, 0.22, 0.28, 0.83, 0.94],
  Unbounded: [0.37, 0.19, 0.27, 0.86, 1.09],
  "Young Serif": [0.34, 0.26, 0.28, 0.85, 1.08],
  "Zen Kaku Gothic New": [0.43, 0.22, 0.22, 0.82, 1],
  "Zilla Slab": [0.34, 0.23, 0.25, 0.74, 0.88],
};

/** The faces the clip is worked out for: those of the looks. */
export const CLAMP_FONTS = Object.keys(INK);

/** A font that has no numbers here: a middling one, so that its clip lands about where the others' do. */
const FALLBACK: Ink = [0.35, 0.24, 0.27, 0.83, 1.0];

/** What may carry a mark above the capitals: a capital with one (İ Ğ Ö Ü É) or a sign that stands taller; set
 *  in capitals (`text-transform`), any letter with one. */
const TALL = /[A-Z][\u0300-\u0315]|[$€£¥₺¢§|[\]{}]/;
const TALL_UPPER = /[A-Za-z][\u0300-\u0315]|[$€£¥₺¢§|[\]{}]/;
/** What hangs below the baseline further than a letter does: a cedilla or an ogonek (Ç Ş), or a sign. */
const BELOW = /[\u0327\u0328$€£¥₺¢§|[\]{}]/;

export interface ClampWord {
  /** The font family the words are set in. */
  family: string;
  text: string;
  /** Set in capitals (`text-transform`): then any letter may carry a mark above. */
  upper: boolean;
  /** Line height, in em. */
  leading: number;
}

/** Where the clip falls (`mid`), in em below the bottom of the last shown line's box: half way between
 *  `lo` (where its descenders end) and `hi` (where the first hidden line's ink begins). */
export function clampEdge({ family, text, upper, leading }: ClampWord) {
  const [s, d, c, h, t] = INK[family] ?? FALLBACK;
  const marks = text.normalize("NFD");
  const lo = s + (BELOW.test(marks) ? c : d) - leading / 2;
  const tall = s - t + leading / 2;
  // A tall capital may be on the first hidden line wherever it is in the text; its mark is hidden where
  // there is room for that under the descenders.
  const hi =
    (upper ? TALL_UPPER : TALL).test(marks) && tall > lo
      ? tall
      : s - h + leading / 2;
  return { lo, hi, mid: (lo + hi) / 2 };
}

const round = (v: number) => +v.toFixed(3);

/** The word's `clip-path`: its box less what lies under the clip. */
export function clampClip(word: ClampWord): string {
  return `inset(0 0 calc(${CLAMP_PAD}em - ${round(clampEdge(word).mid)}em) 0)`;
}
