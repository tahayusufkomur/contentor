// Locale resolution for the tenant-facing portal. English is the only locale;
// a stale `user-locale` cookie (e.g. "tr") falls back to it.

export const locales = ["en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export function isValidLocale(
  value: string | undefined | null,
): value is Locale {
  return value === "en";
}

export function resolveLocale(cookieLocale: string | undefined | null): Locale {
  return isValidLocale(cookieLocale) ? cookieLocale : defaultLocale;
}
