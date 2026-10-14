/** Fraction of an article read, from its bounding rect: 0 while its top is
 * below `offset` (the sticky header's height), 1 once its bottom has reached
 * the bottom of the viewport, linear between. An article shorter than the
 * viewport has no travel: it is 0, then 1 as soon as it is under the header. */
export function readingProgress(
  top: number,
  height: number,
  viewportHeight: number,
  offset = 0,
): number {
  if (!Number.isFinite(top) || !Number.isFinite(height) || height <= 0) return 0;
  const travel = height - (viewportHeight - offset);
  if (travel <= 0) return top <= offset ? 1 : 0;
  return Math.min(1, Math.max(0, (offset - top) / travel));
}
