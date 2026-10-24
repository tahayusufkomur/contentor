// The header button's label, split out of public-header.tsx so it is
// unit-testable (the header itself has no component-test harness).
import { visibleNavLinks, type SiteMenu } from "@/lib/navbar";

type Cta = { text: string; href: string };

/** What the legacy default "Get Started" says once it knows where it leads. */
export const HEADER_CTA_BY_HREF: Record<string, string> = {
  "/courses": "Start a course",
  "/events": "Book a class",
  "/calendar": "Book a class",
  "/plans": "Join",
  "/contact": "Get in touch",
};

const CONTACT: Cta = { text: "Get in touch", href: "/contact" };

/** Only the untouched legacy default is relabelled; a button she wrote or
 * renamed keeps her words. */
export function headerCtaLabel(cta: Cta): string {
  return cta.text === "Get Started"
    ? (HEADER_CTA_BY_HREF[cta.href] ?? cta.text)
    : cta.text;
}

/** The button the header and the phone's sticky bar show: hers, labelled for
 * its offer. When nothing is behind its destination (no published course, no
 * upcoming class, no plan) it leads to Contact instead of vanishing or
 * pointing at an empty page. Null when she turned the button off. */
export function resolveHeaderCta(
  cta: Cta | null | undefined,
  plansEnabled: boolean,
  menu?: SiteMenu,
): Cta | null {
  if (!cta) return null;
  if (visibleNavLinks([cta], plansEnabled, menu).length === 0) return CONTACT;
  return { text: headerCtaLabel(cta), href: cta.href };
}
