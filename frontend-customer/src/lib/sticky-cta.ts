/** The phone's sticky call to action shows once the first screen is behind
 * the visitor, and steps aside when the footer is on screen. */
export function stickyCtaVisible({
  scrollY,
  viewportHeight,
  footerInView,
}: {
  scrollY: number;
  viewportHeight: number;
  footerInView: boolean;
}): boolean {
  return scrollY > viewportHeight * 0.9 && !footerInView;
}
