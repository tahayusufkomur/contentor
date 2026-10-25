// The video studio's edits, as the server keeps them (backend/apps/reels/views.py _apply_edits): the patch
// that undoes a change, a change shown before the server answers, stretches cut out and put back, the clip's
// pieces and gaps on the video's clock, and trims snapping to words. Pure — see __tests__/studio.test.ts.
// Times are the video's seconds.
import { onReel, type Span } from "@/lib/reels/timeline";
import type { ReelDetail, ReelEdits, ReelPatch, Word } from "@/types/reels";

/** One reel in the studio, `/admin/video-studio/<id>`: the admin's navigation shrinks to icons there. */
export const isVideoStudio = (pathname: string): boolean =>
  /^\/admin\/video-studio\/[^/]+\/?$/.test(pathname);

const PAD = 0.15; // what a cut leaves of the silence around it (backend/apps/reels/words.py PAD)

type Top = "title" | "caption" | "start" | "end" | "style" | "layout";
const TOP: Top[] = ["title", "caption", "start", "end", "style", "layout"];

function picked<T extends object>(from: T, keys: string[]): Partial<T> {
  return Object.fromEntries(
    keys.map((k) => [k, from[k as keyof T]]),
  ) as Partial<T>;
}

/** The patch that puts back what `patch` changes. */
export function inverse(reel: ReelDetail, patch: ReelPatch): ReelPatch {
  const out: ReelPatch = {};
  for (const key of TOP)
    if (key in patch) Object.assign(out, { [key]: reel[key] });
  if (patch.options)
    out.options = picked(reel.options, Object.keys(patch.options));
  if (patch.cover) {
    const { design, frame, label } = reel.cover;
    out.cover = picked({ design, frame, label }, Object.keys(patch.cover));
  }
  if (patch.edits)
    out.edits = Object.fromEntries(
      Object.keys(patch.edits).map((k) => [
        k,
        reel.edits[k as keyof ReelEdits] ?? null,
      ]),
    );
  if (patch.cutaways)
    out.cutaways = reel.cutaways.map(({ at, photo }) => ({ at, photo }));
  return out;
}

/** The reel with `patch` in it at once, until the server answers with what it draws from it (the clip's
 *  cuts, its crop): what is retyped shows, a photo moves, the cover's frame changes. */
export function merged(reel: ReelDetail, patch: ReelPatch): ReelDetail {
  const next: ReelDetail = { ...reel };
  for (const key of TOP)
    if (patch[key] !== undefined) Object.assign(next, { [key]: patch[key] });
  if (next.start !== reel.start || next.end !== reel.end) {
    // the kept pieces follow a trim: cut at the new ends, the first and last reaching out to them
    const kept = (reel.keep as Span[]).map(([x, y]) => [
      reel.start + x,
      reel.start + y,
    ]);
    if (kept.length) {
      if (next.start < reel.start) kept[0][0] = next.start;
      if (next.end > reel.end) kept[kept.length - 1][1] = next.end;
    }
    next.keep = kept
      .map(([x, y]) => [
        Math.max(x, next.start) - next.start,
        Math.min(y, next.end) - next.start,
      ])
      .filter(([x, y]) => y - x > 0.05) as [number, number][];
  }
  if (patch.options) next.options = { ...reel.options, ...patch.options };
  if (patch.cover) {
    const frame = patch.cover.frame
      ? reel.frames.find((f) => f.key === patch.cover?.frame)
      : undefined;
    next.cover = {
      ...reel.cover,
      ...patch.cover,
      ...(frame
        ? { photo: frame.url, face: frame.face, aspect: frame.aspect }
        : {}),
    };
  }
  if (patch.edits) {
    const edits: Record<string, unknown> = { ...reel.edits, ...patch.edits };
    for (const [k, v] of Object.entries(edits)) if (v === null) delete edits[k];
    next.edits = edits as ReelEdits;
    const text = patch.edits.text;
    if (text)
      next.words = reel.words.map((w) => {
        const typed = text[String(w[0])];
        return typed
          ? [w[0], w[1], (w[2].match(/^\s*/)?.[0] ?? "") + typed.trim()]
          : w;
      });
  }
  if (patch.cutaways) {
    const keep = reel.keep as Span[];
    next.cutaways = patch.cutaways.flatMap(({ at, photo }) => {
      const was = reel.cutaways.find((c) => c.photo === photo);
      if (!was) return [];
      const start = onReel(at, reel.start, keep) ?? was.start;
      return [{ ...was, at, start, end: start + (was.end - was.start) }];
    });
  }
  return next;
}

/** Stretches cut out with [a, b] added: merged, in order. */
export function addCut(
  cuts: [number, number][],
  a: number,
  b: number,
): [number, number][] {
  const all = [...cuts, [a, b] as [number, number]]
    .map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)] as [number, number])
    .sort((p, q) => p[0] - q[0]);
  const out: [number, number][] = [];
  for (const [x, y] of all) {
    const last = out[out.length - 1];
    if (last && x <= last[1]) last[1] = Math.max(last[1], y);
    else out.push([x, y]);
  }
  return out;
}

/** Stretches cut out with whatever of them lies in [a, b] put back. */
export function restore(
  cuts: [number, number][],
  a: number,
  b: number,
): [number, number][] {
  return cuts.flatMap(([x, y]): [number, number][] =>
    y <= a || x >= b
      ? [[x, y]]
      : [
          ...(x < a ? [[x, a] as [number, number]] : []),
          ...(y > b ? [[b, y] as [number, number]] : []),
        ],
  );
}

export interface Piece {
  a: number;
  b: number;
}

/** The pieces of the clip it keeps (`keep`, from `start`), on the video's clock, split at `splits`. */
export function pieces(start: number, keep: Span[], splits: number[]): Piece[] {
  return keep.flatMap(([x, y]) => {
    const a = start + x;
    const b = start + y;
    const inside = splits
      .filter((s) => s > a + 0.1 && s < b - 0.1)
      .sort((p, q) => p - q);
    const edges = [a, ...inside, b];
    return edges.slice(1).map((e, i) => ({ a: edges[i], b: e }));
  });
}

export interface Gap extends Piece {
  /** Cut out by hand (else a pause the clip skips). */
  manual: boolean;
}

/** What the clip leaves out between `start` and `end`: the pauses it skips and the stretches she cut. */
export function gaps(
  start: number,
  end: number,
  keep: Span[],
  cuts: [number, number][],
): Gap[] {
  const kept = keep.map(([x, y]) => [start + x, start + y]);
  const edges = [start, ...kept.flat(), end];
  const out: Gap[] = [];
  for (let i = 0; i < edges.length; i += 2) {
    const a = edges[i];
    const b = edges[i + 1];
    if (b - a < 0.05) continue;
    out.push({ a, b, manual: cuts.some(([x, y]) => x < b && y > a) });
  }
  return out;
}

/** The stretch to cut out for words `first`..`last` (indexes into `words`): them and the silence around,
 *  but for a breath on each side. */
export function wordsCut(words: Word[], first: number, last: number): Piece {
  const prev = words[first - 1];
  const next = words[last + 1];
  const a = prev ? Math.min(words[first][0], prev[1] + PAD) : words[first][0];
  const b = next ? Math.max(words[last][1], next[0] - PAD) : words[last][1];
  return { a: +a.toFixed(3), b: +b.toFixed(3) };
}

/** `t` moved onto the nearest word's start (for a clip's start) or end (its end), if one is within `slack`. */
export function snap(
  t: number,
  words: Word[],
  slack: number,
  edge: "start" | "end",
): number {
  let best = t;
  let gap = slack;
  for (const w of words) {
    const at = edge === "start" ? w[0] - 0.1 : w[1] + 0.25;
    if (Math.abs(at - t) < gap) {
      gap = Math.abs(at - t);
      best = at;
    }
  }
  return +best.toFixed(2);
}

/** A playhead's time as m:ss.t */
export function stamp(seconds: number): string {
  const s = Math.max(0, seconds);
  const whole = Math.floor(s);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}.${Math.floor((s - whole) * 10)}`;
}
