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

/** The bar leads to its destination, so it steps aside on that page and on the
 * pages under it ("/courses" and "/courses/yoga-basics"). */
export function onDestination(
  pathname: string | null,
  href: string | undefined,
): boolean {
  if (!pathname || !href) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
