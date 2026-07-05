// Locale resolution for the tenant-facing portal.
// Order: user-locale cookie → tenant default → region default (en/tr) → en.
// Region is derived from host (<slug>.tr.contentor.app => tr).
// TR: needs native review for all translated strings.

export const locales = ["en", "tr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export type Region = "global" | "tr";

// Matches both the apex (`tr.contentor.app`, `tr.localhost`) and any
// tenant subdomain under it (`<slug>.tr.contentor.app`, `<slug>.tr.localhost`).
const TR_HOST_REGEX = /(^|\.)tr\.(contentor\.app|localhost)$/i;

export function regionFromHost(host: string): Region {
  const h = (host || "").split(":")[0].toLowerCase();
  return TR_HOST_REGEX.test(h) ? "tr" : "global";
}

export function regionDefaultLocale(region: Region): Locale {
  return region === "tr" ? "tr" : "en";
}

export function isValidLocale(
  value: string | undefined | null,
): value is Locale {
  return value === "en" || value === "tr";
}
