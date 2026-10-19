// Pure navbar presentation rules, split out of public-header.tsx so they
// are unit-testable (the header itself has no component-test harness).
import type { NavbarLogoSize } from "@/types/tenant";

const SIZE_CLASS: Record<NavbarLogoSize, string> = {
  sm: "h-6",
  md: "h-8",
  lg: "h-10",
  xl: "h-12",
};

/** Navbar logo height class. The pill capsule is only 56px tall, so xl
 * renders as lg there. Unknown/missing sizes render as md (today's 32px). */
export function logoSizeClass(
  size: NavbarLogoSize | undefined,
  layout: string,
): string {
  const effective: NavbarLogoSize = size && size in SIZE_CLASS ? size : "md";
  if (layout === "pill" && effective === "xl") return SIZE_CLASS.lg;
  return SIZE_CLASS[effective];
}

/** Brand-name text shows when there is no logo image, or when the coach
 * explicitly re-enabled it — saved studio logos already contain the
 * wordmark, so rendering the name next to them duplicated it. */
export function showBrandName(
  config: {
    logo_url?: string | null;
    navbar_config?: { show_brand_name?: boolean };
  } | null,
): boolean {
  if (!config?.logo_url) return true;
  return config.navbar_config?.show_brand_name === true;
}

/** Which public pages have something behind them (GET /api/v1/site/menu/). */
export interface SiteMenu {
  courses: boolean;
  events: boolean;
}

/** The coach's own nav links, minus any that would land on an empty page:
 * "/plans" when the tenant sells no subscription plans, Courses with no
 * published course, Events and Calendar with no upcoming class. Without
 * ``menu`` (its fetch failed) those links stay. */
export function visibleNavLinks<T extends { href: string }>(
  links: T[],
  plansEnabled: boolean,
  menu?: SiteMenu,
): T[] {
  const empty = new Set<string>(plansEnabled ? [] : ["/plans"]);
  if (menu && !menu.courses) empty.add("/courses");
  if (menu && !menu.events)
    ["/events", "/calendar"].forEach((h) => empty.add(h));
  return links.filter((l) => !empty.has(l.href));
}

const HEADER_HIDDEN = new Set(["/faq"]);
const SIGNED_IN_HEADER_HIDDEN = new Set(["/about", "/faq"]);

/** Top-bar links: drops empty pages via visibleNavLinks, drops /faq
 * (already on Home/Pricing and in the footer; /about too once signed in),
 * and collapses /calendar when /events is already present (both pages
 * cross-link and the footer keeps both). */
export function headerNavLinks<T extends { href: string }>(
  links: T[],
  plansEnabled: boolean,
  menu?: SiteMenu,
  signedIn = false,
  keepPicked = false,
): T[] {
  const visible = visibleNavLinks(links, plansEnabled, menu);
  if (keepPicked) return visible;
  const hasEvents = visible.some((l) => l.href === "/events");
  const hidden = signedIn ? SIGNED_IN_HEADER_HIDDEN : HEADER_HIDDEN;
  return visible.filter(
    (l) => !hidden.has(l.href) && !(hasEvents && l.href === "/calendar"),
  );
}

/** The Subscribe/Plans button is for students of a tenant that has plans;
 * staff are not buying their own subscriptions. */
export function showSubscribeButton(
  plansEnabled: boolean,
  role: string | undefined,
): boolean {
  return plansEnabled && role !== "owner" && role !== "coach";
}
