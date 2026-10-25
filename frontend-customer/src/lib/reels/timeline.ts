// The live preview's clock, drawn from what the server renders from (backend/apps/reels: words.py for the
// cuts, framing.py for the crop's keys, ass.py for the caption groups), so the preview plays the reel the
// file will be. Pure — see __tests__/timeline.test.ts. Times in seconds of the video unless a name says
// "reel" (the reel's own clock, its pauses cut).
import type { Phrase, ReelStyle, Word } from "@/types/reels";

export type Span = [number, number];

/** words, characters at most on screen at once (ass.py _GROUP). */
const GROUP: Record<ReelStyle, [number, number]> = {
  bold: [3, 16],
  clean: [6, 30],
  brand: [4, 22],
};
const GROUP_GAP = 0.45;
const HOLD = 0.5;
const ENDS = /[.?!…。？！]["')\]»”’]*$/;

/** The crop window's centre (a share of the width) at `t` from the reel's start: straight lines between the
 *  keys, held before the first and after the last. */
export function centreAt(keys: [number, number][], t: number): number {
  if (keys.length === 0) return 0.5;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t0, c0] = keys[i - 1];
    const [t1, c1] = keys[i];
    if (t < t1) return t1 > t0 ? c0 + ((c1 - c0) * (t - t0)) / (t1 - t0) : c1;
  }
  return keys[keys.length - 1][1];
}

/** The window's left edge as a share of the frame's width, kept inside the frame. */
export function windowLeft(
  keys: [number, number][],
  t: number,
  share: number,
): number {
  const left = centreAt(keys, t) - share / 2;
  return Math.min(Math.max(0, left), Math.max(0, 1 - share));
}

export function reelLength(keep: Span[]): number {
  return keep.reduce((sum, [a, b]) => sum + (b - a), 0);
}

/** A video time on the reel's clock, or null when it falls in a cut (words.on_reel). */
export function onReel(t: number, start: number, keep: Span[]): number | null {
  const rel = t - start;
  let out = 0;
  for (const [a, b] of keep) {
    if (rel < a) return a - rel <= 0.2 ? out : null;
    if (rel <= b) return out + rel - a;
    out += b - a;
  }
  return null;
}

/** A time on the reel's clock back on the video's (for scrubbing). */
export function toSource(reelT: number, start: number, keep: Span[]): number {
  let left = Math.max(0, reelT);
  for (const [a, b] of keep) {
    if (left <= b - a) return start + a + left;
    left -= b - a;
  }
  return start + (keep.length ? keep[keep.length - 1][1] : 0);
}

/** Where playback goes from `t`: on, or past a cut to the next kept stretch, or null once it is over. */
export function nextPlayable(
  t: number,
  start: number,
  keep: Span[],
): number | null {
  const rel = t - start;
  for (const [a, b] of keep) {
    if (rel < a - 0.02) return start + a;
    if (rel < b) return t;
  }
  return null;
}

export function upper(text: string, language: string): string {
  const dotted =
    language === "tr" || language === "az"
      ? text.replace(/i/g, "İ").replace(/ı/g, "I")
      : text;
  return dotted.toUpperCase();
}

/** The words in the groups shown at once (ass.groups). */
export function groups(words: Word[], style: ReelStyle): Word[][] {
  const [mostWords, mostChars] = GROUP[style];
  const out: Word[][] = [];
  let current: Word[] = [];
  for (const word of words) {
    if (current.length) {
      const chars = [...current, word]
        .map((w) => w[2])
        .join("")
        .trim().length;
      const last = current[current.length - 1];
      if (
        current.length >= mostWords ||
        chars > mostChars ||
        word[0] - last[1] >= GROUP_GAP ||
        ENDS.test(last[2].trim())
      ) {
        out.push(current);
        current = [];
      }
    }
    current.push(word);
  }
  if (current.length) out.push(current);
  return out;
}

export interface CaptionNow {
  words: string[];
  active: number;
}

/** The group on screen at `t` and the word lit in it, or null between groups. */
export function captionAt(
  runs: Word[][],
  t: number,
  end: number,
): CaptionNow | null {
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    const next = runs[i + 1];
    let until = Math.min(end, run[run.length - 1][1] + HOLD);
    if (next) until = Math.min(until, next[0][0]);
    if (t < run[0][0]) return null;
    if (t < until) {
      let active = 0;
      for (let j = 1; j < run.length; j++) if (t >= run[j][0]) active = j;
      return { words: run.map((w) => w[2].trim()), active };
    }
  }
  return null;
}

/** The translated line on screen at `reelT`. */
export function phraseAt(phrases: Phrase[], reelT: number): string | null {
  return phrases.find((p) => reelT >= p.start && reelT < p.end)?.text ?? null;
}

/** Whole seconds as m:ss. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
