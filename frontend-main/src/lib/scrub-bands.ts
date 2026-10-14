export interface Band {
  /** Scroll progress (0–1) where the caption starts to appear. */
  from: number;
  /** Scroll progress where it has fully gone. */
  to: number;
}

/** Opacity of a caption at progress `p`: ramps in over `fade` after `from`,
 * holds at 1, ramps out over `fade` before `to`. A band that starts at 0 is
 * already visible at rest; one that ends at 1 stays to the end. */
export function bandOpacity(p: number, band: Band, fade = 0.08): number {
  const { from, to } = band;
  if (p < from || p > to) return 0;
  const rampIn = from <= 0 ? 1 : Math.min(1, (p - from) / fade);
  const rampOut = to >= 1 ? 1 : Math.min(1, (to - p) / fade);
  return Math.max(0, Math.min(rampIn, rampOut));
}

/** Playhead for progress `p`, snapped to the frame grid so repeated seeks to
 * the same frame are no-ops. Progress is clamped: framer-motion can report a
 * hair outside 0–1 at the track edges. */
export function scrubTime(p: number, durationS: number, fps = 30): number {
  const clamped = Math.min(1, Math.max(0, p));
  return Math.round(clamped * durationS * fps) / fps;
}
