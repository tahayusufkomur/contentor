import { DEFAULT_LOCALE, LOCALES } from "@shared/i18n/locales";

// Outside the [locale] segment: the English-only superadmin panel and the API.
const UNLOCALIZED = ["/admin", "/api"];

/** `/admin` matches `/admin`, `/admin/x`, `/admin?a`, but not `/administrators`. */
const startsWithSegment = (path: string, segment: string) =>
  path.startsWith(segment) && /^$|^[/?#]/.test(path.slice(segment.length));

/** The language a path is prefixed with, if any (`/tr/pricing` → `tr`). */
function prefixOf(path: string): string | undefined {
  return LOCALES.find((l) => startsWithSegment(path, `/${l}`));
}

/** The address of a page in a language: English has none, the rest a prefix. */
export function localizedHref(href: string, locale: string): string {
  if (locale === DEFAULT_LOCALE) return href;
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  if (UNLOCALIZED.some((p) => startsWithSegment(href, p))) return href;
  if (prefixOf(href)) return href;
  // "/" and "/#team" become "/tr" and "/tr#team", not "/tr/" and "/tr/#team".
  const rest =
    href.startsWith("/?") || href.startsWith("/#") ? href.slice(1) : href;
  return `/${locale}${rest === "/" ? "" : rest}`;
}

/** A pathname without its language prefix (`/tr/pricing` → `/pricing`). */
export function stripLocale(pathname: string): string {
  const l = prefixOf(pathname);
  return l ? pathname.slice(l.length + 1) || "/" : pathname;
}
