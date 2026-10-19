import { formatDay, spanText, type Window } from "@/lib/access/ways";
import type { AccessInfo } from "@/types/billing";

/** A stored instant as "19 Jul 2027", on the viewer's own calendar. */
function localDay(iso: string): string {
  const d = new Date(iso);
  return formatDay(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`);
}

/** What a one-off purchase gives: "Lifetime access", "1 year of access", "Access until 31 Dec 2026". */
export function purchaseTerms(w: Window | null | undefined): string {
  const opens = w?.opens_on
    ? `Opens ${formatDay(w.opens_on)} · `
    : w?.opens_after_days !== undefined
      ? `Opens ${spanText(w.opens_after_days)} after purchase · `
      : "";
  // The close counts from the purchase, so with an opening it is a point, not a length.
  const lasts =
    w?.closes_after_days !== undefined
      ? opens
        ? `Access until ${spanText(w.closes_after_days)} after purchase`
        : `${spanText(w.closes_after_days)} of access`
      : w?.closes_on
        ? `Access until ${formatDay(w.closes_on)}`
        : "Lifetime access";
  return opens + lasts;
}

/** When a membership includes it, and for how long. */
export function planTerms(w: Window | null | undefined): string {
  const opens =
    w?.opens_after_days !== undefined
      ? `Opens after ${spanText(w.opens_after_days)} of membership`
      : w?.opens_on
        ? `Opens ${formatDay(w.opens_on)}`
        : "Included right away";
  const opensLater = w?.opens_after_days !== undefined || !!w?.opens_on;
  const closes =
    w?.closes_after_days !== undefined
      ? opensLater
        ? `, until ${spanText(w.closes_after_days)} into membership`
        : `, for ${spanText(w.closes_after_days)}`
      : w?.closes_on
        ? `, until ${formatDay(w.closes_on)}`
        : "";
  return opens + closes;
}

/** What free covers. */
export function freeTerms(w: Window | null | undefined): string {
  if (w?.closes_after_days !== undefined) {
    const until = `until ${spanText(w.closes_after_days)} after joining`;
    if (w.opens_after_days !== undefined)
      return `Free after ${spanText(w.opens_after_days)} of joining, ${until}`;
    if (w.opens_on) return `Free from ${formatDay(w.opens_on)}, ${until}`;
    return `Free for your first ${spanText(w.closes_after_days)}`;
  }
  if (w?.opens_on && w.closes_on)
    return `Free ${formatDay(w.opens_on)} – ${formatDay(w.closes_on)}`;
  if (w?.closes_on) return `Free until ${formatDay(w.closes_on)}`;
  if (w?.opens_on) return `Free from ${formatDay(w.opens_on)}`;
  if (w?.opens_after_days !== undefined)
    return `Free after ${spanText(w.opens_after_days)} of joining`;
  return "Free";
}

/** The viewer's own dates, or "" when there is nothing to say. */
export function stateLine(info: AccessInfo, now = Date.now()): string {
  if (info.has_access)
    return info.access_ends_at
      ? `Your access ends on ${localDay(info.access_ends_at)}`
      : "";
  if (info.opens_at) return `Opens for you on ${localDay(info.opens_at)}`;
  if (info.access_ends_at && Date.parse(info.access_ends_at) < now)
    return `Your access ended on ${localDay(info.access_ends_at)}`;
  return "";
}
