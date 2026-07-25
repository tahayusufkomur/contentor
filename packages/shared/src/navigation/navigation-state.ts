// Pure core of the navigation-feedback layer, kept React-free so it's
// unit-testable (repo convention: vitest covers pure logic only).

export type ActiveMatch = (current: string, href: string) => boolean;

/**
 * Exact match, or a nested child on a segment boundary. Root-ish hrefs
 * ("/admin", "/") only ever match exactly, otherwise they'd claim every page
 * beneath them. The trailing-slash check is what keeps "/admin/live" from
 * highlighting when you're on "/admin/live-streams".
 */
export function defaultActiveMatch(current: string, href: string): boolean {
  if (current === href) return true;
  if (href === "/" || href === "/admin") return false;
  return current.startsWith(href + "/");
}

export interface NavPathState {
  pathname: string;
  pendingHref: string | null;
}

/** A pending navigation wins over the committed pathname — this is what makes
 *  the clicked item highlight before the route commits. */
export function isNavItemActive(
  { pathname, pendingHref }: NavPathState,
  href: string,
  match: ActiveMatch = defaultActiveMatch,
): boolean {
  return match(pendingHref ?? pathname, href);
}

export interface ProgressController {
  start(): void;
  finish(): void;
  dispose(): void;
}

/**
 * Delay-then-show state machine for the top progress bar. Navigations that
 * resolve inside `delayMs` never show anything, so cached/instant transitions
 * don't flash a bar.
 */
export function createProgressController({
  delayMs,
  onShow,
  onHide,
}: {
  delayMs: number;
  onShow: () => void;
  onHide: () => void;
}): ProgressController {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let active = false;
  let shown = false;

  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return {
    start() {
      if (active) return;
      active = true;
      timer = setTimeout(() => {
        timer = null;
        shown = true;
        onShow();
      }, delayMs);
    },
    finish() {
      if (!active) return;
      active = false;
      clear();
      if (shown) {
        shown = false;
        onHide();
      }
    },
    dispose() {
      clear();
      active = false;
      shown = false;
    },
  };
}
