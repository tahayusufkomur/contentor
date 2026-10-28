// The header button's label, split out of public-header.tsx so it is
// unit-testable (the header itself has no component-test harness).
import type { useTranslations } from "next-intl";
import { visibleNavLinks, type SiteMenu } from "@/lib/navbar";

type Cta = { text: string; href: string };
type CtaT = ReturnType<typeof useTranslations<"site">>;

/** What the legacy default "Get Started" says once it knows where it leads
 *  (a `site.headerCta.*` key). */
const HEADER_CTA_BY_HREF: Record<string, string> = {
  "/courses": "headerCta.startCourse",
  "/events": "headerCta.bookSession",
  "/calendar": "headerCta.bookSession",
  "/plans": "headerCta.join",
  "/contact": "headerCta.getInTouch",
};

/** Only the untouched legacy default is relabelled; a button she wrote or
 * renamed keeps her words. */
export function headerCtaLabel(cta: Cta, t: CtaT): string {
  const key = HEADER_CTA_BY_HREF[cta.href];
  return cta.text === "Get Started" && key
    ? t(key as "headerCta.join")
    : cta.text;
}

/** The button the header and the phone's sticky bar show: hers, labelled for
 * its offer. When nothing is behind its destination (no published course, no
 * upcoming class, no plan) it leads to Contact instead of vanishing or
 * pointing at an empty page. Null when she turned the button off. */
export function resolveHeaderCta(
  cta: Cta | null | undefined,
  plansEnabled: boolean,
  t: CtaT,
  menu?: SiteMenu,
): Cta | null {
  if (!cta) return null;
  if (visibleNavLinks([cta], plansEnabled, menu).length === 0)
    return { text: t("headerCta.getInTouch"), href: "/contact" };
  return { text: headerCtaLabel(cta, t), href: cta.href };
}
