// A reel cover's arithmetic (components/reels/reel-cover.tsx): the hook's lit word, where the frame sits so the
// face shows, which side the words go on, and ink that reads on a colour. Pure — see __tests__/cover.test.ts.

export interface HookPart {
  text: string;
  lit: boolean;
}

/** The hook in parts, the words in *stars* lit ("The stretch I *stopped* teaching"). */
export function hookParts(title: string): HookPart[] {
  const parts: HookPart[] = [];
  const found = /\*([^*]+)\*/g;
  let at = 0;
  for (let m = found.exec(title); m; m = found.exec(title)) {
    if (m.index > at)
      parts.push({ text: title.slice(at, m.index), lit: false });
    parts.push({ text: m[1], lit: true });
    at = m.index + m[0].length;
  }
  if (at < title.length) parts.push({ text: title.slice(at), lit: false });
  return parts.map((p) => ({ ...p, text: p.text.replace(/\*/g, "") }));
}

/** The hook as plain words, its stars dropped. */
export function plainHook(title: string): string {
  return title.replace(/\*/g, "").replace(/\s+/g, " ").trim();
}

const clamp = (n: number) => Math.min(1, Math.max(0, n));

/** `object-position` for a frame of width/height `aspect` cropped by `object-fit: cover` into a box of
 *  width/height `box`, so the face ([x, y, w, h] as shares of the frame) sits as near its middle as the
 *  frame allows. */
export function focus(
  aspect: number | null,
  box: number,
  face: number[] | null,
): string {
  if (!aspect || !face || face.length < 4) return "50% 50%";
  const cx = face[0] + face[2] / 2;
  const cy = face[1] + face[3] / 2;
  if (aspect > box) {
    // shown at the box's height: the frame overflows sideways
    const p = (cx * aspect - box / 2) / (aspect - box);
    return `${+(clamp(p) * 100).toFixed(2)}% 50%`;
  }
  if (aspect < box) {
    const tall = box / aspect;
    const p = (cy * tall - 0.5) / (tall - 1);
    return `50% ${+(clamp(p) * 100).toFixed(2)}%`;
  }
  return "50% 50%";
}

/** Whether the words go at the top of a full-bleed cover: where the face isn't. */
export function wordsOnTop(face: number[] | null): boolean {
  if (!face || face.length < 4) return false;
  return face[1] + face[3] / 2 > 0.5;
}

/** Near-black or white, whichever reads on `hex`. */
export function inkOn(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.36 ? "#111111" : "#ffffff";
}

/** A hook's size factor: a long one steps down so it stays inside its block. */
export function hookScale(title: string): number {
  const n = plainHook(title).length;
  return n > 56 ? 0.72 : n > 40 ? 0.84 : n > 26 ? 0.94 : 1;
}
