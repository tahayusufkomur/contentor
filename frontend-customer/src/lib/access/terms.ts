import type { useTranslations } from "next-intl";
import { formatDay, spanParts, type Window } from "@/lib/access/ways";
import type { AccessInfo } from "@/types/billing";

/** The root `site` translator: these sentences live under `site.access.*`. */
export type TermsT = ReturnType<typeof useTranslations<"site">>;

const SPAN_KEY = {
  year: "access.spanYear",
  month: "access.spanMonth",
  week: "access.spanWeek",
  day: "access.spanDay",
} as const;

/** Days in the largest exact unit, in the reader's language ("3 months"). */
function span(t: TermsT, days: number): string {
  const { unit, count } = spanParts(days);
  return t(SPAN_KEY[unit], { count });
}

/** A stored instant as "19 Jul 2027", on the viewer's own calendar. */
function localDay(iso: string, locale: string): string {
  const d = new Date(iso);
  return formatDay(
    `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`,
    locale,
  );
}

/**
 * What a one-off purchase gives: "Lifetime access", "1 year of access",
 * "Access until 31 Dec 2026". An opening and the access are two facts, each a
 * whole phrase, so they are listed with " · ".
 */
export function purchaseTerms(
  w: Window | null | undefined,
  locale: string,
  t: TermsT,
): string {
  const opens = w?.opens_on
    ? t("access.opensOn", { date: formatDay(w.opens_on, locale) })
    : w?.opens_after_days !== undefined
      ? t("access.opensAfterPurchase", { span: span(t, w.opens_after_days) })
      : "";
  // The close counts from the purchase, so with an opening it is a point, not a length.
  const lasts =
    w?.closes_after_days !== undefined
      ? opens
        ? t("access.accessUntilAfterPurchase", {
            span: span(t, w.closes_after_days),
          })
        : t("access.accessLength", { span: span(t, w.closes_after_days) })
      : w?.closes_on
        ? t("access.accessUntil", { date: formatDay(w.closes_on, locale) })
        : t("access.lifetime");
  return opens ? `${opens} · ${lasts}` : lasts;
}

/** When a membership includes it, and for how long: one sentence per case. */
export function planTerms(
  w: Window | null | undefined,
  locale: string,
  t: TermsT,
): string {
  const day = (iso: string) => formatDay(iso, locale);
  const closesAfter =
    w?.closes_after_days !== undefined ? span(t, w.closes_after_days) : null;
  const closesOn = w?.closes_on ? day(w.closes_on) : null;
  if (w?.opens_after_days !== undefined) {
    const opens = span(t, w.opens_after_days);
    if (closesAfter)
      return t("access.planOpensAfterUntilInto", {
        opens,
        closes: closesAfter,
      });
    if (closesOn)
      return t("access.planOpensAfterUntilDate", { opens, closes: closesOn });
    return t("access.planOpensAfter", { opens });
  }
  if (w?.opens_on) {
    const opens = day(w.opens_on);
    if (closesAfter)
      return t("access.planOpensOnUntilInto", { opens, closes: closesAfter });
    if (closesOn)
      return t("access.planOpensOnUntilDate", { opens, closes: closesOn });
    return t("access.planOpensOn", { opens });
  }
  if (closesAfter) return t("access.planNowFor", { closes: closesAfter });
  if (closesOn) return t("access.planNowUntilDate", { closes: closesOn });
  return t("access.includedNow");
}

/** What free covers. */
export function freeTerms(
  w: Window | null | undefined,
  locale: string,
  t: TermsT,
): string {
  const day = (iso: string) => formatDay(iso, locale);
  if (w?.closes_after_days !== undefined) {
    const closes = span(t, w.closes_after_days);
    if (w.opens_after_days !== undefined)
      return t("access.freeAfterThenUntil", {
        opens: span(t, w.opens_after_days),
        closes,
      });
    if (w.opens_on)
      return t("access.freeFromThenUntil", { opens: day(w.opens_on), closes });
    return t("access.freeFirst", { closes });
  }
  if (w?.opens_on && w.closes_on)
    return t("access.freeBetween", {
      opens: day(w.opens_on),
      closes: day(w.closes_on),
    });
  if (w?.closes_on) return t("access.freeUntil", { closes: day(w.closes_on) });
  if (w?.opens_on) return t("access.freeFrom", { opens: day(w.opens_on) });
  if (w?.opens_after_days !== undefined)
    return t("access.freeAfter", { opens: span(t, w.opens_after_days) });
  return t("price.free");
}

/** The viewer's own dates, or "" when there is nothing to say. */
export function stateLine(
  info: AccessInfo,
  locale: string,
  t: TermsT,
  now = Date.now(),
): string {
  if (info.has_access)
    return info.access_ends_at
      ? t("access.accessEnds", { date: localDay(info.access_ends_at, locale) })
      : "";
  if (info.opens_at)
    return t("access.opensForYou", { date: localDay(info.opens_at, locale) });
  if (info.access_ends_at && Date.parse(info.access_ends_at) < now)
    return t("access.accessEnded", {
      date: localDay(info.access_ends_at, locale),
    });
  return "";
}
